// ============================================================
// TTS - 中文语音播报
// ============================================================

// TTS配置
const TTS_CONFIG = {
    enabled: false,  // 默认关闭
    rate: 0.85,      // 语速（稍慢便于理解）
    pitch: 1.0,      // 音调（0.1-2）
    volume: 1.0      // 音量（0-1）
};

// 可用语音列表
let cachedVoices = [];

// TTS提示文本 - 完整的检测流程指导
const TTS_PROMPTS = {
    // 通用
    start: '开始检测',
    complete: '检测完成',
    error: '检测出错',

    // 综合检测
    integrated: {
        start: '综合检测开始，持续20秒，请跟踪目标点',
        mid: '继续跟踪，保持稳定',
        complete: '检测完成'
    },

    // 协调性检测
    coordination: {
        start: '协调性检测开始，请跟踪红色目标点沿指定轨迹移动',
        horizontal: '水平轨迹',
        vertical: '垂直轨迹',
        verticalLeft: '左偏45度轨迹',
        verticalRight: '右偏45度轨迹',
        figure8: '8字轨迹',
        complete: '协调性检测完成'
    },

    // ROM检测
    rom: {
        start: '活动度检测开始，共6个方向，请依次完成',
        stepIntro: '第{step}步：{name}，请移动到极限位置',
        collect: '请采集数据',
        returnZero: '请回到中心归零',
        nextStep: '进入下一步',
        complete: '活动度检测完成'
    },

    // 位置觉检测
    position: {
        start: '位置觉检测开始，共6个方向，测试本体感觉',
        stepIntro: '第{step}步：{name}，请先归零到中心位置',
        closeEyes: '请闭眼',
        moveToLimit: '保持闭眼，移动到极限位置',
        hold: '保持不动',
        countdown: '{count}秒',
        openEyes: '请睁眼',
        returnZero: '回到中心位置',
        collect: '采集数据，请睁眼归零',
        nextStep: '进入下一步',
        complete: '位置觉检测完成'
    }
};

// ============================================================
// 核心语音函数
// ============================================================

// 语音播报函数
function speak(text, options = {}) {
    if (!TTS_CONFIG.enabled) return;
    if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API not supported');
        return;
    }

    // 停止当前播报
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = options.rate || TTS_CONFIG.rate;
    utterance.pitch = options.pitch || TTS_CONFIG.pitch;
    utterance.volume = options.volume || TTS_CONFIG.volume;

    // 尝试选择中文语音
    const chineseVoice = cachedVoices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    if (chineseVoice) {
        utterance.voice = chineseVoice;
    }

    utterance.onerror = (e) => {
        console.warn('TTS error:', e.error);
    };

    speechSynthesis.speak(utterance);
}

// 延迟播报（用于连续提示）
function speakDelayed(text, delay = 500) {
    setTimeout(() => speak(text), delay);
}

// 延迟执行TTS函数
function ttsDelayed(ttsFunc, mode, param, delay = 800) {
    setTimeout(() => ttsFunc(mode, param), delay);
}

// 停止播报
function stopSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

// 检查是否正在播报
function isSpeaking() {
    return 'speechSynthesis' in window && speechSynthesis.speaking;
}

// 获取可用语音列表
function getAvailableVoices() {
    if (!('speechSynthesis' in window)) return [];
    return speechSynthesis.getVoices().filter(v => v.lang.includes('zh'));
}

// ============================================================
// 初始化
// ============================================================

// 初始化语音系统
function initTTS() {
    if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API not supported');
        return;
    }

    // 加载语音列表并缓存
    function loadVoices() {
        cachedVoices = speechSynthesis.getVoices();
    }

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    // 从localStorage恢复设置
    const savedEnabled = localStorage.getItem('tts_enabled');
    if (savedEnabled !== null) {
        TTS_CONFIG.enabled = savedEnabled === 'true';
    }

    updateTTSButtonUI();
}

// 更新TTS按钮UI
function updateTTSButtonUI() {
    const btn = document.getElementById('tts-toggle');
    if (!btn) return;

    if (TTS_CONFIG.enabled) {
        btn.textContent = '语音开启';
        btn.style.background = 'var(--primary)';
        btn.style.color = 'var(--bg-dark)';
    } else {
        btn.textContent = '语音关闭';
        btn.style.background = 'var(--bg-panel)';
        btn.style.color = 'var(--text)';
    }
}

// 切换TTS开关
function toggleTTS() {
    TTS_CONFIG.enabled = !TTS_CONFIG.enabled;
    localStorage.setItem('tts_enabled', TTS_CONFIG.enabled);
    updateTTSButtonUI();

    if (TTS_CONFIG.enabled) {
        speak('语音已开启');
    }
}

// ============================================================
// 检测流程语音指导
// ============================================================

// 综合检测语音
function ttsIntegrated(mode) {
    switch (mode) {
        case 'start':
            speak(TTS_PROMPTS.integrated.start);
            break;
        case 'mid':
            speak(TTS_PROMPTS.integrated.mid);
            break;
        case 'complete':
            speak(TTS_PROMPTS.integrated.complete);
            break;
    }
}

// 协调性检测语音
function ttsCoordination(mode, trajectoryType = '') {
    switch (mode) {
        case 'start':
            speak(TTS_PROMPTS.coordination.start);
            break;
        case 'trajectory':
            const trajPrompts = TTS_PROMPTS.coordination;
            if (trajectoryType === 'horizontal') speak(trajPrompts.horizontal);
            else if (trajectoryType === 'vertical') speak(trajPrompts.vertical);
            else if (trajectoryType === 'vertical_left') speak(trajPrompts.verticalLeft);
            else if (trajectoryType === 'vertical_right') speak(trajPrompts.verticalRight);
            else if (trajectoryType === 'figure8') speak(trajPrompts.figure8);
            break;
        case 'complete':
            speak(TTS_PROMPTS.coordination.complete);
            break;
    }
}

// ROM检测语音
function ttsROM(mode, stepIndex = 0, stepName = '') {
    switch (mode) {
        case 'start':
            speak(TTS_PROMPTS.rom.start);
            break;
        case 'stepIntro':
            const intro = TTS_PROMPTS.rom.stepIntro
                .replace('{step}', String(stepIndex))
                .replace('{name}', stepName);
            speak(intro);
            break;
        case 'collect':
            speak(TTS_PROMPTS.rom.collect);
            break;
        case 'returnZero':
            speak(TTS_PROMPTS.rom.returnZero);
            break;
        case 'nextStep':
            speak(TTS_PROMPTS.rom.nextStep);
            break;
        case 'complete':
            speak(TTS_PROMPTS.rom.complete);
            break;
    }
}

// 位置觉检测语音
function ttsPosition(mode, stepIndex = 0, stepName = '', count = 0) {
    switch (mode) {
        case 'start':
            speak(TTS_PROMPTS.position.start);
            break;
        case 'stepIntro':
            const intro = TTS_PROMPTS.position.stepIntro
                .replace('{step}', String(stepIndex))
                .replace('{name}', stepName);
            speak(intro);
            break;
        case 'closeEyes':
            speak(TTS_PROMPTS.position.closeEyes);
            break;
        case 'moveToLimit':
            speak(TTS_PROMPTS.position.moveToLimit);
            break;
        case 'hold':
            speak(TTS_PROMPTS.position.hold);
            break;
        case 'countdown':
            const cd = TTS_PROMPTS.position.countdown.replace('{count}', String(count));
            speak(cd);
            break;
        case 'openEyes':
            speak(TTS_PROMPTS.position.openEyes);
            break;
        case 'returnZero':
            speak(TTS_PROMPTS.position.returnZero);
            break;
        case 'collect':
            speak(TTS_PROMPTS.position.collect);
            break;
        case 'nextStep':
            speak(TTS_PROMPTS.position.nextStep);
            break;
        case 'complete':
            speak(TTS_PROMPTS.position.complete);
            break;
    }
}

// ============================================================
// 结果播报
// ============================================================

// 播报综合检测结果
function speakResultsIntegrated(scores) {
    const overall = Math.round((scores.position + scores.stability + scores.rom + scores.coordination) / 4);
    let message = `综合检测完成。位置觉得分${Math.round(scores.position)}分，稳定性得分${Math.round(scores.stability)}分，活动范围得分${Math.round(scores.rom)}分。综合评分${overall}分。`;

    if (overall >= 80) message += '整体表现良好。';
    else if (overall >= 60) message += '建议继续坚持训练。';
    else message += '建议加强颈部康复训练。';

    speak(message);
}

// 播报协调性检测结果
function speakResultsCoordination(score) {
    const roundedScore = Math.round(score);
    let message = `协调性检测完成，您的得分是${roundedScore}分。`;

    if (roundedScore >= 80) message += '跟踪表现优秀。';
    else if (roundedScore >= 60) message += '跟踪表现一般，建议加强训练。';
    else message += '跟踪表现欠佳，建议进行更多协调性训练。';

    speak(message);
}

// 播报ROM检测结果
function speakResultsROM(romResults) {
    const count = Object.keys(romResults).length;
    let message = `活动度检测完成，已采集${count}个方向数据。`;

    // 计算平均值
    const values = Object.values(romResults).map(v => Math.abs(v));
    if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        if (avg >= 40) message += '活动范围基本正常。';
        else if (avg >= 30) message += '活动范围轻度受限。';
        else message += '活动范围明显受限，建议加强锻炼。';
    }

    speak(message);
}

// 播报位置觉检测结果
function speakResultsPosition(positionResults) {
    if (positionResults.length === 0) {
        speak('位置觉检测完成，暂无数据。');
        return;
    }

    const avgError = positionResults.reduce((sum, r) => sum + r.totalError, 0) / positionResults.length;
    let message = `位置觉检测完成，测试了${positionResults.length}个方向，平均误差${avgError.toFixed(1)}度。`;

    if (avgError < 3) message += '本体感觉良好。';
    else if (avgError < 5) message += '本体感觉正常。';
    else if (avgError < 7) message += '本体感觉轻度障碍，建议加强训练。';
    else message += '本体感觉明显障碍，建议专业评估。';

    speak(message);
}

// 通用结果播报
function speakResults(scores) {
    const overall = Math.round((scores.position + scores.stability + scores.rom + scores.coordination) / 4);
    speak(`检测完成，您的综合评分是${overall}分`);
}