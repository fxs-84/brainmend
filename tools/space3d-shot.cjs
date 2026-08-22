// 抓取重写后「太空3D飞行」（Three.js 真3D）实机画面
// 真实面板流程：mode-btn[game] → scene-btn[space3d] → start-game-btn → 难度浮层（evaluate DOM 点击）
// 用法：先起静态服务器（PORT=4399 node tests/static-server.mjs），再 node tools/space3d-shot.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PE: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CE: ' + m.text()); });
  // keepbloom=1：SwiftShader 软渲染 FPS 低会触发自动降级关泛光，截图时强制保留
  await p.goto('http://localhost:4399/index.html?keepbloom=1', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    if (window.state) window.state.useGyroscope = true;
    document.querySelector('.scene-btn[data-scene="space3d"]').click();
    document.getElementById('start-game-btn').click();
  });
  await p.waitForTimeout(600);
  // 难度弹窗：data-d 选择器（直接 DOM 点击，Playwright 点击会被拦）
  await p.evaluate(() => { const b = document.querySelector('button[data-d="normal"]'); if (b) b.click(); });
  await p.waitForFunction(() => window.__space3d, null, { timeout: 10000 });
  console.log('engine boot: __space3d ok');
  // rAF 喂陀螺仪：yaw 14 pitch 5，让飞船压弯离中心，画面更有代表性
  await p.evaluate(() => {
    window.__drive = { yaw: 14, pitch: 5 };
    const loop = () => {
      window.D = { yaw: window.__drive.yaw, pitch: window.__drive.pitch, roll: 0 };
      window.updateFromGyroscope(window.D);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await p.waitForTimeout(3500);
  const info = await p.evaluate(() => ({
    shipX: +window.__space3d.shipX.toFixed(2),
    shipY: +window.__space3d.shipY.toFixed(2),
    speed: +window.__space3d.speed.toFixed(1),
    objs: window.__space3d.objCount,
    state: window.__space3d.state,
  }));
  console.log('state:', JSON.stringify(info));
  await p.screenshot({ path: 'screenshots/space3d-after-1.png' });
  // 换个姿态再抓一张：反打方向 + 低头
  await p.evaluate(() => { window.__drive.yaw = -10; window.__drive.pitch = -3; });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'screenshots/space3d-after-2.png' });
  console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
  await b.close();
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
