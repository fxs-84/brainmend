// 太空3D飞行（Three.js 真3D重写）— 接入游戏选择面板
// 无缝替换旧 2D 伪3D 入口：沿用面板原生 `.scene-btn[data-scene="space3d"]`，不注入新按钮；
// 拦截开始按钮（document capture 阶段，先于 bundle 的目标阶段监听器）→ 弹自家难度浮层 → 启动引擎。
// 陀螺仪数据直接读主游戏的 window.D（bundle 的 BLE/DeviceOrientation 管道已在采集）
import { bootSpace3D } from './game.js';

(function () {
  let game = null;
  let backBtn = null;
  let diffOverlay = null;
  let page2WasVisible = false;

  function start(diff) {
    if (game) return;
    // 隐藏 2D canvas、面板与首页覆盖层（#page2 z-index:10000，bundle 正常开始游戏时也会隐藏它）
    const canvas2d = document.getElementById('crosshair-canvas');
    if (canvas2d) canvas2d.style.display = 'none';
    const panel = document.getElementById('game-select-panel');
    if (panel) panel.style.display = 'none';
    const p2 = document.getElementById('page2');
    page2WasVisible = p2 ? p2.style.display !== 'none' : false;
    if (p2) p2.style.display = 'none';
    if (window.gameEngine && window.gameEngine.pause) {
      try { window.gameEngine.pause(); } catch (e) { /* ignore */ }
    }
    game = bootSpace3D({
      container: document.body,
      difficulty: diff,
      gyroFeed: () => {
        const D = window.D;
        return (D && typeof D.yaw === 'number')
          ? { yaw: D.yaw, pitch: D.pitch || 0, roll: D.roll || 0 }
          : null;
      },
      onExit: stop,
    });
    showBackBtn();
  }

  function showBackBtn() {
    if (backBtn) return;
    backBtn = document.createElement('button');
    backBtn.id = 'space3d-back-btn';
    backBtn.textContent = '← 返回菜单';
    backBtn.style.cssText = 'position:fixed;top:52px;right:16px;z-index:1600;padding:8px 14px;background:rgba(0,0,0,.6);color:#fff;border:1px solid #334155;border-radius:6px;cursor:pointer;font-size:13px;';
    backBtn.onclick = stop;
    document.body.appendChild(backBtn);
  }

  function stop() {
    if (game) { game.stop(); game = null; }
    if (backBtn) { backBtn.remove(); backBtn = null; }
    if (diffOverlay) { diffOverlay.remove(); diffOverlay = null; }
    const canvas2d = document.getElementById('crosshair-canvas');
    if (canvas2d) canvas2d.style.display = 'block';
    const panel = document.getElementById('game-select-panel');
    if (panel) panel.style.display = 'block';
    const p2 = document.getElementById('page2');
    if (p2 && page2WasVisible) p2.style.display = 'flex';
  }

  // 难度浮层：fixed 全屏 rgba(0,0,0,.7) 底 + 深 slate 卡片 + 彩色描边按钮（data-d）
  function showDifficulty() {
    if (diffOverlay) return;
    diffOverlay = document.createElement('div');
    diffOverlay.id = 'space3d-diff-overlay';
    // z-index 必须压过 #game-select-panel(2000) 与 #page2(10000)，否则面板盖住难度浮层点不到
    diffOverlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#1E293B;border:1px solid #334155;border-radius:12px;padding:26px 30px;text-align:center;color:#fff;font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;';
    card.innerHTML = '<div style="font-size:18px;margin-bottom:6px;">🚀 太空3D飞行</div>' +
      '<div style="font-size:12px;opacity:.7;margin-bottom:18px;">选择难度（头控转向，躲陨石·吃水晶·穿越门）</div>';
    const btns = [
      ['easy', '🟢 简单', '#22c55e', '慢速 18 m/s'],
      ['normal', '🟡 普通', '#eab308', '标准 24 m/s'],
      ['hard', '🔴 困难', '#ef4444', '高速 30 m/s'],
    ];
    for (const [d, label, color, sub] of btns) {
      const b = document.createElement('button');
      b.dataset.d = d;
      b.innerHTML = `${label}<br><span style="font-size:10px;opacity:.65;">${sub}</span>`;
      b.style.cssText = `margin:4px 6px;padding:10px 16px;min-width:96px;background:#0F172A;color:#fff;` +
        `border:2px solid ${color};border-radius:8px;font-size:14px;cursor:pointer;`;
      b.addEventListener('click', () => {
        const el = diffOverlay;
        diffOverlay = null;
        if (el) el.remove();
        start(d);
      });
      card.appendChild(b);
    }
    diffOverlay.appendChild(card);
    // 点背板取消
    diffOverlay.addEventListener('click', (e) => {
      if (e.target === diffOverlay) { diffOverlay.remove(); diffOverlay = null; }
    });
    document.body.appendChild(diffOverlay);
  }

  // 拦截开始按钮：仅 selectedScene==='space3d' 时接管，其他场景照常走 bundle
  // 注：document capture 阶段触发，先于 bundle 绑在按钮上的目标阶段监听器（按钮同节点 capture
  //     不保证先于早注册的 bubble 监听器，document capture 则严格优先）
  function onStartClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('#start-game-btn') : null;
    if (!btn) return;
    if (window.gameUI && window.gameUI.selectedScene === 'space3d') {
      e.stopImmediatePropagation();
      e.preventDefault();
      showDifficulty();
    }
  }
  document.addEventListener('click', onStartClick, true);

  // 主游戏返回菜单时一并清理
  function hookBackBtns() {
    ['game-back-to-menu', 'back-btn-game'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && !btn._space3dHooked) {
        btn._space3dHooked = true;
        btn.addEventListener('click', () => stop(), true);
      }
    });
  }

  // 轮询等面板出现（与 runner/vor 的接入节奏一致）
  const timer = setInterval(() => {
    const panel = document.getElementById('game-select-panel');
    if (panel && panel.offsetParent) {
      hookBackBtns();
    }
  }, 300);
})();
