// 模块7: 变通能力 — 心理旋转
(function(){
var GOLD='#C9A84C',TIME_LIMIT=60,GRID=6,CELL=36,GAP=2;
var fl=window.__flex={phase:'idle',blocks:0,leftGrid:[],rightGrid:[],isSame:true,rotated:0,userAnswer:'',answerChecked:false,showOverlay:false,overlayT:0,tutRound:0,tutCorrect:0,timer:TIME_LIMIT,t0:0,correct:0,trials:0,consecutiveCorrect:0};

function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.05);o.frequency.setValueAtTime(2000,t+.1);g.gain.setValueAtTime(.1,t);g.gain.setValueAtTime(.1,t+.1);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.3);}catch(e){}}
function playError(){try{var a2=new(window.AudioContext||window.webkitAudioContext)(),t2=a2.currentTime,o2=a2.createOscillator(),g2=a2.createGain();o2.connect(g2);g2.connect(a2.destination);o2.type='square';o2.frequency.setValueAtTime(200,t2);o2.frequency.linearRampToValueAtTime(100,t2+.25);g2.gain.setValueAtTime(.15,t2);g2.gain.exponentialRampToValueAtTime(.001,t2+.3);o2.start(t2);o2.stop(t2+.3);}catch(e){}}
function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

// 生成随机方块图案 (GRID×GRID, nBlocks个方块, 每个是蓝或橙)
function genPattern(nBlocks){
    var grid=[];for(var r=0;r<GRID;r++){grid[r]=[];for(var c=0;c<GRID;c++)grid[r][c]=0;}
    var cells=[];for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)cells.push({r:r,c:c});
    for(var i=cells.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=cells[i];cells[i]=cells[j];cells[j]=t;}
    for(var k=0;k<nBlocks&&k<cells.length;k++){var cl=cells[k];grid[cl.r][cl.c]=Math.random()<0.5?1:2;} // 1=蓝 2=橙
    // 保证至少含蓝+橙各一个 (nBlocks>=2时)
    if(nBlocks>=2){var allSame=true,first=grid[cells[0].r][cells[0].c];for(var k=1;k<nBlocks;k++){if(grid[cells[k].r][cells[k].c]!==first){allSame=false;break;}}if(allSame){var flipIdx=Math.floor(Math.random()*nBlocks);grid[cells[flipIdx].r][cells[flipIdx].c]=first===1?2:1;}}
    return grid;
}
// 旋转90度 (dir=1顺时针, -1逆时针)
function rotateGrid(grid,dir){
    var n=grid.length,rot=[];for(var r=0;r<n;r++){rot[r]=[];for(var c=0;c<n;c++)rot[r][c]=0;}
    if(dir===1){for(var r=0;r<n;r++)for(var c=0;c<n;c++)rot[c][n-1-r]=grid[r][c];}
    else{for(var r=0;r<n;r++)for(var c=0;c<n;c++)rot[n-1-c][r]=grid[r][c];}
    return rot;
}
// 是否相等
function gridsEqual(a,b){for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)if(a[r][c]!==b[r][c])return false;return true;}

function copyGrid(g){var n=[];for(var r=0;r<GRID;r++){n[r]=[];for(var c=0;c<GRID;c++)n[r][c]=g[r][c];}return n;}
	function emptyNeighbors(grid,r,c){var nb=[];if(r>0&&!grid[r-1][c])nb.push({r:r-1,c:c});if(r<GRID-1&&!grid[r+1][c])nb.push({r:r+1,c:c});if(c>0&&!grid[r][c-1])nb.push({r:r,c:c-1});if(c<GRID-1&&!grid[r][c+1])nb.push({r:r,c:c+1});return nb;}
	// 从rotated出发做微小改动: 换色或移1格
	function genSimilar(rotated,nChanges){
		var g=copyGrid(rotated);
		var occ=[];for(var r=0;r<GRID;r++)for(var c=0;c<GRID;c++)if(g[r][c])occ.push({r:r,c:c});
		if(occ.length===0)return g;
		for(var i=0;i<nChanges&&i<occ.length;i++){
			var idx=Math.floor(Math.random()*occ.length),cell=occ[idx];
			if(Math.random()<0.5){
				g[cell.r][cell.c]=g[cell.r][cell.c]===1?2:1;
			}else{
				var nb=emptyNeighbors(g,cell.r,cell.c);
				if(nb.length>0){var np=nb[Math.floor(Math.random()*nb.length)];g[np.r][np.c]=g[cell.r][cell.c];g[cell.r][cell.c]=0;occ[idx]=np;}
				else{g[cell.r][cell.c]=g[cell.r][cell.c]===1?2:1;}
			}
		}
		return g;
	}
	function genTrial(n){
		fl.blocks=n;fl.leftGrid=genPattern(n);fl.rotated=Math.random()<0.5?1:-1;
		var rotated=rotateGrid(fl.leftGrid,fl.rotated);
		if(Math.random()<0.5){fl.isSame=true;fl.rightGrid=rotated;}
		else{
			fl.isSame=false;
			var streak=fl.consecutiveCorrect||0;
			var nChanges=streak>=7?1:(streak>=4?(Math.random()<0.5?1:2):(streak>=2?2:3));
			var diff=genSimilar(rotated,nChanges);
			while(gridsEqual(diff,rotated)||gridsEqual(diff,fl.leftGrid))diff=genSimilar(rotated,nChanges);
			fl.rightGrid=diff;
		}
		fl.userAnswer='';fl.answerChecked=false;fl.showOverlay=false;fl._btn1=null;fl._btn2=null;
	}
function updateUI(){
    var st=document.getElementById('stroop-status'),sc=document.getElementById('stroop-score');
    if(st){if(fl.phase==='ready')st.textContent='变通能力测试';else if(fl.phase==='tutorial_text')st.textContent='游戏规则';else if(fl.phase==='tutorial_1'||fl.phase==='tutorial_2')st.textContent='教程 ('+(fl.phase==='tutorial_1'?'4格':'5格')+')';else if(fl.phase==='ready_game')st.textContent='准备开始';else if(fl.phase==='playing')st.textContent='';else if(fl.phase==='done')st.textContent='';}
    if(sc)sc.textContent=fl.phase==='playing'?'正确:'+fl.correct+'/'+fl.trials:'';
}
fl.showReady=function(){fl.phase='ready';updateUI();};
fl.startTutorial=function(){fl.phase='tutorial_text';updateUI();};
function startTut1(){fl.phase='tutorial_1';fl.tutRound=1;fl.tutCorrect=0;genTrial(4);updateUI();}
function startTut2(){fl.phase='tutorial_2';fl.tutRound=2;fl.tutCorrect=0;genTrial(5);updateUI();}
fl.showReadyGame=function(){fl.phase='ready_game';updateUI();};
fl.showReadyStart=function(){fl.phase='ready_start';updateUI();};
function randBlocks(){var streak=fl.consecutiveCorrect||0;if(streak>=7)return 12+Math.floor(Math.random()*3);if(streak>=4)return 9+Math.floor(Math.random()*3);if(streak>=2)return 7+Math.floor(Math.random()*3);return 5+Math.floor(Math.random()*4);}function startPlaying(){fl.phase='playing';fl.trials=0;fl.correct=0;fl.timer=TIME_LIMIT;fl.t0=performance.now();fl.consecutiveCorrect=0;fl.blocks=randBlocks();fl.answerChecked=false;genTrial(fl.blocks);updateUI();}

fl.answer=function(a){
    if(fl.phase!=='tutorial_1'&&fl.phase!=='tutorial_2'&&fl.phase!=='playing')return;
    if(fl.answerChecked)return;
    var correctAnswer=fl.isSame?'相同':'不同';
    var ok=(a===correctAnswer);
    fl.userAnswer=a;fl.answerChecked=true;fl._answerT=performance.now();
    if(ok){playCoin();if(fl.phase!=='tutorial_1'&&fl.phase!=='tutorial_2'){fl.correct++;fl.consecutiveCorrect++;}}else{if(fl.phase!=='tutorial_1'&&fl.phase!=='tutorial_2')fl.consecutiveCorrect=0;}
    fl.trials++;
    // Tutorial: feedback page
    if(fl.phase==='tutorial_1'||fl.phase==='tutorial_2'){
        fl._prevPhase=fl.phase;
        fl.tutFeedbackOk=ok;
        if(ok){fl.tutCorrect++;}
        fl.tutFeedbackMsg=ok?(fl._prevPhase==='tutorial_1'?'对，再试一个':'对，现在正式开始游戏吧'):'哦，不对';
        setTimeout(function(){if(fl._prevPhase==='tutorial_2'){fl.showReadyGame();}else{fl.phase='tutorial_feedback';}updateUI();},2000);
        updateUI();
        return;
    }
    // 正式游戏
    setTimeout(function(){fl.blocks=randBlocks();genTrial(fl.blocks);updateUI();},800);
    updateUI();
};

function renderFlFeedback(ctx,W,H){
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
    var msg=fl.tutFeedbackMsg||(fl.tutFeedbackOk?'对，再试一个':'哦，不对');
    var color='#fff';
    var bw=440,bh=88,bx=W/2-bw/2,by=H/2-70;
    drawRR(ctx,bx,by,bw,bh,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=color;ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(msg,W/2,by+bh/2-15);
    ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var btnW=140,btnH=44,btnX=W/2-btnW/2,btnY=by+bh+10;
    drawRR(ctx,btnX,btnY,btnW,btnH,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',btnX+btnW/2,btnY+btnH/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    fl._fbBtn={x:btnX,y:btnY,w:btnW,h:btnH};
}

function renderFlex(){
    var c=document.getElementById('cognitive-canvas');if(!c||c.style.display==='none'||!fl||fl.phase==='idle')return;
    if(window.__cogModule!=='flex')return;var ctx=c.getContext('2d'),W=c.width,H=c.height;
    if(fl.phase==='playing'&&fl.t0>0){fl.timer=Math.max(0,TIME_LIMIT-(performance.now()-fl.t0)/1000);if(fl.timer<=0){fl.phase='done';fl.completionRate=window.__scoring?window.__scoring.computeCompletionRate(fl.trials,window.__scoring.BASELINE.flex):0.5;updateUI();}}
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,W,H);
    if(fl.phase==='ready')renderFlReady(ctx,W,H,false);else if(fl.phase==='ready_start')renderFlReady(ctx,W,H,true);
    else if(fl.phase==='tutorial_feedback')renderFlFeedback(ctx,W,H);
    else if(fl.phase==='tutorial_text')renderFlTutorial(ctx,W,H);else if(fl.phase==='ready_game')renderFlReadyGame(ctx,W,H);
    else if(fl.phase==='done')renderFlDone(ctx,W,H);else renderFlGame(ctx,W,H);
}
function renderFlReady(ctx,W,H,isStart){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('变通能力测试',W/2,H/2-130);ctx.textAlign='start';
    var t1='考验你大脑灵活变通的能力',t2='分数越高代表着你的思考方式越灵活';ctx.font='bold 18px sans-serif';var bw=440,bh=88,bx=W/2-bw/2,by=H/2-70;drawRR(ctx,bx,by,bw,bh,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t1,W/2,by+40);ctx.fillText(t2,W/2,by+68);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=160,bh2=48,bx2=W/2-bw2/2,by2=by+bh+10;
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(isStart?'开始':'开始教程',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';fl._rb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderFlTutorial(ctx,W,H){
    var t='请在脑中尝试旋转图像，对比左右两张图片是否完全一致';ctx.font='bold 18px sans-serif';var bw=440,bh=76,bx=W/2-bw/2,by=H/2-65;
    drawRR(ctx,bx,by,bw,bh,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,by+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=140,bh2=44,bx2=W/2-bw2/2,by2=by+bh+10;drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('继续',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';fl._tb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderFlReadyGame(ctx,W,H){
    var t='对就是这样，现在正式开始游戏吧';ctx.font='bold 22px sans-serif';var tw=ctx.measureText(t).width;var bw=tw+120,bh=76,bx=W/2-bw/2,by=H/2-65;
    drawRR(ctx,bx,by,bw,bh,12);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,by+50);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    var bw2=160,bh2=44,bx2=W/2-bw2/2,by2=by+bh+10;drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('开始游戏',W/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';fl._rgb={x:bx2,y:by2,w:bw2,h:bh2};
}
function renderFlDone(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('变通能力测试',W/2,H/2-180);ctx.textAlign='start';
    ctx.font='bold 20px sans-serif';ctx.fillStyle='#bdc3c7';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-135);ctx.textAlign='start';

    var trials=fl.trials||0,correct=fl.correct||0,wrong=Math.max(0,trials-correct);
    var compRate=fl.completionRate||(window.__scoring?window.__scoring.computeCompletionRate(trials,window.__scoring.BASELINE.flex):0.5);
    var finalScore=Math.min(150,Math.max(5,Math.round(compRate*(trials>0?correct/trials:0)*150)));
    var cardW=440,cardH=130,cardX=W/2-cardW/2,cardY=H/2-100;
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
    drawRR(ctx,bx1,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    fl._db1={x:bx1,y:by2,w:bw2,h:bh2};fl._db2={x:bx2,y:by2,w:bw2,h:bh2};
}

function drawGrid(ctx,grid,ox,oy,gw,gh){
    // 只画大边框, 不画小格子
    drawRR(ctx,ox,oy,gw,gh,10);ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    for(var r=0;r<GRID;r++)for(var c2=0;c2<GRID;c2++){var x=ox+c2*(CELL+GAP),y=oy+r*(CELL+GAP);if(grid[r][c2]){drawRR(ctx,x,y,CELL,CELL,4);ctx.fillStyle=grid[r][c2]===1?'#2196F3':'#FF9800';ctx.fill();}}
}

function renderFlGame(ctx,W,H){
    var gw=GRID*(CELL+GAP)-GAP,gh=gw,oxL=W/2-gw-30,oy=H/2-gh/2-30,oxR=W/2+30;
    // 标题
    ctx.font='bold 20px sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText('对比左右两张图片',W/2,oy-30);ctx.textAlign='start';
    if(fl.phase==='playing'){var min=Math.floor(fl.timer/60),sec=Math.floor(fl.timer%60);ctx.fillStyle=fl.timer<10?'#F44336':'#aaa';ctx.font='bold 24px monospace';ctx.textAlign='right';ctx.fillText(min+':'+(sec<10?'0':'')+sec,W-20,40);ctx.textAlign='start';
        ctx.fillStyle='#888';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(fl.correct+'/'+fl.trials,W/2,25);ctx.textAlign='start';}
    // 左右框
    var isTutorial=(fl.phase==='tutorial_1'||fl.phase==='tutorial_2');
    var animating=fl.answerChecked&&isTutorial;
    // 非动画时画静态左右图; 动画时左图从动画路径画, 右图消失
    if(!animating){drawGrid(ctx,fl.leftGrid,oxL,oy,gw,gh);drawGrid(ctx,fl.rightGrid,oxR,oy,gw,gh);}
    // 教程: 左右图往中心移动, 右图旋转重叠
    if(animating){
        var n2=performance.now(),animT=n2-fl._answerT;
        var dur=2000,t2=Math.min(1,animT/dur);
        var ease=1-Math.pow(1-t2,3);
        var centerX=W/2-gw/2;
        var oxL2=oxL+(centerX-oxL)*ease;
        var oxR2=oxR+(centerX-oxR)*ease;
        drawGrid(ctx,fl.leftGrid,oxL2,oy,gw,gh);
        // 右图纯canvas旋转 (不预转数据, 反向旋转以对比)
        ctx.save();
        ctx.globalAlpha=1-ease*0.2;
        ctx.translate(oxR2+gw/2,oy+gh/2);
        ctx.rotate(-ease*Math.PI/2*fl.rotated);
        drawGrid(ctx,fl.rightGrid,-gw/2,-gh/2,gw,gh);
        ctx.restore();
    }

    // 下方按钮 (始终渲染，点击由 answerChecked 门控)
    ctx.font='bold 18px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';
    ctx.fillText('旋转后，两侧的图案是否一致？',W/2,oy+gh+20);
    ctx.textAlign='start';
    var by=oy+gh+50,bw2=140,bh2=48,gap=40;
    var bx1=W/2-bw2-gap/2,bx2=W/2+gap/2;
    drawRR(ctx,bx1,by,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('相同',bx1+bw2/2,by+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    drawRR(ctx,bx2,by,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=GOLD;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('不同',bx2+bw2/2,by+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    fl._btn1={x:bx1,y:by,w:bw2,h:bh2};fl._btn2={x:bx2,y:by,w:bw2,h:bh2};
}

function handleClick(ex,ey){
    var c2=document.getElementById('cognitive-canvas');if(!c2||c2.style.display==='none')return false;
    if(window.__cogModule!=='flex')return false;var rect=c2.getBoundingClientRect();if(!rect)return false;
    var mx=(ex-rect.left)*(c2.width/rect.width),my=(ey-rect.top)*(c2.height/rect.height);
    if(fl.phase==='tutorial_feedback'&&fl._fbBtn){var fb=fl._fbBtn;if(mx>=fb.x&&mx<=fb.x+fb.w&&my>=fb.y&&my<=fb.y+fb.h){if(fl.tutFeedbackOk){if(fl._prevPhase==='tutorial_1'){fl.tutCorrect=0;startTut2();return true;}fl.showReadyGame();return true;}fl.phase=fl._prevPhase||'tutorial';fl.tutFeedbackMsg='';fl.answerChecked=false;updateUI();return true;}return false;}
    if((fl.phase==='ready'||fl.phase==='ready_start')&&fl._rb){var rb=fl._rb;if(mx>=rb.x&&mx<=rb.x+rb.w&&my>=rb.y&&my<=rb.y+rb.h){if(fl.phase==='ready_start'){startPlaying();}else{fl.startTutorial();}return true;}return false;}
    if(fl.phase==='tutorial_text'&&fl._tb){var tb=fl._tb;if(mx>=tb.x&&mx<=tb.x+tb.w&&my>=tb.y&&my<=tb.y+tb.h){startTut1();return true;}return false;}
    if(fl.phase==='ready_game'&&fl._rgb){var rgb=fl._rgb;if(mx>=rgb.x&&mx<=rgb.x+rgb.w&&my>=rgb.y&&my<=rgb.y+rgb.h){fl.showReadyStart();return true;}return false;}
    if(fl.phase==='done'){if(fl._db1&&mx>=fl._db1.x&&mx<=fl._db1.x+fl._db1.w&&my>=fl._db1.y&&my<=fl._db1.y+fl._db1.h){fl.showReadyStart();return true;}if(fl._db2&&mx>=fl._db2.x&&mx<=fl._db2.x+fl._db2.w&&my>=fl._db2.y&&my<=fl._db2.y+fl._db2.h){window._nextModule("flex");return true;}return false;}
    if(!fl.answerChecked&&fl._btn1){if(mx>=fl._btn1.x&&mx<=fl._btn1.x+fl._btn1.w&&my>=fl._btn1.y&&my<=fl._btn1.y+fl._btn1.h){fl.answer('相同');return true;}}
    if(!fl.answerChecked&&fl._btn2){if(mx>=fl._btn2.x&&mx<=fl._btn2.x+fl._btn2.w&&my>=fl._btn2.y&&my<=fl._btn2.y+fl._btn2.h){fl.answer('不同');return true;}}
    return false;
}

setTimeout(function(){
    document.querySelectorAll('.cog-mod-btn').forEach(function(btn){if(btn.dataset.mod==='flex'){btn.addEventListener('click',function(){document.querySelectorAll('.cog-mod-btn').forEach(function(b){b.classList.remove('active');b.style.background='transparent';b.style.color='var(--text)';});btn.classList.add('active');btn.style.background='var(--primary)';btn.style.color='var(--bg-dark)';window.__cogModule='flex';document.getElementById('cog-panel-planning').style.display='none';document.getElementById('cog-panel-inhibition').style.display='block';fl.showReady();});}});
},600);
(function loop(){renderFlex();requestAnimationFrame(loop);})();
(function(){var prev=window._handleCogClick;window._handleCogClick=function(ex,ey){if(window.__cogModule==='flex'&&handleClick(ex,ey))return true;if(prev)return prev(ex,ey);return false;};})();
})();
