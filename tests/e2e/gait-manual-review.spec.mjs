import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL = process.env.TEST_URL || 'http://127.0.0.1:5199/';
const fixture = path.join(ROOT, 'tests', 'fixtures', 'gait-walk-real.mp4');
const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function syntheticFrames(side) {
  return Array.from({ length: 40 }, (_, frameIndex) => {
    const names = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'foot_index'];
    const coordinates = [[100, 80], [110, 150], [120, 220], [100, 180], [105, 260], [100, 340], [95, 345], [150, 340]];
    return {
      frameIndex,
      t: frameIndex / 30,
      keypoints: names.map((name, index) => ({
        name: `${side}_${name}`, x: coordinates[index][0] + Math.sin(frameIndex / 8) * index,
        y: coordinates[index][1], score: 0.95, source: 'ai'
      }))
    };
  });
}

async function injectAndConfirm(page, side) {
  await page.evaluate(({ side, frames }) => {
    const api = window.__gaitAnalysis;
    const view = api.getState().session.views[side];
    view.frames = frames;
    view.rawFrameCount = frames.length;
    view.status = 'review';
    view.fps = 30;
    api.showReview(side);
  }, { side, frames: syntheticFrames(side) });
  await page.waitForSelector('#gait-editor-canvas');
  await page.setViewportSize({ width: 1440, height: 800 });
  const stageLayout = await page.locator('#gait-stage').evaluate(element => ({
    width: element.getBoundingClientRect().width,
    cropped: element.scrollHeight > element.clientHeight + 1,
    videoTop: element.querySelector('video').getBoundingClientRect().top,
    videoBottom: element.querySelector('video').getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight
  }));
  check(`${side} 审核视频区使用整行大画面`, stageLayout.width > 1200, `${stageLayout.width}px`);
  check(`${side} 默认画面不裁切人像`, !stageLayout.cropped);
  check(`${side} 非全屏完整显示人像`, stageLayout.videoTop >= 0 && stageLayout.videoBottom <= stageLayout.viewportHeight + 1, `视频 ${stageLayout.videoTop}–${stageLayout.videoBottom}px / 视口 ${stageLayout.viewportHeight}px`);
  await page.waitForFunction(() => document.querySelector('#gait-stage').classList.contains('gait-v2-rails-space'));
  const angleLayout = await page.evaluate(() => {
    const video = document.querySelector('#gait-review-video').getBoundingClientRect();
    const angles = [...document.querySelectorAll('[data-video-angle]')].map(element => {
      const rect = element.getBoundingClientRect();
      return { visible: rect.width > 0 && rect.height > 0, text: element.textContent, outside: rect.right <= video.left + 1 || rect.left >= video.right - 1 };
    });
    return { count: angles.length, angles, video: video.toJSON(), valid: angles.every(angle => angle.visible && angle.outside && angle.text !== '—') };
  });
  check(`${side} 五个角度显示在视频黑边且不遮挡人像`, angleLayout.count === 5 && angleLayout.valid, JSON.stringify(angleLayout));
  check(`${side} 不提供足跟标记`, await page.locator('#gait-add-point option[value="heel"]').count() === 0);
  const hasFullscreen = await page.locator('#gait-fullscreen').count() === 1;
  check(`${side} 提供全屏放大按钮`, hasFullscreen);
  if (hasFullscreen) {
    await page.click('#gait-fullscreen');
    await page.waitForFunction(() => document.fullscreenElement && document.fullscreenElement.id === 'gait-stage');
    const fitted = await page.locator('#gait-review-video').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width <= window.innerWidth + 1 && rect.height <= window.innerHeight + 1;
    });
    check(`${side} 全屏完整容纳视频`, fitted);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement && document.querySelector('#gait-stage').getBoundingClientRect().width > 1200);
  }
  if (side === 'left') await page.screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-large-editor.png') });
  check(`${side} 默认0.5倍速播放`, await page.locator('#gait-review-video').evaluate(video => video.playbackRate === 0.5));
  await page.selectOption('#gait-playback-rate', '0.25');
  await page.click('#gait-play');
  await page.waitForFunction(() => {
    const video = document.querySelector('#gait-review-video');
    return !video.paused && video.currentTime > 0;
  });
  check(`${side} 可切换0.25倍速并实际慢放`, await page.locator('#gait-review-video').evaluate(video => {
    const rate = video.playbackRate;
    video.pause();
    return rate === 0.25 && video.currentTime > 0;
  }));
  await page.click('#gait-next-frame');
  const current = await page.locator('#gait-frame-number').inputValue();
  check(`${side} 支持逐帧导航`, current === '1', current);
  await page.click('#gait-add-cycle');
  const standards = await page.locator('.gait-v2-phase-standard').allTextContents();
  check(`${side} 显示八时相判定标准`, standards.length === 8 && standards.every(text => text.includes('参考') && text.length > 20));
  check(`${side} 时相标准包含关键判定事件`, standards.some(text => text.includes('足尖离地')) && standards.some(text => text.includes('胫骨竖直')));
  await page.locator('[data-phase-start="LR"]').fill('2');
  await page.locator('[data-phase-end="LR"]').fill('6');
  for (let step = 0; step < 4; step++) await page.click('#gait-next-frame');
  await page.waitForFunction(side => window.__gaitAnalysis.getState().session.views[side].currentFrame === 4, side);
  const frameBeforeMark = await page.evaluate(side => window.__gaitAnalysis.getState().session.views[side].currentFrame, side);
  await page.click('[data-mark-phase="LR"]');
  const frameAfterMark = await page.evaluate(side => ({ frame: window.__gaitAnalysis.getState().session.views[side].currentFrame, representative: window.__gaitAnalysis.getState().session.views[side].confirmedCycles[0].phases.LR.representativeFrame }), side);
  await page.click('#gait-confirm-cycle');
  const continuousPhase = await page.evaluate(side => {
    const view = window.__gaitAnalysis.getState().session.views[side];
    const cycle = view.confirmedCycles[0];
    const series = window.__gaitKinematics.computeViewSeries(view, cycle);
    const validation = window.__gaitKinematics.validateCycle(view, { ...cycle, confirmed: true });
    return {
      pass: cycle.phases.LR.representativeFrame === 4 && series.filter(frame => frame.frameIndex >= 2 && frame.frameIndex <= 6).every(frame => frame.phase === 'LR') && series.find(frame => frame.frameIndex === 7).phase !== 'LR',
      validation,
      lr: cycle.phases.LR,
      actualPhases: series.map(frame => frame.phase)
    };
  }, side);
  check(`${side} 代表帧与连续时相区间分别生效`, continuousPhase.pass, JSON.stringify({ lr: continuousPhase.lr, actualPhases: continuousPhase.actualPhases, frameBeforeMark, frameAfterMark }));
  const confirmed = await page.evaluate(side => {
    const cycles = window.__gaitAnalysis.getState().session.views[side].confirmedCycles;
    return cycles.length === 1 && cycles[0].confirmed === true;
  }, side);
  check(`${side} 人工周期可确认`, confirmed);
  await page.locator('#gait-editor-canvas').scrollIntoViewIfNeeded();
  const shoulder = await page.evaluate(side => {
    const view = window.__gaitAnalysis.getState().session.views[side];
    const point = view.frames[view.currentFrame].keypoints.find(item => item.name === `${side}_shoulder`);
    const rect = document.querySelector('#gait-editor-canvas').getBoundingClientRect();
    const canvas = document.querySelector('#gait-editor-canvas');
    return { x: rect.left + point.x * rect.width / canvas.width, y: rect.top + point.y * rect.height / canvas.height };
  }, side);
  await page.mouse.move(shoulder.x, shoulder.y);
  await page.mouse.down();
  await page.mouse.move(shoulder.x + 18, shoulder.y + 8, { steps: 4 });
  await page.mouse.up();
  const invalidated = await page.evaluate(side => {
    const view = window.__gaitAnalysis.getState().session.views[side];
    const point = view.frames[view.currentFrame].keypoints.find(item => item.name === `${side}_shoulder`);
    return point.source === 'manual' && view.confirmedCycles[0].confirmed === false;
  }, side);
  check(`${side} 拖动骨架使确认失效`, invalidated);
  await page.evaluate(side => {
    const view = window.__gaitAnalysis.getState().session.views[side];
    const frame = view.frames[view.currentFrame];
    frame.keypoints = frame.keypoints.filter(point => point.name !== `${side}_wrist`);
  }, side);
  await page.selectOption('#gait-add-point', 'wrist');
  await page.locator('#gait-editor-canvas').click({ position: { x: 210, y: 120 } });
  const placed = await page.evaluate(side => {
    const view = window.__gaitAnalysis.getState().session.views[side];
    const point = view.frames[view.currentFrame].keypoints.find(item => item.name === `${side}_wrist`);
    return point && point.source === 'manual' && view.confirmedCycles[0].confirmed === false;
  }, side);
  check(`${side} 可人工补标缺失解剖点`, placed);
  await page.click('#gait-confirm-cycle');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const actionTimeout = Number(process.env.TEST_TIMEOUT || 30000);
page.setDefaultTimeout(actionTimeout);
page.setDefaultNavigationTimeout(actionTimeout);
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__gaitAnalysis && window.__gaitKinematics && window.__gaitReportV2);
  await page.click('#page2-gait');
  await page.setInputFiles('#gait-file-left', fixture);
  await page.setInputFiles('#gait-file-right', fixture);
  await page.waitForFunction(() => {
    const views = window.__gaitAnalysis.getState().session.views;
    return views.left.video && views.right.video && views.left.video.duration > 0 && views.right.video.duration > 0;
  });
  check('左右视频独立上传', true);
  await page.selectOption('#gait-speed', '5');
  check('可选择5 km/h测试协议', await page.locator('#gait-speed').inputValue() === '5');
  await injectAndConfirm(page, 'left');
  await injectAndConfirm(page, 'right');
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__gaitAnalysis && window.__gaitKinematics && window.__gaitReportV2);
  await page.evaluate(() => window.__gaitAnalysis.open());
  await page.waitForFunction(() => {
    const views = window.__gaitAnalysis.getState().session.views;
    return views.left.frames.length === 40 && views.right.frames.length === 40 && views.left.videoElement && views.right.videoElement;
  });
  const restored = await page.evaluate(() => {
    const session = window.__gaitAnalysis.getState().session;
    return session.views.left.confirmedCycles[0].confirmed && session.views.right.confirmedCycles[0].confirmed;
  });
  check('刷新后恢复双视频草稿与人工确认', restored);
  const restoredSpeed = await page.evaluate(() => window.__gaitAnalysis.getState().session.protocol.speedKmh);
  check('刷新后恢复5 km/h测试协议', restoredSpeed === 5, String(restoredSpeed));
  await page.evaluate(() => window.__gaitAnalysis.showReview('left'));
  const restoredPlayback = await page.evaluate(() => {
    const session = window.__gaitAnalysis.getState().session;
    return session.views.left.playbackRate === 0.25 && session.views.right.playbackRate === 0.25 && session.views.left.videoElement.playbackRate === 0.25;
  });
  check('刷新后恢复慢放倍速', restoredPlayback);
  await page.evaluate(() => {
    window.__gaitAnalysis.close();
    window.__gaitAnalysis.open();
  });
  await page.waitForFunction(() => {
    const views = window.__gaitAnalysis.getState().session.views;
    return views.left.frames.length === 40 && views.right.frames.length === 40 && views.left.videoElement && views.right.videoElement;
  });
  check('关闭后重新打开恢复工作区', await page.locator('#gait-overlay').isVisible());
  await page.click('#gait-show-report');
  await page.waitForSelector('#gait-report-v2', { timeout: 15000 });
  check('双侧报告在人工确认后生成', await page.locator('#gait-report-v2').isVisible());
  await page.waitForSelector('#gait-neuro-report[data-protocol-speed="5"]');
  check('报告包含双侧神经调控解释', await page.locator('#gait-neuro-report [data-neuro-key]').count() === 16);
  check('肩伸课程参考为18–24°', await page.locator('#gait-neuro-report [data-neuro-key="shoulderExtension"]').evaluateAll(elements => elements.every(element => element.textContent.includes('18–24°'))));
  check('报告区分皮层小脑基底节与前庭', await page.locator('#gait-neuro-report').evaluate(element => ['皮层', '小脑', '基底节', '前庭'].every(text => element.textContent.includes(text))));
  check('报告包含LR连续区间峰值', await page.locator('#gait-neuro-report [data-neuro-key="lrKneeFlexion"]').count() === 2);
  check('报告包含五类关节曲线', await page.locator('#gait-report-v2 canvas').count() >= 5);
  check('报告包含实际时间逐帧曲线', await page.locator('#gait-report-v2 canvas[aria-label$="实际时间曲线"]').count() === 10);
  check('报告包含左右十六张时相截图', await page.locator('#gait-report-v2 .gait-v2-phase-shot').count() === 16);
  const snapshotMeans = await page.evaluate(async () => {
    const means = [];
    for (const snapshot of window.__gaitAnalysis.getState().results.views.left.phaseSnapshots) {
      const image = new Image();
      image.src = snapshot.imageData;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      means.push(sum / (pixels.length / 4));
    }
    return means;
  });
  check('时相截图包含真实视频底图', snapshotMeans.every(mean => mean > 30), JSON.stringify(snapshotMeans));
  check('导出未被禁用', await page.locator('#gait-export-pdf').isEnabled());
  const downloadPromise = page.waitForEvent('download');
  await page.click('#gait-export-csv');
  const download = await downloadPromise;
  check('CSV 可下载', download.suggestedFilename().endsWith('.csv'), download.suggestedFilename());
  const jsonPromise = page.waitForEvent('download');
  await page.click('#gait-export-json');
  const jsonDownload = await jsonPromise;
  check('JSON 可下载', jsonDownload.suggestedFilename().endsWith('.json'), jsonDownload.suggestedFilename());
  const exportedReport = JSON.parse(await readFile(await jsonDownload.path(), 'utf8'));
  check('JSON保存测试协议与双侧解释快照', exportedReport.protocol.speedKmh === 5 && exportedReport.neuroInterpretation.version === 'course-neuro-v1' && exportedReport.neuroInterpretation.sides.left.observations.length === 8 && exportedReport.neuroInterpretation.sides.right.observations.length === 8);
  const pdfPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#gait-export-pdf');
  const pdfDownload = await pdfPromise;
  check('PDF 可下载', pdfDownload.suggestedFilename().endsWith('.pdf'), pdfDownload.suggestedFilename());
  await pdfDownload.saveAs(path.join(ROOT, 'tests', 'reports', 'gait-neuro-report.pdf'));
  const neuroShotStyle = await page.addStyleTag({ content: '#gait-nav, .gait-v2-report-bar { visibility: hidden !important; }' });
  await page.locator('#gait-neuro-report').screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-neuro-report.png') });
  await neuroShotStyle.evaluate(element => element.remove());
  await page.click('#gait-nav-upload');
  await page.selectOption('#gait-speed', '5.5');
  check('修改速度不清除人工确认', await page.evaluate(() => {
    const views = window.__gaitAnalysis.getState().session.views;
    return views.left.confirmedCycles[0].confirmed && views.right.confirmedCycles[0].confirmed;
  }));
  await page.click('#gait-show-report');
  await page.waitForFunction(() => document.querySelector('#gait-neuro-report')?.dataset.protocolSpeed === '5.5');
  check('5.5 km/h不误用5 km/h课程阈值', await page.locator('#gait-neuro-report [data-reference-status="pending"]').count() === 16);
  await page.evaluate(() => { document.querySelector('#gait-overlay').scrollTop = 0; });
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-report.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => ({
    overflow: document.querySelector('#gait-overlay').scrollWidth > window.innerWidth + 1,
    offenders: [...document.querySelectorAll('#gait-overlay *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.right > window.innerWidth + 1 || rect.left < -1;
    }).slice(0, 12).map(element => ({ tag: element.tagName, id: element.id, class: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right }))
  }));
  check('390px 报告页无横向溢出', !mobileLayout.overflow, JSON.stringify(mobileLayout.offenders));
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-mobile-report.png') });
  const mobileNeuroShotStyle = await page.addStyleTag({ content: '#gait-nav, .gait-v2-report-bar { visibility: hidden !important; }' });
  await page.locator('#gait-neuro-report').evaluate(element => {
    const overlay = document.querySelector('#gait-overlay');
    overlay.scrollTop += element.getBoundingClientRect().top - 20;
  });
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-neuro-mobile.png') });
  await mobileNeuroShotStyle.evaluate(element => element.remove());
  await page.click('#gait-back-review');
  await page.waitForSelector('#gait-editor-canvas');
  const mobileEditorOverflow = await page.evaluate(() => document.querySelector('#gait-overlay').scrollWidth > window.innerWidth + 1);
  check('390px 人工时相页无横向溢出', !mobileEditorOverflow);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-mobile-editor.png'), fullPage: true });
  await page.locator('#gait-cycle-editor').screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-phase-standards.png') });
  check('无浏览器脚本错误', errors.length === 0, errors.join('\n'));
} catch (error) {
  const layout = await page.evaluate(() => ({
    body: document.querySelector('#gait-body')?.textContent.slice(0, 300),
    canvas: document.querySelector('#gait-editor-canvas')?.getBoundingClientRect().toJSON(),
    video: document.querySelector('#gait-review-video')?.getBoundingClientRect().toJSON(),
    videoStyle: document.querySelector('#gait-review-video')?.getAttribute('style'),
    stage: document.querySelector('#gait-stage-inner')?.getBoundingClientRect().toJSON()
  })).catch(() => null);
  await page.screenshot({ path: path.join(ROOT, 'screenshots', 'gait-v2-e2e-failure.png'), fullPage: true }).catch(() => {});
  check('端到端流程完成', false, String(error) + '\n' + JSON.stringify(layout));
} finally {
  await browser.close();
}

if (results.some(result => !result.ok)) process.exitCode = 1;
