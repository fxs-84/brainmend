/* global window, document, navigator, MediaRecorder, URL, FileReader, requestAnimationFrame, setTimeout, setInterval, clearInterval */
/**
 * gait-analysis.js — 步态分析主控 IIFE
 *
 * 5 阶段状态机: INTRO → CALIBRATION → CAPTURE → PROCESSING → RESULTS
 *  - INTRO: 欢迎 + 标定/录制/上传三个入口
 *  - CALIBRATION: 在摄像头预览上点击 2 点 (1 米标尺)
 *  - CAPTURE: MediaRecorder 录制 30s (自动停止), 或 FileReader 加载上传文件
 *  - PROCESSING: 懒加载 MediaPipe PoseLandmarker (VIDEO 模式, heavy→full→lite 回退链)
 *                → 逐帧 detectForVideo → 逐帧左右归侧 (resolveAndSwapSidesByFrame)
 *                → Zeni 骨盆相对事件检测 (detectGaitEvents) → RLA 百分比 8 时相
 *  - RESULTS: 8 项参数 + 步态周期时相 + 时相截图 + 完整报告 (由 gait-report.js 渲染)
 *
 * 全局 API: window.__gaitAnalysis.{open, close, processVideo, renderResults, ...}
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
    cameraSide: 'right',         // 摄像头在患者哪一侧: 'left' / 'right'
    poseModelVersion: null,      // 实际加载成功的 PoseLandmarker 版本: 'heavy' / 'full' / 'lite'
    videoSegments: [],    // 多段视频累积: 每段 = 一个独立 results 子集, phaseSnapshots 按 side 合并
    nextSegmentHint: null // 'left' / 'right' / null — 下次录制时 UI 提示该走哪个方向
  };

  // ============================================================
  // MediaPipe Pose 懒加载 (33关键点, 含脚跟脚尖)
  // ============================================================
  // 自动标定假设身高 (米) — 用户跳过标定时, 用人体像素身高按此估算比例
  // (如需精确测量, 引导用户使用身高标定)
  var ASSUMED_HEIGHT_M = 1.70;
  var TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
  var TASKS_VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  // 模型文件: heavy → full → lite 回退链 (精度递减; lite 版脚跟脚尖噪声大 → 时相识别不准的根本原因)
  var POSE_MODEL_URLS = [
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    'https://cdn.jsdelivr.net/gh/google-ai-edge/mediapipe-samples@main/examples/pose_landmarker/web/pose_landmarker_full.task',
    'https://cdn.jsdelivr.net/gh/google-ai-edge/mediapipe-samples@main/examples/pose_landmarker/web/pose_landmarker_lite.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
  ];

  // 从模型 URL 解析版本名 (heavy/full/lite), 记录到 state.poseModelVersion 供调试视图显示
  function parsePoseModelVersion(url) {
    var m = /pose_landmarker_(heavy|full|lite)/.exec(url || '');
    return m ? m[1] : 'unknown';
  }

  // MediaPipe 33 关键点索引 → 名称映射 (COCO 17 点名保持兼容, 新增脚跟脚尖)
  var MP_LANDMARK_NAMES = [
    'nose',              // 0
    'left_eye_inner',    // 1
    'left_eye',          // 2
    'left_eye_outer',    // 3
    'right_eye_inner',   // 4
    'right_eye',         // 5
    'right_eye_outer',   // 6
    'left_ear',          // 7
    'right_ear',         // 8
    'mouth_left',        // 9
    'mouth_right',       // 10
    'left_shoulder',     // 11
    'right_shoulder',    // 12
    'left_elbow',        // 13
    'right_elbow',       // 14
    'left_wrist',        // 15
    'right_wrist',       // 16
    'left_pinky',        // 17
    'right_pinky',       // 18
    'left_index',        // 19
    'right_index',       // 20
    'left_thumb',        // 21
    'right_thumb',       // 22
    'left_hip',          // 23
    'right_hip',         // 24
    'left_knee',         // 25
    'right_knee',        // 26
    'left_ankle',        // 27
    'right_ankle',       // 28
    'left_heel',         // 29
    'right_heel',        // 30
    'left_foot_index',   // 31
    'right_foot_index'   // 32
  ];

  // MediaPipe landmarks (归一化0-1坐标+visibility) → {x,y,score,name} 像素坐标
  function convertMPLandmarks(landmarks, w, h) {
    if (!landmarks || !landmarks.length) return [];
    return landmarks.map(function (lm, i) {
      return {
        x: lm.x * w,
        y: lm.y * h,
        score: lm.visibility != null ? lm.visibility : (lm.presence != null ? lm.presence : 0.5),
        name: MP_LANDMARK_NAMES[i] || ('point_' + i)
      };
    });
  }

  var detectorPromise = null;

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

  function loadPoseDetection() {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (async function () {
      console.log('[gait] loading MediaPipe Tasks Vision from', TASKS_VISION_URL.substring(0, 60));
      // 经 new Function 间接动态导入: vite dev 会静态重写 import() 并在文件头注入静态 import 语句
      // (本文件作为 classic script 加载 → 直接语法错误, __gaitAnalysis 无法挂载), 间接调用绕开分析;
      // 生产环境行为与 import(TASKS_VISION_URL) 完全一致
      var dynamicImport = new Function('u', 'return import(u)');
      var vision = await dynamicImport(TASKS_VISION_URL);
      var filesetResolver = await vision.FilesetResolver.forVisionTasks(TASKS_VISION_WASM);
      console.log('[gait] WASM fileset ready, creating PoseLandmarker...');

      // 尝试多个模型源 + GPU/CPU fallback
      var landmarker = null;
      var lastErr = null;
      for (var mi = 0; mi < POSE_MODEL_URLS.length && !landmarker; mi++) {
        for (var di = 0; di < 2 && !landmarker; di++) {
          var delegate = di === 0 ? 'GPU' : 'CPU';
          try {
            console.log('[gait] trying model ' + (mi+1) + '/' + POSE_MODEL_URLS.length + ' delegate=' + delegate);
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: POSE_MODEL_URLS[mi],
                delegate: delegate
              },
              runningMode: 'VIDEO',
              numPoses: 1
            });
            state.poseModelVersion = parsePoseModelVersion(POSE_MODEL_URLS[mi]);
            console.log('[gait] PoseLandmarker ready (model ' + (mi+1) + ' ' + POSE_MODEL_URLS[mi].split('/').pop() +
              ' version=' + state.poseModelVersion + ', ' + delegate + ', VIDEO mode, 33 keypoints)');
          } catch (e) {
            lastErr = e;
            console.warn('[gait] model ' + (mi+1) + ' delegate=' + delegate + ' failed:', e.message);
          }
        }
      }
      if (!landmarker) {
        throw new Error('MediaPipe 模型加载失败 (所有源/delegate均失败): ' + (lastErr ? lastErr.message : 'unknown') + ' — 请检查网络或刷新重试');
      }

      return {
        estimatePoses: async function (image, options) {
          var w = image.width || image.naturalWidth || image.videoWidth || 1;
          var h = image.height || image.naturalHeight || image.videoHeight || 1;
          // VIDEO 模式: detectForVideo 需要严格单调递增的毫秒时间戳 (由调用方在 options.timestampMs 传入)
          var tsMs = (options && typeof options.timestampMs === 'number') ? options.timestampMs : 0;
          var result = landmarker.detectForVideo(image, tsMs);
          if (!result.landmarks || !result.landmarks.length) return [];
          var kps = convertMPLandmarks(result.landmarks[0], w, h);
          return [{ keypoints: kps }];
        }
      };
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
      // === 防御: navigator.mediaDevices 在某些环境 (file:// / 老浏览器 / iframe 无权限) 下是 undefined ===
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('当前环境不支持摄像头 (navigator.mediaDevices 不可用). 请使用「上传视频」方式, 或在 HTTPS / localhost 打开页面');
      }
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
  function handleFileUpload(file) {
    // 放宽类型检查: file.type 可能为空或非标准 (某些设备/浏览器)
    var ext = (file.name || '').split('.').pop().toLowerCase();
    var validExts = ['mp4', 'webm', 'mov', 'mkv', 'avi', '3gp'];
    var typeOK = file.type && file.type.startsWith('video/');
    var extOK = validExts.indexOf(ext) !== -1;
    if (!typeOK && !extOK) {
      state.errorMessage = '请上传有效的视频文件 (mp4, webm, mov 等) — 当前类型: ' + (file.type || '(空)') + ', 扩展名: ' + (ext || '(空)');
      setPhase(PHASE.CAPTURE);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      state.errorMessage = '视频文件过大 (>100MB), 请压缩后重试';
      setPhase(PHASE.CAPTURE);
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
    }
  }

  // ============================================================
  // 帧提取
  // ============================================================
  // 从 phaseTimestamps 选出每脚最合适的周期, 逐个 seek 截帧
  // 永远不抛错, 失败返回 [] 不阻塞主流程
  // 时间几何 picker: 用户洞察 — 来回走动时两脚时相必然间隔 ≥3s (转身+重新启动+入画)
//   第一脚: 两只脚各自的 foreground cycles (closerSide === side) 中, 谁最早
//   第二脚: 另一侧的 foreground cycle, 时间距第一脚 ≥3.0s
// 优势: 不依赖方向检测, 只信 closerSide + 时间 — 因为转身是物理上必须发生的
  var MIN_TIME_GAP = 3.0;  // 两脚 IC 最小时间间隔 (秒)
  async function capturePhaseSnapshots(capturedFrames, phaseList, keypointFrames) {
    // === 帧级 pose 验证器 ===
    // 目的: build() 的 A0(IC) 检测可能在周期中段才锁定 (heelY 轨迹噪声),
    //       MediaPipe 在 45% 帧上没识别到人, 但 HS detection 仍把 frameIndex 当 IC.
    //       结果: 截图帧对应 MediaPipe 关键点为空 (背景/插值).
    // 修复: 每张截图前, 用 keypointFrames 核对 — 该帧至少 8 个关键点 + 双踝可见 → 才允许截图.
    //       不满足就在 ±3 帧窗口找最近的有效帧; 找不到就丢弃该时相, 不输出幻觉截图.
    //       (窗口收紧自 ±15: 20fps 下 ±3 帧 ≈ ±150ms, 超过这个范围的替代帧对应的已是
    //        另一个姿态 — 尤其 IC/TO 附近脚位变化快, 宁可丢弃该时相也不贴错位图)
    function frameHasValidPose(frameIdx) {
      if (!keypointFrames || frameIdx == null || frameIdx < 0) return false;
      var fr = keypointFrames[frameIdx];
      if (!fr || !fr.keypoints || fr.keypoints.length < 5) return false;
      var good = 0, hasLAnkle = false, hasRAnkle = false;
      for (var ki = 0; ki < fr.keypoints.length; ki++) {
        var kp = fr.keypoints[ki];
        if (kp.score >= 0.3) {
          good++;
          if (kp.name === 'left_ankle')  hasLAnkle = true;
          if (kp.name === 'right_ankle') hasRAnkle = true;
        }
      }
      return good >= 8 && hasLAnkle && hasRAnkle;
    }
    // 找最近的有效 pose 帧 (±3 窗口 — 超过 ±3 帧(@20fps ±150ms)对应的已是另一个姿态, 宁丢不错贴)
    function findNearestValidFrame(centerFi) {
      if (!keypointFrames) return centerFi;
      for (var d = 0; d <= 3; d++) {
        if (centerFi + d < keypointFrames.length && frameHasValidPose(centerFi + d)) return centerFi + d;
        if (centerFi - d >= 0 && frameHasValidPose(centerFi - d)) return centerFi - d;
      }
      return -1;  // 找不到
    }
    try {
      if (!phaseList || !phaseList.length || !capturedFrames || !capturedFrames.length) return [];

      // === 周期质量评估: 按side+cycleIndex分组, 算时间跨度和帧数 ===
      var cycleQuality = {};  // key: side_cycleIndex → {span, phaseCount, firstTime}
      phaseList.forEach(function (p) {
        var key = p.side + '_' + p.cycleIndex;
        if (!cycleQuality[key]) cycleQuality[key] = { span: 0, phaseCount: 0, firstTime: p.time, lastTime: p.time, minFrame: p.frameIndex, maxFrame: p.frameIndex };
        cycleQuality[key].phaseCount++;
        cycleQuality[key].lastTime = p.time;
        cycleQuality[key].span = p.time - cycleQuality[key].firstTime;
        if (p.frameIndex < cycleQuality[key].minFrame) cycleQuality[key].minFrame = p.frameIndex;
        if (p.frameIndex > cycleQuality[key].maxFrame) cycleQuality[key].maxFrame = p.frameIndex;
      });
      // 质量过滤: 放宽阈值, 只过滤极端垃圾周期
      var MIN_CYCLE_SPAN = 0.4;
      var MIN_CYCLE_FRAMES = 8;
      function isGoodCycle(side, cycleIndex) {
        var q = cycleQuality[side + '_' + cycleIndex];
        if (!q) return false;
        if (q.span < MIN_CYCLE_SPAN) return false;
        if (q.phaseCount < 8) return false;
        var frameSpan = q.maxFrame - q.minFrame;
        if (frameSpan < MIN_CYCLE_FRAMES) return false;
        return true;
      }

      // 收集所有候选 IC (用绝对阈值)
      var candidatesBySide = { left: [], right: [] };
      phaseList.forEach(function (p) {
        if (p.phase !== 'IC') return;
        if (p.dir === 'stationary') return;
        // === 跳过 cross-derive 出来的虚拟周期: 截图物理上必错 (虚拟 IC = 真实另一脚 MSt) ===
        if (p.derived === true) {
          console.log('[gait] skip derived (cross-derive virtual) cycle: ' + p.side + ' cy' + p.cycleIndex + ' (虚拟 HS 截图会显示另一只脚)');
          return;
        }
        if (!isGoodCycle(p.side, p.cycleIndex)) {
          console.log('[gait] skip bad cycle: ' + p.side + ' cy' + p.cycleIndex + ' (span/frames too small)');
          return;
        }
        candidatesBySide[p.side].push({
          cycleIndex: p.cycleIndex, time: p.time, dir: p.dir, closerSide: p.closerSide,
          span: cycleQuality[p.side + '_' + p.cycleIndex].span
        });
      });

      // === 相对时长过滤: 砍掉 truncated/merged cycle ===
      // 两种坏周期: ① 截断周期 (span 远短于中位, 时相挤在短窗, 画面是另一只脚)
      //            ② 漏检合并周期 (span 1.7-2.8s, 摆动相截图实际是下一周期)
      // 窗口用【双侧合并】中位 span: 单侧中位数易被该侧漏检/假阳性污染
      // (真实视频: 右脚 spans 0.4,0.7,0.95,1.65,1.7,2.76 → 单侧中位 1.65s 把合并周期放进窗口)
      var pooledSpans = candidatesBySide.left.concat(candidatesBySide.right)
        .map(function (c) { return c.span; }).sort(function (a, b) { return a - b; });
      if (pooledSpans.length >= 2) {
        var medianSpan = pooledSpans[Math.floor(pooledSpans.length / 2)];
        var minAcceptableSpan = Math.max(0.7, medianSpan * 0.8);
        var maxAcceptableSpan = medianSpan * 1.4;
        console.log('[gait] pooled candidate spans: ' + pooledSpans.map(function (s) { return s.toFixed(2); }).join(',') + ' | median=' + medianSpan.toFixed(2) + 's, acceptable=[' + minAcceptableSpan.toFixed(2) + ',' + maxAcceptableSpan.toFixed(2) + ']s');
        ['left', 'right'].forEach(function (sd) {
          candidatesBySide[sd] = candidatesBySide[sd].filter(function (c) {
            if (c.span < minAcceptableSpan) {
              console.log('[gait] reject truncated ' + sd + ' cy' + c.cycleIndex + ' t=' + c.time.toFixed(2) + 's (span=' + c.span.toFixed(2) + 's < ' + minAcceptableSpan.toFixed(2) + 's)');
              return false;
            }
            if (c.span > maxAcceptableSpan) {
              console.log('[gait] reject merged ' + sd + ' cy' + c.cycleIndex + ' t=' + c.time.toFixed(2) + 's (span=' + c.span.toFixed(2) + 's > ' + maxAcceptableSpan.toFixed(2) + 's, 漏检合并周期)');
              return false;
            }
            return true;
          });
        });
      }

      // 派生 fg / all (用过滤后的 candidates)
      var fgBySide = { left: [], right: [] };
      var allBySide = { left: [], right: [] };
      ['left', 'right'].forEach(function (sd) {
        candidatesBySide[sd].forEach(function (c) {
          allBySide[sd].push(c);
          if (c.closerSide === sd) fgBySide[sd].push(c);
        });
      });
      // 打印所有候选周期的详细信息
      ['left', 'right'].forEach(function (sd) {
        allBySide[sd].forEach(function (c) {
          console.log('[gait] candidate ' + sd + ' cy' + c.cycleIndex + ' t=' + c.time.toFixed(2) + 's dir=' + c.dir + ' closer=' + c.closerSide + (c.closerSide === sd ? ' [FG]' : ' [BG]') + ' span=' + c.span.toFixed(2) + 's');
        });
      });
      console.log('[gait] fg cycles: left=' + fgBySide.left.length + ' right=' + fgBySide.right.length +
                  ' | all cycles: left=' + allBySide.left.length + ' right=' + allBySide.right.length);
      // 优先用 closerSide 过滤的; 若一边为空则回落到 allBySide
      var useFg = { left: fgBySide.left.length > 0, right: fgBySide.right.length > 0 };
      var pickFrom = {
        left:  useFg.left  ? fgBySide.left  : allBySide.left,
        right: useFg.right ? fgBySide.right : allBySide.right
      };
      pickFrom.left.sort(function (a, b) { return a.time - b.time; });
      pickFrom.right.sort(function (a, b) { return a.time - b.time; });

      // === 方向配对 picker (修复: 不再 time-spread 选 firstSide+otherSide, 而是按方向分别选 representative) ===
      // 根因: 旧的 time-spread 选 "firstSide 最早的 IC + otherSide 时间间隔 ≥3s", 但这没保证 secondSide 的 cycle 在它的前景段 (closerSide === side).
      // 后果: 选了「right cycle 在 l2r 段」→ 截图里 left 是前景 → "右脚用了左脚画面"
      // 修复: 按 closerSide 把 candidates 分成前景/背景, 两脚各选自己的前景 cycle; 一边缺前景时退化到 all.
      // 然后为防止两脚选了同一 round-trip (太近), 用 MIN_TIME_GAP 配对检查 (≥3s 表示不同来回)

      // === Step 1: 为每只脚选自己的 representative cycle (该脚作为前景, 即 closerSide === side) ===
      // Fallback 顺序: 该脚前景 cycle → 该脚全部 cycle 中「前景段 + 优先 earliest」→ 任何 cycle
      function pickRep(side) {
        var pool = pickFrom[side];
        if (!pool.length) return null;
        // 优先: 该脚是前景的 cycle
        var fgCycles = pool.filter(function (c) { return c.closerSide === side; });
        if (fgCycles.length) return fgCycles[0];  // 最早的前景 cycle
        // 其次: 全部 cycle (用 all 兜底)
        return pool[0];
      }
      var leftRep = pickRep('left');
      var rightRep = pickRep('right');

      // === Step 2: 配对检查 — 两脚 representative cycle 的时间差 ≥ MIN_TIME_GAP 才算数 ===
      // 解释: 两只脚在同一来回内各自选 1 个 representative cycle, 但如果两个 representative 都在同一 round-trip,
      // 时间差 < 3s, 表示同一次来回, 截图视角相似, 不能完整覆盖左右差异 → 放弃这次配对
      var bestCycle = { left: null, right: null };
      if (leftRep) bestCycle.left = leftRep.cycleIndex;
      if (rightRep) bestCycle.right = rightRep.cycleIndex;

      // === Step 3: 配对不满足 → 退化: 用 time-spread 找一个 ≥ MIN_TIME_GAP 间隔的另一侧 cycle ===
      if (leftRep && rightRep) {
        var gap = Math.abs(leftRep.time - rightRep.time);
        if (gap < MIN_TIME_GAP) {
          console.log('[gait] direction-paired picker: gap=' + gap.toFixed(2) + 's < MIN_TIME_GAP, retrying with time-spread on other side');
          // 把较晚的一侧保留, 较早的一侧向后找一个 ≥ MIN_TIME_GAP 的 cycle
          var earlierSide = leftRep.time <= rightRep.time ? 'left' : 'right';
          var laterSide = earlierSide === 'left' ? 'right' : 'left';
          var laterRep = earlierSide === 'left' ? rightRep : leftRep;
          var foundAlternative = null;
          for (var j = 0; j < pickFrom[earlierSide].length; j++) {
            var c = pickFrom[earlierSide][j];
            if (Math.abs(c.time - laterRep.time) >= MIN_TIME_GAP) {
              foundAlternative = c;
              break;
            }
          }
          if (foundAlternative) {
            bestCycle[earlierSide] = foundAlternative.cycleIndex;
            console.log('[gait] time-spread fallback: ' + earlierSide + ' cycle ' + foundAlternative.cycleIndex +
                        ' at t=' + foundAlternative.time.toFixed(2) + 's (gap=' + Math.abs(foundAlternative.time - laterRep.time).toFixed(2) +
                        's from ' + laterSide + ' cy' + laterRep.cycleIndex + ' dir=' + foundAlternative.dir + ' closer=' + foundAlternative.closerSide + ')');
          }
        }
      }

      // 报警
      var missingDir = [];
      if (!bestCycle.left)  missingDir.push('左脚 cycle 不存在 (视频太短 / 单方向走动 / HS 检测失败)');
      if (!bestCycle.right) missingDir.push('右脚 cycle 不存在 (视频太短 / 单方向走动 / HS 检测失败)');
      if (missingDir.length) {
        var w = window.__gaitAnalysis && window.__gaitAnalysis.getState && window.__gaitAnalysis.getState();
        if (w && w.onPhaseError) w.onPhaseError(missingDir.join('; '));
        console.warn('[gait] ' + missingDir.join('; '));
      }
      console.log('[gait] selected cycles (direction-paired picker): left=cy' + bestCycle.left +
                  ' (t=' + (leftRep ? leftRep.time.toFixed(2) : '?') + ', dir=' + (leftRep ? leftRep.dir : '?') + ', closer=' + (leftRep ? leftRep.closerSide : '?') + ')' +
                  ' right=cy' + bestCycle.right +
                  ' (t=' + (rightRep ? rightRep.time.toFixed(2) : '?') + ', dir=' + (rightRep ? rightRep.dir : '?') + ', closer=' + (rightRep ? rightRep.closerSide : '?') + ')');

      var targets = phaseList.filter(function (p) {
        return p.cycleIndex === bestCycle[p.side];
      });
      var snapshots = [];
      // 同一脚同周期的截图必须取不同帧: 记录已用帧索引, 避免重复
      var usedFrameIdx = {};
      for (var ti = 0; ti < targets.length; ti++) {
        var tp = targets[ti];
        var key = tp.side + '_' + tp.cycleIndex;
        var bestFrame = null, bestIdx = -1;

        // 优先: phaseList 带了 frameIndex (按姿态直接选的帧), 直接用
        if (tp.frameIndex != null && capturedFrames[tp.frameIndex]) {
          bestIdx = tp.frameIndex;
          // === 关键验证: 该帧 MediaPipe 是否真识别到人? ===
          // 不验证的话, build() 推错的 IC 帧 (heelY 模式匹配兜底到中段) 会让截图是空 pose 帧
          if (!frameHasValidPose(bestIdx)) {
            var nearFi = findNearestValidFrame(bestIdx);
            if (nearFi >= 0 && !usedFrameIdx[key + '_' + nearFi]) {
              console.log('[gait] snap ' + tp.side + ' ' + tp.label +
                ' 原始 frameIdx=' + bestIdx + ' 无有效 pose → 用邻近 frameIdx=' + nearFi + ' (pose validation)');
              bestIdx = nearFi;
            } else if (nearFi >= 0 && usedFrameIdx[key + '_' + nearFi]) {
              // 已占用 → 找下一个未占用
              for (var delta = 1; delta < 15; delta++) {
                var tryPos = nearFi + delta;
                if (tryPos < capturedFrames.length && !usedFrameIdx[key + '_' + tryPos] && frameHasValidPose(tryPos)) {
                  bestIdx = tryPos;
                  console.log('[gait] snap ' + tp.side + ' ' + tp.label + ' → 用 frameIdx=' + bestIdx + ' (已占用 fallback)');
                  break;
                }
                tryPos = nearFi - delta;
                if (tryPos >= 0 && !usedFrameIdx[key + '_' + tryPos] && frameHasValidPose(tryPos)) {
                  bestIdx = tryPos;
                  console.log('[gait] snap ' + tp.side + ' ' + tp.label + ' → 用 frameIdx=' + bestIdx + ' (已占用 fallback)');
                  break;
                }
              }
            } else {
              // ±15 帧都没找到有效 pose → 丢弃该时相截图, 不输出幻觉
              console.warn('[gait] snap ' + tp.side + ' ' + tp.label +
                ' 原始 frameIdx=' + bestIdx + ' 且 ±15 帧都无有效 pose, 丢弃该时相 (避免幻觉截图)');
              continue;
            }
          }
          // 帧已被占用 → 找相邻未占用帧
          if (usedFrameIdx[key + '_' + bestIdx]) {
            for (var delta = 1; delta < 10; delta++) {
              if (capturedFrames[bestIdx + delta] && !usedFrameIdx[key + '_' + (bestIdx + delta)]) {
                bestIdx = bestIdx + delta; break;
              }
              if (capturedFrames[bestIdx - delta] && !usedFrameIdx[key + '_' + (bestIdx - delta)]) {
                bestIdx = bestIdx - delta; break;
              }
            }
          }
          bestFrame = capturedFrames[bestIdx];
        } else {
          // 兜底: 没有 frameIndex, 用时间找最近且未被占用的帧
          var candidates = [];
          for (var fi = 0; fi < capturedFrames.length; fi++) {
            candidates.push({ idx: fi, dist: Math.abs(capturedFrames[fi].t - tp.time) });
          }
          candidates.sort(function (a, b) { return a.dist - b.dist; });
          for (var ci = 0; ci < candidates.length; ci++) {
            if (usedFrameIdx[key + '_' + candidates[ci].idx]) continue;
            // 同样验证 pose
            if (!frameHasValidPose(candidates[ci].idx)) continue;
            bestIdx = candidates[ci].idx; break;
          }
          if (bestIdx >= 0) bestFrame = capturedFrames[bestIdx];
        }

        if (bestFrame) {
          usedFrameIdx[key + '_' + bestIdx] = true;
          console.log('[gait] snap ' + tp.side + ' ' + tp.label +
            ' phaseT=' + tp.time.toFixed(2) + 's frameIdx=' + bestIdx + ' frameT=' + bestFrame.t.toFixed(2) + 's');
          snapshots.push({
            side: tp.side, cycleIndex: tp.cycleIndex,
            phase: tp.phase, label: tp.label,
            time: tp.time, stance: tp.stance,
            imageData: bestFrame.imageData,
            w: bestFrame.w, h: bestFrame.h
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
      fps = fps || 15;
      var duration = videoEl.duration;
      if (!isFinite(duration) || duration <= 0) return reject(new Error('Invalid video duration'));
      var frameCount = Math.min(Math.floor(duration * fps), 600);
      if (frameCount <= 0) return reject(new Error('Invalid frameCount: ' + frameCount));
      console.log('[gait] extractFrames: duration=' + duration.toFixed(1) + 's fps=' + fps + ' total=' + frameCount + ' frames');
      var actualFps = frameCount / duration;
      var frames = [];
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var idx = 0;
      var finished = false;
      var seekTimer = null;

      function scheduleSeek() {
        if (finished) return;
        if (idx >= frameCount) { finishAndResolve(); return; }
        var target = idx / actualFps;
        // nudge 确保 seeked 事件触发
        if (Math.abs((videoEl.currentTime || 0) - target) < 0.003) {
          target = target > 0.001 ? target - 0.003 : target + 0.003;
        }
        try { videoEl.currentTime = target; } catch (e) {}
        // 防断链: 如果 3000ms 内 seeked 不触发, 跳过当前帧继续下一个
        seekTimer = setTimeout(function () {
          if (finished) return;
          console.warn('[gait] seek timeout at idx=' + idx + ' t=' + target.toFixed(2));
          idx++;
          scheduleSeek();
        }, 3000);
      }

      function onSeeked() {
        if (finished) return;
        clearTimeout(seekTimer);
        try {
          if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            frames.push({ t: idx / actualFps, imageData: canvas.toDataURL('image/jpeg', 0.5), w: canvas.width, h: canvas.height });
          }
        } catch (e) { /* skip bad frame */ }
        idx++;
        updateProcessingProgress(0.05 + (idx / frameCount) * 0.2);
        scheduleSeek();
      }

      function finishAndResolve() {
        if (finished) return;
        finished = true;
        clearTimeout(seekTimer);
        videoEl.removeEventListener('seeked', onSeeked);
        videoEl.removeEventListener('error', onError);
        try { videoEl.pause(); } catch (e) {}
        console.log('[gait] extractFrames done: ' + frames.length + '/' + frameCount + ' frames');
        resolve(frames);
      }

      function onError() { if (!finished) { finished = true; reject(new Error('Video error')); } }

      videoEl.addEventListener('seeked', onSeeked);
      videoEl.addEventListener('error', onError);

      // 全局超时: 120s
      var globalTimeout = setTimeout(function () {
        if (finished) return;
        console.warn('[gait] extractFrames global timeout, captured ' + frames.length);
        if (frames.length >= 10) finishAndResolve();
        else { finished = true; reject(new Error('帧提取超时')); }
      }, 120000);

      scheduleSeek();
    });
  }

  // ============================================================
  // 姿势检测
  // ============================================================
  async function detectPoses(frames) {
    var detector = await loadPoseDetection();
    var keypointFrames = [];
    var lastTsMs = -1;  // VIDEO 模式时间戳: 必须严格单调递增
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
        // 帧时间(秒)→毫秒; 相邻帧 t 相同 (或舍入后相同) 时强制 +1, 保证 detectForVideo 时间戳严格递增
        var tsMs = Math.round(f.t * 1000);
        if (tsMs <= lastTsMs) tsMs = lastTsMs + 1;
        lastTsMs = tsMs;
        var poses = await detector.estimatePoses(img, { flipHorizontal: false, timestampMs: tsMs });
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

      // 2. 提取帧 — 20fps (来回走动视频需要 ≥10fps/方向 才能可靠检测两侧, 15fps 在手机上经常掉到 10-12)
      $('#gait-progress-title').textContent = '提取视频帧...';
      var frames = await extractFrames(v, 20);
      console.log('[gait] extracted: ' + frames.length + ' frames, t=' +
        (frames[0] ? frames[0].t.toFixed(1) : '?') + 's-' +
        (frames[frames.length - 1] ? frames[frames.length - 1].t.toFixed(1) : '?') + 's');
      updateProcessingProgress(0.25);

      if (frames.length < 5) throw new Error('视频帧数过少 (需要至少 5 帧, 实际 ' + frames.length + ')');

// 检测有效帧率: 实际捕获 < 70% 目标 → 手机 seek 性能差, 提示用户但继续处理
var expectedFrames = Math.floor(v.duration * 20);  // 当前 extractFrames 的目标 fps
var effectiveFps = frames.length / v.duration;
if (frames.length < expectedFrames * 0.7) {
  console.warn('[gait] 帧捕获率 ' + (frames.length / expectedFrames * 100).toFixed(0) +
               '% (' + frames.length + '/' + expectedFrames + ') — 有效 fps≈' + effectiveFps.toFixed(1) +
               '. 来回走动视频可能丢失一侧.');
}

      // 3. 加载 AI 模型 + 姿势检测
      $('#gait-progress-title').textContent = '加载 AI 姿势识别模型...';
      $('#gait-progress-text').textContent = '首次使用需下载 ~6MB MediaPipe 模型, 请稍候';
      updateProcessingProgress(0.28);
      var keypointFrames = await detectPoses(frames);
      updateProcessingProgress(0.90);

      // 诊断: 统计关键点覆盖率 (MediaPipe 是否检测到人体)
      // 严格质量门槛: 半数帧有有效全身姿势 + 双脚踝被同时检测到
      // 之前 kpRate < 0.1 太宽松, 45% 覆盖率仍能通过, 导致无人物帧被 "HS detection 飞"
      var framesWithFullBody = 0, framesWithBothAnkles = 0;
      var framesWithAnyKP = 0, framesWithLAnkle = 0, framesWithRAnkle = 0, totalKP = 0;
      for (var fi = 0; fi < keypointFrames.length; fi++) {
        var kps = keypointFrames[fi].keypoints || [];
        if (kps.length > 0) framesWithAnyKP++;
        totalKP += kps.length;
        // 全身姿势: ≥10 个关键点 (MediaPipe Pose 33 点中至少 10 个 score ≥ 0.3)
        var goodKPs = 0;
        var hasLAnkle = false, hasRAnkle = false;
        for (var ki = 0; ki < kps.length; ki++) {
          if (kps[ki].score >= 0.3) {
            goodKPs++;
            if (kps[ki].name === 'left_ankle')  hasLAnkle = true;
            if (kps[ki].name === 'right_ankle') hasRAnkle = true;
          }
        }
        if (goodKPs >= 10) framesWithFullBody++;
        if (hasLAnkle) framesWithLAnkle++;
        if (hasRAnkle) framesWithRAnkle++;
        if (hasLAnkle && hasRAnkle) framesWithBothAnkles++;
      }
      console.log('[gait] keypoint coverage: anyKP=' + framesWithAnyKP + '/' + keypointFrames.length +
        ' fullBody=' + framesWithFullBody + ' bothAnkles=' + framesWithBothAnkles +
        ' L=' + framesWithLAnkle + ' R=' + framesWithRAnkle + ' totalKP=' + totalKP);
      var fullBodyRate = framesWithFullBody / Math.max(1, keypointFrames.length);
      var bothAnkleRate = framesWithBothAnkles / Math.max(1, keypointFrames.length);
      if (fullBodyRate < 0.30) {
        throw new Error('视频中未检测到稳定人体姿势 (全身姿势覆盖率仅 ' + Math.round(fullBodyRate * 100) +
          '%). 可能原因: ① 人物未全身入镜 (脚部被裁剪) ② 光线太暗/逆光 ③ 镜头离人太远 ④ 摄像头权限被拒. 请重新拍摄.');
      }
      if (bothAnkleRate < 0.20) {
        throw new Error('未同时检测到双脚踝位置 (双脚可见率 ' + Math.round(bothAnkleRate * 100) +
          '%). 请确保患者脚部全程在画面下半部分, 不要被裤子/鞋袜遮挡.');
      }

      // 3b. 逐帧左右归侧 — MediaPipe left_/right_ 是解剖学标签, 侧方拍摄/背面走时可能整体判反
      // 旧方案: detectWalkingDirection + resolveAnatomicalSides 全局一次性 swap —
      //        来回走动时去程/回程近脚侧相反, 全局 swap 必然把其中一个方向归错
      // 新方案: resolveAndSwapSidesByFrame 按每帧局部步向 + cameraSide 决定期望近脚侧,
      //        原地逐帧 swap 关键点标签 (返回 {frames, swapNeeded, swapRatio, cameraSide, reason})
      var sideResolution = window.__gaitParams.resolveAndSwapSidesByFrame(keypointFrames, state.cameraSide);
      keypointFrames = sideResolution.frames;
      console.log('[gait] per-frame side resolution: reason=' + sideResolution.reason +
        ' swapRatio=' + ((sideResolution.swapRatio || 0) * 100).toFixed(1) + '%' +
        ' swapNeeded=' + sideResolution.swapNeeded + ' cameraSide=' + sideResolution.cameraSide);
      // walkDir 仅供报告展示 (骨盆 X 整体趋势, 不受左右归侧影响)
      var walkDir = window.__gaitParams.detectWalkingDirection(keypointFrames);
      updateProcessingProgress(0.92);

      // 3c. 默认标定 → 自动身高估算
      // 真实视频确诊: 默认 1/130 与真实比例可差 2-3 倍, 步长/步宽全部失真 → 分类误判
      // 用检测到的中位人体像素身高, 按假设身高 1.70m 换算 scale (比拍脑袋 1/130 准得多)
      if (state.calibration.method === 'default' && window.__gaitParams.estimateBodyHeightPx) {
        var estBodyH = window.__gaitParams.estimateBodyHeightPx(keypointFrames);
        if (estBodyH && estBodyH > 100) {
          var autoScale = (ASSUMED_HEIGHT_M * 0.97) / estBodyH;
          console.log('[gait] 自动标定: bodyH=' + estBodyH.toFixed(0) + 'px, 假设身高 ' + ASSUMED_HEIGHT_M + 'm → scale=1/' +
            (1 / autoScale).toFixed(0) + 'px/m (替代默认 1/130)');
          state.calibration.scale = autoScale;
          state.calibration.method = 'auto-height';
          state.calibration.note = '自动估算 (假设身高 ' + Math.round(ASSUMED_HEIGHT_M * 100) + 'cm, 如需精确请用身高标定)';
        }
      }

      // 4. 计算步态参数
      state.capturedFrames = keypointFrames;
      var params = window.__gaitParams.computeAllParams(keypointFrames, state.calibration.scale);
      if (params.error) throw new Error('参数计算失败: ' + params.error);

      // 4b. 步态周期时相 (8 时相 Rancho Los Amigos) — 依赖参数计算后的 heelStrikes
      updateProcessingProgress(0.94);
      var gaitPhases, phaseTimestamps, phaseSnapshots;
      if (params.degraded) {
        gaitPhases = [];
        phaseTimestamps = [];
        phaseSnapshots = [];
      } else {
        // 事件源统一: 时相/截图/报告共用同一次 detectGaitEvents (Zeni 骨盆相对法) 的 HS/TO —
        // 旧代码 HS 取自 pelvis-rel 而 TO 另跑 legacy detectToeOffs, 两套事件时间基准不一致,
        // 导致时相截图与事件曲线对不上
        var gaitEvents = window.__gaitParams.detectGaitEvents(keypointFrames);
        var leftHS, rightHS, leftTO, rightTO;
        if (gaitEvents.usedMethod === 'pelvis-rel') {
          leftHS  = gaitEvents.left.hs;  rightHS = gaitEvents.right.hs;
          leftTO  = gaitEvents.left.to;  rightTO = gaitEvents.right.to;
          phaseTimestamps = window.__gaitParams.computePhaseTimestamps(gaitEvents, keypointFrames);
        } else {
          // 骨盆相对法不可用 — 与 computeAllParams 内部一致退回旧 Y 轨迹法
          leftHS  = (params.heelStrikes && params.heelStrikes.left)  || [];
          rightHS = (params.heelStrikes && params.heelStrikes.right) || [];
          leftTO  = window.__gaitParams.detectToeOffs(keypointFrames, 'left',  leftHS);
          rightTO = window.__gaitParams.detectToeOffs(keypointFrames, 'right', rightHS);
          phaseTimestamps = window.__gaitParams.computePhaseTimestamps(keypointFrames, leftHS, leftTO, rightHS, rightTO);
        }
        gaitPhases = window.__gaitParams.computeGaitCyclePhases(keypointFrames, leftHS, leftTO, rightHS, rightTO);

        // 4c. 时相截图
        $('#gait-progress-title').textContent = '提取时相截图...';
        phaseSnapshots = [];
        try {
          phaseSnapshots = await capturePhaseSnapshots(frames, phaseTimestamps, keypointFrames);
          console.log('[gait] phase snapshots: ' + phaseSnapshots.length + ' captured from ' + phaseTimestamps.length + ' timestamps');
        } catch (e) {
          console.warn('[gait] phase snapshots failed (non-fatal):', e.message);
          phaseSnapshots = [];
        }
      }
      updateProcessingProgress(0.96);

      var classification, neuro, rehab;
      if (params.degraded) {
        classification = { primary: 'limited', confidence: 0, scores: { limited: 1 }, note: '步态周期检测不足 — 仅输出运动学参数' };
        neuro = { note: '步态周期不足, 无法进行神经定位' };
        rehab = { note: '步态周期不足, 仅提供基础运动学参考' };
      } else {
        classification = window.__gaitParams.classifyGait(params);
        neuro = window.__gaitParams.getNeuroLocalization(classification.primary);
        rehab = window.__gaitParams.getRehabSuggestions(classification.primary);
      }

      // 报告模板读 r.calibration.cameraSide — 汇总结果前写入实际拍摄侧 (此前漏写, 报告永远显示默认"右")
      state.calibration.cameraSide = state.cameraSide;

      state.results = {
        timestamp: Date.now(),
        degraded: !!params.degraded,
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
        pelvic: params.pelvic || null,
        sideResolution: sideResolution,
        walkingDirection: walkDir,
        eventsMethod: params.eventsMethod || null,  // 'pelvis-rel' | 'none' — debug 视图标题用
        debug: params.debug || null,                // detectGaitEvents 调试轨迹 (heelRel/toeRel/heelY/toeY, 含 NaN 洞)
        heelStrikes: params.heelStrikes || { left: [], right: [] },  // HS 事件 (debug 视图竖线)
        phaseTimestamps: phaseTimestamps,           // 8 时相选帧结果 (debug 视图每周期明细表)
        brainProfile: window.__gaitParams.computeBrainGaitProfile(
          params.armSwing, params.elbowSwing, params.kneeLeft, params.kneeRight, params
        ),
        events: {
          leftHeelStrikes: params.heelStrikes ? params.heelStrikes.left || [] : [],
          rightHeelStrikes: params.heelStrikes ? params.heelStrikes.right || [] : [],
          leftToeOffs: params.degraded ? [] : leftTO,
          rightToeOffs: params.degraded ? [] : rightTO
        },
        gaitPhases: gaitPhases,
        phaseSnapshots: phaseSnapshots,
        classification: classification,
        neuro: neuro,
        rehab: rehab
      };

      // 5. 累积到多段视频结果 + 合并 + 持久化
      state.videoSegments.push(state.results);
      mergeSegments();
      // 如果是补录段, 完成后清掉 hint
      state.nextSegmentHint = null;
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
        state.errorMessage = '<b>视频无法解码 — 编码为 HEVC/H.265</b><br><br>' +
          '该 MP4 文件视频流是 <b>H.265/HEVC</b> 编码, 桌面 Chrome/Edge 均不支持此类解码。<br><br>' +
          '<b>✅ 推荐做法</b>: 用 <b>手机浏览器直接打开此页面</b>, 点击"录制"拍摄行走视频并分析 — 手机浏览器天然支持 HEVC。<br><br>' +
          '<b>或重新录制兼容视频</b>:<br>' +
          '• iPhone: 设置→相机→格式→选"<b>兼容性最佳</b>" (输出 H.264/MP4)<br>' +
          '• Android: 相机设置→视频编码→选 <b>H.264</b> 而非 H.265';
      } else if (msg.indexOf('帧数过少') !== -1) {
        state.errorMessage = '视频帧数不足, 请确保视频 > 2 秒且人物在画面中行走。';
      } else if (msg.indexOf('未检测到人体') !== -1) {
        state.errorMessage = '<b>视频中未检测到人体姿势</b><br><br>' +
          'AI 模型在视频帧中找不到人体关键点。<br>' +
          '<b>请检查</b>:<br>' +
          '1. 人物是否从头到脚<b>完整入镜</b><br>' +
          '2. 光线是否<b>充足</b> (太暗会检测不到)<br>' +
          '3. 拍摄角度 — 应站在<b>斜前方约45°</b>位置<br>' +
          '4. 人物是否离摄像头过远 (建议 <b>2-4 米</b>)';
      } else if (msg.indexOf('未检测到脚踝') !== -1) {
        state.errorMessage = '<b>未检测到脚踝位置</b><br><br>' +
          '姿势模型检测到了人体但脚踝关键点缺失。<br>' +
          '<b>请检查</b>:<br>' +
          '1. 双脚是否<b>全程可见</b> (不被遮挡/出镜)<br>' +
          '2. 避免穿<b>深色裤子或深色鞋子</b> (与地板对比度低)<br>' +
          '3. 确保脚部有明显光照';
      } else {
        state.errorMessage = '分析失败: ' + msg + '<br><br>请确认视频中有人行走, 且拍摄角度为斜前方约45°。如持续失败, 请尝试重录。';
      }
      // 失败时清掉补录提示, 避免下一段还以为是补录模式
      state.nextSegmentHint = null;
      setPhase(PHASE.CAPTURE);
    }
  }

  // ============================================================
  // 多段视频合并 — 把多段独立视频的结果拼成一个完整 reports
  // phaseSnapshots 按 side 合并: 各段只填它检测到的脚, 缺的由其他段补
  // 其他参数 (步速/步频/对称性) 取最新段的值
  // ============================================================
  function mergeSegments() {
    if (!state.videoSegments || state.videoSegments.length === 0) return;
    if (state.videoSegments.length === 1) {
      state.results = state.videoSegments[0];
      return;
    }
    var latest = state.videoSegments[state.videoSegments.length - 1];
    // 浅拷贝最新段作为基底 (参数/分类/神经定位都用最新)
    var merged = {};
    for (var k in latest) {
      if (k === 'phaseSnapshots' || k === 'segments') continue;
      merged[k] = latest[k];
    }
    // 合并所有段的 phaseSnapshots — 按 side+phase 去重, 后录的覆盖先录的 (倒序遍历, 先记后段)
    var seenKeys = {};
    var allSnaps = [];
    for (var i = state.videoSegments.length - 1; i >= 0; i--) {
      var segSnaps = (state.videoSegments[i] && state.videoSegments[i].phaseSnapshots) || [];
      segSnaps.forEach(function (s) {
        var key = s.side + '_' + s.phase;
        if (seenKeys[key]) return;
        seenKeys[key] = true;
        allSnaps.push(s);
      });
    }
    // 反转回正序, 按 IC→TSw 显示更自然
    allSnaps.reverse();
    merged.phaseSnapshots = allSnaps;
    merged.segments = state.videoSegments.length;
    state.results = merged;
    console.log('[gait] merged ' + state.videoSegments.length + ' segments: ' + allSnaps.length + ' phase snapshots total');
  }

  // 找出 phaseSnapshots 中缺失的那一侧 ('left' / 'right' / null)
  function getMissingPhaseSide() {
    var snaps = state.results && state.results.phaseSnapshots;
    if (!snaps || snaps.length === 0) return null; // 完全空, 不算缺
    var hasLeft = false, hasRight = false;
    snaps.forEach(function (s) {
      if (s.side === 'left') hasLeft = true;
      if (s.side === 'right') hasRight = true;
    });
    if (!hasLeft) return 'left';
    if (!hasRight) return 'right';
    return null;
  }

  // ============================================================
  // localStorage 持久化
  // ============================================================
  var STORAGE_KEY = 'gait_assessment_log';

  // 患者信息来源 (优先级): URL/sessionStorage 预填 (治疗师建链接时带 name/age/gender)
  //   → localStorage['cervical_current_client'] (与认知评估共享)
  function _getGaitPatientInfo() {
    try {
      var raw = sessionStorage.getItem('bm_gait_patient_info');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && (p.name || p.age || p.gender)) return { name: p.name || '', age: p.age || '', gender: p.gender || '' };
      }
    } catch (e) {}
    try {
      var raw2 = localStorage.getItem('cervical_current_client');
      if (raw2) {
        var p2 = JSON.parse(raw2);
        if (p2 && p2.name) return { name: p2.name || '', age: p2.age || '', gender: p2.gender || '' };
      }
    } catch (e) {}
    return { name: '', age: '', gender: '' };
  }

  // 登记表单 (复用 cognitive-report.js _showPatientRegForm 的模式, 步态绿色主题)
  // 仅在带 share_token 且缺少患者信息时弹出 — 无 token 的本地流程不打扰
  function _showGaitPatientForm(onSubmit) {
    var existing = document.getElementById('gait-reg-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'gait-reg-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px 26px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);">' +
        '<h3 style="color:#0f172a;text-align:center;margin:0 0 6px;font-size:19px;">📝 登记患者信息</h3>' +
        '<p style="color:#64748b;text-align:center;font-size:12px;margin:0 0 20px;">步态分析已完成 · 填写信息后保存并上传云端</p>' +
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;color:#334155;font-size:12px;margin-bottom:5px;">姓名 *</label>' +
          '<input id="gait-reg-name" type="text" placeholder="如：张三" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:15px;box-sizing:border-box;outline:none;">' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;color:#334155;font-size:12px;margin-bottom:5px;">年龄</label>' +
          '<input id="gait-reg-age" type="number" min="1" max="120" placeholder="如：65" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:15px;box-sizing:border-box;outline:none;">' +
        '</div>' +
        '<div style="margin-bottom:20px;">' +
          '<label style="display:block;color:#334155;font-size:12px;margin-bottom:5px;">性别</label>' +
          '<select id="gait-reg-gender" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:15px;box-sizing:border-box;outline:none;background:#fff;">' +
            '<option value="">请选择</option><option>男</option><option>女</option><option>其他</option>' +
          '</select>' +
        '</div>' +
        '<button id="gait-reg-submit" style="display:block;width:100%;padding:13px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:16px;font-weight:700;">保存报告</button>' +
      '</div>';
    document.body.appendChild(overlay);
    setTimeout(function(){ var n = document.getElementById('gait-reg-name'); if (n) n.focus(); }, 50);
    document.getElementById('gait-reg-submit').addEventListener('click', function() {
      var name = (document.getElementById('gait-reg-name').value || '').trim();
      if (!name) {
        var n2 = document.getElementById('gait-reg-name');
        n2.style.borderColor = '#ef4444';
        n2.focus();
        return;
      }
      var info = {
        name: name,
        age: (document.getElementById('gait-reg-age').value || '').trim(),
        gender: document.getElementById('gait-reg-gender').value
      };
      // 与认知评估共享患者信息
      try { localStorage.setItem('cervical_current_client', JSON.stringify(info)); } catch(e) {}
      overlay.remove();
      onSubmit(info);
    });
  }

  function saveAssessment(r) {
    var info = _getGaitPatientInfo();
    var hasToken = false;
    try { hasToken = !!sessionStorage.getItem('bm_gait_share_token'); } catch (e) {}
    if (hasToken && !info.name) {
      // 云端流程必须带患者姓名 — 先登记再保存 (本地流程不弹, 行为不变)
      _showGaitPatientForm(function(info2) { _doSaveAssessment(r, info2); });
      return;
    }
    _doSaveAssessment(r, info);
  }

  function _doSaveAssessment(r, patientInfo) {
    try {
      // debug 轨迹 (heelRel/toeRel 等, 帧数×6 数组) 只供本次会话的调试视图,
      // 体积随帧数线性增长 — 持久化前剥掉, 否则 50 条上限很快撑爆 localStorage
      var toSave = r;
      if (r && r.debug) {
        toSave = {};
        for (var k in r) { if (k !== 'debug') toSave[k] = r[k]; }
      }
      toSave.patientInfo = patientInfo || { name: '', age: '', gender: '' };
      toSave._localId = 'gait_' + Date.now();
      var log = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      log.push(toSave);
      // 上限保留 50 条
      if (log.length > 50) log = log.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
      // 云端上传 — 只走 Supabase (需 share_token); 无 token 时行为与纯本机完全一致
      _submitGaitCloud(toSave);
    } catch (e) {
      console.warn('[gait] saveAssessment error', e);
    }
  }

  // ========== CLOUD (Supabase — 步态报告上云) ==========
  // share_token 来源: 治疗师工作台生成的步态链接 (?mode=gait&share_token=...),
  // index.html deep-link 解析时写入 sessionStorage
  function _getGaitShareToken() {
    try { return sessionStorage.getItem('bm_gait_share_token') || ''; } catch (e) { return ''; }
  }

  // 状态写回 gait_assessment_log (按 _localId 匹配)
  function _markGaitCloud(localId, status, err, cloudId) {
    try {
      var log = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      for (var i = 0; i < log.length; i++) {
        if (log[i]._localId === localId) {
          log[i]._cloudStatus = status;
          if (cloudId) { log[i]._cloudId = cloudId; log[i]._cloudSource = 'supabase'; }
          if (err) log[i]._cloudErr = err; else delete log[i]._cloudErr;
          break;
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch (e) {}
  }

  // 提交到 Supabase (走 RPC, therapist_id 由 share_token 派生)
  // RPC 未部署/失败时优雅降级: 只标记 _cloudErr, 不影响本地报告
  function _submitGaitCloud(record) {
    var shareToken = _getGaitShareToken();
    if (!shareToken || !record || !record._localId) return;
    if (!(window.SupabaseClient && window.SupabaseClient.isConfigured())) {
      _markGaitCloud(record._localId, 'failed', 'supabase_not_configured');
      return;
    }
    _markGaitCloud(record._localId, 'syncing');
    // payload: 完整步态报告, 但剥离 phaseSnapshots (时相截图 dataURL 体积大, 本地保留)
    // 和本地云状态字段
    var payload = {};
    try {
      Object.keys(record).forEach(function(k) {
        if (k === 'phaseSnapshots' || k.indexOf('_cloud') === 0 || k === '_localId') return;
        payload[k] = record[k];
      });
    } catch (e) { payload = { classification: record.classification || null }; }
    window.SupabaseClient.submitGaitAssessment({
      shareToken: shareToken,
      patientInfo: record.patientInfo || {},
      payload: payload,
      classificationPrimary: (record.classification && record.classification.primary) || null
    }).then(function(assessmentId) {
      _markGaitCloud(record._localId, 'synced', null, assessmentId);
    }).catch(function(err) {
      console.error('[gait] Supabase 提交失败:', err);
      _markGaitCloud(record._localId, 'failed', String(err && err.message || err));
    });
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
    // 补录模式提示: 如果有方向 hint, 在顶部给出明确指示
    var hintBanner = '';
    if (state.nextSegmentHint) {
      var hint = state.nextSegmentHint;
      var hSideLabel = hint === 'left' ? '左脚' : '右脚';
      var hDirLabel = hint === 'left' ? '从右向左' : '从左向右';
      hintBanner = '<div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:12px;box-shadow:0 4px 12px rgba(245,158,11,0.25);">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">➕ 补录第 ' + (state.videoSegments.length + 1) + ' 段 — 捕获 ' + hSideLabel + ' 时相</div>' +
        '<div style="font-size:13px;line-height:1.6;opacity:0.95;">这一次请 <b>走 ' + hDirLabel + '</b>，让 ' + hSideLabel + ' 面向摄像头。当前已录 ' + state.videoSegments.length + ' 段。</div>' +
      '</div>';
    }
    setBody(
      errHtml +
      hintBanner +
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
      setStatus('⏳ 首次使用需加载 MediaPipe 模型, 请稍候...', '#444');
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
    // 补录模式提示横幅 (CAPTURE 阶段也需要, 因为上传路径直接进这里)
    var captureHintBanner = '';
    if (state.nextSegmentHint) {
      var hint = state.nextSegmentHint;
      var hSideLabel = hint === 'left' ? '左脚' : '右脚';
      var hDirLabel = hint === 'left' ? '从右向左' : '从左向右';
      captureHintBanner = '<div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:10px;box-shadow:0 4px 12px rgba(245,158,11,0.25);">' +
        '<div style="font-size:14px;font-weight:700;margin-bottom:2px;">➕ 补录第 ' + (state.videoSegments.length + 1) + ' 段 — 捕获 ' + hSideLabel + ' 时相</div>' +
        '<div style="font-size:12px;line-height:1.5;opacity:0.95;">请 <b>走 ' + hDirLabel + '</b>，让 ' + hSideLabel + ' 面向摄像头。已录 ' + state.videoSegments.length + ' 段。</div>' +
      '</div>';
    }
    setBody(
      errHtml +
      captureHintBanner +
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
          '<div id="gait-video-cal-area" style="margin-top:10px;padding:12px;background:#f0f2f5;border-radius:8px;text-align:left;">' +
            '<div id="gait-video-cal-status" style="font-size:13px;color:#444;text-align:center;">' +
              (state.calibration.method === 'height'
                ? '✓ 已标定: ' + (state.calibration.scale * 100).toFixed(2) + ' cm/px (身高 ' + state.calibration.heightCm + 'cm)'
                : '⚠️ 未标定 — 请输入身高, 从视频开头站立帧自动标定') +
            '</div>' +
            '<div id="gait-video-cal-form" style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:8px;' + (state.calibration.method === 'height' ? 'display:none;' : '') + '">' +
              '<span style="font-size:13px;color:#333;white-space:nowrap;">身高(cm):</span>' +
              '<input id="gait-video-cal-height" type="number" min="100" max="220" step="1" value="' + (state.calibration.heightCm || 170) + '" style="width:70px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">' +
              '<button id="gait-video-cal-btn" style="padding:6px 16px;background:linear-gradient(135deg,#43E97B,#38F9D7);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap;">📏 从视频标定</button>' +
            '</div>' +
          '</div>' +
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

    // 从视频开头站立帧自动标定身高
    var calBtn = $('#gait-video-cal-btn');
    if (calBtn) {
      calBtn.addEventListener('click', function () {
        var video = $('#gait-preview-video');
        var heightCm = parseInt($('#gait-video-cal-height').value, 10) || 170;
        var statusEl = $('#gait-video-cal-status');
        if (!video || !video.videoWidth) {
          if (statusEl) { statusEl.textContent = '视频未就绪, 请稍候再试'; statusEl.style.color = '#dc2626'; }
          return;
        }
        calBtn.disabled = true;
        calBtn.textContent = '⏳ 标定中...';
        if (statusEl) { statusEl.textContent = '⏳ 加载 AI 模型并从视频开头检测站立姿势...'; statusEl.style.color = '#444'; }

        // seek 到视频开头 ~1 秒处 (站立相), 截帧检测
        var seekT = Math.min(1.0, (video.duration || 2) / 2);
        var detectCanvas = document.createElement('canvas');
        var detectCtx = detectCanvas.getContext('2d');

        function doDetect() {
          loadPoseDetection().then(function (detector) {
            detectCanvas.width = video.videoWidth;
            detectCanvas.height = video.videoHeight;
            detectCtx.drawImage(video, 0, 0, detectCanvas.width, detectCanvas.height);
            return detector.estimatePoses(detectCanvas, { flipHorizontal: false });
          }).then(function (poses) {
            var pose = poses && poses[0];
            if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
              throw new Error('未检测到人体');
            }
            var kps = pose.keypoints.map(function (k) {
              return { x: k.x, y: k.y, score: k.score || 0, name: k.name || '' };
            });
            var frames = [{ t: 0, keypoints: kps }];
            var cal = window.__gaitParams.calibrateByHeight(frames, heightCm / 100);
            if (cal.error) {
              throw new Error(cal.error + ' (像素高度: ' + Math.round(cal.pixelHeight || 0) + 'px)');
            }
            state.calibration.scale = cal.scale;
            state.calibration.realMeters = cal.realHeight;
            state.calibration.pixelDistance = cal.pixelHeight;
            state.calibration.heightCm = heightCm;
            state.calibration.method = 'height';
            state.calibration.confidence = cal.confidence;
            // 更新 UI
            var formEl = $('#gait-video-cal-form');
            if (formEl) formEl.style.display = 'none';
            if (statusEl) {
              statusEl.innerHTML = '✓ 标定成功 — 比例: ' + (cal.scale * 100).toFixed(2) + ' cm/px (身高 ' + heightCm + 'cm, 像素 ' + Math.round(cal.pixelHeight) + 'px)';
              statusEl.style.color = '#10b981';
            }
            calBtn.textContent = '✓ 已标定';
          }).catch(function (e) {
            console.error('[gait] video calibration error', e);
            if (statusEl) {
              statusEl.textContent = '❌ 标定失败: ' + (e.message || e) + ' — 请确保视频开头有清晰站立画面';
              statusEl.style.color = '#dc2626';
            }
            calBtn.disabled = false;
            calBtn.textContent = '📏 从视频标定';
          });
        }

        // seek 到指定时间
        var seeked = false;
        video.addEventListener('seeked', function onSeeked() {
          if (seeked) return; seeked = true;
          video.removeEventListener('seeked', onSeeked);
          doDetect();
        });
        try {
          video.currentTime = seekT;
        } catch (e) { doDetect(); }
        // 超时保护
        setTimeout(function () { if (!seeked) { seeked = true; doDetect(); } }, 2000);
      });
    }
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

  // ============================================================
  // 调试视图 — 仅 URL 带 ?debug=1 时, 追加在 RESULTS 报告之后
  // 数据源: state.results.debug (heelRel/toeRel 骨盆相对轨迹, 含 NaN 洞)
  //         state.results.heelStrikes / state.results.events (HS/TO 事件)
  //         state.results.eventsMethod / state.results.phaseTimestamps
  //         state.poseModelVersion (实际加载的 PoseLandmarker 版本)
  // ============================================================
  var DEBUG_VIEW_ENABLED = /([?&])debug=1/.test(location.search);

  function renderDebugView(container) {
    if (!container || !DEBUG_VIEW_ENABLED) return;
    var r = state.results;
    if (!r) return;
    var dbg = r.debug || {};
    var t = dbg.t || [];
    var heelRel = dbg.heelRel || { left: [], right: [] };
    var toeRel  = dbg.toeRel  || { left: [], right: [] };
    var hsL = (r.heelStrikes && r.heelStrikes.left)  || [];
    var hsR = (r.heelStrikes && r.heelStrikes.right) || [];
    var toL = (r.events && r.events.leftToeOffs)  || [];
    var toR = (r.events && r.events.rightToeOffs) || [];

    // 暗色诊断卡片 (#1a1a2e = overlay 现有强调色)
    var box = el('div', { style: {
      background: '#1a1a2e', color: '#e5e7eb', padding: '16px',
      borderRadius: '12px', marginTop: '20px', fontSize: '12px',
      fontFamily: "'Consolas','Microsoft YaHei',monospace"
    }});

    // a) 标题行: 检测路径 / 模型版本 / walkDir
    var methodTxt = r.eventsMethod === 'pelvis-rel' ? 'pelvis-rel (Zeni 骨盆相对)' : (r.eventsMethod || 'legacy-Y (旧 Y 轨迹)');
    var head = el('div', { style: { marginBottom: '10px', lineHeight: '1.9' } });
    head.innerHTML = '<b style="font-size:14px;">🔬 算法调试视图 (?debug=1)</b><br>' +
      '检测路径: <b style="color:' + (r.eventsMethod === 'pelvis-rel' ? '#34d399' : '#fbbf24') + ';">' + methodTxt + '</b>' +
      '　模型版本: <b style="color:#93c5fd;">' + (state.poseModelVersion || '未加载') + '</b>' +
      '　walkDir: <b>' + (r.walkingDirection != null ? r.walkingDirection : '?') + '</b>' +
      '　帧数: <b>' + t.length + '</b>';
    box.appendChild(head);

    if (!t.length) {
      box.appendChild(el('div', { style: { color: '#9ca3af' } },
        '无 debug 轨迹 (此结果未含调试数据 — 历史记录/旧版本结果不持久化 debug 字段)'));
      container.appendChild(box);
      return;
    }

    // 曲线画布: seriesList=[{data,color,label}], eventList=[{data,color}] (HS/TO 竖线, 虚线=low confidence)
    function drawTrack(seriesList, eventList, label) {
      var cv = el('canvas', { style: { width: '100%', height: '260px', display: 'block', background: '#111827', borderRadius: '8px' } });
      cv.width = 900; cv.height = 260;
      var ctx = cv.getContext('2d');
      var W = 900, H = 260, padL = 46, padR = 12, padT = 22, padB = 26;
      var tMin = t[0], tMax = t[t.length - 1];
      if (!(tMax > tMin)) { tMin = 0; tMax = 1; }
      var vMin = Infinity, vMax = -Infinity;
      seriesList.forEach(function (s) {
        for (var i = 0; i < s.data.length; i++) {
          var v = s.data[i];
          if (typeof v !== 'number' || isNaN(v)) continue;
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
      });
      if (vMin === Infinity) { vMin = -1; vMax = 1; }
      if (vMax - vMin < 1e-6) { vMax += 1; vMin -= 1; }
      var mg = (vMax - vMin) * 0.08; vMax += mg; vMin -= mg;
      function X(tt) { return padL + (tt - tMin) / (tMax - tMin) * (W - padL - padR); }
      function Y(vv) { return padT + (1 - (vv - vMin) / (vMax - vMin)) * (H - padT - padB); }
      // t 秒刻度 (极简纵网格)
      ctx.font = '10px monospace'; ctx.textAlign = 'center';
      var step = Math.max(1, Math.round((tMax - tMin) / 8));
      for (var ts = Math.ceil(tMin); ts <= tMax; ts += step) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(X(ts), padT); ctx.lineTo(X(ts), H - padB); ctx.stroke();
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(ts + 's', X(ts), H - padB + 14);
      }
      // 零线
      if (vMin < 0 && vMax > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
      }
      // 值域标注
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'right';
      ctx.fillText(vMax.toFixed(0), padL - 5, padT + 8);
      ctx.fillText(vMin.toFixed(0), padL - 5, H - padB);
      // 曲线 (NaN 洞断开不连)
      seriesList.forEach(function (s, si) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        var pen = false;
        for (var i = 0; i < s.data.length && i < t.length; i++) {
          var v = s.data[i];
          if (typeof v !== 'number' || isNaN(v)) { pen = false; continue; }
          if (pen) ctx.lineTo(X(t[i]), Y(v));
          else { ctx.moveTo(X(t[i]), Y(v)); pen = true; }
        }
        ctx.stroke();
        ctx.fillStyle = s.color; ctx.textAlign = 'left';
        ctx.fillText(s.label, padL + 8 + si * 100, 12);
      });
      // 事件竖线 (颜色与曲线对应; 实线=high, 虚线=low)
      eventList.forEach(function (ev) {
        (ev.data || []).forEach(function (e) {
          if (!e || typeof e.time !== 'number') return;
          ctx.strokeStyle = ev.color; ctx.lineWidth = 1;
          ctx.setLineDash(e.confidence === 'low' ? [4, 4] : []);
          ctx.beginPath(); ctx.moveTo(X(e.time), padT); ctx.lineTo(X(e.time), H - padB); ctx.stroke();
          ctx.setLineDash([]);
        });
      });
      ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'right';
      ctx.fillText(label, W - padR - 4, 12);
      return cv;
    }

    // b) heelRel 曲线 + HS 竖线
    box.appendChild(drawTrack(
      [{ data: heelRel.left  || [], color: '#3b82f6', label: '左 heelRel' },
       { data: heelRel.right || [], color: '#ef4444', label: '右 heelRel' }],
      [{ data: hsL, color: '#3b82f6' }, { data: hsR, color: '#ef4444' }],
      'heelRel + HS 事件'
    ));
    box.appendChild(el('div', { style: { height: '10px' } }));
    // c) toeRel 曲线 + TO 竖线
    box.appendChild(drawTrack(
      [{ data: toeRel.left  || [], color: '#3b82f6', label: '左 toeRel' },
       { data: toeRel.right || [], color: '#ef4444', label: '右 toeRel' }],
      [{ data: toL, color: '#3b82f6' }, { data: toR, color: '#ef4444' }],
      'toeRel + TO 事件'
    ));

    // d) 每周期明细表: 按 side+cycleIndex 分组, 列出 8 时相 time/frameIndex + 周期 span
    var pts = r.phaseTimestamps || [];
    var groups = {}, groupOrder = [];
    pts.forEach(function (p) {
      var key = (p.side === 'left' ? '左脚' : '右脚') + ' 周期' + p.cycleIndex;
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(p);
    });
    if (groupOrder.length) {
      var PHASES8 = ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];
      var htmlStr = '<tr style="color:#9ca3af;">' +
        '<th style="text-align:left;padding:4px;">周期</th><th style="padding:4px;">span</th>' +
        PHASES8.map(function (ph) { return '<th style="padding:4px;">' + ph + '</th>'; }).join('') + '</tr>';
      groupOrder.forEach(function (key) {
        var g = groups[key];
        var t0 = Infinity, t1 = -Infinity;
        g.forEach(function (p) { if (p.time < t0) t0 = p.time; if (p.time > t1) t1 = p.time; });
        htmlStr += '<tr style="border-top:1px solid rgba(255,255,255,0.12);">' +
          '<td style="padding:4px;color:' + (g[0].side === 'left' ? '#93c5fd' : '#fca5a5') + ';">' + key + '</td>' +
          '<td style="text-align:center;">' + (t1 - t0).toFixed(2) + 's</td>';
        PHASES8.forEach(function (ph) {
          var found = null;
          for (var i = 0; i < g.length; i++) { if (g[i].phase === ph) { found = g[i]; break; } }
          htmlStr += '<td style="text-align:center;font-size:10px;">' +
            (found ? ('t=' + found.time.toFixed(2) + '<br>f=' + found.frameIndex) : '—') + '</td>';
        });
        htmlStr += '</tr>';
      });
      var tbl = el('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: '12px' } });
      tbl.innerHTML = htmlStr;
      box.appendChild(tbl);
    }

    container.appendChild(box);
  }

  function renderResults() {
    if (!state.results) { setPhase(PHASE.INTRO); return; }
    // 如果有 gait-report.js, 用它渲染格式一致的报告 (和历史记录一样)
    if (window.__gaitReport && window.__gaitReport.renderReport) {
      window.__gaitReport.renderReport(state.results, $('#gait-body'));
      // 报告渲染完后, 绑定"补录另一段"按钮 (由 report.js 注入的 DOM)
      if (typeof bindAddSegmentHandler === 'function') bindAddSegmentHandler();
      renderDebugView($('#gait-body'));  // ?debug=1 时追加算法诊断区块
      return;
    }
    // fallback: 内联渲染
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
              var phaseObj = (r.gaitPhases && r.gaitPhases.phases && r.gaitPhases.phases[p.key]) || {};
              var pct = typeof phaseObj.pct === 'number' ? phaseObj.pct : 0;
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
      // 时相截图
      (r.phaseSnapshots && r.phaseSnapshots.length > 0 ?
        (function () {
          var h = '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">📸 时相截图 (验证算法检测)</h3>' +
            '<div style="font-size:12px;color:#666;margin-bottom:10px;">IC=足跟刚触地 | PSw=足趾即将离地 | MSw=摆动中点' +
              (r.segments && r.segments > 1 ? ' · <span style="color:#10b981;">已合并 ' + r.segments + ' 段视频</span>' : '') +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
          var o = ['IC','LR','MSt','TSt','PSw','ISw','MSw','TSw'];
          r.phaseSnapshots.sort(function (a, b) { return o.indexOf(a.phase) - o.indexOf(b.phase); });
          r.phaseSnapshots.forEach(function (s) {
            var c = s.stance ? '#3b82f6' : '#f59e0b';
            h += '<div style="background:#fff;border-radius:8px;overflow:hidden;border:2px solid ' + c + ';">' +
              '<img src="' + s.imageData + '" style="width:100%;display:block;">' +
              '<div style="padding:4px;font-size:11px;text-align:center;background:' + c + ';color:#fff;">' +
                s.side + '·' + s.label + '</div></div>';
          });
          h += '</div>';
          // 缺另一侧 → "补录" 按钮 (只在 RESULTS 阶段、当前 state 才生效)
          var missingSide = getMissingPhaseSide();
          if (missingSide) {
            var sideLabel = missingSide === 'left' ? '左脚' : '右脚';
            var dirHint = missingSide === 'left' ? '从右向左' : '从左向右';
            h += '<div id="gait-add-segment" data-missing="' + missingSide + '" ' +
              'style="background:linear-gradient(135deg,#fff7ed,#fef3c7);border:2px dashed #f59e0b;border-radius:10px;padding:14px;margin-bottom:14px;">' +
              '<div style="font-size:14px;font-weight:600;color:#92400e;margin-bottom:6px;">⚠️ ' + sideLabel + ' 时相缺失</div>' +
              '<div style="font-size:12px;color:#78350f;line-height:1.6;margin-bottom:10px;">' +
                '当前视频只检测到了' + (missingSide === 'left' ? '右脚' : '左脚') + '的时相。要看 ' + sideLabel + ' 时相，需要再录一段 ' + dirHint + ' 走路的视频（这样 ' + sideLabel + ' 才会面向摄像头）。' +
              '</div>' +
              '<button id="gait-add-segment-btn" ' +
                'style="padding:10px 24px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">' +
                '➕ 补录 ' + sideLabel + ' (走 ' + dirHint + ')</button>' +
            '</div>';
          }
          return h;
        })() : '') +
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
              '<div style="font-size:22px;font-weight:700;color:' + (r.armSwing.coordination.avg == null ? '#9ca3af' : r.armSwing.coordination.avg < 0.25 ? '#dc2626' : '#10b981') + ';">' + (r.armSwing.coordination.avg != null ? ((r.armSwing.coordination.avg * 100).toFixed(0) + '%') : '—') + '</div>' +
              '<div style="font-size:11px;color:#888;">' + (r.armSwing.coordination.avg != null ? '正常 > 25%' : '数据不足') + '</div>' +
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
      // 骨盆/髋运动学 (亚健康脑功能筛查核心指标)
      (r.pelvic && !r.pelvic.error ?
        '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">🦴 骨盆与髋部运动学</h3>' +
        '<div style="background:#fff;padding:16px;border-radius:10px;margin-bottom:14px;">' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">骨盆垂直起伏</div>' +
              '<div style="font-size:22px;font-weight:700;color:' + (r.pelvic.verticalOscillation != null && (r.pelvic.verticalOscillation < 2 || r.pelvic.verticalOscillation > 8) ? '#f59e0b' : '#1a1a2e') + ';">' + (r.pelvic.verticalOscillation != null ? r.pelvic.verticalOscillation.toFixed(1) : '—') + ' <span style="font-size:12px;color:#999;">cm</span></div>' +
              '<div style="font-size:11px;color:#888;">参考 3-6cm</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">起伏节奏 CV</div>' +
              '<div style="font-size:22px;font-weight:700;color:' + ((r.pelvic.verticalCV || 0) > 0.3 ? '#f59e0b' : '#1a1a2e') + ';">' + (r.pelvic.verticalCV != null ? (r.pelvic.verticalCV * 100).toFixed(0) : '—') + ' <span style="font-size:12px;color:#999;">%</span></div>' +
              '<div style="font-size:11px;color:#888;">参考 < 30%</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">髋屈伸活动度</div>' +
              '<div style="font-size:22px;font-weight:700;color:' + (r.pelvic.hipFlexion && r.pelvic.hipFlexion.meanROM != null && (r.pelvic.hipFlexion.meanROM < 20 || r.pelvic.hipFlexion.meanROM > 55) ? '#f59e0b' : '#1a1a2e') + ';">' + (r.pelvic.hipFlexion && r.pelvic.hipFlexion.meanROM != null ? r.pelvic.hipFlexion.meanROM.toFixed(0) : '—') + ' <span style="font-size:12px;color:#999;">°</span></div>' +
              '<div style="font-size:11px;color:#888;">参考 25-35°</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f8f9fa;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">髋屈伸不对称</div>' +
              '<div style="font-size:22px;font-weight:700;color:' + (r.pelvic.hipFlexion && (r.pelvic.hipFlexion.asymmetry || 0) > 0.25 ? '#dc2626' : '#10b981') + ';">' + (r.pelvic.hipFlexion && r.pelvic.hipFlexion.asymmetry != null ? (r.pelvic.hipFlexion.asymmetry * 100).toFixed(0) + '%' : '—') + '</div>' +
              '<div style="font-size:11px;color:#888;">正常 < 20%</div>' +
            '</div>' +
            '<div style="padding:10px;background:#f0f2f5;border-radius:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;">骨盆侧倾/横摆/旋转</div>' +
              '<div style="font-size:13px;font-weight:600;color:#9ca3af;padding-top:8px;">侧拍不可测</div>' +
              '<div style="font-size:11px;color:#888;">需正面拍摄</div>' +
            '</div>' +
          '</div>' +
          (r.pelvic.flags && r.pelvic.flags.length > 0 ?
            '<div style="margin-top:4px;padding:8px 12px;background:#eef2ff;border-radius:6px;border-left:3px solid #667eea;">' +
              r.pelvic.flags.map(function (f) { return '<div style="font-size:12px;color:#3730a3;line-height:1.6;">• ' + f + '</div>'; }).join('') +
            '</div>' : '') +
        '</div>'
      : '') +
      // 脑功能步态画像 v2 (亚健康 5 维筛查)
      (r.brainProfile && !r.brainProfile.error ?
        (function () {
          var bp = r.brainProfile;
          var dims = bp.dimensions || {};
          var dimKeys = ['cerebellar', 'cortical', 'vestibular', 'bilateral', 'rhythm'];
          var dimIcons = { cerebellar: '🎯', cortical: '🧠', vestibular: '⚖️', bilateral: '↔️', rhythm: '🎵' };
          var dimColors = { cerebellar: '#f59e0b', cortical: '#667eea', vestibular: '#10b981', bilateral: '#ec4899', rhythm: '#8b5cf6' };
          function scoreColor(s) { return s == null ? '#9ca3af' : s >= 75 ? '#10b981' : s >= 55 ? '#f59e0b' : '#dc2626'; }
          // 雷达图 SVG
          var radar = bp.radar || [];
          var radarSvg = '';
          if (radar.length >= 3) {
            var size = 220, cx = size / 2, cy = size / 2, R = size / 2 - 34;
            var n = radar.length;
            function pt(i, rr) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; return (cx + rr * Math.cos(ang)).toFixed(1) + ',' + (cy + rr * Math.sin(ang)).toFixed(1); }
            var rings = '';
            [0.34, 0.67, 1].forEach(function (f) {
              var pts = [];
              for (var i = 0; i < n; i++) pts.push(pt(i, R * f));
              rings += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="#e5e7eb" stroke-width="1"/>';
            });
            var axes = '', labels = '';
            radar.forEach(function (d, i) {
              var ap = pt(i, R).split(',');
              axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + ap[0] + '" y2="' + ap[1] + '" stroke="#e5e7eb"/>';
              var lp = pt(i, R + 18).split(',');
              labels += '<text x="' + lp[0] + '" y="' + lp[1] + '" font-size="10" fill="#555" text-anchor="middle" dominant-baseline="middle">' + d.label + '</text>';
            });
            var dataPts = [];
            radar.forEach(function (d, i) { dataPts.push(pt(i, R * ((d.score || 0) / 100))); });
            radarSvg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block;margin:0 auto;">' +
              rings + axes +
              '<polygon points="' + dataPts.join(' ') + '" fill="rgba(102,126,234,0.25)" stroke="#667eea" stroke-width="2"/>' +
              labels + '</svg>';
          }
          return '<h3 style="margin:20px 0 10px 0;font-size:16px;color:#1a1a2e;">🧠 脑功能步态画像 (亚健康筛查)</h3>' +
            '<div style="background:#fff;padding:16px;border-radius:10px;margin-bottom:14px;">' +
              // 总评
              '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:8px;">' +
                '<div style="font-size:36px;">🧠</div>' +
                '<div style="flex:1;">' +
                  '<div style="font-size:16px;font-weight:700;">' + (bp.brainGrade || '—') + '</div>' +
                  '<div style="font-size:12px;opacity:0.85;">脑功能综合评分: ' + (bp.overallBrainScore != null ? bp.overallBrainScore : '—') + '/100</div>' +
                '</div>' +
                '<div style="text-align:center;"><div style="font-size:11px;opacity:0.8;">左脑</div><div style="font-size:18px;font-weight:700;">' + (bp.lateralization && bp.lateralization.leftBrain != null ? bp.lateralization.leftBrain : '—') + '</div></div>' +
                '<div style="text-align:center;"><div style="font-size:11px;opacity:0.8;">右脑</div><div style="font-size:18px;font-weight:700;">' + (bp.lateralization && bp.lateralization.rightBrain != null ? bp.lateralization.rightBrain : '—') + '</div></div>' +
              '</div>' +
              (bp.screeningNote ? '<div style="font-size:11px;color:#6b7280;margin-bottom:12px;line-height:1.5;">📋 ' + bp.screeningNote + '</div>' : '') +
              '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">' +
                (radarSvg ? '<div style="flex:0 0 auto;">' + radarSvg + '</div>' : '') +
                '<div style="flex:1;min-width:260px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">' +
                  dimKeys.map(function (k) {
                    var dm = dims[k];
                    if (!dm) return '';
                    return '<div style="padding:10px;background:#f8f9fa;border-radius:6px;border-left:3px solid ' + dimColors[k] + ';">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<div style="font-size:12px;font-weight:600;color:#333;">' + dimIcons[k] + ' ' + dm.label + '</div>' +
                        '<div style="font-size:16px;font-weight:700;color:' + scoreColor(dm.score) + ';">' + (dm.score == null ? '—' : dm.score) + '</div>' +
                      '</div>' +
                      '<div style="font-size:10px;color:#888;margin:2px 0;">' + dm.brainRegion + '</div>' +
                      '<div style="height:4px;background:#e5e7eb;border-radius:2px;margin:4px 0;"><div style="height:100%;width:' + (dm.score || 0) + '%;background:' + scoreColor(dm.score) + ';border-radius:2px;"></div></div>' +
                      '<div style="font-size:10px;color:#6b7280;line-height:1.5;">' + (dm.interpretation || '') + '</div>' +
                      (dm.flags || []).map(function (f) { return '<div style="font-size:10px;color:#92400e;margin-top:2px;line-height:1.5;">⚠ ' + f + '</div>'; }).join('') +
                    '</div>';
                  }).join('') +
                '</div>' +
              '</div>' +
              // 亚健康标记汇总
              (bp.subhealthFlags && bp.subhealthFlags.length > 0 ?
                '<div style="margin-top:12px;padding:10px 14px;background:#fef3c7;border-radius:6px;border-left:3px solid #f59e0b;">' +
                  '<div style="font-size:12px;font-weight:600;color:#92400e;margin-bottom:6px;">🔍 亚健康步态标记 (' + bp.subhealthFlags.length + '项)</div>' +
                  bp.subhealthFlags.map(function (f) { return '<div style="font-size:11px;color:#92400e;line-height:1.7;">• ' + f + '</div>'; }).join('') +
                '</div>' : '') +
            '</div>';
        })()
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
        '<div style="font-size:16px;font-weight:600;color:#1a1a2e;margin:4px 0;">' + ((r.neuro && r.neuro.level) || '—') + '</div>' +
        (r.neuro && r.neuro.regions && r.neuro.regions.length > 0 ? '<div style="font-size:13px;color:#666;margin-top:6px;"><b>可能涉及:</b> ' + r.neuro.regions.join(', ') + '</div>' : '') +
        (r.neuro && r.neuro.possibleCauses && r.neuro.possibleCauses.length > 0 ? '<div style="font-size:13px;color:#666;margin-top:4px;"><b>常见病因:</b> ' + r.neuro.possibleCauses.join(' / ') + '</div>' : '') +
        '<div style="font-size:13px;color:#444;margin-top:8px;line-height:1.6;">' +
          '<b>典型表现:</b> ' + ((r.neuro && r.neuro.features) || []).join(' / ') +
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
    renderDebugView($('#gait-body'));  // ?debug=1 时追加算法诊断区块
  }

  // ============================================================
  // QR 分享 + 历史记录
  // ============================================================
  function buildQRUrl() {
    var base = window.location.origin + window.location.pathname;
    var tid = '';
    try { tid = localStorage.getItem('therapist_id') || ''; } catch (e) {}
    var url = base + '?mode=gait&t=' + Date.now() + (tid ? '&tid=' + encodeURIComponent(tid) : '');
    // Supabase share_token (治疗师工作台创建的步态链接; 透传到患者扫码 URL)
    var shareToken = '';
    try { shareToken = sessionStorage.getItem('bm_gait_share_token') || ''; } catch (e) {}
    if (shareToken) url += '&share_token=' + encodeURIComponent(shareToken);
    return url;
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
          { l: '脑功能', v: bp.overallBrainScore != null ? { value: bp.overallBrainScore, status: bp.overallBrainScore >= 55 ? 'normal' : 'mild' } : null, u: '/100', c: '#764ba2' }
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
    // 重置累积段, 每次打开都是新评估
    state.videoSegments = [];
    state.nextSegmentHint = null;
    setPhase(PHASE.INTRO);
  }

  function close() {
    stopCamera();
    if (state.recordedURL) URL.revokeObjectURL(state.recordedURL);
    state.recordedBlob = null;
    state.recordedURL = null;
    state.results = null;
    state.capturedFrames = [];
    state.calibration = { p1: null, p2: null, scale: 0, heightCm: 170, method: null };
    state.recordedChunks = [];
    state.videoSegments = [];
    state.nextSegmentHint = null;
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

  // "补录另一段" 按钮 — 委托绑定, 每次重新 renderResults 后重绑
  function bindAddSegmentHandler() {
    var box = document.getElementById('gait-add-segment');
    if (!box) return;
    var missing = box.getAttribute('data-missing');
    if (!missing) return;

    // (A) 重录 — 走 CALIBRATION, 完整流程
    var btnRecord = document.getElementById('gait-add-segment-record');
    if (btnRecord) {
      btnRecord.addEventListener('click', function () {
        state.nextSegmentHint = missing;
        state.calibration = { p1: null, p2: null, scale: 0, heightCm: 170, method: null };
        state.capturedFrames = [];
        stopCamera();
        setPhase(PHASE.CALIBRATION);
        console.log('[gait] add-segment-record triggered, hint=' + missing);
      });
    }

    // (B) 上传 — 直接进 CAPTURE, 跳过标定, 用默认比例或继承上次比例
    var btnUpload = document.getElementById('gait-add-segment-upload');
    if (btnUpload) {
      btnUpload.addEventListener('click', function () {
        addSegmentUpload(missing);
      });
    }
  }

  // 补录 — 上传路径: 直接进 CAPTURE 阶段 + 默认标定 + 自动切到 upload tab + 自动打开文件选择器
  function addSegmentUpload(missing) {
    state.nextSegmentHint = missing;
    // 保留历史 scale (从第一段继承), 没的话用默认
    if (!state.calibration.scale) {
      state.calibration.scale = 1 / 130;
      state.calibration.realMeters = 1.0;
      state.calibration.pixelDistance = 130;
      state.calibration.method = 'default';
      state.calibration.note = '补录上传 — 使用默认比例';
    }
    state.capturedFrames = [];
    if (state.recordedURL) { URL.revokeObjectURL(state.recordedURL); state.recordedURL = null; }
    state.recordedBlob = null;
    stopCamera();
    // 进 CAPTURE 阶段
    setPhase(PHASE.CAPTURE);
    // 渲染完成后: 切到 upload tab + 触发文件选择器
    setTimeout(function () {
      // 切到 upload tab
      var uploadTab = document.querySelector('.gait-capture-tab[data-mode="upload"]');
      if (uploadTab) uploadTab.click();
      // 触发文件选择
      var fi = document.getElementById('gait-file-input');
      if (fi) fi.click();
      else console.warn('[gait] addSegmentUpload: #gait-file-input not found');
    }, 250);
    console.log('[gait] add-segment-upload triggered, hint=' + missing + ' scale=' + state.calibration.scale);
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
    addSegmentUpload: addSegmentUpload,
    // 保存入口 (供集成测试/调试直接注入 results 触发 本地保存+云端提交)
    saveAssessment: saveAssessment,
    getState: function () { return state; },
    PHASE: PHASE
  };
})();
