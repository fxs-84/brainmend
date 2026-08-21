// 周期质量分制 + 中线漂移免疫 单元测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VorQualityEvaluator } from '../VorQualityEvaluator.js';
import { TargetDrill } from '../TargetDrill.js';

// 用解析值直接驱动判定器（不经过信号链）
function drive(ev, seconds, fn, hz = 60) {
  for (let f = 0; f < seconds * hz; f++) {
    const t = f / hz;
    const s = fn(t);
    ev.update({ yaw: s.yaw, wyaw: s.wyaw, alphaRMS: s.rms, valid: true, t });
  }
}
const sine = (amp, freq, base = 0) => (t) => ({
  yaw: base + amp * Math.sin(2 * Math.PI * freq * t),
  wyaw: amp * 2 * Math.PI * freq * Math.cos(2 * Math.PI * freq * t),
  rms: 100,
});

test('理想正弦 quality ≈ 1 且 perfect', () => {
  const ev = new VorQualityEvaluator({ amp: 15, freq: 0.5 });
  const cycles = [];
  ev.onCycle(c => cycles.push(c));
  drive(ev, 10, sine(15, 0.5));
  assert.equal(cycles.length, 4);
  assert.ok(cycles.every(c => c.quality > 0.95), JSON.stringify(cycles.map(c => c.quality)));
  assert.ok(cycles.every(c => c.perfect));
});

test('幅度 19°（偏差 4°）拿部分分，不再一票否决', () => {
  const ev = new VorQualityEvaluator({ amp: 15, freq: 0.5 });
  const cycles = [];
  ev.onCycle(c => cycles.push(c));
  drive(ev, 10, sine(19, 0.5));
  // ampScore = 1-(4-2)/4 = 0.5 → quality = 0.4·0.5+0.3+0.3 = 0.8
  assert.ok(cycles.length >= 3 && cycles.every(c => c.quality > 0.7 && c.quality < 0.9),
    JSON.stringify(cycles.map(c => c.quality.toFixed(2))));
});

test('漂移免疫：基线 +10° 漂移后幅度判定不受影响', () => {
  const ev = new VorQualityEvaluator({ amp: 15, freq: 0.5 });
  const cycles = [];
  ev.onCycle(c => cycles.push(c));
  drive(ev, 10, sine(15, 0.5, 10));   // 中线漂到 +10°
  assert.ok(cycles.length >= 3 && cycles.every(c => c.quality > 0.95),
    '漂移后 quality 仍应 ≈1：' + JSON.stringify(cycles.map(c => c.quality.toFixed(2))));
  assert.ok(Math.abs(cycles[0].midline - 10) < 1, `midline=${cycles[0].midline}`);
});

test('梯形波（真人曲线）：可拿 0.6~1.0 分，训练可继续', () => {
  const ev = new VorQualityEvaluator({ amp: 15, freq: 0.5 });
  const cycles = [];
  ev.onCycle(c => cycles.push(c));
  // 梯形角速度：转向区 α 峰值 ~300（真人水平），平滑 RMS ~180
  drive(ev, 10, (t) => {
    const ph = (t * 0.5) % 1;
    const tri = ph < 0.25 ? ph / 0.25 : ph < 0.75 ? 1 - (ph - 0.25) / 0.25 : (ph - 0.75) / 0.25 - 1;
    const yaw = 15 * tri;
    const wyaw = 15 * 2 * (ph < 0.25 ? 1 : ph < 0.75 ? -1 : 1) * 0.5 * 2;
    return { yaw, wyaw, rms: 180 };
  });
  assert.ok(cycles.length >= 3, '梯形波应检出周期');
  assert.ok(cycles.every(c => c.quality >= 0.55), '梯形波应拿到可累积的分: ' + JSON.stringify(cycles.map(c => c.quality.toFixed(2))));
});

test('TargetDrill：到位保持 → 命中并交替出靶；节拍窗口连击', () => {
  const d = new TargetDrill({ amp: 15, tolerance: 2.5, holdSec: 0.3, beatWindow: 0.3 });
  d.side = 1; d.bearing = 15;
  const hits = [];
  d.onHit(h => hits.push(h));
  // 没到目标位：不命中
  for (let i = 0; i < 30; i++) d.update(1 / 60, 0, 0);
  assert.equal(d.stats.hits, 0);
  // 到位保持 0.3s+：命中，靶换到 -15
  for (let i = 0; i < 30; i++) d.update(1 / 60, 15.5, 0.1);   // beatDelta 0.1 → 节拍内
  assert.equal(d.stats.hits, 1);
  assert.equal(hits[0].onBeat, true);
  assert.equal(d.bearing, -15);
  // 节拍外命中：连击清零
  for (let i = 0; i < 30; i++) d.update(1 / 60, -15.5, 0.6);
  assert.equal(d.stats.hits, 2);
  assert.equal(hits[1].onBeat, false);
  assert.equal(d.stats.combo, 0);
  assert.equal(d.stats.bestCombo, 1);
});
