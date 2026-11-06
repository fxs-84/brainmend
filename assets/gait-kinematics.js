(function (global) {
  'use strict';

  var ANGLE_KEYS = ['shoulder', 'elbow', 'hip', 'knee', 'ankle'];
  var PHASES = ['IC', 'LR', 'TSt'];
  var RAD_TO_DEG = 180 / Math.PI;

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function pointMap(keypoints) {
    var map = Object.create(null);
    (Array.isArray(keypoints) ? keypoints : []).forEach(function (point) {
      if (point && typeof point.name === 'string') map[point.name] = point;
    });
    return map;
  }

  function usablePoint(map, name, minScore) {
    var point = map[name];
    if (!point || !finite(point.x) || !finite(point.y)) return null;
    var score = point.score == null ? 1 : point.score;
    if (!finite(score) || score < minScore) return null;
    return point;
  }

  function vector(from, to) {
    if (!from || !to) return null;
    var x = to.x - from.x;
    var y = to.y - from.y;
    if (!finite(x) || !finite(y) || x * x + y * y < 1e-16) return null;
    return { x: x, y: y };
  }

  function vectorAngle(vectorValue, direction) {
    return vectorValue ? Math.atan2(direction * vectorValue.x, vectorValue.y) * RAD_TO_DEG : null;
  }

  function normalizeAngle(value) {
    if (!finite(value)) return null;
    var angle = (value + 180) % 360;
    if (angle < 0) angle += 360;
    return angle - 180;
  }

  function relativeAngle(first, second) {
    if (!finite(first) || !finite(second)) return null;
    return normalizeAngle(first - second);
  }

  function includedAngle(first, second) {
    if (!first || !second) return null;
    var firstLength = Math.hypot(first.x, first.y);
    var secondLength = Math.hypot(second.x, second.y);
    if (!firstLength || !secondLength) return null;
    var cosine = (first.x * second.x + first.y * second.y) / (firstLength * secondLength);
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * RAD_TO_DEG;
  }

  function computeFrameAngles(keypoints, options) {
    options = options || {};
    var side = options.side === 'right' ? 'right' : 'left';
    var direction = options.direction === -1 ? -1 : 1;
    var minScore = finite(options.minScore) ? options.minScore : 0.25;
    var map = pointMap(keypoints);
    function point(name) {
      return usablePoint(map, side + '_' + name, minScore);
    }

    var shoulder = point('shoulder');
    var elbow = point('elbow');
    var wrist = point('wrist');
    var hip = point('hip');
    var knee = point('knee');
    var ankle = point('ankle');
    var heel = point('heel');
    var footIndex = point('foot_index');

    var trunk = vectorAngle(vector(shoulder, hip), direction);
    var upperArm = vectorAngle(vector(shoulder, elbow), direction);
    var forearm = vectorAngle(vector(elbow, wrist), direction);
    var thigh = vectorAngle(vector(hip, knee), direction);
    var shank = vectorAngle(vector(knee, ankle), direction);
    var ankleIncluded = includedAngle(vector(ankle, knee), vector(heel, footIndex));

    return {
      shoulder: relativeAngle(upperArm, trunk),
      elbow: relativeAngle(forearm, upperArm),
      hip: relativeAngle(thigh, trunk),
      knee: relativeAngle(thigh, shank),
      ankle: finite(ankleIncluded) ? 90 - ankleIncluded : null
    };
  }

  var CALIBRATION_BONES = {
    shoulder: ['shoulder', 'hip'],
    elbow: ['shoulder', 'elbow'],
    wrist: ['elbow', 'wrist'],
    hip: ['shoulder', 'hip'],
    knee: ['hip', 'knee'],
    ankle: ['knee', 'ankle'],
    heel: ['heel', 'foot_index'],
    foot_index: ['heel', 'foot_index']
  };

  function calibrationBasis(keypoints, side, part) {
    var map = pointMap(keypoints);
    var bone = CALIBRATION_BONES[part];
    if (!bone) return null;
    var from = usablePoint(map, side + '_' + bone[0], 0);
    var to = usablePoint(map, side + '_' + bone[1], 0);
    var boneVector = vector(from, to);
    if (!boneVector) return null;
    var length = Math.hypot(boneVector.x, boneVector.y);
    var unit = { x: boneVector.x / length, y: boneVector.y / length };
    return {
      length: length,
      unit: unit,
      perpendicular: { x: -unit.y, y: unit.x }
    };
  }

  function createCalibration(frame, side) {
    side = side === 'right' ? 'right' : 'left';
    var raw = frame && Array.isArray(frame.rawKeypoints) ? frame.rawKeypoints : [];
    var current = frame && Array.isArray(frame.keypoints) ? frame.keypoints : [];
    var rawMap = pointMap(raw);
    var corrections = {};
    current.forEach(function (manual) {
      if (!manual || manual.source !== 'manual' || manual.name.indexOf(side + '_') !== 0) return;
      var part = manual.name.slice(side.length + 1);
      var rawPoint = usablePoint(rawMap, manual.name, 0);
      var basis = calibrationBasis(raw, side, part);
      if (!rawPoint || !basis || !finite(manual.x) || !finite(manual.y)) return;
      var dx = manual.x - rawPoint.x;
      var dy = manual.y - rawPoint.y;
      corrections[part] = {
        along: (dx * basis.unit.x + dy * basis.unit.y) / basis.length,
        across: (dx * basis.perpendicular.x + dy * basis.perpendicular.y) / basis.length
      };
    });
    if (!Object.keys(corrections).length) throw new Error('请先拖动校正至少一个解剖点，再设为校准帧');
    return { frameIndex: frame.frameIndex, corrections: corrections };
  }

  function upsertCalibration(calibrations, calibration) {
    var result = (Array.isArray(calibrations) ? calibrations : []).filter(function (item) {
      return item && item.frameIndex !== calibration.frameIndex;
    });
    result.push(calibration);
    return result.sort(function (a, b) { return a.frameIndex - b.frameIndex; });
  }

  function calibrationAt(calibrations, frameIndex, part) {
    var valid = (Array.isArray(calibrations) ? calibrations : []).filter(function (item) {
      return item && item.corrections && item.corrections[part];
    });
    if (!valid.length) return null;
    var before = null;
    var after = null;
    valid.forEach(function (item) {
      if (item.frameIndex <= frameIndex) before = item;
      if (item.frameIndex >= frameIndex && !after) after = item;
    });
    var selected = before || after;
    var correction = selected.corrections[part];
    if (before && after && after.frameIndex > before.frameIndex) {
      var ratio = (frameIndex - before.frameIndex) / (after.frameIndex - before.frameIndex);
      correction = {
        along: before.corrections[part].along + (after.corrections[part].along - before.corrections[part].along) * ratio,
        across: before.corrections[part].across + (after.corrections[part].across - before.corrections[part].across) * ratio
      };
    }
    return { correction: correction, referenceFrame: selected.frameIndex };
  }

  function applyCalibrations(frames, calibrations, side) {
    side = side === 'right' ? 'right' : 'left';
    return (Array.isArray(frames) ? frames : []).map(function (frame) {
      if (!frame || !Array.isArray(frame.rawKeypoints)) return frame;
      var current = Array.isArray(frame.keypoints) ? frame.keypoints : [];
      var map = pointMap(frame.rawKeypoints);
      current.forEach(function (point) {
        if (point && point.source === 'manual') map[point.name] = point;
      });
      var keypoints = Object.keys(map).map(function (name) {
        var point = Object.assign({}, map[name]);
        if (point.source === 'manual' || name.indexOf(side + '_') !== 0) return point;
        var part = name.slice(side.length + 1);
        var selected = calibrationAt(calibrations, frame.frameIndex, part);
        var basis = calibrationBasis(frame.rawKeypoints, side, part);
        if (!selected || !basis) return point;
        var correction = selected.correction;
        point.x += basis.length * (correction.along * basis.unit.x + correction.across * basis.perpendicular.x);
        point.y += basis.length * (correction.along * basis.unit.y + correction.across * basis.perpendicular.y);
        point.source = 'calibrated';
        point.calibrationFrame = selected.referenceFrame;
        return point;
      });
      return Object.assign({}, frame, { keypoints: keypoints });
    });
  }

  function invalid(reason) {
    return { valid: false, reason: reason };
  }

  function validateCycle(view, cycle) {
    if (!cycle || cycle.confirmed !== true) return invalid('not-confirmed');
    if (!view || !Array.isArray(view.frames)) return invalid('missing-frames');
    var framesByIndex = new Map();
    view.frames.forEach(function (frame) {
      if (frame && finite(frame.frameIndex)) framesByIndex.set(frame.frameIndex, frame);
    });
    if (!cycle.phases || typeof cycle.phases !== 'object') return invalid('missing-phases');

    var previousFrameIndex = -Infinity;
    var previousTime = -Infinity;
    for (var i = 0; i < PHASES.length; i++) {
      var name = PHASES[i];
      var range = cycle.phases[name];
      if (!range || typeof range !== 'object') return invalid('missing-phase-range-' + name);
      if (!Number.isInteger(range.representativeFrame) || !framesByIndex.has(range.representativeFrame)) {
        return invalid('invalid-phase-frame-' + name);
      }
      if (range.representativeFrame <= previousFrameIndex) return invalid('phase-order-' + name);
      var frame = framesByIndex.get(range.representativeFrame);
      if (!finite(frame.t) || frame.t <= previousTime) return invalid('non-increasing-time');
      previousFrameIndex = range.representativeFrame;
      previousTime = frame.t;
    }
    return { valid: true, reason: null };
  }

  function frameSources(keypoints) {
    var sources = {};
    (Array.isArray(keypoints) ? keypoints : []).forEach(function (point) {
      if (!point || typeof point.name !== 'string') return;
      sources[point.name] = {
        score: finite(point.score) ? point.score : null,
        source: point.source == null ? 'raw' : String(point.source)
      };
    });
    return sources;
  }

  function computeViewSeries(view, cycle) {
    if (!view || !Array.isArray(view.frames) || !cycle || cycle.confirmed !== true) return [];
    var side = view.side === 'right' ? 'right' : 'left';
    var direction = view.direction === -1 ? -1 : 1;
    var options = { side: side, direction: direction, minScore: view.minScore };
    var framesByIndex = new Map();
    view.frames.forEach(function (frame) {
      if (frame && finite(frame.frameIndex)) framesByIndex.set(frame.frameIndex, frame);
    });
    return PHASES.map(function (phase) {
      var range = cycle.phases && cycle.phases[phase];
      var frame = range && framesByIndex.get(range.representativeFrame);
      if (!frame) return null;
      return {
        frameIndex: frame.frameIndex,
        time: frame.t,
        cycleId: cycle.id,
        phase: phase,
        angles: computeFrameAngles(frame.keypoints, options),
        sources: frameSources(frame.keypoints)
      };
    }).filter(Boolean);
  }

  function emptyAngleArrays(bins) {
    var result = {};
    ANGLE_KEYS.forEach(function (key) { result[key] = new Array(bins).fill(null); });
    return result;
  }

  function normalizeSeries(series, bins) {
    bins = bins == null ? 101 : bins;
    if (!Number.isInteger(bins) || bins < 2) throw new RangeError('bins must be an integer >= 2');
    var normalized = emptyAngleArrays(bins);
    var samples = (Array.isArray(series) ? series : []).filter(function (frame) {
      return frame && finite(frame.time);
    }).sort(function (a, b) { return a.time - b.time; });
    if (!samples.length) return normalized;
    var start = samples[0].time;
    var duration = samples[samples.length - 1].time - start;
    if (!(duration > 0)) return normalized;

    ANGLE_KEYS.forEach(function (key) {
      var valid = [];
      samples.forEach(function (frame, index) {
        var value = frame.angles && frame.angles[key];
        if (finite(value)) valid.push({ index: index, time: frame.time, value: value });
      });
      for (var bin = 0; bin < bins; bin++) {
        var target = start + duration * bin / (bins - 1);
        var before = null;
        var after = null;
        for (var i = 0; i < valid.length; i++) {
          if (valid[i].time <= target) before = valid[i];
          if (valid[i].time >= target) { after = valid[i]; break; }
        }
        if (before && Math.abs(before.time - target) <= duration * 1e-12) {
          normalized[key][bin] = before.value;
        } else if (after && Math.abs(after.time - target) <= duration * 1e-12) {
          normalized[key][bin] = after.value;
        } else if (before && after && after.index - before.index === 1 && after.time > before.time) {
          var ratio = (target - before.time) / (after.time - before.time);
          normalized[key][bin] = before.value + (after.value - before.value) * ratio;
        }
      }
    });
    return normalized;
  }

  function mean(values) {
    var valid = values.filter(finite);
    if (!valid.length) return null;
    return valid.reduce(function (sum, value) { return sum + value; }, 0) / valid.length;
  }

  function buildPhaseTable(cycles) {
    var table = {};
    PHASES.forEach(function (phase) {
      table[phase] = {};
      ANGLE_KEYS.forEach(function (key) {
        var values = cycles.map(function (cycle) {
          var marked = cycle.series.find(function (frame) {
            return frame.frameIndex === cycle.phases[phase].representativeFrame;
          });
          return marked ? marked.angles[key] : null;
        });
        table[phase][key] = { values: values, mean: mean(values) };
      });
    });
    return table;
  }

  function buildSummary(cycles) {
    var summary = {};
    ANGLE_KEYS.forEach(function (key) {
      var samples = [];
      cycles.forEach(function (cycle) {
        cycle.series.forEach(function (frame) {
          var value = frame.angles[key];
          if (finite(value)) samples.push({ value: value, frame: frame, cycleId: cycle.id });
        });
      });
      var flexion = null;
      var extension = null;
      samples.forEach(function (sample) {
        if (!flexion || sample.value > flexion.value) flexion = sample;
        if (!extension || sample.value < extension.value) extension = sample;
      });
      summary[key] = {
        maxFlexion: flexion ? flexion.value : null,
        maxExtension: extension ? extension.value : null,
        rom: flexion && extension ? flexion.value - extension.value : null,
        maxFlexionPhase: flexion ? flexion.frame.phase : null,
        maxExtensionPhase: extension ? extension.frame.phase : null,
        maxFlexionFrame: flexion ? flexion.frame.frameIndex : null,
        maxExtensionFrame: extension ? extension.frame.frameIndex : null,
        maxFlexionTime: flexion ? flexion.frame.time : null,
        maxExtensionTime: extension ? extension.frame.time : null,
        maxFlexionCycleId: flexion ? flexion.cycleId : null,
        maxExtensionCycleId: extension ? extension.cycleId : null,
        sampleCount: samples.length
      };
    });
    return summary;
  }

  function emptyViewReport(side) {
    return {
      side: side,
      cycleCount: 0,
      cycles: [],
      phaseTable: buildPhaseTable([]),
      summary: buildSummary([]),
      frames: []
    };
  }

  function buildConfirmedReport(session) {
    session = session || {};
    var report = {
      schemaVersion: 2,
      type: 'gait-confirmed-report',
      timestamp: new Date().toISOString(),
      protocol: session.protocol && typeof session.protocol === 'object' ? JSON.parse(JSON.stringify(session.protocol)) : null,
      patientInfo: session.patientInfo == null ? null : session.patientInfo,
      views: {},
      canExport: false,
      missing: [],
      excludedCycles: []
    };
    ['left', 'right'].forEach(function (side) {
      var view = session.views && session.views[side] ? session.views[side] : { side: side, confirmedCycles: [] };
      var viewReport = emptyViewReport(side);
      var confirmedCycles = Array.isArray(view.confirmedCycles) ? view.confirmedCycles : [];
      confirmedCycles.forEach(function (cycle) {
        var validation = validateCycle(view, cycle);
        if (!validation.valid) {
          report.excludedCycles.push({ side: side, cycleId: cycle && cycle.id, reason: validation.reason });
          return;
        }
        var series = computeViewSeries(view, cycle);
        var hasValidAngle = series.some(function (frame) {
          return ANGLE_KEYS.some(function (key) { return finite(frame.angles[key]); });
        });
        if (!hasValidAngle) {
          report.excludedCycles.push({ side: side, cycleId: cycle.id, reason: 'no-valid-angles' });
          return;
        }
        var savedCycle = {
          id: cycle.id,
          side: side,
          phases: cycle.phases,
          series: series
        };
        viewReport.cycles.push(savedCycle);
        series.forEach(function (frame) {
          viewReport.frames.push(Object.assign({ side: side }, frame));
        });
      });
      viewReport.cycleCount = viewReport.cycles.length;
      viewReport.phaseTable = buildPhaseTable(viewReport.cycles);
      viewReport.summary = buildSummary(viewReport.cycles);
      report.views[side] = viewReport;
      if (!viewReport.cycleCount) report.missing.push(side);
    });
    report.canExport = report.missing.length === 0;
    return report;
  }

  function csvEscape(value) {
    if (value == null) return '';
    var text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function buildCSV(report) {
    var headers = ['side', 'frameIndex', 'time', 'cycleId', 'phase'].concat(ANGLE_KEYS, ['quality', 'correctionSource']);
    var rows = [headers.map(csvEscape).join(',')];
    ['left', 'right'].forEach(function (side) {
      var frames = report && report.views && report.views[side] && Array.isArray(report.views[side].frames)
        ? report.views[side].frames : [];
      frames.forEach(function (frame) {
        var quality = {};
        var correctionSource = {};
        Object.keys(frame.sources || {}).forEach(function (name) {
          quality[name] = frame.sources[name].score;
          correctionSource[name] = frame.sources[name].source;
        });
        var row = [side, frame.frameIndex, frame.time, frame.cycleId, frame.phase];
        ANGLE_KEYS.forEach(function (key) { row.push(frame.angles && frame.angles[key]); });
        row.push(JSON.stringify(quality), JSON.stringify(correctionSource));
        rows.push(row.map(csvEscape).join(','));
      });
    });
    return rows.join('\n');
  }

  function invalidateCycles(view, frameIndex) {
    var affected = [];
    if (!view || !Array.isArray(view.confirmedCycles) || !finite(frameIndex)) return affected;
    view.confirmedCycles.forEach(function (cycle) {
      if (!cycle || cycle.confirmed !== true || !cycle.phases) return;
      var isRepresentative = PHASES.some(function (phase) {
        return cycle.phases[phase] && cycle.phases[phase].representativeFrame === frameIndex;
      });
      if (isRepresentative) {
        cycle.confirmed = false;
        affected.push(cycle.id);
      }
    });
    return affected;
  }

  global.__gaitKinematics = {
    ANGLE_KEYS: ANGLE_KEYS,
    PHASES: PHASES,
    computeFrameAngles: computeFrameAngles,
    validateCycle: validateCycle,
    computeViewSeries: computeViewSeries,
    normalizeSeries: normalizeSeries,
    buildConfirmedReport: buildConfirmedReport,
    buildCSV: buildCSV,
    invalidateCycles: invalidateCycles,
    createCalibration: createCalibration,
    upsertCalibration: upsertCalibration,
    applyCalibrations: applyCalibrations
  };
})(typeof window !== 'undefined' ? window : globalThis);
