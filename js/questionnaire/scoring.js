/**
 * 神经系统状态自评（教育版）· 评分模块
 *
 * 评分规则原样移植自 kfblxt 项目 brain-region.ts:
 *  - 第 46 题不计入总分(单选偏好侧,独立展示)
 *  - 按模块(分区)判定:分区小计 ≥ 分区满分 1/4 即"有负担"(轻度及以上)
 *  - 严重度: <1/4 正常, [1/4,1/2) 轻度, [1/2,3/4) 中度, ≥3/4 重度
 *  - 全表总分/百分比仅作参考,不作判定依据
 */

import {
  BRAIN_REGION_DEFS,
  BRAIN_REGION_ITEMS,
  BRAIN_REGION_MIN_ITEM,
  BRAIN_REGION_MAX_ITEM,
  BRAIN_REGION_MAX_TOTAL,
  AFFECTED_THRESHOLD,
  MILD_THRESHOLD,
  MODERATE_THRESHOLD,
  SEVERE_THRESHOLD,
} from "./data.js";

/** 给定模块小计+满分,返回严重度分级 */
export function classifyRegionSeverity(score, max) {
  if (max <= 0) return "normal";
  const ratio = score / max;
  if (ratio >= SEVERE_THRESHOLD) return "severe";
  if (ratio >= MODERATE_THRESHOLD) return "moderate";
  if (ratio >= MILD_THRESHOLD) return "mild";
  return "normal";
}

/** 给定题号,定位所属分区 */
export function findRegionForItem(index) {
  for (const def of BRAIN_REGION_DEFS) {
    if (index >= def.range[0] && index <= def.range[1]) return def;
  }
  return null;
}

/** 给定区间,计算实际可评分题目数(排除第 46 题) */
export function scorableItemCountForRange(range) {
  let count = 0;
  for (const item of BRAIN_REGION_ITEMS) {
    if (item.index === 46) continue;
    if (item.index >= range[0] && item.index <= range[1]) count++;
  }
  return count;
}

/** 分区满分(可评分题数 × 4) */
export function regionMaxScore(def) {
  return scorableItemCountForRange(def.range) * BRAIN_REGION_MAX_ITEM;
}

/**
 * 计算分数。
 * @param {{ items: Record<number, number>, phoneEar: string|null }} responses
 */
export function scoreBrainRegion(responses) {
  const items = responses.items;
  const byRegion = {};
  const severityByRegion = {};
  for (const def of BRAIN_REGION_DEFS) {
    byRegion[def.id] = 0;
    severityByRegion[def.id] = "normal";
  }

  for (const item of BRAIN_REGION_ITEMS) {
    const raw = items[item.index];
    if (raw === undefined) continue;
    if (!Number.isInteger(raw)) {
      throw new Error(`第 ${item.index} 题分值必须是整数,收到 ${raw}`);
    }
    if (raw < BRAIN_REGION_MIN_ITEM || raw > BRAIN_REGION_MAX_ITEM) {
      throw new Error(`第 ${item.index} 题分值必须在 0-4 之间,收到 ${raw}`);
    }
    // 第 46 题不进总分
    if (item.index === 46) continue;
    const def = findRegionForItem(item.index);
    if (!def) continue;
    byRegion[def.id] += raw;
  }

  const total = Object.values(byRegion).reduce((s, v) => s + v, 0);
  const percent = Math.round((total / BRAIN_REGION_MAX_TOTAL) * 1000) / 10;

  // 按模块判定:每个分区独立计算小计 / 满分,达 1/4 即"有问题"
  const affectedRegions = [];
  for (const def of BRAIN_REGION_DEFS) {
    const max = regionMaxScore(def);
    if (max <= 0) continue;
    const severity = classifyRegionSeverity(byRegion[def.id], max);
    severityByRegion[def.id] = severity;
    if (byRegion[def.id] / max >= AFFECTED_THRESHOLD) {
      affectedRegions.push(def.id);
    }
  }

  return { byRegion, total, percent, affectedRegions, severityByRegion };
}

// 暴露到 window 供 index.html 的 _qnrLoadScoring 按需加载 (普通 script 场景)
// 注意: 此处依赖 data.js 先加载 (data.js 同样暴露 __data)
try {
  window.__qnrScoring = {
    scoreBrainRegion,
    classifyRegionSeverity,
    findRegionForItem,
    scorableItemCountForRange,
    regionMaxScore,
    __data: window.__qnrData || null
  };
} catch (e) { /* 非浏览器环境忽略 */ }
