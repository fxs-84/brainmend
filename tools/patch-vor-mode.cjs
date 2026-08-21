/*
 * 前庭固视模式 (VOR) 补丁 —— 在「射击模式 - 消灭敌舰」基础上新增 data-mode="vor"
 *
 * 设计核心：飞船固定在屏幕底部中央做固视靶，画面整体随头部 yaw 反向平移。
 *   worldShift = -clamp(yaw / RANGE, ±1) * SHIFT_MAX      (屏宽归一化单位)
 *   player.x(世界坐标) = 0.5 - worldShift                  → 所有碰撞/瞄准/子弹逻辑零改动
 *   渲染时对世界层 ctx.translate(worldShift * w, 0)，飞船画在固定的 0.5
 *
 * 幂等：已打过补丁则直接退出。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'assets', 'index-Cc2Ik-Ku.js');
const MARK = '/*VOR-PATCH-v13*/';
const NL = String.fromCharCode(13,10);

let src = fs.readFileSync(FILE, 'utf8');

if (src.includes(MARK)) {
  console.log('SKIP: 补丁已存在 (' + MARK + ')');
  process.exit(0);
}

const patches = [];
const P = (name, find, replace) => patches.push({ name, find, replace });

/* ---------- 1. GameEngine 构造函数：新增 VOR 状态 ---------- */
P('ctor-flags',
  'this.difficulty=new Xf,this.currentScene=null,this.isShootingMode=!1,',
  'this.difficulty=new Xf,this.currentScene=null,this.isShootingMode=!1,' + MARK +
  'this._vorMode=!1,this._worldShift=0,this._vorStats=null,' +
  'this._vorSpawnSide=-1,this._vorBatch=0,this._vorCoinSide=-1,this._vorCoinBatch=0,'
);

/* ---------- 1b. 暴露引擎句柄（与既有 window.spaceEngine / valleyEngine 约定对齐） ---------- */
P('ctor-expose',
  'init(){this.input.init(),',
  'init(){window.gameEngine=this,this.input.init(),'
);

/* ---------- 2. updatePlayer：VOR 分支（飞船锁定，计算画面位移） ---------- */
P('updatePlayer',
  'updatePlayer(){let e=this.input.getPosition(),',
  'updatePlayer(){' +
  'if(this._vorMode){' +
    'let p=this.input.getPosition(),' +
        // getPosition().x = 0.5 + (yaw/35)*0.5  →  yaw = (x-0.5)*70
        'rg=window.__vorRangeDeg>0?window.__vorRangeDeg:20,' +
        'n=Math.max(-1,Math.min(1,(p.x-.5)*70/rg)),' +
        'mx=window.__vorShiftMax>0?window.__vorShiftMax:.32,' +
        'tg=-n*mx,' +
        'dt=this.deltaTime||.016;' +
    // 低延迟跟随：VOR 训练必须跟手，滞后会破坏凝视稳定
    'this._worldShift+=(tg-this._worldShift)*.5,' +
    'this.player.x=Math.max(0,Math.min(1,.5-this._worldShift)),' +
    'this.player.y=this.currentScene&&this.currentScene.playerY!=null?this.currentScene.playerY:.95;' +
    'this._vorRawDeg=(p.x-.5)*70;' +
    'let st=this._vorStats||(this._vorStats={maxDeg:0,turns:0,outOfRangeSec:0,lastDir:0});' +
    'let ad=Math.abs(n)*rg;' +
    'ad>st.maxDeg&&(st.maxDeg=ad),' +
    'Math.abs(n)>=1&&(st.outOfRangeSec+=dt);' +
    'let d=n>.35?1:n<-.35?-1:0;' +
    'return d!==0&&d!==st.lastDir&&(st.lastDir!==0&&st.turns++,st.lastDir=d),void 0' +
  '}' +
  'let e=this.input.getPosition(),'
);

/* ---------- 3. render()：世界层整体平移 ----------
 * 分三层，各自的运动语义不同：
 *   固定层  深空渐变 + 太阳/行星/地球  —— 不平移。渐变无特征，平移会留边缘接缝；
 *           星球是远景天体，跟着晃会显得画面"整块在滑"，固定住更稳定好看
 *   世界层  星野/星云/光带 + 金币等障碍物 + 敌舰/子弹 —— 随头动平移，提供视觉运动线索
 *   屏幕层  飞船 + 固视靶 + HUD —— 固定在屏幕中央底部
 * 注意：金币在 this.obstacles 里，碰撞判定用世界坐标，绘制必须同样平移，否则看得见吃不到。
 */
P('render-background',
  'e.clearRect(0,0,t,n),this.currentScene&&this.currentScene.renderBackground&&this.currentScene.renderBackground(e,t,n);for(let t of this.obstacles)(t.type!==`coin`||!t.isCollected)&&t.render(e);',
  'e.clearRect(0,0,t,n);' +
  'let _vs=this._vorMode?(this._worldShift||0)*t:0,_sc=this.currentScene;' +
  'this._vorMode&&(_sc&&_sc.renderDeepSpaceGradient?_sc.renderDeepSpaceGradient(e,t,n):(e.fillStyle="#02030a",e.fillRect(0,0,t,n)),e.save(),e.translate(_vs,0));' +
  '_sc&&_sc.renderBackground&&_sc.renderBackground(e,t,n),' +
  'this._vorMode&&(e.restore(),_sc&&_sc._renderCelestials&&_sc._renderCelestials(e,t,n),e.save(),e.translate(_vs,0));' +
  'for(let t of this.obstacles)(t.type!==`coin`||!t.isCollected)&&t.render(e);' +
  'this._vorMode&&e.restore();'
);

/* ---------- 3b. 场景端：把太阳/行星/地球拆成 _renderCelestials，VOR 下由引擎不平移地画 ---------- */
P('scene-split-celestials',
  'this.particles.render(e);let i=t*.88,a=n*.12,o=r*.055,',
  'this.particles.render(e),this.engine&&this.engine._vorMode||this._renderCelestials(e,t,n)}' +
  '_renderCelestials(e,t,n){let r=Math.min(t,n),i=t*.88,a=n*.12,o=r*.055,'
);

/* ---------- 3c. 场景端：VOR 下 renderBackground 跳过渐变（已由引擎不平移地画过） ---------- */
P('scene-skip-gradient',
  'renderBackground(e,t,n){let r=Math.min(t,n);this.renderDeepSpaceGradient(e,t,n);for(let r of this.energyCores)',
  'renderBackground(e,t,n){let r=Math.min(t,n);this.engine&&this.engine._vorMode||this.renderDeepSpaceGradient(e,t,n);for(let r of this.energyCores)'
);

/* ---------- 3d. VOR 生成坐标系：从「固定世界坐标」改为「跟随视野的相对坐标」 ----------
 * 原本敌舰/金币生成在固定世界 x 0.2~0.8，与随头动平移的视野 [-shift, 1-shift] 脱钩：
 *   头转满 20° 时 shift=-0.32，世界 x=0.2 的敌舰落在屏幕 -0.12 —— 完全在画面外生成，
 *   患者看不见→撞上去，且飞船世界可达区间 [0.18,0.82] 在走廊边缘，锁定永远对不准。
 * 因为飞船永远在屏幕正中央，可见与可达可以用同一个公式满足：
 *   worldX = clamp(player.x + (rand-0.5)*0.7, 0.18, 0.82)
 *            └ 可见：屏幕 0.15~0.85 ┘  └ 可达：飞船世界可达区间 ┘
 * 生成时必在画面内、必在可击中范围内；随后患者转头它才会横移出视野（由边缘箭头提示）。
 */
P('scene-vor-spawn-x',
  'this.maxBullets=5,this.init()}',
  'this.maxBullets=5,this.init()}' +
  // VOR 生成必须左右交替，逼患者左右转头盯飞船标靶（纯随机会连出同一侧，训练失效）。
  // 状态挂在 engine 实例上（GameEngine ctor 里 this._vorSpawnSide/this._vorBatch 初始化），
  // 不用类字段语法 —— 类字段在这种压缩类体里不可靠。
  '_vorSpawnX(c){' +                                    // c=1 金币，c 缺省=敌舰
    'let e=this.engine,p=e?e.player.x:.5,' +
        'mx=window.__vorShiftMax>0?window.__vorShiftMax:.32,' +
        'lo=Math.max(.5-mx,p-mx),hi=Math.min(.5+mx,p+mx),' +
        's0=c?e._vorCoinSide:e._vorSpawnSide,side=s0,' +
        'hasL=lo<p-.04,hasR=hi>p+.04;' +
    'side<0&&!hasL&&(side=1),side>0&&!hasR&&(side=-1);' +          // 本侧贴边 → 本次换对侧
    'if(c){e._vorCoinBatch++,' +                                   // 敌舰/金币各自批次
      'e._vorCoinBatch>=2&&(e._vorCoinBatch=0,e._vorCoinSide=-s0)}' +
    'else{e._vorBatch++,' +
      'e._vorBatch>=2&&(e._vorBatch=0,e._vorSpawnSide=-s0)}' +
    'return side<0?' +                                              // 左：世界 x 在飞船左侧(屏幕左半)
      'lo+Math.random()*(p-.04-lo):' +
      'p+.04+Math.random()*(hi-p-.04)}'                             // 右：世界 x 在飞船右侧(屏幕右半)
);

P('scene-vor-spawn-enemy',
  'spawnEnemyFromTop(e){let t=[`fighter`,`fighter`,`cruiser`,`carrier`],n=t[Math.floor(Math.random()*t.length)],r,i=Math.random()*.6+.2;',
  'spawnEnemyFromTop(e){let t=[`fighter`,`fighter`,`cruiser`,`carrier`],n=t[Math.floor(Math.random()*t.length)],r,' +
  'i=this.engine&&this.engine._vorMode?this._vorSpawnX():Math.random()*.6+.2;'
);

/* fighter 有 speedX ±0.015/s 横向漂移，生成在可达边界后会漂出飞船够不到的范围 → 永远打不掉。
 * VOR 下锁死横向：转头去追横移目标不是前庭训练要的动作，头动应由"敌舰生成在哪"驱动。 */


/* ---------- 3e. VOR 专属金币调参（不影响射击模式） ----------
 * 原参数在 VOR 下太难吃，实测机器人级完美追踪也只有 42% 收集率。四个原因：
 *   1) speedY 0.28~0.48 → 从生成到飞船只有 2~3.5 秒对准窗口
 *   2) 生成 x 固定 0.2~0.8 → 与视野脱钩（同 3d），且边缘零余量
 *   3) speedX ±0.015    → 追踪时目标自己还在横向跑
 *   4) 命中判定半径按 min(w,h) 缩放、位置按 width 缩放 → 横屏下横向容差只有纵向的 1/1.65
 * VOR 是前庭训练，金币是奖励物而非反应速度考核，所以放宽：
 *   生成走 _vorSpawnX()、速度减半、取消横向漂移、
 *   半径 0.025→0.04 补偿横向容差、上下浮动 0.03→0.012
 */
P('scene-vor-coin',
  'spawnCoin(){return new f({x:Math.random()*.6+.2,y:-.1,speedX:(Math.random()-.5)*.03,speedY:.28+Math.random()*.2})}',
  'spawnCoin(){' +
  'if(this.engine&&this.engine._vorMode){' +
    'let c=new f({x:this._vorSpawnX(1),y:-.1,speedX:0,speedY:.16+Math.random()*.1,radius:.04});' +
    'return c.bobAmplitude=.012,c' +
  '}' +
  'return new f({x:Math.random()*.6+.2,y:-.1,speedX:(Math.random()-.5)*.03,speedY:.28+Math.random()*.2})}'
);

/* ---------- 3f. 锁定候选的 y 上界 ----------
 * 原筛选 e.y<.8，而 VOR 下飞船在 y=0.88 —— 敌舰从 0.8 到 0.88 这最后一段无法被锁定，
 * 表现就是"明明对准了却打不出子弹"。VOR 下放宽到飞船上方一点。
 */
P('scene-aim-y-range',
  'i<r&&e.y>.1&&e.y<.8&&(r=i,n=e)',
  'i<r&&e.y>.05&&e.y<(this.engine&&this.engine._vorMode?this.playerY-.02:.8)&&(r=i,n=e)'
);

/* ---------- 3g. 开火纪律：让"必须对准才射击"在开火那一刻硬性成立 ----------
 * 原逻辑有个漏洞：targetEnemy 每帧无条件切到最近敌舰，而 alignmentTime 未对准时只按 dt*2
 * 衰减、不清零。于是"对准 A 攒满 0.5s → A 被击毁 → 目标切到远处的 B → alignmentTime 还没排空"
 * 就会朝根本没对准的 B 开火（实测偏差可达 0.07，是阈值 0.02 的 3.5 倍）。
 * VOR 下目标切换更频繁，问题尤其明显。两处补：
 *   1) 目标切换时 alignmentTime 立即清零 —— 蓄力不能跨目标继承
 *   2) canShoot() 增加"当前这一帧确实对准"的硬校验 —— 不依赖历史累积值
 */
P('scene-fire-discipline-reset',
  'this.targetEnemy=n,n&&r<this.alignmentThreshold?',
  'this.engine&&this.engine._vorMode&&n!==this.targetEnemy&&(this.alignmentTime=0),' +
  'this.targetEnemy=n,n&&r<this.alignmentThreshold?'
);

P('scene-fire-discipline-gate',
  'canShoot(){return this.targetEnemy&&this.alignmentTime>=this.requiredHoldTime&&this.shootCooldown<=0&&this.engine.bullets.length<this.maxBullets}',
  'canShoot(){' +
  'if(!this.targetEnemy)return!1;' +
  'if(this.engine&&this.engine._vorMode&&' +
     'Math.abs(this.targetEnemy.x-this.engine.player.x)>=this.alignmentThreshold)return!1;' +
  'return this.alignmentTime>=this.requiredHoldTime&&this.shootCooldown<=0&&this.engine.bullets.length<this.maxBullets}'
);

/* ---------- 3h. VOR 生成节奏放慢 ----------
 * 用户反馈：敌舰生成太快来不及射击。实测同时在场峰值可达 7 个，
 * 每个需 0.5s 锁定，打 3 个的功夫其他 4 个已到飞船。VOR 是前庭训练不是反应测试：
 *   1) 生成间隔 ×2（1s → 2s）
 *   2) 敌舰在场上限 3 个（不随难度增长）
 *   3) 下落速度 ×0.6（穿越时间 4~8s → 7~13s，给足转头逐个打的时间）
 * 全部仅 VOR 生效，射击模式参数不变。
 */
P('scene-vor-spawn-rhythm',
  'trySpawnObstacle(e,t){let n=this.gameTime-this.lastSpawnTime;if(e.length<t.maxObstacles&&n>=t.spawnInterval/1e3){',
  'trySpawnObstacle(e,t){let n=this.gameTime-this.lastSpawnTime,isVor=this.engine&&this.engine._vorMode,' +
    'iv=isVor?t.spawnInterval*2:t.spawnInterval,' +
    'ok=isVor?this.engine.enemies.length<3:e.length<t.maxObstacles;' +
  'if(ok&&n>=iv/1e3){'
);

P('scene-vor-slow-fighter',
  'case`fighter`:r=new w({x:i,y:-.1,speedX:(Math.random()-.5)*.03,speedY:.12+Math.random()*.08,',
  'case`fighter`:r=new w({x:i,y:-.1,speedX:this.engine&&this.engine._vorMode?0:(Math.random()-.5)*.03,' +
  'speedY:(.12+Math.random()*.08)*(this.engine&&this.engine._vorMode?.6:1),'
);

P('scene-vor-slow-cruiser',
  'case`cruiser`:r=new w({x:i,y:-.1,speedX:0,speedY:.16+Math.random()*.08,',
  'case`cruiser`:r=new w({x:i,y:-.1,speedX:0,speedY:(.16+Math.random()*.08)*(this.engine&&this.engine._vorMode?.6:1),'
);

P('scene-vor-slow-carrier',
  'case`carrier`:r=new w({x:i,y:-.1,speedX:0,speedY:.12+Math.random()*.08,',
  'case`carrier`:r=new w({x:i,y:-.1,speedX:0,speedY:(.12+Math.random()*.08)*(this.engine&&this.engine._vorMode?.6:1),'
);

/* ---------- 4. renderShootingMode：敌舰/子弹随画面平移，飞船固定 + 固视 HUD ---------- */
P('renderShootingMode',
  'renderShootingMode(e){for(let t of this.enemies)t.active&&t.render(e);for(let t of this.bullets)t.active&&t.render(e);for(let t of this.enemyBullets)t.active&&t.render(e);this.currentScene&&this.currentScene.renderPlayer&&this.currentScene.renderPlayer(e,this.player.x,this.player.y)}',
  'renderShootingMode(e){' +
  'let vor=this._vorMode,w=this.canvas.width,h=this.canvas.height,sx=vor?(this._worldShift||0)*w:0;' +
  'vor&&(e.save(),e.translate(sx,0));' +
  'for(let t of this.enemies)t.active&&t.render(e);' +
  'for(let t of this.bullets)t.active&&t.render(e);' +
  'for(let t of this.enemyBullets)t.active&&t.render(e);' +
  'vor&&e.restore();' +
  'let px=vor?.5:this.player.x;' +
  'this.currentScene&&this.currentScene.renderPlayer&&this.currentScene.renderPlayer(e,px,this.player.y),' +
  'vor&&this._renderVorHud(e,w,h,px)' +
  '}' +
  '_renderVorHud(e,w,h,px){' +
    'let st=this._vorStats||{maxDeg:0,turns:0},' +
        'rg=window.__vorRangeDeg>0?window.__vorRangeDeg:20,' +
        'mx=window.__vorShiftMax>0?window.__vorShiftMax:.32,' +
        'n=Math.max(-1,Math.min(1,-(this._worldShift||0)/mx)),' +
        'raw=Math.abs(this._vorRawDeg||0),' +
        'atTarget=raw>=rg*.95,over=raw>rg*1.25,' +
        'col=over?"#F59E0B":atTarget?"#22C55E":"#00D9A5",' +
        'cx=px*w,cy=this.player.y*h,R=Math.min(w,h)*.085;' +
    // 固视靶环：提示患者视线锁定飞船
    'e.save(),e.setLineDash([5,5]),e.strokeStyle="rgba(0,217,165,0.55)",e.lineWidth=1.5,' +
    'e.beginPath(),e.arc(cx,cy,R,0,Math.PI*2),e.stroke(),e.setLineDash([]);' +
    'e.strokeStyle="rgba(0,217,165,0.85)",e.lineWidth=2;' +
    'for(let i=0;i<4;i++){let a=Math.PI/2*i+Math.PI/4;' +
      'e.beginPath(),e.moveTo(cx+Math.cos(a)*R*.75,cy+Math.sin(a)*R*.75),' +
      'e.lineTo(cx+Math.cos(a)*R*1.05,cy+Math.sin(a)*R*1.05),e.stroke()}' +
    'e.restore();' +
    // 顶部角度条：到位=绿(训练目标达成)，超范围=琥珀(提示收一点)
    'let bw=Math.min(w*.5,320),bx=(w-bw)/2,by=16,bh=7,out=over;' +
    'e.save(),e.fillStyle="rgba(0,0,0,0.45)",e.fillRect(bx,by,bw,bh),' +
    'e.strokeStyle=out?"#F59E0B":atTarget?"#22C55E":"rgba(255,255,255,0.35)",e.lineWidth=1,e.strokeRect(bx,by,bw,bh),' +
    'e.fillStyle="rgba(255,255,255,0.5)",e.fillRect(bx+bw/2-.5,by-3,1,bh+6),' +
    'e.fillStyle=col;' +
    'let kx=bx+bw/2+n*bw/2;' +
    'e.fillRect(Math.min(bx+bw-3,Math.max(bx,kx-1.5)),by-3,3,bh+6),' +
    'e.fillStyle=col,e.font="11px sans-serif",e.textAlign="center",' +
    'e.fillText((this._vorRawDeg>=0?"R ":"L ")+Math.min(raw,rg).toFixed(0)+"\\u00b0 / \\u00b1"+rg+"\\u00b0"+(over?"  \\u8d85\\u8303\\u56f4":atTarget?"  \\u5230\\u4f4d":""),bx+bw/2,by+bh+13),' +
    'e.textAlign="left",e.fillStyle="rgba(255,255,255,0.55)",e.font="10px sans-serif",' +
    'e.fillText("\\u8f6c\\u5934 "+(st.turns||0)+" \\u6b21 \\u00b7 \\u5cf0\\u503c "+(st.maxDeg||0).toFixed(0)+"\\u00b0",bx,by+bh+26),' +
    'e.restore();' +
    // 视野外敌舰的边缘箭头：转头会把已有敌舰推出画面，看不见会造成误判。
    // 注意每个箭头独立 save/restore —— 实测循环外统一 save 的写法绘制不生效（ctx 状态污染），
    // 独立 save/restore 验证过一定能画出来。
    'let sh=(this._worldShift||0);' +
    'for(let q of this.enemies){' +
      'if(!q.active||q.y<0||q.y>1)continue;' +
      'let ex=(q.x+sh)*w;' +
      'if(ex>=0&&ex<=w)continue;' +
      'let side=ex<0?-1:1,ax=side<0?14:w-14,ay=Math.max(28,Math.min(h-28,q.y*h)),' +
          'off=Math.min(1,Math.abs(side<0?-ex:ex-w)/(w*.35));' +
      'e.save(),e.globalAlpha=.85-off*.4,e.fillStyle="#F59E0B",' +
      'e.beginPath(),e.moveTo(ax+side*9,ay),e.lineTo(ax-side*7,ay-8),e.lineTo(ax-side*7,ay+8),' +
      'e.closePath(),e.fill(),e.restore()' +
    '}' +
    'e.globalAlpha=1;' +
    // 锁定进度环：画在目标敌舰的屏幕位置上，环满才会开火
    'let scn=this.currentScene,tg=scn&&scn.targetEnemy;' +
    'if(tg&&tg.active&&scn.requiredHoldTime>0){' +
      'let tx=(tg.x+sh)*w,ty=tg.y*h,' +
          'pr=Math.max(0,Math.min(1,(scn.alignmentTime||0)/scn.requiredHoldTime)),' +
          'rr=Math.min(w,h)*.055,lk=pr>=1;' +
      'if(tx>-40&&tx<w+40){' +
        'e.save(),e.lineWidth=2,e.strokeStyle=lk?"#22C55E":"rgba(0,217,165,0.45)",' +
        'e.beginPath(),e.arc(tx,ty,rr,0,Math.PI*2),e.stroke(),' +
        'pr>0&&(e.lineWidth=3.5,e.strokeStyle=lk?"#22C55E":"#00D9A5",' +
          'e.beginPath(),e.arc(tx,ty,rr,-Math.PI/2,-Math.PI/2+pr*Math.PI*2),e.stroke()),' +
        'lk&&(e.fillStyle="#22C55E",e.beginPath(),e.arc(tx,ty,rr*.18,0,Math.PI*2),e.fill()),' +
        'e.restore()' +
      '}' +
    '}' +
  '}'
);

/* ---------- 5. engine.setScene：从 scene 上读取 VOR 标记 ---------- */
P('engine-setScene',
  'e&&e.sceneType===`shooting`?(this.isShootingMode=!0,this._roadMode=!1,this.player.x=.5,this.player.y=.95)',
  'e&&e.sceneType===`shooting`?(this.isShootingMode=!0,this._roadMode=!1,this._vorMode=!!(e&&e._vorMode),this._worldShift=0,this._vorStats=null,this.player.x=.5,this.player.y=e&&e.playerY!=null?e.playerY:.95)'
);

/* ---------- 6. cleanup：复位 VOR 状态 ---------- */
P('engine-cleanup',
  'this.isShootingMode=!1,this._noddingMode=!1,this._roadMode=!1,window._noGyroEMA=!1}',
  'this.isShootingMode=!1,this._noddingMode=!1,this._roadMode=!1,this._vorMode=!1,this._worldShift=0,this._vorStats=null,window._noGyroEMA=!1}'
);

/* ---------- 7. onGameOver 附带 VOR 训练指标 ---------- */
P('grade-stats',
  'getShootingGrade(){let e=this.score',
  'getVorStats(){return this._vorMode?this._vorStats:null}getShootingGrade(){let e=this.score'
);

/* ---------- 8. 场景端：VOR 模式下关闭锁定环（避免与固视靶重叠错位） ---------- */
P('scene-aim-ring',
  'this.aimIndicator.active&&this.aimIndicator.progress>0){',
  'this.aimIndicator.active&&this.aimIndicator.progress>0&&!(this.engine&&this.engine._vorMode)){'
);

/* ---------- 9. GameUI.setScene：vor 复用射击场景 + 打标记 ---------- */
P('ui-setScene',
  'if(this.selectedMode===`shooting`){try{let e=(await Wl(()=>Promise.resolve().then(()=>tp),void 0,import.meta.url)).SceneSpaceShooting;if(e){let t=new e;this.engine.setScene(t)}}',
  // VOR 沿用原设计的锁定规则（alignmentThreshold=.02 / requiredHoldTime=.5）：
  // 必须真正对准并保持住才开火，不放宽。开火后 alignmentTime 归零，需重新对准。
  'if(this.selectedMode===`shooting`||this.selectedMode===`vor`){try{let e=(await Wl(()=>Promise.resolve().then(()=>tp),void 0,import.meta.url)).SceneSpaceShooting;if(e){let t=new e;this.selectedMode===`vor`&&(t._vorMode=!0,t.playerY=.88),this.engine.setScene(t)}}'
);

/* ---------- 10. startGame：vor 同样走 SINGLE_YAW 运动映射 ---------- */
P('ui-startGame',
  'this.selectedMode===`shooting`&&(e=r.MODES.SINGLE_YAW)',
  '(this.selectedMode===`shooting`||this.selectedMode===`vor`)&&(e=r.MODES.SINGLE_YAW)'
);

/* ---------- 11. 模式选择按钮 ---------- */
P('ui-modeBtn',
  '<button class="mode-btn" data-mode="nodding"',
  '<button class="mode-btn" data-mode="vor" style="' + NL +
  '                            padding: 10px; border: 2px solid transparent;' + NL +
  '                            border-radius: 6px; background: #1E293B; color: white;' + NL +
  '                            cursor: pointer; text-align: left;' + NL +
  '                        ">' + NL +
  '                            👁️ 前庭固视 - 飞船不动，画面随头动 ±20°' + NL +
  '                        </button>' + NL +
  '                        <button class="mode-btn" data-mode="nodding"'
);

/* ---------- 应用 ---------- */
let failed = false;
for (const p of patches) {
  const c = src.split(p.find).length - 1;
  if (c !== 1) {
    console.error(`FAIL [${p.name}] 锚点出现 ${c} 次（期望 1）`);
    failed = true;
  }
}
if (failed) {
  console.error('\n未做任何修改。');
  process.exit(1);
}

const backup = path.join(__dirname, 'index-Cc2Ik-Ku.js.bak-vor');
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

for (const p of patches) {
  src = src.replace(p.find, p.replace);
  console.log('OK  ' + p.name);
}

fs.writeFileSync(FILE, src);
console.log('\n已写入 ' + FILE + '\n备份 ' + backup);
