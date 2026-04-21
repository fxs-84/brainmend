// ============================================================
// UI - 界面更新
// ============================================================

function updateDataDisplay() {
    const displayPitch = state.pitch - state.pitchOffset;
    const displayYaw = state.yaw - state.yawOffset;
    const displayRoll = state.roll - state.rollOffset;
    document.getElementById('pitch-value').textContent = displayPitch.toFixed(1) + '°';
    document.getElementById('yaw-value').textContent = displayYaw.toFixed(1) + '°';
    document.getElementById('roll-value').textContent = displayRoll.toFixed(1) + '°';
    state.error = Math.sqrt(state.dotX ** 2 + state.dotY ** 2);
    document.getElementById('error-value').textContent = state.error.toFixed(1) + '°';
    document.getElementById('dot-x').textContent = Math.round(state.dotX);
    document.getElementById('dot-y').textContent = Math.round(state.dotY);
}

function zeroPosition() {
    state.pitchOffset = state.pitch;
    state.yawOffset = state.yaw;
    state.rollOffset = state.roll;

    // ROM检测模式：romStepIndex=0未开始, 1-6进行中, 7完成
    // 只有采集后才能归零进入下一步
    if (state.mode === 'rom') {
        if (state.romStepIndex === 0) {
            // 第一次归零：开始检测
            state.romStepIndex = 1;
            state.romIsWaitingForZero = false;
            updateROMGuide();
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
            updateROMGuide();
        }
    }

    // 位置觉检测模式
    if (state.mode === 'position') {
        if (state.positionStepIndex === 0) {
            // 第一次归零：记录初始位置并开始检测
            state.positionInitialPitch = state.pitch;
            state.positionInitialYaw = state.yaw;
            state.positionInitialRoll = state.roll;
            state.positionStepIndex = 1;
            state.positionIsRunning = true;
            updatePositionGuide();
        } else if (state.positionStepIndex > 0 && state.positionIsRunning === 'waiting_for_zero') {
            // 采集后的归零：记录新的初始位置，进入下一步
            state.positionInitialPitch = state.pitch;
            state.positionInitialYaw = state.yaw;
            state.positionInitialRoll = state.roll;
            state.positionIsRunning = true;
            updatePositionGuide();
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

    const displayPitch = state.pitch - state.pitchOffset;
    const displayYaw = state.yaw - state.yawOffset;
    const displayRoll = state.roll - state.rollOffset;
    const point = {
        id: Date.now(),
        dotX: state.dotX,
        dotY: state.dotY,
        pitch: displayPitch,
        yaw: displayYaw,
        roll: displayRoll,
        timestamp: new Date().toLocaleTimeString()
    };
    state.collectedPoints.push(point);

    // ROM检测模式：采集后等待归零进入下一步
    if (state.mode === 'rom' && state.romStepIndex >= 1 && state.romStepIndex <= 6) {
        const step = CONFIG.ROM_STEPS[state.romStepIndex - 1];
        state.romResults[step.name] = point[step.axis];
        state.romIsWaitingForZero = true;
        updateROMGuide();
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
        updateROMGuide();
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
            const avgTracking = scores.tracking.reduce((a, b) => a + b, 0) / scores.tracking.length;
            const avgTrajectory = scores.trajectory.reduce((a, b) => a + b, 0) / scores.trajectory.length;
            const avgSmoothness = scores.smoothness.reduce((a, b) => a + b, 0) / scores.smoothness.length;
            coordinationScore = avgTracking * 0.4 + avgTrajectory * 0.3 + avgSmoothness * 0.3;

            // 协调性详细数据
            detailsHtml = `
                <div style="margin-bottom: 6px;">
                    <span style="color: var(--text-muted);">跟踪得分:</span>
                    <span style="color: var(--primary);">${Math.round(avgTracking)}分</span>
                    <span style="color: var(--text-muted); font-size: 9px;">(误差越小越好)</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: var(--text-muted);">轨迹得分:</span>
                    <span style="color: var(--secondary);">${Math.round(avgTrajectory)}分</span>
                    <span style="color: var(--text-muted); font-size: 9px;">(偏离轨迹越少越好)</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: var(--text-muted);">平稳得分:</span>
                    <span style="color: var(--warning);">${Math.round(avgSmoothness)}分</span>
                    <span style="color: var(--text-muted); font-size: 9px;">(运动越匀速越好)</span>
                </div>
            `;

            // 根据得分给建议
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
        // ROM详细数据
        detailsHtml = '<div style="font-size: 10px;">';
        for (let i = 0; i < CONFIG.ROM_STEPS.length; i++) {
            const step = CONFIG.ROM_STEPS[i];
            const value = state.romResults[step.name];
            if (value !== undefined) {
                const absValue = Math.abs(value);
                const pct = Math.min(100, (absValue / step.normal) * 100);
                const status = absValue >= step.normal * 0.8 ? '正常' : absValue >= step.normal * 0.5 ? '轻度受限' : '明显受限';
                const color = absValue >= step.normal * 0.8 ? 'var(--success)' : absValue >= step.normal * 0.5 ? 'var(--warning)' : 'var(--danger)';
                detailsHtml += `<div style="margin-bottom: 4px;">
                    <span>${step.name}:</span>
                    <span style="color: ${color};">${value.toFixed(1)}° ${status}</span>
                    <span style="color: var(--text-muted);">(正常${step.normal}°)</span>
                </div>`;
            }
        }
        detailsHtml += '</div>';

        // ROM建议
        const romValues = Object.values(state.romResults).map(v => Math.abs(v));
        const romAvg = romValues.reduce((a, b) => a + b, 0) / romValues.length;
        romScore = Math.min(100, (romAvg / 45) * 100);
        if (romAvg < 35) suggestions.push('颈椎活动度明显受限，建议进行牵引治疗');
        else if (romAvg < 45) suggestions.push('活动度轻度受限，建议每日进行颈部伸展练习');
        else suggestions.push('活动度基本正常，建议保持规律颈部运动');

        positionScore = 0;
        stabilityScore = 0;
        coordinationScore = 0;
    } else if (state.mode === 'position' && state.positionResults && state.positionResults.length > 0) {
        // 位置觉详细数据
        detailsHtml = '<div style="font-size: 10px;">';
        state.positionResults.forEach(r => {
            const cls = classifyJPS(r.totalError);
            detailsHtml += `<div style="margin-bottom: 4px;">
                <span>${r.name}:</span>
                <span style="color: ${cls.color};">误差${r.totalError.toFixed(1)}° (${cls.level})</span>
            </div>`;
        });
        const avgJpsError = state.positionResults.reduce((sum, r) => sum + r.totalError, 0) / state.positionResults.length;
        const overallCls = classifyJPS(avgJpsError);
        detailsHtml += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span>平均误差:</span>
            <span style="color: ${overallCls.color}; font-weight: 600;">${avgJpsError.toFixed(1)}° (${overallCls.level})</span>
        </div></div>`;

        // 位置觉建议
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

    const overall = Math.round((positionScore + stabilityScore + romScore + coordinationScore) / 4);

    // 更新综合评分显示
    const overallScore = document.getElementById('overall-score');
    const overallLevel = document.getElementById('overall-level');
    overallScore.textContent = overall;
    overallScore.style.color = overall >= 80 ? 'var(--success)' : overall >= 60 ? 'var(--warning)' : 'var(--danger)';
    overallLevel.textContent = overall >= 80 ? '良好' : overall >= 60 ? '一般' : '需关注';
    overallLevel.style.color = overall >= 80 ? 'var(--success)' : overall >= 60 ? 'var(--warning)' : 'var(--danger)';

    // 更新评分
    document.getElementById('result-position').textContent = Math.round(positionScore);
    document.getElementById('bar-position').style.width = positionScore + '%';
    document.getElementById('result-stability').textContent = Math.round(stabilityScore);
    document.getElementById('bar-stability').style.width = stabilityScore + '%';
    document.getElementById('result-rom').textContent = Math.round(romScore);
    document.getElementById('bar-rom').style.width = romScore + '%';
    document.getElementById('result-coordination').textContent = Math.round(coordinationScore);
    document.getElementById('bar-coordination').style.width = coordinationScore + '%';

    // 显示详细数据
    const detailsDiv = document.getElementById('report-details');
    const detailsContent = document.getElementById('report-details-content');
    if (detailsHtml) {
        detailsDiv.style.display = 'block';
        detailsContent.innerHTML = detailsHtml;
    } else {
        detailsDiv.style.display = 'none';
    }

    // 计算前庭功能间接评估
    let vestibularAssessment;
    if (state.mode === 'integrated') {
        vestibularAssessment = getVestibularAssessmentFromIntegrated();
    } else if (state.mode === 'coordination') {
        vestibularAssessment = evaluateVestibularFunction({
            jpsAvgError: 0,
            coordinationScore: coordinationScore,
            stabilityScore: 0
        });
    } else if (state.mode === 'position' && state.positionResults && state.positionResults.length > 0) {
        const avgJpsError = state.positionResults.reduce((sum, r) => sum + r.totalError, 0) / state.positionResults.length;
        vestibularAssessment = evaluateVestibularFunction({
            jpsAvgError: avgJpsError,
            coordinationScore: 0,
            stabilityScore: 0
        });
    }

    // 显示前庭评估结果
    const vestibularDiv = document.getElementById('vestibular-assessment');
    const vestibularResult = document.getElementById('vestibular-result');
    const vestibularRec = document.getElementById('vestibular-recommendation');
    if (vestibularAssessment) {
        vestibularDiv.style.display = 'block';
        vestibularResult.textContent = vestibularAssessment.assessment;
        vestibularResult.style.color = vestibularAssessment.color;
        vestibularRec.textContent = vestibularAssessment.recommendation;
    } else {
        vestibularDiv.style.display = 'none';
    }

    // 显示康复建议
    const rehabDiv = document.getElementById('rehab-suggestions');
    const rehabContent = document.getElementById('rehab-suggestions-content');
    if (suggestions.length > 0) {
        rehabDiv.style.display = 'block';
        rehabContent.innerHTML = suggestions.map(s => '<div style="margin-bottom: 4px;">• ' + s + '</div>').join('');
    } else {
        rehabDiv.style.display = 'none';
    }

    document.getElementById('result-modal').classList.add('show');
}
