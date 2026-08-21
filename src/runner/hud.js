// 海风球道 · HUD（DOM 屏幕层，深色半透明风格，镜像 src/vor/hud.js 的写法）
// 自挂载：样式与 DOM 均由本模块注入，可在 runner.html 或主游戏页面（index.html）内使用
const CSS = `
#runner-hud-root .rhud { position: fixed; z-index: 1510; pointer-events: none; opacity: .95;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; color: #eaf3fb; }
#runner-hud-root #rhud-top { top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 18px; align-items: center; background: rgba(8,14,26,.55);
  padding: 8px 18px; border-radius: 10px; font-size: 15px; border: 1px solid rgba(120,160,220,.22);
  white-space: nowrap; }
#runner-hud-root #rhud-hearts { color: #ff6b6b; letter-spacing: 2px; }
#runner-hud-root #rhud-flash { inset: 0; background: rgba(220,50,50,.38); opacity: 0;
  transition: opacity .35s ease-out; z-index: 1515; }
#runner-hud-root #rhud-overlay { inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(6,10,20,.82); z-index: 1530; pointer-events: auto; }
#runner-hud-root #rhud-overlay .panel { max-width: 480px; text-align: center; padding: 28px;
  background: rgba(20,30,52,.95); border: 1px solid rgba(120,160,220,.25); border-radius: 14px; }
#runner-hud-root #rov-title { font-size: 22px; margin-bottom: 12px; }
#runner-hud-root #rov-sub { font-size: 14px; line-height: 1.8; opacity: .9; margin-bottom: 20px; }
#runner-hud-root #rov-btns button { margin: 4px 6px; padding: 10px 18px; font-size: 15px;
  border-radius: 8px; border: 1px solid rgba(140,180,240,.4); background: transparent;
  color: #eaf3fb; cursor: pointer; }
#runner-hud-root #rov-btns button.primary { background: #2b6cb0; border-color: #2b6cb0; }
#runner-hud-root #rov-btns button:hover { filter: brightness(1.2); }
`;

const MARKUP = `
<div class="rhud" id="rhud-top">
  <span id="rhud-hearts">❤❤❤</span>
  <span id="rhud-coins">🪙 0</span>
  <span id="rhud-score">分数 0</span>
  <span id="rhud-level">第 1 关 · 8.0 m/s</span>
</div>
<div class="rhud" id="rhud-flash"></div>
<div class="rhud" id="rhud-overlay">
  <div class="panel">
    <div id="rov-title"></div>
    <div id="rov-sub"></div>
    <div id="rov-btns"></div>
  </div>
</div>
`;

export class RunnerHUD {
  constructor(root = document.body) {
    if (!document.getElementById('runner-hud-style')) {
      const st = document.createElement('style');
      st.id = 'runner-hud-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.id = 'runner-hud-root';
    this.root.innerHTML = MARKUP;
    root.appendChild(this.root);
    const q = (id) => this.root.querySelector('#' + id);
    this.el = {
      hearts: q('rhud-hearts'),
      coins: q('rhud-coins'),
      score: q('rhud-score'),
      level: q('rhud-level'),
      flash: q('rhud-flash'),
      overlay: q('rhud-overlay'),
      ovTitle: q('rov-title'),
      ovSub: q('rov-sub'),
      ovBtns: q('rov-btns'),
    };
    this._flashTimer = 0;
  }

  // 顶部条：心 / 金币 / 分数 / 关卡·速度 + 道具状态（⚡加速 / 🧲磁吸 / 🛡护盾）
  setTop({ hearts, coins, score, level, speed, boostT = 0, magnetT = 0, shield = false }) {
    this.el.hearts.textContent = hearts > 0 ? '❤'.repeat(hearts) : '💔';
    this.el.coins.textContent = `🪙 ${coins}`;
    this.el.score.textContent = `分数 ${score}`;
    let fx = '';
    if (boostT > 0) fx += ` ⚡${boostT.toFixed(1)}s`;
    if (magnetT > 0) fx += ` 🧲${magnetT.toFixed(1)}s`;
    if (shield) fx += ' 🛡';
    this.el.level.textContent = `第 ${level} 关 · ${speed.toFixed(1)} m/s${fx}`;
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

  // 中心飘字（吃金币/回中反馈），1 秒上飘淡出
  floatText(text, color = '#ffd977') {
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

  showOverlay(title, sub, buttons) {
    this.el.ovTitle.textContent = title;
    this.el.ovSub.innerHTML = sub || '';
    this.el.ovBtns.innerHTML = '';
    (buttons || []).forEach(b => {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.className = b.primary ? 'primary' : '';
      btn.onclick = b.onClick;
      this.el.ovBtns.appendChild(btn);
    });
    this.el.overlay.style.display = 'flex';
  }

  hideOverlay() { this.el.overlay.style.display = 'none'; }

  destroy() {
    clearTimeout(this._flashTimer);
    this.root.remove();
  }
}
