import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/gait-media.js', import.meta.url), 'utf8');

function loadMedia(createFromOptions, video, transcode) {
  const vision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: { createFromOptions }
  };
  const context = {
    console,
    URL,
    performance,
    setTimeout,
    clearTimeout,
    __gaitTranscode: transcode,
    document: {
      currentScript: { src: 'https://example.test/assets/gait-media.js' },
      body: { appendChild: () => {} },
      createElement: tag => tag === 'video' ? (Array.isArray(video) ? video.shift() : video) : ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} })
      })
    },
    location: { href: 'https://example.test/' },
    Function: function () { return function () { return Promise.resolve(vision); }; }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.__gaitMedia;
}

function fakeVideo(duration, onSeekStart, onSeekEnd) {
  const listeners = {};
  let currentTime = 0;
  const video = {
    duration,
    videoWidth: 100,
    videoHeight: 100,
    addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); },
    removeEventListener: (name, listener) => {
      listeners[name] = (listeners[name] || []).filter(item => item !== listener);
    }
  };
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: value => {
      currentTime = value;
      if (value > 0) {
        if (onSeekStart) onSeekStart();
        setTimeout(() => {
          (listeners.seeked || []).slice().forEach(listener => listener());
          if (onSeekEnd) onSeekEnd();
        }, 5);
      }
    }
  });
  return video;
}

test('首次模型初始化超过20秒时仍允许完成', async () => {
  let createCount = 0;
  let delegate = '';
  const media = loadMedia((fileset, options) => {
    createCount++;
    delegate = options.baseOptions.delegate;
    if (delegate === 'GPU') return Promise.reject(new Error('GPU unavailable'));
    return new Promise(resolve => setTimeout(() => resolve({}), 21000));
  });
  const detector = await media.loadDetector((model, selectedDelegate) => { delegate = selectedDelegate; });
  assert.equal(createCount, 2);
  assert.equal(delegate, 'CPU');
  assert.equal(typeof detector.estimate, 'function');
});

test('同一识别器连续分析两段视频时推理时间戳保持递增', async () => {
  const timestamps = [];
  const errors = [];
  let previousTimestamp = -1;
  const media = loadMedia(async () => ({
    detectForVideo: (canvas, timestamp) => {
      timestamps.push(timestamp);
      if (timestamp <= previousTimestamp) errors.push(new Error('Packet timestamp mismatch'));
      previousTimestamp = timestamp;
      return { landmarks: [[{ x: 0.5, y: 0.5, visibility: 0.95 }]] };
    }
  }));
  const first = { video: { width: 100, height: 100 }, videoElement: fakeVideo(0.3) };
  const second = { video: { width: 100, height: 100 }, videoElement: fakeVideo(0.3) };
  const firstFrames = await media.analyzeVideo(first);
  const secondFrames = await media.analyzeVideo(second);
  assert.equal(firstFrames.length, 9);
  assert.equal(secondFrames.length, 9);
  assert.equal(timestamps.length, 18);
  assert.deepEqual(errors, []);
  assert.ok(timestamps.every((timestamp, index) => index === 0 || timestamp > timestamps[index - 1]));
});

test('同时发起两段分析时自动排队，避免共享识别器导致丢帧', async () => {
  const media = loadMedia(async () => ({ detectForVideo: () => ({ landmarks: [[{ x: 0.5, y: 0.5, visibility: 0.95 }]] }) }));
  let activeSeeks = 0;
  let maxActiveSeeks = 0;
  function trackedVideo() {
    return fakeVideo(0.3, () => {
      activeSeeks++;
      maxActiveSeeks = Math.max(maxActiveSeeks, activeSeeks);
    }, () => { activeSeeks--; });
  }
  const first = { video: { width: 100, height: 100 }, videoElement: trackedVideo() };
  const second = { video: { width: 100, height: 100 }, videoElement: trackedVideo() };
  const [firstFrames, secondFrames] = await Promise.all([
    media.analyzeVideo(first),
    media.analyzeVideo(second)
  ]);
  assert.equal(firstFrames.length, 9);
  assert.equal(secondFrames.length, 9);
  assert.equal(maxActiveSeeks, 1);
});


test('逐帧推理异常不能静默转换为空帧，应报告原始错误', async () => {
  const media = loadMedia(async () => ({
    detectForVideo: () => { throw new Error('GPU inference failed'); }
  }));
  const view = { video: { width: 100, height: 100 }, videoElement: fakeVideo(0.3) };
  await assert.rejects(media.analyzeVideo(view), /GPU inference failed/);
});

test('所有帧均未返回人体关键点时明确报错而不是生成空结果', async () => {
  const media = loadMedia(async () => ({ detectForVideo: () => ({ landmarks: [] }) }));
  const view = { video: { width: 100, height: 100 }, videoElement: fakeVideo(0.3) };
  await assert.rejects(media.analyzeVideo(view), /所有帧均未返回人体关键点/);
});

test('视频时长可读但画面为0×0时，上传即提示浏览器解码失败', async () => {
  const video = {
    readyState: 4,
    duration: 17.733333,
    videoWidth: 0,
    videoHeight: 0,
    style: {},
    remove: () => {}
  };
  const media = loadMedia(async () => ({}), video);
  const file = Object.assign(new Blob(['hevc'], { type: 'video/mp4' }), { name: 'hevc.mp4' });
  await assert.rejects(media.loadVideo(file), /0×0.*H\.265\/HEVC.*Chrome.*H\.264/);
});

test('原生解码为0×0时自动软件转码并重试，成功加载转换后的视频', async () => {
  const unsupported = { readyState: 4, duration: 17.733333, videoWidth: 0, videoHeight: 0, style: {}, remove: () => {} };
  const supported = { readyState: 4, duration: 17.733333, videoWidth: 720, videoHeight: 1280, style: {}, remove: () => {} };
  let calls = 0;
  const progress = [];
  const transcode = {
    transcodeVideo: async (file, onProgress) => {
      calls++;
      onProgress(0.5);
      return new File(['h264'], 'walking-h264.mp4', { type: 'video/mp4' });
    }
  };
  const media = loadMedia(async () => ({}), [unsupported, supported], transcode);
  const file = new File(['hevc'], 'walking.mp4', { type: 'video/mp4' });
  const loaded = await media.loadVideo(file, { onProgress: value => progress.push(value) });
  assert.equal(calls, 1);
  assert.deepEqual(progress, [0, 0.5, 1]);
  assert.equal(loaded.info.width, 720);
  assert.equal(loaded.info.height, 1280);
  assert.equal(loaded.info.name, 'walking-h264.mp4');
  assert.equal(loaded.blob.name, 'walking-h264.mp4');
});
