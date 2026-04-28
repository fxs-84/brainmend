// ============================================================
// SCENE SPACE - 太空场景 - 深空增强版
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

        this.time = 0;

        // 星云/星团系统
        this.nebulae = [];
        this.distantGalaxies = [];
        this.cosmicDust = [];

        // 多层星空系统
        this.starLayers = [
            { stars: [], speed: 0.015, count: 80, sizeMin: 0.0003, sizeMax: 0.0008, brightness: 0.2 },
            { stars: [], speed: 0.04, count: 50, sizeMin: 0.0008, sizeMax: 0.0015, brightness: 0.4 },
            { stars: [], speed: 0.08, count: 30, sizeMin: 0.0015, sizeMax: 0.003, brightness: 0.7 }
        ];

        // 闪耀星星
        this.twinkleStars = [];
        this.shootingStars = [];

        // 粒子系统
        this.particles = new ParticleSystem();

        // 初始化
        this.initNebulae();
        this.initGalaxies();
        this.initStars();
        this.initCosmicDust();
        this.initTwinkleStars();
    }

    init(engine) {
        super.init(engine);
        this.nebulae = [];
        this.distantGalaxies = [];
        this.cosmicDust = [];
        this.shootingStars = [];
        this.initNebulae();
        this.initGalaxies();
        this.initStars();
        this.initCosmicDust();
        this.initTwinkleStars();
        this.particles.clear();
    }

    // 初始化星云
    initNebulae() {
        this.nebulae = [];
        const nebulaColors = [
            { r: 120, g: 60, b: 180 },   // 紫色
            { r: 60, g: 80, b: 180 },    // 蓝色
            { r: 180, g: 60, b: 100 },   // 红色
            { r: 60, g: 120, b: 180 },   // 青色
            { r: 180, g: 100, b: 60 },   // 橙色
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
                rotationSpeed: (Math.random() - 0.5) * 0.02
            });
        }
    }

    // 初始化远距离星系
    initGalaxies() {
        this.distantGalaxies = [];
        for (let i = 0; i < 8; i++) {
            this.distantGalaxies.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.01 + Math.random() * 0.02,
                brightness: 0.1 + Math.random() * 0.15,
                hue: Math.random() * 360
            });
        }
    }

    // 初始化宇宙尘埃
    initCosmicDust() {
        this.cosmicDust = [];
        for (let i = 0; i < 60; i++) {
            this.cosmicDust.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.0002 + Math.random() * 0.0003,
                alpha: 0.05 + Math.random() * 0.1,
                speed: 0.005 + Math.random() * 0.01
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
                    twinkleSpeed: 1 + Math.random() * 2,
                    color: this.getStarColor(Math.random())
                });
            }
        }
    }

    initTwinkleStars() {
        this.twinkleStars = [];
        const colors = ['#FFFFFF', '#E8F4FF', '#FFE4C4', '#ADD8E6', '#FFCBA4', '#F0F8FF'];
        for (let i = 0; i < 20; i++) {
            this.twinkleStars.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.002 + Math.random() * 0.004,
                baseBrightness: 0.7 + Math.random() * 0.3,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 2 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                // 光晕颜色
                glowColor: colors[Math.floor(Math.random() * colors.length)]
            });
        }
    }

    getStarColor(random, isBright = false) {
        if (isBright) {
            const colors = ['#FFFFFF', '#E8F4FF', '#FFE4B5', '#ADD8E6', '#FFB6C1'];
            return colors[Math.floor(random * colors.length)];
        }
        const colors = [
            'rgba(255, 255, 255, 0.7)',
            'rgba(200, 220, 255, 0.6)',
            'rgba(255, 250, 240, 0.5)',
            'rgba(180, 210, 255, 0.4)',
            'rgba(255, 240, 250, 0.3)'
        ];
        return colors[Math.floor(random * colors.length)];
    }

    update(dt) {
        super.update(dt);
        this.time += dt;

        // 更新星云旋转
        for (const nebula of this.nebulae) {
            nebula.rotation += nebula.rotationSpeed * dt;
        }

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
            this.moveStar(star, 0.025 * dt);
        }

        // 更新宇宙尘埃
        for (const dust of this.cosmicDust) {
            this.moveStar(dust, dust.speed * dt);
        }

        // 更新粒子系统
        this.particles.update(dt);

        // 偶尔生成流星
        if (Math.random() < 0.002) {
            this.spawnShootingStar();
        }

        // 更新流星
        for (let i = this.shootingStars.length - 1; i >= 0; i--) {
            const star = this.shootingStars[i];
            star.x += star.vx * dt;
            star.y += star.vy * dt;
            star.life -= dt;
            if (star.life <= 0) {
                this.shootingStars.splice(i, 1);
            }
        }
    }

    spawnShootingStar() {
        this.shootingStars.push({
            x: Math.random() * 0.3 + 0.1,
            y: Math.random() * 0.2,
            vx: 0.3 + Math.random() * 0.2,
            vy: 0.4 + Math.random() * 0.3,
            length: 0.05 + Math.random() * 0.1,
            life: 0.8 + Math.random() * 0.4,
            maxLife: 1.2
        });
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
        const minDim = Math.min(width, height);

        // 深空渐变背景 - 多层
        this.renderDeepSpaceGradient(ctx, width, height);

        // 渲染星云
        for (const nebula of this.nebulae) {
            this.renderNebula(ctx, width, height, nebula);
        }

        // 渲染远距离星系
        for (const galaxy of this.distantGalaxies) {
            this.renderGalaxy(ctx, width, height, galaxy);
        }

        // 渲染宇宙尘埃
        for (const dust of this.cosmicDust) {
            this.renderDust(ctx, width, height, dust);
        }

        // 渲染多层星空
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                this.renderStar(ctx, width, height, star);
            }
        }

        // 渲染闪耀星星
        for (const star of this.twinkleStars) {
            this.renderTwinkleStar(ctx, width, height, star);
        }

        // 渲染流星
        for (const star of this.shootingStars) {
            this.renderShootingStar(ctx, width, height, star);
        }

        // 渲染粒子
        this.particles.render(ctx);
    }

    renderDeepSpaceGradient(ctx, width, height) {
        // 多层渐变创造深度感
        const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#000008');      // 极深蓝黑
        bgGradient.addColorStop(0.2, '#0A0A1A');    // 深蓝
        bgGradient.addColorStop(0.4, '#0F0820');    // 深紫蓝
        bgGradient.addColorStop(0.6, '#0A1428');    // 深蓝绿
        bgGradient.addColorStop(0.8, '#0D1025');    // 深蓝紫
        bgGradient.addColorStop(1, '#05081A');      // 极深蓝黑
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);

        // 添加径向热点模拟远处星光
        const hotSpot = ctx.createRadialGradient(
            width * 0.7, height * 0.3, 0,
            width * 0.7, height * 0.3, width * 0.8
        );
        hotSpot.addColorStop(0, 'rgba(40, 30, 60, 0.15)');
        hotSpot.addColorStop(1, 'transparent');
        ctx.fillStyle = hotSpot;
        ctx.fillRect(0, 0, width, height);
    }

    renderNebula(ctx, width, height, nebula) {
        const x = nebula.x * width;
        const y = nebula.y * height;
        const radius = nebula.radius * Math.min(width, height);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(nebula.rotation);

        // 创建椭圆星云
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        const { r, g, b } = nebula.color;
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${nebula.alpha})`);
        gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${nebula.alpha * 0.5})`);
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${nebula.alpha * 0.2})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.scale(1, 0.6); // 椭圆形状
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderGalaxy(ctx, width, height, galaxy) {
        const x = galaxy.x * width;
        const y = galaxy.y * height;
        const size = galaxy.size * Math.min(width, height);

        ctx.save();
        ctx.globalAlpha = galaxy.brightness;

        // 漩涡星系效果
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
        gradient.addColorStop(0, `hsla(${galaxy.hue}, 60%, 80%, 0.8)`);
        gradient.addColorStop(0.3, `hsla(${galaxy.hue}, 50%, 60%, 0.4)`);
        gradient.addColorStop(0.6, `hsla(${galaxy.hue}, 40%, 40%, 0.2)`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderDust(ctx, width, height, dust) {
        const x = dust.x * width;
        const y = dust.y * height;
        const size = dust.size * Math.min(width, height);

        ctx.save();
        ctx.globalAlpha = dust.alpha;
        ctx.fillStyle = '#8899AA';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    renderStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);

        const twinkle = 0.5 + 0.5 * Math.sin(star.twinklePhase);
        const alpha = star.brightness * twinkle;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fill();

        // 小光晕
        if (size > 1) {
            ctx.globalAlpha = alpha * 0.2;
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

        const twinkle = 0.2 + 0.8 * Math.sin(star.twinklePhase);
        const alpha = star.baseBrightness * twinkle;

        ctx.save();

        // 外层大光晕
        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 8);
        outerGlow.addColorStop(0, star.glowColor.replace(')', `, ${alpha * 0.15})`).replace('rgb', 'rgba').replace('##', '#'));
        outerGlow.addColorStop(0.5, `rgba(100, 120, 180, ${alpha * 0.05})`);
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 8, 0, Math.PI * 2);
        ctx.fill();

        // 中层光晕
        const midGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
        midGlow.addColorStop(0, star.color);
        midGlow.addColorStop(0.3, `rgba(200, 220, 255, ${alpha * 0.3})`);
        midGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = midGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 4, 0, Math.PI * 2);
        ctx.fill();

        // 核心亮点
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // 十字光芒
        if (twinkle > 0.7) {
            const sparkleAlpha = (twinkle - 0.7) * 3 * alpha;
            ctx.globalAlpha = sparkleAlpha;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 0.5;
            const sparkleLen = size * 4;
            ctx.beginPath();
            ctx.moveTo(x - sparkleLen, y);
            ctx.lineTo(x + sparkleLen, y);
            ctx.moveTo(x, y - sparkleLen);
            ctx.lineTo(x, y + sparkleLen);
            ctx.stroke();

            // 斜向光芒（较弱）
            if (twinkle > 0.85) {
                ctx.globalAlpha = sparkleAlpha * 0.5;
                const diagLen = size * 2;
                ctx.beginPath();
                ctx.moveTo(x - diagLen, y - diagLen);
                ctx.lineTo(x + diagLen, y + diagLen);
                ctx.moveTo(x + diagLen, y - diagLen);
                ctx.lineTo(x - diagLen, y + diagLen);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    renderShootingStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const alpha = star.life / star.maxLife;

        ctx.save();
        ctx.globalAlpha = alpha * 0.8;

        // 流星尾巴渐变
        const gradient = ctx.createLinearGradient(
            x, y,
            x - star.vx * width * star.length * 3,
            y - star.vy * height * star.length * 3
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.3, 'rgba(200, 220, 255, 0.5)');
        gradient.addColorStop(1, 'transparent');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5 + alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - star.vx * width * star.length * 3, y - star.vy * height * star.length * 3);
        ctx.stroke();

        // 流星头部亮点
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();

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

        const rand = Math.random();
        if (rand < 0.6) {
            return new ObstacleMeteor({
                size: sizeMap[type] || 'medium',
                x: x,
                y: y,
                speedX: speedX,
                speedY: speedY
            });
        } else if (rand < 0.8) {
            return new ObstacleCoin({
                x: Math.random() * 0.6 + 0.2,
                y: -0.1,
                speedX: (Math.random() - 0.5) * 0.02,
                speedY: 0.08 + Math.random() * 0.04
            });
        } else {
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

    onCoinCollect(coin, engine) {
        this.particles.emitCoinCollect(coin.x, coin.y);
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
        this.shootingStars = [];
    }
}
