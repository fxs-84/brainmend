// 输入：陀螺仪（yaw 转向 / pitch 速度）+ 键盘降级 + 3 档难度（对齐 2D）

const PITCH_FULL_DEFLECTION = 0.444;  // 对应 100% 俯仰
const GYRO_DIVISOR = 30;              // 角度 → [-1,1] 的除数
const KEYBOARD_YAW_STEP = 0.45;       // 左右键单次步进（需越过变道阈值）
const KEYBOARD_PITCH_STEP = 0.2;      // 上下键单次步进

export const DIFFICULTY = {
  easy:   { min: 0.6, initial: 1.0, max: 1.5, label: '简单 60-150%' },
  normal: { min: 1.2, initial: 1.5, max: 2.0, label: '普通 120-200%' },
  hard:   { min: 2.0, initial: 3.0, max: 4.0, label: '困难 200-400%' },
};

export class Input {
  constructor() {
    this.yaw = 0;      // [-1, 1] 转向
    this.pitch = 0;    // [-1, 1] 速度（低头 +1 / 抬头 -1）
    this.useGyro = false;
    this._gyroActive = false;  // 只有真正收到陀螺仪数据才置 true（桌面 Chrome 有 API 但永不触发）
    this._keys = new Set();
    this._gyroBase = null;
    this.difficulty = 'normal';  // 默认普通
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._onOrientation = null;
    this._bind();
  }

  setDifficulty(d) {
    if (DIFFICULTY[d]) this.difficulty = d;
  }

  // 速度倍率：抬头加速，低头减速（pitch<0=抬头=加速）
  getSpeedMultiplier() {
    const u = Math.max(-1, Math.min(1, this.pitch / PITCH_FULL_DEFLECTION));
    const c = DIFFICULTY[this.difficulty];
    // pitch<0（抬头，u<0）加速到 max；pitch>0（低头，u>0）减速到 min
    return u >= 0
      ? c.initial - (c.initial - c.min) * u
      : c.initial + (c.max - c.initial) * (-u);
  }

  async requestGyro() {
    if (typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r === 'granted') { this.useGyro = true; return true; }
      } catch { /* fall through */ }
      return false;
    }
    this.useGyro = ('ondeviceorientation' in window);
    return this.useGyro;
  }

  recalibrateGyro() {
    this._gyroBase = null;
  }

  _bind() {
    // 键盘降级
    this._onKeyDown = e => {
      this._keys.add(e.key);
      if (e.key === 'ArrowLeft') this.yaw = Math.max(-1, this.yaw - KEYBOARD_YAW_STEP);
      if (e.key === 'ArrowRight') this.yaw = Math.min(1, this.yaw + KEYBOARD_YAW_STEP);
      // 抬头=加速，低头=减速（康复设计：抬头后仰给加速奖励）
      if (e.key === 'ArrowUp') this.pitch = Math.max(-1, this.pitch - KEYBOARD_PITCH_STEP);
      if (e.key === 'ArrowDown') this.pitch = Math.min(1, this.pitch + KEYBOARD_PITCH_STEP);
    };
    this._onKeyUp = e => this._keys.delete(e.key);
    // 陀螺仪
    this._onOrientation = e => {
      if (!this.useGyro) return;
      if (e.beta == null || e.gamma == null) return;
      this._gyroActive = true;  // 收到真实数据才认为陀螺仪可用
      if (this._gyroBase === null) this._gyroBase = { beta: e.beta, gamma: e.gamma };
      const db = (e.beta - this._gyroBase.beta);
      const dg = (e.gamma - this._gyroBase.gamma);
      // gamma 左右倾 = yaw 转向
      this.yaw = Math.max(-1, Math.min(1, dg / GYRO_DIVISOR));
      // beta 前后倾 = pitch 速度（低头 beta 增大）
      this.pitch = Math.max(-1, Math.min(1, db / GYRO_DIVISOR));
    };
    addEventListener('keydown', this._onKeyDown);
    addEventListener('keyup', this._onKeyUp);
    addEventListener('deviceorientation', this._onOrientation);
  }

  destroy() {
    removeEventListener('keydown', this._onKeyDown);
    removeEventListener('keyup', this._onKeyUp);
    removeEventListener('deviceorientation', this._onOrientation);
  }

  // 每帧平滑衰减到 0（键盘模式 / 陀螺仪未实际激活时）
  update(dt) {
    if (!this._gyroActive && this._keys.size === 0) {
      this.yaw *= Math.pow(0.02, dt);
      this.pitch *= Math.pow(0.02, dt);
      if (Math.abs(this.yaw) < 0.01) this.yaw = 0;
      if (Math.abs(this.pitch) < 0.01) this.pitch = 0;
    }
  }
}
