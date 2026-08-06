// 金币系统（对齐 2D：发光金色光晕金币 + 沿车道纵向排列 + 收集 +100 分）
import * as THREE from 'three';
import { LANES_X } from './assets/road.js';
import { WorldCurve } from './curve.js';

// 共享金币贴图（canvas 画发光金币，对齐 2D radial gradient）
function makeCoinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  // 外层金色光晕
  const glow = x.createRadialGradient(64, 64, 20, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,230,80,0.95)');
  glow.addColorStop(0.5, 'rgba(255,200,40,0.5)');
  glow.addColorStop(1, 'rgba(255,180,0,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, 128, 128);
  // 金币本体
  x.beginPath();
  x.arc(64, 64, 34, 0, Math.PI * 2);
  const body = x.createRadialGradient(52, 52, 4, 64, 64, 34);
  body.addColorStop(0, '#fff6c8');
  body.addColorStop(0.5, '#ffd700');
  body.addColorStop(1, '#c89000');
  x.fillStyle = body;
  x.fill();
  // 边缘
  x.lineWidth = 4;
  x.strokeStyle = '#a87800';
  x.stroke();
  // 中间 $ 符号
  x.fillStyle = '#a87800';
  x.font = 'bold 44px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('$', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Coins {
  constructor() {
    this.group = new THREE.Group();
    this.active = [];
    this.tex = makeCoinTexture();
    // 微弱光晕（缩小减淡，不再挡视线）
    this.glowMat = new THREE.SpriteMaterial({
      map: this.tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.35,
    });
    // 3D 金币本体：金色圆柱，侧向站立 + 绕 Y 轴旋转（不正面挡玩家）
    this.coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24);
    this.coinMat = new THREE.MeshLambertMaterial({
      color: 0xffd700, emissive: 0x8a6800, emissiveIntensity: 0.6,
    });
  }

  _make() {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
    coin.rotation.z = Math.PI / 2;  // 柱轴沿 X：币面侧向，边缘对着来车方向
    g.add(coin);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.set(1.0, 1.0, 1);
    g.add(glow);
    g.userData.coin = coin;
    return g;
  }

  spawn(z, laneIdx) {
    const c = this._make();
    // 金币贴车道边缘侧向排列（不遮挡前方车辆/障碍物，对齐 2D）
    const edge = laneIdx <= 2 ? -1.6 : 1.6;
    c.position.set(LANES_X[laneIdx] + edge, 0.4, z);
    this.group.add(c);
    this.active.push({ mesh: c, lane: laneIdx, edge, collected: false, bob: Math.random() * Math.PI * 2 });
  }

  // 金币链：沿车道纵向排列（对齐 2D，间距加密更多枚）
  spawnChain(z, laneIdx, len) {
    for (let i = 0; i < len; i++) {
      this.spawn(z - i * 1.8, laneIdx);
    }
  }

  update(dt, worldSpeed, playerZ, playerX, onCollect) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.mesh.position.z += worldSpeed * dt;  // 静止障碍物向玩家流来（+Z）
      // 绕 Y 轴旋转（3D 侧向金币的旋转动画）
      c.mesh.rotation.y += dt * 3;
      // 小幅上下浮动（贴地一点，不挡视线）
      c.bob += dt * 3;
      const relZ = c.mesh.position.z - playerZ;
      // 弯道：远处视觉横向偏移（车道基础 x + 弯道偏移）
      c.mesh.position.x = LANES_X[c.lane] + c.edge + WorldCurve.offsetAt(relZ);
      c.mesh.position.y = 0.4 + Math.sin(c.bob) * 0.06;
      if (!c.collected && Math.abs(relZ) < 1.4 && Math.abs(c.mesh.position.x - playerX) < 1.8) {
        c.collected = true;
        onCollect(c);
        this.group.remove(c.mesh);
        this.active.splice(i, 1);
        continue;
      }
      if (relZ > 20) {
        this.group.remove(c.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  reset() {
    for (const c of this.active) this.group.remove(c.mesh);
    this.active = [];
  }
}
