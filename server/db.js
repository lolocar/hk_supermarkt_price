// 数据库访问层：node:sqlite（内置，无原生依赖）、schema 初始化、超市维表种子。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH ?? path.join(HERE, '..', 'data', 'app.db');
export const TZ = 'Asia/Hong_Kong';
export const RETENTION_DAYS = 30;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

/** 9 间超市固定维表（来自官方数据字典）。 */
export const SUPERMARKETS = [
  ['WELLCOME', 'Wellcome', '惠康', '惠康'],
  ['PARKNSHOP', 'PARKnSHOP', '百佳', '百佳'],
  ['JASONS', 'Market Place', 'Market Place', 'Market Place'],
  ['WATSONS', 'Watsons', '屈臣氏', '屈臣氏'],
  ['MANNINGS', 'Mannings', '萬寧', '万宁'],
  ['AEON', 'AEON', 'AEON', 'AEON'],
  ['DCHFOOD', 'DCH Food Mart', '大昌食品', '大昌食品'],
  ['SASA', 'Sasa', '莎莎', '莎莎'],
  ['LUNGFUNG', 'Lung Fung', '龍豐', '龙丰'],
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS supermarkets (
  code         TEXT PRIMARY KEY,
  name_en      TEXT NOT NULL,
  name_zh_hant TEXT NOT NULL,
  name_zh_hans TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_date TEXT PRIMARY KEY,
  fetched_at    TEXT NOT NULL,
  product_count INTEGER NOT NULL,
  price_count   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  code           TEXT PRIMARY KEY,
  brand_en       TEXT, brand_zh_hant TEXT, brand_zh_hans TEXT,
  name_en        TEXT, name_zh_hant TEXT, name_zh_hans TEXT,
  cat1_en TEXT, cat1_zh_hant TEXT, cat1_zh_hans TEXT,
  cat2_en TEXT, cat2_zh_hant TEXT, cat2_zh_hans TEXT,
  cat3_en TEXT, cat3_zh_hant TEXT, cat3_zh_hans TEXT,
  first_seen     TEXT NOT NULL,
  last_seen      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prices (
  snapshot_date    TEXT NOT NULL,
  product_code     TEXT NOT NULL,
  supermarket_code TEXT NOT NULL,
  price            REAL NOT NULL,
  offers_en        TEXT,
  offers_zh_hant   TEXT,
  offers_zh_hans   TEXT,
  PRIMARY KEY (product_code, supermarket_code, snapshot_date),
  FOREIGN KEY (snapshot_date) REFERENCES snapshots(snapshot_date),
  FOREIGN KEY (product_code)  REFERENCES products(code)
);
CREATE INDEX IF NOT EXISTS idx_prices_super ON prices(supermarket_code, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_prices_date  ON prices(snapshot_date);
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  code UNINDEXED,
  search_text,
  tokenize = 'trigram'
);
`;

/** 打开（并初始化）数据库。 */
export function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO supermarkets (code, name_en, name_zh_hant, name_zh_hans) VALUES (?,?,?,?)');
  for (const row of SUPERMARKETS) ins.run(...row);
  return db;
}

/** 指定时刻在 Asia/Hong_Kong 的日历日，返回 'YYYY-MM-DD'。 */
export function dateHKT(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** 日历日字符串减 n 天，返回 'YYYY-MM-DD'。 */
export function subDays(dateStr, n) {
  const t = Date.parse(`${dateStr}T00:00:00Z`) - n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
