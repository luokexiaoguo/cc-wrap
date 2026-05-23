[中文](README.md)

# cc-wrap — Claude Code Desktop

> Visual AI Agent Workbench · Open Source · Multi-Model · MCP Ecosystem

cc-wrap is a desktop wrapper for [Claude Code](https://claude.ai/code), combining the official CLI's agent loop engine with a full graphical interface. No more terminal commands — manage file operations, command execution, code search, and tool extensions through a windowed UI.

![Interface](./screenshots/interface.jpg)

---

## Highlights

### 🤖 True Agent Loop

AI autonomously decides which tools to call, collaborating across multiple rounds.

- Send a request, AI reads/writes files, executes commands, searches code — all on its own
- Real-time streaming output for every thought and action
- Auto context compression (>150K tokens triggers summarization)
- Stuck detection: auto-injects strategy hints after consecutive failures
- Tool result truncation: >3000 chars auto-truncated to prevent context overflow

### 🌐 Multi-Model Support

All major models, no client switching:

| Model | Protocol |
|-------|----------|
| Claude (Opus / Sonnet / Haiku) | Anthropic Messages API |
| GPT-4o / GPT-4 | OpenAI Chat API |
| DeepSeek (Chat / Reasoner) | OpenAI Compatible |
| Qwen | OpenAI Compatible |
| MiniMax | OpenAI Compatible |
| GLM-4v / Step-1v | OpenAI Compatible |

Dual protocol auto-detection: Anthropic format uses `/v1/messages` SSE, OpenAI format uses `/v1/chat/completions` streaming. Non-vision models auto-strip image blocks to avoid 400 errors.

### 🔌 MCP Ecosystem

Full [Model Context Protocol](https://modelcontextprotocol.io/) support with two transport modes:

- **stdio** — Local MCP servers (Node.js / Python) via subprocess stdin/stdout
- **HTTP/SSE** — Remote MCP services (e.g. Tavily Search), paste URL to connect, auto-detects Streamable HTTP / POST-only modes

Dozens of ready-to-use MCP servers: Tavily search, MiniMax vision, filesystem, databases, maps, and more.

### 💻 Integrated Terminal

`` Ctrl+` `` to toggle, powered by `node-pty` + `xterm.js`:

- Real PTY process (cmd.exe / PowerShell)
- Draggable panel, process persists when panel is closed
- Run git, install packages, check logs — never leave the window

### 📋 Task Panel

AI auto-decomposes complex requests into subtasks with real-time progress:

- Done / In Progress / Pending status at a glance
- Click to toggle task state, manual intervention supported
- Clear tracking across multi-round tasks

### 🧠 Memory System

AI auto-extracts key information for cross-conversation persistence.

- Tech stack, preferences, project context auto-saved
- Manual add / manage / delete
- Auto-injected into every conversation

### 🎯 Skills Extension

Inject domain knowledge into System Prompt.

- Custom skills (name + description + prompt + trigger keywords)
- Always-active or keyword-triggered modes
- Built-in skill manager, third-party skill import
- Vendor onboarding auto-registration flow

---

## Complete Feature List

| Feature | Description |
|---------|-------------|
| Agent Loop | Multi-round tool calls, streaming output, auto-compression, stuck detection |
| File Ops | Read / Write / Edit / Glob / Grep, auto encoding detection (UTF-8 / GBK / UTF-16) |
| Bash | Non-blocking spawn, cancellable, custom cwd/shell/env |
| Multi-Model | Anthropic + OpenAI dual protocol, vision model auto-detection |
| MCP | stdio + HTTP/SSE dual mode, auto-reconnect, Chinese config examples |
| Integrated Terminal | Ctrl+` toggle, node-pty real terminal, draggable panel |
| Task Panel | Auto task decomposition, progress tracking, manual intervention |
| Memory | Auto-extract + manual manage, cross-conversation persistence |
| Skills | Custom prompt injection, keyword / always-active activation |
| File Editor | Syntax highlighting, line numbers, find/replace, Markdown preview, file tree |
| Image Recognition | Paste/drag-drop auto-save, vision model / MCP tool dual path |
| Dual Theme | Claude warm dark + cream light, adjustable font size |
| i18n | Chinese / English instant switch |
| Token Stats | Per-message ↑↓ display, `/cost` for full breakdown |
| Permissions | Write / Edit / Bash confirmation modal, "always allow" persists |
| System Tray | Minimizes on close, right-click menu for new/settings/show/hide |
| Log Viewer | Built-in panel with search, clear, export; 5MB auto-rotation |
| Conversations | New, switch, delete, export to Markdown |
| Slash Commands | `/help` `/clear` `/model` `/memory` `/mcp` `/skill` `/theme` `/export` `/cost` |
| Hotkeys | `Ctrl+P` open file, `Ctrl+S` save, `Esc` stop, `` Ctrl+` `` terminal, `Ctrl+Shift+E` export |
| Cache Cleanup | One-click cleanup of pasted images, history, logs |
| Retry on Failure | Failed API calls highlight message with one-click retry |

---

## Installation

### Download Installer

Download the latest `cc-wrap Setup X.Y.Z.exe` from [Releases](https://github.com/luokexiaoguo/cc-wrap/releases).

### From Source

```bash
git clone <repo>
cd cc-wrap
npm install
npm run rebuild    # Compile native modules (node-pty)
npm start          # Development mode
npm run build      # Package NSIS installer to dist/
```

---

## Configuration

Config file: `%APPDATA%/cc-wrap/config.json`

- API keys encrypted via Electron `safeStorage`
- Model list, theme, font size, language, work directory, recent projects
- Always-allowed tools list, custom system prompt, environment variable injection

MCP config: `%APPDATA%/cc-wrap/mcp-servers.json`

---

## Architecture

```
┌───────────────┐      IPC (contextBridge)       ┌──────────────────┐
│  Main Process  │ ◄────────────────────────────► │ Renderer Process │
│  (Node.js)     │      preload.js whitelist      │ (Chromium)       │
│                │                                │                  │
│  ├─ main.js    │                                │  ├─ app.js       │
│  ├─ agent-loop │   terminal-output (push)       │  ├─ index.html   │
│  ├─ api-client │   terminal-write (invoke)      │  ├─ main.css     │
│  ├─ tools.js   │   terminal-spawn (invoke)      │  └─ xterm.js     │
│  ├─ tool-exec  │   agent-stream-text (push)     │                  │
│  ├─ mcp-client │   agent-permission (push)      │  Terminal        │
│  ├─ system-prom│   ...                          │  └─ xterm.js     │
│  ├─ logger.js  │                                │                  │
│  └─ node-pty   │                                │                  │
└───────────────┘                                └──────────────────┘
```

**Security**: `nodeIntegration: false`, `contextIsolation: true`, IPC channel whitelisting, CSP `default-src 'self'`.

**Stack**: Electron 28 + vanilla JavaScript (no frontend framework)

---

## Data Storage

| File | Path |
|------|------|
| `config.json` | `%APPDATA%/cc-wrap/` |
| `conversations.json` | `%APPDATA%/cc-wrap/` |
| `memory.json` | `%APPDATA%/cc-wrap/` |
| `skills.json` | `%APPDATA%/cc-wrap/` |
| `mcp-servers.json` | `%APPDATA%/cc-wrap/` |
| `logs/app.log` | `%APPDATA%/cc-wrap/` |
| `pasted-images/` | `%APPDATA%/cc-wrap/` |

---

## Known Limitations

1. **Requires API Key** — not ready-to-use; you need your own Claude / GPT API credits
2. **Early Stage** — v1.1.0, edge cases may be rough
3. **Developer-Facing** — requires understanding of API / model / MCP concepts
4. **Model Variance** — Claude has strongest agent capability; other models may be less stable with tool calls
5. **Local Only** — no cloud sync, no team collaboration

---

## Development

```bash
npm start          # Development mode
npm run build      # Package installer
npm run rebuild    # Recompile native modules
```

No automated tests. Smoke-test via `npm start` + manual verification.

---

## License

MIT

> ⭐ Star if helpful. Issues and PRs welcome.
