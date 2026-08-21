// 漂移恢复 E2E：基线持续漂移 + Rest 自动重校准 → 命中不中断
// 用法：node tests/e2e/vor-ch1-drift.spec.cjs（自起静态服务器，端口 8798）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8798;
const URL = `http://localhost:${PORT}/vor.html?blocks=2&mode=device&skipvas=1&bloom=0&norender=1`;

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });

    // 漂移驱动：基线 0.2°/s 爬升到 +10°；Active 块在基线上叠正弦，Rest 块停在基线（准静止 → 触发重校准）
    await page.evaluate(() => {
      window.__drift = { t0: performance.now() / 1000 };
      const loop = () => {
        const d = window.__drift;
        const t = performance.now() / 1000 - d.t0;
        const baseline = Math.min(10, t * 0.2);
        const resting = window.__vorDemo && window.__vorDemo.pace.state === 'rest';
        const yaw = resting ? baseline : baseline + 15 * Math.sin(2 * Math.PI * 0.5 * t);
        window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });

    console.log('1) 第 1 块（小漂移期）：命中正常');
    await page.waitForFunction(() => window.__vorDemo.drill.stats.hits >= 3, null, { timeout: 25000 });
    assert('第 1 块命中 ≥ 3', true, `hits=${await page.evaluate(() => window.__vorDemo.drill.stats.hits)}`);

    console.log('2) Rest 块：自动重校准吃掉漂移');
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'rest', null, { timeout: 30000 });
    const offsetBefore = await page.evaluate(() => window.__vorDemo.input.offset.yaw);
    const baselineAtRest = await page.evaluate(() => Math.min(10, (performance.now() / 1000 - window.__drift.t0) * 0.2));
    // 等 Rest 内准静止 1.5s 触发重校准 + 0.5s 混合
    await page.waitForFunction((base) => Math.abs(window.__vorDemo.input.offset.yaw - base) < 2,
      baselineAtRest, { timeout: 12000 });
    const offsetAfter = await page.evaluate(() => window.__vorDemo.input.offset.yaw);
    assert('Rest 后零点跟随漂移基线（|offset−基线| < 2°）', true,
      `offset ${offsetBefore.toFixed(1)} → ${offsetAfter.toFixed(1)}，基线=${baselineAtRest.toFixed(1)}`);

    console.log('3) 第 2 块：命中恢复（漂移不再积累）');
    const hitsAtRestEnd = await page.evaluate(() => window.__vorDemo.drill.stats.hits);
    await page.waitForFunction((h) => window.__vorDemo.drill.stats.hits > h + 2, hitsAtRestEnd, { timeout: 30000 });
    const q = await page.evaluate(() => window.__vorDemo.evaluator.lastCycle ? window.__vorDemo.evaluator.lastCycle.quality : 0);
    assert('重校准后命中恢复', true, `hits ${hitsAtRestEnd} → ${await page.evaluate(() => window.__vorDemo.drill.stats.hits)}`);
    assert('周期质量分 ≥ 0.8（中线免疫）', q >= 0.8, `quality=${q.toFixed(2)}`);

    console.log('4) 控制台/页面错误');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(1); });
