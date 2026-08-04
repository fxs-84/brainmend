/**
 * 神经系统状态自评（教育版）· 评分校验脚本(node 直跑,无浏览器依赖)
 *
 * 用法: node js/questionnaire/verify.mjs
 *
 * 用例(对照 kfblxt brain-region.ts 的 1/4 阈值规则):
 *   1. 全 0 分  → 16 区全部 normal,无高负担组,total = 0
 *   2. 全 4 分  → 16 区全部 severe,4 组全部高负担,total = 396
 *   3. 单区满分 → 仅枕叶(62-66)全 4,其余 0 → 仅 occipital severe
 *   附加: 阈值边界(恰好 1/4 = 轻度;差 1 分 = 正常)
 */

import {
  BRAIN_REGION_DEFS,
  BRAIN_REGION_ITEMS,
  REGION_GROUPS,
  BRAIN_REGION_MAX_TOTAL,
} from "./data.js";
import { scoreBrainRegion, regionMaxScore } from "./scoring.js";

let failures = 0;

function check(name, cond, extra = "") {
  const ok = Boolean(cond);
  console.log(`  ${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

function fillAnswers(fn) {
  const items = {};
  for (const item of BRAIN_REGION_ITEMS) {
    if (item.index === 46) continue;
    items[item.index] = fn(item.index);
  }
  return { items, phoneEar: "no_preference" };
}

function burdenGroups(result) {
  return REGION_GROUPS.filter((g) =>
    g.regionIds.some((id) => result.severityByRegion[id] !== "normal")
  ).map((g) => g.label);
}

// ---------- 用例 1: 全 0 分 ----------
console.log("\n【用例 1】全 0 分(从无症状)");
{
  const r = scoreBrainRegion(fillAnswers(() => 0));
  check("total = 0", r.total === 0, `total=${r.total}`);
  check("percent = 0", r.percent === 0, `percent=${r.percent}`);
  check("16 区全部 normal", BRAIN_REGION_DEFS.every((d) => r.severityByRegion[d.id] === "normal"));
  check("affectedRegions 为空", r.affectedRegions.length === 0);
  check("高负担组为空", burdenGroups(r).length === 0, `groups=[${burdenGroups(r)}]`);
}

// ---------- 用例 2: 全 4 分 ----------
console.log("\n【用例 2】全 4 分(总是有症状)");
{
  const r = scoreBrainRegion(fillAnswers(() => 4));
  check(`total = ${BRAIN_REGION_MAX_TOTAL}(396)`, r.total === BRAIN_REGION_MAX_TOTAL, `total=${r.total}`);
  check("percent = 100", r.percent === 100, `percent=${r.percent}`);
  check("16 区全部 severe", BRAIN_REGION_DEFS.every((d) => r.severityByRegion[d.id] === "severe"));
  check("affectedRegions = 16", r.affectedRegions.length === 16);
  check("4 组全部高负担", burdenGroups(r).length === 4, `groups=[${burdenGroups(r)}]`);
  // 分区满分抽验:前额叶 17 题 × 4 = 68
  const prefrontal = BRAIN_REGION_DEFS.find((d) => d.id === "prefrontal");
  check("前额叶小计 = 68", r.byRegion.prefrontal === 68, `=${r.byRegion.prefrontal}, max=${regionMaxScore(prefrontal)}`);
}

// ---------- 用例 3: 单区满分(枕叶 62-66 全 4,其余 0) ----------
console.log("\n【用例 3】单区满分(仅枕叶全 4)");
{
  const r = scoreBrainRegion(fillAnswers((i) => (i >= 62 && i <= 66 ? 4 : 0)));
  check("total = 20(5 题 × 4)", r.total === 20, `total=${r.total}`);
  check("occipital = severe", r.severityByRegion.occipital === "severe");
  check(
    "其余 15 区全部 normal",
    BRAIN_REGION_DEFS.every((d) => d.id === "occipital" || r.severityByRegion[d.id] === "normal")
  );
  check("affectedRegions = [occipital]", r.affectedRegions.length === 1 && r.affectedRegions[0] === "occipital");
  check("高负担组 = [高级功能]", burdenGroups(r).join() === "高级功能", `groups=[${burdenGroups(r)}]`);
}

// ---------- 附加: 阈值边界(副交感 5 题,满分 20;1/4 = 5 分) ----------
console.log("\n【附加】1/4 阈值边界(副交感区: 满分 20,阈值 5 分)");
{
  // 恰好 5 分(ratio = 0.25) → mild(≥1/4 即轻度)
  const at = scoreBrainRegion(fillAnswers((i) => (i === 90 ? 4 : i === 91 ? 1 : 0)));
  check("小计 5 / 20 = 恰好 1/4 → mild", at.severityByRegion.parasympathetic === "mild", `score=${at.byRegion.parasympathetic}`);
  check("恰好 1/4 计入高负担", at.affectedRegions.includes("parasympathetic"));

  // 4 分(ratio = 0.2) → normal
  const below = scoreBrainRegion(fillAnswers((i) => (i === 90 ? 4 : 0)));
  check("小计 4 / 20 < 1/4 → normal", below.severityByRegion.parasympathetic === "normal", `score=${below.byRegion.parasympathetic}`);
  check("不足 1/4 不计高负担", !below.affectedRegions.includes("parasympathetic"));

  // 10 分(ratio = 0.5) → moderate;15 分(ratio = 0.75) → severe
  const half = scoreBrainRegion(fillAnswers((i) => (i >= 90 && i <= 91 ? 4 : i === 92 ? 2 : 0)));
  check("小计 10 / 20 = 1/2 → moderate", half.severityByRegion.parasympathetic === "moderate", `score=${half.byRegion.parasympathetic}`);
  const threeQ = scoreBrainRegion(fillAnswers((i) => (i >= 90 && i <= 92 ? 4 : i === 93 ? 3 : 0)));
  check("小计 15 / 20 = 3/4 → severe", threeQ.severityByRegion.parasympathetic === "severe", `score=${threeQ.byRegion.parasympathetic}`);
}

console.log(failures === 0 ? "\n✅ 全部校验通过" : `\n❌ ${failures} 项校验失败`);
process.exit(failures === 0 ? 0 : 1);
