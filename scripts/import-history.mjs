// 历史数据导入：读取每日抓取的 pricewatch.json 副本（文件名含 time=YYYYMMDD-HHMM，HKT），
// 按日期升序写入对应快照日。可重复运行（每日覆盖幂等）。
// 用法: node scripts/import-history.mjs [目录]  （默认 /home/user00/pricewatch_data）
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { ingest } from '../server/collect.js';

const dir = process.argv[2] ?? '/home/user00/pricewatch_data';

/** 从文件名解析快照日期（YYYY-MM-DD）与抓取时刻（ISO，按 HKT 换算 UTC）。 */
function parseName(name) {
  const m = name.match(/time=(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const fetchedAt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+08:00`).toISOString();
  return { snapshotDate: `${y}-${mo}-${d}`, fetchedAt };
}

const entries = [];
for (const name of fs.readdirSync(dir)) {
  const parsed = parseName(name);
  if (parsed) entries.push({ file: path.join(dir, name), ...parsed });
}
if (entries.length === 0) {
  console.error(`no pricewatch files (time=YYYYMMDD-HHMM) found under ${dir}`);
  process.exit(1);
}
entries.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));

const db = openDb();
const existing = new Set(db.prepare('SELECT snapshot_date FROM snapshots').all().map((r) => r.snapshot_date));
console.log(`importing ${entries.length} files (${entries[0].snapshotDate} … ${entries.at(-1).snapshotDate})`);

let totalPrices = 0;
const table = [];
for (const { file, snapshotDate, fetchedAt } of entries) {
  let items;
  try {
    items = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`SKIP ${snapshotDate}: bad JSON (${err.message})`);
    continue;
  }
  if (!Array.isArray(items)) { console.error(`SKIP ${snapshotDate}: not an array`); continue; }
  const { productCount, priceCount } = ingest(db, items, snapshotDate, fetchedAt);
  if (priceCount === 0) console.error(`WARN ${snapshotDate}: 0 prices stored`);
  totalPrices += priceCount;
  table.push({ snapshotDate, productCount, priceCount, action: existing.has(snapshotDate) ? 'overwrite' : 'insert' });
  console.log(`${snapshotDate}  products=${productCount}  prices=${priceCount}  ${existing.has(snapshotDate) ? '(overwrote existing)' : ''}`);
}

console.log('---');
console.log(`done: ${table.length} days, ${totalPrices} price rows`);
console.log(db.prepare('SELECT COUNT(DISTINCT snapshot_date) days, COUNT(*) prices FROM prices').get());
