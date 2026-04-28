// ============================================================
// SCENE SPACE - 太空场景 - 星系碰撞闪耀版
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

        // 星系碰撞能量核心
        this.energyCores = [];
        this.lightRays = [];
        this.cosmicWaves = [];

        // 星云/星团系统
        this.nebulae = [];
        this.distantGalaxies = [];
        this.cosmicDust = [];

        // 多层星空系统
        this.starLayers = [
            { stars: [], speed: 0.01, count: 100, sizeMin: 0.0003, sizeMax: 0.0007, brightness: 0.15 },
            { stars: [], speed: 0.03, count: 60, sizeMin: 0.0007, sizeMax: 0.0012, brightness: 0.35 },
            { stars: [], speed: 0.06, count: 40, sizeMin: 0.0012, sizeMax: 0.0025, brightness: 0.6 }
        ];

        // 闪耀星星
        this.twinkleStars = [];
        this.blazingStars = [];
        this.shootingStars = [];

        // 粒子系统
        this.particles = new ParticleSystem();

        this.initEnergyCores();
        this.initLightRays();
        this.initNebulae();
        this.initGalaxies();
        this.initStars();
        this.initCosmicDust();
        this.initTwinkleStars();
        this.initBlazingStars();
    }

    init(engine) {
        super.init(engine);
        this.initEnergyCores();
        this.initLightRays();
        this.initNebulae();
        this.initGalaxies();
        this.initStars();
        this.initCosmicDust();
        this.initTwinkleStars();
        this.initBlazingStars();
        this.cosmicWaves = [];
        this.shootingStars = [];
        this.particles.clear();
    }

    // 初始化能量核心（星系碰撞中心）
    initEnergyCores() {
        this.energyCores = [];
        for (let i = 0; i < 3; i++) {
            this.energyCores.push({
                x: 0.2 + Math.random() * 0.6,
                y: 0.2 + Math.random() * 0.6,
                size: 0.08 + Math.random() * 0.12,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 1.5 + Math.random() * 2,
                hue: Math.random() * 360,
                intensity: 0.5 + Math.random() * 0.5
            });
        }
    }

    // 初始化光射线
    initLightRays() {
        this.lightRays = [];
        const rayColors = [
            { h: 220, s: 80, l: 70 },  // 蓝色
            { h: 280, s: 70, l: 65 },  // 紫色
            { h: 200, s: 75, l: 75 },  // 青色
            { h: 30, s: 80, l: 65 },   // 橙色
            { h: 350, s: 70, l: 60 },  // 粉红
        ];

        for (let i = 0; i < 12; i++) {
            const color = rayColors[Math.floor(Math.random() * rayColors.length)];
            this.lightRays.push({
                x: Math.random(),
                y: Math.random(),
                angle: Math.random() * Math.PI * 2,
                length: 0.15 + Math.random() * 0.25,
                width: 0.02 + Math.random() * 0.03,
                color: color,
                alpha: 0.08 + Math.random() * 0.12,
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 2 + Math.random() * 2
            });
        }
    }

    initNebulae() {
        this.nebulae = [];
        const nebulaColors = [
            { r: 150, g: 50, b: 200 },
            { r: 50, g: 100, b: 200 },
            { r: 200, g: 50, b: 120 },
            { r: 50, g: 150, b: 180 },
            { r: 200, g: 120, b: 50 },
            { r: 100, g: 180, b: 150 }
        ];

        for (let i = 0; i < 5; i++) {
            const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            this.nebulae.push({
                x: Math.random(),
                y: Math.random(),
                radius: 0.18 + Math.random() * 0.28,
                color: color,
                alpha: 0.04 + Math.random() * 0.05,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.015,
                scaleX: 0.8 + Math.random() * 0.4,
                scaleY: 0.5 + Math.random() * 0.3
            });
        }
    }

    initGalaxies() {
        this.distantGalaxies = [];
        for (let i = 0; i < 10; i++) {
            this.distantGalaxies.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.008 + Math.random() * 0.015,
                brightness: 0.08 + Math.random() * 0.12,
                hue: Math.random() * 360,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1
            });
        }
    }

    initCosmicDust() {
        this.cosmicDust = [];
        for (let i = 0; i < 80; i++) {
            this.cosmicDust.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.0002 + Math.random() * 0.0003,
                alpha: 0.04 + Math.random() * 0.08,
                speed: 0.004 + Math.random() * 0.008
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
        const colors = ['#FFFFFF', '#E8F4FF', '#FFE4C4', '#ADD8E6', '#FFCBA4', '#F0F8FF', '#FFF0F5'];
        for (let i = 0; i < 25; i++) {
            this.twinkleStars.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.0025 + Math.random() * 0.004,
                baseBrightness: 0.75 + Math.random() * 0.25,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 2 + Math.random() * 3,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
    }

    // 初始化炽热闪耀星（星系碰撞级别的亮星）
    initBlazingStars() {
        this.blazingStars = [];
        const blazeColors = [
            { core: '#FFFFFF', mid: '#88CCFF', outer: '#4466FF' },
            { core: '#FFFFFF', mid: '#FFFFAA', outer: '#FFAA44' },
            { core: '#FFFFFF', mid: '#FFAACC', outer: '#FF6688' },
            { core: '#FFFFFF', mid: '#AAFFFF', outer: '#44AAAA' },
            { core: '#FFFFFF', mid: '#CCAFFF', outer: '#8844FF' }
        ];

        for (let i = 0; i < 8; i++) {
            const colorSet = blazeColors[Math.floor(Math.random() * blazeColors.length)];
            this.blazingStars.push({
                x: Math.random(),
                y: Math.random(),
                size: 0.004 + Math.random() * 0.006,
                baseIntensity: 0.8 + Math.random() * 0.2,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 3 + Math.random() * 4,
                colorSet: colorSet,
                rayCount: 4 + Math.floor(Math.random() * 4),
                rayRotation: Math.random() * Math.PI * 2,
                rayRotationSpeed: (Math.random() - 0.5) * 2
            });
        }
    }

    getStarColor(random) {
        const colors = [
            'rgba(255, 255, 255, 0.8)',
            'rgba(200, 230, 255, 0.7)',
            'rgba(255, 250, 240, 0.6)',
            'rgba(180, 220, 255, 0.5)',
            'rgba(255, 240, 250, 0.4)',
            'rgba(220, 200, 255, 0.5)'
        ];
        return colors[Math.floor(random * colors.length)];
    }

    update(dt) {
        super.update(dt);
        this.time += dt;

        // 更新能量核心脉冲
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

        // 更新星系
        for (const galaxy of this.distantGalaxies) {
            galaxy.rotation += galaxy.rotationSpeed * dt;
        }

        // 更新星空
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                star.twinklePhase += star.twinkleSpeed * dt;
                this.moveStar(star, layer.speed * dt);
            }
        }

        // 更新闪耀星星
        for (const star of this.twinkleStars) {
            star.twinklePhase += star.twinkleSpeed * dt;
            this.moveStar(star, 0.02 * dt);
        }

        // 更新炽热星
        for (const star of this.blazingStars) {
            star.pulsePhase += star.pulseSpeed * dt;
            star.rayRotation += star.rayRotationSpeed * dt;
            this.moveStar(star, 0.015 * dt);
        }

        // 更新尘埃
        for (const dust of this.cosmicDust) {
            this.moveStar(dust, dust.speed * dt);
        }

        // 更新宇宙波纹
        for (let i = this.cosmicWaves.length - 1; i >= 0; i--) {
            const wave = this.cosmicWaves[i];
            wave.radius += wave.speed * dt;
            wave.alpha -= wave.decay * dt;
            if (wave.alpha <= 0) {
                this.cosmicWaves.splice(i, 1);
            }
        }

        // 随机生成新波纹
        if (Math.random() < 0.01) {
            this.spawnCosmicWave();
        }

        // 更新粒子
        this.particles.update(dt);

        // 流星
        if (Math.random() < 0.003) {
            this.spawnShootingStar();
        }
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

    spawnCosmicWave() {
        this.cosmicWaves.push({
            x: Math.random() * 0.4 + 0.3,
            y: Math.random() * 0.4 + 0.3,
            radius: 0.01,
            speed: 0.05 + Math.random() * 0.05,
            alpha: 0.3 + Math.random() * 0.3,
            decay: 0.1 + Math.random() * 0.1,
            hue: Math.random() * 360
        });
    }

    spawnShootingStar() {
        this.shootingStars.push({
            x: Math.random() * 0.3 + 0.1,
            y: Math.random() * 0.15,
            vx: 0.25 + Math.random() * 0.2,
            vy: 0.35 + Math.random() * 0.3,
            length: 0.06 + Math.random() * 0.12,
            life: 0.7 + Math.random() * 0.5,
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

        // 深空背景
        this.renderDeepSpaceGradient(ctx, width, height);

        // 星系碰撞能量核心（最底层光晕）
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

        // 远距星系
        for (const galaxy of this.distantGalaxies) {
            this.renderGalaxy(ctx, width, height, galaxy);
        }

        // 宇宙波纹
        for (const wave of this.cosmicWaves) {
            this.renderCosmicWave(ctx, width, height, wave);
        }

        // 尘埃
        for (const dust of this.cosmicDust) {
            this.renderDust(ctx, width, height, dust);
        }

        // 基础星空
        for (const layer of this.starLayers) {
            for (const star of layer.stars) {
                this.renderStar(ctx, width, height, star);
            }
        }

        // 普通闪耀星
        for (const star of this.twinkleStars) {
            this.renderTwinkleStar(ctx, width, height, star);
        }

        // 炽热闪耀星（最强光）
        for (const star of this.blazingStars) {
            this.renderBlazingStar(ctx, width, height, star);
        }

        // 流星
        for (const star of this.shootingStars) {
            this.renderShootingStar(ctx, width, height, star);
        }

        // 粒子
        this.particles.render(ctx);
    }

    renderDeepSpaceGradient(ctx, width, height) {
        // 多层深空渐变
        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, '#000010');
        bg.addColorStop(0.15, '#050818');
        bg.addColorStop(0.3, '#0A0825');
        bg.addColorStop(0.5, '#080420');
        bg.addColorStop(0.7, '#0C0830');
        bg.addColorStop(0.85, '#040618');
        bg.addColorStop(1, '#000008');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        // 主能量热点
        const mainHotspot = ctx.createRadialGradient(
            width * 0.5, height * 0.4, 0,
            width * 0.5, height * 0.4, width * 0.9
        );
        mainHotspot.addColorStop(0, 'rgba(60, 40, 100, 0.2)');
        mainHotspot.addColorStop(0.4, 'rgba(30, 20, 60, 0.1)');
        mainHotspot.addColorStop(1, 'transparent');
        ctx.fillStyle = mainHotspot;
        ctx.fillRect(0, 0, width, height);

        // 彩色能量区域
        const warmHotspot = ctx.createRadialGradient(
            width * 0.2, height * 0.3, 0,
            width * 0.2, height * 0.3, width * 0.5
        );
        warmHotspot.addColorStop(0, 'rgba(100, 50, 80, 0.15)');
        warmHotspot.addColorStop(1, 'transparent');
        ctx.fillStyle = warmHotspot;
        ctx.fillRect(0, 0, width, height);

        const coolHotspot = ctx.createRadialGradient(
            width * 0.8, height * 0.6, 0,
            width * 0.8, height * 0.6, width * 0.4
        );
        coolHotspot.addColorStop(0, 'rgba(40, 60, 120, 0.15)');
        coolHotspot.addColorStop(1, 'transparent');
        ctx.fillStyle = coolHotspot;
        ctx.fillRect(0, 0, width, height);
    }

    renderEnergyCore(ctx, width, height, core) {
        const x = core.x * width;
        const y = core.y * height;
        const baseSize = core.size * Math.min(width, height);
        const pulse = 0.7 + 0.3 * Math.sin(core.pulsePhase);
        const intensity = core.intensity * pulse;

        ctx.save();

        // 最外层大光晕
        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 6);
        outerGlow.addColorStop(0, `hsla(${core.hue}, 80%, 70%, ${0.15 * intensity})`);
        outerGlow.addColorStop(0.3, `hsla(${core.hue}, 70%, 60%, ${0.08 * intensity})`);
        outerGlow.addColorStop(0.6, `hsla(${core.hue}, 60%, 50%, ${0.03 * intensity})`);
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, baseSize * 6, 0, Math.PI * 2);
        ctx.fill();

        // 中层能量环
        const midGlow = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 3);
        midGlow.addColorStop(0, `hsla(${core.hue}, 90%, 80%, ${0.4 * intensity})`);
        midGlow.addColorStop(0.5, `hsla(${core.hue}, 80%, 60%, ${0.15 * intensity})`);
        midGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = midGlow;
        ctx.beginPath();
        ctx.arc(x, y, baseSize * 3, 0, Math.PI * 2);
        ctx.fill();

        // 核心亮点
        const coreGlow = ctx.createRadialGradient(x, y, 0, x, y, baseSize);
        coreGlow.addColorStop(0, `rgba(255, 255, 255, ${0.9 * intensity})`);
        coreGlow.addColorStop(0.3, `hsla(${core.hue}, 100%, 90%, ${0.7 * intensity})`);
        coreGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(x, y, baseSize, 0, Math.PI * 2);
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

        // 光束渐变
        const gradient = ctx.createLinearGradient(-length, 0, length, 0);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.3, `hsla(${h}, ${s}%, ${l}%, ${alpha * 0.3})`);
        gradient.addColorStop(0.5, `hsla(${h}, ${s}%, ${l}%, ${alpha})`);
        gradient.addColorStop(0.7, `hsla(${h}, ${s}%, ${l}%, ${alpha * 0.3})`);
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
        gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${nebula.alpha * 0.6})`);
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${nebula.alpha * 0.2})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
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
        ctx.translate(x, y);
        ctx.rotate(galaxy.rotation);
        ctx.globalAlpha = galaxy.brightness;

        // 漩涡效果
        for (let arm = 0; arm < 2; arm++) {
            ctx.save();
            ctx.rotate(arm * Math.PI);

            const gradient = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 2);
            gradient.addColorStop(0, `hsla(${galaxy.hue}, 50%, 80%, 0.8)`);
            gradient.addColorStop(0.5, `hsla(${galaxy.hue}, 40%, 60%, 0.3)`);
            gradient.addColorStop(1, 'transparent');

            ctx.fillStyle = gradient;
            ctx.scale(1, 0.3);
            ctx.beginPath();
            ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    renderCosmicWave(ctx, width, height, wave) {
        const x = wave.x * width;
        const y = wave.y * height;
        const radius = wave.radius * Math.min(width, height);

        ctx.save();
        ctx.globalAlpha = wave.alpha;
        ctx.strokeStyle = `hsla(${wave.hue}, 70%, 70%, 0.6)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // 内层波纹
        ctx.globalAlpha = wave.alpha * 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    renderDust(ctx, width, height, dust) {
        const x = dust.x * width;
        const y = dust.y * height;
        const size = dust.size * Math.min(width, height);

        ctx.save();
        ctx.globalAlpha = dust.alpha;
        ctx.fillStyle = '#AABBCC';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.3, size), 0, Math.PI * 2);
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

        if (size > 0.8) {
            ctx.globalAlpha = alpha * 0.25;
            ctx.beginPath();
            ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    renderTwinkleStar(ctx, width, height, star) {
        const x = star.x * width;
        const y = star.y * height;
        const size = star.size * Math.min(width, height);
        const twinkle = 0.15 + 0.85 * Math.sin(star.twinklePhase);
        const alpha = star.baseBrightness * twinkle;

        ctx.save();

        // 外层光晕
        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 6);
        outerGlow.addColorStop(0, `rgba(200, 220, 255, ${alpha * 0.2})`);
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 6, 0, Math.PI * 2);
        ctx.fill();

        // 中层
        const midGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
        midGlow.addColorStop(0, star.color);
        midGlow.addColorStop(0.5, `rgba(200, 220, 255, ${alpha * 0.4})`);
        midGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = midGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 3, 0, Math.PI * 2);
        ctx.fill();

        // 核心
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // 星芒
        if (twinkle > 0.6) {
            const rayAlpha = (twinkle - 0.6) * 2.5 * alpha;
            ctx.globalAlpha = rayAlpha;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 0.5;
            const rayLen = size * 3;
            ctx.beginPath();
            ctx.moveTo(x - rayLen, y);
            ctx.lineTo(x + rayLen, y);
            ctx.moveTo(x, y - rayLen);
            ctx.lineTo(x, y + rayLen);
            ctx.stroke();
        }

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

        // 最外层巨大光晕
        const superOuter = ctx.createRadialGradient(x, y, 0, x, y, size * 15);
        superOuter.addColorStop(0, outer.replace(')', `, ${0.15 * intensity})`));
        superOuter.addColorStop(0.4, outer.replace(')', `, ${0.05 * intensity})`));
        superOuter.addColorStop(1, 'transparent');
        ctx.fillStyle = superOuter;
        ctx.beginPath();
        ctx.arc(x, y, size * 15, 0, Math.PI * 2);
        ctx.fill();

        // 外层光晕
        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 8);
        outerGlow.addColorStop(0, mid.replace(')', `, ${0.4 * intensity})`));
        outerGlow.addColorStop(0.5, outer.replace(')', `, ${0.15 * intensity})`));
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 8, 0, Math.PI * 2);
        ctx.fill();

        // 内层光芒
        const innerGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
        innerGlow.addColorStop(0, core);
        innerGlow.addColorStop(0.3, mid.replace(')', `, ${0.7 * intensity})`));
        innerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = innerGlow;
        ctx.beginPath();
        ctx.arc(x, y, size * 4, 0, Math.PI * 2);
        ctx.fill();

        // 核心
        ctx.globalAlpha = intensity;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
        ctx.fill();

        // 动态星芒射线
        const rayAlpha = 0.4 + 0.5 * pulse;
        ctx.globalAlpha = rayAlpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 1;
        const rayLen = size * (4 + pulse * 2);
        const rayCount = star.rayCount;

        for (let i = 0; i < rayCount; i++) {
            const angle = star.rayRotation + (i * Math.PI * 2 / rayCount);
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(angle) * size * 2, y + Math.sin(angle) * size * 2);
            ctx.lineTo(x + Math.cos(angle) * rayLen, y + Math.sin(angle) * rayLen);
            ctx.stroke();
        }

        // 对角星芒
        if (pulse > 0.5) {
            ctx.globalAlpha = (pulse - 0.5) * 2 * rayAlpha;
            ctx.lineWidth = 0.5;
            const diagLen = size * 3;
            for (let i = 0; i < star.rayCount; i++) {
                const angle = star.rayRotation + (i * Math.PI * 2 / rayCount) + Math.PI / 4;
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(angle) * size * 1.5, y + Math.sin(angle) * size * 1.5);
                ctx.lineTo(x + Math.cos(angle) * diagLen, y + Math.sin(angle) * diagLen);
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
        ctx.globalAlpha = alpha * 0.9;

        // 流星尾巴
        const gradient = ctx.createLinearGradient(
            x, y,
            x - star.vx * width * star.length * 4,
            y - star.vy * height * star.length * 4
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(200, 230, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(150, 180, 255, 0.3)');
        gradient.addColorStop(1, 'transparent');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2 + alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - star.vx * width * star.length * 4, y - star.vy * height * star.length * 4);
        ctx.stroke();

        // 头部
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
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
        this.cosmicWaves = [];
    }
}
