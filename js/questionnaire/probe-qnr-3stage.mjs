// js/questionnaire/probe-qnr-3stage.mjs
// 三阶段端到端: 登录 → 创建 share_link → 患者答题 → 验证数据库
// 完全用 API (evaluate), 不依赖 UI modal 可靠性
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "http://localhost:8765";
const configPath = resolvePath(__dirname, "../../assets/config/supabase-config.js");
const cfg = readFileSync(configPath, "utf8");
const SUPABASE_URL = cfg.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const SUPABASE_KEY = cfg.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const PATIENT_NAME = "真实流程-王女士";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}
function log(...a) { console.log(...a); }

const browser = await chromium.launch({ channel: "chrome" });
const allLogs = [];

try {
  // ============ Stage A: 治疗师登录 ============
  log("\n=== A. 治疗师登录 ===");
  const ctxA = await browser.newContext();
  const pA = await ctxA.newPage();
  pA.on("console", (m) => allLogs.push(`[A-${m.type()}] ${m.text()}`));
  pA.on("pageerror", (e) => allLogs.push(`[A-pageerror] ${e.message}`));
  pA.on("response", async (r) => {
    if (r.url().includes("supabase") && !r.url().includes("models/")) {
      let body = "";
      try { body = await r.text(); } catch(e) {}
      allLogs.push(`[A-http] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`);
      if (r.status() >= 400) allLogs.push(`   err: ${body.substring(0, 300)}`);
    }
  });
  await pA.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await pA.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 30000 });

  // 直接调 signIn
  const signInRes = await pA.evaluate(async ({ email, pw }) => {
    try {
      const data = await window.SupabaseClient.signIn(email, pw);
      return { ok: true, access_token: data.access_token, user_id: data.user?.id };
    } catch (e) { return { ok: false, err: String(e.message || e) }; }
  }, { email: TEST_EMAIL, pw: TEST_PASSWORD });
  log("signIn:", JSON.stringify(signInRes));
  assert("治疗师登录成功", signInRes.ok && !!signInRes.access_token, signInRes.user_id || "");
  if (!signInRes.ok) { await browser.close(); process.exit(1); }

  // ============ Stage B: 创建 share_link ============
  log("\n=== B. 创建 share_link ===");
  const shareLink = await pA.evaluate(async ({ name }) => {
    try {
      const data = await window.SupabaseClient.createShareLink({
        name: name, age: 35, gender: "男", expiresDays: 7
      });
      return { ok: true, data };
    } catch (e) { return { ok: false, err: String(e.message || e) }; }
  }, { name: PATIENT_NAME });
  log("createShareLink:", JSON.stringify(shareLink));
  const shareToken = shareLink.ok && shareLink.data && (shareLink.data.token || shareLink.data.share_token);
  assert("share_token 已生成", !!shareToken && shareToken.length >= 30, shareToken || "(无)");
  if (!shareToken) { await browser.close(); process.exit(1); }

  // ============ Stage C: 患者扫码答题 + 提交 ============
  log("\n=== C. 患者答题 ===");
  const ctxC = await browser.newContext();
  const pC = await ctxC.newPage();
  pC.on("console", (m) => allLogs.push(`[C-${m.type()}] ${m.text()}`));
  pC.on("pageerror", (e) => allLogs.push(`[C-pageerror] ${e.message}`));
  pC.on("response", async (r) => {
    if (r.url().includes("supabase") && !r.url().includes("models/")) {
      let body = "";
      try { body = await r.text(); } catch(e) {}
      allLogs.push(`[C-http] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`);
      if (r.status() >= 400) allLogs.push(`   err: ${body.substring(0, 300)}`);
    }
  });

  const realUrl = base + "/questionnaire.html?sandbox=1&share_token=" + shareToken +
    "&name=" + encodeURIComponent(PATIENT_NAME) + "&age=35&gender=" + encodeURIComponent("男");
  log("患者 URL:", realUrl);
  await pC.goto(realUrl, { waitUntil: "domcontentloaded" });
  await pC.waitForTimeout(2000);
  await pC.click("#intro-start");
  await pC.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
  for (let q = 1; q <= 100; q++) {
    const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
    await pC.click(`.q-option >> nth=${optIndex}`);
    if (q < 100) await pC.waitForTimeout(280);
  }
  await pC.click("#quiz-next");
  await pC.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });
  await pC.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
  await pC.waitForTimeout(500);
  log("点提交按钮...");
  await pC.click("#qnr-reg-submit");
  await pC.waitForTimeout(8000);

  const recState = await pC.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    const latest = arr[arr.length - 1] || {};
    return {
      count: arr.length,
      _cloudStatus: latest._cloudStatus,
      _cloudErr: latest._cloudErr,
      _cloudId: latest._cloudId,
      _cloudSource: latest._cloudSource,
      patientName: latest.patientInfo && latest.patientInfo.name
    };
  });
  log("\n患者 localStorage:", JSON.stringify(recState, null, 2));
  assert("本机状态 = synced", recState._cloudStatus === "synced", recState._cloudStatus);
  assert("本机 _cloudId 已写入", !!recState._cloudId, recState._cloudId || "(无)");

  // ============ Stage D: 直接查 Supabase ============
  log("\n=== D. 直接查 Supabase REST ===");
  const dbRes = await fetch(
    SUPABASE_URL + "/rest/v1/qnr_self_assessments?share_token=eq." + shareToken + "&select=id,patient_name,total_score,percent,worst_severity,submitted_at",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + signInRes.access_token } }
  );
  const dbRows = await dbRes.json();
  log("DB 返回:", JSON.stringify(dbRows, null, 2));
  assert("DB HTTP 200", dbRes.status === 200, "status=" + dbRes.status);
  assert("DB 里能找到匹配 share_token 的行", Array.isArray(dbRows) && dbRows.length > 0, `count=${dbRows?.length}`);
  if (dbRows?.length) {
    assert("DB 行 patient_name 匹配", dbRows[0].patient_name === PATIENT_NAME, dbRows[0].patient_name);
    assert("DB 行 total_score > 0", dbRows[0].total_score > 0, `total=${dbRows[0].total_score}`);
  }
} catch (e) {
  log("❌ 异常:", e.message);
  fail++;
}

log("\n" + "═".repeat(60));
log(`  通过 ${pass} / 失败 ${fail}`);
log("\n=== 关键 console + http 日志 (最后 40 条) ===");
allLogs.slice(-40).forEach((l) => log(l));

await browser.close();
if (fail > 0) process.exit(1);