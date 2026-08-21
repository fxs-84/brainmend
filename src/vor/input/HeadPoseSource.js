// 头部姿态输入源（VOR demo · 第一章）
// 三路输入：window.updateFromGyroscope 注入（与现有 2D 游戏同一通道，外部 IMU 桥也可直接调用）
//          DeviceOrientation（手机传感器）、键盘（仅开发，标记非临床）、自动正弦（演示）
// 输出：相对校准零点的 yaw/pitch（度），按 ±20°/±15° 钳制，原始值保留

const YAW_LIMIT = 20;
const PITCH_LIMIT = 15;

function wrapPi(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class HeadPoseSource {
  constructor() {
    this.raw = { yaw: 0, pitch: 0, roll: 0 };
    this.offset = { yaw: 0, pitch: 0 };
    this.t = performance.now() / 1000;
    this.source = 'none';       // none | external | deviceorientation | keyboard | auto
    this.clinical = true;
    this._cal = null;           // {samples:[], until, cb}
    this._keys = new Set();
    this._kbYaw = 0; this._kbPitch = 0;
    this._auto = null;          // {amp, freq, t0}
    this._onKeyDown = null; this._onKeyUp = null; this._onOrientation = null;
  }

  // 外部注入（E2E / 外部 IMU 桥）
  setPose(o) {
    if (typeof o.yaw === 'number') this.raw.yaw = o.yaw;
    if (typeof o.pitch === 'number') this.raw.pitch = o.pitch;
    if (typeof o.roll === 'number') this.raw.roll = o.roll;
    this.t = performance.now() / 1000;
    if (this.source === 'none' || this.source === 'keyboard') this.source = 'external';
  }

  // 手机 DeviceOrientation（iOS 需手势内 requestPermission；桌面 Chrome 有 API 但可能永不触发）
  async enableSensors() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined'
          && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      this._onOrientation = (e) => {
        if (e.alpha == null) return;
        // 相对校准零点使用，不依赖绝对罗盘方位（磁干扰/漂移）
        let yaw = e.alpha; if (yaw > 180) yaw -= 360;
        this.setPose({ yaw, pitch: e.beta || 0, roll: e.gamma || 0 });
        this.source = 'deviceorientation';
      };
      window.addEventListener('deviceorientation', this._onOrientation);
      return true;
    } catch { return false; }
  }

  // 键盘降级（仅开发；正式会话禁用，落库 clinical:false）
  enableKeyboard() {
    this._onKeyDown = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        this._keys.add(e.key); this.clinical = false;
        if (this.source === 'none') this.source = 'keyboard';
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this._keys.delete(e.key);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // 自动正弦演示（无硬件时验证玩法；非临床）。axis：'yaw'（默认，第一章）/ 'pitch'（第二章）
  enableAuto(amp, freq, axis = 'yaw') {
    this._auto = { amp, freq, t0: performance.now() / 1000, axis };
    this.clinical = false;
    this.source = 'auto';
  }

  startCalibration(seconds, cb) {
    this._cal = { samples: [], until: performance.now() / 1000 + seconds, cb };
  }
  get calibrating() { return !!this._cal; }

  // Rest 块自动重校准（漂移对策）：Rest 期间准静止 1.5s → 当前均值设为新零点，0.5s 平滑混合
  // yaw 与 pitch 双轴并行跟踪（第二章垂直 VOR 的 pitch 漂移同样在 Rest 消掉）；yaw 行为与旧版一致
  beginRestRecal(onRecal) {
    this._recal = { still: 0, sum: 0, sumP: 0, n: 0, onRecal, prevYaw: this.raw.yaw, prevPitch: this.raw.pitch };
  }
  endRestRecal() { this._recal = null; }

  update(dt) {
    const now = performance.now() / 1000;
    // 键盘积分
    if (this._keys.size) {
      const sp = 25 * dt;
      if (this._keys.has('ArrowLeft')) this._kbYaw -= sp;
      if (this._keys.has('ArrowRight')) this._kbYaw += sp;
      if (this._keys.has('ArrowUp')) this._kbPitch += sp * 0.6;
      if (this._keys.has('ArrowDown')) this._kbPitch -= sp * 0.6;
      this._kbYaw = clamp(this._kbYaw, -YAW_LIMIT, YAW_LIMIT);
      this._kbPitch = clamp(this._kbPitch, -PITCH_LIMIT, PITCH_LIMIT);
      this.raw.yaw = this._kbYaw; this.raw.pitch = this._kbPitch;
      this.t = now;
    }
    // 自动正弦
    if (this._auto) {
      const a = this._auto;
      const v = a.amp * Math.sin(2 * Math.PI * a.freq * (now - a.t0));
      this.raw.yaw = a.axis === 'pitch' ? 0 : v;
      this.raw.pitch = a.axis === 'pitch' ? v : 0;
      this.t = now;
    }
    // 校准采样（每帧采当前 raw，无新样本时也能完成）
    if (this._cal) {
      this._cal.samples.push({ yaw: this.raw.yaw, pitch: this.raw.pitch });
      if (now >= this._cal.until) {
        const s = this._cal.samples;
        const m = s.length
          ? { yaw: s.reduce((a, b) => a + b.yaw, 0) / s.length,
              pitch: s.reduce((a, b) => a + b.pitch, 0) / s.length }
          : { yaw: 0, pitch: 0 };
        this.offset = m;
        const cb = this._cal.cb; this._cal = null;
        cb && cb();
      }
    }
    // Rest 自动重校准：准静止 1.5s 触发，0.5s 平滑混合 offset；
    // 触发后重新武装 —— 整个 Rest 期间持续跟踪基线（漂移在 Rest 内也不会残留到下个 Active 块）
    if (this._recal) {
      const r = this._recal;
      const dYaw = Math.abs(this.raw.yaw - r.prevYaw);
      const dPitch = Math.abs(this.raw.pitch - r.prevPitch);
      r.prevYaw = this.raw.yaw;
      r.prevPitch = this.raw.pitch;
      if (dYaw < 0.3 && dPitch < 0.3) {           // 准静止（约 <20°/s 帧间抖动以内）
        r.still += dt; r.sum += this.raw.yaw; r.sumP += this.raw.pitch; r.n++;
        if (r.still >= 1.5) {
          const target = r.sum / r.n;
          const targetP = r.sumP / r.n;
          this._blend = { from: this.offset.yaw, to: target, fromP: this.offset.pitch, toP: targetP, k: 0 };
          if (!r.fired) { r.fired = true; r.onRecal && r.onRecal(target); }
          r.still = 0; r.sum = 0; r.sumP = 0; r.n = 0;      // 重新武装，Rest 内持续消漂移
        }
      } else {
        r.still = 0; r.sum = 0; r.sumP = 0; r.n = 0;
      }
    }
    if (this._blend) {
      const b = this._blend;
      b.k = Math.min(1, b.k + dt / 0.5);
      this.offset.yaw = b.from + (b.to - b.from) * b.k;
      this.offset.pitch = b.fromP + (b.toP - b.fromP) * b.k;
      if (b.k >= 1) this._blend = null;
    }
  }

  get pose() {
    return {
      yaw: clamp(wrapPi(this.raw.yaw - this.offset.yaw), -YAW_LIMIT, YAW_LIMIT),
      pitch: clamp(this.raw.pitch - this.offset.pitch, -PITCH_LIMIT, PITCH_LIMIT),
      t: this.t,
    };
  }
}
