# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run in development (electron .)
npm run build      # Package Windows NSIS installer (dist/*.exe)
npm run rebuild    # Rebuild native modules for current Electron version
```

## Architecture

Electron 28 desktop app (cc-wrap, port of Claude Code CLI) with `nodeIntegration: false`, `contextIsolation: true`, and a contextBridge preload script that whitelists IPC channels in three categories (invoke/on/send).

### Process split

- **Main process** (`src/main/`) — Node.js backend: window management, IPC handlers, agent loop, API calls, tool execution, MCP client, tray, persistence
- **Renderer process** (`src/renderer/`) — Chromium frontend: chat UI, settings, memory management, file editor, file tree
- **Preload** (`src/preload.js`) — contextBridge exposing `window.api` with whitelisted IPC channels

### Security model (`src/preload.js`)

All renderer→main IPC goes through `window.api.invoke(channel, ...args)`. Channels not in the INVOKE_CHANNELS array are silently rejected. The SEND_CHANNELS and ON_CHANNELS lists similarly gate `window.api.send()` (renderer→main fire-and-forget) and `window.api.on()` (main→renderer subscriptions). Clipboard is exposed as `window.api.clipboard.writeText(text)`.

When adding a new IPC channel, it MUST be added to the appropriate whitelist in `preload.js` (`INVOKE_CHANNELS`, `ON_CHANNELS`, or `SEND_CHANNELS`).

### IPC event flow

**Renderer → Main (invoke/handle):**

| Channel | Purpose |
|---|---|
| `agent-start` / `agent-cancel` | Start/stop agent loop |
| `get-config` / `set-config` | Read/write electron-store config |
| `get-models` / `add-model` / `remove-model` | Manage custom models |
| `get-memory` / `save-memory` / `delete-memory` | Memory system (persisted in userData/memory.json) |
| `get-skills` / `save-skills` / `read-skill-file` | Skills system |
| `get-mcp-servers` / `save-mcp-servers` / `mcp-connect/disconnect/status` / `test-mcp-server` | MCP server management |
| `get-file-tree` / `select-folder` / `get-work-dir` / `set-work-dir` | Working directory & file tree |
| `tool-read/write/edit/glob/grep/bash/list-dir` | Direct tool execution (legacy, not used by agent loop) |
| `read-image` / `paste-image` | Image attachment (base64) |
| `claude-api` / `claude-api-stream` | Direct API calls (legacy, not used by agent loop) |
| `get-tool-definitions` / `execute-tool` | Tool introspection & execution |
| `window-minimize/maximize/close` | Title bar controls |
| `get-recent-projects` / `add-recent-project` | Project history |
| `get-app-icon` | Returns app icon as data URL (for title bar display) |
| `fetch-web-content` / `add-mcp-from-url` | Web utilities |

**Main → Renderer (send, streaming agent events):**

| Channel | When |
|---|---|
| `agent-stream-text` | Each text delta from LLM |
| `agent-stream-tool-start` | Tool call begins |
| `agent-stream-tool-result` | Tool execution completes |
| `agent-complete` | Agent loop finishes (success/error) |
| `agent-permission-request` | IPC modal asking permission for Write/Edit/Bash |
| `mcp-status` | MCP server connection status changed |
| `auto-memories-extracted` | Background memory extraction done |

### Agent Loop (`src/main/agent-loop.js`)

1. Build system prompt via `system-prompt.js` (CLAUDE.md + memories + skills)
2. Merge built-in tools (from `tools.js`) + MCP tools (from `mcp-client.js`)
3. Call API via `api-client.js` (streaming) → parse text deltas + tool_use blocks via callbacks (`onText`, `onToolUse`, `onComplete`)
4. Execute tools sequentially via `tool-executor.js` → send results back as `tool_result` messages
5. Loop until no more tool calls (max 50 rounds, `MAX_ROUNDS`)
6. Context compression at ~150K tokens (automatic summarization of older messages)

Write/Edit/Bash require user approval via an IPC modal. The `alwaysAllowedTools` Set tracks session-level approvals.

### API client (`src/main/api-client.js`)

Auto-detects format based on endpoint/model via `shouldUseAnthropicFormat()`:
- **Anthropic**: `/v1/messages`, `x-api-key`, SSE events (`content_block_start/delta/stop`, `message_delta`)
- **OpenAI**: `/v1/chat/completions`, `Bearer`, stream chunks with `tool_calls` delta

Both formats are supported in streaming and non-streaming modes. Message format conversion happens in `toOpenAIMessagesWithTools()`.

### Tool system (`src/main/tools.js` + `tool-executor.js`)

12 built-in tools defined in `tools.js` with Anthropic-format `input_schema`: Read, Write, Edit, Glob, Grep, Bash, ListDirectory, WebSearch, WebFetch, Agent, TaskCreate, TaskUpdate.

`tools.js` exports pure data + helpers (`getEnabledTools`, `mergeTools`, `getOpenAITools`). `tool-executor.js` contains the actual implementations, dispatched via `TOOL_HANDLERS` map. The `executeTool()` function checks built-in handlers first, then falls back to MCP handlers.

Write/Edit/Bash require user permission (handled by agent-loop, not the tool executor itself). Agent tool is a simplified stub (no independent context window).

### MCP client (`src/main/mcp-client.js`)

JSON-RPC 2.0 over stdio. `McpClient` class handles: spawn, initialize handshake, tools/list, tools/call, auto-reconnect (2 retries). Global management via exported functions: `connectAllServers()`, `getAllMcpTools()`, `getMcpToolHandler()`. App auto-connects configured servers 2 seconds after startup.

### System Prompt (`src/main/system-prompt.js`)

Builds the system prompt by composing: base Claude Code identity prompt → working directory CLAUDE.md (searches `./CLAUDE.md` and `.claude/CLAUDE.md`) → memories list → active Skills content.

## Key Conventions

- **Config**: `electron-store` (`config.json` in userData), schema keys include `apiKey`, `apiEndpoint`, `defaultModel`, `models`, `theme`, `fontSize`, `language`, `maxTokens`, `temperature`, `workDirectory`, `recentProjects`, `minimizeToTray`
- **Memory/skills/MCP servers**: standalone JSON files (`memory.json`, `skills.json`, `mcp-servers.json` in `app.getPath('userData')`)
- **Conversations**: `localStorage` in renderer (not persisted to disk)
- **Renderer state**: global `state` object with `conversations`, `config`, `models`, `memories`, `openFiles`, `agentMessages`, etc.
- **I18N**: `I18N` object in `app.js` with `zh`/`en` keys, `t(key)` lookup function, `applyLanguage()` for dynamic UI updates. Setting `language` in config controls the active language.
- **Icon**: `icon.ico` at project root (256x256), used by `BrowserWindow` icon, tray icon (resized to 16x16), and title bar (via `get-app-icon` IPC returning a base64 data URL)
- **Title bar**: custom frameless with `-webkit-app-region: drag`, title absolutely centered with `position: absolute` + `justify-content: center`, app icon displayed on the left via CSS `gap`
- **Tray**: `minimizeToTray` config option, context menu (show/quit), double-click to show window
- **File tree**: recursive directory listing with `Set()`-based collapse tracking (`fileTreeCollapsed`), dir arrows (▶/▼), right-click context menu (open/copy path/new file/folder/rename/delete/refresh)
- **Packaging**: electron-builder NSIS, output in `dist/`
