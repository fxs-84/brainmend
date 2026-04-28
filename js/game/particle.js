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
        this.decay = config.decay || 0.02;
        this.gravity = config.gravity || 0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        this.life -= this.decay * dt * 60;
    }

    render(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const size = this.size * Math.min(ctx.canvas.width, ctx.canvas.height) * alpha;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x * ctx.canvas.width, this.y * ctx.canvas.height, size, 0, Math.PI * 2);
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

    // 金币收集爆发效果
    emitCoinCollect(x, y) {
        this.emit(x, y, 20, {
            color: '#FFD700',
            size: 0.015,
            life: 1,
            decay: 0.03,
            spread: 0.3
        });
        // 额外金色闪光
        this.emit(x, y, 10, {
            color: '#FFFACD',
            size: 0.008,
            life: 0.8,
            decay: 0.05,
            spread: 0.2
        });
    }

    // 爆炸效果
    emitExplosion(x, y) {
        this.emit(x, y, 30, {
            color: '#FF6B6B',
            size: 0.02,
            life: 1,
            decay: 0.025,
            spread: 0.4,
            gravity: 0.02
        });
        this.emit(x, y, 15, {
            color: '#FFE66D',
            size: 0.01,
            life: 0.8,
            decay: 0.04,
            spread: 0.3
        });
    }

    // 引擎尾焰
    emitEngineTrail(x, y) {
        this.emit(x, y, 2, {
            color: '#00D9A5',
            size: 0.008,
            life: 0.5,
            decay: 0.04,
            spread: 0.05,
            vx: 0,
            vy: 0.05
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
