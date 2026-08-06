import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto("http://localhost:8765/road-3d.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
// 跑 12 秒观察游戏
const scores = [];
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => document.querySelector('#hud .score')?.textContent || '');
  scores.push(s);
}
console.log("12秒游戏状态采样:", JSON.stringify(scores));
console.log("JS错误:", errors.length ? errors : "无");
if (errors.length) process.exitCode = 1;
await browser.close();
