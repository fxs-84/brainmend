// js/questionnaire/probe-cog-report-btn.mjs
// 验证首页"评估报告"按钮实际行为: 应该弹本机报告列表 modal, 不是治疗师工作台
import { chromium } from "playwright";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

await page.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => window._showCogRecordList, null, { timeout: 30000 });

// 先注入一些本机报告
await page.evaluate(() => {
  const now = new Date().toISOString();
  const arr = [
    { id: "local-1", type: "questionnaire", patientInfo: { name: "本地测试-张", age: 30, gender: "男" }, overallScore: 75, date: "2026-08-08", time: "10:00", qnr: { byRegion: {}, severityByRegion: {} } },
    { id: "local-2", type: "cognitive", patientInfo: { name: "本地测试-李", age: 45, gender: "女" }, overallScore: 82, date: "2026-08-08", time: "11:00", rawScores: {}, isQuick6: true }
  ];
  localStorage.setItem("cog_records", JSON.stringify(arr));
});

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// 点击"评估报告"按钮
await page.click("#page2-cog-report");
await page.waitForTimeout(1500);

// 检查弹出了哪个 modal
const state = await page.evaluate(() => {
  const localList = document.getElementById("cog-record-list-overlay");
  const dashboard = document.getElementById("bm-dashboard-modal");
  return {
    localListVisible: !!localList && getComputedStyle(localList).display !== "none",
    localListTitle: localList?.querySelector("div span")?.textContent || "",
    localListHasSearch: !!localList?.querySelector("input"),
    localListHasRecords: localList?.textContent?.includes("本地测试"),
    dashboardVisible: !!dashboard && getComputedStyle(dashboard).display !== "none"
  };
});
console.log("\n=== Modal 状态 ===");
console.log(JSON.stringify(state, null, 2));
assert("弹出本机报告列表 modal (不是工作台)", state.localListVisible && !state.dashboardVisible, "");
assert("modal 标题是'认知报告记录'", state.localListTitle.includes("认知报告") || state.localListTitle.includes("评估"), state.localListTitle);
assert("有搜索框", state.localListHasSearch, "");
assert("显示本机报告数据", state.localListHasRecords, "");
await page.screenshot({ path: "js/questionnaire/screenshot-cog-report-btn.png", fullPage: true });
console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
await browser.close();
if (fail > 0) process.exit(1);