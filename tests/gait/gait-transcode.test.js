import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/gait-transcode.js', import.meta.url), 'utf8');

function loadTranscode(FFmpeg) {
  const context = {
    console,
    URL,
    Uint8Array,
    File,
    FFmpegWASM: { FFmpeg },
    document: {
      currentScript: { src: 'https://example.test/assets/gait-transcode.js' },
      createElement: () => ({}),
      head: { appendChild: script => script.onload() }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.__gaitTranscode;
}

function fakeFfmpeg(exitCode = 0) {
  const state = { instances: 0, configs: [], commands: [], progress: null, deleted: [] };
  class FFmpeg {
    constructor() { state.instances++; }
    async load(config) { state.configs.push(config); }
    on(name, callback) { if (name === 'progress') state.progress = callback; }
    off(name, callback) { if (name === 'progress' && state.progress === callback) state.off = callback; }
    async writeFile(name, data) { state.input = { name, data }; }
    async exec(args) { state.commands.push(args); if (state.progress) state.progress({ progress: 0.5 }); return exitCode; }
    async readFile() { return new Uint8Array([4, 5, 6]); }
    async deleteFile(name) { state.deleted.push(name); }
  }
  return { FFmpeg, state };
}

test('HEVC 软件兜底在本地输出同分辨率 H.264 视频并清理临时文件', async () => {
  const { FFmpeg, state } = fakeFfmpeg();
  const transcode = loadTranscode(FFmpeg);
  const result = await transcode.transcodeVideo(new File([new Uint8Array([1, 2])], 'walking.mp4', { type: 'video/mp4' }), () => {});
  assert.equal(result.name, 'walking-h264.mp4');
  assert.equal(result.type, 'video/mp4');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [4, 5, 6]);
  assert.equal(state.instances, 1);
  assert.ok(state.configs[0].coreURL.includes('/assets/vendor/ffmpeg/ffmpeg-core.js'));
  assert.equal(state.commands[0].at(-1), 'output.mp4');
  assert.ok(state.commands[0].includes('-movflags'));
  assert.ok(state.commands[0].includes('libx264'));
  assert.ok(state.commands[0].includes('-an'));
  assert.ok(!state.commands[0].includes('-s'));
  assert.deepEqual(state.deleted.sort(), ['input.mp4', 'output.mp4']);
  assert.equal(state.off, state.progress);
});

test('软件转码失败时报告退出状态，重试复用同一组件', async () => {
  const { FFmpeg, state } = fakeFfmpeg(1);
  const transcode = loadTranscode(FFmpeg);
  await assert.rejects(transcode.transcodeVideo(new File(['x'], 'bad.mp4')), /软件转码失败.*1/);
  await assert.rejects(transcode.transcodeVideo(new File(['x'], 'bad.mp4')), /软件转码失败.*1/);
  assert.equal(state.instances, 1);
});
