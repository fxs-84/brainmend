import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on("console", m => console.log("  [C]", m.text()));
page.on("pageerror", e => console.log("  [PE]", e.message));
await page.goto("https://fxs-84.github.io/brainmend/index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
await page.evaluate(async () => await window.SupabaseClient.signIn("bm-e2e-test@example.com", "Test1234!"));
await page.evaluate(() => window.BmTherapistUI.openDashboard());
await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
await page.evaluate(() => window.BmTherapistUI.switchReportTab('tracking'));
await page.waitForTimeout(3000);
// 直接 evaluate 调一次
const result = await page.evaluate(() => {
  const modal = document.getElementById('result-modal');
  const before = {
    exists: !!modal,
    classes: modal ? Array.from(modal.classList) : [],
    display: modal ? getComputedStyle(modal).display : null
  };
  // 直接调
  const rows = document.querySelectorAll("#bm-report-list .bm-list-item");
  if (rows.length > 0) {
    rows[0].click();
    return { before, after: {
      classes: Array.from(modal.classList),
      display: getComputedStyle(modal).display,
      titleText: modal.querySelector('.modal-title')?.textContent || ''
    }};
  }
  return { before, error: 'no rows' };
});
console.log("\nResult:", JSON.stringify(result, null, 2));
await page.waitForTimeout(1000);
await page.screenshot({ path: "js/questionnaire/screenshot-debug.png", fullPage: true });
await browser.close();
