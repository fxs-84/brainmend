// ============================================================
// INPUT - 输入处理
// ============================================================

import { state } from './state.js';
import { canvas, crosshairSize, ringRadius, centerX, centerY } from './canvas.js';
import { updateDataDisplay } from './ui.js';
import { CONFIG } from './config.js';

export let isDraggingDot = false;
export let spacePressed = false;

// 6轴模式：传感器Yaw=纯陀螺积分，无磁力计污染。
// 陀螺仪有微小偏置(0.05-0.3°/s)，持续积分→角度慢慢漂移。
// 静止时(速率<2°/s)估算偏置速率，逐帧累加扣除，运动中沿用最新估值。

let _yawBiasRate = 0;   // 陀螺偏置速率估算 (°/s)
let _yawBiasAccum = 0;  // 累加偏置扣除量
let _lastBiasYaw = null;
let _lastBiasTime = 0;

let _emaPitch = null, _emaRoll = null;
let _emaWarmup = 0;
const EMA_ALPHA = 0.9995;
const EMA_WARMUP = 0.9;
window._resetGyroEMA = () => {
    _emaPitch = null; _emaRoll = null; _emaWarmup = 0;
    _yawBiasRate = 0; _yawBiasAccum = 0;
    _lastBiasYaw = null; _lastBiasTime = 0;
};

let _freezeEMA = false;
window._freezeGyroEMA = (f) => { _freezeEMA = f; };

// 中值滤波：消单帧毛刺（仅Pitch/Roll，Yaw在6轴下数据干净无需滤波）
const _pBuf = [], _rBuf = [];
function _m5(buf, v) { buf.push(v); if (buf.length > 5) buf.shift(); const s = [...buf].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }

function updateFromGyroscope(gyroData) {
    if (!state.useGyroscope) return;

    let rawYaw = gyroData.yaw || 0;
    let rawPitch = gyroData.pitch || 0;
    let rawRoll = gyroData.roll || 0;

    // 中值滤波（仅Pitch/Roll）
    rawPitch = _m5(_pBuf, rawPitch);
    rawRoll = _m5(_rBuf, rawRoll);

    // 陀螺偏置估算：速率<1°/s时才更新，避免干扰慢速主动运动
    const now = performance.now();
    if (_lastBiasYaw !== null) {
        const dt = (now - _lastBiasTime) / 1000;
        if (dt > 0.001 && dt < 0.5) {
            const rawRate = (rawYaw - _lastBiasYaw) / dt;
            if (Math.abs(rawRate) < 1) {
                _yawBiasRate += (rawRate - _yawBiasRate) * 0.002;
            }
            _yawBiasAccum += _yawBiasRate * dt;
        }
    }
    _lastBiasYaw = rawYaw;
    _lastBiasTime = now;

    // Yaw：直接差值 - 累加偏置扣除
    state.yaw = rawYaw - state.yawOffset - _yawBiasAccum;

    // Pitch/Roll：EMA追踪慢漂
    if (_emaPitch === null) { _emaPitch = rawPitch; _emaRoll = rawRoll; _emaWarmup = 0; }
    if (!_freezeEMA) {
        const a = _emaWarmup < 60 ? EMA_WARMUP : EMA_ALPHA;
        _emaWarmup++;
        _emaPitch = _emaPitch * a + rawPitch * (1 - a);
        _emaRoll = _emaRoll * a + rawRoll * (1 - a);
    }

    state.pitch = (rawPitch - _emaPitch) - state.pitchOffset;
    state.roll = (rawRoll - _emaRoll) - state.rollOffset;

    // 位置觉训练锁定：光点固定在采集位置
    if (state._posLocked) {
        state.dotX = state._posLockedX;
        state.dotY = state._posLockedY;
    } else {
        state.dotX = state.yaw / state.yawCoefficient;
        state.dotY = -state.pitch / state.pitchCoefficient;

        const hLineLength = crosshairSize / 2 - 15;
        const vLineLength = ringRadius * 0.85;
        state.dotX = Math.max(-hLineLength, Math.min(hLineLength, state.dotX));
        state.dotY = Math.max(-vLineLength, Math.min(vLineLength, state.dotY));
    }

    if (state.isRunning) {
        state.trail.push({ x: state.dotX, y: state.dotY });
        if (state.trail.length > state.maxTrailLength) {
            state.trail.shift();
        }
    }

    updateDataDisplay();
}

window.updateFromGyroscope = updateFromGyroscope;

// ============================================================
// 手机陀螺仪支持（DeviceOrientation API）
// ============================================================
let deviceOrientationEnabled = false;

function handleDeviceOrientation(event) {
    if (!state.useGyroscope) return;
    let yaw = event.alpha || 0;
    let pitch = event.beta || 0;
    let roll = event.gamma || 0;
    if (yaw > 180) yaw -= 360;
    window.updateFromGyroscope({ yaw, pitch, roll });
}

function enableDeviceOrientation() {
    if (deviceOrientationEnabled) return;
    if (!window.DeviceOrientationEvent) { console.warn('DeviceOrientation API 不支持'); return; }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        document.addEventListener('touchstart', async function requestPerm() {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                    deviceOrientationEnabled = true;
                }
            } catch (err) { console.error('陀螺仪权限请求失败:', err); }
            document.removeEventListener('touchstart', requestPerm);
        }, { once: true });
    } else {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
        deviceOrientationEnabled = true;
    }
}

function disableDeviceOrientation() {
    if (!deviceOrientationEnabled) return;
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
    deviceOrientationEnabled = false;
}

window.enableDeviceOrientation = enableDeviceOrientation;
window.disableDeviceOrientation = disableDeviceOrientation;

function updateDotPosition(e) {
    if (state.useGyroscope) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const actualCenterX = centerX + state.crosshairOffsetX;
    const actualCenterY = centerY + state.crosshairOffsetY;
    const offsetX = x - actualCenterX;
    const offsetY = actualCenterY - y;
    const vLineLength = ringRadius * 0.85;
    const clampedOffsetY = Math.max(-vLineLength, Math.min(vLineLength, offsetY));
    state.dotY = clampedOffsetY;
    const hLineLength = (crosshairSize / 2 - 15);
    const clampedOffsetX = Math.max(-hLineLength, Math.min(hLineLength, offsetX));
    state.dotX = clampedOffsetX;
    state.yawCoefficient = state.yawRange / hLineLength;
    state.pitchCoefficient = state.pitchRange / vLineLength;
    state.trail.push({ x: state.dotX, y: state.dotY });
    if (state.trail.length > state.maxTrailLength) state.trail.shift();
    if (state.isRunning) {
        state.fullTrail.push({ x: state.dotX, y: state.dotY, timestamp: Date.now() });
        if (state.fullTrail.length > state.maxFullTrailLength) state.fullTrail.shift();
    }
    state.yaw = state.dotX * state.yawCoefficient;
    state.pitch = -state.dotY * state.pitchCoefficient;
    state.roll = 0;
    updateDataDisplay();
}

function returnToCenter() {
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
        if (e.button === 0 && !spacePressed) { isDraggingDot = true; updateDotPosition(e); }
        else if (e.button === 2 || spacePressed) { state.isDraggingCrosshair = true; state.lastDragX = e.clientX; state.lastDragY = e.clientY; }
    });
    canvas.addEventListener('mouseup', e => {
        if (e.button === 0) { isDraggingDot = false; returnToCenter(); }
        else { state.isDraggingCrosshair = false; }
    });
    canvas.addEventListener('mouseleave', () => { isDraggingDot = false; state.isDraggingCrosshair = false; });
    canvas.addEventListener('mousemove', e => {
        if (isDraggingDot) updateDotPosition(e);
        else if (state.isDraggingCrosshair) { const dx = e.clientX - state.lastDragX; const dy = e.clientY - state.lastDragY; state.crosshairOffsetX += dx; state.crosshairOffsetY += dy; state.lastDragX = e.clientX; state.lastDragY = e.clientY; }
    });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches.length === 1) { isDraggingDot = true; updateDotPosition(e.touches[0]); } });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches.length === 1 && isDraggingDot) updateDotPosition(e.touches[0]); });
    canvas.addEventListener('touchend', () => { isDraggingDot = false; returnToCenter(); });
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat) { e.preventDefault(); spacePressed = true; }
        else if (e.code === 'ArrowUp') { e.preventDefault(); state.crosshairOffsetY -= 10; }
        else if (e.code === 'ArrowDown') { e.preventDefault(); state.crosshairOffsetY += 10; }
        else if (e.code === 'ArrowLeft') { e.preventDefault(); state.crosshairOffsetX -= 10; }
        else if (e.code === 'ArrowRight') { e.preventDefault(); state.crosshairOffsetX += 10; }
        else if (e.code === 'KeyR') { state.crosshairOffsetX = 0; state.crosshairOffsetY = 0; }
    });
    document.addEventListener('keyup', e => { if (e.code === 'Space') spacePressed = false; });
}

export { initInput };
