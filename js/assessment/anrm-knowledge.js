// ============================================================
// ANRM 知识规则引擎
// 基于 ANRM 肌骨神经康复体系（902/903/908/脑优化1-3）
// 将评估数据映射到神经功能推断和康复建议
// ============================================================

/**
 * ROM 评估规则 (902系列)
 * 来源: 902系列颈椎康复实操手册 第5部分
 */
export const ROM_RULES = {
  // 颈椎各方向正常活动范围参考（来自 ANRM 902 评估标准）
  normalRanges: {
    '前屈': 45,
    '后伸': 45,
    '左旋': 80,
    '右旋': 80,
    '左屈': 45,
    '右屈': 45
  },

  /**
   * 根据 ROM 结果返回 ANRM 评估解释
   */
  evaluate(romResults) {
    const findings = [];
    const romKeys = Object.keys(romResults);
    if (romKeys.length === 0) return findings;

    const totalROM = romKeys.reduce((s, k) => s + Math.abs(romResults[k] || 0), 0);
    const avgROM = totalROM / romKeys.length;
    const normalAvg = romKeys.reduce((s, k) => s + (this.normalRanges[k] || 45), 0) / romKeys.length;
    const ratio = avgROM / normalAvg;

    // 整体评估
    if (ratio < 0.5) {
      findings.push({
        category: 'ROM',
        severity: 'significant',
        finding: '颈椎活动范围明显受限（平均不足正常50%）',
        anrmRef: '902-5.2',
        implications: [
          '可能存在关节囊挛缩或肌肉严重紧张',
          '需优先评估是否伴随疼痛（疼痛会抑制活动度）',
          '深层屈肌/伸肌激活不足可能加重受限'
        ],
        recommendations: [
          '颈深屈肌训练（血压计法，20→30mmHg，维持10秒，每日7分钟）',
          '颈伸肌收下巴保持训练（俯卧位，维持2分钟）',
          '在无痛范围内进行被动关节松动'
        ]
      });
    } else if (ratio < 0.7) {
      findings.push({
        category: 'ROM',
        severity: 'moderate',
        finding: '颈椎活动范围中度受限（平均约正常60-70%）',
        anrmRef: '902-5.2',
        implications: [
          '肌肉紧张或关节僵硬为主要原因',
          '本体感觉反馈可能受损，大脑对活动范围的安全边界判断过于保守'
        ],
        recommendations: [
          '颈深屈肌训练（偷懒式，点头动作，保持7分钟）',
          '每日颈部全范围活动练习（无痛范围）',
          '配合眼球追踪训练改善本体感觉'
        ]
      });
    } else if (ratio < 0.85) {
      findings.push({
        category: 'ROM',
        severity: 'mild',
        finding: '颈椎活动范围轻度受限',
        anrmRef: '902-5.2',
        implications: ['功能性限制，可能与日常姿势习惯相关'],
        recommendations: ['保持全范围颈部活动', '注意工作姿势，避免长时间低头']
      });
    }

    // 旋转不对称检查 (左右旋差异 > 15°)
    const leftRot = Math.abs(romResults['左旋'] || 0);
    const rightRot = Math.abs(romResults['右旋'] || 0);
    if (Math.abs(leftRot - rightRot) > 15) {
      findings.push({
        category: 'ROM',
        severity: 'moderate',
        finding: `颈椎旋转不对称（左旋${leftRot.toFixed(0)}° vs 右旋${rightRot.toFixed(0)}°）`,
        anrmRef: '902-5.1',
        implications: [
          '单侧肌肉紧张或关节功能障碍',
          '可能与不对称的原始反射残留有关（不对称性颈反射 ATNR）'
        ],
        recommendations: [
          '重点训练旋转受限侧',
          '评估不对称性颈反射（ATNR），若阳性需进行原始反射整合训练'
        ]
      });
    }

    return findings;
  }
};

/**
 * 位置觉/JPS 评估规则 (902系列 + 脑优化2)
 * 来源: 902 第5部分 + 脑优化2脑功能评估
 */
export const POSITION_RULES = {
  // JPS 分类标准（基于 Revel 1991 + 颈椎本体感觉研究）
  classifyJPS(error) {
    if (error < 2) return { level: '优秀', zh: '优秀', color: '#22c55e', cls: 'normal' };
    if (error < 3) return { level: '良好', zh: '良好', color: '#84cc16', cls: 'normal' };
    if (error < 4.5) return { level: '正常', zh: '正常', color: '#06b6d4', cls: 'normal' };
    if (error < 6) return { level: '轻度障碍', zh: '轻度', color: '#eab308', cls: 'mild' };
    if (error < 9) return { level: '中度障碍', zh: '中度', color: '#f97316', cls: 'moderate' };
    return { level: '重度障碍', zh: '重度', color: '#ef4444', cls: 'severe' };
  },

  evaluate(positionResults) {
    const findings = [];
    if (!positionResults || positionResults.length === 0) return findings;

    const avgError = positionResults.reduce((s, r) => s + r.totalError, 0) / positionResults.length;
    const cls = this.classifyJPS(avgError);

    if (cls.cls === 'severe' || cls.cls === 'moderate') {
      findings.push({
        category: 'PositionSense',
        severity: cls.cls === 'severe' ? 'significant' : 'moderate',
        finding: `位置觉${cls.zh}障碍（平均误差 ${avgError.toFixed(1)}°）`,
        anrmRef: '902-5.1, 脑优化2-3',
        implications: [
          '颈深屈肌本体感受器受损 → 大脑无法准确感知头部位置',
          '头颈部意识评估异常：患者闭眼时无法准确判断头部位置',
          '高危：本体感觉受损者跌倒风险增加，运动控制代偿依赖视觉'
        ],
        brainRegions: [
          {
            region: '小脑蚓部（脊髓小脑）',
            likelihood: cls.cls === 'severe' ? '高' : '中',
            reason: '本体感觉信息经脊髓小脑束传入小脑蚓部，JPS误差大提示该通路功能障碍'
          },
          {
            region: '前庭小脑（绒球小结叶）',
            likelihood: '中',
            reason: '前庭小脑整合前庭与本体感觉信息，位置觉障碍常伴随前庭功能下降'
          }
        ],
        recommendations: [
          '本体感觉训练：闭眼头部定位练习（目标20°，睁眼校准，重复至准确）',
          '头颈部意识训练：先睁眼感受目标位置 → 闭眼重复 → 睁眼验证误差',
          '颈部肌肉耐力训练（颈深屈肌血压计法 20→30mmHg × 10秒 × 7分钟）',
          '必须每天坚持 7 分钟以上（神经可塑性最低时间要求）'
        ]
      });
    } else if (cls.cls === 'mild') {
      findings.push({
        category: 'PositionSense',
        severity: 'mild',
        finding: `位置觉${cls.zh}障碍（平均误差 ${avgError.toFixed(1)}°）`,
        anrmRef: '902-5.1',
        implications: ['轻微的本体感觉下降，可通过训练改善'],
        recommendations: ['闭眼头部定位练习，每周3-4次']
      });
    }

    return findings;
  }
};

/**
 * 协调性与运动控制评估规则 (908系列 + 902 第5部分)
 * 来源: 908系列运动控制完整操作手册
 */
export const COORDINATION_RULES = {
  evaluate(coordScores, coordFullScores) {
    const findings = [];
    const scores = coordScores;
    if (!scores || !scores.tracking || scores.tracking.length === 0) return findings;

    // detection.js 产出 0-100 值，归一化到 0-1
    const avgTracking = scores.tracking.reduce((a, b) => a + b, 0) / scores.tracking.length / 100;
    const avgTrajectory = scores.trajectory.reduce((a, b) => a + b, 0) / scores.trajectory.length / 100;
    const avgSmoothness = scores.smoothness.reduce((a, b) => a + b, 0) / scores.smoothness.length / 100;

    // 运动质量分类 (908-6.3, 902-5.2 颈部活动控制评估)
    let mq;
    if (avgSmoothness > 0.8) {
      mq = {
        class: '流畅型 (Smooth)',
        interpretation: '小脑-脊髓通路完整，运动连续平滑',
        severity: 'normal',
        brainRegion: '正常',
        anrmRef: '908-6.3'
      };
    } else if (avgSmoothness > 0.5) {
      mq = {
        class: '共济失调型 (Ataxic)',
        interpretation: '运动中有震颤/抖动，颈部活动控制异常（1卡1卡），提示小脑/前庭小脑功能障碍',
        severity: 'moderate',
        brainRegion: '小脑半球 + 前庭小脑',
        anrmRef: '902-5.2, 908-6.3',
        implications: [
          '颈部运动控制受损：闭眼转头时出现卡顿、跳动',
          '小脑蚓部-脊髓通路可能受累',
          '需检查扫视功能和VOR（前庭眼反射）'
        ],
        recommendations: [
          '脊髓小脑训练：颈伸肌收下巴保持（俯卧位，2分钟维持）',
          '眼球扫视训练：小幅快速交替注视，抑制头部代偿',
          '协调性训练：慢速头部追踪移动目标，逐步加速'
        ]
      };
    } else if (avgSmoothness > 0.3) {
      mq = {
        class: '运动减少型 (Hypometric)',
        interpretation: '阶梯状运动，ROM受限，可能额叶/基底节受累',
        severity: 'moderate',
        brainRegion: '基底节 + 额叶运动区',
        anrmRef: '908-6.4',
        implications: [
          '基底节功能障碍可能导致运动启动困难',
          'ROM 受限可能是神经性的而非结构性'
        ],
        recommendations: [
          '扫描训练：眼球扫视 + 头部跟随，改善运动启动',
          '大振幅头部运动训练（打破运动减少模式）',
          '检查原始反射（尤其是对称性颈反射 STNR）'
        ]
      };
    } else {
      mq = {
        class: '代偿型 (Compensatory)',
        interpretation: '浅层肌肉（SCM/斜方肌）主导，深层失能，心率易≥+10bpm',
        severity: 'significant',
        brainRegion: '深层肌肉本体感觉通路受损',
        anrmRef: '902-16.3, 908-6.5',
        implications: [
          '训练时心率增加超过10bpm表示过度使用了表层肌肉',
          '颈深屈肌/伸肌未能正确激活',
          '血氧仪监测：基础心率 vs 训练心率的变化是判断训练质量的硬指标'
        ],
        recommendations: [
          '颈深屈肌训练从最低强度开始（血压计 20→21mmHg）',
          '配血氧仪监测心率，确保心率不增加超过10bpm',
          '注意排除胸锁乳突肌代偿（表面张力检查法）',
          '训练时必须先骨盆后倾、腰贴地，切断腰部代偿'
        ]
      };
    }

    findings.push({
      category: 'MotorControl',
      severity: mq.severity,
      finding: `运动质量分类：${mq.class}`,
      anrmRef: mq.anrmRef,
      metrics: {
        tracking: (avgTracking * 100).toFixed(0) + '%',
        trajectory: (avgTrajectory * 100).toFixed(0) + '%',
        smoothness: (avgSmoothness * 100).toFixed(0) + '%'
      },
      interpretation: mq.interpretation,
      brainRegion: mq.brainRegion,
      implications: mq.implications || [],
      recommendations: mq.recommendations || []
    });

    // 协调性综合判断
    if (avgTracking < 0.6) {
      findings.push({
        category: 'Coordination',
        severity: 'moderate',
        finding: '头部追踪能力下降（跟踪精度 < 60%）',
        anrmRef: '902-19, 908-3.2',
        implications: ['视觉-运动整合能力下降', '可能影响阅读、驾驶等日常活动'],
        recommendations: ['眼球追踪训练：跟随移动目标，保持头部稳定', '每训练周期7分钟']
      });
    }

    return { findings, mq };
  }
};

/**
 * 平衡/前庭关联评估
 * 基于 ANRM 902 第5部分：颈椎本体感觉是维持平衡的三个输入之一（视觉/前庭/本体）
 * 注：本模块只反映颈椎侧评估结果对平衡系统的参考意义，
 * CTSIB 分级需通过实际站立测试（硬地/软垫 + 睁眼/闭眼）获得，不能从颈椎数据推断
 */
export const BALANCE_RULES = {
  evaluate(romScore, posScore, coordScore, stabilityScore) {

    // 本体感觉是平衡三要素之一（视觉+前庭+本体），
    // 颈椎位置觉下降会直接影响身体空间定位能力
    if (posScore < 40) {
      return [{
        category: 'Balance',
        severity: 'significant',
        finding: '颈椎位置觉明显障碍 → 平衡系统的本体感觉输入严重不足',
        anrmRef: '902-5.5',
        implications: [
          '颈椎本体感受器密集（每克肌肉含纺锤体密度仅次于眼外肌），位置觉下降将直接影响站立平衡',
          'ANRM 902：下盘不稳时头会下意识稳定视野，导致斜角肌持续紧张无法放松',
          '如果颈椎-平衡联动不改善，颈椎问题将反复发作'
        ],
        recommendations: [
          '建议进行 CTSIB 实际平衡测试，确定具体受损阶段',
          '本体感觉训练：闭眼头部定位 + 单腿站立（整合视觉-本体-前庭）',
          '每次训练持续 7 分钟以上（ANRM 神经可塑性最低时间要求）'
        ]
      }];
    } else if (posScore < 55) {
      return [{
        category: 'Balance',
        severity: 'mild',
        finding: '颈椎位置觉轻度下降 → 平衡系统的本体感觉输入有所减弱',
        anrmRef: '902-5.5',
        implications: [
          '本体感觉轻度不足，站立平衡可能尚未受明显影响',
          '但闭眼时（视觉输入移除）可能暴露出潜在的不稳定'
        ],
        recommendations: [
          '建议进行 CTSIB 平衡测试获取基线数据',
          '闭眼站立训练（硬地 → 软垫逐步进阶）'
        ]
      }];
    }

    return [];
  }
};

/**
 * 脑功能推断引擎 (脑优化1-3 + 908)
 * 根据多项检测结果的组合，推断可能受累的脑区
 */
export const BRAIN_INFERENCE = {
  /**
   * 综合推断脑功能
   */
  infer(romFindings, positionFindings, coordinationFindings, mq) {
    const regions = [];

    // 小脑蚓部（脊髓小脑）
    const smoothnessLow = (mq ? mq.class.includes('Ataxic') || mq.class.includes('Compensatory') : false);
    const jpsHigh = positionFindings.some(f => f.severity === 'significant' || f.severity === 'moderate');

    if (smoothnessLow && jpsHigh) {
      regions.push({
        region: '小脑蚓部（脊髓小脑 Spinocerebellum）',
        likelihood: '高',
        evidence: '运动平稳度下降 + 位置觉明显障碍，符合脊髓小脑通路功能障碍特征。' +
          '脊髓小脑接收来自肌肉纺锤和高尔基腱器的本体感觉传入，受损时表现为共济失调和位置觉障碍。',
        anrmRef: '902-17, 908-6.3',
        recommendations: [
          '脊髓小脑训练：颈伸肌收下巴保持（俯卧位2分钟维持）',
          '躯干共济失调筛查（"Fat Guy Eats Donuts" 小脑核序列）',
          '中线稳定性训练：单腿站立 + 眼球追踪'
        ]
      });
    }

    // 前庭小脑（绒球小结叶）
    if (jpsHigh && (positionFindings.some(f => f.severity === 'significant'))) {
      regions.push({
        region: '前庭小脑（绒球小结叶 Flocculonodular Lobe）',
        likelihood: '中',
        evidence: '位置觉重度障碍 + 本体感觉-前庭整合异常。前庭小脑负责整合前庭与本体感觉信息，维持平衡和凝视稳定。',
        anrmRef: '902-5.5, 脑优化1-4',
        recommendations: [
          '前庭眼反射（VOR）训练：固定视线目标，左右转头保持视线稳定',
          '前庭适应训练：坐位/站立位下的头部运动 + 视觉固定',
          '平衡训练 CTSIB 所有 4 阶段'
        ]
      });
    }

    // 基底节
    const trackingLow = coordinationFindings.some(f =>
      f.category === 'Coordination' && f.finding.includes('追踪能力下降'));
    if (mq && (mq.class.includes('Hypometric') || (trackingLow && !smoothnessLow))) {
      regions.push({
        region: '基底节（Basal Ganglia）',
        likelihood: '中',
        evidence: '运动减少/运动启动困难 + 协调性下降。基底节负责运动的选择、启动和幅度调节。',
        anrmRef: '908-6.4, 脑优化2',
        recommendations: [
          '大振幅眼球扫视训练（打破运动减少模式）',
          '有节奏的快速交替运动训练',
          '考虑评估原始反射（对称性颈反射 STNR）'
        ]
      });
    }

    // 前额叶/运动皮层
    if (mq && mq.class.includes('Compensatory')) {
      regions.push({
        region: '前运动皮层/辅助运动区（Premotor/SMA）',
        likelihood: '低',
        evidence: '代偿性运动模式 + 深层肌群激活失败，提示运动计划可能异常。',
        anrmRef: '908-2.3',
        recommendations: ['运动想象训练 + 镜像疗法', '渐进式精细运动控制训练']
      });
    }

    // 如果没有明确的脑区推断
    if (regions.length === 0 && mq) {
      regions.push({
        region: '颈部本体感觉系统（非脑区特异性）',
        likelihood: '中',
        evidence: '运动控制轻度异常，目前无足够证据指向特定脑区功能障碍。优先改善颈部本体感觉后重新评估。',
        anrmRef: '902-3, 902-5.1',
        recommendations: ['颈部本体感觉训练（闭眼头部定位）', '颈深屈肌激活训练（血压计法）']
      });
    }

    return regions;
  }
};

/**
 * 康复建议生成引擎 (902 + 903 + 908)
 */
export const REHAB_GENERATOR = {
  /**
   * 综合所有评估结果生成个性化康复方案
   */
  generate(allFindings, clientInfo) {
    const recommendations = [];
    const seen = new Set();

    // 从所有 findings 中收集建议并去重
    for (const finding of allFindings) {
      if (finding.recommendations) {
        for (const rec of finding.recommendations) {
          if (!seen.has(rec)) {
            seen.add(rec);
            recommendations.push(rec);
          }
        }
      }
    }

    // ANRM 902 核心康复原则
    const principles = [
      '所有训练需持续7分钟以上（神经可塑性最低时间要求）',
      '训练前必须确保"切断代偿"：骨盆后倾、腰贴地、肩胛放松',
      '用心率监测判断训练质量（基础心率 vs 训练心率，升高 >10bpm = 过度代偿）',
      '整合 3 大本体感受系统：视觉 + 前庭 + 肌肉本体感觉'
    ];

    return {
      anrmPrinciples: principles,
      specificRecommendations: recommendations,
      trainingOrder: [
        '第1步：深层肌肉激活（颈深屈肌/伸肌）→ 每次7分钟',
        '第2步：眼球运动训练（扫视/追踪/VOR）→ 每次7分钟',
        '第3步：平衡训练（CTSIB进阶）→ 每次7分钟',
        '第4步：功能整合（头部运动 + 眼球运动 + 平衡）→ 综合练习'
      ]
    };
  }
};

/**
 * 生成综合评分
 * 采用临床分级制而非线性映射，避免分数虚高
 * 各维度满分 100，但只有达到临床正常标准才能进入 80+ 区间
 */
export function calculateScores(romResults, positionResults, coordScores) {
  const scores = {};

  // ROM 评分 —— 使用平方根曲线加大中低区间的区分度
  // 线性评分问题：50% ROM → 50分，但临床上已属"明显受限"，不应及格
  // 修正：ratio^0.6 使 50% ROM → 66分，70% ROM → 81分，85% ROM → 91分
  if (romResults && Object.keys(romResults).length > 0) {
    const romKeys = Object.keys(romResults);
    const ratios = romKeys.map(k => {
      const actual = Math.abs(romResults[k] || 0);
      const normal = ROM_RULES.normalRanges[k] || 45;
      return Math.min(1, actual / normal);
    });
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    scores.rom = Math.round(Math.pow(avgRatio, 0.6) * 100);
    // 旋转不对称额外扣分
    const leftRot = Math.abs(romResults['左旋'] || 0);
    const rightRot = Math.abs(romResults['右旋'] || 0);
    if (leftRot > 0 && rightRot > 0) {
      const asym = Math.abs(leftRot - rightRot) / Math.max(leftRot, rightRot);
      scores.rom = Math.round(scores.rom * (1 - asym * 0.15));
    }
  }

  // 位置觉评分 —— 基于 JPS 临床分级 (Revel 1991 + ANRM 902)
  // <2° 优秀, 2-3° 良好, 3-4.5° 正常, 4.5-6° 轻度, 6-9° 中度, >9° 重度
  if (positionResults && positionResults.length > 0) {
    const avgError = positionResults.reduce((s, r) => s + r.totalError, 0) / positionResults.length;
    if (avgError < 2)      scores.position = 90 + Math.round((2 - avgError) / 2 * 10);       // 90-100
    else if (avgError < 3) scores.position = 75 + Math.round((3 - avgError) / 1 * 15);       // 75-90
    else if (avgError < 4.5) scores.position = 60 + Math.round((4.5 - avgError) / 1.5 * 15); // 60-75
    else if (avgError < 6) scores.position = 40 + Math.round((6 - avgError) / 1.5 * 20);     // 40-60
    else if (avgError < 9) scores.position = 20 + Math.round((9 - avgError) / 3 * 20);       // 20-40
    else                   scores.position = Math.max(5, Math.round(20 - (avgError - 9) * 2)); // 5-20
  }

  // 协调性评分 —— 跟踪能力（ANRM 902-5.2 颈部活动控制评估）
  // 注：detection.js 产出的是 0-100 分数，需先归一化到 0-1
  if (coordScores && coordScores.tracking && coordScores.tracking.length > 0) {
    const avgTracking = coordScores.tracking.reduce((a, b) => a + b, 0) / coordScores.tracking.length / 100;
    // 跟踪精度分级（0-1比例）：>0.85 优秀, 0.65-0.85 良好, 0.45-0.65 一般, <0.45 差
    if (avgTracking > 0.85)        scores.coordination = 85 + Math.round((avgTracking - 0.85) / 0.15 * 15);
    else if (avgTracking > 0.65)   scores.coordination = 65 + Math.round((avgTracking - 0.65) / 0.2 * 20);
    else if (avgTracking > 0.45)   scores.coordination = 40 + Math.round((avgTracking - 0.45) / 0.2 * 25);
    else                           scores.coordination = Math.max(5, Math.round(avgTracking / 0.45 * 40));
  }

  // 稳定性评分 —— 运动轨迹+平稳度（ANRM 908 运动质量 + 902-5.2）
  if (coordScores && coordScores.smoothness && coordScores.smoothness.length > 0) {
    const avgTrajectory = coordScores.trajectory.reduce((a, b) => a + b, 0) / coordScores.trajectory.length / 100;
    const avgSmoothness = coordScores.smoothness.reduce((a, b) => a + b, 0) / coordScores.smoothness.length / 100;
    const stab = avgTrajectory * 0.55 + avgSmoothness * 0.45;
    // 运动质量分级（0-1比例）：>0.85 流畅, 0.6-0.85 一般, 0.4-0.6 共济失调, <0.4 严重障碍
    if (avgSmoothness > 0.85)       scores.stability = 80 + Math.round((stab - 0.85) / 0.15 * 20);
    else if (avgSmoothness > 0.6)   scores.stability = 55 + Math.round((stab - 0.6) / 0.25 * 25);
    else if (avgSmoothness > 0.4)   scores.stability = 30 + Math.round((stab - 0.4) / 0.2 * 25);
    else                            scores.stability = Math.max(5, Math.round(stab / 0.4 * 30));
  }

  return scores;
}
