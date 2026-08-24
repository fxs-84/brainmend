/*
 * 陀螺仪光点卡顿/卡死修复补丁 v2 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 症状：颈椎在转动，但屏幕光点不动（卡顿），多次卡顿后与真实角度出现大偏差。
 *
 * 根因（两处，均在 BLE 数据链路）：
 *   1) 毛刺拒绝逻辑卡死：角度帧单帧跳变 >60° 时被拒，且拒绝时不更新锚点
 *      (Me/Ne/Pe)。BLE 停顿几十到几百毫秒后，真实头部累积转角很容易 >60°，
 *      恢复后的每一帧都被拿去和过期锚点比 → 永远 >60° → 永远拒绝 → 光点卡死，
 *      直到头转回旧锚点 60° 以内才恢复。卡顿期间误差=真实转过的全部角度。
 *   2) 定频轮询堆积：setInterval(50ms) + await writeValue，BLE 写耗时超过 50ms
 *      时请求堆积、延迟持续增长，加重停顿。
 *
 * 修复：
 *   a) 拒绝分支加「两帧一致性去抖 + 长停顿兜底」：被拒帧先存候选；下一帧若与
 *      候选一致(<30°) → 是真实运动而非毛刺(毛刺是孤立帧)，立即重锚定；
 *      距上次接受 >800ms 的停顿也直接重锚定。卡死最长持续 1 帧(50ms)。
 *      正常帧流中的孤立毛刺(后一帧回到真值)仍被拒绝，行为不变。
 *      注意：解析循环内层 `t` 是 DataView 局部变量（遮蔽了外层时间戳），
 *      时间判断必须重新调 Date.now()，不能用 `t`（v1 在此踩坑）。
 *   b) 轮询改为链式 setTimeout：每次写完成后按剩余时间排下一次（目标 50ms），
 *      慢写时自动退避，不再堆积；Ie() 停止逻辑不变(clearInterval/Timeout 同池)。
 *
 * 幂等：v2 已存在则退出；可从原始版或 v1 升级。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*STALL-FIX-v2*/';

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

/* ---------- 1. 毛刺拒绝分支：两帧去抖重锚定 + 长停顿兜底 ---------- */
const OLD_REJECT =
  's.rejected?console.warn(`[毛刺拒绝] 单帧跳变 >60°`):(window.updateFromGyroscope({pitch:s.y,yaw:s.x,roll:s.r}),Me=s.x,Ne=s.y,Pe=s.r),je=o,';

const REJECT_V1 =
  's.rejected?(/*STALL-FIX-v1*/Fe._cand&&Math.abs(o-Fe._cand.x)<30&&Math.abs(-r-Fe._cand.y)<30||Fe._acc&&t-Fe._acc>800' +
  '?(window.updateFromGyroscope({pitch:-r,yaw:o,roll:i}),Me=o,Ne=-r,Pe=i,Fe._cand=null,Fe._acc=t,H(`[跳变恢复] 确认为真实运动,已重锚定`))' +
  ':(Fe._cand={x:o,y:-r},console.warn(`[毛刺拒绝] 单帧跳变 >60°`))' +
  '):(window.updateFromGyroscope({pitch:s.y,yaw:s.x,roll:s.r}),Me=s.x,Ne=s.y,Pe=s.r,Fe._cand=null,Fe._acc=t),je=o,';

const REJECT_V2 =
  's.rejected?(' + MARK +
  // 连续两帧跳变互相一致(<30°) → 真实运动(停顿累积)；或距上次接受>800ms → 重锚定
  // 注意不能用内层 `t`(那是 DataView)，时间必须重新取 Date.now()
  'Fe._cand&&Math.abs(o-Fe._cand.x)<30&&Math.abs(-r-Fe._cand.y)<30||Fe._acc&&Date.now()-Fe._acc>800' +
  '?(window.updateFromGyroscope({pitch:-r,yaw:o,roll:i}),Me=o,Ne=-r,Pe=i,Fe._cand=null,Fe._acc=Date.now(),H(`[跳变恢复] 确认为真实运动,已重锚定`))' +
  ':(Fe._cand={x:o,y:-r},console.warn(`[毛刺拒绝] 单帧跳变 >60°`))' +
  '):(window.updateFromGyroscope({pitch:s.y,yaw:s.x,roll:s.r}),Me=s.x,Ne=s.y,Pe=s.r,Fe._cand=null,Fe._acc=Date.now()),je=o,';

/* ---------- 2. 轮询循环：链式 setTimeout 防堆积 ---------- */
const OLD_POLL =
  'function Re(){Ie(),H(`启动角度查询模式 (50ms周期/20Hz)`),Le=setInterval(async()=>{if(!U||!de?.gatt?.connected){Ie();return}try{await U.writeValue(we)}catch{}},50)}';

const NEW_POLL =
  'function Re(){Ie(),H(`启动角度查询模式 (50ms周期/20Hz)`);let e=async()=>{if(Le===null)return;if(!U||!de?.gatt?.connected){Ie();return}let t=Date.now();try{await U.writeValue(we)}catch{}if(Le!==null){let n=50-(Date.now()-t);Le=setTimeout(e,n>0?n:0)}};Le=setTimeout(e,50)}';

if (src.includes(REJECT_V1)) {
  replaceOnce('拒绝分支 v1→v2', REJECT_V1, REJECT_V2);   // 轮询 v1 已是新版，无需动
} else {
  replaceOnce('拒绝分支 原始→v2', OLD_REJECT, REJECT_V2);
  replaceOnce('轮询循环', OLD_POLL, NEW_POLL);
}

fs.writeFileSync(FILE, src);
console.log('DONE: 卡顿/卡死修复 v2 已写入 ' + path.basename(FILE));
