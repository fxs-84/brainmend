// 会话数据记录（3.6）：产出 V2.1 文档约定的 session JSON
// 原始 60Hz head_pose 仅保留在 toJSON()（本地）；toUploadJSON() 降采样到 10Hz + 统计摘要，
// 控制上传记录 < 200KB。patient_ref 使用 share_token 派生哈希（不存明文身份）。
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function nowIso() { return new Date().toISOString(); }

export class SessionRecorder {
  constructor({ chapter = 1, difficultyTier = 'base', fixationMode = 'inferred', token = '' } = {}) {
    this.chapter = chapter;
    this.difficultyTier = difficultyTier;
    this.fixationMode = fixationMode;
    this.token = token;
    this.session = {
      session_id: null,
      patient_ref: '',
      chapter,
      difficulty_tier: difficultyTier,
      fixation_mode: fixationMode,
      start_time: null,
      end_time: null,
      duration_sec: 0,
      active_duration_sec: 0,
      symptom_vas: { pre: null, post: null },
      head_pose: [],          // 60Hz 本地原始（{t,yaw,pitch,roll}）
      alpha_rms: [],
      training_blocks: [],
      fixation_loss_events: [],
      out_of_range_events: [],
      device_gaps: [],
      summary: {},
    };
    this._t0 = null;
    this._activeTotal = 0;
    this._activeStart = null;
    this._cur = null;         // 当前块累计 {block_id,type,start_time,perfect,alphaSum,alphaN,theoretical}
  }

  setPatientRef(token = this.token) {
    this.token = token || '';
    this.session.patient_ref = this.token ? ('tok_' + djb2(this.token)) : ('local_' + djb2(nowIso()));
  }

  start() {
    this._t0 = performance.now();
    this.session.session_id = 'vor_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4);
    this.session.start_time = nowIso();
    this.setPatientRef();
  }

  setSymptom(pre, post) { this.session.symptom_vas = { pre, post }; }

  // 记录一帧头姿（相对会话开始的秒由内部计时，避免外部时钟不一致）；未 start 时跳过
  pushPose(yaw, pitch, roll) {
    if (this._t0 == null) return;
    const t = this._elapsed();
    this.session.head_pose.push({ t: +t.toFixed(3), yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2), roll: +roll.toFixed(2) });
  }

  pushAlpha(rms) { this.session.alpha_rms.push(Math.round(rms)); }

  pushGap(t, gapMs) { this.session.device_gaps.push({ t: +t.toFixed(2), gap_ms: Math.round(gapMs) }); }
  pushOutOfRange(t, axis, value) { this.session.out_of_range_events.push({ t: +t.toFixed(2), axis, value: +value.toFixed(1) }); }

  // 块边界：active 块累计 perfect 周期与 αRMS；blockEnd 时结算 achievement
  blockStart(blockId, type, { activeSec = 20, freq = 0.5 } = {}) {
    this._cur = {
      block_id: blockId, type, start_time: this._elapsed(),
      perfect: 0, alphaSum: 0, alphaN: 0,
      theoretical: type === 'active' ? Math.round(activeSec * freq) : 0,
    };
    if (type === 'active') this._activeStart = performance.now();
  }

  blockEnd() {
    if (!this._cur) return;
    const b = this._cur;
    if (b.type === 'active' && this._activeStart != null) {
      this._activeTotal += (performance.now() - this._activeStart) / 1000;
      this._activeStart = null;
    }
    b.end_time = this._elapsed();
    b.avg_alpha_rms = b.alphaN ? Math.round(b.alphaSum / b.alphaN) : 0;
    b.achievement = b.theoretical ? +(b.perfect / b.theoretical).toFixed(3) : 0;
    this.session.training_blocks.push(b);
    this._cur = null;
  }

  perfectCycle() { if (this._cur && this._cur.type === 'active') this._cur.perfect++; }
  addAlpha(rms) { if (this._cur && this._cur.type === 'active') { this._cur.alphaSum += rms; this._cur.alphaN++; } }

  _elapsed() { return this._t0 == null ? 0 : +((performance.now() - this._t0) / 1000).toFixed(2); }

  // summary + 结束时间 + 时长；返回完整本地版对象
  finalize(summary = {}) {
    if (this._cur) this.blockEnd();
    this.session.end_time = nowIso();
    this.session.duration_sec = Math.round(this._elapsed());
    this.session.active_duration_sec = Math.round(this._activeTotal);
    const blocks = this.session.training_blocks.filter(b => b.type === 'active');
    const perfect = blocks.reduce((a, b) => a + b.perfect, 0);
    const theoretical = blocks.reduce((a, b) => a + b.theoretical, 0);
    this.session.summary = {
      blocks: blocks.length,
      perfect_cycles: perfect,
      theoretical_cycles: theoretical,
      achievement: theoretical ? +(perfect / theoretical).toFixed(3) : 0,
      hits: summary.hits ?? 0,
      on_beat: summary.onBeat ?? 0,
      best_combo: summary.bestCombo ?? 0,
      repaired: summary.repaired ?? 0,
      out_of_range: this.session.out_of_range_events.length,
      device_gaps: this.session.device_gaps.length,
      ...summary,
    };
    return this.session;
  }

  // 上传版：head_pose 降采样到 10Hz（每 0.1s 桶取最后一个样本），alpha_rms 保留
  toUploadJSON() {
    const s = this.session;
    const pose = s.head_pose;
    const down = [];
    if (pose.length) {
      let bucket = -1;
      for (const p of pose) {
        const b = Math.floor(p.t * 10);
        if (b !== bucket) { bucket = b; down.push(p); }
        else down[down.length - 1] = p;
      }
    }
    return {
      ...s,
      head_pose: down,
      _downsampled: true,
      _pose_samples: { raw: pose.length, uploaded: down.length },
    };
  }
}
