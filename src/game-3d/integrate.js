// 公路赛车 3D — 接入康复游戏选择面板
// 在 game-select-panel 里加"公路赛车 3D"按钮，启动 Road3DEngine（WebGL）
// 与 2D 引擎共享 setGyroInput 模式, 通过 window.state 读陀螺仪数据
import { Road3DEngine } from './engine.js';

(function () {
  let engine3d = null;
  let container = null;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'road3d-container';
      document.body.appendChild(container);
    }
    return container;
  }

  async function start3D() {
    const c = getContainer();
    if (!engine3d) {
      engine3d = new Road3DEngine();
      engine3d.onReturnToMenu = stop3D;
      engine3d.init(c);
      window.road3dEngine = engine3d;
    }
    // 隐藏 2D canvas 和面板
    const canvas2d = document.getElementById('crosshair-canvas');
    if (canvas2d) canvas2d.style.display = 'none';
    const panel = document.getElementById('game-select-panel');
    if (panel) panel.style.display = 'none';
    // 停掉 2D 引擎
    if (window.gameEngine && window.gameEngine.pause) {
      try { window.gameEngine.pause(); } catch (e) {}
    }
    await engine3d.start();
    // 显示返回按钮
    show3DBackBtn();
  }

  // 陀螺仪: 与 2D 引擎完全相同的 setInterval 模式
  // bundle 在同一 setInterval 里给 valleyEngine/spaceEngine 喂 D.pitch/D.yaw/D.roll
  // 我们也读同一个 D, 喂给 Road3DEngine
  setInterval(() => {
    if (!engine3d || !engine3d.state || engine3d.state.running === false) return;
    try {
      const D = window.D;
      if (D && typeof D.pitch === 'number') {
        engine3d.setGyroInput(D.pitch, D.yaw || 0, D.roll || 0);
      }
    } catch (e) { /* 忽略 */ }
  }, 16);

  function show3DBackBtn() {
    if (document.getElementById('road3d-back-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'road3d-back-btn';
    btn.textContent = '← 返回菜单';
    btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:1600;padding:8px 14px;background:rgba(0,0,0,.6);color:#fff;border:1px solid #334155;border-radius:6px;cursor:pointer;font-size:13px;';
    btn.onclick = stop3D;
    document.body.appendChild(btn);
  }

  function stop3D() {
    if (engine3d) engine3d.stop();
    const btn = document.getElementById('road3d-back-btn');
    if (btn) btn.remove();
    const canvas2d = document.getElementById('crosshair-canvas');
    if (canvas2d) canvas2d.style.display = 'block';
    const panel = document.getElementById('game-select-panel');
    if (panel) panel.style.display = 'block';
  }

  // 注入按钮到游戏选择面板
  function injectButton() {
    // 找模式按钮容器（mode-btn 的父级）
    const modeBtns = document.querySelectorAll('#game-select-panel .mode-btn');
    if (!modeBtns.length) return false;
    // 已注入跳过
    if (document.querySelector('.mode-btn[data-mode="road3d"]')) return true;
    const roadBtn = document.querySelector('.mode-btn[data-mode="road"]');
    if (!roadBtn) return false;
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.dataset.mode = 'road3d';
    btn.textContent = '🏍️ 公路赛车 3D - 第一视角';
    btn.style.cssText = roadBtn.style.cssText || '';
    roadBtn.parentNode.insertBefore(btn, roadBtn.nextSibling);

    // 点击 3D 按钮：不走 2D 流程，直接启动 3D
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 标记选中样式
      document.querySelectorAll('#game-select-panel .mode-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = '';
      });
      btn.classList.add('active');
      btn.style.borderColor = 'var(--primary)';
      if (window.gameUI) window.gameUI.selectedMode = 'road3d';
    }, true);
    return true;
  }

  // 拦截开始按钮：如果是 3D 模式，启动 3D 而非 2D
  function hookStartBtn() {
    const startBtn = document.getElementById('start-game-btn');
    if (!startBtn || startBtn._road3dHooked) return;
    startBtn._road3dHooked = true;
    startBtn.addEventListener('click', (e) => {
      if (window.gameUI && window.gameUI.selectedMode === 'road3d') {
        e.stopImmediatePropagation();
        e.preventDefault();
        start3D();
      }
    }, true);
  }

  // 返回菜单时清理 3D
  function hookBackBtns() {
    ['game-back-to-menu', 'back-btn-game'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && !btn._road3dHooked) {
        btn._road3dHooked = true;
        btn.addEventListener('click', () => {
          if (engine3d) engine3d.cleanup();
          if (container) container.style.display = 'none';
        }, true);
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
