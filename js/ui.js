// ============================================================
// UI - 界面更新
// ============================================================

import { state } from './state.js';
import { CONFIG } from './config.js';

// JPS 分类函数
function classifyJPS(error) {
    if (error < 2) return { level: '优秀', zh: '优秀', color: '#22c55e' };
    if (error < 3) return { level: '良好', zh: '良好', color: '#84cc16' };
    if (error < 4.5) return { level: '正常', zh: '正常', color: '#06b6d4' };
    if (error < 6) return { level: '轻度障碍', zh: '轻度', color: '#eab308' };
    if (error < 9) return { level: '中度障碍', zh: '中度', color: '#f97316' };
    return { level: '重度障碍', zh: '重度', color: '#ef4444' };
}

function updateDataDisplay() {
    // 陀螺仪模式 offset 已在 updateFromGyroscope 中减过，不重复减
    const displayPitch = state.useGyroscope ? state.pitch : state.pitch - state.pitchOffset;
    const displayYaw = state.useGyroscope ? state.yaw : state.yaw - state.yawOffset;
    const displayRoll = state.useGyroscope ? state.roll : state.roll - state.rollOffset;
    document.getElementById('pitch-value').textContent = displayPitch.toFixed(1) + '°';
    document.getElementById('yaw-value').textContent = displayYaw.toFixed(1) + '°';
    document.getElementById('roll-value').textContent = displayRoll.toFixed(1) + '°';
    state.error = Math.sqrt(state.yaw ** 2 + state.pitch ** 2);
    document.getElementById('error-value').textContent = state.error.toFixed(1) + '°';
    document.getElementById('dot-x').textContent = Math.round(state.dotX);
    document.getElementById('dot-y').textContent = Math.round(state.dotY);
}

function zeroPosition() {
    if (state.useGyroscope) {
        state.pitchOffset = state.pitch + state.pitchOffset;
        state.yawOffset = state.yaw + state.yawOffset;
        state.rollOffset = state.roll + state.rollOffset;
        state.pitch = 0;
        state.yaw = 0;
        state.roll = 0;
        state.dotX = 0;
        state.dotY = 0;
        state.displayDotX = 0;
        state.displayDotY = 0;
    } else {
        // 鼠标模式：state.pitch 不含 offset，display = state.pitch - pitchOffset
        state.pitchOffset = state.pitch;
        state.yawOffset = state.yaw;
        state.rollOffset = state.roll;
    }

    // ROM检测模式：romStepIndex=0未开始, 1-6进行中, 7完成
    // 只有采集后才能归零进入下一步
    if (state.mode === 'rom') {
        if (state.romStepIndex === 0) {
            // 第一次归零：开始检测
            state.romStepIndex = 1;
            state.romIsWaitingForZero = false;
            window.updateROMGuide();
        } else if (state.romStepIndex >= 1 && state.romStepIndex <= 6 && state.romIsWaitingForZero === false) {
            // 已开始但还未采集就归零：忽略
        } else if (state.romStepIndex >= 1 && state.romStepIndex <= 6 && state.romIsWaitingForZero) {
            // 已采集，现在归零进入下一步
            const wasWaiting = state.romIsWaitingForZero;
            state.romIsWaitingForZero = false;
            if (state.romStepIndex >= 7) {
                state.romStepIndex = 7;
            } else {
                state.romStepIndex++;
            }
            window.updateROMGuide();
        }
    }

    // 位置觉检测模式
    if (state.mode === 'position') {
        if (state.positionStepIndex === 0) {
            // 第一次归零：归零后的位置就是基准0°
            state.positionInitialPitch = 0;
            state.positionInitialYaw = 0;
            state.positionInitialRoll = 0;
            state.positionStepIndex = 1;
            state.positionIsRunning = true;
            window.updatePositionGuide();
        } else if (state.positionStepIndex > 0 && state.positionIsRunning === 'waiting_for_zero') {
            // 采集后的归零：归零后的位置就是新的基准0°
            state.positionInitialPitch = 0;
            state.positionInitialYaw = 0;
            state.positionInitialRoll = 0;
            state.positionIsRunning = true;
            window.updatePositionGuide();
        }
    }
}

function collectPoint() {
    // ROM检测完成时，显示结果
    if (state.mode === 'rom' && state.romStepIndex > 6) {
        showROMResults();
        return;
    }

    // ROM检测时，如果还未开始（romStepIndex=0），提示先归零
    if (state.mode === 'rom' && state.romStepIndex === 0) {
        alert('请先点击"归零"按钮开始检测');
        return;
    }

    // ROM检测时，如果已采集等待归零，不处理
    if (state.mode === 'rom' && state.romIsWaitingForZero) {
        return;
    }

    // 陀螺仪模式 offset 已在 updateFromGyroscope 中减过
    const dispPitch = state.useGyroscope ? state.pitch : state.pitch - state.pitchOffset;
    const dispYaw = state.useGyroscope ? state.yaw : state.yaw - state.yawOffset;
    const dispRoll = state.useGyroscope ? state.roll : state.roll - state.rollOffset;
    const point = {
        id: Date.now(),
        dotX: state.dotX,
        dotY: state.dotY,
        pitch: dispPitch,
        yaw: dispYaw,
        roll: dispRoll,
        timestamp: new Date().toLocaleTimeString()
    };
    state.collectedPoints.push(point);

    // ROM检测模式：采集后等待归零进入下一步
    if (state.mode === 'rom' && state.romStepIndex >= 1 && state.romStepIndex <= 6) {
        const step = CONFIG.ROM_STEPS[state.romStepIndex - 1];
        state.romResults[step.name] = point[step.axis];
        state.romIsWaitingForZero = true;
        // updateROMGuide中已有TTS播报"请归零进入下一步"
        window.updateROMGuide();
    }

    // 在romResults设置后再更新显示
    if (state.mode === 'rom') {
        showROMInlineResults();
    }
}

function showROMInlineResults() {
    const resultsDiv = document.getElementById('rom-results');
    const countDiv = document.getElementById('rom-collect-count');

    if (Object.keys(state.romResults).length === 0) {
        resultsDiv.innerHTML = `
            <div id="rom-collect-count" style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">已采集 0/6</div>
            <div style="font-size: 10px; color: var(--text-muted);">暂无结果</div>
        `;
        return;
    }

    let html = `<div id="rom-collect-count" style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">已采集 ${Object.keys(state.romResults).length}/6</div>`;
    for (let i = 0; i < CONFIG.ROM_STEPS.length; i++) {
        const step = CONFIG.ROM_STEPS[i];
        const value = state.romResults[step.name];
        if (value !== undefined) {
            const absValue = Math.abs(value);
            const percentage = Math.min(100, (absValue / step.normal) * 100);
            const status = absValue >= step.normal * 0.8 ? '正常' : absValue >= step.normal * 0.5 ? '轻度' : '受限';
            const color = absValue >= step.normal * 0.8 ? 'var(--success)' : absValue >= step.normal * 0.5 ? 'var(--warning)' : 'var(--danger)';
            html += `
                <div style="padding: 2px 0;">
                    <span style="font-size: 10px;">${step.name}:</span>
                    <span style="font-size: 10px; color: ${color};">${value.toFixed(1)}° ${status}</span>
                </div>
            `;
        }
    }

    resultsDiv.innerHTML = html;
}

function showROMResults() {
    const results = [];
    for (let i = 0; i < CONFIG.ROM_STEPS.length; i++) {
        const step = CONFIG.ROM_STEPS[i];
        const value = state.romResults[step.name];
        const absValue = Math.abs(value);
        const percentage = Math.min(100, (absValue / step.normal) * 100);
        const status = absValue >= step.normal * 0.8 ? '正常' : absValue >= step.normal * 0.5 ? '轻度受限' : '明显受限';
        results.push({
            name: step.name,
            value: value.toFixed(1),
            normal: step.normal,
            percentage: percentage.toFixed(0),
            status: status
        });
    }

    let html = '<div style="max-height: 300px; overflow-y: auto;">';
    results.forEach(r => {
        const color = r.status === '正常' ? 'var(--success)' : r.status === '轻度受限' ? 'var(--warning)' : 'var(--danger)';
        html += `
            <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 12px; font-weight: 600;">${r.name}</span>
                    <span style="font-size: 12px; color: ${color}; font-weight: 600;">${r.status}</span>
                </div>
                <div style="font-size: 18px; font-family: Consolas, monospace; margin-bottom: 4px;">
                    ${r.value}° <span style="font-size: 10px; color: var(--text-muted);">/ 正常${r.normal}°</span>
                </div>
                <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${r.percentage}%; background: ${color}; border-radius: 2px;"></div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    document.getElementById('result-position').parentElement.innerHTML = html;
    document.getElementById('close-modal').textContent = '重新检测';
    document.getElementById('result-position').textContent = 'ROM';
    document.getElementById('close-modal').onclick = () => {
        closeModal();
        state.romStepIndex = 0;
        state.romResults = {};
        state.romIsWaitingForZero = false;
        state.collectedPoints = [];
        showROMInlineResults();
        window.updateROMGuide();
        document.getElementById('close-modal').textContent = '确定';
        document.getElementById('close-modal').onclick = closeModal;
    };
    document.getElementById('result-modal').classList.add('show');
}

function deleteCollectedPoint(id) {
    state.collectedPoints = state.collectedPoints.filter(p => p.id !== id);
    renderCollectedPoints();
}

function renderCollectedPoints() {
    const list = document.getElementById('collected-list');
    if (!list) return;
    if (state.collectedPoints.length === 0) {
        list.innerHTML = '<div style="font-size: 10px; color: var(--text-muted); text-align: center; padding: 8px;">暂无采集点</div>';
        return;
    }
    list.innerHTML = state.collectedPoints.map((p, i) => `
        <div class="collected-item">
            <span class="label">点${i + 1}</span>
            <span class="value">P:${p.pitch.toFixed(0)}° Y:${p.yaw.toFixed(0)}° R:${p.roll.toFixed(0)}°</span>
            <button class="delete-btn" onclick="deleteCollectedPoint(${p.id})">×</button>
        </div>
    `).join('');
}

function updateProgress() {
    const progressRing = document.getElementById('progress-ring-fill');
    const progressText = document.getElementById('progress-text');
    if (!progressRing || !progressText) return;
    const circumference = 2 * Math.PI * 35;
    const offset = circumference - state.progress * circumference;
    progressRing.style.strokeDashoffset = offset;
    progressText.textContent = Math.round(state.progress * 100) + '%';

    progressRing.classList.remove('warning', 'success');
    if (state.progress >= 1) {
        progressRing.classList.add('success');
    } else if (state.progress >= 0.5) {
        progressRing.classList.add('warning');
        // 中途提示（只在50%时播报一次）
        if (window.TTS_CONFIG.enabled && state.lastAnnouncedProgress < 0.5) {
            if (state.mode === 'integrated' || state.mode === 'coordination') {
                window.speak('继续跟踪');
            }
        }
    }

    // 记录已播报的进度
    if (state.progress >= 0.5 && state.lastAnnouncedProgress < 0.5) {
        state.lastAnnouncedProgress = 0.5;
    }
    if (state.progress >= 1 && state.lastAnnouncedProgress < 1) {
        state.lastAnnouncedProgress = 1;
    }
}

// ============================================================
// 结果计算辅助函数
// ============================================================

/**
 * 计算数组平均值
 */
function avg(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * 获取颜色类名
 */
function getScoreColorClass(score) {
    return score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
}

/**
 * 获取评级文字
 */
function getScoreLevelText(score) {
    return score >= 80 ? '良好' : score >= 60 ? '一般' : '需关注';
}

/**
 * 构建协调性详细数据 HTML
 */
function buildCoordinationDetails(tracking, trajectory, smoothness) {
    return `
        <div style="margin-bottom: 6px;">
            <span style="color: var(--text-muted);">跟踪得分:</span>
            <span style="color: var(--primary);">${Math.round(tracking)}分</span>
            <span style="color: var(--text-muted); font-size: 9px;">(误差越小越好)</span>
        </div>
        <div style="margin-bottom: 6px;">
            <span style="color: var(--text-muted);">轨迹得分:</span>
            <span style="color: var(--secondary);">${Math.round(trajectory)}分</span>
            <span style="color: var(--text-muted); font-size: 9px;">(偏离轨迹越少越好)</span>
        </div>
        <div style="margin-bottom: 6px;">
            <span style="color: var(--text-muted);">平稳得分:</span>
            <span style="color: var(--warning);">${Math.round(smoothness)}分</span>
            <span style="color: var(--text-muted); font-size: 9px;">(运动越匀速越好)</span>
        </div>
    `;
}

/**
 * 构建 ROM 详细数据 HTML
 */
function buildROMDetails() {
    let html = '<div style="font-size: 10px;">';
    for (const step of CONFIG.ROM_STEPS) {
        const value = state.romResults[step.name];
        if (value !== undefined) {
            const absValue = Math.abs(value);
            const status = absValue >= step.normal * 0.8 ? '正常' : absValue >= step.normal * 0.5 ? '轻度受限' : '明显受限';
            const color = getScoreColorClass((absValue / step.normal) * 100);
            html += `<div style="margin-bottom: 4px;">
                <span>${step.name}:</span>
                <span style="color: ${color};">${value.toFixed(1)}° ${status}</span>
                <span style="color: var(--text-muted);">(正常${step.normal}°)</span>
            </div>`;
        }
    }
    return html + '</div>';
}

/**
 * 构建位置觉详细数据 HTML
 */
function buildPositionDetails() {
    let html = '<div style="font-size: 10px;">';
    state.positionResults.forEach(r => {
        const cls = classifyJPS(r.totalError);
        html += `<div style="margin-bottom: 4px;">
            <span>${r.name}:</span>
            <span style="color: ${cls.color};">${r.totalError.toFixed(1)}° (${cls.level})</span>
        </div>`;
    });
    const avgError = avg(state.positionResults.map(r => r.totalError));
    const overallCls = classifyJPS(avgError);
    return html + `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1);">
        <span>平均误差:</span>
        <span style="color: ${overallCls.color}; font-weight: 600;">${avgError.toFixed(1)}° (${overallCls.level})</span>
    </div></div>`;
}

/**
 * 更新评分显示条
 */
function updateScoreBars(position, stability, rom, coordination) {
    const overall = Math.round((position + stability + rom + coordination) / 4);

    const overallScore = document.getElementById('overall-score');
    const overallLevel = document.getElementById('overall-level');
    overallScore.textContent = overall;
    overallScore.style.color = getScoreColorClass(overall);
    overallLevel.textContent = getScoreLevelText(overall);
    overallLevel.style.color = getScoreColorClass(overall);

    document.getElementById('result-position').textContent = Math.round(position);
    document.getElementById('bar-position').style.width = position + '%';
    document.getElementById('result-stability').textContent = Math.round(stability);
    document.getElementById('bar-stability').style.width = stability + '%';
    document.getElementById('result-rom').textContent = Math.round(rom);
    document.getElementById('bar-rom').style.width = rom + '%';
    document.getElementById('result-coordination').textContent = Math.round(coordination);
    document.getElementById('bar-coordination').style.width = coordination + '%';
}

/**
 * 显示前庭评估结果
 */
function showVestibularResult(coordinationScore) {
    let vestibularAssessment;

    if (state.mode === 'integrated') {
        vestibularAssessment = getVestibularAssessmentFromIntegrated();
    } else if (state.mode === 'coordination') {
        vestibularAssessment = evaluateVestibularFunction({
            jpsAvgError: 0,
            coordinationScore: coordinationScore,
            stabilityScore: 0
        });
    } else if (state.mode === 'position') {
        const avgJpsError = avg(state.positionResults.map(r => r.totalError));
        vestibularAssessment = evaluateVestibularFunction({
            jpsAvgError: avgJpsError,
            coordinationScore: 0,
            stabilityScore: 0
        });
    }

    const vestibularDiv = document.getElementById('vestibular-assessment');
    if (vestibularAssessment) {
        vestibularDiv.style.display = 'block';
        document.getElementById('vestibular-result').textContent = vestibularAssessment.assessment;
        document.getElementById('vestibular-result').style.color = vestibularAssessment.color;
        document.getElementById('vestibular-recommendation').textContent = vestibularAssessment.recommendation;
    } else {
        vestibularDiv.style.display = 'none';
    }
}

/**
 * 显示康复建议
 */
function showRehabSuggestions(suggestions) {
    const rehabDiv = document.getElementById('rehab-suggestions');
    if (suggestions.length > 0) {
        rehabDiv.style.display = 'block';
        document.getElementById('rehab-suggestions-content').innerHTML =
            suggestions.map(s => `<div style="margin-bottom: 4px;">• ${s}</div>`).join('');
    } else {
        rehabDiv.style.display = 'none';
    }
}

function showResults() {
    let positionScore, stabilityScore, romScore, coordinationScore;
    let detailsHtml = '';
    let suggestions = [];

    if (state.mode === 'integrated') {
        positionScore = state.integratedResults.positionScore;
        stabilityScore = state.integratedResults.stabilityScore;
        romScore = state.integratedResults.romScore;
        coordinationScore = 0;
    } else if (state.mode === 'coordination') {
        const scores = state.coordScores;
        if (scores && scores.tracking && scores.tracking.length > 0) {
            const avgTracking = avg(scores.tracking);
            const avgTrajectory = avg(scores.trajectory);
            const avgSmoothness = avg(scores.smoothness);
            coordinationScore = avgTracking * 0.4 + avgTrajectory * 0.3 + avgSmoothness * 0.3;
            detailsHtml = buildCoordinationDetails(avgTracking, avgTrajectory, avgSmoothness);

            if (avgTracking < 60) suggestions.push('加强头部追踪训练，可使用激光笔引导');
            if (avgTrajectory < 60) suggestions.push('建议进行平衡板训练，提升运动控制');
            if (avgSmoothness < 60) suggestions.push('需要进行颈部柔韧性训练，减少运动顿挫');
        }
        if (!coordinationScore && state.results && state.results.coordination) {
            coordinationScore = state.results.coordination;
        }
        coordinationScore = coordinationScore || 50;
        positionScore = 0;
        stabilityScore = 0;
        romScore = 0;
    } else if (state.mode === 'rom' && state.romResults && Object.keys(state.romResults).length > 0) {
        detailsHtml = buildROMDetails();

        const romValues = Object.values(state.romResults).map(v => Math.abs(v));
        const romAvg = avg(romValues);
        romScore = Math.min(100, (romAvg / 45) * 100);
        if (romAvg < 35) suggestions.push('颈椎活动度明显受限，建议进行牵引治疗');
        else if (romAvg < 45) suggestions.push('活动度轻度受限，建议每日进行颈部伸展练习');
        else suggestions.push('活动度基本正常，建议保持规律颈部运动');

        positionScore = 0;
        stabilityScore = 0;
        coordinationScore = 0;
    } else if (state.mode === 'position' && state.positionResults && state.positionResults.length > 0) {
        detailsHtml = buildPositionDetails();

        const avgJpsError = avg(state.positionResults.map(r => r.totalError));
        if (avgJpsError >= 6) suggestions.push('本体感觉明显减退，建议进行哑铃负重颈部训练');
        else if (avgJpsError >= 4.5) suggestions.push('本体感觉轻度障碍，建议进行眼球追踪训练');
        else suggestions.push('本体感觉正常，建议保持当前训练强度');

        positionScore = Math.max(0, 100 - avgJpsError * 10);
        stabilityScore = 0;
        romScore = 0;
        coordinationScore = 0;
    } else {
        positionScore = state.results.position;
        stabilityScore = state.results.stability;
        romScore = state.results.rom;
        coordinationScore = 0;
    }

    updateScoreBars(positionScore, stabilityScore, romScore, coordinationScore);

    // 显示详细数据
    const detailsDiv = document.getElementById('report-details');
    const detailsContent = document.getElementById('report-details-content');
    if (detailsHtml) {
        detailsDiv.style.display = 'block';
        detailsContent.innerHTML = detailsHtml;
    } else {
        detailsDiv.style.display = 'none';
    }

    showVestibularResult(coordinationScore);

    // 显示康复建议
    showRehabSuggestions(suggestions);

    // 显示图表
    const chartsDiv = document.getElementById('report-charts');
    const radarCanvas = document.getElementById('radar-chart');
    const romCanvas = document.getElementById('rom-chart');

    const hasScores = positionScore > 0 || stabilityScore > 0 || romScore > 0 || coordinationScore > 0;
    const hasROM = state.mode === 'rom' && state.romResults && Object.keys(state.romResults).length > 0;

    if (hasScores || hasROM) {
        chartsDiv.style.display = 'block';
        if (hasScores) {
            radarCanvas.style.display = 'block';
            drawRadarChart(radarCanvas, { position: positionScore, stability: stabilityScore, rom: romScore, coordination: coordinationScore }, 200);
        }
        if (hasROM) {
            romCanvas.style.display = 'block';
            drawROMChart(romCanvas, state.romResults, 280, 100);
        }
    } else {
        chartsDiv.style.display = 'none';
        radarCanvas.style.display = 'none';
        romCanvas.style.display = 'none';
    }

    // 语音播报结果
    if (window.TTS_CONFIG.enabled) {
        if (state.mode === 'integrated') {
            window.speakResultsIntegrated({ position: positionScore, stability: stabilityScore, rom: romScore, coordination: coordinationScore });
        } else if (state.mode === 'coordination') {
            window.speakResultsCoordination(coordinationScore);
        } else if (state.mode === 'rom') {
            window.speakResultsROM(state.romResults);
        } else if (state.mode === 'position') {
            window.speakResultsPosition(state.positionResults);
        }
    }

    document.getElementById('result-modal').classList.add('show');
}

export { renderCollectedPoints, updateDataDisplay, updateProgress, zeroPosition, collectPoint, showROMResults, showROMInlineResults };
