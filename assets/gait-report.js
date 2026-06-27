/* global window, document, html2canvas, jspdf */
/**
 * gait-report.js — 步态分析报告渲染模块
 *
 * 职责:
 *  - Canvas 图表渲染 (参数对比/不对称/相位饼图)
 *  - PDF 导出 (html2canvas + jsPDF)
 *  - 历史记录详情查看
 *
 * 暴露 API: window.__gaitReport.{exportPDF, renderCharts, ...}
 */
(function () {
  'use strict';

  if (!window.__gaitParams) {
    console.error('[gait-report] __gaitParams not loaded');
    return;
  }

  var NORMAL = window.__gaitParams.NORMAL;
  var colorMap = { normal: '#10b981', mild: '#f59e0b', moderate: '#f97316', severe: '#dc2626' };
  var statusTextMap = { normal: '正常', mild: '轻度', moderate: '中度', severe: '重度' };

  // ============================================================
  // 工具
  // ============================================================
  function $(sel) { return document.querySelector(sel); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (k === 'className') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.substr(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function fmtNum(v, d) { if (v == null || isNaN(v)) return '—'; return Number(v).toFixed(d == null ? 2 : d); }

  // ============================================================
  // 图表 1: 参数对比条形图 (实测 vs 正常范围)
  // ============================================================
  function renderParamBarChart(canvas, params) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600;
    var h = canvas.clientHeight || 320;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var keys = ['stepLength', 'strideLength', 'stepWidth', 'footAngle', 'cadence', 'gaitSpeed', 'stancePct', 'swingPct'];
    var labels = { stepLength: '步长(m)', strideLength: '步幅(m)', stepWidth: '步宽(m)', footAngle: '足偏角(°)', cadence: '步频(步/分)', gaitSpeed: '步速(m/s)', stancePct: '支撑相(%)', swingPct: '摆动相(%)' };
    var rows = keys.length;
    var rowH = (h - 30) / rows;
    var labelW = 90;
    var barX = labelW + 10;
    var barMaxW = w - barX - 60;

    ctx.font = '12px sans-serif';
    keys.forEach(function (k, i) {
      var p = params[k];
      if (!p) return;
      var n = p.normal;
      var y = 20 + i * rowH + rowH / 2;

      // 标签
      ctx.fillStyle = '#333';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[k], labelW, y);

      // 正常范围背景 (灰色)
      var minX = barX + (n.min / Math.max(n.max * 1.5, 1)) * barMaxW;
      var maxX = barX + (n.max / Math.max(n.max * 1.5, 1)) * barMaxW;
      var scaleMax = Math.max(n.max * 1.5, p.value * 1.2, 1);
      minX = barX + (n.min / scaleMax) * barMaxW;
      maxX = barX + (n.max / scaleMax) * barMaxW;
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(minX, y - 6, maxX - minX, 12);

      // 正常范围标签
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.font = '10px sans-serif';
      ctx.fillText(n.min + '~' + n.max, minX, y - 12);

      // 实测值条
      var v = p.value;
      var vX = barX + (v / scaleMax) * barMaxW;
      var vClampedX = Math.min(vX, barX + barMaxW);
      var color = colorMap[p.status] || '#9ca3af';
      ctx.fillStyle = color;
      ctx.fillRect(barX, y - 5, vClampedX - barX, 10);

      // 数值标签
      ctx.fillStyle = '#1a1a2e';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(fmtNum(v, 2), Math.min(vClampedX + 4, w - 50), y);
    });

    // 标题
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('步态参数 (实测 vs 正常范围)', 8, 4);
  }

  // ============================================================
  // 图表 2: 不对称条形图 (L vs R)
  // ============================================================
  function renderAsymmetryChart(canvas, params) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600;
    var h = canvas.clientHeight || 280;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var items = [
      { label: '步长', L: params.stepLength.left, R: params.stepLength.right, unit: 'm' },
      { label: '步幅', L: params.strideLength.left, R: params.strideLength.right, unit: 'm' },
      { label: '足偏角', L: params.footAngle.left, R: params.footAngle.right, unit: '°' }
    ];

    var groupW = (w - 60) / items.length;
    var maxVal = 0;
    items.forEach(function (it) {
      if (it.L) maxVal = Math.max(maxVal, it.L);
      if (it.R) maxVal = Math.max(maxVal, it.R);
    });
    if (maxVal === 0) maxVal = 1;
    var chartH = h - 60;

    items.forEach(function (it, idx) {
      var x0 = 30 + idx * groupW;
      var midX = x0 + groupW / 2;
      var barW = (groupW - 20) / 2;

      // L 柱
      var lH = (it.L || 0) / maxVal * chartH;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(midX - barW - 2, h - 30 - lH, barW, lH);
      ctx.fillStyle = '#1a1a2e';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (it.L) ctx.fillText(fmtNum(it.L, 2), midX - barW / 2 - 1, h - 30 - lH - 2);

      // R 柱
      var rH = (it.R || 0) / maxVal * chartH;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(midX + 2, h - 30 - rH, barW, rH);
      if (it.R) ctx.fillText(fmtNum(it.R, 2), midX + barW / 2 + 1, h - 30 - rH - 2);

      // 标签
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(it.label, midX, h - 26);

      // 单位
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.fillText(it.unit, midX, h - 12);
    });

    // 图例
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(8, 8, 12, 12);
    ctx.fillStyle = '#1a1a2e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('左', 24, 14);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(50, 8, 12, 12);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillText('右', 66, 14);

    // 标题
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('左右对比', w - 8, 14);
  }

  // ============================================================
  // 图表 3: 步态周期相位饼图
  // ============================================================
  function renderPhasePieChart(canvas, params) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 300;
    var h = canvas.clientHeight || 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var stance = params.stancePct.value || 60;
    var swing = params.swingPct.value || 40;
    var doubleSup = params.doubleSupport.value || 11;
    var singleStance = Math.max(0, stance - doubleSup);
    var singleSwing = Math.max(0, swing);

    var cx = w / 2, cy = h / 2 + 5, r = Math.min(w, h) / 2 - 30;

    function slice(start, end, color) {
      var a0 = (start / 100) * Math.PI * 2 - Math.PI / 2;
      var a1 = (end / 100) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    var p = 0;
    slice(p, p + doubleSup, '#dc2626'); p += doubleSup;
    slice(p, p + singleStance, '#f59e0b'); p += singleStance;
    slice(p, p + singleSwing, '#10b981');

    // 中心数字
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtNum(stance, 0) + '%', cx, cy - 8);
    ctx.font = '11px sans-serif';
    ctx.fillText('支撑相', cx, cy + 12);

    // 图例
    var legendX = 10, legendY = 10;
    var items = [
      { color: '#dc2626', label: '双支撑期', val: fmtNum(doubleSup, 1) + '%' },
      { color: '#f59e0b', label: '单支撑相', val: fmtNum(singleStance, 1) + '%' },
      { color: '#10b981', label: '摆动相',   val: fmtNum(singleSwing, 1) + '%' }
    ];
    items.forEach(function (it, i) {
      var y = legendY + i * 16;
      ctx.fillStyle = it.color;
      ctx.fillRect(legendX, y, 10, 10);
      ctx.fillStyle = '#1a1a2e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label + ': ' + it.val, legendX + 14, y + 5);
    });
  }

  // ============================================================
  // 主入口: 在指定容器渲染完整报告
  // ============================================================
  function renderReport(data, containerEl) {
    if (!data || !data.parameters) {
      containerEl.innerHTML = '<p style="color:#888;text-align:center;padding:40px;">暂无报告数据 (此记录无参数)</p>';
      return;
    }
    var r = data;
    var c = r.classification || {};
    var n = r.neuro || {};
    var p = r.parameters;
    var asym = r.asymmetries || {};
    // 防御性: 确保 p 中关键字段存在
    ['gaitSpeed', 'cadence', 'stepLength', 'stepWidth', 'strideLength', 'footAngle', 'stancePct', 'swingPct', 'doubleSupport'].forEach(function (k) {
      if (!p[k]) p[k] = { value: 0, status: 'normal', unit: '' };
    });
    if (!c.primaryLabel) c.primaryLabel = c.primary || '—';

    var html = '';
    html += '<div style="background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;padding:24px;border-radius:12px;margin-bottom:16px;">' +
      '<h2 style="margin:0;font-size:22px;">🚶 步态分析报告</h2>' +
      '<div style="font-size:12px;opacity:0.9;margin-top:6px;">' + new Date(r.timestamp).toLocaleString('zh-CN') + '</div>' +
    '</div>';

    // 概览卡片
    var sr = r.sideResolution || {};
    html += '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;">' +
      '<h3 style="margin:0 0 12px 0;font-size:16px;">📋 概览</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">' +
        summaryCard('步速', fmtNum((p.gaitSpeed && p.gaitSpeed.value) || 0, 2), 'm/s', (p.gaitSpeed && colorMap[p.gaitSpeed.status]) || '#9ca3af') +
        summaryCard('步频', fmtNum((p.cadence && p.cadence.value) || 0, 0), '步/分', (p.cadence && colorMap[p.cadence.status]) || '#9ca3af') +
        summaryCard('步长', fmtNum((p.stepLength && p.stepLength.value) || 0, 2), 'm', (p.stepLength && colorMap[p.stepLength.status]) || '#9ca3af') +
        summaryCard('分类', c.primaryLabel || '—', '', '#0f7b6c') +
      '</div>' +
      // 左右标签诊断 + 手动交换
      '<div style="margin-top:8px;font-size:11px;color:#888;">' +
        '摄像头侧: <b>' + ((r.calibration && r.calibration.cameraSide) || '右') + '</b>' +
        ' | 步行方向: <b>' + (r.walkingDirection || '?') + '</b>' +
        ' | 算法交换: <b>' + (sr.swapNeeded ? '是' : '否') + '</b>' +
        (sr.reason ? ' (' + sr.reason + ')' : '') +
        ' | <span onclick="window.__gaitReport.manualSwap()" style="cursor:pointer;color:' + (r.swapped ? '#dc2626' : '#0f7b6c') + ';text-decoration:underline;">' + (r.swapped ? '恢复左右' : '手动交换左右') + '</span>' +
      '</div>' +
    '</div>';

    // 参数对比图
    html += '<div style="background:#fff;padding:16px;border-radius:12px;margin-bottom:14px;">' +
      '<canvas class="gait-chart" data-chart="param" style="width:100%;height:340px;"></canvas>' +
    '</div>';

    // 左右对比
    html += '<div style="background:#fff;padding:16px;border-radius:12px;margin-bottom:14px;">' +
      '<canvas class="gait-chart" data-chart="asymmetry" style="width:100%;height:300px;"></canvas>' +
    '</div>';

    // 相位饼图
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
      '<div style="background:#fff;padding:16px;border-radius:12px;">' +
        '<canvas class="gait-chart" data-chart="phase" style="width:100%;height:240px;"></canvas>' +
      '</div>' +
      '<div style="background:#fff;padding:20px;border-radius:12px;">' +
        '<h4 style="margin:0 0 10px 0;font-size:14px;">⚖️ 不对称指数</h4>' +
        ['stepLength','strideLength','footAngle','cadence','stance'].map(function (k) {
          var v = asym[k] || 0;
          var labelMap = { stepLength: '步长', strideLength: '步幅', footAngle: '足偏角', cadence: '步频', stance: '支撑相' };
          var c2 = v < 0.10 ? '#10b981' : v < 0.20 ? '#f59e0b' : '#dc2626';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
            '<span style="color:#666;font-size:13px;">' + labelMap[k] + '</span>' +
            '<span style="font-weight:700;color:' + c2 + ';">' + fmtNum(v * 100, 1) + '%</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';

    // 步态周期 8 时相 (Rancho Los Amigos)
    if (r.gaitPhases && !r.gaitPhases.error && r.gaitPhases.phases) {
      var gp = r.gaitPhases;
      html += '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 12px 0;font-size:16px;">🔄 步态周期时相 (Rancho Los Amigos 8 时相)</h3>' +
        '<div style="font-size:12px;color:#666;margin-bottom:12px;">检测到 <b>' + gp.totalCycles + '</b> 个完整步态周期 · 平均周期 <b>' + (gp.avgCycleTime ? gp.avgCycleTime.toFixed(2) : '—') + 's</b> · 共 <b>' + gp.events.length + '</b> 个步态事件 (HS + TO)</div>';
      // 阶段条
      var phases = [
        { key: 'IC',  name: '初始触地',  range: '0-2%' },
        { key: 'LR',  name: '承重反应',  range: '2-12%' },
        { key: 'MSt', name: '站立中期',  range: '12-31%' },
        { key: 'TSt', name: '推离前期',  range: '31-50%' },
        { key: 'PSw', name: '推离后期',  range: '50-62%' },
        { key: 'ISw', name: '摆动初期',  range: '62-75%' },
        { key: 'MSw', name: '摆动中期',  range: '75-87%' },
        { key: 'TSw', name: '摆动末期',  range: '87-100%' }
      ];
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">';
      phases.forEach(function (p) {
        var phaseData = gp.phases[p.key];
        var pct = (phaseData && typeof phaseData === 'object') ? (phaseData.pct || 0) : (phaseData || 0);
        var color = p.key === 'IC' || p.key === 'PSw' ? '#dc2626' :
                    p.key === 'LR' || p.key === 'TSt' ? '#f59e0b' :
                    p.key === 'MSt' || p.key === 'MSw' ? '#10b981' : '#3b82f6';
        html += '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-top:3px solid ' + color + ';">' +
          '<div style="color:#888;font-size:10px;">' + p.short + ' · ' + p.range + '</div>' +
          '<div style="font-size:13px;color:#333;font-weight:600;margin:2px 0;">' + p.name + '</div>' +
          '<div style="font-size:18px;font-weight:700;color:' + color + ';">' + (typeof pct === 'number' ? pct.toFixed(1) : '0.0') + '%</div>' +
        '</div>';
      });
      html += '</div>';
      // 步态事件列表 (前 12 个)
      if (gp.events && gp.events.length > 0) {
        var evtList = gp.events.slice(0, 12).map(function (e) {
          var side = (e.side && e.side.charAt) ? e.side.charAt(0).toUpperCase() : '?';
          return '<span style="display:inline-block;padding:3px 8px;margin:2px;background:' + (e.type === 'HS' ? '#dbeafe' : '#fef3c7') + ';border-radius:4px;font-size:11px;color:' + (e.type === 'HS' ? '#1e40af' : '#92400e') + ';">' +
            (e.type || '?') + ' ' + side + ' @ ' + (typeof e.time === 'number' ? e.time.toFixed(2) : '?') + 's</span>';
        }).join('');
        html += '<div style="padding:8px;background:#f0f2f5;border-radius:6px;line-height:1.8;">' +
          '<b style="font-size:12px;color:#333;">步态事件时间轴 (前 12 个):</b><br>' + evtList +
        '</div>';
      }
      html += '<div style="margin-top:10px;padding:8px 12px;background:#f0f2f5;border-radius:6px;font-size:11px;color:#666;line-height:1.7;">' +
        '<b>临床解读</b>: 偏瘫步态常表现为 LR 延长 (承重困难); 帕金森步态常表现为 PSw 缩短 + MSw 变长 (推离无力, 摆动拖曳); 小脑共济失调常见 MSw 显著延长 (平衡调整困难); 足下垂常见 ISw/TSw 延长 (廓清障碍, 步态拖地)。' +
      '</div>';
      html += '</div>';
    }

    // 时相截图 — 算法可视化验证锚点 (每个脚首个完整周期)
    if (r.phaseSnapshots && r.phaseSnapshots.length > 0) {
      var bySide = { left: [], right: [] };
      r.phaseSnapshots.forEach(function (s) {
        if (bySide[s.side]) bySide[s.side].push(s);
      });
      var phaseOrder = ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];
      html += '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 6px 0;font-size:16px;">📸 时相截图 (可视化算法验证)</h3>' +
        '<div style="font-size:12px;color:#666;margin-bottom:14px;">从视频中按检测到的 HS/TO 时间戳精确定位每个时相帧。请核对: <b>IC</b> 应为足跟刚触地; <b>PSw</b> 应为足趾即将离地; <b>MSw</b> 应为摆动中点脚离地最高。' +
          (r.segments && r.segments > 1 ? ' <span style="color:#10b981;font-weight:600;">已合并 ' + r.segments + ' 段视频</span>' : '') +
        '</div>';
      ['left', 'right'].forEach(function (side) {
        var snaps = bySide[side];
        if (!snaps || !snaps.length) return;
        var sideLabel = side === 'left' ? '左脚' : '右脚';
        html += '<div style="margin-bottom:14px;">' +
          '<div style="font-size:13px;font-weight:600;color:#0f7b6c;margin-bottom:8px;">' + sideLabel + ' · 周期 ' + snaps[0].cycleIndex + ' (' + snaps.length + ' 个时相)</div>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
        snaps.sort(function (a, b) {
          return phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase);
        });
        snaps.forEach(function (s) {
          var stanceColor = s.stance ? '#3b82f6' : '#f59e0b';
          var stanceLabel = s.stance ? '支撑' : '摆动';
          html += '<div style="background:#f8f9fa;border-radius:6px;overflow:hidden;border-top:3px solid ' + stanceColor + ';">' +
            '<img src="' + s.imageData + '" style="width:100%;height:auto;display:block;background:#000;" />' +
            '<div style="padding:6px 8px;">' +
              '<div style="font-size:11px;font-weight:700;color:#333;">' + s.phase + ' · ' + s.label + '</div>' +
              '<div style="font-size:10px;color:#888;margin-top:2px;">t=' + s.time.toFixed(2) + 's · ' + stanceLabel + '</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      });
      html += '</div>';
      // 缺另一侧 → "补录" 按钮 (两条路径: 重录 / 上传)
      var missingSide = null;
      if (!bySide.left || bySide.left.length === 0) missingSide = 'left';
      else if (!bySide.right || bySide.right.length === 0) missingSide = 'right';
      if (missingSide) {
        var sideLabel2 = missingSide === 'left' ? '左脚' : '右脚';
        var dirHint = missingSide === 'left' ? '从右向左' : '从左向右';
        var otherSide = missingSide === 'left' ? '右脚' : '左脚';
        html += '<div id="gait-add-segment" data-missing="' + missingSide + '" ' +
          'style="background:linear-gradient(135deg,#fff7ed,#fef3c7);border:2px dashed #f59e0b;border-radius:12px;padding:16px;margin-bottom:14px;">' +
          '<div style="font-size:15px;font-weight:700;color:#92400e;margin-bottom:8px;">⚠️ ' + sideLabel2 + ' 时相缺失 — ' + (r.segments && r.segments > 1 ? '本次视频仍未检测到' : '当前视频未检测到') + '</div>' +
          '<div style="font-size:13px;color:#78350f;line-height:1.7;margin-bottom:12px;">' +
            '只能看到 ' + otherSide + ' 时相, 因为 ' + sideLabel2 + ' 没面向摄像头。要补全, 可以二选一: ' +
            '<b>(A)</b> 再录一段 <b>' + dirHint + '</b> 走路的视频 (让 ' + sideLabel2 + ' 面向摄像头); ' +
            '或 <b>(B)</b> 直接上传你之前录好的另一方向视频文件。' +
          '</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
            '<button id="gait-add-segment-record" ' +
              'style="flex:1;min-width:200px;padding:12px 20px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(245,158,11,0.3);">' +
              '📷 重录一段 (走 ' + dirHint + ')</button>' +
            '<button id="gait-add-segment-upload" ' +
              'style="flex:1;min-width:200px;padding:12px 20px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(99,102,241,0.3);">' +
              '📁 上传另一段视频</button>' +
          '</div>' +
        '</div>';
      }
    } else {
      // 无时相截图 — 可能视频太短或 HS 周期不足
      html += '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 6px 0;font-size:16px;">📸 时相截图</h3>' +
        '<div style="font-size:13px;color:#999;">未生成时相截图 — ' +
        (r.degraded ? '降级模式下不包含时相分析' : '可能需要较长视频 (≥5秒) 且包含至少 2 个完整步态周期') +
        '。<br>控制台输入 <b>__gaitState.results.phaseSnapshots</b> 可查看截图数组。</div>' +
      '</div>';
    }

    // 脑功能步态画像 (ANRM 脑优化 §3.2)
    var bp = r.brainProfile;
    if (bp && !bp.error) {
      html += '<h3 style="margin:20px 0 10px 0;font-size:16px;">🧠 脑功能步态画像</h3>' +
        '<div style="background:#fff;padding:16px;border-radius:10px;margin-bottom:14px;">' +
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:8px;">' +
            '<div style="font-size:36px;">🧠</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:16px;font-weight:700;">' + (bp.brainGrade || '—') + '</div>' +
              '<div style="font-size:12px;opacity:0.85;">脑功能综合评分: ' + (bp.overallBrainScore || 50) + '/100</div>' +
            '</div>' +
            '<div style="text-align:center;"><div style="font-size:11px;opacity:0.8;">左脑</div><div style="font-size:18px;font-weight:700;">' + (bp.lateralization ? bp.lateralization.leftBrain : '—') + '</div></div>' +
            '<div style="text-align:center;"><div style="font-size:11px;opacity:0.8;">右脑</div><div style="font-size:18px;font-weight:700;">' + (bp.lateralization ? bp.lateralization.rightBrain : '—') + '</div></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">';
      var d = bp.domains || {};
      if (d.contralateral) {
        html += '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #667eea;">' +
          '<div style="font-size:12px;font-weight:600;">↔ 对侧脑功能</div><div style="font-size:11px;color:#888;">肩膀甩动 → 对侧脑</div>' +
          '<div style="font-size:10px;">左脑(右肩): <b>' + d.contralateral.leftBrainScore + '</b> | 右脑(左肩): <b>' + d.contralateral.rightBrainScore + '</b></div>' +
          (d.contralateral.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;">⚠ '+f+'</div>';}).join('') + '</div>';
      }
      if (d.cerebellum) {
        html += '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #f59e0b;">' +
          '<div style="font-size:12px;font-weight:600;">🎯 小脑功能</div><div style="font-size:11px;color:#888;">肘关节摆动 → 小脑</div>' +
          '<div style="font-size:10px;">评分: <b>' + d.cerebellum.score + '</b> | 肘摆: ' + (d.cerebellum.avgElbowAmplitude || 0).toFixed(1) + 'cm</div>' +
          (d.cerebellum.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;">⚠ '+f+'</div>';}).join('') + '</div>';
      }
      if (d.ipsilateral) {
        html += '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #10b981;">' +
          '<div style="font-size:12px;font-weight:600;">📏 同侧脑功能</div><div style="font-size:11px;color:#888;">宽深角度 → 同侧脑</div>' +
          '<div style="font-size:10px;">步宽: ' + (d.ipsilateral.stepWidth || 0).toFixed(2) + 'm | 对称: ' + ((d.ipsilateral.stepLengthSymmetry || 0)*100).toFixed(0) + '%</div>' +
          (d.ipsilateral.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;">⚠ '+f+'</div>';}).join('') + '</div>';
      }
      if (d.emotion) {
        html += '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #ec4899;">' +
          '<div style="font-size:12px;font-weight:600;">💭 性格与情绪</div><div style="font-size:11px;color:#888;">膝关节刹车 → 情绪</div>' +
          '<div style="font-size:10px;">评分: <b>' + d.emotion.score + '</b> | ' + (d.emotion.quality || '') + '</div>' +
          (d.emotion.flags || []).map(function(f){return '<div style="font-size:10px;color:#dc2626;">⚠ '+f+'</div>';}).join('') + '</div>';
      }
      if (d.automaticity) {
        html += '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #8b5cf6;">' +
          '<div style="font-size:12px;font-weight:600;">🔄 步态自动化</div><div style="font-size:11px;color:#888;">节律变异 → 皮层依赖</div>' +
          '<div style="font-size:10px;">评分: <b>' + d.automaticity.score + '</b> | CV: ' + ((d.automaticity.rhythmCV || 0)*100).toFixed(1) + '%</div>' +
          (d.automaticity.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;">⚠ '+f+'</div>';}).join('') + '</div>';
      }
      html += '</div>';
      if (bp.subhealthFlags && bp.subhealthFlags.length > 0) {
        html += '<div style="margin-top:10px;padding:8px;background:#fef3c7;border-radius:6px;font-size:11px;color:#92400e;">' +
          '<b>亚健康标记:</b> ' + bp.subhealthFlags.join(' / ') + '</div>';
      }
      html += '</div>';
    }

    // 神经定位
    html += '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;border-left:4px solid #0f7b6c;">' +
      '<h3 style="margin:0 0 10px 0;font-size:16px;">🧠 神经定位提示</h3>' +
      '<div style="font-size:14px;line-height:1.8;color:#333;">' +
        '<div><b>损伤水平:</b> ' + n.level + '</div>' +
        (n.regions && n.regions.length > 0 ? '<div><b>涉及区域:</b> ' + n.regions.join(', ') + '</div>' : '') +
        (n.possibleCauses && n.possibleCauses.length > 0 ? '<div><b>常见病因:</b> ' + n.possibleCauses.join(' / ') + '</div>' : '') +
        '<div><b>典型表现:</b> ' + (n.features || []).join(' / ') + '</div>' +
      '</div>' +
    '</div>';

    // 康复建议
    if (r.rehab && r.rehab.length > 0) {
      html += '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 10px 0;font-size:16px;">💪 康复训练建议</h3>' +
        '<ol style="padding-left:20px;margin:0;line-height:1.9;font-size:14px;color:#333;">' +
          r.rehab.map(function (s) { return '<li>' + s + '</li>'; }).join('') +
        '</ol>' +
      '</div>';
    }

    containerEl.innerHTML = html;

    // 渲染图表
    containerEl.querySelectorAll('.gait-chart').forEach(function (c) {
      var type = c.dataset.chart;
      if (type === 'param') renderParamBarChart(c, p);
      else if (type === 'asymmetry') renderAsymmetryChart(c, p);
      else if (type === 'phase') renderPhasePieChart(c, p);
    });
  }

  function summaryCard(label, value, unit, color) {
    return '<div style="text-align:center;padding:14px;background:#f8f9fa;border-radius:8px;border-top:3px solid ' + color + ';">' +
      '<div style="font-size:12px;color:#888;">' + label + '</div>' +
      '<div style="font-size:22px;font-weight:700;color:#1a1a2e;margin:4px 0;">' + value + '</div>' +
      (unit ? '<div style="font-size:11px;color:#999;">' + unit + '</div>' : '') +
    '</div>';
  }

  // ============================================================
  // PDF 导出
  // ============================================================
  async function exportPDF(data) {
    if (!data) {
      alert('暂无报告数据可导出');
      return;
    }
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      alert('PDF 库未加载完成, 请稍后重试');
      return;
    }
    // 创建临时容器渲染完整报告
    var tmp = document.createElement('div');
    tmp.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;background:#fff;padding:20px;';
    document.body.appendChild(tmp);
    renderReport(data, tmp);
    // 等待图表渲染
    await new Promise(function (r) { setTimeout(r, 200); });
    try {
      var canvas = await html2canvas(tmp, { scale: 1.5, useCORS: true, backgroundColor: '#fff' });
      var imgData = canvas.toDataURL('image/jpeg', 0.9);
      var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
      var pdfW = pdf.internal.pageSize.getWidth();
      var pdfH = pdf.internal.pageSize.getHeight();
      var imgW = pdfW - 20;
      var imgH = (canvas.height * imgW) / canvas.width;
      var pageH = pdfH - 20;
      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 10, 10, imgW, imgH);
      } else {
        // 分页
        var remainingH = imgH;
        var yOffset = 0;
        while (remainingH > 0) {
          pdf.addImage(imgData, 'JPEG', 10, 10 - yOffset, imgW, imgH);
          remainingH -= pageH;
          yOffset += pageH;
          if (remainingH > 0) pdf.addPage();
        }
      }
      var fileName = '步态分析_' + new Date(data.timestamp).toISOString().slice(0, 10) + '.pdf';
      pdf.save(fileName);
    } catch (e) {
      console.error('[gait] PDF export error', e);
      alert('PDF 导出失败: ' + e.message);
    } finally {
      document.body.removeChild(tmp);
    }
  }

  // ============================================================
  // 历史详情查看
  // ============================================================
  function showHistoryDetail(record, containerEl) {
    if (!record) return;
    renderReport(record, containerEl);
  }

  // 手动交换左右标签 — 重新计算并重新渲染
  function manualSwapLeftRight() {
    var st = window.__gaitAnalysis && window.__gaitAnalysis.getState();
    if (!st || !st.results || !st.capturedFrames) return;
    var kfs = st.capturedFrames;
    // 交换关键点标签
    kfs = window.__gaitParams.swapKeypointLabels(kfs);
    st.capturedFrames = kfs;
    // 重新计算参数
    var params = window.__gaitParams.computeAllParams(kfs, st.calibration.scale);
    var classification = params.degraded ? { primary: 'limited' }
      : window.__gaitParams.classifyGait(params);
    var neuro = params.degraded ? {}
      : window.__gaitParams.getNeuroLocalization(classification.primary);
    var rehab = params.degraded ? []
      : window.__gaitParams.getRehabSuggestions(classification.primary);
    // 交换时相截图的左右标签
    var pss = st.results.phaseSnapshots || [];
    pss.forEach(function (s) { s.side = s.side === 'left' ? 'right' : 'left'; });
    // 交换 events 的左右
    var oldEvents = st.results.events || {};
    var tmpHS = oldEvents.leftHeelStrikes;
    var tmpTO = oldEvents.leftToeOffs;
    Object.assign(st.results, {
      swapped: !st.results.swapped,
      parameters: params.parameters,
      asymmetries: params.asymmetries,
      extras: params.extras,
      armSwing: params.armSwing,
      elbowSwing: params.elbowSwing,
      kneeBraking: { left: params.kneeLeft, right: params.kneeRight },
      ankleKinematics: { left: params.ankleLeft, right: params.ankleRight },
      brainProfile: window.__gaitParams.computeBrainGaitProfile(
        params.armSwing, params.elbowSwing, params.kneeLeft, params.kneeRight, params
      ),
      events: {
        leftHeelStrikes: oldEvents.rightHeelStrikes || [],
        rightHeelStrikes: oldEvents.leftHeelStrikes || [],
        leftToeOffs: oldEvents.rightToeOffs || [],
        rightToeOffs: oldEvents.leftToeOffs || []
      },
      phaseSnapshots: pss,
      classification: classification,
      neuro: neuro,
      rehab: rehab
    });
    // 重新渲染
    var body = document.querySelector('#gait-body');
    if (body) renderReport(st.results, body);
    console.log('[gait] manual LR swap done, swapped=' + st.results.swapped);
  }

  // ============================================================
  // 暴露 API
  // ============================================================
  window.__gaitReport = {
    renderReport: renderReport,
    exportPDF: exportPDF,
    renderParamBarChart: renderParamBarChart,
    renderAsymmetryChart: renderAsymmetryChart,
    renderPhasePieChart: renderPhasePieChart,
    showHistoryDetail: showHistoryDetail,
    manualSwap: manualSwapLeftRight
  };
})();
