// Mobile / fullscreen adaptation self-check (Playwright)
// Auto-discovers splash button + enters head-tracking coordination page
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://127.0.0.1:5173/index.html?mode=tracking';
const OUT = 'screenshots/mobile-adapt';
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'iphone-portrait',     vp: { width: 390,  height: 844 },  fs: false },
  { name: 'iphone-landscape',    vp: { width: 844,  height: 390 },  fs: false },
  { name: 'narrow-360',          vp: { width: 360,  height: 780 },  fs: false },
  { name: 'tablet-768',          vp: { width: 768,  height: 1024 }, fs: false },
  { name: 'iphone-fs-portrait',  vp: { width: 390,  height: 844 },  fs: true },
  { name: 'iphone-fs-landscape', vp: { width: 844,  height: 390 },  fs: true },
];

const browser = await chromium.launch();
const results = [];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // wait for crosshair-canvas to mount (deep-link skips splash)
  await page.waitForSelector('#crosshair-canvas', { state: 'attached', timeout: 8000 });
  await page.waitForTimeout(500);
  // switch to coordination mode + show coord bottom bar
  await page.evaluate(() => {
    const btn = document.querySelector('.mode-btn[data-mode="coordination"]');
    btn && btn.click();
    setTimeout(() => {
      const b = document.getElementById('coord-bottom-bar');
      if (b) { b.style.display = 'flex'; b.style.zIndex = '1100'; }
    }, 100);
  });
  await page.waitForTimeout(700);
  if (s.fs) {
    // reload with fs-active preset so CSS @media / fs-active apply together
    await page.evaluate(() => {
      document.body.classList.add('fs-active');
      try { localStorage.setItem('__force_fs', '1'); } catch {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#crosshair-canvas', { state: 'attached', timeout: 8000 });
    await page.waitForTimeout(500);
    // re-apply fs-active + strip inline side-panel styles (simulates fullscreenchange handler) + show bottom bar
    await page.evaluate(() => {
      document.body.classList.add('fs-active');
      const sp = document.getElementById('side-panel');
      if (sp) { sp.style.removeProperty('display'); sp.style.removeProperty('width'); sp.style.removeProperty('min-width'); }
      document.querySelector('.mode-btn[data-mode="coordination"]')?.click();
      setTimeout(() => {
        const b = document.getElementById('coord-bottom-bar');
        if (b) { b.style.display = 'flex'; b.style.zIndex = '1100'; }
      }, 100);
    });
    await page.waitForTimeout(700);
  }
  const path = `${OUT}/${s.name}.png`;
  await page.screenshot({ path, fullPage: false });
  const probe = await page.evaluate(() => {
    const pick = sel => {
      const e = document.querySelector(sel);
      if (!e) return { sel, missing: true };
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return {
        sel, x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        vis: cs.visibility, disp: cs.display,
        inView: r.x + r.width > 0 && r.x < innerWidth && r.y + r.height > 0 && r.y < innerHeight,
      };
    };
    return {
      vw: innerWidth, vh: innerHeight,
      fs: !!document.fullscreenElement,
      bodyClass: document.body.className,
      canvas: pick('#crosshair-canvas'),
      sidePanel: pick('#side-panel'),
      bottomBar: pick('#coord-bottom-bar'),
      header: pick('header'),
    };
  });
  results.push({ name: s.name, ...probe });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));