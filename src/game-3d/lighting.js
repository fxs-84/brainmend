// 场景灯光 + 雾
import * as THREE from 'three';

export function setupLighting(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
  sun.position.set(30, 60, 20);
  scene.add(sun);
  // 补光（让阴影不死黑）
  const fill = new THREE.DirectionalLight(0xaaccff, 0.35);
  fill.position.set(-20, 10, -30);
  scene.add(fill);
  return { ambient, sun, fill };
}

export function setupFog(scene) {
  scene.fog = new THREE.Fog(0xaec9e0, 40, 220);
  scene.background = new THREE.Color(0xaec9e0);
}
