/**
 * 云端保存链路回归 probe (修复: token/tid 在问卷页丢失导致自评结果不上传云端)
 *
 * 验证点:
 *  1. 扫码 URL (?sandbox=1&token=xxx&tid=xxx) 打开问卷页后,
 *     localStorage 写入 cog_gh_token / cog_therapist_id
 *  2. 完成 100 题 → 保存 → 跳回 index.html 时 URL 透传 token / tid
 *  3. index.html 端 localStorage 仍有 token / tid
 *  4. _uploadToCloud 实际向 api.github.com 发起 PUT (路径含 tid 目录, 带 Authorization)
 *     (网络层 stub, 不发真实请求)
 *  5. cog_records 写入 type=questionnaire 记录
 *
 * 用法: 先起静态服务器 (如 npx serve -l 8765 或 vite), 再 node js/questionnaire/probe-cloud-save.mjs
 */

import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const FAKE_TOKEN = "ghp_probe_fake_token_123";
const TID = "th_probe_cloud";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();

// stub GitHub API, 记录请求
const ghRequests = [];
await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  ghRequests.push({ method: req.method(), url: req.url(), auth: req.headers()["authorization"] || "" });
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ content: { sha: "fake_sha_probe" } }),
  });
});

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));

function assert(cond, msg) {
  if (!cond) throw new Error("断言失败: " + msg);
  console.log("✅ " + msg);
}

// ---------- 1. 扫码进入问卷页 → token/tid 落 localStorage ----------
await page.goto(
  `${base}/questionnaire.html?sandbox=1&name=%E5%BC%A0%E4%B8%89&age=35&gender=%E7%94%B7&t=${Date.now()}&tid=${TID}&token=${FAKE_TOKEN}`,
  { waitUntil: "domcontentloaded" }
);
await page.waitForTimeout(600);

const savedToken = await page.evaluate(() => localStorage.getItem("cog_gh_token"));
const savedTid = await page.evaluate(() => localStorage.getItem("cog_therapist_id"));
assert(savedToken === FAKE_TOKEN, `问卷页捕获 token → cog_gh_token (${savedToken ? "已写入" : "为空"})`);
assert(savedTid === TID, `问卷页捕获 tid → cog_therapist_id (${savedTid})`);

// ---------- 2. 作答 100 题 ----------
await page.click("#intro-start");
await page.waitForSelector("#screen-quiz:not([style*='none']) .q-option");
for (let q = 1; q <= 100; q++) {
  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
  await page.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await page.waitForTimeout(380);
}
await page.click("#quiz-next");
await page.waitForSelector("#screen-result:not([style*='none']) .result-group");
console.log("✅ 100 题作答完成");

// ---------- 3. 保存 → 登记表单 → 跳回 index.html ----------
await page.click("#result-save-report");
await page.waitForSelector("#qnr-reg-overlay", { timeout: 8000 });
await page.fill("#qnr-reg-name", "云端验证");
await page.click("#qnr-reg-submit");
await page.waitForURL(/index\.html/, { timeout: 20000 });
await page.waitForTimeout(2500);

const landedUrl = page.url();
assert(landedUrl.includes("index.html"), "跳回 index.html");

// ---------- 4. index.html 端 token/tid 仍在 ----------
const token2 = await page.evaluate(() => localStorage.getItem("cog_gh_token"));
const tid2 = await page.evaluate(() => localStorage.getItem("cog_therapist_id"));
assert(token2 === FAKE_TOKEN, "index.html 端 cog_gh_token 保持");
assert(tid2 === TID, "index.html 端 cog_therapist_id 保持");

// ---------- 5. 记录入库 + 云端 PUT 已发起 ----------
const rec = await page.evaluate(() => {
  const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
  return arr.filter((r) => r && r.type === "questionnaire").pop() || null;
});
assert(rec && rec.patientInfo.name === "云端验证", `cog_records 写入自评记录 (${rec && rec.patientInfo.name})`);

const put = ghRequests.find((r) => r.method === "PUT");
assert(!!put, "向 GitHub API 发起 PUT 上传");
assert(put.url.includes(`/data/reports/${TID}/`), `云端路径含治疗师目录 ${TID}: ${put.url}`);
assert(put.auth === "token " + FAKE_TOKEN, "PUT 携带 Authorization token");
assert(rec._cloudId === "fake_sha_probe", "本地记录回填 _cloudId (云端同步确认)");

console.log("\n🎉 云端保存链路 probe (成功路径) 全部通过");
await ctx.close();

// ==================== 场景 2: PUT 失败 (403) → _cloudErr 落盘 + 报告页重试按钮 ====================
const ctx2 = await browser.newContext();
const putUrls = [];
await ctx2.route("https://api.github.com/**", async (route) => {
  if (route.request().method() === "PUT") putUrls.push(route.request().url());
  await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Forbidden" }) });
});
const p2 = await ctx2.newPage();
const dialogs = [];
p2.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });

// 预置: 有 token/tid + 一条未同步的自评记录
await p2.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
await p2.waitForTimeout(1500);
await p2.evaluate(([tk, tid]) => {
  localStorage.setItem("cog_gh_token", tk);
  localStorage.setItem("cog_therapist_id", tid);
  localStorage.setItem("cog_records", JSON.stringify([{
    id: "qnr_probe_fail", date: "2026/8/5", time: "15:00",
    patientInfo: { name: "失败验证", age: "30", gender: "男", id: "" },
    type: "questionnaire", overallScore: 40,
    qnr: { percent: 40, worstSeverity: "mild", burdenGroups: [], byRegion: {}, severityByRegion: {}, groupDefs: [], regionDefs: [], items: {} }
  }]));
}, [FAKE_TOKEN, TID]);
await p2.reload({ waitUntil: "domcontentloaded" });
await p2.waitForTimeout(1500);

// 打开该记录报告 → 应出现"重试上传云端"按钮
await p2.evaluate(() => window._viewCogReport(0));
await p2.waitForTimeout(500);
const retryBtn = p2.locator("button", { hasText: "重试上传云端" });
assert(await retryBtn.count() === 1, "未同步记录报告页显示「☁️ 重试上传云端」按钮");

// 点击重试 → 403 → 弹失败原因 + _cloudErr 落盘
await retryBtn.click();
await p2.waitForTimeout(1500);
const failErr = await p2.evaluate(() => (JSON.parse(localStorage.getItem("cog_records") || "[]")[0] || {})._cloudErr);
assert(failErr && failErr.indexOf("HTTP 403") === 0, `重试失败后 _cloudErr 落盘 (${failErr})`);
assert(dialogs.some((m) => m.includes("HTTP 403") || m.includes("权限")), `失败弹窗包含可读原因: ${dialogs[0] || "(无)"}`);
assert(putUrls.length > 0 && putUrls.every((u) => !u.includes("%2F")), `旧斜杠日期记录重试时文件名已替换为 '-' (${putUrls[0] || "无 PUT"})`);

console.log("\n🎉 云端失败路径 probe (403 + 重试) 全部通过");
await ctx2.close();

// ==================== 场景 3: 云端 tab — token 管理栏可见 + 401 错误提示 ====================
const ctx3 = await browser.newContext();
await ctx3.route("https://api.github.com/**", async (route) => {
  await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Bad credentials" }) });
});
const p3 = await ctx3.newPage();
await p3.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
await p3.waitForTimeout(1500);
await p3.evaluate(([tk, tid]) => {
  localStorage.setItem("cog_gh_token", tk);
  localStorage.setItem("cog_therapist_id", tid);
}, [FAKE_TOKEN, TID]);
await p3.reload({ waitUntil: "domcontentloaded" });
await p3.waitForTimeout(1500);

await p3.locator("#page2-cog-report").click();
await p3.waitForTimeout(600);
await p3.locator("button", { hasText: "云端记录" }).click();
await p3.waitForTimeout(1500);

const panelText = await p3.locator("#cog-record-list-overlay").textContent();
assert(panelText.includes("Token:") && panelText.includes("****"), "已存 token 时显示脱敏 Token 管理栏");
assert(panelText.includes("HTTP 401"), `401 时云端列表显示具体错误 (实际: ${panelText.slice(0, 120)}...)`);

// 点「修改」→ token 输入框出现
await p3.locator("#cog-gh-token-edit").click();
await p3.waitForTimeout(300);
const tokenInputVisible = await p3.locator("#cog-gh-token-input").isVisible();
assert(tokenInputVisible, "点「修改」后 token 输入框出现");

console.log("\n🎉 token 管理栏 + 云端错误提示 probe 全部通过");
await ctx3.close();

// ==================== 场景 4: 重试幂等 — 文件已存在 (422 sha) → 自动取 sha 覆盖更新 ====================
const ctx4 = await browser.newContext();
let putCount = 0;
await ctx4.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const url = req.url();
  const bodyText = req.postData() || "";
  const json = (status, obj) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(obj) });
  if (req.method() === "PUT" && bodyText.includes('"sha"')) return json(201, { content: { sha: "updated_sha" } });
  if (req.method() === "PUT") { putCount++; return json(422, { message: 'Invalid request. "sha" wasn\'t supplied.' }); }
  if (req.method() === "GET" && url.includes("qnr_probe_422")) return json(200, { sha: "existing_sha" });
  return json(404, { message: "Not Found" });
});
const p4 = await ctx4.newPage();
const dialogs4 = [];
p4.on("dialog", async (d) => { dialogs4.push(d.message()); await d.accept(); });
await p4.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
await p4.waitForTimeout(1500);
await p4.evaluate(([tk, tid]) => {
  localStorage.setItem("cog_gh_token", tk);
  localStorage.setItem("cog_therapist_id", tid);
  localStorage.setItem("cog_records", JSON.stringify([{
    id: "qnr_probe_422", date: "2026/8/5", time: "17:42",
    patientInfo: { name: "幂等验证", age: "42", gender: "男", id: "" },
    type: "questionnaire", overallScore: 7.3,
    qnr: { percent: 7.3, worstSeverity: "normal", burdenGroups: [], byRegion: {}, severityByRegion: {}, groupDefs: [], regionDefs: [], items: {} }
  }]));
}, [FAKE_TOKEN, TID]);
await p4.reload({ waitUntil: "domcontentloaded" });
await p4.waitForTimeout(1500);
await p4.evaluate(() => window._viewCogReport(0));
await p4.waitForTimeout(500);
await p4.locator("button", { hasText: "重试上传云端" }).click();
await p4.waitForTimeout(2000);
const rec4 = await p4.evaluate(() => JSON.parse(localStorage.getItem("cog_records") || "[]")[0] || {});
assert(putCount === 1, `首次 PUT 返回 422 (${putCount} 次)`);
assert(rec4._cloudId === "updated_sha", `422 后自动取 sha 覆盖更新成功 (_cloudId=${rec4._cloudId})`);
assert(!rec4._cloudErr, "幂等成功后 _cloudErr 已清除");
assert(dialogs4.some((m) => m.includes("已同步")), `弹窗提示已同步: ${dialogs4[0] || "(无)"}`);
const line4 = await p4.locator("#qnr-cloud-status").textContent();
assert(line4.includes("已同步云端"), "报告页状态行实时刷新为「已同步云端」");
console.log("\n🎉 重试幂等 (422 sha → 覆盖更新) probe 全部通过");
await ctx4.close();

// ==================== 场景 5: 云端列表递归嵌套目录 (早期斜杠日期 default/2026/8/) ====================
const ctx5 = await browser.newContext();
const GH_BASE = "https://api.github.com/repos/fxs-84/brainmend/contents/data/reports";
const mkRec = (name) => Buffer.from(JSON.stringify({
  id: "qnr_" + name, date: "2026-08-05", time: "17:00",
  patientInfo: { name, age: "40", gender: "男", id: "" },
  type: "questionnaire", overallScore: 10, createdAt: "2026-08-05T09:00:00Z",
  qnr: { percent: 10, worstSeverity: "normal", burdenGroups: [], byRegion: {}, severityByRegion: {}, groupDefs: [], regionDefs: [], items: {} }
})).toString("base64");
await ctx5.route("https://api.github.com/**", async (route) => {
  const url = route.request().url();
  const json = (obj) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(obj) });
  if (url.endsWith("/data/reports/" + TID)) return json([
    { type: "file", name: "2026-08-05_qnr_flat.json", url: GH_BASE + "/" + TID + "/flat", sha: "sha_flat" },
    { type: "dir", name: "2026", url: GH_BASE + "/" + TID + "/2026" },
  ]);
  if (url.endsWith(TID + "/2026")) return json([{ type: "dir", name: "8", url: GH_BASE + "/" + TID + "/2026/8" }]);
  if (url.endsWith(TID + "/2026/8")) return json([{ type: "file", name: "5_qnr_nested.json", url: GH_BASE + "/" + TID + "/nested", sha: "sha_nested" }]);
  if (url.endsWith("/flat")) return json({ content: mkRec("平铺患者"), sha: "sha_flat" });
  if (url.endsWith("/nested")) return json({ content: mkRec("嵌套患者"), sha: "sha_nested" });
  return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
});
const p5 = await ctx5.newPage();
await p5.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
await p5.waitForTimeout(1500);
await p5.evaluate(([tk, tid]) => {
  localStorage.setItem("cog_gh_token", tk);
  localStorage.setItem("cog_therapist_id", tid);
}, [FAKE_TOKEN, TID]);
await p5.reload({ waitUntil: "domcontentloaded" });
await p5.waitForTimeout(1500);
await p5.locator("#page2-cog-report").click();
await p5.waitForTimeout(600);
await p5.locator("button", { hasText: "云端记录" }).click();
await p5.waitForTimeout(2000);
const cloudListText = await p5.locator("#cog-record-list-overlay").textContent();
assert(cloudListText.includes("平铺患者"), "云端列表显示平铺文件记录");
assert(cloudListText.includes("嵌套患者"), "云端列表递归显示嵌套目录 (2026/8/) 里的记录");
console.log("\n🎉 云端列表递归嵌套目录 probe 全部通过");
await browser.close();
