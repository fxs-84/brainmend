// tools/render-sim-cog-report.mjs
// 走真实云端链路:
//   1. Playwright 加载 index.html
//   2. 等 SupabaseClient + BmTherapistUI 就绪
//   3. 治疗师登录 bm-e2e-test@example.com (从 supabase-config.js 读 URL/KEY)
//   4. 注入 _cogScoreLog (12 模块作答)
//   5. 触发 _showCognitiveReport() → 自动 saveRecord → _submitCogCloud
//      (已登录会走 submit_cognitive_assessment_direct RPC, 上传 Supabase)
//   6. 等云端同步完成 (_cloudStatus === 'synced')
//   7. 拦截 PDF 下载 → 落盘
// 用法: node tools/render-sim-cog-report.mjs [输出 PDF 路径]

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(__dirname, "..");
const OUT = resolvePath(ROOT, process.argv[2] || "screenshots/cog-sim-report.pdf");
mkdirSync(dirname(OUT), { recursive: true });

const BASE = process.env.BASE || "http://localhost:8765";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";

// === 模拟 12 项作答 (公式同前) ===
const RAW_LOG = {
  attention:    { score: 7,  trials: 10, completionRate: 0.833 },
  shortmem:     { correct: 4, wrong: 1, trials: 5,  digitCount: 6 },
  memory:       { correct: 4, wrong: 1, trials: 5,  digitCount: 8 },
  flex:         { correct: 8, trials: 10, completionRate: 0.833 },
  language:     { score: 8,  correct: 8, trials: 10, completionRate: 0.833 },
  reasoning:    { score: 11, correct: 11, trials: 14, completionRate: 0.778 },
  planning:     { level: 7, moves: 10, optimal: 8, stepEfficiency: 0.8 },
  scenerecall:  { correct: 4, trials: 4,  totalIcons: 7 },
  memorg:       { correct: 4, trials: 4,  totalCards: 6 },
  inhibition:   { correct: 35, trials: 46, rtTotal: 44000 },
  visual:       { correct: 3, wrong: 1, trials: 4,  digitCount: 6 },
  observation:  { score: 8,  correct: 8, trials: 10, completionRate: 0.833 }
};

const PATIENT = { name: "付先生", age: "42", gender: "男" };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
page.on("console", (msg) => { if (msg.type() === "error") console.log("  [console.error]", msg.text()); });

console.log("→ 加载 index.html …");
await page.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });

console.log("→ 等 SupabaseClient + 12 模块 + vendor 库就绪 …");
await page.waitForFunction(() => {
  return window.__attention && window.__shortmem && window.__memory &&
         window.__flex && window.__language && window.__reasoning &&
         window.__cog && window.__scenerecall && window.__memorg &&
         window.__stroop && window.__visual && window.__observation &&
         window._showCognitiveReport && window.SupabaseClient && window.SupabaseClient.isConfigured() &&
         window.html2canvas && window.jspdf && window.jspdf.jsPDF;
}, null, { timeout: 60000 });
console.log("  ✅ 模块 + Supabase + vendor 库就绪");

console.log("→ 治疗师登录 bm-e2e-test@example.com …");
const loginResult = await page.evaluate(async ([email, pwd]) => {
  try {
    const sess = await window.SupabaseClient.signIn(email, pwd);
    const cur = window.SupabaseClient.getSession();
    return { ok: !!sess, user: cur && cur.user && cur.user.email };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}, [TEST_EMAIL, TEST_PASSWORD]);
console.log("  登录结果:", JSON.stringify(loginResult));
if (!loginResult.ok) {
  console.error("❌ 登录失败, 中止. 可能原因: Supabase 网络不通 / 账号已失效 / 邮件未验证");
  await browser.close();
  process.exit(1);
}

console.log("→ 创建认知 share_link (供 share_token 上传链路) …");
const shareLinkResult = await page.evaluate(async ([patient]) => {
  try {
    const link = await window.SupabaseClient.createShareLink({
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      expiresDays: 30,
      kind: "cognitive"
    });
    // RPC 返回 public.qnr_share_links 一行: { token, ... }
    const token = link && link.token;
    return { ok: !!token, token: String(token || "") };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}, [PATIENT]);
console.log("  share_link:", JSON.stringify(shareLinkResult));
if (!shareLinkResult.ok) {
  console.error("❌ 创建 share_link 失败:", shareLinkResult.err);
  await browser.close();
  process.exit(1);
}

console.log("→ 注入 _cogScoreLog + share_token + 患者信息 …");
await page.evaluate(([rawLog, patient, shareToken]) => {
  window._cogScoreLog = rawLog;
  window._cogPatientInfo = patient;
  // 治疗师视角已确认患者信息 (跳过 _showCognitiveReport 的登记表单弹窗)
  window._cogPatientConfirmed = true;
  // share_token 写入 sessionStorage (cognitive-report.js _getCogShareToken 优先读)
  try { sessionStorage.setItem("bm_cog_share_token", shareToken); } catch(e) {}
  // 同时兜底 URL 参数 (_getCogShareToken 也会从 location.search 解析)
  try {
    var url = new URL(location.href);
    url.searchParams.set("share_token", shareToken);
    history.replaceState(null, "", url.toString());
  } catch(e) {}
  // 把患者信息预写到 localStorage (治疗师视角的患者卡会用)
  try { localStorage.setItem("cervical_current_client", JSON.stringify(patient)); } catch(e) {}
}, [RAW_LOG, PATIENT, shareLinkResult.token]);

console.log("→ 触发 _showCognitiveReport() → saveRecord → _submitCogCloud (上云) …");
const cloudResult = await page.evaluate(async () => {
  // 诊断: 调前状态
  const before = {
    overlayDisplay: document.getElementById("cog-report-overlay")?.style?.display,
    hasRawLog: !!window._cogScoreLog,
    hasShow: typeof window._showCognitiveReport === "function",
    hasRender: typeof window.renderReport === "function",
    recCount: 0
  };
  try { before.recCount = JSON.parse(localStorage.getItem("cog_records") || "[]").length; } catch(e) {}
  try {
    window._showCognitiveReport();
  } catch (e) {
    return { ok: false, status: "show_threw", err: String(e.message || e), before };
  }
  // 等云端同步: 轮询 cog_records 最新一条的 _cloudStatus
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
      if (arr.length > 0 && (arr[0]._cloudStatus === "synced" || arr[0]._cloudStatus === "failed")) {
        return {
          ok: arr[0]._cloudStatus === "synced",
          status: arr[0]._cloudStatus,
          cloudId: arr[0]._cloudId,
          err: arr[0]._cloudErr,
          recordId: arr[0].id,
          overlayDisplay: document.getElementById("cog-report-overlay")?.style?.display,
          before
        };
      }
    } catch (e) {}
  }
  // timeout 但也要看 overlay 状态
  return {
    ok: false, status: "timeout",
    overlayDisplay: document.getElementById("cog-report-overlay")?.style?.display,
    before
  };
});
console.log("  云端状态:", JSON.stringify(cloudResult));
if (!cloudResult.ok) {
  console.warn("⚠️ 云端同步未成功 (状态:", cloudResult.status + ") — 仍继续导出本地 PDF");
} else {
  console.log("  ✅ 已上云, cloud_id:", cloudResult.cloudId);
}

console.log("→ 等报告 DOM + canvas 渲染 …");
await page.waitForSelector("#cog-report-overlay", { state: "visible", timeout: 30000 });
await page.waitForFunction(() => {
  const r = document.getElementById("cog-radar-canvas");
  const b = document.getElementById("cog-brain-2d");
  return r && b && r.width > 100 && b.width > 100;
}, null, { timeout: 30000 });
await page.waitForTimeout(800);
console.log("  ✅ 报告渲染完成");

console.log("→ 触发 PDF 导出 …");
const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
await page.click("#cog-report-export-btn");
const download = await downloadPromise;
console.log("  ↓ 收到下载:", download.suggestedFilename());
await download.saveAs(OUT);
console.log("  ✅ 已保存:", OUT);

await browser.close();
console.log("\n✓ 完成. 输出:", OUT);
console.log("  云端记录 ID:", cloudResult.cloudId || "(未上云)");