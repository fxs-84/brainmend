// js/questionnaire/probe-cog-mobile2.mjs
// 真正激活模块出题, 截屏看手机布局
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";
mkdirSync("js/questionnaire/probe-cog-mobile2", { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const tCtx = await browser.newContext();
const tp = await tCtx.newPage();
await tp.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
await tp.waitForFunction(() => window.SupabaseClient && window.BmTherapistUI, null, { timeout: 30000 });
await tp.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
await tp.evaluate(() => window.BmTherapistUI.openDashboard());
await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
await tp.fill("#bm-link-name", "mobile2");
await tp.fill("#bm-link-age", "40");
await tp.selectOption("#bm-link-gender", "女");
await tp.selectOption("#bm-link-kind", "cognitive");
await tp.click("text=+ 创建链接");
await tp.waitForTimeout(3000);
const shareToken = await tp.evaluate(() => {
  const txt = document.getElementById("bm-link-result")?.textContent || "";
  const m = txt.match(/share_token=([a-f0-9]{32})/);
  return m ? m[1] : null;
});
await tCtx.close();
console.log("share_token:", shareToken?.substring(0, 16));

async function runModuleOn(viewport, viewName, mod) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto(`${base}/index.html?mode=cognitive&start=quick6&share_token=${shareToken}&name=mobile2&age=40&gender=女&t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(3000);
  // 等模块加载 (用 cog-mod-btn 点击触发模块激活)
  await p.waitForFunction((m) => window['__' + m], mod, { timeout: 30000 });
  // 激活模块: 点 cog-toolbar 里对应按钮
  await p.evaluate((m) => {
    const btn = document.querySelector(`.cog-mod-btn[data-mod="${m}"]`);
    if (btn) btn.click();
  }, mod);
  await p.waitForTimeout(1000);
  // 强制让模块进入 game 状态 (跳过 tutorial) — 调用模块内部 API
  await p.evaluate((m) => {
    const obj = window['__' + m];
    if (!obj) return;
    // 跳过 tutorial, 进入游戏
    if (obj.phase !== undefined) {
      obj.phase = 'game';
      obj.tutCorrect = 3;
      obj.score = 0;
      obj.trials = 0;
      obj.answerGiven = false;
      obj.grid = [];
      obj.oddIdx = 0;
    }
  }, mod);
  await p.waitForTimeout(1500);
  // 找"开始"按钮 (每个模块都有) 并点击
  const clicked = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const startBtn = btns.find(b => {
      const t = (b.textContent || "").trim();
      return /^(开始|▶|开始测试|开始评估|开始试玩|开始教程)/.test(t) && b.offsetParent;
    });
    if (startBtn) { startBtn.click(); return true; }
    return false;
  });
  console.log(`  [${viewName}] ${mod}: 点击开始=${clicked}`);
  await p.waitForTimeout(2500);
  // 截图当前题目
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile2/${viewName}-${mod}.png`, fullPage: false });
  // 探测关键 DOM 尺寸
  const sizes = await p.evaluate(() => {
    const sizes = {};
    const canvas = document.querySelector('#cognitive-canvas');
    if (canvas) sizes.canvas = { w: canvas.width, h: canvas.height, dispW: canvas.offsetWidth, dispH: canvas.offsetHeight };
    const view = document.getElementById('view-cognitive');
    if (view) sizes.view = { w: view.offsetWidth, h: view.offsetHeight };
    const tb = document.getElementById('cog-toolbar');
    if (tb) sizes.toolbar = { w: tb.offsetWidth, h: tb.offsetHeight };
    // 找 panel 容器
    const panel = document.querySelector('[id^="cog-panel-"]');
    if (panel) sizes.panel = { w: panel.offsetWidth, h: panel.offsetHeight, overflow: getComputedStyle(panel).overflow };
    // 找模块主容器 (canvas 之外)
    const main = document.querySelector('#main-area, #cognitive-main, #cog-game-container');
    return sizes;
  });
  console.log(`  ${viewName} ${mod} 尺寸:`, JSON.stringify(sizes));
  await ctx.close();
}

const viewports = [
  { name: "iphone-portrait", width: 375, height: 812 },
  { name: "iphone-landscape", width: 812, height: 375 }
];

const modules = ['reasoning', 'scenerecall', 'shortmem'];

for (const vp of viewports) {
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
  for (const mod of modules) {
    try {
      await runModuleOn({ width: vp.width, height: vp.height }, vp.name, mod);
    } catch (e) {
      console.log(`  [${vp.name}] ${mod} 失败:`, e.message);
    }
  }
}

await browser.close();
console.log("\n✓ 完成");