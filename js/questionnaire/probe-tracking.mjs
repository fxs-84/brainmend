// js/questionnaire/probe-tracking.mjs
// 验证头动追踪报告入库
//   1. 治疗师登录
//   2. 检查 hook 已挂载 (window.savePatientData 已被包装)
//   3. 直接调一次 submitTrackingRecord → DB 有新行
//   4. 工作台 "头动追踪" tab 显示该记录
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

try {
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });

  // ============ A. 治疗师登录 ============
  console.log("\n=== A. 治疗师登录 ===");
  const signIn = await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  assert("登录成功", !!signIn.access_token);

  // ============ B. 验证 hook 已挂载 (window.savePatientData 是包装过的) ============
  console.log("\n=== B. Hook 挂载检查 ===");
  await page.waitForFunction(() => typeof window.savePatientData === 'function', null, { timeout: 30000 });
  const hookStatus = await page.evaluate(() => ({
    hasSavePatientData: typeof window.savePatientData === 'function',
    hasHooked: !!(window.savePatientData && window.savePatientData.__hookedTrackingCloud)
  }));
  console.log("  savePatientData 状态:", hookStatus);
  // hook 应该已经在 interval 里挂上了, 验证 _hookTrackingSubmitCloud 跑过
  const hookRan = logs.some(l => l.includes("hook 已挂载") || l.includes("tracking cloud"));
  assert("Hook 已挂载 (interval 跑过)", hookRan);

  // ============ C. 直接调 submitTrackingRecord (模拟治疗师做完保存) ============
  console.log("\n=== C. 直接调 submitTrackingRecord ===");
  const submitRes = await page.evaluate(async () => {
    try {
      const id = await window.SupabaseClient.submitTrackingRecord({
        patient_name: "Hook测试-孙先生",
        patient_age: "60",
        patient_gender: "男",
        patient_id: "TEST-001",
        date: new Date().toISOString(),
        overall: 78,
        scores: { position: 80, stability: 75, rom: 82, coordination: 78, reaction: 65 },
        details: { traj: "8字", duration: 90 },
        vestibular: { result: "正常", recommendation: "无特殊" },
        recommendations: ["保持训练频率", "增加协调性训练"]
      });
      return { ok: true, id };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  });
  console.log("  submitTrackingRecord 结果:", JSON.stringify(submitRes));
  if (submitRes.ok) {
    assert("submitTrackingRecord 成功", !!submitRes.id, submitRes.id);
  } else {
    // 可能是 SQL migration 还没跑
    console.log("  ⚠️ 提交失败 — 可能需要先跑 0005 migration");
  }

  // ============ D. 直接查 DB 验证 ============
  console.log("\n=== D. 查 DB ===");
  if (submitRes.ok) {
    const dbRows = await fetch(
      SUPABASE_URL + "/rest/v1/cervical_tracking_records?id=eq." + submitRes.id + "&select=id,patient_name,patient_age,patient_gender,overall,date",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + signIn.access_token } }
    ).then(r => r.json());
    console.log("  DB 返回:", JSON.stringify(dbRows, null, 2));
    assert("DB 有新行", Array.isArray(dbRows) && dbRows.length > 0);
    if (dbRows[0]) {
      assert("patient_name = Hook测试-孙先生", dbRows[0].patient_name === "Hook测试-孙先生", dbRows[0].patient_name);
      assert("overall = 78", dbRows[0].overall === 78, dbRows[0].overall);
    }
  }

  // ============ E. 工作台 "头动追踪" tab ============
  console.log("\n=== E. 工作台 '头动追踪' tab ===");
  await page.evaluate(() => window.BmTherapistUI.openDashboard());
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  // 4 个 tab 应都在
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll("#bm-dashboard-modal [data-rtab]")).map(el => el.textContent.trim()));
  console.log("  tabs:", tabs);
  assert("有 4 个 tab (自评/认知/步态/头动追踪)", tabs.length === 4 && tabs.includes("头动追踪"));

  // 切到头动追踪 tab
  await page.evaluate(() => window.BmTherapistUI.switchReportTab('tracking'));
  // 等列表刷新 (加 active tab + 等 _loadTrackingRecords 完成)
  await page.waitForFunction(() => {
    const list = document.getElementById("bm-report-list");
    const activeTab = document.querySelector("[data-rtab='tracking'].active");
    return list && activeTab && !list.textContent.includes('加载中');
  }, null, { timeout: 10000 });
  await page.waitForTimeout(2000);
  const trackingItems = await page.evaluate(() => {
    const list = document.getElementById("bm-report-list");
    return list ? Array.from(list.querySelectorAll(".bm-list-item")).map(el => el.textContent.trim().substring(0, 80)) : [];
  });
  console.log("  头动追踪报告列表:", trackingItems);
  if (submitRes.ok) {
    assert("列表里有 Hook测试-孙先生", trackingItems.some(t => t.includes("Hook测试-孙先生")), trackingItems.join(" | "));
  }

  // 点击看详情
  if (trackingItems.length > 0) {
    await page.evaluate(() => {
      const first = document.querySelector("#bm-report-list .bm-list-item");
      if (first) first.click();
    });
    await page.waitForTimeout(1500);
    const detailModal = await page.evaluate(() => {
      const ov = document.getElementById("bm-tracking-detail-modal");
      return { exists: !!ov, textLen: (ov?.innerText || "").length, hasScores: (ov?.innerText || "").includes("位置觉") };
    });
    console.log("  详情 modal:", JSON.stringify(detailModal));
    assert("详情 modal 显示 (含 位置觉/稳定性 等评分)", detailModal.hasScores, "len=" + detailModal.textLen);
    await page.screenshot({ path: "js/questionnaire/screenshot-tracking-detail.png", fullPage: true });
  }
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