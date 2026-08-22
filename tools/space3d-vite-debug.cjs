// 复现：vite dev 下点击太空3D飞行
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log('PE:', e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type().toUpperCase() + ':', m.text().slice(0, 300)); });
  p.on('requestfailed', r => console.log('REQFAIL:', r.url().slice(-80), r.failure()?.errorText));
  await p.goto('http://localhost:5199/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    if (window.state) window.state.useGyroscope = true;
    document.querySelector('.scene-btn[data-scene="space3d"]').click();
    document.getElementById('start-game-btn').click();
  });
  await p.waitForTimeout(1200);
  const st1 = await p.evaluate(() => ({
    scene: window.gameUI?.selectedScene,
    diffDlg: !!document.querySelector('button[data-d="normal"]'),
    spaceEngine: !!window.spaceEngine,
    __space3d: !!window.__space3d,
  }));
  console.log('after start:', JSON.stringify(st1));
  // 真实鼠标点击（带命中检测）——浮层被面板压住时这里会超时失败
  try {
    await p.click('button[data-d="normal"]', { timeout: 4000 });
    console.log('real click: OK');
  } catch (e) {
    console.log('real click: FAILED -', e.message.split('\n')[0]);
  }
  await p.waitForTimeout(2500);
  const st2 = await p.evaluate(() => ({
    spaceEngine: !!window.spaceEngine,
    __space3d: !!window.__space3d,
    playing: window.__space3d?.state || null,
  }));
  console.log('after difficulty:', JSON.stringify(st2));
  await p.screenshot({ path: 'screenshots/space3d-vite-dbg.png' });
  await b.close();
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
