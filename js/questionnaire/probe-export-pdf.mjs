// js/questionnaire/probe-export-pdf.mjs
// 验证: 从记录列表直接打开"神经系统自评"报告 (绕过 _viewCogReport, _lastCogReportIdx 缺失)
// 点 footer「📄 导出 PDF」应走 _qnrExportReport 并成功产出 PDF, 而不是误入 _exportCogPDF 报"无内容可导出"
// 用法: node tests/static-server.mjs & 然后 node js/questionnaire/probe-export-pdf.mjs
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("dialog", async (d) => { logs.push(`[dialog] ${d.message()}`); await d.dismiss(); });

await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window._qnrRenderCloud === "function" && typeof window._exportCurrentReport === "function", null, { timeout: 30000 });

// 注入一条最小可用的自评记录 (type=questionnaire)
const rec = {
  id: "probe_qnr_1",
  type: "questionnaire",
  date: "2026/08/11",
  time: "15:00",
  patientInfo: { name: "导出测试", age: 35, gender: "男" },
  qnr: {
    groupDefs: [{ id: "motor", label: "运动组", regionIds: ["r1"] }],
    regionDefs: [{ id: "r1", label: "测试分区", detail: "probe", range: [1, 2] }],
    items: { 1: 2, 2: 1 },
    byRegion: { r1: 3 },
    severityByRegion: { r1: "mild" },
    affectedRegions: ["r1"],
    total: 3,
    percent: 38,
    worstSeverity: "mild",
    burdenGroups: ["运动组"]
  }
};
await page.evaluate((r) => {
  localStorage.setItem("cog_records", JSON.stringify([r]));
}, rec);

// 模拟治疗师端路径: 直接调 _qnrRenderCloud (qnr-therapist-ui.js:957 同款), 不经过 _viewCogReport
await page.evaluate((r) => {
  delete window._lastCogReportIdx; // 确认 idx 状态缺失
  window._qnrRenderCloud(r);
}, rec);
await page.waitForTimeout(500);

const state = await page.evaluate(() => ({
  overlayDisplay: document.getElementById("cog-report-overlay")?.style.display,
  hasQnrMarker: !!document.querySelector("#cog-report-body #qnr-cloud-status, #cog-report-body [data-qnr-region-row]"),
  hasCogSections: !!document.querySelector("#cog-report-body #cog-section-overview"),
  lastIdx: window._lastCogReportIdx
}));
console.log("渲染后状态:", JSON.stringify(state));
if (!state.hasQnrMarker) { console.log("❌ 自评报告未渲染出 DOM 标记, 测试前置失败"); await browser.close(); process.exit(1); }

// 点 footer「📄 导出 PDF」(_exportCurrentReport 路由)
const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
await page.click("#cog-report-export-btn");
const download = await downloadPromise;
console.log("✅ 导出成功, 文件名:", download.suggestedFilename());

if (!download.suggestedFilename().startsWith("神经系统自评报告")) {
  console.log("❌ 文件名不对, 可能走错了导出路径");
  await browser.close();
  process.exit(1);
}

const errs = logs.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[dialog]"));
if (errs.length) { console.log("❌ 页面报错:", errs.join("\n")); await browser.close(); process.exit(1); }
console.log("✅ 无 alert / pageerror, 路由正确走了 _qnrExportReport");
await browser.close();
