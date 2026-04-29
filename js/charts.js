// ============================================================
// CHARTS - Canvas图表绘制
// ============================================================

// 颜色配置
const CHART_COLORS = {
    position: '#00D9A5',  // 绿色 - 位置觉
    stability: '#F59E0B', // 黄色 - 稳定性
    rom: '#0086FF',       // 蓝色 - ROM
    coordination: '#8B5CF6', // 紫色 - 协调性
    grid: 'rgba(255, 255, 255, 0.1)',
    text: '#9CA3AF',
    fill: 'rgba(0, 217, 165, 0.2)'
};

// ============================================================
// 雷达图
// ============================================================

/**
 * 绘制雷达图
 * @param {HTMLCanvasElement} canvas - 画布元素
 * @param {object} scores - 评分数据 { position, stability, rom, coordination }
 * @param {number} size - 画布大小（正方形）
 */
function drawRadarChart(canvas, scores, size = 200) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // 设置画布尺寸
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const maxRadius = size * 0.38;
    const labels = ['位置觉', '稳定性', '活动范围', '协调性'];
    const values = [
        scores.position || 0,
        scores.stability || 0,
        scores.rom || 0,
        scores.coordination || 0
    ];
    const numAxes = labels.length;
    const angleStep = (Math.PI * 2) / numAxes;

    // 背景
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, size, size);

    // 绘制背景网格和轴
    for (let i = 0; i < numAxes; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = center + Math.cos(angle) * maxRadius;
        const y = center + Math.sin(angle) * maxRadius;

        // 轴线
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(x, y);
        ctx.strokeStyle = CHART_COLORS.grid;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 标签 - 调整位置确保完整显示
        const labelRadius = maxRadius + 18;
        const labelX = center + Math.cos(angle) * labelRadius;
        const labelY = center + Math.sin(angle) * labelRadius;
        ctx.font = '10px sans-serif';
        ctx.fillStyle = CHART_COLORS.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], labelX, labelY);
    }

    // 绘制背景多边形（网格）
    for (let level = 1; level <= 4; level++) {
        const radius = (maxRadius / 4) * level;
        ctx.beginPath();
        for (let i = 0; i <= numAxes; i++) {
            const angle = (i % numAxes) * angleStep - Math.PI / 2;
            const x = center + Math.cos(angle) * radius;
            const y = center + Math.sin(angle) * radius;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = CHART_COLORS.grid;
        ctx.lineWidth = level === 4 ? 1.5 : 0.5;
        ctx.stroke();
    }

    // 绘制数据多边形
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const radius = (values[i] / 100) * maxRadius;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS.fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 217, 165, 0.8)';  // 使用主色调
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制数据点
    for (let i = 0; i < numAxes; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const radius = (values[i] / 100) * maxRadius;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = getScoreColor(values[i]);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

// ============================================================
// 折线图 - ROM六方向
// ============================================================

/**
 * 绘制ROM折线图
 * @param {HTMLCanvasElement} canvas - 画布元素
 * @param {object} romData - ROM数据 { 前屈, 后伸, 左旋, 右旋, 左屈, 右屈 }
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 */
function drawROMChart(canvas, romData, width = 280, height = 120) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // 设置画布尺寸
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    const labels = ['前屈', '后伸', '左旋', '右旋', '左屈', '右屈'];
    const normalValues = [45, 45, 80, 80, 45, 45];  // 正常范围
    const values = labels.map(l => romData[l] !== undefined ? Math.abs(romData[l]) : 0);

    const padding = { top: 15, right: 15, bottom: 30, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 计算比例
    const maxValue = 100;  // 固定最大值，便于比较
    const yScale = chartHeight / maxValue;

    // Y轴网格和标签
    ctx.font = '10px sans-serif';
    ctx.fillStyle = CHART_COLORS.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        const value = maxValue - (maxValue / 4) * i;

        // 网格线
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.strokeStyle = CHART_COLORS.grid;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // 标签
        ctx.fillText(value + '°', padding.left - 5, y);
    }

    // X轴标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = chartWidth / (labels.length - 1);
    labels.forEach((label, i) => {
        const x = padding.left + i * xStep;
        ctx.fillText(label, x, height - padding.bottom + 8);
    });

    // 绘制数据线
    ctx.beginPath();
    values.forEach((v, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + (1 - v / maxValue) * chartHeight;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.strokeStyle = CHART_COLORS.rom;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制数据点
    values.forEach((v, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + (1 - v / maxValue) * chartHeight;

        // 绘制数据点
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = getROMColor(v, normalValues[i]);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 绘制正常范围参考线（虚线）
        const normalY = padding.top + (1 - normalValues[i] / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(padding.left + (i - 0.3) * xStep, normalY);
        ctx.lineTo(padding.left + (i + 0.3) * xStep, normalY);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    });
}

// 获取评分颜色
function getScoreColor(score) {
    if (score >= 80) return '#10B981';  // success
    if (score >= 60) return '#F59E0B';  // warning
    return '#EF4444';  // danger
}

// 获取ROM颜色
function getROMColor(value, normal) {
    const ratio = value / normal;
    if (ratio >= 0.8) return '#10B981';  // 正常
    if (ratio >= 0.5) return '#F59E0B';  // 轻度受限
    return '#EF4444';  // 明显受限
}

// ============================================================
// 在结果弹窗中集成图表
// ============================================================

/**
 * 在结果弹窗中绘制图表
 * @param {object} scores - 评分数据
 * @param {object} romData - ROM数据（可选）
 */
function drawResultCharts(scores, romData = null) {
    // 绘制雷达图
    const radarCanvas = document.getElementById('radar-chart');
    if (radarCanvas) {
        const hasData = scores.position > 0 || scores.stability > 0 || scores.rom > 0 || scores.coordination > 0;
        if (hasData) {
            drawRadarChart(radarCanvas, scores, 180);
        }
    }

    // 绘制ROM折线图
    const romCanvas = document.getElementById('rom-chart');
    if (romCanvas && romData && Object.keys(romData).length > 0) {
        drawROMChart(romCanvas, romData, 280, 100);
    }
}

window.drawRadarChart = drawRadarChart;
window.drawROMChart = drawROMChart;