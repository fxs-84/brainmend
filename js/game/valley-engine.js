// Valley Engine v6
import { SceneValley } from './scene-valley.js';
import { soundManager } from './sound-manager.js';

const S = { MENU:'menu', PLAYING:'playing', PAUSED:'paused', GAMEOVER:'gameover' };
export { S as ValleyState };

export class ValleyEngine {
    constructor(canvas) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.state = S.MENU; this.lastTime = 0; this.gameTime = 0;
        this.scene = new SceneValley();
        this.player = { x:0.5, y:0.5, tx:0.5, ty:0.5, r:0.04 };
        this.gyro = { pitch:0, yaw:0, roll:0 };
        this.fb = { active:false, t:0, d:0.3 };
        this.score = 0; this.introTimer = 3.0;
        this.speedMul = 0.35;
        this.onScoreUpdate = null; this.onGameOver = null;
        this.af = null; this._h = null;
        this.loop = this.loop.bind(this);
    }

    init() { this.scene.init(this); }

    start() {
        if (!this._h) {
            const h = (e) => { if (this.state === S.GAMEOVER) this.start(); };
            document.addEventListener('keydown', h);
            this.canvas.addEventListener('click', h);
            this.canvas.addEventListener('touchstart', h, { passive: true });
            this._h = h;
        }
        this.state = S.PLAYING; this.gameTime = 0; this.score = 0;
        this.player.x = 0.5; this.player.y = 0.5;
        this.player.tx = 0.5; this.player.ty = 0.5;
        this.introTimer = 3.0; this.speedMul = 0.35;
        this.scene.speedMul = this.speedMul;
        this.scene.updatePeakDensity(8, 0.30);
        this.lastTime = performance.now();
        if (!this.af) this.af = requestAnimationFrame(this.loop);
    }

    // 进入山谷飞行模式时调用：归零当前姿态作为起点
    onEntryZero() {
        if (window._resetGyroEMA) window._resetGyroEMA();
        this.player.x = 0.5; this.player.y = 0.5;
        this.player.tx = 0.5; this.player.ty = 0.5;
    }

    // 飞行中归零：重新建立EMA基线，当前位置成为新的中心
    rezero() {
        if (window._resetGyroEMA) window._resetGyroEMA();
    }

    startLoop() { if (!this.af) this.af = requestAnimationFrame(this.loop); }
    stopLoop() { if (this.af) { cancelAnimationFrame(this.af); this.af = null; } }

    loop(ts) {
        const dt = Math.min(0.1, (ts - this.lastTime) / 1000);
        this.lastTime = ts;
        if (this.state === S.PLAYING) { this.gameTime += dt; if (this.introTimer > 0) this.introTimer -= dt; this._update(dt); }
        this._render();
        if (this.state !== S.MENU) this.af = requestAnimationFrame(this.loop);
    }

    _update(dt) {
        // 难度递增
        this.speedMul = 0.35 + Math.min(1.5, this.gameTime / 30) * 0.15;
        this.scene.speedMul = this.speedMul;
        // 输入：pitch ±22.5° → 全屏Y（低头正值→下方，抬头负值→上方）
        //      yaw ±35° → 全屏X（左负→左，右正→右）
        // 死区：±1.5° 以内视为零点飘移，不影响位置
        const YAW_DEAD = 1.5;
        const PITCH_DEAD = 1.5;
        const applyDead = (v, d) => Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d / 35);
        const rawYaw = this.gyro.yaw;
        const rawPitch = this.gyro.pitch;
        const tx = 0.5 + (applyDead(rawYaw, YAW_DEAD) / 35) * 0.5;
        const ty = 0.5 + (applyDead(rawPitch, PITCH_DEAD) / 22.5) * 0.5;
        this.player.tx = Math.max(0, Math.min(1, tx));
        this.player.ty = Math.max(0, Math.min(1, ty));
        const sm = 0.08;
        this.player.x += (this.player.tx - this.player.x) * sm;
        this.player.y += (this.player.ty - this.player.y) * sm;
        this.scene.setPlaneTarget(this.gyro.pitch * 2, this.gyro.roll * 3);
        this.scene.setPlanePosition(this.player.x, this.player.y);
        this.scene.update(dt);
        // 碰撞
        if (this.introTimer <= 0 && this.scene.checkPlayerMountainCollision(this.player.x, this.player.y, this.player.r, this.canvas.width, this.canvas.height)) {
            this._die();
            return;
        }
        // 收集
        for (const g of this.scene.checkGatePassage(this.player.x, this.player.y, this.canvas.width, this.canvas.height)) this.score += 100;
        for (const c of this.scene.checkCoinCollect(this.player.x, this.player.y, this.canvas.width, this.canvas.height)) this.score += 25;
        this.score += 1 * dt;
        if (this.fb.active) { this.fb.t -= dt; if (this.fb.t <= 0) this.fb.active = false; }
        if (this.onScoreUpdate) this.onScoreUpdate(Math.round(this.score));
    }

    _die() {
        this.score = Math.max(0, this.score - 50);
        this.fb.active = true; this.fb.t = this.fb.d;
        soundManager.playExplosion();
        this.state = S.GAMEOVER; this.stopLoop();
        if (this.onGameOver) this.onGameOver(this.score, 'C', { time: this.gameTime });
    }

    setGyroInput(p, y, r) { this.gyro = { pitch:p, yaw:y, roll:r }; }

    _render() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        this.scene.renderBackground(ctx, w, h);
        this.scene.renderPlayer(ctx, this.player.x, this.player.y);
        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(w - 130, 8, 122, 42);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(this.score).toString(), w - 16, 36);
        ctx.fillStyle = '#0f0'; ctx.font = '10px sans-serif';
        const stars = Math.min(5, Math.floor(this.gameTime / 10) + 1);
        ctx.fillText('★'.repeat(stars) + '☆'.repeat(5-stars), w - 16, 48);
        if (this.introTimer > 0) {
            ctx.fillStyle = '#0ff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('穿光环 · 集金币 · 避山峰', w/2, 30);
        }
        // flash
        if (this.fb.active) { const a = (this.fb.t / this.fb.d) * 0.35; ctx.fillStyle = `rgba(255,30,10,${a})`; ctx.fillRect(0, 0, w, h); }
        // game over
        if (this.state === S.GAMEOVER) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#f66'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('撞山了!', w/2, h/2-35);
            ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
            ctx.fillText('得分: ' + Math.round(this.score), w/2, h/2);
            ctx.fillStyle = '#0ff'; ctx.font = '13px sans-serif';
            ctx.fillText('点击画面重新开始', w/2, h/2+35);
        }
    }

    cleanup() {
        this.stopLoop(); this.scene.cleanup();
        if (this._h) { document.removeEventListener('keydown', this._h); this.canvas.removeEventListener('click', this._h); this.canvas.removeEventListener('touchstart', this._h); this._h = null; }
    }
}
