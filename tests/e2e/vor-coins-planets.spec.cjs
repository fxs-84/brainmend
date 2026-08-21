// 金币收集率 + 星球固定 验证
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

  // --- 测试 1: 金币追踪收集率 ---
  // 反解 yaw 让飞船世界坐标追踪最近金币。
  // 注意：吃到的金币随后会被 updateObstacles 清出数组，事后 filter(isCollected) 数不到，
  // 必须在 scene.onCoinCollect 上挂钩子实时计数。
  const res = await page.evaluate(async () => {
    const e = window.gameEngine;
    const seen = new Set();
    let spawned = 0, collected = 0;
    const orig = e.currentScene.onCoinCollect.bind(e.currentScene);
    e.currentScene.onCoinCollect = (c, eng) => { collected++; return orig(c, eng); };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let t = 0; t < 1400; t++) {
      const coins = e.obstacles.filter(o => o.type === 'coin' && !o.isCollected);
      for (const c of coins) { if (!seen.has(c)) { seen.add(c); spawned++; } }
      // 优先追金币；没有金币就追敌舰
      const targets = coins.filter(c => c.y < 0.9).sort((a, b) => b.y - a.y);
      let tx = 0.5;
      if (targets.length) tx = targets[0].x;
      else {
        const en = e.enemies.filter(x => x.active && x.y > -0.05 && x.y < 0.7).sort((a, b) => b.y - a.y);
        if (en.length) tx = en[0].x;
      }
      const yaw = Math.max(-20, Math.min(20, (tx - 0.5) / 0.32 * 20));
      for (let i = 0; i < 3; i++) window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
      if (e.state !== 'playing') break;
      await sleep(16);
    }
    return { spawned, collected, score: e.score, state: e.state };
  });
  console.log('金币测试:', JSON.stringify(res));

  // --- 测试 2: 星球在头动时屏幕位置不变 ---
  const feed = y => page.evaluate(v => { for (let i = 0; i < 10; i++) window.updateFromGyroscope({ yaw: v, pitch: 0, roll: 0 }); }, y);
  // 采样太阳所在区域（右上 88%,12%）的像素，比较 yaw=0 与 yaw=20 时是否一致
  const sample = () => page.evaluate(() => {
    const c = window.gameEngine.canvas, x = Math.round(c.width * 0.88), y = Math.round(c.height * 0.12);
    const d = c.getContext('2d').getImageData(x - 25, y - 25, 50, 50).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.6 + d[i + 1] * 0.3 + d[i + 2] * 0.1;
    return Math.round(sum / (d.length / 4));
  });
  for (let t = 0; t < 60; t++) { await feed(0); await page.waitForTimeout(14); }
  const sun0 = await sample();
  for (let t = 0; t < 120; t++) { await feed(20); await page.waitForTimeout(14); }
  const sun20 = await sample();
  for (let t = 0; t < 120; t++) { await feed(-20); await page.waitForTimeout(14); }
  const sunN20 = await sample();
  console.log(`太阳区域亮度: yaw=0 → ${sun0} | yaw=+20 → ${sun20} | yaw=-20 → ${sunN20}`);

  await page.evaluate(() => { const c = window.gameEngine.canvas; c.style.position='fixed';c.style.left='0';c.style.top='0';c.style.zIndex='999999'; });
  await page.screenshot({ path: 'screenshots/vor-coins-planets.png' });

  const A = [];
  const add = (n, ok, x = '') => A.push({ n, ok, x });
  add('金币有生成', res.spawned > 0, 'spawned=' + res.spawned);
  add('对准金币后能吃到（收集数 > 0）', res.collected > 0, 'collected=' + res.collected);
  add('金币收集率 ≥ 60%', res.spawned > 0 && res.collected / res.spawned >= 0.6,
      `${res.collected}/${res.spawned} = ${res.spawned ? (100 * res.collected / res.spawned).toFixed(0) : 0}%`);
  add('太阳右转 20° 时位置不变', Math.abs(sun20 - sun0) < 12, `Δ=${Math.abs(sun20 - sun0)}`);
  add('太阳左转 20° 时位置不变', Math.abs(sunN20 - sun0) < 12, `Δ=${Math.abs(sunN20 - sun0)}`);
  add('无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n=== 断言结果 ===');
  let bad = 0;
  for (const a of A) { console.log((a.ok ? '  PASS  ' : '  FAIL  ') + a.n + (a.x ? '  [' + a.x + ']' : '')); if (!a.ok) bad++; }
  console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过 (' + A.length + ')');
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
