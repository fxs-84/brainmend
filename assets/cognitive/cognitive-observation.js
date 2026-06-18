// 模块: 观察能力 — 左侧重叠双多边形 vs 右侧单多边形, 判断相同/不同
(function(){
var GOLD='#C9A84C';
var GAME_SEC=60;

function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

// 生成凸多边形顶点 (4-7边, 无内角>180°)
function genPolygon(sides){
	// 生成严格凸多边形: 随机点→凸包→选取sides个顶点
	var verts, step=Math.PI*2/sides, margin=step*0.25;
	// 重试直到生成凸多边形
	for(var attempt=0;attempt<50;attempt++){
		verts=[];
		for(var i=0;i<sides;i++){
			var base=i*step-Math.PI/2;
			var a=base+(Math.random()-0.5)*margin*2;
			var r=0.5+Math.random()*0.5;
			verts.push({angle:a, r:r});
		}
		verts.sort(function(a,b){return a.angle-b.angle;});
		// 检查凸性: 所有相邻三点的叉积同号
		var ok=true, sign=0;
		for(var i=0;i<sides;i++){
			var v0=verts[i], v1=verts[(i+1)%sides], v2=verts[(i+2)%sides];
			var p0x=Math.cos(v0.angle)*v0.r, p0y=Math.sin(v0.angle)*v0.r;
			var p1x=Math.cos(v1.angle)*v1.r, p1y=Math.sin(v1.angle)*v1.r;
			var p2x=Math.cos(v2.angle)*v2.r, p2y=Math.sin(v2.angle)*v2.r;
			var cp=(p1x-p0x)*(p2y-p1y)-(p1y-p0y)*(p2x-p1x);
			if(Math.abs(cp)>1e-9){
				var s=cp>0?1:-1;
				if(sign===0) sign=s;
				else if(s!==sign){ok=false;break;}
			}
		}
		if(ok) break;
	}
	var result=[];
	for(var i=0;i<verts.length;i++)result.push({x:Math.cos(verts[i].angle)*verts[i].r, y:Math.sin(verts[i].angle)*verts[i].r});
	return result;
}

// 微调1-2个顶点沿径向移动, 仅改变相邻两条边的长度
function perturbPolygon(orig,count){
	for(var attempt=0;attempt<20;attempt++){
		var verts=[];
		for(var i=0;i<orig.length;i++)verts.push({x:orig[i].x,y:orig[i].y});
		var idxs=shuffle(orig.map(function(_,i){return i;})).slice(0,count);
		for(var k=0;k<idxs.length;k++){
			var j=idxs[k];
			var angle=Math.atan2(verts[j].y,verts[j].x);
			var r=Math.sqrt(verts[j].x*verts[j].x+verts[j].y*verts[j].y);
			var newR=r*(1.0+0.06+Math.random()*0.19);
			verts[j].x=Math.cos(angle)*newR;
			verts[j].y=Math.sin(angle)*newR;
		}
		var ok=true,sign=0;
		for(var i=0;i<verts.length;i++){
			var p0=verts[i],p1=verts[(i+1)%verts.length],p2=verts[(i+2)%verts.length];
			var cp=(p1.x-p0.x)*(p2.y-p1.y)-(p1.y-p0.y)*(p2.x-p1.x);
			if(Math.abs(cp)>1e-9){var s=cp>0?1:-1;if(sign===0)sign=s;else if(s!==sign){ok=false;break;}}
		}
		if(ok)return verts;
	}
	return orig.map(function(v){return {x:v.x,y:v.y};});
}

var ob=window.__observation={
	phase:'idle',
	leftPoly1:null, leftPoly2:null,
	rightPoly:null,
	matchIdx:0,        // 0=左1, 1=左2, -1=都不同
	isSame:false,
	answerGiven:false,
	animating:false, animProgress:0,
	feedbackText:'', feedbackT:0, feedbackDur:1500,
	tutStep:0, tutCorrect:0,
	score:0, trials:0, gameEndTime:0
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

function drawPolygon(ctx,verts,cx,cy,sz,alpha){
	alpha=alpha||1;
	ctx.save();ctx.globalAlpha=alpha;
	ctx.beginPath();
	for(var i=0;i<verts.length;i++){
		var x=cx+verts[i].x*sz,y=cy+verts[i].y*sz;
		if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
	}
	ctx.closePath();
	ctx.strokeStyle=GOLD;ctx.lineWidth=2.5;ctx.stroke();
	ctx.restore();
}

function genTrial(){
	ob.answerGiven=false;ob.animating=false;ob.animProgress=0;ob.feedbackText='';
	// 左侧两个多边形: 边数相近, 最多差2条
	var sides1=randInt(4,7);
	var sides2=sides1+randInt(-2,2);
	sides2=Math.max(4,Math.min(7,sides2));
	var p1=genPolygon(sides1);
	var p2=genPolygon(sides2);
	ob.leftPoly1=p1;
	ob.leftPoly2=p2;
	ob.isSame=Math.random()<0.5;
	if(ob.isSame){
		ob.matchIdx=Math.random()<0.5?0:1;
		var ref=ob.matchIdx===0?p1:p2;
		ob.rightPoly=ref.map(function(v){return {x:v.x,y:v.y};});
	}else{
		ob.matchIdx=-1;
		// 不同: 从p1扰动1-2个顶点, 边数相同
		ob.rightPoly=perturbPolygon(p1,randInt(1,2));
	}
}

ob.showFeedback=function(text,color,dur){ob.feedbackText=text;ob.feedbackT=performance.now();ob.feedbackDur=dur||1500;};

function updateUI(){
	var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
	if(st){
		if(ob.phase==='ready')st.textContent='观察能力';
		else if(ob.phase==='tutorial_text')st.textContent='观察能力 — 教程';
		else if(ob.phase==='tutorial')st.textContent='教程 ('+(ob.tutStep)+'/2)';
		else if(ob.phase==='ready_game')st.textContent='准备好了吗？';
		else if(ob.phase==='playing')st.textContent='观察能力';
		else if(ob.phase==='done')st.textContent='测试结束';
		else st.textContent='';
	}
	if(sc)sc.textContent='';
}

ob.showReady=function(){ob.phase='ready';ob.tutStep=0;ob.tutCorrect=0;updateUI();};
ob.startTutorial=function(){ob.phase='tutorial_text';ob.tutStep=0;updateUI();};
function startTutGame(){ob.phase='tutorial';ob.tutStep=1;ob.tutCorrect=0;genTrial();updateUI();}
ob.showReadyGame=function(){ob.phase='ready_game';updateUI();};
	ob.showReadyStart=function(){ob.phase='ready_start';updateUI();};
function startPlaying(){ob.phase='playing';ob.score=0;ob.trials=0;ob.gameEndTime=Date.now()+GAME_SEC*1000;genTrial();updateUI();}

	function handleAnswer(same){
		if(ob.answerGiven||ob.animating)return;
		ob.answerGiven=true;
		var correct=(same===ob.isSame);
		if(correct){playCoin();if(ob.phase==='playing'){ob.score++;ob.trials++;}}
		else{if(ob.phase==='tutorial')playError();if(ob.phase==='playing')ob.trials++;}
	
		if(ob.phase==='tutorial'){
			ob.tutFeedbackOk=correct;
			ob.tutFeedbackMsg=correct?(ob.tutCorrect>=1?'对，现在正式开始游戏吧':'对，再试一个'):'哦，不对';
			ob.animating=true;ob.animProgress=0;
			var animStart=performance.now();
			function animStep(ts){
				var e=ts-animStart;
				if(e<800){ob.animProgress=e/800;requestAnimationFrame(animStep);return;}
				ob.animProgress=1;
				if(e<1400){requestAnimationFrame(animStep);return;}
				ob.animating=false;ob.animProgress=0;
				ob.phase='tutorial_feedback';
				updateUI();
			}
			requestAnimationFrame(animStep);
			updateUI();
			return;
		}
	
		// 正式游戏: 直接下一题
		if(ob.phase==='playing'){
			setTimeout(function(){genTrial();ob.answerGiven=false;updateUI();},600);
			updateUI();
			return;
		}
	
		updateUI();
	}

	function renderObsFeedback(ctx,W,H){
		ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
		var msg=ob.tutFeedbackMsg||(ob.tutFeedbackOk?'对，再试一个':'哦，不对');
		var color='#fff';
		var bw=440,bh=88,bx=W/2-bw/2,by=H/2-70;
		drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=color;ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText(msg,W/2,by+bh/2-15);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
		drawGoldButton(ctx,btnX,btnY,btnW,btnH,'继续',18);
		ob._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
	}

function renderObservation(){
	var c=document.getElementById('cognitive-canvas');
	if(!c||c.style.display==='none'||!ob||ob.phase==='idle')return;
	if(window.__cogModule!=='observation')return;
	var ctx=c.getContext('2d'),W=c.width,H=c.height;
	ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
	if(ob.phase==='ready')renderReady(ctx,W,H);
	else if(ob.phase==='ready_start')renderReadyStart(ctx,W,H);
	else if(ob.phase==='tutorial_feedback')renderObsFeedback(ctx,W,H);
	else if(ob.phase==='tutorial_text')renderTutText(ctx,W,H);
	else if(ob.phase==='ready_game')renderReadyGame(ctx,W,H);
	else if(ob.phase==='done')renderDone(ctx,W,H);
	else renderGame(ctx,W,H);
}

	function renderReady(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';
		ctx.fillText('观察能力',W/2,H/2-150);
		var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('考验你能否看出细节的能力',W/2,byBox+27);ctx.fillText('分数越高代表观察能力越强',W/2,byBox+50);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始教程',20);
		ob._rb={x:bx,y:by,w:bw,h:bh};
	}
	function renderReadyStart(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('观察能力',W/2,H/2-150);
		var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('考验你能否看出细节的能力',W/2,byBox+27);ctx.fillText('分数越高代表观察能力越强',W/2,byBox+50);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始',20);
		ob._rsb={x:bx,y:by,w:bw,h:bh};
	}

	function renderTutText(ctx,W,H){
		var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-50;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('尝试将右边的图案与左侧两个重叠图案进行对比',W/2,byBox+28);ctx.fillText('若有任何一个相同，则选择相同',W/2,byBox+58);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'继续',18);
		ob._tb={x:bx,y:by,w:bw,h:bh};
	}

	function renderReadyGame(ctx,W,H){
		var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-45;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('对就是这样，现在正式开始游戏吧',W/2,byBox+34);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=180,bh=50,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始游戏',20);
		ob._rgb={x:bx,y:by,w:bw,h:bh};
	}

	function renderDone(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 40px sans-serif';ctx.textAlign='center';
		ctx.fillText('观察能力',W/2,H/2-160);
		ctx.font='20px sans-serif';ctx.fillStyle='#bdc3c7';
		ctx.fillText('当前测试结束',W/2,H/2-118);
		ctx.textAlign='start';

		var trials=ob.trials||0,correct=ob.score||0,wrong=Math.max(0,trials-correct);
		var compRate=ob.completionRate||(window.__scoring?window.__scoring.computeCompletionRate(trials,window.__scoring.BASELINE.observation):0.5);
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

		var bw=160,bh=48,by2=cardY+cardH+25,bx1=W/2-bw-20,bx2=W/2+20;
		drawGoldButton(ctx,bx1,by2,bw,bh,'重新开始',18);
		drawGoldButton(ctx,bx2,by2,bw,bh,'下一项测试',18);
		ob._restartBtn={x:bx1,y:by2,w:bw,h:bh};
		ob._nextBtn={x:bx2,y:by2,w:bw,h:bh};
	}

	function renderGame(ctx,W,H){
		if(ob.phase==='playing'){
			var remain=Math.max(0,ob.gameEndTime-Date.now());
			var min=Math.floor(remain/60000),sec=Math.floor(remain/1000%60);
			ctx.fillStyle='#aaa';ctx.font='bold 24px monospace';ctx.textAlign='right';ctx.fillText(min+':'+(sec<10?'0':'')+sec,W-20,40);ctx.textAlign='start';
			ctx.fillStyle='#888';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(ob.score,W/2,25);ctx.textAlign='start';
			if(remain<=0){ob.phase='done';ob.answerGiven=true;ob.completionRate=window.__scoring?window.__scoring.computeCompletionRate(ob.trials,window.__scoring.BASELINE.observation):0.5;updateUI();return;}
		}
		var polySz=80;
		var centerY=H/2-30;
		var centerX=W/2;
		var leftCX=centerX-140,leftCY=centerY;
		drawPolygon(ctx,ob.leftPoly1,leftCX,leftCY,polySz,0.6);
		drawPolygon(ctx,ob.leftPoly2,leftCX+polySz*0.4,leftCY-polySz*0.3,polySz,0.6);
		var rightCX=centerX+140,rightCY=centerY;
		if(ob.animating){
			var progress=ob.animProgress;
			var matchVert=ob.matchIdx===1?ob.leftPoly2:ob.leftPoly1;
			var rX=rightCX+(centerX-rightCX)*progress;
			var lStartX=ob.matchIdx===1?leftCX+polySz*0.4:leftCX;var lStartY=ob.matchIdx===1?leftCY-polySz*0.3:leftCY;var lX=lStartX+(centerX-lStartX)*progress;var lY=lStartY+(centerY-lStartY)*progress;
			var rAlpha=1-progress*0.5;
			var lAlpha=progress;
			drawPolygon(ctx,ob.rightPoly,rX,centerY,polySz,rAlpha);
			drawPolygon(ctx,matchVert,lX,lY,polySz,lAlpha);
		}else{
			drawPolygon(ctx,ob.rightPoly,rightCX,rightCY,polySz,0.85);
		}
		ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.textAlign='center';
		ctx.fillText('左侧的某个图形与右侧相同吗？',W/2,H/2+polySz+25);
		ctx.textAlign='start';
		if(ob.feedbackText){
			ctx.font='bold 26px sans-serif';
			ctx.fillStyle=ob.feedbackText.indexOf('✗')>=0||ob.feedbackText.indexOf('哦')>=0?'#F44336':'#4CAF50';
			ctx.textAlign='center';
			ctx.fillText(ob.feedbackText,W/2,H/2+polySz+100);
			ctx.textAlign='start';
		}
		if(!ob.animating){
			var btnW=130,btnH=50,btnY=centerY+polySz+75;
			var sameX=W/2-btnW-15,diffX=W/2+15;
			var btnAlpha=ob.answerGiven?0.45:1.0;
			// 内联绘制按钮: drawGoldButton 内部会重置 globalAlpha=1, 无法用外层包 save/restore 控制透明度
			function drawObsBtn(bx,by,bw,bh,label){
				drawRR(ctx,bx,by,bw,bh,12);
				ctx.fillStyle=GOLD;ctx.globalAlpha=.28*btnAlpha;ctx.fill();ctx.globalAlpha=1;
				ctx.strokeStyle=GOLD;ctx.globalAlpha=btnAlpha;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1;
				ctx.fillStyle=GOLD;ctx.globalAlpha=btnAlpha;ctx.font='bold 20px sans-serif';
				ctx.textAlign='center';ctx.textBaseline='middle';
				ctx.fillText(label,bx+bw/2,by+bh/2);
				ctx.globalAlpha=1;ctx.textBaseline='alphabetic';ctx.textAlign='start';
			}
			drawObsBtn(sameX,btnY,btnW,btnH,'相同');
			drawObsBtn(diffX,btnY,btnW,btnH,'不同');
			ob._sameBtn={x:sameX,y:btnY,w:btnW,h:btnH};
			ob._diffBtn={x:diffX,y:btnY,w:btnW,h:btnH};
		}
	}

	function pointInRect(mx,my,r){return mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}
function handleClick(ex,ey){
	var c=document.getElementById('cognitive-canvas');
	if(!c||c.style.display==='none')return false;
	if(window.__cogModule!=='observation')return false;
	var rect=c.getBoundingClientRect();
	var mx=(ex-rect.left)*(c.width/rect.width),my=(ey-rect.top)*(c.height/rect.height);

	if(ob.phase==='tutorial_feedback'&&ob._fbBtn&&pointInRect(mx,my,ob._fbBtn)){
		var obWasOk=ob.tutFeedbackOk;
		if(obWasOk)ob.tutCorrect++;
		if(ob.tutCorrect>=2){ob.phase='ready_game';ob.tutFeedbackMsg='';}
		else if(obWasOk){ob.phase='tutorial';ob.tutFeedbackMsg='';ob.answerGiven=false;genTrial();}
		else{ob.phase='tutorial';ob.tutFeedbackMsg='';ob.answerGiven=false;}
		updateUI();return true;
	}
	if(ob.phase==='ready'&&ob._rb&&pointInRect(mx,my,ob._rb)){ob.startTutorial();return true;}
	if(ob.phase==='tutorial_text'&&ob._tb&&pointInRect(mx,my,ob._tb)){startTutGame();return true;}
	if(ob.phase==='ready_game'&&ob._rgb&&pointInRect(mx,my,ob._rgb)){ob.showReadyStart();return true;}
	if(ob.phase==='ready_start'&&ob._rsb&&pointInRect(mx,my,ob._rsb)){startPlaying();return true;}
	if(ob.phase==='done'&&ob._restartBtn&&pointInRect(mx,my,ob._restartBtn)){ob.showReadyStart();return true;}
		if(ob.phase==='done'&&ob._nextBtn&&pointInRect(mx,my,ob._nextBtn)){window._nextModule("observation");return true;}
	if((ob.phase==='tutorial'||ob.phase==='playing')&&!ob.animating&&!ob.answerGiven){
		if(ob._sameBtn&&pointInRect(mx,my,ob._sameBtn)){handleAnswer(true);return true;}
		if(ob._diffBtn&&pointInRect(mx,my,ob._diffBtn)){handleAnswer(false);return true;}
	}
	return false;
}

setTimeout(function(){
	document.querySelectorAll('.cog-mod-btn').forEach(function(btn){
		if(btn.dataset.mod==='observation'){
			var fresh=btn.cloneNode(true);btn.parentNode.replaceChild(fresh,btn);
			fresh.addEventListener('click',function(){
				document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');if(b.style){b.style.background='';b.style.color='';}});
				fresh.classList.add('active');if(fresh.style){fresh.style.background='var(--primary)';fresh.style.color='var(--bg-dark)';}
				window.__cogModule='observation';
				if(window._showCognitive)window._showCognitive();
				var pi=document.getElementById('cog-panel-planning'),ii=document.getElementById('cog-panel-inhibition');
				if(pi)pi.style.display='none';if(ii)ii.style.display='block';
				ob.showReady();
			});
		}
	});
},600);

(function loop(){renderObservation();requestAnimationFrame(loop);})();
(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='observation'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();
})();
