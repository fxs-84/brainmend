// VOR 陀螺仪基线漂移检测 E2E：
//   引擎主包内置 yaw 偏漂学习器（rate<1°/s 且俯仰/滚转稳定时学习偏漂速率并补偿）。
//   本测试注入模拟 gyro 输入，验证：
//     A. 零输入时基线化 yaw / worldShift 不随时间漂移
//     B. 恒定 yaw 输入收敛后稳定（无抖动/漂移）
//     C. 慢速基线漂移（0.5°/s）被补偿 —— 校正后 yaw 远小于原始漂移量且最终锁定
//     D. 漂移补偿不会吞掉真实快速转头
// 风格与 vor-mode.spec.cjs 一致；服务：python -m http.server 4399
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

  // 进入 VOR 模式（与 vor-mode.spec.cjs 同一套启动流程）
  await page.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await page.waitForTimeout(1500);
  const btn = await page.$('#game-select-panel .mode-btn[data-mode="vor"]');
  if (!btn) throw new Error('VOR 按钮未渲染');
  await page.evaluate(() => {
    const p = document.getElementById('game-select-panel');
    if (p) { p.style.display = 'block'; p.style.zIndex = '99999'; }
    if (window.state) window.state.useGyroscope = true;
  });
  await page.evaluate(() => { document.querySelector('#game-select-panel .mode-btn[data-mode="vor"]').click(); document.getElementById('start-game-btn').click(); });
  await page.waitForTimeout(800);
  // 无敌：把「漂移检测」与「生存随机性」解耦
  await page.evaluate(() => { window.gameEngine.invincibleTime = 1e9; window.gameEngine.health = 999; });

  // pitch 恒为 1：保持 hasRecentGyroData() 为真（yaw 经死区归零时输入通道不掉回鼠标），
  // 且 pitch 样本间无变化（Δ=0 < 0.3° 阈值）不干扰偏漂学习。
  const feed = (yaw) => page.evaluate((y) => window.updateFromGyroscope({ yaw: y, pitch: 1, roll: 0 }), yaw);
  const probe = () => page.evaluate(() => {
    const e = window.gameEngine, s = window.state;
    return {
      state: e.state, mode: s.mode,
      stateYaw: +s.yaw.toFixed(3),                       // 基线化+死区后的 yaw
      rawDeg: +(e._vorRawDeg || 0).toFixed(3),           // 引擎侧看到的 yaw
      shift: +(e._worldShift || 0).toFixed(4),
    };
  });

  const p0 = await probe();
  console.log('0) 初始:', JSON.stringify(p0));
  if (p0.state !== 'playing') throw new Error('未进入 PLAYING: ' + p0.state);

  // 逐样本实时喂入（学习者依赖 performance.now() 的真实间隔，不能在一个 evaluate 里连发）
  async function runPhase(label, durMs, yawFn, sampleEveryMs = 100) {
    const samples = [];
    const t0 = Date.now();
    let lastSample = 0;
    while (Date.now() - t0 < durMs) {
      const t = (Date.now() - t0) / 1000;
      await feed(yawFn(t));
      if (Date.now() - t0 - lastSample >= sampleEveryMs) {
        samples.push(await probe());
        lastSample = Date.now() - t0;
      }
      await page.waitForTimeout(45);
    }
    console.log(`   [${label}] ${samples.length} 样本, 末态:`, JSON.stringify(samples[samples.length - 1]));
    return samples;
  }

  // A. 零输入基线稳定性（1.5s）
  await page.evaluate(() => window._resetGyroEMA && window._resetGyroEMA());
  const phaseA = await runPhase('A 零输入', 1500, () => 0);

  // B. 恒定输入收敛（yaw=12°, 2.5s）
  const phaseB = await runPhase('B 恒定12°', 2500, () => 12);

  // C. 慢速基线漂移：raw 以 0.5°/s 漂 10s（累计 5°），低于 1°/s 学习阈值
  await page.evaluate(() => window._resetGyroEMA && window._resetGyroEMA());
  await runPhase('C0 漂移前归零', 600, () => 0);
  const DRIFT_RATE = 0.5, DRIFT_SEC = 10;
  const phaseC = await runPhase('C 慢漂移', DRIFT_SEC * 1000, t => DRIFT_RATE * t, 200);
  const driftRaw = DRIFT_RATE * DRIFT_SEC;   // ≈5°

  // D. 漂移补偿后真实快速转头不被吞掉：在漂移终点基础上阶跃 +10°
  const base = phaseC[phaseC.length - 1].stateYaw;
  const phaseD = await runPhase('D 阶跃+10°', 700, () => driftRaw + 10, 50);
  const stepYaw = phaseD[phaseD.length - 1].stateYaw;

  await page.screenshot({ path: 'screenshots/vor-drift-e2e.png' });

  // ---- 断言 ----
  const asserts = [];
  const A = (name, ok, extra = '') => { asserts.push({ name, ok, extra }); };
  const maxAbs = (arr, k) => Math.max(...arr.map(s => Math.abs(s[k])));
  const range = (arr, k) => Math.max(...arr.map(s => s[k])) - Math.min(...arr.map(s => s[k]));

  A('A: 零输入时 _vorRawDeg 不漂移 (|.| < 0.5°)', maxAbs(phaseA, 'rawDeg') < 0.5, 'max=' + maxAbs(phaseA, 'rawDeg'));
  A('A: 零输入时 worldShift 不漂移 (|.| < 0.02)', maxAbs(phaseA, 'shift') < 0.02, 'max=' + maxAbs(phaseA, 'shift'));
  // 末 10 样本（≈最后 1s+），避开 yaw 阶跃后 worldShift 0.5-lerp 的收敛过渡期
  const tailB = phaseB.slice(-10);
  A('B: 恒定 12° 收敛后稳定 (末 10 样本极差 < 0.5°)', range(tailB, 'rawDeg') < 0.5, 'range=' + range(tailB, 'rawDeg').toFixed(3));
  A('B: 恒定 12° 收敛到目标 (|均值-12| < 1°)', Math.abs(tailB.reduce((a, s) => a + s.rawDeg, 0) / tailB.length - 12) < 1,
    'mean=' + (tailB.reduce((a, s) => a + s.rawDeg, 0) / tailB.length).toFixed(2));
  A('B: worldShift 收敛后稳定 (末 10 样本极差 < 0.01)', range(tailB, 'shift') < 0.01, 'range=' + range(tailB, 'shift').toFixed(4));
  // 漂移补偿有效性的判定与游戏/非游戏学习速率(0.05/0.01)解耦：
  // 未补偿时校正 yaw 会跟到 ≈5°；补偿生效则应被压在远小于该值且有界。
  A('C: 慢漂移被补偿 (max|校正yaw| < 3°，原始漂移 ' + driftRaw + '°)', maxAbs(phaseC, 'stateYaw') < 3.0, 'max=' + maxAbs(phaseC, 'stateYaw'));
  A('C: 漂移末段已锁定 (末 2s 极差 < 0.6°)', range(phaseC.slice(-10), 'stateYaw') < 0.6, 'range=' + range(phaseC.slice(-10), 'stateYaw').toFixed(3));
  A('C: 漂移期间 worldShift 有界 (|.| < 0.10)', maxAbs(phaseC, 'shift') < 0.10, 'max=' + maxAbs(phaseC, 'shift'));
  A('D: 真实阶跃 +10° 穿透补偿 (Δyaw ≥ 8.5°)', stepYaw - base >= 8.5, `${base} -> ${stepYaw}`);
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
