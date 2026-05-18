# cc-wrap — Claude Code Desktop (Chinese UI)

A lightweight Electron desktop app that brings the full power of Claude Code CLI to a graphical interface, designed for Chinese developers. Now with full Windows and macOS support.

![Interface](./screenshots/interface.jpg)

## Features

- 🌐 Chinese UI out of the box, slash commands with Chinese annotations (`/help`, `/clear`, `/config`, `/model`, etc.)
- 📁 File read/write/edit, Bash commands, Web search, Task management with native permission dialogs
- 🔧 Model dropdown, dual OpenAI / Anthropic format support, flexible third-party model integration (e.g. deepseek-v4-flash)
- 🔌 MCP server management — connect external tool servers with one click
- 💾 Memory system + Skills templates, persistent across sessions
- 📡 Streaming output — watch the agent execute in real time
- 🖥️ Custom title bar, system tray, headless mode

## Tech Stack

Electron 28 + Node.js, contextBridge sandboxing, electron-builder for Windows / macOS installers.

---

> ⭐ Star it if you find it useful!
> This is v1.0 — bug reports and PRs are welcome!