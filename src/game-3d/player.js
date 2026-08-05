// 玩家摩托车（哈雷）+ 第一视角相机
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { LANES_X } from './assets/road.js';
import { WorldCurve } from './curve.js';

// 头部位置 → 车道位置映射常量
const YAW_DEADZONE = 0.08;        // 中立死区：|yaw| 小于此值视为头回正（约 2.4°）
const MAX_ROAD_X = 4.86;          // 横向可动范围 = 最外侧车道 X（LANES_X[4]）
const LANE_LERP_SPEED = 10;       // 横向跟随速度（跟手但不生硬）
const LEAN_MAX_RAD = 0.45;        // 最大侧倾角（约 26°）
const LEAN_YAW_FACTOR = 0.45;     // 头部偏航 → 车身倾角的映射系数
const LEAN_LERP_SPEED = 8;        // 侧倾跟随速度

// 相机常量
const BASE_FOV = 75;
const MAX_FOV = 90;
const FOV_SPEED_RESPONSE = 5;     // FOV 响应速度（每秒）
const FOV_SPEED_RANGE = 36;       // 50 - 14

export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.mesh = null;
    this.loaded = false;
  }

  async load(manager) {
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(draco);
    try {
      const gltf = await loader.loadAsync('../../models/car-harley-v2.glb');
      const model = gltf.scene;
      // 居中 + 落地（不动 GLB root 自带 X 轴旋转）
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y -= box.min.y - center.y;
      model.traverse(n => {
        if (n.isMesh && n.material) {
          const m = Array.isArray(n.material) ? n.material : [n.material];
          m.forEach(x => { x.side = THREE.FrontSide; });
        }
      });
      // 放大到真实摩托尺寸（原始 1.17m → 约 2.3m）
      model.scale.setScalar(2.0);
      // 包一层 Group 做朝向旋转（车头朝 -Z 前方，骑手视角看到车头）
      // GLB 加载后车头沿 +X（车长度方向）；旋转 +π/2 把 +X 转到 -Z（前方）
      this.mesh = new THREE.Group();
      this.mesh.add(model);
      this.mesh.rotation.y = Math.PI / 2;
      this.group.add(this.mesh);
      this.group.position.x = 0;  // 头中立 = 中间车道
      // 旋转后的世界包围盒半尺寸（供碰撞判定：保险杠碰保险杠）
      const worldBox = new THREE.Box3().setFromObject(this.mesh);
      const wSize = worldBox.getSize(new THREE.Vector3());
      this.halfX = wSize.x / 2;
      this.halfZ = wSize.z / 2;
      this.loaded = true;
    } catch (err) {
      this.loaded = false;
      throw new Error(`Player model load failed: ${err.message}`);
    }
  }

  // 连续位置映射（颈椎精准控制训练）：
  // 头中立 = 中间车道；头往哪边转、车就往哪边走；头回正、车回中间。
  // 对齐 2D 的 x = 0.5 + yaw * 0.5 映射，yaw ∈ [-1,1] 线性映射到路面横向范围。
  update(input, dt) {
    if (!this.mesh) return;

    // 中立区死区：头基本回正时车稳稳停在中间，抗陀螺仪噪声
    let yaw = input.yaw;
    if (Math.abs(yaw) < YAW_DEADZONE) yaw = 0;
    const targetX = THREE.MathUtils.clamp(yaw, -1, 1) * MAX_ROAD_X;

    // 平滑跟随头部位置
    const dx = targetX - this.group.position.x;
    this.group.position.x += dx * Math.min(1, dt * LANE_LERP_SPEED);

    // 车身侧倾：直接跟随头部偏航（侧头 = 压弯），转头多少车倾斜多少
    // yaw>0（头右转）→ 负倾角（向右压）；头回正 → 车身回正
    const targetLean = THREE.MathUtils.clamp(-yaw * LEAN_YAW_FACTOR, -LEAN_MAX_RAD, LEAN_MAX_RAD);
    this.group.rotation.z += (targetLean - this.group.rotation.z) * Math.min(1, dt * LEAN_LERP_SPEED);
  }
}

export class CockpitCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.05, 600);
  }

  update(playerGroup, input, speed = 14, dt = 1 / 60) {
    // 速度感：高速时拉宽 FOV（帧率无关）
    const t = THREE.MathUtils.clamp((speed - 14) / FOV_SPEED_RANGE, 0, 1);
    const targetFov = BASE_FOV + t * (MAX_FOV - BASE_FOV);
    const k = 1 - Math.exp(-dt * FOV_SPEED_RESPONSE);
    this.cam.fov += (targetFov - this.cam.fov) * k;
    this.cam.updateProjectionMatrix();

    // 第一视角：骑手位置（模型放大 2 倍后：眼睛高 ~1.4m，在座垫前缘上方）
    this.cam.position.set(
      playerGroup.position.x * 0.92,
      1.4,                              // 骑手眼睛高度
      playerGroup.position.z + 0.1      // 座垫前缘，车把正后方
    );
    // 看向前方远处（让车把在画面下方中央且显得大）
    // 弯道时视线朝弯内偏（骑手自然看向出弯点）
    this.cam.lookAt(
      playerGroup.position.x - input.yaw * 2 + WorldCurve.amount * 4,
      0.7,                              // 视线略下 → 车把进入画面下半部
      playerGroup.position.z - 15
    );
    // 相机随侧头轻微滚转（骑手压弯的体感，幅度约为车身倾角的 1/4）
    this.cam.rotateZ(-input.yaw * 0.12);
  }

  setAspect(a) {
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }
}
