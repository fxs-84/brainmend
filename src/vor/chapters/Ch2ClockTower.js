// 第二章《沉默的钟楼·垂直 VOR》场景（镜像第一章 Ch1MechanicalBird 的对外 API）
// 固定场景模式：相机固定不转，光球为相机子节点钉屏幕中心，靶环按头相对俯仰角差纵向滑动（setTargetDelta）
//
// 画面要素：
//   钟楼内部 —— 石墙穹顶（程序化砖石纹理）+ 石板地面 + 石柱/墙环（垂直光流参照物）
//   大钟盘面 —— 罗马字刻度 CanvasTexture + 时/分指针（终演时快速走时）
//   齿轮组   —— 墙面嵌 12 个齿轮（外圈 8 + 内圈 4）：未修复=灰死静止，修复=黄铜色开始转动；
//               修复按断口式从外圈向内圈推进
//   中央大钟摆 —— 修复进度越高摆幅越大
//   顶部铜铃   —— 终演 ringBell() 敲响：钟波扩散环 + 金色光脉冲
//   光球     —— 菲涅尔边缘光 + 呼吸 + 自发光（同第一章读感），内悬一枚小铜齿轮
//
// 材质纪律：全 MeshLambertMaterial + CanvasTexture 程序化纹理，零外部资源（光球/粒子除外，同第一章）
import * as THREE from 'three';

const SPARK_MAX = 240;   // 命中/转向火花池
const HALO_MAX = 90;     // 呼吸光晕
const DUST_MAX = 60;     // 钟楼浮尘（垂直光流氛围）
const WAVE_MAX = 3;      // 钟波扩散环

// ---------- 程序化纹理 ----------
function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#837c6e'; g.fillRect(0, 0, 256, 256);
  // 砖石错缝
  g.strokeStyle = 'rgba(44,38,30,0.6)'; g.lineWidth = 3;
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    const off = (row % 2) * 32;
    for (let x = off; x <= 256; x += 64) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke();
    }
  }
  // 石面斑驳
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '58,50,42' : '190,180,164'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // 水渍
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(52,48,38,${0.05 + Math.random() * 0.1})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 20, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3);
  t.anisotropy = 8;
  return t;
}
function flagstoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#71695c'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(40,34,26,0.55)'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '52,46,38' : '180,170,152'},${Math.random() * 0.13})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8);
  t.anisotropy = 8;
  return t;
}
function clockFaceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  // 盘面
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 256);
  grad.addColorStop(0, '#e8dfc8');
  grad.addColorStop(0.85, '#d6c9a8');
  grad.addColorStop(1, '#a89877');
  g.fillStyle = grad;
  g.beginPath(); g.arc(256, 256, 252, 0, 7); g.fill();
  // 外圈铜环
  g.strokeStyle = '#7a5c28'; g.lineWidth = 14;
  g.beginPath(); g.arc(256, 256, 240, 0, 7); g.stroke();
  g.strokeStyle = '#4a3a1a'; g.lineWidth = 3;
  g.beginPath(); g.arc(256, 256, 226, 0, 7); g.stroke();
  // 罗马字刻度
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#2c2416';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 44px Georgia, "Times New Roman", serif';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(roman[i], 256 + Math.cos(a) * 188, 256 + Math.sin(a) * 188);
  }
  // 分钟刻度
  g.strokeStyle = '#3a3020'; g.lineWidth = 3;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 === 0 ? 214 : 222;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0);
    g.lineTo(256 + Math.cos(a) * 230, 256 + Math.sin(a) * 230);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// 齿轮：黄铜/灰铁单体（轴沿 +Z，贴墙朝玩家）；teeth 个齿
function makeGear(radius, teeth, mat) {
  const gear = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.12, 20), mat);
  body.rotation.x = Math.PI / 2;
  gear.add(body);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 0.18, 12), mat);
  hub.rotation.x = Math.PI / 2;
  gear.add(hub);
  // 辐条
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.7, radius * 0.16, 0.08), mat);
    spoke.rotation.z = (i / 4) * Math.PI;
    gear.add(spoke);
  }
  // 齿
  const toothGeo = new THREE.BoxGeometry(radius * 0.24, radius * 0.24, 0.12);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.Mesh(toothGeo, mat);
    tooth.position.set(Math.cos(a) * (radius + radius * 0.1), Math.sin(a) * (radius + radius * 0.1), 0);
    tooth.rotation.z = a;
    gear.add(tooth);
  }
  return gear;
}

export class Ch2ClockTower {
  constructor(scene, camera) {
    this.scene = scene;
    scene.background = new THREE.Color(0x1a1409);
    scene.fog = new THREE.FogExp2(0x201a10, 0.008);   // 低密度暖雾：保住钟楼全景轮廓，光球 4.5m 处清晰

    // ---- 照明（钟楼内部：顶部冷天窗 + 暖烛光氛围 + 光球点光；整体提亮）----
    scene.add(new THREE.HemisphereLight(0x6c7c9e, 0x4c3a20, 1.5));
    scene.add(new THREE.AmbientLight(0x5c5040, 1.0));
    const skylight = new THREE.DirectionalLight(0xe0e9fa, 1.8);   // 顶部天窗冷光
    skylight.position.set(0, 14, -3);
    scene.add(skylight);
    const candle = new THREE.PointLight(0xffb060, 1.8, 18);       // 暖烛光（钟楼氛围）
    candle.position.set(2.5, 1.5, -5);
    scene.add(candle);
    const candle2 = new THREE.PointLight(0xffa050, 1.2, 14);      // 暖烛补光（左侧，托出齿轮/钟摆轮廓）
    candle2.position.set(-3, 2.5, -6);
    scene.add(candle2);

    // ---- 石墙穹顶（直径 44m 半球内面）----
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(22, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2),
      new THREE.MeshLambertMaterial({ map: stoneTexture(), color: 0xd0c6b2, side: THREE.BackSide })
    );
    dome.position.y = -1.6;
    scene.add(dome);

    // ---- 石板地面（PlaneGeometry：CircleGeometry 扇形剖分掠射角糊纹理，同第一章教训）----
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 44),
      new THREE.MeshLambertMaterial({ map: flagstoneTexture(), color: 0xc0b6a2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    scene.add(floor);

    // ---- 石柱 + 墙环（垂直光流参照物，分布在不同高度）----
    this.props = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.7, 9, 0.7);
    const pillarMat = new THREE.MeshLambertMaterial({ map: stoneTexture(), color: 0xa89f8c });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      const sx = i % 2 ? 1 : -1, sz = i < 2 ? -1 : 1;
      p.position.set(sx * 6.5, -1.6 + 4.5, sz * 4 - 5);
      this.props.add(p);
    }
    const ringGeo = new THREE.TorusGeometry(0.9, 0.1, 8, 20);
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x86796a });
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.position.set((i % 2 ? 4.5 : -4.5), -0.5 + i * 1.9, -8.6);
      r.rotation.y = (i % 2 ? -1 : 1) * 0.35;
      this.props.add(r);
    }
    scene.add(this.props);

    // E2E 探针道具（世界空间高位，验证垂直反向扫过）
    this.probeProp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );
    this.probeProp.position.set(3.6, 2.2, -8);
    scene.add(this.probeProp);

    // ---- 大钟盘面（罗马字刻度 + 时/分指针；位于齿轮组后方、钟摆上方）----
    this.clockGroup = new THREE.Group();
    this.clockGroup.position.set(0, 3.0, -8.7);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 40),
      new THREE.MeshLambertMaterial({ map: clockFaceTexture() })
    );
    this.clockGroup.add(face);
    const handMat = new THREE.MeshLambertMaterial({ color: 0x2c2416 });
    this.hourHand = new THREE.Group();
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 0.03), handMat);
    hh.position.y = 0.3;
    this.hourHand.add(hh);
    this.hourHand.position.z = 0.04;
    this.minuteHand = new THREE.Group();
    const mh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.03), handMat);
    mh.position.y = 0.5;
    this.minuteHand.add(mh);
    this.minuteHand.position.z = 0.07;
    const handCap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), handMat);
    handCap.position.z = 0.09;
    this.clockGroup.add(this.hourHand, this.minuteHand, handCap);
    this.hourHand.rotation.z = -2.1;   // 静止时刻（约 VII 点）
    this.minuteHand.rotation.z = 0.6;
    scene.add(this.clockGroup);

    // ---- 墙面 12 齿轮（外圈 8 + 内圈 4；断口式从外圈向内圈修复）----
    this.gearGray = new THREE.Color(0x787268);     // 未修复：灰死（暖灰，提亮后仍可辨轮廓）
    this.gearBrass = new THREE.Color(0xc99a3f);    // 修复：黄铜
    this.segments = [];   // 修复顺序 = 外圈 8 → 内圈 4（镜像 ch1 segments 语义）
    const gearCenter = { x: 0, y: 1.2, z: -8.9 };
    for (let i = 0; i < 12; i++) {
      const outer = i < 8;
      const ringR = outer ? 2.7 : 1.3;
      const n = outer ? 8 : 4;
      const k = outer ? i : i - 8;
      const a = (k / n) * Math.PI * 2 + (outer ? 0 : Math.PI / 4);
      const mat = new THREE.MeshLambertMaterial({ color: this.gearGray.clone() });
      const gear = makeGear(outer ? 0.5 : 0.38, outer ? 9 : 8, mat);
      gear.position.set(
        gearCenter.x + Math.cos(a) * ringR,
        gearCenter.y + Math.sin(a) * ringR,
        gearCenter.z);
      gear.userData = { i, outer, mat, spin: 0, dir: i % 2 ? 1 : -1, speed: 0.9 + (i % 3) * 0.35 };
      scene.add(gear);
      this.segments.push(gear);
    }

    // ---- 中央大钟摆（修复进度越高摆幅越大；摆锤扫过盘面下沿）----
    this.pendulum = new THREE.Group();
    this.pendulum.position.set(0, 6.6, -8.4);
    const rod = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 5.4, 0.07),
      new THREE.MeshLambertMaterial({ color: 0x7a6a4a }));
    rod.position.y = -2.7;
    const bob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.16, 24),
      new THREE.MeshLambertMaterial({ color: 0xa88a4a }));
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -5.4;
    this.pendulum.add(rod, bob);
    scene.add(this.pendulum);

    // ---- 顶部铜铃（抬头约 +9° 进入视野；终演钟波扩散会扫过全屏）----
    this.bell = new THREE.Group();
    this.bell.position.set(0, 5.5, -8.2);
    const bellMat = new THREE.MeshLambertMaterial({ color: 0xb87333 });
    const bellDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.35), bellMat);
    bellDome.scale.y = 1.15;
    const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.09, 8, 24), bellMat);
    bellRim.rotation.x = Math.PI / 2;
    bellRim.position.y = -0.28;
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x5a4a2a }));
    clapper.position.y = -0.5;
    this.bell.add(bellDome, bellRim, clapper);
    scene.add(this.bell);
    // 钟波扩散环（终演）
    this.waves = [];
    for (let i = 0; i < WAVE_MAX; i++) {
      const w = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.05, 8, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffd977, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      w.position.copy(this.bell.position);
      w.visible = false;
      scene.add(w);
      this.waves.push({ mesh: w, k: 1 });
    }
    this._waveTimer = 0;
    // 金色光脉冲（终演）
    this.bellLight = new THREE.PointLight(0xffd977, 0, 14);
    this.bellLight.position.copy(this.bell.position);
    scene.add(this.bellLight);

    // ================= 核心光球（相机子节点 → 屏幕中心）=================
    this.orb = new THREE.Group();
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
    this.glowMat = new THREE.SpriteMaterial({
      map: Ch2ClockTower.glowTexture(), color: 0x66bbff,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.set(1.7, 1.7, 1);
    this.orb.add(this.glow);
    this.orbLight = new THREE.PointLight(0x66bbff, 1.9, 6);
    this.orb.add(this.orbLight);
    // 光球内悬一枚小铜齿轮（第二章主体读感：自转）
    this.orbGear = makeGear(0.09, 8,
      new THREE.MeshLambertMaterial({ color: 0xc99a3f, emissive: 0x4a3208, emissiveIntensity: 0.7 }));
    this.orb.add(this.orbGear);

    // 呼吸光晕球形粒子层
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

    // ---- 钟楼浮尘（缓慢飘落，垂直光流氛围）----
    const dustGeo = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(DUST_MAX * 3);
    this.dustVel = new Float32Array(DUST_MAX);
    for (let i = 0; i < DUST_MAX; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 14;
      this.dustPos[i * 3 + 1] = -1.6 + Math.random() * 12;
      this.dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 3;
      this.dustVel[i] = 0.1 + Math.random() * 0.25;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xc8b890, size: 0.04, transparent: true, opacity: 0.55,
    }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // ---- 命中目标环（世界空间竖直方向；头点头到目标方位时正好套上光球）----
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

    // ---- 状态 ----
    this.repaired = 0;
    this._anim = [];
    this._flash = 0;
    this._flashRed = 0;
    this._sparkBoost = 0;
    this._glitchCount = 0;
    this._prevSmooth = true;
    this._ringing = false;
    this._ringT = 0;
    this._targetBase = new THREE.Color(0xffc85e);
    this._glowBase = new THREE.Color(0x66bbff);
    this.t = 0;
    this.energy = 0;
    this._lockK = 0;
  }

  static glowTexture() {
    if (Ch2ClockTower._glowTex) return Ch2ClockTower._glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(160,220,255,0.9)');
    grad.addColorStop(0.35, 'rgba(102,187,255,0.35)');
    grad.addColorStop(1, 'rgba(102,187,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    Ch2ClockTower._glowTex = new THREE.CanvasTexture(c);
    return Ch2ClockTower._glowTex;
  }

  // 目标环放到指定俯仰方位（度）；head pitch = bearing 时目标与光球屏幕重合
  // 竖直方向：bearing > 0 在上方，< 0 在下方（相机 rotation.x=+pitch 的反向补偿）
  setTargetBearing(deg) {
    const rad = THREE.MathUtils.degToRad(deg);
    this.target.position.set(0, Math.sin(rad) * 4.5, -Math.cos(rad) * 4.5);
    this.target.visible = true;
    this.targetRing.material.color.copy(this._targetBase);
  }

  // 固定场景模式：靶环按"头相对目标的俯仰角差"摆放（delta=0 时与光球屏幕重合）
  // 相机不转，靶环在光球前方固定深度纵向滑动：offset = tan(delta°) × 深度
  setTargetDelta(deg) {
    const rad = THREE.MathUtils.degToRad(deg);
    this.target.position.set(0, Math.tan(rad) * 4.5, -4.5);
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

  // 修复一齿轮：灰死静止 → 黄铜色开始转动，1 秒动画；外圈修完才推进内圈
  repairSegment() {
    if (this.repaired >= this.segments.length) return false;
    this._anim.push({ g: this.segments[this.repaired++], k: 0 });
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

  // 毛刺惩罚：最近齿轮火花变大；连续 3 次 → 齿轮组整体闪红一次
  onGlitch() {
    this._glitchCount++;
    this._sparkBoost = 1;
    const g = this.segments[Math.min(this.repaired, this.segments.length - 1)];
    const wp = new THREE.Vector3();
    g.getWorldPosition(wp);
    this.burst(wp, 8, 0.6);
    if (this._glitchCount >= 3) { this._flashRed = 1; this._glitchCount = 0; }
  }

  setGolden() {
    // 通关：光球转金 + 齿轮组泛金
    this.orbMat.uniforms.uColor.value.set(0xffd977);
    this.glowMat.color.set(0xffd977);
    this.segments.forEach(s => { s.userData.mat.emissive = new THREE.Color(0x6a5a20); });
  }

  // 修复完成终演：全部齿轮咬合转动 + 钟摆满幅 + 铜铃敲响（钟波扩散环 + 金色光脉冲）+ 指针快速走时
  ringBell() {
    if (this._ringing) return;
    this._ringing = true;
    this._ringT = 0;
    this._waveTimer = 0;
  }

  update(dt) {
    this.t += dt;
    const breathe = 1 + (0.04 + 0.05 * this.energy) * Math.sin(this.t * 2);
    this.orbMat.uniforms.uBreath.value = 0.5 + 0.5 * Math.sin(this.t * 2);
    this.orbLight.intensity = 1.7 + 0.4 * Math.sin(this.t * 2) + this.energy * 0.5;
    this.halo.scale.setScalar(1 + 0.08 * Math.sin(this.t * 2));
    this.haloMat.opacity = 0.5 + 0.15 * Math.sin(this.t * 2) + this.energy * 0.2;
    this.glow.scale.setScalar((1.7 + 0.55 * this.energy) * breathe);
    this.orbGear.rotation.z += dt * 1.2;

    // 齿轮转动：已修复的按各自速度/方向咬合转动（终演时全部加速）
    for (let i = 0; i < this.segments.length; i++) {
      const g = this.segments[i];
      const u = g.userData;
      const spinning = this._ringing || i < this.repaired;
      const target = spinning ? (this._ringing ? 2.6 : u.speed) : 0;
      u.spin += (target - u.spin) * Math.min(1, dt * 3);
      if (u.spin > 0.001) g.rotation.z += dt * u.spin * u.dir;
    }

    // 中央大钟摆：修复进度越高摆幅越大；终演满幅
    const swingAmp = this._ringing ? 0.55 : 0.06 + this.progress * 0.32;
    const swingW = this._ringing ? 2.4 : 1.6;
    this.pendulum.rotation.z = swingAmp * Math.sin(this.t * swingW);

    // 指针走时：平时极慢，终演快速
    const handSpeed = this._ringing ? 6 : 0.02;
    this.minuteHand.rotation.z -= dt * handSpeed;
    this.hourHand.rotation.z -= dt * handSpeed / 12;

    // 铜铃：终演摇摆 + 钟波扩散环 + 金色光脉冲
    if (this._ringing) {
      this._ringT += dt;
      this.bell.rotation.z = Math.sin(this._ringT * 8) * 0.08;
      this._waveTimer -= dt;
      if (this._waveTimer <= 0) {
        this._waveTimer = 0.6;
        const w = this.waves.find(x => x.k >= 1);
        if (w) { w.k = 0; w.mesh.visible = true; }
      }
      this.bellLight.intensity = 2.2 + Math.sin(this._ringT * 8) * 1.2;
    }
    for (const w of this.waves) {
      if (w.k >= 1) { w.mesh.visible = false; continue; }
      w.k = Math.min(1, w.k + dt * 0.7);
      w.mesh.scale.setScalar(1 + w.k * 7);
      w.mesh.material.opacity = 0.85 * (1 - w.k);
    }

    // 浮尘飘落（循环）
    for (let i = 0; i < DUST_MAX; i++) {
      this.dustPos[i * 3 + 1] -= this.dustVel[i] * dt;
      if (this.dustPos[i * 3 + 1] < -1.6) {
        this.dustPos[i * 3 + 1] = -1.6 + 10 + Math.random() * 3;
        this.dustPos[i * 3] = (Math.random() - 0.5) * 14;
        this.dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 3;
      }
    }
    this.dust.geometry.attributes.position.needsUpdate = true;

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
      if (this._flash === 0 && !this._ringing) this.glowMat.color.copy(this._glowBase);
    }
    // 毛刺齿轮组整体闪红（单次渐变）
    if (this._flashRed > 0) {
      this._flashRed = Math.max(0, this._flashRed - dt * 1.4);
      const k = this._flashRed;
      this.segments.forEach((s, i) => {
        const base = i < this.repaired ? this.gearBrass : this.gearGray;
        s.userData.mat.color.copy(base).lerp(new THREE.Color(0xe04040), k);
      });
      if (this._flashRed === 0) this._restoreGearColors();
    }
    if (this._sparkBoost > 0) this._sparkBoost = Math.max(0, this._sparkBoost - dt * 1.5);

    // 修复动画：灰死 → 黄铜（1 秒 smoothstep）
    this._anim = this._anim.filter(a => {
      a.k = Math.min(1, a.k + dt);
      const e = a.k * a.k * (3 - 2 * a.k);
      a.g.userData.mat.color.lerpColors(this.gearGray, this.gearBrass, e);
      a.g.scale.setScalar(1 + 0.15 * Math.sin(e * Math.PI));
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
  }

  _restoreGearColors() {
    this.segments.forEach((s, i) => {
      s.userData.mat.color.copy(i < this.repaired ? this.gearBrass : this.gearGray);
    });
  }
}
