// 太空点头训练 — 单轴俯仰控制，飞船上下移动躲避障碍+吃金币
import { SceneBase } from './scene-base.js';
import { ParticleSystem } from './particle.js';
import { soundManager } from './sound-manager.js';

export class SceneSpaceNodding extends SceneBase {
    constructor() {
        super();
        this.time = 0;
        this.particles = new ParticleSystem();
        this.obstacles = [];
        this.coins = [];
        this.stars = [];
        this.nebulae = [];
        this.lastSpawn = 0;
        this.coinSpawnTimer = 0;
        this.shipY = 0.5;
        this.init();
    }

    init(engine) {
        super.init(engine);
        this.time = 0; this.obstacles = []; this.coins = []; this.stars = []; this.nebulae = [];
        this.lastSpawn = 0; this.coinSpawnTimer = 0;
        // 分层星星
        for (let i = 0; i < 120; i++) {
            this.stars.push({
                x: Math.random(), y: Math.random(),
                sz: 0.2 + Math.random() * 1.8,
                tw: Math.random() * Math.PI * 2,
                sp: 0.1 + Math.random() * 0.7,
                hue: 30 + Math.random() * 210
            });
        }
        // 背景星云
        for (let i = 0; i < 4; i++) {
            this.nebulae.push({
                x: Math.random(), y: Math.random() * 0.8,
                rx: 0.15 + Math.random() * 0.35,
                ry: 0.08 + Math.random() * 0.2,
                hue: [260, 180, 340, 30][i],
                alpha: 0.03 + Math.random() * 0.05
            });
        }
    }

    update(dt) {
        super.update(dt); this.time += dt;
        const speed = 0.25;

        for (const o of this.obstacles) { o.x -= speed * dt; o.anim += dt * 3; }
        this.obstacles = this.obstacles.filter(o => o.x > -0.25);
        for (const c of this.coins) { c.x -= speed * dt; c.rot += dt * 5; c.bob += dt * 3; }
        this.coins = this.coins.filter(c => c.x > -0.15);
        for (const s of this.stars) { s.x -= s.sp * 0.015 * dt; if (s.x < -0.05) s.x = 1.05; s.tw += dt * (1 + s.sp); }
        this.particles.update(dt);

        const diff = 1.0 + Math.min(1.5, this.time / 40);

        if (this.time - this.lastSpawn > 1.8 / diff) {
            this.lastSpawn = this.time;
            this.spawnObstacle(diff);
        }
        this.coinSpawnTimer += dt;
        if (this.coinSpawnTimer > 1.5 / diff) {
            this.coinSpawnTimer = 0;
            this.spawnCoin();
        }
    }

    spawnObstacle(diff) {
        const gapCenter = 0.2 + Math.random() * 0.6;
        const gapSize = 0.16 + Math.random() * 0.10;
        const r = Math.random();

        if (r < 0.35) {
            // 小行星
            const oy = Math.random() < 0.5
                ? gapCenter - gapSize - Math.random() * 0.18
                : gapCenter + gapSize + Math.random() * 0.18;
            const size = 0.03 + Math.random() * 0.05;
            this.obstacles.push({
                type: 'asteroid', x: 1.12, y: Math.max(0.06, Math.min(0.94, oy)),
                r: size, rot: Math.random() * Math.PI * 2, rotSpd: (Math.random() - 0.5) * 3,
                craters: Math.floor(Math.random() * 5) + 2,
                hue: 20 + Math.random() * 25,
                jagged: 0.15 + Math.random() * 0.25
            });
        } else if (r < 0.55) {
            // 双小行星群
            for (const sign of [-1, 1]) {
                const oy = gapCenter + sign * (gapSize + 0.03 + Math.random() * 0.07);
                if (oy > 0.06 && oy < 0.94) this.obstacles.push({
                    type: 'asteroid', x: 1.12, y: oy, r: 0.025 + Math.random() * 0.035,
                    rot: Math.random() * Math.PI * 2, rotSpd: (Math.random() - 0.5) * 3,
                    craters: Math.floor(Math.random() * 3) + 1,
                    hue: 15 + Math.random() * 30,
                    jagged: 0.1 + Math.random() * 0.2
                });
            }
        } else if (r < 0.75) {
            // 彗星
            const oy = Math.random() < 0.5
                ? gapCenter - gapSize - Math.random() * 0.15
                : gapCenter + gapSize + Math.random() * 0.15;
            this.obstacles.push({
                type: 'comet', x: 1.15, y: Math.max(0.08, Math.min(0.92, oy)),
                r: 0.02 + Math.random() * 0.03, tailLen: 0.07 + Math.random() * 0.1,
                hue: 190 + Math.random() * 50
            });
        } else if (r < 0.90) {
            // 能量屏障
            const barTop = gapCenter - gapSize - 0.02;
            const barBot = gapCenter + gapSize + 0.02;
            const hue = Math.random() < 0.5 ? 280 : 180;
            if (barTop > 0.05) this.obstacles.push({ type: 'gate', x: 1.08, yMin: 0.02, yMax: barTop, hue });
            if (barBot < 0.95) this.obstacles.push({ type: 'gate', x: 1.08, yMin: barBot, yMax: 0.98, hue });
        } else {
            // 太空水雷 — 带尖刺的球形
            const oy = Math.random() < 0.5
                ? gapCenter - gapSize - Math.random() * 0.15
                : gapCenter + gapSize + Math.random() * 0.15;
            this.obstacles.push({
                type: 'mine', x: 1.1, y: Math.max(0.08, Math.min(0.92, oy)),
                r: 0.03 + Math.random() * 0.04, rot: Math.random() * Math.PI * 2,
                rotSpd: (Math.random() - 0.5) * 2,
                spikes: 6 + Math.floor(Math.random() * 5)
            });
        }
    }

    spawnCoin() {
        const cy = 0.2 + Math.random() * 0.6;
        this.coins.push({
            x: 1.05 + Math.random() * 0.3, y: cy,
            rot: Math.random() * Math.PI * 2, bob: Math.random() * Math.PI * 2
        });
    }

    mapInputToPosition(inputPos, player) {
        return { x: 0.5, y: inputPos.y };
    }

    checkCollision(px, py, pr) {
        const w = this.engine ? this.engine.canvas.width : 1020;
        const h = this.engine ? this.engine.canvas.height : 650;
        const shipR = pr * Math.min(w, h) * 0.6;
        for (const o of this.obstacles) {
            const ox = o.x * w, oy = o.y * h;
            const dx = px * w - ox, dy = py * h - oy;
            if (o.type === 'gate') {
                if (Math.abs(dx) < 18 && py >= o.yMin && py <= o.yMax) return true;
            } else {
                const or = o.r * Math.min(w, h);
                if (Math.sqrt(dx * dx + dy * dy) < shipR + or) return true;
            }
        }
        return false;
    }

    checkCoinCollect(px, py) {
        const w = this.engine ? this.engine.canvas.width : 1020;
        const h = this.engine ? this.engine.canvas.height : 650;
        const out = [];
        for (const c of this.coins) {
            if (c.collected) continue;
            const dx = px * w - c.x * w, dy = py * h - c.y * h;
            if (Math.sqrt(dx * dx + dy * dy) < 40) { c.collected = true; out.push(c); }
        }
        return out;
    }

    renderBackground(ctx, w, h) {
        const minDim = Math.min(w, h);

        // === 深空背景 ===
        const bg = ctx.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
        bg.addColorStop(0, '#0a0a2e');
        bg.addColorStop(0.25, '#080820');
        bg.addColorStop(0.6, '#020210');
        bg.addColorStop(1, '#000005');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // === 星云 ===
        for (const n of this.nebulae) {
            const ng = ctx.createRadialGradient(n.x * w, n.y * h, 0, n.x * w, n.y * h, n.rx * w);
            ng.addColorStop(0, `hsla(${n.hue}, 60%, 40%, ${n.alpha * 1.5})`);
            ng.addColorStop(0.4, `hsla(${n.hue}, 50%, 25%, ${n.alpha})`);
            ng.addColorStop(1, 'transparent');
            ctx.fillStyle = ng;
            ctx.beginPath();
            ctx.ellipse(n.x * w, n.y * h, n.rx * w, n.ry * h, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // === 星星（三层） ===
        // 远景小星
        for (const s of this.stars) {
            if (s.sz > 0.8) continue;
            const tw = 0.4 + 0.6 * Math.sin(s.tw);
            ctx.fillStyle = `rgba(200,210,255,${0.2 + tw * 0.4})`;
            ctx.fillRect(s.x * w, s.y * h, Math.max(0.5, s.sz * 0.6), Math.max(0.5, s.sz * 0.6));
        }
        // 中景星
        for (const s of this.stars) {
            if (s.sz <= 0.8 || s.sz > 1.4) continue;
            const tw = 0.3 + 0.7 * Math.sin(s.tw);
            const a = 0.3 + tw * 0.5;
            ctx.fillStyle = `hsla(${s.hue}, 30%, 80%, ${a})`;
            ctx.shadowColor = s.sz > 1.1 && tw > 0.6 ? '#fff' : 'transparent';
            ctx.shadowBlur = s.sz > 1.1 && tw > 0.6 ? 4 : 0;
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.sz * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        // 近景亮星（十字光芒）
        for (const s of this.stars) {
            if (s.sz <= 1.4) continue;
            const tw = 0.3 + 0.7 * Math.sin(s.tw);
            const a = 0.4 + tw * 0.6;
            const sx = s.x * w, sy = s.y * h;
            // 十字光芒
            ctx.save();
            ctx.globalAlpha = a * 0.5;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.5;
            const armLen = s.sz * 2;
            ctx.beginPath(); ctx.moveTo(sx - armLen, sy); ctx.lineTo(sx + armLen, sy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx, sy - armLen); ctx.lineTo(sx, sy + armLen); ctx.stroke();
            ctx.restore();
            // 核心
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = s.sz * 2;
            ctx.beginPath();
            ctx.arc(sx, sy, s.sz * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // === 中心参考线（淡化） ===
        ctx.strokeStyle = 'rgba(0, 200, 180, 0.02)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 30]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // === 障碍物 ===
        for (const o of this.obstacles) {
            const ox = o.x * w, oy = o.y * h;

            if (o.type === 'asteroid') {
                this.renderAsteroid(ctx, o, ox, oy, minDim);
            } else if (o.type === 'comet') {
                this.renderComet(ctx, o, ox, oy, minDim);
            } else if (o.type === 'gate') {
                this.renderGate(ctx, o, ox, w, h);
            } else if (o.type === 'mine') {
                this.renderMine(ctx, o, ox, oy, minDim);
            }
        }

        // === 金币 ===
        for (const c of this.coins) {
            if (c.collected) continue;
            this.renderCoin(ctx, c, c.x * w, c.y * h, minDim);
        }

        this.particles.render(ctx);
    }

    renderAsteroid(ctx, o, ox, oy, minDim) {
        const r = o.r * minDim;
        const jagged = o.jagged || 0.2;

        // 主体阴影
        ctx.fillStyle = `hsl(${o.hue}, 15%, 30%)`;
        ctx.beginPath();
        const pts = 10;
        for (let i = 0; i < pts; i++) {
            const a = (i / pts) * Math.PI * 2 + o.rot;
            const pr = r * (0.75 + jagged * Math.sin(o.rot * 1.3 + i * 2.7 + Math.sin(i * 0.8)));
            const px2 = ox + Math.cos(a) * pr;
            const py2 = oy + Math.sin(a) * pr;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath();
        ctx.fill();

        // 高光面
        const lightAngle = -0.7;
        const grad = ctx.createLinearGradient(
            ox - r * 0.6, oy - r * 0.6,
            ox + r * 0.6, oy + r * 0.6
        );
        grad.addColorStop(0, `hsl(${o.hue}, 15%, 55%)`);
        grad.addColorStop(0.5, `hsl(${o.hue}, 12%, 38%)`);
        grad.addColorStop(1, `hsl(${o.hue}, 10%, 22%)`);
        ctx.fillStyle = grad;
        ctx.fill();

        // 陨石坑
        for (let c = 0; c < o.craters; c++) {
            const ca = (c / o.craters) * Math.PI * 2 + o.rot * 0.7;
            const cd = r * (0.25 + c * 0.1);
            const crx = ox + Math.cos(ca) * cd * 0.5;
            const cry = oy + Math.sin(ca) * cd * 0.4;
            const crr = r * (0.08 + Math.sin(c * 2.1) * 0.04);
            // 坑底
            ctx.fillStyle = 'rgba(10, 8, 5, 0.5)';
            ctx.beginPath();
            ctx.arc(crx, cry, crr, 0, Math.PI * 2);
            ctx.fill();
            // 坑边缘高光
            ctx.strokeStyle = 'rgba(180, 160, 130, 0.25)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(crx + crr * 0.2, cry - crr * 0.3, crr, -0.3, Math.PI * 0.7);
            ctx.stroke();
        }

        // 轮廓
        ctx.strokeStyle = 'rgba(200, 180, 160, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    renderComet(ctx, o, ox, oy, minDim) {
        const r = o.r * minDim;
        const tailLen = (o.tailLen || 0.08) * minDim;

        // 彗尾（渐变三角）
        ctx.save();
        const tg = ctx.createLinearGradient(ox - r, oy, ox + tailLen, oy);
        tg.addColorStop(0, `hsla(${o.hue}, 90%, 75%, 0.9)`);
        tg.addColorStop(0.3, `hsla(${o.hue}, 80%, 60%, 0.4)`);
        tg.addColorStop(0.7, `hsla(${o.hue}, 60%, 40%, 0.1)`);
        tg.addColorStop(1, 'transparent');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(ox - r * 0.8, oy - r * 0.4);
        ctx.quadraticCurveTo(ox + tailLen * 0.3, oy - r * 0.1, ox + tailLen, oy - r * 0.05);
        ctx.lineTo(ox + tailLen, oy + r * 0.05);
        ctx.quadraticCurveTo(ox + tailLen * 0.3, oy + r * 0.1, ox - r * 0.8, oy + r * 0.4);
        ctx.closePath();
        ctx.fill();

        // 彗核
        const cg = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 2);
        cg.addColorStop(0, '#fff');
        cg.addColorStop(0.08, `hsl(${o.hue}, 90%, 80%)`);
        cg.addColorStop(0.3, `hsla(${o.hue}, 80%, 50%, 0.6)`);
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(ox, oy, r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    renderGate(ctx, o, ox, w, h) {
        const gateTop = o.yMin * h;
        const gateH = (o.yMax - o.yMin) * h;
        const alpha = 0.25 + 0.2 * Math.sin(this.time * 5);

        // 主体激光
        const gg = ctx.createLinearGradient(ox, gateTop, ox, gateTop + gateH);
        gg.addColorStop(0, `hsla(${o.hue}, 100%, 60%, 0)`);
        gg.addColorStop(0.2, `hsla(${o.hue}, 100%, 55%, ${alpha * 0.6})`);
        gg.addColorStop(0.45, `hsla(${o.hue}, 100%, 85%, ${alpha + 0.25})`);
        gg.addColorStop(0.55, `hsla(${o.hue}, 100%, 85%, ${alpha + 0.25})`);
        gg.addColorStop(0.8, `hsla(${o.hue}, 100%, 55%, ${alpha * 0.6})`);
        gg.addColorStop(1, `hsla(${o.hue}, 100%, 60%, 0)`);
        ctx.fillStyle = gg;
        ctx.fillRect(ox - 5, gateTop, 10, gateH);

        // 发光边缘 — 只在通道边缘（靠近gap的那端）
        const edgeY = o.yMin < 0.1 ? gateTop + gateH : gateTop;
        ctx.strokeStyle = `hsla(${o.hue}, 100%, 90%, ${alpha + 0.3})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `hsl(${o.hue}, 100%, 70%)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(ox - 5, edgeY);
        ctx.lineTo(ox + 5, edgeY);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    renderMine(ctx, o, ox, oy, minDim) {
        const r = o.r * minDim;
        const spikes = o.spikes || 8;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(o.rot);

        // 尖刺
        ctx.fillStyle = '#2a1a2e';
        ctx.strokeStyle = '#5a3a6e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < spikes; i++) {
            const a = (i / spikes) * Math.PI * 2;
            const spikeLen = r * (1.5 + 0.3 * Math.sin(i * 1.7));
            const innerR = r * 0.6;
            const ax1 = Math.cos(a - 0.08) * innerR, ay1 = Math.sin(a - 0.08) * innerR;
            const ax2 = Math.cos(a + 0.08) * innerR, ay2 = Math.sin(a + 0.08) * innerR;
            const tipX = Math.cos(a) * spikeLen, tipY = Math.sin(a) * spikeLen;
            if (i === 0) ctx.moveTo(ax1, ay1);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(ax2, ay2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 中心球体
        const cg = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 0.7);
        cg.addColorStop(0, '#8a3a9e');
        cg.addColorStop(0.5, '#4a1a5e');
        cg.addColorStop(1, '#1a0a1e');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // 危险闪烁点
        const blink = 0.4 + 0.6 * Math.sin(this.time * 6 + o.rot);
        ctx.fillStyle = `rgba(255, 60, 60, ${blink * 0.8})`;
        ctx.shadowColor = '#f00';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    renderCoin(ctx, c, cx, cy, minDim) {
        const pulse = 0.5 + 0.5 * Math.sin(c.bob);
        const sz = 8 + pulse * 4; // 基础大小+呼吸

        ctx.save();
        ctx.translate(cx, cy);

        // 外层光晕
        const halo = ctx.createRadialGradient(0, 0, sz * 0.6, 0, 0, sz * 2.8);
        halo.addColorStop(0, `rgba(255, 215, 0, ${0.6 + pulse * 0.4})`);
        halo.addColorStop(0.4, `rgba(255, 180, 0, ${0.3})`);
        halo.addColorStop(0.7, `rgba(255, 140, 0, ${0.1})`);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // 金币主体 — 3D翻转效果
        const scaleX = Math.abs(Math.cos(c.rot)); // 0=侧面, 1=正面
        const faceAlpha = 0.3 + scaleX * 0.7;

        // 金币厚度（侧面可见时）
        if (scaleX < 0.7) {
            const thickness = sz * 0.35;
            ctx.fillStyle = '#8B6914';
            ctx.beginPath();
            ctx.ellipse(0, 0, sz * scaleX, thickness, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#A8852A';
            ctx.fillRect(-sz * scaleX, -thickness, sz * scaleX * 2, thickness * 0.6);
        }

        // 金币正面
        if (scaleX > 0.15) {
            // 金盘
            const coinGrad = ctx.createRadialGradient(-sz * 0.25, -sz * 0.25, sz * 0.05, 0, 0, sz);
            coinGrad.addColorStop(0, '#FFE87C');
            coinGrad.addColorStop(0.3, '#FFD700');
            coinGrad.addColorStop(0.6, '#E8A800');
            coinGrad.addColorStop(0.85, '#B8860B');
            coinGrad.addColorStop(1, '#8B6914');
            ctx.fillStyle = coinGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, sz, sz * (0.15 + scaleX * 0.85), 0, 0, Math.PI * 2);
            ctx.fill();

            // 外圈边框
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, sz, sz * (0.15 + scaleX * 0.85), 0, 0, Math.PI * 2);
            ctx.stroke();

            // 内圈装饰环
            ctx.strokeStyle = 'rgba(184, 134, 11, 0.5)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.ellipse(0, 0, sz * 0.75, sz * 0.75 * (0.15 + scaleX * 0.85), 0, 0, Math.PI * 2);
            ctx.stroke();

            // 中心符号 "¥" — 仅正面可见
            if (scaleX > 0.4) {
                const symSize = sz * 0.4;
                ctx.fillStyle = '#8B6914';
                ctx.font = `bold ${symSize}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('¥', 0, symSize * 0.08);
            }

            // 顶部高光
            if (scaleX > 0.3) {
                const hlGrad = ctx.createRadialGradient(-sz * 0.3, -sz * 0.35, 0, -sz * 0.3, -sz * 0.35, sz * 0.6);
                hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
                hlGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = hlGrad;
                ctx.beginPath();
                ctx.arc(-sz * 0.3, -sz * 0.35, sz * 0.55, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 闪光点（随机出现）
        if (pulse > 0.85) {
            const sparkAngle = this.time * 8;
            const sparkDist = sz * 1.4;
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 3;
            ctx.beginPath();
            ctx.arc(Math.cos(sparkAngle) * sparkDist, Math.sin(sparkAngle) * sparkDist, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    renderPlayer(ctx, px, py) {
        const w = ctx.canvas ? ctx.canvas.width : (this.engine ? this.engine.canvas.width : 1020);
        const h = ctx.canvas ? ctx.canvas.height : (this.engine ? this.engine.canvas.height : 650);
        const sx = px * w, sy = py * h;
        const sz = 0.06 * Math.min(w, h);

        ctx.save();
        ctx.translate(sx, sy);

        // 引擎火焰
        const flameFlicker = 0.7 + Math.random() * 0.3;
        for (const side of [-1, 1]) {
            const fx = side * sz * 0.35;
            const fw = sz * 0.13;
            const fh = fw * 3.5 * flameFlicker;
            const fg = ctx.createLinearGradient(fx, sz * 0.15, fx, sz * 0.15 + fh);
            fg.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            fg.addColorStop(0.1, 'rgba(100, 220, 255, 0.7)');
            fg.addColorStop(0.4, 'rgba(0, 180, 220, 0.35)');
            fg.addColorStop(1, 'transparent');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(fx - fw, sz * 0.15);
            ctx.quadraticCurveTo(fx + (Math.random() - 0.5) * fw * 0.5, sz * 0.15 + fh * 0.5, fx, sz * 0.15 + fh);
            ctx.quadraticCurveTo(fx + (Math.random() - 0.5) * fw * 0.5, sz * 0.15 + fh * 0.5, fx + fw, sz * 0.15);
            ctx.closePath();
            ctx.fill();
        }

        // 飞船主体
        ctx.shadowColor = '#00ccff';
        ctx.shadowBlur = 14;
        const shipGrad = ctx.createLinearGradient(0, -sz, 0, sz);
        shipGrad.addColorStop(0, '#3a7aba');
        shipGrad.addColorStop(0.5, '#1a4a7a');
        shipGrad.addColorStop(1, '#0a2a4a');
        ctx.fillStyle = shipGrad;
        ctx.strokeStyle = '#00ccff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        // 箭头形飞船
        ctx.moveTo(0, -sz * 0.7);
        ctx.lineTo(-sz * 0.55, sz * 0.15);
        ctx.lineTo(-sz * 0.2, sz * 0.25);
        ctx.lineTo(0, sz * 0.15);
        ctx.lineTo(sz * 0.2, sz * 0.25);
        ctx.lineTo(sz * 0.55, sz * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 机翼装饰线
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.45, sz * 0.05);
        ctx.lineTo(-sz * 0.15, sz * 0.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sz * 0.45, sz * 0.05);
        ctx.lineTo(sz * 0.15, sz * 0.12);
        ctx.stroke();

        // 驾驶舱
        const cg = ctx.createRadialGradient(0, -sz * 0.2, 0, 0, -sz * 0.2, sz * 0.16);
        cg.addColorStop(0, '#ffffff');
        cg.addColorStop(0.2, '#88eeff');
        cg.addColorStop(0.5, '#00bbdd');
        cg.addColorStop(1, '#003344');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(0, -sz * 0.2, sz * 0.11, sz * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();

        // 引擎进气口
        for (const side of [-1, 1]) {
            ctx.fillStyle = '#003344';
            ctx.strokeStyle = '#00aacc';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.ellipse(side * sz * 0.35, sz * 0.1, sz * 0.06, sz * 0.04, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    trySpawnObstacle(obstacleList, diff) { /* 由update直接管理 */ }
    spawnObstacleCfg(diff) { return null; }

    onCoinCollect(coin, engine) {
        this.particles.emitCoinCollect(coin.x, coin.y);
        soundManager.playCoin();
    }

    cleanup() { super.cleanup(); this.particles.clear(); }
}
