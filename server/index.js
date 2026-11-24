// HTTP 服务：REST API + 前端静态文件 + 每日 03:00 (HKT) 定时收集。
import express from 'express';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, dateHKT, subDays, TZ, RETENTION_DAYS } from './db.js';
import { collect } from './collect.js';
import { effectiveUnitPrice } from './offer-price.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'client', 'dist');
const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '0.0.0.0'; // 默认允许远端访问

const db = openDb();
const app = express();
app.use(express.json());

const latestDate = () => db.prepare('SELECT MAX(snapshot_date) d FROM snapshots').get().d;

async function runCollect(label) {
  try {
    const r = await collect(db);
    console.log(`[collect:${label}]`, JSON.stringify(r));
    return r;
  } catch (err) {
    console.error(`[collect:${label}] failed:`, err);
    return null;
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, latestDate: latestDate() }));

app.post('/api/admin/collect', async (_req, res) => {
  runCollect('manual');
  res.json({ started: true });
});

app.get('/api/meta', (_req, res) => {
  const d = latestDate();
  const snap = d ? db.prepare('SELECT * FROM snapshots WHERE snapshot_date = ?').get(d) : null;
  const supermarkets = db.prepare('SELECT * FROM supermarkets ORDER BY code').all();
  const dates = db.prepare('SELECT snapshot_date FROM snapshots ORDER BY snapshot_date DESC LIMIT ?')
    .all(RETENTION_DAYS).map((r) => r.snapshot_date);
  const categories = d
    ? db.prepare(`
        SELECT p.cat1_en, p.cat1_zh_hant, p.cat1_zh_hans,
               p.cat2_en, p.cat2_zh_hant, p.cat2_zh_hans,
               p.cat3_en, p.cat3_zh_hant, p.cat3_zh_hans,
               COUNT(DISTINCT p.code) AS cnt
        FROM products p
        JOIN prices pr ON pr.product_code = p.code AND pr.snapshot_date = ?
        GROUP BY p.cat1_zh_hant, p.cat2_zh_hant, p.cat3_zh_hant
        ORDER BY 1, 4, 7`).all(d)
    : [];
  res.json({ latestDate: d, fetchedAt: snap?.fetched_at ?? null, supermarkets, dates, categories });
});

const LANG_COL = { en: 'en', 'zh-Hant': 'zh_hant', 'zh-Hans': 'zh_hans' };

app.get('/api/search', (req, res) => {
  const d = latestDate();
  if (!d) return res.json({ date: null, total: 0, items: [] });
  const q = (req.query.q ?? '').toString().trim();
  const cat = ['cat1', 'cat2', 'cat3'].map((k) => (req.query[k] ?? '').toString().trim() || null);
  const stores = (req.query.stores ?? '').toString().split(',').map((s) => s.trim()).filter(Boolean);
  const sort = ['price_asc', 'price_desc', 'name_asc'].includes(req.query.sort) ? req.query.sort : 'price_asc';
  const nameCol = `p.name_${LANG_COL[req.query.lang] ?? 'zh_hant'}`;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const per = Math.min(100, Math.max(10, Number.parseInt(req.query.per, 10) || 60));

  // 参数顺序必须跟随 SQL 文本顺序：ftsJoin 在 WHERE 之前，故 ftsParam 排在最前。
  const where = ['pr.snapshot_date = ?'];
  const whereParams = [d];
  for (let i = 0; i < 3; i += 1) {
    if (cat[i]) { where.push(`p.cat${i + 1}_zh_hant = ?`); whereParams.push(cat[i]); }
  }
  if (stores.length > 0) {
    where.push(`EXISTS (SELECT 1 FROM prices x WHERE x.product_code = p.code
      AND x.snapshot_date = pr.snapshot_date AND x.supermarket_code IN (${stores.map(() => '?').join(',')}))`);
    whereParams.push(...stores);
  }
  let ftsJoin = '';
  const ftsParams = [];
  // 空格（含全角）分词：每词独立匹配品牌或商品名，词间 AND。
  // 全部词 >=3 字符走 FTS5 trigram（各词分别子串匹配）；任一词过短则整条回退 LIKE。
  const tokens = q.split(/[\s\u3000]+/).filter(Boolean);
  if (tokens.length > 0 && tokens.every((t) => t.length >= 3)) {
    ftsJoin = 'JOIN products_fts f ON f.code = p.code AND f.search_text MATCH ?';
    ftsParams.push(tokens.map((t) => `"${t.replaceAll('"', '""')}"`).join(' AND '));
  } else if (tokens.length > 0) {
    const cols = ['p.name_en', 'p.name_zh_hant', 'p.name_zh_hans',
                  'p.brand_en', 'p.brand_zh_hant', 'p.brand_zh_hans'];
    for (const t of tokens) {
      const like = `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(`(${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      whereParams.push(...cols.map(() => like));
    }
  }
  const whereSql = where.join(' AND ');
  const bind = [...ftsParams, ...whereParams];

  const total = db.prepare(
    `SELECT COUNT(DISTINCT p.code) n FROM products p JOIN prices pr ON pr.product_code = p.code ${ftsJoin} WHERE ${whereSql}`,
  ).get(...bind).n;

  const orderBy = sort === 'price_desc' ? 'min_price DESC'
    : sort === 'name_asc' ? `${nameCol} COLLATE NOCASE ASC` : 'min_price ASC';
  const items = db.prepare(`
    SELECT p.code,
           p.name_en, p.name_zh_hant, p.name_zh_hans,
           p.brand_en, p.brand_zh_hant, p.brand_zh_hans,
           p.cat3_en, p.cat3_zh_hant, p.cat3_zh_hans,
           MIN(pr.price) AS min_price,
           COUNT(DISTINCT pr.supermarket_code) AS store_count
    FROM products p
    JOIN prices pr ON pr.product_code = p.code
    ${ftsJoin}
    WHERE ${whereSql}
    GROUP BY p.code
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`).all(...bind, per, (page - 1) * per);

  res.json({ date: d, total, page, per, items });
});

app.get('/api/products/batch', (req, res) => {
  const codes = (req.query.codes ?? '').toString().split(',').map((c) => c.trim()).filter(Boolean).slice(0, 200);
  if (codes.length === 0) return res.json({ items: [] });
  const ph = codes.map(() => '?').join(',');
  const rows = db.prepare(`
    WITH mx AS (
      SELECT product_code, MAX(snapshot_date) d FROM prices
      WHERE product_code IN (${ph}) GROUP BY product_code)
    SELECT p.code,
           p.name_en, p.name_zh_hant, p.name_zh_hans,
           p.brand_en, p.brand_zh_hant, p.brand_zh_hans,
           p.cat3_en, p.cat3_zh_hant, p.cat3_zh_hans,
           mx.d AS date,
           (SELECT COUNT(DISTINCT pr.supermarket_code) FROM prices pr
             WHERE pr.product_code = p.code AND pr.snapshot_date = mx.d) AS store_count,
           (SELECT MIN(pr.price) FROM prices pr
             WHERE pr.product_code = p.code AND pr.snapshot_date = mx.d) AS min_price
    FROM products p JOIN mx ON mx.product_code = p.code
    ORDER BY min_price IS NULL, min_price ASC`).all(...codes);
  res.json({ items: rows });
});

app.get('/api/products/:code', (req, res) => {
  const meta = db.prepare('SELECT * FROM products WHERE code = ?').get(req.params.code);
  if (!meta) return res.status(404).json({ error: 'not found' });
  const d = db.prepare('SELECT MAX(snapshot_date) d FROM prices WHERE product_code = ?').get(req.params.code).d;
  const prices = d
    ? db.prepare(`
        SELECT pr.supermarket_code, pr.price, pr.offers_en, pr.offers_zh_hant, pr.offers_zh_hans,
               s.name_en, s.name_zh_hant, s.name_zh_hans
        FROM prices pr JOIN supermarkets s ON s.code = pr.supermarket_code
        WHERE pr.product_code = ? AND pr.snapshot_date = ?
        ORDER BY pr.price ASC, s.name_en ASC`)
      .all(req.params.code, d)
      .map((r) => ({
        ...r,
        ep: effectiveUnitPrice(r.price, r.offers_en, r.offers_zh_hant, r.offers_zh_hans),
      }))
    : [];
  const history = db.prepare(`
    SELECT snapshot_date AS d, supermarket_code AS s, price AS p,
           offers_en AS oe, offers_zh_hant AS oz, offers_zh_hans AS oh
    FROM prices WHERE product_code = ? ORDER BY snapshot_date ASC, supermarket_code ASC`)
    .all(req.params.code)
    .map(({ oe, oz, oh, ...r }) => ({ ...r, ep: effectiveUnitPrice(r.p, oe, oz, oh) }));
  res.json({ meta, date: d, prices, history });
});


// 每日 03:00 HKT 定时收集；启动时若当日无快照则立即补抓。
cron.schedule('0 3 * * *', () => { runCollect('cron'); }, { timeZone: TZ });
if (!db.prepare('SELECT 1 x FROM snapshots WHERE snapshot_date = ?').get(dateHKT())) {
  runCollect('boot');
}

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(path.join(DIST, 'index.html'));
    return next();
  });
}

app.listen(PORT, HOST, () =>
  console.log(`hk-supermarket-watch listening on http://localhost:${PORT} (bound to ${HOST}:${PORT})`));
