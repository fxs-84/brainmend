// tests/e2e/position-rings.spec.cjs
// 验证: 位置觉模式下 canvas 上绘制了同心圆标靶 (POSITION-RINGS-v1)
// 用法: node tests/static-server.mjs & 然后 node tests/e2e/position-rings.spec.cjs [baseURL]
// 输出: screenshots/position-rings.png
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "http://localhost:8765";

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto(base + "/index.html", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1200);

  // 1) bundle 已含 POSITION-RINGS-v14 标记
  const bundleHasMark = await page.evaluate(async () => {
    try {
      const res = await fetch("./assets/index-Cc2Ik-Ku.js");
      const text = await res.text();
      return text.includes("/*POSITION-RINGS-v14*/");
    } catch (e) {
      return false;
    }
  });
  console.log((bundleHasMark ? "✅" : "❌") + " bundle 含 POSITION-RINGS-v14 标记");

  // 2) 进入头动追踪, 再切到位置觉模式
  await page.click('#page2-tracking').catch((e) => console.log('page2-tracking 点击失败:', e.message));
  await page.waitForTimeout(600);
  await page.click('[data-mode="position"]').catch((e) => console.log('position 点击失败:', e.message));
  await page.waitForTimeout(1200);

  // 3) 截图 canvas
  const canvas = await page.locator("#crosshair-canvas");
  const shot = path.join(__dirname, "..", "..", "screenshots", "position-rings.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await canvas.screenshot({ path: shot });
  console.log("📸 截图已保存: " + shot);

  // 4) canvas 像素级断言: 应能检测到 5 个分级颜色
  //    直接读 canvas imageData, 统计特定颜色像素
  const colorCounts = await page.evaluate(() => {
    const c = document.getElementById("crosshair-canvas");
    if (!c) return null;
    const ctx2 = c.getContext("2d");
    const d = ctx2.getImageData(0, 0, c.width, c.height).data;
    const targets = {
      "#22c55e": [0x22, 0xc5, 0x5e],
      "#84cc16": [0x84, 0xcc, 0x16],
      "#06b6d4": [0x06, 0xb6, 0xd4],
      "#eab308": [0xea, 0xb3, 0x08],
      "#f97316": [0xf9, 0x73, 0x16],
    };
    const counts = {};
    for (const k in targets) counts[k] = 0;
    // 允许 5 的容差 (抗锯齿)
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 200) continue;
      for (const k in targets) {
        const [tr, tg, tb] = targets[k];
        if (Math.abs(r - tr) <= 5 && Math.abs(g - tg) <= 5 && Math.abs(b - tb) <= 5) {
          counts[k]++;
        }
      }
    }
    return counts;
  });

  if (!colorCounts) {
    console.log("❌ canvas 找不到");
    await browser.close();
    process.exit(1);
  }

  console.log("像素统计:");
  let pass = 0;
  for (const k in colorCounts) {
    const c = colorCounts[k];
    const ok = c > 20; // 至少 20 个像素, 排除噪点
    console.log(`  ${ok ? "✅" : "❌"} ${k}: ${c} px`);
    if (ok) pass++;
  }

  const errs = logs.filter((l) => l.startsWith("[pageerror]"));
  if (errs.length) console.log("页面报错:", errs.join("\n"));

  await browser.close();
  if (!bundleHasMark || pass < 5) {
    console.log(`\n❌ 不通过 (bundle 标记=${bundleHasMark}, 颜色数=${pass}/5)`);
    process.exit(1);
  }
  console.log(`\n✅ 通过 (bundle 标记 ✓, 5/5 颜色环都可见)`);
})();
