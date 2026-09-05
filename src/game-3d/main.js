// 公路赛车 3D 主入口
import * as THREE from 'three';
import { setupLighting, setupFog } from './assets/lighting.js';
import { Sky } from './assets/sky.js';
import { Road } from './assets/road.js';
import { Buildings } from './assets/buildings.js';
import { Player, CockpitCamera } from './player.js';
import { ObstaclePool, SceneryPool } from './obstacles.js';
import { HazardPool } from './hazards.js';
import { Input } from './input.js';
import { Coins } from './coins.js';
import { EngineSound } from './sound.js';
import { LANES_X } from './assets/road.js';
import { BiomeManager } from './biomes/biome-manager.js';
import { WorldCurve } from './curve.js';

// 选一条前方 18m 内没有车的车道（防"车墙"，保证超车空档）；都占则返回 -1
function pickFreeLane(activeObstacles) {
  const free = [];
  for (let i = 0; i < LANES_X.length; i++) {
    const blocked = activeObstacles.some(o => o.lane === i && o.mesh.position.z < -27);
    if (!blocked) free.push(i);
  }
  return free.length > 0 ? free[Math.floor(Math.random() * free.length)] : -1;
}

// 把 x 坐标映射到最近车道索引 (0-4)
function xToLane(x) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < LANES_X.length; i++) {
    const d = Math.abs(x - LANES_X[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

const loadingEl = document.getElementById('loading');
const hudEl = document.getElementById('hud');
const scoreEl = hudEl.querySelector('.score');

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
setupLighting(scene);
setupFog(scene);

// ---------- 场景元素 ----------
const sky = new Sky();
scene.add(sky.mesh);
const road = new Road();
const buildings = new Buildings();

// worldGroup: 世界反向平移的载体 (海风球道 runner 同款方案)
// 陀螺仪控制 player.laneX (逻辑值), player.group.position.x 永远 = 0 (屏幕中央),
// worldGroup.position.x = -laneX → 摩托车视觉上相对世界移动
// (替代原"player.group.position.x 直接由陀螺仪控制"的方案, 避免车偏到车道最边上不好控制)
const worldGroup = new THREE.Group();
scene.add(worldGroup);
worldGroup.add(road.group, buildings.group);

const biomeManager = new BiomeManager({ road, sky, buildings, scene });

// ---------- 加载管理 ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  loadingEl.textContent = `加载中… ${Math.round(loaded / total * 100)}%`;
};
manager.onLoad = () => {
  loadingEl.classList.add('done');
};

// ---------- 玩家 + 相机 ----------
const player = new Player();
const camCtl = new CockpitCamera(innerWidth / innerHeight);
scene.add(player.group);

// ---------- 障碍 + 街景 ----------
const obstacles = new ObstaclePool();
worldGroup.add(obstacles.group);
const scenery = new SceneryPool();
worldGroup.add(scenery.group);

// ---------- 金币 ----------
const coins = new Coins();
worldGroup.add(coins.group);

// ---------- 多种障碍物 ----------
const hazards = new HazardPool();
worldGroup.add(hazards.group);

// ---------- 引擎声 ----------
const engine = new EngineSound();
addEventListener('pointerdown', () => engine.start(), { once: true });
addEventListener('keydown', () => engine.start(), { once: true });

// ---------- 输入 ----------
const input = new Input();
input.requestGyro();

// 蓝牙陀螺仪直接驱动 input.yaw / input.pitch (绕开 input.js 衰减/重置逻辑)
// bundle 通过 updateFromGyroscope 把数据推到 window.D (D.yaw/D.pitch/D.roll),
// 我们读 D 算相对偏移, 每帧 loop 内强制覆盖 input.yaw/pitch (input.update 会衰减)
const BLE_GYRO_DIVISOR = 30;
let _gyroYaw = 0;     // 转向 [-1, 1]
let _gyroPitch = 0;   // 速度 [-1, 1]
let _bleGyroBase = null;
function _updateGyro() {
  try {
    const D = window.D;
    if (!D || (D.yaw == null && D.pitch == null)) return;
    const yaw = Number(D.yaw) || 0;
    const pitch = Number(D.pitch) || 0;
    if (_bleGyroBase === null) _bleGyroBase = { yaw, pitch };
    const dy = yaw - _bleGyroBase.yaw;
    const dp = pitch - _bleGyroBase.pitch;
    _gyroYaw = Math.max(-1, Math.min(1, dy / BLE_GYRO_DIVISOR));
    _gyroPitch = Math.max(-1, Math.min(1, dp / BLE_GYRO_DIVISOR));
  } catch (e) { /* 忽略 */ }
}
setInterval(_updateGyro, 50);
// 蓝牙陀螺仪: 我们自己持有 yaw/pitch, 每帧 loop 内强制覆盖 input.yaw/pitch
// 关键: 不设置 input.useGyro = true, 否则 input.js 的 deviceorientation 监听器
// 会和我们的陀螺仪数据竞争, 覆盖 input.yaw
// input.update 在 _gyroActive=false 且无键时衰减 yaw — 这是问题!
// 解决: 每帧直接覆盖 input.yaw/pitch (在 input.update 调用前)
window.recalibrateRoadGyro = () => { _bleGyroBase = null; _gyroYaw = 0; _gyroPitch = 0; };

// ---------- 游戏状态 ----------
const state = {
  running: false,
  over: false,
  worldZ: 0,          // 世界前进距离
  speed: 14,          // 基础速度 m/s
  baseSpeed: 14,
  maxSpeed: 50,
  surviveTime: 0,
  dodged: 0,
  score: 0,
  spawnTimer: 0,
  spawnInterval: 1.6,   // 生成间隔（车流适中，留超车空档）
  hitCooldown: 0,
  lives: 3,             // 3 条生命，撞 3 次才结束
  maxObstacles: 8,      // 同时在线车辆上限
  coinTimer: 0,
  coinInterval: 1.8,
  coins: 0,
  hazardTimer: 0,
  hazardInterval: 1.4,  // 障碍物生成间隔
  boostTimer: 0,
};

async function boot() {
  try {
    await Promise.all([
      player.load(manager),
      obstacles.load(manager),
      scenery.load(manager),
    ]);
    state.running = true;
    // ?debug=1 暴露对象给自动化测试脚本
    if (new URLSearchParams(location.search).get('debug')) {
      window.__dbg = { obstacles, player, state, hazards, coins, engine, input };
    }
    requestAnimationFrame(loop);
  } catch (err) {
    loadingEl.textContent = '加载失败，请刷新重试';
    console.error('[boot] 加载失败:', err);
  }
}
boot();

document.getElementById('back').onclick = () => {
  location.href = './index.html';
};

// 难度: URL 参数 (?diff=easy|normal|hard, 游戏选择面板传入). 面板已选好, 游戏内无需按钮
const urlDiff = new URLSearchParams(location.search).get('diff');
if (urlDiff && ['easy', 'normal', 'hard'].includes(urlDiff)) {
  input.setDifficulty(urlDiff);
}

addEventListener('resize', () => {
  camCtl.setAspect(innerWidth / innerHeight);
  renderer.setSize(innerWidth, innerHeight);
});

// 游戏结束：按任意键返回选择面板
addEventListener('keydown', () => {
  if (state.over) location.href = './index.html';
}, { passive: true });
addEventListener('pointerdown', () => {
  if (state.over) location.href = './index.html';
});

let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!state.running) return;

  input.update(dt);

  // 速度控制：抬头加速，低头减速（对齐 2D 3 档难度倍率）
  const targetSpeed = state.baseSpeed * input.getSpeedMultiplier();
  state.speed += (THREE.MathUtils.clamp(targetSpeed, 4, state.maxSpeed) - state.speed) * Math.min(1, dt * 5);

  if (state.over) {
    // 撞车后减速停
    state.speed *= Math.pow(0.05, dt);
  }

  // 世界前进（世界坐标系：玩家固定在 z=0，障碍物从 -Z 流向 +Z）
  state.worldZ -= state.speed * dt;
  // 弯道：根据里程更新当前弯度（各系统渲染时按纵深叠加横向偏移）
  WorldCurve.updateFromDistance(Math.abs(state.worldZ));

  // 更新各系统
  player.group.position.z = 0;  // 玩家固定在 z=0
  // 蓝牙陀螺仪: 每帧强制覆盖 input.yaw/pitch, 避开 input.update 的衰减逻辑
  // (input.update 在 _gyroActive=true 时不衰减, 但 useGyro 模式下 _onOrientation
  //  可能覆盖; 我们直接覆盖, _gyroYaw/_gyroPitch 由 setInterval 维护)
  input.yaw = _gyroYaw;
  input.pitch = _gyroPitch;
  player.update(input, dt);
  // 世界反向平移: worldGroup 装路面/障碍/金币等所有可动物体, player 不动 (屏幕下方中央)
  // 摩托车"往左变道" = 陀螺仪左转 → laneX 负 → worldGroup 向右移 → 障碍物视觉上向右移
  // (海风球道 runner/game.js trackGroup.position.x = -ballX 同款方案)
  worldGroup.position.x = -player.laneX;
  camCtl.update(player.group, input, state.speed, dt);
  biomeManager.update(state.worldZ);
  scenery.update(state.worldZ);
  sky.update(now / 1000);

  if (!state.over) {
    state.surviveTime += dt;
    state.hitCooldown = Math.max(0, state.hitCooldown - dt);

    // 障碍车生成：滚动补充（车流持续，不等满员停顿）
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && obstacles.active.length < state.maxObstacles) {
      state.spawnTimer = state.spawnInterval * (0.7 + Math.random() * 0.6);
      const playerLane = xToLane(player.laneX);
      const isConvoy = Math.random() < 0.3;
      const count = isConvoy ? 2 : 1;
      const used = new Set();
      for (let k = 0; k < count; k++) {
        let laneIdx;
        if (k === 0 && Math.random() < 0.3) {
          laneIdx = playerLane;  // 30% 瞄准玩家车道
        } else {
          do { laneIdx = Math.floor(Math.random() * 5); } while (used.has(laneIdx));
        }
        used.add(laneIdx);
        const zOff = k * (5 + Math.random() * 7);
        // 障碍物速度更低（相对速度更大，更快接近玩家）
        obstacles.spawn(-45 - zOff, laneIdx, state.speed * (0.25 + Math.random() * 0.2));
      }
    }

    // 多种障碍物生成（spike/fireball/rock/oil/pothole/cone/boost）
    state.hazardTimer -= dt;
    if (state.hazardTimer <= 0) {
      state.hazardTimer = state.hazardInterval * (0.7 + Math.random() * 0.6);
      const laneIdx = Math.floor(Math.random() * 5);
      hazards.spawn(-55, laneIdx, state.speed);
    }

    // 金币链生成（对齐 2D coinChainChance .55 / length 4~6）
    state.coinTimer -= dt;
    if (state.coinTimer <= 0) {
      state.coinTimer = state.coinInterval * (0.8 + Math.random() * 0.5);
      if (Math.random() < 0.55) {
        const laneIdx = Math.floor(Math.random() * 5);
        const len = 4 + Math.floor(Math.random() * 3);
        coins.spawnChain(-60, laneIdx, len);
      } else {
        coins.spawn(-60, Math.floor(Math.random() * 5));
      }
    }

    // 障碍更新（玩家 z=0，障碍物从 -Z 流向 +Z）
    obstacles.update(dt, state.speed, 0, null, () => {
      state.dodged++;
      state.score += 50;
    });

    // 金币更新（对齐 2D：收集 +100 分，玩家 z=0）
    coins.update(dt, state.speed, 0, player.laneX, () => {
      state.coins++;
      state.score += 100;
      engine.coin();
    });

    // 撞击处理：扣 1 命，3 命扣完才结束
    const onCrash = () => {
      if (state.hitCooldown > 0) return;
      state.lives--;
      engine.crash();
      if (state.lives <= 0) {
        state.over = true;
        state.hitCooldown = 2;
        engine.stop();
      } else {
        state.hitCooldown = 1.5;  // 短暂无敌
        state.speed *= 0.4;       // 撞击减速惩罚
      }
    };

    // 多种障碍物更新（玩家 z=0）
    state.boostTimer = Math.max(0, state.boostTimer - dt);
    hazards.update(dt, state.speed, 0, player.laneX,
      (h) => {  // onHit：撞到障碍物
        if (h.type === 'oil' || h.type === 'pothole') {
          // 油污/坑洼 = 减速 debuff，不直接撞车
          state.speed *= 0.5;
          state.score = Math.max(0, state.score - 20);
        } else {
          onCrash();
        }
      },
      (h) => {  // onDodge：躲过障碍物
        state.dodged++;
        state.score += 50;
      },
      (h) => {  // onBoost：吃加速器
        state.boostTimer = 3;
        state.score += 30;
      }
    );

    // boost 加速效果
    if (state.boostTimer > 0) {
      state.speed = Math.min(state.maxSpeed * 1.3, state.speed + dt * 20);
    }

    // 碰撞（玩家 z=0，按真实包围盒判定）
    if (obstacles.checkCollision(player.laneX, 0, player.halfX, player.halfZ)) {
      onCrash();
    }

    // 存活分
    state.score += dt * 2;
  }

  // 引擎声随速度
  engine.update(state.speed);

  // HUD（对齐 2D：存活/躲避/金币/速度）
  scoreEl.textContent = state.over
    ? `💥 撞车！ 存活 ${state.surviveTime.toFixed(0)}s · 躲避 ${state.dodged} · 金币 ${state.coins} · 分数 ${Math.floor(state.score)} · 按任意键返回选择`
    : `❤️${state.lives} · 存活 ${state.surviveTime.toFixed(0)}s · 躲避 ${state.dodged} · 金币 ${state.coins} · 分数 ${Math.floor(state.score)} · 速度 ${(state.speed * 3.6).toFixed(0)}km/h`;

  renderer.render(scene, camCtl.cam);
}
