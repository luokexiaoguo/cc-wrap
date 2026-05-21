[English](README.en.md)

# cc-wrap — Claude Code 中文桌面端

一款面向中文开发者的 Electron 桌面应用，把 Claude Code CLI 的核心能力搬进图形界面 — 中文优先、第三方模型接入零门槛、UI 暖调质感。当前提供 Windows NSIS 安装包。

![界面截图](./screenshots/interface.jpg)

## 这个项目做什么

Claude Code 官方桌面端有两个痛点：中文支持不完善、第三方模型配置复杂。cc-wrap 同时解决了这两个问题，并把 Claude Code CLI 的核心能力（Agent 循环、工具调用、MCP 扩展、记忆/Skills）搬到 GUI，不熟悉命令行的开发者也能直接用上。

## 核心功能

| 功能 | 说明 |
|------|------|
| 🌐 中文界面 | 全中文 UI，14 条斜杠命令（`/help` `/clear` `/model` `/memory` `/mcp` `/skill` `/theme` `/export` `/init` `/cost` `/permissions` `/tools` `/workdir` `/compact`） |
| 📁 文件操作 | Read · Write · Edit · Glob · Grep，自动识别 UTF-8/UTF-16/GBK 编码，工作区文件树带右键菜单 |
| 🔨 Bash 命令 | `spawn` 非阻塞执行，可中断，支持 cwd / shell / env 上下文 |
| 🌐 Web 工具 | WebSearch / WebFetch 内置，无需额外配置 |
| 🔧 模型切换 | 顶部下拉直选，**Anthropic / OpenAI 双格式自动识别**，主流第三方模型一行接入 |
| 🔌 MCP 扩展 | JSON-RPC over stdio 标准实现，弹窗内嵌真实可填示例（MiniMax / filesystem / 高德等） |
| 📋 Plan UI 任务面板 | 大任务自动拆解，进度可见（○ → ◐ → ✓），可手动勾选切换状态 |
| 💾 记忆系统 | 跨对话沉淀偏好/项目背景，自动 + 手动两种来源 |
| 🧩 Skills 模板 | 自定义提示词模板，按需注入 System Prompt |
| 🖼️ 图片识别 | 粘贴 / 拖拽即用，自动落盘以便 MCP 工具读取，非视觉模型自动剥离图片避免 400 |
| ✨ Markdown 富文本 | 表格、列表、引用、代码块（highlight.js 覆盖 190+ 语言）、Serif 衬线标题 |
| 🎨 暖调主题 | Claude 官网风格，明暗双主题，字体大小可调（12-20px） |
| 📡 流式输出 | 实时看到 Agent 执行过程，工具调用增量 DOM，"思考中"状态可见 |
| 🛡️ 权限管理 | Write / Edit / Bash 弹窗确认，「始终允许」选择持久化 |
| 🔄 失败重试 | API 调用失败时消息标红 + 一键重试按钮 |
| ⚙️ 自定义 System Prompt | 设置里直接编辑额外指令，下次对话即生效 |
| ⌨️ 自定义标题栏 | 无边框 + 拖拽移动 + 托盘常驻，窗口位置/大小自动记忆 |

## 支持的模型

理论上所有兼容以下格式的 API 都支持：

- **Anthropic 格式**：`/v1/messages`，流式 SSE
- **OpenAI 格式**：`/v1/chat/completions`，流式 chunks（含 `tool_calls`）

已实测可接入：Claude 系列、DeepSeek 系列、Qwen / Qwen-VL 系列、MiniMax / MiniMax-VL、GLM-4v、Step-1v 等。

## 快速开始

```bash
git clone <repo>
cd claude-desktop
npm install
npm start             # 开发模式
npm run build         # 打包 Windows NSIS 安装包到 dist/
```

## 技术架构

```
┌──────────────────┐     ┌──────────────────┐
│   Renderer       │     │    Main Process  │
│   (Chromium)     │◄────│   (Node.js)      │
│                  │ IPC │                  │
│  - Chat UI       │     │  - Agent Loop    │
│  - File Tree     │     │  - API Client    │
│  - Editor        │     │  - Tool Executor │
│  - Task Panel    │     │  - MCP Client    │
└──────────────────┘     └──────────────────┘
         ▲                        ▲
         │               ┌────────┴────────┐
         └──────────────►│   preload.js    │
              contextBridge (白名单 IPC + 安全隔离)
```

- **Main**：窗口管理、Agent 循环（最多 50 轮、~150K token 自动压缩）、API 客户端（Anthropic/OpenAI 双格式 + 视觉模型识别）、工具执行器、MCP 客户端
- **Renderer**：Chat UI、文件树、设置面板、记忆管理、任务面板、文件编辑器（含图片预览）
- **Preload**：`contextBridge` 白名单隔离，所有 IPC 通道显式注册、不在白名单的请求直接拒绝。highlight.js 通过 preload 暴露给渲染端

## 数据存储

所有用户数据保存在 `%APPDATA%/cc-wrap/`（Windows）：

- `config.json` — 配置（API key 通过 Electron `safeStorage` 加密）
- `conversations.json` — 对话历史（原子写 + 防抖 + 完成时立即落盘）
- `memory.json` / `skills.json` / `mcp-servers.json` — 各模块独立 JSON
- `pasted-images/` — 粘贴图片自动落盘目录

---

> ⭐ 觉得有帮助欢迎 Star。Issue 和 PR 一并欢迎。
