// ============================================================
// OBSTACLE - 障碍物基类
// ============================================================

export class Obstacle {
    constructor(config = {}) {
        // 位置（归一化 0-1）
        this.x = config.x || 0.5;
        this.y = config.y || 0;

        // 尺寸（归一化）
        this.radius = config.radius || 0.03;

        // 速度（归一化/秒）
        this.speedY = config.speedY || 0.1;  // 向下移动
        this.speedX = config.speedX || 0;

        // 旋转角度
        this.rotation = 0;
        this.rotationSpeed = config.rotationSpeed || 0;

        // 类型标识
        this.type = config.type || 'basic';

        // 颜色
        this.color = config.color || '#EF4444';

        // 是否激活
        this.active = true;
    }

    /**
     * 更新位置
     */
    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.y += this.speedY * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;
    }

    /**
     * 渲染
     */
    render(ctx) {
        // 子类实现
    }

    /**
     * 检查是否移出屏幕
     * 子类可基于自身尺寸覆盖此方法，基类使用通用阈值
     */
    isOffScreen(canvasWidth, canvasHeight) {
        return (
            this.y > 1.15 ||
            this.y < -0.15 ||
            this.x < -0.15 ||
            this.x > 1.15
        );
    }

    /**
     * 获取实际像素坐标
     */
    getPixelPosition(canvasWidth, canvasHeight) {
        return {
            x: this.x * canvasWidth,
            y: this.y * canvasHeight,
            radius: this.radius * Math.min(canvasWidth, canvasHeight)
        };
    }
}

// ============================================================
// OBSTACLE METEOR - 陨石
// ============================================================

export class ObstacleMeteor extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || Math.random() * 0.8 + 0.1,
            y: config.y || -0.1,
            radius: config.size === 'small' ? 0.025 :
                    config.size === 'large' ? 0.05 : 0.035,
            speedY: config.speedY || 0.15,
            speedX: (Math.random() - 0.5) * 0.05,
            rotationSpeed: (Math.random() - 0.5) * 2,
            type: 'meteor',
            color: '#8B5CF6',
            ...config
        });

        this.sizeType = config.size || 'medium';
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(this.rotation);

        // 绘制陨石（不规则多边形）
        ctx.beginPath();
        const points = 7;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const r = pos.radius * (0.7 + Math.random() * 0.3);
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#A78BFA';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

// ============================================================
// OBSTACLE GATE - 门型障碍（一对陨石中间有通道）
// ============================================================

export class ObstacleGate extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 1.1,
            y: config.y || 0.5,
            radius: config.radius || 0.04,
            speedX: config.speedX || -0.12,
            speedY: 0,
            type: 'gate',
            color: '#EF4444'
        });

        // 门型障碍：上下两个陨石，中间留出通道
        this.upperMeteorSize = config.upperSize || 'large';
        this.lowerMeteorSize = config.lowerSize || 'large';
        this.gapCenter = config.gapCenter || 0.5;  // 通道中心位置 (0-1)
        this.gapSize = config.gapSize || 0.2;     // 通道大小 (0-1)

        // 固定垂直位置
        this.upperY = this.gapCenter + this.gapSize / 2 + 0.08;
        this.lowerY = this.gapCenter - this.gapSize / 2 - 0.08;
    }

    update(dt, speedMultiplier = 1) {
        // 只在X方向移动
        this.x += this.speedX * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const upperRadius = this._getSizeRadius(this.upperMeteorSize);
        const lowerRadius = this._getSizeRadius(this.lowerMeteorSize);
        const upperY = this.upperY * ctx.canvas.height;
        const lowerY = this.lowerY * ctx.canvas.height;

        ctx.save();

        // 上方陨石
        ctx.beginPath();
        ctx.arc(pos.x, upperY, upperRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#8B5CF6';
        ctx.fill();
        ctx.strokeStyle = '#A78BFA';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 下方陨石
        ctx.beginPath();
        ctx.arc(pos.x, lowerY, lowerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#8B5CF6';
        ctx.fill();
        ctx.strokeStyle = '#A78BFA';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 绘制通道提示线（虚线）
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(0, 217, 165, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pos.x, upperY - upperRadius);
        ctx.lineTo(pos.x, lowerY + lowerRadius);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    }

    _getSizeRadius(size) {
        const minDim = Math.min(ctx.canvas.width, ctx.canvas.height);
        switch (size) {
            case 'small': return 0.025 * minDim;
            case 'large': return 0.055 * minDim;
            default: return 0.04 * minDim;
        }
    }

    // 门型障碍的碰撞检测需要检查上下两个陨石
    checkCollision(playerX, playerY, playerRadius) {
        const minDim = Math.min(ctx.canvas.width, ctx.canvas.height);
        const upperRadius = this._getSizeRadius(this.upperMeteorSize) / minDim;
        const lowerRadius = this._getSizeRadius(this.lowerMeteorSize) / minDim;

        // 检查上方陨石碰撞
        const dx1 = playerX - this.x;
        const dy1 = playerY - this.upperY;
        if (Math.sqrt(dx1 * dx1 + dy1 * dy1) < playerRadius + upperRadius) {
            return true;
        }

        // 检查下方陨石碰撞
        const dx2 = playerX - this.x;
        const dy2 = playerY - this.lowerY;
        if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < playerRadius + lowerRadius) {
            return true;
        }

        return false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < -0.2;
    }
}

// ============================================================
// OBSTACLE WAVE - 波浪型障碍（多个陨石排列成波浪）
// ============================================================

export class ObstacleWave extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 1.1,
            y: config.y || 0.5,
            radius: 0.03,
            speedX: config.speedX || -0.1,
            type: 'wave',
            color: '#F59E0B'
        });

        this.meteorCount = config.count || 5;
        this.waveAmplitude = config.amplitude || 0.15;  // 波浪幅度
        this.waveFrequency = config.frequency || 2;     // 波浪频率
        this.baseY = config.baseY || 0.5;               // 基础Y位置
        this.phase = Math.random() * Math.PI * 2;      // 随机相位
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.phase += dt * 3;  // 波浪相位变化
    }

    // 获取第i个陨石的Y位置
    getMeteorY(index) {
        return this.baseY + Math.sin(this.phase + index * this.waveFrequency * 0.5) * this.waveAmplitude;
    }

    render(ctx) {
        ctx.save();

        for (let i = 0; i < this.meteorCount; i++) {
            const meteorX = this.x * ctx.canvas.width;
            const meteorY = this.getMeteorY(i) * ctx.canvas.height;
            const radius = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

            ctx.beginPath();
            ctx.arc(meteorX, meteorY, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = '#FCD34D';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }

    // 波浪型碰撞检测（遍历所有陨石）
    checkCollision(playerX, playerY, playerRadius) {
        for (let i = 0; i < this.meteorCount; i++) {
            const dx = playerX - this.x;
            const dy = playerY - this.getMeteorY(i);
            if (Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius) {
                return true;
            }
        }
        return false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < -0.2;
    }
}

// ============================================================
// OBSTACLE SPIRAL - 螺旋型障碍（旋转的多个点）
// ============================================================

export class ObstacleSpiral extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 1.1,
            y: config.y || 0.5,
            radius: 0.025,
            speedX: config.speedX || -0.15,
            type: 'spiral',
            color: '#EC4899'
        });

        this.armCount = config.arms || 3;
        this.armLength = config.armLength || 0.15;
        this.rotationAngle = 0;
        this.rotationSpeed = config.rotationSpeed || 2;
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.rotationAngle += this.rotationSpeed * dt;
    }

    render(ctx) {
        ctx.save();

        for (let i = 0; i < this.armCount; i++) {
            const angle = this.rotationAngle + (i * Math.PI * 2 / this.armCount);
            const endX = this.x * ctx.canvas.width + Math.cos(angle) * this.armLength * ctx.canvas.width;
            const endY = this.y * ctx.canvas.height + Math.sin(angle) * this.armLength * ctx.canvas.height;
            const radius = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

            // 绘制螺旋臂
            ctx.beginPath();
            ctx.moveTo(this.x * ctx.canvas.width, this.y * ctx.canvas.height);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.stroke();

            // 绘制末端点
            ctx.beginPath();
            ctx.arc(endX, endY, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        // 中心点
        ctx.beginPath();
        ctx.arc(this.x * ctx.canvas.width, this.y * ctx.canvas.height, radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#F472B6';
        ctx.fill();

        ctx.restore();
    }

    checkCollision(playerX, playerY, playerRadius) {
        // 检查中心
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        if (Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius * 0.6) {
            return true;
        }

        // 检查每个臂的末端
        for (let i = 0; i < this.armCount; i++) {
            const angle = this.rotationAngle + (i * Math.PI * 2 / this.armCount);
            const armEndX = this.x + Math.cos(angle) * this.armLength;
            const armEndY = this.y + Math.sin(angle) * this.armLength;
            const dx = playerX - armEndX;
            const dy = playerY - armEndY;
            if (Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius) {
                return true;
            }
        }
        return false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.y > 1.15 || this.y < -0.15 || this.x < -0.15 || this.x > 1.15;
    }
}

// ============================================================
// OBSTACLE VEHICLE - 车辆
// ============================================================

import { drawCarTopDown } from './car-renderer.js';

export class ObstacleVehicle extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.045,
            speedY: config.speedY || 0.12,
            type: 'vehicle',
            ...config
        });

        this.width = 0.055;
        this.height = 0.14;
        this.lane = config.lane ?? 0;
        this.bodyColor = config.bodyColor || '#3B82F6';
        this.trimColor = config.trimColor || '#1E3A8A';
        this.carType = config.carType || 'sedan';

        // 运动效果：尾气 + 微震动
        this.exhaustParticles = [];
        this.exhaustTimer = 0;
        this.exhaustInterval = 0.12;
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 12 + Math.random() * 4;
        this.wobbleAmplitude = 0.0015;
    }

    update(dt, speedMultiplier = 1) {
        this.y += this.speedY * dt * speedMultiplier;
        this.wobblePhase += this.wobbleSpeed * dt;
        this._updateExhaust(dt);
    }

    _updateExhaust(dt) {
        this.exhaustTimer += dt;
        if (this.exhaustTimer >= this.exhaustInterval) {
            this.exhaustTimer = 0;
            // 排气管位置：稍低于车尾保险杠，营造"喷出"感
            // 排气位置随透视 y 缩放（远小近大）
            const sc = this._perspectiveScale();
            for (const offset of [-0.014, 0.014]) {
                this.exhaustParticles.push({
                    x: this.x + offset * sc + (Math.random() - 0.5) * 0.004 * sc,
                    y: this.y + this.height * 0.5 * sc + 0.006 * sc,
                    life: 0.7,
                    age: 0,
                    vy: this.speedY + 0.06 + Math.random() * 0.04,
                    size: (1.4 + Math.random() * 0.6) * sc
                });
            }
        }
        for (const p of this.exhaustParticles) {
            p.age += dt;
            p.y += p.vy * dt;
            p.size += dt * 5;
        }
        this.exhaustParticles = this.exhaustParticles.filter(p => p.age < p.life);
        if (this.exhaustParticles.length > 25) {
            this.exhaustParticles.splice(0, this.exhaustParticles.length - 25);
        }
    }

    /**
     * 透视缩放：远端车小，近端车大
     * 玩家车位置 y=0.85 作为参考基准
     * y=0.05（远端）→ scale 0.35
     * y=0.50（中部）→ scale 0.65
     * y=0.85（玩家）→ scale 1.0
     */
    _perspectiveScale() {
        // 归一化 y 到 [0,1]，y/0.85 作为缩放因子
        const p = Math.max(0, Math.min(1, this.y / 0.85));
        return 0.35 + p * 0.65;
    }

    /**
     * 车辆用 height 边界判定离屏（基类用固定阈值太宽）
     */
    isOffScreen(canvasWidth, canvasHeight) {
        const sc = this._perspectiveScale();
        const h = this.height * sc;
        return (
            this.y - h / 2 > 1.05 ||
            this.y + h / 2 < -0.05 ||
            this.x - this.width * sc / 2 > 1.1 ||
            this.x + this.width * sc / 2 < -0.1
        );
    }

    render(ctx) {
        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;
        const sc = this._perspectiveScale();

        // 1. 尾气粒子（透视缩放）
        for (const p of this.exhaustParticles) {
            const px = p.x * cw;
            const py = p.y * ch;
            const alpha = Math.max(0, 1 - p.age / p.life) * 0.45;
            ctx.fillStyle = `rgba(140,148,158,${alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, p.size * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. 车体（透视缩放 + 微震动）
        const pos = this.getPixelPosition(cw, ch);
        const w = this.width * cw * sc;
        const h = this.height * ch * sc;
        const wobbleX = Math.sin(this.wobblePhase) * this.wobbleAmplitude * cw * sc;

        drawCarTopDown(ctx, pos.x + wobbleX, pos.y, w, h, {
            body: this.bodyColor,
            trim: this.trimColor,
            windowTint: 'rgba(186,230,253,0.78)',
            carType: this.carType,
            isPlayer: false
        });
    }
}

// ============================================================
// OBSTACLE BALL - 球
// ============================================================

export class ObstacleBall extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.035,
            speedY: config.speedY || 0.18,
            speedX: config.speedX || (Math.random() - 0.5) * 0.1,
            type: 'ball',
            color: config.color || '#F59E0B',
            ...config
        });

        this.gravity = 0.05;
    }

    update(dt, speedMultiplier = 1) {
        // 抛物线运动
        this.speedY += this.gravity * dt;
        this.y += this.speedY * dt * speedMultiplier;
        this.x += this.speedX * dt;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(pos.x, pos.y);

        // 球体
        ctx.beginPath();
        ctx.arc(0, 0, pos.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#FCD34D';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 高光
        ctx.beginPath();
        ctx.arc(-pos.radius * 0.3, -pos.radius * 0.3, pos.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();

        ctx.restore();
    }
}

// ============================================================
// OBSTACLE COIN - 金币
// ============================================================

export class ObstacleCoin extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || Math.random() * 0.6 + 0.2,
            y: config.y || -0.1,
            radius: 0.025,
            speedY: config.speedY || 0.12,
            speedX: (Math.random() - 0.5) * 0.02,
            type: 'coin',
            color: '#FFD700',
            ...config
        });

        this.rotationAngle = 0;
        this.rotationSpeed = config.rotationSpeed || 5;
        this.bobPhase = Math.random() * Math.PI * 2;
        this.bobSpeed = 3;
        this.bobAmplitude = 0.03;
        this.baseY = this.y;
        this.sparkleTimer = 0;
        this.sparkleInterval = 0.1;
        this.isCollected = false;
    }

    update(dt, speedMultiplier = 1) {
        this.y += this.speedY * dt * speedMultiplier;
        this.x += this.speedX * dt;
        this.rotationAngle += this.rotationSpeed * dt;
        this.bobPhase += this.bobSpeed * dt;
        const bobOffset = Math.sin(this.bobPhase) * this.bobAmplitude;
        this.renderY = this.y + bobOffset;
        this.sparkleTimer += dt;
    }

    render(ctx) {
        if (this.isCollected) return;

        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const x = pos.x;
        const y = this.renderY * ctx.canvas.height;
        const radius = pos.radius;

        ctx.save();
        ctx.translate(x, y);

        const scaleX = Math.abs(Math.cos(this.rotationAngle));
        if (scaleX > 0.1) {
            ctx.scale(Math.max(0.1, scaleX), 1);

            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            gradient.addColorStop(0, '#FFFACD');
            gradient.addColorStop(0.3, '#FFD700');
            gradient.addColorStop(0.7, '#FFA500');
            gradient.addColorStop(1, '#FF8C00');
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.strokeStyle = '#DAA520';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#B8860B';
            ctx.font = `bold ${radius * 1.2}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', 0, 0);
        }

        ctx.restore();

        if (this.sparkleTimer > this.sparkleInterval) {
            this.sparkleTimer = 0;
            this.renderSparkle(ctx, x, y, radius);
        }
    }

    renderSparkle(ctx, x, y, radius) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        const sparkleSize = radius * 1.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - sparkleSize, y);
        ctx.lineTo(x + sparkleSize, y);
        ctx.moveTo(x, y - sparkleSize);
        ctx.lineTo(x, y + sparkleSize);
        ctx.stroke();
        ctx.restore();
    }

    collect() {
        this.isCollected = true;
        this.active = false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.y > 1.1 || this.x < -0.1 || this.x > 1.1;
    }
}

// ============================================================
// OBSTACLE BOOST - 加速道具（闪电图标）
// 玩家撞到后 lineSpeed 临时翻倍 + 加分
// ============================================================

export class ObstacleBoost extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.038,
            speedY: config.speedY || 0.32,
            type: 'boost',
            color: '#FCD34D',
            ...config
        });

        this.rotationAngle = 0;
        this.rotationSpeed = 3.5;
        this.bobPhase = Math.random() * Math.PI * 2;
        this.bobSpeed = 4;
        this.bobAmplitude = 0.02;
        this.isCollected = false;
    }

    update(dt, speedMultiplier = 1) {
        this.y += this.speedY * dt * speedMultiplier;
        this.rotationAngle += this.rotationSpeed * dt;
        this.bobPhase += this.bobSpeed * dt;
        this.renderY = this.y + Math.sin(this.bobPhase) * this.bobAmplitude;
    }

    render(ctx) {
        if (this.isCollected) return;

        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;
        const px = this.x * cw;
        const py = this.renderY * ch;
        const r = this.radius * Math.min(cw, ch);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(this.rotationAngle);

        // 外光晕
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
        glow.addColorStop(0, 'rgba(252,211,77,0.55)');
        glow.addColorStop(0.4, 'rgba(252,211,77,0.2)');
        glow.addColorStop(1, 'rgba(252,211,77,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // 黄色圆盘
        ctx.fillStyle = '#FCD34D';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 深色描边
        ctx.strokeStyle = '#92400E';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 闪电符号
        ctx.fillStyle = '#7C2D12';
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, -r * 0.55);
        ctx.lineTo(r * 0.22, -r * 0.10);
        ctx.lineTo(r * 0.04, -r * 0.05);
        ctx.lineTo(r * 0.22, r * 0.55);
        ctx.lineTo(-r * 0.20, r * 0.05);
        ctx.lineTo(-r * 0.02, r * 0.00);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    collect() {
        this.isCollected = true;
        this.active = false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.y > 1.1 || this.x < -0.1 || this.x > 1.1;
    }
}
