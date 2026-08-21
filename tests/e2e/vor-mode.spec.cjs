// VOR 模式 E2E 验证：注入陀螺仪，断言飞船屏幕固定 + 画面随头动
const { chromium } = require('playwright');

const URL = 'http://localhost:4399/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // 1. VOR 按钮存在
  await page.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await page.waitForTimeout(1500);
  const btn = await page.$('#game-select-panel .mode-btn[data-mode="vor"]');
  console.log('1) VOR 模式按钮存在:', !!btn);
  if (!btn) throw new Error('VOR 按钮未渲染');
  console.log('   按钮文案:', (await btn.textContent()).trim());

  // 2. 打开选择面板并启动
  await page.evaluate(() => {
    const p = document.getElementById('game-select-panel');
    if (p) { p.style.display = 'block'; p.style.zIndex = '99999'; }
    // 打开陀螺仪输入通道
    if (window.state) window.state.useGyroscope = true;
  });
  await page.evaluate(() => { document.querySelector('#game-select-panel .mode-btn[data-mode="vor"]').click(); document.getElementById('start-game-btn').click(); });
  await page.waitForTimeout(800);

  // 3. 持续注入 yaw，采样引擎内部状态
  const feed = (yaw) => page.evaluate((y) => {
    for (let i = 0; i < 12; i++) window.updateFromGyroscope({ yaw: y, pitch: 0, roll: 0 });
  }, yaw);

  const probe = () => page.evaluate(() => {
    const e = window.gameEngine || null;
    if (!e) return { found: false, keys: Object.keys(window).filter(k => /engine|game|ui/i.test(k)) };
    return {
      found: true, state: e.state, vor: e._vorMode, shooting: e.isShootingMode,
      shift: +(e._worldShift || 0).toFixed(4),
      px: +e.player.x.toFixed(4), py: +e.player.y.toFixed(4),
      playerY: e.currentScene && e.currentScene.playerY,
      sceneVor: e.currentScene && e.currentScene._vorMode,
      stats: e._vorStats, enemies: e.enemies.length,
    };
  });

  let p0 = await probe();
  if (!p0.found) { console.log('引擎句柄未找到:', p0.keys); }
  console.log('2) 初始:', JSON.stringify(p0));

  const samples = [];
  for (const yaw of [0, 10, 20, 30, 0, -10, -20]) {
    for (let k = 0; k < 20; k++) { await feed(yaw); await page.waitForTimeout(16); }
    const s = await probe();
    samples.push({ yaw, ...s });
    console.log(`   yaw=${String(yaw).padStart(4)}  shift=${s.shift}  player.x=${s.px}  turns=${s.stats && s.stats.turns}  maxDeg=${s.stats && s.stats.maxDeg && s.stats.maxDeg.toFixed(1)}`);
  }

  // 得分测试期间设为无敌：把「瞄准→锁定→击毁」与「生存随机性」解耦，消除 flaky
  await page.evaluate(() => { window.gameEngine.invincibleTime = 1e9; window.gameEngine.health = 999; });
  // 确定性瞄准：反解 yaw 使飞船世界坐标追踪最近敌舰 (player.x = 0.5 + (yaw/20)*0.32)
  let maxEnemies = 0, maxScore = 0, kills = 0;
  for (let t = 0; t < 600; t++) {
    const r = await page.evaluate(() => {
      const e = window.gameEngine;
      const alive = e.enemies.filter(x => x.active && x.y > -0.05 && x.y < 0.7);
      alive.sort((a, b) => b.y - a.y);
      const tx = alive.length ? alive[0].x : 0.5;
      const yaw = Math.max(-20, Math.min(20, (tx - 0.5) / 0.32 * 20));
      for (let i = 0; i < 3; i++) window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
      return { e: e.enemies.length, sc: e.score, st: e.state, k: e.enemiesDestroyed || 0 };
    });
    maxEnemies = Math.max(maxEnemies, r.e); maxScore = Math.max(maxScore, r.sc); kills = Math.max(kills, r.k);
    if (t % 200 === 0) console.log('   追踪瞄准 t=' + t + ' enemies=' + r.e + ' score=' + r.sc + ' state=' + r.st);
    if (r.st !== 'playing') { console.log('   (游戏结束于 t=' + t + ')'); break; }
    await page.waitForTimeout(16);
  }
  console.log('3) 玩法：峰值敌舰=' + maxEnemies + ' 得分=' + maxScore);
  await page.screenshot({ path: 'screenshots/vor-mode-e2e.png' });

  // 4. 断言
  const get = y => samples.find(s => s.yaw === y);
  const asserts = [];
  const A = (name, ok, extra = '') => { asserts.push({ name, ok, extra }); };

  A('_vorMode 已开启', p0.vor === true);
  A('isShootingMode 保持开启（复用射击逻辑）', p0.shooting === true);
  A('场景 playerY 被设为 0.88', p0.playerY === 0.88);
  A('yaw=0 时画面无偏移', Math.abs(get(0).shift) < 0.02, `shift=${get(0).shift}`);
  A('yaw=+20 画面向左移(shift<0)', get(20).shift < -0.25, `shift=${get(20).shift}`);
  A('yaw=-20 画面向右移(shift>0)', get(-20).shift > 0.25, `shift=${get(-20).shift}`);
  A('±20° 达到满量程 0.32', Math.abs(Math.abs(get(20).shift) - 0.32) < 0.02);
  A('yaw=30 被钳制在 ±20 量程内(不超 0.32)', Math.abs(get(30).shift) <= 0.325, `shift=${get(30).shift}`);
  A('飞船世界坐标随头动(左右不同)', Math.abs(get(20).px - get(-20).px) > 0.5, `${get(20).px} vs ${get(-20).px}`);
  A('飞船纵向锁定 0.88 不动', samples.every(s => Math.abs(s.py - 0.88) < 1e-6));
  A('转头(方向反转)次数被统计', get(-20).stats.turns >= 1, `turns=${get(-20).stats.turns}`);
  A('峰值角度被记录 ≈20°', get(-20).stats.maxDeg >= 19, `maxDeg=${get(-20).stats.maxDeg}`);
  A('敌舰正常生成', maxEnemies > 0, 'max=' + maxEnemies);
  A('可击毁敌舰并得分', maxScore > 0, 'score=' + maxScore);
  A('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n=== 断言结果 ===');
  let bad = 0;
  for (const a of asserts) {
    console.log((a.ok ? '  PASS  ' : '  FAIL  ') + a.name + (a.extra ? '   [' + a.extra + ']' : ''));
    if (!a.ok) bad++;
  }
  console.log(bad === 0 ? '\n全部通过 (' + asserts.length + ')' : '\n失败 ' + bad + ' 项');
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
