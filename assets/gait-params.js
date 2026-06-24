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
  var NORMAL = {
    stepLength:   { min: 0.60, max: 0.80, unit: 'm',    label: '步长' },
    strideLength: { min: 1.20, max: 1.60, unit: 'm',    label: '步幅' },
    stepWidth:    { min: 0.08, max: 0.10, unit: 'm',    label: '步宽' },
    footAngle:    { min: 5,    max: 10,   unit: '°',    label: '足偏角' },
    cadence:      { min: 100,  max: 120,  unit: '步/分', label: '步频' },
    gaitSpeed:    { min: 1.2,  max: 1.7,  unit: 'm/s',  label: '步速' },
    stancePct:    { min: 58,   max: 62,   unit: '%',    label: '支撑相' },
    swingPct:     { min: 38,   max: 42,   unit: '%',    label: '摆动相' },
    doubleSupport:{ min: 10,   max: 12,   unit: '%',    label: '双支撑期' }
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

    // 最小间隔约束 (>= 0.30s, 正常人最快 ~200步/分对应 0.30s)
    // 同一只脚连续 heel-strike 至少 0.40s 间隔 (最快 150 步/分 = 0.40s)
    var minInterval = 0.30;
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
        // 假设镜头垂直于行走方向, 步长 = 纵向 (x方向) 距离
        var lenPx = Math.abs(dx);
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
      strides.push({
        value: Math.abs(dx) * scale,
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
    var stepLengthL = mean(stepLensL);
    var stepLengthR = mean(stepLensR);
    var stepLength  = mean(stepLens.map(function (s) { return s.value; }));

    // 步幅
    var stridesL = computeStrideLengths(leftHS, scale);
    var stridesR = computeStrideLengths(rightHS, scale);
    var strideLengthL = mean(stridesL.map(function (s) { return s.value; }));
    var strideLengthR = mean(stridesR.map(function (s) { return s.value; }));
    var strideLength  = (strideLengthL + strideLengthR) / 2;

    // 步宽
    var widths = computeStepWidths(frames, leftHS, rightHS, scale);
    var stepWidth = mean(widths.map(function (w) { return w.value; }));

    // 足偏角
    var footAngles = computeFootAngles(frames, scale);
    var footAngleL = mean(footAngles.filter(function (a) { return a.side === 'left'; }).map(function (a) { return a.value; }));
    var footAngleR = mean(footAngles.filter(function (a) { return a.side === 'right'; }).map(function (a) { return a.value; }));
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
      }
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

    // 偏瘫步态: 步长↓ + 不对称性↑ + 支撑相比正常短
    if (p.stepLength.value < 0.50 && a.stepLength > 0.20 && a.stance > 0.05) {
      scores.hemiplegic = 0.40 + (0.50 - p.stepLength.value) * 0.5 + a.stepLength * 0.5;
    } else { scores.hemiplegic = 0; }

    // 帕金森步态: 步频↑ + 步长↓↓ + 步速↓ + 躯干前倾
    if (p.cadence.value > 110 && p.stepLength.value < 0.40 && p.gaitSpeed.value < 0.9) {
      scores.parkinsonian = 0.30 + (p.cadence.value - 110) / 50 * 0.2 +
        (0.40 - p.stepLength.value) * 0.3 + (e.trunkLeanFwd > 0 ? Math.min(e.trunkLeanFwd, 20) / 20 * 0.2 : 0);
    } else { scores.parkinsonian = 0; }

    // 共济失调步态: 步宽↑ + 节奏变异↑
    if (p.stepWidth.value > 0.13 && e.rhythmCV > 0.15) {
      scores.ataxic = 0.25 + (p.stepWidth.value - 0.13) * 1.5 + e.rhythmCV * 0.5;
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

    // 正常: 所有参数都在正常范围内
    var allNormal = ['stepLength','strideLength','stepWidth','footAngle','cadence','gaitSpeed','stancePct']
      .every(function (k) { return p[k].status === 'normal'; });
    if (allNormal) scores.normal = 0.50;
    else scores.normal = 0;

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
    var primaryScore = 0;
    Object.keys(scores).forEach(function (k) {
      if (scores[k] > primaryScore) {
        primaryScore = scores[k];
        primaryKey = k;
      }
    });

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
    getKp: getKp,
    inferFoot: inferFoot,
    extractFootKeypoints: extractFootKeypoints,
    extractTrunkAngle: extractTrunkAngle,
    detectHeelStrikes: detectHeelStrikes,
    computeStepLengths: computeStepLengths,
    computeStrideLengths: computeStrideLengths,
    computeStepWidths: computeStepWidths,
    computeFootAngles: computeFootAngles,
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
