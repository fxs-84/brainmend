// 泛光效果截图：?bloom=1&keepbloom=1 强制开启 UnrealBloomPass，验证光球/火花辉光
// 用法：node tools/vor-ch1-bloom-shot.cjs（自起静态服务器，端口 8794）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const PORT = 8794;
(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    page.on('pageerror', e => console.error('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/vor.html?skipvas=1&mode=device&blocks=12&bloom=1&keepbloom=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });
    await page.evaluate(() => {
      const loop = () => {
        const t = performance.now() / 1000;
        window.updateFromGyroscope({ yaw: 15 * Math.sin(2 * Math.PI * 0.5 * t), pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 12000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'ch1-bloom.png') });
    console.log('✓ bloom 截图完成 screenshots/ch1-bloom.png');
  } finally { await browser.close(); server.kill(); }
  process.exit(0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
