// 太空3D飞行 · 程序化低模飞船（圆锥机身 + 三角翼 + 尾翼 + 引擎喷焰）
// 前进方向 = -z；姿态由 game.js 每帧设置（rotation.z 压弯滚转 / rotation.x 俯仰）
import * as THREE from 'three';

export function buildShip(scene) {
  const ship = new THREE.Group();

  const hullMat = new THREE.MeshLambertMaterial({ color: 0xa8bccd, flatShading: true });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a4a5c, flatShading: true });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x66d9ff, emissive: 0x1a5a7a });

  // 机身：六棱圆锥，尖朝 -z（前方）
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 6), hullMat);
  body.rotation.x = -Math.PI / 2;
  ship.add(body);

  // 座舱罩
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glassMat);
  cockpit.scale.set(1, 0.7, 1.5);
  cockpit.position.set(0, 0.16, 0.05);
  ship.add(cockpit);

  // 主翼：两片后掠薄板
  const wingGeo = new THREE.BoxGeometry(1.7, 0.06, 0.85);
  const wingL = new THREE.Mesh(wingGeo, darkMat);
  wingL.position.set(-0.95, -0.06, 0.55);
  wingL.rotation.y = 0.5;
  const wingR = new THREE.Mesh(wingGeo, darkMat);
  wingR.position.set(0.95, -0.06, 0.55);
  wingR.rotation.y = -0.5;
  ship.add(wingL, wingR);

  // 尾翼（竖直）
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.6), darkMat);
  fin.position.set(0, 0.34, 0.85);
  fin.rotation.x = -0.25;
  ship.add(fin);

  // 双引擎喷口 + 加法混合喷焰（随速度缩放）
  const nozzleGeo = new THREE.CylinderGeometry(0.13, 0.19, 0.3, 8);
  const flameGeo = new THREE.ConeGeometry(0.15, 1.0, 8);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x55ccff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flames = [];
  for (const sx of [-0.28, 0.28]) {
    const nozzle = new THREE.Mesh(nozzleGeo, darkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(sx, -0.02, 1.05);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = Math.PI / 2;            // 尖朝 +z（向后喷）
    flame.position.set(sx, -0.02, 1.6);
    ship.add(nozzle, flame);
    flames.push(flame);
  }

  scene.add(ship);

  let t = 0;
  function update(dt, speed) {
    t += dt;
    // 喷焰长度/抖动随速度（0.6 ~ 1.9 倍）
    const k = 0.55 + speed * 0.035 + Math.sin(t * 31) * 0.08;
    for (const f of flames) f.scale.set(1, k, 1);
  }

  return { group: ship, update };
}
