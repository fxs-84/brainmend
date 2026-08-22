// 太空3D飞行 · 生成器：陨石 / 水晶 / 穿越门 / 缺口陨石墙（对象池，零逐帧分配）
// 世界朝玩家涌来：物件 z += speed*dt，-60m 生成、越过 KILL_Z 回收。
// 可通过性硬保证：x/y 划分 5×3 网格，阻塞类事件生成前合并近 7m 内已有阻塞格，
// 必须留出至少一个自由格（思路同 runner 的 pickFreeLane / 槽位袋）。
import * as THREE from 'three';

const SPAWN_Z = -60;
const KILL_Z = 9;
const SHIP_Z = 0;
const SHIP_R = 0.6;          // 飞船碰撞半径
const CRYSTAL_R = 1.3;       // 水晶拾取半径
const GATE_IN = 2.5;         // 穿越门通过半径（环内）
const COLS = 5, ROWS = 3;    // x∈[-10,10] 5 列 · y∈[-6,6] 3 行

function cellOf(x, y) {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((x + 10) / 4)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((y + 6) / 4)));
  return r * COLS + c;
}

// 种子化伪随机（陨石顶点噪声位移可复现）
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3 个基础陨石几何：Icosahedron 顶点噪声位移（种子化）
function makeMeteorGeos() {
  const geos = [];
  for (let v = 0; v < 3; v++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const rnd = mulberry32(1000 + v * 999);
    const p = g.attributes.position;
    const seen = new Map();   // 同位置顶点同位移，避免裂缝
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let k = seen.get(key);
      if (k === undefined) { k = 0.75 + rnd() * 0.55; seen.set(key, k); }
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    geos.push(g);
  }
  return geos;
}

export class SpaceSpawner {
  constructor(scene, { onCrystal, onGate, onHit, onDodge }) {
    this.scene = scene;
    this.cb = { onCrystal, onGate, onHit, onDodge };
    this.autoSpawn = true;     // E2E 可关闭（debugSpawn 确定性测试）
    this.objs = [];
    this.travel = 0;           // 世界已涌过的距离（m）
    this.nextGap = 18;         // 第一个事件很快出现
    this.events = [];          // 阻塞事件：{d: travel@spawn, cells: Set}
    this.pools = { meteor: [], crystal: [], gate: [] };

    // 共享几何/材质（全 Lambert / Basic，省性能）
    this.meteorGeos = makeMeteorGeos();
    this.meteorMats = [
      new THREE.MeshLambertMaterial({ color: 0x8a8a92, flatShading: true }),   // 灰
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a, flatShading: true }),   // 棕
      new THREE.MeshLambertMaterial({ color: 0x7a4440, flatShading: true }),   // 暗红
    ];
    this.crystalGeo = new THREE.OctahedronGeometry(0.7);
    this.crystalMat = new THREE.MeshLambertMaterial({
      color: 0x0a3a30, emissive: 0x20c8a0, emissiveIntensity: 1.0,
    });
    this.gateGeo = new THREE.TorusGeometry(3, 0.18, 10, 40);
    this.gateMats = [
      new THREE.MeshLambertMaterial({ color: 0x062a33, emissive: 0x1aa8d8, emissiveIntensity: 1.1 }),  // 青
      new THREE.MeshLambertMaterial({ color: 0x332a06, emissive: 0xd8a028, emissiveIntensity: 1.1 }),  // 金
    ];
    this._gateFlip = false;
  }

  // --- 对象池 ---
  _take(pool, make) {
    const arr = this.pools[pool];
    if (arr.length) {
      const o = arr.pop();
      o.mesh.visible = true;
      return o;
    }
    return make();
  }
  _free(o) {
    o.mesh.visible = false;
    this.scene.remove(o.mesh);
    if (o.type === 'meteor' || o.type === 'wallblock') this.pools.meteor.push(o);
    else if (o.type === 'crystal') this.pools.crystal.push(o);
    else if (o.type === 'gate') this.pools.gate.push(o);
  }

  _add(o, x, y, z) {
    o.mesh.position.set(x, y, z);
    o.x = x; o.y = y; o.z = z; o.prevZ = z; o.done = false; o.hit = false;
    o.t = Math.random() * Math.PI * 2;
    this.scene.add(o.mesh);
    this.objs.push(o);
    return o;
  }

  spawnMeteor(x, y, z = SPAWN_Z, scale = 0.9 + Math.random() * 0.8) {
    const o = this._take('meteor', () => ({
      type: 'meteor',
      mesh: new THREE.Mesh(this.meteorGeos[0], this.meteorMats[0]),
      axis: new THREE.Vector3(),
    }));
    o.mesh.geometry = this.meteorGeos[(Math.random() * 3) | 0];
    o.mesh.material = this.meteorMats[(Math.random() * 3) | 0];
    o.mesh.scale.setScalar(scale);
    o.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    o.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    o.rotSpeed = 0.3 + Math.random() * 0.6;
    o.r = scale * 1.0;
    o.type = 'meteor';
    return this._add(o, x, y, z);
  }

  spawnCrystal(x, y, z = SPAWN_Z) {
    const o = this._take('crystal', () => ({
      type: 'crystal',
      mesh: new THREE.Mesh(this.crystalGeo, this.crystalMat),
    }));
    o.baseY = y;
    return this._add(o, x, y, z);
  }

  spawnGate(x, y, z = SPAWN_Z) {
    const o = this._take('gate', () => ({
      type: 'gate',
      mesh: new THREE.Mesh(this.gateGeo, this.gateMats[0]),
    }));
    this._gateFlip = !this._gateFlip;
    o.mesh.material = this.gateMats[this._gateFlip ? 1 : 0];
    o.mesh.rotation.set(0, 0, 0);
    return this._add(o, x, y, z);
  }

  // 缺口陨石墙：半径 8 的小陨石块环，缺口弧 ~1.5rad 对准 (gx,gy)（船从缺口过）
  spawnWall(gx, gy, z = SPAWN_Z) {
    const d = Math.hypot(gx, gy) || 1;
    const ux = gx / d, uy = gy / d;         // 缺口方向单位向量
    const cx = gx - ux * 8, cy = gy - uy * 8;   // 环心 = 缺口点反推 8m
    const ua = Math.atan2(uy, ux);
    const blocks = [];
    for (let a = 0; a < Math.PI * 2 - 1e-6; a += 0.52) {
      let da = a - ua;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 0.78) continue;    // 缺口
      const bx = cx + Math.cos(a) * 8;
      const by = cy + Math.sin(a) * 8;
      const o = this.spawnMeteor(bx, by, z, 1.15 + Math.random() * 0.4);
      o.type = 'wallblock';
      blocks.push(o);
    }
    // 阻塞格 = 所有墙块占据的格子（缺口格天然自由）
    const cells = new Set();
    for (const b of blocks) cells.add(cellOf(b.x, b.y));
    this.events.push({ d: this.travel, cells });
    return blocks;
  }

  // 近 7m 涌程内已有阻塞格的并集
  blockedCells() {
    const out = new Set();
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (this.travel - e.d > 7) break;
      for (const c of e.cells) out.add(c);
    }
    return out;
  }

  // 图案池：洗牌袋发牌（陨石/簇/水晶/门/墙轮完一遍才重复）
  spawnPattern(z = SPAWN_Z) {
    if (!this._deal || !this._deal.length) {
      this._deal = ['meteor', 'cluster', 'crystal', 'gate', 'wall', 'meteor', 'crystal'];
      for (let i = this._deal.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [this._deal[i], this._deal[j]] = [this._deal[j], this._deal[i]];
      }
    }
    const name = this._deal.pop();
    const blocked = this.blockedCells();
    const freeCells = [];
    for (let c = 0; c < COLS * ROWS; c++) if (!blocked.has(c)) freeCells.push(c);
    if (!freeCells.length) return;                       // 理论到不了，兜底
    const leave = freeCells[(Math.random() * freeCells.length) | 0];  // 必留的通道格

    if (name === 'meteor') {
      // 单颗陨石堵不死通道，随便放（避开必留格即可，反正只占一格）
      const x = (Math.random() * 2 - 1) * 9;
      const y = (Math.random() * 2 - 1) * 5;
      const o = this.spawnMeteor(x, y, z);
      this.events.push({ d: this.travel, cells: new Set([cellOf(x, y)]) });
    } else if (name === 'cluster') {
      // 3~5 颗一簇：全部落在非必留格，时密时疏的压力来源
      const n = 3 + (Math.random() * 3) | 0;
      const cells = new Set();
      for (let i = 0; i < n; i++) {
        let x = 0, y = 0, tries = 0;
        do {
          x = (Math.random() * 2 - 1) * 9;
          y = (Math.random() * 2 - 1) * 5;
        } while (cellOf(x, y) === leave && ++tries < 20);
        this.spawnMeteor(x, y, z - Math.random() * 3);
        cells.add(cellOf(x, y));
      }
      this.events.push({ d: this.travel, cells });
    } else if (name === 'crystal') {
      // 1~3 颗一列（z 向排开）
      const x = (Math.random() * 2 - 1) * 8;
      const y = (Math.random() * 2 - 1) * 4.5;
      const n = 1 + (Math.random() * 3) | 0;
      for (let i = 0; i < n; i++) this.spawnCrystal(x, y, z - i * 3);
    } else if (name === 'gate') {
      this.spawnGate((Math.random() * 2 - 1) * 6, (Math.random() * 2 - 1) * 3.5, z);
    } else if (name === 'wall') {
      // 缺口落在可达域内
      this.spawnWall((Math.random() * 2 - 1) * 7, (Math.random() * 2 - 1) * 4.5, z);
    }
  }

  // 开局预铺：眼前 25m / 42m 先放两个事件，第一秒就有东西可躲可吃
  prewarm() {
    this.spawnPattern(-25);
    this.spawnPattern(-42);
    this.nextGap = 16;
  }

  // E2E 调试：确定性生成
  debugSpawnMeteor(x, y, z = -15) { return this.spawnMeteor(x, y, z, 1.0); }
  debugSpawnCrystal(x, y, z = -15) { return this.spawnCrystal(x, y, z); }
  debugSpawnGate(x, y, z = -15) { return this.spawnGate(x, y, z); }
  debugSpawnWall(gx, gy, z = -15) { return this.spawnWall(gx, gy, z); }

  clearAll() {
    for (let i = this.objs.length - 1; i >= 0; i--) this._free(this.objs[i]);
    this.objs.length = 0;
    this.events.length = 0;
  }

  // 前移 / 回收 / 动画 / 过线判定
  // canCollide：无敌期外才造成伤害（拾取/过门不受无敌影响）
  update(dt, speed, shipX, shipY, canCollide, gapFn) {
    this.travel += speed * dt;
    for (let i = this.objs.length - 1; i >= 0; i--) {
      const o = this.objs[i];
      o.prevZ = o.z;
      o.z += speed * dt;
      o.mesh.position.z = o.z;
      o.t += dt;
      // 动画：陨石随机轴慢翻滚；水晶旋转+浮动；门呼吸
      if (o.type === 'meteor' || o.type === 'wallblock') {
        o.mesh.rotateOnAxis(o.axis, o.rotSpeed * dt);
      } else if (o.type === 'crystal') {
        o.mesh.rotation.y += dt * 2.2;
        o.mesh.position.y = o.baseY + Math.sin(o.t * 2.5) * 0.25;
      } else if (o.type === 'gate') {
        const k = 0.95 + Math.sin(o.t * 3) * 0.3;
        o.mesh.material.emissiveIntensity = k;
      }
      // 过线判定：z 从船前跨到船后的这一帧结算（帧率无关）
      if (!o.done && o.prevZ < SHIP_Z && o.z >= SHIP_Z) {
        const dist = Math.hypot(o.x - shipX, o.mesh.position.y - shipY);
        if (o.type === 'meteor' || o.type === 'wallblock') {
          if (canCollide && dist < o.r + SHIP_R) {
            o.done = true; o.hit = true;
            this.cb.onHit(o);
          } else if (dist >= o.r + SHIP_R && o.type === 'meteor') {
            o.done = true;
            this.cb.onDodge();      // 躲过陨石 +50
          }
        } else if (o.type === 'crystal') {
          if (dist < CRYSTAL_R) {
            o.done = true;
            this._free(o);
            this.objs.splice(i, 1);
            this.cb.onCrystal();
            continue;
          }
        } else if (o.type === 'gate') {
          if (dist < GATE_IN) {
            o.done = true;
            this.cb.onGate();
          }
        }
      }
      if (o.z > KILL_Z) {           // 越过相机回收
        this._free(o);
        this.objs.splice(i, 1);
      }
    }
    // 距离驱动的事件生成：密度随存活时间提升（gapFn 由 game 给出当前间隔），时密时疏
    if (this.autoSpawn) {
      this.nextGap -= speed * dt;
      if (this.nextGap <= 0) {
        this.spawnPattern(SPAWN_Z);
        let g = gapFn();
        const r = Math.random();
        if (r < 0.2) g *= 0.45;          // 突发加密
        else if (r < 0.35) g *= 1.8;     // 喘息
        this.nextGap = g;
      }
    }
    // 阻塞事件记录清理（7m 以外的对通道检查已无意义）
    while (this.events.length && this.travel - this.events[0].d > 30) this.events.shift();
  }
}
