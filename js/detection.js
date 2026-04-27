// ============================================================
// DETECTION - 检测逻辑
// ============================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { crosshairSize, ringRadius } from './canvas.js';

// 综合检测
function updateIntegrated(elapsed) {
    state.targetX = 0;
    state.targetY = 0;
    state.progress = elapsed / CONFIG.INTEGRATED_DURATION;

    state.romRange.pitch.min = Math.min(state.romRange.pitch.min, state.pitch);
    state.romRange.pitch.max = Math.max(state.romRange.pitch.max, state.pitch);
    state.romRange.yaw.min = Math.min(state.romRange.yaw.min, state.yaw);
    state.romRange.yaw.max = Math.max(state.romRange.yaw.max, state.yaw);

    const trackingError = Math.sqrt((state.dotX - state.targetX) ** 2 + (state.dotY - state.targetY) ** 2);
    state.integratedResults.positionScore = Math.max(0, 100 - trackingError);

    if (!state.lastError) state.lastError = trackingError;
    const errorDelta = Math.abs(trackingError - state.lastError);
    state.lastError = trackingError;
    state.integratedResults.stabilityScore = Math.max(0, 100 - errorDelta * 10);

    const pitchRange = state.romRange.pitch.max - state.romRange.pitch.min;
    const yawRange = state.romRange.yaw.max - state.romRange.yaw.min;
    state.integratedResults.romScore = Math.min(100,
        ((pitchRange / CONFIG.EXPECTED_PITCH_RANGE) + (yawRange / CONFIG.EXPECTED_YAW_RANGE)) / 2 * 100
    );
}

// 位置觉检测
function updatePosition() {
    if (state.error <= CONFIG.HOLD_THRESHOLD) {
        state.holdTime += 1 / 60;
    } else {
        state.holdTime = Math.max(0, state.holdTime - CONFIG.ERROR_DECAY);
    }
    state.results.position = Math.min(100, (state.holdTime / CONFIG.HOLD_DURATION) * 100);
}

// 稳定性检测
function updateStability(elapsed) {
    const time = elapsed * 0.5;
    state.targetX = Math.sin(time) * 70;
    state.targetY = Math.cos(time) * 70;

    const error = Math.sqrt((state.dotX - state.targetX) ** 2 + (state.dotY - state.targetY) ** 2);
    state.results.stability = Math.max(0, 100 - error);
}

// ROM 检测
function updateROM() {
    state.romRange.pitch.min = Math.min(state.romRange.pitch.min, state.pitch);
    state.romRange.pitch.max = Math.max(state.romRange.pitch.max, state.pitch);
    state.romRange.yaw.min = Math.min(state.romRange.yaw.min, state.yaw);
    state.romRange.yaw.max = Math.max(state.romRange.yaw.max, state.yaw);

    const pitchRange = state.romRange.pitch.max - state.romRange.pitch.min;
    const yawRange = state.romRange.yaw.max - state.romRange.yaw.min;
    state.results.rom = Math.min(100,
        ((pitchRange / CONFIG.EXPECTED_PITCH_RANGE) + (yawRange / CONFIG.EXPECTED_YAW_RANGE)) / 2 * 100
    );
}

// ============================================================
// 协调性检测
// ============================================================

/**
 * 协调性检测评分标准：
 *
 * 1. 跟踪误差分 (40%): 绿色光点与红色目标之间的距离
 *    - 0-10像素: 100分
 *    - 10-20像素: 80分
 *    - 20-30像素: 60分
 *    - 30-40像素: 40分
 *    - 40像素以上: 20分
 *
 * 2. 轨迹偏离分 (30%): 绿色光点偏离理想轨迹的程度
 *    - 对于直线轨迹(水平/垂直): 测量点到直线距离
 *    - 对于8字轨迹: 测量点到理想曲线的距离
 *    - 0-5像素: 100分
 *    - 5-15像素: 80分
 *    - 15-25像素: 60分
 *    - 25-35像素: 40分
 *    - 35像素以上: 20分
 *
 * 3. 运动平稳分 (30%): 运动过程中的加速度变化
 *    - 测量连续帧之间的速度变化(jerk)
 *    - 速度变化越小越平稳
 *    -jerk < 5: 100分
 *    - jerk 5-15: 80分
 *    - jerk 15-25: 60分
 *    - jerk 25-35: 40分
 *    - jerk > 35: 20分
 *
 * 总分 = 跟踪误差分×0.4 + 轨迹偏离分×0.3 + 平稳分×0.3
 */

function updateCoordination(elapsed) {
    const smoothT = elapsed * CONFIG.TRAJECTORY_SPEED;

    // 使用时间进度，兼容COORDINATION_DURATION设置
    state.progress = Math.min(1, elapsed / CONFIG.COORDINATION_DURATION);

    // 计算像素范围（与 input.js 中的 hLineLength/vLineLength 一致）
    const hLineLength = crosshairSize / 2 - 15;   // 水平80°对应的像素范围
    const vLineLength = ringRadius * 0.85;          // 垂直45°对应的像素范围

    // targetX/Y 直接使用像素值（与 state.dotX/dotY 坐标系一致）
    let targetX, targetY;
    if (state.trajectoryType === 'horizontal') {
        targetX = Math.sin(smoothT) * hLineLength;
        targetY = 0;
    } else if (state.trajectoryType === 'vertical') {
        targetX = 0;
        targetY = Math.sin(smoothT) * vLineLength;
    } else if (state.trajectoryType === 'vertical_left') {
        // 左45°位置：x偏移 = hLineLength * (45°/80°), y范围 = vLineLength
        const angle45Offset = hLineLength * 45 / 80;
        targetX = -angle45Offset;
        targetY = Math.sin(smoothT) * vLineLength;
    } else if (state.trajectoryType === 'vertical_right') {
        // 右45°位置
        const angle45Offset = hLineLength * 45 / 80;
        targetX = angle45Offset;
        targetY = Math.sin(smoothT) * vLineLength;
    } else {
        // figure8
        targetX = Math.sin(smoothT) * hLineLength;
        targetY = Math.sin(smoothT) * Math.cos(smoothT) * vLineLength;
    }

    state.targetX = targetX;
    state.targetY = targetY;

    // 获取绿色光点位置
    const dotX = state.dotX;
    const dotY = state.dotY;

    // 1. 跟踪误差分数 (与红色目标距离)
    const trackingError = Math.sqrt((dotX - targetX) ** 2 + (dotY - targetY) ** 2);
    const trackingScore = calculateTrackingScore(trackingError);

    // 2. 轨迹偏离分数 (点到轨迹的距离)
    const trajectoryDeviation = calculateTrajectoryDeviation(dotX, dotY, targetX, targetY, state.trajectoryType, smoothT);
    const trajectoryScore = calculateTrajectoryScore(trajectoryDeviation);

    // 3. 运动平稳分数 (加速度变化)
    const jerk = calculateJerk();
    const smoothnessScore = calculateSmoothnessScore(jerk);

    // 更新状态
    if (!state.coordScores) {
        state.coordScores = { tracking: [], trajectory: [], smoothness: [] };
    }
    state.coordScores.tracking.push(trackingScore);
    state.coordScores.trajectory.push(trajectoryScore);
    state.coordScores.smoothness.push(smoothnessScore);

    // 计算综合分数
    const totalScore = trackingScore * 0.4 + trajectoryScore * 0.3 + smoothnessScore * 0.3;

    // 记录失败时间(用于判定是否合格)
    if (trackingError > CONFIG.COORD_FAIL_THRESHOLD || trajectoryDeviation > CONFIG.COORD_TRAJ_THRESHOLD) {
        state.coordFailTime = (state.coordFailTime || 0) + 1 / 60;
    } else {
        state.coordFailTime = Math.max(0, (state.coordFailTime || 0) - CONFIG.ERROR_DECAY);
    }

    // 综合评分
    state.results.coordination = Math.max(0, Math.min(100, totalScore));

    // 更新实时显示数据
    updateCoordinationDisplay(trackingScore, trajectoryScore, smoothnessScore, trackingError, trajectoryDeviation);
}

/**
 * 计算跟踪误差分数
 * @param {number} error - 像素误差
 * @returns {number} 0-100分数
 */
function calculateTrackingScore(error) {
    if (error <= 10) return 100;
    if (error <= 20) return 80;
    if (error <= 30) return 60;
    if (error <= 40) return 40;
    return 20;
}

/**
 * 计算轨迹偏离分数
 * @param {number} deviation - 像素偏离
 * @returns {number} 0-100分数
 */
function calculateTrajectoryScore(deviation) {
    if (deviation <= 5) return 100;
    if (deviation <= 15) return 80;
    if (deviation <= 25) return 60;
    if (deviation <= 35) return 40;
    return 20;
}

/**
 * 计算运动平稳分数
 * @param {number} jerk - 加速度变化值
 * @returns {number} 0-100分数
 */
function calculateSmoothnessScore(jerk) {
    if (jerk < 5) return 100;
    if (jerk < 15) return 80;
    if (jerk < 25) return 60;
    if (jerk < 35) return 40;
    return 20;
}

/**
 * 计算点到轨迹的偏离距离
 */
function calculateTrajectoryDeviation(dotX, dotY, targetX, targetY, trajectoryType, smoothT) {
    if (trajectoryType === 'horizontal') {
        // 水平线：计算点到Y=0直线的垂直距离
        return Math.abs(dotY - targetY);
    } else if (trajectoryType === 'vertical') {
        // 垂直线：计算点到X=0直线的垂直距离
        return Math.abs(dotX - targetX);
    } else if (trajectoryType === 'vertical_left' || trajectoryType === 'vertical_right') {
        // 垂直左右：计算点到X=constant直线的垂直距离
        return Math.abs(dotX - targetX);
    } else {
        // 8字轨迹：计算点到理想曲线的距离
        // 对于8字，计算点到正弦曲线的距离
        const figure8Y = Math.sin(smoothT) * Math.cos(smoothT) * CONFIG.FIGURE8_AMPLITUDE_Y;
        return Math.sqrt((dotX - targetX) ** 2 + (dotY - figure8Y) ** 2);
    }
}

/**
 * 计算加速度变化(jerk)
 */
function calculateJerk() {
    if (!state.coordLastVelocityX || !state.coordLastVelocityY) {
        state.coordLastVelocityX = state.dotX;
        state.coordLastVelocityY = state.dotY;
        return 0;
    }

    const velocityX = state.dotX - state.coordLastVelocityX;
    const velocityY = state.dotY - state.coordLastVelocityY;
    const accelerationX = velocityX - (state.coordLastVelocityX - (state.coordPrevVelocityX || 0));
    const accelerationY = velocityY - (state.coordLastVelocityY - (state.coordPrevVelocityY || 0));

    state.coordPrevVelocityX = state.coordLastVelocityX;
    state.coordPrevVelocityY = state.coordLastVelocityY;
    state.coordLastVelocityX = velocityX;
    state.coordLastVelocityY = velocityY;

    const jerk = Math.sqrt(accelerationX ** 2 + accelerationY ** 2);
    return jerk;
}

/**
 * 更新协调性实时显示
 */
function updateCoordinationDisplay(trackingScore, trajectoryScore, smoothnessScore, trackingError, trajectoryDeviation) {
    // 这些DOM元素需要存在才能更新
    const trackingEl = document.getElementById('coord-tracking-score');
    const trajectoryEl = document.getElementById('coord-trajectory-score');
    const smoothnessEl = document.getElementById('coord-smoothness-score');
    const errorEl = document.getElementById('coord-error');
    const deviationEl = document.getElementById('coord-deviation');

    if (trackingEl) trackingEl.textContent = Math.round(trackingScore);
    if (trajectoryEl) trajectoryEl.textContent = Math.round(trajectoryScore);
    if (smoothnessEl) smoothnessEl.textContent = Math.round(smoothnessScore);
    if (errorEl) errorEl.textContent = trackingError.toFixed(1);
    if (deviationEl) deviationEl.textContent = trajectoryDeviation.toFixed(1);
}

// ============================================================
// 前庭功能间接评估
// ============================================================

/**
 * 前庭功能间接评估标准
 *
 * 基于颈椎检测结果间接推断前庭-颈椎反射(VCR)状态
 *
 * 评估维度:
 * - JPS (位置觉): 反映本体感受器与前庭-颈椎反射整合能力
 * - 协调性: 反映前庭-颈反射对运动控制的影响
 * - 稳定性: 反映前庭-颈反射在姿态维持中的作用
 *
 * 分级标准:
 * - 前庭功能正常: 三项均正常/良好
 * - 前庭功能可疑: 仅有轻度异常
 * - 前庭功能需关注: 中度异常 或 多项轻度异常
 * - 建议进一步检查: 重度异常
 */

/**
 * JPS分级阈值(度)
 */
const JPS_THRESHOLDS = {
    EXCELLENT: 2,   // <2° 优秀
    GOOD: 3,        // 2-3° 良好
    NORMAL: 4.5,    // 3-4.5° 正常
    MILD: 6,        // 4.5-6° 轻度障碍
    MODERATE: 9,    // 6-9° 中度障碍
    // >9° 重度障碍
};

/**
 * 根据JPS误差返回等级
 */
function getJPSLevel(error) {
    if (error < JPS_THRESHOLDS.EXCELLENT) return 'excellent';
    if (error < JPS_THRESHOLDS.GOOD) return 'good';
    if (error < JPS_THRESHOLDS.NORMAL) return 'normal';
    if (error < JPS_THRESHOLDS.MILD) return 'mild';
    if (error < JPS_THRESHOLDS.MODERATE) return 'moderate';
    return 'severe';
}

/**
 * 根据检测分数返回等级
 */
function getScoreLevel(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'normal';
    if (score >= 40) return 'mild';
    return 'moderate'; // <40
}

/**
 * 计算前庭功能间接评估结果
 * @param {object} params - 检测参数
 * @param {number} params.jpsAvgError - JPS平均误差(度)
 * @param {number} params.coordinationScore - 协调性得分(0-100)
 * @param {number} params.stabilityScore - 稳定性得分(0-100)
 * @returns {object} 评估结果
 */
function evaluateVestibularFunction(params) {
    const { jpsAvgError, coordinationScore, stabilityScore } = params;

    // 转换为等级
    const jpsLevel = getJPSLevel(jpsAvgError || 0);
    const coordLevel = getScoreLevel(coordinationScore || 0);
    const stabLevel = getScoreLevel(stabilityScore || 0);

    // 等级分值(用于计算综合指数)
    const levelScore = {
        'excellent': 0, 'good': 0, 'normal': 1, 'mild': 2, 'moderate': 3, 'severe': 4
    };

    const jpsScore = levelScore[jpsLevel];
    const coordScore = levelScore[coordLevel];
    const stabScore = levelScore[stabLevel];

    // 计算异常指数(越高越严重)
    const abnormalityIndex = jpsScore + coordScore + stabScore;

    // 综合等级判定
    let assessment, recommendation, color;

    if (abnormalityIndex === 0) {
        assessment = '前庭功能正常';
        recommendation = '颈椎及前庭-颈椎反射功能良好';
        color = '#22c55e'; // 绿色
    } else if (abnormalityIndex <= 2) {
        assessment = '前庭功能可疑';
        recommendation = '存在轻度异常，建议观察随访';
        color = '#84cc16'; // 浅绿
    } else if (abnormalityIndex <= 4) {
        assessment = '前庭功能需关注';
        recommendation = '多项轻度或单项中度异常，建议进一步评估';
        color = '#eab308'; // 黄色
    } else {
        assessment = '建议进一步检查';
        recommendation = '存在明显异常，建议进行专业前庭功能检查';
        color = '#ef4444'; // 红色
    }

    return {
        assessment,
        recommendation,
        color,
        abnormalityIndex,
        details: {
            jps: { level: jpsLevel, error: jpsAvgError },
            coordination: { level: coordLevel, score: coordinationScore },
            stability: { level: stabLevel, score: stabilityScore }
        }
    };
}

/**
 * 从综合检测结果计算前庭评估
 */
function getVestibularAssessmentFromIntegrated() {
    // 综合检测没有单独的JPS，需要从位置觉得分反推
    // 由于综合检测只有综合得分，我们使用位置觉得分估算
    const positionScore = state.integratedResults?.positionScore || 0;
    const stabilityScore = state.integratedResults?.stabilityScore || 0;
    const romScore = state.integratedResults?.romScore || 0;

    // 位置觉得分转换为等效误差(粗略估算)
    // 得分100 = 误差0°, 得分0 = 误差20°+
    const estimatedJpsError = Math.max(0, (100 - positionScore) / 5);

    return evaluateVestibularFunction({
        jpsAvgError: estimatedJpsError,
        coordinationScore: 0, // 综合检测不含协调性
        stabilityScore: stabilityScore
    });
}

export { updateIntegrated, updatePosition, updateStability, updateROM, updateCoordination };
