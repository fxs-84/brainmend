/* global window, document, navigator, MediaRecorder, URL, FileReader, requestAnimationFrame, setTimeout, setInterval, clearInterval */
/**
 * gait-analysis.js — 步态分析主控 IIFE
 *
 * 5 阶段状态机: INTRO → CALIBRATION → CAPTURE → PROCESSING → RESULTS → REPORT
 *  - INTRO: 欢迎 + 标定/录制/上传三个入口
 *  - CALIBRATION: 在摄像头预览上点击 2 点 (1 米标尺)
 *  - CAPTURE: MediaRecorder 录制 10s, 或 FileReader 加载上传文件
 *  - PROCESSING: 懒加载 TF.js + MoveNet → 逐帧姿势检测
 *  - RESULTS: 8 项参数仪表盘 + 步态分类
 *  - REPORT: 详细分标签报告 (由 gait-report.js 渲染)
 *
 * 全局 API: window.__gaitAnalysis.{open, close, processVideo, exportResults, ...}
 */
(function () {
  'use strict';

  if (!window.__gaitParams) {
    console.error('[gait-analysis] __gaitParams not loaded — load gait-params.js first');
    return;
  }

  // ============================================================
  // 状态机
  // ============================================================
  var PHASE = { INTRO: 'intro', CALIBRATION: 'calibration', CAPTURE: 'capture', PROCESSING: 'processing', RESULTS: 'results' };
  var state = {
    phase: PHASE.INTRO,
    videoElement: null,
    mediaStream: null,
    mediaRecorder: null,
    recordedChunks: [],
    recordedBlob: null,
    recordedURL: null,
    videoDuration: 0,
    scale: 0,
    calibration: { p1: null, p2: null, scale: 0, heightCm: 170, method: null },
    capturedFrames: [],   // [{t, keypoints:[{x,y,score,name}]}]
    fps: 30,
    results: null,        // {parameters, asymmetries, classification, neuro, ...}
    processingProgress: 0,
    errorMessage: null,
    cameraDevices: [],    // [{deviceId, label, facingHint}]
    selectedDeviceId: null,
    cameraFacing: 'environment',  // 'environment' 后置 / 'user' 前置 (移动设备默认值)
    cameraSide: 'right'          // 摄像头在患者哪一侧: 'left' / 'right'
  };

  // ============================================================
  // TF.js 懒加载
  // ============================================================
  var TFJS_TF_URL     = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js';
  var TFJS_TF_MIRRORS = [
    'https://unpkg.com/@tensorflow/tfjs@4.17.0/dist/tf.min.js',
    'https://cdn.bootcdn.net/ajax/libs/tensorflow/4.17.0/tf.min.js'
  ];
  var TFJS_POSE_URL   = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js';
  var TFJS_POSE_MIRRORS = [
    'https://unpkg.com/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js'
  ];
  var detectorPromise = null;
  var tfPromise       = null;

  var SCRIPT_LOAD_TIMEOUT = 18000;  // 18s 超时 (国内 CDN 较慢)

  function loadScriptOnce(src, timeoutMs) {
    timeoutMs = timeoutMs || SCRIPT_LOAD_TIMEOUT;
    return new Promise(function (resolve, reject) {
      var key = src.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 80);
      var exists = document.querySelector('script[data-src-key="' + key + '"]');
      if (exists) {
        if (exists.dataset.loaded === '1') return resolve();
        var t = setTimeout(function () { reject(new Error('Script load timeout: ' + src.substring(0,60))); }, timeoutMs);
        exists.addEventListener('load', function () { clearTimeout(t); resolve(); });
        exists.addEventListener('error', function () { clearTimeout(t); reject(new Error('Failed: ' + src.substring(0,60))); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.srcKey = key;
      var t = setTimeout(function () {
        s.onload = null; s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('Script load timeout: ' + src.substring(0, 60)));
      }, timeoutMs);
      s.onload = function () { clearTimeout(t); s.dataset.loaded = '1'; resolve(); };
      s.onerror = function () { clearTimeout(t); reject(new Error('Failed: ' + src.substring(0, 60))); };
      document.head.appendChild(s);
    });
  }

  // 多镜像尝试加载
  function loadScriptWithFallback(urls, label) {
    var idx = 0;
    function tryNext(err) {
      if (idx >= urls.length) return Promise.reject(err || new Error('All CDN mirrors failed for ' + label));
      console.log('[gait] loading ' + label + ' from', urls[idx].substring(0, 50));
      return loadScriptOnce(urls[idx]).catch(function (e) {
        console.warn('[gait] CDN mirror ' + idx + ' failed for ' + label, e.message);
        idx++;
        return tryNext(e);
      });
    }
    return tryNext();
  }

  function loadTensorFlow() {
    if (tfPromise) return tfPromise;
    var urls = [TFJS_TF_URL].concat(TFJS_TF_MIRRORS);
    tfPromise = loadScriptWithFallback(urls, 'TF.js').then(function () {
      if (!window.tf) throw new Error('TF.js not available after load — 请检查网络连接');
      return window.tf;
    });
    return tfPromise;
  }

  function loadPoseDetection() {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (async function () {
      await loadTensorFlow();
      var poseUrls = [TFJS_POSE_URL].concat(TFJS_POSE_MIRRORS);
      await loadScriptWithFallback(poseUrls, 'pose-detection');
      if (!window.poseDetection) throw new Error('PoseDetection 模型未就绪 — 请刷新重试');
      var detector = await window.poseDetection.createDetector(
        window.poseDetection.SupportedModels.MoveNet,
        { modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      return detector;
    })();
    return detectorPromise;
  }

  // ============================================================
  // 工具函数
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
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }
  function html(str) {
    var t = document.createElement('template');
    t.innerHTML = str.trim();
    return t.content.firstChild;
  }
  function setBody(htmlStr) { $('#gait-body').innerHTML = htmlStr; }
  function setPhase(p) { state.phase = p; renderPhase(); }
  function fmtNum(v, d) { if (v == null || isNaN(v)) return '—'; return Number(v).toFixed(d == null ? 2 : d); }
  function fmtPct(v) { return fmtNum(v * 100, 1) + '%'; }
  function statusColor(s) { return ({ normal: '#10b981', mild: '#f59e0b', moderate: '#f97316', severe: '#dc2626', unknown: '#9ca3af' })[s] || '#9ca3af'; }
  function statusText(s) { return ({ normal: '正常', mild: '轻度异常', moderate: '中度异常', severe: '重度异常', unknown: '未测量' })[s] || '—'; }

  // ============================================================
  // 摄像头设备枚举与选择
  // ============================================================
  function inferFacingFromLabel(label) {
    var s = (label || '').toLowerCase();
    if (/back|rear|environment|后置|背面/i.test(s)) return 'environment';
    if (/front|user|前置|正面|自拍/i.test(s)) return 'user';
    return null;
  }

  async function enumerateCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      state.cameraDevices = [];
      return [];
    }
    try {
      // 部分浏览器需要先获取一次权限才能看到完整 label
      if (!state.mediaStream) {
        try {
          var tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tmp.getTracks().forEach(function (t) { t.stop(); });
        } catch (e) { /* 静默, 后续启动摄像头会再次尝试 */ }
      }
      var devs = await navigator.mediaDevices.enumerateDevices();
      state.cameraDevices = devs
        .filter(function (d) { return d.kind === 'videoinput'; })
        .map(function (d, i) {
          var facing = inferFacingFromLabel(d.label);
          return {
            deviceId: d.deviceId,
            label: d.label || ('摄像头 ' + (i + 1)),
            facingHint: facing,
            index: i
          };
        });
      return state.cameraDevices;
    } catch (e) {
      console.warn('[gait] enumerateDevices failed', e);
      state.cameraDevices = [];
      return [];
    }
  }

  function buildCameraConstraints() {
    var constraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    if (state.selectedDeviceId) {
      constraints.video.deviceId = { exact: state.selectedDeviceId };
    } else {
      constraints.video.facingMode = { ideal: state.cameraFacing };
    }
    return constraints;
  }

  async function startCamera() {
    try {
      if (state.mediaStream) stopCamera();
      // 重新枚举设备 (label 在权限授予后会更新)
      await enumerateCameras();
      var constraints = buildCameraConstraints();
      state.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      // 拿到实际 track 的 settings, 反查 deviceId (供 UI 高亮)
      var track = state.mediaStream.getVideoTracks()[0];
      if (track && track.getSettings) {
        var settings = track.getSettings();
        if (settings.deviceId && settings.deviceId !== state.selectedDeviceId) {
          state.selectedDeviceId = settings.deviceId;
        }
      }
      var v = $('#gait-camera-video');
      if (v) {
        v.srcObject = state.mediaStream;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        // 视频流就绪后检测方向
        checkOrientation();
        v.addEventListener('loadedmetadata', checkOrientation);
      }
      return true;
    } catch (e) {
      console.error('[gait] camera error', e);
      // 后置失败时降级尝试前置
      if (state.cameraFacing === 'environment' && !state.selectedDeviceId) {
        try {
          state.cameraFacing = 'user';
          var fb = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          state.mediaStream = fb;
          var v = $('#gait-camera-video');
          if (v) { v.srcObject = fb; v.muted = true; v.playsInline = true; await v.play(); checkOrientation(); }
          console.warn('[gait] fallback to front camera');
          return true;
        } catch (e2) { /* fall through */ }
      }
      state.errorMessage = '无法访问摄像头: ' + (e.message || e.name);
      return false;
    }
  }

  async function selectCamera(deviceId) {
    state.selectedDeviceId = deviceId;
    // 如果有 hint, 同步 facing
    var dev = state.cameraDevices.find(function (d) { return d.deviceId === deviceId; });
    if (dev && dev.facingHint) state.cameraFacing = dev.facingHint;
    if (state.mediaStream) {
      return await startCamera();
    }
    return true;
  }

  function renderCameraSelector() {
    if (!state.cameraDevices || state.cameraDevices.length <= 1) return '';
    var buttons = state.cameraDevices.map(function (d) {
      var isActive = (state.selectedDeviceId === d.deviceId) ||
                     (!state.selectedDeviceId && d.facingHint === state.cameraFacing);
      var hint = d.facingHint === 'environment' ? '后置' :
                 d.facingHint === 'user' ? '前置' : '';
      var label = hint ? (hint + ' · ' + d.label) : d.label;
      return '<button class="gait-cam-btn" data-device-id="' + d.deviceId + '" ' +
             'style="padding:6px 12px;margin:0 4px 4px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid ' +
             (isActive ? '#43E97B' : 'rgba(0,0,0,0.15)') + ';background:' +
             (isActive ? 'linear-gradient(135deg,#43E97B,#38F9D7)' : 'rgba(0,0,0,0.06)') +
             ';color:' + (isActive ? '#fff' : '#333') + ';font-weight:' + (isActive ? '600' : '400') + ';">' +
             '📷 ' + label + '</button>';
    }).join('');
    return '<div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:6px;">' +
           '<div style="font-size:12px;color:#666;margin-bottom:4px;">📷 摄像头选择 (点击切换前后置)</div>' +
           '<div id="gait-camera-buttons" style="display:flex;flex-wrap:wrap;">' + buttons + '</div>' +
           '</div>';
  }

  function attachCameraSelectorHandlers() {
    var container = $('#gait-camera-buttons');
    if (!container) return;
    container.querySelectorAll('.gait-cam-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var devId = btn.getAttribute('data-device-id');
        if (devId === state.selectedDeviceId) return;
        selectCamera(devId).then(function (ok) {
          if (ok) {
            // 重新渲染按钮高亮 + 重新绘制标定点 (摄像头可能换了)
            if (state.phase === PHASE.CALIBRATION) {
              renderCalibration();
            }
          }
        });
      });
    });
  }

  // 摄像方位选择器 — 告知系统摄像头在患者哪一侧 (用于左右标签校正)
  function renderCameraSideSelector() {
    var isLeft = state.cameraSide === 'left';
    var isRight = state.cameraSide === 'right';
    return '<div style="background:#fff;padding:10px 14px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:12px;color:#666;">' +
      '<span style="font-weight:600;">📷 摄像头方位:</span>' +
      '<button class="gait-side-btn" data-side="left" style="padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;border:1px solid ' + (isLeft ? '#43E97B' : 'rgba(0,0,0,0.15)') + ';background:' + (isLeft ? 'linear-gradient(135deg,#43E97B,#38F9D7)' : 'rgba(0,0,0,0.04)') + ';color:' + (isLeft ? '#fff' : '#666') + ';">患者左侧</button>' +
      '<button class="gait-side-btn" data-side="right" style="padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;border:1px solid ' + (isRight ? '#43E97B' : 'rgba(0,0,0,0.15)') + ';background:' + (isRight ? 'linear-gradient(135deg,#43E97B,#38F9D7)' : 'rgba(0,0,0,0.04)') + ';color:' + (isRight ? '#fff' : '#666') + ';">患者右侧</button>' +
      '<span style="font-size:11px;opacity:0.7;">用于校正左右腿识别</span>' +
    '</div>';
  }
  function attachCameraSideHandlers() {
    document.querySelectorAll('.gait-side-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.cameraSide = btn.dataset.side;
        renderPhase();
      });
    });
  }

  function stopCamera() {
    if (_orientationWarnTimer) {
      clearInterval(_orientationWarnTimer);
      _orientationWarnTimer = null;
    }
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(function (t) { t.stop(); });
      state.mediaStream = null;
    }
    var v = $('#gait-camera-video');
    if (v) { v.srcObject = null; v.pause(); }
  }

  // 检测摄像头方向, 竖屏时显示横置提示
  var _orientationWarnTimer = null;
  function checkOrientation() {
    var v = $('#gait-camera-video');
    var warn = $('#gait-portrait-warn');
    if (!v || !warn || !v.videoWidth) return;
    // portrait = 高 > 宽 (手机竖持)
    if (v.videoHeight > v.videoWidth) {
      warn.style.display = 'block';
      // 每 2 秒重检一次, 用户横置后自动消失
      if (!_orientationWarnTimer) {
        _orientationWarnTimer = setInterval(checkOrientation, 2000);
      }
    } else {
      warn.style.display = 'none';
      if (_orientationWarnTimer) {
        clearInterval(_orientationWarnTimer);
        _orientationWarnTimer = null;
      }
    }
  }

  // ============================================================
  // 录制
  // ============================================================
  function startRecording() {
    if (!state.mediaStream) return;
    state.recordedChunks = [];
    try {
      state.mediaRecorder = new MediaRecorder(state.mediaStream, { mimeType: 'video/webm;codecs=vp8' });
    } catch (e) {
      try { state.mediaRecorder = new MediaRecorder(state.mediaStream); }
      catch (e2) { state.errorMessage = '当前浏览器不支持 MediaRecorder'; return; }
    }
    state.mediaRecorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) state.recordedChunks.push(e.data);
    };
    state.mediaRecorder.onstop = function () {
      state.recordedBlob = new Blob(state.recordedChunks, { type: 'video/webm' });
      if (state.recordedURL) URL.revokeObjectURL(state.recordedURL);
      state.recordedURL = URL.createObjectURL(state.recordedBlob);
      onRecordingComplete();
    };
    state.mediaRecorder.start();
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
  }

  function onRecordingComplete() {
    var v = $('#gait-preview-video');
    if (v) {
      v.src = state.recordedURL;
      v.muted = true;
      v.onloadedmetadata = function () {
        state.videoDuration = v.duration;
        renderCaptureComplete();
      };
    }
  }

  // ============================================================
  // 文件上传
  // ============================================================
  // 检测浏览器是否支持指定 MIME/codec 组合 (用来判断手机 HEVC/MOV 在桌面 Chrome 是否可播)
  function checkCodecSupport(file) {
    return new Promise(function (resolve) {
      var v = document.createElement('video');
      v.muted = true;
      v.preload = 'metadata';
      var mime = (file.type || '').toLowerCase();
      // 构造多个候选 canPlayType 测试
      var tests = [];
      if (mime.indexOf('mp4') !== -1 || mime.indexOf('quicktime') !== -1 || mime.indexOf('mov') !== -1) {
        tests.push('video/mp4; codecs="avc1.42E01E"');   // H.264 baseline
        tests.push('video/mp4; codecs="hvc1"');           // HEVC (iPhone 7+ 默认)
        tests.push('video/quicktime; codecs="hvc1"');     // iOS MOV + HEVC
        tests.push('video/mp4');
        tests.push('video/quicktime');
      } else if (mime.indexOf('webm') !== -1) {
        tests.push('video/webm; codecs="vp8"');
        tests.push('video/webm; codecs="vp9"');
        tests.push('video/webm');
      }
      var lastResult = '';
      var i = 0;
      function tryNext() {
        if (i >= tests.length) {
          v.remove();
          resolve({ supported: true, codec: lastResult || 'unknown' });
          return;
        }
        var r = v.canPlayType(tests[i]);
        if (r === 'probably' || r === 'maybe') {
          v.remove();
          resolve({ supported: true, codec: tests[i] + ' (' + r + ')' });
        } else {
          lastResult = tests[i] + '=' + r;
          i++;
          tryNext();
        }
      }
      tryNext();
    });
  }

  function showUploadError(msg) {
    // 把错误信息显示到 upload-panel 上, 不依赖全局 state.errorMessage 渲染
    var panel = $('#gait-upload-panel');
    if (!panel) return;
    var existing = panel.querySelector('.gait-upload-err');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.className = 'gait-upload-err';
    div.style.cssText = 'margin-top:16px;padding:14px;background:#fee;border:1px solid #fcc;border-radius:8px;color:#991b1b;font-size:13px;line-height:1.6;';
    div.innerHTML = msg;
    panel.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.remove(); }, 15000);
  }

  function handleFileUpload(file) {
    if (!file || !file.type.startsWith('video/')) {
      showUploadError('请上传有效的视频文件 (mp4, webm, mov)');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showUploadError('视频文件过大 (>100MB), 请压缩后重试');
      return;
    }
    // 检查浏览器是否支持这个视频的编解码器 (iPhone HEVC/MOV 在桌面 Chrome 经常不能解码)
    checkCodecSupport(file).then(function (probe) {
      if (!probe.supported) {
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        var hint = '';
        if (ext === 'mov' || /iphone|ipados|ios/i.test(file.type) || /hvc1|hev1|h265/i.test(file.type)) {
          hint = '<br><br><b>💡 解决方案</b>:<br>' +
                 '1. 在 <b>手机端直接录制并分析</b> (iPhone Safari 完整支持 HEVC)<br>' +
                 '2. 用 FFmpeg 转码: <code>ffmpeg -i input.mov -c:v libx264 -c:a aac output.mp4</code><br>' +
                 '3. 在 iPhone 设置 → 相机 → 格式 → 选<b>兼容性最佳</b> (录成 H.264/MP4)<br>' +
                 '4. 上传前用 HandBrake / 微信"文件传输助手"压缩转码';
        } else {
          hint = '<br><br>当前浏览器不支持该视频的编码格式, 请换浏览器或转码后重试';
        }
        showUploadError('<b>视频格式不被当前浏览器支持</b><br>' +
                        '文件: ' + file.name + ' (' + Math.round(file.size / 1024 / 1024) + ' MB, ' + (file.type || 'unknown') + ')<br>' +
                        '浏览器测试结果: ' + (probe.codec || 'unsupported') + hint);
        return;
      }
      if (state.recordedURL) URL.revokeObjectURL(state.recordedURL);
      state.recordedURL = URL.createObjectURL(file);
      state.recordedBlob = file;
      var v = $('#gait-preview-video');
      if (v) {
        v.src = state.recordedURL;
        v.muted = true;
        v.onloadedmetadata = function () {
          state.videoDuration = v.duration;
          renderCaptureComplete();
        };
        v.onerror = function () {
          // 浏览器能识别 MIME 但实际解码失败 (常见: HEVC 标记为 mp4 但内容是 hvc1)
          showUploadError('<b>视频解码失败</b> — ' + file.name + '<br>' +
                          '浏览器识别了格式但实际解码报错, 很可能是 <b>HEVC/H.265</b> 编码<br>' +
                          '在桌面 Chrome 不支持, 请在手机上直接分析, 或转码为 H.264/MP4 后重试');
        };
      }
    });
  }

  // ============================================================
  // 帧提取
  // ============================================================
  // 在视频元素上 seek 到指定时间, 截取缩略图 (小尺寸 JPEG dataURL)
  // 防御性: 任何异常/超时都 resolve(null), 永远不挂起
  function captureSnapshot(videoEl, timeSec) {
    return new Promise(function (resolve) {
      if (!videoEl || !videoEl.duration || videoEl.duration <= 0) {
        resolve(null);
        return;
      }
      var done = false;
      function finish(val) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        videoEl.removeEventListener('seeked', onSeeked);
        resolve(val);
      }
      function onSeeked() {
        try {
          var w = videoEl.videoWidth || 320;
          var h = videoEl.videoHeight || 240;
          var maxW = 240;
          var scale = Math.min(1, maxW / w);
          var cw = Math.round(w * scale);
          var ch = Math.round(h * scale);
          var c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          c.getContext('2d').drawImage(videoEl, 0, 0, cw, ch);
          finish({ dataUrl: c.toDataURL('image/jpeg', 0.6), w: cw, h: ch });
        } catch (e) {
          finish(null);
        }
      }
      videoEl.addEventListener('seeked', onSeeked);
      var timer = setTimeout(function () { finish(null); }, 800);
      try {
        var target = Math.max(0, Math.min(timeSec, (videoEl.duration || 1) - 0.001));
        // 微调 ±0.001s 强制触发 seeked 事件 (currentTime 未变化时不触发)
        if (Math.abs((videoEl.currentTime || 0) - target) < 0.001) {
          target = target > 0 ? target - 0.001 : target + 0.001;
        }
        videoEl.currentTime = target;
      } catch (e) {
        finish(null);
      }
    });
  }

  // 从 phaseTimestamps 选出每脚首个完整周期, 逐个 seek 截帧
  // 永远不抛错, 失败返回 [] 不阻塞主流程
  async function capturePhaseSnapshots(videoEl, phaseList) {
    try {
      if (!phaseList || !phaseList.length || !videoEl) return [];
      var firstBySide = { left: null, right: null };
      for (var i = 0; i < phaseList.length; i++) {
        var side = phaseList[i].side;
        if (!firstBySide[side]) firstBySide[side] = phaseList[i].cycleIndex;
      }
      var targets = phaseList.filter(function (p) {
        return p.cycleIndex === firstBySide[p.side];
      });
      var snapshots = [];
      for (var i = 0; i < targets.length; i++) {
        var p = targets[i];
        var snap = await captureSnapshot(videoEl, p.time);
        if (snap) {
          snapshots.push({
            cycleIndex: p.cycleIndex,
            side: p.side,
            phase: p.phase,
            label: p.label,
            time: p.time,
            stance: p.stance,
            imageData: snap.dataUrl,
            w: snap.w, h: snap.h
          });
        }
      }
      return snapshots;
    } catch (e) {
      console.warn('[gait] capturePhaseSnapshots error (non-fatal):', e.message);
      return [];
    }
  }

  // 等待视频首帧解码完成 (loadeddata 事件 = 元数据 + 首帧均 ready)
  function waitForLoadedData(videoEl, timeoutMs) {
    return new Promise(function (resolve) {
      if (videoEl.readyState >= 2) { resolve(); return; }
      var done = false;
      function finish() { if (!done) { done = true; videoEl.removeEventListener('loadeddata', onLoaded); resolve(); } }
      function onLoaded() { finish(); }
      videoEl.addEventListener('loadeddata', onLoaded);
      setTimeout(finish, timeoutMs || 5000);
    });
  }

  function extractFrames(videoEl, fps) {
    return new Promise(function (resolve, reject) {
      fps = fps || 30;
      var duration = videoEl.duration;
      if (!isFinite(duration) || duration <= 0) return reject(new Error('Invalid video duration'));
      var frameCount = Math.min(Math.floor(duration * fps), 600);
      if (frameCount <= 0) return reject(new Error('Invalid frameCount: ' + frameCount));
      var actualFps = frameCount / duration;
      var frames = [];
      var canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      var ctx = canvas.getContext('2d');
      var idx = 0;
      var finished = false;
      var globalTimeout = null;

      function captureCurrentFrame() {
        if (finished) return;
        if (idx >= frameCount) {
          finished = true;
          if (globalTimeout) clearTimeout(globalTimeout);
          videoEl.pause();
          videoEl.removeEventListener('seeked', onSeeked);
          resolve(frames);
          return;
        }
        try {
          if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            frames.push({ t: idx / actualFps, imageData: dataUrl, w: canvas.width, h: canvas.height });
          }
        } catch (e) {
          console.warn('[gait] frame capture error at', idx, e.message);
        }
        idx++;
        updateProcessingProgress(0.05 + (idx / frameCount) * 0.2);
        if (idx >= frameCount) {
          finished = true;
          if (globalTimeout) clearTimeout(globalTimeout);
          videoEl.pause();
          videoEl.removeEventListener('seeked', onSeeked);
          resolve(frames);
          return;
        }
        setTimeout(function () {
          if (finished) return;
          try {
            // 微调 ±0.005s 强制触发 seeked 事件 (currentTime 未变化时不触发)
            var target = idx / actualFps;
            if (Math.abs((videoEl.currentTime || 0) - target) < 0.005) {
              target = target > 0 ? target - 0.005 : target + 0.005;
            }
            videoEl.currentTime = target;
          } catch (e) { console.warn('[gait] seek error', e.message); }
        }, 10);
      }

      function onSeeked() {
        if (finished) return;
        captureCurrentFrame();
      }

      videoEl.addEventListener('seeked', onSeeked);
      videoEl.addEventListener('error', function (e) {
        if (finished) return;
        finished = true;
        if (globalTimeout) clearTimeout(globalTimeout);
        reject(new Error('Video error during frame extraction'));
      });

      // 全局超时: 90s (移动端 seek 可能每帧 200-500ms, 留足余量)
      globalTimeout = setTimeout(function () {
        if (finished) return;
        videoEl.removeEventListener('seeked', onSeeked);
        // 优雅降级: 如果已捕获足够帧 (>一半), 用已有帧继续处理, 不报错
        if (frames.length >= Math.max(10, frameCount * 0.4)) {
          console.warn('[gait] frame extraction partial: ' + frames.length + '/' + frameCount + ' (timeout, using partial)');
          finished = true;
          videoEl.pause();
          resolve(frames);
        } else {
          finished = true;
          reject(new Error('帧提取超时且帧数不足 (' + frames.length + '/' + frameCount + '), 请尝试用较短视频或降低分辨率'));
        }
      }, 90000);

      // 启动 seek 循环 (currentTime=0 nudge 强制触发首次 seeked)
      setTimeout(function () {
        if (finished) return;
        try {
          var target = idx / actualFps + 0.005;  // nudge +5ms 强制 seeked 触发
          videoEl.currentTime = target;
        } catch (e) { reject(new Error('Seek init failed: ' + e.message)); }
      }, 50);
    });
  }

  // ============================================================
  // 姿势检测
  // ============================================================
  async function detectPoses(frames) {
    var detector = await loadPoseDetection();
    var keypointFrames = [];
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      // 用 Image 对象加载 dataUrl
      var img = await new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { resolve(null); };
        im.src = f.imageData;
      });
      if (!img) {
        keypointFrames.push({ t: f.t, keypoints: [] });
        continue;
      }
      try {
        var poses = await detector.estimatePoses(img, { flipHorizontal: false });
        var pose = poses && poses[0];
        var kps = [];
        if (pose && pose.keypoints) {
          kps = pose.keypoints.map(function (k) {
            return { x: k.x, y: k.y, score: k.score || 0, name: k.name || '' };
          });
        }
        keypointFrames.push({ t: f.t, keypoints: kps });
      } catch (e) {
        console.warn('[gait] pose detect error at frame', i, e);
        keypointFrames.push({ t: f.t, keypoints: [] });
      }
      updateProcessingProgress(0.3 + (i + 1) / frames.length * 0.6);
    }
    return keypointFrames;
  }

  function updateProcessingProgress(p) {
    state.processingProgress = p;
    var bar = $('#gait-progress-bar');
    var txt = $('#gait-progress-text');
    if (bar) bar.style.width = (p * 100) + '%';
    if (txt) txt.textContent = '分析中... ' + Math.round(p * 100) + '%';
  }

  // ============================================================
  // 主处理流程
  // ============================================================
  async function processVideo() {
    if (!state.recordedBlob) return;
    if (!state.calibration.scale) {
      state.errorMessage = '请先完成标定 (点击地面 1 米标尺的两个端点)';
      setPhase(PHASE.CALIBRATION);
      return;
    }
    setPhase(PHASE.PROCESSING);
    updateProcessingProgress(0.02);
    $('#gait-progress-title').textContent = '加载视频...';

    try {
      // 1. 加载视频 — 必须挂到 DOM (隐藏), 浏览器才会解码 detached video 不解码
      var v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      v.src = state.recordedURL;
      document.body.appendChild(v);
      await new Promise(function (resolve, reject) {
        v.onloadedmetadata = resolve;
        v.onerror = function () { reject(new Error('Video load failed')); };
      });
      state.videoDuration = v.duration;
      updateProcessingProgress(0.10);

      // 等首帧 ready (loadeddata 事件 = 元数据 + 首帧均解码)
      await waitForLoadedData(v, 5000);
      if (v.videoWidth === 0 || v.videoHeight === 0) {
        throw new Error('视频首帧未解码 (videoWidth=' + (v.videoWidth || 0) + '), 请重新上传或换视频');
      }

      // 2. 提取帧 — 15fps (足够步态分析, 手机 seek 性能下 30fps 会超时)
      $('#gait-progress-title').textContent = '提取视频帧...';
      var frames = await extractFrames(v, 15);
      updateProcessingProgress(0.25);

      if (frames.length < 5) throw new Error('视频帧数过少 (需要至少 5 帧, 实际 ' + frames.length + ')');

      // 3. 加载 AI 模型 + 姿势检测
      $('#gait-progress-title').textContent = '加载 AI 姿势识别模型...';
      $('#gait-progress-text').textContent = '首次使用需下载 ~8MB 模型, 国内用户可能需要 15-30 秒';
      updateProcessingProgress(0.28);
      var keypointFrames = await detectPoses(frames);
      updateProcessingProgress(0.90);

      // 3b. 左右标签校正 — 根据摄像头侧+行走方向判断是否需要交换 MoveNet 标签
      var walkDir = window.__gaitParams.detectWalkingDirection(keypointFrames);
      var sideResolution = window.__gaitParams.resolveAnatomicalSides(keypointFrames, state.cameraSide, walkDir);
      if (sideResolution.swapNeeded) {
        keypointFrames = window.__gaitParams.swapKeypointLabels(keypointFrames);
      }
      updateProcessingProgress(0.92);

      // 4. 计算步态参数
      state.capturedFrames = keypointFrames;
      var params = window.__gaitParams.computeAllParams(keypointFrames, state.calibration.scale);
      if (params.error) throw new Error('参数计算失败: ' + params.error);

      // 4b. 步态周期时相 (8 时相 Rancho Los Amigos) — 依赖参数计算后的 heelStrikes
      updateProcessingProgress(0.94);
      var leftHS  = (params.heelStrikes && params.heelStrikes.left)  || [];
      var rightHS = (params.heelStrikes && params.heelStrikes.right) || [];
      var leftTO  = window.__gaitParams.detectToeOffs(keypointFrames, 'left',  leftHS);
      var rightTO = window.__gaitParams.detectToeOffs(keypointFrames, 'right', rightHS);
      var gaitPhases = window.__gaitParams.computeGaitCyclePhases(keypointFrames, leftHS, leftTO, rightHS, rightTO);

      // 4c. 时相截图 — 从 HS/TO 推算 8 时相时间戳, 截取视频帧供报告可视化验证
      $('#gait-progress-title').textContent = '提取时相截图...';
      var phaseTimestamps = window.__gaitParams.computePhaseTimestamps(leftHS, leftTO, rightHS, rightTO);
      var phaseSnapshots = [];
      try {
        phaseSnapshots = await capturePhaseSnapshots(v, phaseTimestamps);
      } catch (e) {
        console.warn('[gait] phase snapshots failed (non-fatal):', e.message);
        phaseSnapshots = [];
      }
      updateProcessingProgress(0.96);

      var classification = window.__gaitParams.classifyGait(params);
      var neuro = window.__gaitParams.getNeuroLocalization(classification.primary);
      var rehab = window.__gaitParams.getRehabSuggestions(classification.primary);

      state.results = {
        timestamp: Date.now(),
        duration: state.videoDuration,
        frameCount: keypointFrames.length,
        fps: keypointFrames.length / state.videoDuration,
        calibration: state.calibration,
        parameters: params.parameters,
        asymmetries: params.asymmetries,
        extras: params.extras,
        armSwing: params.armSwing,
        elbowSwing: params.elbowSwing,
        kneeBraking: { left: params.kneeLeft, right: params.kneeRight },
        ankleKinematics: { left: params.ankleLeft, right: params.ankleRight },
        sideResolution: sideResolution,
        walkingDirection: walkDir,
        brainProfile: window.__gaitParams.computeBrainGaitProfile(
          params.armSwing, params.elbowSwing, params.kneeLeft, params.kneeRight, params
        ),
        events: {
          leftHeelStrikes: leftHS,
          rightHeelStrikes: rightHS,
          leftToeOffs: leftTO,
          rightToeOffs: rightTO
        },
        gaitPhases: gaitPhases,
        phaseSnapshots: phaseSnapshots,
        classification: classification,
        neuro: neuro,
        rehab: rehab
      };

      // 5. 持久化
      saveAssessment(state.results);

      updateProcessingProgress(1.0);
      setPhase(PHASE.RESULTS);

      // 6. 清理 DOM 中的临时 video 元素
      try { if (v.parentNode) v.parentNode.removeChild(v); } catch (e) {}
      try { URL.revokeObjectURL(v.src); } catch (e) {}
    } catch (e) {
      console.error('[gait] process error', e);
      var msg = e.message || String(e);
      // 按失败类型给出具体可操作的提示
      if (msg.indexOf('CDN') !== -1 || msg.indexOf('Failed') !== -1 || msg.indexOf('timeout') !== -1) {
        state.errorMessage = 'AI 模型加载失败 — 网络不通或 CDN 超时。请检查网络后刷新重试。';
      } else if (msg.indexOf('TF.js') !== -1 || msg.indexOf('poseDetection') !== -1) {
        state.errorMessage = 'AI 姿势识别模型未就绪 — 请刷新页面后重试。';
      } else if (msg.indexOf('insufficient_steps') !== -1) {
        state.errorMessage = '未检测到足够的步态周期。<br><br><b>可能原因 & 解决方法</b>:<br>' +
          '1. 视频中人物不全 — 请确保从头到脚都入镜<br>' +
          '2. 拍摄角度偏 — 摄像头应在斜前方约45°（非正侧面）<br>' +
          '3. 光线不足 — 请在明亮环境下拍摄<br>' +
          '4. 行走步数不足 — 至少走3步以上<br>' +
          '5. 人物太小 — 离摄像头再近一些 (2-4米)';
      } else if (msg.indexOf('首帧未解码') !== -1) {
        state.errorMessage = '无法解码视频。<br><br>手机录制的 HEVC/MOV 视频在桌面 Chrome 可能不兼容。<br>' +
          '<b>解决方案</b>: 在手机上直接打开此页面分析, 或转码为 H.264/MP4 后再上传。';
      } else if (msg.indexOf('帧数过少') !== -1) {
        state.errorMessage = '视频帧数不足, 请确保视频 > 2 秒且人物在画面中行走。';
      } else {
        state.errorMessage = '分析失败: ' + msg + '<br><br>请确认视频中有人行走, 且拍摄角度为斜前方约45°。如持续失败, 请尝试重录。';
      }
      setPhase(PHASE.CAPTURE);
    }
  }

  // ============================================================
  // localStorage 持久化
  // ============================================================
  var STORAGE_KEY = 'gait_assessment_log';

  function saveAssessment(r) {
    try {
      var log = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      log.push(r);
      // 上限保留 50 条
      if (log.length > 50) log = log.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch (e) {
      console.warn('[gait] saveAssessment error', e);
    }
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function deleteHistoryRecord(idx) {
    try {
      var log = loadHistory();
      if (idx < 0 || idx >= log.length) return;
      log.splice(idx, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
      // 如果 state.results 指向被删除的记录, 也清掉
      if (state.results && state.results.timestamp === log[idx] && log[idx] === undefined) {
        state.results = null;
      }
    } catch (e) {
      console.warn('[gait] deleteHistoryRecord error', e.message);
    }
  }

  function clearAllHistory() {
    try { localStorage.removeItem(STORAGE_KEY); state.results = null; }
    catch (e) { console.warn('[gait] clearAllHistory error', e.message); }
  }

  // ============================================================
  // 阶段渲染
  // ============================================================
  function renderPhase() {
    if (!document.getElementById('gait-overlay')) return;
    // 标定/录制阶段使用紧凑 padding
    var isCompact = (state.phase === PHASE.CALIBRATION || state.phase === PHASE.CAPTURE);
    var body = $('#gait-body');
    body.style.padding = isCompact ? '10px 14px' : '20px';
    if (state.phase === PHASE.INTRO) renderIntro();
    else if (state.phase === PHASE.CALIBRATION) renderCalibration();
    else if (state.phase === PHASE.CAPTURE) renderCapture();
    else if (state.phase === PHASE.PROCESSING) renderProcessing();
    else if (state.phase === PHASE.RESULTS) renderResults();
    updateNavTabs();
  }

  function updateNavTabs() {
    var nav = $('#gait-nav');
    if (!nav) return;
    var tabs = [
      { id: 'overview', label: '总览', active: state.phase === PHASE.RESULTS }
    ];
    var html = '<span style="color:#fff;font-weight:700;font-size:14px;margin-right:8px;flex-shrink:0;">🚶 步态分析</span>';
    tabs.forEach(function (t) {
      html += '<span data-tab="' + t.id + '" style="background:' + (t.active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)') +
        ';border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap;flex-shrink:0;">' +
        t.label + '</span>';
    });
    nav.innerHTML = html;
  }

  function renderError() {
    if (!state.errorMessage) return '';
    return '<div style="background:#fee;border:1px solid #fcc;color:#c00;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:13px;">⚠️ ' + state.errorMessage + '</div>';
  }

  function clearError() { state.errorMessage = null; }

  function renderIntro() {
    var errHtml = renderError();
    clearError();
    setBody(
      '<div style="background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;padding:30px;border-radius:16px;margin-bottom:20px;">' +
        '<h2 style="margin:0 0 8px 0;font-size:24px;">🚶 步态分析系统</h2>' +
        '<p style="margin:0;font-size:14px;opacity:0.95;">基于 ANRM 肌骨神经康复体系的临床步态评估工具</p>' +
      '</div>' +
      errHtml +
      '<div style="background:#fff;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:16px;">' +
        '<h3 style="margin:0 0 12px 0;color:#1a1a2e;">📋 评估流程</h3>' +
        '<ol style="line-height:1.9;color:#444;padding-left:24px;margin:0;">' +
          '<li><b>身高标定</b>: 输入患者身高, 系统自动从视频画面识别头顶-踝关节像素距离</li>' +
          '<li><b>视频采集</b>: 手机置于斜前方 ~45° (非纯侧面), 录制 10-15 秒行走</li>' +
          '<li><b>AI 分析</b>: 自动提取 8 项步态参数 + 步态周期时相 + 模式分类</li>' +
          '<li><b>报告</b>: 步态参数 + 步态周期时相 + 神经定位 + 康复建议</li>' +
        '</ol>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '<button id="gait-start-calibration" style="flex:1;min-width:200px;padding:20px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:18px;font-weight:600;">📏 开始身高标定</button>' +
        '<button id="gait-skip-calibration" style="flex:1;min-width:200px;padding:20px;background:linear-gradient(135deg,#636e72,#2d3436);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:16px;">▶ 跳过标定 (使用默认比例)</button>' +
      '</div>' +
      '<div style="background:#f8f9fa;padding:16px;border-radius:8px;margin-top:16px;font-size:12px;color:#666;line-height:1.6;">' +
        '<b>💡 提示</b>: 手机放斜前方 ~45° 拍行走 (非纯侧面), 可同时捕捉前后+侧向运动, 比纯侧面精度提升 2-3 倍。默认比例假设 1 米 ≈ 130 像素。' +
      '</div>'
    );
    $('#gait-start-calibration').addEventListener('click', function () { setPhase(PHASE.CALIBRATION); });
    $('#gait-skip-calibration').addEventListener('click', function () {
      state.calibration.scale = 1 / 130;
      state.calibration.realMeters = 1.0;
      state.calibration.pixelDistance = 130;
      state.calibration.method = 'default';
      state.calibration.note = '使用默认比例 (未标定)';
      setPhase(PHASE.CAPTURE);
    });
  }

  function renderCalibration() {
    var errHtml = renderError();
    clearError();
    setBody(
      errHtml +
      renderCameraSelector() +
      renderCameraSideSelector() +
      '<div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;">' +
        '<span style="font-size:13px;color:#333;white-space:nowrap;">身高(cm):</span>' +
        '<input id="gait-cal-height" type="number" min="100" max="220" step="1" value="' + (state.calibration.heightCm || 170) + '" ' +
        'style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:15px;text-align:center;">' +
        '<button id="gait-cal-auto" style="padding:6px 16px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap;">&#x1f3af; 自动标定</button>' +
      '</div>' +
      '<div style="position:relative;background:#000;border-radius:8px;overflow:hidden;max-width:100%;">' +
        '<video id="gait-camera-video" autoplay muted playsinline style="display:block;width:100%;"></video>' +
        '<canvas id="gait-calibration-canvas" style="position:absolute;inset:0;cursor:crosshair;"></canvas>' +
        '<div id="gait-portrait-warn" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.82);color:#fff;padding:16px 28px;border-radius:12px;font-size:16px;font-weight:700;text-align:center;pointer-events:none;white-space:nowrap;border:2px solid #fbbf24;">&#x1f4f1;&#x21c4; 请将手机横置<br><span style="font-size:12px;font-weight:400;opacity:0.85;">斜前方~45°横屏拍摄精度最佳</span></div>' +
      '</div>' +
      '<div id="gait-calibration-status" style="margin:8px 0;padding:8px;background:#f0f2f5;border-radius:6px;font-size:12px;text-align:center;">点击「自动标定」检测头顶-踝关节距离</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="gait-cal-confirm" style="flex:2;padding:12px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;opacity:0.5;font-size:15px;" disabled>&#x2713; 确认标定 &#x2192;</button>' +
        '<button id="gait-cal-skip" style="flex:1;padding:12px;background:rgba(0,0,0,0.06);border:none;border-radius:8px;cursor:pointer;font-size:13px;">跳过 &#x2192;</button>' +
      '</div>'
    );
    startCamera().then(function (ok) {
      if (!ok) {
        state.errorMessage = '无法启动摄像头, 请使用"跳过"或刷新页面重试';
        renderPhase();
      } else {
        attachCameraSelectorHandlers();
        attachCameraSideHandlers();
        checkOrientation();
      }
    });
    // 身高标定画布 (覆盖在视频上, 显示检测到的关键点和身高像素距离)
    var canvas = $('#gait-calibration-canvas');
    var video = $('#gait-camera-video');
    var ctx = canvas.getContext('2d');
    var detectCanvas = document.createElement('canvas');
    var detectCtx = detectCanvas.getContext('2d');
    function syncCanvas() {
      if (video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      drawCalibration();
    }
    video.addEventListener('loadedmetadata', syncCanvas);
    video.addEventListener('loadedmetadata', checkOrientation);

    function drawCalibration() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var kps = state.calibration.detectedKeypoints;
      if (!kps || kps.length === 0) return;
      // 画关键点
      kps.forEach(function (k) {
        if (k.score >= 0.3) {
          ctx.beginPath();
          ctx.arc(k.x, k.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
      // 连线: 头顶 → 踝关节
      var nose = kps.find(function (k) { return k.name === 'nose'; });
      var lEye = kps.find(function (k) { return k.name === 'left_eye'; });
      var rEye = kps.find(function (k) { return k.name === 'right_eye'; });
      var lAnkle = kps.find(function (k) { return k.name === 'left_ankle'; });
      var rAnkle = kps.find(function (k) { return k.name === 'right_ankle'; });
      var headY = (nose && nose.score >= 0.3) ? nose.y :
                  ((lEye && rEye && lEye.score >= 0.3 && rEye.score >= 0.3) ? (lEye.y + rEye.y) / 2 : null);
      var ankleY = (lAnkle && rAnkle && lAnkle.score >= 0.3 && rAnkle.score >= 0.3) ? (lAnkle.y + rAnkle.y) / 2 :
                   ((lAnkle && lAnkle.score >= 0.3) ? lAnkle.y :
                   ((rAnkle && rAnkle.score >= 0.3) ? rAnkle.y : null));
      if (headY != null && ankleY != null) {
        var midX = (lAnkle && rAnkle && lAnkle.score >= 0.3 && rAnkle.score >= 0.3)
                   ? (lAnkle.x + rAnkle.x) / 2
                   : ((lAnkle && lAnkle.score >= 0.3) ? lAnkle.x : rAnkle.x);
        var midHeadX = (nose && nose.score >= 0.3) ? nose.x
                     : ((lEye && rEye && lEye.score >= 0.3 && rEye.score >= 0.3) ? (lEye.x + rEye.x) / 2 : midX);
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(midHeadX, headY);
        ctx.lineTo(midX, ankleY);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        var pxH = Math.abs(ankleY - headY);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(midX + 10, (headY + ankleY) / 2 - 14, 130, 28);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('身高像素: ' + Math.round(pxH) + 'px', midX + 16, (headY + ankleY) / 2 + 6);
      }
    }

    function setStatus(msg, color) {
      var s = $('#gait-calibration-status');
      if (s) {
        s.textContent = msg;
        s.style.color = color || '#444';
      }
    }

    function updateCalibrationFromKeypoints(keypoints, heightCm) {
      var frames = [{ t: 0, keypoints: keypoints }];
      var cal = window.__gaitParams.calibrateByHeight(frames, heightCm / 100);
      if (cal.error) {
        setStatus('标定失败: ' + cal.error + ' — 请确保患者全身在画面中, 头顶和脚踝清晰可见', '#dc2626');
        return false;
      }
      state.calibration.scale = cal.scale;
      state.calibration.realMeters = cal.realHeight;
      state.calibration.pixelDistance = cal.pixelHeight;
      state.calibration.heightCm = heightCm;
      state.calibration.method = 'height';
      state.calibration.confidence = cal.confidence;
      state.calibration.detectedKeypoints = keypoints;
      drawCalibration();
      var scaleCmPerPx = (cal.scale * 100).toFixed(2);
      setStatus('✓ 标定成功 — 比例: ' + scaleCmPerPx + ' cm/px (身高像素 ' + Math.round(cal.pixelHeight) + 'px, 置信度: ' + cal.confidence + ')', '#10b981');
      $('#gait-cal-confirm').disabled = false;
      $('#gait-cal-confirm').style.opacity = '1';
      return true;
    }

    // 高度输入变更
    var heightInput = $('#gait-cal-height');
    if (heightInput) {
      heightInput.addEventListener('change', function () {
        state.calibration.heightCm = parseInt(heightInput.value, 10) || 170;
      });
    }

    // 自动标定按钮
    $('#gait-cal-auto').addEventListener('click', function () {
      var btn = $('#gait-cal-auto');
      if (video.videoWidth === 0) {
        setStatus('摄像头未就绪, 请稍候再试', '#dc2626');
        return;
      }
      btn.disabled = true;
      btn.textContent = '⏳ 加载AI模型...';
      setStatus('⏳ 首次使用需加载 ~2MB AI 模型, 请稍候...', '#444');
      loadPoseDetection()
        .then(function (detector) {
          btn.textContent = '⏳ 检测人体...';
          // 把当前视频帧绘制到 detectCanvas
          detectCanvas.width = video.videoWidth;
          detectCanvas.height = video.videoHeight;
          detectCtx.drawImage(video, 0, 0, detectCanvas.width, detectCanvas.height);
          return detector.estimatePoses(detectCanvas, { flipHorizontal: false });
        })
        .then(function (poses) {
          var pose = poses && poses[0];
          if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
            setStatus('⚠️ 未检测到人体 — 请确保患者全身在画面中, 头顶和脚踝清晰可见', '#dc2626');
            return;
          }
          var kps = pose.keypoints.map(function (k) {
            return { x: k.x, y: k.y, score: k.score || 0, name: k.name || '' };
          });
          var heightCm = parseInt(heightInput.value, 10) || 170;
          updateCalibrationFromKeypoints(kps, heightCm);
        })
        .catch(function (e) {
          console.error('[gait] auto-cal error', e);
          setStatus('❌ AI 模型加载/检测失败: ' + (e.message || e) + ' — 请刷新或使用"跳过"', '#dc2626');
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = '🎯 自动标定';
        });
    });

    // 确认 → 进入录制
    $('#gait-cal-confirm').addEventListener('click', function () {
      if (!state.calibration.scale || state.calibration.scale <= 0) {
        state.errorMessage = '请先点击"自动标定"成功后再确认, 或使用"跳过"';
        renderPhase();
        return;
      }
      stopCamera();
      setPhase(PHASE.CAPTURE);
    });
    // 跳过 → 默认比例
    $('#gait-cal-skip').addEventListener('click', function () {
      state.calibration.scale = 1 / 130;
      state.calibration.realMeters = 1.0;
      state.calibration.pixelDistance = 130;
      state.calibration.heightCm = 170;
      state.calibration.method = 'default';
      state.calibration.note = '使用默认比例 (未标定)';
      stopCamera();
      setPhase(PHASE.CAPTURE);
    });
  }

  function renderCapture() {
    var errHtml = renderError();
    clearError();
    setBody(
      errHtml +
      renderCameraSelector() +
      renderCameraSideSelector() +
      '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
        '<button class="gait-capture-tab active" data-mode="record" style="padding:6px 16px;background:#43E97B;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">&#x1f3a5; 录制</button>' +
        '<button class="gait-capture-tab" data-mode="upload" style="padding:6px 16px;background:rgba(0,0,0,0.06);border:none;border-radius:6px;cursor:pointer;font-size:13px;">&#x1f4c1; 上传</button>' +
      '</div>' +
      '<div id="gait-capture-area">' +
        '<div id="gait-record-panel">' +
          '<div style="position:relative;background:#000;border-radius:8px;overflow:hidden;max-width:100%;">' +
            '<video id="gait-camera-video" autoplay muted playsinline style="display:block;width:100%;"></video>' +
            '<div id="gait-portrait-warn" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.82);color:#fff;padding:16px 28px;border-radius:12px;font-size:16px;font-weight:700;text-align:center;pointer-events:none;white-space:nowrap;border:2px solid #fbbf24;">&#x1f4f1;&#x21c4; 请将手机横置<br><span style="font-size:12px;font-weight:400;opacity:0.85;">斜前方~45°横屏拍摄精度最佳</span></div>' +
          '</div>' +
        '</div>' +
        '<div id="gait-upload-panel" style="display:none;text-align:center;padding:40px 20px;">' +
          '<input type="file" id="gait-file-input" accept="video/*" style="display:none;">' +
          '<button id="gait-file-btn" style="padding:20px 48px;background:linear-gradient(135deg,#636e72,#2d3436);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;">&#x1f4c1; 选择视频文件</button>' +
          '<p style="color:#888;font-size:12px;margin-top:12px;">支持 mp4 / webm / mov, 最大 100MB</p>' +
        '</div>' +
        '<div id="gait-preview-panel" style="display:none;text-align:center;margin-top:8px;">' +
          '<video id="gait-preview-video" controls muted playsinline style="max-width:100%;max-height:300px;background:#000;border-radius:8px;"></video>' +
          '<div style="display:flex;gap:8px;margin-top:10px;justify-content:center;">' +
            '<button id="gait-process-btn" style="padding:14px 40px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:30px;cursor:pointer;font-size:18px;font-weight:600;">&#x1f50d; 开始分析</button>' +
            '<button id="gait-retry-btn" style="padding:14px 30px;background:rgba(0,0,0,0.08);border:none;border-radius:30px;cursor:pointer;font-size:14px;">&#x1f504; 重新录制</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="gait-record-controls" style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:center;">' +
        '<span id="gait-record-timer" style="font-size:24px;font-weight:700;color:#dc2626;font-family:monospace;">00:00</span>' +
        '<button id="gait-record-start" style="padding:12px 32px;background:#dc2626;color:#fff;border:none;border-radius:30px;cursor:pointer;font-size:16px;font-weight:600;">&#x23fa; 开始录制</button>' +
        '<button id="gait-record-stop" style="padding:12px 32px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:30px;cursor:pointer;font-size:16px;display:none;">&#x23f9; 停止</button>' +
        '<button id="gait-back-intro" style="padding:8px 16px;background:transparent;border:1px solid #ccc;border-radius:6px;cursor:pointer;color:#666;font-size:13px;">&#x2190; 返回</button>' +
      '</div>'
    );
    // Bind tabs
    document.querySelectorAll('.gait-capture-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.gait-capture-tab').forEach(function (b) {
          b.style.background = 'rgba(0,0,0,0.08)';
          b.style.color = 'var(--text, #333)';
          b.style.fontWeight = '400';
        });
        btn.style.background = '#43E97B';
        btn.style.color = '#fff';
        btn.style.fontWeight = '600';
        var mode = btn.dataset.mode;
        if (mode === 'record') {
          $('#gait-record-panel').style.display = '';
          $('#gait-upload-panel').style.display = 'none';
          $('#gait-preview-panel').style.display = 'none';
          $('#gait-record-controls').style.display = 'flex';
          startCamera().then(function (ok) { if (ok) { attachCameraSelectorHandlers(); checkOrientation(); } });
        } else {
          $('#gait-record-panel').style.display = 'none';
          $('#gait-upload-panel').style.display = '';
          $('#gait-preview-panel').style.display = 'none';
          $('#gait-record-controls').style.display = 'none';
          stopCamera();
        }
      });
    });
    // 初次进入默认显示录制面板时启动摄像头
    startCamera().then(function (ok) { if (ok) { attachCameraSelectorHandlers(); checkOrientation(); } });
    // Recording controls
    var recTimer = null, recStart = 0;
    $('#gait-record-start').addEventListener('click', function () {
      startCamera().then(function (ok) {
        if (!ok) { renderPhase(); return; }
        attachCameraSelectorHandlers();
        attachCameraSideHandlers();
        checkOrientation();
        $('#gait-record-start').style.display = 'none';
        $('#gait-record-stop').style.display = '';
        startRecording();
        recStart = Date.now();
        recTimer = setInterval(function () {
          var elapsed = Math.floor((Date.now() - recStart) / 1000);
          var mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
          var ss = String(elapsed % 60).padStart(2, '0');
          $('#gait-record-timer').textContent = mm + ':' + ss;
          if (elapsed >= 30) stopRecording();  // 自动停止
        }, 200);
      });
    });
    $('#gait-record-stop').addEventListener('click', function () {
      stopRecording();
      if (recTimer) clearInterval(recTimer);
    });
    // File upload
    $('#gait-file-btn').addEventListener('click', function () { $('#gait-file-input').click(); });
    $('#gait-file-input').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handleFileUpload(file);
    });
    $('#gait-back-intro').addEventListener('click', function () {
      stopCamera();
      setPhase(PHASE.INTRO);
    });
  }

  function renderCaptureComplete() {
    $('#gait-record-panel').style.display = 'none';
    $('#gait-upload-panel').style.display = 'none';
    $('#gait-preview-panel').style.display = '';
    $('#gait-record-controls').style.display = 'none';
    $('#gait-process-btn').addEventListener('click', processVideo);
    $('#gait-retry-btn').addEventListener('click', function () {
      state.recordedBlob = null;
      if (state.recordedURL) URL.revokeObjectURL(state.recordedURL);
      state.recordedURL = null;
      $('#gait-preview-panel').style.display = 'none';
      $('#gait-record-panel').style.display = '';
      $('#gait-record-controls').style.display = 'flex';
      setPhase(PHASE.CAPTURE);
    });
  }

  function renderProcessing() {
    setBody(
      '<div style="background:#fff;padding:40px 20px;border-radius:12px;text-align:center;">' +
        '<div style="font-size:64px;margin-bottom:16px;">🔄</div>' +
        '<h3 style="margin:0 0 8px 0;color:#1a1a2e;" id="gait-progress-title">正在加载 AI 模型...</h3>' +
        '<p style="color:#666;font-size:14px;margin:0 0 24px 0;" id="gait-progress-text">首次使用需下载约 8MB 模型, 请稍候</p>' +
        '<div style="max-width:480px;margin:0 auto;background:#e5e7eb;height:24px;border-radius:12px;overflow:hidden;">' +
          '<div id="gait-progress-bar" style="width:5%;height:100%;background:linear-gradient(90deg,#43E97B,#38F9D7);transition:width 0.3s;border-radius:12px;"></div>' +
        '</div>' +
        '<p style="color:#999;font-size:12px;margin:16px 0 0 0;">分析过程中请勿关闭页面</p>' +
      '</div>'
    );
    updateProcessingProgress(0.05);
  }

  function renderResults() {
    if (!state.results) { setPhase(PHASE.INTRO); return; }
    var r = state.results;
    var c = r.classification || { primary: 'unknown', primaryLabel: '—', confidence: 0 };
    if (!c.primaryLabel) c.primaryLabel = c.primary || '—';
    var colorMap = { normal: '#10b981', mild: '#f59e0b', moderate: '#f97316', severe: '#dc2626' };
    var statusText = { normal: '正常', mild: '轻度', moderate: '中度', severe: '重度' };
    var clsColor = colorMap[c.primary === 'normal' ? 'normal' : 'severe'];

    var params = r.parameters;
    var asym = r.asymmetries;

    function paramCard(key, label, icon) {
      var p = params[key];
      var color = colorMap[p.status] || '#9ca3af';
      var text = statusText[p.status] || '—';
      return '<div style="background:#fff;padding:14px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);border-left:4px solid ' + color + ';">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
          '<span style="font-size:13px;color:#666;">' + icon + ' ' + label + '</span>' +
          '<span style="background:' + color + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">' + text + '</span>' +
        '</div>' +
        '<div style="font-size:24px;font-weight:700;color:#1a1a2e;">' + fmtNum(p.value, 2) + ' <span style="font-size:13px;color:#999;font-weight:400;">' + p.unit + '</span></div>' +
        '<div style="font-size:11px;color:#888;margin-top:4px;">正常: ' + p.normal.min + ' - ' + p.normal.max + ' ' + p.unit + '</div>' +
      '</div>';
    }

    setBody(
      '<div style="background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
        '<div>' +
          '<h2 style="margin:0;font-size:22px;">🚶 步态分析报告</h2>' +
          '<div style="font-size:12px;opacity:0.9;margin-top:4px;">视频时长 ' + fmtNum(r.duration, 1) + 's · ' + r.frameCount + ' 帧 · ' + new Date(r.timestamp).toLocaleString('zh-CN') + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:11px;opacity:0.85;">步速</div>' +
          '<div style="font-size:28px;font-weight:700;">' + fmtNum(params.gaitSpeed.value, 2) + ' <span style="font-size:14px;">m/s</span></div>' +
        '</div>' +
      '</div>' +
      // 分类卡片
      '<div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">' +
        '<div style="display:flex;align-items:center;gap:16px;">' +
          '<div style="width:80px;height:80px;border-radius:50%;background:' + clsColor + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;flex-shrink:0;">' +
            (c.primary === 'normal' ? '✓' : '⚠') +
          '</div>' +
          '<div style="flex:1;">' +
            '<div style="font-size:13px;color:#888;">主要步态类型</div>' +
            '<div style="font-size:22px;font-weight:700;color:#1a1a2e;margin:2px 0;">' + c.primaryLabel + '</div>' +
            '<div style="font-size:13px;color:#666;">置信度: ' + fmtNum(c.confidence * 100, 1) + '%</div>' +
          '</div>' +
        '</div>' +
        (c.differential.length > 0 ?
          '<div style="margin-top:12px;padding:10px;background:#f8f9fa;border-radius:6px;font-size:12px;">' +
            '<b>鉴别诊断:</b> ' + c.differential.map(function (d) { return d.label + ' (' + fmtNum(d.score * 100, 0) + '%)'; }).join(', ') +
          '</div>' : '') +
      '</div>' +
      // 8 项参数卡片
      '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">📊 步态参数</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">' +
        paramCard('stepLength', '步长', '📏') +
        paramCard('strideLength', '步幅', '📐') +
        paramCard('stepWidth', '步宽', '↔️') +
        paramCard('footAngle', '足偏角', '📐') +
        paramCard('cadence', '步频', '⏱️') +
        paramCard('gaitSpeed', '步速', '🏃') +
        paramCard('stancePct', '支撑相', '🦶') +
        paramCard('swingPct', '摆动相', '💨') +
      '</div>' +
      // 步态周期 8 时相 (Rancho Los Amigos)
      (r.gaitPhases && !r.gaitPhases.error && r.gaitPhases.phases ?
        '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">🔄 步态周期时相 (Rancho Los Amigos 8 时相)</h3>' +
        '<div style="background:#fff;padding:14px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
          '<div style="font-size:12px;color:#666;margin-bottom:10px;">检测到 <b>' + r.gaitPhases.totalCycles + '</b> 个完整步态周期, 平均周期 <b>' + (r.gaitPhases.avgCycleTime ? r.gaitPhases.avgCycleTime.toFixed(2) : '—') + 's</b>, 共 <b>' + r.gaitPhases.events.length + '</b> 个步态事件 (HS/TO)</div>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px;">' +
            [
              { key: 'IC',  name: '初始触地',  short: 'IC' },
              { key: 'LR',  name: '承重反应',  short: 'LR' },
              { key: 'MSt', name: '站立中期',  short: 'MSt' },
              { key: 'TSt', name: '推离前期',  short: 'TSt' },
              { key: 'PSw', name: '推离后期',  short: 'PSw' },
              { key: 'ISw', name: '摆动初期',  short: 'ISw' },
              { key: 'MSw', name: '摆动中期',  short: 'MSw' },
              { key: 'TSw', name: '摆动末期',  short: 'TSw' }
            ].map(function (p) {
              var pct = r.gaitPhases.phases[p.key] || 0;
              var color = p.key === 'IC' || p.key === 'PSw' ? '#dc2626' :
                          p.key === 'LR' || p.key === 'TSt' ? '#f59e0b' :
                          p.key === 'MSt' || p.key === 'MSw' ? '#10b981' : '#3b82f6';
              return '<div style="padding:8px;background:#f8f9fa;border-radius:6px;border-left:3px solid ' + color + ';">' +
                '<div style="color:#666;">' + p.short + ' · ' + p.name + '</div>' +
                '<div style="font-size:16px;font-weight:700;color:' + color + ';">' + pct.toFixed(1) + '%</div>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div style="margin-top:10px;padding:8px;background:#f0f2f5;border-radius:6px;font-size:11px;color:#666;line-height:1.7;">' +
            '<b>临床意义</b>: 偏瘫步态常见 LR 延长 (承重困难); 帕金森步态常见 PSw 缩短 (推离无力); 小脑共济失调常见 MSw 变长 (平衡调整); 足下垂常见 ISw/TSw 延长 (廓清障碍)。' +
          '</div>' +
        '</div>'
      : '') +
      // 上肢摆动分析 (ANRM §4.2 上肢观察)
      (r.armSwing && !r.armSwing.error ?
        '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">💪 上肢摆动分析</h3>' +
        '<div style="background:#fff;padding:16px;border-radius:10px;margin-bottom:14px;">' +
          // 肩摆动
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px;">' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">左肩摆动</div>' +
              '<div style="font-size:22px;font-weight:700;color:#1a1a2e;">' + (r.armSwing.shoulder.leftAmplitude || 0).toFixed(1) + ' <span style="font-size:12px;color:#999;">' + (r.armSwing.shoulder.unit || 'px') + '</span></div>' +
              '<div style="font-size:11px;color:#888;">归一化: ' + (r.armSwing.shoulder.leftNormalized || 0).toFixed(2) + '</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">右肩摆动</div>' +
              '<div style="font-size:22px;font-weight:700;color:#1a1a2e;">' + (r.armSwing.shoulder.rightAmplitude || 0).toFixed(1) + ' <span style="font-size:12px;color:#999;">' + (r.armSwing.shoulder.unit || 'px') + '</span></div>' +
              '<div style="font-size:11px;color:#888;">归一化: ' + (r.armSwing.shoulder.rightNormalized || 0).toFixed(2) + '</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">肩摆不对称</div>' +
              '<div style="font-size:22px;font-weight:700;color:' + ((r.armSwing.shoulder.asymmetry || 0) > 0.25 ? '#dc2626' : '#10b981') + ';">' + ((r.armSwing.shoulder.asymmetry || 0) * 100).toFixed(0) + '%</div>' +
              '<div style="font-size:11px;color:#888;">正常 < 20%</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">上下肢协调</div>' +
              '<div style="font-size:22px;font-weight:700;color:' + ((r.armSwing.coordination.avg || 0) < 0.25 ? '#dc2626' : '#10b981') + ';">' + ((r.armSwing.coordination.avg || 0) * 100).toFixed(0) + '%</div>' +
              '<div style="font-size:11px;color:#888;">正常 > 25%</div>' +
            '</div>' +
          '</div>' +
          // 腕部辅助指标
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;padding:10px;background:#f0f2f5;border-radius:6px;">' +
            '<div>腕摆动 L: <b>' + ((r.armSwing.wrist.leftAmplitude || 0)).toFixed(1) + ' ' + (r.armSwing.shoulder.unit || 'px') + '</b></div>' +
            '<div>腕摆动 R: <b>' + ((r.armSwing.wrist.rightAmplitude || 0)).toFixed(1) + ' ' + (r.armSwing.shoulder.unit || 'px') + '</b></div>' +
            '<div>腕不对称: <b>' + ((r.armSwing.wrist.asymmetry || 0) * 100).toFixed(0) + '%</b></div>' +
          '</div>' +
          // 临床标记
          (r.armSwing.flags && r.armSwing.flags.length > 0 ?
            '<div style="margin-top:10px;padding:8px 12px;background:#fef3c7;border-radius:6px;border-left:3px solid #f59e0b;">' +
              r.armSwing.flags.map(function (f) { return '<div style="font-size:12px;color:#92400e;line-height:1.6;">⚠ ' + f + '</div>'; }).join('') +
            '</div>' : '') +
        '</div>'
      : '') +
      // 脑功能步态画像 (ANRM 脑优化 §3.2)
      (r.brainProfile && !r.brainProfile.error ?
        '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">🧠 脑功能步态画像</h3>' +
        '<div style="background:#fff;padding:16px;border-radius:10px;margin-bottom:14px;">' +
          // 总评
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:8px;">' +
            '<div style="font-size:36px;">🧠</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:16px;font-weight:700;">' + (r.brainProfile.brainGrade || '—') + '</div>' +
              '<div style="font-size:12px;opacity:0.85;">脑功能综合评分: ' + (r.brainProfile.overallBrainScore || 50) + '/100</div>' +
            '</div>' +
            '<div style="text-align:center;">' +
              '<div style="font-size:11px;opacity:0.8;">左脑</div>' +
              '<div style="font-size:18px;font-weight:700;">' + (r.brainProfile.lateralization ? r.brainProfile.lateralization.leftBrain : '—') + '</div>' +
            '</div>' +
            '<div style="text-align:center;">' +
              '<div style="font-size:11px;opacity:0.8;">右脑</div>' +
              '<div style="font-size:18px;font-weight:700;">' + (r.brainProfile.lateralization ? r.brainProfile.lateralization.rightBrain : '—') + '</div>' +
            '</div>' +
          '</div>' +
          // 4 个脑功能域
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">' +
            (r.brainProfile.domains.contralateral ?
              '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #667eea;">' +
                '<div style="font-size:12px;font-weight:600;color:#333;">↔ 对侧脑功能</div>' +
                '<div style="font-size:11px;color:#888;margin:2px 0;">肩膀甩动 → 对侧脑</div>' +
                '<div style="font-size:10px;">左脑(右肩): <b>' + r.brainProfile.domains.contralateral.leftBrainScore + '</b> | 右脑(左肩): <b>' + r.brainProfile.domains.contralateral.rightBrainScore + '</b></div>' +
                (r.brainProfile.domains.contralateral.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;margin-top:2px;">⚠ '+f+'</div>';}).join('') +
              '</div>' : '') +
            (r.brainProfile.domains.cerebellum ?
              '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #f59e0b;">' +
                '<div style="font-size:12px;font-weight:600;color:#333;">🎯 小脑功能</div>' +
                '<div style="font-size:11px;color:#888;margin:2px 0;">手肘摆动 → 小脑</div>' +
                '<div style="font-size:10px;">评分: <b>' + r.brainProfile.domains.cerebellum.score + '</b> | 肘摆: ' + (r.brainProfile.domains.cerebellum.avgElbowAmplitude || 0).toFixed(1) + 'cm</div>' +
                (r.brainProfile.domains.cerebellum.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;margin-top:2px;">⚠ '+f+'</div>';}).join('') +
              '</div>' : '') +
            (r.brainProfile.domains.ipsilateral ?
              '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #10b981;">' +
                '<div style="font-size:12px;font-weight:600;color:#333;">📏 同侧脑功能</div>' +
                '<div style="font-size:11px;color:#888;margin:2px 0;">宽深角度 → 同侧脑</div>' +
                '<div style="font-size:10px;">步宽: ' + (r.brainProfile.domains.ipsilateral.stepWidth || 0).toFixed(2) + 'm | 对称: ' + ((r.brainProfile.domains.ipsilateral.stepLengthSymmetry || 0)*100).toFixed(0) + '%</div>' +
                (r.brainProfile.domains.ipsilateral.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;margin-top:2px;">⚠ '+f+'</div>';}).join('') +
              '</div>' : '') +
            (r.brainProfile.domains.emotion ?
              '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #ec4899;">' +
                '<div style="font-size:12px;font-weight:600;color:#333;">💭 性格与情绪</div>' +
                '<div style="font-size:11px;color:#888;margin:2px 0;">膝关节刹车 → 情绪</div>' +
                '<div style="font-size:10px;">评分: <b>' + r.brainProfile.domains.emotion.score + '</b> | ' + (r.brainProfile.domains.emotion.quality || '') + '</div>' +
                (r.brainProfile.domains.emotion.flags || []).map(function(f){return '<div style="font-size:10px;color:#dc2626;margin-top:2px;">⚠ '+f+'</div>';}).join('') +
              '</div>' : '') +
            (r.brainProfile.domains.automaticity ?
              '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid #8b5cf6;">' +
                '<div style="font-size:12px;font-weight:600;color:#333;">🔄 步态自动化</div>' +
                '<div style="font-size:11px;color:#888;margin:2px 0;">节律变异 → 皮层依赖</div>' +
                '<div style="font-size:10px;">评分: <b>' + r.brainProfile.domains.automaticity.score + '</b> | CV: ' + ((r.brainProfile.domains.automaticity.rhythmCV || 0)*100).toFixed(1) + '%</div>' +
                (r.brainProfile.domains.automaticity.flags || []).map(function(f){return '<div style="font-size:10px;color:#92400e;margin-top:2px;">⚠ '+f+'</div>';}).join('') +
              '</div>' : '') +
          '</div>' +
          // 亚健康标记汇总
          (r.brainProfile.subhealthFlags && r.brainProfile.subhealthFlags.length > 0 ?
            '<div style="margin-top:12px;padding:10px 14px;background:#fef3c7;border-radius:6px;border-left:3px solid #f59e0b;">' +
              '<div style="font-size:12px;font-weight:600;color:#92400e;margin-bottom:6px;">🔍 亚健康步态标记 (' + r.brainProfile.subhealthFlags.length + '项)</div>' +
              r.brainProfile.subhealthFlags.map(function(f){return '<div style="font-size:11px;color:#92400e;line-height:1.7;">• '+f+'</div>';}).join('') +
            '</div>' : '') +
        '</div>'
      : '') +
      // 不对称分析
      '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">⚖️ 不对称分析</h3>' +
      '<div style="background:#fff;padding:16px;border-radius:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;font-size:13px;">' +
        ['stepLength', 'strideLength', 'footAngle', 'cadence', 'stance'].map(function (k) {
          var v = asym[k];
          var pct = fmtNum(v * 100, 1);
          var c = v < 0.10 ? '#10b981' : v < 0.20 ? '#f59e0b' : '#dc2626';
          return '<div style="text-align:center;padding:8px;background:#f8f9fa;border-radius:6px;">' +
            '<div style="color:#888;font-size:11px;">' + (k === 'stepLength' ? '步长' : k === 'strideLength' ? '步幅' : k === 'footAngle' ? '足偏角' : k === 'cadence' ? '步频' : '支撑相') + '</div>' +
            '<div style="font-size:18px;font-weight:700;color:' + c + ';">' + pct + '%</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      // 神经定位
      '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">🧠 神经定位提示</h3>' +
      '<div style="background:#fff;padding:16px;border-radius:10px;border-left:4px solid #0f7b6c;">' +
        '<div style="font-size:13px;color:#666;">损伤水平</div>' +
        '<div style="font-size:16px;font-weight:600;color:#1a1a2e;margin:4px 0;">' + r.neuro.level + '</div>' +
        (r.neuro.regions.length > 0 ? '<div style="font-size:13px;color:#666;margin-top:6px;"><b>可能涉及:</b> ' + r.neuro.regions.join(', ') + '</div>' : '') +
        (r.neuro.possibleCauses.length > 0 ? '<div style="font-size:13px;color:#666;margin-top:4px;"><b>常见病因:</b> ' + r.neuro.possibleCauses.join(' / ') + '</div>' : '') +
        '<div style="font-size:13px;color:#444;margin-top:8px;line-height:1.6;">' +
          '<b>典型表现:</b> ' + r.neuro.features.join(' / ') +
        '</div>' +
      '</div>' +
      // 康复建议
      '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">💪 康复训练建议</h3>' +
      '<div style="background:#fff;padding:16px;border-radius:10px;">' +
        '<ol style="padding-left:20px;margin:0;line-height:1.9;font-size:14px;color:#333;">' +
          r.rehab.map(function (s) { return '<li>' + s + '</li>'; }).join('') +
        '</ol>' +
      '</div>' +
      '<div style="text-align:center;margin-top:20px;">' +
        '<button id="gait-new-assessment" style="padding:12px 30px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:30px;cursor:pointer;font-size:16px;font-weight:600;">🔄 重新评估</button>' +
      '</div>'
    );
    $('#gait-new-assessment').addEventListener('click', function () {
      state.recordedBlob = null;
      state.recordedURL = null;
      state.results = null;
      state.capturedFrames = [];
      setPhase(PHASE.INTRO);
    });
  }

  // ============================================================
  // QR 分享 + 历史记录
  // ============================================================
  function buildQRUrl() {
    var base = window.location.origin + window.location.pathname;
    var tid = '';
    try { tid = localStorage.getItem('therapist_id') || ''; } catch (e) {}
    return base + '?mode=gait&t=' + Date.now() + (tid ? '&tid=' + encodeURIComponent(tid) : '');
  }

  function showQR() {
    var overlay = $('#gait-qr-overlay');
    var url = buildQRUrl();
    $('#gait-qr-url').textContent = url;
    var canvas = $('#gait-qr-canvas');
    canvas.innerHTML = '';
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      canvas.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4 });
    } catch (e) {
      // 尝试动态加载 qrcode-generator
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
      s.onload = function () {
        try {
          var qr2 = qrcode(0, 'M');
          qr2.addData(url);
          qr2.make();
          canvas.innerHTML = qr2.createSvgTag({ cellSize: 4, margin: 4 });
        } catch (e2) { canvas.textContent = '二维码生成失败'; }
      };
      document.head.appendChild(s);
    }
    overlay.style.display = 'flex';
  }

  function renderHistory() {
    var list = loadHistory();
    var html = '';
    if (list.length === 0) {
      html = '<p style="color:#888;text-align:center;padding:20px;">暂无历史记录</p>';
    } else {
      html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:13px;color:#666;">共 <b>' + list.length + '</b> 条记录</div>' +
        '<button id="gait-hist-clear-all" style="padding:6px 14px;background:#fee;color:#dc2626;border:1px solid #fcc;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">🗑 清空全部</button>' +
      '</div>';
      html = list.map(function (r, idx) {
        var p = r.parameters || {};
        var c = r.classification || {};
        var n = r.neuro || {};
        var asym = r.asymmetries || {};
        var bp = r.brainProfile || {};
        var arm = r.armSwing || {};
        // 6 项关键指标预览
        var stats = [
          { l: '步速', v: p.gaitSpeed, u: 'm/s', c: '#43E97B' },
          { l: '步频', v: p.cadence, u: '步/分', c: '#43E97B' },
          { l: '步长', v: p.stepLength, u: 'm', c: '#43E97B' },
          { l: '支撑相', v: p.stancePct, u: '%', c: '#43E97B' },
          { l: '肩摆', v: arm.shoulder ? { value: arm.shoulder.avgNormalized * 100, status: arm.shoulder.avgNormalized > 0.15 ? 'normal' : 'mild' } : null, u: '%', c: '#667eea' },
          { l: '脑功能', v: bp.overallBrainScore !== undefined ? { value: bp.overallBrainScore, status: bp.overallBrainScore >= 55 ? 'normal' : 'mild' } : null, u: '/100', c: '#764ba2' }
        ];
        var statHtml = stats.map(function (s) {
          if (!s.v) return '';
          var val = s.v.value !== undefined ? s.v.value : '—';
          return '<div style="text-align:center;padding:6px;background:#f8f9fa;border-radius:4px;">' +
            '<div style="font-size:10px;color:#888;">' + s.l + '</div>' +
            '<div style="font-size:13px;font-weight:700;color:' + s.c + ';">' + (typeof val === 'number' ? val.toFixed(2) : val) + '<span style="font-size:9px;color:#999;">' + s.u + '</span></div>' +
          '</div>';
        }).join('');
        return '<div class="gait-hist-item" data-idx="' + idx + '" style="padding:14px;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:10px;cursor:pointer;background:#fafafa;user-select:none;transition:all 0.15s;position:relative;" onmouseover="this.style.background=\'#f0f9f4\';this.style.borderColor=\'#43E97B\';this.style.transform=\'translateX(2px)\'" onmouseout="this.style.background=\'#fafafa\';this.style.borderColor=\'#e0e0e0\';this.style.transform=\'translateX(0)\'">' +
          '<button class="gait-hist-del" data-idx="' + idx + '" style="position:absolute;top:8px;right:8px;width:28px;height:28px;border:none;background:#fee;color:#dc2626;border-radius:50%;cursor:pointer;font-size:14px;font-weight:700;line-height:1;padding:0;" title="删除此记录">×</button>' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-right:36px;">' +
            '<div style="flex:1;">' +
              '<div style="font-size:15px;font-weight:700;color:#0f7b6c;">' + (c.primaryLabel || '—') + '</div>' +
              '<div style="font-size:11px;color:#888;margin-top:2px;">' + new Date(r.timestamp).toLocaleString('zh-CN') + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<div style="font-size:10px;color:#888;">点击查看</div>' +
              '<div style="color:#43E97B;font-size:20px;">→</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;">' + statHtml + '</div>' +
          (n.level ? '<div style="margin-top:8px;font-size:11px;color:#666;">🧠 神经定位: ' + n.level + '</div>' : '') +
        '</div>';
      }).join('');
    }
    $('#gait-history-list').innerHTML = html;
    // 清空全部按钮
    var clearAllBtn = document.getElementById('gait-hist-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('确定清空全部历史记录？此操作不可撤销。')) {
          clearAllHistory();
          renderHistory();
        }
      });
    }
    // 删除按钮 — 阻止冒泡到 item 点击, 调用 deleteHistoryRecord
    document.querySelectorAll('.gait-hist-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(btn.dataset.idx, 10);
        if (confirm('确定删除这条记录？此操作不可撤销。')) {
          deleteHistoryRecord(idx);
          renderHistory();
        }
      });
    });
    var items = document.querySelectorAll('.gait-hist-item');
    items.forEach(function (item) {
      var clickHandler = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        var idx = parseInt(item.dataset.idx, 10);
        var all = loadHistory();
        if (!all[idx]) { alert('记录加载失败: 索引 ' + idx + ' 不存在'); return; }
        state.results = all[idx];
        $('#gait-history-overlay').style.display = 'none';
        var overlay = $('#gait-overlay');
        if (overlay) overlay.style.display = 'block';
        var body = $('#gait-body');
        if (body) {
          body.innerHTML = '<div id="gait-report-status" style="text-align:center;padding:40px;color:#888;">加载报告中...</div>';
        }
        // 尝试用 gait-report.js 渲染
        if (typeof window.__gaitReport !== 'undefined' && window.__gaitReport.renderReport) {
          try {
            window.__gaitReport.renderReport(all[idx], body);
            console.log('[gait] history item ' + idx + ' rendered via __gaitReport');
          } catch (err) {
            console.error('[gait] renderReport failed for history ' + idx, err);
            console.error('[gait] record keys:', Object.keys(all[idx] || {}).join(','));
            console.error('[gait] record has parameters:', !!all[idx].parameters);
            if (all[idx].parameters) {
              console.error('[gait] parameters keys:', Object.keys(all[idx].parameters).join(','));
            }
            // Fallback: 用 setPhase 显示
            setPhase(PHASE.RESULTS);
          }
        } else {
          console.warn('[gait] __gaitReport not available, using setPhase');
          setPhase(PHASE.RESULTS);
        }
        // 添加返回按钮
        var backBtn = document.createElement('div');
        backBtn.style.cssText = 'text-align:center;margin-top:16px;padding-bottom:20px;';
        backBtn.innerHTML = '<button id="gait-back-to-history" style="padding:12px 32px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:30px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(67,233,123,0.25);">← 返回历史记录</button>';
        if (body) body.appendChild(backBtn);
        var backToHist = document.getElementById('gait-back-to-history');
        if (backToHist) backToHist.addEventListener('click', function (e2) {
          if (e2) { e2.preventDefault(); e2.stopPropagation(); }
          renderHistory();
        });
        // 滚动到顶部
        if (body) body.scrollTop = 0;
      };
      item.addEventListener('click', clickHandler);
    });
    $('#gait-history-overlay').style.display = 'flex';
  }

  // ============================================================
  // 主入口
  // ============================================================
  function open() {
    var overlay = $('#gait-overlay');
    if (overlay) overlay.style.display = 'block';
    setPhase(PHASE.INTRO);
  }

  function close() {
    stopCamera();
    if (state.recordedURL) URL.revokeObjectURL(state.recordedURL);
    state.recordedBlob = null;
    state.recordedURL = null;
    state.results = null;
    state.capturedFrames = [];
    state.calibration = { p1: null, p2: null, scale: 0 };
    state.recordedChunks = [];
    var overlay = $('#gait-overlay');
    if (overlay) overlay.style.display = 'none';
    var page2 = document.getElementById('page2');
    if (page2) page2.style.display = 'flex';
  }

  // ============================================================
  // 暴露 API + 事件绑定
  // ============================================================
  function bindEvents() {
    // Footer buttons
    var closeBtn = document.getElementById('gait-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var qrBtn = document.getElementById('gait-qr-btn');
    if (qrBtn) qrBtn.addEventListener('click', showQR);
    var histBtn = document.getElementById('gait-history-btn');
    if (histBtn) histBtn.addEventListener('click', renderHistory);
    var histClose = document.getElementById('gait-history-close');
    if (histClose) histClose.addEventListener('click', function () { $('#gait-history-overlay').style.display = 'none'; });
    var qrClose = document.getElementById('gait-qr-close');
    if (qrClose) qrClose.addEventListener('click', function () { $('#gait-qr-overlay').style.display = 'none'; });
    var qrShare = document.getElementById('gait-qr-share');
    if (qrShare) qrShare.addEventListener('click', function () {
      var url = $('#gait-qr-url').textContent;
      if (navigator.share) {
        navigator.share({ title: 'BrainMend 步态分析', text: '扫码进入步态分析', url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { alert('链接已复制'); });
      }
    });
    var exportBtn = document.getElementById('gait-export-pdf');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      if (typeof window.__gaitReport === 'undefined' || !window.__gaitReport.exportPDF) {
        alert('报告模块未就绪, 请稍后重试');
        return;
      }
      // 优先用当前结果, 否则用最新一条历史记录
      var dataToExport = state.results;
      if (!dataToExport) {
        var hist = loadHistory();
        if (hist.length === 0) {
          alert('暂无报告数据 — 请先完成一次步态分析');
          return;
        }
        dataToExport = hist[hist.length - 1];
        state.results = dataToExport;
        // 显示对应报告
        var overlay = $('#gait-overlay');
        if (overlay) overlay.style.display = 'block';
        setPhase(PHASE.RESULTS);
      }
      window.__gaitReport.exportPDF(dataToExport);
    });
  }

  // 延迟绑定, 等 DOM 就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }

  // ============================================================
  // 公开 API
  // ============================================================
  window.__gaitAnalysis = {
    open: open,
    close: close,
    processVideo: processVideo,
    renderResults: renderResults,
    showQR: showQR,
    getState: function () { return state; },
    PHASE: PHASE
  };
})();
