// 程序化天空 — 渐变 + 云（无外部资产）
import * as THREE from 'three';

export class Sky {
  constructor() {
    // 巨大内翻球体，顶点色渐变
    this.geo = new THREE.SphereGeometry(500, 24, 12);
    this.horizon = new THREE.Color(0xaec9e0);
    this.zenith = new THREE.Color(0x5a8ac8);
    this.ground = new THREE.Color(0x6a7a8a);
    this._rebuildColors();
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);

    // 卡通云（几团白色半透球）
    this.clouds = new THREE.Group();
    this.cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85, fog: false,
    });
    const cloudGeo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(cloudGeo, this.cloudMat);
        puff.scale.set(12 + Math.random()*10, 5 + Math.random()*3, 8 + Math.random()*6);
        puff.position.set(j * 9 - 13, Math.random()*3, Math.random()*4 - 2);
        cloud.add(puff);
      }
      cloud.position.set(
        (Math.random() - 0.5) * 600,
        80 + Math.random() * 80,
        (Math.random() - 0.5) * 600
      );
      this.clouds.add(cloud);
    }
    this.mesh.add(this.clouds);
  }

  _rebuildColors() {
    const colors = [];
    const pos = this.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 500;
      let c;
      if (y > 0) {
        c = this.horizon.clone().lerp(this.zenith, Math.min(1, y));
      } else {
        c = this.horizon.clone().lerp(this.ground, Math.min(1, -y));
      }
      colors.push(c.r, c.g, c.b);
    }
    this.geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const attr = this.geo.attributes.color;
    attr.setUsage(THREE.DynamicDrawUsage);
    attr.needsUpdate = true;
  }

  setColors(horizon, zenith, ground, cloudOpacity = 0.85) {
    this.horizon.setHex(horizon);
    this.zenith.setHex(zenith);
    this.ground.setHex(ground);
    this._rebuildColors();
    this.cloudMat.opacity = cloudOpacity;
  }

  update(t) {
    // 云缓慢漂移
    this.clouds.children.forEach((c, i) => {
      c.position.x += Math.sin(t * 0.05 + i) * 0.02;
    });
  }
}
