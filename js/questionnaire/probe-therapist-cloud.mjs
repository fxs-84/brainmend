// js/questionnaire/probe-therapist-cloud.mjs
// 治疗师端云端记录点击测试 (用户报告的失败场景)
//
// 场景: 治疗师在 index.html → 认知报告列表 → 点云端自评记录 → 点分区行 → 应弹层显示做题详情
// 失败原因: data.js + scoring.js 未预加载, 弹层显示"数据模块未加载"
// 修复: index.html 启动时预加载 + qnr-region-detail.js 加 _waitForData 兜底
//
// 用法: node js/questionnaire/probe-therapist-cloud.mjs [baseURL]

import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("[PE] " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("[CONSOLE.ERR] " + m.text()); });

await page.goto(base + "/index.html", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(8000); // 等大 bundle + 预加载

// 等数据模块加载 (这是关键!)
console.log("=== 等待 __qnrData + __qnrScoring 加载 ===");
const dataReady = await page.waitForFunction(
  () => window.__qnrData && window.__qnrData.BRAIN_REGION_ITEMS && window.__qnrScoring,
  { timeout: 15000 }
).then(() => true).catch(() => false);
console.log(dataReady ? "✅ 数据模块就绪" : "❌ 数据模块加载超时");

if (!dataReady) {
  console.log("ERRORS:", errors.slice(0, 3).join(" | "));
  await browser.close();
  process.exit(1);
}

// 构造一条云端记录 (模拟治疗师从 GitHub 拉下来的自评报告)
await page.evaluate(() => {
  const cloudRec = {
    id: "cloud_qnr_test_001",
    date: "2026-08-06", time: "12:00",
    patientInfo: { name: "云端测试患者", age: "40", gender: "女", id: "" },
    overallScore: 50.5,
    type: "questionnaire",
    qnr: {
      percent: 50.5, worstSeverity: "moderate", burdenGroups: ["高级功能"],
      byRegion: { prefrontal: 12, premotor: 5 },
      severityByRegion: { prefrontal: "mild", premotor: "normal" },
      groupDefs: [
        { id: "higher", label: "高级功能", regionIds: ["prefrontal", "premotor"] }
      ],
      regionDefs: [
        { id: "prefrontal", label: "前额叶（背外侧和眶前区）", detail: "区域 9、10、11、12", range: [1, 17] },
        { id: "premotor", label: "额叶中央前区、辅助运动区", detail: "区域 4、6", range: [18, 23] }
      ],
      items: { 1: 0, 2: 2, 3: 4, 4: 1, 5: 3, 18: 1, 19: 2 }
    },
    _isCloud: true,
    _cloudPath: "data/reports/th_default/cloud_qnr_test_001.json",
    _cloudId: "abc123"
  };
  // 注入到 cog_records (模拟"从云端列表打开")
  const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
  arr.unshift(cloudRec);
  localStorage.setItem("cog_records", JSON.stringify(arr));
  console.log("[probe] 注入云端记录完成, id=" + cloudRec.id);
});

// 直接调用 _viewCogReport(0) 模拟"治疗师点击云端记录"
console.log("\n=== 治疗师打开云端自评报告 ===");
await page.evaluate(() => {
  if (typeof window._viewCogReport !== "function") {
    console.log("[probe] _viewCogReport 未定义");
    return;
  }
  window._viewCogReport(0);
});
await page.waitForTimeout(1500);

// 验证: 报告已渲染 (16 行分区应可见)
const regionRows = await page.locator("[data-qnr-region-row]").count();
console.log(`1. 报告渲染: ${regionRows} 个可点击分区行`, regionRows > 0 ? "✅ PASS" : "❌ FAIL");

// 关键测试: 点击第一个分区行 → 弹层应显示做题详情
if (regionRows > 0) {
  console.log("\n=== 点击第一个分区行 (治疗师云端场景) ===");
  const firstRegion = await page.locator("[data-qnr-region-row]").first().getAttribute("data-qnr-region-row");
  console.log("点击 region:", firstRegion);
  await page.locator("[data-qnr-region-row]").first().click();
  await page.waitForTimeout(1500);

  const modalCount = await page.locator("#qnr-region-detail-overlay").count();
  console.log("弹层数:", modalCount, modalCount === 1 ? "✅ PASS" : "❌ FAIL");

  if (modalCount > 0) {
    const modalText = await page.locator("#qnr-region-detail-overlay").textContent();
    // 关键检查: 弹层不应是"数据模块未加载"错误
    const hasErrorMsg = modalText.includes("数据模块未加载") || modalText.includes("加载失败");
    console.log("2. 弹层含'数据模块未加载'错误?", hasErrorMsg ? "❌ FAIL" : "✅ PASS");

    // 弹层应显示分区名 + 题目 + 患者作答
    const hasRegionName = modalText.length > 50 && /Q\d+/.test(modalText);
    console.log("3. 弹层显示题目 (Q编号 + 文本)?", hasRegionName ? "✅ PASS" : "❌ FAIL");

    // 显示前几行内容
    console.log("=== 弹层前 200 字 ===");
    console.log(modalText.slice(0, 200));

    await page.locator("#qnr-region-detail-close").click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

console.log("\n=== 错误日志 ===");
console.log(errors.length === 0 ? "✅ 无错误" : errors.slice(0, 5).join("\n"));

await browser.close();
console.log("\n🎯 治疗师云端记录弹层测试完成");
