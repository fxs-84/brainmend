// tests/e2e/report-search.spec.mjs
// E2E 验证: 报告列表搜索/查询功能
import { chromium } from 'playwright';

const URL = process.env.TEST_URL || 'http://127.0.0.1:5199/';

const RESULTS = [];
function check(name, cond, detail) {
  RESULTS.push({ name, ok: !!cond, detail: detail || '' });
}

// 注入多条异构记录覆盖各搜索维度
const TEST_RECORDS = [
  { id: 'c1', date: '2026-08-05', time: '14:30', patientInfo: { name: '张三' }, overallScore: 120, isQuick6: false, normalizedScores: {}, rawScores: {}, brainRegions: {} },
  { id: 'c2', date: '2026-08-04', time: '10:15', patientInfo: { name: '李四' }, overallScore: 95, isQuick6: true, normalizedScores: {}, rawScores: {}, brainRegions: {} },
  { id: 'c3', date: '2026-07-30', time: '08:00', patientInfo: { name: '李四妹' }, overallScore: 100, isQuick6: false, normalizedScores: {}, rawScores: {}, brainRegions: {} },
  { id: 'c4', date: '2026-08-06', time: '11:00', patientInfo: { name: '王五' }, overallScore: 110, isQuick6: false, normalizedScores: {}, rawScores: {}, brainRegions: {} },
  { id: 'q1', type: 'questionnaire', date: '2026-08-06', time: '09:00', patientInfo: { name: '张三儿媳' }, overallScore: 68, qnr: { percent: 68, worstSeverity: 'mild', byRegion: {}, severityByRegion: {} } },
  { id: 'q2', type: 'questionnaire', date: '2026-08-05', time: '16:45', patientInfo: { name: '赵六' }, overallScore: 82, qnr: { percent: 82, worstSeverity: 'moderate', byRegion: {}, severityByRegion: {} } }
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(String(err)));

  const resp = await page.goto(URL, { waitUntil: 'networkidle' });
  check('页面加载返回 200', resp && resp.status() === 200);

  await page.waitForFunction(() => typeof window._showCogRecordList === 'function', { timeout: 10000 });

  // 注入 6 条测试数据
  await page.evaluate((recs) => {
    localStorage.setItem('cog_records', JSON.stringify(recs));
    localStorage.setItem('cog_therapist_id', 'th_search_test');
  }, TEST_RECORDS);

  // 打开报告列表
  await page.evaluate(() => window._showCogRecordList());
  await page.waitForSelector('#cog-record-list-overlay', { timeout: 5000 });
  await page.waitForTimeout(200);

  // 0) 搜索框存在
  const searchInputExists = await page.$('#cog-rec-search-input') !== null;
  check('搜索框存在', searchInputExists);

  // 1) 基线: 无搜索时显示全部 6 条
  let rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordKind));
  check('无搜索时显示 6 条 (4 cog + 2 qnr)', rowKinds.length === 6, `actual=${rowKinds.length}, kinds=${JSON.stringify(rowKinds)}`);

  // 2) 按患者姓名 "张" → 匹配张三 + 张三儿媳 = 2 条
  await page.fill('#cog-rec-search-input', '张');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordId));
  check('搜索"张" → 2 条 (张三 + 张三儿媳)', rowKinds.length === 2 && rowKinds.includes('c1') && rowKinds.includes('q1'), `ids=${JSON.stringify(rowKinds)}`);

  // 3) 搜索提示文本
  const hint1 = await page.textContent('#cog-rec-search-hint').catch(() => '');
  check('搜索提示显示 "搜索: 张 · 匹配 2 / 6 条"', hint1.includes('张') && hint1.includes('2') && hint1.includes('6'), `hint="${hint1}"`);

  // 4) 按日期 "2026-08-05" → 匹配 c1 + q2 = 2 条
  await page.fill('#cog-rec-search-input', '2026-08-05');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordId));
  check('搜索"2026-08-05" → 2 条 (c1 + q2)', rowKinds.length === 2 && rowKinds.includes('c1') && rowKinds.includes('q2'), `ids=${JSON.stringify(rowKinds)}`);

  // 5) 按类型 "自评" → 2 条 questionnaire
  await page.fill('#cog-rec-search-input', '自评');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordKind));
  check('搜索"自评" → 2 条 questionnaire', rowKinds.length === 2 && rowKinds.every(k => k === 'questionnaire'), `kinds=${JSON.stringify(rowKinds)}`);

  // 6) 按类型 "认知" → 4 条 cognitive
  await page.fill('#cog-rec-search-input', '认知');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordKind));
  check('搜索"认知" → 4 条 cognitive', rowKinds.length === 4 && rowKinds.every(k => k === 'cognitive'), `kinds=${JSON.stringify(rowKinds)}`);

  // 7) 无匹配 → 0 条
  await page.fill('#cog-rec-search-input', '不存在的患者xyz');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordId));
  check('搜索"不存在的患者xyz" → 0 条', rowKinds.length === 0, `ids=${JSON.stringify(rowKinds)}`);

  // 8) 清空搜索 → 恢复 6 条
  await page.click('#cog-record-list-overlay button[title="清空搜索"]');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordKind));
  check('清空搜索后恢复 6 条', rowKinds.length === 6, `actual=${rowKinds.length}`);

  // 9) 搜索框清空值
  const searchValue = await page.inputValue('#cog-rec-search-input');
  check('清空后搜索框值为空', searchValue === '', `value="${searchValue}"`);

  // 10) 按姓名 "李" → 匹配李四 + 李四妹 = 2 条
  await page.fill('#cog-rec-search-input', '李');
  await page.waitForTimeout(100);
  rowKinds = await page.$$eval('#cog-record-list-overlay [data-record-kind]', els => els.map(e => e.dataset.recordId));
  check('搜索"李" → 2 条 (李四 + 李四妹)', rowKinds.length === 2 && rowKinds.includes('c2') && rowKinds.includes('c3'), `ids=${JSON.stringify(rowKinds)}`);

  // 11) 截图证据
  await page.screenshot({ path: 'tests/e2e/screenshots/report-search.png', fullPage: false });

  check('无 console 错误', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await browser.close();

  const passed = RESULTS.filter(r => r.ok).length;
  const failed = RESULTS.filter(r => !r.ok);
  console.log('\n=== E2E Report Search ===');
  for (const r of RESULTS) {
    console.log((r.ok ? '✔' : '✖') + ' ' + r.name + (r.detail ? ' | ' + r.detail : ''));
  }
  console.log(`\n${passed}/${RESULTS.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error('Search E2E failed:', e); process.exit(1); });
