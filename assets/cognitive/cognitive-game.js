// === 模块8: 彩色方块归位 — 柱形容器堆叠模型 ===
// 6列容器, 高度 [1,2,3,3,2,1], 方块必须底部堆起, 不可悬空
// 仅顶部方块可取出, 只能放到目标列顶部
(function(){
var COL_HEIGHTS = [1,2,3,3,2,1];
var COL_COLORS = [
    ['#1565C0'],
    ['#F9A825','#FFF176'],
    ['#2E7D32','#4CAF50','#A5D6A7'],
    ['#FFFFFF','#FFFFFF','#FFFFFF'],
    ['#9C27B0','#CE93D8'],
    ['#F44336']
];
var BLOCK_DEFS = [
    {id:0, col:0, row:0, color:'#1565C0'},
    {id:1, col:1, row:0, color:'#F9A825'},
    {id:2, col:1, row:1, color:'#FFF176'},
    {id:3, col:2, row:0, color:'#2E7D32'},
    {id:4, col:2, row:1, color:'#4CAF50'},
    {id:5, col:2, row:2, color:'#A5D6A7'},
    {id:6, col:4, row:0, color:'#9C27B0'},
    {id:7, col:4, row:1, color:'#CE93D8'},
    {id:8, col:5, row:0, color:'#F44336'}
];
var BLOCK_COLORS = {};
BLOCK_DEFS.forEach(function(b){ BLOCK_COLORS[b.id] = b.color; });

var GAME_TIME = 180;
var slotW = 64, slotH = 58, colGap = 80, blockS = 50, layerGap = 6;

// 点击音效 (短促的 "嘀" 声)
var audioCtx = null;
function playClick() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.08);
    } catch(e) {}
}

var cog = window.__cog = {
    columns: [],
    selected: null,
    moves: 0,
    optimal: 0,
    stepEfficiency: 0,
    phase: 'idle',
    level: 1,
    timer: GAME_TIME,
    t0: 0,
    colPos: []
};

function initColumns() {
    cog.columns = [];
    for (var c = 0; c < 6; c++) {
        var col = [];
        for (var r = 0; r < COL_HEIGHTS[c]; r++) col.push(null);
        cog.columns.push(col);
    }
}

function placeAllCorrect() {
    initColumns();
    BLOCK_DEFS.forEach(function(b) {
        cog.columns[b.col][b.row] = b.id;
    });
}

function topOf(col) {
    for (var r = col.length - 1; r >= 0; r--) {
        if (col[r] !== null) return r;
    }
    return -1;
}

function firstEmpty(col) {
    for (var r = 0; r < col.length; r++) {
        if (col[r] === null) return r;
    }
    return -1;
}

function moveBlock(sc, dc) {
    var stop = topOf(cog.columns[sc]);
    if (stop < 0) return;
    var dempty = firstEmpty(cog.columns[dc]);
    if (dempty < 0) return;
    cog.columns[dc][dempty] = cog.columns[sc][stop];
    cog.columns[sc][stop] = null;
    cog.moves++;
    updateStepEfficiency();
}

function updateStepEfficiency() {
    if (window.__scoring && window.__scoring.computeStepEfficiency) {
        cog.stepEfficiency = window.__scoring.computeStepEfficiency(cog.optimal, cog.moves);
    } else {
        cog.stepEfficiency = (cog.optimal > 0 && cog.moves > 0) ? Math.min(1, cog.optimal / cog.moves) : 0.1;
    }
}

// 计算所有块的总列距离 (最小还原步数下限)
function totalColumnDist() {
    var dist = 0;
    for (var i = 0; i < BLOCK_DEFS.length; i++) {
        var b = BLOCK_DEFS[i];
        // 找块 b.id 当前在哪列
        for (var col = 0; col < 6; col++) {
            for (var row = 0; row < cog.columns[col].length; row++) {
                if (cog.columns[col][row] === b.id) {
                    dist += Math.abs(col - b.col);
                    break;
                }
            }
        }
    }
    return dist;
}

// 打乱: ≤5块用循环位移, >5块用暴力搜索
function shuffleFromSolved(numBlocks) {
    numBlocks = Math.min(numBlocks, 9);
    var buf = 3;
    if (numBlocks <= 5) {
        // 循环位移: 精确控制错位块数
        placeAllCorrect();
        var nonBuf = [0,1,2,4,5];
        var cols = nonBuf.sort(function(){return Math.random()-0.5;}).slice(0, numBlocks);
        if (cols.length < 2) cols = [0, 5];
        moveBlock(cols[0], buf);
        for (var k = 1; k < cols.length; k++) moveBlock(cols[k], cols[k-1]);
        moveBlock(buf, cols[cols.length - 1]);
    } else {
        // 暴力搜索: 充分打散取最佳, 然后精确控制错位块数到目标值
        var bestState = null, bestMisplaced = 0;
        for (var attempt = 0; attempt < 40; attempt++) {
            placeAllCorrect();
            for (var m = 0; m < 50; m++) {
                var srcCols = [], dstCols = [];
                for (var c = 0; c < 6; c++) {
                    if (topOf(cog.columns[c]) >= 0) srcCols.push(c);
                    if (cog.columns[c][COL_HEIGHTS[c]-1] === null) dstCols.push(c);
                }
                if (!srcCols.length || !dstCols.length) break;
                var sc = srcCols[Math.floor(Math.random() * srcCols.length)];
                var dcList = dstCols.filter(function(x){return x!==sc;});
                if (!dcList.length) dcList = dstCols;
                var dc = dcList[Math.floor(Math.random() * dcList.length)];
                moveBlock(sc, dc);
            }
            var mis = 0;
            for (var i = 0; i < BLOCK_DEFS.length; i++) {
                var b = BLOCK_DEFS[i];
                if (cog.columns[b.col][b.row] !== b.id) mis++;
            }
            if (mis > bestMisplaced) { bestMisplaced = mis; bestState = cog.columns.map(function(c) { return c.slice(); }); }
        }
        if (bestState) cog.columns = bestState;
        // 如果错位太多 → 修一些回正确位置, 精确控制到 numBlocks
        var curMis = bestMisplaced;
        var fixAttempts = 0;
        while (curMis > numBlocks && fixAttempts < 30) {
            fixAttempts++;
            // 找一个错位块, 如果它家空着就搬回去
            var fixed = false;
            for (var i = 0; i < BLOCK_DEFS.length && curMis > numBlocks; i++) {
                var b = BLOCK_DEFS[i];
                if (cog.columns[b.col][b.row] === b.id) continue; // already home
                // 找到这个块当前在哪儿
                for (var col = 0; col < 6; col++) {
                    var tr = topOf(cog.columns[col]);
                    if (tr >= 0 && cog.columns[col][tr] === b.id) {
                        // 它家在 b.col, b.row. 如果家被占, 先把占的搬走
                        if (cog.columns[b.col][b.row] !== null) {
                            // 有人占着 → 搬到缓冲
                            if (cog.columns[buf][COL_HEIGHTS[buf]-1] === null) {
                                moveBlock(b.col, buf);
                            }
                        }
                        if (cog.columns[b.col][b.row] === null) {
                            moveBlock(col, b.col);
                            curMis--;
                            fixed = true;
                        }
                        break;
                    }
                }
            }
            if (!fixed) break; // 修不了了
        }
        if (curMis < 3) {
            placeAllCorrect();
            var sc = [0,5,2].sort(function(){return Math.random()-0.5;});
            moveBlock(sc[0], buf); moveBlock(sc[1], sc[0]); moveBlock(buf, sc[1]);
        }
    }
}

function compactColumn(col) {
    // 把所有非空块压到底部, 消除中间空隙
    var blocks = [];
    for (var r = 0; r < col.length; r++) {
        if (col[r] !== null) blocks.push(col[r]);
    }
    for (var r = 0; r < col.length; r++) {
        col[r] = (r < blocks.length) ? blocks[r] : null;
    }
}

function initLevel(numBlocks) {
    shuffleFromSolved(numBlocks);
    // 强制重力整理所有列
    for (var c = 0; c < 6; c++) compactColumn(cog.columns[c]);
    // 用实际错位块数计算最优
    var mis = 0;
    for (var i = 0; i < BLOCK_DEFS.length; i++) {
        var b = BLOCK_DEFS[i];
        if (cog.columns[b.col][b.row] !== b.id) mis++;
    }
    cog.optimal = Math.round(mis * 1.5);
    cog.moves = 0;
    cog.selected = null;
    updateStepEfficiency();
}

// 难度: 每关增加1个错位块, 从4个起
// 游戏最多9个块可错位, 每错位块至少需要1步归位
// Lv1=4错位~6步, Lv2=5~7步, Lv3=6~9步, Lv4=7~11步, Lv5=8~14步, Lv6=9~17步
function getLevelSteps(lv) {
    return 3 + lv; // 错位块数=3+lv, 最优步数≈错位块数×1.5
}

function isSolved() {
    for (var i = 0; i < BLOCK_DEFS.length; i++) {
        var b = BLOCK_DEFS[i];
        if (cog.columns[b.col][b.row] !== b.id) return false;
    }
    return true;
}

function updateUI() {
    var st = document.getElementById('cog-status');
    var tm = document.getElementById('cog-timer');
    var sp = document.getElementById('cog-steps');
    var btn = document.getElementById('cog-start-btn');
    if (st) {
        if (cog.phase === 'idle') st.textContent = '';
        else if (cog.phase === 'ready') st.textContent = '规划能力测试';
        else if (cog.phase === 'tutorial_text') st.textContent = '游戏规则';
        else if (cog.phase === 'practice') st.textContent = '试玩: 移方块到对应颜色的槽';
        else if (cog.phase === 'ready_game') st.textContent = '准备开始';
        else if (cog.phase === 'playing') st.textContent = '第 ' + cog.level + ' 关';
        else if (cog.phase === 'done') st.textContent = '通过 ' + (cog.level - 1) + ' 关';
    }
    if (sp) sp.textContent = cog.phase === 'playing' || cog.phase === 'practice' ? '步数: ' + cog.moves + ' / 最优: ' + cog.optimal : '';
    if (btn) { btn.style.display = 'none'; }
}

cog.showReady = function() { cog.phase = 'ready'; updateUI(); };
cog.startTutorial = function() { cog.phase = 'tutorial_text'; updateUI(); };
cog.startPractice = function() {
    cog.phase = 'practice'; cog.level = 0; cog.timer = GAME_TIME; cog.t0 = 0;
    initLevel(3); updateUI();
};
cog.showReadyGame = function() { cog.phase = 'ready_game'; updateUI(); };
    cog.showReadyStart = function() { cog.phase = 'ready_start'; updateUI(); };
cog.startGame = function() {
    cog.phase = 'playing'; cog.level = 1; cog.timer = GAME_TIME;
    cog.t0 = performance.now();
    initLevel(getLevelSteps(1)); updateUI();
};
cog.updateUI = updateUI;

cog.click = function(colIdx) {
    if (cog.phase !== 'practice' && cog.phase !== 'playing') return;
    if (colIdx < 0 || colIdx >= 6) return;
    playClick();
    if (cog.selected === null) {
        var top = topOf(cog.columns[colIdx]);
        if (top >= 0) cog.selected = { col: colIdx, row: top };
    } else {
        var sc = cog.selected.col;
        if (colIdx === sc) { cog.selected = null; }
        else {
            var dempty = firstEmpty(cog.columns[colIdx]);
            if (dempty >= 0) {
                moveBlock(sc, colIdx); cog.selected = null;
                if (isSolved()) {
                    if (cog.phase === 'practice') { cog.showReadyGame(); }
                    else { cog.level++; initLevel(getLevelSteps(cog.level)); }
                }
            } else {
                var ttop = topOf(cog.columns[colIdx]);
                if (ttop >= 0) cog.selected = { col: colIdx, row: ttop };
            }
        }
    }
    updateUI();
};

function calcColPositions() {
    var c = document.getElementById('cognitive-canvas');
    if (!c) return;
    var cx = c.width / 2, cy = c.height / 2;
    var totalW = 5 * colGap, startX = cx - totalW / 2;
    // 层高含间距: 3层 = 3*slotH + 2*layerGap
    var maxH = 3 * slotH + 2 * layerGap;
    var baseY = cy + maxH / 2 - slotH / 2;
    cog.colPos = [];
    for (var col = 0; col < 6; col++) {
        var step = slotH + layerGap;
        cog.colPos.push({ x: startX + col * colGap, y: baseY - (COL_HEIGHTS[col] - 1) * step, h: COL_HEIGHTS[col] });
    }
}

var GOLD = '#C9A84C';

function drawRoundRectP(ctx, x, y, w, h, r) {
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

function renderCognitive() {
    if (window.__cogModule !== 'planning') return;
    var c = document.getElementById('cognitive-canvas');
    if (!c || c.style.display === 'none') return;
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    if ((cog.phase === 'playing' || cog.phase === 'practice') && cog.t0 > 0) {
        cog.timer = Math.max(0, GAME_TIME - (performance.now() - cog.t0) / 1000);
        if (cog.phase === 'playing' && cog.timer <= 0) { cog.phase = 'done'; updateUI(); }
    }
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, W, H);

    if (cog.phase === 'ready') { renderPlanningReady(ctx, W, H); return; }
    if (cog.phase === 'tutorial_text') { renderPlanningTutorial(ctx, W, H); return; }
    if (cog.phase === 'ready_game') { renderPlanningReadyGame(ctx, W, H); return; }
    if (cog.phase === 'ready_start') { renderPlanningReadyStart(ctx, W, H); return; }
    if (cog.phase === 'idle') return;
    if (cog.phase === 'done') { renderPlanningDone(ctx, W, H); return; }

    calcColPositions();

    for (var col = 0; col < 6; col++) {
        var cp = cog.colPos[col]; if (!cp) continue;
        var colors = COL_COLORS[col], colData = cog.columns[col];
        var sx = cp.x - slotW/2, lw = 5;
        // 整列画 U 形连续边框 (左右边延伸1px消除层缝)
        for (var r = 0; r < cp.h; r++) {
            var sy = cp.y + r * (slotH + layerGap);
            // 数据: colData[r_data] 中 r_data=0=底层, r_data=h-1=顶层
            // 渲染: r=0=顶部位置, r=h-1=底部位置 → 需反转索引
            var dataIdx = cp.h - 1 - r;
            var blockId = colData[dataIdx], isEmpty = (blockId === null);
            var targetColor = colors[dataIdx], isWhite = (targetColor === '#FFFFFF');
            var isSel = (cog.selected && cog.selected.col === col && cog.selected.row === dataIdx);
            // r=0=最上层, r=cp.h-1=最底层(有底边)
            var isTop = (r === 0), isBottom = (r === cp.h - 1);
            var topY = sy;
            var botY = sy + slotH;

            ctx.beginPath();
            ctx.strokeStyle = isWhite ? '#ccc' : (isSel ? '#1565C0' : targetColor);
            ctx.lineWidth = lw;
            ctx.lineCap = 'butt';
            ctx.moveTo(sx, topY);
            ctx.lineTo(sx, botY);
            // 底边 (仅最底层)
            if (isBottom) {
                ctx.lineTo(sx + slotW, botY);
            }
            ctx.moveTo(sx + slotW, botY);
            ctx.lineTo(sx + slotW, topY);
            ctx.stroke();

            // 方块 (正方形, 仅非空, 选中时上浮3px)
            if (!isEmpty) {
                var floatUp = isSel ? 3 : 0;
                var bx = cp.x - blockS/2, by = sy + slotH/2 - blockS/2 - floatUp, br = 5;
                ctx.beginPath();
                ctx.moveTo(bx+br,by);ctx.lineTo(bx+blockS-br,by);
                ctx.arcTo(bx+blockS,by,bx+blockS,by+br,br);
                ctx.lineTo(bx+blockS,by+blockS-br);
                ctx.arcTo(bx+blockS,by+blockS,bx+blockS-br,by+blockS,br);
                ctx.lineTo(bx+br,by+blockS);
                ctx.arcTo(bx,by+blockS,bx,by+blockS-br,br);
                ctx.lineTo(bx,by+br);
                ctx.arcTo(bx,by,bx+br,by,br);
                ctx.closePath();
                ctx.fillStyle = BLOCK_COLORS[blockId]; ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
                if (isSel) { ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 3; ctx.stroke(); }
            }
        }
    }
    // 提示框 (橙色圆弧) — 放在槽位下方
    var maxColBot = 0;
    for (var ci = 0; ci < cog.colPos.length; ci++) {
        var cb = cog.colPos[ci]; if (!cb) continue;
        var btm = cb.y + cb.h * slotH + (cb.h - 1) * layerGap;
        if (btm > maxColBot) maxColBot = btm;
    }
    var tipW = 340, tipH = 36, tipX = W/2 - tipW/2, tipY = maxColBot + 16, tipR = 18;
    ctx.beginPath();
    ctx.moveTo(tipX + tipR, tipY);
    ctx.lineTo(tipX + tipW - tipR, tipY);
    ctx.arcTo(tipX + tipW, tipY, tipX + tipW, tipY + tipR, tipR);
    ctx.lineTo(tipX + tipW, tipY + tipH - tipR);
    ctx.arcTo(tipX + tipW, tipY + tipH, tipX + tipW - tipR, tipY + tipH, tipR);
    ctx.lineTo(tipX + tipR, tipY + tipH);
    ctx.arcTo(tipX, tipY + tipH, tipX, tipY + tipH - tipR, tipR);
    ctx.lineTo(tipX, tipY + tipR);
    ctx.arcTo(tipX, tipY, tipX + tipR, tipY, tipR);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,152,0,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#E65100';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('把方块移到对应颜色正确的位置', W/2, tipY + tipH/2 + 5);
    ctx.textAlign = 'start';

    var min = Math.floor(cog.timer / 60), sec = Math.floor(cog.timer % 60);
    ctx.fillStyle = cog.timer < 30 ? '#F44336' : '#333';
    ctx.font = 'bold 28px monospace'; ctx.textAlign = 'right';
    ctx.fillText(min + ':' + (sec < 10 ? '0' : '') + sec, W - 20, 50);
    ctx.textAlign = 'start';
}

function renderPlanningReady(ctx, W, H) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('规划能力测试', W/2, H/2 - 130); ctx.textAlign = 'start';
    var t1 = '考验你提前计划的能力';
    var t2 = '分数越高代表着你规划未来的能力越强';
    ctx.font = 'bold 18px sans-serif';
    var bw = 520, bh = 140, bx = W/2 - bw/2, by = H/2 - 70;
    drawRoundRectP(ctx, bx, by, bw, bh, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t1, W/2, by + 40);
    ctx.fillText(t2, W/2, by + 68); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    var btnW2 = 160, btnH2 = 48, btnX2 = W/2 - btnW2/2, btnY2 = by + bh + 10;
    drawRoundRectP(ctx, btnX2, btnY2, btnW2, btnH2, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('开始教程', W/2, btnY2 + btnH2/2); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    cog._readyBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
}
function renderPlanningTutorial(ctx, W, H) {
    var t = '让方块进入与其颜色相同的格子，方块先进先出';
    ctx.font = 'bold 18px sans-serif';
    var bw = 560, bh = 120, bx = W/2 - bw/2, by = H/2 - 65;
    drawRoundRectP(ctx, bx, by, bw, bh, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, W/2, by + 50); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    var btnW2 = 140, btnH2 = 44, btnX2 = W/2 - btnW2/2, btnY2 = by + bh + 10;
    drawRoundRectP(ctx, btnX2, btnY2, btnW2, btnH2, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('继续', W/2, btnY2 + btnH2/2); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    cog._tutorialBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
}
function renderPlanningReadyGame(ctx, W, H) {
    var t = '对就是这样，现在正式开始游戏吧';
    ctx.font = 'bold 22px sans-serif';
    var tw2 = ctx.measureText(t).width;
    var bw = tw2 + 120, bh = 120, bx = W/2 - bw/2, by = H/2 - 65;
    drawRoundRectP(ctx, bx, by, bw, bh, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, W/2, by + 50); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    var btnW2 = 160, btnH2 = 44, btnX2 = W/2 - btnW2/2, btnY2 = by + bh + 10;
    drawRoundRectP(ctx, btnX2, btnY2, btnW2, btnH2, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('开始游戏', W/2, btnY2 + btnH2/2); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    cog._readyGameBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
}

function renderPlanningReadyStart(ctx, W, H) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('规划能力', W/2, H/2 - 150);
    var bwBox = 520, bhBox = 100, bxBox = W/2 - bwBox/2, byBox = H/2 - 80;
    drawRoundRectP(ctx, bxBox, byBox, bwBox, bhBox, 16);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('考验你的逻辑规划与问题解决能力', W/2, byBox + 35);
    ctx.fillText('分数越高代表着你思维能力越强', W/2, byBox + 65);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    var bw = 160, bh = 48, bx = W/2 - bw/2, by = byBox + bhBox + 10;
    drawRoundRectP(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('开始', W/2, by + bh/2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    cog._readyStartBtn = {x: bx, y: by, w: bw, h: bh};
}

function renderPlanningDone(ctx,W,H){
    ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('规划能力测试',W/2,H/2-180);ctx.textAlign='start';
    ctx.font='bold 20px sans-serif';ctx.fillStyle='#bdc3c7';ctx.textAlign='center';ctx.fillText('当前测试结束',W/2,H/2-135);ctx.textAlign='start';

    // 关卡视角: 3 列数据 (总关/完成/得分)
    var totalLv=6;
    var completed=Math.max(0,cog.level-1);
    var se=Number(cog.stepEfficiency)||0.5;
    var lvScore=(cog.level/10)*se*150;
    var finalScore=Math.min(150,Math.max(5,Math.round(lvScore)));
    var cardW=440,cardH=130,cardX=W/2-cardW/2,cardY=H/2-100;
    drawRoundRectP(ctx,cardX,cardY,cardW,cardH,12);
    ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fill();
    ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    var colW=cardW/3,rowY=cardY+45;
    var labels=['总关卡','完成','得分'];
    var values=[totalLv+'',completed+'',finalScore+''];
    var colors=['#fff','#4CAF50',GOLD];
    for(var i=0;i<3;i++){
        var cx=cardX+colW*i+colW/2;
        ctx.fillStyle=colors[i];ctx.font='bold 30px sans-serif';ctx.textAlign='center';
        ctx.fillText(values[i],cx,rowY);
        ctx.fillStyle='#aaa';ctx.font='14px sans-serif';
        ctx.fillText(labels[i],cx,rowY+32);
    }
    ctx.textAlign='start';

    // 步数效率副标题 (放在按钮上方, 不被卡片压住)
    var bw2=160,bh2=48,by2=cardY+cardH+30,bx1=W/2-bw2-20,bx2=W/2+20;
    ctx.fillStyle='#888';ctx.font='14px sans-serif';ctx.textAlign='center';
    ctx.fillText('步数效率: '+(Math.round(se*100))+'%',W/2,by2-12);
    ctx.textAlign='start';
    drawRoundRectP(ctx,bx1,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('重新开始',bx1+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    drawRoundRectP(ctx,bx2,by2,bw2,bh2,12);ctx.fillStyle=GOLD;ctx.globalAlpha=.3;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=GOLD;ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('下一项测试',bx2+bw2/2,by2+bh2/2);ctx.textBaseline='alphabetic';ctx.textAlign='start';
    cog._doneBtns=[{x:bx1,y:by2,w:bw2,h:bh2},{x:bx2,y:by2,w:bw2,h:bh2}];
}

function handleCanvasClick(ex, ey) {
    var c = document.getElementById('cognitive-canvas');
    if (!c || c.style.display === 'none') return false;
    var rect = c.getBoundingClientRect();
    var mx = (ex - rect.left) * (c.width / rect.width);
    var my = (ey - rect.top) * (c.height / rect.height);

    // 屏幕按钮
    if (cog.phase === 'ready' && cog._readyBtn) {
        var rb = cog._readyBtn;
        if (mx>=rb.x && mx<=rb.x+rb.w && my>=rb.y && my<=rb.y+rb.h) { cog.startTutorial(); return true; }
        return false;
    }
    if (cog.phase === 'tutorial_text' && cog._tutorialBtn) {
        var tb = cog._tutorialBtn;
        if (mx>=tb.x && mx<=tb.x+tb.w && my>=tb.y && my<=tb.y+tb.h) { cog.startPractice(); return true; }
        return false;
    }
    if (cog.phase === 'ready_start' && cog._readyStartBtn) { var rsb=cog._readyStartBtn; if (mx>=rsb.x && mx<=rsb.x+rsb.w && my>=rsb.y && my<=rsb.y+rsb.h) { cog.startGame(); return true; } return false; }
    if (cog.phase === 'done' && cog._doneBtns) { var gb=cog._doneBtns; if (mx>=gb[0].x&&mx<=gb[0].x+gb[0].w&&my>=gb[0].y&&my<=gb[0].y+gb[0].h) { cog.showReadyStart(); return true; } if (mx>=gb[1].x&&mx<=gb[1].x+gb[1].w&&my>=gb[1].y&&my<=gb[1].y+gb[1].h) { window._nextModule('planning'); return true; } return false; }
        if (cog.phase === 'ready_game' && cog._readyGameBtn) {
        var rgb = cog._readyGameBtn;
        if (mx>=rgb.x && mx<=rgb.x+rgb.w && my>=rgb.y && my<=rgb.y+rgb.h) { cog.showReadyStart(); return true; }
        return false;
    }

    for (var col = 0; col < 6; col++) {
        var cp = cog.colPos[col]; if (!cp) continue;
        var colH = cp.h * slotH + (cp.h - 1) * layerGap;
        if (mx >= cp.x - slotW/2 && mx <= cp.x + slotW/2 && my >= cp.y && my <= cp.y + colH) {
            cog.click(col); return true;
        }
    }
    return false;
}

function initCognitive() {
    var c = document.getElementById('cognitive-canvas');
    if (!c) return;
    var area = document.getElementById('detection-area');
    c.width = area ? area.offsetWidth : 1070;
    c.height = area ? area.offsetHeight : 746;
    initColumns();
    window.addEventListener('resize', function() {
        if (c.style.display !== 'none') {
            c.width = area ? area.offsetWidth : 1070;
            c.height = area ? area.offsetHeight : 746;
            calcColPositions();
        }
    });
    // 链式包装, 不覆盖之前的handler
    var prevHandler = window._handleCogClick;
    window._handleCogClick = function(ex, ey) {
        if (window.__cogModule === 'planning' && handleCanvasClick(ex, ey)) return true;
        if (prevHandler) return prevHandler(ex, ey);
        return false;
    };
    function loop() { renderCognitive(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
    document.getElementById('cog-start-btn').addEventListener('click', function() {
        if (cog.phase === 'done') cog.showReadyStart();
    });
    document.getElementById('back-btn-cognitive').addEventListener('click', function() {
        cog.phase = 'idle'; cog.selected = null; updateUI();
        var page2 = document.getElementById('page2');
        if (page2) page2.style.display = 'flex';
        if (window._hideCognitive) window._hideCognitive();
    });
}

window._showCognitive = function() {
    var c = document.getElementById('cognitive-canvas');
    var vc = document.getElementById('view-cognitive');
    var xc = document.getElementById('crosshair-canvas');
    if (c) c.style.display = 'block';
    if (vc) vc.style.display = 'flex';
    if (xc) xc.style.display = 'none';
    calcColPositions();
    if (window.__cogModule === 'planning') cog.showReady();
    updateUI();
};
window._hideCognitive = function() {
    var c = document.getElementById('cognitive-canvas');
    var xc = document.getElementById('crosshair-canvas');
    if (c) c.style.display = 'none';
    if (xc) xc.style.display = 'block';
    cog.phase = 'idle'; cog.selected = null; updateUI();
};

setTimeout(initCognitive, 500);
})();
