(function (global) {
  'use strict';

  var VERSION = 'course-neuro-v1';
  var PENDING_REFERENCE = '该速度课程参考待补充';
  var STATUS_LABELS = {
    within: '在课程参考内',
    below: '低于课程参考',
    above: '高于课程参考',
    pending: '参考待补充',
    unrecorded: '未设置速度参考',
    missing: '缺少有效数据'
  };
  var DEFINITIONS = [
    {
      key: 'shoulderFlexion', label: '最大肩屈',
      reference: { min: 7, max: 10, text: '7–10°' },
      mechanism: '可从对侧感觉运动网络参与的动作幅度调节，以及手臂—躯干—下肢协同角度观察前摆。',
      factors: '结合肩关节活动度、摆臂习惯、是否扶物及关键点质量。'
    },
    {
      key: 'shoulderExtension', label: '最大肩伸',
      reference: { min: 18, max: 24, text: '18–24°' },
      mechanism: '小脑参与运动幅度校准、感觉反馈与协调，可结合同侧上肢后摆、躯干旋转和周期稳定性观察。',
      factors: '结合摆臂时序、躯干旋转和不同周期之间的差异。'
    },
    {
      key: 'elbowFlexion', label: '最大肘屈',
      reference: { max: 20, text: '20°为课程观察点' },
      mechanism: '较大的屈曲姿态可作为上肢保护性姿势或稳定性补偿的线索，并从小脑—躯干—上肢协调角度继续观察。',
      factors: '结合自然摆臂、疼痛、上肢肌张力和是否持物；不能仅凭该角度判断小脑功能。'
    },
    {
      key: 'hipFlexion', label: '最大髋屈',
      reference: { min: 20, text: '约20°' },
      mechanism: '可从对侧支撑稳定、动作选择及上下肢协同角度观察摆动腿前进和步幅准备。',
      factors: '结合步幅、骨盆姿势、髋活动度、疼痛和支撑稳定性。'
    },
    {
      key: 'hipExtension', label: '最大髋伸',
      reference: { min: 20, text: '约20°' },
      mechanism: '髋伸涉及支撑后期身体越过支撑足，可从姿势控制、预期性调整及下肢推进的协同角度观察。',
      factors: '结合髋活动度、骨盆姿势、踝跖屈推进和肌力检查，不能仅由角度确定臀肌力量。'
    },
    {
      key: 'icKneeExtension', label: 'IC膝伸位',
      reference: { target: 180, text: '约180°（当前程序伸膝为0°）' },
      mechanism: '触地时的膝位影响负荷承接与后续稳定，可从预期性姿势调整及对侧支撑角度观察。',
      factors: '结合膝活动度、疼痛、股四头肌肌力及触地策略；肌力需另行评估。'
    },
    {
      key: 'lrKneeFlexion', label: 'LR最大膝屈',
      reference: { min: 10, max: 20, text: '10–20°' },
      mechanism: '屈膝缓冲与预期性姿势调整、动作幅度调节和本体感觉反馈有关；基底节参与自动化运动控制，可作为理论延伸。',
      factors: '取整个LR连续区间的峰值，结合落地方式、躯干起伏、支撑时间及左右差异。'
    },
    {
      key: 'icAnkle', label: 'IC踝角',
      reference: { min: 0, text: '0°为中立位；背屈10°为课程观察目标' },
      mechanism: '触地前的足部定位可从胫骨前肌控制、足部感觉反馈和放足过程的协调角度观察。',
      factors: '结合踝活动度、小腿后侧张力、鞋和足尖标记位置；背屈10°不是所有人的统一目标。'
    }
  ];
  var NETWORKS = [
    { label: '皮层', text: '动作选择、意识性调整与上下肢协同' },
    { label: '小脑', text: '感觉校准、动作幅度与时序协调' },
    { label: '基底节', text: '动作自动化、幅度调节与启动—停止切换' },
    { label: '脑干与前庭', text: '姿势张力、平衡与多感觉整合' },
    { label: '脊髓与上下肢协同', text: '节律、对侧配合及摆臂—躯干—下肢联系' }
  ];
  var REFERENCES = [
    {
      label: 'Fukuchi等（2019）：步速对步态生物力学的影响',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6595586/'
    },
    {
      label: 'Murray等（1967）：步行时上肢矢状面运动',
      url: 'https://pubmed.ncbi.nlm.nih.gov/6040248/'
    },
    {
      label: 'Meyns等（2013）：摆臂的机制与功能',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23489950/'
    },
    {
      label: 'Takakusaki（2017）：姿势与步态的功能神经解剖',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28122432/'
    }
  ];

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function protocolOf(report) {
    var source = report && report.protocol && typeof report.protocol === 'object' ? report.protocol : {};
    var speed = source.speedKmh == null || source.speedKmh === '' ? null : Number(source.speedKmh);
    if (!finite(speed) || speed <= 0 || speed > 30) speed = null;
    var mode = speed == null ? 'unrecorded' : source.mode === 'treadmill' ? 'treadmill' : 'other';
    return {
      mode: mode,
      speedKmh: speed,
      label: speed == null ? '未记录测试速度' : (mode === 'treadmill' ? '跑步机 · ' : '') + speed + ' km/h'
    };
  }

  function phaseMean(view, phase, angle) {
    var entry = view.phaseTable && view.phaseTable[phase] && view.phaseTable[phase][angle];
    return entry && finite(entry.mean) ? entry.mean : null;
  }

  function loadingResponsePeak(view) {
    var peak = null;
    (Array.isArray(view.cycles) ? view.cycles : []).forEach(function (cycle) {
      (Array.isArray(cycle.series) ? cycle.series : []).forEach(function (frame) {
        var value = frame.angles && frame.angles.knee;
        if (frame.phase === 'LR' && finite(value) && (peak == null || value > peak)) peak = value;
      });
    });
    return peak;
  }

  function valuesFor(view) {
    var summary = view.summary && typeof view.summary === 'object' ? view.summary : {};
    var shoulder = summary.shoulder || {};
    var elbow = summary.elbow || {};
    var hip = summary.hip || {};
    var icKnee = phaseMean(view, 'IC', 'knee');
    return {
      shoulderFlexion: finite(shoulder.maxFlexion) ? Math.max(0, shoulder.maxFlexion) : null,
      shoulderExtension: finite(shoulder.maxExtension) ? Math.max(0, -shoulder.maxExtension) : null,
      elbowFlexion: finite(elbow.maxFlexion) ? Math.max(0, elbow.maxFlexion) : null,
      hipFlexion: finite(hip.maxFlexion) ? Math.max(0, hip.maxFlexion) : null,
      hipExtension: finite(hip.maxExtension) ? Math.max(0, -hip.maxExtension) : null,
      icKneeExtension: finite(icKnee) ? 180 - icKnee : null,
      lrKneeFlexion: loadingResponsePeak(view),
      icAnkle: phaseMean(view, 'IC', 'ankle')
    };
  }

  function compare(value, reference) {
    if (value < reference.min) return 'below';
    if (value > reference.max) return 'above';
    if (finite(reference.target)) {
      if (value < reference.target) return 'below';
      if (value > reference.target) return 'above';
    }
    return 'within';
  }

  function buildSide(view, side, referenceStatus) {
    var values = valuesFor(view);
    var observations = DEFINITIONS.map(function (definition) {
      var value = values[definition.key];
      var status = !finite(value) ? 'missing' : referenceStatus === 'course-provided'
        ? compare(value, definition.reference) : referenceStatus;
      return {
        key: definition.key,
        label: definition.label,
        value: value,
        displayValue: finite(value) ? value.toFixed(1) + '°' : '—',
        referenceText: referenceStatus === 'course-provided' ? definition.reference.text : PENDING_REFERENCE,
        status: status,
        statusLabel: STATUS_LABELS[status],
        mechanism: definition.mechanism,
        factors: definition.factors
      };
    });
    var notes = [];
    var shoulder = view.summary && view.summary.shoulder || {};
    if (finite(shoulder.maxFlexion) && finite(shoulder.maxExtension) &&
        shoulder.maxFlexion > 30 && -shoulder.maxExtension > 30) {
      notes.push('本侧肩屈、肩伸均大于30°，可观察是否为主动用力或通过增大上肢与躯干运动维持动态稳定，并结合小脑参与的感觉校准与姿势补偿分析。');
    }
    if (values.lrKneeFlexion == null) notes.push('LR连续区间没有有效膝角，未计算承重缓冲峰值。');
    return { side: side, observations: observations, notes: notes };
  }

  function buildNeuroInterpretation(report) {
    var protocol = protocolOf(report);
    var referenceStatus = protocol.speedKmh === 5 ? 'course-provided' : protocol.speedKmh == null ? 'unrecorded' : 'pending';
    var result = {
      version: VERSION,
      protocol: protocol,
      referenceStatus: referenceStatus,
      source: {
        type: 'user-course-reference',
        status: 'pending-verification',
        label: '用户提供课程参考，适用人群与测量定义待核验'
      },
      explanation: '以下为运动调控机制的参考解释，不是对脑区功能或神经疾病的测量结论。',
      sides: {
        left: buildSide(report && report.views && report.views.left || {}, 'left', referenceStatus),
        right: buildSide(report && report.views && report.views.right || {}, 'right', referenceStatus)
      },
      networks: NETWORKS.map(function (item) { return { label: item.label, text: item.text }; }),
      references: REFERENCES.map(function (item) { return { label: item.label, url: item.url }; })
    };
    return result;
  }

  global.__gaitNeuro = {
    buildNeuroInterpretation: buildNeuroInterpretation
  };
})(typeof window !== 'undefined' ? window : globalThis);
