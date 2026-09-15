// 游戏卡片选择面板验证:
//  1) 进入脑科学游戏 → 显示 7 张截图卡片
//  2) 点太空隧道卡 → 直接进入游戏
//  3) 局中退出 → 回到卡片面板
//  4) 公路赛车卡两步流程: 展开难度 → 点开始, 难度配置生效
//  5) 返回按钮 → 回到头动追踪大卡片菜单
// 用法: node tests/e2e/game-cards.spec.mjs (自起静态服务器, 端口 8797)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = 8797;

const server = spawn(process.execPath, ['tests/static-server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe'
});
await new Promise(r => server.stdout.once('data', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForSelector('#page2-tracking', { timeout: 15000 });
await page.click('#page2-tracking');
await page.waitForTimeout(500);
await page.click('.tm-card[data-tmode="game"]');
await page.waitForTimeout(1500);

// 1. 卡片面板显示
const st1 = await page.evaluate(() => ({
  gc: getComputedStyle(document.getElementById('game-cards')).display,
  cards: document.querySelectorAll('#gc-grid .gc-card').length,
  imgs: Array.from(document.querySelectorAll('#gc-grid .gc-card img')).filter(i => i.complete && i.naturalWidth > 0).length
}));
check('卡片面板显示', st1.gc === 'flex');
check('12 张卡片', st1.cards === 12, 'cards=' + st1.cards);
check('截图全部加载', st1.imgs === 12, 'loaded=' + st1.imgs);
await page.screenshot({ path: path.join(ROOT, 'screenshots/game-cards.png') });

// 1.5 注入类模式按钮已被各 integrate.js 注入 (5 原生 + 5 注入, 实际可能更多)
const injected = await page.evaluate(() => {
  const modes = Array.from(document.querySelectorAll('#game-select-panel .mode-btn')).map(b => b.dataset.mode);
  return { count: modes.length, hasAll: ['vorch1', 'vorch2', 'runner', 'mole', 'road3d'].every(m => modes.includes(m)) };
});
check('注入类模式按钮已就位', injected.count >= 10 && injected.hasAll, JSON.stringify(injected));

// 2. 点太空隧道卡 → 直接开始
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#gc-grid .gc-card'));
  const t = cards.find(c => c.textContent.includes('太空隧道'));
  t.click();
});
await page.waitForTimeout(3000);
const st2 = await page.evaluate(() => ({
  gc: getComputedStyle(document.getElementById('game-cards')).display,
  state: String(window.gameEngine && window.gameEngine.state).toLowerCase(),
  scene: window.gameEngine && window.gameEngine.currentScene && window.gameEngine.currentScene.sceneType
}));
check('点卡片后进入游戏', st2.gc === 'none' && st2.state === 'playing', 'state=' + st2.state + ' scene=' + st2.scene);

// 3. 局中真实退出 (view-game 返回按钮) → 拦截器回大卡片菜单 → 再进脑科学游戏
await page.evaluate(() => document.getElementById('back-btn-game').click());
await page.waitForTimeout(600);
const tmMid = await page.evaluate(() => getComputedStyle(document.getElementById('tracking-menu')).display);
check('局中返回回到头动追踪菜单', tmMid === 'flex');
await page.click('.tm-card[data-tmode="game"]');
await page.waitForTimeout(800);
const st3 = await page.evaluate(() => getComputedStyle(document.getElementById('game-cards')).display);
check('退出后回到卡片面板', st3 === 'flex');

// 4. 公路赛车 (2D) 直接开始; 公路赛车 3D 两步流程 (难度属于 3D 引擎)
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#gc-grid .gc-card'));
  cards.find(c => c.textContent.includes('公路赛车') && !c.textContent.includes('3D')).click();
});
await page.waitForTimeout(2500);
const st4a = await page.evaluate(() => ({
  state: String(window.gameEngine && window.gameEngine.state).toLowerCase(),
  gc: getComputedStyle(document.getElementById('game-cards')).display
}));
check('2D 公路赛车点卡直接开始', st4a.state === 'playing' && st4a.gc === 'none', 'state=' + st4a.state);
await page.evaluate(() => document.getElementById('back-btn-game').click());
await page.waitForTimeout(600);
await page.click('.tm-card[data-tmode="game"]');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#gc-grid .gc-card'));
  const r = cards.find(c => c.textContent.includes('公路赛车 3D'));
  r.click(); // 第一步: 展开
});
await page.waitForTimeout(300);
const expanded = await page.evaluate(() => !!document.querySelector('#gc-grid .gc-card.expanded .gc-diff'));
check('3D 公路卡展开难度选项', expanded);
await page.screenshot({ path: path.join(ROOT, 'screenshots/game-cards-road.png') });
await page.click('#gc-grid .gc-card.expanded .gc-diff [data-diff="easy"]');
await page.waitForTimeout(2500);
const st4 = await page.evaluate(() => ({
  gc: getComputedStyle(document.getElementById('game-cards')).display,
  easy: window._easyMode === true,
  cfg: window._roadSpeedConfig && window._roadSpeedConfig.min
}));
check('3D 选难度后启动且配置生效', st4.gc === 'none' && st4.easy && st4.cfg === 0.6, 'easy=' + st4.easy + ' min=' + st4.cfg);

// 5. 注入类游戏: 先真实退出公路局 → 再点海风球道卡 → integrate.js 接管启动
await page.evaluate(() => document.getElementById('back-btn-game').click());
await page.waitForTimeout(600);
await page.click('.tm-card[data-tmode="game"]');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#gc-grid .gc-card'));
  cards.find(c => c.textContent.includes('海风球道')).click();
});
await page.waitForTimeout(2000);
const stR = await page.evaluate(() => ({
  gc: getComputedStyle(document.getElementById('game-cards')).display,
  mode: window.gameUI && window.gameUI.selectedMode
}));
check('注入类游戏卡片可启动 (海风球道)', stR.gc === 'none' && stR.mode === 'runner', 'mode=' + stR.mode);

// 6. 返回 → 头动追踪大卡片菜单 (runner 局仍在跑, 直接拉起面板测返回)
await page.evaluate(() => { document.getElementById('game-select-panel').style.display = 'block'; });
await page.waitForTimeout(400);
await page.click('#gc-back');
await page.waitForTimeout(500);
const st5 = await page.evaluate(() => ({
  gc: getComputedStyle(document.getElementById('game-cards')).display,
  tm: getComputedStyle(document.getElementById('tracking-menu')).display
}));
check('返回后回到头动追踪菜单', st5.gc === 'none' && st5.tm === 'flex');

const realErrors = errors.filter(e => !/favicon|net::ERR_/i.test(e));
check('无页面 JS 错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
