// SceneSpace3D - 沉浸式3D太空飞行场景
// 科幻感深空，物体从远方飞向玩家
import { SceneBase } from './scene-base.js';

const MAX_Z = 50;
const SPAWN_Z = 45;

export class SceneSpace3D extends SceneBase {
    constructor() {
        super();
        this.time = 0;
        this.speedMul = 1.0;
        this.planeState = { pitch: 0, roll: 0, tp: 0, tr: 0 };
        this.config = { smooth: 0.10 };
        this.stars = [];
        this.asteroids = [];
        this.crystals = [];
        this.gates = [];
        this.nebulas = [];
        this.warpStreaks = [];
        this.difficulty = 0;
        this.scrollOffset = 0;
        this.enemies = [];
        this.bullets = [];
        this.init();
    }

    init(engine) {
        super.init(engine);
        this.time = 0;
        this.speedMul = 1.0;
        this.difficulty = 0;
        this.planeState = { pitch: 0, roll: 0, tp: 0, tr: 0 };
        this.scrollOffset = 0;
        this.asteroids = [];
        this.crystals = [];
        this.gates = [];
        this.walls = [];
        this._buildStars();
        this._buildNebulas();
        this._buildWarpStreaks();
        this._buildWalls();
        this._buildAsteroids();
        this._buildCrystals();
        this._buildGates();
    }

    // ===== 3D投影 =====
    _proj(z, w, h) {
        const zClamped = Math.max(0.5, Math.min(MAX_Z - 0.5, z));
        const progress = (MAX_Z - zClamped) / (MAX_Z - 5);
        const scale = 0.15 + Math.max(0, progress) * 4;
        return {
            t: Math.max(0, Math.min(1, progress)),
            scale: scale,
            centerX: w / 2,
            centerY: h / 2
        };
    }

    // ===== 3D星场 =====
    _buildStars() {
        this.stars = [];
        // 分布在球壳上，从中心向外辐射
        for (let i = 0; i < 600; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            this.stars.push({
                dx: Math.sin(phi) * Math.cos(theta),
                dy: Math.sin(phi) * Math.sin(theta),
                z: 3 + Math.random() * 42,
                size: 0.4 + Math.random() * 3.0,
                bright: 0.3 + Math.random() * 0.7,
                hue: Math.random() * 40 + 200 + Math.random() * 60
            });
        }
    }

    // ===== 星云层（真正的3D椭圆云团，迎面飞来）=====
    _buildNebulas() {
        this.nebulas = [];
        const colors = [
            { h: 0, s: 80, l: 30 },      // 红橙
            { h: 160, s: 80, l: 25 },    // 蓝绿
            { h: 280, s: 90, l: 28 },    // 紫色
            { h: 30, s: 90, l: 28 },     // 橙黄
            { h: 200, s: 70, l: 22 },    // 青蓝
            { h: 340, s: 75, l: 25 },    // 粉红
        ];
        for (let i = 0; i < 20; i++) {
            this.nebulas.push({
                x: Math.random(),
                y: Math.random(),
                z: 5 + Math.random() * 40,
                rx: 0.08 + Math.random() * 0.15,
                ry: 0.04 + Math.random() * 0.08,
                h: colors[i % colors.length].h,
                s: colors[i % colors.length].s,
                l: colors[i % colors.length].l,
                spd: 0.5 + Math.random() * 0.5
            });
        }
    }

    // ===== 扭曲光效线（迎面爆发飞向玩家）=====
    _buildWarpStreaks() {
        this.warpStreaks = [];
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 0.2 + Math.random() * 0.6;
            this.warpStreaks.push({
                angle,
                dist,
                z: 3 + Math.random() * 42,
                len: 0.03 + Math.random() * 0.10,
                spd: 2.5 + Math.random() * 3.5,
                bright: 0.4 + Math.random() * 0.6,
                hue: Math.random() * 60 + 180
            });
        }
    }
    // ===== 能量壁垒（需滚转通过）=====
    _buildWalls() {
        this.walls = [];
        for (let i = 0; i < 5; i++) {
            this.walls.push({
                x: 0.5, y: 0.5,
                z: 12 + i * 8,
                gapAngle: (Math.random() - 0.5) * 60,
                gapW: 0.12
            });
        }
    }

    _buildAsteroids() {
        this.asteroids = [];
        for (let i = 0; i < 5; i++) {
            const craters = [];
            const craterCount = 2 + Math.floor(Math.random() * 3);
            for (let c = 0; c < craterCount; c++) {
                craters.push({
                    cx: (Math.random() - 0.5) * 0.9,
                    cy: (Math.random() - 0.5) * 0.9,
                    cr: 0.12 + Math.random() * 0.18
                });
            }
            this.asteroids.push({
                x: 0.1 + Math.random() * 0.8,
                y: 0.2 + Math.random() * 0.6,
                z: 8 + i * 3.5,
                r: 0.035 + Math.random() * 0.04,
                rot: Math.random() * Math.PI * 2,
                rotSpd: (Math.random() - 0.5) * 0.8,
                cr: 100 + Math.floor(Math.random() * 60),
                cg: 90 + Math.floor(Math.random() * 40),
                cb: 70 + Math.floor(Math.random() * 30),
                craters
            });
        }
    }

    // ===== 水晶 =====
    _buildCrystals() {
        this.crystals = [];
        for (let i = 0; i < 10; i++) {
            this.crystals.push({
                x: 0.15 + Math.random() * 0.7,
                y: 0.25 + Math.random() * 0.5,
                z: 10 + i * 4,
                ph: Math.random() * Math.PI * 2,
                size: 0.03
            });
        }
    }

    // ===== 传送门 =====
    _buildGates() {
        this.gates = [];
        for (let i = 0; i < 7; i++) {
            this.gates.push({
                x: 0.2 + Math.random() * 0.6,
                y: 0.5,
                z: 15 + i * 4.5,
                r: 0.06,
                gl: 0,
                ph: Math.random() * Math.PI * 2
            });
        }
    }

    updateSpeedMultiplier(m) { this.speedMul = m; }
    updateDifficulty(n) { this.difficulty = Math.min(1, Math.max(0, n)); }
    setPlaneTarget(p, r) {
        this.planeState.tp = Math.max(-30, Math.min(30, p));
        this.planeState.tr = Math.max(-40, Math.min(40, r));
    }
    setPlanePosition(x, y) { this.planeX = x; this.planeY = y; }

    // ===== 更新 =====
    update(dt) {
        super.update(dt);
        this.time += dt;
        const s = this.speedMul * dt;

        this.scrollOffset += s * 0.3;

        // 星空（3D星场，从中心辐射，高速飞来）
        for (const st of this.stars) {
            st.z -= (12 + Math.abs(st.dx) * 22) * s;
            if (st.z < 0.5) {
                st.z = MAX_Z + Math.random() * 5;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                st.dx = Math.sin(phi) * Math.cos(theta);
                st.dy = Math.sin(phi) * Math.sin(theta);
            }
        }

        // 星云（迎面飞来）
        for (const n of this.nebulas) {
            n.z -= n.spd * s;
            if (n.z < -1) {
                n.z = MAX_Z + Math.random() * 5;
                n.x = Math.random();
                n.y = Math.random();
            }
        }

        // 扭曲光效线（极速飞向玩家）
        for (const w of this.warpStreaks) {
            w.z -= w.spd * s;
            if (w.z < -1) {
                w.z = MAX_Z + Math.random() * 5;
                w.angle = Math.random() * Math.PI * 2;
                w.dist = 0.3 + Math.random() * 0.5;
                w.hue = Math.random() * 60 + 180;
            }
        }

        // 小行星
        for (const a of this.asteroids) {
            a.z -= s;
            a.rot += a.rotSpd * dt;
            if (a.z < -1) {
                a.z = SPAWN_Z + Math.random() * 5;
                a.x = 0.1 + Math.random() * 0.8;
                a.y = 0.2 + Math.random() * 0.6;
            }
        }

        // 水晶
        for (const c of this.crystals) {
            c.z -= s;
            c.ph += dt * 2.5;
            if (c.z < 0.5) {
                c.z = SPAWN_Z + Math.random() * 5;
                c.x = 0.15 + Math.random() * 0.7;
                c.y = 0.25 + Math.random() * 0.5;
                c.ok = false;
            }
        }

        // 传送门
        for (const g of this.gates) {
            g.z -= s;
            g.ph += dt * 1.5;
            if (g.z < 0.5) {
                g.z = SPAWN_Z + Math.random() * 5;
                g.x = 0.2 + Math.random() * 0.6;
                g.gl = 0; // 重生后重置
            }
        }

        
        // 飞机姿态
        const ps = this.config.smooth;
        this.planeState.pitch += (this.planeState.tp - this.planeState.pitch) * ps;
        this.planeState.roll += (this.planeState.tr - this.planeState.roll) * ps;
    }

    // ===== 碰撞检测 =====
    checkObstacleCollision(px, py, pr, w, h) {
        const minD = Math.min(w, h);
        for (const a of this.asteroids) {
            if (a.z < 0.2 || a.z > SPAWN_Z) continue;
            const proj = this._proj(a.z, w, h);
            if (proj.t < 0.02) continue;
            const ax = proj.centerX + (a.x - 0.5) * w * proj.scale;
            const ay = proj.centerY + (a.y - 0.5) * h * proj.scale * 0.7;
            const aR = a.r * minD * proj.scale;
            const dx = px * w - ax;
            const dy = py * h - ay;
            if (dx*dx + dy*dy < (pr * minD + aR) * (pr * minD + aR)) return true;
        }
        return false;
    }

    checkGatePassage(px, py, w, h) {
        const out = [];
        const minD = Math.min(w, h);
        for (const g of this.gates) {
            if (g.collected || g.z < 0.5 || g.z > SPAWN_Z) continue;
            const proj = this._proj(g.z, w, h);
            if (proj.t < 0.08) continue;
            const gx = proj.centerX + (g.x - 0.5) * w * proj.scale;
            const gy = proj.centerY + (g.y - 0.5) * h * proj.scale * 0.5;
            const gr = g.r * minD * proj.scale;
            const dx = px * w - gx;
            const dy = py * h - gy;
            if (dx*dx + dy*dy < gr * gr) {
                g.collected = true;
                out.push(g);
            }
        }
        return out;
    }

    checkStarCollect(px, py, w, h) {
        const out = [];
        const minD = Math.min(w, h);
        for (const c of this.crystals) {
            if (c.ok || c.z < 0.5 || c.z > SPAWN_Z) continue;
            const proj = this._proj(c.z, w, h);
            if (proj.t < 0.08) continue;
            const cx = proj.centerX + (c.x - 0.5) * w * proj.scale;
            const cy = proj.centerY + (c.y - 0.5) * h * proj.scale * 0.5;
            const cr = c.size * minD * proj.scale;
            if (Math.abs(px * w - cx) < cr * 1.8 && Math.abs(py * h - cy) < cr * 1.8) {
                c.ok = true;
                out.push(c);
            }
        }
        return out;
    }

    checkOrbCollect() { return []; }

    // ===== 渲染 =====
    renderBackground(ctx, w, h) {
        const minD = Math.min(w, h);

        // 深空背景 - 深紫到深蓝科幻渐变
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, 'hsl(280, 70%, 6%)');
        sky.addColorStop(0.3, 'hsl(260, 60%, 4%)');
        sky.addColorStop(0.6, 'hsl(240, 50%, 7%)');
        sky.addColorStop(1, 'hsl(220, 40%, 10%)');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // 扭曲光效线（ hyperspace 飞向玩家）
        const sortedStreaks = [...this.warpStreaks].sort((a, b) => a.z - b.z);
        for (const ws of sortedStreaks) {
            if (ws.z < 0.3 || ws.z > MAX_Z) continue;
            const proj = this._proj(ws.z, w, h);
            if (proj.t < 0.01) continue;

            // 从屏幕中心向外的线条，近处长远处短
            const cx = ws.dist * Math.cos(ws.angle);
            const cy = ws.dist * Math.sin(ws.angle) * 0.7;
            const nx = proj.centerX + cx * w * proj.scale * 0.3;
            const ny = proj.centerY + cy * h * proj.scale * 0.3;

            // 线条长度随距离变化，高速拉长
            const lineLen = ws.len * w * proj.scale * 2.5;
            const startX = nx - Math.cos(ws.angle) * lineLen * 0.3;
            const startY = ny - Math.sin(ws.angle) * lineLen * 0.3;
            const endX = nx + Math.cos(ws.angle) * lineLen;
            const endY = ny + Math.sin(ws.angle) * lineLen;

            const alpha = ws.bright * (0.3 + proj.t * 0.7);
            const grad = ctx.createLinearGradient(startX, startY, endX, endY);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.3, `hsla(${ws.hue}, 80%, ${60 + proj.t * 40}%, ${alpha * 0.40})`);
            grad.addColorStop(0.7, `hsla(${ws.hue}, 90%, ${75 + proj.t * 25}%, ${alpha})`);
            grad.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 0.5 + proj.t * 3;
            ctx.stroke();
        }

        // 星云层（迎面飞来，真正的3D椭圆云团）
        const sortedNebs = [...this.nebulas].sort((a, b) => b.z - a.z);
        for (const n of sortedNebs) {
            if (n.z < 0.3 || n.z > MAX_Z) continue;
            const proj = this._proj(n.z, w, h);
            if (proj.t < 0.01) continue;

            const nx = proj.centerX + (n.x - 0.5) * w * proj.scale;
            const ny = proj.centerY + (n.y - 0.5) * h * proj.scale * 0.6;
            const rx = n.rx * w * proj.scale;
            const ry = n.ry * h * proj.scale;

            const alpha = 0.12 + proj.t * 0.28;
            ctx.save();
            ctx.translate(nx, ny);
            ctx.scale(1, ry / rx);
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
            grad.addColorStop(0, `hsla(${n.h}, ${n.s}%, ${n.l + 15}%, ${alpha})`);
            grad.addColorStop(0.4, `hsla(${n.h}, ${n.s}%, ${n.l}%, ${alpha * 0.6})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 星空 - 3D星场，从中心辐射
        const sortedStars = [...this.stars].sort((a, b) => b.z - a.z);
        for (const st of sortedStars) {
            const proj = this._proj(st.z, w, h);
            if (proj.t < 0.01) continue;

            // 3D投影：离中心越远，距离近了从中心辐射越远
            const sx = proj.centerX + st.dx * w * 0.5 * proj.scale;
            const sy = proj.centerY + st.dy * h * 0.5 * proj.scale;
            const sr = st.size * (0.3 + proj.t * 1.2);

            // 越远越暗越小
            const alpha = st.bright * (0.15 + proj.t * 0.85);
            if (alpha < 0.05) continue;

            // 拉长成高速速度线
            const streakLen = sr * proj.t * 6;
            const angle = Math.atan2(st.dy, st.dx);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(angle);
            ctx.shadowColor = `hsla(${st.hue}, 40%, 85%, ${alpha})`;
            ctx.shadowBlur = sr * 0.5;

            // 速度线 - 尾迹渐隐
            const trailGrad = ctx.createLinearGradient(-streakLen, 0, sr, 0);
            trailGrad.addColorStop(0, 'transparent');
            trailGrad.addColorStop(0.6, `hsla(${st.hue}, 30%, 90%, ${alpha * 0.6})`);
            trailGrad.addColorStop(1, `hsla(${st.hue}, 20%, 95%, ${alpha})`);
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = 0.5 + sr * 0.4;
            ctx.beginPath();
            ctx.moveTo(-streakLen, 0);
            ctx.lineTo(sr, 0);
            ctx.stroke();

            // 头部亮点
            ctx.beginPath();
            ctx.arc(sr, 0, sr * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${st.hue}, 20%, 95%, ${alpha})`;
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // 远景行星 - 右上大红行星
        const pX = w * 0.88;
        const pY = h * 0.12;
        const pR = minD * 0.055;
        const pGrad = ctx.createRadialGradient(pX - pR * 0.3, pY - pR * 0.3, 0, pX, pY, pR);
        pGrad.addColorStop(0, 'hsl(15, 85%, 55%)');
        pGrad.addColorStop(0.5, 'hsl(10, 75%, 40%)');
        pGrad.addColorStop(1, 'hsl(5, 60%, 25%)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(pX, pY, pR, 0, Math.PI * 2);
        ctx.fill();

        // 小行星
        const sortedAst = [...this.asteroids].sort((a, b) => a.z - b.z);
        for (const a of sortedAst) {
            this._renderAsteroid(ctx, w, h, a);
        }

        // 水晶
        const sortedCry = [...this.crystals].sort((a, b) => b.z - a.z);
        for (const c of sortedCry) {
            if (!c.ok) this._renderCrystal(ctx, w, h, c);
        }

        // 传送门
        const sortedGates = [...this.gates].sort((a, b) => b.z - a.z);
        for (const g of sortedGates) {
            if (!g.collected) this._renderGate(ctx, w, h, g);
        }

        // 敌舰
        for (const en of this.enemies || []) {
            this._renderEnemy(ctx, w, h, en);
        }

        // 子弹
        for (const bl of this.bullets || []) {
            this._renderBullet(ctx, w, h, bl);
        }

            }

    _renderAsteroid(ctx, w, h, a) {
        if (a.z < 0.3 || a.z > SPAWN_Z) return;
        const proj = this._proj(a.z, w, h);
        if (proj.t < 0.02) return;
        const minD = Math.min(w, h);

        const ax = proj.centerX + (a.x - 0.5) * w * proj.scale;
        const ay = proj.centerY + (a.y - 0.5) * h * proj.scale * 0.7;
        const ar = a.r * minD * proj.scale;

        if (ax + ar < -20 || ax - ar > w + 20) return;

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a.rot);

        // 主体
        ctx.beginPath();
        ctx.arc(0, 0, ar, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(-ar * 0.3, -ar * 0.3, 0, 0, 0, ar);
        grad.addColorStop(0, `rgb(${a.cr + 40}, ${a.cg + 30}, ${a.cb + 20})`);
        grad.addColorStop(0.6, `rgb(${a.cr}, ${a.cg}, ${a.cb})`);
        grad.addColorStop(1, `rgb(${a.cr * 0.5}, ${a.cg * 0.5}, ${a.cb * 0.5})`);
        ctx.fillStyle = grad;
        ctx.fill();

        // 陨石坑（使用固定的陨石坑位置）
        for (const crater of a.craters) {
            const cx = crater.cx * ar;
            const cy = crater.cy * ar;
            const cr = crater.cr * ar;

            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 0, 0, 0.35)`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx - cr * 0.25, cy - cr * 0.25, cr * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, 0.08)`;
            ctx.fill();
        }

        ctx.restore();
    }

    _renderCrystal(ctx, w, h, c) {
        if (c.z < 0.5 || c.z > SPAWN_Z) return;
        const proj = this._proj(c.z, w, h);
        if (proj.t < 0.06) return;

        const cx = proj.centerX + (c.x - 0.5) * w * proj.scale;
        const cy = proj.centerY + (c.y - 0.5) * h * proj.scale * 0.5;
        const cr = c.size * Math.min(w, h) * proj.scale;
        const pulse = 0.6 + 0.4 * Math.sin(c.ph);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = `hsla(180, 80%, 60%, ${pulse})`;
        ctx.shadowBlur = 8 + pulse * 8;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const r = cr * (i % 2 === 0 ? 1 : 0.55);
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();

        const grad = ctx.createLinearGradient(-cr, -cr, cr, cr);
        grad.addColorStop(0, `hsla(180, 70%, 80%, ${pulse})`);
        grad.addColorStop(0.5, `hsla(200, 60%, 55%, ${pulse * 0.8})`);
        grad.addColorStop(1, `hsla(240, 50%, 40%, ${pulse * 0.6})`);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    _renderGate(ctx, w, h, g) {
        if (g.collected || g.z < 0.5 || g.z > SPAWN_Z) return;
        const proj = this._proj(g.z, w, h);
        if (proj.t < 0.06) return;

        const gx = proj.centerX + (g.x - 0.5) * w * proj.scale;
        const gy = proj.centerY + (g.y - 0.5) * h * proj.scale * 0.5;
        const gr = g.r * Math.min(w, h) * proj.scale;
        const pulse = 0.6 + 0.4 * Math.sin(g.ph);

        ctx.save();
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 10 + pulse * 10;
        ctx.strokeStyle = `hsla(170, 80%, 55%, ${0.5 + pulse * 0.4})`;
        ctx.lineWidth = 2 + pulse;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `hsla(180, 70%, 70%, ${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(gx, gy, gr * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    _renderEnemy(ctx, w, h, en) {
        const ex = en.x * w;
        const ey = en.y * h;
        const er = en.size * Math.min(w, h);

        ctx.save();
        ctx.translate(ex, ey);

        // 敌舰朝下（飞向玩家）
        ctx.rotate(Math.PI);

        // 左翼
        ctx.fillStyle = '#4a1015';
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -er * 0.9);
        ctx.lineTo(-er * 0.55, er * 0.3);
        ctx.lineTo(-er * 0.2, er * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 右翼
        ctx.fillStyle = '#5a1518';
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -er * 0.9);
        ctx.lineTo(er * 0.55, er * 0.3);
        ctx.lineTo(er * 0.2, er * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 机身
        const bodyGrad = ctx.createLinearGradient(0, -er, 0, er * 0.4);
        bodyGrad.addColorStop(0, '#991111');
        bodyGrad.addColorStop(0.5, '#660000');
        bodyGrad.addColorStop(1, '#330000');
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -er * 0.9);
        ctx.lineTo(-er * 0.15, er * 0.3);
        ctx.lineTo(er * 0.15, er * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 引擎红焰
        ctx.fillStyle = `rgba(255, 100, 30, ${0.5 + Math.random() * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, er * 0.35, er * 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _renderBullet(ctx, w, h, bl) {
        bl.render(ctx);
    }

    _renderWall(ctx, w, h, wall) {
        if (wall.z < 0.3 || wall.z > SPAWN_Z) return;
        const proj = this._proj(wall.z, w, h);
        if (proj.t < 0.03) return;
        const minD = Math.min(w, h);

        const wx = proj.centerX + (wall.x - 0.5) * w * proj.scale;
        const wy = proj.centerY + (wall.y - 0.5) * h * proj.scale * 0.5;
        const halfW = 0.35 * minD * proj.scale;
        const gapW = halfW * 0.6;
        const gapA = wall.gapAngle;

        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(gapA * Math.PI / 180);

        // 屏障主体 - 两条粗线，中间缺口
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 6 + proj.t * 4;
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 20;

        ctx.beginPath();
        ctx.moveTo(-halfW, 0);
        ctx.lineTo(-gapW, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(gapW, 0);
        ctx.lineTo(halfW, 0);
        ctx.stroke();

        // 缺口标记 - 绿色引导
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2 + proj.t * 2;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(-gapW, 0);
        ctx.lineTo(gapW, 0);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    checkWallCollision(px, py, pr, roll, w, h) {
        for (const wall of this.walls) {
            if (wall.z < 0.5 || wall.z > SPAWN_Z) continue;
            const proj = this._proj(wall.z, w, h);
            if (proj.t < 0.1) continue; // 只检查足够近的壁垒

            const minD = Math.min(w, h);
            const wx = proj.centerX + (wall.x - 0.5) * w * proj.scale;
            const wy = proj.centerY + (wall.y - 0.5) * h * proj.scale * 0.5;
            const halfW = 0.35 * minD * proj.scale;
            const gapWScreen = halfW * 0.6;

            // 玩家在墙壁的y范围（墙壁水平，检查垂直距离）
            const dx = px * w - wx;
            const dy = py * h - wy;
            const rotAng = wall.gapAngle * Math.PI / 180;

            // 旋转到墙壁的坐标系
            const localX = dx * Math.cos(-rotAng) - dy * Math.sin(-rotAng);
            const localY = dx * Math.sin(-rotAng) + dy * Math.cos(-rotAng);

            // 靠近墙壁线上的垂直范围
            if (Math.abs(localY) < pr * minD * 2) {
                // 玩家在墙壁线上，检查是否在缺口内
                if (Math.abs(localX) < gapWScreen) {
                    // 在缺口内 — 检查roll是否匹配
                    const rollDiff = Math.abs(roll - wall.gapAngle);
                    if (rollDiff > 20) {
                        return true; // roll不匹配，碰撞
                    }
                    // roll匹配 → 安全通过
                } else if (Math.abs(localX) < halfW) {
                    return true; // 撞到壁垒实体部分
                }
            }
        }
        return false;
    }

    renderPlayer(ctx, px, py, roll) {
        const sx = px * ctx.canvas.width;
        const sy = py * ctx.canvas.height;
        const S = 0.16 * Math.min(ctx.canvas.width, ctx.canvas.height);
        const tilt = this.planeState.roll;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(tilt * Math.PI / 180);

        // ===== ENGINE FLAMES =====
        for (const s of [-1, 1]) {
            const ex = s * S * 0.28;
            const ey = S * 0.55;
            const ew = S * 0.08;
            const eh = S * 0.4 * (0.8 + Math.random() * 0.4);

            const g = ctx.createLinearGradient(ex, ey, ex, ey + eh);
            g.addColorStop(0, 'rgba(140, 220, 255, 0.9)');
            g.addColorStop(0.3, 'rgba(60, 160, 255, 0.65)');
            g.addColorStop(0.7, 'rgba(20, 80, 255, 0.35)');
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(ex - ew, ey);
            ctx.quadraticCurveTo(ex, ey + eh * 0.45, ex, ey + eh);
            ctx.quadraticCurveTo(ex, ey + eh * 0.45, ex + ew, ey);
            ctx.closePath();
            ctx.fill();

            const gc = ctx.createLinearGradient(ex, ey, ex, ey + eh * 0.35);
            gc.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gc.addColorStop(1, 'transparent');
            ctx.fillStyle = gc;
            ctx.beginPath();
            ctx.moveTo(ex - ew * 0.2, ey);
            ctx.quadraticCurveTo(ex, ey + eh * 0.1, ex, ey + eh * 0.35);
            ctx.quadraticCurveTo(ex, ey + eh * 0.1, ex + ew * 0.2, ey);
            ctx.closePath();
            ctx.fill();
        }

        // ===== WINGS (经典后掠翼) =====
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.fillStyle = '#1a3555';
            ctx.strokeStyle = '#0088cc';
            ctx.lineWidth = 1;

            // 主翼面
            ctx.beginPath();
            ctx.moveTo(s * S * 0.12, S * 0.05);
            ctx.lineTo(s * S * 0.95, S * 0.18);
            ctx.lineTo(s * S * 0.93, S * 0.40);
            ctx.lineTo(s * S * 0.25, S * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 翼前缘
            ctx.strokeStyle = '#00ccee';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s * S * 0.12, S * 0.05);
            ctx.lineTo(s * S * 0.95, S * 0.18);
            ctx.stroke();
            ctx.restore();
        }

        // ===== ENGINE NACELLES =====
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.shadowColor = '#0088ff';
            ctx.shadowBlur = 6;
            const eg = ctx.createLinearGradient(s * S * 0.26, S * 0.1, s * S * 0.26, S * 0.5);
            eg.addColorStop(0, '#3a6585');
            eg.addColorStop(0.5, '#1a3a55');
            eg.addColorStop(1, '#254458');
            ctx.fillStyle = eg;
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(s * S * 0.26, S * 0.30, S * 0.08, S * 0.20, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#0a1a2a';
            ctx.beginPath();
            ctx.ellipse(s * S * 0.26, S * 0.44, S * 0.055, S * 0.09, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // ===== FUSELAGE (流线体) =====
        ctx.save();
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 14;

        // 左侧
        ctx.fillStyle = '#0f2840';
        ctx.strokeStyle = '#0077aa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, S * -0.28);
        ctx.quadraticCurveTo(-S * 0.06, S * -0.05, -S * 0.40, S * 0.22);
        ctx.quadraticCurveTo(-S * 0.42, S * 0.36, -S * 0.40, S * 0.50);
        ctx.quadraticCurveTo(-S * 0.12, S * 0.50, 0, S * 0.50);
        ctx.quadraticCurveTo(0, S * 0.25, 0, S * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 右侧
        ctx.fillStyle = '#285075';
        ctx.strokeStyle = '#0099cc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, S * -0.28);
        ctx.quadraticCurveTo(S * 0.06, S * -0.05, S * 0.40, S * 0.22);
        ctx.quadraticCurveTo(S * 0.42, S * 0.36, S * 0.40, S * 0.50);
        ctx.quadraticCurveTo(S * 0.12, S * 0.50, 0, S * 0.50);
        ctx.quadraticCurveTo(0, S * 0.25, 0, S * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 背脊
        ctx.fillStyle = '#386590';
        ctx.strokeStyle = '#00bbee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, S * -0.28);
        ctx.quadraticCurveTo(-S * 0.04, S * -0.05, 0, S * 0.0);
        ctx.quadraticCurveTo(S * 0.04, S * -0.05, 0, S * -0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // ===== COCKPIT =====
        ctx.save();
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 8;
        const cg = ctx.createRadialGradient(-S * 0.01, S * 0.01, 0, 0, S * 0.03, S * 0.10);
        cg.addColorStop(0, 'rgba(200, 240, 255, 0.95)');
        cg.addColorStop(0.3, 'rgba(120, 200, 255, 0.85)');
        cg.addColorStop(0.7, 'rgba(60, 140, 220, 0.75)');
        cg.addColorStop(1, 'rgba(30, 80, 160, 0.55)');
        ctx.fillStyle = cg;
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, S * 0.0, S * 0.08, S * 0.10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(S * 0.02, S * -0.01, S * 0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ===== NOSE =====
        ctx.save();
        ctx.shadowColor = '#0088ff';
        ctx.shadowBlur = 3;
        const ng = ctx.createLinearGradient(0, S * -0.28, 0, S * -0.04);
        ng.addColorStop(0, '#051525');
        ng.addColorStop(1, '#1a4565');
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.moveTo(0, S * -0.28);
        ctx.bezierCurveTo(-S * 0.02, S * -0.18, -S * 0.04, S * -0.08, -S * 0.03, S * -0.02);
        ctx.quadraticCurveTo(0, S * 0.0, S * 0.03, S * -0.02);
        ctx.bezierCurveTo(S * 0.04, S * -0.08, S * 0.02, S * -0.18, 0, S * -0.28);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // ===== 尾翼鳍(侧面) =====
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.fillStyle = '#1a3550';
            ctx.strokeStyle = '#00aadd';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(s * S * 0.38, S * 0.22);
            ctx.quadraticCurveTo(s * S * 0.32, S * 0.30, s * S * 0.34, S * 0.40);
            ctx.quadraticCurveTo(s * S * 0.38, S * 0.42, s * S * 0.40, S * 0.38);
            ctx.quadraticCurveTo(s * S * 0.40, S * 0.30, s * S * 0.38, S * 0.22);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // ===== WING TIP LIGHTS =====
        const wingPulse = 0.7 + 0.3 * Math.sin(this.time * 8);
        ctx.fillStyle = `rgba(255, 50, 100, ${wingPulse})`;
        ctx.shadowColor = '#ff3366';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(-S * 0.94, S * 0.29, S * 0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(S * 0.94, S * 0.29, S * 0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    getPlaneState() { return this.planeState; }
    cleanup() { super.cleanup(); }
}