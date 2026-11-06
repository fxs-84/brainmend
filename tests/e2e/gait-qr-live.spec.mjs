import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const video = 'C:/Users/Lenovo/.kimi-code/sessions/wd_cervical-spine-rehab-game_a86bb53d2922/session_472ba37d-8135-45fa-8a49-c206003b1ad8/media/f_cc73a9be-1a92-43f9-b8ea-fa55d03962a4.mp4';
const expectedHash = createHash('sha256').update(readFileSync(video)).digest('hex');
const server = process.env.TEST_URL ? null : spawn('node', ['tests/static-server.mjs'], {
  cwd: root, env: { ...process.env, PORT: '8798' }, stdio: 'ignore'
});
const base = process.env.TEST_URL || 'http://127.0.0.1:8798/';
if (server) await new Promise(resolve => setTimeout(resolve, 700));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let desktop;
let sessionId = '';
let token = '';
try {
  const context = await browser.newContext();
  desktop = await context.newPage();
  desktop.setDefaultTimeout(120000);
  await desktop.goto(base);
  await desktop.waitForFunction(() => window.__gaitAnalysis && window.__gaitMedia);
  await desktop.click('#page2-gait');
  await desktop.waitForFunction(() => window.__gaitAnalysis.getState().resumeReady);
  desktop.on('console', message => { if (message.type() === 'error') console.error('DESKTOP', message.text()); });
  desktop.on('pageerror', error => console.error('PAGEERROR', error.message));
  desktop.once('dialog', dialog => dialog.accept());
  await desktop.click('#gait-new-session');
  await desktop.click('#gait-qr-left');
  await desktop.waitForTimeout(6000);
  console.log('QR STATE', await desktop.evaluate(() => ({
    error: window.__gaitAnalysis.getState().error,
    url: document.querySelector('#gait-qr-url')?.textContent || '',
    status: document.querySelector('#gait-qr-status')?.textContent || ''
  })));
  await desktop.waitForFunction(() => document.querySelector('#gait-qr-url')?.textContent.includes('gait-upload.html'), null, { timeout: 30000 });
  const uploadUrl = await desktop.locator('#gait-qr-url').textContent();
  const params = new URL(uploadUrl).searchParams;
  sessionId = params.get('session');
  token = params.get('token');
  assert.ok(sessionId && token, '二维码缺少上传会话');

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('console', message => { if (message.type() === 'error') console.error('MOBILE', message.text()); });
  await mobile.goto(uploadUrl);
  await mobile.setInputFiles('#gait-mobile-file', video);
  await mobile.click('#gait-mobile-upload');
  await mobile.waitForFunction(() => document.querySelector('#gait-mobile-status')?.textContent.includes('上传完成'), null, { timeout: 300000 });

  await desktop.waitForFunction(() => {
    const view = window.__gaitAnalysis.getState().session.views.left;
    return view.videoElement && view.video?.width === 720;
  }, null, { timeout: 300000, polling: 1000 });

  const result = await desktop.evaluate(async ({ sessionId, token, expectedHash }) => {
    const state = window.__gaitAnalysis.getState();
    const view = state.session.views.left;
    const session = await window.__gaitTransfer.getSession(sessionId, token);
    const storageUrl = window.__SUPABASE_URL__.replace(/\/$/, '') + '/storage/v1/object/gait-video-uploads/' + sessionId + '/' + token + '/source';
    const objectResponse = await fetch(storageUrl, {
      headers: { apikey: window.__SUPABASE_ANON_KEY__, Authorization: 'Bearer ' + window.__SUPABASE_ANON_KEY__ }
    });
    return {
      error: state.error,
      notice: state.notice,
      width: view.video?.width,
      height: view.video?.height,
      name: view.video?.name,
      size: view.video?.size,
      sessionStatus: session.status,
      objectStatus: objectResponse.status,
      expectedHash
    };
  }, { sessionId, token, expectedHash });
  assert.equal(result.error, '');
  assert.match(result.notice, /SHA-256 校验一致/);
  assert.equal(result.width, 720);
  assert.equal(result.height, 1280);
  assert.equal(result.size, readFileSync(video).length);
  assert.equal(result.sessionStatus, 'consumed');
  assert.ok(result.objectStatus >= 400, '接收成功后云端对象应不可再访问，实际 ' + result.objectStatus);
  console.log('PASS 真实 Supabase 扫码上传、原文件校验与删除', result);
} finally {
  if (desktop) {
    await desktop.evaluate(async ({ sessionId, token }) => {
      if (!sessionId || !token) return;
      try {
        await window.__gaitTransfer.receiveVideo({ sessionId, token });
      } catch (e) {}
      try {
        await fetch(window.__SUPABASE_URL__.replace(/\/$/, '') + '/storage/v1/object/gait-video-uploads', {
          method: 'DELETE',
          headers: { apikey: window.__SUPABASE_ANON_KEY__, Authorization: 'Bearer ' + window.__SUPABASE_ANON_KEY__, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [sessionId + '/' + token + '/source'] })
        });
      } catch (e) {}
    }, { sessionId, token });
  }
  await browser.close();
  if (server) server.kill();
}
