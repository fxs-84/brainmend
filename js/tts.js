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
window.TTS_CONFIG = TTS_CONFIG;

// 可用语音列表
let cachedVoices = [];

// TTS优化：队列机制 + 防抖
let ttsQueue = [];
let lastSpokenText = '';
let lastSpokenTime = 0;
const TTS_DEBOUNCE_MS = 1500;  // 相同内容1.5秒内不重复

// ============================================================
// 音效系统 - 使用Web Audio API生成合成音效
// ============================================================
let audioContext = null;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// 爆炸音效
function playExplosionSound() {
    try {
        const ctx = initAudio();
        const now = ctx.currentTime;

        // 创建爆炸噪音
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // 低通滤波器
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.3);

        // 增益 - 减弱到0.15
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
        noise.stop(now + 0.3);
    } catch (e) {
        console.warn('Audio error:', e);
    }
}

// 射击音效
function playShootSound() {
    try {
        const ctx = initAudio();
        const now = ctx.currentTime;

        // 创建高频短促音效
        const oscillator = ctx.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.exponentialRampToValueAtTime(220, now + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05, now);  // 减弱到0.05
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start(now);
        oscillator.stop(now + 0.1);
    } catch (e) {
        console.warn('Audio error:', e);
    }
}

// 金币收集音效
function playCoinSound() {
    try {
        const ctx = initAudio();
        const now = ctx.currentTime;

        const frequencies = [523, 659, 784];  // C5, E5, G5 和弦

        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now + i * 0.05);
            gain.gain.linearRampToValueAtTime(0.06, now + i * 0.05 + 0.02);  // 减弱到0.06
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + i * 0.05);
            osc.stop(now + 0.3);
        });
    } catch (e) {
        console.warn('Audio error:', e);
    }
}

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

    const now = Date.now();
    const trimmedText = text.trim();

    // 防抖：相同内容1.5秒内不重复播报
    if (trimmedText === lastSpokenText && (now - lastSpokenTime) < TTS_DEBOUNCE_MS) {
        return;
    }

    // 如果正在播放，不取消，而是排队等待
    if (speechSynthesis.speaking) {
        // 检查队列中是否已有相同内容
        if (ttsQueue.includes(trimmedText)) {
            return;
        }
        ttsQueue.push(trimmedText);
        return;
    }

    // 执行播报
    executeSpeak(trimmedText);
}

function executeSpeak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;

    utterance.onend = () => {
        // 播报完成后，播放队列中的下一条
        processQueue();
    };

    utterance.onerror = (e) => {
        console.warn('TTS error:', e.error);
        processQueue();
    };

    lastSpokenText = text;
    lastSpokenTime = Date.now();
    speechSynthesis.speak(utterance);
}

function processQueue() {
    if (ttsQueue.length === 0) return;

    // 取出队列中的下一条（先进先出）
    const nextText = ttsQueue.shift();
    if (nextText && nextText !== lastSpokenText) {
        executeSpeak(nextText);
    } else {
        // 如果相同，继续处理队列
        processQueue();
    }
}
window.speak = speak;

/**
 * 播报语音并在完成后执行回调
 * @param {string} text - 要播报的文本
 * @param {function} callback - 播报完成后的回调
 */
function speakWithCallback(text, callback) {
    if (!TTS_CONFIG.enabled) {
        // TTS未启用，直接执行回调
        if (callback) callback();
        return;
    }

    if (!text || typeof text !== 'string') {
        if (callback) callback();
        return;
    }

    if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API not supported');
        if (callback) callback();
        return;
    }

    const trimmedText = text.trim();

    // 如果正在播放，先取消当前播放
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(trimmedText);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;

    utterance.onend = () => {
        lastSpokenText = trimmedText;
        lastSpokenTime = Date.now();
        if (callback) callback();
    };

    utterance.onerror = (e) => {
        console.warn('TTS error:', e.error);
        if (callback) callback();
    };

    lastSpokenText = trimmedText;
    lastSpokenTime = Date.now();
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

    // TTS预热：页面加载时预热语音合成器，让首次播报更快
    setTimeout(() => {
        speechSynthesis.cancel();
        const warmup = new SpeechSynthesisUtterance(' ');
        warmup.lang = 'zh-CN';
        warmup.rate = 1.0;
        warmup.volume = 0;
        warmup.onend = warmup.onerror = () => {
            // 预热完成，恢复设置
            TTS_CONFIG.enabled = localStorage.getItem('tts_enabled') === 'true';
            updateTTSButtonUI();
        };
        speechSynthesis.speak(warmup);
    }, 100);

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

// Window bridge for cross-module access (ui.js)
window.speakResults = speakResults;
window.speakResultsIntegrated = speakResults;  // alias used by ui.js
window.speakResultsCoordination = speakResultsCoordination;
window.speakResultsROM = speakResultsROM;
window.speakResultsPosition = speakResultsPosition;

export { initTTS, toggleTTS, speakWithCallback, speak };