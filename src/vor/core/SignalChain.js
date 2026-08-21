// 信号链（3.2.1 / 附录B）：原始角度 → 100Hz 均匀重采样 → 差分得 ω → 8Hz 低通 → 差分得 α
// 单帧/采样 gap > dtClamp 不跨 gap 差分，防切后台/卡顿产生伪毛刺
// axis：α 差分用轴（'yaw' 第一章 / 'pitch' 第二章），默认 'yaw' 行为与旧版完全一致

export class SignalChain {
  constructor(opts = {}) {
    this.axis = opts.axis || 'yaw';
    this.gridHz = opts.gridHz ?? 100;
    this.lowpassHz = opts.lowpassHz ?? 8;
    this.winSec = opts.winSec ?? 0.5;
    // 采样 gap 判定阈值（3.2.1/附录A：>100ms 记 gap）。不要用渲染帧 dt 钳制值（50ms），
    // 低帧率环境（headless ~19Hz = 52ms 间隔）会把每个合法采样段误判成 gap
    this.gapSec = opts.gapSec ?? 0.1;
    this.raw = [];            // {yaw, pitch, t}
    this.gridT = null;
    this.prevGrid = null;     // {yaw, pitch}
    this.wLp = { yaw: 0, pitch: 0 };
    this.prevWLp = null;
    this.alphas = [];         // {t, a, ok}
    this.omega = { yaw: 0, pitch: 0 };
    this.alphaRMS = 0;
    this.valid = false;
    this.maxAlphaEver = 0;    // 测试观测用
    this.spikeLog = [];       // |α|>500 的诊断记录（最多留 50 条）
    this._skipSpike = false;  // 跨 gap 后第一个 α 是低通重置瞬态（非真实毛刺），不计入 spikeLog
  }

  push(yaw, pitch, t) {
    this.raw.push({ yaw, pitch, t });
    if (this.raw.length > 4000) this.raw.splice(0, this.raw.length - 4000);
  }

  _sampleAt(t) {
    const r = this.raw;
    if (!r.length || t < r[0].t || t > r[r.length - 1].t) return null;
    let lo = 0, hi = r.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r[m].t <= t) lo = m; else hi = m; }
    const a = r[lo], b = r[hi];
    const span = b.t - a.t;
    const f = span > 1e-6 ? (t - a.t) / span : 0;
    return {
      yaw: a.yaw + (b.yaw - a.yaw) * f,
      pitch: a.pitch + (b.pitch - a.pitch) * f,
      gap: span > this.gapSec,   // 该插值段跨越采样 gap
    };
  }

  update(tNow) {
    const dt = 1 / this.gridHz;
    const rc = dt / (dt + 1 / (2 * Math.PI * this.lowpassHz)); // 一阶低通系数
    if (this.gridT == null) this.gridT = this.raw.length ? this.raw[0].t : tNow;
    let anyValid = false;
    while (this.gridT + dt <= tNow) {
      this.gridT += dt;
      const s = this._sampleAt(this.gridT);
      if (!s) break;
      if (s.gap) { this.prevGrid = null; this.prevWLp = null; this._skipSpike = true; continue; } // 不跨 gap 差分
      if (this.prevGrid) {
        const wYaw = (s.yaw - this.prevGrid.yaw) / dt;
        const wPitch = (s.pitch - this.prevGrid.pitch) / dt;
        if (!this.prevWLp) {
          // 启动/gap 后第一个 ω 直接作为低通初值，避免从 0 收敛的瞬态伪毛刺
          this.wLp = { yaw: wYaw, pitch: wPitch };
        } else {
          this.wLp.yaw += rc * (wYaw - this.wLp.yaw);
          this.wLp.pitch += rc * (wPitch - this.wLp.pitch);
        }
        this.omega = { yaw: this.wLp.yaw, pitch: this.wLp.pitch };
        if (this.prevWLp) {
          const a = (this.wLp[this.axis] - this.prevWLp[this.axis]) / dt;
          this.alphas.push({ t: this.gridT, a, ok: true });
          if (Math.abs(a) > this.maxAlphaEver) this.maxAlphaEver = Math.abs(a);
          if (Math.abs(a) > 500 && !this._skipSpike) {
            this.spikeLog.push({ t: this.gridT, a: Math.round(a) });
            if (this.spikeLog.length > 50) this.spikeLog.shift();
          }
          this._skipSpike = false;
          anyValid = true;
        }
        this.prevWLp = { ...this.wLp };
      }
      this.prevGrid = { yaw: s.yaw, pitch: s.pitch };
    }
    // 窗口 RMS（只用最近 winSec 的有效样本）
    const t0 = tNow - this.winSec;
    this.alphas = this.alphas.filter(e => e.t > t0 - 1); // 限长
    const win = this.alphas.filter(e => e.t > t0 && e.ok);
    this.alphaRMS = win.length
      ? Math.sqrt(win.reduce((sum, e) => sum + e.a * e.a, 0) / win.length) : 0;
    this.valid = anyValid || (win.length > 0 && (tNow - (this.raw[this.raw.length - 1]?.t ?? 0)) < this.gapSec);
    return { omega: this.omega, alphaRMS: this.alphaRMS, valid: this.valid };
  }
}
