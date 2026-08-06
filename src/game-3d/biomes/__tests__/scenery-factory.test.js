import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScenery,
  randomRange,
  randomSign,
  roadsideOffset,
  randomRoadsideX,
  isOutsideClearZone,
  ROAD_HALF_WIDTH,
  ROADSIDE_MARGIN,
  CLEAR_ZONE_HALF_WIDTH,
} from '../scenery-factory.js';

const ITERATIONS = 1000;

function assertInRange(value, min, max, label) {
  assert(value >= min && value <= max, `${label || 'value'}=${value} outside [${min}, ${max}]`);
}

function computeInnerEdgeX(object, parentX = 0) {
  const worldX = parentX + object.position.x;
  if (object.isMesh) {
    object.geometry.computeBoundingSphere();
    const radius = object.geometry.boundingSphere.radius * object.scale.x;
    return Math.abs(worldX) - radius;
  }
  if (object.isGroup) {
    let minEdge = Infinity;
    for (const child of object.children) {
      minEdge = Math.min(minEdge, computeInnerEdgeX(child, worldX));
    }
    return minEdge;
  }
  return Math.abs(worldX);
}

function assertAllOutsideRoadSurface(children, types, message) {
  const offenders = children.filter(
    (child) => types.includes(child.userData.type) && computeInnerEdgeX(child) < ROAD_HALF_WIDTH
  );
  assert.equal(offenders.length, 0, `${message}: ${offenders.length} objects overlap the road surface`);
}

function assertAllOutsideClearZone(children, types, message) {
  const offenders = children.filter(
    (child) => types.includes(child.userData.type) && !isOutsideClearZone(child.position.x)
  );
  assert.equal(offenders.length, 0, `${message}: ${offenders.length} objects inside clear zone`);
}

function assertHasType(children, type) {
  const count = children.filter((child) => child.userData.type === type).length;
  assert(count > 0, `expected at least one object of type "${type}"`);
}

describe('position utilities', () => {
  test('randomRange stays within [min, max]', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const value = randomRange(3, 7);
      assertInRange(value, 3, 7, 'randomRange(3, 7)');
    }
    test('unknown scenery type returns null', () => {
    assert.equal(buildScenery('unknown'), null);
  });

  test('scenery update keeps finite z positions', () => {
    const scenery = buildScenery('desert');
    scenery.update(0);
    const initialZ = scenery.group.children[0].position.z;
    scenery.update(500);
    const updatedZ = scenery.group.children[0].position.z;
    assert.equal(typeof updatedZ, 'number');
    assert.ok(Number.isFinite(updatedZ), 'updated z should be finite');
    assert.notEqual(updatedZ, initialZ, 'update should move recycled scenery');
  });
});

  test('randomSign returns only -1 or 1', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const sign = randomSign();
      assert(sign === -1 || sign === 1, `randomSign() returned ${sign}`);
    }
  });

  test('roadsideOffset stays within requested margin range', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const offset = roadsideOffset(4, 8);
      assertInRange(offset, ROAD_HALF_WIDTH + 4, ROAD_HALF_WIDTH + 8, 'roadsideOffset(4, 8)');
    }
  });

  test('randomRoadsideX stays outside clear zone and within requested range', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const x = randomRoadsideX(4, 10);
      assert(isOutsideClearZone(x), `x=${x} inside clear zone ${CLEAR_ZONE_HALF_WIDTH}`);
      assertInRange(Math.abs(x), CLEAR_ZONE_HALF_WIDTH, ROAD_HALF_WIDTH + 10, '|randomRoadsideX(4, 10)|');
    }
  });

  test('isOutsideClearZone uses correct boundary', () => {
    assert.equal(isOutsideClearZone(0), false);
    assert.equal(isOutsideClearZone(9), false);
    assert.equal(isOutsideClearZone(-9), false);
    assert.equal(isOutsideClearZone(12.9), false);
    assert.equal(isOutsideClearZone(-12.9), false);
    assert.equal(isOutsideClearZone(13), true);
    assert.equal(isOutsideClearZone(-13), true);
    assert.equal(isOutsideClearZone(20), true);
    assert.equal(isOutsideClearZone(-20), true);
  });
});

describe('scenery objects stay outside the road clear zone', () => {
  test('desert cacti and rocks are outside clear zone and do not overlap road', () => {
    const scenery = buildScenery('desert');
    assert(scenery, 'buildScenery("desert") should return a scenery object');
    assertHasType(scenery.group.children, 'cactus');
    assertHasType(scenery.group.children, 'rock');
    assertAllOutsideClearZone(scenery.group.children, ['cactus', 'rock'], 'desert side objects');
    assertAllOutsideRoadSurface(scenery.group.children, ['cactus', 'rock'], 'desert side objects');
  });

  test('desert sand plane is centered on the road', () => {
    const scenery = buildScenery('desert');
    const sands = scenery.group.children.filter((child) => child.userData.type === 'sand');
    assert(sands.length > 0, 'expected sand plane');
    for (const sand of sands) {
      assert.equal(sand.position.x, 0, 'sand plane should be centered on the road');
      assert.ok(sand.geometry.parameters.width >= ROAD_HALF_WIDTH * 2, 'sand plane should cover the road width');
    }
  });

  test('valley rocks and grass are outside clear zone and do not overlap road', () => {
    const scenery = buildScenery('valley');
    assert(scenery, 'buildScenery("valley") should return a scenery object');
    assertHasType(scenery.group.children, 'rock');
    assertHasType(scenery.group.children, 'grass');
    assertAllOutsideClearZone(scenery.group.children, ['rock', 'grass'], 'valley side objects');
    assertAllOutsideRoadSurface(scenery.group.children, ['rock', 'grass'], 'valley side objects');
  });

  test('valley trees are outside clear zone and do not overlap road', () => {
    const scenery = buildScenery('valley');
    assertHasType(scenery.group.children, 'tree');
    assertAllOutsideClearZone(scenery.group.children, ['tree'], 'valley trees');
    assertAllOutsideRoadSurface(scenery.group.children, ['tree'], 'valley trees');
  });

  test('lakeside rocks and trees are outside clear zone and do not overlap road', () => {
    const scenery = buildScenery('lakeside');
    assert(scenery, 'buildScenery("lakeside") should return a scenery object');
    assertHasType(scenery.group.children, 'rock');
    assertHasType(scenery.group.children, 'tree');
    assertAllOutsideClearZone(scenery.group.children, ['rock', 'tree'], 'lakeside side objects');
    assertAllOutsideRoadSurface(scenery.group.children, ['rock', 'tree'], 'lakeside side objects');
  });

  test('unknown scenery type returns null', () => {
    assert.equal(buildScenery('unknown'), null);
  });

  test('scenery update keeps finite z positions', () => {
    const scenery = buildScenery('desert');
    scenery.update(0);
    const initialZ = scenery.group.children[0].position.z;
    scenery.update(500);
    const updatedZ = scenery.group.children[0].position.z;
    assert.equal(typeof updatedZ, 'number');
    assert.ok(Number.isFinite(updatedZ), 'updated z should be finite');
    assert.notEqual(updatedZ, initialZ, 'update should move recycled scenery');
  });
});
