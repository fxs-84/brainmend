/*
 * 协调模式停顿追赶平滑补丁 v1 —— 作用于 assets/index-Cc2Ik-Ku.js
 *
 * 症状：垂直(及其他)轨迹检测中光点仍明显跳动。
 *
 * 根因：BLE 偶发停顿(几十~几百 ms)期间光点冻结在旧值；帧恢复后第一帧
 * 直接给出当前真实角度 → 光点瞬间"追平"跳变。STALL-FIX-v2 已保证链路
 * 不再卡死，但追平方式仍然是硬跳。
 *
 * 修复（mn() 内，仅 coordination 模式生效）：
 *   帧间隔 >120ms 判定为停顿 → 从冻结显示值向当前真值做 250ms 线性追赶，
 *      之后恢复逐帧直跟真值。停顿期间真实中间姿态本就未知，短窗插值
 *      既消除视觉跳变，也不引入虚假数据(追赶窗内 trail 记录的是插值)。
 *   漂移补偿 Qt 用的是修正前原始通道，不受影响。
 *
 * 附带遥测(供实机排查)：window.__gyroDiag = { f61, f113, gaps, maxGap,
 *   reanchor, catchUps } —— 帧型计数/停顿统计/重锚定次数/追赶次数。
 *   浏览器控制台输入 JSON.stringify(window.__gyroDiag) 即可读取。
 *
 * 幂等：已打过补丁则直接退出。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*CATCHUP-FIX-v1*/';

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

/* ---------- 1. mn()：停顿追赶平滑（仅 coordination 模式） ---------- */
replaceOnce('mn 停顿追赶平滑',
  'D.pitch=n-D.pitchOffset,D.yaw=a,D.roll=r-D.rollOffset;let o=D.mode===`coordination`?.15:sn;',
  'D.pitch=n-D.pitchOffset,D.yaw=a,D.roll=r-D.rollOffset;' + MARK +
  'let nw=performance.now()/1e3,gp=nw-(D._lastGyroT||nw);D._lastGyroT=nw;' +
  'if(D.mode===`coordination`){' +
  // 停顿判定 → 建立追赶段(起点=冻结时的显示值)
  'if(gp>.12){D._catch={t0:nw,fp:D._tp??D.pitch,fy:D._ty??D.yaw},window.__gyroDiag&&(window.__gyroDiag.catchUps=(window.__gyroDiag.catchUps||0)+1)}' +
  // 追赶段内: 250ms 线性插值; 每帧以最新真值为目标
  'if(D._catch){let k=(nw-D._catch.t0)/.25;k>=1?D._catch=null:(D._tp=D.pitch,D._ty=D.yaw,D.pitch=D._catch.fp+(D.pitch-D._catch.fp)*k,D.yaw=D._catch.fy+(D.yaw-D._catch.fy)*k)}' +
  // 无追赶: 记录当前真值供下次停顿作起点
  'D._catch||(D._tp=D.pitch,D._ty=D.yaw)' +
  '}let o=D.mode===`coordination`?.15:sn;',
);

/* ---------- 2. Fe()：遥测初始化 ---------- */
replaceOnce('遥测初始化',
  'function Fe(e){let t=Date.now();if(W>0){let e=t-W;e>100&&console.warn(`[BLE间隔] ${e}ms — 可能丢包`)}W=t;',
  'function Fe(e){window.__gyroDiag||={f61:0,f113:0,gaps:0,maxGap:0,reanchor:0,catchUps:0};let t=Date.now();if(W>0){let e=t-W;e>100&&(console.warn(`[BLE间隔] ${e}ms — 可能丢包`),window.__gyroDiag.gaps++,window.__gyroDiag.maxGap=Math.max(window.__gyroDiag.maxGap,e))}W=t;',
);

/* ---------- 3. Fe()：帧型计数 ---------- */
replaceOnce('帧型计数',
  'if(e===61||e===113){let n=e===61?',
  'if(e===61||e===113){e===61?window.__gyroDiag.f61++:window.__gyroDiag.f113++;let n=e===61?',
);

/* ---------- 4. Fe()：重锚定计数 ---------- */
replaceOnce('重锚定计数',
  'Fe._cand=null,Fe._acc=Date.now(),H(`[跳变恢复] 确认为真实运动,已重锚定`)',
  'Fe._cand=null,Fe._acc=Date.now(),window.__gyroDiag&&window.__gyroDiag.reanchor++,H(`[跳变恢复] 确认为真实运动,已重锚定`)',
);

fs.writeFileSync(FILE, src);
console.log('DONE: 停顿追赶平滑 + 遥测已写入 ' + path.basename(FILE));
