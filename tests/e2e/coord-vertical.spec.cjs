// 协调性·垂直轨迹修复(VERT-FIX-v1) E2E 回归
// 真实页面全流程：选垂直轨迹 → 开始检测 → 注入陀螺仪（假时钟）
//   yaw = 3.6°/min 漂移 + 0.5° 真实微摆；pitch = 跟踪正弦 + 一次单帧毛刺
// 断言：
//   1) 垂直检测中显示 dotX 恒锁车道中心（水平漂移对用户不可见）
//   2) 原始通道 _rawDotX 仍如实记录摆动（测量没丢信息）
//   3) 轨迹分不再被漂移打地板（>85；修复前钳制带+8px容差 → 恒 20）
//   4) pitch 单帧毛刺被中值滤波吸收，dotY 不跳变
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
      speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 0);
    });

    // 开始检测（走真实 UI 链路：TTS 回调里起 rAF 循环）
    await page.evaluate(() => document.getElementById('action-btn-coord').click());
    await page.waitForFunction(() => window.state.isRunning === true, null, { timeout: 5000 });

    // 注入：20Hz × 24s；每批 20 帧(1s sim)让一次 rAF 驱动评分
    // 摆动幅度分三段: 0-8s=0.5°(正常), 8-16s=3°(应橙), 16-24s=5°(应红)
    const res = await page.evaluate(async () => {
      const st = window.state;
      const dt = 0.05, T = 24;
      let spikeDone = false, trailAtSpike = null, p1TrajMean = null;
      const warnMax = [0, 0, 0];
      for (let k = 0; k <= T / dt; k++) {
        const t = k * dt;
        window.__simT += dt;
        const amp = t < 8 ? 0.5 : t < 16 ? 3 : 5;
        // yaw: 漂移 3.6°/min + 真实微摆
        const yaw = 0.06 * t + amp * Math.sin(2 * Math.PI * t / 3);
        // pitch: 跟踪垂直正弦目标(±12°)，t≈10s 处插一帧 +15° 毛刺
        let pitch = -12 * Math.sin(2 * Math.PI * t / 28.6);
        if (!spikeDone && t >= 10) { pitch += 15; spikeDone = true; trailAtSpike = st.trail.length; }
        window.updateFromGyroscope({ yaw, pitch, roll: 0 });
        const phase = t < 8 ? 0 : t < 16 ? 1 : 2;
        warnMax[phase] = Math.max(warnMax[phase], st._vertWarn || 0);
        if (k % 20 === 0) await new Promise(r => requestAnimationFrame(r));
        // 阶段1(0.5°微摆)结束时的轨迹分均值 —— 单独评这段，后两段大摆动理应降分
        if (p1TrajMean === null && t >= 8 && st.coordScores?.trajectory?.length) {
          const arr = st.coordScores.trajectory;
          p1TrajMean = arr.reduce((a, b) => a + b, 0) / arr.length;
        }
      }
      const trail = st.trail.slice();
      const xs = trail.map(p => p.x);
      const ys = trail.map(p => p.y);
      // 毛刺前后 dotY 步进
      let spikeJump = 0;
      if (trailAtSpike != null) {
        for (let i = Math.max(1, trailAtSpike - 4); i < Math.min(ys.length, trailAtSpike + 6); i++) {
          spikeJump = Math.max(spikeJump, Math.abs(ys[i] - ys[i - 1]));
        }
      }
      const traj = st.coordScores?.trajectory || [];
      return {
        running: st.isRunning,
        maxAbsDotX: Math.max(...xs.map(Math.abs)),
        rawRange: st._rawDotX != null ? 1 : 0,
        rawVals: [st._rawDotX],
        spikeJump,
        trajMean: p1TrajMean,
        trajN: traj.length,
        yawEnd: st.yaw,
        warnMax,
      };
    });

    console.log('  dotX 峰值:', res.maxAbsDotX.toFixed(3) + 'px',
      ' dotY 毛刺区最大步进:', res.spikeJump.toFixed(1) + 'px',
      ' 轨迹分均值:', res.trajMean?.toFixed(1), `(${res.trajN} 样本)`);
    assert('垂直检测中 dotX 锁定车道中心', res.maxAbsDotX < 0.01, res.maxAbsDotX.toFixed(3) + 'px');
    assert('原始通道 _rawDotX 仍在记录', res.rawRange === 1 && Number.isFinite(res.rawVals[0]), 'raw=' + res.rawVals[0]?.toFixed(2));
    assert('轨迹分不被漂移打地板 (>85)', res.trajMean !== null && res.trajMean > 85, res.trajMean?.toFixed(1));
    assert('pitch 单帧毛刺被吸收 (dotY 步进 <30px)', res.spikeJump < 30, res.spikeJump.toFixed(1) + 'px');
    console.log('  变色档位(0.5°/3°/5°摆动):', res.warnMax.join(' / '));
    assert('0.5°微摆不变色', res.warnMax[0] === 0, 'warnMax=' + res.warnMax[0]);
    assert('3°偏斜触发橙色(1级)', res.warnMax[1] === 1, 'warnMax=' + res.warnMax[1]);
    assert('5°偏斜触发红色(2级)', res.warnMax[2] === 2, 'warnMax=' + res.warnMax[2]);
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
