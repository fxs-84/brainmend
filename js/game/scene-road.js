// ============================================================
// SCENE ROAD - 公路赛车场景
// 5 车道 + yaw 换道 + 俯视真实感车体 + 路边视差景物
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
    }

    renderBackground(ctx, width, height) {
        // 1. 天空渐变
        const sky = ctx.createLinearGradient(0, 0, 0, height * 0.35);
        sky.addColorStop(0, '#0F172A');
        sky.addColorStop(0.6, '#1E3A8A');
        sky.addColorStop(1, '#93C5FD');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height * 0.35);

        // 2. 太阳 + 光晕
        const sunX = width * 0.78, sunY = height * 0.16, sunR = 26;
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 4);
        sunGlow.addColorStop(0, 'rgba(253,224,71,0.95)');
        sunGlow.addColorStop(0.3, 'rgba(253,224,71,0.4)');
        sunGlow.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = sunGlow;
        ctx.fillRect(sunX - sunR * 4, sunY - sunR * 4, sunR * 8, sunR * 8);
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        // 3. 双层远山视差
        this._renderMountains(ctx, width, height, height * 0.28, '#1E3A5F', 0.55);
        this._renderMountains(ctx, width, height, height * 0.32, '#0F1F3A', 0.75);

        // 4. 路面（带渐变，远亮近暗）
        const roadTop = height * 0.35;
        const roadGrad = ctx.createLinearGradient(0, roadTop, 0, height);
        roadGrad.addColorStop(0, '#3F3F46');
        roadGrad.addColorStop(0.5, '#27272A');
        roadGrad.addColorStop(1, '#09090B');
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, roadTop, width, height - roadTop);

        // 5. 草地路肩
        ctx.fillStyle = '#15803D';
        ctx.fillRect(0, roadTop, width, 6);
        // 黄色双实线边线
        ctx.fillStyle = '#FCD34D';
        ctx.fillRect(0, roadTop + 6, width, 3);
        ctx.fillRect(0, height - 9, width, 3);

        // 6. 5 车道：4 条白色虚线分隔
        const dashH = height - roadTop;
        const separators = [
            (this.lanes[0] + this.lanes[1]) / 2,
            (this.lanes[1] + this.lanes[2]) / 2,
            (this.lanes[2] + this.lanes[3]) / 2,
            (this.lanes[3] + this.lanes[4]) / 2
        ];
        ctx.fillStyle = '#FFFFFF';
        for (const sepX of separators) {
            const xPx = sepX * width;
            for (const line of this.roadLines) {
                if (!line.visible) continue;
                const y = roadTop + line.y * dashH;
                if (y < roadTop - 8 || y > height + 8) continue;
                ctx.fillRect(xPx - 2.5, y, 5, 32);
            }
        }

        // 7. 路边景物（视差：路面 1.0x，景物 1.3x）
        this._renderScenery(ctx, width, height, this.sceneryLeft, 0, true);
        this._renderScenery(ctx, width, height, this.sceneryRight, width, false);
    }

    _renderMountains(ctx, width, height, baseY, color, ampScale) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.35);
        const peaks = 7;
        for (let i = 0; i <= peaks; i++) {
            const x = (i / peaks) * width;
            const noise = Math.sin(i * 1.7) * 0.5 + Math.cos(i * 2.3) * 0.3;
            const y = baseY - noise * height * 0.05 * ampScale;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height * 0.35);
        ctx.closePath();
        ctx.fill();
    }

    _renderScenery(ctx, width, height, items, baseX, isLeft) {
        const groundY = height * 0.35;
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

    // ============================================================
    // 玩家车：俯视视角，红色跑车
    // ============================================================
    renderPlayer(ctx, playerX, playerY) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
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
