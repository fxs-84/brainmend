import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on("console", m => { if (m.text().includes("error") || m.text().includes("Error") || m.text().includes("modal")) console.log("  [C]", m.text()); });
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
await page.waitForTimeout(1500);
await page.screenshot({ path: "js/questionnaire/screenshot-result-modal.png", fullPage: true });
// 看所有 modal/overlay 状态
const state = await page.evaluate(() => {
  const ids = ['result-modal', 'bm-dashboard-modal', 'bm-tracking-detail-modal', 'cog-modal-overlay', 'qnr-modal-overlay', 'trk-qr-overlay', 'gyro-modal'];
  return ids.map(id => {
    const el = document.getElementById(id);
    if (!el) return { id, exists: false };
    const cs = getComputedStyle(el);
    return {
      id,
      classes: Array.from(el.classList),
      display: cs.display,
      zIndex: cs.zIndex,
      visibility: cs.visibility
    };
  });
});
console.log("\nAll overlays state:");
state.forEach(s => console.log("  " + JSON.stringify(s)));
await browser.close();
