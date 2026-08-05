import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const base = process.argv[2] || "http://localhost:8765";
const out = path.join(root, "screenshots", "questionnaire-quiz.png");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
await page.goto(`${base}/questionnaire.html`, { waitUntil: "networkidle" });
await page.click("#intro-start");
await page.waitForSelector("#screen-quiz:not([style*='none']) .q-option");

// 答到第 5 题,先选 "经常" 让界面有选中态
for (let i = 1; i < 5; i++) {
  await page.click(".q-option >> nth=2");
  await page.waitForTimeout(320);
}
await page.click(".q-option >> nth=2"); // 第 5 题选 "经常"
await page.waitForTimeout(150);
await page.screenshot({ path: out, fullPage: true });
console.log("✅ 答题页截图:", out);

await browser.close();
