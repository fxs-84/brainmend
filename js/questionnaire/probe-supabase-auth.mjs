// js/questionnaire/probe-supabase-auth.mjs
// 直接调 window.SupabaseClient API, 看真实的 signIn/signUp 响应
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("response", async (r) => {
  if (r.url().includes("supabase")) {
    let body = "";
    try { body = await r.text(); } catch(e) {}
    logs.push(`[http] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`);
    if (r.status() >= 400) logs.push(`   body: ${body.substring(0, 400)}`);
    if (body && body.length < 200) logs.push(`   ok-body: ${body}`);
  }
});

await page.goto(base + "/questionnaire.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 30000 });
console.log("SupabaseClient 就绪");

// 1. 先 signUp
console.log("\n=== 1. signUp ===");
try {
  const r = await page.evaluate(async ({ email, pw }) => {
    try {
      const data = await window.SupabaseClient.signUp(email, pw, "直接API测试");
      return { ok: true, data, hasToken: !!data?.access_token, userEmail: data?.user?.email };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  }, { email: TEST_EMAIL, pw: TEST_PASSWORD });
  console.log("signUp 结果:", JSON.stringify(r, null, 2));
} catch(e) { console.log("signUp 异常:", e.message); }

// 2. 再 signIn
console.log("\n=== 2. signIn ===");
try {
  const r = await page.evaluate(async ({ email, pw }) => {
    try {
      const data = await window.SupabaseClient.signIn(email, pw);
      return { ok: true, hasToken: !!data?.access_token, userEmail: data?.user?.email };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  }, { email: TEST_EMAIL, pw: TEST_PASSWORD });
  console.log("signIn 结果:", JSON.stringify(r, null, 2));
} catch(e) { console.log("signIn 异常:", e.message); }

// 3. session 状态
const sess = await page.evaluate(() => window.SupabaseClient.getSession());
console.log("\n=== 3. getSession ===");
console.log(JSON.stringify(sess, null, 2));

console.log("\n=== console + http 日志 ===");
logs.forEach((l) => console.log(l));

await browser.close();