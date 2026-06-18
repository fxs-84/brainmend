// 模块5: 文字记忆能力 — 数字广度测验
(function(){
var GOLD = '#C9A84C';var ORANGE='#FF9800';
var INITIAL_DIGITS = 6;
var MAX_LIVES = 3;

var mem = window.__memory = {
    phase: 'idle',
    tutRound: 0,
    digits: [], userInput: [],
    displayPhase: 'idle',
    showTimer: 0, revealed: false,
    lives: MAX_LIVES, digitCount: INITIAL_DIGITS, peakDigits: INITIAL_DIGITS,
    correct: 0, wrong: 0, trials: 0,
    feedback: '', feedbackT: 0
};

function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.05);o.frequency.setValueAtTime(2000,t+.1);g.gain.setValueAtTime(.1,t);g.gain.setValueAtTime(.1,t+.1);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.3);}catch(e){}}
function playError(){ try{var a2=new(window.AudioContext||window.webkitAudioContext)(),o2=a2.createOscillator(),g2=a2.createGain();o2.connect(g2);g2.connect(a2.destination);o2.type='square';o2.frequency.setValueAtTime(200,a2.currentTime);o2.frequency.linearRampToValueAtTime(100,a2.currentTime+.25);g2.gain.setValueAtTime(.15,a2.currentTime);g2.gain.exponentialRampToValueAtTime(.001,a2.currentTime+.3);o2.start(a2.currentTime);o2.stop(a2.currentTime+.3);}catch(e){}}function playClick(){try{var a3=new(window.AudioContext||window.webkitAudioContext)(),t3=a3.currentTime,o3=a3.createOscillator(),g3=a3.createGain();o3.connect(g3);g3.connect(a3.destination);o3.type='sine';o3.frequency.setValueAtTime(800,t3);g3.gain.setValueAtTime(.08,t3);g3.gain.exponentialRampToValueAtTime(.001,t3+.06);o3.start(t3);o3.stop(t3+.08);}catch(e){}}

function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
function genDigits(n){ var d=[]; for(var i=0;i<n;i++){ var v=Math.floor(Math.random()*10); while(i>0&&v===d[i-1])v=Math.floor(Math.random()*10); d.push(v); } return d; }

function updateUI(){
    var st=document.getElementById('stroop-status'), sc=document.getElementById('stroop-score');
    if(st){ if(mem.phase==='idle')st.textContent=''; else if(mem.phase==='ready')st.textContent='文字记忆能力';
        else if(mem.phase==='tutorial_text')st.textContent='游戏规则';
        else if(mem.phase==='tutorial_play')st.textContent='教程 ('+mem.tutRound+'/3)';
        else if(mem.phase==='ready_game')st.textContent='准备开始';
        else if(mem.phase==='playing')st.textContent='';
        else if(mem.phase==='done')st.textContent='正确率 '+(mem.trials>0?Math.round(mem.correct/mem.trials*100):0)+'%';
    }
    if(sc)sc.textContent='正确: '+mem.correct+'/'+mem.trials;
}

mem.showReady=function(){mem.phase='ready';updateUI();};
mem.startTutorial=function(){mem.phase='tutorial_text';updateUI();};
mem.startTutorialPlay=function(){
    mem.phase='tutorial_play';mem.tutRound=1;mem.digits=genDigits(4);mem.userInput=[];
    mem.displayPhase='ready_countdown';mem.showTimer=performance.now();mem.revealed=false;mem.lastClickT=0;updateUI();
};
mem.showReadyGame=function(){mem.phase='ready_game';updateUI();};
mem.showReadyStart=function(){mem.phase='ready_start';updateUI();};

function startPlaying(){
    mem.phase='playing';mem.trials=0;mem.correct=0;mem.wrong=0;mem.lives=MAX_LIVES;mem.digitCount=INITIAL_DIGITS;mem.peakDigits=INITIAL_DIGITS;mem.feedback='';
    startTrial();updateUI();
}
function startTrial(){
    mem.digits=genDigits(mem.digitCount);mem.userInput=[];mem.displayPhase='ready_countdown';
    mem.showTimer=performance.now();mem.revealed=false;mem.feedback='';mem.lastClickT=0;
}
function clickDigit(d){
    if((mem.phase==='playing'||mem.phase==='tutorial_play')&&(mem.displayPhase==='input'||mem.displayPhase==='revealed')){
        mem.userInput.push(d);playClick();var pos=mem.userInput.length-1;if(d!==mem.digits[pos]){checkAnswer();}else if(mem.userInput.length>=mem.digits.length)checkAnswer();
    }
}
function checkAnswer(){
    var ok=true;for(var i=0;i<mem.digits.length;i++){if(mem.userInput[i]!==mem.digits[i]){ok=false;break;}}
    mem.trials++;
    if(ok){mem.correct++;playCoin();mem.displayPhase='result';mem.feedback='correct';mem.feedbackT=performance.now();}
    else{mem.wrong++;playError();mem.displayPhase='result';mem.feedback='wrong';mem.feedbackT=performance.now();}
    if(mem.phase==='tutorial_play'){
        setTimeout(function(){
	            if(ok){if(mem.tutRound>=3){mem.showReadyGame();return;}mem.tutFeedbackOk=true;mem.tutFeedbackMsg='对，再试一个';mem.phase='tutorial_feedback';mem._pendingOk=true;updateUI();return;}
            else{mem.tutFeedbackOk=false;mem.tutFeedbackMsg='哦，不对';mem.phase='tutorial_feedback';mem._pendingOk=false;updateUI();return;}
        },ok?500:300);
    }else{
        setTimeout(function(){
            if(ok){mem.digitCount++;if(mem.digitCount>mem.peakDigits)mem.peakDigits=mem.digitCount;}
            else{mem.lives--;if(mem.lives<=0){mem.digitCount=mem.peakDigits;mem.phase='done';updateUI();return;}mem.digitCount=Math.max(3,mem.digitCount-1);}
            startTrial();updateUI();
        },1200);
    }
}

function renderMemFB(ctx,W,H){
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
    var msg=mem.tutFeedbackMsg||(mem.tutFeedbackOk?'对，再试一个':'哦，不对');
    var color='#fff';
    var bw=500,bh=140,bx=W/2-bw/2,by=H/2-70;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle=color;ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(msg,W/2,by+bh/2-15);
    ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
    drawRR(ctx,btnX,btnY,btnW,btnH,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',btnX+btnW/2,btnY+btnH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
}

function renderMemory(){
    var c=document.getElementById('cognitive-canvas');
    if(!c||c.style.display==='none'||!mem||mem.phase==='idle')return;
    if(window.__cogModule!=='memory')return;
    var ctx=c.getContext('2d'),W=c.width,H=c.height;
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);

    if(mem.phase==='ready')renderMemReady(ctx,W,H);
    else if(mem.phase==='ready_start')renderMemReadyStart(ctx,W,H);
    else if(mem.phase==='tutorial_feedback')renderMemFB(ctx,W,H);
    else if(mem.phase==='tutorial_text')renderMemTutorial(ctx,W,H);
    else if(mem.phase==='ready_game')renderMemReadyGame(ctx,W,H);
    else if(mem.phase==='done'){
        renderMemDone(ctx,W,H);
    }else{renderMemGame(ctx,W,H);}
}

function renderMemReady(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('文字记忆能力',W/2,H/2-130);ctx.textAlign='start';
    var t1='考验你大脑记住数字与文字的能力',t2='分数越高代表着你记忆力越强';
    ctx.font='bold 18px sans-serif';var bw=520,bh=140,bx=W/2-bw/2,by=H/2-70;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t1,W/2,by+40);ctx.fillText(t2,W/2,by+68);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=160,bh2=48,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始教程',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._rb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderMemReadyStart(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('文字记忆能力',W/2,H/2-150);
    var bwBox=520,bhBox=100,bxBox=W/2-bwBox/2,byBox=H/2-80;
    drawRR(ctx,bxBox,byBox,bwBox,bhBox,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('考验你大脑记住数字与文字的能力',W/2,byBox+35);ctx.fillText('分数越高代表着你记忆力越强',W/2,byBox+65);
    ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw=160,bh=48,bx=W/2-bw/2,by=byBox+bhBox+10;
    drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._rsb={x:bx,y:by,w:bw,h:bh};
}

function renderMemTutorial(ctx,W,H){
    var t='记住出现的数字序列，就如同记电话号码那样';
    ctx.font='bold 18px sans-serif';var bw=560,bh=120,bx=W/2-bw/2,by=H/2-65;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,by+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=140,bh2=44,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._tb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderMemReadyGame(ctx,W,H){
    var t='对就是这样，现在开始游戏吧';ctx.font='bold 22px sans-serif';var tw=ctx.measureText(t).width;
    var bw=tw+120,bh=120,bx=W/2-bw/2,by=H/2-65;
    drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,by+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=160,bh2=44,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始游戏',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._rgb={x:bx2,y:by2,w:bw2,h:bh2};
}

function renderMemGame(ctx,W,H){
    var n2=performance.now(),boxW=100,boxH=100,boxX=W/2-boxW/2,boxY=H/2-160;
    // 缓冲
    if(mem.displayPhase==='ready_countdown'){if(n2-mem.showTimer>2000){mem.displayPhase='showing';mem.showTimer=n2;}}
    // 标题 (展示阶段)
    if(mem.displayPhase==='showing'||mem.displayPhase==='ready_countdown'){
        ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText('请记住数字的顺序',W/2,boxY-40);ctx.textAlign='start';
    }
    // 爱心 (正式游戏)
    if(mem.phase==='playing'){
        ctx.font='bold 14px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('剩余尝试次数',W/2,boxY-85);ctx.textAlign='start';
        var h='';for(var li=0;li<MAX_LIVES;li++)h+=li<mem.lives?'❤️':'🖤';
        ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(h,W/2,boxY-60);ctx.textAlign='start';
    }
    // 展示完整序列 (教程1-2轮, 框上方)
    if((mem.displayPhase==='revealed'||mem.displayPhase==='input'||mem.displayPhase==='result')&&mem.phase==='tutorial_play'&&mem.tutRound<3){
        ctx.font='bold 36px sans-serif';ctx.fillStyle='#4CAF50';ctx.textAlign='center';ctx.fillText(mem.digits.join(' '),W/2,boxY-15);ctx.textAlign='start';
    }
    // 显示框
    drawRR(ctx,boxX,boxY,boxW,boxH,12);ctx.fillStyle=ORANGE;ctx.fill();ctx.strokeStyle=ORANGE;ctx.lineWidth=3;ctx.stroke();
    // 框内数字
    if(mem.displayPhase==='showing'){
        var idx=Math.floor((n2-mem.showTimer)/1000);
        if(idx>=mem.digits.length||(idx===mem.digits.length-1&&(n2-mem.showTimer)%1000>50)){mem.displayPhase=(mem.phase==='tutorial_play'&&mem.tutRound<3)?'revealed':'input';mem.showTimer=n2;}
        if(mem.displayPhase==='showing'){
            var ci=Math.min(idx,mem.digits.length-1);ctx.font='bold 52px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(mem.digits[ci],W/2,boxY+boxH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
        }
    }
    // 展示完自动进输入
    if(mem.displayPhase==='revealed'){if(n2-mem.showTimer>5000){mem.displayPhase='input';}}
    // 输入/结果
    if(mem.displayPhase==='input'||mem.displayPhase==='result'||mem.displayPhase==='revealed'){
        ctx.font='bold 16px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('请按顺序输入数字',W/2,boxY+boxH+25);ctx.textAlign='start';
        if(mem.userInput.length>0){ctx.font='bold 46px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(mem.userInput[mem.userInput.length-1],W/2,boxY+boxH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';}
    }
    // 键盘 (仅输入阶段显示)
    if(mem.displayPhase==='input'||mem.displayPhase==='revealed'){
    var kw=80,kh=52,kg=10,ky=boxY+boxH+70,cols=3,digs=[1,2,3,4,5,6,7,8,9];
    for(var k=0;k<digs.length;k++){var d=digs[k],col=k%cols,row=Math.floor(k/cols);var kx=W/2-cols*(kw+kg)/2+kg/2+col*(kw+kg),ky2=ky+row*(kh+kg);drawRR(ctx,kx,ky2,kw,kh,8);ctx.fillStyle=ORANGE;ctx.fill();ctx.strokeStyle=ORANGE;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(d,kx+kw/2,ky2+kh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';}
    var kx0=W/2-kw/2,ky0=ky+3*(kh+kg);drawRR(ctx,kx0,ky0,kw,kh,8);ctx.fillStyle=ORANGE;ctx.fill();ctx.strokeStyle=ORANGE;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('0',kx0+kw/2,ky0+kh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._kp={kw:kw,kh:kh,kg:kg,ky:ky,cols:cols,digs:digs,ky0:ky0,kx0:kx0};}
}

function renderMemDone(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('文字记忆能力',W/2,H/2-130);ctx.textAlign='start';
    ctx.font='bold 22px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-70);ctx.textAlign='start';
    var bw2=160,bh2=48,by2=H/2,bx1=W/2-bw2-20,bx2=W/2+20;
    // 重新开始
    drawRR(ctx,bx1,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    // 下一项测试
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    mem._db1={x:bx1,y:by2,w:bw2,h:bh2};mem._db2={x:bx2,y:by2,w:bw2,h:bh2};
}

function handleClick(ex,ey){
    var c2=document.getElementById('cognitive-canvas');if(!c2||c2.style.display==='none')return false;
    if(window.__cogModule!=='memory')return false;
    var rect=c2.getBoundingClientRect();if(!rect)return false;
    var mx=(ex-rect.left)*(c2.width/rect.width),my=(ey-rect.top)*(c2.height/rect.height),W=c2.width;
    if(mem.phase==='ready'&&mem._rb){var rb=mem._rb;if(mx>=rb.x&&mx<=rb.x+rb.w&&my>=rb.y&&my<=rb.y+rb.h){mem.startTutorial();return true;}return false;}
    if(mem.phase==='tutorial_text'&&mem._tb){var tb=mem._tb;if(mx>=tb.x&&mx<=tb.x+tb.w&&my>=tb.y&&my<=tb.y+tb.h){mem.startTutorialPlay();return true;}return false;}
    if(mem.phase==='tutorial_feedback'&&mem._fbBtn){var fb=mem._fbBtn;if(mx>=fb.x&&mx<=fb.x+fb.w&&my>=fb.y&&my<=fb.y+fb.h){if(mem._pendingOk){if(mem.tutRound>=3){mem.showReadyGame();}else{mem.tutRound++;mem.digits=genDigits(mem.tutRound===1?4:(mem.tutRound===2?5:6));mem.userInput=[];mem.revealed=mem.tutRound<3;mem.phase='tutorial_play';mem.displayPhase='ready_countdown';mem.showTimer=performance.now();}}else{mem.digits=genDigits(mem.tutRound===1?4:(mem.tutRound===2?5:6));mem.userInput=[];mem.revealed=mem.tutRound<3;mem.phase='tutorial_play';mem.displayPhase='ready_countdown';mem.showTimer=performance.now();}mem.feedback='';mem.tutFeedbackMsg='';updateUI();return true;}return false;}
    if(mem.phase==='ready_game'&&mem._rgb){var rgb=mem._rgb;if(mx>=rgb.x&&mx<=rgb.x+rgb.w&&my>=rgb.y&&my<=rgb.y+rgb.h){mem.showReadyStart();return true;}return false;}
    if(mem.phase==='ready_start'&&mem._rsb){var rsb=mem._rsb;if(mx>=rsb.x&&mx<=rsb.x+rsb.w&&my>=rsb.y&&my<=rsb.y+rsb.h){startPlaying();return true;}return false;}
    if(mem.phase==='done'){if(mem._db1&&mx>=mem._db1.x&&mx<=(mem._db1.x+mem._db1.w)&&my>=mem._db1.y&&my<=(mem._db1.y+mem._db1.h)){mem.showReadyStart();return true;}if(mem._db2&&mx>=mem._db2.x&&mx<=(mem._db2.x+mem._db2.w)&&my>=mem._db2.y&&my<=(mem._db2.y+mem._db2.h)){window._nextModule("memory");return true;}return false;}
    if((mem.displayPhase==='input'||mem.displayPhase==='revealed')&&mem._kp){var kp=mem._kp;for(var k=0;k<kp.digs.length;k++){var d=kp.digs[k],col=k%kp.cols,row=Math.floor(k/kp.cols);var kx=W/2-kp.cols*(kp.kw+kp.kg)/2+kp.kg/2+col*(kp.kw+kp.kg),ky2=kp.ky+row*(kp.kh+kp.kg);if(mx>=kx&&mx<=kx+kp.kw&&my>=ky2&&my<=ky2+kp.kh){clickDigit(d);return true;}}if(mx>=kp.kx0&&mx<=kp.kx0+kp.kw&&my>=kp.ky0&&my<=kp.ky0+kp.kh){clickDigit(0);return true;}}
    return false;
}

setTimeout(function(){
    document.querySelectorAll('.cog-mod-btn').forEach(function(btn){if(btn.dataset.mod==='memory'){btn.addEventListener('click',function(){document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');b.style.background='transparent';b.style.color='var(--text)';});btn.classList.add('active');btn.style.background='var(--primary)';btn.style.color='var(--bg-dark)';window.__cogModule='memory';document.getElementById('cog-panel-planning').style.display='none';document.getElementById('cog-panel-inhibition').style.display='block';mem.showReady();});}});
    updateUI();
},600);

(function loop(){renderMemory();requestAnimationFrame(loop);})();

(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='memory'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();

})();
