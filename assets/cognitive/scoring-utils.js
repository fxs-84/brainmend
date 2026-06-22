// 认知模块评分工具层 — Phase 1
// 作用：补强既有 normalizeScore 的两个维度
//   - 完成率系数 (5 个 A 类模块: att/flex/lang/reasoning/observation)
//   - 步数效率   (1 个 D 类模块: planning)
//
// 真源 (不重写):
//   cognitive-report.js L78-127 normalizeScore (4 类公式, 5-150 区间)
//   cognitive-report.js L30-43 BRAIN_WEIGHTS   (12 模块 × 10 脑区)
//
// 数据流:
//   各模块 (cognitive-*.js) → window._cogScoreLog[modId] (index.html:914)
//     → normalizeScore → scores → BRAIN_WEIGHTS → 报告
//
// 接入位置:
//   1. index.html _saveCogScore map 增加 completionRate / stepEfficiency 字段
//   2. 各模块 endGame/tick 超时/通关 时调用 compute* 函数存到 window.__xxx
//   3. cognitive-report.js normalizeScore A 类用 raw.completionRate
//                                D 类用 raw.stepEfficiency

(function(){
  'use strict';

  // 基准题数 (5s/题): 60s 模块 12 题, 90s 模块 18 题
  var BASELINE = {
    attention:   12,
    flex:        12,
    language:    12,
    reasoning:   18,   // 90 秒
    inhibition:  12,
    observation: 12
  };

  // ========== 维度 1: 完成率系数 (0.5 ~ 1.0) ==========
  // 用法: var eff = window.__scoring.computeCompletionRate(N, B);
  // 输入: 实际题数 N, 基准题数 B (60s=12 / 90s=18)
  // 输出: 完成率系数 ∈ [0.5, 1.0]
  //   - N/B >= 1.0 → 1.0 (达到基准, 系数封顶)
  //   - N/B = 0    → 0.5 (未做, 系数最低)
  //   - 公式: 0.5 + 0.5 * min(N/B, 1.0)
  function computeCompletionRate(N, B) {
    N = Number(N) || 0;
    B = Number(B) || 12;
    if (N <= 0) return 0.5;
    var ratio = N / B;
    if (ratio > 1.0) ratio = 1.0;     // 封顶, 防止速度刷分
    return 0.5 + 0.5 * ratio;         // [0.5, 1.0]
  }

  // ========== 维度 2: 步数效率 (0 ~ 1) ==========
  // 用法: var eff = window.__scoring.computeStepEfficiency(optimal, moves);
  // 输入: 最优步数 optimal, 实际步数 moves
  // 输出: 步数效率 ∈ (0, 1]
  //   - moves = optimal → 1.0 (满分)
  //   - moves = 2*optimal → 0.5
  //   - moves = 0 (放弃) → 兜底 0.1
  function computeStepEfficiency(optimal, moves) {
    optimal = Number(optimal) || 0;
    moves = Number(moves) || 0;
    if (optimal <= 0) return 0.1;      // 无最优步数 → 兜底
    if (moves <= 0) return 0.1;        // 未做 → 兜底
    if (moves < optimal) return 1.0;   // 实际 < 最优 (罕见) → 满分
    return optimal / moves;            // (0, 1]
  }

  // ========== 暴露全局 API ==========
  window.__scoring = {
    BASELINE: BASELINE,                        // 基准题数表
    computeCompletionRate: computeCompletionRate,  // 完成率系数
    computeStepEfficiency: computeStepEfficiency   // 步数效率
  };
})();
