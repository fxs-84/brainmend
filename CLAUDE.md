# 颈椎康复训练游戏 - Claude.md

## 项目概述

- **项目名称**: 颈椎检测康复训练游戏
- **类型**: Web体感游戏 / 康复训练工具
- **核心功能**: 通过陀螺仪/鼠标模拟检测头部活动，实现颈椎健康评估
- **技术栈**: Three.js Canvas 2D渲染 + 原生JavaScript + 单HTML文件

## 重要文件

- `index.html` - 全部代码（HTML/CSS/JS）

## 四种检测模式

### 1. 综合检测 (integrated)
一站式完成位置觉、稳定性、ROM三项评估，20秒自动完成

### 2. 协调性检测 (coordination)
跟踪红色目标点沿指定轨迹运动，支持：水平、垂直、垂直左、垂直右、8字

### 3. ROM检测 (rom)
分6步检测颈椎活动范围：
- 前屈(低头)、后伸(抬头)
- 左旋、右旋
- 左屈、右屈

**流程**: 归零 → 移动到极限 → 采集 → 归零 → 下一步 → 重复

### 4. 位置觉检测 (position)
本体感觉评估（闭眼测试），6方向：
- 右旋、左旋、后伸、前屈、右屈、左屈

**流程**: 归零 → 闭眼移动到极限 → 保持5秒 → 睁眼归零 → 采集 → 下一步

## 关键状态变量

```javascript
state.mode                    // 'integrated' | 'coordination' | 'rom' | 'position'
state.romStepIndex            // ROM检测步骤: 0未开始, 1-6进行中, 7完成
state.romIsWaitingForZero     // ROM: true=已采集等待归零
state.positionStepIndex       // 位置觉步骤: 0未开始, 1-6进行中, 7完成
state.positionIsRunning       // 位置觉: true=运行中, false=未开始, 'waiting_for_zero'=等待归零
```

## 核心逻辑规律

### 检测流程（采集后必须归零才进入下一步）

**采集按钮**: 只记录数据，**不跳转**
**归零按钮**: 已采集时跳转下一步，未采集时忽略

```
归零 → (romStepIndex=1) → 采集 → (romIsWaitingForZero=true) → 归零 → (romStepIndex=2) → 采集 → ...
```

## UI结构

- `view-mode-select` - 模式选择面板
- `view-integrated` - 综合检测面板
- `view-coordination` - 协调性检测面板
- `view-rom` - ROM检测面板
- `view-position` - 位置觉检测面板

## 常见问题

### 修改UI后按钮不可点击
检查是否有JS错误阻塞了`init()`中的事件绑定，常见原因：
- 访问不存在的DOM元素
- 函数执行报错

### 数据不显示或错位
- 确保`showXXXResults()`在数据设置**之后**调用
- 检查状态变量是否正确初始化

## 陀螺仪数据格式

```javascript
{
  pitch: -30.5,  // 俯仰角（点头），范围-90~90
  yaw: 15.2,     // 偏航角（转头），范围-180~180
  roll: -5.1,    // 翻滚角（侧屈），范围-90~90
}
```

## 缩放系数

动态计算确保最大位移对应准确角度：
- Yaw: `yawCoefficient = 80 / (hLineLength * scale)`
- Pitch: `pitchCoefficient = 45 / (vLineLength * scale)`

## 强制工作流

> 本规则强制执行，以确保代码质量和安全。

### Agent 调用规则

在以下场景，**必须自动调用**对应 agent，**无需用户提醒**：

| 场景 | 必须调用的 Agent | 说明 |
|------|----------------|------|
| 新功能开发或 bug 修复前 | `tdd-guide` | 遵循 TDD 流程，先写测试 |
| 每次代码修改完成后 | `code-reviewer` | 代码审查，发现问题 |
| 涉及用户输入/认证/支付/蓝牙 | `security-reviewer` | 安全审查，防止漏洞 |
| 复杂功能/架构决策 | `planner` | 规划后再实现 |
| 构建失败时 | `build-error-resolver` | 自动分析并修复 |

### 调用时机

- **TDD**: 开始写代码前调用，不是之后
- **Code Review**: 每次有意义的代码修改后调用（不是每个小改动）
- **Security Review**: 涉及敏感功能时必须调用
- **提交前**: 必须确保已通过 code-review 和 security-review

### 调用示例

```
用户: "添加一个用户登录功能"
→ 我必须先调用 tdd-guide agent
→ 然后实现功能
→ 然后调用 code-reviewer agent
→ 如果涉及认证，必须调用 security-reviewer agent
→ 最后才提交
```

## 开发阶段

- [x] Phase 1 MVP: 模拟陀螺仪、3D可视化、综合检测、协调性检测、评分
- [ ] Phase 2: 真实蓝牙连接、数据持久化、历史记录
- [x] Phase 3: 雷达图/折线图报告、中文语音播报
- [ ] 障碍躲避游戏
