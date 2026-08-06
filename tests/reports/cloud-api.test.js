// tests/reports/cloud-api.test.js
// GREEN 阶段验证: 云端删除 API 与错误映射
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, restoreFetch, makeResponse } from '../setup/http-mock.mjs';
import { deleteCloudReport, cloudErrorText } from '../../assets/cognitive/reports/cloud-api.js';

const originalFetch = globalThis.fetch;
const TOKEN = 'ghp_test_token_xxx';
const BASE = 'https://api.github.com/repos/fxs-84/brainmend/contents/';
const CLOUD_REC = {
  _isCloud: true,
  _cloudId: 'sha_abc',
  _cloudPath: 'data/reports/th_x/2026-08-06_cog_abc.json',
  id: 'cog_abc',
  patientInfo: { name: '张三' }
};

afterEach(() => { restoreFetch(originalFetch); });

describe('deleteCloudReport', () => {
  test('成功删除 → 调用 DELETE 方法, URL 使用 _cloudPath, body 含 sha 与 message', async () => {
    // 测试用 baseUrl 末尾为 /contents/ (不含 data/reports/), 模拟 _cloudPath 完整路径
    const testBase = 'https://api.github.com/repos/fxs-84/brainmend/contents/';
    const testRec = {
      _isCloud: true,
      _cloudId: 'sha_abc',
      _cloudPath: 'data/reports/th_x/2026-08-06_cog_abc.json',  // 完整路径
      id: 'cog_abc',
      patientInfo: { name: '张三' }
    };
    const calls = mockFetch([
      [/contents\/th_x\/2026-08-06_cog_abc\.json/, makeResponse(200, { content: { sha: 'new_sha' } })]
    ]);
    const res = await deleteCloudReport(testRec, { token: TOKEN, baseUrl: testBase });
    assert.equal(res.ok, true);
    const [req] = calls();
    assert.equal(req.init.method, 'DELETE');
    assert.match(req.url, /contents\/th_x\/2026-08-06_cog_abc\.json/);
    assert.match(req.url, /ref=main/);
    assert.equal(req.init.headers.Authorization, 'token ' + TOKEN);
    const body = JSON.parse(req.init.body);
    assert.equal(body.sha, 'sha_abc');
    assert.match(body.message, /delete report/);
    assert.match(body.message, /张三/);
  });

  test('修复 baseUrl/_cloudPath 重复拼接 bug: 生产 baseUrl 含 data/reports/ 时不重复', async () => {
    // 模拟生产环境: baseUrl 末尾是 /contents/data/reports/, _cloudPath 也以 data/reports/ 开头
    const prodBase = 'https://api.github.com/repos/fxs-84/brainmend/contents/data/reports/';
    const prodRec = {
      _isCloud: true,
      _cloudId: 'sha_prod',
      _cloudPath: 'data/reports/th_default/2026-08-06_test_delete_001.json',
      id: 'test_delete_001',
      patientInfo: { name: '测试' }
    };
    const calls = mockFetch([
      [/contents\/data\/reports\/th_default\/2026-08-06_test_delete_001\.json/, makeResponse(200, { content: { sha: 'new' } })]
    ]);
    const res = await deleteCloudReport(prodRec, { token: TOKEN, baseUrl: prodBase });
    assert.equal(res.ok, true);
    const [req] = calls();
    // 关键断言: URL 不能有 data/reports/ 重复
    const matchCount = (req.url.match(/data\/reports\//g) || []).length;
    assert.equal(matchCount, 1, 'URL 中 data/reports/ 只应出现 1 次, 实际: ' + matchCount + ', URL: ' + req.url);
    assert.match(req.url, /contents\/data\/reports\/th_default\/2026-08-06_test_delete_001\.json/);
  });

  test('缺少 token → 返回 {ok:false, error:"no_token"}, 不发请求', async () => {
    const calls = mockFetch([]);
    const res = await deleteCloudReport(CLOUD_REC, { token: '', baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'no_token');
    assert.equal(calls().length, 0);
  });

  test('缺少 _cloudPath → 返回 {ok:false, error:"missing_path"}, 不发请求', async () => {
    const calls = mockFetch([]);
    const rec = { _isCloud: true, _cloudId: 'sha' };
    const res = await deleteCloudReport(rec, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'missing_path');
    assert.equal(calls().length, 0);
  });

  test('缺少 _cloudId (sha) → 返回 {ok:false, error:"missing_sha"}, 不发请求', async () => {
    const calls = mockFetch([]);
    const rec = { _isCloud: true, _cloudPath: 'data/reports/th_x/x.json' };
    const res = await deleteCloudReport(rec, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'missing_sha');
    assert.equal(calls().length, 0);
  });

  test('路径越界 (含 ..) → 返回 {ok:false, error:"invalid_path"}, 不发请求', async () => {
    const calls = mockFetch([]);
    const rec = { _isCloud: true, _cloudId: 'sha', _cloudPath: 'data/reports/../secret.json' };
    const res = await deleteCloudReport(rec, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'invalid_path');
    assert.equal(calls().length, 0);
  });

  test('HTTP 401 → {ok:false, error:"http_401"}', async () => {
    mockFetch([[/contents\//, makeResponse(401, { message: 'Bad credentials' })]]);
    const res = await deleteCloudReport(CLOUD_REC, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'http_401');
  });

  test('HTTP 403 → {ok:false, error:"http_403"}', async () => {
    mockFetch([[/contents\//, makeResponse(403, { message: 'Resource not accessible' })]]);
    const res = await deleteCloudReport(CLOUD_REC, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'http_403');
  });

  test('HTTP 404 → 视为已删除, {ok:true, alreadyGone:true}', async () => {
    mockFetch([[/contents\//, makeResponse(404, { message: 'Not Found' })]]);
    const res = await deleteCloudReport(CLOUD_REC, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, true);
    assert.equal(res.alreadyGone, true);
  });

  test('HTTP 409 → {ok:false, error:"http_409"} (要求刷新重试)', async () => {
    mockFetch([[/contents\//, makeResponse(409, { message: 'Conflict' })]]);
    const res = await deleteCloudReport(CLOUD_REC, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'http_409');
  });

  test('网络错误 → {ok:false, error:"network_error"}', async () => {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const res = await deleteCloudReport(CLOUD_REC, { token: TOKEN, baseUrl: BASE });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'network_error');
  });
});

describe('cloudErrorText', () => {
  test('错误码 → 用户可读中文', () => {
    assert.match(cloudErrorText({ error: 'no_token' }), /Token/);
    assert.match(cloudErrorText({ error: 'http_401' }), /401/);
    assert.match(cloudErrorText({ error: 'http_403' }), /403/);
    assert.match(cloudErrorText({ error: 'http_404' }), /404/);
    assert.match(cloudErrorText({ error: 'http_409' }), /冲突/);
    assert.match(cloudErrorText({ error: 'network_error' }), /网络/);
    assert.match(cloudErrorText({ error: 'invalid_path' }), /路径/);
  });
  test('未知错误 → 通用提示', () => {
    assert.match(cloudErrorText({ error: 'mystery' }), /失败/);
  });
  test('非对象 → 通用提示', () => {
    assert.match(cloudErrorText(null), /失败/);
    assert.match(cloudErrorText('string'), /失败/);
  });
});
