// SpaceEngine - 3D太空飞行游戏引擎
import { SceneSpace3D } from './scene-space-3d.js';
import { soundManager } from './sound-manager.js';
import { Bullet } from './bullet.js';

const S = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
export { S as SpaceState };

export class SpaceEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = S.MENU;
        this.lastTime = 0;
        this.gameTime = 0;
        this.scene = new SceneSpace3D();
        this.player = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, r: 0.04 };
        this.gyro = { pitch: 0, yaw: 0, roll: 0 };
        this.fb = { active: false, t: 0, d: 0.3 };
        this.score = 0;
        this.introTimer = 3.0;
        this.speedMul = 0.35;
        this.onScoreUpdate = null;
        this.onGameOver = null;
        this.af = null;
        this._h = null;
        this.invincibleTimer = 0;
        this.bullets = [];
        this.enemies = [];
        this.shootCooldown = 0;
        this.loop = this.loop.bind(this);
    }

    init() { this.scene.init(this); }

    start() {
        console.log('SpaceEngine.start() called, state before:', this.state);
        if (!this._h) {
            const h = (e) => {
                if (this.state === S.GAMEOVER && this._deathTime && this.gameTime - this._deathTime > 2) this.start();
            };
            const shootH = (e) => {
                if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyF') {
                    e.preventDefault();
                    this._shoot();
                }
            };
            const clickShoot = (e) => {
                if (this.state === S.PLAYING && this.introTimer <= 0) this._shoot();
                if (this.state === S.GAMEOVER && this._deathTime && this.gameTime - this._deathTime > 2) this.start();
            };
            document.addEventListener('keydown', h);
            document.addEventListener('keydown', shootH);
            this.canvas.addEventListener('click', clickShoot);
            this.canvas.addEventListener('touchstart', clickShoot, { passive: true });
            this._h = h;
            this._shootH = shootH;
            this._clickH = clickShoot;
        }
        soundManager.init();
        soundManager.startEngineHum();
        this.state = S.PLAYING;
        this.gameTime = 0;
        this.score = 0;
        this.player.x = 0.5;
        this.player.y = 0.5;
        this.player.tx = 0.5;
        this.player.ty = 0.5;
        this.introTimer = 3.0;
        this.speedMul = 3.0;
        this.invincibleTimer = 0;
        this.bullets = [];
        this.enemies = [];
        this.shootCooldown = 0;
        this.enemySpawnTimer = 1.5;
        this.scene.speedMul = this.speedMul;
        this.scene.updateDifficulty(0);
        this.lastTime = performance.now();
        console.log('SpaceEngine starting, speedMul:', this.speedMul);
        if (!this.af) this.af = requestAnimationFrame(this.loop);
    }

    onEntryZero() {
        if (window._resetGyroEMA) window._resetGyroEMA();
        this.player.x = 0.5;
        this.player.y = 0.5;
        this.player.tx = 0.5;
        this.player.ty = 0.5;
    }

    rezero() {
        if (window._resetGyroEMA) window._resetGyroEMA();
        this.onEntryZero();
    }

    startLoop() { if (!this.af) this.af = requestAnimationFrame(this.loop); }
    stopLoop() { if (this.af) { cancelAnimationFrame(this.af); this.af = null; } }

    loop(ts) {
        const dt = Math.min(0.1, (ts - this.lastTime) / 1000);
        this.lastTime = ts;
        if (this.state === S.PLAYING) {
            this.gameTime += dt;
            if (this.introTimer > 0) this.introTimer -= dt;
            if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
            this._update(dt);
        }
        this._render();
        if (this.state !== S.MENU && this.state !== S.GAMEOVER) {
            this.af = requestAnimationFrame(this.loop);
        }
    }

    _update(dt) {
        // 难度递增（保持较高速度以体现飞行感）
        this.speedMul = 2.5 + Math.min(2, this.gameTime / 30) * 0.3;
        this.scene.speedMul = this.speedMul;
        this.scene.updateDifficulty(Math.min(1, this.gameTime / 40));

        // 死区过滤 + 输入映射
        const YAW_DEAD = 1.5;
        const PITCH_DEAD = 1.5;
        const applyDead = (v, d) => Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d / 35);

        const rawYaw = this.gyro.yaw;
        const rawPitch = this.gyro.pitch;
        const rawRoll = this.gyro.roll;

        const tx = 0.5 + (applyDead(rawYaw, YAW_DEAD) / 35) * 0.5;
        const ty = 0.5 + (applyDead(rawPitch, PITCH_DEAD) / 22.5) * 0.5;

        this.player.tx = Math.max(0, Math.min(1, tx));
        this.player.ty = Math.max(0, Math.min(1, ty));

        // 平滑跟随
        const sm = 0.08;
        this.player.x += (this.player.tx - this.player.x) * sm;
        this.player.y += (this.player.ty - this.player.y) * sm;

        // Roll 横向漂移（极端 roll 时触发）
        if (Math.abs(rawRoll) > 20) {
            const drift = rawRoll * 0.0008;
            this.player.x = Math.max(0, Math.min(1, this.player.x + drift));
        }

        // 场景更新
        this.scene.setPlaneTarget(this.gyro.pitch * 2, this.gyro.roll * 3);
        this.scene.setPlanePosition(this.player.x, this.player.y);
        this.scene.update(dt);

        // 碰撞检测（Roll 影响碰撞箱大小）
        const baseR = this.player.r;
        const rollFactor = 1 + Math.abs(rawRoll) / 25 * 0.4;
        const effectiveR = baseR * rollFactor;

        if (this.introTimer <= 0 && this.invincibleTimer <= 0) {
            if (this.scene.checkObstacleCollision(this.player.x, this.player.y, effectiveR, this.canvas.width, this.canvas.height)) {
                this._hit();
                return;
            }
                    }

        // 收集
        for (const g of this.scene.checkGatePassage(this.player.x, this.player.y, this.canvas.width, this.canvas.height)) this.score += 100;
        for (const s of this.scene.checkStarCollect(this.player.x, this.player.y, this.canvas.width, this.canvas.height)) this.score += 25;
        for (const o of this.scene.checkOrbCollect(this.player.x, this.player.y, this.canvas.width, this.canvas.height)) this.score += 50;
        this.score += 1 * dt;

        if (this.fb.active) { this.fb.t -= dt; if (this.fb.t <= 0) this.fb.active = false; }

        // 自动射击 - 子弹方向随滚转
        this.shootCooldown -= dt;
        if (this.shootCooldown <= 0 && this.introTimer <= 0 && this.state === S.PLAYING) {
            this.shootCooldown = 0.10;
            const rollRad = this.gyro.roll * Math.PI / 180;
            const vx = -Math.sin(rollRad) * 0.6;  // 滚转影响水平方向
            const vy = -0.7;
            this.bullets.push(new Bullet(this.player.x, this.player.y - 0.04, {
                vx, vy, speed: 0.8, radius: 0.004, color: '#00ffcc',
                onFire: () => soundManager.playShoot()
            }));
        }

        // 子弹更新
        for (let b = this.bullets.length - 1; b >= 0; b--) {
            const bl = this.bullets[b];
            bl.update(dt, this.speedMul);
            if (!bl.active) this.bullets.splice(b, 1);
        }

        // 敌舰管理（2D屏幕坐标，从上向下飞）
        if (this.introTimer <= 0) {
            this.enemySpawnTimer -= dt;
            const maxEnemies = 3 + Math.floor(this.gameTime / 15);
            if (this.enemySpawnTimer <= 0 && this.enemies.length < maxEnemies) {
                this.enemySpawnTimer = 1.0;
                this.enemies.push({
                    x: 0.1 + Math.random() * 0.8,
                    y: -0.05,
                    hp: 1 + Math.floor(this.gameTime / 40),
                    speed: 0.12 + Math.random() * 0.06,
                    size: 0.08
                });
            }
        }
        for (let e = this.enemies.length - 1; e >= 0; e--) {
            const en = this.enemies[e];
            en.y += en.speed * dt;
            if (en.y > 1.1) {
                this.enemies.splice(e, 1);
                continue;
            }
            // 敌舰碰撞玩家
            if (this.introTimer <= 0 && this.invincibleTimer <= 0) {
                const dx = this.player.x - en.x;
                const dy = this.player.y - en.y;
                if (dx*dx + dy*dy < (this.player.r + en.size * 0.6) * (this.player.r + en.size * 0.6)) {
                    this._hit();
                    this.enemies.splice(e, 1);
                    continue;
                }
            }
            // 子弹击中敌舰
            for (let b = this.bullets.length - 1; b >= 0; b--) {
                const bl = this.bullets[b];
                const dx = bl.x - en.x;
                const dy = bl.y - en.y;
                if (Math.abs(dx) < 0.06 && Math.abs(dy) < 0.06) {
                    en.hp--;
                    this.bullets.splice(b, 1);
                    if (en.hp <= 0) {
                        this.score += 200;
                        soundManager.playExplosion();
                        this.enemies.splice(e, 1);
                        break;
                    } else {
                        soundManager.playHit();
                    }
                }
            }
        }

        this.scene.enemies = this.enemies;
        this.scene.bullets = this.bullets;

        if (this.onScoreUpdate) this.onScoreUpdate(Math.round(this.score));
    }

    _hit() {
        this.score = Math.max(0, this.score - 50);
        this.fb.active = true;
        this.fb.t = this.fb.d;
        this.invincibleTimer = 1.0;
        soundManager.playExplosion();
        if (this.onGameOver) this.onGameOver(this.score, 'C', { time: this.gameTime });
        this.state = S.GAMEOVER;
        this._deathTime = this.gameTime;
        this.stopLoop();
    }

    setGyroInput(p, y, r) { this.gyro = { pitch: p, yaw: y, roll: r }; }

    _shoot() {
        this.shootCooldown = 0.10;
        this.bullets.push(new Bullet(this.player.x, this.player.y - 0.04, {
            vx: 0, vy: -0.7, speed: 0.8, radius: 0.004, color: '#00ffcc',
            onFire: () => soundManager.playShoot()
        }));
    }

    _render() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        this.scene.renderBackground(ctx, w, h);
        this.scene.renderPlayer(ctx, this.player.x, this.player.y, this.gyro.roll);

        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(w - 130, 8, 122, 42);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(this.score).toString(), w - 16, 36);
        ctx.fillStyle = '#0f0'; ctx.font = '10px sans-serif';
        const stars = Math.min(5, Math.floor(this.gameTime / 10) + 1);
        ctx.fillText('★'.repeat(stars) + '☆'.repeat(5 - stars), w - 16, 48);

        if (this.introTimer > 0) {
            ctx.fillStyle = '#0ff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('避岩石 · 收集水晶 · 穿传送门', w / 2, 30);
        }

        // flash
        if (this.fb.active) {
            const a = (this.fb.t / this.fb.d) * 0.35;
            ctx.fillStyle = `rgba(255,30,10,${a})`;
            ctx.fillRect(0, 0, w, h);
        }

        // 无敌闪烁
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 10) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(0, 0, w, h);
        }

        // game over
        if (this.state === S.GAMEOVER && this.invincibleTimer <= 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#f66'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('撞毁了!', w / 2, h / 2 - 35);
            ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
            ctx.fillText('得分: ' + Math.round(this.score), w / 2, h / 2);
            ctx.fillStyle = '#0ff'; ctx.font = '13px sans-serif';
            ctx.fillText('点击画面重新开始', w / 2, h / 2 + 35);
        }
    }

    cleanup() {
        this.stopLoop();
        this.scene.cleanup();
        soundManager.stopEngineHum();
        if (this._h) {
            document.removeEventListener('keydown', this._h);
            document.removeEventListener('keydown', this._shootH);
            this._h = null;
            this._shootH = null;
        }
        if (this._clickH) {
            this.canvas.removeEventListener('click', this._clickH);
            this.canvas.removeEventListener('touchstart', this._clickH);
            this._clickH = null;
        }
    }
}