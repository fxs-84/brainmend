// 海风球道 · 生成器：金币排 / 障碍箱 / 双障碍留缝 / 地刺 / 斜坡高台 / 旋转摆锤 / 终点门
// 物件全是 trackGroup 子节点：世界随球道反向平移（trackGroup.x = -ballX），
// 所以碰撞只看 lane x 差（obj.userData.laneX - ballX），不用管世界坐标
import * as THREE from 'three';
import { BALL_Z } from './world.js';

const SPAWN_Z = -80;    // 图案生成距离
const KILL_Z = 6;       // 回收线（越过相机）
const COIN_R = 0.5;     // 金币碰撞半宽
const HIT_R = 0.7;      // 障碍碰撞半宽
const SPIKE_R = 1.0;    // 地刺碰撞半宽（双排加宽后的底座）
const BOB_R = 0.75;     // 摆球碰撞半宽
const Z_WIN = 0.6;      // z 判定窗口（以球 z 为基准）

// 黄黑警示条纹（地刺底座，斜纹 CanvasTexture）
function makeHazardTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f5c518';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#23262b';
  for (let i = -64; i < 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 64); g.lineTo(i + 16, 64); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 传送带纹理：紫底 + 青色箭头（箭头朝推的方向；dir=-1 用 repeat.x 取负镜像）
function makeConveyorTex(mirror = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#4a2fb8';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(120,250,250,1)';
  for (let k = 0; k < 2; k++) {
    const x0 = 2 + k * 30;
    g.beginPath();
    g.moveTo(x0, 20); g.lineTo(x0 + 14, 20); g.lineTo(x0 + 14, 10); g.lineTo(x0 + 32, 32);
    g.lineTo(x0 + 14, 54); g.lineTo(x0 + 14, 44); g.lineTo(x0, 44);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(mirror ? -2 : 2, 4);   // repeat.x 负 = 箭头镜像（推左）
  return tex;
}

// 图案分布：洗牌袋发牌（见 _bag），每种图案轮完一遍才重复，间隔 9~12m 收紧波动
// 第 1 关即全元素（无教学关）；横向位置走左/中/右槽位错落袋（见 nextSlot）

export class Spawner {
  constructor(trackGroup, world, { onCoin, onHit, onGate, onBoost, onJump, onPickup, onBumper, onMystery, onGoldcoin }) {
    this.group = trackGroup;
    this.world = world;
    this.cb = { onCoin, onHit, onGate, onBoost, onJump, onPickup, onBumper, onMystery, onGoldcoin };
    this.autoSpawn = true;      // E2E 可关闭（debugSpawn 确定性测试）
    this.gateSpawned = false;   // 终点门生成后停止图案生成
    this.level = 1;
    this.objs = [];
    this.platforms = [];        // 存活中的高台（game.js 的 groundH 查询用）
    this.gaps = [];             // 存活中的断口（game.js 的掉海判定用）
    this.conveyors = [];        // 存活中的传送带（game.js 的侧推判定用）
    this.lastDebugSpike = null;     // E2E 读弹出状态
    this.lastDebugPendulum = null;  // E2E 读 bobX
    this.lastDebugSweeper = null;   // E2E 读扫杆角度
    this.nextGap = 8;           // 第一个图案 1 秒内就出现（m）

    // 共享几何/材质（全 Lambert，省性能）
    this.coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20);
    this.coinGeo.rotateX(Math.PI / 2);   // 圆面朝玩家，绕 y 自旋
    this.coinMat = new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0x554400 });
    this.boxGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    this.boxMat = new THREE.MeshLambertMaterial({ color: 0xa8442e });
    // 地刺：黄黑警示条纹底座 + 琥珀橙自发光圆锥刺（双排错落，一眼认出危险）
    this.spikeBaseGeo = new THREE.BoxGeometry(2.0, 0.18, 1.4);
    this.spikeBaseMat = new THREE.MeshLambertMaterial({ map: makeHazardTex() });
    this.spikeConeGeo = new THREE.ConeGeometry(0.16, 0.75, 10);
    this.spikeMat = new THREE.MeshLambertMaterial({ color: 0xff8c2e, emissive: 0x7a2e00 });
    // 高台：木质箱体 + 斜坡（与球道沙面区分）
    this.platformMat = new THREE.MeshLambertMaterial({ color: 0x9c7a4e });
    // 摆锤：门架金属 + 深色带刺重锤
    this.metalMat = new THREE.MeshLambertMaterial({ color: 0x6a7078 });
    this.bobMat = new THREE.MeshLambertMaterial({ color: 0x444a55 });
    this.bobSpikeGeo = new THREE.ConeGeometry(0.12, 0.35, 8);
    // 滑箱：橙色箱子（与红棕固定箱区分）
    this.slideMat = new THREE.MeshLambertMaterial({ color: 0xd97b2e });
    // 加速带：赛车式绿色 >>> 箭头（深色底条 + 3 个亮绿箭头朝前进方向，跑动灯脉冲，一眼读出"加速"）
    this.boostBaseGeo = new THREE.BoxGeometry(2.6, 0.05, 2.2);
    this.boostBaseMat = new THREE.MeshLambertMaterial({ color: 0x14301c });
    this.boostChevGeo = new THREE.BoxGeometry(0.2, 0.07, 1.05);
    this.boostChevMat = new THREE.MeshLambertMaterial({ color: 0x39d353, emissive: 0x1d8a3a });
    // 跳台：亮蓝色弹射坡（与高台的木质色区分）
    this.jumpMat = new THREE.MeshLambertMaterial({ color: 0x3ca9ff, emissive: 0x0a3366 });
    // 扫杆：中央立柱 + 醒目红橙水平长杆
    this.sweeperRodMat = new THREE.MeshLambertMaterial({ color: 0xe0483a });
    // 道具：U 型马蹄磁铁（红身银头）= 磁吸，盾形纹章 = 护盾
    this.magnetRedMat = new THREE.MeshLambertMaterial({ color: 0xd9382c, emissive: 0x551111 });
    this.magnetTipMat = new THREE.MeshLambertMaterial({ color: 0xd8dde3 });
    this.shieldMat = new THREE.MeshLambertMaterial({ color: 0x4a9de0, emissive: 0x113a66 });
    this.shieldRimMat = new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0x554400 });
    // 断口：海面同款波浪纹理盖板（world 提供）+ 深色边缘条
    this.gapCoverMat = world.gapCoverMat;
    this.gapEdgeMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
    // 礼物盒：喜庆红盒 + 金色缎带蝴蝶结（不会误认为障碍物）
    this.giftMat = new THREE.MeshLambertMaterial({ color: 0xd9382c, emissive: 0x440e08 });
    this.giftRibbonMat = new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0x664400 });
    // 传送带：长 6m 宽 3m，箭头纹理 offset 滚动（两个方向各一张共享纹理）
    this.conveyorGeo = new THREE.BoxGeometry(3, 0.07, 6);
    this.conveyorTexR = makeConveyorTex(false);
    this.conveyorTexL = makeConveyorTex(true);
    // 弹力柱：弹珠台圆柱（红白配色，一点自发光）
    this.bumperGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.0, 16);
    this.bumperMat = new THREE.MeshLambertMaterial({ color: 0xe0483a, emissive: 0x551111 });
    this.bumperBandGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.18, 16);
    this.bumperBandMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
    // 金色大金币：2 倍大（半径 0.64），值 50 分
    this.goldGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.12, 24);
    this.goldGeo.rotateX(Math.PI / 2);
    this.goldMat = new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0x886600 });
  }

  _add(type, mesh, laneX) {
    mesh.userData.laneX = laneX;
    this.group.add(mesh);
    this.objs.push({ type, mesh, done: false });
    return this.objs[this.objs.length - 1];
  }

  spawnCoin(laneX, z = SPAWN_Z, y = 0.55) {
    const m = new THREE.Mesh(this.coinGeo, this.coinMat);
    m.position.set(laneX, y, z);
    const o = this._add('coin', m, laneX);
    o.y = y;   // 金币高度（高台台面上的金币只有开上台才吃得到）
    return o;
  }

  spawnObstacle(laneX, z = SPAWN_Z) {
    const m = new THREE.Mesh(this.boxGeo, this.boxMat);
    m.position.set(laneX, 0.5, z);
    return this._add('box', m, laneX);
  }

  // 地刺：警示条纹底座 + 双排 10 根琥珀橙圆锥刺（高低错落），按周期弹出/缩回
  // （周期 1.6s，弹出 0.7s，相位随机）；只有弹出状态才造成伤害
  // 40% 概率是滑动地刺（slideAmp=1.2，0.4Hz 左右游走，看节奏+跟轨迹双重挑战）
  spawnSpike(laneX, z = SPAWN_Z, phase = Math.random() * 1.6, slideAmp = Math.random() < 0.4 ? 1.2 : 0) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(this.spikeBaseGeo, this.spikeBaseMat);
    base.position.y = 0.09;
    const cones = new THREE.Group();
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(this.spikeConeGeo, this.spikeMat);
        const h = 0.8 + ((row * 5 + i) % 3) * 0.15;      // 0.8~1.1 高低错落
        c.scale.y = h;
        c.position.set(-0.8 + i * 0.4 + (row ? 0.2 : 0), 0.18 + 0.375 * h, row ? 0.35 : -0.35);
        cones.add(c);
      }
    }
    g.add(base, cones);
    g.position.set(laneX, 0, z);
    const o = this._add('spike', g, laneX);
    o.t = 0; o.phase = phase; o.up = false; o.cones = cones;
    o.baseX = laneX; o.slideAmp = slideAmp; o.slidePhase = Math.random() * Math.PI * 2;
    return o;
  }

  // 斜坡高台：贴齐球道边缘内缩（外缘 = 路边 3.5，不悬出海面），宽 1.4 长 8 高 0.9，近端 2m 斜坡
  // 台面上放 2~3 个金币（y = 台高 + 0.5）——考验控制：贴边开上台吃币，开过 3.8 掉海
  spawnPlatform(laneX = 2.8, z = SPAWN_Z) {
    const W = 1.4, L = 8, H = 0.9, RAMP = 2;
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, H, L - RAMP), this.platformMat);
    deck.position.set(0, H / 2, -RAMP / 2);            // 台面占远端 6m
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, Math.hypot(RAMP, H)), this.platformMat);
    ramp.position.set(0, H / 2, L / 2 - RAMP / 2);     // 斜坡占近端 2m
    ramp.rotation.x = Math.atan2(H, RAMP);             // 近端贴地、远端接台面
    g.add(deck, ramp);
    g.position.set(laneX, 0, z);
    const o = this._add('platform', g, laneX);
    o.w = W; o.len = L; o.h = H; o.ramp = RAMP;
    this.platforms.push(o);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) this.spawnCoin(laneX, z - 1.5 - i * 1.5, H + 0.5);
    return o;
  }

  // 旋转大摆锤：门架跨球道，摆臂在 x-y 平面横扫，末端带刺重锤
  // angle = 0.9rad * sin(2π t / 2.2s + φ)，φ 随机；玩家等摆锤荡开时从反方向通过
  spawnPendulum(z = SPAWN_Z, phase = Math.random() * Math.PI * 2) {
    const ARM = 3.3, TOP = 4.5;
    const g = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.25, TOP, 0.25);
    const pl = new THREE.Mesh(postGeo, this.metalMat); pl.position.set(-4.1, TOP / 2, 0);
    const pr = new THREE.Mesh(postGeo, this.metalMat); pr.position.set(4.1, TOP / 2, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.55, 0.3, 0.3), this.metalMat);
    beam.position.set(0, TOP + 0.15, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0, TOP, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ARM, 8), this.metalMat);
    arm.position.y = -ARM / 2;
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), this.bobMat);
    bob.position.y = -ARM;
    // 重锤尖刺（六向）
    const up = new THREE.Vector3(0, 1, 0);
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const dir = new THREE.Vector3(...d);
      const s = new THREE.Mesh(this.bobSpikeGeo, this.bobMat);
      s.position.copy(dir).multiplyScalar(0.55);
      s.quaternion.setFromUnitVectors(up, dir);
      bob.add(s);
    }
    pivot.add(arm, bob);
    g.add(pl, pr, beam, pivot);
    g.position.set(0, 0, z);
    const o = this._add('pendulum', g, 0);
    o.t = 0; o.phase = phase; o.pivot = pivot; o.armLen = ARM; o.top = TOP;
    o.bobX = 0; o.bobY = TOP - ARM;
    return o;
  }

  // 滑箱：在 lanes 上左右滑动的箱子，x(t) = baseX + amp·sin(2π·0.5Hz·t + φ)
  spawnSlide(laneX, z = SPAWN_Z, amp = 1.5, phase = Math.random() * Math.PI * 2) {
    const m = new THREE.Mesh(this.boxGeo, this.slideMat);
    m.position.set(laneX, 0.5, z);
    const o = this._add('slide', m, laneX);
    o.t = 0; o.baseX = laneX; o.amp = amp; o.phase = phase;
    return o;
  }

  // 加速带：赛车式绿色 >>> 箭头（深色底条 + 3 个亮绿箭头朝前进方向跑动灯脉冲，一眼读出"加速"）
  // 碾过 3 秒内 speed×1.6、得分×2
  spawnBoost(laneX = 0, z = SPAWN_Z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(this.boostBaseGeo, this.boostBaseMat);
    base.position.y = 0.025;
    g.add(base);
    const chevs = [];
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.Group();
      const b1 = new THREE.Mesh(this.boostChevGeo, this.boostChevMat);
      const b2 = new THREE.Mesh(this.boostChevGeo, this.boostChevMat);
      b1.rotation.y = -0.55; b2.rotation.y = 0.55;    // 两根斜条拼成 >（尖朝 -z 前进方向）
      b1.position.x = -0.32; b2.position.x = 0.32;
      chev.add(b1, b2);
      chev.position.set(0, 0.08, 0.7 - i * 0.7);
      g.add(chev);
      chevs.push(chev);
    }
    g.position.set(laneX, 0, z);
    const o = this._add('boost', g, laneX);
    o.t = 0; o.chevs = chevs;
    return o;
  }

  // 跳台：亮蓝弹射坡；球冲上 → vy=4.5 起跳（重力 -12，空中免疫地面碰撞）
  // 上方配 4 个金币弧（按 vy=4.5/g=-12 弹道峰值 ~1.4 布置，空中才吃得到）
  spawnJump(laneX, z = SPAWN_Z) {
    const g = new THREE.Group();
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, Math.hypot(2, 0.5)), this.jumpMat);
    wedge.position.set(0, 0.25, 0);
    wedge.rotation.x = Math.atan2(0.5, 2);      // 近端贴地、远端抬高 0.5
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.12), this.jumpMat);
    lip.position.set(0, 0.25, -1.05);           // 坡顶竖板（读感：弹射边缘）
    g.add(wedge, lip);
    g.position.set(laneX, 0, z);
    this._add('jump', g, laneX);
    // 金币弧：起跳后 0.1~0.5s 的弹道沿线（z 在跳台前方，y 1.1~1.6）
    const arc = [[-1, 1.1], [-2, 1.5], [-3, 1.6], [-4, 1.4]];
    for (const [dz, y] of arc) this.spawnCoin(laneX, z + dz, y);
  }

  // 旋转扫杆：中央立柱 + 水平长杆（长 4.5，距地 0.5），水平面旋转，周期 2.5s
  // 玩家策略：等杆转到与球道平行（顺路）时从旁边钻过
  spawnSweeper(laneX, z = SPAWN_Z, phase = Math.random() * Math.PI * 2) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10), this.metalMat);
    post.position.y = 0.5;
    const rotor = new THREE.Group();
    rotor.position.y = 0.5;
    const rod = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 0.12), this.sweeperRodMat);
    rotor.add(rod);
    g.add(post, rotor);
    g.position.set(laneX, 0, z);
    const o = this._add('sweeper', g, laneX);
    o.t = 0; o.phase = phase; o.rotor = rotor; o.angle = phase;
    return o;
  }

  // 道具：'magnet'=U 型马蹄磁铁（红身银头，一眼读出"吸"）/ 'shield'=盾形纹章（金徽蓝盾，挡 1 次撞击）
  spawnPickup(kind, laneX, z = SPAWN_Z) {
    let m;
    if (kind === 'magnet') {
      m = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 10, 18, Math.PI), this.magnetRedMat);
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10), this.magnetTipMat);
      const t2 = t1.clone();
      t1.position.set(-0.3, -0.1, 0); t2.position.set(0.3, -0.1, 0);   // 两个银色磁极
      m.add(arc, t1, t2);
    } else {
      m = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(-0.32, 0.35); shape.lineTo(0.32, 0.35); shape.lineTo(0.32, 0.0);
      shape.quadraticCurveTo(0.32, -0.28, 0, -0.42);
      shape.quadraticCurveTo(-0.32, -0.28, -0.32, 0.0);
      shape.closePath();
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), this.shieldMat);
      body.position.z = -0.05;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 16), this.shieldRimMat);
      rim.position.set(0, 0.06, 0.06);              // 盾面中央金色圆徽
      m.add(body, rim);
    }
    m.position.set(laneX, 0.9, z);
    const o = this._add('pickup', m, laneX);
    o.kind = kind; o.t = 0; o.y = 0.9;
    return o;
  }

  // 断桥：球道断口长 4m（海面色盖板 + 两端深色边缘条），近端边缘前 1m 自动配弹射坡——
  // 冲坡飞起可越过；不跳直接进断口必掉海（game.js 判定，牌袋每袋最多 1 个）
  // 注：坡必须贴近断口（vy=4.5/g=-12 弹道射程恰 6m；配合触发窗 ±0.6m 的最坏情况，
  //     落点仍能保证在断口致命区之外——放 2m 外会在断口尾端落地坠海）
  spawnGap(z = SPAWN_Z, withJump = true) {
    const L = 4;
    const g = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, L), this.gapCoverMat);
    cover.position.y = 0.08;
    const edgeGeo = new THREE.BoxGeometry(7.2, 0.14, 0.3);
    const e1 = new THREE.Mesh(edgeGeo, this.gapEdgeMat); e1.position.set(0, 0.07, L / 2);
    const e2 = new THREE.Mesh(edgeGeo, this.gapEdgeMat); e2.position.set(0, 0.07, -L / 2);
    g.add(cover, e1, e2);
    g.position.set(0, 0, z);
    const o = this._add('gap', g, 0);
    o.len = L;
    this.gaps.push(o);
    if (withJump) this.spawnJump(0, z + L / 2 + 1);   // 断口近端边缘前 1m 弹射坡
    return o;
  }

  // 反向传送带：长 6m 宽 3m，球在带上目标位被推偏 2.0m（箭头纹理与推力同向）
  // 突发元素：从路面下升起出现（pop 动画见 update）
  spawnConveyor(laneX = 0, z = SPAWN_Z, dir = Math.random() < 0.5 ? 1 : -1) {
    const tex = dir > 0 ? this.conveyorTexR : this.conveyorTexL;
    const m = new THREE.Mesh(this.conveyorGeo,
      new THREE.MeshLambertMaterial({ map: tex, emissive: 0x4a4a4a, emissiveMap: tex }));   // 箭头发光，老远可读
    m.position.set(laneX, -0.4, z);                 // 从路面下升起（突然出现）
    const o = this._add('conveyor', m, laneX);
    o.dir = dir; o.len = 6; o.pop = 0;
    this.conveyors.push(o);
    return o;
  }

  // 弹力柱：弹珠台圆柱，撞上不扣心——给球一个远离柱子的横向冲量，+5 分
  spawnBumper(laneX, z = SPAWN_Z) {
    const g = new THREE.Group();
    const col = new THREE.Mesh(this.bumperGeo, this.bumperMat);
    col.position.y = 0.5;
    const band = new THREE.Mesh(this.bumperBandGeo, this.bumperBandMat);
    band.position.y = 0.5;
    g.add(col, band);
    g.position.set(laneX, 0, z);
    return this._add('bumper', g, laneX);
  }

  // 礼物盒：红盒 + 金色缎带十字 + 蝴蝶结（不会误认为障碍物），拾取随机奖励（50% 金币雨 +80 / 25% 护盾 / 25% 磁吸）
  spawnMystery(laneX, z = SPAWN_Z) {
    const m = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), this.giftMat);
    const ribX = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.52, 0.14), this.giftRibbonMat);
    const ribZ = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.57), this.giftRibbonMat);
    const bowGeo = new THREE.BoxGeometry(0.2, 0.1, 0.1);
    const bow1 = new THREE.Mesh(bowGeo, this.giftRibbonMat);
    bow1.position.set(-0.1, 0.3, 0); bow1.rotation.z = 0.5;
    const bow2 = new THREE.Mesh(bowGeo, this.giftRibbonMat);
    bow2.position.set(0.1, 0.3, 0); bow2.rotation.z = -0.5;
    m.add(box, ribX, ribZ, bow1, bow2);
    m.position.set(laneX, 0.9, z);
    const o = this._add('mystery', m, laneX);
    o.t = 0; o.y = 0.9;
    return o;
  }

  // 金色大金币：2 倍大，值 50 分，缓慢左右游走（x = baseX + 1.2·sin(2π·0.3Hz·t)）
  spawnGoldcoin(laneX, z = SPAWN_Z, amp = 1.2, phase = Math.random() * Math.PI * 2) {
    const m = new THREE.Mesh(this.goldGeo, this.goldMat);
    m.position.set(laneX, 0.55, z);
    const o = this._add('goldcoin', m, laneX);
    o.t = 0; o.baseX = laneX; o.amp = amp; o.phase = phase; o.y = 0.55;
    return o;
  }

  // 终点门（世界坐标 lane 0，门框横跨球道）
  spawnGate(z) {
    const g = this.world.createGate();
    g.position.set(0, 0, z);
    this._add('gate', g, 0);
    this.gateSpawned = true;
  }

  // 图案池：洗牌袋发牌——每种图案轮完一遍才重复，杜绝纯随机的"有时候扎堆、有时候很久不来"；
  // 第 1 关即全元素（无教学关，直接开始）；ballX 供突发元素（传送带）跟球落点
  spawnPattern(z = SPAWN_Z, ballX = null) {
    if (!this._deal || !this._deal.length) this._deal = this._bag();
    this._spawnNamed(this._deal.pop(), z, ballX);
  }

  _bag() {
    // 第 1 关即全元素（18 个/袋，gap 每袋最多 1 个）；第 2 关起同款 + box/spikes 加密
    const base = this.level <= 1
      ? ['coins', 'coins', 'box', 'double', 'spikes', 'spikes', 'platform', 'pendulum', 'slide', 'boost',
         'jump', 'sweeper', 'pickup', 'gap', 'conveyor', 'bumper', 'mystery', 'goldcoin']
      : ['coins', 'coins', 'box', 'double', 'spikes', 'spikes', 'platform', 'pendulum', 'slide', 'boost',
         'jump', 'sweeper', 'pickup', 'gap', 'conveyor', 'bumper', 'mystery', 'goldcoin', 'box', 'spikes'];
    for (let i = base.length - 1; i > 0; i--) {   // Fisher-Yates 洗牌
      const j = Math.floor(Math.random() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base;
  }

  // 开局/关初预铺：正常生成在 80m 外（SPAWN_Z），直接跑要 ~10s 才有东西到眼前，
  // 先在眼前 18~74m 铺 5 个图案，第一秒就有东西可吃可躲
  prewarm() {
    for (let i = 0; i < 5; i++) this.spawnPattern(-18 - i * 14);
    this.nextGap = 6;
  }

  // 横向位置错落袋：左/中/右三个槽位轮完才重复——不管什么元素，连续几个图案必然
  // 在球道上错开分布（用户痛点：纯随机导致同类元素连出在同一侧、全挤中间）
  nextSlot() {
    if (!this._posBag || !this._posBag.length) {
      this._posBag = [-1, 0, 1];
      for (let i = 2; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._posBag[i], this._posBag[j]] = [this._posBag[j], this._posBag[i]];
      }
    }
    return this._posBag.pop();
  }

  // 槽位 × range + 小抖动；range 按元素占宽选定（不超出球道）
  nextX(range, jitter = 0.3) {
    return this.nextSlot() * range + (Math.random() * 2 - 1) * jitter;
  }

  // 高台左右交替袋（贴边元素只需要选边）
  nextSide() {
    if (!this._sideBag || !this._sideBag.length) {
      this._sideBag = Math.random() < 0.5 ? [1, -1] : [-1, 1];
    }
    return this._sideBag.pop();
  }

  _spawnNamed(name, z = SPAWN_Z, ballX = null) {
    if (name === 'coins') {
      const n = 4 + Math.floor(Math.random() * 3);    // 4~6 个一列（单排，不再双排）
      const x = this.nextX(2.4, 0.4);
      for (let i = 0; i < n; i++) this.spawnCoin(x, z - i * 1.4);
    } else if (name === 'box') {
      this.spawnObstacle(this.nextX(2.5, 0.4), z);
    } else if (name === 'double') {
      const gapX = this.nextX(0.8, 0.2);              // 留缝中心
      this.spawnObstacle(gapX - 2.05, z);
      this.spawnObstacle(gapX + 2.05, z);
    } else if (name === 'spikes') {
      this.spawnSpike(this.nextX(2.2, 0.3), z);
    } else if (name === 'platform') {
      this.spawnPlatform(this.nextSide() * 2.8, z);   // ±2.8 + 半宽 0.7 = 外缘 3.5，贴齐路边，左右交替
    } else if (name === 'slide') {
      this.spawnSlide(this.nextX(1.0, 0.3), z);       // amp 1.5 → 活动范围 ≤2.8
    } else if (name === 'boost') {
      this.spawnBoost(this.nextX(1.5, 0.4), z);
    } else if (name === 'jump') {
      this.spawnJump(this.nextX(1.5, 0.3), z);
    } else if (name === 'sweeper') {
      this.spawnSweeper(this.nextX(1.2, 0.3), z);
    } else if (name === 'pickup') {
      this.spawnPickup(Math.random() < 0.5 ? 'magnet' : 'shield', this.nextX(1.8, 0.4), z);
    } else if (name === 'gap') {
      this.spawnGap(z);
    } else if (name === 'conveyor') {
      // 突发干扰（用户设计）：不在 80m 外预生成让玩家提前避让——直接在眼前 5m 从路面
      // 升起（约 0.6s 反应窗口），且落点跟着球（躲无可躲），考验突发状况下的反应和头颈稳定控制
      if (z === SPAWN_Z && ballX != null) {
        const x = Math.max(-2, Math.min(2, ballX + (Math.random() * 2 - 1) * 0.5));
        this.spawnConveyor(x, -10);
      } else {
        this.spawnConveyor(this.nextX(1.0, 0.3), z);   // 预铺/调试：正常槽位
      }
    } else if (name === 'bumper') {
      const n = 2 + Math.floor(Math.random() * 2);    // 2~3 个弹力柱，候选位洗牌取前 n 个
      const xs = [-2.2, -1.1, 0, 1.1, 2.2].sort(() => Math.random() - 0.5).slice(0, n);
      for (const x of xs) this.spawnBumper(x, z);
    } else if (name === 'mystery') {
      this.spawnMystery(this.nextX(1.8, 0.4), z);
    } else if (name === 'goldcoin') {
      this.spawnGoldcoin(this.nextX(1.8, 0.4), z);
    } else {
      this.spawnPendulum(z);
    }
  }

  // E2E 调试：在球的当前车道近处生成（确定性碰撞测试）
  debugSpawnCoin(x, z = -15) { this.spawnCoin(x, z); }
  debugSpawnObstacle(x, z = -15) { this.spawnObstacle(x, z); }
  debugSpawnSpike(x, z = -15, phase = 0) { this.lastDebugSpike = this.spawnSpike(x, z, phase, 0); }   // 测试固定不滑动
  debugSpawnPlatform(x = 2.8, z = -8) { return this.spawnPlatform(x, z); }
  debugSpawnPendulum(z = -15, phase = 0) { this.lastDebugPendulum = this.spawnPendulum(z, phase); }
  debugSpawnSlide(x, z = -15, amp = 1.5, phase = 0) { return this.spawnSlide(x, z, amp, phase); }
  debugSpawnBoost(x = 0, z = -15) { return this.spawnBoost(x, z); }
  debugSpawnJump(x, z = -15) { return this.spawnJump(x, z); }
  debugSpawnSweeper(x, z = -15, phase = 0) { this.lastDebugSweeper = this.spawnSweeper(x, z, phase); }
  debugSpawnPickup(kind, x = 0, z = -15) { return this.spawnPickup(kind, x, z); }
  debugSpawnGap(z = -15, withJump = false) { return this.spawnGap(z, withJump); }
  debugSpawnConveyor(x = 0, dir = 1, z = -15) { return this.spawnConveyor(x, z, dir); }
  debugSpawnBumper(x, z = -15) { return this.spawnBumper(x, z); }
  debugSpawnMystery(x = 0, z = -15) { return this.spawnMystery(x, z); }
  debugSpawnGoldcoin(x, z = -15, amp = 0) { return this.spawnGoldcoin(x, z, amp); }

  clearAll() {
    for (const o of this.objs) this.group.remove(o.mesh);
    this.objs.length = 0;
    this.platforms.length = 0;
    this.gaps.length = 0;
    this.conveyors.length = 0;
    this.lastDebugSpike = null;
    this.lastDebugPendulum = null;
    this.lastDebugSweeper = null;
  }

  // 前移(+z) / 回收 / 动画（地刺弹出、摆锤摆动、滑箱滑动、扫杆旋转、道具浮沉）/ 磁吸 / 碰撞检测
  // magnetOn：磁吸道具生效中，2.5 半径内金币被拉向球
  update(dt, speed, ballX, canCollide, ballY = 0.55, magnetOn = false) {
    let fireGate = false;   // 冲线回调延迟到循环后：onGate 会 clearAll()，循环内直接调会让迭代器踩空
    const airborne = ballY > 1.2;   // 跳台腾空：免疫地面碰撞（箱子/地刺/滑箱/扫杆）
    for (let i = this.objs.length - 1; i >= 0; i--) {
      const o = this.objs[i];
      o.mesh.position.z += speed * dt;
      const dz = o.mesh.position.z - BALL_Z;
      // 各类型动画
      if (o.type === 'coin') o.mesh.rotation.y += dt * 4;      // 金币旋转
      if (o.type === 'spike') {                                 // 地刺弹出/缩回（滑动地刺同时左右游走）
        o.t += dt;
        o.up = ((o.t + o.phase) % 1.6) < 0.7;
        const targetY = o.up ? 0 : -0.6;
        o.cones.position.y += (targetY - o.cones.position.y) * Math.min(1, dt * 14);
        if (o.slideAmp) {
          const x = o.baseX + o.slideAmp * Math.sin(2 * Math.PI * 0.4 * o.t + o.slidePhase);
          o.mesh.position.x = x;
          o.mesh.userData.laneX = x;
        }
      }
      if (o.type === 'boost' && o.chevs) {                      // 加速带 >>> 箭头跑动灯
        o.t += dt;
        o.chevs.forEach((c, i) => {
          c.position.y = 0.08 + Math.max(0, Math.sin(o.t * 6 - i * 1.2)) * 0.12;
        });
      }
      if (o.type === 'conveyor' && o.pop < 1) {                 // 传送带从路面下升起（突然出现）
        o.pop = Math.min(1, o.pop + dt * 3.5);
        o.mesh.position.y = -0.4 + 0.48 * o.pop;
      }
      if (o.type === 'pendulum') {                              // 摆锤横扫
        o.t += dt;
        const angle = 0.9 * Math.sin(2 * Math.PI * o.t / 2.2 + o.phase);
        o.pivot.rotation.z = angle;
        o.bobX = o.armLen * Math.sin(angle);
        o.bobY = o.top - o.armLen * Math.cos(angle);
      }
      if (o.type === 'slide') {                                 // 滑箱左右滑动
        o.t += dt;
        const x = o.baseX + o.amp * Math.sin(2 * Math.PI * 0.5 * o.t + o.phase);
        o.mesh.position.x = x;
        o.mesh.userData.laneX = x;
      }
      if (o.type === 'sweeper') {                               // 扫杆水平旋转（杆方向 (cosθ, sinθ)，在 x-z 平面）
        o.t += dt;
        o.angle = 2 * Math.PI * o.t / 2.5 + o.phase;
        o.rotor.rotation.y = -o.angle;
      }
      if (o.type === 'pickup') {                                // 道具悬浮自旋
        o.t += dt;
        o.mesh.rotation.y += dt * 2.5;
        o.mesh.position.y = 0.9 + Math.sin(o.t * 3) * 0.15;
        o.y = o.mesh.position.y;
      }
      if (o.type === 'mystery') {                               // 盲盒悬浮自旋
        o.t += dt;
        o.mesh.rotation.y += dt * 2.2;
        o.mesh.position.y = 0.9 + Math.sin(o.t * 3) * 0.15;
        o.y = o.mesh.position.y;
      }
      if (o.type === 'goldcoin') {                              // 大金币游走 + 自旋
        o.t += dt;
        const x = o.baseX + o.amp * Math.sin(2 * Math.PI * 0.3 * o.t + o.phase);
        o.mesh.position.x = x;
        o.mesh.userData.laneX = x;
        o.mesh.rotation.y += dt * 3;
      }
      if (o.type === 'conveyor') {                              // 传送带箭头滚动（方向 = 推力方向）
        o.mesh.material.map.offset.x += o.dir * dt * 0.5;
      }
      // 磁吸：范围内的金币被拉向球（位置/车道/高度同步，之后走正常吃币判定）
      if (magnetOn && o.type === 'coin') {
        const mx = ballX - o.mesh.position.x;
        const my = ballY - o.mesh.position.y;
        const mz = BALL_Z - o.mesh.position.z;
        const dist = Math.hypot(mx, my, mz);
        if (dist < 2.5 && dist > 1e-3) {
          const pull = Math.min(1, dt * 6);
          o.mesh.position.x += mx * pull;
          o.mesh.position.y += my * pull;
          o.mesh.position.z += mz * pull;
          o.mesh.userData.laneX = o.mesh.position.x;
          o.y = o.mesh.position.y;
        }
      }
      // 碰撞（金币单独处理：磁吸生效时按 3D 距离直接吸入，不卡 z 窗——
      // 被吸的金币会悬停在球前方平衡点上，永远等不到 z 窗对齐）
      if (!o.done && canCollide && o.type === 'coin') {
        const dx = Math.abs(o.mesh.userData.laneX - ballX);
        const normal = Math.abs(dz) < Z_WIN && dx < COIN_R && Math.abs(ballY - o.y) < 0.6;
        const sucked = magnetOn
          && Math.hypot(o.mesh.position.x - ballX, o.mesh.position.y - ballY, o.mesh.position.z - BALL_Z) < 0.9;
        if (normal || sucked) {
          o.done = true;
          this.group.remove(o.mesh);
          this.objs.splice(i, 1);
          this.cb.onCoin();
          continue;
        }
      }
      // 碰撞
      if (!o.done && canCollide && Math.abs(dz) < Z_WIN) {
        const dx = Math.abs(o.mesh.userData.laneX - ballX);
        if (o.type === 'box' && dx < HIT_R && !airborne) {
          o.done = true;        // 一个箱子只撞一次
          this.cb.onHit(o);
        }
        if (o.type === 'slide' && dx < HIT_R && !airborne) {
          o.done = true;
          this.cb.onHit(o);
        }
        if (o.type === 'spike' && o.up && dx < SPIKE_R && !airborne) {   // 只有弹出才伤害，缩回可安全碾过
          o.done = true;
          this.cb.onHit(o);
        }
        if (o.type === 'pendulum' && o.bobY < 1.4 && Math.abs(ballX - o.bobX) < BOB_R) {
          o.done = true;        // 摆球在低位且压到球车道才伤害
          this.cb.onHit(o);
        }
        if (o.type === 'boost' && dx < 1.3) {                 // 加速带：碾过触发（不消失也行，过了就回收）
          o.done = true;
          this.cb.onBoost();
        }
        if (o.type === 'jump' && dx < 0.9 && ballY < 1.0) {   // 跳台：贴地冲上才弹射
          o.done = true;
          this.cb.onJump();
        }
        if (o.type === 'pickup' && dx < 0.6 && Math.abs(ballY - o.y) < 0.7) {
          o.done = true;
          this.group.remove(o.mesh);
          this.objs.splice(i, 1);
          this.cb.onPickup(o.kind);
          continue;
        }
        if (o.type === 'mystery' && dx < 0.7 && Math.abs(ballY - o.y) < 0.7) {
          o.done = true;
          this.group.remove(o.mesh);
          this.objs.splice(i, 1);
          this.cb.onMystery();
          continue;
        }
        if (o.type === 'goldcoin' && dx < 0.6 && Math.abs(ballY - o.y) < 0.6) {
          o.done = true;
          this.group.remove(o.mesh);
          this.objs.splice(i, 1);
          this.cb.onGoldcoin();
          continue;
        }
        if (o.type === 'bumper' && dx < 0.8 && !airborne) {
          o.done = true;        // 弹力柱：不扣心，给远离柱子的横向冲量
          this.cb.onBumper(ballX >= o.mesh.userData.laneX ? 1 : -1);
        }
      }
      // 扫杆：杆长覆盖 z 范围大，不能只卡 z 窗——球到杆所在直线距离 <0.5 且投影在杆长范围内即命中
      if (o.type === 'sweeper' && !o.done && canCollide && !airborne) {
        const pdx = ballX - o.mesh.userData.laneX;
        const pdz = BALL_Z - o.mesh.position.z;
        const c = Math.cos(o.angle), s = Math.sin(o.angle);
        const perp = Math.abs(pdx * s - pdz * c);   // 到杆所在直线的距离
        const proj = Math.abs(pdx * c + pdz * s);   // 沿杆方向的投影
        if (perp < 0.5 && proj < 2.25) {
          o.done = true;
          this.cb.onHit(o);
        }
      }
      if (!o.done && o.type === 'gate' && dz >= 0) {
        o.done = true;          // 冲线只触发一次
        fireGate = true;
      }
      if (o.mesh.position.z > KILL_Z) {   // 越过相机回收
        this.group.remove(o.mesh);
        if (o.type === 'platform') {
          const k = this.platforms.indexOf(o);
          if (k >= 0) this.platforms.splice(k, 1);
        }
        if (o.type === 'gap') {
          const k = this.gaps.indexOf(o);
          if (k >= 0) this.gaps.splice(k, 1);
        }
        if (o.type === 'conveyor') {
          const k = this.conveyors.indexOf(o);
          if (k >= 0) this.conveyors.splice(k, 1);
        }
        this.objs.splice(i, 1);
      }
    }
    // 距离驱动的图案生成：每 9~12m 一个（8 m/s 下约 1.1~1.5s 一件事），密度随关卡提升
    if (this.autoSpawn && !this.gateSpawned) {
      this.nextGap -= speed * dt;
      if (this.nextGap <= 0) {
        this.spawnPattern(SPAWN_Z, ballX);
        this.nextGap = Math.max(7, 9 + Math.random() * 3 - this.level * 0.4);
      }
    }
    if (fireGate) this.cb.onGate();   // 循环结束后再回调（onGate 内部会 clearAll）
  }
}
