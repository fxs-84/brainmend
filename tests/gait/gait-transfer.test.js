import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../../assets/gait-transfer.js', import.meta.url), 'utf8');
const abcHash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function loadTransfer({ fetchImpl, Xhr }) {
  const context = {
    console,
    URL,
    URLSearchParams,
    Blob,
    File,
    crypto: webcrypto,
    fetch: fetchImpl,
    XMLHttpRequest: Xhr,
    __SUPABASE_URL__: 'https://example.supabase.co',
    __SUPABASE_ANON_KEY__: 'public-key',
    location: { origin: 'https://fxs-84.github.io', pathname: '/brainmend/gait-upload.html' }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.__gaitTransfer;
}

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value, text: async () => JSON.stringify(value), blob: async () => value };
}

function videoFile() {
  return new File(['abc'], 'left.mp4', { type: 'video/mp4' });
}

test('二维码地址包含指定会话和密钥且不依赖当前页面文件名', () => {
  const transfer = loadTransfer({});
  const url = transfer.buildUploadUrl({ sessionId: 'session id', uploadToken: 'token&value' });
  assert.equal(url, 'https://fxs-84.github.io/brainmend/gait-upload.html?session=session+id&token=token%26value');
});

test('手机上传依次准备、发送原文件并完成会话', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/prepare_gait_video_upload')) return response('session/token/source');
    if (url.endsWith('/complete_gait_video_upload')) return response(true);
    throw new Error('unexpected fetch ' + url);
  };
  class Xhr {
    constructor() { this.upload = {}; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      calls.push({ url: this.url, options: { method: this.method, headers: this.headers, body } });
      this.status = 200;
      this.responseText = '{}';
      this.onload();
    }
  }
  const transfer = loadTransfer({ fetchImpl, Xhr });
  const result = await transfer.uploadVideo({ sessionId: 'session', token: 'token', file: videoFile() });
  assert.equal(result.sha256, abcHash);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.endsWith('/prepare_gait_video_upload'));
  assert.equal(calls[1].url, 'https://example.supabase.co/storage/v1/object/gait-video-uploads/session/token/source');
  assert.equal(calls[1].options.body.size, 3);
  assert.ok(calls[2].url.endsWith('/complete_gait_video_upload'));
});

test('电脑接收原文件并校验后删除云端对象', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/get_gait_video_upload_session')) return response([{
      status: 'ready', object_path: 'session/token/source', file_name: 'left.mp4',
      content_type: 'video/mp4', file_size: 3, sha256: abcHash
    }]);
    if (url.includes('/storage/v1/object/gait-video-uploads/session/token/source') && options.method === 'GET') return response(videoFile());
    if (url.endsWith('/storage/v1/object/gait-video-uploads') && options.method === 'DELETE') return response(null);
    if (url.endsWith('/consume_gait_video_upload')) return response(true);
    throw new Error('unexpected fetch ' + url);
  };
  const transfer = loadTransfer({ fetchImpl });
  const received = await transfer.receiveVideo({ sessionId: 'session', token: 'token' });
  assert.equal(received.file.name, 'left.mp4');
  assert.equal(received.sha256, abcHash);
  assert.equal(await received.file.text(), 'abc');
  assert.deepEqual(calls.map(call => call.options.method || 'GET'), ['POST', 'GET', 'DELETE', 'POST']);
});

test('校验值不一致时拒绝导入且保留云端对象', async () => {
  let deleted = false;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/get_gait_video_upload_session')) return response([{
      status: 'ready', object_path: 'session/token/source', file_name: 'left.mp4',
      content_type: 'video/mp4', file_size: 3, sha256: '0'.repeat(64)
    }]);
    if (options.method === 'GET') return response(videoFile());
    if (options.method === 'DELETE') { deleted = true; return response(null); }
    throw new Error('unexpected fetch ' + url);
  };
  const transfer = loadTransfer({ fetchImpl });
  await assert.rejects(transfer.receiveVideo({ sessionId: 'session', token: 'token' }), /校验不一致/);
  assert.equal(deleted, false);
});
