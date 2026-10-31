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
    setTimeout,
    clearTimeout,
    document: { currentScript: { src: 'https://example.test/assets/gait-media.js' } },
    location: { href: 'https://example.test/' },
    Function: function () { return function () { return Promise.resolve(vision); }; }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.__gaitMedia;
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
