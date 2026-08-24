// 停顿追赶平滑(CATCHUP-FIX-v1) E2E 回归
// 场景：垂直检测中模拟 BLE 停顿 0.6s，停顿期间真实 pitch 从 -5° 变为 -13°
// 断言：
//   1) 帧恢复后第 1 帧不光跳：pitch 显示值仍在旧值附近(追赶刚开始)
//   2) 0.5s 内追平到真值(误差 <0.5°)
//   3) 遥测计数 catchUps >= 1
//   4) 连续帧流(无停顿)时追赶不触发、跟随无滞后
// 用法：node tests/e2e/coord-catchup.spec.cjs（自起静态服务器，端口 8798）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8798;

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
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.state && window.updateFromGyroscope, null, { timeout: 10000 });

    await page.evaluate(() => document.querySelector('.mode-btn[data-mode="coordination"]').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-traj="vertical"]').click());
    await page.evaluate(() => {
      window.__simT = 0;
      Date.now = () => window.__simT * 1000;
      performance.now = () => window.__simT * 1000;
      window.state.useGyroscope = true;
      window.__gyroDiag = { f61: 0, f113: 0, gaps: 0, maxGap: 0, reanchor: 0, catchUps: 0 };
      speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 0);
    });
    await page.evaluate(() => document.getElementById('action-btn-coord').click());
    await page.waitForFunction(() => window.state.isRunning === true, null, { timeout: 5000 });

    const res = await page.evaluate(async () => {
      const st = window.state;
      const feed = (pitch) => { window.__simT += 0.05; window.updateFromGyroscope({ yaw: 0, pitch, roll: 0 }); };
      // 2s 连续帧(pitch=-5°) —— 无停顿，验证正常跟随
      for (let k = 0; k < 40; k++) feed(-5);
      const followErr = Math.abs(st.pitch - (-5));
      // 停顿 0.6s(只走时钟不进帧)，期间真值变为 -13°
      window.__simT += 0.6;
      feed(-13);                                  // 恢复后第 1 帧
      const pitchFirstFrame = st.pitch;
      for (let k = 0; k < 3; k++) feed(-13);      // 再 3 帧(0.15s)
      const pitchMid = st.pitch;
      for (let k = 0; k < 7; k++) feed(-13);      // 再 7 帧(累计 0.55s)
      const pitchLate = st.pitch;
      return { followErr, pitchFirstFrame, pitchMid, pitchLate, catchUps: window.__gyroDiag.catchUps };
    });

    console.log('  连续跟随误差:', res.followErr.toFixed(2) + '°',
      ' 恢复后第1帧:', res.pitchFirstFrame.toFixed(2) + '°',
      ' +0.15s:', res.pitchMid.toFixed(2) + '°',
      ' +0.55s:', res.pitchLate.toFixed(2) + '°',
      ' catchUps:', res.catchUps);
    assert('连续帧流跟随无滞后 (<0.5°)', res.followErr < 0.5, res.followErr.toFixed(2) + '°');
    assert('停顿恢复首帧不硬跳 (未到真值的60%)', res.pitchFirstFrame > -5 - 8 * 0.6, res.pitchFirstFrame.toFixed(2) + '°');
    assert('追赶在 0.55s 内收敛真值 (<0.5°)', Math.abs(res.pitchLate - (-13)) < 0.5, res.pitchLate.toFixed(2) + '°');
    assert('遥测 catchUps 计数', res.catchUps >= 1, String(res.catchUps));
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
