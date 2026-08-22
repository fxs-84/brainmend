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
    // 立刻关自然生成+自动开火并清场：后续判定全部确定性（预铺/自然物件、弹丸击碎会污染计数）
    await page.evaluate(() => {
      window.__space3d.spawner.autoSpawn = false;
      window.__space3d.setAutoFire(false);
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
    // 等零点采样窗（20 帧均值）完成再驱动，消除通道启动延迟的竞态
    await page.waitForFunction(() => window.__space3d.zeroed, null, { timeout: 10000 });
    await setPose(0, 0); await page.waitForTimeout(300);

    // --- 头控跟随 ---
    console.log('2) 头控映射（yaw ±20°→x ±10 / pitch ±16°→y ±6，抬头=负值→上升）');
    await setPose(10, 0); await page.waitForTimeout(900);
    const xR = await page.evaluate(() => window.__space3d.shipX);
    assert('yaw=+10（半幅）→ shipX ≈ +5', xR > 3, `shipX=${xR.toFixed(2)}`);
    await setPose(-10, 0); await page.waitForTimeout(900);
    const xL = await page.evaluate(() => window.__space3d.shipX);
    assert('yaw=-10 → shipX ≈ -5', xL < -3, `shipX=${xL.toFixed(2)}`);
    await setPose(0, -8); await page.waitForTimeout(900);   // D 通道抬头=负值
    const yU = await page.evaluate(() => window.__space3d.shipY);
    assert('pitch=-8（抬头）→ shipY ≈ +3（上升）', yU > 1.5, `shipY=${yU.toFixed(2)}`);
    await setPose(0, 8); await page.waitForTimeout(900);
    const yD = await page.evaluate(() => window.__space3d.shipY);
    assert('pitch=+8（低头）→ shipY ≈ -3（下降）', yD < -1.5, `shipY=${yD.toFixed(2)}`);
    await setPose(1.0, 0); await page.waitForTimeout(900);   // 死区内（<2.4°）应回中
    const dzInfo = await page.evaluate(() => ({ x: Math.abs(window.__space3d.shipX), oy: +window.__space3d.input.offset.yaw.toFixed(2), ry: +window.__space3d.input.raw.yaw.toFixed(2) }));
    const xDz = dzInfo.x;
    assert('死区 |yaw|<2.4° 回中（|shipX|<0.8）', xDz < 0.8, `|shipX|=${xDz.toFixed(2)} offset=${dzInfo.oy} raw=${dzInfo.ry}`);
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

    // --- 敌舰：漏过 +50 / 撞玩家扣命 ---
    console.log('6b) 敌舰（漏过 +50 / 撞击扣命）');
    const beforeE = await page.evaluate(() => ({ d: window.__space3d.dodges, b: window.__space3d.bonus, n: window.__space3d.objCount }));
    await page.evaluate(() => window.__space3d.debugSpawnEnemy(5, 5, -15));
    assert('敌舰生成入列', await page.evaluate((n) => window.__space3d.objCount === n + 1, beforeE.n));
    await page.waitForFunction((d) => window.__space3d.dodges === d + 1, beforeE.d, { timeout: 8000 });
    const afterE = await page.evaluate(() => window.__space3d.bonus);
    assert('敌舰漏过按躲过 +50', afterE - beforeE.b === 50, `Δbonus=${afterE - beforeE.b}`);
    const heartsBE = await page.evaluate(() => window.__space3d.hearts);
    await page.evaluate(() => window.__space3d.debugSpawnEnemy(0, 0, -4));   // 贴脸生成，弹丸来不及拦
    await page.waitForFunction((h) => window.__space3d.hearts === h - 1, heartsBE, { timeout: 8000 });
    assert('敌舰撞玩家扣命', true, `hearts=${heartsBE}→${heartsBE - 1}`);
    await page.evaluate(() => window.__space3d.setInvincible(0));

    // --- 射击：自动开火 / 弹丸击毁敌舰 +200 / 击碎小陨石 +25 ---
    console.log('6c) 射击（自动开火 / 击毁 +200 / 击碎 +25）');
    await page.evaluate(() => {
      window.__space3d.spawner.clearAll();
      window.__space3d.setAutoFire(true);
    });
    const beforeS = await page.evaluate(() => ({ f: window.__space3d.fired, k: window.__space3d.kills, b: window.__space3d.bonus }));
    await page.evaluate(() => window.__space3d.debugSpawnEnemy(0, 0, -30));
    await page.waitForFunction((k) => window.__space3d.kills === k + 1, beforeS.k, { timeout: 8000 });
    const afterS = await page.evaluate(() => ({ f: window.__space3d.fired, b: window.__space3d.bonus, h: window.__space3d.hearts }));
    assert('自动开火存在（fired 递增）', afterS.f > beforeS.f, `fired=${beforeS.f}→${afterS.f}`);
    assert('弹丸击毁敌舰 +200', afterS.b - beforeS.b === 200, `Δbonus=${afterS.b - beforeS.b}`);
    assert('敌舰被拦截未撞玩家（不扣命）', afterS.h === heartsBE - 1, `hearts=${afterS.h}`);
    const beforeSh = await page.evaluate(() => ({ s: window.__space3d.shatters, b: window.__space3d.bonus }));
    await page.evaluate(() => window.__space3d.debugSpawnMeteor(0, 0, -25));   // scale 1.0 → 可击碎小陨石
    await page.waitForFunction((s) => window.__space3d.shatters === s + 1, beforeSh.s, { timeout: 8000 });
    const afterSh = await page.evaluate(() => window.__space3d.bonus);
    assert('弹丸击碎小陨石 +25', afterSh - beforeSh.b === 25, `Δbonus=${afterSh - beforeSh.b}`);
    await page.evaluate(() => {
      window.__space3d.setAutoFire(false);
      window.__space3d.spawner.clearAll();
    });

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
      window.__space3d.setAutoFire(false);       // 小陨石会被弹丸击碎，gameover 用撞击判定要关掉开火
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
