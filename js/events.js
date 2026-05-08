// ============================================================
// EVENTS - 事件处理
// ============================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { canvas, crosshairSize, ringRadius, resizeCanvas, animate } from './canvas.js';
import { initInput } from './input.js';
import { initTTS, toggleTTS, speakWithCallback, speak } from './tts.js';
import { renderCollectedPoints, updateProgress, zeroPosition, collectPoint, showROMResults, showROMInlineResults, showComprehensiveReport, promptSavePatient, showRecordsModal, generateComprehensiveReport, savePatientData, showResults } from './ui.js';
import { updateCoordination } from './detection.js';

let lastZoomFactor = 1;

function setMode(mode) {
    // 侧边栏：游戏模式自动折叠，检测模式保留操作面板
    const sp = document.getElementById('side-panel');
    const stb = document.getElementById('sidebar-toggle');
    if (mode === 'mode-select') {
        sp.classList.remove('collapsed');
        if (stb) stb.textContent = '◀';
    } else if (mode === 'game') {
        sp.classList.add('collapsed');
        if (stb) { stb.textContent = '▶'; stb.style.display = 'block'; }
    }
    // 检测模式(integrated/coordination/rom/position)：侧边栏保持展开

    // 离开游戏模式时隐藏游戏选择界面 + 恢复EMA追踪
    if (state.mode === 'game' && mode !== 'game') {
        const gameSelectPanel = document.getElementById('game-select-panel');
        if (gameSelectPanel) {
            gameSelectPanel.style.display = 'none';
        }
        if (window._freezeGyroEMA) window._freezeGyroEMA(false);
    }

    const prevMode = state.mode;
    state.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 显示对应模式的视图
    document.getElementById('view-mode-select').style.display = mode === 'mode-select' ? 'block' : 'none';
    document.getElementById('view-integrated').style.display = mode === 'integrated' ? 'block' : 'none';
    document.getElementById('view-coordination').style.display = mode === 'coordination' ? 'block' : 'none';
    document.getElementById('view-rom').style.display = mode === 'rom' ? 'flex' : 'none';
    document.getElementById('view-position').style.display = mode === 'position' ? 'flex' : 'none';
    document.getElementById('view-game').style.display = mode === 'game' ? 'flex' : 'none';

    // ROM检测初始化
    if (mode === 'rom') {
        state.yawRange = 80;
        state.pitchRange = 45;
        state.romStepIndex = 0;
        state.romResults = {};
        state.romIsWaitingForZero = false;
        state.collectedPoints = [];
        showROMInlineResults();
        updateROMGuide();
    }

    // 位置觉检测初始化
    if (mode === 'position') {
        state.yawRange = 80;
        state.pitchRange = 45;
        state.positionStepIndex = 0;
        state.positionResults = [];
        state.positionIsRunning = false;
        updatePositionGuide();
        showPositionResults(); // 清空上次残留的DOM数据
    }

    // 协调性检测初始化
    if (mode === 'coordination') {
        state.yawRange = 30;
        state.pitchRange = 22.5;
        state.coordScores = { tracking: [], trajectory: [], smoothness: [] };
        state.coordFailTime = 0;
        state._driftCount = 0;
        state._driftStreak = 0;
        state.coordFullScores = [];
        state.coordCurrentTrajectoryIndex = 0;
        // 仅在首次进入时重置为单轨迹模式，已选模式后不重置
        if (mode !== prevMode) {
            state.coordMode = 'single';
            state.targetX = 0;
            state.targetY = 0;
        }
        updateCoordinationModeUI();
    }

    // 游戏模式初始化
    if (mode === 'game') {
        state.yawRange = 30;
        state.pitchRange = 22.5;
        initGame();
    }

    // 按当前模块范围重算角度系数
    const hLineLen = crosshairSize / 2 - 15;
    const vLineLen = ringRadius * 0.85;
    state.yawCoefficient = state.yawRange / hLineLen;
    state.pitchCoefficient = state.pitchRange / vLineLen;

    state.isRunning = false;
    state.progress = 0;
    state.lastAnnouncedProgress = -1;
    state.holdTime = 0;
    updateProgress();
    state.trail = [];
    state.fullTrail = [];
    state.lastError = 0;
    state.collectedPoints = [];
    renderCollectedPoints();

    // 重置各检测模块的按钮状态
    const coordBtn = document.getElementById('action-btn-coord');
    if (coordBtn) {
        coordBtn.textContent = '开始检测';
        coordBtn.disabled = false;
    }
    const actionBtn = document.getElementById('action-btn');
    if (actionBtn) {
        actionBtn.textContent = '开始检测';
        actionBtn.disabled = false;
    }

    // 仅在切换到不同模式时重置归零偏移
    if (mode !== prevMode) {
        state.pitchOffset = 0;
        state.yawOffset = 0;
        state.rollOffset = 0;
    }

    if ((mode === 'integrated' || mode === 'coordination') && mode !== prevMode) {
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
    const trainBtn = document.getElementById('coord-training-toggle');
    const trajCard = document.getElementById('coord-trajectory-card');
    const trajTitle = document.getElementById('coord-trajectory-title');
    const fullProgress = document.getElementById('coord-full-progress');

    if (state.coordTrainingMode) {
        singleBtn.style.background = 'transparent';
        singleBtn.style.color = 'var(--text)';
        fullBtn.style.background = 'transparent';
        fullBtn.style.color = 'var(--text)';
        if (trainBtn) {
            trainBtn.style.background = 'var(--primary)';
            trainBtn.style.color = 'var(--bg-dark)';
            trainBtn.textContent = '训练模式 (1分30秒)';
        }
        trajCard.style.display = 'block';
        trajTitle.textContent = '轨迹选择';
        fullProgress.style.display = 'none';
    } else if (state.coordMode === 'single') {
        singleBtn.style.background = 'var(--primary)';
        singleBtn.style.color = 'var(--bg-dark)';
        fullBtn.style.background = 'transparent';
        fullBtn.style.color = 'var(--text)';
        if (trainBtn) {
            trainBtn.style.background = 'transparent';
            trainBtn.style.color = 'var(--text)';
            trainBtn.textContent = '训练模式 (1分30秒)';
        }
        trajCard.style.display = 'block';
        trajTitle.textContent = '轨迹选择';
        fullProgress.style.display = 'none';
    } else {
        fullBtn.style.background = 'var(--primary)';
        fullBtn.style.color = 'var(--bg-dark)';
        singleBtn.style.background = 'transparent';
        singleBtn.style.color = 'var(--text)';
        if (trainBtn) {
            trainBtn.style.background = 'transparent';
            trainBtn.style.color = 'var(--text)';
            trainBtn.textContent = '训练模式 (1分30秒)';
        }
        trajCard.style.display = 'none';
        trajTitle.textContent = '轨迹选择';
        fullProgress.style.display = 'block';
        document.getElementById('coord-full-progress-text').textContent = `${state.coordCurrentTrajectoryIndex}/6 已完成`;
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
        // 进入界面时播报操作指引
        speak('请先归零');
    } else if (state.romStepIndex <= 6) {
        const step = CONFIG.ROM_STEPS[state.romStepIndex - 1];
        if (state.romIsWaitingForZero) {
            instruction.textContent = '请归零进入下一步';
            instruction.style.background = 'rgba(0,217,165,0.1)';
            instruction.style.color = 'var(--primary)';
            collectBtn.disabled = true;
            collectBtn.textContent = '等待归零';
            // 采集后播报下一步指引
            speak('请归零进入下一步');
        } else {
            instruction.textContent = step.instruction;
            instruction.style.background = 'rgba(239,68,68,0.1)';
            instruction.style.color = 'var(--danger)';
            collectBtn.disabled = false;
            collectBtn.textContent = '📍 采集当前点';
            // 显示操作指令时播报
            speak(step.instruction);
        }
        progress.textContent = `步骤 ${state.romStepIndex}/6`;
        romGuide.classList.add('rom-guide-active');
    } else {
        instruction.textContent = '检测完成';
        progress.textContent = '已完成';
        romGuide.classList.remove('rom-guide-active');
        collectBtn.textContent = '查看结果';
        collectBtn.disabled = false;
        // 检测完成时播报
        speak('检测完成');
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
    startBtn.onclick = null;

    // 训练模式：单项训练引导
    if (state.positionTrainingMode) {
        if (state.positionStepIndex === 0) {
            instruction.textContent = '请选择训练方向';
            instruction.style.background = 'rgba(0,217,165,0.1)';
            instruction.style.color = 'var(--primary)';
            progress.textContent = '训练模式';
            startBtn.textContent = '开始检测';
            startBtn.disabled = true;
        } else if (state._posLocked) {
            instruction.textContent = '请睁眼，查看偏差后归零';
            instruction.style.background = 'rgba(239,68,68,0.1)';
            instruction.style.color = 'var(--danger)';
            progress.textContent = '光点已锁定';
            startBtn.textContent = '归零解锁';
            startBtn.disabled = false;
        } else if (state.positionIsRunning === true) {
            instruction.style.background = 'rgba(239,68,68,0.1)';
            instruction.style.color = 'var(--danger)';
            progress.textContent = '闭眼移动中...';
            startBtn.disabled = true;
        } else {
            instruction.textContent = '已选择方向，请先归零';
            instruction.style.background = 'rgba(0,217,165,0.1)';
            instruction.style.color = 'var(--primary)';
            progress.textContent = '训练模式';
            startBtn.textContent = '>>> 开始执行 <<<';
            startBtn.disabled = false;
        }
        return;
    }

    // 检测模式（原逻辑）
    if (state.positionStepIndex === 0) {
        instruction.textContent = '请先归零';
        instruction.style.background = 'rgba(0,217,165,0.1)';
        instruction.style.color = 'var(--primary)';
        progress.textContent = '步骤 0/6';
        startBtn.textContent = '开始检测';
        startBtn.disabled = false;
        speak('请先归零');
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
        // 显示操作指令时播报
        speak(step.instruction);
    } else {
        instruction.textContent = '检测完成';
        instruction.style.background = 'rgba(16,185,129,0.1)';
        instruction.style.color = 'var(--success)';
        progress.textContent = '已完成';
        startBtn.textContent = '重新检测';
        startBtn.disabled = false;
        showPositionResults();
        // 检测完成时播报
        speak('检测完成');
    }
}

function executePositionStep() {
    const step = CONFIG.POSITION_STEPS[state.positionStepIndex - 1];
    const instruction = document.getElementById('position-instruction');
    const countdown = document.getElementById('position-countdown');
    const eyeHint = document.getElementById('position-eye-hint');
    const startBtn = document.getElementById('start-position-btn');

    // 闭眼提示已在updatePositionGuide时播报过，这里不再重复

    // 显示闭眼提示
    eyeHint.style.display = 'block';

    // 开始5秒倒计时
    let count = 5;
    countdown.style.display = 'block';
    countdown.textContent = count;
    // 倒计时开始时播报
    speak(String(count));

    const timer = setInterval(() => {
        count--;
        countdown.textContent = count;
        // TTS播报倒计时数字
        if (count > 0) {
            speak(String(count));
        }
        if (count <= 0) {
            clearInterval(timer);
            countdown.style.display = 'none';
            eyeHint.style.display = 'none';
            state.positionIsRunning = false;
            if (state.positionTrainingMode) {
                // 训练模式：提示回到初始位置，用户归位后再采集
                instruction.textContent = '闭眼回到初始位置后，点击采集';
                startBtn.textContent = '采集锁定';
                startBtn.disabled = false;
                speak('闭眼回到初始位置，等待采集');
            } else {
                instruction.textContent = '请回到初始位置，然后睁眼';
                startBtn.textContent = '采集位置';
                startBtn.disabled = false;
                speak('回到初始位置，等待采集');
            }
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

    // 采集后播报"请睁眼"
    speak('请睁眼');

    state.positionStepIndex++;

    if (state.positionStepIndex > 6) {
        updatePositionGuide();
        // 显示综合报告弹窗
        showPositionReportModal();
    } else {
        // 提示归零进入下一步
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
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.1);">
            <div style="font-size: 10px; color: var(--text-muted);">平均误差: <span style="color: ${overallClass.color};">${avgError.toFixed(1)}°</span></div>
            <div style="font-size: 10px; color: var(--text-muted);">总体评级: <span style="color: ${overallClass.color};">${overallClass.level}</span></div>
        </div>
    `;

    resultsDiv.innerHTML = html;
}

function showPositionReportModal() {
    // 位置觉完成：只更新 inline 显示 + 自动保存，不出弹窗
    showPositionResults();
    if (state.clientInfo && state.clientInfo.name) {
        const report = generateComprehensiveReport();
        if (report.available.length > 0) savePatientData(state.clientInfo, report);
    }
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
        if (state.coordTrainingMode) {
            // 训练模式：当前轨迹1分30秒
            state.testDuration = CONFIG.COORD_TRAINING_DURATION;
        } else if (state.coordMode === 'full') {
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
        state._driftCount = 0;
        state._driftStreak = 0;
        state.results.coordination = 0;
        updateCoordinationModeUI();
        updateCoordinationTrajectoryUI();
        updateCoordinationFullProgressUI();
        // 语音播报完成后再启动红色光点移动
        speakWithCallback('请跟随红色光点，保持同步移动', () => {
            if (state.coordMode === 'single') {
        const btn = document.getElementById('action-btn-coord');
        btn.textContent = '检测中...';
        btn.disabled = true;

        const startTime = Date.now();
        function updateCoordLoop() {
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
                    state.results.coordination = avgTracking * 0.4 + avgTrajectory * 0.3 + avgSmoothness * 0.3;
                }
                stopDetection();
                return;
            }
            requestAnimationFrame(updateCoordLoop);
        }
        requestAnimationFrame(updateCoordLoop);
            } else {
                // Full mode: 启动通用检测循环
                const coordBtn = document.getElementById('action-btn-coord');
                if (coordBtn) {
                    coordBtn.textContent = '检测中...';
                    coordBtn.disabled = true;
                }
                const startTime = Date.now();
                function updateFull() {
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
                            const trajNames = { 'horizontal': '水平', 'vertical': '垂直', 'vertical_left': '垂直左', 'vertical_right': '垂直右', 'figure8': '8字', 'figure8_reverse': '8字反' };
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
                    requestAnimationFrame(updateFull);
                }
                requestAnimationFrame(updateFull);
            }
        });
        return;
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
                    const trajNames = { 'horizontal': '水平', 'vertical': '垂直', 'vertical_left': '垂直左', 'vertical_right': '垂直右', 'figure8': '8字', 'figure8_reverse': '8字反' };
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
            'figure8': '8字',
            'figure8_reverse': '8字反'
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
        speak('跟踪结束');
    } else {
        document.getElementById('action-btn').textContent = '开始检测';
        document.getElementById('action-btn').disabled = false;
    }

    showResults();
}

// ============================================================
// GAME - 游戏模块
// ============================================================

function initGame() {
    // 使用主画布
    const canvas = document.getElementById('crosshair-canvas');
    if (!canvas) return;
    if (!window.GameModule) return;

    // 创建游戏引擎
    if (!window.gameEngine) {
        window.gameEngine = new GameModule.GameEngine(canvas);
        window.gameEngine.init();

        // 设置颈椎能力评估报告回调
        window.gameEngine.onCervicalReport = showGameCervicalReport;
    }

    // 显示游戏选择界面
    if (window.gameUI) {
        window.gameUI.showSelectPanel();
    } else {
        window.gameUI = new GameModule.GameUI(window.gameEngine);
        window.gameUI.showSelectPanel();
    }
}

/**
 * 显示游戏颈椎能力评估报告
 */
function showGameCervicalReport(report) {
    const modal = document.getElementById('game-report-modal');
    if (!modal) return;

    // 填充数据
    document.getElementById('game-grade').textContent = report.overall.grade;
    document.getElementById('game-grade').style.color = report.overall.score >= 70 ? '#22c55e' : report.overall.score >= 50 ? '#eab308' : '#ef4444';
    document.getElementById('game-overall-score').textContent = report.overall.score;

    // 五维能力
    const abilities = ['rom', 'proprioception', 'stability', 'coordination', 'reaction'];
    const barColors = ['#22c55e', '#84cc16', '#eab308', '#8b5cf6', '#06b6d4'];

    abilities.forEach((ability, i) => {
        const data = report.abilities[ability];
        document.getElementById(`game-${ability}-score`).textContent = data.score + '分 ' + data.level.name;
        document.getElementById(`game-${ability}-score`).style.color = data.level.color;
        const bar = document.getElementById(`game-${ability}-bar`);
        bar.style.width = data.score + '%';
        bar.style.background = barColors[i];
    });

    // ROM详情
    document.getElementById('game-pitch-range').textContent = report.abilities.rom.pitchRange;
    document.getElementById('game-yaw-range').textContent = report.abilities.rom.yawRange;

    // 游戏数据
    document.getElementById('game-time').textContent = report.gameInfo.gameTime;
    document.getElementById('game-final-score').textContent = Math.round(report.gameInfo.finalScore);
    document.getElementById('game-dodged').textContent = report.gameInfo.obstaclesDodged;
    document.getElementById('game-nearmiss').textContent = report.gameInfo.nearMisses;

    // 总结
    document.getElementById('game-summary-text').textContent = report.overall.summary;

    // 建议
    const recList = document.getElementById('game-recommendations-list');
    recList.innerHTML = report.overall.recommendations.map(r => '• ' + r).join('<br>');

    // 绑定按钮事件
    document.getElementById('close-game-report').onclick = () => {
        modal.style.display = 'none';
        if (window.gameEngine) window.gameEngine.cleanup();
        setMode('mode-select');
    };

    document.getElementById('restart-game').onclick = () => {
        modal.style.display = 'none';
        if (window.gameEngine) {
            window.gameEngine.cleanup();
            window.gameUI.startGame();
        }
    };

    // 显示弹窗
    modal.style.display = 'flex';
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

    // 山谷飞行模式：同步陀螺仪数据到valleyEngine（漂移补偿已在updateFromGyroscope中全局处理）
    setInterval(() => {
        if (window.valleyEngine && window.valleyEngine.state === 'playing') {
            // state.pitch/yaw/roll 已经过全局EMA漂移补偿
            window.valleyEngine.setGyroInput(state.pitch, state.yaw, state.roll);
        }
        if (window.spaceEngine && window.spaceEngine.state === 'playing') {
            window.spaceEngine.setGyroInput(state.pitch, state.yaw, state.roll);
        }
    }, 16);

    // TTS切换按钮
    document.getElementById('tts-toggle').addEventListener('click', toggleTTS);

    // 模式按钮
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetMode = btn.dataset.mode;

            // 如果当前是游戏模式，切换前清理游戏状态
            if (state.mode === 'game' && targetMode !== 'game') {
                if (window.gameEngine) {
                    window.gameEngine.cleanup();
                }
            }

            // 游戏模式不受 isRunning 限制
            if (targetMode === 'game') {
                setMode(targetMode);
            } else if (!state.isRunning) {
                setMode(targetMode);
            }
        });
    });

    // 协调性检测模式按钮（单轨迹/全轨迹）
    document.querySelectorAll('.coord-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isRunning) return;
            state.coordMode = btn.dataset.mode;
            state.coordTrainingMode = false;
            updateCoordinationModeUI();
        });
    });

    // 训练模式切换按钮
    document.getElementById('coord-training-toggle').addEventListener('click', function() {
        if (state.isRunning) return;
        state.coordTrainingMode = !state.coordTrainingMode;
        if (state.coordTrainingMode) {
            this.style.background = 'var(--primary)';
            this.style.color = 'var(--bg-dark)';
            state.coordMode = 'single';
        } else {
            this.style.background = 'transparent';
            this.style.color = 'var(--text)';
        }
        updateCoordinationModeUI();
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

            // 垂直左右跳转 - 垂线在水平线端点，红点跳到垂线中点
            const hLineLength = crosshairSize / 2 - 15;
            if (state.trajectoryType === 'vertical_left') {
                state.targetX = -hLineLength;
                state.targetY = 0;
            } else if (state.trajectoryType === 'vertical_right') {
                state.targetX = hLineLength;
                state.targetY = 0;
            } else {
                state.targetX = 0;
                state.targetY = 0;
            }
        });
    });

    // 采集按钮
    document.getElementById('collect-btn').addEventListener('click', collectPoint);

    // 归零按钮
    document.getElementById('zero-btn').addEventListener('click', zeroPosition);
    document.getElementById('zero-btn-position').addEventListener('click', zeroPosition);
    document.getElementById('zero-btn-coord').addEventListener('click', zeroPosition);

    // 返回按钮
    document.getElementById('back-btn-integrated').addEventListener('click', () => {
        document.getElementById('result-modal').classList.remove('show');
        setMode('mode-select');
    });
    document.getElementById('back-btn-coordination').addEventListener('click', () => {
        document.getElementById('result-modal').classList.remove('show');
        setMode('mode-select');
    });
    document.getElementById('back-btn-rom').addEventListener('click', () => {
        document.getElementById('result-modal').classList.remove('show');
        setMode('mode-select');
    });
    document.getElementById('back-btn-position').addEventListener('click', () => {
        document.getElementById('result-modal').classList.remove('show');
        setMode('mode-select');
    });
    document.getElementById('back-btn-game').addEventListener('click', () => {
        // 清理游戏引擎状态
        if (window.gameEngine) {
            window.gameEngine.cleanup();
        }
        // 清理山谷飞行引擎状态
        if (window.valleyEngine) {
            window.valleyEngine.cleanup();
        }
        // 清理太空飞行引擎状态
        if (window.spaceEngine) {
            window.spaceEngine.cleanup();
        }
        // 隐藏游戏视图，回到主界面（模式选择）
        // game-select-panel的隐藏由setMode处理
        document.getElementById('view-game').style.display = 'none';
        // 显示模式选择视图
        setMode('mode-select');
    });

    // 位置觉检测开始按钮
    const startPosBtn = document.getElementById('start-position-btn');
    startPosBtn.addEventListener('click', () => {
        if (state.positionTrainingMode) {
            if (!state.positionTrainingStep) { alert('请先选择训练方向'); return; }
            if (state._posLocked) {
                state._posLocked = false;
                state.dotX = 0; state.dotY = 0;
                state.yaw = 0; state.pitch = 0;
                state.yawOffset = 0; state.pitchOffset = 0;
                if (window._resetGyroEMA) window._resetGyroEMA();
                updatePositionGuide();
                speak('已归零解锁，可重新训练');
            } else if (state.positionIsRunning === false && startPosBtn.textContent === '采集锁定') {
                // 闭眼采集→锁定光点→再提示睁眼
                state._posLocked = true;
                state._posLockedX = state.dotX;
                state._posLockedY = state.dotY;
                const dirBtns = document.querySelectorAll('.pos-dir-btn');
                const dirName = Array.from(dirBtns).find(b => b.dataset.dir === state.positionTrainingStep)?.textContent || '';
                state.positionResults.push({ name: dirName, totalError: 0 });
                speak('已采集，请睁眼，查看偏差');
                updatePositionGuide();
                showPositionResults();
            } else {
                // 方向提示已在选择方向时播报，直接开始执行
                state.positionIsRunning = true;
                executePositionStep();
            }
            return;
        }

        // 检测模式（原逻辑）
        if (state.positionStepIndex === 0) {
        } else if (state.positionStepIndex >= 1 && state.positionStepIndex <= 6) {
            if (state.positionIsRunning === true) {
                executePositionStep();
            } else if (state.positionIsRunning === false) {
                collectPositionPoint();
            } else if (state.positionIsRunning === 'waiting_for_zero') {
                zeroPosition();
            }
        } else {
            state.positionStepIndex = 0;
            state.positionResults = [];
            document.getElementById('position-results').innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">暂无结果</div>';
            updatePositionGuide();
        }
    });

    // 位置觉训练模式按钮
    const trainDirsPanel = document.getElementById('position-train-dirs');
    const trainDirBtns = document.querySelectorAll('.pos-dir-btn');
    let trainSelectedDir = null;

    trainDirBtns.forEach(b => {
        b.addEventListener('click', () => {
            trainDirBtns.forEach(x => { x.style.background = 'transparent'; x.style.color = 'var(--text)'; });
            b.style.background = 'var(--primary)'; b.style.color = 'var(--bg-dark)';
            trainSelectedDir = b.dataset.dir;
            // 设置训练方向
            state.positionTrainingStep = trainSelectedDir;
            state.positionStepIndex = 1; // 模拟已进入步骤1
            state._posLocked = false;
            updatePositionGuide();
            document.getElementById('start-position-btn').textContent = '>>> 开始执行 <<<';
            document.getElementById('start-position-btn').disabled = false;
            document.getElementById('position-instruction').textContent =
                '已选择: ' + b.textContent + '，请先归零';
            // 选择方向后播报该方向的操作提示
            speak('请闭眼，头向' + b.textContent + '转到最大范围');
        });
    });

    document.getElementById('start-position-train-btn').addEventListener('click', () => {
        if (state.isRunning) return;
        state.positionTrainingMode = !state.positionTrainingMode;
        const btn = document.getElementById('start-position-train-btn');
        if (state.positionTrainingMode) {
            btn.style.background = 'var(--primary)'; btn.textContent = '训练中';
            trainDirsPanel.style.display = 'block';
            trainSelectedDir = null;
            trainDirBtns.forEach(x => { x.style.background = 'transparent'; x.style.color = 'var(--text)'; });
            state.positionStepIndex = 0;
            state.positionResults = [];
            state.positionIsRunning = false;
            state._posLocked = false;
            state.positionTrainingStep = null;
            document.getElementById('position-results').innerHTML =
                '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:10px;">训练模式：选择方向→归零→闭眼执行</div>';
            updatePositionGuide();
        } else {
            btn.style.background = 'var(--secondary)'; btn.textContent = '训练模式';
            trainDirsPanel.style.display = 'none';
            state.positionTrainingMode = false;
            state.positionStepIndex = 0;
            state.positionResults = [];
            state.positionIsRunning = false;
            state._posLocked = false;
            state.positionTrainingStep = null;
            document.getElementById('position-results').innerHTML =
                '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:10px;">暂无结果</div>';
            updatePositionGuide();
        }
    });

    // 位置觉归零按钮
    const zeroBtnPos = document.getElementById('zero-btn-position');
    zeroBtnPos.addEventListener('click', () => {
        if (state.positionTrainingMode && state._posLocked) {
            state._posLocked = false;
            state.dotX = 0; state.dotY = 0;
            state.yaw = 0; state.pitch = 0;
            state.yawOffset = 0; state.pitchOffset = 0;
            if (window._resetGyroEMA) window._resetGyroEMA();
            if (state.positionStepIndex >= 6) {
                state.positionStepIndex = 0; state.positionResults = [];
                document.getElementById('position-results').innerHTML =
                    '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:10px;">训练模式：定位后锁定光点</div>';
            }
            updatePositionGuide();
            speak('已归零解锁');
            return;
        }
        zeroPosition();
    });

    // 缩放滑块（检测中禁止缩放）
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');
    if (zoomSlider) {
        zoomSlider.addEventListener('input', e => {
            if (state.isRunning) return;
            const newZoom = e.target.value / 100;
            const zoomRatio = newZoom / lastZoomFactor;
            state.targetX *= zoomRatio;
            state.targetY *= zoomRatio;
            state.zoomFactor = newZoom;
            if (zoomValue) zoomValue.textContent = e.target.value + '%';
            lastZoomFactor = newZoom;
            resizeCanvas();
        });
    }

    // 鼠标滚轮缩放（检测中禁止缩放）
    canvas.addEventListener('wheel', e => {
        if (state.isRunning) return;
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, state.zoomFactor + zoomDelta));
        const zoomRatio = newZoom / lastZoomFactor;
        state.targetX *= zoomRatio;
        state.targetY *= zoomRatio;
        state.zoomFactor = newZoom;
        if (zoomSlider) zoomSlider.value = newZoom * 100;
        if (zoomValue) zoomValue.textContent = Math.round(newZoom * 100) + '%';
        lastZoomFactor = newZoom;
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
        startDetection();
    });

    // 关闭弹窗
    function closeModal() {
        document.getElementById('result-modal').classList.remove('show');
    }
    window.closeModal = closeModal;
    document.getElementById('close-modal').addEventListener('click', closeModal);

    // 报告下拉菜单
    const reportBtn = document.getElementById('report-menu-btn');
    const reportDrop = document.getElementById('report-dropdown');
    reportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = reportDrop.style.display === 'block';
        reportDrop.style.display = isOpen ? 'none' : 'block';
        reportBtn.setAttribute('aria-expanded', !isOpen);
    });
    document.addEventListener('click', () => {
        reportDrop.style.display = 'none';
        reportBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            reportDrop.style.display = 'none';
            reportBtn.setAttribute('aria-expanded', 'false');
        }
    });
    function openReportItem(id, action) {
        document.getElementById(id).addEventListener('click', (e) => {
            e.stopPropagation();
            reportDrop.style.display = 'none';
            reportBtn.setAttribute('aria-expanded', 'false');
            action();
        });
        document.getElementById(id).addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                reportDrop.style.display = 'none';
                reportBtn.setAttribute('aria-expanded', 'false');
                action();
            }
        });
    }
    openReportItem('gen-report-item', showComprehensiveReport);
    openReportItem('records-item', showRecordsModal);

    // 综合报告按钮（模态框内）
    document.getElementById('comprehensive-btn').addEventListener('click', () => {
        showComprehensiveReport();
    });

    // 保存患者数据按钮
    document.getElementById('save-patient-btn').addEventListener('click', () => {
        promptSavePatient();
    });

    // 全屏切换
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    });
    // 游戏模式下全屏自动折叠侧边栏，检查模块保持展开
    document.addEventListener('fullscreenchange', () => {
        if (state.mode !== 'game') return; // 检查模块不折叠
        const sp = document.getElementById('side-panel');
        const stb = document.getElementById('sidebar-toggle');
        if (document.fullscreenElement) {
            sp.classList.add('collapsed');
            if (stb) { stb.textContent = '▶'; stb.style.display = 'block'; }
        } else {
            sp.classList.remove('collapsed');
            if (stb) stb.textContent = '◀';
        }
    });

    // 侧边栏折叠：检测/游戏模式下自动隐藏
    const sidePanel = document.getElementById('side-panel');
    const sidebarBtn = document.createElement('button');
    sidebarBtn.id = 'sidebar-toggle';
    sidebarBtn.textContent = '◀';
    sidebarBtn.title = '折叠侧边栏';
    sidePanel.appendChild(sidebarBtn);

    function setSidebarCollapsed(collapsed) {
        if (collapsed) {
            sidePanel.classList.add('collapsed');
            sidebarBtn.textContent = '▶';
            sidebarBtn.style.display = 'block';
        } else {
            sidePanel.classList.remove('collapsed');
            sidebarBtn.textContent = '◀';
            sidebarBtn.style.display = 'block';
        }
    }

    sidebarBtn.addEventListener('click', () => {
        const isCollapsed = sidePanel.classList.contains('collapsed');
        setSidebarCollapsed(!isCollapsed);
    });


    // 用户登录（点击名称切换客户）
    const loginModal = document.getElementById('login-modal');
    const patientInput = document.getElementById('patient-name-input');
    const patientLabel = document.getElementById('current-patient');

    // 读取已保存的患者信息
    try {
        const saved = JSON.parse(localStorage.getItem('cervical_current_client'));
        if (saved && saved.name) {
            state.clientInfo = saved;
            patientLabel.textContent = '👤 ' + saved.name + (saved.id ? ' #' + saved.id : '');
        } else {
            patientLabel.textContent = '👤 点击登录';
        }
    } catch(e) {
        patientLabel.textContent = '👤 点击登录';
    }

    patientLabel.addEventListener('click', () => {
        const info = state.clientInfo || {};
        patientInput.value = info.name || '';
        document.getElementById('patient-gender-input').value = info.gender || '';
        document.getElementById('patient-age-input').value = info.age || '';
        document.getElementById('patient-id-input').value = info.id || '';
        loginModal.classList.add('show');
        patientInput.focus();
    });

    document.getElementById('login-ok-btn').addEventListener('click', () => {
        const name = document.getElementById('patient-name-input').value.trim();
        if (!name) { alert('请输入姓名'); return; }
        const info = {
            name,
            gender: document.getElementById('patient-gender-input').value,
            age: document.getElementById('patient-age-input').value,
            id: document.getElementById('patient-id-input').value.trim(),
        };
        state.clientInfo = info;
        localStorage.setItem('cervical_current_client', JSON.stringify(info));
        patientLabel.textContent = '👤 ' + name + (info.id ? ' #' + info.id : '') +
            (info.gender ? ' ' + info.gender : '') + (info.age ? ' ' + info.age + '岁' : '');
        loginModal.classList.remove('show');
    });

    document.getElementById('login-cancel-btn').addEventListener('click', () => {
        loginModal.classList.remove('show');
    });
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) loginModal.classList.remove('show');
    });

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

    // 保存已配对的设备列表
    const PAIRED_DEVICES_KEY = 'gyro_paired_devices';

    // 获取已保存的设备
    function getPairedDevices() {
        try {
            const saved = localStorage.getItem(PAIRED_DEVICES_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    // 保存设备到列表
    function savePairedDevice(device) {
        const devices = getPairedDevices();
        // 移除同名的旧设备
        const filtered = devices.filter(d => d.name !== device.name);
        // 添加新设备到开头
        filtered.unshift({
            name: device.name,
            id: device.id
        });
        // 最多保存5个
        const trimmed = filtered.slice(0, 5);
        localStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(trimmed));
    }

    // 渲染已配对设备列表
    function renderPairedDevices() {
        const devices = getPairedDevices();
        if (devices.length === 0) return '';

        return devices.map((d, i) => `
            <div style="padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.1);" data-device-id="${d.id}">
                <div style="font-size: 12px; margin-bottom: 4px; display: flex; align-items: center;">
                    <span style="color: var(--primary); margin-right: 6px;">★</span>
                    ${d.name}
                </div>
                <div style="font-size: 10px; color: var(--text-muted);">点击直接连接</div>
            </div>
        `).join('');
    }

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
            // 显示已连接的设备
            gyroDeviceList.innerHTML = `
                <div style="padding: 8px;">
                    <div style="font-size: 12px; margin-bottom: 4px;">${bluetoothDevice.name || '未知设备'}</div>
                    <div style="font-size: 10px; color: var(--success);">已连接</div>
                </div>
            `;
        } else {
            gyroDisconnectBtn.style.display = 'none';
            gyroScanBtn.style.display = 'block';
            updateGyroStatus('未连接');
            // 显示已保存的设备列表
            gyroDeviceList.innerHTML = renderPairedDevices();

            // 为已保存的设备添加点击事件
            gyroDeviceList.querySelectorAll('[data-device-id]').forEach(item => {
                item.addEventListener('click', async () => {
                    const deviceId = item.dataset.deviceId;
                    await connectToSavedDevice(deviceId);
                });
                item.style.cursor = 'pointer';
            });
        }
    }

    function closeGyroModal() {
        gyroModal.classList.remove('show');
    }

    // 直接连接已保存的设备
    async function connectToSavedDevice(deviceId) {
        if (!navigator.bluetooth) {
            logGyroDebug('错误: 当前浏览器不支持Web Bluetooth API');
            return;
        }

        logGyroDebug(`正在连接已保存的设备...`);
        gyroDeviceList.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">正在连接...</div>';

        try {
            // 使用 acceptAllDevices 然后在返回的设备中找匹配的
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '0000ffe5-0000-1000-8000-00805f9a34fb',
                    '0000ffe0-0000-1000-8000-00805f9b34fb'
                ]
            });

            // 检查设备ID是否匹配
            if (device.id !== deviceId) {
                logGyroDebug(`设备不匹配，尝试连接...`);
            }

            bluetoothDevice = device;
            await connectGyroscope();
        } catch (err) {
            logGyroDebug(`连接失败: ${err.message}`);
            gyroDeviceList.innerHTML = '<div style="font-size: 11px; color: var(--danger); text-align: center; padding: 10px;">连接失败: ' + err.message + '</div>';
        }
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
            // 维特智能 WT9011DCL-BT50 专用服务UUID
            const defaultServices = [
                '0000ffe5-0000-1000-8000-00805f9a34fb', // 维特智能 BLE5.0 主服务
                '0000ffe0-0000-1000-8000-00805f9b34fb', // 维特智能 旧版兼容
            ];
            const optionalServices = serviceUuid
                ? [serviceUuid]
                : defaultServices;
            const options = {
                acceptAllDevices: true,
                optionalServices: optionalServices
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

    // WT9011DCL-BT50 专用 UUID 常量
    const WIT_SERVICE_UUID      = '0000ffe5-0000-1000-8000-00805f9a34fb';
    const WIT_NOTIFY_UUID       = '0000ffe4-0000-1000-8000-00805f9a34fb'; // 数据通知特征
    const WIT_WRITE_UUID        = '0000ffe9-0000-1000-8000-00805f9a34fb'; // 指令写入特征
    // 备用旧版 UUID（部分固件版本）
    const WIT_SERVICE_UUID_ALT  = '0000ffe0-0000-1000-8000-00805f9b34fb';
    const WIT_NOTIFY_UUID_ALT   = '0000ffe1-0000-1000-8000-00805f9b34fb';

    // 维特智能指令：开启欧拉角输出（寄存器0x02，值0x086）
    // Bit 3 (0x08) = 欧拉角，0x7E = 基础输出(时间+加速度+角速度+磁场+接口+气压)
    // 0x7E | 0x08 = 0x86 = 基础输出 + 欧拉角
    const CMD_ENABLE_EULER = new Uint8Array([0xFF, 0xAA, 0x02, 0x86, 0x00]);
    // 仅开启欧拉角输出（寄存器0x02，值0x08）
    const CMD_EULER_ONLY = new Uint8Array([0xFF, 0xAA, 0x02, 0x08, 0x00]);
    // 维特智能指令：读取欧拉角寄存器0x3D（寄存器0x27，值0x3D）
    const CMD_READ_ANGLE   = new Uint8Array([0xFF, 0xAA, 0x27, 0x3D, 0x00]);
    // 维特智能指令：设置安装方向为垂直（寄存器0x23，值0x01）
    const CMD_SET_VERTICAL  = new Uint8Array([0xFF, 0xAA, 0x23, 0x01, 0x00]);

    let gyroWriteCharacteristic = null;

    async function connectGyroscope() {
        if (!bluetoothDevice) return;

        updateGyroStatus('连接中...');
        gyroScanBtn.textContent = '连接中...';
        gyroScanBtn.disabled = true;
        gyroWriteCharacteristic = null;
        _reconnectAttempts = 0; // 重置重连计数

        try {
            logGyroDebug('正在连接GATT服务器...');
            gyroServer = await bluetoothDevice.gatt.connect();
            logGyroDebug('GATT连接成功');

            // 等待服务稳定
            await new Promise(resolve => setTimeout(resolve, 600));

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

            // 获取陀螺仪主服务（优先用户自定义 > 维特专用 > 旧版兼容）
            const customUuid = document.getElementById('gyro-service-uuid').value.trim();
            let gyroService = null;
            let notifyUuid = null;

            const tryGetService = async (svcUuid, notifyU) => {
                try {
                    const svc = await gyroServer.getPrimaryService(svcUuid);
                    logGyroDebug(`服务连接成功: ${svcUuid}`);
                    gyroService = svc;
                    notifyUuid = notifyU;
                    return true;
                } catch (e) {
                    logGyroDebug(`服务 ${svcUuid} 不可用`);
                    return false;
                }
            };

            if (customUuid) {
                await tryGetService(customUuid, null);
            } else {
                // 先试维特专用 UUID
                const ok = await tryGetService(WIT_SERVICE_UUID, WIT_NOTIFY_UUID);
                if (!ok) {
                    // 再试旧版兼容
                    await tryGetService(WIT_SERVICE_UUID_ALT, WIT_NOTIFY_UUID_ALT);
                }
            }

            if (!gyroService) {
                // 最后尝试枚举所有服务
                logGyroDebug('尝试枚举所有服务...');
                const services = await gyroServer.getPrimaryServices();
                logGyroDebug(`共发现 ${services.length} 个服务`);
                for (const svc of services) {
                    logGyroDebug(`服务: ${svc.uuid}`);
                    try {
                        const chars = await svc.getCharacteristics();
                        for (const c of chars) {
                            logGyroDebug(`  特征: ${c.uuid} (notify:${c.properties.notify} write:${c.properties.writeWithoutResponse || c.properties.write})`);
                        }
                        if (!gyroService) {
                            gyroService = svc;
                            notifyUuid = null;
                        }
                    } catch (e) {}
                }
            }

            if (!gyroService) throw new Error('未找到任何可用服务，请确认设备已开机并在范围内');

            // 获取所有特征值
            const chars = await gyroService.getCharacteristics();
            logGyroDebug(`找到 ${chars.length} 个特征值`);

            let notifyChar = null;
            let writeChar = null;

            for (const c of chars) {
                logGyroDebug(`  特征: ${c.uuid} (N:${c.properties.notify} W:${c.properties.write || c.properties.writeWithoutResponse})`);
                // 精确匹配维特通知特征
                if (notifyUuid && c.uuid === notifyUuid) {
                    notifyChar = c;
                } else if (!notifyUuid && (c.properties.notify || c.properties.indicate)) {
                    notifyChar = notifyChar || c;
                }
                // 匹配写入特征
                if (c.uuid === WIT_WRITE_UUID || (!gyroWriteCharacteristic && (c.properties.write || c.properties.writeWithoutResponse))) {
                    writeChar = c;
                }
            }

            if (!notifyChar) throw new Error('未找到数据通知特征，请确认设备型号');

            gyroCharacteristic = notifyChar;
            gyroWriteCharacteristic = writeChar;
            logGyroDebug(`通知特征: ${gyroCharacteristic.uuid}`);
            if (gyroWriteCharacteristic) logGyroDebug(`写入特征: ${gyroWriteCharacteristic.uuid}`);

            // 订阅数据通知
            await gyroCharacteristic.startNotifications();
            gyroCharacteristic.addEventListener('characteristicvaluechanged', handleGyroscopeData);
            logGyroDebug('数据通知已订阅');

            // 发送指令：开启角度数据输出
            if (gyroWriteCharacteristic) {
                try {
                    // 发送解锁指令
                    await gyroWriteCharacteristic.writeValue(new Uint8Array([0xFF, 0xAA, 0x69, 0x88, 0xB5]));
                    logGyroDebug('已发送解锁指令');
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // 设置输出内容：基础输出 + 欧拉角 (0x86)
                    await gyroWriteCharacteristic.writeValue(CMD_ENABLE_EULER);
                    logGyroDebug('已发送开启欧拉角输出指令(0x02+0x86)');
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // 读取欧拉角寄存器0x3D
                    await gyroWriteCharacteristic.writeValue(CMD_READ_ANGLE);
                    logGyroDebug('已发送读取角度寄存器指令(0x27+0x3D)');
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // 保存设置
                    await gyroWriteCharacteristic.writeValue(new Uint8Array([0xFF, 0xAA, 0x00, 0x00, 0x00]));
                    logGyroDebug('已发送保存设置指令');
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // 启动主动查询模式：每100ms读取一次欧拉角
                    startAnglePolling();

                } catch (e) {
                    logGyroDebug(`发送指令失败（不影响使用）: ${e.message}`);
                }
            } else {
                logGyroDebug('无写入特征，跳过初始化指令');
            }

            // 按模块映射范围计算角度系数
            const hLineLen = crosshairSize / 2 - 15;
            const vLineLen = ringRadius * 0.85;
            state.yawCoefficient = state.yawRange / hLineLen;
            state.pitchCoefficient = state.pitchRange / vLineLen;
            logGyroDebug(`角度系数: yaw=${state.yawCoefficient.toFixed(3)}(${state.yawRange}°) pitch=${state.pitchCoefficient.toFixed(3)}(${state.pitchRange}°)`);
            logGyroDebug(`画布尺寸: hLine=${hLineLen.toFixed(0)}px vLine=${vLineLen.toFixed(0)}px`);

            // 更新UI
            bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
            updateGyroStatus('已连接', bluetoothDevice.name || '未知设备');
            gyroDisconnectBtn.style.display = 'block';
            gyroScanBtn.style.display = 'none';
            logGyroDebug('✅ 连接完成，等待角度数据...');
            _reconnectAttempts = 0; // 重置重连计数

            // 保存设备到配对列表
            if (bluetoothDevice) {
                savePairedDevice(bluetoothDevice);
            }

            // 自动切换到陀螺仪模式
            if (!state.useGyroscope) {
                state.useGyroscope = true;
                toggleBtn.textContent = '陀螺仪模式';
                toggleBtn.style.background = 'var(--primary)';
                toggleBtn.style.color = 'var(--bg-dark)';
            }

        } catch (err) {
            logGyroDebug(`❌ 连接失败: ${err.message}`);
            updateGyroStatus('连接失败');
            gyroScanBtn.textContent = '扫描设备';
            gyroScanBtn.disabled = false;
        }
    }

    // WT9011DCL-BT50 数据帧解析
    // 帧格式（每包可能含多帧，每帧20字节）：
    //   [0]   0x55        帧头
    //   [1]   0x3D        角度帧标识
    //   [2-3] AngX(int16) Roll  侧屈，小端序，÷32768×180°
    //   [4-5] AngY(int16) Pitch 俯仰（点头），÷32768×180°
    //   [6-7] AngZ(int16) Yaw  偏航（转头），÷32768×180°
    //   [8-9] 温度（可忽略）
    //   ...
    // 其他帧类型（加速度0x51、角速度等）保留供调试

    // 用于合并跨包分片的缓冲区
    let _witBuf = new Uint8Array(0);
    let _frameCount = 0;  // 帧计数器
    let _eulerFrameCount = 0;  // 欧拉角帧计数
    let _lastMagFrameTime = 0;  // 上次收到磁力计帧的时间
    let _lastYaw = null; // Yaw展开追踪，跨±180°边界保持连续

    function handleGyroscopeData(event) {
        const incoming = new Uint8Array(event.target.value.buffer,
                                        event.target.value.byteOffset,
                                        event.target.value.byteLength);

        // 调试：每次收到数据都记录
        const hexArr = [];
        for (let j = 0; j < Math.min(incoming.length, 20); j++) {
            hexArr.push(incoming[j].toString(16).padStart(2, '0'));
        }
        logGyroDebug(`⬇ 收到${incoming.length}字节: [${hexArr.join(' ')}]`);

        // 合并到缓冲区
        const merged = new Uint8Array(_witBuf.length + incoming.length);
        merged.set(_witBuf);
        merged.set(incoming, _witBuf.length);
        _witBuf = merged;

        // 逐帧扫描（每帧20字节，帧头0x55）
        let i = 0;
        let parsedFrames = 0;
        while (i < _witBuf.length) {
            // 找帧头
            if (_witBuf[i] !== 0x55) { i++; continue; }
            // 不足一帧，留到下次
            if (i + 20 > _witBuf.length) break;

            const type = _witBuf[i + 1];
            const view = new DataView(_witBuf.buffer, _witBuf.byteOffset + i);

            // 0x3D 和 0x71 都可能是欧拉角帧（不同固件版本使用不同类型值）
            if (type === 0x3D || type === 0x71) {
                const angX = view.getInt16(8, true) / 32768 * 180; // Yaw   偏航/旋转
                const angY = view.getInt16(4, true) / 32768 * 180; // Pitch 俯仰/点头
                const angZ = view.getInt16(6, true) / 32768 * 180; // Roll  翻滚/侧屈

                // Yaw 360°边界修正：传感器范围-180~180，跨边界时展开连续值
                let rawYaw = -angX;
                if (_lastYaw !== null) {
                    let delta = rawYaw - _lastYaw;
                    if (delta > 180) delta -= 360;
                    if (delta < -180) delta += 360;
                    rawYaw = _lastYaw + delta;
                }
                window.updateFromGyroscope({ pitch: -angY, yaw: rawYaw, roll: angZ });
                _lastYaw = rawYaw;
                _frameCount++;
                _eulerFrameCount++;
                if (_frameCount <= 50 || _frameCount % 10 === 0) {
                    logGyroDebug(`📐 角度帧#${_frameCount} (type=0x${type.toString(16)}): Pitch=${angY.toFixed(1)}° Yaw=${angZ.toFixed(1)}° Roll=${angX.toFixed(1)}° → dotX=${state.dotX.toFixed(0)} dotY=${state.dotY.toFixed(0)}`);
                }
                parsedFrames++;
            } else if (type === 0x61) {
                // 0x61 是磁力计帧（跳过不处理）
                const hx = view.getInt16(2, true);
                const hy = view.getInt16(4, true);
                const hz = view.getInt16(6, true);
                _lastMagFrameTime = Date.now();
                if (_eulerFrameCount === 0 && _frameCount < 10) {
                    logGyroDebug(`  磁力计帧 type=0x61: HX=${hx} HY=${hy} HZ=${hz}`);
                }
                // 如果前20帧都没有欧拉角，自动尝试切换到欧拉角输出模式
                // _eulerFrameCount < 1 表示尚未收到任何欧拉角（-1表示切换失败后不再重试）
                if (_frameCount >= 20 && _eulerFrameCount < 1 && gyroWriteCharacteristic) {
                    logGyroDebug('⚠️ 20帧内未收到欧拉角帧，尝试切换到欧拉角输出模式...');
                    gyroWriteCharacteristic.writeValue(new Uint8Array([0xFF, 0xAA, 0x69, 0x88, 0xB5])).then(() => {
                        setTimeout(() => {
                            gyroWriteCharacteristic.writeValue(CMD_EULER_ONLY);
                            logGyroDebug('已发送仅欧拉角输出指令(0x02+0x08)');
                        }, 100);
                    }).catch(() => {});
                    _eulerFrameCount = -1; // 只尝试一次
                }
            } else {
                // 其他未知帧类型
                if (_frameCount < 5) {
                    logGyroDebug(`  跳过帧 type=0x${type.toString(16)}（非角度帧）`);
                }
            }

            i += 20; // 每帧固定20字节
        }

        if (parsedFrames === 0 && _frameCount < 3 && incoming.length > 0) {
            logGyroDebug(`⚠️ 未收到欧拉角帧(0x55+0x3D/0x71)，只收到磁力计帧(0x61)或无有效数据`);
        }

        // 保留未处理的尾部数据
        _witBuf = _witBuf.slice(i);
    }

    // 停止角度查询
    function stopAnglePolling() {
        if (_anglePollingTimer) {
            clearInterval(_anglePollingTimer);
            _anglePollingTimer = null;
            logGyroDebug('已停止角度查询');
        }
    }

    // 启动主动查询模式：每100ms读取一次欧拉角
    let _anglePollingTimer = null;
    function startAnglePolling() {
        stopAnglePolling();
        logGyroDebug('启动角度查询模式 (100ms周期)');
        _anglePollingTimer = setInterval(async () => {
            if (!gyroWriteCharacteristic || !bluetoothDevice?.gatt?.connected) {
                stopAnglePolling();
                return;
            }
            try {
                await gyroWriteCharacteristic.writeValue(CMD_READ_ANGLE);
            } catch (e) {
                // 忽略写入错误
            }
        }, 100);
    }

    let _reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    function onDisconnected() {
        logGyroDebug('设备断开连接');
        updateGyroStatus('未连接');
        gyroDisconnectBtn.style.display = 'none';
        gyroScanBtn.style.display = 'block';
        gyroScanBtn.textContent = '扫描设备';
        gyroScanBtn.disabled = false;
        gyroCharacteristic = null;
        gyroServer = null;
        // 停止角度查询
        stopAnglePolling();
        // 重置帧计数
        _witBuf = new Uint8Array(0);
        _frameCount = 0;
        _eulerFrameCount = 0;
        _lastMagFrameTime = 0;

        // 自动重连并重新配置
        if (_reconnectAttempts < MAX_RECONNECT_ATTEMPTS && bluetoothDevice) {
            _reconnectAttempts++;
            logGyroDebug(`自动重连尝试 ${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
            setTimeout(() => {
                if (bluetoothDevice && !bluetoothDevice.gatt.connected) {
                    connectGyroscope();
                }
            }, 1000);
        } else {
            _reconnectAttempts = 0;
        }
    }

    // 断开连接
    gyroDisconnectBtn.addEventListener('click', () => {
        if (gyroCharacteristic && gyroCharacteristic.service.device.gatt.connected) {
            gyroCharacteristic.service.device.gatt.disconnect();
        }
        onDisconnected();
    });
}

window.updatePositionGuide = updatePositionGuide;
window.updateROMGuide = updateROMGuide;

export { init, updatePositionGuide };
