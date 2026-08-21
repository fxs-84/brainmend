// 回归：原「射击模式」不受 VOR 补丁影响
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PE: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CE: ' + m.text()); });
  await p.goto('http://localhost:4399/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  await p.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await p.waitForTimeout(1200);
  await p.evaluate(() => { if (window.state) window.state.useGyroscope = true;
    document.querySelector('#game-select-panel .mode-btn[data-mode="shooting"]').click();
    document.getElementById('start-game-btn').click(); });
  await p.waitForTimeout(600);
  const feed = y => p.evaluate(v => { for (let i = 0; i < 10; i++) window.updateFromGyroscope({ yaw: v, pitch: 0, roll: 0 }); }, y);
  const probe = () => p.evaluate(() => { const e = window.gameEngine; return {
    vor: e._vorMode, shooting: e.isShootingMode, py: +e.player.y.toFixed(3),
    px: +e.player.x.toFixed(3), shift: e._worldShift, enemies: e.enemies.length, score: e.score, state: e.state }; });
  const p0 = await probe();
  const s = {};
  for (const y of [0, 25, -25]) { for (let t = 0; t < 60; t++) { await feed(y); await p.waitForTimeout(14); } s[y] = await probe(); }
  // 得分测试期间设为无敌：把「瞄准→锁定→击毁」与「生存随机性」解耦，消除 flaky
  await p.evaluate(() => { window.gameEngine.invincibleTime = 1e9; });
  // 追踪瞄准验证仍能得分
  let score = 0, maxEnemies = Math.max(s[0].enemies, s[25].enemies, s[-25].enemies);
  for (let t = 0; t < 400; t++) {
    const r = await p.evaluate(() => { const e = window.gameEngine;
      const a = e.enemies.filter(x => x.active && x.y > -.05 && x.y < .7).sort((x, y) => y.y - x.y);
      const tx = a.length ? a[0].x : .5;
      const yaw = Math.max(-35, Math.min(35, (tx - .5) * 70));
      for (let i = 0; i < 3; i++) window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
      return { sc: e.score, st: e.state, en: e.enemies.length }; });
    score = Math.max(score, r.sc); maxEnemies = Math.max(maxEnemies, r.en); if (r.st !== 'playing') break; await p.waitForTimeout(16);
  }
  await p.evaluate(() => { const c = window.gameEngine.canvas; c.style.position='fixed';c.style.left='0';c.style.top='0';c.style.zIndex='999999'; });
  await p.screenshot({ path: 'screenshots/shooting-regression-e2e.png' });
  const A = [];
  const add = (n, ok, x = '') => A.push({ n, ok, x });
  add('_vorMode 保持关闭', p0.vor === false || p0.vor === undefined, 'vor=' + p0.vor);
  add('isShootingMode 开启', p0.shooting === true);
  add('飞船 y 仍为 0.95（原行为）', p0.py === 0.95, 'py=' + p0.py);
  add('_worldShift 未被使用(0)', !s[25].shift, 'shift=' + s[25].shift);
  add('飞船 x 随头动左右移动（原行为）', Math.abs(s[25].px - s[-25].px) > 0.5, s[25].px + ' vs ' + s[-25].px);
  add('yaw=0 飞船回中', Math.abs(s[0].px - .5) < .05, 'px=' + s[0].px);
  add('敌舰生成', maxEnemies > 0, 'max=' + maxEnemies);
  add('可得分', score > 0, 'score=' + score);
  add('无 JS 错误', errs.length === 0, errs.slice(0, 2).join(' | '));
  let bad = 0;
  console.log('=== 原射击模式回归 ===');
  for (const a of A) { console.log((a.ok ? '  PASS  ' : '  FAIL  ') + a.n + (a.x ? '  [' + a.x + ']' : '')); if (!a.ok) bad++; }
  console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过 (' + A.length + ')');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
