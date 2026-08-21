// 第二章漂移恢复 E2E：pitch 慢漂 → 中线跟随；Rest 准静止 → yaw 和 pitch offset 双轴重校准
// 用法：node tests/e2e/vor-ch2-drift.spec.cjs（自起静态服务器，端口 8795）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8795;
const URL = `http://localhost:${PORT}/vor-ch2.html?blocks=2&mode=device&skipvas=1&bloom=0&norender=1`;

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

    // 漂移驱动：pitch 基线 0.15°/s 爬升到 +3°，yaw 基线 0.2°/s 爬升到 +8°；
    // Active 块在基线上叠正弦，Rest 块停在基线（双轴准静止 → 触发双轴重校准）
    await page.evaluate(() => {
      window.__drift = { t0: performance.now() / 1000 };
      const loop = () => {
        const d = window.__drift;
        const t = performance.now() / 1000 - d.t0;
        const pitchBase = Math.min(3, t * 0.15);
        const yawBase = Math.min(8, t * 0.2);
        const resting = window.__vorDemo && window.__vorDemo.pace.state === 'rest';
        const pitch = resting ? pitchBase : pitchBase + 10 * Math.sin(2 * Math.PI * 0.5 * t);
        const yaw = resting ? yawBase : yawBase + 8 * Math.sin(2 * Math.PI * 0.5 * t);
        window.updateFromGyroscope({ yaw, pitch, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });

    console.log('1) 第 1 块（小漂移期）：命中正常');
    await page.waitForFunction(() => window.__vorDemo.drill.stats.hits >= 3, null, { timeout: 25000 });
    assert('第 1 块命中 ≥ 3', true, `hits=${await page.evaluate(() => window.__vorDemo.drill.stats.hits)}`);

    console.log('2) 靶心方位 = 中线 ± amp（中线跟随漂移）');
    const follow = await page.evaluate(() => ({
      bearing: window.__vorDemo.drill.bearing,
      midline: window.__vorDemo.evaluator.lastCycle ? window.__vorDemo.evaluator.lastCycle.midline : null,
      amp: window.__vorDemo.CFG.amp,
    }));
    assert('已有周期中线输出', follow.midline !== null, `midline=${follow.midline}`);
    assert('靶心方位 = 中线 ± amp', follow.midline !== null && Math.abs(Math.abs(follow.bearing - follow.midline) - follow.amp) < 0.5,
      `bearing=${follow.bearing.toFixed(2)}, midline=${follow.midline?.toFixed(2)}, amp=${follow.amp}`);

    console.log('3) Rest 块：yaw 和 pitch 双轴自动重校准');
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'rest', null, { timeout: 30000 });
    const bases = await page.evaluate(() => {
      const t = performance.now() / 1000 - window.__drift.t0;
      return { pitch: Math.min(3, t * 0.15), yaw: Math.min(8, t * 0.2) };
    });
    // 等 Rest 内准静止 1.5s 触发重校准 + 0.5s 混合（双轴 offset 都应跟随各自基线）
    await page.waitForFunction((b) => {
      const o = window.__vorDemo.input.offset;
      const t = performance.now() / 1000 - window.__drift.t0;
      const pb = Math.min(3, t * 0.15), yb = Math.min(8, t * 0.2);
      return Math.abs(o.pitch - pb) < 1.5 && Math.abs(o.yaw - yb) < 1.5;
    }, bases, { timeout: 12000 });
    const offsets = await page.evaluate(() => ({
      yaw: window.__vorDemo.input.offset.yaw,
      pitch: window.__vorDemo.input.offset.pitch,
    }));
    assert('Rest 后 pitch 零点跟随漂移基线（|offset−基线| < 1.5°）', true,
      `offset.pitch=${offsets.pitch.toFixed(2)}，基线≈${bases.pitch.toFixed(2)}`);
    assert('Rest 后 yaw 零点同步重校准（|offset−基线| < 1.5°）', true,
      `offset.yaw=${offsets.yaw.toFixed(2)}，基线≈${bases.yaw.toFixed(2)}`);

    console.log('4) 第 2 块：命中恢复（漂移不再积累）');
    const hitsAtRestEnd = await page.evaluate(() => window.__vorDemo.drill.stats.hits);
    await page.waitForFunction((h) => window.__vorDemo.drill.stats.hits > h + 2, hitsAtRestEnd, { timeout: 30000 });
    const q = await page.evaluate(() => window.__vorDemo.evaluator.lastCycle ? window.__vorDemo.evaluator.lastCycle.quality : 0);
    assert('重校准后命中恢复', true, `hits ${hitsAtRestEnd} → ${await page.evaluate(() => window.__vorDemo.drill.stats.hits)}`);
    assert('周期质量分 ≥ 0.8（中线免疫）', q >= 0.8, `quality=${q.toFixed(2)}`);

    console.log('5) 控制台/页面错误');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(1); });
