// js/questionnaire/probe-cog-realshape.mjs
// 注入一条完整的认知报告 (含 rawScores/normalizedScores/brainRegions),
// 模拟真实 patient 答题后 cognitive-report.js 写入的 payload 结构, 验证
// openCognitiveReport 走真 renderReport 路径, 显示出原版 12 模块 + 雷达图 + 脑区图
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
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured() && window.renderReport, null, { timeout: 60000 });
  await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  const hasRender = await page.evaluate(() => typeof window.renderReport === 'function');
  assert("renderReport 已暴露到 window", hasRender);

  // 构造一条完整 payload (模拟真实 patient 答题)
  const sl = await page.evaluate(async () => await window.SupabaseClient.createShareLink({
    name: "完整渲染测试-赵女士", age: 48, gender: "女", expiresDays: 7, kind: "cognitive"
  }));

  // 12 模块 rawScores 完整结构 (跟 cognitive-report.js 内部一致)
  const fullPayload = {
    date: new Date().toISOString().substring(0, 10),
    time: new Date().toTimeString().substring(0, 5),
    type: "cognitive",
    isQuick6: false,
    overallScore: 76,
    patientInfo: { name: "完整渲染测试-赵女士", age: 48, gender: "女" },
    moduleScores: {
      reasoning: { score: 80, correct: 8, trials: 10, completionRate: 0.8 },
      scenerecall: { score: 75, correct: 7, trials: 10 },
      shortmem: { score: 70, correct: 7, trials: 10 },
      attention: { score: 78, correct: 8, trials: 10, completionRate: 0.8 },
      memory: { score: 72, correct: 7, trials: 10 },
      visual: { score: 82, correct: 8, trials: 10 },
      planning: { score: 76, level: 5, moves: 12, optimal: 10, stepEfficiency: 0.83 },
      flex: { score: 74, correct: 7, trials: 10, completionRate: 0.7 },
      language: { score: 78, correct: 8, trials: 10, completionRate: 0.8 },
      memorg: { score: 75, correct: 8, trials: 10 },
      inhibition: { score: 70, correct: 7, trials: 10, rtTotal: 8.5 },
      observation: { score: 78, correct: 8, trials: 10, completionRate: 0.8 }
    },
    rawScores: {
      reasoning: { score: 80, correct: 8, trials: 10, completionRate: 0.8 },
      scenerecall: { score: 75, correct: 7, trials: 10 },
      shortmem: { score: 70, correct: 7, trials: 10 },
      attention: { score: 78, correct: 8, trials: 10, completionRate: 0.8 },
      memory: { score: 72, correct: 7, trials: 10 },
      visual: { score: 82, correct: 8, trials: 10 },
      planning: { score: 76, level: 5, moves: 12, optimal: 10, stepEfficiency: 0.83 },
      flex: { score: 74, correct: 7, trials: 10, completionRate: 0.7 },
      language: { score: 78, correct: 8, trials: 10, completionRate: 0.8 },
      memorg: { score: 75, correct: 8, trials: 10 },
      inhibition: { score: 70, correct: 7, trials: 10, rtTotal: 8.5 },
      observation: { score: 78, correct: 8, trials: 10, completionRate: 0.8 }
    }
  };

  const submitRes = await page.evaluate(async ({ token, payload }) => {
    return await window.SupabaseClient.submitCognitiveAssessment({
      shareToken: token,
      patientInfo: { name: "完整渲染测试-赵女士", age: 48, gender: "女" },
      payload: payload,
      overallScore: 76,
      isQuick6: false
    });
  }, { token: sl.token, payload: fullPayload });
  console.log("✅ 提交:", submitRes);

  // 打开工作台 → 认知 tab → 点击
  await page.evaluate(() => window.BmTherapistUI.openDashboard());
  await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
  await page.evaluate(() => window.BmTherapistUI.switchReportTab('cognitive'));
  await page.waitForTimeout(3000);
  // 点击"完整渲染测试-赵女士"那条
  await page.evaluate(() => {
    const items = document.querySelectorAll("#bm-report-list .bm-list-item");
    for (const it of items) {
      if (it.textContent.includes("完整渲染测试-赵女士")) {
        it.click();
        return;
      }
    }
  });
  await page.waitForTimeout(2000);

  // 检查 overlay 是否有原版认知报告的元素
  const state = await page.evaluate(() => {
    const ov = document.getElementById("cog-report-overlay");
    const body = document.getElementById("cog-report-body");
    const html = body?.innerHTML || "";
    const text = body?.innerText || "";
    return {
      overlayDisplay: ov?.style.display,
      zIndex: ov?.style.zIndex,
      textLen: text.length,
      hasRadarChart: !!body?.querySelector("#radar-chart, canvas[id*='radar']"),
      hasBrainRegions: html.includes("data-brain-region") || html.includes("brain-region") || html.includes("脑区"),
      hasRiskIndex: text.includes("风险") || text.includes("多维") || text.includes("评估"),
      hasAll12Modules: ['推理','场景','记忆','注意力','视觉','规划','变通','语言','组织','抑制','观察']
        .every(k => text.includes(k)),
      hasQuickBadge: text.includes("完整") || text.includes("12") || text.includes("评估"),
      hasPatientName: text.includes("赵女士"),
      hasOverall: text.includes("76") || text.includes("综合"),
      isFallback: html.indexOf("各模块得分") >= 0  // 简化视图特征
    };
  });
  console.log("\n=== Overlay 状态 ===");
  console.log(JSON.stringify(state, null, 2));
  assert("overlay 显示 + z-index 50000", state.overlayDisplay === "block" && state.zIndex === "50000", "");
  assert("有雷达图 canvas", state.hasRadarChart, "");
  assert("有脑区图/数据", state.hasBrainRegions, "");
  assert("有风险评估/多维", state.hasRiskIndex, "");
  assert("12 模块全显示 (原版特征)", state.hasAll12Modules, "");
  assert("不是简化降级视图", !state.isFallback, "走了 fallback?");
  assert("患者姓名 赵女士", state.hasPatientName, "");
  assert("综合分 76 显示", state.hasOverall, "");
  await page.screenshot({ path: "js/questionnaire/screenshot-cog-real.png", fullPage: true });
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