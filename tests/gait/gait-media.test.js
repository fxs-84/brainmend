import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/gait-media.js', import.meta.url), 'utf8');

function loadMedia(createFromOptions) {
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
    document: {
      currentScript: { src: 'https://example.test/assets/gait-media.js' },
      createElement: () => ({
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
      return { landmarks: [] };
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
  const media = loadMedia(async () => ({ detectForVideo: () => ({ landmarks: [] }) }));
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
