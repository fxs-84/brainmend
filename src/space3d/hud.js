// 太空3D飞行 · HUD（DOM 屏幕层，深色半透明风格，镜像 src/runner/hud.js 的写法）
// 自挂载：样式与 DOM 均由本模块注入；顶条在左上（runner 是顶部居中）
const CSS = `
#space3d-hud-root .shud { position: fixed; z-index: 1510; pointer-events: none; opacity: .95;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; color: #eaf3fb; }
#space3d-hud-root #shud-top { top: 12px; left: 16px;
  display: flex; gap: 18px; align-items: center; background: rgba(8,14,26,.55);
  padding: 8px 18px; border-radius: 10px; font-size: 15px; border: 1px solid rgba(120,160,220,.22);
  white-space: nowrap; }
#space3d-hud-root #shud-hearts { color: #ff6b6b; letter-spacing: 2px; }
#space3d-hud-root #shud-flash { inset: 0; background: rgba(220,50,50,.38); opacity: 0;
  transition: opacity .35s ease-out; z-index: 1515; }
#space3d-hud-root #shud-overlay { inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(6,10,20,.82); z-index: 1530; pointer-events: auto; cursor: pointer; }
#space3d-hud-root #shud-overlay .panel { max-width: 480px; text-align: center; padding: 28px;
  background: rgba(20,30,52,.95); border: 1px solid rgba(120,160,220,.25); border-radius: 14px; }
#space3d-hud-root #sov-title { font-size: 22px; margin-bottom: 12px; }
#space3d-hud-root #sov-sub { font-size: 14px; line-height: 1.8; opacity: .9; }
`;

const MARKUP = `
<div class="shud" id="shud-top">
  <span id="shud-hearts">❤❤❤</span>
  <span id="shud-score">分数 0</span>
  <span id="shud-time">0.0s</span>
  <span id="shud-speed">24.0 m/s</span>
</div>
<div class="shud" id="shud-flash"></div>
<div class="shud" id="shud-overlay">
  <div class="panel">
    <div id="sov-title"></div>
    <div id="sov-sub"></div>
  </div>
</div>
`;

export class SpaceHUD {
  constructor(root = document.body) {
    if (!document.getElementById('space3d-hud-style')) {
      const st = document.createElement('style');
      st.id = 'space3d-hud-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.id = 'space3d-hud-root';
    this.root.innerHTML = MARKUP;
    root.appendChild(this.root);
    const q = (id) => this.root.querySelector('#' + id);
    this.el = {
      hearts: q('shud-hearts'),
      score: q('shud-score'),
      time: q('shud-time'),
      speed: q('shud-speed'),
      flash: q('shud-flash'),
      overlay: q('shud-overlay'),
      ovTitle: q('sov-title'),
      ovSub: q('sov-sub'),
    };
    this._flashTimer = 0;
  }

  setTop({ hearts, score, aliveT, speed }) {
    this.el.hearts.textContent = hearts > 0 ? '❤'.repeat(hearts) : '💔';
    this.el.score.textContent = `分数 ${score}`;
    this.el.time.textContent = `${aliveT.toFixed(1)}s`;
    this.el.speed.textContent = `${speed.toFixed(1)} m/s`;
  }

  // 受击红闪（全屏红一下淡出，可连续触发）
  flashRed() {
    this.el.flash.style.transition = 'none';
    this.el.flash.style.opacity = '1';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.el.flash.style.transition = 'opacity .35s ease-out';
      this.el.flash.style.opacity = '0';
    }, 60);
  }

  // 中心飘字（吃水晶/过门/躲陨石反馈），1 秒上飘淡出
  floatText(text, color = '#7fe8ff') {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `position:fixed;left:50%;top:58%;transform:translate(-50%,0);z-index:1522;pointer-events:none;` +
      `font-size:22px;font-weight:600;color:${color};text-shadow:0 0 12px rgba(0,0,0,.6);` +
      `transition:transform 1s ease-out,opacity 1s ease-out;opacity:1;`;
    this.root.appendChild(d);
    requestAnimationFrame(() => {
      d.style.transform = 'translate(-50%,-60px)';
      d.style.opacity = '0';
    });
    setTimeout(() => d.remove(), 1100);
  }

  showOverlay(title, sub) {
    this.el.ovTitle.textContent = title;
    this.el.ovSub.innerHTML = sub || '';
    this.el.overlay.style.display = 'flex';
  }

  hideOverlay() { this.el.overlay.style.display = 'none'; }

  destroy() {
    clearTimeout(this._flashTimer);
    this.root.remove();
  }
}
