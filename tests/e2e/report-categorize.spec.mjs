// tests/e2e/report-categorize.spec.mjs
// E2E 验证: 认知报告与神经系统自评报告在列表中分类显示 + 本机删除按钮可用
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

  // 9) 验证无 JS 报错
  check('无 console 错误', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // 10) XSS 防护: 恶意患者名不应执行
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
