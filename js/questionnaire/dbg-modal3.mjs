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
const r = await page.evaluate(() => {
  const m = document.getElementById("result-modal");
  if (!m) return { err: "no modal" };
  const cs = getComputedStyle(m);
  const rect = m.getBoundingClientRect();
  return {
    classes: Array.from(m.classList),
    display: cs.display,
    opacity: cs.opacity,
    visibility: cs.visibility,
    zIndex: cs.zIndex,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    contentPreview: m.innerText.substring(0, 200)
  };
});
console.log(JSON.stringify(r, null, 2));
await page.screenshot({ path: "js/questionnaire/screenshot-result2.png", fullPage: false, clip: { x: 0, y: 0, width: 1400, height: 900 } });
await browser.close();
