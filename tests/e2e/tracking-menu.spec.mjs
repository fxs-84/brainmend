// 头动追踪二级菜单验证: 首页→头动追踪→大卡片菜单→进入模式→返回菜单; deep-link 直达
// 用法: node tests/e2e/tracking-menu.spec.mjs (自起静态服务器, 端口 8794)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = 8794;

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
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

// 1. 首页 → 头动追踪 → 应显示大卡片菜单, 不显示侧边栏
await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForSelector('#page2-tracking', { timeout: 10000 });
await page.click('#page2-tracking');
await page.waitForTimeout(600);
const tmVisible = await page.evaluate(() => {
  const tm = document.getElementById('tracking-menu');
  return tm && getComputedStyle(tm).display === 'flex';
});
check('点击头动追踪后显示大卡片菜单', tmVisible);
const cardCount = await page.locator('#tracking-menu .tm-card').count();
check('菜单有 6 张卡片', cardCount === 6);
const spHidden = await page.evaluate(() => {
  const sp = document.getElementById('side-panel');
  return getComputedStyle(sp).display === 'none';
});
check('侧边栏未显示', spHidden);
await page.screenshot({ path: path.join(ROOT, 'screenshots/tm-menu.png') });

// 2. 图标 canvas 已绘制 (非空白)
const iconsDrawn = await page.evaluate(() => {
  const ids = ['tm-icon-coordination', 'tm-icon-position', 'tm-icon-vv', 'tm-icon-vc', 'tm-icon-cc'];
  return ids.every(id => {
    const c = document.getElementById(id);
    if (!c) return false;
    const d = c.getContext('2d').getImageData(0, 0, 96, 96).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
});
check('5 个标靶图标 canvas 已绘制', iconsDrawn);

// 3. 点击协调性检查 → 进入主界面: 菜单隐藏, 侧边栏显示, view-coordination 显示
await page.click('.tm-card[data-tmode="coordination"]');
await page.waitForTimeout(800);
const st1 = await page.evaluate(() => ({
  tm: getComputedStyle(document.getElementById('tracking-menu')).display,
  sp: getComputedStyle(document.getElementById('side-panel')).display,
  vc: document.getElementById('view-coordination').style.display,
  vms: document.getElementById('view-mode-select').style.display
}));
check('进入协调性: 菜单隐藏', st1.tm === 'none');
check('进入协调性: 侧边栏显示', st1.sp === 'flex');
check('进入协调性: view-coordination 显示', st1.vc !== 'none');
check('进入协调性: view-mode-select 隐藏', st1.vms === 'none');
await page.screenshot({ path: path.join(ROOT, 'screenshots/tm-coordination.png') });

// 4. ← 返回 → 回到大卡片菜单
await page.click('#back-btn-coordination');
await page.waitForTimeout(400);
const tmBack = await page.evaluate(() => getComputedStyle(document.getElementById('tracking-menu')).display);
check('返回后回到大卡片菜单', tmBack === 'flex');

// 5. 进入棋盘协调 (验证另一类模式)
await page.click('.tm-card[data-tmode="coordChecker"]');
await page.waitForTimeout(800);
const ccShown = await page.evaluate(() => document.getElementById('view-coord-checker').style.display !== 'none');
check('进入棋盘协调: view-coord-checker 显示', ccShown);
await page.screenshot({ path: path.join(ROOT, 'screenshots/tm-coordchecker.png') });

// 6. 菜单 → 返回首页
await page.click('#back-btn-cc');
await page.waitForTimeout(300);
await page.click('#tm-back-home');
await page.waitForTimeout(400);
const homeBack = await page.evaluate(() => ({
  p2: getComputedStyle(document.getElementById('page2')).display,
  tm: getComputedStyle(document.getElementById('tracking-menu')).display
}));
check('返回首页: page2 显示且菜单隐藏', homeBack.p2 === 'flex' && homeBack.tm === 'none');

// 7. 脑科学游戏 → 游戏选择面板的 ← 返回 → 应回到大卡片菜单
await page.click('#page2-tracking');
await page.waitForTimeout(400);
await page.click('.tm-card[data-tmode="game"]');
await page.waitForTimeout(1200);
const panelShown = await page.evaluate(() => {
  const p = document.getElementById('game-select-panel');
  return !!p && p.style.display !== 'none' && !!p.offsetParent;
});
check('进入脑科学游戏: 游戏选择面板显示', panelShown);
await page.click('#game-back-to-menu');
await page.waitForTimeout(400);
const tmAfterGame = await page.evaluate(() => getComputedStyle(document.getElementById('tracking-menu')).display);
check('游戏面板返回后回到大卡片菜单', tmAfterGame === 'flex');
await page.screenshot({ path: path.join(ROOT, 'screenshots/tm-menu-after-game.png') });

// 8. deep-link 直达位置觉, 不经过菜单
const page2b = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page2b.goto(`http://localhost:${PORT}/index.html?mode=tracking&test=position`);
await page2b.waitForTimeout(4000);
const dl = await page2b.evaluate(() => ({
  tm: getComputedStyle(document.getElementById('tracking-menu')).display,
  vp: document.getElementById('view-position').style.display,
  vms: document.getElementById('view-mode-select').style.display,
  sp: getComputedStyle(document.getElementById('side-panel')).display,
  active: (document.querySelector('#view-mode-select .mode-btn.active') || {}).textContent
}));
check('deep-link: 菜单不显示', dl.tm === 'none');
check('deep-link: view-position 显示', dl.vp !== 'none');
check('deep-link: 侧边栏显示', dl.sp === 'flex');
await page2b.screenshot({ path: path.join(ROOT, 'screenshots/tm-deeplink-position.png') });

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
const realErrors = errors.filter(e => !/favicon|net::ERR_/i.test(e));
if (realErrors.length) console.log('页面错误:\n' + realErrors.slice(0, 10).join('\n'));

await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
