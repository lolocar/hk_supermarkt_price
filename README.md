# HK 超市格價 HK Price Watch

基於消費者委員會「格價資訊通」每日開放數據的超市比價 Web 應用。

- 數據源：`https://online-price-watch.consumer.org.hk/opw/opendata/pricewatch.json`
- 數據字典：`docs/pricewatch_data_dictionary.pdf`（提取文本見 `docs/dictionary.txt`）
- 資料庫方案（已確認）：SQLite + 瀏覽器 localStorage 關注 → [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md)

## 致謝 Acknowledgement

此應用使用源自 [DATA.GOV.HK](https://data.gov.hk/) 的數據：[「格價資訊通 Online Price Watch」數據集](https://data.gov.hk/tc-data/dataset/cc-pricewatch-pricewatch)（數據提供機構：消費者委員會）。使用該數據須受 DATA.GOV.HK [免責條款](https://www.data.gov.hk/tc/terms-and-conditions)約束——政府、政策創新與統籌辦事處、數字政策辦公室及數據供應商不會就數據的準確性、可靠性或適時性承擔法律責任。This application uses data from [DATA.GOV.HK](https://data.gov.hk/), subject to its [terms and conditions](https://www.data.gov.hk/en/terms-and-conditions).

## 功能

1. 三語介面：繁體中文 / 简体中文 / English（商品名、超市名、分類均按語言展示，數據自帶三語）
2. 商品分類三級樹篩選（點分類標籤即展開/關閉並選中，再點取消）+ 文字搜尋（FTS5 trigram，支援三語，空格分詞各詞獨立匹配品牌或品名；短詞自動回退 LIKE）+ 超市多選篩選
3. 同一貨品（按官方 `code`）跨 9 間超市比價，按實際售價由低到高排列；**雙高亮**：正價最平一行青綠色、優惠後最平一行紫色（「買N件$X / 買N件慳$Y」解析成每件實際價），附圖例
4. 商品詳情頁價格走勢圖（Chart.js，7/14/30 天，**優惠價/正價兩種口徑切換**，預設按多件優惠折算後的每件實付價；缺價可能只是商店未有上報數據，頁面有提示）
5. 服務端 `node-cron` 每日 03:00 HKT 抓取，保留 30 天；啟動時缺當日快照自動補抓；頁腳可手動觸發
6. 淺色 / 深色主題（跟隨系統，可手動切換並記住）
7. 商品關注（localStorage），頂部導航直達關注列表
8. 手機版頁面：窄屏自適應；桌面頂欄 📱 一鍵切換手機版佈局（480px 窄欄、篩選欄摺疊為抽屜），選擇跨頁面記憶

## 運行

```sh
npm install
npm run build      # 構建前端到 client/dist
npm start          # 前台起服務：http://localhost:4321（含每日 03:00 HKT 定時抓取）
npm run collect    # 手動灌一次當日數據
node scripts/import-history.mjs [目錄]   # 匯入歷史 pricewatch.json 快照（預設 /home/user00/pricewatch_data）
```

前端開發模式：`npm run dev:client`（Vite 代理 /api → 4321）。

## 遠端存取

服務預設綁定 `0.0.0.0:4321`，同一網絡內可直接存取 `http://<主機 IP>:4321`：

- 區域網絡 IP：`hostname -I` 查詢
- Tailscale IP：`tailscale ip -4` 查詢（本機實際地址記錄在倉庫外的 `DEPLOY.local.md`，不入 git）

監聽地址/端口用環境變數調整：`HOST`（預設 `0.0.0.0`；設 `127.0.0.1` 可關閉遠端）、`PORT`（預設 `4321`）。無認證，只應在可信網絡內開放。

## 服務管理（啟動命令）

常駐服務為 systemd **使用者級**單元 `hmw`（已 `enable`，linger 已開：開機自啟、無需登入工作階段）：

```sh
systemctl --user start hmw      # 啟動
systemctl --user stop hmw       # 停止
systemctl --user restart hmw    # 重啟（改代碼 / 重新構建後用這個）
systemctl --user status hmw     # 查看狀態
journalctl --user -u hmw -f     # 追蹤日誌
```

改完前後端的完整發佈流程：

```sh
cd /home/user00/deepseek-harness/hk_supermarket_watch
npm run build                   # 重建前端到 client/dist
systemctl --user restart hmw    # 重啟服務
curl -s localhost:4321/api/health   # 應返回 {"ok":true,"latestDate":"YYYY-MM-DD"}
```

端口被手動啟動的進程佔用時：`fuser -k 4321/tcp` 再 `systemctl --user restart hmw`。

## 結構

```
server/    Express + node:sqlite（無原生依賴）：db.js schema、collect.js 收集器、index.js API/定時/靜態
client/    React 19 + Vite：三語 i18n、主題、搜尋/比價/走勢圖/關注
scripts/   ui-smoke.mjs（Playwright 截圖）、ui-assert.mjs（45 項 DOM 斷言）、import-history.mjs（歷史匯入）
data/      SQLite 資料庫（WAL）
docs/      數據字典文本、資料庫方案
```

## 測試

服務端與 API 起好後：

```sh
node scripts/ui-assert.mjs   # 排序、篩選、比價、圖表、關注、三語、主題、窄屏斷言
node scripts/ui-smoke.mjs    # 互動流程截圖到 scripts/shots/
```
