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

function points(side, shoulderX = 100) {
  const values = {
    shoulder: [shoulderX, 100], elbow: [100, 200], wrist: [100, 300],
    hip: [100, 200], knee: [100, 300], ankle: [100, 400],
    heel: [100, 400], foot_index: [150, 400]
  };
  return Object.entries(values).map(([name, [x, y]]) => ({
    name: `${side}_${name}`, x, y, score: 0.9,
    source: name === 'wrist' ? 'manual," corrected' : 'raw'
  }));
}

function makePhases() {
  return Object.fromEntries(K.PHASES.map((name, index) => [name, {
    startFrame: index, endFrame: index, representativeFrame: index
  }]));
}

function cycle(id = 'cycle,"1"', confirmed = true) {
  return {
    id, startFrame: 0, endFrame: 8, confirmed,
    phases: makePhases()
  };
}

function view(side) {
  return {
    side, direction: 1,
    frames: Array.from({ length: 9 }, (_, i) => ({ frameIndex: i, t: i / 10, keypoints: points(side) })),
    confirmedCycles: [cycle()]
  };
}

function session() {
  return {
    schemaVersion: 2,
    protocol: { mode: 'treadmill', speedKmh: 5 },
    patientInfo: { name: '测试,患者' },
    views: { left: view('left'), right: view('right') }
  };
}

test('报告只纳入有效确认周期并保留原始及归一化曲线', () => {
  const input = session();
  input.views.left.confirmedCycles.push(cycle('unconfirmed', false));
  input.views.left.confirmedCycles.push({ ...cycle('bad-phase'), phases: { ...cycle().phases, IC: 1 } });
  const report = K.buildConfirmedReport(input);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.type, 'gait-confirmed-report');
  assert.equal(typeof report.timestamp, 'string');
  assert.deepEqual(report.protocol, input.protocol);
  assert.deepEqual(report.patientInfo, input.patientInfo);
  assert.equal(report.canExport, true);
  assert.deepEqual(report.missing, []);
  assert.equal(report.views.left.cycleCount, 1);
  assert.equal(report.views.right.cycleCount, 1);
  assert.deepEqual(report.excludedCycles.map(c => c.cycleId).sort(), ['bad-phase', 'unconfirmed']);
  const saved = report.views.left.cycles[0];
  assert.equal(saved.series.length, 9);
  assert.equal(saved.normalized.shoulder.length, 101);
  assert.equal(report.views.left.frames.length, 9);
  assert.equal(report.views.left.frames[0].side, 'left');
  assert.equal(report.views.left.phaseTable.IC.shoulder.values.length, 1);
  assert.equal(report.views.left.phaseTable.IC.shoulder.mean, 0);
  assert.equal(report.views.left.summary.shoulder.maxFlexion, 0);
  assert.equal(report.views.left.summary.shoulder.maxExtension, 0);
  assert.equal(report.views.left.summary.shoulder.rom, 0);
});

test('时相表读取人工标记帧角度而不是后续区间均值', () => {
  const input = session();
  input.views.left.frames[1].keypoints.find(point => point.name === 'left_wrist').x = 200;
  input.views.left.frames[1].keypoints.find(point => point.name === 'left_wrist').y = 200;
  input.views.left.frames[2].keypoints.find(point => point.name === 'left_wrist').x = 0;
  input.views.left.frames[2].keypoints.find(point => point.name === 'left_wrist').y = 200;
  const report = K.buildConfirmedReport(input);
  assert.equal(report.views.left.phaseTable.LR.elbow.mean, 90);
  assert.equal(report.views.left.phaseTable.MSt.elbow.mean, -90);
});

test('缺失角度不按零统计，极值带有时相和周期信息', () => {
  const input = session();
  input.views.left.frames[0].keypoints = input.views.left.frames[0].keypoints.filter(p => p.name !== 'left_wrist');
  input.views.left.frames[1].keypoints.find(p => p.name === 'left_wrist').x = 200;
  input.views.left.frames[1].keypoints.find(p => p.name === 'left_wrist').y = 200;
  input.views.right.frames.forEach(frame => {
    frame.keypoints = frame.keypoints.filter(p => !p.name.endsWith('_wrist'));
  });
  const report = K.buildConfirmedReport(input);
  const elbow = report.views.left.summary.elbow;
  assert.equal(elbow.maxFlexion, 90);
  assert.equal(elbow.maxExtension, 0);
  assert.equal(elbow.rom, 90);
  assert.equal(elbow.maxFlexionPhase, 'LR');
  assert.equal(elbow.maxFlexionCycleId, 'cycle,"1"');
  assert.equal(report.views.left.phaseTable.IC.elbow.mean, null);
  assert.equal(report.views.left.phaseTable.LR.elbow.mean, 90);
  assert.equal(report.views.right.summary.elbow.maxFlexion, null);
  assert.equal(report.views.right.summary.elbow.rom, null);
});

test('全空角度周期被排除且不能解除双侧门控', () => {
  const input = session();
  input.views.right.frames.forEach(frame => { frame.keypoints = []; });
  const report = K.buildConfirmedReport(input);
  assert.equal(report.canExport, false);
  assert.deepEqual(report.missing, ['right']);
  assert.equal(report.views.right.cycleCount, 0);
  assert.equal(report.views.right.frames.length, 0);
  assert.ok(report.excludedCycles.some(item => item.side === 'right' && item.reason === 'no-valid-angles'));
});

test('双侧门控和缺侧信息明确，无效周期不能解除门控', () => {
  const input = session();
  input.views.right.confirmedCycles = [cycle('bad', false)];
  const report = K.buildConfirmedReport(input);
  assert.equal(report.canExport, false);
  assert.deepEqual(report.missing, ['right']);
  assert.equal(report.views.right.cycleCount, 0);
  assert.equal(report.views.right.frames.length, 0);
});

function parseCSVRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (line[i] === ',' && !quoted) {
      cells.push(cell); cell = '';
    } else cell += line[i];
  }
  cells.push(cell);
  return cells;
}

test('CSV 含原帧、质量及修正来源并正确转义', () => {
  const report = K.buildConfirmedReport(session());
  const csv = K.buildCSV(report);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'side,frameIndex,time,cycleId,phase,shoulder,elbow,hip,knee,ankle,quality,correctionSource');
  assert.equal(lines.length, 19);
  assert.ok(lines[1].startsWith('left,0,0,"cycle,""1""",IC,'));
  const cells = parseCSVRow(lines[1]);
  assert.equal(cells.length, 12);
  assert.equal(cells[3], 'cycle,"1"');
  assert.equal(JSON.parse(cells[10]).left_wrist, 0.9);
  assert.equal(JSON.parse(cells[11]).left_wrist, 'manual," corrected');
  assert.ok(!lines[1].includes('undefined'));
});

test('修改帧使覆盖该帧的已确认周期失效并返回 id', () => {
  const gaitView = view('left');
  gaitView.confirmedCycles.push(cycle('outside'));
  gaitView.confirmedCycles[1].startFrame = 3;
  gaitView.confirmedCycles[1].endFrame = 4;
  gaitView.confirmedCycles.push(cycle('already-invalid', false));
  const affected = K.invalidateCycles(gaitView, 1);
  assert.deepEqual(affected, ['cycle,"1"']);
  assert.equal(gaitView.confirmedCycles[0].confirmed, false);
  assert.equal(gaitView.confirmedCycles[1].confirmed, true);
  assert.deepEqual(K.invalidateCycles(gaitView, 1), []);
});
