// IMU 采集验证 Demo (imu-demo.html) E2E
// 仿真模式(?sim=1)下注入合成 0x55 0x61 数据流, 验证解析/渲染/归零/重同步全链路(裸数据显示, 无滤波/补偿):
//   1) 50Hz 数据流正常解析(包数、实测速率)
//   2) 暂停后显示角度与内部相对角度一致(±0.02°)
//   3) 光点坐标映射正确(yaw→X, pitch→Y, 8px/°)
//   4) 软件归零后相对角度=0、光点回中心
//   5) 模拟丢字节: 重同步计数增加, 且恢复后显示仍与真值一致
//   6) 28字节(含时间戳)帧变体同样正确解析
//   7) 自定义HEX指令(SIM下模拟发送)入日志
//   8) 跳变鉴别: 干净流无跳变; 注入+10°帧(角速度=0)检出并判为融合层假象, 裸数据原样通过
//   9) 斜坡漂移: 原样累积呈现, 峰峰值统计正确
//  10) 无页面错误
// 用法: node tests/e2e/imu-demo.spec.cjs（自起静态服务器，端口 8799）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8799;

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function newSimPage(browser, errors, query) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://localhost:${PORT}/imu-demo.html?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__demo && window.__demo.sim.timer, null, { timeout: 5000 });
  // 默认关 inv-x/inv-y 以保持数据流测试与原先断言兼容; 单独页面验证 inv 符号逻辑
  await page.evaluate(() => {
    const ix = document.getElementById('inv-x'), iy = document.getElementById('inv-y');
    if (ix) ix.checked = false; if (iy) iy.checked = false;
    document.getElementById('scale').dispatchEvent(new Event('change'));
  });
  return page;
}
// 暂停仿真并等显示稳定, 返回页面内部状态快照
async function pauseAndSnap(page) {
  await page.evaluate(() => { if (window.__demo.sim.timer) document.getElementById('btn-sim').click(); });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const d = window.__demo, S = d.S, $ = id => document.getElementById(id);
    const box = document.getElementById('canvas-box');
    return {
      rel: { ...S.rel }, dot: { ...S.dot },
      dispYaw: parseFloat($('v-yaw').textContent),
      dispPitch: parseFloat($('v-pitch').textContent),
      dispRoll: parseFloat($('v-roll').textContent),
      ax: parseFloat($('v-ax').textContent), wz: parseFloat($('v-wz').textContent),
      packets61: S.packets61, rateHz: S.rateHz, resyncBytes: S.resyncBytes,
      lastFrameLen: S.lastFrameLen, maxGap: S.maxGap,
      ppYaw: S.pp.yaw.min > S.pp.yaw.max ? 0 : S.pp.yaw.max - S.pp.yaw.min,
      cw: box.clientWidth, ch: box.clientHeight,
      pxPerDeg: +$('scale').value,
    };
  });
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  const errors = [];
  try {
    /* ---- 页面A: 20字节帧 ---- */
    const page = await newSimPage(browser, errors, 'sim=1');
    await page.waitForTimeout(1500);

    const run = await page.evaluate(() => ({ p: window.__demo.S.packets61, hz: window.__demo.S.rateHz }));
    assert('50Hz 数据流解析(包数>50)', run.p > 50, `packets=${run.p}`);
    assert('实测速率 35~60Hz', run.hz > 35 && run.hz < 60, `${run.hz.toFixed(1)}Hz`);

    const s1 = await pauseAndSnap(page);
    console.log(`  快照: yaw=${s1.rel.yaw.toFixed(2)}° pitch=${s1.rel.pitch.toFixed(2)}° roll=${s1.rel.roll.toFixed(2)}° 显示(${s1.dispYaw}, ${s1.dispPitch}, ${s1.dispRoll})`);
    assert('显示 yaw 与内部一致', Math.abs(s1.dispYaw - s1.rel.yaw) < 0.02, `Δ=${Math.abs(s1.dispYaw - s1.rel.yaw).toFixed(4)}`);
    assert('显示 pitch 与内部一致', Math.abs(s1.dispPitch - s1.rel.pitch) < 0.02, `Δ=${Math.abs(s1.dispPitch - s1.rel.pitch).toFixed(4)}`);
    assert('加速度/角速度显示为有效数字', isFinite(s1.ax) && isFinite(s1.wz), `ax=${s1.ax} wz=${s1.wz}`);

    const expX = s1.cw / 2 + s1.rel.yaw * s1.pxPerDeg;
    const expY = s1.ch / 2 - s1.rel.pitch * s1.pxPerDeg;
    assert('光点 X 映射 (yaw→X)', Math.abs(s1.dot.x - expX) < 1.5, `dot=${s1.dot.x.toFixed(1)} 期望=${expX.toFixed(1)}`);
    assert('光点 Y 映射 (pitch→Y)', Math.abs(s1.dot.y - expY) < 1.5, `dot=${s1.dot.y.toFixed(1)} 期望=${expY.toFixed(1)}`);

    await page.evaluate(() => document.getElementById('btn-zero').click());
    await page.waitForTimeout(200);
    const z = await page.evaluate(() => ({ rel: { ...window.__demo.S.rel }, dot: { ...window.__demo.S.dot } }));
    assert('归零后相对角度=0', Math.abs(z.rel.yaw) < 1e-6 && Math.abs(z.rel.pitch) < 1e-6 && Math.abs(z.rel.roll) < 1e-6);
    assert('归零后光点回中心', Math.abs(z.dot.x - s1.cw / 2) < 1 && Math.abs(z.dot.y - s1.ch / 2) < 1, `dot=(${z.dot.x.toFixed(1)},${z.dot.y.toFixed(1)})`);

    // 归零后继续→暂停, 显示仍应跟踪真值
    await page.evaluate(() => document.getElementById('btn-sim').click());
    await page.waitForTimeout(700);
    const s2 = await pauseAndSnap(page);
    assert('归零后跟踪真值一致', Math.abs(s2.dispYaw - s2.rel.yaw) < 0.02, `Δ=${Math.abs(s2.dispYaw - s2.rel.yaw).toFixed(4)}`);

    // 丢字节: 重同步 + 恢复
    await page.evaluate(() => {
      document.getElementById('sim-drop').checked = true;
      document.getElementById('btn-sim').click();   // 继续
    });
    await page.waitForTimeout(2500);
    const drop = await page.evaluate(() => ({ r: window.__demo.S.resyncBytes, p: window.__demo.S.packets61 }));
    assert('丢字节触发重同步(>0 字节)', drop.r > 0, `resync=${drop.r}B packets=${drop.p}`);
    await page.evaluate(() => { document.getElementById('sim-drop').checked = false; });
    await page.waitForTimeout(400);
    const s3 = await pauseAndSnap(page);
    assert('丢字节恢复后显示与真值一致', Math.abs(s3.dispYaw - s3.rel.yaw) < 0.02, `Δ=${Math.abs(s3.dispYaw - s3.rel.yaw).toFixed(4)}`);

    // 自定义 HEX 指令(SIM 模拟发送)
    await page.evaluate(() => {
      document.getElementById('custom-hex').value = 'FF AA 27 3A 00';
      document.getElementById('btn-custom').click();
    });
    const logOk = await page.evaluate(() => document.getElementById('log').textContent.includes('[SIM] 模拟发送: FF AA 27 3A 00'));
    assert('自定义HEX指令模拟发送入日志', logOk);

    // 运动目标: 水平正弦, 位置随时间变化, 误差读数有效
    await page.selectOption('#tgt-mode', 'h');
    const xs = [];
    for (let k = 0; k < 4; k++) {
      xs.push(await page.evaluate(() => window.__demo.tgt.deg.x));
      await page.waitForTimeout(500);
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    assert('目标水平正弦运动(位置随时间变化)', spread > 1, `2s内摆动=${spread.toFixed(2)}°`);
    const errTxt = await page.evaluate(() => document.getElementById('track-err').textContent);
    assert('跟踪误差显示有效', /误差 [\d.]+° \(5s RMS [\d.]+°\)/.test(errTxt), errTxt);
    await page.selectOption('#tgt-mode', 'off');
    // 验证 inv 符号作用于偏差显示: 开启 inv-x, 显示偏差 = rel*signX - tgt.deg.x
    await page.evaluate(() => { const ix = document.getElementById('inv-x'); ix.checked = true; ix.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(200);
    const sgn = await page.evaluate(() => {
      const S = window.__demo.S, tgt = window.__demo.tgt;
      const signX = document.getElementById('inv-x').checked ? -1 : 1;
      const expected = S.rel.yaw - tgt.deg.x * signX;
      const shown = parseFloat(document.getElementById('v-yaw').textContent);
      return { expected, shown };
    });
    assert('inv-x 开启: 显示偏差 = rel - tgt.deg*signX', Math.abs(sgn.shown - sgn.expected) < 0.02, `显示=${sgn.shown.toFixed(3)} 期望=${sgn.expected.toFixed(3)}`);

    await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'imu-demo-sim.png') });
    await page.close();

    /* ---- 页面B: 28字节帧(含时间戳) ---- */
    const pageB = await newSimPage(browser, errors, 'sim=1&simfmt=28');
    await pageB.waitForTimeout(1200);
    const sB = await pauseAndSnap(pageB);
    assert('28字节帧解析(包数>40)', sB.packets61 > 40, `packets=${sB.packets61}`);
    assert('末帧长度=28B', sB.lastFrameLen === 28, `${sB.lastFrameLen}B`);
    assert('28字节帧显示与真值一致', Math.abs(sB.dispYaw - sB.rel.yaw) < 0.02, `Δ=${Math.abs(sB.dispYaw - sB.rel.yaw).toFixed(4)}`);

    // 跳变鉴别: 干净正弦流无跳变; 注入 +10° 帧(角速度=0)应被鉴别为融合层假象
    const j0 = await pageB.evaluate(() => window.__demo.S.jumps);
    assert('干净数据流无跳变', j0 === 0, `jumps=${j0}`);
    const yawBefore = (await pageB.evaluate(() => window.__demo.S.rel.yaw));
    await pageB.evaluate(() => {
      const S = window.__demo.S;
      const f = buildSimFrame({ ax: 0, ay: 0, az: 1, wx: 0, wy: 0, wz: 0, roll: 0, pitch: 0, yaw: S.prevRaw.yaw + 10 }, 28);
      window.__demo.P.feed(f);
    });
    const j1 = await pageB.evaluate(() => ({ n: window.__demo.S.jumps, log: window.__demo.S.jumpLog.join('|') }));
    assert('注入+10°帧检出跳变', j1.n === 1, `jumps=${j1.n}`);
    assert('跳变被鉴别为融合层假象(角速度不支持)', j1.log.includes('角速度不支持'), j1.log.slice(0, 90));
    // 裸数据链路: 台阶原样通过, 显示侧不做任何抑制
    const g1 = await pageB.evaluate(() => window.__demo.S.rel.yaw);
    assert('裸数据原样通过(台阶全量呈现)', Math.abs(g1 - (yawBefore + 10)) < 0.5,
      `${yawBefore.toFixed(2)}→${g1.toFixed(2)}°`);
    await pageB.close();

    /* ---- 页面D: 跳变抑制门控开启(URL ?gate=1) ---- */
    const pageD = await newSimPage(browser, errors, 'sim=1&simfmt=28&gate=1');
    await pageD.waitForTimeout(1200);
    const gateOn = await pageD.evaluate(() => document.getElementById('gate-on').checked);
    assert('?gate=1 开启门控', gateOn === true);
    // 测试1: 融合台阶(w=0, +10°)应被冻结后快滑追上
    await pageD.evaluate(() => { if (window.__demo.sim.timer) document.getElementById('btn-sim').click(); });   // 暂停
    await pageD.waitForTimeout(250);
    const d1before = await pageD.evaluate(() => ({ yaw: window.__demo.S.rel.yaw, g: window.__demo.S.gated }));
    await pageD.evaluate(() => {
      const S = window.__demo.S;
      const f = buildSimFrame({ ax: 0, ay: 0, az: 1, wx: 0, wy: 0, wz: 0, roll: 0, pitch: 0, yaw: S.prevRaw.yaw + 10 }, 28);
      window.__demo.P.feed(f);
    });
    const d1frozen = await pageD.evaluate(() => ({ yaw: window.__demo.S.rel.yaw, g: window.__demo.S.gated }));
    assert('门控开启: 台阶首帧被冻结(偏移<0.5°)', Math.abs(d1frozen.yaw - d1before.yaw) < 0.5, `${d1before.yaw.toFixed(2)}→${d1frozen.yaw.toFixed(2)}°`);
    assert('门控事件计数 +1', d1frozen.g === d1before.g + 1, `gated ${d1before.g}→${d1frozen.g}`);
    // 喂30帧让滑行追上(每帧1°)
    await pageD.evaluate(() => {
      const S = window.__demo.S;
      for (let i = 0; i < 30; i++) {
        const f = buildSimFrame({ ax: 0, ay: 0, az: 1, wx: 0, wy: 0, wz: 0, roll: S.prevRaw.roll, pitch: S.prevRaw.pitch, yaw: S.prevRaw.yaw }, 28);
        window.__demo.P.feed(f);
      }
    });
    const d1caught = await pageD.evaluate(() => window.__demo.S.rel.yaw);
    assert('门控开启: 滑行追上新电平(误差<1.5°)', Math.abs(d1caught - (d1before.yaw + 10)) < 1.5,
      `期望≈${(d1before.yaw + 10).toFixed(2)}° 实际=${d1caught.toFixed(2)}°`);
    // 重置门控状态(测试间清理, 不反映真实使用)
    await pageD.evaluate(() => { const S = window.__demo.S; S.holdFrames = 0; S.slew = false; S.gcont = { ...S.cont }; });
    // 测试2: 反转愈合 — +10 后立刻 -10 跳回原电平 → 无扰动
    const d2before = await pageD.evaluate(() => ({ yaw: window.__demo.S.rel.yaw, h: window.__demo.S.heals, g: window.__demo.S.gated }));
    await pageD.evaluate(() => {
      const S = window.__demo.S;
      const a = buildSimFrame({ ax: 0, ay: 0, az: 1, wx: 0, wy: 0, wz: 0, roll: 0, pitch: 0, yaw: S.prevRaw.yaw + 10 }, 28);
      window.__demo.P.feed(a);
      const b = buildSimFrame({ ax: 0, ay: 0, az: 1, wx: 0, wy: 0, wz: 0, roll: 0, pitch: 0, yaw: S.prevRaw.yaw - 10 }, 28);   // 从新电平跳回原电平
      window.__demo.P.feed(b);
    });
    const d2after = await pageD.evaluate(() => ({ yaw: window.__demo.S.rel.yaw, h: window.__demo.S.heals }));
    assert('门控开启: 反转愈合(角度无偏移)', Math.abs(d2after.yaw - d2before.yaw) < 0.1, `${d2before.yaw.toFixed(2)}→${d2after.yaw.toFixed(2)}°`);
    assert('门控开启: 愈合计数 +1', d2after.h === d2before.h + 1, `heals ${d2before.h}→${d2after.h}`);
    // 重置门控状态
    await pageD.evaluate(() => { const S = window.__demo.S; S.holdFrames = 0; S.slew = false; S.gcont = { ...S.cont }; });
    // 测试3: 真实快速运动(|w|=200)不被门控拦截
    const d3before = await pageD.evaluate(() => ({ yaw: window.__demo.S.rel.yaw, g: window.__demo.S.gated }));
    await pageD.evaluate(() => {
      const S = window.__demo.S;
      const f = buildSimFrame({ ax: 0, ay: 0, az: 1, wx: 0, wy: 0, wz: 200, roll: 0, pitch: 0, yaw: S.prevRaw.yaw + 3.5 }, 28);
      window.__demo.P.feed(f);
    });
    const d3after = await pageD.evaluate(() => ({ yaw: window.__demo.S.rel.yaw, g: window.__demo.S.gated }));
    assert('门控开启: |w|=200 真实运动不拦截', Math.abs(d3after.yaw - (d3before.yaw + 3.5)) < 0.5, `${d3before.yaw.toFixed(2)}→${d3after.yaw.toFixed(2)}°`);
    assert('门控开启: 真实运动不增加抑制计数', d3after.g === d3before.g, `gated ${d3before.g}→${d3after.g}`);
    await pageD.close();

    /* ---- 页面C: 斜坡漂移(0.3°/s) 裸数据呈现 + 峰峰值统计 ---- */
    const pageC = await newSimPage(browser, errors, 'sim=1&simmode=drift');
    await pageC.waitForTimeout(6000);
    const d1 = await pauseAndSnap(pageC);
    console.log(`  漂移6s: rel.yaw=${d1.rel.yaw.toFixed(2)}° PP=${d1.ppYaw.toFixed(2)}°`);
    assert('漂移随时间累积 (rel.yaw>1°)', d1.rel.yaw > 1.0, `${d1.rel.yaw.toFixed(2)}°`);
    assert('峰峰值统计反映漂移 (PP>1°)', d1.ppYaw > 1.0, `${d1.ppYaw.toFixed(2)}°`);
    assert('漂移原样显示(显示=内部)', Math.abs(d1.dispYaw - d1.rel.yaw) < 0.02, `Δ=${Math.abs(d1.dispYaw - d1.rel.yaw).toFixed(4)}`);
    await pageC.evaluate(() => document.getElementById('btn-sim').click());
    await pageC.waitForTimeout(6000);
    const d2 = await pauseAndSnap(pageC);
    assert('漂移继续累积不被削减 (rel.yaw>3°)', d2.rel.yaw > 3.0, `${d2.rel.yaw.toFixed(2)}°`);
    await pageC.close();

    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    failed++;
    console.error('  ✗ 用例执行异常:', e.message);
    console.error(errors.slice(0, 5).join('\n'));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
