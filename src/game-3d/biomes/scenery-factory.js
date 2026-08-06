// 程序化侧边景观工厂（城市除外，城市复用 Buildings）
import * as THREE from 'three';
import { ROAD_WIDTH } from '../assets/road.js';
import { WorldCurve } from '../curve.js';

const SEG_LEN = 20;

export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
export const ROADSIDE_MARGIN = 4;
export const CLEAR_ZONE_HALF_WIDTH = ROAD_HALF_WIDTH + ROADSIDE_MARGIN;

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

export function roadsideOffset(minOffset = ROADSIDE_MARGIN, maxOffset = 18) {
  return ROAD_HALF_WIDTH + randomRange(minOffset, maxOffset);
}

export function randomRoadsideX(minOffset = ROADSIDE_MARGIN, maxOffset = 18) {
  return randomSign() * roadsideOffset(minOffset, maxOffset);
}

export function isOutsideClearZone(x) {
  return Math.abs(x) >= CLEAR_ZONE_HALF_WIDTH;
}

function tag(mesh, type, initZ) {
  mesh.userData.type = type;
  mesh.userData.initZ = initZ;
  return mesh;
}

function buildItems(group) {
  return group.children.map((mesh) => ({ mesh, initZ: mesh.userData.initZ }));
}

// 通用：按 worldZ 循环回收的 update 函数（含弯道横向偏移）
function makeRecycler(items, count, segLen) {
  const total = count * segLen;
  const BACK = segLen;
  return (worldZ) => {
    for (const it of items) {
      const raw = it.initZ - worldZ;
      const z = ((raw - BACK) % total + total) % total + BACK - total;
      it.mesh.position.z = z;
      // 弯道偏移叠加在原始横向位置上（基础 x 记录在 userData）
      if (it.baseX === undefined) it.baseX = it.mesh.position.x;
      it.mesh.position.x = it.baseX + WorldCurve.offsetAt(z);
    }
  };
}

// ---------- 通用元素构造器 ----------
function createWater(z, geo, mat) {
  const water = new THREE.Mesh(geo, mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(-70, -0.2, z);
  return tag(water, 'water', z);
}

function createRock(z, mat, x, radius, scale) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), mat);
  rock.position.set(x, 0.5, z + (Math.random() - 0.5) * SEG_LEN);
  rock.scale.set(scale[0], scale[1], scale[2]);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  return tag(rock, 'rock', z);
}

function createTree(z, trunkMat, leavesMat, x, scale, trunkGeo, leavesGeo) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkGeo.parameters.height / 2;
  tree.add(trunk);
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = trunkGeo.parameters.height + leavesGeo.parameters.height / 2;
  tree.add(leaves);
  tree.position.set(x, 0, z + (Math.random() - 0.5) * SEG_LEN * 0.7);
  tree.scale.setScalar(scale);
  return tag(tree, 'tree', z);
}

function createGrass(z, mat, x, radius) {
  const grass = new THREE.Mesh(new THREE.CircleGeometry(radius, 6), mat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(x, 0.02, z + (Math.random() - 0.5) * SEG_LEN);
  return tag(grass, 'grass', z);
}

function createSand(z, geo, mat) {
  const sand = new THREE.Mesh(geo, mat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.05, z);
  return tag(sand, 'sand', z);
}

function createDune(z, mat, sign) {
  const dune = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 6, 12, 8), mat);
  dune.position.set(sign * randomRange(35, 55), -3, z + (Math.random() - 0.5) * SEG_LEN);
  dune.scale.set(1, 0.25, 1.5);
  return tag(dune, 'dune', z);
}

function createCactus(z, mat, x, scale) {
  const cactus = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2, 8), mat);
  body.position.y = 1;
  cactus.add(body);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.8, 6), mat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.25, 1.3, 0);
  cactus.add(arm);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
  cap.position.y = 2;
  cactus.add(cap);
  cactus.position.set(x, 0, z + (Math.random() - 0.5) * SEG_LEN);
  cactus.scale.setScalar(scale);
  return tag(cactus, 'cactus', z);
}

// ---------- 湖边 ----------
function buildLakesideScenery() {
  const group = new THREE.Group();
  const waterGeo = new THREE.PlaneGeometry(120, SEG_LEN);
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x3a7a9a, transparent: true, opacity: 0.85,
  });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x7a7a72, flatShading: true });
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2a6a3a, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6);
  const leavesGeo = new THREE.ConeGeometry(1.2, 3.5, 7);

  for (let i = -3; i < 30; i++) {
    const z = -i * SEG_LEN;
    group.add(createWater(z, waterGeo, waterMat));
    for (let k = 0; k < 4; k++) {
      group.add(createRock(z, rockMat, -roadsideOffset(4, 8), 0.6 + Math.random() * 0.6,
        [1 + Math.random(), 0.6 + Math.random() * 0.4, 1 + Math.random()]));
    }
    for (let k = 0; k < 3; k++) {
      group.add(createTree(z, trunkMat, treeMat, roadsideOffset(4, 13), 0.8 + Math.random() * 0.4,
        trunkGeo, leavesGeo));
    }
  }
  return { group, update: makeRecycler(buildItems(group), 33, SEG_LEN) };
}

// ---------- 山谷 ----------
function buildValleyScenery() {
  const group = new THREE.Group();
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x1e5a2a, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6a6a62, flatShading: true });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x3a7a2a });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.4, 6);
  const leavesGeo = new THREE.ConeGeometry(1.4, 4, 7);

  for (let i = -3; i < 30; i++) {
    const z = -i * SEG_LEN;
    for (const sign of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        group.add(createTree(z, trunkMat, treeMat, sign * roadsideOffset(4, 16), 0.9 + Math.random() * 0.5,
          trunkGeo, leavesGeo));
      }
    }
    for (let k = 0; k < 3; k++) {
      group.add(createRock(z, rockMat, randomRoadsideX(4, 16.5), 0.7 + Math.random() * 0.5,
        [1 + Math.random(), 0.6 + Math.random() * 0.4, 1 + Math.random()]));
    }
    for (let k = 0; k < 6; k++) {
      group.add(createGrass(z, grassMat, randomRoadsideX(4, 21.5), 0.6 + Math.random() * 0.6));
    }
  }
  return { group, update: makeRecycler(buildItems(group), 33, SEG_LEN) };
}

// ---------- 沙漠 ----------
function buildDesertScenery() {
  const group = new THREE.Group();
  const sandGeo = new THREE.PlaneGeometry(120, SEG_LEN);
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd8b878 });
  const duneMat = new THREE.MeshLambertMaterial({ color: 0xc8a86a, flatShading: true });
  const cactusMat = new THREE.MeshLambertMaterial({ color: 0x4a7a2a });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x9a6a4a, flatShading: true });

  for (let i = -3; i < 30; i++) {
    const z = -i * SEG_LEN;
    group.add(createSand(z, sandGeo, sandMat));
    for (const sign of [-1, 1]) {
      group.add(createDune(z, duneMat, sign));
    }
    for (let k = 0; k < 3; k++) {
      group.add(createCactus(z, cactusMat, randomRoadsideX(4, 17.5), 0.7 + Math.random() * 0.5));
    }
    for (let k = 0; k < 2; k++) {
      group.add(createRock(z, rockMat, randomRoadsideX(4, 22.5), 0.8 + Math.random() * 0.6, [1, 1, 1]));
    }
  }
  return { group, update: makeRecycler(buildItems(group), 33, SEG_LEN) };
}

export function buildScenery(type) {
  switch (type) {
    case 'lakeside': return buildLakesideScenery();
    case 'valley': return buildValleyScenery();
    case 'desert': return buildDesertScenery();
    default: return null;
  }
}
