// js/questionnaire/probe-user-scenario.mjs
// 模拟用户最可能的操作: 直接打开 questionnaire.html (没治疗师分享链接),
// 答完 100 题, 截图报告页 → 看用户实际看到什么
import { chromium } from "playwright";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

// 直接打开, 不带 share_token, 模拟用户的本地测试
await page.goto(base + "/questionnaire.html?sandbox=1&name=本地测试&age=35&gender=男", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.click("#intro-start");
await page.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
for (let q = 1; q <= 100; q++) {
  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
  await page.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await page.waitForTimeout(280);
}
await page.click("#quiz-next");
await page.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });
await page.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
await page.waitForTimeout(500);
await page.click("#qnr-reg-submit");
await page.waitForTimeout(3000);

// 报告页截图
await page.screenshot({ path: "js/questionnaire/screenshot-report-page.png", fullPage: true });

// 报告页底部 footer 文本
const footerText = await page.evaluate(() => {
  const el = document.getElementById("qnr-cloud-status-footer");
  return el ? { exists: true, text: el.innerText, html: el.innerHTML.substring(0, 400) } : { exists: false };
});
console.log("\n=== 云端状态行 ===");
console.log(JSON.stringify(footerText, null, 2));

// localStorage
const rec = await page.evaluate(() => {
  const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
  return arr[arr.length - 1] || {};
});
console.log("\n=== localStorage 最新记录 ===");
console.log(JSON.stringify({
  _cloudStatus: rec._cloudStatus,
  _cloudErr: rec._cloudErr,
  _cloudId: rec._cloudId,
  _cloudSource: rec._cloudSource
}, null, 2));

// URL (用户做完后 URL 是什么)
console.log("\n=== 当前 URL ===");
console.log(page.url());

console.log("\n=== console 日志 (后 15 条) ===");
logs.slice(-15).forEach((l) => console.log(l));

await browser.close();