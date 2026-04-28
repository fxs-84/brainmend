// ============================================================
// INPUT ADAPTER - 输入适配器
// 统一陀螺仪/鼠标输入为游戏坐标
// ============================================================

import { state } from '../state.js';
import { MotionMapper } from './motion-mapper.js';

export class InputAdapter {
    constructor() {
        // 输入源：'gyroscope' | 'mouse'
        this.inputSource = 'mouse';

        // 鼠标模式下的位置
        this.mouseX = 0.5;
        this.mouseY = 0.5;

        // 运动模式
        this.motionMode = MotionMapper.MODES.TRIPLE;

        // 射击状态
        this.shootPressed = false;
        this.shootHeld = false;  // 用于连续射击

        // 是否初始化
        this.initialized = false;
    }

    /**
     * 初始化输入适配器
     */
    init() {
        // 检测可用输入源
        // 如果 state.useGyroscope 为 true，优先使用陀螺仪
        if (state.useGyroscope && this.isGyroscopeAvailable()) {
            this.inputSource = 'gyroscope';
        } else {
            this.inputSource = 'mouse';
        }

        // 绑定鼠标事件
        this.bindMouseEvents();

        // 绑定键盘事件（用于调试/备用）
        this.bindKeyboardEvents();

        this.initialized = true;
    }

    /**
     * 检测陀螺仪是否可用
     */
    isGyroscopeAvailable() {
        return window.DeviceOrientationEvent !== undefined;
    }

    /**
     * 绑定鼠标事件
     */
    bindMouseEvents() {
        const canvas = document.getElementById('game-canvas') || document.getElementById('canvas');

        if (!canvas) {
            console.warn('Canvas not found for mouse input');
            return;
        }

        // 鼠标移动
        canvas.addEventListener('mousemove', (e) => {
            if (this.inputSource !== 'mouse') return;

            const rect = canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width;
            this.mouseY = (e.clientY - rect.top) / rect.height;
        });

        // 触摸移动
        canvas.addEventListener('touchmove', (e) => {
            if (this.inputSource !== 'mouse') return;
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.mouseX = (touch.clientX - rect.left) / rect.width;
            this.mouseY = (touch.clientY - rect.top) / rect.height;
        }, { passive: false });

        // 点击射击
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {  // 左键
                this.shootPressed = true;
                this.shootHeld = true;
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.shootHeld = false;
            }
        });
    }

    /**
     * 绑定键盘事件（调试用）
     */
    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const step = 0.02;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    this.mouseY = Math.max(0, this.mouseY - step);
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    this.mouseY = Math.min(1, this.mouseY + step);
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    this.mouseX = Math.max(0, this.mouseX - step);
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    this.mouseX = Math.min(1, this.mouseX + step);
                    break;
                case ' ':
                    this.shootPressed = true;
                    this.shootHeld = true;
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.shootHeld = false;
            }
        });
    }

    /**
     * 获取当前位置（归一化 0-1）
     */
    getPosition() {
        if (this.inputSource === 'gyroscope') {
            return this.getGyroscopePosition();
        } else {
            return { x: this.mouseX, y: this.mouseY };
        }
    }

    /**
     * 获取陀螺仪位置
     */
    getGyroscopePosition() {
        // 从state获取陀螺仪数据（需要减去偏移量）
        const pitch = (state.pitch - state.pitchOffset) / 45;  // 归一化到约-1到1
        const yaw = (state.yaw - state.yawOffset) / 80;
        const roll = (state.roll - state.rollOffset) / 45;

        // 根据运动模式返回不同的坐标
        return MotionMapper.mapToGame({ pitch, yaw, roll }, this.motionMode);
    }

    /**
     * 设置运动模式
     */
    setMotionMode(mode) {
        this.motionMode = mode;
    }

    /**
     * 获取当前运动模式
     */
    getMotionMode() {
        return this.motionMode;
    }

    /**
     * 获取活动轴
     */
    getActiveAxes() {
        return MotionMapper.getActiveAxes(this.motionMode);
    }

    /**
     * 获取输入源
     */
    getInputSource() {
        return this.inputSource;
    }

    /**
     * 切换输入源
     */
    toggleInputSource() {
        if (this.inputSource === 'mouse') {
            if (this.isGyroscopeAvailable()) {
                this.inputSource = 'gyroscope';
            }
        } else {
            this.inputSource = 'mouse';
        }
        return this.inputSource;
    }
}
