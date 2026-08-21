// VOR 开火纪律验证：必须真正对准并保持住才射击
// 证明方式：钩住 scene.playerShoot，在【每次真实发射的瞬间】记录 |敌舰.x - 飞船.x|
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PE: ' + e.message));

  await page.goto('http://localhost:4399/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (window.state) window.state.useGyroscope = true;
    document.querySelector('#game-select-panel .mode-btn[data-mode="vor"]').click();
    document.getElementById('start-game-btn').click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.gameEngine.invincibleTime = 1e9; });

  const params = await page.evaluate(() => ({
    alignTh: window.gameEngine.currentScene.alignmentThreshold,
    holdTime: window.gameEngine.currentScene.requiredHoldTime,
    shootInterval: window.gameEngine.currentScene.shootInterval,
    autoFireInterval: window.gameEngine.autoFireInterval,
  }));
  console.log('锁定参数:', JSON.stringify(params));

  // 反解 yaw 追踪最近敌舰（模拟一个尽力对准的患者），记录每次真实发射时的偏差
  const res = await page.evaluate(async () => {
    const e = window.gameEngine, scn = e.currentScene;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const fires = [];                    // 每次真实发射时的 |dx| 与两次发射间隔
    let lastFireT = null;
    const gaps = [];

    const orig = scn.playerShoot.bind(scn);
    scn.playerShoot = function (x, y) {
      const before = e.bullets.length;
      const r = orig(x, y);
      if (e.bullets.length > before) {             // 真的发射了
        const tg = scn.targetEnemy;
        fires.push(tg ? Math.abs(tg.x - e.player.x) : 999);
        const now = e.gameTime;
        if (lastFireT !== null) gaps.push(now - lastFireT);
        lastFireT = now;
      }
      return r;
    };

    const t0 = e.gameTime;
    for (let t = 0; t < 1600; t++) {
      const a = e.enemies.filter(x => x.active && x.y > 0 && x.y < scn.playerY - 0.02)
                         .sort((p, q) => q.y - p.y);
      const tx = a.length ? a[0].x : 0.5;
      const yaw = Math.max(-20, Math.min(20, (tx - 0.5) / 0.32 * 20));
      for (let i = 0; i < 3; i++) window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
      if (e.state !== 'playing') break;
      await sleep(16);
    }
    const dur = e.gameTime - t0;
    const maxDx = fires.length ? Math.max(...fires) : -1;
    const volleysPerSec = fires.length / dur;
    const minGap = gaps.length ? Math.min(...gaps) : -1;
    return {
      volleys: fires.length, dur: +dur.toFixed(1),
      volleysPerSec: +volleysPerSec.toFixed(2),
      maxDxAtFire: +maxDx.toFixed(4),
      minGapBetweenVolleys: +minGap.toFixed(3),
      score: e.score,
    };
  });
  console.log('开火纪律:', JSON.stringify(res));

  await page.evaluate(() => { const c = window.gameEngine.canvas; c.style.position='fixed';c.style.left='0';c.style.top='0';c.style.zIndex='999999'; });
  await page.screenshot({ path: 'screenshots/vor-fire-discipline.png' });

  const A = [];
  const add = (n, ok, x = '') => A.push({ n, ok, x });
  add('锁定阈值维持原设计 0.02', params.alignTh === 0.02, 'th=' + params.alignTh);
  add('锁定保持时间维持原设计 0.5s', params.holdTime === 0.5, 'hold=' + params.holdTime);
  add('确实发生了发射', res.volleys > 0, 'volleys=' + res.volleys);
  add('★每次发射时都真正对准了(|dx| < 0.02)', res.maxDxAtFire >= 0 && res.maxDxAtFire < 0.02,
      '最大偏差=' + res.maxDxAtFire);
  add('两次齐射间隔 ≥ 0.5s(必须重新对准)', res.minGapBetweenVolleys >= 0.5,
      '最小间隔=' + res.minGapBetweenVolleys + 's');
  add('齐射频率 ≤ 2/秒(不再连发)', res.volleysPerSec <= 2,
      res.volleysPerSec + '/s');
  add('仍能击毁敌舰得分', res.score > 0, 'score=' + res.score);
  add('无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n=== 断言结果 ===');
  let bad = 0;
  for (const a of A) { console.log((a.ok ? '  PASS  ' : '  FAIL  ') + a.n + (a.x ? '  [' + a.x + ']' : '')); if (!a.ok) bad++; }
  console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过 (' + A.length + ')');
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
