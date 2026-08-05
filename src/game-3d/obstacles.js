// 障碍车池（sedan / suv / bus）+ 街景装饰（路灯+树）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { LANES_X } from './assets/road.js';
import { WorldCurve } from './curve.js';

// 玩家不换（哈雷）。障碍车用 products 目录里 v3 的多色款式，每类随机抽一款
const CAR_FILES = [
  // 轿车（5 色）
  '../../models/car-sedan-red-v3.glb',
  '../../models/car-sedan-blue-v3.glb',
  '../../models/car-sedan-green-v3.glb',
  '../../models/car-sedan-yellow-v3.glb',
  '../../models/car-sedan-gray-v3.glb',
  // SUV（5 色）
  '../../models/car-suv-black-v3.glb',
  '../../models/car-suv-green-v3.glb',
  '../../models/car-suv-silver-v3.glb',
  '../../models/car-suv-navy-v3.glb',
  '../../models/car-suv-wine-v3.glb',
  // 公交（5 色）
  '../../models/car-bus-blue-v3.glb',
  '../../models/car-bus-green-v3.glb',
  '../../models/car-bus-red-v3.glb',
  '../../models/car-bus-white-v3.glb',
  '../../models/car-bus-yellow-v3.glb',
];
// 模型原始尺寸过小：轿车 1.09m → 4.4m / SUV 1.09m → 4.6m / 公交 1.13m → 9.0m
// v3 系列每 5 个同款，scale 索引 = floor(i / 5)
const CAR_SCALES = [
  4.0, 4.0, 4.0, 4.0, 4.0,    // 轿车
  4.2, 4.2, 4.2, 4.2, 4.2,    // SUV
  8.0, 8.0, 8.0, 8.0, 8.0,    // 公交
];
// 不再 hueShift：每个 GLB 自带颜色（v3 = 5 色真实材质）
const HUES = [0];

function hueShader(hueDeg) {
  return (shader) => {};
}

export class ObstaclePool {
  constructor() {
    this.templates = [];
    this.active = [];   // 活跃障碍 {mesh, lane, speed, scored}
    this.group = new THREE.Group();
    this.loaded = false;
  }

  async load(manager) {
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(draco);
    for (let fi = 0; fi < CAR_FILES.length; fi++) {
      const f = CAR_FILES[fi];
      const gltf = await loader.loadAsync(f);
      const tpl = gltf.scene;
      const box = new THREE.Box3().setFromObject(tpl);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      tpl.position.sub(center);
      tpl.position.y -= box.min.y - center.y;
      // 放大到真实车尺寸（底部保持在地面：居中后模型底部在局部 y=0，缩放不影响）
      const s = CAR_SCALES[fi];
      tpl.scale.setScalar(s);
      // 碰撞盒半尺寸（rotation.y=π 不改变轴向尺寸）
      tpl.userData.halfX = (size.x / 2) * s;
      tpl.userData.halfZ = (size.z / 2) * s;
      tpl.traverse(n => {
        if (n.isMesh && n.material) {
          const m = Array.isArray(n.material) ? n.material : [n.material];
          m.forEach(x => {
            x.side = THREE.FrontSide;
            // GLTF 是 sRGB 贴图，避免被 ACESFilmic + 默认 linear 输入吞掉颜色
            if ('map' in x && x.map) x.map.colorSpace = THREE.SRGBColorSpace;
            if ('emissiveMap' in x && x.emissiveMap) x.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          });
        }
      });
      // 障碍车朝向（加载时不转，spawn 时统一设，可用快捷键实时调）
      tpl.visible = false;
      this.group.add(tpl);
      this.templates.push(tpl);
    }
    this.loaded = true;
  }

  spawn(z, laneIdx, speed) {
    if (this.templates.length === 0) {
      console.warn('[obstacles] spawn 时模板为空');
      return;
    }
    const tplIdx = Math.floor(Math.random() * this.templates.length);
    const tpl = this.templates[tplIdx];
    // 克隆：v3 自带颜色，材质不替换（共享一份即可，节省 GPU）
    const inst = tpl.clone(true);
    inst.visible = true;
    inst.traverse(n => { if (n.isMesh) n.visible = true; });
    inst.position.set(LANES_X[laneIdx], 0, z);
    // v3 模型车头沿 +Z；旋转 π 后车头朝 -Z（与玩家同向，可被超车）
    inst.rotation.set(0, Math.PI, 0);
    this.group.add(inst);
    this.active.push({
      mesh: inst, lane: laneIdx, speed, scored: false,
      halfX: tpl.userData.halfX, halfZ: tpl.userData.halfZ,
    });
  }

  // 障碍物向玩家流来：玩家固定 z=0，障碍以 (worldSpeed - o.speed) 向 +Z 流
  // o.speed 慢于 worldSpeed，所以相对速度 > 0，障碍从 -Z 流向玩家
  update(dt, worldSpeed, playerZ, onCollide, onDodge) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.mesh.position.z += (worldSpeed - o.speed) * dt;  // 向 +Z 流向玩家
      const relZ = o.mesh.position.z - playerZ;
      // 躲过得分：障碍超过玩家（relZ > 2）且未得分
      if (relZ > 2 && !o.scored) {
        o.scored = true;
        onDodge(o);
      }
      // 移除：超过后方 20m
      if (relZ > 20) {
        this.group.remove(o.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  // 碰撞判定：按真实包围盒算"保险杠碰保险杠"
  // FORGIVE 系数 0.85：略收紧，肉眼看到擦边过去不会冤判
  checkCollision(playerX, playerZ, bikeHalfX = 0.3, bikeHalfZ = 0.6) {
    const FORGIVE = 0.85;
    for (const o of this.active) {
      const dz = Math.abs(o.mesh.position.z - playerZ);
      const dx = Math.abs(o.mesh.position.x - playerX);
      if (dz < (o.halfZ + bikeHalfZ) * FORGIVE && dx < (o.halfX + bikeHalfX) * FORGIVE) return true;
    }
    return false;
  }

  reset() {
    for (const o of this.active) this.group.remove(o.mesh);
    this.active = [];
  }
}

export class SceneryPool {
  constructor() {
    this.templates = [];
    this.active = [];
    this.group = new THREE.Group();
    this.loaded = false;
  }

  async load(manager) {
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync('../../models/car-street-prop-v2.glb');
    const tpl = gltf.scene;
    const box = new THREE.Box3().setFromObject(tpl);
    const center = box.getCenter(new THREE.Vector3());
    tpl.position.sub(center);
    tpl.position.y -= box.min.y - center.y;
    tpl.traverse(n => {
      if (n.isMesh && n.material) {
        const m = Array.isArray(n.material) ? n.material : [n.material];
        m.forEach(x => { x.side = THREE.FrontSide; });
      }
    });
    tpl.visible = false;
    this.group.add(tpl);
    this.templates.push(tpl);
    // 预生成：左右两侧每 5m 一个（密集街景）
    const SEG = 5;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      for (let i = -8; i < 40; i++) {
        const inst = tpl.clone(true);
        inst.visible = true;
        // 左右交替错开
        const offset = (side === 1) ? SEG / 2 : 0;
        inst.position.set(sign * 10.5, 0, -(i * SEG + offset));
        if (side === 0) inst.rotation.y = Math.PI;
        this.group.add(inst);
        this.active.push({ mesh: inst, segIdx: i, offset });
      }
    }
    this.loaded = true;
  }

  update(worldZ) {
    // 玩家固定 z=0，街景向 +Z 流（视觉接近玩家）+ 弯道横向偏移
    const SEG = 5;
    const COUNT = 48;
    const total = COUNT * SEG;
    for (const it of this.active) {
      const initZ = -(it.segIdx * SEG + it.offset);
      let z = initZ - worldZ;  // worldZ 递减 → 段 z 递增（向 +Z 流）
      z = ((z - 8 * SEG) % total + total) % total + 8 * SEG;
      it.mesh.position.z = z;
      if (it.baseX === undefined) it.baseX = it.mesh.position.x;
      it.mesh.position.x = it.baseX + WorldCurve.offsetAt(z);
    }
  }
}
