# HK 超市格价 HK Price Watch

基于消费者委员会「格价资讯通」每日开放数据的超市比价 Web 应用。

- 数据源：`https://online-price-watch.consumer.org.hk/opw/opendata/pricewatch.json`
- 数据字典：`docs/pricewatch_data_dictionary.pdf`（提取文本见 `docs/dictionary.txt`）
- 数据库方案（已确认）：SQLite + 浏览器 localStorage 关注 → [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md)

## 致谢 Acknowledgement

此应用使用源自 [DATA.GOV.HK](https://data.gov.hk/) 的数据：[「格價資訊通 Online Price Watch」数据集](https://data.gov.hk/tc-data/dataset/cc-pricewatch-pricewatch)（数据提供机构：消费者委员会）。使用该数据须受 DATA.GOV.HK [免责条款](https://www.data.gov.hk/tc/terms-and-conditions)约束——政府、政策创新与统筹办事处、数字政策办公室及数据供应商不会就数据的准确性、可靠性或适时性承担法律责任。This application uses data from [DATA.GOV.HK](https://data.gov.hk/), subject to its [terms and conditions](https://www.data.gov.hk/en/terms-and-conditions).

## 功能

1. 三语界面：繁體中文 / 简体中文 / English（商品名、超市名、分类均按语言展示，数据自带三语）
2. 商品分类三级树筛选（点分类标签即展开/关闭并选中，再点取消）+ 文字搜索（FTS5 trigram，支持三语，空格分词各词独立匹配品牌或品名；短词自动回退 LIKE）+ 超市多选筛选
3. 同一货品（按官方 `code`）跨 9 间超市比价，按实际售价从低到高排列；**双高亮**：正价最平一行青绿色、优惠后最平一行紫色（「買N件$X / 買N件慳$Y」解析成每件实际价），带图例
4. 商品详情页价格走势图（Chart.js，7/14/30 天，**优惠价/正价两种口径切换**，默认按多件优惠折算后的每件实付价；缺价可能只是商店未上报数据，页面有提示）
5. 服务端 `node-cron` 每日 03:00 HKT 抓取，保留 30 天；启动缺当日快照自动补抓；页脚可手动触发
6. 浅色 / 深色主题（跟随系统，可手动切换并记住）
7. 商品关注（localStorage），顶部导航直达关注列表
8. 手机版页面：窄屏自适应；桌面顶栏 📱 一键切换手机版布局（480px 窄列、筛选栏折叠为抽屉），选择跨页面记忆

## 运行

```sh
npm install
npm run build      # 构建前端到 client/dist
npm start          # 前台起服务：http://localhost:4321（含每日 03:00 HKT 定时抓取）
npm run collect    # 手动灌一次当日数据
node scripts/import-history.mjs [目录]   # 导入历史 pricewatch.json 快照（默认 /home/user00/pricewatch_data）
```

前端开发模式：`npm run dev:client`（Vite 代理 /api → 4321）。

## 远端访问

服务默认绑定 `0.0.0.0:4321`，同一网络内可直接访问：

- 局域网：`http://<LAN-IP>:4321`
- Tailscale：`http://<Tailscale-IP>:4321`

监听地址/端口用环境变量调整：`HOST`（默认 `0.0.0.0`；设 `127.0.0.1` 可关远端）、`PORT`（默认 `4321`）。无鉴权，仅限可信网络暴露。

## 服务管理（拉起命令）

常驻服务为 systemd **用户级**单元 `hmw`（已 `enable`，linger 已开：开机自启、无需登录会话）：

```sh
systemctl --user start hmw      # 拉起
systemctl --user stop hmw       # 停止
systemctl --user restart hmw    # 重启（改代码 / 重新构建后用这个）
systemctl --user status hmw     # 查看状态
journalctl --user -u hmw -f     # 跟踪日志
```

改完前后端的完整发布流程：

```sh
cd /home/user00/deepseek-harness/hk_supermarket_watch
npm run build                   # 重建前端到 client/dist
systemctl --user restart hmw    # 重启服务
curl -s localhost:4321/api/health   # 应返回 {"ok":true,"latestDate":"YYYY-MM-DD"}
```

端口被手工起的进程占用时：`fuser -k 4321/tcp` 再 `systemctl --user restart hmw`。

## 结构

```
server/    Express + node:sqlite（无原生依赖）：db.js schema、collect.js 收集器、index.js API/定时/静态
client/    React 19 + Vite：三语 i18n、主题、搜索/比价/走势图/关注
scripts/   ui-smoke.mjs（Playwright 截图）、ui-assert.mjs（44 项 DOM 断言）、import-history.mjs（历史导入）
data/      SQLite 数据库（WAL）
docs/      数据字典文本、数据库方案
```

## 测试

服务端与 API 起好后：

```sh
node scripts/ui-assert.mjs   # 排序、筛选、比价、图表、关注、三语、主题、窄屏断言
node scripts/ui-smoke.mjs    # 交互流程截图到 scripts/shots/
```
