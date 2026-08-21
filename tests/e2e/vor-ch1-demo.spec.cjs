// 第一章 VOR demo E2E：注入陀螺仪正弦，断言模态A锚定 + 判定 + 节奏闭环
// 用法：node tests/e2e/vor-ch1-demo.spec.cjs（自起静态服务器，端口 8791）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8791;
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

    console.log('1) 启动流程（?mode=device 直达，免点击）');
    // 注入通道就绪：用 rAF 驱动（headless Chromium 会把 setInterval 节流到 ~10Hz，rAF 更稳）
    await page.evaluate(() => {
      window.__drive = { mode: 'zero', t0: 0, gapFrames: 0 };
      const loop = () => {
        const d = window.__drive;
        if (d.gapFrames > 0) { d.gapFrames--; }          // gap 测试：跳过注入
        else {
          let yaw = 0;
          if (d.mode === 'sine') {
            const t = performance.now() / 1000 - d.t0;
            // 幅值 2 秒渐入：从静止直接起摆会造成 ω 0→47°/s 瞬时跳变（真实患者不会这样动）
            yaw = 15 * Math.min(1, t / 2) * Math.sin(2 * Math.PI * 0.5 * t);
          } else if (d.mode === 'follow') {
            // 跟踪靶心方位：头始终对准 bearing（靶环应收拢到屏幕中心）
            yaw = window.__vorDemo ? window.__vorDemo.drill.bearing : 0;
          }
          window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });
    assert('校准 2 秒后进入 Active 块', true);

    console.log('2) 固定场景模式（场景静止，只有靶环滑动）');
    await page.evaluate(() => { const d = window.__drive; d.mode = 'sine'; d.t0 = performance.now() / 1000; });
    await page.waitForFunction(() => window.__vorDemo.input.pose.yaw > 14, null, { timeout: 10000 });
    const atPos = await page.evaluate(() => ({ orb: window.__vorDemo.orbScreenX(), prop: window.__vorDemo.propScreenX() }));
    await page.waitForFunction(() => window.__vorDemo.input.pose.yaw < -14, null, { timeout: 10000 });
    const atNeg = await page.evaluate(() => ({ orb: window.__vorDemo.orbScreenX(), prop: window.__vorDemo.propScreenX() }));
    assert('光球屏幕位置不随头动（ΔNDC < 0.02）', Math.abs(atPos.orb - atNeg.orb) < 0.02,
      `Δ=${Math.abs(atPos.orb - atNeg.orb).toFixed(4)}`);
    assert('世界道具静止不反扫（ΔNDC < 0.02）', Math.abs(atPos.prop - atNeg.prop) < 0.02,
      `Δ=${Math.abs(atPos.prop - atNeg.prop).toFixed(4)}`);
    // 靶环收敛：头回零（pose≈0，bearing=±15）→ 靶环偏位；头对准 bearing → 靶环居中
    await page.evaluate(() => { window.__drive.mode = 'zero'; });
    await page.waitForFunction(() => Math.abs(window.__vorDemo.input.pose.yaw) < 1, null, { timeout: 8000 });
    await page.waitForTimeout(200);   // 等 demo tick 用新 pose 刷新靶环位置（rAF 顺序：tick→注入→断言）
    const ringOff = await page.evaluate(() => Math.abs(window.__vorDemo.ringScreenX()));
    assert('头偏离目标时靶环偏位（|NDC x| > 0.1）', ringOff > 0.1, `|x|=${ringOff.toFixed(3)}`);
    await page.evaluate(() => { window.__drive.mode = 'follow'; });
    await page.waitForTimeout(800);
    const ringMin = await page.evaluate(() => new Promise(res => {
      let m = 99;
      const t0 = performance.now();
      const probe = () => {
        m = Math.min(m, Math.abs(window.__vorDemo.ringScreenX()));
        if (performance.now() - t0 < 600) requestAnimationFrame(probe); else res(m);
      };
      requestAnimationFrame(probe);
    }));
    assert('头对准目标时靶环收拢到中心（min|NDC x| < 0.05）', ringMin < 0.05, `min|x|=${ringMin.toFixed(4)}`);
    await page.evaluate(() => { const d = window.__drive; d.mode = 'sine'; d.t0 = performance.now() / 1000; });

    console.log('3) 跑 2 个训练块（约 55 秒），采样状态');
    const seen = new Set(); let smoothSamples = 0, activeSamples = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 55000) {
      const s = await page.evaluate(() => ({
        state: window.__vorDemo.pace.state,
        block: window.__vorDemo.pace.block,
        smooth: window.__vorDemo.evaluator.isSmooth,
        hits: window.__vorDemo.drill.stats.hits,
        repaired: window.__vorDemo.ch1.repaired,
      }));
      seen.add(s.state);
      if (s.state === 'active') { activeSamples++; if (s.smooth) smoothSamples++; }
      await page.waitForTimeout(1000);
    }
    const fin = await page.evaluate(() => ({
      hits: window.__vorDemo.drill.stats.hits,
      quality: window.__vorDemo.evaluator.lastCycle ? window.__vorDemo.evaluator.lastCycle.quality : 0,
      repaired: window.__vorDemo.ch1.repaired,
      clinical: window.__vorDemo.input.clinical,
      threshold: window.__vorDemo.evaluator.threshold,
    }));
    assert('经历过 Rest 块（节奏控制器工作）', seen.has('rest'));
    assert('经历过第 2 个 Active 块', await page.evaluate(() => window.__vorDemo.pace.block) >= 2);
    assert(`靶心命中 ≥ 20（理想正弦 ≈1 命中/秒）`, fin.hits >= 20, `hits=${fin.hits}`);
    assert(`修复单元 ≥ 4（命中能量驱动）`, fin.repaired >= 4, `repaired=${fin.repaired}/20`);
    assert('周期质量分 > 0.9（理想正弦）', fin.quality > 0.9, `quality=${fin.quality.toFixed(2)}`);
    assert('Active 期间 isSmooth 占比 ≥ 80%', activeSamples > 0 && smoothSamples / activeSamples >= 0.8,
      `${smoothSamples}/${activeSamples}`);
    assert('注入路径保持临床标记（非键盘/自动）', fin.clinical === true);

    console.log('4) 采样 gap 不产生伪毛刺（dt 钳制）');
    // 用 spikeLog（|α|>500）判定：低帧率下 19Hz 采样量化本身会产生 ~290 的边界毛刺（非 gap 伪影），
    // 真正的跨 gap 差分尖刺量级在 1500+，500 阈值可干净区分
    await page.evaluate(() => { window.__vorDemo.chain.spikeLog.length = 0; });
    await page.evaluate(() => { window.__drive.gapFrames = 30; }); // 跳过 30 帧注入（≈0.5~1.5s）
    await page.waitForTimeout(2500);
    const spikes = await page.evaluate(() => window.__vorDemo.chain.spikeLog.length);
    assert('注入 gap 后无 α 尖刺（spikeLog 无新增）', spikes === 0, `新增尖刺=${spikes}`);

    console.log('5) 控制台/页面错误');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(1); });
