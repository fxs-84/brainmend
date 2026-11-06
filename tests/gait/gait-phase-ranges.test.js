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

function makePhases() {
  return {
    IC: { representativeFrame: 0 },
    LR: { representativeFrame: 5 },
    TSt: { representativeFrame: 11 }
  };
}

function makeCycle(overrides = {}) {
  return { id: 'three-frame-cycle', confirmed: true, phases: makePhases(), ...overrides };
}

function makeView(side = 'left') {
  return {
    side,
    direction: 1,
    frames: Array.from({ length: 17 }, (_, frameIndex) => ({
      frameIndex,
      t: frameIndex / 30,
      keypoints: [
        { name: `${side}_shoulder`, x: 100, y: 100, score: 0.95 },
        { name: `${side}_elbow`, x: 100, y: 200, score: 0.95 },
        { name: `${side}_wrist`, x: 100 + frameIndex * 5, y: 300, score: 0.95 },
        { name: `${side}_hip`, x: 100, y: 200, score: 0.95 },
        { name: `${side}_knee`, x: 100, y: 300, score: 0.95 },
        { name: `${side}_ankle`, x: 100, y: 400, score: 0.95 },
        { name: `${side}_heel`, x: 100, y: 400, score: 0.95 },
        { name: `${side}_foot_index`, x: 150, y: 400, score: 0.95 }
      ]
    })),
    confirmedCycles: [makeCycle()]
  };
}

test('无需起止帧，只校验三个代表帧存在且顺序正确', () => {
  const view = makeView();
  assert.deepEqual(K.validateCycle(view, makeCycle()), { valid: true, reason: null });
  const missing = makePhases();
  delete missing.TSt;
  assert.equal(K.validateCycle(view, makeCycle({ phases: missing })).reason, 'missing-phase-range-TSt');
  const outside = makePhases();
  outside.IC.representativeFrame = 17;
  assert.equal(K.validateCycle(view, makeCycle({ phases: outside })).reason, 'invalid-phase-frame-IC');
  const absent = makePhases();
  const missingFrameView = makeView();
  missingFrameView.frames.splice(5, 1);
  assert.equal(K.validateCycle(missingFrameView, makeCycle({ phases: absent })).reason, 'invalid-phase-frame-LR');
  const duplicate = makePhases();
  duplicate.LR.representativeFrame = 0;
  assert.equal(K.validateCycle(view, makeCycle({ phases: duplicate })).reason, 'phase-order-LR');
  const reversed = makePhases();
  reversed.TSt.representativeFrame = 4;
  assert.equal(K.validateCycle(view, makeCycle({ phases: reversed })).reason, 'phase-order-TSt');
});

test('逐帧序列只包含三个人工代表帧', () => {
  const series = K.computeViewSeries(makeView(), makeCycle());
  assert.equal(series.length, 3);
  assert.deepEqual(series.map(frame => frame.phase), ['IC', 'LR', 'TSt']);
  assert.deepEqual(series.map(frame => frame.frameIndex), [0, 5, 11]);
});

test('时相角度直接读取代表帧而不是其他帧或区间均值', () => {
  const session = { schemaVersion: 2, views: { left: makeView('left'), right: makeView('right') } };
  const report = K.buildConfirmedReport(session);
  const series = K.computeViewSeries(makeView(), makeCycle());
  K.PHASES.forEach((name, index) => {
    assert.equal(report.views.left.phaseTable[name].elbow.mean, series[index].angles.elbow);
  });
});
