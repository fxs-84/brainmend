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

console.log("\n🎉 云端保存链路 probe 全部通过");
await browser.close();
