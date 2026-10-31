(function (global) {
  'use strict';

  var ANGLES = [
    { key: 'shoulder', label: '肩关节', short: '肩' },
    { key: 'elbow', label: '肘关节', short: '肘' },
    { key: 'hip', label: '髋关节', short: '髋' },
    { key: 'knee', label: '膝关节', short: '膝' },
    { key: 'ankle', label: '踝关节', short: '踝' }
  ];
  var PHASES = [
    { key: 'IC', label: '初始触地' },
    { key: 'LR', label: '承重反应' },
    { key: 'MSt', label: '站立中期' },
    { key: 'TSt', label: '站立末期' },
    { key: 'PSw', label: '预摆动期' },
    { key: 'ISw', label: '摆动初期' },
    { key: 'MSw', label: '摆动中期' },
    { key: 'TSw', label: '摆动末期' }
  ];
  var SIDES = [
    { key: 'left', label: '左侧', color: '#2563eb' },
    { key: 'right', label: '右侧', color: '#e11d48' }
  ];
  var COLORS = {
    ink: '#172033',
    muted: '#64748b',
    line: '#dbe3ec',
    soft: '#f5f8fb',
    accent: '#0f766e'
  };

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function display(value) {
    return value == null || value === '' ? '—' : String(value);
  }

  function number(value, digits) {
    return finite(value) ? value.toFixed(digits == null ? 1 : digits) : '—';
  }

  function phaseName(key) {
    for (var i = 0; i < PHASES.length; i++) {
      if (PHASES[i].key === key) return PHASES[i].label;
    }
    return '';
  }

  function phaseText(key) {
    if (!key) return '—';
    var name = phaseName(key);
    return name ? key + ' ' + name : String(key);
  }

  function sideName(side) {
    return side === 'right' ? '右侧' : '左侧';
  }

  function element(tag, style, children) {
    var node = document.createElement(tag);
    if (style) Object.assign(node.style, style);
    append(node, children);
    return node;
  }

  function append(parent, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (child) {
      if (child == null) return;
      if (Array.isArray(child)) {
        append(parent, child);
      } else {
        parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    });
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function section(title, description) {
    var body = element('div');
    var root = element('section', {
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '18px',
      marginBottom: '16px',
      breakInside: 'auto'
    }, [
      element('h3', { margin: '0', color: COLORS.ink, fontSize: '17px', lineHeight: '1.4' }, title),
      description ? element('p', { margin: '6px 0 14px', color: COLORS.muted, fontSize: '12px', lineHeight: '1.7' }, description) : null,
      body
    ]);
    return { root: root, body: body };
  }

  function cell(tag, content, header) {
    return element(tag, {
      padding: '9px 10px',
      borderBottom: '1px solid #e8edf2',
      borderRight: '1px solid #edf1f5',
      textAlign: 'center',
      verticalAlign: 'middle',
      whiteSpace: 'nowrap',
      color: header ? '#475569' : COLORS.ink,
      background: header ? '#f1f5f9' : '#ffffff',
      fontSize: '12px',
      fontWeight: header ? '600' : '400',
      lineHeight: '1.6'
    }, content);
  }

  function tableElement() {
    return element('table', {
      width: '100%',
      borderCollapse: 'collapse',
      borderSpacing: '0',
      background: '#ffffff'
    });
  }

  function tableScroller(table) {
    return element('div', { overflowX: 'auto', border: '1px solid #e8edf2', borderRadius: '8px' }, table);
  }

  function reportDate(report) {
    var date = report && report.timestamp ? new Date(report.timestamp) : new Date();
    if (isNaN(date.getTime())) date = new Date();
    return date;
  }

  function datestamp(report) {
    var date = reportDate(report);
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function dateTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function viewFor(report, side) {
    return report && report.views && report.views[side] ? report.views[side] : {};
  }

  function normalizedMean(view, key) {
    return view.summary && view.summary[key] && Array.isArray(view.summary[key].normalizedMean)
      ? view.summary[key].normalizedMean : [];
  }

  function jointRange(report, key) {
    var minimum = Infinity;
    var maximum = -Infinity;
    function include(series) {
      (Array.isArray(series) ? series : []).forEach(function (value) {
        if (!finite(value)) return;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      });
    }
    SIDES.forEach(function (side) {
      var view = viewFor(report, side.key);
      include(normalizedMean(view, key));
      (Array.isArray(view.cycles) ? view.cycles : []).forEach(function (cycle) {
        include(cycle.normalized && cycle.normalized[key]);
      });
    });
    if (minimum === Infinity) return { min: -10, max: 10 };
    if (minimum === maximum) {
      minimum -= 5;
      maximum += 5;
    }
    var padding = Math.max(3, (maximum - minimum) * 0.1);
    return { min: minimum - padding, max: maximum + padding };
  }

  function drawSeries(context, series, bounds, range, color, width, alpha, dash) {
    if (!Array.isArray(series) || !series.length) return;
    var plotWidth = bounds.width - bounds.left - bounds.right;
    var plotHeight = bounds.height - bounds.top - bounds.bottom;
    var denominator = Math.max(1, series.length - 1);
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.setLineDash(dash || []);
    context.beginPath();
    var drawing = false;
    series.forEach(function (value, index) {
      if (!finite(value)) {
        drawing = false;
        return;
      }
      var x = bounds.left + plotWidth * index / denominator;
      var ratio = (value - range.min) / (range.max - range.min);
      var y = bounds.top + plotHeight * (1 - ratio);
      if (!drawing) {
        context.moveTo(x, y);
        drawing = true;
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
    context.restore();
  }

  function drawJointChart(canvas, report, angle, side, range) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.parentNode.clientWidth || 360);
    var height = 240;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    width = Math.max(220, width);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    var bounds = { left: 46, right: 12, top: 34, bottom: 36, width: width, height: height };
    var plotWidth = width - bounds.left - bounds.right;
    var plotHeight = height - bounds.top - bounds.bottom;
    context.font = '10px sans-serif';
    context.textBaseline = 'middle';
    for (var tick = 0; tick <= 5; tick++) {
      var fraction = tick / 5;
      var y = bounds.top + plotHeight * fraction;
      var value = range.max - (range.max - range.min) * fraction;
      context.strokeStyle = '#e8edf2';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(bounds.left, y);
      context.lineTo(width - bounds.right, y);
      context.stroke();
      context.fillStyle = COLORS.muted;
      context.textAlign = 'right';
      context.fillText(number(value, Math.abs(range.max - range.min) < 20 ? 1 : 0), bounds.left - 6, y);
    }
    [0, 25, 50, 75, 100].forEach(function (tickValue) {
      var x = bounds.left + plotWidth * tickValue / 100;
      context.strokeStyle = '#f0f3f6';
      context.beginPath();
      context.moveTo(x, bounds.top);
      context.lineTo(x, height - bounds.bottom);
      context.stroke();
      context.fillStyle = COLORS.muted;
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillText(tickValue + '%', x, height - bounds.bottom + 8);
    });
    context.fillStyle = COLORS.muted;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillText('角度（°）', 4, 12);
    context.textAlign = 'right';
    context.fillText('归一化步态周期', width - 8, height - 3);

    var view = viewFor(report, side.key);
    var cycles = Array.isArray(view.cycles) ? view.cycles : [];
    cycles.forEach(function (cycle) {
      drawSeries(context, cycle.normalized && cycle.normalized[angle.key], bounds, range, side.color, 0.9, 0.24, []);
    });
    var other = side.key === 'left' ? SIDES[1] : SIDES[0];
    drawSeries(context, normalizedMean(viewFor(report, other.key), angle.key), bounds, range, '#7c8798', 2.3, 0.8, [6, 4]);
    drawSeries(context, normalizedMean(view, angle.key), bounds, range, side.color, 2.8, 1, []);

    context.font = '10px sans-serif';
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillStyle = side.color;
    context.fillText('■ ' + side.label + '均值', bounds.left, 14);
    context.fillStyle = '#7c8798';
    context.fillText('▨ ' + other.label + '均值（虚线）', bounds.left + 76, 14);
    context.fillStyle = COLORS.muted;
    context.fillText('细线：' + side.label + '各周期', bounds.left + 196, 14);
    if (!cycles.length) {
      context.fillStyle = '#94a3b8';
      context.font = '12px sans-serif';
      context.textAlign = 'center';
      context.fillText('本侧暂无已确认周期', bounds.left + plotWidth / 2, bounds.top + plotHeight / 2);
    }
  }

  function renderCurves(report, parent, pendingCharts) {
    var block = section('关节角度周期曲线', '横轴为每个已确认周期归一化后的 0–100%；粗线为左右均值，细线仅表示当前侧各周期。空缺段表示无可靠角度，未跨空洞补线。');
    ANGLES.forEach(function (angle) {
      var range = jointRange(report, angle.key);
      var grid = element('div', {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
        gap: '12px',
        marginTop: '12px'
      });
      SIDES.forEach(function (side) {
        var canvas = element('canvas', { display: 'block', width: '100%', height: '240px' });
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', side.label + angle.label + '归一化步态周期曲线');
        var card = element('div', { border: '1px solid #e8edf2', borderRadius: '8px', overflow: 'hidden' }, [
          element('div', { padding: '8px 12px', background: COLORS.soft, color: side.color, fontSize: '13px', fontWeight: '700' }, side.label + ' · ' + angle.label),
          canvas
        ]);
        grid.appendChild(card);
        pendingCharts.push({ canvas: canvas, angle: angle, side: side, range: range });
      });
      block.body.appendChild(element('div', { marginTop: '14px' }, [
        element('h4', { margin: '0', color: COLORS.ink, fontSize: '14px' }, angle.label),
        grid
      ]));
    });
    parent.appendChild(block.root);
  }

  function drawTimeChart(canvas, report, angle, side, range) {
    var width = Math.max(220, Math.round(canvas.getBoundingClientRect().width || canvas.parentNode.clientWidth || 360));
    var height = 240;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    var bounds = { left: 46, right: 12, top: 34, bottom: 36 };
    var plotWidth = width - bounds.left - bounds.right;
    var plotHeight = height - bounds.top - bounds.bottom;
    var cycles = viewFor(report, side.key).cycles || [];
    var times = [];
    cycles.forEach(function (cycle) {
      (cycle.series || []).forEach(function (frame) { if (finite(frame.time)) times.push(frame.time); });
    });
    var minimum = times.length ? Math.min.apply(null, times) : 0;
    var maximum = times.length ? Math.max.apply(null, times) : 1;
    if (maximum <= minimum) maximum = minimum + 1;
    context.font = '10px sans-serif';
    for (var tick = 0; tick <= 5; tick++) {
      var fraction = tick / 5;
      var y = bounds.top + plotHeight * fraction;
      var value = range.max - (range.max - range.min) * fraction;
      context.strokeStyle = '#e8edf2';
      context.beginPath();
      context.moveTo(bounds.left, y);
      context.lineTo(width - bounds.right, y);
      context.stroke();
      context.fillStyle = COLORS.muted;
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(number(value, Math.abs(range.max - range.min) < 20 ? 1 : 0), bounds.left - 6, y);
      var x = bounds.left + plotWidth * fraction;
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillText(number(minimum + (maximum - minimum) * fraction, 2) + 's', x, height - bounds.bottom + 8);
    }
    cycles.forEach(function (cycle) {
      context.beginPath();
      context.strokeStyle = side.color;
      context.lineWidth = 1.6;
      var drawing = false;
      (cycle.series || []).forEach(function (frame) {
        var value = frame.angles && frame.angles[angle.key];
        if (!finite(value) || !finite(frame.time)) { drawing = false; return; }
        var x = bounds.left + (frame.time - minimum) / (maximum - minimum) * plotWidth;
        var y = bounds.top + (range.max - value) / (range.max - range.min) * plotHeight;
        if (!drawing) { context.moveTo(x, y); drawing = true; }
        else context.lineTo(x, y);
      });
      context.stroke();
    });
    context.fillStyle = COLORS.muted;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillText('角度（°）', 4, 12);
    context.textAlign = 'right';
    context.fillText('视频实际时间', width - 8, height - 3);
    if (!cycles.length) {
      context.textAlign = 'center';
      context.font = '12px sans-serif';
      context.fillText('本侧暂无已确认周期', bounds.left + plotWidth / 2, bounds.top + plotHeight / 2);
    }
  }

  function renderTimeCurves(report, parent, pendingCharts) {
    var block = section('实际时间逐帧曲线', '横轴保留原视频时间，每个已确认周期单独画线；缺失角度直接断开，不按 0° 连接。');
    ANGLES.forEach(function (angle) {
      var range = jointRange(report, angle.key);
      var grid = element('div', { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '12px', marginTop: '12px' });
      SIDES.forEach(function (side) {
        var canvas = element('canvas', { display: 'block', width: '100%', height: '240px' });
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', side.label + angle.label + '实际时间曲线');
        var card = element('div', { border: '1px solid #e8edf2', borderRadius: '8px', overflow: 'hidden' }, [
          element('div', { padding: '8px 12px', background: COLORS.soft, color: side.color, fontSize: '13px', fontWeight: '700' }, side.label + ' · ' + angle.label),
          canvas
        ]);
        grid.appendChild(card);
        pendingCharts.push({ type: 'time', canvas: canvas, angle: angle, side: side, range: range });
      });
      block.body.appendChild(element('div', { marginTop: '14px' }, [
        element('h4', { margin: '0', color: COLORS.ink, fontSize: '14px' }, angle.label),
        grid
      ]));
    });
    parent.appendChild(block.root);
  }

  function difference(left, right) {
    return finite(left) && finite(right) ? number(left - right, 1) + '°' : '—';
  }

  function renderSummary(report, parent) {
    var block = section('关节活动摘要', '最大屈曲与最大伸展分别取全部已确认帧中的角度最大值与最小值；差值统一为左侧减右侧。');
    var table = tableElement();
    var head = element('thead');
    var headings = ['关节', '侧别', '最大屈曲（°）', '屈曲时相', '最大伸展（°）', '伸展时相', 'ROM（°）', '左右差值（左−右）'];
    head.appendChild(element('tr', null, headings.map(function (text) { return cell('th', text, true); })));
    table.appendChild(head);
    var body = element('tbody');
    ANGLES.forEach(function (angle) {
      var left = viewFor(report, 'left').summary && viewFor(report, 'left').summary[angle.key]
        ? viewFor(report, 'left').summary[angle.key] : {};
      var right = viewFor(report, 'right').summary && viewFor(report, 'right').summary[angle.key]
        ? viewFor(report, 'right').summary[angle.key] : {};
      SIDES.forEach(function (side, index) {
        var summary = index === 0 ? left : right;
        var row = element('tr');
        if (index === 0) {
          var joint = cell('td', element('strong', null, angle.label));
          joint.rowSpan = 2;
          row.appendChild(joint);
        }
        row.appendChild(cell('td', side.label));
        row.appendChild(cell('td', number(summary.maxFlexion, 1)));
        row.appendChild(cell('td', phaseText(summary.maxFlexionPhase)));
        row.appendChild(cell('td', number(summary.maxExtension, 1)));
        row.appendChild(cell('td', phaseText(summary.maxExtensionPhase)));
        row.appendChild(cell('td', number(summary.rom, 1)));
        if (index === 0) {
          var differences = element('div', { whiteSpace: 'normal', minWidth: '120px' }, [
            element('div', null, '屈曲 ' + difference(left.maxFlexion, right.maxFlexion)),
            element('div', null, '伸展 ' + difference(left.maxExtension, right.maxExtension)),
            element('div', null, 'ROM ' + difference(left.rom, right.rom))
          ]);
          var differenceCell = cell('td', differences);
          differenceCell.rowSpan = 2;
          row.appendChild(differenceCell);
        }
        body.appendChild(row);
      });
    });
    table.appendChild(body);
    block.body.appendChild(tableScroller(table));
    parent.appendChild(block.root);
  }

  function neuroObservationCard(observation, side) {
    var colors = { within: '#0f766e', below: '#9a670e', above: '#6d5b9e', missing: '#64748b', pending: '#64748b', unrecorded: '#64748b' };
    var card = element('article', {
      minWidth: '0', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px',
      background: '#ffffff', overflowWrap: 'anywhere'
    }, [
      element('div', { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }, [
        element('strong', { color: COLORS.ink, fontSize: '13px' }, side.label + ' · ' + observation.label),
        element('span', { color: colors[observation.status] || COLORS.muted, fontSize: '11px', fontWeight: '600' }, observation.statusLabel)
      ]),
      element('div', { marginTop: '6px', color: COLORS.ink, fontSize: '23px', fontWeight: '750' }, observation.displayValue),
      element('div', { color: COLORS.muted, fontSize: '11px', lineHeight: '1.6' }, '课程参考：' + observation.referenceText),
      element('p', { margin: '8px 0 0', color: '#334155', fontSize: '12px', lineHeight: '1.75' }, observation.mechanism),
      element('p', { margin: '5px 0 0', color: COLORS.muted, fontSize: '11px', lineHeight: '1.65' }, observation.factors)
    ]);
    card.dataset.neuroKey = observation.key;
    card.dataset.referenceStatus = observation.status;
    return card;
  }

  function renderNeuroscience(report, parent) {
    var neuro = report.neuroInterpretation;
    if (!neuro && global.__gaitNeuro) neuro = global.__gaitNeuro.buildNeuroInterpretation(report);
    if (!neuro || !neuro.protocol || !neuro.sides) return;
    var block = section('神经调控视角（训练参考）', neuro.explanation);
    block.root.id = 'gait-neuro-report';
    block.root.dataset.protocolSpeed = neuro.protocol.speedKmh == null ? '' : String(neuro.protocol.speedKmh);
    block.root.dataset.referenceStatus = neuro.referenceStatus;
    block.body.appendChild(element('div', {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '8px'
    }, [
      metadataItem('测试条件', neuro.protocol.label),
      metadataItem('课程参考来源', neuro.source && neuro.source.label)
    ]));
    block.body.appendChild(element('div', {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: '8px', margin: '12px 0'
    }, (neuro.networks || []).map(function (network) {
      return element('div', { padding: '9px', borderRadius: '7px', background: '#eef6f4' }, [
        element('strong', { color: COLORS.accent, fontSize: '12px' }, network.label),
        element('div', { marginTop: '3px', color: '#405d58', fontSize: '11px', lineHeight: '1.6' }, network.text)
      ]);
    })));
    SIDES.forEach(function (side) {
      var result = neuro.sides[side.key] || {};
      block.body.appendChild(element('h4', { margin: '16px 0 8px', color: side.color, fontSize: '14px' }, side.label));
      block.body.appendChild(element('div', {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '10px'
      }, (result.observations || []).map(function (observation) {
        return neuroObservationCard(observation, side);
      })));
      (result.notes || []).forEach(function (note) {
        block.body.appendChild(element('p', { margin: '8px 0 0', color: COLORS.muted, fontSize: '12px', lineHeight: '1.7' }, note));
      });
    });
    var sources = element('div', { marginTop: '16px', color: COLORS.muted, fontSize: '11px', lineHeight: '1.8', overflowWrap: 'anywhere' }, '机制参考文献（不等同于课程阈值的验证）：');
    (neuro.references || []).forEach(function (reference) {
      if (typeof reference.url !== 'string' || reference.url.indexOf('https://') !== 0) return;
      sources.appendChild(document.createElement('br'));
      var link = element('a', { color: COLORS.accent }, reference.label);
      link.href = reference.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      sources.appendChild(link);
    });
    block.body.appendChild(sources);
    parent.appendChild(block.root);
  }

  function renderPhaseTable(report, parent) {
    var block = section('八时相人工标记帧角度', '数值单位为角度（°）；先取每个人工标记时相帧的精确角度，再对已确认周期求均值。');
    var table = tableElement();
    var head = element('thead');
    var first = element('tr');
    var phaseHeader = cell('th', '时相', true);
    phaseHeader.rowSpan = 2;
    first.appendChild(phaseHeader);
    ANGLES.forEach(function (angle) {
      var header = cell('th', angle.label, true);
      header.colSpan = 2;
      first.appendChild(header);
    });
    head.appendChild(first);
    var second = element('tr');
    ANGLES.forEach(function () {
      second.appendChild(cell('th', '左', true));
      second.appendChild(cell('th', '右', true));
    });
    head.appendChild(second);
    table.appendChild(head);
    var body = element('tbody');
    PHASES.forEach(function (phase) {
      var row = element('tr');
      row.appendChild(cell('td', element('div', { textAlign: 'left' }, [
        element('strong', null, phase.key),
        element('span', { color: COLORS.muted }, ' ' + phase.label)
      ])));
      ANGLES.forEach(function (angle) {
        SIDES.forEach(function (side) {
          var view = viewFor(report, side.key);
          var entry = view.phaseTable && view.phaseTable[phase.key] && view.phaseTable[phase.key][angle.key];
          row.appendChild(cell('td', number(entry && entry.mean, 1)));
        });
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    block.body.appendChild(tableScroller(table));
    parent.appendChild(block.root);
  }

  function snapshotGroups(snapshots) {
    var groups = new Map();
    (Array.isArray(snapshots) ? snapshots : []).forEach(function (snapshot) {
      if (!snapshot || !PHASES.some(function (phase) { return phase.key === snapshot.phase; })) return;
      var id = display(snapshot.cycleId);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(snapshot);
    });
    return groups;
  }

  function validImageSource(value) {
    return typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value);
  }

  function snapshotCard(snapshot, phase, side) {
    var children = [];
    if (snapshot && validImageSource(snapshot.imageData)) {
      var image = element('img', {
        display: 'block',
        width: '100%',
        aspectRatio: '4 / 3',
        objectFit: 'contain',
        background: '#0f172a'
      });
      image.src = snapshot.imageData;
      image.alt = sideName(side) + phase.key + phase.label + '骨架截图';
      children.push(image);
    } else {
      children.push(element('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '4 / 3',
        background: '#edf2f7',
        color: '#94a3b8',
        fontSize: '12px'
      }, '无截图'));
    }
    children.push(element('div', { padding: '8px' }, [
      element('div', { color: COLORS.ink, fontSize: '12px', fontWeight: '700' }, phase.key + ' · ' + (snapshot && snapshot.label ? String(snapshot.label) : phase.label)),
      element('div', { color: COLORS.muted, fontSize: '10px', marginTop: '3px' }, snapshot
        ? '时间 ' + number(snapshot.time, 2) + ' s · 帧 ' + display(snapshot.frameIndex)
        : '该时相暂无快照'),
      snapshot && snapshot.angles ? element('div', { color: '#475569', fontSize: '10px', lineHeight: '1.6', marginTop: '4px' },
        ANGLES.map(function (angle) { return angle.short + ' ' + number(snapshot.angles[angle.key], 1) + '°'; }).join('　')) : null
    ]));
    var card = element('div', { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', overflow: 'hidden' }, children);
    card.className = 'gait-v2-phase-shot';
    return card;
  }

  function renderSnapshots(report, parent) {
    var block = section('八时相骨架截图', '按侧别与周期展示主控附加的 phaseSnapshots；图像仅接受内嵌图片数据，缺失时相保留占位。');
    SIDES.forEach(function (side) {
      var view = viewFor(report, side.key);
      var groups = snapshotGroups(view.phaseSnapshots);
      block.body.appendChild(element('h4', { margin: '14px 0 8px', color: side.color, fontSize: '14px' }, side.label));
      if (!groups.size) {
        block.body.appendChild(element('div', { padding: '16px', background: COLORS.soft, borderRadius: '7px', color: COLORS.muted, fontSize: '12px' }, '暂无该侧时相截图'));
        return;
      }
      groups.forEach(function (snapshots, cycleId) {
        block.body.appendChild(element('div', { margin: '10px 0 6px', color: COLORS.muted, fontSize: '12px' }, '周期 ' + cycleId));
        var grid = element('div', {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: '8px'
        });
        PHASES.forEach(function (phase) {
          var snapshot = snapshots.find(function (item) { return item.phase === phase.key; });
          grid.appendChild(snapshotCard(snapshot, phase, side.key));
        });
        block.body.appendChild(grid);
      });
    });
    parent.appendChild(block.root);
  }

  function metadataItem(label, value) {
    return element('div', { padding: '10px', background: COLORS.soft, borderRadius: '7px' }, [
      element('div', { color: COLORS.muted, fontSize: '11px' }, label),
      element('div', { color: COLORS.ink, fontSize: '13px', fontWeight: '600', marginTop: '3px', overflowWrap: 'anywhere' }, display(value))
    ]);
  }

  function renderMetadata(report, parent) {
    var block = section('确认记录', '周期数与确认元数据均来自当前报告；空字段表示未提供。');
    SIDES.forEach(function (side) {
      var view = viewFor(report, side.key);
      var items = [metadataItem('侧别', side.label), metadataItem('已确认周期数', finite(view.cycleCount) ? view.cycleCount : 0)];
      if (view.confirmedBy != null) items.push(metadataItem('确认人', view.confirmedBy));
      if (view.confirmedAt != null) items.push(metadataItem('确认时间', dateTime(view.confirmedAt)));
      if (view.modelVersion != null) items.push(metadataItem('模型版本', view.modelVersion));
      if (view.videoName != null) items.push(metadataItem('视频文件', view.videoName));
      block.body.appendChild(element('div', {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
        gap: '8px',
        marginBottom: '10px'
      }, items));
    });
    parent.appendChild(block.root);
  }

  function missingSides(report) {
    var missing = Array.isArray(report.missing) ? report.missing.filter(function (side) {
      return side === 'left' || side === 'right';
    }) : [];
    SIDES.forEach(function (side) {
      var view = viewFor(report, side.key);
      if (!(view.cycleCount > 0) && missing.indexOf(side.key) === -1) missing.push(side.key);
    });
    return missing;
  }

  function renderReport(report, container) {
    if (!container || typeof container.appendChild !== 'function') throw new TypeError('container 必须是 DOM 元素');
    clear(container);
    if (!report) {
      container.appendChild(element('div', {
        padding: '48px 20px',
        textAlign: 'center',
        color: COLORS.muted,
        background: '#f8fafc',
        border: '1px dashed #cbd5e1',
        borderRadius: '12px',
        fontSize: '14px'
      }, '暂无步态报告数据'));
      return container;
    }
    var patient = report.patientInfo && typeof report.patientInfo === 'object' ? report.patientInfo : {};
    var root = element('div', {
      color: COLORS.ink,
      fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
      background: '#ffffff'
    });
    root.className = 'gait-report-v2';
    root.appendChild(element('header', {
      padding: '22px',
      marginBottom: '16px',
      borderRadius: '12px',
      color: '#ffffff',
      background: 'linear-gradient(135deg,#0f766e,#155e75)'
    }, [
      element('h2', { margin: '0', fontSize: '23px', lineHeight: '1.4' }, '步态运动学确认报告'),
      element('div', { marginTop: '8px', fontSize: '12px', opacity: '0.9' }, '报告时间：' + dateTime(report.timestamp)),
      patient.name || patient.age || patient.gender ? element('div', { marginTop: '5px', fontSize: '13px' },
        '受试者：' + display(patient.name) + (patient.age ? ' · ' + patient.age + ' 岁' : '') + (patient.gender ? ' · ' + patient.gender : '')) : null
    ]));
    if (report.canExport !== true) {
      var missing = missingSides(report);
      root.appendChild(element('div', {
        padding: '12px 16px',
        marginBottom: '16px',
        borderRadius: '8px',
        border: '1px solid #f5c76b',
        background: '#fff8e7',
        color: '#854d0e',
        fontSize: '13px',
        lineHeight: '1.7'
      }, '当前为预览状态，暂不可导出。' + (missing.length ? '缺失侧：' + missing.map(sideName).join('、') + '。' : '') + '已有数据仍可正常查看。'));
    }
    var pendingCharts = [];
    renderMetadata(report, root);
    renderCurves(report, root, pendingCharts);
    renderTimeCurves(report, root, pendingCharts);
    renderSummary(report, root);
    renderNeuroscience(report, root);
    renderPhaseTable(report, root);
    renderSnapshots(report, root);
    root.appendChild(element('section', {
      padding: '16px 18px',
      borderRadius: '10px',
      background: '#f1f5f9',
      color: '#475569',
      fontSize: '12px',
      lineHeight: '1.8'
    }, [
      element('strong', { color: COLORS.ink }, '报告说明'),
      element('div', { marginTop: '5px' }, '本报告基于单目视频的二维图像平面关键点计算相对角度：肩关节为上臂相对躯干，肘关节为前臂相对上臂，髋关节为大腿相对躯干，膝关节为大腿与小腿的相对角，踝关节为足部相对小腿并采用 90° 参考修正。结果受拍摄方向、遮挡及关键点质量影响，不等同于三维关节角度。'),
      element('div', { marginTop: '5px' }, '各周期按时间归一化至 0–100%，均值只统计有效角度；曲线空洞表示数据缺失，不将缺失值当作 0°。'),
      element('div', { marginTop: '5px', fontWeight: '600', color: '#9a3412' }, '本报告仅用于康复训练记录与专业人员参考，不构成医学诊断、疾病筛查结论或治疗依据。')
    ]));
    container.appendChild(root);
    pendingCharts.forEach(function (chart) {
      if (chart.type === 'time') drawTimeChart(chart.canvas, report, chart.angle, chart.side, chart.range);
      else drawJointChart(chart.canvas, report, chart.angle, chart.side, chart.range);
    });
    return container;
  }

  function exportAllowed(report) {
    if (report && report.canExport === true) return true;
    global.alert('报告缺少双侧已确认步态周期，暂不可导出；当前内容仍可预览。');
    return false;
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function exportPDF(report) {
    if (!exportAllowed(report)) return false;
    var html2canvas = global.html2canvas;
    var JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (typeof html2canvas !== 'function' || typeof JsPDF !== 'function') {
      global.alert('PDF 库未加载完成，请稍后重试。');
      return false;
    }
    var temporary = element('div', {
      position: 'fixed',
      left: '-100000px',
      top: '0',
      width: '900px',
      padding: '20px',
      background: '#ffffff',
      zIndex: '-1'
    });
    document.body.appendChild(temporary);
    try {
      renderReport(report, temporary);
      await new Promise(function (resolve) { global.setTimeout(resolve, 200); });
      var canvas = await html2canvas(temporary, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      var pdf = new JsPDF('p', 'mm', 'a4');
      var pageWidth = pdf.internal.pageSize.getWidth();
      var pageHeight = pdf.internal.pageSize.getHeight();
      var imageWidth = pageWidth - 20;
      var printableHeight = pageHeight - 20;
      var sliceHeight = Math.floor(canvas.width * printableHeight / imageWidth);
      var y = 0;
      var pageIndex = 0;
      while (y < canvas.height) {
        var height = Math.min(sliceHeight, canvas.height - y);
        var pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = height;
        var context = pageCanvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, imageWidth, height * imageWidth / canvas.width);
        y += height;
        pageIndex++;
      }
      pdf.save('步态运动学确认报告_' + datestamp(report) + '.pdf');
      return true;
    } catch (error) {
      console.error('[gait-report-v2] PDF 导出失败', error);
      global.alert('PDF 导出失败：' + (error && error.message ? error.message : String(error)));
      return false;
    } finally {
      temporary.remove();
    }
  }

  function exportJSON(report) {
    if (!exportAllowed(report)) return false;
    try {
      var blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, '步态运动学确认报告_' + datestamp(report) + '.json');
      return true;
    } catch (error) {
      console.error('[gait-report-v2] JSON 导出失败', error);
      global.alert('JSON 导出失败：' + (error && error.message ? error.message : String(error)));
      return false;
    }
  }

  function exportCSV(report) {
    if (!exportAllowed(report)) return false;
    if (!global.__gaitKinematics || typeof global.__gaitKinematics.buildCSV !== 'function') {
      global.alert('CSV 构建模块未加载，暂不可导出。');
      return false;
    }
    try {
      var csv = global.__gaitKinematics.buildCSV(report);
      var blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, '步态运动学确认报告_' + datestamp(report) + '.csv');
      return true;
    } catch (error) {
      console.error('[gait-report-v2] CSV 导出失败', error);
      global.alert('CSV 导出失败：' + (error && error.message ? error.message : String(error)));
      return false;
    }
  }

  global.__gaitReportV2 = {
    renderReport: renderReport,
    exportPDF: exportPDF,
    exportJSON: exportJSON,
    exportCSV: exportCSV
  };
})(typeof window !== 'undefined' ? window : globalThis);
