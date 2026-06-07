// ============================================================
// SCENE ROAD - 公路赛车场景
// 5 车道 + yaw 换道 + 俯视真实感车体 + 路边视差景物 + 透视收敛
// ============================================================

import { ObstacleVehicle } from './obstacle.js';
import { SceneBase } from './scene-base.js';
import { drawCarTopDown } from './car-renderer.js';

const VEHICLE_PALETTE = [
    { body: '#DC2626', trim: '#7F1D1D' },  // 红
    { body: '#2563EB', trim: '#1E3A8A' },  // 蓝
    { body: '#F59E0B', trim: '#92400E' },  // 橙黄
    { body: '#7C3AED', trim: '#4C1D95' },  // 紫
    { body: '#10B981', trim: '#065F46' },  // 绿
    { body: '#E5E7EB', trim: '#6B7280' },  // 银
    { body: '#111827', trim: '#000000' }   // 黑
];

const CAR_TYPES = ['sedan', 'sedan', 'sedan', 'suv', 'sports', 'sedan'];

export class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.sceneType = 'road';
        // 5 车道：0.1 / 0.3 / 0.5 / 0.7 / 0.9
        this.lanes = [0.1, 0.3, 0.5, 0.7, 0.9];
        this.roadLines = [];
        this.sceneryLeft = [];
        this.sceneryRight = [];
        this.lineSpeed = 0.5;
        this.scrollDirection = 'up';
        // 玩家排气尾烟
        this.playerExhaustParticles = [];
        this.playerExhaustTimer = 0;
        this.initRoadLines();
        this.initScenery();
    }

    initRoadLines() {
        this.roadLines = [];
        for (let i = 0; i < 12; i++) {
            this.roadLines.push({ y: i * 0.09, visible: true });
        }
    }

    initScenery() {
        this.sceneryLeft = [];
        this.sceneryRight = [];
        for (let i = 0; i < 10; i++) {
            this.sceneryLeft.push({
                y: i * 0.12,
                type: Math.random() < 0.7 ? 'tree' : 'post'
            });
            this.sceneryRight.push({
                y: i * 0.12,
                type: Math.random() < 0.7 ? 'tree' : 'post'
            });
        }
    }

    init(engine) {
        super.init(engine);
        this.initRoadLines();
        this.initScenery();
        this.playerExhaustParticles = [];
        this.playerExhaustTimer = 0;
    }

    cleanup() {
        this.playerExhaustParticles = [];
        this.playerExhaustTimer = 0;
    }

    update(dt) {
        super.update(dt);
        for (const line of this.roadLines) {
            line.y += this.lineSpeed * dt;
            if (line.y > 1.1) line.y = -0.05;
        }
        for (const s of this.sceneryLeft) {
            s.y += this.lineSpeed * dt * 1.3;
            if (s.y > 1.1) s.y = -0.05;
        }
        for (const s of this.sceneryRight) {
            s.y += this.lineSpeed * dt * 1.3;
            if (s.y > 1.1) s.y = -0.05;
        }
        this._updatePlayerExhaust(dt);
    }

    renderBackground(ctx, width, height) {
        // 压缩天空区域：35% → 22%，给车道腾空间
        const roadTop = height * 0.22;

        // 1. 天空渐变（更紧凑）
        const sky = ctx.createLinearGradient(0, 0, 0, roadTop);
        sky.addColorStop(0, '#0F172A');
        sky.addColorStop(0.5, '#1E3A8A');
        sky.addColorStop(1, '#60A5FA');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, roadTop);

        // 2. 太阳（更小、贴近角落）
        const sunX = width * 0.82, sunY = height * 0.08, sunR = 16;
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 4);
        sunGlow.addColorStop(0, 'rgba(253,224,71,0.9)');
        sunGlow.addColorStop(0.3, 'rgba(253,224,71,0.35)');
        sunGlow.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = sunGlow;
        ctx.fillRect(sunX - sunR * 4, sunY - sunR * 4, sunR * 8, sunR * 8);
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        // 3. 远景城市建筑剪影（提供纵深）
        this._renderSkyline(ctx, width, roadTop);

        // 4. 双层远山（压缩到 sky 区域内）
        this._renderMountains(ctx, width, height, roadTop * 0.72, roadTop, '#1E3A5F', 0.4);
        this._renderMountains(ctx, width, height, roadTop * 0.90, roadTop, '#0F1F3A', 0.55);

        // 5. 地平线雾气（增强空气透视）
        const hazeGrad = ctx.createLinearGradient(0, roadTop - 6, 0, roadTop + 10);
        hazeGrad.addColorStop(0, 'rgba(147,197,253,0)');
        hazeGrad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
        hazeGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, roadTop - 6, width, 16);

        // 6. 路面（远端较亮，营造距离感）
        const roadGrad = ctx.createLinearGradient(0, roadTop, 0, height);
        roadGrad.addColorStop(0, '#52525B');
        roadGrad.addColorStop(0.4, '#27272A');
        roadGrad.addColorStop(1, '#09090B');
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, roadTop, width, height - roadTop);

        // 7. 草地路肩 + 黄色边线
        ctx.fillStyle = '#15803D';
        ctx.fillRect(0, roadTop, width, 4);
        ctx.fillStyle = '#FCD34D';
        ctx.fillRect(0, roadTop + 4, width, 2);
        ctx.fillRect(0, height - 6, width, 2);

        // 8. 5 车道：4 条白色虚线，带透视收敛
        this._renderPerspectiveLaneLines(ctx, width, height, roadTop);

        // 9. 路边景物（视差：景物滚 1.3x）
        this._renderScenery(ctx, width, height, this.sceneryLeft, 0, true, roadTop);
        this._renderScenery(ctx, width, height, this.sceneryRight, width, false, roadTop);
    }

    _renderSkyline(ctx, width, baseY) {
        ctx.fillStyle = '#0A1530';
        const buildings = 14;
        const segW = width / buildings;
        for (let i = 0; i < buildings; i++) {
            const x = i * segW;
            const h = (Math.sin(i * 1.3) * 0.5 + 0.5) * 16 + 4;
            ctx.fillRect(x, baseY - h, segW * 0.92, h);
            if (i % 3 === 0 && h > 10) {
                ctx.fillStyle = 'rgba(254,240,138,0.55)';
                ctx.fillRect(x + segW * 0.3, baseY - h * 0.65, 1.5, 1.5);
                ctx.fillRect(x + segW * 0.55, baseY - h * 0.4, 1.5, 1.5);
                ctx.fillStyle = '#0A1530';
            }
        }
    }

    _renderMountains(ctx, width, height, baseY, horizonY, color, ampScale) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        const peaks = 7;
        for (let i = 0; i <= peaks; i++) {
            const x = (i / peaks) * width;
            const noise = Math.sin(i * 1.7) * 0.5 + Math.cos(i * 2.3) * 0.3;
            const y = baseY - noise * height * 0.035 * ampScale;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, horizonY);
        ctx.closePath();
        ctx.fill();
    }

    _renderPerspectiveLaneLines(ctx, width, height, roadTop) {
        const dashH = height - roadTop;
        const separators = [
            (this.lanes[0] + this.lanes[1]) / 2,
            (this.lanes[1] + this.lanes[2]) / 2,
            (this.lanes[2] + this.lanes[3]) / 2,
            (this.lanes[3] + this.lanes[4]) / 2
        ];
        // 消失点：屏幕中心
        const vanishX = 0.5;

        ctx.fillStyle = '#FFFFFF';
        for (const sepX of separators) {
            for (const line of this.roadLines) {
                if (!line.visible) continue;
                const yNorm = line.y;
                if (yNorm < -0.05 || yNorm > 1.1) continue;
                const y = roadTop + yNorm * dashH;
                // 透视参数：yNorm=0 远端 / yNorm=1 近端
                // 上下界已在前置 if 守门，p 自然落在 [-0.05, 1.1]，clamp 是冗余
                const p = yNorm;
                const xNorm = vanishX + (sepX - vanishX) * p;
                const xPx = xNorm * width;
                const dashW = 1 + p * 4.2;
                const dashLen = 6 + p * 28;
                ctx.fillRect(xPx - dashW / 2, y, dashW, dashLen);
            }
        }
    }

    _renderScenery(ctx, width, height, items, baseX, isLeft, roadTop) {
        const groundY = roadTop;
        for (const item of items) {
            const y = groundY + item.y * (height - groundY) * 0.9;
            if (y < groundY - 4 || y > height + 4) continue;
            const scale = 0.4 + (y - groundY) / (height - groundY) * 0.9;
            const x = isLeft ? baseX + 18 * scale : baseX - 18 * scale;

            if (item.type === 'tree') {
                ctx.fillStyle = '#78350F';
                ctx.fillRect(x - 3 * scale, y - 28 * scale, 6 * scale, 28 * scale);
                ctx.fillStyle = '#166534';
                ctx.beginPath();
                ctx.arc(x, y - 32 * scale, 14 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#15803D';
                ctx.beginPath();
                ctx.arc(x, y - 36 * scale, 11 * scale, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = '#52525B';
                ctx.fillRect(x - 1.5 * scale, y - 40 * scale, 3 * scale, 40 * scale);
                ctx.fillStyle = '#FEF08A';
                ctx.beginPath();
                ctx.arc(x, y - 40 * scale, 4 * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    spawnObstacle(difficultyConfig) {
        const laneIdx = Math.floor(Math.random() * this.lanes.length);
        const laneX = this.lanes[laneIdx];
        const palette = VEHICLE_PALETTE[Math.floor(Math.random() * VEHICLE_PALETTE.length)];
        const carType = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];

        return new ObstacleVehicle({
            x: laneX,
            y: -0.12,
            lane: laneIdx,
            bodyColor: palette.body,
            trimColor: palette.trim,
            carType,
            speedY: 0.4
        });
    }

    mapInputToPosition(inputPos, player) {
        return { x: inputPos.x, y: 0.85 };
    }

    _updatePlayerExhaust(dt) {
        this.playerExhaustTimer += dt;
        if (this.playerExhaustTimer >= 0.08) {
            this.playerExhaustTimer = 0;
            const baseX = (this.engine && this.engine.player) ? this.engine.player.x : 0.5;
            const baseY = (this.engine && this.engine.player) ? this.engine.player.y : 0.85;
            for (const offset of [-0.012, 0.012]) {
                this.playerExhaustParticles.push({
                    x: baseX + offset + (Math.random() - 0.5) * 0.004,
                    y: baseY + 0.075,
                    life: 0.65,
                    age: 0,
                    vy: 0.48 + Math.random() * 0.06,
                    size: 1.2 + Math.random() * 0.5
                });
            }
        }
        for (const p of this.playerExhaustParticles) {
            p.age += dt;
            p.y += p.vy * dt;
            p.size += dt * 5;
        }
        this.playerExhaustParticles = this.playerExhaustParticles.filter(p => p.age < p.life);
        if (this.playerExhaustParticles.length > 60) {
            this.playerExhaustParticles.splice(0, this.playerExhaustParticles.length - 60);
        }
    }

    // ============================================================
    // 玩家车：俯视视角，红色跑车，带双排气尾烟
    // ============================================================
    renderPlayer(ctx, playerX, playerY) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;

        // 1. 排气尾烟（在车后画）
        for (const p of this.playerExhaustParticles) {
            const px = p.x * width;
            const py = p.y * height;
            const alpha = Math.max(0, 1 - p.age / p.life) * 0.4;
            ctx.fillStyle = `rgba(180,190,200,${alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, p.size * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. 车体
        const px = playerX * width;
        const py = playerY * height;
        const carW = width * 0.055;
        const carH = height * 0.16;
        drawCarTopDown(ctx, px, py, carW, carH, {
            body: '#DC2626',
            trim: '#7F1D1D',
            windowTint: 'rgba(186,230,253,0.9)',
            carType: 'sports',
            isPlayer: true
        });
    }
}
