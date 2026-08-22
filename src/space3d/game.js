// 太空3D飞行（头控真3D）· 主装配（嵌入主游戏选择面板运行）
// 玩法（对齐旧版生存计分制）：第三人称追尾视角，头控飞船在走廊内闪避——
//   陨石（撞=伤害）/ 水晶（+100）/ 穿越门（穿过 +150）/ 缺口陨石墙 / 躲过陨石 +50；
//   3 条命，受击 1.5s 无敌闪烁，命尽 GAMEOVER（任意键/点击返回面板）。
// bootSpace3D(opts) → api；stop() 完整清理（循环/音频/DOM/订阅/轮询）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
    yawRange: 35,           // yaw ±35° → 横向 [-1,1]
    pitchRange: 22.5,       // pitch ±22.5° → 纵向 [-1,1]（抬头=上升）
    deadzone: 2.4,          // |yaw|<2.4° 回中死区
    boundX: 10, boundY: 6,  // 飞船可动域
    follow: 9,              // 位置平滑跟随 lerp 速率
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
    renderer = new THREE.WebGLRenderer({ antialias: false });   // 软渲染性能：pixelRatio 1、无 MSAA
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(1);
    mount.appendChild(renderer.domElement);
    // 泛光（照抄 src/vor/demo.js）：克制强度 + threshold 0.78；FPS<18 自动降级
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.45, 0.78);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
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
  const shipApi = buildShip(scene);
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
  let hearts = 3, crystals = 0, gates = 0, dodges = 0;
  let bonus = 0;              // 水晶/门/躲陨石的奖励分
  let aliveT = 0;
  let speed = CFG.baseSpeed;
  let invincible = 0;         // 受击 1.5s 无敌（闪烁）
  let shipX = 0, shipY = 0;   // 飞船逻辑位置（世界坐标）
  let shakeT = 0;             // 受击相机抖动
  let paused = false;

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

  // --- 游戏结束：写历史最佳，任意键/点击返回面板 ---
  function doGameover() {
    if (state === 'gameover') return;
    state = 'gameover';
    const sc = score();
    const best = Math.max(sc, readBest());
    writeBest(best);
    hud.showOverlay('游戏结束',
      `存活 <b>${aliveT.toFixed(1)}s</b> · 分数 <b>${sc}</b>（历史最佳 ${best}）<br>` +
      `水晶 ${crystals} · 穿越门 ${gates} · 躲过陨石 ${dodges}<br><br>按任意键或点击返回菜单`);
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

  // 启动瞬间把当前头位设为新零点（避免开局几秒无反馈——runner 踩过的坑）
  input.offset.yaw = input.raw.yaw;
  input.offset.pitch = input.raw.pitch;

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
      // yaw ±35° → [-1,1] 横向；pitch ±22.5° → [-1,1] 纵向（抬头=上升）；|yaw|<2.4° 死区回中
      const dyaw = input.raw.yaw - input.offset.yaw;
      const dpitch = input.raw.pitch - input.offset.pitch;
      const yawN = Math.abs(dyaw) < CFG.deadzone ? 0 : clamp(dyaw / CFG.yawRange, -1, 1);
      const pitchN = clamp(dpitch / CFG.pitchRange, -1, 1);
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
    get shipY() { return shipY; },
    get objCount() { return spawner.objs.length; },
    debugSpawnMeteor: (x, y, z) => spawner.debugSpawnMeteor(x, y, z),
    debugSpawnCrystal: (x, y, z) => spawner.debugSpawnCrystal(x, y, z),
    debugSpawnGate: (x, y, z) => spawner.debugSpawnGate(x, y, z),
    debugSpawnWall: (gx, gy, z) => spawner.debugSpawnWall(gx, gy, z),
    setInvincible: (s) => { invincible = s; },
  };
  window.__space3d = api;
  return api;
}
