// tests/e2e/report-categorize.spec.mjs
// E2E 验证: 认知报告与神经系统自评报告在列表中分类显示 + 云端删除按钮可用
import { chromium } from 'playwright';

const URL = process.env.TEST_URL || 'http://127.0.0.1:5199/';

const TEST_RECORDS = [
  // 认知报告
  {
    id: 'cog_001',
    date: '2026-08-05',
    time: '14:30',
    patientInfo: { name: '张三', age: '35', gender: '男' },
    overallScore: 120,
    isQuick6: false,
    normalizedScores: { attention: 80 },
    rawScores: {},
    brainRegions: {}
  },
  {
    id: 'cog_002',
    date: '2026-08-04',
    time: '10:15',
    patientInfo: { name: '李四', age: '28', gender: '女' },
    overallScore: 95,
    isQuick6: true,
    normalizedScores: {},
    rawScores: {},
    brainRegions: {}
  },
  // 神经系统自评报告
  {
    id: 'qnr_001',
    date: '2026-08-06',
    time: '09:00',
    patientInfo: { name: '王五', age: '42', gender: '男' },
    type: 'questionnaire',
    overallScore: 68,
    qnr: { percent: 68, worstSeverity: 'mild', byRegion: {}, severityByRegion: {} }
  },
  {
    id: 'qnr_002',
    date: '2026-08-05',
    time: '16:45',
    patientInfo: { name: '赵六', age: '55', gender: '女' },
    type: 'questionnaire',
    overallScore: 82,
    qnr: { percent: 82, worstSeverity: 'moderate', byRegion: {}, severityByRegion: {} }
  }
];

const RESULTS = [];
function check(name, cond, detail) {
  RESULTS.push({ name, ok: !!cond, detail: detail || '' });
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(String(err)));

  // 1) 加载页面
  const resp = await page.goto(URL, { waitUntil: 'networkidle' });
  check('页面加载返回 200', resp && resp.status() === 200, `status=${resp ? resp.status() : 'null'}`);

  // 2) 等待 cognitive-report.js 模块加载
  await page.waitForFunction(() => typeof window._showCogRecordList === 'function', { timeout: 10000 });
  check('window._showCogRecordList 已加载 (ESM module)', true);

  // 3) 注入测试数据 (含恶意患者名验证 XSS 防护)
  const XSS_RECORDS = [...TEST_RECORDS, {
    id: 'cog_xss',
    date: '2026-08-01',
    time: '00:00',
    patientInfo: { name: '<img src=x onerror=window.__pwned=true>', age: '1', gender: 'X' },
    overallScore: 1,
    isQuick6: false,
    normalizedScores: {}, rawScores: {}, brainRegions: {}
  }];
  await page.evaluate((recs) => {
    localStorage.setItem('cog_records', JSON.stringify(recs));
    localStorage.setItem('cog_therapist_id', 'th_test_e2e');
    window.__pwned = false;
  }, XSS_RECORDS);

  // 4) 打开报告列表
  await page.evaluate(() => window._showCogRecordList());
  await page.waitForSelector('#cog-record-list-overlay', { timeout: 5000 });
  check('报告列表弹窗已打开', true);

  // 5) 验证分组标题存在
  const headers = await page.$$eval('#cog-record-list-overlay div', els =>
    els.filter(e => e.textContent.includes('认知报告') || e.textContent.includes('神经系统自评报告'))
       .map(e => e.textContent.trim().substring(0, 60))
  );
  check('分类标题: 认知报告', headers.some(h => h.includes('认知报告')), JSON.stringify(headers));
  check('分类标题: 神经系统自评报告', headers.some(h => h.includes('神经系统自评报告')), JSON.stringify(headers));

  // 6) 验证行级 data-record-kind 标记
  const rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els =>
    els.map(e => e.dataset.recordKind)
  );
  const cogRows = rowKinds.filter(k => k === 'cognitive').length;
  const qnrRows = rowKinds.filter(k => k === 'questionnaire').length;
  check('认知报告行数 = 3 (含 XSS 测试记录)', cogRows === 3, `actual=${cogRows}, kinds=${JSON.stringify(rowKinds)}`);
  check('自评报告行数 = 2', qnrRows === 2, `actual=${qnrRows}, kinds=${JSON.stringify(rowKinds)}`);

  // 7) 验证本机删除按钮存在
  const delBtns = await page.$$eval('#cog-record-list-overlay .cog-rec-del', els => els.length);
  check('本机删除按钮数量 = 5 (3+2)', delBtns === 5, `actual=${delBtns}`);

  // 8) 截图证据
  await page.screenshot({ path: 'tests/e2e/screenshots/report-categorize-local.png', fullPage: false });

  // 9) 切到云端 tab + 模拟 GitHub API
  await page.evaluate(() => {
    localStorage.setItem('cog_gh_token', 'ghp_test_e2e_token_xxx');
    // Mock fetch to return cloud records
    const sampleB64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    const cogRec = { id: 'cog_cloud_1', date: '2026-08-05', time: '11:00', patientInfo: { name: '云端认知' }, overallScore: 110, isQuick6: false, createdAt: '2026-08-05T03:00:00Z' };
    const qnrRec = { id: 'qnr_cloud_1', date: '2026-08-06', time: '08:00', patientInfo: { name: '云端自评' }, type: 'questionnaire', overallScore: 70, qnr: { percent: 70, worstSeverity: 'mild' }, createdAt: '2026-08-06T00:00:00Z' };
    const listJson = JSON.stringify([
      { type: 'file', name: '2026-08-05_cog_cloud_1.json', path: 'data/reports/th_test_e2e/2026-08-05_cog_cloud_1.json', sha: 'sha_cog_1', url: 'https://api.github.com/repos/fxs-84/brainmend/contents/data/reports/th_test_e2e/2026-08-05_cog_cloud_1.json', size: 100 },
      { type: 'file', name: '2026-08-06_qnr_cloud_1.json', path: 'data/reports/th_test_e2e/2026-08-06_qnr_cloud_1.json', sha: 'sha_qnr_1', url: 'https://api.github.com/repos/fxs-84/brainmend/contents/data/reports/th_test_e2e/2026-08-06_qnr_cloud_1.json', size: 100 }
    ]);
    const cogFileJson = JSON.stringify({ content: sampleB64(cogRec) });
    const qnrFileJson = JSON.stringify({ content: sampleB64(qnrRec) });

    const origFetch = window.fetch;
    window.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('/contents/data/reports/th_test_e2e') && (!u.includes('.json?') && !u.match(/[^/]\.json/))) {
        return new Response(listJson, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('cog_cloud_1.json') && (!init || init.method !== 'DELETE')) {
        return new Response(cogFileJson, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('qnr_cloud_1.json') && (!init || init.method !== 'DELETE')) {
        return new Response(qnrFileJson, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init && init.method === 'DELETE') {
        return new Response(JSON.stringify({ content: { sha: 'new_sha_after_delete' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return origFetch ? origFetch(url, init) : new Response('{}', { status: 404 });
    };
  });

  // 10) 点击云端 tab
  const cloudTabClicked = await page.evaluate(() => {
    const overlay = document.getElementById('cog-record-list-overlay');
    if (!overlay) return false;
    const btns = overlay.querySelectorAll('button');
    for (const b of btns) { if (b.textContent.includes('云端记录')) { b.click(); return true; } }
    return false;
  });
  check('云端 tab 可点击', cloudTabClicked);
  await page.waitForTimeout(2000); // wait for fetchCloudReports

  // 11) 验证云端行 + 删除按钮
  const cloudRows = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els =>
    els.map(e => ({ kind: e.dataset.recordKind, id: e.dataset.recordId }))
  );
  const cloudCog = cloudRows.filter(r => r.kind === 'cognitive').length;
  const cloudQnr = cloudRows.filter(r => r.kind === 'questionnaire').length;
  check('云端认知行 = 1', cloudCog === 1, JSON.stringify(cloudRows));
  check('云端自评行 = 1', cloudQnr === 1, JSON.stringify(cloudRows));

  const cloudDelBtns = await page.$$eval('#cog-record-list-overlay .cog-rec-del-cloud', els => els.length);
  check('云端删除按钮数量 = 2', cloudDelBtns === 2, `actual=${cloudDelBtns}`);

  await page.screenshot({ path: 'tests/e2e/screenshots/report-categorize-cloud.png', fullPage: false });

  // 12) 点击云端删除按钮 (拦截 confirm)
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => {
    const btns = document.querySelectorAll('#cog-record-list-overlay .cog-rec-del-cloud');
    if (btns.length > 0) btns[0].click();
  });
  await page.waitForTimeout(1500);
  const remainingCloudRows = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.length);
  check('云端删除后行数减少 (从 2 → 1)', remainingCloudRows === 1, `actual=${remainingCloudRows}`);

  await page.screenshot({ path: 'tests/e2e/screenshots/report-categorize-cloud-after-delete.png', fullPage: false });

  // 13) 验证无 JS 报错
  check('无 console 错误', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // 14) XSS 防护: 恶意患者名不应执行
  const pwned = await page.evaluate(() => window.__pwned === true);
  check('XSS 防护: 恶意患者名未执行 onerror', pwned === false, `pwned=${pwned}`);

  await browser.close();

  // 打印结果
  const passed = RESULTS.filter(r => r.ok).length;
  const failed = RESULTS.filter(r => !r.ok);
  console.log('\n=== E2E Report Categorize ===');
  for (const r of RESULTS) {
    console.log((r.ok ? '✔' : '✖') + ' ' + r.name + (r.detail ? ' | ' + r.detail : ''));
  }
  console.log(`\n${passed}/${RESULTS.length} passed`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch(e => { console.error('E2E failed:', e); process.exit(1); });
