/*
 * 位置觉测试标靶·同心圆补丁 v2 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 背景：位置觉（JPS）测试模式的「标靶」原本是 Nn() 画的十字背景线（单色
 *      lineWidth=26）。用户希望与颈椎功能评估报告的轨迹分析 JPS 视图一致：
 *      同心圆 + 分级配色（优秀绿 → 中度橙），让患者/治疗师在测试时就能
 *      直观看到当前偏差落在哪个等级。
 *
 * v1 → v2：标签摆位由「全部在中线同一 y」改为「各环右上对角」（x = c+rr/√2,
 *      y = c-rr/√2），错开不重叠，与报告 Rf 的 8px Arial + 右上对齐一致。
 *
 * v2 变更：
 *   - Nn() 注入 position 模式分支：画 5 个同心环（2°/3°/4.5°/6°/9°）
 *     + 每环右上对角小标签 + 中心小十字（保留作精准定位参考，与报告一致）；
 *   - 半径公式与报告 Rf 同款：o = Math.min(q.width, q.height) * 0.32，
 *     环 k 半径 = tier_k / 9 * o，自适应画布大小；
 *   - 颜色与报告完全一致（#22c55e / #84cc16 / #06b6d4 / #eab308 / #f97316）；
 *   - 原十字背景对 coordination / integrated / coordChecker / 其他模式
 *     保留不变。
 *
 * 不动的地方：
 *   - Ln() 对 position 模式本来就不画（保持原样，避免耦合）；
 *   - Rn() 玩家光点颜色（蓝 / 锁定时橙）不变；
 *   - 报告侧 Rf() 不动，是参考基准。
 *
 * 幂等：v2 已存在则退出；可从原始版 / v1 升级。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*POSITION-RINGS-v2*/';
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

const NN_V2 =
  'function Nn(){' + MARK +
  'let e=Hn+D.crosshairOffsetX,t=Un+D.crosshairOffsetY;' +
  // 位置觉: 同心圆标靶 (与颈椎功能评估报告 Rf 同款 5 环 + 分级配色 + 中心十字)
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
      // 标签对齐报告 Rf 的摆位: 各环右上对角, 错开不重叠
      'J.fillStyle=tr.c,J.font=`9px Arial`,J.textAlign=`left`,J.textBaseline=`bottom`,' +
      'J.fillText(tr.label,e+rr*0.7071+3,t-rr*0.7071-2)' +
    '});' +
    // 中心小十字 (报告同款, 保留作精准定位)
    'J.strokeStyle=`#94a3b8`,J.lineWidth=1.5,' +
    'J.beginPath(),J.moveTo(e-8,t),J.lineTo(e+8,t),J.moveTo(e,t-8),J.lineTo(e,t+8),J.stroke();' +
    'return' +
  '}' +
  // 原逻辑保留 (stability / coordination / integrated / coordChecker 等)
  'let n=D.mode===`coordination`||D.mode===`integrated`||D.mode===`coordChecker`,r=n?D.trajectoryType===`horizontal`:!0,i=n?D.trajectoryType===`vertical`||D.trajectoryType===`vertical_left`||D.trajectoryType===`vertical_right`:!0;if(r){let n=e-Wn/2+15,r=e+Wn/2-15;J.beginPath(),J.moveTo(n,t),J.lineTo(r,t),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}if(i){let n=Gn*.85;J.beginPath(),J.moveTo(e,t-n),J.lineTo(e,t+n),J.strokeStyle=jn().CROSSHAIR,J.globalAlpha=1,J.lineWidth=26,J.stroke()}J.globalAlpha=1}';

// 升级路径: 已打过 v1 → 替换为 v2
if (src.includes(MARK_V1)) {
  replaceOnce('Nn() v1 → v2 (标签错位修复)', NN_V1_OLD_LABELS, NN_V2);
} else {
  replaceOnce('Nn() 位置觉同心圆标靶', NN_ORIG, NN_V2);
}

fs.writeFileSync(FILE, src);
console.log('DONE: 位置觉同心圆标靶 v2 已写入 ' + path.basename(FILE));
