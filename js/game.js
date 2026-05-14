// ============================================================
// GAME MODULE - 颈椎康复游戏系统 (Combined)
// ============================================================

// ============================================================
// OBSTACLE CLASSES - 障碍物类型
// ============================================================
class Obstacle {
    constructor(config = {}) {
        this.x = config.x || 0.5;
        this.y = config.y || 0;
        this.radius = config.radius || 0.03;
        this.speedY = config.speedY || 0.1;
        this.speedX = config.speedX || 0;
        this.rotation = 0;
        this.rotationSpeed = config.rotationSpeed || 0;
        this.type = config.type || 'basic';
        this.color = config.color || '#EF4444';
        this.active = true;
    }
    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.y += this.speedY * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;
    }
    render(ctx) {}
    isOffScreen(canvasWidth, canvasHeight) {
        return this.y > 1.1 || this.y < -0.1 || this.x < -0.1 || this.x > 1.1;
    }
    getPixelPosition(canvasWidth, canvasHeight) {
        return {
            x: this.x * canvasWidth,
            y: this.y * canvasHeight,
            radius: this.radius * Math.min(canvasWidth, canvasHeight)
        };
    }
}

class ObstacleMeteor extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || Math.random() * 0.8 + 0.1,
            y: config.y || -0.1,
            radius: config.size === 'small' ? 0.025 : config.size === 'large' ? 0.05 : 0.035,
            speedY: config.speedY || 0.15,
            speedX: config.speedX !== undefined ? config.speedX : (Math.random() - 0.5) * 0.05,
            rotationSpeed: (Math.random() - 0.5) * 2,
            type: 'meteor',
            color: '#8B5CF6',
            ...config
        });
        this.sizeType = config.size || 'medium';
        this.vertices = [];
        for (let i = 0; i < 12; i++) {
            this.vertices.push(0.55 + Math.random() * 0.55);
        }
        this.craters = [];
        for (let i = 0; i < 5; i++) {
            this.craters.push({
                x: (Math.random() - 0.5) * 0.9,
                y: (Math.random() - 0.5) * 0.9,
                r: 0.08 + Math.random() * 0.12
            });
        }
        // 熔岩裂缝
        this.cracks = [];
        for (let i = 0; i < 4; i++) {
            const startAngle = Math.random() * Math.PI * 2;
            const length = 0.3 + Math.random() * 0.4;
            this.cracks.push({ startAngle, length, branches: Math.floor(Math.random() * 2) + 1 });
        }
    }
    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(this.rotation);

        // 强外发光 - 光感
        ctx.shadowColor = '#C4B5FD';
        ctx.shadowBlur = pos.radius * 1.2;

        // 绘制陨石主体 - 不规则多边形
        ctx.beginPath();
        for (let i = 0; i < this.vertices.length; i++) {
            const angle = (i / this.vertices.length) * Math.PI * 2;
            const r = pos.radius * this.vertices[i];
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();

        // 多层渐变填充 - 光感更强
        const gradient = ctx.createRadialGradient(
            -pos.radius * 0.35, -pos.radius * 0.35, 0,
            0, 0, pos.radius * 1.4
        );
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.08, '#F5F3FF');
        gradient.addColorStop(0.2, '#E9D5FF');
        gradient.addColorStop(0.35, '#C4B5FD');
        gradient.addColorStop(0.55, '#8B5CF6');
        gradient.addColorStop(0.75, '#7C3AED');
        gradient.addColorStop(1, '#4C1D95');
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.shadowBlur = 0;

        // 边缘光晕（轮廓光）- 模拟光照从背后照射
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < this.vertices.length; i++) {
            const angle = (i / this.vertices.length) * Math.PI * 2;
            const r = pos.radius * this.vertices[i] * 1.05;
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        // 外轮廓
        ctx.strokeStyle = '#5B21B6';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 陨石坑
        for (const crater of this.craters) {
            const cx = pos.radius * crater.x;
            const cy = pos.radius * crater.y;
            const cr = pos.radius * crater.r;

            // 坑阴影
            ctx.beginPath();
            ctx.arc(cx + cr * 0.3, cy + cr * 0.3, cr, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(49, 9, 111, 0.7)';
            ctx.fill();

            // 坑本身
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            const craterGrad = ctx.createRadialGradient(cx - cr * 0.2, cy - cr * 0.2, 0, cx, cy, cr);
            craterGrad.addColorStop(0, 'rgba(76, 29, 149, 0.5)');
            craterGrad.addColorStop(0.7, 'rgba(49, 9, 111, 0.8)');
            craterGrad.addColorStop(1, 'rgba(30, 7, 73, 0.9)');
            ctx.fillStyle = craterGrad;
            ctx.fill();

            // 坑边缘高光
            ctx.beginPath();
            ctx.arc(cx, cy, cr, -Math.PI * 0.8, -Math.PI * 0.3);
            ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // 熔岩裂缝 - 发光效果
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = pos.radius * 0.3;
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.lineWidth = 2;
        for (const crack of this.cracks) {
            const startX = Math.cos(crack.startAngle) * pos.radius * 0.2;
            const startY = Math.sin(crack.startAngle) * pos.radius * 0.2;
            const endX = Math.cos(crack.startAngle) * pos.radius * crack.length;
            const endY = Math.sin(crack.startAngle) * pos.radius * crack.length;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // 分支
            for (let b = 0; b < crack.branches; b++) {
                const branchStart = 0.4 + Math.random() * 0.3;
                const bx = startX + (endX - startX) * branchStart;
                const by = startY + (endY - startY) * branchStart;
                const branchAngle = crack.startAngle + (Math.random() - 0.5) * Math.PI * 0.6;
                const branchLen = pos.radius * 0.15 * Math.random();

                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + Math.cos(branchAngle) * branchLen, by + Math.sin(branchAngle) * branchLen);
                ctx.stroke();
            }
        }
        ctx.shadowBlur = 0;

        // 主高光 - 强光感
        ctx.beginPath();
        ctx.arc(-pos.radius * 0.3, -pos.radius * 0.3, pos.radius * 0.28, 0, Math.PI * 2);
        const highlightGrad = ctx.createRadialGradient(
            -pos.radius * 0.3, -pos.radius * 0.3, 0,
            -pos.radius * 0.3, -pos.radius * 0.3, pos.radius * 0.4
        );
        highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        highlightGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
        highlightGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
        highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlightGrad;
        ctx.fill();

        // 次高光
        ctx.beginPath();
        ctx.arc(-pos.radius * 0.08, -pos.radius * 0.42, pos.radius * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fill();

        // 高光条纹 - 湿漉漉的光泽感
        ctx.beginPath();
        ctx.ellipse(-pos.radius * 0.25, -pos.radius * 0.2, pos.radius * 0.25, pos.radius * 0.08, -Math.PI / 4, 0, Math.PI * 2);
        const streakGrad = ctx.createRadialGradient(
            -pos.radius * 0.25, -pos.radius * 0.2, 0,
            -pos.radius * 0.25, -pos.radius * 0.2, pos.radius * 0.3
        );
        streakGrad.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        streakGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = streakGrad;
        ctx.fill();

        ctx.restore();
    }
}

class ObstacleGate extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 1.1,
            y: config.y || 0.5,
            radius: 0.04,
            speedX: config.speedX || -0.12,
            speedY: 0,
            type: 'gate',
            color: '#8B5CF6'
        });
        this.upperMeteorSize = config.upperSize || 'large';
        this.lowerMeteorSize = config.lowerSize || 'large';
        this.gapCenter = config.gapCenter !== undefined ? config.gapCenter : 0.5;
        this.gapSize = config.gapSize || 0.2;
        this.upperY = this.gapCenter + this.gapSize / 2 + 0.08;
        this.lowerY = this.gapCenter - this.gapSize / 2 - 0.08;
        this.rotation = Math.random() * Math.PI;
        this.rotationSpeed = (Math.random() - 0.5) * 1.5;
    }
    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;
    }
    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const minDim = Math.min(ctx.canvas.width, ctx.canvas.height);
        const upperRadius = (this.upperMeteorSize === 'small' ? 0.025 : this.upperMeteorSize === 'large' ? 0.055 : 0.04) * minDim;
        const lowerRadius = (this.lowerMeteorSize === 'small' ? 0.025 : this.lowerMeteorSize === 'large' ? 0.055 : 0.04) * minDim;
        const upperY = this.upperY * ctx.canvas.height;
        const lowerY = this.lowerY * ctx.canvas.height;

        ctx.save();

        // 上方陨石
        ctx.save();
        ctx.translate(pos.x, upperY);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, upperRadius, 0, Math.PI * 2);
        const grad1 = ctx.createRadialGradient(-upperRadius * 0.3, -upperRadius * 0.3, 0, 0, 0, upperRadius);
        grad1.addColorStop(0, '#C4B5FD');
        grad1.addColorStop(1, '#4C1D95');
        ctx.fillStyle = grad1;
        ctx.fill();
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 下方陨石
        ctx.save();
        ctx.translate(pos.x, lowerY);
        ctx.rotate(-this.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, lowerRadius, 0, Math.PI * 2);
        const grad2 = ctx.createRadialGradient(-lowerRadius * 0.3, -lowerRadius * 0.3, 0, 0, 0, lowerRadius);
        grad2.addColorStop(0, '#C4B5FD');
        grad2.addColorStop(1, '#4C1D95');
        ctx.fillStyle = grad2;
        ctx.fill();
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 通道提示线
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(0, 217, 165, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x, upperY - upperRadius);
        ctx.lineTo(pos.x, lowerY + lowerRadius);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    checkCollision(playerX, playerY, playerRadius) {
        const minDim = Math.min(ctx.canvas.width, ctx.canvas.height);
        const upperRadius = (this.upperMeteorSize === 'small' ? 0.025 : this.upperMeteorSize === 'large' ? 0.055 : 0.04);
        const lowerRadius = (this.lowerMeteorSize === 'small' ? 0.025 : this.lowerMeteorSize === 'large' ? 0.055 : 0.04);
        const dx1 = playerX - this.x, dy1 = playerY - this.upperY;
        if (Math.sqrt(dx1 * dx1 + dy1 * dy1) < playerRadius + upperRadius) return true;
        const dx2 = playerX - this.x, dy2 = playerY - this.lowerY;
        if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < playerRadius + lowerRadius) return true;
        return false;
    }
    isOffScreen() { return this.x < -0.2; }
}

class ObstacleWave extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 1.1,
            y: config.y || 0.5,
            radius: 0.03,
            speedX: config.speedX || -0.06,  // 速度调慢
            type: 'wave',
            color: '#8B5CF6'
        });
        this.meteorCount = config.count || 5;
        this.waveAmplitude = config.amplitude || 0.15;
        this.waveFrequency = config.frequency || 2;
        this.baseY = config.baseY !== undefined ? config.baseY : 0.5;
        this.phase = Math.random() * Math.PI * 2;
        this.rotation = Math.random() * Math.PI;
    }
    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.phase += dt * 3;
        this.rotation += dt * 0.5;
    }
    getMeteorY(index) {
        return this.baseY + Math.sin(this.phase + index * this.waveFrequency * 0.5) * this.waveAmplitude;
    }
    render(ctx) {
        ctx.save();
        for (let i = 0; i < this.meteorCount; i++) {
            const meteorX = this.x * ctx.canvas.width;
            const meteorY = this.getMeteorY(i) * ctx.canvas.height;
            const radius = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

            ctx.save();
            ctx.translate(meteorX, meteorY);
            ctx.rotate(this.rotation + i * 0.5);

            // 陨石主体
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
            grad.addColorStop(0, '#C4B5FD');
            grad.addColorStop(1, '#4C1D95');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#7C3AED';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
    checkCollision(playerX, playerY, playerRadius) {
        for (let i = 0; i < this.meteorCount; i++) {
            const dx = playerX - this.x;
            const dy = playerY - this.getMeteorY(i);
            if (Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius) return true;
        }
        return false;
    }
    isOffScreen() { return this.x < -0.2; }
}

class ObstacleSpiral extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 1.1,
            y: config.y || 0.5,
            radius: 0.025,
            speedX: config.speedX || -0.05,  // 速度调慢
            type: 'spiral',
            color: '#8B5CF6'
        });
        this.armCount = config.arms || 3;
        this.armLength = config.armLength || 0.1;
        this.rotationAngle = Math.random() * Math.PI * 2;
        this.rotationSpeed = config.rotationSpeed || 1.2;  // 旋转速度调慢
    }
    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.rotationAngle += this.rotationSpeed * dt;
    }
    render(ctx) {
        ctx.save();
        const centerX = this.x * ctx.canvas.width;
        const centerY = this.y * ctx.canvas.height;
        const radius = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

        // 中心小圆点
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#F472B6';
        ctx.fill();

        // 臂和末端圆点
        for (let i = 0; i < this.armCount; i++) {
            const angle = this.rotationAngle + (i * Math.PI * 2 / this.armCount);
            const endX = centerX + Math.cos(angle) * this.armLength * ctx.canvas.width;
            const endY = centerY + Math.sin(angle) * this.armLength * ctx.canvas.height;

            // 连接线
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.stroke();

            // 末端圆点
            ctx.beginPath();
            ctx.arc(endX, endY, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        ctx.restore();
    }
    checkCollision(playerX, playerY, playerRadius) {
        const dx = playerX - this.x, dy = playerY - this.y;
        if (Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius * 0.6) return true;
        for (let i = 0; i < this.armCount; i++) {
            const angle = this.rotationAngle + (i * Math.PI * 2 / this.armCount);
            const armEndX = this.x + Math.cos(angle) * this.armLength;
            const armEndY = this.y + Math.sin(angle) * this.armLength;
            const dx = playerX - armEndX, dy = playerY - armEndY;
            if (Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius) return true;
        }
        return false;
    }
    isOffScreen() { return this.x < -0.2; }
}

// ============================================================
// COIN - 金币（代替障碍物，需要吃掉）
// ============================================================
class Coin extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x !== undefined ? config.x : 1.1,
            y: config.y !== undefined ? config.y : 0.5,
            radius: 0.04,
            speedX: config.speedX !== undefined ? config.speedX : 0,
            speedY: config.speedY !== undefined ? config.speedY : 0.1,
            type: 'coin',
            color: '#FFD700'
        });
        this.collected = false;
        this.phase = Math.random() * Math.PI * 2;
        this.value = config.value || 10;
        this.trajectory = config.trajectory || 'straight';
        this.startX = this.x;
        this.startY = this.y;
        this.phaseTime = 0;
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.y += this.speedY * dt * speedMultiplier;
        this.phase += dt * 4;
        this.phaseTime += dt;

        // 上下摆动轨迹
        if (this.trajectory === 'zigzag') {
            this.y = this.startY + Math.sin((this.phaseTime % 2.1) * 3) * 0.08 + this.speedY * this.phaseTime;
        }
    }

    render(ctx) {
        if (this.collected) return;
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const pulse = 1 + Math.sin(this.phase) * 0.15;
        const radius = pos.radius * pulse;

        ctx.save();
        // 外发光
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = radius * 0.5;

        // 金币主体
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();

        // $ 符号
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#B8860B';
        ctx.font = `bold ${radius * 1.0}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', pos.x, pos.y);

        ctx.restore();
    }

    collect() { this.collected = true; }

    checkCollision(playerX, playerY, playerRadius) {
        if (this.collected) return false;
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        return Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius;
    }
}

// ============================================================
// BULLET - 玩家子弹
// ============================================================
class Bullet extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || 0.8,
            radius: 0.012,
            speedX: 0,
            speedY: -0.4,  // 默认向上飞
            type: 'bullet',
            color: '#00FFFF'
        });
        this.damage = config.damage || 1;
        this.trail = [];
        // 目标坐标（如果有）
        this.targetX = config.targetX;
        this.targetY = config.targetY;
        this.speed = config.speed || 0.5;  // 子弹速度

        // 如果有目标，计算方向向量
        if (this.targetX !== undefined && this.targetY !== undefined) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                this.dirX = dx / dist;
                this.dirY = dy / dist;
            } else {
                this.dirX = 0;
                this.dirY = -1;
            }
        } else {
            this.dirX = 0;
            this.dirY = -1;  // 默认向上
        }
    }

    update(dt, speedMultiplier = 1) {
        // 记录轨迹
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > 5) this.trail.pop();

        // 沿方向向量移动
        this.x += this.dirX * this.speed * dt * speedMultiplier;
        this.y += this.dirY * this.speed * dt * speedMultiplier;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);

        ctx.save();

        // 子弹轨迹
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const tx = t.x * ctx.canvas.width;
            const ty = t.y * ctx.canvas.height;
            const alpha = (1 - i / this.trail.length) * 0.5;
            const size = pos.radius * (1 - i / this.trail.length) * 0.8;

            ctx.beginPath();
            ctx.arc(tx, ty, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.fill();
        }

        // 子弹外发光
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = pos.radius * 2;

        // 子弹主体
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, pos.radius);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.5, '#00FFFF');
        grad.addColorStop(1, '#0080FF');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.restore();
    }

    isOffScreen() { return this.y < -0.2; }
}

// ============================================================
// ENEMY SHIP - 敌人战舰
// ============================================================
class EnemyShip extends Obstacle {
    constructor(config = {}) {
        super({
            x: config.x || 0.5,
            y: config.y || -0.1,
            radius: 0.045,
            speedX: (Math.random() - 0.5) * 0.02,
            speedY: config.speedY || 0.08,
            type: 'enemy',
            color: '#EF4444'
        });
        this.health = config.health || 2;
        this.maxHealth = this.health;
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.hitFlash = 0;
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt;
        this.y += this.speedY * dt * speedMultiplier;
        this.wobblePhase += dt * 2;
        if (this.hitFlash > 0) this.hitFlash -= dt * 3;
    }

    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const size = pos.radius;

        ctx.save();
        ctx.translate(pos.x, pos.y);

        // 左右微微晃动
        const wobble = Math.sin(this.wobblePhase) * size * 0.1;
        ctx.translate(wobble, 0);

        // 外发光
        ctx.shadowColor = this.hitFlash > 0 ? '#FFFFFF' : '#EF4444';
        ctx.shadowBlur = size * 0.8;

        // 战舰主体 - 倒三角（朝下）
        ctx.beginPath();
        ctx.moveTo(0, size * 1.2);  // 下方尖端
        ctx.lineTo(-size * 0.6, -size * 0.8);  // 左上
        ctx.lineTo(0, -size * 0.4);  // 上中
        ctx.lineTo(size * 0.6, -size * 0.8);  // 右上
        ctx.closePath();

        const bodyGrad = ctx.createLinearGradient(-size, 0, size, 0);
        if (this.hitFlash > 0) {
            bodyGrad.addColorStop(0, '#FFFFFF');
            bodyGrad.addColorStop(1, '#FF8888');
        } else {
            bodyGrad.addColorStop(0, '#B91C1C');
            bodyGrad.addColorStop(0.5, '#EF4444');
            bodyGrad.addColorStop(1, '#DC2626');
        }
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = '#7F1D1D';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 驾驶舱
        ctx.beginPath();
        ctx.ellipse(-size * 0.3, 0, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.hitFlash > 0 ? '#FFFFFF' : '#1E3A5F';
        ctx.fill();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 武器（上下两个）
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(size * 0.2, -size * 0.5, size * 0.4, size * 0.15);
        ctx.fillRect(size * 0.2, size * 0.35, size * 0.4, size * 0.15);

        // 引擎火焰
        ctx.beginPath();
        ctx.moveTo(-size * 1.2, 0);
        ctx.lineTo(-size * 1.6 - Math.random() * size * 0.3, -size * 0.15);
        ctx.lineTo(-size * 1.6 - Math.random() * size * 0.3, size * 0.15);
        ctx.closePath();
        ctx.fillStyle = '#FF6B35';
        ctx.fill();

        ctx.restore();

        // 血条
        if (this.health < this.maxHealth) {
            const barWidth = size * 2;
            const barHeight = 4;
            const barX = pos.x - barWidth / 2;
            const barY = pos.y - size - 10;

            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#22C55E';
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }
    }

    checkCollision(playerX, playerY, playerRadius) {
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        return Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius;
    }

    // 子弹碰撞检测
    checkBulletCollision(bulletX, bulletY, bulletRadius) {
        const dx = bulletX - this.x;
        const dy = bulletY - this.y;
        return Math.sqrt(dx * dx + dy * dy) < bulletRadius + this.radius;
    }

    takeDamage(damage) {
        this.health -= damage;
        this.hitFlash = 1;
        return this.health <= 0;
    }

    isOffScreen() { return this.y > 1.2; }
}

// ============================================================
// EXPLOSION - 爆炸效果
// ============================================================
class Explosion {
    constructor(x, y, canvasWidth, canvasHeight) {
        this.x = x;
        this.y = y;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.life = 1.0;
        this.maxLife = 1.0;
        this.maxRadius = 0.08;
        this.particles = [];

        // 生成粒子
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const speed = 0.1 + Math.random() * 0.15;
            this.particles.push({
                x: x * canvasWidth,
                y: y * canvasHeight,
                vx: Math.cos(angle) * speed * canvasWidth,
                vy: Math.sin(angle) * speed * canvasHeight,
                size: 0.01 + Math.random() * 0.02,
                color: Math.random() > 0.5 ? '#FF6B35' : '#FFD700'
            });
        }
    }

    update(dt) {
        this.life -= dt * 1.5;

        for (const p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.size *= 0.98;
        }
    }

    render(ctx) {
        if (this.life <= 0) return;

        const centerX = this.x * this.canvasWidth;
        const centerY = this.y * this.canvasHeight;
        const currentRadius = this.maxRadius * Math.min(this.canvasWidth, this.canvasHeight) * (1 - this.life) * 1.5;

        ctx.save();

        // 爆炸中心光
        ctx.globalAlpha = this.life;
        const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, currentRadius);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, '#FFD700');
        grad.addColorStop(0.6, '#FF6B35');
        grad.addColorStop(1, 'rgba(255, 100, 0, 0)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // 粒子
        for (const p of this.particles) {
            ctx.globalAlpha = this.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * Math.min(this.canvasWidth, this.canvasHeight), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }

        ctx.restore();
    }

    isDead() { return this.life <= 0; }
}

class ObstacleVehicle extends Obstacle {
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
        this.lane = config.lane || 0;
    }
    update(dt, speedMultiplier = 1) { this.y += this.speedY * dt * speedMultiplier; }
    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        const w = this.width * ctx.canvas.width, h = this.height * ctx.canvas.height;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = this.color;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = '#1E3A5F';
        ctx.fillRect(-w / 3, -h / 3, w * 0.6, h * 0.4);
        ctx.restore();
    }
}

class ObstacleBall extends Obstacle {
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
        this.speedY += this.gravity * dt;
        this.y += this.speedY * dt * speedMultiplier;
        this.x += this.speedX * dt;
    }
    render(ctx) {
        const pos = this.getPixelPosition(ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.beginPath();
        ctx.arc(0, 0, pos.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#FCD34D';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-pos.radius * 0.3, -pos.radius * 0.3, pos.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        ctx.restore();
    }
}

// ============================================================
// MOTION MAPPER - 运动轴映射
// ============================================================
const MotionMapper = {
    MODES: {
        SINGLE_PITCH: 'single_pitch',
        SINGLE_YAW: 'single_yaw',
        SINGLE_ROLL: 'single_roll',
        DUAL_PITCH_YAW: 'dual_pitch_yaw',
        TRIPLE: 'triple'
    },

    AXIS_MAP: {
        single_pitch: ['pitch'],
        single_yaw: ['yaw'],
        single_roll: ['roll'],
        dual_pitch_yaw: ['pitch', 'yaw'],
        triple: ['pitch', 'yaw', 'roll']
    },

    mapToGame(input, mode) {
        const { pitch = 0, yaw = 0, roll = 0 } = input;
        let x = 0.5, y = 0.5;

        switch (mode) {
            case this.MODES.SINGLE_PITCH:
                y = 0.5 - pitch * 0.4;
                break;
            case this.MODES.SINGLE_YAW:
                x = 0.5 + yaw * 0.4;
                break;
            case this.MODES.SINGLE_ROLL:
                x = 0.5 + roll * 0.4;
                break;
            case this.MODES.DUAL_PITCH_YAW:
                x = 0.5 + yaw * 0.4;
                y = 0.5 - pitch * 0.4;
                break;
            case this.MODES.TRIPLE:
                x = 0.5 + yaw * 0.4 + roll * 0.1;
                y = 0.5 - pitch * 0.4;
                break;
        }

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        return { x, y };
    },

    getActiveAxes(mode) {
        return this.AXIS_MAP[mode] || [];
    },

    getModeName(mode) {
        const names = {
            single_pitch: '单轴(上下)',
            single_yaw: '单轴(左右)',
            single_roll: '单轴(侧倾)',
            dual_pitch_yaw: '双轴(上下+左右)',
            triple: '三轴(综合)'
        };
        return names[mode] || mode;
    }
};

// ============================================================
// INPUT ADAPTER - 输入适配器
// ============================================================
class InputAdapter {
    constructor() {
        this.inputSource = 'mouse';
        this.mouseX = 0.5;
        this.mouseY = 0.5;
        this.motionMode = MotionMapper.MODES.TRIPLE;
        this.initialized = false;
    }

    init() {
        if (this.isGyroscopeAvailable()) {
            this.inputSource = 'gyroscope';
        } else {
            this.inputSource = 'mouse';
        }
        this.bindMouseEvents();
        this.bindKeyboardEvents();
        this.initialized = true;
    }

    isGyroscopeAvailable() {
        // 只在移动设备且有陀螺仪时使用陀螺仪模式
        // Desktop默认使用鼠标
        return /Mobi|Android/i.test(navigator.userAgent) && window.DeviceOrientationEvent !== undefined;
    }

    bindMouseEvents() {
        const canvas = document.getElementById('crosshair-canvas');
        if (!canvas) return;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width;
            this.mouseY = (e.clientY - rect.top) / rect.height;
        });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const step = 0.02;
            switch (e.key) {
                case 'ArrowUp': case 'w': case 'W':
                    this.mouseY = Math.max(0, this.mouseY - step); break;
                case 'ArrowDown': case 's': case 'S':
                    this.mouseY = Math.min(1, this.mouseY + step); break;
                case 'ArrowLeft': case 'a': case 'A':
                    this.mouseX = Math.max(0, this.mouseX - step); break;
                case 'ArrowRight': case 'd': case 'D':
                    this.mouseX = Math.min(1, this.mouseX + step); break;
            }
        });
    }

    getPosition() {
        if (this.inputSource === 'gyroscope') {
            const pitch = (state.pitch - state.pitchOffset) / 45;
            const yaw = (state.yaw - state.yawOffset) / 80;
            const roll = (state.roll - state.rollOffset) / 45;
            return MotionMapper.mapToGame({ pitch, yaw, roll }, this.motionMode);
        }
        // 鼠标模式：直接返回0-1范围的位置，不经过mapToGame映射
        return { x: this.mouseX, y: this.mouseY };
    }

    setMotionMode(mode) {
        this.motionMode = mode;
    }

    getMotionMode() {
        return this.motionMode;
    }
}

// ============================================================
// COLLISION DETECTOR - 碰撞检测
// ============================================================
const CollisionDetector = {
    checkPlayerObstacle(player, obstacle, canvas) {
        if (!player || !obstacle) return false;
        const playerX = player.x * canvas.width;
        const playerY = player.y * canvas.height;
        const playerRadius = player.hitboxRadius * Math.min(canvas.width, canvas.height);
        const obstacleX = obstacle.x * canvas.width;
        const obstacleY = obstacle.y * canvas.height;
        const obstacleRadius = obstacle.radius * Math.min(canvas.width, canvas.height);
        const dx = obstacleX - playerX;
        const dy = obstacleY - playerY;
        return Math.sqrt(dx * dx + dy * dy) < (playerRadius + obstacleRadius);
    }
};

// ============================================================
// SCORING SYSTEM - 评分系统
// ============================================================
class ScoringSystem {
    static WEIGHTS = { survival: 0.4, obstacleAvoid: 0.4, fluidity: 0.2 };
    static GRADE_THRESHOLDS = { S: 90, A: 80, B: 70, C: 60, D: 0 };

    constructor() { this.reset(); }

    reset() {
        this.currentScore = 0;
        this.coinsCollected = 0;
        this.survivalScore = 0;
        this.avoidScore = 0;
        this.fluidityScore = 0;
        this.obstaclesDodged = 0;
        this.positionHistory = [];
        this.maxHistoryLength = 60;
    }

    getCurrentScore() { return this.currentScore; }

    getFinalScore() {
        return (this.survivalScore * ScoringSystem.WEIGHTS.survival +
                this.avoidScore * ScoringSystem.WEIGHTS.obstacleAvoid +
                this.fluidityScore * ScoringSystem.WEIGHTS.fluidity);
    }

    calculateFrameScore(player, obstacles, dt, difficultyLevel) {
        this.survivalScore += 10 * dt * difficultyLevel;
        const centerDistance = Math.sqrt(Math.pow(player.x - 0.5, 2) + Math.pow(player.y - 0.5, 2));
        this.avoidScore += (1 - centerDistance * 2) * 5 * dt;
        this.positionHistory.push({ x: player.x, y: player.y });
        if (this.positionHistory.length > this.maxHistoryLength) this.positionHistory.shift();
        if (this.positionHistory.length >= 10) {
            this.fluidityScore = this.calculateFluidity(this.positionHistory) * 100;
        }
        this.currentScore = this.getFinalScore();
    }

    calculateFluidity(history) {
        if (history.length < 2) return 1;
        let totalChange = 0;
        for (let i = 1; i < history.length; i++) {
            const dx = history[i].x - history[i-1].x;
            const dy = history[i].y - history[i-1].y;
            totalChange += Math.sqrt(dx * dx + dy * dy);
        }
        const avgChange = totalChange / (history.length - 1);
        const ratio = avgChange / 0.01;
        return ratio >= 1 ? Math.max(0, 1 - (ratio - 1) * 0.5) : ratio;
    }

    onCollision() {}
    onCoinCollected(value) { this.currentScore += value; this.coinsCollected++; }
    onEnemyDestroyed() { this.avoidScore += 100; }  // 击毁敌舰得分
    onObstacleDodged() { this.obstaclesDodged++; this.avoidScore += 50; }
    onNearMiss() { this.nearMisses++; this.avoidScore += 20; }

    getGrade(score) {
        const s = score || this.getFinalScore();
        if (s >= ScoringSystem.GRADE_THRESHOLDS.S) return 'S';
        if (s >= ScoringSystem.GRADE_THRESHOLDS.A) return 'A';
        if (s >= ScoringSystem.GRADE_THRESHOLDS.B) return 'B';
        if (s >= ScoringSystem.GRADE_THRESHOLDS.C) return 'C';
        return 'D';
    }
}

// ============================================================
// DIFFICULTY MANAGER - 难度管理器
// ============================================================
class DifficultyManager {
    static CONFIG = {
        1: { spawnInterval: 1500, speedMultiplier: 0.5, maxObstacles: 4, types: ['small'] },
        2: { spawnInterval: 1300, speedMultiplier: 0.6, maxObstacles: 5, types: ['small', 'medium'] },
        3: { spawnInterval: 1100, speedMultiplier: 0.7, maxObstacles: 5, types: ['small', 'medium'] },
        4: { spawnInterval: 900, speedMultiplier: 0.8, maxObstacles: 6, types: ['medium'] },
        5: { spawnInterval: 700, speedMultiplier: 0.9, maxObstacles: 6, types: ['medium'] }
    };
    static LEVEL_UP_TIME = [0, 30, 60, 90, 120];

    constructor() { this.reset(); }

    reset() {
        this.level = 1;
        this.timePlayed = 0;
        this.lastSpawnTime = 0;
    }

    advance(gameTime) {
        this.timePlayed = gameTime;
        for (let i = DifficultyManager.LEVEL_UP_TIME.length - 1; i >= 0; i--) {
            if (gameTime >= DifficultyManager.LEVEL_UP_TIME[i]) { this.level = i + 1; break; }
        }
        return this.getCurrentConfig();
    }

    getCurrentLevel() { return this.level; }
    getCurrentConfig() { return DifficultyManager.CONFIG[this.level] || DifficultyManager.CONFIG[1]; }
    getSpawnInterval() { return this.getCurrentConfig().spawnInterval; }
    getSpeedMultiplier() { return this.getCurrentConfig().speedMultiplier; }
    getMaxObstacles() { return this.getCurrentConfig().maxObstacles; }
    recordSpawn() { this.lastSpawnTime = this.timePlayed; }
}

// ============================================================
// SCENE BASE - 场景基类
// ============================================================
class SceneBase {
    constructor() {
        this.engine = null;
        this.obstacles = [];
        this.lastSpawnTime = 0;
        this.lastSpawnX = 1.2; // 上一个障碍物的X位置
        this.gameTime = 0;
        this.movementAxis = 'free'; // 'free' | 'vertical' | 'horizontal'
        this.scrollDirection = 'down';
    }
    init(engine) { this.engine = engine; this.obstacles = []; this.lastSpawnTime = 0; this.lastSpawnX = 1.2; this.gameTime = 0; this.lastObstacleType = null; }
    update(dt) { this.gameTime += dt; }
    trySpawnObstacle(obstacleList, difficultyConfig) {
        const timeSinceLastSpawn = this.gameTime - this.lastSpawnTime;
        const minSpawnInterval = difficultyConfig.spawnInterval / 1000;
        const minXDistance = 0.12; // 障碍物之间的最小X距离

        // 计算最左侧障碍物的X位置
        let leftmostX = -0.2;
        for (const obs of obstacleList) {
            if (obs.x < leftmostX) leftmostX = obs.x;
        }

        // 当最左侧障碍物移出一定距离后，才能生成新的
        const canSpawn = leftmostX < 0.7 && // 屏幕内有空间
                        timeSinceLastSpawn >= minSpawnInterval;

        if (canSpawn) {
            let obstacles = this.spawnObstacle(difficultyConfig);
            if (obstacles) {
                // 支持单个或多个障碍物
                const obsArray = Array.isArray(obstacles) ? obstacles : [obstacles];
                const obsType = obsArray[0].type;

                // 防止连续生成螺旋型障碍物（无法通过）
                if (obsType === 'spiral' && this.lastObstacleType === 'spiral') {
                    // 重新生成其他类型
                    obstacles = this.spawnObstacle(difficultyConfig);
                    if (obstacles) {
                        const newObsArray = Array.isArray(obstacles) ? obstacles : [obstacles];
                        for (const obs of newObsArray) {
                            obstacleList.push(obs);
                        }
                        this.lastSpawnTime = this.gameTime;
                        this.lastSpawnX = newObsArray[0].x;
                        this.lastObstacleType = newObsArray[0].type;
                        // 推进波次索引
                        this.waveObstacleIndex++;
                        // 检查是否需要进入下一波
                        this.checkWaveProgress();
                    }
                } else {
                    for (const obs of obsArray) {
                        obstacleList.push(obs);
                    }
                    this.lastSpawnTime = this.gameTime;
                    this.lastSpawnX = obsArray[0].x;
                    this.lastObstacleType = obsType;
                    // 推进波次索引
                    this.waveObstacleIndex++;
                    // 检查是否需要进入下一波
                    this.checkWaveProgress();
                }
            }
        }
    }

    checkWaveProgress() {
        // 检查波次进度，推进到下一波
        if (!this.waves || this.currentWaveIndex >= this.waves.length) {
            // 波次全部完成，循环从头开始
            this.currentWaveIndex = 0;
            this.waveObstacleIndex = 0;
            return;
        }
        const wave = this.waves[this.currentWaveIndex];
        if (this.waveObstacleIndex >= wave.count) {
            this.currentWaveIndex++;
            this.waveObstacleIndex = 0;
            // 边界检查，循环
            if (this.currentWaveIndex >= this.waves.length) {
                this.currentWaveIndex = 0;
            }
        }
    }
    spawnObstacle() { return null; }
    mapInputToPosition(inputPos) { return inputPos; }
    cleanup() { this.obstacles = []; }
}

class SceneSpace extends SceneBase {
    constructor() {
        super();
        this.stars = [];
        this.scrollDirection = 'down';
        this.generateStars();
    }

    generateStars() {
        this.stars = [];
        // 主星星层 - 较亮的星星
        for (let i = 0; i < 120; i++) {
            this.stars.push({
                x: Math.random(), y: Math.random(),
                size: Math.random() * 0.005 + 0.003,
                speed: Math.random() * 0.15 + 0.03,
                brightness: Math.random() * 0.4 + 0.6,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.8 + Math.random() * 2,
                color: Math.random() > 0.7 ? 'blue' : Math.random() > 0.8 ? 'yellow' : Math.random() > 0.88 ? 'orange' : Math.random() > 0.93 ? 'red' : 'white',
                layer: 'main'
            });
        }
        // 远景星星层 - 微小的暗淡星星增加深度
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: Math.random(), y: Math.random(),
                size: Math.random() * 0.002 + 0.0005,
                speed: Math.random() * 0.05 + 0.01,
                brightness: Math.random() * 0.3 + 0.2,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.3 + Math.random() * 0.8,
                color: Math.random() > 0.5 ? 'white' : 'blue',
                layer: 'distant'
            });
        }
        // 流星
        this.shootingStars = [];
        this.lastShootingStar = 0;
        this.shootingStarInterval = 3 + Math.random() * 5;
    }

    init(engine) {
        super.init(engine);
        this.lastObstacleType = null;  // 防止连续生成相同障碍物
        this.generateStars();
        // 波次系统
        this.currentWaveIndex = 0;
        this.waveObstacleIndex = 0;
        this.waveInProgress = false;
        this.waveComplete = false;
        // 定义波次序列（障碍物类型顺序），难度递增
        this.waves = [
            // 1-5波：入门
            { name: 'wave1', count: 3, types: ['coin', 'coin', 'gate'] },
            { name: 'wave2', count: 3, types: ['wave', 'coin', 'gate'] },
            { name: 'wave3', count: 4, types: ['gate', 'coin', 'wave', 'coin'] },
            { name: 'wave4', count: 4, types: ['wave', 'coin', 'coin', 'gate'] },
            { name: 'wave5', count: 4, types: ['coin', 'wave', 'gate', 'coin'] },
            // 6-10波：进阶
            { name: 'wave6', count: 5, types: ['gate', 'coin', 'spiral', 'coin', 'gate'] },
            { name: 'wave7', count: 5, types: ['wave', 'spiral', 'coin', 'gate', 'wave'] },
            { name: 'wave8', count: 5, types: ['spiral', 'coin', 'wave', 'coin', 'gate'] },
            { name: 'wave9', count: 5, types: ['coin', 'spiral', 'gate', 'spiral', 'coin'] },
            { name: 'wave10', count: 6, types: ['gate', 'wave', 'coin', 'spiral', 'wave', 'gate'] },
            // 11-15波：困难
            { name: 'wave11', count: 6, types: ['spiral', 'wave', 'gate', 'coin', 'spiral', 'wave'] },
            { name: 'wave12', count: 6, types: ['wave', 'spiral', 'coin', 'gate', 'wave', 'spiral'] },
            { name: 'wave13', count: 7, types: ['gate', 'spiral', 'coin', 'wave', 'spiral', 'gate', 'coin'] },
            { name: 'wave14', count: 7, types: ['spiral', 'wave', 'gate', 'spiral', 'coin', 'gate', 'wave'] },
            { name: 'wave15', count: 7, types: ['coin', 'gate', 'spiral', 'wave', 'coin', 'spiral', 'gate'] },
            // 16-20波：极难
            { name: 'wave16', count: 8, types: ['wave', 'spiral', 'gate', 'wave', 'spiral', 'coin', 'gate', 'spiral'] },
            { name: 'wave17', count: 8, types: ['spiral', 'coin', 'wave', 'gate', 'spiral', 'wave', 'coin', 'gate'] },
            { name: 'wave18', count: 8, types: ['gate', 'wave', 'spiral', 'coin', 'gate', 'spiral', 'wave', 'coin'] },
            { name: 'wave19', count: 9, types: ['spiral', 'wave', 'gate', 'spiral', 'wave', 'coin', 'spiral', 'gate', 'wave'] },
            { name: 'wave20', count: 9, types: ['coin', 'spiral', 'gate', 'wave', 'spiral', 'wave', 'gate', 'spiral', 'coin'] },
        ];
    }

    update(dt) {
        super.update(dt);

        for (const star of this.stars) {
            // 更新闪烁
            star.twinklePhase += star.twinkleSpeed * dt;
            star.brightness = 0.5 + Math.sin(star.twinklePhase) * 0.5;

            // 单轴上下模式：背景静止
            if (this.scrollDirection === 'left') continue;

            // 远景层移动更慢
            const speedMult = star.layer === 'distant' ? 0.3 : 1;

            switch (this.scrollDirection) {
                case 'right':
                    star.x += star.speed * dt * speedMult;
                    if (star.x > 1) { star.x = 0; star.y = Math.random(); }
                    break;
                case 'up':
                    star.y -= star.speed * dt * speedMult;
                    if (star.y < 0) { star.y = 1; star.x = Math.random(); }
                    break;
                case 'down':
                default:
                    star.y += star.speed * dt * speedMult;
                    if (star.y > 1) { star.y = 0; star.x = Math.random(); }
                    break;
            }
        }

        // 流星更新
        this.lastShootingStar += dt;
        if (this.lastShootingStar > this.shootingStarInterval) {
            this.lastShootingStar = 0;
            this.shootingStarInterval = 4 + Math.random() * 8;
            // 随机生成流星
            if (Math.random() > 0.3) {
                this.shootingStars.push({
                    x: Math.random() * 0.3 + 0.1,
                    y: Math.random() * 0.3,
                    length: Math.random() * 0.15 + 0.08,
                    speed: Math.random() * 0.4 + 0.3,
                    angle: Math.PI / 4 + Math.random() * 0.3,
                    life: 1,
                    decay: Math.random() * 0.5 + 0.5,
                    width: Math.random() * 2 + 1
                });
            }
        }
        // 更新流星
        for (let i = this.shootingStars.length - 1; i >= 0; i--) {
            const s = this.shootingStars[i];
            s.x += Math.cos(s.angle) * s.speed * dt;
            s.y += Math.sin(s.angle) * s.speed * dt;
            s.life -= s.decay * dt;
            if (s.life <= 0 || s.x > 1.2 || s.y > 1.2) {
                this.shootingStars.splice(i, 1);
            }
        }
    }

    renderBackground(ctx, width, height) {
        // 深空渐变背景 - 更亮更有太空感
        const bgGrad = ctx.createRadialGradient(width * 0.3, height * 0.3, 0, width * 0.5, height * 0.5, width);
        bgGrad.addColorStop(0, '#2A1A4A');
        bgGrad.addColorStop(0.25, '#1A1040');
        bgGrad.addColorStop(0.6, '#0D0820');
        bgGrad.addColorStop(1, '#050810');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // 银河带效果 - 斜穿屏幕的淡色光带
        ctx.save();
        ctx.translate(width * 0.3, height * 0.5);
        ctx.rotate(-0.3);
        const milkyWay = ctx.createLinearGradient(-width, 0, width, 0);
        milkyWay.addColorStop(0, 'rgba(100, 80, 150, 0)');
        milkyWay.addColorStop(0.3, 'rgba(80, 60, 120, 0.03)');
        milkyWay.addColorStop(0.5, 'rgba(100, 90, 180, 0.06)');
        milkyWay.addColorStop(0.7, 'rgba(80, 60, 120, 0.03)');
        milkyWay.addColorStop(1, 'rgba(100, 80, 150, 0)');
        ctx.fillStyle = milkyWay;
        ctx.fillRect(-width, -height, width * 3, height * 2);
        ctx.restore();

        // 星云层1 - 紫色星云(左下)
        const nebula1 = ctx.createRadialGradient(width * 0.1, height * 0.85, 0, width * 0.2, height * 0.8, width * 0.5);
        nebula1.addColorStop(0, 'rgba(180, 80, 255, 0.25)');
        nebula1.addColorStop(0.3, 'rgba(120, 50, 200, 0.15)');
        nebula1.addColorStop(0.6, 'rgba(80, 30, 150, 0.08)');
        nebula1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula1;
        ctx.fillRect(0, 0, width, height);

        // 星云层2 - 蓝色星云(右上)
        const nebula2 = ctx.createRadialGradient(width * 0.85, height * 0.15, 0, width * 0.8, height * 0.25, width * 0.45);
        nebula2.addColorStop(0, 'rgba(80, 160, 255, 0.22)');
        nebula2.addColorStop(0.4, 'rgba(50, 100, 220, 0.12)');
        nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula2;
        ctx.fillRect(0, 0, width, height);

        // 星云层3 - 粉红星云(中间)
        const nebula3 = ctx.createRadialGradient(width * 0.5, height * 0.6, 0, width * 0.5, height * 0.55, width * 0.3);
        nebula3.addColorStop(0, 'rgba(255, 120, 180, 0.18)');
        nebula3.addColorStop(0.5, 'rgba(220, 80, 140, 0.1)');
        nebula3.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula3;
        ctx.fillRect(0, 0, width, height);

        // 星云层4 - 青色星云
        const nebula4 = ctx.createRadialGradient(width * 0.7, height * 0.3, 0, width * 0.7, height * 0.3, width * 0.2);
        nebula4.addColorStop(0, 'rgba(0, 220, 220, 0.15)');
        nebula4.addColorStop(0.6, 'rgba(0, 170, 200, 0.08)');
        nebula4.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula4;
        ctx.fillRect(0, 0, width, height);

        // 星云层5 - 金色星云(左中)
        const nebula5 = ctx.createRadialGradient(width * 0.2, height * 0.4, 0, width * 0.2, height * 0.4, width * 0.25);
        nebula5.addColorStop(0, 'rgba(255, 200, 100, 0.12)');
        nebula5.addColorStop(0.5, 'rgba(200, 150, 80, 0.06)');
        nebula5.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula5;
        ctx.fillRect(0, 0, width, height);

        // 宇宙尘埃层 - 更密更大
        ctx.fillStyle = 'rgba(180, 150, 200, 0.05)';
        for (let i = 0; i < 60; i++) {
            const dustX = Math.random() * width;
            const dustY = Math.random() * height;
            const dustSize = Math.random() * 120 + 40;
            ctx.beginPath();
            ctx.arc(dustX, dustY, dustSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // 星星
        for (const star of this.stars) {
            const x = star.x * width, y = star.y * height;
            const size = star.size * Math.min(width, height);
            const b = star.brightness;

            // 远景星星简单渲染
            if (star.layer === 'distant') {
                ctx.beginPath();
                ctx.arc(x, y, size * 2, 0, Math.PI * 2);
                ctx.fillStyle = star.color === 'blue' ? `rgba(150, 180, 255, ${b * 0.6})` : `rgba(255, 255, 255, ${b * 0.5})`;
                ctx.fill();
                continue;
            }

            // 主星星层 - 带光晕
            let coreColor, glowColor;
            switch (star.color) {
                case 'blue':
                    coreColor = `rgba(200, 240, 255, ${b})`;
                    glowColor = `rgba(100, 180, 255, ${b * 0.5})`;
                    break;
                case 'yellow':
                    coreColor = `rgba(255, 255, 220, ${b})`;
                    glowColor = `rgba(255, 220, 100, ${b * 0.5})`;
                    break;
                case 'red':
                    coreColor = `rgba(255, 200, 200, ${b})`;
                    glowColor = `rgba(255, 120, 120, ${b * 0.5})`;
                    break;
                case 'orange':
                    coreColor = `rgba(255, 180, 100, ${b})`;
                    glowColor = `rgba(255, 150, 50, ${b * 0.5})`;
                    break;
                default:
                    coreColor = `rgba(255, 255, 255, ${b})`;
                    glowColor = `rgba(200, 220, 255, ${b * 0.5})`;
            }

            // 星星外发光
            const glowSize = size * (5 + b * 6);
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
            gradient.addColorStop(0, coreColor);
            gradient.addColorStop(0.1, glowColor);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.beginPath();
            ctx.arc(x, y, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // 星星核心
            const coreSize = size * (1.5 + b * 1);
            ctx.beginPath();
            ctx.arc(x, y, coreSize, 0, Math.PI * 2);
            ctx.fillStyle = coreColor;
            ctx.fill();

            // 十字光芒
            if (b > 0.8) {
                const rayLength = size * 8 * b;
                ctx.strokeStyle = coreColor;
                ctx.lineWidth = size * 0.7 * b;
                ctx.globalAlpha = (b - 0.8) * 5;

                ctx.beginPath();
                ctx.moveTo(x - rayLength, y);
                ctx.lineTo(x + rayLength, y);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x, y - rayLength);
                ctx.lineTo(x, y + rayLength);
                ctx.stroke();

                ctx.globalAlpha = 1;
            }
        }

        // 流星
        for (const s of this.shootingStars) {
            const sx = s.x * width, sy = s.y * height;
            const tailX = sx - Math.cos(s.angle) * s.length * width;
            const tailY = sy - Math.sin(s.angle) * s.length * height;

            const grad = ctx.createLinearGradient(tailX, tailY, sx, sy);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.7, `rgba(200, 220, 255, ${s.life * 0.5})`);
            grad.addColorStop(1, `rgba(255, 255, 255, ${s.life})`);

            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(sx, sy);
            ctx.strokeStyle = grad;
            ctx.lineWidth = s.width * s.life;
            ctx.lineCap = 'round';
            ctx.stroke();

            // 流星头部光点
            ctx.beginPath();
            ctx.arc(sx, sy, s.width * 0.5 * s.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${s.life})`;
            ctx.fill();
        }

        // 边缘暗角效果
        const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, height * 0.9);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 15, 0.3)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
    }

    spawnObstacle(difficultyConfig) {
        const types = difficultyConfig.types;
        const type = types[Math.floor(Math.random() * types.length)];
        const sizeMap = { small: 'small', medium: 'medium', large: 'large', fast: 'medium', random: ['small', 'medium', 'large'][Math.floor(Math.random() * 3)] };

        let x, y, speedX, speedY;
        const sm = difficultyConfig.speedMultiplier; // 使用难度倍率
        switch (this.scrollDirection) {
            case 'left':
                x = 1.1;
                // 70%概率出现在中线区域(y=0.3~0.7)，30%概率全范围
                y = Math.random() < 0.7
                    ? 0.3 + Math.random() * 0.4  // 中线区域：0.3~0.7
                    : Math.random() * 0.8 + 0.1;   // 全范围：0.1~0.9
                speedX = -(0.3 + Math.random() * 0.15) * sm;
                speedY = (Math.random() - 0.5) * 0.01;
                break;
            case 'right':
                x = -0.1; y = Math.random() * 0.7 + 0.15;
                speedX = (0.15 + Math.random() * 0.1) * sm;
                speedY = (Math.random() - 0.5) * 0.02;
                break;
            case 'up':
                x = Math.random() * 0.7 + 0.15; y = 1.1;
                speedX = (Math.random() - 0.5) * 0.02;
                speedY = -(0.15 + Math.random() * 0.1) * sm;
                break;
            case 'down':
            default:
                x = Math.random() * 0.7 + 0.15; y = -0.1;
                speedX = (Math.random() - 0.5) * 0.05;
                speedY = 0.1 + Math.random() * 0.05;
                break;
        }

        // 单轴上下模式(single_pitch)：波次系统 + 金币
        if (this.scrollDirection === 'left') {
            const wave = this.waves[this.currentWaveIndex];
            if (!wave) {
                // 所有波次完成，循环从头开始
                this.currentWaveIndex = 0;
                this.waveObstacleIndex = 0;
            }

            // 30%概率生成金币（不计入波次）
            if (Math.random() < 0.30) {
                const coinCount = Math.random() < 0.4 ? (Math.floor(Math.random() * 2) + 2) : 1;
                const baseY = 0.35 + Math.random() * 0.15;
                const spacing = 0.12;
                const coins = [];
                for (let i = 0; i < coinCount; i++) {
                    coins.push(new Coin({ x, y: baseY + i * spacing, speedX, value: 10 }));
                }
                return coins;
            }

            // 按波次顺序生成障碍物
            // 安全检查：确保索引不越界
            if (!wave.types || this.waveObstacleIndex >= wave.types.length) {
                this.waveObstacleIndex = 0;
            }
            const obstacleType = wave.types[this.waveObstacleIndex];
            if (obstacleType === 'gate') {
                const gapCenter = 0.35 + Math.random() * 0.3;
                const gapSize = 0.3;
                return new ObstacleGate({ x, speedX, gapCenter, gapSize });
            } else if (obstacleType === 'wave') {
                const baseY = 0.35 + Math.random() * 0.3;
                const amplitude = 0.08 + Math.random() * 0.04;
                return new ObstacleWave({ x, speedX, baseY, amplitude, count: 3 });
            } else if (obstacleType === 'spiral') {
                const baseY = 0.35 + Math.random() * 0.3;
                return new ObstacleSpiral({ x, y: baseY, speedX, arms: 2, armLength: 0.06, rotationSpeed: 1.5 });
            } else {
                // coin - 金币作为障碍物处理
                const baseY = 0.35 + Math.random() * 0.3;
                return new Coin({ x, y: baseY, speedX, value: 10 });
            }
        }

        // 纵向射击模式(movementAxis='shooting')：敌舰 + 金币混合，从上方飞下
        if (this.movementAxis === 'shooting') {
            const sm = difficultyConfig.speedMultiplier; // 使用难度倍率
            const roll = Math.random();
            if (roll < 0.20) {
                // 敌舰 - 从上方出现（20%概率）
                const enemyX = 0.2 + Math.random() * 0.6;
                const health = Math.random() < 0.3 ? 3 : 2;  // 30%概率3血
                return new EnemyShip({ x: enemyX, y: -0.1, speedY: (0.18 + Math.random() * 0.08) * sm, health });
            } else if (roll < 0.25) {
                // 敌舰群（2个横向排列，5%概率）
                const baseX = 0.25 + Math.random() * 0.2;
                const spacing = 0.15;
                const ships = [];
                for (let i = 0; i < 2; i++) {
                    ships.push(new EnemyShip({ x: baseX + i * spacing, y: -0.1, speedY: (0.15 + Math.random() * 0.05) * sm, health: 2 }));
                }
                return ships;
            } else if (roll < 0.60) {
                // 金币 - 从右往左移动，在玩家活动范围内
                const coinY = 0.7 + Math.random() * 0.2;  // Y在玩家附近
                const coinX = 1.1;  // 从右边出现
                const trajectories = ['straight', 'zigzag'];
                const trajectory = trajectories[Math.floor(Math.random() * trajectories.length)];
                return new Coin({ x: coinX, y: coinY, speedX: -0.5 * sm, speedY: 0, trajectory, value: 10 });
            }
            // 40%概率什么都不生成（空档让玩家休息）
            return null;
        }

        return new ObstacleMeteor({ size: sizeMap[type] || 'medium', x, y, speedX, speedY });
    }

    mapInputToPosition(inputPos) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}

class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.roadLines = [];
        this.lineSpeed = 0.3;
        this.initRoadLines();
    }

    initRoadLines() {
        this.roadLines = [];
        for (let i = 0; i < 8; i++) {
            this.roadLines.push({ y: i * 0.15, visible: i % 2 === 0 });
        }
    }

    init(engine) {
        super.init(engine);
        this.initRoadLines();
    }

    update(dt) {
        super.update(dt);
        for (const line of this.roadLines) {
            line.y += this.lineSpeed * dt;
            if (line.y > 1.2) line.y = -0.1;
        }
    }

    renderBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.4);
        gradient.addColorStop(0, '#1E3A5F');
        gradient.addColorStop(1, '#3B82F6');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height * 0.4);
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, height * 0.3, width, height * 0.7);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(0, height * 0.3, width, 5);
        ctx.fillRect(0, height - 5, width, 5);
        const centerX = width * 0.5;
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const line of this.roadLines) {
            if (!line.visible) continue;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(centerX - 5, line.y * height, 10, 30);
        }
    }

    spawnObstacle(difficultyConfig) {
        const lane = Math.random() < 0.5 ? 0 : 1;
        return new ObstacleVehicle({ x: lane === 0 ? 0.3 : 0.7, lane });
    }

    mapInputToPosition(inputPos) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.DUAL_PITCH_YAW;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}

class SceneBall extends SceneBase {
    constructor() { super(); }

    renderBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#22C55E');
        gradient.addColorStop(1, '#16A34A');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();
    }

    spawnObstacle(difficultyConfig) {
        const colors = ['#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
        return new ObstacleBall({ color: colors[Math.floor(Math.random() * colors.length)] });
    }

    mapInputToPosition(inputPos) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}

// ============================================================
// HEAD MOTION RECORDER - 头部运动数据记录器
// ============================================================
class HeadMotionRecorder {
    constructor() { this.reset(); }

    reset() {
        this.pitchRange = { min: Infinity, max: -Infinity };
        this.yawRange = { min: Infinity, max: -Infinity };
        this.rollRange = { min: Infinity, max: -Infinity };
        this.pitchSamples = [];
        this.yawSamples = [];
        this.rollSamples = [];
        this.pitchVelocity = [];
        this.yawVelocity = [];
        this.rollVelocity = [];
        this.positionHistory = [];
        this.maxHistoryLength = 300;
        this.dodgeEvents = [];
        this.lastTimestamp = null;
        this.lastPitch = 0;
        this.lastYaw = 0;
        this.lastRoll = 0;
        this.gameTime = 0;
        this.obstaclesDodged = 0;
        this.nearMisses = 0;
        this.collisionCount = 0;
        this.reactionTimes = [];
        this.directionChanges = 0;
        this.lastMoveDirection = null;
    }

    recordFrame(gyroData, playerPos, dt, obstacle = null) {
        const { pitch, yaw, roll } = gyroData;
        const timestamp = this.gameTime;

        if (pitch < this.pitchRange.min) this.pitchRange.min = pitch;
        if (pitch > this.pitchRange.max) this.pitchRange.max = pitch;
        if (yaw < this.yawRange.min) this.yawRange.min = yaw;
        if (yaw > this.yawRange.max) this.yawRange.max = yaw;
        if (roll < this.rollRange.min) this.rollRange.min = roll;
        if (roll > this.rollRange.max) this.rollRange.max = roll;

        if (this.pitchSamples.length === 0 || this.pitchSamples.length % 3 === 0) {
            this.pitchSamples.push(pitch);
            this.yawSamples.push(yaw);
            this.rollSamples.push(roll);
        }

        if (this.lastTimestamp !== null && dt > 0) {
            const pitchVel = Math.abs(pitch - this.lastPitch) / dt;
            const yawVel = Math.abs(yaw - this.lastYaw) / dt;
            const rollVel = Math.abs(roll - this.lastRoll) / dt;
            if (pitchVel < 500) this.pitchVelocity.push(pitchVel);
            if (yawVel < 500) this.yawVelocity.push(yawVel);
            if (rollVel < 500) this.rollVelocity.push(rollVel);
        }

        this.positionHistory.push({ x: playerPos.x, y: playerPos.y, timestamp });
        if (this.positionHistory.length > this.maxHistoryLength) this.positionHistory.shift();

        const currentDir = this.getMoveDirection(playerPos);
        if (this.lastMoveDirection !== null && currentDir !== this.lastMoveDirection) this.directionChanges++;
        this.lastMoveDirection = currentDir;

        this.lastTimestamp = timestamp;
        this.lastPitch = pitch;
        this.lastYaw = yaw;
        this.lastRoll = roll;
    }

    getMoveDirection(pos) {
        if (pos.x < 0.4) return 'left';
        if (pos.x > 0.6) return 'right';
        if (pos.y < 0.4) return 'up';
        if (pos.y > 0.6) return 'down';
        return 'center';
    }

    updateTime(dt) { this.gameTime += dt; }
    recordDodge() { this.obstaclesDodged++; }
    recordNearMiss() { this.nearMisses++; }
    recordCollision() { this.collisionCount++; }

    getStats() {
        return {
            pitchRange: this.pitchRange.max - this.pitchRange.min,
            yawRange: this.yawRange.max - this.yawRange.min,
            rollRange: this.rollRange.max - this.rollRange.min,
            pitchMean: this.mean(this.pitchSamples),
            yawMean: this.yawSamples.length > 0 ? this.mean(this.yawSamples) : 0,
            pitchVariance: this.variance(this.pitchSamples),
            yawVariance: this.variance(this.yawSamples),
            pitchMaxVelocity: this.max(this.pitchVelocity),
            yawMaxVelocity: this.max(this.yawVelocity),
            pitchAvgVelocity: this.mean(this.pitchVelocity),
            yawAvgVelocity: this.mean(this.yawVelocity),
            positionVariance: this.positionVariance(),
            smoothness: this.calculateSmoothness(),
            gameTime: this.gameTime,
            obstaclesDodged: this.obstaclesDodged,
            nearMisses: this.nearMisses,
            collisionCount: this.collisionCount,
            dodgeCount: this.dodgeEvents.length,
            directionChanges: this.directionChanges,
            avgReactionTime: this.mean(this.reactionTimes),
            minReactionTime: this.min(this.reactionTimes)
        };
    }

    mean(arr) { return arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
    variance(arr) { return arr && arr.length >= 2 ? arr.reduce((sum, val) => sum + Math.pow(val - this.mean(arr), 2), 0) / arr.length : 0; }
    max(arr) { return arr && arr.length > 0 ? Math.max(...arr) : 0; }
    min(arr) { return arr && arr.length > 0 ? Math.min(...arr) : Infinity; }

    positionVariance() {
        if (this.positionHistory.length < 2) return { x: 0, y: 0 };
        const xArr = this.positionHistory.map(p => p.x);
        const yArr = this.positionHistory.map(p => p.y);
        return { x: this.variance(xArr), y: this.variance(yArr) };
    }

    calculateSmoothness() {
        if (this.positionHistory.length < 3) return 100;
        let totalJerk = 0, count = 0;
        for (let i = 2; i < this.positionHistory.length; i++) {
            const p0 = this.positionHistory[i - 2], p1 = this.positionHistory[i - 1], p2 = this.positionHistory[i];
            const ax = p2.x - 2 * p1.x + p0.x, ay = p2.y - 2 * p1.y + p0.y;
            totalJerk += Math.sqrt(ax * ax + ay * ay);
            count++;
        }
        if (count === 0) return 100;
        return Math.min(100, Math.max(0, 100 - (totalJerk / count) * 1000));
    }
}

// ============================================================
// CERVICAL ABILITY SCORER - 颈椎能力评分器
// ============================================================
class CervicalAbilityScorer {
    constructor() {
        this.LEVEL_THRESHOLDS = {
            excellent: { min: 85, name: '优秀', color: '#22c55e' },
            good: { min: 70, name: '良好', color: '#84cc16' },
            normal: { min: 55, name: '正常', color: '#eab308' },
            mild: { min: 40, name: '轻度受限', color: '#f97316' },
            moderate: { min: 0, name: '明显受限', color: '#ef4444' }
        };
    }

    calculateReport(recorder, gameStats, motionMode) {
        const stats = recorder.getStats();
        const romScore = this.calculateROMScore(stats, motionMode);
        const proprioceptionScore = this.calculateProprioceptionScore(stats, gameStats);
        const stabilityScore = this.calculateStabilityScore(stats);
        const coordinationScore = this.calculateCoordinationScore(stats, motionMode);
        const reactionScore = this.calculateReactionScore(stats, gameStats);

        const overallScore = Math.round(
            romScore.score * 0.25 + proprioceptionScore.score * 0.20 +
            stabilityScore.score * 0.20 + coordinationScore.score * 0.15 + reactionScore.score * 0.20
        );

        return {
            gameInfo: {
                gameTime: stats.gameTime.toFixed(0),
                motionMode: motionMode,
                finalScore: gameStats.score || 0,
                grade: gameStats.grade || 'D',
                obstaclesDodged: stats.obstaclesDodged,
                nearMisses: stats.nearMisses
            },
            abilities: { rom: romScore, proprioception: proprioceptionScore, stability: stabilityScore, coordination: coordinationScore, reaction: reactionScore },
            overall: {
                score: overallScore,
                grade: this.getOverallGrade(overallScore),
                summary: this.generateSummary(romScore, proprioceptionScore, stabilityScore, coordinationScore, reactionScore),
                recommendations: this.generateRecommendations({ rom: romScore, proprioception: proprioceptionScore, stability: stabilityScore, coordination: coordinationScore, reaction: reactionScore })
            },
            details: {
                pitchRange: stats.pitchRange.toFixed(1),
                yawRange: stats.yawRange.toFixed(1),
                rollRange: stats.rollRange.toFixed(1),
                pitchMaxVelocity: stats.pitchMaxVelocity.toFixed(1),
                yawMaxVelocity: stats.yawMaxVelocity.toFixed(1),
                smoothness: stats.smoothness.toFixed(0),
                directionChanges: stats.directionChanges
            }
        };
    }

    calculateROMScore(stats, motionMode) {
        let pitchRange = stats.pitchRange, yawRange = stats.yawRange;
        let pitchROM = 0, yawROM = 0;

        if (motionMode === 'single_pitch') {
            pitchROM = pitchRange * 100;
        } else if (motionMode === 'single_yaw') {
            yawROM = yawRange * 200;
        } else {
            pitchROM = pitchRange * 100;
            yawROM = yawRange * 200;
        }

        const pitchScore = pitchROM > 0 ? Math.min(100, (pitchROM / 90) * 100) : 0;
        const yawScore = yawROM > 0 ? Math.min(100, (yawROM / 160) * 100) : 0;
        const romScore = (pitchScore > 0 && yawScore > 0) ? (pitchScore * 0.5 + yawScore * 0.5) : (pitchScore > 0 ? pitchScore : yawScore);

        return { score: Math.round(romScore), level: this.getLevel(romScore), pitchRange: pitchROM.toFixed(1), yawRange: yawROM.toFixed(1), pitchScore: Math.round(pitchScore), yawScore: Math.round(yawScore) };
    }

    calculateProprioceptionScore(stats, gameStats) {
        const dodgeAccuracy = gameStats.obstaclesDodged > 0 ? Math.min(100, (gameStats.obstaclesDodged / 20) * 100) : 50;
        const posVarX = stats.positionVariance?.x || 0, posVarY = stats.positionVariance?.y || 0;
        const posVarianceScore = Math.max(0, 100 - (posVarX + posVarY) * 2000);
        const pitchUsageRatio = Math.min(1, stats.pitchRange / 0.8), yawUsageRatio = Math.min(1, stats.yawRange / 0.8);
        const usageScore = 100 - Math.abs(0.5 - (pitchUsageRatio + yawUsageRatio) / 2) * 100;
        const score = dodgeAccuracy * 0.4 + posVarianceScore * 0.35 + usageScore * 0.25;
        return { score: Math.round(score), level: this.getLevel(score), dodgeAccuracy: Math.round(dodgeAccuracy), positionPrecision: Math.round(posVarianceScore), usageEfficiency: Math.round(usageScore) };
    }

    calculateStabilityScore(stats) {
        const posVarX = stats.positionVariance?.x || 0, posVarY = stats.positionVariance?.y || 0;
        const posVarianceScore = Math.max(0, 100 - (posVarX + posVarY) * 3000);
        const smoothnessScore = stats.smoothness || 50;
        const directionChangeRate = stats.gameTime > 0 ? stats.directionChanges / stats.gameTime : 0;
        const directionScore = Math.max(0, 100 - directionChangeRate * 50);
        const score = posVarianceScore * 0.35 + smoothnessScore * 0.40 + directionScore * 0.25;
        return { score: Math.round(score), level: this.getLevel(score), positionStability: Math.round(posVarianceScore), motionSmoothness: Math.round(smoothnessScore), directionStability: Math.round(directionScore) };
    }

    calculateCoordinationScore(stats, motionMode) {
        let axisSyncScore = 100;
        if (motionMode === 'dual_pitch_yaw' || motionMode === 'triple') {
            const pitchRange = stats.pitchRange || 0, yawRange = stats.yawRange || 0;
            if (pitchRange > 0.1 && yawRange > 0.1) {
                const ratio = Math.min(pitchRange, yawRange) / Math.max(pitchRange, yawRange);
                axisSyncScore = ratio * 100;
            }
        }
        const trajectorySmoothness = stats.smoothness || 50;
        const directionEfficiency = stats.directionChanges > 0 ? Math.min(100, 100 - stats.directionChanges * 2) : 100;
        const score = axisSyncScore * 0.30 + trajectorySmoothness * 0.40 + directionEfficiency * 0.30;
        return { score: Math.round(score), level: this.getLevel(score), axisSynchronization: Math.round(axisSyncScore), trajectorySmoothness: Math.round(trajectorySmoothness), directionEfficiency: Math.round(directionEfficiency) };
    }

    calculateReactionScore(stats, gameStats) {
        const dodgeRate = gameStats.obstaclesDodged > 0 ? Math.min(100, gameStats.obstaclesDodged * 5) : 50;
        const nearMissBonus = Math.min(20, stats.nearMisses * 5);
        const survivalBonus = Math.min(20, Math.floor(stats.gameTime / 10) * 5);
        const score = dodgeRate + nearMissBonus + survivalBonus;
        return { score: Math.round(Math.min(100, score)), level: this.getLevel(Math.min(100, score)), dodgeRate: Math.round(dodgeRate), nearMissBonus: nearMissBonus, survivalBonus: survivalBonus };
    }

    getLevel(score) {
        if (score >= 85) return this.LEVEL_THRESHOLDS.excellent;
        if (score >= 70) return this.LEVEL_THRESHOLDS.good;
        if (score >= 55) return this.LEVEL_THRESHOLDS.normal;
        if (score >= 40) return this.LEVEL_THRESHOLDS.mild;
        return this.LEVEL_THRESHOLDS.moderate;
    }

    getOverallGrade(score) {
        if (score >= 90) return 'S';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        return 'D';
    }

    generateSummary(rom, proprioception, stability, coordination, reaction) {
        const parts = [];
        if (rom.score >= 70) parts.push('活动范围良好');
        else if (rom.score < 40) parts.push('活动范围明显受限');
        if (proprioception.score >= 70) parts.push('位置觉准确');
        else if (proprioception.score < 40) parts.push('位置觉需加强');
        if (stability.score >= 70) parts.push('运动稳定');
        else if (stability.score < 40) parts.push('稳定性不足');
        if (coordination.score >= 70) parts.push('协调性良好');
        else if (coordination.score < 40) parts.push('协调性待改善');
        if (reaction.score >= 70) parts.push('反应速度较快');
        else if (reaction.score < 40) parts.push('反应速度偏慢');
        return parts.length > 0 ? parts.join('，') : '综合表现一般';
    }

    generateRecommendations(abilities) {
        const recs = [];
        if (abilities.rom.score < 60) recs.push('建议加强颈椎活动范围训练，如轻柔的头部旋转和倾斜练习');
        if (abilities.stability.score < 60) recs.push('稳定性训练：保持头部正中位，逐渐增加保持时间');
        if (abilities.coordination.score < 60) recs.push('协调性训练：进行头部追踪移动练习，如跟随目标转动');
        if (abilities.reaction.score < 60) recs.push('反应速度训练：进行快速转头躲避练习，提高反应灵敏度');
        if (abilities.proprioception.score < 60) recs.push('本体感觉训练：闭眼状态下进行头部位置感知练习');
        if (recs.length === 0) recs.push('继续保持当前训练强度，定期评估以监测进步');
        return recs;
    }
}

// ============================================================
// GAME ENGINE - 游戏引擎核心
// ============================================================
const GameState = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = GameState.MENU;
        this.previousState = null;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.gameTime = 0;
        this.input = new InputAdapter();
        this.scoring = new ScoringSystem();
        this.difficulty = new DifficultyManager();
        this.currentScene = null;
        this.player = { x: 0.5, y: 0.5, width: 0.04, height: 0.04, hitboxRadius: 0.02 };
        this.obstacles = [];
        this.bullets = [];
        this.explosions = [];
        this.lastShootTime = -0.5;  // 允许首次立即射击
        // 瞄准系统
        this.lockedTarget = null;
        this.aimDuration = 0;
        this.lastAimTime = 0;
        this.burstRemaining = 0;  // 连发剩余数量
        // 生命系统（射击模式）
        this.maxHealth = 3;
        this.health = this.maxHealth;
        this.invincibleTime = 0;  // 无敌时间
        this.animationFrameId = null;
        this.gameLoop = this.gameLoop.bind(this);
        // 颈椎能力评估
        this.headRecorder = new HeadMotionRecorder();
        this.cervicalScorer = new CervicalAbilityScorer();
        this.onCervicalReport = null;  // 回调：游戏结束时生成颈椎评估报告
    }

    init() {
        this.input.init();
        this.reset();
    }

    reset() {
        this.gameTime = 0;
        this.player.x = 0.5;
        this.player.y = 0.5;
        this.headRecorder.reset();
        this.obstacles = [];
        this.scoring.reset();
        this.difficulty.reset();
        if (this.currentScene) this.currentScene.cleanup();
    }

    setState(newState) {
        if (this.state === newState) return;
        this.previousState = this.state;
        this.state = newState;
        switch (newState) {
            case GameState.PLAYING:
                if (this.previousState === GameState.MENU || this.previousState === GameState.GAMEOVER) {
                    this.reset();
                    this.lastTime = performance.now();
                    this.startGameLoop();
                } else if (this.previousState === GameState.PAUSED) {
                    this.lastTime = performance.now();
                    this.startGameLoop();
                }
                break;
            case GameState.PAUSED:
            case GameState.MENU:
                this.stopGameLoop();
                break;
            case GameState.GAMEOVER:
                this.stopGameLoop();
                // 生成颈椎能力评估报告
                if (this.onCervicalReport) {
                    const gameStats = {
                        score: this.scoring.getFinalScore(),
                        grade: this.scoring.getGrade(),
                        obstaclesDodged: this.scoring.obstaclesDodged,
                        nearMisses: this.scoring.nearMisses
                    };
                    const motionMode = this.input.getMotionMode();
                    const report = this.cervicalScorer.calculateReport(this.headRecorder, gameStats, motionMode);
                    this.onCervicalReport(report);
                }
                break;
        }
    }

    startGameLoop() {
        if (this.animationFrameId) return;
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    stopGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    gameLoop(timestamp) {
        this.deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (this.deltaTime > 0.1) this.deltaTime = 0.1;
        if (this.state === GameState.PLAYING) this.gameTime += this.deltaTime;
        this.update(this.deltaTime);
        this.render();
        if (this.state === GameState.PLAYING || this.state === GameState.PAUSED) {
            this.animationFrameId = requestAnimationFrame(this.gameLoop);
        }
    }

    update(dt) {
        if (this.state !== GameState.PLAYING) return;
        const difficultyConfig = this.difficulty.advance(this.gameTime);
        this.updatePlayer();
        if (this.currentScene) this.currentScene.update(dt);

        // 射击逻辑（射击模式时启用）
        if (this.currentScene && this.currentScene.movementAxis === 'shooting') {
            this.handleShooting();
        }

        this.updateObstacles(dt);
        this.updateBullets(dt);
        this.updateExplosions(dt);
        // 更新无敌时间
        if (this.invincibleTime > 0) {
            this.invincibleTime -= dt;
        }
        this.checkCollisions();
        this.scoring.calculateFrameScore(this.player, this.obstacles, dt, difficultyConfig.level);

        // 记录头部运动数据（用于颈椎能力评估）
        this.headRecorder.updateTime(dt);
        const gyroData = { pitch: (state.pitch - state.pitchOffset) / 45, yaw: (state.yaw - state.yawOffset) / 80, roll: (state.roll - state.rollOffset) / 45 };
        this.headRecorder.recordFrame(gyroData, this.player, dt);
    }

    handleShooting() {
        // 精准射击：必须持续对准敌舰1秒才能发射
        const now = this.gameTime;

        // 瞄准参数
        const aimTolerance = 0.04;  // 缩小容差范围，更精准
        const lockTime = 0.8;  // 需要对准0.8秒才能发射
        const burstCount = 3;  // 对准后连续发射3颗
        const burstInterval = 0.15;  // 连发间隔（秒）

        // 检查连发逻辑
        if (this.burstRemaining > 0) {
            if (now - this.lastShootTime >= burstInterval) {
                this.shoot(this.lockedTarget);
                this.lastShootTime = now;
                this.burstRemaining--;
                if (this.burstRemaining <= 0) {
                    this.lockedTarget = null;
                    this.aimDuration = 0;
                }
            }
            return;
        }

        // 射击冷却检查
        const shootCooldown = 0.3;
        if (now - this.lastShootTime < shootCooldown) return;

        // 查找当前对准的敌舰（必须在玩家上方）
        let currentLockedEnemy = null;
        let closestDist = Infinity;

        for (const enemy of this.obstacles) {
            if (enemy.type !== 'enemy') continue;
            if (enemy.y >= this.player.y) continue;  // 只在玩家上方
            const dist = Math.abs(enemy.x - this.player.x);
            if (dist < aimTolerance && dist < closestDist) {
                closestDist = dist;
                currentLockedEnemy = enemy;
            }
        }

        // 瞄准逻辑：持续对准才能发射
        if (currentLockedEnemy) {
            // 同一敌人：累加瞄准时间
            if (this.lockedTarget === currentLockedEnemy) {
                this.aimDuration += (now - this.lastAimTime);
            } else {
                // 切换目标，重置计时
                this.lockedTarget = currentLockedEnemy;
                this.aimDuration = 0;
                this.lastAimTime = now;  // 重置计时起点
            }
            this.lastAimTime = now;

            // 瞄准满1秒，发射连发
            if (this.aimDuration >= lockTime) {
                this.shoot(currentLockedEnemy);
                this.lastShootTime = now;
                this.burstRemaining = burstCount - 1;  // 剩余连发数
            }
        } else {
            // 没有对准敌人，重置
            this.lockedTarget = null;
            this.aimDuration = 0;
        }
    }

    shoot(lockedEnemy) {
        // 从飞船头部发射子弹，朝向锁定的敌舰
        const bullet = new Bullet({
            x: this.player.x,
            y: this.player.y - 0.05,  // 飞船头部位置
            targetX: lockedEnemy ? lockedEnemy.x : this.player.x,  // 目标X坐标
            targetY: lockedEnemy ? lockedEnemy.y : -0.1
        });
        this.bullets.push(bullet);
        playShootSound();
    }

    updateBullets(dt) {
        const difficultyConfig = this.difficulty.getCurrentConfig();
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].update(dt, difficultyConfig.speedMultiplier);
            if (this.bullets[i].isOffScreen()) {
                this.bullets.splice(i, 1);
            }
        }
    }

    updateExplosions(dt) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].update(dt);
            if (this.explosions[i].isDead()) {
                this.explosions.splice(i, 1);
            }
        }
    }

    updatePlayer() {
        const inputPos = this.input.getPosition();
        let mappedPos;

        if (this.currentScene && this.input.inputSource === 'gyroscope') {
            mappedPos = this.currentScene.mapInputToPosition(inputPos, this.player);
        } else {
            mappedPos = inputPos;
        }

        // 单轴上下模式：玩家只能在垂直中线移动，范围限制在 -20° ~ +20°
        if (this.currentScene && this.currentScene.movementAxis === 'vertical') {
            mappedPos.x = 0.5;
            // pitch 输入范围 -1 到 +1，映射到屏幕 0.3 到 0.7（约40%高度，对应40°活动范围）
            mappedPos.y = 0.5 + (inputPos.y - 0.5) * 0.4;
            mappedPos.y = Math.max(0.3, Math.min(0.7, mappedPos.y));
        }
        // 单轴左右模式：玩家只能在水平最下方移动
        if (this.currentScene && this.currentScene.movementAxis === 'horizontal') {
            mappedPos.x = Math.max(0.15, Math.min(0.85, mappedPos.x));
            mappedPos.y = 0.85;
        }

        // 纵向射击模式（scrollDirection='down'）：玩家在底部，左右移动，头朝上
        if (this.currentScene && this.currentScene.movementAxis === 'shooting') {
            mappedPos.x = Math.max(0.15, Math.min(0.85, mappedPos.x));  // X方向可动
            mappedPos.y = 0.85;  // 固定在底部
        }

        this.player.x = mappedPos.x;
        this.player.y = mappedPos.y;
    }

    updateObstacles(dt) {
        const difficultyConfig = this.difficulty.getCurrentConfig();
        if (this.currentScene) {
            this.currentScene.trySpawnObstacle(this.obstacles, difficultyConfig);
        }
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            this.obstacles[i].update(dt, difficultyConfig.speedMultiplier);
            if (this.obstacles[i].isOffScreen(this.canvas.width, this.canvas.height)) {
                this.obstacles.splice(i, 1);
            }
        }
    }

    checkCollisions() {
        // 子弹与敌人碰撞检测（射击模式）
        if (this.currentScene && this.currentScene.movementAxis === 'shooting') {
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                const bullet = this.bullets[i];
                for (let j = this.obstacles.length - 1; j >= 0; j--) {
                    const enemy = this.obstacles[j];
                    if (enemy.type !== 'enemy') continue;

                    if (enemy.checkBulletCollision(bullet.x, bullet.y, bullet.radius)) {
                        // 击中敌人
                        const destroyed = enemy.takeDamage(bullet.damage);
                        this.bullets.splice(i, 1);  // 移除子弹

                        // 创建爆炸效果（即使没消灭也爆炸）
                        this.explosions.push(new Explosion(bullet.x, bullet.y, this.canvas.width, this.canvas.height));
                        playExplosionSound();  // 播放爆炸音效

                        if (destroyed) {
                            this.obstacles.splice(j, 1);  // 移除敌人
                            this.scoring.onEnemyDestroyed();  // 加分
                        }
                        break;
                    }
                }
            }

            // 敌舰突破防线检测：敌人到达玩家位置未消灭则扣血
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const enemy = this.obstacles[i];
                if (enemy.type !== 'enemy') continue;

                // 敌人Y坐标超过玩家（敌人到了玩家位置）
                if (enemy.y >= this.player.y - 0.05) {
                    // 从列表移除（不加分，不算正常消灭）
                    this.obstacles.splice(i, 1);

                    // 扣血
                    if (this.invincibleTime <= 0) {
                        this.health--;
                        this.invincibleTime = 1.5;
                        playExplosionSound();

                        if (this.health <= 0) {
                            this.scoring.onCollision();
                            this.setState(GameState.GAMEOVER);
                            return;
                        }
                    }
                }
            }
        }

        // 玩家与障碍物碰撞检测
        for (const obstacle of this.obstacles) {
            if (!obstacle.checkCollision) continue;

            const collision = obstacle.checkCollision(this.player.x, this.player.y, this.player.hitboxRadius);
            if (!collision) continue;

            // 金币：收集并加分
            if (obstacle.type === 'coin') {
                obstacle.collect();
                this.scoring.onCoinCollected(obstacle.value);
                playCoinSound();  // 播放金币音效
            } else if (obstacle.type === 'enemy') {
                // 敌人碰撞：扣血（有无敌时间）
                if (this.invincibleTime <= 0) {
                    this.health--;
                    this.invincibleTime = 1.5;  // 1.5秒无敌
                    playExplosionSound();
                    if (this.health <= 0) {
                        this.scoring.onCollision();
                        this.setState(GameState.GAMEOVER);
                        return;
                    }
                }
            } else {
                // 其他障碍物：碰撞后游戏结束
                this.scoring.onCollision();
                this.setState(GameState.GAMEOVER);
                return;
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        ctx.clearRect(0, 0, width, height);
        if (this.currentScene) {
            this.currentScene.renderBackground(ctx, width, height);
        }

        // 渲染爆炸（先渲染，在障碍物和子弹下面）
        for (const explosion of this.explosions) {
            explosion.render(ctx);
        }

        for (const obstacle of this.obstacles) {
            obstacle.render(ctx);
        }

        // 渲染子弹
        for (const bullet of this.bullets) {
            bullet.render(ctx);
        }

        this.renderPlayer(ctx);
        this.renderHUD(ctx);
        this.renderStateOverlay(ctx);
    }

    renderPlayer(ctx) {
        const x = this.player.x * this.canvas.width;
        const y = this.player.y * this.canvas.height;
        const size = this.player.hitboxRadius * Math.min(this.canvas.width, this.canvas.height) * 1.5;

        ctx.save();
        ctx.translate(x, y);

        // 射击模式下飞船朝上，不需要旋转

        // 飞船主体 - 三角形
        ctx.beginPath();
        ctx.moveTo(0, -size);           // 顶部
        ctx.lineTo(-size * 0.7, size * 0.5);  // 左下
        ctx.lineTo(0, size * 0.2);       // 底部中
        ctx.lineTo(size * 0.7, size * 0.5);  // 右下
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, -size, 0, size * 0.5);
        gradient.addColorStop(0, '#00D9A5');
        gradient.addColorStop(1, '#00A080');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#00FFB0';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 驾驶舱
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.2, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#66FFDD';
        ctx.fill();
        ctx.strokeStyle = '#00D9A5';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 引擎火焰
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, size * 0.4);
        ctx.lineTo(0, size * 0.8 + Math.random() * size * 0.2);
        ctx.lineTo(size * 0.3, size * 0.4);
        ctx.fillStyle = '#FF6B35';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-size * 0.15, size * 0.4);
        ctx.lineTo(0, size * 0.6 + Math.random() * size * 0.1);
        ctx.lineTo(size * 0.15, size * 0.4);
        ctx.fillStyle = '#FFD700';
        ctx.fill();

        ctx.restore();
    }

    renderHUD(ctx) {
        ctx.fillStyle = 'white';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`金币: ${this.scoring.coinsCollected}`, 10, 25);
        ctx.fillText(`分数: ${Math.round(this.scoring.getCurrentScore())}`, 10, 50);
        ctx.fillText(`难度: ${this.difficulty.getCurrentLevel()}`, 10, 75);
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        ctx.fillText(`时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, 10, 100);

        // 射击模式：显示生命值
        if (this.currentScene && this.currentScene.movementAxis === 'shooting') {
            ctx.fillStyle = '#FF4444';
            ctx.font = 'bold 20px sans-serif';
            let healthText = '生命: ';
            for (let i = 0; i < this.maxHealth; i++) {
                healthText += i < this.health ? '❤' : '♡';
            }
            ctx.fillText(healthText, 10, 130);
        }
    }

    renderStateOverlay(ctx) {
        if (this.state === GameState.MENU) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('按开始游戏', this.canvas.width / 2, this.canvas.height / 2);
        } else if (this.state === GameState.GAMEOVER) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = '#EF4444';
            ctx.textAlign = 'center';
            ctx.font = 'bold 28px sans-serif';
            ctx.fillText('游戏结束', this.canvas.width / 2, this.canvas.height / 2 - 40);
            ctx.fillStyle = 'white';
            ctx.font = '20px sans-serif';
            ctx.fillText(`最终分数: ${Math.round(this.scoring.getFinalScore())}`, this.canvas.width / 2, this.canvas.height / 2);
            ctx.font = '24px sans-serif';
            ctx.fillText(`评级: ${this.scoring.getGrade()}`, this.canvas.width / 2, this.canvas.height / 2 + 35);
        }
    }

    setScene(scene) {
        if (this.currentScene) this.currentScene.cleanup();
        this.currentScene = scene;
        this.currentScene.init(this);
    }

    setMotionMode(mode) {
        this.input.setMotionMode(mode);
    }

    start() {
        // 重置射击状态
        this.lastShootTime = -0.5;
        this.lockedTarget = null;
        this.aimDuration = 0;
        this.lastAimTime = 0;
        this.burstRemaining = 0;
        this.health = this.maxHealth;  // 重置生命
        this.invincibleTime = 0;  // 重置无敌时间
        this.setState(GameState.PLAYING);
    }

    cleanup() {
        this.stopGameLoop();
        if (this.currentScene) this.currentScene.cleanup();
    }
}

// ============================================================
// GAME UI - 游戏UI管理
// ============================================================
class GameUI {
    constructor(engine) {
        this.engine = engine;
        this.selectedScene = 'space';
        this.selectedMode = MotionMapper.MODES.SINGLE_YAW;
    }

    showSelectPanel() {
        const container = document.getElementById('detection-area');
        if (!container) return;

        const existing = document.getElementById('game-select-panel');
        if (existing) { existing.style.display = 'block'; return; }

        const panel = document.createElement('div');
        panel.id = 'game-select-panel';
        panel.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(15,23,42,0.98);border:2px solid #00D9A5;border-radius:16px;padding:20px;min-width:320px;color:white;z-index:100;';

        panel.innerHTML = `
            <h3 style="text-align:center;margin-bottom:12px;color:#00D9A5;font-size:16px;">选择游戏</h3>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;color:#9CA3AF;font-size:11px;">场景</label>
                <div style="display:flex;gap:6px;">
                    <button class="scene-btn active" data-scene="space" style="flex:1;padding:8px;border:2px solid transparent;border-radius:6px;background:#1E293B;color:white;cursor:pointer;font-size:11px;">🚀 太空</button>
                    <button class="scene-btn" data-scene="valley" style="flex:1;padding:8px;border:2px solid transparent;border-radius:6px;background:#1E293B;color:white;cursor:pointer;font-size:11px;">✈️ 山谷</button>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;color:#9CA3AF;font-size:11px;">运动模式</label>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <button class="mode-btn active" data-mode="shooting" style="padding:6px 8px;border:2px solid #EF4444;border-radius:4px;background:#1E293B;color:#EF4444;cursor:pointer;text-align:left;font-size:11px;font-weight:bold;">🚀 射击模式</button>
                    <button class="mode-btn" data-mode="nodding" style="padding:6px 8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;font-size:11px;">🚀 太空点头</button>
                    <button class="mode-btn" data-mode="flight" style="padding:6px 8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;font-size:11px;">✈️ 山谷飞行</button>
                    <button class="mode-btn" data-mode="space3d" style="padding:6px 8px;border:2px solid transparent;border-radius:4px;background:#1E293B;color:white;cursor:pointer;text-align:left;font-size:11px;">🌌 太空3D</button>
                </div>
            </div>
            <button id="start-game-btn" style="width:100%;padding:10px;background:#00D9A5;border:none;border-radius:6px;color:#0F172A;font-size:13px;font-weight:bold;cursor:pointer;margin-top:4px;">开始游戏</button>
        `;

        container.appendChild(panel);
        this.bindEvents(panel);
    }

    hideSelectPanel() {
        const panel = document.getElementById('game-select-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    bindEvents(panel) {
        panel.querySelectorAll('.scene-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.scene-btn').forEach(b => { b.classList.remove('active'); b.style.borderColor = 'transparent'; });
                btn.classList.add('active');
                btn.style.borderColor = '#00D9A5';
                this.selectedScene = btn.dataset.scene;
            });
        });

        panel.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.mode-btn').forEach(b => { b.classList.remove('active'); b.style.borderColor = 'transparent'; });
                btn.classList.add('active');
                btn.style.borderColor = '#00D9A5';
                this.selectedMode = btn.dataset.mode;
            });
        });

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startGame();
            });
        }
    }

    startGame() {
        this.hideSelectPanel();
        this.engine.setMotionMode(this.selectedMode);

        let scene;
        // 场景模式（flight/space3d/nodding）通过 selectedMode 判断
        if (this.selectedMode === 'flight') {
            scene = new SceneValley();
        } else if (this.selectedMode === 'space3d') {
            scene = new SceneSpace3D();
        } else {
            // 射击/点头模式使用 space 场景
            switch (this.selectedScene) {
                case 'valley': scene = new SceneValley(); break;
                default: scene = new SceneSpace();
            }
        }

        // 单轴上下模式：限制玩家只能在垂直中线移动，障碍物从右向左
        if (this.selectedMode === MotionMapper.MODES.SINGLE_PITCH) {
            scene.movementAxis = 'vertical';
            scene.scrollDirection = 'left';
        }
        // 单轴左右模式：限制玩家只能在水平最下方移动，障碍物从下向上
        if (this.selectedMode === MotionMapper.MODES.SINGLE_YAW) {
            scene.movementAxis = 'horizontal';
            scene.scrollDirection = 'up';
        }
        // 射击模式：玩家在底部，敌人从上方飞下
        if (this.selectedMode === 'shooting') {
            scene.movementAxis = 'shooting';
            scene.scrollDirection = 'down';  // 敌人从上方飞下来
        }

        this.engine.setScene(scene);
        this.engine.start();
    }
}

// ============================================================
// EXPORT
// ============================================================
window.GameModule = {
    GameEngine,
    GameUI,
    MotionMapper,
    GameState
};
