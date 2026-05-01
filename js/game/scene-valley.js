// v6 - 通道系统：山峰形成变化的飞行通道
import { SceneBase } from './scene-base.js';

const MAX_Z = 10;
const TYPES = ['peak','peak','dome','dome','mesa','ridge','slope'];

export class SceneValley extends SceneBase {
    constructor() {
        super(); this.time = 0; this.speedMul = 1.0;
        this.planeState = { pitch:0, roll:0, tp:0, tr:0 };
        this.config = { smooth:0.10, ret:0.01, rollS:3.0, pitchS:2.0 };
        this.peaks = []; this.gates = []; this.coins = [];
        this.birds = []; this.trees = []; this.clouds = [];
        this.difficulty = 0; // 0-1 难度系数
        this.init();
    }
    init(engine) {
        super.init(engine); this.time = 0; this.speedMul = 1.0; this.difficulty = 0;
        this.planeState = { pitch:0, roll:0, tp:0, tr:0 };
        this._build(0);
    }

    // ==== 通道设计 ====
    // 返回 { gapX, gapY, gapW } 通道中心X/Y和通道半宽
    _channel(z) {
        const d = this.difficulty;
        const gapW = 0.15 - d * 0.08; // 难度越高通道越窄
        // 通道位置随z变化，创造多样飞行路径
        const sec = Math.floor(z / 2.5);
        const t = (z % 2.5) / 2.5;
        let gx = 0.5, gy = 0.5;
        switch (sec % 7) {
            case 0: gx = 0.35; gy = 0.5; break;              // 偏左，练左转
            case 1: gx = 0.65; gy = 0.5; break;              // 偏右，练右转
            case 2: gx = 0.5;  gy = 0.35; break;             // 居中低，练低头
            case 3: gx = 0.5;  gy = 0.65; break;             // 居中高，练抬头
            case 4: gx = 0.25 + t * 0.50; gy = 0.5; break;   // 左→右扫描
            case 5: gx = 0.75 - t * 0.50; gy = 0.5; break;   // 右→左扫描
            case 6: gx = 0.5;  gy = 0.30 + t * 0.40; break;  // 低→高扫描
        }
        return { gx: Math.max(0.15, Math.min(0.85, gx)), gy: Math.max(0.2, Math.min(0.8, gy)), gapW };
    }

    // ==== 山峰生成：通道之外随机放2-3座山 ====
    _genPeaks(z) {
        const ch = this._channel(z);
        const peaks = [];
        const gapL = ch.gx - ch.gapW, gapR = ch.gx + ch.gapW;
        // 可选放置区域：通道的左右两侧
        const regions = [];
        if (gapL > 0.05) regions.push({ min: 0.01, max: gapL });
        if (gapR < 0.95) regions.push({ min: gapR, max: 0.95 });
        if (regions.length === 0) return peaks;
        // 放2-3座山
        const count = 2 + Math.floor(Math.random() * 2);
        const used = [];
        for (let i = 0; i < count; i++) {
            const r = regions[Math.floor(Math.random() * regions.length)];
            let sx;
            for (let attempt = 0; attempt < 10; attempt++) {
                sx = r.min + Math.random() * (r.max - r.min);
                const tooClose = used.some(u => Math.abs(sx - u) < 0.12);
                if (!tooClose) break;
            }
            if (sx === undefined) sx = r.min + Math.random() * (r.max - r.min);
            used.push(sx);
            peaks.push({
                sx, z, side: sx < ch.gx ? 'left' : 'right',
                type: TYPES[Math.floor(Math.random() * TYPES.length)],
                h: 0.2 + Math.random() * 0.45,
                w: 0.08 + Math.random() * 0.20,
                r: 0.08 + Math.random() * 0.4,
                d: 0.1 + Math.random() * 0.3,
            });
        }
        return peaks;
    }

    // ==== 建造/重建 ====
    _build(diff) {
        this.difficulty = Math.min(1, Math.max(0, diff));
        this.peaks = []; this.gates = []; this.coins = [];
        this.birds = []; this.trees = []; this.clouds = [];
        const count = 8 + Math.floor(this.difficulty * 6);
        const sp = MAX_Z / Math.max(1, count);
        for (let i = 0; i < count; i++) {
            const z = 3 + i * sp;
            this.peaks.push(...this._genPeaks(z));
            const ch = this._channel(z);
            this.gates.push({ z, x: ch.gx, y: ch.gy, r: 0.05, ok: false, gl: 0 });
        }
        for (let i = 0; i < 20; i++) {
            const z = 2 + i * 0.6;
            const ch = this._channel(z);
            this.coins.push({ z, x: ch.gx + (Math.random()-0.5)*0.15, y: ch.gy + (Math.random()-0.5)*0.10, ok: false, ph: Math.random()*Math.PI*2 });
        }
        for (let i = 0; i < 5; i++) this.birds.push({ z: Math.random()*MAX_Z, x: 0.2+Math.random()*0.6, y: 0.15+Math.random()*0.5, vx: (Math.random()-0.5)*0.015, vy: (Math.random()-0.5)*0.01, wp: Math.random()*Math.PI*2, sz: 0.012+Math.random()*0.015 });
        for (let i = 0; i < 20; i++) { const s = Math.random()<0.5?'left':'right'; this.trees.push({ side:s, sx: s==='left'?0.01+Math.random()*0.06:0.94+Math.random()*0.06, z: i*0.6, h: 0.02+Math.random()*0.05, sw: Math.random()*Math.PI*2 }); }
        for (let i = 0; i < 8; i++) this.clouds.push({ x: Math.random(), y: 0.03+Math.random()*0.15, s: 0.5+Math.random()*1.2, a: 0.1+Math.random()*0.12, spd: (Math.random()-0.5)*0.005 });
    }

    updatePeakDensity(n, g) { this._build(this.difficulty); }
    updateSpeedMultiplier(m) { this.speedMul = m; }
    setPlaneTarget(p, r) { this.planeState.tp = Math.max(-30, Math.min(30, p)); this.planeState.tr = Math.max(-40, Math.min(40, r)); }
    setPlanePosition(x, y) { this.planeX = x; this.planeY = y; }

    // ==== 更新 ====
    update(dt) {
        super.update(dt); this.time += dt;
        const s = 1.2 * this.speedMul * dt;
        // 难度随时间递增
        this.difficulty = Math.min(1, this.time / 40);

        for (const p of this.peaks) { p.z -= s; if (p.z < -0.5) { const z = MAX_Z + Math.random()*2; const np = this._genPeaks(z); if (np.length > 0) Object.assign(p, np[0]); else p.z = MAX_Z + 5; } }
        for (const g of this.gates) { g.z -= s; if (g.z < -0.5) { const ch = this._channel(MAX_Z+Math.random()); Object.assign(g, { z: MAX_Z+Math.random(), x: ch.gx, y: ch.gy, r: 0.05, ok: false, gl: 0 }); } g.gl = Math.max(0, g.gl - dt*2); }
        for (const c of this.coins) { c.z -= s; c.ph += dt*4; if (c.z < -0.5) { const ch = this._channel(MAX_Z+Math.random()); Object.assign(c, { z: MAX_Z+Math.random(), x: ch.gx+(Math.random()-0.5)*0.15, y: ch.gy+(Math.random()-0.5)*0.10, ok: false, ph: Math.random()*Math.PI*2 }); } }
        for (const b of this.birds) { b.z -= s; b.x += b.vx*dt; b.y += b.vy*dt; b.wp += dt*8; if (b.x<0.08||b.x>0.92) b.vx*=-1; if (b.y<0.08||b.y>0.6) b.vy*=-1; if (b.z<-0.5) Object.assign(b, { z:MAX_Z+Math.random(), x:0.2+Math.random()*0.6, y:0.15+Math.random()*0.5, vx:(Math.random()-0.5)*0.015, vy:(Math.random()-0.5)*0.01, wp:Math.random()*Math.PI*2, sz:0.012+Math.random()*0.015 }); }
        for (const t of this.trees) { t.z -= s; t.sw += dt*2; if (t.z<-0.5) { t.z=MAX_Z+Math.random(); t.sx=t.side==='left'?0.01+Math.random()*0.06:0.94+Math.random()*0.06; t.h=0.02+Math.random()*0.05; t.sw=Math.random()*Math.PI*2; } }
        for (const c of this.clouds) { c.x += c.spd*dt; if (c.x>1.3) c.x=-0.3; if (c.x<-0.3) c.x=1.3; }

        const ps = this.config.smooth;
        this.planeState.pitch += (this.planeState.tp - this.planeState.pitch) * ps;
        this.planeState.roll += (this.planeState.tr - this.planeState.roll) * ps;
        if (Math.abs(this.planeState.tp) < 0.1) this.planeState.pitch *= 0.99;
        if (Math.abs(this.planeState.tr) < 0.1) this.planeState.roll *= 0.99;
    }

    // ==== 碰撞：X+Y双轴检测，使用透视投影 ====
    checkPlayerMountainCollision(px, py, pr, w, h) {
        const hY = h * 0.35;
        for (const p of this.peaks) {
            if (p.z < 0.05 || p.z > 0.35) continue;
            const pp = this._proj(p.z, w, h, hY);
            // 山在屏幕上的Y范围
            const mtnH = h * p.h * pp.ps;
            const mtnBaseY = pp.y;
            const mtnTopY = mtnBaseY - mtnH;
            // 玩家屏幕Y
            const playerScreenY = py * h;
            // 玩家必须在山的垂直范围内
            if (playerScreenY < mtnTopY || playerScreenY > mtnBaseY) continue;
            // 山在屏幕上的X范围
            const xSpread = 0.3 + (1 - pp.t) * 0.7;
            const mx = 0.5 + (p.sx - 0.5) * xSpread;
            const hw = p.w * 0.5 * pp.ps * 0.8;
            const playerScreenX = px * w;
            const mountainScreenX = mx * w;
            if (playerScreenX > mountainScreenX - hw - pr * w && playerScreenX < mountainScreenX + hw + pr * w) return true;
        }
        return false;
    }
    checkGatePassage(px, py, w, h) {
        const hY = h * 0.35; const out = [];
        for (const g of this.gates) {
            if (g.ok || g.z < -0.2 || g.z > 1.0) continue;
            const pg = this._proj(g.z, w, h, hY);
            const dx = px*w - g.x*w, dy = py*h - g.y*h;
            if (Math.sqrt(dx*dx+dy*dy) < g.r*Math.min(w,h)*pg.ps) { g.ok=true; g.gl=1; out.push(g); }
        }
        return out;
    }
    checkCoinCollect(px, py, w, h) {
        const hY = h*0.35; const out = [];
        for (const c of this.coins) {
            if (c.ok || c.z<-0.2||c.z>0.8) continue;
            const pg = this._proj(c.z, w, h, hY);
            if (Math.abs(px-c.x)*w < 0.03*w && Math.abs(py-c.y)*h < 0.04*h) { c.ok=true; out.push(c); }
        }
        return out;
    }

    _proj(z, w, h, hY) {
        const t = Math.max(0, Math.min(1, z/MAX_Z));
        const ps = 0.2 + (1-t)*1.6;
        const y = hY + (h-hY)*(1-t);
        return { t, ps, y };
    }

    // ==== 渲染 ====
    renderBackground(ctx, w, h) {
        const hY = h * 0.35;
        // 日落天空
        const sk = ctx.createLinearGradient(0, 0, 0, hY);
        sk.addColorStop(0, '#0a1628'); sk.addColorStop(0.3, '#1a3050'); sk.addColorStop(0.6, '#3a6080');
        sk.addColorStop(0.85, '#d4884a'); sk.addColorStop(1, '#e8b868');
        ctx.fillStyle = sk; ctx.fillRect(0, 0, w, hY);
        // 太阳
        const sunX = w * 0.7, sunY = hY * 0.6;
        for (let i = 3; i >= 0; i--) {
            const r = 35 + i * 20, a = 0.06 - i * 0.015;
            const gr = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
            gr.addColorStop(0, `rgba(255,240,210,${a})`); gr.addColorStop(1, 'transparent');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, Math.PI*2); ctx.fill();
        }
        // 云层
        for (const c of this.clouds) {
            ctx.fillStyle = `rgba(255,250,240,${c.a})`;
            const cx = c.x * w, cy = c.y * h, r = c.s * 45;
            ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx - r*0.5, cy + r*0.05, r*0.55, r*0.22, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + r*0.35, cy + r*0.03, r*0.45, r*0.18, 0, 0, Math.PI*2); ctx.fill();
        }
        // 地面渐变
        const gd = ctx.createLinearGradient(0, hY, 0, h);
        gd.addColorStop(0, '#6a8a3a'); gd.addColorStop(0.3, '#4a6a2a'); gd.addColorStop(0.7, '#2a4a1a'); gd.addColorStop(1, '#0a1a08');
        ctx.fillStyle = gd; ctx.fillRect(0, hY, w, h-hY);
        this._grid(ctx, w, h, hY);
        // 地面纹理：随机草丛斑点
        ctx.fillStyle = 'rgba(80,120,50,0.06)';
        for (let i = 0; i < 30; i++) {
            const gx = Math.random() * w, gy = hY + Math.random() * (h - hY);
            ctx.beginPath(); ctx.arc(gx, gy, 3 + Math.random() * 6, 0, Math.PI*2); ctx.fill();
        }

        const items = [];
        for (const p of this.peaks) items.push({ cat:'p', ...p });
        for (const g of this.gates) if(!g.ok) items.push({ cat:'g', ...g });
        for (const c of this.coins) if(!c.ok) items.push({ cat:'c', ...c });
        for (const b of this.birds) items.push({ cat:'b', ...b });
        for (const t of this.trees) items.push({ cat:'t', ...t });
        items.sort((a,b) => b.z - a.z);
        for (const it of items) {
            switch(it.cat) {
                case 'p': this._peak(ctx,w,h,hY,it); break;
                case 'g': this._gate(ctx,w,h,hY,it); break;
                case 'c': this._coin(ctx,w,h,hY,it); break;
                case 'b': this._bird(ctx,w,h,hY,it); break;
                case 't': this._tree(ctx,w,h,hY,it); break;
            }
        }
    }

    _grid(ctx, w, h, hY) {
        const cx = w/2;
        for (let i=0;i<12;i++) { const t=i/12, y=hY+(h-hY)*Math.pow(t,1.3); ctx.strokeStyle=`rgba(50,75,30,${t*0.25})`; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx-w*0.5*(0.15+t*0.85),y); ctx.lineTo(cx+w*0.5*(0.15+t*0.85),y); ctx.stroke(); }
        for (let i=-8;i<=8;i++) { ctx.strokeStyle='rgba(40,60,20,0.08)'; ctx.beginPath(); ctx.moveTo(cx+i*w*0.06,h); ctx.lineTo(cx,hY); ctx.stroke(); }
    }

    _peak(ctx, w, h, hY, p) {
        if (p.z<-0.5||p.z>MAX_Z) return;
        const pp = this._proj(p.z,w,h,hY);
        const mh = h*p.h*pp.ps, hw = w*p.w*0.5*pp.ps, x = p.sx*w, by = pp.y, ty = by-mh;
        if (x+hw<-50||x-hw>w+50) return;
        const fade = Math.min(1, (MAX_Z-p.z)/2);
        const a = Math.min(1, fade*(0.5+p.d*0.5));
        const b = 1-p.d*0.2;
        // 更丰富的山体颜色：远处偏蓝灰，近处偏暖绿
        const t = pp.t;
        const R = Math.round(45*b + t*20), G = Math.round(75*b + t*30), B = Math.round(35*b + t*10);
        const danger = p.z<0.4 ? Math.max(0,(0.4-p.z)/0.4) : 0;
        // 山体阴影
        ctx.beginPath(); ctx.moveTo(x-hw,by); ctx.quadraticCurveTo(x-hw*0.25,ty+mh*p.r*0.4,x,ty); ctx.quadraticCurveTo(x+hw*0.25,ty+mh*p.r*0.4,x+hw,by); ctx.closePath();
        const grad = ctx.createLinearGradient(x-hw, by, x+hw, by);
        grad.addColorStop(0, `rgba(${Math.round(R*0.6)},${Math.round(G*0.6)},${Math.round(B*0.6)},${a})`);
        grad.addColorStop(0.5, `rgba(${R},${G},${B},${a})`);
        grad.addColorStop(1, `rgba(${Math.round(R*0.7)},${Math.round(G*0.7)},${Math.round(B*0.7)},${a})`);
        if (danger>0.05) { ctx.shadowColor=`rgba(255,50,20,${danger*0.6})`; ctx.shadowBlur=6+danger*14; }
        ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur=0;
        // 轮廓线
        ctx.strokeStyle = `rgba(${R+20},${G+15},${B+5},${a*0.4})`; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(x-hw,by); ctx.quadraticCurveTo(x-hw*0.25,ty+mh*p.r*0.4,x,ty); ctx.quadraticCurveTo(x+hw*0.25,ty+mh*p.r*0.4,x+hw,by); ctx.stroke();
        // 接近时红光预警
        if (danger>0.15) { ctx.strokeStyle=`rgba(255,60,25,${danger})`; ctx.lineWidth=1.5+danger*3; ctx.beginPath(); ctx.moveTo(x-hw,by); ctx.quadraticCurveTo(x-hw*0.25,ty+mh*p.r*0.4,x,ty); ctx.quadraticCurveTo(x+hw*0.25,ty+mh*p.r*0.4,x+hw,by); ctx.stroke(); }
        // 雪顶
        if (p.h>0.4 && p.z<4) { const sa=a*(p.z<2?0.7:(4-p.z)/2*0.7), sw=hw*0.3; ctx.fillStyle=`rgba(245,250,255,${sa})`; ctx.beginPath(); ctx.moveTo(x-sw,ty+mh*0.06); ctx.quadraticCurveTo(x,ty-mh*0.02,x+sw,ty+mh*0.06); ctx.quadraticCurveTo(x,ty+mh*0.14,x-sw,ty+mh*0.06); ctx.fill(); }
    }

    _gate(ctx, w, h, hY, g) {
        if (g.ok||g.z<-0.2||g.z>MAX_Z) return;
        const pp = this._proj(g.z,w,h,hY), sx=g.x*w, sy=g.y*h, sr=g.r*Math.min(w,h)*pp.ps, a=0.4+g.gl*0.6;
        ctx.strokeStyle = g.gl>0?`rgba(255,255,150,${a})`:`rgba(0,230,180,${a})`;
        ctx.lineWidth=1.5+g.gl*3; ctx.shadowColor=g.gl>0?'#ffff88':'#00ffcc'; ctx.shadowBlur=6+g.gl*12;
        ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle = g.gl>0?`rgba(255,255,180,${a*0.6})`:`rgba(0,255,200,${a*0.6})`; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(sx,sy,sr*0.5,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0;
    }

    _coin(ctx, w, h, hY, c) {
        if (c.ok||c.z<-0.2||c.z>MAX_Z) return;
        const pp = this._proj(c.z,w,h,hY), sx=c.x*w, sy=c.y*h, sr=0.012*Math.min(w,h)*pp.ps;
        const pulse=0.6+0.4*Math.sin(c.ph), a=0.5+pulse*0.5;
        ctx.shadowColor='#ffd700'; ctx.shadowBlur=4+pulse*3;
        ctx.fillStyle=`rgba(255,215,0,${a})`; ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    }

    _bird(ctx, w, h, hY, b) {
        if (b.z<-0.2||b.z>MAX_Z) return;
        const pp = this._proj(b.z,w,h,hY), sx=b.x*w, sy=b.y*h, sr=b.sz*Math.min(w,h)*pp.ps;
        const wing=Math.sin(b.wp)*sr*1.8;
        ctx.strokeStyle='rgba(40,40,40,0.6)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(sx-sr,sy-wing,sx-sr*1.3,sy-wing*0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(sx+sr,sy-wing,sx+sr*1.3,sy-wing*0.3); ctx.stroke();
        ctx.fillStyle='rgba(50,50,50,0.5)'; ctx.beginPath(); ctx.ellipse(sx,sy,sr*0.4,sr*0.15,0,0,Math.PI); ctx.fill();
    }

    _tree(ctx, w, h, hY, t) {
        if (t.z<-0.2||t.z>MAX_Z) return;
        const pp = this._proj(t.z,w,h,hY), th=h*t.h*pp.ps, tw=4*pp.ps, sx=t.sx*w, by=pp.y;
        const sw=Math.sin(t.sw)*1.5;
        ctx.save(); ctx.translate(sx,by); ctx.rotate(sw*Math.PI/180);
        ctx.fillStyle='#3a2010'; ctx.fillRect(-tw*0.3,-th,tw*0.6,th);
        ctx.fillStyle='#2a5a18'; ctx.beginPath(); ctx.arc(0,-th-tw*0.8,tw*1.2,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }

    renderPlayer(ctx, px, py) {
        const sx=px*ctx.canvas.width, sy=py*ctx.canvas.height, sz=0.08*Math.min(ctx.canvas.width,ctx.canvas.height);
        const rd=this.planeState.roll, pd=this.planeState.pitch;
        ctx.save(); ctx.translate(sx,sy); ctx.rotate(rd*Math.PI/180); ctx.scale(1,1+pd*0.012);
        for (const s of [-1,1]) { const fx=s*sz*0.35, fy=sz*0.32, fw=sz*0.16, fh=fw*4; const gr=ctx.createLinearGradient(fx,fy,fx,fy+fh); gr.addColorStop(0,'rgba(255,255,255,0.8)'); gr.addColorStop(0.12,'rgba(0,240,200,0.6)'); gr.addColorStop(0.35,'rgba(0,200,150,0.3)'); gr.addColorStop(1,'transparent'); ctx.fillStyle=gr; ctx.beginPath(); ctx.moveTo(fx-fw,fy); ctx.quadraticCurveTo(fx+(Math.random()-0.5)*fw*0.3,fy+fh*0.5,fx,fy+fh*(0.4+Math.random()*0.4)); ctx.quadraticCurveTo(fx+(Math.random()-0.5)*fw*0.3,fy+fh*0.5,fx+fw,fy); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle='#ff3366'; ctx.shadowColor='#ff3366'; ctx.shadowBlur=6; ctx.beginPath(); ctx.arc(-sz*1.2,sz*0.08,sz*0.04,0,Math.PI*2); ctx.arc(sz*1.2,sz*0.08,sz*0.04,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
        ctx.shadowColor='#00ffcc'; ctx.shadowBlur=15; ctx.fillStyle='#2a5a8a'; ctx.strokeStyle='#00ffcc'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(0,-sz); ctx.lineTo(-sz*0.45,-sz*0.25); ctx.lineTo(-sz*1.2,sz*0.08); ctx.lineTo(-sz*0.45,sz*0.25); ctx.lineTo(-sz*0.15,sz*0.4); ctx.lineTo(0,sz*0.35); ctx.lineTo(sz*0.15,sz*0.4); ctx.lineTo(sz*0.45,sz*0.25); ctx.lineTo(sz*1.2,sz*0.08); ctx.lineTo(sz*0.45,-sz*0.25); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
        const cg=ctx.createRadialGradient(0,-sz*0.35,0,0,-sz*0.35,sz*0.16); cg.addColorStop(0,'#88ffff'); cg.addColorStop(0.5,'#00d9a5'); cg.addColorStop(1,'#003333'); ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(0,-sz*0.35,sz*0.12,sz*0.16,0,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }

    getPlaneState() { return this.planeState; }
    cleanup() { super.cleanup(); }
}
