// js/questionnaire/probe-final-flow.mjs
// 验证三大修复 (LIVE):
//   1. 主页神经系统自评 → 弹 modal → "开始测评" → 走 Supabase share_link
//   2. 治疗师工作台 → 自评报告列表 → 点击 openQnrReport → 报告渲染
//   3. 预填姓名 → 患者做完不弹登记表单

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const cfg = readFileSync(resolvePath(__dirname, "../../assets/config/supabase-config.js"), "utf8");
const SUPABASE_URL = cfg.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const PREFILLED_NAME = "预填测试-李先生";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });

try {
  // ============ Phase 1: 治疗师登录 ============
  console.log("\n=== Phase 1: 治疗师登录 ===");
  const tCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const tp = await tCtx.newPage();
  const tLogs = [];
  tp.on("console", (m) => tLogs.push(`[T-${m.type()}] ${m.text()}`));
  tp.on("pageerror", (e) => tLogs.push(`[T-pageerror] ${e.message}`));
  tp.on("response", async (r) => {
    if (r.url().includes("supabase") && r.url().includes("/rest/")) {
      let body = "";
      try { body = await r.text(); } catch(e) {}
      if (r.status() >= 400) tLogs.push(`[T-http] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]} err: ${body.substring(0, 200)}`);
    }
  });
  await tp.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await tp.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured() && window.BmTherapistUI, null, { timeout: 60000 });
  const signIn = await tp.evaluate(async ({ email, pw }) => {
    try { return await window.SupabaseClient.signIn(email, pw); }
    catch (e) { return { err: String(e.message || e) }; }
  }, { email: TEST_EMAIL, pw: TEST_PASSWORD });
  assert("治疗师登录", !!signIn.access_token, signIn.user?.email || "");

  // ============ Phase 2: 主页入口 → 弹 modal → 预填 → "开始测评" ============
  console.log("\n=== Phase 2: 主页神经系统自评入口 ===");
  await tp.click("#page2-questionnaire");
  await tp.waitForSelector("#qnr-modal-overlay.show", { timeout: 5000 });
  console.log("  ✅ modal 已弹出");

  // 预填表单
  await tp.fill("#qnr-modal-name", PREFILLED_NAME);
  await tp.fill("#qnr-modal-age", "42");
  await tp.selectOption("#qnr-modal-gender", "男");
  console.log("  ✅ 预填: " + PREFILLED_NAME + " / 42 / 男");

  // 点"开始测评" - 应该走 Supabase createShareLink → 跳到 questionnaire.html?sandbox=1&share_token=xxx
  const navPromise = tp.waitForNavigation({ timeout: 15000 }).catch(() => null);
  await tp.click("#qnr-modal-start");
  const navigated = await navPromise;
  await tp.waitForTimeout(2000);
  const finalUrl = tp.url();
  console.log("  跳转后 URL:", finalUrl);
  const hasShareToken = finalUrl.includes("share_token=");
  const hasPrefill = finalUrl.includes("name=" + encodeURIComponent(PREFILLED_NAME));
  assert("URL 含 share_token", hasShareToken, "");
  assert("URL 含预填姓名", hasPrefill, decodeURIComponent(finalUrl.split("name=")[1]?.split("&")[0] || ""));
  const shareToken = finalUrl.match(/share_token=([a-f0-9]+)/)?.[1];
  assert("share_token 有效", shareToken && shareToken.length >= 30, shareToken || "");

  // ============ Phase 3: 患者答题 + 不弹登记表单 (因为已预填) ============
  console.log("\n=== Phase 3: 患者答题 (预填场景) ===");
  await tp.waitForSelector("#intro-start", { timeout: 10000 });
  await tp.click("#intro-start");
  await tp.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
  for (let q = 1; q <= 100; q++) {
    const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
    await tp.click(`.q-option >> nth=${optIndex}`);
    if (q < 100) await tp.waitForTimeout(280);
  }
  await tp.click("#quiz-next");
  await tp.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });

  // ⭐ 关键: 因为有预填, 不应该弹 qnr-reg-overlay
  await tp.waitForTimeout(2000);
  const regVisible = await tp.evaluate(() => {
    const el = document.getElementById("qnr-reg-overlay");
    return !!el && el.style.display !== "none";
  });
  assert("预填场景: 不弹登记表单 (患者无需再填)", !regVisible, regVisible ? "❌ 弹了" : "");
  // 应该直接跳到 report
  const reportVisible = await tp.evaluate(() => {
    const el = document.getElementById("screen-report");
    return el && el.style.display !== "none";
  });
  assert("直接进入报告页", reportVisible, "");
  await tp.waitForTimeout(3000);
  const cloudState = await tp.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    const latest = arr[arr.length - 1] || {};
    return { _cloudStatus: latest._cloudStatus, _cloudId: latest._cloudId, name: latest.patientInfo?.name };
  });
  console.log("  本机状态:", JSON.stringify(cloudState));
  assert("云端状态 synced", cloudState._cloudStatus === "synced", cloudState._cloudStatus);
  assert("云端 ID 已写入", !!cloudState._cloudId, cloudState._cloudId || "");

  // ============ Phase 4: 直接查 DB 验证 ============
  console.log("\n=== Phase 4: 查 DB 验证 ===");
  const sess = await tp.evaluate(() => window.SupabaseClient.getSession());
  const dbRows = await fetch(
    SUPABASE_URL + "/rest/v1/qnr_self_assessments?share_token=eq." + shareToken + "&select=id,patient_name,patient_age,patient_gender,total_score,percent,worst_severity",
    { headers: { apikey: cfg.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1], Authorization: "Bearer " + sess.access_token } }
  ).then(r => r.json());
  console.log("  DB 返回:", JSON.stringify(dbRows, null, 2));
  assert("DB HTTP 200", dbRows.length > 0, `count=${dbRows.length}`);
  if (dbRows.length) {
    assert("DB patient_name = " + PREFILLED_NAME, dbRows[0].patient_name === PREFILLED_NAME, dbRows[0].patient_name);
    assert("DB patient_age = 42", dbRows[0].patient_age === 42, dbRows[0].patient_age);
    assert("DB patient_gender = 男", dbRows[0].patient_gender === "男", dbRows[0].patient_gender);
  }

  // ============ Phase 5: 工作台 → 自评报告列表 → 点击 openQnrReport ============
  console.log("\n=== Phase 5: 工作台 → 自评报告列表 → 点击 ===");
  await tp.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await tp.waitForFunction(() => window.BmTherapistUI && typeof window.BmTherapistUI.openDashboard === "function", null, { timeout: 30000 });
  await tp.evaluate(() => window.BmTherapistUI.openDashboard());
  await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await tp.waitForTimeout(3000); // 等自评报告加载

  // 列表项应该有 onclick
  const items = await tp.evaluate(() => {
    const list = document.getElementById("bm-report-list");
    if (!list) return [];
    return Array.from(list.querySelectorAll(".bm-list-item")).map(el => ({
      hasOnclick: !!el.getAttribute("onclick"),
      cursor: getComputedStyle(el).cursor,
      text: (el.textContent || "").trim().substring(0, 80)
    }));
  });
  console.log("  列表项数量:", items.length);
  assert("列表项有 onclick", items.length > 0 && items.every(i => i.hasOnclick), "");
  assert("列表项 cursor: pointer", items.length > 0 && items.every(i => i.cursor === "pointer"), items.map(i => i.cursor).join(","));
  assert("列表包含预填测试患者", items.some(i => i.text.includes(PREFILLED_NAME)), "");

  // ⭐ 关键: 点击第一条 (应该就是刚做的预填患者)
  console.log("  点击第一条...");
  await tp.evaluate(() => {
    const list = document.getElementById("bm-report-list");
    const first = list.querySelector(".bm-list-item");
    if (first) first.click();
  });
  await tp.waitForTimeout(2000);
  await tp.screenshot({ path: "js/questionnaire/screenshot-report-rendered.png", fullPage: true });

  const reportOverlayState = await tp.evaluate(() => {
    const overlay = document.getElementById("cog-report-overlay");
    return {
      exists: !!overlay,
      display: overlay?.style.display,
      hasContent: (overlay?.innerHTML?.length || 0) > 1000,
      preview: overlay?.innerHTML?.substring(0, 200)
    };
  });
  console.log("\n  报告 overlay:", JSON.stringify(reportOverlayState, null, 2));
  assert("报告 overlay 显示", reportOverlayState.display === "block", reportOverlayState.display);
  assert("报告 overlay 有内容", reportOverlayState.hasContent, "len=" + (reportOverlayState.preview?.length || 0));

  console.log("\n=== 关键 console 日志 ===");
  tLogs.slice(-15).forEach((l) => console.log(l));
} catch (e) {
  console.error("❌ 测试异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
await browser.close();
if (fail > 0) process.exit(1);