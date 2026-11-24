// 每日收集器：抓取消委会开放数据 JSON 并写入当日快照；ingest() 可复用于历史文件导入。
import { openDb, dateHKT, subDays, RETENTION_DAYS } from './db.js';

export const SOURCE_URL =
  process.env.PW_SOURCE_URL ??
  'https://online-price-watch.consumer.org.hk/opw/opendata/pricewatch.json';

const tri = (obj, key) => {
  const v = obj?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/** 把货品的三语品牌+名称合并进 FTS 搜索文本。 */
function searchText(item) {
  const parts = [];
  for (const bag of [item.brand, item.name]) {
    for (const k of ['en', 'zh-Hant', 'zh-Hans']) {
      const v = tri(bag, k);
      if (v && !parts.includes(v)) parts.push(v);
    }
  }
  return parts.join(' ');
}

/**
 * 把一份快照 payload 入库（单事务、幂等，重复运行覆盖该日数据）。不执行保留清理。
 * @param {import('node:sqlite').DatabaseSync} db 已打开的数据库
 * @param {Array<object>} items 官方 pricewatch.json 数组
 * @param {string} snapshotDate 'YYYY-MM-DD'
 * @param {string} fetchedAt ISO8601 抓取时间
 * @returns {{productCount:number, priceCount:number}}
 */
export function ingest(db, items, snapshotDate, fetchedAt = new Date().toISOString()) {
  const stmts = {
    upsertSuper: db.prepare(
      'INSERT OR IGNORE INTO supermarkets (code, name_en, name_zh_hant, name_zh_hans) VALUES (?,?,?,?)'),
    upsertProduct: db.prepare(`
      INSERT INTO products (
        code, brand_en, brand_zh_hant, brand_zh_hans,
        name_en, name_zh_hant, name_zh_hans,
        cat1_en, cat1_zh_hant, cat1_zh_hans,
        cat2_en, cat2_zh_hant, cat2_zh_hans,
        cat3_en, cat3_zh_hant, cat3_zh_hans,
        first_seen, last_seen)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(code) DO UPDATE SET
        brand_en=excluded.brand_en, brand_zh_hant=excluded.brand_zh_hant, brand_zh_hans=excluded.brand_zh_hans,
        name_en=excluded.name_en, name_zh_hant=excluded.name_zh_hant, name_zh_hans=excluded.name_zh_hans,
        cat1_en=excluded.cat1_en, cat1_zh_hant=excluded.cat1_zh_hant, cat1_zh_hans=excluded.cat1_zh_hans,
        cat2_en=excluded.cat2_en, cat2_zh_hant=excluded.cat2_zh_hant, cat2_zh_hans=excluded.cat2_zh_hans,
        cat3_en=excluded.cat3_en, cat3_zh_hant=excluded.cat3_zh_hant, cat3_zh_hans=excluded.cat3_zh_hans,
        first_seen=MIN(first_seen, excluded.first_seen),
        last_seen=MAX(last_seen, excluded.last_seen)`),
    ftsDel: db.prepare('DELETE FROM products_fts WHERE code = ?'),
    ftsIns: db.prepare('INSERT INTO products_fts (code, search_text) VALUES (?,?)'),
    insPrice: db.prepare(`
      INSERT INTO prices (snapshot_date, product_code, supermarket_code, price,
                          offers_en, offers_zh_hant, offers_zh_hans)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(product_code, supermarket_code, snapshot_date) DO UPDATE SET
        price=excluded.price, offers_en=excluded.offers_en,
        offers_zh_hant=excluded.offers_zh_hant, offers_zh_hans=excluded.offers_zh_hans`),
    delDayPrices: db.prepare('DELETE FROM prices WHERE snapshot_date = ?'),
    insSnapshot: db.prepare(`
      INSERT INTO snapshots (snapshot_date, fetched_at, product_count, price_count)
      VALUES (?,?,?,?)
      ON CONFLICT(snapshot_date) DO UPDATE SET
        fetched_at=excluded.fetched_at, product_count=excluded.product_count, price_count=excluded.price_count`),
  };

  let priceCount = 0;
  let productCount = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    stmts.delDayPrices.run(snapshotDate);
    // 先建快照行（prices 外键依赖），循环后再回填计数
    stmts.insSnapshot.run(snapshotDate, fetchedAt, 0, 0);
    for (const item of items) {
      const code = tri(item, 'code');
      if (!code) continue;
      const lang = (bag) => ({
        en: tri(bag, 'en'), zhHant: tri(bag, 'zh-Hant'), zhHans: tri(bag, 'zh-Hans'),
      });
      const brand = lang(item.brand);
      const name = lang(item.name);
      const c1 = lang(item.cat1Name);
      const c2 = lang(item.cat2Name);
      const c3 = lang(item.cat3Name);

      stmts.upsertProduct.run(
        code,
        brand.en, brand.zhHant, brand.zhHans,
        name.en, name.zhHant, name.zhHans,
        c1.en, c1.zhHant, c1.zhHans,
        c2.en, c2.zhHant, c2.zhHans,
        c3.en, c3.zhHant, c3.zhHans,
        snapshotDate, snapshotDate,
      );
      stmts.ftsDel.run(code);
      stmts.ftsIns.run(code, searchText(item));
      productCount += 1;

      const offers = new Map(); // store -> {en:[], hant:[], hans:[]}
      for (const o of item.offers ?? []) {
        const store = tri(o, 'supermarketCode');
        if (!store) continue;
        const bucket = offers.get(store) ?? { en: [], hant: [], hans: [] };
        for (const [k, arr] of [['en', 'en'], ['zh-Hant', 'hant'], ['zh-Hans', 'hans']]) {
          const v = tri(o, k);
          if (v && !bucket[arr].includes(v)) bucket[arr].push(v);
        }
        offers.set(store, bucket);
      }

      for (const p of item.prices ?? []) {
        const store = tri(p, 'supermarketCode');
        const price = Number.parseFloat(p?.price);
        if (!store || !Number.isFinite(price)) continue;
        stmts.upsertSuper.run(store, store, store, store);
        const o = offers.get(store);
        stmts.insPrice.run(
          snapshotDate, code, store, price,
          o?.en?.join(' / ') ?? null,
          o?.hant?.join(' / ') ?? null,
          o?.hans?.join(' / ') ?? null,
        );
        priceCount += 1;
      }
    }
    stmts.insSnapshot.run(snapshotDate, fetchedAt, productCount, priceCount);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { productCount, priceCount };
}

/** 清理早于 30 天前（相对 today）的快照及价格。 */
export function prune(db, today = dateHKT()) {
  const cutoff = subDays(today, RETENTION_DAYS);
  const prunedDates = db.prepare('SELECT snapshot_date AS d FROM snapshots WHERE snapshot_date < ?')
    .all(cutoff).map((r) => r.d);
  db.prepare('DELETE FROM prices WHERE snapshot_date < ?').run(cutoff);
  db.prepare('DELETE FROM snapshots WHERE snapshot_date < ?').run(cutoff);
  return prunedDates;
}

/**
 * 抓取最新数据并入库当日快照，随后按保留策略清理。
 * @param {import('node:sqlite').DatabaseSync} [db]
 * @param {string} [url] 数据源地址
 */
export async function collect(db = openDb(), url = SOURCE_URL) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('unexpected payload: not an array');

  const snapshotDate = dateHKT();
  const { productCount, priceCount } = ingest(db, items, snapshotDate);
  const prunedDates = prune(db, snapshotDate);
  return { snapshotDate, productCount, priceCount, prunedDates };
}

// 直接运行：一次性收集
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const r = await collect();
  console.log(JSON.stringify(r));
}
