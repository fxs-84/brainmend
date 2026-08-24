/*
 * BLE 帧解析失步级联修复补丁 v1 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 症状：检测中光点间歇性明显跳变（垂直方向最易被察觉），漂移/卡顿修复后仍存在。
 *
 * 根因（协议解析缺陷）：WitMotion 帧为 0x55 头 + 20 字节定长，无校验。
 * 角度/磁力数据是 int16 负载，负载字节完全可能等于 0x55；原解析器对任何
 * 0x55 候选位置一律按 20 字节消费（else 分支也 i+=20）——一旦在负载 0x55
 * 处错判，偏移量会保持下去，后续真帧全部错位解析，形成连续多帧垃圾角度
 * （跳变发作期），直到碰运气重新对齐才恢复。中值滤波(3点)吃不下多帧连续
 * 垃圾，于是光点明显跳动。
 *
 * 修复（分层防御）：
 *   1) 未知帧型不再吞 20 字节，改为滑动 1 字节继续找合法帧头 ——
 *      失步后最多损失 1 帧真帧即在下一个真实帧头重新对齐，级联终止；
 *      失步次数计入 window.__gyroDiag.desyncs；
 *   2) 协调模式 yaw 显示通道补三点中值滤波（pitch/roll 已有）——
 *      白名单内误解析(负载 0x55 后恰跟 0x3D/0x71)产生的单帧垃圾被吸收；
 *      滤波数组挂 D._yawF，归零时随 _resetGyroEMA 清空；
 *   3) 既有层不变：>60° 巨跳拒绝 + 两帧去抖重锚定 + 停顿追赶平滑。
 *
 * 幂等：已打过补丁则直接退出。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*BLE-PARSER-FIX-v1*/';

let src = fs.readFileSync(FILE, 'utf8');

if (src.includes(MARK)) {
  console.log('SKIP: 补丁已存在 (' + MARK + ')');
  process.exit(0);
}

function replaceOnce(name, find, replace) {
  const cnt = src.split(find).length - 1;
  if (cnt !== 1) {
    console.error(`FAIL: ${name} 匹配到 ${cnt} 处（应为 1），未做修改`);
    process.exit(1);
  }
  src = src.replace(find, replace);
  console.log(`OK: ${name} 已修补`);
}

/* ---------- 1. 解析循环：未知帧型滑动 1 字节重对齐 ---------- */
replaceOnce('失步滑动重对齐',
  '}else ke<5&&H(`  跳过帧 type=0x${e.toString(16)}（非角度帧）`);i+=20}',
  '}else{' + MARK + 'window.__gyroDiag&&(window.__gyroDiag.desyncs=(window.__gyroDiag.desyncs||0)+1),i++;continue}i+=20}',
);

/* ---------- 2. 协调模式 yaw 显示通道中值滤波 ---------- */
replaceOnce('yaw 中值滤波',
  'let a=i.correctedYaw;D.pitch=n-D.pitchOffset,D.yaw=a,',
  'let a=i.correctedYaw;D.mode===`coordination`&&(a=fn(D._yawF||(D._yawF=[]),a)),D.pitch=n-D.pitchOffset,D.yaw=a,',
);

/* ---------- 3. 归零时清空 yaw 滤波窗 ---------- */
replaceOnce('归零清空 yaw 滤波窗',
  'window._resetGyroEMA=()=>{pn=$t()};',
  'window._resetGyroEMA=()=>{pn=$t(),D._yawF=null};',
);

fs.writeFileSync(FILE, src);
console.log('DONE: BLE 解析失步修复已写入 ' + path.basename(FILE));
