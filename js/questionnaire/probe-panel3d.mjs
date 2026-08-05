import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto("http://localhost:8765/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.click("#page2-tracking");
await page.waitForTimeout(800);
await page.click('.mode-btn[data-mode="game"]');
await page.waitForTimeout(800);
const btns = await page.evaluate(() => Array.from(document.querySelectorAll('#game-select-panel button')).map(b => b.textContent.trim().slice(0, 20)));
console.log("游戏面板按钮:", JSON.stringify(btns));
const has3d = btns.some(b => b.includes("3D 赛车"));
console.log("3D 赛车按钮:", has3d ? "✅ 在面板里" : "❌ 缺失");
if (has3d) {
  await page.click("#road3d-btn");
  await page.waitForTimeout(1500);
  console.log("点击后 URL:", page.url());
}
await browser.close();
