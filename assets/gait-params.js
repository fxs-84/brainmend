/* global window */
/**
 * gait-params.js — 步态分析纯计算引擎
 * 零 DOM 依赖，可在 Node.js 环境单测，所有函数挂载在 window.__gaitParams
 *
 * 事件检测主流程 (v3):
 *   detectGaitEvents (Zeni et al. 2008 骨盆相对坐标法) 为主路径:
 *     HS = heel_rel 局部极大值 (真实脚跟触地 IC), TO = toe_rel 局部极小值
 *   旧 Y 轨迹法 detectHeelStrikes/detectToeOffs 保留为 fallback
 *     (usedMethod='none' 时启用, 如原地站立/骨盆轨迹无效)
 *
 * 数据约定:
 *  - Frame: { t:秒, keypoints: [{x, y, score, name}, ...] }  (COCO 17点 + MediaPipe 33点足部)
 *  - Pose.keypoint 名称: nose, left_eye, right_eye, left_ear, right_ear,
 *                       left_shoulder, right_shoulder, left_elbow, right_elbow,
 *                       left_wrist, right_wrist, left_hip, right_hip,
 *                       left_knee, right_knee, left_ankle, right_ankle,
 *                       left_heel, right_heel, left_foot_index, right_foot_index
 *  - 坐标系: 图像坐标, y 向下, x 向右
 *  - Calibration scale: m/px (米每像素), 1米标尺 = 1.0 / pixel_distance
 */
(function () {
  'use strict';

  // ============================================================
  // ANRM 正常值参考范围 (来自 步态分析与康复训练实操手册)
  // ============================================================
  // 正常值范围 — 对比临床 3D 步态分析放宽 ~25% (手机摄像头精度限制)
  var NORMAL = {
    stepLength:   { min: 0.45, max: 0.85, unit: 'm',    label: '步长' },
    strideLength: { min: 0.90, max: 1.70, unit: 'm',    label: '步幅' },
    stepWidth:    { min: 0.05, max: 0.18, unit: 'm',    label: '步宽' },
    footAngle:    { min: 3,    max: 18,   unit: '°',    label: '足偏角' },
    cadence:      { min: 85,   max: 130,  unit: '步/分', label: '步频' },
    gaitSpeed:    { min: 0.9,  max: 1.8,  unit: 'm/s',  label: '步速' },
    stancePct:    { min: 53,   max: 67,   unit: '%',    label: '支撑相' },
    swingPct:     { min: 33,   max: 47,   unit: '%',    label: '摆动相' },
    doubleSupport:{ min: 8,    max: 18,   unit: '%',    label: '双支撑期' }
  };

  // ============================================================
  // 异常分级阈值 (相对于正常范围)
  // ============================================================
  function rangeStatus(value, key) {
    var n = NORMAL[key];
    if (value == null || isNaN(value)) return 'unknown';
    if (value >= n.min && value <= n.max) return 'normal';
    var span = n.max - n.min;
    var deviation = value < n.min ? (n.min - value) : (value - n.max);
    if (deviation <= span * 0.5) return 'mild';
    if (deviation <= span * 1.0) return 'moderate';
    return 'severe';
  }

  // ============================================================
  // 标定: 像素 → 米
  // ============================================================
  function distance2D(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function calibrateScale(px1, px2, realMeters) {
    if (!px1 || !px2 || !realMeters || realMeters <= 0) {
      return { scale: 0, error: 'invalid_input' };
    }
    var pxDist = distance2D(px1, px2);
    if (pxDist < 5) {
      return { scale: 0, error: 'points_too_close' };
    }
    return {
      scale: realMeters / pxDist,
      pixelDistance: pxDist,
      realMeters: realMeters,
      unit: 'm/px'
    };
  }

  /**
   * 身高自动标定: 适用于患者身高已知 (默认 1.70m), 任意帧中头顶到脚踝的像素距离
   * 比 1m 静态标尺更实用 — 患者不需站立不动, 任何行走中的侧方视角帧都能用
   *
   * 算法: 选取头部 (nose 或 eye) 和踝关节 (ankle) 平均 y 坐标
   *       body_px = head.y - ankle.y  (图像 y 向下, 头在上故 y 更小)
   *       scale = body_height_meters / body_px
   *
   * 注意: 头顶到脚踝的实际长度 ≈ 身高的 96-98% (头顶有头发缓冲)
   */
  function calibrateByHeight(frames, realHeightMeters, options) {
    options = options || {};
    var bodyRatio = options.bodyRatio || 0.97;  // 头顶到内踝 ≈ 身高的 97%
    if (!frames || frames.length === 0) {
      return { scale: 0, error: 'no_frames' };
    }
    if (!realHeightMeters || realHeightMeters < 0.5 || realHeightMeters > 2.5) {
      return { scale: 0, error: 'invalid_height' };
    }
    // 选身高最直立的帧 (head-ankle 像素差最大, 即站得最直的瞬间)
    var bestFrame = null, bestPixelHeight = 0;
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      // 兼容两种格式: 帧含 keypoints 数组 或 帧本身就是 {x,y,name}
      var pose = frame.keypoints ? frame : [frame];
      var nose = getKp(frame, 'nose');
      var lEye = getKp(frame, 'left_eye');
      var rEye = getKp(frame, 'right_eye');
      var lAnkle = getKp(frame, 'left_ankle');
      var rAnkle = getKp(frame, 'right_ankle');
      if (!lAnkle && !rAnkle) continue;
      // 头部估算: 优先 nose, 其次左右眼平均
      var headY;
      if (nose && nose.score >= 0.3) headY = nose.y;
      else if (lEye && rEye && lEye.score >= 0.3 && rEye.score >= 0.3) headY = (lEye.y + rEye.y) / 2;
      else continue;
      // 踝关节估算: 优先左右踝平均, 否则单踝
      var ankleY;
      if (lAnkle && rAnkle && lAnkle.score >= 0.3 && rAnkle.score >= 0.3) {
        ankleY = (lAnkle.y + rAnkle.y) / 2;
      } else if (lAnkle && lAnkle.score >= 0.3) ankleY = lAnkle.y;
      else if (rAnkle && rAnkle.score >= 0.3) ankleY = rAnkle.y;
      else continue;
      var pxH = Math.abs(ankleY - headY);
      if (pxH > bestPixelHeight) {
        bestPixelHeight = pxH;
        bestFrame = frame;
      }
    }
    if (!bestFrame || bestPixelHeight < 50) {
      return { scale: 0, error: 'no_valid_pose', pixelHeight: bestPixelHeight };
    }
    var refHeight = realHeightMeters * bodyRatio;  // 头顶到内踝
    var scale = refHeight / bestPixelHeight;
    return {
      scale: scale,
      pixelHeight: bestPixelHeight,
      realHeight: realHeightMeters,
      refHeight: refHeight,
      method: 'height',
      unit: 'm/px',
      confidence: bestPixelHeight >= 150 ? 'high' : (bestPixelHeight >= 80 ? 'medium' : 'low')
    };
  }

  // ============================================================
  // 关键点提取 (MoveNet COCO 17 点)
  // ============================================================
  function getKp(pose, name) {
    if (!pose || !pose.keypoints) return null;
    for (var i = 0; i < pose.keypoints.length; i++) {
      if (pose.keypoints[i].name === name) return pose.keypoints[i];
    }
    return null;
  }

  /**
   * 推断脚尖/脚跟位置: 基于小腿向量方向延伸
   * toe = ankle + (ankle - knee) * 0.40  (前)
   * heel = ankle - (ankle - knee) * 0.20  (后)
   */
  function inferFoot(ankle, knee) {
    if (!ankle || !knee) return null;
    return {
      ankle: { x: ankle.x, y: ankle.y },
      toe:   { x: ankle.x + (ankle.x - knee.x) * 0.40, y: ankle.y + (ankle.y - knee.y) * 0.40 },
      heel:  { x: ankle.x - (ankle.x - knee.x) * 0.20, y: ankle.y - (ankle.y - knee.y) * 0.20 }
    };
  }

  function extractFootKeypoints(pose, side) {
    if (side !== 'left' && side !== 'right') return null;
    var ankle = getKp(pose, side + '_ankle');
    var knee  = getKp(pose, side + '_knee');
    var hip   = getKp(pose, side + '_hip');
    if (!ankle || ankle.score < 0.3) return null;
    return {
      side: side,
      ankle: ankle,
      knee: knee,
      hip: hip,
      foot: inferFoot(ankle, knee)
    };
  }

  function extractTrunkAngle(pose) {
    var lh = getKp(pose, 'left_hip');
    var rh = getKp(pose, 'right_hip');
    var ls = getKp(pose, 'left_shoulder');
    var rs = getKp(pose, 'right_shoulder');
    if (!lh || !rh || !ls || !rs) return null;
    var hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    var shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    // 躯干与垂直方向的夹角 (图像坐标 y 向下, 垂直向上为 -y)
    var dx = shoulderMid.x - hipMid.x;
    var dy = shoulderMid.y - hipMid.y;  // 通常 > 0 (肩在上, 髋在下时 y 更小)
    // 角度: 从垂直方向 (0,-1) 顺时针测量
    var angleRad = Math.atan2(dx, -dy);
    var angleDeg = angleRad * 180 / Math.PI;
    return { lean: angleDeg, hipMid: hipMid, shoulderMid: shoulderMid };
  }

  // ============================================================
  // 信号处理小工具
  // ============================================================
  function findPeaks(signal, options) {
    options = options || {};
    var minProminence = options.minProminence || 0;
    var minDistance = options.minDistance || 1;
    var peaks = [];
    if (!signal || signal.length < 3) return peaks;
    var win = Math.max(2, Math.min(minDistance, 8));  // prominence 用窗口内最小值做基准
    for (var i = 1; i < signal.length - 1; i++) {
      if (signal[i].x >= signal[i - 1].x && signal[i].x > signal[i + 1].x) {
        var lMin = signal[i].x, rMin = signal[i].x;
        for (var a = Math.max(0, i - win); a < i; a++) lMin = Math.min(lMin, signal[a].x);
        for (var b = i + 1; b <= Math.min(signal.length - 1, i + win); b++) rMin = Math.min(rMin, signal[b].x);
        var prominence = Math.min(signal[i].x - lMin, signal[i].x - rMin);
        if (prominence >= minProminence) peaks.push({ index: i, t: signal[i].t, value: signal[i].x });
      }
    }
    if (minDistance > 1 && peaks.length > 1) {
      var filtered = [];
      var lastIdx = -minDistance;
      for (var j = 0; j < peaks.length; j++) {
        if (peaks[j].index - lastIdx >= minDistance) {
          filtered.push(peaks[j]);
          lastIdx = peaks[j].index;
        }
      }
      peaks = filtered;
    }
    return peaks;
  }
  function findValleys(signal, options) {
    options = options || {};
    var minProminence = options.minProminence || 0;
    var minDistance = options.minDistance || 1;
    var valleys = [];
    if (!signal || signal.length < 3) return valleys;
    var win = Math.max(2, Math.min(minDistance, 8));
    for (var i = 1; i < signal.length - 1; i++) {
      if (signal[i].x <= signal[i - 1].x && signal[i].x < signal[i + 1].x) {
        var lMax = signal[i].x, rMax = signal[i].x;
        for (var a = Math.max(0, i - win); a < i; a++) lMax = Math.max(lMax, signal[a].x);
        for (var b = i + 1; b <= Math.min(signal.length - 1, i + win); b++) rMax = Math.max(rMax, signal[b].x);
        var prominence = Math.min(lMax - signal[i].x, rMax - signal[i].x);
        if (prominence >= minProminence) valleys.push({ index: i, t: signal[i].t, value: signal[i].x });
      }
    }
    if (minDistance > 1 && valleys.length > 1) {
      var filtered = [];
      var lastIdx = -minDistance;
      for (var j = 0; j < valleys.length; j++) {
        if (valleys[j].index - lastIdx >= minDistance) {
          filtered.push(valleys[j]);
          lastIdx = valleys[j].index;
        }
      }
      valleys = filtered;
    }
    return valleys;
  }
  // 两列峰值时间序列的相位差 (占周期的比例 0-1, 0.5=反相)
  function phaseDifference(peaksA, peaksB) {
    if (!peaksA || !peaksB || peaksA.length < 2 || peaksB.length < 2) return null;
    var diffs = [];
    for (var i = 0; i < peaksA.length; i++) {
      var t = peaksA[i].t;
      // 找 B 中最近峰值
      var nearest = null, minDist = Infinity;
      for (var j = 0; j < peaksB.length; j++) {
        var d = Math.abs(peaksB[j].t - t);
        if (d < minDist) { minDist = d; nearest = peaksB[j]; }
      }
      if (!nearest) continue;
      // 用 A 的局部周期归一化
      var period = Infinity;
      if (i > 0) period = Math.min(period, t - peaksA[i - 1].t);
      if (i < peaksA.length - 1) period = Math.min(period, peaksA[i + 1].t - t);
      if (period > 0 && period < Infinity) {
        diffs.push(Math.abs(nearest.t - t) / period);
      }
    }
    if (diffs.length === 0) return null;
    return diffs.reduce(function (s, v) { return s + v; }, 0) / diffs.length;
  }
  // 事件到最近峰值的时间差 (峰值落后于事件为正), 返回平均占周期比
  function eventToPeakPhase(events, peaks, cycles) {
    if (!events || !peaks || events.length < 2 || peaks.length < 2) return null;
    var phases = [];
    for (var i = 0; i < events.length; i++) {
      var t = events[i].time || events[i].t;
      var nearest = null, minDist = Infinity;
      for (var j = 0; j < peaks.length; j++) {
        var d = Math.abs(peaks[j].t - t);
        if (d < minDist) { minDist = d; nearest = peaks[j]; }
      }
      if (!nearest) continue;
      var period = Infinity;
      if (i > 0) period = Math.min(period, t - (events[i - 1].time || events[i - 1].t));
      if (i < events.length - 1) period = Math.min(period, (events[i + 1].time || events[i + 1].t) - t);
      if (period > 0 && period < Infinity) {
        var delta = nearest.t - t;
        phases.push(delta / period);
      }
    }
    if (phases.length === 0) return null;
    return phases.reduce(function (s, v) { return s + v; }, 0) / phases.length;
  }

  // ============================================================
  // 上肢摆动分析 — ANRM §4.2 上肢观察要点
  //
  // 肩摆动 (shoulder swing) 是躯干旋转+臂摆的复合运动, 临床价值:
  //   肩摆减少 → 帕金森最早体征 (ANRM §8.2 慌张步态: "摆臂减少")
  //   不对称   → 偏瘫步态 (ANRM §8.1: "患侧上肢屈曲协同")
  //   过度摆动 → 小脑共济失调 (ANRM §8.3: 辨距不良泛化)
  //   无摆动   → 晚期帕金森/卒中后痉挛固定
  //
  // 腕摆动 (wrist swing) 作为辅助: 反映肘屈伸 + 肩摆的叠加
  // ============================================================
  function computeArmSwing(frames, scale, heelStrikes) {
    if (!frames || frames.length < 10) return { error: 'insufficient_frames' };

    // ---- 提取肩部水平摆动信号 (相对身体中线) ----
    var leftShoulderX = [], rightShoulderX = [];
    var leftShoulderRaw = [], rightShoulderRaw = [];
    for (var i = 0; i < frames.length; i++) {
      var ls = getKp(frames[i], 'left_shoulder');
      var rs = getKp(frames[i], 'right_shoulder');
      if (ls && rs && ls.score >= 0.3 && rs.score >= 0.3) {
        var midX = (ls.x + rs.x) / 2;  // 身体中线
        leftShoulderX.push({ t: frames[i].t, x: ls.x - midX });   // 左肩相对中线
        rightShoulderX.push({ t: frames[i].t, x: rs.x - midX });  // 右肩相对中线 (与左肩反相)
        leftShoulderRaw.push({ t: frames[i].t, x: ls.x });
        rightShoulderRaw.push({ t: frames[i].t, x: rs.x });
      }
    }
    // ---- 提取腕部摆动信号 (相对同侧肩) ----
    var leftWristX = [], rightWristX = [];
    for (var j = 0; j < frames.length; j++) {
      var lw = getKp(frames[j], 'left_wrist');
      var rw = getKp(frames[j], 'right_wrist');
      var ls2 = getKp(frames[j], 'left_shoulder');
      var rs2 = getKp(frames[j], 'right_shoulder');
      if (lw && ls2 && lw.score >= 0.25 && ls2.score >= 0.3) {
        leftWristX.push({ t: frames[j].t, x: lw.x - ls2.x });
      }
      if (rw && rs2 && rw.score >= 0.25 && rs2.score >= 0.3) {
        rightWristX.push({ t: frames[j].t, x: rw.x - rs2.x });
      }
    }
    // ---- 肩宽 (用于归一化) ----
    var shoulderWidths = [];
    for (var k = 0; k < frames.length; k += 5) {  // 每5帧采样
      var ls3 = getKp(frames[k], 'left_shoulder');
      var rs3 = getKp(frames[k], 'right_shoulder');
      if (ls3 && rs3 && ls3.score >= 0.3 && rs3.score >= 0.3) {
        shoulderWidths.push(Math.abs(rs3.x - ls3.x));
      }
    }
    var avgShoulderWidth = shoulderWidths.length > 0 ?
      shoulderWidths.reduce(function (s, v) { return s + v; }, 0) / shoulderWidths.length : 40;

    // ---- 信号分析工具函数 ----
    function peakToPeak(signal) {
      if (signal.length < 5) return 0;
      var vals = signal.map(function (s) { return s.x; });
      return Math.abs(Math.max.apply(null, vals) - Math.min.apply(null, vals));
    }
    // 去趋势后峰峰值 (更鲁棒)
    function detrendedP2P(signal) {
      if (signal.length < 10) return peakToPeak(signal);
      var n = signal.length;
      var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (var i = 0; i < n; i++) {
        sumX += i; sumY += signal[i].x;
        sumXY += i * signal[i].x; sumX2 += i * i;
      }
      var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      var intercept = (sumY - slope * sumX) / n;
      var detrended = signal.map(function (s, idx) {
        return { x: s.x - (slope * idx + intercept), t: s.t };
      });
      return peakToPeak(detrended);
    }
    function crossCorrelate(sigA, sigB) {
      // 按时间戳对齐 (两信号可见帧不同, 按索引配对会错位)
      var pairsA = [], pairsB = [];
      for (var i = 0; i < sigA.length; i++) {
        var best = null, bestD = Infinity;
        for (var j = 0; j < sigB.length; j++) {
          var d = Math.abs(sigB[j].t - sigA[i].t);
          if (d < bestD) { bestD = d; best = sigB[j]; }
        }
        if (best && bestD < 0.06) { pairsA.push(sigA[i].x); pairsB.push(best.x); }
      }
      var n = pairsA.length;
      if (n < 10) return null;
      var meanA = 0, meanB = 0;
      for (var k = 0; k < n; k++) { meanA += pairsA[k]; meanB += pairsB[k]; }
      meanA /= n; meanB /= n;
      var num = 0, denA = 0, denB = 0;
      for (var m = 0; m < n; m++) {
        var da = pairsA[m] - meanA, db = pairsB[m] - meanB;
        num += da * db; denA += da * da; denB += db * db;
      }
      if (denA === 0 || denB === 0) return null;
      return num / Math.sqrt(denA * denB);
    }
    // 按时间间隔 (>1s) 切段, 逐段算相关再加权平均 — 来回走不同方向段极性相反, 整段算会相互抵消
    function segmentCorrelation(sigA, sigB) {
      if (!sigA.length || !sigB.length) return null;
      var segs = [], cur = [sigA[0]];
      for (var i = 1; i < sigA.length; i++) {
        if (sigA[i].t - sigA[i - 1].t > 1.0) { segs.push(cur); cur = []; }
        cur.push(sigA[i]);
      }
      segs.push(cur);
      var wSum = 0, rSum = 0;
      for (var s = 0; s < segs.length; s++) {
        if (segs[s].length < 15) continue;
        var t0 = segs[s][0].t, t1 = segs[s][segs[s].length - 1].t;
        var segB = sigB.filter(function (b) { return b.t >= t0 && b.t <= t1; });
        var r = crossCorrelate(segs[s], segB);
        if (r != null) { rSum += Math.abs(r) * segs[s].length; wSum += segs[s].length; }
      }
      return wSum > 0 ? rSum / wSum : null;
    }
    // 自适应峰值/谷值检测: prominence 按信号 P90-P10 幅度自适应
    function adaptivePeaks(signal) {
      if (signal.length < 20) return [];
      var xs = signal.map(function (s) { return s.x; }).sort(function (a, b) { return a - b; });
      var amp = xs[Math.floor(xs.length * 0.9)] - xs[Math.floor(xs.length * 0.1)];
      return findPeaks(signal, { minProminence: Math.max(3, amp * 0.25), minDistance: 10 });
    }
    function adaptiveValleys(signal) {
      if (signal.length < 20) return [];
      var xs = signal.map(function (s) { return s.x; }).sort(function (a, b) { return a - b; });
      var amp = xs[Math.floor(xs.length * 0.9)] - xs[Math.floor(xs.length * 0.1)];
      return findValleys(signal, { minProminence: Math.max(3, amp * 0.25), minDistance: 10 });
    }
    // 按峰值-谷值配对计算每个周期振幅
    function perCycleAmplitudes(signal) {
      var peaks = adaptivePeaks(signal);
      var valleys = adaptiveValleys(signal);
      var amps = [];
      for (var i = 0; i < peaks.length; i++) {
        var nearestValley = null, minDist = Infinity;
        for (var j = 0; j < valleys.length; j++) {
          var d = Math.abs(valleys[j].t - peaks[i].t);
          if (d < minDist) { minDist = d; nearestValley = valleys[j]; }
        }
        if (nearestValley) amps.push(peaks[i].value - nearestValley.value);
      }
      return amps;
    }
    // ---- 踝关节 x 信号 (用于上下肢协调) ----
    var leftAnkleX = [], rightAnkleX = [];
    for (var m = 0; m < frames.length; m++) {
      var la = getKp(frames[m], 'left_ankle');
      var ra = getKp(frames[m], 'right_ankle');
      if (la && la.score >= 0.3) leftAnkleX.push({ t: frames[m].t, x: la.x });
      if (ra && ra.score >= 0.3) rightAnkleX.push({ t: frames[m].t, x: ra.x });
    }

    // ---- 计算肩摆动指标 (主要) ----
    var shLeftP2P  = detrendedP2P(leftShoulderX);
    var shRightP2P = detrendedP2P(rightShoulderX);
    // 归一化: 摆动幅度 / 肩宽 → 无量纲摆动指数 (正常 ~0.15-0.35)
    var shLeftNorm  = avgShoulderWidth > 0 ? shLeftP2P / avgShoulderWidth : 0;
    var shRightNorm = avgShoulderWidth > 0 ? shRightP2P / avgShoulderWidth : 0;
    var shAvgNorm = (shLeftNorm + shRightNorm) / 2;

    // 肩摆不对称
    var shAsymmetry = (shLeftP2P + shRightP2P) > 0 ?
      Math.abs(shLeftP2P - shRightP2P) / ((shLeftP2P + shRightP2P) / 2) : 0;

    // ---- 计算腕摆动指标 (辅助) ----
    var wrLeftP2P  = detrendedP2P(leftWristX);
    var wrRightP2P = detrendedP2P(rightWristX);
    var wrAsymmetry = (wrLeftP2P + wrRightP2P) > 0 ?
      Math.abs(wrLeftP2P - wrRightP2P) / ((wrLeftP2P + wrRightP2P) / 2) : 0;

    // ---- 腕摆动周期级指标 (相位差、变异性) ----
    // 侧拍时手腕每周期被躯干遮挡两次, 可见率 < 50% 的信号算出来的相位/CV 都是噪声
    var wristCoverageL = frames.length ? leftWristX.length / frames.length : 0;
    var wristCoverageR = frames.length ? rightWristX.length / frames.length : 0;
    var wristOKL = wristCoverageL >= 0.5, wristOKR = wristCoverageR >= 0.5;
    var leftWristPeaks  = adaptivePeaks(leftWristX);
    var rightWristPeaks = adaptivePeaks(rightWristX);
    // 左右腕峰数差异 > 40% → 至少一侧跟踪失败, 相位/耦合指标不可信
    var peakCounts = leftWristPeaks.length + rightWristPeaks.length;
    var peaksConsistent = peakCounts > 0 &&
      Math.abs(leftWristPeaks.length - rightWristPeaks.length) / Math.max(leftWristPeaks.length, rightWristPeaks.length, 1) <= 0.4;
    // 周期样本 < 4 或可见率不足或峰数不一致时相位/变异性不可信 → null (下游标"数据不足"而非给假低分)
    var wristPhaseDiff = (wristOKL && wristOKR && peaksConsistent && leftWristPeaks.length >= 4 && rightWristPeaks.length >= 4) ?
      phaseDifference(leftWristPeaks, rightWristPeaks) : null;
    // 归一化到 [0, 0.5], 0.5 = 完美反相, 0 = 同相
    var wristPhaseSymmetry = wristPhaseDiff == null ? null : Math.abs(wristPhaseDiff - 0.5) / 0.5;
    // 生理下限门控: 相位差 > 0.6 (归一化) 意味着完全失相, 基本是跟踪失败而非真实步态
    if (wristPhaseSymmetry != null && wristPhaseSymmetry > 0.6) wristPhaseSymmetry = null;
    var leftAmps  = perCycleAmplitudes(leftWristX);
    var rightAmps = perCycleAmplitudes(rightWristX);
    var leftAmpCV  = (wristOKL && leftAmps.length  >= 4) ? stddev(leftAmps)  / mean(leftAmps)  : null;
    var rightAmpCV = (wristOKR && rightAmps.length >= 4) ? stddev(rightAmps) / mean(rightAmps) : null;
    // 生理上限门控: CV > 0.6 在人类步态中几乎不存在, 出现即判定为跟踪噪声
    if (leftAmpCV != null && leftAmpCV > 0.6) leftAmpCV = null;
    if (rightAmpCV != null && rightAmpCV > 0.6) rightAmpCV = null;
    var wristAmpCV = (leftAmpCV != null && rightAmpCV != null) ? (leftAmpCV + rightAmpCV) / 2 : (leftAmpCV != null ? leftAmpCV : rightAmpCV);

    // ---- 上下肢协调 (腕 vs 对侧踝, 逐段 |r| 加权) ----
    // 侧拍下肩部 x 几乎不动, 真正的摆臂信号是腕部前后摆动 → 用腕信号
    var leftShRightAnkle  = segmentCorrelation(leftWristX, rightAnkleX);
    var rightShLeftAnkle  = segmentCorrelation(rightWristX, leftAnkleX);
    var coordVals = [];
    if (leftShRightAnkle != null) coordVals.push(leftShRightAnkle);
    if (rightShLeftAnkle != null) coordVals.push(rightShLeftAnkle);
    var avgCoordination = coordVals.length ? coordVals.reduce(function (s, v) { return s + v; }, 0) / coordVals.length : null;
    // 手臂-腿部耦合: 对侧腕前摆峰值 vs 同侧脚跟触地 (理想步态中接近 0 反相)
    // 样本量门槛: HS ≥ 3 且腕峰 ≥ 4 且腕可见率 ≥ 50%, 否则 null (样本不足的相位差是噪声)
    var leftHs = (heelStrikes && heelStrikes.left) || [];
    var rightHs = (heelStrikes && heelStrikes.right) || [];
    var armLegCouplingL = (rightHs.length >= 3 && wristOKL && leftWristPeaks.length >= 4) ? eventToPeakPhase(rightHs, leftWristPeaks) : null;
    var armLegCouplingR = (leftHs.length >= 3 && wristOKR && rightWristPeaks.length >= 4) ? eventToPeakPhase(leftHs, rightWristPeaks) : null;
    var armLegCoupling = null;
    if (armLegCouplingL != null || armLegCouplingR != null) {
      var vals = [];
      if (armLegCouplingL != null) vals.push(Math.abs(armLegCouplingL));
      if (armLegCouplingR != null) vals.push(Math.abs(armLegCouplingR));
      armLegCoupling = vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : null;
    }
    // 耦合指数: 理想相位 = 0 (对侧腕前摆峰与该侧 HS 同步, 正常步态的臂腿反相关系)
    // |相位| 越大越差, ≥0.5 (完全失相) → 0
    var armLegCouplingIndex = armLegCoupling == null ? null : Math.max(0, 1 - Math.abs(armLegCoupling) / 0.5);

    // ---- 厘米换算 ----
    var ampUnit = scale && scale > 0 ? 'cm' : 'px';
    var convert = scale && scale > 0 ? scale * 100 : 1;
    var shLeftCm  = shLeftP2P * convert;
    var shRightCm = shRightP2P * convert;
    var shAvgCm   = (shLeftCm + shRightCm) / 2;
    var wrLeftCm  = wrLeftP2P * convert;
    var wrRightCm = wrRightP2P * convert;

    // ---- 临床/亚健康标记 ----
    var flags = [];
    if (!wristOKL || !wristOKR) {
      flags.push('ℹ 腕部关键点遮挡较多 (可见率 L ' + (wristCoverageL * 100).toFixed(0) + '% / R ' + (wristCoverageR * 100).toFixed(0) + '%) — 摆臂相位/耦合/变异性指标未纳入');
    }
    if (shAvgNorm < 0.08) flags.push('肩摆严重减少 — 提示运动皮层/基底节驱动下降');
    else if (shAvgNorm < 0.15) flags.push('肩摆轻度减少 — 常见于久坐/亚健康步态');
    if (shAsymmetry > 0.30) flags.push('肩摆不对称(' + (shAsymmetry * 100).toFixed(0) + '%) — 提示双侧脑功能协调下降');
    else if (shAsymmetry > 0.20) flags.push('肩摆轻度不对称(' + (shAsymmetry * 100).toFixed(0) + '%) — 建议关注双侧协调');
    if (avgCoordination < 0.25) flags.push('上下肢失协调 — 提示小脑/皮质-小脑环路整合减弱');
    if (wristAmpCV > 0.25) flags.push('手臂摆动变异性大(CV=' + (wristAmpCV * 100).toFixed(0) + '%) — 提示节律控制不稳');
    if (wristPhaseSymmetry != null && wristPhaseSymmetry > 0.30) flags.push('双臂相位差异常 — 提示中枢模式发生器/胼胝体协调偏离');
    if (armLegCouplingIndex != null && armLegCouplingIndex < 0.50) flags.push('手臂-腿部耦合弱 — 提示小脑协调/步态自动化下降');
    if (shAvgCm < 2 && wrLeftCm < 3 && wrRightCm < 3) flags.push('上肢固定 — 提示运动控制严重受限');
    if (shAvgNorm > 0.40) flags.push('肩摆过度 — 提示小脑调节不良/协调过度');

    return {
      // 肩摆动 (主要指标)
      shoulder: {
        leftAmplitude: shLeftCm,
        rightAmplitude: shRightCm,
        avgAmplitude: shAvgCm,
        leftNormalized: shLeftNorm,
        rightNormalized: shRightNorm,
        avgNormalized: shAvgNorm,
        asymmetry: shAsymmetry,
        unit: ampUnit,
        shoulderWidthPx: avgShoulderWidth
      },
      // 腕摆动 (辅助指标)
      wrist: {
        leftAmplitude: wrLeftCm,
        rightAmplitude: wrRightCm,
        asymmetry: wrAsymmetry
      },
      // 周期级新指标
      rhythm: {
        leftWristPeaks: leftWristPeaks.length,
        rightWristPeaks: rightWristPeaks.length,
        wristPhaseDiff: wristPhaseDiff,           // 0-1, 理想 ~0.5
        wristPhaseSymmetry: wristPhaseSymmetry,   // 0-1, 越接近 0 越对称
        leftAmplitudeCV: leftAmpCV,
        rightAmplitudeCV: rightAmpCV,
        amplitudeCV: wristAmpCV
      },
      // 上下肢协调
      coordination: {
        leftShoulderRightAnkle: leftShRightAnkle,
        rightShoulderLeftAnkle: rightShLeftAnkle,
        avg: avgCoordination,
        armLegCouplingL: armLegCouplingL,
        armLegCouplingR: armLegCouplingR,
        armLegCouplingIndex: armLegCouplingIndex  // 0-1, 越高越好
      },
      // 信号质量
      quality: {
        leftShoulderPoints: leftShoulderX.length,
        rightShoulderPoints: rightShoulderX.length,
        leftWristPoints: leftWristX.length,
        rightWristPoints: rightWristX.length,
        wristCoverageL: wristCoverageL,
        wristCoverageR: wristCoverageR
      },
      flags: flags
    };
  }

  // ============================================================
  // 手肘摆动分析 — ANRM 脑优化 §3.2 手肘摆动
  // 手肘摆动反映小脑功能 (睡眠差、易焦虑 → 手肘摆动多)
  // ============================================================
  function computeElbowSwing(frames, scale) {
    if (!frames || frames.length < 10) return { error: 'insufficient_frames' };
    var leftElbowX = [], rightElbowX = [];
    var leftShoulderRef = [], rightShoulderRef = [];
    for (var i = 0; i < frames.length; i++) {
      var le = getKp(frames[i], 'left_elbow');
      var re = getKp(frames[i], 'right_elbow');
      var ls = getKp(frames[i], 'left_shoulder');
      var rs = getKp(frames[i], 'right_shoulder');
      if (le && ls && le.score >= 0.25 && ls.score >= 0.3) {
        leftElbowX.push({ t: frames[i].t, x: le.x - ls.x });
        leftShoulderRef.push(ls.x);
      }
      if (re && rs && re.score >= 0.25 && rs.score >= 0.3) {
        rightElbowX.push({ t: frames[i].t, x: re.x - rs.x });
        rightShoulderRef.push(rs.x);
      }
    }
    function p2p(sig) {
      if (sig.length < 5) return 0;
      var v = sig.map(function (s) { return s.x; });
      return Math.abs(Math.max.apply(null, v) - Math.min.apply(null, v));
    }
    function rms(sig) {
      if (sig.length < 5) return 0;
      var m = sig.reduce(function (s, v) { return s + v.x; }, 0) / sig.length;
      return Math.sqrt(sig.reduce(function (s, v) { return s + (v.x - m) * (v.x - m); }, 0) / sig.length);
    }
    var convert = scale && scale > 0 ? scale * 100 : 1;
    var unit = scale && scale > 0 ? 'cm' : 'px';
    var leP2P = p2p(leftElbowX) * convert;
    var reP2P = p2p(rightElbowX) * convert;
    var leRMS = rms(leftElbowX) * convert;
    var reRMS = rms(rightElbowX) * convert;
    var avgElbow = (leP2P + reP2P) / 2;
    var elbowAsym = (leP2P + reP2P) > 0 ? Math.abs(leP2P - reP2P) / ((leP2P + reP2P) / 2) : 0;
    // 手肘摆动过多/过少判定 (相对肩摆动的比例)
    var flags = [];
    if (avgElbow < 2) flags.push('手肘摆动过少 — ANRM: 小脑功能低下或基底节僵直');
    else if (avgElbow > 15) flags.push('手肘摆动过多(' + avgElbow.toFixed(1) + unit + ') — ANRM: 小脑调节不良 (常见睡眠差/易焦虑)');
    if (elbowAsym > 0.30) flags.push('手肘不对称(' + (elbowAsym * 100).toFixed(0) + '%) — ANRM: 单侧小脑/锥体束病变');
    return {
      leftAmplitude: leP2P,
      rightAmplitude: reP2P,
      avgAmplitude: avgElbow,
      leftRMS: leRMS,
      rightRMS: reRMS,
      asymmetry: elbowAsym,
      unit: unit,
      flags: flags
    };
  }

  // ============================================================
  // 膝关节刹车能力 — ANRM 脑优化 §3.2 膝关节刹车能力
  // 反映性格和情绪: 刹车能力差 → 性格/情绪问题
  // 正常: 支撑相中期膝关节接近完全伸直 (稳定支撑)
  // 异常: 支撑相膝屈曲过大 / 伸膝控制不稳 (膝过伸)
  // ============================================================
  function computeKneeBraking(frames, heelStrikes, side) {
    if (!frames || frames.length < 10) return { error: 'insufficient_frames' };
    var kneeName = side + '_knee';
    var hipName  = side + '_hip';
    var ankleName = side + '_ankle';
    // 在每个 HS 后的支撑相窗口 (0-50% 周期) 中检测膝角度和控制
    var kneeAngles = [];       // [{t, angle}] 支撑相膝角度
    var kneeStability = [];    // [{t, var}] 局部膝角度变异 (3帧滑动窗口)
    for (var h = 0; h < heelStrikes.length - 1; h++) {
      var hsT = heelStrikes[h].time;
      var nextHsT = heelStrikes[h + 1].time;
      var cycle = nextHsT - hsT;
      if (cycle <= 0.2 || cycle >= 3.0) continue;
      // 支撑相: HS → HS + 0.5*cycle
      for (var i = 0; i < frames.length; i++) {
        var t = frames[i].t;
        if (t < hsT) continue;
        if (t > hsT + 0.5 * cycle) break;
        var knee = getKp(frames[i], kneeName);
        var hip  = getKp(frames[i], hipName);
        var ankle = getKp(frames[i], ankleName);
        if (!knee || !hip || !ankle || knee.score < 0.25 || hip.score < 0.3 || ankle.score < 0.3) continue;
        // 膝角度: hip-knee-ankle 三点夹角 (180° = 完全伸直)
        var v1 = { x: hip.x - knee.x, y: hip.y - knee.y };
        var v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };
        var dot = v1.x * v2.x + v1.y * v2.y;
        var mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y) * Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag === 0) continue;
        var angleDeg = Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
        kneeAngles.push({ t: t, angle: angleDeg, score: knee.score });
      }
    }
    if (kneeAngles.length < 5) return { error: 'insufficient_knee_data' };
    // 支撑相膝角度统计
    var angles = kneeAngles.map(function (k) { return k.angle; });
    var avgAngle = angles.reduce(function (s, v) { return s + v; }, 0) / angles.length;
    var minAngle = Math.min.apply(null, angles);  // 最屈曲
    var maxAngle = Math.max.apply(null, angles);  // 最伸直
    // 膝控制稳定性: 角速度标准差 (反映刹车是否平滑)
    var velocities = [];
    for (var v = 1; v < kneeAngles.length; v++) {
      var dt = kneeAngles[v].t - kneeAngles[v - 1].t;
      if (dt <= 0) continue;
      velocities.push(Math.abs(kneeAngles[v].angle - kneeAngles[v - 1].angle) / dt);
    }
    var avgVel = velocities.length > 0 ? velocities.reduce(function (s, x) { return s + x; }, 0) / velocities.length : 0;
    var velSD = velocities.length > 1 ?
      Math.sqrt(velocities.reduce(function (s, x) { return s + (x - avgVel) * (x - avgVel); }, 0) / velocities.length) : 0;
    // 临床判定
    var flags = [];
    var quality = 'normal';
    if (avgAngle < 160) { quality = 'flexed'; flags.push('支撑相膝屈曲(' + avgAngle.toFixed(0) + '°) — ANRM: 刹车能力差, 提示性格/情绪调节问题'); }
    else if (avgAngle > 175) { quality = 'hyperextended'; flags.push('支撑相膝过伸(' + avgAngle.toFixed(0) + '°) — ANRM: 膝控制过度僵硬'); }
    if (velSD > 30) { quality = 'unstable'; flags.push('膝控制不稳定(角速度SD=' + velSD.toFixed(0) + '°/s) — ANRM: 情绪波动/冲动控制差'); }
    return {
      side: side,
      avgStanceAngle: avgAngle,
      minAngle: minAngle,
      maxAngle: maxAngle,
      angleRange: maxAngle - minAngle,
      velocityAvg: avgVel,
      velocitySD: velSD,
      quality: quality,
      sampleCount: kneeAngles.length,
      flags: flags
    };
  }

  // ============================================================
  // ANRM 脑功能步态画像 — 将步态指标映射到脑功能域
  //
  // 4 项核心映射 (ANRM 脑优化 §3.2):
  //   肩膀甩动 → 对侧脑功能
  //   手肘摆动 → 小脑功能 (睡眠/焦虑)
  //   宽深角度 → 同侧脑功能
  //   膝关节刹车 → 性格与情绪
  //
  // 输出: 脑功能域评分 + 侧向化提示 + 亚健康标记
  // ============================================================
  // ============================================================
  // 脑功能步态画像 v2 — 亚健康人群 5 维筛查
  //
  // 定位: 非病理性筛查。输出各维度 0-100 趋势评分 + 解读, 不做疾病诊断。
  //   D1 小脑协调     — 臂腿耦合 / 上下肢协调 / 踝角变异 / 骨盆起伏节奏
  //   D2 运动皮层控制 — 肩摆驱动 / 足背屈控制 / 踝活动范围
  //   D3 前庭-平衡    — 骨盆横摆 / 步宽 / 双支撑比例
  //   D4 双侧协调     — 步长对称 / 肩摆对称 / 腕相位 / 髋摆动对称 / 骨盆侧倾对称
  //   D5 运动节律稳定 — 步频CV / 腕振幅CV / 骨盆起伏CV
  // ============================================================
  function computeBrainGaitProfile(armSwing, elbowSwing, kneeLeft, kneeRight, params) {
    var p = params && params.parameters ? params.parameters : {};
    var a = params && params.asymmetries ? params.asymmetries : {};
    var e = params && params.extras ? params.extras : {};
    var pelvic = params && params.pelvic && !params.pelvic.error ? params.pelvic : null;
    var ankleL = params && params.ankleLeft && !params.ankleLeft.error ? params.ankleLeft : null;
    var ankleR = params && params.ankleRight && !params.ankleRight.error ? params.ankleRight : null;

    function clamp01(v) { return Math.min(1, Math.max(0, v)); }
    // 加权合成 0-1; 全部子指标缺失时返回 null (数据不足, 不出假分)
    function combine(items) {
      var sum = 0, wsum = 0;
      items.forEach(function (it) {
        if (it.v != null && isFinite(it.v)) { sum += it.v * it.w; wsum += it.w; }
      });
      return wsum > 0 ? sum / wsum : null;
    }
    function interpOf(score) {
      if (score == null) return '数据不足, 未纳入本次评估';
      if (score >= 75) return '该维度表现良好, 处于健康参考区间';
      if (score >= 55) return '该维度轻度偏离, 常见于亚健康/疲劳状态, 建议观察趋势';
      return '该维度明显偏离, 建议结合其他评估关注, 并定期复测对比';
    }

    var dims = {};

    // ---------- D1 小脑协调 ----------
    (function () {
      var metrics = {}, flags = [];
      var coupling = null, coord = null, ankleCV = null, vertReg = null;
      if (armSwing && armSwing.coordination) {
        if (armSwing.coordination.armLegCouplingIndex != null) {
          coupling = clamp01(armSwing.coordination.armLegCouplingIndex);
          metrics.armLegCouplingIndex = armSwing.coordination.armLegCouplingIndex;
        }
        if (armSwing.coordination.avg != null) {
          coord = clamp01((armSwing.coordination.avg - 0.15) / 0.45);  // 0.15-0.60 → 0-1
          metrics.upperLowerCoord = armSwing.coordination.avg;
        }
      }
      var cvs = [];
      if (ankleL && ankleL.ankleAngleCV != null) cvs.push(ankleL.ankleAngleCV);
      if (ankleR && ankleR.ankleAngleCV != null) cvs.push(ankleR.ankleAngleCV);
      if (cvs.length) {
        var mcv = cvs.reduce(function (s, v) { return s + v; }, 0) / cvs.length;
        ankleCV = clamp01(1 - Math.max(0, mcv - 0.15) / 0.40);  // 摄像头噪声本底 ~0.15
        metrics.ankleAngleCV = mcv;
      }
      if (pelvic && pelvic.verticalCV != null) {
        vertReg = clamp01(1 - pelvic.verticalCV / 0.40);
        metrics.pelvicVerticalCV = pelvic.verticalCV;
      }
      var v = combine([{ v: coupling, w: 0.35 }, { v: coord, w: 0.25 }, { v: ankleCV, w: 0.20 }, { v: vertReg, w: 0.20 }]);
      if (coupling != null && coupling < 0.5) flags.push('手臂-腿部耦合偏弱 — 小脑对上下肢节律的整合不足');
      if (coord != null && coord < 0.3) flags.push('上下肢协调性偏低 — 皮质-小脑环路信息整合减弱');
      if (ankleCV != null && ankleCV < 0.6) flags.push('踝背屈角度逐周期波动大 — 小脑精细运动调节不稳');
      if (vertReg != null && vertReg < 0.6) flags.push('骨盆起伏节奏不规律 — 小脑节律控制存在波动');
      dims.cerebellar = {
        label: '小脑协调', brainRegion: '小脑 / 皮质-小脑环路',
        score: v == null ? null : Math.round(v * 100),
        metrics: metrics, flags: flags
      };
    })();

    // ---------- D2 运动皮层控制 ----------
    (function () {
      var metrics = {}, flags = [];
      var shDrive = null, dfCtrl = null, hipROMScore = null;
      if (armSwing && armSwing.shoulder && armSwing.shoulder.avgNormalized != null) {
        if (armSwing.shoulder.avgNormalized <= 0.8) {
          shDrive = clamp01(armSwing.shoulder.avgNormalized / 0.25);
          metrics.shoulderSwingNorm = armSwing.shoulder.avgNormalized;
        } else {
          flags.push('肩摆信号异常 (归一化 ' + armSwing.shoulder.avgNormalized.toFixed(2) + ', 生理上限约0.6) — 可能受遮挡/左右交换影响, 未纳入评分');
        }
      }
      var drops = [];
      if (ankleL && ankleL.footDropAngle != null) drops.push(ankleL.footDropAngle);
      if (ankleR && ankleR.footDropAngle != null) drops.push(ankleR.footDropAngle);
      if (drops.length) {
        var md = drops.reduce(function (s, v) { return s + v; }, 0) / drops.length;
        dfCtrl = clamp01(1 - Math.max(0, md - 5) / 20);  // 摆动相足俯仰 ≤5°→1, ≥25°→0
        metrics.footDropAngle = md;
      }
      if (pelvic && pelvic.hipFlexion && pelvic.hipFlexion.meanROM != null) {
        hipROMScore = clamp01((pelvic.hipFlexion.meanROM - 15) / 15);  // 15°→0, 30°→1 (正常步行 ~25-35°)
        metrics.hipFlexionROM = pelvic.hipFlexion.meanROM;
      }
      var v = combine([{ v: shDrive, w: 0.35 }, { v: dfCtrl, w: 0.30 }, { v: hipROMScore, w: 0.35 }]);
      if (shDrive != null && shDrive < 0.5) flags.push('手臂摆动驱动减弱 — 运动皮层对步态的自动化参与下降, 常见于久坐/精力不足');
      if (dfCtrl != null && dfCtrl < 0.5) flags.push('摆动相足背屈控制不足 — 皮层对远端精细运动的驱动偏弱');
      if (hipROMScore != null && hipROMScore < 0.5) flags.push('髋屈伸活动度偏小 — 运动输出幅度受限, 提示近端驱动不足');
      dims.cortical = {
        label: '运动皮层控制', brainRegion: '初级运动皮层 / 皮层脊髓束',
        score: v == null ? null : Math.round(v * 100),
        metrics: metrics, flags: flags
      };
    })();

    // ---------- D3 前庭-平衡 ----------
    (function () {
      var metrics = {}, flags = [];
      var swayScore = null, widthScore = null, dsScore = null;
      if (pelvic && pelvic.lateralSway != null) {
        swayScore = clamp01(1 - (pelvic.lateralSway - 3) / 5);  // ≤3cm→1, ≥8cm→0
        metrics.lateralSwayCm = pelvic.lateralSway;
      }
      if (p.stepWidth && p.stepWidth.value != null) {
        var w = p.stepWidth.value;
        var dev = w < 0.06 ? 0.06 - w : (w > 0.16 ? w - 0.16 : 0);
        widthScore = clamp01(1 - dev / 0.08);
        metrics.stepWidth = w;
      }
      if (p.doubleSupport && p.doubleSupport.value != null) {
        dsScore = clamp01(1 - Math.max(0, p.doubleSupport.value - 30) / 20);  // >30% 开始扣分
        metrics.doubleSupport = p.doubleSupport.value;
      }
      var v = combine([{ v: swayScore, w: 0.40 }, { v: widthScore, w: 0.30 }, { v: dsScore, w: 0.30 }]);
      if (swayScore != null && swayScore < 0.5) flags.push('骨盆横向摆动增大 — 前庭-脊髓通路的侧向稳定控制需关注');
      if (widthScore != null && widthScore < 0.7 && metrics.stepWidth > 0.16) flags.push('步宽偏大 — 身体在用加宽基底代偿平衡, 前庭/本体感觉输入可能不足');
      if (dsScore != null && dsScore < 0.7) flags.push('双支撑期延长 — 平衡信心下降的适应性表现');
      dims.vestibular = {
        label: '前庭-平衡', brainRegion: '前庭系统 / 前庭脊髓束 / 小脑蚓部',
        score: v == null ? null : Math.round(v * 100),
        metrics: metrics, flags: flags
      };
    })();

    // ---------- D4 双侧协调 ----------
    (function () {
      var metrics = {}, flags = [];
      var stepSym = null, shSym = null, wristSym = null, hipSym = null, oblSym = null;
      if (a.stepLength != null) {
        stepSym = clamp01(1 - Math.max(0, a.stepLength - 0.08) / 0.25);  // 摄像头测量本底不对称 ~0.08
        metrics.stepLengthAsym = a.stepLength;
      }
      if (armSwing && armSwing.shoulder && armSwing.shoulder.asymmetry != null) {
        shSym = clamp01(1 - armSwing.shoulder.asymmetry / 0.40);
        metrics.shoulderAsym = armSwing.shoulder.asymmetry;
      }
      if (armSwing && armSwing.rhythm && armSwing.rhythm.wristPhaseSymmetry != null) {
        wristSym = clamp01(1 - Math.max(0, armSwing.rhythm.wristPhaseSymmetry - 0.15) / 0.35);  // 相位估计噪声本底 ~0.15
        metrics.wristPhaseSymmetry = armSwing.rhythm.wristPhaseSymmetry;
      }
      if (pelvic) {
        if (pelvic.hipFlexion && pelvic.hipFlexion.asymmetry != null) {
          hipSym = clamp01(1 - Math.max(0, pelvic.hipFlexion.asymmetry - 0.15) / 0.35);  // 远侧髋遮挡可贡献 ~0.15
          metrics.hipSwingAsym = pelvic.hipFlexion.asymmetry;
        }
        if (pelvic.obliquityAsymmetry != null) {
          oblSym = clamp01(1 - pelvic.obliquityAsymmetry / 6);
          metrics.pelvicObliquityAsym = pelvic.obliquityAsymmetry;
        }
      }
      var v = combine([{ v: stepSym, w: 0.25 }, { v: shSym, w: 0.20 }, { v: wristSym, w: 0.20 }, { v: hipSym, w: 0.20 }, { v: oblSym, w: 0.15 }]);
      if (stepSym != null && stepSym < 0.6) flags.push('左右步长不对称 — 两侧大脑半球运动输出不平衡');
      if (shSym != null && shSym < 0.6) flags.push('双臂摆动不对称 — 双侧皮层-肢体驱动存在差异');
      if (wristSym != null && wristSym < 0.6) flags.push('双臂摆动相位偏离反相模式 — 胼胝体/中枢模式发生器协调偏离');
      if (hipSym != null && hipSym < 0.6) flags.push('左右髋摆动不对称 — 双侧运动控制协调下降');
      dims.bilateral = {
        label: '双侧协调', brainRegion: '双侧半球协同 / 胼胝体 / 脊髓中枢模式发生器',
        score: v == null ? null : Math.round(v * 100),
        metrics: metrics, flags: flags
      };
    })();

    // ---------- D5 运动节律稳定 ----------
    (function () {
      var metrics = {}, flags = [];
      var stepCV = null, wristCV = null, pelvCV = null;
      if (e.rhythmCV != null) {
        stepCV = clamp01(1 - Math.max(0, e.rhythmCV - 0.10) / 0.30);  // 摄像头 HS 计时抖动本底 ~10%
        metrics.stepTimeCV = e.rhythmCV;
      }
      if (armSwing && armSwing.rhythm && armSwing.rhythm.amplitudeCV != null) {
        wristCV = clamp01(1 - Math.max(0, armSwing.rhythm.amplitudeCV - 0.15) / 0.45);  // 摄像头本底 ~0.15
        metrics.armAmplitudeCV = armSwing.rhythm.amplitudeCV;
      }
      if (pelvic && pelvic.verticalCV != null) {
        pelvCV = clamp01(1 - pelvic.verticalCV / 0.40);
        metrics.pelvicVerticalCV = pelvic.verticalCV;
      }
      var v = combine([{ v: stepCV, w: 0.45 }, { v: wristCV, w: 0.25 }, { v: pelvCV, w: 0.30 }]);
      if (stepCV != null && stepCV < 0.6) flags.push('步行节律逐周期波动大 — 基底节/脑干节律发生器的自动化输出不稳');
      if (wristCV != null && wristCV < 0.6) flags.push('手臂摆动幅度忽大忽小 — 运动节律的皮层下调控不稳');
      dims.rhythm = {
        label: '运动节律稳定', brainRegion: '基底节 / 脑干中枢模式发生器',
        score: v == null ? null : Math.round(v * 100),
        metrics: metrics, flags: flags
      };
    })();

    // ---------- 汇总 ----------
    var dimKeys = ['cerebellar', 'cortical', 'vestibular', 'bilateral', 'rhythm'];
    var scores = [], flags = [];
    dimKeys.forEach(function (k) {
      var d = dims[k];
      d.interpretation = interpOf(d.score);
      if (d.score != null) scores.push(d.score);
      flags.push.apply(flags, d.flags);
    });
    var overall = scores.length ? Math.round(scores.reduce(function (s, v) { return s + v; }, 0) / scores.length) : null;

    var profile = {
      version: 2,
      screeningNote: '本结果为亚健康人群脑功能趋势筛查, 非疾病诊断; 评分反映本次步行与人群参考的偏离程度, 建议定期复测看趋势',
      dimensions: dims,
      domains: dims,  // 兼容旧渲染路径 (旧键名不存在时自动跳过)
      radar: dimKeys.map(function (k) { return { key: k, label: dims[k].label, score: dims[k].score }; }),
      overallBrainScore: overall,
      lateralization: { leftBrain: null, rightBrain: null },
      subhealthFlags: flags
    };
    // 左右脑侧化 (仅由肩摆推断, 保留兼容字段; 肩摆信号异常时不输出)
    if (armSwing && armSwing.shoulder && (armSwing.shoulder.avgNormalized == null || armSwing.shoulder.avgNormalized <= 0.8)) {
      var sh = armSwing.shoulder;
      if (sh.rightNormalized != null) profile.lateralization.leftBrain = Math.round(clamp01(sh.rightNormalized / 0.25) * 100);
      if (sh.leftNormalized != null) profile.lateralization.rightBrain = Math.round(clamp01(sh.leftNormalized / 0.25) * 100);
    }
    if (overall == null) profile.brainGrade = '数据不足, 无法评估';
    else if (overall >= 75) profile.brainGrade = '脑功能状态良好';
    else if (overall >= 60) profile.brainGrade = '脑功能轻度偏离 (亚健康趋势)';
    else if (overall >= 45) profile.brainGrade = '脑功能中度偏离 (建议关注并复测)';
    else profile.brainGrade = '脑功能明显偏离 (建议结合专业评估)';

    return profile;
  }

  // ============================================================
  // 足跟着地检测 (Heel-Strike Detection)
  //
  // 算法: 踝关节 y 坐标在每步周期内有最低点 (离地最近, 图像 y 最小)
  //       + 速度从正向 (下落) 反转为负向 (抬起)
  //       + 短暂停滞 (帧间位移极小)
  //
  // 步骤: 1) 用 y 局部极小值定位候选
  //       2) 验证水平速度反转
  //       3) 中值滤波剔除离群点
  //       4) 最小间隔约束 (>= 0.30s, 正常人最快 ~200步/分)
  // ============================================================
  // 行走方向检测 — 从踝关节 X 轨迹判断患者从左向右还是从右向左走
  // ============================================================
  function detectWalkingDirection(frames) {
    if (!frames || frames.length < 30) return 'unknown';
    var leftX = [], rightX = [];
    for (var i = 0; i < frames.length; i++) {
      var la = getKp(frames[i], 'left_ankle');
      var ra = getKp(frames[i], 'right_ankle');
      if (la && la.score >= 0.3) leftX.push({ t: frames[i].t, x: la.x });
      if (ra && ra.score >= 0.3) rightX.push({ t: frames[i].t, x: ra.x });
    }
    // 合并两侧踝 X 的斜率
    var allX = leftX.concat(rightX).sort(function(a,b) { return a.t - b.t; });
    if (allX.length < 20) return 'unknown';
    // 线性回归求 X 趋势斜率
    var n = allX.length, sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (var j = 0; j < n; j++) {
      sx += allX[j].t; sy += allX[j].x;
      sxy += allX[j].t * allX[j].x; sx2 += allX[j].t * allX[j].t;
    }
    var slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    if (Math.abs(slope) < 3) return 'stationary';  // 几乎没有横向移动
    return slope > 0 ? 'left_to_right' : 'right_to_left';
  }

  // ============================================================
  // 左右标签校正 — 根据摄像头侧和行走方向, 校正 MoveNet 左右标签
  //
  // 侧方拍摄时, 靠近摄像头的腿在画面中更低 (y 更大), 置信度更高
  // 通过比较左右腿的平均置信度和 Y 位置, 判断哪条腿更靠近摄像头
  // 再根据用户指定的 cameraSide 决定是否需要交换标签
  // ============================================================
  function resolveAnatomicalSides(frames, cameraSide, walkDir) {
    if (!frames || frames.length < 10) return { swapNeeded: false, reason: 'insufficient_frames' };
    if (!cameraSide || (cameraSide !== 'left' && cameraSide !== 'right')) {
      cameraSide = 'right';  // 默认摄像头在患者右侧
    }
    // 统计左右腿关键点的平均置信度和 Y 位置
    var leftConf = 0, rightConf = 0, leftY = 0, rightY = 0;
    var leftCount = 0, rightCount = 0;
    for (var i = 0; i < frames.length; i++) {
      var la = getKp(frames[i], 'left_ankle');
      var ra = getKp(frames[i], 'right_ankle');
      var lk = getKp(frames[i], 'left_knee');
      var rk = getKp(frames[i], 'right_knee');
      var lh = getKp(frames[i], 'left_hip');
      var rh = getKp(frames[i], 'right_hip');
      if (la && la.score >= 0.2) { leftConf += la.score; leftY += la.y; leftCount++; }
      if (ra && ra.score >= 0.2) { rightConf += ra.score; rightY += ra.y; rightCount++; }
      if (lk && lk.score >= 0.2) { leftConf += lk.score; leftY += lk.y; leftCount++; }
      if (rk && rk.score >= 0.2) { rightConf += rk.score; rightY += rk.y; rightCount++; }
      if (lh && lh.score >= 0.2) { leftConf += lh.score; leftY += lh.y; leftCount++; }
      if (rh && rh.score >= 0.2) { rightConf += rh.score; rightY += rh.y; rightCount++; }
    }
    if (leftCount < 10 || rightCount < 10) return { swapNeeded: false, reason: 'insufficient_keypoints' };

    leftConf /= leftCount; rightConf /= rightCount;
    leftY /= leftCount; rightY /= rightCount;

    // 核心逻辑: 来回走时不同方向近摄像头的腿不同
    // - 摄像头在右侧, 走左→右: 右腿离摄像头更近 → rightY > leftY
    // - 摄像头在右侧, 走右→左: 左腿离摄像头更近 → leftY > rightY
    // - 摄像头在左侧, 则相反
    // 用 walking direction 来判断哪条腿应该更靠近镜头
    var expectedCloser = null;
    if (walkDir === 'left_to_right') {
      // X 增加: 如果摄像头在右侧, 右腿近; 在左侧, 左腿近
      expectedCloser = cameraSide;  // 走左→右时, cameraSide 侧腿更近
    } else if (walkDir === 'right_to_left') {
      // X 减少: cameraSide 的对侧腿更近
      expectedCloser = cameraSide === 'left' ? 'right' : 'left';
    }
    // stationary / unknown: 用原 Y 位置判断

    var leftCloser = (leftY > rightY) && (leftConf >= rightConf * 0.8);
    var rightCloser = (rightY > leftY) && (rightConf >= leftConf * 0.8);
    var yCloser = leftCloser ? 'left' : (rightCloser ? 'right' : null);
    // 优先信任 Y 位置 (近摄像头脚在画面更低 = "哪只脚近镜头"的直接物理证据);
    // walkDir 推导的 expectedCloser 仅作 fallback — 其"走向→近脚侧"映射在来回走/转身时
    // 不成立。矛盾时强信 expectedCloser 会错误交换: 近脚被标成对侧 → 该侧 HS 检测跟踪
    // 远脚失败 → 步态时相截图缺失 (表现为右脚对摄像头时识别不到, 左脚正常)。
    var closerSide = yCloser || expectedCloser;
    if (!closerSide) {
      return { swapNeeded: false, reason: 'ambiguous', yCloser: yCloser, expected: expectedCloser };
    }

    var swapNeeded = (closerSide !== cameraSide);

    return {
      swapNeeded: swapNeeded,
      closerSide: closerSide,
      cameraSide: cameraSide,
      walkDir: walkDir,
      expectedCloser: expectedCloser,
      yCloser: yCloser,
      yDiff: Math.abs(leftY - rightY),
      reason: expectedCloser ? ('walkdir_' + walkDir) : (swapNeeded ? 'y_only_mismatch' : 'y_only_ok'),
      leftConf: leftConf, rightConf: rightConf,
      leftY: leftY, rightY: rightY
    };
  }

  // 对帧数据执行左右标签交换
  function swapKeypointLabels(frames) {
    var swapMap = {
      'left_ankle': 'right_ankle', 'right_ankle': 'left_ankle',
      'left_knee': 'right_knee', 'right_knee': 'left_knee',
      'left_hip': 'right_hip', 'right_hip': 'left_hip',
      'left_shoulder': 'right_shoulder', 'right_shoulder': 'left_shoulder',
      'left_elbow': 'right_elbow', 'right_elbow': 'left_elbow',
      'left_wrist': 'right_wrist', 'right_wrist': 'left_wrist',
      'left_eye': 'right_eye', 'right_eye': 'left_eye',
      'left_ear':'right_ear','right_ear':'left_ear'
    };
    for (var i = 0; i < frames.length; i++) {
      var kps = frames[i].keypoints;
      if (!kps) continue;
      for (var j = 0; j < kps.length; j++) {
        var name = kps[j].name;
        if (swapMap[name]) {
          kps[j] = Object.assign({}, kps[j], { name: swapMap[name] });
        }
      }
    }
    return frames;
  }

  // ============================================================
  // 逐帧分段左右归侧 — 来回走专用
  //
  // 问题: 来回走时去程和回程各自近摄像头的脚不同 (去程右脚近, 回程左脚近)。
  //       MoveNet 在不同方向下对近/远脚的 left_/right_ 标注可能不一致,
  //       一个全局 swap 决策不可能同时让两段都正确 → 某段 detectHeelStrikes
  //       跟踪到对侧脚 → 该侧时相数据实为另一只脚的内容 (如右脚时相显示左脚)。
  //
  // 方案: 用滑动窗口对每一帧判断哪只脚离镜头更近 (近脚 y 更大=画面更低, 且
  //       置信度更高)。对 closerSide !== cameraSide 的帧就地交换该帧左右关键点
  //       标签。去程/回程各自得到正确校正, 不再互相干扰。
  // ============================================================
  var LR_SWAP_MAP = {
    'left_ankle': 'right_ankle', 'right_ankle': 'left_ankle',
    'left_knee': 'right_knee', 'right_knee': 'left_knee',
    'left_hip': 'right_hip', 'right_hip': 'left_hip',
    'left_shoulder': 'right_shoulder', 'right_shoulder': 'left_shoulder',
    'left_elbow': 'right_elbow', 'right_elbow': 'left_elbow',
    'left_wrist': 'right_wrist', 'right_wrist': 'left_wrist',
    'left_eye': 'right_eye', 'right_eye': 'left_eye',
    'left_ear': 'right_ear', 'right_ear': 'left_ear'
  };

  // ============================================================
  // 每帧局部走动方向 — 骨盆中心 X 滑窗线性回归 (共用内部函数)
  //
  // 来回走的关键: 去程(X增)和回程(X减)方向相反, 逐帧方向用于
  //   ① resolveAndSwapSidesByFrame 的左右归侧判定
  //   ② detectGaitEvents 的骨盆相对坐标换算 (heel_rel = (heel.x - pelvis.x) * dir)
  // 返回 { dir: [...], win } — dir 每帧方向 (1=X增 / -1=X减 / 0=全程未定),
  //         dir=0 的帧已前向填充为最近有效方向 (序列头部用第一个有效方向)
  // ============================================================
  function computeLocalDirections(frames) {
    var n = frames.length;
    // 滑动窗口 ~1.5s (30fps≈45帧); 短视频自适应, 最小15帧
    var win = Math.min(45, Math.max(15, Math.floor(n * 0.12)));
    var half = Math.floor(win / 2);

    // 窗口内髋中心 X 对 t 线性回归斜率
    var dirArr = new Array(n).fill(0); // 1=l2r, -1=r2l, 0=未定
    for (var i = 0; i < n; i++) {
      var xs = [], ts = [];
      for (var j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
        var lh = getKp(frames[j], 'left_hip');
        var rh = getKp(frames[j], 'right_hip');
        var hx = null;
        if (lh && rh && lh.score >= 0.2 && rh.score >= 0.2) hx = (lh.x + rh.x) / 2;
        else if (lh && lh.score >= 0.2) hx = lh.x;
        else if (rh && rh.score >= 0.2) hx = rh.x;
        if (hx != null) { xs.push(hx); ts.push(frames[j].t); }
      }
      if (xs.length >= 5) {
        var m = xs.length, sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (var k = 0; k < m; k++) { sx += ts[k]; sy += xs[k]; sxy += ts[k] * xs[k]; sx2 += ts[k] * ts[k]; }
        var denom = m * sx2 - sx * sx;
        if (Math.abs(denom) > 1e-9) {
          var slope = (m * sxy - sx * sy) / denom;
          if (slope > 3) dirArr[i] = 1;
          else if (slope < -3) dirArr[i] = -1;
        }
      }
    }

    // 前向填充: dir=0 的帧沿用最近有效方向; 序列头部用第一个有效方向
    var lastD = 0;
    for (var i = 0; i < n; i++) { if (dirArr[i] !== 0) lastD = dirArr[i]; else dirArr[i] = lastD; }
    if (dirArr[0] === 0) {
      var firstD = 0;
      for (var i = 0; i < n; i++) { if (dirArr[i] !== 0) { firstD = dirArr[i]; break; } }
      for (var i = 0; i < n; i++) { if (dirArr[i] !== 0) break; dirArr[i] = firstD; }
    }
    return { dir: dirArr, win: win };
  }

  function resolveAndSwapSidesByFrame(frames, cameraSide) {
    var result = { frames: frames, swapNeeded: false, swapRatio: 0,
                   cameraSide: cameraSide, reason: 'per_frame_dir_aware' };
    if (!frames || frames.length < 10) { result.reason = 'insufficient_frames'; return result; }
    var cs = (!cameraSide || (cameraSide !== 'left' && cameraSide !== 'right')) ? 'right' : cameraSide;
    result.cameraSide = cs;
    var opposite = cs === 'left' ? 'right' : 'left';

    var n = frames.length;
    // 滑动窗口 ~1.5s (30fps≈45帧); 短视频自适应, 最小15帧
    var win = Math.min(45, Math.max(15, Math.floor(n * 0.12)));
    var half = Math.floor(win / 2);

    // === 1. 每帧 closerSide: 窗口内左右踝 "y*置信度" 加权平均, 近脚 y 更大 ===
    var closer = new Array(n).fill(null);
    for (var i = 0; i < n; i++) {
      var lWY = 0, lW = 0, rWY = 0, rW = 0;
      for (var j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
        var la = getKp(frames[j], 'left_ankle');
        var ra = getKp(frames[j], 'right_ankle');
        if (la && la.score >= 0.2) { lWY += la.y * la.score; lW += la.score; }
        if (ra && ra.score >= 0.2) { rWY += ra.y * ra.score; rW += ra.score; }
      }
      if (lW > 0 && rW > 0) {
        var lAvg = lWY / lW, rAvg = rWY / rW;
        if (lAvg > rAvg * 1.05) closer[i] = 'left';
        else if (rAvg > lAvg * 1.05) closer[i] = 'right';
      }
    }

    // === 2. 每帧局部走动方向: 由共用函数 computeLocalDirections 计算 ===
    // 来回走的关键: 去程(X增)和回程(X减)各自近摄像头的脚不同, 必须按方向区分
    //   摄像头在右 + X增(去程) → 患者右脚近 → 期望 right_ankle = 近脚
    //   摄像头在右 + X减(回程) → 患者左脚近 → 期望 left_ankle = 近脚
    var dirArr = computeLocalDirections(frames).dir; // 1=l2r, -1=r2l, 0=未定 (已前向填充)

    // === 3. 前向填充 closer 和 dir 的空缺 (转身/不确定区沿用上一判定) ===
    var hasAny = false;
    for (var i = 0; i < n; i++) { if (closer[i]) { hasAny = true; break; } }
    if (!hasAny) {
      // closer 全 null → 全局 fallback
      var gLY = 0, gLW = 0, gRY = 0, gRW = 0;
      for (var i = 0; i < n; i++) {
        var la = getKp(frames[i], 'left_ankle');
        var ra = getKp(frames[i], 'right_ankle');
        if (la && la.score >= 0.2) { gLY += la.y * la.score; gLW += la.score; }
        if (ra && ra.score >= 0.2) { gRY += ra.y * ra.score; gRW += ra.score; }
      }
      var gCloser = null;
      if (gLW > 0 && gRW > 0) { if (gLY / gLW > gRY / gRW) gCloser = 'left'; else gCloser = 'right'; }
      for (var i = 0; i < n; i++) closer[i] = gCloser;
      result.reason = 'global_fallback';
    } else {
      var lastC = null;
      for (var i = 0; i < n; i++) { if (closer[i]) lastC = closer[i]; else closer[i] = lastC; }
      if (!closer[0]) {
        var firstC = null;
        for (var i = 0; i < n; i++) { if (closer[i]) { firstC = closer[i]; break; } }
        for (var i = 0; i < n; i++) { if (closer[i]) break; closer[i] = firstC; }
      }
    }
    // dir 前向填充已在 computeLocalDirections 内完成

    // === 4. 逐帧 swap: expectedSide 由局部方向+cameraSide 决定 ===
    // dir=l2r → expected=cameraSide; dir=r2l → expected=opposite
    // swap 当 closerSide(近脚的MoveNet标签) !== expectedSide(近脚应是的患者侧)
    var swapCount = 0;
    for (var i = 0; i < n; i++) {
      var c = closer[i];
      if (!c) continue;
      var expected = dirArr[i] === -1 ? opposite : cs;
      if (c !== expected) {
        var kps = frames[i].keypoints;
        if (kps) {
          for (var j = 0; j < kps.length; j++) {
            var nm = kps[j].name;
            if (LR_SWAP_MAP[nm]) {
              kps[j] = Object.assign({}, kps[j], { name: LR_SWAP_MAP[nm] });
            }
          }
          swapCount++;
        }
      }
    }

    result.swapRatio = n > 0 ? swapCount / n : 0;
    result.swapNeeded = result.swapRatio > 0.5;
    return result;
  }

  // ============================================================
  // 人体像素身高估算 (文件级共用)
  //
  // 单帧: nose→双踝中点 的像素距离 (nose 缺失时用肩, 肩位≈82%身高 故 ×1.22)
  // 序列: 全部有效帧的中位数, 抗单帧抖动
  // 用于: ① detectHeelStrikes 的摆动深度/恢复容差自适应
  //       ② detectGaitEvents 的 prominence 阈值 + 逐事件 bodyH (逐周期 scale)
  // ============================================================
  function bodyHeightAtFrame(frame) {
    // 尝试 nose 作为上端点, 肩部作为 fallback (侧方45°拍摄时肩膀更可见)
    var nose = getKp(frame, 'nose');
    var ls = getKp(frame, 'left_shoulder');
    var rs = getKp(frame, 'right_shoulder');
    var la = getKp(frame, 'left_ankle');
    var ra = getKp(frame, 'right_ankle');
    if (!la || !ra || la.score < 0.25 || ra.score < 0.25) return null;
    var ankleY = (la.y + ra.y) / 2;
    var upperY = null;
    var scale = 1;
    if (nose && nose.score >= 0.25) {
      upperY = nose.y;
      scale = 1;  // nose = 头顶附近, 1:1
    } else if (ls && rs && ls.score >= 0.25 && rs.score >= 0.25) {
      upperY = (ls.y + rs.y) / 2;
      scale = 1.22;  // 肩位 ≈ 82% 身高, scale up
    } else if (ls && ls.score >= 0.25) {
      upperY = ls.y;
      scale = 1.22;
    } else if (rs && rs.score >= 0.25) {
      upperY = rs.y;
      scale = 1.22;
    }
    if (upperY === null) return null;
    var h = (ankleY - upperY) * scale;
    if (h > 30 && h < 2000) return h;  // 合理范围: 30-2000px
    return null;
  }

  function estimateBodyHeightPx(frames) {
    var heights = [];
    for (var i = 0; i < frames.length; i++) {
      var h = bodyHeightAtFrame(frames[i]);
      if (h !== null) heights.push(h);
    }
    if (heights.length < 5) return null;
    heights.sort(function (a, b) { return a - b; });
    return heights[Math.floor(heights.length * 0.5)]; // median
  }

  // ============================================================
  // 脚跟着地检测 (HS) — 抗噪声 v2 [旧 Y 轨迹法, 现为 fallback]
  //
  // 注意: 主路径已改为 detectGaitEvents (Zeni 骨盆相对坐标法, HS = heel_rel
  //       局部极大值 = 真实脚跟触地 IC)。本函数定义的 "Y 回升到 70% 基线" 实际
  //       是全掌着地时刻, 比真实 IC 系统性偏晚, 仅在 detectGaitEvents 返回
  //       usedMethod='none' (骨盆相对轨迹无有效周期, 如原地站立) 时作 fallback。
  //
  // 旧算法找 y 局部极小值 (= 摆动顶点 = 脚最高), 与 HS 概念错位;
  //                  干净数据下偏移抵消能用, 有噪声时被噪声尖峰淹没
  // 算法:
  //   1) 中值滤波 (window=5) + 二次滑动平均 — 抗 ±5px MoveNet 抖动
  //   2) 计算 stance 基线 (y 70% 分位数 — 多数时间脚在地)
  //   3) 检测摆动顶点 (y < 基线 - 8px, 局部极小值)
  //   4) HS = 摆动顶点之后, y 上升回到 (基线 - 5px) 以内的**第一个点**
  //   5) 起点/终点特殊处理 + 最小间隔 0.40s
  function detectHeelStrikes(frames, side) {
    // 优先用真实脚跟关键点 (MediaPipe 33点), fallback 到踝
    var kpName = side + '_heel';
    var points = [];
    for (var i = 0; i < frames.length; i++) {
      var kp = getKp(frames[i], kpName);
      if (kp && kp.score >= 0.3) {
        points.push({ frame: i, t: frames[i].t, y: kp.y, x: kp.x, score: kp.score });
      }
    }
    // 脚跟点不足 → 退回踝
    if (points.length < 5) {
      kpName = side + '_ankle';
      points = [];
      for (var i = 0; i < frames.length; i++) {
        var kp = getKp(frames[i], kpName);
        if (kp && kp.score >= 0.3) {
          points.push({ frame: i, t: frames[i].t, y: kp.y, x: kp.x, score: kp.score });
        }
      }
    }
    if (points.length < 5) return [];

    // ---------- 0. 从全部关键点估算人体像素身高 (共用函数, 中位数) ----------
    var bodyH = estimateBodyHeightPx(frames);
    var anklePts = points.length;
    // 摆动深度 = 身体像素 2.5% (放宽到 2% 抗低 fps 抖动, 正常步态踝垂直位移 ~5cm/170cm)
    // min 2px (远距手机), max 25px (近距), 默认 6px (无身高信息 — 从 8 降, 抗噪)
    var SWING_DEPTH = bodyH ? Math.max(2, Math.min(25, bodyH * 0.025)) : 6;
    // 恢复容差: min 1px, max 12px, 无身高信息 fallback 4px (从 5 降, 抗噪)
    var HS_RECOVERY_TOL = bodyH ? Math.max(1, Math.min(12, bodyH * 0.012)) : 4;
    console.log('[gait] HS ' + side + ': ankle=' + anklePts + ' bodyH=' + (bodyH ? bodyH.toFixed(0) : 'N/A') +
                ' swingDepth=' + SWING_DEPTH.toFixed(1) + ' tol=' + HS_RECOVERY_TOL.toFixed(1));

    // ---------- 1. 中值滤波 (window=5) 抗脉冲噪声 ----------
    function medianFilter(pts, win) {
      var half = Math.floor(win / 2);
      var result = [];
      for (var p = 0; p < pts.length; p++) {
        var ys = [];
        for (var q = -half; q <= half; q++) {
          if (p + q >= 0 && p + q < pts.length) ys.push(pts[p + q].y);
        }
        ys.sort(function (a, b) { return a - b; });
        result.push({
          y: ys[Math.floor(ys.length / 2)],
          x: pts[p].x,
          frame: pts[p].frame,
          t: pts[p].t,
          score: pts[p].score
        });
      }
      return result;
    }
    var smoothed = medianFilter(points, 5);

    // ---------- 1b. 二次 5 帧滑动平均 — 平滑残余抖动 ----------
    smoothed = smoothed.map(function (s, idx) {
      var sumY = 0, cnt = 0;
      for (var q = -2; q <= 2; q++) {
        if (idx + q >= 0 && idx + q < smoothed.length) {
          sumY += smoothed[idx + q].y;
          cnt++;
        }
      }
      return { y: sumY / cnt, x: s.x, frame: s.frame, t: s.t, score: s.score };
    });

    // ---------- 2. 计算 stance 基线 (y 70% 分位数) ----------
    var allY = smoothed.map(function (s) { return s.y; }).slice().sort(function (a, b) { return a - b; });
    var baseline = allY[Math.floor(allY.length * 0.70)];

    // ---------- 3. 摆动顶点检测 + 4. HS = 上升回基线 ----------
    // SWING_DEPTH / HS_RECOVERY_TOL 已在上面根据人体身高自适应计算
    var HS_RECOVERY_WIN = 0.70;   // 摆动顶点后 0.70s 内必须恢复 (覆盖慢走 60 SPM: cycle=2s, swing≈0.6s)
    var PEAK_SEARCH_WIN = 5;      // 摆动顶点局部最小值搜索窗口 (10 帧 = 0.33s)

    var candidates = [];

    // 从前往后扫描, 找每个摆动顶点, 然后找其后第一个恢复点
    for (var k = PEAK_SEARCH_WIN; k < smoothed.length - PEAK_SEARCH_WIN; k++) {
      // 必须是局部极小值 (在 ±PEAK_SEARCH_WIN 窗口内)
      var isLocalMin = true;
      for (var q = -PEAK_SEARCH_WIN; q <= PEAK_SEARCH_WIN; q++) {
        if (q === 0) continue;
        if (smoothed[k + q].y < smoothed[k].y) { isLocalMin = false; break; }
      }
      if (!isLocalMin) continue;
      // 必须低于 stance 基线至少 SWING_DEPTH
      if (smoothed[k].y >= baseline - SWING_DEPTH) continue;

      // 找恢复点: k 之后, y 上升到 ≥ (baseline - HS_RECOVERY_TOL) 的第一个点
      var recoveryTarget = baseline - HS_RECOVERY_TOL;
      for (var j = k + 1; j < smoothed.length; j++) {
        if (smoothed[j].t - smoothed[k].t > HS_RECOVERY_WIN) break;  // 超时未恢复 → 跳过
        if (smoothed[j].y >= recoveryTarget) {
          candidates.push({
            frameIndex: smoothed[j].frame,
            time: smoothed[j].t,
            x: smoothed[j].x,
            y: smoothed[j].y,
            confidence: smoothed[j].score
          });
          break;  // 每个摆动顶点只产生一个 HS
        }
      }
    }

    // ---------- 4b. 起点/终点补点 ----------
    // 用户可能在周期中段开始录制 → 序列开始/结束时脚正好处于 stance
    // 在前 SEARCH_WIN*2 帧内, 若 y 接近基线, 视为 HS 候选
    var headSearch = Math.min(PEAK_SEARCH_WIN * 2, smoothed.length - 1);
    for (var j = 0; j < headSearch; j++) {
      if (smoothed[j].y >= baseline - HS_RECOVERY_TOL && smoothed[j].y <= baseline + HS_RECOVERY_TOL) {
        candidates.unshift({
          frameIndex: smoothed[j].frame,
          time: smoothed[j].t,
          x: smoothed[j].x,
          y: smoothed[j].y,
          confidence: smoothed[j].score
        });
        break;
      }
    }
    // 终点: 序列末尾若 y 接近基线 → HS 候选
    var tailStart = Math.max(0, smoothed.length - headSearch);
    for (var j = smoothed.length - 1; j >= tailStart; j--) {
      if (smoothed[j].y >= baseline - HS_RECOVERY_TOL && smoothed[j].y <= baseline + HS_RECOVERY_TOL) {
        candidates.push({
          frameIndex: smoothed[j].frame,
          time: smoothed[j].t,
          x: smoothed[j].x,
          y: smoothed[j].y,
          confidence: smoothed[j].score
        });
        break;
      }
    }

    // ---------- 5. 最小间隔约束 (>= 0.40s, 防重复检测) ----------
    var minInterval = 0.40;
    var result = [];
    var lastT = -Infinity;
    candidates.sort(function (a, b) { return a.time - b.time; });
    for (var c = 0; c < candidates.length; c++) {
      var cand = candidates[c];
      if (cand.time - lastT < minInterval) {
        // 间隔太短, 保留 y 更接近 baseline 的 (即更"落地")
        if (result.length > 0 && Math.abs(cand.y - baseline) < Math.abs(result[result.length - 1].y - baseline)) {
          result[result.length - 1] = {
            frameIndex: cand.frameIndex,
            time: cand.time,
            x: cand.x,
            y: cand.y,
            confidence: cand.score
          };
          lastT = cand.time;
        }
        continue;
      }
      result.push({
        frameIndex: cand.frameIndex,
        time: cand.time,
        x: cand.x,
        y: cand.y,
        confidence: cand.score
      });
      lastT = cand.time;
    }
    return result;
  }

  /**
   * 脚尖离地检测 (Toe-Off, TO): 踝关节 y 速度达到该步周期最大上升速度的时刻
   * [旧 Y 轨迹法, 现为 fallback — 主路径用 detectGaitEvents 的 toe_rel 局部极小值]
   *
   * 算法: 在两次 heel-strike 之间 (一个完整步态周期), 寻找踝关节 y 速度
   *       由负转正 (由下降转为上升) 的最大速度时刻 = 脚蹬离地面瞬间
   *
   * 简化策略: 在每个周期后半段 (50-100% cycle), 找 y 局部极大值 (踝抬起到最高)
   *           然后向前追溯到 y 开始上升的反转点 = 脚尖离地
   */
  function detectToeOffs(frames, side, heelStrikes) {
    if (!frames || frames.length < 3 || heelStrikes.length < 2) return [];
    // 优先用真实脚尖关键点 (MediaPipe foot_index), fallback 到踝
    var kpName = side + '_foot_index';
    var points = [];
    for (var i = 0; i < frames.length; i++) {
      var kp = getKp(frames[i], kpName);
      if (kp && kp.score >= 0.3) points.push({ frame: i, t: frames[i].t, y: kp.y, x: kp.x, score: kp.score });
    }
    if (points.length < 3) {
      kpName = side + '_ankle';
      points = [];
      for (var i = 0; i < frames.length; i++) {
        var kp = getKp(frames[i], kpName);
        if (kp && kp.score >= 0.3) points.push({ frame: i, t: frames[i].t, y: kp.y, x: kp.x, score: kp.score });
      }
    }
    if (points.length < 3) return [];
    // 平滑
    var smoothed = [];
    for (var p = 0; p < points.length; p++) {
      var sum = 0, count = 0;
      for (var q = -1; q <= 1; q++) {
        if (p + q >= 0 && p + q < points.length) { sum += points[p + q].y; count++; }
      }
      smoothed.push({ y: sum / count, t: points[p].t, frame: points[p].frame, x: points[p].x });
    }
    // 计算 y 速度
    var velocities = [];
    for (var v = 1; v < smoothed.length; v++) {
      var dt = smoothed[v].t - smoothed[v - 1].t;
      if (dt <= 0) { velocities.push(0); continue; }
      velocities.push((smoothed[v].y - smoothed[v - 1].y) / dt);  // 像素/秒
    }
    // 在每个步态周期内 (HS[i] ~ HS[i+1]) 的后 30-70% 区间找 TO
    // 经验: TO 发生在周期的 60-65% (步态周期支撑相 60%, 摆动相 40%)
    var results = [];
    for (var h = 0; h < heelStrikes.length - 1; h++) {
      var hsT0 = heelStrikes[h].time;
      var hsT1 = heelStrikes[h + 1].time;
      var cycle = hsT1 - hsT0;
      if (cycle <= 0) continue;
      // TO 算法: HS[i] 检测到踝 y 局部最小值 (mid-stance), TO 是踝 y 首次明显上升的时刻
      // 用阈值法: 在 HS[i] 之后, 找第一个 y 比 HS[i] 时高出 >10px 的帧 (≈脚离地 ≥3cm)
      // 兜底: 整个周期内 y 速度 (vy) 最大的点
      var hsY = null;
      for (var p = 0; p < smoothed.length; p++) {
        if (Math.abs(smoothed[p].t - hsT0) < 0.05) { hsY = smoothed[p].y; break; }
      }
      var TO_THRESHOLD = 10;  // 像素, 代表脚抬离地面 ~3cm
      var maxVy = -Infinity, maxIdx = -1, firstRiseIdx = -1;
      for (var s = 0; s < smoothed.length - 1; s++) {
        var tt = smoothed[s].t;
        if (tt < hsT0 + 0.05 || tt > hsT0 + cycle * 0.85) continue;
        // 阈值法: 找第一个 y > hsY + 10 的点
        if (firstRiseIdx < 0 && hsY !== null && smoothed[s].y > hsY + TO_THRESHOLD) {
          firstRiseIdx = s;
        }
        // 速度法: 兜底
        var vy = (smoothed[s + 1].y - smoothed[s].y) / Math.max(smoothed[s + 1].t - smoothed[s].t, 0.001);
        if (vy > maxVy) { maxVy = vy; maxIdx = s; }
      }
      var chosenIdx = firstRiseIdx >= 0 ? firstRiseIdx : maxIdx;
      if (chosenIdx >= 0) {
        results.push({
          frameIndex: smoothed[chosenIdx].frame,
          time: smoothed[chosenIdx].t,
          x: smoothed[chosenIdx].x,
          y: smoothed[chosenIdx].y,
          cycleIndex: h,
          cyclePct: ((smoothed[chosenIdx].t - hsT0) / cycle) * 100,
          velocity: maxVy,
          method: firstRiseIdx >= 0 ? 'threshold' : 'velocity_peak'
        });
      }
    }
    console.log('[gait] HS ' + side + ': found ' + results.length + ' heel strikes');
    return results;
  }

  // ============================================================
  // 步态事件检测 (HS/TO) — Zeni et al. (2008) 骨盆相对坐标法 [主路径]
  //
  // 原理: 脚跟相对骨盆的前向位移 (heel_rel = (heel.x - pelvis.x) × dir) 在
  //       脚跟着地瞬间 (Initial Contact) 达到局部极大值; 脚尖相对位移
  //       (toe_rel) 在脚尖离地 (Toe-Off) 前达到局部极小值。
  //       相比旧 Y 轨迹法 ("Y 回升到 70% 基线" = 全掌着地, 比真实 IC 偏晚),
  //       该方法直接锚定 IC, 8 时相截图不再系统性错位。
  //
  // 流程:
  //   1) 每帧 pelvis = mid(left_hip, right_hip) (单 hip 可用则用之)
  //   2) 分段步向 dir = computeLocalDirections (与左右归侧共用)
  //   3) heel_rel / toe_rel 序列 (foot_index 缺失/低分退回 ankle)
  //   4) 预处理: 短洞 (≤0.25s) 线性插值, 长洞保留 NaN; 中值滤波(win=3)
  //      → 前向+后向各一次滑动平均(win=5, 零相位不偏移极值)
  //   5) HS = heel_rel 局部极大值 (prominence ≥ max(3px, 1.5%×bodyH), 最小间隔 0.40s)
  //   6) TO = 每个 HS→HS 周期 [15%,85%] 区间内 toe_rel 最深局部极小值
  //   7) 双脚交替一致性检查 (相邻异侧 HS 相位差应在周期的 30%-70%)
  //   8) 抛物线插值亚帧精炼 (frameIndex 保持整数帧, time 为亚帧秒数)
  // ============================================================
  function detectGaitEvents(frames) {
    var result = {
      left:  { hs: [], to: [] },
      right: { hs: [], to: [] },
      walkDir: 0,
      usedMethod: 'none',
      debug: {
        t: [],
        heelRel: { left: [], right: [] },
        toeRel:  { left: [], right: [] },
        heelY:   { left: [], right: [] },   // 滤波后的 Y 轨迹 (旧 Y 法 fallback 对照/调试用)
        toeY:    { left: [], right: [] }
      }
    };
    if (!frames || frames.length < 10) return result;
    var n = frames.length;

    // ---------- 1. 每帧骨盆中心 (两 hip score≥0.2 取中点; 单 hip 可用则用之) ----------
    var pelvisX = new Array(n).fill(NaN);
    for (var i = 0; i < n; i++) {
      var lh = getKp(frames[i], 'left_hip');
      var rh = getKp(frames[i], 'right_hip');
      if (lh && rh && lh.score >= 0.2 && rh.score >= 0.2) pelvisX[i] = (lh.x + rh.x) / 2;
      else if (lh && lh.score >= 0.2) pelvisX[i] = lh.x;
      else if (rh && rh.score >= 0.2) pelvisX[i] = rh.x;
    }

    // ---------- 2. 分段步向 (复用左右归侧的滑窗回归, dir=0 帧已沿用最近有效方向) ----------
    var dirArr = computeLocalDirections(frames).dir;
    var posVotes = 0, negVotes = 0;
    for (var i = 0; i < n; i++) {
      if (dirArr[i] > 0) posVotes++;
      else if (dirArr[i] < 0) negVotes++;
    }
    result.walkDir = posVotes > negVotes ? 1 : (negVotes > posVotes ? -1 : 0);

    // ---------- 3. 骨盆相对坐标原始序列 ----------
    // heel_rel = (heel.x - pelvis.x) × dir;  toe_rel = (foot_index.x - pelvis.x) × dir
    // score<0.25 的帧视为缺失 (NaN); dir=0 (全程无有效方向) 或 pelvis 缺失的帧同样 NaN
    function extractSideSeries(side) {
      var heelX = new Array(n).fill(NaN), heelY = new Array(n).fill(NaN);
      var toeX  = new Array(n).fill(NaN), toeY  = new Array(n).fill(NaN);
      for (var i = 0; i < n; i++) {
        var d = dirArr[i];
        if (d === 0 || isNaN(pelvisX[i])) continue;
        var hk = getKp(frames[i], side + '_heel');
        if (hk && hk.score >= 0.25) {
          heelX[i] = (hk.x - pelvisX[i]) * d;
          heelY[i] = hk.y;
        }
        var tk = getKp(frames[i], side + '_foot_index');
        if (!tk || tk.score < 0.25) tk = getKp(frames[i], side + '_ankle');  // foot_index 缺失/低分退回踝
        if (tk && tk.score >= 0.25) {
          toeX[i] = (tk.x - pelvisX[i]) * d;
          toeY[i] = tk.y;
        }
      }
      return { heelX: heelX, heelY: heelY, toeX: toeX, toeY: toeY };
    }

    // ---------- 4. 序列预处理 ----------
    // ≤0.25s 的洞: 在洞边界有效帧之间线性插值; 更长洞保留 NaN 不参与极值检测
    function interpolateShortGaps(arr) {
      var out = arr.slice();
      var i = 0;
      while (i < n) {
        if (!isNaN(out[i])) { i++; continue; }
        var start = i;
        while (i < n && isNaN(out[i])) i++;
        var prevIdx = start - 1, nextIdx = i;  // 洞 [start, i)
        if (prevIdx >= 0 && nextIdx < n) {
          var gapSec = frames[nextIdx].t - frames[prevIdx].t;
          if (gapSec <= 0.25 + 1e-9) {
            for (var g = start; g < i; g++) {
              var ratio = (frames[g].t - frames[prevIdx].t) / gapSec;
              out[g] = arr[prevIdx] + (arr[nextIdx] - arr[prevIdx]) * ratio;
            }
          }
        }
      }
      return out;
    }
    // 中值滤波 win=3 (跳过 NaN)
    function medianFilter3(arr) {
      var out = new Array(n).fill(NaN);
      for (var i = 0; i < n; i++) {
        if (isNaN(arr[i])) continue;
        var vals = [];
        for (var w = -1; w <= 1; w++) {
          var j = i + w;
          if (j >= 0 && j < n && !isNaN(arr[j])) vals.push(arr[j]);
        }
        vals.sort(function (a, b) { return a - b; });
        out[i] = vals[Math.floor(vals.length / 2)];
      }
      return out;
    }
    // 前向/后向滑动平均 win=5 (前向+后向各一次 = 零相位, 不偏移极值位置)
    // NaN 洞处窗口重置, 不跨洞平均
    function movingAvgPass(arr, forward) {
      var out = new Array(n).fill(NaN);
      var queue = [], qSum = 0;
      for (var k = 0; k < n; k++) {
        var i = forward ? k : (n - 1 - k);
        if (isNaN(arr[i])) { queue = []; qSum = 0; continue; }
        queue.push(arr[i]); qSum += arr[i];
        if (queue.length > 5) qSum -= queue.shift();
        out[i] = qSum / queue.length;
      }
      return out;
    }
    function preprocessSeries(arr) {
      return movingAvgPass(movingAvgPass(medianFilter3(interpolateShortGaps(arr)), true), false);
    }

    // ---------- 5. 人体像素身高 (prominence 阈值 + 逐事件 bodyH) ----------
    var bodyHGlobal = estimateBodyHeightPx(frames);
    var minProm = Math.max(3, (bodyHGlobal || 0) * 0.015);

    // ---------- 6. HS = heel_rel 局部极大值 (带 prominence 与最小间隔约束) ----------
    function findPeaks(series, minIntervalSec, minPromOverride) {
      var minPromUse = minPromOverride != null ? minPromOverride : minProm;
      var cands = [];
      for (var i = 1; i < n - 1; i++) {
        var v = series[i];
        if (isNaN(v)) continue;
        var vm = series[i - 1], vp = series[i + 1];
        if (isNaN(vm) || isNaN(vp)) continue;
        if (!(v >= vm && v >= vp && (v > vm || v > vp))) continue;
        // prominence: 左右两侧"更高点 / NaN 洞 / 序列端"之间的最小值, 取两侧较大者
        var leftMin = v, rightMin = v;
        for (var l = i - 1; l >= 0; l--) {
          var lv = series[l];
          if (isNaN(lv) || lv > v) break;
          if (lv < leftMin) leftMin = lv;
        }
        for (var r = i + 1; r < n; r++) {
          var rv = series[r];
          if (isNaN(rv) || rv > v) break;
          if (rv < rightMin) rightMin = rv;
        }
        var prom = v - Math.max(leftMin, rightMin);
        if (prom >= minPromUse) cands.push({ i: i, prom: prom });
      }
      // 最小间隔 0.40s: 冲突时保留 prominence 更高者
      var kept = [];
      for (var c = 0; c < cands.length; c++) {
        var cd = cands[c];
        if (kept.length && frames[cd.i].t - frames[kept[kept.length - 1].i].t < minIntervalSec) {
          if (cd.prom > kept[kept.length - 1].prom) kept[kept.length - 1] = cd;
          continue;
        }
        kept.push(cd);
      }
      return kept;
    }

    // ---------- 6b. 逐侧自适应阈值 + 漏检补检 ----------
    // 序列 10%-90% 分位振幅 (评估该侧 heel_rel 摆动幅度)
    function seriesAmplitude(series) {
      var vals = [];
      for (var i = 0; i < series.length; i++) { if (!isNaN(series[i])) vals.push(series[i]); }
      if (vals.length < 10) return 0;
      vals.sort(function (a, b) { return a - b; });
      return vals[Math.floor(vals.length * 0.9)] - vals[Math.floor(vals.length * 0.1)];
    }

    // 漏检补检: 相邻峰间隔异常 (>1.5×期望周期) 时, 间隔内用 40% 阈值复扫最强局部极大值
    // 期望周期由调用方传入 (双侧合并中位数) — 单侧中位数会被漏检合并周期污染
    // (真实视频确诊: 右脚 spans 0.7,0.95,1.7,2.1,2.76 → 单侧中位 1.7s 过宽, 缺口不触发)
    // 超过 3× 期望周期的缺口是转身/站立, 不补
    function fillMissedPeaks(series, peaks, fullProm, expectedGap) {
      var maxFill = expectedGap * 3.0;
      for (var round = 0; round < 3; round++) {
        if (peaks.length < 2) break;
        var inserted = false;
        for (var i = 0; i < peaks.length - 1; i++) {
          var i0 = peaks[i].i, i1 = peaks[i + 1].i;
          var gapDur = frames[i1].t - frames[i0].t;
          if (gapDur <= expectedGap * 1.5 || gapDur > maxFill) continue;
          var best = null;
          for (var k = i0 + 2; k < i1 - 1; k++) {
            // 与两端 HS 至少间隔 0.5s (步行同脚触地不可能更近, 防止补在邻近假峰上)
            if (frames[k].t - frames[i0].t < 0.5 || frames[i1].t - frames[k].t < 0.5) continue;
            var v = series[k];
            if (isNaN(v)) continue;
            var vm = series[k - 1], vp = series[k + 1];
            if (isNaN(vm) || isNaN(vp)) continue;
            if (!(v >= vm && v >= vp && (v > vm || v > vp))) continue;
            // 与 findPeaks 相同的 prominence 估算
            var leftMin = v, rightMin = v;
            for (var l = k - 1; l > i0; l--) { var lv = series[l]; if (isNaN(lv) || lv > v) break; if (lv < leftMin) leftMin = lv; }
            for (var r = k + 1; r < i1; r++) { var rv = series[r]; if (isNaN(rv) || rv > v) break; if (rv < rightMin) rightMin = rv; }
            var prom = v - Math.max(leftMin, rightMin);
            if (prom >= fullProm * 0.4 && (!best || prom > best.prom)) best = { i: k, prom: prom };
          }
          if (best) {
            console.log('[gait] HS recovered: gap ' + gapDur.toFixed(2) + 's, 补 frame ' + best.i + ' (prom=' + best.prom.toFixed(1) + ')');
            peaks.splice(i + 1, 0, { i: best.i, prom: best.prom, recovered: true });
            inserted = true;
            i++;  // 跳过新插入峰, 继续检查其后的间隔
          }
        }
        if (!inserted) break;
      }
      return peaks;
    }

    // ---------- 7. TO = 周期 [15%,85%] 窗口内 toe_rel 最深局部极小值 ----------
    function findDeepestTrough(series, t0, t1) {
      var best = null;
      for (var i = 1; i < n - 1; i++) {
        var t = frames[i].t;
        if (t < t0 || t > t1) continue;
        var v = series[i];
        if (isNaN(v)) continue;
        var vm = series[i - 1], vp = series[i + 1];
        if (isNaN(vm) || isNaN(vp)) continue;
        if (!(v <= vm && v <= vp && (v < vm || v < vp))) continue;
        if (!best || v < best.v) best = { i: i, v: v };
      }
      return best;
    }

    // ---------- 9. 亚帧抛物线插值: 返回相对帧 i 的亚帧偏移 (-0.8..0.8 帧) ----------
    function parabolicOffset(series, i) {
      if (i < 1 || i >= n - 1) return 0;
      var y0 = series[i - 1], y1 = series[i], y2 = series[i + 1];
      if (isNaN(y0) || isNaN(y1) || isNaN(y2)) return 0;
      var a = (y0 + y2 - 2 * y1) / 2;
      var b = (y2 - y0) / 2;
      if (Math.abs(a) < 1e-9) return 0;
      var off = -b / (2 * a);
      if (off < -0.8 || off > 0.8) return 0;
      return off;
    }
    function refinedTime(series, i) {
      var off = parabolicOffset(series, i);
      var dt = (frames[Math.min(n - 1, i + 1)].t - frames[Math.max(0, i - 1)].t) / 2;
      return frames[i].t + off * dt;
    }

    // ---------- 主流程: 逐侧提取 → 滤波 → 初检 → pooled 期望周期补检 → 建 HS/TO ----------
    var sideData = {};
    ['left', 'right'].forEach(function (side) {
      var ser = extractSideSeries(side);
      var heelRelX = preprocessSeries(ser.heelX);
      var toeRelX  = preprocessSeries(ser.toeX);
      // Y 序列同样预处理 (旧 Y 轨迹 fallback 与调试视图用)
      var heelYs = preprocessSeries(ser.heelY);
      var toeYs  = preprocessSeries(ser.toeY);
      // debug 轨迹 (含 NaN)
      for (var i = 0; i < n; i++) {
        if (side === 'left') result.debug.t.push(frames[i].t);
        result.debug.heelRel[side].push(heelRelX[i]);
        result.debug.toeRel[side].push(toeRelX[i]);
        result.debug.heelY[side].push(heelYs[i]);
        result.debug.toeY[side].push(toeYs[i]);
      }
      // HS 初检: heel_rel 局部极大值 — 逐侧自适应 prominence:
      // 远侧脚 (遮挡+透视) heel_rel 振幅小, 全局一刀切阈值会漏检 →
      // 阈值取 max(3px, 0.8%×bodyH) 与 25%×该侧振幅 的较小者 (近侧脚行为不变)
      var amp = seriesAmplitude(heelRelX);
      var baseProm = Math.max(3, (bodyHGlobal || 0) * 0.008);
      var sideProm = amp > 0 ? Math.min(baseProm, amp * 0.25) : baseProm;
      sideData[side] = { heelRelX: heelRelX, toeRelX: toeRelX, sideProm: sideProm,
                         peaks: findPeaks(heelRelX, 0.50, sideProm) };  // 步行同脚触地间隔 ≥0.6s, 0.40s 下限会收进假峰
    });

    // 漏检补检的期望周期: 双侧合并间隔的中位数
    // (单侧中位数会被漏检合并周期污染 — 真实视频右脚 spans 0.7,0.95,1.7,2.1,2.76 → 中位 1.7s 过宽)
    var allGaps = [];
    ['left', 'right'].forEach(function (side) {
      var pk = sideData[side].peaks;
      for (var g = 0; g < pk.length - 1; g++) allGaps.push(frames[pk[g + 1].i].t - frames[pk[g].i].t);
    });
    var pooledMed = 1.0;
    if (allGaps.length) {
      allGaps.sort(function (a, b) { return a - b; });
      pooledMed = allGaps[Math.floor(allGaps.length / 2)];
    }
    console.log('[gait] pooled median HS interval: ' + pooledMed.toFixed(2) + 's (漏检补检期望周期)');

    ['left', 'right'].forEach(function (side) {
      var heelRelX = sideData[side].heelRelX, toeRelX = sideData[side].toeRelX;
      var peaks = fillMissedPeaks(heelRelX, sideData[side].peaks, sideData[side].sideProm, pooledMed);
      peaks.forEach(function (p) {
        var kp = getKp(frames[p.i], side + '_heel') || getKp(frames[p.i], side + '_ankle') || { x: NaN, y: NaN };
        result[side].hs.push({
          time: refinedTime(heelRelX, p.i),
          frameIndex: p.i,
          confidence: p.recovered ? 'low' : 'high',
          bodyH: bodyHeightAtFrame(frames[p.i]) || bodyHGlobal,
          x: kp.x, y: kp.y
        });
      });
      // TO: 每个 HS→HS 周期的 [15%,85%] 区间内 toe_rel 局部极小值
      for (var h = 0; h < result[side].hs.length - 1; h++) {
        var hs0 = result[side].hs[h], hs1 = result[side].hs[h + 1];
        var cyc = hs1.time - hs0.time;
        if (cyc < 0.2 || cyc > 3.0) continue;
        var trough = findDeepestTrough(toeRelX, hs0.time + cyc * 0.15, hs0.time + cyc * 0.85);
        if (!trough) continue;  // 找不到则该周期 TO 缺失
        var tkp = getKp(frames[trough.i], side + '_foot_index') || getKp(frames[trough.i], side + '_ankle') || { x: NaN, y: NaN };
        result[side].to.push({
          time: refinedTime(toeRelX, trough.i),
          frameIndex: trough.i,
          confidence: 'high',
          bodyH: bodyHeightAtFrame(frames[trough.i]) || bodyHGlobal,
          x: tkp.x, y: tkp.y,
          cycleIndex: h
        });
      }
    });

    // ---------- 8. 双脚交替一致性: 相邻异侧 HS 相位差应在周期的 30%-70% ----------
    (function checkAlternation() {
      var merged = [];
      result.left.hs.forEach(function (h) { merged.push({ side: 'left', ev: h }); });
      result.right.hs.forEach(function (h) { merged.push({ side: 'right', ev: h }); });
      merged.sort(function (a, b) { return a.ev.time - b.ev.time; });
      for (var m = 1; m < merged.length; m++) {
        var prev = merged[m - 1], cur = merged[m];
        if (prev.side === cur.side) {
          // 同侧连续 HS (另一脚漏检) — 无法验证交替, 标低置信
          prev.ev.confidence = 'low';
          cur.ev.confidence = 'low';
          continue;
        }
        var sideHS = prev.side === 'left' ? result.left.hs : result.right.hs;
        var idx = -1;
        for (var s = 0; s < sideHS.length; s++) { if (sideHS[s] === prev.ev) { idx = s; break; } }
        var cycleDur = 0;
        if (idx >= 0 && idx < sideHS.length - 1) cycleDur = sideHS[idx + 1].time - prev.ev.time;
        else if (idx > 0) cycleDur = prev.ev.time - sideHS[idx - 1].time;
        if (cycleDur <= 0) continue;
        var phase = (cur.ev.time - prev.ev.time) / cycleDur;
        if (phase < 0.30 || phase > 0.70) {
          prev.ev.confidence = 'low';
          cur.ev.confidence = 'low';
        }
      }
    })();

    // ---------- usedMethod: 双侧有效周期 (0.2-3.0s) 均 <2 时 'none' ----------
    function countValidCycles(hs) {
      var c = 0;
      for (var i = 0; i < hs.length - 1; i++) {
        var d = hs[i + 1].time - hs[i].time;
        if (d >= 0.2 && d <= 3.0) c++;
      }
      return c;
    }
    var lc = countValidCycles(result.left.hs), rc = countValidCycles(result.right.hs);
    if (lc >= 2 || rc >= 2) result.usedMethod = 'pelvis-rel';
    console.log('[gait] detectGaitEvents: method=' + result.usedMethod + ' walkDir=' + result.walkDir +
      ' HS L=' + result.left.hs.length + ' R=' + result.right.hs.length +
      ' TO L=' + result.left.to.length + ' R=' + result.right.to.length +
      ' cycles L=' + lc + ' R=' + rc + ' bodyH=' + (bodyHGlobal ? bodyHGlobal.toFixed(0) : 'N/A'));
    return result;
  }

  /**
   * 8 时相步态周期分析 (Rancho Los Amigos) — 基于 Zeni 骨盆相对坐标事件
   *
   * 步态周期分为 8 个时相, 每个时相占周期的特定百分比 (正常值):
   *   0%     IC  Initial Contact           脚跟着地
   *   0-12%  LR  Loading Response          承重反应 (双支撑)
   *   12-31% MSt Mid Stance                支撑中期
   *   31-50% TSt Terminal Stance           支撑末期
   *   50-60% PSw Pre-Swing                 摆动前期 (双支撑, 包含 TO)
   *   60-75% ISw Initial Swing             摆动初期
   *   75-87% MSw Mid Swing                 摆动中期
   *   87-100% TSw Terminal Swing          摆动末期
   *
   * 实现 (v3): 每个 HS→HS 周期归一化, 8 时相按 RLA 标准百分比直接取
   *   "周期内时间最接近该百分比"的帧:
   *     IC 0% (= HS 的 frameIndex 本身), LR 5%, MSt 20%, TSt 40%,
   *     PSw 55%, ISw 67%, MSw 80%, TSw 93%
   *   该侧 TO 实测存在时, 用 TO 锚定摆动相起点: PSw = TO-5%周期, ISw = TO+7%周期。
   *   旧版 ad-hoc 评分函数 + 四轮钳位/强制递增修正已删除 (帧被推离真实位置)。
   *
   * 双签名兼容:
   *   新: computePhaseTimestamps(events, frames)  — events = detectGaitEvents 返回
   *   旧: computePhaseTimestamps(frames, leftHS, leftTO, rightHS, rightTO)
   *       (内部自行跑 detectGaitEvents; usedMethod='none' 时退回传入的 Y 轨迹 HS/TO)
   */
  function computePhaseTimestamps(eventsOrFrames, framesOrLeftHS, leftTO, rightHS, rightTO) {
    var PHASE_LABELS = {
      IC:  '初始着地', LR:  '承重反应', MSt: '支撑中期', TSt: '支撑末期',
      PSw: '摆动前期', ISw: '摆动初期', MSw: '摆动中期', TSw: '摆动末期'
    };
    var phaseNames8 = ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];

    var events = null, keypointFrames = null;
    var fb = null;  // 旧签名传入的 Y 轨迹 HS/TO (fallback 用)
    if (Object.prototype.toString.call(eventsOrFrames) === '[object Array]') {
      keypointFrames = eventsOrFrames;
      fb = { leftHS: framesOrLeftHS || [], leftTO: leftTO || [], rightHS: rightHS || [], rightTO: rightTO || [] };
      events = detectGaitEvents(keypointFrames);
    } else {
      events = eventsOrFrames;
      keypointFrames = framesOrLeftHS;
    }
    if (!keypointFrames || keypointFrames.length < 3 || !events) return [];

    // 事件源选择: pelvis-rel 用 Zeni 事件; none 退回旧 Y 轨迹 HS/TO (同样走百分比选帧)
    var leftHS, rightHS, lTO, rTO;
    if (events.usedMethod === 'pelvis-rel') {
      leftHS = events.left.hs; rightHS = events.right.hs;
      lTO = events.left.to; rTO = events.right.to;
    } else {
      console.warn('[gait] computePhaseTimestamps: pelvis-rel 事件不可用 (usedMethod=none), 退回 Y 轨迹 HS/TO + 百分比选帧');
      if (fb) {
        leftHS = fb.leftHS; rightHS = fb.rightHS;
        lTO = fb.leftTO; rTO = fb.rightTO;
      } else {
        leftHS = detectHeelStrikes(keypointFrames, 'left');
        rightHS = detectHeelStrikes(keypointFrames, 'right');
        lTO = detectToeOffs(keypointFrames, 'left', leftHS);
        rTO = detectToeOffs(keypointFrames, 'right', rightHS);
      }
    }

    var out = [];

    // 对每个 HS→HS 周期, 按 RLA 百分比直接选帧
    function build(HS, side, TO) {
      if (!HS || HS.length < 2) return;
      for (var i = 0; i < HS.length - 1; i++) {
        var hs = HS[i], nextHs = HS[i + 1];
        var cycle = nextHs.time - hs.time;
        var dx = (nextHs.x != null && hs.x != null && !isNaN(nextHs.x) && !isNaN(hs.x)) ? nextHs.x - hs.x : 0;
        var cycleDir = dx > 1 ? 'l2r' : (dx < -1 ? 'r2l' : 'stationary');
        if (cycle < 0.2 || cycle > 3.0) continue;
        if (hs.frameIndex == null || nextHs.frameIndex == null) continue;
        if (hs.frameIndex < 0 || nextHs.frameIndex <= hs.frameIndex) continue;
        var icFi = hs.frameIndex;
        var endFi = Math.min(nextHs.frameIndex, keypointFrames.length - 1);

        // === Per-cycle "近镜头侧" 检测 (保留旧逻辑, 供截图前景脚判定) ===
        var lScore = 0, lCount = 0, rScore = 0, rCount = 0;
        for (var fi = icFi; fi <= endFi && fi < keypointFrames.length; fi++) {
          var la = getKp(keypointFrames[fi], 'left_ankle');
          var ra = getKp(keypointFrames[fi], 'right_ankle');
          if (la && la.score >= 0.2) { lScore += la.score; lCount++; }
          if (ra && ra.score >= 0.2) { rScore += ra.score; rCount++; }
        }
        var closerSide = null;
        if (lCount > 0 && rCount > 0) {
          var lAvg = lScore / lCount, rAvg = rScore / rCount;
          if (lAvg > rAvg * 1.08) closerSide = 'left';
          else if (rAvg > lAvg * 1.08) closerSide = 'right';
        }

        // === 8 时相目标百分比 (RLA 标准) ===
        var pcts = [0, 5, 20, 40, 55, 67, 80, 93];
        // 该侧 TO 实测存在 → 摆动相起点用 TO 锚定: PSw = TO-5%周期, ISw = TO+7%周期
        var toT = null;
        if (TO && TO.length) {
          for (var ti = 0; ti < TO.length; ti++) {
            if (TO[ti].time > hs.time && TO[ti].time < nextHs.time) { toT = TO[ti].time; break; }
          }
        }
        if (toT !== null) {
          var toPct = (toT - hs.time) / cycle * 100;
          pcts[4] = toPct - 5;   // PSw
          pcts[5] = toPct + 7;   // ISw
        }
        // 单调性保障: 最小间隔 2%, 范围 [0, 97]
        for (var k = 1; k < 8; k++) { if (pcts[k] < pcts[k - 1] + 2) pcts[k] = pcts[k - 1] + 2; }
        for (var k = 7; k >= 0; k--) { if (pcts[k] > 97) pcts[k] = 97; }
        for (var k = 6; k >= 0; k--) { if (pcts[k] > pcts[k + 1] - 2) pcts[k] = pcts[k + 1] - 2; }

        // === 按"周期内时间最接近目标百分比"选帧 ===
        var phaseFis = [];
        for (var k = 0; k < 8; k++) {
          if (k === 0) { phaseFis.push(icFi); continue; }  // IC = HS 的 frameIndex 本身
          var target = hs.time + cycle * pcts[k] / 100;
          var bestFi = icFi, bestDt = Infinity;
          for (var f2 = icFi; f2 <= endFi; f2++) {
            var dt2 = Math.abs(keypointFrames[f2].t - target);
            if (dt2 < bestDt) { bestDt = dt2; bestFi = f2; }
          }
          phaseFis.push(bestFi);
        }
        // frameIndex 严格递增 (截图时相顺序保障; 超短周期兜底允许贴尾)
        for (var k = 1; k < 8; k++) {
          if (phaseFis[k] <= phaseFis[k - 1]) phaseFis[k] = phaseFis[k - 1] + 1;
          if (phaseFis[k] > endFi) phaseFis[k] = endFi;
        }

        for (var k = 0; k < 8; k++) {
          var gFi = phaseFis[k];
          var gT = keypointFrames[gFi] ? keypointFrames[gFi].t : hs.time + cycle * pcts[k] / 100;
          out.push({
            cycleIndex: i + 1, side: side, phase: phaseNames8[k],
            label: PHASE_LABELS[phaseNames8[k]], dir: cycleDir, stance: k < 5,
            time: gT, frameIndex: gFi,
            footX: hs.x, closerSide: closerSide,
            derived: !!hs.derived  // ← 从 virtual HS 透传, picker 跳过 derived cycle
          });
        }
      }
    }
    build(leftHS || [], 'left', lTO || []);
    build(rightHS || [], 'right', rTO || []);

    // === 交叉补全: 一侧周期太少时, 用另一侧 HS 推算 (虚拟 HS, 标记 derived:true) ===
    // 步态中左右脚交替触地, 间距约半个周期; 推算的 IC 物理上是另一只脚的 MSt,
    // 截图必错 → 仅用于参数完整性, picker 会跳过 derived 周期
    var leftCycles = out.filter(function (p) { return p.side === 'left'; }).length / 8;
    var rightCycles = out.filter(function (p) { return p.side === 'right'; }).length / 8;
    console.log('[gait] cycles: left=' + leftCycles + ' right=' + rightCycles);
    function makeVirtualHS(srcHS, side) {
      var v = [];
      for (var si = 0; si < srcHS.length - 1; si++) {
        var halfCycle = (srcHS[si + 1].time - srcHS[si].time) / 2;
        var estT = srcHS[si].time + halfCycle;
        var estFi = srcHS[si].frameIndex + Math.floor((srcHS[si + 1].frameIndex - srcHS[si].frameIndex) / 2);
        if (estFi >= keypointFrames.length) estFi = keypointFrames.length - 1;
        // 获取推算 IC 处的踝 Y
        var estKp = getKp(keypointFrames[estFi], side + '_ankle');
        var estY = estKp ? estKp.y : srcHS[si].y;
        v.push({
          frameIndex: estFi, time: estT,
          x: srcHS[si].x, y: estY, confidence: 'low',
          derived: true  // ← 标记为虚拟, build() 会透传到 phase entry
        });
      }
      return v;
    }
    if (leftCycles < 2 && rightCycles >= 2 && rightHS && rightHS.length >= 3) {
      // 清空原有 left 周期 (太少不可靠), 用右脚 HS 推算全部 left 周期
      out = out.filter(function (p) { return p.side !== 'left'; });
      var virtualLeftHS = makeVirtualHS(rightHS, 'left');
      console.log('[gait] cross-derive left: ' + virtualLeftHS.length + ' virtual HS from right (标记 derived:true, picker 跳过)');
      build(virtualLeftHS, 'left', []);
    }
    if (rightCycles < 2 && leftCycles >= 2 && leftHS && leftHS.length >= 3) {
      // 清空原有 right 周期 (太少不可靠), 用左脚 HS 推算全部 right 周期
      out = out.filter(function (p) { return p.side !== 'right'; });
      var virtualRightHS = makeVirtualHS(leftHS, 'right');
      console.log('[gait] cross-derive right: ' + virtualRightHS.length + ' virtual HS from left (标记 derived:true, picker 跳过)');
      build(virtualRightHS, 'right', []);
    }
    return out;
  }

  function computeGaitCyclePhases(frames, leftHS, leftTO, rightHS, rightTO) {
    var phaseStats = {
      totalCycles: 0,
      avgCycleTime: 0,
      // 8 时相时间占比 (左右脚平均)
      phases: {
        IC:  { pct: 0, label: '初始着地',       normal: { min: 0,  max: 2  } },
        LR:  { pct: 0, label: '承重反应',       normal: { min: 8,  max: 14 } },
        MSt: { pct: 0, label: '支撑中期',       normal: { min: 16, max: 22 } },
        TSt: { pct: 0, label: '支撑末期',       normal: { min: 16, max: 22 } },
        PSw: { pct: 0, label: '摆动前期',       normal: { min: 8,  max: 14 } },
        ISw: { pct: 0, label: '摆动初期',       normal: { min: 12, max: 18 } },
        MSw: { pct: 0, label: '摆动中期',       normal: { min: 10, max: 14 } },
        TSw: { pct: 0, label: '摆动末期',       normal: { min: 10, max: 16 } }
      },
      stancePct: 0,    // 支撑相总占比
      swingPct: 0,     // 摆动相总占比
      doubleSupportPct: 0,  // 双支撑期 (LR + PSw)
      events: []       // [{time, side, type:'HS'|'TO', cyclePct}]
    };

    // 从踝关节 Y 位置估算 IC (初始触地), 返回 offset = (HS_time - IC_time) / cycle
    // 踝在摆动末快速下降 → IC → 支撑相缓慢至最低点 (HS 检测点)
    // 30fps 下摆动末下降可能跨帧丢失, 用位置阈值比速度更鲁棒
    function estimateICOffset(frames, side, hsFrameIdx) {
      if (!frames || hsFrameIdx == null || hsFrameIdx >= frames.length || !frames[hsFrameIdx]) return null;
      var kpName = side + '_ankle';
      var SEARCH_WINDOW = 0.35;
      var MIN_SEARCH_FRAMES = 3;
      var SWING_THRESHOLD = 0.20;  // 踝 y 进入 HS 值 20% 范围内 = 已触地
      var hsTime = frames[hsFrameIdx].t;
      var hsKp = getKp(frames[hsFrameIdx], kpName);
      if (!hsKp) return null;
      var hsY = hsKp.y;
      // 收集 HS 之前的踝关节点
      var points = [];
      for (var f = hsFrameIdx; f >= 0; f--) {
        if (hsTime - frames[f].t > SEARCH_WINDOW) break;
        var kp = getKp(frames[f], kpName);
        if (kp && kp.score >= 0.3) points.unshift({ t: frames[f].t, y: kp.y, f: f });
      }
      if (points.length < MIN_SEARCH_FRAMES) return null;
      // 在搜索窗口内找最高点 (摆动相顶点, y 最小)
      var minY = Infinity, minIdx = 0;
      for (var p = 0; p < points.length; p++) {
        if (points[p].y < minY) { minY = points[p].y; minIdx = p; }
      }
      var swingAmplitude = hsY - minY;  // 摆动振幅 (px)
      if (swingAmplitude < 5) return null;  // 振幅太小, 信号不可靠
      // 从摆动顶点之后开始, 找到踝 y 首次进入 HS 值 SWING_THRESHOLD 范围内的帧 = IC
      // 即: 踝从摆动高位下降到接近地面
      var icTime = null;
      for (var q = minIdx + 1; q < points.length; q++) {
        var proximity = (points[q].y - minY) / swingAmplitude;  // 0=最高位, 1=HS位
        if (proximity > (1 - SWING_THRESHOLD)) {
          icTime = points[q].t;
          break;
        }
      }
      if (icTime === null || icTime >= hsTime) return null;
      return icTime;
    }

    // Cadence-adaptive fallback offset (当速度检测失败时)
    function fallbackOffset(cadence) {
      if (!cadence || cadence <= 0) return 0.25;
      if (cadence < 60)  return 0.30;  // 慢走, 支撑相长, mid-stance 偏后
      if (cadence < 90)  return 0.25;  // 正常
      return 0.20;                      // 快走, 支撑相短, 偏移小
    }

    function analyzeOneSide(HS, TO, side) {
      if (!HS || HS.length < 2) return { phases: {}, events: [] };
      var allEvents = [];
      for (var i = 0; i < HS.length; i++) {
        allEvents.push({ time: HS[i].time, side: HS[i].side || '?', type: 'HS', cyclePct: 0 });
      }
      var toByCycle = {};
      (TO || []).forEach(function (t) { toByCycle[t.cycleIndex] = t; });
      var stancePcts = [], cycleTimes = [];
      for (var i = 0; i < HS.length - 1; i++) {
        var cycle = HS[i + 1].time - HS[i].time;
        if (cycle <= 0.2 || cycle >= 3.0) continue;
        cycleTimes.push(cycle);
        var to = toByCycle[i];
        var stancePct;
        if (to && to.time > HS[i].time && to.time < HS[i + 1].time) {
          // 自适应偏移: 用踝 Y 速度检测 IC, 失败时 fallback 到 cadence-adaptive 默认值
          var hsFi = (HS[i] && HS[i].frameIndex != null) ? HS[i].frameIndex : -1;
          var icTime = hsFi >= 0 ? estimateICOffset(frames, side, hsFi) : null;
          var offset;
          if (icTime !== null && icTime < HS[i].time) {
            offset = (HS[i].time - icTime) / cycle;
            // clamp 到合理范围
            if (offset < 0.10) offset = 0.10;
            if (offset > 0.40) offset = 0.40;
          } else {
            var estCadence = 60 / cycle;
            offset = fallbackOffset(estCadence);
          }
          stancePct = ((to.time - (HS[i].time - offset * cycle)) / cycle) * 100;
        } else {
          stancePct = 60;
        }
        stancePcts.push(stancePct);
        if (to) {
          allEvents.push({ time: to.time, side: to.side || '?', type: 'TO', cyclePct: stancePct });
        }
      }
      if (cycleTimes.length === 0) return { phases: {}, events: allEvents };
      // 8 时相计算 (基于支撑相和摆动相的实际占比, 内部按固定比例切片)
      var avgCycle = cycleTimes.reduce(function (a, b) { return a + b; }, 0) / cycleTimes.length;
      var avgStance = stancePcts.reduce(function (a, b) { return a + b; }, 0) / stancePcts.length;
      var avgSwing = 100 - avgStance;
      var phasePcts = {
        IC:  0.5,    // 瞬时事件, 占比近 0
        LR:  avgStance * 0.20,   // 0-12% of cycle
        MSt: avgStance * 0.32,   // 12-31%
        TSt: avgStance * 0.32,   // 31-50%
        PSw: avgStance * 0.16,   // 50-60%
        ISw: avgSwing * 0.30,    // 60-75%
        MSw: avgSwing * 0.30,    // 75-87%
        TSw: avgSwing * 0.40     // 87-100%
      };
      return {
        avgCycle: avgCycle,
        avgStance: avgStance,
        avgSwing: avgSwing,
        phasePcts: phasePcts,
        events: allEvents
      };
    }

    var leftStats = analyzeOneSide(leftHS || [], leftTO || [], 'left');
    var rightStats = analyzeOneSide(rightHS || [], rightTO || [], 'right');
    var sideCount = 0;
    if (leftStats.phasePcts) { sideCount++; phaseStats.totalCycles = leftStats.events.filter(function (e) { return e.type === 'HS'; }).length - 1; }
    if (rightStats.phasePcts) { sideCount++; phaseStats.totalCycles = Math.max(phaseStats.totalCycles, rightStats.events.filter(function (e) { return e.type === 'HS'; }).length - 1); }
    if (sideCount === 0) return phaseStats;
    // 合并左右
    var avgCycle = ((leftStats.avgCycle || 0) + (rightStats.avgCycle || 0)) / Math.max(sideCount, 1);
    var avgStance = ((leftStats.avgStance || 0) + (rightStats.avgStance || 0)) / Math.max(sideCount, 1);
    phaseStats.avgCycleTime = avgCycle;
    phaseStats.stancePct = avgStance;
    phaseStats.swingPct = 100 - avgStance;
    phaseStats.doubleSupportPct = (leftStats.phasePcts && rightStats.phasePcts) ?
      ((leftStats.phasePcts.LR + leftStats.phasePcts.PSw + rightStats.phasePcts.LR + rightStats.phasePcts.PSw) / 2) :
      ((leftStats.phasePcts && leftStats.phasePcts.LR + leftStats.phasePcts.PSw) || (rightStats.phasePcts && rightStats.phasePcts.LR + rightStats.phasePcts.PSw) || 20);
    // 合并 8 时相
    Object.keys(phaseStats.phases).forEach(function (k) {
      var lv = leftStats.phasePcts ? leftStats.phasePcts[k] : 0;
      var rv = rightStats.phasePcts ? rightStats.phasePcts[k] : 0;
      phaseStats.phases[k].pct = (lv + rv) / Math.max(sideCount, 1);
    });
    // 合并事件列表
    phaseStats.events = (leftStats.events || []).concat(rightStats.events || []).sort(function (a, b) { return a.time - b.time; });
    return phaseStats;
  }

  // ============================================================
  // 8 项核心步态参数计算
  // ============================================================

  /**
   * 步长: 相邻两侧脚跟着地点之间的横向距离
   * @param {Array} leftHS  - 左脚 heel-strikes
   * @param {Array} rightHS - 右脚 heel-strikes
   * @param {Number} scale  - m/px
   * @param {Number} [heightM] - 身高标定 (米)。传入且 HS 事件带 bodyH 时,
   *        每个事件按其实测像素身高逐次换算: scale_i = (heightM×0.97)/bodyH_i
   *        (来回走近/远镜头端人体像素身高不同, 全局统一 scale 会系统性偏倚);
   *        无身高标定或事件无 bodyH 时沿用全局 scale
   * @returns {Array} 步长数组 (m), 每个元素 = {value, side, frame, time}
   */
  function computeStepLengths(leftHS, rightHS, scale, heightM) {
    if (!scale || scale <= 0) return [];
    var merged = [];
    leftHS.forEach(function (h) { merged.push(Object.assign({ side: 'left' }, h)); });
    rightHS.forEach(function (h) { merged.push(Object.assign({ side: 'right' }, h)); });
    merged.sort(function (a, b) { return a.time - b.time; });
    var steps = [];
    for (var i = 1; i < merged.length; i++) {
      if (merged[i].side !== merged[i - 1].side) {
        var stepDur = merged[i].time - merged[i - 1].time;
        if (stepDur < 0.15 || stepDur > 1.2) continue;  // 跨转身/站立段的伪步 (真实步时 ~0.3-0.8s)
        var dx = merged[i].x - merged[i - 1].x;
        var dy = merged[i].y - merged[i - 1].y;
        // 欧氏距离 (侧方+斜45°拍摄均有效)
        var lenPx = Math.sqrt(dx * dx + dy * dy);
        // 逐事件 scale: 优先用该事件自带的 bodyH 换算
        var evScale = scale;
        if (heightM && heightM > 0 && merged[i].bodyH > 0) evScale = (heightM * 0.97) / merged[i].bodyH;
        steps.push({
          value: lenPx * evScale,
          from: merged[i - 1].side,
          to: merged[i].side,
          time: merged[i].time,
          duration: merged[i].time - merged[i - 1].time
        });
      }
    }
    return steps;
  }

  /**
   * 步幅: 同侧两次脚跟着地之间的距离
   * @param {Array} heelStrikes - 单侧 HS (事件带 bodyH 时逐事件换算)
   * @param {Number} scale  - m/px
   * @param {Number} [heightM] - 身高标定 (米), 见 computeStepLengths
   */
  function computeStrideLengths(heelStrikes, scale, heightM) {
    if (!scale || scale <= 0 || heelStrikes.length < 2) return [];
    var strides = [];
    for (var i = 1; i < heelStrikes.length; i++) {
      var strideDur = heelStrikes[i].time - heelStrikes[i - 1].time;
      if (strideDur < 0.6 || strideDur > 1.8) continue;  // 跨转身段/漏检合并周期不是有效步幅
      var dx = heelStrikes[i].x - heelStrikes[i - 1].x;
      var dy = heelStrikes[i].y - heelStrikes[i - 1].y;
      // 使用欧氏距离 (支持侧方+斜45°+正面拍摄, xy 均包含前进分量)
      var lenPx = Math.sqrt(dx * dx + dy * dy);
      var evScale = scale;
      if (heightM && heightM > 0 && heelStrikes[i].bodyH > 0) evScale = (heightM * 0.97) / heelStrikes[i].bodyH;
      strides.push({
        value: lenPx * evScale,
        time: heelStrikes[i].time,
        duration: heelStrikes[i].time - heelStrikes[i - 1].time
      });
    }
    return strides;
  }

  /**
   * 步宽: 双脚中线之间垂直距离 (需要稳定段, 取摆动相最低点)
   * 计算方法: 在每个左脚 HS 附近, 右脚踝的水平距离
   * 注意: 单目 2D 无法分离"前后位移"与"左右步宽", 返回的是近似值 (approximate: true)
   */
  function computeStepWidths(frames, leftHS, rightHS, scale) {
    if (!scale || scale <= 0) return [];
    var widths = [];
    var radius = 0.2;  // ±200ms 窗口
    for (var i = 0; i < leftHS.length; i++) {
      var lh = leftHS[i];
      // 找最近的右脚关键点
      var bestFrame = null, bestDist = Infinity;
      for (var f = 0; f < frames.length; f++) {
        var ra = getKp(frames[f], 'right_ankle');
        if (!ra) continue;
        if (Math.abs(frames[f].t - lh.time) < bestDist) {
          bestDist = Math.abs(frames[f].t - lh.time);
          bestFrame = ra;
        }
      }
      if (bestFrame) {
        // 步宽: 同时刻左脚踝 (用HS时刻) 与右脚踝的 y 差
        // 在镜头视角下, 双脚 y 差异 = 步宽 (假设人物面向/背向镜头)
        // 若侧方视角则步宽在 x 方向, 这里按通用处理用垂直屏幕方向 (y)
        var dy = Math.abs(bestFrame.y - lh.y);
        widths.push({ value: dy * scale, time: lh.time, approximate: true });
      }
    }
    return widths;
  }

  /**
   * 足偏角: 足长轴 (heel→foot_index) 与步向水平轴的夹角 — 实测版
   *
   * 旧版用小腿向量 (knee→ankle) 的胫骨角冒充足偏角, 已废弃。
   * 新版: 支撑中期 (20%-50% 周期) 帧内足轴向量与步向 (walkDir 方向水平轴) 的
   *       夹角, 逐侧取中位数; foot_index 覆盖率 <50% 的侧返回 null (不冒充)。
   *
   * @param {Array} frames
   * @param {Object} events - detectGaitEvents 返回 (需要各侧 hs + walkDir)
   * @returns {Object} { left: °|null, right: °|null,
   *                     coverage: {left, right}, samples: {left, right} }
   */
  function computeFootAngles(frames, events) {
    var out = { left: null, right: null, coverage: { left: 0, right: 0 }, samples: { left: 0, right: 0 } };
    if (!frames || !events || !events.walkDir) return out;
    var walkDir = events.walkDir;
    ['left', 'right'].forEach(function (side) {
      var hs = events[side] ? events[side].hs : null;
      if (!hs || hs.length < 2) return;
      var angles = [], total = 0, covered = 0;
      for (var i = 0; i < hs.length - 1; i++) {
        var t0 = hs[i].time, cycle = hs[i + 1].time - t0;
        if (cycle <= 0.2 || cycle >= 3.0) continue;
        var w0 = t0 + cycle * 0.20, w1 = t0 + cycle * 0.50;  // 支撑中期窗口
        for (var f = 0; f < frames.length; f++) {
          var t = frames[f].t;
          if (t < w0) continue;
          if (t > w1) break;
          total++;
          var heel = getKp(frames[f], side + '_heel');
          var toe = getKp(frames[f], side + '_foot_index');
          if (!heel || !toe || heel.score < 0.25 || toe.score < 0.25) continue;
          covered++;
          var dx = toe.x - heel.x, dy = toe.y - heel.y;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
          // 与步向 (walkDir 方向水平轴) 的夹角; 0° = 足轴直指前进方向
          var ang = Math.atan2(dy, dx * walkDir) * 180 / Math.PI;
          angles.push(Math.abs(ang));
        }
      }
      out.coverage[side] = total > 0 ? covered / total : 0;
      out.samples[side] = angles.length;
      if (out.coverage[side] < 0.5 || angles.length === 0) return;  // 覆盖率不足 → null
      angles.sort(function (a, b) { return a - b; });
      out[side] = angles[Math.floor(angles.length / 2)];  // 中位数
    });
    return out;
  }

  // ============================================================
  // 踝关节运动学 — 胫骨角作为踝背屈/跖屈代理
  //
  // MoveNet 无足部关键点, 无法算真正的踝关节角。
  // 用胫骨角 (膝→踝连线与垂直方向夹角) 作为代理:
  //   正值 = 踝在膝前方 (背屈 / 胫骨前倾)
  //   负值 = 踝在膝后方 (跖屈 / 推离)
  //
  // 临床意义:
  //   足下垂: 摆动相胫骨角 < 5° (无法背屈抬脚)
  //   推离无力: 支撑末胫骨角 > -10° (跖屈不足)
  // ============================================================
  function computeAnkleKinematics(frames, heelStrikes, side) {
    if (!frames || frames.length < 10) return { error: 'insufficient_frames' };
    var kpAnkle = side + '_ankle';
    var kpKnee  = side + '_knee';

    // 逐帧采集: 胫骨角 + 踝坐标 + 足俯仰角 (足下垂的真代理)
    var records = [];  // [{t, shankAngle, footPitch, ankleX, ankleY}]
    var kpHeel = side + '_heel';
    var kpToe  = side + '_foot_index';
    for (var i = 0; i < frames.length; i++) {
      var ankle = getKp(frames[i], kpAnkle);
      var knee  = getKp(frames[i], kpKnee);
      if (!ankle || !knee || ankle.score < 0.25 || knee.score < 0.25) continue;
      var dx = ankle.x - knee.x;
      var dy = ankle.y - knee.y;
      if (dy < 5) continue;  // 踝必须明显低于膝; dy 反转 = 关键点错位/遮挡, 剔除防角度缠绕
      var shankAngle = Math.atan2(dx, dy) * 180 / Math.PI;  // 0°=垂直, +前倾
      if (Math.abs(shankAngle) > 80) continue;  // 生理范围外视为噪声
      // 足俯仰: 跟→趾连线与水平夹角, >0 = 趾低于跟 = 足下垂方向
      var footPitch = null;
      var heel = getKp(frames[i], kpHeel);
      var toe  = getKp(frames[i], kpToe);
      if (heel && toe && heel.score >= 0.25 && toe.score >= 0.25) {
        var fdx = toe.x - heel.x, fdy = toe.y - heel.y;
        if (Math.abs(fdx) > 3) footPitch = Math.atan2(fdy, Math.abs(fdx)) * 180 / Math.PI;
      }
      records.push({
        t: frames[i].t,
        shankAngle: shankAngle,
        footPitch: footPitch,
        ankleX: ankle.x,
        ankleY: ankle.y
      });
    }
    if (records.length < 20) return { error: 'insufficient_ankle_data' };
    // 侧拍远侧踝常被腿遮挡 — 可见率 < 40% 时周期级指标不可信, 只保留全局量
    var coverage = records.length / frames.length;
    var cycleMetricsOK = coverage >= 0.4;

    // ---- 地面平面估计 (双脚共用同一地面, 双侧采样更稳) ----
    // 支撑相足底贴地: 踝处于其轨迹的图像最低处 (y 最大)。旧逻辑取 min y (摆动相最高点) 是错的。
    // 取双脚踝各自 y 最高 12% 的帧 (贴地帧), 合并做线性回归
    var groundPoints = [];
    var otherKpAnkle = (side === 'left' ? 'right' : 'left') + '_ankle';
    [kpAnkle, otherKpAnkle].forEach(function (kp) {
      var pts = [];
      for (var gi = 0; gi < frames.length; gi++) {
        var a = getKp(frames[gi], kp);
        if (a && a.score >= 0.3) pts.push({ x: a.x, y: a.y });
      }
      if (pts.length < 10) return;
      var ys = pts.map(function (p) { return p.y; }).sort(function (a2, b2) { return a2 - b2; });
      var yCut = ys[Math.floor(ys.length * 0.88)];  // 最高 12% (贴地帧)
      pts.forEach(function (p) { if (p.y >= yCut) groundPoints.push({ ankleX: p.x, ankleY: p.y }); });
    });
    // 如果收集到的地面点 ≥ 6, 线性回归估计地面斜率
    var groundAngleDeg = 0;  // 地面与水平线夹角 (°)
    var groundReliable = false;
    if (groundPoints.length >= 6) {
      var n = groundPoints.length, sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (var g = 0; g < n; g++) {
        sx += groundPoints[g].ankleX; sy += groundPoints[g].ankleY;
        sxy += groundPoints[g].ankleX * groundPoints[g].ankleY;
        sx2 += groundPoints[g].ankleX * groundPoints[g].ankleX;
      }
      var denom = n * sx2 - sx * sx;
      if (Math.abs(denom) > 0.01) {
        var slope = (n * sxy - sx * sy) / denom;  // dy/dx
        groundAngleDeg = Math.atan(slope) * 180 / Math.PI;
        groundAngleDeg = Math.max(-20, Math.min(20, groundAngleDeg));  // 拟合失败保护: 地面倾角不可能超 ±20°
        groundReliable = true;
      }
    }

    // ---- 计算踝关节角 (胫骨 vs 地面) ----
    // 踝角 = 胫骨角 - 地面角 (支撑相 足≈地面)
    // 正值 = 背屈 (胫骨前倾 > 地面), 负值 = 跖屈
    var ankleAngles = [];  // [{t, angle}] 踝关节角
    var stanceAnkleAngles = [];
    var swingAnkleAngles = [];
    for (var k = 0; k < records.length; k++) {
      var ankleAngle = records[k].shankAngle - groundAngleDeg;
      ankleAngles.push({ t: records[k].t, angle: ankleAngle, pitch: records[k].footPitch });
    }

    // 按 HS 分组
    if (heelStrikes && heelStrikes.length >= 2) {
      for (var m = 0; m < heelStrikes.length - 1; m++) {
        var hsT2 = heelStrikes[m].time;
        var midT2 = hsT2 + (heelStrikes[m+1].time - hsT2) * 0.5;
        ankleAngles.forEach(function (a) {
          if (a.t >= hsT2 && a.t < midT2) stanceAnkleAngles.push(a.angle);
          else if (a.t >= midT2 && a.t < heelStrikes[m+1].time) swingAnkleAngles.push(a.angle);
        });
      }
    }

    function arrMean(arr) { return arr.length>0?arr.reduce(function(a,b){return a+b;},0)/arr.length:0; }
    function arrMin(arr)  { return arr.length>0?Math.min.apply(null,arr):0; }
    function arrMax(arr)  { return arr.length>0?Math.max.apply(null,arr):0; }
    function arrSD(arr)   { var m=arrMean(arr); return arr.length>1?Math.sqrt(arr.reduce(function(s,v){return s+(v-m)*(v-m);},0)/arr.length):0; }
    function arrPct(arr, q) {  // 分位数 — 抗关键点离群噪声 (min/max 会被单帧抖动劫持)
      if (!arr.length) return 0;
      var s = arr.slice().sort(function(a,b){return a-b;});
      return s[Math.min(s.length-1, Math.floor(q * s.length))];
    }

    var allAngles = ankleAngles.map(function(a){return a.angle;});
    var stanceMean = arrMean(stanceAnkleAngles);
    var swingMean  = arrMean(swingAnkleAngles);
    var maxDF = arrPct(allAngles, 0.90);   // 最大背屈 (P90, 抗噪)
    var maxPF = arrPct(allAngles, 0.10);   // 最大跖屈 (P10, 抗噪)
    var rom  = maxDF - maxPF;              // 活动范围
    var stanceSD = arrSD(stanceAnkleAngles);

    // ---- 周期级指标: 足下垂角度、脚跟着地角度、踝角变异性 ----
    var perCycleMaxDF = [];
    var perCycleFootDrop = [];   // 摆动中期足俯仰 − 支撑中期基准 (自校准)
    var perCycleStancePitch = []; // 各周期支撑中期俯仰均值 — 足跟踪可靠性自检用
    var heelStrikeAngles = [];
    if (cycleMetricsOK && heelStrikes && heelStrikes.length >= 2) {
      for (var m = 0; m < heelStrikes.length - 1; m++) {
        var hsT2 = heelStrikes[m].time;
        var nextT2 = heelStrikes[m + 1].time;
        var cycle = nextT2 - hsT2;
        if (cycle <= 0.2 || cycle >= 3.0) continue;
        var midT2 = hsT2 + cycle * 0.5;
        var cycleSwing = [], cycleStance = [], midSwingPitch = [], midStancePitch = [];
        var msT0 = hsT2 + cycle * 0.70, msT1 = hsT2 + cycle * 0.95;  // 摆动中期窗口 (足下垂评估专用)
        var stT0 = hsT2 + cycle * 0.15, stT1 = hsT2 + cycle * 0.45;  // 支撑中期窗口 (足贴地, 俯仰零点基准)
        for (var aidx = 0; aidx < ankleAngles.length; aidx++) {
          if (ankleAngles[aidx].t < hsT2) continue;
          if (ankleAngles[aidx].t >= nextT2) break;
          if (ankleAngles[aidx].t < midT2) cycleStance.push(ankleAngles[aidx].angle);
          else cycleSwing.push(ankleAngles[aidx].angle);
          if (ankleAngles[aidx].pitch != null) {
            if (ankleAngles[aidx].t >= msT0 && ankleAngles[aidx].t <= msT1) midSwingPitch.push(ankleAngles[aidx].pitch);
            if (ankleAngles[aidx].t >= stT0 && ankleAngles[aidx].t <= stT1) midStancePitch.push(ankleAngles[aidx].pitch);
          }
        }
        if (cycleSwing.length >= 3) {
          perCycleMaxDF.push(arrPct(cycleSwing, 0.85));     // P85 抗单帧离群
        }
        // 足下垂 = 摆动中期俯仰 − 支撑中期俯仰 (支撑期足贴地≈0°, 自校准关键点/透视系统偏差)
        if (midStancePitch.length >= 2) perCycleStancePitch.push(arrMean(midStancePitch));
        if (midSwingPitch.length >= 2 && midStancePitch.length >= 2) {
          perCycleFootDrop.push(arrPct(midSwingPitch, 0.5) - arrMean(midStancePitch));
        }
        // 脚跟着地瞬间取 HS 帧前后 2 帧的踝角中位数 (抗噪)
        var hsWindow = [];
        for (var aidx2 = 0; aidx2 < ankleAngles.length; aidx2++) {
          var dt = ankleAngles[aidx2].t - hsT2;
          if (Math.abs(dt) < 0.05 * cycle) hsWindow.push(ankleAngles[aidx2].angle);
        }
        if (hsWindow.length > 0) heelStrikeAngles.push(arrMean(hsWindow));
      }
    }
    // 足下垂一致性自关: 支撑中期足贴地, 俯仰角理论恒为 ~0°。
    // 若各周期支撑俯仰均值 SD > 10°, 说明足部关键点跟踪不可靠, 足下垂指标作废
    var stancePitchMeans = [];
    if (perCycleStancePitch && perCycleStancePitch.length >= 3) stancePitchMeans = perCycleStancePitch;
    var footDropAngle = null;
    if (perCycleFootDrop.length >= 3) {
      if (stancePitchMeans.length >= 3 && arrSD(stancePitchMeans) > 10) {
        // 跟踪不可靠 → null
      } else {
        footDropAngle = trimmedMean(perCycleFootDrop);
      }
    }
    var heelStrikeAngle = heelStrikeAngles.length >= 3 ? trimmedMean(heelStrikeAngles) : null;
    var ankleAngleCV = perCycleMaxDF.length >= 4 ? arrSD(perCycleMaxDF) / Math.max(Math.abs(arrMean(perCycleMaxDF)), 1) : null;
    var ankleAngleSD = perCycleMaxDF.length >= 4 ? arrSD(perCycleMaxDF) : null;
    // 生理上限门控: CV > 0.6 在人类步态中几乎不存在, 出现即判定为跟踪噪声
    if (ankleAngleCV != null && ankleAngleCV > 0.6) { ankleAngleCV = null; ankleAngleSD = null; }

    // ---- 临床/亚健康标记 ----
    var flags = [];
    var quality = 'normal';
    if (!cycleMetricsOK) flags.push('ℹ 该侧踝部可见率低 (' + (coverage * 100).toFixed(0) + '%) — 遮挡较多, 足下垂/着地角/变异性指标未纳入');
    if (perCycleStancePitch.length >= 3 && arrSD(perCycleStancePitch) > 10) flags.push('ℹ 足部关键点逐周期漂移大 (支撑期俯仰 SD=' + arrSD(perCycleStancePitch).toFixed(0) + '°) — 足下垂指标未纳入');
    if (rom > 0 && rom < 25) { quality = 'stiff'; flags.push('踝僵硬: 胫骨摆动范围仅 ' + rom.toFixed(0) + '° — 可能踝关节病变/痉挛'); }
    else if (rom > 75) { quality = 'hypermobile'; flags.push('踝过度活动: ' + rom.toFixed(0) + '° — 共济失调/肌张力低下'); }

    if (stanceMean < -5) flags.push('支撑相跖屈: 平均 ' + stanceMean.toFixed(0) + '° — 可能马蹄足/跟腱挛缩');
    else if (stanceMean > 15) flags.push('支撑相过度背屈: ' + stanceMean.toFixed(0) + '° — 可能跟腱无力/扁平足');

    if (footDropAngle != null && footDropAngle > 15) flags.push('足下垂倾向: 摆动中期足趾下垂 ' + footDropAngle.toFixed(0) + '° — 廓清能力下降');
    else if (footDropAngle != null && footDropAngle > 8) flags.push('摆动中期足趾下垂轻度增大: ' + footDropAngle.toFixed(0) + '° — 关注背屈控制');

    if (maxDF < 5) flags.push('最大背屈 < 5° — 踝关节背屈严重受限 (距骨/跟骨撞击?)');

    if (ankleAngleCV != null && ankleAngleCV > 0.20) flags.push('踝背屈角度变异性大(CV=' + (ankleAngleCV * 100).toFixed(0) + '%) — 提示小脑节律控制不稳');

    if (stanceSD > 15 && groundReliable) flags.push('支撑相踝角不稳定 (SD=' + stanceSD.toFixed(0) + '°) — 本体感觉/平衡问题');

    if (flags.length === 0 && rom >= 15) flags.push('✓ 踝背屈/跖屈范围正常 (' + rom.toFixed(0) + '°)');

    return {
      side: side,
      coverage: coverage,
      ankleAngles: ankleAngles,
      stanceAvg: stanceMean,
      swingAvg: swingMean,
      maxDorsiflexion: maxDF,
      maxPlantarflexion: maxPF,
      rangeOfMotion: rom,
      footDropAngle: footDropAngle,           // 摆动相足下垂峰值 (足俯仰 P85, >0 = 趾低于跟)
      heelStrikeAngle: heelStrikeAngle,       // 脚跟着地瞬间踝角 (°)
      ankleAngleCV: ankleAngleCV,             // 背屈最大角度周期变异性
      ankleAngleSD: ankleAngleSD,
      perCycleMaxDF: perCycleMaxDF,
      groundAngle: groundAngleDeg,
      groundReliable: groundReliable,
      quality: quality,
      flags: flags
    };
  }

  // ============================================================
  // 骨盆/髋运动学 — 亚健康脑功能筛查核心指标
  //
  // 本应用为标准侧面拍摄 (cameraSide), 因此分两类:
  //   侧拍可测 (矢状面):
  //     骨盆垂直起伏   : 髋中点 Y 逐周期振幅 — 推进效率 / 基底节驱动 / 小脑节律
  //     髋屈伸 ROM     : 大腿 (髋→膝) 与垂直方向夹角的周期活动范围 — 运动皮层输出幅度
  //   正面才可测 (额状面/横断面), 侧拍返回 null:
  //     骨盆侧倾 / 横向摆动 / 旋转 / 髋外展
  // ============================================================
  function computePelvicKinematics(frames, scale, heelStrikes, options) {
    if (!frames || frames.length < 10) return { error: 'insufficient_frames' };
    options = options || {};
    var view = options.view || 'lateral';  // 本应用默认侧面拍摄

    var recs = [];
    for (var i = 0; i < frames.length; i++) {
      var lh = getKp(frames[i], 'left_hip');
      var rh = getKp(frames[i], 'right_hip');
      if (!lh || !rh || lh.score < 0.3 || rh.score < 0.3) continue;
      var lk = getKp(frames[i], 'left_knee');
      var rk = getKp(frames[i], 'right_knee');
      // 矢状面大腿角: 仅当膝明显低于髋 (>5px) 时可信 (关键点错位时 dy 会反转)
      var thighL = null, thighR = null;
      if (lk && lk.score >= 0.25 && (lk.y - lh.y) > 5) thighL = Math.atan2(lk.x - lh.x, lk.y - lh.y) * 180 / Math.PI;
      if (rk && rk.score >= 0.25 && (rk.y - rh.y) > 5) thighR = Math.atan2(rk.x - rh.x, rk.y - rh.y) * 180 / Math.PI;
      recs.push({
        t: frames[i].t,
        midX: (lh.x + rh.x) / 2,
        midY: (lh.y + rh.y) / 2,
        obliquity: Math.atan2(rh.y - lh.y, rh.x - lh.x) * 180 / Math.PI,
        hipWidth: Math.abs(rh.x - lh.x),
        thighL: thighL,   // 0°=垂直向下, + = 膝在髋前方 (屈髋, 侧拍)
        thighR: thighR
      });
    }
    if (recs.length < 20) return { error: 'insufficient_pelvis_data' };

    // ---- 中值滤波 (窗口5) 抑制关键点抖动 ----
    function medianFilter(vals, win) {
      var out = [], half = Math.floor(win / 2);
      for (var i = 0; i < vals.length; i++) {
        var w = [];
        for (var j = Math.max(0, i - half); j <= Math.min(vals.length - 1, i + half); j++) w.push(vals[j]);
        w.sort(function (a, b) { return a - b; });
        out.push(w[Math.floor(w.length / 2)]);
      }
      return out;
    }

    var cmPerPx = scale && scale > 0 ? scale * 100 : 0;

    // ---- 骨盆垂直起伏: 中值滤波 + 逐周期峰谷振幅 ( trimmed mean ), 抗远距离走向/转身 ----
    var midYFiltered = medianFilter(recs.map(function (r) { return r.midY; }), 5);
    var vertSignal = recs.map(function (r, idx) { return { t: r.t, x: midYFiltered[idx] }; });
    var vertPeaks   = findPeaks(vertSignal,  { minProminence: 1.5, minDistance: 6 });
    var vertValleys = findValleys(vertSignal, { minProminence: 1.5, minDistance: 6 });
    var cycleAmps = [];
    for (var p = 0; p < vertPeaks.length; p++) {
      var nearest = null, minDist = Infinity;
      for (var v = 0; v < vertValleys.length; v++) {
        var dd = Math.abs(vertValleys[v].t - vertPeaks[p].t);
        if (dd < minDist) { minDist = dd; nearest = vertValleys[v]; }
      }
      // 峰谷对应在 1s 内 (约一步), 振幅 > 0.5px 才算有效
      if (nearest && minDist < 1.0) {
        var amp = Math.abs(vertPeaks[p].value - nearest.value);
        if (amp > 0.5) cycleAmps.push(amp);
      }
    }
    var vertPx = cycleAmps.length >= 3 ? trimmedMean(cycleAmps) : null;
    var vertCm = (vertPx != null && cmPerPx) ? vertPx * cmPerPx : null;
    var verticalCV = cycleAmps.length >= 4 ? stddev(cycleAmps) / Math.max(mean(cycleAmps), 0.001) : null;
    // 生理上限门控: CV > 0.5 在人类步态中几乎不存在, 出现即判定为关键点跟踪噪声 → null
    if (verticalCV != null && verticalCV > 0.5) verticalCV = null;

    // ---- 髋屈伸 ROM (矢状面): 逐周期 max-min, trimmed mean ----
    function hipROM(getVal) {
      var sig = recs.map(function (r) { return { t: r.t, x: getVal(r) }; }).filter(function (s) { return s.x != null; });
      if (sig.length < 20) return null;
      var pk = findPeaks(sig, { minProminence: 3, minDistance: 6 });
      var vy = findValleys(sig, { minProminence: 3, minDistance: 6 });
      var roms = [];
      for (var i2 = 0; i2 < pk.length; i2++) {
        var nv2 = null, nd2 = Infinity;
        for (var j2 = 0; j2 < vy.length; j2++) {
          var d2 = Math.abs(vy[j2].t - pk[i2].t);
          if (d2 < nd2) { nd2 = d2; nv2 = vy[j2]; }
        }
        if (nv2 && nd2 < 1.0) {
          var rom = pk[i2].value - nv2.value;
          if (rom > 3 && rom < 90) roms.push(rom);  // 生理范围外视为噪声
        }
      }
      if (!roms.length) return null;
      return { rom: trimmedMean(roms), cycles: roms.length, cv: roms.length > 2 ? stddev(roms) / Math.max(mean(roms), 0.001) : null };
    }
    var hipL = hipROM(function (r) { return r.thighL; });
    var hipR = hipROM(function (r) { return r.thighR; });
    var hipROMMean = null, hipROMAsym = null;
    if (hipL && hipR) {
      hipROMMean = (hipL.rom + hipR.rom) / 2;
      // 不对称只在正面视角可信 — 侧拍远侧髋/膝被遮挡会系统性低估 ROM, 左右差是伪差
      if (view === 'frontal' && hipL.cycles >= 4 && hipR.cycles >= 4) {
        hipROMAsym = Math.abs(hipL.rom - hipR.rom) / ((hipL.rom + hipR.rom) / 2);
        if (hipROMAsym > 0.5) hipROMAsym = null;  // 超生理上限 → 跟踪噪声
      }
    } else if (hipL || hipR) {
      hipROMMean = (hipL || hipR).rom;
    }

    // ---- 额状面指标 (仅正面拍摄可信; 侧拍髋点重叠, 一律返回 null) ----
    var latCm = null, oblROM = null, obliquityAsymmetry = null, rotationEstimate = null;
    if (view === 'frontal') {
      var latP2P = 0;
      (function () {
        var vals = recs.map(function (r) { return r.midX; });
        var n = vals.length, sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (var i3 = 0; i3 < n; i3++) { sx += i3; sy += vals[i3]; sxy += i3 * vals[i3]; sx2 += i3 * i3; }
        var slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
        var intercept = (sy - slope * sx) / n;
        var mn = Infinity, mx = -Infinity;
        for (var i4 = 0; i4 < n; i4++) { var d3 = vals[i4] - (slope * i4 + intercept); if (d3 < mn) mn = d3; if (d3 > mx) mx = d3; }
        latP2P = mx - mn;
      })();
      latCm = cmPerPx ? latP2P * cmPerPx : null;
      var oblSignal = recs.map(function (r) { return { t: r.t, x: r.obliquity }; });
      var oblPeaks   = findPeaks(oblSignal,  { minProminence: 1, minDistance: 5 });
      var oblValleys = findValleys(oblSignal, { minProminence: 1, minDistance: 5 });
      if (oblPeaks.length >= 2 && oblValleys.length >= 2) {
        var pMean = oblPeaks.reduce(function (s, q) { return s + q.value; }, 0) / oblPeaks.length;
        var vMean = oblValleys.reduce(function (s, q) { return s + q.value; }, 0) / oblValleys.length;
        oblROM = Math.abs(pMean - vMean);
        obliquityAsymmetry = Math.abs(Math.abs(pMean) - Math.abs(vMean));
      }
      var widthSignal = recs.map(function (r) { return { t: r.t, x: r.hipWidth }; });
      var wPeaks   = findPeaks(widthSignal,  { minProminence: 1.5, minDistance: 5 });
      var wValleys = findValleys(widthSignal, { minProminence: 1.5, minDistance: 5 });
      if (wPeaks.length >= 2 && wValleys.length >= 2) {
        var ratios = [];
        for (var wp = 0; wp < wPeaks.length; wp++) {
          var nv3 = null, nd3 = Infinity;
          for (var wv = 0; wv < wValleys.length; wv++) {
            var wd = Math.abs(wValleys[wv].t - wPeaks[wp].t);
            if (wd < nd3) { nd3 = wd; nv3 = wValleys[wv]; }
          }
          if (nv3 && nd3 < 0.8 && wPeaks[wp].value > 5) ratios.push(nv3.value / wPeaks[wp].value);
        }
        if (ratios.length >= 2) {
          ratios.sort(function (x, y) { return x - y; });
          rotationEstimate = Math.acos(Math.min(1, Math.max(0.3, ratios[Math.floor(ratios.length / 2)]))) * 180 / Math.PI;
        }
      }
    }

    // ---- 亚健康/脑功能标记 ----
    var flags = [];
    if (vertCm != null) {
      if (vertCm < 2) flags.push('骨盆垂直起伏减小(' + vertCm.toFixed(1) + 'cm) — 步态推进僵硬, 提示基底节驱动下降/久坐模式');
      else if (vertCm > 8) flags.push('骨盆垂直起伏过大(' + vertCm.toFixed(1) + 'cm) — 能量效率低, 提示协调控制代偿');
    }
    if (hipROMMean != null) {
      if (hipROMMean < 20) flags.push('髋屈伸活动度减小(' + hipROMMean.toFixed(0) + '°) — 运动输出幅度受限, 常见于久坐/驱动不足');
      else if (hipROMMean > 55) flags.push('髋屈伸活动度过大(' + hipROMMean.toFixed(0) + '°) — 提示代偿性高抬腿或协调过度');
    }
    if (hipROMAsym != null && hipROMAsym > 0.25) flags.push('左右髋屈伸幅度不对称(' + (hipROMAsym * 100).toFixed(0) + '%) — 双侧运动控制不平衡');
    if (verticalCV != null && verticalCV > 0.30) flags.push('骨盆起伏节奏不稳(CV=' + (verticalCV * 100).toFixed(0) + '%) — 提示小脑节律控制波动');
    if (latCm != null && latCm > 6) flags.push('骨盆横向摆动增大(' + latCm.toFixed(1) + 'cm) — 前庭-平衡系统/躯干侧向控制需关注');
    if (obliquityAsymmetry != null && obliquityAsymmetry > 3) flags.push('骨盆侧倾不对称(' + obliquityAsymmetry.toFixed(1) + '°) — 双侧前庭/小脑协调存在差异');
    if (flags.length === 0) flags.push('✓ 骨盆运动学指标在亚健康筛查参考范围内');
    if (view !== 'frontal') flags.push('ℹ 侧面拍摄: 骨盆侧倾/横摆/旋转为正面视角指标, 本次不可测');

    return {
      view: view,
      verticalOscillation: vertCm,          // cm (逐周期中位振幅)
      verticalOscillationPx: vertPx,
      verticalCV: verticalCV,
      hipFlexion: {
        left: hipL, right: hipR,            // {rom, cycles, cv}
        meanROM: hipROMMean,                // °
        asymmetry: hipROMAsym
      },
      // 以下仅正面拍摄可得, 侧拍为 null
      lateralSway: latCm,
      obliquityROM: oblROM,
      obliquityAsymmetry: obliquityAsymmetry,
      rotationEstimate: rotationEstimate,
      hipAbduction: { left: null, right: null, asymmetry: null },
      sampleCount: recs.length,
      flags: flags
    };
  }

  /**
   * 步频: 1 分钟总步数 (左右脚合计)
   * 步态周期 (单脚相邻 HS 间隔) = 2 个步的时间
   * cadence = 60 / avgCycle * 2
   */
  /**
   * 有效周期过滤 — 来回走视频的转身/站立/漏检合并周期会污染
   * cadence/rhythmCV/步长/支撑相 (真实视频确诊: 2.5s+ 的"周期"把
   * rhythmCV 拉到 ~3, cadence 低估 25%+)
   *
   * 算法: 相邻 HS 间隔先过绝对界 [0.6s, 1.8s] (人类步态周期合理范围)
   *   → 幸存间隔求中位数 med → 再精滤 [0.6×med, 1.6×med]
   *   → 两侧间隔均无效的孤立 HS 一并剔除
   *
   * @param {Array} hs - 单侧 HS 事件 (需含 time)
   * @returns {Object} { hs: 过滤后HS, cycles: [{t0,t1,dur}], medianCycle }
   */
  function filterValidCycles(hs) {
    var result = { hs: hs ? hs.slice() : [], cycles: [], medianCycle: 0 };
    if (!hs || hs.length < 2) return result;
    var intervals = [];
    for (var i = 0; i < hs.length - 1; i++) {
      intervals.push({ idx: i, dur: hs[i + 1].time - hs[i].time });
    }
    // 绝对界初筛 (全部越界时退回全部, 避免空集)
    var pool = intervals.filter(function (iv) { return iv.dur >= 0.6 && iv.dur <= 1.8; });
    if (pool.length === 0) pool = intervals;
    var durs = pool.map(function (iv) { return iv.dur; }).sort(function (a, b) { return a - b; });
    var med = durs[Math.floor(durs.length / 2)];
    // 中位数精滤
    var lo = Math.max(0.4, med * 0.6), hi = Math.min(2.5, med * 1.6);
    var validIdx = {};
    pool.forEach(function (iv) {
      if (iv.dur >= lo && iv.dur <= hi) {
        validIdx[iv.idx] = true;
        result.cycles.push({ t0: hs[iv.idx].time, t1: hs[iv.idx + 1].time, dur: iv.dur });
      }
    });
    // 保留至少一侧邻接有效周期的 HS
    var kept = [];
    for (var i = 0; i < hs.length; i++) {
      if (validIdx[i] || validIdx[i - 1]) kept.push(hs[i]);
    }
    result.hs = kept.length >= 2 ? kept : hs.slice();
    if (result.cycles.length) {
      var vd = result.cycles.map(function (c) { return c.dur; }).sort(function (a, b) { return a - b; });
      result.medianCycle = vd[Math.floor(vd.length / 2)];
    }
    return result;
  }

  function computeCadence(heelStrikes) {
    if (heelStrikes.length < 2) return 0;
    var intervals = [];
    for (var i = 1; i < heelStrikes.length; i++) {
      var dt = heelStrikes[i].time - heelStrikes[i - 1].time;
      if (dt > 0) intervals.push(dt);
    }
    if (intervals.length === 0) return 0;
    var sum = 0;
    for (var k = 0; k < intervals.length; k++) sum += intervals[k];
    var avgCycle = sum / intervals.length;
    return (60 / avgCycle) * 2;
  }

  /**
   * 步速 = 步幅 × 步频 / 120  (m/s)
   */
  function computeGaitSpeed(strideLength, cadence) {
    return strideLength * cadence / 120;
  }

  /**
   * 步态周期时相: 支撑相 (脚在地面) / 摆动相 (脚在空中) / 双支撑 — 实测版
   *
   * stance% = mean(TO-HS) / mean(cycle) × 100 (每侧各自实测, 不再写死 60%)
   * swing%  = 100 - stance%
   * doubleSupport = 双脚 stance 区间 (HS→TO) 时间重叠占周期比 × 100
   * toeOffs 不足 2 个时退回经验值 60/40/12 并 console.warn
   *
   * @param {Array} frames
   * @param {Array} heelStrikes  本侧 HS
   * @param {Array} toeOffs      本侧 TO
   * @param {Array} [otherHS]    对侧 HS (可选, 用于双支撑重叠)
   * @param {Array} [otherTO]    对侧 TO (可选)
   */
  function computeStanceSwing(frames, heelStrikes, toeOffs, otherHS, otherTO) {
    if (!heelStrikes || heelStrikes.length < 2) return { stancePct: 0, swingPct: 0, doubleSupport: 0 };
    if (!toeOffs || toeOffs.length < 2) {
      console.warn('[gait] computeStanceSwing: TO 事件不足 (' + (toeOffs ? toeOffs.length : 0) + ' < 2), 退回经验值 60/40/12');
      return { stancePct: 60, swingPct: 40, doubleSupport: 12 };
    }
    // 收集 stance 区间 [HS, TO]: 每个 HS→HS 周期内找落在其中的 TO
    // 周期窗口与 filterValidCycles 同逻辑 (中位数精滤) — 旧 0.2-3.0s 宽松界会把
    // 跨转身的合并周期 (如 2.77s) 连同其间的伪 TO 算进来, 支撑相被拖低 (真实视频确诊: 42.8% vs 实际 53.9%)
    function collectStance(HS, TO) {
      var mc = filterValidCycles(HS).medianCycle || 1.0;
      var loC = Math.max(0.4, mc * 0.6), hiC = Math.min(2.0, mc * 1.6);
      var intervals = [], stanceSum = 0, cycleSum = 0;
      for (var i = 0; i < HS.length - 1; i++) {
        var t0 = HS[i].time, t1 = HS[i + 1].time;
        var cycle = t1 - t0;
        if (cycle < loC || cycle > hiC) continue;
        var to = null;
        for (var j = 0; j < TO.length; j++) {
          if (TO[j].time > t0 + 0.02 && TO[j].time < t1 - 0.02) { to = TO[j]; break; }
        }
        if (!to) continue;
        intervals.push([t0, to.time]);
        stanceSum += to.time - t0;
        cycleSum += cycle;
      }
      return { intervals: intervals, stanceSum: stanceSum, cycleSum: cycleSum };
    }
    var mine = collectStance(heelStrikes, toeOffs);
    if (mine.cycleSum <= 0 || mine.intervals.length === 0) {
      console.warn('[gait] computeStanceSwing: 无有效 HS→TO 配对, 退回经验值 60/40/12');
      return { stancePct: 60, swingPct: 40, doubleSupport: 12 };
    }
    var stancePct = (mine.stanceSum / mine.cycleSum) * 100;
    var swingPct = 100 - stancePct;
    // 双支撑: 双脚 stance 区间的时间重叠 / 本侧周期总长
    var doubleSupport = 0;
    if (otherHS && otherTO && otherHS.length >= 2 && otherTO.length >= 1) {
      var other = collectStance(otherHS, otherTO);
      var overlap = 0;
      for (var a = 0; a < mine.intervals.length; a++) {
        for (var b = 0; b < other.intervals.length; b++) {
          var lo = Math.max(mine.intervals[a][0], other.intervals[b][0]);
          var hi = Math.min(mine.intervals[a][1], other.intervals[b][1]);
          if (hi > lo) overlap += hi - lo;
        }
      }
      doubleSupport = Math.min(40, (overlap / mine.cycleSum) * 100);
    }
    return {
      stancePct: stancePct,
      swingPct: swingPct,
      doubleSupport: doubleSupport,
      count: mine.intervals.length   // 有效 stance 区间数 (样本充分性判断用)
    };
  }

  // ============================================================
  // 统计工具
  // ============================================================
  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function stddev(arr) {
    if (!arr || arr.length < 2) return 0;
    var m = mean(arr);
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / (arr.length - 1));
  }

  function cv(arr) {
    var m = mean(arr);
    if (m === 0) return 0;
    return stddev(arr) / m;
  }

  // 去除两端离群值后再求均值 (trim 比例 0.0-0.5, 默认 0.2)
  function trimmedMean(arr, trimPct) {
    trimPct = trimPct || 0.2;
    if (!arr || arr.length === 0) return 0;
    if (arr.length <= 3) return mean(arr);  // 太短不 trim
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var trimCount = Math.floor(sorted.length * trimPct);
    var keep = sorted.slice(trimCount, sorted.length - trimCount);
    if (keep.length === 0) return mean(arr);
    return mean(keep);
  }

  // 子帧 HS 精炼: 在检测到的 Y 最小值附近做抛物线插值
  function refineHeelStrike(frames, hs, side) {
    if (!hs || hs.frameIndex === undefined) return hs;
    var kpName = side + '_ankle';
    var fi = hs.frameIndex;
    if (fi < 1 || fi >= frames.length - 1) return hs;
    var y0 = getKp(frames[fi - 1], kpName);
    var y1 = getKp(frames[fi],     kpName);
    var y2 = getKp(frames[fi + 1], kpName);
    if (!y0 || !y1 || !y2 || y0.score < 0.2 || y1.score < 0.2 || y2.score < 0.2) return hs;
    // 抛物线插值: y = a*t² + b*t + c, 设 t=-1,0,1
    var a = (y0.y + y2.y - 2 * y1.y) / 2;
    var b = (y2.y - y0.y) / 2;
    if (Math.abs(a) < 0.01) return hs;  // 近乎直线, 不插值
    var tPeak = -b / (2 * a);  // 谷底位置 (-1 到 1 之间)
    if (tPeak < -0.8 || tPeak > 0.8) return hs;  // 极值在邻域外
    // tPeak=0 表示谷底恰好在 fi, <0 表示谷底在 fi-1 侧, >0 在 fi+1 侧
    var refinedTime = frames[fi].t + tPeak * (frames[fi + 1].t - frames[fi].t);
    return {
      frameIndex: hs.frameIndex,
      time: refinedTime,
      x: hs.x + tPeak * (frames[fi + 1].t - frames[fi].t > 0 ?
        (getKp(frames[fi + Math.sign(tPeak) || 0], kpName) || hs).x - hs.x : 0),
      y: y1.y + b * tPeak + a * tPeak * tPeak,
      confidence: hs.confidence,
      refined: true
    };
  }

  function asymmetry(left, right) {
    if (!left || !right || left === 0 || right === 0) return 0;
    return Math.abs(left - right) / Math.max(left, right);
  }

  // ============================================================
  // 主入口: 从关键点序列计算全套参数
  // ============================================================
  function computeAllParams(frames, scale, options) {
    if (!frames || frames.length === 0 || !scale || scale <= 0) {
      return { error: 'invalid_input' };
    }
    options = options || {};

    // === 步态事件检测: 主路径 Zeni 骨盆相对坐标法, 失败退回旧 Y 轨迹法 ===
    var events = detectGaitEvents(frames);
    var eventsMethod = events.usedMethod;
    var leftHS, rightHS, leftTO, rightTO;
    if (events.usedMethod === 'pelvis-rel') {
      leftHS  = events.left.hs;  rightHS = events.right.hs;
      leftTO  = events.left.to;  rightTO = events.right.to;
    } else {
      console.warn('[gait] detectGaitEvents 骨盆相对法不可用 (usedMethod=none), 退回旧 Y 轨迹 HS/TO 检测');
      leftHS  = detectHeelStrikes(frames, 'left');
      rightHS = detectHeelStrikes(frames, 'right');
      leftTO  = detectToeOffs(frames, 'left', leftHS);
      rightTO = detectToeOffs(frames, 'right', rightHS);
    }
    var allHS = leftHS.concat(rightHS).sort(function (a, b) { return a.time - b.time; });

    // 降级模式: HS < 3 时无法做步态周期分析, 但仍可输出运动学参数
    var degraded = allHS.length < 3;

    // 尝试用空数组兜底计算 — 部分参数不依赖 HS
    var noHS = [];

    if (degraded) {
      console.warn('[gait] degraded mode: only ' + allHS.length + ' heel strikes detected');
      // 降级模式: 只输出不依赖步态周期的参数
      // 躯干前倾
      var trunkAngles = [];
      for (var i = 0; i < frames.length; i++) {
        var t = extractTrunkAngle(frames[i]);
        if (t) trunkAngles.push(t.lean);
      }
      var trunkLeanFwd = mean(trunkAngles);
      return {
        scale: scale,
        degraded: true,
        eventsMethod: eventsMethod,
        debug: events.debug,
        heelStrikes: { left: leftHS, right: rightHS },
        parameters: {
          stepLength:    { value: null, unit: 'm',     normal: NORMAL.stepLength,    status: 'unknown' },
          strideLength:  { value: null, unit: 'm',     normal: NORMAL.strideLength,  status: 'unknown' },
          stepWidth:     { value: null, unit: 'm',     normal: NORMAL.stepWidth,     status: 'unknown' },
          footAngle:     { value: null, unit: '°',     normal: NORMAL.footAngle,     status: 'unknown' },
          cadence:       { value: null, unit: '步/分', normal: NORMAL.cadence,       status: 'unknown' },
          gaitSpeed:     { value: null, unit: 'm/s',   normal: NORMAL.gaitSpeed,     status: 'unknown' },
          stancePct:     { value: null, unit: '%',     normal: NORMAL.stancePct,     status: 'unknown' },
          swingPct:      { value: null, unit: '%',     normal: NORMAL.swingPct,      status: 'unknown' },
          doubleSupport: { value: null, unit: '%',     normal: NORMAL.doubleSupport, status: 'unknown' }
        },
        asymmetries: {},
        extras: { trunkLeanFwd: trunkLeanFwd, rhythmCV: null, stepCount: allHS.length },
        armSwing: computeArmSwing(frames, scale, { left: leftHS, right: rightHS }),
        elbowSwing: computeElbowSwing(frames, scale),
        kneeLeft: { note: '步态周期不足, 无法按周期分析' },
        kneeRight: { note: '步态周期不足, 无法按周期分析' },
        ankleLeft: computeAnkleKinematics(frames, noHS, 'left'),
        ankleRight: computeAnkleKinematics(frames, noHS, 'right'),
        pelvic: computePelvicKinematics(frames, scale, { left: leftHS, right: rightHS }, { view: options.view || 'lateral' })
      };
    }

    // 逐事件 scale 用的身高标定 (米): 优先 options.heightM 显式传入;
    // 否则用全序列中位像素身高反推 (scale × bodyH / 0.97, 与 calibrateByHeight 约定一致),
    // 使来回走近/远镜头端的步长各自按实测人体像素身高换算; 无身高信息时为 0 → 沿用全局 scale
    var refBodyH = estimateBodyHeightPx(frames);
    var heightM = options.heightM || (refBodyH ? scale * refBodyH / 0.97 : 0);

    // === 有效周期过滤: 剔除转身/站立/漏检合并周期对统计的污染 (真实视频确诊根因) ===
    var filtL = filterValidCycles(leftHS), filtR = filterValidCycles(rightHS);
    var walkL = filtL.hs, walkR = filtR.hs;
    var validCycles = filtL.cycles.length + filtR.cycles.length;
    console.log('[gait] valid cycles: L=' + filtL.cycles.length + ' R=' + filtR.cycles.length +
      ' | medianCycle L=' + (filtL.medianCycle ? filtL.medianCycle.toFixed(2) : '?') +
      's R=' + (filtR.medianCycle ? filtR.medianCycle.toFixed(2) : '?') +
      's | HS L=' + leftHS.length + '→' + walkL.length + ' R=' + rightHS.length + '→' + walkR.length);

    // 位移离群过滤: 转身相邻的"周期"时长正常但位移极小 (真实视频: 82-93px 假步幅 ≈0.2m)
    // 保留 [0.5×中位, 1.6×中位] 区间内的样本
    function filterOutliers(items, getVal) {
      if (!items || items.length < 3) return items;
      var vals = items.map(getVal).sort(function (a, b) { return a - b; });
      var med = vals[Math.floor(vals.length / 2)];
      if (med <= 0) return items;
      return items.filter(function (it) { var v = getVal(it); return v >= med * 0.5 && v <= med * 1.6; });
    }

    // === 样本充分性: 一侧有效样本 < MIN_SIDE 时, 整体值用较好的一侧,
    //     不对称指数置 null (未测得) — 不把垃圾样本平均进去 (真实视频: 右脚有效
    //     步幅样本=2 且全是假阳性/转身对, 平均后步幅 0.55m < 步长 0.60m 自相矛盾) ===
    var MIN_SIDE = 3;
    function mergeSides(vL, vR, nL, nR) {
      if (nL >= MIN_SIDE && nR >= MIN_SIDE) return (vL + vR) / 2;
      return nL >= nR ? vL : vR;  // 只一侧够或都不够: 用样本较多的一侧
    }
    function sideAsym(vL, vR, nL, nR) {
      if (nL < MIN_SIDE || nR < MIN_SIDE) return null;  // 样本不足 → 不对称指数未测得
      return asymmetry(vL, vR);
    }

    // 步长
    var stepLens = filterOutliers(computeStepLengths(walkL, walkR, scale, heightM), function (s) { return s.value; });
    var stepLensL = [], stepLensR = [];
    stepLens.forEach(function (s) {
      if (s.to === 'left') stepLensL.push(s.value);
      else stepLensR.push(s.value);
    });
    var stepLengthL = trimmedMean(stepLensL);
    var stepLengthR = trimmedMean(stepLensR);
    var stepLength  = trimmedMean(stepLens.map(function (s) { return s.value; }));

    // 步幅
    var stridesL = filterOutliers(computeStrideLengths(walkL, scale, heightM), function (s) { return s.value; });
    var stridesR = filterOutliers(computeStrideLengths(walkR, scale, heightM), function (s) { return s.value; });
    var strideLengthL = trimmedMean(stridesL.map(function (s) { return s.value; }));
    var strideLengthR = trimmedMean(stridesR.map(function (s) { return s.value; }));
    var strideLength  = mergeSides(strideLengthL, strideLengthR, stridesL.length, stridesR.length);

    // 步宽
    var widths = computeStepWidths(frames, walkL, walkR, scale);
    var stepWidth = trimmedMean(widths.map(function (w) { return w.value; }));

    // 足偏角 (足轴 vs 步向, 支撑中期中位数; 覆盖率不足为 null)
    var footRes = computeFootAngles(frames, events);
    var footAngleL = footRes.left, footAngleR = footRes.right;
    var faN = (footAngleL != null ? 1 : 0) + (footAngleR != null ? 1 : 0);
    var footAngle = faN > 0 ? ((footAngleL || 0) + (footAngleR || 0)) / faN : null;

    // 步频 — 有效周期中位数换算 (转身间隔不再拉低; 单侧无效时用另一侧)
    var cadenceL = filtL.medianCycle ? 120 / filtL.medianCycle : 0;
    var cadenceR = filtR.medianCycle ? 120 / filtR.medianCycle : 0;
    var cadence  = (cadenceL && cadenceR) ? (cadenceL + cadenceR) / 2 : (cadenceL || cadenceR);

    // 步速
    var gaitSpeed = computeGaitSpeed(strideLength, cadence);

    // 步态周期时相 (实测 HS→TO; 双支撑 = 双脚 stance 区间重叠; 用过滤后 HS)
    var phaseL = computeStanceSwing(frames, walkL, leftTO, walkR, rightTO);
    var phaseR = computeStanceSwing(frames, walkR, rightTO, walkL, leftTO);
    var stancePct = mergeSides(phaseL.stancePct, phaseR.stancePct, phaseL.count, phaseR.count);
    var swingPct  = 100 - stancePct;
    var doubleSupport = mergeSides(phaseL.doubleSupport, phaseR.doubleSupport, phaseL.count, phaseR.count);

    // 不对称性 (任一侧样本不足 → null 未测得, 报告如实显示而非给出假数字)
    var stepLenAsym    = sideAsym(stepLengthL, stepLengthR, stepLensL.length, stepLensR.length);
    var strideAsym     = sideAsym(strideLengthL, strideLengthR, stridesL.length, stridesR.length);
    var footAngleAsym  = (footAngleL != null && footAngleR != null) ? asymmetry(footAngleL, footAngleR) : null;
    var cadenceAsym    = (filtL.cycles.length >= MIN_SIDE && filtR.cycles.length >= MIN_SIDE) ? asymmetry(cadenceL, cadenceR) : null;
    var stanceAsym     = (phaseL.count >= MIN_SIDE && phaseR.count >= MIN_SIDE) ? Math.abs(phaseL.stancePct - phaseR.stancePct) / 100 : null;

    // 躯干前倾 (取整段均值)
    var trunkAngles = [];
    for (var i = 0; i < frames.length; i++) {
      var t = extractTrunkAngle(frames[i]);
      if (t) trunkAngles.push(t.lean);
    }
    var trunkLeanFwd = mean(trunkAngles);

    // 节奏变异性 (鲁棒 CV): 用同侧相邻 HS 的周期间隔 — 比左右交替步时更抗检测相位误差
    var cycleDurs = [];
    [walkL, walkR].forEach(function (hsArr) {
      for (var ci = 0; ci < hsArr.length - 1; ci++) {
        var dd = hsArr[ci + 1].time - hsArr[ci].time;
        if (dd > 0.5 && dd < 2.0) cycleDurs.push(dd);
      }
    });
    var rhythmCV = null;
    if (cycleDurs.length >= 5) {
      var dSorted = cycleDurs.slice().sort(function (a, b) { return a - b; });
      var dMed = dSorted[Math.floor(dSorted.length / 2)];
      var dFilt = cycleDurs.filter(function (d) { return d >= dMed * 0.75 && d <= dMed * 1.33; });
      rhythmCV = dFilt.length >= 4 ? cv(dFilt) : null;
    }

    // === 稳定步行段裁窗: 周期级运动学 (摆臂/踝/骨盆) 只分析有效周期窗口内的帧,
    //     剔除转身与方向切换段 — 它们不是步行, 会把 CV/协调性指标污染成"异常" ===
    var steadyFrames = frames;
    if (walkL.length + walkR.length >= 3) {
      var wins = [];
      [walkL, walkR].forEach(function (hsArr) {
        for (var wi = 0; wi < hsArr.length - 1; wi++) wins.push([hsArr[wi].time, hsArr[wi + 1].time]);
      });
      steadyFrames = frames.filter(function (f) {
        for (var wj = 0; wj < wins.length; wj++) {
          if (f.t >= wins[wj][0] - 0.1 && f.t <= wins[wj][1] + 0.1) return true;
        }
        return false;
      });
      if (steadyFrames.length < 30) steadyFrames = frames;  // 裁完太少则放弃裁窗
      else console.log('[gait] steady-window: ' + frames.length + '→' + steadyFrames.length + ' frames (' + wins.length + ' cycle windows)');
    }

    return {
      degraded: false,
      scale: scale,
      eventsMethod: eventsMethod,   // 'pelvis-rel' (Zeni 主路径) | 'none' (退回旧 Y 轨迹)
      debug: events.debug,          // detectGaitEvents 的调试轨迹 (heelRel/toeRel 骨盆相对坐标)
      duration: frames[frames.length - 1].t - frames[0].t,
      totalFrames: frames.length,
      heelStrikes: { left: leftHS, right: rightHS, all: allHS },
      parameters: {
        stepLength:    { value: stepLength,    left: stepLengthL,    right: stepLengthR,    unit: 'm',     normal: NORMAL.stepLength,    status: rangeStatus(stepLength, 'stepLength') },
        strideLength:  { value: strideLength,  left: strideLengthL,  right: strideLengthR,  unit: 'm',     normal: NORMAL.strideLength,  status: rangeStatus(strideLength, 'strideLength') },
        stepWidth:     { value: stepWidth,                              unit: 'm',     normal: NORMAL.stepWidth,     status: rangeStatus(stepWidth, 'stepWidth') },
        footAngle:     { value: footAngle,     left: footAngleL,     right: footAngleR,     unit: '°',     normal: NORMAL.footAngle,     status: rangeStatus(footAngle, 'footAngle') },
        cadence:       { value: cadence,       left: cadenceL,       right: cadenceR,       unit: '步/分', normal: NORMAL.cadence,       status: rangeStatus(cadence, 'cadence') },
        gaitSpeed:     { value: gaitSpeed,                              unit: 'm/s',   normal: NORMAL.gaitSpeed,     status: rangeStatus(gaitSpeed, 'gaitSpeed') },
        stancePct:     { value: stancePct,                              unit: '%',     normal: NORMAL.stancePct,     status: rangeStatus(stancePct, 'stancePct') },
        swingPct:      { value: swingPct,                               unit: '%',     normal: NORMAL.swingPct,      status: rangeStatus(swingPct, 'swingPct') },
        doubleSupport: { value: doubleSupport,                          unit: '%',     normal: NORMAL.doubleSupport, status: rangeStatus(doubleSupport, 'doubleSupport') }
      },
      asymmetries: {
        stepLength:   stepLenAsym,
        strideLength: strideAsym,
        footAngle:   footAngleAsym,
        cadence:     cadenceAsym,
        stance:      stanceAsym
      },
      extras: {
        trunkLeanFwd: trunkLeanFwd,
        rhythmCV:     rhythmCV,
        stepCount:    allHS.length,
        validCycles:  validCycles
      },
      armSwing: computeArmSwing(steadyFrames, scale, { left: walkL, right: walkR }),
      elbowSwing: computeElbowSwing(frames, scale),
      kneeLeft: computeKneeBraking(frames, leftHS, 'left'),
      kneeRight: computeKneeBraking(frames, rightHS, 'right'),
      ankleLeft: computeAnkleKinematics(steadyFrames, walkL, 'left'),
      ankleRight: computeAnkleKinematics(steadyFrames, walkR, 'right'),
      pelvic: computePelvicKinematics(steadyFrames, scale, { left: walkL, right: walkR }, { view: options.view || 'lateral' })
    };
  }

  // ============================================================
  // 步态分类 (ANRM 6 种病理步态 + 正常)
  // ============================================================
  function classifyGait(params) {
    if (!params || !params.parameters) return { primary: 'unknown', confidence: 0, scores: {} };
    var p = params.parameters;
    var a = params.asymmetries;
    var e = params.extras || {};

    var scores = {};
    var arm = params.armSwing || {};

    // 数据充分性门槛: 有效周期/步数不足时不下结论 (防止垃圾数据触发病理误判)
    if ((e.validCycles != null && e.validCycles < 4) || (e.stepCount != null && e.stepCount < 6)) {
      return { primary: 'insufficient', primaryLabel: '数据不足 (有效行走周期过少)', confidence: 0, scores: {}, differential: [] };
    }

    // 偏瘫步态: 步长↓ + 不对称性↑ + 肩摆不对称 (ANRM §8.1 上肢屈曲协同)
    if (p.stepLength.value < 0.50 && a.stepLength > 0.20 && a.stance > 0.05) {
      scores.hemiplegic = 0.40 + (0.50 - p.stepLength.value) * 0.5 + a.stepLength * 0.5;
      if (arm.shoulder && arm.shoulder.asymmetry > 0.25) {
        scores.hemiplegic += Math.min(arm.shoulder.asymmetry, 0.6) * 0.25;
      }
    } else { scores.hemiplegic = 0; }

    // 帕金森步态: 步频↑ + 步长↓↓ + 步速↓ + 躯干前倾 + 肩摆减少 (ANRM §8.2 摆臂减少)
    // 阈值适配手机摄像头: 步长<0.35 步速<0.7 才触发 (正常标定偏 10% 不会误判)
    if (p.cadence.value > 115 && p.stepLength.value < 0.35 && p.gaitSpeed.value < 0.8) {
      scores.parkinsonian = 0.30 + (p.cadence.value - 110) / 50 * 0.2 +
        (0.40 - p.stepLength.value) * 0.3 + (e.trunkLeanFwd > 0 ? Math.min(e.trunkLeanFwd, 20) / 20 * 0.2 : 0);
      if (arm.shoulder && arm.shoulder.avgNormalized < 0.12) {
        scores.parkinsonian += (0.12 - arm.shoulder.avgNormalized) * 1.5;
      }
    } else { scores.parkinsonian = 0; }

    // 共济失调步态: 步宽↑ + 节奏变异↑ + 上下肢失协调 (ANRM §8.3 辨距不良泛化)
    // 触发线与 NORMAL.stepWidth.max=0.18 对齐 (旧 0.13 低于正常上限, 会自相矛盾误判)
    if (p.stepWidth.value > 0.18 && e.rhythmCV > 0.15) {
      scores.ataxic = 0.25 + (p.stepWidth.value - 0.18) * 1.5 + e.rhythmCV * 0.5;
      if (arm.coordination && arm.coordination.avg < 0.25) {
        scores.ataxic += (0.25 - arm.coordination.avg) * 0.8;
      }
      if (arm.shoulder && arm.shoulder.avgNormalized > 0.35) {
        scores.ataxic += (arm.shoulder.avgNormalized - 0.35) * 0.6;
      }
    } else { scores.ataxic = 0; }

    // 足下垂步态: 步长↓ + 足偏角异常 + 不对称
    if (p.stepLength.value < 0.50 && a.footAngle > 0.20) {
      scores.footdrop = 0.25 + (0.50 - p.stepLength.value) * 0.4 + a.footAngle * 0.3;
    } else { scores.footdrop = 0; }

    // 疼痛步态 (保护性): 支撑相明显缩短 + 不对称
    if (p.stancePct.value < 55 && a.stance > 0.10) {
      scores.antalgic = 0.20 + (55 - p.stancePct.value) / 20 * 0.3 + a.stance * 0.5;
    } else { scores.antalgic = 0; }

    // 老年步态: 步长↓ + 步速↓ + 步宽可能略增
    if (p.stepLength.value < 0.55 && p.gaitSpeed.value < 1.0 && p.cadence.value < 105) {
      scores.elderly = 0.20 + (0.55 - p.stepLength.value) * 0.4 + (1.0 - p.gaitSpeed.value) * 0.3;
    } else { scores.elderly = 0; }

    // 正常步态: 按正常参数比例打分
    // status='unknown' 的项 (如足偏角覆盖率不足为 null) 不计入分母 —
    // 否则测量不可用的项会拖低"正常"得分, 让病理分相对胜出 (真实视频确诊误判路径)
    var normalKeys = ['stepLength','strideLength','stepWidth','footAngle','cadence','gaitSpeed','stancePct'];
    var availKeys = normalKeys.filter(function (k) { return p[k].status !== 'unknown'; });
    var normalCount = availKeys.filter(function (k) { return p[k].status === 'normal'; }).length;
    var borderlineCount = availKeys.filter(function (k) {
      var s = p[k].status;
      return s === 'normal' || s === 'mild';
    }).length;
    if (availKeys.length >= 5) {
      var normalRatio = normalCount / availKeys.length;
      var borderlineRatio = borderlineCount / availKeys.length;
      if (normalRatio >= 0.85) {
        scores.normal = 0.60 + Math.min(1, (normalRatio - 0.85) / 0.15) * 0.15;  // 0.60-0.75
      } else if (borderlineRatio >= 0.70) {
        scores.normal = 0.40;  // 接近正常
      } else {
        scores.normal = 0.10;  // 非正常, 但不归零 (防止病理类型被强制选中)
      }
    } else {
      scores.normal = 0.10;  // 可用参数太少, 不给正常高分
    }

    // 找最高分类
    var labels = {
      hemiplegic:   '偏瘫步态',
      parkinsonian: '帕金森步态',
      ataxic:       '共济失调步态',
      footdrop:     '足下垂步态',
      antalgic:     '疼痛步态',
      elderly:      '老年步态',
      normal:       '正常步态'
    };

    var primaryKey = 'normal';
    var primaryScore = scores.normal || 0;
    Object.keys(scores).forEach(function (k) {
      if (scores[k] > primaryScore) {
        primaryScore = scores[k];
        primaryKey = k;
      }
    });

    // 如果正常得分 ≥ 0.40 但病理得分更高, 仍然输出正常 (除非病理显著高于正常)
    if (primaryKey !== 'normal' && (scores.normal || 0) >= 0.40 && primaryScore < (scores.normal || 0) + 0.15) {
      primaryKey = 'normal';
      primaryScore = scores.normal || 0.40;
    }

    var confidence = Math.min(primaryScore, 0.95);

    // 鉴别诊断: 得分超过主类型 50% 的其他类型
    var differential = [];
    Object.keys(scores).forEach(function (k) {
      if (k !== primaryKey && scores[k] > primaryScore * 0.5 && scores[k] > 0.10) {
        differential.push({ type: k, label: labels[k], score: scores[k] });
      }
    });
    differential.sort(function (a, b) { return b.score - a.score; });

    return {
      primary: primaryKey,
      primaryLabel: labels[primaryKey],
      confidence: confidence,
      scores: scores,
      differential: differential
    };
  }

  // ============================================================
  // 神经定位映射 (ANRM 602 系列)
  // ============================================================
  var NEURO_MAP = {
    hemiplegic: {
      level: '中枢神经系统 (上运动神经元)',
      regions: ['皮层运动区', '皮层脊髓束'],
      possibleCauses: ['脑卒中 (MCA 供血区)', '脑外伤', '脑肿瘤', '脑炎后遗症'],
      features: ['划圈步态', '上肢屈曲协同', '膝过伸', '足下垂', '踝内翻']
    },
    parkinsonian: {
      level: '基底节',
      regions: ['黑质-纹状体', '基底节环路'],
      possibleCauses: ['帕金森病', '帕金森综合征', '进行性核上性麻痹', '多系统萎缩'],
      features: ['慌张步态 (小碎步)', '冻结现象', '启动困难', '前倾姿势', '摆臂减少']
    },
    ataxic: {
      level: '小脑 / 本体感觉通路',
      regions: ['小脑蚓部', '脊髓后索', '周围神经 (感觉)'],
      possibleCauses: ['小脑卒中/肿瘤', '脊髓小脑变性', '维生素B12缺乏', '糖尿病周围神经病变'],
      features: ['宽基底步态', '步长不规则', '醉酒样', '闭眼加重 (Romberg阳性)']
    },
    footdrop: {
      level: '周围神经 (下运动神经元)',
      regions: ['腓总神经', 'L4-L5神经根'],
      possibleCauses: ['L5神经根压迫', '腓总神经损伤', '腓骨骨折', '糖尿病神经病变'],
      features: ['高抬腿 (跨阈步态)', '足尖着地', '足拍地']
    },
    antalgic: {
      level: '局部疼痛源 (非神经定位)',
      regions: ['疼痛部位'],
      possibleCauses: ['髋膝关节骨关节炎', '腰椎间盘突出', '足底筋膜炎', '下肢骨折/扭伤'],
      features: ['患侧支撑相缩短', '步速降低', '保护性体位']
    },
    elderly: {
      level: '多因素 (增龄性退变)',
      regions: ['多系统退变'],
      possibleCauses: ['肌少症', '前庭功能减退', '视觉退化', '认知功能下降', '多病共存'],
      features: ['步速降低', '步长缩短', '步频减慢', '步宽略增', '双支撑期延长']
    },
    normal: {
      level: '正常',
      regions: [],
      possibleCauses: [],
      features: ['步态参数在正常参考范围内']
    }
  };

  function getNeuroLocalization(gaitType) {
    return NEURO_MAP[gaitType] || NEURO_MAP.normal;
  }

  // ============================================================
  // 康复训练建议 (来自 ANRM 第7-8章)
  // ============================================================
  var REHAB_SUGGESTIONS = {
    hemiplegic: [
      '① 桥式训练: 增强臀大肌, 改善骨盆控制',
      '② 站相重心转移: 患侧负重训练 (从30%渐进到50%)',
      '③ 膝关节控制: 0-15° 屈伸控制训练',
      '④ 踝背屈诱发: 毛刷/冰刺激 + 主动背屈',
      '⑤ 划圈步态矫正: 胫前肌肌电生物反馈',
      '⑥ 减重步行训练 (BWSTT): 减重30%起'
    ],
    parkinsonian: [
      '① 节律性听觉刺激 (RAS): 节拍器 110 BPM 起步',
      '② 视觉提示: 地面横向条纹, 步幅标记',
      '③ 大幅度动作训练: LSVT BIG 疗法',
      '④ 平衡训练: 串联站立, 单脚站立',
      '⑤ 姿势矫正: 躯干伸展 + 步幅增大训练',
      '⑥ 冻结应对: 节拍器/口令, 想象迈过障碍'
    ],
    ataxic: [
      '① Frenkel 训练: 精准步态分解练习',
      '② 视觉代偿: 注视地面标记行走',
      '③ 平衡训练: 静态 → 动态渐进',
      '④ 本体感觉训练: 闭眼平衡板训练',
      '⑤ 协调训练: 跟膝胫试验',
      '⑥ 助行器评估: 必要时使用宽基底拐杖'
    ],
    footdrop: [
      '① 胫前肌肌力训练: 抗阻背屈练习',
      '② 神经肌肉电刺激 (NMES): 胫前肌, 步态触发',
      '③ 踝足矫形器 (AFO): 短期使用, 防止继发畸形',
      '④ 步态训练: 主动足跟着地模式',
      '⑤ 腓总神经松动术',
      '⑥ 评估手术: 严重者考虑胫后肌转位术'
    ],
    antalgic: [
      '① 寻找并处理疼痛源: 影像学评估',
      '② 物理治疗: 冷热敷, 超声波, 干扰电',
      '③ 关节活动度训练: 在疼痛耐受范围内',
      '④ 辅助器具: 必要时使用拐杖减轻负重',
      '⑤ 步态再教育: 对称负重训练',
      '⑥ 阶段性评估: 每2周重新评估步态'
    ],
    elderly: [
      '① 肌力训练: 抗阻训练 (坐立, 提踵, 伸膝)',
      '② 平衡训练: Tai Chi (太极) 12周课程',
      '③ 步态训练: 复杂环境适应 (障碍, 上下坡)',
      '④ 双重任务训练: 边走边说/算',
      '⑤ 跌倒预防教育: 环境改造, 辅助器具',
      '⑥ 多病管理: 视力/听力/用药审查'
    ],
    normal: [
      '① 维持规律有氧运动: 每周150分钟中等强度',
      '② 力量训练: 每周2次下肢抗阻',
      '③ 平衡挑战: 不规则路面, 单脚站立',
      '④ 柔韧性: 髋/踝/腰背拉伸',
      '⑤ 认知-运动双重任务',
      '⑥ 定期复评: 每6个月'
    ]
  };

  function getRehabSuggestions(gaitType) {
    return REHAB_SUGGESTIONS[gaitType] || REHAB_SUGGESTIONS.normal;
  }

  // ============================================================
  // 帧合并: 将移动端/视频帧 → 统一格式
  // ============================================================
  function normalizeFrame(rawKps, t) {
    if (!rawKps) return null;
    var kps = rawKps.map(function (k) {
      if (typeof k === 'object' && k !== null) {
        return {
          x: k.x != null ? k.x : 0,
          y: k.y != null ? k.y : 0,
          score: k.score != null ? k.score : 1.0,
          name: k.name || ''
        };
      }
      return null;
    }).filter(function (k) { return k !== null; });
    return { t: t, keypoints: kps };
  }

  // ============================================================
  // 暴露 API
  // ============================================================
  window.__gaitParams = {
    NORMAL: NORMAL,
    rangeStatus: rangeStatus,
    distance2D: distance2D,
    calibrateScale: calibrateScale,
    calibrateByHeight: calibrateByHeight,
    getKp: getKp,
    inferFoot: inferFoot,
    extractFootKeypoints: extractFootKeypoints,
    extractTrunkAngle: extractTrunkAngle,
    computeArmSwing: computeArmSwing,
    computeElbowSwing: computeElbowSwing,
    computeKneeBraking: computeKneeBraking,
    computeBrainGaitProfile: computeBrainGaitProfile,
    trimmedMean: trimmedMean,
    refineHeelStrike: refineHeelStrike,
    detectWalkingDirection: detectWalkingDirection,
    resolveAnatomicalSides: resolveAnatomicalSides,
    swapKeypointLabels: swapKeypointLabels,
    resolveAndSwapSidesByFrame: resolveAndSwapSidesByFrame,
    detectHeelStrikes: detectHeelStrikes,
    detectToeOffs: detectToeOffs,
    detectGaitEvents: detectGaitEvents,
    computeGaitCyclePhases: computeGaitCyclePhases,
    computePhaseTimestamps: computePhaseTimestamps,
    computeStepLengths: computeStepLengths,
    computeStrideLengths: computeStrideLengths,
    computeStepWidths: computeStepWidths,
    computeFootAngles: computeFootAngles,
    computeAnkleKinematics: computeAnkleKinematics,
    computePelvicKinematics: computePelvicKinematics,
    computeCadence: computeCadence,
    computeGaitSpeed: computeGaitSpeed,
    computeStanceSwing: computeStanceSwing,
    mean: mean,
    stddev: stddev,
    cv: cv,
    asymmetry: asymmetry,
    computeAllParams: computeAllParams,
    classifyGait: classifyGait,
    getNeuroLocalization: getNeuroLocalization,
    getRehabSuggestions: getRehabSuggestions,
    normalizeFrame: normalizeFrame,
    estimateBodyHeightPx: estimateBodyHeightPx,
    filterValidCycles: filterValidCycles
  };
})();
