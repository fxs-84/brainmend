// 第一章画面截图自检：初始蜷缩 / 修复中 / 通关飞出
// 用法：node tools/vor-ch1-screenshot.cjs（自起静态服务器，端口 8796）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796;
const OUT = path.join(__dirname, '..', 'screenshots');

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', e => console.error('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/vor.html?skipvas=1&mode=device&blocks=12`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });

    // 注入正弦摆动（模拟真实训练）
    await page.evaluate(() => {
      const loop = () => {
        const t = performance.now() / 1000;
        window.updateFromGyroscope({ yaw: 15 * Math.sin(2 * Math.PI * 0.5 * t), pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });
    await page.waitForTimeout(1200);

    // 截图 1：初始蜷缩
    await page.screenshot({ path: path.join(OUT, 'ch1-new-1-idle.png') });
    console.log('✓ 截图1 初始蜷缩');

    // 截图 2：修复 8 段（右翼展开中，断口火花减弱）
    await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__vorDemo.ch1.repairSegment(); });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, 'ch1-new-2-repair.png') });
    console.log('✓ 截图2 修复中（8/20）');

    // 截图 3：通关飞出（修满 + 发光 + 飞出 + 金色轨迹）
    await page.evaluate(() => {
      const c = window.__vorDemo.ch1;
      while (c.repaired < 20) c.repairSegment();
      c.setGolden();
      c.flyOut();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'ch1-new-3-flyout.png') });
    console.log('✓ 截图3 通关飞出');
  } finally {
    await browser.close(); server.kill();
  }
  console.log('完成');
  process.exit(0);
})().catch(e => { console.error('截图异常:', e); process.exit(1); });
