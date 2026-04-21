// ============================================================
// TTS - 中文语音播报
// ============================================================

// TTS配置
const TTS_CONFIG = {
    enabled: false,  // 默认关闭
    rate: 0.9,       // 语速（0.1-10）
    pitch: 1.0,      // 音调（0.1-2）
    volume: 1.0      // 音量（0-1）
};

// 可用语音列表
let cachedVoices = [];

// TTS提示文本
const TTS_PROMPTS = {
    // 通用
    start: '开始检测',
    complete: '检测完成',
    error: '检测出错',

    // 位置觉
    position: {
        start: '位置觉检测开始，请先归零',
        closeEyes: '请闭眼',
        hold: '保持',
        openEyes: '请睁眼归零',
        next: '下一个方向'
    },

    // ROM检测
    rom: {
        start: '活动度检测开始',
        moveToLimit: '请移动到极限位置',
        collect: '请采集',
        returnToZero: '请归零',
        next: '下一个方向'
    },

    // 协调性检测
    coordination: {
        start: '协调性检测开始',
        followTarget: '跟踪红色目标点'
    },

    // 综合检测
    integrated: {
        start: '综合检测开始',
        followTarget: '跟踪目标点'
    }
};

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

    // 尝试选择中文语音（使用缓存的语音列表）
    const chineseVoice = cachedVoices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    if (chineseVoice) {
        utterance.voice = chineseVoice;
    }

    utterance.onerror = (e) => {
        console.warn('TTS error:', e.error);
    };

    speechSynthesis.speak(utterance);
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

    // 立即尝试加载（部分浏览器已缓存）
    loadVoices();

    // 监听语音列表变化（某些浏览器延迟加载）
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
// 检测流程中的语音提示
// ============================================================

// 位置觉检测语音
function speakPositionPrompt(phase) {
    const prompts = TTS_PROMPTS.position;
    switch (phase) {
        case 'start':
            speak(prompts.start);
            break;
        case 'closeEyes':
            speak(prompts.closeEyes);
            break;
        case 'hold':
            speak(prompts.hold);
            break;
        case 'openEyes':
            speak(prompts.openEyes);
            break;
        case 'next':
            speak(prompts.next);
            break;
    }
}

// ROM检测语音
function speakROMPrompt(phase, stepName = '') {
    const prompts = TTS_PROMPTS.rom;
    switch (phase) {
        case 'start':
            speak(prompts.start);
            break;
        case 'moveToLimit':
            speak(stepName ? `${stepName}，${prompts.moveToLimit}` : prompts.moveToLimit);
            break;
        case 'collect':
            speak(prompts.collect);
            break;
        case 'returnToZero':
            speak(prompts.returnToZero);
            break;
        case 'next':
            speak(prompts.next);
            break;
    }
}

// 协调性检测语音
function speakCoordinationPrompt(phase) {
    const prompts = TTS_PROMPTS.coordination;
    switch (phase) {
        case 'start':
            speak(prompts.start);
            break;
        case 'followTarget':
            speak(prompts.followTarget);
            break;
    }
}

// 综合检测语音
function speakIntegratedPrompt(phase) {
    const prompts = TTS_PROMPTS.integrated;
    switch (phase) {
        case 'start':
            speak(prompts.start);
            break;
        case 'followTarget':
            speak(prompts.followTarget);
            break;
    }
}

// 播报检测结果
function speakResults(scores) {
    const overall = Math.round((scores.position + scores.stability + scores.rom + scores.coordination) / 4);
    speak(`检测完成，您的综合评分是${overall}分`);
}