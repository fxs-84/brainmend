// ============================================================
// BULLET - 子弹
// ============================================================

export class Bullet {
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

        // 超出边界
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
        this.x = config.x || 1.1;
        this.y = config.y || 0.5;
        this.speedX = config.speedX || -0.15;
        this.speedY = config.speedY || 0;
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
    }

    update(dt, speedMultiplier = 1) {
        this.x += this.speedX * dt * speedMultiplier;
        this.y += this.speedY * dt * speedMultiplier;
        this.rotation += this.rotationSpeed * dt;

        if (this.canShoot) {
            this.shootTimer += dt;
        }
    }

    render(ctx) {
        if (!this.active) return;

        const posX = this.x * ctx.canvas.width;
        const posY = this.y * ctx.canvas.height;
        const size = this.radius * Math.min(ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(this.rotation);

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
        // 战斗机 - 三角形飞船
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.7, -size * 0.6);
        ctx.lineTo(-size * 0.4, 0);
        ctx.lineTo(-size * 0.7, size * 0.6);
        ctx.closePath();
        ctx.fill();

        // 驾驶舱
        ctx.fillStyle = '#1E3A5F';
        ctx.beginPath();
        ctx.arc(size * 0.2, 0, size * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // 引擎火焰
        if (Math.random() > 0.3) {
            const flameGradient = ctx.createLinearGradient(-size * 0.7, 0, -size * 1.2, 0);
            flameGradient.addColorStop(0, '#FF6B6B');
            flameGradient.addColorStop(0.5, '#FFE66D');
            flameGradient.addColorStop(1, 'transparent');
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.moveTo(-size * 0.7, -size * 0.2);
            ctx.lineTo(-size * 1.2, 0);
            ctx.lineTo(-size * 0.7, size * 0.2);
            ctx.closePath();
            ctx.fill();
        }
    }

    renderCruiser(ctx, size) {
        // 巡洋舰 - 更大更复杂
        ctx.fillStyle = this.color;
        // 主船体
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(size * 0.5, -size * 0.4);
        ctx.lineTo(-size * 0.8, -size * 0.5);
        ctx.lineTo(-size * 1.2, -size * 0.3);
        ctx.lineTo(-size * 1.2, size * 0.3);
        ctx.lineTo(-size * 0.8, size * 0.5);
        ctx.lineTo(size * 0.5, size * 0.4);
        ctx.closePath();
        ctx.fill();

        // 船塔
        ctx.fillStyle = '#B91C1C';
        ctx.fillRect(-size * 0.3, -size * 0.15, size * 0.5, size * 0.3);

        // 驾驶舱
        ctx.fillStyle = '#1E3A5F';
        ctx.beginPath();
        ctx.arc(size * 0.3, 0, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    renderCarrier(ctx, size) {
        // 航母 - 最大型飞船
        ctx.fillStyle = this.color;
        // 主船体
        ctx.beginPath();
        ctx.moveTo(size * 1.2, 0);
        ctx.lineTo(size * 0.8, -size * 0.6);
        ctx.lineTo(-size, -size * 0.5);
        ctx.lineTo(-size * 1.5, -size * 0.2);
        ctx.lineTo(-size * 1.5, size * 0.2);
        ctx.lineTo(-size, size * 0.5);
        ctx.lineTo(size * 0.8, size * 0.6);
        ctx.closePath();
        ctx.fill();

        // 甲板
        ctx.fillStyle = '#991B1B';
        ctx.fillRect(-size * 0.8, -size * 0.3, size * 1.2, size * 0.6);

        // 舰桥
        ctx.fillStyle = '#1E3A5F';
        ctx.beginPath();
        ctx.arc(size * 0.5, 0, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-size * 0.2, -size * 0.1, size * 0.4, size * 0.2);
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
            return true; // 被摧毁
        }
        return false;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < -0.2 || this.x > 1.2 || this.y < -0.2 || this.y > 1.2;
    }
}
