// assets/cognitive/reports/qnr-region-detail.js
// 神经系统自评 · 分区做题详情弹层
//
// 顶层设计:
//   · 治疗师端报告页可点击每个分区行 → 弹层显示该分区下的题目原文 + 患者作答
//   · 患者端问卷页同样可点击查看自己答了什么
//   · 弹层以独立 fixed 定位的 overlay 渲染, 不在报告 DOM 内 → PDF 导出不会包含做题详情
//   · 复用 data.js 已暴露的 window.__qnrData (BRAIN_REGION_ITEMS / DEFS / SCORE_DESCRIPTORS / PHONE_EAR_OPTIONS)
//
// API:
//   window._qnrShowRegionDetail(rec, regionId)  // 弹层
//   window._qnrCloseRegionDetail()             // 关闭
//
// 依赖: window.__qnrData, window.__qnrScoring (用于 region severity 计算)

(function (global) {
  'use strict';

  function _getData() { return global.__qnrData || null; }
  function _getScoring() { return global.__qnrScoring || null; }

  function _sevMeta(sev) {
    var color = { normal:'#16a34a', mild:'#ca8a04', moderate:'#ea580c', severe:'#dc2626' };
    var label = { normal:'正常', mild:'轻度', moderate:'中度', severe:'重度' };
    return { color: color[sev] || '#16a34a', label: label[sev] || '正常' };
  }

  function _scoreChipMeta(score) {
    // 0-4 → 颜色 + 标签 (来自 SCORE_DESCRIPTORS)
    var colors = ['#94a3b8', '#22c55e', '#f59e0b', '#f97316', '#dc2626'];
    var labels = ['无症状', '很少', '经常', '频繁', '总是'];
    return { color: colors[score] || '#94a3b8', label: labels[score] || '?' };
  }

  // 渲染弹层 HTML
  function _renderModal(rec, regionId) {
    var data = _getData();
    if (!data) {
      return '<div style="padding:40px;text-align:center;color:#dc2626;">数据模块未加载, 请刷新页面</div>';
    }
    var def = data.BRAIN_REGION_DEFS.find(function(d) { return d.id === regionId; });
    if (!def) {
      return '<div style="padding:40px;text-align:center;color:#dc2626;">未找到分区: ' + regionId + '</div>';
    }
    // 找出该分区下的所有题目
    var itemsInRegion = (data.BRAIN_REGION_ITEMS || []).filter(function(it) {
      return it.index >= def.range[0] && it.index <= def.range[1];
    });
    // 患者作答 (rec.qnr.items 是 { "1": 0, "2": 4, ... })
    var answers = (rec.qnr && rec.qnr.items) || {};
    // 该分区在 scoreBrainRegion 结果中的分数 + 严重度
    var regionScore = rec.qnr && rec.qnr.byRegion ? (rec.qnr.byRegion[regionId] || 0) : 0;
    var regionSev = rec.qnr && rec.qnr.severityByRegion ? (rec.qnr.severityByRegion[regionId] || 'normal') : 'normal';
    var sevMeta = _sevMeta(regionSev);
    // 分区满分
    var scorableCount = itemsInRegion.filter(function(it){ return it.index !== 46; }).length;
    var max = scorableCount * 4;
    // 第 46 题 (电话偏好) 特殊处理
    var phoneEarVal = (rec.qnr && rec.qnr.phoneEar) || null;

    var html = '';
    html += '<div style="padding:18px 20px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#f8fafc,#fff);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;">' +
        '<div style="font-size:18px;font-weight:700;color:#0f172a;">' + _esc(def.label) + '</div>' +
        '<span style="background:' + sevMeta.color + ';color:#fff;font-size:12px;font-weight:700;padding:4px 14px;border-radius:999px;white-space:nowrap;">' + sevMeta.label + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
        (def.detail ? '<span>' + _esc(def.detail) + '</span>' : '') +
        '<span>区域 ' + def.range[0] + ' - ' + def.range[1] + ' 题</span>' +
        '<span style="color:' + sevMeta.color + ';font-weight:600;">' + regionScore + ' / ' + max + ' 分</span>' +
      '</div>' +
    '</div>';
    html += '<div style="max-height:60vh;overflow-y:auto;padding:8px 4px;">';
    if (!itemsInRegion.length) {
      html += '<div style="padding:24px;text-align:center;color:#94a3b8;">该分区暂无题目</div>';
    }
    itemsInRegion.forEach(function(it) {
      // 第 46 题特殊展示
      if (it.index === 46) {
        var earLabel = (data.PHONE_EAR_OPTIONS || []).find(function(o){ return o.value === phoneEarVal; });
        html += '<div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:12px;">' +
          '<div style="flex:0 0 36px;font-size:13px;font-weight:700;color:#0d9488;text-align:center;padding-top:2px;">Q' + it.index + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:14px;color:#0f172a;line-height:1.6;">' + _esc(it.text) + '</div>' +
            '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:11px;color:#64748b;">📞 电话偏好侧 (不计入总分)</span>' +
              (earLabel ? '<span style="background:#0d9488;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:999px;">' + _esc(earLabel.label) + '</span>' : '<span style="color:#94a3b8;font-size:12px;">未作答</span>') +
            '</div>' +
          '</div>' +
        '</div>';
        return;
      }
      // 普通题目: 显示患者作答分数
      var score = answers[String(it.index)];
      var chip = (score !== undefined && score !== null)
        ? _scoreChipMeta(score)
        : { color:'#cbd5e1', label:'未作答' };
      var scoreColor = (score !== undefined && score !== null) ? chip.color : '#cbd5e1';
      var scoreText = (score !== undefined && score !== null) ? (score + ' · ' + chip.label) : '未作答';
      html += '<div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:12px;">' +
        '<div style="flex:0 0 36px;font-size:13px;font-weight:700;color:#475569;text-align:center;padding-top:2px;">Q' + it.index + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;color:#0f172a;line-height:1.6;">' + _esc(it.text) + '</div>' +
          '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            (it.side === 'L' ? '<span style="font-size:11px;color:#0284c7;background:#e0f2fe;padding:2px 8px;border-radius:6px;">左半球相关</span>' : '') +
            (it.side === 'R' ? '<span style="font-size:11px;color:#ea580c;background:#ffedd5;padding:2px 8px;border-radius:6px;">右半球相关</span>' : '') +
            '<span style="background:' + scoreColor + ';color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:999px;min-width:60px;text-align:center;">' + scoreText + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  // XSS 防护
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 显示弹层
  function showRegionDetail(rec, regionId) {
    // 已有则先关
    closeRegionDetail();
    var overlay = document.createElement('div');
    overlay.id = 'qnr-region-detail-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:35000;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;animation:qnr-fade-in 0.18s ease-out;';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:85vh;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,0.35);display:flex;flex-direction:column;animation:qnr-scale-in 0.18s ease-out;';
    // 头部 + 关闭
    var headerHtml = '<button id="qnr-region-detail-close" aria-label="关闭" style="position:absolute;top:12px;right:12px;width:32px;height:32px;border:none;background:rgba(0,0,0,0.05);border-radius:50%;cursor:pointer;font-size:18px;color:#475569;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(0,0,0,0.1)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.05)\'">×</button>';
    card.style.position = 'relative';
    card.innerHTML = headerHtml + _renderModal(rec, regionId);
    overlay.appendChild(card);
    // 样式 (一次性注入)
    if (!document.getElementById('qnr-region-detail-style')) {
      var style = document.createElement('style');
      style.id = 'qnr-region-detail-style';
      style.textContent = '@keyframes qnr-fade-in{from{opacity:0}to{opacity:1}}@keyframes qnr-scale-in{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}';
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    // 绑定关闭
    document.getElementById('qnr-region-detail-close').addEventListener('click', closeRegionDetail);
    // 点击背景关闭
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeRegionDetail();
    });
    // ESC 关闭
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        closeRegionDetail();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function closeRegionDetail() {
    var ov = document.getElementById('qnr-region-detail-overlay');
    if (ov) ov.remove();
  }

  // 暴露 API
  global._qnrShowRegionDetail = showRegionDetail;
  global._qnrCloseRegionDetail = closeRegionDetail;
})(window);
