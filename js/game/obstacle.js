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
     */
    isOffScreen(canvasWidth, canvasHeight) {
        return (
            this.y > 1.1 ||  // 下方超出
            this.y < -0.1 ||  // 上方超出
            this.x < -0.1 ||  // 左侧超出
            this.x > 1.1     // 右侧超出
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
        return this.x < -0.2;
    }
}

// ============================================================
// OBSTACLE VEHICLE - 车辆
// ============================================================

export class ObstacleVehicle extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.04,
            speedY: config.speedY || 0.12,
            type: 'vehicle',
            color: config.lane === 0 ? '#3B82F6' : '#EF4444',
            ...config
        });

        this.width = 0.08;
        this.height = 0.06;
        this.lane = config.lane || 0;  // 0=左侧, 1=右侧
    }

    update(dt, speedMultiplier = 1) {
        // 车辆主要向下移动
        this.y += this.speedY * dt * speedMultiplier;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const w = this.width * ctx.canvas.width;
        const h = this.height * ctx.canvas.height;

        ctx.save();
        ctx.translate(pos.x, pos.y);

        // 车身
        ctx.fillStyle = this.color;
        ctx.fillRect(-w / 2, -h / 2, w, h);

        // 车窗
        ctx.fillStyle = '#1E3A5F';
        ctx.fillRect(-w / 3, -h / 3, w * 0.6, h * 0.4);

        ctx.restore();
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
