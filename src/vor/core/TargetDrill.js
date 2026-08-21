// 靶心命中训练（核心玩法循环）
// 方位 = midline ± amp：跟随最近周期中线，自动吸收陀螺仪漂移；
// 头摆到目标方位并保持 holdSec → 命中；左右交替 = VOR 往复摆动。
// 节拍窗口给进阶挑战（连击）。

export class TargetDrill {
  constructor({ amp = 15, tolerance = 2.5, holdSec = 0.3, beatWindow = 0.3 } = {}) {
    this.amp = amp;
    this.tol = tolerance;
    this.holdSec = holdSec;
    this.beatWindow = beatWindow;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.bearing = this.side * amp;
    this.midline = 0;
    this.holdT = 0;
    this.stats = { hits: 0, onBeat: 0, combo: 0, bestCombo: 0 };
    this._hitListeners = [];
    this._spawnListeners = [];
  }

  onHit(fn) { this._hitListeners.push(fn); }
  onSpawn(fn) { this._spawnListeners.push(fn); }

  // yaw：相对零点的姿态角（HeadPoseSource.pose.yaw）
  // beatDelta：距最近节拍的秒数（null = 无节拍）
  // midline：最近周期的中线（可选，默认 0）—— 漂移时靶心跟随，永远对准玩家真实摆动中心
  update(dt, yaw, beatDelta, midline = 0) {
    this.midline = midline;
    this.bearing = this.side * this.amp + midline;
    const err = yaw - this.bearing;
    if (Math.abs(err) <= this.tol) {
      this.holdT += dt;
      if (this.holdT >= this.holdSec) this._hit(beatDelta);
    } else {
      this.holdT = Math.max(0, this.holdT - dt * 2);
    }
    return { err, hold: Math.min(1, this.holdT / this.holdSec) };
  }

  _hit(beatDelta) {
    const onBeat = beatDelta != null && Math.abs(beatDelta) <= this.beatWindow;
    this.stats.hits++;
    if (onBeat) {
      this.stats.onBeat++;
      this.stats.combo++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    } else {
      this.stats.combo = 0;
    }
    const hit = { bearing: this.bearing, onBeat, combo: this.stats.combo, hits: this.stats.hits };
    this._hitListeners.forEach(f => f(hit));
    this.side *= -1;
    this.bearing = this.side * this.amp + this.midline;
    this.holdT = 0;
    this._spawnListeners.forEach(f => f({ bearing: this.bearing }));
  }
}