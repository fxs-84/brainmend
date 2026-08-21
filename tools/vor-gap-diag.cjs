// gap 尖刺值诊断：注入正弦 + 多次制造 gap，打印 spikeLog 的 α 值（判断边界 vs 真跨 gap 伪尖刺）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const PORT = 8793;
(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    await page.goto(`http://localhost:${PORT}/vor.html?blocks=2&mode=device&skipvas=1&bloom=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__drive = { gapFrames: 0 };
      const loop = () => {
        const d = window.__drive;
        if (d.gapFrames > 0) { d.gapFrames--; }
        else {
          const t = performance.now() / 1000;
          window.updateFromGyroscope({ yaw: 15 * Math.sin(2 * Math.PI * 0.5 * t), pitch: 0, roll: 0 });
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });
    for (let k = 0; k < 4; k++) {
      await page.evaluate(() => { window.__vorDemo.chain.spikeLog.length = 0; window.__drive.gapFrames = 30; });
      await page.waitForTimeout(2500);
      const spikes = await page.evaluate(() => window.__vorDemo.chain.spikeLog.slice());
      console.log(`gap ${k + 1}: 尖刺 ${spikes.length} 个 →`, spikes.map(s => s.a).join(', ') || '无');
    }
  } finally { await browser.close(); server.kill(); }
  process.exit(0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
