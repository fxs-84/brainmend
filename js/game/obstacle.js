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
