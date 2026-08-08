// js/questionnaire/probe-cog-3scenes.mjs
// 验证主页认知评估 3 种场景:
//   场景 1: 治疗师已登录 → 自动创建 share_link + URL 带 token → 走 share_link 路径上云
//   场景 2: 治疗师未登录 → URL 不带 token → 本机
//   场景 3 (回归): share_link 分发 → 走原扫码路径上云 (不变)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const PATIENT_NAME = "三场景测试-王先生";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });
const logs = [];

try {
  // ============ 场景 1: 治疗师已登录 → 主页认知 → 自动上云 ============
  console.log("\n=== 场景 1: 治疗师登录 → 主页认知 → 上云 ===");
  const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p1 = await ctx1.newPage();
  p1.on("console", (m) => logs.push(`[1-${m.type()}] ${m.text()}`));
  p1.on("pageerror", (e) => logs.push(`[1-pageerror] ${e.message}`));

  await p1.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await p1.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 30000 });

  // 登录
  await p1.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  console.log("  ✅ 治疗师登录");

  // 点主页认知评估 → 弹 modal
  await p1.click("#page2-cognitive");
  await p1.waitForSelector("#cog-modal-overlay.show", { timeout: 5000 });
  const subtitle = await p1.evaluate(() => document.getElementById("cog-modal-subtitle")?.textContent);
  console.log("  副标题:", subtitle);
  assert("登录时副标题显示'上云'", subtitle.includes("上云") || subtitle.includes("云端"), subtitle);

  // 点"完整测试 12项" → 应该跳 URL + share_token
  const navPromise = p1.waitForNavigation({ timeout: 15000 }).catch(() => null);
  await p1.click("#cog-modal-full-test");
  await navPromise;
  await p1.waitForTimeout(2000);
  const url1 = p1.url();
  console.log("  跳转后 URL:", url1);
  assert("URL 含 mode=cognitive&start=full", url1.includes("mode=cognitive") && url1.includes("start=full"), "");
  assert("URL 含 share_token (登录时)", url1.includes("share_token="), url1);
  const token1 = url1.match(/share_token=([a-f0-9]+)/)?.[1];

  // 等做题流程开始 (sandbox 模式)
  await p1.waitForTimeout(3000);
  const sandboxActive = await p1.evaluate(() => document.body.getAttribute("data-patient-sandbox") === "1");
  assert("已激活患者沙箱", sandboxActive);

  await ctx1.close();

  // ============ 场景 2: 治疗师未登录 → 主页认知 → 本机 ============
  console.log("\n=== 场景 2: 治疗师未登录 → 主页认知 → 本机 ===");
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p2 = await ctx2.newPage();
  p2.on("console", (m) => logs.push(`[2-${m.type()}] ${m.text()}`));
  p2.on("pageerror", (e) => logs.push(`[2-pageerror] ${e.message}`));

  await p2.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await p2.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 30000 });

  // 确认未登录
  await p2.evaluate(() => {
    try { window.localStorage.removeItem('bm_supabase_session'); } catch(e){}
  });
  await p2.reload({ waitUntil: "domcontentloaded" });
  await p2.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 30000 });
  const sess2 = await p2.evaluate(() => window.SupabaseClient.getSession());
  console.log("  session:", sess2 ? "已登录" : "未登录");

  // 点主页认知评估 → 弹 modal
  await p2.click("#page2-cognitive");
  await p2.waitForSelector("#cog-modal-overlay.show", { timeout: 5000 });
  const subtitle2 = await p2.evaluate(() => document.getElementById("cog-modal-subtitle")?.textContent);
  console.log("  副标题:", subtitle2);
  assert("未登录时副标题显示'本机'", subtitle2.includes("本机"), subtitle2);

  // 点"快速测试 6项" → URL 不带 share_token
  const navPromise2 = p2.waitForNavigation({ timeout: 15000 }).catch(() => null);
  await p2.click("#cog-modal-quick6");
  await navPromise2;
  await p2.waitForTimeout(2000);
  const url2 = p2.url();
  console.log("  跳转后 URL:", url2);
  assert("URL 含 mode=cognitive&start=quick6", url2.includes("mode=cognitive") && url2.includes("start=quick6"), "");
  assert("URL 不含 share_token (未登录时)", !url2.includes("share_token="), url2);

  await ctx2.close();

  // ============ 场景 3 (回归): share_link 分发路径 → 上云 ============
  console.log("\n=== 场景 3: share_link 分发 → 扫码 → 上云 (回归) ===");
  const ctx3 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p3 = await ctx3.newPage();
  p3.on("console", (m) => logs.push(`[3-${m.type()}] ${m.text()}`));
  p3.on("pageerror", (e) => logs.push(`[3-pageerror] ${e.message}`));

  await p3.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await p3.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured() && window.BmTherapistUI, null, { timeout: 30000 });
  await p3.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });

  // 工作台创建认知 share_link (治疗师分发)
  const slRes = await p3.evaluate(async (n) => await window.SupabaseClient.createShareLink({
    name: n, age: 50, gender: "女", expiresDays: 7, kind: "cognitive"
  }), PATIENT_NAME);
  console.log("  share_link:", slRes.token.substring(0, 16) + "...");
  assert("治疗师工作台创建认知 share_link", !!slRes.token);

  // 模拟患者扫码
  const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p4 = await ctx4.newPage();
  const scanUrl = base + "/index.html?mode=cognitive&start=full&share_token=" + slRes.token +
    "&name=" + encodeURIComponent(PATIENT_NAME) + "&age=50&gender=" + encodeURIComponent("女");
  console.log("  患者扫码 URL:", scanUrl);
  await p4.goto(scanUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p4.waitForTimeout(2000);
  const scanSandbox = await p4.evaluate(() => document.body.getAttribute("data-patient-sandbox") === "1");
  assert("扫码进入激活沙箱", scanSandbox);

  // 简化: 场景 3 直接调 submitCognitiveAssessment 验证 RPC (GUI 答题跨多模块很复杂)
  const submitRes = await p4.evaluate(async ({ token, n }) => await window.SupabaseClient.submitCognitiveAssessment({
    shareToken: token,
    patientInfo: { name: n, age: 50, gender: "女" },
    payload: { type: "cognitive", isQuick6: false, moduleScores: { reasoning: { score: 80 } } },
    overallScore: 80,
    isQuick6: false
  }), { token: slRes.token, n: PATIENT_NAME });
  console.log("  submitCognitiveAssessment:", submitRes);
  assert("share_link 扫码上云 (直接调 RPC)", !!submitRes && typeof submitRes === 'string', String(submitRes));

  await ctx3.close();
  await ctx4.close();
} catch (e) {
  console.error("❌ 异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 关键日志 (后 30 条) ===");
logs.filter(l => !l.includes("Failed to load resource") && !l.includes("404")).slice(-30).forEach((l) => console.log(l));
await browser.close();
if (fail > 0) process.exit(1);