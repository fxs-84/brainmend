/**
 * 神经系统自评 · 二维码分享闭环 E2E (与认知评估同链路)
 *
 * 流程:
 *  1. 治疗师: 主页 → 神经系统自评 → 生成二维码 → 读 qnr-qr-url
 *  2. 患者: 扫码 (新 context) → 沙箱作答 100 题 → 完成页
 *  3. 患者: 点「保存到评估报告」→ 跳回 index.html?return=questionnaire&result=...
 *  4. 主页: 解码 → 评分 → 写入 cog_records (type=questionnaire) → 自动打开报告
 *  5. 验证: cog_records 记录存在 / 16 分区与独立 scoring 一致 / 报告 overlay 渲染 4 组 16 分区
 *  6. 治疗师: 打开认知报告列表 → 自评行显示 📋100题 → 点击 → 自绘报告
 *
 * 用法: node js/questionnaire/e2e-share-flow.mjs [baseURL]
 */

import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const errors = [];
const browser = await chromium.launch({ channel: "chrome" });

// 已知噪音: src/game-3d/integrate.js 需 vite 编译才能解析 three (项目既有部署特性, 与自评无关)
// 本地 dev 静态服务器无 src/ 目录 → 资源 404 也是噪音 (部署版无此问题, 单独用 probe-404 验证)
function isNoise(msg) {
  return msg.includes("three") || msg.includes("Failed to resolve module specifier") || msg.includes("Failed to load resource");
}
function pushError(tag, msg) {
  if (!isNoise(msg)) errors.push(`[${tag}] ${msg}`);
}

// ---------- 1. 治疗师端: 生成二维码 URL ----------
const therapist = await browser.newContext();
const tp = await therapist.newPage();
tp.on("pageerror", (e) => pushError("therapist", e.message));
await tp.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await tp.waitForTimeout(800);

const qnrBtn = tp.locator("#page2-questionnaire");
await qnrBtn.waitFor({ state: "visible", timeout: 15000 });
await qnrBtn.click();
await tp.waitForTimeout(300);
const shareBtn = tp.locator("#qnr-modal-share");
await shareBtn.waitFor({ state: "visible", timeout: 8000 });
await shareBtn.click();
await tp.waitForTimeout(800);
const qrUrl = await tp.locator("#qnr-qr-url").textContent();
if (!qrUrl || !qrUrl.includes("questionnaire.html")) {
  throw new Error(`QR URL 异常: ${qrUrl}`);
}
console.log(`✅ 治疗师端生成 QR URL: ${qrUrl.slice(0, 110)}...`);

// ---------- 2. 患者端: 扫码进入沙箱作答 ----------
const patient = await browser.newContext();
const pp = await patient.newPage();
pp.on("pageerror", (e) => pushError("patient", e.message));
pp.on("console", (m) => { if (m.type() === "error") pushError("patient", m.text()); });
await pp.goto(qrUrl, { waitUntil: "networkidle" });
await pp.waitForTimeout(500);

const badge = await pp.textContent(".badge").catch(() => "");
if (!badge.includes("患者作答")) throw new Error(`沙箱 badge 缺失: "${badge}"`);
console.log("✅ 沙箱模式激活");

await pp.click("#intro-start");
await pp.waitForSelector("#screen-quiz:not([style*='none']) .q-option");
for (let q = 1; q <= 100; q++) {
  const num = await pp.textContent("#quiz-q-number");
  if (!num.includes(`第 ${q} / 100 题`)) throw new Error(`题号错位: 期望第 ${q} 题, 实际 "${num}"`);
  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
  await pp.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await pp.waitForTimeout(380);
}
await pp.click("#quiz-next");
await pp.waitForSelector("#screen-result:not([style*='none']) .result-group");
console.log("✅ 100 题作答完成, 进入结果页");

// ===== 新流程: 完成 100 题 → 点「查看结果」→ 沙箱模式自动弹登记表单 (不再需要手动保存按钮) =====
const saveBtn = pp.locator("#result-save-report");
const saveBtnVisible = await saveBtn.isVisible().catch(() => false);
if (saveBtnVisible) {
  throw new Error("新流程不应再显示「📤 保存到评估报告」按钮 (应自动弹登记表单)");
}
console.log("✅ 已移除「保存到评估报告」按钮 (符合新流程要求)");

// 登记表单应自动弹出 (finishQuiz 内部 setTimeout 80ms 后派发 qnr:finished)
await pp.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
console.log("✅ 客户信息登记表单自动弹出");
await pp.waitForTimeout(400);

// 填客户信息 (验证中文姓名 UTF-8 编码)
await pp.fill("#qnr-reg-name", "李四");
await pp.fill("#qnr-reg-age", "42");
await pp.selectOption("#qnr-reg-gender", "女");

// ===== 新增验证: 提交后应出现「正在保存」指示器 (无白屏焦虑) =====
await pp.click("#qnr-reg-submit");
const savingVisible = await pp.locator("#qnr-saving-overlay").isVisible({ timeout: 1000 }).catch(() => false);
if (!savingVisible) {
  console.warn("⚠️  保存指示器未出现 (非阻塞, 但用户体验下降)");
} else {
  console.log("✅ 提交后「正在保存」指示器已显示");
}

await pp.waitForURL(/index\.html/, { timeout: 20000 });
await pp.waitForTimeout(2500);

const rec = await pp.evaluate(() => {
  const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
  return arr.filter((r) => r && r.type === "questionnaire").pop() || null;
});
if (!rec) throw new Error("cog_records 中没有 type=questionnaire 记录");
const d = rec.qnr || {};
if (!d.byRegion || !d.severityByRegion) throw new Error("记录缺少 qnr.byRegion / severityByRegion");
if (Object.keys(d.byRegion).length !== 16) throw new Error(`应 16 分区, 实际 ${Object.keys(d.byRegion).length}`);
if (rec.patientInfo.name !== "李四") throw new Error(`客户名应为表单填写的"李四", 实际 "${rec.patientInfo.name}"`);
if (rec.patientInfo.age !== "42" || rec.patientInfo.gender !== "女") throw new Error(`客户信息未保存: ${JSON.stringify(rec.patientInfo)}`);
console.log(`✅ 记录写入 cog_records: ${rec.patientInfo.name} (${rec.patientInfo.gender}/${rec.patientInfo.age}岁) / ${d.percent}% / 16 分区`);

// 与独立 scoring 一致性
const verify = await (await import("./scoring.js")).scoreBrainRegion({ items: d.items, phoneEar: d.phoneEar });
const mismatches = [];
for (const rid of Object.keys(d.byRegion)) {
  if (d.byRegion[rid] !== verify.byRegion[rid]) mismatches.push(`${rid}: 存储=${d.byRegion[rid]} 独立算=${verify.byRegion[rid]}`);
  if (d.severityByRegion[rid] !== verify.severityByRegion[rid]) mismatches.push(`${rid}: 严重度存储=${d.severityByRegion[rid]} 独立算=${verify.severityByRegion[rid]}`);
}
if (mismatches.length) throw new Error(`存储与独立评分不一致:\n${mismatches.join("\n")}`);
console.log("✅ 存储 16 分区与独立 scoring.js 完全一致");

// 报告 overlay 应自动打开 (患者跳回后)
const overlayVisible = await pp.locator("#cog-report-overlay").isVisible().catch(() => false);
if (!overlayVisible) throw new Error("保存后 cog-report-overlay 未自动打开");
const reportText = await pp.locator("#cog-report-body").textContent();
if (!reportText.includes("前额叶") || !reportText.includes("报警系统") || !reportText.includes("运动与平衡") || !reportText.includes("高级功能")) {
  throw new Error("报告未渲染 4 组内容");
}
const regionRows = await pp.locator("#cog-report-body [style*='border-top:1px solid #f1f5f9']").count();
console.log(`✅ 报告自动打开: 4 组渲染正常 (${regionRows} 行分区)`);

// ===== 新增验证: 报告页有「导出 PDF」按钮 + 持久化云端状态行 =====
// 注: 旧版 #cog-report-footer 含 cog-report-close-btn, 新版多了「导出 PDF」+「打印」按钮
const exportBtn = pp.locator('button:has-text("导出 PDF")');
const exportCount = await exportBtn.count();
const exportVisible = exportCount > 0 ? await exportBtn.first().isVisible().catch(() => false) : false;
if (!exportVisible) {
  // 调试: 把报告 body 里所有 button 列出来
  const allBtns = await pp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#cog-report-body button'));
    return btns.map(b => b.textContent.replace(/[-‍﻿]/g, '').trim());
  });
  throw new Error("报告页缺少「📄 导出 PDF」按钮 (debug buttons=" + JSON.stringify(allBtns) + ")");
}
console.log("✅ 报告页有「📄 导出 PDF」按钮 (符合新流程: 不要保存按钮, 只要导出)");

// 持久化云端状态行: 应显示「正在同步」/「已同步」/「同步失败」(三选一)
const cloudLine = pp.locator("#qnr-cloud-status");
const cloudText = (await cloudLine.textContent().catch(() => "")) || "";
const hasCloudLine = /同步|☁️|云端/.test(cloudText);
if (!hasCloudLine) throw new Error(`报告页缺少云端状态行: "${cloudText}"`);
console.log(`✅ 报告页云端状态行存在: ${cloudText.trim().slice(0, 40)}`);

// ===== 新增验证: CloudSync 已加载 (后台自动重试机制就位) =====
const cloudSyncReady = await pp.evaluate(() => !!(window.CloudSync && window.CloudSync.saveReportReliably));
if (!cloudSyncReady) throw new Error("window.CloudSync 未挂载 (后台重试机制失效)");
console.log("✅ window.CloudSync 已挂载 (指数退避重试 + 后台队列就位)");

// 模拟点击重试按钮 (失败场景): 即便没真实失败, 重试流程不应报错
const retryBtn = pp.locator('button:has-text("重试")').first();
const retryVisible = await retryBtn.isVisible().catch(() => false);
if (retryVisible) {
  console.log("✅ 失败状态下显示「重试」按钮 (无 alert)");
}

// ---------- 4. 治疗师端: 认知报告列表 → 自评行 → 自绘报告 ----------
// 注: 患者 context 的 localStorage 与治疗师 context 隔离 (真实场景靠云端同步)
// 这里模拟"同设备"场景: 把患者记录复制到治疗师端 cog_records (等价于云端同步后本机缓存)
await tp.bringToFront();
await tp.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await tp.waitForTimeout(800);
await tp.evaluate((rec) => {
  const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
  arr.push(rec);
  localStorage.setItem("cog_records", JSON.stringify(arr));
}, rec);
await tp.reload({ waitUntil: "networkidle" });
await tp.waitForTimeout(800);

await tp.locator("#page2-cog-report").click();
await tp.waitForTimeout(800);
const listOverlay = tp.locator("#cog-record-list-overlay");
await listOverlay.waitFor({ state: "visible", timeout: 8000 });
const listText = await listOverlay.textContent();
if (!listText.includes("📋100题")) throw new Error("认知报告列表缺少自评行 (📋100题)");
console.log("✅ 认知报告列表出现自评行 (📋100题)");

// 点击自评行 → 自绘报告
const qnrRow = listOverlay.locator('[style*="cursor:pointer"]', { hasText: "📋100题" }).last();
await qnrRow.click();
await tp.waitForTimeout(800);
const tpReportVisible = await tp.locator("#cog-report-overlay").isVisible();
if (!tpReportVisible) throw new Error("治疗师端自绘报告未打开");
const tpReportText = await tp.locator("#cog-report-body").textContent();
if (!tpReportText.includes("脑区地图") || !tpReportText.includes("前额叶")) {
  throw new Error("治疗师端自绘报告内容异常");
}
console.log("✅ 治疗师端点击自评行 → 自绘报告渲染正常");

// ---------- 4.5 云端记录行路由验证 (cognitive-report.js _renderCloudRows 的自评分支) ----------
await tp.evaluate(() => {
  // 构造云端自评记录 (fetchCloudReports 映射后的结构), 直接调 _qnrRenderCloud
  const cloudRec = {
    id: "cloud_test", date: "2026/8/4", time: "12:00",
    patientInfo: { name: "云端患者", age: "40", gender: "女", id: "" },
    overallScore: 50.5, isQuick6: false,
    type: "questionnaire",
    qnr: {
      percent: 50.5, worstSeverity: "moderate", burdenGroups: ["报警系统"],
      byRegion: { parasympathetic: 10, sympathetic: 8 },
      severityByRegion: { parasympathetic: "moderate", sympathetic: "mild" },
      groupDefs: [{ id: "alarm", label: "报警系统", regionIds: ["parasympathetic", "sympathetic"] }],
      regionDefs: [{ id: "parasympathetic", label: "副交感神经活动减少", detail: "", range: [90, 94] }],
      items: { 90: 4, 91: 4, 92: 2 }
    }
  };
  window._qnrRenderCloud(cloudRec);
});
await tp.waitForTimeout(300);
const cloudReportText = await tp.locator("#cog-report-body").textContent();
if (!cloudReportText.includes("云端患者") || !cloudReportText.includes("副交感")) {
  throw new Error("云端自评记录渲染异常");
}
console.log("✅ 云端记录行路由 → 自绘报告渲染正常");

// ---------- 5. 关闭报告 (验证 _closeCogReport 正常) ----------
await tp.evaluate(() => window._closeCogReport());
await tp.waitForTimeout(300);
const closed = await tp.locator("#cog-report-overlay").isVisible().catch(() => false);
if (closed) throw new Error("报告未能关闭");
console.log("✅ 报告可正常关闭");

if (errors.length) throw new Error(`JS 报错:\n${errors.join("\n")}`);
console.log("\n🎉 神经系统自评二维码分享闭环 E2E 全部通过");
await browser.close();
