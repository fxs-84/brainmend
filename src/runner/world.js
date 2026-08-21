// 海风球道 · 世界搭建：天空/海雾/光照/海洋/球道/两侧彩旗立柱/终点门
// 全部 MeshLambertMaterial（headless SwiftShader 软渲染性能，PBR 会打到 5 FPS）
// 纹理全用 CanvasTexture 程序化生成，零外部资源
import * as THREE from 'three';

export const BALL_Z = -5;        // 球的世界 z（屏幕中心锚点，球相对世界固定）
export const TRACK_HALF = 3.5;   // 球道半宽（米）

// CanvasTexture 快捷生成
function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

// 海面纹理：深蓝底 + 浅色波浪纹
function makeOceanTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2e7fbf';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 2 ? 'rgba(120,190,230,.55)' : 'rgba(30,90,150,.5)';
      g.lineWidth = 2 + (i % 3);
      g.beginPath();
      const y0 = (i / 9) * h + 4;
      for (let x = 0; x <= w; x += 8) {
        g.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 2 + i) * 4);
      }
      g.stroke();
    }
  }, 35, 35);
}

// 球道纹理：浅色沙面 + 两侧红色边线 + 中央白色虚线（滚动时的速度参照物）
function makeTrackTex() {
  return canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#e6d5a7';
    g.fillRect(0, 0, w, h);
    // 沙面噪点
    for (let i = 0; i < 500; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(180,155,105,.35)' : 'rgba(240,225,185,.4)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // 两侧边线
    g.fillStyle = '#d94f3d';
    g.fillRect(0, 0, 7, h);
    g.fillRect(w - 7, 0, 7, h);
    // 中央虚线
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y, 4, 30);
  }, 1, 64);   // 320m 球道铺 64 块 → 每块 5m
}

// 沙滩球纹理：彩色竖条纹
function makeBallTex() {
  return canvasTex(256, 128, (g, w, h) => {
    const cols = ['#ff5a5a', '#ffffff', '#ffd23c', '#ffffff', '#3ca9ff', '#ffffff', '#4cd964', '#ffffff'];
    const sw = w / cols.length;
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * sw, 0, sw, h); });
  });
}

// 黑白格纹理（终点门）
function makeCheckerTex() {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#161616';
    g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  }, 6, 1);
}

export function buildWorld(scene) {
  // --- 天空 / 海雾 ---
  scene.background = new THREE.Color(0x7ec8f2);
  scene.fog = new THREE.FogExp2(0x9fd4ee, 0.007);

  // --- 光照：半球环境光 + 平行光（太阳）---
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x9a8a6a, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  // --- 海面（大平面，波浪纹理 offset 滚动）---
  const oceanTex = makeOceanTex();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ map: oceanTex }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0, -100);
  scene.add(ocean);

  // --- 断口盖板材质：与海面同款波浪纹理（repeat 缩小适配 7.2×4 盖板），断口看起来像真海水 ---
  const gapCoverTex = makeOceanTex();
  gapCoverTex.repeat.set(2, 1);
  const gapCoverMat = new THREE.MeshLambertMaterial({ map: gapCoverTex });

  // --- 球道组：世界反向平移（x = -ballX）的载体，球道/彩旗/障碍/金币/终点门都挂这里 ---
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);

  const trackTex = makeTrackTex();
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF * 2, 320),
    new THREE.MeshLambertMaterial({ map: trackTex }),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0.06, -80);   // 覆盖 z=-240..80，略高于海面防 z-fighting
  trackGroup.add(track);

  // --- 两侧彩旗立柱（滚动回收，点缀用）---
  const FLAG_COLORS = [0xff5a5a, 0xffd23c, 0x3ca9ff, 0x4cd964, 0xff8c42, 0xe05ad9];
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
  const flagGeo = new THREE.PlaneGeometry(0.7, 0.45);
  const decors = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.2;
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({
      color: FLAG_COLORS[i % FLAG_COLORS.length], side: THREE.DoubleSide,
    }));
    flag.position.set(0.38, 2.15, 0);
    g.add(pole, flag);
    g.position.set(i % 2 ? 4.3 : -4.3, 0, -120 + i * 11);   // 左右交替（道外），间隔 11m
    trackGroup.add(g);
    decors.push(g);
  }

  // --- 小球：锁定屏幕中心（相对世界固定），彩色沙滩球 ---
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 18),
    new THREE.MeshLambertMaterial({ map: makeBallTex(), transparent: true }),
  );
  ball.position.set(0, 0.55, BALL_Z);
  scene.add(ball);

  // --- 终点门工厂（黑白格拱门框，spawner 每次过关取一个新实例）---
  const checkerTex = makeCheckerTex();
  function createGate() {
    const mat = new THREE.MeshLambertMaterial({ map: checkerTex });
    const g = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.35, 3.2, 0.35);
    const pl = new THREE.Mesh(postGeo, mat); pl.position.set(-4.0, 1.6, 0);
    const pr = new THREE.Mesh(postGeo, mat); pr.position.set(4.0, 1.6, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.35, 0.6, 0.35), mat);
    beam.position.set(0, 3.5, 0);
    g.add(pl, pr, beam);
    return g;
  }

  // --- 鲸鱼跃出（纯氛围，无碰撞）：低多边形鲸鱼，每 30~50s 从球道一侧远方跃到另一侧 ---
  const whaleMat = new THREE.MeshLambertMaterial({ color: 0x3a5a78 });
  const whale = new THREE.Group();
  const whaleBody = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 9), whaleMat);
  whaleBody.scale.set(2.4, 1, 1);                      // 拉伸球体 = 鲸身
  const whaleTail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), whaleMat);
  whaleTail.position.set(-2.8, 0.3, 0);
  whaleTail.rotation.z = Math.PI / 2;
  const whaleFluke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.8), whaleMat);
  whaleFluke.position.set(-3.5, 0.9, 0);
  const finGeo = new THREE.BoxGeometry(1.2, 0.08, 0.5);
  const finL = new THREE.Mesh(finGeo, whaleMat); finL.position.set(0.2, -0.4, 0.9); finL.rotation.x = 0.6;
  const finR = new THREE.Mesh(finGeo, whaleMat); finR.position.set(0.2, -0.4, -0.9); finR.rotation.x = -0.6;
  whale.add(whaleBody, whaleTail, whaleFluke, finL, finR);
  whale.visible = false;
  scene.add(whale);
  let whaleT = -1;                                // <0 = 未跃出（倒计时中）
  let whaleNext = 12 + Math.random() * 15;        // 首次稍早出现（演示友好），之后 30~50s
  function whaleJump() { if (whaleT < 0) whaleT = 0; }   // 截图工具可强制触发

  // --- 每帧滚动：纹理 offset 制造"世界朝玩家涌来"的前进感；彩旗前移回收；鲸鱼氛围 ---
  function update(dt, speed) {
    // 平面 rotateX(-π/2) 后 v 轴朝 -z：offset.y 增大 = 纹理图案朝 +z（相机）流动
    trackTex.offset.y += speed * dt / 5;      // 每块纹理 5m
    oceanTex.offset.y += speed * dt * 0.05;   // 每块纹理 20m
    gapCoverTex.offset.y += speed * dt * 0.25; // 断口盖板同步水波流动（比例按盖板尺寸）
    for (const d of decors) {
      d.position.z += speed * dt;
      if (d.position.z > 8) d.position.z -= 132;   // 越过相机后甩回远方
    }
    // 鲸鱼：2.6s 一跃，抛物线 + 先昂首后俯冲
    if (whaleT < 0) {
      whaleNext -= dt;
      if (whaleNext <= 0) whaleT = 0;
    } else {
      whaleT += dt;
      const p = whaleT / 2.6;
      if (p >= 1) {
        whaleT = -1;
        whale.visible = false;
        whaleNext = 30 + Math.random() * 20;
      } else {
        whale.visible = true;
        whale.position.set(-28 + 56 * p, -2.5 + 12 * Math.sin(Math.PI * p), -60);
        whale.rotation.z = (0.5 - p) * 1.5;
      }
    }
  }

  return { trackGroup, ball, createGate, update, whaleJump, gapCoverMat };
}
