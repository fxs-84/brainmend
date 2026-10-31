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
  const phases = {};
  K.PHASES.forEach((name, index) => {
    phases[name] = { startFrame: index * 2, endFrame: index * 2 + 1, representativeFrame: index * 2 + 1 };
  });
  return phases;
}

function makeCycle(overrides = {}) {
  return { id: 'range-cycle', startFrame: 0, endFrame: 16, confirmed: true, phases: makePhases(), ...overrides };
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
        { name: `${side}_foot_index`, x: 150, y: 400, score: 0.95 }
      ]
    })),
    confirmedCycles: [makeCycle()]
  };
}

test('每个时相必须是连续区间且代表帧位于区间内', () => {
  const view = makeView();
  assert.deepEqual(K.validateCycle(view, makeCycle()), { valid: true, reason: null });
  const gap = makePhases();
  gap.MSt.startFrame = 5;
  assert.equal(K.validateCycle(view, makeCycle({ phases: gap })).reason, 'phase-range-gap-MSt');
  const overlap = makePhases();
  overlap.MSt.startFrame = 3;
  assert.equal(K.validateCycle(view, makeCycle({ phases: overlap })).reason, 'phase-range-overlap-MSt');
  const badRepresentative = makePhases();
  badRepresentative.PSw.representativeFrame = 1;
  assert.equal(K.validateCycle(view, makeCycle({ phases: badRepresentative })).reason, 'phase-representative-out-of-range-PSw');
});

test('逐帧归属按连续区间而不是代表帧阈值', () => {
  const series = K.computeViewSeries(makeView(), makeCycle());
  assert.equal(series.length, 17);
  K.PHASES.forEach((name, index) => {
    assert.equal(series[index * 2].phase, name);
    assert.equal(series[index * 2 + 1].phase, name);
  });
  assert.equal(series[16].phase, null, '下一次IC不属于本周期的TSw');
});

test('时相角度读取代表帧而不是整个区间的平均值', () => {
  const session = { schemaVersion: 2, views: { left: makeView('left'), right: makeView('right') } };
  const report = K.buildConfirmedReport(session);
  const view = makeView();
  const series = K.computeViewSeries(view, makeCycle());
  K.PHASES.forEach(name => {
    const representative = series[makePhases()[name].representativeFrame].angles.elbow;
    const intervalMean = series.filter(frame => frame.phase === name).reduce((sum, frame) => sum + frame.angles.elbow, 0) / 2;
    assert.equal(report.views.left.phaseTable[name].elbow.mean, representative);
    assert.notEqual(report.views.left.phaseTable[name].elbow.mean, intervalMean);
  });
});
