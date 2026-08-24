// 协调性模式 yaw 漂移补偿 E2E 回归（DRIFT-FIX-v4）
// 场景：真实页面内注入带 3.6°/min 漂移的模拟陀螺仪数据（假时钟快进 130s）
//   前 10s 静止（学习漂移速率）→ 后 120s 连续正弦跟靶 ±60°（模拟协调性检测）
// 断言：运动中 |state.yaw - 真实头角| 峰值 < 2°（修复前约 7°+）
// 用法：node tests/e2e/coord-drift.spec.cjs（自起静态服务器，端口 8793）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8793;
const URL = `http://localhost:${PORT}/index.html`;

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.state && window.updateFromGyroscope, null, { timeout: 10000 });

    // 切到协调性模式
    await page.evaluate(() => document.querySelector('.mode-btn[data-mode="coordination"]').click());
    await page.waitForTimeout(300);
    const mode = await page.evaluate(() => window.state.mode);
    assert('进入协调性模式', mode === 'coordination', 'mode=' + mode);

    // 假时钟 + 注入：前 10s 静止，后 120s 正弦跟靶，漂移 3.6°/min
    const res = await page.evaluate(() => {
      const st = window.state;
      st.useGyroscope = true;
      const realNow = performance.now.bind(performance);
      let fakeT = realNow() / 1000;
      performance.now = () => fakeT * 1000;
      const drift = 0.06;               // °/s = 3.6°/min
      const dt = 0.05;                  // 20Hz
      const user = t => t < 10 ? 0 : 60 * Math.sin(2 * Math.PI * (t - 10) / 28.6);
      let maxErrStill = 0, maxErrMove = 0;
      for (let k = 0; k <= 130 / dt; k++) {
        const t = k * dt;
        fakeT += dt;
        window.updateFromGyroscope({ yaw: user(t) + drift * t, pitch: 0, roll: 0 });
        const err = Math.abs(st.yaw - user(t));
        if (t < 10) maxErrStill = Math.max(maxErrStill, err);
        else maxErrMove = Math.max(maxErrMove, err);
      }
      performance.now = realNow;
      return { maxErrStill, maxErrMove, yawEnd: st.yaw, userEnd: user(130) };
    });

    console.log('  静止段峰值误差:', res.maxErrStill.toFixed(2) + '°',
                ' 运动段峰值误差:', res.maxErrMove.toFixed(2) + '°',
                ' 末帧: yaw=' + res.yawEnd.toFixed(2) + '° 真实=' + res.userEnd.toFixed(2) + '°');
    assert('静止段漂移被压住 (<0.5°)', res.maxErrStill < 0.5, res.maxErrStill.toFixed(2) + '°');
    assert('120s 连续运动漂移补偿有效 (<2°)', res.maxErrMove < 2, res.maxErrMove.toFixed(2) + '°');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    failed++;
    console.error('  ✗ 用例执行异常:', e.message);
    console.error(errors.slice(0, 5).join('\n'));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
