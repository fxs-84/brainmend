// 引擎声（对齐 2D sound-manager startEngineHum，速度越快音调越高）
export class EngineSound {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.osc2 = null;
    this.gain = null;
    this.started = false;
  }

  // 必须用户手势后才能启动 AudioContext
  start() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.06;
      this.gain.connect(this.ctx.destination);

      // 主引擎低频锯齿波
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 80;
      // 低通滤波让声音更闷
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      this.osc.connect(filter);
      filter.connect(this.gain);
      this.osc.start();

      // 副引擎高八度
      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'square';
      this.osc2.frequency.value = 160;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.3;
      this.osc2.connect(g2);
      g2.connect(filter);
      this.osc2.start();

      this.filter = filter;
      this.started = true;
    } catch (e) {
      console.warn('引擎声启动失败', e);
    }
  }

  // speed 6~30 → frequency 60~220 Hz
  update(speed) {
    if (!this.started) return;
    const t = Math.max(0, Math.min(1, (speed - 6) / 24));
    const f = 60 + t * 160;
    const now = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(f, now, 0.1);
    this.osc2.frequency.setTargetAtTime(f * 2, now, 0.1);
    this.filter.frequency.setTargetAtTime(300 + t * 900, now, 0.1);
    this.gain.gain.setTargetAtTime(0.05 + t * 0.04, now, 0.1);
  }

  stop() {
    if (!this.started) return;
    try { this.osc.stop(); this.osc2.stop(); } catch {}
    this.started = false;
  }

  // 懒初始化 AudioContext（撞击/金币音效可能在引擎声未启动时触发）
  _ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      return this.ctx;
    } catch { return null; }
  }

  // 撞击音效：白噪声爆裂 + 低频闷击
  crash() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // 白噪声 0.25s
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    // 低频闷击
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(90, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.6, now);
    thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.35);
  }

  // 金币音效：明亮双音 ding
  coin() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [freq, t0, dur] of [[1046.5, 0, 0.12], [1568, 0.07, 0.18]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, now + t0);
      g.gain.exponentialRampToValueAtTime(0.01, now + t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + t0);
      osc.stop(now + t0 + dur + 0.02);
    }
  }
}
