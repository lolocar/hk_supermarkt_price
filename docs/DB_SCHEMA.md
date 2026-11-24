# 資料庫方案（已確認並實現）

消費者委員會「格價資訊通」每日開放數據超市比價應用 — 資料庫設計。

## 數據源實測結論（2026-11-24）

| 事實 | 數值 / 說明 |
|---|---|
| 每日文件條數 | 2,773 個貨品（每日會變動） |
| 貨品欄位 | `code`、`brand`、`name`、`cat1Name`~`cat3Name`，均為 `{en, zh-Hant, zh-Hans}` 三語對象 |
| 價格 | `prices[]`: `{supermarketCode, price}`（單件售價，字串數字），每貨品 1~9 間超市 |
| 優惠 | `offers[]`: `{supermarketCode, en, zh-Hant, zh-Hans}`，如「買2件$12.00」 |
| 超市 | 固定 9 間：WELLCOME 惠康、PARKNSHOP 百佳、JASONS Market Place、WATSONS 屈臣氏、MANNINGS 萬寧、AEON、DCHFOOD 大昌食品、SASA 莎莎、LUNGFUNG 龍豐 |
| 時間戳 | **文件內沒有日期欄位**，以我方抓取時間作為快照日期（Asia/Hong_Kong） |
| 注意 | 無條碼、無淨含量/規格欄位，故「同一貨品」以 `code` 為準 |

數據量估算：每日約 8,000 條價格行；保留 30 天 ≈ 24 萬行、幾十 MB，SQLite 輕鬆承擔。

## 選型：SQLite（已採用）

- 單檔案 `data/app.db`，零運維、零外部服務，Node 26 內置 `node:sqlite`（同步 API、嵌入 Node 進程，無需原生編譯依賴）。
- WAL 模式：每日凌晨抓取寫入時，網頁查詢不阻塞。
- 30 天保留 = 一條 `DELETE`；備份 = 複製一個檔案。
- 內置 FTS5 全文檢索（trigram 分詞，支援繁中/簡中/英文子串搜尋）。
- 若想改用 PostgreSQL，邏輯 schema 完全相同，只是換驅動並需要起服務；本機部署場景下 SQLite 更合適。

## 表結構（DDL）

```sql
PRAGMA journal_mode = WAL;

-- 超市維表（9 行，固定，內置三語名稱）
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

-- 貨品維表（以源數據 code 為主鍵；每日 upsert 最新名稱/分類；
-- 保留 first_seen/last_seen，下架貨品仍有歷史價格）
CREATE TABLE products (
  code           TEXT PRIMARY KEY,         -- 'P000003983'
  brand_en       TEXT, brand_zh_hant TEXT, brand_zh_hans TEXT,
  name_en        TEXT, name_zh_hant TEXT, name_zh_hans TEXT,
  cat1_en TEXT, cat1_zh_hant TEXT, cat1_zh_hans TEXT,   -- 一級分類
  cat2_en TEXT, cat2_zh_hant TEXT, cat2_zh_hans TEXT,   -- 二級分類
  cat3_en TEXT, cat3_zh_hant TEXT, cat3_zh_hans TEXT,   -- 三級分類
  first_seen     TEXT NOT NULL,             -- 首次出現的快照日
  last_seen      TEXT NOT NULL              -- 最近出現的快照日
);

-- 價格事實表：貨品 × 超市 × 日 唯一
CREATE TABLE prices (
  snapshot_date    TEXT NOT NULL,           -- FK snapshots
  product_code     TEXT NOT NULL,           -- FK products
  supermarket_code TEXT NOT NULL,           -- FK supermarkets
  price            REAL NOT NULL,           -- 單件售價（實際價格，排序依據）
  offers_en        TEXT,                     -- 該行超市優惠文本（多語言），'/' 分隔
  offers_zh_hant   TEXT,
  offers_zh_hans   TEXT,
  PRIMARY KEY (product_code, supermarket_code, snapshot_date),
  FOREIGN KEY (snapshot_date) REFERENCES snapshots(snapshot_date),
  FOREIGN KEY (product_code)  REFERENCES products(code)
);

CREATE INDEX idx_prices_super ON prices(supermarket_code, snapshot_date);
-- PK 已含 (product_code, ...)：單品 30 天歷史直接走 PK 索引

-- 全文檢索：三語名稱+品牌合併成一列，trigram 分詞（支援 CJK）；
-- <3 字元的短查詢回退到 LIKE
CREATE VIRTUAL TABLE products_fts USING fts5(
  code UNINDEXED,
  search_text,
  tokenize = 'trigram'
);

-- 關注列表（如選服務端方案）：匿名使用者 id（UUID 存 localStorage，無需註冊登入）
CREATE TABLE favorites (
  user_id      TEXT NOT NULL,
  product_code TEXT NOT NULL,
  added_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, product_code)
);
```

> 實作說明：實際採用瀏覽器 localStorage 存關注，`favorites` 表保留備用未建。

## 30 天保留策略

每天抓取成功後（同一事務內）執行：

```sql
DELETE FROM prices    WHERE snapshot_date < date(:today, '-30 day');
DELETE FROM snapshots WHERE snapshot_date < date(:today, '-30 day');
```

`products` 與 `favorites` 不刪（貨品名稱/分類是歷史價格的展示上下文）。

## 檢索與排序怎麼走

- 分類篩選：按 `cat1/2/3` 三語列匹配（分類樹來自 `/api/meta`）。
- 文字搜尋：`products_fts`（trigram）或短詞 LIKE，支援空格分詞各詞獨立匹配（詞間 AND），配合分類/超市過濾。
- 比價：`SELECT ... WHERE product_code = ? AND snapshot_date = :latest ORDER BY price ASC` —— 即「按實際價格由低至高」。優惠文本一併返回；另解析「買2件$X」類多件優惠計算折後每件價（API `ep` 欄位），供優惠口徑圖表與雙高亮使用（列表排序仍以單件 price 為準）。
- 詳情頁圖表：`WHERE product_code = ?` 按日聚合出各超市 30 天價格序列（走 PK 前綴索引）。

## 應用側如何用它

- 後端：Node + Express + 內置 `node:sqlite`；`node-cron` 每日 03:00 HKT 抓取 + 提供手動重新整理介面；首次啟動立即灌入當日數據。
- 前端：單頁應用（Vite + React），Chart.js 畫價格趨勢；語言（繁/簡/英）與主題（淺/深）存 localStorage；UI 文案走 i18n 字典，商品/分類名稱直接用數據自帶的三語欄位。
- 關注功能：瀏覽器 localStorage（已確認方案）。
- API：`/api/meta`、`/api/search`、`/api/products/:code`（最新各超市價 + 30 天歷史，含折算價 `ep`）、`/api/products/batch`（關注列表回填）、`/api/admin/collect`。
