// ============================================================
// CAR RENDERER - 俯视视角车体绘制
// 被 SceneRoad（玩家车）和 ObstacleVehicle（障碍车）共享
// ============================================================

/**
 * 俯视视角车体绘制
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px 车体中心 X（像素）
 * @param {number} py 车体中心 Y（像素）
 * @param {number} carW 车身宽
 * @param {number} carH 车身长（车头到车尾）
 * @param {object} opts { body, trim, windowTint, carType, isPlayer }
 */
export function drawCarTopDown(ctx, px, py, carW, carH, opts = {}) {
    const {
        body = '#3B82F6',
        trim = '#1E40AF',
        windowTint = 'rgba(186,230,253,0.85)',
        carType = 'sedan',
        isPlayer = false
    } = opts;

    // 车体比例（按车型）
    let w = carW, h = carH;
    if (carType === 'suv') { w *= 1.12; h *= 0.92; }
    if (carType === 'sports') { w *= 0.88; h *= 1.12; }

    ctx.save();

    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(px + 5, py + h * 0.48 + 3, w * 0.55, h * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    // 车体底框（保险杠包围，trim 色）
    ctx.fillStyle = trim;
    _roundRect(ctx, px - w / 2, py - h / 2, w, h, w * 0.16);
    ctx.fill();

    // 主车体（车顶色）
    ctx.fillStyle = body;
    _roundRect(ctx, px - w / 2 + 3, py - h / 2 + 3, w - 6, h - 6, w * 0.14);
    ctx.fill();

    // 引擎盖（车头，靠近屏幕上沿）
    const hoodTop = py - h * 0.48;
    const hoodBot = py - h * 0.18;
    ctx.fillStyle = _shadeColor(body, -12);
    ctx.beginPath();
    ctx.moveTo(px - w * 0.40, hoodTop);
    ctx.lineTo(px + w * 0.40, hoodTop);
    ctx.lineTo(px + w * 0.44, hoodBot);
    ctx.lineTo(px - w * 0.44, hoodBot);
    ctx.closePath();
    ctx.fill();

    // 引擎盖高光
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.36, hoodTop + 1);
    ctx.lineTo(px - w * 0.08, hoodTop + 1);
    ctx.lineTo(px - w * 0.14, hoodBot - 2);
    ctx.lineTo(px - w * 0.36, hoodBot - 2);
    ctx.closePath();
    ctx.fill();

    // 前挡风玻璃
    ctx.fillStyle = windowTint;
    ctx.beginPath();
    ctx.moveTo(px - w * 0.42, py - h * 0.17);
    ctx.lineTo(px + w * 0.42, py - h * 0.17);
    ctx.lineTo(px + w * 0.38, py - h * 0.03);
    ctx.lineTo(px - w * 0.38, py - h * 0.03);
    ctx.closePath();
    ctx.fill();
    // 玻璃反光
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(px - w * 0.38, py - h * 0.16);
    ctx.lineTo(px - w * 0.04, py - h * 0.16);
    ctx.lineTo(px - w * 0.10, py - h * 0.05);
    ctx.lineTo(px - w * 0.38, py - h * 0.05);
    ctx.closePath();
    ctx.fill();

    // 车顶中央色块
    ctx.fillStyle = _shadeColor(body, -18);
    ctx.fillRect(px - w * 0.34, py - h * 0.02, w * 0.68, h * 0.36);

    // 车顶高光
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(px - w * 0.30, py + h * 0.01, w * 0.10, h * 0.30);

    // 后挡风玻璃
    ctx.fillStyle = windowTint;
    ctx.fillRect(px - w * 0.38, py + h * 0.34, w * 0.76, h * 0.10);
    // 后挡风玻璃反光
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(px - w * 0.34, py + h * 0.345, w * 0.30, h * 0.04);

    // 后备箱
    ctx.fillStyle = _shadeColor(body, -6);
    ctx.fillRect(px - w * 0.38, py + h * 0.44, w * 0.76, h * 0.05);

    // 中央腰线
    ctx.strokeStyle = _shadeColor(body, -25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - w * 0.45, py);
    ctx.lineTo(px + w * 0.45, py);
    ctx.stroke();

    // 左右侧窗（前后两片）
    ctx.fillStyle = windowTint;
    ctx.fillRect(px - w * 0.46, py - h * 0.05, w * 0.11, h * 0.13);
    ctx.fillRect(px - w * 0.46, py + h * 0.10, w * 0.11, h * 0.13);
    ctx.fillRect(px + w * 0.35, py - h * 0.05, w * 0.11, h * 0.13);
    ctx.fillRect(px + w * 0.35, py + h * 0.10, w * 0.11, h * 0.13);

    // 后视镜
    ctx.fillStyle = trim;
    ctx.fillRect(px - w * 0.52, py - h * 0.06, w * 0.07, h * 0.06);
    ctx.fillRect(px + w * 0.45, py - h * 0.06, w * 0.07, h * 0.06);

    // 灯
    if (isPlayer) {
        // 玩家：大灯光晕 + 大灯
        const glow1 = ctx.createRadialGradient(px - w * 0.30, py - h * 0.50, 0, px - w * 0.30, py - h * 0.50, 22);
        glow1.addColorStop(0, 'rgba(254,240,138,0.95)');
        glow1.addColorStop(0.5, 'rgba(254,240,138,0.3)');
        glow1.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = glow1;
        ctx.fillRect(px - w * 0.55, py - h * 0.75, w * 0.5, h * 0.5);
        const glow2 = ctx.createRadialGradient(px + w * 0.30, py - h * 0.50, 0, px + w * 0.30, py - h * 0.50, 22);
        glow2.addColorStop(0, 'rgba(254,240,138,0.95)');
        glow2.addColorStop(0.5, 'rgba(254,240,138,0.3)');
        glow2.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = glow2;
        ctx.fillRect(px + w * 0.05, py - h * 0.75, w * 0.5, h * 0.5);
        // 大灯本体
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(px - w * 0.38, py - h * 0.51, w * 0.18, h * 0.05);
        ctx.fillRect(px + w * 0.20, py - h * 0.51, w * 0.18, h * 0.05);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(px - w * 0.34, py - h * 0.50, w * 0.10, h * 0.025);
        ctx.fillRect(px + w * 0.24, py - h * 0.50, w * 0.10, h * 0.025);
        // 进气格栅
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(px - w * 0.14, py - h * 0.51, w * 0.28, h * 0.04);
        ctx.fillStyle = '#475569';
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(px - w * 0.13 + i * w * 0.055, py - h * 0.505, w * 0.02, h * 0.02);
        }
    } else {
        // 障碍车：前大灯（车头朝前 — 即使在远端也是车头标识）
        const gh1 = ctx.createRadialGradient(px - w * 0.30, py - h * 0.50, 0, px - w * 0.30, py - h * 0.50, 10);
        gh1.addColorStop(0, 'rgba(254,240,138,0.55)');
        gh1.addColorStop(0.6, 'rgba(254,240,138,0.12)');
        gh1.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = gh1;
        ctx.fillRect(px - w * 0.45, py - h * 0.65, w * 0.35, h * 0.3);
        const gh2 = ctx.createRadialGradient(px + w * 0.30, py - h * 0.50, 0, px + w * 0.30, py - h * 0.50, 10);
        gh2.addColorStop(0, 'rgba(254,240,138,0.55)');
        gh2.addColorStop(0.6, 'rgba(254,240,138,0.12)');
        gh2.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = gh2;
        ctx.fillRect(px + w * 0.10, py - h * 0.65, w * 0.35, h * 0.3);
        // 大灯本体
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(px - w * 0.38, py - h * 0.51, w * 0.18, h * 0.05);
        ctx.fillRect(px + w * 0.20, py - h * 0.51, w * 0.18, h * 0.05);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(px - w * 0.34, py - h * 0.50, w * 0.08, h * 0.02);
        ctx.fillRect(px + w * 0.26, py - h * 0.50, w * 0.08, h * 0.02);
        // 尾灯（双闪红，给"刹车中"信号）
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(px - w * 0.38, py + h * 0.46, w * 0.16, h * 0.04);
        ctx.fillRect(px + w * 0.22, py + h * 0.46, w * 0.16, h * 0.04);
    }

    // 车轮（4 个，从四角突出）
    ctx.fillStyle = '#0F172A';
    const tw = w * 0.13, th = h * 0.18;
    const txOff = w * 0.46, tyOff = h * 0.30;
    // 左前
    ctx.fillRect(px - txOff - tw / 2, py - tyOff - th / 2, tw, th);
    // 右前
    ctx.fillRect(px + txOff - tw / 2, py - tyOff - th / 2, tw, th);
    // 左后
    ctx.fillRect(px - txOff - tw / 2, py + tyOff - th / 2, tw, th);
    // 右后
    ctx.fillRect(px + txOff - tw / 2, py + tyOff - th / 2, tw, th);

    // 车体描边
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.2;
    _roundRect(ctx, px - w / 2, py - h / 2, w, h, w * 0.16);
    ctx.stroke();

    ctx.restore();
}

// ============================================================
// 工具函数
// ============================================================
function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function _shadeColor(hex, percent) {
    if (hex.startsWith('rgb')) return hex;
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const factor = 1 + percent / 100;
    const nr = Math.max(0, Math.min(255, Math.round(r * factor)));
    const ng = Math.max(0, Math.min(255, Math.round(g * factor)));
    const nb = Math.max(0, Math.min(255, Math.round(b * factor)));
    return `rgb(${nr},${ng},${nb})`;
}
