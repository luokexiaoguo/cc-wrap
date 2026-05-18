[English](README.en.md)

# cc-wrap — Claude Code 中文桌面端

一款面向中文开发者的轻量级 Electron 桌面应用，完整移植 Claude Code CLI 核心能力，图形界面开箱即用，现已完美支持 Windows 和 macOS 双平台。

![界面截图](./screenshots/interface.jpg)

## 这个项目做什么

Claude Code 官方桌面端存在两个痛点：中文支持不完善、第三方模型配置复杂。cc-wrap 解决了这两个问题，让配置更简单、交互更友好。

同时将 Claude Code CLI 的核心能力带入图形界面，不熟悉命令行的开发者也能享受 AI 辅助编程的效率，同时提供中文本地化体验。

## 核心功能

| 功能 | 说明 |
|------|------|
| 🌐 中文界面 | 全中文 UI，斜杠命令带中文注释（`/help` `/clear` `/config` `/model` 等）|
| 📁 文件操作 | 读写、编辑、搜索、glob，支持工作区文件树 |
| 🔨 Bash 命令 | 执行系统命令，构建、测试、部署全支持 |
| 🌐 Web 搜索 | 内置 WebSearch / WebFetch，网络信息随手查 |
| 🔧 模型切换 | 下拉选择，支持 OpenAI / Anthropic 双格式，灵活接入任意第三方模型 |
| 🔌 MCP 扩展 | 连接 MCP 工具服务器，扩展 Agent 能力边界 |
| 💾 记忆系统 | 跨会话持久化，重要上下文不过期 |
| 🧩 Skills 模板 | 自定义提示词模板，一键注入 System Prompt |
| 📡 流式输出 | 实时看到 Agent 执行过程，透明可追溯 |
| 🖥️ 无头模式 | 命令行调用，融入现有开发工作流 |
| 🛡️ 权限管理 | Write/Edit/Bash 操作有原生弹窗确认，安全可控 |
| ⌨️ 自定义标题栏 | 窗口控制按钮，拖拽移动，托盘常驻 |

## 支持的模型

理论上所有兼容以下格式的 API 都支持：

- **Anthropic 格式**：`/v1/messages`，流式 SSE
- **OpenAI 格式**：`/v1/chat/completions`，流式 chunks

已实测可接入：Claude 系列、DeepSeek 系列、Qwen 系列、MiniMax 等主流模型。

## 技术架构

```
┌──────────────────┐     ┌──────────────────┐
│   Renderer       │     │    Main Process  │
│   (Chromium)     │◄────│   (Node.js)      │
│                  │ IPC │                  │
│  - Chat UI       │     │  - Agent Loop    │
│  - File Tree     │     │  - API Client    │
│  - Settings      │     │  - Tool Executor │
│                  │     │  - MCP Client    │
└──────────────────┘     └──────────────────┘
         ▲                        ▲
         │               ┌────────┴────────┐
         └──────────────►│   preload.js    │
              contextBridge (安全隔离)
```

- **Main**：窗口管理、IPC 处理、Agent 循环、API 调用、MCP 客户端
- **Renderer**：Chat UI、文件树、设置面板、记忆管理
- **Preload**：`contextBridge` 白名单隔离，所有 IPC 通道受控

---

> ⭐ 如果对你有帮助，欢迎 Star 支持！
> 第一个版本难免有坑，欢迎提 Issue 和 PR，一起让 cc-wrap 更好用。