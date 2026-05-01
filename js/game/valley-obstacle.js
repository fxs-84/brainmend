// ============================================================
// VALLEY OBSTACLE - 峡谷障碍物（水晶能量墙）
// ============================================================

export class ValleyObstacle {
    constructor(config = {}) {
        this.x = config.x || 0.5;          // 归一化X位置
        this.y = config.y || 0.5;           // 归一化Y位置
        this.z = config.z || 150;           // 深度（远处）
        this.width = config.width || 0.12;  // 归一化宽度
        this.height = config.height || 0.15; // 归一化高度
        this.colorIndex = config.colorIndex || Math.floor(Math.random() * 5);
        this.active = true;
        this.passed = false;  // 是否已通过玩家
        this.glowPhase = Math.random() * Math.PI * 2;
        this.glowSpeed = 2 + Math.random() * 2;
    }

    update(dt, speedMultiplier = 1) {
        // 向玩家移动（z减小）
        this.z -= 1.5 * speedMultiplier * dt * 60;

        // 更新发光相位
        this.glowPhase += this.glowSpeed * dt;

        // 检查是否通过玩家
        if (this.z < 0 && !this.passed) {
            this.passed = true;
        }
    }

    // 获取透视缩放
    getScale() {
        return 1 / (1 + this.z * 0.008);
    }

    // 碰撞检测（使用归一化坐标）
    checkCollision(playerX, playerY, playerRadius) {
        if (!this.active || this.passed) return false;

        // 计算屏幕位置
        const scale = this.getScale();
        const obstacleScreenX = this.x;
        const obstacleScreenY = this.y;

        // 计算实际碰撞箱（考虑透视缩放）
        const hitboxWidth = this.width * scale * 0.8;
        const hitboxHeight = this.height * scale * 0.8;

        // AABB碰撞检测
        const dx = Math.abs(playerX - obstacleScreenX);
        const dy = Math.abs(playerY - obstacleScreenY);

        return (dx < (hitboxWidth / 2 + playerRadius)) &&
               (dy < (hitboxHeight / 2 + playerRadius));
    }

    // 是否移出屏幕
    isOffScreen(width, height) {
        return this.z < -20 || this.passed;
    }

    // 渲染
    render(ctx) {
        if (!this.active || this.passed) return;

        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const horizonY = height * 0.4;

        // 计算透视缩放
        const scale = this.getScale();
        const screenX = this.x * width;
        const screenY = horizonY + (height - horizonY) * (1 - scale) * (this.y - 0.5) * 2 + (height - horizonY) * 0.3;

        const w = this.width * width * scale;
        const h = this.height * height * scale;

        // 颜色方案
        const colors = ['#ff00ff', '#00ffff', '#ff6600', '#00ff88', '#aa00ff'];
        const color = colors[this.colorIndex % colors.length];

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(scale, scale);

        // 动态发光强度
        const glowIntensity = 0.6 + 0.4 * Math.sin(this.glowPhase);

        // 外发光
        ctx.shadowColor = color;
        ctx.shadowBlur = 25 * glowIntensity;

        // 半透明填充
        ctx.fillStyle = this.hexToRgba(color, 0.3);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;

        // 水晶形状（不规则多边形）
        ctx.beginPath();
        const points = 6;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
            const radiusX = (w / 2) * (0.6 + Math.sin(i * 2.5) * 0.2);
            const radiusY = (h / 2) * (0.6 + Math.cos(i * 2.5) * 0.2);
            const px = Math.cos(angle) * radiusX;
            const py = Math.sin(angle) * radiusY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 内部能量纹路
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 * glowIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-w * 0.2, -h * 0.3);
        ctx.lineTo(w * 0.1, h * 0.2);
        ctx.moveTo(w * 0.15, -h * 0.2);
        ctx.lineTo(-w * 0.1, h * 0.3);
        ctx.stroke();

        // 顶部装饰
        ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * glowIntensity})`;
        ctx.beginPath();
        ctx.arc(0, -h * 0.3, w * 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}