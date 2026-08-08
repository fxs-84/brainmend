// js/questionnaire/probe-cog-click.mjs
// 验证认知 tab 点击看报告 (修复后)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
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
  await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });

  // 注入测试记录 (沿用之前 probe-cog-direct 写入的那条)
  // 这里重新写一条, 保证有数据
  const sl = await page.evaluate(async () => await window.SupabaseClient.createShareLink({
    name: "认知点击测试-李先生", age: 50, gender: "男", expiresDays: 7, kind: "cognitive"
  }));
  const submitRes = await page.evaluate(async ({ token }) => {
    return await window.SupabaseClient.submitCognitiveAssessment({
      shareToken: token,
      patientInfo: { name: "认知点击测试-李先生", age: 50, gender: "男" },
      payload: {
        type: "cognitive", overallScore: 78, isQuick6: true,
        moduleScores: {
          reasoning: { score: 85 }, scenerecall: { score: 80 }, shortmem: { score: 70 },
          attention: { score: 75 }, memory: { score: 72 }, visual: { score: 88 }
        }
      },
      overallScore: 78,
      isQuick6: true
    });
  }, { token: sl.token });
  console.log("✅ 测试数据写入:", submitRes);

  // 打开工作台 → 认知 tab
  await page.evaluate(() => window.BmTherapistUI.openDashboard());
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await page.evaluate(() => window.BmTherapistUI.switchReportTab('cognitive'));
  await page.waitForTimeout(3000);
  const items = await page.evaluate(() => {
    const list = document.getElementById("bm-report-list");
    return list ? Array.from(list.querySelectorAll(".bm-list-item")).map(el => el.textContent.trim().substring(0, 80)) : [];
  });
  console.log("列表:", items);
  assert("列表里有 李先生", items.some(t => t.includes("李先生")), items.join(" | "));

  // 点击第一条
  await page.evaluate(() => {
    const first = document.querySelector("#bm-report-list .bm-list-item");
    if (first) first.click();
  });
  await page.waitForTimeout(1500);

  // 检查 overlay
  const state = await page.evaluate(() => {
    const ov = document.getElementById("cog-report-overlay");
    const body = document.getElementById("cog-report-body");
    const nav = document.getElementById("cog-report-nav");
    return {
      overlayDisplay: ov?.style.display,
      overlayZIndex: ov?.style.zIndex,
      navText: nav?.textContent?.substring(0, 50),
      bodyText: body?.textContent?.substring(0, 200),
      hasModScores: body?.textContent?.includes("推理") && body?.textContent?.includes("注意力"),
      hasTitle: body?.textContent?.includes("李先生"),
      hasOverall: body?.textContent?.includes("综合") && body?.textContent?.includes("78")
    };
  });
  console.log("\nOverlay 状态:", JSON.stringify(state, null, 2));
  assert("overlay 显示 (display=block)", state.overlayDisplay === "block", state.overlayDisplay);
  assert("overlay z-index 已提升", state.overlayZIndex === "50000", state.overlayZIndex);
  assert("标题是患者姓名", state.hasTitle, "");
  assert("综合分 78 显示", state.hasOverall, "");
  assert("含模块明细 (推理/注意力)", state.hasModScores, "");
  await page.screenshot({ path: "js/questionnaire/screenshot-cog-detail-fixed.png", fullPage: true });
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