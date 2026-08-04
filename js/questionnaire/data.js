/**
 * 神经系统状态自评（教育版）· 数据层
 *
 * 原样移植自 kfblxt 项目 app/src/features/assessments/scales/brain-region.ts：
 *  - 大脑区域定位表（ANRM 神经康复专科量表）：16 个脑功能分区，共 100 题，每题 0-4 分
 *  - 第 46 题（使用电话偏好侧）为单选，单独建模，不计入总分
 *  - 部分题目带 L/R 侧别提示（L=左半球主导，R=右半球主导），仅展示用，不影响总分
 *  - 评分阈值：分区小计/分区满分 ≥ 1/4 即"有负担"
 *
 * ⚠️ 题目措辞与阈值规则不得修改（与原量表保持一致）。
 */

export const BRAIN_REGION_MIN_ITEM = 0;
export const BRAIN_REGION_MAX_ITEM = 4;
export const BRAIN_REGION_SCORED_ITEM_COUNT = 99; // 100 - 第46题（单选）
export const BRAIN_REGION_MAX_TOTAL = BRAIN_REGION_SCORED_ITEM_COUNT * BRAIN_REGION_MAX_ITEM; // 396

export const AFFECTED_THRESHOLD = 0.25;
export const MILD_THRESHOLD = 0.25;
export const MODERATE_THRESHOLD = 0.5;
export const SEVERE_THRESHOLD = 0.75;

/** 0-4 评分标准（原量表说明页口径） */
export const SCORE_DESCRIPTORS = [
  { value: 0, label: "无症状", percent: "0% 的时间",   full: "0 = 我从没有症状 (0% 的时间)" },
  { value: 1, label: "很少",   percent: "< 25% 的时间", full: "1 = 我很少有症状 (< 25% 的时间)" },
  { value: 2, label: "经常",   percent: "50% 的时间",  full: "2 = 我经常有症状 (50% 的时间)" },
  { value: 3, label: "频繁",   percent: "75% 的时间",  full: "3 = 我频繁地有症状 (75% 的时间)" },
  { value: 4, label: "总是",   percent: "100% 的时间", full: "4 = 我总是有症状 (100% 的时间)" },
];

/** 第 46 题选项 */
export const PHONE_EAR_OPTIONS = [
  { value: "right", label: "右耳" },
  { value: "left", label: "左耳" },
  { value: "no_preference", label: "无明显偏好" },
];

/** 16 个脑功能分区（题目区间按原量表 1-100） */
export const BRAIN_REGION_DEFS = [
  { id: "prefrontal",       label: "前额叶（背外侧和眶前区）", detail: "区域 9、10、11、12",   range: [1, 17] },
  { id: "premotor",         label: "额叶中央前区、辅助运动区", detail: "区域 4、6",             range: [18, 23] },
  { id: "broca",            label: "额叶布罗卡区（运动言语区）", detail: "区域 44、45",         range: [24, 26] },
  { id: "somatosensory",    label: "顶叶体感区、顶叶上小叶",   detail: "区域 3、1、2、7",       range: [27, 31] },
  { id: "parietalInferior", label: "顶叶下小叶",               detail: "区域 39、40",           range: [32, 38] },
  { id: "auditoryCortex",   label: "颞叶听觉皮层",             detail: "区域 41、42",           range: [39, 46] },
  { id: "auditoryAssoc",    label: "颞叶听觉联合皮层",         detail: "区域 22",               range: [47, 48] },
  { id: "medialTemporal",   label: "内侧颞叶和海马体",         detail: "",                      range: [49, 61] },
  { id: "occipital",        label: "枕叶",                     detail: "区域 17、18、19",       range: [62, 66] },
  { id: "cerebellumSpinal", label: "小脑-脊髓小脑",            detail: "",                      range: [67, 70] },
  { id: "cerebellumCortex", label: "小脑-皮层小脑",            detail: "",                      range: [71, 73] },
  { id: "cerebellumVest",   label: "小脑-前庭小脑",            detail: "",                      range: [74, 79] },
  { id: "basalDirect",      label: "基底节直接通路",           detail: "",                      range: [80, 85] },
  { id: "basalIndirect",    label: "基底节间接通路",           detail: "",                      range: [86, 89] },
  { id: "parasympathetic",  label: "副交感神经活动减少",       detail: "",                      range: [90, 94] },
  { id: "sympathetic",      label: "交感神经活动增加",         detail: "",                      range: [95, 100] },
];

/** 4 组归组（与 9.9 元音频解读口径一致） */
export const REGION_GROUPS = [
  { id: "alarm",   label: "报警系统",   regionIds: ["parasympathetic", "sympathetic"] },
  { id: "bodymap", label: "身体地图",   regionIds: ["somatosensory", "parietalInferior"] },
  { id: "motor",   label: "运动与平衡", regionIds: ["premotor", "cerebellumSpinal", "cerebellumCortex", "cerebellumVest", "basalDirect", "basalIndirect"] },
  { id: "higher",  label: "高级功能",   regionIds: ["prefrontal", "broca", "auditoryCortex", "auditoryAssoc", "medialTemporal", "occipital"] },
];

export const REGION_SEVERITY_LABELS = {
  normal: "正常",
  mild: "轻度",
  moderate: "中度",
  severe: "重度",
};

/** 题目全集（按原量表抄录，顺序与题号一致；side: L=左半球相关 R=右半球相关，仅展示） */
export const BRAIN_REGION_ITEMS = [
  // 1. 前额叶（1-17）
  { index: 1,  text: "难以约束和控制冲动或欲望", side: null },
  { index: 2,  text: "情绪不稳定", side: null },
  { index: 3,  text: "规划和组织的困难", side: null },
  { index: 4,  text: "做决定的困难", side: null },
  { index: 5,  text: "缺乏动机、热情、兴趣和驱动力（冷漠）", side: null },
  { index: 6,  text: "难以将头脑中的声音或旋律摆脱", side: null },
  { index: 7,  text: "持续重复事情或思想，难以放下", side: null },
  { index: 8,  text: "开始和完成任务的困难", side: null },
  { index: 9,  text: "抑郁的发作", side: null },
  { index: 10, text: "精神上的疲惫", side: null },
  { index: 11, text: "注意力持续时间减少", side: null },
  { index: 12, text: "难以长时间保持专注和集中注意力", side: null },
  { index: 13, text: "创造性、想象力和直觉方面的困难", side: "R" },
  { index: 14, text: "难以欣赏艺术和音乐", side: "R" },
  { index: 15, text: "分析性思维的困难", side: "L" },
  { index: 16, text: "在数学、数字技能和时间意识方面的困难", side: "L" },
  { index: 17, text: "难以将想法、行动和言语按线性顺序组织起来", side: "L" },

  // 2. 额叶中央前区（18-23）
  { index: 18, text: "启动您的手臂或腿的动作变得更加困难", side: null },
  { index: 19, text: "感觉手臂或腿沉重，尤其是疲倦时", side: null },
  { index: 20, text: "手臂或腿的肌肉紧绷增加", side: null },
  { index: 21, text: "手臂或腿的肌肉耐力减弱", side: null },
  { index: 22, text: "一侧与另一侧的肌肉功能或力量明显差异", side: null },
  { index: 23, text: "一侧与另一侧的肌肉紧绷程度有明显差异", side: null },

  // 3. 布罗卡区（24-26）
  { index: 24, text: "口头表达组词有困难，尤其是疲劳时", side: "L" },
  { index: 25, text: "发现说话有时变得很困难", side: "L" },
  { index: 26, text: "有时注意到语句的发音和说话的流畅性发生变化", side: "L" },

  // 4. 顶叶体感区（27-31）
  { index: 27, text: "感知肢体位置的困难", side: null },
  { index: 28, text: "移动、后仰在椅子上或倚靠墙壁时难以评估后方的距离", side: null },
  { index: 29, text: "经常不小心地撞到墙或物体上", side: null },
  { index: 30, text: "同一部位或身体的一侧反复受伤", side: null },
  { index: 31, text: "对触摸或疼痛的过度敏感", side: null },

  // 5. 顶叶下小叶（32-38）
  { index: 32, text: "难以区分左/右", side: "L" },
  { index: 33, text: "数学计算的困难", side: "L" },
  { index: 34, text: "找词困难", side: "L" },
  { index: 35, text: "写作困难", side: "L" },
  { index: 36, text: "难以识别符号或形状", side: "R" },
  { index: 37, text: "简单绘画的困难", side: "R" },
  { index: 38, text: "解读地图的困难", side: "R" },

  // 6. 颞叶听觉皮层（39-46）
  { index: 39, text: "总体听力功能降低", side: null },
  { index: 40, text: "在背景噪音中难以理解言语", side: null },
  { index: 41, text: "难以理解非完美发音的语言", side: null },
  { index: 42, text: "需要看着某人的嘴巴才能理解他们在说什么", side: null },
  { index: 43, text: "定位声音的方位困难", side: null },
  { index: 44, text: "不喜欢预测性的、重复的节奏和节拍音乐", side: "L" },
  { index: 45, text: "不喜欢使用多种乐器的不可预测的节奏", side: "R" },
  { index: 46, text: "使用电话时明显偏好一侧耳朵", side: null },

  // 7. 颞叶听觉联合皮层（47-48）
  { index: 47, text: "难以理解一些接地气的词语的意义", side: "L" },
  { index: 48, text: "倾向于单调的言语，没有起伏或情感", side: "R" },

  // 8. 内侧颞叶和海马体（49-61）
  { index: 49, text: "记忆效率降低", side: null },
  { index: 50, text: "影响日常活动的记忆丧失", side: null },
  { index: 51, text: "对日期、时间流逝或地点感到困惑", side: null },
  { index: 52, text: "难以回忆事件", side: null },
  { index: 53, text: "东西容易放错地方并难以回忆经过", side: null },
  { index: 54, text: "记忆地点（如地址）的困难", side: "R" },
  { index: 55, text: "视觉记忆的困难", side: "R" },
  { index: 56, text: "常常忘记放置的物品，如钥匙、钱包、手机等", side: "R" },
  { index: 57, text: "难以记住面孔", side: "R" },
  { index: 58, text: "难以将名字与面孔联系起来", side: "L" },
  { index: 59, text: "记忆单词的困难", side: "L" },
  { index: 60, text: "记忆数字的困难", side: "L" },
  { index: 61, text: "难以记住准时或按时做事", side: "L" },

  // 9. 枕叶（62-66）
  { index: 62, text: "难以区分相似的颜色深浅", side: null },
  { index: 63, text: "看见物品的色彩变得暗淡", side: null },
  { index: 64, text: "难以协调视觉输入和手部动作，导致无法有效地伸手取物", side: null },
  { index: 65, text: "视野中出现局部暗点或盲区（视野缺损）", side: null },
  { index: 66, text: "视野中出现飞蚊症或光晕", side: null },

  // 10. 小脑-脊髓小脑（67-70）
  { index: 67, text: "平衡困难、或一侧的平衡更差", side: null },
  { index: 68, text: "下楼时需要抓住扶手或小心翼翼地观察每一步", side: null },
  { index: 69, text: "在黑暗中感觉不稳、容易摔倒", side: null },
  { index: 70, text: "行走或站立时身体倾向于倚向一侧", side: null },

  // 11. 小脑-皮层小脑（71-73）
  { index: 71, text: "最近手部变得笨拙", side: null },
  { index: 72, text: "最近脚部变得笨拙或经常绊倒", side: null },
  { index: 73, text: "在动作的最后阶段伸手去取东西时手微微颤抖", side: null },

  // 12. 小脑-前庭小脑（74-79）
  { index: 74, text: "头晕或方向感丧失的发作", side: null },
  { index: 75, text: "站立或行走时背部肌肉很快疲劳", side: null },
  { index: 76, text: "长期颈部或背部肌肉紧绷", side: null },
  { index: 77, text: "感到恶心、晕车或晕船", side: null },
  { index: 78, text: "感觉方向感丧失或环境在移动", side: null },
  { index: 79, text: "人多的地方引发焦虑", side: null },

  // 13. 基底节直接通路（80-85）
  { index: 80, text: "动作缓慢", side: null },
  { index: 81, text: "肌肉（不是关节）僵硬，但在移动时会消失", side: null },
  { index: 82, text: "写字时手抽筋", side: null },
  { index: 83, text: "行走时身体前倾", side: null },
  { index: 84, text: "声音变得更加微弱", side: null },
  { index: 85, text: "面部表情变化，导致人们经常问你是否不高兴或生气", side: null },

  // 14. 基底节间接通路（86-89）
  { index: 86, text: "无法控制的肌肉运动", side: null },
  { index: 87, text: "强烈的需要经常清嗓子或收缩一组肌肉", side: null },
  { index: 88, text: "强迫症倾向", side: null },
  { index: 89, text: "持续的神经紧张和心神不宁", side: null },

  // 15. 副交感神经活动减少（90-94）
  { index: 90, text: "口干或眼干", side: null },
  { index: 91, text: "吞咽补品或大块食物困难", side: null },
  { index: 92, text: "肠道动作缓慢，容易便秘", side: null },
  { index: 93, text: "慢性消化不良", side: null },
  { index: 94, text: "肠或膀胱失禁，导致内裤污渍", side: null },

  // 16. 交感神经活动增加（95-100）
  { index: 95, text: "容易焦虑", side: null },
  { index: 96, text: "容易受惊", side: null },
  { index: 97, text: "放松困难", side: null },
  { index: 98, text: "对明亮或闪烁的灯光敏感", side: null },
  { index: 99, text: "心跳加速的发作", side: null },
  { index: 100, text: "睡眠困难", side: null },
];
