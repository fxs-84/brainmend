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
});

const PARTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'foot_index'];
const COORDS = {
  shoulder: [100, 100], elbow: [120, 180], wrist: [140, 240], hip: [100, 200],
  knee: [110, 300], ankle: [120, 400], heel: [100, 410], foot_index: [180, 410]
};

function point(side, name, coords, source = 'ai') {
  return { name: `${side}_${name}`, x: coords[0], y: coords[1], score: 0.95, source };
}

function fullFrame(frameIndex, side = 'left') {
  const raw = PARTS.map(name => point(side, name, COORDS[name]));
  return { frameIndex, t: frameIndex / 30, rawKeypoints: raw, keypoints: raw.map(p => ({ ...p })) };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `期望 ${expected}，实际 ${actual}`);
}

test('八种解剖点都能在相同几何下精确传播人工偏移', () => {
  const reference = fullFrame(0);
  reference.keypoints.forEach(p => {
    p.x += 5;
    p.y -= 5;
    p.source = 'manual';
    p.score = 1;
  });
  const calibration = K.createCalibration(reference, 'left');
  assert.deepEqual(Object.keys(calibration.corrections).sort(), PARTS.slice().sort());
  const target = fullFrame(8);
  const result = K.applyCalibrations([target], [calibration], 'left')[0];
  PARTS.forEach(name => {
    const p = result.keypoints.find(item => item.name === `left_${name}`);
    close(p.x, COORDS[name][0] + 5);
    close(p.y, COORDS[name][1] - 5);
    assert.equal(p.source, 'calibrated');
    assert.equal(p.score, 0.95);
  });
});

test('膝点偏移随大腿局部方向旋转并按长度缩放', () => {
  const raw = [point('left', 'hip', [0, 0]), point('left', 'knee', [0, 100])];
  const reference = {
    frameIndex: 0,
    rawKeypoints: raw,
    keypoints: [raw[0], { ...raw[1], x: 20, source: 'manual', score: 1 }]
  };
  const calibration = K.createCalibration(reference, 'left');
  const targetRaw = [point('left', 'hip', [0, 0]), point('left', 'knee', [200, 0])];
  const target = { frameIndex: 10, rawKeypoints: targetRaw, keypoints: targetRaw.map(p => ({ ...p })) };
  const result = K.applyCalibrations([reference, target], [calibration], 'left');
  const propagated = result[1].keypoints.find(p => p.name === 'left_knee');
  close(propagated.x, 200);
  close(propagated.y, -40);
  assert.equal(result[0].keypoints.find(p => p.name === 'left_knee').source, 'manual');
});

test('多个关键帧之间插值，已有手动点不被覆盖', () => {
  const first = fullFrame(0);
  const second = fullFrame(20);
  [first, second].forEach((frame, index) => {
    const knee = frame.keypoints.find(p => p.name === 'left_knee');
    knee.x += index === 0 ? 20 : -20;
    knee.source = 'manual';
  });
  const calibrations = [
    K.createCalibration(first, 'left'),
    K.createCalibration(second, 'left')
  ];
  const middle = fullFrame(10);
  const manual = fullFrame(12);
  const manualKnee = manual.keypoints.find(p => p.name === 'left_knee');
  manualKnee.x = 999;
  manualKnee.source = 'manual';
  const result = K.applyCalibrations([middle, manual], calibrations, 'left');
  close(result[0].keypoints.find(p => p.name === 'left_knee').x, COORDS.knee[0]);
  assert.equal(result[1].keypoints.find(p => p.name === 'left_knee').x, 999);
  assert.equal(result[1].keypoints.find(p => p.name === 'left_knee').source, 'manual');
});

test('跟骨和足尖偏移使用足部自身长轴', () => {
  const raw = [point('left', 'heel', [0, 0]), point('left', 'foot_index', [100, 0])];
  const reference = {
    frameIndex: 0,
    rawKeypoints: raw,
    keypoints: [
      { ...raw[0], y: 10, source: 'manual' },
      { ...raw[1], x: 110, y: 10, source: 'manual' }
    ]
  };
  const calibration = K.createCalibration(reference, 'left');
  const targetRaw = [point('left', 'heel', [0, 0]), point('left', 'foot_index', [0, 200])];
  const target = { frameIndex: 5, rawKeypoints: targetRaw, keypoints: targetRaw.map(p => ({ ...p })) };
  const result = K.applyCalibrations([target], [calibration], 'left')[0];
  const heel = result.keypoints.find(p => p.name === 'left_heel');
  const toe = result.keypoints.find(p => p.name === 'left_foot_index');
  close(heel.x, -20);
  close(heel.y, 0);
  close(toe.x, -20);
  close(toe.y, 220);
});

test('没有人工修正时拒绝创建空校准', () => {
  assert.throws(() => K.createCalibration(fullFrame(0), 'left'), /请先拖动校正/);
});
