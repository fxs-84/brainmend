import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const missing = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message.slice(0, 200)));
page.on("response", r => { if (r.status() === 404) missing.push(r.url().replace("http://localhost:8765/", "")); });
await page.goto("http://localhost:8765/road-3d.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000); // 等 CDN three + GLB 加载

const state = await page.evaluate(() => {
  const loading = document.getElementById('loading');
  return {
    canvasCount: document.querySelectorAll('canvas').length,
    loadingDone: loading ? loading.classList.contains('done') : null,
    loadingText: loading ? loading.textContent : null,
    score: document.querySelector('#hud .score')?.textContent || null
  };
});
console.log("页面状态:", JSON.stringify(state, null, 2));
console.log("404:", missing.length ? missing : "无");
console.log("JS错误:", errors.length ? errors : "无");
if (!state.canvasCount || errors.length) process.exitCode = 1;
await browser.close();
