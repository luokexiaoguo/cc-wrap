[English](README.en.md)

# cc-wrap — AI Agent 桌面工作台

> 开源 · 多模型 · MCP 生态 · 为国人打造

cc-wrap 是 [Claude Code](https://claude.ai/code) 的桌面封装，将 Agent 循环引擎与图形界面合二为一。不再受限于终端命令，通过窗口化的方式完成文件读写、命令执行、代码搜索、工具扩展等全部操作。

**面向国内用户深度优化**：原生支持 DeepSeek V4、Qwen3.6、Kimi K2.6、Doubao、GLM-5.1 等国产模型，思考级别参数自动适配，开箱即用。

![界面截图](./screenshots/interface.jpg)

---

## 核心优势

### 🧠 思考级别一键调节，自动适配 13+ 种模型

每个模型的"思考"参数格式都不一样——有的用 `reasoning_effort`，有的用 `enable_thinking`，有的用 `thinking.type`。cc-wrap 自动识别模型名称，注入正确的参数格式：

| 模型 | 参数格式 |
|------|---------|
| Claude (Opus / Sonnet / Haiku) | `thinking.type` + `budget_tokens` |
| OpenAI o-series / GPT-5 | `reasoning_effort` |
| DeepSeek V4+ | `thinking.type` |
| DeepSeek V3 | `enable_thinking` |
| Qwen3 / QwQ | `enable_thinking` |
| Kimi K2.6 | `thinking.type` |
| Doubao (豆包) | `thinking.type` + `budget_tokens` |
| Gemini 2.5 | `thinkingConfig.thinkingBudget` |
| Gemini 3.x | `thinkingConfig.thinkingLevel` |
| GLM-5.1 / MiMo | 始终推理，自动跳过 |

用户只需选择"关闭 / 低 / 中 / 高"，无需关心底层参数差异。

### 🤖 真正的 Agent 循环，不只是聊天

AI 自主决定调用哪些工具，多轮协作完成任务。

- 发一个需求，AI 自主调 Read / Write / Edit / Bash / Glob / Grep… 直到完成
- 流式输出实时展示每步思考与操作
- 模型感知的上下文压缩（DeepSeek 500K、Gemini 200K、Claude 120K、默认 80K）
- 卡住检测：连续失败自动提示模型换策略，避免死循环
- 工具结果智能截断，防止撑爆上下文
- **3 级消息队列**：now（立即处理）、next（下一轮）、later（后台任务）
- **Code Review 9 阶段**：三态验证（CONFIRMED/PLAUSIBLE/REFUTED）
- **Coordinator 多 Worker**：并行执行多个子任务

### 🌐 全球主流模型自由切换

支持国内外主流大模型，一个客户端搞定所有模型：

| 模型 | 协议 |
|------|------|
| Claude (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) | Anthropic Messages API |
| GPT-5.5 / GPT-5.4 / o3 / o4-mini | OpenAI Chat API |
| DeepSeek V4-Pro / V4-Flash / R1 | OpenAI 兼容 |
| Qwen3.6 / QwQ | OpenAI 兼容 |
| Kimi K2.6 | OpenAI 兼容 |
| Doubao-Seed-2.0 | OpenAI 兼容 |
| MiniMax M2.7 | OpenAI 兼容 |
| GLM-5.1 / GLM-Z1 | OpenAI 兼容 |
| Gemini 2.5 / 3.x | Google API |
| MiMo V2 | OpenAI 兼容 |

双协议自动识别：Anthropic 格式走 `/v1/messages` SSE，OpenAI 格式走 `/v1/chat/completions` 流式。非视觉模型自动剥离图片，避免 400 错误。

### 💡 工具调用智能展开

不是所有工具调用都需要看，但重要的不能错过：

- **AskUserQuestion** — 自动展开，只显示选项，隐藏原始代码
- **Write / Edit** — 完成后自动展开，显示文件变更
- **Agent 子任务** — 自动展开，显示进度
- **Read / Grep / Bash 等** — 保持折叠，界面清爽

### 🔌 MCP 生态即插即用

支持 [Model Context Protocol](https://modelcontextprotocol.io/) 两种传输模式：

- **stdio** — 本地 MCP 服务器（Node.js / Python），子进程通信
- **HTTP/SSE** — 远程 MCP 服务（如 Tavily Search），贴 URL 即连，自动检测 Streamable HTTP / POST-only 模式

一键安装 MCP 服务器，支持 npm / pip / uvx / http / stdio 五种安装方式。

**MCP 工具验证**：自动验证输入参数（必需参数、类型检查），防止调用失败。

### 💻 集成终端面板

`` Ctrl+` `` 弹出，`node-pty` + `xterm.js`，体验对标 VS Code：

- 真正的 PTY 进程（cmd.exe / PowerShell / Git Bash）
- 拖拽调整高度，关闭再打开进程保持
- 跑 git、装包、查日志，无需离开窗口

### 📋 任务面板

AI 自动将复杂需求拆解为子任务，面板实时显示进度。

- 完成 / 进行中 / 待处理状态一目了然
- 点击切换任务状态，可手动干预

### 🧠 记忆系统

AI 自动沉淀关键信息，跨对话持久化。

- 技术栈、偏好、项目背景自动提取
- 手动添加 / 管理 / 删除记忆
- 每次对话自动注入，无需重复描述

### 🎯 Skills 扩展

将领域知识注入 System Prompt，让 AI 更懂你的场景。

- 自定义 Skill（名称 + 描述 + 提示词 + 触发关键词）
- 始终激活或关键词自动触发
- vendor onboarding 一键安装：粘贴安装步骤，AI 自动执行并注册 Skill
- **5 秒缓存**：避免重复加载，保存后自动清除缓存

---

## 为什么选择 cc-wrap

| 对比维度 | cc-wrap | 终端 CLI | 网页版 |
|---------|---------|---------|-------|
| 多模型切换 | ✅ 13+ 种模型一键切换 | ❌ 仅 Claude | ❌ 仅单一模型 |
| 思考级别控制 | ✅ 自动适配各模型参数 | ❌ 无 | ⚠️ 有限 |
| 中文界面 | ✅ 原生中文 + 英文 | ❌ 英文终端 | ⚠️ 部分中文 |
| MCP 扩展 | ✅ 一键安装 | ⚠️ 手动配置 | ❌ 不支持 |
| 集成终端 | ✅ VS Code 风格 | ✅ 本身就是终端 | ❌ 无 |
| 文件编辑器 | ✅ 语法高亮 + 预览 | ❌ 依赖外部编辑器 | ⚠️ 有限 |
| 权限管理 | ✅ 可视化弹窗 | ⚠️ 命令行确认 | ✅ |
| 记忆持久化 | ✅ 自动 + 手动 | ❌ 无 | ⚠️ 有限 |
| 离线使用 | ✅ 本地运行 | ✅ | ❌ |
| 开源免费 | ✅ MIT | ✅ | ❌ |

---

## 完整功能列表

| 功能 | 说明 |
|------|------|
| Agent 循环 | 多轮工具调用、流式输出、模型感知压缩、卡住检测 |
| 3 级消息队列 | now（立即处理）、next（下一轮）、later（后台任务） |
| Code Review | 9 阶段审查，三态验证（CONFIRMED/PLAUSIBLE/REFUTED） |
| Coordinator | 多 Worker 并行执行，任务协调 |
| 思考级别 | 自动识别模型，注入对应 thinking/reasoning 参数，工具栏快捷切换 |
| 文件操作 | Read / Write / Edit / Glob / Grep，支持文本 / .docx / .pdf / .xlsx / .csv，自动编码识别 |
| Bash 执行 | 非阻塞 spawn，Git Bash / cmd 自动探测，支持取消、超时、危险命令拦截 |
| 多模型 | 13+ 种模型，Anthropic + OpenAI + Google 三协议，视觉模型自动识别 |
| MCP 集成 | stdio + HTTP/SSE 双模式，一键安装，自动重连，输入参数验证 |
| 集成终端 | Ctrl+` 切换，node-pty 真终端，可拖拽面板 |
| 智能展开 | AskUserQuestion / Write / Edit 自动展开，其他折叠 |
| 任务面板 | 自动任务拆解，进度追踪，状态机验证 |
| 记忆系统 | 自动提取 + 手动管理，跨对话持久化 |
| Skills | 自定义提示词注入，关键词 / 始终两种激活模式，5 秒缓存 |
| 文件编辑器 | 语法高亮、行号、查找替换、Markdown 预览、文件树 |
| 图片识别 | 粘贴 / 拖拽自动落盘，视觉模型 / MCP 工具双路径 |
| 双主题 | Claude 暖调深色 + 柔米色浅色，字体大小可调 |
| 中英文双语 | 界面语言即时切换（英语使用通用术语如 Base URL） |
| Token 统计 | 每条消息 ↑↓ 显示，`/cost` 查看全部对话明细，贡献热力图 |
| 权限管理 | Write / Edit / Bash 弹窗确认，支持「始终允许」持久化 |
| 系统托盘 | 关闭最小化，右键菜单新建 / 设置 / 显示 / 隐藏 |
| 日志查看 | 内置日志面板，支持搜索、清除、导出，5MB 自动轮转 |
| 对话管理 | 新建、切换、删除、导出 Markdown |
| 斜杠命令 | `/help` `/clear` `/model` `/memory` `/mcp` `/skill` `/theme` `/export` `/cost` 等 |
| 快捷键 | `Ctrl+P` 打开文件、`Ctrl+S` 保存、`Esc` 停止生成、`Ctrl+`` 终端 |
| 失败重试 | API 调用失败时消息标红 + 一键重试 |

---

## 安装

### 下载安装包

从 [Releases](https://github.com/luokexiaoguo/cc-wrap/releases) 下载最新版 `cc-wrap Setup X.Y.Z.exe`，双击安装。

### 从源码运行

```bash
git clone <repo>
cd cc-wrap
npm install
npm run rebuild    # 编译 node-pty 等原生模块
npm start          # 启动开发模式
npm run build      # 打包 NSIS 安装包到 dist/
```

---

## 配置

配置文件：`%APPDATA%/cc-wrap/config.json`

- API Key 通过 Electron `safeStorage` 加密存储
- 模型列表、主题、字体、语言、工作目录、最近项目
- 始终允许的工具列表、自定义系统提示词、环境变量注入

MCP 配置：`%APPDATA%/cc-wrap/mcp-servers.json`

---

## 架构

```
┌───────────────┐      IPC (contextBridge)       ┌──────────────────────┐
│  Main Process  │ ◄────────────────────────────► │ Renderer Process     │
│  (Node.js)     │      preload.js 白名单通道      │ (Chromium)           │
│                │                                │                      │
│  ├─ main.js    │                                │  ├─ app.js (核心)     │
│  ├─ agent-loop │   terminal-output (push)       │  ├─ editor.js        │
│  ├─ api-client │   terminal-write (invoke)      │  ├─ terminal.js      │
│  ├─ tools.js   │   terminal-spawn (invoke)      │  ├─ tasks.js         │
│  ├─ tool-exec  │   agent-stream-text (push)     │  ├─ memory.js        │
│  ├─ mcp-client │   agent-permission (push)      │  ├─ mcp.js           │
│  ├─ system-prom│   ...                          │  ├─ skills.js        │
│  ├─ task-queue │                                │  ├─ index.html       │
│  ├─ code-review│                                │  ├─ main.css         │
│  ├─ coordinator│                                │  └─ lib/xterm.js     │
│  ├─ logger.js  │                                │                      │
│  └─ node-pty   │                                │                      │
└───────────────┘                                └──────────────────────┘
```

**安全**：`nodeIntegration: false`, `contextIsolation: true`，IPC 通道白名单化，CSP `default-src 'self'`。

**技术栈**：Electron 28 + vanilla JavaScript（无前端框架）

---

## 数据存储

| 文件 | 路径 |
|------|------|
| `config.json` | `%APPDATA%/cc-wrap/` |
| `conversations.json` | `%APPDATA%/cc-wrap/` |
| `memory.json` | `%APPDATA%/cc-wrap/` |
| `skills.json` | `%APPDATA%/cc-wrap/` |
| `skills/<name>/SKILL.md` | `%APPDATA%/cc-wrap/skills/` |
| `mcp-servers.json` | `%APPDATA%/cc-wrap/` |
| `logs/app.log` | `%APPDATA%/cc-wrap/` |
| `pasted-images/` | `%APPDATA%/cc-wrap/` |

---

## 已知限制

1. **需要 API Key** — 非开箱即用，需自备模型 API 额度
2. **本地单机** — 无云端同步、无团队协作
3. **模型差异** — Claude Agent 能力最强，部分国产模型工具调用稳定性略低

---

## 开发

```bash
npm start          # 开发模式
npm run build      # 打包
npm run rebuild    # 重新编译原生模块
npm test           # 运行 Jest 单元测试
npm run lint       # ESLint 代码检查
npm run lint:fix   # 自动修复格式问题
```

---

## 许可证

MIT

> ⭐ 觉得有帮助欢迎 Star。Issue 和 PR 一并欢迎。
