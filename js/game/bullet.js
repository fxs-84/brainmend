// ============================================================
// BULLET - 子弹
// ============================================================

export class Bullet {
    /**
     * @param {number} x
     * @param {number} y
     * @param {Object} config
     * @param {Function} [config.onFire] - 发射时回调
     */
    constructor(x, y, config = {}) {
        this.x = x;
        this.y = y;
        this.vx = config.vx || 0;
        this.vy = config.vy || -0.5;
        this.speed = config.speed || 0.6;
        this.radius = config.radius || 0.008;
        this.color = config.color || '#00D9A5';
        this.trail = config.trail || true;
        this.trailLength = config.trailLength || 6;
        this.history = [];
        this.life = 1;
        this.active = true;

        // 发射时回调
        if (config.onFire) {
            config.onFire();
        }
    }

    update(dt, speedMultiplier = 1) {
        if (this.trail) {
            this.history.push({ x: this.x, y: this.y });
            if (this.history.length > this.trailLength) {
                this.history.shift();
            }
        }

        this.x += this.vx * this.speed * dt * speedMultiplier;
        this.y += this.vy * this.speed * dt * speedMultiplier;

        if (this.y < -0.05 || this.y > 1.1 || this.x < -0.1 || this.x > 1.1) {
            this.active = false;
        }
    }

    render(ctx) {
        if (!this.active) return;

        const posX = this.x * ctx.canvas.width;
        const posY = this.y * ctx.canvas.height;
        const radius = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

        ctx.save();

        // 渲染轨迹
        if (this.trail && this.history.length > 1) {
            for (let i = 1; i < this.history.length; i++) {
                const point = this.history[i];
                const trailAlpha = (i / this.history.length) * 0.6;
                const trailSize = radius * (i / this.history.length) * 0.8;

                ctx.globalAlpha = trailAlpha;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(
                    point.x * ctx.canvas.width,
                    point.y * ctx.canvas.height,
                    trailSize,
                    0, Math.PI * 2
                );
                ctx.fill();
            }
        }

        // 子弹发光效果
        const glowGradient = ctx.createRadialGradient(posX, posY, 0, posX, posY, radius * 3);
        glowGradient.addColorStop(0, this.color);
        glowGradient.addColorStop(0.5, 'rgba(0, 217, 165, 0.4)');
        glowGradient.addColorStop(1, 'transparent');

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(posX, posY, radius * 3, 0, Math.PI * 2);
        ctx.fill();

        // 子弹核心
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(posX, posY, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(posX, posY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return !this.active || this.y < -0.05 || this.y > 1.1 || this.x < -0.1 || this.x > 1.1;
    }
}

// ============================================================
// ENEMY FLEET - 敌舰编队
// ============================================================

export class EnemyFleet {
    constructor(config = {}) {
        this.x = config.x || 0.5;
        this.y = config.y || -0.1;
        this.speedX = config.speedX || 0;
        this.speedY = config.speedY || 0.15;
        this.radius = config.radius || 0.04;
        this.type = config.type || 'fighter';
        this.health = config.health || 1;
        this.maxHealth = this.health;
        this.color = config.color || '#EF4444';
        this.active = true;
        this.rotation = 0;
        this.rotationSpeed = config.rotationSpeed || 0;
        this.shootTimer = 0;
        this.shootInterval = config.shootInterval || 2;
        this.canShoot = config.canShoot || false;
        this.glowPhase = Math.random() * Math.PI * 2;
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.y += this.speedY * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;
        this.glowPhase += dt * 3;

        if (this.canShoot) {
            this.shootTimer += dt;
        }
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.y > 1.2 || this.y < -0.3 || this.x < -0.3 || this.x > 1.3;
    }

    render(ctx) {
        if (!this.active) return;

        const posX = this.x * ctx.canvas.width;
        const posY = this.y * ctx.canvas.height;
        const size = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(posX, posY);
        // 旋转使舰船头朝下（朝向玩家）
        ctx.rotate(Math.PI / 2);

        switch (this.type) {
            case 'fighter':
                this.renderFighter(ctx, size);
                break;
            case 'cruiser':
                this.renderCruiser(ctx, size);
                break;
            case 'carrier':
                this.renderCarrier(ctx, size);
                break;
            default:
                this.renderFighter(ctx, size);
        }

        ctx.restore();
    }

    renderFighter(ctx, size) {
        const glow = 0.5 + 0.5 * Math.sin(this.glowPhase);

        // 外发光
        ctx.shadowColor = '#FF4444';
        ctx.shadowBlur = 10 * glow;

        // 主船体 - 黑色剪影风格
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.moveTo(size * 1.2, 0);
        ctx.lineTo(size * 0.3, -size * 0.5);
        ctx.lineTo(-size * 0.8, -size * 0.4);
        ctx.lineTo(-size * 1.0, -size * 0.15);
        ctx.lineTo(-size * 0.8, size * 0);
        ctx.lineTo(-size * 1.0, size * 0.15);
        ctx.lineTo(-size * 0.8, size * 0.4);
        ctx.lineTo(size * 0.3, size * 0.5);
        ctx.closePath();
        ctx.fill();

        // 红色边框
        ctx.strokeStyle = '#FF3333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 驾驶舱 - 发光玻璃
        const cockpitGradient = ctx.createRadialGradient(size * 0.3, 0, 0, size * 0.3, 0, size * 0.3);
        cockpitGradient.addColorStop(0, '#00FFFF');
        cockpitGradient.addColorStop(0.5, '#0066FF');
        cockpitGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = cockpitGradient;
        ctx.beginPath();
        ctx.ellipse(size * 0.3, 0, size * 0.25, size * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        // 机翼装饰线
        ctx.strokeStyle = '#FF6666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(size * 0.1, -size * 0.35);
        ctx.lineTo(-size * 0.5, -size * 0.3);
        ctx.moveTo(size * 0.1, size * 0.35);
        ctx.lineTo(-size * 0.5, size * 0.3);
        ctx.stroke();

        // 引擎火焰
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FF6600';
        const flameGradient = ctx.createLinearGradient(-size * 0.8, 0, -size * 1.5, 0);
        flameGradient.addColorStop(0, '#FFFFFF');
        flameGradient.addColorStop(0.2, '#FFFF00');
        flameGradient.addColorStop(0.5, '#FF6600');
        flameGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = flameGradient;
        ctx.beginPath();
        ctx.moveTo(-size * 0.8, -size * 0.15);
        ctx.quadraticCurveTo(-size * 1.3, 0, -size * 0.8, size * 0.15);
        ctx.fill();
    }

    renderCruiser(ctx, size) {
        const glow = 0.5 + 0.5 * Math.sin(this.glowPhase);

        // 外发光
        ctx.shadowColor = '#AA2222';
        ctx.shadowBlur = 12 * glow;

        // 主船体 - 更复杂的巡洋舰
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        // 舰首
        ctx.moveTo(size * 1.3, 0);
        ctx.lineTo(size * 0.8, -size * 0.3);
        ctx.lineTo(size * 0.4, -size * 0.5);
        ctx.lineTo(-size * 0.3, -size * 0.55);
        ctx.lineTo(-size * 0.8, -size * 0.45);
        ctx.lineTo(-size * 1.1, -size * 0.25);
        ctx.lineTo(-size * 1.2, 0);
        ctx.lineTo(-size * 1.1, size * 0.25);
        ctx.lineTo(-size * 0.8, size * 0.45);
        ctx.lineTo(-size * 0.3, size * 0.55);
        ctx.lineTo(size * 0.4, size * 0.5);
        ctx.lineTo(size * 0.8, size * 0.3);
        ctx.closePath();
        ctx.fill();

        // 红色边框
        ctx.strokeStyle = '#CC2222';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 舰桥塔
        ctx.fillStyle = '#2a2a4e';
        ctx.fillRect(-size * 0.2, -size * 0.15, size * 0.5, size * 0.3);
        ctx.strokeStyle = '#FF4444';
        ctx.strokeRect(-size * 0.2, -size * 0.15, size * 0.5, size * 0.3);

        // 驾驶舱玻璃
        const cockpitGradient = ctx.createRadialGradient(size * 0.5, 0, 0, size * 0.5, 0, size * 0.25);
        cockpitGradient.addColorStop(0, '#00FFFF');
        cockpitGradient.addColorStop(1, '#0044AA');
        ctx.fillStyle = cockpitGradient;
        ctx.beginPath();
        ctx.ellipse(size * 0.5, 0, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 侧翼武器
        ctx.fillStyle = '#333355';
        ctx.fillRect(size * 0.1, -size * 0.6, size * 0.3, size * 0.12);
        ctx.fillRect(size * 0.1, size * 0.48, size * 0.3, size * 0.12);

        // 引擎组
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#FF4400';
        for (let i = 0; i < 3; i++) {
            const flameGradient = ctx.createLinearGradient(-size * 0.8, 0, -size * 1.4, 0);
            flameGradient.addColorStop(0, '#FFFFFF');
            flameGradient.addColorStop(0.3, '#FFAA00');
            flameGradient.addColorStop(1, 'transparent');
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.arc(-size * 0.9 - size * 0.15 * i, -size * 0.2 + size * 0.2 * i, size * 0.1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    renderCarrier(ctx, size) {
        const glow = 0.5 + 0.5 * Math.sin(this.glowPhase);

        // 外发光
        ctx.shadowColor = '#881111';
        ctx.shadowBlur = 15 * glow;

        // 主船体 - 大型航母
        ctx.fillStyle = '#0a0a1e';
        ctx.beginPath();
        // 舰首
        ctx.moveTo(size * 1.5, 0);
        ctx.lineTo(size * 1.0, -size * 0.2);
        ctx.lineTo(size * 0.6, -size * 0.4);
        ctx.lineTo(size * 0.3, -size * 0.6);
        ctx.lineTo(-size * 0.5, -size * 0.6);
        ctx.lineTo(-size * 1.0, -size * 0.4);
        ctx.lineTo(-size * 1.4, -size * 0.2);
        ctx.lineTo(-size * 1.6, 0);
        ctx.lineTo(-size * 1.4, size * 0.2);
        ctx.lineTo(-size * 1.0, size * 0.4);
        ctx.lineTo(-size * 0.5, size * 0.6);
        ctx.lineTo(size * 0.3, size * 0.6);
        ctx.lineTo(size * 0.6, size * 0.4);
        ctx.lineTo(size * 1.0, size * 0.2);
        ctx.closePath();
        ctx.fill();

        // 紫色边框
        ctx.strokeStyle = '#AA2222';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 舰桥
        ctx.fillStyle = '#1a1a3e';
        ctx.beginPath();
        ctx.moveTo(size * 0.5, -size * 0.25);
        ctx.lineTo(size * 0.8, -size * 0.35);
        ctx.lineTo(size * 0.9, -size * 0.15);
        ctx.lineTo(size * 0.9, size * 0.15);
        ctx.lineTo(size * 0.8, size * 0.35);
        ctx.lineTo(size * 0.5, size * 0.25);
        ctx.closePath();
        ctx.fill();

        // 甲板
        ctx.fillStyle = '#222244';
        ctx.fillRect(-size * 0.3, -size * 0.5, size * 0.7, size * 1.0);
        ctx.strokeStyle = '#FF3333';
        ctx.lineWidth = 1;
        ctx.strokeRect(-size * 0.3, -size * 0.5, size * 0.7, size * 1.0);

        // 驾驶舱
        const cockpitGradient = ctx.createRadialGradient(size * 0.6, 0, 0, size * 0.6, 0, size * 0.2);
        cockpitGradient.addColorStop(0, '#00FFCC');
        cockpitGradient.addColorStop(1, '#004466');
        ctx.fillStyle = cockpitGradient;
        ctx.beginPath();
        ctx.ellipse(size * 0.6, 0, size * 0.18, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // 引擎组 - 四个大引擎
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#FF6600';
        for (let i = 0; i < 4; i++) {
            const flameGradient = ctx.createRadialGradient(
                -size * 1.3, -size * 0.25 + size * 0.17 * i, 0,
                -size * 1.3, -size * 0.25 + size * 0.17 * i, size * 0.15
            );
            flameGradient.addColorStop(0, '#FFFFFF');
            flameGradient.addColorStop(0.4, '#FFAA00');
            flameGradient.addColorStop(1, 'transparent');
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.arc(-size * 1.3, -size * 0.25 + size * 0.17 * i, size * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    checkCollision(playerX, playerY, playerRadius) {
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        return Math.sqrt(dx * dx + dy * dy) < playerRadius + this.radius;
    }

    hit(damage = 1) {
        this.health -= damage;
        if (this.health <= 0) {
            this.active = false;
            return true;
        }
        return false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < -0.2 || this.x > 1.2 || this.y < -0.2 || this.y > 1.2;
    }
}
