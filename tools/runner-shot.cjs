// 海风球道画面截图自检：菜单 / 游戏中（金币+障碍） / 终点门
// 用法：node tools/runner-shot.cjs（自起静态服务器，端口 8797）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8797;
const OUT = path.join(__dirname, '..', 'screenshots');

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  try {
    // 截图 0：菜单（不带 mode 参数，显示开始 overlay）
    let page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', e => console.error('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/runner.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'runner-0-menu.png') });
    console.log('✓ 截图0 菜单');
    await page.close();

    // 游戏中：mode=device 直达，god=1 防截图时被自然障碍打死
    page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', e => console.error('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/runner.html?mode=device&god=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__runner, null, { timeout: 10000 });
    await page.evaluate(() => {
      const loop = () => {
        window.updateFromGyroscope({ yaw: 0, pitch: 0, roll: 0 });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => window.__runner.state === 'playing', null, { timeout: 8000 });
    await page.waitForTimeout(6000);   // 自然图案进场

    // 布景：近处一列金币 + 一个障碍，走到中场时截图
    await page.evaluate(() => {
      window.__runner.debugSpawnCoin(0.9, -30);
      window.__runner.debugSpawnCoin(0.9, -31.4);
      window.__runner.debugSpawnCoin(0.9, -32.8);
      window.__runner.debugSpawnObstacle(-0.9, -38);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'runner-1-game.png') });
    console.log('✓ 截图1 游戏中（金币+障碍）');

    // 之后全部手动布景：关自然生成并清场（否则 SCRIPT 里的自然加速带被吃掉后速度×1.6，布景距离全乱）
    await page.evaluate(() => {
      window.__runner.spawner.autoSpawn = false;
      window.__runner.spawner.clearAll();
    });

    // 三种新元素：地刺（弹出中）→ 高台+台面金币 → 摆锤（先拍，避免终点门冲线清场）
    await page.evaluate(() => {
      window.__runner.debugSpawnSpike(-0.9, -20, 0.7);   // 到近处时正好弹出
      window.__runner.debugSpawnPlatform(3.2, -36);
      window.__runner.debugSpawnPendulum(-50, 0);
    });
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(OUT, 'runner-3-spike.png') });
    console.log('✓ 截图3 地刺');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(OUT, 'runner-4-platform.png') });
    console.log('✓ 截图4 高台+金币');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, 'runner-5-pendulum.png') });
    console.log('✓ 截图5 摆锤');

    // 第二批新元素：滑箱 → 跳台（含金币弧）→ 扫杆 → 加速带 → 道具（按 z 轴排开）
    // 截图时机按"物件实际走到 z∈[-14,-9]"轮询（screenshot 自身耗时会累积，固定 wait 会错位）
    const shotWhen = (type, file, zMin = -14, zMax = -9) =>
      page.waitForFunction(([t, lo, hi]) => {
        const o = window.__runner.spawner.objs.find(o => o.type === t && o.mesh.position.z > lo && o.mesh.position.z < hi);
        return !!o;
      }, [type, zMin, zMax], { timeout: 20000 }).then(() =>
        page.screenshot({ path: path.join(OUT, file) }));
    await page.evaluate(() => {
      window.__runner.debugSpawnSlide(-1.2, -26);
      window.__runner.debugSpawnJump(0, -38);
      window.__runner.debugSpawnSweeper(0.8, -50);
      window.__runner.debugSpawnBoost(0.9, -62);
      window.__runner.debugSpawnPickup('magnet', 1.5, -74);
      window.__runner.debugSpawnPickup('shield', -1.5, -76);
    });
    await shotWhen('slide', 'runner-6-slide.png');
    console.log('✓ 截图6 滑箱');
    await shotWhen('jump', 'runner-7-jump.png');
    console.log('✓ 截图7 跳台+金币弧');
    await shotWhen('sweeper', 'runner-8-sweeper.png', -17, -10);
    console.log('✓ 截图8 扫杆');
    await shotWhen('boost', 'runner-9-boost.png');
    console.log('✓ 截图9 加速带');
    await shotWhen('pickup', 'runner-10-pickup.png');
    console.log('✓ 截图10 道具');

    // 第三批新元素：断桥（含自配弹射坡）→ 传送带 → 弹力柱 → 盲盒 → 大金币；鲸鱼顺路强制触发
    await page.evaluate(() => {
      window.__runner.spawner.spawnGap(-26, true);        // 带弹射坡，球会自动起跳飞越
      window.__runner.debugSpawnConveyor(0, 1, -40);
      window.__runner.debugSpawnBumper(-1.2, -52);
      window.__runner.debugSpawnBumper(1.3, -52);
      window.__runner.debugSpawnMystery(0.8, -64);
      window.__runner.debugSpawnGoldcoin(-0.8, -76, 0.6);
      window.__runner.world.whaleJump();
    });
    await shotWhen('gap', 'runner-11-gap.png');
    console.log('✓ 截图11 断桥');
    await shotWhen('conveyor', 'runner-12-conveyor.png');
    console.log('✓ 截图12 传送带');
    await shotWhen('bumper', 'runner-13-bumper.png');
    console.log('✓ 截图13 弹力柱');
    await shotWhen('mystery', 'runner-14-mystery.png');
    console.log('✓ 截图14 盲盒');
    await shotWhen('goldcoin', 'runner-15-goldcoin.png');
    console.log('✓ 截图15 大金币');
    // 鲸鱼：强制触发后约 1.1s 到抛物线中段（若已跃完就随缘拍海面）
    await page.evaluate(() => window.__runner.world.whaleJump());
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(OUT, 'runner-16-whale.png') });
    console.log('✓ 截图16 鲸鱼（氛围）');

    // 终点门：直接生成在中距离，走近截图（放最后：冲线会 clearAll 清掉场上物件）
    await page.evaluate(() => window.__runner.spawner.spawnGate(-45));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'runner-2-gate.png') });
    console.log('✓ 截图2 终点门');
  } finally {
    await browser.close(); server.kill();
  }
  console.log('完成');
  process.exit(0);
})().catch(e => { console.error('截图异常:', e); process.exit(1); });
