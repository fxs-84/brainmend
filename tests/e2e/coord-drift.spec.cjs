// 裸数据链路(RAW-DISPLAY-v1)E2E 回归 —— 协调模式 yaw 通道
// 场景：真实页面内注入带 3.6°/min 漂移的模拟陀螺仪数据（假时钟快进 130s）
// 断言（语义与 DRIFT-FIX 时代相反 —— 补偿器已移除）：
//   1) 零滞后零补偿: state.yaw 与注入值(含漂移)一致, 峰值误差 < 0.2°
//   2) 漂移原样呈现: state.yaw - 真实头角 ≈ 漂移量(不再被"补偿"压掉)
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
      let maxErrRaw = 0;                // |state.yaw - 注入值| 应≈0 (零补偿零滞后)
      for (let k = 0; k <= 130 / dt; k++) {
        const t = k * dt;
        fakeT += dt;
        const injected = user(t) + drift * t;
        window.updateFromGyroscope({ yaw: injected, pitch: 0, roll: 0 });
        maxErrRaw = Math.max(maxErrRaw, Math.abs(st.yaw - injected));
      }
      performance.now = realNow;
      return { maxErrRaw, yawEnd: st.yaw, userEnd: user(130), driftEnd: drift * 130 };
    });

    console.log('  零补偿峰值误差:', res.maxErrRaw.toFixed(3) + '°',
                ' 末帧: yaw=' + res.yawEnd.toFixed(2) + '° 真实=' + res.userEnd.toFixed(2) + '° 漂移=' + res.driftEnd.toFixed(2) + '°');
    assert('零滞后零补偿: 显示=注入值 (<0.2°)', res.maxErrRaw < 0.2, res.maxErrRaw.toFixed(3) + '°');
    const driftShown = res.yawEnd - res.userEnd;
    assert('漂移原样呈现, 不再被补偿 (>5°)', driftShown > 5, driftShown.toFixed(2) + '° (理论≈' + res.driftEnd.toFixed(2) + '°)');
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
