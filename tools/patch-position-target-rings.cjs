/*
 * 位置觉测试标靶·同心圆补丁 v4 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 背景：位置觉（JPS）测试模式的「标靶」原本是 Nn() 画的十字背景线（单色
 *      lineWidth=26）。用户希望与颈椎功能评估报告的轨迹分析 JPS 视图一致：
 *      同心圆 + 分级配色（优秀绿 → 中度橙），且**像素要真实对应角度**
 *      （像协调性检测那样：水平轨迹用 s=Wn/2-15 像素对应 yawRange 角度）。
 *
 * v1 → v2：标签摆位由「全部在中线同一 y」改为「各环右上对角」错开。
 * v2 → v3：环半径由「视觉比例 min(w,h)*0.32」改为「真实角度比例
 *      tier*(Wn/2-15)/yawRange」。
 * v3 → v4：dotY 在 position 模式下用 yawCoefficient（与 dotX 同比例）。
 *      · 原本 y 轴用 rollCoefficient = rollRange/(Gn*0.85) = 22.5/(Gn*0.85)，
 *        与 x 轴 yawCoefficient = yawRange/(Wn/2-15) = 80/(Wn/2-15) 不同
 *        → 1° roll ≈ 2.17 倍 1° yaw 像素，圆环无法同时精确对应两轴；
 *      · v4 统一后，x/y 像素/度完全一致，同心圆在两轴都真实对应角度。
 *      · 影响面：position 模式的 dotY 会变小（roll 22.5° 在屏幕上从 333px
 *        变成 ~153px），但角度↔像素映射真实。其他模式不变。
 *
 * v4 变更：
 *   - Nn() 注入 position 模式分支：画 5 个同心环（2°/3°/4.5°/6°/9°），
 *     半径按真实 yaw 角度映射（v3 已有）；
 *   - 主 dot 更新函数 mn()：position 模式下 dotY 用 yawCoefficient（v4 新增）；
 *   - 颜色与报告完全一致（#22c55e / #84cc16 / #06b6d4 / #eab308 / #f97316）；
 *   - 标签沿各环右上对角摆放（v2 已修复错位）；
 *   - 中心小十字保留作精准定位参考；
 *   - 原十字背景对 coordination / integrated / coordChecker / 其他模式
 *     保留不变。
 *
 * 不动的地方：
 *   - Ln() 对 position 模式本来就不画（保持原样，避免耦合）；
 *   - Rn() 玩家光点颜色（蓝 / 锁定时橙）不变；
 *   - 报告侧 Rf() 不动，是参考基准。
 *
 * 幂等：v4 已存在则退出；可从原始版 / v1 / v2 / v3 升级。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*POSITION-RINGS-v6*/';
const MARK_V5 = '/*POSITION-RINGS-v5*/';
const MARK_V4 = '/*POSITION-RINGS-v4*/';
const MARK_V3 = '/*POSITION-RINGS-v3*/';
const MARK_V2 = '/*POSITION-RINGS-v2*/';
const MARK_V1 = '/*POSITION-RINGS-v1*/';

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

/* ---------- Nn() 十字背景 → 位置觉同心圆标靶 ---------- */
const NN_ORIG =
  'function Nn(){let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY,n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

// v1 旧版 (标签全在中线同一 y, 互相重叠) — 用于升级路径
const NN_V1_OLD_LABELS =
  'function Nn(){' + MARK_V1 +
  'let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY;' +
  'if(D.mode===`position`){' +
    'let o=Math.min(q.width,q.height)*.32,' +
    'tiers=[{r:2,c:`#22c55e`,label:`优秀 <2°`},' +
           '{r:3,c:`#84cc16`,label:`良好 2-3°`},' +
           '{r:4.5,c:`#06b6d4`,label:`正常 3-4.5°`},' +
           '{r:6,c:`#eab308`,label:`轻度 4.5-6°`},' +
           '{r:9,c:`#f97316`,label:`中度 6-9°`}];' +
    'tiers.forEach(tr=>{' +
      'let rr=tr.r/9*o;' +
      'J.beginPath(),J.arc(e,t,rr,0,Math.PI*2),J.strokeStyle=tr.c,J.lineWidth=1.5,J.stroke(),' +
      'J.fillStyle=tr.c,J.font=`9px Arial`,J.textAlign=`left`,J.textBaseline=`middle`,' +
      'J.fillText(tr.label,e+rr+4,t)' +
    '});' +
    'J.strokeStyle=`#94a3b8`,J.lineWidth=1.5,' +
    'J.beginPath(),J.moveTo(e-8,t),J.lineTo(e+8,t),J.moveTo(e,t-8),J.lineTo(e,t+8),J.stroke();' +
    'return' +
  '}' +
  'let n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

// v2 旧版 (标签对角摆放, 但环半径是视觉比例, 不是真实角度) — 用于升级路径
const NN_V2_OLD_RADIUS =
  'function Nn(){' + MARK_V2 +
  'let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY;' +
  'if(D.mode===`position`){' +
    'let o=Math.min(q.width,q.height)*.32,' +
    'tiers=[{r:2,c:`#22c55e`,label:`优秀 <2°`},' +
           '{r:3,c:`#84cc16`,label:`良好 2-3°`},' +
           '{r:4.5,c:`#06b6d4`,label:`正常 3-4.5°`},' +
           '{r:6,c:`#eab308`,label:`轻度 4.5-6°`},' +
           '{r:9,c:`#f97316`,label:`中度 6-9°`}];' +
    'tiers.forEach(tr=>{' +
      'let rr=tr.r/9*o;' +
      'J.beginPath(),J.arc(e,t,rr,0,Math.PI*2),J.strokeStyle=tr.c,J.lineWidth=1.5,J.stroke(),' +
      'J.fillStyle=tr.c,J.font=`9px Arial`,J.textAlign=`left`,J.textBaseline=`bottom`,' +
      'J.fillText(tr.label,e+rr*0.7071+3,t-rr*0.7071-2)' +
    '});' +
    'J.strokeStyle=`#94a3b8`,J.lineWidth=1.5,' +
    'J.beginPath(),J.moveTo(e-8,t),J.lineTo(e+8,t),J.moveTo(e,t-8),J.lineTo(e,t+8),J.stroke();' +
    'return' +
  '}' +
  'let n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

// v3 旧版 (环半径真实角度, 但 dotY 仍用 rollCoefficient 与 x 不同) — 用于升级路径
const NN_V3_NO_UNIFY =
  'function Nn(){' + MARK_V3 +
  'let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY;' +
  'if(D.mode===`position`){' +
    'let s=Wn/2-15,yawRange=D.yawRange||80,' +
    'tiers=[{r:2,c:`#22c55e`,label:`优秀 <2°`},' +
           '{r:3,c:`#84cc16`,label:`良好 2-3°`},' +
           '{r:4.5,c:`#06b6d4`,label:`正常 3-4.5°`},' +
           '{r:6,c:`#eab308`,label:`轻度 4.5-6°`},' +
           '{r:9,c:`#f97316`,label:`中度 6-9°`}];' +
    'tiers.forEach(tr=>{' +
      'let rr=tr.r*s/yawRange;' +
      'J.beginPath(),J.arc(e,t,rr,0,Math.PI*2),J.strokeStyle=tr.c,J.lineWidth=1.5,J.stroke(),' +
      'J.fillStyle=tr.c,J.font=`9px Arial`,J.textAlign=`left`,J.textBaseline=`bottom`,' +
      'J.fillText(tr.label,e+rr*0.7071+3,t-rr*0.7071-2)' +
    '});' +
    'J.strokeStyle=`#94a3b8`,J.lineWidth=1.5,' +
    'J.beginPath(),J.moveTo(e-8,t),J.lineTo(e+8,t),J.moveTo(e,t-8),J.lineTo(e,t+8),J.stroke();' +
    'return' +
  '}' +
  'let n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

// v4 旧版 (环半径真实角度 + dotY 统一, 但标签对角贴在环上会因环太小重叠) — 用于升级路径
const NN_V4_OLD_LABELS =
  'function Nn(){' + MARK_V4 +
  'let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY;' +
  'if(D.mode===`position`){' +
    'let s=Wn/2-15,yawRange=D.yawRange||80,' +
    'tiers=[{r:2,c:`#22c55e`,label:`优秀 <2°`},' +
           '{r:3,c:`#84cc16`,label:`良好 2-3°`},' +
           '{r:4.5,c:`#06b6d4`,label:`正常 3-4.5°`},' +
           '{r:6,c:`#eab308`,label:`轻度 4.5-6°`},' +
           '{r:9,c:`#f97316`,label:`中度 6-9°`}];' +
    'tiers.forEach(tr=>{' +
      'let rr=tr.r*s/yawRange;' +
      'J.beginPath(),J.arc(e,t,rr,0,Math.PI*2),J.strokeStyle=tr.c,J.lineWidth=1.5,J.stroke(),' +
      'J.fillStyle=tr.c,J.font=`9px Arial`,J.textAlign=`left`,J.textBaseline=`bottom`,' +
      'J.fillText(tr.label,e+rr*0.7071+3,t-rr*0.7071-2)' +
    '});' +
    'J.strokeStyle=`#94a3b8`,J.lineWidth=1.5,' +
    'J.beginPath(),J.moveTo(e-8,t),J.lineTo(e+8,t),J.moveTo(e,t-8),J.lineTo(e,t+8),J.stroke();' +
    'return' +
  '}' +
  'let n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

const NN_V6 =
  'function Nn(){' + MARK +
  'let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY;' +
  // 位置觉: 同心圆标靶 (与报告 JPS 同款 5 环 + 分级配色, 像素按真实角度映射)
  // 半径公式与协调性检测一致: tier * (Wn/2-15) / yawRange = tier° 对应的像素
  'if(D.mode===`position`){' +
    'let s=Wn/2-15,yawRange=D.yawRange||80,' +
    'tiers=[{r:2,c:`#22c55e`,label:`优秀 <2°`},' +
           '{r:3,c:`#84cc16`,label:`良好 2-3°`},' +
           '{r:4.5,c:`#06b6d4`,label:`正常 3-4.5°`},' +
           '{r:6,c:`#eab308`,label:`轻度 4.5-6°`},' +
           '{r:9,c:`#f97316`,label:`中度 6-9°`}];' +
    'tiers.forEach(tr=>{' +
      'let rr=tr.r*s/yawRange;' +
      'J.beginPath(),J.arc(e,t,rr,0,Math.PI*2),J.strokeStyle=tr.c,J.lineWidth=1.5,J.stroke()' +
    '});' +
    // 中心小十字 (报告同款, 保留作精准定位)
    'J.strokeStyle=`#94a3b8`,J.lineWidth=1.5,' +
    'J.beginPath(),J.moveTo(e-8,t),J.lineTo(e+8,t),J.moveTo(e,t-8),J.lineTo(e,t+8),J.stroke();' +
    // 标签改为右侧图例 (真实比例下环太小, 贴环标签会重叠)
    // 布局: 圆环外右边 12px 起, 每个 tier 一行, 行间距 14px
    'let legendX=e+9*s/yawRange+12,legendY=t-4*7;' +
    'tiers.forEach((tr,idx)=>{' +
      'let ly=legendY+idx*14;' +
      'J.fillStyle=tr.c,J.beginPath(),J.arc(legendX,ly-3,4,0,Math.PI*2),J.fill(),' +
      'J.fillStyle=tr.c,J.font=`10px Arial`,J.textAlign=`left`,J.textBaseline=`middle`,' +
      'J.fillText(tr.label,legendX+8,ly)' +
    '});' +
    'return' +
  '}' +
  // 原逻辑保留 (stability / coordination / integrated / coordChecker 等)
  'let n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

/* ---------- mn() dotY 比例统一 (position 模式) ---------- */
// 原: dotY = roll / rollCoefficient (rollRange=22.5 / Gn*0.85)
// 改: position 模式用 yawCoefficient, 与 dotX 同比例 → 同心圆 x/y 都真实
const DOTY_ORIG = 'D.dotY=D.roll/(D.rollCoefficient||(D.rollCoefficient=(D.rollRange||22.5)/(Gn*.85)))';
const DOTY_V4   = 'D.dotY=D.roll/(D.mode===`position`?D.yawCoefficient:(D.rollCoefficient||(D.rollCoefficient=(D.rollRange||22.5)/(Gn*.85))))';

/* ---------- position 模式 yawRange 默认 80 → 20 (v6) ---------- */
// 原因: yawRange 决定「画布半宽像素 / 满量程角度」比例, 只影响显示不影响测量。
// yawRange=80 时 1° yaw = s/80 ≈ 6.8px → 9° 环只有 61px (太小看不见)。
// 改 20 后 1° = s/20 ≈ 27px → 9° 环 = 245px, 与协调性检测同级可视性。
// zoomFactor 滑杆/滚轮仍可继续自由缩放, 像素角度对应永远保持。
const POS_RANGE_ORIG = 'e===`position`&&(D.yawRange=80,D.pitchRange=45';
const POS_RANGE_V6   = 'e===`position`&&(D.yawRange=20,D.pitchRange=45';

/* ---------- 升级路径 ---------- */
// 注: v5 版本号被跳过 (曾计划但未落到 bundle), 实际落地版本: orig → v1 → v2 → v4 → v6
if (src.includes(MARK_V4)) {
  // v4 → v6: 标签由环上对角改为右侧图例 + position 模式 yawRange 80→20 (环默认可见)
  replaceOnce('Nn() v4 → v6 (标签改右侧图例)', NN_V4_OLD_LABELS, NN_V6);
  replaceOnce('position 模式 yawRange 80→20', POS_RANGE_ORIG, POS_RANGE_V6);
} else if (src.includes(MARK_V3)) {
  // v3 → v6: 环半径已是真实角度, 只需加 dotY 统一 + 标签图例化 + yawRange
  replaceOnce('Nn() v3 → v6', NN_V3_NO_UNIFY, NN_V6);
  replaceOnce('dotY 比例统一', DOTY_ORIG, DOTY_V4);
  replaceOnce('position 模式 yawRange 80→20', POS_RANGE_ORIG, POS_RANGE_V6);
} else if (src.includes(MARK_V2)) {
  // v2 → v6: 环半径改真实角度 + dotY 统一 + 标签图例化 + yawRange
  replaceOnce('Nn() v2 → v6', NN_V2_OLD_RADIUS, NN_V6);
  replaceOnce('dotY 比例统一', DOTY_ORIG, DOTY_V4);
  replaceOnce('position 模式 yawRange 80→20', POS_RANGE_ORIG, POS_RANGE_V6);
} else if (src.includes(MARK_V1)) {
  // v1 → v6: 一步到位
  replaceOnce('Nn() v1 → v6', NN_V1_OLD_LABELS, NN_V6);
  replaceOnce('dotY 比例统一', DOTY_ORIG, DOTY_V4);
  replaceOnce('position 模式 yawRange 80→20', POS_RANGE_ORIG, POS_RANGE_V6);
} else {
  // 原始 → v6
  replaceOnce('Nn() 位置觉同心圆标靶', NN_ORIG, NN_V6);
  replaceOnce('dotY 比例统一', DOTY_ORIG, DOTY_V4);
  replaceOnce('position 模式 yawRange 80→20', POS_RANGE_ORIG, POS_RANGE_V6);
}

fs.writeFileSync(FILE, src);
console.log('DONE: 位置觉同心圆标靶 v6 已写入 ' + path.basename(FILE));
