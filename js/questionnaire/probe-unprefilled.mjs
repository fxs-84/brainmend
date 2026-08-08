// js/questionnaire/probe-unprefilled.mjs
// 关键测试: 治疗师不预填姓名 → 患者扫码 → 弹登记表 → 患者填表 → 提交 → 验证 DB 有新行
// (验证治疗师"无预填分发"也能进数据库, 这是用户最在意的场景)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const cfg = readFileSync(resolvePath(__dirname, "../../assets/config/supabase-config.js"), "utf8");
const SUPABASE_URL = cfg.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const SUPABASE_KEY = cfg.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const PATIENT_SELF_NAME = "患者自填-赵女士";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });
const logs = [];

try {
  // ============ A. 治疗师创建 share_link (不预填姓名) ============
  console.log("\n=== A. 治疗师创建 share_link (不预填) ===");
  const tCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const tp = await tCtx.newPage();
  tp.on("console", (m) => logs.push(`[T-${m.type()}] ${m.text()}`));
  tp.on("pageerror", (e) => logs.push(`[T-pageerror] ${e.message}`));

  await tp.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await tp.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
  await tp.evaluate(async ({ email, pw }) => {
    return await window.SupabaseClient.signIn(email, pw);
  }, { email: TEST_EMAIL, pw: TEST_PASSWORD });

  // ⭐ 关键: 不预填任何信息, 直接创建 share_link (kind=qnr)
  const slRes = await tp.evaluate(async () => {
    return await window.SupabaseClient.createShareLink({
      name: null,  // ← 不预填
      age: null,
      gender: null,
      expiresDays: 7
    });
  });
  console.log("  创建结果:", JSON.stringify({
    id: slRes.id,
    token: slRes.token,
    prefilled_name: slRes.prefilled_name,
    prefilled_age: slRes.prefilled_age,
    prefilled_gender: slRes.prefilled_gender
  }, null, 2));
  assert("share_token 已生成", !!slRes.token && slRes.token.length >= 30);
  assert("无预填姓名 (prefilled_name=null)", !slRes.prefilled_name);

  const shareToken = slRes.token;

  // ============ B. 患者扫码 (URL 没 name/age/gender) ============
  console.log("\n=== B. 患者扫码 (URL 没预填) ===");
  const pCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pp = await pCtx.newPage();
  pp.on("console", (m) => logs.push(`[P-${m.type()}] ${m.text()}`));
  pp.on("pageerror", (e) => logs.push(`[P-pageerror] ${e.message}`));
  pp.on("response", async (r) => {
    if (r.url().includes("supabase") && r.url().includes("/rest/")) {
      let body = "";
      try { body = await r.text(); } catch(e) {}
      if (r.status() >= 400) logs.push(`[P-http] ${r.status()} ${r.request().method()} err: ${body.substring(0, 200)}`);
    }
  });

  // ⭐ 关键: URL 只有 share_token, 没有 name/age/gender
  const qnrUrl = base + "/questionnaire.html?sandbox=1&share_token=" + shareToken;
  console.log("  患者 URL:", qnrUrl);
  await pp.goto(qnrUrl, { waitUntil: "domcontentloaded" });
  await pp.waitForTimeout(2000);

  // 答题 100 题
  await pp.click("#intro-start");
  await pp.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
  for (let q = 1; q <= 100; q++) {
    const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
    await pp.click(`.q-option >> nth=${optIndex}`);
    if (q < 100) await pp.waitForTimeout(280);
  }
  await pp.click("#quiz-next");
  await pp.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });

  // ⭐ 关键: 因为 URL 没预填, 应该弹登记表
  await pp.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
  assert("弹出了登记表 (因为没预填)", true);

  // 患者自己填表 (加 wait 避免 Playwright fill race condition)
  await pp.waitForTimeout(500);
  await pp.fill("#qnr-reg-name", PATIENT_SELF_NAME);
  await pp.waitForTimeout(200);
  await pp.fill("#qnr-reg-age", "38");
  await pp.waitForTimeout(200);
  await pp.selectOption("#qnr-reg-gender", "女");
  await pp.waitForTimeout(300);
  // 校验 input 真实值
  const inputVals = await pp.evaluate(() => ({
    name: document.getElementById("qnr-reg-name").value,
    age: document.getElementById("qnr-reg-age").value,
    gender: document.getElementById("qnr-reg-gender").value
  }));
  console.log("  提交前 input 真实值:", JSON.stringify(inputVals));
  console.log("  ✅ 患者自填: " + PATIENT_SELF_NAME + " / 38 / 女");

  await pp.click("#qnr-reg-submit");
  await pp.waitForTimeout(6000);

  // ============ C. 检查本机状态 + DB 是否有新行 ============
  console.log("\n=== C. 验证本机 + 云端 ===");
  const recState = await pp.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    const latest = arr[arr.length - 1] || {};
    return {
      _cloudStatus: latest._cloudStatus,
      _cloudId: latest._cloudId,
      _cloudSource: latest._cloudSource,
      _cloudErr: latest._cloudErr,
      name: latest.patientInfo?.name,
      age: latest.patientInfo?.age,
      gender: latest.patientInfo?.gender
    };
  });
  console.log("  本机:", JSON.stringify(recState, null, 2));
  assert("本机 _cloudStatus = synced", recState._cloudStatus === "synced", recState._cloudStatus);
  assert("本机 _cloudId 已写入", !!recState._cloudId, recState._cloudId || "(无)");
  assert("本机 patientInfo.name = 患者自填", recState.name === PATIENT_SELF_NAME, recState.name);

  // 直接查 DB
  const sess = await tp.evaluate(() => window.SupabaseClient.getSession());
  const dbRows = await fetch(
    SUPABASE_URL + "/rest/v1/qnr_self_assessments?share_token=eq." + shareToken + "&select=id,patient_name,patient_age,patient_gender,total_score,percent,worst_severity",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token } }
  ).then(r => r.json());
  console.log("\n  DB 返回:", JSON.stringify(dbRows, null, 2));
  assert("DB 里有新行", Array.isArray(dbRows) && dbRows.length > 0, `count=${dbRows.length}`);
  if (dbRows.length) {
    assert("DB patient_name = 患者自填", dbRows[0].patient_name === PATIENT_SELF_NAME, dbRows[0].patient_name);
    assert("DB patient_age = 38", dbRows[0].patient_age === 38, dbRows[0].patient_age);
    assert("DB patient_gender = 女", dbRows[0].patient_gender === "女", dbRows[0].patient_gender);
  }
} catch (e) {
  console.error("❌ 异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 关键日志 ===");
logs.filter(l => !l.includes("Failed to load resource") && !l.includes("404")).slice(-25).forEach((l) => console.log(l));

await browser.close();
if (fail > 0) process.exit(1);