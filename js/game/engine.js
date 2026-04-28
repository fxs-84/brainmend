// ============================================================
// GAME ENGINE - 游戏引擎核心
// ============================================================

import { InputAdapter } from './input-adapter.js';
import { CollisionDetector } from './collision.js';
import { ScoringSystem } from './scoring.js';
import { DifficultyManager } from './difficulty.js';

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

        // 自动射击冷却
        this.autoFireCooldown = 0;
        this.autoFireInterval = 0.2; // 秒

        // 玩家
        this.player = {
            x: 0.5,  // 归一化坐标 0-1
            y: 0.5,
            width: 0.04,  // 归一化尺寸
            height: 0.04,
            hitboxRadius: 0.02
        };

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
        this.reset();
    }

    /**
     * 重置游戏
     */
    reset() {
        this.gameTime = 0;
        this.player.x = 0.5;
        this.player.y = 0.5;
        this.obstacles = [];
        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.scoring.reset();
        this.difficulty.reset();
        if (this.currentScene) {
            this.currentScene.cleanup();
        }
        // 重置粒子系统
        if (this.particles) {
            this.particles.clear();
        }
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
                if (this.onGameOver) {
                    this.onGameOver(this.scoring.getFinalScore(), this.scoring.getGrade());
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
        this.update(this.deltaTime);

        // 渲染
        this.render();

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
        this.updateObstacles(dt);

        // 碰撞检测
        this.checkCollisions();

        // 更新评分
        this.scoring.calculateFrameScore(this.player, this.obstacles, dt, difficultyLevel);

        // 通知评分更新
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.scoring.getCurrentScore());
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

        this.player.x = mappedPos.x;
        this.player.y = mappedPos.y;
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
                    // 触发场景的金币收集效果
                    if (this.currentScene && this.currentScene.onCoinCollect) {
                        this.currentScene.onCoinCollect(obstacle, this);
                    }
                    continue;
                }
            }

            // 障碍物碰撞检测
            if (obstacle.type !== 'coin' && CollisionDetector.checkPlayerObstacle(this.player, obstacle, this.canvas)) {
                this.scoring.onCollision();
                this.setState(GameState.GAMEOVER);
                return;
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
                        this.scoring.onObstacleDodged();
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
                this.scoring.onCollision();
                this.setState(GameState.GAMEOVER);
                return;
            }
        }
    }

    /**
     * 渲染
     */
    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 渲染背景（包含星空和粒子）
        if (this.currentScene) {
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

        // 渲染玩家（跳过默认渲染，射击模式使用场景的renderPlayer）
        if (!this.isShootingMode) {
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

        // 分数
        ctx.fillText(`分数: ${Math.round(this.scoring.getCurrentScore())}`, 10, 25);

        // 难度等级
        ctx.fillText(`难度: ${this.difficulty.getCurrentLevel()}`, 10, 50);

        // 时间
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        ctx.fillText(`时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, 10, 75);
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
        ctx.fillText('游戏结束', width / 2, height / 2 - 60);

        ctx.fillStyle = 'white';
        ctx.font = '24px sans-serif';
        ctx.fillText(`最终分数: ${Math.round(this.scoring.getFinalScore())}`, width / 2, height / 2);

        ctx.font = '32px sans-serif';
        ctx.fillText(`评级: ${this.scoring.getGrade()}`, width / 2, height / 2 + 40);

        ctx.font = '16px sans-serif';
        ctx.fillText('按任意键返回菜单', width / 2, height / 2 + 90);
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

        // 检查是否是射击模式场景
        if (scene && scene.constructor.name === 'SceneSpaceShooting') {
            this.isShootingMode = true;
            this.player.x = 0.5;
            this.player.y = 0.95;
        } else {
            this.isShootingMode = false;
        }
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
     * 开始游戏
     */
    start() {
        this.setState(GameState.PLAYING);
    }

    /**
     * 返回菜单
     */
    goToMenu() {
        this.setState(GameState.MENU);
    }

    /**
     * 清理资源
     */
    cleanup() {
        this.stopGameLoop();
        if (this.currentScene) {
            this.currentScene.cleanup();
        }
    }
}
