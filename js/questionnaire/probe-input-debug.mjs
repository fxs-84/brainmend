// js/questionnaire/probe-input-debug.mjs
// 调试: 提交前 input 值是什么 + RPC 请求 body 是什么
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";

await page.goto("https://fxs-84.github.io/brainmend/index.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
await page.evaluate(async ({email, pw}) => await window.SupabaseClient.signIn(email, pw), {email: TEST_EMAIL, pw: TEST_PASSWORD});
const sl = await page.evaluate(async () => await window.SupabaseClient.createShareLink({name:null, age:null, gender:null, expiresDays: 7}));
console.log("share_token:", sl.token);

const p2 = await (await browser.newContext()).newPage();
p2.on("console", m => console.log("  [P-console]", m.text()));
p2.on("request", async r => {
  if (r.url().includes("submit_qnr_self_assessment")) {
    console.log("\n  ⭐ RPC POST body:", r.postData());
  }
});

await p2.goto("https://fxs-84.github.io/brainmend/questionnaire.html?sandbox=1&share_token=" + sl.token, { waitUntil: "domcontentloaded" });
await p2.waitForTimeout(2000);
await p2.click("#intro-start");
await p2.waitForSelector("#screen-quiz:not([style*='none']) .q-option", { timeout: 10000 });
for (let q = 1; q <= 100; q++) {
  await p2.click(`.q-option >> nth=${q===46?2:q<=45?2:1}`);
  if (q < 100) await p2.waitForTimeout(280);
}
await p2.click("#quiz-next");
await p2.waitForSelector("#qnr-reg-overlay", { state: "visible", timeout: 5000 });
await p2.waitForTimeout(500);

await p2.fill("#qnr-reg-name", "赵女士");
await p2.fill("#qnr-reg-age", "38");
await p2.selectOption("#qnr-reg-gender", "女");
const v = await p2.evaluate(() => ({
  name: document.getElementById("qnr-reg-name").value,
  age: document.getElementById("qnr-reg-age").value,
  gender: document.getElementById("qnr-reg-gender").value
}));
console.log("\n提交前的 input 值:", JSON.stringify(v));
await p2.click("#qnr-reg-submit");
await p2.waitForTimeout(5000);
await browser.close();