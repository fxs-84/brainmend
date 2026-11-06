import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const video = 'C:/Users/Lenovo/.kimi-code/sessions/wd_cervical-spine-rehab-game_a86bb53d2922/session_472ba37d-8135-45fa-8a49-c206003b1ad8/media/f_cc73a9be-1a92-43f9-b8ea-fa55d03962a4.mp4';
const videoBytes = readFileSync(video);
const videoHash = createHash('sha256').update(videoBytes).digest('hex');
const server = process.env.TEST_URL ? null : spawn('node', ['tests/static-server.mjs'], {
  cwd: root, env: { ...process.env, PORT: '8796' }, stdio: 'ignore'
});
const base = process.env.TEST_URL || 'http://127.0.0.1:8796/';
if (server) await new Promise(resolve => setTimeout(resolve, 700));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const state = { uploaded: null, deleted: false, consumed: false };

await context.route('**/rest/v1/rpc/*', async route => {
  const name = route.request().url().split('/').pop();
  const body = JSON.parse(route.request().postData() || '{}');
  let result;
  if (name === 'create_gait_video_upload_session') {
    result = [{ session_id: 'session', upload_token: 'token', expires_at: '2099-01-01T00:00:00Z' }];
  } else if (name === 'prepare_gait_video_upload') {
    state.prepare = body;
    result = 'session/token/source';
  } else if (name === 'complete_gait_video_upload') {
    result = true;
  } else if (name === 'get_gait_video_upload_session') {
    result = [{ status: state.uploaded ? 'ready' : 'uploading', object_path: 'session/token/source', file_name: 'left.mp4', content_type: 'video/mp4', file_size: videoBytes.length, sha256: videoHash }];
  } else if (name === 'consume_gait_video_upload') {
    state.consumed = true;
    result = true;
  } else {
    throw new Error('unexpected RPC ' + name);
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
});
await context.route('**/storage/v1/object/gait-video-uploads**', async route => {
  const method = route.request().method();
  if (method === 'PUT') {
    state.uploaded = videoBytes;
    await route.fulfill({ status: 200, body: '{}' });
  } else if (method === 'GET') {
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: videoBytes });
  } else if (method === 'DELETE') {
    state.deleted = true;
    await route.fulfill({ status: 200, body: '[]' });
  } else {
    throw new Error('unexpected storage method ' + method);
  }
});

try {
  const desktop = await context.newPage();
  await desktop.goto(base);
  await desktop.waitForFunction(() => window.__gaitAnalysis && window.__gaitMedia);
  await desktop.click('#page2-gait');
  await desktop.waitForFunction(() => window.__gaitAnalysis.getState().resumeReady);
  desktop.once('dialog', dialog => dialog.accept());
  await desktop.click('#gait-new-session');
  await desktop.click('#gait-qr-left');
  await desktop.waitForFunction(() => document.querySelector('#gait-qr-url')?.textContent.includes('gait-upload.html'));
  const uploadUrl = await desktop.locator('#gait-qr-url').textContent();
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(uploadUrl);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '手机上传页不能横向溢出');
  await mobile.setInputFiles('#gait-mobile-file', video);
  await mobile.click('#gait-mobile-upload');
  await mobile.waitForFunction(() => document.querySelector('#gait-mobile-status')?.textContent.includes('上传完成'));
  await desktop.waitForFunction(() => {
    const view = window.__gaitAnalysis.getState().session.views.left;
    return view.videoElement && view.video && view.video.width === 720;
  });
  const metadata = await desktop.evaluate(() => {
    const view = window.__gaitAnalysis.getState().session.views.left;
    return { width: view.video.width, height: view.video.height, name: view.video.name };
  });
  assert.deepEqual(metadata, { width: 720, height: 1280, name: 'left.mp4' });
  assert.equal(state.prepare.p_file_size, videoBytes.length);
  assert.equal(state.prepare.p_sha256, videoHash);
  assert.deepEqual(state.uploaded, readFileSync(video));
  assert.equal(state.deleted, true);
  assert.equal(state.consumed, true);
  console.log('PASS 手机扫码上传原视频，电脑自动接收、校验并删除云端对象');
} finally {
  await browser.close();
  if (server) server.kill();
}
