// BLE 帧解析器单元测试（WitMotion 协议：0x55 头、20 字节帧、角度帧 0x3D/0x71）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameParser } from '../BleImuSource.js';

const S = 32768 / 180;

// 构造一个 20 字节角度帧（角度单位：度；按解析器的符号约定反推原始值）
function angleFrame(type, rollDeg, pitchDeg, yawDeg) {
  const b = new Uint8Array(20);
  b[0] = 0x55; b[1] = type;
  const dv = new DataView(b.buffer);
  if (type === 61) {          // 0x3D: roll@2 pitch@4 yaw@6
    dv.setInt16(2, Math.round(rollDeg * S), true);
    dv.setInt16(4, Math.round(-pitchDeg * S), true);
    dv.setInt16(6, Math.round(-yawDeg * S), true);
  } else {                    // 0x71: roll@6 pitch@4 yaw@8
    dv.setInt16(6, Math.round(rollDeg * S), true);
    dv.setInt16(4, Math.round(-pitchDeg * S), true);
    dv.setInt16(8, Math.round(-yawDeg * S), true);
  }
  return b;
}

function collect() {
  const poses = [];
  const parser = createFrameParser(p => poses.push({ ...p }));
  return { poses, parser };
}

test('0x3D 角度帧解析（yaw/pitch 取负，roll 为正）', () => {
  const { poses, parser } = collect();
  parser.feed(angleFrame(61, 10, 20, 30));
  assert.equal(poses.length, 1);
  assert.ok(Math.abs(poses[0].roll - 10) < 0.01);
  assert.ok(Math.abs(poses[0].pitch - 20) < 0.01);
  assert.ok(Math.abs(poses[0].yaw - 30) < 0.01);
  assert.equal(parser.stats.angleFrames, 1);
});

test('0x71 角度帧解析（yaw 在偏移 8）', () => {
  const { poses, parser } = collect();
  parser.feed(angleFrame(113, 5, -8, -40));
  assert.equal(poses.length, 1);
  assert.ok(Math.abs(poses[0].roll - 5) < 0.01);
  assert.ok(Math.abs(poses[0].pitch - (-8)) < 0.01);
  assert.ok(Math.abs(poses[0].yaw - (-40)) < 0.01);
});

test('半帧跨包拼接', () => {
  const { poses, parser } = collect();
  const f = angleFrame(61, 1, 2, 3);
  parser.feed(f.slice(0, 7));
  assert.equal(poses.length, 0);            // 半帧不产出
  parser.feed(f.slice(7));
  assert.equal(poses.length, 1);
  assert.ok(Math.abs(poses[0].yaw - 3) < 0.01);
});

test('帧前垃圾字节跳过', () => {
  const { poses, parser } = collect();
  const junk = new Uint8Array([0x00, 0x13, 0xFF, 0x42]);
  const merged = new Uint8Array(24);
  merged.set(junk); merged.set(angleFrame(61, 0, 0, 12), 4);
  parser.feed(merged);
  assert.equal(poses.length, 1);
  assert.ok(Math.abs(poses[0].yaw - 12) < 0.01);
});

test('yaw 跨 ±180° 连续化（179 → 181 而不是 -179）', () => {
  const { poses, parser } = collect();
  parser.feed(angleFrame(61, 0, 0, 179));
  parser.feed(angleFrame(61, 0, 0, -179));   // 原始值跳变 358°，应连续化为 181
  assert.equal(poses.length, 2);
  assert.ok(Math.abs(poses[1].yaw - 181) < 0.5, `yaw=${poses[1].yaw}`);
});

test('单帧跳变 >60° 毛刺拒绝', () => {
  const { poses, parser } = collect();
  parser.feed(angleFrame(61, 0, 0, 0));
  parser.feed(angleFrame(61, 0, 0, 90));     // 跳变 90° → 拒绝
  assert.equal(poses.length, 1);
  assert.equal(parser.stats.rejected, 1);
  parser.feed(angleFrame(61, 0, 0, 5));      // 回到合理位置 → 接受
  assert.equal(poses.length, 2);
});

test('非角度帧（如磁力计 0x61=97）不产出姿态', () => {
  const { poses, parser } = collect();
  const f = new Uint8Array(20);
  f[0] = 0x55; f[1] = 97;
  parser.feed(f);
  assert.equal(poses.length, 0);
  assert.equal(parser.stats.otherFrames, 1);
});
