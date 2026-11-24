// UI 冒烟：交互流程截图存 shots/。配合 ui-assert.mjs 的 DOM 断言使用。
import { chromium } from '/home/user00/deepseek-harness/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = 'http://localhost:4321';
const OUT = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const shot = async (name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}${name}` });
  console.log('shot', name);
};

// 1. 首页（默认繁中、浅色）
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot('01-home-hant-light.png');

// 2. 分类树：点标签直接展开并选中（含三级节点 + 商品列表）
await page.locator('.tree-label1').first().click();
await page.waitForTimeout(400);
await page.locator('.tree-label2').first().click();
await page.waitForTimeout(400);
await page.locator('.tree-label3').first().click();
await page.waitForTimeout(700);
await shot('03-category-filter.png');

// 3. 搜索 milk（英文界面）
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.selectOption('.lang-select', 'en');
await page.fill('input[aria-label=search]', 'milk');
await page.press('input[aria-label=search]', 'Enter');
await page.waitForTimeout(800);
await shot('02-search-milk.png');

// 4. 双高亮详情页（正价最平=绿、优惠后最平=紫，不同超市）
await page.selectOption('.lang-select', 'zh-Hant');
await page.goto(`${BASE}/#/product/P000000002`, { waitUntil: 'networkidle' });
await page.waitForSelector('table.cmp');
await page.waitForTimeout(900);
await shot('04-detail-dual-highlight.png');

// 5. 深色 + 简体
await page.locator('button[aria-label="toggle theme"]').click();
await page.selectOption('.lang-select', 'zh-Hans');
await page.waitForTimeout(600);
await shot('05-detail-dark-hans.png');

// 6. 手机版视图（桌面一键切换，480px 窄列）
await page.goto(`${BASE}/#/product/P000000002`, { waitUntil: 'networkidle' });
await page.locator('button[aria-label="mobile view"]').click();
await page.waitForTimeout(700);
await shot('08-mobile-view.png');
await page.locator('button[aria-label="mobile view"]').click();

// 7. 关注 → 收藏页
await page.selectOption('.lang-select', 'zh-Hant');
await page.locator('.detail-fav .fav-btn').click();
await page.waitForTimeout(300);
await page.goto(`${BASE}/#/favorites`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('06-favorites.png');

// 8. 英文 + 深色首页
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.selectOption('.lang-select', 'en');
await page.waitForTimeout(600);
await shot('07-home-en-dark.png');

console.log('home rows:', await page.locator('.item-row').count());
await browser.close();

if (errors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of errors.slice(0, 10)) console.log(' -', e);
  process.exit(1);
}
console.log('UI SMOKE OK');
