// ============================================================
// CANVAS - 画布和尺寸
// ============================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { isDraggingDot } from './input.js';
import { drawCrosshair } from './drawing.js';
import { updateDataDisplay } from './ui.js';

export const canvas = document.getElementById('crosshair-canvas');
export const ctx = canvas.getContext('2d');
export let centerX, centerY, crosshairSize, ringRadius;

function resizeCanvas() {
    const container = document.getElementById('detection-area');
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    crosshairSize = Math.min(canvas.width, canvas.height) * 0.5 * state.zoomFactor;
    ringRadius = crosshairSize * 0.35;
}

// ============================================================
// ANIMATION LOOP
// ============================================================

function animate() {
    // 游戏模式：不绘制检测UI，让游戏引擎独占画布
    if (state.mode === 'game') {
        updateDataDisplay();
        requestAnimationFrame(animate);
        return;
    }

    // 绿色光点平滑插值：消除陀螺仪数据低频更新导致的卡顿
    // 0.7 = 99%收敛约4帧(67ms)，兼顾流畅与响应，避免低平滑因子产生的拖尾漂移
    const smoothFactor = 0.7;
    state.displayDotX += (state.dotX - state.displayDotX) * smoothFactor;
    state.displayDotY += (state.dotY - state.displayDotY) * smoothFactor;

    drawCrosshair();
    updateDataDisplay();

    // 鼠标模式下：非拖动时缓慢回到中心（协调性跟踪期间禁用，避免绿色光点漂移）
    if (!state.useGyroscope && !isDraggingDot && state.mode !== 'coordination') {
        state.dotX *= CONFIG.DOT_RETURN_SPEED;
        state.dotY *= CONFIG.DOT_RETURN_SPEED;
        state.yaw = state.dotX * state.yawCoefficient;
        state.pitch = -state.dotY * state.pitchCoefficient;
        state.roll = 0;
    }

    // 检测过程中保存完整轨迹
    if (state.isRunning) {
        state.trail.push({ x: state.dotX, y: state.dotY });
        if (state.trail.length > state.maxTrailLength) {
            state.trail.shift();
        }
        // 保存到完整轨迹
        state.fullTrail.push({ x: state.dotX, y: state.dotY, timestamp: Date.now() });
        if (state.fullTrail.length > state.maxFullTrailLength) {
            state.fullTrail.shift();
        }
    }

    requestAnimationFrame(animate);
}

// ============================================================
// GLOBAL TARGET (已迁移到 state.targetX/Y)
// 保留用于初始化，由 state.targetX/Y 使用
// ============================================================

export { resizeCanvas, animate };
