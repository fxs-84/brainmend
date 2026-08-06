// 模块3: 场景回忆能力 — 图标位置记忆+放大镜查询
(function(){
var GOLD='#C9A84C',GRID=6,CELL=48,GAP=2,MAX_LIVES=3,INITIAL_ICONS=5,INITIAL_TIME=6;
var ICON_FILES=['a-183_xigua.svg','a-189_shu-4.svg','a-202_daxiang.svg','jianbiandise-01.svg','hanbao.svg','zhaipeisong.svg','gongjiaoche.svg','zhishengji.svg','baicai.svg','dalanqiu.svg'];

var sr=window.__scenerecall={
	phase:'idle',
	grid:[],           // 6×6: 0=empty, >0=icon index+1
	icons:[],          // icon indices used this trial
	positions:[],      // [{r,c,iconIdx}]
	totalIcons:2,
	memorizeTime:3,
	memorizeStart:0,
	queryIdx:0,        // which position is being queried
	queryIcon:-1,      // icon index in magnifying glass
	fingerIcon:-1,     // tutorial_1: icon with finger pointing
	tutRound:1,
	lives:MAX_LIVES,
	correct:0,trials:0,
	showTransparent:false,
	showCardBacks:false,
	feedbackText:'',
	feedbackT:0,
	feedbackColor:'',
	_feedbackDur:1500,
	subPhase:'',       // 'memorize' or 'query'
		tut1Found:-1       // tutorial_1: icon index already found (to hide it)
};

// Load icon images
var iconImgs=[];
for(var fi=0;fi<ICON_FILES.length;fi++){(function(idx){var img=new Image();img.onload=function(){iconImgs[idx]=img;};img.src='./assets/'+ICON_FILES[idx];})(fi);}

function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.05);o.frequency.setValueAtTime(2000,t+.1);g.gain.setValueAtTime(.1,t);g.gain.setValueAtTime(.1,t+.1);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.3);}catch(e){}}
function playClick(){try{var a3=new(window.AudioContext||window.webkitAudioContext)(),t3=a3.currentTime,o3=a3.createOscillator(),g3=a3.createGain();o3.connect(g3);g3.connect(a3.destination);o3.type='sine';o3.frequency.setValueAtTime(1800,t3);o3.frequency.setValueAtTime(1200,t3+.03);g3.gain.setValueAtTime(.06,t3);g3.gain.exponentialRampToValueAtTime(.001,t3+.06);o3.start(t3);o3.stop(t3+.08);}catch(e){}}
function playError(){try{var a2=new(window.AudioContext||window.webkitAudioContext)(),t2=a2.currentTime,o2=a2.createOscillator(),g2=a2.createGain();o2.connect(g2);g2.connect(a2.destination);o2.type='square';o2.frequency.setValueAtTime(200,t2);o2.frequency.linearRampToValueAtTime(100,t2+.25);g2.gain.setValueAtTime(.15,t2);g2.gain.exponentialRampToValueAtTime(.001,t2+.3);o2.start(t2);o2.stop(t2+.3);}catch(e){}}
function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

function randInt(min,max){return min+Math.floor(Math.random()*(max-min+1));}

function pickIcons(n){
	// Pick n unique random icon indices
	var pool=[];for(var i=0;i<10;i++)pool.push(i);
	for(var i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=pool[i];pool[i]=pool[j];pool[j]=t;}
	return pool.slice(0,n);
}

function genTrial(n,memTime){
	sr.totalIcons=n;sr.memorizeTime=memTime;sr.grid=[];for(var r=0;r<GRID;r++){sr.grid[r]=[];for(var c=0;c<GRID;c++)sr.grid[r][c]=0;}
	sr.icons=pickIcons(n);sr.positions=[];sr.queryIdx=0;sr.queryIcon=-1;sr.fingerIcon=-1;
	sr.feedbackText='';sr.tut1Found=-1;
	var all=[];for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)all.push({r:r,c:c});
	for(var i=all.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=all[i];all[i]=all[j];all[j]=t;}
	for(var k=0;k<n;k++){sr.positions.push({r:all[k].r,c:all[k].c,iconIdx:sr.icons[k]});sr.grid[all[k].r][all[k].c]=sr.icons[k]+1;}
	sr.subPhase='memorize';sr.memorizeStart=performance.now();
}

function startQuery(){
	sr.subPhase='query';
	if(sr.phase==='tutorial_1'){sr.queryIcon=sr.icons[0];sr.fingerIcon=sr.icons[0];}
	else{sr.queryIdx=0;sr.queryIcon=sr.icons[0];}
}

function handleCorrectIcon(){
	playClick();
	var isTut1=sr.phase==='tutorial_1';
	if(isTut1){
		if(sr.queryIcon===sr.icons[0]){sr.tut1Found=sr.icons[0];sr.queryIcon=sr.icons[1];sr.fingerIcon=sr.icons[1];}
		else{tutorial1Done();}
		return;
	}
	sr.queryIdx++;
	if(sr.queryIdx>=sr.totalIcons){trialCorrect();}
	else{sr.queryIcon=sr.icons[sr.queryIdx];}
}

function handleWrongIcon(){
	playError();
	var isTut=sr.phase==="tutorial_1"||sr.phase==="tutorial_2"||sr.phase==="tutorial_3";
	if(isTut){
		sr.showFeedback("✗ 错误","#F44336",600);
		setTimeout(function(){genTrial(sr.totalIcons,sr.memorizeTime);updateUI();},800);
		return;
	}
	sr.trials++;
	sr.lives--;
	if(sr.lives<=0){sr.phase="done";updateUI();return;}
	sr.totalIcons=Math.max(2,sr.totalIcons-1);sr.memorizeTime=Math.max(2,sr.memorizeTime-1);
	sr.showFeedback("✗ 错误","#F44336",600);
	setTimeout(function(){genTrial(sr.totalIcons,sr.memorizeTime);updateUI();},800);
}

function tutorial1Done(){
	sr.subPhase='';sr.phase='tutorial_2_hint';
	sr.feedbackText='';sr.queryIcon=-1;sr.fingerIcon=-1;
}
function trialCorrect(){
	playCoin();
	var isTut=sr.phase==='tutorial_2'||sr.phase==='tutorial_3';
	if(sr.phase==='tutorial_2'){sr.showFeedback('对就是这样，下面开始下一关','#fff',0,startTut3);return;}
	if(sr.phase==='tutorial_3'){sr.showReadyGame();return;}
	sr.correct++;sr.trials++;
	sr.totalIcons++;sr.memorizeTime++;
	genTrial(sr.totalIcons,sr.memorizeTime);updateUI();
}

sr.showFeedback=function(text,color,dur,cb){sr.feedbackText=text;sr.feedbackColor=color;sr.feedbackT=performance.now();sr._feedbackDur=(dur===0?999999:(dur||1500));sr._feedbackCb=cb||null;};

function updateUI(){
	var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
	if(st){if(sr.phase==='ready')st.textContent='场景回忆能力';else if(sr.phase==='tutorial_text')st.textContent='游戏规则';else if(sr.phase==='tutorial_2_hint')st.textContent='教程提示';else if(sr.phase==='tutorial_1')st.textContent='教程1-引导';else if(sr.phase==='tutorial_2')st.textContent='教程2-半透明';else if(sr.phase==='tutorial_3')st.textContent='教程3-卡牌';else if(sr.phase==='ready_game')st.textContent='准备开始';else st.textContent='';}
	if(sc)sc.textContent='';
}

sr.showReady=function(){sr.phase='ready';updateUI();};
sr.startTutorial=function(){sr.phase='tutorial_text';updateUI();};
function startTut1(){sr.phase='tutorial_1';sr.tutRound=1;genTrial(2,3);updateUI();}
function startTut2(){sr.phase='tutorial_2';sr.tutRound=2;sr.showTransparent=true;genTrial(3,4);updateUI();}
function startTut3(){sr.phase='tutorial_3';sr.tutRound=3;sr.showCardBacks=true;genTrial(4,5);updateUI();}
sr.showReadyGame=function(){sr.phase='ready_game';updateUI();};
sr.showReadyStart=function(){sr.phase='ready_start';updateUI();};
function startPlaying(){sr.phase='playing';sr.trials=0;sr.correct=0;sr.lives=MAX_LIVES;sr.showCardBacks=true;genTrial(INITIAL_ICONS,INITIAL_TIME);updateUI();}

function gridMetrics(W,H){var gw=GRID*(CELL+GAP)-GAP,gh=gw;return{gw:gw,gh:gh,ox:W/2-gw/2,oy:H/2-gh/2-10};}

function renderSceneRecall(){
	var c=document.getElementById('cognitive-canvas');if(!c||c.style.display==='none'||!sr||sr.phase==='idle')return;
	if(window.__cogModule!=='scenerecall')return;
	var ctx=c.getContext('2d'),W=c.width,H=c.height;
	if(sr.feedbackText&&performance.now()-sr.feedbackT>sr._feedbackDur)sr.feedbackText='';
	ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);

	if(sr.phase==='ready')renderReady(ctx,W,H,false);
	else if(sr.phase==='ready_start')renderReady(ctx,W,H,true);
	else if(sr.phase==='tutorial_text')renderTutText(ctx,W,H);
	else if(sr.phase==='tutorial_2_hint')renderTut2Hint(ctx,W,H);
	else if(sr.phase==='ready_game')renderReadyGame(ctx,W,H);
	else if(sr.phase==='done')renderDone(ctx,W,H);
	else renderGame(ctx,W,H);
}

	function renderReady(ctx,W,H,isStart){
		ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('场景回忆能力',W/2,H/2-150);
		var t1='考验你回忆特殊事件的能力',t2='分数越高代表着你记忆力越强';ctx.font='bold 18px sans-serif';var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-58;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t1,W/2,byBox+27);ctx.fillText(t2,W/2,byBox+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=160,bh=48,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(isStart?'开始':'开始教程',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		sr._rb={x:bx,y:by,w:bw,h:bh};
	}

	function renderTutText(ctx,W,H){
		var lines=["记住元素的位置","之后点击放大镜中出现的元素的位置"];
		var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-50;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
		for(var i=0;i<lines.length;i++)ctx.fillText(lines[i],W/2,byBox+30+i*38);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		sr._tb={x:bx,y:by,w:bw,h:bh};
	}
	function renderTut2Hint(ctx,W,H){
	var t='接下来将完全不透明，并且增加时间限制，准备好了吗';
	var bwBox=440,bhBox=74,bxBox=W/2-bwBox/2,byBox=H/2-50;
	drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
	ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,byBox+50);
	ctx.textBaseline='alphabetic';ctx.textAlign='start';
	var bw=140,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
	drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
	ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
	sr._th={x:bx,y:by,w:bw,h:bh};
}

	function renderReadyGame(ctx,W,H){
		var bwBox=440,bhBox=68,bxBox=W/2-bwBox/2,byBox=H/2-45;
		drawRR(ctx,bxBox,byBox,bwBox,bhBox,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('对就是这样，现在正式开始游戏吧',W/2,byBox+34);
		ctx.textBaseline='alphabetic';ctx.textAlign='start';
		var bw=160,bh=44,bx=W/2-bw/2,by=byBox+bhBox+10;
		drawRR(ctx,bx,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
		ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始游戏',W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
		sr._rgb={x:bx,y:by,w:bw,h:bh};
	}
	function renderDone(ctx,W,H){
	ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('场景回忆能力',W/2,H/2-130);ctx.textAlign='start';
	ctx.font='bold 22px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-70);ctx.textAlign='start';
	var bw=160,bh=48,by=H/2,bx1=W/2-bw-20,bx2=W/2+20;
	drawRR(ctx,bx1,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
	drawRR(ctx,bx2,by,bw,bh,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
	sr._db1={x:bx1,y:by,w:bw,h:bh};sr._db2={x:bx2,y:by,w:bw,h:bh};
}

function drawMagnifier(ctx,cx,cy,r){
	ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
	ctx.beginPath();ctx.moveTo(cx+r*0.7,cy+r*0.7);ctx.lineTo(cx+r*1.3,cy+r*1.3);ctx.lineWidth=4;ctx.stroke();
}

function renderGame(ctx,W,H){
	var m=gridMetrics(W,H),ox=m.ox,oy=m.oy,gw=m.gw,gh=m.gh;
	var isTut1=sr.phase==='tutorial_1';
	var isQuery=sr.subPhase==='query';

	if(sr.feedbackText&&!isTut1){var bw=460,bh=130,bx=W/2-bw/2,by=H/2-80;drawRR(ctx,bx,by,bw,bh,16);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#1a1a2e';ctx.fill();ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=sr.feedbackColor;ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sr.feedbackText,W/2,by+bh/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';if(sr._feedbackCb){var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;drawRR(ctx,btnX,btnY,btnW,btnH,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',btnX+btnW/2,btnY+btnH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';sr._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};}return;}

	var remaining=0;
	if(sr.subPhase==='memorize'){remaining=Math.max(0,sr.memorizeTime-(performance.now()-sr.memorizeStart)/1000);if(remaining<=0)startQuery();}

	// Countdown display
	if(sr.subPhase==='memorize'){
		ctx.font='bold 14px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('剩余记忆时间',W/2,oy-65);
		ctx.font='bold 36px monospace';ctx.fillStyle=remaining<2?'#F44336':'#fff';ctx.fillText(Math.ceil(remaining)+'s',W/2,oy-25);
		ctx.textAlign='start';
	}

	// Lives in query phase
	if(isQuery&&sr.phase==='playing'){
		ctx.font='bold 14px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('剩余尝试次数',W/2,oy-65);
		var h='';for(var li=0;li<MAX_LIVES;li++)h+=li<sr.lives?'❤️':'🖤';ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';ctx.fillText(h,W/2,oy-42);ctx.textAlign='start';
	}

	// Draw grid cells (no visible border unless tutorial_3 or formal)

	for(var r=0;r<GRID;r++){
		for(var c2=0;c2<GRID;c2++){
			var x=ox+c2*(CELL+GAP),y=oy+r*(CELL+GAP);
			var val=sr.grid[r][c2];
			if(val===0)continue;

			if(sr.subPhase==='memorize'||(isQuery&&isTut1)){
				// Hide already-found icon in tutorial 1 query
				if(isQuery&&isTut1&&sr.tut1Found===val-1)continue;
				// Show icon during memorization, and during tutorial 1 query (icons stay in grid)
				var img=iconImgs[val-1];
				drawRR(ctx,x+2,y+2,CELL-4,CELL-4,4);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();if(img&&img.complete)ctx.drawImage(img,x+4,y+4,CELL-8,CELL-8);
				// Finger pointer for tutorial 1 query
				if(isQuery&&isTut1&&sr.fingerIcon===val-1){
					ctx.font='bold 28px sans-serif';ctx.fillStyle='#FF9800';ctx.textAlign='center';
					ctx.fillText('☝',x+CELL/2,y-12);
					ctx.font='bold 11px sans-serif';ctx.fillText('提示：这里是正确答案',x+CELL/2,y-30);
					ctx.textAlign='start';
				}
			}else if(isQuery){
				// Hide icons that have already been found (queryIdx tracks progress)
				if(!isTut1){var foundPos=sr.icons.indexOf(val-1);if(foundPos>=0&&foundPos<sr.queryIdx)continue;}
				if(sr.showCardBacks){
					// Card back
					drawRR(ctx,x,y,CELL,CELL,6);ctx.fillStyle='rgba(201,168,76,0.2)';ctx.fill();ctx.strokeStyle=GOLD;ctx.lineWidth=1.5;ctx.stroke();
					// Draw a simple pattern on card back
					ctx.fillStyle='rgba(201,168,76,0.3)';ctx.fillRect(x+8,y+8,CELL-16,CELL-16);
				}else if(sr.showTransparent){
					// Draw icon normally first, then overlay blue semi-transparent card
					var img2=iconImgs[val-1];
					drawRR(ctx,x+2,y+2,CELL-4,CELL-4,4);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
					if(img2&&img2.complete)ctx.drawImage(img2,x+4,y+4,CELL-8,CELL-8);
					// Blue semi-transparent overlay card on top
					drawRR(ctx,x,y,CELL,CELL,6);ctx.fillStyle='rgba(33,150,243,0.25)';ctx.fill();
					drawRR(ctx,x,y,CELL,CELL,6);ctx.strokeStyle='rgba(33,150,243,0.8)';ctx.lineWidth=2;ctx.stroke();
				}
			}
		}
	}

	// Query phase: magnifying glass at top
	if(isQuery&&!isTut1){
		// Magnifier above grid
		var mgX=W/2-30,mgY=oy-55,mgR=20;
		drawMagnifier(ctx,mgX,mgY,mgR);
		// White background inside magnifier
		ctx.beginPath();ctx.arc(mgX,mgY,mgR-2,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
		// Show query icon inside magnifier
		if(sr.queryIcon>=0){
			var qImg=iconImgs[sr.queryIcon];
			if(qImg&&qImg.complete)ctx.drawImage(qImg,mgX-mgR+4,mgY-mgR+4,mgR*2-8,mgR*2-8);
		}
		ctx.font='bold 14px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='left';ctx.fillText('放大镜内的物体在哪？',mgX+mgR+10,mgY+5);ctx.textAlign='start';
	}

	// Tutorial 1: magnifier with white bg + finger on grid
	if(isTut1&&isQuery){
		var mgX2=W/2,mgY2=oy-50,mgR2=22;
		drawMagnifier(ctx,mgX2,mgY2,mgR2);
		// White background inside magnifier
		ctx.beginPath();ctx.arc(mgX2,mgY2,mgR2-2,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
		if(sr.queryIcon>=0){
			var qImg2=iconImgs[sr.queryIcon];
			if(qImg2&&qImg2.complete)ctx.drawImage(qImg2,mgX2-mgR2+4,mgY2-mgR2+4,mgR2*2-8,mgR2*2-8);
		}
		ctx.font='bold 14px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText('放大镜内的物体在哪？',W/2,oy-70);ctx.textAlign='start';
		sr._iconBtns=null;
	}

	// Hitboxes for query phase (grid positions, including tutorial 1)
	sr._posHitboxes=[];
	if(isQuery){for(var i3=0;i3<sr.positions.length;i3++){var p=sr.positions[i3];sr._posHitboxes.push({idx:i3,x:ox+p.c*(CELL+GAP),y:oy+p.r*(CELL+GAP),w:CELL,h:CELL});}}

	// Instructional text
	if(isQuery&&!isTut1){ctx.font='bold 15px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('点击放大镜中元素对应位置',W/2,oy+gh+40);ctx.textAlign='start';}
	if(isQuery&&isTut1){ctx.font='bold 15px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('点击手指指向的元素位置',W/2,oy+gh+40);ctx.textAlign='start';}
}

function handleClick(ex,ey){
	var c=document.getElementById('cognitive-canvas');if(!c||c.style.display==='none')return false;
	if(window.__cogModule!=='scenerecall')return false;
	var rect=c.getBoundingClientRect();if(!rect)return false;
	var mx=(ex-rect.left)*(c.width/rect.width),my=(ey-rect.top)*(c.height/rect.height);

	if((sr.phase==='ready'||sr.phase==='ready_start')&&sr._rb){var rb=sr._rb;if(mx>=rb.x&&mx<=rb.x+rb.w&&my>=rb.y&&my<=rb.y+rb.h){if(sr.phase==='ready_start'){startPlaying();}else{sr.startTutorial();}return true;}return false;}
	if(sr.phase==='tutorial_text'&&sr._tb){var tb=sr._tb;if(mx>=tb.x&&mx<=tb.x+tb.w&&my>=tb.y&&my<=tb.y+tb.h){startTut1();return true;}return false;}
	if(sr.phase==='tutorial_2_hint'&&sr._th){var th=sr._th;if(mx>=th.x&&mx<=th.x+th.w&&my>=th.y&&my<=th.y+th.h){startTut2();return true;}return false;}
	if(sr.phase==='ready_game'&&sr._rgb){var rgb=sr._rgb;if(mx>=rgb.x&&mx<=rgb.x+rgb.w&&my>=rgb.y&&my<=rgb.y+rgb.h){sr.showReadyStart();return true;}return false;}
	if(sr.phase==='done'){if(sr._db1&&mx>=sr._db1.x&&mx<=sr._db1.x+sr._db1.w&&my>=sr._db1.y&&my<=sr._db1.y+sr._db1.h){sr.showReadyStart();return true;}if(sr._db2&&mx>=sr._db2.x&&mx<=sr._db2.x+sr._db2.w&&my>=sr._db2.y&&my<=sr._db2.y+sr._db2.h){window._nextModule("scenerecall");return true;}return false;}

	// Tutorial 1: click grid position matching query icon
	if(sr.phase==='tutorial_1'&&sr.subPhase==='query'&&sr._posHitboxes){
		for(var i=0;i<sr._posHitboxes.length;i++){var ph=sr._posHitboxes[i];if(mx>=ph.x&&mx<=ph.x+ph.w&&my>=ph.y&&my<=ph.y+ph.h){if(sr.positions[ph.idx].iconIdx===sr.queryIcon)handleCorrectIcon();return true;}}
	}

	// Query phase: click grid position
	if(sr.feedbackText&&sr._fbBtn&&mx>=sr._fbBtn.x&&mx<=sr._fbBtn.x+sr._fbBtn.w&&my>=sr._fbBtn.y&&my<=sr._fbBtn.y+sr._fbBtn.h){if(sr._feedbackCb){sr.feedbackText='';sr._feedbackCb();}return true;}if(sr.subPhase==='query'&&sr._posHitboxes){
		for(var i2=0;i2<sr._posHitboxes.length;i2++){var ph=sr._posHitboxes[i2];if(mx>=ph.x&&mx<=ph.x+ph.w&&my>=ph.y&&my<=ph.y+ph.h){if(sr.positions[ph.idx].iconIdx===sr.queryIcon)handleCorrectIcon();else handleWrongIcon();return true;}}
	}
	return false;
}

setTimeout(function(){
	document.querySelectorAll('.cog-mod-btn').forEach(function(btn){if(btn.dataset.mod==='scenerecall'){btn.addEventListener('click',function(){document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');b.style.background='transparent';b.style.color='var(--text)';});btn.classList.add('active');btn.style.background='var(--primary)';btn.style.color='var(--bg-dark)';window.__cogModule='scenerecall';if(window._showCognitive)window._showCognitive();document.getElementById('cog-panel-planning').style.display='none';document.getElementById('cog-panel-inhibition').style.display='block';sr.showReady();});}});
},600);

(function loop(){renderSceneRecall();requestAnimationFrame(loop);})();
(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='scenerecall'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();
})();
