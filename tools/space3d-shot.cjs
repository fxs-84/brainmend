// 抓取「太空3D飞行」v2（GLB 玩家舰 + 敌舰 + 射击）实机画面
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
  // 等玩家舰 + 敌舰 GLB 都加载完
  await p.waitForFunction(() => window.__space3d.shipLoaded && window.__space3d.spawner.enemyTpl, null, { timeout: 20000 });
  console.log('engine boot: ship + enemy model loaded');
  // rAF 喂陀螺仪：yaw 12 pitch 4，让飞船压弯离中心
  await p.evaluate(() => {
    window.__drive = { yaw: 12, pitch: 4 };
    const loop = () => {
      window.D = { yaw: window.__drive.yaw, pitch: window.__drive.pitch, roll: 0 };
      window.updateFromGyroscope(window.D);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // 构图：关自然生成，手动摆敌舰/陨石/门/水晶（弹丸自动飞，命中会自然出爆炸）
  // 注意：yaw 12/pitch 4 → 船在 (≈4, ≈1)，敌舰/陨石避开船的弹道线，否则撞船触发红闪毁截图
  await p.evaluate(() => {
    const s = window.__space3d;
    s.spawner.autoSpawn = false;
    s.spawner.clearAll();
    s.debugSpawnEnemy(-2.5, 1, -16);
    s.debugSpawnEnemy(-5, -1.5, -28);
    s.debugSpawnMeteor(-6.5, 3, -12);        // 近景陨石（左舷擦过）
    s.debugSpawnMeteor(7, -2.5, -20);
    s.debugSpawnMeteor(-1.5, 4, -26);
    s.debugSpawnMeteor(0.5, -3.5, -17);
    s.debugSpawnMeteor(-8, -3, -32);
    s.debugSpawnGate(6, 3, -38);
    s.debugSpawnCrystal(-1.5, 2.5, -10);
  });
  await p.waitForTimeout(900);               // 弹丸飞一阵（可能已击出爆炸）
  // 保证有一团爆炸在画面里（闪光存活 0.55s，掐在截图前 0.22s 引爆）
  await p.evaluate(() => window.__space3d.debugExplode(-0.5, 0.8, -9));
  await p.waitForTimeout(220);
  const info = await p.evaluate(() => ({
    shipX: +window.__space3d.shipX.toFixed(2),
    objs: window.__space3d.objCount,
    bullets: window.__space3d.bullets,
    kills: window.__space3d.kills,
  }));
  console.log('shot1 state:', JSON.stringify(info));
  await p.screenshot({ path: 'screenshots/space3d-v2-1.png' });
  // 第二张：反打方向 + 再爆一团
  await p.evaluate(() => {
    window.__drive.yaw = -10; window.__drive.pitch = -3;
    window.__space3d.debugSpawnEnemy(1, 0.5, -18);
    window.__space3d.debugExplode(2, 0.2, -11);
  });
  await p.waitForTimeout(1400);
  await p.evaluate(() => window.__space3d.debugExplode(-2, 1, -10));
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'screenshots/space3d-v2-2.png' });
  console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
  await b.close();
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
