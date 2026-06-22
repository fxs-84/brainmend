(function(){
  // 版本标记 (用于诊断缓存问题, 浏览器控制台输入 window.__cogFlowVersion 验证)
  window.__cogFlowVersion = 'v4-positive-confirm-2026-06-19';
  // ========== CONFIG ==========
  // 模块描述取自对应测试题文件的 fillText 真源 (非编造)
  // 来源: dist-stable/assets/cognitive/cognitive-*.js
  var MODULES = [
    {id:'attention',   name:'注意力',       icon:'🎯', cat:'A', desc:'考验你能否快速找出差异的能力，分数越高代表你观察细节的能力越强。'},
    {id:'shortmem',    name:'短暂视觉记忆', icon:'👁️', cat:'B', desc:'考验你记住画面的能力，分数越高，代表着你的记忆力越强。'},
    {id:'memory',      name:'文字记忆能力', icon:'📝', cat:'B', desc:'考验你大脑记住数字与文字的能力，分数越高代表着你记忆力越强。'},
    {id:'flex',        name:'变通能力',     icon:'🔄', cat:'C', desc:'考验你大脑灵活变通的能力，分数越高代表着你的思考方式越灵活。'},
    {id:'language',    name:'语言理解能力', icon:'💬', cat:'A', desc:'指理解和解释口头或书面语言的能力，分数越高代表你语言理解能力越强。'},
    {id:'reasoning',   name:'推理能力',     icon:'🧩', cat:'A', desc:'评估你的逻辑推理能力，分数越高代表着你越聪明。'},
    {id:'planning',    name:'规划能力',     icon:'📐', cat:'D', desc:'考验你提前计划的能力，分数越高代表着你规划未来的能力越强。'},
    {id:'scenerecall', name:'场景回忆能力', icon:'🏞️', cat:'C', desc:'考验你回忆特殊事件的能力，分数越高代表着你记忆力越强。'},
    {id:'memorg',      name:'记忆组织提取', icon:'🐒', cat:'C', desc:'考验你记住与处理复杂信息的能力，分数越高代表着你处理能力越强。'},
    {id:'inhibition',  name:'自制力',       icon:'🛡️', cat:'C', desc:'考验你在有干扰的情况下完成任务的能力，分数越高代表你的专注力越好。'},
    {id:'visual',      name:'视觉记忆提取', icon:'👁️', cat:'B', desc:'考验你记住复杂位置的能力，分数越高代表着你空间感越好。'},
    {id:'observation', name:'观察能力',     icon:'🔍', cat:'A', desc:'考验你能否看出细节的能力，分数越高代表观察能力越强。'}
  ];

  // 快速测试 (6项) 模块顺序与显示标签 — 报告精简版专用
  var QUICK6_ORDER = ['reasoning','scenerecall','shortmem','attention','memory','visual'];
  var QUICK6_LABELS = {
    reasoning:   '推理能力',
    scenerecall: '场景回忆',
    shortmem:    '短暂记忆',
    attention:   '注意力',
    memory:      '文字记忆',
    visual:      '视觉记忆'
  };

  var MODULE_SHORT = {
    attention:'注意力', shortmem:'短暂记忆', memory:'文字记忆', flex:'变通',
    language:'语言理解', reasoning:'推理', planning:'规划', scenerecall:'场景回忆',
    memorg:'记忆组织', inhibition:'自制力', visual:'视觉记忆', observation:'观察'
  };

  var BRAIN_REGIONS = ['左额叶','右额叶','左顶叶','右顶叶','左枕叶','右枕叶','左颞叶','右颞叶','左小脑','右小脑'];

  // Brain region weights: 12 modules x 10 regions (证据驱动稀疏矩阵)
  //   依据 fMRI meta-analysis 文献: 每模块只投射 2-3 个主导脑区 + 小脑全域均匀调控
  //   [0]左额叶 [1]右额叶 [2]左顶叶 [3]右顶叶 [4]左枕叶 [5]右枕叶 [6]左颞叶 [7]右颞叶 [8]左小脑 [9]右小脑
  var BRAIN_WEIGHTS = {
    attention:    [0.37,0.49,    0,0.06,    0,    0,    0,    0,0.04,0.04],
    shortmem:     [   0,    0,0.21,0.21,0.25,0.28,    0,    0,0.03,0.02],
    memory:       [0.28,    0,    0,    0,    0,    0,0.48,0.18,0.03,0.03],
    flex:         [0.32,0.48,    0,    0,    0,    0,0.14,    0,0.03,0.03],
    language:     [0.28,    0,    0,    0,    0,    0,0.52,0.14,0.03,0.03],
    reasoning:    [0.39,0.33,0.14,0.06,    0,    0,    0,    0,0.04,0.04],
    planning:     [0.50,0.30,    0,0.14,    0,    0,    0,    0,0.03,0.03],
    scenerecall:  [   0,    0,    0,    0,0.10,0.24,0.28,0.32,0.03,0.03],
    memorg:       [0.32,    0,    0,    0,    0,    0,0.44,0.18,0.03,0.03],
    inhibition:   [0.32,0.62,    0,    0,    0,    0,    0,    0,0.03,0.03],
    visual:       [   0,    0,    0,0.30,0.28,0.36,    0,    0,0.03,0.03],
    observation:  [   0,    0,0.15,0.25,0.24,0.32,    0,    0,0.02,0.02]
  };

  // ========== CLOUD CONFIG (GitHub API — 报告存仓库 data/reports/) ==========
  var CLOUD_ENABLED = true;
  var GH_REPO = 'fxs-84/brainmend';
  var GH_API = 'https://api.github.com/repos/' + GH_REPO + '/contents/data/reports/';
  function _ghToken() { try { return localStorage.getItem('cog_gh_token') || ''; } catch(e) { return ''; } }
  // URL传token: ?token=xxx 或 &token=xxx (QR码场景, 患者扫码自动获取)
  (function(){
    try {
      var m = location.search.match(/[?&]token=([^&]+)/);
      if (m && m[1]) { localStorage.setItem('cog_gh_token', decodeURIComponent(m[1])); }
    } catch(e) {}
  })();

  // ========== 年龄分层常模 (儿童发育校正系数) ==========
  // 乘数: 儿童原始分 × 系数 = 成人等效分, 用于阈值比较
  var AGE_FACTORS = {
    //              6-8岁  9-12岁  13-17岁  18+
    attention:    [1.50,  1.25,   1.15,   1.00],
    shortmem:     [1.60,  1.30,   1.15,   1.00],
    memory:       [1.50,  1.25,   1.15,   1.00],
    flex:         [1.60,  1.30,   1.15,   1.00],
    language:     [1.20,  1.10,   1.10,   1.00],
    reasoning:    [1.60,  1.30,   1.15,   1.00],
    planning:     [1.80,  1.40,   1.15,   1.00],
    scenerecall:  [1.40,  1.20,   1.10,   1.00],
    memorg:       [1.40,  1.20,   1.10,   1.00],
    inhibition:   [2.20,  1.45,   1.20,   1.00],
    visual:       [1.15,  1.10,   1.10,   1.00],
    observation:  [1.15,  1.05,   1.05,   1.00]
  };
  // 脑型内外向阈值 (儿童脑活跃度天然更高)
  var AGE_EXTRO_THRESHOLD = [75, 72, 70, 65]; // 6-8, 9-12, 13-17, 18+
  function getAgeGroupIdx(age) {
    var a = Number(age) || 30;
    if (a <= 8) return 0;
    if (a <= 12) return 1;
    if (a <= 17) return 2;
    return 3;
  }
  function ageFactor(age, moduleId) {
    var idx = getAgeGroupIdx(age);
    var facs = AGE_FACTORS[moduleId];
    return facs ? facs[idx] : 1.0;
  }
  // 分数上限: 儿童(<18) 200 保留高分段区分度; 成人(>=18) 150 沿用旧量表
  function getScoreCap(age) {
    return (age && Number(age) < 18) ? 200 : 150;
  }

  // ========== SCORE NORMALIZATION ==========
  function normalizeScore(mod, raw) {
    var cat = mod.cat;
    if (cat === 'A') {
      // Timed: completionRate × accuracy × 150
      // 公式: 分数 = 完成率系数 × 正确率 × 满分
      //   - 完成率 = 实际题数 / 基准题数 (5s/题基准: 60s=12, 90s=18)
      //   - 正确率 = 正确数 / 实际题数
      // 设计理由: 同样时间内做对5题, 12题做完对5题 (acc=42%) vs 6题做完对5题 (acc=83%)
      //   后者虽然题数少, 但反应速度快/审题快, 应该得分更高
      var s = raw.score || raw.correct || 0;
      var t = raw.trials || 0;
      var cr = Number(raw.completionRate) || 0;
      if (t <= 0) t = 1;
      var acc = Math.min(1, s / t);
      // completionRate 来自 __scoring.computeCompletionRate(t, BASELINE[mod.id])
      // 兜底: 如果没有该字段, 用 trials/12 估算
      var crEff = cr > 0 ? cr : Math.min(1, t / 12);
      return Math.min(150, Math.max(5, Math.round(crEff * acc * 150)));
    }
    if (cat === 'B') {
      // 记忆广度: 起始值=正常(~90), 每多1位+15, 正确率加成最多50
      var span = raw.digitCount || 5;
      var initSpan = (mod.id === 'memory') ? 6 : 5;
      var correct = raw.correct || 0;
      var trials = raw.trials || 1;
      var spanScore = 40 + Math.max(0, span - initSpan) * 15;
      var accBonus = (correct / Math.max(trials, 1)) * 50;
      return Math.min(150, Math.max(5, Math.round(spanScore + accBonus)));
    }
    if (cat === 'C') {
      // scenerecall / memorg: 起始5个=正常(~90), 每多1个+15, 8个全对=卓越(135)
      var peakItems = raw.totalIcons || raw.totalCards || 0;
      if (peakItems > 0) {
        var c = raw.correct || 0;
        var t = raw.trials || 1;
        var spanScore = 40 + Math.max(0, peakItems - 5) * 15;
        var accBonus = (c / Math.max(t, 1)) * 50;
        return Math.min(150, Math.max(5, Math.round(spanScore + accBonus)));
      }
      // flex / inhibition: 纯正确率
      var c2 = raw.correct || 0;
      var t2 = raw.trials || 1;
      var acc2 = c2 / Math.max(t2, 1);
      var s = acc2 * 150;
      // Speed bonus for inhibition
      if (mod.id === 'inhibition' && raw.rtTotal && t2 > 0) {
        var avgRT = raw.rtTotal / t2;
        var speedMod = Math.max(0, 1 - (avgRT / 3000)) * 0.2;
        s = acc2 * 150 * (1 + speedMod);
      }
      return Math.min(150, Math.max(5, Math.round(s)));
    }
    if (cat === 'D') {
      // Planning: level × stepEfficiency × 150
      // 公式: 分数 = (level/10) × 步数效率 × 满分
      //   - level 反映关卡难度 (1-10 关)
      //   - stepEfficiency = optimal / moves (实际步数越接近最优, 效率越高)
      // 设计理由: 同样通过第3关, 用8步 vs 12步, 后者规划能力更差
      var lv = raw.level || 1;
      var se = Number(raw.stepEfficiency) || 0;
      if (se <= 0) se = 0.5; // 兜底
      if (se > 1) se = 1;
      return Math.min(150, Math.max(5, Math.round((lv / 10) * se * 150)));
    }
    return 50;
  }

  function normalizeAllScores(rawLog) {
    var scores = {};
    MODULES.forEach(function(m) {
      var raw = rawLog[m.id] || {};
      scores[m.id] = normalizeScore(m, raw);
    });
    return scores;
  }

  function getScoreBand(score, modId, age) {
    var adj = Math.min(getScoreCap(age), score * (age ? ageFactor(age, modId || "") : 1.0));
    if (adj >= 120) return 3;
    if (adj >= 90) return 2;
    if (adj >= 60) return 1;
    return 0;
  }

  function getScoreColor(score, modId, age) {
    var adj = (age && modId) ? Math.min(getScoreCap(age), score * ageFactor(age, modId)) : score;
    if (adj >= 120) return '#22c55e';
    if (adj >= 90) return '#3b82f6';
    if (adj >= 60) return '#f59e0b';
    return '#ef4444';
  }

  function getScoreLabel(score, modId, age) {
    var adj = (age && modId) ? Math.min(getScoreCap(age), score * ageFactor(age, modId)) : score;
    if (adj >= 120) return '优秀';
    if (adj >= 90) return '正常';
    if (adj >= 60) return '功能低下';
    return '需要关注';
  }

  function getPercentile(score, modId, age) {
    var adj = Math.min(getScoreCap(age), score * (age ? ageFactor(age, modId || "") : 1.0));
    if (adj >= 131) return 95;
    if (adj >= 111) return 80;
    if (adj >= 90) return 60;
    if (adj >= 61) return 45;
    if (adj >= 31) return 25;
    return 5;
  }

  // 排名文案 (假设 50 人排名场景)
  // 匹配样例: pct=70.91 → "您位于第 15 名, 短期内可提升 11 名"
  function getRankInfo(pct) {
    var rank = Math.max(1, Math.ceil((100 - pct) * 50 / 100));
    var target = Math.max(1, Math.ceil(pct / 20));
    var improve = Math.max(0, rank - target);
    return { rank: rank, improve: improve };
  }

  // 10 人金字塔: 行数 1+2+3+4=10
  // 位置 1-10, 颜色: 排名高于用户=深青, 用户及以下=浅青, 用户位置加描边高亮
  function getPyramidSVG(pct) {
    var rank = Math.max(1, Math.min(10, Math.ceil((100 - pct) / 10)));
    var rows = [1, 2, 3, 4];
    var pos = 1;
    var darkColor = '#1ab9c5';   // 排名靠前 (深青)
    var lightColor = '#a7e6e8';  // 用户及之后 (浅青)
    var borderColor = '#0e7a82';
    var svg = '<svg viewBox="0 0 200 152" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:400px;height:auto;display:block;margin:0 auto;">';
    rows.forEach(function(rowCount, rowIdx) {
      var rowWidth = rowCount * 24 + (rowCount - 1) * 6;
      var startX = (200 - rowWidth) / 2;
      var y = 6 + rowIdx * 36;
      for (var i = 0; i < rowCount; i++) {
        var x = startX + i * 30;
        var isUser = (pos === rank);
        var isAbove = (pos < rank);
        var fill = isAbove ? darkColor : lightColor;
        var stroke = isUser ? borderColor : 'none';
        var strokeW = isUser ? 1.8 : 0;
        svg += '<g transform="translate(' + x + ',' + y + ')">';
        svg += '<circle cx="12" cy="7" r="6" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + strokeW + '"' : '') + '/>';
        svg += '<path d="M 3 24 Q 3 15 12 15 Q 21 15 21 24 Z" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + strokeW + '"' : '') + '/>';
        svg += '</g>';
        pos++;
      }
    });
    svg += '</svg>';
    return svg;
  }

  // ========== BRAIN REGION COMPUTATION ==========
  function computeBrainRegions(scores, age, isQuick6) {
    var regions = {};
    BRAIN_REGIONS.forEach(function(r) { regions[r] = 0; });
    var totals = {};
    BRAIN_REGIONS.forEach(function(r) { totals[r] = 0; });

    var targetMods = isQuick6 ? QUICK6_ORDER : MODULES.map(function(m){ return m.id; });
    targetMods.forEach(function(modId) {
      var m = MODULES.find(function(x){ return x.id === modId; });
      if (!m || scores[modId] == null) return;
      var w = BRAIN_WEIGHTS[modId];
      var raw = scores[modId];
      var adj = Math.min(getScoreCap(age), raw * (age ? ageFactor(age, modId) : 1.0));
      w.forEach(function(weight, ri) {
        regions[BRAIN_REGIONS[ri]] += adj * weight;
        totals[BRAIN_REGIONS[ri]] += weight;
      });
    });

    var result = {};
    BRAIN_REGIONS.forEach(function(r) {
      result[r] = totals[r] > 0 ? Math.min(getScoreCap(age), Math.round(regions[r] / totals[r])) : 50;
    });
    return result;
  }

  function getRegionColor(score) {
    // 150分制: ≥135卓越 120-134优秀 90-119正常 65-89低下 ≤64障碍
    if (score >= 135) return '#dc2626';
    if (score >= 120) return '#f97316';
    if (score >= 90) return '#ffffff';
    if (score >= 65) return '#93c5fd';
    return '#2563eb';
  }

  function getRegionStroke(score) {
    // 白色填充需深色描边以保证可见
    return score >= 120 && score < 135 ? '#94a3b8' : getRegionColor(score);
  }

  function getRegionStatus(score) {
    if (score >= 135) return '卓越';
    if (score >= 120) return '优秀';
    if (score >= 90) return '正常';
    if (score >= 65) return '低下';
    return '障碍';
  }

  // ========== ANALYSIS TEXT (段落式细腻风格) ==========
  var ANALYSIS = {
    attention: {
      0:{study:'你的注意力控制存在明显薄弱环节。学习时对周围环境的任何干扰都很敏感，一有人走动、声响或手机提示，注意力就会被拉走。结果可能是考试时前面花了太多时间，后面根本来不及看。建议先从短时间的专注练习开始。',work:'工作中你容易被次要的事务或外界诱惑吸引，难以坚持完成原本的任务。这可能表现为频繁刷手机、中途切换任务，导致工作效率低下。在需要深度思考的工作场景中尤其吃亏。',social:'你在社交中缺乏耐心，容易冲动插话或打断对方，不能保持长时间的专注倾听。对方可能会觉得你没有认真听他们说话，从而影响人际关系。建议有意识地练习倾听时不看手机，先听完再回应。'},
      1:{study:'你的注意力水平处于正常偏低的范围。安静时尚能专注，但一旦面对复杂度提升或时间压力，就容易走神分心。考试中可能在非关键细节上耗光了时间，却漏掉了真正的得分点。',work:'在工作环境相对安静时你可以保持基本专注，但多任务并行或遇到噪音干扰时，效率就会下降。需要提醒自己定时休息，避免注意力疲劳累积。',social:'你能维持基本社交交流，但聊久了容易走神，有时会错过对方表达的微妙信息。建议在重要对话中有意识地总结对方的话，帮助自己保持专注。'},
      2:{study:'你的注意力处于良好水平。学习时能够有效过滤无关干扰，将精力聚焦在关键内容上。即使在有一定噪音的环境中，也能够维持足够的专注度完成学习任务。',work:'面对多任务同时推进的工作场景，你能够合理分配注意力，优先处理重要紧急的事务。在团队协作中，你的专注表现也能带动周围的同事保持投入。',social:'你的社交注意分配合理，能够在多人交谈中保持对核心对象的关注，同时捕捉到关键信息。倾听与回应节奏自然，让对方感受到被重视。'},
      3:{study:'你的注意力堪称卓越。无论环境如何变化，你都能迅速锁定目标、屏蔽干扰。面对大量学习材料，你善于抓取框架和要点，而不是被细节淹没。这是高效学习者的核心特质。',work:'在多线程高压环境下，你依然能保持极高的工作效率。不仅自己对焦准确，还能感知团队整体的注意力分配状况，适时提醒关键节点的关注点。',social:'你有着出色的社交注意力。不仅能专注倾听，还能同步观察对方的微表情、语气变化和肢体语言，洞察比语言更多的信息。这让你的社交互动既深入又高效。'}
    },
    shortmem: {
      0:{study:'你的短暂视觉记忆功能存在明显困难。课堂上老师刚展示完的板书或PPT，你看完转眼就难以准确回忆关键信息。这意味着你需要在课后花费更多时间回看材料才能消化课堂内容。',work:'面对即刻呈现又立刻消失的视觉信息，比如屏幕上的弹窗提示、数据仪表盘的实时变化，你往往需要截图保存或反复确认才能把握住要点。这在快节奏工作场景中是一个效率瓶颈。',social:'在社交中，你可能很快就忘记了对方的面部表情变化或着装细节。虽然这不影响基本的交流，但会削弱你建立亲密关系的能力，因为对方期待被记住的那些小细节你没有捕捉到。'},
      1:{study:'你的短暂视觉记忆在正常范围偏下。对于新呈现的视觉信息，你可以记住主要轮廓，但细节容易丢失。比如看到一个复杂的图表，大致结构记住了，数值和标注却可能需要再看一遍。',work:'在需要快速整合视觉信息的工作场景中，比如同时对比多个屏幕、多份资料，你可能会感到吃力。建议养成快速笔记的习惯，把视觉信息及时转化为文字辅助记忆。',social:'你大约能回忆起社交场合中对方的整体形象和基本行为，但对微妙的非语言细节——比如对方说话时的眼神变化、手势转换——印象模糊。这是可以通过有意识练习来提高的。'},
      2:{study:'你的短暂视觉记忆处于良好水平。对于即刻呈现的视觉信息，你能够较为完整地保留几分钟，并在需要时准确提取。这使你在观看教学视频或现场演示时，不容易遗漏关键步骤。',work:'你能够在本就多变的视觉信息流中保持有效的即时记忆，例如记住仪表盘上的读数变化趋势、整理刚刚浏览的多份文档的核心内容。这使得你在信息密集型工作中不掉链子。',social:'在社交互动中，你能够清晰记住刚刚发生的对话中的关键视觉信息——对方的表情、手势、以及周围环境的变化。这让你在后续交流中能够自然地引用这些细节，增强互动质量。'},
      3:{study:'你的短暂视觉记忆能力非常出色。你就像拥有一个高效的视觉缓存，眼前闪过的任何画面都能被你短暂而精准地保留。这种能力让你在学习新技能时如虎添翼，看一遍就能掌握动作要领。',work:'在工作中，你善于同时追踪多路视觉信息，无论是实时数据流还是多个显示器的内容，切换之间游刃有余。这种短暂记忆的容量和精度，是很多高效职场人士梦寐以求的能力。',social:'社交场合中，你能够精准捕捉并短暂记住对方的每一个微小表情和肢体动作。这让你对当下的社交氛围有极强的感知力，总能做出最恰当的回应。'}
    },
    memory: {
      0:{study:'你的文字记忆能力明显低于平均水平。学习时你需要反复阅读同一段文字好几遍才能留下印象，考试中尤其是需要背诵的科目会非常吃力。你可能已经习惯了用图表、视频等辅助手段来弥补文字记忆的不足。',work:'在工作中你严重依赖笔记、待办清单和手机提醒。这不是好习惯，而是因为如果没有这些外部工具，你很容易忘记任务内容、截止日期和关键数据。这会增加出错和延误的风险。',social:'你在社交中容易忘记刚认识的人的名字、之前聊过的话题和约定。这会在无意中得罪人，因为对方会觉得你不够重视。建议在初次见面后有意识地重复对方的名字来强化记忆。'},
      1:{study:'你的文字记忆能力处于正常偏低的水平。对于中等篇幅的文字材料，你可能需要多读一两遍才能真正掌握内容。考试复习时比别人多花一些时间，但只要肯下功夫，还是能拿到不错的成绩。',work:'处理工作中的书面信息时，你可能偶尔需要回头确认细节——比如邮件里的数据、会议纪要中的关键决议。虽然不至于遗漏重要信息，但这会拉低你的工作效率。',social:'在社交中，你能记住对方大致说过什么，但具体的人名、日期、地点可能需要对方再提醒一次。你可以在对话中有意复述关键点，这既能确认理解也能帮助记忆。'},
      2:{study:'你的文字记忆水平良好。对于课堂上听讲的内容和阅读的材料，你能够有效吸收并在一段时间内保持准确记忆。考试前不需要疯狂刷题也能回忆起大部分知识点。',work:'工作中你能够准确记住邮件内容、会议细节和任务要求，不需要频繁回头确认。这让你的工作节奏流畅，也让同事对你产生信赖感。',social:'你能清晰记住社交中的重要信息——对方的名字、职业、上次聊过的内容。再次见面时自然地提到这些细节，会让对方感到被尊重和重视。'},
      3:{study:'你的文字记忆能力非常突出。听过一遍的讲座内容、看过一遍的文件，你就能在大脑中形成清晰的记录。这种"过目不忘"的特质让你在学业和事业中都占据显著优势。',work:'在工作中，你是团队里的"活档案"。别人还在翻邮件找数据时，你已经准确说出了上周会议的决议和数字。这种能力让你在同事眼中格外可靠。',social:'你的记忆力让人羡慕——见过一次的人你能叫出名字，聊过的内容几个月后你还能精准引用。这种能力是建立深厚社交关系的利器。'}
    },
    flex: {
      0:{study:'你的思维变通能力存在明显不足。面对一个新的学习方法，你倾向于继续用自己熟悉但不一定高效的方式。这意味着你可能会用"死记硬背"的方式去应对需要理解应用的课程，最终事倍功半。',work:'你在工作中偏好按固定流程操作，一旦遇到计划外的状况就容易卡住。你可能不是不会解决，而是大脑的"惯性"太强，切换思路需要比较长的时间。这在新环境或快节奏岗位上是明显的短板。',social:'你在社交中显得比较固执己见，很难接受与自己不同的观点。当对话中出现分歧时，你倾向于坚持原有立场而不是尝试理解对方的逻辑。这会让身边的人逐渐减少与你深入交流的意愿。'},
      1:{study:'你的思维灵活性处于正常范围偏低。你已经习惯了某些学习方式，当老师突然改变教学方法时，你需要一段适应时间才能跟上节奏。你可以在日常中刻意练习用不同方法解同一道题来锻炼思维的弹性。',work:'面对工作中的突发状况或需求变更，你会先感到一阵不适和抗拒，需要一点时间才能调整过来。虽然最终能适应，但这个"切换成本"会让你在节奏快的工作环境中略显吃力。',social:'在社交互动中，当场面突然转向你不熟悉的领域或发生尴尬状况，你可能不太能灵活应对，会不由自主回到自己擅长的话题。慢慢学会接受"不确定"的感觉，对提升社交变通很有帮助。'},
      2:{study:'你的思维变通能力处于良好水平。你能根据不同的学习内容和场景，灵活切换学习策略。比如知道什么时候该细读、什么时候该略读，这使你的学习效率优于大多数人。',work:'你能够从容应对工作中的变化和挑战。方案被打回、需求临时变更——这些都不会让你慌乱，你总能快速找到替代方案。这种弹性是你职场竞争力的重要组成部分。',social:'社交场合中，你能根据不同的人和不同的氛围调整自己的交流和表达方式。在正式的商务场合和轻松的朋友聚会间切换自如，让人感觉和你相处很舒服。'},
      3:{study:'你的思维极其灵活变通。面对全新的学习领域，你几乎不需要"适应期"就能找到有效的学习方法。你不是只依赖一种方式，而是本能地组合多种策略去攻克难点。',work:'你是天生的创新者。当常规方案行不通时，你不会纠结，而是迅速跳出框架找到新的解法。这种"此路不通绕道走"的本能在高度不确定性的环境中是无价之宝。',social:'你的社交变通能力是一流的。不管面对什么类型的人——强势的、敏感的、沉默的——你都能找到最合适的互动方式。你不是在"扮演"，而是真的能灵活切换视角去理解不同的人。'}
    },
    language: {
      0:{study:'你在理解复杂文字材料方面存在明显困难。阅读长篇段落时容易迷失在字里行间，抓不到作者真正想表达的核心意思。做题时可能因为误解题干而答非所问，即使知识本身是掌握的。',work:'工作中面对书面指令、政策文件或技术文档时，你可能会感到力不从心。一些模棱两可的表述会让你困惑，而你的同事可能一眼就懂了。这会拖慢你的工作进度，也可能导致理解偏差带来执行错误。',social:'在需要精确理解对方言语的社交场合——比如谈判、重要讨论——你可能无法准确判断对方的真实意图。你听到的只是表面的字句，而不是话里的弦外之音。这让你在复杂社交博弈中处于弱势。'},
      1:{study:'你的语言理解能力处于正常偏低水平。面对普通阅读材料你可以理解，但遇到带条件性的复杂语句或含有多层逻辑的段落时，理解速度会明显下降。你可以在阅读时尝试用自己的话复述每个段落来加深理解。',work:'处理日常工作指令和邮件你没有太大问题，但遇到表述不够清晰或有多重解释的文档时，你可能会误解其中的某些细节。建议在重要任务上口头向对方确认你的理解是否正确。',social:'你能理解日常对话和社交表达，但当对方用到讽刺、双关或含蓄的表达时，你可能会揣摩半天或完全错过。多注意对方说话时的语气和语境，能帮助你更好地理解话外之音。'},
      2:{study:'你的语言理解能力良好。无论是课堂上的口头讲授还是课后的阅读材料，你都能精准理解核心意思，不会出现因误解而答错题的情况。你还能有效提炼阅读材料中的关键信息，形成自己的理解框架。',work:'你能准确理解各种书面指令和文档，即便是带有行业术语和复杂表述的材料，你也能读懂并执行。你的表达也同样清晰，让接收方不容易产生误解。',social:'在社交互动中，你不仅能理解直白的表达，也能听得懂含蓄的暗示和委婉的拒绝。这种"听得懂"的能力让你的人际关系处理更加圆融。'},
      3:{study:'你的语言理解能力非常出色。你不只是在读文字，而是在"解码"作者真正的意图和立场。面对晦涩的专业论文、复杂的法律条文，你也能快速穿透表面的语言找到核心逻辑。',work:'在工作中，你是团队里解读复杂文档和政策的"翻译官"。别人还在纠结某句话到底什么意思时，你已经提炼出了关键要点和行动方案。这种能力让你在任何需要信息处理的岗位上都是核心人才。',social:'你的社交语言理解力极强。你听得出对方话里的情绪、立场、隐藏的诉求。你往往在别人还没开口提问时就已经理解了他们的困惑。这让你的社交深度远超常人。'}
    },
    reasoning: {
      0:{study:'你的逻辑推理能力存在明显薄弱环节。在面对需要多步推导的问题时，你容易在中途迷失方向，或者只看到表面信息而无法深入挖掘背后的规律。数学、理化等需要严密逻辑的学科会让你感到特别吃力。',work:'在工作中，面对需要系统性分析和推理的复杂问题时，你可能难以构建清晰的解决思路。遇到突发状况时，容易凭直觉做出反应而非经过理性推敲，这可能导致决策失误。',social:'在需要理性判断的社交情境中，你可能容易被情绪或表面信息误导，做出不够合理的判断。比如轻信他人表面言辞而忽略行为逻辑中的矛盾点。'},
      1:{study:'你的推理能力处于正常偏低水平。简单直接的推理你没问题，但遇到需要多步骤层层推导的复杂问题，解题速度会下降，偶尔也会走弯路。建议多练习"为什么"的追问，每次得出答案后再问自己"那又怎么样"。',work:'你能应对日常工作中需要逻辑判断的场景，但遇到需要系统分析的问题时，推理过程可能会有些磕磕绊绊。可以通过画思维导图或列出推理步骤来帮助自己梳理思路。',social:'在社交中你能做出基本合理的判断，但遇到复杂的人际矛盾——比如谁在说谎、谁在挑拨——分析起来可能不够精准。学会把行为和动机分开分析，对提升社交推理有帮助。'},
      2:{study:'你的逻辑推理水平良好。你可能不觉得自己在刻意"推理"，因为这种能力已经内化成了日常思维的一部分。你善于从一堆杂乱的信息中发现规律和关联。',work:'你能够系统性地分析工作中的复杂问题，不会满足于表面原因，而是习惯性地追问根本原因。这种分析深度让你提出的解决方案比别人更有说服力。',social:'在社交中，你善于透过现象看本质。你不会轻易被华丽的说辞打动，而是会综合对方的言行来判断其真实意图。这种理性和敏锐的结合让你不容易在人际关系中吃亏。'},
      3:{study:'你的推理能力堪称出色。你天生善于发现隐藏的模式和规律，能从别人注意不到的细微线索中推导出完整图景。任何需要逻辑思考的学科对你来说都是舒适区。',work:'在你的团队中，你是那个总能提出"对了我们为什么不想想这个角度"的人。你擅长在迷雾中找到方向，在复杂问题中搭建分析框架。这种能力是高级决策层的核心素质。',social:'你对人际关系的洞察力极强。你能从一个人的行为模式、言语逻辑和情绪变化中，精准判断他的性格、动机和可能的下一步行动。这不是"读心术"，而是卓越的社交推理。'}
    },
    planning: {
      0:{study:'你的规划能力存在明显的不足。你可能经常到了考试前几天才发现要复习的内容堆积如山，之前完全没有合理分配时间。不是因为不努力，而是没有"目标-时间-步骤"的规划意识。',work:'在工作中，你不擅长在多个任务之间按轻重缓急排序。经常是哪个催得急就做哪个，导致真正重要但不紧急的事情不断被延期。这种工作方式会让你长期处于被动和救火的状态。',social:'你的社交安排比较随性，很少主动规划与重要关系人的互动时间。朋友们可能会觉得你"总是很忙"或者"约不到"，而实际上你可能只是缺乏提前规划的习惯。'},
      1:{study:'你的规划能力在正常范围偏低。你也能制定学习计划，但执行到一半容易偏离或放弃。可能是计划定得太过理想化，或者遇到一点阻力就选择了妥协。建议从"本周只完成3件事"开始训练规划执行力。',work:'你在工作中能列出待办清单，但经常高估自己的完成能力，造成任务延迟。你可以尝试把大任务拆成更小的可执行步骤，每完成一步给自己一个心理确认。',social:'你希望维系好人际关系，但实际行动上常常是"想到了才联系"。试着把联络朋友放进你的日程规划里，哪怕只是发条消息，也能让关系保持温度。'},
      2:{study:'你的规划能力处于良好水平。你会为自己的学习设定清晰的目标和时间表，并且能够合理评估自己的能力和时间，制定出切实可行的计划。这是高效学习者的基本功。',work:'你在工作中善于根据任务的权重和紧急程度来安排优先级。今天该做什么、这周核心目标是什么、哪些可以适当推迟——这些在你的大脑里是一张清晰的地图。',social:'你有意识地规划社交活动，知道哪些关系需要花时间去维护、哪些可以保持适度的距离。你不会等到关系出问题了才去"修补"，而是有节奏地保持互动。'},
      3:{study:'你的规划能力非常出色。你不仅仅在学习上有计划，更有长远的个人发展规划。你清楚每个阶段的目标、所需资源和时间节点，并且能够根据外部变化灵活调整方案。',work:'你的规划能力在职场中是一大优势。你善于在项目启动前就把整个路线图勾勒出来，预判风险点和里程碑。团队跟着你的节奏走会很踏实。',social:'在人际关系方面，你有清晰的定位和策略。你知道什么类型的人适合深度交往、什么关系需要保持边界。你的社交布局是长期的、有战略性的，而不是临时抱佛脚。'}
    },
    scenerecall: {
      0:{study:'你的场景回忆能力显著低于平均水平。你对于课堂上的整个学习情境——比如老师当时怎么讲的、同学问了什么、黑板上的布局——记忆很模糊。这意味着你很难通过回忆上课场景来激活相关的知识记忆。',work:'在工作中，你可能记不清上次会议的具体情景：谁坐在哪里、谁说了什么、当时大家的表情和氛围如何。这让你在需要还原工作场景的细节时需要依赖他人或笔记，增加信息获取成本。',social:'在维护人际关系方面，你很难自然地聊起"你还记得上次我们一起..."这种话题，因为你大脑里的场景记录不够清晰。这会在无形中削弱你与他人建立深度连结的能力。'},
      1:{study:'你的场景回忆能力处于正常偏低水平。对于印象深刻的事件你能回忆起大致的轮廓，但当别人问起当时的细节——比如具体谁说了哪句话、当时的环境是怎样的——你的回答会有些含糊。',work:'你能够回忆工作中重要的会议或事件的框架内容，但对于场景中的细节印象不够清晰。你可能需要通过查看会议记录或邮件来补充缺失的场景信息。',social:'在与朋友交流时，你能回忆起共同经历的主要情节，但对方提到某些有趣的细节时你可能没什么印象。这无伤大雅，但会错过加深情感的契机。'},
      2:{study:'你的场景回忆能力处于良好水平。你能够较为清晰地回忆起过去学习和生活中的重要场景——不只是记住了信息，更是把"当时发生了什么"作为一个完整的画面存储了下来。',work:'在工作中，你能准确回忆起过往会议的场景信息：谁提了什么建议、大家的反应如何、最后怎么决定的。这是一项被低估的职场能力——你不需要频繁翻记录就能在讨论中提供有价值的历史信息。',social:'你有很好的"共同记忆"存储能力。和老朋友聊天时，你总能接上"记得那次我们..."的话题，并且补充有趣的细节。这种能力让朋友们觉得和你的关系是有厚度和温度的。'},
      3:{study:'你的场景记忆堪称"电影回放"。你能清晰回忆出过去场景中的每一个角色、每一句对话、每一个细节。这种能力让你在学习时能通过回忆上课场景就提取出大量相关信息。',work:'在工作中，你是天然的信息节点。你记得半年前的会议谁说了什么、决策背景是什么、当初为什么选择这个方案而不是另一个。你的存在就是团队的"场景档案馆"。',social:'你的朋友们常常惊叹于你对他们共同经历的记忆精确度——"你连这个都记得！"你善于用共享记忆来经营关系，让每一次互动都建立在有厚度的情感基础上。'}
    },
    memorg: {
      0:{study:'你对信息的组织和提取能力存在明显不足。学习时你可能记了很多知识点，但它们在大脑里是散乱的、没有建立关联的，导致考试时调用困难。你往往不是"不会"，而是"想不起来"。',work:'工作中面对大量需要归类和提取的信息，你可能缺乏有效的组织策略。常常出现"我明明在哪看过"却怎么也找不到的情况，或者信息提取速度远低于预期。这会拖慢整个任务的处理效率。',social:'在社交中，你有时会记混不同人告诉你的信息——把A说过的事错记成了B说的。或者无法迅速回想起之前和某人约定的细节，让人感觉你不够用心。'},
      1:{study:'你的记忆组织能力处于正常偏低水平。你能在大脑里对信息做基本的分类，但当信息量增大时，归类就会混乱，提取速度也会慢下来。建议试试思维导图或分类笔记来辅助记忆组织。',work:'你能完成日常工作中大部分信息整理任务，但面对大量文件、数据和来自不同渠道的信息时，组织效率会下降。可以考虑用标签、文件夹、备忘录等外部工具来弥补大脑的分类能力。',social:'在社交关系中你能记住大部分重要信息，但偶尔会出现张冠李戴的情况。你可以尝试在通讯录中给联系人标注特征或共同话题，帮助大脑更高效地组织社交信息。'},
      2:{study:'你的记忆组织能力良好。你善于将不同的信息按照其内在关联进行分类和标签化存储，需要时能够较快地提取出来。这种能力让你的学习和工作效率都不错。',work:'你对工作信息的整理有一套自己的方法——可能是有条理的文件夹系统、标签分类，或者是大脑里的"思维宫殿"。不管用哪种方式，你很少出现"找不着北"的情况。',social:'你能够清楚地记住不同社交关系中的关键信息，并且不会混淆。你知道每个人分别对什么话题感兴趣、还记得他们跟你说过的重要事情。这让你的社交互动总是有的放矢。'},
      3:{study:'你的记忆组织能力非常出色。你的大脑就像一个高效的数据库，自动对新信息进行分类、索引、关联。你不需要刻意去"记"，因为你学到的任何东西都自然地融入你的知识体系。',work:'工作中，你是团队的"知识中枢"。面对大量信息输入，你总能迅速理清脉络、建立框架，并且需要时立刻调取。你的信息管理能力让整个团队的协作效率都得到提升。',social:'你在社交中展现了高超的信息整合能力——从多个人的说法中拼出完整的人际关系图景，知道谁和谁是什么关系、谁偏袒谁、谁在防备谁。这种全局视角让你在复杂人际关系中游刃有余。'}
    },
    inhibition: {
      0:{study:'你的自制力存在明显欠缺。学习时你很难抵抗手机、游戏或其他娱乐诱惑的干扰，常常一分心就停不下来。你也知道应该专注，但"刹车"总是踩不下去。这直接导致你的学习时间大打折扣。',work:'在工作中你表现出明显的冲动倾向。想到什么就要立刻去做，很少先冷静分析一下再做决策。遇到让人恼火的情况时，你可能第一反应是直接发火或抱怨，而不是先深呼吸再看怎么处理。',social:'社交场合中你的冲动控制力弱。情绪上来时管不住嘴——气头上说的话、脱口而出的评价，往往事后才后悔。这种冲动的言行会让身边的人觉得和你相处需要"小心翼翼"。'},
      1:{study:'你的自制力处于正常偏低水平。大多数时候你能管住自己，但在压力大或诱惑特别大时，自我控制的"刹车"会失灵。比如学累了就报复性刷手机、吃了第一口就停不下来。',work:'在工作中你能基本保持克制，但面对让你特别烦躁的人或事时，偶尔还是会冲动行事或说出不该说的话。你事后会意识到自己不该那样，但当时就是没控制住。',social:'社交中你能维持基本的礼貌和风度，但在某些触发你情绪的话题或情境下，可能控制不住自己的反应。练习一些简单的冷静方法——比如在回应前默数三秒——会对你很有帮助。'},
      2:{study:'你的自制力处于良好水平。你能在需要的时候对自己说"不"，不管是要抵抗零食的诱惑、停止刷剧去学习，还是在社交场合控制住不恰当的言论。这种自控力为你的成功打下了坚实基础。',work:'你在工作中展现了良好的情绪和冲动控制能力。面对压力或挑衅时，你不会立刻反应，而是能够冷静下来思考后再决策。这种稳重让你赢得同事和上级的信任。',social:'在社交场合，你能得体地管理自己的言行。你知道什么话该说、什么不该说，什么时候该忍、什么时候该表态。这种分寸感让你的人际关系质量远远高于冲动控制差的人。'},
      3:{study:'你的自制力堪称卓越。诱惑对你来说似乎不太构成诱惑——不是你没有欲望，而是你的前额叶"刹车系统"极其强大，让你总能做出理性的选择。这种自控力是所有成功者的共同特质。',work:'工作中你是那个"风暴中的灯塔"——无论压力多大、情绪多复杂，你始终保持冷静和理性。你不让冲动主导决策，每一步都经过深思熟虑。同事会说"有你在就安心"。',social:'你的社交自制力令人印象深刻。即使在最激烈的争论中，你也能控制自己的言辞和情绪。你不说伤人的话、不做冲动的行为。这种自持和沉稳，让你在任何人际圈子中都备受尊重。'}
    },
    visual: {
      0:{study:'你的视觉记忆提取能力存在明显薄弱。给你看一张复杂的图表或地图，你很难在之后准确回忆起其中的空间布局和关键位置。这在需要空间记忆的学科如地理、生物解剖时会明显拖后腿。',work:'工作中，对于办公环境、文件摆放、屏幕布局等需要空间记忆的信息，你的记忆准确性不高。经常需要实际走到那儿或者重新打开文件才能确认"那个东西在哪"。',social:'在社交中，你可能很难通过回忆某个场合的场景来触发对应的记忆。比如朋友提起"上次在哪个餐厅的哪个位置"，你可能完全没有空间印象，只能尴尬附和。'},
      1:{study:'你的视觉记忆提取处于正常偏低水平。你能记住视觉场景的主要框架，但提取具体位置的细节时效率不高。比如知道"那个图标大概在某个网页上"，但要找到需要花时间浏览一下。',work:'你的空间记忆在工作场景中基本够用，但遇到需要精确回忆视觉布局的情况时——比如复现某个界面的设计、记住某个物品的精确位置——你可能需要实物参考。',social:'你对去过的地方、见过的人的外貌特征能保留大致印象，但当别人指望你"你应该记得他在哪个位置吧"，你的回答可能不够精确。这不是什么大问题，只是偶尔会让人失望。'},
      2:{study:'你的视觉记忆提取能力良好。你能够在需要时准确回忆起之前看过的视觉场景中的人和物的位置信息。学习解剖图、地理地图或其他需要空间定位的内容时，你的表现优于大多数人。',work:'你有良好的"空间记忆库"。记得文档放在哪个文件夹、上次会议的座位布局、某个APP的功能在哪个位置。这些看似不起眼的记忆，日积月累能帮你省下大量寻找时间。',social:'你能准确记住社交场合中的人物位置关系和场景布局。朋友可能不经意提到"上次在XX地方你坐在谁旁边"，而你能清晰地回忆起来。这种能力让你的社交记忆显得格外精准。'},
      3:{study:'你的视觉记忆提取能力极其出色。你对于空间和视觉信息有着过目不忘的能力。学习任何需要空间定位的学科对你来说都是优势领域——你看一遍地图就能画出来，看一眼解剖图就能默写下来。',work:'在工作中，你的空间记忆是核心竞争力之一。别人还在翻文件夹找资料的时候，你已经在大脑中"定位"到了目标信息的准确位置。你对于界面设计、空间布局的敏感性也远超同事。',social:'你有着摄影式的社交记忆——去过一次的地方永远不会走错、见过一面的人永远记得对方长什么样。这种能力让你在任何场合都显得靠谱从容。'}
    },
    observation: {
      0:{study:'你的观察能力存在明显薄弱。学习时你容易只见森林不见树木，忽略了题目中的陷阱词、图表里的细微差异等关键细节。考试中因粗心丢分的情况比较频繁——你可能不是不会做，而是没看仔细。',work:'对工作中的关键细节你可能不够敏感。一份合同里的细微条款差异、一封邮件中的语气暗示，容易被你忽略过去。这种对细节的"钝感"有时会导致理解偏差甚至失误。',social:'在社交互动中，你对他人细微的情绪变化、语气转折和肢体语言不够敏感。别人可能已经不高兴了，而你还浑然不知地继续说话。这种观察力的欠缺会让你无意中伤害他人感情。'},
      1:{study:'你的观察能力处于正常偏低水平。对于明显的差异和变化你能察觉，但细微的线索有时会漏掉。在快速阅读或浏览时尤其容易错过关键信息。建议培养"慢下来"的观察习惯。',work:'日常工作中你能把握大部分信息，但在审阅文件或检查结果时，偶尔会漏掉一些不显眼的错误或异常。你可以在完成重要任务后特地回头再检查一遍细节。',social:'你大约能感知到他人明显的情绪变化，但对于微妙的社交信号——比如一个一闪而过的眼神、语调的微微变化——有时会错过。多观察对方的眼睛和嘴角的变化，能帮助你提升社交敏感度。'},
      2:{study:'你的观察能力处于良好水平。你善于在繁杂的信息中捕捉到关键细节，无论是一处文字的差异、图像中的异常，还是他人表情的微妙变化。这种观察力让你的学习质量和工作质量都有保障。',work:'在工作检查和质量把控方面，你是可依赖的人。你能挑出别人容易忽略的错误、发现流程中的不合理之处。这种能力让你的工作质量经得起推敲。',social:'你的社交观察力不错。你能注意到对方的情绪变化、对新话题的反应、是否想要结束对话等信号。这让你的社交互动更体贴、更有分寸感。'},
      3:{study:'你的观察力堪称一绝。你几乎不会错过任何细节——文字中的错别字、画面中的违和感、一个人的微表情变化——这些都逃不过你的眼睛。这种能力让你在需要细心和精确的领域如鱼得水。',work:'你有着鹰眼般的敏锐度。工作中你能第一时间发现数据异常、流程漏洞和质量问题。你的存在本身就是一道质量防线——因为你看到的东西，其他人常常会漏掉。',social:'在社交中，你的观察力让你成为一个"读人"高手。你能从最细微的表情和语气变化中读出对方的真实情绪和想法。对方藏在心里的开心、不安、不耐烦——你都在他们还没开口前就已经看到了。'}
    }
  };

  function getAnalysis(modId, band) {
    var modAnalysis = ANALYSIS[modId];
    if (!modAnalysis) return ANALYSIS.attention[2];
    return modAnalysis[band] || modAnalysis[2];
  }

  // ========== REPORT GENERATION ==========
  function getPatientInfo() {
    var info = { name: '未知', age: '', gender: '', id: '' };
    // 最高优先级: window._cogPatientInfo (QR码直达患者, 防止被 bundle 覆盖)
    try {
      if (window._cogPatientInfo && window._cogPatientInfo.name) {
        info.name = window._cogPatientInfo.name;
        if (window._cogPatientInfo.age) info.age = String(window._cogPatientInfo.age);
        if (window._cogPatientInfo.gender) info.gender = window._cogPatientInfo.gender;
        if (window._cogPatientInfo.id) info.id = window._cogPatientInfo.id;
      }
    } catch(e0) {}
    // 从 window.D.clientInfo 读取 (真实客户档案, 但 bundle 可能未暴露 D)
    if (info.name === '未知') { try {
      if (window.D && window.D.clientInfo) {
        var ci = window.D.clientInfo;
        if (ci.name) info.name = ci.name;
        if (ci.age) info.age = String(ci.age);
        if (ci.gender) info.gender = ci.gender;
        if (ci.id) info.id = ci.id;
      }
    } catch (e) {}}
    // Fallback 1: 直接从 localStorage (bundle 启动时就是从这里读的, 是真源)
    if (info.name === '未知') {
      try {
        var raw = localStorage.getItem('cervical_current_client');
        if (raw) {
          var ci2 = JSON.parse(raw);
          if (ci2 && ci2.name) {
            info.name = ci2.name;
            if (ci2.age) info.age = String(ci2.age);
            if (ci2.gender) info.gender = ci2.gender;
            if (ci2.id) info.id = ci2.id;
          }
        }
      } catch (e2) {}
    }
    // Fallback 2: 从 #current-patient 元素文本解析 (取首个非 emoji 非 #id 段作姓名)
    if (info.name === '未知') {
      var el = document.getElementById('current-patient');
      if (el && el.textContent) {
        var t = el.textContent.trim();
        // 去掉首尾 emoji (👤) 和 #id 后缀, 取中间姓名段
        t = t.replace(/^👤\s*/, '').replace(/\s*#[^\s]+\s*$/, '').trim();
        // 空态文案 "点击登录" 视为未登录
        if (t && t !== '点击登录') info.name = t;
      }
    }
    return info;
  }

  // ========== 风险指数多维度列表 (仿图片格式: 图标+名称 | 三角/星评分 | 等级文字 + 描述) ==========
  function genRiskTriangles(level, total) {
    // SVG三角+!感叹号: 灰色底=无风险, 黄底=低风险(1-2), 橙底=中风险(3), 红底=高风险(4-5)
    var activeFill = level >= 4 ? '#ef4444' : level >= 3 ? '#f97316' : '#f59e0b';
    var activeStroke = level >= 4 ? '#b91c1c' : level >= 3 ? '#c2410c' : '#b45309';
    var inactiveFill = '#9ca3af';
    var inactiveStroke = '#6b7280';
    var html = '';
    for (var i = 0; i < total; i++) {
      var fill = i < level ? activeFill : inactiveFill;
      var stroke = i < level ? activeStroke : inactiveStroke;
      html += '<svg width="18" height="16" viewBox="0 0 22 20" style="display:inline-block;vertical-align:middle;margin-right:3px;">'
        + '<polygon points="11,1 21,18 1,18" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1" stroke-linejoin="round"/>'
        + '<text x="11" y="15" text-anchor="middle" font-size="11" font-weight="bold" fill="white" font-family="Arial,sans-serif">!</text>'
        + '</svg>';
    }
    return html;
  }

  function genStars(level, total) {
    // SVG五角星, 22x20 与三角形同规格
    var activeFill = '#ef4444';
    var activeStroke = '#b91c1c';
    var inactiveFill = '#d1d5db';
    var inactiveStroke = '#9ca3af';
    var html = '';
    for (var i = 0; i < total; i++) {
      var fill = i < level ? activeFill : inactiveFill;
      var stroke = i < level ? activeStroke : inactiveStroke;
      html += '<svg width="18" height="16" viewBox="0 0 22 20" style="display:inline-block;vertical-align:middle;margin-right:3px;">'
        + '<polygon points="11,2 13,7 19,7 14,11 16,17 11,14 6,17 8,11 3,7 9,7" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1" stroke-linejoin="round"/>'
        + '</svg>';
    }
    return html;
  }

  function getRiskLabelColor(level, type) {
    // type='risk': 0=无风险=金, 1-2=低风险=金, 3=中风险=橙, 4-5=高风险=红
    if (type === 'risk') {
      if (level >= 4) return '#ef4444'; // 红色 - 高风险
      if (level >= 3) return '#f97316'; // 橙色 - 中风险
      return '#d4a017';                  // 金黄色 - 无风险/低风险
    }
    // type='star': 正向指标
    if (level >= 5) return '#22c55e';
    if (level >= 4) return '#3b82f6';
    if (level >= 3) return '#8b5cf6';
    return '#f59e0b';
  }

  function genRiskIndexListHTML(scores, avgScore, age, regions) {
    // 从各模块分数计算各维度风险等级: triangles=0-5 (无0/低1-2/中3/高4-5)
    // 所有分数均使用年龄校正
    var s = scores;

    // 学习能力下降: attention + memory + language 的均值 (年龄校正)
    var learnScore = Math.round(
      (Math.min(getScoreCap(age), s.attention * ageFactor(age,'attention')) +
       Math.min(getScoreCap(age), s.memory * ageFactor(age,'memory')) +
       Math.min(getScoreCap(age), s.language * ageFactor(age,'language'))) / 3
    );
    var learnTri = learnScore >= 120 ? 0 : learnScore >= 105 ? 1 : learnScore >= 85 ? 2 : learnScore >= 65 ? 3 : learnScore >= 45 ? 4 : 5;
    var learnLabel = learnTri <= 0 ? '无风险' : learnTri <= 2 ? '低风险' : learnTri <= 3 ? '中风险' : '高风险';
    var learnDesc = '随着课程难度增加，可能会出现学习困难和成绩下滑。';

    // 心理健康: inhibition + reasoning + flex (年龄校正)
    var mentalScore = Math.round(
      (Math.min(getScoreCap(age), s.inhibition * ageFactor(age,'inhibition')) +
       Math.min(getScoreCap(age), s.reasoning * ageFactor(age,'reasoning')) +
       Math.min(getScoreCap(age), s.flex * ageFactor(age,'flex'))) / 3
    );
    var mentalTri = mentalScore >= 120 ? 0 : mentalScore >= 105 ? 1 : mentalScore >= 85 ? 2 : mentalScore >= 65 ? 3 : mentalScore >= 45 ? 4 : 5;
    var mentalLabel = mentalTri <= 0 ? '无风险' : mentalTri <= 2 ? '低风险' : mentalTri <= 3 ? '中风险' : '高风险';
    var mentalDesc = '由生活、事业和人际关系等压力，容易导致焦虑和抑郁。';

    // 失智风险: memory + scenerecall + memorg (年龄校正)
    var dementiaScore = Math.round(
      (Math.min(getScoreCap(age), s.memory * ageFactor(age,'memory')) +
       Math.min(getScoreCap(age), s.scenerecall * ageFactor(age,'scenerecall')) +
       Math.min(getScoreCap(age), s.memorg * ageFactor(age,'memorg'))) / 3
    );
    var dementiaTri = dementiaScore >= 120 ? 0 : dementiaScore >= 105 ? 1 : dementiaScore >= 85 ? 2 : dementiaScore >= 65 ? 3 : dementiaScore >= 45 ? 4 : 5;
    var dementiaLabel = dementiaTri <= 0 ? '无风险' : dementiaTri <= 2 ? '低风险' : dementiaTri <= 3 ? '中风险' : '高风险';
    var dementiaDesc = '开始容易忘记近期的人或事物，但很久以前发生的事情仍然记得。';

    // 人际关系: observation + language + inhibition (年龄校正)
    var socialScore = Math.round(
      (Math.min(getScoreCap(age), s.observation * ageFactor(age,'observation')) +
       Math.min(getScoreCap(age), s.language * ageFactor(age,'language')) +
       Math.min(getScoreCap(age), s.inhibition * ageFactor(age,'inhibition'))) / 3
    );
    var socialTri = socialScore >= 120 ? 0 : socialScore >= 105 ? 1 : socialScore >= 85 ? 2 : socialScore >= 65 ? 3 : socialScore >= 45 ? 4 : 5;
    var socialLabel = socialTri <= 0 ? '无风险' : socialTri <= 2 ? '低风险' : socialTri <= 3 ? '中风险' : '高风险';
    var socialDesc = '随生活阶段变化可能导致人际关系的紧张与冲突，与不同环境的人作为伙伴难以相处。';

    // 脑退化: memory + visual + observation (年龄校正)
    var brainScore = Math.round(
      (Math.min(getScoreCap(age), s.memory * ageFactor(age,'memory')) +
       Math.min(getScoreCap(age), s.visual * ageFactor(age,'visual')) +
       Math.min(getScoreCap(age), s.observation * ageFactor(age,'observation'))) / 3
    );
    var brainTri = brainScore >= 120 ? 0 : brainScore >= 105 ? 1 : brainScore >= 85 ? 2 : brainScore >= 65 ? 3 : brainScore >= 45 ? 4 : 5;
    var brainLabel = brainTri <= 0 ? '无风险' : brainTri <= 2 ? '低风险' : brainTri <= 3 ? '中风险' : '高风险';
    var brainDesc = '思考对你来说变得费力，且反应变慢，感觉你的脑子没有以前好使。';

    // 脊柱健康: 左右脑平衡度, 重点看顶叶(索引2左/3右), 兼顾额叶(0/1)和整体对称 (regions已由外部computeBrainRegions age校正)
    // regions 直接使用外部传入的已校正值
    var parietalDiff = Math.abs(regions['左顶叶'] - regions['右顶叶']); // 顶叶左右差异(核心)
    var frontalDiff = Math.abs(regions['左额叶'] - regions['右额叶']); // 额叶左右差异
    var overallDiff = Math.abs(
      (regions['左额叶']+regions['左顶叶']+regions['左枕叶']+regions['左颞叶']+regions['左小脑']) -
      (regions['右额叶']+regions['右顶叶']+regions['右枕叶']+regions['右颞叶']+regions['右小脑'])
    ) / 5; // 全脑左右平均差
    // 加权: 顶叶50%+额叶25%+整体25%, 差值越大→三角越多
    var imbalance = parietalDiff * 0.5 + frontalDiff * 0.25 + overallDiff * 0.25;
    var spineTri = imbalance <= 5 ? 0 : imbalance <= 8 ? 1 : imbalance <= 15 ? 2 : imbalance <= 25 ? 3 : imbalance <= 38 ? 4 : 5;
    var spineLabel = spineTri <= 0 ? '无风险' : spineTri <= 2 ? '低风险' : spineTri <= 3 ? '中风险' : '高风险';
    var spineDesc = '左右脑功能不平衡，尤其是顶叶差异较大时，可能导致慢性脊柱不适的风险升高。';

    // 未来发展潜力 (正向指标, 用星级): avgScore based
    var fPot = ageFactor(age, 'attention'); var potAdj = Math.round(avgScore * fPot); var potentialLevel = potAdj >= 120 ? 5 : potAdj >= 100 ? 4 : potAdj >= 80 ? 3 : potAdj >= 60 ? 2 : 1;
    var potentialLabel = potentialLevel >= 5 ? '潜力极高' : potentialLevel >= 4 ? '潜力偏高' : potentialLevel >= 3 ? '潜力一般' : '潜力有限';
    var potentialDesc = '是否为可造之材，未来有潜力成为优秀人才。';

    // 情感忠诚度 (正向指标, 用星级): 基于自制力(inhibition)
    var inhibitionScore = Math.round((s.inhibition||50) * ageFactor(age, 'inhibition'));
    var loyaltyLevel = inhibitionScore >= 120 ? 5 : inhibitionScore >= 100 ? 4 : inhibitionScore >= 80 ? 3 : inhibitionScore >= 60 ? 2 : 1;
    var loyaltyLabel = loyaltyLevel >= 5 ? '忠诚度高' : loyaltyLevel >= 4 ? '忠诚度良' : loyaltyLevel >= 3 ? '忠诚度中' : '忠诚度偏低';
    var loyaltyDesc = '在认真的两性关系中，保持专一和忠诚。';

    var items = [
      { icon: '📖', name: '学习能力下降风险指数', type: 'risk', level: learnTri, label: learnLabel, desc: learnDesc },
      { icon: '<img src="./assets/mental-health-icon.jpg" style="width:18px;height:18px;vertical-align:middle;border-radius:3px;">', name: '心理健康风险指数',       type: 'risk', level: mentalTri, label: mentalLabel, desc: mentalDesc },
      { icon: '🧠', name: '失智风险指数',            type: 'risk', level: dementiaTri, label: dementiaLabel, desc: dementiaDesc },
      { icon: '🤝', name: '人际关系风险指数',        type: 'risk', level: socialTri, label: socialLabel, desc: socialDesc },
      { icon: '🧍', name: '脑退化风险指数',          type: 'risk', level: brainTri, label: brainLabel, desc: brainDesc },
      { icon: '🧘', name: '脊柱健康风险指数',        type: 'risk', level: spineTri, label: spineLabel, desc: spineDesc },
      { icon: '✨', name: '未来发展潜力指数',          type: 'star', level: potentialLevel, label: potentialLabel, desc: potentialDesc },
      { icon: '❤️', name: '情感忠诚指数',            type: 'star', level: loyaltyLevel, label: loyaltyLabel, desc: loyaltyDesc }
    ];

    // 紧凑版 (适配左栏, 无描述行, SVG 缩至 18x16)
    var html = '';
    html += '<div style="background:#fff;border-radius:10px;padding:10px 14px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">';
    html += '<h3 style="margin:0 0 6px;font-size:15px;color:#222;">⚠️ 多维度风险评估</h3>';

    for (var idx = 0; idx < items.length; idx++) {
      var it = items[idx];
      var ratingHTML = it.type === 'risk' ? genRiskTriangles(it.level, 5) : genStars(it.level, 5);

      html += '<div style="display:flex;align-items:center;padding:4px 0;border-bottom:'+(idx < items.length-1?'1px solid #f0f0f0':'none')+';">';
      html += '<span style="flex-shrink:0;margin-right:6px;">'+it.icon+'</span>';
      html += '<span style="flex:1;font-size:12px;color:#333;font-weight:500;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+it.name+'</span>';
      html += '<span style="flex-shrink:0;margin:0 6px;">'+ratingHTML+'</span>';
      html += '<span style="flex-shrink:0;font-size:11px;font-weight:700;color:'+(it.type==='risk'?getRiskLabelColor(it.level,'risk'):getRiskLabelColor(it.level,'star'))+';min-width:48px;text-align:right;">'+it.label+'</span>';
      html += '</div>';
      html += '<div style="font-size:9px;color:#999;padding:0 0 3px 21px;line-height:1.3;">'+it.desc+'</div>';
    }

    html += '</div>';
    return html;
  }

  function genOverviewHTML(scores, regions, riskIndex, patientInfo, age, isQuick6, reportTime) {
    // reportTime 形如 "2026-06-17 09:47" — 来自 record, 报告时间应跟着 record 走, 不跟着点击时间走
    var dateStr, timeStr;
    if (reportTime && /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(reportTime)) {
      var parts = reportTime.split(/\s+/);
      dateStr = parts[0]; timeStr = parts[1];
    } else {
      var now = new Date();
      dateStr = now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0');
      timeStr = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    }
    var divisor = isQuick6 ? 6 : 12;
    var totalAdj = 0;
    Object.keys(scores).forEach(function(k){ totalAdj += scores[k] * (age ? ageFactor(age, k) : 1.0); });
    var avgScore = Math.round(totalAdj / divisor);

    var html = '';
    // PDF 分页: cog-ov-top 包裹头部+患者信息
    html += '<div id="cog-ov-top">';
    // Header (对齐模块页风格: 青绿渐变, logo+标题居中 / 品牌右)
    html += '<div style="background:linear-gradient(90deg,#1ab9c5,#0e8a92);color:#fff;padding:10px 20px;border-radius:10px;margin-bottom:10px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;">';
    // 左占位 (1fr 等宽让中间 auto 组视觉居中)
    html += '<div></div>';
    // 中: logo + 标题 (auto 列)
    html += '<div style="display:flex;align-items:center;gap:14px;">';
    html += '<img src="./assets/logo-nO4lhsgS.jpg" alt="BrainMend logo" style="height:36px;width:auto;border-radius:6px;background:#fff;padding:2px;flex-shrink:0;">';
    html += '<div>';
    html += '<h1 style="font-size:22px;margin:0 0 2px;font-weight:700;line-height:1.1;letter-spacing:1px;">' + (isQuick6 ? '快速认知评估报告' : '认知评估报告') + '</h1>';
    html += '<div style="font-size:11px;opacity:0.9;letter-spacing:0.5px;">' + (isQuick6 ? 'Quick Cognitive Assessment (6 Modules)' : 'Cognitive Assessment Report') + '</div>';
    html += '</div>';
    html += '</div>';
    // 右: 品牌 (1fr, 文字右对齐)
    html += '<div style="text-align:right;">';
    html += '<div style="font-size:16px;font-weight:600;letter-spacing:1px;">BrainMend · 脑优化</div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-top:2px;letter-spacing:0.5px;">脑优化专业评估</div>';
    html += '</div>';
    html += '</div>';
    // 患者信息 (独立一行: 姓名/年龄/性别 + 测试时间)
    html += '<div style="background:#fff;border-radius:8px;padding:10px 18px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#555;box-shadow:0 1px 4px rgba(0,0,0,0.05);">';
    html += '<div style="display:flex;gap:24px;">';
    html += '<div>姓名: <b style="color:#222;">'+patientInfo.name+'</b></div>';
    html += '<div>年龄: <b style="color:#222;">'+(patientInfo.age || '—')+'</b></div>';
    html += '<div>性别: <b style="color:#222;">'+(patientInfo.gender || '—')+'</b></div>';
    html += '</div>';
    html += '<div style="color:#888;">测试时间: <b style="color:#555;">'+dateStr+' '+timeStr+'</b></div>';
    html += '</div>';
    html += '</div>'; // close cog-ov-top

    // ========== 脑型分析 (左右平衡 × 内外向) ==========
    var leftBrain = (regions['左额叶']+regions['左顶叶']+regions['左枕叶']+regions['左颞叶']+regions['左小脑'])/5;
    var rightBrain = (regions['右额叶']+regions['右顶叶']+regions['右枕叶']+regions['右颞叶']+regions['右小脑'])/5;
    var allAvg = (leftBrain + rightBrain) / 2;

    // ===== 年龄自适应期望分 + 脑力年龄 =====
    var chronologicalAge = Number(age) || 35;
    var refAges = [20,30,40,50,60,70,80];
    var refScores = [100,95,90,85,78,70,62];
    var expectedScore;
    if (chronologicalAge <= refAges[0]) expectedScore = refScores[0];      // ≤20 = 100
    else if (chronologicalAge >= refAges[refAges.length-1]) expectedScore = refScores[refScores.length-1]; // ≥80 = 62
    else {
      for (var ri = 0; ri < refAges.length-1; ri++) {
        if (chronologicalAge >= refAges[ri] && chronologicalAge <= refAges[ri+1]) {
          var t = (chronologicalAge - refAges[ri]) / (refAges[ri+1] - refAges[ri]);
          expectedScore = refScores[ri] + (refScores[ri+1] - refScores[ri]) * t;
          break;
        }
      }
    }

    var brainAge = null, brainAgeLabel = '';
    if (chronologicalAge >= 18) {
      brainAge = Math.round(chronologicalAge + (expectedScore - allAvg) * 1.5);
      brainAge = Math.max(18, Math.min(90, brainAge));
      var ageDiff = brainAge - chronologicalAge;
      if (ageDiff <= -5) brainAgeLabel = '比实际年轻 ' + Math.abs(ageDiff) + ' 岁';
      else if (ageDiff >= 5) brainAgeLabel = '比实际年长 ' + ageDiff + ' 岁';
      else brainAgeLabel = '与实际年龄相符';
    }
    var brainDiff = leftBrain - rightBrain;
    var balancePart, extroPart, brainTypeIcon;
    var brainType, brainTypeDesc, fam, btd;
    // 健康状态门控: 用 allAvg / expectedScore 相对衰退率 (全年龄适用)
    // ≤20岁基准 expectedScore=100 → 障碍线=70 (≤70%同龄正常)
    // ≥80岁基准 expectedScore=62  → 障碍线=43 (≤70%同龄正常)
    var ratio = expectedScore > 0 ? allAvg / expectedScore : 1.0;
    var isDysfunction = ratio < 0.70;
    var isSubhealth = ratio >= 0.70 && ratio < 0.85;
    if (isDysfunction) {
      brainType = '全面脑区功能偏低';
      brainTypeIcon = '⚠️';
      brainTypeDesc = '⚠️ 检测到 5 大脑区平均分仅 ' + Math.round(allAvg) + ' 分, 为同龄正常值 ' + Math.round(expectedScore) + ' 的 ' + Math.round(ratio*100) + '% (障碍线为 70%)。强烈建议尽快到正规医院神经内科/康复科进一步评估。常见可能原因: 脑供血不足、长期睡眠剥夺、抑郁焦虑、注意力缺陷、神经发育迟缓等。完成首次评估后建议 4 周内复测, 观察趋势变化。';
      fam = { cn: '', en: '', desc: '' };
      btd = null;
    } else {
      if (Math.abs(brainDiff) <= 8) {
        balancePart = '双脑平衡'; brainTypeIcon = '⚖️';
      } else if (brainDiff > 0) {
        balancePart = '左脑'; brainTypeIcon = '🧮';
      } else {
        balancePart = '右脑'; brainTypeIcon = '🎨';
      }
      var extroThresh = AGE_EXTRO_THRESHOLD[getAgeGroupIdx(age)] || 65;
      if (allAvg >= extroThresh) {
        extroPart = '外向型';
      } else {
        extroPart = '内向型';
      }
      brainType = balancePart + extroPart;
      brainTypeDesc = brainDiff > 8 ? '您更依赖逻辑和分析' : brainDiff < -8 ? '您更依赖直觉和创造力' : '您同时依赖逻辑和直觉';
      brainTypeDesc += allAvg >= 65 ? '，脑活跃度高，倾向外向表达。' : '，脑活跃度适中，倾向内向思考。';
      if (isSubhealth) {
        brainTypeDesc += '（注：当前脑活跃度为同龄正常的 ' + Math.round(ratio*100) + '%，处于低下区间 (70-85%)，建议关注作息、运动和睡眠，必要时复测。）';
      }
    // 名人代表
    var FAMOUS = {
      '双脑平衡外向型': { cn: '苏轼', en: '达·芬奇', desc: '文理兼通、豪放洒脱' },
      '双脑平衡内向型': { cn: '王阳明', en: '爱因斯坦', desc: '内省深刻、逻辑与想象力并重' },
      '左脑外向型':     { cn: '张衡',   en: '比尔·盖茨',     desc: '科学发明、积极入世' },
      '左脑内向型':     { cn: '诸葛亮', en: '牛顿',          desc: '缜密分析、深度思考' },
      '右脑外向型':     { cn: '李白',   en: '乔布斯',        desc: '创意奔放、感染力强' },
      '右脑内向型':     { cn: '陶渊明', en: '梵高',          desc: '感性极致、内省孤独' }
    };
    var fam = FAMOUS[brainType] || { cn: '', en: '', desc: '' };
    // 脑型特征描述 (基于左右脑+内外向双轴, 每型含优势+短板)
    var BRAIN_TYPE_DETAIL = {
      '双脑平衡外向型': {
        study: '左右脑协同运作，左脑帮你拆解逻辑，右脑帮你把握整体。能同时处理文字和图像信息，讨论和实践中进步最快，对新事物好奇心强。',
        work: '天生的多面手。既能做精密逻辑推演，又能提出创新方案；既能独立深度分析，又能在协作中活跃气氛。决策时兼顾逻辑链和直觉判断。',
        social: '既能逻辑清晰表达观点，又能敏锐感知他人情绪。朋友眼中是可靠建议者也是充满活力的伙伴——讲道理又有温度。',
        weakness: '容易成为"万金油"，深度不够。因为两边都能做，可能缺乏在一个方向上长期深耕的耐心，兴趣点容易转移。'
      },
      '双脑平衡内向型': {
        study: '拥有罕见的双通道学习能力：既能深度钻研抽象概念，又能通过直觉把握全局模式。喜欢安静独立思考，但知识面不局限，跨领域关联能力强。',
        work: '沉稳的智囊型人才。不急于表态，但一旦开口往往是深度整合的判断。既能做精密推演，也能提出出人意料但切实可行的方案。',
        social: '不是社交焦点，但是深度信任圈的"深水区"。朋友遇难题时往往第一个想到找你——建议同时包含理性分析和情感共鸣。',
        weakness: '容易陷入"过度思考"的循环，决策速度偏慢。因为两边信息都要处理，有时会犹豫不决。社交上过于被动，可能错过重要的人脉机会。'
      },
      '左脑外向型': {
        study: '左脑主导意味着文字、逻辑和数字是你的天然语言。学习风格是"结构化+高输出"：需要明确步骤和逻辑链条，通过讲解或辩论来巩固。喜欢客观事实和证据原理。',
        work: '职场推动者。擅长制定计划、优化流程、用数据和事实说服他人。能看到明确的步骤和规律，执行力让人信赖。',
        social: '交流直接有力：讲事实、摆逻辑、给方案。朋友们看重你的理性可靠。',
        weakness: '变现能力偏弱——想法很好但不太会"卖"。不擅长非语言交流和表达情绪，容易给人"冷冰冰"的印象。偏好旧方法，面对新变化适应期较长。'
      },
      '左脑内向型': {
        study: '深度学习的典型。擅长文字记忆和数字逻辑，一旦锁定领域就能持续钻研到很深层次。喜欢自己推导验证、建立完整逻辑链，一次可处理多件事。',
        work: '团队中"安静的力量"。不擅长即兴发言但书面分析最全面最经得起推敲。独立工作能力极强，交给你的任务不需要督促。',
        social: '不追求热闹但擅长深度交流。朋友们珍惜你的真诚和深度——你会记住重要的事情，在关键时刻给出认真思考的建议。',
        weakness: '压抑情感、不喜表达情绪，容易让别人觉得"看不懂你"。前庭功能偏弱，不喜欢竞争性运动。社交上过于被动，很多机会靠别人发现你而不是自己争取。'
      },
      '右脑外向型': {
        study: '右脑主导意味着依赖图片记忆和空间感知来理解世界。学习充满"画面感"：比起文字公式更喜欢图像故事和体验。相信直觉，喜欢创新，头脑风暴和动手实践是你的强项。',
        work: '团队的创意引擎。总能提出让人眼前一亮的点子，用视觉化表达让复杂概念变得生动直观。擅长赞美他人，能量场很高，能自然感染和激励周围人。',
        social: '天生的"氛围制造者"。善于捕捉他人情绪，能用恰到好处的幽默或温暖化解尴尬。喜欢表达情绪，能读懂他人情感。',
        weakness: '学习力需要加强——逻辑和结构化思维偏弱，做事容易凭感觉而不是靠系统。一次只能专注一件事，多任务并行时容易混乱。创新多但落地少。'
      },
      '右脑内向型': {
        study: '拥有丰富的内心世界。擅长图片和画面记忆，学习更依赖直觉和"顿悟"式理解——可能在发呆或散步时突然想通难题。关注整体效果，对美和情感有敏锐感知力。',
        work: '不显山露水的艺术家。不需要站在聚光灯下，但作品或提案带有强烈个人风格和独特感染力。喜欢独自打磨细节直到"对味"为止。一次只专注一件事，但做到极致。',
        social: '不是话最多的人，但共情力和非语言交流能力极强。朋友们愿意向你倾诉心事，因为知道你会真正地听、真正地感受。',
        weakness: '过于沉浸在自己的世界里，现实世界的规则和截止日期容易被忽略。逻辑和数字能力偏弱，需要刻意锻炼左脑来平衡。社交上容易被人误解为"不合群"。'
      }
    };
    var btd = BRAIN_TYPE_DETAIL[brainType] || null;
    }

    var brainTypeBg = isDysfunction
      ? 'background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1px solid #fca5a5;'
      : 'background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1px solid #bae6fd;';
    html += '<div style="'+brainTypeBg+'border-radius:10px;padding:8px 14px;margin-bottom:2px;">';
    // 标题行: 图标 + 脑型 + 脑力年龄
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span style="font-size:28px;flex-shrink:0;">'+brainTypeIcon+'</span>';
    html += '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">';
    html += '<span style="font-size:15px;font-weight:700;color:#0c4a6e;">您的大脑是 <span style="color:#0284c7;">'+brainType+'</span></span>';
    if (brainAge != null) {
      var baColor = brainAge < chronologicalAge ? '#16a34a' : brainAge > chronologicalAge ? '#e67e22' : '#888';
      html += '<span style="font-size:13px;font-weight:600;color:'+baColor+';">🧠 脑力年龄 <b style="font-size:16px;">'+brainAge+'</b> 岁 ('+brainAgeLabel+')</span>';
    }
    html += '</div></div>';
    if (btd) {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:4px;">';
      html += '<div style="background:rgba(255,255,255,0.7);border-radius:6px;padding:6px 10px;border-left:3px solid #1ab9c5;"><div style="font-size:11px;color:#1ab9c5;font-weight:700;margin-bottom:2px;">📚 学习特质</div><div style="font-size:11px;color:#444;line-height:1.5;">'+btd.study+'</div></div>';
      html += '<div style="background:rgba(255,255,255,0.7);border-radius:6px;padding:6px 10px;border-left:3px solid #f59e0b;"><div style="font-size:11px;color:#d97706;font-weight:700;margin-bottom:2px;">💼 工作特质</div><div style="font-size:11px;color:#444;line-height:1.5;">'+btd.work+'</div></div>';
      html += '<div style="background:rgba(255,255,255,0.7);border-radius:6px;padding:6px 10px;border-left:3px solid #ec4899;"><div style="font-size:11px;color:#db2777;font-weight:700;margin-bottom:2px;">🤝 社交特质</div><div style="font-size:11px;color:#444;line-height:1.5;">'+btd.social+'</div></div>';
      html += '</div>';
      if (btd.weakness) {
        html += '<div style="background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.2);border-radius:6px;padding:5px 10px;margin-bottom:4px;border-left:3px solid #f97316;">';
        html += '<span style="font-size:10px;color:#f97316;font-weight:700;">⚠ 成长空间 </span>';
        html += '<span style="font-size:11px;color:#555;line-height:1.5;">'+btd.weakness+'</span>';
        html += '</div>';
      }
    }
    html += '<div style="font-size:12px;color:#64748b;margin-top:0;">'+brainTypeDesc+'</div>';
    if (fam.cn) {
      html += '<div style="font-size:10px;color:#94a3b8;margin-top:2px;">🎗️ 此类型代表: 中国 · <b>'+fam.cn+'</b>　|　外国 · <b>'+fam.en+'</b> — '+fam.desc+'</div>';
    }
    html += '</div>';

    // ========== 主内容 ==========
    if (isQuick6) {
      // Quick6 模式: 无风险评估, 脑区图(左) + 雷达图(右) 左右并排
      // 12 模块报告走 #cog-ov-main 分支, 此处修改对 12 模块零影响
      html += '<div id="cog-ov-main-quick6" style="display:flex;gap:14px;margin-bottom:8px;">';
      // 左栏: 脑区报告 (50% 宽, 加大脑图)
      html += '<div style="flex:1;min-width:0;background:#fff;border-radius:10px;padding:10px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
      html += '<h3 style="margin:0 0 6px;font-size:16px;">🧠 脑区功能报告</h3>';
      html += '<canvas id="cog-brain-2d" width="540" height="380" style="max-width:100%;border-radius:6px;border:1px solid #eee;display:block;margin:0 auto;"></canvas>';
      html += '<div style="font-size:13px;color:#666;margin-top:6px;text-align:center;letter-spacing:0.3px;">顶视图 · 左右半球各 5 脑区 (基于 6 项测试结果估算)</div>';
      html += '</div>';
      // 右栏: 雷达图 (50% 宽, 加大雷达)
      html += '<div style="flex:1;min-width:0;background:#fff;border-radius:10px;padding:10px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
      html += '<h3 style="margin:0 0 6px;font-size:16px;text-align:center;">📊 六项认知能力评估</h3>';
      html += '<canvas id="cog-radar-canvas" width="540" height="380" style="max-width:100%;display:block;margin:0 auto;"></canvas>';
      html += '</div>';
      html += '</div>'; // close cog-ov-main-quick6
    } else {
      // 标准模式: 左(风险评估) + 右(脑区上/雷达下)
      html += '<div id="cog-ov-main" style="display:flex;gap:14px;margin-bottom:12px;">';
      // 左栏: 多维度风险评估
      html += '<div id="cog-ov-risk" style="flex:0 0 55%;min-width:0;">';
      html += genRiskIndexListHTML(scores, avgScore, age, regions);
      html += '</div>';
      // 右栏: 脑区报告(上) + 测试分析图(下)
      html += '<div id="cog-ov-charts" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">';
      html += '<div style="background:#fff;border-radius:10px;padding:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
      html += '<h3 style="margin:0 0 8px;font-size:13px;">🧠 脑区功能报告</h3>';
      html += '<canvas id="cog-brain-2d" width="400" height="160" style="max-width:100%;border-radius:6px;border:1px solid #eee;"></canvas>';
      html += '<div style="font-size:10px;color:#999;margin-top:2px;text-align:center;">顶视图 · 左右半球各 5 脑区 · 点击放大</div>';
      html += '</div>';
      html += '<div style="background:#fff;border-radius:10px;padding:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
      html += '<h3 style="margin:0 0 8px;font-size:13px;">📊 测试分析图</h3>';
      html += '<canvas id="cog-radar-canvas" width="500" height="240" style="max-width:100%;"></canvas>';
      html += '</div>';
      html += '</div>'; // close right
      html += '</div>'; // close main
    }

    return html;
  }

  function getModuleIndex(id) {
    for (var i = 0; i < MODULES.length; i++) {
      if (MODULES[i].id === id) return i + 1;
    }
    return 0;
  }

  function genModuleDetailHTML(mod, score, rawData, history, age) {
    var adjScore = age ? Math.min(getScoreCap(age), Math.round(score * ageFactor(age, mod.id))) : score;
    var displayScore = age && Number(age) < 18 ? adjScore : score;
    var band = getScoreBand(score, mod.id, age);
    var color = getScoreColor(score, mod.id, age);
    var label = getScoreLabel(score, mod.id, age);
    var pct = getPercentile(score, mod.id, age);
    var analysis = getAnalysis(mod.id, band);
    var rankInfo = getRankInfo(pct);
    var modIdx = getModuleIndex(mod.id);

    var html = '';
    html += '<div style="background:#fff;border-radius:12px;padding:16px 22px;margin-bottom:0;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';

    // 1) 顶部编号 tab + 品牌 bar (青色背景, 字号匹配 A4 横版)
    html += '<div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(90deg,#1ab9c5,#0e8a92);color:#fff;padding:8px 16px;border-radius:8px;margin-bottom:10px;">';
    html += '<div style="font-size:22px;font-weight:700;">'+modIdx+' · '+mod.name+'</div>';
    html += '<div style="font-size:15px;opacity:0.92;letter-spacing:0.8px;font-weight:500;">BrainMend · 脑优化</div>';
    html += '</div>';

    // 2) 模块描述 (16px, A4 横版阅读字号)
    html += '<div style="font-size:15px;color:#444;line-height:1.55;margin-bottom:12px;padding:6px 14px;background:#f8fafb;border-left:3px solid #1ab9c5;border-radius:4px;">'+mod.desc+'</div>';

    // 3) 主区: 上排(左估值+右历次) + 下排(评估解析全宽)
    //    屏幕: 2-col top + full-width bottom (避免中栏文字纵向拉长)
    //    PDF: _restructureModulesForPDF 临时还原三栏再捕获
    html += '<div class="cog-mod-main" style="display:grid;grid-template-columns:1fr 1.25fr;gap:10px;align-items:start;margin-bottom:10px;">';

    // ===== 左栏: 估值 + 金字塔 (垂直堆叠, 自然高度) =====
    html += '<div class="cog-mod-left" style="display:flex;flex-direction:column;gap:10px;">';
    // 估值 box
    html += '<div style="text-align:center;padding:12px 8px;background:linear-gradient(135deg,#f0fafb,#e6f5f7);border-radius:10px;border:1px solid #d4eef0;">';
    html += '<div style="font-size:14px;color:#666;margin-bottom:3px;letter-spacing:1px;">评估值</div>';
    html += '<div style="font-size:92px;font-weight:800;color:'+color+';line-height:1;text-shadow:0 2px 4px rgba(0,0,0,0.05);">'+displayScore+'</div>';
    if (age && Number(age) < 18) {
      html += '<div style="font-size:12px;color:#888;margin-top:3px;letter-spacing:0.5px;">原始 <b style="color:#555;font-weight:700;">'+score+'</b> · 满分 200</div>';
    }
    html += '<div style="font-size:14px;color:#555;margin-top:6px;">超过 <b style="color:'+color+';font-size:19px;">'+pct+'%</b> 的同龄测试者</div>';

    html += '</div>';
    // 金字塔 box - max-width 340, 占据左栏主视觉
    html += '<div style="padding:10px 8px;background:#f6fbfc;border-radius:10px;text-align:center;">';
    html += getPyramidSVG(pct);
    html += '</div>';
    html += '</div>';

    // 训练建议映射 (按模块 ID 给针对性建议)
    var TIPS = {
      attention: '每日 10 分钟"找不同"训练，每次记录用时，逐步缩短。',
      shortmem: '记忆 5-7 个物品 30 秒后回忆，逐步增加到 9 个。',
      memory: '背诵数字串、姓名-脸对应，每天 5 分钟。',
      flex: '尝试用不同方法完成同一任务，如左手刷牙。',
      language: '阅读时尝试用自己的话复述段落。',
      reasoning: '每日做 5 题逻辑推理/数独，保持思维敏锐。',
      planning: '用"目标-步骤-时间"三段式规划每日任务。',
      scenerecall: '睡前回忆当天重要场景，按时间线复述。',
      memorg: '学习新知识时用思维导图组织结构。',
      inhibition: '练习 Stroop 任务或冥想，提升抗干扰能力。',
      visual: '记住房间物品位置，闭眼在脑中走一遍。',
      observation: '每天观察一处场景 1 分钟，写下 3 个细节。'
    };

    // ===== 右栏: 历次测试结果 =====
    html += '<div class="cog-mod-right" style="display:flex;flex-direction:column;gap:8px;">';
    html += '<h4 style="margin:0 0 2px 0;font-size:18px;color:#222;font-weight:700;border-bottom:2px solid #1ab9c5;padding-bottom:5px;">历次测试结果</h4>';
    if (history && history.length > 1) {
      html += '<div style="background:#fafbfc;border-radius:8px;padding:10px 10px;text-align:center;border:1px solid #e8eaed;">';
      html += '<canvas id="cog-trend-'+mod.id+'" width="500" height="300" style="width:100%;max-width:500px;height:auto;display:block;margin:0 auto;"></canvas>';
      html += '</div>';
      // 历史数据明细
      html += '<div style="background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:8px 13px;font-size:13px;color:#555;line-height:1.6;">';
      html += '<div style="color:#1ab9c5;font-weight:700;font-size:13px;margin-bottom:4px;">📈 共 '+history.length+' 次测试</div>';
      for (var hi = 0; hi < history.length && hi < 5; hi++) {
        var h = history[hi];
        var isLatest = (hi === history.length - 1);
        var hAge = h.age || age;
        var isChildRecord = hAge && Number(hAge) < 18;
        var hAdj = isChildRecord ? Math.min(getScoreCap(hAge), Math.round(h.score * ageFactor(hAge, mod.id))) : h.score;
        var mainScore = isChildRecord ? hAdj : h.score;
        var rawSuffix = isChildRecord ? ' <span style="color:#999;font-size:11px;">(原始 '+h.score+')</span>' : '';
        html += '<div style="display:flex;justify-content:space-between;padding:2px 0;'+(isLatest?'background:#e6f7f8;margin:2px -5px;padding:3px 5px;border-radius:4px;':'')+'">';
        html += '<span style="color:#888;">'+(h.date || ('第'+(hi+1)+'次'))+'</span>';
        html += '<span><b style="color:'+(isLatest?color:'#555')+';font-size:'+(isLatest?'16px':'14px')+';">'+mainScore+'</b>'+rawSuffix+(isLatest?' <span style="color:#1ab9c5;font-size:11px;">最新</span>':'')+'</span>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div style="display:flex;align-items:center;justify-content:center;color:#999;font-size:14px;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:30px 16px;">暂无历史数据<br><span style="font-size:12px;color:#bbb;">完成更多测试可查看趋势</span></div>';
    }
    html += '</div>';

    html += '</div>'; // end cog-mod-main 2-col grid

    // ===== 评估解析 (全宽, 移到下方减少纵向拉长) =====
    html += '<div class="cog-mod-analysis" style="margin-bottom:12px;">';
    html += '<h4 style="margin:0 0 4px 0;font-size:18px;color:#222;font-weight:700;border-bottom:2px solid #1ab9c5;padding-bottom:5px;">评估解析</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
    html += '<div style="background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:10px 13px;border-left:4px solid #1ab9c5;">';
    html += '<div style="font-size:14px;color:#1ab9c5;margin-bottom:4px;font-weight:700;">📚 学习能力</div>';
    html += '<div style="font-size:14px;line-height:1.5;color:#333;">'+analysis.study+'</div></div>';
    html += '<div style="background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:10px 13px;border-left:4px solid #1ab9c5;">';
    html += '<div style="font-size:14px;color:#1ab9c5;margin-bottom:4px;font-weight:700;">💼 工作能力</div>';
    html += '<div style="font-size:14px;line-height:1.5;color:#333;">'+analysis.work+'</div></div>';
    html += '<div style="background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:10px 13px;border-left:4px solid #1ab9c5;">';
    html += '<div style="font-size:14px;color:#1ab9c5;margin-bottom:4px;font-weight:700;">🤝 待人接物</div>';
    html += '<div style="font-size:14px;line-height:1.5;color:#333;">'+analysis.social+'</div></div>';
    html += '</div>'; // end inner analysis grid
    html += '</div>'; // end cog-mod-analysis

    // 4) 详细排名文案 (全宽, 字号匹配, 醒目突出)
    html += '<div style="font-size:15px;color:#222;line-height:1.65;background:linear-gradient(90deg,#fffbea,#fff8d6);padding:11px 16px;border-left:4px solid #f59e0b;border-radius:6px;border:1px solid #fde68a;">';
    html += '<span style="display:inline-block;font-size:13px;color:#b45309;font-weight:700;letter-spacing:0.5px;margin-right:8px;">📊 排名解读</span>';
    html += '您的 <b style="color:'+color+';font-size:17px;">'+mod.name+'</b> 超过了 <b style="color:'+color+';font-size:17px;">'+pct+'%</b> 的人群。';
    html += '假如有 50 人排名，您位于第 <b style="color:'+color+';font-size:17px;">'+rankInfo.rank+'</b> 名';
    if (rankInfo.improve > 0) {
      html += '，短期内可提升 <b style="color:#ef4444;font-size:17px;">'+rankInfo.improve+'</b> 名';
    } else {
      html += '，<b style="color:#22c55e;font-size:17px;">已达到优秀水平</b>';
    }
    html += '。</div>';

    // 5) 训练建议 (针对本模块, 紧凑填充 + 提供行动指引)
    html += '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:7px 12px;background:linear-gradient(90deg,#f0faf9,#e8f5f3);border-radius:6px;border-left:3px solid #1ab9c5;">';
    html += '<div style="font-size:20px;flex-shrink:0;">💡</div>';
    html += '<div style="flex:1;display:flex;align-items:baseline;gap:10px;">';
    html += '<span style="font-size:13px;color:#0e7a82;font-weight:700;letter-spacing:0.5px;flex-shrink:0;">训练建议</span>';
    html += '<span style="font-size:14px;color:#333;line-height:1.5;">'+(TIPS[mod.id] || '保持规律训练，每周完成 3 次以上测试，持续跟踪提升。')+'</span>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ========== DUAL HEXAGON RADAR CHART ==========
  var LEFT_HEX = ['attention','memory','language','reasoning','planning','memorg'];
  var RIGHT_HEX = ['shortmem','flex','scenerecall','inhibition','visual','observation'];
  var LEFT_LABELS = ['注意力','文字记忆','语言理解','推理能力','规划能力','记忆组织'];
  var RIGHT_LABELS = ['短暂记忆','变通能力','场景回忆','自制力','视觉记忆','观察能力'];

  function drawHexagon(ctx, cx, cy, r, modules, labels, scores, fontScale, age) {
    var n = 6;
    var fs = fontScale || 1;  // 放大 zoom 时按比例缩放字体
    // Reference rings: 50/90/120/150, 最外层=卓越边界
    [50/150, 90/150, 120/150, 150/150].forEach(function(ratio) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var angle = (Math.PI * 2 / n) * i - Math.PI / 2;
        var pr = r * ratio;
        var x = cx + pr * Math.cos(angle);
        var y = cy + pr * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (ratio === 150/150) {
        ctx.strokeStyle = 'rgba(220,38,38,0.25)';
        ctx.lineWidth = 1.5;
      } else if (ratio === 90/150) {
        ctx.strokeStyle = 'rgba(59,130,246,0.3)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();
    });

    // Axis lines
    for (var i = 0; i < n; i++) {
      var angle = (Math.PI * 2 / n) * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Data polygon — 使用年龄校正后的分数
    ctx.beginPath();
    var points = [];
    modules.forEach(function(mid, i) {
      var raw = scores[mid] || 50;
      var adj = Math.min(getScoreCap(age), raw * (age ? ageFactor(age, mid) : 1.0));
      var ratio = Math.min(1, adj / 150);
      var angle = (Math.PI * 2 / n) * i - Math.PI / 2;
      var x = cx + r * ratio * Math.cos(angle);
      var y = cy + r * ratio * Math.sin(angle);
      points.push({x:x, y:y, s:Math.round(adj), raw:raw});
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,217,165,0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,217,165,0.7)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Data points + score labels (标注年龄校正后分数)
    points.forEach(function(p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI*2);
      ctx.fillStyle = getScoreColor(p.s, null, age);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Score label — 校正后分数
      ctx.fillStyle = '#333';
      ctx.font = 'bold ' + Math.round(9*fs) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.s, p.x, p.y - Math.round(7*fs));
    });

    // Labels
    ctx.fillStyle = '#444';
    ctx.font = 'bold ' + Math.round(10*fs) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    modules.forEach(function(mid, i) {
      var angle = (Math.PI * 2 / n) * i - Math.PI / 2;
      var lr = r + 22;
      var x = cx + lr * Math.cos(angle);
      var y = cy + lr * Math.sin(angle);
      ctx.fillText(labels[i], x, y);
    });
  }

  function drawRadarChart(canvas, scores, age) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var r = Math.min(W, H) / 2 - 50;
    var gap = 60;
    var cxL = W * 0.27, cxR = W * 0.73, cy = H/2;

    // Font scale: 基准 500px 宽 → zoom 时等比放大
    var fontScale = Math.max(1, W / 500);

    // Left hexagon title
    ctx.fillStyle = '#5179c9';
    ctx.font = 'bold ' + Math.round(14*fontScale) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('左脑倾向 · 语言/逻辑', cxL, cy - r - Math.round(35*fontScale));

    // Right hexagon title
    ctx.fillStyle = '#e07b4c';
    ctx.font = 'bold ' + Math.round(14*fontScale) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillText('右脑倾向 · 视觉/空间', cxR, cy - r - Math.round(35*fontScale));

    drawHexagon(ctx, cxL, cy, r, LEFT_HEX, LEFT_LABELS, scores, fontScale, age);
    drawHexagon(ctx, cxR, cy, r, RIGHT_HEX, RIGHT_LABELS, scores, fontScale, age);
  }

  // ========== QUICK6 单六边形雷达图 (6项快速测试专用) ==========
  function drawSingleHexagonRadar(canvas, scores, age) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var r = Math.min(W, H) / 2 - 60;
    var cx = W / 2;
    var cy = H / 2 - 5;
    var fontScale = Math.max(1, W / 500);

    drawHexagon(ctx, cx, cy, r, QUICK6_ORDER, QUICK6_ORDER.map(function(id){return QUICK6_LABELS[id] || id;}), scores, fontScale, age);

    // 中央显示综合分 — 年龄校正
    var total = 0;
    QUICK6_ORDER.forEach(function(id) {
      var raw = scores[id] || 50;
      total += Math.min(getScoreCap(age), raw * (age ? ageFactor(age, id) : 1.0));
    });
    var avg = Math.round(total / 6);
    ctx.fillStyle = '#0e7a82';
    ctx.font = 'bold ' + Math.round(12*fontScale) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('综合', cx, cy - Math.round(12*fontScale));
    ctx.font = 'bold ' + Math.round(28*fontScale) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = getScoreColor(avg, null, age);
    ctx.fillText(avg, cx, cy + Math.round(12*fontScale));
    ctx.font = Math.round(10*fontScale) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('(满分 150)', cx, cy + Math.round(32*fontScale));
  }

  // ========== 3D BRAIN (Real CSS 3D Transform + SVG Region Overlay) ==========
  // Reference: 1920x1280 side-view image (head profile + brain)
  // 5 brain regions (侧视图本身只显示一个半球, 显示"左xx/右xx"两半球分数)
  // 注意: BRAIN_REGIONS(数组,10脑区)在文件顶部已定义; 此处只新增 5脑区多边形坐标
  // ========== 3D BRAIN (Real Ellipsoid Mesh + Reference Texture) ==========
  // 真3D椭球: 前后(z)>左右(x)>上下(y), 参考图作为纹理覆盖整个球面
  // 左右半球对称: 大脑是左右对称器官, 同一张图覆盖两侧
  var BRAIN_MESH_LAT = 28;  // 纬度分段(0..π)
  var BRAIN_MESH_LON = 56;  // 经度分段(0..2π)
  var BRAIN_RADIUS = 150;   // 基础半径(像素)
  var BRAIN_ELLIPSE = { x: 0.95, y: 1.05, z: 0.82 }; // 椭球三轴(比例): Y 长轴(上下) / Z 短轴(前后) / X 左右

  // ========== PROCEDURAL BRAIN TOP-VIEW TEXTURE ==========
  // 根因修复: 2D 侧视图无法变成 3D 对称脑图, 改为手工绘制左右镜像对称的大脑顶视图
  // 中央纵裂 (u=0.5) + 5 脑区颜色分区 + 脑沟回纹理 (gyri/sulci), 全部严格镜像
  function _buildProceduralBrainTexture(regions) {
    var SIZE = 1024;
    var canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    var ctx = canvas.getContext('2d');

    // 5 档颜色 (基于 0-150 分数): 视觉对比度比 v1 增强 (用饱和度更高的颜色)
    //   功能障碍 (0-30,最严重): 深蓝 #5b9bd5 / 线 #0d4d8a
    //   功能低下 (30-60,略差): 淡蓝 #b3d4f0 / 线 #1f6fbb
    //   正常      (60-90):  浅米 #faf0d8 / 线 #6a6a6a  ← 及格线 (和肤色区分)
    //   优秀      (90-120): 橙红 #f5a878 / 线 #c4501a
    //   卓越     (120-150): 深红 #d04030 / 线 #8b0000
    function tierColor(score) {
      if (score < 30) return { fill: '#b3d4f0', line: '#1f6fbb' };
      if (score < 60) return { fill: '#5b9bd5', line: '#0d4d8a' };
      if (score < 90) return { fill: '#faf0d8', line: '#6a6a6a' };
      if (score < 120) return { fill: '#f5a878', line: '#c4501a' };
      return { fill: '#d04030', line: '#8b0000' };
    }
    // 取左右脑区分数均值用于颜色判定
    function avgScore(leftKey, rightKey) {
      var l = regions[leftKey] != null ? regions[leftKey] : 75;
      var r = regions[rightKey] != null ? regions[rightKey] : 75;
      return (l + r) / 2;
    }
    var cFrontal  = tierColor(avgScore('左额叶','右额叶'));
    var cParietal = tierColor(avgScore('左顶叶','右顶叶'));
    var cOccipital= tierColor(avgScore('左枕叶','右枕叶'));
    var cTemporal = tierColor(avgScore('左颞叶','右颞叶'));
    var cCerebellum=tierColor(avgScore('左小脑','右小脑'));

    // ----- 1) 背景 -----
    ctx.fillStyle = '#d8dde4';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ----- 2) 大脑轮廓 (顶视图) -----
    var cx = SIZE / 2, cy = SIZE / 2;
    var brainW = 360;  // 左右半径
    var brainH = 440;  // 上下半径 (稍微纵向长)

    // 大脑整体底色 (比肤色更深的米色)
    ctx.fillStyle = '#e8d8b8';
    ctx.beginPath();
    ctx.ellipse(cx, cy, brainW, brainH, 0, 0, Math.PI * 2);
    ctx.fill();

    // ----- 3) 5 脑区颜色覆盖 (顶视图布局) -----
    // 额叶 (frontal): v 0.05~0.30
    ctx.fillStyle = cFrontal.fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy - brainH * 0.55, brainW * 0.85, brainH * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
    // 顶叶 (parietal): v 0.28~0.55
    ctx.fillStyle = cParietal.fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy - brainH * 0.10, brainW * 0.95, brainH * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    // 枕叶 (occipital): v 0.55~0.78
    ctx.fillStyle = cOccipital.fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy + brainH * 0.35, brainW * 0.70, brainH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // 颞叶 (temporal): 左右两侧, v 0.40~0.70
    ctx.fillStyle = cTemporal.fill;
    ctx.beginPath();
    ctx.ellipse(cx - brainW * 0.75, cy + brainH * 0.10, brainW * 0.30, brainH * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + brainW * 0.75, cy + brainH * 0.10, brainW * 0.30, brainH * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // 小脑 (cerebellum): v 0.78~0.92 (深色, 区别于大脑)
    ctx.fillStyle = cCerebellum.fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy + brainH * 0.75, brainW * 0.55, brainH * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // ----- 4) 大脑外轮廓描边 (深色, 强化边界) -----
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, brainW, brainH, 0, 0, Math.PI * 2);
    ctx.stroke();

    // ----- 5) 脑沟回 (gyri) — 镜像对称, 粗黑线 (v2 加粗到 5px, 颜色 #1a1a1a) -----
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function drawGyriPath(mirror) {
      var gyri = [
        [0.10, 0.10, 0.05, 0.35, 30],
        [0.12, 0.18, -0.04, 0.32, 25],
        [0.08, 0.25, 0.06, 0.38, 35],
        [0.15, 0.35, -0.05, 0.30, 28],
        [0.18, 0.45, 0.07, 0.32, 30],
        [0.20, 0.52, -0.06, 0.28, 26],
        [0.22, 0.60, 0.05, 0.25, 22],
        [0.25, 0.68, -0.04, 0.20, 20],
        [0.30, 0.74, 0.03, 0.15, 16],
        [0.05, 0.50, 0.08, 0.25, 32],
        [0.05, 0.58, -0.06, 0.22, 28],
        [0.05, 0.66, 0.05, 0.18, 22]
      ];
      for (var i = 0; i < gyri.length; i++) {
        var g = gyri[i];
        var sx = g[0], sy = g[1], cxOff = g[2], len = g[3], amp = g[4];
        if (mirror) sx = 1 - sx;
        var x0 = sx * SIZE, y0 = sy * SIZE;
        var x1 = x0 + (mirror ? -len : len) * SIZE;
        var y1 = y0;
        var cpx = (x0 + x1) / 2 + cxOff * SIZE;
        var cpy = y0 + amp;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cpx, cpy, x1, y1);
        ctx.stroke();
      }
    }
    drawGyriPath(false);
    drawGyriPath(true);

    // 颞叶额外垂直短沟
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 4;
    for (var s = 0; s < 5; s++) {
      var sy2 = (0.42 + s * 0.06) * SIZE;
      ctx.beginPath();
      ctx.moveTo(0.06 * SIZE, sy2);
      ctx.quadraticCurveTo(0.10 * SIZE, sy2 + 8, 0.16 * SIZE, sy2 - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.94 * SIZE, sy2);
      ctx.quadraticCurveTo(0.90 * SIZE, sy2 + 8, 0.84 * SIZE, sy2 - 6);
      ctx.stroke();
    }

    // 小脑横纹 (像树枝状的 horizontal stripes, 平行排列)
    ctx.strokeStyle = '#8b0000';
    ctx.lineWidth = 3;
    for (var cb = 0; cb < 5; cb++) {
      var cbY = (0.81 + cb * 0.025) * SIZE;
      var cbW = (0.30 - cb * 0.03) * SIZE;
      ctx.beginPath();
      ctx.moveTo(cx - cbW, cbY);
      ctx.quadraticCurveTo(cx, cbY - 4, cx + cbW, cbY);
      ctx.stroke();
    }

    // ----- 6) 中央纵裂 (longitudinal fissure) — 加粗加深 -----
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 7;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - brainH * 0.92);
    ctx.lineTo(cx, cy + brainH * 0.85);
    ctx.stroke();
    ctx.setLineDash([]);

    // 小脑蚓部 (vermis)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy + brainH * 0.78);
    ctx.lineTo(cx, cy + brainH * 0.90);
    ctx.lineTo(cx + 16, cy + brainH * 0.78);
    ctx.stroke();

    return canvas;
  }

  function _buildBrainMesh() {
    var verts = [];
    var idx = [];
    for (var i = 0; i <= BRAIN_MESH_LAT; i++) {
      var theta = (i / BRAIN_MESH_LAT) * Math.PI;
      var v = i / BRAIN_MESH_LAT;
      for (var j = 0; j <= BRAIN_MESH_LON; j++) {
        var phi = (j / BRAIN_MESH_LON) * 2 * Math.PI;
        var u = j / BRAIN_MESH_LON;
        var sinT = Math.sin(theta), cosT = Math.cos(theta);
        verts.push({
          x: sinT * Math.cos(phi) * BRAIN_ELLIPSE.x,
          y: cosT * BRAIN_ELLIPSE.y,
          z: sinT * Math.sin(phi) * BRAIN_ELLIPSE.z,
          u: u, v: v
        });
      }
    }
    var rowSize = BRAIN_MESH_LON + 1;
    for (var i = 0; i < BRAIN_MESH_LAT; i++) {
      for (var j = 0; j < BRAIN_MESH_LON; j++) {
        var a = i * rowSize + j;
        var b = a + 1;
        var c = a + rowSize;
        var d = c + 1;
        idx.push(a, c, b);
        idx.push(b, c, d);
      }
    }
    return { verts: verts, idx: idx };
  }

  var _brainMesh = _buildBrainMesh();

  // 图片纹理缓存 (RGB Array)
  function _buildTexCache(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, data: data };
  }

  function _sampleTex(tex, u, v) {
    // u, v ∈ [0, 1] — 镜像模式使左右半球对称
    var w = tex.width, h = tex.height;
    u = u - Math.floor(u); // wrap to [0,1)
    // 镜像: u>0.5 时翻转, 让左右半球对称
    if (u > 0.5) u = 1 - u;
    u = u * 2; // 映射到整张图(只用半张图覆盖两边)
    if (u < 0) u = 0; if (u > 0.999) u = 0.999;
    if (v < 0) v = 0; if (v > 0.999) v = 0.999;
    var x = Math.floor(u * w);
    var y = Math.floor(v * h);
    var i = (y * w + x) * 4;
    return [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
  }

  var _br = {
    ry: 1.57, rx: -0.05,  // 默认正侧视 (90° 旋转, -3° 俯角) — 参考图角度
    dragging: false, mx: 0, my: 0,
    vy: 0, vx: 0, raf: null,
    gl: null, program: null,
    posLoc: -1, uvLoc: -1,
    uRotLoc: null, uProjLoc: null, uTexLoc: null,
    posBuf: null, uvBuf: null, idxBuf: null,
    tex: null, ready: false,
    projMatrix: null
  };

  // ========== WEBGL SHADERS ==========
  // 头形变形: 颅顶(y>0.3) + 额头/后枕过渡(-0.2<y<0.3) + 颈椎(y<-0.2)
  // 面部突起: 鼻子(中前) + 下巴(前下) + 额头(前上轻推) + 小脑(后下外凸)
  // 顶点局部坐标传递给 fragment shader, 用 3D 位置投影决定脑图/肤色的区域
  var BRAIN_VS = [
    'attribute vec3 aPos;',
    'attribute vec2 aUV;',
    'uniform mat4 uRotation;',
    'uniform mat4 uProjection;',
    'varying vec2 vUV;',
    'varying vec3 vWorldPos;',
    'varying vec3 vLocalPos;',
    '',
    'vec3 deformHead(vec3 p) {',
    // aPos 单位 (BRAIN_RADIUS=150 缩放后), 范围 y±157, z±123, x±142
    // 转换为椭球单位 (n = p / 150) 做区域判断 (避免阈值被椭球大小吞掉)
    '  vec3 n = p / 150.0;',
    '  vec3 q = p;',
    '  float y = n.y;',  // 上下, 椭球单位 [-1.05, 1.05]
    '  float z = n.z;',  // 前后, 椭球单位 [-0.82, 0.82]
    '  float x = n.x;',  // 左右, 椭球单位 [-0.95, 0.95]
    // 颅顶 (y > 0.3): 圆顶, 略纵向拉长
    '  if (y > 0.3) {',
    '    q.x = p.x * 0.85;',  // 头形更窄
    '    q.y = p.y * 1.30;',  // 头形更高
    '    q.z = p.z * 0.95;',
    '  } else if (y > -0.2) {',
    '    q.x = p.x * 0.85;',
    '    q.y = p.y * 1.20;',
    '    q.z = p.z * 0.90;',
    // ===== 面部整体前凸 (z < 0): 基础凸 + 鼻梁/额头/下巴权重加强 =====
    '    if (z < 0.0) {',
    // 基础前凸: 仅前部 (z<-0.10) 推, 留出 z ∈ [-0.10, 0] 颅骨自然过渡区
    '      float faceT = smoothstep(-0.10, -0.60, z);',  // z=-0.10→0, z=-0.60→1
    '      faceT = min(faceT, 0.85);',
    '      q.z -= 30.0 * faceT;',  // 面部基础凸 ≤ 0.20 椭球单位
    // 鼻梁加强: z 越靠前 + y 越接近 0 越强 (鼻梁在 y=0 中心)
    '      float noseY = max(0.0, 1.0 - abs(y) / 0.14);',
    '      float noseZ = smoothstep(-0.10, -0.50, z);',
    '      q.z -= 55.0 * noseY * noseZ;',  // 鼻梁额外凸 ≤ 0.37 椭球单位 ★
    // 额头加强: z 越靠前 + y 越大越强 (额头在 y > 0.10)
    '      float fhY = smoothstep(0.05, 0.30, y);',
    '      float fhZ = smoothstep(-0.10, -0.45, z);',
    '      q.z -= 35.0 * fhY * fhZ;',  // 额头额外凸 ≤ 0.23 椭球单位
    // 下巴加强: z 越靠前 + y 越小越强 (下巴在 y < -0.05)
    '      float chY = max(0.0, smoothstep(0.0, -0.18, y));',
    '      float chZ = smoothstep(-0.10, -0.45, z);',
    '      q.z -= 40.0 * chY * chZ;',  // 下巴额外凸 ≤ 0.27 椭球单位
    '    }',
    // ===== 后部整体后凸 (z > 0): 基础凸 + 小脑加强 =====
    '    if (z > 0.0) {',
    '      float backT = smoothstep(0.0, 0.4, z);',
    '      backT = min(backT, 0.85);',
    '      q.z += 20.0 * backT;',  // 后部基础凸 ≤ 0.13 椭球单位
    // 小脑加强: 后下 (z>0.25, y<0.05) 额外后下凸
    '      float cbZ = smoothstep(0.20, 0.55, z);',
    '      float cbY = max(0.0, smoothstep(0.10, -0.15, y));',
    '      q.z += 24.0 * cbZ * cbY;',  // 小脑额外凸 ≤ 0.16 椭球单位
    '      q.y -= 6.0 * cbZ * cbY;',  // 略向下
    '    }',
    '  } else {',
    // 颈椎 (y < -0.2 椭球单位): 圆柱收窄 + y 向下延伸形成真正的颈椎
    '    float t = clamp((-0.2 - y) / 0.7, 0.0, 1.0);',  // y=-0.2→0, y=-0.9→1
    '    float neckW = 0.40 - 0.15 * t;',  // 0.40 → 0.25
    '    q.x = p.x * neckW;',
    '    q.y = p.y * (1.0 + 0.6 * t);',  // 颈椎底 y 拉长 60% 形成圆柱延伸
    '    q.z = p.z * neckW;',
    '  }',
    '  return q;',
    '}',
    '',
    'void main() {',
    '  vec3 localDeformed = deformHead(aPos);',
    '  vLocalPos = localDeformed;',
    // 缩放 0.005 (从 0.007 缩小, 防止头形被裁剪)
    '  vec3 p = localDeformed * 0.005;',
    '  vec4 worldPos = uRotation * vec4(p, 1.0);',
    '  worldPos.z -= 4.0;',
    '  vWorldPos = worldPos.xyz;',
    '  gl_Position = uProjection * vec4(worldPos.x, worldPos.y, worldPos.z, 1.0);',
    '  vUV = aUV;',
    '}'
  ].join('\n');

  var BRAIN_FS = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'varying vec2 vUV;',
    'varying vec3 vWorldPos;',
    'varying vec3 vLocalPos;',
    '',
    'void main() {',
    // 背面剔除: 用世界空间 normal (相对脑中心) 的 z 分量判断
    '  vec3 brainCenter = vec3(0.0, 0.0, -4.5);',
    '  vec3 N = normalize(vWorldPos - brainCenter);',
    '  if (N.z < 0.0) discard;',
    // vLocalPos 是 aPos 单位 (BRAIN_RADIUS=150 缩放后), 转椭球单位 (n = vLocalPos/150) 做区域判定
    '  float nY = vLocalPos.y / 150.0;',
    '  float nX = vLocalPos.x / 150.0;',
    '  float nZ = vLocalPos.z / 150.0;',
    // 区域判定 (椭球单位), smoothstep 渐变避免边界暗线:
    //   颅骨 (nY > -0.2 && nZ > 0): 颅骨后部(颅顶+后枕)是脑色
    //   小脑 (nZ > 0.25 && nY > -0.5): 后下小脑也是脑色
    //   面部 (nZ < 0) + 颈椎: 肤色
    '  float brainMask = smoothstep(0.0, 0.20, nZ);',  // nZ<0 显肤色, nZ>0.20 显脑色
    '  if (nZ > 0.25 && nY > -0.5) brainMask = 1.0;',  // 小脑强制脑色
    '  if (nY < -0.3) brainMask *= smoothstep(-0.3, -0.1, nY);',  // 颈椎附近渐变
    '  vec3 c;',
    '  if (brainMask > 0.5) {',  // 阈值简化, 实际是二值
    '    float u = (nX + 0.95) / 1.90;',
    '    float v = (nZ + 0.85) / 1.70;',
    '    u = clamp(u, 0.0, 0.999);',
    '    v = clamp(v, 0.0, 0.999);',
    '    c = texture2D(uTex, vec2(u, v)).rgb;',
    '  } else {',
    '    c = vec3(0.96, 0.84, 0.72);',  // 肤色 (暖米黄, 和脑图明显区分)
    '  }',
    // 在 brainMask 过渡区 (0~1) 混合脑色和肤色, 消除碗形暗线
    '  if (brainMask > 0.0 && brainMask < 1.0) {',
    '    float u2 = (nX + 0.95) / 1.90;',
    '    float v2 = (nZ + 0.85) / 1.70;',
    '    u2 = clamp(u2, 0.0, 0.999);',
    '    v2 = clamp(v2, 0.0, 0.999);',
    '    vec3 brainC = texture2D(uTex, vec2(u2, v2)).rgb;',
    '    vec3 skinC = vec3(0.96, 0.84, 0.72);',
    '    c = mix(skinC, brainC, brainMask);',
    '  }',
    // 光照: 压缩范围 0.85~1.0, 减少颜色变暗
    '  float diff = max(dot(N, normalize(vec3(0.3, 0.4, 1.0))), 0.0);',
    '  float light = 0.85 + 0.15 * diff;',
    '  gl_FragColor = vec4(c * light, 1.0);',
    '}'
  ].join('\n');

  function _compileShader(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Shader compile:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function _buildRotationMat(ry, rx) {
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cx = Math.cos(rx), sx = Math.sin(rx);
    // Y rotation * X rotation, 列主序
    return new Float32Array([
      cy,       sy*sx,    sy*cx,    0,
      0,        cx,       -sx,      0,
      -sy,      cy*sx,    cy*cx,    0,
      0,        0,        0,        1
    ]);
  }

  function _buildProjMat(W, H) {
    var aspect = W / H;
    var fov = Math.PI / 6; // 30 度
    var f = 1.0 / Math.tan(fov / 2);
    var near = 0.5, far = 100;
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0,                       0,
      0,          f, 0,                       0,
      0,          0, (far + near) * nf,      -1,
      0,          0, 2 * far * near * nf,     0
    ]);
  }

  function _initWebGL(canvas) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) gl = canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) return null;
    var vs = _compileShader(gl, gl.VERTEX_SHADER, BRAIN_VS);
    var fs = _compileShader(gl, gl.FRAGMENT_SHADER, BRAIN_FS);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link:', gl.getProgramInfoLog(prog));
      return null;
    }
    return {
      gl: gl, program: prog,
      posLoc: gl.getAttribLocation(prog, 'aPos'),
      uvLoc: gl.getAttribLocation(prog, 'aUV'),
      uRotLoc: gl.getUniformLocation(prog, 'uRotation'),
      uProjLoc: gl.getUniformLocation(prog, 'uProjection'),
      uTexLoc: gl.getUniformLocation(prog, 'uTex')
    };
  }

  function _uploadMesh(gl, posLoc, uvLoc) {
    var verts = _brainMesh.verts;
    var posData = new Float32Array(verts.length * 3);
    var uvData = new Float32Array(verts.length * 2);
    for (var i = 0; i < verts.length; i++) {
      posData[i * 3]     = verts[i].x * BRAIN_RADIUS;
      posData[i * 3 + 1] = verts[i].y * BRAIN_RADIUS;
      posData[i * 3 + 2] = verts[i].z * BRAIN_RADIUS;
      uvData[i * 2]      = verts[i].u;
      uvData[i * 2 + 1]  = verts[i].v;
    }
    var posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    var uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    var idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(_brainMesh.idx), gl.STATIC_DRAW);

    return idxBuf;
  }

  function _uploadTexture(gl, img) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  function drawBrainSphere(canvas, ry, rx) {
    if (!_br.ready || !_br.gl) return;
    var gl = _br.gl;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.91, 0.925, 0.945, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(_br.program);
    gl.uniformMatrix4fv(_br.uRotLoc, false, _buildRotationMat(ry, rx));
    gl.uniformMatrix4fv(_br.uProjLoc, false, _br.projMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _br.tex);
    gl.uniform1i(_br.uTexLoc, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _br.idxBuf);
    gl.drawElements(gl.TRIANGLES, _brainMesh.idx.length, gl.UNSIGNED_SHORT, 0);
  }

  function brainInertiaLoop() {
    if (_br.dragging) { _br.raf = null; return; }
    if (Math.abs(_br.vy) > 0.0008 || Math.abs(_br.vx) > 0.0008) {
      _br.ry += _br.vy;
      _br.rx += _br.vx;
      _br.rx = Math.max(-1.4, Math.min(1.4, _br.rx));
      _br.vy *= 0.94;
      _br.vx *= 0.94;
      var canvas = document.getElementById('cog-brain-canvas');
      if (canvas && _br.ready) drawBrainSphere(canvas, _br.ry, _br.rx);
      _br.raf = requestAnimationFrame(brainInertiaLoop);
    } else {
      _br.raf = null;
    }
  }

  // ========== 2D BRAIN REPORT (顶视图 brain-topview.jpg, 左右镜像) ==========
  function _draw2DBrainReport(canvas, regions) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    function lobeFill(s) {
      if (s >= 135) return 'rgba(220,38,38,0.88)';
      if (s >= 120) return 'rgba(249,115,22,0.82)';
      if (s >= 90) return 'rgba(255,248,235,0.82)';
      if (s >= 65) return 'rgba(147,197,253,0.78)';
      return 'rgba(37,99,235,0.88)';
    }
    function regScore(prefix, name) {
      var k = prefix + name;
      return regions && regions[k] != null ? regions[k] : 50;
    }
    var STATUS_NAMES = {0:'障碍',1:'低下',2:'正常',3:'优秀',4:'卓越'};
    function statusLabel(s) {
      if (s >= 135) return STATUS_NAMES[4];
      if (s >= 120) return STATUS_NAMES[3];
      if (s >= 90) return STATUS_NAMES[2];
      if (s >= 65) return STATUS_NAMES[1];
      return STATUS_NAMES[0];
    }
    function glowFrom(f) { var m = f.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/); return m ? 'rgba('+m[1]+','+m[2]+','+m[3]+',0.60)' : f; }
    function centerOf(p) { var cx=0,cy=0; p.forEach(function(q){cx+=q[0];cy+=q[1];}); return [cx/p.length, cy/p.length]; }

    var IMG_W = 1150, IMG_H = 1080, GAP = 24;
    var SCALE = Math.min((W - GAP) / (IMG_W * 2), (H - 60) / IMG_H);
    var iw = Math.round(IMG_W * SCALE);
    var ih = Math.round(IMG_H * SCALE);
    var leftOx = Math.round((W - iw * 2 - GAP) / 2);
    var rightOx = leftOx + iw + GAP;
    var y = Math.round((H - ih) / 2);

    var POLYS = {
      '额叶': [[170,530],[170,290],[230,250],[290,238],[385,255],[400,370],[355,480],[265,530]],
      '顶叶': [[515,415],[495,335],[515,225],[580,180],[645,170],[710,167],[775,170],[840,185],[870,225],[875,290],[855,355],[815,400],[740,425],[670,428],[565,425]],
      '枕叶': [[930,560],[900,390],[915,365],[950,355],[995,370],[1025,400],[1060,475],[1045,550],[1010,590],[960,598]],
      '颞叶': [[410,690],[395,620],[410,555],[435,510],[475,495],[550,490],[630,495],[700,510],[755,525],[775,575],[775,605],[735,645],[670,675],[585,685],[500,685]],
      '小脑': [[820,810],[820,630],[880,615],[985,615],[1030,640],[1030,710],[985,745],[890,810],[840,810]]
    };

    function drawLobes(prefix, ox) {
      ['额叶','顶叶','枕叶','颞叶','小脑'].forEach(function(name) {
        var poly = POLYS[name]; if (!poly) return;
        var score = regScore(prefix, name);
        var fill = lobeFill(score);
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowFrom(fill);
        ctx.fillStyle = fill;
        ctx.beginPath();
        poly.forEach(function(p, i) {
          var px = ox + p[0] * SCALE, py = y + p[1] * SCALE;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = fill;
        ctx.beginPath();
        poly.forEach(function(p, i) {
          var px = ox + p[0] * SCALE, py = y + p[1] * SCALE;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath(); ctx.fill();
        var ct = centerOf(poly);
        ctx.fillStyle = '#111'; ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name, ox + ct[0]*SCALE, y + ct[1]*SCALE - 5);
        ctx.font = '6px sans-serif'; ctx.fillStyle = '#444';
        ctx.fillText(statusLabel(score), ox + ct[0]*SCALE, y + ct[1]*SCALE + 5);
      });
    }
    function drawMirrored(prefix) {
      ['额叶','顶叶','枕叶','颞叶','小脑'].forEach(function(name) {
        var poly = POLYS[name]; if (!poly) return;
        var score = regScore(prefix, name);
        var fill = lobeFill(score);
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowFrom(fill);
        ctx.fillStyle = fill;
        ctx.beginPath();
        poly.forEach(function(p, i) {
          var px = p[0] * SCALE, py = p[1] * SCALE;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = fill;
        ctx.beginPath();
        poly.forEach(function(p, i) {
          var px = p[0] * SCALE, py = p[1] * SCALE;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath(); ctx.fill();
        var ct = centerOf(poly);
        // 反向 scale 让文字不镜像
        ctx.save(); ctx.scale(-1, 1);
        ctx.fillStyle = '#111'; ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name, -ct[0]*SCALE, ct[1]*SCALE - 5);
        ctx.font = '6px sans-serif'; ctx.fillStyle = '#444';
        ctx.fillText(statusLabel(score), -ct[0]*SCALE, ct[1]*SCALE + 5);
        ctx.restore();
      });
    }

    var img = new Image();
    img.onload = function() {
      // 左图 (原图 → 左脑)
      ctx.drawImage(img, leftOx, y, iw, ih);
      drawLobes('左', leftOx);
      // 右图 (镜像 → 右脑)
      ctx.save();
      ctx.translate(rightOx + iw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, iw, ih);
      drawMirrored('右');
      ctx.restore();
      // 中分线
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(W/2, y-4); ctx.lineTo(W/2, y+ih+4); ctx.stroke();
      ctx.setLineDash([]);
      // 标签
      ctx.fillStyle = '#1a1a2e'; ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('左脑', leftOx + iw/2, 14);
      ctx.fillText('右脑', rightOx + iw/2, 14);
      // 图例 (字号加大, 色块加大, 间距加大, 利用脑图下方空间)
      ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var legendY = y + ih + 16;
      var items = [
        {c:'rgba(37,99,235,0.88)',t:'功能障碍'},{c:'rgba(147,197,253,0.78)',t:'功能低下'},
        {c:'rgba(255,248,235,0.82)',t:'正常'},{c:'rgba(245,40,20,0.82)',t:'优秀'},{c:'rgba(240,5,5,0.88)',t:'卓越'}
      ];
      var lx = 12;
      items.forEach(function(it) {
        ctx.fillStyle = it.c; ctx.fillRect(lx, legendY-6, 16, 12);
        ctx.fillStyle = '#333'; ctx.fillText(it.t, lx+20, legendY); lx += 100;
      });
    };
    img.onerror = function() {
      ctx.fillStyle = '#c00'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('参考图加载失败: assets/brain-topview.jpg', 20, 20);
    };
    img.src = 'assets/brain-topview.jpg';
  }
  function initBrain3D(regions) {
    var canvas = document.getElementById('cog-brain-canvas');
    if (!canvas) return;

    // 更新脑区图例 (分数显示)
    var legendEl = document.getElementById('cog-brain-legend');
    if (legendEl) {
      var lh = '';
      ['额叶','顶叶','枕叶','颞叶','小脑'].forEach(function(r){
        var l = regions['左' + r] != null ? regions['左' + r] : 0;
        var ri = regions['右' + r] != null ? regions['右' + r] : 0;
        var avg = Math.round((l + ri) / 2);
        var c = getRegionColor(avg);
        lh += '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px;padding:3px 8px;border-radius:12px;background:' + c + '22;border:1.5px solid ' + c + ';font-size:12px;">'
            + '<b style="color:' + c + ';">' + r + '</b>'
            + '<span style="color:#666;">左</span><b>' + l + '</b>'
            + '<span style="color:#666;">/</span>'
            + '<span style="color:#666;">右</span><b>' + ri + '</b>'
            + '</span>';
      });
      legendEl.innerHTML = lh;
    }

    // 初始化 WebGL (只一次)
    if (!_br.gl) {
      var initRes = _initWebGL(canvas);
      if (!initRes) {
        console.error('[brain] WebGL init failed');
        // WebGL 不可用, 显示提示
        var c2 = canvas.getContext('2d');
        if (c2) {
          c2.fillStyle = '#fff'; c2.fillRect(0, 0, canvas.width, canvas.height);
          c2.fillStyle = '#c00'; c2.font = '14px sans-serif';
          c2.fillText('WebGL 不可用, 请升级浏览器', 20, 30);
        }
        return;
      }
      _br.gl = initRes.gl;
      _br.program = initRes.program;
      _br.posLoc = initRes.posLoc;
      _br.uvLoc = initRes.uvLoc;
      _br.uRotLoc = initRes.uRotLoc;
      _br.uProjLoc = initRes.uProjLoc;
      _br.uTexLoc = initRes.uTexLoc;
      _br.idxBuf = _uploadMesh(_br.gl, _br.posLoc, _br.uvLoc);
      _br.projMatrix = _buildProjMat(canvas.width, canvas.height);
    }

    // 加载 procedural brain texture (左右镜像对称的大脑顶视图)
    if (!_br.ready) {
      try {
        var brainCanvas = _buildProceduralBrainTexture(regions);
        _br.tex = _uploadTexture(_br.gl, brainCanvas);
        _br.ready = true;
        drawBrainSphere(canvas, _br.ry, _br.rx);
      } catch (e) {
        console.error('[brain] procedural texture build failed', e);
        // 失败: 1x1 灰色纹理占位
        _br.tex = _br.gl.createTexture();
        _br.gl.bindTexture(_br.gl.TEXTURE_2D, _br.tex);
        _br.gl.texImage2D(_br.gl.TEXTURE_2D, 0, _br.gl.RGBA, 1, 1, 0, _br.gl.RGBA, _br.gl.UNSIGNED_BYTE, new Uint8Array([220, 220, 220, 255]));
        _br.gl.texParameteri(_br.gl.TEXTURE_2D, _br.gl.TEXTURE_MIN_FILTER, _br.gl.LINEAR);
        _br.ready = true;
        drawBrainSphere(canvas, _br.ry, _br.rx);
      }
    } else {
      drawBrainSphere(canvas, _br.ry, _br.rx);
    }

    function start(x, y) {
      _br.dragging = true;
      _br.mx = x; _br.my = y;
      _br.vy = 0; _br.vx = 0;
      if (_br.raf) { cancelAnimationFrame(_br.raf); _br.raf = null; }
      canvas.style.cursor = 'grabbing';
    }
    function move(x, y) {
      if (!_br.dragging) return;
      var dx = x - _br.mx;
      var dy = y - _br.my;
      _br.ry += dx * 0.008;
      _br.rx += dy * 0.006;
      _br.rx = Math.max(-1.4, Math.min(1.4, _br.rx));
      _br.vy = dx * 0.008;
      _br.vx = dy * 0.006;
      _br.mx = x; _br.my = y;
      if (_br.ready) drawBrainSphere(canvas, _br.ry, _br.rx);
    }
    function end() {
      if (!_br.dragging) return;
      _br.dragging = false;
      canvas.style.cursor = 'grab';
      if (Math.abs(_br.vy) > 0.0008 || Math.abs(_br.vx) > 0.0008) {
        _br.raf = requestAnimationFrame(brainInertiaLoop);
      }
    }
    canvas.onmousedown = function (e) { start(e.clientX, e.clientY); e.preventDefault(); };
    canvas.onmousemove = function (e) { move(e.clientX, e.clientY); if (_br.dragging) e.preventDefault(); };
    canvas.onmouseup = canvas.onmouseleave = end;
    canvas.ontouchstart = function (e) { var t = e.touches[0]; start(t.clientX, t.clientY); e.preventDefault(); };
    canvas.ontouchmove = function (e) { var t = e.touches[0]; move(t.clientX, t.clientY); if (_br.dragging) e.preventDefault(); };
    canvas.ontouchend = canvas.ontouchcancel = end;
  }

  // ========== TREND CHART ==========
  function drawTrendChart(canvas, history, modId, currentAge) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var pad = {top:20, right:20, bottom:30, left:40};
    var pw = W - pad.left - pad.right;
    var ph = H - pad.top - pad.bottom;
    var yMax = getScoreCap(currentAge); // 儿童 200, 成人 150

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    // Y axis
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    [50, 90, 120].forEach(function(yVal) {
      var y = pad.top + ph - (yVal / yMax * ph);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.strokeStyle = yVal === 90 ? 'rgba(59,130,246,0.3)' : '#eee';
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(yVal, pad.left - 5, y + 3);
    });

    // Data line — 使用年龄校正后的分数
    if (history.length > 1) {
      var stepX = pw / Math.max(history.length - 1, 1);
      ctx.beginPath();
      history.forEach(function(h, i) {
        var x = pad.left + i * stepX;
        var hAge = h.age || currentAge;
        var adj = h.score * (hAge ? ageFactor(hAge, modId) : 1.0);
        var adjClamped = Math.min(getScoreCap(hAge), adj);
        var y = pad.top + ph - (adjClamped / yMax * ph);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#00D9A5';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Points — 年龄校正后颜色
      history.forEach(function(h, i) {
        var x = pad.left + i * stepX;
        var hAge = h.age || currentAge;
        var adj = h.score * (hAge ? ageFactor(hAge, modId) : 1.0);
        var adjClamped = Math.min(getScoreCap(hAge), adj);
        var y = pad.top + ph - (adjClamped / yMax * ph);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI*2);
        ctx.fillStyle = getScoreColor(Math.round(adj), modId, hAge);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // X labels
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      history.forEach(function(h, i) {
        var x = pad.left + i * stepX;
        ctx.fillText(h.date, x, H - 5);
      });
    }
  }

  // ========== REPORT RENDERING ==========
  function renderReport(rawLog, existingHistory, isQuick6, reportTime, patientInfoOverride) {
    var scores = normalizeAllScores(rawLog);
    var patientInfo = patientInfoOverride || getPatientInfo();
    var regions = computeBrainRegions(scores, patientInfo.age, isQuick6);
    var divisor = isQuick6 ? 6 : 12;
    var totalAdj = 0;
    Object.keys(scores).forEach(function(k){ totalAdj += scores[k] * (patientInfo.age ? ageFactor(patientInfo.age, k) : 1.0); });
    var avgScore = Math.round(totalAdj / divisor);
    var riskIndex = Math.round(100 - (avgScore / 150 * 100));

    // Quick6 模式只显示 6 个模块详情, 完整模式显示全部 12 个
    var moduleList = isQuick6
      ? QUICK6_ORDER.map(function(id) { return MODULES.find(function(m) { return m.id === id; }); }).filter(Boolean)
      : MODULES;

    // Build nav tabs
    var nav = document.getElementById('cog-report-nav');
    var tabHtml = '<button class="cog-report-tab active" data-section="overview" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap;flex-shrink:0;">总览</button>';
    moduleList.forEach(function(m) {
      tabHtml += '<button class="cog-report-tab" data-section="mod-'+m.id+'" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;">'+m.icon+'</button>';
    });
    nav.innerHTML = tabHtml;

    // Build body
    var body = document.getElementById('cog-report-body');
    var html = '';
    html += '<div id="cog-section-overview">' + genOverviewHTML(scores, regions, riskIndex, patientInfo, patientInfo.age, isQuick6, reportTime) + '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">';
    moduleList.forEach(function(m) {
      var raw = rawLog[m.id] || {};
      var s = scores[m.id];
      var history = existingHistory ? existingHistory[m.id] : null;
      html += '<div id="cog-section-mod-'+m.id+'">' + genModuleDetailHTML(m, s, raw, history, patientInfo.age) + '</div>';
    });
    html += '</div>';

    body.innerHTML = html;

    // Draw radar chart
    setTimeout(function() {
      var radarCanvas = document.getElementById('cog-radar-canvas');
      if (radarCanvas) {
        var patientAge = patientInfo.age || '';
        if (isQuick6) drawSingleHexagonRadar(radarCanvas, scores, patientAge);
        else drawRadarChart(radarCanvas, scores, patientAge);
      }

      // 2D 脑区报告 (主视图, 基于参考图左右镜像)
      var brain2dCanvas = document.getElementById('cog-brain-2d');
      if (brain2dCanvas) _draw2DBrainReport(brain2dCanvas, regions);

      // 3D 脑区视图 (保留, 慢慢优化)      // 3D 视图已从总览移除

      // Draw trend charts
      if (existingHistory) {
        moduleList.forEach(function(m) {
          var h = existingHistory[m.id];
          if (h && h.length > 1) {
            var tc = document.getElementById('cog-trend-'+m.id);
            if (tc) drawTrendChart(tc, h, m.id, patientInfo.age);
          }
        });
      }

      // 点击放大 (canvas → re-draw, HTML → transform scale)
      var brainCanvas = document.getElementById('cog-brain-2d');
      var radarCanvas = document.getElementById('cog-radar-canvas');
      var riskBox = document.getElementById('cog-ov-risk');
      if (brainCanvas && !isQuick6) {
        brainCanvas.style.cursor = 'pointer';
        brainCanvas.title = '点击放大';
        brainCanvas.addEventListener('click', function() { window._openCanvasZoom('brain'); });
      }
      if (radarCanvas) {
        radarCanvas.style.cursor = 'pointer';
        radarCanvas.title = '点击放大';
        radarCanvas.addEventListener('click', function() {
          window._openCanvasZoom(isQuick6 ? 'radar-quick6' : 'radar');
        });
      }
      if (riskBox) {
        riskBox.style.cursor = 'pointer';
        riskBox.title = '点击放大';
        riskBox.addEventListener('click', function() { window._openHtmlZoom(riskBox); });
      }
    }, 100);

    // Tab click handlers
    var tabs = nav.querySelectorAll('.cog-report-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) {
          t.classList.remove('active');
          t.style.background = 'rgba(255,255,255,0.05)';
          t.style.borderColor = 'rgba(255,255,255,0.1)';
          t.style.color = 'rgba(255,255,255,0.7)';
        });
        tab.classList.add('active');
        tab.style.background = 'rgba(255,255,255,0.15)';
        tab.style.borderColor = 'rgba(255,255,255,0.2)';
        tab.style.color = '#fff';
        var sectionId = 'cog-section-' + tab.getAttribute('data-section');
        var section = document.getElementById(sectionId);
        if (section) section.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });

    // Show overlay
    document.getElementById('cog-report-overlay').style.display = 'block';
    document.getElementById('page2').style.display = 'none';
  }

  // ========== LOCALSTORAGE PERSISTENCE ==========
  function saveRecord(rawLog, isQuick6) {
    var scores = normalizeAllScores(rawLog);
    var patientInfo = getPatientInfo();
    var regions = computeBrainRegions(scores, patientInfo.age, isQuick6);
    var divisor = isQuick6 ? 6 : 12;
    var totalAdj = 0;
    Object.keys(scores).forEach(function(k){ totalAdj += scores[k] * (patientInfo.age ? ageFactor(patientInfo.age, k) : 1.0); });
    var avgScore = Math.round(totalAdj / divisor);
    var riskIndex = Math.round(100 - (avgScore / 150 * 100));
    var now = new Date();

    var record = {
      id: 'cog_' + now.getFullYear() + (now.getMonth()+1).toString().padStart(2,'0') + now.getDate().toString().padStart(2,'0') + '_' + now.getHours().toString().padStart(2,'0') + now.getMinutes().toString().padStart(2,'0'),
      date: now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0'),
      time: now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0'),
      patientInfo: patientInfo,
      normalizedScores: scores,
      rawScores: rawLog,
      brainRegions: regions,
      riskIndex: riskIndex,
      overallScore: avgScore,
      isQuick6: !!isQuick6
    };

    try {
      var records = JSON.parse(localStorage.getItem('cog_records') || '[]');
      records.unshift(record);
      if (records.length > 10) records = records.slice(0, 10);
      localStorage.setItem('cog_records', JSON.stringify(records));
    } catch(e) {}
    return record;
  }

  // ========== CLOUD (GitHub API — 报告存仓库 data/reports/) ==========
  function _getTherapistId() {
    try { return localStorage.getItem('cog_therapist_id') || ''; } catch(e) { return ''; }
  }
  function _ensureTherapistId() {
    var tid = _getTherapistId();
    if (!tid) {
      tid = 'th_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem('cog_therapist_id', tid); } catch(e) {}
    }
    return tid;
  }
  function _ghHeaders() { var t = _ghToken(); if (!t) return null; return { 'Authorization': 'token ' + t, 'Content-Type': 'application/json' }; }

  function uploadToCloud(record) {
    if (!CLOUD_ENABLED || !_ghToken()) return;
    var tid = _getTherapistId() || _ensureTherapistId();
    var trimmedRaw = {};
    try {
      Object.keys(record.rawScores || {}).forEach(function(modId) {
        var r = record.rawScores[modId] || {};
        trimmedRaw[modId] = { score: r.score, correct: r.correct, trials: r.trials, completionRate: r.completionRate, digitCount: r.digitCount, totalIcons: r.totalIcons, totalCards: r.totalCards, rtTotal: r.rtTotal, rtAvg: r.rtAvg, level: r.level };
      });
    } catch(e) { trimmedRaw = {}; }
    var cloudRecord = {
      id: record.id, date: record.date, time: record.time,
      patientInfo: record.patientInfo, normalizedScores: record.normalizedScores, rawScores: trimmedRaw,
      brainRegions: record.brainRegions, riskIndex: record.riskIndex, overallScore: record.overallScore, isQuick6: record.isQuick6,
      createdAt: new Date().toISOString()
    };
    var json = JSON.stringify(cloudRecord);
    var b64 = btoa(unescape(encodeURIComponent(json)));
    var fileName = (record.date || 'unknown') + '_' + (record.id || Date.now()) + '.json';
    var path = GH_API + encodeURIComponent(tid) + '/' + encodeURIComponent(fileName);

    fetch(path, { method: 'PUT', headers: _ghHeaders(), body: JSON.stringify({ message: 'upload report: ' + (record.patientInfo && record.patientInfo.name || ''), content: b64 }) })
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(obj) {
      if (obj && obj.content && obj.content.sha) {
        try {
          var records = JSON.parse(localStorage.getItem('cog_records') || '[]');
          for (var i = 0; i < records.length; i++) { if (records[i].id === record.id) { records[i]._cloudId = obj.content.sha; break; } }
          localStorage.setItem('cog_records', JSON.stringify(records));
        } catch(e2) {}
      }
    }).catch(function(err) {});
  }

  function fetchCloudReports(callback) {
    if (!CLOUD_ENABLED) { callback([]); return; }
    var tid = _getTherapistId();
    if (!tid) { callback([]); return; }
    var dirUrl = GH_API + encodeURIComponent(tid);
    fetch(dirUrl, { headers: _ghHeaders() })
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        if (!Array.isArray(data)) { callback([]); return; }
        var files = data.filter(function(f) { return f.type === 'file' && f.name.endsWith('.json'); });
        if (files.length === 0) { callback([]); return; }
        var results = []; var loaded = 0;
        files.forEach(function(f) {
          fetch(f.url, { headers: _ghHeaders() })
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(fileData) {
              loaded++;
              if (fileData && fileData.content) {
                try {
                  var r = JSON.parse(decodeURIComponent(escape(atob(fileData.content))));
                  results.push({ id: 'cloud_' + (r.id || f.sha), date: r.date, time: r.time, patientInfo: r.patientInfo || {}, normalizedScores: r.normalizedScores || {}, rawScores: r.rawScores || {}, brainRegions: r.brainRegions || {}, riskIndex: r.riskIndex, overallScore: r.overallScore, isQuick6: !!r.isQuick6, _isCloud: true, _cloudId: f.sha, _cloudCreatedAt: new Date(r.createdAt || 0).getTime() });
                } catch(e2) {}
              }
              if (loaded >= files.length) {
                results.sort(function(a, b) { return (b._cloudCreatedAt || 0) - (a._cloudCreatedAt || 0); });
                callback(results);
              }
            }).catch(function() { loaded++; if (loaded >= files.length) callback(results); });
        });
      }).catch(function(err) { callback([]); });
  }

  function loadHistory() {
    try {
      var records = JSON.parse(localStorage.getItem('cog_records') || '[]');
      if (records.length === 0) return null;
      // Build history per module from all records
      var history = {};
      MODULES.forEach(function(m) { history[m.id] = []; });
      for (var i = records.length - 1; i >= 0; i--) {
        var rec = records[i];
        var recAge = rec.patientInfo && rec.patientInfo.age ? rec.patientInfo.age : null;
        MODULES.forEach(function(m) {
          if (rec.normalizedScores && rec.normalizedScores[m.id] != null) {
            history[m.id].push({date: rec.date, score: rec.normalizedScores[m.id], age: recAge});
          }
        });
      }
      return history;
    } catch(e) { return null; }
  }

  // ========== PUBLIC API ==========
  // ========== PUBLIC API ==========
  // 流程重构：测完先弹出登记表单 → 拿到姓名/年龄/性别再 saveRecord+render
  function _doRenderReport(rawLog, isQuick6) {
    var history = loadHistory();
    var record = saveRecord(rawLog, isQuick6);
    // 云端上传 — restful-api.dev (CORS-friendly)
    setTimeout(function() { uploadToCloud(record); }, 0);
    history = loadHistory();
    var reportTime = record && record.date && record.time ? (record.date + ' ' + record.time) : null;
    renderReport(rawLog, history, isQuick6, reportTime);
    window._quick6Mode = false;
    window._lastCogRecord = record;
    setTimeout(function() {
      _updateCogRecordNav(0);
      // 🔒 患者沙盒: 隐藏记录切换导航 + 替换关闭按钮文案
      if (window._patientSandbox) {
        try {
          var nav = document.getElementById('cog-report-nav');
          if (nav) {
            // 只留总览标签, 隐藏所有模块 tab (防止患者翻看其他模块详情)
            var tabs = nav.querySelectorAll('.cog-report-tab');
            tabs.forEach(function(t){
              var s = t.getAttribute('data-section');
              if (s && s !== 'overview') t.style.display = 'none';
            });
          }
          // 隐藏记录切换按钮 (prev/next)
          var navBtns = document.querySelectorAll('#cog-record-prev-btn, #cog-record-next-btn, .cog-record-nav-btn');
          navBtns.forEach(function(b){ b.style.display = 'none'; });
          // 替换关闭按钮文案为"完成测试"
          var closeBtn = document.querySelector('#cog-report-overlay [onclick*="_closeCogReport"], #cog-report-overlay button.cog-close-btn');
          if (closeBtn) { closeBtn.textContent = '完成测试'; }
          // 加显眼顶部标识, 让患者清楚"只能看自己"
          var topBanner = document.createElement('div');
          topBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:30010;background:linear-gradient(135deg,#00D9A5,#0086FF);color:#fff;text-align:center;padding:8px 12px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
          topBanner.textContent = '🔒 仅显示您的本次测试报告';
          document.body.appendChild(topBanner);
        } catch(e) { try { console.warn('[cog-flow v5] sandbox UI 调整失败', e); } catch(_){} }
      }
    }, 250);
  }

  // 弹出登记表单（姓名/年龄/性别），提交后回调
  function _showPatientRegForm(onSubmit) {
    var existing = document.getElementById('cog-reg-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'cog-reg-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;';
    overlay.setAttribute('data-cog-reg', 'v4');
    var card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:16px;padding:30px 28px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
    card.innerHTML =
      '<h3 style="color:#fff;text-align:center;margin:0 0 6px;font-size:20px;">📝 登记患者信息</h3>' +
      '<p style="color:#bdc3c7;text-align:center;font-size:12px;margin:0 0 22px;">测试已完成 · 填写信息后生成报告</p>' +
      '<div style="margin-bottom:14px;">' +
        '<label style="display:block;color:#bdc3c7;font-size:12px;margin-bottom:6px;">姓名 *</label>' +
        '<input id="cog-reg-name" type="text" placeholder="如：张三" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:8px;font-size:15px;box-sizing:border-box;outline:none;">' +
      '</div>' +
      '<div style="margin-bottom:14px;">' +
        '<label style="display:block;color:#bdc3c7;font-size:12px;margin-bottom:6px;">年龄</label>' +
        '<input id="cog-reg-age" type="number" min="3" max="120" placeholder="如：35" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:8px;font-size:15px;box-sizing:border-box;outline:none;">' +
      '</div>' +
      '<div style="margin-bottom:22px;">' +
        '<label style="display:block;color:#bdc3c7;font-size:12px;margin-bottom:6px;">性别</label>' +
        '<select id="cog-reg-gender" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:8px;font-size:15px;box-sizing:border-box;outline:none;">' +
          '<option value="" style="background:#1a1a2e;">请选择</option>' +
          '<option value="男" style="background:#1a1a2e;">男</option>' +
          '<option value="女" style="background:#1a1a2e;">女</option>' +
          '<option value="其他" style="background:#1a1a2e;">其他</option>' +
        '</select>' +
      '</div>' +
      '<button id="cog-reg-submit" style="display:block;width:100%;padding:14px;background:linear-gradient(135deg,#00D9A5,#0086FF);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:16px;font-weight:700;">生成报告</button>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(function(){ var n = document.getElementById('cog-reg-name'); if (n) n.focus(); }, 50);
    document.getElementById('cog-reg-submit').addEventListener('click', function() {
      var name = (document.getElementById('cog-reg-name').value || '').trim();
      if (!name) {
        var n2 = document.getElementById('cog-reg-name');
        n2.style.borderColor = '#ff6b6b';
        n2.focus();
        return;
      }
      var age = (document.getElementById('cog-reg-age').value || '').trim();
      var gender = document.getElementById('cog-reg-gender').value;
      window._cogPatientInfo = { name: name, age: age, gender: gender, id: '' };
      // 🔒 正向白名单: 表单提交后才置 true, 此后查看历史报告不会重弹
      window._cogPatientConfirmed = true;
      // 持久化确认态到 sessionStorage (本次会话有效)
      try { sessionStorage.setItem('cog_patient_confirmed', '1'); } catch(e) {}
      try { localStorage.setItem('cervical_current_client', JSON.stringify(window._cogPatientInfo)); } catch(e) {}
      try { window.D = window.D || {}; window.D.clientInfo = window._cogPatientInfo; } catch(e) {}
      var lbl = document.getElementById('current-patient');
      if (lbl) lbl.textContent = '👤 ' + name + (age ? ' ' + age + '岁' : '');
      overlay.remove();
      onSubmit();
    });
  }

  window._showCognitiveReport = function() {
    var rawLog = window._cogScoreLog || {};
    var hasAny = false;
    for (var k in rawLog) { hasAny = true; break; }
    if (!hasAny) { window.goHome(); return; }

    var isQuick6 = !!window._quick6Mode;

    // 🔒 正向白名单逻辑 (v4): 默认弹登记表单, 除非 _cogPatientConfirmed = true
    //   - 治疗师查看历史报告 (_viewCogReport 调用) 时设 _cogPatientConfirmed=true 跳过
    //   - 患者完成测试刚提交过表单 (_cogPatientConfirmed=true) 跳过
    //   - 其他任何路径都弹表单 (包括 bundle 异步偷塞患者名也拦不住)
    var confirmed = !!window._cogPatientConfirmed;
    if (!confirmed) {
      try { sessionStorage.getItem('cog_patient_confirmed'); } catch(e) {}
      try {
        if (sessionStorage.getItem('cog_patient_confirmed') === '1') confirmed = true;
      } catch(e) {}
    }
    if (!confirmed) {
      try { console.log('[cog-flow v5] 弹登记表单 (未确认)'); } catch(e){}
      _showPatientRegForm(function() { _doRenderReport(rawLog, isQuick6); });
      return;
    }
    try { console.log('[cog-flow v5] 跳过登记表单 (已确认)'); } catch(e){}

    _doRenderReport(rawLog, isQuick6);
  };

  window._demoCogReport = function() {
    // 演示数据：覆盖各分数档，验证报告格式
    var demoScores = {
      attention: 125, shortmem: 72, memory: 95, flex: 48,
      language: 138, reasoning: 110, planning: 85, scenerecall: 60,
      memorg: 105, inhibition: 32, visual: 142, observation: 88
    };
    var patientInfo = getPatientInfo(); if (!patientInfo.age) patientInfo = { name: '演示用户', age: '35', gender: '男' };
    // 从真实模块分计算脑区 (年龄校正, 全12模块)
    var demoRegions = computeBrainRegions(demoScores, patientInfo.age, false);
    var now = new Date();
    var dateStr = now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0');
    var totalAdj = 0;
    Object.keys(demoScores).forEach(function(k){ totalAdj += demoScores[k] * (patientInfo.age ? ageFactor(patientInfo.age, k) : 1.0); });
    var avgScore = Math.round(totalAdj / 12);
    var riskIndex = Math.round(100 - (avgScore / 150 * 100));
    var demoHistory = {};
    MODULES.forEach(function(m) {
      var base = demoScores[m.id];
      demoHistory[m.id] = [
        {date: '2024-07-04', score: Math.max(5, base - 15 + Math.round(Math.random()*10))},
        {date: '2025-08-03', score: Math.max(5, base - 8 + Math.round(Math.random()*10))},
        {date: dateStr, score: base}
      ];
    });

    // Build nav
    var nav = document.getElementById('cog-report-nav');
    var tabHtml = '<button class="cog-report-tab active" data-section="overview" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap;flex-shrink:0;">总览</button>';
    MODULES.forEach(function(m) {
      tabHtml += '<button class="cog-report-tab" data-section="mod-'+m.id+'" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;">'+m.icon+'</button>';
    });
    nav.innerHTML = tabHtml;

    var body = document.getElementById('cog-report-body');
    var html = '<div id="cog-section-overview">' + genOverviewHTML(demoScores, demoRegions, riskIndex, patientInfo, patientInfo.age) + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">';
    MODULES.forEach(function(m) {
      var raw = {correct: Math.round(demoScores[m.id]/150*20), trials: 20};
      html += '<div id="cog-section-mod-'+m.id+'">' + genModuleDetailHTML(m, demoScores[m.id], raw, demoHistory[m.id], patientInfo.age) + '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    setTimeout(function() {
      var radarCanvas = document.getElementById('cog-radar-canvas');
      if (radarCanvas) drawRadarChart(radarCanvas, demoScores, patientInfo.age);

      // 2D 脑区报告
      var brain2dCanvas = document.getElementById('cog-brain-2d');
      if (brain2dCanvas) _draw2DBrainReport(brain2dCanvas, demoRegions);

      // 3D 视图 (保留)
      initBrain3D(demoRegions);
      MODULES.forEach(function(m) {
        var tc = document.getElementById('cog-trend-'+m.id);
        if (tc) drawTrendChart(tc, demoHistory[m.id], m.id, patientInfo.age);
      });
    }, 100);

    // Tab handlers
    var tabs = nav.querySelectorAll('.cog-report-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) {
          t.classList.remove('active'); t.style.background = 'rgba(255,255,255,0.05)';
          t.style.borderColor = 'rgba(255,255,255,0.1)'; t.style.color = 'rgba(255,255,255,0.7)';
        });
        tab.classList.add('active');
        tab.style.background = 'rgba(255,255,255,0.15)';
        tab.style.borderColor = 'rgba(255,255,255,0.2)'; tab.style.color = '#fff';
        var s = document.getElementById('cog-section-' + tab.getAttribute('data-section'));
        if (s) s.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });

    document.getElementById('cog-report-overlay').style.display = 'block';
    document.getElementById('page2').style.display = 'none';
  };

  // PDF 导出: 临时还原三栏布局 (屏幕是 2-col+全宽下排)
  function _restructureModulesForPDF(sections) {
    sections.forEach(function(s) {
      var main = s.querySelector('.cog-mod-main');
      var analysis = s.querySelector('.cog-mod-analysis');
      if (!main || !analysis) return;
      main.style.gridTemplateColumns = '1fr 1fr 1.25fr';
      main.style.marginBottom = '12px';
      main.insertBefore(analysis, main.children[1]);
      analysis.style.display = 'flex';
      analysis.style.flexDirection = 'column';
      analysis.style.gap = '8px';
      s.setAttribute('data-cog-pdf-layout', '1');
    });
  }
  function _restructureModulesForScreen(sections) {
    sections.forEach(function(s) {
      var main = s.querySelector('.cog-mod-main');
      var analysis = s.querySelector('.cog-mod-analysis');
      if (!main || !analysis || !s.getAttribute('data-cog-pdf-layout')) return;
      main.appendChild(analysis);
      main.style.gridTemplateColumns = '1fr 1.25fr';
      main.style.marginBottom = '10px';
      analysis.style.display = '';
      analysis.style.gridTemplateColumns = '';
      analysis.style.gap = '';
      analysis.style.flexDirection = '';
      s.removeAttribute('data-cog-pdf-layout');
    });
  }

  window._exportCogPDF = async function() {
    var btn = document.querySelector('#cog-report-footer button[onclick*="_exportCogPDF"]');
    var origText = btn ? btn.textContent : '';
    var setBtn = function(text, disabled) {
      if (btn) { btn.disabled = disabled; btn.textContent = text; }
    };

    try {
      if (typeof html2canvas !== 'function') throw new Error('html2canvas 未加载,请检查网络');
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF 未加载,请检查网络');

      var body = document.getElementById('cog-report-body');
      if (!body) throw new Error('报告内容不存在');

      // 拆分: 总览(单独) + 模块(A4 横版每页 1 个, 满宽 281mm, 内容舒展)
      var overview = body.querySelector('#cog-section-overview');
      var moduleSections = body.querySelectorAll('[id^="cog-section-mod-"]');
      if (!overview && moduleSections.length === 0) throw new Error('报告无内容可导出');

      // 每页 1 模块 (A4 横版满宽), 12 模块 + 1 总览 = 13 页
      var GROUP_SIZE = 1;
      var groups = [];
      for (var gi = 0; gi < moduleSections.length; gi += GROUP_SIZE) {
        groups.push(Array.prototype.slice.call(moduleSections, gi, gi + GROUP_SIZE));
      }
      // 截图总数 = 1(总览) + groups.length
      var totalShots = (overview ? 1 : 0) + groups.length;
      setBtn('⏳ 准备中(0/' + totalShots + ')...', true);

      // 等待脑区图片真正绘制完成 (异步)
      var brain2d = body.querySelector('#cog-brain-2d');
      if (brain2d) {
        var ctx2d = brain2d.getContext('2d');
        var hasContent = false;
        try {
          var px = ctx2d.getImageData(brain2d.width/2, brain2d.height/2, 1, 1).data;
          hasContent = px[3] > 0;
        } catch(e) {}
        if (!hasContent) {
          setBtn('⏳ 等待脑图加载...', true);
          await new Promise(function(r) { setTimeout(r, 1500); });
        }
      }

      // 预加载所有图片
      var imgs = body.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(function(img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(function(resolve) {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve);
          setTimeout(resolve, 3000);
        });
      }));

      var pdf = new jspdf.jsPDF('l', 'mm', 'a4');  // A4 横版 (landscape)
      var pw = pdf.internal.pageSize.getWidth() - 16;
      var first = true;
      var captureErrors = [];
      var shotIdx = 0;
      var imageBottomByPage = {};  // pageNum → image bottom y (mm)

      // 复制 canvas 像素 (从 srcRoot 的 canvases 到 wrap 内的 canvases, 按出现顺序)
      function copyCanvases(srcRoot, wrap) {
        var srcs = srcRoot.querySelectorAll('canvas');
        var dsts = wrap.querySelectorAll('canvas');
        for (var ci = 0; ci < srcs.length && ci < dsts.length; ci++) {
          try {
            dsts[ci].width = srcs[ci].width;
            dsts[ci].height = srcs[ci].height;
            dsts[ci].getContext('2d').drawImage(srcs[ci], 0, 0);
          } catch(e) { captureErrors.push('canvas-copy ' + ci + ': ' + e.message); }
        }
      }

      // 从原 DOM 复制趋势图 canvas 像素到 gridWrap 内的副本 (按 id 匹配)
      // 原因: gridWrap.innerHTML 创建的是新 canvas 元素, 像素为空; 必须从原 DOM 复制
      function copyTrendCanvasesById(gridWrap, sourceModules) {
        var dstCanvases = gridWrap.querySelectorAll('canvas[id^="cog-trend-"]');
        dstCanvases.forEach(function(dst) {
          var id = dst.id;
          var src = null;
          sourceModules.forEach(function(m) {
            if (!src) {
              var c = m.querySelector('#' + id);
              if (c) src = c;
            }
          });
          if (src) {
            try {
              // 保持 dst 现有 attr (140 高), 缩放绘制
              dst.getContext('2d').drawImage(src, 0, 0, dst.width, dst.height);
            } catch(e) { captureErrors.push('trend-copy ' + id + ': ' + e.message); }
          }
        });
      }

      async function captureAndAddPage(srcRoot, label, wrapWidth) {
        shotIdx++;
        setBtn('⏳ 导出中(' + shotIdx + '/' + totalShots + ')...', true);

        // 离屏 wrap (留 16px 内边距, 780px 总宽 = 双栏刚好 2x(390-16)+gap)
        var wrap = document.createElement('div');
        wrapWidth = wrapWidth || 1080;
        wrap.style.cssText = 'position:absolute;left:0;top:0;width:' + wrapWidth + 'px;padding:16px;background:#fff;font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:13px;line-height:1.6;box-sizing:border-box;';
        wrap.innerHTML = srcRoot.outerHTML;
        document.body.appendChild(wrap);
        copyCanvases(srcRoot, wrap);
        wrap.style.left = '-9999px';

        try {
          var c = await html2canvas(wrap, {
            scale: 1.5,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: false,
            allowTaint: true,
            imageTimeout: 5000
          });
          if (c.width < 10 || c.height < 10) throw new Error('截图过小(' + c.width + 'x' + c.height + ')');

          var ph = (c.height * pw) / c.width;
          var img = c.toDataURL('image/jpeg', 0.88);
          if (!first) pdf.addPage();
          first = false;
          pdf.addImage(img, 'JPEG', 8, 8, pw, ph);
          imageBottomByPage[pdf.internal.getNumberOfPages()] = 8 + ph;
        } catch(e) {
          captureErrors.push(label + ': ' + e.message);
        } finally {
          if (document.body.contains(wrap)) document.body.removeChild(wrap);
        }
      }

      // 1) 总览独立截图 (左右布局: 风险评估 | 脑区+雷达)
      // Quick6 模式: 脑区图+雷达图垂直堆叠, 已通过缩小雷达 canvas 压到 ≤ 194mm
      if (overview) {
        await captureAndAddPage(overview, '总览');
      }

      // 2) 模块分组截图 — PDF 排版临时还原三栏, 捕获后恢复屏幕布局
      _restructureModulesForPDF(moduleSections);
      try {
        for (var ggi = 0; ggi < groups.length; ggi++) {
          var group = groups[ggi];
          // 构造栅格 wrapper (列数 = group.length, GROUP_SIZE=1 时 1 列, =2 时 2 列)
          var cols = group.length;
          var gridWrap = document.createElement('div');
          gridWrap.style.cssText = 'position:absolute;left:0;top:0;width:1080px;padding:16px;background:#fff;box-sizing:border-box;';
          gridWrap.innerHTML = '<div style="display:grid;grid-template-columns:repeat(' + cols + ', 1fr);gap:16px;">'
            + group.map(function(s) { return s.outerHTML; }).join('')
            + '</div>';
          document.body.appendChild(gridWrap);
          copyTrendCanvasesById(gridWrap, group);  // 从原 DOM 复制趋势图像素到副本 (按 id)
          gridWrap.style.left = '-9999px';

          shotIdx++;
          setBtn('⏳ 导出中(' + shotIdx + '/' + totalShots + ')...', true);
          try {
            var c2 = await html2canvas(gridWrap, {
              scale: 1.5,
              backgroundColor: '#ffffff',
              logging: false,
              useCORS: false,
              allowTaint: true,
              imageTimeout: 5000
            });
            if (c2.width < 10 || c2.height < 10) throw new Error('截图过小');
            var ph2 = (c2.height * pw) / c2.width;
            var img2 = c2.toDataURL('image/jpeg', 0.88);
            if (!first) pdf.addPage();
            first = false;
            pdf.addImage(img2, 'JPEG', 8, 8, pw, ph2);
            imageBottomByPage[pdf.internal.getNumberOfPages()] = 8 + ph2;
            // 溢出检测: 实际 ph2 超过 A4 内容区 (281mm) 时记录, 不中断流程
            if (ph2 > 194) captureErrors.push('模块组' + (ggi+1) + ': 高度 ' + ph2.toFixed(1) + 'mm 超 A4 横版 (建议降 GROUP_SIZE)');
          } catch(e) {
            captureErrors.push('模块组' + (ggi+1) + ': ' + e.message);
          } finally {
            if (document.body.contains(gridWrap)) document.body.removeChild(gridWrap);
          }
        }
      } finally {
        _restructureModulesForScreen(moduleSections);
      }

      if (first) throw new Error('所有截图均失败: ' + captureErrors.join('; '));

      // ===== 每页 footer =====
      // jsPDF 默认字体不支持中文, 改用纯英文/数字避免乱码
      var totalPages = pdf.internal.getNumberOfPages();
      var now = new Date();
      var tsStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
        + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      for (var fp = 1; fp <= totalPages; fp++) {
        pdf.setPage(fp);
        var pgH = pdf.internal.pageSize.getHeight();
        var pgW = pdf.internal.pageSize.getWidth();
        var imgBottom = (imageBottomByPage && imageBottomByPage[fp]) || (pgH - 16);
        // 顶部小标签 (英文, 避免 jsPDF 中文乱码)
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        pdf.text('Cognitive Assessment Report', 8, 4.5);
        pdf.text(tsStr, pgW - 8, 4.5, { align: 'right' });
        // footer 在 image bottom + 2mm 处
        var footerY = Math.min(imgBottom + 3, pgH - 8);
        if (footerY > imgBottom + 1 && footerY < pgH - 6) {
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.2);
          pdf.line(8, footerY - 1, pgW - 8, footerY - 1);
          pdf.setFontSize(8);
          pdf.setTextColor(110, 110, 110);
          pdf.text('Cervical Rehab Training System  |  For reference only', 8, footerY + 2);
          pdf.text('Page ' + fp + ' / ' + totalPages, pgW - 8, footerY + 2, { align: 'right' });
        }
      }

      var filename = 'Cognitive_Report_' + new Date().toISOString().slice(0,10) + '.pdf';

      // ===== 多重 Fallback 下载策略 (按序尝试, 一个成功就停) =====
      // 原因: 单条路径可能在某些浏览器/扩展/隐私模式下失败, 必须有兜底
      var downloadErrors = [];

      // 调试: 报告溢出信息
      if (captureErrors.length > 0) console.warn('[cog-pdf]', captureErrors.join(' | '));

      // 路径 1: blob + <a download> (Chrome/Edge/Firefox 主流, 最干净)
      try {
        var blob = pdf.output('blob');
        var blobUrl = URL.createObjectURL(blob);
        var a1 = document.createElement('a');
        a1.href = blobUrl;
        a1.download = filename;
        a1.style.display = 'none';
        a1.rel = 'noopener';
        document.body.appendChild(a1);
        a1.click();
        setTimeout(function() {
          if (document.body.contains(a1)) document.body.removeChild(a1);
          URL.revokeObjectURL(blobUrl);
        }, 2000);
        setBtn('✅ 已导出 (' + (blob.size/1024).toFixed(0) + ' KB)', true);
        setTimeout(function() { setBtn(origText, false); }, 3000);
        return;  // 成功
      } catch(e) {
        downloadErrors.push('blob: ' + e.message);
      }

      // 路径 2: dataURL + window.open (Safari/严格模式, 打开新标签让用户保存)
      try {
        var dataUrl = pdf.output('datauristring');
        var win = window.open(dataUrl, '_blank');
        if (win) {
          setBtn('✅ 已在新标签打开, 请右键另存为', true);
          setTimeout(function() { setBtn(origText, false); }, 4000);
          return;
        }
        downloadErrors.push('dataURL-open: window.open 被拦截');
      } catch(e) {
        downloadErrors.push('dataURL: ' + e.message);
      }

      // 路径 3: dataURL + 模态框显示, 用户可右键/长按保存 (终极兜底)
      try {
        var dataUrl2 = pdf.output('datauristring');
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;font-family:sans-serif;';
        modal.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:520px;width:100%;text-align:center;">'
          + '<h3 style="margin:0 0 8px;color:#333;">📄 PDF 已生成</h3>'
          + '<p style="margin:0 0 16px;color:#666;font-size:13px;">浏览器拦截了自动下载，请用以下方式保存：</p>'
          + '<p style="margin:0 0 16px;font-size:24px;font-weight:700;color:#dc2626;">' + filename + '</p>'
          + '<a id="cog-pdf-fallback-link" href="' + dataUrl2 + '" download="' + filename + '" '
          + 'style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;border-radius:8px;text-decoration:none;font-size:15px;margin-bottom:12px;">⬇️ 点击下载</a>'
          + '<br><button id="cog-pdf-fallback-close" style="padding:8px 20px;background:#eee;border:none;border-radius:6px;cursor:pointer;font-size:13px;">关闭</button>'
          + '</div>';
        document.body.appendChild(modal);
        document.getElementById('cog-pdf-fallback-close').onclick = function() { document.body.removeChild(modal); setBtn(origText, false); };
        setBtn('⚠️ 请点击弹窗中的下载按钮', true);
        return;
      } catch(e) {
        downloadErrors.push('modal: ' + e.message);
      }

      // 三条路径全失败
      throw new Error('所有下载方式均失败: ' + downloadErrors.join(' | '));
    } catch(e) {
      setBtn(origText, false);
      var msg = e && e.message ? e.message : String(e);
      alert('导出失败: ' + msg + '\n\n请尝试: 1) 允许浏览器下载 2) 关闭广告拦截插件 3) 用 Chrome/Firefox 最新版');
    }
  };

  window._closeCogReport = function() {
    document.getElementById('cog-report-overlay').style.display = 'none';
    if (window._patientSandbox) {
      // 🔒 患者沙盒: 关闭报告不返回首页, 显示"完成"提示
      try {
        var done = document.createElement('div');
        done.id = 'cog-test-done';
        done.style.cssText = 'position:fixed;inset:0;z-index:40000;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;text-align:center;padding:20px;';
        done.innerHTML =
          '<div style="font-size:72px;margin-bottom:20px;">✅</div>' +
          '<h2 style="font-size:24px;margin:0 0 12px;">测试已完成</h2>' +
          '<p style="color:#bdc3c7;font-size:14px;margin:0 0 30px;max-width:320px;">您的报告已生成 · 请将此页面展示给您的治疗师</p>' +
          '<p style="color:#888;font-size:12px;margin:0;">如需再次测试请联系治疗师重新扫码</p>';
        document.body.appendChild(done);
      } catch(e) {}
    } else {
      window.goHome();
    }
  };

  window._viewCogReport = function(recordIndex) {
    // 🔒 查看历史报告: 视为已确认患者信息, 跳过登记表单
    window._cogPatientConfirmed = true;
    try {
      var records = JSON.parse(localStorage.getItem('cog_records') || '[]');
      if (records.length === 0) {
        // 无记录时显示演示数据
        window._demoCogReport();
        return;
      }
      var idx = (recordIndex != null && records[recordIndex]) ? recordIndex : 0;
      var record = records[idx];
      var history = loadHistory();
      // 历史记录区分: 旧记录可能没有 isQuick6 字段, 默认为完整 12 项
      // 历史报告用 record 原始生成时间, 不重新生成
      var reportTime = record && record.date && record.time ? (record.date + ' ' + record.time) : null;
      window._lastCogRecord = record;
      renderReport(record.rawScores, history, !!record.isQuick6, reportTime, record.patientInfo);
      setTimeout(function() { _updateCogRecordNav(idx); }, 200);
    } catch(e) {}
  };

  // Canvas 点击放大查看 (12 模块报告脑区图/雷达图)
  window._openCanvasZoom = function(type) {
    var record = window._lastCogRecord;
    if (!record) return;
    var existing = document.getElementById('cog-zoom-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'cog-zoom-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:40001;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;background:#fff;border-radius:14px;padding:24px;box-shadow:0 8px 40px rgba(0,0,0,0.3);max-width:96vw;max-height:96vh;';

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:16px;background:none;border:none;font-size:28px;cursor:pointer;color:#999;z-index:1;line-height:1;';

    var bigCanvas = document.createElement('canvas');
    if (type === 'brain') {
      bigCanvas.width = 1100; bigCanvas.height = 340;
      bigCanvas.style.cssText = 'max-width:90vw;max-height:85vh;display:block;';
    } else {
      // W 需 > (H-56)/0.46 保证左右 hexagon 标签不重叠: 左标到 cxL+r+22, 右标从 cxR-r-22
      // 1300x600: r=250, 左标最右=351+272=623, 右标最左=949-272=677, 间距 54px ✓
      bigCanvas.width = 1300; bigCanvas.height = 600;
      bigCanvas.style.cssText = 'max-width:90vw;max-height:85vh;display:block;';
    }

    wrap.appendChild(closeBtn);
    wrap.appendChild(bigCanvas);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);

    closeBtn.onclick = function(e) { e.stopPropagation(); overlay.remove(); };
    overlay.onclick = function() { overlay.remove(); };
    wrap.onclick = function(e) { e.stopPropagation(); };

    // Re-draw at larger size
    if (type === 'brain') {
      _draw2DBrainReport(bigCanvas, record.brainRegions);
    } else {
      var zoomAge = record.patientInfo && record.patientInfo.age ? record.patientInfo.age : '';
      if (record.isQuick6) {
        drawSingleHexagonRadar(bigCanvas, record.normalizedScores, zoomAge);
      } else {
        drawRadarChart(bigCanvas, record.normalizedScores, zoomAge);
      }
    }
  };

  // HTML 区域点击放大 (多维风险评估 — CSS zoom 缩放, 影响布局不裁字)
  window._openHtmlZoom = function(srcEl) {
    var existing = document.getElementById('cog-zoom-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'cog-zoom-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:40001;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;background:#fff;border-radius:14px;padding:28px 32px;box-shadow:0 8px 40px rgba(0,0,0,0.3);max-width:95vw;max-height:95vh;overflow:auto;';

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:16px;background:none;border:none;font-size:28px;cursor:pointer;color:#999;z-index:1;line-height:1;';

    var clone = srcEl.cloneNode(true);
    clone.style.zoom = '1.55';
    wrap.appendChild(closeBtn);
    wrap.appendChild(clone);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);

    closeBtn.onclick = function(e) { e.stopPropagation(); overlay.remove(); };
    overlay.onclick = function() { overlay.remove(); };
    wrap.onclick = function(e) { e.stopPropagation(); };
  };

  // 记录切换导航 (footer 内的 prev/next)
  function _updateCogRecordNav(currentIndex) {
    var nav = document.getElementById('cog-record-nav');
    var prevBtn = document.getElementById('cog-rec-prev');
    var nextBtn = document.getElementById('cog-rec-next');
    var info = document.getElementById('cog-rec-info');
    if (!nav || !prevBtn || !nextBtn || !info) return;

    try {
      var records = JSON.parse(localStorage.getItem('cog_records') || '[]');
      if (records.length <= 1) {
        nav.style.display = 'none';
        return;
      }
      nav.style.display = 'flex';
      var total = records.length;
      info.textContent = '第 ' + (currentIndex + 1) + ' / ' + total + ' 次';

      prevBtn.disabled = (currentIndex >= total - 1);
      nextBtn.disabled = (currentIndex <= 0);

      // 绑事件 (去重: 用 once-like 替换)
      var newPrev = prevBtn.cloneNode(true);
      var newNext = nextBtn.cloneNode(true);
      prevBtn.parentNode.replaceChild(newPrev, prevBtn);
      nextBtn.parentNode.replaceChild(newNext, nextBtn);

      newPrev.addEventListener('click', function() {
        if (currentIndex < total - 1) {
          window._viewCogReport(currentIndex + 1);
        }
      });
      newNext.addEventListener('click', function() {
        if (currentIndex > 0) {
          window._viewCogReport(currentIndex - 1);
        }
      });
    } catch(e) {}
  }

  // 报告记录列表 (点击"认知报告"时先弹出选择窗口)
  window._showCogRecordList = function() {
    // 🔒 查看历史记录列表: 视为已确认, 打开记录时跳过登记表单
    window._cogPatientConfirmed = true;
    try {
      var records = JSON.parse(localStorage.getItem('cog_records') || '[]');
    } catch(e) { records = []; }
    var existing = document.getElementById('cog-record-list-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'cog-record-list-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:35000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:14px;padding:24px;box-shadow:0 8px 40px rgba(0,0,0,0.25);max-width:600px;width:90vw;max-height:80vh;display:flex;flex-direction:column;';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;';
    title.innerHTML = '<span>🧠 认知报告记录</span>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;font-size:22px;cursor:pointer;color:#999;';
    closeBtn.onclick = function() { overlay.remove(); };
    title.appendChild(closeBtn);
    panel.appendChild(title);

    // Tab bar: 本机 / 云端
    var tabRow = document.createElement('div');
    tabRow.style.cssText = 'display:flex;gap:0;margin-bottom:12px;border-radius:8px;overflow:hidden;border:1px solid #ddd;';
    var localTab = document.createElement('button');
    localTab.textContent = '📋 本机记录';
    var tabBtnStyle = 'flex:1;padding:8px 12px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.2s;';
    localTab.style.cssText = tabBtnStyle + 'background:#1a1a2e;color:#fff;';
    var cloudTab = document.createElement('button');
    cloudTab.textContent = '☁️ 云端记录';
    cloudTab.style.cssText = tabBtnStyle + 'background:#f5f5f5;color:#999;';
    tabRow.appendChild(localTab); tabRow.appendChild(cloudTab);
    panel.appendChild(tabRow);

    // Token input for cloud
    var tokenWrap = document.createElement('div');
    tokenWrap.style.cssText = 'display:none;padding:8px 12px;background:#fffbe6;border-radius:8px;margin-bottom:10px;font-size:12px;';
    tokenWrap.innerHTML = '<div style="color:#b8860b;margin-bottom:6px;">需要 GitHub Token 才能访问云端记录</div>'
      + '<div style="display:flex;gap:6px;"><input id="cog-gh-token-input" type="password" placeholder="ghp_..." style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;">'
      + '<button id="cog-gh-token-save" style="padding:6px 14px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">保存</button></div>'
      + '<div style="color:#999;margin-top:4px;font-size:11px;">创建 token: GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → 仅选此仓库 + Contents: Read and Write</div>';
    panel.appendChild(tokenWrap);

    var listWrap = document.createElement('div');
    listWrap.style.cssText = 'overflow-y:auto;flex:1;';

    // Token save button
    setTimeout(function() {
      var input = document.getElementById('cog-gh-token-input');
      var saveBtn = document.getElementById('cog-gh-token-save');
      if (input && saveBtn) {
        // Pre-fill if saved
        try { var saved = localStorage.getItem('cog_gh_token'); if (saved) input.value = saved; } catch(e) {}
        saveBtn.addEventListener('click', function() {
          var val = input.value.trim();
          if (val) { try { localStorage.setItem('cog_gh_token', val); } catch(e) {} tokenWrap.style.display = 'none'; currentView = null; cloudTab.click(); }
        });
      }
    }, 100);

    // Render helper: local records
    function _renderLocalRows(wrap, recs) {
      wrap.innerHTML = '';
      if (!recs || recs.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:40px 20px;color:#999;';
        empty.innerHTML = '<div style="font-size:48px;margin-bottom:12px;">📋</div><div style="font-size:15px;">暂无历史记录</div><div style="font-size:12px;margin-top:4px;color:#bbb;">完成认知测试后将自动保存</div>';
        wrap.appendChild(empty); return;
      }
      recs.forEach(function(rec, i) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #f0f0f0;border-radius:8px;margin-bottom:2px;transition:background 0.15s;';
        row.onmouseenter = function() { row.style.background = '#f6fbfc'; };
        row.onmouseleave = function() { row.style.background = ''; };

        var typeLabel = rec.isQuick6 ? '⚡6项' : '📊12项';
        var p = rec.patientInfo || {};
        var patientName = (p.name && p.name !== '未知') ? p.name : '';
        // 老记录兜底: 若 name 为空/未知, 尝试从当前 localStorage 或 DOM 读取
        if (!patientName) {
          try { var ci = JSON.parse(localStorage.getItem('cervical_current_client')||'{}'); if (ci.name) patientName = ci.name; } catch(e) {}
        }
        if (!patientName) {
          var el = document.getElementById('current-patient');
          if (el) { var t = el.textContent.trim().replace(/^👤\s*/,'').replace(/\s*#[^\s]+\s*$/,'').trim(); if (t && t!=='点击登录') patientName = t; }
        }
        if (!patientName) patientName = '未登录';
        var patientMeta = (p.gender || p.age) ? (' · ' + (p.gender||'') + ' ' + (p.age||'') + '岁') : '';
        var scoreStr = rec.overallScore != null ? rec.overallScore + '分' : '';

        row.innerHTML = '<div style="flex:1;min-width:0;cursor:pointer;">'
          + '<div style="font-size:14px;font-weight:600;color:#1a1a2e;margin-bottom:2px;">'+patientName+patientMeta+' · '+scoreStr+'</div>'
          + '<div style="font-size:11px;color:#999;">'+rec.date+' '+rec.time+' · '+typeLabel+'</div>'
          + '</div>'
          + '<button class="cog-rec-del" data-idx="'+i+'" title="删除此记录" style="flex-shrink:0;margin-left:8px;background:none;border:none;font-size:16px;cursor:pointer;color:#ccc;padding:4px 8px;border-radius:4px;transition:color 0.15s;" onmouseenter="this.style.color=\'#e74c3c\'" onmouseleave="this.style.color=\'#ccc\'">🗑️</button>';

        // 点击行主体 → 打开报告
        row.querySelector('[style*="cursor:pointer"]').addEventListener('click', function() {
          overlay.remove();
          window._viewCogReport(i);
        });
        // 删除按钮
        row.querySelector('.cog-rec-del').addEventListener('click', function(e) {
          e.stopPropagation();
          if (!confirm('确定删除 ' + patientName + ' 的这份报告吗？')) return;
          try {
            var recs = JSON.parse(localStorage.getItem('cog_records') || '[]');
            recs.splice(i, 1);
            localStorage.setItem('cog_records', JSON.stringify(recs));
          } catch(ex) {}
          row.remove();
          // 如果全删完了, 刷新列表
          var remaining = listWrap.querySelectorAll('[style*="cursor:pointer"]');
          if (remaining.length === 0) {
            listWrap.innerHTML = '';
            var empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;padding:40px 20px;color:#999;';
            empty.innerHTML = '<div style="font-size:48px;margin-bottom:12px;">📋</div><div style="font-size:15px;">暂无历史记录</div><div style="font-size:12px;margin-top:4px;color:#bbb;">完成认知测试后将自动保存</div>';
            listWrap.appendChild(empty);
          }
        });
        listWrap.appendChild(row);
      });
    }

    // Render cloud records
    function _renderCloudRows(wrap, cloudRecs) {
      wrap.innerHTML = '';
      if (!cloudRecs || cloudRecs.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:40px 20px;color:#999;';
        var tid = _getTherapistId() || _ensureTherapistId();
        empty.innerHTML = '<div style="font-size:48px;margin-bottom:12px;">☁️</div>'
          + '<div style="font-size:15px;color:#999;">云端暂无记录</div>'
          + '<div style="font-size:12px;margin-top:6px;color:#bbb;">完成认知测试后,患者报告会自动同步到云端</div>'
          + '<div style="font-size:11px;margin-top:12px;color:#aaa;">治疗师 ID: ' + tid + '</div>';
        wrap.appendChild(empty); return;
      }
      cloudRecs.forEach(function(rec, i) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #f0f0f0;border-radius:8px;margin-bottom:2px;transition:background 0.15s;';
        row.onmouseenter = function() { row.style.background = '#f6fbfc'; };
        row.onmouseleave = function() { row.style.background = ''; };
        var typeLabel = rec.isQuick6 ? '⚡6项' : '📊12项';
        var p = rec.patientInfo || {};
        var patientName = (p.name && p.name !== '未知') ? p.name : '未登录';
        var patientMeta = (p.gender || p.age) ? (' · ' + (p.gender||'') + ' ' + (p.age||'') + '岁') : '';
        var scoreStr = rec.overallScore != null ? rec.overallScore + '分' : '';
        row.innerHTML = '<div style="flex:1;min-width:0;cursor:pointer;">'
          + '<div style="font-size:14px;font-weight:600;color:#1a1a2e;margin-bottom:2px;">'+patientName+patientMeta+' · '+scoreStr+'</div>'
          + '<div style="font-size:11px;color:#999;">'+rec.date+' '+rec.time+' · '+typeLabel+' ☁️</div>'
          + '</div>';
        row.querySelector('[style*="cursor:pointer"]').addEventListener('click', function() {
          overlay.remove();
          // Render cloud report directly (data already in memory)
          var reportTime = rec.date && rec.time ? (rec.date + ' ' + rec.time) : null;
          renderReport(rec.rawScores, null, rec.isQuick6, reportTime, rec.patientInfo);
        });
        wrap.appendChild(row);
      });
    }

    // Initial render
    _renderLocalRows(listWrap, records);
    panel.appendChild(listWrap);

    // Tab switching
    var currentView = 'local';
    localTab.addEventListener('click', function() {
      if (currentView === 'local') return;
      currentView = 'local';
      localTab.style.background = '#1a1a2e'; localTab.style.color = '#fff';
      cloudTab.style.background = '#f5f5f5'; cloudTab.style.color = '#999';
      tokenWrap.style.display = 'none';
      _renderLocalRows(listWrap, records);
    });
    cloudTab.addEventListener('click', function() {
      if (currentView === 'cloud') return;
      var hasToken = false;
      try { hasToken = !!(localStorage.getItem('cog_gh_token')); } catch(e) {}
      if (!hasToken) { tokenWrap.style.display = 'block'; listWrap.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">请先设置 GitHub Token</div>'; return; }
      currentView = 'cloud';
      cloudTab.style.background = '#1a1a2e'; cloudTab.style.color = '#fff';
      localTab.style.background = '#f5f5f5'; localTab.style.color = '#999';
      tokenWrap.style.display = 'none';
      listWrap.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">⏳ 加载中...</div>';
      fetchCloudReports(function(cloudRecords) { _renderCloudRows(listWrap, cloudRecords); });
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  };

})();
