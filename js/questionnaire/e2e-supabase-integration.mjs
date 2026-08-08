// js/questionnaire/e2e-supabase-integration.mjs
// Supabase 端到端集成测试 (Sprint 1 验证)
//
// 流程:
//  1. 治疗师: 注册 + 登录 Supabase
//  2. 治疗师: 创建 share_link → 拿 token
//  3. 患者: 扫码 (新 context) → 沙箱答题 → 提交 (走 RPC)
//  4. 验证: Supabase 端 qnr_self_assessments 有新行
//  5. 治疗师: 重新登录 → 列表里有这条报告
//
// ⚠️ 前置条件:
//   1. 已经在 Supabase 创建项目并跑完 0001_brainmend_baseline.sql
//   2. assets/config/supabase-config.js 已填入真实 URL + anon key
//   3. 项目里把邮箱注册功能开启 (默认开启, 但需要关掉"邮箱确认"才能自动登录)
//
// 用法: node js/questionnaire/e2e-supabase-integration.mjs [baseURL]

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

// 固定测试账号 (公开注册已关闭; 首次运行若不存在会自动注册建号)
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const TEST_NAME = "测试治疗师";
const PATIENT_NAME = "测试患者张三";

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
function pushErr(tag, msg) { if (!msg.includes("Failed to load resource") && !msg.includes("404")) errors.push(`[${tag}] ${msg}`); }

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

try {
  // ============ 1. 治疗师注册 + 登录 ============
  console.log("\n=== 1. 治疗师注册 + 登录 ===");
  const tCtx = await browser.newContext();
  const tp = await tCtx.newPage();
  tp.on("pageerror", (e) => pushErr("therapist", e.message));
  await tp.goto(base + "/index.html", { waitUntil: "commit", timeout: 30000 });
  // 等关键脚本就绪 (LIVE CDN 慢/偶发 HTML 截断, 固定等待不可靠; 最多重载 3 次)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await tp.waitForFunction(
        () => window.BmTherapistUI && window.SupabaseClient && window.SupabaseClient.isConfigured(),
        null,
        { timeout: 90000 }
      );
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log("  ⚠️ 治疗师页未就绪 (可能 HTML 截断), 重载", attempt, "/3");
      await tp.reload({ waitUntil: "commit" });
    }
  }
  // 打开登录 modal
  await tp.evaluate(() => window.BmTherapistUI && window.BmTherapistUI.openAuth());
  await tp.waitForSelector("#bm-auth-modal", { state: "visible", timeout: 5000 });
  console.log("  ✅ 登录 modal 打开");
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
    if (hasSession) console.log("  ✅ 注册成功, 已自动登录 (Confirm email 已关)");
  } else {
    console.log("  ✅ 固定测试账号登录成功");
  }
  const sessionAfter = await tp.evaluate(() => window.SupabaseClient && window.SupabaseClient.getSession());
  assert("治疗师登录成功 (session 有 access_token)", sessionAfter && sessionAfter.access_token, sessionAfter ? "" : "no session");
  if (sessionAfter && sessionAfter.access_token) {
    // ============ 2. 创建 share_link ============
    console.log("\n=== 2. 创建 share_link ===");
    await tp.evaluate(() => window.BmTherapistUI.openDashboard());
    await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
    await tp.fill("#bm-link-name", PATIENT_NAME);
    await tp.fill("#bm-link-age", "35");
    await tp.selectOption("#bm-link-gender", "男");
    await tp.click("text=+ 创建链接");
    await tp.waitForTimeout(3000);
    const linkResult = await tp.evaluate(() => {
      var el = document.getElementById("bm-link-result");
      return el ? el.textContent : "";
    });
    console.log("  创建结果:", linkResult.substring(0, 100));
    // 提取 token
    const shareToken = await tp.evaluate(() => {
      var txt = document.getElementById("bm-link-result")?.textContent || "";
      var m = txt.match(/share_token=([a-f0-9]{32})/);
      return m ? m[1] : null;
    });
    assert("share_token 已生成", shareToken && shareToken.length === 32, shareToken || "无");
    if (!shareToken) { await browser.close(); process.exit(1); }
    // ============ 3. 患者扫码 + 做题 + 提交 ============
    console.log("\n=== 3. 患者扫码 + 提交 ===");
    const pCtx = await browser.newContext();
    const pp = await pCtx.newPage();
    pp.on("pageerror", (e) => pushErr("patient", e.message));
    const qnrUrl = base + "/questionnaire.html?sandbox=1&share_token=" + shareToken +
      "&name=" + encodeURIComponent(PATIENT_NAME) + "&age=35&gender=" + encodeURIComponent("男");
    await pp.goto(qnrUrl, { waitUntil: "networkidle" });
    await pp.waitForTimeout(2000);
    await pp.click("#intro-start");
    await pp.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
    for (let q = 1; q <= 100; q++) {
      const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
      await pp.click(`.q-option >> nth=${optIndex}`);
      if (q < 100) await pp.waitForTimeout(400);  // >= 280ms auto-advance
    }
    await pp.click("#quiz-next");
    await pp.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });
    // 登记表单仅在 URL 未预填姓名时弹出; 本测试链接预填了姓名 → 直接内联渲染
    const regVisible = await pp.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 })
      .then(() => true).catch(() => false);
    if (regVisible) {
      await pp.waitForTimeout(500);
      await pp.click("#qnr-reg-submit");
    } else {
      console.log("  ℹ️ 姓名已预填, 跳过登记表单 (内联渲染路径)");
      // 确认内联报告已渲染
      await pp.waitForFunction(() => {
        var el = document.getElementById("qnr-report-body");
        return el && el.innerHTML.length > 500;
      }, null, { timeout: 15000 });
      console.log("  ✅ 内联报告已渲染 (预填路径)");
    }
    await pp.waitForTimeout(6000);
    // 验证 Supabase 中是否有新行
    // 治疗师 session 用的是全局 session, 这里直接 fetch
    const therapistSession = await tp.evaluate(() => window.SupabaseClient.getSession());
    const assessments = await fetch(SUPABASE_URL + "/rest/v1/qnr_self_assessments?select=id,patient_name,share_token&order=submitted_at.desc&limit=5", {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + therapistSession.access_token
      }
    }).then(r => r.json());
    console.log("  Supabase 中最近的 5 条自评:");
    assessments.forEach(a => console.log("    -", a.patient_name, "· token:", a.share_token?.substring(0, 16) + "..."));
    const matchRow = assessments.find(a => a.share_token === shareToken);
    assert("Supabase 中找到本 share_token 的记录", !!matchRow);
    if (matchRow) {
      // ============ 4. 治疗师列表查看 ============
      console.log("\n=== 4. 治疗师列表查看 ===");
      await tp.waitForTimeout(2000);
      // 重新打开 dashboard 刷新列表
      const dashboard = await tp.locator("#bm-dashboard-modal").count();
      if (!dashboard) {
        await tp.evaluate(() => window.BmTherapistUI.openDashboard());
        await tp.waitForTimeout(2000);
      } else {
        // 已打开, 用公共 API 刷新列表
        await tp.evaluate(() => {
          if (window.BmTherapistUI && typeof window.BmTherapistUI.refreshDashboard === 'function') {
            window.BmTherapistUI.refreshDashboard();
          }
        });
        await tp.waitForTimeout(2000);
      }
      const reportItems = await tp.locator("#bm-report-list .bm-list-item").count();
      assert("治疗师列表显示报告", reportItems > 0, `count=${reportItems}`);
      const reportText = await tp.locator("#bm-report-list").textContent();
      assert("列表中包含患者姓名", reportText.includes(PATIENT_NAME), reportText.substring(0, 80));
      const sevMatch = reportText.match(/(正常|轻度|中度|重度)/);
      assert("列表显示严重度", !!sevMatch, sevMatch?.[0] || "");
    }
  }
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