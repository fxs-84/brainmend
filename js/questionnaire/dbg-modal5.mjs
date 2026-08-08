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
await page.waitForTimeout(1500);
// 看 modal-content 是否可见 (用户实际看到的报告内容)
const r = await page.evaluate(() => {
  const m = document.getElementById("result-modal");
  const mc = m.querySelector(".modal-content");
  const cs = getComputedStyle(mc);
  const r = mc.getBoundingClientRect();
  return {
    modalContent: {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      bg: cs.background,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      textPreview: mc.innerText.substring(0, 200)
    }
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
