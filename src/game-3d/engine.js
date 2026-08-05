// 3D 公路赛车引擎 — 接入康复游戏面板（读 window.state 陀螺仪）
// 复用 main.js 的所有模块，但输入改为读 window.state（与 2D 共享陀螺仪数据层）
import * as THREE from 'three';
import { setupLighting, setupFog } from './assets/lighting.js';
import { Sky } from './assets/sky.js';
import { Road } from './assets/road.js';
import { Buildings } from './assets/buildings.js';
import { Player, CockpitCamera } from './player.js';
import { ObstaclePool, SceneryPool } from './obstacles.js';
import { HazardPool } from './hazards.js';
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

export class Road3DEngine {
  constructor() {
    this.initialized = false;
    this.running = false;
    this.container = null;
    this.renderer = null;
    this.rafId = null;
    this.hud = null;
    this.onReturnToMenu = null;  // 游戏结束后按任意键回调
  }

  // 初始化：在指定容器里建 WebGL canvas + HUD
  init(container) {
    this.container = container;
    container.style.cssText = 'position:fixed;inset:0;z-index:1500;background:#aec9e0;display:none;';

    // WebGL canvas
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);  // 固定 1x，最大化帧率（低端设备友好）
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    // HUD（DOM）
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;top:12px;left:12px;color:#fff;z-index:1600;padding:12px 16px;background:rgba(0,0,0,.55);border:1px solid #00d9a5;border-radius:8px;font-size:13px;line-height:1.7;pointer-events:none;font-family:system-ui;';
    this.hud.innerHTML = '<div class="score" style="color:#00d9a5;font-weight:700;font-size:16px;">准备</div><div style="font-size:11px;color:#94a3b8;">转头换道 · 抬头加速 · 低头减速</div>';
    container.appendChild(this.hud);
    this.scoreEl = this.hud.querySelector('.score');

    // 场景
    this.scene = new THREE.Scene();
    setupLighting(this.scene);
    setupFog(this.scene);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.road = new Road();
    this.scene.add(this.road.group);
    this.buildings = new Buildings();
    this.scene.add(this.buildings.group);
    this.biomeManager = new BiomeManager({ road: this.road, sky: this.sky, buildings: this.buildings, scene: this.scene });

    this.player = new Player();
    this.camCtl = new CockpitCamera(innerWidth / innerHeight);
    this.scene.add(this.player.group);
    this.obstacles = new ObstaclePool();
    this.scene.add(this.obstacles.group);
    this.scenery = new SceneryPool();
    this.scene.add(this.scenery.group);
    this.coins = new Coins();
    this.scene.add(this.coins.group);
    this.hazards = new HazardPool();
    this.scene.add(this.hazards.group);
    this.engine = new EngineSound();

    this.state = {
      over: false, worldZ: 0, speed: 14, maxSpeed: 50,
      surviveTime: 0, dodged: 0, score: 0, coins: 0,
      spawnTimer: 0, spawnInterval: 1.6, hitCooldown: 0,
      lives: 3,
      maxObstacles: 8,
      coinTimer: 0, coinInterval: 1.8,
      hazardTimer: 0, hazardInterval: 1.4, boostTimer: 0,
    };

    this._resize = () => {
      this.camCtl.setAspect(innerWidth / innerHeight);
      this.renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', this._resize);

    // 游戏结束：按任意键返回选择面板（仅运行中且已撞车时生效）
    this._returnHandler = () => {
      if (this.running && this.state?.over && this.onReturnToMenu) this.onReturnToMenu();
    };
    addEventListener('keydown', this._returnHandler, { passive: true });
    addEventListener('pointerdown', this._returnHandler);

    this.initialized = true;
  }

  async load() {
    const manager = new THREE.LoadingManager();
    this.scoreEl.textContent = '加载中…';
    manager.onProgress = (u, l, t) => { this.scoreEl.textContent = `加载中… ${Math.round(l/t*100)}%`; };
    try {
      await Promise.all([
        this.player.load(manager),
        this.obstacles.load(manager),
        this.scenery.load(manager),
      ]);
    } catch (err) {
      this.scoreEl.textContent = '加载失败，请刷新重试';
      console.error('[Road3DEngine.load] 加载失败:', err);
      throw err;
    }
  }

  // 启动（显示容器 + 加载 + 跑循环）
  async start() {
    if (!this.initialized) return;
    this.container.style.display = 'block';
    if (!this.player.loaded) await this.load();
    this.reset();
    this.engine.start();
    this.running = true;
    this._lastT = performance.now();
    this._loop();
  }

  // 重开一局：清空所有游戏状态（撞车返回后再次进入必须全新开局）
  reset() {
    const st = this.state;
    st.over = false;
    st.worldZ = 0;
    st.speed = 14;
    st.surviveTime = 0;
    st.dodged = 0;
    st.score = 0;
    st.coins = 0;
    st.lives = 3;
    st.spawnTimer = 0;
    st.hitCooldown = 0;
    st.coinTimer = 0;
    st.hazardTimer = 0;
    st.boostTimer = 0;
    // 清空场上的实体
    this.obstacles.reset();
    this.hazards.reset();
    this.coins.reset();
    // 玩家回中间车道
    this.player.group.position.x = 0;
    this.player.group.rotation.z = 0;
    // 生态回城市
    if (this.biomeManager) this.biomeManager.reset();
    // 引擎声状态
    if (!this.running) this.engine.stop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.container.style.display = 'none';
    this.engine.stop();
  }

  rezero() { /* 陀螺仪归零由全局处理 */ }

  cleanup() {
    this.stop();
    removeEventListener('resize', this._resize);
    // 注意：_returnHandler 不在这里移除 — 引擎是单例会被复用，
    // 移除后从菜单再次进入 3D 时"按任意键返回"会失效。
    // 监听器内部有 this.running 守卫，停止状态下不会误触发。
  }

  // 接收外部喂入的陀螺仪数据（与 2D valleyEngine.setGyroInput 完全对齐）
  // 数据格式: pitch=俯仰(-90..90度, 抬头负值), yaw=左右(-180..180), roll=横滚
  // 对齐 2D 的 mapToGame YAW_PITCH_SPEED: yaw/35 → 转向, pitch/22.5 → 速度
  setGyroInput(pitch, yaw, roll) {
    this.gyroInput = { pitch: pitch || 0, yaw: yaw || 0, roll: roll || 0 };
  }
  _readInput() {
    // 优先用外部 setGyroInput 喂入的数据 (与 2D 引擎一致), 兜底读 window.state
    const g = this.gyroInput || window.state || {};
    const yaw = Math.max(-1, Math.min(1, (g.yaw || 0) / 35));
    const pitch = Math.max(-1, Math.min(1, (g.pitch || 0) / 22.5));
    return { yaw, pitch };
  }

  _speedMultiplier(pitch) {
    // 抬头加速低头减速，3 档难度
    const u = Math.max(-1, Math.min(1, pitch / 0.444));
    const c = window._roadSpeedConfig || { min: 1.2, initial: 1.5, max: 2.0 };
    return u >= 0 ? c.initial - (c.initial - c.min) * u : c.initial + (c.max - c.initial) * (-u);
  }

  _loop() {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;
    const st = this.state;
    const input = this._readInput();

    // 速度：抬头加速低头减速
    const targetSpeed = 14 * this._speedMultiplier(input.pitch);
    st.speed += (THREE.MathUtils.clamp(targetSpeed, 4, st.maxSpeed) - st.speed) * Math.min(1, dt * 5);
    if (st.over) st.speed *= Math.pow(0.05, dt);

    st.worldZ -= st.speed * dt;
    // 弯道：根据里程更新当前弯度（各系统渲染时按纵深叠加横向偏移）
    WorldCurve.updateFromDistance(Math.abs(st.worldZ));
    this.player.group.position.z = 0;
    this.player.update(input, dt);
    this.camCtl.update(this.player.group, input, st.speed, dt);
    this.biomeManager.update(st.worldZ);
    this.scenery.update(st.worldZ);
    this.sky.update(now / 1000);

    if (!st.over) {
      st.surviveTime += dt;
      st.hitCooldown = Math.max(0, st.hitCooldown - dt);

      // 车辆生成：稀疏车流，保证超车空档
      st.spawnTimer -= dt;
      if (st.spawnTimer <= 0 && this.obstacles.active.length < st.maxObstacles) {
        st.spawnTimer = st.spawnInterval * (0.7 + Math.random() * 0.6);
        const laneIdx = pickFreeLane(this.obstacles.active);
        if (laneIdx >= 0) {
          this.obstacles.spawn(-45, laneIdx, 6 + Math.random() * 4);
        }
      }

      // 障碍物生成
      st.hazardTimer -= dt;
      if (st.hazardTimer <= 0) {
        st.hazardTimer = st.hazardInterval * (0.7 + Math.random() * 0.6);
        this.hazards.spawn(-55, Math.floor(Math.random() * 5), st.speed);
      }

      // 金币生成
      st.coinTimer -= dt;
      if (st.coinTimer <= 0) {
        st.coinTimer = st.coinInterval * (0.8 + Math.random() * 0.5);
        if (Math.random() < 0.55) {
          const laneIdx = Math.floor(Math.random() * 5);
          this.coins.spawnChain(-60, laneIdx, 4 + Math.floor(Math.random() * 3));
        } else {
          this.coins.spawn(-60, Math.floor(Math.random() * 5));
        }
      }

      // 更新
      this.obstacles.update(dt, st.speed, 0, null, () => { st.dodged++; st.score += 50; });
      this.coins.update(dt, st.speed, 0, this.player.group.position.x, () => { st.coins++; st.score += 100; this.engine.coin(); });
      st.boostTimer = Math.max(0, st.boostTimer - dt);

      // 撞击处理：扣 1 命，3 命扣完才结束
      const onCrash = () => {
        if (st.hitCooldown > 0) return;
        st.lives--;
        this.engine.crash();
        if (st.lives <= 0) {
          st.over = true;
          st.hitCooldown = 2;
          this.engine.stop();
        } else {
          st.hitCooldown = 1.5;
          st.speed *= 0.4;
        }
      };

      this.hazards.update(dt, st.speed, 0, this.player.group.position.x,
        (h) => {
          if (h.type === 'oil' || h.type === 'pothole') { st.speed *= 0.5; st.score = Math.max(0, st.score - 20); }
          else onCrash();
        },
        (h) => { st.dodged++; st.score += 50; },
        (h) => { st.boostTimer = 3; st.score += 30; }
      );
      if (st.boostTimer > 0) st.speed = Math.min(st.maxSpeed * 1.3, st.speed + dt * 20);

      // 碰撞（玩家 z=0，按真实包围盒判定）
      if (this.obstacles.checkCollision(this.player.group.position.x, 0, this.player.halfX, this.player.halfZ)) {
        onCrash();
      }
      st.score += dt * 2;
    }

    this.engine.update(st.speed);
    this.scoreEl.textContent = st.over
      ? `💥 撞车！ 存活 ${st.surviveTime.toFixed(0)}s · 躲避 ${st.dodged} · 金币 ${st.coins} · 分数 ${Math.floor(st.score)} · 按任意键返回选择`
      : `❤️${st.lives} · 存活 ${st.surviveTime.toFixed(0)}s · 躲避 ${st.dodged} · 金币 ${st.coins} · 分数 ${Math.floor(st.score)} · 速度 ${(st.speed * 3.6).toFixed(0)}km/h`;

    this.renderer.render(this.scene, this.camCtl.cam);
  }
}
