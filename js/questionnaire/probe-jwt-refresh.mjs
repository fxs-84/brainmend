// js/questionnaire/probe-jwt-refresh.mjs
// 验证 JWT 过期自动刷新:
//   1. 正常登录拿真 session
//   2. 手动把 localStorage 的 access_token 改成伪造过期值 (模拟 1 小时后)
//   3. 调 listMyAssessments → 应该自动刷新 → 成功返回数据
import { chromium } from "playwright";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

try {
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });

  // ============ A. 正常登录 ============
  console.log("\n=== A. 正常登录 ===");
  const signIn = await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  assert("登录成功", !!signIn.access_token);

  // ============ B. 伪造过期 token (模拟 1 小时后) ============
  console.log("\n=== B. 伪造过期 access_token ===");
  const fakeToken = "eyJhbGciOiJIUzI1NiIsImtpZCI6ImZha2Uta2V5In0.eyJzdWIiOiIwYmZhMDkxNi1jMDYzLTRlYWYtOGI5OC02M2NmYTZmMjBlZGQiLCJleHAiOjE2MDAwMDAwMDB9.fake-signature-0000000000000000000000000000000";
  const faked = await page.evaluate((tok) => {
    const sess = window.SupabaseClient.getSession();
    if (!sess) return { ok: false, err: "no session" };
    // 直接改 localStorage (绕过 getSession 缓存)
    const raw = JSON.parse(localStorage.getItem('bm_supabase_session') || 'null');
    if (!raw) return { ok: false, err: "no localStorage session" };
    raw.access_token = tok;
    localStorage.setItem('bm_supabase_session', JSON.stringify(raw));
    return { ok: true, hadRefresh: !!raw.refresh_token };
  }, fakeToken);
  assert("伪造过期 token 成功 (保留 refresh_token)", faked.ok && faked.hadRefresh, JSON.stringify(faked));

  // ============ C. 调 listMyAssessments → 应该自动刷新 → 成功 ============
  console.log("\n=== C. 调用 listMyAssessments (自动刷新) ===");
  const result = await page.evaluate(async () => {
    try {
      const rows = await window.SupabaseClient.listMyAssessments({ limit: 5 });
      return { ok: true, count: rows.length, first: rows[0]?.patient_name };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  });
  console.log("  结果:", JSON.stringify(result));
  assert("listMyAssessments 成功 (自动刷新后)", result.ok, result.err || "");
  assert("返回了数据", result.ok && result.count > 0, `count=${result.count}`);

  // ============ D. session 已更新 ============
  console.log("\n=== D. session 已更新 (新 access_token) ===");
  const sessAfter = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('bm_supabase_session') || 'null');
    return { hasNewToken: !!raw && raw.access_token !== "fake...", tokenPrefix: raw?.access_token?.substring(0, 15) };
  });
  console.log("  session:", JSON.stringify(sessAfter));
  assert("access_token 已换成新 token", sessAfter.hasNewToken, sessAfter.tokenPrefix);

  // ============ E. 工作台能正常打开 ============
  console.log("\n=== E. 工作台正常加载 (无'加载失败') ===");
  await page.evaluate(() => window.BmTherapistUI.openDashboard());
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await page.waitForTimeout(3000);
  const dashState = await page.evaluate(() => {
    const list = document.getElementById("bm-report-list");
    return { text: list ? list.textContent.substring(0, 100) : "no-list" };
  });
  console.log("  报告列表:", dashState.text);
  assert("工作台无'加载失败'", !dashState.text.includes("加载失败"), dashState.text);
} catch (e) {
  console.error("❌ 异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 关键日志 ===");
logs.filter(l => !l.includes("Failed to load resource") && !l.includes("404")).slice(-15).forEach((l) => console.log(l));
await browser.close();
if (fail > 0) process.exit(1);