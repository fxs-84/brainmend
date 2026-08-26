/*
 * 推送式采集 + 裸数据链路补丁 v1 —— 作用于 assets/index-Cc2Ik-Ku.js
 * 标记: PUSH-ACQ-v1 (BLE层) / RAW-DISPLAY-v1 (显示管线 mn)
 *
 * 背景: imu-demo.html 实机验证结论 ——
 *   1) 官方协议是设备主动推送 0x55 0x61 包(acc+gyro+角度, 20B)到 FFE4,
 *      速率可达 50Hz; 本 app 的 50ms 轮询读寄存器(FF AA 27 3D 00)是半双工问答,
 *      是卡顿/跳变/失步的总根因;
 *   2) 干净的推送流下, 全部软件补偿(漂移补偿/中值滤波/追赶/毛刺拒绝)弊大于利,
 *      裸数据 + ±180连续化 + 软件归零效果最好;
 *   3) 6轴算法(0x24=0)在头戴环境优于9轴(磁力计台阶消失), roll/pitch 重力锁定;
 *   4) 水平安装(Y 轴朝前)下, yaw=左右转头→X, roll=俯仰→Y, pitch=侧屈(不用);
 *      全局统一这套语义, dotY 任何模式都用 roll, dotX 永远用 yaw。
 *
 * 改动:
 *   A. BLE层: 连接初始化删掉 we(读寄存器) 与 Re()(50ms轮询启动),
 *      改发 6轴(FF AA 24 00 00) + 50Hz(FF AA 03 08 00)(运行时设置, 不 save);
 *      Fe 的 0x61 分支从"磁力计日志+降级重发"改为解析 acc/gyro/角度并直接喂
 *      updateFromGyroscope; 0x3D/0x71 角度分支保留解析但绕过 Cp 毛刺拒绝
 *      与 STALL-FIX 重锚定(原样直通)。
 *   B. 显示管线 mn: pitch/roll 中值滤波、DRIFT-FIX-v4 漂移补偿、coordination
 *      yaw 中值滤波(D._yawF)、CATCHUP-FIX 追赶 lerp 全部移除; dotY 全模式
 *      统一用 roll; 解除水平 tn 车道锁(保留垂直 rn 卡中线防头补偿); gn() 手机
 *      fallback 与 HUD 误差也按统一轴修正。Qt/Cp/fn/tn/rn 函数体保留(仅 rn 仍调用)。
 *
 * 幂等: 已打过补丁则直接退出。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK1 = '/*PUSH-ACQ-v1*/';
const MARK2 = '/*RAW-DISPLAY-v1*/';

let src = fs.readFileSync(FILE, 'utf8');

// 逐步幂等: 每步自行判断锚点/目标状态, 可增量追加步骤

function replaceOnce(name, find, replace) {
  if (!src.includes(find)) {
    if (replace && src.includes(replace)) { console.log(`SKIP(step): ${name} 已是目标状态`); return; }
    if (!replace && !src.includes(find)) {
      // 空替换: find 已被抹掉就算"已应用", 跳过; 留 B10 之类的修复步骤去善后
      console.log(`SKIP(step): ${name} 已被先前运行抹掉`);
      return;
    }
    console.error(`FAIL: ${name} 未找到锚点，未做修改`);
    process.exit(1);
  }
  const cnt = src.split(find).length - 1;
  if (cnt !== 1) {
    console.error(`FAIL: ${name} 匹配到 ${cnt} 处（应为 1），未做修改`);
    process.exit(1);
  }
  src = src.replace(find, replace);
  console.log(`OK: ${name} 已修补`);
}

/* ---------- A1. 指令常量: 新增 50Hz(Qe) 与 6轴(Xe) ---------- */
/* 注: Xe 直接写 0x24=1(B12 最终态), 避免与 B12 步骤互相破坏幂等 */
replaceOnce('指令常量',
  'let Se=new Uint8Array([255,170,2,134,0]),Ce=new Uint8Array([255,170,2,8,0]),we=new Uint8Array([255,170,39,61,0]),Te=new Uint8Array([255,170,35,0,0]),Ee=new Uint8Array([255,170,82,0,0]),U=null;',
  MARK1 + 'let Se=new Uint8Array([255,170,2,134,0]),Ce=new Uint8Array([255,170,2,8,0]),we=new Uint8Array([255,170,39,61,0]),Te=new Uint8Array([255,170,35,0,0]),Ee=new Uint8Array([255,170,82,0,0]),Qe=new Uint8Array([255,170,3,8,0]),Xe=new Uint8Array([255,170,36,1,0]),U=null;',
);

/* ---------- A2. 连接初始化: 删 we+Re(), 发 50Hz; 不再强制写 0x24(尊重设备保存的算法) ---------- */
/* 注: 用户可在 UI 切 6/9 轴(写 0x24+保存, 断电重启后生效); 连接时不再覆盖, 避免每次连接被改回 6轴 */
replaceOnce('连接初始化序列',
  'await U.writeValue(Te),H(`已发送水平安装方向指令`),await new Promise(e=>setTimeout(e,200)),await U.writeValue(Ee),H(`已发送Z轴复位指令(连接初始化)`),await U.writeValue(Se),H(`已发送开启欧拉角输出指令(0x02+0x86)`),await new Promise(e=>setTimeout(e,200)),await U.writeValue(we),H(`已发送读取角度寄存器指令(0x27+0x3D)`),await new Promise(e=>setTimeout(e,200)),await U.writeValue(new Uint8Array([255,170,0,0,0])),H(`已发送保存设置指令`),await new Promise(e=>setTimeout(e,300)),Re()',
  'await U.writeValue(new Uint8Array([255,170,105,136,181])),H(`已发送解锁指令`),await new Promise(e=>setTimeout(e,200)),await U.writeValue(Te),H(`已发送水平安装方向指令`),await new Promise(e=>setTimeout(e,200)),await U.writeValue(Ee),H(`已发送Z轴复位指令(连接初始化)`),await U.writeValue(Se),H(`已发送开启欧拉角输出指令(0x02+0x86)`),await new Promise(e=>setTimeout(e,200)),await U.writeValue(new Uint8Array([255,170,0,0,0])),H(`已发送保存设置指令`),await new Promise(e=>setTimeout(e,200)),' + MARK1 + 'await U.writeValue(Qe),H(`已发送回传速率50Hz指令(0x03=0x08)`),await new Promise(e=>setTimeout(e,300))',
);

/* ---------- A3. Fe 0x61 分支: 解析 acc/gyro/角度并直接喂(替代磁力计日志+降级重发) ---------- */
replaceOnce('0x61推送帧解析',
  '}else if(e===97){let e=t.getInt16(2,!0),n=t.getInt16(4,!0),r=t.getInt16(6,!0);Ae===0&&ke<10&&H(`  磁力计帧 type=0x61: HX=${e} HY=${n} HZ=${r}`),ke>=20&&Ae<1&&U&&(H(`⚠️ 20帧内未收到欧拉角帧，尝试切换到欧拉角输出模式...`),U.writeValue(new Uint8Array([255,170,105,136,181])).then(()=>{setTimeout(()=>{U.writeValue(Ce),H(`已发送仅欧拉角输出指令(0x02+0x08)`)},100)}).catch(()=>{}),Ae=-1)}',
  '}else if(e===97){' + MARK1 + 'window.__gyroDiag.f61++;let n=t.getInt16(18,!0)/32768*180,r=t.getInt16(16,!0)/32768*180,i=t.getInt16(14,!0)/32768*180,o=-n;if(je!==null){let e=o-je;e>180&&(e-=360),e<-180&&(e+=360),o=je+e}Me=o,Ne=-r,Pe=i,window.updateFromGyroscope({pitch:-r,yaw:o,roll:i}),je=o,ke++,Ae++,(ke<=5||ke%50==0)&&H(`📐 推送帧#${ke} 0x61: P=${r.toFixed(1)}° Y=${(-n).toFixed(1)}° R=${i.toFixed(1)}°`),a++}',
);

/* ---------- A4. Fe 0x3D/0x71 角度分支: 绕过 Cp 毛刺拒绝 + STALL-FIX 重锚定, 原样直通 ---------- */
replaceOnce('角度分支直通',
  'let s=Cp({lastX:Me,lastY:Ne,lastR:Pe,newX:o,newY:-r,newR:i,maxStepDeg:9999,giantStepDeg:60});s.rejected?(/*STALL-FIX-v2*/Fe._cand&&Math.abs(o-Fe._cand.x)<30&&Math.abs(-r-Fe._cand.y)<30||Fe._acc&&Date.now()-Fe._acc>800?(window.updateFromGyroscope({pitch:-r,yaw:o,roll:i}),Me=o,Ne=-r,Pe=i,Fe._cand=null,Fe._acc=Date.now(),window.__gyroDiag&&window.__gyroDiag.reanchor++,H(`[跳变恢复] 确认为真实运动,已重锚定`)):(Fe._cand={x:o,y:-r},console.warn(`[毛刺拒绝] 单帧跳变 >60°`))):(window.updateFromGyroscope({pitch:s.y,yaw:s.x,roll:s.r}),Me=s.x,Ne=s.y,Pe=s.r,Fe._cand=null,Fe._acc=Date.now()),je=o',
  MARK1 + 'window.updateFromGyroscope({pitch:-r,yaw:o,roll:i}),Me=o,Ne=-r,Pe=i,je=o',
);

/* ---------- B1. mn: pitch/roll 中值滤波移除 ---------- */
replaceOnce('pitch/roll 中值滤波移除',
  'let t=e.yaw||0,n=e.pitch||0,r=e.roll||0;n=fn(cn,n),r=fn(ln,r),/*VERT-FIX-v4*/',
  'let t=e.yaw||0,n=e.pitch||0,r=e.roll||0;' + MARK2 + '/*VERT-FIX-v4*/',
);

/* ---------- B2. mn: DRIFT-FIX 补偿与 coordination yaw 中值滤波移除(同时补回 yaw 偏移减法 —— Qt 原来内部减 yawOffset) ---------- */
replaceOnce('漂移补偿与yaw中值移除(并补回yaw偏移)',
  'let a=t;D.pitch=n-D.pitchOffset,D.yaw=a,D.roll=r-D.rollOffset;',
  MARK2 + 'let a=t;D.pitch=n-D.pitchOffset,D.yaw=a-D.yawOffset,D.roll=r-D.rollOffset;',
);

/* ---------- B3. mn: CATCHUP-FIX 追赶移除 ---------- */
replaceOnce('追赶逻辑移除',
  '/*CATCHUP-FIX-v1*/let nw=performance.now()/1e3,gp=nw-(D._lastGyroT||nw);D._lastGyroT=nw;if(D.mode===`coordination`){if(gp>.12){D._catch={t0:nw,fp:D._tp??D.pitch,fy:D._ty??D.yaw},window.__gyroDiag&&(window.__gyroDiag.catchUps=(window.__gyroDiag.catchUps||0)+1)}if(D._catch){let k=(nw-D._catch.t0)/.25;k>=1?D._catch=null:(D._tp=D.pitch,D._ty=D.yaw,D.pitch=D._catch.fp+(D.pitch-D._catch.fp)*k,D.yaw=D._catch.fy+(D.yaw-D._catch.fy)*k)}D._catch||(D._tp=D.pitch,D._ty=D.yaw)}',
  MARK2,
);

/* ---------- A5. 失步跳过路径也计入 desyncs(链路丢字节可观测) ---------- */
replaceOnce('失步字节遥测',
  'for(;i<Oe.length;){if(Oe[i]!==85){i++;continue}',
  'for(;i<Oe.length;){if(Oe[i]!==85){' + MARK1 + 'window.__gyroDiag&&(window.__gyroDiag.desyncs=(window.__gyroDiag.desyncs||0)+1),i++;continue}',
);

/* ---------- B5. mn: dotY 全局统一用 roll(X=yaw, Y=roll=Z轴=roll俯仰, pitch 留给位置觉) ---------- */
/* 水平安装(Y 轴朝前): 协调/位置觉/游戏/其他所有模式 dotY 都从 roll 读取
   Y 轴 = roll(俯仰), Z 轴 = pitch(侧屈); pitch 在位置觉 mode 的 UI/报告中独立处理 */
replaceOnce('dotY 全模式统一用 roll',
  'D.dotY=(D.mode===`coordination`)?D.roll/(D.rollCoefficient||(D.rollCoefficient=(D.rollRange||30)/(Gn*.85))):-D.pitch/D.pitchCoefficient',
  'D.dotY=D.roll/(D.rollCoefficient||(D.rollCoefficient=(D.rollRange||22.5)/(Gn*.85)))',
);

/* ---------- B6 已合并到 B5: B5 改动后的 dotY 公式不再调用 tn/rn(整段已重写), 故此处不需独立步骤 ---------- */

/* ---------- B6.6. 协调/game 模式初始化: 显式 D.rollRange=22.5(与 pitchRange/Ff.vertical.pitch 一致, dotY 满量程=22.5度) ---------- */
const initOld = "D.yawRange=30,D.pitchRange=22.5,D.coordScores={tracking:[],trajectory:[],smoothness:[]},D.coordFailTime=0,D._driftCount=0,D._driftStreak=0,e!==r&&(D.coordFullScores=[],D.coordCurrentTrajectoryIndex=0),e!==r&&(D.coordMode=`single`,D.targetX=0,D.targetY=0),Ep()),e===`game`&&(D.yawRange=30,D.pitchRange=22.5,Rp());";
const initNew = "D.yawRange=30,D.pitchRange=22.5,D.rollRange=22.5,D.coordScores={tracking:[],trajectory:[],smoothness:[]},D.coordFailTime=0,D._driftCount=0,D._driftStreak=0,e!==r&&(D.coordFullScores=[],D.coordCurrentTrajectoryIndex=0),e!==r&&(D.coordMode=`single`,D.targetX=0,D.targetY=0),Ep()),e===`game`&&(D.yawRange=30,D.pitchRange=22.5,D.rollRange=22.5,Rp());";
replaceOnce('协调初始化 rollRange=22.5', initOld, initNew);

/* ---------- B7. gn() 手机方向 fallback: beta(前后倾)→roll, 与统一轴一致 ---------- */
replaceOnce('gn 手机 fallback 轴对齐',
  'window.updateFromGyroscope({yaw:t,pitch:n,roll:r})',
  'window.updateFromGyroscope({yaw:t,roll:n,pitch:r})',
);

/* ---------- B9. 剔除 bn() / 主循环的"显示反算 sensor"干扰(让 game/position 模式也走真 sensor) ---------- */
/* 原本: 非协调模式每帧把 D.roll 强行清零 + D.yaw/pitch 从 dotX/dotY 反算覆盖(回中动画也包括在内)
   现在: 全部删除, 跟 demo 一样 —— 头部停在哪 dot 停在哪, 不回中; sensor 数据不被显示反算覆盖 */
replaceOnce('剔除 bn() 显示反算覆盖',
  'function bn(){D.mode!==`coordination`&&(D.dotX*=1-E.DOT_RETURN_SPEED,D.dotY*=1-E.DOT_RETURN_SPEED,D.yaw=D.dotX*D.yawCoefficient,D.pitch=-D.dotY*D.pitchCoefficient,D.roll=0)}',
  'function bn(){}',
);

replaceOnce('剔除主循环 dotX/dotY 回中 + sensor 反算',
  '!D.useGyroscope&&!an&&D.mode!==`coordination`&&D.mode!==`position`&&(D.dotX*=E.DOT_RETURN_SPEED,D.dotY*=E.DOT_RETURN_SPEED,D.yaw=D.dotX*D.yawCoefficient,D.pitch=-D.dotY*D.pitchCoefficient,D.roll=0),',
  '',
);

/* ---------- B12. 修正 6/9 轴位映射(位取反) + 加解锁+保存 序列 ---------- */
/* 实测: 扫描寄存器 0x23-0x37 跨 6/9 轴对比, 仅 0x24 变化, 6轴=1 / 9轴=0 (位映射与我原代码相反)
   某些寄存器需先发 FF AA 69 88 B5 解锁, 写后建议 FF AA 00 00 00 保存。
   注: 连接初始化已改为不强制写 0x24(A2), 切 6/9 轴仅由 index.html UI 按钮发指令;
       Xe 常量保持 0x24=1(6轴) 作默认值兜底。 */

replaceOnce('6轴指令常量(0x24=1)',
  'Xe=new Uint8Array([255,170,36,0,0])',
  'Xe=new Uint8Array([255,170,36,1,0])',
);

/* ---------- B13. BLE 扫描: 用 services UUID 过滤替代 namePrefix(支持任意名字含中文) ---------- */
/* Chrome ~85 起 acceptAllDevices 不再支持(隐私原因); namePrefix 仍受 ASCII 限制不便中文名;
   一键回连用 filters.name 也只匹配唯一原名(改过名就找不到)。
   改用 filters.services 匹配设备广播的 WIT 官方服务 UUID 0000ffe5...,
   只要设备广播这个服务(无论叫"WT901BLE67"还是"我的颈椎仪"或任何中文名), 都出现在选择器中 */
replaceOnce('BLE 扫描: acceptAllDevices → services UUID 过滤',
  't={filters:[{services:[`0000ffe5-0000-1000-8000-00805f9a34fb`]}],optionalServices:e?[e]:[`0000ffe5-0000-1000-8000-00805f9a34fb`,`0000ffe0-0000-1000-8000-00805f9b34fb`]};if(H(`请求设备...`)',
  't={filters:[{services:[`0000ffe5-0000-1000-8000-00805f9a34fb`]}],optionalServices:e?[e]:[`0000ffe5-0000-1000-8000-00805f9a34fb`,`0000ffe0-0000-1000-8000-00805f9b34fb`]};if(H(`请求设备...`)',
);

replaceOnce('BLE 一键回连: filters.name 精确名 → services UUID 过滤(改过名也能找到)',
  't=await navigator.bluetooth.requestDevice({filters:[{name:r}],optionalServices:[`0000ffe5-0000-1000-8000-00805f9a34fb`,`0000ffe0-0000-1000-8000-00805f9b34fb`]})',
  't=await navigator.bluetooth.requestDevice({filters:[{services:[`0000ffe5-0000-1000-8000-00805f9a34fb`]}],optionalServices:[`0000ffe5-0000-1000-8000-00805f9a34fb`,`0000ffe0-0000-1000-8000-00805f9b34fb`]})',
);

replaceOnce('BLE 一键回连: acceptAllDevices fallback → services UUID 过滤',
  't||=(H(`弹出通用选择器...`),await navigator.bluetooth.requestDevice({acceptAllDevices:!0,optionalServices:[`0000ffe5-0000-1000-8000-00805f9a34fb`,`0000ffe0-0000-1000-8000-00805f9b34fb`]})),de=t,await De()',
  't||=(H(`弹出通用选择器...`),await navigator.bluetooth.requestDevice({filters:[{services:[`0000ffe5-0000-1000-8000-00805f9a34fb`]}],optionalServices:[`0000ffe5-0000-1000-8000-00805f9a34fb`,`0000ffe0-0000-1000-8000-00805f9b34fb`]})),de=t,await De()',
);

/* ---------- B11. De() 写特征就绪后暴露给 window, 让 UI 能切 6/9 轴 ---------- */
replaceOnce('暴露写特征给 window',
  'await fe.startNotifications(),fe.addEventListener(`characteristicvaluechanged`,Fe),H(`数据通知已订阅`),U)try{',
  'await fe.startNotifications(),fe.addEventListener(`characteristicvaluechanged`,Fe),H(`数据通知已订阅`),window._bleWriteChar=U,window._gyroCmd=async e=>U.writeValue(new Uint8Array(e)),U)try{',
);
/* ---------- 写回(带备份, 幂等安全) ---------- */
fs.writeFileSync(FILE + '.bak-push-acq', fs.readFileSync(FILE));
fs.writeFileSync(FILE, src);
console.log('DONE: 推送式采集+裸数据链路已写入 ' + path.basename(FILE) + ' (已备份 .bak-push-acq)');
