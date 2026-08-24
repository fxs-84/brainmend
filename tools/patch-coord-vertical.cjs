/*
 * 协调性检测·垂直轨迹修复补丁 v3 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 症状：垂直向(vertical/vertical_left/vertical_right)检测中——
 *   a) 垂直方向偶发往上/往下跳变；
 *   b) 水平方向漂移：光点偏出竖直车道，用户为补偿漂移把头颈歪向一侧，
 *      既造成错误姿势，又污染检测数据。
 *
 * 根因：
 *   1) 协调模式刻意跳过了 pitch/roll 的三点中值滤波(其它模式都有)，
 *      单帧毛刺直接打到 dotY → 垂直跳变；
 *   2) tn() 对垂直族只是把 dotX 钳在车道中心 ±1.5° 的「带」内，
 *      而协调模式 yawRange=30 → 1.5°=±29px，yaw 一漂移光点就钉在带边缘，
 *      用户看得见偏航，本能歪头补偿；
 *   3) 轨迹分(离线度) lt() 对垂直族就是测水平偏差 |dotX-targetX|，
 *      但用的是钳制后的显示值 + st() 容差 f=8px≈0.42° —— 一点点漂移/晃动
 *      就把轨迹分打到地板 20，数据严重失真。
 *
 * 修复：
 *   a) pitch/roll 中值滤波对协调模式同样生效(≤1 帧延迟，杀单帧毛刺)；
 *   b) 垂直族 dotX 显示直接锁定车道中心(不是±1.5°带) —— 水平漂移对用户
 *      完全不可见，消除补偿性歪头的动机；
 *   c) 垂直族轨迹分改用「原始 dotX − 本局基线(前0.5s中位数)」测量真实的
 *      水平摆动(配合 DRIFT-FIX 的漂移补偿，测到的就是用户真实偏航)，
 *      容差 f 放宽到 80px≈4.2°；基线按轨迹切换/按局(e<.05)自动重捕；
 *   d) 垂直族追踪分 c 因显示锁定自动变为纯垂直误差 |dotY-targetY|；
 *      轨迹数据 trail 里仍带原始 yaw，报告信息不丢失；
 *   e) v3 新增「变色提示」：位置不动但偏斜可视化——垂直族检测中原始偏航
 *      超 2° 光点变橙(#f59e0b)、超 4° 变红(#ef4444)，颜色无位置目标可追，
 *      不诱发补偿，偏斜事件对操作者一目了然。(D._vertWarn, 仅协调模式生效)
 *
 * 幂等：v3 已存在则退出；可从原始版 / v1 / v2 升级。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*VERT-FIX-v3*/';

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

/* ---------- it() 垂直族轨迹分：三个版本 ---------- */
const P4_ORIG =
  'let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g=lt(o,s,i,a,D.trajectoryType,t),_=st(g,f,3),v=ct(ut());';
const P4_V1 =
  'D._vertTraj!==D.trajectoryType&&(D._vertTraj=D.trajectoryType,D._vertYawBase=void 0,D._vertBase=null);let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:nn.has(D.trajectoryType)?80:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g;if(nn.has(D.trajectoryType)){if(void 0===D._vertYawBase)if(e<.5)(D._vertBase||(D._vertBase=[])).push(D._rawDotX??o);else{let w=(D._vertBase||[D._rawDotX??0]).slice().sort((x,y)=>x-y);D._vertYawBase=w[w.length>>1]}g=void 0===D._vertYawBase?0:Math.abs((D._rawDotX??o)-D._vertYawBase)}else g=lt(o,s,i,a,D.trajectoryType,t);let _=st(g,f,3),v=ct(ut());';
const P4_V2 =
  'e<.05&&(D._vertTraj=null);D._vertTraj!==D.trajectoryType&&(D._vertTraj=D.trajectoryType,D._vertYawBase=void 0,D._vertBase=null);let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:nn.has(D.trajectoryType)?80:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g;if(nn.has(D.trajectoryType)){if(void 0===D._vertYawBase)if(e<.5)(D._vertBase||(D._vertBase=[])).push(D._rawDotX??o);else{let w=(D._vertBase||[D._rawDotX??0]).slice().sort((x,y)=>x-y);D._vertYawBase=w[w.length>>1]}g=void 0===D._vertYawBase?0:Math.abs((D._rawDotX??o)-D._vertYawBase)}else g=lt(o,s,i,a,D.trajectoryType,t);let _=st(g,f,3),v=ct(ut());';
// v3：在轨迹分基础上加 D._vertWarn 变色等级(0/1/2 = 正常/偏>2°/偏>4°)
const P4_V3 =
  'e<.05&&(D._vertTraj=null);D._vertTraj!==D.trajectoryType&&(D._vertTraj=D.trajectoryType,D._vertYawBase=void 0,D._vertBase=null);let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:nn.has(D.trajectoryType)?80:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g;if(nn.has(D.trajectoryType)){if(void 0===D._vertYawBase)if(e<.5)(D._vertBase||(D._vertBase=[])).push(D._rawDotX??o);else{let w=(D._vertBase||[D._rawDotX??0]).slice().sort((x,y)=>x-y);D._vertYawBase=w[w.length>>1]}g=void 0===D._vertYawBase?0:Math.abs((D._rawDotX??o)-D._vertYawBase)}else g=lt(o,s,i,a,D.trajectoryType,t);D._vertWarn=nn.has(D.trajectoryType)&&void 0!==D._vertYawBase?(g*D.yawCoefficient>4?2:g*D.yawCoefficient>2?1:0):0;let _=st(g,f,3),v=ct(ut());';

/* ---------- Rn() 光点颜色：协调模式垂直族按 _vertWarn 变色 ---------- */
const RN_ORIG =
  'J.fillStyle=s?`#ff8800`:jn().POSITION,J.fill()';
const RN_V3 =
  'J.fillStyle=s?`#ff8800`:D.mode===`coordination`&&D._vertWarn===2?`#ef4444`:D.mode===`coordination`&&D._vertWarn===1?`#f59e0b`:jn().POSITION,J.fill()';

if (src.includes('/*VERT-FIX-v2*/')) {
  replaceOnce('it 轨迹分 v2→v3', P4_V2, P4_V3);
  replaceOnce('光点变色', RN_ORIG, RN_V3);
  src = src.replace('/*VERT-FIX-v2*/', MARK);
} else if (src.includes('/*VERT-FIX-v1*/')) {
  replaceOnce('it 轨迹分 v1→v3', P4_V1, P4_V3);
  replaceOnce('光点变色', RN_ORIG, RN_V3);
  src = src.replace('/*VERT-FIX-v1*/', MARK);
} else {
  replaceOnce('协调模式 pitch/roll 中值滤波',
    'D.mode!==`coordination`&&(n=fn(cn,n),r=fn(ln,r)),',
    'n=fn(cn,n),r=fn(ln,r),' + MARK);
  replaceOnce('捕获原始 dotX',
    'D.dotX=D.yaw/D.yawCoefficient,D.dotY=-D.pitch/D.pitchCoefficient,',
    'D.dotX=D.yaw/D.yawCoefficient,D._rawDotX=D.dotX,D.dotY=-D.pitch/D.pitchCoefficient,');
  replaceOnce('垂直族显示锁车道',
    'function tn(e){let t=en[e.trajectory];if(!t)return{dotX:e.dotX,clamped:!1,limits:null};let n=t.min/e.yawCoefficient,r=t.max/e.yawCoefficient,i=Math.max(Math.min(n,r),Math.min(Math.max(n,r),e.dotX));return{dotX:i,clamped:i!==e.dotX,limits:t}}',
    'function tn(e){let t=en[e.trajectory];if(!t)return{dotX:e.dotX,clamped:!1,limits:null};let i=(t.min+t.max)/2/e.yawCoefficient;return{dotX:i,clamped:i!==e.dotX,limits:t}}');
  replaceOnce('垂直族轨迹分重设计', P4_ORIG, P4_V3);
  replaceOnce('光点变色', RN_ORIG, RN_V3);
}

fs.writeFileSync(FILE, src);
console.log('DONE: 垂直轨迹修复 v3(含变色提示) 已写入 ' + path.basename(FILE));
