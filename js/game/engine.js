// ============================================================
// GAME ENGINE - 游戏引擎核心
// ============================================================

import { InputAdapter } from './input-adapter.js';
import { CollisionDetector } from './collision.js';
import { ScoringSystem } from './scoring.js';
import { DifficultyManager } from './difficulty.js';
import { soundManager } from './sound-manager.js';

// 游戏状态
const GameState = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover'
};

export { GameState };

export class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // 游戏状态
        this.state = GameState.MENU;
        this.previousState = null;

        // 时间管理
        this.lastTime = 0;
        this.deltaTime = 0;
        this.gameTime = 0;  // 游戏进行时间

        // 子系统
        this.input = new InputAdapter();
        this.scoring = new ScoringSystem();
        this.difficulty = new DifficultyManager();

        // 当前场景
        this.currentScene = null;

        // 射击模式标志
        this.isShootingMode = false;

        // 生命系统（射击模式）
        this.maxHealth = 3;
        this.health = this.maxHealth;
        this.invincibleTime = 0;

        // 自动射击冷却
        this.autoFireCooldown = 0;
        this.autoFireInterval = 0.1; // 秒

        // 玩家
        this.player = {
            x: 0.5,  // 归一化坐标 0-1
            y: 0.5,
            width: 0.04,  // 归一化尺寸
            height: 0.04,
            hitboxRadius: 0.02
        };
        this.score = 0;

        // 障碍物列表
        this.obstacles = [];

        // 射击模式对象
        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];

        // 粒子系统
        this.particles = null;

        // 回调
        this.onScoreUpdate = null;
        this.onGameOver = null;
        this.onStateChange = null;

        // 动画帧ID
        this.animationFrameId = null;

        // 绑定方法
        this.gameLoop = this.gameLoop.bind(this);
    }

    /**
     * 初始化引擎
     */
    init() {
        this.input.init();
        soundManager.init();
        this.reset();
        this._bindGameOverHandler();
    }

    _bindGameOverHandler() {
        if (this._gameOverHandler) return;
        const handler = () => {
            if (this.state === GameState.GAMEOVER) {
                this.goToMenu();
            }
        };
        document.addEventListener('keydown', handler);
        this.canvas.addEventListener('click', handler);
        this.canvas.addEventListener('touchstart', handler, { passive: true });
        this._gameOverHandler = handler;
    }

    _unbindGameOverHandler() {
        if (this._gameOverHandler) {
            document.removeEventListener('keydown', this._gameOverHandler);
            this.canvas.removeEventListener('click', this._gameOverHandler);
            this.canvas.removeEventListener('touchstart', this._gameOverHandler);
            this._gameOverHandler = null;
        }
    }

    /**
     * 重置游戏
     */
    reset() {
        this.gameTime = 0;
        this.obstacles = [];
        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.scoring.reset();
        this.difficulty.reset();
        this.score = 0;
        this.health = this.maxHealth;
        this.invincibleTime = 0;
        if (this.currentScene) {
            this.currentScene.cleanup();
        }
        // 重置粒子系统
        if (this.particles) {
            this.particles.clear();
        }
    }

    rezero() {
        // 重置输入适配器：将当前陀螺仪值设为零点
        if (this.input) {
            this.input.resetGyroBaseline();
        }
        // 强制玩家回到中心
        this.player.x = 0.5;
        this.player.y = 0.5;
    }

    /**
     * 设置游戏状态
     */
    setState(newState) {
        if (this.state === newState) return;

        this.previousState = this.state;
        this.state = newState;

        if (this.onStateChange) {
            this.onStateChange(newState, this.previousState);
        }

        // 状态切换处理
        switch (newState) {
            case GameState.PLAYING:
                if (this.previousState === GameState.MENU || this.previousState === GameState.GAMEOVER) {
                    this.reset();
                    this.lastTime = performance.now();
                    this.startGameLoop();
                } else if (this.previousState === GameState.PAUSED) {
                    this.lastTime = performance.now();
                    this.startGameLoop();
                }
                break;

            case GameState.PAUSED:
                this.stopGameLoop();
                break;

            case GameState.GAMEOVER:
                this.stopGameLoop();
                // 最后一次渲染，显示游戏结束遮罩和最终分数
                this.render();
                if (this.onGameOver) {
                    let score, grade;
                    if (this.isShootingMode) {
                        score = this.score;
                        grade = this.getShootingGrade();
                    } else if (this._noddingMode) {
                        score = this.scoring.getCurrentScore();
                        grade = this.getNoddingGrade();
                    } else {
                        score = this.scoring.getFinalScore();
                        grade = this.scoring.getGrade();
                    }
                    this.onGameOver(score, grade);
                }
                break;

            case GameState.MENU:
                this.stopGameLoop();
                break;
        }
    }

    /**
     * 恢复上一个状态
     */
    resumePrevious() {
        if (this.previousState) {
            this.setState(this.previousState);
        }
    }

    /**
     * 开始游戏循环
     */
    startGameLoop() {
        if (this.animationFrameId) return;
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    /**
     * 停止游戏循环
     */
    stopGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * 游戏主循环
     */
    gameLoop(timestamp) {
        // 计算deltaTime（秒）
        this.deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // 限制最大deltaTime，防止跳帧
        if (this.deltaTime > 0.1) {
            this.deltaTime = 0.1;
        }

        // 更新游戏时间
        if (this.state === GameState.PLAYING) {
            this.gameTime += this.deltaTime;
        }

        // 更新
        try { this.update(this.deltaTime); } catch(e) { console.error('update error:', e); }

        // 渲染
        try { this.render(); } catch(e) { console.error('render error:', e); }

        // 继续循环
        if (this.state === GameState.PLAYING || this.state === GameState.PAUSED) {
            this.animationFrameId = requestAnimationFrame(this.gameLoop);
        }
    }

    /**
     * 更新游戏逻辑
     */
    update(dt) {
        if (this.state !== GameState.PLAYING) return;

        // 更新无敌时间
        if (this.invincibleTime > 0) {
            this.invincibleTime -= dt;
        }

        // 更新难度
        const difficultyLevel = this.difficulty.advance(this.gameTime);

        // 更新玩家位置
        this.updatePlayer();

        // 更新场景
        if (this.currentScene) {
            this.currentScene.update(dt);

            // 射击模式：更新子弹和敌舰
            if (this.isShootingMode) {
                this.updateBullets(dt);
                this.updateEnemies(dt);

                // 自动射击
                this.autoFireCooldown -= dt;
                if (this.autoFireCooldown <= 0) {
                    this.playerShoot();
                    this.autoFireCooldown = this.autoFireInterval;
                }

                // 玩家与敌舰碰撞检测
                this.checkPlayerEnemyCollisions();

                // 子弹与敌舰碰撞检测
                this.checkBulletEnemyCollisions();
            }
        }

        // 更新障碍物
        if (!this._noddingMode) this.updateObstacles(dt);

        // 碰撞检测
        if (this._noddingMode && this.currentScene) {
            if (this.currentScene.checkCollision(this.player.x, this.player.y, this.player.hitboxRadius)) {
                this.setState(GameState.GAMEOVER);
                return;
            }
            // 金币收集
            const collected = this.currentScene.checkCoinCollect(this.player.x, this.player.y);
            for (const c of collected) {
                this.scoring.onCoinCollected(10);
                if (this.currentScene.onCoinCollect) this.currentScene.onCoinCollect(c, this);
            }
        } else {
            this.checkCollisions();
        }

        // 更新评分（点头模式只用金币积分，射击模式用动作计分不用被动帧分）
        if (!this._noddingMode && !this.isShootingMode) {
            this.scoring.calculateFrameScore(this.player, this.obstacles, dt, this.difficulty.getCurrentLevel());
        }

        // 通知评分更新（射击模式用自己的score）
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.isShootingMode ? this.score : this.scoring.getCurrentScore());
        }
    }

    /**
     * 更新玩家位置
     */
    updatePlayer() {
        // 获取输入位置（归一化0-1）
        const inputPos = this.input.getPosition();

        // 根据运动模式映射
        const mappedPos = this.currentScene
            ? this.currentScene.mapInputToPosition(inputPos, this.player)
            : inputPos;

        // 平滑插值，避免陀螺仪噪声/抖动
        const SMOOTH = 0.45;
        this.player.x = this.player.x + (mappedPos.x - this.player.x) * SMOOTH;
        this.player.y = this.player.y + (mappedPos.y - this.player.y) * SMOOTH;
    }

    /**
     * 更新障碍物
     */
    updateObstacles(dt) {
        const difficultyConfig = this.difficulty.getCurrentConfig();

        // 生成新障碍物
        if (this.currentScene) {
            this.currentScene.trySpawnObstacle(this.obstacles, difficultyConfig);
        }

        // 更新现有障碍物
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.update(dt, difficultyConfig.speedMultiplier);

            // 移出屏幕的障碍物
            if (obstacle.isOffScreen(this.canvas.width, this.canvas.height)) {
                this.obstacles.splice(i, 1);
            }
        }
    }

    /**
     * 碰撞检测
     */
    checkCollisions() {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];

            // 金币收集检测
            if (obstacle.type === 'coin' && !obstacle.isCollected) {
                if (CollisionDetector.checkPlayerObstacle(this.player, obstacle, this.canvas)) {
                    obstacle.collect();
                    this.scoring.onCoinCollected(100);
                    if (this.isShootingMode) this.score += 50;  // 射击模式：金币+50分
                    // 触发场景的金币收集效果
                    if (this.currentScene && this.currentScene.onCoinCollect) {
                        this.currentScene.onCoinCollect(obstacle, this);
                    }
                    continue;
                }
            }

            // 加速道具收集（公路赛车：吃到 → 临时 lineSpeed × 1.5 持续 4 秒）
            if (obstacle.type === 'boost' && !obstacle.isCollected) {
                if (CollisionDetector.checkPlayerObstacle(this.player, obstacle, this.canvas)) {
                    obstacle.collect();
                    this.score += 200;
                    if (this.currentScene && this.currentScene.activateBoost) {
                        this.currentScene.activateBoost();
                    }
                    continue;
                }
            }

            // 障碍物碰撞检测
            if (obstacle.type !== 'coin' && obstacle.type !== 'boost' &&
                CollisionDetector.checkPlayerObstacle(this.player, obstacle, this.canvas)) {
                // 撞了：移除障碍物（防止连续碰撞）
                this.obstacles.splice(i, 1);
                if (this._roadMode) {
                    // 公路赛车：扣血 + 无敌帧（takeDamage 内部已处理 health=0 → GAMEOVER + onCollision）
                    this.takeDamage();
                    if (this.state === GameState.GAMEOVER) return;
                } else {
                    this.scoring.onCollision();
                    this.setState(GameState.GAMEOVER);
                    return;
                }
            }
        }
    }

    /**
     * 更新子弹
     */
    updateBullets(dt) {
        const difficultyConfig = this.difficulty.getCurrentConfig();
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].update(dt, difficultyConfig.speedMultiplier);
            if (this.bullets[i].isOffScreen(this.canvas.width, this.canvas.height)) {
                this.bullets.splice(i, 1);
            }
        }
    }

    /**
     * 更新敌舰
     */
    updateEnemies(dt) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update(dt);
            // 射击模式：敌舰到达玩家水平线 = 扣1条命
            if (this.isShootingMode && this.enemies[i].y >= this.player.y) {
                this.enemies.splice(i, 1);
                this.takeDamage();
                return;
            }
            if (this.enemies[i].isOffScreen(this.canvas.width, this.canvas.height)) {
                this.enemies.splice(i, 1);
            }
        }
    }

    /**
     * 子弹击中敌舰检测
     */
    checkBulletEnemyCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet.active) continue;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (!enemy.active) continue;

                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < enemy.radius + bullet.radius) {
                    bullet.active = false;
                    const destroyed = enemy.hit(1);

                    if (destroyed) {
                        if (this.currentScene && this.currentScene.particles) {
                            this.currentScene.particles.emitExplosion(enemy.x, enemy.y);
                        }
                        soundManager.playExplosion();
                        this.scoring.onObstacleDodged();
                        this.score += 100;  // 射击模式：击毁敌舰+100分
                        this.enemies.splice(j, 1);
                    }
                    break;
                }
            }
        }
    }

    /**
     * 检查玩家与敌舰碰撞
     */
    checkPlayerEnemyCollisions() {
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;

            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.player.hitboxRadius + enemy.radius) {
                if (this.currentScene && this.currentScene.particles) {
                    this.currentScene.particles.emitExplosion(this.player.x, this.player.y);
                }
                // 移除碰撞的敌舰
                const idx = this.enemies.indexOf(enemy);
                if (idx >= 0) this.enemies.splice(idx, 1);
                this.takeDamage();
                return;
            }
        }
    }

    /**
     * 射击模式：玩家受到伤害（-1生命，无敌1.5秒）
     */
    takeDamage() {
        if (this.invincibleTime > 0) return;  // 无敌中不受伤
        this.health--;
        this.invincibleTime = 1.5;
        // 播放爆炸效果
        if (this.currentScene && this.currentScene.particles) {
            this.currentScene.particles.emitExplosion(this.player.x, this.player.y);
        }
        soundManager.playExplosion();
        if (this.health <= 0) {
            this.scoring.onCollision();
            this.setState(GameState.GAMEOVER);
        }
    }

    /**
     * 渲染
     */
    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // 每帧彻底重置 Canvas 上下文（含 save/restore 栈 + 变换矩阵 + 所有绘制属性）
        // ctx.reset() 是解决 "画面旋转/卡死" 的关键——
        // 之前的 setTransform 只清变换矩阵，没清 save 栈，异常导致的 save/restore
        // 不平衡会让栈越堆越深，最终 ctx.save() 抛异常，画面完全卡死
        if (ctx.reset) {
            ctx.reset();
        } else {
            // 旧浏览器回退：重置宽高等价于完全重置上下文
            this.canvas.width = this.canvas.width;
        }
        ctx.clearRect(0, 0, width, height);

        // 渲染背景（包含星空和粒子）
        if (this.currentScene && this.currentScene.renderBackground) {
            this.currentScene.renderBackground(ctx, width, height);
        }

        // 渲染障碍物（跳过已收集的金币）
        for (const obstacle of this.obstacles) {
            if (obstacle.type !== 'coin' || !obstacle.isCollected) {
                obstacle.render(ctx);
            }
        }

        // 射击模式：渲染子弹和敌舰
        if (this.isShootingMode) {
            this.renderShootingMode(ctx);
        }

        // 渲染玩家
        if ((this._noddingMode || this._roadMode) && this.currentScene && this.currentScene.renderPlayer) {
            this.currentScene.renderPlayer(ctx, this.player.x, this.player.y);
        } else if (!this.isShootingMode) {
            this.renderPlayer(ctx);
        }

        // 渲染粒子效果
        if (this.currentScene && this.currentScene.particles) {
            this.currentScene.particles.render(ctx);
        }

        // 渲染HUD
        this.renderHUD(ctx);

        // 渲染状态覆盖层
        this.renderStateOverlay(ctx);
    }

    /**
     * 渲染射击模式对象
     */
    renderShootingMode(ctx) {
        // 渲染敌舰
        for (const enemy of this.enemies) {
            if (enemy.active) {
                enemy.render(ctx);
            }
        }

        // 渲染子弹
        for (const bullet of this.bullets) {
            if (bullet.active) {
                bullet.render(ctx);
            }
        }

        // 渲染敌舰子弹
        for (const bullet of this.enemyBullets) {
            if (bullet.active) {
                bullet.render(ctx);
            }
        }

        // 渲染玩家飞船（如果场景有renderPlayer方法）
        if (this.currentScene && this.currentScene.renderPlayer) {
            this.currentScene.renderPlayer(ctx, this.player.x, this.player.y);
        }
    }

    /**
     * 渲染玩家
     */
    renderPlayer(ctx) {
        const x = this.player.x * this.canvas.width;
        const y = this.player.y * this.canvas.height;
        const radius = this.player.hitboxRadius * Math.min(this.canvas.width, this.canvas.height);

        // 玩家光点
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#00D9A5';  // 绿色
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /**
     * 渲染HUD
     */
    renderHUD(ctx) {
        ctx.fillStyle = 'white';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';

        if (this.isShootingMode || this._roadMode) {
            // 射击模式：动作计分（击杀+金币），清晰直接
            ctx.fillText(`分数: ${Math.round(this.score)}`, 10, 25);
            ctx.fillText(`击毁: ${this.scoring.obstaclesDodged || 0}  金币: ${this.scoring.coinsCollected || 0}`, 10, 50);
            // 生命值显示
            let livesText = '';
            for (let i = 0; i < this.health; i++) livesText += '❤️ ';
            for (let i = this.health; i < this.maxHealth; i++) livesText += '\u{1F5A4} ';
            ctx.fillText(`生命: ${livesText}`, 10, 75);
        } else {
            const currentScore = this.scoring.getCurrentScore();
            const displayScore = isNaN(currentScore) ? 0 : Math.round(currentScore);
            ctx.fillText(`分数: ${displayScore}`, 10, 25);
            ctx.fillText(`难度: ${this.difficulty.getCurrentLevel()}`, 10, 50);
        }

        // 时间
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        const timeY = (this.isShootingMode || this._roadMode) ? 100 : 75;
        ctx.fillText(`时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, 10, timeY);

        // 公路赛车：右侧速度指示器（pitch 控速 + 加速道具加成）
        if (this._roadMode) {
            const speedMul = (this.currentScene && typeof this.currentScene.playerSpeed === 'number')
                ? this.currentScene.playerSpeed : 1.0;
            const speedPct = Math.round(speedMul * 100);
            const speedBarW = 120;
            const speedBarX = ctx.canvas.width - speedBarW - 20;
            const speedBarY = 22;
            // 背景条
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(speedBarX - 4, speedBarY - 14, speedBarW + 8, 24);
            // 速度条（按当前倍率填充）
            const fillW = Math.max(0, Math.min(speedBarW, ((speedMul - 0.4) / (1.7 - 0.4)) * speedBarW));
            const barColor = speedMul >= 1.3 ? '#FCD34D' : speedMul >= 0.9 ? '#10B981' : '#60A5FA';
            ctx.fillStyle = barColor;
            ctx.fillRect(speedBarX, speedBarY, fillW, 10);
            // 边框
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1;
            ctx.strokeRect(speedBarX, speedBarY, speedBarW, 10);
            // 文字
            ctx.fillStyle = 'white';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`⚡ ${speedPct}%`, speedBarX, speedBarY - 2);
        }
    }

    /**
     * 渲染状态覆盖层
     */
    renderStateOverlay(ctx) {
        if (this.state === GameState.MENU) {
            this.renderMenuOverlay(ctx);
        } else if (this.state === GameState.PAUSED) {
            this.renderPausedOverlay(ctx);
        } else if (this.state === GameState.GAMEOVER) {
            this.renderGameOverOverlay(ctx);
        }
    }

    /**
     * 渲染菜单覆盖层
     */
    renderMenuOverlay(ctx) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText('颈椎康复游戏', width / 2, height / 2 - 60);

        ctx.font = '18px sans-serif';
        ctx.fillText('选择场景和运动模式开始游戏', width / 2, height / 2 - 20);
    }

    /**
     * 渲染暂停覆盖层
     */
    renderPausedOverlay(ctx) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText('已暂停', width / 2, height / 2 - 20);

        ctx.font = '16px sans-serif';
        ctx.fillText('按 P 继续', width / 2, height / 2 + 20);
    }

    /**
     * 射击模式评级（基于累积分数）
     * 规则透明：击杀+100分，金币+50分
     */
    getShootingGrade() {
        const s = this.score;
        if (s >= 3000) return 'S';
        if (s >= 2000) return 'A';
        if (s >= 1000) return 'B';
        if (s >= 400)  return 'C';
        return 'D';
    }

    /**
     * 点头模式评级（基于金币数）
     */
    getNoddingGrade() {
        const c = this.scoring.coinsCollected || 0;
        if (c >= 25) return 'S';
        if (c >= 18) return 'A';
        if (c >= 10) return 'B';
        if (c >= 5)  return 'C';
        return 'D';
    }

    /**
     * 公路赛车评级（基于成功躲过的车数）
     */
    getRoadGrade() {
        const dodged = this.scoring.obstaclesDodged || 0;
        let grade;
        if (dodged >= 40) grade = 'S';
        else if (dodged >= 25) grade = 'A';
        else if (dodged >= 15) grade = 'B';
        else if (dodged >= 8)  grade = 'C';
        else grade = 'D';
        return { grade, dodged, label: this.getGradeLabel(grade) };
    }

    getGradeLabel(g) {
        return { S: '🏆 车神', A: '优秀', B: '良好', C: '及格', D: '继续加油' }[g] || '继续加油';
    }

    /**
     * 渲染游戏结束覆盖层
     */
    renderGameOverOverlay(ctx) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#EF4444';
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('游戏结束', width / 2, height / 2 - 100);

        let rawScore, grade, gradeDetail;
        if (this.isShootingMode) {
            rawScore = this.score;
            grade = this.getShootingGrade();
        } else if (this._noddingMode) {
            rawScore = this.scoring.getCurrentScore();
            grade = this.getNoddingGrade();
        } else if (this._roadMode) {
            rawScore = this.scoring.getCurrentScore();
            gradeDetail = this.getRoadGrade();
            grade = gradeDetail.grade;
        } else {
            rawScore = this.scoring.getFinalScore();
            grade = this.scoring.getGrade();
        }
        const displayScore = isNaN(rawScore) ? 0 : Math.round(rawScore);

        ctx.fillStyle = 'white';
        ctx.font = '24px sans-serif';
        ctx.fillText(`最终分数: ${displayScore}`, width / 2, height / 2 - 40);

        // 评级颜色
        const gradeColors = { S: '#FFD700', A: '#00D9A5', B: '#3B82F6', C: '#F59E0B', D: '#9CA3AF' };
        ctx.fillStyle = gradeColors[grade] || 'white';
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText(`评级: ${grade}`, width / 2, height / 2 + 15);

        // 统计
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#9CA3AF';
        const destroyed = this.scoring.obstaclesDodged || 0;
        const coins = this.scoring.coinsCollected || 0;
        const timeSec = Math.floor(this.gameTime);
        if (this._noddingMode) {
            ctx.fillText(`金币: ${coins}  存活: ${timeSec}秒`, width / 2, height / 2 + 50);
        } else if (this._roadMode) {
            ctx.fillText(`躲避车辆: ${destroyed}  存活: ${timeSec}秒`, width / 2, height / 2 + 50);
        } else {
            ctx.fillText(`击毁: ${destroyed}  金币: ${coins}  存活: ${timeSec}秒`, width / 2, height / 2 + 50);
        }

        // 积分规则说明
        if (this.isShootingMode) {
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#6B7280';
            ctx.fillText('积分规则: 击杀+100分  金币+50分 | S≥3000 A≥2000 B≥1000 C≥400', width / 2, height / 2 + 75);
        } else if (this._noddingMode) {
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#6B7280';
            ctx.fillText('积分规则: 金币+10分 | S≥25 A≥18 B≥10 C≥5 金币', width / 2, height / 2 + 75);
        }

        ctx.font = '16px sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText('按任意键返回菜单', width / 2, height / 2 + 105);
    }

    /**
     * 设置场景
     */
    setScene(scene) {
        if (this.currentScene) {
            this.currentScene.cleanup();
        }
        this.currentScene = scene;
        this.currentScene.init(this);

        // 通过 sceneType 属性识别场景（不能用 constructor.name，生产构建会混淆类名）
        if (scene && scene.sceneType === 'shooting') {
            this.isShootingMode = true;
            this._roadMode = false;
            this.player.x = 0.5;
            this.player.y = 0.95;
        } else if (scene && scene.sceneType === 'road') {
            this.isShootingMode = false;
            this._roadMode = true;
            // 玩家固定屏幕底部
            this.player.x = 0.5;
            this.player.y = 0.85;
        } else {
            this.isShootingMode = false;
            this._roadMode = false;
        }

        // 点头/隧道/公路模式：禁用全局陀螺仪EMA，避免自动回中
        window._noGyroEMA = !!(scene && (scene.sceneType === 'nodding' || scene.sceneType === 'tunnel' || scene.sceneType === 'road'));
    }

    /**
     * 玩家射击
     */
    playerShoot() {
        if (this.isShootingMode && this.currentScene && this.currentScene.playerShoot) {
            this.currentScene.playerShoot(this.player.x, this.player.y);
        }
    }

    /**
     * 设置运动模式
     */
    setMotionMode(mode) {
        this.input.setMotionMode(mode);
    }

    /**
     * 暂停游戏
     */
    pause() {
        if (this.state === GameState.PLAYING) {
            this.setState(GameState.PAUSED);
        }
    }

    /**
     * 继续游戏
     */
    resume() {
        if (this.state === GameState.PAUSED) {
            this.setState(GameState.PLAYING);
        }
    }

    /**
     * 开始游戏（强制重启，绕过 setState 的同状态检查）
     */
    start() {
        this.state = GameState.PLAYING;
        this.previousState = GameState.MENU;
        this.reset();
        this.lastTime = performance.now();
        this.startGameLoop();
    }

    /**
     * 返回菜单
     */
    goToMenu() {
        this.setState(GameState.MENU);
        // 显示游戏选择面板
        const panel = document.getElementById('game-select-panel');
        if (panel) panel.style.display = 'block';
    }

    /**
     * 清理资源
     */
    cleanup() {
        this.stopGameLoop();
        this._unbindGameOverHandler();
        if (this.currentScene) {
            this.currentScene.cleanup();
        }
        this.state = GameState.MENU;
        this.currentScene = null;
        this.isShootingMode = false;
        this._noddingMode = false;
        this._roadMode = false;
        window._noGyroEMA = false;
    }
}
