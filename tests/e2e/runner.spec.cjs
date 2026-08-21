// 海风球道 E2E：rAF 注入陀螺仪，断言屏幕中心锚定 / 头控同向 / 金币障碍 / 掉海 / 过关 / 漂移回中 / 游戏结束
// 用法：node tests/e2e/runner.spec.cjs（自起静态服务器，端口 8792）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8792;
// 两次加载：A=短关验证过关流程（规定 URL），B=长关验证判定逻辑（互不干扰）
const URL_A = `http://localhost:${PORT}/runner.html?mode=device&norender=1&levellen=60`;
const URL_B = `http://localhost:${PORT}/runner.html?mode=device&norender=1&levellen=500`;

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  const errors = [];
  try {
    // ========== 加载 A：校准进入 playing + 冲线过关 ==========
    console.log('A) 启动流程 + 终点门过关（levellen=60）');
    let page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL_A, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });

    // 注入通道就绪：用 rAF 驱动（headless Chromium 会把 setInterval 节流到 ~10Hz，rAF 更稳）
    await page.evaluate(() => {
      window.__drive = { mode: 'const', yaw: 0, ramp: null };
      const loop = () => {
        const d = window.__drive;
        let yaw = d.yaw;
        if (d.mode === 'ramp' && d.ramp) {
          const t = performance.now() / 1000 - d.ramp.t0;
          yaw = Math.min(d.ramp.to, d.ramp.from + d.ramp.rate * t);
        }
        window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    // 断言 1：校准 2 秒后进入 playing
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 8000 });
    assert('校准后进入 playing', true);

    // 断言 7：levellen=60 冲线 → levelcomplete → 自动进第 2 关且速度提升
    await page.waitForFunction(() => window.__runner.state === 'levelcomplete', null, { timeout: 20000 });
    assert('冲过终点门进入 levelcomplete', true);
    await page.waitForFunction(() => window.__runner.state === 'playing' && window.__runner.level === 2, null, { timeout: 8000 });
    const lv2 = await page.evaluate(() => ({ level: window.__runner.level, speed: window.__runner.speed }));
    assert('自动进入第 2 关且速度提升', lv2.level === 2 && lv2.speed > 8, `level=${lv2.level} speed=${lv2.speed}`);
    await page.close();

    // ========== 加载 B：长关判定逻辑（关自然生成，只玩 debugSpawn）==========
    console.log('B) 头控 / 金币 / 障碍 / 掉海 / 漂移 / 游戏结束（levellen=500）');
    page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL_B, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__drive = { mode: 'const', yaw: 0, ramp: null };
      const loop = () => {
        const d = window.__drive;
        let yaw = d.yaw;
        if (d.mode === 'ramp' && d.ramp) {
          const t = performance.now() / 1000 - d.ramp.t0;
          yaw = Math.min(d.ramp.to, d.ramp.from + d.ramp.rate * t);
        }
        window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const setYaw = (y) => page.evaluate(v => { window.__drive.mode = 'const'; window.__drive.yaw = v; }, y);
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { window.__runner.spawner.autoSpawn = false; });  // 关掉自然生成，判定确定性

    // 断言 2：球 NDC x 不随 yaw 变化；trackGroup.x 随 yaw 反向移动
    console.log('2) 屏幕中心锚定');
    await setYaw(-15); await page.waitForTimeout(900);
    const atNeg = await page.evaluate(() => ({ ndc: window.__runner.ballNdcX(), track: window.__runner.trackGroup.position.x }));
    await setYaw(15); await page.waitForTimeout(900);
    const atPos = await page.evaluate(() => ({ ndc: window.__runner.ballNdcX(), track: window.__runner.trackGroup.position.x }));
    assert('球 NDC x 不随 yaw 变化（Δ<0.02）', Math.abs(atPos.ndc - atNeg.ndc) < 0.02,
      `Δ=${Math.abs(atPos.ndc - atNeg.ndc).toFixed(4)}`);
    assert('trackGroup.x 随 yaw 反向移动', atNeg.track > 1 && atPos.track < -1,
      `yaw-15→x=${atNeg.track.toFixed(2)}, yaw+15→x=${atPos.track.toFixed(2)}`);

    // 断言 3：yaw=+12 → ballLaneX 升到 >1.5（头控同向）
    console.log('3) 头控同向');
    await setYaw(12); await page.waitForTimeout(900);
    const laneX = await page.evaluate(() => window.__runner.ballLaneX);
    assert('yaw=+12 → ballLaneX > 1.5', laneX > 1.5, `ballLaneX=${laneX.toFixed(2)}`);
    await setYaw(0); await page.waitForTimeout(800);

    // 断言 4：debugSpawnCoin 到球当前 x → coins+1、score+10
    console.log('4) 金币');
    const before4 = await page.evaluate(() => ({ coins: window.__runner.coins, score: window.__runner.score }));
    await page.evaluate(() => window.__runner.debugSpawnCoin(window.__runner.ballX));
    await page.waitForFunction(c => window.__runner.coins === c + 1, before4.coins, { timeout: 5000 });
    const after4 = await page.evaluate(() => ({ coins: window.__runner.coins, score: window.__runner.score }));
    assert('吃金币 coins+1', after4.coins === before4.coins + 1, `coins=${after4.coins}`);
    assert('金币加分 ≥10（分数=距离+金币×10）', after4.score - before4.score >= 10,
      `Δscore=${after4.score - before4.score}`);

    // 断言 5：debugSpawnObstacle 到球当前 x → hearts 3→2，无敌期内不再扣
    console.log('5) 障碍 + 无敌');
    await page.evaluate(() => window.__runner.debugSpawnObstacle(window.__runner.ballX));
    await page.waitForFunction(() => window.__runner.hearts === 2, null, { timeout: 5000 });
    assert('撞障碍 hearts 3→2', true);
    await page.evaluate(() => window.__runner.debugSpawnObstacle(window.__runner.ballX, -10));  // 近处再来一个
    await page.waitForTimeout(2200);
    const heartsInv = await page.evaluate(() => window.__runner.hearts);
    assert('无敌期内再撞不扣心', heartsInv === 2, `hearts=${heartsInv}`);
    await page.evaluate(() => window.__runner.setInvincible(0));

    // 断言 6：持续 yaw=+20 冲出边缘 → falling → hearts-1 → 重生即对齐零点，控制即时生效
    console.log('6) 掉海重生');
    await setYaw(20);
    await page.waitForFunction(() => window.__runner.state === 'falling', null, { timeout: 5000 });
    const heartsFall = await page.evaluate(() => window.__runner.hearts);
    assert('冲出边缘进入 falling 且 hearts 2→1', heartsFall === 1, `hearts=${heartsFall}`);
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 5000 });
    await page.waitForTimeout(400);
    const recenterX = await page.evaluate(() => Math.abs(window.__runner.ballX));
    assert('重生即居中（无需回中等候，|ballX|<0.5）', recenterX < 0.5, `ballX=${recenterX.toFixed(2)}`);
    // 头再偏 +10（相对新零点）→ 球立刻响应，没有"回中解锁"延迟
    await setYaw(30);
    await page.waitForFunction(() => window.__runner.ballX > 1, null, { timeout: 1500 });
    assert('重生后控制即时生效（ballX>1）', true);
    await setYaw(20);   // 回到新零点
    await page.waitForTimeout(400);

    // 断言 8：慢漂注入（yaw 缓增 +3 后静止）→ 不做自动回中（用户明确要求：该机制会干扰本游戏）
    console.log('8) 漂移不自动回中');
    const pre = await page.evaluate(() => ({ raw: window.__runner.input.raw.yaw, offset: window.__runner.input.offset.yaw }));
    await page.evaluate((r0) => {
      window.__drive.mode = 'ramp';
      window.__drive.ramp = { from: r0, to: r0 + 3, rate: 1.5, t0: performance.now() / 1000 };
    }, pre.raw);
    await page.waitForTimeout(4500);   // 缓增 2s + 静止 2.5s（足够旧机制触发，用于验证它确实没了）
    const drift = await page.evaluate(() => ({
      pose: window.__runner.input.pose.yaw, offset: window.__runner.input.offset.yaw,
    }));
    assert('offset 不跟踪漂移（保持不变）', Math.abs(drift.offset - pre.offset) < 0.5,
      `offset=${drift.offset.toFixed(2)}（起始=${pre.offset.toFixed(2)}）`);
    assert('pose.yaw 如实反映偏移（≈+3）', Math.abs(drift.pose - 3) < 1, `pose.yaw=${drift.pose.toFixed(2)}`);

    // 断言 9：god=0 hearts 归零 → gameover overlay + localStorage runner_best
    console.log('9) 游戏结束');
    await page.evaluate(() => { window.__drive.mode = 'const'; window.__drive.yaw = 20; });  // 20 = 重生时对齐的零点
    await page.evaluate(() => window.__runner.debugSpawnObstacle(window.__runner.ballX));
    await page.waitForFunction(() => window.__runner.state === 'gameover', null, { timeout: 5000 });
    const over = await page.evaluate(() => ({
      overlay: document.querySelector('#runner-hud-root #rhud-overlay').style.display,
      best: localStorage.getItem('runner_best'),
    }));
    assert('hearts 归零进入 gameover overlay', over.overlay === 'flex', `display=${over.overlay}`);
    assert('localStorage 写入 runner_best', over.best !== null, `runner_best=${over.best}`);

    await page.close();

    // ========== 加载 C：三种新元素（地刺/高台/摆锤，levellen=500，顺序 a→c→b）==========
    console.log('C) 地刺 / 高台 / 摆锤（levellen=500）');
    page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL_B, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__drive = { mode: 'const', yaw: 0, ramp: null };
      const loop = () => {
        window.updateFromGyroscope({ yaw: window.__drive.yaw, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const setYawC = (y) => page.evaluate(v => { window.__drive.yaw = v; }, y);
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { window.__runner.spawner.autoSpawn = false; });

    // 断言 a：地刺弹出时命中 → 心-1；缩回时通过 → 不扣心
    console.log('a) 地刺：弹出命中 / 缩回安全');
    // phase=0.7 → 弹出窗口 t∈(0.9,1.6)s，正好盖住到达时刻 ~1.25s
    await page.evaluate(() => window.__runner.debugSpawnSpike(0, -15, 0.7));
    await page.waitForTimeout(1000);
    const upNow = await page.evaluate(() => window.__runner.spikeUp());
    assert('地刺到达前处于弹出状态', upNow === true);
    await page.waitForFunction(() => window.__runner.hearts === 2, null, { timeout: 5000 });
    assert('弹出地刺命中 hearts 3→2', true);
    // phase=0 → 到达时刻 ~1.25s 落在缩回窗口（t%1.6 ≥ 0.7）
    await page.evaluate(() => window.__runner.debugSpawnSpike(0, -15, 0));
    await page.waitForTimeout(1200);
    const upAtPass = await page.evaluate(() => window.__runner.spikeUp());
    await page.waitForTimeout(1200);
    const heartsAfterDown = await page.evaluate(() => window.__runner.hearts);
    assert('缩回地刺通过时处于缩回状态', upAtPass === false);
    assert('缩回地刺通过不扣心', heartsAfterDown === 2, `hearts=${heartsAfterDown}`);

    // 断言 c：摆锤——bob 压顶通过 → 心-1；bob 荡到远处通过 → 安全
    console.log('c) 摆锤：压顶命中 / 荡开安全');
    // 到达时刻 ≈ 1.25s；φ 使 angle(1.25s)=0（摆球在底部中央，压球车道）
    const phaseHit = -2 * Math.PI * 1.25 / 2.2;
    await page.evaluate((ph) => window.__runner.debugSpawnPendulum(-15, ph), phaseHit);
    await page.waitForFunction(() => window.__runner.hearts === 1, null, { timeout: 5000 });
    assert('摆球压顶通过 hearts 2→1', true);
    // φ 使 angle(1.25s)=±0.9rad（摆球荡到最侧边，低位压不到球）
    const phaseSafe = Math.PI / 2 - 2 * Math.PI * 1.25 / 2.2;
    await page.evaluate((ph) => window.__runner.debugSpawnPendulum(-15, ph), phaseSafe);
    await page.waitForTimeout(1200);
    const bobFar = await page.evaluate(() => Math.abs(window.__runner.pendulumBobX()));
    await page.waitForTimeout(1200);
    const heartsAfterSafe = await page.evaluate(() => window.__runner.hearts);
    assert('通过时摆球荡到远处（|bobX|>1.5）', bobFar > 1.5, `|bobX|=${bobFar.toFixed(2)}`);
    assert('摆锤荡开时通过安全', heartsAfterSafe === 1, `hearts=${heartsAfterSafe}`);

    // 断言 b：高台——贴齐路边 / 开上去 / 台面金币 / 冲出路边掉海
    console.log('b) 高台：贴边 / 上台 / 台面金币 / 冲出掉海');
    const coinsBeforeB = await page.evaluate(() => window.__runner.coins);
    // 高台生成在已覆盖球 z 的位置（台面段），外缘必须 ≤ 路边 3.5（不悬出海面）
    const pf = await page.evaluate(() => {
      const o = window.__runner.debugSpawnPlatform(2.8, -7);
      return { laneX: o.mesh.userData.laneX, w: o.w };
    });
    assert('高台外缘不越路边（≤3.5）', Math.abs(pf.laneX) + pf.w / 2 <= 3.5 + 1e-6,
      `外缘=${(Math.abs(pf.laneX) + pf.w / 2).toFixed(2)}`);
    await setYawC(12);   // ballX ≈ 2.5，对准台面
    await page.waitForFunction(() => window.__runner.ballY > 0.8, null, { timeout: 3000 });
    assert('开上高台 ballY > 0.8', true);
    await page.waitForFunction(c => window.__runner.coins > c, coinsBeforeB, { timeout: 3000 });
    assert('台上吃到台面金币', true);
    // 继续往外冲：ballX 超过掉海线 3.8（已出高台外缘 3.5）→ 掉海
    await setYawC(20);
    await page.waitForFunction(() => window.__runner.state === 'falling', null, { timeout: 5000 });
    assert('冲出路边（出高台外缘）→ falling', true);

    await page.close();

    // ========== 加载 D：五种新元素（滑箱/加速带/跳台/扫杆/道具，levellen=500）==========
    console.log('D) 滑箱 / 加速带 / 跳台 / 扫杆 / 道具（levellen=500）');
    page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL_B, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__drive = { yaw: 0 };
      const loop = () => {
        window.updateFromGyroscope({ yaw: window.__drive.yaw, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { window.__runner.spawner.autoSpawn = false; });

    // 断言 a：滑箱滑到球 x → 心-1（amp=0 静止在球车道，等效滑到脸上的时刻）
    console.log('a) 滑箱');
    await page.evaluate(() => window.__runner.debugSpawnSlide(0, -15, 0));
    await page.waitForFunction(() => window.__runner.hearts === 2, null, { timeout: 5000 });
    assert('滑箱命中 hearts 3→2', true);
    await page.evaluate(() => window.__runner.setInvincible(0));

    // 断言 b：加速带 → boostActive 且速度×1.6，3 秒后恢复
    console.log('b) 加速带');
    await page.evaluate(() => window.__runner.debugSpawnBoost(0, -15));
    // speed 只在每帧主循环里重算，直接等速度值而不是 boostActive（消除帧间竞态）
    await page.waitForFunction(() => window.__runner.boostActive && window.__runner.speed > 10, null, { timeout: 5000 });
    const boostSpeed = await page.evaluate(() => window.__runner.speed);
    assert('碾过加速带 boostActive 且速度×1.6', Math.abs(boostSpeed - 8 * 1.6) < 0.5,
      `speed=${boostSpeed.toFixed(1)}`);
    await page.waitForTimeout(3300);
    const afterBoost = await page.evaluate(() => ({ active: window.__runner.boostActive, speed: window.__runner.speed }));
    assert('3 秒后加速结束速度恢复', !afterBoost.active && Math.abs(afterBoost.speed - 8) < 0.3,
      `speed=${afterBoost.speed.toFixed(1)}`);

    // 断言 c：跳台腾空（ballY>1.2）→ 腾空期间撞箱不扣心 → 落地正常
    console.log('c) 跳台');
    // 跳台与迎面箱同时生成：箱子到达球位时 = 起跳后 0.375s（弹道峰值 ballY≈1.4，全程 >1.2 免疫窗）
    await page.evaluate(() => {
      window.__runner.debugSpawnJump(0, -15);
      window.__runner.debugSpawnObstacle(0, -18);
    });
    await page.waitForFunction(() => window.__runner.ballY > 1.2, null, { timeout: 4000 });
    assert('冲上跳台腾空（ballY>1.2）', true);
    await page.waitForFunction(() => window.__runner.ballY < 0.7, null, { timeout: 4000 });
    const afterJump = await page.evaluate(() => ({ hearts: window.__runner.hearts, y: window.__runner.ballY }));
    assert('腾空期间撞箱不扣心（空中免疫）', afterJump.hearts === 2, `hearts=${afterJump.hearts}`);
    assert('落回球道（ballY≈0.55）', Math.abs(afterJump.y - 0.55) < 0.15, `ballY=${afterJump.y.toFixed(2)}`);

    // 断言 d：扫杆——杆压球道时通过 → 心-1；杆顺路（沿 z）时通过 → 安全
    console.log('d) 扫杆');
    // phase=-π → 到达时刻 ~1.25s 杆方向 θ=0（横挡球道，覆盖球 x）
    await page.evaluate(() => window.__runner.debugSpawnSweeper(0, -15, -Math.PI));
    await page.waitForFunction(() => window.__runner.hearts === 1, null, { timeout: 5000 });
    assert('杆压球道通过 hearts 2→1', true);
    await page.evaluate(() => window.__runner.setInvincible(0));
    // 立柱偏离球 2.3m（杆长够不到），phase=-π/2 → 到达时 θ=π/2（顺路）
    await page.evaluate(() => window.__runner.debugSpawnSweeper(2.3, -15, -Math.PI / 2));
    await page.waitForTimeout(1200);
    const swAngle = await page.evaluate(() => window.__runner.sweeperAngle());
    await page.waitForTimeout(1300);
    const heartsAfterSweep = await page.evaluate(() => window.__runner.hearts);
    assert('通过时杆顺路（|sin θ|>0.9）', Math.abs(Math.sin(swAngle)) > 0.9, `θ=${swAngle.toFixed(2)}`);
    assert('杆顺路时通过安全', heartsAfterSweep === 1, `hearts=${heartsAfterSweep}`);

    // 断言 e：道具——磁吸吸金币；护盾挡 1 次撞击
    console.log('e) 道具');
    await page.evaluate(() => window.__runner.setInvincible(0));
    await page.evaluate(() => window.__runner.debugSpawnPickup('magnet', 0, -15));
    await page.waitForFunction(() => window.__runner.magnetActive, null, { timeout: 5000 });
    assert('拾取磁吸道具 magnetActive', true);
    const coinsBeforeMag = await page.evaluate(() => window.__runner.coins);
    await page.evaluate(() => window.__runner.debugSpawnCoin(2.0, -12));   // 横向 2m 外，正常吃不到
    await page.waitForFunction(c => window.__runner.coins > c, coinsBeforeMag, { timeout: 5000 });
    assert('磁吸把远处金币吸过来吃到', true);
    await page.evaluate(() => window.__runner.debugSpawnPickup('shield', 0, -15));
    await page.waitForFunction(() => window.__runner.shieldActive, null, { timeout: 5000 });
    assert('拾取护盾道具 shieldActive', true);
    await page.evaluate(() => window.__runner.debugSpawnObstacle(0, -15));
    await page.waitForFunction(() => !window.__runner.shieldActive, null, { timeout: 5000 });
    const heartsShield = await page.evaluate(() => window.__runner.hearts);
    assert('护盾挡下撞箱：护盾消耗、心不扣', heartsShield === 1, `hearts=${heartsShield}`);

    // 断言 f：横向槽位错落袋——连续 3 次必为左/中/右三个不同槽位（分布均匀的硬保证）
    const slots = await page.evaluate(() => {
      const s = window.__runner.spawner;
      return [s.nextSlot(), s.nextSlot(), s.nextSlot()];
    });
    assert('槽位袋连续 3 次覆盖左/中/右', new Set(slots).size === 3, `slots=${JSON.stringify(slots)}`);

    await page.close();

    // ========== 加载 E：第二批新元素（断桥/传送带/弹力柱/盲盒/大金币，levellen=500）==========
    console.log('E) 断桥 / 传送带 / 弹力柱 / 盲盒 / 大金币（levellen=500）');
    page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto(URL_B, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__drive = { yaw: 0 };
      const loop = () => {
        window.updateFromGyroscope({ yaw: window.__drive.yaw, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { window.__runner.spawner.autoSpawn = false; });

    // 断言 a：不跳直接进断口 → falling
    console.log('a) 断桥（不跳）');
    await page.evaluate(() => window.__runner.debugSpawnGap(-15));
    await page.waitForFunction(() => window.__runner.state === 'falling', null, { timeout: 5000 });
    const heartsGap = await page.evaluate(() => window.__runner.hearts);
    assert('贴地进断口 → falling 且 hearts 3→2', heartsGap === 2, `hearts=${heartsGap}`);
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 5000 });
    await page.evaluate(() => window.__runner.setInvincible(0));

    // 断言 b：腾空飞过断口 → 安全（仍 playing，不扣心）
    console.log('b) 断桥（跳台飞越）');
    await page.evaluate(() => {
      window.__runner.debugSpawnGap(-20);
      window.__runner.debugSpawnJump(0, -17);   // 断口近端边缘前 1m 冲坡（与图案自配位置一致）
    });
    await page.waitForFunction(() => window.__runner.ballY > 1.2, null, { timeout: 5000 });
    assert('冲坡腾空（ballY>1.2）', true);
    await page.waitForTimeout(2500);   // 飞越断口全程（落地后再确认）
    const afterGap = await page.evaluate(() => ({ state: window.__runner.state, hearts: window.__runner.hearts }));
    assert('腾空飞过断口安全通过（仍 playing，不扣心）',
      afterGap.state === 'playing' && afterGap.hearts === 2,
      `state=${afterGap.state} hearts=${afterGap.hearts}`);

    // 断言 c：传送带侧推（yaw=0 球向推力方向漂移，两个方向都验证）
    // 读数必须在带覆盖球的时间内（|gz+5|<3，约 0.9~1.6s），出了带漂移会指数回落
    console.log('c) 传送带');
    await page.evaluate(() => window.__runner.debugSpawnConveyor(0, 1, -15));
    await page.waitForTimeout(1300);
    const driftR = await page.evaluate(() => window.__runner.ballX);
    assert('推力 +1 → ballX 向 +x 漂移', driftR > 0.05, `ballX=${driftR.toFixed(3)}`);
    await page.evaluate(() => window.__runner.debugSpawnConveyor(0, -1, -15));
    await page.waitForTimeout(1300);
    const driftL = await page.evaluate(() => window.__runner.ballX);
    assert('推力 -1 → ballX 向 -x 漂移', driftL < -0.05, `ballX=${driftL.toFixed(3)}`);

    // 断言 d：弹力柱——撞上不扣心、球被弹离（短暂偏移后回落）、分数 +5
    console.log('d) 弹力柱');
    const beforeD = await page.evaluate(() => ({ hearts: window.__runner.hearts, score: window.__runner.score }));
    await page.evaluate(() => window.__runner.debugSpawnBumper(0.3, -15));   // 球右前方擦柱 → 向左弹
    await page.waitForFunction(() => window.__runner.ballX < -0.25, null, { timeout: 3000 });
    assert('撞上弹力柱球被弹离（ballX < -0.25）', true);
    await page.waitForTimeout(1600);
    const afterD = await page.evaluate(() => ({ hearts: window.__runner.hearts, score: window.__runner.score, x: window.__runner.ballX }));
    assert('弹力柱不扣心', afterD.hearts === beforeD.hearts, `hearts=${afterD.hearts}`);
    assert('弹力柱加分 ≥5', afterD.score - beforeD.score >= 5, `Δscore=${afterD.score - beforeD.score}`);
    assert('冲量衰减后球回落（|ballX|<0.3）', Math.abs(afterD.x) < 0.3, `ballX=${afterD.x.toFixed(2)}`);

    // 断言 e：盲盒——拾取后 coins 增加 或 护盾 或 磁吸 之一成立（永远有奖）
    console.log('e) 盲盒');
    const coinsBeforeE = await page.evaluate(() => window.__runner.coins);
    await page.evaluate(() => window.__runner.debugSpawnMystery(0, -15));
    await page.waitForFunction(c =>
      window.__runner.coins > c || window.__runner.shieldActive || window.__runner.magnetActive,
      coinsBeforeE, { timeout: 5000 });
    const prize = await page.evaluate(() => ({
      coins: window.__runner.coins, shield: window.__runner.shieldActive, magnet: window.__runner.magnetActive,
    }));
    assert('盲盒拾取出奖（金币雨/护盾/磁吸 之一）', true,
      `coins=${prize.coins} shield=${prize.shield} magnet=${prize.magnet}`);

    // 断言 f：金色大金币——拾取 → 分数 +50
    console.log('f) 金色大金币');
    const beforeF = await page.evaluate(() => ({ score: window.__runner.score, coins: window.__runner.coins }));
    await page.evaluate(() => window.__runner.debugSpawnGoldcoin(0, -15, 0));
    await page.waitForFunction(c => window.__runner.coins > c, beforeF.coins, { timeout: 5000 });
    const afterF = await page.evaluate(() => window.__runner.score);
    assert('大金币拾取分数 +50', afterF - beforeF.score >= 50, `Δscore=${afterF - beforeF.score}`);

    await page.close();

    console.log('10) 控制台/页面错误');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(1); });
