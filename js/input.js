// ============================================================
// INPUT - 输入处理
// ============================================================

import { state } from './state.js';
import { canvas, crosshairSize, ringRadius, centerX, centerY } from './canvas.js';
import { updateDataDisplay } from './ui.js';
import { CONFIG } from './config.js';

export let isDraggingDot = false;
export let spacePressed = false;

// 陀螺仪漂移校正：
// - Yaw: 实时估算陀螺偏置速率并累加扣除
// - Pitch/Roll: 自适应EMA——静止时快收敛消除拖尾，运动时慢收敛保留信号
// - 死区: 微小信号归零，消除静止抖动

let _yawBiasRate = 0;
let _yawBiasAccum = 0;
let _lastBiasYaw = null;
let _lastBiasTime = 0;

let _emaPitch = null, _emaRoll = null;
let _emaWarmup = 0;
let _stillFrames = 0;
const EMA_SLOW = 0.993;
const EMA_FAST = 0.95;
const EMA_WARMUP = 0.9;
const STILL_THRESHOLD = 1.5;
const STILL_FRAMES_NEEDED = 45;
const DEAD_ZONE = 0.3;
const BIAS_LEARN_RATE = 0.01;

window._resetGyroEMA = () => {
    _emaPitch = null; _emaRoll = null; _emaWarmup = 0; _stillFrames = 0;
    _yawBiasRate = 0; _yawBiasAccum = 0;
    _lastBiasYaw = null; _lastBiasTime = 0;
};

let _freezeEMA = false;
window._freezeGyroEMA = (f) => { _freezeEMA = f; };
let _lastRawPitch = null, _lastRawRoll = null;

const _pBuf = [], _rBuf = [];
function _m5(buf, v) { buf.push(v); if (buf.length > 5) buf.shift(); const s = [...buf].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }

function updateFromGyroscope(gyroData) {
    if (!state.useGyroscope) return;

    let rawYaw = gyroData.yaw || 0;
    let rawPitch = gyroData.pitch || 0;
    let rawRoll = gyroData.roll || 0;

    rawPitch = _m5(_pBuf, rawPitch);
    rawRoll = _m5(_rBuf, rawRoll);

    const now = performance.now();
    const isGameMode = state.mode === 'game';

    // Yaw偏置估算（所有模块共用，帧间raw判断避免EMA滞后影响）
    if (_emaPitch !== null && _lastBiasYaw !== null) {
        const dt = (now - _lastBiasTime) / 1000;
        if (dt > 0.001 && dt < 0.5) {
            const rawRate = (rawYaw - _lastBiasYaw) / dt;
            // 用帧间raw值变化率判断静止，不受EMA滞后影响
            const pitchFrameMove = _lastRawPitch !== null ? Math.abs(rawPitch - _lastRawPitch) : 0;
            const rollFrameMove = _lastRawRoll !== null ? Math.abs(rawRoll - _lastRawRoll) : 0;
            const pitchMoving = pitchFrameMove >= 0.3;
            const rollMoving = rollFrameMove >= 0.3;
            const isHeadStill = !pitchMoving && !rollMoving;
            // 快速yaw运动或头部有运动时，停止bias累加
            const isCalibrating = Math.abs(rawRate) < 1 && isHeadStill;
            if (isCalibrating) {
                _yawBiasRate += (rawRate - _yawBiasRate) * BIAS_LEARN_RATE;
                _yawBiasAccum += _yawBiasRate * dt;
            }
        }
    }
    _lastBiasYaw = rawYaw;
    _lastBiasTime = now;
    _lastRawPitch = rawPitch;
    _lastRawRoll = rawRoll;

    state.yaw = rawYaw - state.yawOffset - _yawBiasAccum;

    // Pitch/Roll自适应EMA: 静止快收敛 / 运动慢跟踪
    // 位置觉检测期间禁用快收敛，避免中途暂停导致基线偏移
    if (_emaPitch === null) { _emaPitch = rawPitch; _emaRoll = rawRoll; _emaWarmup = 0; _stillFrames = 0; }
    if (!_freezeEMA) {
        const pitchDelta = Math.abs(rawPitch - _emaPitch);
        const rollDelta = Math.abs(rawRoll - _emaRoll);
        if (pitchDelta < STILL_THRESHOLD && rollDelta < STILL_THRESHOLD) {
            _stillFrames++;
        } else {
            _stillFrames = Math.max(0, _stillFrames - 3);
        }

        let a;
        if (_emaWarmup < 60) {
            a = EMA_WARMUP;
        } else if (_stillFrames >= STILL_FRAMES_NEEDED) {
            a = EMA_FAST;
        } else {
            a = EMA_SLOW;
        }
        _emaWarmup++;
        _emaPitch = _emaPitch * a + rawPitch * (1 - a);
        _emaRoll = _emaRoll * a + rawRoll * (1 - a);
    }

    // 检测模块直接使用raw值（跳过EMA），避免极端保持时EMA收敛导致回零
    // 游戏模块使用EMA平滑跟踪
    let adjPitch, adjRoll;
    if (isGameMode) {
        adjPitch = (rawPitch - _emaPitch) - state.pitchOffset;
        adjRoll = (rawRoll - _emaRoll) - state.rollOffset;
    } else {
        adjPitch = rawPitch - state.pitchOffset;
        adjRoll = rawRoll - state.rollOffset;
    }

    if (Math.abs(adjPitch) < DEAD_ZONE) adjPitch = 0;
    if (Math.abs(adjRoll) < DEAD_ZONE) adjRoll = 0;

    state.pitch = adjPitch;
    state.roll = adjRoll;

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
