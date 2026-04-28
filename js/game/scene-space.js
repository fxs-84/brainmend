// ============================================================
// SCENE SPACE - 太空场景 - 增强版
// ============================================================

import { MotionMapper } from './motion-mapper.js';
import { ObstacleMeteor } from './obstacle.js';
import { ObstacleCoin } from './obstacle.js';
import { ObstacleGate } from './obstacle.js';
import { ObstacleSpiral } from './obstacle.js';
import { SceneBase } from './scene-base.js';
import { ParticleSystem } from './particle.js';

export class SceneSpace extends SceneBase {
    constructor() {
        super();
        this.movementAxis = 'free';
        this.scrollDirection = 'down';

        // 多层星空系统
        this.starLayers = [
            { stars: [], speed: 0.02, count: 50, sizeMin: 0.0005, sizeMax: 0.001, brightness: 0.3 },
            { stars: [], speed: 0.05, count: 30, sizeMin: 0.001, sizeMax: 0.002, brightness: 0.5 },
            { stars: [], speed: 0.1, count: 20, sizeMin: 0.002, sizeMax: 0.004, brightness: 0.8 }
        ];

        // 闪耀效果
        this.twinkleStars = [];  // 专门做闪烁效果的大星星
        this.time = 0;

        // 粒子系统
        this.particles = new ParticleSystem();

        // 金币生成
        this.coinSpawnTimer = 0;
        this.coinSpawnInterval = 2;  // 每2秒生成金币

        // 初始化星星
        this.initStars();
    }

    init(engine) {
        super.init(engine);
        this.initStars();
        this.particles.clear();
    }

    initStars() {
        // 初始化多层星空
        for (const layer of this.starLayers) {
            layer.stars = [];
            for (let i = 0; i < layer.count; i++) {
                layer.stars.push({
                    x: Math.random(),
                    y: Math.random(),
                    size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
                    brightness: layer.brightness,
                    twinklePhase: Math.random() * Math.PI * 2,
                    twinkleSpeed: 2 + Math.random() * 3,
                    color: this.getStarColor(Math.random())
                });
            }
        }

        // 初始化闪耀星星（大颗闪烁的）
        this.twinkleStars = [];
        for (let i = 0; i < 15; i++) {
            this.twinkleStars.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.003 + Math.random() * 0.003,
                baseBrightness: 0.6 + Math.random() * 0.4,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 3 + Math.random() * 4,
                color: this.getStarColor(Math.random(), true)
            });
        }
    }

    getStarColor(random, isBright = false) {
        // 星星颜色变化 - 蓝色、白色、淡黄色
        if (isBright) {
            const colors = ['#FFFFFF', '#FFE4B5', '#ADD8E6', '#FFB6C1'];
            return colors[Math.floor(random * colors.length)];
        }
        const colors = [
            `rgba(255, 255, 255, 0.6)`,
            `rgba(200, 220, 255, 0.5)`,
            `rgba(255, 250, 240, 0.4)`,
            `rgba(173, 216, 230, 0.3)`
        ];
        return colors[Math.floor(random * colors.length)];
    }

    generateStars() {
        // 为了兼容性保留
        this.initStars();
    }

    update(dt) {
        super.update(dt);
        this.time += dt;

        // 更新多层星空
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                star.twinklePhase += star.twinkleSpeed * dt;
                this.moveStar(star, layer.speed * dt);
            }
        }

        // 更新闪耀星星
        for (const star of this.twinkleStars) {
            star.twinklePhase += star.twinkleSpeed * dt;
            this.moveStar(star, 0.03 * dt);
        }

        // 更新粒子系统
        this.particles.update(dt);
    }

    moveStar(star, speed) {
        switch (this.scrollDirection) {
            case 'left':
                star.x -= speed;
                if (star.x < 0) { star.x = 1; star.y = Math.random(); }
                break;
            case 'right':
                star.x += speed;
                if (star.x > 1) { star.x = 0; star.y = Math.random(); }
                break;
            case 'up':
                star.y -= speed;
                if (star.y < 0) { star.y = 1; star.x = Math.random(); }
                break;
            case 'down':
            default:
                star.y += speed;
                if (star.y > 1) { star.y = 0; star.x = Math.random(); }
                break;
        }
    }

    renderBackground(ctx, width, height) {
        // 深空渐变背景
        const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#0A0A1A');
        bgGradient.addColorStop(0.5, '#0F172A');
        bgGradient.addColorStop(1, '#1A1F3A');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);

        // 渲染远景星空层（最暗、最慢）
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                this.renderStar(ctx, width, height, star, layer.speed);
            }
        }

        // 渲染闪耀星星（最亮、最大）
        for (const star of this.twinkleStars) {
            this.renderTwinkleStar(ctx, width, height, star);
        }

        // 渲染粒子
        this.particles.render(ctx);
    }

    renderStar(ctx, width, height, star, speed) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);

        // 闪烁效果
        const twinkle = 0.5 + 0.5 * Math.sin(star.twinklePhase);
        const alpha = star.brightness * twinkle;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // 大星星添加光晕
        if (size > 1.5) {
            ctx.globalAlpha = alpha * 0.3;
            ctx.beginPath();
            ctx.arc(x, y, size * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    renderTwinkleStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);

        // 强烈闪烁
        const twinkle = 0.3 + 0.7 * Math.sin(star.twinklePhase);
        const alpha = star.baseBrightness * twinkle;

        ctx.save();

        // 外层光晕
        ctx.globalAlpha = alpha * 0.4;
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
        glowGradient.addColorStop(0, star.color);
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(x, y, size * 4, 0, Math.PI * 2);
        ctx.fill();

        // 核心
        ctx.globalAlpha = alpha;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // 十字闪光
        if (twinkle > 0.8) {
            ctx.globalAlpha = (twinkle - 0.8) * 5 * alpha;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            const sparkleSize = size * 3;
            ctx.beginPath();
            ctx.moveTo(x - sparkleSize, y);
            ctx.lineTo(x + sparkleSize, y);
            ctx.moveTo(x, y - sparkleSize);
            ctx.lineTo(x, y + sparkleSize);
            ctx.stroke();
        }

        ctx.restore();
    }

    spawnObstacle(difficultyConfig) {
        const types = difficultyConfig.types || ['small', 'medium', 'large', 'fast'];
        const type = types[Math.floor(Math.random() * types.length)];
        const sizeMap = {
            'small': 'small',
            'medium': 'medium',
            'large': 'large',
            'fast': 'medium',
            'random': ['small', 'medium', 'large'][Math.floor(Math.random() * 3)]
        };

        let x, y, speedX, speedY;

        switch (this.scrollDirection) {
            case 'left':
                x = 1.1;
                y = Math.random() * 0.7 + 0.15;
                speedX = -(0.1 + Math.random() * 0.1);
                speedY = (Math.random() - 0.5) * 0.03;
                break;
            case 'right':
                x = -0.1;
                y = Math.random() * 0.7 + 0.15;
                speedX = 0.1 + Math.random() * 0.1;
                speedY = (Math.random() - 0.5) * 0.03;
                break;
            case 'up':
                x = Math.random() * 0.7 + 0.15;
                y = 1.1;
                speedX = (Math.random() - 0.5) * 0.03;
                speedY = -(0.1 + Math.random() * 0.1);
                break;
            case 'down':
            default:
                x = Math.random() * 0.7 + 0.15;
                y = -0.1;
                speedX = (Math.random() - 0.5) * 0.05;
                speedY = 0.1 + Math.random() * 0.05;
                break;
        }

        // 根据难度生成不同障碍物
        const rand = Math.random();
        if (rand < 0.6) {
            // 60% 概率生成陨石
            return new ObstacleMeteor({
                size: sizeMap[type] || 'medium',
                x: x,
                y: y,
                speedX: speedX,
                speedY: speedY
            });
        } else if (rand < 0.8) {
            // 20% 概率生成金币
            return new ObstacleCoin({
                x: Math.random() * 0.6 + 0.2,
                y: -0.1,
                speedX: (Math.random() - 0.5) * 0.02,
                speedY: 0.08 + Math.random() * 0.04
            });
        } else {
            // 20% 概率生成特殊障碍物
            if (Math.random() < 0.5) {
                return new ObstacleGate({
                    speedX: speedX * 0.8
                });
            } else {
                return new ObstacleSpiral({
                    speedX: speedX * 1.2
                });
            }
        }
    }

    // 金币收集回调
    onCoinCollect(coin, engine) {
        // 触发粒子效果
        this.particles.emitCoinCollect(coin.x, coin.y);
        // 增加分数
        if (engine && engine.scoring) {
            engine.scoring.onCoinCollected(100);
        }
    }

    mapInputToPosition(inputPos, player) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }

    cleanup() {
        super.cleanup();
        this.particles.clear();
    }
}
