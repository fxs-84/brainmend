// js/questionnaire/probe-cog-shortmem.mjs
// 验证: 短暂视觉记忆模块熊猫格子可点击 (CELL_SZ 作用域 bug 修复)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:8765";
const OUT = "js/questionnaire/probe-cog-fit";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

for (const cfg of [
  { name: "desktop", width: 1280, height: 800, hasTouch: false },
  { name: "m-portrait", width: 375, height: 812, hasTouch: true },
]) {
  console.log(`\n===== ${cfg.name} =====`);
  const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, hasTouch: cfg.hasTouch, isMobile: cfg.hasTouch });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await p.goto(`${base}/index.html?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForFunction(() => window.__shortmem && window._cogFitCanvas, null, { timeout: 30000 });
  await p.waitForTimeout(1000);

  await p.evaluate(() => {
    window.__cogModule = "shortmem";
    const p2 = document.getElementById("page2");
    if (p2) p2.style.display = "none";
    const c = document.getElementById("cognitive-canvas");
    c.style.display = "block";
    document.getElementById("crosshair-canvas").style.display = "none";
    const sp = document.getElementById("side-panel");
    sp.style.setProperty("display", "none", "important");
    const area = document.getElementById("detection-area");
    area.style.setProperty("flex", "1", "important");
    window._cogFitCanvas();
    window.__shortmem.showReady();
  });
  await p.waitForTimeout(600);

  // 移动竖屏: 走强制横屏
  const hint = await p.evaluate(() => {
    const el = document.getElementById("cog-rotate-hint");
    return el ? getComputedStyle(el).display : "absent";
  });
  if (hint === "flex") {
    await p.click("#cog-rotate-go");
    await p.waitForTimeout(1800);
    console.log("  强制横屏已应用:", await p.evaluate(() => document.getElementById("app").style.transform));
  }

  // 真实鼠标点击 canvas 坐标点 (兼容旋转态)
  const clickCanvas = async (mx, my) => {
    const pt = await p.evaluate(({ mx, my }) => {
      const c = document.getElementById("cognitive-canvas");
      const R = c.getBoundingClientRect();
      const app = document.getElementById("app");
      const forced = app && app.style.transform.indexOf("rotate") >= 0;
      if (forced) return [R.left + R.width * (my / c.height), R.top + R.height * (1 - mx / c.width)];
      return [R.left + R.width * (mx / c.width), R.top + R.height * (my / c.height)];
    }, { mx, my });
    await p.mouse.click(pt[0], pt[1]);
  };

  // ready → 开始教程
  const rb = await p.evaluate(() => window.__shortmem._rb);
  await clickCanvas(rb.x + rb.w / 2, rb.y + rb.h / 2);
  await p.waitForTimeout(400);
  let phase = await p.evaluate(() => window.__shortmem.phase);
  console.log("  ready点击后:", phase, phase === "tutorial_text" ? "OK" : "FAIL");

  // tutorial_text → 继续 → tutorial_1
  const tb = await p.evaluate(() => window.__shortmem._tb);
  await clickCanvas(tb.x + tb.w / 2, tb.y + tb.h / 2);
  await p.waitForTimeout(400);

  // 等待 finger 阶段 (ready_countdown ~0.7s + showing 3x1s)
  await p.waitForFunction(() => window.__shortmem.displayPhase === "finger", null, { timeout: 12000 });
  console.log("  进入 finger 阶段 OK");
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${cfg.name}-7-shortmem-finger.png` });

  // 按顺序点击 3 个熊猫格子 (复刻 gridOff 计算格子中心)
  const cells = await p.evaluate(() => {
    const c = document.getElementById("cognitive-canvas");
    const W = c.width, H = c.height;
    const CELL = Math.max(36, Math.min(90, Math.floor((W - 80) / 4)));
    const GAP = Math.max(4, Math.floor(CELL * 0.08));
    const gw = 4 * (CELL + GAP) - GAP;
    const ox = W / 2 - gw / 2, oy = H / 2 - gw / 2 - 20;
    return window.__shortmem.positions.map((pos) => ({
      mx: ox + pos.c * (CELL + GAP) + CELL / 2,
      my: oy + pos.r * (CELL + GAP) + CELL / 2,
    }));
  });
  for (const cell of cells) {
    await clickCanvas(cell.mx, cell.my);
    await p.waitForTimeout(300);
  }
  const clicked = await p.evaluate(() => window.__shortmem.userOrder.length);
  console.log("  熊猫格子点击:", clicked + "/3", clicked === 3 ? "OK" : "FAIL");
  await p.screenshot({ path: `${OUT}/${cfg.name}-8-shortmem-clicked.png` });

  await ctx.close();
}
await browser.close();
console.log("\n✓ done");
