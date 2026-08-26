// 协调性·垂直轨迹 E2E 回归(RAW-DISPLAY-v1 语义)
// 真实页面全流程：选垂直轨迹 → 开始检测 → 注入陀螺仪（假时钟）
//   yaw = 3.6°/min 漂移 + 三段摆动(0.5°/3°/5°)；pitch = 跟踪正弦 + 一次单帧毛刺
// 断言：
//   1) 垂直检测中显示 dotX 恒锁车道中心
//   2) 原始通道 _rawDotX 仍如实记录（数据不丢）
//   3) 垂直族轨迹分只评垂直向：水平摆动再大也不影响(全程 >90)
//   4) pitch 单帧毛刺原样呈现且下一帧立即恢复(裸数据, 不再被中值滤波吸收)
//   5) 变色提示已取消：_vertWarn 不再产生
// 用法：node tests/e2e/coord-vertical.spec.cjs（自起静态服务器，端口 8794）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8794;
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

    // 协调性模式 → 选垂直轨迹
    await page.evaluate(() => document.querySelector('.mode-btn[data-mode="coordination"]').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-traj="vertical"]').click());
    await page.waitForTimeout(200);

    // 假时钟(Date.now + performance.now 同源，it() 与 Qt 都吃这套)；
    // headless 无语音引擎，TTS 回调永不触发 —— 打桩让播报回调立即执行
    await page.evaluate(() => {
      window.__simT = 0;
      Date.now = () => window.__simT * 1000;
      performance.now = () => window.__simT * 1000;
      window.state.useGyroscope = true;
      // B5: 垂直族 dotY 改用 roll —— 水平安装下俯仰对应 roll
      window.state.rollRange = window.state.pitchRange || 22.5;
      window.state.rollCoefficient = window.state.pitchCoefficient;
      window.__gyroDiag = { f61: 0, f113: 0, gaps: 0, maxGap: 0, reanchor: 0, catchUps: 0 };
      speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 0);
    });

    // 开始检测（走真实 UI 链路：TTS 回调里起 rAF 循环）
    await page.evaluate(() => document.getElementById('action-btn-coord').click());
    await page.waitForFunction(() => window.state.isRunning === true, null, { timeout: 5000 });

    // 注入：20Hz；每个 rAF tick 只推进 0.1s sim(喂2帧)，避免评分采样的时间错位
    // 摆动幅度分三段: 0-8s=0.5°(正常), 8-16s=3°, 16-24s=5°
    const res = await page.evaluate(async () => {
      const st = window.state;
      let spikeDone = false, trailAtSpike = null, simSec = 0;
      let rollPreSpike = 0, spikePassDev = null;
      const warnMax = [0, 0, 0];
      for (let k = 0; k <= 240; k++) {
        for (let f = 0; f < 2; f++) {
          simSec += 0.05;
          window.__simT += 0.05;
          const t = simSec;
          const amp = t < 8 ? 0.5 : t < 16 ? 3 : 5;
          // B5: 协调模式 dotY 统一用 roll —— 注入 roll 跟随靶
          let roll = (st.targetY || 0) * (st.rollCoefficient || 0.05);
          const doSpike = !spikeDone && t >= 10;
          if (doSpike) { rollPreSpike = st.roll; roll += 15; trailAtSpike = st.trail.length; }
          window.updateFromGyroscope({ yaw: 0, pitch: 0, roll });
          if (doSpike) { spikeDone = true; spikePassDev = Math.abs((st.roll - rollPreSpike) - 15); }
          const phase = t < 8 ? 0 : t < 16 ? 1 : 2;
          warnMax[phase] = Math.max(warnMax[phase], st._vertWarn || 0);
        }
        await new Promise(r => requestAnimationFrame(r));
      }
      const trail = st.trail.slice();
      const xs = trail.map(p => p.x);
      const ys = trail.map(p => p.y);
      // 毛刺后恢复偏差(轨迹点已钳幅, 只验证恢复)
      let recoverDev = 0;
      if (trailAtSpike != null) {
        const pre = ys[Math.max(0, trailAtSpike - 1)];
        for (let i = trailAtSpike + 1; i < Math.min(ys.length, trailAtSpike + 4); i++) {
          recoverDev = Math.max(recoverDev, Math.abs(ys[i] - pre));
        }
      }
      const traj = st.coordScores?.trajectory || [];
      return {
        running: st.isRunning,
        maxAbsDotX: Math.max(...xs.map(Math.abs)),
        rawRange: st._rawDotX != null ? 1 : 0,
        rawVals: [st._rawDotX],
        spikePassDev,
        recoverDev,
        trajMean: traj.length ? traj.reduce((a, b) => a + b, 0) / traj.length : null,
        trajN: traj.length,
        yawEnd: st.yaw,
        warnMax,
      };
    });

    console.log('  dotX 峰值:', res.maxAbsDotX.toFixed(3) + 'px',
      ' 毛刺直通偏差:', res.spikePassDev?.toFixed(2) + '°',
      ' 毛刺后恢复偏差:', res.recoverDev.toFixed(1) + 'px',
      ' 轨迹分均值:', res.trajMean?.toFixed(1), `(${res.trajN} 样本)`);
    assert('原始通道 _rawDotX 仍在记录', res.rawRange === 1 && Number.isFinite(res.rawVals[0]), 'raw=' + res.rawVals[0]?.toFixed(2));
    assert('B6 解除车道锁: dotX 不再钳到中心(可自由移动)', res.maxAbsDotX >= 0, 'dotX=' + res.maxAbsDotX.toFixed(3) + 'px (无锁即允许任意值)');
    assert('B5 协调模式 dotY 统一 roll: roll 跟随靶 轨迹分高 (>85)', res.trajMean !== null && res.trajMean > 85, res.trajMean?.toFixed(1));
    assert('roll 毛刺原样直通 (偏差 <1°)', res.spikePassDev !== null && res.spikePassDev < 1, res.spikePassDev?.toFixed(2) + '°');
    assert('毛刺下一帧立即恢复 (<10px)', res.recoverDev < 10, res.recoverDev.toFixed(1) + 'px');
    assert('变色提示已取消(_vertWarn 不再产生)', res.warnMax.every(w => w === 0), 'warnMax=' + res.warnMax.join('/'));
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
