// js/questionnaire/probe-qnr-realf.mjs
// 完整真实流程探针: 治疗师登录 → 创建 share_link → 用真 token 跑问卷 → 看 Supabase 写入结果
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
const TEST_EMAIL = "bm-realtest@example.com";
const TEST_PASSWORD = "Test1234!";
const PATIENT_NAME = "真实流程测试患者";

const browser = await chromium.launch({ channel: "chrome" });
let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const allLogs = [];

try {
  // ============ Phase 1: 治疗师登录 + 创建 share_link ============
  console.log("\n=== Phase 1: 治疗师登录 ===");
  const tCtx = await browser.newContext();
  const tp = await tCtx.newPage();
  tp.on("console", (m) => allLogs.push(`[t-${m.type()}] ${m.text()}`));
  tp.on("pageerror", (e) => allLogs.push(`[t-pageerror] ${e.message}`));
  tp.on("response", async (r) => {
    if (r.url().includes("supabase")) {
      allLogs.push(`[t-http] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`);
      if (r.status() >= 400) {
        try { allLogs.push(`   err-body: ${(await r.text()).substring(0, 300)}`); } catch(e){}
      }
    }
  });

  await tp.goto(base + "/index.html", { waitUntil: "commit", timeout: 30000 });
  // 等 SupabaseClient + BmTherapistUI 就绪
  await tp.waitForFunction(
    () => window.SupabaseClient && window.SupabaseClient.isConfigured() && window.BmTherapistUI,
    null,
    { timeout: 60000 }
  );

  // 登录 (固定账号, 不存在兜底注册)
  await tp.evaluate(() => window.BmTherapistUI.openAuth());
  await tp.waitForSelector("#bm-auth-modal", { state: "visible", timeout: 5000 });
  await tp.fill("#bm-auth-email", TEST_EMAIL);
  await tp.fill("#bm-auth-password", TEST_PASSWORD);
  await tp.click("text=登 录");
  await tp.waitForTimeout(5000);
  let sess = await tp.evaluate(() => window.SupabaseClient.getSession());
  if (!sess?.access_token) {
    console.log("  登录失败, 尝试注册");
    await tp.evaluate(() => window.BmTherapistUI.switchAuthTab("signup"));
    await tp.waitForTimeout(300);
    await tp.fill("#bm-signup-name", "真实测试治疗师");
    await tp.fill("#bm-signup-email", TEST_EMAIL);
    await tp.fill("#bm-signup-password", TEST_PASSWORD);
    await tp.click("text=注 册");
    await tp.waitForTimeout(5000);
    sess = await tp.evaluate(() => window.SupabaseClient.getSession());
  }
  assert("治疗师有 session", !!sess?.access_token, sess ? "" : "无 session");

  if (!sess?.access_token) {
    console.log("登录失败, 终止");
    await browser.close();
    process.exit(1);
  }

  // 打开工作台 → 创建 share_link
  await tp.evaluate(() => window.BmTherapistUI.openDashboard());
  await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await tp.fill("#bm-link-name", PATIENT_NAME);
  await tp.fill("#bm-link-age", "35");
  await tp.selectOption("#bm-link-gender", "男");
  await tp.click("text=+ 创建链接");
  await tp.waitForTimeout(3000);

  // 提取真 token
  const shareToken = await tp.evaluate(() => {
    const txt = document.getElementById("bm-link-result")?.textContent || "";
    const m = txt.match(/share_token=([a-f0-9]{32})/);
    return m ? m[1] : null;
  });
  assert("share_token 已生成", !!shareToken && shareToken.length === 32, shareToken || "无");
  if (!shareToken) {
    console.log("无 token, 终止");
    await browser.close();
    process.exit(1);
  }

  // 治疗师工作台生成的真链接
  const realUrl = base + "/questionnaire.html?sandbox=1&share_token=" + shareToken +
    "&name=" + encodeURIComponent(PATIENT_NAME) + "&age=35&gender=" + encodeURIComponent("男");
  console.log("  真链接:", realUrl);

  // ============ Phase 2: 患者用真链接跑问卷 ============
  console.log("\n=== Phase 2: 患者跑问卷 ===");
  const pCtx = await browser.newContext();
  const pp = await pCtx.newPage();
  pp.on("console", (m) => allLogs.push(`[p-${m.type()}] ${m.text()}`));
  pp.on("pageerror", (e) => allLogs.push(`[p-pageerror] ${e.message}`));
  pp.on("response", async (r) => {
    if (r.url().includes("supabase")) {
      allLogs.push(`[p-http] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`);
      if (r.status() >= 400) {
        try { allLogs.push(`   err-body: ${(await r.text()).substring(0, 300)}`); } catch(e){}
      }
    }
  });

  await pp.goto(realUrl, { waitUntil: "networkidle" });
  await pp.waitForTimeout(2000);
  await pp.click("#intro-start");
  await pp.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
  for (let q = 1; q <= 100; q++) {
    const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
    await pp.click(`.q-option >> nth=${optIndex}`);
    if (q < 100) await pp.waitForTimeout(280);
  }
  await pp.click("#quiz-next");
  await pp.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });
  await pp.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
  await pp.waitForTimeout(500);
  await pp.click("#qnr-reg-submit");
  await pp.waitForTimeout(8000);

  // localStorage 状态
  const recState = await pp.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    const latest = arr[arr.length - 1] || {};
    return {
      count: arr.length,
      _cloudStatus: latest._cloudStatus,
      _cloudErr: latest._cloudErr,
      _cloudId: latest._cloudId,
      _cloudSource: latest._cloudSource,
      name: latest.patientInfo && latest.patientInfo.name
    };
  });
  console.log("\n患者本机 localStorage:", JSON.stringify(recState, null, 2));
  assert("本机 _cloudStatus 是 synced", recState._cloudStatus === "synced", recState._cloudStatus);
  assert("本机 _cloudId 已写入", !!recState._cloudId, recState._cloudId || "无");

  // ============ Phase 3: 直接查 Supabase 验证表里有新行 ============
  console.log("\n=== Phase 3: 直接查 Supabase REST API ===");
  const dbCheck = await fetch(
    SUPABASE_URL + "/rest/v1/qnr_self_assessments?share_token=eq." + shareToken + "&select=id,patient_name,share_token,total_score,submitted_at",
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + sess.access_token
      }
    }
  );
  const dbRows = await dbCheck.json();
  console.log("Supabase 返回:", JSON.stringify(dbRows, null, 2));
  assert("HTTP 200", dbCheck.status === 200, "status=" + dbCheck.status);
  assert("数据库里有匹配行", Array.isArray(dbRows) && dbRows.length > 0, `count=${dbRows?.length}`);
  if (dbRows?.length) {
    assert("患者姓名匹配", dbRows[0].patient_name === PATIENT_NAME, dbRows[0].patient_name);
  }
} catch (e) {
  console.error("测试异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 所有 console + http 日志 (最后 30 条) ===");
allLogs.slice(-30).forEach((l) => console.log(l));

await browser.close();
if (fail > 0) process.exit(1);