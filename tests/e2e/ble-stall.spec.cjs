// 推送式采集(PUSH-ACQ-v1)帧解析回归 —— 逻辑级
// 从 bundle 提取真实的 Fe(帧解析) 函数，包进变量沙盒喂帧:
//   A) 0x61 推送帧: acc/gyro/角度偏移解析正确(含 yaw/pitch 取反约定)
//   B) 孤立大步进原样通过(不再毛刺拒绝)
//   C) 停顿后大跳变: 首帧立即送真值(不再去抖/重锚定)
//   D) 平滑运动逐帧送达
//   E) ±180° 跨界连续化
//   F) 字节丢失失步: 滑动重对齐, desyncs 计数, 后续真帧正常
//   G) 0x61 与 0x3D 混合流都能解析
// 用法: node tests/e2e/ble-stall.spec.cjs
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'index-Cc2Ik-Ku.js', ), 'utf8');

function extractFn(startMark) {
  const start = SRC.indexOf(startMark);
  if (start < 0) throw new Error('未找到函数: ' + startMark);
  let depth = 0, i = SRC.indexOf('{', start);
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return SRC.slice(start, i);
}

const FE_TEXT = extractFn('function Fe(e){window.__gyroDiag');

// 0x3D 帧: roll@2 / pitchRaw@4(显示=-值) / yawRaw@6(显示=-值)
function mkFrame(yaw, pitch = 0, roll = 0) {
  const b = new Uint8Array(20);
  b[0] = 0x55; b[1] = 0x3D;
  const dv = new DataView(b.buffer);
  const s = 32768 / 180;
  dv.setInt16(2, Math.round(roll * s), true);
  dv.setInt16(4, Math.round(-pitch * s), true);
  dv.setInt16(6, Math.round(-yaw * s), true);
  return b;
}

// 0x61 推送帧: acc@2-7 / gyro@8-13 / roll@14 / pitchRaw@16(显示=-值) / yawRaw@18(显示=-值)
function mk61(yaw, pitch = 0, roll = 0) {
  const b = new Uint8Array(20);
  b[0] = 0x55; b[1] = 0x61;
  const dv = new DataView(b.buffer);
  const s = 32768 / 180;
  dv.setInt16(6, Math.round(1 * 32768 / 16), true);          // az ≈ 1g
  dv.setInt16(14, Math.round(roll * s), true);
  dv.setInt16(16, Math.round(-pitch * s), true);
  dv.setInt16(18, Math.round(-yaw * s), true);
  return b;
}

function build() {
  const delivered = [];
  const harness = new Function('H', 'win', 'U', `
    let Oe=new Uint8Array,ke=0,Ae=0,je=null,Me=null,Ne=null,Pe=null,W=0;
    ${FE_TEXT}
    return { Fe, state: () => ({ Me, Ne, Pe }) };
  `);
  const h = harness(
    () => {},                                   // H: 日志静默
    { updateFromGyroscope: p => delivered.push(p) },
    { writeValue: () => Promise.resolve() },
  );
  global.window = { updateFromGyroscope: p => delivered.push(p) };
  return { Fe: h.Fe, delivered, state: h.state };
}

function feed(h, yaw, pitch = 0, roll = 0, mk = mkFrame) {
  const b = mk(yaw, pitch, roll);
  h.Fe({ target: { value: new DataView(b.buffer, b.byteOffset, b.byteLength) } });
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- A) 0x61 推送帧解析正确 ----------
{
  const h = build();
  for (let k = 0; k < 3; k++) feed(h, 30, 10, -5, mk61);
  const p = h.delivered[h.delivered.length - 1];
  const ok = p && Math.abs(p.yaw - 30) < 0.1 && Math.abs(p.pitch - 10) < 0.1 && Math.abs(p.roll - (-5)) < 0.1;
  assert('A 0x61 角度解析正确(含符号约定)', ok,
    p ? `yaw=${p.yaw.toFixed(2)} pitch=${p.pitch.toFixed(2)} roll=${p.roll.toFixed(2)}` : 'null');
}

// ---------- B) 孤立大步进原样通过(不再拒绝) ----------
{
  const h = build();
  for (let k = 0; k < 5; k++) feed(h, 10);
  feed(h, 90);                        // 大步进: 原样通过
  for (let k = 0; k < 5; k++) feed(h, 10);
  const yaws = h.delivered.map(p => p.yaw);
  const ok = yaws.length === 11 && Math.abs(yaws[5] - 90) < 1 && Math.abs(yaws[6] - 10) < 1;
  assert('B 孤立大步进原样通过', ok, '第6帧 yaw=' + (yaws[5] ?? NaN).toFixed(2) + '°');
}

// ---------- C) 停顿后大跳变: 首帧立即送真值 ----------
{
  const h = build();
  for (let k = 0; k < 10; k++) feed(h, 10);
  h.delivered.length = 0;
  const realNow = Date.now;
  Date.now = () => realNow() + 900;   // 停顿 900ms
  try { feed(h, 80); } finally { Date.now = realNow; }
  const last = h.delivered[h.delivered.length - 1];
  assert('C 停顿后首帧立即真值', h.delivered.length === 1 && Math.abs(last.yaw - 80) < 1,
    '第1帧 yaw=' + (last ? last.yaw.toFixed(2) : 'null') + '° 送达 ' + h.delivered.length + ' 帧');
}

// ---------- D) 平滑运动逐帧送达 ----------
{
  const h = build();
  for (let k = 0; k < 10; k++) feed(h, 10);
  h.delivered.length = 0;
  for (let y = 12; y <= 40; y += 2) feed(h, y);
  const ok = h.delivered.length === 15 && h.delivered.every((p, i) => Math.abs(p.yaw - (12 + i * 2)) < 1);
  assert('D 平滑运动逐帧送达', ok, '送达 ' + h.delivered.length + '/15 帧');
}

// ---------- E) ±180° 跨界连续化 ----------
{
  const h = build();
  for (const y of [179, 179.5, -179.5, -179]) feed(h, y);
  const yaws = h.delivered.map(p => p.yaw);
  const ok = yaws.length === 4 && yaws[3] > yaws[0] && yaws[3] - yaws[0] < 3;
  assert('E ±180° 跨界连续(无回跳)', ok, yaws.map(v => v.toFixed(1)).join(' → '));
}

// ---------- F) 字节丢失失步: 滑动重对齐 + desyncs 计数 ----------
{
  const h = build();
  for (let k = 0; k < 5; k++) feed(h, 10);
  h.delivered.length = 0;
  const f20 = mkFrame(20).slice(1);            // 19 字节残缺帧(帧头在链路上丢了)
  const f30 = mkFrame(30), f40 = mkFrame(40);
  const chunk = new Uint8Array(f20.length + 40);
  chunk.set(f20, 0); chunk.set(f30, f20.length); chunk.set(f40, f20.length + 20);
  h.Fe({ target: { value: new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength) } });
  const yaws = h.delivered.map(p => p.yaw);
  const garbage = yaws.filter(y => ![20, 30, 40].some(v => Math.abs(y - v) < 5));
  assert('F 失步后真帧重对齐送达', yaws.length >= 2 && Math.abs(yaws[yaws.length - 1] - 40) < 1,
    '送达序列: ' + yaws.map(v => v.toFixed(1)).join(','));
  assert('F 垃圾帧最多 1 帧', garbage.length <= 1, '垃圾帧 ' + garbage.length + ' 个');
  assert('F desyncs 遥测计数', (global.window.__gyroDiag.desyncs || 0) > 0, 'desyncs=' + (global.window.__gyroDiag.desyncs || 0));
}

// ---------- G) 0x61 与 0x3D 混合流 ----------
{
  const h = build();
  feed(h, 15, 0, 0, mk61);
  feed(h, 25, 0, 0, mkFrame);
  feed(h, 35, 0, 0, mk61);
  const yaws = h.delivered.map(p => p.yaw);
  const ok = yaws.length === 3 && Math.abs(yaws[0] - 15) < 1 && Math.abs(yaws[1] - 25) < 1 && Math.abs(yaws[2] - 35) < 1;
  assert('G 0x61/0x3D 混合流解析', ok, yaws.map(v => v.toFixed(1)).join(','));
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
