// js/questionnaire/probe-pdf-export.mjs
// 神经系统自评 · PDF 导出算法冒烟测试 (Node 端, 无浏览器依赖)
//
// 目的: 验证 PDF 分页算法的数学正确性
//   1. 单页: imgH ≤ pageH → 1 页
//   2. 多页: imgH > pageH → ceil(imgH/pageH) 页
//   3. 文件名清洗: 替换非法字符
//   4. 安全文件名: Windows/Linux 都可用

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('  ✅', name, extra || ''); pass++; }
  else { console.log('  ❌', name, extra || ''); fail++; }
}

// ============== 测试 1: 单页场景 ==============
console.log('\n【测试 1】单页 PDF (imgH ≤ pageH)');
const pdfW = 210, pdfH = 297, margin = 10;
const pageH = pdfH - margin * 2;  // 277mm
const imgH1 = 200;  // < 277
const pages1 = imgH1 <= pageH ? 1 : Math.ceil(imgH1 / pageH);
assert('1 页 PDF', pages1 === 1, `pages=${pages1}`);

// ============== 测试 2: 双页场景 ==============
console.log('\n【测试 2】双页 PDF (imgH 略大于 pageH)');
const imgH2 = 300;  // > 277
const pages2 = imgH2 <= pageH ? 1 : Math.ceil(imgH2 / pageH);
assert('2 页 PDF', pages2 === 2, `pages=${pages2}`);

// ============== 测试 3: 多页场景 ==============
console.log('\n【测试 3】多页 PDF (imgH 是 pageH 的 4 倍)');
const imgH3 = 277 * 4 + 50;  // 1158
const pages3 = imgH3 <= pageH ? 1 : Math.ceil(imgH3 / pageH);
assert('5 页 PDF', pages3 === 5, `pages=${pages3}`);

// ============== 测试 4: 文件名清洗 ==============
console.log('\n【测试 4】文件名清洗 (Windows 非法字符)');
function safeName(name) {
  return String(name || '未知').replace(/[\\/:*?"<>|]/g, '_');
}
assert('张三 (无非法字符)', safeName('张三') === '张三', `"${safeName('张三')}"`);
assert('A/B (反斜杠 → 下划线)', safeName('A/B') === 'A_B', `"${safeName('A/B')}"`);
assert('A:B (冒号 → 下划线)', safeName('A:B') === 'A_B', `"${safeName('A:B')}"`);
assert('A*B (星号 → 下划线)', safeName('A*B') === 'A_B', `"${safeName('A*B')}"`);
assert('空字符串 → 未知', safeName('') === '未知');
assert('null → 未知', safeName(null) === '未知');

// ============== 测试 5: 日期清洗 (防止 URL/saveAs 出错) ==============
console.log('\n【测试 5】日期清洗');
function safeDate(d) { return String(d || 'unknown').replace(/\//g, '-'); }
assert('2026-08-06 (无斜杠)', safeDate('2026-08-06') === '2026-08-06');
assert('2026/8/5 → 2026-8-5', safeDate('2026/8/5') === '2026-8-5');
assert('undefined → unknown', safeDate(undefined) === 'unknown');

// ============== 测试 6: 文件名最终拼接 ==============
console.log('\n【测试 6】最终文件名拼接');
function makeFileName(rec) {
  const name = safeName(rec.patientInfo?.name);
  const date = safeDate(rec.date);
  return `神经系统自评报告_${name}_${date}.pdf`;
}
const fn1 = makeFileName({ patientInfo: { name: '张三' }, date: '2026-08-06' });
assert('标准文件名', fn1 === '神经系统自评报告_张三_2026-08-06.pdf', `"${fn1}"`);
const fn2 = makeFileName({ patientInfo: { name: '李/四' }, date: '2026/8/6' });
assert('含非法字符的文件名', fn2 === '神经系统自评报告_李_四_2026-8-6.pdf', `"${fn2}"`);
const fn3 = makeFileName({});
assert('空记录 → 未知_日期_unknown', fn3 === '神经系统自评报告_未知_unknown.pdf', `"${fn3}"`);

// ============== 测试 7: canvas → PDF 尺寸换算 ==============
console.log('\n【测试 7】canvas → PDF 尺寸换算');
function calcImgH(canvasH, canvasW, targetW) {
  return (canvasH * targetW) / canvasW;
}
const h1 = calcImgH(1000, 794, 190);  // 794px wrap → 190mm → 等比缩放
assert('1000x794 → 190mm 高 239mm', Math.round(h1) === 239, `actual=${Math.round(h1)}`);

console.log('\n' + '═'.repeat(50));
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (fail > 0) process.exit(1);
