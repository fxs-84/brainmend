// 太空3D飞行 · 玩家舰（GLB 模型 ship-player-v1.glb）+ 引擎喷焰
// 模型舰艏朝 -Z（与游戏前进方向一致，不要旋转）；原始 ~1.17m 长，等比放大到 ~4.5m。
// 加载写法照抄 src/game-3d/player.js：import.meta.url 解析（Pages 子路径）+ DRACOLoader。
// 深色战舰在黑背景里看不清 → 跟船补光 PointLight + 材质 emissive 微提（仅对原本无自发光的材质）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { dracoDecoderPath } from '../game-3d/obstacles.js';

// 柔和光斑纹理（引擎辉光）
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

export function buildShip(scene, { noRender = false } = {}) {
  const ship = new THREE.Group();
  scene.add(ship);

  // --- 引擎喷焰：尾部 +Z 喷口阵（舰艏 -Z），加法混合，随速度缩放 ---
  const flameGeo = new THREE.ConeGeometry(0.14, 1.0, 8);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x55ccff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flames = [];
  for (const fx of [-0.5, 0, 0.5]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = Math.PI / 2;            // 尖朝 +z（向后喷）
    flame.position.set(fx, 0, 2.5);
    ship.add(flame);
    flames.push(flame);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTex(), color: 0x3a9adf, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(1.15, 1.15, 1);
  glow.position.set(0, 0, 2.6);
  ship.add(glow);

  // --- 跟船补光：专照舰体（距离衰减限定在船周，不照亮远处陨石）---
  // 强度克制：深海军蓝舰体提亮到能看清细节即可，过亮会在泛光下糊成白团
  const lamp = new THREE.PointLight(0xbfd8ff, 1.6, 14, 1.4);   // 2.2 在真机偏曝，降到 1.6
  lamp.position.set(0, 2.6, 3.8);
  ship.add(lamp);

  const api = { group: ship, loaded: false, model: null, update };

  // --- GLB 异步加载（norender 跳过：空 Group 占位，E2E 逻辑不需要模型）---
  if (!noRender) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath());
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    // ⚠️ 基于 import.meta.url 解析：相对字符串在 Pages 子路径 (/brainmend/) 下会 404
    loader.loadAsync(new URL('../../models/ship-player-v1.glb', import.meta.url).href).then(gltf => {
      const model = gltf.scene;
      // Box3 居中（不做落地偏移：压弯/俯仰要围绕几何中心转）
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(4.5 / size.z);       // 等比放大到 ~4.5m 长
      // 深色模型提亮：仅对 emissive 为黑的材质做颜色微提（已有自发光贴图的不动，避免失真）
      // 舰体配色：?shiptint=rrggbb 覆盖（用户可自试）；默认暖金白（原贴图深海军蓝偏灰，用户嫌灰）
      const TINT = new THREE.Color(parseInt(new URLSearchParams(location.search).get('shiptint') || 'ffd9a8', 16));
      const fadeMats = [];
      model.traverse(n => {
        if (n.isMesh && n.material) {
          const ms = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of ms) {
            if (m.color) m.color.copy(TINT);            // 染色（与贴图相乘）
            if (m.emissive && m.emissiveMap == null) {  // 无自发光贴图的才提亮
              m.emissive.copy(TINT).multiplyScalar(0.08);
            }
            if ('envMapIntensity' in m) m.envMapIntensity = 0.55;  // RoomEnvironment 满强度在真机偏曝
            // 舰体大多是掠射角视角，贴图不开各向异性会糊成一片
            for (const slot of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) {
              if (m[slot]) m[slot].anisotropy = 8;
            }
            m.transparent = true;                 // 加载完淡入
            m.opacity = 0;
            fadeMats.push(m);
          }
        }
      });
      ship.add(model);
      api.model = model;
      api._fade = { mats: fadeMats, k: 0 };
      api.loaded = true;
    }).catch(err => console.warn('[space3d] 玩家舰加载失败:', err));
  }

  let t = 0;
  function update(dt, speed) {
    t += dt;
    // 喷焰长度/抖动随速度；辉光同步呼吸
    const k = 0.55 + speed * 0.035 + Math.sin(t * 31) * 0.08;
    for (const f of flames) f.scale.set(1, k, 1);
    glow.material.opacity = 0.2 + speed * 0.004 + Math.sin(t * 27) * 0.03;
    // 模型淡入（0.6s），完成后恢复 opaque 避免透明排序开销
    if (api._fade) {
      const f = api._fade;
      f.k = Math.min(1, f.k + dt / 0.6);
      for (const m of f.mats) m.opacity = f.k;
      if (f.k >= 1) {
        for (const m of f.mats) { m.transparent = false; m.needsUpdate = true; }
        api._fade = null;
      }
    }
  }

  return api;
}
