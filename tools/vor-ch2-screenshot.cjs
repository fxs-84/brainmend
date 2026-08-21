// 第二章画面截图自检：初始（灰死齿轮）/ 修复中（黄铜转动）/ 敲钟终演
// 用法：node tools/vor-ch2-screenshot.cjs（自起静态服务器，端口 8792）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8792;
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
    await page.goto(`http://localhost:${PORT}/vor-ch2.html?skipvas=1&mode=device&blocks=12`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });

    // 注入 pitch 正弦摆动（模拟真实训练）；__holdUp=true 时固定抬头 +10°（终演看铜铃）
    await page.evaluate(() => {
      window.__holdUp = false;
      const loop = () => {
        const t = performance.now() / 1000;
        const pitch = window.__holdUp ? 10 : 10 * Math.sin(2 * Math.PI * 0.5 * t);
        window.updateFromGyroscope({ yaw: 0, pitch, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });
    await page.waitForTimeout(1200);

    // 截图 1：初始（齿轮灰死静止，钟摆微幅）
    await page.screenshot({ path: path.join(OUT, 'ch2-1-idle.png') });
    console.log('✓ 截图1 初始（灰死齿轮）');

    // 截图 2：修复 6 齿轮（外圈黄铜转动中，钟摆摆幅加大）
    await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__vorDemo.ch2.repairSegment(); });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, 'ch2-2-repair.png') });
    console.log('✓ 截图2 修复中（6/12）');

    // 截图 3：敲钟终演（修满 + 发光 + 全部齿轮咬合 + 钟波扩散 + 金色光脉冲）
    await page.evaluate(() => {
      const c = window.__vorDemo.ch2;
      while (c.repaired < 12) c.repairSegment();
      c.setGolden();
      c.ringBell();
      window.__holdUp = true;   // 抬头 +10°：顶部铜铃进入视野
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'ch2-3-ringbell.png') });
    console.log('✓ 截图3 敲钟终演');
  } finally {
    await browser.close(); server.kill();
  }
  console.log('完成');
  process.exit(0);
})().catch(e => { console.error('截图异常:', e); process.exit(1); });
