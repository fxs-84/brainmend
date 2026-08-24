/*
 * 协调性检测 yaw 漂移补偿修复补丁 v4 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 背景：WitMotion IMU 内部融合输出欧拉角，Z 轴(yaw)无绝对参考，随时间积分漂移。
 * 原补偿器 Qt 的缺陷导致「检测不到 2 分钟就大幅漂移」：
 *   1) 累积补偿 o += rate*dt 只在「静止」分支内执行 —— 头一动补偿即冻结，
 *      而协调性检测是分钟级连续跟靶运动，检测期间漂移全部残留；
 *   2) 逐帧 EMA 学速率，在跟靶折返点（头部减速到 <1°/s 约 0.7s）被折返运动
 *      污染，学到的速率被拉偏；慢速转头也会被误学为漂移（假漂移）。
 *
 * v4 修复（保持 Qt 接口与「归零」流程不变）：
 *   a) 补偿积分每帧持续进行（dt 限 1ms~500ms，BLE 卡顿不积）——运动中也在补偿；
 *   b) 漂移速率改用「静止窗口法」测量：pitch/roll 稳定且 |yaw 瞬时率|<1°/s
 *      持续 0.6s 成一个窗口，速率 = 整窗位移/时长 —— 静止只表示"在读漂移"，
 *      不含任何姿态假设，检测中途停顿也能安全学习；
 *   c) 窗口有效性双重校验：位移 ≤0.3°（排除慢速持续转头）且窗口中段单调
 *      （排除折返抛物线 —— 折返点处 yaw 越过峰值会折返，中段必越界）；
 *   d) 速率钳制 ±0.2°/s(=12°/min，对 MEMS Z 轴足够宽裕)，窗口 EMA 权重 0.35，
 *      静止 2~3s 即收敛；
 *   e) 状态工厂 $t() 增加 stillT/stillYaw/stillMid 字段。
 *
 * 幂等：v4 已存在则退出；可从原始版 / v1 / v2 升级。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*DRIFT-FIX-v4*/';

let src = fs.readFileSync(FILE, 'utf8');

if (src.includes(MARK)) {
  console.log('SKIP: 补丁已存在 (' + MARK + ')');
  process.exit(0);
}

const QT_ORIG =
  'function Qt(e,t){let n=t.isGameMode===!0?Yt:Jt,{lastBiasYaw:r,lastBiasTime:i,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:s,lastRawRoll:c}=e,l=!1;' +
  'if(r!==null&&i!==null){let e=t.now-i;if(e>Xt&&e<Zt){let i=(t.rawYaw-r)/e,u=s===null?0:Math.abs(t.rawPitch-s),d=c===null?0:Math.abs(t.rawRoll-c);' +
  'u<Kt&&d<Kt&&Math.abs(i)<qt&&(a+=(i-a)*n,o+=a*e,l=!0)}}' +
  'return{correctedYaw:t.rawYaw-t.yawOffset-o,newState:{lastBiasYaw:t.rawYaw,lastBiasTime:t.now,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:t.rawPitch,lastRawRoll:t.rawRoll},learned:l}}';

const QT_V1 =
  'function Qt(e,t){/*DRIFT-FIX-v1*/let n=t.isGameMode===!0?Yt:Jt,{lastBiasYaw:r,lastBiasTime:i,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:s,lastRawRoll:c,stillT:l}=e,u=!1;' +
  'l=l||0;if(i!==null){let e=t.now-i;if(e>Xt&&e<Zt){if(o+=a*e,r!==null){let i=(t.rawYaw-r)/e,d=s===null?0:Math.abs(t.rawPitch-s),f=c===null?0:Math.abs(t.rawRoll-c);' +
  'd<Kt&&f<Kt&&Math.abs(i)<qt?(l+=e,l>=.3&&(a+=(i-a)*n,a=Math.max(-.25,Math.min(.25,a)),u=!0)):l=0}}}' +
  'return{correctedYaw:t.rawYaw-t.yawOffset-o,newState:{lastBiasYaw:t.rawYaw,lastBiasTime:t.now,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:t.rawPitch,lastRawRoll:t.rawRoll,stillT:l},learned:u}}';

const QT_V2 =
  'function Qt(e,t){/*DRIFT-FIX-v2*/let{lastBiasYaw:r,lastBiasTime:i,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:n,lastRawRoll:s,stillT:c,stillYaw:l}=e,u=!1;' +
  'c=c||0;if(i!==null){let e=t.now-i;if(e>Xt&&e<Zt){if(o+=a*e,r!==null){let f=(t.rawYaw-r)/e,d=n===null?0:Math.abs(t.rawPitch-n),p=s===null?0:Math.abs(t.rawRoll-s);' +
  'd<Kt&&p<Kt&&Math.abs(f)<qt?(c===0&&(l=t.rawYaw),c+=e,c>=.6&&(' +
  'Math.abs(t.rawYaw-l)<=.3&&(a+=((t.rawYaw-l)/c-a)*.35,a=Math.max(-.25,Math.min(.25,a)),u=!0),c=0)):c=0}}}' +
  'return{correctedYaw:t.rawYaw-t.yawOffset-o,newState:{lastBiasYaw:t.rawYaw,lastBiasTime:t.now,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:n,lastRawRoll:s,stillT:c,stillYaw:l},learned:u}}';

/* Qt v3(已存在于包中时的升级源)：与 v4 的差别仅在位移阈值 .3 与钳制 .25 */
const QT_V3 =
  'function Qt(e,t){/*DRIFT-FIX-v3*/let{lastBiasYaw:r,lastBiasTime:i,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:n,lastRawRoll:s,stillT:c,stillYaw:l,stillMid:u}=e,h=!1;' +
  'c=c||0;' +
  'if(i!==null){let e=t.now-i;if(e>Xt&&e<Zt){if(o+=a*e,r!==null){let f=(t.rawYaw-r)/e,d=n===null?0:Math.abs(t.rawPitch-n),p=s===null?0:Math.abs(t.rawRoll-s);' +
  'd<Kt&&p<Kt&&Math.abs(f)<qt?(c===0&&(l=t.rawYaw,u=void 0),c+=e,' +
  'void 0===u&&c>=.3&&(u=t.rawYaw),' +
  'c>=.6&&(' +
  'Math.abs(t.rawYaw-l)<=.3&&(u-l)*(t.rawYaw-u)>=-.006&&(h=!0,a+=((t.rawYaw-l)/c-a)*.35,a=Math.max(-.25,Math.min(.25,a))),c=0)):c=0}}}' +
  'return{correctedYaw:t.rawYaw-t.yawOffset-o,newState:{lastBiasYaw:t.rawYaw,lastBiasTime:t.now,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:n,lastRawRoll:s,stillT:c,stillYaw:l,stillMid:u},learned:h}}';

/* Qt v4：持续积分 + 静止窗口法(位移+单调双重校验)测漂移 */
const QT_V4 =
  'function Qt(e,t){' + MARK + 'let{lastBiasYaw:r,lastBiasTime:i,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:n,lastRawRoll:s,stillT:c,stillYaw:l,stillMid:u}=e,h=!1;' +
  'c=c||0;' +
  // 只需 lastBiasTime 即可积分：运动中也按已学到的速率持续补偿
  'if(i!==null){let e=t.now-i;if(e>Xt&&e<Zt){if(o+=a*e,r!==null){let f=(t.rawYaw-r)/e,d=n===null?0:Math.abs(t.rawPitch-n),p=s===null?0:Math.abs(t.rawRoll-s);' +
  // 静止判定(pitch/roll 稳定 + |yaw 瞬时率|<1°/s)不变；持续 0.6s 成一个测量窗口
  'd<Kt&&p<Kt&&Math.abs(f)<qt?(c===0&&(l=t.rawYaw,u=void 0),c+=e,' +
  'void 0===u&&c>=.3&&(u=t.rawYaw),' +          // 窗口中点采样(单调性校验用)
  'c>=.6&&(' +
  // 有效窗口：整窗位移 ≤0.3°(排慢速转头) 且 起点→中点→终点单调(排折返抛物线)
  'Math.abs(t.rawYaw-l)<=.12&&(u-l)*(t.rawYaw-u)>=-.006&&(h=!0,a+=((t.rawYaw-l)/c-a)*.35,a=Math.max(-.2,Math.min(.2,a))),c=0)):c=0}}}' +
  'return{correctedYaw:t.rawYaw-t.yawOffset-o,newState:{lastBiasYaw:t.rawYaw,lastBiasTime:t.now,yawBiasRate:a,yawBiasAccum:o,lastRawPitch:n,lastRawRoll:s,stillT:c,stillYaw:l,stillMid:u},learned:h}}';

const ST_ORIG = 'function $t(){return{lastBiasYaw:null,lastBiasTime:null,yawBiasRate:0,yawBiasAccum:0,lastRawPitch:null,lastRawRoll:null}}';
const ST_V1   = 'function $t(){return{lastBiasYaw:null,lastBiasTime:null,yawBiasRate:0,yawBiasAccum:0,lastRawPitch:null,lastRawRoll:null,stillT:0}}';
const ST_V2   = 'function $t(){return{lastBiasYaw:null,lastBiasTime:null,yawBiasRate:0,yawBiasAccum:0,lastRawPitch:null,lastRawRoll:null,stillT:0,stillYaw:0}}';
const ST_V3   = 'function $t(){return{lastBiasYaw:null,lastBiasTime:null,yawBiasRate:0,yawBiasAccum:0,lastRawPitch:null,lastRawRoll:null,stillT:0,stillYaw:0,stillMid:0}}';
const ST_V4   = ST_V3;

function replaceOnce(name, find, replace) {
  const cnt = src.split(find).length - 1;
  if (cnt !== 1) {
    console.error(`FAIL: ${name} 匹配到 ${cnt} 处（应为 1），未做修改`);
    process.exit(1);
  }
  src = src.replace(find, replace);
  console.log(`OK: ${name} 已修补`);
}

if (src.includes(QT_V3)) {
  replaceOnce('Qt v3→v4', QT_V3, QT_V4);   // $t 不变(v3/v4 同一状态结构)
} else if (src.includes(QT_V2)) {
  replaceOnce('Qt v2→v4', QT_V2, QT_V4);
  replaceOnce('$t v2→v4', ST_V2, ST_V4);
} else if (src.includes(QT_V1)) {
  replaceOnce('Qt v1→v4', QT_V1, QT_V4);
  replaceOnce('$t v1→v4', ST_V1, ST_V4);
} else {
  replaceOnce('Qt 原始→v4', QT_ORIG, QT_V4);
  replaceOnce('$t 原始→v4', ST_ORIG, ST_V4);
}

fs.writeFileSync(FILE, src);
console.log('DONE: yaw 漂移补偿修复 v4 已写入 ' + path.basename(FILE));
