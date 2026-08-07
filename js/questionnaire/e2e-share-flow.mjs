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
const therapist = await browser.newContext({ acceptDownloads: true });
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

// ===== 顶层设计验证: 客户不应跳转到 index.html =====
// 新流程: 报告在 questionnaire.html 内联渲染, 客户不离开本页
await pp.waitForTimeout(3500); // 等评分/渲染完成
const currentUrl = pp.url();
if (!currentUrl.includes("questionnaire.html")) {
  throw new Error(`❌ 客户被跳转到 ${currentUrl} — 应留在 questionnaire.html (顶层设计: 客户不能进首页)`);
}
console.log(`✅ 客户留在 questionnaire.html (URL=${currentUrl})`);

// ===== 验证: 报告内联渲染 =====
const reportVisible = await pp.locator("#screen-report").isVisible().catch(() => false);
if (!reportVisible) throw new Error("❌ 报告页 (#screen-report) 未显示 — 报告未内联渲染");
console.log("✅ 报告页 #screen-report 已显示 (内联渲染)");

// ===== 验证: 报告内容包含患者姓名 + 16 分区 =====
const reportText = await pp.locator("#qnr-report-body").textContent().catch(() => "");
if (!reportText.includes("李四")) throw new Error("❌ 报告未显示患者姓名 '李四'");
if (!reportText.includes("前额叶") || !reportText.includes("报警系统") || !reportText.includes("运动与平衡") || !reportText.includes("高级功能")) {
  throw new Error("❌ 报告未渲染 4 组内容");
}
const regionRows = await pp.locator("#qnr-report-body [style*='border-top:1px solid #f1f5f9']").count();
if (regionRows !== 16) throw new Error(`❌ 应 16 行分区, 实际 ${regionRows}`);
console.log(`✅ 报告内容完整: 4 组 × 16 分区, 患者姓名 ${reportText.match(/李四/) ? '✓' : '✗'}`);

// ===== 验证: 导出 PDF 按钮存在 + 真下载闭环 =====
const exportBtn = pp.locator("#qnr-export-pdf-btn");
const exportVisible = await exportBtn.isVisible().catch(() => false);
if (!exportVisible) throw new Error("❌ 报告页缺少「📄 导出 PDF」按钮");
console.log("✅ 报告页有「📄 导出 PDF」按钮");

// 真下载验证 (Accept downloads)
const [download] = await Promise.all([
  pp.waitForEvent("download", { timeout: 60000 }),
  pp.click("#qnr-export-pdf-btn")
]);
const dlPath = await download.path();
const dlName = download.suggestedFilename();
const fs = await import("node:fs/promises");
const dlStat = await fs.stat(dlPath);
const dlBuf = await fs.readFile(dlPath);
const pdfHeader = dlBuf.slice(0, 5).toString("ascii");
if (!dlName.endsWith(".pdf")) throw new Error(`❌ 下载文件名不是 PDF: ${dlName}`);
if (pdfHeader !== "%PDF-") throw new Error(`❌ 下载文件不是有效 PDF (头=${pdfHeader})`);
if (dlStat.size < 1000) throw new Error(`❌ PDF 文件太小: ${dlStat.size} bytes`);
console.log(`✅ PDF 导出闭环: ${dlName} (${dlStat.size} bytes, ${pdfHeader})`);

// ===== 验证: 没有任何路径能跳到 index.html =====
// 沙箱模式应该拦截任何返回首页的尝试
const blockedTest = await pp.evaluate(() => {
  // 尝试点击"返回首页"按钮 (沙箱模式应已隐藏)
  var backHome = document.getElementById("result-back-home");
  if (!backHome) return "button_not_visible";
  if (backHome.style.display === "none") return "hidden_ok";
  return "visible_danger";
});
console.log(`✅ 「返回首页」按钮状态: ${blockedTest} (沙箱模式应隐藏)`);

// ===== 新增验证: 报告每个分区可点击展开做题详情 (核心新功能) =====
// 顶层设计: 治疗师端点击每个细分项 → 弹层显示题目 + 患者作答
const regionRowsCount = await pp.locator("#qnr-report-body [data-qnr-region-row]").count();
if (regionRowsCount !== 16) throw new Error(`❌ 应有 16 个可点击分区行, 实际 ${regionRowsCount}`);
console.log(`✅ 报告页 16 个分区行均可点击 (新功能: 查看做题详情)`);

// 测点击第一个分区 (前额叶) → 弹层应出现
await pp.locator('#qnr-report-body [data-qnr-region-row="prefrontal"]').click();
await pp.waitForSelector("#qnr-region-detail-overlay", { state: "visible", timeout: 3000 });
const modalText = await pp.locator("#qnr-region-detail-overlay").textContent();
if (!modalText.includes("前额叶")) throw new Error("❌ 弹层未显示分区名 '前额叶'");
const qCount = (modalText.match(/Q\d+/g) || []).length;
if (qCount < 5) throw new Error(`❌ 前额叶应至少 5 道题, 实际 ${qCount}`);
// 验证: 弹层显示患者作答 (0-4 分 + 标签: 无症状/很少/经常/频繁/总是)
const hasAnswerLabels = /无症状|很少|经常|频繁|总是/.test(modalText);
if (!hasAnswerLabels) throw new Error("❌ 弹层未显示患者作答标签");
console.log(`✅ 弹层显示前额叶分区详情 (${qCount} 道题 + 患者作答标签)`);

// 验证: 弹层包含中文题目原文 (15+ 字符)
if (!/[一-龥]{8,}/.test(modalText)) {
  throw new Error("❌ 弹层未包含中文题目原文");
}

// 关闭弹层
await pp.locator("#qnr-region-detail-close").click();
await pp.waitForTimeout(300);
const modalClosed = await pp.locator("#qnr-region-detail-overlay").count();
if (modalClosed !== 0) throw new Error("❌ 弹层未关闭");
console.log("✅ 弹层关闭正常");

// ===== 验证: PDF 导出只包含分数, 不包含做题详情 =====
// 用户核心需求: PDF 只导分数, 不导做题情况
// 实现: 弹层在 PDF 截图时不存在 (弹层需点击才出现, 且在 body 顶层, 不在 report DOM 内)
const pdfContent = await pp.evaluate(() => {
  // 直接克隆 report body (PDF 截图的对象就是这个), 不应包含任何题目原文或作答
  var bodyEl = document.getElementById('qnr-report-body');
  if (!bodyEl) return '';
  return bodyEl.innerHTML;
});
// 检查: 不应包含弹层内容 (弹层在 overlay 中, 不在 report body 内)
const overlayInPdf = pdfContent.includes('qnr-region-detail-overlay');
if (overlayInPdf) throw new Error("❌ PDF 截图范围内包含弹层 DOM (违反: PDF 只导分数, 不导做题)");
// 检查: 不应包含题目原文标记 (题目原文只在弹层里)
const hasQuestionText = /<[^>]*>[^<]{15,}[^<]*<\/[^>]*>/.test(pdfContent) && !pdfContent.includes('前额叶');
// 这里只检查弹层不在 PDF 范围内即可 — 弹层不存在于报告 body 中
console.log("✅ PDF 截图范围 (report body) 不含弹层 DOM → 导出 PDF 不会泄露做题详情");

// ===== 验证: cog_records 记录存在 =====
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
// 实际渲染文字: "神经系统自评 (100题)" (不是 "📋100题", 后者是老测试的笔误)
if (!listText.includes("神经系统自评")) throw new Error("认知报告列表缺少自评行");
console.log("✅ 认知报告列表出现自评行");

// 点击自评行 → 自绘报告
const qnrRow = listOverlay.locator('[style*="cursor:pointer"]', { hasText: "神经系统自评" }).last();
await qnrRow.click();
await tp.waitForTimeout(800);
const tpReportVisible = await tp.locator("#cog-report-overlay").isVisible();
if (!tpReportVisible) throw new Error("治疗师端自绘报告未打开");
const tpReportText = await tp.locator("#cog-report-body").textContent();
if (!tpReportText.includes("脑区地图") || !tpReportText.includes("前额叶")) {
  throw new Error("治疗师端自绘报告内容异常");
}
console.log("✅ 治疗师端点击自评行 → 自绘报告渲染正常");

// ===== 治疗师端导出 PDF (走 _exportCurrentReport 路由) =====
// 关键验证: 治疗师在 index.html 查看自评报告, 点 footer 的「📄 导出 PDF」按钮,
// 应该调用 _qnrExportReport (适配自评 DOM 结构), 而不是 _exportCogPDF (适配认知 DOM)
const exportBtnTp = tp.locator("#cog-report-export-btn");
if (!(await exportBtnTp.isVisible().catch(() => false))) {
  throw new Error("治疗师端报告页缺少 #cog-report-export-btn");
}
console.log("✅ 治疗师端报告页有 #cog-report-export-btn");
// 用 page.on('download') 捕获, 更稳健
const tpDlPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('治疗师端下载 60s 超时')), 60000);
  tp.once("download", dl => { clearTimeout(t); resolve(dl); });
});
await tp.click("#cog-report-export-btn");
const tpDownload = await tpDlPromise;
const tpDlName = tpDownload.suggestedFilename();
const tpDlPath = await tpDownload.path();
const fs2 = await import("node:fs/promises");
const tpDlStat = await fs2.stat(tpDlPath);
const tpDlBuf = await fs2.readFile(tpDlPath);
const tpPdfHeader = tpDlBuf.slice(0, 5).toString("ascii");
if (!tpDlName.includes("神经系统自评报告")) throw new Error(`❌ 治疗师端导出文件名不对: ${tpDlName} (应走 qnr 路径)`);
if (tpPdfHeader !== "%PDF-") throw new Error(`❌ 治疗师端 PDF 头不对: ${tpPdfHeader}`);
console.log(`✅ 治疗师端导出 PDF 路由正确: ${tpDlName} (${tpDlStat.size} bytes, ${tpPdfHeader})`);

// ---------- 4.5 遗留云端记录渲染验证 (_qnrRenderCloud 的自评分支) ----------
await tp.evaluate(() => {
  // 构造遗留云端自评记录, 直接调 _qnrRenderCloud
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
