// 程序化建筑 — 道路两侧低层建筑（无外部资产）
import * as THREE from 'three';
import { WorldCurve } from '../curve.js';

const PALETTES = [
  { wall: 0xe8d8b8, roof: 0x6a5a4a, window: 0x3a4a5a },
  { wall: 0xd8c8a8, roof: 0x5a4a3a, window: 0x2a3a4a },
  { wall: 0xc8b8a8, roof: 0x4a3a2a, window: 0x3a4a4a },
  { wall: 0xb8a8c8, roof: 0x5a4a5a, window: 0x4a3a4a },
  { wall: 0xa8b8c8, roof: 0x3a4a5a, window: 0x2a3a3a },
];

function makeBuilding(palette, width, height, depth) {
  const g = new THREE.Group();
  // 主体
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color: palette.wall })
  );
  body.position.y = height / 2;
  g.add(body);
  // 屋顶
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.4, 0.5, depth + 0.4),
    new THREE.MeshLambertMaterial({ color: palette.roof })
  );
  roof.position.y = height + 0.25;
  g.add(roof);
  // 窗户（平面贴片，朝向道路）
  const rows = Math.floor(height / 3);
  const cols = Math.floor(width / 3);
  const winGeo = new THREE.PlaneGeometry(1.4, 1.8);
  const winMat = new THREE.MeshLambertMaterial({ color: palette.window });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(
        (c - (cols - 1) / 2) * 3,
        r * 3 + 2,
        depth / 2 + 0.02
      );
      g.add(win);
    }
  }
  return g;
}

export class Buildings {
  constructor() {
    this.group = new THREE.Group();
    this.items = [];
    const SEG_LEN = 20;
    const ROAD_WIDTH = 18;
    // 左右两侧，每 20m 一段，前方 8 段后方 2 段
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const x = sign * (ROAD_WIDTH / 2 + 9 + Math.random() * 4);
      // 建筑段数：-3 到 24（约 540m 前方，每侧 27 栋）
      for (let i = -3; i < 24; i++) {
        const palette = PALETTES[(((i + side * 3) % PALETTES.length) + PALETTES.length) % PALETTES.length];
        const w = 8 + Math.random() * 6;
        const h = 7 + Math.random() * 10;
        const d = 8 + Math.random() * 4;
        const b = makeBuilding(palette, w, h, d);
        const bx = x + (Math.random() - 0.5) * 2;
        b.position.set(bx, 0, -i * SEG_LEN);
        // 让建筑朝向道路（转 180° 让窗户面向路）
        b.rotation.y = side === 0 ? Math.PI : 0;
        this.group.add(b);
        this.items.push({ mesh: b, side, segIdx: i, baseX: bx });
      }
    }
  }

  update(worldZ) {
    // 玩家固定 z=0，建筑向 +Z 流；到身后 60m 循环回前方，街景无限延伸
    const SEG_LEN = 20;
    const COUNT = 27;              // 每侧 27 栋（i: -3..23）
    const total = COUNT * SEG_LEN; // 540
    const BACK = 3 * SEG_LEN;      // 身后 60m 回收线
    for (const it of this.items) {
      const initZ = -it.segIdx * SEG_LEN;
      const raw = initZ - worldZ;  // worldZ 递减 → raw 递增（向 +Z 流）
      const z = ((raw - BACK) % total + total) % total + BACK - total;
      it.mesh.position.z = z;
      // 弯道偏移叠加在建筑自身横向位置上
      it.mesh.position.x = it.baseX + WorldCurve.offsetAt(z);
    }
  }
}
