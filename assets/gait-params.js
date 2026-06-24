/* global window */
/**
 * gait-params.js — 步态分析纯计算引擎
 * 零 DOM 依赖，可在 Node.js 环境单测，所有函数挂载在 window.__gaitParams
 *
 * 数据约定:
 *  - Frame: { t:秒, keypoints: [{x, y, score, name}, ...] }  (COCO 17点)
 *  - Pose.keypoint 名称: nose, left_eye, right_eye, left_ear, right_ear,
 *                       left_shoulder, right_shoulder, left_elbow, right_elbow,
 *                       left_wrist, right_wrist, left_hip, right_hip,
 *                       left_knee, right_knee, left_ankle, right_ankle
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
  function computeArmSwing(frames, scale) {
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
      var n = Math.min(sigA.length, sigB.length);
      if (n < 10) return 0;
      var meanA = sigA.slice(0, n).reduce(function (s, v) { return s + v.x; }, 0) / n;
      var meanB = sigB.slice(0, n).reduce(function (s, v) { return s + v.x; }, 0) / n;
      var num = 0, denA = 0, denB = 0;
      for (var i = 0; i < n; i++) {
        var da = sigA[i].x - meanA;
        var db = sigB[i].x - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
      }
      if (denA === 0 || denB === 0) return 0;
      return num / Math.sqrt(denA * denB);
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

    // ---- 上下肢协调 (肩 vs 对侧踝) ----
    var leftShRightAnkle  = crossCorrelate(leftShoulderX, rightAnkleX);
    var rightShLeftAnkle  = crossCorrelate(rightShoulderX, leftAnkleX);
    var avgCoordination = (Math.abs(leftShRightAnkle) + Math.abs(rightShLeftAnkle)) / 2;

    // ---- 厘米换算 ----
    var ampUnit = scale && scale > 0 ? 'cm' : 'px';
    var convert = scale && scale > 0 ? scale * 100 : 1;
    var shLeftCm  = shLeftP2P * convert;
    var shRightCm = shRightP2P * convert;
    var shAvgCm   = (shLeftCm + shRightCm) / 2;
    var wrLeftCm  = wrLeftP2P * convert;
    var wrRightCm = wrRightP2P * convert;

    // ---- 临床标记 (基于 ANRM 手册) ----
    var flags = [];
    if (shAvgNorm < 0.08) flags.push('肩摆严重减少 — ANRM §8.2: 帕金森摆臂减少/冻结');
    else if (shAvgNorm < 0.15) flags.push('肩摆轻度减少 — ANRM: 早期帕金森或老年步态');
    if (shAsymmetry > 0.30) flags.push('肩摆不对称(' + (shAsymmetry * 100).toFixed(0) + '%) — ANRM §8.1: 偏瘫上肢屈曲协同');
    else if (shAsymmetry > 0.20) flags.push('肩摆轻度不对称(' + (shAsymmetry * 100).toFixed(0) + '%) — ANRM: 单侧基底节/皮质病变');
    if (avgCoordination < 0.25) flags.push('上下肢失协调 — ANRM §8.3: 小脑共济失调 (辨距不良泛化至上肢)');
    if (shAvgCm < 2 && wrLeftCm < 3 && wrRightCm < 3) flags.push('上肢固定 — ANRM: 晚期帕金森/卒中后痉挛固定');
    if (shAvgNorm > 0.40) flags.push('肩摆过度 — ANRM §8.3: 共济失调辨距不良');

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
      // 上下肢协调
      coordination: {
        leftShoulderRightAnkle: leftShRightAnkle,
        rightShoulderLeftAnkle: rightShLeftAnkle,
        avg: avgCoordination
      },
      // 信号质量
      quality: {
        leftShoulderPoints: leftShoulderX.length,
        rightShoulderPoints: rightShoulderX.length,
        leftWristPoints: leftWristX.length,
        rightWristPoints: rightWristX.length
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
  function computeBrainGaitProfile(armSwing, elbowSwing, kneeLeft, kneeRight, params) {
    var profile = {
      domains: {},
      lateralization: { leftBrain: 0, rightBrain: 0 },
      subhealthFlags: [],
      overallBrainScore: 50  // 50 = 正常基线
    };
    var p = params && params.parameters ? params.parameters : {};

    // ---- 域1: 对侧脑功能 (肩膀甩动) ----
    if (armSwing && armSwing.shoulder) {
      var sh = armSwing.shoulder;
      // 左肩由右脑控制, 右肩由左脑控制
      var leftBrainShoulder = sh.rightNormalized || 0;  // 右肩 → 左脑
      var rightBrainShoulder = sh.leftNormalized || 0;   // 左肩 → 右脑
      // 正常肩摆归一化值 ~0.20, 低于 0.12 为减少
      var leftBrainScore = Math.min(100, Math.max(0, leftBrainShoulder / 0.25 * 50));
      var rightBrainScore = Math.min(100, Math.max(0, rightBrainShoulder / 0.25 * 50));
      profile.domains.contralateral = {
        label: '对侧脑功能 (肩膀甩动)',
        leftBrainScore: leftBrainScore,   // 左脑 (右肩)
        rightBrainScore: rightBrainScore, // 右脑 (左肩)
        detail: {
          leftShoulderNorm: sh.leftNormalized,
          rightShoulderNorm: sh.rightNormalized,
          asymmetry: sh.asymmetry
        },
        flags: []
      };
      if (leftBrainScore < 40) profile.domains.contralateral.flags.push('右肩摆动减少 → 左脑功能轻度下降');
      if (rightBrainScore < 40) profile.domains.contralateral.flags.push('左肩摆动减少 → 右脑功能轻度下降');
      if (sh.asymmetry > 0.20) profile.domains.contralateral.flags.push('肩摆不对称 → 两侧脑功能不平衡');
      profile.lateralization.leftBrain  += leftBrainScore;
      profile.lateralization.rightBrain += rightBrainScore;
    }

    // ---- 域2: 小脑功能 (手肘摆动) ----
    if (elbowSwing && !elbowSwing.error) {
      // 手肘摆动: 正常 ~5-12cm, 过多→小脑调节不良, 过少→基底节僵直
      var elbowScore;
      if (elbowSwing.avgAmplitude < 2) elbowScore = 25;
      else if (elbowSwing.avgAmplitude < 5) elbowScore = 40;
      else if (elbowSwing.avgAmplitude <= 12) elbowScore = 60;
      else if (elbowSwing.avgAmplitude <= 18) elbowScore = 45;
      else elbowScore = 30;
      profile.domains.cerebellum = {
        label: '小脑功能 (手肘摆动)',
        score: elbowScore,
        avgElbowAmplitude: elbowSwing.avgAmplitude,
        asymmetry: elbowSwing.asymmetry,
        flags: []
      };
      if (elbowScore < 40) profile.domains.cerebellum.flags.push('手肘摆动少 → 小脑/基底节功能低下');
      if (elbowScore >= 45 && elbowScore < 55) profile.domains.cerebellum.flags.push('手肘摆动偏多 → 小脑调节不良, 可能伴随睡眠差/易焦虑');
      if (elbowSwing.asymmetry > 0.25) profile.domains.cerebellum.flags.push('手肘不对称 → 单侧小脑功能差异');
      profile.overallBrainScore += (elbowScore - 50) * 0.25;
    }

    // ---- 域3: 同侧脑功能 (宽深角度) ----
    var stepWidthOk = p.stepWidth && p.stepWidth.value >= 0.06 && p.stepWidth.value <= 0.16;
    var stepLengthSym = params && params.asymmetries ? (1 - Math.min(params.asymmetries.stepLength || 0, 1)) : 0.8;
    var ipsiScore = 50;
    if (stepWidthOk) ipsiScore += 15;
    else ipsiScore -= 10;
    ipsiScore += (stepLengthSym - 0.8) * 50;
    ipsiScore = Math.min(100, Math.max(0, ipsiScore));
    profile.domains.ipsilateral = {
      label: '同侧脑功能 (宽深角度)',
      score: ipsiScore,
      stepWidth: p.stepWidth ? p.stepWidth.value : null,
      stepLengthSymmetry: stepLengthSym,
      flags: []
    };
    if (!stepWidthOk) profile.domains.ipsilateral.flags.push('步宽异常 → 同侧脑功能需关注');
    if (stepLengthSym < 0.85) profile.domains.ipsilateral.flags.push('步长不对称 → 两侧脑功能不平衡');
    profile.lateralization.leftBrain  += ipsiScore * 0.5;
    profile.lateralization.rightBrain += ipsiScore * 0.5;

    // ---- 域4: 性格与情绪 (膝关节刹车) ----
    var kneeAvg = 50;
    var kneeFlags = [];
    var kneeQ = [];
    [kneeLeft, kneeRight].forEach(function (k) {
      if (k && !k.error) {
        if (k.quality === 'normal') { kneeAvg += 10; kneeQ.push(k.side + ':正常'); }
        else if (k.quality === 'flexed') { kneeAvg -= 10; kneeQ.push(k.side + ':屈曲'); kneeFlags.push(k.side + '膝刹车弱'); }
        else if (k.quality === 'hyperextended') { kneeAvg -= 5; kneeQ.push(k.side + ':过伸'); }
        else if (k.quality === 'unstable') { kneeAvg -= 15; kneeQ.push(k.side + ':不稳'); kneeFlags.push(k.side + '膝控制不稳→情绪波动'); }
      }
    });
    kneeAvg = Math.min(100, Math.max(0, kneeAvg));
    profile.domains.emotion = {
      label: '性格与情绪 (膝关节刹车)',
      score: kneeAvg,
      quality: kneeQ.join(', '),
      flags: kneeFlags
    };
    profile.overallBrainScore += (kneeAvg - 50) * 0.25;

    // ---- 子域: 步态自动化 (双任务成本代理) ----
    // 节奏变异性高 → 步态需要更多皮层控制 → 脑自动化下降
    if (params && params.extras) {
      var cv = params.extras.rhythmCV || 0;
      var autoScore = Math.max(0, 80 - cv * 80);
      profile.domains.automaticity = {
        label: '步态自动化 (皮层依赖)',
        score: autoScore,
        rhythmCV: cv,
        flags: []
      };
      if (cv > 0.15) profile.domains.automaticity.flags.push('步态变异性高 → 脑自动化下降, 皮层控制代偿');
      if (cv > 0.25) profile.domains.automaticity.flags.push('步态自动化显著下降 → 提示基底节/脑干CPG功能减弱');
      profile.overallBrainScore += (autoScore - 50) * 0.25;
    }

    // ---- 汇总 ----
    profile.overallBrainScore = Math.round(Math.min(100, Math.max(0, profile.overallBrainScore)));
    profile.lateralization.leftBrain  = Math.round(profile.lateralization.leftBrain / 2);
    profile.lateralization.rightBrain = Math.round(profile.lateralization.rightBrain / 2);
    // 亚健康标记收集
    Object.keys(profile.domains).forEach(function (d) {
      var dom = profile.domains[d];
      if (dom.flags) profile.subhealthFlags.push.apply(profile.subhealthFlags, dom.flags);
    });
    // 脑功能等级
    if (profile.overallBrainScore >= 70) profile.brainGrade = '脑功能良好';
    else if (profile.overallBrainScore >= 55) profile.brainGrade = '脑功能轻度下降 (亚健康)';
    else if (profile.overallBrainScore >= 40) profile.brainGrade = '脑功能中度下降 (需关注)';
    else profile.brainGrade = '脑功能显著下降 (建议进一步评估)';

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

    // 靠近摄像头的腿: 画面中 Y 更大 (更低), 置信度更高
    var leftCloser = (leftY > rightY) && (leftConf >= rightConf * 0.8);
    var rightCloser = (rightY > leftY) && (rightConf >= leftConf * 0.8);

    // 如果无法判断 (正面而非侧面), 信任 MoveNet 标签
    if (!leftCloser && !rightCloser) {
      return { swapNeeded: false, reason: 'frontal_view_or_ambiguous', leftConf: leftConf, rightConf: rightConf, leftY: leftY, rightY: rightY };
    }

    var closerSide = leftCloser ? 'left' : 'right';
    // 如果靠近摄像头的 MoveNet 标签 == cameraSide, 说明标签正确, 无需交换
    // 如果靠近摄像头的 MoveNet 标签 != cameraSide, 需要交换
    var swapNeeded = (closerSide !== cameraSide);

    return {
      swapNeeded: swapNeeded,
      closerSide: closerSide,
      cameraSide: cameraSide,
      confidenceDiff: Math.abs(leftConf - rightConf),
      yDiff: Math.abs(leftY - rightY),
      reason: swapNeeded ? 'closer_leg_mismatch' : 'labels_correct',
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
  function detectHeelStrikes(frames, side) {
    var kpName = side + '_ankle';
    var points = [];
    for (var i = 0; i < frames.length; i++) {
      var kp = getKp(frames[i], kpName);
      if (kp && kp.score >= 0.3) {
        points.push({ frame: i, t: frames[i].t, y: kp.y, x: kp.x, score: kp.score });
      }
    }
    if (points.length < 3) return [];

    // 平滑 y 序列 (3 帧滑动平均)
    var smoothed = [];
    var win = 1;
    for (var p = 0; p < points.length; p++) {
      var sum = 0, count = 0;
      for (var q = -win; q <= win; q++) {
        if (p + q >= 0 && p + q < points.length) {
          sum += points[p + q].y;
          count++;
        }
      }
      smoothed.push({ y: sum / count, x: points[p].x, frame: points[p].frame, t: points[p].t, score: points[p].score });
    }

    // 候选检测: 3 类信号
    //  1) 内部局部极小值: 1 步邻域内最小
    //  2) 起点: 起点 y < 后 3 帧平均 → 起点即极小值
    //  3) 终点: 终点 y < 前 3 帧平均 → 终点即极小值
    //  4) 速度反转: 下降→上升 的零点
    var candidates = [];

    // 起点检测
    if (smoothed.length >= 4) {
      var avgNext = (smoothed[1].y + smoothed[2].y + smoothed[3].y) / 3;
      if (smoothed[0].y < avgNext - 0.3) {
        candidates.push(smoothed[0]);
      }
    }

    // 内部局部极小值 (1 步邻域, 允许平坦底部)
    for (var k = 1; k < smoothed.length - 1; k++) {
      if (smoothed[k].y <= smoothed[k - 1].y && smoothed[k].y < smoothed[k + 1].y) {
        candidates.push(smoothed[k]);
      }
      // 处理左侧平坦: 当前点等于左, 但严格小于右 → 此点为左端点
      if (smoothed[k].y === smoothed[k - 1].y && smoothed[k].y < smoothed[k + 1].y &&
          (k === 1 || smoothed[k - 1].y < smoothed[k - 2].y)) {
        if (candidates.indexOf(smoothed[k]) === -1) candidates.push(smoothed[k]);
      }
    }

    // 终点检测
    var n = smoothed.length;
    if (n >= 4) {
      var avgPrev = (smoothed[n - 2].y + smoothed[n - 3].y + smoothed[n - 4].y) / 3;
      if (smoothed[n - 1].y < avgPrev - 0.3) {
        candidates.push(smoothed[n - 1]);
      }
    }

    // 最小间隔约束 (>= 0.45s, 正常人最快 ~130步/分/脚对应 0.46s)
    // 防止踝 y 出现多个等高原地 (mid-stance 平台 + 摆动前稳定期) 误判为两次 HS
    var minInterval = 0.45;
    var result = [];
    var lastT = -Infinity;
    candidates.sort(function (a, b) { return a.t - b.t; });
    for (var c = 0; c < candidates.length; c++) {
      var cand = candidates[c];
      if (cand.t - lastT < minInterval) {
        // 间隔太短, 保留 y 更低的那一个
        if (result.length > 0 && cand.y < result[result.length - 1].y) {
          result[result.length - 1] = {
            frameIndex: cand.frame,
            time: cand.t,
            x: cand.x,
            y: cand.y,
            confidence: cand.score
          };
          lastT = cand.t;
        }
        continue;
      }
      result.push({
        frameIndex: cand.frame,
        time: cand.t,
        x: cand.x,
        y: cand.y,
        confidence: cand.score
      });
      lastT = cand.t;
    }
    return result;
  }

  /**
   * 脚尖离地检测 (Toe-Off, TO): 踝关节 y 速度达到该步周期最大上升速度的时刻
   *
   * 算法: 在两次 heel-strike 之间 (一个完整步态周期), 寻找踝关节 y 速度
   *       由负转正 (由下降转为上升) 的最大速度时刻 = 脚蹬离地面瞬间
   *
   * 简化策略: 在每个周期后半段 (50-100% cycle), 找 y 局部极大值 (踝抬起到最高)
   *           然后向前追溯到 y 开始上升的反转点 = 脚尖离地
   */
  function detectToeOffs(frames, side, heelStrikes) {
    if (!frames || frames.length < 3 || heelStrikes.length < 2) return [];
    var kpName = side + '_ankle';
    var points = [];
    for (var i = 0; i < frames.length; i++) {
      var kp = getKp(frames[i], kpName);
      if (kp && kp.score >= 0.3) points.push({ frame: i, t: frames[i].t, y: kp.y, x: kp.x, score: kp.score });
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
    return results;
  }

  /**
   * 8 时相步态周期分析 (Rancho Los Amigos)
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
   * 实现: 用 HS + TO 时间戳确定支撑相 (HS → TO) 和摆动相 (TO → next HS),
   *       然后按比例切片 8 时相
   */
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
          var icTime = estimateICOffset(frames, side, HS[i].frameIndex);
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
   * @returns {Array} 步长数组 (m), 每个元素 = {value, side, frame, time}
   */
  function computeStepLengths(leftHS, rightHS, scale) {
    if (!scale || scale <= 0) return [];
    var merged = [];
    leftHS.forEach(function (h) { merged.push(Object.assign({ side: 'left' }, h)); });
    rightHS.forEach(function (h) { merged.push(Object.assign({ side: 'right' }, h)); });
    merged.sort(function (a, b) { return a.time - b.time; });
    var steps = [];
    for (var i = 1; i < merged.length; i++) {
      if (merged[i].side !== merged[i - 1].side) {
        var dx = merged[i].x - merged[i - 1].x;
        var dy = merged[i].y - merged[i - 1].y;
        // 欧氏距离 (侧方+斜45°拍摄均有效)
        var lenPx = Math.sqrt(dx * dx + dy * dy);
        steps.push({
          value: lenPx * scale,
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
   */
  function computeStrideLengths(heelStrikes, scale) {
    if (!scale || scale <= 0 || heelStrikes.length < 2) return [];
    var strides = [];
    for (var i = 1; i < heelStrikes.length; i++) {
      var dx = heelStrikes[i].x - heelStrikes[i - 1].x;
      var dy = heelStrikes[i].y - heelStrikes[i - 1].y;
      // 使用欧氏距离 (支持侧方+斜45°+正面拍摄, xy 均包含前进分量)
      strides.push({
        value: Math.sqrt(dx * dx + dy * dy) * scale,
        time: heelStrikes[i].time,
        duration: heelStrikes[i].time - heelStrikes[i - 1].time
      });
    }
    return strides;
  }

  /**
   * 步宽: 双脚中线之间垂直距离 (需要稳定段, 取摆动相最低点)
   * 计算方法: 在每个左脚 HS 附近, 右脚踝的水平距离
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
        widths.push({ value: dy * scale, time: lh.time });
      }
    }
    return widths;
  }

  /**
   * 足偏角: 足长轴与前进方向的夹角
   * 用小腿向量 (knee→ankle) 投影计算
   */
  function computeFootAngles(frames, scale) {
    var angles = [];
    for (var i = 0; i < frames.length; i++) {
      var la = getKp(frames[i], 'left_ankle');
      var lk = getKp(frames[i], 'left_knee');
      var ra = getKp(frames[i], 'right_ankle');
      var rk = getKp(frames[i], 'right_knee');
      if (la && lk && la.score >= 0.3 && lk.score >= 0.3) {
        var angleL = Math.atan2(la.x - lk.x, la.y - lk.y) * 180 / Math.PI;
        angles.push({ side: 'left', time: frames[i].t, value: Math.abs(angleL) });
      }
      if (ra && rk && ra.score >= 0.3 && rk.score >= 0.3) {
        var angleR = Math.atan2(ra.x - rk.x, ra.y - rk.y) * 180 / Math.PI;
        angles.push({ side: 'right', time: frames[i].t, value: Math.abs(angleR) });
      }
    }
    return angles;
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
    var kpHip   = side + '_hip';

    // 逐帧计算胫骨角
    var shankAngles = [];  // [{t, angle}] 角度(°), 正值=前倾
    for (var i = 0; i < frames.length; i++) {
      var ankle = getKp(frames[i], kpAnkle);
      var knee  = getKp(frames[i], kpKnee);
      if (!ankle || !knee || ankle.score < 0.25 || knee.score < 0.25) continue;
      var dx = ankle.x - knee.x;  // 水平偏移
      var dy = ankle.y - knee.y;  // 垂直偏移 (y向下, 踝通常低于膝->dy>0)
      var angle = Math.atan2(dx, dy) * 180 / Math.PI;  // 0°=垂直, +前倾
      shankAngles.push({ t: frames[i].t, angle: angle, score: Math.min(ankle.score, knee.score) });
    }
    if (shankAngles.length < 20) return { error: 'insufficient_ankle_data' };

    // 按步态阶段分组
    var stanceAngles = [];  // HS→TO 支撑相
    var swingAngles  = [];  // TO→HS 摆动相
    if (heelStrikes && heelStrikes.length >= 2) {
      for (var h = 0; h < heelStrikes.length - 1; h++) {
        var hsT = heelStrikes[h].time;
        var midT = hsT + (heelStrikes[h+1].time - hsT) * 0.5;  // 中摆动 (简易分界)
        shankAngles.forEach(function (s) {
          if (s.t >= hsT && s.t < midT) stanceAngles.push(s.angle);
          else if (s.t >= midT && s.t < heelStrikes[h+1].time) swingAngles.push(s.angle);
        });
      }
    } else {
      // 无 HS 时按中值分割
      var mid = shankAngles.map(function(s){return s.angle;}).sort(function(a,b){return a-b;})[Math.floor(shankAngles.length/2)];
      shankAngles.forEach(function (s) {
        if (s.angle >= mid) stanceAngles.push(s.angle);  // 前倾=支撑相
        else swingAngles.push(s.angle);  // 后倾=摆动相
      });
    }

    function arrMean(arr) { return arr.length > 0 ? arr.reduce(function(a,b){return a+b;},0)/arr.length : 0; }
    function arrMin(arr)  { return arr.length > 0 ? Math.min.apply(null, arr) : 0; }
    function arrMax(arr)  { return arr.length > 0 ? Math.max.apply(null, arr) : 0; }

    var stanceMean = arrMean(stanceAngles);
    var swingMean  = arrMean(swingAngles);
    var maxDF = arrMax(shankAngles.map(function(s){return s.angle;}));  // 最大背屈
    var maxPF = arrMin(shankAngles.map(function(s){return s.angle;}));  // 最大跖屈 (最负)
    var range   = maxDF - maxPF;  // 总活动范围

    // 临床标记
    var flags = [];
    // 足下垂: 摆动相无法背屈 (胫骨角 < 5°)
    if (swingMean < 5) flags.push('摆动相背屈不足(' + swingMean.toFixed(0) + '°) — ANRM: 腓总神经/胫前肌功能障碍');
    // 推离无力: 跖屈不够 (maxPF > -10°)
    if (maxPF > -10 && range < 30) flags.push('跖屈幅度不足(最大' + maxPF.toFixed(0) + '°) — ANRM: 小腿三头肌无力');
    // 僵硬踝: 总活动范围 < 15°
    if (range < 15) flags.push('踝活动范围过小(' + range.toFixed(0) + '°) — ANRM: 踝关节僵硬/痉挛');
    // 过度活动: > 50°
    if (range > 50) flags.push('踝活动范围过大(' + range.toFixed(0) + '°) — ANRM: 共济失调/肌张力低下');

    return {
      side: side,
      shankAngles: shankAngles,
      stanceAvg: stanceMean,
      swingAvg: swingMean,
      maxDorsiflexion: maxDF,
      maxPlantarflexion: maxPF,
      rangeOfMotion: range,
      flags: flags
    };
  }

  /**
   * 步频: 1 分钟总步数 (左右脚合计)
   * 步态周期 (单脚相邻 HS 间隔) = 2 个步的时间
   * cadence = 60 / avgCycle * 2
   */
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
   * 步态周期时相: 支撑相 (脚在地面) / 摆动相 (脚在空中)
   * 用脚跟着地与脚尖离地估计
   * 简化: 假设步态周期时间已知, 用踝关节 y 速度变化确定
   */
  function computeStanceSwing(frames, heelStrikes) {
    if (heelStrikes.length < 2) return { stancePct: 0, swingPct: 0, doubleSupport: 0 };
    var totalStance = 0, totalCycle = 0;
    for (var i = 0; i < heelStrikes.length - 1; i++) {
      var t0 = heelStrikes[i].time;
      var t1 = heelStrikes[i + 1].time;
      var cycle = t1 - t0;
      // 支撑相: 从 t0 到 60% 周期 (经验值)
      var stanceEnd = t0 + cycle * 0.60;
      totalStance += stanceEnd - t0;
      totalCycle += cycle;
    }
    if (totalCycle === 0) return { stancePct: 0, swingPct: 0, doubleSupport: 0 };
    var stancePct = (totalStance / totalCycle) * 100;
    var swingPct = 100 - stancePct;
    // 双支撑期 ≈ 2 × (60% - 50%) = 20% of 支撑相, 简化为支撑相的 20%
    var doubleSupport = (stancePct - 50) * 0.2 + 10;
    return {
      stancePct: stancePct,
      swingPct: swingPct,
      doubleSupport: doubleSupport
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
  function computeAllParams(frames, scale) {
    if (!frames || frames.length === 0 || !scale || scale <= 0) {
      return { error: 'invalid_input' };
    }

    var leftHS  = detectHeelStrikes(frames, 'left');
    var rightHS = detectHeelStrikes(frames, 'right');
    var allHS   = leftHS.concat(rightHS).sort(function (a, b) { return a.time - b.time; });

    if (allHS.length < 3) {
      return { error: 'insufficient_steps', heelStrikes: allHS };
    }

    // 步长
    var stepLens = computeStepLengths(leftHS, rightHS, scale);
    var stepLensL = [], stepLensR = [];
    stepLens.forEach(function (s) {
      if (s.to === 'left') stepLensL.push(s.value);
      else stepLensR.push(s.value);
    });
    var stepLengthL = trimmedMean(stepLensL);
    var stepLengthR = trimmedMean(stepLensR);
    var stepLength  = trimmedMean(stepLens.map(function (s) { return s.value; }));

    // 步幅
    var stridesL = computeStrideLengths(leftHS, scale);
    var stridesR = computeStrideLengths(rightHS, scale);
    var strideLengthL = trimmedMean(stridesL.map(function (s) { return s.value; }));
    var strideLengthR = trimmedMean(stridesR.map(function (s) { return s.value; }));
    var strideLength  = (strideLengthL + strideLengthR) / 2;

    // 步宽
    var widths = computeStepWidths(frames, leftHS, rightHS, scale);
    var stepWidth = trimmedMean(widths.map(function (w) { return w.value; }));

    // 足偏角
    var footAngles = computeFootAngles(frames, scale);
    var footAngleL = trimmedMean(footAngles.filter(function (a) { return a.side === 'left'; }).map(function (a) { return a.value; }));
    var footAngleR = trimmedMean(footAngles.filter(function (a) { return a.side === 'right'; }).map(function (a) { return a.value; }));
    var footAngle = (footAngleL + footAngleR) / 2;

    // 步频
    var cadenceL = computeCadence(leftHS);
    var cadenceR = computeCadence(rightHS);
    var cadence  = (cadenceL + cadenceR) / 2;

    // 步速
    var gaitSpeed = computeGaitSpeed(strideLength, cadence);

    // 步态周期时相
    var phaseL = computeStanceSwing(frames, leftHS);
    var phaseR = computeStanceSwing(frames, rightHS);
    var stancePct = (phaseL.stancePct + phaseR.stancePct) / 2;
    var swingPct  = (phaseL.swingPct + phaseR.swingPct) / 2;
    var doubleSupport = (phaseL.doubleSupport + phaseR.doubleSupport) / 2;

    // 不对称性
    var stepLenAsym    = asymmetry(stepLengthL, stepLengthR);
    var strideAsym     = asymmetry(strideLengthL, strideLengthR);
    var footAngleAsym  = asymmetry(footAngleL, footAngleR);
    var cadenceAsym    = asymmetry(cadenceL, cadenceR);
    var stanceAsym     = Math.abs(phaseL.stancePct - phaseR.stancePct) / 100;

    // 躯干前倾 (取整段均值)
    var trunkAngles = [];
    for (var i = 0; i < frames.length; i++) {
      var t = extractTrunkAngle(frames[i]);
      if (t) trunkAngles.push(t.lean);
    }
    var trunkLeanFwd = mean(trunkAngles);

    // 节奏变异性 (CV of step durations)
    var durations = stepLens.map(function (s) { return s.duration; }).filter(function (d) { return d > 0; });
    var rhythmCV = cv(durations);

    return {
      scale: scale,
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
        stepCount:    allHS.length
      },
      armSwing: computeArmSwing(frames, scale),
      elbowSwing: computeElbowSwing(frames, scale),
      kneeLeft: computeKneeBraking(frames, leftHS, 'left'),
      kneeRight: computeKneeBraking(frames, rightHS, 'right'),
      ankleLeft: computeAnkleKinematics(frames, leftHS, 'left'),
      ankleRight: computeAnkleKinematics(frames, rightHS, 'right')
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
    if (p.stepWidth.value > 0.13 && e.rhythmCV > 0.15) {
      scores.ataxic = 0.25 + (p.stepWidth.value - 0.13) * 1.5 + e.rhythmCV * 0.5;
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

    // 正常步态: 按正常参数比例打分 (7 项中多数正常即为正常)
    var normalKeys = ['stepLength','strideLength','stepWidth','footAngle','cadence','gaitSpeed','stancePct'];
    var normalCount = normalKeys.filter(function (k) { return p[k].status === 'normal'; }).length;
    var borderlineCount = normalKeys.filter(function (k) {
      var s = p[k].status;
      return s === 'normal' || s === 'mild';
    }).length;
    // 7 = 正常, 5-6 = 轻度偏离, 3-4 = 亚健康, <3 = 异常
    if (normalCount >= 6) {
      scores.normal = 0.60 + (normalCount - 6) * 0.15;  // 0.60-0.75
    } else if (borderlineCount >= 5) {
      scores.normal = 0.40;  // 接近正常
    } else {
      scores.normal = 0.10;  // 非正常, 但不归零 (防止病理类型被强制选中)
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
    detectHeelStrikes: detectHeelStrikes,
    detectToeOffs: detectToeOffs,
    computeGaitCyclePhases: computeGaitCyclePhases,
    computeStepLengths: computeStepLengths,
    computeStrideLengths: computeStrideLengths,
    computeStepWidths: computeStepWidths,
    computeFootAngles: computeFootAngles,
    computeAnkleKinematics: computeAnkleKinematics,
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
    normalizeFrame: normalizeFrame
  };
})();
