import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
await page.goto("https://fxs-84.github.io/brainmend/index.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
const sess = await page.evaluate(async () => {
  return await window.SupabaseClient.signIn("bm-e2e-test@example.com", "Test1234!");
});
const rows = await page.evaluate(async () => await window.SupabaseClient.listMyTrackingRecords({ limit: 5 }));
console.log("with auth, listMyTrackingRecords:", JSON.stringify(rows));
console.log("len:", rows?.length);
await browser.close();
