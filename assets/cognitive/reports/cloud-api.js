// assets/cognitive/reports/cloud-api.js
// 云端 API 客户端 — 删除 GitHub Contents API 文件
// 设计: 依赖注入 (token, baseUrl, fetcher) 以便单测; 默认走 globalThis.fetch

import { isDeletableCloudPath } from './classify.js';

const DEFAULT_BASE = 'https://api.github.com/repos/fxs-84/brainmend/contents/';

/**
 * @typedef {object} DeleteResult
 * @property {boolean} ok
 * @property {string} [error]  错误码: no_token | missing_path | missing_sha | invalid_path | network_error | http_401 | http_403 | http_404 | http_409 | http_<n> | http_error
 * @property {boolean} [alreadyGone]  当 404 时为 true, 表示文件已不存在
 */

/**
 * 删除云端报告 (GitHub Contents API DELETE).
 * 严格的输入校验, 防止越界删除. 失败不抛错, 统一返回结构化结果.
 * @param {object} record  必须包含 _isCloud, _cloudPath, _cloudId
 * @param {{ token: string, baseUrl?: string, fetcher?: typeof fetch, ref?: string }} deps
 * @returns {Promise<DeleteResult>}
 */
export async function deleteCloudReport(record, deps) {
  const token = (deps && deps.token) || '';
  const baseUrl = (deps && deps.baseUrl) || DEFAULT_BASE;
  const ref = (deps && deps.ref) || 'main';
  const fetcher = (deps && deps.fetcher) || globalThis.fetch;

  if (!token) return { ok: false, error: 'no_token' };
  if (!record) return { ok: false, error: 'missing_path' };
  if (!record._cloudPath) return { ok: false, error: 'missing_path' };
  if (!record._cloudId) return { ok: false, error: 'missing_sha' };
  if (!isDeletableCloudPath(record._cloudPath)) return { ok: false, error: 'invalid_path' };

  // 修复 baseUrl + _cloudPath 重复拼接 bug:
  //   生产环境 baseUrl = 'https://api.github.com/.../contents/data/reports/'
  //   _cloudPath = 'data/reports/th_default/2026-08-06_xxx.json'
  //   直接拼接会得到 .../data/reports/data/reports/... (404)
  //   正确做法: 去掉 _cloudPath 的 'data/reports/' 前缀, 再用 baseUrl 拼接
  const basePath = 'data/reports/';
  const path = record._cloudPath.startsWith(basePath)
    ? record._cloudPath.slice(basePath.length)
    : record._cloudPath;
  const url = baseUrl + encodeURI(path).replace(/^\//, '') + '?ref=' + encodeURIComponent(ref);
  const patientName = (record.patientInfo && record.patientInfo.name) || '';
  const body = JSON.stringify({
    message: 'delete report: ' + (record.id || 'unknown') + (patientName ? ' (' + patientName + ')' : ''),
    sha: record._cloudId
  });
  const headers = {
    'Authorization': 'token ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json'
  };

  let res;
  try {
    res = await fetcher(url, { method: 'DELETE', headers, body });
  } catch (err) {
    return { ok: false, error: 'network_error' };
  }

  if (res.status === 404) {
    // 文件已不存在 — 视为幂等成功
    return { ok: true, alreadyGone: true };
  }
  if (res.status === 200 || res.status === 204) {
    return { ok: true };
  }
  return { ok: false, error: 'http_' + res.status };
}

/**
 * 错误码 → 用户可读的中文提示. 不返回 token 或完整 URL.
 * @param {any} result
 * @returns {string}
 */
export function cloudErrorText(result) {
  if (!result || typeof result !== 'object' || !result.error) {
    return '删除失败, 请稍后重试。';
  }
  const code = String(result.error);
  const map = {
    no_token: '未配置云端 Token, 请先在「云端记录」中保存 GitHub Token。',
    missing_path: '云端文件路径缺失, 无法删除 (可能为旧记录)。请刷新云端列表后重试。',
    missing_sha: '云端文件版本标识 (sha) 缺失, 无法安全删除。请刷新云端列表后重试。',
    invalid_path: '云端文件路径不合法, 已拒绝删除。',
    network_error: '网络无法连接 api.github.com, 请检查网络后重试。',
    http_401: 'Token 已失效 (HTTP 401), 请治疗师更新 GitHub Token。',
    http_403: 'Token 无仓库写入权限 (HTTP 403), 请检查 Token 权限。',
    http_404: '云端文件已不存在 (HTTP 404)。',
    http_409: '文件版本冲突 (HTTP 409), 请刷新云端列表后重试。',
    http_422: '删除参数无效 (HTTP 422), 请刷新云端列表后重试。'
  };
  if (map[code]) return map[code];
  if (/^http_\d+$/.test(code)) {
    return '云端操作失败 (' + code.slice(5) + '), 请稍后重试。';
  }
  return '删除失败, 请稍后重试。';
}
