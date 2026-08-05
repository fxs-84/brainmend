/**
 * 神经系统状态自评（教育版）· UI 主逻辑
 *
 * 流程: 开场说明页 → 答题页(100 题,可回退修改) → 结果页(4 组 16 分区 + 严重度)
 * 隐私: 答案仅存内存 + sessionStorage(刷新可续答),不写 localStorage、不上传服务器。
 */

import {
  BRAIN_REGION_ITEMS,
  BRAIN_REGION_DEFS,
  SCORE_DESCRIPTORS,
  PHONE_EAR_OPTIONS,
  REGION_GROUPS,
  REGION_SEVERITY_LABELS,
} from "./data.js";
import { scoreBrainRegion, regionMaxScore, findRegionForItem } from "./scoring.js";

const STORAGE_KEY = "bm_questionnaire_v1";
const AUTO_ADVANCE_MS = 280;

const SEVERITY_COLORS = {
  normal: "#2ecc71",
  mild: "#f1c40f",
  moderate: "#e67e22",
  severe: "#e74c3c",
};

const GROUP_ICONS = { alarm: "🚨", bodymap: "🗺️", motor: "🏃", higher: "🧠" };

// ---------- 状态(内存 + sessionStorage) ----------
const state = {
  items: {},      // 题号 -> 0-4
  phoneEar: null, // 第 46 题
  current: 1,
};

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* sessionStorage 不可用时仅保留内存态 */ }
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.items && typeof parsed.items === "object") state.items = parsed.items;
      if (typeof parsed.phoneEar === "string") state.phoneEar = parsed.phoneEar;
      if (Number.isInteger(parsed.current) && parsed.current >= 1 && parsed.current <= 100) {
        state.current = parsed.current;
      }
    }
  } catch (_) { /* 忽略损坏的存档 */ }
}

function clearState() {
  state.items = {};
  state.phoneEar = null;
  state.current = 1;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

function answeredCount() {
  return Object.keys(state.items).filter((k) => Number(k) !== 46).length + (state.phoneEar ? 1 : 0);
}

function isAnswered(index) {
  return index === 46 ? state.phoneEar !== null : state.items[index] !== undefined;
}

// ---------- 屏幕切换 ----------
const screens = {
  intro: document.getElementById("screen-intro"),
  quiz: document.getElementById("screen-quiz"),
  result: document.getElementById("screen-result"),
};

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].style.display = key === name ? "" : "none";
  }
  window.scrollTo(0, 0);
}

// ---------- 答题页 ----------
const el = {
  progressFill: document.getElementById("quiz-progress-fill"),
  progressText: document.getElementById("quiz-progress-text"),
  regionTag: document.getElementById("quiz-region-tag"),
  qNumber: document.getElementById("quiz-q-number"),
  qText: document.getElementById("quiz-q-text"),
  qSide: document.getElementById("quiz-q-side"),
  options: document.getElementById("quiz-options"),
  prevBtn: document.getElementById("quiz-prev"),
  nextBtn: document.getElementById("quiz-next"),
};

const itemByIndex = new Map(BRAIN_REGION_ITEMS.map((it) => [it.index, it]));

function renderQuestion() {
  const index = state.current;
  const item = itemByIndex.get(index);
  const def = findRegionForItem(index);

  el.regionTag.textContent = def ? def.label : "";
  el.qNumber.textContent = `第 ${index} / 100 题`;
  el.qText.textContent = item.text;
  el.qSide.textContent = item.side === "L" ? "左半球相关" : item.side === "R" ? "右半球相关" : "";
  el.qSide.style.display = item.side ? "" : "none";

  // 进度
  const done = answeredCount();
  el.progressFill.style.width = `${(done / 100) * 100}%`;
  el.progressText.textContent = `已答 ${done} / 100`;

  // 选项
  el.options.innerHTML = "";
  if (index === 46) {
    for (const opt of PHONE_EAR_OPTIONS) {
      el.options.appendChild(makeOption(opt.label, "", state.phoneEar === opt.value, () => {
        state.phoneEar = opt.value;
        saveState();
        renderQuestion();
        scheduleAdvance();
      }));
    }
  } else {
    for (const d of SCORE_DESCRIPTORS) {
      el.options.appendChild(makeOption(`${d.value} · ${d.label}`, d.percent, state.items[index] === d.value, () => {
        state.items[index] = d.value;
        saveState();
        renderQuestion();
        scheduleAdvance();
      }));
    }
  }

  el.prevBtn.disabled = index === 1;
  const isLast = index === 100;
  el.nextBtn.textContent = isLast ? "查看结果 →" : "下一题 →";
  el.nextBtn.disabled = !isAnswered(index);
}

function makeOption(main, sub, selected, onClick) {
  const btn = document.createElement("button");
  btn.className = "q-option" + (selected ? " selected" : "");
  btn.type = "button";
  const mainSpan = document.createElement("span");
  mainSpan.className = "q-option-main";
  mainSpan.textContent = main;
  btn.appendChild(mainSpan);
  if (sub) {
    const subSpan = document.createElement("span");
    subSpan.className = "q-option-sub";
    subSpan.textContent = sub;
    btn.appendChild(subSpan);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

let advanceTimer = null;
function scheduleAdvance() {
  if (advanceTimer) clearTimeout(advanceTimer);
  if (state.current >= 100) return; // 最后一题不自动跳,等用户点"查看结果"
  advanceTimer = setTimeout(() => {
    state.current += 1;
    saveState();
    renderQuestion();
  }, AUTO_ADVANCE_MS);
}

function goNext() {
  if (!isAnswered(state.current)) return;
  if (state.current < 100) {
    state.current += 1;
    saveState();
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  // 校验:1-100 全部作答(第 46 题看 phoneEar)
  for (let i = 1; i <= 100; i++) {
    if (!isAnswered(i)) {
      state.current = i;
      saveState();
      renderQuestion();
      alert(`还有题目未作答,已跳到第 ${i} 题。`);
      return;
    }
  }
  renderResult();
  // 沙箱模式: 把 "返回首页" 按钮换成 "📤 保存到评估报告"
  if (window.__qnrSandbox) {
    const backHomeBtn = document.getElementById("result-back-home");
    if (backHomeBtn) backHomeBtn.style.display = "none";
    const actions = document.querySelector(".result-actions");
    if (actions && !document.getElementById("result-save-report")) {
      const saveBtn = document.createElement("button");
      saveBtn.id = "result-save-report";
      saveBtn.type = "button";
      saveBtn.className = "btn-primary";
      saveBtn.style.marginTop = "12px";
      saveBtn.textContent = "📤 保存到评估报告";
      saveBtn.addEventListener("click", () => {
        saveBtn.disabled = true;
        saveBtn.textContent = "⏳ 提交中…";
        window.dispatchEvent(new CustomEvent("qnr:finished", {
          detail: { items: { ...state.items }, phoneEar: state.phoneEar }
        }));
        // 🛡️ 兜底: 5 秒后若还在本页 (listener 异常未跳转), 恢复按钮, 避免"一直提交中"
        setTimeout(() => {
          if (document.body.contains(saveBtn)) {
            saveBtn.disabled = false;
            saveBtn.textContent = "📤 保存到评估报告";
          }
        }, 5000);
      });
      actions.appendChild(saveBtn);
    }
    // 替换底部固定条中的 "📸 请截图本页发给老付" 提示
    const tip = document.querySelector(".screenshot-tip");
    if (tip) tip.innerHTML = "📤 点击「保存到评估报告」将结果自动同步给治疗师";
  }
  showScreen("result");
}

// ---------- 结果页 ----------
function renderResult() {
  const result = scoreBrainRegion({ items: state.items, phoneEar: state.phoneEar });

  // 顶部总结:含轻度及以上分区的组
  const burdenGroups = REGION_GROUPS.filter((g) =>
    g.regionIds.some((id) => result.severityByRegion[id] !== "normal")
  );
  const summaryEl = document.getElementById("result-summary");
  if (burdenGroups.length === 0) {
    summaryEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "result-summary-ok";
    p.textContent = "本次自评未发现明显高负担区,各分区均在正常范围。";
    summaryEl.appendChild(p);
  } else {
    summaryEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "result-summary-burden";
    p.textContent = `你的高负担区:${burdenGroups.map((g) => g.label).join("、")}`;
    summaryEl.appendChild(p);
    const hint = document.createElement("p");
    hint.className = "result-summary-hint";
    hint.textContent = "以下按 4 组展示 16 个功能分区的自评结果(轻度及以上即提示有负担)。";
    summaryEl.appendChild(hint);
  }

  // 4 组 × 16 分区
  const groupsEl = document.getElementById("result-groups");
  groupsEl.innerHTML = "";
  for (const group of REGION_GROUPS) {
    const groupHasBurden = group.regionIds.some((id) => result.severityByRegion[id] !== "normal");
    const card = document.createElement("section");
    card.className = "result-group" + (groupHasBurden ? " has-burden" : "");

    const head = document.createElement("h3");
    head.className = "result-group-title";
    head.textContent = `${GROUP_ICONS[group.id] || ""} ${group.label}`;
    card.appendChild(head);

    for (const id of group.regionIds) {
      const def = BRAIN_REGION_DEFS.find((d) => d.id === id);
      const max = regionMaxScore(def);
      const score = result.byRegion[id];
      const severity = result.severityByRegion[id];

      const row = document.createElement("div");
      row.className = "result-region";

      const info = document.createElement("div");
      info.className = "result-region-info";
      const name = document.createElement("div");
      name.className = "result-region-name";
      name.textContent = def.label;
      info.appendChild(name);
      const meta = document.createElement("div");
      meta.className = "result-region-meta";
      meta.textContent = `${def.detail ? def.detail + " · " : ""}${score} / ${max} 分`;
      info.appendChild(meta);

      // 小计占满分比例条
      const bar = document.createElement("div");
      bar.className = "result-region-bar";
      const fill = document.createElement("div");
      fill.className = "result-region-bar-fill";
      fill.style.width = `${max > 0 ? (score / max) * 100 : 0}%`;
      fill.style.background = SEVERITY_COLORS[severity];
      bar.appendChild(fill);
      info.appendChild(bar);

      const chip = document.createElement("span");
      chip.className = "severity-chip";
      chip.style.background = SEVERITY_COLORS[severity];
      chip.textContent = REGION_SEVERITY_LABELS[severity];

      row.appendChild(info);
      row.appendChild(chip);
      card.appendChild(row);
    }
    groupsEl.appendChild(card);
  }
}

// ---------- 事件绑定 ----------
document.getElementById("intro-start").addEventListener("click", () => {
  if (answeredCount() > 0) clearState(); // "重新开始":清掉上次进度
  showScreen("quiz");
  renderQuestion();
});

document.getElementById("intro-resume").addEventListener("click", () => {
  showScreen("quiz");
  renderQuestion();
});

el.prevBtn.addEventListener("click", () => {
  if (state.current > 1) {
    if (advanceTimer) clearTimeout(advanceTimer);
    state.current -= 1;
    saveState();
    renderQuestion();
  }
});

el.nextBtn.addEventListener("click", () => {
  if (advanceTimer) clearTimeout(advanceTimer);
  goNext();
});

document.getElementById("result-restart").addEventListener("click", () => {
  if (confirm("确定要重新测评吗?当前答案将被清除。")) {
    clearState();
    showScreen("intro");
    initIntro();
  }
});

document.getElementById("result-back-home").addEventListener("click", () => {
  window.location.href = "./index.html";
});

// ---------- 初始化 ----------
function initIntro() {
  const hasProgress = answeredCount() > 0;
  document.getElementById("intro-resume").style.display = hasProgress ? "" : "none";
  document.getElementById("intro-start").textContent = hasProgress ? "重新开始" : "开始测评";
  document.getElementById("intro-resume").textContent = `继续上次作答(已答 ${answeredCount()} / 100)`;
}

loadState();
initIntro();
showScreen("intro");
