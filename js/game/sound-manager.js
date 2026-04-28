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
            this.masterGain.gain.value = 0.5;
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
     * 播放子弹发射音效 - 尖锐的激光嗖声
     */
    async playShoot() {
        if (!this.isInitialized) return;

        await this.resume();
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // 创建短促的激光音效
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

        // 噪声层 - 增加质感
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
            const t = i / noiseBuffer.length;
            const envelope = Math.exp(-t * 25);
            noiseData[i] = (Math.random() * 2 - 1) * envelope;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // 高通滤波器 - 让声音更尖锐
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 400;

        // 增益包络
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.3, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.15, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

        // 混音器
        const mixer = ctx.createGain();
        mixer.gain.value = 0.8;

        osc.connect(oscGain);
        oscGain.connect(mixer);

        noiseSource.connect(highpass);
        highpass.connect(noiseGain);
        noiseGain.connect(mixer);

        mixer.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.1);
        noiseSource.start(now);
        noiseSource.stop(now + 0.1);
    }

    /**
     * 播放敌舰爆炸音效 - 饱满的爆炸声
     */
    async playExplosion() {
        if (!this.isInitialized) return;

        await this.resume();
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // 低频振荡器 - 爆炸的主体
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.4);

        // 中频振荡器 - 增加力度感
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(80, now);
        osc2.frequency.exponentialRampToValueAtTime(20, now + 0.3);

        // 白噪声层 - 爆炸的碎裂感
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
            const t = i / noiseBuffer.length;
            // 快速上升然后缓慢衰减
            const envelope = t < 0.05 ? t * 20 : Math.exp(-(t - 0.05) * 6);
            noiseData[i] = (Math.random() * 2 - 1) * envelope;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // 低通滤波器 - 让爆炸更低沉
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(800, now);
        lowpass.frequency.exponentialRampToValueAtTime(80, now + 0.5);

        // 增益包络
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.5, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.25, now);
        osc2Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        // 混音器
        const mixer = ctx.createGain();
        mixer.gain.value = 1;

        osc.connect(oscGain);
        oscGain.connect(mixer);

        osc2.connect(osc2Gain);
        osc2Gain.connect(mixer);

        noiseSource.connect(lowpass);
        lowpass.connect(noiseGain);
        noiseGain.connect(mixer);

        mixer.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.4);
        osc2.start(now);
        osc2.stop(now + 0.3);
        noiseSource.start(now);
        noiseSource.stop(now + 0.6);
    }

    /**
     * 播放金币收集音效
     */
    async playCoin() {
        if (!this.isInitialized) return;

        await this.resume();
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // 上升音阶 - 金币的叮声
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.setValueAtTime(1600, now + 0.05);
        osc.frequency.setValueAtTime(2000, now + 0.1);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.setValueAtTime(0.25, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.2);
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