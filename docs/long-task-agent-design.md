# cc-wrap 长程任务 Agent 升级方案

> **版本**：v1.0 · 起草日期 2026-06-11
> **借鉴源**：小米 MiMo 团队 2026-06-10 发布的 [MiMo Code 技术博客](https://mimo.xiaomi.com/zh/blog/mimo-code-long-horizon)
> **目标读者**：AI 编码 Agent（让模型读完即可开工）
> **代码状态**：**纯设计文档，不含可执行代码。落地时请按本文件 §10 优先级分版本实现**

---

## 1. 概述

### 1.1 背景

cc-wrap v1.1.7-beta 当前是一个 **Claude Code CLI 的 Electron 桌面包装**，核心循环是单 session 内多轮对话，无显式状态持久化、无独立记忆系统、无完成度验证。在面对以下场景时力不从心：

- 跨多文件、长步骤的复杂任务（> 30 轮对话）
- 用户多次回归同一项目（需要历史经验）
- 任务在后台跑数小时（需要 checkpoint + 恢复）
- Agent 偷懒"提前宣称完成"（无独立验证）

小米 MiMo Code 在这些点上做了系统化设计。**本文件不复制其内部实现，而是挑选与 cc-wrap 定位（轻量 GUI + 中文友好）契合的点，给出可落地的方案。**

### 1.2 目标

引入 6 个能力，分三档优先级落地：

| 档位 | 能力 | 主要价值 |
|------|------|---------|
| **P0** | 四层记忆 + Markdown 存储 | GUI 差异化最大，用户可审查 |
| **P0** | Goal 独立验证 | 极低门槛防 Agent 偷懒 |
| **P1** | Max Mode 并行采样开关 | 关键决策可靠性提升 |
| **P1** | Cycle 提早提取 + Writer subagent | 长任务状态连续性 |
| **P2** | notes.md scratchpad | 搭车实现，用户随手记 |
| **P2** | Dream / Distill 记忆整理 | 长期记忆去重压缩 |

### 1.3 设计原则

1. **不破坏现有架构**：新增独立模块，不修改 `agent-loop.js` 主循环逻辑；通过 hook 介入
2. **GUI 优先**：所有"在 CLI 里不显眼"的状态（记忆、checkpoint、Goal）在 GUI 里必须有可视化落点
3. **可审查优先于性能**：记忆用 Markdown 而非向量库；Goal 验证过程可回看
4. **中文友好**：所有面向用户的提示、模板、文档中文优先
5. **失败优雅**：任何子机制失败（API 超时、Writer 报错）必须降级到原始行为，不阻塞主对话
6. **成本透明**：Max Mode 等高消耗功能必须明确告知 token 倍数，用户主动开

---

## 2. 借鉴源：MiMo Code 核心设计

详见原文，本节只摘要与本方案相关的部分。

### 2.1 MiMo Code 三大主题

```
计算（单轮推理质量）
  ├─ Max Mode：每轮并行采 N 个候选 + judge 选最优
  ├─ Goal 独立验证：Agent 宣称完成前，独立模型审查
  └─ Dynamic Workflow：JS 脚本编排子 Agent（**本方案不借鉴**）

记忆（多轮任务连续性）
  ├─ Cycle：逻辑会话 = 多次窗口重建的链
  ├─ 提早提取：在 20% / 45% / 70% 三个 checkpoint 触发（不是窗口快满时）
  ├─ 独立 Writer subagent：主 Agent 不维护自己的笔记
  └─ 四层记忆：Session / Project / Global / History

进化（跨 session 经验积累）
  ├─ 项目记忆 Markdown 化
  ├─ Dream：定期合并去重
  └─ Distill：定期把流程固化为 skill
```

### 2.2 本方案不借鉴的部分

| 项 | 不做的原因 |
|----|------------|
| **Dynamic Workflow** | 需要可视化编排器 + JS 沙箱，工程量与 cc-wrap 轻量定位冲突 |
| **受限 shell 工具调用语法** | 牵涉 Claude Code 协议层，不应改动 |
| **Mamba 状态空间对比论证** | 理论背景，无需在产品文档复述 |

---

## 3. 整体架构

### 3.1 模块划分

```
src/main/
├── long-task/                       # 【新增】长程任务模块
│   ├── index.js                     # 统一导出
│   ├── memory/                      # 四层记忆子系统
│   │   ├── store.js                 # 文件读写 + 路径管理
│   │   ├── session.js               # Session 层（checkpoint）
│   │   ├── project.js               # Project 层（跨 session）
│   │   ├── global.js                # Global 层（用户偏好）
│   │   ├── history.js               # History 层（SQLite 轨迹）
│   │   ├── writer.js                # Writer subagent 调度
│   │   ├── notes.js                 # notes.md scratchpad
│   │   ├── dream.js                 # 7 天整理
│   │   └── distill.js               # 30 天流程固化
│   ├── goal/                        # Goal 独立验证子系统
│   │   ├── store.js                 # Goal 配置读写
│   │   ├── verifier.js              # 验证调用 + 结果判断
│   │   └── templates.js             # 常用 Goal 模板
│   ├── max-mode/                    # Max Mode 子系统
│   │   ├── sampler.js               # N 路并发采样
│   │   ├── judge.js                 # judge 调用
│   │   └── pool.js                  # 采样池管理
│   ├── cycle/                       # Cycle 提早提取子系统
│   │   ├── monitor.js               # 上下文利用率监控
│   │   ├── checkpoint.js            # 触发点判断
│   │   ├── rebuild.js               # 窗口重建 + 注入
│   │   └── injector.js              # 分层 prompt 注入（65K token 预算）
│   ├── hooks/                       # Agent Loop 钩子
│   │   ├── pre-turn.js              # 轮次开始前
│   │   ├── post-turn.js             # 轮次结束后
│   │   ├── pre-finish.js            # Agent 宣称完成时
│   │   └── on-error.js              # 出错时
│   ├── settings.js                  # 模块配置（开关、阈值、模板）
│   └── logger.js                    # 模块专用日志
├── agent-loop.js                    # 【修改】注册 hooks
├── api-client.js                    # 【修改】支持 max-mode 多路并发
├── tools.js                         # 【修改】新增 4 个工具（见 §6.3）
├── system-prompt.js                 # 【修改】追加记忆召回指引
└── preload.js                       # 【修改】新增 IPC 通道

src/renderer/                        # 【修改】前端 UI
├── long-task/                       # 【新增】前端组件
│   ├── MemoryPanel.js               # 记忆面板
│   ├── GoalBar.js                   # Goal 输入栏
│   ├── MaxModeToggle.js             # Max Mode 开关
│   ├── CycleIndicator.js            # Cycle 检查点指示
│   ├── NotesEditor.js               # notes.md 编辑器
│   └── MemoryStats.js               # 记忆命中率统计
```

### 3.2 数据流总览

```
用户发起任务
   ↓
Agent Loop 启动
   ↓
[pre-turn hook] → 注入当前 Goal + 召回的记忆 → 调 API
   ↓
模型返回 tool_use
   ↓
[post-turn hook] → 写入 notes.md（如有）→ 触发 Cycle 检查点判断
   ↓
工具执行
   ↓
模型尝试结束（stop_reason: end_turn）
   ↓
[pre-finish hook] → Goal 验证（如果设置了）→ 满足则放行
   ↓
任务结束
   ↓
[on-task-end hook] → Session checkpoint 落盘 → 更新 Project 记忆候选
```

### 3.3 与现有系统的集成点

| 集成点 | 文件 | 修改类型 | 修改内容 |
|--------|------|----------|---------|
| Agent Loop 主循环 | `src/main/agent-loop.js` | 修改 | 在 `processTurn()` 关键节点触发 hooks |
| API 客户端 | `src/main/api-client.js` | 修改 | 抽出 `callClaudeWithMessages()` 公共方法，供 Max Mode / Verifier 复用 |
| 工具定义 | `src/main/tools.js` | 修改 | 新增 4 个工具：`memory_recall` / `memory_write` / `goal_set` / `goal_status` |
| 系统提示 | `src/main/system-prompt.js` | 修改 | 追加"记忆召回"段落 + Goal 状态段落 |
| IPC 通道 | `src/preload.js` | 修改 | 新增 `long-task:memory:*`、`long-task:goal:*`、`long-task:max-mode:*` 通道 |
| Renderer 组件 | `src/renderer/` | 新增 | §3.1 列出的 6 个 UI 组件 |
| electron-store 配置 | （在 `settings.js` 中） | 新增 | `longTask.enabled` / `goal.default` / `maxMode.defaultN` 等 |
| 持久化目录 | `app.getPath('userData')` | 新增 | `memory/{session,project,global,history}/` |

---

## 4. 数据结构定义

> **重要约定**：所有 .md 文件均使用 UTF-8，YAML frontmatter 标识元数据，Markdown 正文为内容。结构化字段禁止改名为中文（保持 grep 友好）。

### 4.1 Session Checkpoint 结构（11 字段）

**文件路径**：`{userData}/memory/session/{sessionId}.md`

```markdown
---
schema_version: 1
session_id: "uuid-v4"
project_hash: "sha256-of-project-root"
created_at: "2026-06-11T16:00:00+08:00"
updated_at: "2026-06-11T16:30:00+08:00"
cycle_index: 2         # 第几个 cycle
window_token_used: 45000
window_token_max: 200000
utilization_ratio: 0.225
---

# Session Checkpoint

## 1. 当前意图
用户希望把 src/api/user.js 重构为基于 Repository 模式，预期通过 4 个单测。

## 2. 下一步动作
调用 Read 工具读取 src/api/user.js 的 30-60 行，确认数据库调用方式。

## 3. 工作约束
- 不修改 package.json
- 必须保留向后兼容
- 用户偏好中文注释

## 4. 任务树
- [x] 读取 user.js 全文
- [x] 分析现有依赖
- [ ] 设计 Repository 接口
- [ ] 实现 UserRepository
- [ ] 替换调用点
- [ ] 运行测试

## 5. 当前工作
正在阅读 src/api/user.js，尚未动手改。

## 6. 涉及文件
- src/api/user.js
- src/api/__tests__/user.test.js
- src/db/connection.js

## 7. 跨任务发现
项目使用 Knex.js 做查询，repository 模式可参考 src/api/order.js。

## 8. 错误与修复
- 错误：edit 工具报 "old_string not unique"
- 修复：扩大上下文范围，包含前后 5 行

## 9. 运行时状态
- 当前 turn: 14
- 工具调用累计: 23
- 距上次 checkpoint: 8 轮

## 10. 设计决策
决定保留向后兼容：通过新加 UserRepository 类、不删旧函数实现。

## 11. 杂项笔记
用户的项目用 ESM 不是 CJS，import 时注意。
```

### 4.2 Project 记忆结构

**文件路径**：`{userData}/memory/project/{projectHash}.md`

```markdown
---
schema_version: 1
project_hash: "sha256-of-project-root"
project_name: "cc-wrap"
project_root: "E:/openclawPJ/claude-desktop"
created_at: "2026-06-01T00:00:00+08:00"
updated_at: "2026-06-11T16:30:00+08:00"
promoted_from_sessions: 3    # 从多少次 session checkpoint 提升
confidence: high             # high | medium | low
---

# Project Memory: cc-wrap

## 架构决定
- 使用 Electron + 纯 vanilla JS（无 React/Vue 框架）
- Agent 循环在 main 进程，渲染层通过 IPC 通信
- 工具定义集中在 src/main/tools.js

## 用户规则
- 提交前必须 npm run lint 通过
- 老板硬要求：所有写代码走 Claude Code，不直接输出代码字符串
- 文档驱动：先敲定接口契约再写实现

## 反复验证的技术事实
- electron-store 路径在 Windows 上含中文时需用 iconv-lite
- screenshot-desktop 在多屏环境下需指定 deviceId
- node-pty 在 Windows 必须用 winpty 后端

## 关键文件
- src/main/agent-loop.js: Agent 主循环入口
- src/main/tools.js: 工具定义数据源
- CLAUDE.md: 项目 AI 协作规范

## 已知陷阱
- 不要在 IPC handler 里做重计算（会阻塞渲染）
- 工具执行错误必须捕获后转成模型可读格式，不能 throw 到主循环
```

### 4.3 Global 记忆结构

**文件路径**：`{userData}/memory/global.md`

```markdown
---
schema_version: 1
updated_at: "2026-06-11T16:30:00+08:00"
---

# Global User Preferences

## 回答风格
- 中文优先，技术名词保留英文
- 代码内注释中文，commit message 中英混合
- 拒绝"嘴炮"：说完不做是最大禁忌

## 工作流偏好
- 短任务（< 2 天）直接干
- 中等任务（3-7 天）出需求文档 + 技术设计
- 大任务（> 7 天）拆里程碑

## 工具偏好
- 识图只用 mmx vision describe
- 写代码必须走 Claude Code
- 验证用 verify.sh
```

### 4.4 Goal 配置结构

**文件路径**：`{userData}/memory/goal/{projectHash}.json`

```json
{
  "schema_version": 1,
  "project_hash": "sha256-...",
  "current_goal": {
    "text": "所有测试通过且代码已提交",
    "set_at": "2026-06-11T16:00:00+08:00",
    "set_by_session": "uuid-v4",
    "templates_used": ["test-and-commit"],
    "verification_count": 0,
    "last_verified_at": null
  },
  "history": [
    {
      "text": "PR 已创建",
      "completed_at": "2026-06-10T12:00:00+08:00",
      "verifier_pass": true
    }
  ]
}
```

### 4.5 History SQLite Schema

**文件路径**：`{userData}/memory/history/history.db`

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,        -- 原始 JSON 或文本
  tool_name TEXT,
  tool_input TEXT,
  tool_output TEXT,
  token_count INTEGER,
  created_at INTEGER NOT NULL,  -- unix timestamp ms
  cycle_index INTEGER
);

CREATE INDEX idx_session ON messages(session_id);
CREATE INDEX idx_session_turn ON messages(session_id, turn_index);
CREATE INDEX idx_session_cycle ON messages(session_id, cycle_index);
```

### 4.6 notes.md scratchpad 结构

**文件路径**：`{userData}/memory/session/{sessionId}.notes.md`

自由格式，writer 在 checkpoint 时读取并按需路由到 §4.1 的对应字段，然后清空。

```markdown
# Session Notes (scratchpad)

用户在第 12 轮时强调：不要改 package.json 的依赖版本。
数据库连接有问题，看 src/db/connection.js 第 45 行。
```

### 4.7 Max Mode 配置结构

**运行时变量**（不持久化，per-session）：

```javascript
{
  enabled: false,
  N: 5,                  // 并行采样数
  judge_temperature: 0.0,
  sampling_temperature: 1.0,
  total_token_used: 0,
  rounds_sampled: 0
}
```

### 4.8 TypeScript-Style 接口汇总

```typescript
interface LongTaskConfig {
  enabled: boolean;                     // 模块总开关
  memory: {
    enableSession: boolean;             // 默认 true
    enableProject: boolean;             // 默认 true
    enableGlobal: boolean;              // 默认 true
    enableHistory: boolean;             // 默认 true
    writerModel: string | null;         // null = 跟主对话模型
    checkpointRatios: number[];         // 默认 [0.20, 0.45, 0.70]
    rebuildTokenBudget: number;         // 默认 65000
    promotionThreshold: number;         // session 提升到 project 需出现次数，默认 3
  };
  goal: {
    enabled: boolean;                   // 默认 true
    verifierModel: string | null;
    maxRetries: number;                 // 默认 3
    stuckThreshold: number;             // 误拦后允许 Agent 重试次数
  };
  maxMode: {
    defaultEnabled: boolean;            // 默认 false
    defaultN: number;                    // 默认 5
    maxN: number;                       // 默认 10，硬上限
    tokenBudgetMultiplier: number;      // 默认 5
  };
  cycle: {
    enableLongTaskDetection: boolean;   // 自动检测长任务
    longTaskThresholdTurns: number;     // 默认 30
  };
  dream: {
    enabled: boolean;                   // 默认 true
    intervalDays: number;               // 默认 7
  };
  distill: {
    enabled: boolean;                   // 默认 true
    intervalDays: number;               // 默认 30
  };
}

interface CheckpointTrigger {
  cycle_index: number;
  trigger_reason: 'ratio' | 'manual' | 'rebuild';
  utilization_at_trigger: number;
  writer_invocation_id: string;
}

interface GoalVerdict {
  status: 'satisfied' | 'unsatisfied' | 'impossible';
  reasoning: string;
  gaps: string[];                       // status=unsatisfied 时填
  confidence: number;                   // 0-1
  verifier_tokens_used: number;
}
```

---

## 5. P0 方案详解

### 5.1 四层记忆 + Markdown 存储

#### 5.1.1 目标

把"看不见的状态"变成"可审查的资产"。用户在 GUI 里能：
- 看 Agent 当前 session 记住了什么
- 看项目长期积累的经验
- 改任何一条记忆
- 删除过时的条目

#### 5.1.2 文件位置

```
{userData}/memory/
├── session/
│   ├── {sessionId}.md             # Session checkpoint
│   └── {sessionId}.notes.md       # scratchpad
├── project/
│   └── {projectHash}.md
├── global.md
└── history/
    └── history.db
```

`{userData}` = `app.getPath('userData')`（Windows: `%APPDATA%/cc-wrap`）

#### 5.1.3 写入权限约束（single-writer 不变量）

| 文件 | 唯一允许的写入者 | 其他角色权限 |
|------|------------------|--------------|
| `session/{id}.md` | Writer subagent | 主 Agent 只读 |
| `session/{id}.notes.md` | 主 Agent（任意时刻） | Writer 读取后清空 |
| `project/{hash}.md` | Writer subagent（提升时） | Dream subagent（7 天整理） |
| `global.md` | 用户手动（GUI） | Dream subagent 提示 |
| `history.db` | post-turn hook | 无 |

**实现层校验**：所有写入操作必须经过 `memory/store.js` 的 `writeFile(path, content, actor)` 方法，越权写入直接抛 `MemoryPermissionError`。

#### 5.1.4 提升规则（Session → Project）

Writer 在每次 checkpoint 时对"跨任务发现"和"反复验证的技术事实"两个字段做哈希：
- 同样内容的哈希在最近 N=3 个 session checkpoint 中出现 ≥ 2 次 → 触发提升评估
- 评估 prompt 让 Writer 决定是否"提升到 Project" / "标记为一次性的，不提升"
- 提升时追加到 `project/{hash}.md` 的对应小节，带 `promoted_from_sessions` 计数

#### 5.1.5 召回机制

主 Agent 在每轮 [pre-turn hook] 中：
1. 读取 `project/{hash}.md` 全文（一般 < 5K token）
2. 读取 `global.md` 全文（一般 < 2K token）
3. 读取 `session/{id}.md` 全文（受窗口限制）
4. 拼装成"记忆上下文"注入 system prompt 的固定段落

**新工具 `memory_recall`**（在 §6.3 定义）：让 Agent 主动按关键词搜索 history 轨迹（向下兜底）。

#### 5.1.6 GUI 组件

**MemoryPanel.js**（左侧栏，宽度可拖拽，默认 300px）

```
┌─ 📚 记忆 ─────────────────┐
│ 🟢 Session (active)       │
│   └─ cc-wrap 重构任务 v2  │
│       11 字段 · 0.5KB     │
│                            │
│ 📁 Project                │
│   └─ cc-wrap              │
│       12 条 · 4.2KB       │
│                            │
│ 🌍 Global                 │
│   └─ 用户偏好             │
│       5 条 · 0.8KB        │
│                            │
│ 📊 本次命中: 7/9          │
└────────────────────────────┘
```

点击任一节点展开 Markdown 渲染视图，工具栏有 `✏️ 编辑 / 🗑️ 删除 / 📋 复制 / ↻ 刷新`。

#### 5.1.7 验收标准

- [ ] 4 个层级的文件能正常创建、读取、修改
- [ ] Writer subagent 触发时主 Agent 不受影响
- [ ] 用户在 GUI 中能编辑任何记忆条目
- [ ] 删除一条 Project 记忆后，下次 checkpoint 不会"复活"它
- [ ] 单 session 跑 50 轮不出现记忆文件损坏

---

### 5.2 Goal 独立验证

#### 5.2.1 目标

防 Agent 偷懒：当 Agent 试图结束（`stop_reason: end_turn`）时，独立调一次 API 验证 Goal 是否真正满足。

#### 5.2.2 触发流程

```
Agent 返回 end_turn
   ↓
[pre-finish hook]
   ↓
检查 Goal 是否设置（未设置 → 放行）
   ↓
调用 Goal Verifier
   ├─ 准备：完整对话历史 + Goal 文本 + 工具执行摘要
   ├─ 调用 verifier（独立 model call）
   └─ 解析 verdict（satisfied / unsatisfied / impossible）
   ↓
verdict 路由：
├─ satisfied → 放行
├─ unsatisfied → 把 gaps 列表塞回对话，强制 Agent 继续
└─ impossible → 弹 GUI 提示让用户决策（继续 / 放弃 / 修改 Goal）
```

#### 5.2.3 Verifier 提示词模板

```
你是一个任务完成度验证器。任务背景是对话历史，用户的 Goal 如下：

<goal>
{goalText}
</goal>

请独立判断：
1. 这个 Goal 是否已经真正满足？
2. 如果未满足，列出具体的差距（gaps）
3. 是否存在不可能完成的情况（例如环境问题、依赖缺失）？

输出格式（严格 JSON）：
{
  "status": "satisfied" | "unsatisfied" | "impossible",
  "reasoning": "200 字以内的判断依据",
  "gaps": ["差距 1", "差距 2"],
  "confidence": 0.0 到 1.0
}

注意：你不能修改对话历史，不能执行工具，只能基于已有信息判断。
```

#### 5.2.4 误拦处理

- MiMo 数据：误拦率 < 0.5%，且 70%+ 误拦源于"环境问题导致测试失败"
- 我们的处理：
  - `confidence < 0.6` 时不阻塞，只在 GUI 顶部弹黄条提示
  - `confidence >= 0.6` 且 `unsatisfied` 时阻塞，把 gaps 喂给 Agent
  - `confidence >= 0.9` 且 `impossible` 时弹"建议终止"对话框

#### 5.2.5 Goal 模板（中文）

```javascript
const GOAL_TEMPLATES = [
  { id: 'tests-pass', label: '🧪 所有测试通过', text: '所有相关测试均已通过且无回归' },
  { id: 'test-and-commit', label: '✅ 测试通过 + 已提交', text: '所有测试通过且代码已 git commit' },
  { id: 'pr-created', label: '🔀 PR 已创建', text: '已在 GitHub 创建 Pull Request 并填写描述' },
  { id: 'user-confirm', label: '👍 用户确认', text: '用户已明确表示满意并确认任务完成' },
  { id: 'no-lint-error', label: '🔍 无 lint 错误', text: 'npm run lint 0 错误 0 警告' },
  { id: 'doc-updated', label: '📚 文档已更新', text: '相关文档（README / CLAUDE.md）已同步更新' },
];
```

#### 5.2.6 GUI 组件

**GoalBar.js**（主面板顶部，输入栏 + 模板下拉 + 状态徽章）

```
┌─ 🎯 Goal ─────────────────────────────────┐
│ [所有测试通过且代码已提交        ] [模板▼] │
│ 状态: 🟡 验证中 (第 2 次)  历史: 3/5 满足 │
└──────────────────────────────────────────┘
```

#### 5.2.7 验收标准

- [ ] 设置 Goal 后，Agent 宣称完成时自动触发验证
- [ ] 验证为 unsatisfied 时 Agent 被强制继续，能看到具体 gaps
- [ ] 验证为 impossible 时 GUI 弹确认对话框
- [ ] verifier 失败（API 超时）时降级到不验证，不阻塞
- [ ] 同一 session 内多次完成能正确累计 history

---

## 6. P1 方案详解

### 6.1 Max Mode 并行采样开关

#### 6.1.1 目标

在用户做出"关键决策"时（如架构设计、关键 bug 修复），让 Agent 一次性生成 N 个候选方案，由同一模型做 judge 选最优。

#### 6.1.2 触发方式（**仅手动**）

- 设置面板 toggle："Max Mode（5 路采样，~5x token）"
- 不做自动触发（成本太高）
- 提示文案中文："长任务或关键决策时手动打开，token 消耗会显著增加"

#### 6.1.3 实现步骤

```javascript
// 伪代码（实际编码走 Claude Code）
async function maxModeCall(messages, tools, N = 5) {
  // 1. 并行发起 N 个独立采样
  const candidates = await Promise.all(
    Array(N).fill(0).map(() => apiClient.callClaude({
      messages,
      tools,
      temperature: 1.0,    // 高温度保证多样性
    }))
  );

  // 2. 准备 judge 输入
  const judgePrompt = buildJudgePrompt(candidates);

  // 3. judge 选最优
  const verdict = await apiClient.callClaude({
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.0,        // 低温度保证一致性
  });

  return {
    chosen: candidates[verdict.chosenIndex],
    allCandidates: candidates,
    judgeReasoning: verdict.reasoning,
    totalTokens: candidates.reduce((s, c) => s + c.usage.total, 0) + verdict.usage.total,
  };
}
```

#### 6.1.4 Judge 提示词模板

```
你是方案评审员。下面是 {N} 个独立的候选方案，它们都试图解决同一任务：

<task>
{originalUserTask}
</task>

<history>
{fullConversationHistory}
</history>

<candidates>
{candidateJson}  // N 个方案的结构化文本
</candidates>

请评估每个方案：
1. 推理过程是否合理
2. 工具调用计划是否最优
3. 是否考虑了边界情况
4. 风险评估

选择最佳方案（输出 chosen_index: 0 到 N-1）和理由（200 字内）。
如果多个方案收敛到同一方向，提升 confidence。
```

#### 6.1.5 状态栏展示

**MaxModeToggle.js**（主面板底部状态栏）

```
[🔀 Max Mode: OFF] [5 路采样消耗 0 token] [本轮节省决策: 0]
```

开启时变橙色 `🔀 Max Mode: ON (5x)`。

#### 6.1.6 验收标准

- [ ] 开启后每轮 API 调用都走 N 路并发
- [ ] judge 选出的方案在下一轮被实际执行
- [ ] 状态栏实时显示 token 消耗
- [ ] 关闭后立即降级到单次采样
- [ ] N 超过 maxN 时硬截断

---

### 6.2 Cycle 提早提取 + Writer subagent

#### 6.2.1 目标

长任务（> 30 轮）中，**在 20% / 45% / 70% 三个检查点**主动触发结构化提取，避免"lost in the middle"。

#### 6.2.2 触发判断（cycle/monitor.js）

每轮 post-turn hook 中：
```javascript
const ratio = (usedTokens + estimateNextTurnTokens) / maxTokens;
if (ratio >= 0.70 && !this.triggeredAt70) {
  scheduleCheckpoint('ratio-70');
} else if (ratio >= 0.45 && !this.triggeredAt45) {
  scheduleCheckpoint('ratio-45');
} else if (ratio >= 0.20 && !this.triggeredAt20) {
  scheduleCheckpoint('ratio-20');
}
```

**为什么是 20/45/70 而不是接近上限？**
- 引用 MiMo 论据：模型在高利用率下能力衰减（lost in the middle）
- 提取本身需要 token 空间，95% 利用率无处思考，30% 游刃有余
- 增量更新：每次触发都是对前一次的合并，最后一次 rebuild 才是"变现"

#### 6.2.3 Writer 调度（cycle/checkpoint.js）

```
post-turn hook
   ↓
满足触发条件
   ↓
派发 Writer subagent（在独立 Promise，不阻塞主对话）
   ↓
Writer 读取：
  - session/{id}.md（旧 checkpoint，如存在）
  - session/{id}.notes.md（用户 scratchpad）
  - 当前对话历史
  - project/{hash}.md（项目背景）
   ↓
Writer 调一次 API，输出 11 字段结构化 JSON
   ↓
memory/store.js 写入 session/{id}.md
   ↓
清空 session/{id}.notes.md
   ↓
通知 GUI 更新 CycleIndicator
```

#### 6.2.4 Writer 提示词

```
你是状态提取器。当前 Agent 正在执行一个长任务，你需要把目前的状态压缩成结构化记录。

<previous_checkpoint>
{oldSessionMd}
</previous_checkpoint>

<conversation_history>
{recentMessages}
</conversation_history>

<user_notes>
{notesMd}
</user_notes>

请输出 11 个字段的结构化 JSON（见 schema），注意：
1. 这是增量更新，不是从零写
2. 已完成的任务在任务树里打勾，不要重复
3. 错误与修复只保留仍未解决的
4. 涉及文件要列出绝对路径
5. 设计决策保留已经达成共识的
6. confidence 0-1 表示对当前任务完成度的估计
```

#### 6.2.5 Rebuild 触发与注入

当 `ratio >= 0.95` 触发 rebuild：
1. 切断当前窗口
2. 读取 `session/{id}.md` 全文
3. 读取 `project/{hash}.md` 全文
4. 读取 `global.md` 全文
5. 注入顺序（每个分段有独立 token 上限）：
   ```
   [任务清单（最近一次 checkpoint）]    ≤ 4K
   [Session checkpoint 主体]            ≤ 20K
   [用户原话切片（最近 3 轮）]           ≤ 4K
   [Project 记忆]                       ≤ 10K
   [Global 记忆]                        ≤ 4K
   [notes.md]                           ≤ 2K
   [memory 路径索引（可按需读取）]        ≤ 1K
   [tail reminder]                      ≤ 0.5K
   ```
   **总计 ≤ ~65K token**
6. 开启新窗口，主 Agent "醒来"时状态已摆在面前

#### 6.2.6 GUI 组件

**CycleIndicator.js**（主面板顶部小指示）

```
[📝 Checkpoint 2/3]  [20%✓ 45%✓ 70% 进行中]
```

手动触发按钮隐藏在"..."菜单里：`📝 立即做一次 checkpoint`。

#### 6.2.7 验收标准

- [ ] 长任务在 20/45/70% 自动触发 Writer
- [ ] Writer 不阻塞主对话
- [ ] rebuild 后 Agent 能在新窗口继续工作，目标不丢失
- [ ] 注入总量 ≤ 65K token
- [ ] Writer 失败时降级到"不做 checkpoint"，不阻塞主对话

---

## 7. P2 方案详解

### 7.1 notes.md scratchpad

#### 7.1.1 目标

用户能在 GUI 底部小窗随手记笔记，Agent 在下次 checkpoint 时自动读取并归并到结构化字段。

#### 7.1.2 实现

- **NotesEditor.js**（主面板底部可折叠）
- 每条笔记追加写入 `session/{id}.notes.md`
- Writer 在 checkpoint 时读取、按内容路由到对应字段（如 "package.json" → 工作约束 / "第 45 行 bug" → 错误与修复）、然后清空
- 路由规则失败（无法归类）的内容保留到下个 checkpoint

#### 7.1.3 验收标准

- [ ] 用户能随时追加笔记
- [ ] checkpoint 后 notes 被正确归并
- [ ] 归类失败的内容不丢失

---

### 7.2 Dream / Distill 记忆整理

#### 7.2.1 目标

项目记忆随时间增长后会出现过时、重复、无效路径，需要定期整理。

#### 7.2.2 Dream（7 天）

- 独立 Agent 读取近 7 天的 session checkpoint + 现有 Project 记忆
- 执行：合并相似条目 / 删除过时条目 / 验证文件路径有效性 / 压缩冗长表述
- 输出：更新后的 `project/{hash}.md` 和全局 `global.md`
- GUI 进度条 + 完成后弹"整理完成，合并 X / 删除 Y / 新增 Z"提示

#### 7.2.3 Distill（30 天）

- 独立 Agent 读取近 30 天的 session 历史
- 关注流程而非知识：识别反复出现的工作模式（如"先读 README → npm test → 修复 → 重跑"）
- 输出建议：固化为 skill / CLI 命令 / 自定义 Agent / SOP 文档
- GUI 弹"工作流优化建议"卡片，用户可接受 / 拒绝 / 修改

#### 7.2.4 触发方式

- 启动时检查 `last_dream_at` / `last_distill_at`
- 超过间隔天数时弹"建议整理"提示（不强制）
- 用户可在设置面板关闭自动提醒
- 提供"立即整理"按钮（手动触发）

#### 7.2.5 验收标准

- [ ] 7/30 天周期到时弹建议
- [ ] 手动按钮立即触发
- [ ] 整理过程有进度反馈
- [ ] 失败时不破坏现有记忆文件（先备份再改）

---

## 8. 新增工具定义

在 `src/main/tools.js` 中追加 4 个工具，让 Agent 能主动操作记忆系统。

### 8.1 memory_recall

**用途**：按关键词搜索 history 轨迹，弥补结构化记忆的"漏召回"。

**input_schema**:
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "搜索关键词，支持空格分隔的多关键词" },
    "scope": { "type": "enum", "enum": ["current_session", "all_sessions", "this_project"], "default": "current_session" },
    "limit": { "type": "number", "default": 5, "description": "返回条数上限" },
    "include_tool_outputs": { "type": "boolean", "default": false }
  },
  "required": ["query"]
}
```

**handler**（在 tool-executor.js）: 转 SQL 查询 `messages` 表，返回结构化 JSON。

### 8.2 memory_write

**用途**：让 Agent 显式写一条记忆（受权限约束）。

**input_schema**:
```json
{
  "type": "object",
  "properties": {
    "layer": { "type": "enum", "enum": ["session", "project", "global"], "description": "目标层" },
    "section": { "type": "string", "description": "对应 §4.1 的字段名（session）或 §4.2 的小节名（project）" },
    "content": { "type": "string", "description": "要追加的内容" },
    "reason": { "type": "string", "description": "为什么要写这条（用于审计）" }
  },
  "required": ["layer", "section", "content", "reason"]
}
```

**handler**: 校验权限（agent 只能写 session 层的 notes.md，project/global 需走 Writer/Dream subagent），越权返回错误。

### 8.3 goal_set

**用途**：用户在对话中临时设 Goal（也可在 GUI 设置）。

**input_schema**:
```json
{
  "type": "object",
  "properties": {
    "text": { "type": "string", "description": "自然语言描述的完成条件" },
    "template_id": { "type": "string", "description": "可选，使用模板" }
  },
  "required": ["text"]
}
```

**handler**: 写入 `goal/{projectHash}.json`，更新 GUI 状态。

### 8.4 goal_status

**用途**：Agent 主动查询当前 Goal 状态。

**input_schema**:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**handler**: 读取 `goal/{projectHash}.json` 返回当前 Goal + 最近 5 次验证历史。

---

## 9. 配置项

### 9.1 electron-store schema 扩展

```javascript
{
  // 现有配置...
  longTask: {
    enabled: true,
    memory: {
      enableSession: true,
      enableProject: true,
      enableGlobal: true,
      enableHistory: true,
      writerModel: null,            // null = 跟主模型
      checkpointRatios: [0.20, 0.45, 0.70],
      rebuildTokenBudget: 65000,
      promotionThreshold: 3
    },
    goal: {
      enabled: true,
      verifierModel: null,
      maxRetries: 3,
      stuckThreshold: 5
    },
    maxMode: {
      defaultEnabled: false,
      defaultN: 5,
      maxN: 10,
      tokenBudgetMultiplier: 5
    },
    cycle: {
      enableLongTaskDetection: true,
      longTaskThresholdTurns: 30
    },
    dream: {
      enabled: true,
      intervalDays: 7,
      lastRunAt: null
    },
    distill: {
      enabled: true,
      intervalDays: 30,
      lastRunAt: null
    }
  }
}
```

### 9.2 用户可见的设置项

设置面板新增一个 Tab "🧠 长程任务"：

| 项 | 默认 | 说明 |
|----|------|------|
| 启用长程任务模块 | ✅ | 总开关 |
| Goal 验证 | ✅ | 防 Agent 偷懒 |
| 自动 Cycle 提取 | ✅ | 长任务自动 checkpoint |
| 记忆提升阈值 | 3 次 | session 出现 N 次才提升到 project |
| Max Mode 默认 N | 5 | 并行采样数（1-10）|
| Dream 间隔 | 7 天 | 项目记忆整理 |
| Distill 间隔 | 30 天 | 流程固化 |

---

## 10. 优先级路线图

| 版本 | 内容 | 预计工程量 | 验收方式 |
|------|------|------------|----------|
| **v0.4** | Goal 独立验证 + notes.md + 四层记忆目录 + MemoryPanel UI | 1-2 天 | 真人在 cc-wrap 跑 50 轮任务，验证 Goal 拦截有效 |
| **v0.5** | Max Mode 开关 + 记忆 GUI 面板（编辑/删除）+ Dream 触发 | 2-3 天 | 关键决策时开启 Max Mode，对比单次采样质量 |
| **v0.6** | Cycle 提早提取 + Writer subagent + Rebuild 注入 | 3-5 天 | 200 轮以上任务跑通，状态不丢失 |

每个版本单独可发，**v0.4 就能形成明显差异化**。

---

## 11. 风险与取舍

### 11.1 技术风险

| 风险 | 概率 | 应对 |
|------|------|------|
| Writer subagent 增加 API 成本 | 高 | 增量 checkpoint，不做"总结式"提取；用低温度减少重试 |
| 注入 65K token 在小窗口模型下超额 | 中 | 检测模型 context window 自动降级预算 |
| Markdown 文件并发写损坏 | 低 | single-writer 约束 + 写前 .bak 备份 |
| Max Mode judge 选出最差方案 | 中 | 在 GUI 暴露所有候选，让用户有手动 override 入口（v0.6+） |
| Goal 误拦导致 Agent 死循环 | 中 | stuckThreshold 机制：连续 N 次 unsatisfied 自动降级放行 |

### 11.2 产品取舍

| 取舍 | 决策 | 理由 |
|------|------|------|
| 记忆用 Markdown vs 向量库 | Markdown | 可审查优先，中文开发者可直接用文本编辑器改 |
| Writer subagent vs 主 Agent 自维护 | 独立 subagent | 注意力冲突，主 Agent 边修 bug 边写笔记两件事都做差 |
| Max Mode 默认关闭 | 关闭 | 成本敏感，4-5x token 不能默认开 |
| Goal 误拦 vs 漏放 | 倾向误拦 | MiMo 数据误拦 < 0.5%，且环境问题误拦是"合理的"——提醒用户介入 |
| Dynamic Workflow | 不做 | 与 cc-wrap 轻量定位冲突，工程量爆炸 |
| 受限 shell 语法 | 不做 | 牵涉 Claude Code 协议层 |

### 11.3 与 Claude Code 升级的兼容性

- 所有新增功能通过 hook 介入，**不修改 Claude Code 自身**
- Claude Code 升级时只需检查 hook 触发点是否变更
- 工具定义（§8）按 Anthropic 工具协议，可被 Claude Code 原生识别

---

## 12. 验收总览

### 12.1 功能验收

- [ ] v0.4: 用户设 Goal 后 Agent 偷懒完成会被拦截
- [ ] v0.4: 用户在 GUI 能查看和编辑四层记忆
- [ ] v0.5: Max Mode 开启后状态栏显示 token 倍数
- [ ] v0.6: 200 轮以上任务中途窗口被切时 Agent 能继续工作
- [ ] v0.6: Cycle 触发时不阻塞主对话
- [ ] P2: notes.md 在 checkpoint 后被归并到正确字段

### 12.2 性能验收

- [ ] 主对话因 Writer 调用的延迟增加 ≤ 200ms（异步）
- [ ] MemoryPanel 加载 ≤ 100ms
- [ ] Goal 验证一轮 ≤ 3s
- [ ] Max Mode 一轮 ≤ 10s（5 路并发）

### 12.3 稳定性验收

- [ ] Writer API 超时时降级到"不做 checkpoint"
- [ ] Goal verifier 超时时降级到"不验证"
- [ ] Markdown 文件损坏时从 .bak 恢复
- [ ] SQLite history db 损坏时新建 db 并提示

### 12.4 用户体验验收（中文优先）

- [ ] 所有提示、模板、文档中文
- [ ] 错误信息中文且给具体修复建议
- [ ] 设置项 tooltip 中文

---

## 13. 实现提示（给编码 Agent）

### 13.1 推荐实现顺序

1. **先做数据层**（§4 所有 schema + 文件读写）
2. **再做 hooks**（§3.2 数据流图）
3. **再做工具**（§8 四个新工具）
4. **最后做 UI**（MemoryPanel / GoalBar / MaxModeToggle / CycleIndicator）
5. **最后做提早提取**（Cycle / Writer，因为依赖前面所有）

### 13.2 关键依赖

- 复用 `src/main/agent-loop.js` 的现有 turn 处理流程
- 复用 `src/main/api-client.js` 的 `callClaude` 方法（抽出公共方法供 subagent 复用）
- 复用 `src/main/logger.js` 的日志接口
- 新增依赖：仅 `electron-store`（已有）

### 13.3 单元测试要点

- `memory/store.js` 的 single-writer 权限校验
- `goal/verifier.js` 的 verdict 解析
- `max-mode/judge.js` 的索引选择
- `cycle/checkpoint.js` 的触发判断
- `cycle/injector.js` 的 token 预算控制

### 13.4 集成测试要点

- 完整跑 50 轮任务，验证 Goal 拦截
- 模拟窗口接近上限，验证 rebuild
- 模拟 Writer 失败，验证降级

### 13.5 调试开关

- 环境变量 `CCWRAP_LONG_TASK_DEBUG=1` 启用详细日志
- GUI 隐藏入口：Cmd/Ctrl+Shift+L 打开"长程任务调试面板"

---

## 14. 附录

### 14.1 相关文件路径速查

| 用途 | 路径 |
|------|------|
| 模块主目录（新增） | `src/main/long-task/` |
| 用户数据目录 | `app.getPath('userData')` |
| Session checkpoint | `{userData}/memory/session/{sessionId}.md` |
| Project 记忆 | `{userData}/memory/project/{projectHash}.md` |
| Global 记忆 | `{userData}/memory/global.md` |
| History 轨迹 | `{userData}/memory/history/history.db` |
| Goal 配置 | `{userData}/memory/goal/{projectHash}.json` |
| 模块配置 | `electron-store: longTask.*` |
| Renderer 组件 | `src/renderer/long-task/` |
| IPC 通道 | `src/preload.js: long-task:*` |

### 14.2 借鉴源参考

- [MiMo Code 博客原文](https://mimo.xiaomi.com/zh/blog/mimo-code-long-horizon)
- 关键设计：Cycle / 提早提取 / Writer subagent / 四层记忆 / Goal 验证

### 14.3 文档维护

- 本文件与 `computer-use-development.md` 同级
- 实现过程中如发现设计偏差，在文末追加 "**修订记录**" 章节
- 重大设计变更需更新到 `CLAUDE.md` 的 "AI 协作规范" 段落

---

**修订记录**

| 日期 | 版本 | 修订内容 | 作者 |
|------|------|----------|------|
| 2026-06-11 | v1.0 | 初版起草，参考 MiMo Code 2026-06-10 博客 | jikexian（AI 协作） |
