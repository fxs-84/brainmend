// ============================================================
// EVENTS - 事件处理
// ============================================================

function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const trajCard = document.getElementById('trajectory-card');
    trajCard.style.display = mode === 'coordination' ? 'block' : 'none';

    // 显示对应模式的视图
    document.getElementById('view-mode-select').style.display = mode === 'mode-select' ? 'block' : 'none';
    document.getElementById('view-integrated').style.display = mode === 'integrated' ? 'block' : 'none';
    document.getElementById('view-coordination').style.display = mode === 'coordination' ? 'block' : 'none';
    document.getElementById('view-rom').style.display = mode === 'rom' ? 'flex' : 'none';
    document.getElementById('view-position').style.display = mode === 'position' ? 'flex' : 'none';

    // ROM检测初始化
    if (mode === 'rom') {
        state.romStepIndex = 0;
        state.romResults = {};
        state.romIsWaitingForZero = false;
        state.collectedPoints = [];
        showROMInlineResults();
        updateROMGuide();
    }

    // 位置觉检测初始化
    if (mode === 'position') {
        state.positionStepIndex = 0;
        state.positionResults = [];
        state.positionIsRunning = false;
        updatePositionGuide();
    }

    // 协调性检测初始化
    if (mode === 'coordination') {
        state.coordScores = { tracking: [], trajectory: [], smoothness: [] };
        state.coordFailTime = 0;
        state.coordFullScores = [];
        state.coordCurrentTrajectoryIndex = 0;
        state.coordMode = 'single';
        updateCoordinationModeUI();
    }

    state.progress = 0;
    state.lastAnnouncedProgress = -1;
    state.holdTime = 0;
    state.integratedPhase = 0;
    updateProgress();
    state.trail = [];
    state.fullTrail = [];
    state.lastError = 0;
    state.collectedPoints = [];
    renderCollectedPoints();
    state.pitchOffset = 0;
    state.yawOffset = 0;
    state.rollOffset = 0;

    if (mode === 'integrated' || mode === 'coordination') {
        state.targetX = 0;
        state.targetY = 0;
    }
}

/**
 * 更新协调性检测模式UI
 */
function updateCoordinationModeUI() {
    const singleBtn = document.getElementById('coord-mode-single');
    const fullBtn = document.getElementById('coord-mode-full');
    const trajCard = document.getElementById('coord-trajectory-card');
    const trajTitle = document.getElementById('coord-trajectory-title');
    const fullProgress = document.getElementById('coord-full-progress');

    if (state.coordMode === 'single') {
        singleBtn.style.background = 'var(--primary)';
        singleBtn.style.color = 'var(--bg-dark)';
        fullBtn.style.background = 'transparent';
        fullBtn.style.color = 'var(--text)';
        trajCard.style.display = 'block';
        trajTitle.textContent = '轨迹选择';
        fullProgress.style.display = 'none';
    } else {
        fullBtn.style.background = 'var(--primary)';
        fullBtn.style.color = 'var(--bg-dark)';
        singleBtn.style.background = 'transparent';
        singleBtn.style.color = 'var(--text)';
        trajCard.style.display = 'none';
        trajTitle.textContent = '轨迹选择';
        fullProgress.style.display = 'block';
        document.getElementById('coord-full-progress-text').textContent = `${state.coordCurrentTrajectoryIndex}/5 已完成`;
    }
}

function updateROMGuide() {
    const romGuide = document.getElementById('rom-guide');
    const instruction = document.getElementById('rom-instruction');
    const progress = document.getElementById('rom-progress');
    const collectBtn = document.getElementById('collect-btn');

    if (state.romStepIndex === 0) {
        instruction.textContent = '请先归零';
        progress.textContent = '步骤 0/6';
        romGuide.classList.remove('rom-guide-active');
        collectBtn.textContent = '📍 采集当前点';
        collectBtn.disabled = true;
    } else if (state.romStepIndex <= 6) {
        const step = CONFIG.ROM_STEPS[state.romStepIndex - 1];
        if (state.romIsWaitingForZero) {
            instruction.textContent = '请归零进入下一步';
            instruction.style.background = 'rgba(0,217,165,0.1)';
            instruction.style.color = 'var(--primary)';
        } else {
            instruction.textContent = step.instruction;
            instruction.style.background = 'rgba(239,68,68,0.1)';
            instruction.style.color = 'var(--danger)';
        }
        progress.textContent = `步骤 ${state.romStepIndex}/6`;
        romGuide.classList.add('rom-guide-active');
        collectBtn.disabled = state.romIsWaitingForZero;
        collectBtn.textContent = state.romIsWaitingForZero ? '等待归零' : '📍 采集当前点';
    } else {
        instruction.textContent = '检测完成';
        progress.textContent = '已完成';
        romGuide.classList.remove('rom-guide-active');
        collectBtn.textContent = '查看结果';
        collectBtn.disabled = false;
    }
}

function updatePositionGuide() {
    const guide = document.getElementById('position-guide');
    const instruction = document.getElementById('position-instruction');
    const progress = document.getElementById('position-progress');
    const countdown = document.getElementById('position-countdown');
    const eyeHint = document.getElementById('position-eye-hint');
    const startBtn = document.getElementById('start-position-btn');

    countdown.style.display = 'none';
    eyeHint.style.display = 'none';
    startBtn.onclick = null; // 重置onclick

    if (state.positionStepIndex === 0) {
        instruction.textContent = '请先归零';
        instruction.style.background = 'rgba(0,217,165,0.1)';
        instruction.style.color = 'var(--primary)';
        progress.textContent = '步骤 0/6';
        startBtn.textContent = '开始检测';
        startBtn.disabled = false;
    } else if (state.positionStepIndex <= 6) {
        const step = CONFIG.POSITION_STEPS[state.positionStepIndex - 1];
        instruction.textContent = step.instruction;
        instruction.style.background = 'rgba(239,68,68,0.1)';
        instruction.style.color = 'var(--danger)';
        progress.textContent = `步骤 ${state.positionStepIndex}/6`;
        startBtn.textContent = '>>> 开始执行 <<<';
        startBtn.disabled = false;
        startBtn.style.fontWeight = 'bold';
        startBtn.style.fontSize = '14px';
        startBtn.style.display = 'block';
        startBtn.style.visibility = 'visible';
        startBtn.offsetHeight;
    } else {
        instruction.textContent = '检测完成';
        instruction.style.background = 'rgba(16,185,129,0.1)';
        instruction.style.color = 'var(--success)';
        progress.textContent = '已完成';
        startBtn.textContent = '重新检测';
        startBtn.disabled = false;
        showPositionResults();
    }
}

function executePositionStep() {
    const step = CONFIG.POSITION_STEPS[state.positionStepIndex - 1];
    const instruction = document.getElementById('position-instruction');
    const countdown = document.getElementById('position-countdown');
    const eyeHint = document.getElementById('position-eye-hint');
    const startBtn = document.getElementById('start-position-btn');

    // TTS：直接读屏幕上的文字
    speak(instruction.textContent);

    // 显示闭眼提示
    eyeHint.style.display = 'block';

    // 开始5秒倒计时
    let count = 5;
    countdown.style.display = 'block';
    countdown.textContent = count;

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;
        // TTS倒计时
        if (count > 0 && count <= 3) {
            speak(String(count));
        }
        if (count <= 0) {
            clearInterval(timer);
            countdown.style.display = 'none';
            eyeHint.style.display = 'none';
            instruction.textContent = '请回到初始位置，然后睁眼';
            startBtn.textContent = '采集位置';
            startBtn.disabled = false;
            state.positionIsRunning = false; // 等待采集
            speak(instruction.textContent);
        }
    }, 1000);
}

function collectPositionPoint() {
    // 计算与初始位置的偏移
    const errorPitch = Math.abs(state.pitch - state.positionInitialPitch);
    const errorYaw = Math.abs(state.yaw - state.positionInitialYaw);
    const errorRoll = Math.abs(state.roll - state.positionInitialRoll);

    const step = CONFIG.POSITION_STEPS[state.positionStepIndex - 1];
    state.positionResults.push({
        name: step.name,
        errorPitch: errorPitch,
        errorYaw: errorYaw,
        errorRoll: errorRoll,
        totalError: Math.sqrt(errorPitch * errorPitch + errorYaw * errorYaw + errorRoll * errorRoll)
    });

    // TTS语音提示
    ttsPosition('collect');

    state.positionStepIndex++;

    if (state.positionStepIndex > 6) {
        updatePositionGuide();
    } else {
        // 提示归零
        const instruction = document.getElementById('position-instruction');
        const startBtn = document.getElementById('start-position-btn');
        instruction.textContent = '请睁眼归零，然后进入下一步';
        instruction.style.background = 'rgba(0,217,165,0.1)';
        instruction.style.color = 'var(--primary)';
        startBtn.textContent = '归零';
        startBtn.disabled = false;
        state.positionIsRunning = 'waiting_for_zero'; // 等待归零状态
    }

    // 更新结果面板
    showPositionResults();
}

/**
 * 根据JPS研究标准分类位置觉结果
 * @param {number} error - 重新定位误差（度）
 * @returns {object} 包含等级和颜色的对象
 */
function classifyJPS(error) {
    if (error < 2) return { level: '优秀', zh: '优秀', color: '#22c55e' };
    if (error < 3) return { level: '良好', zh: '良好', color: '#84cc16' };
    if (error < 4.5) return { level: '正常', zh: '正常', color: '#06b6d4' };
    if (error < 6) return { level: '轻度障碍', zh: '轻度', color: '#eab308' };
    if (error < 9) return { level: '中度障碍', zh: '中度', color: '#f97316' };
    return { level: '重度障碍', zh: '重度', color: '#ef4444' };
}

function showPositionResults() {
    const resultsDiv = document.getElementById('position-results');

    if (state.positionResults.length === 0) {
        resultsDiv.innerHTML = `
            <div id="collect-count" style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">已采集 0/6</div>
            <div style="font-size: 10px; color: var(--text-muted);">暂无结果</div>
        `;
        return;
    }

    let html = `<div id="collect-count" style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">已采集 ${state.positionResults.length}/6</div>`;
    state.positionResults.forEach(r => {
        const classification = classifyJPS(r.totalError);
        html += `
            <div style="padding: 2px 0;">
                <span style="font-size: 10px;">${r.name}:</span>
                <span style="font-size: 10px; color: ${classification.color};">${r.totalError.toFixed(1)}° ${classification.zh}</span>
            </div>
        `;
    });

    // 计算平均误差和总体评级
    const avgError = state.positionResults.reduce((sum, r) => sum + r.totalError, 0) / state.positionResults.length;
    const overallClass = classifyJPS(avgError);
    html += `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 10px; color: var(--text-muted);">平均误差: <span style="color: ${overallClass.color};">${avgError.toFixed(1)}°</span></div>
            <div style="font-size: 10px; color: var(--text-muted);">总体评级: <span style="color: ${overallClass.color};">${overallClass.level}</span></div>
        </div>
    `;

    resultsDiv.innerHTML = html;
}

function startDetection() {
    if (state.isRunning) return;

    state.isRunning = true;
    state.progress = 0;
    state.holdTime = 0;
    state.results[state.mode] = 0;
    state.lastAnnouncedProgress = -1;

    // 确定协调性检测的时长和轨迹
    if (state.mode === 'coordination') {
        if (state.coordMode === 'full') {
            // 全模式：从第一轨迹开始
            state.coordCurrentTrajectoryIndex = 0;
            state.coordFullScores = [];
            state.trajectoryType = CONFIG.COORD_TRAJECTORIES[0];
            state.testDuration = CONFIG.COORD_FULL_DURATION;
        } else {
            // 单模式：使用当前选择的轨迹
            state.testDuration = CONFIG.COORD_SINGLE_DURATION;
        }
        state.coordScores = { tracking: [], trajectory: [], smoothness: [] };
        state.coordFailTime = 0;
        state.results.coordination = 0;
        updateCoordinationModeUI();
        updateCoordinationTrajectoryUI();
        updateCoordinationFullProgressUI();
    } else {
        state.testDuration = CONFIG.INTEGRATED_DURATION;
    }

    state.romRange = { pitch: { min: state.pitch, max: state.pitch }, yaw: { min: state.yaw, max: state.yaw } };
    state.integratedResults = { positionScore: 0, stabilityScore: 0, romScore: 0 };
    state.collectedPoints = [];
    renderCollectedPoints();

    // 根据模式设置对应的按钮状态
    if (state.mode === 'coordination') {
        const coordBtn = document.getElementById('action-btn-coord');
        if (coordBtn) {
            coordBtn.textContent = '检测中...';
            coordBtn.disabled = true;
        }
    } else {
        document.getElementById('action-btn').textContent = '检测中...';
        document.getElementById('action-btn').disabled = true;
    }

    const startTime = Date.now();

    function update() {
        if (!state.isRunning) return;

        const elapsed = (Date.now() - startTime) / 1000;

        switch (state.mode) {
            case 'integrated':
                updateIntegrated(elapsed);
                break;
            case 'position':
                updatePosition();
                break;
            case 'stability':
                updateStability(elapsed);
                break;
            case 'rom':
                updateROM();
                break;
            case 'coordination':
                updateCoordination(elapsed);
                break;
        }

        updateProgress();

        // 检查协调性检测是否需要进入下一个轨迹
        if (state.mode === 'coordination' && state.coordMode === 'full') {
            if (state.progress >= 1) {
                state.isRunning = false;

                // 保存当前轨迹的分数
                const scores = state.coordScores;
                if (scores && scores.tracking.length > 0) {
                    const avgTracking = scores.tracking.reduce((a, b) => a + b, 0) / scores.tracking.length;
                    const avgTrajectory = scores.trajectory.reduce((a, b) => a + b, 0) / scores.trajectory.length;
                    const avgSmoothness = scores.smoothness.reduce((a, b) => a + b, 0) / scores.smoothness.length;
                    const trajectoryScore = avgTracking * 0.4 + avgTrajectory * 0.3 + avgSmoothness * 0.3;
                    state.coordFullScores.push({
                        trajectory: state.trajectoryType,
                        score: trajectoryScore
                    });
                }

                state.coordCurrentTrajectoryIndex++;

                if (state.coordCurrentTrajectoryIndex < CONFIG.COORD_TRAJECTORIES.length) {
                    // 还有下一轨迹，显示继续按钮
                    const coordBtn = document.getElementById('action-btn-coord');
                    const trajNames = { 'horizontal': '水平', 'vertical': '垂直', 'vertical_left': '垂直左', 'vertical_right': '垂直右', 'figure8': '8字' };
                    coordBtn.textContent = `继续 (${state.coordCurrentTrajectoryIndex + 1}/${CONFIG.COORD_TRAJECTORIES.length})`;
                    coordBtn.disabled = false;
                    updateCoordinationFullProgressUI();
                } else {
                    // 所有轨迹完成，计算综合分数
                    const totalScore = state.coordFullScores.reduce((sum, s) => sum + s.score, 0) / state.coordFullScores.length;
                    state.results.coordination = totalScore;
                    stopDetection();
                }
                return;
            }
        } else if (state.progress >= 1) {
            stopDetection();
        } else {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

/**
 * 更新协调性检测的轨迹UI
 */
function updateCoordinationTrajectoryUI() {
    const trajNameEl = document.getElementById('coord-current-traj-name');
    const trajTitleEl = document.getElementById('coord-current-trajectory');

    if (state.coordMode === 'full') {
        const trajNames = {
            'horizontal': '水平',
            'vertical': '垂直',
            'vertical_left': '垂直左',
            'vertical_right': '垂直右',
            'figure8': '8字'
        };
        trajTitleEl.style.display = 'block';
        trajNameEl.textContent = trajNames[state.trajectoryType] || state.trajectoryType;
    } else {
        trajTitleEl.style.display = 'none';
    }
}

/**
 * 更新协调性全轨迹检测进度UI
 */
function updateCoordinationFullProgressUI() {
    const progressEl = document.getElementById('coord-full-progress-text');
    if (progressEl) {
        progressEl.textContent = `${state.coordCurrentTrajectoryIndex}/${CONFIG.COORD_TRAJECTORIES.length} 已完成`;
    }
}

function stopDetection() {
    state.isRunning = false;
    state.targetX = 0;
    state.targetY = 0;
    // 不再清空 trail，让轨迹保持在屏幕上

    // 根据模式重置对应的按钮
    if (state.mode === 'coordination') {
        const coordBtn = document.getElementById('action-btn-coord');
        if (coordBtn) {
            coordBtn.textContent = '开始检测';
            coordBtn.disabled = false;
        }
    } else {
        document.getElementById('action-btn').textContent = '开始检测';
        document.getElementById('action-btn').disabled = false;
    }

    const trajCard = document.getElementById('trajectory-card');
    trajCard.style.display = 'none';

    showResults();
}

// ============================================================
// INIT - 初始化
// ============================================================

function init() {
    resizeCanvas();
    initInput();
    initTTS();
    animate();
    updateProgress();
    renderCollectedPoints();

    // TTS切换按钮
    document.getElementById('tts-toggle').addEventListener('click', toggleTTS);

    // 模式按钮
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isRunning) return;
            setMode(btn.dataset.mode);
        });
    });

    // 轨迹按钮
    document.querySelectorAll('.traj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isRunning) return;
            state.trajectoryType = btn.dataset.traj;
            document.querySelectorAll('.traj-btn').forEach(b => {
                b.style.background = b === btn ? 'var(--primary)' : 'transparent';
                b.style.color = b === btn ? 'var(--bg-dark)' : 'var(--text)';
            });

            // 垂直左右跳转 - 使用旋转45°位置（半规管测试角度）
            const hLineLength = crosshairSize / 2 - 15;
            const angle45Offset = hLineLength * 45 / 80;
            if (state.trajectoryType === 'vertical_left') {
                state.targetX = -angle45Offset;
                state.targetY = 0;
            } else if (state.trajectoryType === 'vertical_right') {
                state.targetX = angle45Offset;
                state.targetY = 0;
            }
        });
    });

    // 协调性检测模式按钮（单轨迹/全轨迹）
    document.querySelectorAll('.coord-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isRunning) return;
            state.coordMode = btn.dataset.mode;
            updateCoordinationModeUI();
        });
    });

    // 采集按钮
    document.getElementById('collect-btn').addEventListener('click', collectPoint);

    // 归零按钮
    document.getElementById('zero-btn').addEventListener('click', zeroPosition);
    document.getElementById('zero-btn-position').addEventListener('click', zeroPosition);

    // 返回按钮
    document.getElementById('back-btn-integrated').addEventListener('click', () => setMode('mode-select'));
    document.getElementById('back-btn-coordination').addEventListener('click', () => setMode('mode-select'));
    document.getElementById('back-btn-rom').addEventListener('click', () => setMode('mode-select'));
    document.getElementById('back-btn-position').addEventListener('click', () => setMode('mode-select'));

    // 位置觉检测开始按钮
    const startPosBtn = document.getElementById('start-position-btn');
    startPosBtn.addEventListener('click', () => {
        const instruction = document.getElementById('position-instruction');

        if (state.positionStepIndex === 0) {
            // 等待用户先归零
            speak(instruction.textContent);
        } else if (state.positionStepIndex >= 1 && state.positionStepIndex <= 6) {
            if (state.positionIsRunning === true) {
                speak(instruction.textContent);
                executePositionStep();
            } else if (state.positionIsRunning === false) {
                speak('请采集位置');
                collectPositionPoint();
            } else if (state.positionIsRunning === 'waiting_for_zero') {
                speak('请睁眼归零');
                zeroPosition();
            }
        } else {
            // 重新开始
            state.positionStepIndex = 0;
            state.positionResults = [];
            document.getElementById('position-results').innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">暂无结果</div>';
            updatePositionGuide();
            speak(instruction.textContent);
        }
    });

    // 位置觉归零按钮
    const zeroBtnPos = document.getElementById('zero-btn-position');
    zeroBtnPos.addEventListener('click', () => {
        zeroPosition();
    });

    // 缩放滑块
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');
    zoomSlider.addEventListener('input', e => {
        state.zoomFactor = e.target.value / 100;
        zoomValue.textContent = e.target.value + '%';
        resizeCanvas();
    });

    // 鼠标滚轮缩放
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        state.zoomFactor = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, state.zoomFactor + zoomDelta));
        zoomSlider.value = state.zoomFactor * 100;
        zoomValue.textContent = Math.round(state.zoomFactor * 100) + '%';
        resizeCanvas();
    }, { passive: false });

    // 开始检测按钮（综合检测）
    document.getElementById('action-btn').addEventListener('click', () => {
        if (state.isRunning) return;
        setMode('integrated');
        startDetection();
    });

    // 开始检测按钮（协调性检测）
    document.getElementById('action-btn-coord').addEventListener('click', () => {
        if (state.isRunning) return;

        // 如果是全模式且已完成部分轨迹，检查是否需要继续
        if (state.coordMode === 'full' && state.coordCurrentTrajectoryIndex > 0) {
            const btn = document.getElementById('action-btn-coord');
            const btnText = btn.textContent;
            if (btnText.includes('继续')) {
                // 继续下一个轨迹
                state.trajectoryType = CONFIG.COORD_TRAJECTORIES[state.coordCurrentTrajectoryIndex];
                state.coordScores = { tracking: [], trajectory: [], smoothness: [] };
                state.progress = 0;
                state.testDuration = CONFIG.COORD_FULL_DURATION;
                state.isRunning = true;
                btn.textContent = '检测中...';
                btn.disabled = true;
                updateCoordinationTrajectoryUI();
                updateCoordinationFullProgressUI();

                const startTime = Date.now();
                function update() {
                    if (!state.isRunning) return;
                    const elapsed = (Date.now() - startTime) / 1000;
                    updateCoordination(elapsed);
                    updateProgress();

                    if (state.progress >= 1) {
                        state.isRunning = false;
                        const scores = state.coordScores;
                        if (scores && scores.tracking.length > 0) {
                            const avgTracking = scores.tracking.reduce((a, b) => a + b, 0) / scores.tracking.length;
                            const avgTrajectory = scores.trajectory.reduce((a, b) => a + b, 0) / scores.trajectory.length;
                            const avgSmoothness = scores.smoothness.reduce((a, b) => a + b, 0) / scores.smoothness.length;
                            const trajectoryScore = avgTracking * 0.4 + avgTrajectory * 0.3 + avgSmoothness * 0.3;
                            state.coordFullScores.push({ trajectory: state.trajectoryType, score: trajectoryScore });
                        }
                        state.coordCurrentTrajectoryIndex++;
                        if (state.coordCurrentTrajectoryIndex < CONFIG.COORD_TRAJECTORIES.length) {
                            const coordBtn = document.getElementById('action-btn-coord');
                            coordBtn.textContent = `继续 (${state.coordCurrentTrajectoryIndex + 1}/${CONFIG.COORD_TRAJECTORIES.length})`;
                            coordBtn.disabled = false;
                            updateCoordinationFullProgressUI();
                        } else {
                            const totalScore = state.coordFullScores.reduce((sum, s) => sum + s.score, 0) / state.coordFullScores.length;
                            state.results.coordination = totalScore;
                            stopDetection();
                        }
                        return;
                    }
                    requestAnimationFrame(update);
                }
                requestAnimationFrame(update);
                return;
            }
        }

        setMode('coordination');
        // TTS在模式切换前播报，避免延迟
        if (TTS_CONFIG.enabled) {
            speak('协调性检测开始');
        }
        startDetection();
    });

    // 轨迹卡片拖动
    const trajCard = document.getElementById('trajectory-card');
    let isDragging = false;
    let dragOffsetX = 0, dragOffsetY = 0;

    trajCard.addEventListener('mousedown', e => {
        if (e.target.classList.contains('traj-btn')) return;
        isDragging = true;
        dragOffsetX = e.clientX - trajCard.offsetLeft;
        dragOffsetY = e.clientY - trajCard.offsetTop;
        trajCard.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const x = Math.max(0, Math.min(window.innerWidth - trajCard.offsetWidth, e.clientX - dragOffsetX));
        const y = Math.max(0, Math.min(window.innerHeight - trajCard.offsetHeight, e.clientY - dragOffsetY));
        trajCard.style.left = x + 'px';
        trajCard.style.bottom = 'auto';
        trajCard.style.top = y + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        trajCard.style.cursor = 'move';
    });

    // 关闭弹窗
    function closeModal() {
        document.getElementById('result-modal').classList.remove('show');
    }
    document.getElementById('close-modal').addEventListener('click', closeModal);

    // 时钟
    setInterval(() => {
        const now = new Date();
        document.getElementById('current-time').textContent =
            now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }, 1000);

    window.addEventListener('resize', resizeCanvas);

    // 输入模式切换（鼠标/陀螺仪）
    const toggleBtn = document.getElementById('toggle-input-mode');
    toggleBtn.addEventListener('click', () => {
        state.useGyroscope = !state.useGyroscope;
        if (state.useGyroscope) {
            toggleBtn.textContent = '陀螺仪模式';
            toggleBtn.style.background = 'var(--primary)';
            toggleBtn.style.color = 'var(--bg-dark)';
            // 启用手机陀螺仪
            enableDeviceOrientation();
            // 显示提示
            if (window.DeviceOrientationEvent) {
                document.getElementById('connection-status').textContent = '陀螺仪已启用';
            } else {
                document.getElementById('connection-status').textContent = '不支持陀螺仪';
            }
        } else {
            toggleBtn.textContent = '鼠标模式';
            toggleBtn.style.background = 'var(--bg-panel)';
            toggleBtn.style.color = 'var(--text)';
            // 禁用手机陀螺仪
            disableDeviceOrientation();
            document.getElementById('connection-status').textContent = '等待连接...';
        }
        // 切换时重置归零偏移
        state.pitchOffset = state.pitch;
        state.yawOffset = state.yaw;
        state.rollOffset = state.roll;
    });

    // 陀螺仪蓝牙连接弹窗
    const gyroModal = document.getElementById('gyro-modal');
    const openGyroBtn = document.getElementById('open-gyro-modal');
    const closeGyroBtn = document.getElementById('close-gyro-modal');
    const gyroScanBtn = document.getElementById('gyro-scan-btn');
    const gyroDisconnectBtn = document.getElementById('gyro-disconnect-btn');
    const gyroDeviceList = document.getElementById('gyro-device-list');
    const gyroStatusText = document.getElementById('gyro-status-text');
    const gyroDeviceName = document.getElementById('gyro-device-name');
    const gyroBattery = document.getElementById('gyro-battery');
    const gyroDebug = document.getElementById('gyro-debug');
    const gyroDebugContent = document.getElementById('gyro-debug-content');

    let bluetoothDevice = null;
    let gyroCharacteristic = null;
    let gyroServer = null;

    function logGyroDebug(msg) {
        const time = new Date().toLocaleTimeString();
        gyroDebugContent.innerHTML = `<div style="margin-bottom: 2px;"><span style="color: var(--text-muted);">[${time}]</span> ${msg}</div>` + gyroDebugContent.innerHTML;
        if (gyroDebugContent.children.length > 50) {
            gyroDebugContent.removeChild(gyroDebugContent.lastChild);
        }
    }

    function updateGyroStatus(status, deviceName = '', battery = '') {
        gyroStatusText.textContent = status;
        gyroStatusText.style.color = status === '已连接' ? 'var(--success)' : status === '连接中...' ? 'var(--warning)' : 'var(--text-muted)';
        gyroDeviceName.textContent = deviceName;
        gyroBattery.innerHTML = battery;
    }

    function showGyroModal() {
        gyroModal.classList.add('show');
        gyroDebug.style.display = 'block';
        if (bluetoothDevice && bluetoothDevice.gatt.connected) {
            gyroDisconnectBtn.style.display = 'block';
            gyroScanBtn.style.display = 'none';
            updateGyroStatus('已连接', bluetoothDevice.name || '未知设备');
        } else {
            gyroDisconnectBtn.style.display = 'none';
            gyroScanBtn.style.display = 'block';
            updateGyroStatus('未连接');
        }
    }

    function closeGyroModal() {
        gyroModal.classList.remove('show');
    }

    openGyroBtn.addEventListener('click', showGyroModal);
    closeGyroBtn.addEventListener('click', closeGyroModal);
    gyroModal.addEventListener('click', (e) => {
        if (e.target === gyroModal) closeGyroModal();
    });

    // 扫描蓝牙设备
    gyroScanBtn.addEventListener('click', async () => {
        if (!navigator.bluetooth) {
            logGyroDebug('错误: 当前浏览器不支持Web Bluetooth API');
            alert('请使用支持蓝牙的浏览器（如Chrome）');
            return;
        }

        gyroScanBtn.textContent = '扫描中...';
        gyroScanBtn.disabled = true;
        gyroDeviceList.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">正在搜索设备...</div>';

        try {
            const serviceUuid = document.getElementById('gyro-service-uuid').value.trim();
            const options = {
                acceptAllDevices: !serviceUuid,
                optionalServices: serviceUuid ? [serviceUuid] : undefined
            };

            logGyroDebug('请求设备...');
            bluetoothDevice = await navigator.bluetooth.requestDevice(options);

            if (!bluetoothDevice.gatt) {
                throw new Error('设备不支持GATT连接');
            }

            logGyroDebug(`选择设备: ${bluetoothDevice.name || '未知设备'}`);
            gyroDeviceList.innerHTML = `
                <div style="padding: 8px;">
                    <div style="font-size: 12px; margin-bottom: 4px;">${bluetoothDevice.name || '未知设备'}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">点击"连接"按钮进行连接</div>
                    <button id="gyro-connect-btn" style="margin-top: 8px; padding: 6px 12px; background: var(--primary); color: var(--bg-dark); border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">连接</button>
                </div>
            `;

            document.getElementById('gyro-connect-btn').addEventListener('click', connectGyroscope);

        } catch (err) {
            logGyroDebug(`扫描失败: ${err.message}`);
            gyroDeviceList.innerHTML = '<div style="font-size: 11px; color: var(--danger); text-align: center; padding: 10px;">扫描失败: ' + err.message + '</div>';
        } finally {
            gyroScanBtn.textContent = '扫描设备';
            gyroScanBtn.disabled = false;
        }
    });

    async function connectGyroscope() {
        if (!bluetoothDevice) return;

        updateGyroStatus('连接中...');
        gyroScanBtn.textContent = '连接中...';
        gyroScanBtn.disabled = true;

        try {
            logGyroDebug('正在连接GATT服务器...');
            gyroServer = await bluetoothDevice.gatt.connect();
            logGyroDebug('GATT连接成功');

            // 获取电池服务（如果可用）
            try {
                const batteryService = await gyroServer.getPrimaryService('180f');
                const batteryChar = await batteryService.getCharacteristic('2a19');
                const batteryValue = await batteryChar.readValue();
                const batteryLevel = batteryValue.getUint8(0);
                logGyroDebug(`电池电量: ${batteryLevel}%`);
                gyroBattery.innerHTML = `<span style="color: ${batteryLevel < 20 ? 'var(--danger)' : 'var(--success)'};">🔋 ${batteryLevel}%</span>`;
            } catch (e) {
                logGyroDebug('电池服务不可用');
            }

            // 获取陀螺仪服务
            const serviceUuid = document.getElementById('gyro-service-uuid').value.trim() || '181a'; // 默认环境感知服务
            logGyroDebug(`获取服务: ${serviceUuid}`);
            const gyroService = await gyroServer.getPrimaryService(serviceUuid);
            const characteristics = await gyroService.getCharacteristics();
            logGyroDebug(`找到 ${characteristics.length} 个特征值`);

            // 查找可读的特征值
            let foundChar = null;
            for (const char of characteristics) {
                logGyroDebug(`特征值: ${char.uuid} (属性: ${char.properties.read ? 'R' : ''}${char.properties.notify ? 'N' : ''})`);
                if (char.properties.notify || char.properties.read) {
                    foundChar = char;
                    break;
                }
            }

            if (!foundChar) {
                throw new Error('未找到可用的特征值');
            }

            gyroCharacteristic = foundChar;
            logGyroDebug(`使用特征值: ${gyroCharacteristic.uuid}`);

            // 订阅通知（如果支持）
            if (gyroCharacteristic.properties.notify) {
                await gyroCharacteristic.startNotifications();
                gyroCharacteristic.addEventListener('characteristicvaluechanged', handleGyroscopeData);
                logGyroDebug('已订阅通知');
            } else {
                // 否则轮询读取
                logGyroDebug('设备不支持通知，将使用轮询');
                setInterval(async () => {
                    if (gyroCharacteristic && gyroCharacteristic.service.device.gatt.connected) {
                        try {
                            const value = await gyroCharacteristic.readValue();
                            handleGyroscopeData({ target: { value } });
                        } catch (e) {}
                    }
                }, 50); // 20Hz
            }

            // 更新UI
            bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
            updateGyroStatus('已连接', bluetoothDevice.name || '未知设备');
            gyroDisconnectBtn.style.display = 'block';
            gyroScanBtn.style.display = 'none';
            logGyroDebug('连接完成');

            // 自动切换到陀螺仪模式
            if (!state.useGyroscope) {
                state.useGyroscope = true;
                toggleBtn.textContent = '陀螺仪模式';
                toggleBtn.style.background = 'var(--primary)';
                toggleBtn.style.color = 'var(--bg-dark)';
            }

        } catch (err) {
            logGyroDebug(`连接失败: ${err.message}`);
            updateGyroStatus('连接失败');
            gyroScanBtn.textContent = '扫描设备';
            gyroScanBtn.disabled = false;
        }
    }

    function handleGyroscopeData(event) {
        const value = event.target.value;
        // 根据不同数据格式解析
        // 这里需要根据实际陀螺仪的数据格式来解析
        // 常见格式: 3个16位有符号整数(x, y, z) 或 3个浮点数

        try {
            let yaw = 0, pitch = 0, roll = 0;

            // 尝试不同的数据格式
            if (value.byteLength >= 6) {
                // 格式1: 3个16位有符号整数 (常见格式)
                const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
                pitch = view.getInt16(0, true) / 100; // 假设100度/秒为最大值
                yaw = view.getInt16(2, true) / 100;
                roll = view.getInt16(4, true) / 100;
            } else if (value.byteLength >= 12) {
                // 格式2: 3个32位浮点数
                const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
                pitch = view.getFloat32(0, true);
                yaw = view.getFloat32(4, true);
                roll = view.getFloat32(8, true);
            } else if (value.byteLength === 3) {
                // 格式3: 3个8位有符号整数
                pitch = value.getInt8(0);
                yaw = value.getInt8(1);
                roll = value.getInt8(2);
            }

            // 调用陀螺仪更新函数
            window.updateFromGyroscope({ yaw, pitch, roll });

            // 调试显示前几个值
            if (Math.random() < 0.02) {
                logGyroDebug(`数据: yaw=${yaw.toFixed(1)} pitch=${pitch.toFixed(1)} roll=${roll.toFixed(1)}`);
            }

        } catch (err) {
            if (Math.random() < 0.1) {
                logGyroDebug(`解析错误: ${err.message}`);
            }
        }
    }

    function onDisconnected() {
        logGyroDebug('设备断开连接');
        updateGyroStatus('未连接');
        gyroDisconnectBtn.style.display = 'none';
        gyroScanBtn.style.display = 'block';
        gyroScanBtn.textContent = '扫描设备';
        gyroScanBtn.disabled = false;
        gyroCharacteristic = null;
        gyroServer = null;
    }

    // 断开连接
    gyroDisconnectBtn.addEventListener('click', () => {
        if (gyroCharacteristic && gyroCharacteristic.service.device.gatt.connected) {
            gyroCharacteristic.service.device.gatt.disconnect();
        }
        onDisconnected();
    });
}
