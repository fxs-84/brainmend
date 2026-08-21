// 训练节奏控制器（3.7）：Active 20s / Rest 10s 交替，Rest 期间判定暂停
export class TrainingPaceController {
  constructor({ activeSec = 20, restSec = 10, blocks = 12, onChange } = {}) {
    this.activeSec = activeSec; this.restSec = restSec; this.blocks = blocks;
    this.onChange = onChange || (() => {});
    this.state = 'idle';   // idle | active | rest | done
    this.block = 0;
    this.tIn = 0;
    this.paused = false;
  }

  start() { if (this.state === 'idle') { this.block = 1; this._to('active'); } }
  stop() { this.state = 'done'; this.onChange('done', this.block); }

  _to(s) { this.state = s; this.tIn = 0; this.onChange(s, this.block); }

  update(dt) {
    if (this.paused || this.state === 'idle' || this.state === 'done') return;
    this.tIn += dt;
    if (this.state === 'active' && this.tIn >= this.activeSec) {
      this._to('rest');
    } else if (this.state === 'rest' && this.tIn >= this.restSec) {
      if (this.block >= this.blocks) this._to('done');
      else { this.block++; this._to('active'); }
    }
  }

  get remain() {
    if (this.state === 'active') return Math.max(0, this.activeSec - this.tIn);
    if (this.state === 'rest') return Math.max(0, this.restSec - this.tIn);
    return 0;
  }
}
