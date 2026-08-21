// 海风球道（头控跑酷）— 接入游戏选择面板
// 模式与 src/vor/integrate.js 一致：注入模式按钮 → 拦截开始按钮 → 启动游戏
// 陀螺仪数据直接读主游戏的 window.D（bundle 的 BLE/DeviceOrientation 管道已在采集）
import { bootRunner } from './game.js';

(function () {
  let game = null;
  let backBtn = null;
  let page2WasVisible = false;

  function start() {
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
    game = bootRunner({
      container: document.body,
      integrated: true,
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
    backBtn.id = 'runner-back-btn';
    backBtn.textContent = '← 返回菜单';
    backBtn.style.cssText = 'position:fixed;top:52px;right:16px;z-index:1600;padding:8px 14px;background:rgba(0,0,0,.6);color:#fff;border:1px solid #334155;border-radius:6px;cursor:pointer;font-size:13px;';
    backBtn.onclick = stop;
    document.body.appendChild(backBtn);
  }

  function stop() {
    if (game) { game.stop(); game = null; }
    if (backBtn) { backBtn.remove(); backBtn = null; }
    const canvas2d = document.getElementById('crosshair-canvas');
    if (canvas2d) canvas2d.style.display = 'block';
    const panel = document.getElementById('game-select-panel');
    if (panel) panel.style.display = 'block';
    const p2 = document.getElementById('page2');
    if (p2 && page2WasVisible) p2.style.display = 'flex';
  }

  // 注入按钮到游戏选择面板
  function injectButton() {
    const modeBtns = document.querySelectorAll('#game-select-panel .mode-btn');
    if (!modeBtns.length) return false;
    if (document.querySelector('.mode-btn[data-mode="runner"]')) return true;
    const anchor = document.querySelector('.mode-btn[data-mode="vorch1"]')
      || document.querySelector('.mode-btn[data-mode="vor"]')
      || modeBtns[modeBtns.length - 1];
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.dataset.mode = 'runner';
    btn.textContent = '🏖️ 海风球道 - 头控跑酷';
    // 与面板原生游戏按钮（公路赛车/射击模式等）同款内联样式：深 slate 卡片 + 白字
    // （此前透明背景+黑字，在深色面板上既看不清字又没有卡片背景，用户反馈两次）
    btn.style.cssText = 'padding:10px;border:2px solid transparent;border-radius:6px;background:#1E293B;color:#fff;cursor:pointer;text-align:left;';
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('#game-select-panel .mode-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = '';
      });
      btn.classList.add('active');
      btn.style.borderColor = 'var(--primary)';
      if (window.gameUI) window.gameUI.selectedMode = 'runner';
    }, true);
    return true;
  }

  // 拦截开始按钮：runner 模式启动海风球道而非 2D
  function hookStartBtn() {
    const startBtn = document.getElementById('start-game-btn');
    if (!startBtn || startBtn._runnerHooked) return;
    startBtn._runnerHooked = true;
    startBtn.addEventListener('click', (e) => {
      if (window.gameUI && window.gameUI.selectedMode === 'runner') {
        e.stopImmediatePropagation();
        e.preventDefault();
        start();
      }
    }, true);
  }

  // 主游戏返回菜单时一并清理
  function hookBackBtns() {
    ['game-back-to-menu', 'back-btn-game'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && !btn._runnerHooked) {
        btn._runnerHooked = true;
        btn.addEventListener('click', () => stop(), true);
      }
    });
  }

  // 轮询等面板出现
  const timer = setInterval(() => {
    const panel = document.getElementById('game-select-panel');
    if (panel && panel.offsetParent) {
      if (injectButton()) {
        hookStartBtn();
        hookBackBtns();
      }
    }
  }, 300);
})();
