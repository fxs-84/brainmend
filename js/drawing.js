// ============================================================
// DRAWING - 绘图函数
// ============================================================

import { CONFIG } from './config.js';
import { state } from './state.js';
import { canvas, ctx, centerX, centerY, crosshairSize, ringRadius } from './canvas.js';

// 绘制背景网格
function drawGrid() {
    ctx.strokeStyle = CONFIG.COLORS.GRID;
    ctx.lineWidth = 1;
    const gridStep = 50;
    for (let x = 0; x < canvas.width; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// 绘制静态元素（十字准星背景）
function drawStaticElements() {
    const actualCenterX = centerX + state.crosshairOffsetX;
    const actualCenterY = centerY + state.crosshairOffsetY;

    // 外部参考环
    ctx.beginPath();
    ctx.arc(actualCenterX, actualCenterY, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = CONFIG.COLORS.RING_OUTER;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 内部环
    ctx.beginPath();
    ctx.arc(actualCenterX, actualCenterY, ringRadius * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = CONFIG.COLORS.RING_INNER;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 水平线（与左右垂直线相交）
    const leftX = actualCenterX - crosshairSize / 2 + 15;
    const rightX = actualCenterX + crosshairSize / 2 - 15;
    ctx.beginPath();
    ctx.moveTo(leftX, actualCenterY);
    ctx.lineTo(rightX, actualCenterY);
    ctx.strokeStyle = CONFIG.COLORS.CROSSHAIR;
    ctx.lineWidth = 10;
    ctx.stroke();

    // 中心垂直线（比外圆直径短很多）
    const vLineLength = ringRadius * 0.85;
    ctx.beginPath();
    ctx.moveTo(actualCenterX, actualCenterY - vLineLength);
    ctx.lineTo(actualCenterX, actualCenterY + vLineLength);
    ctx.strokeStyle = CONFIG.COLORS.CROSSHAIR;
    ctx.lineWidth = 10;
    ctx.stroke();

    // 角落标记
    const markSize = 15;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 5;

    // 上
    ctx.beginPath();
    ctx.moveTo(actualCenterX - markSize, actualCenterY - crosshairSize / 2 + 10);
    ctx.lineTo(actualCenterX + markSize, actualCenterY - crosshairSize / 2 + 10);
    ctx.stroke();
    // 下
    ctx.beginPath();
    ctx.moveTo(actualCenterX - markSize, actualCenterY + crosshairSize / 2 - 10);
    ctx.lineTo(actualCenterX + markSize, actualCenterY + crosshairSize / 2 - 10);
    ctx.stroke();
    // 左
    ctx.beginPath();
    ctx.moveTo(actualCenterX - crosshairSize / 2 + 10, actualCenterY - markSize);
    ctx.lineTo(actualCenterX - crosshairSize / 2 + 10, actualCenterY + markSize);
    ctx.stroke();
    // 右
    ctx.beginPath();
    ctx.moveTo(actualCenterX + crosshairSize / 2 - 10, actualCenterY - markSize);
    ctx.lineTo(actualCenterX + crosshairSize / 2 - 10, actualCenterY + markSize);
    ctx.stroke();
}

// 绘制轨迹路径
function drawTrajectory(actualCenterX, actualCenterY, scale) {
    const isCoordOrIntegrated = state.mode === 'coordination' || state.mode === 'integrated';
    if (!isCoordOrIntegrated) return;

    const isFigure8 = state.trajectoryType === 'figure8';
    const isHorizontal = state.trajectoryType === 'horizontal';
    const isVertical = state.trajectoryType === 'vertical';
    const isVerticalLeft = state.trajectoryType === 'vertical_left';
    const isVerticalRight = state.trajectoryType === 'vertical_right';

    // 使用与 state.dotX/dotY 相同的像素坐标系
    const hLineLength = crosshairSize / 2 - 15;   // 水平像素范围
    const vLineLength = ringRadius * 0.85;          // 垂直像素范围

    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
        const tParam = (i / 200) * Math.PI * 2;
        let pathX, pathY;

        if (isFigure8) {
            pathX = actualCenterX + Math.sin(tParam) * hLineLength;
            pathY = actualCenterY - Math.sin(tParam) * Math.cos(tParam) * vLineLength;
        } else if (isHorizontal) {
            pathX = actualCenterX + Math.sin(tParam) * hLineLength;
            pathY = actualCenterY;
        } else if (isVertical) {
            pathX = actualCenterX;
            pathY = actualCenterY - Math.cos(tParam) * vLineLength;
        } else if (isVerticalLeft) {
            // 左45°：x偏移 = hLineLength * (45°/80°), y范围 = vLineLength
            const angle45Offset = hLineLength * 45 / 80;
            pathX = actualCenterX - angle45Offset;
            pathY = actualCenterY - Math.cos(tParam) * vLineLength;
        } else if (isVerticalRight) {
            const angle45Offset = hLineLength * 45 / 80;
            pathX = actualCenterX + angle45Offset;
            pathY = actualCenterY - Math.cos(tParam) * vLineLength;
        } else {
            pathX = actualCenterX + Math.sin(tParam) * hLineLength;
            pathY = actualCenterY;
        }

        if (i === 0) {
            ctx.moveTo(pathX, pathY);
        } else {
            ctx.lineTo(pathX, pathY);
        }
    }
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = 10;
    ctx.stroke();
}

// 绘制红色目标点
function drawTargetDot(actualCenterX, actualCenterY, scale, targetX, targetY) {
    const showTarget = state.mode === 'stability' || state.mode === 'coordination' || state.mode === 'integrated';
    if (!showTarget) return;

    // targetX/Y 已经是像素值（与 state.dotX/dotY 坐标系一致）
    const tX = actualCenterX + targetX;
    const tY = actualCenterY - targetY;
    const dotRadius = 12;

    // 光晕
    const gradient = ctx.createRadialGradient(tX, tY, 0, tX, tY, dotRadius * 2);
    gradient.addColorStop(0, CONFIG.COLORS.TARGET_GLOW);
    gradient.addColorStop(0.5, CONFIG.COLORS.TARGET_GLOW_MID);
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.beginPath();
    ctx.arc(tX, tY, dotRadius * 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 圆形
    ctx.beginPath();
    ctx.arc(tX, tY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.COLORS.TARGET;
    ctx.fill();

    // 边框
    ctx.beginPath();
    ctx.arc(tX, tY, dotRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// 绘制绿色位置点
function drawPositionDot(actualCenterX, actualCenterY, scale, dotX, dotY) {
    // dotX/Y 已经是像素值（与 state.dotX/dotY 坐标系一致）
    const pX = actualCenterX + dotX;
    const pY = actualCenterY - dotY;
    const dotRadius = 12;

    // 光晕
    const gradient = ctx.createRadialGradient(pX, pY, 0, pX, pY, dotRadius * 2);
    gradient.addColorStop(0, CONFIG.COLORS.POSITION_GLOW);
    gradient.addColorStop(0.5, CONFIG.COLORS.POSITION_GLOW_MID);
    gradient.addColorStop(1, 'rgba(0, 217, 165, 0)');
    ctx.beginPath();
    ctx.arc(pX, pY, dotRadius * 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 圆形
    ctx.beginPath();
    ctx.arc(pX, pY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.COLORS.POSITION;
    ctx.fill();

    // 边框
    ctx.beginPath();
    ctx.arc(pX, pY, dotRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// 绘制轨迹
function drawTrail(actualCenterX, actualCenterY) {
    // 优先使用完整轨迹 fullTrail，否则用 trail
    const trailToDraw = state.fullTrail.length > 0 ? state.fullTrail : state.trail;
    if (trailToDraw.length < 2) return;

    ctx.beginPath();
    for (let i = 0; i < trailToDraw.length; i++) {
        const point = trailToDraw[i];
        // fullTrail 的点已经是像素值，直接使用
        const x = actualCenterX + point.x;
        const y = actualCenterY - point.y;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.strokeStyle = CONFIG.COLORS.TRAIL;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

// 主绘制函数
function drawCrosshair() {
    // 游戏模式下由游戏引擎接管渲染，跳过十字准线绘制
    if (state.mode === 'game') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const actualCenterX = centerX + state.crosshairOffsetX;
    const actualCenterY = centerY + state.crosshairOffsetY;
    const scale = ringRadius / 100;

    drawGrid();
    drawStaticElements();
    drawTrajectory(actualCenterX, actualCenterY, scale);
    drawTargetDot(actualCenterX, actualCenterY, scale, state.targetX, state.targetY);
    drawPositionDot(actualCenterX, actualCenterY, scale, state.dotX, state.dotY);
    drawTrail(actualCenterX, actualCenterY);
}

export { drawCrosshair };
