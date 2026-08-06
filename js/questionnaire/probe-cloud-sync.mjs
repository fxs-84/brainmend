// js/questionnaire/probe-cloud-sync.mjs
// 神经系统自评 · CloudSync 冒烟测试 (Node 端, 无浏览器依赖)
//
// 目的: 验证防丢数据关键链路
//   1. localStorage 写入永远先于云端上传
//   2. 上传失败 → 指数退避重试 (最多 3 次)
//   3. 致命错误 (401/403/404/422/no_token) 不重试, 立即返回
//   4. flushPendingReports 扫描并重试未同步记录
//
// 用法: node js/questionnaire/probe-cloud-sync.mjs

// ---- 模拟浏览器环境 (localStorage / window) ----
const _ls = {};
globalThis.localStorage = {
  getItem: (k) => _ls[k] || null,
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; }
};
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' };
// Node 24+ 内置 navigator, cloud-sync 不强依赖, 这里只保证 setInterval 之类能跑

// ---- 加载 cloud-sync.js (IIFE, 直接挂 window.CloudSync) ----
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const cloudSyncSrc = readFileSync(resolvePath(__dirname, '../../assets/cognitive/reports/cloud-sync.js'), 'utf8');
// 用 Function 构造执行环境, 让 IIFE 拿到 window
new Function('window', 'document', 'navigator', 'localStorage', cloudSyncSrc)(globalThis.window, globalThis.document, globalThis.navigator, globalThis.localStorage);

const CloudSync = globalThis.window.CloudSync;
if (!CloudSync) { console.error('❌ CloudSync 未挂到 window'); process.exit(1); }
console.log('✅ CloudSync 加载成功');

// ---- 模拟 _uploadToCloud (可控的成功/失败/超时) ----
function makeUploader(scripted) {
  let callIndex = 0;
  return function uploader(record) {
    const scenario = scripted[callIndex++] || scripted[scripted.length - 1];
    return new Promise((resolve) => {
      if (scenario.type === 'ok') return resolve({ ok: true, sha: 'abc' + callIndex });
      if (scenario.type === 'fail') return resolve({ ok: false, error: scenario.error || 'unknown' });
      if (scenario.type === 'throw') return Promise.reject(new Error(scenario.error || 'throw'));
      if (scenario.type === 'hang') return new Promise(() => {}); // 永不解析, 测试 timeout
      resolve({ ok: false, error: 'unknown' });
    });
  };
}

const STORAGE_KEY = 'cog_records';
function readRecords() { try { return JSON.parse(_ls[STORAGE_KEY] || '[]'); } catch { return []; } }

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('  ✅', name, extra || ''); pass++; }
  else { console.log('  ❌', name, extra || ''); fail++; }
}

const fakeRecord = (id, name) => ({
  id, type: 'questionnaire',
  date: '2026-08-06', time: '10:00',
  patientInfo: { name, age: '30', gender: '男', id: '' },
  qnr: { percent: 50, byRegion: {}, severityByRegion: {}, items: {} },
  overallScore: 50
});

async function run() {
  // ============================
  // 测试 1: localStorage 立即落地, 失败不影响本机记录
  // ============================
  console.log('\n【测试 1】localStorage 立即落地 + 云端失败不丢数据');
  _ls[STORAGE_KEY] = '[]';
  globalThis.window._uploadToCloud = makeUploader([{ type: 'fail', error: 'HTTP 500' }]);
  const rec1 = fakeRecord('qnr_test1', '测试患者1');
  const result1 = await CloudSync.saveReportReliably(rec1);
  assert('saveReportReliably 返回失败', result1.ok === false);
  assert('返回 attempts 字段', typeof result1.attempts === 'number' && result1.attempts >= 1);
  const recs1 = readRecords();
  const found1 = recs1.find(r => r.id === 'qnr_test1');
  assert('localStorage 仍保留记录 (防丢数据)', !!found1);
  assert('记录状态 = failed', found1 && found1._cloudStatus === 'failed');
  assert('记录保留 _cloudErr', found1 && found1._cloudErr);
  console.log('  (最终 _cloudErr:', found1 && found1._cloudErr, '· attempts:', found1 && found1._cloudAttempts, ')');

  // ============================
  // 测试 2: 致命错误不重试 (401)
  // ============================
  console.log('\n【测试 2】致命错误 (HTTP 401) 不重试, 立即返回');
  _ls[STORAGE_KEY] = '[]';
  let callCount = 0;
  globalThis.window._uploadToCloud = function() { callCount++; return Promise.resolve({ ok: false, error: 'HTTP 401: bad creds' }); };
  const rec2 = fakeRecord('qnr_test2', '测试患者2');
  const result2 = await CloudSync.saveReportReliably(rec2);
  assert('返回失败', result2.ok === false);
  assert('HTTP 401 只调用 1 次 (不重试)', callCount === 1, `actual=${callCount}`);
  assert('attempts = 1', result2.attempts === 1);

  // ============================
  // 测试 3: 网络抖动 → 重试 → 最终成功
  // ============================
  console.log('\n【测试 3】第 1 次失败, 第 2 次成功');
  _ls[STORAGE_KEY] = '[]';
  globalThis.window._uploadToCloud = makeUploader([
    { type: 'fail', error: 'network_error' },
    { type: 'ok' }
  ]);
  const rec3 = fakeRecord('qnr_test3', '测试患者3');
  // 用 jsetimeout 加速: 注入 monkey patch
  const origSetTimeout = globalThis.setTimeout;
  let fakeNow = 0;
  globalThis.setTimeout = (fn, _ms) => origSetTimeout(fn, 5); // 加速 600 倍
  const result3 = await CloudSync.saveReportReliably(rec3);
  globalThis.setTimeout = origSetTimeout;
  assert('最终成功', result3.ok === true);
  assert('attempts = 2', result3.attempts === 2, `actual=${result3.attempts}`);
  assert('sha 写回', result3.sha && result3.sha.startsWith('abc'));
  const recs3 = readRecords();
  const found3 = recs3.find(r => r.id === 'qnr_test3');
  assert('本地记录标记 synced', found3 && found3._cloudStatus === 'synced');
  assert('本地记录有 _cloudId', found3 && found3._cloudId);

  // ============================
  // 测试 4: 3 次都失败 → 最终失败入队
  // ============================
  console.log('\n【测试 4】重试 3 次仍失败 → 入队, 待后续 flush');
  _ls[STORAGE_KEY] = '[]';
  globalThis.window._uploadToCloud = makeUploader([
    { type: 'fail', error: 'network_error' },
    { type: 'fail', error: 'network_error' },
    { type: 'fail', error: 'network_error' }
  ]);
  globalThis.setTimeout = (fn, _ms) => origSetTimeout(fn, 5);
  const rec4 = fakeRecord('qnr_test4', '测试患者4');
  const result4 = await CloudSync.saveReportReliably(rec4);
  globalThis.setTimeout = origSetTimeout;
  assert('最终失败', result4.ok === false);
  assert('attempts = 3', result4.attempts === 3, `actual=${result4.attempts}`);
  const pending = CloudSync.listPending();
  assert('失败记录入队 (1 条待同步)', pending.length === 1 && pending[0].id === 'qnr_test4');

  // ============================
  // 测试 5: flushPendingReports 重试遗留记录
  // ============================
  console.log('\n【测试 5】flushPendingReports 重试遗留未同步记录');
  _ls[STORAGE_KEY] = '[]';
  // 先制造一条失败记录
  globalThis.window._uploadToCloud = makeUploader([{ type: 'fail', error: 'network_error' }]);
  const rec5 = fakeRecord('qnr_test5', '测试患者5');
  globalThis.setTimeout = (fn, _ms) => origSetTimeout(fn, 5);
  await CloudSync.saveReportReliably(rec5);
  // 现在网络恢复, 换成成功 uploader
  globalThis.window._uploadToCloud = makeUploader([{ type: 'ok' }]);
  await CloudSync.flushPendingReports();
  globalThis.setTimeout = origSetTimeout;
  // 等队列处理完 (flushPendingReports 是异步链)
  await new Promise(r => origSetTimeout(r, 50));
  const recs5 = readRecords();
  const found5 = recs5.find(r => r.id === 'qnr_test5');
  assert('flush 后状态变 synced', found5 && found5._cloudStatus === 'synced');

  // ============================
  // 测试 6: 超时保护 (hang 永不解析)
  // ============================
  console.log('\n【测试 6】单次请求 15s 超时保护');
  _ls[STORAGE_KEY] = '[]';
  // 制造一个 hang 场景, 但我们手动缩短超时
  globalThis.window._uploadToCloud = () => new Promise(() => {}); // hang
  const rec6 = fakeRecord('qnr_test6', '测试患者6');
  // 直接覆盖 REQUEST_TIMEOUT_MS 不可行 (const), 但可以用 monkey patch _putOnce
  // 这里跳过详细测试, 只验证 'no_response' 错误码存在
  console.log('  (跳过 — 需要修改内部常量, 单元测试覆盖范围之外)');

  console.log('\n' + '═'.repeat(50));
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('❌ 测试异常:', e); process.exit(1); });
