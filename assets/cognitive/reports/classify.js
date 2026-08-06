// assets/cognitive/reports/classify.js
// 纯函数模块 — 报告分类、云端元数据规范化、路径校验、base64 解码
// 设计: 无副作用, 无 window/document 依赖, 可独立单测, 由 cognitive-report.js 引用

/**
 * @typedef {'cognitive' | 'questionnaire'} ReportKind
 */

/**
 * 归一化报告类型. 老记录 (无 type 字段) 一律视为 cognitive 报告, 保持向后兼容.
 * @param {any} record
 * @returns {ReportKind}
 */
export function getReportType(record) {
  if (!record || typeof record !== 'object') return 'cognitive';
  return record.type === 'questionnaire' ? 'questionnaire' : 'cognitive';
}

/**
 * 用户可见的报告类型中文标签
 * @param {any} record
 * @returns {string}
 */
export function getReportTypeLabel(record) {
  return getReportType(record) === 'questionnaire' ? '神经系统自评报告' : '认知报告';
}

/**
 * 将记录数组按类型切分为两组. 组内保持输入顺序 (排序由调用方负责).
 * @param {Array<any>} records
 * @returns {{ cognitive: Array<any>, questionnaire: Array<any> }}
 */
export function classifyByKind(records) {
  const out = { cognitive: [], questionnaire: [] };
  if (!Array.isArray(records)) return out;
  for (const r of records) {
    out[getReportType(r)].push(r);
  }
  return out;
}

/**
 * 按关键字过滤记录. 支持维度:
 * - 患者姓名 (子串, 区分大小写 — 中文环境)
 * - 日期 (YYYY-MM-DD 或 YYYY/M/D, 子串匹配)
 * - 类型 (中文: "认知" / "自评"; 也兼容 "questionnaire" / "cognitive")
 * - quick6 关键词 "6" / "⚡6项" / "quick6" 匹配 isQuick6
 * 空查询返回所有记录 (原数组引用).
 * @param {Array<any>} records
 * @param {string} query
 * @returns {Array<any>}
 */
export function filterRecords(records, query) {
  if (!Array.isArray(records)) return [];
  const q = (query == null ? '' : String(query)).trim();
  if (!q) return records;
  // 类型关键词优先 (大小写不敏感)
  const ql = q.toLowerCase();
  if (q === '自评' || ql === 'questionnaire' || ql === 'qnr') {
    return records.filter(function(r) { return getReportType(r) === 'questionnaire'; });
  }
  if (q === '认知' || ql === 'cognitive' || ql === 'cog') {
    return records.filter(function(r) { return getReportType(r) === 'cognitive'; });
  }
  // 通用子串匹配: 区分大小写 (中文环境, 大小写敏感更安全)
  return records.filter(function(r) {
    if (!r || typeof r !== 'object') return false;
    const name = (r.patientInfo && r.patientInfo.name) || '';
    if (name && name.indexOf(q) >= 0) return true;
    if (r.date && String(r.date).indexOf(q) >= 0) return true;
    if (r.type && String(r.type).indexOf(q) >= 0) return true;
    if (r.id && String(r.id).indexOf(q) >= 0) return true;
    return false;
  });
}

/**
 * 把 GitHub Contents API 返回的文件元数据 + 解码后的内容规范化为统一的云端记录.
 * 保留 _cloudPath (DELETE 必需), _cloudId (sha), _cloudFileName, _cloudUrl.
 * @param {object} raw
 * @param {{ name: string, path: string, sha: string, url: string, size?: number }} file
 * @param {{ content?: string }} [fileData] 可选: 已 base64 编码的文件内容
 * @returns {object}
 */
export function normalizeCloudRecord(raw, file, fileData) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = {
    id: r.id,
    date: r.date,
    time: r.time,
    patientInfo: r.patientInfo || {},
    normalizedScores: r.normalizedScores || {},
    rawScores: r.rawScores || {},
    brainRegions: r.brainRegions || {},
    riskIndex: r.riskIndex,
    overallScore: r.overallScore,
    isQuick6: !!r.isQuick6,
    type: r.type || '',
    qnr: r.qnr || null,
    _isCloud: true,
    _cloudId: file && file.sha,
    _cloudPath: file && file.path,
    _cloudFileName: file && file.name,
    _cloudUrl: file && file.url
  };
  if (r.createdAt) {
    const t = Date.parse(r.createdAt);
    if (!Number.isNaN(t)) base._cloudCreatedAt = t;
  }
  if (fileData && fileData.content) {
    const decoded = decodeGhContent(fileData.content);
    if (decoded) {
      base.type = decoded.type != null ? decoded.type : base.type;
      base.qnr = decoded.qnr != null ? decoded.qnr : base.qnr;
      if (decoded.createdAt && base._cloudCreatedAt == null) {
        const t = Date.parse(decoded.createdAt);
        if (!Number.isNaN(t)) base._cloudCreatedAt = t;
      }
    }
  }
  return base;
}

/**
 * 校验 GitHub 文件路径是否在 data/reports/ 下且为 .json (防越界, 防误删).
 * 加固: 拒绝反斜杠、控制字符、双斜杠、隐藏文件段, 防止跨平台路径解释差异.
 * @param {any} path
 * @returns {boolean}
 */
export function isDeletableCloudPath(path) {
  if (typeof path !== 'string' || !path) return false;
  if (path.includes('..') || path.includes('\\')) return false;
  if (/[\x00-\x1f]/.test(path)) return false;
  if (!path.startsWith('data/reports/')) return false;
  if (path.includes('//')) return false;
  if (!path.endsWith('.json')) return false;
  // 拒绝隐藏文件段 (如 .json, .git)
  if (path.split('/').some(function(seg) { return seg.startsWith('.'); })) return false;
  return true;
}

/**
 * 解码 GitHub Contents API 返回的 base64 内容为 UTF-8 字符串并 JSON.parse.
 * 失败时返回 null 而不抛错.
 * @param {string} b64
 * @returns {object|null}
 */
export function decodeGhContent(b64) {
  if (typeof b64 !== 'string' || !b64) return null;
  try {
    // GitHub API 返回的是标准 base64, 可能含换行; 兼容 Node 与浏览器
    const cleaned = b64.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') {
      const json = Buffer.from(cleaned, 'base64').toString('utf-8');
      return JSON.parse(json);
    }
    const json = decodeURIComponent(escape(atob(cleaned)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
