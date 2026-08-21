// 第一章《初醒·断翼机械鸟》场景（按 V2.1 文档 4.1.2/4.1.4/4.1.5 实现）
// 固定场景模式：相机固定不转，光球为相机子节点钉屏幕中心，靶环按头相对角差滑动（setTargetDelta）
//
// 画面要素（对照文档）：
//   穹顶 —— 直径 50m 半球，深灰金属板 + 锈迹铆钉（程序化 PBR 纹理）
//   地面 —— 抛光混凝土，散布齿轮碎片/螺丝/金属板
//   雾   —— FogExp2 低密度灰雾（光球 4.5m 处清晰为准）
//   光球 —— 世界 4.5m（模态A相机子节点），菲涅尔边缘光 + 呼吸缩放 + 淡蓝自发光
//   机械鸟 —— 程序化低多边形（身体/头/尾/左翼/右翼 20 单元），右翼断裂蓝色电流火花
//   照明 —— 冷白 DirectionalLight(月光) + HemisphereLight 环境 + 光球/断口两个 PointLight
//   粒子 —— 呼吸光晕球形层 / 齿轮碎片掉落 / 断口蓝色火花 / 命中火花池
//
// 反馈（对照 4.1.4）：
//   修复 —— 每片翼单元从收拢暗灰 → 展开银亮，断口边缘向根部逐片推进，火花递减
//   毛刺 —— isSmooth 假 → 断口火花变大；连续 3 次 → 整体闪红一次（单次渐变）
//   通关 —— 全身发光飞出光球，金色轨迹线 + 拖尾粒子，指向远处钟楼
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const SPARK_MAX = 240;   // 命中/转向火花池
const ARC_MAX = 40;      // 断口电流火花
const HALO_MAX = 90;     // 呼吸光晕
const DEBRIS_MAX = 12;   // 齿轮碎片掉落

// ---------- 程序化纹理（避免外部贴图依赖）----------
// 穹顶：暖铜铆钉金属板（蒸汽朋克工坊，与地面同族暖色调）
function metalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a6240'; g.fillRect(0, 0, 256, 256);
  // 金属板块分割（大板块拼缝清晰）
  g.strokeStyle = 'rgba(40,28,14,0.7)'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  // 板面高光渐变（每板左上受光，增加体积感）
  for (let px = 0; px < 4; px++) for (let py = 0; py < 4; py++) {
    const grad = g.createLinearGradient(px * 64, py * 64, px * 64 + 64, py * 64 + 64);
    grad.addColorStop(0, 'rgba(255,220,160,0.10)');
    grad.addColorStop(1, 'rgba(30,20,8,0.12)');
    g.fillStyle = grad;
    g.fillRect(px * 64 + 2, py * 64 + 2, 60, 60);
  }
  // 铆钉（板缝交叉点，暖铜高光）
  for (let x = 16; x < 256; x += 32) for (let y = 16; y < 256; y += 32) {
    g.fillStyle = 'rgba(50,34,16,0.85)';
    g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,220,160,0.5)';
    g.beginPath(); g.arc(x - 1, y - 1, 1.4, 0, 7); g.fill();
  }
  // 铜绿氧化 + 暖锈迹
  for (let i = 0; i < 46; i++) {
    const verdigris = Math.random() < 0.3;
    g.fillStyle = verdigris
      ? `rgba(${60 + Math.random() * 30 | 0},${110 + Math.random() * 30 | 0},90,${0.05 + Math.random() * 0.09})`
      : `rgba(${150 + Math.random() * 40 | 0},${90 + Math.random() * 30 | 0},40,${0.06 + Math.random() * 0.1})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3);
  t.anisotropy = 8;   // 掠射角防糊（大面积地面/穹顶必须）
  return t;
}
// 地面：黄铜大板（超大板块 + 板间色差——掠射角 mipmap 糊化后仍保留拼板感）
function brassFloorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  // 棋盘式明暗板块（任何 mipmap 级别都可读的大尺度拼板感）+ 板内随机微差
  for (let px = 0; px < 2; px++) for (let py = 0; py < 2; py++) {
    const dark = (px + py) % 2 === 0;
    const base = dark ? 94 : 158;   // 明板/暗板明度
    const j = (Math.random() - 0.5) * 14;
    g.fillStyle = `rgb(${base + 30 + j | 0},${base * 0.78 + 18 + j | 0},${base * 0.45 + 8 | 0})`;
    g.fillRect(px * 128, py * 128, 128, 128);
    const grad = g.createLinearGradient(px * 128, py * 128, px * 128 + 128, py * 128 + 128);
    grad.addColorStop(0, 'rgba(255,224,170,0.14)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(34,22,8,0.18)');
    g.fillStyle = grad;
    g.fillRect(px * 128, py * 128, 128, 128);
  }
  // 宽深拼缝 + 倒角高光
  g.strokeStyle = 'rgba(26,16,6,0.95)'; g.lineWidth = 9;
  for (let i = 0; i <= 2; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke();
  }
  g.strokeStyle = 'rgba(255,220,160,0.25)'; g.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    g.beginPath(); g.moveTo(i * 128 + 6, 0); g.lineTo(i * 128 + 6, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128 + 6); g.lineTo(256, i * 128 + 6); g.stroke();
  }
  // 板面磨损斑点
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '50,34,14' : '230,190,130'},${Math.random() * 0.1})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // 四角铆钉（每板 4 颗，大而立体）
  for (const [bx, by] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    for (const [ox, oy] of [[20, 20], [108, 20], [20, 108], [108, 108]]) {
      const x = bx + ox, y = by + oy;
      g.fillStyle = 'rgba(40,26,10,0.9)';
      g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,226,170,0.6)';
      g.beginPath(); g.arc(x - 2, y - 2, 2.6, 0, 7); g.fill();
    }
  }
  // 铜绿/暖锈
  for (let i = 0; i < 26; i++) {
    const verdigris = Math.random() < 0.35;
    g.fillStyle = verdigris
      ? `rgba(70,${115 + Math.random() * 25 | 0},95,${0.06 + Math.random() * 0.1})`
      : `rgba(${160 + Math.random() * 40 | 0},${100 + Math.random() * 30 | 0},45,${0.06 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 5 + Math.random() * 18, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  t.anisotropy = 8;   // 掠射角防糊（真机 GPU 生效；软渲染靠大特征保底）
  return t;
}
// 中央圆形平台：同心环 + 放射辐条 + 中央徽章（引导视线到光球）
function platformTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6e5632'; g.fillRect(0, 0, 512, 512);
  const cx = 256, cy = 256;
  // 同心环带（宽环明暗交替，掠射角糊化后仍可读）
  for (let r = 248; r > 0; r -= 62) {
    g.fillStyle = (r / 62 | 0) % 2 ? '#66501f' : '#9a7c4a';
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(26,16,6,0.9)'; g.lineWidth = 7;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  }
  // 放射辐条（12 条，指向圆心 → 汇聚视线）
  g.strokeStyle = 'rgba(30,20,8,0.85)'; g.lineWidth = 9;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    g.lineTo(cx + Math.cos(a) * 248, cy + Math.sin(a) * 248);
    g.stroke();
  }
  // 环带铆钉
  for (let ring = 0; ring < 3; ring++) {
    const r = 100 + ring * 62;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + ring * 0.26;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      g.fillStyle = 'rgba(40,26,10,0.9)';
      g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,226,170,0.55)';
      g.beginPath(); g.arc(x - 1.2, y - 1.2, 1.8, 0, 7); g.fill();
    }
  }
  // 中央徽章（齿轮圆盘）
  g.fillStyle = '#9a7a48';
  g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.fill();
  g.strokeStyle = 'rgba(30,20,8,0.9)'; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52);
    g.rotate(a);
    g.fillStyle = '#9a7a48';
    g.fillRect(-5, -7, 12, 14);
    g.strokeStyle = 'rgba(30,20,8,0.9)'; g.lineWidth = 3;
    g.strokeRect(-5, -7, 12, 14);
    g.restore();
  }
  g.fillStyle = '#6e5632';
  g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill();
  g.strokeStyle = 'rgba(30,20,8,0.9)'; g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}
// 引导轨道：双轨凹槽 + 枕木 + 铆钉（从平台伸向光球方向 -Z；亮黄铜基调，糊化后仍是亮引导带）
function trackTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6a40'; g.fillRect(0, 0, 128, 512);
  // 枕木
  for (let y = 0; y < 512; y += 42) {
    g.fillStyle = '#6b5228';
    g.fillRect(6, y, 116, 16);
    g.fillStyle = 'rgba(255,220,160,0.16)';
    g.fillRect(6, y, 116, 3);
  }
  // 双轨（凹槽暗线 + 顶面高光）
  for (const x of [34, 94]) {
    g.fillStyle = '#3e2c12';
    g.fillRect(x - 7, 0, 14, 512);
    g.fillStyle = '#c9a25e';
    g.fillRect(x - 4, 0, 8, 512);
    g.fillStyle = 'rgba(255,230,180,0.6)';
    g.fillRect(x - 3, 0, 2.5, 512);
  }
  // 轨道铆钉
  for (let y = 21; y < 512; y += 42) {
    for (const x of [34, 94]) {
      g.fillStyle = 'rgba(40,26,10,0.9)';
      g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,226,170,0.55)';
      g.beginPath(); g.arc(x - 1, y - 1, 1.6, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// 细长楔形羽片：根部在原点、沿 +X 延伸（rotation 控制方向）
function featherGeo(len, wid) {
  const g = new THREE.BoxGeometry(len, 0.0035, wid);
  g.translate(len / 2, 0, 0);
  // 末端收窄（简单楔形）
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const taper = 1 - Math.max(0, x / len) * 0.55;
    pos.setZ(i, pos.getZ(i) * taper);
  }
  g.computeVertexNormals();
  return g;
}

export class Ch1MechanicalBird {
  constructor(scene, camera) {
    this.scene = scene;
    scene.background = new THREE.Color(0x11182a);
    scene.fog = new THREE.FogExp2(0x1a2334, 0.009);   // 低密度灰雾：保住全景轮廓，光球 4.5m 处清晰

    // ---- 照明（文档 4.1.2：月光 + 环境 + 光球/断口点光；整体提亮，加暖色补光）----
    // 相机 = 站姿眼高（地面在 y=-1.6），光球悬浮于正前方，背景为穹顶金属板而非地面
    scene.add(new THREE.HemisphereLight(0x5c6e96, 0x3e2f1c, 1.5)); // 冷天光/暖地反
    scene.add(new THREE.AmbientLight(0x49566e, 0.95));
    const moon = new THREE.DirectionalLight(0xdce8ff, 1.8);        // 顶部冷白月光
    moon.position.set(0, 12, -4);
    scene.add(moon);
    const warmFill = new THREE.DirectionalLight(0xffc890, 0.55);   // 暖色副光（相机侧，托出工坊暖调）
    warmFill.position.set(-4, 3, 6);
    scene.add(warmFill);

    // ---- 穹顶（直径 50m 半球，暖铜铆钉金属板内面）----
    // 注：大面积背景用 Lambert（漫反射）而非 Standard(PBR)——PBR 每像素高光/金属度计算
    // 在软渲染/低端 GPU 上是帧率杀手；纹理保留金属板质感，光照层次由 Lambert 维持
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(25, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2),
      new THREE.MeshLambertMaterial({
        map: metalTexture(), color: 0xbfa87c, side: THREE.BackSide,
      })
    );
    dome.position.y = -1.6;   // 穹顶底部贴地（地面 y=-1.6）
    scene.add(dome);

    // ---- 地面（蒸汽朋克工坊：黄铜铆钉大板）----
    // 注：大面积地面必须用 PlaneGeometry——CircleGeometry 是中心扇形三角剖分，
    // 25m 长三角片在掠射角 UV 导数崩坏，整张纹理糊成纯色（血泪教训，探针12实证）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshLambertMaterial({
        map: brassFloorTexture(), color: 0xc2a276,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;   // 站姿眼高：地面在脚下 1.6m
    scene.add(floor);

    // 中央圆形平台（在光球正下方，同心环 + 放射辐条把视线汇向光球）
    const platform = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 48),
      new THREE.MeshLambertMaterial({ map: platformTexture(), color: 0xe2c69a })
    );
    platform.rotation.x = -Math.PI / 2;
    platform.position.set(0, -1.555, -4.5);
    scene.add(platform);

    // 引导轨道（从脚下伸向平台/光球方向 -Z，双轨凹槽引导视线）
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 18),
      new THREE.MeshLambertMaterial({ map: trackTexture(), color: 0xd8bc8e })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, -1.545, -4.5);
    scene.add(track);
    // 轨道两侧矮护轨（真几何，任何掠射角都可读）
    const curbGeo = new THREE.BoxGeometry(0.12, 0.08, 18);
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x9a7c4a });
    for (const sx of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(sx * 0.95, -1.56, -4.5);
      scene.add(curb);
    }

    // ---- 地面散件：齿轮碎片 / 螺丝 / 金属板（世界空间，提供头动光流）----
    this.props = new THREE.Group();
    const gearGeo = new THREE.TorusGeometry(0.5, 0.18, 8, 14);
    const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 6);
    const plateGeo = new THREE.BoxGeometry(0.8, 0.05, 0.6);
    const propMats = [
      new THREE.MeshLambertMaterial({ color: 0x5a636e, emissive: 0x112244, emissiveIntensity: 0.4 }),
      new THREE.MeshLambertMaterial({ color: 0x6b5330 }),
      new THREE.MeshLambertMaterial({ color: 0x4a5462 }),
    ];
    for (let i = 0; i < 10; i++) {
      const geo = [gearGeo, boltGeo, plateGeo][i % 3];
      const m = new THREE.Mesh(geo, propMats[i % 3]);
      const ang = (i / 10) * Math.PI * 2 + i * 0.7;
      const r = 4 + (i % 4) * 2.2;
      m.position.set(Math.cos(ang) * r, -1.6 + 0.12 + (i % 3) * 0.04, Math.sin(ang) * r - 2);
      m.rotation.set(i * 0.9, i * 1.3, i * 0.5);
      const s = 0.7 + (i % 3) * 0.4; m.scale.setScalar(s);
      this.props.add(m);
    }
    scene.add(this.props);

    // ---- 远处钟楼剪影（通关飞出指向目标）----
    const tower = new THREE.Group();
    const towerBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 16, 8),
      new THREE.MeshStandardMaterial({ color: 0x1d2330, metalness: 0.4, roughness: 0.8 })
    );
    const towerTop = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.4, roughness: 0.8 })
    );
    towerBody.position.y = 8;
    towerTop.position.y = 18;
    tower.add(towerBody, towerTop);
    tower.position.set(6, -1.6, -45);
    scene.add(tower);
    this.tower = tower;

    // E2E 探针道具（世界空间，验证模态A世界反向扫过）
    this.probeProp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );
    this.probeProp.position.set(0, 1, -8);
    scene.add(this.probeProp);

    // ================= 核心光球（相机子节点 → 屏幕中心）=================
    this.orb = new THREE.Group();
    // 菲涅尔边缘光球（模态A为可读性放大到半径 0.22，直径 ~0.44m）
    this.orbMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x66bbff) }, uBreath: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vV;
        uniform vec3 uColor; uniform float uBreath;
        void main(){
          float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float g = fr * (0.65 + 0.5 * uBreath);
          gl_FragColor = vec4(uColor * (g * 1.5 + 0.12), g * 0.9 + 0.10);
        }`,
    });
    this.orbCore = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), this.orbMat);
    this.orb.add(this.orbCore);
    // 光晕 sprite（柔和外发光）
    this.glowMat = new THREE.SpriteMaterial({
      map: Ch1MechanicalBird.glowTexture(), color: 0x66bbff,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.set(1.7, 1.7, 1);
    this.orb.add(this.glow);
    // 光球自发光点光（照亮内部机械鸟）
    this.orbLight = new THREE.PointLight(0x66bbff, 1.9, 6);
    this.orb.add(this.orbLight);

    // ================= 机械鸟（程序化低多边形，蜷缩在光球内）=================
    this.bird = new THREE.Group();
    // 机械鸟加自发光：在光球内部清晰可见（核心主体必须可读）
    const silver = new THREE.MeshStandardMaterial({ color: 0xcdd6e0, metalness: 0.85, roughness: 0.3, emissive: 0x4a5a70, emissiveIntensity: 0.6 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x4a5262, metalness: 0.7, roughness: 0.45, emissive: 0x222a38, emissiveIntensity: 0.5 });
    const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.9, roughness: 0.35, emissive: 0x3a2a10, emissiveIntensity: 0.45 }); // 黄铜喙/冠/关节

    // 身体（饱满椭圆，胸腹鼓起）
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 18, 14), silver);
    body.scale.set(1.5, 1.05, 1.1);
    this.bird.add(body);
    // 胸腹装甲板（深色分块，机械感）
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), darkMetal);
    belly.scale.set(1.3, 0.8, 0.9);
    belly.position.set(0.012, -0.012, 0);
    this.bird.add(belly);

    // 脖子（弯管抬起）+ 头 + 黄铜喙 + 双眼 + 羽冠 —— 头抬起是"鸟"的关键特征
    const neckCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.032, 0.012, 0),
      new THREE.Vector3(0.046, 0.042, 0),
      new THREE.Vector3(0.05, 0.062, 0)
    );
    this.bird.add(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 10, 0.0105, 8), silver));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 12), silver);
    head.position.set(0.052, 0.066, 0);
    this.bird.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 6), brass);
    beak.position.set(0.072, 0.063, 0);
    beak.rotation.z = -Math.PI / 2 - 0.15;
    this.bird.add(beak);
    for (const sz of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
      eye.position.set(0.06, 0.071, sz * 0.012);
      this.bird.add(eye);
    }
    // 羽冠（头顶 3 片小羽）
    for (let i = 0; i < 3; i++) {
      const crest = new THREE.Mesh(featherGeo(0.018, 0.006), brass);
      crest.position.set(0.046, 0.08, (i - 1) * 0.007);
      crest.rotation.z = 0.9 - i * 0.1;
      this.bird.add(crest);
    }

    // 尾羽（身体后端 -X，5 片扇形展开）
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(featherGeo(0.052, 0.013), darkMetal);
      t.position.set(-0.038, 0.004, 0);
      t.rotation.y = (i - 2) * 0.32;
      t.rotation.z = Math.PI - 0.12 - Math.abs(i - 2) * 0.08;  // 扇形微张
      this.bird.add(t);
    }

    // 左翼（完整，4 片层叠半展开贴身体 -Z 侧，对照右翼断裂）
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(featherGeo(0.058 - i * 0.007, 0.015), silver);
      w.position.set(0.005, 0.008, -0.024);
      w.rotation.set(0.5 + i * 0.12, 0.5 + i * 0.18, 0.5);
      this.bird.add(w);
    }

    // 右翼（断裂，20 单元 wing_seg_00..19；断裂下垂 + 暗色，断口朝身体中段）
    this.segments = [];
    const rootR = new THREE.Vector3(0.006, 0.006, 0.026);   // 翼根（身体 +Z 侧）
    const segDark = new THREE.Color(0x2c333e);
    const segBright = new THREE.Color(0xe6eef6);
    for (let i = 0; i < 20; i++) {
      const row = Math.floor(i / 10), col = i % 10;          // row0 主羽 / row1 覆羽
      const len = 0.066 - row * 0.016 - col * 0.002;
      const seg = new THREE.Mesh(featherGeo(len, 0.013),
        new THREE.MeshStandardMaterial({ color: segDark.clone(), metalness: 0.78, roughness: 0.4, emissive: 0x141a24, emissiveIntensity: 0.4 }));
      // 展开态：翼根向外扇形张开（形成完整右翼轮廓）
      const spread = (col / 9 - 0.5);                        // -0.5~0.5 扇形分布
      const openPos = new THREE.Vector3(
        rootR.x + 0.004 - col * 0.002,
        rootR.y + row * 0.006 + Math.abs(spread) * 0.004,
        rootR.z + 0.006 + col * 0.002);
      const openRot = new THREE.Euler(-0.3 - row * 0.15, -(0.5 + spread * 0.9), 0.15 + spread * 0.4);
      // 断裂态：羽片绕翼根向下垂落聚拢（断翼瘫软下垂）
      const foldPos = new THREE.Vector3(rootR.x + 0.006, rootR.y - 0.02 - col * 0.0012, rootR.z + 0.001);
      const foldRot = new THREE.Euler(1.5, -0.3, 1.3);
      seg.userData = { openPos, openRot, foldPos, foldRot, i };
      seg.position.copy(foldPos);
      seg.rotation.copy(foldRot);
      this.bird.add(seg);
      this.segments.push(seg);
    }

    // 断口蓝色电流火花点光（<3Hz 渐变闪烁）
    this.sparkLight = new THREE.PointLight(0x4488ff, 2.6, 3.5);
    this.sparkLight.position.copy(rootR).add(new THREE.Vector3(0.008, -0.012, 0.01));
    this.bird.add(this.sparkLight);

    this.bird.rotation.set(0.12, 0.55, 0.08);  // 蜷缩微侧，右翼朝向玩家
    this.bird.scale.setScalar(1.6);            // 放大至光球内清晰可读
    this.orb.add(this.bird);

    // 断口电流火花粒子（蓝色短促）
    const arcGeo = new THREE.BufferGeometry();
    this.arcPos = new Float32Array(ARC_MAX * 3);
    arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcs = new THREE.Points(arcGeo, new THREE.PointsMaterial({
      color: 0x66aaff, size: 0.02, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.arcs.frustumCulled = false;
    this._arcAnchor = rootR.clone().add(new THREE.Vector3(0.008, -0.012, 0.01));
    this.bird.add(this.arcs);

    // 呼吸光晕球形粒子层（orb 外球面）
    const haloGeo = new THREE.BufferGeometry();
    const haloPos = new Float32Array(HALO_MAX * 3);
    for (let i = 0; i < HALO_MAX; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const r = 0.36;
      haloPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      haloPos[i * 3 + 1] = r * Math.cos(ph);
      haloPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    this.haloMat = new THREE.PointsMaterial({
      color: 0x88ccff, size: 0.016, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.halo = new THREE.Points(haloGeo, this.haloMat);
    this.halo.frustumCulled = false;
    this.orb.add(this.halo);

    this.orb.position.set(0, 0, -4.5);
    camera.add(this.orb);
    scene.add(camera);

    // ---- 齿轮碎片掉落粒子（场景氛围）----
    const debGeo = new THREE.BufferGeometry();
    this.debPos = new Float32Array(DEBRIS_MAX * 3);
    this.debVel = new Float32Array(DEBRIS_MAX);
    for (let i = 0; i < DEBRIS_MAX; i++) {
      this.debPos[i * 3] = (Math.random() - 0.5) * 16;
      this.debPos[i * 3 + 1] = -1.6 + 4 + Math.random() * 9;
      this.debPos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 3;
      this.debVel[i] = 0.4 + Math.random() * 0.8;
    }
    debGeo.setAttribute('position', new THREE.BufferAttribute(this.debPos, 3));
    this.debris = new THREE.Points(debGeo, new THREE.PointsMaterial({
      color: 0x8a94a2, size: 0.05, transparent: true, opacity: 0.7,
    }));
    this.debris.frustumCulled = false;
    scene.add(this.debris);

    // ---- 命中目标环（世界空间；头转到目标方位时正好套上光球）----
    this.target = new THREE.Group();
    this.targetRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.05, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc85e, transparent: true, opacity: 0.95 })
    );
    this.targetFill = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.25 })
    );
    this.target.add(this.targetRing, this.targetFill);
    this.target.visible = false;
    scene.add(this.target);

    // ---- 命中/转向火花池 ----
    const sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(SPARK_MAX * 3);
    this.sparkVel = new Float32Array(SPARK_MAX * 3);
    this.sparkLife = new Float32Array(SPARK_MAX);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkMat = new THREE.PointsMaterial({
      color: 0x9fd8ff, size: 0.07, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.sparks = new THREE.Points(sparkGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    this._sparkNext = 0;

    // ---- 通关金色轨迹线 ----
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 200), 3));
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({
      color: 0xffd977, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    scene.add(this.trail);
    this._trailPts = [];

    // ---- 状态 ----
    this.repaired = 0;
    this._anim = [];
    this._flash = 0;
    this._flashRed = 0;
    this._sparkBoost = 0;
    this._glitchCount = 0;
    this._prevSmooth = true;
    this._flying = false;
    this._flyT = 0;
    this._targetBase = new THREE.Color(0xffc85e);
    this._segDark = segDark;
    this._segBright = segBright;
    this._glowBase = new THREE.Color(0x66bbff);
    this.t = 0;
    this.energy = 0;
    this._lockK = 0;
  }

  static glowTexture() {
    if (Ch1MechanicalBird._glowTex) return Ch1MechanicalBird._glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(160,220,255,0.9)');
    grad.addColorStop(0.35, 'rgba(102,187,255,0.35)');
    grad.addColorStop(1, 'rgba(102,187,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    Ch1MechanicalBird._glowTex = new THREE.CanvasTexture(c);
    return Ch1MechanicalBird._glowTex;
  }

  // 目标环放到指定方位（度）；head yaw = bearing 时目标与光球屏幕重合
  setTargetBearing(deg) {
    const rad = THREE.MathUtils.degToRad(deg);
    this.target.position.set(Math.sin(rad) * 4.5, 0, -Math.cos(rad) * 4.5);
    this.target.visible = true;
    this.targetRing.material.color.copy(this._targetBase);
  }

  // 固定场景模式：靶环按"头相对目标的角差"摆放（delta=0 时与光球屏幕重合）
  // 相机不转，靶环在光球前方固定深度横向滑动：offset = tan(delta°) × 深度
  setTargetDelta(deg) {
    const rad = THREE.MathUtils.degToRad(deg);
    this.target.position.set(Math.tan(rad) * 4.5, 0, -4.5);
    this.target.visible = true;
    this.targetRing.material.color.copy(this._targetBase);
    // 远位读感：偏位越大越透明、略缩小
    const k = Math.min(1, Math.abs(deg) / 25);
    this._deltaFade = 1 - 0.45 * k;
    this._deltaScale = 1 - 0.25 * k;
  }

  hideTarget() { this.target.visible = false; }

  setTargetLock(k) {
    this._lockK = k;
    this.targetFill.material.opacity = 0.22 + 0.55 * k;
  }

  // 充能 0~1：光球更亮更大（摆动的每一帧都有画面反馈）
  setEnergy(k) {
    this.energy = k;
    this.glowMat.opacity = 0.6 + 0.35 * k;
    this.glow.scale.setScalar(1.7 + 0.55 * k);
    this.orbCore.scale.setScalar(1 + 0.12 * k);
  }

  flash(color) {
    this.glowMat.color.set(color);
    this._flash = 1;
  }

  burst(worldPos, n = 30, spread = 1.6) {
    for (let i = 0; i < n; i++) {
      const idx = this._sparkNext;
      this._sparkNext = (this._sparkNext + 1) % SPARK_MAX;
      this.sparkPos[idx * 3] = worldPos.x;
      this.sparkPos[idx * 3 + 1] = worldPos.y;
      this.sparkPos[idx * 3 + 2] = worldPos.z;
      this.sparkVel[idx * 3] = (Math.random() - 0.5) * spread;
      this.sparkVel[idx * 3 + 1] = (Math.random() - 0.2) * spread;
      this.sparkVel[idx * 3 + 2] = (Math.random() - 0.5) * spread;
      this.sparkLife[idx] = 1;
    }
  }

  orbWorldPos(out) { return this.orb.getWorldPosition(out); }

  // 接入美术级机械鸟 GLB（模型到位后调用，替换程序化鸟）
  // 约定：GLB 内右翼 20 单元命名 wing_seg_00..19；缺省则整鸟替换、修复退化为整鸟发光
  // 单元复用现有修复动画：openPos/openRot 取模型原始姿态，foldPos/foldRot 近似收拢下垂
  async loadModel(url, { scale = 1.5 } = {}) {
    // 项目 GLB 经 gltf-transform Draco 压缩（optimize-models.sh），需配 DRACOLoader 解码
    const draco = new DRACOLoader().setDecoderPath('./assets/vendor/draco/gltf/');
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    this.orb.remove(this.bird);
    this.bird = model;
    model.scale.setScalar(scale);
    this.orb.add(model);

    const segs = [];
    model.traverse(o => { if (o.isMesh && /^wing_seg_\d+$/i.test(o.name)) segs.push(o); });
    if (segs.length) {
      segs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      segs.forEach((s, i) => {
        s.material = s.material.clone();
        const openPos = s.position.clone(), openRot = s.rotation.clone();
        s.userData = {
          openPos, openRot,
          foldPos: openPos.clone().add(new THREE.Vector3(0.01, -0.025, -0.012)),
          foldRot: new THREE.Euler(openRot.x + 1.25, openRot.y, openRot.z + 1.05),
          i,
        };
        s.position.copy(s.userData.foldPos);
        s.rotation.copy(s.userData.foldRot);
        if (s.material.color) s.material.color.copy(this._segDark);
      });
      this.segments = segs;
      this.repaired = 0;
      this._anim = [];
    }
    return model;
  }

  // 修复一单元：从收拢暗灰 → 展开银亮，1 秒动画；断口火花随进度减弱
  repairSegment() {
    if (this.repaired >= this.segments.length) return false;
    this._anim.push({ m: this.segments[this.repaired++], k: 0 });
    return true;
  }

  get progress() { return this.repaired / this.segments.length; }

  // 平滑度反馈（demo 每帧调用；内部做边沿检测，返回是否触发了本次毛刺）
  setSmooth(ok) {
    let fired = false;
    if (!ok && this._prevSmooth) { this.onGlitch(); fired = true; }
    this._prevSmooth = ok;
    if (ok) this._glitchCount = 0;
    return fired;
  }

  // 毛刺惩罚：断口火花变大；连续 3 次 → 整体闪红一次
  onGlitch() {
    this._glitchCount++;
    this._sparkBoost = 1;
    if (this._glitchCount >= 3) { this._flashRed = 1; this._glitchCount = 0; }
  }

  setGolden() {
    // 通关全身发光（光球转金 + 鸟身泛金）
    this.orbMat.uniforms.uColor.value.set(0xffd977);
    this.glowMat.color.set(0xffd977);
    this.segments.forEach(s => { s.material.emissive = new THREE.Color(0x6a5a20); s.material.emissiveIntensity = 0.6; });
  }

  // 修复完成：机械鸟飞出光球，金色轨迹指向钟楼
  flyOut() {
    if (this._flying) return;
    this._flying = true; this._flyT = 0;
    this.scene.attach(this.bird);          // 从 orb(屏幕空间) 转 scene(世界空间)，保留世界变换
    this.trail.visible = true;
    this._trailPts = [this.bird.position.clone()];
  }

  update(dt) {
    this.t += dt;
    const breathe = 1 + (0.04 + 0.05 * this.energy) * Math.sin(this.t * 2);
    this.orbMat.uniforms.uBreath.value = 0.5 + 0.5 * Math.sin(this.t * 2);
    this.orbLight.intensity = 1.7 + 0.4 * Math.sin(this.t * 2) + this.energy * 0.5;
    this.halo.scale.setScalar(1 + 0.08 * Math.sin(this.t * 2));
    this.haloMat.opacity = 0.5 + 0.15 * Math.sin(this.t * 2) + this.energy * 0.2;
    this.glow.scale.setScalar((1.7 + 0.55 * this.energy) * breathe);

    // 断口电流火花：每帧随机扰动（电流感）；sparkBoost 变大；修复进度递减
    const sparkStr = (1 - this.progress) * (1 + this._sparkBoost * 1.5);
    this.sparkLight.intensity = 1.0 + Math.abs(Math.sin(this.t * 2.6)) * 1.8 * Math.max(0.2, sparkStr);
    for (let i = 0; i < ARC_MAX; i++) {
      const on = Math.random() < 0.25 + 0.5 * sparkStr;
      this.arcPos[i * 3] = this._arcAnchor.x + (Math.random() - 0.5) * 0.02 * (on ? 1 : 0.2);
      this.arcPos[i * 3 + 1] = this._arcAnchor.y + (Math.random() - 0.5) * 0.02 * (on ? 1 : 0.2);
      this.arcPos[i * 3 + 2] = this._arcAnchor.z + (Math.random() - 0.5) * 0.02 * (on ? 1 : 0.2);
    }
    this.arcs.geometry.attributes.position.needsUpdate = true;
    this.arcs.material.opacity = 0.3 + 0.65 * Math.max(0.05, sparkStr);
    this.arcs.material.size = 0.016 + 0.012 * this._sparkBoost;
    if (this._sparkBoost > 0) this._sparkBoost = Math.max(0, this._sparkBoost - dt * 1.5);

    // 齿轮道具缓慢自转
    for (let i = 0; i < this.props.children.length; i++) {
      this.props.children[i].rotation.z += dt * 0.08 * (i % 2 ? 1 : -1);
    }
    // 齿轮碎片掉落（循环）
    for (let i = 0; i < DEBRIS_MAX; i++) {
      this.debPos[i * 3 + 1] -= this.debVel[i] * dt;
      if (this.debPos[i * 3 + 1] < -1.6) {
        this.debPos[i * 3 + 1] = -1.6 + 5 + Math.random() * 9;
        this.debPos[i * 3] = (Math.random() - 0.5) * 16;
        this.debPos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 3;
      }
    }
    this.debris.geometry.attributes.position.needsUpdate = true;

    // 目标环脉动 + 锁定收缩（固定场景模式下随偏位远近来缩放/降透明）
    if (this.target.visible) {
      const p = 1 + 0.06 * Math.sin(this.t * 5);
      const ds = this._deltaScale ?? 1;
      this.targetRing.scale.setScalar((1 - 0.3 * this._lockK) * p * ds);
      this.targetFill.scale.setScalar(p * ds);
      this.targetRing.material.opacity = 0.95 * (this._deltaFade ?? 1);
    }

    // 命中闪色衰减
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt * 2);
      if (this._flash === 0 && !this._flying) this.glowMat.color.copy(this._glowBase);
    }
    // 毛刺整体闪红（单次渐变）
    if (this._flashRed > 0) {
      this._flashRed = Math.max(0, this._flashRed - dt * 1.4);
      const k = this._flashRed;
      this.segments.forEach(s => s.material.color.copy(this._segBright).lerp(new THREE.Color(0xe04040), k));
      if (this._flashRed === 0) this._restoreSegColors();
    }

    // 修复动画：收拢暗灰 → 展开银亮（断口边缘向根部推进，1 秒）
    this._anim = this._anim.filter(a => {
      a.k = Math.min(1, a.k + dt);
      const e = a.k * a.k * (3 - 2 * a.k); // smoothstep
      const u = a.m.userData;
      a.m.position.lerpVectors(u.foldPos, u.openPos, e);
      a.m.rotation.set(
        u.foldRot.x + (u.openRot.x - u.foldRot.x) * e,
        u.foldRot.y + (u.openRot.y - u.foldRot.y) * e,
        u.foldRot.z + (u.openRot.z - u.foldRot.z) * e);
      a.m.material.color.lerpColors(this._segDark, this._segBright, e);
      return a.k < 1;
    });

    // 命中/转向火花物理
    let alive = false;
    for (let i = 0; i < SPARK_MAX; i++) {
      if (this.sparkLife[i] <= 0) continue;
      alive = true;
      this.sparkLife[i] -= dt * 1.4;
      this.sparkVel[i * 3 + 1] -= dt * 0.6;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -999;
    }
    if (alive) this.sparks.geometry.attributes.position.needsUpdate = true;

    // 通关飞出：沿弧线飞向钟楼，拖金色轨迹
    if (this._flying) {
      this._flyT += dt;
      const ft = this._flyT;
      const target = this.tower.position;
      this.bird.position.x += (target.x - this.bird.position.x) * dt * 0.6 + dt * 0.2;
      this.bird.position.y += dt * (1.5 - ft * 0.2);
      this.bird.position.z += (target.z - this.bird.position.z) * dt * 0.4 - dt * 0.5;
      this.bird.rotation.z -= dt * 1.5;
      this.bird.rotation.x += dt * 0.5;
      // 翅膀展开扑动
      this.segments.forEach((s, i) => {
        const u = s.userData;
        s.position.copy(u.openPos);
        s.rotation.copy(u.openRot);
        s.rotation.z += Math.sin(ft * 6 + i * 0.3) * 0.15;
        s.material.color.copy(this._segBright);
      });
      // 金色轨迹
      this._trailPts.push(this.bird.position.clone());
      if (this._trailPts.length > 200) this._trailPts.shift();
      this.trailGeo.setFromPoints(this._trailPts);
      // 拖尾金色粒子
      const wp = new THREE.Vector3();
      this.bird.getWorldPosition(wp);
      this.burst(wp, 2, 0.4);
      this.sparkMat.color.set(0xffd977);
    }
  }

  _restoreSegColors() {
    this.segments.forEach((s, i) => {
      s.material.color.copy(i < this.repaired ? this._segBright : this._segDark);
    });
  }
}
