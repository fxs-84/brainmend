// ============================================================
// SCENE ROAD - 公路赛车场景
// 5 车道 + yaw 换道 + 俯视真实感车体 + 路边视差景物 + 透视收敛
// ============================================================

import { ObstacleVehicle, ObstacleCoin, ObstacleBoost } from './obstacle.js';
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
    convoySizeRange: [2, 2], // 车队固定 2 辆
    coinChainChance: 0.18,  // 18% 概率在 spawn 间隔里再发一串金币（纵向 3-5 枚）
    coinChainLength: [3, 5],
    boostChance: 0.06       // 6% 概率发一个加速道具
};

export class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.sceneType = 'road';
        // 7 车道 → 6 条白色车道分隔线（用户要求 4 + 2 = 6）
        this.lanes = [0.10, 0.23, 0.36, 0.5, 0.64, 0.77, 0.90];
        this.roadLines = [];
        this.sceneryLeft = [];
        this.sceneryRight = [];
        this.lineSpeed = 0.5;
        this.scrollDirection = 'up';
        // 玩家当前速度倍率（1.0 基准；由 mapInputToPosition 写入）
        this.playerSpeed = 1.0;
        // 加速道具临时加成（4 秒倒计时，>0 时 scrollMul × 1.5）
        this.boostTimer = 0;
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
        // 5 种景物类型，每种有权重，越往后越稀有
        const SCENERY_TYPES = ['tree', 'tree', 'tree', 'post', 'post', 'billboard', 'building', 'mountain'];
        const pickType = () => SCENERY_TYPES[Math.floor(Math.random() * SCENERY_TYPES.length)];
        this.sceneryLeft = [];
        this.sceneryRight = [];
        for (let i = 0; i < 12; i++) {
            this.sceneryLeft.push({ y: i * 0.1, type: pickType() });
            this.sceneryRight.push({ y: i * 0.1, type: pickType() });
        }
    }

    init(engine) {
        super.init(engine);
        this.initRoadLines();
        this.initScenery();
        this.playerExhaustParticles = [];
        this.playerExhaustTimer = 0;
        // v10：远景动态状态重置（云朵位置/山相位从 0 开始）
        this.clouds = null;
        this.mountainPhases = null;
        this.playerSpeed = 1.0;
    }

    cleanup() {
        this.playerExhaustParticles = [];
        this.playerExhaustTimer = 0;
    }

    update(dt) {
        super.update(dt);
        // 加速道具倒计时
        if (this.boostTimer > 0) this.boostTimer -= dt;
        // 玩家速度影响路面/景物的滚动速度（pitch 抬头加速 → 路面动得更快，主观感"加速"）
        const boostMul = this.boostTimer > 0 ? 1.5 : 1.0;
        const scrollMul = this.playerSpeed * boostMul;
        for (const line of this.roadLines) {
            line.y += this.lineSpeed * dt * scrollMul;
            if (line.y > 1.1) line.y = -0.05;
        }
        for (const s of this.sceneryLeft) {
            s.y += this.lineSpeed * dt * 1.3 * scrollMul;
            if (s.y > 1.1) s.y = -0.05;
        }
        for (const s of this.sceneryRight) {
            s.y += this.lineSpeed * dt * 1.3 * scrollMul;
            if (s.y > 1.1) s.y = -0.05;
        }
        this._updatePlayerExhaust(dt);
    }

    renderBackground(ctx, width, height) {
        // 压缩天空区域：35% → 22%，给车道腾空间
        const roadTop = height * 0.22;

        // ---- 时间循环（60s 一圈：白天→黄昏→夜晚→黎明→白天） ----
        const dayPhase = ((this.gameTime || 0) % 60) / 60;  // [0,1)
        // 4 个时段的关键帧（顶→底 渐变两端色）
        const SKY_PRESETS = [
            { top: '#0F172A', mid: '#1E3A8A', bot: '#60A5FA' },  // 白天
            { top: '#1E1B4B', mid: '#7C2D12', bot: '#FB923C' },  // 黄昏
            { top: '#020617', mid: '#0F172A', bot: '#1E293B' },  // 夜晚
            { top: '#312E81', mid: '#7C3AED', bot: '#F472B6' }   // 黎明
        ];
        const skyNow = this._lerpSkyPreset(SKY_PRESETS, dayPhase);

        // 1. 天空渐变（时间循环）
        const sky = ctx.createLinearGradient(0, 0, 0, roadTop);
        sky.addColorStop(0, skyNow.top);
        sky.addColorStop(0.5, skyNow.mid);
        sky.addColorStop(1, skyNow.bot);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, roadTop);

        // 2. 太阳（白天/黄昏）或 月亮（夜晚）
        const isNight = dayPhase > 0.5 && dayPhase < 0.75;
        const isDusk = dayPhase > 0.25 && dayPhase < 0.5;
        const sunAngle = (dayPhase * Math.PI * 2) - Math.PI / 2;  // 从地平线→天顶→地平线
        const sunArcX = width * 0.5 + Math.cos(sunAngle) * width * 0.45;
        const sunArcY = roadTop * 0.5 + Math.sin(sunAngle) * roadTop * 0.6;
        const sunColor = isNight ? '#F8FAFC' : isDusk ? '#FCA5A5' : '#FDE047';
        const sunGlowColor = isNight ? '254,250,250' : isDusk ? '252,165,165' : '253,224,71';
        const sunR = isNight ? 12 : 16;
        const sunGlow = ctx.createRadialGradient(sunArcX, sunArcY, 0, sunArcX, sunArcY, sunR * 4);
        sunGlow.addColorStop(0, `rgba(${sunGlowColor},0.9)`);
        sunGlow.addColorStop(0.3, `rgba(${sunGlowColor},0.35)`);
        sunGlow.addColorStop(1, `rgba(${sunGlowColor},0)`);
        ctx.fillStyle = sunGlow;
        ctx.fillRect(sunArcX - sunR * 4, sunArcY - sunR * 4, sunR * 8, sunR * 8);
        ctx.fillStyle = sunColor;
        ctx.beginPath();
        ctx.arc(sunArcX, sunArcY, sunR, 0, Math.PI * 2);
        ctx.fill();

        // 3. 云朵（独立水平漂移，3-5 朵）
        this._renderClouds(ctx, width, roadTop, isNight);

        // 4. 远景城市建筑剪影（最远一层）
        this._renderSkyline(ctx, width, roadTop);

        // 5. 三层视差远山（每层独立滚动速度，制造深度）
        // 远山：基础 y + parallaxPhase * 0.04
        this._renderMountainLayer(ctx, width, height, roadTop, 0, '#1E3A5F', 0.35, 0.7);
        this._renderMountainLayer(ctx, width, height, roadTop, 1, '#0F1F3A', 0.5, 0.85);
        this._renderMountainLayer(ctx, width, height, roadTop, 2, '#020617', 0.65, 1.0);

        // 6. 地平线雾气（增强空气透视）
        const hazeGrad = ctx.createLinearGradient(0, roadTop - 6, 0, roadTop + 10);
        hazeGrad.addColorStop(0, 'rgba(147,197,253,0)');
        hazeGrad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
        hazeGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, roadTop - 6, width, 16);

        // 7. 路面（远端较亮，营造距离感）
        const roadGrad = ctx.createLinearGradient(0, roadTop, 0, height);
        roadGrad.addColorStop(0, '#52525B');
        roadGrad.addColorStop(0.4, '#27272A');
        roadGrad.addColorStop(1, '#09090B');
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, roadTop, width, height - roadTop);

        // 8. 草地路肩 + 黄色边线
        ctx.fillStyle = '#15803D';
        ctx.fillRect(0, roadTop, width, 4);
        ctx.fillStyle = '#FCD34D';
        ctx.fillRect(0, roadTop + 4, width, 2);
        ctx.fillRect(0, height - 6, width, 2);

        // 9. 7 车道：用 7 条深浅交替的色带 + 强对比白色实线分隔，6 条车道线永远肉眼可数
        this._renderLaneBands(ctx, width, height, roadTop);

        // 10. 路边景物（视差：景物滚 1.3x）
        this._renderScenery(ctx, width, height, this.sceneryLeft, 0, true, roadTop);
        this._renderScenery(ctx, width, height, this.sceneryRight, width, false, roadTop);
    }

    /**
     * 在 4 个时间预设之间按 dayPhase 插值（白天/黄昏/夜晚/黎明 → 白天）
     * 用 smoothstep 让过渡更自然
     */
    _lerpSkyPreset(presets, phase) {
        const N = presets.length;
        const scaled = phase * N;
        const idx0 = Math.floor(scaled) % N;
        const idx1 = (idx0 + 1) % N;
        let t = scaled - Math.floor(scaled);
        // smoothstep
        t = t * t * (3 - 2 * t);
        const a = presets[idx0], b = presets[idx1];
        return {
            top: this._lerpColor(a.top, b.top, t),
            mid: this._lerpColor(a.mid, b.mid, t),
            bot: this._lerpColor(a.bot, b.bot, t)
        };
    }

    _lerpColor(c1, c2, t) {
        // c1, c2 = '#RRGGBB'
        const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
        const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    }

    /**
     * 云朵：3-5 朵随机高度，独立水平漂移
     * 玩家抬头加速时云朵也跟着走得更快（用 playerSpeed 缩放）
     */
    _renderClouds(ctx, width, roadTop, isNight) {
        if (!this.clouds || this.clouds.length === 0) {
            this.clouds = [];
            for (let i = 0; i < 4; i++) {
                this.clouds.push({
                    x: Math.random() * width,
                    y: roadTop * (0.15 + Math.random() * 0.55),
                    r: 10 + Math.random() * 14,
                    speed: 0.005 + Math.random() * 0.012,  // 屏宽/秒
                    alpha: 0.35 + Math.random() * 0.35
                });
            }
        }
        const scrollMul = this.playerSpeed || 1.0;
        for (const c of this.clouds) {
            c.x += c.speed * scrollMul * 16;  // 16ms 假设（这里实际 frame-rate，但量级合适）
            if (c.x - c.r * 2 > width) {
                c.x = -c.r * 2;
                c.y = roadTop * (0.15 + Math.random() * 0.55);
            }
            ctx.fillStyle = isNight ? `rgba(200,210,230,${c.alpha * 0.6})` : `rgba(255,255,255,${c.alpha})`;
            // 云朵 = 3 个并排圆形
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 0.8, c.y - c.r * 0.2, c.r * 0.85, 0, Math.PI * 2);
            ctx.arc(c.x - c.r * 0.8, c.y - c.r * 0.1, c.r * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 三层视差远山：每层有独立的 phase 滚动（offset 山峰轮廓）
     * 滚动速度与 playerSpeed 挂钩 → 抬头加速 → 山在飞
     */
    _renderMountainLayer(ctx, width, height, roadTop, layerIdx, color, ampScale, baseYRatio) {
        if (!this.mountainPhases) {
            this.mountainPhases = [0, 0, 0];
        }
        const scrollMul = this.playerSpeed || 1.0;
        // 每层不同基础速度：远层最慢，近层最快
        const layerSpeeds = [0.04, 0.08, 0.14];
        this.mountainPhases[layerIdx] += layerSpeeds[layerIdx] * scrollMul * 0.016;
        const phase = this.mountainPhases[layerIdx];

        const baseY = roadTop * baseYRatio;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, roadTop);
        // 用 sin 摆动 + 相位偏移制造山峰
        const peaks = 8;
        for (let i = 0; i <= peaks; i++) {
            const xNorm = i / peaks;
            const x = xNorm * width;
            const noise = Math.sin((xNorm * 6 + phase)) * 0.5 + Math.cos((xNorm * 4 - phase * 0.7)) * 0.3;
            const y = baseY - noise * height * 0.035 * ampScale;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, roadTop);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * N 车道色带：N 段**完全不同**深浅的色带 + (N-1) 条**完全实线**白色分隔
     * 远端也保持强对比，车道永远肉眼可数
     */
    _renderLaneBands(ctx, width, height, roadTop) {
        const roadH = height - roadTop;
        const N = this.lanes.length;
        // N 段**完全独立**的深浅（交替强弱），强制 N 段视觉可分
        const bandShades = ['#16161A', '#22222A', '#2D2D36', '#1B1B22', '#2D2D36', '#22222A', '#16161A'];
        const bandW = width / N;
        for (let i = 0; i < N; i++) {
            ctx.fillStyle = bandShades[i % bandShades.length];
            ctx.fillRect(i * bandW, roadTop, bandW, roadH);
        }
        // 路面渐变叠层（保留远亮近暗的纵深感）
        const overlay = ctx.createLinearGradient(0, roadTop, 0, height);
        overlay.addColorStop(0, 'rgba(82,82,91,0.45)');
        overlay.addColorStop(0.4, 'rgba(39,39,42,0.25)');
        overlay.addColorStop(1, 'rgba(9,9,11,0.1)');
        ctx.fillStyle = overlay;
        ctx.fillRect(0, roadTop, width, roadH);

        // (N-1) 条分隔线：直接从 lanes 数组计算边界，绝不硬编码
        // lanes=[...] → 边界=(lanes[i]+lanes[i+1])/2 等
        const sepXs = [];
        for (let i = 0; i < N - 1; i++) {
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
        // (legacy) 现已用 _renderMountainLayer 视差版本取代
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
                // 树：棕色树干 + 绿色树冠（双层）
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
            } else if (item.type === 'post') {
                // 路灯：金属杆 + 黄色灯泡
                ctx.fillStyle = '#52525B';
                ctx.fillRect(x - 1.5 * scale, y - 40 * scale, 3 * scale, 40 * scale);
                ctx.fillStyle = '#FEF08A';
                ctx.beginPath();
                ctx.arc(x, y - 40 * scale, 4 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(254,240,138,0.45)';
                ctx.beginPath();
                ctx.arc(x, y - 40 * scale, 8 * scale, 0, Math.PI * 2);
                ctx.fill();
            } else if (item.type === 'billboard') {
                // 广告牌：双柱 + 彩色面板
                ctx.fillStyle = '#374151';
                ctx.fillRect(x - 1.5 * scale, y - 10 * scale, 3 * scale, 10 * scale);
                ctx.fillRect(x - 1.5 * scale, y - 50 * scale, 3 * scale, 10 * scale);
                const palette = ['#DC2626', '#2563EB', '#F59E0B', '#7C3AED', '#10B981'];
                const c = palette[Math.floor(item.y * 1000) % palette.length];
                ctx.fillStyle = c;
                ctx.fillRect(x - 18 * scale, y - 50 * scale, 36 * scale, 40 * scale);
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(x - 18 * scale, y - 50 * scale, 36 * scale, 40 * scale);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `${Math.max(8, 10 * scale)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('AD', x, y - 30 * scale);
            } else if (item.type === 'building') {
                // 远景建筑：矩形 + 顶部天线 + 几个亮窗
                const bh = 55 * scale;
                const bw = 28 * scale;
                ctx.fillStyle = '#1E293B';
                ctx.fillRect(x - bw / 2, y - bh, bw, bh);
                ctx.fillStyle = '#0F172A';
                ctx.fillRect(x - 1 * scale, y - bh - 8 * scale, 2 * scale, 8 * scale);
                // 窗户（黄色亮点）
                for (let r = 0; r < 4; r++) {
                    for (let cc = 0; cc < 2; cc++) {
                        if ((r * 2 + cc + Math.floor(item.y * 100)) % 3 === 0) {
                            ctx.fillStyle = 'rgba(254,240,138,0.7)';
                            ctx.fillRect(x - bw / 2 + 4 * scale + cc * 12 * scale, y - bh + 6 * scale + r * 12 * scale, 4 * scale, 6 * scale);
                        }
                    }
                }
            } else if (item.type === 'mountain') {
                // 远山小三角（与天空相接）
                ctx.fillStyle = '#1E3A5F';
                ctx.beginPath();
                ctx.moveTo(x - 22 * scale, y);
                ctx.lineTo(x, y - 35 * scale);
                ctx.lineTo(x + 22 * scale, y);
                ctx.closePath();
                ctx.fill();
                // 雪顶
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.beginPath();
                ctx.moveTo(x - 6 * scale, y - 22 * scale);
                ctx.lineTo(x, y - 35 * scale);
                ctx.lineTo(x + 6 * scale, y - 22 * scale);
                ctx.closePath();
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
     * 30% 概率触发"车队 convoys"：相邻 2 车道同时出车
     * 18% 概率额外发一串金币（纵向 3-5 枚），6% 概率发一个加速道具
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

        // 金币链：在车队旁边的空闲车道纵向铺 3-5 枚金币
        if (obstacleList.length < cfg.maxObstacles && Math.random() < cfg.coinChainChance) {
            // 找一条车队没用过的车道
            const freeLanes = [];
            for (let i = 0; i < this.lanes.length; i++) {
                if (!usedLanes.has(i)) freeLanes.push(i);
            }
            if (freeLanes.length > 0) {
                const coinLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
                const coinX = this.lanes[coinLane];
                const [cMin, cMax] = cfg.coinChainLength;
                const chainLen = cMin + Math.floor(Math.random() * (cMax - cMin + 1));
                const roadTopNorm = 0.22;
                // 纵向间距 0.07（屏幕上）
                for (let k = 0; k < chainLen; k++) {
                    if (obstacleList.length >= cfg.maxObstacles) break;
                    const cy = roadTopNorm - 0.08 - k * 0.07;
                    obstacleList.push(new ObstacleCoin({
                        x: coinX,
                        y: cy,
                        speedY: 0.30,
                        speedX: 0
                    }));
                }
            }
        }

        // 加速道具：6% 概率单独刷一个（与车队/金币不冲突）
        if (obstacleList.length < cfg.maxObstacles && Math.random() < cfg.boostChance) {
            const freeLanes = [];
            for (let i = 0; i < this.lanes.length; i++) {
                if (!usedLanes.has(i)) freeLanes.push(i);
            }
            if (freeLanes.length > 0) {
                const boostLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
                obstacleList.push(new ObstacleBoost({
                    x: this.lanes[boostLane],
                    y: 0.14,
                    speedY: 0.30
                }));
            }
        }

        this.lastSpawnTime = this.gameTime;
    }

    mapInputToPosition(inputPos, player) {
        // 缓存 pitch 速度倍率，下一帧 update() 用来缩放路面/景物滚动
        if (typeof inputPos.speed === 'number') {
            this.playerSpeed = inputPos.speed;
        }
        return { x: inputPos.x, y: 0.85 };
    }

    /**
     * 激活加速道具：lineSpeed 临时翻倍 + 持续 4 秒
     * 玩家通过此方法能直观感受到"吃了道具"的主观加速
     */
    activateBoost() {
        this.boostTimer = 4.0;
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
