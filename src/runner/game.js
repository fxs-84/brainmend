// 海风球道（头控跑酷）· 主装配（可独立页面 runner.html 运行，也可嵌入主游戏选择面板）
// 玩法：小球锁定屏幕中心原地滚动，世界（球道/海洋/障碍）朝玩家匀速涌来；
//       头戴陀螺仪控制球的横向位置（头右转球往右），吃金币、躲障碍、别掉海、冲过终点门。
// bootRunner(opts) → api；stop() 完整清理（循环/音频/DOM/订阅/轮询）
import * as THREE from 'three';
import { HeadPoseSource } from '../vor/input/HeadPoseSource.js';
import { Metronome } from '../vor/core/Metronome.js';
import { buildWorld, BALL_Z } from './world.js';
import { Spawner } from './spawner.js';
import { RunnerHUD } from './hud.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function bootRunner({
  container = document.body,
  mode = null,            // 'device' | 'keyboard' | 'auto' | 'external'，null=显示菜单
  integrated = false,     // 嵌入主游戏面板（无独立页菜单措辞差异）
  gyroFeed = null,        // 嵌入模式：() => ({yaw,pitch,roll}|null)，16ms 轮询
  onExit = null,          // 结束/返回回调（默认 location.reload）
} = {}) {
  // URL 参数覆盖（测试/调试用）
  const qs = new URLSearchParams(location.search);
  const CFG = {
    baseSpeed: qs.get('speed') ? parseFloat(qs.get('speed')) : 8,     // 关卡 1 速度 m/s
    levelDur: qs.get('leveldur') ? parseFloat(qs.get('leveldur')) : 90, // 每关时长 s（关长 = 时长 × 当前关速度）
    god: qs.get('god') === '1',                                       // 测试：不扣心
  };
  // 关长：默认 90s × 当前速度（第 1 关 720m，提速的关卡更长）；qs levellen 覆盖（E2E 用，关教学序列）
  let levelLen = qs.has('levellen') ? parseFloat(qs.get('levellen')) : CFG.baseSpeed * CFG.levelDur;
  const noRender = qs.get('norender') === '1';   // E2E 逻辑验证：跳过像素渲染，消除软渲染性能干扰

  // --- 挂载点 ---
  const mount = document.createElement('div');
  mount.id = 'runner-root';
  mount.style.cssText = 'position:fixed;inset:0;z-index:1500;background:#0b1020;';
  container.appendChild(mount);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(0, 3.2, 6.5);
  camera.lookAt(0, 1, -6);

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  // --- 模块装配 ---
  const input = new HeadPoseSource();
  const sfx = new Metronome();          // 只当音效合成器用（不调 start()）
  const hud = new RunnerHUD(mount);
  const world = buildWorld(scene);
  const { trackGroup, ball } = world;

  // 与现有游戏同一注入通道（外部 IMU 桥 / E2E 均可直接调用）
  // 注意链式调用原实现：主游戏 bundle 的 D 状态也由它更新，直接覆盖会断掉嵌入模式的数据
  const prevInject = window.updateFromGyroscope;
  window.updateFromGyroscope = (o) => {
    input.setPose(o);
    try { prevInject && prevInject(o); } catch { /* 主游戏未加载时忽略 */ }
  };

  // 嵌入模式的外部数据轮询（读主游戏的 window.D，与其 BLE 管道共用）
  const feedTimer = gyroFeed ? setInterval(() => {
    const p = gyroFeed();
    if (p) input.setPose(p);
  }, 16) : null;

  const exit = onExit || (() => location.reload());

  // --- 运行状态（menu → calibrating → playing → falling → levelcomplete → gameover）---
  let state = 'menu';
  let stateT = 0;             // 当前状态计时（falling 1.2s / levelcomplete 2.5s 自动推进）
  let level = 1, hearts = 3, coins = 0;
  let totalDist = 0, distInLevel = 0;
  let ballX = 0;              // 球的车道 x（逻辑值；球 mesh 不动，trackGroup 反向平移）
  let ballY = 0.55;           // 球的纵向位置（高台机制：地面高度 + 半径 0.55）
  let speed = CFG.baseSpeed;
  let invincible = 0;         // 无敌剩余秒数（受击 1.5s / 重生 2s，闪烁半透明表示）
  let paused = false;
  let boostT = 0;             // 加速带剩余秒数（speed×1.6、得分×2）
  let magnetT = 0;            // 磁吸剩余秒数（2.5 半径金币吸向球）
  let shield = false;         // 护盾（挡 1 次撞击）
  let vy = 0, airborne = false;   // 跳台腾空状态（重力 -12，空中免疫地面碰撞）
  let bumpV = 0;                // 弹力柱横向冲量（指数衰减）
  let scoreDist = 0, coinScore = 0; // 计分用：加速期间距离分×2；金币 10 分（加速期 20）

  const score = () => Math.floor(scoreDist) + coinScore;
  function readBest() { try { return parseInt(localStorage.getItem('runner_best') || '0', 10); } catch { return 0; } }
  function writeBest(v) { try { localStorage.setItem('runner_best', String(v)); } catch {} }

  function setState(s) { state = s; stateT = 0; }

  // --- 生成器回调 ---
  const spawner = new Spawner(trackGroup, world, {
    onCoin() {
      if (state !== 'playing') return;
      coins++;
      coinScore += boostT > 0 ? 20 : 10;          // 加速期间得分×2
      sfx.chime([1319, 1760], 0.08, 0.25);      // 金币：双音高频钟声
      hud.floatText(boostT > 0 ? '+20' : '+10');
    },
    onHit() {
      if (state !== 'playing') return;
      // 护盾先于 hearts 扣抵：挡 1 次撞击
      if (shield) {
        shield = false;
        sfx.punch(150, 0.20, 0.10);
        hud.flashRed();
        hud.floatText('护盾挡下！', '#7fdc8c');
        invincible = Math.max(invincible, 1.5);
        return;
      }
      if (!CFG.god) hearts--;                    // god=1 不扣心（测试用）
      sfx.punch(90, 0.25, 0.12);                 // 撞击：低频钝音 + 金属摩擦
      sfx.grind();
      hud.flashRed();
      invincible = Math.max(invincible, 1.5);
      if (hearts <= 0 && !CFG.god) doGameover();
    },
    onBoost() {
      if (state !== 'playing') return;
      boostT = 3;                                 // 3 秒 speed×1.6、得分×2
      sfx.chime([880, 1109, 1319], 0.1, 0.35);
      hud.floatText('加速！', '#ffd23c');
    },
    onJump() {
      if (state !== 'playing' || airborne) return;
      vy = 4.5; airborne = true;                  // 起跳：重力 -12，空中约 0.75s
      sfx.punch(330, 0.12, 0.08);
    },
    onPickup(kind) {
      if (state !== 'playing') return;
      if (kind === 'magnet') {
        magnetT = 8;                              // 8 秒磁吸
        sfx.chime([1568, 2093], 0.08, 0.3);
        hud.floatText('磁吸！', '#4ce0e0');
      } else {
        shield = true;                            // 护盾：挡 1 次撞击
        sfx.chime([1047, 1319], 0.1, 0.4);
        hud.floatText('护盾！', '#7fdc8c');
      }
    },
    onBumper(dir) {
      if (state !== 'playing') return;
      bumpV = dir * 6;                            // 弹力柱横向冲量（指数衰减，lerp 自然带回）
      coinScore += 5;
      sfx.punch(440, 0.15, 0.08);                 // 弹珠台高频"啵"声
      hud.floatText('+5', '#ffd977');
    },
    onMystery() {
      if (state !== 'playing') return;
      sfx.chime([1047, 1319, 1568], 0.1, 0.4);
      const r = Math.random();                    // 盲盒永远有奖
      if (r < 0.5) {                              // 金币雨：8 金币立刻结算 +80 分
        coins += 8; coinScore += 80;
        hud.floatText('金币雨 +80', '#ffd977');
      } else if (r < 0.75) {
        shield = true;
        hud.floatText('盲盒：护盾！', '#7fdc8c');
      } else {
        magnetT = 8;
        hud.floatText('盲盒：磁吸！', '#4ce0e0');
      }
    },
    onGoldcoin() {
      if (state !== 'playing') return;
      coins++;
      coinScore += 50;                            // 金色大金币：50 分
      sfx.chime([1319, 1760, 2217], 0.1, 0.35);
      hud.floatText('+50');
    },
    onGate() {
      if (state !== 'playing') return;
      setState('levelcomplete');
      sfx.chime([523, 659, 784, 1047], 0.12, 0.6);   // 过关：长尾大三和弦
      spawner.clearAll();                        // 清掉残余障碍/金币
      hud.showOverlay(`第 ${level} 关完成！`,
        `分数 <b>${score()}</b> · 金币 ${coins}<br>下一关速度提升至 <b>${nextSpeed().toFixed(1)} m/s</b>（2.5 秒后自动开始）`,
        [{ label: '下一关', primary: true, onClick: nextLevel }]);
    },
  });

  function nextSpeed() { return Math.min(CFG.baseSpeed + level * 1.5, 20); }

  // --- 地面高度（高台机制）：球在斜坡区线性插值 0→h，在台面区 = h，否则 null（不在台上）---
  function groundInfo(x) {
    for (const p of spawner.platforms) {
      if (Math.abs(x - p.mesh.userData.laneX) > p.w / 2) continue;
      const d = (p.mesh.position.z + p.len / 2) - BALL_Z;   // 球 z 距高台近端（朝向玩家一端）
      if (d < 0 || d > p.len) continue;
      return { h: d <= p.ramp ? p.h * (d / p.ramp) : p.h };
    }
    return null;
  }

  // --- 断口判定：球 z（固定 BALL_Z）是否落在某断口范围内 ---
  function inGap() {
    for (const g of spawner.gaps) {
      if (Math.abs(BALL_Z - g.mesh.position.z) < g.len / 2) return true;
    }
    return false;
  }

  // --- 传送带侧推：球在带上（横向 |dx|<1.5 且在 z 范围）→ 返回推力方向（无则 0）---
  function conveyorPush(x) {
    for (const c of spawner.conveyors) {
      if (Math.abs(BALL_Z - c.mesh.position.z) < c.len / 2
          && Math.abs(x - c.mesh.userData.laneX) < 1.5) return c.dir;
    }
    return 0;
  }

  function nextLevel() {
    if (state !== 'levelcomplete') return;
    level++;
    spawner.level = level;
    speed = Math.min(CFG.baseSpeed + (level - 1) * 1.5, 20);   // 立刻提速（不等下一帧主循环）
    if (!qs.has('levellen')) levelLen = speed * CFG.levelDur;  // 关长随提速拉长，保持 90s 一关
    distInLevel = 0;
    spawner.gateSpawned = false;
    if (!qs.has('levellen')) spawner.prewarm();   // 关初预铺（E2E 确定性模式跳过，同开局）
    hud.hideOverlay();
    setState('playing');
  }

  // --- 掉海：1.2s 下沉动画 → 心-1 → 回中重生（无敌 2s）---
  function startFall() {
    setState('falling');
    if (!CFG.god) hearts--;
    sfx.noise(0.30, 0.30);                       // 溅水：滤波白噪声
    sfx.punch(60, 0.30, 0.25);                   // 落水：极低频钝音
  }

  function respawn() {
    ballX = 0;
    ballY = 0.55;
    ball.position.y = 0.55;
    trackGroup.position.x = 0;
    vy = 0; airborne = false;   // 掉海时若正在腾空，重生后回到地面状态
    // 重生即把当前头位设为新零点：玩家死亡时头必然偏向一侧，若等"头回到旧中线才恢复控制"，
    // 会卡住好几秒没有任何反馈（实测痛点）；对齐零点后控制即时生效，也不会因头还偏着立刻再冲出去
    input.offset.yaw = input.raw.yaw;
    input.offset.pitch = input.raw.pitch;
    invincible = 2;
    setState('playing');
  }

  // --- 游戏结束：写历史最佳，overlay 提供重开 ---
  function doGameover() {
    if (state === 'gameover') return;
    setState('gameover');
    const sc = score();
    const best = Math.max(sc, readBest());
    writeBest(best);
    hud.showOverlay('游戏结束',
      `分数 <b>${sc}</b> · 历史最佳 <b>${best}</b><br>金币 ${coins} · 到达第 ${level} 关`,
      [{ label: integrated ? '返回菜单' : '重新开始', primary: true, onClick: () => { stop(); exit(); } }]);
  }

  // --- 启动流程 ---
  async function begin(m) {
    if (m === 'device') await input.enableSensors();
    if (m === 'keyboard') input.enableKeyboard();
    try { await navigator.wakeLock?.request('screen'); } catch { /* 不支持则忽略 */ }
    setState('calibrating');
    hud.showOverlay('校准中', '保持头部正中、目视球道，静止 <b>2</b> 秒…');
    input.startCalibration(2.0, () => {
      // 校准完成后才开始自动演示：校准时若在动，零漂会测成非零均值
      if (m === 'auto') input.enableAuto(10, 0.25);
      hud.hideOverlay();
      // 开局预铺前方图案，第一秒就有东西可吃可躲（levellen 覆盖=E2E 确定性模式时跳过）
      if (!qs.has('levellen')) spawner.prewarm();
      setState('playing');
    });
  }

  if (mode) {
    begin(mode);   // qs mode=device 直达（E2E 用）
  } else {
    hud.showOverlay('海风球道 · 头控跑酷',
      '佩戴头戴陀螺仪，<b>头往左/右转动</b>控制小球左右移动。<br>' +
      '吃金币加分，躲开障碍箱，别掉进球道两侧的海里，冲过终点门进入下一关！<br>' +
      (integrated ? '陀螺仪：使用本页面顶部的蓝牙连接（与主游戏共用）。' : ''),
      [
        { label: '开始', primary: true, onClick: () => begin(integrated ? 'external' : 'device') },
        { label: '键盘演示（← →）', onClick: () => begin('keyboard') },
        { label: '自动演示', onClick: () => begin('auto') },
      ]);
  }

  // 切后台自动暂停
  const onVisibility = () => {
    if (document.hidden && !paused && (state === 'playing' || state === 'falling')) {
      paused = true;
      hud.showOverlay('已暂停', '回到页面后点击继续。', [{
        label: '继续', primary: true,
        onClick: () => { hud.hideOverlay(); paused = false; },
      }]);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // --- 主循环 ---
  let last = performance.now();
  let rafId = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;                     // dt 钳制

    input.update(dt);
    const pose = input.pose;
    stateT += dt;

    if (!paused && state === 'playing') {
      if (boostT > 0) boostT = Math.max(0, boostT - dt);
      if (magnetT > 0) magnetT = Math.max(0, magnetT - dt);
      speed = Math.min(CFG.baseSpeed + (level - 1) * 1.5, 20) * (boostT > 0 ? 1.6 : 1);
      // 头控同向：头右转(yaw+)球往右；钳制放宽 ±1.35 → yaw>15° 为"过头区"，会冲出球道掉海
      // 头控同向：头右转(yaw+)球往右；钳制放宽 ±1.35 → yaw>15° 为"过头区"，会冲出球道掉海
      // 传送带：把目标位整体推偏 2.0m——不反方向顶着头控，球就被一直推到海边（之前是叠加
      // 1.2m/s 小推力，被 dt*10 的平滑拉回平衡到只剩 0.12m，肉眼不可见，等于没功能）
      const targetX = clamp(pose.yaw / 15, -1.35, 1.35) * 3.1 + conveyorPush(ballX) * 2.0;
      const prevX = ballX;
      ballX += (targetX - ballX) * Math.min(1, dt * 10);
      ballX += bumpV * dt;                        // 弹力柱冲量（指数衰减，lerp 自然带回）
      bumpV *= Math.exp(-dt * 4);
      const latVel = (ballX - prevX) / dt;
      trackGroup.position.x = -ballX;           // 世界反向平移，球钉屏幕中心（"球原地滚动、世界动"）
      ball.rotation.x -= speed * dt / 0.55;     // 原地自转，运动归因到球
      ball.rotation.z = clamp(-latVel * 0.02, -0.3, 0.3);   // 侧倾
      // 纵向：跳台腾空走弹道（重力 -12），否则 ballY 向 groundH+0.55 平滑（高台机制）
      const gi = groundInfo(ballX);
      if (airborne) {
        vy -= 12 * dt;
        ballY += vy * dt;
        const g = (gi ? gi.h : 0) + 0.55;
        if (vy < 0 && ballY <= g) { ballY = g; vy = 0; airborne = false; }   // 落地
      } else {
        ballY += ((gi ? gi.h : 0) + 0.55 - ballY) * Math.min(1, dt * 8);
      }
      ball.position.y = ballY;
      totalDist += speed * dt;
      scoreDist += speed * dt * (boostT > 0 ? 2 : 1);   // 加速期间距离分×2
      distInLevel += speed * dt;
      world.update(dt, speed);
      spawner.update(dt, speed, ballX, invincible <= 0, ballY, magnetT > 0);
      // 终点门：剩余 75m 时生成在正好冲线的位置
      if (!spawner.gateSpawned && levelLen - distInLevel <= 75) {
        spawner.spawnGate(BALL_Z - (levelLen - distInLevel));
      }
      if (invincible > 0) {
        invincible -= dt;
        ball.material.opacity = Math.floor(now / 120) % 2 === 0 ? 0.35 : 0.9;   // 无敌闪烁
      } else {
        ball.material.opacity = 1;
      }
      // 掉海：冲出边缘（路边 3.5 + 0.3 余量，台面上安全）；或贴地进断口（腾空飞过安全）
      if ((Math.abs(ballX) > 3.8 && !gi) || (inGap() && !airborne && ballY < 1.0)) startFall();
    } else if (!paused && state === 'falling') {
      // 掉海：球下沉，世界减速涌动，1.2s 后重生或结束
      ball.position.y -= dt * 3.5;
      ball.rotation.x -= speed * dt / 0.55;
      world.update(dt, speed * 0.4);
      spawner.update(dt, speed * 0.4, ballX, false, ballY);
      if (stateT >= 1.2) {
        if (hearts <= 0 && !CFG.god) doGameover();
        else respawn();
      }
    } else if (!paused && state === 'levelcomplete') {
      if (stateT >= 2.5) nextLevel();           // 2.5s 自动进下一关
    }

    hud.setTop({ hearts, coins, score: score(), level, speed, boostT, magnetT, shield });

    if (!noRender) renderer.render(scene, camera);
    else scene.updateMatrixWorld(true);         // E2E 不渲染但保持矩阵最新（project 用）
  }
  tick();

  function stop() {
    cancelAnimationFrame(rafId);
    sfx.stop();
    if (feedTimer) clearInterval(feedTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('resize', onResize);
    hud.destroy();
    renderer.dispose();
    mount.remove();
    if (window.updateFromGyroscope && prevInject) window.updateFromGyroscope = prevInject;
    if (window.__runner === api) window.__runner = null;
  }

  // --- E2E / 调试钩子 ---
  const api = {
    CFG, input, spawner, world, trackGroup, ball, stop,
    get state() { return state; },
    get hearts() { return hearts; },
    get coins() { return coins; },
    get score() { return score(); },
    get level() { return level; },
    get speed() { return speed; },
    get ballX() { return ballX; },
    get ballLaneX() { return ballX; },
    get ballY() { return ballY; },
    get boostActive() { return boostT > 0; },
    get shieldActive() { return shield; },
    get magnetActive() { return magnetT > 0; },
    debugSpawnCoin: (x, z) => spawner.debugSpawnCoin(x, z),
    debugSpawnObstacle: (x, z) => spawner.debugSpawnObstacle(x, z),
    debugSpawnSpike: (x, z, phase) => spawner.debugSpawnSpike(x, z, phase),
    debugSpawnPlatform: (x, z) => spawner.debugSpawnPlatform(x, z),
    debugSpawnPendulum: (z, phase) => spawner.debugSpawnPendulum(z, phase),
    debugSpawnSlide: (x, z, amp, phase) => spawner.debugSpawnSlide(x, z, amp, phase),
    debugSpawnBoost: (x, z) => spawner.debugSpawnBoost(x, z),
    debugSpawnJump: (x, z) => spawner.debugSpawnJump(x, z),
    debugSpawnSweeper: (x, z, phase) => spawner.debugSpawnSweeper(x, z, phase),
    debugSpawnPickup: (kind, x, z) => spawner.debugSpawnPickup(kind, x, z),
    debugSpawnGap: (z, withJump) => spawner.debugSpawnGap(z, withJump),
    debugSpawnConveyor: (x, dir, z) => spawner.debugSpawnConveyor(x, dir, z),
    debugSpawnBumper: (x, z) => spawner.debugSpawnBumper(x, z),
    debugSpawnMystery: (x, z) => spawner.debugSpawnMystery(x, z),
    debugSpawnGoldcoin: (x, z, amp) => spawner.debugSpawnGoldcoin(x, z, amp),
    spikeUp: () => !!(spawner.lastDebugSpike && spawner.lastDebugSpike.up),
    pendulumBobX: () => (spawner.lastDebugPendulum ? spawner.lastDebugPendulum.bobX : null),
    sweeperAngle: () => (spawner.lastDebugSweeper ? spawner.lastDebugSweeper.angle : null),
    setInvincible: (s) => { invincible = s; },
    ballNdcX() { const v = new THREE.Vector3(); ball.getWorldPosition(v); v.project(camera); return v.x; },
  };
  window.__runner = api;
  return api;
}
