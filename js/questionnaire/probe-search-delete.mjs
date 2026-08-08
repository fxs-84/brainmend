// js/questionnaire/probe-search-delete.mjs
// 验证 5 类数据: 搜索 + 硬删 (自评/认知/步态/头动追踪/share_link)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const cfg = readFileSync(resolvePath(__dirname, "../../assets/config/supabase-config.js"), "utf8");
const SUPABASE_URL = cfg.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const SUPABASE_KEY = cfg.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
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
  await page.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
  await page.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });

  // 注入测试数据 (5 条不同类型, 带可搜索关键词)
  console.log("\n=== A. 注入测试数据 ===");
  const tag = "searchDelTest" + Date.now();
  // 自评
  const qnrShare = await page.evaluate(async (t) => await window.SupabaseClient.createShareLink({
    name: "搜索测试-自评-" + t, age: 40, gender: "男", expiresDays: 7
  }), tag);
  const qnrId = await page.evaluate(async ({ token, t }) => await window.SupabaseClient.submitQnrAssessment({
    token, name: "搜索测试-自评-" + t, age: 40, gender: "男",
    responses: {}, byRegion: {}, severityByRegion: {}, affectedRegions: [],
    totalScore: 100, percent: 50, worstSeverity: 'normal', burdenGroups: []
  }), { token: qnrShare.token, t: tag });
  console.log("  自评:", qnrId);
  // 认知
  const cogShare = await page.evaluate(async (t) => await window.SupabaseClient.createShareLink({
    name: "搜索测试-认知-" + t, age: 50, gender: "女", expiresDays: 7, kind: "cognitive"
  }), tag);
  const cogId = await page.evaluate(async ({ token, t }) => await window.SupabaseClient.submitCognitiveAssessment({
    shareToken: token,
    patientInfo: { name: "搜索测试-认知-" + t, age: 50, gender: "女" },
    payload: { type: "cognitive", isQuick6: true, moduleScores: {} },
    overallScore: 80,
    isQuick6: true
  }), { token: cogShare.token, t: tag });
  console.log("  认知:", cogId);
  // 步态
  const gaitShare = await page.evaluate(async (t) => await window.SupabaseClient.createShareLink({
    name: "搜索测试-步态-" + t, age: 60, gender: "男", expiresDays: 7, kind: "gait"
  }), tag);
  const gaitId = await page.evaluate(async ({ token, t }) => await window.SupabaseClient.submitGaitAssessment({
    shareToken: token,
    patientInfo: { name: "搜索测试-步态-" + t, age: 60, gender: "男" },
    payload: { type: "gait" },
    classificationPrimary: "正常"
  }), { token: gaitShare.token, t: tag });
  console.log("  步态:", gaitId);
  // 头动追踪
  const trkId = await page.evaluate(async (t) => await window.SupabaseClient.submitTrackingRecord({
    patient_name: "搜索测试-追踪-" + t, patient_age: 55, patient_gender: "女",
    overall: 75, scores: {}, recommendations: []
  }), tag);
  console.log("  头动追踪:", trkId);

  // ============ B. 搜索: 4 类报告 + 1 share_link ============
  console.log("\n=== B. 搜索验证 ===");
  // 自评搜索
  const qnrSearch = await page.evaluate(async ({ q }) => await window.SupabaseClient.searchMyAssessments(q, { limit: 10 }), { q: tag });
  console.log("  自评搜索 " + tag + ": count=" + qnrSearch.length);
  assert("自评搜索匹配", qnrSearch.length >= 1 && qnrSearch[0].patient_name.includes(tag), "");
  // 认知搜索
  const cogSearch = await page.evaluate(async ({ q }) => await window.SupabaseClient.searchMyCognitiveAssessments(q, { limit: 10 }), { q: tag });
  assert("认知搜索匹配", cogSearch.length >= 1 && cogSearch[0].patient_name.includes(tag), "");
  // 步态搜索
  const gaitSearch = await page.evaluate(async ({ q }) => await window.SupabaseClient.searchMyGaitAssessments(q, { limit: 10 }), { q: tag });
  assert("步态搜索匹配", gaitSearch.length >= 1 && gaitSearch[0].patient_name.includes(tag), "");
  // 头动追踪搜索
  const trkSearch = await page.evaluate(async ({ q }) => await window.SupabaseClient.searchMyTrackingRecords(q, { limit: 10 }), { q: tag });
  assert("头动追踪搜索匹配", trkSearch.length >= 1 && trkSearch[0].patient_name.includes(tag), "");
  // share_link 搜索
  const linkSearch = await page.evaluate(async ({ q }) => await window.SupabaseClient.searchShareLinks(q), { q: tag });
  assert("share_link 搜索匹配 (≥3 条)", linkSearch.length >= 3, "count=" + linkSearch.length);

  // ============ C. 删除: 验证 DB 真少行 ============
  console.log("\n=== C. 删除验证 ===");
  // 自评删除
  await page.evaluate(async ({ id }) => await window.SupabaseClient.deleteQnrAssessment(id), { id: qnrId });
  const sess = await page.evaluate(() => window.SupabaseClient.getSession());
  const checkQnr = await fetch(SUPABASE_URL + "/rest/v1/qnr_self_assessments?id=eq." + qnrId + "&select=id", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token }
  }).then(r => r.json());
  assert("自评 DB 已删", checkQnr.length === 0, "rows=" + checkQnr.length);
  // 认知删除
  await page.evaluate(async ({ id }) => await window.SupabaseClient.deleteCognitiveAssessment(id), { id: cogId });
  const checkCog = await fetch(SUPABASE_URL + "/rest/v1/cognitive_assessments?id=eq." + cogId + "&select=id", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token }
  }).then(r => r.json());
  assert("认知 DB 已删", checkCog.length === 0, "rows=" + checkCog.length);
  // 步态删除
  await page.evaluate(async ({ id }) => await window.SupabaseClient.deleteGaitAssessment(id), { id: gaitId });
  const checkGait = await fetch(SUPABASE_URL + "/rest/v1/gait_assessments?id=eq." + gaitId + "&select=id", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token }
  }).then(r => r.json());
  assert("步态 DB 已删", checkGait.length === 0, "rows=" + checkGait.length);
  // 头动追踪删除
  await page.evaluate(async ({ id }) => await window.SupabaseClient.deleteTrackingRecord(id), { id: trkId });
  const checkTrk = await fetch(SUPABASE_URL + "/rest/v1/cervical_tracking_records?id=eq." + trkId + "&select=id", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token }
  }).then(r => r.json());
  assert("头动追踪 DB 已删", checkTrk.length === 0, "rows=" + checkTrk.length);
  // share_link 删除
  for (const link of [qnrShare, cogShare, gaitShare]) {
    await page.evaluate(async ({ token }) => await window.SupabaseClient.deleteShareLink(token), { token: link.token });
  }
  const checkLinks = await fetch(SUPABASE_URL + "/rest/v1/qnr_share_links?prefilled_name=ilike.*" + encodeURIComponent(tag) + "*&select=token", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token }
  }).then(r => r.json());
  assert("share_link DB 全删", checkLinks.length === 0, "剩余=" + checkLinks.length);
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