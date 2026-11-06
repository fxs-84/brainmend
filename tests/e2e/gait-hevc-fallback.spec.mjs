import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const video = 'C:/Users/Lenovo/.kimi-code/sessions/wd_cervical-spine-rehab-game_a86bb53d2922/session_472ba37d-8135-45fa-8a49-c206003b1ad8/media/f_cc73a9be-1a92-43f9-b8ea-fa55d03962a4.mp4';
const server = process.env.TEST_URL ? null : spawn('node', ['tests/static-server.mjs'], {
  cwd: root, env: { ...process.env, PORT: '8797' }, stdio: 'ignore'
});
const base = process.env.TEST_URL || 'http://127.0.0.1:8797/';
if (server) await new Promise(resolve => setTimeout(resolve, 700));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
});
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('PAGE ERROR', error));
  page.on('console', message => {
    if (message.type() === 'error') console.error('BROWSER', message.text());
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__gaitAnalysis && window.__gaitMedia, null, { timeout: 120000 });
  await page.click('#page2-gait');
  await page.waitForFunction(() => window.__gaitAnalysis.getState().resumeReady);
  page.once('dialog', dialog => dialog.accept());
  await page.click('#gait-new-session');
  await page.setInputFiles('#gait-file-left', video);
  await page.waitForFunction(() => {
    const state = window.__gaitAnalysis.getState();
    return state.error || (state.session.views.left.video && state.session.views.left.video.width === 720);
  }, null, { timeout: 900000, polling: 1000 });
  const loaded = await page.evaluate(() => {
    const state = window.__gaitAnalysis.getState();
    const view = state.session.views.left;
    return { error: state.error, width: view.video?.width, height: view.video?.height, name: view.video?.name, blobName: view.video?.blob?.name };
  });
  assert.equal(loaded.error, '');
  assert.equal(loaded.width, 720);
  assert.equal(loaded.height, 1280);
  assert.match(loaded.name, /-h264\.mp4$/);
  assert.match(loaded.blobName, /-h264\.mp4$/);
  await page.click('#gait-analyze-left');
  await page.waitForFunction(() => {
    const state = window.__gaitAnalysis.getState();
    return state.error || state.session.views.left.frames.length > 0;
  }, null, { timeout: 600000, polling: 1000 });
  const result = await page.evaluate(() => {
    const state = window.__gaitAnalysis.getState();
    return { error: state.error, frames: state.session.views.left.frames.length };
  });
  assert.equal(result.error, '');
  assert.ok(result.frames >= 500, JSON.stringify(result));
  console.log('PASS Edge HEVC 软件转码与逐帧识别', loaded, result);
} finally {
  await browser.close();
  if (server) server.kill();
}
