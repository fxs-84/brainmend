// ============================================================
// SOUND MANAGER - 音效管理器
// 使用 Web Audio API 程序化生成音效
// ============================================================

export class SoundManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.audioContext = null;
        this.masterGain = null;
        this.isInitialized = false;
    }

    /**
     * 初始化音频上下文（需要用户交互后才能调用）
     */
    init() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.audioContext.destination);
            this.isInitialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    /**
     * 确保音频上下文已恢复（处理浏览器自动播放策略）
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * 播放子弹发射音效 - 短促的"嗖"声
     */
    async playShoot() {
        if (!this.isInitialized) return;

        await this.resume();
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // 创建噪声源（用于嗖声）
        const bufferSize = ctx.sampleRate * 0.1; // 100ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // 生成噪声样本，衰减包络
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const envelope = Math.exp(-t * 30); // 快速衰减
            data[i] = (Math.random() * 2 - 1) * envelope;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = buffer;

        // 高通滤波器 - 去除低频，让声音更"嗖"
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 800;
        highpass.Q.value = 1;

        // 带通滤波器 - 增加质感
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 2000;
        bandpass.Q.value = 2;

        // 增益控制
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        // 连接：噪声 -> 滤波 -> 增益 -> 主输出
        noiseSource.connect(highpass);
        highpass.connect(bandpass);
        bandpass.connect(gainNode);
        gainNode.connect(this.masterGain);

        noiseSource.start(now);
        noiseSource.stop(now + 0.1);
    }

    /**
     * 播放敌舰爆炸音效 - 低频爆裂声
     */
    async playExplosion() {
        if (!this.isInitialized) return;

        await this.resume();
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // 低频振荡器 - 爆炸的"轰"声
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

        // 白噪声 - 爆炸的"嘶"声
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
            const t = i / noiseBuffer.length;
            const envelope = Math.exp(-t * 8);
            noiseData[i] = (Math.random() * 2 - 1) * envelope;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // 低通滤波器 - 让噪声听起来更低沉
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(500, now);
        lowpass.frequency.exponentialRampToValueAtTime(100, now + 0.4);

        // 增益控制
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.6, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        // 混音
        const mixer = ctx.createGain();
        mixer.gain.value = 0.8;

        osc.connect(oscGain);
        oscGain.connect(mixer);

        noiseSource.connect(lowpass);
        lowpass.connect(noiseGain);
        noiseGain.connect(mixer);

        mixer.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.35);
        noiseSource.start(now);
        noiseSource.stop(now + 0.5);
    }

    /**
     * 设置主音量
     * @param {number} volume - 0 到 1 之间的值
     */
    setMasterVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }
}

// 导出单例
export const soundManager = new SoundManager();
