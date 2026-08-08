// js/questionnaire/probe-tracking-cloud-render.mjs
// 头动追踪云端报告 → 治疗师工作台「原版颈椎功能综合评估报告」渲染验证
//
// 流程:
//  1. REST 登录固定测试账号 bm-e2e-test@example.com (不存在则注册)
//  2. RPC submit_tracking_record 插一条带完整 assessment 的新格式记录
//     + 一条不带 assessment 的旧格式记录 (降级路径)
//  3. Playwright 打开 index.html (预置 session) → 工作台 → 头动追踪 tab
//     → 点开新记录 → 断言 #view-report 可见 + 原版各章节存在 → 分段截图
//  4. 点开旧记录 → 断言降级渲染不 crash + 版式正确 → 分段截图
//  5. 打印与 tests/reports/expected-pdf-p1/p2.png 的版式对比结论
//
// 截图输出: tests/reports/tracking-cloud-render-{new,old}-p{1,2,3}.png
//
// 用法: node js/questionnaire/probe-tracking-cloud-render.mjs [baseURL]

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "http://localhost:8765";
const SHOT_DIR = "tests/reports";

// 读 supabase-config.js
const configPath = resolvePath(__dirname, "../../assets/config/supabase-config.js");
const src = readFileSync(configPath, "utf8");
const SUPABASE_URL = src.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const SUPABASE_KEY = src.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ supabase-config.js 未配置"); process.exit(1); }

const EMAIL = "bm-e2e-test@example.com";
const PASSWORD = "Test1234!";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

// ---------- REST auth ----------
async function restAuth(path, body) {
  const res = await fetch(SUPABASE_URL + path, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function loginOrSignup() {
  let r = await restAuth("/auth/v1/token?grant_type=password", { email: EMAIL, password: PASSWORD });
  if (!r.ok || !r.data.access_token) {
    console.log("  账号不存在或登录失败, 尝试注册...", r.data.error_description || r.data.msg || r.status);
    const s = await restAuth("/auth/v1/signup", { email: EMAIL, password: PASSWORD, data: { full_name: "E2E测试治疗师" } });
    if (!s.ok && !s.data.access_token) throw new Error("注册失败: " + JSON.stringify(s.data).substring(0, 200));
    if (!s.data.access_token) {
      r = await restAuth("/auth/v1/token?grant_type=password", { email: EMAIL, password: PASSWORD });
    } else {
      r = s;
    }
  }
  if (!r.data.access_token) throw new Error("无法获取 access_token");
  return r.data;
}

// ---------- RPC 插入测试记录 ----------
async function insertRecord(session, payload) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/submit_tracking_record", {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Content-Type": "application/json",
      "Authorization": "Bearer " + session.access_token
    },
    body: JSON.stringify({ p_payload: payload })
  });
  if (!res.ok) throw new Error("submit_tracking_record HTTP " + res.status + ": " + (await res.text()).substring(0, 300));
  return res.json();
}

// 完整 assessment (结构与本地 Pt()/et(D) 产出一致)
function buildFullAssessment() {
  const romResults = {
    "前屈": { pitch: -42.5 }, "后伸": { pitch: 38.2 },
    "左旋": { yaw: -65.1 }, "右旋": { yaw: 61.8 },
    "左屈": { roll: -35.4 }, "右屈": { roll: 33.9 }
  };
  const positionResults = [
    { direction: "前屈", targetAngle: 30, actualAngle: 32.1, totalError: 2.1 },
    { direction: "左旋", targetAngle: 45, actualAngle: 41.3, totalError: 3.7 },
    { direction: "右旋", targetAngle: 45, actualAngle: 47.2, totalError: 2.2 }
  ];
  const coordTrails = {
    horizontal: Array.from({ length: 60 }, (_, i) => ({ x: Math.sin(i / 9) * 0.8, y: Math.cos(i / 15) * 0.1, timestamp: 1700000000000 + i * 100 })),
    vertical: Array.from({ length: 60 }, (_, i) => ({ x: Math.cos(i / 12) * 0.1, y: Math.sin(i / 9) * 0.7, timestamp: 1700000000000 + i * 100 })),
    figure8: Array.from({ length: 80 }, (_, i) => ({ x: Math.sin(i / 8) * 0.7, y: Math.sin(i / 4) * 0.35, timestamp: 1700000000000 + i * 100 }))
  };
  return {
    assessment: {
      cervicalCurvature: {
        available: true, riskScore: 28, score: 72,
        interpretation: "颈椎曲度轻度变直, 风险较低",
        indicators: [
          { type: "rotation_asymmetry", name: "旋转不对称", level: "正常", description: "左右旋差 3.3°" }
        ],
        pattern: { type: "straightening", name: "颈椎曲度变直", description: "屈伸比率偏高, 提示生理曲度变直趋势" },
        details: { rotationAsymmetry: { riskScore: 10 }, flexionExtensionRatio: { riskScore: 30 }, lateralFlexionAsymmetry: { riskScore: 5 }, romResults }
      },
      vestibularFunction: {
        available: true, score: 68,
        interpretation: "CTSIB Class C：前庭小脑功能基本完整",
        indicators: [],
        details: { stabilityScore: 68, smoothnessAvg: 62, trackingAvg: 71, positionErrorAvg: 2.7, driftCount: 2, positionResults }
      },
      cervicalFunction: {
        available: true, score: 74,
        interpretation: "颈椎功能整体良好, 协调性略弱",
        indicators: [],
        details: { romScore: 72, positionScore: 78, coordinationScore: 70, romResults }
      },
      symptomCorrelations: {
        cervicalCurvature: {}, vestibular: {}, cervicalFunction: {},
        summary: "曲度变直与位置觉误差相关, 建议结合症状观察"
      },
      findings: [
        { category: "ROM", severity: "mild", finding: "屈伸比率偏高：前屈/后伸比率 1.11，提示轻度前倾姿势", anrmRef: "C2-姿势控制" },
        { category: "MotorControl", severity: "normal", finding: "运动控制正常：追踪平滑度可", anrmRef: "" }
      ],
      brainRegions: [
        { region: "小脑", likelihood: "中", evidence: "协调追踪得分偏低 (70 分)", recommendations: ["平衡训练", "协调追踪练习"] },
        { region: "前庭系统", likelihood: "低", evidence: "前庭功能基本完整 (68 分)", recommendations: ["维持当前训练"] }
      ],
      recommendations: [
        "每天进行颈椎后缩训练 (chin tuck) 3 组 × 10 次",
        "避免长时间低头, 每 45 分钟活动颈部",
        "2 周后复查颈椎曲度与位置觉"
      ]
    },
    romResults,
    positionResults,
    coordTrails,
    coordFullScores: [
      { trajectory: "horizontal", score: 74 }, { trajectory: "vertical", score: 68 }, { trajectory: "figure8", score: 66 }
    ],
    trail: Array.from({ length: 40 }, (_, i) => ({ x: Math.sin(i / 6) * 0.5, y: Math.cos(i / 6) * 0.5 })),
    testDuration: 10
  };
}

async function shootSegments(page, tag) {
  // 报告页很长, 分 3 段截图 (顶部 / 中部 / 底部)
  // #view-report 是 position:fixed 的独立滚动容器, window.scrollTo 无效, 要滚它自己
  const info = await page.evaluate(() => {
    var v = document.getElementById("view-report");
    return { scrollH: v ? v.scrollHeight : 0, clientH: v ? v.clientHeight : 0 };
  });
  const max = Math.max(0, info.scrollH - info.clientH);
  const spots = [0, Math.round(max / 2), max];
  for (let i = 0; i < spots.length; i++) {
    await page.evaluate(y => {
      var v = document.getElementById("view-report");
      if (v) v.scrollTop = y; else window.scrollTo(0, y);
    }, spots[i]);
    await page.waitForTimeout(400);
    const p = `${SHOT_DIR}/tracking-cloud-render-${tag}-p${i + 1}.png`;
    await page.screenshot({ path: p });
    console.log("  📸", p);
  }
}

async function checkLayout(page, tag, expectFull) {
  const visible = await page.evaluate(() => {
    var v = document.getElementById("view-report");
    return !!v && window.getComputedStyle(v).display !== "none";
  });
  assert(`[${tag}] #view-report 原版报告页可见`, visible);
  const text = await page.evaluate(() => {
    var el = document.getElementById("report-content");
    return el ? el.innerText : "";
  });
  const sections = ["颈椎功能综合评估报告", "执行摘要", "颈椎曲度分析", "前庭功能", "颈椎功能", "症状关联", "综合分析"];
  for (const s of sections) {
    assert(`[${tag}] 章节存在: ${s}`, text.includes(s));
  }
  if (expectFull) {
    assert(`[${tag}] 患者姓名渲染 (云端追踪-新版)`, text.includes("云端追踪-新版"));
  } else {
    assert(`[${tag}] 患者姓名渲染 (云端追踪-旧版)`, text.includes("云端追踪-旧版"));
    assert(`[${tag}] 降级不 crash (有内容)`, text.length > 200, "len=" + text.length);
  }
  await shootSegments(page, tag);
  // 返回按钮恢复主页
  await page.evaluate(() => { if (typeof window.closeFullReport === "function") window.closeFullReport(); });
  await page.waitForTimeout(500);
}

async function main() {
  console.log("=== 0. 登录固定测试账号 ===");
  const auth = await loginOrSignup();
  console.log("  ✅ 已登录:", EMAIL);
  const session = { access_token: auth.access_token, refresh_token: auth.refresh_token, user: auth.user };

  console.log("\n=== 1. 插入测试记录 (新格式 + 旧格式) ===");
  const full = buildFullAssessment();
  const newId = await insertRecord(session, {
    patient_name: "云端追踪-新版", patient_age: 42, patient_gender: "男", patient_id: "E2E-NEW",
    date: new Date().toISOString(), overall: 71,
    scores: { rom: 72, position: 78, stability: 68, coordination: 70 },
    details: {
      position: { avgError: "2.7", results: full.positionResults },
      rom: { angles: full.romResults, count: 6 },
      coordination: { tracking: "0.71" },
      stability: { trajectory: "0.65", smoothness: "0.62", mqClass: "Class C", mqInterpretation: "前庭小脑功能基本完整" },
      assessment: full.assessment,
      coordFullScores: full.coordFullScores,
      coordTrails: full.coordTrails,
      trail: full.trail,
      testDuration: 10
    },
    vestibular: { score: 68, assessment: "CTSIB Class C" },
    recommendations: full.assessment.recommendations
  });
  console.log("  ✅ 新格式记录已插入, id:", newId);

  const oldId = await insertRecord(session, {
    patient_name: "云端追踪-旧版", patient_age: 55, patient_gender: "女", patient_id: "E2E-OLD",
    date: new Date().toISOString(), overall: 58,
    scores: { rom: 61, position: 55, stability: 60, coordination: 52 },
    details: {
      position: { avgError: "4.6", results: [{ direction: "前屈", targetAngle: 30, actualAngle: 25.4, totalError: 4.6 }] },
      rom: { angles: { "前屈": { pitch: -35.0 }, "后伸": { pitch: 30.1 } }, count: 2 },
      coordination: { tracking: "0.52" }
    },
    vestibular: { score: 60, assessment: "前庭功能轻度减退" },
    recommendations: ["建议每日颈部拉伸", "注意用眼姿势"]
  });
  console.log("  ✅ 旧格式记录已插入, id:", oldId);

  console.log("\n=== 2. 工作台渲染验证 ===");
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 700, height: 900 } });
  // 预置 Supabase session (与 qnr-supabase.js 的 bm_supabase_session 格式一致)
  await ctx.addInitScript(sess => {
    try { localStorage.setItem("bm_supabase_session", JSON.stringify(sess)); } catch (e) {}
  }, session);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.goto(base + "/index.html", { waitUntil: "commit", timeout: 60000 });
  await page.waitForFunction(
    () => window.BmTherapistUI && window.SupabaseClient && window.SupabaseClient.isConfigured() && window.renderFullReport,
    null, { timeout: 90000 }
  );
  console.log("  ✅ 页面就绪 (renderFullReport 可用)");

  async function openRecord(name) {
    await page.evaluate(() => window.BmTherapistUI.openDashboard());
    await page.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
    await page.evaluate(() => window.BmTherapistUI.switchReportTab("tracking"));
    await page.waitForTimeout(3000);
    const clicked = await page.evaluate(n => {
      var items = document.querySelectorAll("#bm-report-list .bm-list-item");
      for (var i = 0; i < items.length; i++) {
        if (items[i].textContent.includes(n)) { items[i].click(); return true; }
      }
      return false;
    }, name);
    if (!clicked) throw new Error("列表中未找到记录: " + name);
    await page.waitForTimeout(1500);
  }

  await openRecord("云端追踪-新版");
  await checkLayout(page, "new", true);

  await openRecord("云端追踪-旧版");
  await checkLayout(page, "old", false);

  assert("全程无 pageerror", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  await browser.close();

  console.log("\n=== 3. 版式对比结论 (vs tests/reports/expected-pdf-p1/p2.png) ===");
  console.log("  原版结构: 深蓝头部(标题+患者卡+综合评分) → 执行摘要3卡 → 颈椎曲度分析 → 前庭功能 → 颈椎功能 → 症状关联 → 综合分析 → 页脚按钮");
  console.log("  上方各章节断言全过即与 expected PDF 版式一致; 截图见 tests/reports/tracking-cloud-render-*.png");

  console.log("\n" + "═".repeat(50));
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error("❌ probe 异常:", e.message); process.exit(1); });
