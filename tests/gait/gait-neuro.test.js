import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let N;

before(async () => {
  globalThis.window = globalThis;
  const modPath = path.join(ROOT, 'assets', 'gait-neuro.js').split(path.sep).join('/').replace(/^\/+/, '');
  await import('file:///' + modPath);
  N = globalThis.__gaitNeuro;
  assert.ok(N, 'window.__gaitNeuro 应已挂载');
});

function makeReport(speedKmh = 5) {
  const view = {
    summary: {
      shoulder: { maxFlexion: 8, maxExtension: -22 },
      elbow: { maxFlexion: 18 },
      hip: { maxFlexion: 20, maxExtension: -20 },
      knee: {}, ankle: {}
    },
    phaseTable: {
      IC: { knee: { mean: 0 }, ankle: { mean: 0 } },
      LR: { knee: { mean: 99 } }
    },
    cycles: [{
      series: [12, 16, 18].map((angle, index) => ({
        frameIndex: index + 2,
        phase: 'LR',
        angles: { knee: angle }
      })).concat([{ frameIndex: 40, phase: 'TSw', angles: { knee: 55 } }])
    }]
  };
  return {
    protocol: speedKmh == null ? null : { mode: 'treadmill', speedKmh },
    views: { left: view, right: structuredClone(view) }
  };
}

function observation(result, side, key) {
  return result.sides[side].observations.find(item => item.key === key);
}

test('5 km/h 使用课程参考并正确转换伸展角与解剖膝伸位', () => {
  const result = N.buildNeuroInterpretation(makeReport());
  assert.equal(result.version, 'course-neuro-v1');
  assert.equal(result.protocol.speedKmh, 5);
  assert.equal(result.referenceStatus, 'course-provided');
  assert.equal(observation(result, 'left', 'shoulderFlexion').value, 8);
  assert.equal(observation(result, 'left', 'shoulderExtension').value, 22);
  assert.equal(observation(result, 'left', 'shoulderExtension').status, 'within');
  assert.equal(observation(result, 'left', 'hipExtension').value, 20);
  assert.equal(observation(result, 'left', 'icKneeExtension').value, 180);
  assert.equal(observation(result, 'left', 'lrKneeFlexion').value, 18);
  assert.equal(observation(result, 'left', 'lrKneeFlexion').status, 'within');
  assert.equal(observation(result, 'left', 'icAnkle').value, 0);
  assert.equal(result.references.length >= 3, true);
  assert.ok(result.references.every(item => /^https:\/\//.test(item.url)));
});

test('肩伸课程参考下界为18°', () => {
  const input = makeReport();
  input.views.left.summary.shoulder.maxExtension = -18;
  const result = N.buildNeuroInterpretation(input);
  assert.equal(observation(result, 'left', 'shoulderExtension').value, 18);
  assert.equal(observation(result, 'left', 'shoulderExtension').status, 'within');
  assert.equal(observation(result, 'left', 'shoulderExtension').referenceText, '18–24°');
});

test('课程参考偏离分别判断，双侧大幅摆臂只生成补偿机制提示', () => {
  const input = makeReport();
  input.views.left.summary.shoulder = { maxFlexion: 32, maxExtension: -34 };
  input.views.left.summary.elbow = { maxFlexion: 24 };
  input.views.left.summary.hip = { maxFlexion: 19, maxExtension: -18 };
  input.views.left.phaseTable.IC.knee.mean = 6;
  input.views.left.phaseTable.IC.ankle.mean = -4;
  input.views.left.cycles[0].series[1].angles.knee = 8;
  input.views.left.cycles[0].series[2].angles.knee = 8;
  const result = N.buildNeuroInterpretation(input);
  assert.equal(observation(result, 'left', 'shoulderFlexion').status, 'above');
  assert.equal(observation(result, 'left', 'shoulderExtension').status, 'above');
  assert.equal(observation(result, 'left', 'elbowFlexion').status, 'above');
  assert.equal(observation(result, 'left', 'hipFlexion').status, 'below');
  assert.equal(observation(result, 'left', 'hipExtension').status, 'below');
  assert.equal(observation(result, 'left', 'icKneeExtension').value, 174);
  assert.equal(observation(result, 'left', 'icKneeExtension').status, 'below');
  assert.equal(observation(result, 'left', 'lrKneeFlexion').value, 12);
  assert.equal(observation(result, 'left', 'icAnkle').status, 'below');
  assert.match(result.sides.left.notes[0], /30°/);
  assert.match(result.sides.left.notes[0], /稳定|补偿/);
});

test('5.5 km/h 单独记录且不套用 5 km/h 阈值', () => {
  const result = N.buildNeuroInterpretation(makeReport(5.5));
  assert.equal(result.protocol.speedKmh, 5.5);
  assert.equal(result.referenceStatus, 'pending');
  assert.equal(observation(result, 'left', 'shoulderFlexion').value, 8);
  for (const side of ['left', 'right']) {
    assert.ok(result.sides[side].observations.every(item => item.status === 'pending'));
    assert.ok(result.sides[side].observations.every(item => item.referenceText === '该速度课程参考待补充'));
  }
});

test('未记录速度或缺失角度时不补零、不判断偏离', () => {
  const input = makeReport(null);
  input.views.left.summary.shoulder.maxFlexion = null;
  input.views.left.phaseTable.IC.knee.mean = null;
  input.views.left.cycles = [];
  const result = N.buildNeuroInterpretation(input);
  assert.equal(result.protocol.speedKmh, null);
  assert.equal(result.referenceStatus, 'unrecorded');
  assert.equal(observation(result, 'left', 'shoulderFlexion').value, null);
  assert.equal(observation(result, 'left', 'shoulderFlexion').status, 'missing');
  assert.equal(observation(result, 'left', 'icKneeExtension').status, 'missing');
  assert.equal(observation(result, 'left', 'lrKneeFlexion').value, null);
  assert.equal(observation(result, 'left', 'lrKneeFlexion').status, 'missing');
  assert.equal(observation(result, 'right', 'lrKneeFlexion').status, 'unrecorded');
});

test('未出现实际后伸方向时，伸展幅度显示为0而不是负值', () => {
  const input = makeReport();
  input.views.left.summary.shoulder.maxExtension = 2;
  input.views.left.summary.hip.maxExtension = 3;
  const result = N.buildNeuroInterpretation(input);
  assert.equal(observation(result, 'left', 'shoulderExtension').value, 0);
  assert.equal(observation(result, 'left', 'shoulderExtension').displayValue, '0.0°');
  assert.equal(observation(result, 'left', 'shoulderExtension').status, 'below');
  assert.equal(observation(result, 'left', 'hipExtension').value, 0);
  assert.equal(observation(result, 'right', 'shoulderExtension').value, 22);
});

test('未出现实际屈曲方向时，屈曲幅度同样不显示为负值', () => {
  const input = makeReport();
  input.views.left.summary.shoulder.maxFlexion = -4;
  input.views.left.summary.hip.maxFlexion = -2;
  input.views.left.summary.elbow.maxFlexion = -3;
  const result = N.buildNeuroInterpretation(input);
  assert.equal(observation(result, 'left', 'shoulderFlexion').value, 0);
  assert.equal(observation(result, 'left', 'hipFlexion').value, 0);
  assert.equal(observation(result, 'left', 'elbowFlexion').value, 0);
});

test('神经解释不输出确定性脑区、人格或情绪标签', () => {
  const text = JSON.stringify(N.buildNeuroInterpretation(makeReport()));
  for (const forbidden of ['左脑不好', '右脑不好', '大脑皮层功能不足', '完美主义', '焦虑', '愤怒', '确诊']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.match(text, /小脑/);
  assert.match(text, /基底节/);
  assert.match(text, /前庭/);
});
