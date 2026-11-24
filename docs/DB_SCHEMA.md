# 数据库方案（待确认）

消费委员会「格价资讯通」每日开放数据超市比价应用 — 数据库设计。

## 数据源实测结论（2026-11-24）

| 事实 | 数值 / 说明 |
|---|---|
| 每日文件条数 | 2,773 个货品（每日会变动） |
| 货品字段 | `code`、`brand`、`name`、`cat1Name`~`cat3Name`，均为 `{en, zh-Hant, zh-Hans}` 三语对象 |
| 价格 | `prices[]`: `{supermarketCode, price}`（单件售价，字符串数字），每货品 1~9 间超市 |
| 优惠 | `offers[]`: `{supermarketCode, en, zh-Hant, zh-Hans}`，如「買2件$12.00」 |
| 超市 | 固定 9 间：WELLCOME 惠康、PARKNSHOP 百佳、JASONS Market Place、WATSONS 屈臣氏、MANNINGS 萬寧、AEON、DCHFOOD 大昌食品、SASA 莎莎、LUNGFUNG 龍豐 |
| 时间戳 | **文件内没有日期字段**，以我方抓取时间作为快照日期（Asia/Hong_Kong） |
| 注意 | 无条形码、无净含量/规格字段，故「同一货品」以 `code` 为准 |

数据量估算：每日约 8,000 条价格行；保留 30 天 ≈ 24 万行、几十 MB，SQLite 轻松承载。

## 选型：SQLite（推荐）

- 单文件 `data/app.db`，零运维、零外部服务，`better-sqlite3`（同步 API、嵌入 Node 进程）。
- WAL 模式：每日凌晨抓取写入时，网页查询不阻塞。
- 30 天保留 = 一条 `DELETE`；备份 = 复制一个文件。
- 内置 FTS5 全文检索（trigram 分词，支持繁中/简中/英文子串搜索）。
- 如你更想用 PostgreSQL，逻辑 schema 完全相同，只是换驱动并需要起服务；本机部署场景下我认为 SQLite 更合适。

## 表结构（DDL）

```sql
PRAGMA journal_mode = WAL;

-- 超市维表（9 行，固定，内置三语名称）
CREATE TABLE supermarkets (
  code         TEXT PRIMARY KEY,   -- 如 'WELLCOME'
  name_en      TEXT NOT NULL,
  name_zh_hant TEXT NOT NULL,
  name_zh_hans TEXT NOT NULL
);

-- 每日抓取快照（一次抓取 = 一天）
CREATE TABLE snapshots (
  snapshot_date TEXT PRIMARY KEY,  -- 'YYYY-MM-DD'（Asia/Hong_Kong）
  fetched_at    TEXT NOT NULL,     -- ISO8601 UTC
  product_count INTEGER NOT NULL,
  price_count   INTEGER NOT NULL
);

-- 货品维表（以源数据 code 为主键；每日 upsert 最新名称/分类；
-- 保留 first_seen/last_seen，下架货品仍有历史价格）
CREATE TABLE products (
  code           TEXT PRIMARY KEY,         -- 'P000003983'
  brand_en       TEXT, brand_zh_hant TEXT, brand_zh_hans TEXT,
  name_en        TEXT, name_zh_hant TEXT, name_zh_hans TEXT,
  cat1_en TEXT, cat1_zh_hant TEXT, cat1_zh_hans TEXT,   -- 一级分类
  cat2_en TEXT, cat2_zh_hant TEXT, cat2_zh_hans TEXT,   -- 二级分类
  cat3_en TEXT, cat3_zh_hant TEXT, cat3_zh_hans TEXT,   -- 三级分类
  first_seen     TEXT NOT NULL,             -- 首次出现的快照日
  last_seen      TEXT NOT NULL              -- 最近出现的快照日
);

-- 价格事实表：货品 × 超市 × 日 唯一
CREATE TABLE prices (
  snapshot_date    TEXT NOT NULL,           -- FK snapshots
  product_code     TEXT NOT NULL,           -- FK products
  supermarket_code TEXT NOT NULL,           -- FK supermarkets
  price            REAL NOT NULL,           -- 单件售价（实际价格，排序依据）
  offers_en        TEXT,                     -- 该行超市优惠文本（多语言），'/' 分隔
  offers_zh_hant   TEXT,
  offers_zh_hans   TEXT,
  PRIMARY KEY (product_code, supermarket_code, snapshot_date),
  FOREIGN KEY (snapshot_date) REFERENCES snapshots(snapshot_date),
  FOREIGN KEY (product_code)  REFERENCES products(code)
);

CREATE INDEX idx_prices_super ON prices(supermarket_code, snapshot_date);
-- PK 已含 (product_code, ...)：单品 30 天历史直接走 PK 索引

-- 全文检索：三语名称+品牌合并成一列，trigram 分词（支持 CJK）；
-- <3 字符的短查询回退到 LIKE
CREATE VIRTUAL TABLE products_fts USING fts5(
  code UNINDEXED,
  search_text,
  tokenize = 'trigram'
);

-- 关注列表（如选服务端方案）：匿名用户 id（UUID 存 localStorage，无需注册登录）
CREATE TABLE favorites (
  user_id      TEXT NOT NULL,
  product_code TEXT NOT NULL,
  added_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, product_code)
);
```

## 30 天保留策略

每天抓取成功后（同一事务内）执行：

```sql
DELETE FROM prices    WHERE snapshot_date < date(:today, '-30 day');
DELETE FROM snapshots WHERE snapshot_date < date(:today, '-30 day');
```

`products` 与 `favorites` 不删（货品名称/分类是历史价格的展示上下文）。

## 检索与排序怎么走

- 分类筛选：按 `cat1/2/3` 三语列匹配（分类树来自 `/api/meta`）。
- 文字搜索：`products_fts`（trigram）或短词 LIKE，配合分类/超市过滤。
- 比价：`SELECT ... WHERE product_code = ? AND snapshot_date = :latest ORDER BY price ASC` —— 即「按实际价格由低至高」。优惠文本一并返回；另解析「買2件$X」类多件优惠计算折后每件价，作辅助展示（排序仍以单件 price 为准）。
- 详情页图表：`WHERE product_code = ?` 按日聚合出各超市 30 天价格序列（走 PK 前缀索引）。

## 应用侧如何用它（一并确认）

- 后端：Node + Express + better-sqlite3；`node-cron` 每日 03:00 HKT 抓取 + 提供手动刷新接口；首次启动立即灌入当日数据。
- 前端：单页应用（Vite + React），Chart.js 画价格趋势；语言（繁/简/英）与主题（浅/深）存 localStorage；UI 文案走 i18n 字典，商品/分类名称直接用数据自带的三语字段。
- 关注功能二选一（见问题 2）。
- API：`/api/meta`、`/api/search`、`/api/products/:code`（最新各超市价 + 30 天历史）、`/api/favorites`（GET/POST/DELETE，如选服务端）、`/api/admin/collect`。
