// 太空3D飞行 · 生成器：陨石（岩质/冰晶两族系）/ 水晶 / 穿越门 / 缺口陨石墙 / 敌舰 + 弹丸 + 爆炸
// 世界朝玩家涌来：物件 z += speed*dt，-60m 生成、越过 KILL_Z 回收（对象池，零逐帧分配）。
// 可通过性硬保证：x/y 划分 5×3 网格，阻塞类事件生成前合并近 7m 内已有阻塞格，必留自由格。
// 敌舰：GLB 模板 clone，机头绕 Y 转 π 朝 +Z 面向玩家，随世界流 + 自身缓慢前冲 + 横向蛇形。
// 弹丸：自动开火从舰艏 -Z 射出（发光细长条），命中敌舰击毁（+200），命中小陨石击碎（+25）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { dracoDecoderPath } from '../game-3d/obstacles.js';

const SPAWN_Z = -60;
const KILL_Z = 9;
const SHIP_Z = 0;
const SHIP_R = 0.6;          // 飞船碰撞半径
const CRYSTAL_R = 1.3;       // 水晶拾取半径
const GATE_IN = 2.5;         // 穿越门通过半径（环内）
const ENEMY_R = 1.8;         // 敌舰碰撞/弹丸命中半径
const ENEMY_OWN_SPEED = 6;   // 敌舰自身前冲（叠加在世界流之上）
const BULLET_SPEED = 70;     // 弹丸绝对前速（m/s）
const SHATTER_R = 1.3;       // ≤此半径的陨石可被弹丸击碎
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

// 顶点噪声位移（同位置顶点同位移，避免裂缝）
function displace(g, seed, lo, hi) {
  const rnd = mulberry32(seed);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = lo + rnd() * (hi - lo); seen.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// 岩质陨石几何：Icosahedron detail 2 + 强噪声 → 嶙峋棱角
function makeRockyGeos() {
  const geos = [];
  for (let v = 0; v < 3; v++) geos.push(displace(new THREE.IcosahedronGeometry(1, 2), 1000 + v * 999, 0.68, 1.38));
  return geos;
}
// 冰晶陨石几何：detail 1 + 弱噪声 + 单轴拉长 → 结晶碎块感
function makeIceGeos() {
  const geos = [];
  for (let v = 0; v < 2; v++) {
    const g = displace(new THREE.IcosahedronGeometry(1, 1), 7000 + v * 555, 0.85, 1.2);
    g.scale(1, 1.25, 0.9);
    geos.push(g);
  }
  return geos;
}

// 柔和光斑纹理（爆炸粒子/闪光共用）
function makeGlowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const EXPLO_N = 42;          // 每个爆炸的粒子数
const EXPLO_POOL = 6;

export class SpaceSpawner {
  constructor(scene, { onCrystal, onGate, onHit, onDodge, onKillEnemy, onShatter }) {
    this.scene = scene;
    this.cb = { onCrystal, onGate, onHit, onDodge, onKillEnemy, onShatter };
    this.autoSpawn = true;     // E2E 可关闭（debugSpawn 确定性测试）
    this.objs = [];
    this.bullets = [];
    this.fired = 0;            // 累计发射弹丸数（E2E 读：自动开火存在性）
    this.travel = 0;           // 世界已涌过的距离（m）
    this.nextGap = 18;         // 第一个事件很快出现
    this.events = [];          // 阻塞事件：{d: travel@spawn, cells: Set}
    this.pools = { meteor: [], crystal: [], gate: [], enemy: [], bullet: [] };
    this.enemyTpl = null;      // GLB 模板（loadEnemy 异步填充；norender 为 null → 占位 Group）

    // --- 共享几何/材质（全 Lambert / Basic，省性能）---
    this.rockyGeos = makeRockyGeos();
    this.iceGeos = makeIceGeos();
    this.rockyMats = [
      new THREE.MeshLambertMaterial({ color: 0xa08868, flatShading: true }),   // 暖灰棕
      new THREE.MeshLambertMaterial({ color: 0x8a6f52, flatShading: true }),   // 棕
      new THREE.MeshLambertMaterial({ color: 0xb0a294, flatShading: true }),   // 浅岩灰
    ];
    this.iceMats = [
      new THREE.MeshLambertMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.72, emissive: 0x2a5a8a, emissiveIntensity: 0.38, flatShading: true }),
      new THREE.MeshLambertMaterial({ color: 0xc2e2ff, transparent: true, opacity: 0.66, emissive: 0x3a6a9a, emissiveIntensity: 0.34, flatShading: true }),
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
    // 弹丸：加法混合发光细长条（泛光下炸开）
    this.bulletGeo = new THREE.BoxGeometry(0.07, 0.07, 1.5);
    this.bulletMat = new THREE.MeshBasicMaterial({
      color: 0x7fe8ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    // 爆炸池：粒子迸发 + 闪光 sprite（预分配，复用）
    this._glowTex = makeGlowTex();
    this.explosions = [];
    for (let i = 0; i < EXPLO_POOL; i++) {
      const pos = new Float32Array(EXPLO_N * 3);
      const vel = new Float32Array(EXPLO_N * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.5, map: this._glowTex, color: 0xffb050,
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      pts.frustumCulled = false;
      pts.visible = false;
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: 0xffd090, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      flash.visible = false;
      this.scene.add(pts, flash);
      this.explosions.push({ pts, flash, pos, vel, t: 0, life: 0.55, active: false });
    }
  }

  // 敌舰 GLB 模板异步加载（norender 跳过 → 占位 Group，E2E 逻辑不需要模型）
  loadEnemy(noRender) {
    if (noRender) return;
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath());
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    // ⚠️ 基于 import.meta.url 解析（Pages 子路径 /brainmend/ 下相对路径会 404）
    loader.loadAsync(new URL('../../models/ship-enemy-v1.glb', import.meta.url).href).then(gltf => {
      const tpl = gltf.scene;
      const box = new THREE.Box3().setFromObject(tpl);
      const center = box.getCenter(new THREE.Vector3());
      tpl.position.sub(center);
      const size = box.getSize(new THREE.Vector3());
      const wrap = new THREE.Group();
      wrap.add(tpl);
      wrap.scale.setScalar(3.5 / size.z);        // 等比放大到 ~3.5m 长
      // 掠射角贴图清晰度：各向异性过滤；envMapIntensity 与玩家舰一致压到 0.55（防真机偏曝）
      tpl.traverse(n => {
        if (n.isMesh && n.material) {
          const ms = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of ms) {
            if ('envMapIntensity' in m) m.envMapIntensity = 0.55;
            for (const slot of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) {
              if (m[slot]) m[slot].anisotropy = 8;
            }
          }
        }
      });
      // 朝向实证（glb-preview front/side 视图）：该导出机头朝 +Z、引擎在 -Z——
      // 与玩家视线相对即"面向玩家"，无需旋转（用户备注的 -Z 与实物相反，以截图为准）
      this.enemyTpl = wrap;
    }).catch(err => console.warn('[space3d] 敌舰模型加载失败:', err));
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
    else if (o.type === 'enemy') this.pools.enemy.push(o);
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
      mesh: new THREE.Mesh(this.rockyGeos[0], this.rockyMats[0]),
      axis: new THREE.Vector3(),
    }));
    // 两族系：~65% 岩质 / ~35% 冰晶质
    if (Math.random() < 0.65) {
      o.mesh.geometry = this.rockyGeos[(Math.random() * 3) | 0];
      o.mesh.material = this.rockyMats[(Math.random() * 3) | 0];
    } else {
      o.mesh.geometry = this.iceGeos[(Math.random() * 2) | 0];
      o.mesh.material = this.iceMats[(Math.random() * 2) | 0];
    }
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

  // 敌舰：机头朝 +Z 面向玩家，自身缓慢前冲 + 横向蛇形；撞玩家 = 同陨石伤害
  spawnEnemy(x, y, z = SPAWN_Z) {
    const o = this._take('enemy', () => ({ type: 'enemy', mesh: new THREE.Group() }));
    if (this.enemyTpl) {
      if (!o.mesh.children.length) o.mesh.add(this.enemyTpl.clone());
    }
    o.baseX = x;
    o.wigAmp = 0.6 + Math.random() * 0.5;        // 蛇形幅度
    o.wigPh = Math.random() * Math.PI * 2;
    o.r = ENEMY_R;
    o.type = 'enemy';
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

  // 弹丸：从舰艏向前 -Z 射出
  spawnBullet(x, y, z = -2.4) {
    const o = this._take('bullet', () => ({
      type: 'bullet',
      mesh: new THREE.Mesh(this.bulletGeo, this.bulletMat),
    }));
    o.x = x; o.y = y; o.z = z;
    o.mesh.position.set(x, y, z);
    this.scene.add(o.mesh);
    this.bullets.push(o);
    this.fired++;
    return o;
  }

  // 爆炸：粒子迸发 + 闪光（对象池，颜色可调——敌舰橙红 / 碎陨石青白）
  explode(x, y, z, color = 0xffb050) {
    let e = null;
    for (const c of this.explosions) if (!c.active) { e = c; break; }
    if (!e) e = this.explosions[0];              // 池满抢最旧的
    e.active = true; e.t = 0;
    e.pts.visible = true; e.flash.visible = true;
    e.pts.position.set(x, y, z);
    e.flash.position.set(x, y, z);
    e.pts.material.color.setHex(color);
    e.flash.material.color.setHex(color === 0xffb050 ? 0xffe8c0 : 0xd0f0ff);
    for (let i = 0; i < EXPLO_N; i++) {
      e.pos[i * 3] = 0; e.pos[i * 3 + 1] = 0; e.pos[i * 3 + 2] = 0;
      // 均匀球面方向 × 初速 3~10
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = 3 + Math.random() * 7;
      e.vel[i * 3] = v * s * Math.cos(th);
      e.vel[i * 3 + 1] = v * u;
      e.vel[i * 3 + 2] = v * s * Math.sin(th);
    }
    e.pts.geometry.attributes.position.needsUpdate = true;
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

  // 图案池：洗牌袋发牌（陨石/簇/水晶/门/墙/敌舰轮完一遍才重复）
  spawnPattern(z = SPAWN_Z) {
    if (!this._deal || !this._deal.length) {
      this._deal = ['meteor', 'cluster', 'crystal', 'gate', 'wall', 'meteor', 'crystal', 'enemy', 'enemy'];
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
      // 单颗陨石堵不死通道，随便放
      const x = (Math.random() * 2 - 1) * 9;
      const y = (Math.random() * 2 - 1) * 5;
      this.spawnMeteor(x, y, z);
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
    } else if (name === 'enemy') {
      // 敌舰同样只占一格（避开必留格）
      let x = 0, y = 0, tries = 0;
      do {
        x = (Math.random() * 2 - 1) * 8;
        y = (Math.random() * 2 - 1) * 4.5;
      } while (cellOf(x, y) === leave && ++tries < 20);
      this.spawnEnemy(x, y, z);
      this.events.push({ d: this.travel, cells: new Set([cellOf(x, y)]) });
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
  debugSpawnEnemy(x, y, z = -15) { return this.spawnEnemy(x, y, z); }

  clearAll() {
    for (let i = this.objs.length - 1; i >= 0; i--) this._free(this.objs[i]);
    this.objs.length = 0;
    this.events.length = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) this._freeBullet(this.bullets[i]);
    this.bullets.length = 0;
  }

  _freeBullet(b) {
    b.mesh.visible = false;
    this.scene.remove(b.mesh);
    this.pools.bullet.push(b);
  }

  // 前移 / 回收 / 动画 / 过线判定 / 弹丸命中 / 爆炸推进
  // canCollide：无敌期外才造成伤害（拾取/过门不受无敌影响）
  update(dt, speed, shipX, shipY, canCollide, gapFn) {
    this.travel += speed * dt;
    for (let i = this.objs.length - 1; i >= 0; i--) {
      const o = this.objs[i];
      o.prevZ = o.z;
      // 敌舰：世界流 + 自身前冲 + 横向蛇形
      o.z += (speed + (o.type === 'enemy' ? ENEMY_OWN_SPEED : 0)) * dt;
      o.mesh.position.z = o.z;
      o.t += dt;
      // 动画：陨石随机轴慢翻滚；水晶旋转+浮动；门呼吸；敌舰蛇形+轻微俯仰
      if (o.type === 'meteor' || o.type === 'wallblock') {
        o.mesh.rotateOnAxis(o.axis, o.rotSpeed * dt);
      } else if (o.type === 'crystal') {
        o.mesh.rotation.y += dt * 2.2;
        o.mesh.position.y = o.baseY + Math.sin(o.t * 2.5) * 0.25;
      } else if (o.type === 'gate') {
        const k = 0.95 + Math.sin(o.t * 3) * 0.3;
        o.mesh.material.emissiveIntensity = k;
      } else if (o.type === 'enemy') {
        o.x = o.baseX + Math.sin(o.t * 1.4 + o.wigPh) * o.wigAmp;
        o.mesh.position.x = o.x;
        o.mesh.rotation.z = -Math.cos(o.t * 1.4 + o.wigPh) * 0.25;   // 蛇形压坡
      }
      // 过线判定：z 从船前跨到船后的这一帧结算（帧率无关）
      if (!o.done && o.prevZ < SHIP_Z && o.z >= SHIP_Z) {
        const oy = o.type === 'crystal' ? o.mesh.position.y : o.y;
        const dist = Math.hypot(o.x - shipX, oy - shipY);
        if (o.type === 'meteor' || o.type === 'wallblock' || o.type === 'enemy') {
          if (canCollide && dist < o.r + SHIP_R) {
            o.done = true; o.hit = true;
            this.cb.onHit(o);
          } else if (dist >= o.r + SHIP_R && o.type !== 'wallblock') {
            o.done = true;
            this.cb.onDodge();      // 躲过陨石/漏过敌舰 +50
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

    // --- 弹丸：前飞 / 命中敌舰（击毁 +200）/ 命中小陨石（击碎 +25）/ 出界回收 ---
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.z -= BULLET_SPEED * dt;
      b.mesh.position.z = b.z;
      let consumed = false;
      for (let j = this.objs.length - 1; j >= 0; j--) {
        const o = this.objs[j];
        if (o.done) continue;
        const isEnemy = o.type === 'enemy';
        const isSmallRock = o.type === 'meteor' && o.r <= SHATTER_R;
        if (!isEnemy && !isSmallRock) continue;
        if (Math.abs(o.z - b.z) > 1.8) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) > (isEnemy ? ENEMY_R : o.r + 0.3)) continue;
        // 命中
        o.done = true;
        this.explode(o.x, o.y, o.z, isEnemy ? 0xffb050 : 0x9fdcff);
        this._free(o);
        this.objs.splice(j, 1);
        if (isEnemy) this.cb.onKillEnemy();
        else this.cb.onShatter();
        consumed = true;
        break;
      }
      if (consumed || b.z < -75) {
        this._freeBullet(b);
        this.bullets.splice(i, 1);
      }
    }

    // --- 爆炸推进：粒子外扩减速 + 淡出，闪光膨胀淡出 ---
    for (const e of this.explosions) {
      if (!e.active) continue;
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) {
        e.active = false;
        e.pts.visible = false; e.flash.visible = false;
        continue;
      }
      const drag = Math.exp(-dt * 2.2);
      for (let i = 0; i < EXPLO_N * 3; i++) {
        e.pos[i] += e.vel[i] * dt;
        e.vel[i] *= drag;
      }
      e.pts.geometry.attributes.position.needsUpdate = true;
      e.pts.material.opacity = 1 - k;
      const fs = 1.2 + k * 4.5;
      e.flash.scale.set(fs, fs, 1);
      e.flash.material.opacity = 0.75 * (1 - k);
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
