// ============================================================
// UI - 界面更新
// ============================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { ROM_RULES, POSITION_RULES, COORDINATION_RULES, BALANCE_RULES, BRAIN_INFERENCE, REHAB_GENERATOR, calculateScores } from './assessment/anrm-knowledge.js';
import { evaluateVestibularFunction, getVestibularAssessmentFromIntegrated } from './detection.js';

// JPS 分类函数
function classifyJPS(error) {
    if (error < 2) return { level: '优秀', zh: '优秀', color: '#22c55e', clinical: '本体感觉正常，脑能准确定位头部位置，视觉依赖≈0%', anrmStage: 0 };
    if (error < 3) return { level: '良好', zh: '良好', color: '#84cc16', clinical: '轻微减退，视觉代偿启动，闭眼时脑开始调用视觉记忆填补', anrmStage: 1 };
    if (error < 4.5) return { level: '轻度障碍', zh: '轻度', color: '#06b6d4', clinical: '中度减退，脑已释放保护性紧张信号(ANRM神经源性级联第3步)', anrmStage: 2 };
    if (error < 6) return { level: '中度障碍', zh: '中度', color: '#eab308', clinical: '明显障碍，三叉-颈髓会聚区过度激活，非受伤肌肉持续紧张', anrmStage: 3 };
    if (error < 9) return { level: '重度障碍', zh: '重度', color: '#f97316', clinical: '严重障碍，颈部位置完全依赖视觉输入', anrmStage: 4 };
    return { level: '极重度障碍', zh: '极重度', color: '#ef4444', clinical: '慢性疼痛环路已形成，建议先做神经脱敏再评估(ANRM第1步)', anrmStage: 5 };
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
    const dotX = document.getElementById('dot-x');
    const dotY = document.getElementById('dot-y');
    if (dotX) dotX.textContent = Math.round(state.dotX);
    if (dotY) dotY.textContent = Math.round(state.dotY);
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
        if (window._resetZAngle) window._resetZAngle();
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
            <div style="background: rgba(0,0,0,0.03); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 12px; font-weight: 600;">${r.name}</span>
                    <span style="font-size: 12px; color: ${color}; font-weight: 600;">${r.status}</span>
                </div>
                <div style="font-size: 18px; font-family: Consolas, monospace; margin-bottom: 4px;">
                    ${r.value}° <span style="font-size: 10px; color: var(--text-muted);">/ 正常${r.normal}°</span>
                </div>
                <div style="height: 4px; background: rgba(0,0,0,0.1); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${r.percentage}%; background: ${color}; border-radius: 2px;"></div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    // 仅在 inline 区域显示结果，不弹模态框
    document.getElementById('rom-results').innerHTML = html;
    // 自动保存到 state（数据不丢，报告按钮可用）
    if (state.clientInfo && state.clientInfo.name) {
        const report = generateComprehensiveReport();
        if (report.available.length > 0) savePatientData(state.clientInfo, report);
    }
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
    return html + `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.1);">
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



    // 单项检测不弹模态框——报告需等全部三项做完后点击"生成报告"
    // document.getElementById('result-modal').classList.add('show');
}

// ============================================================
// 综合评估报告系统
// ============================================================

/**
 * 收集所有检测数据，通过 ANRM 知识引擎生成综合报告
 * 报告逻辑非硬编码——所有推断基于 ANRM 902/903/908/脑优化体系
 */
function generateComprehensiveReport() {
    const report = { available: [], scores: {}, details: {}, findings: [] };

    // 位置觉 → ANRM 评估
    if (state.positionResults && state.positionResults.length > 0) {
        const avgError = state.positionResults.reduce((s, r) => s + r.totalError, 0) / state.positionResults.length;
        report.available.push('position');
        report.details.position = { avgError: avgError.toFixed(1), results: [...state.positionResults] };
        report.findings.push(...POSITION_RULES.evaluate(state.positionResults));
    }

    // ROM → ANRM 评估
    if (state.romResults && Object.keys(state.romResults).length > 0) {
        report.available.push('rom');
        report.details.rom = { angles: {...state.romResults}, count: Object.keys(state.romResults).length };
        report.findings.push(...ROM_RULES.evaluate(state.romResults));
    }

    // 协调性 → ANRM 评估
    // 优先用当前帧级评分数据(coordScores)，若已被清空则用持久化结果(result)
    let mq = null;
    const hasLiveScores = state.coordScores && state.coordScores.tracking && state.coordScores.tracking.length > 0;
    const hasResult = state.results && state.results.coordination > 0;
    if (hasLiveScores) {
        report.available.push('coordination');
        report.available.push('stability');
        const coordResult = COORDINATION_RULES.evaluate(state.coordScores, state.coordFullScores);
        report.findings.push(...coordResult.findings);
        mq = coordResult.mq;
        const scores = state.coordScores;
        const avgTracking = scores.tracking.reduce((a, b) => a + b, 0) / scores.tracking.length;
        const avgTrajectory = scores.trajectory.reduce((a, b) => a + b, 0) / scores.trajectory.length;
        const avgSmoothness = scores.smoothness.reduce((a, b) => a + b, 0) / scores.smoothness.length;
        report.details.coordination = { tracking: avgTracking.toFixed(2) };
        report.details.stability = { trajectory: avgTrajectory.toFixed(2), smoothness: avgSmoothness.toFixed(2), mqClass: mq.class, mqInterpretation: mq.interpretation };
    } else if (hasResult) {
        report.available.push('coordination');
        report.details.coordination = { score: state.results.coordination.toFixed(1) };
    }

    // 评分计算（统一使用 ANRM 规则引擎）
    report.scores = calculateScores(state.romResults, state.positionResults, state.coordScores);

    // 综合评分 —— 短板惩罚加权：最低分维度拖低总分，反映"最弱环节决定功能上限"的临床原则
    const weights = { position: 0.30, coordination: 0.20, stability: 0.25, rom: 0.25 };
    let totalWeight = 0, weightedSum = 0, minScore = 100;
    for (const [key, w] of Object.entries(weights)) {
        if (report.scores[key] !== undefined) {
            weightedSum += report.scores[key] * w;
            totalWeight += w;
            if (report.scores[key] < minScore) minScore = report.scores[key];
        }
    }
    const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;
    // 短板惩罚：最低分偏离均值越多，总分被拉得越低
    const penalty = weightedAvg > 0 ? (0.4 + 0.6 * (minScore / weightedAvg)) : 1;
    report.overall = Math.round(weightedAvg * Math.min(1, penalty));

    // 平衡/前庭 → ANRM 评估
    report.findings.push(...BALANCE_RULES.evaluate(
        report.scores.rom || 0,
        report.scores.position || 0,
        report.scores.coordination || 0,
        report.scores.stability || 0
    ));

    // 脑功能推断 → ANRM 知识引擎
    const romFindings = report.findings.filter(f => f.category === 'ROM');
    const posFindings = report.findings.filter(f => f.category === 'PositionSense');
    const coordFindings = report.findings.filter(f => f.category === 'MotorControl' || f.category === 'Coordination');
    report.brainRegions = BRAIN_INFERENCE.infer(romFindings, posFindings, coordFindings, mq);

    // 前庭评估（兼容旧接口）
    const jpsError = report.details.position ? parseFloat(report.details.position.avgError) : 99;
    const smoothness = report.details.stability ? parseFloat(report.details.stability.smoothness) : 0;
    report.vestibular = evaluateVestibularFromAll(jpsError, smoothness, report.details.stability ? parseFloat(report.details.stability.trajectory) : 0, report.scores.stability || 0);

    // 康复建议 → ANRM 知识引擎
    const rehab = REHAB_GENERATOR.generate(report.findings, state.clientInfo);
    report.recommendations = rehab.specificRecommendations;
    report.anrmPrinciples = rehab.anrmPrinciples;
    report.trainingOrder = rehab.trainingOrder;

    return report;
}

function evaluateVestibularFromAll(jpsError, smoothness, trajectory, stabilityScore) {
    // ANRM CTSIB分类模型
    let cls, clsName, assessment, color, recommendation;

    if (jpsError > 99 && smoothness === 0 && stabilityScore === 0) {
        cls = 'N/A'; clsName = '数据不足';
        assessment = '仅有单项数据，无法进行前庭系统分类评估';
        color = '#9CA3AF';
        recommendation = '建议完成位置觉+协调性检测后进行综合评估';
    } else if (jpsError > 4 && smoothness < 0.5 && stabilityScore < 50) {
        cls = 'Class M'; clsName = '前庭-本体混合障碍';
        assessment = 'CTSIB Class M：本体感觉+前庭功能均减退，感觉加权系统紊乱';
        color = '#f97316';
        recommendation = '优先进行神经脱敏（ANRM第1步），然后综合训练：下肢本体（勾脚/臀肌）+ VOR头部运动（相反方向），每项≥7分钟';
    } else if (jpsError > 4 && smoothness >= 0.5) {
        cls = 'Class P'; clsName = '本体感觉主导障碍';
        assessment = 'CTSIB Class P：主要问题在本体感觉，前庭功能相对保留';
        color = '#eab308';
        recommendation = '重点训练下肢本体感觉：踝背屈抗阻、臀肌激活、膝关节稳定。配合闭眼头部定位练习';
    } else if (smoothness < 0.5 || stabilityScore < 50) {
        cls = 'Class V'; clsName = '前庭-小脑功能障碍';
        assessment = 'CTSIB Class V：前庭/小脑功能可能减退，运动控制平滑度不足';
        color = '#ef4444';
        recommendation = '进行头部运动训练（训练与问题相反的方向）：VOR转头+凝视稳定。如伴眩晕需就医排除BPPV';
    } else if (smoothness >= 0.5 && smoothness < 0.8 && stabilityScore >= 50) {
        cls = 'Class C'; clsName = '小脑功能基本完整';
        assessment = 'CTSIB Class C：前庭小脑功能基本完整，短暂晃动后可在5秒内自我校正';
        color = '#22c55e';
        recommendation = '维持当前训练水平，逐步增加难度：从稳定平面→不稳定平面、慢速→快速';
    } else {
        cls = 'Class N'; clsName = '正常';
        assessment = '前庭系统各维度指标正常，感觉加权分布合理（本体70%+前庭20%+视觉10%）';
        color = '#22c55e';
        recommendation = '各项指标正常，保持规律颈椎活动，每周2-3次康复训练';
    }
    return { cls, clsName, assessment, color, recommendation };
}

function generateRehabRecommendations(report) {
    const recs = [];
    // ANRM 6步强制治疗序列，标注神经可塑性最小有效时长(7分钟)
    const needStep = {
        1: report.scores.position !== undefined && report.scores.position < 50,
        2: report.scores.rom !== undefined && report.scores.rom < 50,
        3: report.scores.rom !== undefined && report.scores.rom < 50,
        4: (report.scores.stability !== undefined && report.scores.stability < 60) ||
           (report.scores.coordination !== undefined && report.scores.coordination < 60),
        5: report.scores.coordination !== undefined && report.scores.coordination < 60,
        6: report.scores.position !== undefined && report.scores.position < 60,
    };
    const priorities = [];

    if (needStep[1]) priorities.push('① 神经脱敏 ★优先 — 枕下肌群/SCM后缘/锁骨上窝，即使无痛也需7分钟（ANRM:神经可塑性最小有效时长）');
    if (needStep[2]) priorities.push('② 肩胛稳定 ★优先 — 前锯肌激活（侧卧推墙）+ 胸小肌释放（等长收缩×3组），肩胛是颈椎的"地基"');
    if (needStep[3]) priorities.push('③ 上颈椎活动度 — 缓慢转颈+点头，全ROM各方向，注意不引发疼痛，7分钟');
    if (needStep[4]) priorities.push('④ 肌肉训练 ★优先 — 深层颈屈肌（仰卧点头，目标30mmHg×10s，SCM不激活）+ 颈伸肌（俯卧收下巴，目标2分钟），心率增幅<10bpm');
    if (needStep[5]) priorities.push('⑤ 头颈分离训练 — 球抵墙保持不动+身体移动；或头顶激光笔保持光点稳定+身体移动');
    if (needStep[6]) priorities.push('⑥ 本体感觉整合 ★优先 — 闭眼头部各方向定位，配合VOR训练（眼睛盯目标+头转动，训练相反方向）');
    if (priorities.length === 0) {
        priorities.push('各项指标良好，保持规律颈椎活动和正确坐姿');
        priorities.push('维持训练：每周2-3次，每项≥7分钟（ANRM神经可塑性维持剂量）');
    } else {
        priorities.push('⚠ 训练心率监测：训练时心率增幅≥10bpm需停止或降低强度（ANRM:浅层肌肉过度激活标志）');
        priorities.push('⚠ 训练后颈部不应酸痛——酸痛=练错了（用了SCM而非深层屈肌）');
        priorities.push('📋 建议每日训练，每项≥7分钟（ANRM:神经可塑性最小有效时长），预期4周见效');
    }
    return priorities;
}

/** 绘制五维雷达图 */
function drawRadarChart(canvas, scores) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;

    const labels = ['活动度', '位置觉', '稳定性', '协调性', '反应'];
    const keys = ['rom', 'position', 'stability', 'coordination', 'reaction'];
    const values = keys.map(k => Math.max(5, scores[k] || 0));

    ctx.clearRect(0, 0, w, h);

    // 背景网格
    for (let level = 1; level <= 5; level++) {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            const vr = (r * level) / 5;
            const x = cx + Math.cos(angle) * vr;
            const y = cy + Math.sin(angle) * vr;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + level * 0.03})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 轴线
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.stroke();
    }

    // 数据区域
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const vr = (r * values[i]) / 100;
        const x = cx + Math.cos(angle) * vr;
        const y = cy + Math.sin(angle) * vr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,217,165,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#00D9A5';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 数据点
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const vr = (r * values[i]) / 100;
        const x = cx + Math.cos(angle) * vr;
        const y = cy + Math.sin(angle) * vr;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00D9A5';
        ctx.fill();
    }

    // 标签
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (r + 22);
        const ly = cy + Math.sin(angle) * (r + 22);
        ctx.fillText(labels[i], lx, ly + 4);
        // 分数
        ctx.fillStyle = '#00D9A5';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(values[i].toString(), lx, ly - 12);
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '11px sans-serif';
    }
}

// ============================================================
// 患者数据持久化
// ============================================================
const PATIENT_KEY = 'cervical_client_records';

function savePatientData(patient, report) {
    const records = getPatientRecords();
    records.push({
        name: patient.name || '匿名',
        gender: patient.gender || '',
        age: patient.age || '',
        id: patient.id || '',
        date: new Date().toISOString(),
        overall: report.overall,
        scores: { ...report.scores },
        details: { ...report.details },
        vestibular: report.vestibular,
        recommendations: [...report.recommendations],
    });
    if (records.length > 50) records.shift();
    localStorage.setItem(PATIENT_KEY, JSON.stringify(records));
    return records;
}

function getPatientRecords() {
    try { return JSON.parse(localStorage.getItem(PATIENT_KEY)) || []; }
    catch { return []; }
}

function deletePatientRecord(index) {
    const records = getPatientRecords();
    records.splice(index, 1);
    localStorage.setItem(PATIENT_KEY, JSON.stringify(records));
    return records;
}

/** 在报告弹窗中显示历史记录对比 */
function showHistoryComparison(currentReport) {
    const records = getPatientRecords();
    const detailsDiv = document.getElementById('report-details');
    const chartsDiv = document.getElementById('report-charts');
    const radarCanvas = document.getElementById('radar-chart');

    // 绘制当前雷达图
    radarCanvas.style.display = 'block';
    radarCanvas.width = 260; radarCanvas.height = 260;
    // 加入反应速度维度（如果无数据则用协调性替代）
    if (!currentReport.scores.reaction) currentReport.scores.reaction = currentReport.scores.coordination || 50;
    drawRadarChart(radarCanvas, currentReport.scores);
    chartsDiv.style.display = 'block';

    // 历史对比
    if (records.length > 0) {
        let html = '<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">历史记录</div>';
        const recent = records.slice(-5).reverse();
        recent.forEach((r, i) => {
            const d = new Date(r.date);
            const dateStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
            const color = r.overall >= 70 ? '#22c55e' : r.overall >= 50 ? '#eab308' : '#ef4444';
            html += `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:10px;border-bottom:1px solid rgba(0,0,0,0.05)">
                <span>${r.name || '患者'} ${dateStr}</span>
                <span style="color:${color}">${r.overall}分</span>
                <span style="color:var(--text-muted);cursor:pointer" onclick="window._delRecord(${records.length-1-i})" title="删除">×</span>
            </div>`;
        });
        detailsDiv.innerHTML = html;
        detailsDiv.style.display = 'block';
    }
}

window._delRecord = (i) => {
    deletePatientRecord(i);
    document.getElementById('report-details').style.display = 'none';
};

/** 弹出保存对话框 */
function promptSavePatient() {
    const report = generateComprehensiveReport();
    if (report.available.length === 0) return;
    if (!state.clientInfo || !state.clientInfo.name) {
        document.getElementById('login-modal').classList.add('show');
        document.getElementById('patient-name-input').focus();
        return;
    }
    savePatientData(state.clientInfo, report);
    showHistoryComparison(report);
}

// ============================================================
// 脑功能推断（ANRM脑优化1-3 + 908运动控制）
// 从颈椎检测数据映射到可能受损的脑区，给出脑功能层面的建议
// ============================================================
function inferBrainFunction(report) {
    const findings = []; // { region, likelihood, evidence, recommendation }

    // 小脑蚓部/脊髓小脑 — 从运动质量和平稳度推断
    if (report.details.stability) {
        const smooth = parseFloat(report.details.stability.smoothness);
        const traj = parseFloat(report.details.stability.trajectory);
        if (smooth < 0.5 && traj < 0.5) {
            findings.push({
                region: '小脑蚓部(脊髓小脑 Spinocerebellum)',
                likelihood: '高',
                evidence: `运动平稳度${(smooth*100).toFixed(0)}%、轨迹偏离度${((1-traj)*100).toFixed(0)}%，符合小脑中线功能障碍特征`,
                recommendation: '中线稳定性训练：单腿站立+眼球追踪；躯干共济失调筛查（ANRM: "Fat Guy Eats Donuts" 小脑核序列）'
            });
        } else if (smooth < 0.7) {
            findings.push({
                region: '小脑半球(大脑小脑 Cerebrocerebellum)',
                likelihood: '中',
                evidence: `运动平稳度${(smooth*100).toFixed(0)}%，运动不够流畅`,
                recommendation: '协调性训练：手指-鼻子测试+交替运动，7分钟/天'
            });
        }
    }

    // 前庭小脑 — 从运动质量+JPS推断
    if (report.details.stability && report.details.position) {
        const smooth = parseFloat(report.details.stability.smoothness);
        const jps = parseFloat(report.details.position.avgError);
        if (smooth < 0.5 && jps > 4) {
            findings.push({
                region: '前庭小脑(绒球小结叶 Flocculonodular Lobe)',
                likelihood: '高',
                evidence: `JPS误差${jps}°+平稳度${(smooth*100).toFixed(0)}%，本体-前庭双重障碍模式`,
                recommendation: 'VOR训练(头动眼不动，训练相反方向)；闭眼单腿站立15秒(CTSIB Stage 4)；如伴有眩晕建议做Dix-Hallpike排查BPPV'
            });
        }
    }

    // 额叶/前运动皮层(BA6) — 从轨迹跟踪推断
    if (report.details.stability) {
        const traj = parseFloat(report.details.stability.trajectory);
        if (traj < 0.5) {
            findings.push({
                region: '前运动皮层/辅助运动区(BA6)',
                likelihood: '中',
                evidence: `轨迹跟踪度${(traj*100).toFixed(0)}%，网状脊髓束输出可能不足（BA6→脑桥网状核→脊髓前角，40倍下行纤维用于躯干稳定）`,
                recommendation: '快速手臂运动前先激活躯干(0.1s内)；Bolbath球上躯干稳定训练；红蓝眼镜数字阅读(方向匹配)'
            });
        }
    }

    // 顶叶/体感皮层 — 从JPS误差推断
    if (report.details.position) {
        const jps = parseFloat(report.details.position.avgError);
        if (jps > 6) {
            findings.push({
                region: '顶叶/初级体感皮层(S1)',
                likelihood: '高',
                evidence: `JPS平均误差${jps}°，本体感觉输入严重不足，脑已无法准确定位头部`,
                recommendation: '本体感觉再训练：闭眼头部各方向定位（ANRM第6步），Moro反射评估（仰卧头部突然下落测试），视觉-本体感觉分离训练'
            });
        } else if (jps > 4) {
            findings.push({
                region: '顶叶/体感联合皮层',
                likelihood: '中',
                evidence: `JPS平均误差${jps}°，本体感觉输入减退，视觉开始代偿`,
                recommendation: '下肢本体感觉训练优先（CTSIB: 本体70%权重）；踝背屈抗阻+闭眼站立训练'
            });
        }
    }

    // 基底节 — 从ROM和运动质量推断
    if (report.details.rom) {
        const romKeys = Object.keys(report.details.rom.angles || {});
        if (romKeys.length > 0 && report.scores.rom < 40) {
            findings.push({
                region: '基底节(直接/间接通路)',
                likelihood: '中',
                evidence: `ROM评分${report.scores.rom}分，活动范围受限可能涉及基底节运动环路`,
                recommendation: '大振幅缓慢运动训练；节拍器(54BPM)引导的节律性转头运动；避免快速/弹道式动作'
            });
        }
    }

    // 额叶眼区/上丘 — 从Saccade代偿模式间接推断
    // 基于协调性检测中的跟踪指标（模拟smooth pursuit+saccade的混合）
    if (report.details.coordination) {
        const tracking = parseFloat(report.details.coordination.tracking);
        if (tracking < 0.4) {
            findings.push({
                region: '额叶眼区(FEF/BA8)+上丘',
                likelihood: '低(需扫视测试确认)',
                evidence: `跟踪度${(tracking*100).toFixed(0)}%，眼-头协调可能受损（ANRM: 67种眼动类型的眼-脊耦合）`,
                recommendation: '扫视训练：双笔快速交替目标，极小幅(远小于评估幅度)，20次×多组；如出现代偿性头部运动=阳性'
            });
        }
    }

    // 脑干网状结构 — 综合多项指标
    const totalIssues = findings.filter(f => f.likelihood === '高').length;
    if (totalIssues >= 2) {
        findings.push({
            region: '脑干网状结构(Reticular Formation)',
            likelihood: '中',
            evidence: `多个脑区同时受累(${totalIssues}个高可能)，网状结构作为中枢整合枢纽可能参与`,
            recommendation: '神经脱敏优先(ANRM第1步)；心率监测(训练时<+10bpm)；卧姿起步→坐姿→站姿渐进训练；保证睡眠质量'
        });
    }

    // 疼痛-大脑偏侧映射
    if (report.details.position) {
        const results = report.details.position.results || [];
        const leftErrors = results.filter(r => r.name && r.name.includes('左'));
        const rightErrors = results.filter(r => r.name && r.name.includes('右'));
        const leftAvg = leftErrors.length > 0 ? leftErrors.reduce((s, r) => s + r.totalError, 0) / leftErrors.length : 0;
        const rightAvg = rightErrors.length > 0 ? rightErrors.reduce((s, r) => s + r.totalError, 0) / rightErrors.length : 0;
        if (leftAvg > 0 && rightAvg > 0 && Math.abs(leftAvg - rightAvg) > 1.5) {
            const worseSide = leftAvg > rightAvg ? '左侧' : '右侧';
            const brainSide = worseSide === '左侧' ? '右半球' : '可能涉及双侧';
            findings.push({
                region: `大脑${brainSide}（疼痛偏侧映射）`,
                likelihood: '低',
                evidence: `${worseSide}JPS误差(${Math.max(leftAvg,rightAvg).toFixed(1)}°)显著大于对侧(${Math.min(leftAvg,rightAvg).toFixed(1)}°)，ANRM原则：左侧功能障碍→右脑`,
                recommendation: `${brainSide === '右半球' ? '右脑' : '双侧'}训练：对侧承重+同侧自由运动；空间记忆回忆训练（黑点视觉记忆）`
            });
        }
    }

    return findings;
}

/** 一键显示综合报告（按钮调用入口） */
function showComprehensiveReport() {
    let report;
    try {
        report = generateComprehensiveReport();
    } catch (e) {
        console.error('报告生成失败:', e);
        alert('报告生成失败，请重试。');
        return;
    }
    if (report.available.length === 0) {
        alert('请先完成至少一项检测后再生成报告。');
        return;
    }
    // 确保模态框可见
    document.getElementById('result-modal').classList.add('show');
    updateScoreBars(
        report.scores.position || 0,
        report.scores.stability || 0,
        report.scores.rom || 0,
        report.scores.coordination || 0
    );

    // === 评估发现汇总（ANRM 知识引擎输出）===
    const detailsContent = document.getElementById('report-details-content');
    let html = '';

    // 发现列表
    if (report.findings.length > 0) {
        html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">📋 评估发现</div>';
        report.findings.forEach(f => {
            const sevColors = { normal: '#22c55e', mild: '#eab308', moderate: '#f97316', significant: '#ef4444' };
            const sevColor = sevColors[f.severity] || '#9CA3AF';
            html += `<div style="margin-bottom:8px;padding:8px;background:rgba(0,0,0,0.03);border-radius:6px;border-left:3px solid ${sevColor};">
                <div style="font-weight:600;font-size:11px;">${f.finding}</div>
                <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">ANRM: ${f.anrmRef || ''}</div>`;
            if (f.implications) {
                f.implications.forEach(imp => {
                    html += `<div style="font-size:9px;color:#9CA3AF;margin-top:1px;">→ ${imp}</div>`;
                });
            }
            html += '</div>';
        });
    }

    // 脑功能推断
    if (report.brainRegions && report.brainRegions.length > 0) {
        html += '<div style="font-size:11px;color:var(--text-muted);margin:12px 0 6px;">🧠 脑功能推断 (ANRM 体系)</div>';
        report.brainRegions.forEach(r => {
            const lc = r.likelihood === '高' ? '#ef4444' : r.likelihood === '中' ? '#f59e0b' : '#9CA3AF';
            html += `<div style="padding:6px 0;font-size:10px;border-bottom:1px solid rgba(0,0,0,0.04);">
                <span style="color:${lc}">[${r.likelihood}可能性]</span> <b>${r.region}</b>
                <div style="color:#9CA3AF;margin-top:2px;">📊 ${r.evidence}</div>
                <div style="color:#00D9A5;margin-top:2px;">💡 ${Array.isArray(r.recommendations) ? r.recommendations.join('；') : r.recommendation}</div>
            </div>`;
        });
    }

    // ANRM 核心原则
    if (report.anrmPrinciples) {
        html += '<div style="font-size:11px;color:var(--primary);margin:12px 0 6px;">📖 ANRM 康复核心原则</div>';
        report.anrmPrinciples.forEach(p => {
            html += `<div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;">• ${p}</div>`;
        });
    }

    // 训练顺序
    if (report.trainingOrder) {
        html += '<div style="font-size:11px;color:var(--success);margin:12px 0 6px;">🏃 建议训练顺序</div>';
        report.trainingOrder.forEach((step, i) => {
            html += `<div style="font-size:10px;color:var(--text);margin-bottom:3px;">${step}</div>`;
        });
    }

    // 康复建议
    html += '<div style="font-size:11px;color:var(--success);margin:12px 0 6px;">💪 具体康复建议</div>';
    (report.recommendations || []).forEach(r => {
        html += `<div style="font-size:10px;color:var(--text);margin-bottom:3px;">• ${r}</div>`;
    });

    detailsContent.innerHTML = html;
    document.getElementById('report-details').style.display = 'block';

    // 前庭
    const vDiv = document.getElementById('vestibular-assessment');
    vDiv.style.display = 'block';
    document.getElementById('vestibular-result').textContent =
        `[${report.vestibular.cls}] ${report.vestibular.assessment}`;
    document.getElementById('vestibular-result').style.color = report.vestibular.color;
    document.getElementById('vestibular-recommendation').textContent = report.vestibular.recommendation;

    // 前庭下方的康复建议区改为空（已在上方 details 区展示）
    document.getElementById('rehab-suggestions').style.display = 'none';

    showHistoryComparison(report);
}

/** 报告查询弹窗 */
function showRecordsModal() {
    const records = getPatientRecords();
    const modal = document.getElementById('records-modal');
    const list = document.getElementById('records-list');

    if (records.length === 0) {
        list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:20px;">暂无保存的记录</div>';
    } else {
        let html = '';
        records.slice().reverse().forEach((r, i) => {
            const d = new Date(r.date);
            const ds = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            const c = r.overall >= 70 ? '#22c55e' : r.overall >= 50 ? '#eab308' : '#ef4444';
            html += `<div style="padding:8px;margin-bottom:4px;background:rgba(0,0,0,0.03);border-radius:6px;cursor:pointer" onclick="window._viewRecord(${records.length-1-i})">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-weight:600">${r.name || '匿名'}
                        ${r.gender ? '<span style="font-size:10px;color:var(--text-muted)">'+r.gender+'</span>' : ''}
                        ${r.age ? '<span style="font-size:10px;color:var(--text-muted)">'+r.age+'岁</span>' : ''}
                        ${r.id ? '<span style="font-size:10px;color:var(--primary)"> #'+r.id+'</span>' : ''}
                        <span style="font-size:10px;color:var(--text-muted)">${ds}</span></span>
                    <span style="font-size:18px;font-weight:700;color:${c}">${r.overall}分</span>
                </div>
                <div style="font-size:9px;color:var(--text-muted);margin-top:2px">
                    活动度${r.scores.rom||'-'} | 位置觉${r.scores.position||'-'} | 稳定${r.scores.stability||'-'} | 协调${r.scores.coordination||'-'}
                </div>
            </div>`;
        });
        list.innerHTML = html;
    }
    if (!modal._bound) {
        document.getElementById('close-records-btn').onclick = () => modal.classList.remove('show');
        document.getElementById('clear-records-btn').onclick = () => {
            if (confirm('确认清空所有记录？')) { localStorage.removeItem('cervical_client_records'); showRecordsModal(); }
        };
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
        modal._bound = true;
    }
    modal.classList.add('show');
}

/** 点击单条记录查看详情 */
window._viewRecord = (index) => {
    const records = getPatientRecords();
    const r = records[index];
    if (!r) return;
    // 关闭查询弹窗
    document.getElementById('records-modal').classList.remove('show');
    // 把数据写入report用于展示
    updateScoreBars(r.scores.position || 0, r.scores.stability || 0, r.scores.rom || 0, r.scores.coordination || 0);
    if (r.vestibular) {
        const vDiv = document.getElementById('vestibular-assessment');
        vDiv.style.display = 'block';
        document.getElementById('vestibular-result').textContent = r.vestibular.assessment || r.vestibular.clsName || '';
        document.getElementById('vestibular-result').style.color = r.vestibular.color || '#9CA3AF';
        document.getElementById('vestibular-recommendation').textContent = r.vestibular.recommendation || '';
    }
    if (r.recommendations) {
        const rehabDiv = document.getElementById('rehab-suggestions');
        rehabDiv.style.display = 'block';
        document.getElementById('rehab-suggestions-content').innerHTML = r.recommendations.map(rc => '• ' + rc).join('<br>');
    }
    // 雷达图
    const radarCanvas = document.getElementById('radar-chart');
    radarCanvas.style.display = 'block';
    radarCanvas.width = 260; radarCanvas.height = 260;
    const scores = { ...r.scores, reaction: r.scores.coordination || 50 };
    drawRadarChart(radarCanvas, scores);
    document.getElementById('report-charts').style.display = 'block';
    document.getElementById('result-modal').classList.add('show');
};

// 暴露到全局
window.generateComprehensiveReport = generateComprehensiveReport;
window.savePatientData = savePatientData;
window.getPatientRecords = getPatientRecords;
window.promptSavePatient = promptSavePatient;
window.showHistoryComparison = showHistoryComparison;
window.drawRadarChart = drawRadarChart;
window.showComprehensiveReport = showComprehensiveReport;
window.showRecordsModal = showRecordsModal;

export { renderCollectedPoints, updateDataDisplay, updateProgress, zeroPosition, collectPoint, showROMResults, showROMInlineResults, generateComprehensiveReport, savePatientData, getPatientRecords, promptSavePatient, showComprehensiveReport, showRecordsModal, showResults };
