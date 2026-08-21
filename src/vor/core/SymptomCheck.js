// 症状闭环 VAS（3.4.4，硬性）：训练前后各一次头晕 + 恶心评分
// 儿童可用表情量表：0/2/4/6/8/10 六档大按钮，每档带表情 + 文字。
// collect() 依次问头晕、恶心，返回 Promise<{dizzy, nausea}>；
// evaluate(pre, post) 判定加重是否触发「当日终止 / 下次降档」。
const CSS = `
#vor-vas-root { position: fixed; inset: 0; z-index: 1550; display: none;
  align-items: center; justify-content: center; background: rgba(6,10,20,.88); }
#vor-vas-root .vas-panel { max-width: 460px; text-align: center; padding: 26px 22px;
  background: rgba(20,30,52,.97); border: 1px solid rgba(120,160,220,.3); border-radius: 14px; }
#vor-vas-root .vas-title { font-size: 20px; margin-bottom: 4px; color: #dfe9f2;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; }
#vor-vas-root .vas-sub { font-size: 13px; opacity: .78; margin-bottom: 16px; color: #dfe9f2;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; }
#vor-vas-root .vas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
#vor-vas-root .vas-btn { display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 6px; border-radius: 10px; border: 1px solid rgba(140,180,240,.4);
  background: rgba(255,255,255,.04); color: #dfe9f2; cursor: pointer; transition: background .12s, border-color .12s; }
#vor-vas-root .vas-btn:hover { background: rgba(255,255,255,.12); border-color: #7fd0ff; }
#vor-vas-root .vas-emoji { font-size: 30px; line-height: 1; }
#vor-vas-root .vas-num { font-size: 16px; font-weight: 600; }
#vor-vas-root .vas-label { font-size: 11px; opacity: .8; }
`;

const SCALE = [
  { n: 0, emoji: '😀', label: '无' },
  { n: 2, emoji: '🙂', label: '轻微' },
  { n: 4, emoji: '😐', label: '有点' },
  { n: 6, emoji: '😟', label: '明显' },
  { n: 8, emoji: '😣', label: '严重' },
  { n: 10, emoji: '😵', label: '最严重' },
];

const QUESTIONS = [
  { key: 'dizzy', title: '头晕程度？', sub: '现在感觉有多晕？' },
  { key: 'nausea', title: '恶心程度？', sub: '现在感觉有多恶心？' },
];

export class SymptomCheck {
  constructor(root = document.body) {
    if (!document.getElementById('vor-vas-style')) {
      const st = document.createElement('style');
      st.id = 'vor-vas-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.id = 'vor-vas-root';
    this.root.innerHTML = `
      <div class="vas-panel">
        <div class="vas-title"></div>
        <div class="vas-sub"></div>
        <div class="vas-grid"></div>
      </div>`;
    root.appendChild(this.root);
    this._panel = this.root.querySelector('.vas-panel');
    this._title = this.root.querySelector('.vas-title');
    this._sub = this.root.querySelector('.vas-sub');
    this._grid = this.root.querySelector('.vas-grid');
  }

  // 依次问头晕 + 恶心，返回 {dizzy, nausea}
  collect() {
    return new Promise((resolve) => {
      const answers = {};
      const ask = (idx) => {
        const q = QUESTIONS[idx];
        this._title.textContent = q.title;
        this._sub.textContent = q.sub;
        this._grid.innerHTML = '';
        SCALE.forEach((s) => {
          const b = document.createElement('button');
          b.className = 'vas-btn';
          b.innerHTML = `<span class="vas-emoji">${s.emoji}</span>` +
            `<span class="vas-num">${s.n}</span>` +
            `<span class="vas-label">${s.label}</span>`;
          b.onclick = () => {
            answers[q.key] = s.n;
            if (idx + 1 < QUESTIONS.length) ask(idx + 1);
            else { this.hide(); resolve(answers); }
          };
          this._grid.appendChild(b);
        });
        this.show();
      };
      ask(0);
    });
  }

  // 加重判定：任一项加重 > stopDelta → 当日终止；>= downgradeDelta → 下次降档
  static evaluate(pre, post, { stopDelta = 2, downgradeDelta = 1 } = {}) {
    const pre2 = pre || { dizzy: 0, nausea: 0 };
    const post2 = post || { dizzy: 0, nausea: 0 };
    const dizzyDelta = (post2.dizzy || 0) - (pre2.dizzy || 0);
    const nauseaDelta = (post2.nausea || 0) - (pre2.nausea || 0);
    const maxDelta = Math.max(dizzyDelta, nauseaDelta);
    return {
      dizzyDelta, nauseaDelta, maxDelta,
      stop: maxDelta > stopDelta,
      downgrade: maxDelta >= downgradeDelta,
    };
  }

  show() { this.root.style.display = 'flex'; }
  hide() { this.root.style.display = 'none'; }
  destroy() { this.root.remove(); }
}
