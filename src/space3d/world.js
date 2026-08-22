// 太空3D飞行 · 世界搭建：星空 / 星云 / 速度线 / 雾 / 灯光
// 约定同 src/runner/world.js：全 MeshLambertMaterial/Basic + 程序化 CanvasTexture，零外部资源；
// 一次性分配，update 内零逐帧分配
import * as THREE from 'three';

// 柔和圆点纹理（星星）
function makeStarTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// 星云纹理：几个错位叠加的径向渐变色团（单通道白，颜色由 SpriteMaterial.color 调）
function makeNebulaTex(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;   // 种子化，避免每次加载不同
  for (let i = 0; i < 5; i++) {
    const x = 60 + rnd() * 136, y = 60 + rnd() * 136, r = 50 + rnd() * 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.16 + rnd() * 0.14})`);
    grad.addColorStop(0.55, 'rgba(255,255,255,.07)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

// 气态大行星纹理：横向条纹 + 椭圆色斑
function makePlanetTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const bands = ['#c8a06a', '#a87e50', '#e0c090', '#8a6a48', '#d8b58a', '#b08a5c', '#e8d0a8'];
  let y = 0;
  for (let i = 0; y < 256; i++) {
    const h = 14 + (i % 3) * 10;
    g.fillStyle = bands[i % bands.length];
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 60 + i * 2) * 4);
    g.lineTo(512, y + h); g.lineTo(0, y + h);
    g.closePath(); g.fill();
    y += h;
  }
  // 大红斑式椭圆色斑
  for (const [sx, sy, rx, ry, col] of [[350, 150, 46, 20, 'rgba(160,80,50,.8)'], [150, 90, 26, 12, 'rgba(120,90,60,.6)'], [430, 70, 18, 9, 'rgba(100,70,50,.5)']]) {
    g.fillStyle = col;
    g.beginPath(); g.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function buildSpaceWorld(scene) {
  scene.background = new THREE.Color(0x030509);
  scene.fog = new THREE.FogExp2(0x050a16, 0.0085);   // 极淡近黑蓝雾，拉纵深

  // --- 光照：右上暖阳平行光（明暗面）+ 弱蓝半球光补背光面 ---
  scene.add(new THREE.HemisphereLight(0x3a5a8c, 0x0a0c14, 0.55));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
  sun.position.set(8, 10, 5);
  scene.add(sun);

  // --- 星空：2500 颗 Points 大球壳，跟随相机 reposition（无限远感）---
  const STAR_N = 2500;
  const pos = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++) {
    // 均匀球面方向 × 半径 70~160 壳层
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 90;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(th);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(th);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 0.9, map: makeStarTex(), color: 0xcfe0ff,
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  stars.frustumCulled = false;
  scene.add(stars);

  // --- 星云：7 个超大加法混合 sprite，不同色相，远景慢漂移 ---
  const NEB_COLORS = [0x6a3ab8, 0x2a5ac8, 0xb83a7a, 0x2a8a9a, 0x8a4a2a, 0x4a3ac8, 0x3a8a5a];
  const nebulas = [];
  for (let i = 0; i < NEB_COLORS.length; i++) {
    const mat = new THREE.SpriteMaterial({
      map: makeNebulaTex(1234 + i * 777),
      color: NEB_COLORS[i],
      transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const spr = new THREE.Sprite(mat);
    const sc = 70 + Math.random() * 70;
    spr.scale.set(sc, sc, 1);
    const bx = (Math.random() * 2 - 1) * 90;
    const by = (Math.random() * 2 - 1) * 50;
    const bz = -130 - i * 28;
    spr.position.set(bx, by, bz);
    scene.add(spr);
    nebulas.push({ spr, bx, by, f: 0.05 + Math.random() * 0.08, amp: 4 + Math.random() * 6, ph: Math.random() * Math.PI * 2 });
  }

  // --- 远景大行星：程序化气态行星 + 大气边缘辉光，侧前方极远处撑场面（几乎不动）---
  // 注：fog=false——FogExp2 在 ~270m 处已把任何东西吞没，行星必须豁免雾
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(45, 48, 32),
    new THREE.MeshLambertMaterial({ map: makePlanetTex(), fog: false }),
  );
  planet.position.set(-140, 30, -260);
  scene.add(planet);
  const planetGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeStarTex(), color: 0xc8a878, transparent: true, opacity: 0.25,   // 0.45 会把行星洗白（过曝反馈）
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  planetGlow.scale.set(112, 112, 1);
  planetGlow.position.copy(planet.position);
  scene.add(planetGlow);

  // --- 速度线：3D 空间里环绕飞行走廊的发光短棒，随速度向后飞掠（非屏幕空间放射线）---
  const LINE_N = 60;
  const lineGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0x86bcff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = [];
  for (let i = 0; i < LINE_N; i++) {
    const m = new THREE.Mesh(lineGeo, lineMat);
    const a = Math.random() * Math.PI * 2;
    const r = 9 + Math.random() * 22;                 // 走廊外围环带，不糊脸
    m.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.65, -95 + Math.random() * 105);
    scene.add(m);
    lines.push(m);
  }

  let t = 0;
  function update(dt, speed, camera) {
    t += dt;
    // 星空跟随相机（只跟 x/y，z 固定，保留向前飞的相对运动）
    stars.position.set(camera.position.x, camera.position.y, 0);
    // 星云慢漂移
    for (const n of nebulas) {
      n.spr.position.x = n.bx + Math.sin(t * n.f + n.ph) * n.amp;
      n.spr.position.y = n.by + Math.cos(t * n.f * 0.7 + n.ph) * n.amp * 0.6;
    }
    // 行星极慢自转（远景几乎不动，只给一点活气）
    planet.rotation.y += dt * 0.012;
    // 速度线：比障碍更快的相对速度向后飞掠，长度随速度拉伸
    const vz = speed * 2.0 + 8;
    const len = 1.2 + speed * 0.22;
    for (const m of lines) {
      m.position.z += vz * dt;
      m.scale.z = len;
      if (m.position.z > 10) {
        m.position.z -= 105;
        const a = Math.random() * Math.PI * 2;
        const r = 9 + Math.random() * 22;
        m.position.x = Math.cos(a) * r;
        m.position.y = Math.sin(a) * r * 0.65;
      }
    }
  }

  return { update, sun, stars };
}
