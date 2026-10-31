// tests/gait/gait-params-velocity-gate.test.js
// 速度门 (velocityGateSeries) 单元测试 + detectGaitEvents 端到端防瞬移测试
// 速度门移植自 FreeMoCap realtime_point_gate (assets/gait-params.js)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let P;

before(async () => {
  globalThis.window = globalThis;  // gait-params.js 是浏览器 IIFE, 挂载到 window
  const modPath = path.join(ROOT, 'assets', 'gait-params.js').split(path.sep).join('/').replace(/^\/+/, '');
  await import('file:///' + modPath);
  P = globalThis.__gaitParams;
  assert.ok(P, 'window.__gaitParams 应已挂载');
  assert.equal(typeof P.velocityGateSeries, 'function', 'velocityGateSeries 应已导出');
});

function makeTimes(n, fps) {
  fps = fps || 30;
  var arr = new Array(n);
  for (var i = 0; i < n; i++) arr[i] = i / fps;
  return arr;
}

// ---------------------------------------------------------------
// velocityGateSeries 单元测试
// ---------------------------------------------------------------

test('速度门: 单帧瞬移 → NaN, 邻点不受影响', function () {
  var times = makeTimes(30);
  var vals = new Array(30).fill(100);
  vals[10] = 600;  // 500px/帧 = 15000px/s, 远超门限
  var r = P.velocityGateSeries(vals, times, 1170);
  assert.ok(isNaN(r.series[10]), '瞬移帧应被拒为 NaN');
  assert.equal(r.series[9], 100);
  assert.equal(r.series[11], 100, '拒绝不移动参考点, 下一帧正常接受');
  assert.equal(r.rejectedCount, 1);
});

test('速度门: 真实步态级速度不误伤 (heel_rel 正弦, 峰值 ~790px/s)', function () {
  var times = makeTimes(300);
  var vals = times.map(function (t) { return 70 * Math.sin(2 * Math.PI * 1.8 * t); });
  var r = P.velocityGateSeries(vals, times, 1170);
  assert.equal(r.rejectedCount, 0, '干净步态序列不应有拒绝点');
});

test('速度门: 持续瞬移防锁死 — 连续拒绝 4 帧后第 5 帧强制接受', function () {
  var times = makeTimes(30);
  var vals = new Array(30).fill(100);
  for (var i = 10; i < 30; i++) vals[i] = 1000;  // 跳变后停在新水平
  var r = P.velocityGateSeries(vals, times, 1170);
  assert.ok(isNaN(r.series[10]) && isNaN(r.series[11]) && isNaN(r.series[12]) && isNaN(r.series[13]),
            'streak 1-4 应拒绝');
  assert.equal(r.series[14], 1000, '第 5 帧连续高速应强制接受 (防永久锁死)');
  assert.equal(r.series[20], 1000, '强制接受后参考点更新, 后续正常');
});

test('速度门: NaN 输入透传, 首帧建立参考', function () {
  var vals = [NaN, NaN, 100, 101, NaN, 102];
  var t = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30];
  var r = P.velocityGateSeries(vals, t, 1170);
  assert.ok(isNaN(r.series[0]) && isNaN(r.series[1]) && isNaN(r.series[4]));
  assert.equal(r.series[2], 100);
  assert.equal(r.series[3], 101);
  assert.equal(r.series[5], 102);
  assert.equal(r.rejectedCount, 0);
});

test('速度门: 长遮挡复现不误拒 (dt 按 lastAccepted 实际间隔计算)', function () {
  var n = 30;
  var times = makeTimes(n);
  var vals = times.map(function (t) { return 40 * t; });  // 40px/s 慢速前移
  // 帧 10-19 遮挡 (NaN), 帧 20 复现: 位移 40*10/30≈13px, dt=10/30s → 400px/s < 1170
  for (var i = 10; i < 20; i++) vals[i] = NaN;
  var r = P.velocityGateSeries(vals, times, 1170);
  assert.equal(vals[20], r.series[20], '复现帧应被接受');
  assert.equal(r.rejectedCount, 0);
});

// ---------------------------------------------------------------
// detectGaitEvents 端到端: 2 帧瞬移坏帧不应产生假事件 / 错位 TO
// ---------------------------------------------------------------

/**
 * 合成侧向行走序列 (30fps, 10s):
 *  - 髋中心以 40px/s 前移 (方向判定阈值 3px/s)
 *  - 左右 heel_rel 反相正弦, 幅值 70px, 步频 1.8Hz
 *  - 身高 ~390px (nose y=60, ankle y=450) → 门限 1170px/s
 */
function buildSyntheticGait() {
  var fps = 30, n = fps * 10, bodyH = 400, stepHz = 1.8, amp = 70;
  var pelvis0 = 300, pelvisVx = 40;
  var frames = [];
  for (var i = 0; i < n; i++) {
    var t = i / fps;
    var pelvisX = pelvis0 + pelvisVx * t;
    var phL = 2 * Math.PI * stepHz * t;
    var phR = phL + Math.PI;
    var lh = pelvisX + amp * Math.sin(phL);
    var rh = pelvisX + amp * Math.sin(phR);
    var lt = pelvisX + (amp - 5) * Math.sin(phL + 0.5);
    var rt = pelvisX + (amp - 5) * Math.sin(phR + 0.5);
    frames.push({
      t: t,
      keypoints: [
        { x: pelvisX, y: 60, score: 0.95, name: 'nose' },
        { x: pelvisX - 10, y: 240, score: 0.95, name: 'left_hip' },
        { x: pelvisX + 10, y: 240, score: 0.95, name: 'right_hip' },
        { x: lh, y: 452, score: 0.95, name: 'left_heel' },
        { x: rh, y: 452, score: 0.95, name: 'right_heel' },
        { x: lt, y: 455, score: 0.95, name: 'left_foot_index' },
        { x: rt, y: 455, score: 0.95, name: 'right_foot_index' },
        { x: lh, y: 450, score: 0.9, name: 'left_ankle' },
        { x: rh, y: 450, score: 0.9, name: 'right_ankle' }
      ]
    });
  }
  return frames;
}

function cloneFrames(frames) {
  return frames.map(function (f) {
    return { t: f.t, keypoints: f.keypoints.map(function (k) { return { x: k.x, y: k.y, score: k.score, name: k.name }; }) };
  });
}

test('合成步态基线: 左右各检出 ~18 个 HS, TO 与干净序列一致', function () {
  var frames = buildSyntheticGait();
  var r = P.detectGaitEvents(frames);
  assert.ok(r.left.hs.length >= 15 && r.left.hs.length <= 19, 'left HS ~18, 实际 ' + r.left.hs.length);
  assert.ok(r.right.hs.length >= 15 && r.right.hs.length <= 19, 'right HS ~18, 实际 ' + r.right.hs.length);
  assert.ok(r.right.to.length >= 14, 'right TO 应每个周期一个, 实际 ' + r.right.to.length);
});

test('2 帧瞬移坏帧 (foot_index -200px): 不产生假 HS, TO 不错位', function () {
  var clean = P.detectGaitEvents(buildSyntheticGait());

  var spiked = cloneFrames(buildSyntheticGait());
  // 右周期 [4.861s, 5.417s] 的 TO 搜索窗 [15%,85%] = [4.944, 5.333];
  // 真实 toe_rel 波谷在 5.094s; 在 5.23s (frame 157) 注入 -200px 负向尖峰,
  // 无门限时会变成"更深波谷" → TO 错位到 5.23s; 有速度门应被剔除
  [156, 157].forEach(function (fi) {
    spiked[fi].keypoints.forEach(function (k) {
      if (k.name === 'right_foot_index') k.x -= 200;
    });
  });

  var r = P.detectGaitEvents(spiked);
  assert.equal(r.right.hs.length, clean.right.hs.length, 'HS 数应与干净序列一致');
  assert.equal(r.right.to.length, clean.right.to.length, 'TO 数应与干净序列一致');
  r.right.to.forEach(function (to) {
    assert.ok(Math.abs(to.time - 157 / 30) > 0.12,
              'TO 不应落在尖峰注入时刻附近 (t=' + to.time.toFixed(3) + ')');
    var nearest = Math.min.apply(null, clean.right.to.map(function (c) { return Math.abs(c.time - to.time); }));
    assert.ok(nearest < 0.05, 'TO 时刻应与干净序列对应 (Δ=' + nearest.toFixed(3) + 's)');
  });
});

test('2 帧瞬移坏帧 (heel +250px): HS 数不变, 无假事件', function () {
  var clean = P.detectGaitEvents(buildSyntheticGait());

  var spiked = cloneFrames(buildSyntheticGait());
  // 右脚摆动中期 (frame 154-155, heel_rel 波谷区) 注入 +250px — 无门限时
  // median-3 杀第 1 帧、第 2 帧残留 → MA 后形成假峰
  [154, 155].forEach(function (fi) {
    spiked[fi].keypoints.forEach(function (k) {
      if (k.name === 'right_heel') k.x += 250;
    });
  });

  var r = P.detectGaitEvents(spiked);
  assert.equal(r.right.hs.length, clean.right.hs.length, 'HS 数应与干净序列一致');
  assert.equal(r.left.hs.length, clean.left.hs.length, '左侧不应受影响');
});

// ---------------------------------------------------------------
// butterworthZeroPhase 单元测试 (第 2 步: 零相位低通替代滑动平均)
// ---------------------------------------------------------------

test('Butterworth: 1.8Hz 步态正弦保幅保相位 (零相位, 极值帧不偏移)', function () {
  var n = 300, fs = 30;
  var sig = new Array(n);
  for (var i = 0; i < n; i++) sig[i] = 70 * Math.sin(2 * Math.PI * 1.8 * i / fs);
  var out = P.butterworthZeroPhase(sig, 6, fs);
  // 零相位 = 每个波峰留在原处: 同一帧号 i 处, 输入/输出的抛物线精修峰位应一致
  function crestTime(arr, i) {
    var y0 = arr[i - 1], y1 = arr[i], y2 = arr[i + 1];
    var a = (y0 + y2 - 2 * y1) / 2, b = (y2 - y0) / 2;
    return (Math.abs(a) < 1e-12) ? i : i - b / (2 * a);
  }
  var maxIn = 10;
  for (var i = 11; i < n - 11; i++) {
    if (sig[i] > sig[maxIn]) maxIn = i;
  }
  var d = Math.abs(crestTime(sig, maxIn) - crestTime(out, maxIn));
  assert.ok(d < 0.1, '零相位同一峰位偏移应 <0.1 帧, 实际 ' + d.toFixed(3));
  // 通带内幅值保持 (>95%)
  var ampOut = out[maxIn];
  assert.ok(ampOut > 70 * 0.95 && ampOut <= 70 * 1.01, '通带幅值应保持, 实际 ' + ampOut.toFixed(1));
});

test('Butterworth: 10Hz 高频噪声强衰减 (fc=6Hz, 4阶零相位)', function () {
  var n = 300, fs = 30;
  var sig = new Array(n);
  for (var i = 0; i < n; i++) sig[i] = 20 * Math.sin(2 * Math.PI * 10 * i / fs);
  var out = P.butterworthZeroPhase(sig, 6, fs);
  var peak = 0;
  for (var i = 10; i < n - 10; i++) peak = Math.max(peak, Math.abs(out[i]));
  assert.ok(peak < 1, '10Hz 分量应衰减到 <1px, 实际 ' + peak.toFixed(2));
});

test('Butterworth: NaN 分段不跨洞滤波', function () {
  var n = 90, fs = 30;
  var sig = new Array(n);
  for (var i = 0; i < n; i++) sig[i] = (i >= 40 && i < 50) ? NaN : 50 * Math.sin(2 * Math.PI * 1.5 * i / fs);
  var out = P.butterworthZeroPhase(sig, 6, fs);
  for (var i = 40; i < 50; i++) assert.ok(isNaN(out[i]), '洞应保持 NaN');
  assert.ok(!isNaN(out[20]) && !isNaN(out[70]), '洞两侧应正常滤波');
});

test('Butterworth: 低帧率收缩 — 20fps 时 fc 自动降为 4.4Hz, 1.8Hz 信号仍保幅', function () {
  var n = 200, fs = 20;
  var sig = new Array(n);
  for (var i = 0; i < n; i++) sig[i] = 60 * Math.sin(2 * Math.PI * 1.8 * i / fs);
  var out = P.butterworthZeroPhase(sig, Math.min(6, fs * 0.22), fs);
  var peak = 0;
  for (var i = 10; i < n - 10; i++) peak = Math.max(peak, Math.abs(out[i]));
  assert.ok(peak > 60 * 0.9, '1.8Hz 在通带内应保持幅值, 实际 ' + peak.toFixed(1));
});

// ---------------------------------------------------------------
// 假阳性过滤 + 同时-HS 去重 (真实视频: 静止背景伪影驱动假事件)
// ---------------------------------------------------------------

test('anti-fake: 超出腿长约束 (1.8×体高) 的 heel_rel 不产生 HS', function () {
  var clean = P.detectGaitEvents(buildSyntheticGait());
  var frames = cloneFrames(buildSyntheticGait());
  // frames 105-195 (t≈3.5-6.5s): 左脚跟被背景伪影拉到骨盆前 1.8×体高处 (真实视频: x≈540px 静止伪影)
  for (var i = 105; i <= 195; i++) {
    var pelvisX = 300 + 40 * (i / 30);
    frames[i].keypoints.forEach(function (k) {
      if (k.name === 'left_heel') k.x = pelvisX + 1.8 * 390;
    });
  }
  var r = P.detectGaitEvents(frames);
  var inWindow = r.left.hs.filter(function (h) { return h.time > 3.6 && h.time < 6.4; });
  assert.equal(inWindow.length, 0, '越界伪影窗口内不应有 HS, 实际 ' + inWindow.length);
  // clean=18: 窗口内 5 个 (3.75-6.25s) + 入口边界 1 个 (3.47s, 速度门插值斜坡吞掉) 丢失
  assert.equal(r.left.hs.length, clean.left.hs.length - 6,
               '窗口外 HS 应完整保留 (clean=' + clean.left.hs.length + ' got=' + r.left.hs.length + ')');
  var kept = r.left.hs.map(function (h) { return h.time; });
  assert.ok(kept.some(function (t) { return Math.abs(t - 6.81) < 0.06; }),
            '出口边界的真实 HS (6.81s) 应保留 — 伪峰不得在进入 findPeaks 间隔合并前挤掉它');
});

test('anti-fake: 悬空振荡伪影 (可达范围内但远离地面) 被地面接触过滤拦截', function () {
  var frames = cloneFrames(buildSyntheticGait());
  // frames 105-195: 伪影在可达范围内振荡 (100±50px < 0.6×体高) 但悬空 (y=250 vs 地面 452)
  for (var i = 105; i <= 195; i++) {
    var t = i / 30, pelvisX = 300 + 40 * t;
    frames[i].keypoints.forEach(function (k) {
      if (k.name === 'left_heel') {
        k.x = pelvisX + 100 + 50 * Math.sin(2 * Math.PI * 1.8 * t);
        k.y = 250;
      }
    });
  }
  var r = P.detectGaitEvents(frames);
  var inWindow = r.left.hs.filter(function (h) { return h.time > 3.6 && h.time < 6.4; });
  assert.equal(inWindow.length, 0, '悬空振荡伪影不应产生 HS, 实际 ' + inWindow.length);
});

test('heel 低可见退回踝: 入镜窗口 (heel v=0.10) 仍检出 HS', function () {
  var frames = cloneFrames(buildSyntheticGait());
  // frames 60-120 (t=2-4s): 左脚跟 visibility 掉到 0.10 (模拟入镜/转身窗口实测 0.05-0.4),
  // 踝保持 0.9 且在跟位置 (合成数据 ankle==heel 坐标) → 退回踝后该窗口应有 HS
  for (var i = 60; i <= 120; i++) {
    frames[i].keypoints.forEach(function (k) {
      if (k.name === 'left_heel') k.score = 0.10;
    });
  }
  var r = P.detectGaitEvents(frames);
  var inWindow = r.left.hs.filter(function (h) { return h.time > 2.1 && h.time < 3.9; });
  assert.ok(inWindow.length >= 2, '入镜窗口应经踝退回检出 ≥2 个 HS, 实际 ' + inWindow.length);
});

test('dedupe: 异侧同时 HS (归侧混淆) 每对只保留一个', function () {
  var frames = cloneFrames(buildSyntheticGait());
  // frames 60-120: 右脚跟复刻左脚波形 (模拟归侧混淆帧) → R 峰与 L 峰同帧出现
  for (var i = 60; i <= 120; i++) {
    var t = i / 30, pelvisX = 300 + 40 * t;
    var phL = 2 * Math.PI * 1.8 * t;
    frames[i].keypoints.forEach(function (k) {
      if (k.name === 'right_heel') k.x = pelvisX + 70 * Math.sin(phL);
    });
  }
  var r = P.detectGaitEvents(frames);
  var merged = [];
  r.left.hs.forEach(function (h) { merged.push({ s: 'L', t: h.time }); });
  r.right.hs.forEach(function (h) { merged.push({ s: 'R', t: h.time }); });
  merged.sort(function (a, b) { return a.t - b.t; });
  for (var m = 1; m < merged.length; m++) {
    if (merged[m].s !== merged[m - 1].s) {
      assert.ok(merged[m].t - merged[m - 1].t >= 0.119,
                '不应有 Δt<0.12s 的异侧 HS (t=' + merged[m - 1].t.toFixed(2) + '/' + merged[m].t.toFixed(2) + ')');
    }
  }
  assert.ok(r.left.hs.length + r.right.hs.length >= 15, '真实事件不应被去重误删');
});
