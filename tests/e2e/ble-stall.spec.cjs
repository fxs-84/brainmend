// BLE 卡顿/卡死修复(STALL-FIX-v1)回归测试 —— 逻辑级
// 从 bundle 提取真实的 Fe(帧解析+毛刺拒绝) 与 Cp(跳变守卫) 函数，包进变量沙盒喂帧：
//   A) 孤立毛刺帧仍被拒绝（不回归）
//   B) BLE 停顿后大跳变：2 帧内自动重锚定（修复前永久卡死在旧值）
//   C) 超长停顿(>800ms)：单帧直接重锚定
//   D) 平滑运动不受两帧去抖影响
//   E) ±180° 跨界连续化不受影响
// 用法：node tests/e2e/ble-stall.spec.cjs
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'index-Cc2Ik-Ku.js'), 'utf8');

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

const CP_TEXT = extractFn('function Cp(e){let t=e.maxStepDeg');
const FE_TEXT = extractFn('function Fe(e){let t=Date.now()');

// 组帧：0x55 + type=0x3D，roll@2 / pitchRaw@4(显示=-值) / yawRaw@6(显示=-值)
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

function build() {
  const delivered = [];
  const harness = new Function('H', 'win', 'U', `
    let Oe=new Uint8Array,ke=0,Ae=0,je=null,Me=null,Ne=null,Pe=null,W=0;
    ${CP_TEXT}
    ${FE_TEXT}
    return { Fe, state: () => ({ Me, Ne, Pe }) };
  `);
  const h = harness(
    () => {},                                   // H: 日志静默
    { updateFromGyroscope: p => delivered.push(p) },  // win → window
    { writeValue: () => Promise.resolve() },    // U: 写入特征桩
  );
  // 全局 window 引用(Fe 内 window.updateFromGyroscope)
  global.window = { updateFromGyroscope: p => delivered.push(p) };
  return { Fe: h.Fe, delivered, state: h.state };
}

function feed(h, yaw, pitch = 0, roll = 0) {
  const b = mkFrame(yaw, pitch, roll);
  h.Fe({ target: { value: new DataView(b.buffer, b.byteOffset, b.byteLength) } });
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- A) 孤立毛刺帧仍被拒绝 ----------
{
  const h = build();
  for (let k = 0; k < 10; k++) feed(h, 10);
  feed(h, 90);                       // 毛刺: 10° → 90°
  for (let k = 0; k < 10; k++) feed(h, 10);
  const maxDev = Math.max(...h.delivered.map(p => Math.abs(p.yaw - 10)));
  assert('A 孤立毛刺被拒，光点未跳', maxDev < 1, '最大偏差 ' + maxDev.toFixed(2) + '°');
}

// ---------- B) 停顿后大跳变：2 帧内重锚定 ----------
{
  const h = build();
  for (let k = 0; k < 10; k++) feed(h, 10);
  h.delivered.length = 0;
  // BLE 停顿后头部已到 80°（停顿期间真实转过 70°）
  feed(h, 80);                       // 第1帧: 被拒(>60°), 存候选
  feed(h, 80);                       // 第2帧: 与候选一致 → 重锚定
  const last = h.delivered[h.delivered.length - 1];
  assert('B 停顿后 2 帧内恢复', last && Math.abs(last.yaw - 80) < 1,
    '第2帧 yaw=' + (last ? last.yaw.toFixed(2) : 'null') + '° (修复前永久卡死在 10°)');
}

// ---------- C) 超长停顿(>800ms)：单帧兜底重锚定 ----------
{
  const h = build();
  for (let k = 0; k < 10; k++) feed(h, 10);
  h.delivered.length = 0;
  const realNow = Date.now;
  Date.now = () => realNow() + 900;   // 停顿 900ms
  try { feed(h, 80); } finally { Date.now = realNow; }
  const last = h.delivered[h.delivered.length - 1];
  assert('C 超长停顿单帧重锚定', last && Math.abs(last.yaw - 80) < 1,
    '第1帧 yaw=' + (last ? last.yaw.toFixed(2) : 'null') + '°');
}

// ---------- D) 平滑运动不受影响 ----------
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

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
