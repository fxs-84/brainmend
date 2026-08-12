// js/questionnaire/probe-export-pdf.mjs
// 验证: 治疗师工作台打开云端自评报告 (openQnrReport → _qnrRenderCloud, 记录可能无 id / 不在本机 cog_records)
// 点 footer「📄 导出 PDF」应走 _qnrExportReport 并成功产出 PDF, 而不是误入 _exportCogPDF 报"无内容可导出"
// 用法: node tests/static-server.mjs & 然后 node js/questionnaire/probe-export-pdf.mjs [baseURL]
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("dialog", async (d) => { logs.push(`[dialog] ${d.message()}`); await d.dismiss(); });

await page.goto(base + "/index.html", { waitUntil: "commit", timeout: 90000 });
// 等模块脚本 (cognitive-report.js 暴露 _exportCogPDF) 也执行完, 模拟真实用户看到页面后的状态
await page.waitForFunction(() => typeof window._qnrRenderCloud === "function" && typeof window._exportCurrentReport === "function" && typeof window._exportCogPDF === "function", null, { timeout: 90000 });
// ⚠️ 必须等 load: pageshow 会触发 _qnrCleanupOverlays 把 cog-report-overlay 重新 display:none (index.html:1701)
await page.waitForLoadState("load", { timeout: 90000 });
await page.waitForTimeout(500);

// 模拟治疗师工作台 openQnrReport 的 formatted 记录:
// - 不在本机 cog_records (云端记录)
// - 历史上 formatted 无 id 字段 (旧版 qnr-therapist-ui.js), 这里两种都测
const baseRec = {
  type: "questionnaire",
  date: "2026-08-11",
  time: "15:00",
  patientInfo: { name: "导出测试", age: 35, gender: "男", id: "" },
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

async function runCase(label, rec) {
  await page.evaluate((r) => {
    delete window._lastCogReportIdx; // 确认 idx 状态缺失
    localStorage.removeItem("cog_records"); // 云端记录不在本机
    window._qnrRenderCloud(r);
  }, rec);
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => ({
    hasQnrMarker: !!document.querySelector("#cog-report-body #qnr-cloud-status, #cog-report-body [data-qnr-region-row]"),
    hasCogSections: !!document.querySelector("#cog-report-body #cog-section-overview"),
    qSection: !!document.querySelector("#cog-report-body [data-qnr-questions-section]"),
    regionCount: document.querySelectorAll("#cog-report-body [data-qnr-q-region]").length,
    itemCount: document.querySelectorAll("#cog-report-body [data-qnr-q-item]").length,
    pdfHasQSection: document.querySelector("#cog-report-body")?.innerHTML.includes("data-qnr-questions-section") === true
  }));
  if (!state.hasQnrMarker) { console.log(`❌ [${label}] 自评报告未渲染出 DOM 标记`); return false; }
  if (!state.qSection) { console.log(`❌ [${label}] 做题详情区块 (qnr-questions-section) 缺失`); return false; }
  if (state.regionCount < 16) { console.log(`❌ [${label}] 做题详情应包含 16 分区, 实际 ${state.regionCount}`); return false; }
  if (state.itemCount < 90) { console.log(`❌ [${label}] 做题详情题目数异常: ${state.itemCount}`); return false; }
  console.log(`✅ [${label}] 报告含 ${state.regionCount} 分区 / ${state.itemCount} 题`);

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  // 诊断: 点击前打印按钮可见性链
  const vis = await page.evaluate(() => {
    const btn = document.getElementById("cog-report-export-btn");
    const chain = [];
    let el = btn;
    while (el && chain.length < 8) {
      const cs = getComputedStyle(el);
      chain.push(el.tagName + "#" + (el.id || "") + " display=" + cs.display + " vis=" + cs.visibility + " " + el.offsetWidth + "x" + el.offsetHeight);
      el = el.parentElement;
    }
    return chain;
  });
  console.log(`[${label}] 按钮链:`, JSON.stringify(vis));
  await page.click("#cog-report-export-btn");
  const download = await downloadPromise;
  const name = download.suggestedFilename();
  if (!name.startsWith("神经系统自评报告")) { console.log(`❌ [${label}] 文件名不对: ${name} (可能走错了导出路径)`); return false; }
  console.log(`✅ [${label}] 导出成功: ${name}`);
  return true;
}

const ok1 = await runCase("云端记录·无id", baseRec);
const ok2 = await runCase("云端记录·有id", { ...baseRec, id: "cloud_probe_1" });

const errs = logs.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[dialog]"));
if (errs.length) { console.log("❌ 页面 alert/报错:", errs.join("\n")); await browser.close(); process.exit(1); }
if (!ok1 || !ok2) { await browser.close(); process.exit(1); }
console.log("✅ 无 alert / pageerror, 两种云端记录形态均路由正确");
await browser.close();
