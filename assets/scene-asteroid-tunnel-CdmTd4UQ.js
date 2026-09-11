// 太空隧道 · 穿越小行星带 (v2 重写)
// 相对初版的改进:
//   1. 路径: 分段式隧道 (平静/正弦/S弯/折线/阶梯/窄门穿梭/开阔休息段),
//      锚点 + 余弦平滑插值, 不再是一条单调噪声曲线
//   2. 视觉: 紫-品红星云调色, 远景带环行星, 岩石加缺口侧霓虹边缘光, 速度线
//   3. 金币: 按段落阵型排列 (中线串/波浪带/双线/圆环阵+大金币), 带星光闪烁
//
// 引擎契约 (与初版一致, 由 GameEngine 调用):
//   sceneType='tunnel'; init(engine); update(dt);
//   renderBackground(ctx,w,h) (含飞船绘制); renderPlayer(ctx,x,y) 留空;
//   mapInputToPosition(input)->{x,y} (归一化); checkCollision(x,y,r)->bool;
//   checkCoinCollect(x,y)->[coin]; onCoinCollect(coin,engine); cleanup()
import { t as SoundManager } from "./sound-manager-D_9EBJtz.js";
import { t as SceneBase } from "./scene-base-h5q7y06u.js";
import { n as ParticleSystem } from "./particle-Dnitz7s5.js";

// ---------- 工具 ----------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
// 余弦平滑插值 (0..1)
function smooth(t) { return (1 - Math.cos(t * Math.PI)) / 2; }

// 段落类型 → 生成参数
// amp: 摆动幅度; dx: 锚点间距; gapMod: 缺口修正; waves: 正弦波数(仅波形类)
const SEG_STYLE = {
    calm:   { n: [3, 5], amp: [0.02, 0.04], dx: [0.10, 0.14], gapMod: +0.02,  kind: 'wave', waves: 0.5 },
    sine:   { n: [5, 8], amp: [0.05, 0.09], dx: [0.07, 0.09], gapMod: 0,      kind: 'wave', waves: 1 },
    sCurve: { n: [7, 10], amp: [0.06, 0.10], dx: [0.07, 0.09], gapMod: 0,     kind: 'wave', waves: 2 },
    zigzag: { n: [5, 8], amp: [0.05, 0.08], dx: [0.08, 0.10], gapMod: 0,      kind: 'zig' },
    steps:  { n: [5, 8], amp: [0.04, 0.07], dx: [0.07, 0.09], gapMod: +0.01,  kind: 'step' },
    slalom: { n: [6, 9], amp: [0.06, 0.09], dx: [0.09, 0.12], gapMod: 0,      kind: 'zig' },
    osc:    { n: [8, 12], amp: [0.03, 0.05], dx: [0.05, 0.065], gapMod: 0,    kind: 'wave', waves: 3 },
    pinch:  { n: [6, 8], amp: [0.05, 0.10], dx: [0.08, 0.10], gapMod: +0.03,  kind: 'wave', waves: 1 },   // 中段急收窄 (已不出场)
    funnel: { n: [5, 7], amp: [0.04, 0.08], dx: [0.09, 0.12], gapMod: +0.02,  kind: 'wave', waves: 0.5 }, // 漏斗渐窄 (已不出场)
    rest:   { n: [3, 4], amp: [0, 0],        dx: [0.14, 0.18], gapMod: +0.05,  kind: 'flat' }
};

class SceneAsteroidTunnel extends SceneBase {
    constructor() {
        super();
        this.sceneType = 'tunnel';
        this.particles = new ParticleSystem();
        this.anchors = [];      // 隧道锚点 {x, y, gap} (世界坐标)
        this.rocks = [];        // 岩石 {x, y, r, face, hue, seed} face:+1 上壁(朝下发光) -1 下壁 0 漂浮
        this.coins = [];        // 金币 {x, y, big, bob, collected}
        this.stars = [];
        this.nebulae = [];
        this.planets = [];      // 远景行星
        this.shootingStars = [];
        this.dust = [];
        this.streaks = [];      // 速度线
        this.scrollX = 0;       // 世界滚动量
        this._genX = 0;         // 路径已生成到的世界 x
        this._nextShootingStar = 2 + Math.random() * 3;
        this._lastSegType = 'calm';
        this._shipYPrev = 0.5;
        this.init();
    }

    init(engine) {
        super.init(engine);
        this.anchors = []; this.rocks = []; this.coins = [];
        this.stars = []; this.nebulae = []; this.planets = [];
        this.shootingStars = []; this.dust = []; this.streaks = [];
        this.scrollX = 0; this._genX = -0.3;
        this._nextShootingStar = 2 + Math.random() * 3;
        this._lastSegType = 'calm';
        this._shipYPrev = 0.5;
        // 生成水位线 (init 可能被引擎二次调用, 必须一起重置)
        this._rockX = -0.31;
        this._coinX = 0.55;
        this._ringDone = undefined;
        this._segHistory = [];
        this._nextGateX = 1.5;
        this._nextForceX = 2.0;

        // 背景: 尘埃 / 三层星星 / 星云 / 远景行星
        for (let i = 0; i < 120; i++) this.dust.push({
            x: Math.random(), y: Math.random(), sz: .3 + Math.random() * 1.5,
            sp: .01 + Math.random() * .05, alpha: .05 + Math.random() * .15, hue: Math.random() * 360
        });
        for (let i = 0; i < 400; i++) this.stars.push({
            x: Math.random(), y: Math.random(), sz: .3 + Math.random() * 3,
            tw: Math.random() * Math.PI * 2, twSpd: 2 + Math.random() * 5,
            sp: .03 + Math.random() * .4, hue: Math.random() * 360, layer: (Math.random() * 3) | 0
        });
        // 紫-品红为主的星云
        const NEB_HUES = [265, 285, 310, 330, 250, 290, 315, 270];
        for (let i = 0; i < 9; i++) this.nebulae.push({
            x: Math.random(), y: Math.random() * .9,
            rx: .12 + Math.random() * .5, ry: .06 + Math.random() * .3,
            hue: NEB_HUES[i % NEB_HUES.length] + rand(-12, 12), alpha: .05 + Math.random() * .09
        });
        // 远景带环行星 (视频里那种粉色发光球, 低存在感背景)
        for (let i = 0; i < 3; i++) this.planets.push({
            x: .2 + i * .5 + rand(-.1, .1), y: rand(.12, .85),
            r: rand(.04, .08), hue: pick([315, 325, 280, 205]),
            sp: rand(.004, .009), ring: Math.random() < .7, tilt: rand(-.5, .5), glow: rand(.6, 1)
        });
        // 速度线
        for (let i = 0; i < 26; i++) this.streaks.push({
            x: Math.random(), y: Math.random(), len: rand(.02, .07), sp: rand(.5, 1), alpha: rand(.04, .12)
        });
        // 中场粉色发光球 (参照图的粉色光球, 纯装饰, 无碰撞)
        this.pinkOrbs = [];
        for (let i = 0; i < 4; i++) this.pinkOrbs.push({
            x: .15 + i * .28 + rand(-.06, .06), y: rand(.12, .88),
            r: rand(.016, .038), hue: pick([318, 325, 332]), pulse: rand(0, Math.PI * 2)
        });

        // 起始锚点: 屏幕中央, 宽缺口, 保证开局安全
        this.anchors.push({ x: -0.3, y: 0.5, gap: 0.20 });
        this.anchors.push({ x: 0.1, y: 0.5, gap: 0.20 });
        this.anchors.push({ x: 0.5, y: 0.5, gap: 0.19 });
        this._genX = 0.5;
        // 预生成到屏幕外
        while (this._genX < 2.2) this._genSegment();
        this._spawnContentUpTo(2.2);
    }

    // ---------- 路径生成 ----------
    _difficulty() { return Math.min(1, this._genX / 12); } // 0..1, 约 90~120 秒拉满

    _genSegment() {
        const diff = this._difficulty();
        // 类型池: 宽通道 + 障碍驱动; 不用收窄类段型 (pinch/funnel 不出场)
        let bag = ['sine', 'sine', 'sCurve', 'zigzag', 'steps', 'calm'];
        if (this._genX > 2) bag.push('osc');
        if (this._genX > 2.5) bag.push('slalom');
        if (this._genX > 4.5 && this._lastSegType !== 'rest') bag.push('rest');
        if (diff > 0.4) bag.push('slalom', 'sCurve', 'osc');
        let type = pick(bag);
        if (type === this._lastSegType && type !== 'sine') type = pick(bag);
        this._lastSegType = type;
        this._segHistory.push(type);

        const st = SEG_STYLE[type];
        const n = Math.round(rand(st.n[0], st.n[1]));
        const amp = rand(st.amp[0], st.amp[1]) * (0.8 + diff * 0.5);
        const dx = rand(st.dx[0], st.dx[1]);
        const baseGap = 0.24 - 0.03 * diff;                 // 宽通道: 0.24 → 0.21, 不靠收窄加压
        const gap = clamp(baseGap + st.gapMod + rand(-0.01, 0.01), 0.14, 0.30);
        const prevY = this.anchors[this.anchors.length - 1].y;

        let x = this._genX;
        for (let k = 1; k <= n; k++) {
            x += dx * rand(0.75, 1.35); // 锚点间距随机, 打破等距感
            let y;
            if (st.kind === 'wave') {
                // 主波形 + 次级涟漪, 叠加出复合曲线
                y = prevY + Math.sin((k / n) * Math.PI * 2 * st.waves) * amp * rand(0.85, 1.15)
                          + Math.sin((k / n) * Math.PI * 2 * 3.7 + dx) * amp * 0.22;
            } else if (st.kind === 'zig') {
                y = prevY + (k % 2 === 0 ? -1 : 1) * amp * rand(0.55, 1.25) * (k === n ? 0 : 1);
            } else if (st.kind === 'step') {
                // 每两个锚点保持一个高度, 然后跳变
                y = prevY + (((Math.ceil(k / 2) % 2) * 2 - 1)) * amp * rand(0.7, 1.2) * (k === n ? 0 : 1);
            } else { // flat
                y = prevY;
            }
            // 段落结束时回到中线附近, 避免漂移出屏
            if (k === n) y = 0.5 + (prevY - 0.5) * 0.3;
            y += rand(-0.022, 0.022); // 高频抖动, 去掉机械感
            // 逐点缺口: pinch 中段急收窄, funnel 持续收窄
            let gapK = gap;
            if (type === 'pinch') gapK = gap * (1 - 0.45 * Math.sin(Math.PI * k / n));
            else if (type === 'funnel') gapK = gap * (1.2 - 0.45 * k / n);
            this.anchors.push({
                x, y: clamp(y, 0.16, 0.84),
                gap: clamp(gapK * rand(0.9, 1.1), 0.14, 0.30), // 缺口宽度也逐点抖动
                seg: type
            });
        }
        this._genX = x;
    }

    // 锚点区间查找 + 余弦插值
    _sample(x, field) {
        const a = this.anchors;
        if (x <= a[0].x) return a[0][field];
        for (let i = 1; i < a.length; i++) {
            if (x <= a[i].x) {
                const t = smooth((x - a[i - 1].x) / (a[i].x - a[i - 1].x));
                return a[i - 1][field] + (a[i][field] - a[i - 1][field]) * t;
            }
        }
        return a[a.length - 1][field];
    }
    getTunnelCenterY(x) { return this._sample(x, 'y'); }
    getGapHalfWidth(x) { return this._sample(x, 'gap'); }

    // ---------- 内容生成 (岩石/金币) ----------
    // 全部用世界 x 水位线记录进度, anchors 头部被裁剪也不会错位
    _spawnContentUpTo(worldX) {
        if (this._rockX === undefined) this._rockX = -0.31;
        let i = 1;
        while (i < this.anchors.length && this.anchors[i].x <= this._rockX) i++;
        while (i < this.anchors.length && this.anchors[i].x <= worldX) {
            this._spawnRocksInterval(this.anchors[i - 1], this.anchors[i]);
            this._rockX = this.anchors[i].x;
            i++;
        }
        this._spawnCoinsUpTo(worldX);
    }

    // 障碍驱动的宽通道: 障碍石堆遍布全高度 (车道安全区外), 车道中央周期性放
    // 逼迫石迫使变轨, 另保留闸门事件 —— 运动轨迹由障碍布局决定, 不靠通道收窄
    _spawnRocksInterval(A0, A1) {
        const type = A1.seg || 'calm';
        const diff = this._difficulty();
        // 闸门事件 (rest 段不出, 窗口留宽)
        if (this._nextGateX === undefined) this._nextGateX = 1.5;
        if (type !== 'rest' && A1.x > this._nextGateX && A1.x - A0.x > 0.04) {
            this._spawnGate((A0.x + A1.x) / 2, diff);
            this._nextGateX = A1.x + rand(1.0, 2.0) * (1 - diff * 0.3);
        }
        // ① 障碍石堆: 每区间 2~4 堆, 一堆 2~4 颗; 难度提升堆数和密度
        const nClusters = 2 + (Math.random() < 0.3 + diff * 0.5 ? 1 : 0) + (Math.random() < diff * 0.4 ? 1 : 0);
        for (let ci = 0; ci < nClusters; ci++) {
            const x = rand(A0.x, A1.x);
            const c = this.getTunnelCenterY(x), g = this.getGapHalfWidth(x);
            const safe = Math.max(0.05, g * 0.4); // 车道安全区 (窄, 障碍可以压近)
            const cy = rand(0.05, 0.95);
            if (Math.abs(cy - c) < safe) continue;
            const nR = 2 + ((Math.random() * 3) | 0);
            for (let k = 0; k < nR; k++) {
                const u = Math.random();
                const r = u < 0.5 ? rand(0.018, 0.032) : u < 0.85 ? rand(0.032, 0.05) : rand(0.05, 0.075);
                const px = x + rand(-0.035, 0.035), py = clamp(cy + rand(-0.04, 0.04), 0.04, 0.96);
                if (Math.abs(py - c) < safe + r * 0.8) continue; // 侵入车道
                this.rocks.push({
                    x: px, y: py, r, rot: rand(0, Math.PI * 2),
                    shade: (Math.random() * 3) | 0, seed: (Math.random() * 1000) | 0
                });
            }
        }
        // ② 车道逼迫石: 周期性在车道正中放一颗, 上下皆可绕行 —— 迫使玩家变轨
        if (this._nextForceX === undefined) this._nextForceX = 2.0;
        if (A1.x > this._nextForceX) {
            const x = (A0.x + A1.x) / 2;
            const c = this.getTunnelCenterY(x), g = this.getGapHalfWidth(x);
            if (g > 0.15) {
                const r = rand(0.028, 0.042);
                this.rocks.push({
                    x, y: c + rand(-0.02, 0.02), r, rot: rand(0, Math.PI * 2),
                    shade: (Math.random() * 3) | 0, seed: (Math.random() * 1000) | 0
                });
                // 绕行侧放一颗引导金币
                this.coins.push({ x, y: c + (Math.random() < 0.5 ? -1 : 1) * (r + 0.07), big: false, bob: x * 7, collected: false });
            }
            this._nextForceX = A1.x + rand(0.8, 1.6) * (1 - diff * 0.3);
        }
    }

    // 闸门: 一道岩柱, 仅在窗口处可过 (窗口中心贴近走廊中心, 保证可通行)
    _spawnGate(x, diff) {
        const c = this.getTunnelCenterY(x), g = this.getGapHalfWidth(x);
        const winHalf = rand(0.13, 0.17); // 窗口留宽, 压迫感来自岩柱而非窄缝
        const winC = clamp(c + rand(-0.2, 0.2) * g, 0.16, 0.84);
        for (let y = 0.04; y < 0.96; y += rand(0.032, 0.055)) {
            if (Math.abs(y - winC) < winHalf) continue;
            // 靠近窗口的石头用小个的, 保证走廊净宽; 远处大小混杂
            const nearWin = Math.abs(y - winC) < winHalf + 0.09;
            const r = nearWin ? rand(0.022, 0.038) : rand(0.028, 0.06);
            this.rocks.push({
                x: x + rand(-0.02, 0.02), y: y + rand(-0.015, 0.015), r, rot: rand(0, Math.PI * 2),
                shade: (Math.random() * 3) | 0, seed: (Math.random() * 1000) | 0
            });
        }
        // 窗口中心放一颗金币做引导
        this.coins.push({ x, y: winC, big: false, bob: x * 7, collected: false });
    }

    // 金币: 稀疏排布 (参考画面同屏 ~5-10 颗) —— 单颗 / 3 颗短弧 / 4 颗短串,
    // rest 段偶发圆环阵 + 大金币; 闸门窗口另有一颗引导金币
    _spawnCoinsUpTo(worldX) {
        if (this._coinX === undefined) this._coinX = 0.55;
        while (this._coinX < worldX) {
            const x = this._coinX;
            const type = this._sampleSeg(x) || 'calm';
            const c = this.getTunnelCenterY(x), g = this.getGapHalfWidth(x);
            const push = (xx, yy, big) => this.coins.push({ x: xx, y: clamp(yy, 0.04, 0.96), big: !!big, bob: xx * 7, collected: false });
            if (type === 'rest' && g > 0.17 && (!this._ringDone || x - this._ringDone > 0.8)) {
                const R = Math.min(g * 0.5, 0.085);
                for (let k = 0; k < 6; k++) {
                    const th = k / 6 * Math.PI * 2;
                    push(x + Math.cos(th) * R, c + Math.sin(th) * R);
                }
                push(x, c, true);
                this._ringDone = x;
                this._coinX += 0.06;
            } else {
                const u = Math.random();
                if (u < 0.45) {
                    // 单颗
                    push(x, c + rand(-0.4, 0.4) * g);
                    this._coinX += rand(0.10, 0.18);
                } else if (u < 0.8) {
                    // 3 颗小弧
                    const dir = Math.random() < 0.5 ? -1 : 1;
                    for (let k = 0; k < 3; k++) push(x + k * 0.035, c + Math.sin(k / 2 * Math.PI) * g * 0.5 * dir);
                    this._coinX += rand(0.16, 0.26);
                } else {
                    // 4 颗中线短串
                    for (let k = 0; k < 4; k++) push(x + k * 0.04, c);
                    this._coinX += rand(0.25, 0.40);
                }
            }
        }
    }
    _sampleSeg(x) {
        const a = this.anchors;
        for (let i = a.length - 1; i >= 1; i--) if (x >= a[i - 1].x) return a[i].seg;
        return null;
    }

    // ---------- 主循环 ----------
    update(dt) {
        super.update(dt);
        const speed = 0.085 + Math.min(1, this.gameTime / 75) * 0.075; // 渐快
        this.scrollX += speed * dt;

        // 路径前瞻生成 + 内容生成
        while (this._genX < this.scrollX + 2.2) this._genSegment();
        this._spawnContentUpTo(this.scrollX + 2.2);
        // 清理远后方锚点 (保留插值余量); 生成进度用 x 水位线, 不受 shift 影响
        while (this.anchors.length > 2 && this.anchors[1].x < this.scrollX - 1) this.anchors.shift();

        const sLeft = this.scrollX - 0.3;
        this.rocks = this.rocks.filter(r => r.x > sLeft - 0.2);
        this.coins = this.coins.filter(c => c.x > sLeft - 0.15 && !c.collected);

        for (const s of this.stars) { s.tw += s.twSpd * dt; s.x -= s.sp * dt * .08; if (s.x < -.05) s.x = 1.05; }
        for (const d of this.dust) { d.x -= d.sp * dt; if (d.x < -.05) d.x = 1.05; }
        for (const p of this.planets) { p.x -= p.sp * dt; if (p.x < -.25) { p.x = 1.25; p.y = rand(.12, .85); } }
        for (const st of this.streaks) { st.x -= st.sp * dt; if (st.x < -.1) { st.x = 1.1; st.y = Math.random(); } }
        for (const po of this.pinkOrbs) { po.x -= speed * dt * .9; po.pulse += dt * 2; if (po.x < -.08) { po.x = 1.08 + rand(0, .2); po.y = rand(.12, .88); } }

        this._nextShootingStar -= dt;
        if (this._nextShootingStar <= 0) {
            this.shootingStars.push({
                x: 1.05 + Math.random() * .2, y: Math.random() * .8,
                len: .03 + Math.random() * .05, dur: .8 + Math.random() * 1.2,
                age: 0, hue: 200 + Math.random() * 40
            });
            this._nextShootingStar = 6 + Math.random() * 14;
        }
        for (let i = this.shootingStars.length - 1; i >= 0; i--) {
            this.shootingStars[i].age += dt;
            if (this.shootingStars[i].age > this.shootingStars[i].dur) this.shootingStars.splice(i, 1);
        }
        this.particles.update(dt);
    }

    // 输入 → 玩家位置 (点头上下控制, 横向固定)
    mapInputToPosition(input) {
        return { x: .5, y: (input.y === undefined || input.y === null) ? .5 : input.y };
    }

    renderPlayer() {}

    checkCollision(px, py, rNorm) {
        if (this.gameTime < 1.5) return false;
        const cv = this.engine && this.engine.canvas;
        if (!cv) return false;
        const w = cv.width, h = cv.height, m = Math.min(w, h);
        const sx = px * w, sy = py * h, pr = rNorm * m * .65;
        for (const rock of this.rocks) {
            const rx = (rock.x - this.scrollX) * w, ry = rock.y * h, rr = rock.r * m * .8;
            const dx = sx - rx, dy = sy - ry;
            if (dx * dx + dy * dy < (pr + rr) * (pr + rr)) return true;
        }
        return false;
    }

    checkCoinCollect(px, py) {
        const cv = this.engine && this.engine.canvas;
        if (!cv) return [];
        const w = cv.width, h = cv.height;
        const sx = px * w, sy = py * h, got = [];
        for (const c of this.coins) {
            if (c.collected) continue;
            const rr = c.big ? 52 : 38;
            if (Math.hypot(sx - (c.x - this.scrollX) * w, sy - c.y * h) < rr) {
                c.collected = true; got.push(c);
            }
        }
        return got;
    }

    onCoinCollect(coin) {
        this.particles.emitCoinCollect(coin.x - this.scrollX, coin.y);
        SoundManager.playCoin();
    }

    // ---------- 渲染 ----------
    renderBackground(ctx, w, h) {
        const m = Math.min(w, h), t = this.gameTime;
        this._drawSpace(ctx, w, h, t);
        // 粉色发光球 (装饰)
        for (const po of this.pinkOrbs) {
            const px = po.x * w, py = po.y * h, pr = po.r * m * (1 + .12 * Math.sin(po.pulse));
            const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 3.2);
            pg.addColorStop(0, `hsla(${po.hue},95%,78%,.9)`);
            pg.addColorStop(.25, `hsla(${po.hue},90%,62%,.55)`);
            pg.addColorStop(.6, `hsla(${po.hue},85%,50%,.18)`);
            pg.addColorStop(1, 'transparent');
            ctx.fillStyle = pg;
            ctx.beginPath(); ctx.arc(px, py, pr * 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `hsla(${po.hue},100%,88%,.95)`;
            ctx.beginPath(); ctx.arc(px, py, pr * .8, 0, Math.PI * 2); ctx.fill();
        }
        // 岩石 (远→近: 先大后小无所谓, 直接画)
        for (const rock of this.rocks) this._drawRock(ctx, rock, w, h, m);
        for (const coin of this.coins) if (!coin.collected) this._drawCoin(ctx, coin, w, h, t);
        this.particles.render(ctx);
        const py = (this.engine && this.engine.player ? this.engine.player.y : .5);
        this._drawShip(ctx, .5 * w, py * h, m, py);
    }

    // 走廊微光引导带: 沿隧道中心铺两层半透亮光, 路在暗场里依然可读
    _drawCorridorGlow(ctx, w, h) {
        const step = w / 32;
        const band = (scale, color) => {
            ctx.beginPath();
            for (let sx = 0; sx <= w + step; sx += step) {
                const wx = this.scrollX + sx / w;
                const c = this.getTunnelCenterY(wx) * h, g = this.getGapHalfWidth(wx) * h * scale;
                sx === 0 ? ctx.moveTo(sx, c - g) : ctx.lineTo(sx, c - g);
            }
            for (let sx = w + step; sx >= 0; sx -= step) {
                const wx = this.scrollX + sx / w;
                const c = this.getTunnelCenterY(wx) * h, g = this.getGapHalfWidth(wx) * h * scale;
                ctx.lineTo(sx, c + g);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        };
        band(1.0, 'rgba(120,170,255,0.05)');  // 外圈
        band(0.45, 'rgba(150,195,255,0.06)'); // 中心亮带
    }

    _drawSpace(ctx, w, h, t) {
        const m = Math.min(w, h);
        // 深空渐变 (紫→靛蓝)
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1a0b30'); g.addColorStop(.25, '#2b1052');
        g.addColorStop(.5, '#1c1a55'); g.addColorStop(.75, '#101a45'); g.addColorStop(1, '#081026');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // 两侧氛围光
        let o = ctx.createRadialGradient(0, h * .5, 0, 0, h * .5, w * .6);
        o.addColorStop(0, 'rgba(150,50,180,0.20)'); o.addColorStop(.5, 'rgba(90,40,150,0.10)'); o.addColorStop(1, 'transparent');
        ctx.fillStyle = o; ctx.fillRect(0, 0, w, h);
        o = ctx.createRadialGradient(w, h * .3, 0, w, h * .3, w * .5);
        o.addColorStop(0, 'rgba(40,80,190,0.16)'); o.addColorStop(.5, 'rgba(25,60,150,0.08)'); o.addColorStop(1, 'transparent');
        ctx.fillStyle = o; ctx.fillRect(0, 0, w, h);

        // 星云
        for (const nb of this.nebulae) {
            const nx = nb.x * w, ny = nb.y * h, s = .75 + .25 * Math.sin(t * .5 + nb.x * 6);
            const hue = (nb.hue + t * 3) % 360;
            const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nb.rx * w * 2.2 * s);
            ng.addColorStop(0, `hsla(${hue},85%,58%,${nb.alpha * .8 * s})`);
            ng.addColorStop(.35, `hsla(${hue + 25},70%,45%,${nb.alpha * .45 * s})`);
            ng.addColorStop(.7, `hsla(${hue + 50},60%,32%,${nb.alpha * .2 * s})`);
            ng.addColorStop(1, 'transparent');
            ctx.fillStyle = ng;
            ctx.beginPath(); ctx.ellipse(nx, ny, nb.rx * w * 2.2 * s, nb.ry * h * 2.6 * s, 0, 0, Math.PI * 2); ctx.fill();
        }

        // 远景行星 (带光晕 + 行星环)
        for (const p of this.planets) {
            const px = p.x * w, py = p.y * h, pr = p.r * m;
            const halo = ctx.createRadialGradient(px, py, pr * .4, px, py, pr * 3);
            halo.addColorStop(0, `hsla(${p.hue},90%,65%,${.16 * p.glow})`);
            halo.addColorStop(.5, `hsla(${p.hue},80%,55%,${.07 * p.glow})`);
            halo.addColorStop(1, 'transparent');
            ctx.fillStyle = halo;
            ctx.beginPath(); ctx.arc(px, py, pr * 3, 0, Math.PI * 2); ctx.fill();
            const body = ctx.createRadialGradient(px - pr * .35, py - pr * .35, pr * .1, px, py, pr);
            body.addColorStop(0, `hsla(${p.hue},85%,72%,.6)`);
            body.addColorStop(.55, `hsla(${p.hue},75%,50%,.55)`);
            body.addColorStop(1, `hsla(${p.hue + 20},70%,28%,.5)`);
            ctx.fillStyle = body;
            ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
            if (p.ring) {
                ctx.save(); ctx.translate(px, py); ctx.rotate(p.tilt);
                ctx.strokeStyle = `hsla(${p.hue + 30},85%,75%,.3)`;
                ctx.lineWidth = Math.max(1.5, pr * .12);
                ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.8, pr * .5, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = `hsla(${p.hue + 30},85%,85%,.16)`;
                ctx.lineWidth = Math.max(1, pr * .05);
                ctx.beginPath(); ctx.ellipse(0, 0, pr * 2.15, pr * .62, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
        }

        // 三层星星
        for (let layer = 0; layer < 3; layer++) {
            const szMul = [.7, 1, 1.6][layer], alMul = [.6, .75, .9][layer];
            for (const s of this.stars) {
                if (s.layer !== layer) continue;
                const tw = .3 + .7 * Math.sin(s.tw), alpha = alMul * (0.6 + tw * .5);
                const hue = (s.hue + t * 2.5) % 360;
                const sx = s.x * w, sy = s.y * h, sz = s.sz * szMul;
                ctx.fillStyle = `hsla(${hue},30%,95%,${alpha})`;
                if (layer === 0) ctx.fillRect(sx, sy, Math.max(1.5, sz * .7), Math.max(1.5, sz * .7));
                else { ctx.beginPath(); ctx.arc(sx, sy, sz * .5, 0, Math.PI * 2); ctx.fill(); }
            }
        }

        // 流星
        for (const s of this.shootingStars) {
            const k = s.age / s.dur, sx = s.x * w - k * .6 * w, sy = s.y * h - k * .3 * h;
            ctx.globalAlpha = (1 - k) * .95;
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.len * w * .4);
            sg.addColorStop(0, '#fff'); sg.addColorStop(.15, `hsla(${s.hue + 60},90%,96%,0.95)`);
            sg.addColorStop(.5, `hsla(${s.hue + 30},70%,82%,0.5)`); sg.addColorStop(1, 'transparent');
            ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, s.len * w * .4, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // 尘埃 + 速度线
        for (const d of this.dust) {
            ctx.fillStyle = `hsla(${(d.hue + t * 3) % 360},30%,90%,${d.alpha})`;
            ctx.fillRect(d.x * w, d.y * h, d.sz * 2.5, d.sz * 2.5);
        }
        ctx.lineWidth = 1.5;
        for (const st of this.streaks) {
            ctx.strokeStyle = `rgba(180,200,255,${st.alpha})`;
            ctx.beginPath();
            ctx.moveTo(st.x * w, st.y * h);
            ctx.lineTo((st.x + st.len) * w, st.y * h);
            ctx.stroke();
        }
    }

    // 岩石精灵缓存: 10 种外形 × 3 种明暗, 离屏预渲染; 帧内随机旋转 drawImage
    // 照参考图做: 深灰土豆块 + 细白陨坑圈, 克制的顶光, 不搞花哨
    _rockSprite(seed, shade) {
        if (!this._rockCache) this._rockCache = {};
        const key = (seed % 10) + '_' + shade;
        const hit = this._rockCache[key];
        if (hit) return hit;
        const S = 160, cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const ctx = cv.getContext('2d');
        const x = S / 2, y = S / 2, r = S * 0.40, N = 12;
        // 轮廓: 土豆块 (平滑曲线, 小方差)
        const radAt = (k) => r * (.85 + .15 * Math.sin(seed * .13 + k * 2.9));
        const blob = () => {
            ctx.beginPath();
            for (let k = 0; k <= N; k++) {
                const th = k / N * Math.PI * 2;
                const px = x + Math.cos(th) * radAt(k), py = y + Math.sin(th) * radAt(k) * .9;
                if (k === 0) ctx.moveTo(px, py);
                else {
                    const th0 = (k - 1) / N * Math.PI * 2;
                    const qx = x + Math.cos(th0) * radAt(k - 1), qy = y + Math.sin(th0) * radAt(k - 1) * .9;
                    ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
                }
            }
            ctx.closePath();
        };
        // 体: 深色岩体 (近黑蓝灰), 顶部一点受光
        const grad = ctx.createRadialGradient(x - r * .35, y - r * .45, r * .1, x, y, r * 1.5);
        grad.addColorStop(0, '#42465a'); grad.addColorStop(.4, '#2a2d3b');
        grad.addColorStop(.75, '#181a22'); grad.addColorStop(1, '#0d0e13');
        ctx.fillStyle = grad;
        blob(); ctx.fill();
        ctx.save();
        blob(); ctx.clip();
        // 手绘白描边 (两道, 粗细不一 → 插画感)
        blob();
        ctx.strokeStyle = 'rgba(228,234,250,0.50)';
        ctx.lineWidth = r * .05;
        ctx.stroke();
        blob();
        ctx.strokeStyle = 'rgba(228,234,250,0.22)';
        ctx.lineWidth = r * .018;
        ctx.stroke();
        // 陨坑 ×3~5: 抖动白圈 (非正圆) + 微暗坑底
        const nCr = 3 + (seed % 3);
        for (let k = 0; k < nCr; k++) {
            const th = (seed * .07 + k * 2.1) % (Math.PI * 2);
            const cr = r * (.12 + ((seed * (k + 3)) % 10) / 10 * .4);
            const cx = x + Math.cos(th) * cr, cy = y + Math.sin(th) * cr * .85;
            const cs = r * (.13 + ((seed * (k + 7)) % 10) / 10 * .15);
            const cseed = seed * .31 + k * 2.17;
            const wobble = () => {
                ctx.beginPath();
                const nP = 9;
                for (let p = 0; p <= nP; p++) {
                    const a = p / nP * Math.PI * 2;
                    const rr = cs * (1 + .13 * Math.sin(cseed * 2.3 + p * 2.7));
                    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * .85;
                    p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
            };
            wobble();
            ctx.fillStyle = 'rgba(8,9,14,0.55)'; ctx.fill();
            wobble();
            ctx.strokeStyle = 'rgba(230,236,250,0.8)';
            ctx.lineWidth = Math.max(1, cs * .15);
            ctx.stroke();
        }
        // 表面细颗粒
        for (let k = 0; k < 5; k++) {
            const th = (seed * .11 + k * 1.7) % (Math.PI * 2);
            const hr = r * (.25 + ((seed * (k + 5)) % 10) / 10 * .55);
            ctx.fillStyle = 'rgba(215,220,240,0.10)';
            ctx.beginPath(); ctx.arc(x + Math.cos(th) * hr, y + Math.sin(th) * hr * .85, r * .025, 0, Math.PI * 2); ctx.fill();
        }
        // 边缘: 左上细亮缘 + 右下阴影缘 (都很克制)
        ctx.strokeStyle = 'rgba(215,222,245,0.20)';
        ctx.lineWidth = r * .06;
        ctx.beginPath(); ctx.arc(x, y, r * .92, Math.PI * .55, Math.PI * 1.35); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,6,0.32)';
        ctx.lineWidth = r * .09;
        ctx.beginPath(); ctx.arc(x, y, r * .92, -Math.PI * .45, Math.PI * .35); ctx.stroke();
        // 明暗变体
        if (shade === 1) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, S, S); }
        else if (shade === 2) { ctx.fillStyle = 'rgba(0,0,20,0.14)'; ctx.fillRect(0, 0, S, S); }
        ctx.restore();
        this._rockCache[key] = cv;
        return cv;
    }

    _drawRock(ctx, rock, w, h, m) {
        const x = (rock.x - this.scrollX) * w, y = rock.y * h, r = rock.r * m;
        if (r < 4 || x < -r * 2 || x > w + r * 2) return;
        const spr = this._rockSprite(rock.seed, rock.shade || 0);
        const d = r * 2.9; // 精灵体半径约占画布 40%, 加光照余量
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rock.rot || 0);
        ctx.drawImage(spr, -d / 2, -d / 2, d, d);
        ctx.restore();
    }

    _drawCoin(ctx, coin, w, h, t) {
        const x = (coin.x - this.scrollX) * w, y = coin.y * h;
        if (x < -30 || x > w + 30) return;
        const base = coin.big ? 13 : 7;
        const r = base + (coin.big ? 3 : 2) * Math.sin(t * 3 + coin.bob);
        // 光晕
        const glow = ctx.createRadialGradient(x, y, r * .25, x, y, r * 1.8);
        glow.addColorStop(0, 'rgba(255,205,60,0.4)'); glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
        // 币体
        const body = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        body.addColorStop(0, '#FFE566'); body.addColorStop(.35, '#FFA000');
        body.addColorStop(.65, '#FFD700'); body.addColorStop(1, '#B8860B');
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        // 内环
        ctx.strokeStyle = 'rgba(139,105,20,0.8)'; ctx.lineWidth = Math.max(1, r * .14);
        ctx.beginPath(); ctx.arc(x, y, r * .72, 0, Math.PI * 2); ctx.stroke();
        // 星光闪烁 (随时间十字闪)
        const sp = .5 + .5 * Math.sin(t * 5 + coin.bob * 2);
        ctx.strokeStyle = `rgba(255,255,230,${.35 + .55 * sp})`;
        ctx.lineWidth = 1.2;
        const L = r * (.5 + .3 * sp);
        ctx.beginPath();
        ctx.moveTo(x - r * .35 - L * .3, y - r * .4); ctx.lineTo(x - r * .35 + L * .3, y - r * .4);
        ctx.moveTo(x - r * .35, y - r * .4 - L * .3); ctx.lineTo(x - r * .35, y - r * .4 + L * .3);
        ctx.stroke();
        if (coin.big) {
            ctx.fillStyle = '#8B6914';
            ctx.font = `bold ${r * 1.1}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('★', x, y + 1);
        }
    }

    _drawShip(ctx, x, y, m, playerY) {
        const r = m * .04;
        if (r < 4) return;
        // 按垂直速度倾斜
        const vy = (playerY - this._shipYPrev) * 60;
        this._shipYPrev = playerY;
        const tilt = clamp(vy * .9, -.45, .45);
        ctx.save();
        ctx.translate(x, y); ctx.rotate(tilt);
        // 尾焰
        const flick = .3 * Math.sin(this.gameTime * 12);
        const fl = r * .75 * (1 + flick);
        const fg = ctx.createLinearGradient(0, r * .45, 0, r * .45 + fl);
        fg.addColorStop(0, 'rgba(0,180,255,0.85)'); fg.addColorStop(1, 'rgba(0,60,200,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.moveTo(-r * .3, r * .45); ctx.lineTo(r * .3, r * .45); ctx.lineTo(0, r * .45 + fl); ctx.closePath(); ctx.fill();
        // 机身光晕
        const halo = ctx.createRadialGradient(0, 0, r * .2, 0, 0, r * 1.6);
        halo.addColorStop(0, 'rgba(80,200,255,0.25)'); halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
        // 机身
        const bg = ctx.createLinearGradient(0, -r, 0, r);
        bg.addColorStop(0, '#40c8f0'); bg.addColorStop(.4, '#2070c0'); bg.addColorStop(1, '#104090');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(r * .45, r * .55); ctx.lineTo(r * .12, r * .25);
        ctx.lineTo(-r * .12, r * .25); ctx.lineTo(-r * .45, r * .55);
        ctx.closePath(); ctx.fill();
        // 座舱
        ctx.fillStyle = 'rgba(0,220,255,0.8)';
        ctx.beginPath(); ctx.ellipse(0, -r * .12, r * .16, r * .28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    cleanup() {
        super.cleanup();
        this.particles.clear();
    }
}

export { SceneAsteroidTunnel };
