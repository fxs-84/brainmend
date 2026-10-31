import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let K;

before(async () => {
  globalThis.window = globalThis;
  const modPath = path.join(ROOT, 'assets', 'gait-kinematics.js').split(path.sep).join('/').replace(/^\/+/, '');
  await import('file:///' + modPath);
  K = globalThis.__gaitKinematics;
  assert.ok(K, 'window.__gaitKinematics 应已挂载');
});

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `期望 ${expected}，实际 ${actual}`);
}

function points(side = 'left') {
  const values = {
    shoulder: [100, 100], elbow: [100, 200], wrist: [100, 300],
    hip: [100, 200], knee: [100, 300], ankle: [100, 400],
    heel: [100, 400], foot_index: [150, 400]
  };
  return Object.entries(values).map(([name, [x, y]]) => ({
    name: `${side}_${name}`, x, y, score: 0.95, source: 'raw'
  }));
}

function move(keypoints, name, x, y) {
  const point = keypoints.find(k => k.name === `left_${name}`);
  point.x = x;
  point.y = y;
}

function anglesFor(keypoints, direction = 1) {
  return K.computeFrameAngles(keypoints, { side: 'left', direction });
}

function makePhases() {
  return Object.fromEntries(K.PHASES.map((name, index) => [name, {
    startFrame: index, endFrame: index, representativeFrame: index
  }]));
}

function makeCycle(overrides = {}) {
  return {
    id: 'c1', startFrame: 0, endFrame: 8, confirmed: true,
    phases: makePhases(),
    ...overrides
  };
}

function makeView() {
  return {
    side: 'left', direction: 1,
    frames: Array.from({ length: 9 }, (_, i) => ({ frameIndex: i, t: i / 30, keypoints: points() })),
    confirmedCycles: [makeCycle()]
  };
}

test('导出角度键和八时相常量', () => {
  assert.deepEqual(K.ANGLE_KEYS, ['shoulder', 'elbow', 'hip', 'knee', 'ankle']);
  assert.deepEqual(K.PHASES, ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw']);
});

test('已知几何：完全伸直为 0，肩髋前屈、肘膝屈曲为正', () => {
  const neutral = anglesFor(points());
  K.ANGLE_KEYS.forEach(key => close(neutral[key], 0));

  const flexed = points();
  move(flexed, 'elbow', 200, 100);
  move(flexed, 'wrist', 200, 100);
  move(flexed, 'knee', 200, 200);
  move(flexed, 'ankle', 300, 200);
  move(flexed, 'heel', 300, 200);
  move(flexed, 'foot_index', 300, 150);
  const angles = anglesFor(flexed);
  close(angles.shoulder, 90);
  close(angles.elbow, 0);
  close(angles.hip, 90);
  close(angles.knee, 0);
  close(angles.ankle, 0);

  const bent = points();
  move(bent, 'wrist', 200, 200);
  move(bent, 'ankle', 0, 300);
  const bentAngles = anglesFor(bent);
  close(bentAngles.elbow, 90);
  close(bentAngles.knee, 90);
});

test('过伸保留负号，踝背屈为正、跖屈为负', () => {
  const hyper = points();
  move(hyper, 'wrist', 0, 200);
  move(hyper, 'ankle', 200, 300);
  const hyperAngles = anglesFor(hyper);
  close(hyperAngles.elbow, -90);
  close(hyperAngles.knee, -90);

  const dorsiflexed = points();
  move(dorsiflexed, 'foot_index', 150, 350);
  close(anglesFor(dorsiflexed).ankle, 45);
  move(dorsiflexed, 'foot_index', 150, 450);
  close(anglesFor(dorsiflexed).ankle, -45);
});

test('镜像几何在 direction=-1 时保持一致，双侧命名可用', () => {
  const left = points();
  move(left, 'elbow', 200, 100);
  move(left, 'wrist', 250, 100);
  move(left, 'knee', 180, 200);
  move(left, 'ankle', 180, 300);
  const expected = anglesFor(left);
  const mirrored = left.map(p => ({ ...p, x: -p.x }));
  const actual = anglesFor(mirrored, -1);
  K.ANGLE_KEYS.forEach(key => close(actual[key], expected[key]));

  const right = points('right');
  assert.equal(K.computeFrameAngles(right, { side: 'right', direction: 1 }).knee, 0);
});

test('缺点、低置信和零长度仅令相关角度为 null', () => {
  const missing = points().filter(p => p.name !== 'left_wrist');
  const missingAngles = anglesFor(missing);
  assert.equal(missingAngles.elbow, null);
  close(missingAngles.shoulder, 0);

  const low = points();
  low.find(p => p.name === 'left_hip').score = 0.1;
  const lowAngles = anglesFor(low);
  assert.equal(lowAngles.shoulder, null);
  assert.equal(lowAngles.hip, null);
  close(lowAngles.knee, 0);

  const zero = points();
  move(zero, 'knee', 100, 200);
  const zeroAngles = anglesFor(zero);
  assert.equal(zeroAngles.hip, null);
  assert.equal(zeroAngles.knee, null);
  close(zeroAngles.ankle, 0);
  close(zeroAngles.shoulder, 0);
});

test('踝角只使用踝到足尖，足跟位置不得影响结果', () => {
  const keypoints = points();
  const expected = anglesFor(keypoints).ankle;
  move(keypoints, 'heel', 500, 50);
  close(anglesFor(keypoints).ankle, expected);
});

test('踝角按两轴实际夹角计算，90度为0且胫骨倾斜时仍正确', () => {
  const keypoints = points();
  move(keypoints, 'ankle', 150, 400);
  move(keypoints, 'foot_index', 250, 350);
  close(anglesFor(keypoints).ankle, 0);
  move(keypoints, 'foot_index', 250, 300);
  close(anglesFor(keypoints).ankle, 18.43494882);
  move(keypoints, 'foot_index', 150, 500);
  close(anglesFor(keypoints).ankle, -63.43494882);
});

test('周期校验检查确认、边界、时相顺序及时间', () => {
  const view = makeView();
  assert.deepEqual(K.validateCycle(view, makeCycle()), { valid: true, reason: null });
  assert.equal(K.validateCycle(view, makeCycle({ confirmed: false })).valid, false);
  assert.equal(K.validateCycle(view, makeCycle({ endFrame: 0 })).valid, false);
  assert.equal(K.validateCycle(view, makeCycle({ startFrame: 99 })).valid, false);
  assert.equal(K.validateCycle(view, makeCycle({ phases: { ...makeCycle().phases, IC: 1 } })).valid, false);
  assert.equal(K.validateCycle(view, makeCycle({ phases: { ...makeCycle().phases, LR: 3 } })).valid, false);
  assert.equal(K.validateCycle(view, makeCycle({ phases: { ...makeCycle().phases, TSw: 3 } })).valid, false);
  const missingPhase = makeCycle().phases;
  delete missingPhase.MSw;
  assert.equal(K.validateCycle(view, makeCycle({ phases: missingPhase })).valid, false);
  view.frames[2].t = view.frames[1].t;
  assert.equal(K.validateCycle(view, makeCycle()).valid, false);
});

test('逐帧序列只含确认周期，归属人工时相且不插值', () => {
  const view = makeView();
  view.frames[1].keypoints = view.frames[1].keypoints.filter(p => p.name !== 'left_wrist');
  view.confirmedCycles.push(makeCycle({ id: 'other', confirmed: false }));
  const series = K.computeViewSeries(view, makeCycle());
  assert.equal(series.length, 9);
  assert.deepEqual(series.map(f => f.phase), ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw', null]);
  assert.ok(series.every(f => f.cycleId === 'c1'));
  assert.equal(series[1].angles.elbow, null);
  assert.equal(series[2].angles.elbow, 0);
  assert.equal(series[0].sources.left_hip.source, 'raw');
  assert.deepEqual(K.computeViewSeries(view, makeCycle({ confirmed: false })), []);
});

test('归一化保留真实样本，仅在相邻有效样本间插值', () => {
  const series = [0, 0.25, 0.5, 0.75, 1].map((time, i) => ({
    frameIndex: i, time, phase: 'IC',
    angles: { shoulder: [0, 10, null, 30, 40][i], elbow: null, hip: 0, knee: 0, ankle: 0 }
  }));
  const normalized = K.normalizeSeries(series, 5);
  assert.deepEqual(normalized.shoulder, [0, 10, null, 30, 40]);
  assert.deepEqual(normalized.elbow, [null, null, null, null, null]);
  assert.equal(normalized.hip[2], 0, '真实零值必须保留');

  const dense = K.normalizeSeries(series.slice(0, 3), 5);
  assert.equal(dense.shoulder[1], 5);
  assert.equal(dense.shoulder[3], null);
  assert.throws(() => K.normalizeSeries(series, 1));
});
