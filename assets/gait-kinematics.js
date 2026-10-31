(function (global) {
  'use strict';

  var ANGLE_KEYS = ['shoulder', 'elbow', 'hip', 'knee', 'ankle'];
  var PHASES = ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];
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
    var footIndex = point('foot_index');

    var trunk = vectorAngle(vector(shoulder, hip), direction);
    var upperArm = vectorAngle(vector(shoulder, elbow), direction);
    var forearm = vectorAngle(vector(elbow, wrist), direction);
    var thigh = vectorAngle(vector(hip, knee), direction);
    var shank = vectorAngle(vector(knee, ankle), direction);
    var ankleIncluded = includedAngle(vector(ankle, knee), vector(ankle, footIndex));

    return {
      shoulder: relativeAngle(upperArm, trunk),
      elbow: relativeAngle(forearm, upperArm),
      hip: relativeAngle(thigh, trunk),
      knee: relativeAngle(thigh, shank),
      ankle: finite(ankleIncluded) ? 90 - ankleIncluded : null
    };
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
    if (!Number.isInteger(cycle.startFrame) || !framesByIndex.has(cycle.startFrame)) {
      return invalid('invalid-start-frame');
    }
    if (!Number.isInteger(cycle.endFrame) || !framesByIndex.has(cycle.endFrame)) {
      return invalid('invalid-end-frame');
    }
    if (cycle.endFrame <= cycle.startFrame) return invalid('invalid-frame-range');
    if (!cycle.phases || typeof cycle.phases !== 'object') return invalid('missing-phases');

    var previousEnd = null;
    for (var i = 0; i < PHASES.length; i++) {
      var name = PHASES[i];
      var range = cycle.phases[name];
      if (!range || typeof range !== 'object') return invalid('missing-phase-range-' + name);
      if (!Number.isInteger(range.startFrame) || !framesByIndex.has(range.startFrame) ||
          !Number.isInteger(range.endFrame) || !framesByIndex.has(range.endFrame) ||
          !Number.isInteger(range.representativeFrame) || !framesByIndex.has(range.representativeFrame)) {
        return invalid('invalid-phase-frame-' + name);
      }
      if (range.startFrame < cycle.startFrame || range.endFrame >= cycle.endFrame || range.startFrame > range.endFrame) {
        return invalid('phase-out-of-range-' + name);
      }
      if (range.representativeFrame < range.startFrame || range.representativeFrame > range.endFrame) {
        return invalid('phase-representative-out-of-range-' + name);
      }
      if (i === 0 && range.startFrame !== cycle.startFrame) return invalid('ic-not-at-start');
      if (previousEnd !== null) {
        if (range.startFrame > previousEnd + 1) return invalid('phase-range-gap-' + name);
        if (range.startFrame < previousEnd + 1) return invalid('phase-range-overlap-' + name);
      }
      previousEnd = range.endFrame;
    }
    if (previousEnd !== cycle.endFrame - 1) return invalid('phase-range-end-TSw');

    var cycleFrames = view.frames.filter(function (frame) {
      return frame && frame.frameIndex >= cycle.startFrame && frame.frameIndex <= cycle.endFrame;
    }).sort(function (a, b) { return a.frameIndex - b.frameIndex; });
    var previousTime = -Infinity;
    for (var j = 0; j < cycleFrames.length; j++) {
      if (!finite(cycleFrames[j].t) || cycleFrames[j].t <= previousTime) return invalid('non-increasing-time');
      previousTime = cycleFrames[j].t;
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
    return view.frames.filter(function (frame) {
      return frame && frame.frameIndex >= cycle.startFrame && frame.frameIndex <= cycle.endFrame;
    }).sort(function (a, b) {
      return a.frameIndex - b.frameIndex;
    }).map(function (frame) {
      var phase = null;
      PHASES.forEach(function (name) {
        var range = cycle.phases && cycle.phases[name];
        if (range && frame.frameIndex >= range.startFrame && frame.frameIndex <= range.endFrame) phase = name;
      });
      return {
        frameIndex: frame.frameIndex,
        time: frame.t,
        cycleId: cycle.id,
        phase: phase,
        angles: computeFrameAngles(frame.keypoints, options),
        sources: frameSources(frame.keypoints)
      };
    });
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
      var normalizedMean = new Array(101).fill(null);
      if (cycles.length) {
        for (var bin = 0; bin < 101; bin++) {
          normalizedMean[bin] = mean(cycles.map(function (cycle) {
            return cycle.normalized[key][bin];
          }));
        }
      }
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
        sampleCount: samples.length,
        normalizedMean: normalizedMean
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
          startFrame: cycle.startFrame,
          endFrame: cycle.endFrame,
          phases: cycle.phases,
          series: series,
          normalized: normalizeSeries(series)
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
      if (cycle && cycle.confirmed === true && frameIndex >= cycle.startFrame && frameIndex <= cycle.endFrame) {
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
    invalidateCycles: invalidateCycles
  };
})(typeof window !== 'undefined' ? window : globalThis);
