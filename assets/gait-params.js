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

    // === 2. 每帧局部走动方向: 窗口内髋中心 X 对 t 线性回归斜率 ===
    // 来回走的关键: 去程(X增)和回程(X减)各自近摄像头的脚不同, 必须按方向区分
    //   摄像头在右 + X增(去程) → 患者右脚近 → 期望 right_ankle = 近脚
    //   摄像头在右 + X减(回程) → 患者左脚近 → 期望 left_ankle = 近脚
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
    // dir 前向填充
    var lastD = 0;
    for (var i = 0; i < n; i++) { if (dirArr[i] !== 0) lastD = dirArr[i]; else dirArr[i] = lastD; }
    if (dirArr[0] === 0) {
      var firstD = 0;
      for (var i = 0; i < n; i++) { if (dirArr[i] !== 0) { firstD = dirArr[i]; break; } }
      for (var i = 0; i < n; i++) { if (dirArr[i] !== 0) break; dirArr[i] = firstD; }
    }

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
  // 脚跟着地检测 (HS) — 抗噪声 v2
  //
  // 旧算法找 y 局部极小值 (= 摆动顶点 = 脚最高), 与 HS 概念错位;
  //                  干净数据下偏移抵消能用, 有噪声时被噪声尖峰淹没
  // 新算法:
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

    // ---------- 0. 从全部关键点估算人体像素身高 (nose/shoulder→ankle 中位数) ----------
    function calcBodyHeightPx() {
      var heights = [];
      for (var i = 0; i < frames.length; i++) {
        // 尝试 nose 作为上端点, 肩部作为 fallback (侧方45°拍摄时肩膀更可见)
        var nose = getKp(frames[i], 'nose');
        var ls = getKp(frames[i], 'left_shoulder');
        var rs = getKp(frames[i], 'right_shoulder');
        var la = getKp(frames[i], 'left_ankle');
        var ra = getKp(frames[i], 'right_ankle');
        if (!la || !ra || la.score < 0.25 || ra.score < 0.25) continue;
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
        if (upperY === null) continue;
        var h = (ankleY - upperY) * scale;
        if (h > 30 && h < 2000) heights.push(h);  // 合理范围: 30-2000px
      }
      if (heights.length < 5) return null;
      heights.sort(function (a, b) { return a - b; });
      return heights[Math.floor(heights.length * 0.5)]; // median
    }
    var bodyH = calcBodyHeightPx();
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
  // 从关键点帧数据 + HS 事件, 在实际踝关节 Y 轨迹中检测真实 IC 和 TO
  // 不再用固定百分比推算 — 而是从 Y 轨迹形态找到各时相的实际时间戳
  function computePhaseTimestamps(keypointFrames, leftHS, leftTO, rightHS, rightTO) {
    var out = [];
    var PHASE_LABELS = {
      IC:  '初始着地', LR:  '承重反应', MSt: '支撑中期', TSt: '支撑末期',
      PSw: '摆动前期', ISw: '摆动初期', MSw: '摆动中期', TSw: '摆动末期'
    };

    function getAnkleY(frame, side) {
      var kp = getKp(frame, side + '_ankle');
      return (kp && kp.score >= 0.25) ? kp.y : null;
    }

    // 对每段 HS 周期, 从踝 Y 轨迹中找真实 IC (HS 之前触地) 和真实 TO (HS 之后离地)
    // 找不到时 fallback 到 HS 比例推算 — 任何情况都要保证出 8 个时相
    function build(HS, side, TO) {
      if (!HS || HS.length < 2) return;
      for (var i = 0; i < HS.length - 1; i++) {
        var hs = HS[i], nextHs = HS[i + 1];
        var cycle = nextHs.time - hs.time;
        var dx = nextHs.x - hs.x;
        var cycleDir = dx > 1 ? 'l2r' : (dx < -1 ? 'r2l' : 'stationary');
        if (cycle < 0.2 || cycle > 3.0) continue;  // 放宽: 0.2-3.0s (远脚HS可能间距异常)
        if (hs.frameIndex == null || nextHs.frameIndex == null) continue;
        if (hs.frameIndex < 0 || nextHs.frameIndex <= hs.frameIndex) continue;

        // === IC: 直接用 HS 检测点 ===
        // HS 算法找的是"摆动顶点之后 y 回到 stance 基线"的第一帧, 这一刻就是 IC
        // 不要再往前回溯 — 复杂逻辑带来误判
        var icFi = hs.frameIndex;
        var icT = hs.time;
        var hsY = hs.y;
        var kpName = side + '_ankle';

        // === Per-cycle "近镜头侧" 检测 ===
        // 在 hsFi → nextFi 区间统计左右踝的平均 score, 高分侧 = 离镜头更近
        var lScore = 0, lCount = 0, rScore = 0, rCount = 0;
        for (var fi = hs.frameIndex; fi <= nextHs.frameIndex && fi < keypointFrames.length; fi++) {
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

        // === TO: 优先用 detectToeOffs 结果 (更完善), 找不到才内部 fallback ===
        var toFi = -1;
        var toT = -1;
        var searchFwd = Math.min(keypointFrames.length - 1, nextHs.frameIndex - 1);
        // 1) 从传入的 TO 数组找本周期 (cycleIndex === i) 的 TO
        if (TO && TO.length) {
          for (var ti = 0; ti < TO.length; ti++) {
            if (TO[ti].cycleIndex === i && TO[ti].time > icT && TO[ti].time < nextHs.time) {
              toT = TO[ti].time; toFi = TO[ti].frameIndex; break;
            }
          }
        }
        // 2) Fallback: 内部检测 — 起点推迟到支撑相~35%后, 阈值8px, 连续2帧确认
        if (toFi < 0) {
          var fps = keypointFrames.length > 1
            ? (keypointFrames.length - 1) / Math.max(0.01, keypointFrames[keypointFrames.length - 1].t - keypointFrames[0].t)
            : 20;
          var toStart = hs.frameIndex + Math.max(3, Math.floor(cycle * 0.35 * fps));
          var toEnd = Math.min(keypointFrames.length - 1, nextHs.frameIndex - 1);
          var riseThresh = hsY - 8;
          var consec = 0;
          for (var fi = toStart; fi <= toEnd; fi++) {
            var fr = keypointFrames[fi];
            if (!fr) { consec = 0; continue; }
            var kp = getKp(fr, kpName);
            if (!kp || kp.score < 0.2) { consec = 0; continue; }
            if (kp.y < riseThresh) {
              consec++;
              if (consec >= 2) { toFi = fi - 1; toT = keypointFrames[fi - 1].t; break; }
            } else consec = 0;
          }
        }
        // 3) 仍找不到 → 比例推算 (支撑相 60%)
        if (toFi < 0 || toT <= icT || toT >= nextHs.time) {
          toT = hs.time + cycle * 0.60;
          toFi = Math.min(searchFwd, hs.frameIndex + Math.floor(cycle * 0.60 * 30));
        }

        // === 用脚跟+脚尖双轨迹按姿态选时相帧 (MediaPipe 33点) ===
        // heel.y 大=脚跟在地面低处, toe.y 大=脚尖在地面低处
        // 支撑相内部时相由脚跟/脚尖相对高度区分:
        //   IC: 脚跟着地 (heel.y 大, toe.y 小=脚尖翘起)
        //   LR: 脚跟落地, 脚尖下压 (toe.y 逐渐增大接近 heel.y)
        //   MSt: 脚掌全平 (heel.y ≈ toe.y, 都在地面)
        //   TSt: 脚跟离地 (heel.y 减小, toe.y 仍大=脚尖着地)
        //   PSw: 脚尖将离地 (toe.y 开始减小)
        var heelName = side + '_heel';
        var toeName = side + '_foot_index';
        var cycleEndFi = Math.min(nextHs.frameIndex, keypointFrames.length - 1);
        var cycleLen = cycleEndFi - icFi + 1;

        // 重建 heelY 和 toeY 连续轨迹 (插值+平滑)
        function buildTrajectory(kpNameStr, fallbackY) {
          var raw = new Array(cycleLen).fill(null);
          var known = [];
          for (var fi = icFi; fi <= cycleEndFi; fi++) {
            var kp = getKp(keypointFrames[fi], kpNameStr);
            if (kp && kp.score >= 0.15) { raw[fi - icFi] = kp.y; known.push(fi - icFi); }
          }
          if (known.length >= 2) {
            for (var g = 0; g < cycleLen; g++) {
              if (raw[g] !== null) continue;
              var pk = -1, nk = -1;
              for (var kk = g - 1; kk >= 0; kk--) { if (raw[kk] !== null) { pk = kk; break; } }
              for (var kk = g + 1; kk < cycleLen; kk++) { if (raw[kk] !== null) { nk = kk; break; } }
              if (pk >= 0 && nk >= 0) raw[g] = raw[pk] + (raw[nk] - raw[pk]) * (g - pk) / (nk - pk);
              else if (pk >= 0) raw[g] = raw[pk];
              else if (nk >= 0) raw[g] = raw[nk];
            }
          } else {
            for (var g = 0; g < cycleLen; g++) raw[g] = fallbackY;
          }
          var sm = new Array(cycleLen);
          for (var g = 0; g < cycleLen; g++) {
            var s = 0, c = 0;
            for (var w = -2; w <= 2; w++) { if (g + w >= 0 && g + w < cycleLen) { s += raw[g + w]; c++; } }
            sm[g] = s / c;
          }
          return sm;
        }

        var heelY = buildTrajectory(heelName, hsY);
        var toeY = buildTrajectory(toeName, hsY);
        // 脚跟脚尖都没有时 fallback 到踝
        var hasHeel = false, hasToe = false;
        var heelValidCnt = 0, toeValidCnt = 0, heelHighCnt = 0, toeHighCnt = 0;
        for (var g = 0; g < cycleLen; g++) {
          var hk = getKp(keypointFrames[icFi + g], heelName);
          var tk = getKp(keypointFrames[icFi + g], toeName);
          if (hk && hk.score >= 0.15) { hasHeel = true; heelValidCnt++; }
          if (tk && tk.score >= 0.15) { hasToe = true; toeValidCnt++; }
          if (hk && hk.score >= 0.3) heelHighCnt++;
          if (tk && tk.score >= 0.3) toeHighCnt++;
        }
        // 无脚跟脚尖 → 退回踝轨迹
        var fellBackToAnkle = false;
        if (!hasHeel && !hasToe) {
          heelY = buildTrajectory(side + '_ankle', hsY);
          toeY = heelY;
          fellBackToAnkle = true;
        }

        // 地面参考Y = 周期内 heelY 的高分位 (脚在地面时的Y值)
        var groundY = heelY.slice().sort(function(a,b){return a-b;})[Math.floor(cycleLen * 0.80)];

        // === 诊断日志: 关键点质量 + 轨迹形态 ===
        var heelMin = Infinity, heelMax = -Infinity, toeMin = Infinity, toeMax = -Infinity;
        for (var g = 0; g < cycleLen; g++) {
          if (heelY[g] < heelMin) heelMin = heelY[g];
          if (heelY[g] > heelMax) heelMax = heelY[g];
          if (toeY[g] < toeMin) toeMin = toeY[g];
          if (toeY[g] > toeMax) toeMax = toeY[g];
        }
        console.log('[gait-diag] side=' + side + ' cycle=' + (i+1) + ' len=' + cycleLen +
          ' | heel帧=' + heelValidCnt + '/' + cycleLen + '(高=' + heelHighCnt + ')' +
          ' toe帧=' + toeValidCnt + '/' + cycleLen + '(高=' + toeHighCnt + ')' +
          (fellBackToAnkle ? ' [FALLBACK踝]' : '') +
          ' | heelY[' + heelMin.toFixed(0) + '-' + heelMax.toFixed(0) + ']amp=' + (heelMax-heelMin).toFixed(0) +
          ' toeY[' + toeMin.toFixed(0) + '-' + toeMax.toFixed(0) + ']amp=' + (toeMax-toeMin).toFixed(0) +
          ' groundY=' + groundY.toFixed(0));

        var stEnd = Math.min(cycleLen - 1, Math.floor(cycleLen * 0.65));

        // === 锚点检测 (用脚跟脚尖轨迹形态特征) ===

        // A0 = IC = 脚跟**触地瞬间**: 直接用 HS detection 找到的帧 (hs.frameIndex)
        // 根因: 之前用 "heelY ≥ groundY - 4 && heelY - toeY > 6" 模式匹配, 当 MediaPipe 关键点噪声大
        //   或 heel 帧覆盖率 < 100% 时, 模式匹配把 IC 推到周期中段 (用户日志: IC@23/51 = 45%)
        //   导致 A1(MSt)/A2(TO)/A3(MSw) 都相对错位的 A0 计算 → 8 个时相位置全错
        //   → 截图里 LR/MSt 时刻实际是周期后半段, 另一只脚已回 stance → "右脚画面套左脚标签"
        // 修复: A0 直接锚定到 HS detection 找到的 hs.frameIndex (offset = 0)
        //   其他锚点 (MSt/TO/MSw/TSw) 相对 A0 计算, 用姿态模式特征在 [A0+1, ...] 区间找
        var a0off = 0;  // IC = hs.frameIndex (offset 0, 绝对信任 HS detection)

        // A1 = MSt = 脚掌最平 (|heelY - toeY| 最小), 在 [A0, 周期60%] 找
        var mstOff = a0off + 1, mstFlat = Infinity;
        for (var g = a0off + 1; g <= stEnd; g++) {
          var flatness = Math.abs(heelY[g] - toeY[g]);
          if (flatness < mstFlat) { mstFlat = flatness; mstOff = g; }
        }
        var a1off = mstOff;

        // A2 = TO = 脚尖离地: toeY 从地面基准开始持续上升(离地)
        // 修复: 用 toeY 自己的基准, 不用 heelY 的 groundY (两者地面Y不同!)
        var toeGroundY = toeY.slice().sort(function(a,b){return a-b;})[Math.floor(cycleLen * 0.70)];
        var toeMinY = toeMin;  // 摆动最高点
        var toeRange = toeGroundY - toeMinY;  // 脚尖总移动范围
        if (toeRange < 8) toeRange = 8;  // 防退化
        // TO阈值: 脚尖抬起总范围的10% = 确认离地 (脚尖刚开始离地就触发)
        var toThreshold = toeGroundY - toeRange * 0.10;
        // 最小支撑相长度: 至少30%周期
        var minStanceEnd = a1off + Math.max(2, Math.floor(cycleLen * 0.15));
        var toOff = -1;
        var consecLift = 0;
        for (var g = Math.max(minStanceEnd, a1off + 1); g < cycleLen; g++) {
          if (toeY[g] < toThreshold) {  // 脚尖抬起到阈值以上
            consecLift++;
            if (consecLift >= 2) { toOff = g - 1; break; }  // 2帧确认(从3降)
          } else consecLift = 0;
        }
        var a2off = toOff >= 0 ? toOff : Math.floor(cycleLen * 0.55);

        // A3 = MSw = 脚最高 (toeY 最小), 在 [A2, 周期末] 找
        var mswOff = a2off, mswY = Infinity;
        for (var g = a2off; g < cycleLen; g++) {
          if (toeY[g] < mswY) { mswY = toeY[g]; mswOff = g; }
        }
        var a3off = mswOff;

        // A4 = 下一IC (下一周期触地) = heelY 回到地面Y
        var a4off = cycleLen - 1;
        for (var g = a3off + 1; g < cycleLen; g++) {
          if (heelY[g] >= groundY - 4) { a4off = g; break; }  // 脚跟接近地面准备触地
        }

        // 兜底: 锚点顺序 + 最小间距
        if (a1off <= a0off) a1off = a0off + Math.floor(cycleLen * 0.15);
        if (a2off <= a1off) a2off = a0off + Math.floor(cycleLen * 0.55);
        if (a3off <= a2off) a3off = a0off + Math.floor(cycleLen * 0.75);
        if (a4off <= a3off) a4off = cycleLen - 1;
        var minGap = 3;
        if (a1off - a0off < minGap) a1off = a0off + minGap;
        if (a2off - a1off < minGap) a2off = a1off + minGap;
        if (a3off - a2off < minGap) a3off = a2off + minGap;
        if (a4off - a3off < minGap) a3off = a4off - minGap;

        // === 8时相定位 — 每个时相按自身姿态特征选帧，不用比例插值 ===
        // 支撑相 [A0→A2]: IC(触地瞬间) → LR(脚尖快速下压) → MSt(全掌着地) → TSt(脚跟离地脚尖仍在) → PSw(脚尖将离最后支撑)
        // 摆动相 [A2→A4]: ISw(脚刚离地抬升) → MSw(脚最高) → TSw(脚下落脚跟接近地面)

        // 辅助函数: 在指定区间内按评分函数选最优帧
        function pickBest(rangeStart, rangeEnd, scoreFn) {
          var rs = Math.max(0, Math.floor(rangeStart));
          var re = Math.min(cycleLen - 1, Math.ceil(rangeEnd));
          if (rs > re) rs = re;
          var bestOff = rs, bestScore = scoreFn(rs);
          for (var g = rs + 1; g <= re; g++) {
            var sc = scoreFn(g);
            if (sc > bestScore) { bestScore = sc; bestOff = g; }
          }
          return bestOff;
        }

        // 计算帧间差分 (前向差分, 首帧用0)
        function diff(arr) {
          var d = new Array(cycleLen);
          d[0] = 0;
          for (var g = 1; g < cycleLen; g++) d[g] = arr[g] - arr[g - 1];
          return d;
        }

        var heelDiff = diff(heelY);   // 脚跟Y变化率 (正=下降, 负=上升)
        var toeDiff = diff(toeY);     // 脚尖Y变化率

        // --- IC: 已由A0锚点保证 (脚跟触地 + 脚尖翘起) ---
        var icOff = a0off;

        // --- LR: 承重反应 — 脚尖正在快速下压向脚跟靠拢 (gap缩小最快的位置) ---
        // 在 [IC+1, MSt] 区间找 heelY-toeY 差距收缩最快的帧
        var lrStart = icOff + 1;
        var lrEnd = Math.max(lrStart + 2, a1off);
        var lrOff = pickBest(lrStart, lrEnd, function(g) {
          if (g < 1) return 0;
          var prevGap = Math.abs(heelY[g - 1] - toeY[g - 1]);
          var currGap = Math.abs(heelY[g] - toeY[g]);
          // gap缩小的速率, 越大越好 (脚尖正在下压)
          return Math.max(0, prevGap - currGap);
        });

        // --- MSt: 已由A1锚点保证 (脚掌最平) ---
        var mstOff = a1off;

        // --- TSt: 支撑末期 — 脚跟开始离地上升的阶段 ---
        // 找脚跟首次开始持续抬起的点 (heelY从地面开始下降), 不是最快抬起
        // 在 [MSt+1, TO-2] 找第一个 heelY 明显下降(>3px)的帧
        var tstStart = mstOff + 1;
        var tstEnd = Math.max(tstStart + 2, a2off - 2);
        // heelGroundY = MSt附近heelY的平均值(脚跟在地面时的Y)
        var heelGroundLocal = 0, heelGroundCnt = 0;
        for (var g = Math.max(0, mstOff - 1); g <= Math.min(cycleLen - 1, mstOff + 2); g++) {
          heelGroundLocal += heelY[g]; heelGroundCnt++;
        }
        heelGroundLocal = heelGroundCnt > 0 ? heelGroundLocal / heelGroundCnt : groundY;
        // 找第一个 heelY 比 heelGroundLocal 低 3px 的帧 = 脚跟开始抬起
        var tstOff = -1;
        for (var g = tstStart; g <= tstEnd; g++) {
          if (heelY[g] < heelGroundLocal - 3 && heelDiff[g] < 0) {
            tstOff = g; break;
          }
        }
        // fallback: 如果找不到首次抬起, 取 MSt→TO 的 40% 位置
        if (tstOff < 0) {
          tstOff = mstOff + Math.max(2, Math.floor((tstEnd - mstOff) * 0.4));
        }

        // --- PSw: 摆动前期 — 脚尖即将离地, 最后的支撑时刻 ---
        // 在 [TSt+1, TO] 区间找, 如果区间太窄(<3帧), 扩展到 [MSt+2, TO]
        var pswStart = Math.max(tstOff + 1, mstOff + 2);
        var pswEnd = Math.min(cycleLen - 1, a2off);
        var pswRange = pswEnd - pswStart;
        var pswOff;
        if (pswRange < 2) {
          // 区间太窄, 直接取 TSt 和 TO 之间的中点(或TO前一帧)
          pswOff = Math.max(pswStart, a2off - 1);
        } else {
          pswOff = pickBest(pswStart, pswEnd, function(g) {
            var toeRisingSpeed = -toeDiff[g];  // 正值=脚尖上升速度
            var toeNearGround = Math.max(0, toeY[g] - (toeGroundY - 15));
            if (toeNearGround < -15) return 0;
            return toeRisingSpeed * 2 + toeNearGround;
          });
        }

        // --- ISw: 摆动初期 — 脚刚离开地面, 正在抬升 ---
        // 在 [TO, A3] 找脚尖上升最快的帧
        var iswStart = a2off;
        var iswEnd = Math.max(a2off + 2, Math.floor(a3off * 0.7 + a2off * 0.3));
        var iswOff = pickBest(iswStart, iswEnd, function(g) {
          var toeRising = -toeDiff[g];  // 脚尖上升速度
          var toeAboveGround = Math.max(0, toeGroundY - toeY[g]);  // 脚离地高度
          if (toeAboveGround < 2) return 0;
          return toeRising * 2 + toeAboveGround * 0.5;
        });

        // --- MSw: 已由A3锚点保证 (脚最高点, toeY最小) ---
        var mswOff = a3off;

        // --- TSw: 摆动末期 — 脚在下落, 脚跟接近地面准备再次触地 ---
        // 在 [MSw+gap, A4-2] 找脚尖下降最快 (toeY增大最快) + 脚跟接近地面
        var tswGap = Math.max(minGap, Math.floor((a4off - a3off) * 0.25));
        var tswStart = mswOff + tswGap;
        var tswEnd = Math.min(cycleLen - 2, a4off - 1);
        var mswToeY = toeY[mswOff];
        var tswOff = pickBest(tswStart, tswEnd, function(g) {
          var toeDescending = toeDiff[g];  // 正值=脚尖在下降 (toeY增大)
          var toeFallenFromPeak = toeY[g] - mswToeY;  // 从最高点下降了多少
          if (toeFallenFromPeak < 3) return 0;  // 和MSw差不多高
          var heelNearGround = Math.max(0, heelY[g] - (groundY - 8));  // 脚跟接近地面
          return toeFallenFromPeak * 1.5 + toeDescending * 2 + heelNearGround * 2;
        });

        // 组装8个时相偏移 — 确保最小间距, 防止多时相同帧
        var rawOffsets = [icOff, lrOff, mstOff, tstOff, pswOff, iswOff, mswOff, tswOff];
        var phaseNames8 = ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];
        var isStance = [true, true, true, true, true, false, false, false];

        // 计算每个时相允许的区间
        var bounds = [
          [a0off, a1off],          // IC: [触地, 全压]
          [a0off + 1, a1off],      // LR: (触地, 全压]
          [a1off, a2off],          // MSt: [全压, 离地] (锚点)
          [a1off + 1, a2off - 1],  // TSt: (全压, 离地)
          [a1off + 2, a2off],      // PSw: (全压+2, 离地]
          [a2off, a3off],          // ISw: [离地, 最高]
          [a2off, a3off],          // MSw: [离地, 最高] (锚点)
          [a3off, a4off]           // TSw: [最高, 下一触地]
        ];

        // 第一轮: 按评分选帧
        var phaseOffsets = [];
        for (var k = 0; k < 8; k++) {
          phaseOffsets.push(rawOffsets[k]);
        }

        // 第二轮: 修正违反约束的帧 (超出边界 → 钳到边界)
        for (var k = 0; k < 8; k++) {
          if (phaseOffsets[k] < bounds[k][0]) phaseOffsets[k] = bounds[k][0];
          if (phaseOffsets[k] > bounds[k][1]) phaseOffsets[k] = bounds[k][1];
        }

        // 第三轮: 确保最小间距 — 每对相邻时相至少隔2帧
        // 如果空间不够, 在可用区间内均匀分布
        var minPhaseGap = Math.max(2, Math.floor(cycleLen / 20));  // 至少2帧, 长周期适当增大
        for (var k = 1; k < 8; k++) {
          if (phaseOffsets[k] - phaseOffsets[k-1] < minPhaseGap) {
            // 尝试把当前帧后移
            var desired = phaseOffsets[k-1] + minPhaseGap;
            if (desired <= bounds[k][1]) {
              phaseOffsets[k] = desired;
            } else {
              // 当前帧无法后移 → 把前一帧前移
              var backDesired = phaseOffsets[k] - minPhaseGap;
              if (backDesired >= bounds[k-1][0] && k >= 2) {
                phaseOffsets[k-1] = backDesired;
              }
            }
          }
        }

        // 第四轮: 最终钳位, 确保不超范围
        for (var k = 0; k < 8; k++) {
          phaseOffsets[k] = Math.max(0, Math.min(cycleLen - 1, phaseOffsets[k]));
        }
        // 确保严格递增 (最后保障)
        for (var k = 1; k < 8; k++) {
          if (phaseOffsets[k] <= phaseOffsets[k-1]) {
            phaseOffsets[k] = Math.min(cycleLen - 1, phaseOffsets[k-1] + 1);
          }
        }

        var stanceNames = ['IC', 'LR', 'MSt', 'TSt', 'PSw'];
        var swingNames  = ['ISw', 'MSw', 'TSw'];
        var phaseNames8 = stanceNames.concat(swingNames);

        // 诊断日志: 8时相选帧结果
        var diagParts = [];
        for (var k = 0; k < 8; k++) {
          var dOff = phaseOffsets[k];
          diagParts.push(phaseNames8[k] + '@' + dOff + '(h=' + heelY[dOff].toFixed(0) + ',t=' + toeY[dOff].toFixed(0) + ',gap=' + (heelY[dOff]-toeY[dOff]).toFixed(0) + ')');
        }
        console.log('[gait-diag] ' + side + ' cycle' + (i+1) + ' 时相: ' + diagParts.join(' | '));
        console.log('[gait-diag] ' + side + ' cycle' + (i+1) + ' 锚点: A0(IC)=' + a0off + ' A1(MSt)=' + a1off + ' A2(TO)=' + a2off + ' A3(MSw)=' + a3off + ' A4(下IC)=' + a4off + ' | toeGroundY=' + toeGroundY.toFixed(0) + ' toThreshold=' + toThreshold.toFixed(0) + ' toeRange=' + toeRange.toFixed(0));

        for (var k = 0; k < phaseNames8.length; k++) {
          var off = phaseOffsets[k];
          var gFi = icFi + off;
          var gT = keypointFrames[gFi] ? keypointFrames[gFi].t : icT + (off / cycleLen) * cycle;
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
    build(leftHS || [], 'left', leftTO || []);
    build(rightHS || [], 'right', rightTO || []);

    // === 交叉补全: 如果一侧周期太少, 用另一侧HS推算 ===
    // 步态中左右脚交替触地, 间距约半个周期
    var leftCycles = out.filter(function(p) { return p.side === 'left'; }).length / 8;
    var rightCycles = out.filter(function(p) { return p.side === 'right'; }).length / 8;
    console.log('[gait] cycles: left=' + leftCycles + ' right=' + rightCycles);
    // === 交叉补全 (条件更严苛) ===
    // 之前 leftCycles < 2 就会触发, 但真实场景中 (45% 姿势覆盖率) 1 个真实 left cycle + 8 个虚拟 = 9 个 cycle
    // 虚拟 HS = 右脚 IC + 半周期 = 物理上正好是"右脚 MSt"时刻
    // 截图虚拟 cycle 的"左脚 IC" → 画面里其实是右脚在 stance → "右脚用了左脚画面" 的来源
    // 修复: ① 虚拟 cycle 标记 derived:true  ② picker 跳过 derived 周期 (因为截图物理上必错)
    if (leftCycles < 2 && rightCycles >= 2 && rightHS && rightHS.length >= 3) {
      // 清空原有left周期(太少不可靠), 用右脚HS推算全部left周期
      out = out.filter(function(p) { return p.side !== 'left'; });
      // 用右脚HS推算左脚IC: 左脚IC ≈ 右脚IC + 半个周期
      // 把所有推算的IC合并成一个数组, 一次调用build, cycleIndex自然递增
      var virtualLeftHS = [];
      var rHS = rightHS;
      for (var ri = 0; ri < rHS.length - 1; ri++) {
        var halfCycle = (rHS[ri + 1].time - rHS[ri].time) / 2;
        var estLeftIC_t = rHS[ri].time + halfCycle;
        var estLeftIC_fi = rHS[ri].frameIndex + Math.floor((rHS[ri + 1].frameIndex - rHS[ri].frameIndex) / 2);
        if (estLeftIC_fi >= keypointFrames.length) estLeftIC_fi = keypointFrames.length - 1;
        // 获取推算IC处的踝Y (用于build内部)
        var estKp = getKp(keypointFrames[estLeftIC_fi], 'left_ankle');
        var estY = estKp ? estKp.y : rHS[ri].y;
        virtualLeftHS.push({
          frameIndex: estLeftIC_fi, time: estLeftIC_t,
          x: rHS[ri].x, y: estY, confidence: 0.5,
          derived: true  // ← 标记为虚拟, build() 会透传到 phase entry
        });
      }
      console.log('[gait] cross-derive left: ' + virtualLeftHS.length + ' virtual HS from right (标记 derived:true, picker 跳过)');
      build(virtualLeftHS, 'left', []);
    }
    if (rightCycles < 2 && leftCycles >= 2 && leftHS && leftHS.length >= 3) {
      // 清空原有right周期(太少不可靠), 用左脚HS推算全部right周期
      out = out.filter(function(p) { return p.side !== 'right'; });
      var virtualRightHS = [];
      var lHS = leftHS;
      for (var li = 0; li < lHS.length - 1; li++) {
        var halfCycleR = (lHS[li + 1].time - lHS[li].time) / 2;
        var estRIC_t = lHS[li].time + halfCycleR;
        var estRIC_fi = lHS[li].frameIndex + Math.floor((lHS[li + 1].frameIndex - lHS[li].frameIndex) / 2);
        if (estRIC_fi >= keypointFrames.length) estRIC_fi = keypointFrames.length - 1;
        var estKpR = getKp(keypointFrames[estRIC_fi], 'right_ankle');
        var estYR = estKpR ? estKpR.y : lHS[li].y;
        virtualRightHS.push({
          frameIndex: estRIC_fi, time: estRIC_t,
          x: lHS[li].x, y: estYR, confidence: 0.5,
          derived: true  // ← 标记为虚拟
        });
      }
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

    // 逐帧采集: 胫骨角 + 踝坐标
    var records = [];  // [{t, shankAngle, ankleX, ankleY}]
    for (var i = 0; i < frames.length; i++) {
      var ankle = getKp(frames[i], kpAnkle);
      var knee  = getKp(frames[i], kpKnee);
      if (!ankle || !knee || ankle.score < 0.25 || knee.score < 0.25) continue;
      var dx = ankle.x - knee.x;
      var dy = ankle.y - knee.y;
      records.push({
        t: frames[i].t,
        shankAngle: Math.atan2(dx, dy) * 180 / Math.PI,  // 0°=垂直, +前倾
        ankleX: ankle.x,
        ankleY: ankle.y
      });
    }
    if (records.length < 20) return { error: 'insufficient_ankle_data' };

    // ---- 地面平面估计 ----
    // 支撑相足底贴地, 踝 Y 最低点的连线 ≈ 地面方向
    // 拟合: 收集每个 HS 周期中踝 Y 接近最小值的帧 (支撑相), 线性回归
    var groundPoints = [];
    if (heelStrikes && heelStrikes.length >= 2) {
      for (var h = 0; h < heelStrikes.length - 1; h++) {
        var hsT = heelStrikes[h].time;
        var nextT = heelStrikes[h + 1].time;
        // 收集 HS 后 0-55% 周期 (支撑相) 的踝坐标
        var stanceWindow = hsT + (nextT - hsT) * 0.55;
        var minY = Infinity, minFrame = null;
        for (var j = 0; j < records.length; j++) {
          if (records[j].t >= hsT && records[j].t <= stanceWindow) {
            if (records[j].ankleY < minY) {
              minY = records[j].ankleY;
              minFrame = records[j];
            }
          }
        }
        if (minFrame) groundPoints.push(minFrame);
      }
    }
    // 如果收集到的地面点 ≥ 3, 线性回归估计地面斜率
    var groundAngleDeg = 0;  // 地面与水平线夹角 (°)
    var groundReliable = false;
    if (groundPoints.length >= 3) {
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
        groundReliable = groundPoints.length >= 5;
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
      ankleAngles.push({ t: records[k].t, angle: ankleAngle });
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

    var allAngles = ankleAngles.map(function(a){return a.angle;});
    var stanceMean = arrMean(stanceAnkleAngles);
    var swingMean  = arrMean(swingAnkleAngles);
    var maxDF = arrMax(allAngles);   // 最大背屈
    var maxPF = arrMin(allAngles);   // 最大跖屈
    var rom  = maxDF - maxPF;        // 活动范围
    var stanceSD = arrSD(stanceAnkleAngles);

    // ---- 临床标记 ----
    var flags = [];
    var quality = 'normal';
    if (rom > 0 && rom < 15) { quality = 'stiff'; flags.push('踝僵硬: 活动范围仅 ' + rom.toFixed(0) + '° — 可能踝关节病变/痉挛'); }
    else if (rom > 45) { quality = 'hypermobile'; flags.push('踝过度活动: ' + rom.toFixed(0) + '° — 共济失调/肌张力低下'); }

    if (stanceMean < -5) flags.push('支撑相跖屈: 平均 ' + stanceMean.toFixed(0) + '° — 可能马蹄足/跟腱挛缩');
    else if (stanceMean > 15) flags.push('支撑相过度背屈: ' + stanceMean.toFixed(0) + '° — 可能跟腱无力/扁平足');

    if (swingMean < 0) flags.push('摆动相背屈不足: ' + swingMean.toFixed(0) + '° — 足下垂风险 (胫前肌/腓深神经)');
    else if (swingMean > 20) flags.push('摆动相过度背屈: ' + swingMean.toFixed(0) + '°');

    if (maxDF < 5) flags.push('最大背屈 < 5° — 踝关节背屈严重受限 (距骨/跟骨撞击?)');

    if (stanceSD > 15 && groundReliable) flags.push('支撑相踝角不稳定 (SD=' + stanceSD.toFixed(0) + '°) — 本体感觉/平衡问题');

    if (flags.length === 0 && rom >= 15) flags.push('✓ 踝背屈/跖屈范围正常 (' + rom.toFixed(0) + '°)');

    return {
      side: side,
      ankleAngles: ankleAngles,
      stanceAvg: stanceMean,
      swingAvg: swingMean,
      maxDorsiflexion: maxDF,
      maxPlantarflexion: maxPF,
      rangeOfMotion: rom,
      groundAngle: groundAngleDeg,
      groundReliable: groundReliable,
      quality: quality,
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
        armSwing: computeArmSwing(frames, scale),
        elbowSwing: computeElbowSwing(frames, scale),
        kneeLeft: { note: '步态周期不足, 无法按周期分析' },
        kneeRight: { note: '步态周期不足, 无法按周期分析' },
        ankleLeft: computeAnkleKinematics(frames, noHS, 'left'),
        ankleRight: computeAnkleKinematics(frames, noHS, 'right')
      };
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
      degraded: false,
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
    resolveAndSwapSidesByFrame: resolveAndSwapSidesByFrame,
    detectHeelStrikes: detectHeelStrikes,
    detectToeOffs: detectToeOffs,
    computeGaitCyclePhases: computeGaitCyclePhases,
    computePhaseTimestamps: computePhaseTimestamps,
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
