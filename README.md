[English](README.en.md)

# cc-wrap — Claude Code 桌面端

> 可视化的 AI Agent 工作台 · 开源 · 多模型 · MCP 生态

cc-wrap 是 [Claude Code](https://claude.ai/code) 的桌面封装，将官方 CLI 的 Agent 循环引擎与图形界面合二为一。不再受限于终端命令，通过窗口化的方式完成文件读写、命令执行、代码搜索、工具扩展等全部操作。

![界面截图](./screenshots/interface.jpg)

---

## 核心亮点

### 🤖 真正的 Agent 循环，不只是聊天

AI 自主决定调用哪些工具，多轮协作完成任务。

- 发一个需求，AI 自主调 Read / Write / Edit / Bash / Glob / Grep… 直到完成
- 流式输出实时展示每步思考与操作
- 自动上下文压缩（>150K tokens 时摘要旧对话）
- 卡住检测：连续失败自动提示模型换策略，避免死循环
- 工具结果截断：>3000 字符自动截断，防止撑爆上下文

### 🌐 多模型自由切换

支持主流大模型，无需切换客户端：

| 模型 | 协议 |
|------|------|
| Claude (Opus / Sonnet / Haiku) | Anthropic Messages API |
| GPT-4o / GPT-4 | OpenAI Chat API |
| DeepSeek (Chat / Reasoner) | OpenAI 兼容 |
| 通义千问 (Qwen) | OpenAI 兼容 |
| MiniMax | OpenAI 兼容 |
| GLM-4v / Step-1v 等 | OpenAI 兼容 |

双协议自动识别：Anthropic 格式走 `/v1/messages` SSE，OpenAI 格式走 `/v1/chat/completions` 流式。非视觉模型自动剥离图片，避免 400 错误。

### 🔌 MCP 生态即插即用

支持 [Model Context Protocol](https://modelcontextprotocol.io/) 两种传输模式：

- **stdio** — 本地 MCP 服务器（Node.js / Python），子进程通信
- **HTTP/SSE** — 远程 MCP 服务（如 Tavily Search），贴 URL 即连，自动检测 Streamable HTTP / POST-only 模式

社区已有几十个现成 MCP 服务器：Tavily 搜索、MiniMax 视觉、文件系统、数据库、高德地图等。

### 💻 集成终端面板

`` Ctrl+` `` 弹出，`node-pty` + `xterm.js`，体验对标 VS Code：

- 真正的 PTY 进程（cmd.exe / PowerShell）
- 拖拽调整高度，关闭再打开进程保持
- 跑 git、装包、查日志，无需离开窗口

### 📋 任务面板

AI 自动将复杂需求拆解为子任务，面板实时显示进度。

- 完成 / 进行中 / 待处理状态一目了然
- 点击切换任务状态，可手动干预
- 多轮复杂任务也能清晰追踪

### 🧠 记忆系统

AI 自动沉淀关键信息，跨对话持久化。

- 技术栈、偏好、项目背景自动提取
- 手动添加 / 管理 / 删除记忆
- 每次对话自动注入，无需重复描述

### 🎯 Skills 扩展

将领域知识注入 System Prompt，让 AI 更懂你的场景。

- 自定义 Skill（名称 + 描述 + 提示词 + 触发关键词）
- 始终激活或关键词自动触发
- 内置 Skill 管理器，支持第三方 Skill 导入
- 支持 vendor onboarding 自动注册流程

---

## 完整功能列表

| 功能 | 说明 |
|------|------|
| Agent 循环 | 多轮工具调用、流式输出、自动压缩、卡住检测 |
| 文件操作 | Read / Write / Edit / Glob / Grep，自动编码识别（UTF-8 / GBK / UTF-16） |
| Bash 执行 | 非阻塞 spawn，支持取消、超时、自定义 cwd/shell/环境变量 |
| 多模型 | Anthropic + OpenAI 双协议，视觉模型自动识别 |
| MCP 集成 | stdio + HTTP/SSE 双模式，自动重连，中文配置示例 |
| 集成终端 | Ctrl+` 切换，node-pty 真终端，可拖拽面板 |
| 任务面板 | 自动任务拆解，进度追踪，手动干预 |
| 记忆系统 | 自动提取 + 手动管理，跨对话持久化 |
| Skills | 自定义提示词注入，关键词 / 始终两种激活模式 |
| 文件编辑器 | 语法高亮、行号、查找替换、Markdown 预览、文件树 |
| 图片识别 | 粘贴 / 拖拽自动落盘，视觉模型 / MCP 工具双路径 |
| 双主题 | Claude 暖调深色 + 柔米色浅色，字体大小可调 |
| 中英文双语 | 界面语言即时切换 |
| Token 统计 | 每条消息 ↑↓ 显示，`/cost` 查看全部对话明细 |
| 权限管理 | Write / Edit / Bash 弹窗确认，支持「始终允许」持久化 |
| 系统托盘 | 关闭最小化，右键菜单新建 / 设置 / 显示 / 隐藏 |
| 日志查看 | 内置日志面板，支持搜索、清除、导出，5MB 自动轮转 |
| 对话管理 | 新建、切换、删除、导出 Markdown |
| 斜杠命令 | `/help` `/clear` `/model` `/memory` `/mcp` `/skill` `/theme` `/export` `/cost` 等 |
| 快捷键 | `Ctrl+P` 打开文件、`Ctrl+S` 保存、`Esc` 停止生成、`Ctrl+`` 终端、`Ctrl+Shift+E` 导出 |
| 缓存清理 | 一键清理粘贴图片、对话历史、日志等 |
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
┌───────────────┐      IPC (contextBridge)       ┌──────────────────┐
│  Main Process  │ ◄────────────────────────────► │ Renderer Process │
│  (Node.js)     │      preload.js 白名单通道      │ (Chromium)       │
│                │                                │                  │
│  ├─ main.js    │                                │  ├─ app.js       │
│  ├─ agent-loop │   terminal-output (push)       │  ├─ index.html   │
│  ├─ api-client │   terminal-write (invoke)      │  ├─ main.css     │
│  ├─ tools.js   │   terminal-spawn (invoke)      │  └─ xterm.js     │
│  ├─ tool-exec  │   agent-stream-text (push)     │                  │
│  ├─ mcp-client │   agent-permission (push)      │  终端面板         │
│  ├─ system-prom│   ...                          │  └─ xterm.js     │
│  ├─ logger.js  │                                │                  │
│  └─ node-pty   │                                │                  │
└───────────────┘                                └──────────────────┘
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
| `mcp-servers.json` | `%APPDATA%/cc-wrap/` |
| `logs/app.log` | `%APPDATA%/cc-wrap/` |
| `pasted-images/` | `%APPDATA%/cc-wrap/` |

---

## 缺点

1. **需要 API Key** — 非开箱即用，需自备 Claude / GPT 等 API 额度
2. **早期项目** — v1.1.0，边缘场景可能不够完善
3. **技术门槛** — 面向开发者，需理解 API / 模型 / MCP 等概念
4. **模型差异** — Claude Agent 能力最强，其他模型的工具调用稳定性略低
5. **本地单机** — 无云端同步、无团队协作

---

## 开发

```bash
npm start          # 开发模式
npm run build      # 打包
npm run rebuild    # 重新编译原生模块
```

无自动化测试，冒烟测试通过 `npm start` 后手动验证。

---

## 许可证

MIT

> ⭐ 觉得有帮助欢迎 Star。Issue 和 PR 一并欢迎。
