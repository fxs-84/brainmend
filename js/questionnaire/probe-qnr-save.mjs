// js/questionnaire/probe-qnr-save.mjs
// 极简探针: 只测 questionnaire.html 自身能不能调通 submitQnrAssessment
// 用 sandbox=1 但不带 share_token → 故意走到 no_share_token 失败分支
// 然后再带一个伪造的 token 跑一次 → 看 Supabase 返回什么

import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (req) =>
  logs.push(`[reqfail] ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`)
);
page.on("response", async (resp) => {
  const url = resp.url();
  if (url.includes("supabase")) {
    logs.push(`[http] ${resp.status()} ${resp.request().method()} ${url}`);
    try {
      const body = await resp.text();
      if (body && body.length < 500) logs.push(`   body: ${body}`);
    } catch (e) {}
  }
});

const url =
  base +
  "/questionnaire.html?sandbox=1&name=测试患者&age=35&gender=男&tid=t-probe-001";
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

// 1) 等 SupabaseClient 就绪
const ready = await page.evaluate(() => ({
  hasSC: !!window.SupabaseClient,
  cfg: window.SupabaseClient && window.SupabaseClient.isConfigured(),
  url: window.__SUPABASE_URL__,
  hasQnrReady: !!window.__qnrInlineReportReady
}));
console.log("就绪状态:", JSON.stringify(ready, null, 2));

// 2) 等 qnr:finished 触发 (走一遍完整流程: 100 题 + 提交登记表单)
console.log("\n开始答题 (100 题)...");
await page.click("#intro-start");
await page.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
for (let q = 1; q <= 100; q++) {
  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
  await page.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await page.waitForTimeout(280);
}
await page.click("#quiz-next");
await page.waitForSelector("#screen-result:not([style*='none']) .result-group", { timeout: 30000 });
await page.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
await page.waitForTimeout(500);
console.log("登记表单已弹出, 点提交...");
await page.click("#qnr-reg-submit");
// 等云端提交 (RPC 调用最多几秒)
await page.waitForTimeout(8000);

// 3) 看 localStorage 中的云端状态
const recState = await page.evaluate(() => {
  const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
  const latest = arr[arr.length - 1] || {};
  return {
    count: arr.length,
    latest: {
      id: latest.id,
      type: latest.type,
      patientName: latest.patientInfo && latest.patientInfo.name,
      _cloudStatus: latest._cloudStatus,
      _cloudErr: latest._cloudErr,
      _cloudId: latest._cloudId,
      _cloudSource: latest._cloudSource
    }
  };
});
console.log("\nlocalStorage 中最新记录:", JSON.stringify(recState, null, 2));

// 4) 看屏幕状态 (是回到报告页还是卡在 saving overlay)
const screenState = await page.evaluate(() => {
  const ids = ["screen-intro", "screen-quiz", "screen-result", "screen-report"];
  const out = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    out[id] = el ? (el.style.display === "none" ? "hidden" : "shown") : "missing";
  });
  out.hasSavingOverlay = !!document.getElementById("qnr-saving-overlay");
  return out;
});
console.log("\n屏幕状态:", JSON.stringify(screenState, null, 2));

console.log("\n=== 所有 console 日志 ===");
logs.forEach((l) => console.log(l));

await browser.close();