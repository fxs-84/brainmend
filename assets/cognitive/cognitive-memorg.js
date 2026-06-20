// 模块4: 记忆组织提取能力 — 多回合小猴子记忆搜索
(function(){
var GOLD='#C9A84C',GRID=6,CELL=48,GAP=2,MAX_LIVES=3;
var mo=window.__memorg={
	phase:'idle',
	grid:[],
	cards:[],          // [{r,c,locked:false,hasMonkey:false,clicked:false}]
	roundSchedule:[],
	currentRound:0,
	totalCards:0,
	lives:MAX_LIVES,
	trials:0,correct:0,
	tutRound:1,
	flipCard:null,    // {r,c,t} monkey flash
	emptyFlash:null,   // {r,c,t} orange blink
	lockedErrorCard:null, // {r,c,t} red !
	feedbackText:'',
	feedbackT:0,
	feedbackColor:'',
	_feedbackDur:1500
};

var monkeyImg=null;(function(){var i=new Image();i.onload=function(){monkeyImg=i;};i.src='./assets/monkey.png';})();
var bulbImg=null;(function(){var i=new Image();i.onload=function(){bulbImg=i;};i.src='./assets/lightbulb.svg';})();

function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.05);o.frequency.setValueAtTime(2000,t+.1);g.gain.setValueAtTime(.1,t);g.gain.setValueAtTime(.1,t+.1);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.3);}catch(e){}}
function playClick(){try{var a3=new(window.AudioContext||window.webkitAudioContext)(),t3=a3.currentTime,o3=a3.createOscillator(),g3=a3.createGain();o3.connect(g3);g3.connect(a3.destination);o3.type='sine';o3.frequency.setValueAtTime(1800,t3);o3.frequency.setValueAtTime(1200,t3+.03);g3.gain.setValueAtTime(.06,t3);g3.gain.exponentialRampToValueAtTime(.001,t3+.06);o3.start(t3);o3.stop(t3+.08);}catch(e){}}
function playError(){try{var a2=new(window.AudioContext||window.webkitAudioContext)(),t2=a2.currentTime,o2=a2.createOscillator(),g2=a2.createGain();o2.connect(g2);g2.connect(a2.destination);o2.type='square';o2.frequency.setValueAtTime(200,t2);o2.frequency.linearRampToValueAtTime(100,t2+.25);g2.gain.setValueAtTime(.15,t2);g2.gain.exponentialRampToValueAtTime(.001,t2+.3);o2.start(t2);o2.stop(t2+.3);}catch(e){}}
function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

function randInt(min,max){return min+Math.floor(Math.random()*(max-min+1));}
function allLocked(){for(var i=0;i<mo.cards.length;i++)if(!mo.cards[i].locked)return false;return true;}
function allClickedThisRound(){for(var i=0;i<mo.cards.length;i++){if(!mo.cards[i].locked&&!mo.cards[i].clicked)return false;}return true;}

function genTrial(n){
	mo.totalCards=n;mo.grid=[];for(var r=0;r<GRID;r++){mo.grid[r]=[];for(var c=0;c<GRID;c++)mo.grid[r][c]=0;}
	mo.cards=[];mo.flipCard=null;mo.emptyFlash=null;mo.lockedErrorCard=null;mo.feedbackText='';
	var all=[];for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)all.push({r:r,c:c});
	for(var i=all.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=all[i];all[i]=all[j];all[j]=t;}
	for(var k=0;k<n;k++){mo.cards.push({r:all[k].r,c:all[k].c,locked:false,hasMonkey:false,clicked:false});mo.grid[all[k].r][all[k].c]=1;}
	createSchedule();startNextRound();
}

function createSchedule(){
	var n=mo.totalCards,schedule=[];
	if(mo.phase==='tutorial_1'){schedule=[n];}
	else if(mo.phase==='tutorial_2'){schedule=[2,n-2];}
	else if(mo.phase==='tutorial_3'){var first=randInt(1,2),rest=n-first;if(rest<=2)schedule=[first,rest];else{var mid=Math.ceil(rest/2);schedule=[first,mid,rest-mid];}}
	else{var nR=Math.min(n-1,2+Math.floor(n/4));var rem=n;for(var i=0;i<nR-1;i++){var mx=Math.min(rem-1,Math.ceil(rem*0.6));var mn=Math.max(1,Math.floor(rem*0.3));schedule.push(randInt(mn,mx));rem-=schedule[schedule.length-1];}schedule.push(rem);}
	mo.roundSchedule=schedule;mo.currentRound=0;
}

function startNextRound(){
	mo.currentRound++;
	if(mo.currentRound>mo.roundSchedule.length){trialComplete();return;}
	var nMonkeys=mo.roundSchedule[mo.currentRound-1];
	var unlocked=mo.cards.filter(function(c){return !c.locked;});
	for(var i=0;i<mo.cards.length;i++)mo.cards[i].clicked=false;
		for(var i=0;i<unlocked.length;i++){unlocked[i].hasMonkey=false;mo.grid[unlocked[i].r][unlocked[i].c]=1;}
	for(var i2=unlocked.length-1;i2>0;i2--){var j=Math.floor(Math.random()*(i2+1));var t=unlocked[i2];unlocked[i2]=unlocked[j];unlocked[j]=t;}
	for(var k=0;k<nMonkeys&&k<unlocked.length;k++){unlocked[k].hasMonkey=true;}
}

function trialComplete(){
	mo.flipCard=null;playCoin();
	if(mo.phase==='tutorial_1'){mo.showFeedback('对就是这样，下面开始下一关','#fff',0,startTut2);return;}
	if(mo.phase==='tutorial_2'){mo.showFeedback('对就是这样，下面开始下一关','#fff',0,startTut3);return;}
	if(mo.phase==='tutorial_3'){mo.showReadyGame();return;}
	mo.correct++;mo.trials++;setTimeout(function(){genTrial(mo.totalCards+1);updateUI();},1200);
}

mo.showFeedback=function(text,color,dur,cb){mo.feedbackText=text;mo.feedbackColor=color;mo.feedbackT=performance.now();mo._feedbackDur=(dur===0?999999:(dur||1500));mo._feedbackCb=cb||null;};

function handleCardClick(idx){
	if(idx<0||idx>=mo.cards.length)return false;
	var card=mo.cards[idx];
	if(mo.flipCard||mo.lockedErrorCard)return false;
	if(mo.feedbackText)return false;
	var isTut=mo.phase==='tutorial_1'||mo.phase==='tutorial_2'||mo.phase==='tutorial_3';

	// Locked card (already had monkey) → show red !, end trial
	if(card.locked){
		mo.lockedErrorCard={r:card.r,c:card.c,t:performance.now()};
		playError();
		if(isTut){setTimeout(function(){genTrial(mo.totalCards);updateUI();},1500);}
		else{mo.lives--;mo.trials++;setTimeout(function(){if(mo.lives<=0){mo.phase='done';}else{genTrial(mo.totalCards);}updateUI();},1500);}
		updateUI();return false;
	}
	if(card.clicked)return false;

	card.clicked=true;playClick();
	if(card.hasMonkey){
		card.locked=true;
		mo.flipCard={r:card.r,c:card.c,t:performance.now(),phase:"in"};
	}else{
		mo.emptyFlash={r:card.r,c:card.c,t:performance.now()};
	}
	if(allClickedThisRound()){setTimeout(function(){if(allLocked()){trialComplete();}else{startNextRound();}},800);}
	updateUI();return true;
}

function updateUI(){
	var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
	if(st){if(mo.phase==='ready')st.textContent='记忆组织提取能力';else if(mo.phase==='tutorial_text')st.textContent='游戏规则';else if(mo.phase==='tutorial_1')st.textContent='教程 (3张)';else if(mo.phase==='tutorial_2')st.textContent='教程 (4张)';else if(mo.phase==='tutorial_3')st.textContent='教程 (5张)';else if(mo.phase==='ready_game')st.textContent='准备开始';else st.textContent='';}
	if(sc)sc.textContent='';
}

mo.showReady=function(){mo.phase='ready';updateUI();};
mo.startTutorial=function(){mo.phase='tutorial_text';updateUI();};
function startTut1(){mo.phase='tutorial_1';mo.tutRound=1;genTrial(3);updateUI();}
function startTut2(){mo.phase='tutorial_2';mo.tutRound=2;genTrial(4);updateUI();}
function startTut3(){mo.phase='tutorial_3';mo.tutRound=3;genTrial(5);updateUI();}
mo.showReadyGame=function(){mo.phase='ready_game';updateUI();};
mo.showReadyStart=function(){mo.phase='ready_start';updateUI();};
function startPlaying(){mo.phase='playing';mo.trials=0;mo.correct=0;mo.lives=MAX_LIVES;genTrial(5);updateUI();}

// Render helpers
function gridMetrics(W,H){var gw=GRID*(CELL+GAP)-GAP,gh=gw;return{gw:gw,gh:gh,ox:W/2-gw/2,oy:H/2-gh/2-20};}

function renderMemOrg(){
	var c=document.getElementById('cognitive-canvas');if(!c||c.style.display==='none'||!mo||mo.phase==='idle')return;
	if(window.__cogModule!=='memorg')return;
	var ctx=c.getContext('2d'),W=c.width,H=c.height;

	if(mo.flipCard&&performance.now()-mo.flipCard.t>1000){var isRed=mo.phase==='tutorial_1'||mo.phase==='tutorial_2';if(isRed)mo.grid[mo.flipCard.r][mo.flipCard.c]=2;mo.flipCard=null;}
	if(mo.lockedErrorCard&&performance.now()-mo.lockedErrorCard.t>1500){mo.lockedErrorCard=null;}
	if(mo.emptyFlash&&performance.now()-mo.emptyFlash.t>300){mo.emptyFlash=null;}
	if(mo.feedbackText&&performance.now()-mo.feedbackT>mo._feedbackDur){mo.feedbackText='';}

	ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);

	if(mo.phase==='ready')renderReady(ctx,W,H,false);
	else if(mo.phase==='ready_start')renderReady(ctx,W,H,true);
	else if(mo.phase==='tutorial_text')renderTutText(ctx,W,H);
	else if(mo.phase==='ready_game')renderReadyGame(ctx,W,H);
	else if(mo.phase==='done')renderDone(ctx,W,H);
	else renderGame(ctx,W,H);
}

	function renderReady(ctx,W,H,isStart){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('记忆组织提取能力',W/2,H/2-150);
		var t1='考验你记住与处理复杂信息的能力',t2='分数越高代表着你处理能力越强';ctx.font='bold 18px sans-serif';var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t1,W/2,byBox+27);ctx.fillText(t2,W/2,byBox+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=160,bh=48,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(isStart?'开始':'开始教程',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		mo._rb={x:bx,y:by,w:bw,h:bh};
	}

	function renderTutText(ctx,W,H){
		var lines=["每轮找出新增小猴子","记住已翻的牌和旧小猴子位置","翻错或点错即扣除生命值","全部卡牌变成小猴子后进入下一回合"];
		var bwBox=520,bhBox=170,bxBox=W/2-bwBox/2,byBox=H/2-115;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		for(var i=0;i<lines.length;i++)ctx.fillText(lines[i],W/2,byBox+40+i*38);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		mo._tb={x:bx,y:by,w:bw,h:bh};
	}
	function renderReadyGame(ctx,W,H){
	var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-45;
	drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
	ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('对就是这样，现在正式开始游戏吧',W/2,byBox+34);
	ctx.textBaseline='alphabetic';ctx.textAlign='start';
	var bw=160,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
	drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
	ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始游戏',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
	mo._rgb={x:bx,y:by,w:bw,h:bh};
}

function renderDone(ctx,W,H){
	ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('记忆组织提取能力',W/2,H/2-130);ctx.textAlign='start';
	ctx.font='bold 22px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-70);ctx.textAlign='start';
	var bw=160,bh=48,by=H/2,bx1=W/2-bw-20,bx2=W/2+20;
	drawRR(ctx,bx1,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
	drawRR(ctx,bx2,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
	mo._db1={x:bx1,y:by,w:bw,h:bh};mo._db2={x:bx2,y:by,w:bw,h:bh};
}

function renderGame(ctx,W,H){
	var m=gridMetrics(W,H),ox=m.ox,oy=m.oy,gw=m.gw,gh=m.gh;

	// Feedback overlay — hide grid, show only message
	if(mo.feedbackText){var bw=460,bh=130,bx=W/2-bw/2,by=H/2-80;drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#1a1a2e';ctx.fill();ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=mo.feedbackColor;ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(mo.feedbackText,W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';if(mo._feedbackCb){var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;drawRR(ctx,btnX,btnY,btnW,btnH,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',btnX+btnW/2,btnY+btnH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';mo._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};}return;}

	// Lives display with label
	if(mo.phase==='playing'){ctx.font='bold 14px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('剩余尝试次数',W/2,oy-65);var h='';for(var li=0;li<MAX_LIVES;li++)h+=li<mo.lives?'❤️':'🖤';ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.fillText(h,W/2,oy-42);ctx.textAlign='start';}

	// Grid border
	drawRR(ctx,ox,oy,gw,gh,10);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();

	// Instructional text below grid
	ctx.font='bold 15px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';
	ctx.fillText('点击盒子搜索小猴子，找到小猴子前，每个盒子只能点击一次',W/2,oy+gh+25);
	ctx.fillText('有过小猴子的盒子，不要点击',W/2,oy+gh+48);
	ctx.textAlign='start';

	// Draw cells
	for(var r=0;r<GRID;r++){
		for(var c2=0;c2<GRID;c2++){
			var x=ox+c2*(CELL+GAP),y=oy+r*(CELL+GAP);
			var val=mo.grid[r][c2];
			if(val===0)continue;
			drawRR(ctx,x,y,CELL,CELL,6);
			var isFlipping=mo.flipCard&&mo.flipCard.r===r&&mo.flipCard.c===c2;
			if(val===2){ctx.fillStyle='rgba(244,67,54,0.4)';ctx.fill();ctx.strokeStyle='#F44336';ctx.lineWidth=2;ctx.stroke();if(!isFlipping&&bulbImg&&bulbImg.complete){ctx.drawImage(bulbImg,x+4,y+4,CELL-8,CELL-8);}}
			else{ctx.fillStyle='rgba(201,168,76,0.15)';ctx.fill();ctx.strokeStyle=GOLD;ctx.lineWidth=1.5;ctx.stroke();if(!isFlipping&&bulbImg&&bulbImg.complete){ctx.drawImage(bulbImg,x+6,y+6,CELL-12,CELL-12);}}
		}
	}

	// Orange blink for no-monkey click
	if(mo.emptyFlash){var ef=mo.emptyFlash;var ex2=ox+ef.c*(CELL+GAP),ey2=oy+ef.r*(CELL+GAP);drawRR(ctx,ex2,ey2,CELL,CELL,6);ctx.fillStyle='rgba(255,152,0,0.5)';ctx.fill();ctx.strokeStyle='#FF9800';ctx.lineWidth=2;ctx.stroke();if(bulbImg&&bulbImg.complete)ctx.drawImage(bulbImg,ex2+4,ey2+4,CELL-8,CELL-8);}

	// Red ! on locked card error
	if(mo.lockedErrorCard){var le=mo.lockedErrorCard;var lex=ox+le.c*(CELL+GAP),ley=oy+le.r*(CELL+GAP);drawRR(ctx,lex,ley,CELL,CELL,6);ctx.fillStyle='rgba(244,67,54,0.7)';ctx.fill();ctx.strokeStyle='#F44336';ctx.lineWidth=2;ctx.stroke();ctx.font='bold 28px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',lex+CELL/2,ley+CELL/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';}

	// Flip: bulb→flip→monkey(hold)→flip back→red+bulb
	if(mo.flipCard&&monkeyImg&&monkeyImg.complete){
		var fc=mo.flipCard;
		var flipX=ox+fc.c*(CELL+GAP), flipY=oy+fc.r*(CELL+GAP);
		var el2=performance.now()-fc.t, T1=150, T2=400, T3=700, T4=1000;
		if(el2<T4){
			ctx.save();
			ctx.translate(flipX+CELL/2, flipY+CELL/2);
			var sX;
			if(el2<T1){sX=1-el2/T1;ctx.scale(sX,1);if(bulbImg&&bulbImg.complete)ctx.drawImage(bulbImg,-CELL/2+6,-CELL/2+6,CELL-12,CELL-12);}
			else if(el2<T2){sX=(el2-T1)/(T2-T1);ctx.scale(sX,1);ctx.drawImage(monkeyImg,-CELL/2+1,-CELL/2+1,CELL-2,CELL-2);}
			else if(el2<T3){sX=1;ctx.drawImage(monkeyImg,-CELL/2+1,-CELL/2+1,CELL-2,CELL-2);}
			else{sX=1-(el2-T3)/(T4-T3);ctx.scale(sX,1);if(el2<T4-T3/2){ctx.drawImage(monkeyImg,-CELL/2+1,-CELL/2+1,CELL-2,CELL-2);}else{if(bulbImg&&bulbImg.complete)ctx.drawImage(bulbImg,-CELL/2+6,-CELL/2+6,CELL-12,CELL-12);}}
			ctx.restore();
		}else{mo.flipCard=null;}
	}

	// Hitboxes
	mo._cardHitboxes=[];
	for(var i=0;i<mo.cards.length;i++){var cd=mo.cards[i];if(cd.clicked)continue;var cx=ox+cd.c*(CELL+GAP),cy=oy+cd.r*(CELL+GAP);mo._cardHitboxes.push({idx:i,x:cx,y:cy,w:CELL,h:CELL});}
}

function handleClick(ex,ey){
	var c=document.getElementById('cognitive-canvas');if(!c||c.style.display==='none')return false;
	if(window.__cogModule!=='memorg')return false;
	var rect=c.getBoundingClientRect();if(!rect)return false;
	var mx=(ex-rect.left)*(c.width/rect.width),my=(ey-rect.top)*(c.height/rect.height);

	if((mo.phase==='ready'||mo.phase==='ready_start')&&mo._rb){var rb=mo._rb;if(mx>=rb.x&&mx<=rb.x+rb.w&&my>=rb.y&&my<=rb.y+rb.h){if(mo.phase==='ready_start'){startPlaying();}else{mo.startTutorial();}return true;}return false;}
	if(mo.phase==='tutorial_text'&&mo._tb){var tb=mo._tb;if(mx>=tb.x&&mx<=tb.x+tb.w&&my>=tb.y&&my<=tb.y+tb.h){startTut1();return true;}return false;}
	if(mo.phase==='ready_game'&&mo._rgb){var rgb=mo._rgb;if(mx>=rgb.x&&mx<=rgb.x+rgb.w&&my>=rgb.y&&my<=rgb.y+rgb.h){mo.showReadyStart();return true;}return false;}
	if(mo.phase==='done'){if(mo._db1&&mx>=mo._db1.x&&mx<=mo._db1.x+mo._db1.w&&my>=mo._db1.y&&my<=mo._db1.y+mo._db1.h){mo.showReadyStart();return true;}if(mo._db2&&mx>=mo._db2.x&&mx<=mo._db2.x+mo._db2.w&&my>=mo._db2.y&&my<=mo._db2.y+mo._db2.h){window._nextModule("memorg");return true;}return false;}

	if(mo.feedbackText&&mo._fbBtn&&mx>=mo._fbBtn.x&&mx<=mo._fbBtn.x+mo._fbBtn.w&&my>=mo._fbBtn.y&&my<=mo._fbBtn.y+mo._fbBtn.h){if(mo._feedbackCb){mo.feedbackText='';mo._feedbackCb();}return true;}
	if(mo._cardHitboxes){for(var i=0;i<mo._cardHitboxes.length;i++){var hb=mo._cardHitboxes[i];if(mx>=hb.x&&mx<=hb.x+hb.w&&my>=hb.y&&my<=hb.y+hb.h){handleCardClick(hb.idx);return true;}}}
	return false;
}

setTimeout(function(){
	document.querySelectorAll('.cog-mod-btn').forEach(function(btn){if(btn.dataset.mod==='memorg'){btn.addEventListener('click',function(){document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');b.style.background='transparent';b.style.color='var(--text)';});btn.classList.add('active');btn.style.background='var(--primary)';btn.style.color='var(--bg-dark)';window.__cogModule='memorg';if(window._showCognitive)window._showCognitive();document.getElementById('cog-panel-planning').style.display='none';document.getElementById('cog-panel-inhibition').style.display='block';mo.showReady();});}});
},600);

(function loop(){renderMemOrg();requestAnimationFrame(loop);})();
(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='memorg'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();
})();
