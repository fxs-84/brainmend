// 程序化道路生成器 — 5 车道（2D 一致）
// 道路段 20m 长，无限向前延伸
import * as THREE from 'three';
import { WorldCurve } from '../curve.js';

export const ROAD_WIDTH = 18;      // 5 车道总宽
const SEG_LEN = 20;         // 单段长
const SEG_AHEAD = 30;       // 前方 30 段 ≈ 600m（玩家 14m/s 跑 40+ 秒）
const SEG_BEHIND = 3;       // 后方 3 段 ≈ 60m 余量

// 车道中心 X（与 2D 的 7 车道一致，但我们用 5 车道）
// 2D: lanes = [.1,.23,.36,.5,.64,.77,.9] × width
// 3D: 5 车道中心对应 lanes[1,2,3,4,5]
export const LANES_X = [
  (0.23 - 0.5) * ROAD_WIDTH,  // -4.86
  (0.36 - 0.5) * ROAD_WIDTH,  // -2.52
  (0.5 - 0.5) * ROAD_WIDTH,   // 0
  (0.64 - 0.5) * ROAD_WIDTH,  // 2.52
  (0.77 - 0.5) * ROAD_WIDTH,  // 4.86
];

export class Road {
  constructor() {
    this.group = new THREE.Group();
    this.segments = [];
    this._build();
  }

  _build() {
    this.roadMat = this._buildRoadMaterial();
    this.sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, SEG_LEN);
    this.segments = this._buildSegments(roadGeo);
  }

  _buildRoadMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 800; i++) {
      const v = 120 + Math.random() * 80;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return new THREE.MeshLambertMaterial({ map: texture, color: 0x848a92 });
  }

  _buildSegments(roadGeo) {
    let segments = [];
    for (let i = -SEG_BEHIND; i < SEG_AHEAD; i++) {
      const seg = this._buildSegment(-i * SEG_LEN, roadGeo);
      this.group.add(seg);
      segments = [...segments, seg];
    }
    return segments;
  }

  _buildSegment(z, roadGeo) {
    const seg = new THREE.Group();
    const road = new THREE.Mesh(roadGeo, this.roadMat);
    road.rotation.x = -Math.PI / 2;
    seg.add(road);

    const yellowGeo = new THREE.PlaneGeometry(0.18, SEG_LEN);
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf5d800 });
    this._addFlatLine(seg, yellowGeo, yellowMat, -0.3);
    this._addFlatLine(seg, yellowGeo, yellowMat, 0.3);

    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dashGeo = new THREE.PlaneGeometry(0.12, 3);
    this._addLaneDashes(seg, dashGeo, dashMat);

    const edgeGeo = new THREE.PlaneGeometry(0.12, SEG_LEN);
    this._addFlatLine(seg, edgeGeo, dashMat, -ROAD_WIDTH / 2 + 0.4);
    this._addFlatLine(seg, edgeGeo, dashMat, ROAD_WIDTH / 2 - 0.4);

    const sidewalkGeo = new THREE.PlaneGeometry(2.5, SEG_LEN);
    this._addSidewalk(seg, sidewalkGeo, -ROAD_WIDTH / 2 - 1.25);
    this._addSidewalk(seg, sidewalkGeo, ROAD_WIDTH / 2 + 1.25);

    seg.position.z = z;
    return seg;
  }

  _addFlatLine(seg, geo, mat, x) {
    const line = new THREE.Mesh(geo, mat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.01, 0);
    seg.add(line);
  }

  _addLaneDashes(seg, geo, mat) {
    const laneEdges = [
      (LANES_X[0] + LANES_X[1]) / 2,
      (LANES_X[1] + LANES_X[2]) / 2,
      (LANES_X[2] + LANES_X[3]) / 2,
      (LANES_X[3] + LANES_X[4]) / 2,
    ];
    for (const x of laneEdges) {
      for (let z = -SEG_LEN / 2 + 1.5; z < SEG_LEN / 2; z += 6) {
        const dash = new THREE.Mesh(geo, mat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.01, z);
        seg.add(dash);
      }
    }
  }

  _addSidewalk(seg, geo, x) {
    const sw = new THREE.Mesh(geo, this.sidewalkMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(x, 0.05, 0);
    seg.add(sw);
  }

  setTint(roadColor, sidewalkColor) {
    this.roadMat.color.setHex(roadColor);
    this.sidewalkMat.color.setHex(sidewalkColor);
  }

  // 玩家固定 z=0，道路段向 +Z 流；段落到身后 20m 时循环到 640m 前方，道路无限延伸
  // 弯道：按纵深叠加横向偏移（远处偏得多 → 视觉弯曲，碰撞判定不受影响）
  update(worldZ) {
    const COUNT = this.segments.length;       // 33
    const total = COUNT * SEG_LEN;            // 660
    const BACK = SEG_LEN;                     // 身后 20m 回收线
    for (let i = 0; i < COUNT; i++) {
      const seg = this.segments[i];
      const initZ = -(i - SEG_BEHIND) * SEG_LEN;
      const raw = initZ - worldZ;             // worldZ 递减 → raw 递增（向 +Z 流）
      const z = ((raw - BACK) % total + total) % total + BACK - total;
      seg.position.z = z;
      seg.position.x = WorldCurve.offsetAt(z);
    }
  }
}
