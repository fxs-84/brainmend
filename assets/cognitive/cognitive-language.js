(function(){
var GOLD='#C9A84C';
var GAME_SEC=60;

// 5 种几何图形 — Path2D 数据 (viewBox 1024x1024)
var SHAPE_NAMES=['正六边形','正方形','三角形','五角星','圆形'];
var SHAPE_PATHS=[
	'M938.688 543.68a63.104 63.104 0 0 0 0-63.36l-185.792-320.64a63.616 63.616 0 0 0-55.04-31.68H326.144a63.616 63.616 0 0 0-55.04 31.68l-185.856 320.64a63.168 63.168 0 0 0 0 63.36l185.792 320.64a63.616 63.616 0 0 0 55.04 31.68h371.648a63.616 63.616 0 0 0 55.04-31.68l185.856-320.64zM883.136 512l-185.6 320.256H326.464L140.8 512l185.6-320.256h371.072L883.2 512z',
	'M885.333333 938.666667H138.666667a53.393333 53.393333 0 0 1-53.333334-53.333334V138.666667a53.393333 53.393333 0 0 1 53.333334-53.333334h746.666666a53.393333 53.393333 0 0 1 53.333334 53.333334v746.666666a53.393333 53.393333 0 0 1-53.333334 53.333334zM138.666667 128a10.666667 10.666667 0 0 0-10.666667 10.666667v746.666666a10.666667 10.666667 0 0 0 10.666667 10.666667h746.666666a10.666667 10.666667 0 0 0 10.666667-10.666667V138.666667a10.666667 10.666667 0 0 0-10.666667-10.666667z',
	'M928.64 896a2.144 2.144 0 0 1-0.64 0H96a32.032 32.032 0 0 1-27.552-48.288l416-704c11.488-19.456 43.552-19.456 55.104 0l413.152 699.2A31.936 31.936 0 0 1 928.64 896zM152.064 832h719.84L512 222.912 152.064 832z',
	'M522.6752 63.7696a25.6 25.6 0 0 1 12.5952 12.5952l114.6112 250.0864a25.6 25.6 0 0 0 20.3264 14.7712l273.2544 31.7184a25.6 25.6 0 0 1 14.3872 44.288l-202.4192 186.2656a25.6 25.6 0 0 0-7.7568 23.8848l54.272 269.6704a25.6 25.6 0 0 1-37.6832 27.3664l-239.6928-134.9376a25.6 25.6 0 0 0-25.1392 0l-239.6928 134.9376a25.6 25.6 0 0 1-37.6576-27.3664l54.272-269.6704a25.6 25.6 0 0 0-7.7824-23.8848l-202.4192-186.2912a25.6 25.6 0 0 1 14.3872-44.2624l273.2544-31.744a25.6 25.6 0 0 0 20.3264-14.7456l114.6368-250.0864z',
	'M512 960c-247.039484 0-448-200.960516-448-448S264.960516 64 512 64 960 264.960516 960 512 759.039484 960 512 960zM512 128c-211.744443 0-384 172.255557-384 384s172.255557 384 384 384 384-172.255557 384-384S723.744443 128 512 128z'
];
var SHAPE_OUTER_PATHS=[
	'M938.688 543.68a63.104 63.104 0 0 0 0-63.36l-185.792-320.64a63.616 63.616 0 0 0-55.04-31.68H326.144a63.616 63.616 0 0 0-55.04 31.68l-185.856 320.64a63.168 63.168 0 0 0 0 63.36l185.792 320.64a63.616 63.616 0 0 0 55.04 31.68h371.648a63.616 63.616 0 0 0 55.04-31.68l185.856-320.64z',
	'M885.333333 938.666667H138.666667a53.393333 53.393333 0 0 1-53.333334-53.333334V138.666667a53.393333 53.393333 0 0 1 53.333334-53.333334h746.666666a53.393333 53.393333 0 0 1 53.333334 53.333334v746.666666a53.393333 53.393333 0 0 1-53.333334 53.333334z',
	'M928.64 896a2.144 2.144 0 0 1-0.64 0H96a32.032 32.032 0 0 1-27.552-48.288l416-704c11.488-19.456 43.552-19.456 55.104 0l413.152 699.2A31.936 31.936 0 0 1 928.64 896z',
	'M522.6752 63.7696a25.6 25.6 0 0 1 12.5952 12.5952l114.6112 250.0864a25.6 25.6 0 0 0 20.3264 14.7712l273.2544 31.7184a25.6 25.6 0 0 1 14.3872 44.288l-202.4192 186.2656a25.6 25.6 0 0 0-7.7568 23.8848l54.272 269.6704a25.6 25.6 0 0 1-37.6832 27.3664l-239.6928-134.9376a25.6 25.6 0 0 0-25.1392 0l-239.6928 134.9376a25.6 25.6 0 0 1-37.6576-27.3664l54.272-269.6704a25.6 25.6 0 0 0-7.7824-23.8848l-202.4192-186.2912a25.6 25.6 0 0 1 14.3872-44.2624l273.2544-31.744a25.6 25.6 0 0 0 20.3264-14.7456l114.6368-250.0864z',
	'M512 960c-247.039484 0-448-200.960516-448-448S264.960516 64 512 64 960 264.960516 960 512 759.039484 960 512 960z'
];

// 位置关系类型
var REL_TYPES=['上面','下面','左边','右边','里面','外面'];

function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function pick(arr,n){return shuffle(arr.slice()).slice(0,n);}

var lg=window.__language={
	phase:'idle',
	tutCorrect:0,
	shapeA:0, shapeB:0,
	relType:'',
	useNegation:false,
	descTrue:true,
	descText:'',
	placement:'',
	answerGiven:false,
	feedbackText:'',
	feedbackT:0,
	feedbackDur:1500,
	score:0,trials:0,
	gameEndTime:0
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

// 绘制单个图形到 (cx,cy) 中心点, size 像素
function drawShape(ctx,shapeIdx,cx,cy,size,style){
	var vw=1024,scale=size/vw;
	ctx.save();
	ctx.translate(cx-size/2,cy-size/2);
	ctx.scale(scale,scale);
	var p=new Path2D(SHAPE_PATHS[shapeIdx]);
		var pf=new Path2D(SHAPE_OUTER_PATHS[shapeIdx]);
	if(style==='fill'){
		ctx.fillStyle=GOLD;ctx.fill(pf);
	}else{
		// 轮廓: 白底填充 + 描边 (用外路径,不含内切洞)
		ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fill(pf);
		ctx.strokeStyle='rgba(180,180,180,0.8)';ctx.lineWidth=Math.max(1,6/scale);ctx.stroke(pf);
	}
	ctx.restore();
}

function genTrial(){
	lg.answerGiven=false;
	lg.feedbackText='';
	// 随机选 2 个不同图形
	var idxs=pick([0,1,2,3,4],2);
	lg.shapeA=idxs[0];lg.shapeB=idxs[1];
	// 随机选关系
	lg.relType=REL_TYPES[randInt(0,5)];
	// 是否用"不在"句式 (30%概率)
	lg.useNegation=Math.random()<0.3;
	// 描述是否正确
	lg.descTrue=Math.random()<0.5;
	// 实际 placement: 扣除否定句式后,descTrue 决定 placement 与 relType 的关系
	// "A在B的X" → 真: A必须在X位; 假: A不能在X位
	// "A不在B的X" → 真: A不能在X位; 假: A必须在X位
	var OPPOSITE={上面:'下面',下面:'上面',左边:'右边',右边:'左边',里面:'外面',外面:'里面'};
	lg.placement=(lg.descTrue!==lg.useNegation)?lg.relType:OPPOSITE[lg.relType];
	// 构建文本
	var na=SHAPE_NAMES[lg.shapeA],nb=SHAPE_NAMES[lg.shapeB];
	lg.descText=lg.useNegation?na+'不在'+nb+'的'+lg.relType:na+'在'+nb+'的'+lg.relType;
}

// 根据 trial 数据返回 {ax,ay,szA,bx,by,szB} 用于绘制
function getPositions(W,H){
	var cx=W/2,cy=H/2-60;
	var gap=130,sz=100,szSmall=60,szLarge=140;
	var ax,ay,bx,by,aSz=sz,bSz=sz;
	switch(lg.placement){
		case '上面': ax=cx;ay=cy-gap/2;bx=cx;by=cy+gap/2;break;
		case '下面': ax=cx;ay=cy+gap/2;bx=cx;by=cy-gap/2;break;
		case '左边': ax=cx-gap/2;ay=cy;bx=cx+gap/2;by=cy;break;
		case '右边': ax=cx+gap/2;ay=cy;bx=cx-gap/2;by=cy;break;
		case '里面': ax=cx;ay=cy;aSz=szSmall;bx=cx;by=cy;bSz=szLarge;break;
		case '外面': ax=cx-68;ay=cy-55;aSz=szSmall;bx=cx+48;by=cy+55;bSz=szLarge;break;
		default: ax=cx;ay=cy;bx=cx;by=cy+60;break;
	}
	return {ax:ax,ay:ay,aSz:aSz,bx:bx,by:by,bSz:bSz};
}

lg.showFeedback=function(text,color,dur){
	lg.feedbackText=text;lg.feedbackT=performance.now();lg.feedbackDur=dur||1500;
};

function updateUI(){
	var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
	if(st){
		if(lg.phase==='ready')st.textContent='语言理解能力';
		else if(lg.phase==='tutorial_feedback')'';
		else if(lg.phase==='tutorial_text')st.textContent='语言理解能力 — 教程';
		else if(lg.phase==='tutorial')st.textContent='教程 ('+lg.tutCorrect+'/3 正确)';
		else if(lg.phase==='ready_game')st.textContent='准备好了吗？';
		else if(lg.phase==='playing')st.textContent='语言理解能力';
		else if(lg.phase==='done')st.textContent='测试结束';
		else st.textContent='';
	}
	if(sc)sc.textContent='';
}

lg.showReady=function(){lg.phase='ready';lg.tutCorrect=0;updateUI();};
lg.startTutorial=function(){lg.phase='tutorial_text';updateUI();};
function startTutGame(){lg.phase='tutorial';lg.tutCorrect=0;lg.feedbackText='';genTrial();updateUI();}
lg.showReadyGame=function(){lg.phase='ready_game';updateUI();};
	lg.showReadyStart=function(){lg.phase='ready_start';updateUI();};
function startPlaying(){
	lg.phase='playing';lg.score=0;lg.trials=0;lg.tutCorrect=0;lg.feedbackText='';
	lg.gameEndTime=Date.now()+GAME_SEC*1000;
	genTrial();updateUI();
}

	function handleAnswer(userSaysCorrect){
		if(lg.answerGiven)return;
		lg.answerGiven=true;
		var correct=(userSaysCorrect===lg.descTrue);
		if(correct){playCoin();if(lg.phase==='playing'){lg.score++;lg.trials++;}}
		else{if(lg.phase==='tutorial')playError();if(lg.phase==='playing')lg.trials++;}
		if(lg.phase==='tutorial'){
			lg.tutFeedbackOk=correct;
			if(correct)lg.tutCorrect++;
			if(correct&&lg.tutCorrect>=3){lg.showReadyGame();return;}
			lg.tutFeedbackMsg=correct?'对，再试一个':'哦，不对';
			lg.phase='tutorial_feedback';
			updateUI();
			return;
		}
		// 正式游戏
		setTimeout(function(){genTrial();lg.answerGiven=false;updateUI();},600);
		updateUI();
	}

	function renderLgFeedback(ctx,W,H){
		ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
		var msg=lg.tutFeedbackMsg||(lg.tutFeedbackOk?'对，再试一个':'哦，不对');
		var color='#fff';
		var bw=500,bh=140,bx=W/2-bw/2,by=H/2-70;
		drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
		ctx.fillStyle=color;ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText(msg,W/2,by+bh/2-15);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
		drawGoldButton(ctx,btnX,btnY,btnW,btnH,'继续',18);
		lg._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
	}

function renderLanguage(){
	var c=document.getElementById('cognitive-canvas');
	if(!c||c.style.display==='none'||!lg||lg.phase==='idle')return;
	if(window.__cogModule!=='language')return;
	var ctx=c.getContext('2d'),W=c.width,H=c.height;

	ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);

	if(lg.phase==='ready')renderReady(ctx,W,H);
	else if(lg.phase==='ready_start')renderReadyStart(ctx,W,H);
	else if(lg.phase==='tutorial_feedback')renderLgFeedback(ctx,W,H);
	else if(lg.phase==='tutorial_text')renderTutText(ctx,W,H);
	else if(lg.phase==='ready_game')renderReadyGame(ctx,W,H);
	else if(lg.phase==='done')renderDone(ctx,W,H);
	else renderGame(ctx,W,H);
}

function renderTitle(ctx,W,txt,sub){
	ctx.fillStyle='#fff';ctx.font='bold 38px sans-serif';ctx.textAlign='center';
	ctx.fillText(txt,W/2,H?null:null);
	if(sub){ctx.font='18px sans-serif';ctx.fillStyle='#bdc3c7';ctx.fillText(sub,W/2,parseInt(arguments[3]||0));}
	ctx.textAlign='start';
}

	function renderReady(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';
		ctx.fillText('语言理解能力',W/2,H/2-150);
		var bwBox=520,bhBox=100,bxBox=W/2-bwBox/2,byBox=H/2-80;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('指理解和解释口头或书面语言的能力',W/2,byBox+35);ctx.fillText('选择对于图像的描述是否正确',W/2,byBox+65);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始教程',20);
		lg._rb={x:bx,y:by,w:bw,h:bh};
	}
	function renderReadyStart(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('语言理解能力',W/2,H/2-150);
		var bwBox=520,bhBox=100,bxBox=W/2-bwBox/2,byBox=H/2-80;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('指理解和解释口头或书面语言的能力',W/2,byBox+35);ctx.fillText('选择对于图像的描述是否正确',W/2,byBox+65);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=200,bh=56,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始',20);
		lg._rsb={x:bx,y:by,w:bw,h:bh};
	}

	function renderTutText(ctx,W,H){
		var bwBox=560,bhBox=90,bxBox=W/2-bwBox/2,byBox=H/2-60;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('选择对于图像的描述是否正确',W/2,byBox+45);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'继续',18);
		lg._tb={x:bx,y:by,w:bw,h:bh};
	}
		function renderReadyGame(ctx,W,H){
		var bwBox=560,bhBox=90,bxBox=W/2-bwBox/2,byBox=H/2-60;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,16);ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		ctx.fillText('对就是这样，现在正式开始游戏吧',W/2,byBox+45);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=180,bh=50,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawGoldButton(ctx,bx,by,bw,bh,'开始游戏',20);
		lg._rgb={x:bx,y:by,w:bw,h:bh};
	}

	function renderDone(ctx,W,H){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';
		ctx.fillText('语言理解能力',W/2,H/2-160);
		ctx.font='20px sans-serif';ctx.fillStyle='#bdc3c7';
		ctx.fillText('当前测试结束',W/2,H/2-118);
		ctx.textAlign='start';

		var trials=lg.trials||0,correct=lg.score||0,wrong=Math.max(0,trials-correct);
		var compRate=lg.completionRate||(window.__scoring?window.__scoring.computeCompletionRate(trials,window.__scoring.BASELINE.language):0.5);
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
		lg._db1={x:bx1,y:by2,w:bw2,h:bh2};lg._db2={x:bx2,y:by2,w:bw2,h:bh2};
	}

	function renderGame(ctx,W,H){
	if(lg.feedbackText&&performance.now()-lg.feedbackT>lg.feedbackDur)lg.feedbackText='';

	// 倒计时 (仅正式期)
	if(lg.phase==='playing'){
		var left=Math.max(0,Math.ceil((lg.gameEndTime-Date.now())/1000));
		var min=Math.floor(left/60),sec=left%60;
		if(left<=0){lg.phase='done';lg.completionRate=window.__scoring?window.__scoring.computeCompletionRate(lg.trials,window.__scoring.BASELINE.language):0.5;updateUI();return;}
		ctx.fillStyle='#fff';ctx.font='bold 15px sans-serif';ctx.textAlign='center';
		ctx.fillText('倒计时 '+min+':'+(sec<10?'0':'')+sec,W/2,40);
		ctx.textAlign='start';
	}

	var pos=getPositions(W,H);

	// 绘制两个图形: 里面时大轮廓先画,小金图后画 (否则白底盖住金图)
	if(lg.placement==='里面'){
		drawShape(ctx,lg.shapeB,pos.bx,pos.by,pos.bSz,'outline');
		drawShape(ctx,lg.shapeA,pos.ax,pos.ay,pos.aSz,'fill');
	}else{
		drawShape(ctx,lg.shapeA,pos.ax,pos.ay,pos.aSz,'fill');
		drawShape(ctx,lg.shapeB,pos.bx,pos.by,pos.bSz,'outline');
	}

	// 描述文字
	ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';
	ctx.fillText(lg.descText,W/2,H/2+140);
	ctx.textAlign='start';

	// 反馈
	if(lg.feedbackText){
		ctx.font='bold 28px sans-serif';ctx.fillStyle='#4CAF50';ctx.textAlign='center';
		if(lg.feedbackText.indexOf('✗')>=0)ctx.fillStyle='#F44336';
		ctx.fillText(lg.feedbackText,W/2,H/2+180);
		ctx.textAlign='start';
	}

	// 正确/错误 按钮 (始终渲染，点击由 answerGiven 门控)
		var btnW=130,btnH=50,btnY=H/2+200;
		var trueX=W/2-btnW-15,falseX=W/2+15;
		drawGoldButton(ctx,trueX,btnY,btnW,btnH,'正确',20);
		drawGoldButton(ctx,falseX,btnY,btnW,btnH,'错误',20);
		lg._trueBtn={x:trueX,y:btnY,w:btnW,h:btnH};
		lg._falseBtn={x:falseX,y:btnY,w:btnW,h:btnH};
}

function pointInRect(mx,my,r){return mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}
function handleClick(ex,ey){
	var c=document.getElementById('cognitive-canvas');
	if(!c||c.style.display==='none')return false;
	if(window.__cogModule!=='language')return false;
	var rect=c.getBoundingClientRect();
	var mx=(ex-rect.left)*(c.width/rect.width),my=(ey-rect.top)*(c.height/rect.height);

	if(lg.phase==='ready'&&lg._rb&&pointInRect(mx,my,lg._rb)){lg.startTutorial();return true;}
	if(lg.phase==='tutorial_feedback'&&lg._fbBtn&&pointInRect(mx,my,lg._fbBtn)){
		var lgWasOk=lg.tutFeedbackOk;
		if(lgWasOk)genTrial();
		lg.phase='tutorial';lg.tutFeedbackMsg='';lg.answerGiven=false;updateUI();return true;
	}
	if(lg.phase==='tutorial_text'&&lg._tb&&pointInRect(mx,my,lg._tb)){startTutGame();return true;}
	if(lg.phase==='ready_game'&&lg._rgb&&pointInRect(mx,my,lg._rgb)){lg.showReadyStart();return true;}
	if(lg.phase==='ready_start'&&lg._rsb&&pointInRect(mx,my,lg._rsb)){startPlaying();return true;}
	if(lg.phase==='done'&&lg._db1&&pointInRect(mx,my,lg._db1)){lg.showReadyStart();return true;}
	if(lg.phase==='done'&&lg._db2&&pointInRect(mx,my,lg._db2)){window._nextModule("language");return true;}
	if((lg.phase==='tutorial'||lg.phase==='playing')&&!lg.answerGiven){
		if(lg._trueBtn&&pointInRect(mx,my,lg._trueBtn)){handleAnswer(true);return true;}
		if(lg._falseBtn&&pointInRect(mx,my,lg._falseBtn)){handleAnswer(false);return true;}
	}
	return false;
}

// 注册按钮
setTimeout(function(){
	document.querySelectorAll('.cog-mod-btn').forEach(function(btn){
		if(btn.dataset.mod==='language'){
			var fresh=btn.cloneNode(true);
			btn.parentNode.replaceChild(fresh,btn);
			fresh.addEventListener('click',function(){
				document.querySelectorAll('.cog-mod-btn').forEach(function(b){
					b.classList.remove('active');
					if(b.style){b.style.background='';b.style.color='';}
				});
				fresh.classList.add('active');
				if(fresh.style){fresh.style.background='var(--primary)';fresh.style.color='var(--bg-dark)';}
				window.__cogModule='language';
				if(window._showCognitive)window._showCognitive();
				var pi=document.getElementById('cog-panel-planning');
				var ii=document.getElementById('cog-panel-inhibition');
				if(pi)pi.style.display='none';
				if(ii)ii.style.display='block';
				lg.showReady();
			});
		}
	});
},600);

(function loop(){renderLanguage();requestAnimationFrame(loop);})();
(function(){
	var prev=window._handleCogClick;
	window._handleCogClick=function(ex,ey){
		if(window.__cogModule==='language'&&handleClick(ex,ey))return true;
		if(prev)return prev(ex,ey);
		return false;
	};
})();
})();
