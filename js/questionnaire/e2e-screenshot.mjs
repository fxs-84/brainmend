/**
 * 问卷模块端到端自测 + 截图(playwright)
 *
 * 用法: 先起静态服务器(如 npx http-server -p 8765),再跑
 *   node js/questionnaire/e2e-screenshot.mjs [baseURL]
 *
 * 流程: 开场页截图 → 开始 → 逐题作答(中途回退一题验证可修改)
 *       → 第 46 题三选一 → 查看结果 → 结果页截图 + 结构断言
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] || "http://localhost:8765";
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const shotDir = path.join(root, "screenshots");
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" }); // 用本机 Chrome,免去 chromium 下载
const page = await browser.newPage({ viewport: { width: 414, height: 896 } }); // 手机尺寸
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.goto(`${base}/questionnaire.html`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(shotDir, "questionnaire-intro.png"), fullPage: true });
console.log("✅ 开场页截图: screenshots/questionnaire-intro.png");

// 开始测评
await page.click("#intro-start");
await page.waitForSelector("#screen-quiz:not([style*='none']) .q-option");

// 逐题作答:前 45 题点第 3 档(2 分);第 46 题点"无明显偏好";47-100 点第 2 档(1 分)
for (let q = 1; q <= 100; q++) {
  const num = await page.textContent("#quiz-q-number");
  if (!num.includes(`第 ${q} / 100 题`)) throw new Error(`题号错位: 期望第 ${q} 题,实际 "${num}"`);

  if (q === 10) {
    // 验证回退修改:回到第 9 题改答 0 分,再回到第 10 题
    await page.click("#quiz-prev");
    await page.click(".q-option >> nth=0");
    await page.waitForTimeout(400); // 等自动前进回第 10 题
  }

  const optIndex = q === 46 ? 2 : q <= 45 ? 2 : 1; // nth: 0-based → 2 分 / 1 分 / 无偏好
  await page.click(`.q-option >> nth=${optIndex}`);
  if (q < 100) await page.waitForTimeout(380); // 等自动前进
}

// 第 100 题答完 → 查看结果
await page.click("#quiz-next");
await page.waitForSelector("#screen-result:not([style*='none']) .result-group");

// 结构断言
const summary = await page.textContent("#result-summary");
if (!summary.includes("你的高负担区")) throw new Error(`结果页缺少高负担区总结: ${summary}`);
const groupCount = await page.locator(".result-group").count();
if (groupCount !== 4) throw new Error(`结果页应有 4 组,实际 ${groupCount}`);
const regionCount = await page.locator(".result-region").count();
if (regionCount !== 16) throw new Error(`结果页应有 16 分区,实际 ${regionCount}`);
const footer = await page.textContent(".result-sticky-footer");
if (!footer.includes("请截图本页发给老付")) throw new Error("结果页缺少截图提示");
if (!footer.includes("不等同于医学诊断")) throw new Error("结果页缺少免责声明");
console.log(`✅ 结果页断言通过: 4 组 / 16 分区 / 高负担区总结 / 底部固定文案`);
console.log(`   顶部总结: ${summary.trim().split("\n")[0]}`);

await page.screenshot({ path: path.join(shotDir, "questionnaire-result.png"), fullPage: true });
console.log("✅ 结果页截图: screenshots/questionnaire-result.png");

if (errors.length) throw new Error(`问卷页 JS 报错:\n${errors.join("\n")}`);
console.log("✅ 问卷页无 JS 报错");

// 首页入口断言(首页 bundle 可能打出与问卷无关的 console 信息,不纳入断言)
errors.length = 0;
await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
const entry = await page.locator("#page2-questionnaire").count();
if (entry !== 1) throw new Error("首页缺少问卷入口按钮 #page2-questionnaire");
console.log("✅ 首页入口按钮存在(#page2-questionnaire → ./questionnaire.html)");
await browser.close();
console.log("\n🎉 端到端自测全部通过");
