// js/questionnaire/probe-unified.mjs
// 验证: 第一性原理重构后, 主页三个入口全部统一到治疗师工作台
import { chromium } from "playwright";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
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
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured() && window.BmTherapistUI, null, { timeout: 60000 });

  // 登录
  const signIn = await page.evaluate(async ({ email, pw }) => {
    try { return await window.SupabaseClient.signIn(email, pw); }
    catch (e) { return { err: String(e.message || e) }; }
  }, { email: TEST_EMAIL, pw: TEST_PASSWORD });
  assert("治疗师登录", !!signIn.access_token);

  // ============ 测试 1: 主页"神经系统自评" → 工作台 (kind=qnr) ============
  console.log("\n=== 1. page2-questionnaire → openDashboard({kind:'qnr'}) ===");
  await page.click("#page2-questionnaire");
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  const kind1 = await page.evaluate(() => document.getElementById("bm-link-kind")?.value);
  assert("工作台 kind 选择器 = qnr", kind1 === "qnr", "实际=" + kind1);
  // 关掉
  await page.evaluate(() => document.getElementById("bm-dashboard-modal")?.remove());

  // ============ 测试 2: 主页"认知评估" → 工作台 (kind=cognitive) ============
  console.log("\n=== 2. page2-cognitive → openDashboard({kind:'cognitive'}) ===");
  await page.click("#page2-cognitive");
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  const kind2 = await page.evaluate(() => document.getElementById("bm-link-kind")?.value);
  assert("工作台 kind 选择器 = cognitive", kind2 === "cognitive", "实际=" + kind2);
  await page.evaluate(() => document.getElementById("bm-dashboard-modal")?.remove());

  // ============ 测试 3: 主页"步态分析" → 工作台 (kind=gait) ============
  console.log("\n=== 3. page2-gait → openDashboard({kind:'gait'}) ===");
  await page.click("#page2-gait");
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  const kind3 = await page.evaluate(() => document.getElementById("bm-link-kind")?.value);
  assert("工作台 kind 选择器 = gait", kind3 === "gait", "实际=" + kind3);
  await page.evaluate(() => document.getElementById("bm-dashboard-modal")?.remove());

  // ============ 测试 4: 主页"评估报告" → 工作台 ============
  console.log("\n=== 4. page2-cog-report → openDashboard() ===");
  await page.click("#page2-cog-report");
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  assert("工作台打开 (评估报告)", true);
  await page.evaluate(() => document.getElementById("bm-dashboard-modal")?.remove());

  // ============ 测试 5: 主页 modal 已废弃 (点不出 modal) ============
  console.log("\n=== 5. 主页 modal 已彻底废弃 ===");
  const qnrModalHidden = await page.evaluate(() => {
    const el = document.getElementById("qnr-modal-overlay");
    return el ? getComputedStyle(el).display === "none" : true;
  });
  assert("qnr-modal-overlay display:none", qnrModalHidden);
  const cogModalHidden = await page.evaluate(() => {
    const el = document.getElementById("cog-modal-overlay");
    return el ? getComputedStyle(el).display === "none" : true;
  });
  assert("cog-modal-overlay display:none", cogModalHidden);

  // ============ 测试 6: 主页按钮文案 (无"认知报告", 改"评估报告") ============
  console.log("\n=== 6. 主页按钮文案 ===");
  const btnText = await page.evaluate(() => document.getElementById("page2-cog-report")?.textContent.trim());
  assert("'认知报告' → '评估报告'", btnText.includes("评估报告"), btnText.substring(0, 50));

  await page.screenshot({ path: "js/questionnaire/screenshot-home-unified.png", fullPage: true });

  console.log("\n" + "═".repeat(60));
  console.log(`  通过 ${pass} / 失败 ${fail}`);
} catch (e) {
  console.error("❌ 测试异常:", e.message);
  fail++;
}
await browser.close();
if (fail > 0) process.exit(1);