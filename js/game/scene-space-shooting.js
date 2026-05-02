// ============================================================
// SCENE SPACE SHOOTING - 太空射击场景
// ============================================================

import { MotionMapper } from './motion-mapper.js';
import { ObstacleCoin } from './obstacle.js';
import { ParticleSystem } from './particle.js';
import { Bullet, EnemyFleet } from './bullet.js';
import { SceneBase } from './scene-base.js';
import { soundManager } from './sound-manager.js';

export class SceneSpaceShooting extends SceneBase {
    constructor() {
        super();
        this.movementAxis = 'horizontal';
        this.scrollDirection = 'left';

        this.time = 0;

        // 星系碰撞效果（保留）
        this.energyCores = [];
        this.lightRays = [];
        this.nebulae = [];
        this.starLayers = [
            { stars: [], speed: 0.015, count: 60, sizeMin: 0.0003, sizeMax: 0.0008, brightness: 0.2 },
            { stars: [], speed: 0.04, count: 40, sizeMin: 0.0008, sizeMax: 0.0015, brightness: 0.4 },
            { stars: [], speed: 0.08, count: 25, sizeMin: 0.0015, sizeMax: 0.003, brightness: 0.6 }
        ];
        this.twinkleStars = [];
        this.blazingStars = [];

        // 粒子系统
        this.particles = new ParticleSystem();

        // 游戏对象
        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];

        // 射击冷却
        this.shootCooldown = 0;
        this.shootInterval = 0.15; // 秒

        // 玩家
        this.playerY = 0.95; // 玩家在屏幕最下方

        // 颈椎训练：瞄准系统
        this.targetEnemy = null;      // 当前瞄准的敌舰
        this.alignmentTime = 0;       // 对齐持续时间
        this.alignmentThreshold = 0.02; // 对齐阈值（归一化坐标）
        this.requiredHoldTime = 0.5;  // 需要保持对齐0.5秒才能发射

        // 瞄准指示器
        this.aimIndicator = {
            x: 0.5,
            y: 0.3,
            progress: 0,  // 0-1表示瞄准进度
            active: false
        };

        // 子弹池限制
        this.maxBullets = 3;

        this.init();
    }

    init(engine) {
        super.init(engine);
        this.initEnergyCores();
        this.initLightRays();
        this.initNebulae();
        this.initStars();
        this.initTwinkleStars();
        this.initBlazingStars();
        this.particles.clear();
        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.time = 0;
    }

    initEnergyCores() {
        this.energyCores = [];
        for (let i = 0; i < 2; i++) {
            this.energyCores.push({
                x: 0.2 + Math.random() * 0.6,
                y: 0.2 + Math.random() * 0.6,
                size: 0.06 + Math.random() * 0.1,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 1.5 + Math.random() * 2,
                hue: Math.random() * 360,
                intensity: 0.4 + Math.random() * 0.4
            });
        }
    }

    initLightRays() {
        this.lightRays = [];
        const rayColors = [
            { h: 220, s: 80, l: 70 },
            { h: 280, s: 70, l: 65 },
            { h: 200, s: 75, l: 75 },
        ];

        for (let i = 0; i < 8; i++) {
            const color = rayColors[Math.floor(Math.random() * rayColors.length)];
            this.lightRays.push({
                x: Math.random(),
                y: Math.random(),
                angle: Math.random() * Math.PI * 2,
                length: 0.1 + Math.random() * 0.2,
                width: 0.015 + Math.random() * 0.02,
                color: color,
                alpha: 0.06 + Math.random() * 0.08,
                rotationSpeed: (Math.random() - 0.5) * 0.2,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 1.5 + Math.random() * 1.5
            });
        }
    }

    initNebulae() {
        this.nebulae = [];
        const nebulaColors = [
            { r: 150, g: 50, b: 200 },
            { r: 50, g: 100, b: 200 },
            { r: 200, g: 50, b: 120 },
        ];

        for (let i = 0; i < 4; i++) {
            const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            this.nebulae.push({
                x: Math.random(),
                y: Math.random(),
                radius: 0.15 + Math.random() * 0.25,
                color: color,
                alpha: 0.03 + Math.random() * 0.04,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.01,
                scaleX: 0.8 + Math.random() * 0.4,
                scaleY: 0.5 + Math.random() * 0.3
            });
        }
    }

    initStars() {
        for (const layer of this.starLayers) {
            layer.stars = [];
            for (let i = 0; i < layer.count; i++) {
                layer.stars.push({
                    x: Math.random(),
                    y: Math.random(),
                    size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
                    brightness: layer.brightness,
                    twinklePhase: Math.random() * Math.PI * 2,
                    twinkleSpeed: 0.8 + Math.random() * 1.5,
                    color: this.getStarColor(Math.random())
                });
            }
        }
    }

    initTwinkleStars() {
        this.twinkleStars = [];
        const colors = ['#FFFFFF', '#E8F4FF', '#FFE4C4', '#ADD8E6'];
        for (let i = 0; i < 15; i++) {
            this.twinkleStars.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.002 + Math.random() * 0.003,
                baseBrightness: 0.7 + Math.random() * 0.3,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 1.5 + Math.random() * 2,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
    }

    initBlazingStars() {
        this.blazingStars = [];
        const blazeColors = [
            { core: '#FFFFFF', mid: '#88CCFF', outer: '#4466FF' },
            { core: '#FFFFFF', mid: '#FFFFAA', outer: '#FFAA44' },
            { core: '#FFFFFF', mid: '#FFAACC', outer: '#FF6688' },
        ];

        for (let i = 0; i < 3; i++) {
            const colorSet = blazeColors[Math.floor(Math.random() * blazeColors.length)];
            this.blazingStars.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.003 + Math.random() * 0.003,
                baseIntensity: 0.5 + Math.random() * 0.3,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 2 + Math.random() * 2,
                colorSet: colorSet,
                rayRotation: Math.random() * Math.PI * 2,
                rayRotationSpeed: (Math.random() - 0.5) * 1
            });
        }
    }

    getStarColor(random) {
        const colors = [
            'rgba(255, 255, 255, 0.7)',
            'rgba(200, 220, 255, 0.6)',
            'rgba(255, 250, 240, 0.5)',
        ];
        return colors[Math.floor(random * colors.length)];
    }

    update(dt) {
        super.update(dt);
        this.time += dt;

        // 更新瞄准系统（颈椎训练核心）
        this.updateAimSystem(dt);

        // 更新能量核心
        for (const core of this.energyCores) {
            core.pulsePhase += core.pulseSpeed * dt;
        }

        // 更新光射线
        for (const ray of this.lightRays) {
            ray.rotation += ray.rotationSpeed * dt;
            ray.pulsePhase += ray.pulseSpeed * dt;
        }

        // 更新星云
        for (const nebula of this.nebulae) {
            nebula.rotation += nebula.rotationSpeed * dt;
        }

        // 更新星空
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                star.twinklePhase += star.twinkleSpeed * dt;
                this.moveStar(star, layer.speed * dt);
            }
        }

        // 更新闪耀星
        for (const star of this.twinkleStars) {
            star.twinklePhase += star.twinkleSpeed * dt;
            this.moveStar(star, 0.02 * dt);
        }

        // 更新炽热星
        for (const star of this.blazingStars) {
            star.pulsePhase += star.pulseSpeed * dt;
            star.rayRotation += star.rayRotationSpeed * dt;
            this.moveStar(star, 0.012 * dt);
        }

        // 更新粒子
        this.particles.update(dt);

        // 更新射击冷却
        if (this.shootCooldown > 0) {
            this.shootCooldown -= dt;
        }
    }

    moveStar(star, speed) {
        star.x -= speed;
        if (star.x < 0) { star.x = 1; star.y = Math.random(); }
    }

    // 颈椎训练：瞄准系统
    // 玩家头的位置（X轴）需要和敌舰X坐标对齐，保持0.5秒后才能发射
    updateAimSystem(dt) {
        if (!this.engine) return;

        const playerX = this.engine.player.x;
        let closestEnemy = null;
        let closestDist = Infinity;

        // 找到最近的敌舰
        for (const enemy of this.engine.enemies) {
            if (!enemy.active) continue;
            const dist = Math.abs(enemy.x - playerX);
            if (dist < closestDist && enemy.y > 0.1 && enemy.y < 0.8) {
                closestDist = dist;
                closestEnemy = enemy;
            }
        }

        this.targetEnemy = closestEnemy;

        // 检查是否对齐
        if (closestEnemy && closestDist < this.alignmentThreshold) {
            // 对齐中
            this.alignmentTime += dt;
            this.aimIndicator.active = true;
            this.aimIndicator.x = closestEnemy.x;
            this.aimIndicator.y = closestEnemy.y;
            this.aimIndicator.progress = Math.min(1, this.alignmentTime / this.requiredHoldTime);
        } else {
            // 未对齐，重置
            if (this.alignmentTime > 0 && closestDist >= this.alignmentThreshold) {
                // 从已对齐状态变为未对齐，逐渐减少进度
                this.alignmentTime = Math.max(0, this.alignmentTime - dt * 2);
            }
            this.aimIndicator.active = false;
            this.aimIndicator.progress = 0;
        }
    }

    // 检查是否可以发射（颈椎控制：对齐并保持0.5秒）
    canShoot() {
        return this.targetEnemy &&
               this.alignmentTime >= this.requiredHoldTime &&
               this.shootCooldown <= 0 &&
               this.engine.bullets.length < this.maxBullets;
    }

    // 玩家射击 - 从飞船尖端发射，必须瞄准敌舰并保持0.5秒
    playerShoot(playerX, playerY) {
        if (!this.canShoot() || !this.targetEnemy) return;

        // 从飞船尖端发射3颗子弹 - 直线向上，精确对准
        for (let i = 0; i < 3; i++) {
            const bullet = new Bullet(playerX, playerY - 0.05, {
                vx: (i - 1) * 0.02,  // 略微散开一点
                vy: -0.8,
                speed: 0.7,
                radius: 0.005,
                color: '#00D9A5',
                onFire: i === 1 ? () => soundManager.playShoot() : null
            });
            this.engine.bullets.push(bullet);
        }
        this.shootCooldown = this.shootInterval;

        // 重置对准状态
        this.alignmentTime = 0;
        this.aimIndicator.progress = 0;
    }

    trySpawnObstacle(obstacleList, difficultyConfig) {
        const timeSinceLastSpawn = this.gameTime - this.lastSpawnTime;

        if (obstacleList.length < difficultyConfig.maxObstacles &&
            timeSinceLastSpawn >= difficultyConfig.spawnInterval / 1000) {

            const rand = Math.random();

            if (rand < 0.55) {
                // 55% 敌舰
                const enemy = this.spawnEnemyFromTop(difficultyConfig);
                this.engine.enemies.push(enemy);
            } else {
                // 45% 金币
                obstacleList.push(this.spawnCoin());
            }
            this.lastSpawnTime = this.gameTime;
        }
    }

    // 生成从上方飞来的敌舰
    spawnEnemyFromTop(difficultyConfig) {
        const types = ['fighter', 'fighter', 'cruiser', 'carrier'];
        const type = types[Math.floor(Math.random() * types.length)];

        let enemy;
        const x = Math.random() * 0.6 + 0.2; // 在屏幕上方随机水平位置

        switch (type) {
            case 'fighter':
                enemy = new EnemyFleet({
                    x: x,
                    y: -0.1,
                    speedX: (Math.random() - 0.5) * 0.03,
                    speedY: 0.12 + Math.random() * 0.08,
                    radius: 0.035,
                    type: 'fighter',
                    health: 1,
                    color: '#EF4444',
                    canShoot: false,
                    moveMode: 'vertical'
                });
                break;
            case 'cruiser':
                enemy = new EnemyFleet({
                    x: x,
                    y: -0.1,
                    speedX: 0,
                    speedY: 0.08 + Math.random() * 0.05,
                    radius: 0.05,
                    type: 'cruiser',
                    health: 3,
                    color: '#DC2626',
                    canShoot: false,
                    moveMode: 'vertical'
                });
                break;
            case 'carrier':
                enemy = new EnemyFleet({
                    x: x,
                    y: -0.1,
                    speedX: 0,
                    speedY: 0.05 + Math.random() * 0.04,
                    radius: 0.07,
                    type: 'carrier',
                    health: 5,
                    color: '#B91C1C',
                    canShoot: false,
                    moveMode: 'vertical'
                });
                break;
        }
        return enemy;
    }

    // 生成金币
    spawnCoin() {
        return new ObstacleCoin({
            x: Math.random() * 0.6 + 0.2,
            y: -0.1,
            speedX: (Math.random() - 0.5) * 0.02,
            speedY: 0.12 + Math.random() * 0.10
        });
    }

    renderBackground(ctx, width, height) {
        const minDim = Math.min(width, height);

        // 深空背景
        this.renderDeepSpaceGradient(ctx, width, height);

        // 能量核心
        for (const core of this.energyCores) {
            this.renderEnergyCore(ctx, width, height, core);
        }

        // 光射线
        for (const ray of this.lightRays) {
            this.renderLightRay(ctx, width, height, ray);
        }

        // 星云
        for (const nebula of this.nebulae) {
            this.renderNebula(ctx, width, height, nebula);
        }

        // 星空
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                this.renderStar(ctx, width, height, star);
            }
        }

        // 闪耀星
        for (const star of this.twinkleStars) {
            this.renderTwinkleStar(ctx, width, height, star);
        }

        // 炽热星
        for (const star of this.blazingStars) {
            this.renderBlazingStar(ctx, width, height, star);
        }

        // 粒子
        this.particles.render(ctx);
    }

    renderDeepSpaceGradient(ctx, width, height) {
        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, '#000010');
        bg.addColorStop(0.3, '#0A0825');
        bg.addColorStop(0.6, '#080420');
        bg.addColorStop(1, '#050818');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        // 能量热点
        const hotspot = ctx.createRadialGradient(
            width * 0.7, height * 0.3, 0,
            width * 0.7, height * 0.3, width * 0.6
        );
        hotspot.addColorStop(0, 'rgba(50, 30, 80, 0.2)');
        hotspot.addColorStop(1, 'transparent');
        ctx.fillStyle = hotspot;
        ctx.fillRect(0, 0, width, height);
    }

    renderEnergyCore(ctx, width, height, core) {
        const x = core.x * width;
        const y = core.y * height;
        const baseSize = core.size * Math.min(width, height);
        const pulse = 0.7 + 0.3 * Math.sin(core.pulsePhase);
        const intensity = core.intensity * pulse;

        ctx.save();

        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 5);
        outerGlow.addColorStop(0, `hsla(${core.hue}, 80%, 70%, ${0.12 * intensity})`);
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, baseSize * 5, 0, Math.PI * 2);
        ctx.fill();

        const midGlow = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 2);
        midGlow.addColorStop(0, `hsla(${core.hue}, 90%, 80%, ${0.3 * intensity})`);
        midGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = midGlow;
        ctx.beginPath();
        ctx.arc(x, y, baseSize * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderLightRay(ctx, width, height, ray) {
        const x = ray.x * width;
        const y = ray.y * height;
        const length = ray.length * Math.min(width, height);
        const width2 = ray.width * Math.min(width, height);
        const pulse = 0.5 + 0.5 * Math.sin(ray.pulsePhase);
        const alpha = ray.alpha * pulse;
        const { h, s, l } = ray.color;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ray.angle);

        const gradient = ctx.createLinearGradient(-length, 0, length, 0);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.4, `hsla(${h}, ${s}%, ${l}%, ${alpha * 0.5})`);
        gradient.addColorStop(0.5, `hsla(${h}, ${s}%, ${l}%, ${alpha})`);
        gradient.addColorStop(0.6, `hsla(${h}, ${s}%, ${l}%, ${alpha * 0.5})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(-length, -width2 * 0.5);
        ctx.lineTo(length, 0);
        ctx.lineTo(-length, width2 * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    renderNebula(ctx, width, height, nebula) {
        const x = nebula.x * width;
        const y = nebula.y * height;
        const radius = nebula.radius * Math.min(width, height);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(nebula.rotation);
        ctx.scale(nebula.scaleX, nebula.scaleY);

        const { r, g, b } = nebula.color;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${nebula.alpha})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${nebula.alpha * 0.4})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);
        const twinkle = 0.4 + 0.6 * Math.sin(star.twinklePhase);
        const alpha = star.brightness * twinkle;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.4, size), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    renderTwinkleStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);
        const twinkle = 0.15 + 0.85 * Math.sin(star.twinklePhase);
        const alpha = star.baseBrightness * twinkle;

        ctx.save();

        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
        outerGlow.addColorStop(0, `rgba(200, 220, 255, ${alpha * 0.15})`);
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 5, 0, Math.PI * 2);
        ctx.fill();

        const midGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5);
        midGlow.addColorStop(0, star.color);
        midGlow.addColorStop(0.5, `rgba(200, 220, 255, ${alpha * 0.3})`);
        midGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = midGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderBlazingStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);
        const pulse = 0.3 + 0.7 * Math.sin(star.pulsePhase);
        const intensity = star.baseIntensity * pulse;
        const { core, mid, outer } = star.colorSet;

        ctx.save();

        const superOuter = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
        superOuter.addColorStop(0, outer.replace(')', `, ${0.08 * intensity})`));
        superOuter.addColorStop(1, 'transparent');
        ctx.fillStyle = superOuter;
        ctx.beginPath();
        ctx.arc(x, y, size * 5, 0, Math.PI * 2);
        ctx.fill();

        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5);
        outerGlow.addColorStop(0, mid.replace(')', `, ${0.25 * intensity})`));
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        const innerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.2);
        innerGlow.addColorStop(0, core);
        innerGlow.addColorStop(0.5, mid.replace(')', `, ${0.4 * intensity})`));
        innerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = innerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = intensity;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // 星芒
        const rayAlpha = 0.2 + 0.3 * pulse;
        ctx.globalAlpha = rayAlpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 0.5;
        const rayLen = size * 1.5;
        for (let i = 0; i < 4; i++) {
            const angle = star.rayRotation + (i * Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
            ctx.lineTo(x + Math.cos(angle) * rayLen, y + Math.sin(angle) * rayLen);
            ctx.stroke();
        }

        ctx.restore();
    }

    // 渲染玩家飞船
    renderPlayer(ctx, playerX, playerY) {
        const x = playerX * ctx.canvas.width;
        const y = playerY * ctx.canvas.height;
        const size = 0.05 * Math.min(ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(x, y);

        // 引擎尾焰发光
        ctx.shadowColor = '#00D9A5';
        ctx.shadowBlur = 20;

        // 主船体 - 科幻风格箭头飞船
        ctx.fillStyle = '#0a2a2a';
        ctx.strokeStyle = '#00D9A5';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size * 0.7, size * 0.5);
        ctx.lineTo(-size * 0.3, size * 0.3);
        ctx.lineTo(-size * 0.4, size * 0.7);
        ctx.lineTo(0, size * 0.4);
        ctx.lineTo(size * 0.4, size * 0.7);
        ctx.lineTo(size * 0.3, size * 0.3);
        ctx.lineTo(size * 0.7, size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 驾驶舱 - 发光玻璃
        const cockpitGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.25);
        cockpitGradient.addColorStop(0, '#88FFFF');
        cockpitGradient.addColorStop(0.5, '#00D9A5');
        cockpitGradient.addColorStop(1, '#006666');
        ctx.fillStyle = cockpitGradient;
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.2, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 机翼装饰灯
        ctx.fillStyle = '#00FFFF';
        ctx.beginPath();
        ctx.arc(-size * 0.5, size * 0.2, size * 0.05, 0, Math.PI * 2);
        ctx.arc(size * 0.5, size * 0.2, size * 0.05, 0, Math.PI * 2);
        ctx.fill();

        // 引擎火焰 - 动态
        const flameGradient = ctx.createLinearGradient(0, size * 0.4, 0, size * 1.0);
        flameGradient.addColorStop(0, '#FFFFFF');
        flameGradient.addColorStop(0.3, '#00FFFF');
        flameGradient.addColorStop(0.6, '#00D9A5');
        flameGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = flameGradient;
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, size * 0.4);
        ctx.quadraticCurveTo(-size * 0.1 + Math.random() * size * 0.05, size * 0.8, 0, size * 0.9 + Math.random() * size * 0.1);
        ctx.quadraticCurveTo(size * 0.1 - Math.random() * size * 0.05, size * 0.8, size * 0.2, size * 0.4);
        ctx.fill();

        // 瞄准指示器 - 显示瞄准进度
        if (this.aimIndicator.active && this.aimIndicator.progress > 0) {
            const aimX = this.aimIndicator.x * ctx.canvas.width;
            const aimY = this.aimIndicator.y * ctx.canvas.height;
            const progress = this.aimIndicator.progress;

            // 瞄准圈
            ctx.strokeStyle = `rgba(0, 217, 165, ${0.5 + progress * 0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(aimX, aimY, size * 0.8, 0, Math.PI * 2);
            ctx.stroke();

            // 进度环
            ctx.strokeStyle = '#00D9A5';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(aimX, aimY, size * 1.2, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.stroke();

            // 中心点
            ctx.fillStyle = '#00D9A5';
            ctx.beginPath();
            ctx.arc(aimX, aimY, size * 0.2 * progress, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    mapInputToPosition(inputPos, player) {
        // 射击模式只用X轴
        return {
            x: inputPos.x,
            y: this.playerY
        };
    }

    onCoinCollect(coin, engine) {
        this.particles.emitCoinCollect(coin.x, coin.y);
        soundManager.playCoin();
        if (engine && engine.scoring) {
            engine.scoring.onCoinCollected(100);
        }
    }

    cleanup() {
        super.cleanup();
        this.particles.clear();
        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];
    }
}
