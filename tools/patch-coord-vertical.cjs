/*
 * 协调性检测·垂直轨迹补丁 v4 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * v4 变更（相对 v3）：
 *   1) 取消光点变色提示(Rn 渲染恢复原样) —— 用户决定不用；
 *   2) 垂直族轨迹分不再测水平偏移 —— 原因：传感器佩戴轴向与头颈解剖轴
 *      存在偏差时，点头(pitch)在欧拉角 yaw 通道上投影出同步摆动
 *      (10°安装误差×22.5°点头≈±3.8°假偏航)，该通道天生不是真实水平
 *      偏移，不能用于评分。垂直族轨迹分直接并入追踪分(_=h)；
 *      水平/8字轨迹评分逻辑不变；
 *   3) 移除 v2/v3 的基线捕获机制(_vertTraj/_vertYawBase/_vertBase)与
 *      _vertWarn 计算 —— 不再需要；
 *   4) 保留：pitch/roll 中值滤波(杀单帧毛刺)、垂直族 dotX 锁车道中心
 *      (消除补偿性歪头动机)、原始 dotX 捕获(_rawDotX 供遥测参考)。
 *
 * 幂等：v4 已存在则退出；可从原始版 / v1 / v2 / v3 升级。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*VERT-FIX-v4*/';

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

/* ---------- it() 轨迹分段：各版本 ---------- */
const P4_ORIG =
  'let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g=lt(o,s,i,a,D.trajectoryType,t),_=st(g,f,3),v=ct(ut());';
const P4_V1 =
  'D._vertTraj!==D.trajectoryType&&(D._vertTraj=D.trajectoryType,D._vertYawBase=void 0,D._vertBase=null);let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:nn.has(D.trajectoryType)?80:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g;if(nn.has(D.trajectoryType)){if(void 0===D._vertYawBase)if(e<.5)(D._vertBase||(D._vertBase=[])).push(D._rawDotX??o);else{let w=(D._vertBase||[D._rawDotX??0]).slice().sort((x,y)=>x-y);D._vertYawBase=w[w.length>>1]}g=void 0===D._vertYawBase?0:Math.abs((D._rawDotX??o)-D._vertYawBase)}else g=lt(o,s,i,a,D.trajectoryType,t);let _=st(g,f,3),v=ct(ut());';
const P4_V2 =
  'e<.05&&(D._vertTraj=null);D._vertTraj!==D.trajectoryType&&(D._vertTraj=D.trajectoryType,D._vertYawBase=void 0,D._vertBase=null);let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:nn.has(D.trajectoryType)?80:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g;if(nn.has(D.trajectoryType)){if(void 0===D._vertYawBase)if(e<.5)(D._vertBase||(D._vertBase=[])).push(D._rawDotX??o);else{let w=(D._vertBase||[D._rawDotX??0]).slice().sort((x,y)=>x-y);D._vertYawBase=w[w.length>>1]}g=void 0===D._vertYawBase?0:Math.abs((D._rawDotX??o)-D._vertYawBase)}else g=lt(o,s,i,a,D.trajectoryType,t);let _=st(g,f,3),v=ct(ut());';
const P4_V3 =
  'e<.05&&(D._vertTraj=null);D._vertTraj!==D.trajectoryType&&(D._vertTraj=D.trajectoryType,D._vertYawBase=void 0,D._vertBase=null);let o=D.dotX,s=D.dotY,c=Math.sqrt((o-i)**2+(s-a)**2),l=D.trajectoryType===`figure8`||D.trajectoryType===`figure8_reverse`,u=l?22:17,d=l?3:2,f=l?22:nn.has(D.trajectoryType)?80:8,p=n*5/D.yawRange,m=Math.abs(o-i)>p;m&&(D._driftCount=(D._driftCount||0)+1);let h=ot(c,u,d),g;if(nn.has(D.trajectoryType)){if(void 0===D._vertYawBase)if(e<.5)(D._vertBase||(D._vertBase=[])).push(D._rawDotX??o);else{let w=(D._vertBase||[D._rawDotX??0]).slice().sort((x,y)=>x-y);D._vertYawBase=w[w.length>>1]}g=void 0===D._vertYawBase?0:Math.abs((D._rawDotX??o)-D._vertYawBase)}else g=lt(o,s,i,a,D.trajectoryType,t);D._vertWarn=nn.has(D.trajectoryType)&&void 0!==D._vertYawBase?(g*D.yawCoefficient>4?2:g*D.yawCoefficient>2?1:0):0;let _=st(g,f,3),v=ct(ut());';
// v4：回到原结构，仅末尾追加「垂直族轨迹分并入追踪分」
const P4_V4 = P4_ORIG + 'nn.has(D.trajectoryType)&&(_=h);';

/* ---------- Rn() 光点颜色 ---------- */
const RN_ORIG = 'J.fillStyle=s?`#ff8800`:jn().POSITION,J.fill()';
const RN_V3 = 'J.fillStyle=s?`#ff8800`:D.mode===`coordination`&&D._vertWarn===2?`#ef4444`:D.mode===`coordination`&&D._vertWarn===1?`#f59e0b`:jn().POSITION,J.fill()';

const hasV = (v) => src.includes(`/*VERT-FIX-${v}*/`);

if (hasV('v3') || hasV('v2') || hasV('v1')) {
  // 升级路径：it 段回 v4 + 颜色还原 + 标记替换
  const cur = hasV('v3') ? ['v3', P4_V3] : hasV('v2') ? ['v2', P4_V2] : ['v1', P4_V1];
  replaceOnce(`it 轨迹分 ${cur[0]}→v4`, cur[1], P4_V4);
  if (cur[0] === 'v3') replaceOnce('光点变色还原', RN_V3, RN_ORIG);
  src = src.replace(`/*VERT-FIX-${cur[0]}*/`, MARK);
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
  replaceOnce('垂直族轨迹分并入追踪分', P4_ORIG, P4_V4);
}

fs.writeFileSync(FILE, src);
console.log('DONE: 垂直轨迹修复 v4(取消变色, 轨迹分只评垂直向) 已写入 ' + path.basename(FILE));
