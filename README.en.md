[中文](README.md)

# cc-wrap — Claude Code Desktop (Chinese-first)

A lightweight Electron desktop app that brings Claude Code CLI's core capabilities into a GUI — Chinese-first interface, zero-friction third-party model setup, warm Claude-branded UI. Currently shipping a Windows NSIS installer.

![Interface](./screenshots/interface.jpg)

## What This Project Does

The official Claude Code desktop client has two pain points: incomplete Chinese support and complex third-party model configuration. cc-wrap solves both — and brings the full CLI capability surface (agent loop, tool calls, MCP extensions, memory/skills) into a GUI so developers unfamiliar with the command line can still use it.

## Core Features

| Feature | Description |
|---------|-------------|
| 🌐 Chinese-first UI | Fully localized interface, 14 slash commands (`/help` `/clear` `/model` `/memory` `/mcp` `/skill` `/theme` `/export` `/init` `/cost` `/permissions` `/tools` `/workdir` `/compact`) |
| 🔧 Model Switching | Dropdown selector, **automatic Anthropic / OpenAI format detection**, drop-in third-party model support |
| 📁 File Operations | Read · Write · Edit · Glob · Grep with automatic UTF-8/UTF-16/GBK detection; workspace file tree with context menu |
| 🔨 Bash Commands | Non-blocking execution, cancellable, with custom cwd / shell / env context |
| 🔌 MCP Extensions | Standard JSON-RPC over stdio; ready-to-fill examples embedded in the dialog (MiniMax / filesystem / Amap, etc.) |
| 🧩 Skills Injection | Custom prompt templates injected into System Prompt; supports auto-import from URL |
| 💾 Memory System | Cross-conversation persistence for preferences and project context, auto-extracted + manual |
| 📋 Plan UI Task Panel | Large tasks auto-decomposed, progress visible (○ → ◐ → ✓), manually toggleable |
| 🖼️ Image Recognition | Paste / drag-and-drop, auto-saved to disk for MCP tool access; non-vision models auto-strip images |
| 📡 Streaming Output | Real-time agent execution, incremental tool-call rendering, visible "thinking..." indicator |
| 🛡️ Permission Management | Confirmation modal for Write / Edit / Bash; "always allow" persists across restarts |
| 📊 Token Statistics | Per-message token display (↑input · ↓output), `/cost` for per-conversation and global breakdown |
| 📝 Log Viewer | Built-in log panel in Settings with search, refresh, export; 5MB auto-rotation |
| 🗑️ Cache Cleanup | One-click cleanup of pasted images, conversation history, logs, and other cached data |
| 🎨 Warm Theme | Claude-branded palette, light & dark modes, adjustable font size (12-20px) |
| 🌐 Language Switch | Instant Chinese/English toggle — no restart needed |
| 🔄 Failure Retry | Failed API calls highlight the message with a one-click retry button |
| ⌨️ System Tray | Close minimizes to tray; right-click menu for new conversation, settings, etc. |

## Supported Models

Any API compatible with these formats works:

- **Anthropic format**: `/v1/messages`, streaming SSE
- **OpenAI format**: `/v1/chat/completions`, streaming chunks (with `tool_calls`)

Tested with: Claude series, DeepSeek series, Qwen / Qwen-VL, MiniMax / MiniMax-VL, GLM-4v, Step-1v, and more.

## Quick Start

```bash
git clone <repo>
cd claude-desktop
npm install
npm start             # Development mode
npm run build         # Build Windows NSIS installer into dist/
```

## Architecture

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
            contextBridge (whitelist IPC + sandbox)
```

- **Main**: Window management, agent loop (max 50 rounds, auto context compression at ~150K tokens), API client (Anthropic / OpenAI dual format + vision-model detection), tool executor, MCP client
- **Renderer**: Chat UI, file tree, settings panel, memory management, task panel, file editor (with image preview)
- **Preload**: `contextBridge` whitelist isolation — every IPC channel is explicitly registered; non-whitelisted requests are rejected. highlight.js is exposed to the renderer through preload

## Data Storage

All user data lives under `%APPDATA%/cc-wrap/` (Windows):

- `config.json` — settings (API keys encrypted via Electron `safeStorage`)
- `conversations.json` — chat history (atomic write + debounce + immediate flush on completion)
- `memory.json` / `skills.json` / `mcp-servers.json` — per-module JSON
- `logs/app.log` — runtime logs (5MB auto-rotation)
- `pasted-images/` — auto-saved pasted images

---

> ⭐ Star if helpful. Issues and PRs welcome.
