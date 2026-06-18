// 模块10: Stroop 自制力 — 色词测验
(function(){
var STROOP_TIME = 60;
var COLORS = { red: '#F44336', blue: '#2196F3' };
var COLOR_NAMES = { '#F44336': '红色', '#2196F3': '蓝色' };
var WORDS = ['红色', '蓝色'];
var PRACTICE_NEED = 3;
var GOLD = '#C9A84C';

var stroop = window.__stroop = {
    // 状态: idle→ready(开始教程)→practice→playing→done
    phase: 'idle',
    wordText: '', wordColor: '',
    btnColors: [], btnLabels: [], correctAns: '',
    timer: STROOP_TIME, t0: 0,
    trials: 0, correct: 0,
    rtTotal: 0, rtStart: 0,
    practiceCorrect: 0,
    showResult: false, resultT: 0, resultColor: '', resultBtnIdx: -1,
    showGoodJob: false // 教程阶段答对后的确认提示
};

function randomColor() { return Math.random() < 0.5 ? COLORS.red : COLORS.blue; }

function nextTrial() {
    stroop.wordText = WORDS[Math.floor(Math.random() * 2)];
    stroop.wordColor = randomColor();
    stroop.correctAns = COLOR_NAMES[stroop.wordColor];
    stroop.btnColors = Math.random() < 0.5 ? [COLORS.red, COLORS.blue] : [COLORS.blue, COLORS.red];
    stroop.btnLabels = Math.random() < 0.5 ? ['红色', '蓝色'] : ['蓝色', '红色'];
    stroop.showResult = false;
    stroop.showGoodJob = false;
    stroop.rtStart = performance.now();
}

function playCoin(){try{var a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type='sine';o.frequency.setValueAtTime(1200,t);o.frequency.setValueAtTime(1600,t+.05);o.frequency.setValueAtTime(2000,t+.1);g.gain.setValueAtTime(.1,t);g.gain.setValueAtTime(.1,t+.1);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.3);}catch(e){}}
function playError() {
    try {
        var ac2 = new (window.AudioContext || window.webkitAudioContext)();
        var o2 = ac2.createOscillator(), g2 = ac2.createGain();
        o2.connect(g2); g2.connect(ac2.destination);
        o2.type = 'square';
        o2.frequency.setValueAtTime(200, ac2.currentTime);
        o2.frequency.linearRampToValueAtTime(100, ac2.currentTime + 0.25);
        g2.gain.setValueAtTime(0.15, ac2.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 0.3);
        o2.start(ac2.currentTime); o2.stop(ac2.currentTime + 0.3);
    } catch(e) {}
}

function updateUI() {
    var st = document.getElementById('stroop-status');
    var sc = document.getElementById('stroop-score');
    if (st) {
        if (stroop.phase === 'idle') st.textContent = '准备开始';
        else if (stroop.phase === 'ready') st.textContent = '自制力测试';
        else if (stroop.phase === 'tutorial_text') st.textContent = '游戏规则';
        else if (stroop.phase === 'ready_game') st.textContent = '准备开始';
        else if (stroop.phase === 'practice') st.textContent = '试玩 (' + stroop.practiceCorrect + '/' + PRACTICE_NEED + ')';
        else if (stroop.phase === 'playing') st.textContent = '第 ' + (stroop.trials + 1) + ' 题';
        else if (stroop.phase === 'done') st.textContent = '正确率 ' + (stroop.trials>0?Math.round(stroop.correct/stroop.trials*100):0) + '%';
    }
    if (sc) sc.textContent = '正确: ' + stroop.correct + '/' + stroop.trials;
}

// 进入 ready 屏幕
stroop.showReady = function() { stroop.phase = 'ready'; updateUI(); };
stroop.startTutorial = function() { stroop.phase = 'tutorial_text'; updateUI(); };
stroop.showReadyGame = function() { stroop.phase = 'ready_game'; updateUI(); };
    stroop.showReadyStart = function() { stroop.phase = 'ready_start'; updateUI(); };
stroop.startPractice = function() {
    stroop.phase = 'practice';
    stroop.trials = 0; stroop.correct = 0;
    stroop.practiceCorrect = 0;
    stroop.rtTotal = 0;
    nextTrial(); updateUI();
};

stroop.click = function(choice) {
    if (stroop.phase !== 'practice' && stroop.phase !== 'playing') return;
    var rt = performance.now() - stroop.rtStart;
    stroop.rtTotal += rt;
    stroop.trials++;
    if (choice === stroop.correctAns) {
        stroop.correct++;
        playCoin();
        if (stroop.phase === 'practice') {
            stroop.practiceCorrect++;
            stroop.tutFeedbackOk = true; stroop.tutFeedbackMsg = '对，再试一个';
            stroop._practiceDone = stroop.practiceCorrect >= PRACTICE_NEED;
            stroop.phase = 'tutorial_feedback'; updateUI(); return;
        }
    } else {
        playError();
        if (stroop.phase === 'practice') {
            stroop.showResult = false;
            stroop.showGoodJob = false;
        }
    }
    updateUI();
    setTimeout(function() {
        if (stroop.phase !== 'practice' && stroop.phase !== 'playing') return;
        nextTrial(); updateUI();
    }, stroop.phase === 'practice' ? 500 : 400);
};

// ====== 绘制圆角矩形辅助函数 ======
function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
    ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r);
    ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h);
    ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r);
    ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
}

// ====== 主渲染 ======
function renderStroopFeedback(ctx, W, H) {
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, W, H);
    var msg = stroop.tutFeedbackMsg || (stroop.tutFeedbackOk ? '对，再试一个' : '哦，不对');
    var color = stroop.tutFeedbackOk ? '#fff' : '#F44336';
    var bw = 500, bh = 140, bx = W/2 - bw/2, by = H/2 - 70;
    drawRR(ctx, bx, by, bw, bh, 16); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, W/2, by + bh/2 - 15);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    var btnW = 140, btnH = 44, btnX = W/2 - btnW/2, btnY = by + bh + 10;
    drawRR(ctx, btnX, btnY, btnW, btnH, 12); ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('继续', btnX + btnW/2, btnY + btnH/2); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    stroop._fbBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
}

function renderStroop() {
    var c = document.getElementById('cognitive-canvas');
    if (!c || c.style.display === 'none' || !stroop || stroop.phase === 'idle') return;
    if (window.__cogModule !== 'inhibition') return;
    var ctx = c.getContext('2d'), W = c.width, H = c.height;

    if (stroop.phase === 'playing' && stroop.t0 > 0) {
        stroop.timer = Math.max(0, STROOP_TIME - (performance.now() - stroop.t0) / 1000);
        if (stroop.timer <= 0) { stroop.phase = 'done'; updateUI(); }
    }
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, W, H);

    if (stroop.phase === 'ready') {
        renderReadyScreen(ctx, W, H);
    } else if (stroop.phase === 'tutorial_text') {
        renderTutorialScreen(ctx, W, H);
    } else if (stroop.phase === 'tutorial_feedback') {
        renderStroopFeedback(ctx, W, H);
    } else if (stroop.phase === 'ready_game') {
        renderReadyGameScreen(ctx, W, H);
    } else if (stroop.phase === 'ready_start') {
        renderReadyStartScreen(ctx, W, H);
    } else if (stroop.phase === 'done') { renderStroopDone(ctx, W, H); } else {
        renderGame(ctx, W, H);
    }
}

function renderReadyScreen(ctx, W, H) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('自制力测试', W/2, H/2 - 130);
    ctx.textAlign = 'start';

    // 金色边框说明框
    var descText = '考验你在有干扰的情况下完成任务的能力';
    var desc2 = '分数越高代表你的专注力越好。';
    ctx.font = 'bold 18px sans-serif';
    var dw = ctx.measureText(descText).width;
    var bw = Math.max(dw, 420) + 60, bh = 140;
    var bx = W/2 - bw/2, by = H/2 - 70;
    drawRoundRect(ctx, bx, by, bw, bh, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(descText, W/2, by + 40);
    ctx.fillText(desc2, W/2, by + 68);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';

    // 开始教程按钮
    var btnW2 = 160, btnH2 = 48, btnX2 = W/2 - btnW2/2, btnY2 = by + bh + 10;
    drawRoundRect(ctx, btnX2, btnY2, btnW2, btnH2, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('开始教程', W/2, btnY2 + btnH2/2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';

    // 存储按钮位置供点击
    stroop._readyBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
}

function renderTutorialScreen(ctx, W, H) {
    var hintText = '根据上面文字的颜色点击下面对应的按钮';
    ctx.font = 'bold 18px sans-serif';
    var hw = ctx.measureText(hintText).width;
    var bw = Math.max(hw, 360) + 100, bh = 120;
    var bx = W/2 - bw/2, by = H/2 - 65;
    drawRoundRect(ctx, bx, by, bw, bh, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hintText, W/2, by + 50);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';

    // 继续按钮
    var btnW2 = 140, btnH2 = 44, btnX2 = W/2 - btnW2/2, btnY2 = by + bh + 10;
    drawRoundRect(ctx, btnX2, btnY2, btnW2, btnH2, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('继续', W/2, btnY2 + btnH2/2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    stroop._tutorialBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
}


function renderReadyStartScreen(ctx, W, H) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('自制力测试', W/2, H/2 - 150);
    var bwBox = 520, bhBox = 100, bxBox = W/2 - bwBox/2, byBox = H/2 - 80;
    drawRR(ctx, bxBox, byBox, bwBox, bhBox, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('考验你的冲动控制与抑制能力', W/2, byBox + 35);
    ctx.fillText('分数越高代表着你自制力越强', W/2, byBox + 65);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    var bw = 160, bh = 48, bx = W/2 - bw/2, by = byBox + bhBox + 10;
    drawRR(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('开始', W/2, by + bh/2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    stroop._readyStartBtn = {x: bx, y: by, w: bw, h: bh};
}

function renderReadyGameScreen(ctx, W, H) {
    var text = '对就是这样，现在开始游戏吧';
    ctx.font = 'bold 22px sans-serif';
    var tw2 = ctx.measureText(text).width;
    var bw = tw2 + 120, bh = 120;
    var bx = W/2 - bw/2, by = H/2 - 65;
    drawRoundRect(ctx, bx, by, bw, bh, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W/2, by + 50);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';

    var btnW2 = 160, btnH2 = 44, btnX2 = W/2 - btnW2/2, btnY2 = by + bh + 10;
    drawRoundRect(ctx, btnX2, btnY2, btnW2, btnH2, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('开始游戏', W/2, btnY2 + btnH2/2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    stroop._readyGameBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
}

function renderGame(ctx, W, H) {
    // --- 上方框架 ---
    var padX = 50, padY = 35;
    ctx.font = 'bold 80px sans-serif';
    var tw = ctx.measureText(stroop.wordText).width;
    var tboxX = W/2 - tw/2 - padX, tboxY = H/2 - 160, tboxW = tw + padX*2, tboxH = 110, tr = 16;
    var textCY = tboxY + tboxH/2;
    var now2 = performance.now();
    var showingResult = stroop.showResult && (now2 - stroop.resultT < 2000);
    var isPracticeResult = stroop.phase === 'practice' && showingResult;

    drawRoundRect(ctx, tboxX, tboxY, tboxW, tboxH, tr);
    if (showingResult) {
        ctx.fillStyle = stroop.resultColor; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = stroop.resultColor;
    } else {
        ctx.fillStyle = GOLD; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 3; ctx.stroke();

    if (!showingResult) {
        ctx.fillStyle = stroop.wordColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(stroop.wordText, W/2, textCY);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    }

    // --- 提示文字 ---
    var hintText = '上方文字的颜色是';
    ctx.font = 'bold 18px sans-serif';
    var hw = ctx.measureText(hintText).width;
    var hx = W/2 - hw/2 - 20, hy = tboxY + tboxH + 12, hh = 40;
    drawRoundRect(ctx, hx, hy, hw + 40, hh, 8);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hintText, W/2, hy + hh/2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';

    // --- 按钮 ---
    var btnW = 200, btnH = 70, btnY = H * 0.68, gap = 40;
    var btn1X = W/2 - btnW - gap/2, btn2X = W/2 + gap/2;
    var showBtns = isPracticeResult ? [stroop.resultBtnIdx] : [0, 1];
    for (var bi = 0; bi < showBtns.length; bi++) {
        var i = showBtns[bi];
        var bx = isPracticeResult ? W/2 - btnW/2 : (i === 0 ? btn1X : btn2X);
        var label = stroop.btnLabels[i];
        var txtColor = isPracticeResult ? '#fff' : stroop.btnColors[i];

        drawRoundRect(ctx, bx, btnY, btnW, btnH, 12);
        ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = txtColor;
        ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, bx + btnW/2, btnY + btnH/2 + 10);
        ctx.textAlign = 'start';
    }

    // --- "回答正确, 再试一次" ---
    if (stroop.showGoodJob) {
        var gjText = '回答正确，再试一次';
        ctx.font = 'bold 20px sans-serif';
        var gjw = ctx.measureText(gjText).width + 40;
        var gjx = W/2 - gjw/2, gjy = btnY + btnH + 20, gjh = 44;
        drawRoundRect(ctx, gjx, gjy, gjw, gjh, 10);
        ctx.fillStyle = 'rgba(76,175,80,0.2)'; ctx.fill();
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#4CAF50';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(gjText, W/2, gjy + gjh/2);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    }

    // 计时器
    ctx.fillStyle = stroop.phase === 'playing' ? (stroop.timer < 10 ? '#F44336' : '#aaa') : '#888';
    ctx.font = 'bold 24px monospace'; ctx.textAlign = 'right';
    var min = Math.floor(stroop.timer / 60), sec = Math.floor(stroop.timer % 60);
    ctx.fillText(min + ':' + (sec < 10 ? '0' : '') + sec, W - 20, 40);
    ctx.textAlign = 'start';

    if (stroop.phase === 'playing') {
        ctx.fillStyle = '#888'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(stroop.correct + '/' + stroop.trials, W/2, 25);
        ctx.textAlign = 'start';
    }
}

// Canvas click
function drawRR(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
function renderStroopDone(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('自制力测试',W/2,H/2-130);ctx.textAlign='start';
    ctx.font='bold 22px sans-serif';ctx.fillStyle='#aaa';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-70);ctx.textAlign='start';
    var bw2=160,bh2=48,by2=H/2,bx1=W/2-bw2-20,bx2=W/2+20;
    drawRR(ctx,bx1,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    drawRR(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    stroop._doneBtns=[{x:bx1,y:by2,w:bw2,h:bh2},{x:bx2,y:by2,w:bw2,h:bh2}];
}

function handleStroopClick(ex, ey) {
    var c2 = document.getElementById('cognitive-canvas');
    if (!c2 || c2.style.display === 'none') return false;
    if (window.__cogModule !== 'inhibition') return false;
    var rect = c2.getBoundingClientRect();
    if (!rect) return false;
    var mx = (ex - rect.left) * (c2.width / rect.width);
    var my = (ey - rect.top) * (c2.height / rect.height);

    // ready 屏幕按钮
    if (stroop.phase === 'ready' && stroop._readyBtn) {
        var rb = stroop._readyBtn;
        if (mx >= rb.x && mx <= rb.x+rb.w && my >= rb.y && my <= rb.y+rb.h) {
            stroop.startTutorial(); return true;
        }
        return false;
    }
    // tutorial 屏幕按钮 → 直接进试玩
    if (stroop.phase === 'tutorial_text' && stroop._tutorialBtn) {
        var tb = stroop._tutorialBtn;
        if (mx >= tb.x && mx <= tb.x+tb.w && my >= tb.y && my <= tb.y+tb.h) {
            stroop.startPractice(); return true;
        }
        return false;
    }
    // ready_game 屏幕按钮 → 开始正式游戏
    if (stroop.phase === 'ready_start' && stroop._readyStartBtn) {
        var rsb = stroop._readyStartBtn;
        if (mx >= rsb.x && mx <= rsb.x+rsb.w && my >= rsb.y && my <= rsb.y+rsb.h) {
            stroop.phase = 'playing';
            stroop.timer = STROOP_TIME;
            stroop.t0 = performance.now();
            stroop.score = 0; stroop.total = 0;
            stroop.tutRound = 0;
            genStroopTrial(); updateUI(); return true;
        }
        return false;
    }
    // ready_game → showReadyStart
    if (stroop.phase === 'tutorial_feedback' && stroop._fbBtn) {
        var fb = stroop._fbBtn;
        if (mx >= fb.x && mx <= fb.x+fb.w && my >= fb.y && my <= fb.y+fb.h) {
            if (stroop.tutFeedbackOk) {
                if (stroop._practiceDone) { stroop.showReadyGame(); } else { stroop.phase = 'practice'; nextTrial(); }
            } else {
                stroop.phase = 'practice'; nextTrial();
            }
            stroop.tutFeedbackMsg = ''; updateUI(); return true;
        }
        return false;
    }
    if (stroop.phase === 'done' && stroop._doneBtns) { var btns=stroop._doneBtns; if (mx>=btns[0].x&&mx<=btns[0].x+btns[0].w&&my>=btns[0].y&&my<=btns[0].y+btns[0].h) { stroop.showReadyStart(); return true; } if (mx>=btns[1].x&&mx<=btns[1].x+btns[1].w&&my>=btns[1].y&&my<=btns[1].y+btns[1].h) { window._nextModule("inhibition"); return true; } return false; }
        if (stroop.phase === 'ready_game' && stroop._readyGameBtn) {
        var rgb = stroop._readyGameBtn;
        if (mx >= rgb.x && mx <= rgb.x+rgb.w && my >= rgb.y && my <= rgb.y+rgb.h) {
            stroop.showReadyStart(); return true;
            stroop.trials = 0; stroop.correct = 0;
            nextTrial(); updateUI();
            return true;
        }
        return false;
    }

    if (stroop.phase !== 'practice' && stroop.phase !== 'playing') return false;
    if (!rect) return false;
    var mx = (ex - rect.left) * (c2.width / rect.width);
    var my = (ey - rect.top) * (c2.height / rect.height);
    var W = c2.width, H = c2.height;
    var btnW = 200, btnH = 70, btnY = H * 0.68, gap = 40;
    var btn1X = W/2 - btnW - gap/2, btn2X = W/2 + gap/2;
    if (my >= btnY && my <= btnY + btnH) {
        if (mx >= btn1X && mx <= btn1X + btnW) { stroop.click(stroop.btnLabels[0]); return true; }
        if (mx >= btn2X && mx <= btn2X + btnW) { stroop.click(stroop.btnLabels[1]); return true; }
    }
    return false;
}

function initStroop() { updateUI(); }

window.__cogModule = 'planning';

setTimeout(function() {
    document.querySelectorAll('.cog-mod-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.cog-mod-btn').forEach(function(b) {
                b.classList.remove('active'); b.style.background = 'transparent'; b.style.color = 'var(--text)';
            });
            btn.classList.add('active');
            btn.style.background = 'var(--primary)'; btn.style.color = 'var(--bg-dark)';
            var mod = btn.dataset.mod;
            window.__cogModule = mod;
            document.getElementById('cog-panel-planning').style.display = mod === 'planning' ? 'block' : 'none';
            document.getElementById('cog-panel-inhibition').style.display = mod === 'inhibition' ? 'block' : 'none';
            if (mod === 'inhibition') {
                // 点自制力 → 显示 ready 屏
                stroop.showReady();
            }
        });
    });
    initStroop();
}, 600);

(function loop() { renderStroop(); requestAnimationFrame(loop); })();

(function wrapHandler(){
    var prev = window._handleCogClick;
    window._handleCogClick = function(ex, ey) {
        if (window.__cogModule === 'inhibition' && handleStroopClick(ex, ey)) return true;
        if (prev) return prev(ex, ey);
        return false;
    };
})();

})();
