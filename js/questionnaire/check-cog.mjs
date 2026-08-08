import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
await page.goto("https://fxs-84.github.io/brainmend/index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
await page.evaluate(async () => await window.SupabaseClient.signIn("bm-e2e-test@example.com", "Test1234!"));
const rows = await page.evaluate(async () => await window.SupabaseClient.listMyCognitiveAssessments({ limit: 3 }));
console.log(JSON.stringify(rows.map(r => ({
  id: r.id,
  patient: r.patient_name,
  payloadKeys: Object.keys(r.payload || {}),
  rawScores: r.payload?.rawScores ? Object.keys(r.payload.rawScores) : null,
  hasNormalizedScores: !!r.payload?.normalizedScores,
  hasBrainRegions: !!r.payload?.brainRegions,
  hasRiskIndex: !!r.payload?.riskIndex
})), null, 2));
await browser.close();
