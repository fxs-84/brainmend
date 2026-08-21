// HUD（3.5，DOM 屏幕层，半透明，不遮挡核心光球）
// 自挂载：样式与 DOM 均由本模块注入，可在 vor.html 或主游戏页面（index.html）内使用
const CSS = `
#vor-hud-root .hud { position: fixed; z-index: 1510; pointer-events: none; opacity: .92;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; color: #dfe9f2; }
#vor-hud-root #hud-angle { top: 14px; left: 50%; transform: translateX(-50%); width: min(60vw, 560px); }
#vor-hud-root #hud-angle-bar { position: relative; height: 10px; background: rgba(255,255,255,.12); border-radius: 5px; overflow: hidden; }
#vor-hud-root #hud-angle-zone { position: absolute; top: 0; bottom: 0; background: rgba(80,200,140,.28); }
#vor-hud-root #hud-angle-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; background: rgba(255,255,255,.5); transform: translateX(-1px); }
#vor-hud-root .hud-cursor { position: absolute; top: -4px; width: 4px; height: 18px; border-radius: 2px; background: #35d0d8; transform: translateX(-2px); transition: background .15s; }
#vor-hud-root .hud-cursor.ok { background: #50c88c; }
#vor-hud-root .hud-cursor.over { background: #e0a040; }
#vor-hud-root #hud-angle-readout { text-align: center; font-size: 12px; margin-top: 4px; opacity: .8; }
#vor-hud-root #hud-smooth { left: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; }
#vor-hud-root .hud-lamp { width: 16px; height: 16px; border-radius: 50%; background: #666; box-shadow: 0 0 8px rgba(255,255,255,.2); }
#vor-hud-root .hud-lamp.ok { background: #50c88c; box-shadow: 0 0 10px #50c88c; }
#vor-hud-root .hud-lamp.warn { background: #e0c040; box-shadow: 0 0 10px #e0c040; }
#vor-hud-root .hud-lamp.bad { background: #e05050; box-shadow: 0 0 10px #e05050; }
#vor-hud-root #hud-lamp-text { font-size: 12px; opacity: .85; }
#vor-hud-root #hud-progress { top: 14px; right: 16px; font-size: 13px; background: rgba(0,0,0,.35); padding: 6px 10px; border-radius: 8px; }
#vor-hud-root #hud-block { top: 64px; left: 50%; transform: translateX(-50%); font-size: 14px; background: rgba(0,0,0,.35); padding: 6px 14px; border-radius: 8px; }
#vor-hud-root #rest-hint { inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 12px; background: rgba(11,16,32,.45); z-index: 1520; }
#vor-hud-root #rest-hint .ring { width: 90px; height: 90px; border-radius: 50%; border: 3px solid rgba(159,216,255,.6); animation: vor-breathe 4s ease-in-out infinite; }
@keyframes vor-breathe { 0%,100% { transform: scale(1); opacity:.5; } 50% { transform: scale(1.25); opacity:1; } }
#vor-hud-root #rest-hint div { font-size: 18px; }
#vor-hud-root #overlay { inset: 0; display: none; align-items: center; justify-content: center; background: rgba(6,10,20,.82); z-index: 1530; pointer-events: auto; }
#vor-hud-root #overlay .panel { max-width: 480px; text-align: center; padding: 28px; background: rgba(20,30,52,.95); border: 1px solid rgba(120,160,220,.25); border-radius: 14px; }
#vor-hud-root #ov-title { font-size: 22px; margin-bottom: 12px; }
#vor-hud-root #ov-sub { font-size: 14px; line-height: 1.8; opacity: .9; margin-bottom: 20px; }
#vor-hud-root #ov-btns button { margin: 4px 6px; padding: 10px 18px; font-size: 15px; border-radius: 8px; border: 1px solid rgba(140,180,240,.4); background: transparent; color: #dfe9f2; cursor: pointer; }
#vor-hud-root #ov-btns button.primary { background: #2b6cb0; border-color: #2b6cb0; }
#vor-hud-root #ov-btns button:hover { filter: brightness(1.2); }
#vor-hud-root #btn-unwell { position: fixed; bottom: 16px; right: 16px; z-index: 1525; pointer-events: auto; padding: 8px 14px; font-size: 13px; border-radius: 8px; border: 1px solid rgba(224,80,80,.5); background: rgba(80,20,20,.5); color: #f0c0c0; cursor: pointer; }
#vor-hud-root #hud-bird { top: 64px; right: 16px; width: 56px; height: 56px; background: rgba(0,0,0,.35); border: 1px solid rgba(120,160,220,.25); border-radius: 10px; padding: 4px; box-sizing: border-box; }
#vor-hud-root #hud-bird svg { display: block; width: 100%; height: 100%; }
`;

const MARKUP = `
<div class="hud" id="hud-angle">
  <div id="hud-angle-bar">
    <div id="hud-angle-zone"></div>
    <div id="hud-angle-mid"></div>
    <div class="hud-cursor" id="hud-angle-cursor" style="left:50%"></div>
  </div>
  <div id="hud-angle-readout">0.0°</div>
</div>
<div class="hud" id="hud-smooth">
  <div class="hud-lamp idle" id="hud-lamp"></div>
  <span id="hud-lamp-text">判定暂停</span>
</div>
<div class="hud" id="hud-progress">修复 0/20 · 完美周期 0</div>
<div class="hud" id="hud-bird">
  <svg viewBox="0 0 64 64">
    <defs><clipPath id="vor-bird-clip"><path d="M32 12 C 40 12 46 18 46 26 C 46 30 44 34 42 36 L 56 30 C 52 38 48 42 44 44 C 44 52 38 56 32 56 C 26 56 20 52 20 44 C 16 42 12 38 8 30 L 22 36 C 20 34 18 30 18 26 C 18 18 24 12 32 12 Z"/></clipPath></defs>
    <path d="M32 12 C 40 12 46 18 46 26 C 46 30 44 34 42 36 L 56 30 C 52 38 48 42 44 44 C 44 52 38 56 32 56 C 26 56 20 52 20 44 C 16 42 12 38 8 30 L 22 36 C 20 34 18 30 18 26 C 18 18 24 12 32 12 Z" fill="rgba(127,208,255,0.12)" stroke="#5a7a9a" stroke-width="2" stroke-linejoin="round"/>
    <g clip-path="url(#vor-bird-clip)"><rect id="hud-bird-fill" x="0" y="64" width="64" height="0" fill="#7fd0ff"/></g>
  </svg>
</div>
<div class="hud" id="hud-block">待开始</div>
<button id="btn-unwell">我不舒服</button>
<div class="hud" id="rest-hint">
  <div class="ring"></div>
  <div>放松，目视前方，深呼吸</div>
</div>
<div class="hud" id="overlay">
  <div class="panel">
    <div id="ov-title"></div>
    <div id="ov-sub"></div>
    <div id="ov-btns"></div>
  </div>
</div>
`;

export class HUD {
  constructor(root = document.body) {
    if (!document.getElementById('vor-hud-style')) {
      const st = document.createElement('style');
      st.id = 'vor-hud-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.id = 'vor-hud-root';
    this.root.innerHTML = MARKUP;
    root.appendChild(this.root);
    const q = (id) => this.root.querySelector('#' + id);
    this.el = {
      cursor: q('hud-angle-cursor'),
      zone: q('hud-angle-zone'),
      readout: q('hud-angle-readout'),
      lamp: q('hud-lamp'),
      lampText: q('hud-lamp-text'),
      progress: q('hud-progress'),
      block: q('hud-block'),
      overlay: q('overlay'),
      ovTitle: q('ov-title'),
      ovSub: q('ov-sub'),
      ovBtns: q('ov-btns'),
      rest: q('rest-hint'),
      unwell: q('btn-unwell'),
      birdFill: q('hud-bird-fill'),
    };
  }

  // 顶部角度条：中线 0°，目标区 ±amp，超限变红
  setAngle(yaw, limit, amp) {
    const pct = 50 + (yaw / limit) * 50;
    this.el.cursor.style.left = pct + '%';
    this.el.cursor.className = 'hud-cursor ' + (Math.abs(yaw) > limit * 0.95 ? 'over' : (Math.abs(yaw) >= amp - 2 ? 'ok' : ''));
    this.el.zone.style.left = (50 - (amp / limit) * 50) + '%';
    this.el.zone.style.width = ((amp / limit) * 100) + '%';
    this.el.readout.textContent = yaw.toFixed(1) + '°';
  }

  // 平滑度灯：judging 时才判定颜色
  setLamp(isSmooth, rms, threshold, judging) {
    const c = !judging ? 'idle' : (isSmooth ? 'ok' : (rms < 2 * threshold ? 'warn' : 'bad'));
    this.el.lamp.className = 'hud-lamp ' + c;
    this.el.lampText.textContent = judging ? `α ${rms.toFixed(0)}/${threshold.toFixed(0)}` : '判定暂停';
  }

  setProgress(repaired, segs, hits, combo) {
    this.el.progress.textContent = `修复 ${repaired}/${segs} · 命中 ${hits}` + (combo >= 2 ? ` · 连击 x${combo}` : '');
    // 鸟形图标填充度 = 修复进度（0~100%，从断口根部向上填）
    if (this.el.birdFill) {
      const p = segs ? Math.min(1, repaired / segs) : 0;
      this.el.birdFill.setAttribute('y', String(64 - 64 * p));
      this.el.birdFill.setAttribute('height', String(64 * p));
    }
  }

  // 中心飘字（命中/质量反馈），1 秒上飘淡出
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

  setBlock(state, block, total) {
    const label = { idle: '待开始', active: '训练中', rest: '休息', done: '完成' }[state] || state;
    this.el.block.textContent = state === 'idle' ? '待开始'
      : state === 'done' ? '训练完成'
      : `${label} · 第 ${block}/${total} 块`;
    this.el.rest.style.display = state === 'rest' ? 'flex' : 'none';
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

  destroy() { this.root.remove(); }
}
