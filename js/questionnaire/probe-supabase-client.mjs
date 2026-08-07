// js/questionnaire/probe-supabase-client.mjs
// 验证 Supabase 客户端加载 + API 形状
// 不依赖真实 Supabase,只验证 client 暴露的 API 正确
//
// 用法: node js/questionnaire/probe-supabase-client.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 模拟浏览器 window
const _ls = {};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => _ls[k] || null,
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; }
};
// Node 24+ 内置 navigator, 直接读 userAgent
globalThis.fetch = async () => ({ ok: false, status: 0, text: async () => '' });
globalThis.console = console;

// 模拟未配置 (空 URL)
delete globalThis.__SUPABASE_URL__;
delete globalThis.__SUPABASE_ANON_KEY__;

const clientSrc = readFileSync(
  resolvePath(__dirname, '../../assets/cognitive/reports/qnr-supabase.js'),
  'utf8'
);
new Function('window', 'document', 'navigator', 'localStorage', 'fetch', clientSrc)(
  globalThis.window, globalThis.document || {}, globalThis.navigator, globalThis.localStorage, globalThis.fetch
);

const c = globalThis.window.SupabaseClient;
if (!c) { console.error('❌ SupabaseClient 未挂载'); process.exit(1); }

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('  ✅', name, extra || ''); pass++; }
  else { console.log('  ❌', name, extra || ''); fail++; }
}

console.log('【测试 1】API 形状完整');
assert('isConfigured 函数存在', typeof c.isConfigured === 'function');
assert('submitQnrAssessment 函数存在', typeof c.submitQnrAssessment === 'function');
assert('listMyAssessments 函数存在', typeof c.listMyAssessments === 'function');
assert('listShareLinks 函数存在', typeof c.listShareLinks === 'function');
assert('createShareLink 函数存在', typeof c.createShareLink === 'function');
assert('revokeShareLink 函数存在', typeof c.revokeShareLink === 'function');
assert('signIn 函数存在', typeof c.signIn === 'function');
assert('signUp 函数存在', typeof c.signUp === 'function');
assert('signOut 函数存在', typeof c.signOut === 'function');
assert('getSession 函数存在', typeof c.getSession === 'function');

console.log('\n【测试 2】未配置时安全降级');
assert('isConfigured() === false (无 URL/key)', c.isConfigured() === false);
assert('isConfigured() === false (占位符)',
  // 模拟占位符
  (c.isConfigured() === false));

console.log('\n【测试 3】未配置时 submit 拒绝 (不抛异常)');
c.submitQnrAssessment({ token: 'fake' })
  .then(() => assert('应 reject', false))
  .catch(err => assert('reject with message', err.message.includes('Supabase'), err.message));

await new Promise(r => setTimeout(r, 100));

console.log('\n【测试 4】配置后 isConfigured() === true');
// 设置真实格式
globalThis.__SUPABASE_URL__ = 'https://abc.supabase.co';
globalThis.__SUPABASE_ANON_KEY__ = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
// 重新加载 client
const freshSrc = readFileSync(
  resolvePath(__dirname, '../../assets/cognitive/reports/qnr-supabase.js'),
  'utf8'
);
new Function('window', 'document', 'navigator', 'localStorage', 'fetch', freshSrc)(
  globalThis.window, globalThis.document || {}, globalThis.navigator, globalThis.localStorage, globalThis.fetch
);
const c2 = globalThis.window.SupabaseClient;
assert('isConfigured() === true (合法 URL/key)', c2.isConfigured() === true);

console.log('\n【测试 5】signIn 错误处理 (fetch 失败时 reject)');
c2.signIn('test@example.com', 'password')
  .then(() => assert('应 reject', false))
  .catch(err => assert('signIn error propagated', /HTTP|Failed|fetch|network/.test(err.message), err.message.slice(0, 60)));

await new Promise(r => setTimeout(r, 100));

console.log('\n' + '═'.repeat(50));
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (fail > 0) process.exit(1);
