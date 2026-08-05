// 多种障碍物（对齐 2D：spike/fireball/rock/oil/pothole/cone + boost 增益）
// 全部程序化生成，无外部资产
import * as THREE from 'three';
import { LANES_X } from './assets/road.js';
import { WorldCurve } from './curve.js';

// ---- 各类障碍物生成器 ----
const BUILDERS = {
  // 地刺（红色尖刺群，凸起路面 — 低矮，不挡视线）
  spike() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), mat);
      spike.position.set((Math.random() - 0.5) * 2.2, 0.22, (Math.random() - 0.5) * 0.6);
      g.add(spike);
    }
    return g;
  },
  // 火球（橙色发光球，悬浮）
  fireball() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.2 })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.3 })
    );
    g.add(core, halo);
    g.position.y = 1.2;
    return g;
  },
  // 落石（灰色巨石）
  rock() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7a72, roughness: 0.95, flatShading: true });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), mat);
    rock.position.y = 0.7;
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(rock);
    return g;
  },
  // 油污（黑色反光水洼，减速 debuff）
  oil() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.9, roughness: 0.1 });
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), mat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.02;
    g.add(puddle);
    return g;
  },
  // 坑洼（深色凹陷圆坑）
  pothole() {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.0, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x0a0a10 })
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.02;
    g.add(rim, hole);
    return g;
  },
  // 雪糕筒（橙色交通锥）
  cone() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff7733, roughness: 0.6 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10), mat);
      body.position.y = 0.45;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.18, 10), stripe);
      band.position.y = 0.45;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), mat);
      base.position.y = 0.04;
      cone.add(body, band, base);
      cone.position.set((i - 1) * 0.9, 0, (Math.random() - 0.5) * 0.4);
      g.add(cone);
    }
    return g;
  },
  // boost 加速器（绿色发光箭头，吃了短暂加速）
  boost() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00cc66, emissiveIntensity: 0.8 });
    for (let i = 0; i < 2; i++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), mat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(0, 0.06, i * 0.9);
      g.add(arrow);
    }
    return g;
  },
};

// 生成概率（对齐 2D 困难模式）
const TABLE = [
  { type: 'spike',   chance: 0.22 },
  { type: 'fireball',chance: 0.20 },
  { type: 'rock',    chance: 0.18 },
  { type: 'oil',     chance: 0.18 },
  { type: 'pothole', chance: 0.14 },
  { type: 'cone',    chance: 0.14 },
  { type: 'boost',   chance: 0.06 },
];
const TOTAL = TABLE.reduce((s, t) => s + t.chance, 0);

// 各类型命中半径（按可见实体，不含光晕/特效）
const HIT_RADIUS = {
  spike: 1.1,     // 尖刺群散布 ±1.1
  fireball: 0.55, // 核心球体（光晕不算）
  rock: 0.8,
  oil: 1.1,
  pothole: 1.0,
  cone: 1.2,      // 三锥散布 ±0.9 + 锥半径 0.3
  boost: 0.5,
};

export class HazardPool {
  constructor() {
    this.group = new THREE.Group();
    this.active = [];
  }

  _pick() {
    let r = Math.random() * TOTAL;
    for (const t of TABLE) {
      r -= t.chance;
      if (r <= 0) return t.type;
    }
    return 'cone';
  }

  spawn(z, laneIdx, worldSpeed) {
    const type = this._pick();
    const mesh = BUILDERS[type]();
    mesh.position.set(LANES_X[laneIdx], 0, z);
    this.group.add(mesh);
    this.active.push({ mesh, type, lane: laneIdx, scored: false });
  }

  update(dt, worldSpeed, playerZ, playerX, onHit, onDodge, onBoost) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const h = this.active[i];
      h.mesh.position.z += worldSpeed * dt;  // 静止障碍物向玩家流来（+Z）
      // fireball 旋转
      if (h.type === 'fireball') h.mesh.rotation.y += dt * 3;
      const relZ = h.mesh.position.z - playerZ;
      // 弯道：远处视觉横向偏移（车道基础 x + 弯道偏移）
      h.mesh.position.x = LANES_X[h.lane] + WorldCurve.offsetAt(relZ);
      const dx = Math.abs(h.mesh.position.x - playerX);
      // 命中判定：按类型实体半径 + 车宽一半（0.3），FORGIVE 0.9 略收紧
      const hitR = (HIT_RADIUS[h.type] || 0.8) + 0.3;
      if (Math.abs(relZ) < 1.0 && dx < hitR * 0.9) {
        if (h.type === 'boost') {
          onBoost(h);
        } else {
          onHit(h);
        }
        this.group.remove(h.mesh);
        this.active.splice(i, 1);
        continue;
      }
      // 躲过得分
      if (relZ > 2 && !h.scored) {
        h.scored = true;
        if (h.type !== 'boost') onDodge(h);
      }
      // 移除
      if (relZ > 20) {
        this.group.remove(h.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  reset() {
    for (const h of this.active) this.group.remove(h.mesh);
    this.active = [];
  }
}
