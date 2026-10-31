(function (global) {
  'use strict';

  var TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
  var TASKS_VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  var SCRIPT_URL = document.currentScript && document.currentScript.src || global.location.href;
  var MODEL_URLS = [
    new URL('./models/pose_landmarker_full.task', SCRIPT_URL).href,
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
  ];
  var NAMES = [
    'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
    'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow',
    'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index', 'right_index',
    'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
    'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'
  ];
  var detectorPromise = null;

  function loadDetector(onModel) {
    if (detectorPromise) return detectorPromise;
    detectorPromise = (async function () {
      var dynamicImport = new Function('url', 'return import(url)');
      var vision = await dynamicImport(TASKS_VISION_URL);
      var fileset = await vision.FilesetResolver.forVisionTasks(TASKS_VISION_WASM);
      var landmarker = null;
      var lastError = null;
      for (var m = 0; m < MODEL_URLS.length && !landmarker; m++) {
        for (var d = 0; d < 2 && !landmarker; d++) {
          var delegate = d === 0 ? 'GPU' : 'CPU';
          try {
            var creating = vision.PoseLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_URLS[m], delegate: delegate },
              runningMode: 'VIDEO', numPoses: 1
            });
            var timeoutId;
            var timeout = new Promise(function (_, reject) {
              timeoutId = setTimeout(function () { reject(new Error('模型创建超时')); }, 300000);
            });
            try {
              landmarker = await Promise.race([creating, timeout]);
              var match = /pose_landmarker_(heavy|full|lite)/.exec(MODEL_URLS[m]);
              if (onModel) onModel(match ? match[1] : 'unknown', delegate);
            } finally {
              clearTimeout(timeoutId);
            }
          } catch (error) {
            lastError = error;
            console.warn('[gait-media] 模型初始化回退', MODEL_URLS[m], delegate, error && error.message || error);
          }
        }
      }
      if (!landmarker) throw new Error('MediaPipe 模型加载失败：' + (lastError && lastError.message || '未知错误'));
      return {
        estimate: function (canvas, timestampMs) {
          var result = landmarker.detectForVideo(canvas, timestampMs);
          if (!result.landmarks || !result.landmarks.length) return [];
          return result.landmarks[0].map(function (point, index) {
            return {
              name: NAMES[index] || 'point_' + index,
              x: point.x * canvas.width,
              y: point.y * canvas.height,
              score: point.visibility == null ? (point.presence == null ? 0.5 : point.presence) : point.visibility,
              source: 'ai'
            };
          });
        }
      };
    })();
    detectorPromise.catch(function () { detectorPromise = null; });
    return detectorPromise;
  }

  function waitEvent(target, name, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('视频等待超时：' + name));
      }, timeoutMs || 15000);
      function cleanup() {
        clearTimeout(timer);
        target.removeEventListener(name, done);
        target.removeEventListener('error', failed);
      }
      function done() { cleanup(); resolve(); }
      function failed() { cleanup(); reject(new Error('视频解码失败，请使用 H.264/MP4')); }
      target.addEventListener(name, done, { once: true });
      target.addEventListener('error', failed, { once: true });
    });
  }

  async function loadVideo(file) {
    if (!file || !/^video\//.test(file.type || '') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name || '')) {
      throw new Error('请选择 MP4、MOV 或 WebM 视频');
    }
    var url = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    try {
      if (video.readyState < 1) await waitEvent(video, 'loadedmetadata');
      if (!isFinite(video.duration) || video.duration <= 0) throw new Error('无法读取视频时长');
      if (video.readyState < 2) await waitEvent(video, 'loadeddata');
      return {
        url: url,
        element: video,
        info: {
          name: file.name, size: file.size, type: file.type, duration: video.duration,
          width: video.videoWidth, height: video.videoHeight
        }
      };
    } catch (error) {
      video.remove();
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  function clonePoints(points) {
    return (points || []).map(function (point) { return Object.assign({}, point); });
  }

  async function analyzeByPresentedFrames(view, detector, progress, control) {
    var video = view.videoElement;
    if (!video.requestVideoFrameCallback) return null;
    var canvas = document.createElement('canvas');
    canvas.width = view.video.width;
    canvas.height = view.video.height;
    var context = canvas.getContext('2d', { willReadFrequently: false });
    var frames = [];
    var done = false;
    var lastTime = -1;
    var callbackId = 0;
    var timeout;
    return new Promise(function (resolve, reject) {
      function cleanup() {
        done = true;
        clearTimeout(timeout);
        video.pause();
        if (callbackId && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callbackId);
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', failed);
      }
      function finish() {
        if (done) return;
        cleanup();
        resolve(frames);
      }
      function failed() {
        if (done) return;
        cleanup();
        reject(new Error('视频解码中断，请改用 H.264/MP4'));
      }
      async function presented(_, metadata) {
        if (done) return;
        video.pause();
        if (control && control.cancelled) {
          cleanup();
          reject(new Error('已取消分析'));
          return;
        }
        var mediaTime = typeof metadata.mediaTime === 'number' ? metadata.mediaTime : video.currentTime;
        if (mediaTime > lastTime && video.videoWidth) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          var keypoints = [];
          try {
            keypoints = detector.estimate(canvas, Math.max(0, Math.round(mediaTime * 1000)));
          } catch (error) {
            keypoints = [];
          }
          frames.push({
            frameIndex: frames.length,
            t: mediaTime,
            mediaTime: mediaTime,
            rawKeypoints: clonePoints(keypoints),
            keypoints: clonePoints(keypoints)
          });
          lastTime = mediaTime;
          if (progress) progress(frames.length, video.duration ? frames.length / Math.max(1, video.duration * 30) : 0);
        }
        if (video.ended || video.currentTime >= video.duration - 0.001) {
          finish();
          return;
        }
        callbackId = video.requestVideoFrameCallback(presented);
        try {
          await video.play();
        } catch (error) {
          cleanup();
          reject(error);
        }
      }
      video.addEventListener('ended', finish);
      video.addEventListener('error', failed);
      timeout = setTimeout(function () {
        if (done) return;
        cleanup();
        reject(new Error('逐帧分析超时，请缩短视频后重试'));
      }, 15 * 60 * 1000);
      video.currentTime = 0;
      callbackId = video.requestVideoFrameCallback(presented);
      video.play().catch(function (error) {
        cleanup();
        reject(error);
      });
    });
  }

  async function analyzeBySeek(view, detector, progress, control) {
    var video = view.videoElement;
    var canvas = document.createElement('canvas');
    canvas.width = view.video.width;
    canvas.height = view.video.height;
    var context = canvas.getContext('2d');
    var fps = 30;
    var count = Math.max(1, Math.ceil(video.duration * fps));
    var frames = [];
    for (var index = 0; index < count; index++) {
      if (control && control.cancelled) throw new Error('已取消分析');
      var target = Math.min(video.duration - 0.0001, index / fps);
      if (index > 0) await waitEvent(video, 'seeked', 10000);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      var keypoints = [];
      try {
        keypoints = detector.estimate(canvas, Math.max(0, Math.round(target * 1000)));
      } catch (error) {}
      frames.push({
        frameIndex: index, t: target, mediaTime: target,
        rawKeypoints: clonePoints(keypoints), keypoints: clonePoints(keypoints)
      });
      if (progress) progress(index + 1, (index + 1) / count);
      if (index < count - 1) video.currentTime = Math.min(video.duration - 0.0001, (index + 1) / fps);
    }
    return frames;
  }

  async function analyzeVideo(view, progress, control) {
    var detector = await loadDetector(function (model, delegate) {
      view.modelVersion = model + '/' + delegate;
    });
    var frames = await analyzeByPresentedFrames(view, detector, progress, control);
    var integrity = 'presented-frames';
    if (!frames) {
      frames = await analyzeBySeek(view, detector, progress, control);
      integrity = 'estimated-30fps-seek';
    }
    if (frames.length < 9) throw new Error('有效帧不足，请上传包含完整步态周期的视频');
    view.frameIntegrity = integrity;
    view.fps = frames.length > 1 ? (frames.length - 1) / (frames[frames.length - 1].t - frames[0].t) : 30;
    return frames;
  }

  global.__gaitMedia = {
    loadVideo: loadVideo,
    analyzeVideo: analyzeVideo,
    loadDetector: loadDetector
  };
})(window);
