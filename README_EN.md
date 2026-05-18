# cc-wrap — Claude Code Desktop (Chinese UI)

A lightweight Electron desktop app that brings the full power of Claude Code CLI to a graphical interface, designed for Chinese developers. Now with full Windows and macOS support.

![Interface](./screenshots/interface.jpg)

## What It Does

Claude Code is Anthropic's official command-line AI coding assistant — incredibly powerful, but:
- **English-only interface** — a barrier for Chinese-speaking developers
- **CLI-only** — requires comfort with terminal commands

cc-wrap puts the full Claude Code CLI experience into a GUI, so developers who prefer visual interfaces can enjoy AI-assisted coding with a native Chinese experience.

## Features

| Feature | Description |
|---------|-------------|
| 🌐 Chinese UI | Full Chinese interface, slash commands with Chinese annotations (`/help`, `/clear`, `/config`, `/model`, etc.) |
| 📁 File Operations | Read, write, edit, search, glob with workspace file tree |
| 🔨 Bash Commands | Execute system commands for build, test, and deployment |
| 🌐 Web Search | Built-in WebSearch / WebFetch for real-time network info |
| 🔧 Model Switching | Dropdown selector, dual OpenAI / Anthropic format support, flexible third-party model integration |
| 🔌 MCP Extensions | Connect MCP tool servers to extend agent capabilities |
| 💾 Memory System | Cross-session persistence, context that doesn't expire |
| 🧩 Skills Templates | Custom prompt templates, inject into System Prompt with one click |
| 📡 Streaming Output | Watch the agent execute in real time, full transparency |
| 🖥️ Headless Mode | CLI invocation, integrate into existing dev workflows |
| 🛡️ Permission Management | Native confirmation dialogs for Write/Edit/Bash operations |
| ⌨️ Custom Title Bar | Window controls, drag to move, system tray residence |

## Supported Models

理论上所有兼容以下格式的 API 都支持：

- **Anthropic format**: `/v1/messages`, streaming SSE
- **OpenAI format**: `/v1/chat/completions`, streaming chunks

实测可接入：Claude series, DeepSeek series, Qwen series, MiniMax 等主流模型。

## Architecture

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
              contextBridge (security sandbox)
```

- **Main**: Window management, IPC handlers, agent loop, API client, MCP client
- **Renderer**: Chat UI, file tree, settings panel, memory management
- **Preload**: `contextBridge` whitelist isolation, all IPC channels controlled

---

> ⭐ Star it if you find it useful!
> v1.0 — bug reports and PRs are welcome!