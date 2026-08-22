// 预览 GLB：多角度截图
const { chromium } = require('playwright');
(async () => {
  const model = process.argv[2] || 'models/ship-player-v1.glb';
  const tag = process.argv[3] || 'player';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  p.on('console', m => { if (m.text().startsWith('BBOX')) console.log(m.text()); });
  p.on('pageerror', e => console.log('PE:', e.message));
  for (const view of ['iso', 'front', 'side', 'top']) {
    await p.goto(`http://localhost:4399/glb-preview.html?m=${model}&view=${view}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `screenshots/glb-${tag}-${view}.png` });
  }
  await b.close();
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
