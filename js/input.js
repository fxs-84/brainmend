// ============================================================
// INPUT - 输入处理
// ============================================================

import { state } from './state.js';
import { canvas, crosshairSize, ringRadius, centerX, centerY } from './canvas.js';
import { updateDataDisplay } from './ui.js';
import { CONFIG } from './config.js';

export let isDraggingDot = false;
export let spacePressed = false;

// EMA基线追踪（全局漂移补偿，所有模式共享）
let _emaYaw = null, _emaPitch = null, _emaRoll = null;
let _emaWarmup = 0;
const EMA_ALPHA = 0.9995; // ~23秒半衰期：极慢追踪，慢速康复动作不被吸收
const EMA_WARMUP = 0.9;    // 初始化时快速收敛
window._resetGyroEMA = () => { _emaYaw = null; _emaPitch = null; _emaRoll = null; _emaWarmup = 0; };

function updateFromGyroscope(gyroData) {
    if (!state.useGyroscope) return;

    const rawYaw = gyroData.yaw || 0;
    const rawPitch = gyroData.pitch || 0;
    const rawRoll = gyroData.roll || 0;

    // EMA基线：吸收传感器慢速漂移
    if (_emaYaw === null) { _emaYaw = rawYaw; _emaPitch = rawPitch; _emaRoll = rawRoll; _emaWarmup = 0; }
    // 前60帧(~0.6s)用较快alpha快速收敛到真实基线
    const a = _emaWarmup < 60 ? EMA_WARMUP : EMA_ALPHA;
    _emaWarmup++;
    _emaYaw = _emaYaw * a + rawYaw * (1 - a);
    _emaPitch = _emaPitch * a + rawPitch * (1 - a);
    _emaRoll = _emaRoll * a + rawRoll * (1 - a);

    // state = (去漂移) - 归零偏移 = 干净的有意运动
    state.yaw = (rawYaw - _emaYaw) - state.yawOffset;
    state.pitch = (rawPitch - _emaPitch) - state.pitchOffset;
    state.roll = (rawRoll - _emaRoll) - state.rollOffset;

    state.dotX = state.yaw / state.yawCoefficient;
    state.dotY = -state.pitch / state.pitchCoefficient;

    const hLineLength = crosshairSize / 2 - 15;
    const vLineLength = ringRadius * 0.85;
    state.dotX = Math.max(-hLineLength, Math.min(hLineLength, state.dotX));
    state.dotY = Math.max(-vLineLength, Math.min(vLineLength, state.dotY));

    if (state.isRunning) {
        state.trail.push({ x: state.dotX, y: state.dotY });
        if (state.trail.length > state.maxTrailLength) {
            state.trail.shift();
        }
    }

    updateDataDisplay();
}

// 公开陀螺仪更新函数到全局
window.updateFromGyroscope = updateFromGyroscope;

// ============================================================
// 手机陀螺仪支持（DeviceOrientation API）
// ============================================================
let deviceOrientationEnabled = false;

function handleDeviceOrientation(event) {
    if (!state.useGyroscope) return;

    // DeviceOrientation API 的角度定义：
    // alpha: 绕 Z轴旋转（0-360°，相当于 yaw）
    // beta: 绕 X轴旋转（-180-180°，相当于 pitch，前后倾）
    // gamma: 绕 Y轴旋转（-90-90°，相当于 roll，左右倾）

    let yaw = event.alpha || 0;
    let pitch = event.beta || 0;
    let roll = event.gamma || 0;

    // 归一化 yaw 到 0-360
    if (yaw > 180) yaw -= 360;

    // 调用陀螺仪更新
    window.updateFromGyroscope({ yaw, pitch, roll });
}

function enableDeviceOrientation() {
    if (deviceOrientationEnabled) return;

    // 检查是否支持 DeviceOrientation
    if (!window.DeviceOrientationEvent) {
        console.warn('DeviceOrientation API 不支持');
        return;
    }

    // iOS 13+ 需要请求权限
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // 需要用户交互才能请求权限，所以绑定到点击事件
        document.addEventListener('touchstart', async function requestPerm() {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                    deviceOrientationEnabled = true;
                    console.log('手机陀螺仪已启用');
                }
            } catch (err) {
                console.error('陀螺仪权限请求失败:', err);
            }
            document.removeEventListener('touchstart', requestPerm);
        }, { once: true });
    } else {
        // 其他浏览器直接启用
        window.addEventListener('deviceorientation', handleDeviceOrientation);
        deviceOrientationEnabled = true;
        console.log('手机陀螺仪已启用');
    }
}

function disableDeviceOrientation() {
    if (!deviceOrientationEnabled) return;
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
    deviceOrientationEnabled = false;
    console.log('手机陀螺仪已禁用');
}

// 公开函数到全局
window.enableDeviceOrientation = enableDeviceOrientation;
window.disableDeviceOrientation = disableDeviceOrientation;

function updateDotPosition(e) {
    // 陀螺仪模式下不处理鼠标输入
    if (state.useGyroscope) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const actualCenterX = centerX + state.crosshairOffsetX;
    const actualCenterY = centerY + state.crosshairOffsetY;

    const offsetX = x - actualCenterX;
    const offsetY = actualCenterY - y;

    const scale = 100 / ringRadius;

    // 限制在垂直线长度范围内（对应后伸/前屈 ±45°）
    const vLineLength = ringRadius * 0.85;
    const clampedOffsetY = Math.max(-vLineLength, Math.min(vLineLength, offsetY));
    // dotX/Y 直接存储像素偏移量（与 window.targetX/Y 坐标系一致）
    state.dotY = clampedOffsetY;

    // 限制在水平线长度范围内（对应旋转 ±80°）
    const hLineLength = (crosshairSize / 2 - 15);
    const clampedOffsetX = Math.max(-hLineLength, Math.min(hLineLength, offsetX));
    state.dotX = clampedOffsetX;

    // 按模块映射范围计算角度系数（协调性 yaw±45°/pitch±22.5°，ROM/位置觉 yaw±80°/pitch±45°）
    state.yawCoefficient = state.yawRange / hLineLength;
    state.pitchCoefficient = state.pitchRange / vLineLength;

    state.trail.push({ x: state.dotX, y: state.dotY });
    if (state.trail.length > state.maxTrailLength) {
        state.trail.shift();
    }
    // 保存到完整轨迹
    if (state.isRunning) {
        state.fullTrail.push({ x: state.dotX, y: state.dotY, timestamp: Date.now() });
        if (state.fullTrail.length > state.maxFullTrailLength) {
            state.fullTrail.shift();
        }
    }

    // 角度映射：像素偏移 / hLineLength * 80° = 对应角度
    state.yaw = state.dotX * state.yawCoefficient;
    state.pitch = -state.dotY * state.pitchCoefficient;
    state.roll = 0; // 模拟数据暂无roll，真实陀螺仪会提供

    updateDataDisplay();
}

function returnToCenter() {
    // 协调性跟踪期间不禁用回中，避免绿色光点漂移
    if (state.mode === 'coordination') return;
    state.dotX *= (1 - CONFIG.DOT_RETURN_SPEED);
    state.dotY *= (1 - CONFIG.DOT_RETURN_SPEED);
    state.yaw = state.dotX * state.yawCoefficient;
    state.pitch = -state.dotY * state.pitchCoefficient;
    state.roll = 0;
}

function initInput() {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', e => {
        if (e.button === 0 && !spacePressed) {
            isDraggingDot = true;
            updateDotPosition(e);
        } else if (e.button === 2 || spacePressed) {
            state.isDraggingCrosshair = true;
            state.lastDragX = e.clientX;
            state.lastDragY = e.clientY;
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (e.button === 0) {
            isDraggingDot = false;
            returnToCenter();
        } else {
            state.isDraggingCrosshair = false;
        }
    });

    canvas.addEventListener('mouseleave', () => {
        isDraggingDot = false;
        state.isDraggingCrosshair = false;
    });

    canvas.addEventListener('mousemove', e => {
        if (isDraggingDot) {
            updateDotPosition(e);
        } else if (state.isDraggingCrosshair) {
            const dx = e.clientX - state.lastDragX;
            const dy = e.clientY - state.lastDragY;
            state.crosshairOffsetX += dx;
            state.crosshairOffsetY += dy;
            state.lastDragX = e.clientX;
            state.lastDragY = e.clientY;
        }
    });

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (e.touches.length === 1) {
            isDraggingDot = true;
            updateDotPosition(e.touches[0]);
        }
    });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && isDraggingDot) {
            updateDotPosition(e.touches[0]);
        }
    });

    canvas.addEventListener('touchend', () => {
        isDraggingDot = false;
        returnToCenter();
    });

    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            spacePressed = true;
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            state.crosshairOffsetY -= 10;
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            state.crosshairOffsetY += 10;
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            state.crosshairOffsetX -= 10;
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            state.crosshairOffsetX += 10;
        } else if (e.code === 'KeyR') {
            state.crosshairOffsetX = 0;
            state.crosshairOffsetY = 0;
        }
    });

    document.addEventListener('keyup', e => {
        if (e.code === 'Space') {
            spacePressed = false;
        }
    });
}

export { initInput };
