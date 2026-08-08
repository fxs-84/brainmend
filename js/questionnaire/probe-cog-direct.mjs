// js/questionnaire/probe-cog-direct.mjs
// 直接测入库链路, 不依赖 GUI 答题 (GUI 答案太难模拟):
//   1. 治疗师登录 → 创建 cognitive share_link
//   2. 直接调 submitCognitiveAssessment (云端 RPC)
//   3. 查 DB cognitive_assessments 验证有行
//   4. 工作台 → 认知 tab → 列表显示该记录 → 点击看详情
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
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

try {
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });

  // ============ A. 登录 + 创建认知 share_link ============
  console.log("\n=== A. 治疗师登录 + 创建认知 share_link ===");
  await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  const sl = await page.evaluate(async () => await window.SupabaseClient.createShareLink({
    name: "认知实验-王先生", age: 45, gender: "男", expiresDays: 7, kind: "cognitive"
  }));
  console.log("  share_link:", JSON.stringify({ id: sl.id, token: sl.token, kind: sl.kind }));
  assert("认知 share_link 已生成", sl.kind === "cognitive", sl.kind);
  const shareToken = sl.token;

  // ============ B. 直接调 submitCognitiveAssessment (anon-key RPC) ============
  console.log("\n=== B. submitCognitiveAssessment 直接调 RPC ===");
  // 模拟真实场景: 模拟 patient 的 payload (用一组假数据)
  const submitRes = await page.evaluate(async ({ token }) => {
    try {
      const id = await window.SupabaseClient.submitCognitiveAssessment({
        shareToken: token,
        patientInfo: { name: "认知实验-王先生", age: 45, gender: "男" },
        payload: {
          // 模拟完整报告 JSON (除 _cloud 字段外的所有)
          type: "cognitive",
          overallScore: 82.5,
          isQuick6: true,
          moduleScores: {
            reasoning: { score: 90, correct: 9, trials: 10, completionRate: 0.9 },
            scenerecall: { score: 85, correct: 8, trials: 10 },
            shortmem: { score: 75, correct: 6, trials: 10 },
            attention: { score: 80, correct: 8, trials: 10, completionRate: 0.8 },
            memory: { score: 70, correct: 7, trials: 10 },
            visual: { score: 88, correct: 9, trials: 10 }
          },
          date: new Date().toISOString().substring(0, 10),
          time: new Date().toTimeString().substring(0, 5)
        },
        overallScore: 82.5,
        isQuick6: true
      });
      return { ok: true, id };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  }, { token: shareToken });
  console.log("  submitCognitiveAssessment:", JSON.stringify(submitRes));
  assert("submitCognitiveAssessment 成功", submitRes.ok, submitRes.id || submitRes.err);

  // ============ C. 查 DB 验证 ============
  console.log("\n=== C. 查 DB 验证 ===");
  if (submitRes.ok) {
    const sess = await page.evaluate(() => window.SupabaseClient.getSession());
    const dbRows = await fetch(
      SUPABASE_URL + "/rest/v1/cognitive_assessments?share_token=eq." + shareToken + "&select=id,patient_name,overall_score,is_quick6,source,therapist_id",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token } }
    ).then(r => r.json());
    console.log("  DB 返回:", JSON.stringify(dbRows, null, 2));
    assert("DB 有新行", Array.isArray(dbRows) && dbRows.length > 0, `count=${dbRows.length}`);
    if (dbRows[0]) {
      assert("patient_name = 认知实验-王先生", dbRows[0].patient_name === "认知实验-王先生", dbRows[0].patient_name);
      assert("overall_score = 82.5", dbRows[0].overall_score === 82.5, String(dbRows[0].overall_score));
      assert("is_quick6 = true", dbRows[0].is_quick6 === true, String(dbRows[0].is_quick6));
      assert("therapist_id 是当前治疗师", dbRows[0].therapist_id === sess.user.id, dbRows[0].therapist_id);
    }
  }

  // ============ D. 工作台 "认知" tab 显示该记录 ============
  console.log("\n=== D. 工作台 认知 tab ===");
  await page.evaluate(() => window.BmTherapistUI.openDashboard());
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await page.evaluate(() => window.BmTherapistUI.switchReportTab('cognitive'));
  await page.waitForTimeout(3000);
  const cogItems = await page.evaluate(() => {
    const list = document.getElementById("bm-report-list");
    return list ? Array.from(list.querySelectorAll(".bm-list-item")).map(el => el.textContent.trim().substring(0, 80)) : [];
  });
  console.log("  认知报告列表:", cogItems);
  assert("认知列表里有 '认知实验-王先生'", cogItems.some(t => t.includes("认知实验-王先生")), cogItems.join(" | "));

  // ============ E. 点击看详情 ============
  console.log("\n=== E. 认知报告详情 ===");
  await page.evaluate(() => {
    const first = document.querySelector("#bm-report-list .bm-list-item");
    if (first) first.click();
  });
  await page.waitForTimeout(1500);
  const cogModal = await page.evaluate(() => {
    // 认知详情是用 __gaitReport.renderReport 渲染, 或者自定义 modal
    const text = document.body.innerText;
    return {
      hasRadar: text.includes("推理") || text.includes("多维度") || text.includes("认知"),
      hasScores: text.includes("总分") || text.includes("综合") || text.includes("分"),
      snippet: text.substring(text.indexOf("认知"), text.indexOf("认知") + 300) || ""
    };
  });
  console.log("  认知详情:", JSON.stringify(cogModal, null, 2).substring(0, 500));
  assert("认知详情显示", cogModal.hasScores, cogModal.snippet.substring(0, 100));
  await page.screenshot({ path: "js/questionnaire/screenshot-cog-detail.png", fullPage: true });
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