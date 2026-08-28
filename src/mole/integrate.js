// 节拍打地鼠 — 接入游戏选择面板
// 模式与 src/vor/integrate.js 一致：注入模式按钮 → 拦截开始按钮 → 加载 molecule.html 启动游戏
// 陀螺仪数据: 自管 BLE / DeviceMotion / 模拟 (molecule.html 内部闭环, 不依赖主 bundle 的 window.D)
(function () {
  let game = null;
  let backBtn = null;
  let page2WasVisible = false;
  let injectedStyles = [];   // 注入的 <style> 节点, stop 时清理

  async function start() {
    if (game) return;
    // 隐藏主游戏 canvas/panel/page2 (与 VOR/runner 一致)
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
    // 创建一个 fixed 容器覆盖全屏 (与 VOR/runner 一致, 不依赖 #view-game 是否显示)
    const view = document.createElement('div');
    view.id = 'mole-game-view';
    view.style.cssText = 'position:fixed;inset:0;z-index:1500;overflow:auto;background:#0d1117;padding:8px;box-sizing:border-box;';
    document.body.appendChild(view);
    view.dataset.moleContainer = '1';
    try {
      const res = await fetch('./src/mole/molecule.html');
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      // 注入 CSS 到 <head>
      doc.querySelectorAll('style').forEach(s => {
        const ns = document.createElement('style');
        ns.textContent = s.textContent;
        document.head.appendChild(ns);
        injectedStyles.push(ns);
      });
      // 注入 body 内容到全屏容器
      view.innerHTML = doc.body.innerHTML;
      // DEBUG: 显式 verify 占位元素在 view 容器内 (不靠 getElementById, 靠 querySelector)
      const sStd = view.querySelector('#s-std');
      const vNoise = view.querySelector('#v-noise');
      const allIds = view.querySelectorAll('[id]').length;
      // 执行脚本 (IIFE 包裹 + try-catch 防御; 末尾把游戏需要的函数挂到 window 供 integrate 调)
      const scripts = doc.querySelectorAll('script');
      for (const s of scripts) {
        const code = s.textContent;
        const exportTail = '\n;try{window.startMetronome=startMetronome;window.stopMetronome=stopMetronome;window.stopAll=stopAll;window.startSim=startSim;window.startMotion=startMotion;window.startBle=startBle;window.startHost=startHost;window.resetStats=resetStats;window.MOLE_GAME=window.MOLE_GAME||new MoleGame();}catch(e){console.warn("[mole] export:",e.message);}';
        const wrapped = '(function(){try{' + code + exportTail + '}catch(e){console.error("[mole] init error:",e.message);throw e;}})();';
        try { new Function(wrapped).call(window); } catch (e) { console.warn('[mole] script load failed:', e.message); }
      }
      // canvas 已可见, 触发 resize 重算尺寸
      if (window.MOLE_GAME && typeof window.MOLE_GAME.resize === 'function') window.MOLE_GAME.resize();
      game = window.MOLE_GAME;
      // 节拍器由 molecule.html 的 BPM picker 控制 (选完点"开始"才启动), integrate 不自动启
      showBackBtn();
    } catch (e) {
      console.error('加载打地鼠失败:', e);
      stop();
    }
  }

  function showBackBtn() {
    if (backBtn) return;
    backBtn = document.createElement('button');
    backBtn.id = 'mole-back-btn';
    backBtn.textContent = '← 返回菜单';
    backBtn.style.cssText = 'position:fixed;top:52px;right:16px;z-index:1600;padding:8px 14px;background:rgba(0,0,0,.6);color:#fff;border:1px solid #334155;border-radius:6px;cursor:pointer;font-size:13px;';
    backBtn.onclick = stop;
    document.body.appendChild(backBtn);
  }

  function stop() {
    // 清理 MoleGame
    if (game) {
      try { if (typeof game.stop === 'function') game.stop(); } catch (e) {}
      // 关闭 BLE / DeviceMotion / 模拟 / 节拍器
      try { if (typeof stopAll === 'function') stopAll(); } catch (e) {}
      try { if (typeof stopMetronome === 'function') stopMetronome(); } catch (e) {}
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
      game = null;
      window.MOLE_GAME = null;
    }
    if (backBtn) { backBtn.remove(); backBtn = null; }
    // 移除游戏全屏容器
    const view = document.getElementById('mole-game-view');
    if (view) view.remove();
    // 清理注入的 styles
    for (const ns of injectedStyles) { try { ns.remove(); } catch (e) {} }
    injectedStyles = [];
    // 恢复主页面
    const canvas2d = document.getElementById('crosshair-canvas');
    if (canvas2d) canvas2d.style.display = 'block';
    const panel = document.getElementById('game-select-panel');
    if (panel) panel.style.display = 'block';
    const p2 = document.getElementById('page2');
    if (p2 && page2WasVisible) p2.style.display = 'flex';
  }

  function injectButton() {
    const modeBtns = document.querySelectorAll('#game-select-panel .mode-btn');
    if (!modeBtns.length) return false;
    if (document.querySelector('.mode-btn[data-mode="mole"]')) return true;
    // 锚点: 优先挂在 VOR/runner 等已注入按钮之后, 否则挂最后一个原生按钮后
    const anchor = document.querySelector('.mode-btn[data-mode="runner"]')
                || document.querySelector('.mode-btn[data-mode="vorch1"]')
                || document.querySelector('.mode-btn[data-mode="vor"]')
                || document.querySelector('.mode-btn[data-mode="game"]')
                || modeBtns[modeBtns.length - 1];
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.dataset.mode = 'mole';
    btn.textContent = '🐹 节拍打地鼠 (肢体节律训练)';
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
      if (window.gameUI) window.gameUI.selectedMode = 'mole';
    }, true);
    return true;
  }

  function hookStartBtn() {
    const startBtn = document.getElementById('start-game-btn');
    if (!startBtn || startBtn._moleHooked) return;
    startBtn._moleHooked = true;
    startBtn.addEventListener('click', (e) => {
      if (window.gameUI && window.gameUI.selectedMode === 'mole') {
        e.stopImmediatePropagation();
        e.preventDefault();
        start();
      }
    }, true);
  }

  function hookBackBtns() {
    ['game-back-to-menu', 'back-btn-game'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && !btn._moleHooked) {
        btn._moleHooked = true;
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
