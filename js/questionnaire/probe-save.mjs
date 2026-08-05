import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 200)));
page.on("console", m => console.log(`[console.${m.type()}]`, m.text().slice(0, 200)));
page.on("dialog", d => { console.log("[dialog]", d.message().slice(0, 100)); d.accept(); });

// 沙箱 URL (模拟扫码)
await page.goto("http://localhost:8765/questionnaire.html?sandbox=1&name=%E5%BC%A0%E4%B8%89&age=35&gender=%E7%94%B7&t=1785836000000&tid=default", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

// 检查沙箱激活
const badge = await page.textContent(".badge").catch(() => "");
console.log("badge:", badge.trim());

await page.click("#intro-start");
await page.waitForSelector("#screen-quiz:not([style*='none']) .q-option");

// 答 100 题
for (let q = 1; q <= 100; q++) {
  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1;
  await page.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await page.waitForTimeout(350);
}
await page.click("#quiz-next");
await page.waitForSelector("#screen-result:not([style*='none']) .result-group");

const saveBtn = page.locator("#result-save-report");
console.log("saveBtn visible:", await saveBtn.isVisible());
if (await saveBtn.isVisible()) {
  await saveBtn.click();
  await page.waitForTimeout(3000);
  console.log("当前 URL:", page.url().slice(0, 120));
  const btnText = await saveBtn.textContent().catch(() => "gone");
  console.log("saveBtn 文字:", btnText);
  const onQuiz = await page.url().includes("questionnaire.html");
  console.log("仍在问卷页:", onQuiz);
}
await browser.close();
