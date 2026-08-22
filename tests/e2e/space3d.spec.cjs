// 太空3D飞行 E2E：真实面板流程（scene-btn[space3d] → 难度浮层 → 引擎 boot）+
// 头控跟随 / 死区 / 生成回收 / 水晶 / 撞陨石+无敌 / 3命 GAMEOVER / 返回恢复面板 / 无 JS 错误
// 用法：node tests/e2e/space3d.spec.cjs（自起静态服务器，端口 4399；已被占用则复用）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 4399;
const URL = `http://localhost:${PORT}/index.html?norender=1&bloom=0`;

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => {
    server.stdout.once('data', r);
    server.once('exit', r);            // 端口已被占用：复用现有服务器
    setTimeout(r, 3000);
  });

  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // --- 真实面板流程：游戏模式 → 太空3D飞行场景 → 开始 → 难度浮层 ---
    console.log('1) 面板流程 + 难度浮层拦截');
    await page.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelector('.scene-btn[data-scene="space3d"]').click());
    await page.waitForTimeout(300);
    const sel = await page.evaluate(() => window.gameUI && window.gameUI.selectedScene);
    assert('场景按钮选中 space3d', sel === 'space3d', `selectedScene=${sel}`);
    await page.evaluate(() => document.getElementById('start-game-btn').click());
    await page.waitForTimeout(500);
    const diffShown = await page.evaluate(() => !!document.getElementById('space3d-diff-overlay'));
    assert('弹出自家难度浮层', diffShown);
    const oldEngine = await page.evaluate(() => !!window.spaceEngine);
    assert('旧 2D 引擎未启动', !oldEngine);
    // 难度按钮：必须 evaluate DOM 点击（Playwright 原生 click 会被拦）
    await page.evaluate(() => document.querySelector('button[data-d="normal"]').click());
    await page.waitForFunction(() => window.__space3d, null, { timeout: 10000 });
    assert('引擎 boot（window.__space3d）', true);
    assert('进入 playing', await page.evaluate(() => window.__space3d.state === 'playing'));
    assert('预铺生成物件（objCount>0）', await page.evaluate(() => window.__space3d.objCount > 0));
    // 立刻关自然生成并清场：后续判定全部确定性（预铺/自然物件会随机撞船/被躲，污染计数）
    await page.evaluate(() => {
      window.__space3d.spawner.autoSpawn = false;
      window.__space3d.spawner.clearAll();
    });

    // rAF 驱动陀螺仪（同时写 window.D 与注入通道；headless setInterval 节流，rAF 更稳）
    await page.evaluate(() => {
      window.__drive = { yaw: 0, pitch: 0 };
      const loop = () => {
        const d = window.__drive;
        window.D = { yaw: d.yaw, pitch: d.pitch, roll: 0 };
        window.updateFromGyroscope(window.D);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const setPose = (yaw, pitch) => page.evaluate(([y, p]) => { window.__drive.yaw = y; window.__drive.pitch = p; }, [yaw, pitch]);

    // --- 头控跟随 ---
    console.log('2) 头控映射（yaw ±35°→x ±10 / pitch ±22.5°→y ±6）');
    await setPose(17.5, 0); await page.waitForTimeout(900);
    const xR = await page.evaluate(() => window.__space3d.shipX);
    assert('yaw=+17.5（半幅）→ shipX ≈ +5', xR > 3, `shipX=${xR.toFixed(2)}`);
    await setPose(-17.5, 0); await page.waitForTimeout(900);
    const xL = await page.evaluate(() => window.__space3d.shipX);
    assert('yaw=-17.5 → shipX ≈ -5', xL < -3, `shipX=${xL.toFixed(2)}`);
    await setPose(0, 11.25); await page.waitForTimeout(900);
    const yU = await page.evaluate(() => window.__space3d.shipY);
    assert('pitch=+11.25（抬头）→ shipY ≈ +3', yU > 1.5, `shipY=${yU.toFixed(2)}`);
    await setPose(0, -11.25); await page.waitForTimeout(900);
    const yD = await page.evaluate(() => window.__space3d.shipY);
    assert('pitch=-11.25 → shipY ≈ -3', yD < -1.5, `shipY=${yD.toFixed(2)}`);
    await setPose(1.0, 0); await page.waitForTimeout(900);   // 死区内（<2.4°）应回中
    const xDz = await page.evaluate(() => Math.abs(window.__space3d.shipX));
    assert('死区 |yaw|<2.4° 回中（|shipX|<0.8）', xDz < 0.8, `|shipX|=${xDz.toFixed(2)}`);
    await setPose(0, 0); await page.waitForTimeout(800);

    // --- 生成 / 回收 / 躲陨石 ---
    console.log('3) 陨石生成回收 + 躲过 +50');
    const beforeD = await page.evaluate(() => ({ d: window.__space3d.dodges, b: window.__space3d.bonus }));
    assert('清场后 objCount=0', await page.evaluate(() => window.__space3d.objCount === 0));
    await page.evaluate(() => window.__space3d.debugSpawnMeteor(5, 5, -15));
    assert('debugSpawn 陨石 objCount=1', await page.evaluate(() => window.__space3d.objCount === 1));
    await page.waitForFunction(() => window.__space3d.objCount === 0, null, { timeout: 8000 });
    const dodge = await page.evaluate(() => ({ d: window.__space3d.dodges, b: window.__space3d.bonus }));
    assert('陨石飞过回收 + 躲过计 1 次 +50', dodge.d === beforeD.d + 1 && dodge.b === beforeD.b + 50,
      `Δdodges=${dodge.d - beforeD.d} Δbonus=${dodge.b - beforeD.b}`);

    // --- 水晶 +100 ---
    console.log('4) 水晶');
    const beforeC = await page.evaluate(() => ({ n: window.__space3d.crystals, b: window.__space3d.bonus }));
    await page.evaluate(() => window.__space3d.debugSpawnCrystal(0, 0, -15));
    await page.waitForFunction((n) => window.__space3d.crystals === n + 1, beforeC.n, { timeout: 8000 });
    const afterC = await page.evaluate(() => window.__space3d.bonus);
    assert('吃水晶 crystals+1 且 +100', afterC - beforeC.b === 100, `Δbonus=${afterC - beforeC.b}`);

    // --- 穿越门 +150 ---
    console.log('5) 穿越门');
    const beforeG = await page.evaluate(() => ({ n: window.__space3d.gates, b: window.__space3d.bonus }));
    await page.evaluate(() => window.__space3d.debugSpawnGate(0, 0, -15));
    await page.waitForFunction((n) => window.__space3d.gates === n + 1, beforeG.n, { timeout: 8000 });
    const afterG = await page.evaluate(() => window.__space3d.bonus);
    assert('穿过门 gates+1 且 +150', afterG - beforeG.b === 150, `Δbonus=${afterG - beforeG.b}`);

    // --- 撞陨石扣命 + 无敌 ---
    console.log('6) 撞击 + 无敌');
    const beforeH = await page.evaluate(() => window.__space3d.hearts);
    await page.evaluate(() => window.__space3d.debugSpawnMeteor(0, 0, -15));
    await page.waitForFunction((h) => window.__space3d.hearts === h - 1, beforeH, { timeout: 8000 });
    assert('撞陨石 hearts 3→2', true);
    await page.evaluate(() => window.__space3d.debugSpawnMeteor(0, 0, -8));   // 无敌期内再来一颗
    await page.waitForTimeout(1500);
    const heartsInv = await page.evaluate(() => window.__space3d.hearts);
    assert('无敌期内再撞不扣命', heartsInv === beforeH - 1, `hearts=${heartsInv}`);
    await page.evaluate(() => window.__space3d.setInvincible(0));

    // --- 返回按钮恢复面板 ---
    console.log('7) 返回菜单');
    await page.evaluate(() => document.getElementById('space3d-back-btn').click());
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => ({
      panel: document.getElementById('game-select-panel').style.display,
      api: !!window.__space3d,
      backBtn: !!document.getElementById('space3d-back-btn'),
    }));
    assert('返回后面板恢复显示', restored.panel !== 'none', `display=${restored.panel}`);
    assert('引擎已销毁（__space3d=null、返回按钮移除）', !restored.api && !restored.backBtn);

    // --- 再次进入：3 命 GAMEOVER ---
    console.log('8) 3 命 GAMEOVER');
    await page.evaluate(() => document.getElementById('start-game-btn').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('button[data-d="normal"]').click());
    await page.waitForFunction(() => window.__space3d, null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__space3d.spawner.autoSpawn = false;
      window.__space3d.spawner.clearAll();
    });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__space3d.debugSpawnMeteor(0, 0, -15));
      await page.waitForFunction((h) => window.__space3d.hearts === 2 - h || window.__space3d.state === 'gameover',
        i, { timeout: 8000 });
      await page.evaluate(() => window.__space3d.setInvincible(0));
    }
    await page.waitForFunction(() => window.__space3d.state === 'gameover', null, { timeout: 5000 });
    const over = await page.evaluate(() => ({
      display: document.querySelector('#space3d-hud-root #shud-overlay').style.display,
      best: localStorage.getItem('space3d_best'),
    }));
    assert('3 命扣完进入 GAMEOVER 浮层', over.display === 'flex', `display=${over.display}`);
    assert('localStorage 写入 space3d_best', over.best !== null, `best=${over.best}`);
    // 任意键/点击返回面板
    await page.evaluate(() => document.querySelector('#space3d-hud-root #shud-overlay').click());
    await page.waitForTimeout(400);
    const back2 = await page.evaluate(() => ({
      panel: document.getElementById('game-select-panel').style.display,
      api: !!window.__space3d,
    }));
    assert('GAMEOVER 点击后恢复面板、引擎销毁', back2.panel !== 'none' && !back2.api);

    await page.close();

    console.log('9) 控制台/页面错误');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(1); });
