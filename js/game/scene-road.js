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
    { body: '#111827', trim: '#000000' },  // 黑
    { body: '#EC4899', trim: '#9D174D' },  // 粉
    { body: '#0EA5E9', trim: '#0C4A6E' },  // 天蓝
    { body: '#84CC16', trim: '#365314' }   // 草绿
];

const CAR_TYPES = ['sedan', 'sedan', 'sedan', 'suv', 'sports', 'sedan', 'suv', 'sedan'];

// 公路赛车专属车流密度配置（与 difficulty 解耦：难易度管分数/速度，车流密度管"热闹度"）
const ROAD_TRAFFIC = {
    spawnInterval: 900,    // ms（difficulty 默认 1500）
    maxObstacles: 5,        // 路上最多同时 5 辆（留玩家反应窗口，不被密度直接撞死）
    convoyChance: 0.30,     // 30% 概率生成车队（相邻车道同时出）
    convoySizeRange: [2, 2] // 车队固定 2 辆
};

export class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.sceneType = 'road';
        // 5 车道：0.18 / 0.34 / 0.5 / 0.66 / 0.82（内收到路面内）
        this.lanes = [0.18, 0.34, 0.5, 0.66, 0.82];
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

        // 8. 5 车道：用 5 条深浅交替的色带 + 强对比白色实线分隔，5 车道永远肉眼可数
        this._renderLaneBands(ctx, width, height, roadTop);

        // 9. 路边景物（视差：景物滚 1.3x）
        this._renderScenery(ctx, width, height, this.sceneryLeft, 0, true, roadTop);
        this._renderScenery(ctx, width, height, this.sceneryRight, width, false, roadTop);
    }

    /**
     * 5 车道色带：5 段**完全不同**深浅的色带 + 4 条**完全实线**白色分隔
     * 远端也保持强对比，5 车道永远肉眼可数
     */
    _renderLaneBands(ctx, width, height, roadTop) {
        const roadH = height - roadTop;
        // 5 段**完全独立**的深浅（不重复），强制 5 段视觉可分
        const bandShades = ['#16161A', '#22222A', '#2D2D36', '#22222A', '#16161A'];
        const bandW = width / 5;
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = bandShades[i];
            ctx.fillRect(i * bandW, roadTop, bandW, roadH);
        }
        // 路面渐变叠层（保留远亮近暗的纵深感）
        const overlay = ctx.createLinearGradient(0, roadTop, 0, height);
        overlay.addColorStop(0, 'rgba(82,82,91,0.45)');
        overlay.addColorStop(0.4, 'rgba(39,39,42,0.25)');
        overlay.addColorStop(1, 'rgba(9,9,11,0.1)');
        ctx.fillStyle = overlay;
        ctx.fillRect(0, roadTop, width, roadH);

        // 4 条分隔线：直接从 lanes 数组计算边界，绝不硬编码
        // lanes=[0.18,0.34,0.5,0.66,0.82] → 边界=(0.18+0.34)/2 等
        const sepXs = [];
        for (let i = 0; i < this.lanes.length - 1; i++) {
            sepXs.push((this.lanes[i] + this.lanes[i + 1]) / 2);
        }
        // 远端 pMin=0.7（保留 70% 区分度）→ 地平线仍清晰分开
        const vanishX = 0.5;
        const pMin = 0.7;
        for (const sepX of sepXs) {
            for (const line of this.roadLines) {
                if (!line.visible) continue;
                const yNorm = line.y;
                if (yNorm < -0.05 || yNorm > 1.1) continue;
                const y = roadTop + yNorm * roadH;
                const p = pMin + (1 - pMin) * yNorm;
                const xNorm = vanishX + (sepX - vanishX) * p;
                const xPx = xNorm * width;
                // 完全实线（不是 dash 段），宽度 3px 起步，远近都清晰
                const segLen = 18 + yNorm * 26;
                const segW = 3 + yNorm * 1.5;
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fillRect(xPx - segW / 2, y, segW, segLen);
            }
        }
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
        // 消失点：屏幕中心；保留 18% 残差避免地平线处 5 线全坍缩成 1
        const vanishX = 0.5;
        const pMin = 0.18;

        ctx.fillStyle = '#FFFFFF';
        for (const sepX of separators) {
            for (const line of this.roadLines) {
                if (!line.visible) continue;
                const yNorm = line.y;
                if (yNorm < -0.05 || yNorm > 1.1) continue;
                const y = roadTop + yNorm * dashH;
                // 透视参数：yNorm=0 远端 / yNorm=1 近端
                // 上下界已在前置 if 守门，p 自然落在 [-0.05, 1.1]，clamp 是冗余
                const p = pMin + (1 - pMin) * yNorm;
                const xNorm = vanishX + (sepX - vanishX) * p;
                const xPx = xNorm * width;
                // 最小可见宽度 + 长度，防止远端 dash 消失
                const dashW = 1.5 + p * 4;
                const dashLen = 8 + p * 26;
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

        // 从地平线处（roadTop 上方一点点）spawn，远小近大动画出现
        const roadTopNorm = 0.22;
        const spawnY = roadTopNorm - 0.08;
        return new ObstacleVehicle({
            x: laneX,
            y: spawnY,
            lane: laneIdx,
            bodyColor: palette.body,
            trimColor: palette.trim,
            carType,
            speedY: 0.32
        });
    }

    /**
     * 覆写基类 spawn 节流：使用公路赛车专属车流配置（与 difficulty 解耦）
     * 35% 概率触发"车队 convoys"：相邻 2-3 车道同时出车，营造真高速的密集车流
     */
    trySpawnObstacle(obstacleList, difficultyConfig) {
        const cfg = ROAD_TRAFFIC;
        const timeSinceLastSpawn = this.gameTime - this.lastSpawnTime;
        const intervalSec = cfg.spawnInterval / 1000;

        if (obstacleList.length >= cfg.maxObstacles) return;
        if (timeSinceLastSpawn < intervalSec) return;

        // 决定本次是单辆还是车队
        const isConvoy = Math.random() < cfg.convoyChance;
        const spawnCount = isConvoy
            ? cfg.convoySizeRange[0] + Math.floor(Math.random() * (cfg.convoySizeRange[1] - cfg.convoySizeRange[0] + 1))
            : 1;

        // 选 spawn 起始车道（车队从连续 2-3 车道开始）
        const startLane = Math.floor(Math.random() * (this.lanes.length - spawnCount + 1));
        const usedLanes = new Set();
        for (let i = 0; i < spawnCount; i++) {
            if (obstacleList.length >= cfg.maxObstacles) break;
            const laneIdx = startLane + i;
            if (usedLanes.has(laneIdx)) continue;
            usedLanes.add(laneIdx);

            const laneX = this.lanes[laneIdx];
            const palette = VEHICLE_PALETTE[Math.floor(Math.random() * VEHICLE_PALETTE.length)];
            const carType = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
            // 车队内后车 y 稍前（落后）形成队列感
            const roadTopNorm = 0.22;
            const spawnY = roadTopNorm - 0.08 - i * 0.04;
            const car = new ObstacleVehicle({
                x: laneX,
                y: spawnY,
                lane: laneIdx,
                bodyColor: palette.body,
                trimColor: palette.trim,
                carType,
                speedY: 0.32
            });
            obstacleList.push(car);
        }
        this.lastSpawnTime = this.gameTime;
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
