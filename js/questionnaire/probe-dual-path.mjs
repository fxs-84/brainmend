// js/questionnaire/probe-dual-path.mjs
// 验证两条路径 (LIVE):
//   路径 1: 治疗师分发 (预填/不预填) → 都进 DB
//   路径 2: 工作台"立即测评"按钮 → 匿名 → 本机保存 (不进 DB, 显示 local 状态)
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

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });
const logs = [];

try {
  // ============ 路径 1: 治疗师不预填 → 患者扫码自填 → 进 DB ============
  console.log("\n=== 路径 1: 治疗师分发不预填 → 患者自填 → 进 DB ===");
  const tCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const tp = await tCtx.newPage();
  tp.on("console", (m) => logs.push(`[T-${m.type()}] ${m.text()}`));
  tp.on("pageerror", (e) => logs.push(`[T-pageerror] ${e.message}`));

  await tp.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await tp.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
  await tp.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });

  // 创建不预填的 share_link
  const slRes = await tp.evaluate(async () => await window.SupabaseClient.createShareLink({
    name: null, age: null, gender: null, expiresDays: 7
  }));
  const shareToken = slRes.token;
  assert("路径1: 创建不预填 share_link", !!shareToken);

  // 患者扫码答题
  const pCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pp = await pCtx.newPage();
  pp.on("console", (m) => logs.push(`[P1-${m.type()}] ${m.text()}`));
  pp.on("pageerror", (e) => logs.push(`[P1-pageerror] ${e.message}`));
  await pp.goto(base + "/questionnaire.html?sandbox=1&share_token=" + shareToken, { waitUntil: "domcontentloaded" });
  await pp.waitForTimeout(2000);
  await pp.click("#intro-start");
  await pp.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
  for (let q = 1; q <= 100; q++) {
    await pp.click(`.q-option >> nth=${q === 46 ? 2 : q <= 45 ? 2 : 1}`);
    if (q < 100) await pp.waitForTimeout(280);
  }
  await pp.click("#quiz-next");
  await pp.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
  await pp.waitForTimeout(500);
  await pp.fill("#qnr-reg-name", "路径1-王女士");
  await pp.waitForTimeout(200);
  await pp.fill("#qnr-reg-age", "55");
  await pp.waitForTimeout(200);
  await pp.selectOption("#qnr-reg-gender", "女");
  await pp.waitForTimeout(300);
  await pp.click("#qnr-reg-submit");
  await pp.waitForTimeout(5000);

  // 验证 DB
  const sess = await tp.evaluate(() => window.SupabaseClient.getSession());
  const dbRows = await fetch(
    SUPABASE_URL + "/rest/v1/qnr_self_assessments?share_token=eq." + shareToken + "&select=id,patient_name",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token } }
  ).then(r => r.json());
  assert("路径1: DB 有新行", dbRows.length > 0);
  assert("路径1: patient_name = 路径1-王女士", dbRows[0]?.patient_name === "路径1-王女士", dbRows[0]?.patient_name);
  await pCtx.close();

  // ============ 路径 2: 工作台"立即测评"按钮 → 匿名 → 本机 local ============
  console.log("\n=== 路径 2: 工作台'立即测评'按钮 → 匿名 → 本机 local ===");
  // tp 在 index.html 上, 打开工作台
  await tp.evaluate(() => window.BmTherapistUI.openDashboard({ kind: 'qnr' }));
  await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await tp.waitForTimeout(500);
  // ⭐ 立即测评按钮存在
  const btnExists = await tp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#bm-dashboard-modal button"));
    return btns.some(b => b.textContent.includes("立即开始"));
  });
  assert("路径2: 工作台'立即测评'按钮存在", btnExists);
  // 点击 → 应该跳 questionnaire.html?sandbox=1 (无 share_token)
  const navPromise = tp.waitForNavigation({ timeout: 10000 }).catch(() => null);
  await tp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#bm-dashboard-modal button"));
    const btn = btns.find(b => b.textContent.includes("立即开始"));
    if (btn) btn.click();
  });
  const navigated = await navPromise;
  await tp.waitForTimeout(2000);
  const immediateUrl = tp.url();
  console.log("  立即测评跳转后 URL:", immediateUrl);
  assert("路径2: URL 含 sandbox=1", immediateUrl.includes("sandbox=1"));
  assert("路径2: URL 不含 share_token", !immediateUrl.includes("share_token"), immediateUrl);

  // 答题 + 弹登记表(无预填) + 提交 → 应显示 local 状态
  await tp.waitForSelector("#intro-start", { timeout: 10000 });
  await tp.click("#intro-start");
  await tp.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
  for (let q = 1; q <= 100; q++) {
    await tp.click(`.q-option >> nth=${q === 46 ? 2 : q <= 45 ? 2 : 1}`);
    if (q < 100) await tp.waitForTimeout(280);
  }
  await tp.click("#quiz-next");
  await tp.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
  await tp.waitForTimeout(500);
  await tp.fill("#qnr-reg-name", "路径2-匿名");
  await tp.waitForTimeout(200);
  await tp.click("#qnr-reg-submit");
  await tp.waitForTimeout(4000);

  // 验证本机状态 = local (不进 DB)
  const recState = await tp.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    const latest = arr[arr.length - 1] || {};
    return {
      _cloudStatus: latest._cloudStatus,
      _cloudId: latest._cloudId,
      name: latest.patientInfo?.name
    };
  });
  console.log("\n  本机状态:", JSON.stringify(recState));
  assert("路径2: _cloudStatus = local", recState._cloudStatus === "local", recState._cloudStatus);
  assert("路径2: _cloudId 空 (不进云端)", !recState._cloudId, recState._cloudId || "(空)");
  assert("路径2: 报告留在本机 (name 正确)", recState.name === "路径2-匿名", recState.name);

  // 看报告页云端状态行
  const footerText = await tp.evaluate(() => document.getElementById("qnr-cloud-status-footer")?.innerText || "");
  console.log("  报告页状态行:", JSON.stringify(footerText));
  assert("路径2: 报告页显示'本机保存'提示", footerText.includes("本机保存"), footerText.substring(0, 80));

  await tp.screenshot({ path: "js/questionnaire/screenshot-local-mode.png", fullPage: true });
} catch (e) {
  console.error("❌ 异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 关键日志 ===");
logs.filter(l => !l.includes("Failed to load resource") && !l.includes("404")).slice(-20).forEach((l) => console.log(l));
await browser.close();
if (fail > 0) process.exit(1);