import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8000/echo-ch1.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__echoCh1?.layer?.modelsReady, { timeout: 15000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('btn-sim').click());

// 每 3 秒打印一次引擎内部状态
for (let t = 3; t <= 33; t += 3) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => {
    const e = window.__echoCh1;
    return {
      state: e.state,
      blockT: +e._blockT.toFixed(2),
      blockId: e._blockId,
      blocks: e.stats.blocks.map(b => `${b.id}:${b.type}@${(b.duration||0).toFixed(1)}s`),
      cycles: e.stats.cycles,
    };
  });
  console.log(`t=${t}s`, JSON.stringify(s));
}
await browser.close();
