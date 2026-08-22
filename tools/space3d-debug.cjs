// 调试2：读 gameUI 状态
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log('PE:', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CE:', m.text()); });
  await p.goto('http://localhost:4399/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await p.waitForTimeout(1200);
  const r1 = await p.evaluate(() => {
    const btn = document.querySelector('.scene-btn[data-scene="space3d"]');
    const start = document.getElementById('start-game-btn');
    if (window.state) window.state.useGyroscope = true;
    btn && btn.click();
    const after = { scene: window.gameUI && window.gameUI.selectedScene, mode: window.gameUI && window.gameUI.selectedMode };
    start && start.click();
    return { hasBtn: !!btn, hasStart: !!start, ...after };
  });
  console.log('after clicks:', JSON.stringify(r1));
  await p.waitForTimeout(1200);
  const r2 = await p.evaluate(() => ({
    spaceEngine: !!window.spaceEngine,
    diffDlg: !!document.querySelector('button[data-d="normal"]'),
    fixedDivs: [...document.querySelectorAll('body > div')].filter(d => getComputedStyle(d).position === 'fixed' && d.style.zIndex >= 4000).length,
  }));
  console.log('state:', JSON.stringify(r2));
  await b.close();
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
