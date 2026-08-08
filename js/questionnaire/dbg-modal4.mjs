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
// 用 element handle 截 modal
const modal = await page.$('#result-modal');
await modal.screenshot({ path: "js/questionnaire/screenshot-modal-only.png" });
// 也试一下整页
await page.screenshot({ path: "js/questionnaire/screenshot-full.png", fullPage: true });
await browser.close();
