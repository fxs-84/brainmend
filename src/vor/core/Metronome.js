// 节拍器 + 反馈音效（音色分三族，互不混淆）
//   节拍 beat  ：柔和正弦短音，纯粹作为"到位提示"，低音量短音尾
//   撞击 punch ：三角波低频钝音（像鼓点/锤子）
//   噪声 noise ：滤波白噪声短促爆裂（像冲击波）—— 命中瞬态的关键成分
//   脆击 click ：方波高频极短（像玻璃磕碰）
//   钟声 chime ：正弦长尾慢包络（成功奖励）
export class Metronome {
  constructor() { this.ctx = null; this.timer = null; this.freq = 0; }

  _ensureCtx() {
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume();
    return this.ctx;
  }

  start(freq) {
    this.freq = freq;
    try { this._ensureCtx(); } catch { return; }
    if (this.timer) return;
    this._clockOffset = performance.now() / 1000 - this.ctx.currentTime;
    this._next = this.ctx.currentTime + 0.15;
    this._left = true;
    this.timer = setInterval(() => this._sched(), 100);
  }

  _sched() {
    if (!this.ctx) return;
    this._clockOffset = performance.now() / 1000 - this.ctx.currentTime;
    while (this._next < this.ctx.currentTime + 0.3) {
      // 节拍 = 0.5 Hz（2 秒一响，完整摆动一次一拍，与训练节奏 1:1）
      //         高音铃 1760/1320 Hz 永远 > 命中所有成分
      this._beep(this._next, this._left ? 1760 : 1320, 0.07, 0.10);
      this._left = !this._left;
      this._next += 1 / this.freq;          // 完整周期一拍
    }
  }

  // 距最近节拍秒数（性能时基，带符号）；未运行 null
  nearestBeatDelta() {
    if (!this.timer || !this.ctx) return null;
    const interval = 1 / this.freq;
    const now = performance.now() / 1000 - this._clockOffset;
    let d = (this._next - now) % interval;
    if (d > interval / 2) d -= interval;
    if (d < -interval / 2) d += interval;
    return -d;
  }

  // —— 内部：正弦短音（节拍/通用）——
  _beep(t, f, vol, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // —— 撞击合成三件套（命中瞬态）——
  // 三角波低频钝音（鼓点）
  punch(freq = 196, vol = 0.22, dur = 0.10) {
    try {
      this._ensureCtx();
      const t = this.ctx.currentTime + 0.005;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch {}
  }

  // 滤波白噪声短促爆裂（冲击感，命中最重要的成分）
  noise(dur = 0.10, vol = 0.20) {
    try {
      this._ensureCtx();
      const t = this.ctx.currentTime + 0.004;
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp).connect(lp).connect(g).connect(this.ctx.destination);
      src.start(t);
    } catch {}
  }

  // 方波高频脆击（瞬态锋利度）
  click(freq = 1568, vol = 0.12) {
    try {
      this._ensureCtx();
      const t = this.ctx.currentTime + 0.002;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + 0.08);
    } catch {}
  }

  // 金属摩擦声（4.1.4 毛刺惩罚）：锯齿波高频下滑，像金属刮擦
  grind(vol = 0.13, dur = 0.18) {
    try {
      this._ensureCtx();
      const t = this.ctx.currentTime + 0.003;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(320, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch {}
  }

  // —— 钟声/奖励：长尾慢包络正弦（节拍命中/修复共用）——
  chime(freqs, vol = 0.08, dur = 0.40) {
    try {
      this._ensureCtx();
      const t = this.ctx.currentTime + 0.005;
      for (const f of freqs) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + dur + 0.05);
      }
    } catch {}
  }

  // 保留 burst 通用接口（兼容旧调用）
  burst(freqs, vol = 0.12, dur = 0.15) {
    try {
      this._ensureCtx();
      const t = this.ctx.currentTime + 0.01;
      for (const f of freqs) this._beep(t, f, vol, dur);
    } catch {}
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}