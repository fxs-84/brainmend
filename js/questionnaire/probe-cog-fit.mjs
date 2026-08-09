// js/questionnaire/probe-cog-fit.mjs
// 本地验证: 认知评估画布自适应(虚拟分辨率等比缩放) + 横屏引导
// 前提: 本地静态服务器已启动 (node tests/static-server.mjs, 端口 8765)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:8765";
const OUT = "js/questionnaire/probe-cog-fit";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

const configs = [
  { name: "desktop",      width: 1280, height: 800, hasTouch: false },
  { name: "m-portrait",   width: 375,  height: 812, hasTouch: true },
  { name: "m-landscape",  width: 812,  height: 375, hasTouch: true },
];

// 把 canvas 内部坐标转换为可视 client 坐标后真实点击 (走生产分发链路)
async function clickCanvas(p, mx, my) {
  const pt = await p.evaluate(({ mx, my }) => {
    const c = document.getElementById("cognitive-canvas");
    const R = c.getBoundingClientRect();
    const app = document.getElementById("app");
    const forced = app && app.style.transform.indexOf("rotate") >= 0;
    if (forced) {
      // 旋转态: client = (T + lh*fy, innerHeight - (L + lw*fx))
      return [R.left + R.width * (my / c.height), R.top + R.height * (1 - mx / c.width)];
    }
    return [R.left + R.width * (mx / c.width), R.top + R.height * (my / c.height)];
  }, { mx, my });
  await p.mouse.click(pt[0], pt[1]);
}

for (const cfg of configs) {
  console.log(`\n===== ${cfg.name} (${cfg.width}x${cfg.height}, touch=${cfg.hasTouch}) =====`);
  const ctx = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height },
    hasTouch: cfg.hasTouch,
    isMobile: cfg.hasTouch,
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  p.on("response", (r) => { if (r.status() === 404) console.log("  [404]", r.url()); });
  await p.goto(`${base}/index.html?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForFunction(() => window.__flex && window._cogFitCanvas, null, { timeout: 30000 });
  await p.waitForTimeout(1200);

  // activateModule 未暴露到 window, 这里模拟其核心步骤 (隐藏侧栏 + 显示画布 + 自适应 + showReady)
  const activate = (mod, globalName) => p.evaluate(({ mod, globalName }) => {
    window.__cogModule = mod;
    const p2 = document.getElementById("page2");
    if (p2) p2.style.display = "none";   // 与真实流程一致: 进入认知评估时隐藏首页
    const c = document.getElementById("cognitive-canvas");
    c.style.display = "block";
    document.getElementById("crosshair-canvas").style.display = "none";
    const sp = document.getElementById("side-panel");
    sp.style.setProperty("display", "none", "important");
    sp.style.setProperty("width", "0", "important");
    const area = document.getElementById("detection-area");
    area.style.setProperty("flex", "1", "important");
    window._cogFitCanvas();
    window[globalName].showReady();
  }, { mod, globalName });

  // --- 1. 横屏引导遮罩 (仅移动竖屏应出现) ---
  const hintVisible = await p.evaluate(() => {
    const el = document.getElementById("cog-rotate-hint");
    return el ? getComputedStyle(el).display : "absent";
  });
  console.log("  rotate-hint(进入前):", hintVisible);

  // --- 2. 激活"变通能力"模块 (左右双框, 重叠重灾区) ---
  await activate("flex", "__flex");
  await p.waitForTimeout(800);

  const dims = await p.evaluate(() => {
    const c = document.getElementById("cognitive-canvas");
    const area = document.getElementById("detection-area");
    return { cw: c.width, ch: c.height, aw: area.offsetWidth, ah: area.offsetHeight };
  });
  console.log("  canvas backing:", `${dims.cw}x${dims.ch}`, " area:", `${dims.aw}x${dims.ah}`);

  const hintAfter = await p.evaluate(() => {
    const el = document.getElementById("cog-rotate-hint");
    return el ? getComputedStyle(el).display : "absent";
  });
  console.log("  rotate-hint(激活后):", hintAfter);
  await p.screenshot({ path: `${OUT}/${cfg.name}-1-hint-or-ready.png` });

  // 若有引导遮罩 → 点"全屏并横屏", 验证 1s 后 CSS 强制横屏生效
  if (hintAfter === "flex") {
    await p.click("#cog-rotate-go");
    await p.waitForTimeout(1800);
    const forced = await p.evaluate(() => {
      const app = document.getElementById("app");
      const c = document.getElementById("cognitive-canvas");
      const area = document.getElementById("detection-area");
      return {
        transform: app.style.transform,
        backing: c.width + "x" + c.height,
        area: area.offsetWidth + "x" + area.offsetHeight,
      };
    });
    console.log("  强制横屏:", JSON.stringify(forced));
    await p.screenshot({ path: `${OUT}/${cfg.name}-5-forced-landscape.png` });
  }

  // --- 3. ready 屏 (440px 固定宽框) 截图 ---
  await p.screenshot({ path: `${OUT}/${cfg.name}-2-flex-ready.png` });

  // --- 4. 点击"开始教程"验证缩放后的点击映射 (强制横屏后重新取 backing 尺寸) ---
  const dim2 = await p.evaluate(() => {
    const c = document.getElementById("cognitive-canvas");
    return { cw: c.width, ch: c.height };
  });
  const W = dim2.cw, H = dim2.ch;
  await clickCanvas(p, W / 2, H / 2 + 52); // ready 按钮中心
  await p.waitForTimeout(400);
  let phase = await p.evaluate(() => window.__flex.phase);
  console.log("  点击开始教程后 phase:", phase, phase === "tutorial_text" ? "OK" : "FAIL");

  // --- 5. 点"继续"进入 tutorial_1 → 左右双网格界面 ---
  await clickCanvas(p, W / 2, H / 2 + 43); // tutorial_text 继续按钮中心
  await p.waitForTimeout(400);
  phase = await p.evaluate(() => window.__flex.phase);
  console.log("  点击继续后 phase:", phase, phase === "tutorial_1" ? "OK" : "FAIL");
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${cfg.name}-3-flex-dualbox.png` });

  // --- 6. 场景回忆 ready 屏 (460px 反馈框模块) ---
  await activate("scenerecall", "__scenerecall");
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${cfg.name}-4-scenerecall-ready.png` });

  await ctx.close();
}

await browser.close();
console.log("\n✓ 截图输出到", OUT);
