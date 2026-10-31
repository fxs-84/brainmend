(function () {
  'use strict';

  var K = window.__gaitKinematics;
  var PHASE = { UPLOAD: 'upload', REVIEW: 'review', REPORT: 'report' };
  var PHASE_LABELS = {
    IC: '初始触地', LR: '承重反应', MSt: '支撑中期', TSt: '支撑末期',
    PSw: '摆动前期', ISw: '摆动初期', MSw: '摆动中期', TSw: '摆动末期'
  };
  var PHASE_STANDARDS = {
    IC: { range: '参考 0%', events: '本侧足跟或前足刚接触地面', cue: '确定触地瞬间，作为周期起点' },
    LR: { range: '参考 0–12%', events: '本侧初始触地 → 对侧足尖离地', cue: '承重转移，膝屈曲缓冲' },
    MSt: { range: '参考 12–31%', events: '对侧足尖离地 → 本侧足跟离地', cue: '躯干越过支撑足，单腿支撑' },
    TSt: { range: '参考 31–50%', events: '本侧足跟离地 → 对侧初始触地', cue: '足跟抬起，身体越过前足' },
    PSw: { range: '参考 50–60%', events: '对侧初始触地 → 本侧足尖离地', cue: '卸载并准备摆动，膝屈曲增加' },
    ISw: { range: '参考 60–75%', events: '本侧足尖离地 → 双足相邻', cue: '摆动腿前进，膝屈曲帮助廓清' },
    MSw: { range: '参考 75–87%', events: '双足相邻 → 摆动腿胫骨竖直', cue: '踝背屈保持足部廓清' },
    TSw: { range: '参考 87–100%', events: '摆动腿胫骨竖直 → 下一次初始触地', cue: '伸膝准备触地，踝保持背屈' }
  };
  var PHASE_BOUNDS = [0, 2, 12, 31, 50, 60, 75, 87, 100];
  var ANGLE_LABELS = { shoulder: '肩屈/伸', elbow: '肘屈', hip: '髋屈/伸', knee: '膝屈/伸', ankle: '踝背/跖屈' };
  var STORAGE_KEY = 'gait_assessment_log';
  var state = {
    phase: PHASE.UPLOAD,
    activeSide: 'left',
    session: null,
    results: null,
    error: '',
    notice: '',
    reviewer: '',
    resumeReady: false
  };
  var saveTimer = null;
  var dragState = null;

  function $(selector) { return document.querySelector(selector); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
  function sideLabel(side) { return side === 'right' ? '右侧视' : '左侧视'; }
  function formatTime(value) { return Number.isFinite(value) ? value.toFixed(3) + ' s' : '—'; }
  function angleText(value) { return Number.isFinite(value) ? value.toFixed(1) + '°' : '—'; }

  function createView(side) {
    return {
      side: side,
      direction: 1,
      status: 'empty',
      video: null,
      url: null,
      videoElement: null,
      frames: [],
      fps: 30,
      rawFrameCount: 0,
      modelVersion: null,
      frameIntegrity: null,
      progress: 0,
      currentFrame: 0,
      confirmedCycles: [],
      activeCycleId: null,
      confirmedBy: '',
      confirmedAt: null,
      showRaw: false,
      zoom: 1,
      playbackRate: 0.5,
      control: null,
      angleResizeObserver: null,
      undoStack: [],
      redoStack: [],
      suggestions: null
    };
  }

  function createSession() {
    return {
      schemaVersion: 2,
      id: uid('gait'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      protocol: { mode: 'unrecorded', speedKmh: null },
      patientInfo: { name: '', age: '', gender: '' },
      views: { left: createView('left'), right: createView('right') }
    };
  }

  function ensureProtocol() {
    var protocol = state.session.protocol;
    var speed = protocol && Number(protocol.speedKmh);
    if (speed !== 5 && speed !== 5.5) {
      state.session.protocol = { mode: 'unrecorded', speedKmh: null };
    } else {
      state.session.protocol = { mode: 'treadmill', speedKmh: speed };
    }
  }

  function currentView() { return state.session.views[state.activeSide]; }
  function currentFrame(view) { return view.frames[view.currentFrame] || null; }
  function activeCycle(view) {
    var cycle = view.confirmedCycles.find(function (item) { return item.id === view.activeCycleId; }) || null;
    if (cycle) ensureCycleRanges(view, cycle);
    return cycle;
  }

  function defaultPhaseBoundaries(cycle) {
    var length = cycle.endFrame - cycle.startFrame;
    var boundaries = PHASE_BOUNDS.map(function (percent) {
      return Math.round(cycle.startFrame + length * percent / 100);
    });
    boundaries[0] = cycle.startFrame;
    boundaries[boundaries.length - 1] = cycle.endFrame;
    for (var i = 1; i < boundaries.length - 1; i++) boundaries[i] = Math.max(boundaries[i], boundaries[i - 1] + 1);
    for (var j = boundaries.length - 2; j > 0; j--) boundaries[j] = Math.min(boundaries[j], boundaries[j + 1] - 1);
    return boundaries;
  }

  function ensureCycleRanges(view, cycle) {
    var changed = false;
    var boundaries = defaultPhaseBoundaries(cycle);
    K.PHASES.forEach(function (name, index) {
      var existing = cycle.phases[name];
      var rangeStart = boundaries[index];
      var rangeEnd = boundaries[index + 1] - 1;
      if (!existing || typeof existing !== 'object') {
        var representative = typeof existing === 'number' ? existing : Math.round((rangeStart + rangeEnd) / 2);
        cycle.phases[name] = { startFrame: rangeStart, endFrame: rangeEnd, representativeFrame: representative };
        changed = true;
      } else {
        if (!Number.isInteger(existing.startFrame)) { existing.startFrame = rangeStart; changed = true; }
        if (!Number.isInteger(existing.endFrame)) { existing.endFrame = rangeEnd; changed = true; }
        if (!Number.isInteger(existing.representativeFrame)) { existing.representativeFrame = Math.round((existing.startFrame + existing.endFrame) / 2); changed = true; }
      }
    });
    if (changed) {
      cycle.confirmed = false;
      state.results = null;
      scheduleSave();
    }
  }

  function adjustAdjacentPhase(cycle, phase, field) {
    var index = K.PHASES.indexOf(phase);
    var range = cycle.phases[phase];
    if (field === 'endFrame' && index < K.PHASES.length - 1) {
      var next = cycle.phases[K.PHASES[index + 1]];
      if (next.startFrame <= range.endFrame) next.startFrame = range.endFrame + 1;
    }
    if (field === 'startFrame' && index > 0) {
      var previous = cycle.phases[K.PHASES[index - 1]];
      if (previous.endFrame >= range.startFrame) previous.endFrame = range.startFrame - 1;
    }
  }

  function serializableSession() {
    var copy = clone(state.session);
    ['left', 'right'].forEach(function (side) {
      var source = state.session.views[side];
      copy.views[side].url = null;
      copy.views[side].videoElement = null;
      copy.views[side].control = null;
      copy.views[side].angleResizeObserver = null;
      copy.views[side].undoStack = [];
      copy.views[side].redoStack = [];
      if (source.video && source.video.blob) copy.views[side].video.blob = source.video.blob;
    });
    copy.updatedAt = new Date().toISOString();
    return copy;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!state.session || !window.__gaitStorage) return;
      window.__gaitStorage.saveDraft(serializableSession()).catch(function (error) {
        console.warn('[gait-v2] 草稿保存失败', error);
      });
    }, 450);
  }

  async function restoreDraft() {
    if (!window.__gaitStorage) return;
    try {
      var draft = await window.__gaitStorage.loadDraft();
      if (!draft || draft.schemaVersion !== 2 || !draft.views) return;
      state.session = draft;
      ['left', 'right'].forEach(function (side) {
        var view = state.session.views[side];
        view.undoStack = [];
        view.redoStack = [];
        view.control = null;
        view.angleResizeObserver = null;
        if (view.video && view.video.blob) {
          var file = new File([view.video.blob], view.video.name || side + '.mp4', { type: view.video.type || 'video/mp4' });
          window.__gaitMedia.loadVideo(file).then(function (loaded) {
            attachLoadedVideo(view, loaded, view.video.blob);
            view.status = view.frames.length ? 'review' : 'ready';
            if (state.phase !== PHASE.REPORT) render();
          }).catch(function () { view.status = 'error'; });
        }
      });
      state.notice = '已恢复上次审核草稿';
      render();
    } catch (error) {
      console.warn('[gait-v2] 草稿恢复失败', error);
    } finally {
      state.resumeReady = true;
    }
  }

  function setMessage(error, notice) {
    state.error = error || '';
    state.notice = notice || '';
  }

  function renderMessages() {
    return (state.error ? '<div class="gait-v2-error" role="alert">' + esc(state.error) + '</div>' : '') +
      (state.notice ? '<div class="gait-v2-success" role="status">' + esc(state.notice) + '</div>' : '');
  }

  function updateNav() {
    var nav = $('#gait-nav');
    if (!nav) return;
    nav.innerHTML = '<span style="font-weight:750;margin-right:10px;">步态运动学实验室</span>' +
      '<button class="gait-v2-btn gait-v2-btn-small" id="gait-nav-upload">双视频</button>' +
      '<button class="gait-v2-btn gait-v2-btn-small" id="gait-nav-report">确认报告</button>';
    $('#gait-nav-upload').addEventListener('click', function () { state.phase = PHASE.UPLOAD; render(); });
    $('#gait-nav-report').addEventListener('click', showReport);
  }

  function reportStatus() {
    if (!state.session) return { left: 0, right: 0 };
    var result = { left: 0, right: 0 };
    ['left', 'right'].forEach(function (side) {
      result[side] = state.session.views[side].confirmedCycles.filter(function (cycle) { return cycle.confirmed; }).length;
    });
    return result;
  }

  function renderReportBar() {
    var counts = reportStatus();
    var ready = counts.left > 0 && counts.right > 0;
    return '<div class="gait-v2-report-bar">' +
      '<div class="gait-v2-report-status">已确认周期：左侧 <b>' + counts.left + '</b> · 右侧 <b>' + counts.right + '</b><br>' +
      (ready ? '可以生成双侧对照报告' : '两侧各确认至少一个完整周期后生成报告') + '</div>' +
      '<div class="gait-v2-actions"><button class="gait-v2-btn" id="gait-new-session">新建评估</button>' +
      '<button class="gait-v2-btn gait-v2-btn-primary" id="gait-show-report" ' + (ready ? '' : 'disabled') + '>生成双侧报告</button></div></div>';
  }

  function bindCommon() {
    var reportButton = $('#gait-show-report');
    if (reportButton) reportButton.addEventListener('click', showReport);
    var newButton = $('#gait-new-session');
    if (newButton) newButton.addEventListener('click', newAssessment);
    updateExportButtons();
  }

  function render() {
    if (!state.session) state.session = createSession();
    var body = $('#gait-body');
    body.style.maxWidth = '1480px';
    body.classList.add('gait-v2-body');
    updateNav();
    if (state.phase === PHASE.REVIEW) renderReview();
    else if (state.phase === PHASE.REPORT && state.results) renderReport();
    else renderUpload();
    bindCommon();
  }

  function renderUpload() {
    ensureProtocol();
    var speed = state.session.protocol.speedKmh;
    var counts = reportStatus();
    $('#gait-body').innerHTML = '<div class="gait-v2-shell">' +
      '<section class="gait-v2-hero"><div><h2>双侧步态，逐帧看清</h2><p>上传左右侧视视频，自动识别解剖点，再由您逐帧校正并确认标准时相。自动结果只作建议，报告只采用人工确认周期。</p></div><span class="gait-v2-step">二维侧视 · 人工审核</span></section>' +
      renderMessages() +
      '<section class="gait-v2-panel"><h3>01 · 上传两段视频</h3><p>建议固定手机横屏拍摄，镜头与人体矢状面垂直。全身、足跟和足尖全程入镜，避免跑步机扶手遮挡。</p><div class="gait-v2-uploads">' +
      renderUploadCard('left', counts.left) + renderUploadCard('right', counts.right) + '</div></section>' +
      '<section class="gait-v2-panel"><h3>02 · 测试条件</h3><div class="gait-v2-actions"><label class="gait-v2-frame-label" for="gait-speed">跑步机设定速度</label><select class="gait-v2-select" id="gait-speed"><option value=""' + (speed == null ? ' selected' : '') + '>未记录</option><option value="5"' + (speed === 5 ? ' selected' : '') + '>5 km/h</option><option value="5.5"' + (speed === 5.5 ? ' selected' : '') + '>5.5 km/h</option></select></div><p style="margin-top:10px">5 km/h采用您提供的课程参考；5.5 km/h单独记录，待补充该速度参考后再判断偏离。</p></section>' +
      '<section class="gait-v2-panel"><h3>拍摄与审核原则</h3><ol class="gait-v2-guide"><li>纯侧面、固定机位，画面不要跟随人物移动。</li><li>光线均匀，穿贴身衣物，脚部与地面对比清晰。</li><li>每段包含至少一个完整同侧触地到再次触地周期。</li><li>先校正关键点，再确认时相；修改后需重新确认。</li></ol></section>' +
      '<section class="gait-v2-panel"><h3>受试者信息（可选）</h3><div class="gait-v2-actions"><input class="gait-v2-input" style="width:180px" id="gait-patient-name" placeholder="姓名" value="' + esc(state.session.patientInfo.name || '') + '"><input class="gait-v2-input" id="gait-patient-age" type="number" min="1" max="120" placeholder="年龄" value="' + esc(state.session.patientInfo.age || '') + '"><select class="gait-v2-select" id="gait-patient-gender"><option value="">性别</option><option' + (state.session.patientInfo.gender === '男' ? ' selected' : '') + '>男</option><option' + (state.session.patientInfo.gender === '女' ? ' selected' : '') + '>女</option><option' + (state.session.patientInfo.gender === '其他' ? ' selected' : '') + '>其他</option></select></div></section>' +
      renderReportBar() + '</div>';
    ['left', 'right'].forEach(function (side) {
      $('#gait-file-' + side).addEventListener('change', function (event) {
        if (event.target.files[0]) importVideo(side, event.target.files[0]);
      });
      $('#gait-analyze-' + side).addEventListener('click', function () { analyzeSide(side); });
      var review = $('#gait-review-' + side);
      if (review) review.addEventListener('click', function () { showReview(side); });
    });
    $('#gait-speed').addEventListener('change', function (event) {
      var value = event.target.value;
      state.session.protocol = value === '5' || value === '5.5'
        ? { mode: 'treadmill', speedKmh: Number(value) }
        : { mode: 'unrecorded', speedKmh: null };
      state.results = null;
      scheduleSave();
    });
    ['name', 'age', 'gender'].forEach(function (key) {
      $('#gait-patient-' + key).addEventListener('change', function (event) {
        state.session.patientInfo[key] = event.target.value;
        scheduleSave();
      });
    });
  }

  function renderUploadCard(side, confirmedCount) {
    var view = state.session.views[side];
    var video = view.video;
    var status = view.status === 'processing' ? '识别中 ' + Math.round(view.progress * 100) + '%' :
      view.frames.length ? view.frames.length + ' 帧 · ' + confirmedCount + ' 个确认周期' :
      video ? '视频已就绪' : '等待上传';
    var meta = video ? esc(video.name) + '<br>' + video.width + '×' + video.height + ' · ' + video.duration.toFixed(2) + ' s' : '支持手机 MP4 / MOV / WebM';
    return '<div class="gait-v2-upload gait-v2-upload-' + side + '"><div class="gait-v2-upload-head"><span class="gait-v2-upload-title">' + sideLabel(side) + '</span><span class="gait-v2-status">' + esc(status) + '</span></div>' +
      '<input class="gait-v2-file" id="gait-file-' + side + '" type="file" accept="video/*,.mp4,.mov,.webm,.m4v">' +
      '<div class="gait-v2-meta">' + meta + '</div>' +
      (view.status === 'processing' ? '<div class="gait-v2-progress"><span style="width:' + Math.min(100, view.progress * 100) + '%"></span></div>' : '') +
      '<div class="gait-v2-actions" style="margin-top:12px"><button class="gait-v2-btn gait-v2-btn-primary" id="gait-analyze-' + side + '" ' + (!video || view.status === 'processing' ? 'disabled' : '') + '>' + (view.frames.length ? '重新识别' : '开始逐帧识别') + '</button>' +
      (view.frames.length ? '<button class="gait-v2-btn" id="gait-review-' + side + '">进入人工审核</button>' : '') + '</div>' +
      (view.frameIntegrity === 'estimated-30fps-seek' ? '<div class="gait-v2-note" style="margin-top:10px">此浏览器无真实帧回调，当前按 30fps seek 解码；请核对帧号，推荐 H.264。</div>' : '') + '</div>';
  }

  function attachLoadedVideo(view, loaded, blob) {
    if (view.videoElement && view.videoElement !== loaded.element) view.videoElement.remove();
    if (view.url && view.url !== loaded.url) URL.revokeObjectURL(view.url);
    view.url = loaded.url;
    view.videoElement = loaded.element;
    view.video = Object.assign({}, loaded.info, { blob: blob });
    view.status = 'ready';
  }

  async function importVideo(side, file) {
    var view = state.session.views[side];
    setMessage('', '');
    try {
      if (view.control) view.control.cancelled = true;
      var loaded = await window.__gaitMedia.loadVideo(file);
      view.frames = [];
      view.confirmedCycles = [];
      view.activeCycleId = null;
      view.currentFrame = 0;
      view.undoStack = [];
      view.redoStack = [];
      attachLoadedVideo(view, loaded, file);
      state.results = null;
      render();
      scheduleSave();
    } catch (error) {
      setMessage(error.message || String(error), '');
      render();
    }
  }

  async function analyzeSide(side) {
    var view = state.session.views[side];
    if (!view.videoElement || view.status === 'processing') return;
    view.status = 'processing';
    view.progress = 0;
    view.control = { cancelled: false };
    state.activeSide = side;
    setMessage('', '');
    render();
    try {
      var frames = await window.__gaitMedia.analyzeVideo(view, function (count, fraction) {
        view.progress = Math.min(0.99, fraction || 0);
        var status = document.querySelector('.gait-v2-upload-' + side + ' .gait-v2-status');
        var bar = document.querySelector('.gait-v2-upload-' + side + ' .gait-v2-progress > span');
        if (status) status.textContent = '识别中 · ' + count + ' 帧';
        if (bar) bar.style.width = Math.min(100, view.progress * 100) + '%';
      }, view.control);
      if (view.control.cancelled) return;
      view.frames = frames;
      view.rawFrameCount = frames.length;
      view.currentFrame = 0;
      view.status = 'review';
      view.progress = 1;
      view.confirmedCycles = [];
      view.activeCycleId = null;
      try {
        view.suggestions = window.__gaitParams ? window.__gaitParams.detectGaitEvents(frames) : null;
      } catch (error) {
        view.suggestions = null;
      }
      state.notice = sideLabel(side) + '识别完成，请校正骨架并确认时相';
      showReview(side);
      scheduleSave();
    } catch (error) {
      view.status = 'ready';
      setMessage(error.message || String(error), '');
      render();
    }
  }

  function showReview(side) {
    state.activeSide = side;
    state.phase = PHASE.REVIEW;
    setMessage('', '');
    render();
    $('#gait-overlay').scrollTop = 0;
  }

  function renderReview() {
    var view = currentView();
    if (!view.frames.length) {
      state.phase = PHASE.UPLOAD;
      renderUpload();
      return;
    }
    var cycle = activeCycle(view);
    $('#gait-body').innerHTML = '<div class="gait-v2-shell">' +
      '<div class="gait-v2-side-tabs"><button class="gait-v2-btn gait-v2-side-tab ' + (state.activeSide === 'left' ? 'active' : '') + '" id="gait-tab-left">左侧视 · ' + viewCount('left') + '</button><button class="gait-v2-btn gait-v2-side-tab ' + (state.activeSide === 'right' ? 'active' : '') + '" id="gait-tab-right">右侧视 · ' + viewCount('right') + '</button></div>' +
      renderMessages() +
      '<div class="gait-v2-editor"><main><div class="gait-v2-stage" id="gait-stage"><div class="gait-v2-video-rail gait-v2-video-rail-left"><div><span>肩屈/伸</span><strong data-video-angle="shoulder">—</strong></div><div><span>肘屈</span><strong data-video-angle="elbow">—</strong></div></div><div class="gait-v2-stage-inner" id="gait-stage-inner"></div><div class="gait-v2-video-rail gait-v2-video-rail-right"><div><span>髋屈/伸</span><strong data-video-angle="hip">—</strong></div><div><span>膝屈/伸</span><strong data-video-angle="knee">—</strong></div><div><span>踝背/跖屈</span><strong data-video-angle="ankle">—</strong></div></div></div>' +
      '<div class="gait-v2-transport"><button class="gait-v2-btn" id="gait-play">播放</button><label class="gait-v2-frame-label">速度 <select class="gait-v2-select" id="gait-playback-rate" title="仅改变播放速度，不影响逐帧和报告"><option value="0.25"' + (view.playbackRate === 0.25 ? ' selected' : '') + '>0.25×</option><option value="0.5"' + (view.playbackRate !== 1 && view.playbackRate !== 0.25 ? ' selected' : '') + '>0.5× 慢放</option><option value="1"' + (view.playbackRate === 1 ? ' selected' : '') + '>1× 原速</option></select></label><button class="gait-v2-btn" id="gait-fullscreen" title="按视频比例完整放大">全屏放大</button><button class="gait-v2-btn" id="gait-prev-frame">← 上一帧</button><button class="gait-v2-btn" id="gait-next-frame">下一帧 →</button><label class="gait-v2-frame-label">帧 <input class="gait-v2-input" id="gait-frame-number" type="number" min="0" max="' + (view.frames.length - 1) + '" value="' + view.currentFrame + '"> / ' + (view.frames.length - 1) + '</label><span class="gait-v2-frame-label" id="gait-frame-time">' + formatTime(currentFrame(view).t) + '</span></div>' +
      '<div class="gait-v2-transport"><select class="gait-v2-select" id="gait-direction"><option value="1"' + (view.direction === 1 ? ' selected' : '') + '>前方朝画面右</option><option value="-1"' + (view.direction === -1 ? ' selected' : '') + '>前方朝画面左</option></select><select class="gait-v2-select" id="gait-zoom"><option value="1">适应窗口</option><option value="2">放大 200%</option><option value="3">300%</option></select><select class="gait-v2-select" id="gait-add-point"><option value="">补标缺失点…</option><option value="shoulder">肩</option><option value="elbow">肘</option><option value="wrist">腕</option><option value="hip">髋</option><option value="knee">膝</option><option value="ankle">踝</option><option value="foot_index">足尖</option></select><label class="gait-v2-frame-label"><input type="checkbox" id="gait-show-raw" ' + (view.showRaw ? 'checked' : '') + '> 显示 AI 原始点</label><button class="gait-v2-btn gait-v2-btn-small" id="gait-reset-frame">重置本帧</button><button class="gait-v2-btn gait-v2-btn-small" id="gait-undo">撤销</button><button class="gait-v2-btn gait-v2-btn-small" id="gait-redo">重做</button></div>' +
      '<div class="gait-v2-angle-grid" id="gait-angle-grid">' + K.ANGLE_KEYS.map(function (key) { return '<div class="gait-v2-angle"><div class="gait-v2-angle-label">' + ANGLE_LABELS[key] + '</div><div class="gait-v2-angle-value" id="gait-angle-' + key + '">—</div></div>'; }).join('') + '</div></main>' +
      '<aside class="gait-v2-review-column"><section class="gait-v2-panel"><h3>人工时相</h3><p>先选周期，再把当前帧标记为对应时相。IC 是周期起点，下一次 IC 是终点。百分比仅作正常参考，以实际动作帧为准。</p><div class="gait-v2-actions" style="margin-bottom:10px"><button class="gait-v2-btn gait-v2-btn-small" id="gait-add-cycle">从当前帧新建周期</button></div><div class="gait-v2-cycle-list" id="gait-cycle-list">' + renderCycleChips(view) + '</div><div id="gait-cycle-editor">' + (cycle ? renderCycleEditor(view, cycle) : '<div class="gait-v2-note">尚未建立周期。移动到同侧初始触地帧，点击“从当前帧新建周期”。</div>') + '</div></section>' +
      '<section class="gait-v2-panel"><h3>确认人</h3><input class="gait-v2-input" style="width:100%" id="gait-reviewer" placeholder="输入姓名或 initials" value="' + esc(state.reviewer || view.confirmedBy || '') + '"><p style="margin:8px 0 0">点位或时相修改后，相关周期自动退回未确认。</p></section></aside></div>' + renderReportBar() + '</div>';
    $('#gait-tab-left').addEventListener('click', function () { showReview('left'); });
    $('#gait-tab-right').addEventListener('click', function () { showReview('right'); });
    bindEditor(view);
    bindCycleEditor(view);
  }

  function viewCount(side) {
    var view = state.session.views[side];
    return view.frames.length + ' 帧 / ' + view.confirmedCycles.filter(function (c) { return c.confirmed; }).length + ' 确认';
  }

  function renderCycleChips(view) {
    return view.confirmedCycles.map(function (cycle, index) {
      return '<button class="gait-v2-btn gait-v2-btn-small gait-v2-cycle-chip ' + (cycle.id === view.activeCycleId ? 'active ' : '') + (cycle.confirmed ? 'confirmed' : '') + '" data-cycle="' + esc(cycle.id) + '">周期 ' + (index + 1) + '</button>';
    }).join('');
  }

  function renderCycleEditor(view, cycle) {
    return '<div class="gait-v2-actions" style="margin-bottom:10px"><label class="gait-v2-frame-label">结束 IC <input class="gait-v2-input" id="gait-cycle-end" type="number" min="' + (cycle.startFrame + 1) + '" max="' + (view.frames.length - 1) + '" value="' + cycle.endFrame + '"></label><span class="gait-v2-status">' + (cycle.confirmed ? '已确认' : '待确认') + '</span></div>' +
      '<div class="gait-v2-phase-list">' + K.PHASES.map(function (phase) {
        var standard = PHASE_STANDARDS[phase];
        var range = cycle.phases[phase];
        return '<div class="gait-v2-phase-row"><span class="gait-v2-phase-code">' + phase + '</span><span class="gait-v2-phase-name"><strong>' + PHASE_LABELS[phase] + '</strong><small class="gait-v2-phase-standard">' + standard.events + ' · ' + standard.range + '<br>' + standard.cue + '</small></span><label class="gait-v2-phase-frame">代表<input class="gait-v2-input" data-phase-input="' + phase + '" type="number" min="' + range.startFrame + '" max="' + range.endFrame + '" value="' + range.representativeFrame + '"></label><label class="gait-v2-phase-frame">起始<input class="gait-v2-input" data-phase-start="' + phase + '" type="number" min="' + cycle.startFrame + '" max="' + (cycle.endFrame - 1) + '" value="' + range.startFrame + '"></label><label class="gait-v2-phase-frame">结束<input class="gait-v2-input" data-phase-end="' + phase + '" type="number" min="' + cycle.startFrame + '" max="' + (cycle.endFrame - 1) + '" value="' + range.endFrame + '"></label><span class="gait-v2-phase-actions"><button class="gait-v2-btn gait-v2-btn-small" data-mark-phase="' + phase + '">代表=当前</button><button class="gait-v2-btn gait-v2-btn-small" data-mark-start="' + phase + '">起点=当前</button><button class="gait-v2-btn gait-v2-btn-small" data-mark-end="' + phase + '">终点=当前</button></span></div>';
      }).join('') + '</div><div class="gait-v2-actions" style="margin-top:12px"><button class="gait-v2-btn gait-v2-btn-primary" id="gait-confirm-cycle">' + (cycle.confirmed ? '重新确认' : '确认此周期') + '</button><button class="gait-v2-btn gait-v2-btn-danger" id="gait-delete-cycle">删除</button></div>' +
      (cycle.confirmed ? '<div class="gait-v2-success" style="margin-top:10px">已确认 · ' + esc(cycle.confirmedBy || '未署名') + '<br>' + esc(cycle.confirmedAt || '') + '</div>' : '');
  }

  function bindEditor(view) {
    var stage = $('#gait-stage-inner');
    var video = view.videoElement;
    stage.appendChild(video);
    video.id = 'gait-review-video';
    video.className = 'gait-v2-video';
    video.style.cssText = '';
    video.controls = false;
    if ([0.25, 0.5, 1].indexOf(view.playbackRate) === -1) view.playbackRate = 0.5;
    video.playbackRate = view.playbackRate;
    video.defaultPlaybackRate = view.playbackRate;
    var canvas = document.createElement('canvas');
    canvas.id = 'gait-editor-canvas';
    canvas.className = 'gait-v2-canvas';
    canvas.width = view.video.width;
    canvas.height = view.video.height;
    stage.appendChild(canvas);
    stage.style.aspectRatio = view.video.width + ' / ' + view.video.height;
    stage.style.setProperty('--video-ratio', view.video.width / view.video.height);
    $('#gait-stage').style.setProperty('--video-ratio', view.video.width / view.video.height);
    stage.style.width = view.zoom === 1 ? '' : (view.zoom * 100) + '%';
    if (view.angleResizeObserver) view.angleResizeObserver.disconnect();
    if (window.ResizeObserver) {
      view.angleResizeObserver = new ResizeObserver(updateAngleRailLayout);
      view.angleResizeObserver.observe($('#gait-stage'));
    }
    updateAngleRailLayout();
    $('#gait-zoom').value = String(view.zoom);
    video.currentTime = currentFrame(view).t;
    video.addEventListener('seeked', function () { drawEditor(view); });
    video.addEventListener('play', function () {
      $('#gait-play').textContent = '暂停';
      requestAnimationFrame(function playFrame() {
        if (video.paused || state.phase !== PHASE.REVIEW || currentView() !== view) return;
        var nearest = nearestFrame(view, video.currentTime);
        if (nearest !== view.currentFrame) {
          view.currentFrame = nearest;
          updateFrameUI(view);
        }
        drawEditor(view);
        requestAnimationFrame(playFrame);
      });
    });
    video.addEventListener('pause', function () { if ($('#gait-play')) $('#gait-play').textContent = '播放'; });
    $('#gait-play').addEventListener('click', function () { if (video.paused) video.play(); else video.pause(); });
    $('#gait-playback-rate').addEventListener('change', function (event) {
      var rate = Number(event.target.value);
      view.playbackRate = [0.25, 0.5, 1].indexOf(rate) === -1 ? 0.5 : rate;
      video.playbackRate = view.playbackRate;
      video.defaultPlaybackRate = view.playbackRate;
      scheduleSave();
    });
    $('#gait-fullscreen').addEventListener('click', function () {
      var player = $('#gait-stage');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (player.requestFullscreen) {
        player.requestFullscreen().catch(function () { player.classList.toggle('gait-v2-stage-expanded'); });
      } else {
        player.classList.toggle('gait-v2-stage-expanded');
      }
    });
    $('#gait-prev-frame').addEventListener('click', function () { seekFrame(view, view.currentFrame - 1); });
    $('#gait-next-frame').addEventListener('click', function () { seekFrame(view, view.currentFrame + 1); });
    $('#gait-frame-number').addEventListener('change', function (event) { seekFrame(view, Number(event.target.value)); });
    $('#gait-direction').addEventListener('change', function (event) {
      pushHistory(view);
      view.direction = Number(event.target.value) === -1 ? -1 : 1;
      invalidateAll(view);
      updateFrameUI(view);
      scheduleSave();
    });
    $('#gait-zoom').addEventListener('change', function (event) {
      view.zoom = Number(event.target.value) || 1;
      stage.style.width = view.zoom === 1 ? '' : (view.zoom * 100) + '%';
      updateAngleRailLayout();
    });
    $('#gait-add-point').addEventListener('change', function (event) {
      view.placingPoint = event.target.value ? view.side + '_' + event.target.value : null;
      canvas.style.cursor = view.placingPoint ? 'cell' : 'crosshair';
    });
    $('#gait-show-raw').addEventListener('change', function (event) { view.showRaw = event.target.checked; drawEditor(view); });
    $('#gait-reset-frame').addEventListener('click', function () {
      pushHistory(view);
      var frame = currentFrame(view);
      frame.keypoints = clone(frame.rawKeypoints || []);
      invalidateFrame(view, frame.frameIndex);
      updateFrameUI(view);
      scheduleSave();
    });
    $('#gait-undo').addEventListener('click', function () { undo(view); });
    $('#gait-redo').addEventListener('click', function () { redo(view); });
    canvas.addEventListener('pointerdown', function (event) { startDrag(event, view, canvas); });
    canvas.addEventListener('pointermove', function (event) { moveDrag(event, view, canvas); });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    document.onkeydown = function (event) {
      if (state.phase !== PHASE.REVIEW || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); seekFrame(view, view.currentFrame - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); seekFrame(view, view.currentFrame + 1); }
    };
    updateFrameUI(view);
  }

  function nearestFrame(view, time) {
    var best = 0;
    var distance = Infinity;
    view.frames.forEach(function (frame, index) {
      var d = Math.abs(frame.t - time);
      if (d < distance) { distance = d; best = index; }
    });
    return best;
  }

  function seekFrame(view, index) {
    if (!view.frames.length) return;
    view.currentFrame = Math.max(0, Math.min(view.frames.length - 1, Math.round(index)));
    view.videoElement.pause();
    view.videoElement.currentTime = currentFrame(view).t;
    updateFrameUI(view);
  }

  function updateFrameUI(view) {
    var frame = currentFrame(view);
    if (!frame) return;
    var input = $('#gait-frame-number');
    if (input) input.value = frame.frameIndex;
    var time = $('#gait-frame-time');
    if (time) time.textContent = formatTime(frame.t);
    var angles = K.computeFrameAngles(frame.keypoints, { side: view.side, direction: view.direction });
    K.ANGLE_KEYS.forEach(function (key) {
      var node = $('#gait-angle-' + key);
      if (node) node.textContent = angleText(angles[key]);
      document.querySelectorAll('[data-video-angle="' + key + '"]').forEach(function (railValue) {
        railValue.textContent = angleText(angles[key]);
      });
    });
    drawEditor(view);
  }

  function updateAngleRailLayout() {
    var stage = $('#gait-stage');
    var inner = $('#gait-stage-inner');
    var grid = $('#gait-angle-grid');
    if (!stage || !inner || !grid) return;
    var gutter = Math.max(0, (stage.clientWidth - inner.clientWidth) / 2);
    var showRails = gutter >= 112;
    stage.classList.toggle('gait-v2-rails-space', showRails);
    grid.style.display = showRails ? 'none' : 'grid';
  }

  function drawSkeleton(context, frame, side, width, height, showRaw, preserveBackground) {
    var points = frame ? (showRaw ? frame.rawKeypoints : frame.keypoints) || [] : [];
    var map = {};
    points.forEach(function (point) { map[point.name] = point; });
    function point(name) {
      var p = map[side + '_' + name];
      return p && (p.score == null || p.score >= 0.25) ? p : null;
    }
    if (!preserveBackground) context.clearRect(0, 0, width, height);
    var links = [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'], ['ankle', 'foot_index']];
    context.lineWidth = Math.max(2, width / 400);
    context.strokeStyle = '#5eead4';
    links.forEach(function (link) {
      var a = point(link[0]);
      var b = point(link[1]);
      if (!a || !b) return;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    });
    ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'foot_index'].forEach(function (name) {
      var p = point(name);
      if (!p) return;
      context.beginPath();
      context.arc(p.x, p.y, name === 'foot_index' ? width / 150 : width / 110, 0, Math.PI * 2);
      context.fillStyle = p.source === 'manual' ? '#fbbf24' : (p.score == null || p.score >= 0.5 ? '#22d3ee' : '#fb7185');
      context.fill();
      context.lineWidth = Math.max(1, width / 600);
      context.strokeStyle = '#ffffff';
      context.stroke();
      context.fillStyle = '#ffffff';
      context.font = Math.max(11, width / 55) + 'px sans-serif';
      context.fillText({ shoulder: '肩', elbow: '肘', wrist: '腕', hip: '髋', knee: '膝', ankle: '踝', foot_index: '足尖' }[name], p.x + 10, p.y - 10);
    });
  }

  function drawEditor(view) {
    var canvas = $('#gait-editor-canvas');
    if (!canvas) return;
    drawSkeleton(canvas.getContext('2d'), currentFrame(view), view.side, canvas.width, canvas.height, view.showRaw);
  }

  function canvasPoint(event, canvas) {
    var rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }

  function startDrag(event, view, canvas) {
    if (view.showRaw) return;
    var position = canvasPoint(event, canvas);
    var frame = currentFrame(view);
    if (view.placingPoint) {
      pushHistory(view);
      var existing = frame.keypoints.find(function (point) { return point.name === view.placingPoint; });
      if (existing) {
        existing.x = position.x;
        existing.y = position.y;
        existing.score = 1;
        existing.source = 'manual';
      } else {
        frame.keypoints.push({ name: view.placingPoint, x: position.x, y: position.y, score: 1, source: 'manual' });
      }
      view.placingPoint = null;
      $('#gait-add-point').value = '';
      canvas.style.cursor = 'crosshair';
      invalidateFrame(view, frame.frameIndex);
      updateFrameUI(view);
      scheduleSave();
      event.preventDefault();
      return;
    }
    var nearest = null;
    var distance = Infinity;
    frame.keypoints.forEach(function (point) {
      if (point.name.indexOf(view.side + '_') !== 0) return;
      var part = point.name.slice((view.side + '_').length);
      if (['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'foot_index'].indexOf(part) === -1) return;
      var d = Math.hypot(point.x - position.x, point.y - position.y);
      if (d < distance) { distance = d; nearest = point; }
    });
    if (!nearest || distance > canvas.width / 18) return;
    pushHistory(view);
    dragState = { view: view, name: nearest.name, moved: false };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event, view, canvas) {
    if (!dragState || dragState.view !== view) return;
    var position = canvasPoint(event, canvas);
    var point = currentFrame(view).keypoints.find(function (item) { return item.name === dragState.name; });
    if (!point) return;
    point.x = Math.max(0, Math.min(canvas.width, position.x));
    point.y = Math.max(0, Math.min(canvas.height, position.y));
    point.source = 'manual';
    point.score = 1;
    dragState.moved = true;
    updateFrameUI(view);
  }

  function endDrag() {
    if (!dragState) return;
    if (dragState.moved) {
      invalidateFrame(dragState.view, dragState.view.currentFrame);
      scheduleSave();
    }
    dragState = null;
  }

  function pushHistory(view) {
    view.undoStack.push({ frameIndex: view.currentFrame, keypoints: clone(currentFrame(view).keypoints), cycles: clone(view.confirmedCycles), direction: view.direction });
    if (view.undoStack.length > 40) view.undoStack.shift();
    view.redoStack = [];
  }

  function restoreHistory(view, snapshot) {
    view.currentFrame = snapshot.frameIndex;
    currentFrame(view).keypoints = clone(snapshot.keypoints);
    view.confirmedCycles = clone(snapshot.cycles);
    view.direction = snapshot.direction;
    if (!activeCycle(view)) view.activeCycleId = view.confirmedCycles.length ? view.confirmedCycles[0].id : null;
    state.results = null;
    render();
  }

  function undo(view) {
    if (!view.undoStack.length) return;
    view.redoStack.push({ frameIndex: view.currentFrame, keypoints: clone(currentFrame(view).keypoints), cycles: clone(view.confirmedCycles), direction: view.direction });
    restoreHistory(view, view.undoStack.pop());
    scheduleSave();
  }

  function redo(view) {
    if (!view.redoStack.length) return;
    view.undoStack.push({ frameIndex: view.currentFrame, keypoints: clone(currentFrame(view).keypoints), cycles: clone(view.confirmedCycles), direction: view.direction });
    restoreHistory(view, view.redoStack.pop());
    scheduleSave();
  }

  function invalidateFrame(view, frameIndex) {
    K.invalidateCycles(view, frameIndex);
    state.results = null;
  }

  function invalidateAll(view) {
    view.confirmedCycles.forEach(function (cycle) { cycle.confirmed = false; });
    state.results = null;
  }

  function bindCycleEditor(view) {
    document.querySelectorAll('[data-cycle]').forEach(function (button) {
      button.addEventListener('click', function () { view.activeCycleId = button.dataset.cycle; render(); });
    });
    $('#gait-add-cycle').addEventListener('click', function () { addCycle(view); });
    var cycle = activeCycle(view);
    if (!cycle) return;
    $('#gait-cycle-end').addEventListener('change', function (event) {
      pushHistory(view);
      cycle.endFrame = Math.max(cycle.startFrame + 1, Math.min(view.frames.length - 1, Number(event.target.value)));
      cycle.phases.TSw.endFrame = cycle.endFrame - 1;
      cycle.confirmed = false;
      state.results = null;
      render();
      scheduleSave();
    });
    document.querySelectorAll('[data-phase-input]').forEach(function (input) {
      input.addEventListener('change', function () {
        pushHistory(view);
        cycle.phases[input.dataset.phaseInput].representativeFrame = Number(input.value);
        cycle.confirmed = false;
        state.results = null;
        render();
        scheduleSave();
      });
    });
    document.querySelectorAll('[data-phase-start], [data-phase-end]').forEach(function (input) {
      input.addEventListener('change', function () {
        pushHistory(view);
        var field = input.dataset.phaseStart !== undefined ? 'startFrame' : 'endFrame';
        var phase = input.dataset.phaseStart !== undefined ? input.dataset.phaseStart : input.dataset.phaseEnd;
        cycle.phases[phase][field] = Number(input.value);
        adjustAdjacentPhase(cycle, phase, field);
        cycle.confirmed = false;
        state.results = null;
        render();
        scheduleSave();
      });
    });
    document.querySelectorAll('[data-mark-phase], [data-mark-start], [data-mark-end]').forEach(function (button) {
      button.addEventListener('click', function () {
        pushHistory(view);
        var field = button.dataset.markPhase !== undefined ? 'representativeFrame' : button.dataset.markStart !== undefined ? 'startFrame' : 'endFrame';
        var phase = button.dataset.markPhase || button.dataset.markStart || button.dataset.markEnd;
        cycle.phases[phase][field] = view.currentFrame;
        adjustAdjacentPhase(cycle, phase, field);
        cycle.confirmed = false;
        state.results = null;
        render();
        scheduleSave();
      });
    });
    $('#gait-delete-cycle').addEventListener('click', function () {
      pushHistory(view);
      view.confirmedCycles = view.confirmedCycles.filter(function (item) { return item.id !== cycle.id; });
      view.activeCycleId = view.confirmedCycles.length ? view.confirmedCycles[0].id : null;
      state.results = null;
      render();
      scheduleSave();
    });
    $('#gait-confirm-cycle').addEventListener('click', function () {
      cycle.confirmed = true;
      var validation = K.validateCycle(view, cycle);
      if (!validation.valid) {
        cycle.confirmed = false;
        setMessage('周期不能确认：' + validation.reason + '。请检查 IC、结束帧和 8 时相顺序。', '');
        render();
        return;
      }
      cycle.confirmedBy = ($('#gait-reviewer').value || '').trim() || '未署名';
      cycle.confirmedAt = new Date().toISOString();
      state.reviewer = cycle.confirmedBy;
      view.confirmedBy = cycle.confirmedBy;
      view.confirmedAt = cycle.confirmedAt;
      state.results = null;
      setMessage('', sideLabel(view.side) + '周期已人工确认');
      render();
      scheduleSave();
    });
  }

  function addCycle(view) {
    var start = view.currentFrame;
    var end = Math.min(view.frames.length - 1, start + Math.max(9, Math.round(view.fps || 30)));
    if (end <= start) {
      setMessage('当前已是最后一帧，无法新建完整周期', '');
      render();
      return;
    }
    var pcts = [0, 5, 20, 40, 55, 67, 80, 93];
    var phases = {};
    var boundaries = defaultPhaseBoundaries({ startFrame: start, endFrame: end });
    K.PHASES.forEach(function (phase, index) {
      var rangeStart = boundaries[index];
      var rangeEnd = boundaries[index + 1] - 1;
      var representative = Math.round(start + (end - start) * pcts[index] / 100);
      phases[phase] = {
        startFrame: rangeStart,
        endFrame: rangeEnd,
        representativeFrame: Math.max(rangeStart, Math.min(rangeEnd, representative))
      };
    });
    var cycle = { id: uid('cycle'), startFrame: start, endFrame: end, phases: phases, confirmed: false, source: 'manual-draft' };
    view.confirmedCycles.push(cycle);
    view.activeCycleId = cycle.id;
    state.results = null;
    render();
    scheduleSave();
  }

  async function seekForSnapshot(view, frameIndex) {
    var video = view.videoElement;
    if (!video.isConnected) {
      video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;';
      document.body.appendChild(video);
    }
    video.pause();
    var waiting = new Promise(function (resolve) {
      var timer = setTimeout(resolve, 1200);
      video.addEventListener('seeked', function () { clearTimeout(timer); resolve(); }, { once: true });
    });
    video.currentTime = view.frames[frameIndex] ? view.frames[frameIndex].t : 0;
    await waiting;
  }

  async function captureSnapshots(view, reportView) {
    var cycle = reportView.cycles[0];
    if (!cycle) return [];
    var snapshots = [];
    for (var i = 0; i < K.PHASES.length; i++) {
      var phase = K.PHASES[i];
      var frameIndex = cycle.phases[phase].representativeFrame;
      await seekForSnapshot(view, frameIndex);
      var sourceW = view.video.width;
      var sourceH = view.video.height;
      var scale = Math.min(1, 640 / sourceW);
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(sourceW * scale);
      canvas.height = Math.round(sourceH * scale);
      var context = canvas.getContext('2d');
      context.drawImage(view.videoElement, 0, 0, canvas.width, canvas.height);
      var frame = view.frames[frameIndex];
      var scaledFrame = { keypoints: frame.keypoints.map(function (point) {
        return Object.assign({}, point, { x: point.x * scale, y: point.y * scale });
      }) };
      drawSkeleton(context, scaledFrame, view.side, canvas.width, canvas.height, false, true);
      var seriesFrame = cycle.series.find(function (item) { return item.frameIndex === frameIndex; });
      snapshots.push({
        cycleId: cycle.id, phase: phase, label: PHASE_LABELS[phase], frameIndex: frameIndex,
        time: frame.t, imageData: canvas.toDataURL('image/jpeg', 0.78), angles: seriesFrame && seriesFrame.angles
      });
    }
    return snapshots;
  }

  async function showReport() {
    if (!state.session) return;
    setMessage('', '');
    var preliminary = K.buildConfirmedReport(state.session);
    if (!preliminary.canExport) {
      state.phase = PHASE.UPLOAD;
      setMessage('还不能生成双侧报告：' + preliminary.missing.map(sideLabel).join('、') + '缺少有效人工确认周期。', '');
      render();
      return;
    }
    state.phase = PHASE.REPORT;
    $('#gait-body').innerHTML = '<div class="gait-v2-panel"><h3>正在生成确认报告…</h3><p>按人工时相提取左右侧骨架截图。</p></div>';
    try {
      var report = K.buildConfirmedReport(state.session);
      for (var i = 0; i < 2; i++) {
        var side = i === 0 ? 'left' : 'right';
        var view = state.session.views[side];
        report.views[side].videoName = view.video && view.video.name;
        report.views[side].modelVersion = view.modelVersion;
        report.views[side].confirmedBy = view.confirmedBy;
        report.views[side].confirmedAt = view.confirmedAt;
        report.views[side].frameIntegrity = view.frameIntegrity;
        report.views[side].phaseSnapshots = await captureSnapshots(view, report.views[side]);
      }
      report.patientInfo = clone(state.session.patientInfo || {});
      report.neuroInterpretation = window.__gaitNeuro ? window.__gaitNeuro.buildNeuroInterpretation(report) : null;
      state.results = report;
      render();
      if (!report._localId) saveAssessment(report);
    } catch (error) {
      state.phase = PHASE.REVIEW;
      setMessage('报告生成失败：' + (error.message || String(error)), '');
      render();
    }
  }

  function renderReport() {
    $('#gait-body').innerHTML = '<div class="gait-v2-shell"><div class="gait-v2-actions"><button class="gait-v2-btn" id="gait-back-review">← 返回人工审核</button></div><div id="gait-report-v2"></div>' + renderReportBar() + '</div>';
    $('#gait-back-review').addEventListener('click', function () { showReview(state.activeSide); });
    window.__gaitReportV2.renderReport(state.results, $('#gait-report-v2'));
  }

  function updateExportButtons() {
    var enabled = !!(state.results && state.results.canExport);
    var pdf = $('#gait-export-pdf');
    if (pdf) pdf.disabled = !(enabled || state.results && state.results.type !== 'gait-confirmed-report');
    ['#gait-export-csv', '#gait-export-json'].forEach(function (selector) {
      var button = $(selector);
      if (button) button.disabled = !enabled;
    });
  }

  function patientInfo(record) {
    if (record && record.patientInfo) return record.patientInfo;
    return state.session && state.session.patientInfo || { name: '', age: '', gender: '' };
  }

  function shareToken() {
    try { return sessionStorage.getItem('bm_gait_share_token') || new URLSearchParams(location.search).get('share_token') || ''; }
    catch (error) { return ''; }
  }

  function saveAssessment(record) {
    if (!record) return false;
    if (record.type === 'gait-confirmed-report' && !record.canExport) return false;
    var info = patientInfo(record);
    if (shareToken() && !info.name) {
      alert('云端保存前请先在双视频页填写受试者姓名');
      return false;
    }
    var saved = clone(record);
    saved.patientInfo = info;
    saved._localId = saved._localId || uid('gait_report');
    if (record.type === 'gait-confirmed-report' && !record._localId) record._localId = saved._localId;
    var log = loadHistory();
    var existing = log.findIndex(function (item) { return item._localId === saved._localId; });
    if (existing >= 0) log[existing] = saved;
    else log.push(saved);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-10)));
    } catch (error) {
      ['left', 'right'].forEach(function (side) {
        if (saved.views && saved.views[side]) delete saved.views[side].phaseSnapshots;
      });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-10))); } catch (ignored) {}
    }
    submitCloud(saved);
    return true;
  }

  function markCloud(localId, status, error, cloudId) {
    var log = loadHistory();
    var item = log.find(function (entry) { return entry._localId === localId; });
    if (!item) return;
    item._cloudStatus = status;
    if (error) item._cloudErr = error;
    if (cloudId) item._cloudId = cloudId;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log)); } catch (ignored) {}
  }

  function submitCloud(record) {
    var token = shareToken();
    if (!token || !record._localId) return;
    if (!window.SupabaseClient || !window.SupabaseClient.isConfigured()) {
      markCloud(record._localId, 'failed', 'supabase_not_configured');
      return;
    }
    var payload = clone(record);
    ['left', 'right'].forEach(function (side) {
      if (payload.views && payload.views[side]) delete payload.views[side].phaseSnapshots;
    });
    Object.keys(payload).forEach(function (key) { if (key.indexOf('_cloud') === 0 || key === '_localId') delete payload[key]; });
    markCloud(record._localId, 'syncing');
    window.SupabaseClient.submitGaitAssessment({
      shareToken: token,
      patientInfo: record.patientInfo || {},
      payload: payload,
      classificationPrimary: record.classification && record.classification.primary || null
    }).then(function (id) { markCloud(record._localId, 'synced', null, id); })
      .catch(function (error) { markCloud(record._localId, 'failed', String(error && error.message || error)); });
  }

  function loadHistory() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }

  function renderHistory() {
    var list = $('#gait-history-list');
    var records = loadHistory().slice().reverse();
    list.innerHTML = records.length ? '' : '<p style="color:#64748b">暂无已确认报告</p>';
    records.forEach(function (record) {
      var button = document.createElement('button');
      button.className = 'gait-v2-history-item';
      var title = record.type === 'gait-confirmed-report' ? '双侧人工确认报告' : '旧版步态报告';
      var name = record.patientInfo && record.patientInfo.name || '未填写姓名';
      button.innerHTML = '<span><b>' + esc(name) + '</b><br><span class="gait-v2-history-date">' + esc(title) + '</span></span><span class="gait-v2-history-date">' + esc(new Date(record.timestamp || record._localId && Number(record._localId.split('_')[1]) || Date.now()).toLocaleDateString('zh-CN')) + '</span>';
      button.addEventListener('click', function () {
        $('#gait-history-overlay').style.display = 'none';
        state.results = record;
        state.phase = PHASE.REPORT;
        var body = $('#gait-body');
        body.innerHTML = '<div id="gait-report-v2"></div>';
        if (record.type === 'gait-confirmed-report') window.__gaitReportV2.renderReport(record, $('#gait-report-v2'));
        else window.__gaitReport.renderReport(record, $('#gait-report-v2'));
        updateExportButtons();
      });
      list.appendChild(button);
    });
    $('#gait-history-overlay').style.display = 'flex';
  }

  async function newAssessment() {
    if (!confirm('新建评估会清空当前双视频工作区；已保存的历史报告不受影响。继续吗？')) return;
    ['left', 'right'].forEach(function (side) { releaseView(state.session.views[side]); });
    state.session = createSession();
    state.results = null;
    state.phase = PHASE.UPLOAD;
    state.activeSide = 'left';
    if (window.__gaitStorage) await window.__gaitStorage.clearDraft();
    render();
  }

  function releaseView(view) {
    if (!view) return;
    if (view.control) view.control.cancelled = true;
    if (view.angleResizeObserver) view.angleResizeObserver.disconnect();
    view.angleResizeObserver = null;
    if (view.videoElement) {
      view.videoElement.pause();
      view.videoElement.remove();
    }
    if (view.url) URL.revokeObjectURL(view.url);
    view.url = null;
    view.videoElement = null;
  }

  function open() {
    var overlay = $('#gait-overlay');
    overlay.style.display = 'block';
    if (!state.session) state.session = createSession();
    state.phase = PHASE.UPLOAD;
    render();
    if (!state.resumeReady) restoreDraft();
  }

  function close() {
    if (state.session) ['left', 'right'].forEach(function (side) { releaseView(state.session.views[side]); });
    state.results = null;
    state.session = null;
    state.resumeReady = false;
    state.phase = PHASE.UPLOAD;
    document.onkeydown = null;
    $('#gait-overlay').style.display = 'none';
    var page2 = document.getElementById('page2');
    if (page2) page2.style.display = 'flex';
  }

  function bindEvents() {
    $('#gait-close-btn').addEventListener('click', close);
    $('#gait-history-btn').addEventListener('click', renderHistory);
    $('#gait-history-close').addEventListener('click', function () { $('#gait-history-overlay').style.display = 'none'; });
    $('#gait-export-pdf').addEventListener('click', function () {
      if (!state.results) return;
      if (state.results.type === 'gait-confirmed-report') window.__gaitReportV2.exportPDF(state.results);
      else window.__gaitReport.exportPDF(state.results);
    });
    $('#gait-export-csv').addEventListener('click', function () { if (state.results) window.__gaitReportV2.exportCSV(state.results); });
    $('#gait-export-json').addEventListener('click', function () { if (state.results) window.__gaitReportV2.exportJSON(state.results); });
    var qr = $('#gait-qr-btn');
    if (qr) qr.style.display = 'none';
  }

  window.__gaitAnalysis = {
    open: open,
    close: close,
    processVideo: analyzeSide,
    showReview: showReview,
    showReport: showReport,
    renderResults: showReport,
    render: render,
    saveAssessment: saveAssessment,
    getState: function () { return state; },
    PHASE: PHASE
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEvents);
  else bindEvents();
})();
