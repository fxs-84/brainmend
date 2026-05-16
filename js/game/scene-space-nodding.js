// 太空点头训练 — 单轴俯仰控制，飞船上下移动躲避障碍+吃金币
import { SceneBase } from './scene-base.js';
import { ParticleSystem } from './particle.js';
import { soundManager } from './sound-manager.js';

export class SceneSpaceNodding extends SceneBase {
    constructor() {
        super();
        this.particles = new ParticleSystem();
        this.obstacles = [];
        this.coins = [];
        this.stars = [];
        this.nebulae = [];
        this.shootingStars = [];
        this.spiralGalaxies = [];
        this.distantPlanets = [];
        this.dust = [];
        this.lastSpawn = 0;
        this.coinSpawnTimer = 0;
        this._nextShootingStar = 2 + Math.random() * 3;
        this.init();
    }

    init(engine) {
        super.init(engine);
        this.obstacles = []; this.coins = [];
        this.stars = []; this.nebulae = []; this.shootingStars = [];
        this.spiralGalaxies = []; this.distantPlanets = []; this.dust = [];
        // 漂浮尘埃粒子
        for (let i = 0; i < 60; i++) {
            this.dust.push({
                x: Math.random(), y: Math.random(),
                sz: 0.3 + Math.random() * 1.2,
                sp: 0.02 + Math.random() * 0.08,
                alpha: 0.05 + Math.random() * 0.15,
                hue: 200 + Math.random() * 160,
                tw: Math.random() * Math.PI * 2
            });
        }
        this.lastSpawn = 0; this.coinSpawnTimer = 0;
        this._nextShootingStar = 2 + Math.random() * 3;
        // 分层星星
        for (let i = 0; i < 220; i++) {
            this.stars.push({
                x: Math.random(), y: Math.random(),
                sz: 0.3 + Math.random() * 2.8,
                tw: Math.random() * Math.PI * 2,
                twSpd: 2 + Math.random() * 4,
                sp: 0.05 + Math.random() * 0.6,
                hue: Math.random() * 360,
                layer: Math.floor(Math.random() * 3)
            });
        }
        // 背景大星云（有机形状）
        for (let i = 0; i < 5; i++) {
            this.nebulae.push({
                x: Math.random(), y: Math.random() * 0.9,
                rx: 0.2 + Math.random() * 0.45,
                ry: 0.1 + Math.random() * 0.3,
                hue: [260, 200, 330, 30, 180][i],
                alpha: 0.04 + Math.random() * 0.06,
                drift: (Math.random() - 0.5) * 0.00005
            });
        }
        // 螺旋星系
        for (let i = 0; i < 2; i++) {
            this.spiralGalaxies.push({
                x: 0.1 + i * 0.7 + Math.random() * 0.1,
                y: 0.15 + Math.random() * 0.3,
                r: 0.04 + Math.random() * 0.06,
                rot: Math.random() * Math.PI * 2,
                hue: i === 0 ? 200 : 30,
                alpha: 0.08 + Math.random() * 0.06
            });
        }
        // 远景行星
        for (let i = 0; i < 2; i++) {
            this.distantPlanets.push({
                x: 0.08 + Math.random() * 0.15,
                y: 0.1 + Math.random() * 0.25,
                r: 0.018 + Math.random() * 0.022,
                hue: i === 0 ? 200 : 25,
                ring: i === 0 // 第一个有环
            });
        }
    }

    update(dt) {
        super.update(dt);
        const speed = 0.25;

        for (const o of this.obstacles) {
            o.x -= speed * dt;
            o.anim += dt * 3;
            if (o.type === 'asteroid') o.rot += o.rotSpd * dt;
            else if (o.type === 'comet') o.rot += dt * 1.5;
            else if (o.type === 'mine') o.rot += o.rotSpd * dt;
        }
        this.obstacles = this.obstacles.filter(o => o.x > -0.25);
        for (const c of this.coins) { c.x -= speed * dt; c.bob += dt * 3; }
        this.coins = this.coins.filter(c => c.x > -0.15);
        for (const s of this.stars) { s.x -= s.sp * 0.015 * dt * (s.layer * 0.4 + 0.6); if (s.x < -0.05) s.x = 1.05; s.tw += dt * s.twSpd; }
        for (const n of this.nebulae) { n.x += n.drift * dt * 60; if (n.x < -0.1) n.x = 1.1; }
        for (const g of this.spiralGalaxies) { g.rot += dt * 0.04; }
        // 尘埃粒子
        for (const d of this.dust) {
            d.x -= d.sp * 0.008 * dt;
            d.tw += dt * (1 + d.sp * 3);
            if (d.x < -0.02) { d.x = 1.02; d.y = Math.random(); }
        }
        // 流星（更频繁）
        this._nextShootingStar -= dt;
        if (this._nextShootingStar <= 0) {
            this._nextShootingStar = 1.5 + Math.random() * 3;
            this.shootingStars.push({
                x: 0.9 + Math.random() * 0.2, y: Math.random() * 0.4,
                len: 0.04 + Math.random() * 0.08,
                dur: 0.4 + Math.random() * 0.4,
                age: 0, hue: 40 + Math.random() * 30
            });
        }
        for (const ss of this.shootingStars) { ss.x -= 0.3 * dt; ss.age += dt; }
        this.shootingStars = this.shootingStars.filter(ss => ss.age < ss.dur);
        this.particles.update(dt);

        const diff = 1.0 + Math.min(1.5, this.gameTime / 40);

        if (this.gameTime - this.lastSpawn > 1.8 / diff) {
            this.lastSpawn = this.gameTime;
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
            // 小行星（更大更具体）
            const oy = Math.random() < 0.5
                ? gapCenter - gapSize - Math.random() * 0.18
                : gapCenter + gapSize + Math.random() * 0.18;
            const size = 0.09 + Math.random() * 0.09;
            this.obstacles.push({
                type: 'asteroid', x: 1.12, y: Math.max(0.06, Math.min(0.94, oy)),
                r: size, rot: Math.random() * Math.PI * 2, rotSpd: (Math.random() - 0.5) * 2,
                craters: Math.floor(Math.random() * 6) + 3,
                hue: 20 + Math.random() * 25,
                jagged: 0.12 + Math.random() * 0.2
            });
        } else if (r < 0.55) {
            // 双小行星群
            for (const sign of [-1, 1]) {
                const oy = gapCenter + sign * (gapSize + 0.03 + Math.random() * 0.07);
                if (oy > 0.06 && oy < 0.94) this.obstacles.push({
                    type: 'asteroid', x: 1.12, y: oy, r: 0.06 + Math.random() * 0.06,
                    rot: Math.random() * Math.PI * 2, rotSpd: (Math.random() - 0.5) * 2,
                    craters: Math.floor(Math.random() * 4) + 2,
                    hue: 15 + Math.random() * 30,
                    jagged: 0.1 + Math.random() * 0.2
                });
            }
        } else if (r < 0.75) {
            // 冰球（紫色大圆球，不是流星）
            const oy = Math.random() < 0.5
                ? gapCenter - gapSize - Math.random() * 0.15
                : gapCenter + gapSize + Math.random() * 0.15;
            this.obstacles.push({
                type: 'iceball', x: 1.15, y: Math.max(0.08, Math.min(0.92, oy)),
                r: 0.08 + Math.random() * 0.08,
                rot: Math.random() * Math.PI * 2, rotSpd: (Math.random() - 0.5) * 3,
                hue: 240 + Math.random() * 60
            });
        } else if (r < 0.90) {
            // 能量屏障（更粗）
            const barTop = gapCenter - gapSize - 0.02;
            const barBot = gapCenter + gapSize + 0.02;
            const hue = Math.random() < 0.5 ? 280 : 180;
            if (barTop > 0.05) this.obstacles.push({ type: 'gate', x: 1.08, yMin: 0.02, yMax: barTop, hue });
            if (barBot < 0.95) this.obstacles.push({ type: 'gate', x: 1.08, yMin: barBot, yMax: 0.98, hue });
        } else {
            // 太空水雷（更大更多尖刺）
            const oy = Math.random() < 0.5
                ? gapCenter - gapSize - Math.random() * 0.15
                : gapCenter + gapSize + Math.random() * 0.15;
            this.obstacles.push({
                type: 'mine', x: 1.1, y: Math.max(0.08, Math.min(0.92, oy)),
                r: 0.07 + Math.random() * 0.07, rot: Math.random() * Math.PI * 2,
                rotSpd: (Math.random() - 0.5) * 2,
                spikes: 8 + Math.floor(Math.random() * 6)
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
        // 前1秒无敌期
        if (this.gameTime < 1.0) return false;
        if (px == null || py == null || isNaN(px) || isNaN(py)) return false;

        const w = this.engine ? this.engine.canvas.width : 1020;
        const h = this.engine ? this.engine.canvas.height : 650;
        const minDim = Math.min(w, h);
        const shipR = pr * minDim; // 取消0.6系数
        for (const o of this.obstacles) {
            if (o.x == null) continue;
            if (o.type !== 'gate' && o.y == null) continue;
            if (o.type === 'gate') {
                if (Math.abs(px * w - o.x * w) < 28 && py >= o.yMin && py <= o.yMax) return true;
            } else {
                const ox = o.x * w, oy = o.y * h;
                const dx = px * w - ox, dy = py * h - oy;
                const or = o.r * minDim;
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

        // === 深空背景（垂直渐变 + 动态色调） ===
        const hueShift = 10 * Math.sin(this.gameTime * 0.08);
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, `hsl(${220 + hueShift}, 30%, 3%)`);
        bg.addColorStop(0.15, `hsl(${240 + hueShift}, 25%, 6%)`);
        bg.addColorStop(0.4, `hsl(${260 + hueShift}, 20%, 8%)`);
        bg.addColorStop(0.6, `hsl(${240 + hueShift}, 18%, 6%)`);
        bg.addColorStop(0.8, `hsl(${220 + hueShift}, 22%, 4%)`);
        bg.addColorStop(1, `hsl(${210 + hueShift}, 25%, 2%)`);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // === 螺旋星系（用 getTransform/setTransform 替代 save/restore，不消耗栈） ===
        for (const g of this.spiralGalaxies) {
            const gx = g.x * w, gy = g.y * h, gr = g.r * minDim;
            const _ga = ctx.globalAlpha;
            ctx.globalAlpha = g.alpha;
            const _tx = ctx.getTransform();
            ctx.translate(gx, gy);
            ctx.rotate(g.rot);
            // 旋臂
            for (let arm = 0; arm < 2; arm++) {
                const _txArm = ctx.getTransform();
                ctx.rotate(arm * Math.PI);
                for (let i = 0; i < 60; i++) {
                    const t = i / 60;
                    const spiralR = gr * t * 1.5;
                    const spiralA = t * Math.PI * 2.5;
                    const sx2 = Math.cos(spiralA) * spiralR;
                    const sy2 = Math.sin(spiralA) * spiralR * 0.35;
                    const sa = (1 - t) * 0.6;
                    ctx.fillStyle = `hsla(${g.hue}, 50%, 75%, ${sa})`;
                    ctx.beginPath();
                    ctx.arc(sx2, sy2, Math.max(0.3, (1 - t) * 2.5), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.setTransform(_txArm);
            }
            // 核心
            const gc = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
            gc.addColorStop(0, `hsla(${g.hue + 30}, 60%, 90%, 0.9)`);
            gc.addColorStop(0.3, `hsla(${g.hue}, 50%, 70%, 0.5)`);
            gc.addColorStop(1, 'transparent');
            ctx.fillStyle = gc;
            ctx.beginPath();
            ctx.arc(0, 0, gr, 0, Math.PI * 2);
            ctx.fill();
            ctx.setTransform(_tx);
            ctx.globalAlpha = _ga;
        }

        // === 远景行星 ===
        for (const p of this.distantPlanets) {
            const px = p.x * w, py = p.y * h, pr = p.r * minDim;
            // 星球渐变
            const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr);
            pg.addColorStop(0, `hsl(${p.hue}, 40%, 65%)`);
            pg.addColorStop(0.5, `hsl(${p.hue}, 35%, 40%)`);
            pg.addColorStop(1, `hsl(${p.hue}, 30%, 20%)`);
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
            // 大气光晕
            const ph = ctx.createRadialGradient(px, py, pr * 0.8, px, py, pr * 1.5);
            ph.addColorStop(0, `hsla(${p.hue}, 50%, 60%, 0.15)`);
            ph.addColorStop(1, 'transparent');
            ctx.fillStyle = ph;
            ctx.beginPath();
            ctx.arc(px, py, pr * 1.5, 0, Math.PI * 2);
            ctx.fill();
            // 土星环（手动保存/恢复stroke,lineWidth，不用栈）
            if (p.ring) {
                const _ss = ctx.strokeStyle, _lw = ctx.lineWidth;
                ctx.strokeStyle = `hsla(${p.hue + 20}, 30%, 60%, 0.25)`;
                ctx.lineWidth = pr * 0.15;
                ctx.beginPath();
                ctx.ellipse(px, py, pr * 2.2, pr * 0.5, -0.3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = `hsla(${p.hue - 10}, 25%, 50%, 0.15)`;
                ctx.lineWidth = pr * 0.08;
                ctx.beginPath();
                ctx.ellipse(px, py, pr * 2.6, pr * 0.6, -0.3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = _ss; ctx.lineWidth = _lw;
            }
        }

        // === 星云（多层有机形状 + 呼吸脉冲） ===
        for (const n of this.nebulae) {
            const nx = n.x * w, ny = n.y * h;
            const pulse = 0.85 + 0.15 * Math.sin(this.gameTime * 0.4 + n.x * 5);
            const hueShift = n.hue + 10 * Math.sin(this.gameTime * 0.2 + n.y * 3);
            // 外层大晕
            const outer = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.rx * w * 1.6 * pulse);
            outer.addColorStop(0, `hsla(${hueShift}, 55%, 38%, ${n.alpha * pulse})`);
            outer.addColorStop(0.4, `hsla(${hueShift + 30}, 45%, 28%, ${n.alpha * 0.7})`);
            outer.addColorStop(1, 'transparent');
            ctx.fillStyle = outer;
            ctx.beginPath();
            ctx.ellipse(nx, ny, n.rx * w * 1.6 * pulse, n.ry * h * 1.6 * pulse, 0.2, 0, Math.PI * 2);
            ctx.fill();
            // 中层
            const mid = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.rx * w * 0.8 * pulse);
            mid.addColorStop(0, `hsla(${hueShift + 15}, 60%, 50%, ${n.alpha * 1.5 * pulse})`);
            mid.addColorStop(1, 'transparent');
            ctx.fillStyle = mid;
            ctx.beginPath();
            ctx.ellipse(nx, ny, n.rx * w * 0.8 * pulse, n.ry * h * 0.8 * pulse, 0.2, 0, Math.PI * 2);
            ctx.fill();
            // 内层亮核
            const inner = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.rx * w * 0.4 * pulse);
            inner.addColorStop(0, `hsla(${hueShift + 20}, 70%, 65%, ${n.alpha * 2.5 * pulse})`);
            inner.addColorStop(1, 'transparent');
            ctx.fillStyle = inner;
            ctx.beginPath();
            ctx.ellipse(nx, ny, n.rx * w * 0.4 * pulse, n.ry * h * 0.4 * pulse, 0.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // === 星星（四层视差） ===
        const layerNames = ['far', 'mid', 'near'];
        for (const layer of [0, 1, 2]) {
            const layerStars = this.stars.filter(s => s.layer === layer);
            const sizeMul = [0.45, 0.8, 1.6][layer];
            const baseAlpha = [0.3, 0.4, 0.55][layer];

            for (const s of layerStars) {
                const tw = 0.2 + 0.8 * Math.sin(s.tw);
                const a = baseAlpha + tw * (layer === 0 ? 0.3 : layer === 1 ? 0.5 : 0.45);
                const sx = s.x * w, sy = s.y * h;
                const sz = s.sz * sizeMul;

                if (layer === 0) {
                    // 远景：方形小星（更亮更多）
                    ctx.fillStyle = `hsla(${s.hue}, 15%, 90%, ${a * 0.8})`;
                    ctx.shadowColor = `hsla(${s.hue}, 30%, 80%, 0.5)`;
                    ctx.shadowBlur = sz * 0.8;
                    ctx.fillRect(sx, sy, Math.max(0.5, sz * 0.6), Math.max(0.5, sz * 0.6));
                    ctx.shadowBlur = 0;
                } else if (layer === 1) {
                    // 中景：圆形星 + 明显发光
                    ctx.shadowColor = `hsl(${s.hue}, 50%, 85%)`;
                    ctx.shadowBlur = sz * (1 + tw * 2);
                    ctx.fillStyle = `hsla(${s.hue}, 20%, 88%, ${a})`;
                    ctx.beginPath();
                    ctx.arc(sx, sy, sz * (0.4 + tw * 0.2), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                } else {
                    // 近景：明亮闪烁光球
                    const flash = tw > 0.7 ? tw * 1.4 : tw * 0.8;
                    const coreHue = (s.hue + flash * 60) % 360;
                    ctx.fillStyle = `hsla(${coreHue}, 20%, 100%, ${0.8 + flash * 0.2})`;
                    ctx.shadowColor = `hsl(${coreHue}, 90%, 90%)`;
                    ctx.shadowBlur = sz * (4 + flash * 6);
                    ctx.beginPath();
                    ctx.arc(sx, sy, sz * (0.3 + flash * 0.4), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    // 柔和光晕（手动保存/恢复alpha，不用save/restore以节省栈空间）
                    const _pa = ctx.globalAlpha;
                    ctx.globalAlpha = flash * 0.25;
                    const burst = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 3);
                    burst.addColorStop(0, `hsla(${coreHue}, 60%, 90%, 0.8)`);
                    burst.addColorStop(1, 'transparent');
                    ctx.fillStyle = burst;
                    ctx.beginPath();
                    ctx.arc(sx, sy, sz * 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = _pa;
                }
            }
        }

        // === 流星（快速划过） ===
        for (const ss of this.shootingStars) {
            const prog = ss.age / ss.dur;
            const sx = ss.x * w - prog * 0.5 * w;
            const sy = ss.y * h - prog * 0.25 * h;
            const remain = 1 - prog;
            const _pa2 = ctx.globalAlpha;
            ctx.globalAlpha = remain * 0.9;
            // 流星头
            const mg = ctx.createRadialGradient(sx, sy, 0, sx, sy, ss.len * w * 0.3);
            mg.addColorStop(0, '#fff');
            mg.addColorStop(0.2, `hsl(${ss.hue}, 80%, 90%)`);
            mg.addColorStop(0.6, `hsla(${ss.hue}, 60%, 70%, 0.4)`);
            mg.addColorStop(1, 'transparent');
            ctx.fillStyle = mg;
            ctx.beginPath();
            ctx.arc(sx, sy, ss.len * w * 0.3, 0, Math.PI * 2);
            ctx.fill();
            // 轨迹
            const tg = ctx.createLinearGradient(sx, sy, sx + ss.len * w * 0.5, sy + ss.len * w * 0.25);
            tg.addColorStop(0, `hsla(${ss.hue}, 80%, 90%, ${remain * 0.7})`);
            tg.addColorStop(1, 'transparent');
            ctx.strokeStyle = tg;
            ctx.lineWidth = remain * 2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + ss.len * w * 0.5, sy + ss.len * w * 0.25);
            ctx.stroke();
            ctx.globalAlpha = _pa2;
        }

        // === 漂浮尘埃粒子 ===
        for (const d of this.dust) {
            const dx = d.x * w, dy = d.y * h;
            const tw = 0.3 + 0.7 * Math.sin(d.tw);
            const da = Math.min(1, d.alpha * tw * 2);
            // 光点尘埃（更亮）
            ctx.fillStyle = `hsla(${d.hue}, 50%, 90%, ${da})`;
            ctx.shadowColor = `hsl(${d.hue}, 80%, 80%)`;
            ctx.shadowBlur = d.sz * 1.5;
            ctx.beginPath();
            ctx.arc(dx, dy, d.sz * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // 轨迹（手动保存/恢复alpha，不用栈）
            const _da = ctx.globalAlpha;
            ctx.globalAlpha = da * 0.5;
            ctx.strokeStyle = `hsla(${d.hue}, 60%, 80%, 0.6)`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(dx, dy);
            ctx.lineTo(dx + d.sz * 2, dy + d.sz * 0.4);
            ctx.stroke();
            ctx.globalAlpha = _da;
        }

        // === 宇宙极光 ===
        for (let a = 0; a < 5; a++) {
            const ax = (a / 5) * w;
            const waveY = Math.sin(this.gameTime * 0.3 + a * 1.2) * 20;
            const alpha = 0.012 + 0.008 * Math.sin(this.gameTime * 0.5 + a);
            const hue = 160 + a * 25 + 15 * Math.sin(this.gameTime * 0.2 + a * 2);
            const ag = ctx.createLinearGradient(ax - 30, 0, ax + 30, 0);
            ag.addColorStop(0, 'transparent');
            ag.addColorStop(0.3, `hsla(${hue}, 60%, 60%, ${alpha})`);
            ag.addColorStop(0.5, `hsla(${hue + 20}, 70%, 70%, ${alpha * 1.5})`);
            ag.addColorStop(0.7, `hsla(${hue}, 60%, 60%, ${alpha})`);
            ag.addColorStop(1, 'transparent');
            ctx.fillStyle = ag;
            ctx.fillRect(ax - 30, 0, 60, h * 0.65 + waveY);
        }

        // === 中心淡参考线 ===
        ctx.strokeStyle = 'rgba(0,200,180,0.015)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 40]);
        ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
        ctx.setLineDash([]);

        // === 障碍物 ===
        for (const o of this.obstacles) {
            const ox = o.x * w, oy = o.y * h;
            if (o.type === 'asteroid') this.renderAsteroid(ctx, o, ox, oy, minDim);
            else if (o.type === 'iceball') this.renderIceball(ctx, o, ox, oy, minDim);
            else if (o.type === 'gate') this.renderGate(ctx, o, ox, w, h);
            else if (o.type === 'mine') this.renderMine(ctx, o, ox, oy, minDim);
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
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(o.rot);

        // 阴影层（最暗底层）
        ctx.fillStyle = `hsl(${o.hue}, 12%, 18%)`;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const pr = r * (0.8 + jagged * Math.sin(o.rot * 0.8 + i * 1.9 + Math.sin(i)));
            const px2 = Math.cos(a) * pr, py2 = Math.sin(a) * pr;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath();
        ctx.fill();

        // 主体灰褐石面
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r * 1.1);
        grad.addColorStop(0, `hsl(${o.hue}, 18%, 52%)`);
        grad.addColorStop(0.4, `hsl(${o.hue}, 14%, 38%)`);
        grad.addColorStop(0.7, `hsl(${o.hue}, 12%, 28%)`);
        grad.addColorStop(1, `hsl(${o.hue}, 10%, 20%)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const pr = r * (0.82 + jagged * 0.4 * Math.sin(o.rot * 0.7 + i * 2.1 + Math.sin(i * 0.7)));
            const px2 = Math.cos(a) * pr, py2 = Math.sin(a) * pr;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath();
        ctx.fill();

        // 表面纹理斑块
        for (let t = 0; t < 5; t++) {
            const ta = (t / 5) * Math.PI * 2 + o.rot * 0.5;
            const td = r * (0.2 + t * 0.12);
            const tx = Math.cos(ta) * td, ty = Math.sin(ta) * td;
            const ts = r * (0.06 + Math.sin(t * 1.7) * 0.04);
            const tDark = t % 2 === 0;
            ctx.fillStyle = tDark
                ? `hsla(${o.hue}, 15%, 20%, 0.4)`
                : `hsla(${o.hue + 15}, 12%, 45%, 0.3)`;
            ctx.beginPath();
            ctx.ellipse(tx, ty, ts, ts * 0.7, ta, 0, Math.PI * 2);
            ctx.fill();
        }

        // 陨石坑（更大更深）
        for (let c = 0; c < o.craters; c++) {
            const ca = (c / o.craters) * Math.PI * 2 + o.rot * 0.6;
            const cd = r * (0.2 + c * 0.08);
            const crx = Math.cos(ca) * cd * 0.5;
            const cry = Math.sin(ca) * cd * 0.4;
            const crr = r * (0.08 + Math.sin(c * 2.3) * 0.05);
            // 外圈
            ctx.fillStyle = `hsla(${o.hue}, 10%, 15%, 0.7)`;
            ctx.beginPath();
            ctx.arc(crx, cry, crr * 1.3, 0, Math.PI * 2);
            ctx.fill();
            // 坑底
            ctx.fillStyle = `hsla(${o.hue}, 8%, 10%, 0.8)`;
            ctx.beginPath();
            ctx.arc(crx, cry, crr, 0, Math.PI * 2);
            ctx.fill();
            // 坑内高光
            ctx.fillStyle = `hsla(${o.hue + 5}, 12%, 35%, 0.4)`;
            ctx.beginPath();
            ctx.arc(crx - crr * 0.25, cry - crr * 0.25, crr * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 高光棱线
        ctx.strokeStyle = `hsla(${o.hue + 10}, 20%, 70%, 0.25)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.25, r * 0.3, Math.PI * 1.1, Math.PI * 1.8);
        ctx.stroke();

        // 轮廓
        ctx.strokeStyle = `hsla(${o.hue}, 15%, 35%, 0.3)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const pr = r * (0.82 + jagged * 0.4 * Math.sin(o.rot * 0.7 + i * 2.1 + Math.sin(i * 0.7)));
            const px2 = Math.cos(a) * pr, py2 = Math.sin(a) * pr;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    renderIceball(ctx, o, ox, oy, minDim) {
        const r = o.r * minDim;
        const pulse = 0.5 + 0.5 * Math.sin(this.gameTime * 4 + o.rot);
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(o.rot);

        // 外层紫色大光晕
        ctx.shadowColor = `hsl(${o.hue}, 80%, 65%)`;
        ctx.shadowBlur = 20 + pulse * 10;
        const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
        outerGlow.addColorStop(0, `hsla(${o.hue}, 70%, 75%, 0.8)`);
        outerGlow.addColorStop(0.4, `hsla(${o.hue}, 60%, 55%, 0.4)`);
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
        ctx.fill();

        // 冰球主体（紫蓝渐变）
        const iceGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
        iceGrad.addColorStop(0, `hsl(${o.hue + 20}, 80%, 92%)`);
        iceGrad.addColorStop(0.2, `hsl(${o.hue + 10}, 70%, 80%)`);
        iceGrad.addColorStop(0.5, `hsl(${o.hue}, 60%, 60%)`);
        iceGrad.addColorStop(0.85, `hsl(${o.hue - 10}, 50%, 40%)`);
        iceGrad.addColorStop(1, `hsl(${o.hue - 20}, 45%, 28%)`);
        ctx.fillStyle = iceGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 冰晶裂纹纹理
        ctx.strokeStyle = `hsla(${o.hue + 30}, 60%, 80%, 0.4)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
            ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
            ctx.stroke();
        }

        // 内部冰晶结构
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + o.rot * 0.3;
            const d = r * (0.25 + i * 0.1);
            ctx.strokeStyle = `hsla(${o.hue + 40}, 50%, 85%, ${0.3 + 0.2 * (i % 2)})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * d * 0.5, Math.sin(a) * d * 0.5);
            ctx.lineTo(Math.cos(a + 0.4) * d, Math.sin(a + 0.4) * d);
            ctx.stroke();
        }

        // 高光气泡
        const bubbleR = r * (0.1 + pulse * 0.08);
        ctx.fillStyle = `hsla(${o.hue + 30}, 50%, 95%, 0.7)`;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.32, bubbleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 边缘光圈
        ctx.strokeStyle = `hsla(${o.hue}, 70%, 75%, ${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    renderGate(ctx, o, ox, w, h) {
        const gateTop = o.yMin * h;
        const gateH = (o.yMax - o.yMin) * h;
        const pulse = 0.25 + 0.2 * Math.sin(this.gameTime * 6 + o.hue * 0.1);
        const BAR_W = 20;

        ctx.save();
        // 外层大红光晕
        ctx.shadowColor = `hsl(${o.hue}, 100%, 60%)`;
        ctx.shadowBlur = 20;
        ctx.fillStyle = `hsla(${o.hue}, 100%, 50%, ${pulse * 0.3})`;
        ctx.fillRect(ox - BAR_W / 2 - 8, gateTop, BAR_W + 16, gateH);

        // 主体激光（更粗）
        const gg = ctx.createLinearGradient(ox - BAR_W / 2, 0, ox + BAR_W / 2, 0);
        gg.addColorStop(0, `hsla(${o.hue}, 100%, 60%, 0)`);
        gg.addColorStop(0.15, `hsla(${o.hue}, 100%, 55%, ${pulse})`);
        gg.addColorStop(0.3, `hsla(${o.hue}, 100%, 90%, ${pulse + 0.3})`);
        gg.addColorStop(0.5, `hsl(${o.hue}, 100%, 98%)`);
        gg.addColorStop(0.7, `hsla(${o.hue}, 100%, 90%, ${pulse + 0.3})`);
        gg.addColorStop(0.85, `hsla(${o.hue}, 100%, 55%, ${pulse})`);
        gg.addColorStop(1, `hsla(${o.hue}, 100%, 60%, 0)`);
        ctx.fillStyle = gg;
        ctx.fillRect(ox - BAR_W / 2, gateTop, BAR_W, gateH);

        // 垂直能量线
        ctx.strokeStyle = `hsla(${o.hue}, 100%, 80%, ${pulse * 0.6})`;
        ctx.lineWidth = 0.5;
        for (let xOff = -8; xOff <= 8; xOff += 4) {
            ctx.beginPath();
            ctx.moveTo(ox + xOff, gateTop);
            ctx.lineTo(ox + xOff, gateTop + gateH);
            ctx.stroke();
        }

        // 通道边缘发光的能量球
        const edgeY = o.yMin < 0.1 ? gateTop + gateH : gateTop;
        ctx.shadowColor = `hsl(${o.hue}, 100%, 80%)`;
        ctx.shadowBlur = 15;
        const eg = ctx.createRadialGradient(ox, edgeY, 0, ox, edgeY, 14);
        eg.addColorStop(0, `hsl(${o.hue}, 100%, 95%)`);
        eg.addColorStop(0.4, `hsla(${o.hue}, 100%, 75%, 0.8)`);
        eg.addColorStop(1, 'transparent');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(ox, edgeY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    renderMine(ctx, o, ox, oy, minDim) {
        const r = o.r * minDim;
        const spikes = o.spikes || 10;
        const danger = 0.5 + 0.5 * Math.sin(this.gameTime * 8 + o.rot);

        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(o.rot);

        // 外层大红光晕
        ctx.shadowColor = `hsl(0, 90%, 55%)`;
        ctx.shadowBlur = 15 * danger;
        ctx.fillStyle = `hsla(0, 80%, 45%, ${0.15 + danger * 0.15})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
        ctx.fill();

        // 金属质感底座
        ctx.shadowBlur = 0;
        const baseGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.25, 0, 0, 0, r * 0.75);
        baseGrad.addColorStop(0, '#6a4a8a');
        baseGrad.addColorStop(0.5, '#3a1a5a');
        baseGrad.addColorStop(1, '#1a0a2a');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // 尖刺（金属感）
        for (let i = 0; i < spikes; i++) {
            const a = (i / spikes) * Math.PI * 2;
            const spikeLen = r * (1.4 + 0.4 * Math.sin(i * 2.3));
            const innerR = r * 0.65;
            ctx.save();
            ctx.rotate(a);
            // 尖刺本体
            const sg = ctx.createLinearGradient(0, 0, 0, -spikeLen);
            sg.addColorStop(0, '#5a3a7a');
            sg.addColorStop(0.6, '#8a5aaa');
            sg.addColorStop(1, `hsl(${Math.floor(350 + danger * 15)}, 85%, ${Math.floor(50 + danger * 25)}%)`);
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.moveTo(-r * 0.12, 0);
            ctx.lineTo(0, -spikeLen);
            ctx.lineTo(r * 0.12, 0);
            ctx.closePath();
            ctx.fill();
            // 尖刺发光尖端
            ctx.fillStyle = `rgba(255, ${80 + Math.floor(danger * 120)}, 50, ${0.6 + danger * 0.4})`;
            ctx.shadowColor = `hsl(20, 100%, 60%)`;
            ctx.shadowBlur = 4 + danger * 6;
            ctx.beginPath();
            ctx.arc(0, -spikeLen, r * 0.08, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // 中心危险红点
        ctx.shadowColor = `hsl(0, 100%, 55%)`;
        ctx.shadowBlur = 10 + danger * 15;
        const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.25);
        dg.addColorStop(0, `rgba(255, 255, 200, ${0.8 + danger * 0.2})`);
        dg.addColorStop(0.3, `rgba(255, ${100 + Math.floor(danger * 80)}, 0, 0.9)`);
        dg.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 中心金属螺丝/细节
        ctx.strokeStyle = '#3a1a5a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    renderCoin(ctx, c, cx, cy, minDim) {
        const pulse = 0.5 + 0.5 * Math.sin(c.bob);
        const sz = 12 + pulse * 5; // 稍大一些

        ctx.save();
        ctx.translate(cx, cy);

        // 外层金色光晕
        const halo = ctx.createRadialGradient(0, 0, sz * 0.4, 0, 0, sz * 3.5);
        halo.addColorStop(0, `rgba(255, 230, 80, ${0.6 + pulse * 0.4})`);
        halo.addColorStop(0.35, `rgba(255, 200, 50, ${0.35 + pulse * 0.2})`);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 厚厚外圈（立体边缘）
        ctx.shadowColor = 'rgba(200, 140, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#B8860B';
        ctx.beginPath();
        ctx.arc(0, 0, sz + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 金币主体（立体金属渐变）
        const coinGrad = ctx.createRadialGradient(-sz * 0.35, -sz * 0.4, sz * 0.05, 0, 0, sz);
        coinGrad.addColorStop(0, '#FFFAD0');
        coinGrad.addColorStop(0.15, '#FFE040');
        coinGrad.addColorStop(0.4, '#FFD000');
        coinGrad.addColorStop(0.7, '#D4A000');
        coinGrad.addColorStop(1, '#8B6000');
        ctx.fillStyle = coinGrad;
        ctx.beginPath();
        ctx.arc(0, 0, sz, 0, Math.PI * 2);
        ctx.fill();

        // 装饰滚花纹（点状边缘）
        ctx.strokeStyle = '#8B6000';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, sz - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 内圈装饰线
        ctx.strokeStyle = '#C8960C';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 0.78, 0, Math.PI * 2);
        ctx.stroke();

        // 五角星浮雕（比 ¥ 更好看）
        const starR = sz * 0.42;
        ctx.fillStyle = '#7A5000';
        ctx.strokeStyle = '#5A3800';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const rr = i % 2 === 0 ? starR : starR * 0.45;
            const px2 = Math.cos(a) * rr, py2 = Math.sin(a) * rr;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 星星高光
        ctx.fillStyle = 'rgba(255, 240, 150, 0.5)';
        ctx.beginPath();
        const shR = starR * 0.4;
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const rr = i % 2 === 0 ? shR * 0.5 : shR;
            const px2 = Math.cos(a) * rr - sz * 0.05, py2 = Math.sin(a) * rr - sz * 0.08;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath();
        ctx.fill();

        // 左上角新月形高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.ellipse(-sz * 0.32, -sz * 0.38, sz * 0.22, sz * 0.12, -0.5, 0, Math.PI * 2);
        ctx.fill();

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
