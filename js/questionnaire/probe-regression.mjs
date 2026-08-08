// js/questionnaire/probe-regression.mjs
// 验证回归简洁架构:
//   - 主页 4 按钮: 直接做题 / 本机报告 (不入库)
//   - 治疗师登录位置: 主页头部 (renderAuthBar) 不动
//   - 工作台: 唯一 QR 入库入口 (创建链接 + 链接列表 + 报告)
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
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });

  // ============ 1. 主页治疗师登录位置 (不动) ============
  console.log("\n=== 1. 主页治疗师登录位置 ===");
  const authBtn = await page.evaluate(() => {
    // renderAuthBar 注入的按钮: BmTherapistUI.renderAuthBar() 应该在主页头部
    const topBtn = document.querySelector("#bm-auth-bar button, .bm-auth-bar button, [data-bm-auth]");
    if (topBtn) return { exists: true, text: topBtn.textContent.trim().substring(0, 30) };
    // 检查页面顶部是否有 BmTherapistUI 按钮
    return { exists: false };
  });
  console.log("  顶部按钮:", JSON.stringify(authBtn));
  assert("主页头部有治疗师登录入口 (renderAuthBar 注入)", authBtn.exists, authBtn.text || "");

  // 登录
  const signIn = await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  assert("治疗师登录", !!signIn.access_token);

  // ============ 2. 主页"神经系统自评" → 直接做题 (不入库) ============
  console.log("\n=== 2. 主页神经系统自评 → 本机做题 ===");
  const navPromise1 = page.waitForNavigation({ timeout: 5000 }).catch(() => null);
  await page.click("#page2-questionnaire");
  await navPromise1;
  await page.waitForTimeout(1500);
  const url1 = page.url();
  console.log("  跳转后 URL:", url1);
  assert("跳转到 questionnaire.html?sandbox=1", url1.includes("questionnaire.html") && url1.includes("sandbox=1") && !url1.includes("share_token"), "");
  // 本机直接做题路径 — URL 不带 share_token (新行为)
  assert("URL 不含 share_token (本机路径)", !url1.includes("share_token"), "");
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // ============ 3. 主页"认知评估" → 弹 cog-modal (含完整测试/快速测试/QR) ============
  console.log("\n=== 3. 主页认知评估 → cog-modal 弹窗 ===");
  await page.click("#page2-cognitive");
  await page.waitForSelector("#cog-modal-overlay.show", { timeout: 5000 });
  const cogModalBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#cog-modal-overlay button"));
    return btns.map(b => b.textContent.trim().substring(0, 30));
  });
  console.log("  modal 按钮:", cogModalBtns);
  assert("modal 有'完整测试'", cogModalBtns.some(t => t.includes("完整测试")), "");
  assert("modal 有'快速测试'", cogModalBtns.some(t => t.includes("快速测试")), "");
  assert("modal 有'生成二维码'", cogModalBtns.some(t => t.includes("生成二维码")), "");
  // 关闭
  await page.click("#cog-modal-close");
  await page.waitForTimeout(300);

  // ============ 4. 主页"步态分析" → 本机游戏 ============
  console.log("\n=== 4. 主页步态分析 → 本机游戏 ===");
  await page.click("#page2-gait");
  await page.waitForTimeout(1500);
  const gaitOpened = await page.evaluate(() => !!window.__gaitAnalysis);
  assert("__gaitAnalysis 模块加载", gaitOpened);
  // 主页应该隐藏, 进入步态游戏
  const page2Visible = await page.evaluate(() => document.getElementById("page2")?.style.display);
  console.log("  主页显示状态:", page2Visible);
  await page.evaluate(() => { if (window.goHome) window.goHome(); });
  await page.waitForTimeout(1500);
  // 确认 page2 已显示
  const page2After = await page.evaluate(() => document.getElementById("page2")?.style.display);
  console.log("  步态后退回主页:", page2After);

  // ============ 5. 主页"评估报告" → 本机报告列表 ============
  console.log("\n=== 5. 主页评估报告 → 本机报告 ===");
  await page.click("#page2-cog-report");
  await page.waitForTimeout(2000);
  const listOverlay = await page.evaluate(() => {
    const ov = document.getElementById("cog-record-list-overlay");
    return { exists: !!ov, display: ov?.style.display };
  });
  console.log("  cog-record-list-overlay:", JSON.stringify(listOverlay));
  assert("本机报告列表渲染", listOverlay.exists && listOverlay.display === "flex", JSON.stringify(listOverlay));
  // 关掉
  await page.evaluate(() => { var o = document.getElementById("cog-record-list-overlay"); if (o) o.remove(); });
  await page.waitForTimeout(300);

  // ============ 6. 治疗师工作台 (登录后通过 renderAuthBar) ============
  console.log("\n=== 6. 治疗师工作台入口 (BmTherapistUI.openDashboard) ===");
  // 通过已登录的 authBar 调 openDashboard
  const dashOpened = await page.evaluate(() => {
    if (window.BmTherapistUI && typeof window.BmTherapistUI.openDashboard === 'function') {
      window.BmTherapistUI.openDashboard();
      return true;
    }
    return false;
  });
  assert("工作台可调 openDashboard", dashOpened);
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  // 工作台不应再有"立即测评"按钮
  const dashBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#bm-dashboard-modal button"));
    return btns.map(b => b.textContent.trim().substring(0, 30));
  });
  console.log("  工作台按钮:", dashBtns);
  assert("工作台无'立即开始'按钮 (已删)", !dashBtns.some(t => t.includes("立即开始")), "");
  assert("工作台有'创建链接'按钮", dashBtns.some(t => t.includes("创建链接")), "");
  // kind 选择器应该存在 (创建不同类型链接)
  const kindExists = await page.evaluate(() => !!document.getElementById("bm-link-kind"));
  assert("工作台有 kind 选择器 (qnr/cognitive/gait)", kindExists);

  await page.screenshot({ path: "js/questionnaire/screenshot-regression.png", fullPage: true });
} catch (e) {
  console.error("❌ 异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 关键日志 ===");
logs.filter(l => !l.includes("Failed to load resource") && !l.includes("404")).slice(-15).forEach((l) => console.log(l));
await browser.close();
if (fail > 0) process.exit(1);