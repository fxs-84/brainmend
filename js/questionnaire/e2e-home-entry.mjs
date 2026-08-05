/**
 * 首页 5 入口可点击性 E2E (防御性验证)
 *
 * 验证:
 *  1. 加载后无任何残留覆盖层
 *  2. 依次点击 5 个入口, 每个都触发预期行为
 *  3. 每个入口操作完成后, 返回首页时无残留覆盖层
 *  4. 模拟"报告 overlay 残留"场景, 验证防御性清理生效
 *
 * 用法: node js/questionnaire/e2e-home-entry.mjs [baseURL]
 */

import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8765";
const errors = [];
const browser = await chromium.launch({ channel: "chrome" });

function isNoise(msg) { return msg.includes("three") || msg.includes("Failed to resolve module specifier"); }

const page = await browser.newPage();
page.on("pageerror", (e) => { if (!isNoise(e.message)) errors.push(`pageerror: ${e.message}`); });

const OVERLAY_IDS = ['cog-report-overlay','cog-record-list-overlay','qnr-qr-overlay','qnr-modal-overlay','cog-qr-overlay','trk-qr-overlay','gait-overlay','gait-qr-overlay','gait-history-overlay'];

async function noOverlayVisible(tag) {
  const visible = await page.evaluate((ids) => {
    return ids.filter((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.display !== '';
    });
  }, OVERLAY_IDS);
  if (visible.length) throw new Error(`[${tag}] 残留覆盖层: ${visible.join(', ')}`);
  console.log(`  ✅ 无残留覆盖层 (${tag})`);
}

async function clickEntry(id) {
  const btn = page.locator(`#${id}`);
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
}

// ---------- 1. 加载 + 无残留 ----------
await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await noOverlayVisible("初始加载");
console.log("✅ 页面加载, 无残留覆盖层");

// ---------- 2. 神经系统自评 → 弹窗 → 二维码 ----------
await clickEntry("page2-questionnaire");
await page.waitForTimeout(300);
if (!(await page.locator("#qnr-modal-overlay.show").count())) throw new Error("神经系统自评弹窗未打开");
console.log("✅ 入口1 神经系统自评 → 弹窗打开");
await page.click("#qnr-modal-share");
await page.waitForTimeout(800);
const qrVisible = await page.locator("#qnr-qr-overlay").isVisible();
if (!qrVisible) throw new Error("自评二维码弹窗未打开");
console.log("✅ 自评二维码弹窗打开 (SVG 渲染)");
await page.click("#qnr-qr-close");
await page.waitForTimeout(300);
await noOverlayVisible("关掉自评二维码后");

// ---------- 3. 认知评估 → 弹窗 ----------
await clickEntry("page2-cognitive");
await page.waitForTimeout(300);
if (!(await page.locator("#cog-modal-overlay.show").count())) throw new Error("认知评估弹窗未打开");
console.log("✅ 入口2 认知评估 → 弹窗打开");
await page.click("#cog-modal-close");
await page.waitForTimeout(300);
await noOverlayVisible("关掉认知弹窗后");

// ---------- 4. 头动追踪 → 侧栏显示 ----------
await clickEntry("page2-tracking");
await page.waitForTimeout(500);
const spDisplay = await page.evaluate(() => {
  const sp = document.getElementById("side-panel");
  return sp ? getComputedStyle(sp).display : "missing";
});
if (spDisplay === "none" || spDisplay === "missing") throw new Error(`头动追踪侧栏未显示 (display=${spDisplay})`);
console.log("✅ 入口3 头动追踪 → 侧栏显示");
// 返回首页 (side-panel 的返回按钮)
await page.click("#back-to-page2-btn");
await page.waitForTimeout(400);
await noOverlayVisible("头动追踪返回后");

// ---------- 5. 步态分析 → overlay 打开 ----------
await clickEntry("page2-gait");
await page.waitForTimeout(1000);
const gaitVisible = await page.locator("#gait-overlay").isVisible().catch(() => false);
if (!gaitVisible) throw new Error("步态分析 overlay 未打开");
console.log("✅ 入口4 步态分析 → overlay 打开");
await page.click("#gait-close-btn");
await page.waitForTimeout(400);
await noOverlayVisible("步态分析关闭后");

// ---------- 6. 认知报告 → 记录列表 ----------
await clickEntry("page2-cog-report");
await page.waitForTimeout(1000);
const listVisible = await page.locator("#cog-record-list-overlay").isVisible().catch(() => false);
if (!listVisible) throw new Error("认知报告记录列表未打开");
console.log("✅ 入口5 认知报告 → 记录列表打开");
// 关闭 (点遮罩)
await page.mouse.click(10, 10); // 点遮罩空白区
await page.waitForTimeout(400);
await noOverlayVisible("认知报告关闭后");

// ---------- 7. 模拟"报告 overlay 残留"场景 → 防御清理应生效 ----------
await page.evaluate(() => {
  // 模拟残留: 报告 overlay 被意外打开且没关
  document.getElementById('cog-report-overlay').style.display = 'block';
  document.getElementById('qnr-qr-overlay').style.display = 'flex';
});
await page.waitForTimeout(200);
// 模拟返回首页 (goHome 被包装 → 应清理)
await page.evaluate(() => { window.goHome(); });
await page.waitForTimeout(300);
await noOverlayVisible("goHome 清理残留");

// ---------- 8. 全部 5 个入口按钮应可点击 (pointer-events 正常) ----------
const clickable = await page.evaluate(() => {
  const ids = ['page2-cog-report','page2-cognitive','page2-tracking','page2-gait','page2-questionnaire'];
  return ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return { id, ok: false, reason: "missing" };
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      id,
      ok: st.display !== 'none' && st.pointerEvents !== 'none' && r.width > 0 && r.height > 0 && (topEl === el || el.contains(topEl)),
      display: st.display,
      pointerEvents: st.pointerEvents,
      top: topEl ? (topEl.id || topEl.className || topEl.tagName) : 'none'
    };
  });
});
const bad = clickable.filter((c) => !c.ok);
if (bad.length) throw new Error(`不可点击入口: ${JSON.stringify(bad, null, 2)}`);
console.log("✅ 全部 5 个入口按钮可点击 (无遮挡 / pointer-events 正常):");
clickable.forEach((c) => console.log(`   ${c.id}: OK`));

if (errors.length) throw new Error(`JS 报错:\n${errors.join("\n")}`);
console.log("\n🎉 首页入口可点击性 E2E 全部通过");
await browser.close();
