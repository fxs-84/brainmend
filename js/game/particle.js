// ============================================================
// PARTICLE SYSTEM - 粒子效果系统
// ============================================================

export class Particle {
    constructor(x, y, config = {}) {
        this.x = x;
        this.y = y;
        this.vx = config.vx || (Math.random() - 0.5) * 0.2;
        this.vy = config.vy || (Math.random() - 0.5) * 0.2;
        this.life = config.life || 1;
        this.maxLife = this.life;
        this.size = config.size || 0.01;
        this.color = config.color || '#FFD700';
        this.colorEnd = config.colorEnd || '#FF6600';
        this.decay = config.decay || 0.02;
        this.gravity = config.gravity || 0;
        this.friction = config.friction || 0.98;
        this.trail = config.trail || false;
        this.trailLength = config.trailLength || 5;
        this.history = [];
    }

    update(dt) {
        if (this.trail) {
            this.history.push({ x: this.x, y: this.y, life: this.life });
            if (this.history.length > this.trailLength) {
                this.history.shift();
            }
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= this.decay * dt * 60;
    }

    render(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const size = this.size * Math.min(ctx.canvas.width, ctx.canvas.height) * alpha;

        ctx.save();

        // 渲染轨迹
        if (this.trail && this.history.length > 1) {
            for (let i = 1; i < this.history.length; i++) {
                const point = this.history[i];
                const trailAlpha = (i / this.history.length) * alpha * 0.5;
                const trailSize = size * (i / this.history.length) * 0.8;

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

        // 主粒子
        ctx.globalAlpha = alpha;

        // 发光效果
        const glowSize = size * 2;
        const gradient = ctx.createRadialGradient(
            this.x * ctx.canvas.width, this.y * ctx.canvas.height, 0,
            this.x * ctx.canvas.width, this.y * ctx.canvas.height, glowSize
        );
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.4, this.colorEnd);
        gradient.addColorStop(1, 'transparent');

        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(
            this.x * ctx.canvas.width,
            this.y * ctx.canvas.height,
            glowSize,
            0, Math.PI * 2
        );
        ctx.fill();

        // 核心
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(
            this.x * ctx.canvas.width,
            this.y * ctx.canvas.height,
            size * 0.4,
            0, Math.PI * 2
        );
        ctx.fill();

        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(x, y, count, config = {}) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, {
                ...config,
                vx: (config.vx || 0) + (Math.random() - 0.5) * (config.spread || 0.2),
                vy: (config.vy || 0) + (Math.random() - 0.5) * (config.spread || 0.2)
            }));
        }
    }

    emitCoinCollect(x, y) {
        // 主爆发 - 金色
        this.emit(x, y, 25, {
            color: '#FFD700',
            colorEnd: '#FF8C00',
            size: 0.018,
            life: 1.2,
            decay: 0.025,
            spread: 0.35,
            gravity: 0.015,
            friction: 0.96
        });

        // 细小闪光
        this.emit(x, y, 15, {
            color: '#FFFACD',
            colorEnd: '#FFD700',
            size: 0.008,
            life: 0.8,
            decay: 0.04,
            spread: 0.25,
            gravity: 0.01
        });

        // 带轨迹的光点
        this.emit(x, y, 8, {
            color: '#FFFFFF',
            colorEnd: '#FFE4B5',
            size: 0.012,
            life: 1,
            decay: 0.02,
            spread: 0.15,
            gravity: 0,
            trail: true,
            trailLength: 8
        });
    }

    emitExplosion(x, y) {
        this.emit(x, y, 35, {
            color: '#FF6B6B',
            colorEnd: '#FF4444',
            size: 0.025,
            life: 1.2,
            decay: 0.02,
            spread: 0.45,
            gravity: 0.025,
            friction: 0.95
        });
        this.emit(x, y, 20, {
            color: '#FFE66D',
            colorEnd: '#FFA500',
            size: 0.015,
            life: 1,
            decay: 0.03,
            spread: 0.35,
            gravity: 0.02
        });
        this.emit(x, y, 10, {
            color: '#FFFFFF',
            colorEnd: '#FFE4B5',
            size: 0.01,
            life: 0.7,
            decay: 0.05,
            spread: 0.2,
            trail: true
        });
    }

    emitEngineTrail(x, y) {
        this.emit(x, y, 3, {
            color: '#00D9A5',
            colorEnd: '#0088AA',
            size: 0.012,
            life: 0.6,
            decay: 0.05,
            spread: 0.08,
            vx: 0,
            vy: 0.08,
            gravity: 0.01,
            trail: true,
            trailLength: 6
        });
    }

    emitCollect(x, y, color, count = 10) {
        this.emit(x, y, count, {
            color: color,
            colorEnd: '#FFFFFF',
            size: 0.015,
            life: 1,
            decay: 0.03,
            spread: 0.3,
            gravity: 0.01,
            trail: true,
            trailLength: 5
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].isDead()) {
                this.particles.splice(i, 1);
            }
        }
    }

    render(ctx) {
        for (const particle of this.particles) {
            particle.render(ctx);
        }
    }

    clear() {
        this.particles = [];
    }
}
