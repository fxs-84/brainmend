// VOR 摆动质量判定（实测修订版：周期质量分制 + 中线漂移免疫）
// 实测结论：真实头部运动是梯形速度曲线（转向点 α 峰值 300+），二元"完美周期"硬闸门
// 对真人永远关闭 → 改为每个周期输出 quality ∈ [0,1]：
//   ampScore    峰值幅度偏差 ≤2° 满分 / ≥6° 零分（相对局部中线，慢漂移免疫）
//   periodScore 周期时长偏差 ≤10% 满分 / ≥30% 零分
//   smoothScore αRMS ≤ threshold 满分 / ≥3×threshold（真人毛刺区）零分
//   quality = 0.4·amp + 0.3·period + 0.3·smooth；≥0.85 记"完美"（庆祝用）

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class VorQualityEvaluator {
  constructor({ amp, freq, axis = 'yaw' }) {
    this.amp = amp; this.freq = freq;
    this.axis = axis;   // 判定轴：'yaw' 第一章 / 'pitch' 第二章（默认 'yaw'，行为不变）
    this.threshold = 1.3 * amp * Math.pow(2 * Math.PI * freq, 2) / Math.SQRT2; // °/s²（smoothScore 满分线）
    this.deadzone = Math.min(5, 0.3 * amp * 2 * Math.PI * freq);               // °/s
    this.ampFull = 2;            // 幅度偏差满分窗口（°）
    this.ampZero = 6;            // 幅度偏差零分线（°）
    this.periodFull = 0.10;      // 周期偏差满分窗口（相对）
    this.periodZero = 0.30;      // 周期偏差零分线（相对）
    this.smoothZeroFactor = 3;   // 平滑零分 = 3×threshold
    this.isSmooth = false;
    this.stats = { cycles: 0, perfect: 0, qualitySum: 0 };
    this.lastCycle = null;
    this._cycleListeners = [];
    this._turnListeners = [];
    this._crossings = [];        // {t, peak, avgRms}
    this._lastSign = 0;
    this._max = 0; this._min = 0;
    this._rmsSum = 0; this._rmsN = 0;
  }

  onCycle(fn) { this._cycleListeners.push(fn); }   // 每个完整周期（含 quality）
  onTurn(fn) { this._turnListeners.push(fn); }     // 每次转向过零（每秒约 1 次，做即时反馈）

  update(s) {
    if (!s.valid) {
      // 挂起时清空周期缓冲，防止跨 Rest/gap 把两段摆动误拼成一个周期
      this._lastSign = 0; this._crossings = [];
      this._max = 0; this._min = 0; this._rmsSum = 0; this._rmsN = 0;
      return;
    }
    this.isSmooth = s.alphaRMS < this.threshold;
    const w = s['w' + this.axis];
    const sign = w > this.deadzone ? 1 : (w < -this.deadzone ? -1 : 0);
    if (sign !== 0) {
      if (this._lastSign !== 0 && sign !== this._lastSign) this._cross(s.t, this._lastSign);
      this._lastSign = sign;
    }
    if (s[this.axis] > this._max) this._max = s[this.axis];
    if (s[this.axis] < this._min) this._min = s[this.axis];
    this._rmsSum += s.alphaRMS; this._rmsN++;
  }

  _cross(t, fromSign) {
    // ω +→-：刚结束的半周期经过最大值；ω -→+：经过最小值 —— 按过零方向取峰，符号确定
    const peak = fromSign > 0 ? this._max : this._min;
    const avgRms = this._rmsN ? this._rmsSum / this._rmsN : 0;
    this._crossings.push({ t, peak, avgRms });
    this._max = 0; this._min = 0; this._rmsSum = 0; this._rmsN = 0;
    this._turnListeners.forEach(f => f({ t, dir: fromSign > 0 ? 'left' : 'right' }));
    const c = this._crossings;
    if (c.length >= 3) {
      // 完整周期 = 第1个过零 → 第3个过零；两半峰分别存在第2、3个过零记录上
      const dur = c[2].t - c[0].t;
      const p1 = c[1].peak, p2 = c[2].peak;
      // 局部中线：漂移时 p1/p2 同向平移，midline 跟随，幅度为相对量（漂移免疫）
      const midline = (p1 + p2) / 2;
      const a1 = Math.abs(p1 - midline), a2 = Math.abs(p2 - midline);
      const ampDev = (Math.abs(a1 - this.amp) + Math.abs(a2 - this.amp)) / 2;
      const ampScore = 1 - clamp((ampDev - this.ampFull) / (this.ampZero - this.ampFull), 0, 1);
      const periodDev = Math.abs(dur - 1 / this.freq) * this.freq;   // 相对偏差
      const periodScore = 1 - clamp((periodDev - this.periodFull) / (this.periodZero - this.periodFull), 0, 1);
      const rms = (c[1].avgRms + c[2].avgRms) / 2;
      const smoothScore = 1 - clamp((rms - this.threshold) / ((this.smoothZeroFactor - 1) * this.threshold), 0, 1);
      const quality = 0.4 * ampScore + 0.3 * periodScore + 0.3 * smoothScore;
      const perfect = quality >= 0.85;
      this.stats.cycles++;
      if (perfect) this.stats.perfect++;
      this.stats.qualitySum += quality;
      this.lastCycle = { dur, p1, p2, midline, ampScore, periodScore, smoothScore, quality, perfect };
      this._cycleListeners.forEach(f => f(this.lastCycle));
      this._crossings = [c[2]]; // 非重叠：以本次过零为下一周期起点
    }
  }

  reset() {
    this.stats = { cycles: 0, perfect: 0, qualitySum: 0 };
    this._crossings = []; this._lastSign = 0;
    this._max = 0; this._min = 0; this._rmsSum = 0; this._rmsN = 0;
    this.lastCycle = null;
  }
}
