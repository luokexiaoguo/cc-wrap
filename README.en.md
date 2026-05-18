[中文](README.md)

# cc-wrap — Claude Code Desktop (Chinese UI)

A lightweight Electron desktop app that brings the full power of Claude Code CLI to a graphical interface, designed for Chinese developers. Now with full Windows and macOS support.

![Interface](./screenshots/interface.jpg)

## What This Project Does

The official Claude Code desktop client has two pain points: incomplete Chinese support and complex third-party model configuration. cc-wrap solves both — simpler setup and a friendlier experience.

It also brings the full Claude Code CLI capability to a GUI, so developers unfamiliar with the command line can still enjoy AI-assisted coding with a native Chinese interface.

## Core Features

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

Any API compatible with the following formats is supported:

- **Anthropic format**: `/v1/messages`, streaming SSE
- **OpenAI format**: `/v1/chat/completions`, streaming chunks

Tested with: Claude series, DeepSeek series, Qwen series, MiniMax, and more.

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

> ⭐ If you find this useful, star it!
> v1.0 — bug reports and PRs are welcome!