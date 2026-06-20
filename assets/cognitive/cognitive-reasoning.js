(function(){
var GOLD='#C9A84C';
var GAME_SEC=90;
var REASON_TYPES=['color','shape','count'];
var COLORS=['#E74C3C','#FFEB3B','#3498DB','#2ECC71','#9B59B6','#FFFFFF'];

function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function pick(arr,n){return shuffle(arr.slice()).slice(0,n);}

var rn=window.__reasoning={
	phase:'idle',reasonType:'',grid:[],oddIdx:0,answerGiven:false,
	feedbackText:'',feedbackT:0,feedbackDur:1500,
	score:0,trials:0,tutCorrect:0,doneTypes:[],gameEndTime:0,wrongStreak:0,wrongType:''
};

function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.06);o.frequency.setValueAtTime(2000,t+.12);g.gain.setValueAtTime(.1,t);g.gain.exponentialRampToValueAtTime(.01,t+.25);o.start(t);o.stop(t+.3);}catch(e){}}
function playError(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='square';o.frequency.setValueAtTime(200,t);o.frequency.linearRampToValueAtTime(100,t+.2);g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.start(t);o.stop(t+.3);}catch(e){}}

function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

function drawGoldButton(ctx,x,y,w,h,label,sz){
	drawRR(ctx,x,y,w,h,12);
	ctx.fillStyle=GOLD;ctx.globalAlpha=.28;ctx.fill();ctx.globalAlpha=1;
	ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
	ctx.fillStyle=GOLD;ctx.font='bold '+(sz||18)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
	ctx.fillText(label,x+w/2,y+h/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
}

// canvas 原生 API 绘制, 确保纯色填充
function drawIcon(ctx,shapeIdx,color,cx,cy,size,rotation){
	ctx.save();
	ctx.translate(cx,cy);
	if(rotation)ctx.rotate(rotation*Math.PI/180);
	var s=size/2;
	ctx.fillStyle=color;
	ctx.beginPath();
	switch(shapeIdx){
		case 0:ctx.moveTo(0,-s);ctx.lineTo(s,s*0.8);ctx.lineTo(-s,s*0.8);ctx.closePath();ctx.fill();break;
		case 1:ctx.moveTo(-s*0.6,-s);ctx.lineTo(s*0.6,-s);ctx.lineTo(s,s*0.8);ctx.lineTo(-s,s*0.8);ctx.closePath();ctx.fill();break;
		case 2:var r=s*0.35,w=s*0.12;ctx.arc(0,-s*0.5,r,0,Math.PI*2);ctx.fill();ctx.fillRect(-w,-s*0.5,w*2,s*1.15);break;
		case 3:ctx.lineWidth=s*0.3;ctx.lineCap='round';ctx.strokeStyle=color;ctx.moveTo(-s*0.6,0);ctx.lineTo(-s*0.15,s*0.55);ctx.lineTo(s*0.6,-s*0.55);ctx.stroke();break;
	case 4:ctx.moveTo(-s,-s*0.45);ctx.lineTo(s*0.1,-s*0.45);ctx.lineTo(s*0.1,-s*0.95);ctx.lineTo(s*0.95,0);ctx.lineTo(s*0.1,s*0.95);ctx.lineTo(s*0.1,s*0.45);ctx.lineTo(-s,s*0.45);ctx.closePath();ctx.fill();break;
	case 5:ctx.moveTo(-s,s*0.45);ctx.lineTo(-s*0.4,-s*0.8);ctx.lineTo(-s*0.15,s*0.4);ctx.lineTo(-s*0.05,s*0.45);ctx.lineTo(s*0.5,-s*0.8);ctx.lineTo(s*0.65,s*0.4);ctx.lineTo(s*0.7,s*0.45);ctx.lineTo(s,s*0.45);ctx.lineTo(s,s*0.8);ctx.lineTo(-s,s*0.8);ctx.closePath();ctx.fill();break;
	}
	ctx.restore();
}

function genTrial(){
		rn.answerGiven=false;rn.feedbackText='';
		if(rn.phase==='tutorial'){rn.reasonType=REASON_TYPES[rn.tutCorrect];}
		else{rn.reasonType=rn.wrongStreak>0?rn.wrongType:REASON_TYPES[randInt(0,2)];}
		var type=rn.reasonType;
		var grid=new Array(9);
		var pos=shuffle([0,1,2,3,4,5,6,7,8]);
		var i;

		var numGroups=randInt(2,3);
		var groupShapes=pick([0,1,2,3,4,5],numGroups);
		var groupCols=pick(COLORS,numGroups);
		var ds=[],rem=8;for(i=0;i<numGroups-1;i++){var sz=randInt(2,rem-(numGroups-i-1)*2);ds.push(sz);rem-=sz;}ds.push(rem);
		var colRand=pick(COLORS,randInt(2,3));
		var cntRand=shuffle([1,2,3,4,5,6,7,8,9]).slice(0,randInt(2,3));

		if(type==='color'){
			// 颜色推理: 每组同形状同颜色, odd格同形状+颜色唯一, count从同组取不异常
			for(i=0;i<numGroups;i++){for(var j=0;j<ds[i];j++){var ci=ds.slice(0,i).reduce(function(a,b){return a+b;},0)+j;
				grid[pos[ci]]={shape:groupShapes[i],color:groupCols[i],count:cntRand[randInt(0,cntRand.length-1)],rot:randInt(0,3)*90};}}
			var oddG=randInt(0,numGroups-1),oddS=groupShapes[oddG];
			var oddCol;for(i=0;i<COLORS.length;i++){if(groupCols.indexOf(COLORS[i])<0){oddCol=COLORS[i];break;}}
			var gCnts=[];for(var k=0;k<8;k++){if(grid[pos[k]].shape===oddS)gCnts.push(grid[pos[k]].count);}
			grid[pos[8]]={shape:oddS,color:oddCol,count:gCnts[randInt(0,gCnts.length-1)],rot:randInt(0,3)*90};
			rn.oddIdx=pos[8];
		}else if(type==='shape'){
			// 形状推理: 每组同形状, odd格形状唯一, 颜色count从8格已有值取不异常
			var allShapes=[0,1,2,3,4,5];
			var usedShapes={};for(i=0;i<groupShapes.length;i++)usedShapes[groupShapes[i]]=true;
			var oddS;for(i=0;i<allShapes.length;i++){if(!usedShapes[allShapes[i]]){oddS=allShapes[i];break;}}
			for(i=0;i<numGroups;i++){for(var j=0;j<ds[i];j++){var ci=ds.slice(0,i).reduce(function(a,b){return a+b;},0)+j;
				grid[pos[ci]]={shape:groupShapes[i],color:colRand[randInt(0,colRand.length-1)],count:cntRand[randInt(0,cntRand.length-1)],rot:randInt(0,3)*90};}}
			var usedCols=[],usedCnts=[];for(var k=0;k<8;k++){var c=grid[pos[k]];if(usedCols.indexOf(c.color)<0)usedCols.push(c.color);if(usedCnts.indexOf(c.count)<0)usedCnts.push(c.count);}
			grid[pos[8]]={shape:oddS,color:usedCols[randInt(0,usedCols.length-1)],count:usedCnts[randInt(0,usedCnts.length-1)],rot:randInt(0,3)*90};
			rn.oddIdx=pos[8];
		}else{
			// 数量推理: 每组同形状同数量, odd格同形状+数量唯一, 颜色从同组取不异常
			var gc=shuffle([1,2,3,4,5,6,7,8,9]).slice(0,numGroups);
			for(i=0;i<numGroups;i++){for(var j=0;j<ds[i];j++){var ci=ds.slice(0,i).reduce(function(a,b){return a+b;},0)+j;
				grid[pos[ci]]={shape:groupShapes[i],color:colRand[randInt(0,colRand.length-1)],count:gc[i],rot:randInt(0,3)*90};}}
			var oddG=randInt(0,numGroups-1),oddS=groupShapes[oddG],oddC;do{oddC=randInt(1,9);}while(gc.indexOf(oddC)>=0);
			var gCols=[];for(var k=0;k<8;k++){if(grid[pos[k]].shape===oddS)gCols.push(grid[pos[k]].color);}
			grid[pos[8]]={shape:oddS,color:gCols[randInt(0,gCols.length-1)],count:oddC,rot:randInt(0,3)*90};
			rn.oddIdx=pos[8];
		}
		rn.grid=grid;
	}
rn.showFeedback=function(text,color,dur){rn.feedbackText=text;rn.feedbackT=performance.now();rn.feedbackDur=dur||1500;};

function updateUI(){
	var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
	if(st){
		if(rn.phase==='ready')st.textContent='推理能力';
		else if(rn.phase==='tutorial_feedback')'';
		else if(rn.phase==='tutorial_text')st.textContent='推理能力 — 教程';
		else if(rn.phase==='tutorial')st.textContent='教程 ('+(rn.tutCorrect+1)+'/3)';
		else if(rn.phase==='ready_game')st.textContent='准备好了吗？';
		else if(rn.phase==='playing')st.textContent='推理能力';
		else if(rn.phase==='done')st.textContent='测试结束';
		else st.textContent='';
	}
	if(sc)sc.textContent='';
}

rn.showReady=function(){rn.phase='ready';rn.tutCorrect=0;rn.doneTypes=[];updateUI();};
rn.startTutorial=function(){rn.phase='tutorial_text';updateUI();};
function startTutGame(){rn.phase='tutorial';rn.tutCorrect=0;rn.doneTypes=[];genTrial();updateUI();}
rn.showReadyGame=function(){rn.phase='ready_game';updateUI();};
	rn.showReadyStart=function(){rn.phase='ready_start';updateUI();};
function startPlaying(){rn.phase='playing';rn.score=0;rn.trials=0;rn.doneTypes=[];rn.wrongStreak=0;rn.wrongType='';rn.gameEndTime=Date.now()+GAME_SEC*1000;genTrial();updateUI();}

	function handleCellClick(idx){
		if(rn.answerGiven)return;
		var correct=(idx===rn.oddIdx);
		if(correct){playCoin();rn.answerGiven=true;if(rn.phase==='playing'){rn.score++;rn.trials++;rn.wrongStreak=0;}}
		else{
			if(rn.phase==='tutorial'){playError();rn.answerGiven=true;}
			else if(rn.phase==='playing'){rn.trials++;rn.wrongStreak++;rn.wrongType=rn.reasonType;if(rn.wrongStreak>=3)rn.wrongStreak=0;playError();setTimeout(function(){genTrial();updateUI();},400);updateUI();return;}
		}
		if(rn.phase==='tutorial'){
			rn.tutFeedbackOk=correct;
			if(correct&&rn.tutCorrect>=2){rn.tutCorrect=3;rn.showReadyGame();return;}
			rn.tutFeedbackMsg=correct?'对，再试一个':'哦，不对';
			rn.phase='tutorial_feedback';
			updateUI();
			return;
		}
		// 正式游戏正确
		setTimeout(function(){genTrial();rn.answerGiven=false;updateUI();},600);
		updateUI();
	}

	function renderRnFeedback(ctx,W,H){
		ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
		var msg=rn.tutFeedbackMsg||(rn.tutFeedbackOk?'对，再试一个':'哦，不对');
		var color='#fff';
		var bw=440,bh=88,bx=W/2-bw/2,by=H/2-70;
		drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=color;ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText(msg,W/2,by+bh/2-15);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
		drawGoldButton(ctx,btnX,btnY,btnW,btnH,'继续',18);
		rn._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
	}

function renderReasoning(){
	var c=document.getElementById('cognitive-canvas');
	if(!c||c.style.display==='none'||!rn||rn.phase==='idle')return;
	if(window.__cogModule!=='reasoning')return;
	var ctx=c.getContext('2d'),W=c.width,H=c.height;
	ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
	if(rn.phase==='ready')renderReady(ctx,W,H);
	else if(rn.phase==='ready_start')renderReadyStart(ctx,W,H);
	else if(rn.phase==='tutorial_feedback')renderRnFeedback(ctx,W,H);
	else if(rn.phase==='tutorial_text')renderTutText(ctx,W,H);
	else if(rn.phase==='ready_game')renderReadyGame(ctx,W,H);
	else if(rn.phase==='done')renderDone(ctx,W,H);
	else renderGame(ctx,W,H);
}

	function renderReady(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';
		ctx.fillText('推理能力',W/2,H/2-150);
		var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('评估你的逻辑推理能力',W/2,byBox+27);ctx.fillText('分数越高代表着你越聪明',W/2,byBox+50);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始教程',20);
		rn._rb={x:bx,y:by,w:bw,h:bh};
	}

	function renderGame(ctx,W,H){
	if(rn.feedbackText&&performance.now()-rn.feedbackT>rn.feedbackDur)rn.feedbackText='';
	if(rn.phase==='playing'){
		var left=Math.max(0,Math.ceil((rn.gameEndTime-Date.now())/1000));
		var min=Math.floor(left/60),sec=left%60;
		if(left<=0){rn.phase='done';rn.completionRate=window.__scoring?window.__scoring.computeCompletionRate(rn.trials,window.__scoring.BASELINE.reasoning):0.5;updateUI();return;}
		ctx.fillStyle='#fff';ctx.font='bold 15px sans-serif';ctx.textAlign='center';
		ctx.fillText('倒计时 '+min+':'+(sec<10?'0':'')+sec,W/2,40);
		ctx.textAlign='start';
	}
	var cellSz=120,gridGap=8,gridW=cellSz*3+gridGap*2,gridH=cellSz*3+gridGap*2;
	var gx=W/2-gridW/2,gy=H/2-gridH/2-40;
	rn._cells=[];
	for(var r=0;r<3;r++){
		for(var col=0;col<3;col++){
			var i=r*3+col;
			var cx=gx+col*(cellSz+gridGap),cy=gy+r*(cellSz+gridGap);
			rn._cells.push({x:cx,y:cy,w:cellSz,h:cellSz});
			drawRR(ctx,cx,cy,cellSz,cellSz,8);
			ctx.fillStyle='rgba(160,100,30,0.82)';ctx.fill();
			ctx.strokeStyle='rgba(255,152,0,0.85)';ctx.lineWidth=1;ctx.stroke();
			if(rn.answerGiven&&i===rn.oddIdx){
				drawRR(ctx,cx-2,cy-2,cellSz+4,cellSz+4,10);
				ctx.strokeStyle='#F44336';ctx.lineWidth=2.5;ctx.stroke();
			}
			var cell=rn.grid[i];if(!cell)continue;
			var iconSz=26;
			var cols=cell.count<=2?cell.count:cell.count<=4?Math.ceil(cell.count/2):Math.ceil(cell.count/3);
			var rows=cell.count<=2?1:cell.count<=4?2:3;
			var totalW=cols*iconSz+(cols-1)*6,totalH=rows*iconSz+(rows-1)*6;
			var startX=cx+(cellSz-totalW)/2,startY=cy+(cellSz-totalH)/2;
			var k=0;
			for(var rr=0;rr<rows&&k<cell.count;rr++){
				for(var cc=0;cc<cols&&k<cell.count;cc++){
					drawIcon(ctx,cell.shape,cell.color,startX+cc*(iconSz+6)+iconSz/2,startY+rr*(iconSz+6)+iconSz/2,iconSz,cell.rot);
					k++;
				}
			}
		}
	}
	if(rn.feedbackText){
		ctx.font='bold 28px sans-serif';
		ctx.fillStyle=rn.feedbackText.indexOf('✗')>=0?'#F44336':'#4CAF50';
		ctx.textAlign='center';
		ctx.fillText(rn.feedbackText,W/2,H/2+gridH/2+50);
		ctx.textAlign='start';
	}
}

function pointInRect(mx,my,r){return mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}
function handleClick(ex,ey){
	var c=document.getElementById('cognitive-canvas');
	if(!c||c.style.display==='none')return false;
	if(window.__cogModule!=='reasoning')return false;
	var rect=c.getBoundingClientRect();
	var mx=(ex-rect.left)*(c.width/rect.width),my=(ey-rect.top)*(c.height/rect.height);
	if(rn.phase==='ready'&&rn._rb&&pointInRect(mx,my,rn._rb)){rn.startTutorial();return true;}
	if(rn.phase==='tutorial_feedback'&&rn._fbBtn&&pointInRect(mx,my,rn._fbBtn)){
		var wasOk=rn.tutFeedbackOk;
		if(wasOk)rn.tutCorrect++;
		if(rn.tutCorrect>=3){rn.showReadyGame();rn.tutFeedbackMsg='';}
		else if(wasOk){rn.phase='tutorial';rn.tutFeedbackMsg='';rn.answerGiven=false;genTrial();}
		else{rn.phase='tutorial';rn.tutFeedbackMsg='';rn.answerGiven=false;}
		updateUI();return true;
	}
	if(rn.phase==='tutorial_text'&&rn._tb&&pointInRect(mx,my,rn._tb)){startTutGame();return true;}
	if(rn.phase==='ready_game'&&rn._rgb&&pointInRect(mx,my,rn._rgb)){rn.showReadyStart();return true;}
	if(rn.phase==='ready_start'&&rn._rsb&&pointInRect(mx,my,rn._rsb)){startPlaying();return true;}
	if(rn.phase==='done'&&rn._db1&&pointInRect(mx,my,rn._db1)){rn.showReadyStart();return true;}
	if(rn.phase==='done'&&rn._db2&&pointInRect(mx,my,rn._db2)){window._nextModule("reasoning");return true;}
	if((rn.phase==='tutorial'||rn.phase==='playing')&&rn._cells){
		for(var i=0;i<rn._cells.length;i++){if(pointInRect(mx,my,rn._cells[i])){handleCellClick(i);return true;}}
	}
	return false;
}

setTimeout(function(){
	document.querySelectorAll('.cog-mod-btn').forEach(function(btn){
		if(btn.dataset.mod==='reasoning'){
			var fresh=btn.cloneNode(true);btn.parentNode.replaceChild(fresh,btn);
			fresh.addEventListener('click',function(){
				document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');if(b.style){b.style.background='';b.style.color='';}});
				fresh.classList.add('active');if(fresh.style){fresh.style.background='var(--primary)';fresh.style.color='var(--bg-dark)';}
				window.__cogModule='reasoning';
				if(window._showCognitive)window._showCognitive();
				var pi=document.getElementById('cog-panel-planning'),ii=document.getElementById('cog-panel-inhibition');
				if(pi)pi.style.display='none';if(ii)ii.style.display='block';
				rn.showReady();
			});
		}
	});
},600);

(function loop(){renderReasoning();requestAnimationFrame(loop);})();
(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='reasoning'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();
	function renderReadyStart(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('推理能力',W/2,H/2-150);
		var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('评估你的逻辑推理能力',W/2,byBox+27);ctx.fillText('分数越高代表着你越聪明',W/2,byBox+50);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始',20);
		rn._rsb={x:bx,y:by,w:bw,h:bh};
	}

	function renderTutText(ctx,W,H){var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-70;drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 20px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("屏幕上有九个图案",W/2,byBox+32);ctx.fillText("请点击一个与其他图案模式不同的图案",W/2,byBox+62);ctx.textBaseline="alphabetic";ctx.textAlign="start";var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;drawGoldButton(ctx,bx,by,bw,bh,"继续",18);rn._tb={x:bx,y:by,w:bw,h:bh}}

	function renderReadyGame(ctx,W,H){
		var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-45;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('对就是这样，现在正式开始游戏吧',W/2,byBox+34);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=180,bh=50,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始游戏',20);
		rn._rgb={x:bx,y:by,w:bw,h:bh};
	}

	function renderDone(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 40px sans-serif';ctx.textAlign='center';
		ctx.fillText('推理能力',W/2,H/2-160);
		ctx.font='20px sans-serif';ctx.fillStyle='#bdc3c7';
		ctx.fillText('当前测试结束',W/2,H/2-118);
		ctx.textAlign='start';

		var trials=rn.trials||0,correct=rn.score||0,wrong=Math.max(0,trials-correct);
		var compRate=rn.completionRate||(window.__scoring?window.__scoring.computeCompletionRate(trials,window.__scoring.BASELINE.reasoning):0.5);
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
		rn._db1={x:bx1,y:by2,w:bw2,h:bh2};rn._db2={x:bx2,y:by2,w:bw2,h:bh2};
	}
})();

