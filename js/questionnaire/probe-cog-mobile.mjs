// js/questionnaire/probe-cog-mobile.mjs
// 探查认知模块在手机/小屏不同方向的显示问题
// 跑 6 个 quick6 模块, 每个模块强制激活, 截屏当前题目
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";

const browser = await chromium.launch({ channel: "chrome" });
mkdirSync("js/questionnaire/probe-cog-mobile", { recursive: true });

// 1. 治疗师创建认知 share_link
const tCtx = await browser.newContext();
const tp = await tCtx.newPage();
await tp.goto(base + "/index.html?v=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
await tp.waitForFunction(() => window.SupabaseClient && window.BmTherapistUI, null, { timeout: 30000 });
await tp.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
await tp.evaluate(() => window.BmTherapistUI.openDashboard());
await tp.waitForSelector("#bm-dashboard-modal", { state: "visible", timeout: 5000 });
await tp.fill("#bm-link-name", "mobile探查");
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
console.log("share_token:", shareToken?.substring(0, 16));
await tCtx.close();

// 2. 用手机尺寸访问
const configs = [
  { name: "iphone-portrait", width: 375, height: 812 },
  { name: "iphone-landscape", width: 812, height: 375 },
  { name: "android-portrait", width: 360, height: 800 },
  { name: "tablet-portrait", width: 768, height: 1024 }
];

for (const cfg of configs) {
  console.log(`\n========== ${cfg.name} (${cfg.width}x${cfg.height}) ==========`);
  const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height } });
  const p = await ctx.newPage();
  await p.goto(`${base}/index.html?mode=cognitive&start=quick6&share_token=${shareToken}&name=mobile&age=40&gender=女&t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(3000);

  // 启动第一个模块
  await p.waitForFunction(() => window.__reasoning && window._nextModule, null, { timeout: 30000 });
  await p.evaluate(() => {
    // 假装模块启动完成
    if (window.__reasoning) {
      window.__reasoning.score = 80;
      window.__reasoning.correct = 8;
      window.__reasoning.trials = 10;
      window.__reasoning.completionRate = 0.8;
    }
  });
  await p.waitForTimeout(800);

  // 截屏第一个模块
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile/${cfg.name}-reasoning.png`, fullPage: false });

  // 切到 scenerecall (场景回忆 - 这个有 4 个图标网格, 可能显示问题)
  await p.evaluate(() => window._nextModule('reasoning'));
  await p.waitForTimeout(800);
  // 模块 activated 时 showReady=true, 但实际是要等用户操作
  // 强行激活场景回忆的 UI
  await p.evaluate(() => {
    if (window.activateModule) window.activateModule('scenerecall');
  });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile/${cfg.name}-scenerecall.png`, fullPage: false });

  // shortmem (短暂视觉记忆 - 显示数字序列)
  await p.evaluate(() => window._nextModule && window._nextModule('scenerecall'));
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    if (window.activateModule) window.activateModule('shortmem');
  });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile/${cfg.name}-shortmem.png`, fullPage: false });

  // attention (注意力 - 找不同)
  await p.evaluate(() => window._nextModule && window._nextModule('shortmem'));
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    if (window.activateModule) window.activateModule('attention');
  });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile/${cfg.name}-attention.png`, fullPage: false });

  // memory (文字记忆)
  await p.evaluate(() => window._nextModule && window._nextModule('attention'));
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    if (window.activateModule) window.activateModule('memory');
  });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile/${cfg.name}-memory.png`, fullPage: false });

  // visual (视觉记忆 - 也有网格)
  await p.evaluate(() => window._nextModule && window._nextModule('memory'));
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    if (window.activateModule) window.activateModule('visual');
  });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `js/questionnaire/probe-cog-mobile/${cfg.name}-visual.png`, fullPage: false });

  await ctx.close();
}

await browser.close();
console.log("\n✓ 6 模块 × 4 屏幕方向 = 24 张截图已保存到 js/questionnaire/probe-cog-mobile/");