// ============================================================
// TTS - 中文语音播报
// ============================================================

// TTS配置
const TTS_CONFIG = {
    enabled: false,  // 默认关闭
    rate: 0.85,     // 语速（稍慢便于理解）
    pitch: 1.0,
    volume: 1.0
};

// 可用语音列表
let cachedVoices = [];

// ============================================================
// 核心语音函数
// ============================================================

function speak(text, options = {}) {
    if (!TTS_CONFIG.enabled) return;
    if (!text || typeof text !== 'string') return;
    if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API not supported');
        return;
    }

    // 取消之前的播报
    speechSynthesis.cancel();

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

function speakScreenText(elementId) {
    const el = document.getElementById(elementId);
    if (el && el.textContent) {
        speak(el.textContent);
    }
}

function stopSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

function isSpeaking() {
    return 'speechSynthesis' in window && speechSynthesis.speaking;
}

// ============================================================
// 初始化
// ============================================================

function initTTS() {
    if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API not supported');
        return;
    }

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

function toggleTTS() {
    TTS_CONFIG.enabled = !TTS_CONFIG.enabled;
    localStorage.setItem('tts_enabled', TTS_CONFIG.enabled);
    updateTTSButtonUI();

    if (TTS_CONFIG.enabled) {
        speak('语音已开启');
    }
}

// ============================================================
// 结果播报（这些是预设文本，不是屏幕文字）
// ============================================================

function speakResults(scores) {
    const overall = Math.round((scores.position + scores.stability + scores.rom + scores.coordination) / 4);
    let message = `检测完成。综合评分${overall}分。`;

    if (overall >= 80) message += '整体表现良好。';
    else if (overall >= 60) message += '建议继续坚持训练。';
    else message += '建议加强颈部康复训练。';

    speak(message);
}

function speakResultsCoordination(score) {
    const roundedScore = Math.round(score);
    let message = `协调性检测完成，得分${roundedScore}分。`;

    if (roundedScore >= 80) message += '跟踪表现优秀。';
    else if (roundedScore >= 60) message += '跟踪表现一般。';
    else message += '跟踪表现欠佳，建议加强训练。';

    speak(message);
}

function speakResultsROM(romResults) {
    const count = Object.keys(romResults).length;
    const values = Object.values(romResults).map(v => Math.abs(v));
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    let message = `活动度检测完成，已采集${count}个方向，平均${avg.toFixed(0)}度。`;

    if (avg >= 40) message += '活动范围基本正常。';
    else if (avg >= 30) message += '活动范围轻度受限。';
    else message += '活动范围明显受限。';

    speak(message);
}

function speakResultsPosition(positionResults) {
    if (positionResults.length === 0) {
        speak('位置觉检测完成，暂无数据。');
        return;
    }

    const avgError = positionResults.reduce((sum, r) => sum + r.totalError, 0) / positionResults.length;
    let message = `位置觉检测完成，${positionResults.length}个方向，平均误差${avgError.toFixed(1)}度。`;

    if (avgError < 3) message += '本体感觉良好。';
    else if (avgError < 5) message += '本体感觉正常。';
    else if (avgError < 7) message += '本体感觉轻度障碍。';
    else message += '本体感觉明显障碍。';

    speak(message);
}