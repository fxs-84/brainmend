// js/questionnaire/e2e-cog-gait-integration.mjs
// Supabase 端到端集成测试 (Sprint 2: 认知报告 + 步态报告上云)
//
// 流程:
//  1. 治疗师: 注册 + 登录 Supabase (独立测试邮箱)
//  2. 治疗师: 创建 kind='cognitive' share_link → 校验患者 URL 格式
//  3. 患者 (新 context): 打开认知链接 → 注入最小 _cogScoreLog → window._showCognitiveReport()
//     → 登记表单填姓名/年龄/性别 → saveRecord 本地保存 + Supabase 提交
//  4. 验证: Supabase cognitive_assessments 落库 (patient_name / overall_score / payload 非空 / 无大字段)
//  5. 步态同理: kind='gait' 链接 → 患者 context 直接调 window.__gaitAnalysis.saveAssessment(伪 results)
//     → 登记表单 → 验证 gait_assessments 落库且 payload 不含 phaseSnapshots
//  6. 治疗师工作台: 认知 tab / 步态 tab 各显示新记录
//
// ⚠️ 前置条件:
//   1. 已跑 supabase/migrations/0004_cognitive_gait_reports.sql (新表 + RPC + kind 列)
//   2. assets/config/supabase-config.js 已填入真实 URL + anon key
//
// 用法: node js/questionnaire/e2e-cog-gait-integration.mjs [baseURL]

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "http://localhost:8765";

// 读 supabase-config.js (提取 URL + key)
const configPath = resolvePath(__dirname, "../../assets/config/supabase-config.js");
let SUPABASE_URL = "";
let SUPABASE_KEY = "";
try {
  const src = readFileSync(configPath, "utf8");
  SUPABASE_URL = src.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
  SUPABASE_KEY = src.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
} catch (e) {
  console.error("❌ 无法读取 supabase-config.js:", e.message);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes("YOUR-PROJECT")) {
  console.error("❌ supabase-config.js 未配置或含占位符");
  process.exit(1);
}
console.log("✅ Supabase 配置已读取");
console.log("   URL:", SUPABASE_URL);
console.log("   KEY:", SUPABASE_KEY.substring(0, 20) + "...");

// 固定测试账号 (与 qnr 集成测试共用; 公开注册已关闭, 首次运行若不存在会自动注册建号)
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const TEST_NAME = "测试治疗师";
const COG_PATIENT = { name: "认知患者李四", age: "40", gender: "女" };
const GAIT_PATIENT = { name: "步态患者王五", age: "66", gender: "男" };

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
function pushErr(tag, msg) { if (!msg.includes("Failed to load resource") && !msg.includes("404")) errors.push(`[${tag}] ${msg}`); }

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

// 等本地记录云端状态落定 (synced / failed), 返回最终状态
async function waitCloudStatus(page, storageKey, idField, idValue, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    const st = await page.evaluate(([key, field, val]) => {
      try {
        var arr = JSON.parse(localStorage.getItem(key) || "[]");
        for (var i = 0; i < arr.length; i++) {
          if (arr[i][field] === val) return arr[i]._cloudStatus || (arr[i]._cloudErr ? "failed" : "");
        }
      } catch (e) {}
      return "";
    }, [storageKey, idField, idValue]);
    if (st === "synced" || st === "failed") return st;
    await page.waitForTimeout(500);
  }
  return "timeout";
}

// 带重试的页面加载: GitHub Pages 连接不稳定时 HTML 可能被截断
// (尾部内联脚本没执行, 全局函数不存在), 重载最多 3 次
async function gotoReady(page, url, readyFn, label) {
  for (var attempt = 1; attempt <= 3; attempt++) {
    await page.goto(url, { waitUntil: "commit", timeout: 60000 });
    try {
      await page.waitForFunction(readyFn, null, { timeout: 90000 });
      return;
    } catch (e) {
      console.log("  ⚠️", label, "页面未就绪 (可能 HTML 截断), 重试", attempt, "/3");
    }
  }
  throw new Error(label + " 页面加载重试 3 次后仍未就绪");
}

// 治疗师 REST 查询 (auth, RLS 只允许看自己的)
async function restSelect(session, table, query) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + query, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + session.access_token }
  });
  if (!res.ok) throw new Error(table + " select HTTP " + res.status + ": " + (await res.text()).substring(0, 200));
  return res.json();
}

try {
  // ============ 1. 治疗师注册 + 登录 ============
  console.log("\n=== 1. 治疗师注册 + 登录 ===");
  const tCtx = await browser.newContext();
  const tp = await tCtx.newPage();
  tp.on("pageerror", (e) => pushErr("therapist", e.message));
  await tp.goto(base + "/index.html", { waitUntil: "commit", timeout: 30000 });
  await tp.waitForFunction(
    () => window.BmTherapistUI && window.SupabaseClient && window.SupabaseClient.isConfigured(),
    null,
    { timeout: 90000 }
  );
  await tp.evaluate(() => window.BmTherapistUI.openAuth());
  await tp.waitForSelector("#bm-auth-modal", { state: "visible", timeout: 5000 });
  // 固定账号: 先登录 (默认 signin tab), 不存在再注册兜底
  await tp.fill("#bm-auth-email", TEST_EMAIL);
  await tp.fill("#bm-auth-password", TEST_PASSWORD);
  await tp.click("text=登 录");
  await tp.waitForTimeout(5000);
  let hasSession = await tp.evaluate(() => {
    var s = window.SupabaseClient && window.SupabaseClient.getSession();
    return !!(s && s.access_token);
  });
  if (!hasSession) {
    console.log("  ⚠️ 登录失败 (固定账号可能不存在), 尝试注册建号");
    await tp.evaluate(() => window.BmTherapistUI.switchAuthTab("signup"));
    await tp.waitForTimeout(200);
    await tp.fill("#bm-signup-name", TEST_NAME);
    await tp.fill("#bm-signup-email", TEST_EMAIL);
    await tp.fill("#bm-signup-password", TEST_PASSWORD);
    await tp.click("text=注 册");
    await tp.waitForTimeout(5000);
    hasSession = await tp.evaluate(() => {
      var s = window.SupabaseClient && window.SupabaseClient.getSession();
      return !!(s && s.access_token);
    });
    if (hasSession) console.log("  ✅ 注册成功, 已自动登录");
  } else {
    console.log("  ✅ 固定测试账号登录成功");
  }
  const session = await tp.evaluate(() => window.SupabaseClient && window.SupabaseClient.getSession());
  assert("治疗师登录成功 (session 有 access_token)", session && session.access_token);
  if (!session || !session.access_token) { await browser.close(); process.exit(1); }

  // ============ 2. 创建认知 share_link (kind=cognitive) ============
  console.log("\n=== 2. 创建认知 share_link ===");
  await tp.evaluate(() => window.BmTherapistUI.openDashboard());
  await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await tp.selectOption("#bm-link-kind", "cognitive");
  // 不预填患者信息 → 患者端走登记表单路径
  await tp.click("text=+ 创建链接");
  await tp.waitForTimeout(3000);
  // 从「复制」按钮的 onclick 属性提取完整链接 (textContent 会拼接按钮文字, 不可靠)
  const cogUrl = await tp.evaluate(() => {
    var btn = document.querySelector('#bm-link-result button[onclick*="copyLink"]');
    if (!btn) return "";
    var m = btn.getAttribute("onclick").match(/copyLink\('([^']+)'\)/);
    return m ? m[1] : "";
  });
  console.log("  认知链接:", cogUrl.substring(0, 120));
  assert("认知链接已生成", !!cogUrl);
  assert("认知链接含 mode=cognitive + start=full + share_token",
    cogUrl.includes("mode=cognitive") && cogUrl.includes("start=full") && cogUrl.includes("share_token="));
  const cogToken = (cogUrl.match(/share_token=([a-f0-9]{32})/) || [])[1] || "";
  assert("认知 share_token 已生成 (32 位)", cogToken.length === 32, cogToken || "无");
  if (!cogUrl) { await browser.close(); process.exit(1); }

  // ============ 3. 患者端: 认知报告提交 ============
  console.log("\n=== 3. 患者端认知报告提交 ===");
  const cogCtx = await browser.newContext();
  const cp = await cogCtx.newPage();
  cp.on("pageerror", (e) => pushErr("cog-patient", e.message));
  // 等 cognitive-report.js + Supabase 客户端加载; HTML 截断则自动重载
  // (SupabaseClient 在页面尾部, 能加载说明 HTML 完整)
  await gotoReady(cp, cogUrl,
    () => typeof window._showCognitiveReport === "function" && window.SupabaseClient && window.SupabaseClient.isConfigured(),
    "认知患者页");
  // share_token 应由 deep-link 解析写入 sessionStorage
  const cogTokenSaved = await cp.evaluate(() => sessionStorage.getItem("bm_cog_share_token") || "");
  assert("患者端 share_token 已存 sessionStorage", cogTokenSaved === cogToken);
  // 最短路径: 注入最小分数日志 → _showCognitiveReport 触发 保存+上云
  // (normalizeAllScores 对缺失模块有 || {} 兜底, 2 个模块即可出报告)
  await cp.evaluate(() => {
    window._quick6Mode = false;
    window._cogScoreLog = {
      attention: { score: 80, correct: 8, trials: 10, completionRate: 1, rtAvg: 800 },
      memory: { score: 72, correct: 7, trials: 10, completionRate: 1, rtAvg: 900 }
    };
    window._showCognitiveReport();
  });
  // 登记表单 (患者沙箱流程, 报告生成前弹)
  await cp.waitForSelector("#cog-reg-overlay", { state: "visible", timeout: 10000 });
  await cp.fill("#cog-reg-name", COG_PATIENT.name);
  await cp.fill("#cog-reg-age", COG_PATIENT.age);
  await cp.selectOption("#cog-reg-gender", COG_PATIENT.gender);
  await cp.click("#cog-reg-submit");
  console.log("  登记表单已提交, 等待云端同步...");
  // 等 saveRecord 写本地 + _submitCogCloud 落定
  await cp.waitForFunction(() => {
    try {
      var arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
      return arr.length > 0 && arr[0].id;
    } catch (e) { return false; }
  }, null, { timeout: 10000 });
  const cogLocalId = await cp.evaluate(() => {
    var arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    return arr[0] ? arr[0].id : "";
  });
  const cogCloudStatus = await waitCloudStatus(cp, "cog_records", "id", cogLocalId, 20000);
  assert("认知记录云端状态 = synced", cogCloudStatus === "synced", "status=" + cogCloudStatus);

  // ============ 4. 验证 cognitive_assessments 落库 ============
  console.log("\n=== 4. 验证 cognitive_assessments ===");
  if (cogCloudStatus === "synced") {
    const cogRows = await restSelect(session, "cognitive_assessments",
      "select=id,patient_name,patient_age,overall_score,is_quick6,payload,share_token&order=submitted_at.desc&limit=5");
    const cogMatch = cogRows.find(r => r.share_token === cogToken);
    assert("Supabase 中找到本 share_token 的认知记录", !!cogMatch);
    if (cogMatch) {
      assert("patient_name 正确", cogMatch.patient_name === COG_PATIENT.name, cogMatch.patient_name);
      assert("overall_score 非空", cogMatch.overall_score != null, "score=" + cogMatch.overall_score);
      assert("is_quick6 = false", cogMatch.is_quick6 === false);
      assert("payload 非空且含 normalizedScores", !!(cogMatch.payload && cogMatch.payload.normalizedScores));
      assert("payload 无 phaseSnapshots 类大字段", !(cogMatch.payload && cogMatch.payload.phaseSnapshots));
    }
  } else {
    console.log("  ⏭️ 跳过落库验证 (云端未同步, 可能是 0004 迁移未执行)");
    fail++;
  }

  // ============ 5. 步态: 建链接 + 患者提交 + 落库验证 ============
  console.log("\n=== 5. 步态报告链路 ===");
  // 治疗师 dashboard 可能已被认知流程关掉, 确保打开
  if (!(await tp.locator("#bm-dashboard-modal").count())) {
    await tp.evaluate(() => window.BmTherapistUI.openDashboard());
    await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  }
  await tp.selectOption("#bm-link-kind", "gait");
  await tp.click("text=+ 创建链接");
  await tp.waitForTimeout(3000);
  const gaitUrl = await tp.evaluate(() => {
    var btn = document.querySelector('#bm-link-result button[onclick*="copyLink"]');
    if (!btn) return "";
    var m = btn.getAttribute("onclick").match(/copyLink\('([^']+)'\)/);
    return m ? m[1] : "";
  });
  console.log("  步态链接:", gaitUrl.substring(0, 120));
  assert("步态链接含 mode=gait + share_token (无 start 参数)",
    gaitUrl.includes("mode=gait") && gaitUrl.includes("share_token=") && !gaitUrl.includes("start="));
  const gaitToken = (gaitUrl.match(/share_token=([a-f0-9]{32})/) || [])[1] || "";
  assert("步态 share_token 已生成 (32 位)", gaitToken.length === 32, gaitToken || "无");

  if (gaitUrl) {
    const gaitCtx = await browser.newContext();
    const gp = await gaitCtx.newPage();
    gp.on("pageerror", (e) => pushErr("gait-patient", e.message));
    // 等 gait-analysis.js + Supabase 客户端加载; HTML 截断则自动重载
    // (SupabaseClient 在页面尾部, 能加载说明 HTML 完整)
    await gotoReady(gp, gaitUrl,
      () => window.__gaitAnalysis && typeof window.__gaitAnalysis.saveAssessment === "function"
        && window.SupabaseClient && window.SupabaseClient.isConfigured(),
      "步态患者页");
    const gaitTokenSaved = await gp.evaluate(() => sessionStorage.getItem("bm_gait_share_token") || "");
    assert("患者端步态 share_token 已存 sessionStorage", gaitTokenSaved === gaitToken);
    // 最短路径: 直接调 saveAssessment 注入伪 results (含大 phaseSnapshots, 验证提交前剥离)
    await gp.evaluate(() => {
      window.__gaitAnalysis.saveAssessment({
        timestamp: new Date().toISOString(),
        parameters: { cadence: { value: 102, status: "normal" }, speed: { value: 1.1, status: "normal" } },
        asymmetries: { stepTime: { value: 3.2, status: "mild" } },
        classification: { primary: "e2e_test_gait", primaryLabel: "E2E测试步态", confidence: 0.9 },
        neuro: { score: 80 },
        rehab: { suggestion: "e2e" },
        phaseSnapshots: [
          { side: "left", phase: "loading", dataUrl: "data:image/png;base64,E2E_BIG_SNAPSHOT_MARKER_" + "A".repeat(1024) }
        ]
      });
    });
    // 有 share_token 且无患者信息 → 弹登记表单
    await gp.waitForSelector("#gait-reg-overlay", { state: "visible", timeout: 10000 });
    await gp.fill("#gait-reg-name", GAIT_PATIENT.name);
    await gp.fill("#gait-reg-age", GAIT_PATIENT.age);
    await gp.selectOption("#gait-reg-gender", GAIT_PATIENT.gender);
    await gp.click("#gait-reg-submit");
    console.log("  步态登记表单已提交, 等待云端同步...");
    // 取刚保存记录的 _localId, 再轮询其云端状态
    const gaitLocalId = await gp.evaluate(() => {
      try {
        var arr = JSON.parse(localStorage.getItem("gait_assessment_log") || "[]");
        return arr.length ? arr[arr.length - 1]._localId : "";
      } catch (e) { return ""; }
    });
    const gaitStatus = gaitLocalId
      ? await waitCloudStatus(gp, "gait_assessment_log", "_localId", gaitLocalId, 20000)
      : "no_local_record";
    assert("步态记录本地已保存", !!gaitLocalId);
    assert("步态记录云端状态 = synced", gaitStatus === "synced", "status=" + gaitStatus);

    // 验证 gait_assessments 落库
    if (gaitStatus === "synced") {
      const gaitRows = await restSelect(session, "gait_assessments",
        "select=id,patient_name,patient_age,classification_primary,payload,share_token&order=submitted_at.desc&limit=5");
      const gaitMatch = gaitRows.find(r => r.share_token === gaitToken);
      assert("Supabase 中找到本 share_token 的步态记录", !!gaitMatch);
      if (gaitMatch) {
        assert("patient_name 正确", gaitMatch.patient_name === GAIT_PATIENT.name, gaitMatch.patient_name);
        assert("classification_primary 正确", gaitMatch.classification_primary === "e2e_test_gait", gaitMatch.classification_primary);
        assert("payload 非空且含 parameters", !!(gaitMatch.payload && gaitMatch.payload.parameters));
        assert("payload 已剥离 phaseSnapshots", !(gaitMatch.payload && gaitMatch.payload.phaseSnapshots));
        assert("payload 无截图 marker 泄漏",
          JSON.stringify(gaitMatch.payload || {}).indexOf("E2E_BIG_SNAPSHOT_MARKER") < 0);
      }
    } else {
      console.log("  ⏭️ 跳过步态落库验证 (云端未同步, 可能是 0004 迁移未执行)");
      fail++;
    }
    await gaitCtx.close();
  }

  // ============ 6. 治疗师工作台: 认知/步态 tab 各显示新记录 ============
  console.log("\n=== 6. 治疗师列表查看 (认知 / 步态 tab) ===");
  if (!(await tp.locator("#bm-dashboard-modal").count())) {
    await tp.evaluate(() => window.BmTherapistUI.openDashboard());
    await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  }
  await tp.evaluate(() => window.BmTherapistUI.switchReportTab("cognitive"));
  await tp.waitForTimeout(3000);
  const cogTabText = await tp.locator("#bm-report-list").textContent();
  assert("认知 tab 显示新报告", cogTabText.includes(COG_PATIENT.name), cogTabText.substring(0, 80));
  assert("认知 tab 显示总分徽标", /分/.test(cogTabText));

  await tp.evaluate(() => window.BmTherapistUI.switchReportTab("gait"));
  await tp.waitForTimeout(3000);
  const gaitTabText = await tp.locator("#bm-report-list").textContent();
  assert("步态 tab 显示新报告", gaitTabText.includes(GAIT_PATIENT.name), gaitTabText.substring(0, 80));
  assert("步态 tab 显示分类徽标", gaitTabText.includes("e2e_test_gait"));

  // 确认 qnr tab 不受影响 (默认 tab, 正常加载不报错)
  await tp.evaluate(() => window.BmTherapistUI.switchReportTab("qnr"));
  await tp.waitForTimeout(2000);
  const qnrTabText = await tp.locator("#bm-report-list").textContent();
  assert("自评 tab 正常加载 (无报错)", !qnrTabText.includes("加载失败"), qnrTabText.substring(0, 60));

  await cogCtx.close();
} catch (e) {
  console.error("❌ 测试异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(50));
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (errors.length) {
  console.log("\n  错误日志:");
  errors.slice(0, 5).forEach(e => console.log("    " + e));
}
await browser.close();
if (fail > 0) process.exit(1);
