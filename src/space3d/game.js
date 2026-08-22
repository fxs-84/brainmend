// 太空3D飞行（头控真3D）· 主装配（嵌入主游戏选择面板运行）
// 玩法（对齐旧版生存计分制 + 射击）：第三人称追尾视角，头控飞船在走廊内闪避——
//   陨石（撞=伤害）/ 敌舰（撞=伤害，自动开火击毁 +200）/ 水晶（+100）/ 穿越门（穿过 +150）/
//   缺口陨石墙 / 躲过陨石或漏过敌舰 +50 / 弹丸击碎小陨石 +25；
//   3 条命，受击 1.5s 无敌闪烁，命尽 GAMEOVER（任意键/点击返回面板）。
// bootSpace3D(opts) → api；stop() 完整清理（循环/音频/DOM/订阅/轮询）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HeadPoseSource } from '../vor/input/HeadPoseSource.js';
import { Metronome } from '../vor/core/Metronome.js';
import { buildSpaceWorld } from './world.js';
import { buildShip } from './ship.js';
import { SpaceSpawner } from './spawner.js';
import { SpaceHUD } from './hud.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const DIFF = {
  easy:   { baseSpeed: 18, gapMin: 24, gapMax: 34 },
  normal: { baseSpeed: 24, gapMin: 18, gapMax: 28 },
  hard:   { baseSpeed: 30, gapMin: 13, gapMax: 22 },
};

export function bootSpace3D({
  container = document.body,
  difficulty = 'normal',    // 'easy' | 'normal' | 'hard'
  gyroFeed = null,          // 嵌入模式：() => ({yaw,pitch,roll}|null)，16ms 轮询
  onExit = null,            // 结束/返回回调（默认 location.reload）
} = {}) {
  const qs = new URLSearchParams(location.search);
  const diff = DIFF[difficulty] || DIFF.normal;
  const CFG = {
    difficulty,
    baseSpeed: qs.get('speed') ? parseFloat(qs.get('speed')) : diff.baseSpeed,
    gapMin: diff.gapMin, gapMax: diff.gapMax,
    speedRamp: 0.25,        // 每秒 +0.25 m/s（线性）
    speedMaxMul: 1.6,       // 封顶 base×1.6
    yawRange: parseFloat(qs.get('yawrange') || '20'),     // yaw ±20° → 横向满幅（35° 太钝，用户嫌不灵敏）
    pitchRange: parseFloat(qs.get('pitchrange') || '16'), // pitch ±16° → 纵向满幅
    yawInv: qs.get('yawinv') ? parseInt(qs.get('yawinv')) : 1,   // 真机方向 A/B 开关（?yawinv=-1 翻左右）
    pitchInv: qs.get('pitchinv') ? parseInt(qs.get('pitchinv')) : 1,  // 用户实机：gyroFeed 链路抬头=正值（与 road3d 注释相反，以实机为准）；?pitchinv=-1 翻上下
    deadzone: 2.4,          // |yaw|<2.4° 回中死区
    boundX: 10, boundY: 6,  // 飞船可动域
    follow: 12,             // 位置平滑跟随 lerp 速率（9 偏钝）
    god: qs.get('god') === '1',
  };
  const noRender = qs.get('norender') === '1';    // E2E 逻辑验证：不建 renderer，消除软渲染干扰
  const keepBloom = qs.get('keepbloom') === '1';  // 截图时强制保留泛光（跳过 FPS 降级）

  // --- 挂载点 ---
  const mount = document.createElement('div');
  mount.id = 'space3d-root';
  mount.style.cssText = 'position:fixed;inset:0;z-index:1500;background:#030509;';
  container.appendChild(mount);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 2.2, 6.5);

  // norender：不建 renderer/composer（E2E 逻辑模式）
  let renderer = null, composer = null, bloomPass = null;
  let useComposer = qs.get('bloom') !== '0';
  if (!noRender) {
    // 清晰度：跟随设备像素比（封顶 1.5 保帧率）+ MSAA；1x 无抗锯齿在真机上会把舰体糊掉（用户实测反馈）
    const pr = Math.min(devicePixelRatio || 1, 1.5);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    // 高光滚降：NoToneMapping 下 行星/冰晶/舰体高光直接削顶过曝（用户实测反馈），ACES 压高光保中间调
    // 曝光链整体下压（真机仍偏亮）：exposure/bloomstr/bloomth 可用 URL 参数现场调（?exposure=0.6&bloomstr=0.3）
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = parseFloat(qs.get('exposure') || '0.7');
    mount.appendChild(renderer.domElement);
    // 泛光（照抄 src/vor/demo.js）：克制强度 + threshold 0.78；FPS<18 自动降级
    // composer 的离屏 RT 默认无 MSAA → samples:4，否则走泛光链时反而比直渲更糊
    const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight),
      parseFloat(qs.get('bloomstr') || '0'), 0.4, parseFloat(qs.get('bloomth') || '0.85'));  // 泛光默认关：真机实测 bloomstr=0 最舒服（用户）
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    // PBR 环境贴图：GLB 是高金属度 Standard 材质，没有 environment 时金属面无反射源→近黑，
    // 这就是"舰体黑成剪影、看不清细节"的根因（灯光再强也照不亮纯金属）。
    // RoomEnvironment 一次性 PMREM，只影响 Standard 材质（两艘舰），Lambert 陨石/星空不受影响。
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (renderer) {
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
    }
  };
  addEventListener('resize', onResize);

  // --- 模块装配 ---
  const input = new HeadPoseSource();
  const sfx = new Metronome();          // 只当音效合成器用（不调 start()）
  const hud = new SpaceHUD(mount);
  const world = buildSpaceWorld(scene);
  const shipApi = buildShip(scene, { noRender });   // GLB 异步加载，norender 空 Group 占位
  const ship = shipApi.group;

  // 与现有游戏同一注入通道（链式调用原实现，嵌套模式下主游戏 bundle 的 D 状态不断流）
  const prevInject = window.updateFromGyroscope;
  window.updateFromGyroscope = (o) => {
    input.setPose(o);
    try { prevInject && prevInject(o); } catch { /* 主游戏未加载时忽略 */ }
  };

  const feedTimer = gyroFeed ? setInterval(() => {
    const p = gyroFeed();
    if (p) input.setPose(p);
  }, 16) : null;

  const exit = onExit || (() => location.reload());

  // --- 运行状态（playing → gameover）---
  let state = 'playing';
  let hearts = 3, crystals = 0, gates = 0, dodges = 0, kills = 0, shatters = 0;
  let bonus = 0;              // 水晶/门/躲陨石/击毁/击碎的奖励分
  let aliveT = 0;
  let speed = CFG.baseSpeed;
  let invincible = 0;         // 受击 1.5s 无敌（闪烁）
  let shipX = 0, shipY = 0;   // 飞船逻辑位置（世界坐标）
  let shakeT = 0;             // 受击相机抖动
  let paused = false;
  let autoFire = true;        // 自动开火（康复场景头戴设备、手不按键盘）
  let fireT = 0;              // 开火计时（射速 2.5 发/s）

  const score = () => Math.floor(aliveT * 10) + bonus;
  function readBest() { try { return parseInt(localStorage.getItem('space3d_best') || '0', 10); } catch { return 0; } }
  function writeBest(v) { try { localStorage.setItem('space3d_best', String(v)); } catch {} }

  // 事件间隔：随存活时间收紧到 ×0.65（难度基准 × 时密时疏在 spawner 内扰动）
  function gapNow() {
    const k = 1 - Math.min(aliveT / 90, 1) * 0.35;
    return (CFG.gapMin + Math.random() * (CFG.gapMax - CFG.gapMin)) * k;
  }

  // --- 生成器回调 ---
  const spawner = new SpaceSpawner(scene, {
    onCrystal() {
      if (state !== 'playing') return;
      crystals++;
      bonus += 100;
      sfx.chime([1319, 1760], 0.08, 0.25);
      hud.floatText('+100', '#5cf2d8');
    },
    onGate() {
      if (state !== 'playing') return;
      gates++;
      bonus += 150;
      sfx.chime([880, 1109, 1319], 0.1, 0.35);
      hud.floatText('+150', '#ffd23c');
    },
    onDodge() {
      if (state !== 'playing') return;
      dodges++;
      bonus += 50;
    },
    // 弹丸击毁敌舰 +200：爆炸低频 punch + 噪声（与激光的高频短促"咻"分层）
    onKillEnemy() {
      if (state !== 'playing') return;
      kills++;
      bonus += 200;
      sfx.punch(70, 0.30, 0.25);
      sfx.noise(0.35, 0.28);
      hud.floatText('+200', '#ffb050');
    },
    // 弹丸击碎小陨石 +25：轻量碎裂音
    onShatter() {
      if (state !== 'playing') return;
      shatters++;
      bonus += 25;
      sfx.noise(0.12, 0.15);
      hud.floatText('+25', '#9fdcff');
    },
    onHit() {
      if (state !== 'playing') return;
      if (!CFG.god) hearts--;
      sfx.punch(90, 0.25, 0.12);
      sfx.grind();
      hud.flashRed();
      shakeT = 0.35;
      invincible = Math.max(invincible, 1.5);
      if (hearts <= 0 && !CFG.god) doGameover();
    },
  });
  spawner.prewarm();
  spawner.loadEnemy(noRender);          // 敌舰 GLB 模板异步加载（norender 跳过）

  // --- 游戏结束：写历史最佳，任意键/点击返回面板 ---
  function doGameover() {
    if (state === 'gameover') return;
    state = 'gameover';
    const sc = score();
    const best = Math.max(sc, readBest());
    writeBest(best);
    hud.showOverlay('游戏结束',
      `存活 <b>${aliveT.toFixed(1)}s</b> · 分数 <b>${sc}</b>（历史最佳 ${best}）<br>` +
      `击毁敌舰 ${kills} · 水晶 ${crystals} · 穿越门 ${gates} · 躲过 ${dodges}<br><br>按任意键或点击返回菜单`);
    addEventListener('keydown', onGameoverExit);
    hud.el.overlay.addEventListener('click', onGameoverExit);
  }
  function onGameoverExit() {
    removeEventListener('keydown', onGameoverExit);
    stop();
    exit();
  }

  // 切后台自动暂停
  const onVisibility = () => {
    if (document.hidden && !paused && state === 'playing') {
      paused = true;
      hud.showOverlay('已暂停', '回到页面后点击继续。');
      hud.el.overlay.addEventListener('click', onResume);
    }
  };
  function onResume() {
    hud.el.overlay.removeEventListener('click', onResume);
    hud.hideOverlay();
    paused = false;
  }
  document.addEventListener('visibilitychange', onVisibility);

  // 零点：不在 boot 时盲设（feed 可能还没到，raw=0 一旦设为零点，真实 yaw 会把船钉到一侧）。
  // 等第一份 gyroFeed 数据到达再设零点；此后"近中准静止自动跟零"消漂移（见主循环）。
  let zeroed = false;
  let stillT = 0;           // 近中准静止计时（漂移跟零用）

  // --- 追尾相机（平滑跟随 + 轻微滞后滚转）---
  const camPos = new THREE.Vector3(0, 2.2, 6.5);
  const camLook = new THREE.Vector3(0, 0, -8);
  const tmpV = new THREE.Vector3();
  let camRoll = 0;

  // --- 主循环 ---
  let last = performance.now();
  let rafId = 0;
  let fpsAcc = 0, fpsN = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;                     // dt 钳制

    input.update(dt);

    if (!paused && state === 'playing') {
      aliveT += dt;
      speed = Math.min(CFG.baseSpeed + aliveT * CFG.speedRamp, CFG.baseSpeed * CFG.speedMaxMul);

      // 头控映射（直接用 raw-offset，绕开 HeadPoseSource 内 ±20°/±15° 的 VOR 钳制）：
      // yaw ±20° → [-1,1] 横向；pitch ±16° → [-1,1] 纵向（D 通道抬头=负值，pitchInv 默认取反=抬头上升）
      // |yaw|<2.4° 死区回中
      if (!zeroed && input.source !== 'none') {
        // 首份数据到达后采 ~20 帧均值设零点（单帧即设会被通道启动延迟坑：
        // 首帧到达时头可能已在转/旧码在 raw=0 时盲设导致飞船被钉到一侧——用户实测"开局偏右"）
        if (!tick._za) tick._za = { n: 0, sy: 0, sp: 0 };
        const za = tick._za;
        za.n++; za.sy += input.raw.yaw; za.sp += input.raw.pitch;
        if (za.n >= 20) {
          input.offset.yaw = za.sy / za.n;
          input.offset.pitch = za.sp / za.n;
          zeroed = true;
        }
      }
      const dyaw = input.raw.yaw - input.offset.yaw;
      const dpitch = input.raw.pitch - input.offset.pitch;
      // 漂移对策：头在近中位（±6°/±5°）且准静止 1.2s 后，零点缓慢爬向当前头位（0.5/s 混合）。
      // 只在近中位启用——偏头躲障碍保持不动时不会把船偷走（runner 的"自动回中"教训）
      const nearCenter = Math.abs(dyaw) < 6 && Math.abs(dpitch) < 5;
      const vel = Math.abs(input.raw.yaw - (tick._py ?? input.raw.yaw)) + Math.abs(input.raw.pitch - (tick._pp ?? input.raw.pitch));
      tick._py = input.raw.yaw; tick._pp = input.raw.pitch;
      if (nearCenter && vel < 0.15) {
        stillT += dt;
        if (stillT > 1.2) {
          const creep = Math.min(1, dt * 0.5);
          input.offset.yaw += (input.raw.yaw - input.offset.yaw) * creep;
          input.offset.pitch += (input.raw.pitch - input.offset.pitch) * creep;
        }
      } else stillT = 0;
      const yawN = CFG.yawInv * (Math.abs(dyaw) < CFG.deadzone ? 0 : clamp(dyaw / CFG.yawRange, -1, 1));
      const pitchN = CFG.pitchInv * clamp(dpitch / CFG.pitchRange, -1, 1);
      const targetX = yawN * CFG.boundX;
      const targetY = pitchN * CFG.boundY;
      const k = Math.min(1, dt * CFG.follow);     // 帧率无关平滑跟随
      shipX += (targetX - shipX) * k;
      shipY += (targetY - shipY) * k;
      ship.position.set(shipX, shipY, 0);
      // 姿态：yaw→压弯滚转 ±0.6rad（右转右压），pitch→俯仰 ±0.35rad（抬头抬机头）
      ship.rotation.z = -yawN * 0.6;
      ship.rotation.x = pitchN * 0.35;
      shipApi.update(dt, speed);

      // 自动开火：2.5 发/s，从舰艏 -Z 射出发光弹（激光音 = 高频短促下滑"咻"，与爆炸低频分层）
      if (autoFire) {
        fireT += dt;
        if (fireT >= 0.4) {
          fireT -= 0.4;
          spawner.spawnBullet(shipX, shipY, -2.4);
          sfx.grind(0.05, 0.07);
        }
      }

      world.update(dt, speed, camera);
      spawner.update(dt, speed, shipX, shipY, invincible <= 0, gapNow);

      if (invincible > 0) {
        invincible -= dt;
        ship.visible = Math.floor(now / 120) % 2 === 0;   // 无敌闪烁
      } else {
        ship.visible = true;
      }

      // 追尾相机：船后上方 (0,2.2,6.5)，横向只跟 70%（压弯时船偏离屏幕中心，速度感来源）
      tmpV.set(shipX * 0.7, shipY * 0.7 + 2.2, 6.5);
      camPos.lerp(tmpV, Math.min(1, dt * 5));
      camera.position.copy(camPos);
      tmpV.set(shipX * 0.9, shipY * 0.85, -8);
      camLook.lerp(tmpV, Math.min(1, dt * 6));
      camera.lookAt(camLook);
      camRoll += ((-yawN * 0.12) - camRoll) * Math.min(1, dt * 3);   // 轻微滞后滚转
      camera.rotation.z += camRoll;
      // 受击抖动
      if (shakeT > 0) {
        shakeT -= dt;
        camera.position.x += (Math.random() - 0.5) * shakeT * 0.9;
        camera.position.y += (Math.random() - 0.5) * shakeT * 0.9;
      }

      hud.setTop({ hearts, score: score(), aliveT, speed });
    }

    if (!noRender) {
      if (useComposer) composer.render(); else renderer.render(scene, camera);
    } else {
      scene.updateMatrixWorld(true);   // E2E 不渲染但保持矩阵最新
    }
    // FPS 自适应降级（照抄 src/vor/demo.js）：帧率持续过低 → 绕过泛光
    if (!noRender) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc >= 1) {
        const fps = fpsN / fpsAcc;
        if (fps < 18 && useComposer && !keepBloom) useComposer = false;
        fpsAcc = 0; fpsN = 0;
      }
    }
  }
  tick();

  function stop() {
    cancelAnimationFrame(rafId);
    sfx.stop();
    if (feedTimer) clearInterval(feedTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('resize', onResize);
    removeEventListener('keydown', onGameoverExit);
    hud.destroy();
    if (composer) composer.dispose();
    if (renderer) renderer.dispose();
    mount.remove();
    if (window.updateFromGyroscope && prevInject) window.updateFromGyroscope = prevInject;
    if (window.__space3d === api) window.__space3d = null;
  }

  // --- E2E / 调试钩子 ---
  const api = {
    CFG, input, spawner, ship, world, stop,
    get state() { return state; },
    get hearts() { return hearts; },
    get score() { return score(); },
    get bonus() { return bonus; },
    get crystals() { return crystals; },
    get gates() { return gates; },
    get dodges() { return dodges; },
    get speed() { return speed; },
    get aliveT() { return aliveT; },
    get shipX() { return shipX; },
    get zeroed() { return zeroed; },   // E2E 等零点稳定后再驱动
    get shipY() { return shipY; },
    get objCount() { return spawner.objs.length; },
    get kills() { return kills; },
    get shatters() { return shatters; },
    get bullets() { return spawner.bullets.length; },
    get fired() { return spawner.fired; },
    get shipLoaded() { return shipApi.loaded; },
    setAutoFire: (b) => { autoFire = !!b; fireT = 0; },
    debugSpawnMeteor: (x, y, z) => spawner.debugSpawnMeteor(x, y, z),
    debugSpawnCrystal: (x, y, z) => spawner.debugSpawnCrystal(x, y, z),
    debugSpawnGate: (x, y, z) => spawner.debugSpawnGate(x, y, z),
    debugSpawnWall: (gx, gy, z) => spawner.debugSpawnWall(gx, gy, z),
    debugSpawnEnemy: (x, y, z) => spawner.debugSpawnEnemy(x, y, z),
    debugExplode: (x, y, z, color) => spawner.explode(x, y, z, color),
    setInvincible: (s) => { invincible = s; },
  };
  window.__space3d = api;
  return api;
}
