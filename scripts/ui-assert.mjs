// DOM 断言：分类点击展开/选中、叶子筛选有商品、双高亮、手机版视图、排序、关注、三语、主题、窄屏。
import { chromium } from '/home/user00/deepseek-harness/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:4321';
const results = [];
const ok = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); if (!cond) process.exitCode = 1; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.item-row');

// 1. 基础列表
ok('繁中 UI', (await page.locator('.navlink', { hasText: '全部貨品' }).count()) === 1);
ok('中文商品名渲染', /[一-鿿]/.test(await page.locator('.item-row .item-name').first().innerText()));
const prices = await page.$$eval('.item-row .price', (els) => els.map((e) => Number.parseFloat(e.textContent.replace(/[^0-9.]/g, ''))));
ok('列表價格升序（${prices.length} 行）'.replace('${prices.length}', String(prices.length)), prices.length > 10 && prices.every((v, i) => i === 0 || v >= prices[i - 1]));
ok('列表“間有售”悬停提示含未上报说明', await page.locator('.item-stores').first().getAttribute('title')
  .then((s) => !!s && s.includes('上報')));

// 2. 英文搜索
await page.selectOption('.lang-select', 'en');
await page.waitForTimeout(400);
await page.fill('input[aria-label=search]', 'milk');
await page.press('input[aria-label=search]', 'Enter');
await page.waitForTimeout(800);
ok('英文搜索 milk', await page.$$eval('.item-row .item-name', (els) => els.length > 0 && els.every((e) => /milk/i.test(e.textContent))));
await page.selectOption('.lang-select', 'zh-Hant');
await page.waitForTimeout(400);

// 3. 空格分词搜索：每词分别匹配品牌或商品名（AND）。列表按当前语言展示名称，故切 EN 验证英文字段。
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.item-row');
await page.selectOption('.lang-select', 'en');
await page.waitForTimeout(300);
await page.fill('input[aria-label=search]', 'Garden crustless');
await page.press('input[aria-label=search]', 'Enter');
await page.waitForTimeout(800);
ok('分词搜索：品牌词+名称词交叉命中', await page.$$eval('.item-row', (els) => els.length > 0
  && els.every((e) => /garden/i.test(e.textContent) && /crustless/i.test(e.textContent))));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.item-row');
await page.fill('input[aria-label=search]', 'milk bun');
await page.press('input[aria-label=search]', 'Enter');
await page.waitForTimeout(800);
ok('分词搜索：两词须同时命中（AND 无漏入）', await page.$$eval('.item-row .item-name', (els) => els.length > 0
  && els.every((e) => /milk/i.test(e.textContent) && /bun/i.test(e.textContent))));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.item-row');
await page.selectOption('.lang-select', 'zh-Hant');
await page.waitForTimeout(300);

// 4. 分类：点标签直接展开（无需箭头）且 URL 带筛选
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.item-row');
ok('初始无二级节点', (await page.locator('.tree-label2').count()) === 0);
await page.locator('.tree-label1').first().click();
await page.waitForTimeout(600);
ok('点一级标签即展开二级', (await page.locator('.tree-label2').count()) > 0);
ok('点一级标签即写入 cat1', (await page.evaluate(() => location.hash)).includes('cat1='));

// 4. 叶子分类筛选有商品（回归：修复 cat 参数互相覆盖 bug）
await page.locator('.tree-label2').first().click();
await page.waitForTimeout(500);
await page.locator('.tree-label3').first().click();
await page.waitForTimeout(700);
const hash = await page.evaluate(() => location.hash);
ok('叶子分类 URL 含三級 cat3', hash.includes('cat3='));
const leafCount = Number.parseInt((await page.locator('.results-bar span').first().innerText()).match(/\d+/)?.[0] ?? '0', 10);
ok(`叶子分类列出商品（${leafCount} 個）`, leafCount > 0 && (await page.locator('.item-row').count()) > 0);
const leafNames = await page.$$eval('.item-row .item-meta .chip', (els) => els.map((e) => e.textContent));
const active3 = decodeURIComponent(hash.match(/cat3=([^&]*)/)[1]);
ok('列表分類徽章與所選一致', leafNames.every((n) => n === active3));
// 再点同一标签 → 取消筛选
await page.locator('.tree-label3').first().click();
await page.waitForTimeout(600);
ok('再点叶子标签取消 cat3', !(await page.evaluate(() => location.hash)).includes('cat3='));

// 5. 详情页双高亮：正价最平（绿 .best）+ 优惠后最平（紫 .best-eff），P000000002 两者不同行
await page.goto(`${BASE}/#/product/P000000002`, { waitUntil: 'networkidle' });
await page.waitForSelector('table.cmp');
await page.waitForTimeout(400);
ok('比价标题渲染出日期（无未替换占位符）', await page.locator('.card h2').first().innerText()
  .then((s) => /\d{4}-\d{2}-\d{2}/.test(s) && !s.includes('{date}')));
ok('全页无未替换 {占位符}', await page.evaluate(() => !/\{[a-z]+\}/i.test(document.body.innerText)));
ok('缺价提示（未上报≠没卖）显示', await page.locator('.notice').first().innerText()
  .then((s) => s.includes('沒有報價') && s.includes('上報') && s.includes('並不代表')));
ok('走势图说明含未上报提示', await page.locator('.hint', { hasText: '沒有上報數據' }).count() >= 1);
ok('页脚免责含未上报提示', await page.locator('.footer', { hasText: '沒有上報數據' }).count() === 1);
ok('DATA.GOV.HK 致谢与免责链接', await page.locator('.ack').first().innerText()
  .then((s) => s.includes('DATA.GOV.HK') && s.includes('免責條款') && s.includes('消費者委員會'))
  && String(await page.locator('.ack a').first().getAttribute('href'))
    .startsWith('https://www.data.gov.hk/tc/terms-and-conditions'));
const bestCnt = await page.locator('table.cmp tbody tr.best').count();
const effCnt = await page.locator('table.cmp tbody tr.best-eff').count();
ok('正价最平高亮存在', bestCnt === 1);
ok('优惠后最平高亮存在', effCnt === 1);
const bestStore = await page.locator('table.cmp tbody tr.best td:nth-child(2)').innerText();
const effStore = await page.locator('table.cmp tbody tr.best-eff td:nth-child(2)').innerText();
ok(`双高亮为不同超市（${bestStore.split('\n')[0]} vs ${effStore.split('\n')[0]}）`, bestStore !== effStore);
ok('双徽章文字', (await page.locator('.best-badge').count()) === 2
  && (await page.locator('.eff-badge').count()) === 1
  && (await page.locator('.eff-badge').innerText()).includes('優惠後最平'));
const bestBg = await page.locator('table.cmp tbody tr.best td').first().evaluate((e) => getComputedStyle(e).backgroundColor);
const effBg = await page.locator('table.cmp tbody tr.best-eff td').first().evaluate((e) => getComputedStyle(e).backgroundColor);
ok(`两种高亮颜色不同（${bestBg} vs ${effBg}）`, bestBg !== effBg);
ok('图例存在', (await page.locator('.legend').count()) === 1);
const cmp = await page.$$eval('table.cmp tbody tr .price', (els) => els.map((e) => Number.parseFloat((e.firstChild?.textContent ?? e.textContent).replace(/[^0-9.]/g, ''))));
ok(`比价表升序（${cmp.length} 间超市）`, cmp.length >= 3 && cmp.every((v, i) => i === 0 || v >= cmp[i - 1]));

// 走势图按优惠后价 / 正价切换（默认优惠价）
await page.goto(`${BASE}/#/product/P000000002`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
await page.waitForTimeout(900);
const apiDetail = await (await fetch(`${BASE}/api/products/P000000002`)).json();
const diffRows = apiDetail.history.filter((h) => h.p !== h.ep);
ok('API 历史含折算价 ep（且与正价不同）', diffRows.length > 0);
const testStore = diffRows[0].s;
const storeName = { WELLCOME: '惠康', PARKNSHOP: '百佳', JASONS: 'Market Place', AEON: 'AEON', MANNINGS: '萬寧', WATSONS: '屈臣氏' }[testStore] ?? testStore;
const seriesData = () => page.evaluate((name) => {
  const ds = window.__hmwChart?.data?.datasets?.find((d) => d.label === name);
  return ds ? ds.data.filter((v) => v != null) : null;
}, storeName);
const expected = (mode) => apiDetail.history
  .filter((h) => h.s === testStore)
  .map((h) => (mode === 'offer' && h.ep != null ? h.ep : h.p));
ok('优惠模式默认激活', (await page.locator('.mode-btn.on[data-mode="offer"]').count()) === 1);
ok(`默认曲线=优惠后价（${storeName}，${expected('offer').length} 点）`,
  JSON.stringify(await seriesData()) === JSON.stringify(expected('offer')));
await page.locator('.mode-btn[data-mode="list"]').click();
await page.waitForTimeout(700);
ok(`切换后曲线=正价（与正价序列一致）`,
  JSON.stringify(await seriesData()) === JSON.stringify(expected('list')));
ok('两模式序列确有差异', JSON.stringify(expected('offer')) !== JSON.stringify(expected('list')));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
await page.waitForTimeout(700);
ok('正价选择被记住（跨刷新）', (await page.locator('.mode-btn.on[data-mode="list"]').count()) === 1);
await page.locator('.mode-btn[data-mode="offer"]').click();
await page.waitForTimeout(300);

// 6. 手机版一键切换
await page.locator('button[aria-label="mobile view"]').click();
await page.waitForTimeout(400);
ok('data-mobile 生效', await page.evaluate(() => document.documentElement.dataset.mobile === '1'));
const appW = await page.locator('.app').evaluate((e) => getComputedStyle(e).maxWidth);
ok(`手机版窄列（${appW}）`, appW === '480px');
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
ok('手机版筛选栏收起', await page.evaluate(() => {
  const d = document.querySelector('.sidebar');
  return !!d && !d.open && getComputedStyle(d.querySelector('.side-summary')).display === 'flex';
}));
ok('手机版模式跨页面保持', await page.evaluate(() => document.documentElement.dataset.mobile === '1'));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.locator('button[aria-label="mobile view"]').click();
await page.waitForTimeout(300);
ok('再点一次退出手机版', await page.evaluate(() => !document.documentElement.dataset.mobile));

// 7. 主题 + 语言 + 关注（原有能力回归）
await page.locator('button[aria-label="toggle theme"]').click();
ok('深色主题生效', await page.evaluate(() => document.documentElement.dataset.theme === 'dark'));
await page.selectOption('.lang-select', 'zh-Hans');
await page.waitForTimeout(300);
ok('简体界面', (await page.locator('.navlink', { hasText: '收藏' }).count()) === 1);
await page.selectOption('.lang-select', 'en');
await page.waitForTimeout(300);
ok('英文界面', (await page.locator('.navlink', { hasText: 'Watchlist' }).count()) === 1);
await page.selectOption('.lang-select', 'zh-Hant');
await page.goto(`${BASE}/#/product/P000000002`, { waitUntil: 'networkidle' });
await page.locator('.detail-fav .fav-btn').click();
await page.goto(`${BASE}/#/favorites`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
ok('关注页显示已关注商品', (await page.locator('.item-row').count()) === 1);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
ok('刷新后关注仍在', (await page.locator('.item-row').count()) === 1);

// 8. 窄屏自适应仍正常
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.item-row');
const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(`窄屏无横向溢出（${hOverflow}px）`, hOverflow <= 1);
ok('窄屏筛选栏默认收起', await page.evaluate(() => !document.querySelector('.sidebar').open));

await browser.close();
if (errors.length) { console.log('PAGE ERRORS:', errors.slice(0, 5)); process.exitCode = 1; }
for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(process.exitCode ? 'SMOKE FAILED' : 'ALL ASSERTIONS PASSED');
