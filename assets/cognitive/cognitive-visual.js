// 模块1: 视觉记忆与提取能力 — 空间位置记忆
(function(){
var GOLD='#C9A84C',INITIAL_DIGITS=5,MAX_LIVES=3,GRID=6,CELL=70,GAP=4;

var vm=window.__visual={
    phase:'idle',digits:0,positions:[],order:[],
    userOrder:[],showTimer:0,displayPhase:'idle',
    lives:MAX_LIVES,digitCount:INITIAL_DIGITS,peakDigits:INITIAL_DIGITS,correct:0,wrong:0,trials:0,
    tutStep:0,tutBlockIdx:0,tutClicked:false,
    };


function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.05);o.frequency.setValueAtTime(2000,t+.1);g.gain.setValueAtTime(.1,t);g.gain.setValueAtTime(.1,t+.1);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.3);}catch(e){}}
function playError(){try{var a2=new(window.AudioContext||window.webkitAudioContext)(),t2=a2.currentTime,o2=a2.createOscillator(),g2=a2.createGain();o2.connect(g2);g2.connect(a2.destination);o2.type='square';o2.frequency.setValueAtTime(200,t2);o2.frequency.linearRampToValueAtTime(100,t2+.25);g2.gain.setValueAtTime(.15,t2);g2.gain.exponentialRampToValueAtTime(.001,t2+.3);o2.start(t2);o2.stop(t2+.3);}catch(e){}}

function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

function genPositions(n){
    var cells=[];for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)cells.push({r:r,c:c});
    for(var i=cells.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t2=cells[i];cells[i]=cells[j];cells[j]=t2;}
    return cells.slice(0,n);
}
function gridOffset(W,H,extraY){var gw=GRID*(CELL+GAP)-GAP,gh=gw;return{x:W/2-gw/2,y:H/2-gh/2-20+(extraY||0)};}
function cellXY(off,r,c){return{x:off.x+c*(CELL+GAP),y:off.y+r*(CELL+GAP)};}

function updateUI(){
    var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
    if(st){if(vm.phase==='ready')st.textContent='视觉记忆与提取能力';else if(vm.phase==='tutorial_text')st.textContent='游戏规则';else if(vm.phase==='tutorial_1')st.textContent='教程 (1/2)';else if(vm.phase==='tutorial_2')st.textContent='教程 (2/2)';else if(vm.phase==='ready_game')st.textContent='准备开始';else if(vm.phase==='playing')st.textContent='';else if(vm.phase==='done')st.textContent='';}
    if(sc)sc.textContent=vm.phase==='playing'?'正确:'+vm.correct+'/'+vm.trials:'';
}

vm.showReady=function(){vm.phase='ready';updateUI();};
vm.startTutorial=function(){vm.phase='tutorial_text';updateUI();};

function startTut1(){
    vm.phase='tutorial_1';vm.digits=2;vm.positions=genPositions(2);vm.order=[1,2];vm.userOrder=[];vm.tutStep=0;vm.tutBlockIdx=0;vm.displayPhase='finger1';vm.showTimer=0;updateUI();
}
function startTut2(){
    vm.phase='tutorial_2';vm.digits=3;vm.positions=genPositions(3);vm.order=[];for(var i=1;i<=3;i++)vm.order.push(i);vm.userOrder=[];vm.displayPhase='showing';vm.showTimer=performance.now();vm.tutBlockIdx=0;updateUI();
}
vm.showReadyGame=function(){vm.phase='ready_game';updateUI();};
vm.showReadyStart=function(){vm.phase='ready_start';updateUI();};

function startPlaying(){
    vm.phase='playing';vm.trials=0;vm.correct=0;vm.wrong=0;vm.lives=MAX_LIVES;vm.digitCount=INITIAL_DIGITS;vm.peakDigits=INITIAL_DIGITS;startTrial();updateUI();
}
function startTrial(){
    vm.digits=vm.digitCount;vm.positions=genPositions(vm.digits);vm.order=[];for(var i=1;i<=vm.digits;i++)vm.order.push(i);vm.userOrder=[];vm.displayPhase='showing';vm.showTimer=performance.now();
}

function clickCell(r,c){
    if(vm.phase==='tutorial_1'){
        if(vm.displayPhase==='finger1'&&vm.tutBlockIdx===0){var p=vm.positions[0];if(r===p.r&&c===p.c){vm.tutBlockIdx=1;vm.displayPhase='finger2';vm.userOrder=[];playCoin();updateUI();}}
        else if(vm.displayPhase==='finger2'&&vm.tutBlockIdx===1){var p2=vm.positions[1];if(r===p2.r&&c===p2.c){playCoin();vm.tutFeedbackOk=true;vm.tutFeedbackMsg='对，非常好，接下来将逐渐移除半透明的提示，你需要自己记住数字的位置';vm._feedbackAction='tut1';vm.phase='tutorial_feedback';updateUI();}}
    }else if(vm.phase==='tutorial_2'&&vm.displayPhase==='input'){
        handleGameClick(r,c);
    }else if(vm.phase==='playing'&&vm.displayPhase==='input'){
        handleGameClick(r,c);
    }
}

function handleGameClick(r,c){
    var hit=false;
    for(var i=0;i<vm.positions.length;i++){var p=vm.positions[i];if(r===p.r&&c===p.c){hit=true;var num=i+1;if(num===vm.order[vm.userOrder.length]){vm.userOrder.push(num);playCoin();if(vm.userOrder.length>=vm.order.length){checkAnswer();}return;}else{break;}}}
    // 点错或点空白
    vm.userOrder=[];vm.trials++;vm.wrong++;playError();
    if(vm.phase==='tutorial_2'){vm.userOrder=[];return;}
    if(vm.phase==='playing'){vm.lives--;if(vm.lives<=0){vm.digitCount=vm.peakDigits;vm.phase='done';updateUI();return;}vm.digitCount=Math.max(2,vm.digitCount-1);setTimeout(function(){startTrial();updateUI();},800);return;}
}

function checkAnswer(){
    vm.trials++;vm.correct++;
    if(vm.phase==='tutorial_2'){
        vm.showReadyGame();
        return;
    }
    setTimeout(function(){vm.digitCount++;if(vm.digitCount>vm.peakDigits)vm.peakDigits=vm.digitCount;startTrial();updateUI();},1200);
}

function renderVisFB(ctx,W,H){
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
    var msg=vm.tutFeedbackMsg||(vm.tutFeedbackOk?'对，非常好':'哦，不对');
    var color=vm.tutFeedbackOk?'#fff':'#F44336';
    var bw=660,bh=180,bx=W/2-bw/2,by=H/2-90;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=color;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(msg,W/2,by+bh/2);
    ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
    drawRR(ctx,btnX,btnY,btnW,btnH,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',btnX+btnW/2,btnY+btnH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    vm._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
}

function renderVisual(){
    var c=document.getElementById('cognitive-canvas');if(!c||c.style.display==='none'||!vm||vm.phase==='idle')return;
    if(window.__cogModule!=='visual')return;
    var ctx=c.getContext('2d'),W=c.width,H=c.height;
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);if(vm.feedbackImg&&pandaImg&&performance.now()-vm.feedbackT<1000){ctx.globalAlpha=0.9;ctx.drawImage(pandaImg,W/2-80,H/2-80,160,160);ctx.globalAlpha=1;}

    if(vm.phase==='ready')renderVisReady(ctx,W,H);
    else if(vm.phase==='ready_start')renderVisReadyStart(ctx,W,H);
    else if(vm.phase==='tutorial_feedback')renderVisFB(ctx,W,H);
    else if(vm.phase==='tutorial_text')renderVisTutorial(ctx,W,H);
    else if(vm.phase==='ready_game')renderVisReadyGame(ctx,W,H);
    else if(vm.phase==='done')renderVisDone(ctx,W,H);
    else renderVisGame(ctx,W,H);
}

function renderVisReady(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('视觉记忆与提取能力',W/2,H/2-130);ctx.textAlign='start';
    var t1='考验你记住复杂位置的能力',t2='分数越高代表着你空间感越好';
    ctx.font='bold 18px sans-serif';var bw=440,bh=88,bx=W/2-bw/2,by=H/2-70;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t1,W/2,by+40);ctx.fillText(t2,W/2,by+68);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=160,bh2=48,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始教程',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    vm._rb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderVisReadyStart(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('视觉记忆与提取能力',W/2,H/2-150);
    var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
    drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('考验你记住复杂位置的能力',W/2,byBox+27);ctx.fillText('分数越高代表着你空间感越好',W/2,byBox+50);
    ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw=160,bh=48,bx=W/2-bw/2,by=byBox+bhBox+10;
    drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    vm._rsb={x:bx,y:by,w:bw,h:bh};
}

function renderVisTutorial(ctx,W,H){
    var t='记住那些数字的位置，按照1234这样的顺序，依次点击那些方块';
    ctx.font='bold 18px sans-serif';var bw=440,bh=76,bx=W/2-bw/2,by=H/2-65;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,by+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=140,bh2=44,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    vm._tb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderVisReadyGame(ctx,W,H){
    var t='对就是这样，现在正式开始游戏吧';ctx.font='bold 22px sans-serif';var tw=ctx.measureText(t).width;
    var bw=tw+120,bh=76,bx=W/2-bw/2,by=H/2-65;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,by+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=160,bh2=44,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始游戏',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    vm._rgb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderVisDone(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('视觉记忆与提取能力',W/2,H/2-130);ctx.textAlign='start';
    ctx.font='bold 22px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-70);ctx.textAlign='start';
    var bw2=160,bh2=48,by2=H/2,bx1=W/2-bw2-20,bx2=W/2+20;
    drawRR(ctx,bx1,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    vm._db1={x:bx1,y:by2,w:bw2,h:bh2};vm._db2={x:bx2,y:by2,w:bw2,h:bh2};
}

function renderVisGame(ctx,W,H){
    var n2=performance.now(),off=gridOffset(W,H,vm.phase==='playing'?50:0);
    // 标题/爱心
    if(vm.phase==='playing'||vm.phase==='tutorial_2'){
        if(vm.phase==='playing'){
            ctx.font='bold 14px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('剩余尝试次数',W/2,off.y-85);ctx.textAlign='start';
            var h='';for(var li=0;li<MAX_LIVES;li++)h+=li<vm.lives?'❤️':'🖤';
            ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(h,W/2,off.y-60);ctx.textAlign='start';
            ctx.fillStyle='#888';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(vm.correct+'/'+vm.trials,W/2,25);ctx.textAlign='start';
        }
    }
    // 教程1: 手指动画
    if(vm.phase==='tutorial_1'){
        ctx.font='bold 24px sans-serif';ctx.fillStyle='#FF9800';ctx.textAlign='center';ctx.fillText('从小到大依次点击数字',W/2,off.y-70);ctx.textAlign='start';
    }
    // 教程2 / 正式: 标题
    if(vm.phase==='tutorial_2'||vm.phase==='playing'){
        if(vm.displayPhase==='showing'){ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText('记住数字的顺序',W/2,off.y-15+((vm.phase==='playing')?0:0));ctx.textAlign='start';}
    }
    // 大方框 (6×6 无内格线)
    var gs=GRID*(CELL+GAP)-GAP;drawRR(ctx,off.x,off.y,gs,gs,10);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    // 画数字方块
    var showNums=(vm.displayPhase==='showing'||vm.displayPhase==='finger1'||vm.displayPhase==='finger2'||(vm.phase==='tutorial_1'&&vm.displayPhase==='tut1_done_msg'));
    for(var i=0;i<vm.positions.length;i++){
        var pos=vm.positions[i],cp=cellXY(off,pos.r,pos.c);
        var isClicked=vm.userOrder.indexOf(i+1)>=0;
        if(isClicked)continue; // 已点的消失
        var num=i+1,isCurTarget=vm.userOrder.length===i;
        // 方块背景 (橙色, 比格子略小)
        var pad=8;
        drawRR(ctx,cp.x+pad,cp.y+pad,CELL-pad*2,CELL-pad*2,5);
        ctx.fillStyle=showNums?'#FF9800':'rgba(255,152,0,0.3)';
        ctx.fill();ctx.strokeStyle='#FF9800';ctx.lineWidth=2;ctx.stroke();
        // 数字
        if(showNums){ctx.fillStyle='#fff';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(num,cp.x+CELL/2,cp.y+CELL/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';}
        // 手指 (教程1)
        if(vm.phase==='tutorial_1'){if((vm.displayPhase==='finger1'&&i===0)||(vm.displayPhase==='finger2'&&i===1)){ctx.font='bold 48px sans-serif';ctx.fillStyle='#FF9800';ctx.textAlign='right';ctx.fillText('☝',cp.x-8,cp.y+CELL/2+16);ctx.textAlign='start';ctx.font='bold 20px sans-serif';ctx.fillText('点击这里',cp.x-8,cp.y+CELL/2+46);}}
    }
    // 教程1完成消息
    if(vm.phase==='tutorial_1'&&vm.displayPhase==='tut1_done_msg'){ctx.font='bold 20px sans-serif';ctx.fillStyle='#4CAF50';ctx.textAlign='center';var tMsg=n2-vm.showTimer<3000?'对，非常好，接下来将逐渐移除半透明的提示，你需要自己记住数字的位置':'';ctx.fillText(tMsg,W/2,H-60);ctx.textAlign='start';if(n2-vm.showTimer>3000){startTut2();updateUI();}}
    // 教程2 / 正式: 提示 + 显示计时
    if(vm.phase==='tutorial_2'||vm.phase==='playing'){
        if(vm.displayPhase==='showing'){var elapsed=n2-vm.showTimer,showMs=vm.digitCount*1000;if(elapsed>showMs){vm.displayPhase='input';}ctx.font='bold 18px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('记住数字的顺序，在隐藏后按照顺序点击',W/2,off.y+GRID*(CELL+GAP)+20);ctx.textAlign='start';}
        if(vm.displayPhase==='input'){ctx.font='bold 18px sans-serif';ctx.fillStyle='#FF9800';ctx.textAlign='center';ctx.fillText('请按顺序点击方块',W/2,off.y+GRID*(CELL+GAP)+20);ctx.textAlign='start';}
        if(vm.displayPhase==='result'){var fb=n2-vm.showTimer<1200?(vm.userOrder.length===vm.order.length?'✓ 正确':'✗ 错误'):'';ctx.font='bold 24px sans-serif';ctx.fillStyle=vm.userOrder.length===vm.order.length?'#4CAF50':'#F44336';ctx.textAlign='center';ctx.fillText(fb,W/2,off.y+GRID*(CELL+GAP)+20);ctx.textAlign='start';}
    }
}

function handleClick(ex,ey){
    var c2=document.getElementById('cognitive-canvas');if(!c2||c2.style.display==='none')return false;
    if(window.__cogModule!=='visual')return false;
    var rect=c2.getBoundingClientRect();if(!rect)return false;
    var mx=(ex-rect.left)*(c2.width/rect.width),my=(ey-rect.top)*(c2.height/rect.height),W=c2.width,H=c2.height;
    // screen buttons
    if(vm.phase==='ready'&&vm._rb){var rb=vm._rb;if(mx>=rb.x&&mx<=rb.x+rb.w&&my>=rb.y&&my<=rb.y+rb.h){vm.startTutorial();return true;}return false;}
    if(vm.phase==='tutorial_text'&&vm._tb){var tb=vm._tb;if(mx>=tb.x&&mx<=tb.x+tb.w&&my>=tb.y&&my<=tb.y+tb.h){startTut1();return true;}return false;}
    if(vm.phase==='tutorial_feedback'&&vm._fbBtn){var fb=vm._fbBtn;if(mx>=fb.x&&mx<=fb.x+fb.w&&my>=fb.y&&my<=fb.y+fb.h){if(vm.tutFeedbackOk){if(vm._feedbackAction==='tut1'){startTut2();}else{vm.showReadyGame();}}else{startTut2();}return true;}return false;}
    if(vm.phase==='ready_game'&&vm._rgb){var rgb=vm._rgb;if(mx>=rgb.x&&mx<=rgb.x+rgb.w&&my>=rgb.y&&my<=rgb.y+rgb.h){vm.showReadyStart();return true;}return false;}
    if(vm.phase==='ready_start'&&vm._rsb){var rsb=vm._rsb;if(mx>=rsb.x&&mx<=rsb.x+rsb.w&&my>=rsb.y&&my<=rsb.y+rsb.h){startPlaying();return true;}return false;}
    if(vm.phase==='done'){if(vm._db1&&mx>=vm._db1.x&&mx<=vm._db1.x+vm._db1.w&&my>=vm._db1.y&&my<=vm._db1.y+vm._db1.h){vm.showReadyStart();return true;}if(vm._db2&&mx>=vm._db2.x&&mx<=vm._db2.x+vm._db2.w&&my>=vm._db2.y&&my<=vm._db2.y+vm._db2.h){window._nextModule("visual");return true;}return false;}
    // grid clicks
    if(vm.phase==='tutorial_1'||vm.phase==='tutorial_2'||vm.phase==='playing'){
        var off=gridOffset(W,H,vm.phase==='playing'?50:0);
        for(var r=0;r<GRID;r++){for(var c2=0;c2<GRID;c2++){var cp=cellXY(off,r,c2);if(mx>=cp.x&&mx<=cp.x+CELL&&my>=cp.y&&my<=cp.y+CELL){clickCell(r,c2);return true;}}}
    }
    return false;
}

// init
setTimeout(function(){
    document.querySelectorAll('.cog-mod-btn').forEach(function(btn){if(btn.dataset.mod==='visual'){btn.addEventListener('click',function(){document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');b.style.background='transparent';b.style.color='var(--text)';});btn.classList.add('active');btn.style.background='var(--primary)';btn.style.color='var(--bg-dark)';window.__cogModule='visual';document.getElementById('cog-panel-planning').style.display='none';document.getElementById('cog-panel-inhibition').style.display='block';vm.showReady();});}});
},600);

(function loop(){renderVisual();requestAnimationFrame(loop);})();
(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='visual'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();

})();
