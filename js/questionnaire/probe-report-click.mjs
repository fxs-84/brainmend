// js/questionnaire/probe-report-click.mjs
// 测试治疗师端"查看自评报告"按钮是否真的能打开报告
import { chromium } from "playwright";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

// 先到 questionnaire.html 跑一次 (产生一条记录)
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
const PATIENT_NAME = "查看报告测试";

await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 30000 });
const signInRes = await page.evaluate(async ({ email, pw }) => {
  try { return await window.SupabaseClient.signIn(email, pw); }
  catch (e) { return { err: String(e.message || e) }; }
}, { email: TEST_EMAIL, pw: TEST_PASSWORD });
if (!signInRes.access_token) { console.log("登录失败:", signInRes); await browser.close(); process.exit(1); }
console.log("✅ 治疗师登录");

// 创建 share_link
const slRes = await page.evaluate(async ({ name }) => {
  try { return await window.SupabaseClient.createShareLink({ name, age: 35, gender: "男", expiresDays: 7 }); }
  catch (e) { return { err: String(e.message || e) }; }
}, { name: PATIENT_NAME });
const shareToken = slRes?.token || slRes?.share_token;
console.log("share_token:", shareToken);

// 在新 context 模拟患者答题
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
const pLogs = [];
p2.on("console", (m) => pLogs.push(`[${m.type()}] ${m.text()}`));
p2.on("pageerror", (e) => pLogs.push(`[pageerror] ${e.message}`));
const qUrl = base + "/questionnaire.html?sandbox=1&share_token=" + shareToken + "&name=" + encodeURIComponent(PATIENT_NAME) + "&age=35&gender=" + encodeURIComponent("男");
await p2.goto(qUrl, { waitUntil: "domcontentloaded" });
await p2.waitForTimeout(2000);
await p2.click("#intro-start");
await p2.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
for (let q = 1; q <= 100; q++) {
  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
  await p2.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await p2.waitForTimeout(280);
}
await p2.click("#quiz-next");
await p2.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });
await p2.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
await p2.waitForTimeout(500);
await p2.click("#qnr-reg-submit");
await p2.waitForTimeout(4000);
console.log("✅ 患者完成, 本机记录数:", await p2.evaluate(() => JSON.parse(localStorage.getItem("cog_records") || "[]").length));
await ctx2.close();

// ============ 关键测试: 在治疗师页面点"查看报告" ============
console.log("\n=== 治疗师端: 打开记录列表 + 点击查看 ===");
await page.waitForTimeout(1000);
// 触发"神经系统自评"入口的 modal 按钮, 看是否能打开列表
const navButtons = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.map(b => ({ id: b.id, text: (b.textContent || "").trim().substring(0, 30) }));
});
console.log("页面所有按钮:");
navButtons.forEach(b => console.log("  ", JSON.stringify(b)));

// 看是否已经渲染了报告列表 (cog-report-overlay)
const overlayState = await page.evaluate(() => {
  const overlay = document.getElementById("cog-report-overlay");
  if (!overlay) return { exists: false };
  return {
    exists: true,
    display: overlay.style.display,
    hasContent: overlay.innerHTML.length > 0,
    preview: overlay.innerHTML.substring(0, 200)
  };
});
console.log("\ncog-report-overlay:", JSON.stringify(overlayState, null, 2));

// 检查 _qnrReadRecords 数据
const recCount = await page.evaluate(() => JSON.parse(localStorage.getItem("cog_records") || "[]").length);
console.log("cog_records 数量:", recCount);

// 找到"查看"按钮并点击
const viewBtn = await page.evaluate(() => {
  // 找包含 _viewCogReport 或 查看 字样的按钮
  const btns = Array.from(document.querySelectorAll("button"));
  const found = btns.filter(b => {
    const t = (b.textContent || "").trim();
    const onclick = b.getAttribute("onclick") || "";
    return t.includes("查看") || t.includes("View") || onclick.includes("_viewCogReport") || onclick.includes("viewReport");
  });
  return found.map(b => ({
    text: (b.textContent || "").trim().substring(0, 30),
    onclick: (b.getAttribute("onclick") || "").substring(0, 80),
    parentHTML: (b.parentElement?.outerHTML || "").substring(0, 200)
  }));
});
console.log("\n找到的查看按钮:", JSON.stringify(viewBtn, null, 2));

// 直接 evaluate 调用 _viewCogReport(0)
console.log("\n=== 直接调 window._viewCogReport(0) ===");
const beforeCall = await page.evaluate(() => ({
  overlayExists: !!document.getElementById("cog-report-overlay"),
  overlayHasContent: (document.getElementById("cog-report-overlay")?.innerHTML || "").length,
  hasFn: typeof window._viewCogReport,
  hasFnWrapped: !!window._viewCogReport?.__qnrWrapped,
  hasFn2: typeof window._qnrRenderReport
}));
console.log("调用前:", JSON.stringify(beforeCall, null, 2));

await page.evaluate(() => {
  if (window._viewCogReport) window._viewCogReport(0);
});
await page.waitForTimeout(2000);

const afterCall = await page.evaluate(() => {
  const overlay = document.getElementById("cog-report-overlay");
  return {
    overlayDisplay: overlay?.style.display,
    overlayLen: overlay?.innerHTML?.length || 0,
    overlayPreview: overlay?.innerHTML?.substring(0, 300)
  };
});
console.log("调用后:", JSON.stringify(afterCall, null, 2));

await page.screenshot({ path: "js/questionnaire/screenshot-view-report.png", fullPage: true });

console.log("\n=== 关键 console 日志 (后 30 条) ===");
logs.slice(-30).forEach((l) => console.log(l));

await browser.close();