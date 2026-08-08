import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
await page.goto("https://fxs-84.github.io/brainmend/index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
await page.evaluate(async () => await window.SupabaseClient.signIn("bm-e2e-test@example.com", "Test1234!"));
await page.evaluate(() => window.BmTherapistUI.openDashboard());
await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
await page.evaluate(() => window.BmTherapistUI.switchReportTab('tracking'));
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const rows = document.querySelectorAll("#bm-report-list .bm-list-item");
  if (rows.length > 0) rows[0].click();
});
await page.waitForTimeout(2000);
// 用 getBoundingClientRect 看 modal-content 的实际位置
const rc = await page.evaluate(() => {
  const m = document.getElementById("result-modal");
  const mc = m.querySelector(".modal-content");
  const r = mc.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
console.log("modal-content rect:", rc);
// 强制重绘 + 截图
await page.evaluate(() => {
  document.body.offsetHeight;  // 触发 reflow
  document.getElementById("result-modal").style.zIndex = "99999";
});
await page.waitForTimeout(500);
await page.screenshot({ path: "js/questionnaire/screenshot-modal-final.png", fullPage: false });
console.log("done");
await browser.close();
