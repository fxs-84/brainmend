// tests/e2e/report-xss.spec.mjs
// 安全专项 E2E: 验证 genOverviewHTML 路径 (主报告页) 也防 XSS
import { chromium } from 'playwright';

const URL = process.env.TEST_URL || 'http://127.0.0.1:5199/';

const RESULTS = [];
function check(name, cond, detail) {
  RESULTS.push({ name, ok: !!cond, detail: detail || '' });
}

const XSS_PAYLOADS = [
  '<img src=x onerror="window.__pwned_list=1">',
  '<svg onload="window.__pwned_svg=1">',
  '"><script>window.__pwned_script=1</script>',
  '<iframe src="javascript:window.__pwned_iframe=1"></iframe>'
];

const XSS_RECORDS = XSS_PAYLOADS.map(function(payload, i) {
  return {
    id: 'cog_xss_' + i,
    date: '2026-08-01',
    time: '0' + i + ':00',
    patientInfo: { name: payload, age: '30', gender: 'X' },
    overallScore: 50,
    isQuick6: false,
    normalizedScores: { attention: 50 },
    rawScores: { attention: { score: 50, correct: 5, trials: 10 } },
    brainRegions: { '左额叶': 50, '右额叶': 50, '左顶叶': 50, '右顶叶': 50, '左枕叶': 50, '右枕叶': 50, '左颞叶': 50, '右颞叶': 50, '左小脑': 50, '右小脑': 50 }
  };
});

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(String(err)));

  const resp = await page.goto(URL, { waitUntil: 'networkidle' });
  check('页面加载返回 200', resp && resp.status() === 200, `status=${resp ? resp.status() : 'null'}`);

  await page.waitForFunction(() => typeof window._showCogRecordList === 'function', { timeout: 10000 });

  // 注入 XSS 测试数据
  await page.evaluate((recs) => {
    localStorage.setItem('cog_records', JSON.stringify(recs));
    localStorage.setItem('cog_therapist_id', 'th_xss_test');
    window.__pwned_list = 0;
    window.__pwned_svg = 0;
    window.__pwned_script = 0;
    window.__pwned_iframe = 0;
  }, XSS_RECORDS);

  // 1) 打开报告列表
  await page.evaluate(() => window._showCogRecordList());
  await page.waitForSelector('#cog-record-list-overlay', { timeout: 5000 });
  await page.waitForTimeout(300);

  // 2) 验证列表中 XSS payload 未执行
  const listPwned = await page.evaluate(() => ({
    list: window.__pwned_list,
    svg: window.__pwned_svg,
    script: window.__pwned_script,
    iframe: window.__pwned_iframe
  }));
  check('列表渲染 XSS 防护: 无 payload 执行', listPwned.list === 0 && listPwned.svg === 0 && listPwned.script === 0 && listPwned.iframe === 0, JSON.stringify(listPwned));

  // 3) 点击恶意记录, 触发主报告页 (genOverviewHTML) 渲染
  //    拦截 confirm 弹窗
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => {
    // 找到第一个 XSS 记录的行主体并点击
    const overlay = document.getElementById('cog-record-list-overlay');
    if (!overlay) return;
    const rows = overlay.querySelectorAll('[data-record-id^="cog_xss_"]');
    if (rows.length > 0) {
      const target = rows[0].querySelector('[style*="cursor:pointer"]');
      if (target) target.click();
    }
  });
  await page.waitForTimeout(2000);

  // 4) 验证主报告页 XSS 防护
  const reportPwned = await page.evaluate(() => ({
    list: window.__pwned_list,
    svg: window.__pwned_svg,
    script: window.__pwned_script,
    iframe: window.__pwned_iframe
  }));
  check('主报告页 XSS 防护: 无 payload 执行', reportPwned.list === 0 && reportPwned.svg === 0 && reportPwned.script === 0 && reportPwned.iframe === 0, JSON.stringify(reportPwned));

  // 5) 验证患者名在 DOM 中是转义文本, 不是 HTML 元素
  const nameRendered = await page.evaluate(() => {
    // 查找报告覆盖层中的姓名区域
    const ov = document.getElementById('cog-report-overlay');
    if (!ov) return null;
    // 查找 "姓名:" 后的 <b>
    const all = ov.querySelectorAll('b');
    for (const b of all) {
      if (b.parentElement && b.parentElement.textContent.startsWith('姓名:')) {
        return b.innerHTML;
      }
    }
    return null;
  });
  check('主报告页患者名是转义文本 (无 <img>/<script> 标签)', nameRendered != null && !nameRendered.includes('<img') && !nameRendered.includes('<script') && !nameRendered.includes('<svg'), `innerHTML=${nameRendered}`);

  check('无 console 错误', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await browser.close();

  const passed = RESULTS.filter(r => r.ok).length;
  const failed = RESULTS.filter(r => !r.ok);
  console.log('\n=== E2E XSS Protection ===');
  for (const r of RESULTS) {
    console.log((r.ok ? '✔' : '✖') + ' ' + r.name + (r.detail ? ' | ' + r.detail : ''));
  }
  console.log(`\n${passed}/${RESULTS.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error('XSS E2E failed:', e); process.exit(1); });
