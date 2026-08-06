// tests/reports/classify.test.js
// RED 阶段: 必失败的契约 — 认知/自评分类 + 云端元数据规范化 + 路径校验 + base64 解码
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getReportType,
  getReportTypeLabel,
  classifyByKind,
  normalizeCloudRecord,
  isDeletableCloudPath,
  decodeGhContent
} from '../../assets/cognitive/reports/classify.js';

describe('getReportType', () => {
  test('未提供 type → 归类为 cognitive (老记录兼容)', () => {
    assert.equal(getReportType({ id: 'cog_1', overallScore: 120 }), 'cognitive');
  });
  test('type=questionnaire → 归类为 questionnaire', () => {
    assert.equal(getReportType({ type: 'questionnaire', id: 'qnr_1' }), 'questionnaire');
  });
  test('type=cognitive (显式) → 归类为 cognitive', () => {
    assert.equal(getReportType({ type: 'cognitive', id: 'cog_2' }), 'cognitive');
  });
  test('null/undefined/非对象 → 不抛错, 默认 cognitive', () => {
    assert.equal(getReportType(null), 'cognitive');
    assert.equal(getReportType(undefined), 'cognitive');
    assert.equal(getReportType('xxx'), 'cognitive');
  });
  test('type 为其他值 (eg. "") → 仍归类为 cognitive (向后兼容)', () => {
    assert.equal(getReportType({ type: '' }), 'cognitive');
    assert.equal(getReportType({ type: null }), 'cognitive');
  });
});

describe('getReportTypeLabel', () => {
  test('认知显示 "认知报告"', () => {
    assert.equal(getReportTypeLabel({}), '认知报告');
  });
  test('自评显示 "神经系统自评报告"', () => {
    assert.equal(getReportTypeLabel({ type: 'questionnaire' }), '神经系统自评报告');
  });
});

describe('classifyByKind', () => {
  test('按 kind 切分为两组, 组内保持输入顺序 (caller 决定排序)', () => {
    const recs = [
      { id: 'c1', overallScore: 100 },
      { id: 'q1', type: 'questionnaire' },
      { id: 'c2', overallScore: 90 },
      { id: 'q2', type: 'questionnaire' }
    ];
    const grouped = classifyByKind(recs);
    assert.equal(grouped.cognitive.length, 2);
    assert.equal(grouped.questionnaire.length, 2);
    assert.deepEqual(grouped.cognitive.map(r => r.id), ['c1', 'c2']);
    assert.deepEqual(grouped.questionnaire.map(r => r.id), ['q1', 'q2']);
  });
  test('空数组/非数组 → 两组均为空', () => {
    const g1 = classifyByKind([]);
    assert.deepEqual(g1, { cognitive: [], questionnaire: [] });
    const g2 = classifyByKind(null);
    assert.deepEqual(g2, { cognitive: [], questionnaire: [] });
  });
});

describe('normalizeCloudRecord', () => {
  const file = { name: '2026-08-06_cog_abc.json', path: 'data/reports/th_x/2026-08-06_cog_abc.json', sha: 'sha123', url: 'https://api.github.com/repos/.../contents/...json', size: 1234 };
  test('保留真实 GitHub 路径与 SHA, 是删除 API 必需的元数据', () => {
    const out = normalizeCloudRecord({ id: 'cog_abc', date: '2026-08-06', time: '14:30', patientInfo: { name: '张三' }, overallScore: 120, isQuick6: true }, file);
    assert.equal(out._isCloud, true);
    assert.equal(out._cloudId, 'sha123');
    assert.equal(out._cloudPath, 'data/reports/th_x/2026-08-06_cog_abc.json');
    assert.equal(out._cloudFileName, '2026-08-06_cog_abc.json');
    assert.equal(out._cloudUrl, file.url);
    assert.equal(out.id, 'cog_abc');
    assert.equal(out.overallScore, 120);
  });
  test('缺失 patientInfo / overallScore 时不抛错, 缺省值安全', () => {
    const out = normalizeCloudRecord({}, file);
    assert.deepEqual(out.patientInfo, {});
    assert.equal(out.overallScore, undefined);
    assert.equal(out.isQuick6, false);
  });
  test('解码 base64 内容 → 保留 type/qnr 用于 questionnaire 分类', () => {
    const payload = JSON.stringify({ id: 'qnr_1', type: 'questionnaire', qnr: { percent: 47 } });
    const b64 = Buffer.from(payload, 'utf-8').toString('base64');
    const fileData = { content: b64 };
    const out = normalizeCloudRecord({ type: 'questionnaire', patientInfo: { name: '李四' } }, file, fileData);
    assert.equal(out.type, 'questionnaire');
    assert.equal(out.qnr.percent, 47);
  });
  test('createdAt 解析为 epoch ms 供排序', () => {
    const out = normalizeCloudRecord({ createdAt: '2026-08-06T06:30:00.000Z' }, file);
    assert.equal(out._cloudCreatedAt, Date.parse('2026-08-06T06:30:00.000Z'));
  });
});

describe('isDeletableCloudPath', () => {
  test('合法路径通过校验', () => {
    assert.equal(isDeletableCloudPath('data/reports/th_x/2026-08-06_cog_abc.json'), true);
    assert.equal(isDeletableCloudPath('data/reports/default/2026-08-06_qnr_xyz.json'), true);
  });
  test('包含 .. 越界路径拒绝', () => {
    assert.equal(isDeletableCloudPath('data/reports/../secret.json'), false);
    assert.equal(isDeletableCloudPath('../data/reports/x.json'), false);
  });
  test('不在 data/reports/ 下拒绝', () => {
    assert.equal(isDeletableCloudPath('other/x.json'), false);
    assert.equal(isDeletableCloudPath('data/x.json'), false);
    assert.equal(isDeletableCloudPath(''), false);
  });
  test('非 .json 后缀拒绝', () => {
    assert.equal(isDeletableCloudPath('data/reports/x.html'), false);
    assert.equal(isDeletableCloudPath('data/reports/x'), false);
  });
  test('非字符串/null/undefined 拒绝', () => {
    assert.equal(isDeletableCloudPath(null), false);
    assert.equal(isDeletableCloudPath(undefined), false);
    assert.equal(isDeletableCloudPath(123), false);
  });
});

describe('decodeGhContent', () => {
  test('UTF-8 中文+emoji base64 round-trip', () => {
    const json = JSON.stringify({ name: '测试🧠用户', score: 120 });
    const b64 = Buffer.from(json, 'utf-8').toString('base64');
    assert.deepEqual(decodeGhContent(b64), { name: '测试🧠用户', score: 120 });
  });
  test('空字符串/无效 base64 → 返回 null 不抛错', () => {
    assert.equal(decodeGhContent(''), null);
    assert.equal(decodeGhContent('not-base64!@#$%'), null);
  });
});
