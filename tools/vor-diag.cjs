// 诊断：量 demo 页在 headless 下的实际 FPS 与判定状态（排查性能导致的判定异常）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const PORT = 8799;
(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.goto(`http://localhost:${PORT}/vor.html?blocks=2&mode=device&skipvas=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });
    await page.evaluate(() => {
      const loop = () => {
        const t = performance.now() / 1000;
        window.updateFromGyroscope({ yaw: 15 * Math.sin(2 * Math.PI * 0.5 * t), pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });
    const fps = await page.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const cnt = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(cnt); else res(n / 3); };
      requestAnimationFrame(cnt);
    }));
    const stat = await page.evaluate(() => ({
      isSmooth: window.__vorDemo.evaluator.isSmooth,
      threshold: +window.__vorDemo.evaluator.threshold.toFixed(1),
      yaw: +window.__vorDemo.input.pose.yaw.toFixed(1),
      drawCalls: window.__vorDemo ? undefined : 0,
    }));
    console.log('FPS ≈', fps.toFixed(1));
    console.log('isSmooth =', stat.isSmooth, '| threshold =', stat.threshold, '| yaw =', stat.yaw);
  } finally {
    await browser.close(); server.kill();
  }
  process.exit(0);
})().catch(e => { console.error('诊断异常:', e); process.exit(1); });
