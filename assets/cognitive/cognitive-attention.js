// 模块5: 注意力测试 — 双框图标对比，判断相同/不同
// 设计稿: "图标位置相同，其中一个或两个图标形状不同" + "两个框向中心移动并重叠"
(function(){
var GOLD='#C9A84C';
var GRID=6, BOX_W=224, BOX_H=224, CELL=Math.floor(BOX_W/GRID), ICON_SIZE=Math.floor(CELL*0.78);
var ICON_PAD=(CELL-ICON_SIZE)/2;
var START_N=9, MIN_N=8, MAX_N=13;
var ICON_FILES=[
  'gou.svg','bangou.svg','fangkuang.svg','gantanhao.svg','chahao.svg',
  'yonghutouxiang2.svg','wuxianwangluo.svg','zhibo2.svg','lunkuo.svg',
  'liujiaoxing.svg','taiyang.svg','yuanquan.svg'
];

function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

function pickCells(n){
  var all=[];for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)all.push({r:r,c:c});
  return shuffle(all).slice(0,n);
}
function pickIcons(n){
  // 最多 6 种类,不足 n 则从已有种类里重复填充
  var MAX_TYPES=6;
  var k=Math.min(n,MAX_TYPES);
  var uniq=shuffle(ICON_FILES.map(function(_,i){return i;})).slice(0,k);
  var pool=uniq.slice();while(pool.length<n)pool.push(uniq[randInt(0,k-1)]);
  return shuffle(pool);
}
function altIconIdx(exclude){
  var used={};for(var i=0;i<exclude.length;i++)used[exclude[i]]=true;
  var alt=[];for(var i=0;i<ICON_FILES.length;i++)if(!used[i])alt.push(i);
  return alt.length?alt[randInt(0,alt.length-1)]:randInt(0,ICON_FILES.length-1);
}

var at=window.__attention={
  phase:'idle',
  totalIcons:START_N,
  isSame:true,
  cells:[],
  icons:[],
  diffIdxs:[],
  diffIcons:[],
  answerGiven:false,
  animProgress:0,
  animating:false,
  feedbackText:'',
  feedbackT:0,
  feedbackColor:'',
  feedbackDur:1500,
  consecutiveCorrect:0,
  consecutiveWrong:0,
  score:0,
  trials:0,
  tutStep:0,
  gameEndTime:0
};

var iconImgs=ICON_FILES.map(function(fn){
  var img=new Image();
  img.onload=function(){};
  img.src='./assets/'+fn;
  return img;
});
// 离屏预处理: 每个图标染为金色, 存 offscreen canvas
var goldIcons=ICON_FILES.map(function(){return null;});
(function preGold(){
  var checkAll=function(){
    var allReady=iconImgs.every(function(img){return img.complete&&img.naturalWidth>0;});
    if(!allReady){setTimeout(checkAll,200);return;}
    for(var i=0;i<iconImgs.length;i++){
      var img=iconImgs[i];
      var c=document.createElement('canvas');
      c.width=img.naturalWidth;c.height=img.naturalHeight;
      var gctx=c.getContext('2d');
      gctx.drawImage(img,0,0);
      gctx.globalCompositeOperation='source-in';
      gctx.fillStyle=GOLD;
      gctx.fillRect(0,0,c.width,c.height);
      goldIcons[i]=c;
    }
  };
  checkAll();
})();

function playBeep(freq,dur,type,vol){
  try{
    var a=new(window.AudioContext||window.webkitAudioContext)();
    var t=a.currentTime,o=a.createOscillator(),g=a.createGain();
    o.connect(g);g.connect(a.destination);
    o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(vol||.1,t);
    g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.start(t);o.stop(t+dur+.05);
  }catch(e){}
}
function playCoin(){playBeep(1200,.08,'sine',.1);setTimeout(function(){playBeep(1600,.08,'sine',.1);},60);setTimeout(function(){playBeep(2000,.12,'sine',.1);},120);}
function playError(){playBeep(220,.18,'square',.12);setTimeout(function(){playBeep(160,.18,'square',.12);},90);}

function drawRR(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

function genTrial(n){
  at.totalIcons=n;
  at.answerGiven=false;
  at.animating=false;
  at.animProgress=0;
  at._answerLocked=false;
  at.isSame=Math.random()<0.5;
  at.cells=pickCells(n);
  at.icons=pickIcons(n);
  at.diffIdxs=[];
  at.diffIcons=[];
  if(!at.isSame){
    var diffCount=Math.random()<0.5?1:2;
    var positions=shuffle([].concat(at.cells.map(function(_,i){return i;}))).slice(0,diffCount);
    at.diffIdxs=positions;
    for(var k=0;k<diffCount;k++){
      at.diffIcons.push(altIconIdx(at.icons));
    }
  }
}

function updateUI(){
  var st=document.getElementById('stroop-status');
  var sc=document.getElementById('stroop-score');
  if(st){
    if(at.phase==='ready')st.textContent='注意力测试';
    else if(at.phase==='tutorial_feedback')'';
    else if(at.phase==='tutorial_text')st.textContent='注意力测试 — 教程';
    else if(at.phase==='tutorial')st.textContent='教程 '+(at.tutStep===1?'(3图标)':'(4图标)');
    else if(at.phase==='ready_game')st.textContent='准备好了吗？';
    else if(at.phase==='playing')st.textContent='注意力测试';
    else if(at.phase==='done')st.textContent='测试结束';
    else st.textContent='';
  }
  if(sc){
    if(at.phase==='playing')sc.textContent='得分 '+at.score+'  图标 '+at.totalIcons;
    else sc.textContent='';
  }
}

at.showReady=function(){at.phase='ready';at.tutStep=0;updateUI();};
at.startTutorial=function(){at.phase='tutorial_text';at.tutStep=0;updateUI();};
function startTut1(){at.phase='tutorial';at.tutStep=1;genTrial(3);updateUI();}
function startTut2(){at.phase='tutorial';at.tutStep=2;genTrial(4);updateUI();}
at.showReadyGame=function(){at.phase='ready_game';updateUI();};
  at.showReadyStart=function(){at.phase='ready_start';updateUI();};
function startPlaying(){
  at.phase='playing';
  at.score=0;at.trials=0;
  at.consecutiveCorrect=0;at.consecutiveWrong=0;
  at.totalIcons=START_N;
  at._answerLocked=false;
  at.gameEndTime=Date.now()+60000;
  genTrial(START_N);updateUI();
}

at.showFeedback=function(text,color,dur){
  at.feedbackText=text;at.feedbackColor=color;at.feedbackT=performance.now();at.feedbackDur=dur||1500;
};

// 动画时长 — 仅在教程期使用,正式期无动画
var ANIM_MOVE_MS=800;
var ANIM_HOLD_MS=400;
var FB_SHORT_MS=150;
var FB_PLAYING_MS=200;

function handleAnswer(result){
  if(at.phase!=='tutorial'&&at.phase!=='playing')return;
  if(at._answerLocked)return;
  at._answerLocked=true;
  at.lastAnswer=result;
  var correct=(result===at.isSame);
  if(correct){playCoin();if(at.phase==='playing'){at.score++;at.trials++;at.totalIcons=Math.min(MAX_N,at.totalIcons+1);}}
  else{if(at.phase==='playing'){at.trials++;at.totalIcons=Math.max(MIN_N,at.totalIcons-1);}if(at.phase==='tutorial')playError();}
  if(at.phase==='tutorial'){
    at.animating=true;
    at.animProgress=0;
    at.animStart=performance.now();
    at.animPhase='merge';
    at.tutFeedbackOk=correct;
    at.tutFeedbackMsg=correct?'对，再试一个':'哦，不对';
  }else{
    at._answerLocked=false;
    genTrial(at.totalIcons);
  }
  updateUI();
}

function renderAtFeedback(ctx,W,H){
  ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
  var msg=at.tutFeedbackMsg||(at.tutFeedbackOk?'对，再试一个':'哦，不对');
  var color='#fff';
  var bw=440,bh=88,bx=W/2-bw/2,by=H/2-70;
  drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=color;ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(msg,W/2,by+bh/2-15);
  ctx.textBaseline='alphabetic';ctx.textAlign='start';
  var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
  drawGoldButton(ctx,btnX,btnY,btnW,btnH,'继续',18);
  at._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
}

function renderAttention(){
  var c=document.getElementById('cognitive-canvas');
  if(!c||c.style.display==='none'||!at||at.phase==='idle')return;
  if(window.__cogModule!=='attention')return;
  var ctx=c.getContext('2d'),W=c.width,H=c.height;

  ctx.fillStyle='#1a1a2e';
  ctx.fillRect(0,0,W,H);

  if(at.phase==='ready')renderReady(ctx,W,H);
  else if(at.phase==='ready_start')renderReadyStart(ctx,W,H);
  else if(at.phase==='tutorial_feedback')renderAtFeedback(ctx,W,H);
  else if(at.phase==='tutorial_text')renderTutText(ctx,W,H);
  else if(at.phase==='ready_game')renderReadyGame(ctx,W,H);
  else if(at.phase==='done')renderDone(ctx,W,H);
  else renderGame(ctx,W,H);
}

function drawTitle(ctx,W,text,subtitle){
  ctx.fillStyle='#fff';
  ctx.font='bold 38px sans-serif';
  ctx.textAlign='center';
  ctx.fillText(text,W/2,H?null:null);
  if(subtitle){
    ctx.font='18px sans-serif';
    ctx.fillStyle='#bdc3c7';
    ctx.fillText(subtitle,W/2,parseInt(H/2-95));
  }
  ctx.textAlign='start';
}

function drawGoldButton(ctx,x,y,w,h,label,textSize){
  drawRR(ctx,x,y,w,h,12);
  ctx.fillStyle=GOLD;
  ctx.globalAlpha=.28;
  ctx.fill();
  ctx.globalAlpha=1;
  ctx.strokeStyle=GOLD;
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.fillStyle=GOLD;
  ctx.font='bold '+(textSize||18)+'px sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(label,x+w/2,y+h/2);
  ctx.textBaseline='alphabetic';
  ctx.textAlign='start';
}

function renderReady(ctx,W,H){
  ctx.fillStyle='#fff';
  ctx.font='bold 40px sans-serif';
  ctx.textAlign='center';
  ctx.fillText('注意力测试',W/2,H/2-150);
  var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
  drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('考验你能否快速找出差异的能力',W/2,byBox+27);ctx.fillText('分数越高代表你观察细节的能力越强',W/2,byBox+50);
  ctx.textBaseline='alphabetic';ctx.textAlign='start';

  var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
  drawGoldButton(ctx,bx,by,bw,bh,'开始教程',20);
  at._rb={x:bx,y:by,w:bw,h:bh};
}

function renderReadyStart(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('注意力测试',W/2,H/2-150);
    var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-80;
    drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('考验你能否快速找出差异的能力',W/2,byBox+35);ctx.fillText('分数越高代表你观察细节的能力越强',W/2,byBox+65);
    ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
    drawGoldButton(ctx,bx,by,bw,bh,'开始',20);
    at._rsb={x:bx,y:by,w:bw,h:bh};
  }
  function renderTutText(ctx,W,H){
  var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-50;
  drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('判断盒子内的物体是否完全相同',W/2,byBox+34);
  ctx.textBaseline='alphabetic';ctx.textAlign='start';

  var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
  drawGoldButton(ctx,bx,by,bw,bh,'继续',18);
  at._tb={x:bx,y:by,w:bw,h:bh};
}

function renderReadyGame(ctx,W,H){
  var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-50;
  drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('对就是这样，现在正式开始吧',W/2,byBox+34);
  ctx.textBaseline='alphabetic';ctx.textAlign='start';

  var bw=180,bh=50,bx=W/2-bw/2,by=byBox+bhBox+10;
  drawGoldButton(ctx,bx,by,bw,bh,'开始游戏',20);
  at._rgb={x:bx,y:by,w:bw,h:bh};
}

function renderDone(ctx,W,H){
  ctx.fillStyle='#fff';
  ctx.font='bold 40px sans-serif';
  ctx.textAlign='center';
  ctx.fillText('注意力测试',W/2,H/2-160);
  ctx.font='20px sans-serif';
  ctx.fillStyle='#bdc3c7';
  ctx.fillText('当前测试结束',W/2,H/2-118);
  ctx.textAlign='start';

  // 4 行数据卡: 总题量 / 正确 / 错误 / 得分
  var trials=at.trials||0, correct=at.score||0, wrong=Math.max(0,trials-correct);
  var compRate=at.completionRate||(window.__scoring?window.__scoring.computeCompletionRate(trials,window.__scoring.BASELINE.attention):0.5);
  var finalScore=Math.min(150,Math.max(5,Math.round(compRate*(trials>0?correct/trials:0)*150)));
  var cardW=440,cardH=130,cardX=W/2-cardW/2,cardY=H/2-80;
  drawRR(ctx,cardX,cardY,cardW,cardH,12);
  ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fill();
  ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
  var colW=cardW/4,rowY=cardY+45;
  var labels=['总题量','正确','错误','得分'];
  var values=[trials+'',correct+'',wrong+'',finalScore+''];
  var colors=['#fff','#4CAF50','#F44336',GOLD];
  for(var i=0;i<4;i++){
    var cx=cardX+colW*i+colW/2;
    ctx.fillStyle=colors[i];ctx.font='bold 30px sans-serif';ctx.textAlign='center';
    ctx.fillText(values[i],cx,rowY);
    ctx.fillStyle='#aaa';ctx.font='14px sans-serif';
    ctx.fillText(labels[i],cx,rowY+32);
  }
  ctx.textAlign='start';

  var bw2=160,bh2=48,by2=cardY+cardH+25,bx1=W/2-bw2-20,bx2=W/2+20;
  drawGoldButton(ctx,bx1,by2,bw2,bh2,'重新开始',18);
  drawGoldButton(ctx,bx2,by2,bw2,bh2,'下一项测试',18);
  at._db1={x:bx1,y:by2,w:bw2,h:bh2};at._db2={x:bx2,y:by2,w:bw2,h:bh2};
}

function drawBox(ctx,bx,by,alpha){
  alpha=alpha===undefined?1:alpha;
  drawRR(ctx,bx,by,BOX_W,BOX_H,10);
  ctx.globalAlpha=Math.max(0,alpha);
  ctx.fillStyle='rgba(20,30,50,0.7)';
  ctx.fill();
  ctx.strokeStyle=GOLD;
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.globalAlpha=1;
}

function drawIcon(ctx,idx,col,row,ox,oy){
  var gold=goldIcons[idx];
  if(!gold)return false;
  var x=ox+col*CELL+ICON_PAD;
  var y=oy+row*CELL+ICON_PAD;
  ctx.drawImage(gold,x,y,ICON_SIZE,ICON_SIZE);
  return true;
}

function renderGame(ctx,W,H){
  if(at.feedbackText&&performance.now()-at.feedbackT>at.feedbackDur){
    at.feedbackText='';
  }

  // 关键设计: box merge — 答完两框向中心收敛重叠
  // 静止时 gap=40 (两框分开); 答完动画 gap 从 40 收到 -100 (重叠 100px 做对比)
  var baseGap=40;
  var overlapGap=-BOX_W;
  var gap=at.animating
    ?baseGap+(overlapGap-baseGap)*at.animProgress
    :baseGap;
  var boxY=H/2-BOX_H/2-30;
  var centerX=W/2;
  // 正确锚定: 总宽 = 2*BOX_W + gap, 中心对称
  var leftX=centerX-BOX_W-gap/2;
  var rightX=centerX+gap/2;

	// 右框: 动画时随重叠进度隐退,留一框作底,两套图标同框对比
	var rBoxAlpha=at.animating?Math.max(0,1-at.animProgress):1;

  // 标题
  if(at.phase==='playing'){
    var left=Math.max(0,Math.ceil((at.gameEndTime-Date.now())/1000));
    var min=Math.floor(left/60),sec=left%60;
    var timeStr=min+':'+(sec<10?'0':'')+sec;
    // 倒计时归零 → 切换为 done
    if(left<=0){at.phase='done';at.completionRate=window.__scoring?window.__scoring.computeCompletionRate(at.trials,window.__scoring.BASELINE.attention):0.5;updateUI();return;}

    ctx.fillStyle='#fff';
    ctx.font='bold 18px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('两侧相同吗？',W/2,boxY-50);
    ctx.font='14px sans-serif';
    ctx.fillStyle='#bdc3c7';
    ctx.fillText('倒计时 '+timeStr,W/2,boxY-28);
    ctx.textAlign='start';
  }else{
    ctx.fillStyle='#fff';
    ctx.font='bold 18px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('两侧相同吗？',W/2,boxY-30);
    ctx.textAlign='start';
  }

  drawBox(ctx,leftX,boxY);
  drawBox(ctx,rightX,boxY,rBoxAlpha);

  var n=at.icons.length;
  var leftMissing=false,rightMissing=false;
  for(var i=0;i<n;i++){
    var cell=at.cells[i];
    var lIcon=at.icons[i];
    var rIcon=at.icons[i];
    if(!at.isSame){
      var dIdx=at.diffIdxs.indexOf(i);
      if(dIdx!==-1)rIcon=at.diffIcons[dIdx];
    }
    if(!drawIcon(ctx,lIcon,cell.c,cell.r,leftX,boxY))leftMissing=true;
    if(!drawIcon(ctx,rIcon,cell.c,cell.r,rightX,boxY))rightMissing=true;
  }

  // 反馈文字 (在合并动画过程中显示)
  if(at.feedbackText){
    ctx.font='bold 30px sans-serif';
    ctx.fillStyle=at.feedbackColor;
    ctx.textAlign='center';
    ctx.fillText(at.feedbackText,W/2,H/2);
    ctx.textAlign='start';
  }

  if(leftMissing||rightMissing){
    ctx.font='bold 14px sans-serif';
    ctx.fillStyle='#ff6b6b';
    ctx.textAlign='center';
    ctx.fillText('图标加载中...',W/2,boxY+BOX_H+30);
    ctx.textAlign='start';
  }

  // 选项按钮一直显示

    var btnW=130,btnH=50;
    var btnY=boxY+BOX_H+55;
    var sameX=W/2-btnW-15;
    var diffX=W/2+15;
    drawGoldButton(ctx,sameX,btnY,btnW,btnH,'相同',20);
    drawGoldButton(ctx,diffX,btnY,btnW,btnH,'不同',20);
    at._sameBtn={x:sameX,y:btnY,w:btnW,h:btnH};
    at._diffBtn={x:diffX,y:btnY,w:btnW,h:btnH};

}

function pointInRect(mx,my,r){return mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}

function handleClick(ex,ey){
  var c=document.getElementById('cognitive-canvas');
  if(!c||c.style.display==='none')return false;
  if(window.__cogModule!=='attention')return false;
  var rect=c.getBoundingClientRect();
  var mx=(ex-rect.left)*(c.width/rect.width);
  var my=(ey-rect.top)*(c.height/rect.height);

  if(at.phase==='ready'&&at._rb&&pointInRect(mx,my,at._rb)){at.startTutorial();return true;}
  if(at.phase==='tutorial_feedback'&&at._fbBtn&&pointInRect(mx,my,at._fbBtn)){
    var atWasOk=at.tutFeedbackOk;
    if(atWasOk){at.tutStep++;if(at.tutStep>2){at.showReadyGame();return true;}genTrial(at.tutStep===1?3:4);}
    at.phase='tutorial';at.tutFeedbackMsg='';at._answerLocked=false;updateUI();return true;
  }
  if(at.phase==='tutorial_text'&&at._tb&&pointInRect(mx,my,at._tb)){startTut1();return true;}
  if(at.phase==='ready_game'&&at._rgb&&pointInRect(mx,my,at._rgb)){at.showReadyStart();return true;}
  if(at.phase==='ready_start'&&at._rsb&&pointInRect(mx,my,at._rsb)){startPlaying();return true;}
  if(at.phase==='done'&&at._db1&&pointInRect(mx,my,at._db1)){at.showReadyStart();return true;}
  if(at.phase==='done'&&at._db2&&pointInRect(mx,my,at._db2)){window._nextModule("attention");return true;}

  if((at.phase==='tutorial'||at.phase==='playing')&&!at.animating){
    if(at._sameBtn&&pointInRect(mx,my,at._sameBtn)){handleAnswer(true);return true;}
    if(at._diffBtn&&pointInRect(mx,my,at._diffBtn)){handleAnswer(false);return true;}
  }
  return false;
}

setTimeout(function(){
  document.querySelectorAll('.cog-mod-btn').forEach(function(btn){
    if(btn.dataset.mod==='attention'){
      var fresh=btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh,btn);
      fresh.addEventListener('click',function(){
        document.querySelectorAll('.cog-mod-btn').forEach(function(b){
          b.classList.remove('active');
          if(b.style){b.style.background='';b.style.color='';}
        });
        fresh.classList.add('active');
        if(fresh.style){fresh.style.background='var(--primary)';fresh.style.color='var(--bg-dark)';}
        window.__cogModule='attention';
        if(window._showCognitive)window._showCognitive();
        var pi=document.getElementById('cog-panel-planning');
        var ii=document.getElementById('cog-panel-inhibition');
        if(pi)pi.style.display='none';
        if(ii)ii.style.display='block';
        at.showReady();
      });
    }
  });
},600);

(function loop(){
  // 驱动合并动画
  if(at.animating){
    var elapsed=performance.now()-at.animStart;
    if(at.animPhase==='merge'){
      at.animProgress=Math.min(1,elapsed/ANIM_MOVE_MS);
      if(at.animProgress>=1){
        at.animPhase='hold';
        at.animStart=performance.now();
      }
    }else if(at.animPhase==='hold'){
      if(elapsed>=ANIM_HOLD_MS){
        at.animating=false;
        at.animPhase='idle';
        at.animProgress=0;
        at._answerLocked=false;
        if(at.phase==='tutorial'){
          if(at.tutStep>=2&&at.tutFeedbackOk){at.showReadyGame();}else{at.phase='tutorial_feedback';}
        }else if(at.phase==='playing'){
          at._flashCorrect=at.lastAnswer===at.isSame;
          at._flashT=performance.now();
          var delay=at.consecutiveCorrect>=2?FB_SHORT_MS:FB_PLAYING_MS;
          setTimeout(function(){
            genTrial(at.totalIcons);
            at._flashCorrect=null;
            updateUI();
          },delay);
        }
        updateUI();
      }
    }
  }
  renderAttention();requestAnimationFrame(loop);
})();
(function(){
  var prev=window._handleCogClick;
  window._handleCogClick=function(ex,ey){
    if(window.__cogModule==='attention'&&handleClick(ex,ey))return true;
    if(prev)return prev(ex,ey);
    return false;
  };
})();
})();
