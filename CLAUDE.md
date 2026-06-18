# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run in development (electron .)
npm run build      # Package Windows NSIS installer (dist/*.exe)
npm run rebuild    # Rebuild native modules for current Electron version
```

**Packaging workflow** (per user preference): before `npm run build`, delete old `dist/*.exe` and `dist/*.exe.blockmap`. The user does not want stale installers in `dist/`. Version bump goes in `package.json` `version` field; `artifactName` `"${productName} Setup ${version}.${ext}"` produces `cc-wrap Setup X.Y.Z.exe`.

There are no automated tests in this repo. Verification is "smoke-test via `npm start`, then manual interaction".

## Architecture

Electron 28 desktop app (cc-wrap, port of Claude Code CLI). `nodeIntegration: false`, `contextIsolation: true`; all renderer↔main communication goes through a contextBridge preload script that whitelists IPC channels.

### Process split

- **Main process** (`src/main/`) — Node.js backend: window management, IPC handlers, agent loop, API calls, tool execution, MCP client, tray, persistence
- **Renderer process** (`src/renderer/`) — Chromium frontend: chat UI, settings, memory management, file editor, file tree, task panel
- **Preload** (`src/preload.js`) — contextBridge exposing `window.api` with whitelisted IPC channels + `window.api.highlight` (highlight.js façade) + `window.api.xterm` (标志位，告知渲染进程终端库已由页面 script 标签加载)

### Security & IPC whitelisting (`src/preload.js`)

All renderer→main IPC goes through `window.api.invoke(channel, ...args)`. Channels not in `INVOKE_CHANNELS` are silently rejected. `SEND_CHANNELS` and `ON_CHANNELS` similarly gate `window.api.send()` (renderer→main fire-and-forget) and `window.api.on()` (main→renderer subscriptions). Clipboard is exposed as `window.api.clipboard.writeText(text)`. highlight.js is exposed as `window.api.highlight.highlight(code, lang)` returning HTML; renderer never gets the raw module.

**When adding a new IPC channel, it MUST be added to the appropriate whitelist in `preload.js`.** Anything else gets logged and rejected.

Terminal IPC channels (node-pty):
- `terminal-spawn` (invoke) — 创建新的 PTY 进程，返回 terminalId
- `terminal-write` (invoke) — 向 PTY 写入数据（用户键盘输入）
- `terminal-resize` (invoke) — 调整 PTY 大小（cols/rows）
- `terminal-kill` (invoke) — 杀死 PTY 进程
- `terminal-output` (on) — PTY 输出推送到渲染进程

### Agent Loop (`src/main/agent-loop.js`)

1. Build system prompt via `system-prompt.js` (base prompt + working-directory CLAUDE.md + memories + active skills + user-defined `customSystemPrompt`)
2. Merge built-in tools (`tools.js`) + MCP tools (`mcp-client.js`)
3. Call API via `api-client.js` (streaming) → parse text deltas + tool_use blocks via callbacks (`onText`, `onToolUse`, `onComplete`)
4. Execute tools sequentially via `tool-executor.js` → send results back as `tool_result` messages
5. Loop until no more tool calls (max `MAX_ROUNDS = 50` rounds)
6. Context compression triggers at >80K tokens (progressive: 80–100K keep 8, 100–120K keep 6, 120–150K keep 4, 150K+ keep 2 recent messages; also preserves text-containing assistant messages beyond the window)
7. **效率优化**: 工具结果普通 1500/错误 600 字符截断；滑动窗口检测卡住（最近 8 轮中 >=3 轮失败且 >=50% 失败率）时注入策略提示

**Write/Edit/Bash require user approval** via an IPC permission modal. `alwaysAllowedTools` Set is now **persisted to `config.json`** (not session-only) — `agent-loop.setPersistenceStore(store)` is called from `main.js` to inject the store, and "always allow" choices write through.

**executeTool context object**: `{ workDir, shell, signal, window, apiConfig, toolCallId }`. Tools use `workDir` to resolve relative paths, `signal` to bail on cancel, `window` to push IPC events back (e.g. `taskCreate`/`taskUpdate` emit `tasks-changed`), `apiConfig` for model/temperature/reasoningEffort, `toolCallId` for sub-agent routing.

### API client (`src/main/api-client.js`)

Auto-detects format based on endpoint/model via `shouldUseAnthropicFormat()`:
- **Anthropic**: `/v1/messages`, `x-api-key`, SSE events (`content_block_start/delta/stop`, `message_delta`)
- **OpenAI**: `/v1/chat/completions`, `Bearer`, stream chunks with `tool_calls` delta

Message format conversion: `toOpenAIMessagesWithTools(messages, system, model)`.

**Vision detection** (critical): non-vision models reject `image_url` content with HTTP 400. `modelSupportsVision(model)` checks a regex of known vision identifiers (`vision`, `vl`, `gpt-4o`, `claude`, `gemini`, `glm-4v`, etc.) plus a blacklist for `deepseek-(chat|reasoner|v3|coder)`. When false, image content blocks are stripped from the OpenAI payload and replaced with a text placeholder that tells the model to call a vision-capable MCP tool using the local path embedded in the user text.

All API fetches have a 120s timeout. Proxy is auto-configured from `HTTPS_PROXY` / `HTTP_PROXY` env via `undici.ProxyAgent` (requires `undici` in dependencies — currently not installed, proxy config will log a warning but API calls still work directly). AbortController makes cancel truly interrupt in-flight requests.

### Tool system (`src/main/tools.js` + `tool-executor.js`)

17 built-in tools defined in `tools.js` with Anthropic-format `input_schema`: Read, Write, Edit, Glob, Grep, Bash, ListDirectory, WebSearch, WebFetch, Agent, GetAgentResult, TaskCreate, TaskUpdate, InstallSkill, InstallMcp, DiscoverMcp, AskUserQuestion.

`tools.js` exports pure data + helpers (`getEnabledTools`, `mergeTools`, `getOpenAITools`). `tool-executor.js` contains the implementations, dispatched via `TOOL_HANDLERS` map. `executeTool()` checks built-in handlers first, falls back to MCP handlers from `mcp-client.getMcpToolHandler`.

**InstallMcp**: Full MCP server installer. Supports 5 transport modes: `npm` / `pip` / `uvx` / `http` / `stdio`, plus `auto` detection. Auto-detects from command format: HTTP/HTTPS URL → probe endpoint (GET → POST initialize → POST tools/list); GitHub `owner/repo` → fetch `mcp.json` / `.mcp.json` / README config or try npm install; `@scope/package` → auto npm install. For npm/pip/uvx modes, the package is auto-installed before connection. Writes to `mcp-servers.json`, connects via `mcp-client.js`, broadcasts `mcp-status` to all windows. Returns full step log and tool list on success, remediation hints on failure.

**DiscoverMcp**: Scans the local system for existing MCP server configurations. Sources: `claude-desktop` (`%APPDATA%/Claude/claude_desktop_config.json`), `npm` (global npm packages matching MCP patterns), `pip` (Python MCP packages), `cc-wrap` (current `mcp-servers.json`), `path` (known MCP CLIs like `mmx`, `uvx`). Returns structured report with server names, commands, and types — AI can then import via InstallMcp.

**AskUserQuestion** is a special tool that pauses the agent loop to ask the user a multiple-choice question. The handler in `tool-executor.js` sends an `agent-question` IPC to the renderer, then returns a Promise that resolves when the user responds via `agent-question-response` IPC. The renderer (`app.js`) listens for `agent-question`, finds the last running `AskUserQuestion` tool card in the DOM, and injects a `.tool-call-question` div with option buttons + "Other..." text input. On selection, it sends the answer back via `window.api.send('agent-question-response', requestId, answer)`. The handler supports cancellation via `ctx.signal` and a 10-minute timeout. IPC channels: `agent-question` (ON_CHANNELS) + `agent-question-response` (SEND_CHANNELS).

**Agent type system**: `AGENT_TYPES` in `tool-executor.js` defines named agent profiles (`explore`, `plan`, `general-purpose`) with `allowTools` filtering and `systemPromptSuffix`. The `explore` type only allows search/read tools; `plan` is similar but focused on architecture analysis. Sub-agents spawned by the `Agent` tool inherit their type's constraints.

**Background agents**: When `Agent` tool is called with `run_in_background: true`, the sub-agent runs independently without blocking the parent loop. Background agents don't receive `ctx.window` (prevents flash-crash from stale window references). Results are polled via `GetAgentResult` tool which checks `backgroundAgents` Map by taskId.

**Read tool encoding handling** (`readTextSmart` in `tool-executor.js`, mirrored in `main.js` as `readTextWithDetectedEncoding`): detects UTF-8 BOM → UTF-16 LE/BE BOM → strict UTF-8 → GBK (Windows ANSI fallback via `iconv-lite`) → latin1. Edit and Grep tools also use `readTextSmart` (not bare `'utf-8'`).

**Bash** uses `spawn` (non-blocking, `tree-kill` on cancel). Windows 优先探测 Git Bash（`detectWinShell()`），找不到再回退 `process.env.COMSPEC`。Git Bash 能自动继承 Windows 系统 PATH，无需手动注入工具路径。

**Task tools** (`taskCreate` / `taskUpdate`) emit `tasks-changed` IPC to the renderer after each mutation, driving the Plan UI panel. Storage is an in-memory `Map` (`taskStore`), cleared via `clear-tasks` IPC when the user switches conversations.

**InstallSkill** writes SKILL.md to the fixed location `%APPDATA%/cc-wrap/skills/<name>/` (not project-dependent). Supports `files` array parameter for supplementary scripts/configs — each entry `{ path, content }` is written with path-traversal protection. Skills are loaded at startup from three sources (priority order): project `skills/<name>/SKILL.md` in the repo root → `%APPDATA%/cc-wrap/skills/<name>/SKILL.md` (disk, higher priority than JSON) → `skills.json` (UI metadata, lowest priority).

### Logger (`src/main/logger.js`)

Hooks `console.log/error/warn` to write both to terminal and a file. `initLogger()` must be called at module level (before `app.whenReady`); `setLogPath(userDataPath)` is called inside `app.whenReady` since `app.getPath()` isn't available earlier. 5MB log rotation (`app.log` → `app.old.log`). IPC handlers: `get-logs` (search + last N lines), `clear-logs`, `export-logs` (native save dialog).

### Settings tabs

Settings modal has tabs (`data-stab`): `api`, `theme`, `general`, `logs`, `tokens`, `about`.
- **api** — global API config, temperature slider (0–2), model add/edit forms with per-model temperature + maxTokens + reasoningEffort (off/low/medium/high)
- **theme** — dark/light toggle, font size slider
- **general** — language, work directory, custom system prompt, always-allowed tools, auto-save, cache clear
- **logs** — search (300ms debounce), refresh, clear, export buttons, `<pre>` viewer
- **tokens** — GitHub-style contribution heatmap aggregating daily token usage from `conversations.json`
- **about** — app version, GitHub link via `open-external` IPC

### MCP client (`src/main/mcp-client.js`)

JSON-RPC 2.0 客户端，支持两种传输模式（自动检测）：
- **stdio**: spawn 子进程，通过 stdin/stdout 通信（传统本地 MCP 服务器）
- **HTTP/SSE**: `command` 以 `http://` 或 `https://` 开头时自动切换为 HTTP 模式，支持 POST-only（如 Tavily）和 GET+endpoint（标准 Streamable HTTP）两种子协议

`McpClient` class handles: connect, initialize handshake, tools/list, tools/call, auto-reconnect (2 retries). Global management via `connectAllServers()`, `getAllMcpTools()`, `getMcpToolHandler()`. App auto-connects configured servers 2 seconds after startup. `before-quit` cleans up all connections.

**注意**: `add-mcp-from-url` IPC 处理器在 `main.js` 中会先探测 URL 是否为 HTTP MCP 端点（检查响应 Content-Type），如果是则自动添加，否则回退到 HTML 页面解析 `mcpServers` 配置。

### System Prompt (`src/main/system-prompt.js`)

Composition order (later overrides earlier semantically): base Claude Code identity prompt → working-directory CLAUDE.md (searches `./CLAUDE.md` then `.claude/CLAUDE.md`) → memories list → active Skills content → user's `customSystemPrompt` from config. Base prompt explicitly instructs the model to use TaskCreate/TaskUpdate for non-trivial tasks (≥3 steps) so the user-visible task panel populates.

### Renderer architecture (`src/renderer/app.js`)

Single ~4850-line file holding a global `state` object

**Token statistics**: Sidebar per-conversation token display has been removed in favor of a Settings > Token Stats tab with a GitHub-style contribution heatmap. Summary cards show today/yesterday/last 30 days. `/cost` slash command still shows full breakdown per-message and across all conversations.

**Token heatmap timezone**: All date grouping uses `toLocalDay()` (wraps `getFullYear()/getMonth()/getDate()`) not `toISOString()` — the latter returns UTC and causes date-offset bugs for non-UTC users (e.g. Beijing UTC+8 at midnight shows as previous day in UTC). Any new date extraction from timestamps must use local timezone methods.

**Export conversation**: the toolbar "导出" button formats conversation as Markdown and calls `export-conversation` IPC which opens a native save dialog (default directory = workDir).

```text
state object fields: conversations, currentConversation, config, models, skills, mcpServers, mcpStatuses, workDir, memories, isGenerating, generatingConversationId, attachedImage, tasks, openFiles, agentMessages, etc.
```
Function-based, no framework.

**Streaming render**: `agent-stream-text` events append to `.msg-content` as text nodes (with class `streaming` for `white-space: pre-wrap` to preserve newlines). On `agent-complete`, `renderMessages()` re-renders the full message tree with markdown parsed (`formatContent`) — at that point `.streaming` class is cleared. Tool calls use incremental DOM (`appendToolCallIncremental` / `updateToolCallIncremental`, indexed by `data-tc-id`) to avoid full re-renders on every event.

**Tool call folding**: When an assistant message has multiple tool calls, they are grouped into a `.tool-calls-group` wrapper with a clickable `.tool-calls-bar` showing "🛠 N 个工具调用". The `.tool-calls` container inside starts with `display:none`. Clicking the bar calls `toggleToolCalls()` which toggles visibility. Both `renderMessages()` (full render) and `appendToolCallIncremental()` (streaming) create this wrapper. The event handler is bound via `bar.onclick` (not inline `onclick`) to avoid CSP issues with `script-src 'self'`.

**Markdown rendering** (`formatContent`): hand-rolled line-based state machine — headings (#–####, rendered with Serif font), unordered/ordered lists, blockquotes (with `&gt; ` since HTML is escaped first), horizontal rules, GFM tables (header + `|---|` separator), inline code/bold/italic/link, fenced code blocks (placeholder-extracted before escaping, then highlighted via `window.api.highlight.highlight` if available, fallback to regex-based `highlightCode`). Streaming mode bypasses this and uses raw text + pre-wrap.

**Layout switching**: `.main-content.editor-open` class toggles split view — chat-pane shrinks to a right sidebar (width persisted in config as `chatPaneWidth`, draggable via `chatPaneResizer`), editor-panel takes the rest. Without `editor-open`, chat occupies the full main area. The `.body-split` container and `.chat-pane` wrapper must remain intact for this to work.

**Plan UI** (task panel) sits between toolbar and `.body-split`, not in `.chat-area` — so it doesn't scroll with chat content. Hidden by default, auto-shows when `state.tasks` has entries (driven by `tasks-changed` IPC). Click task to cycle status pending → in_progress → completed → pending (calls `execute-tool` with `TaskUpdate`).

**File tree**: `loadFileTree()` calls `get-file-tree` IPC to build sidebar file tree DOM. Must be called explicitly after setting `state.workDir` — the three code paths that do this are `init()` (startup from config), the settings panel "select folder" button, and the `/workdir` slash command. All three were missing `loadFileTree()` calls at one point; any new code path that changes `state.workDir` must also call `loadFileTree()`.

**Scroll-to-bottom button** (`setupScrollToBottom()`, `#scrollBottomBtn`): sits inside `.chat-area` wrapped in a `position:sticky; height:0; overflow:visible` container to avoid clipping by `overflow-y:auto`. `updateBtn()` shows the button when `scrollHeight - scrollTop - clientHeight > 200`, hides otherwise. The JS sets `display: 'inline-flex'` (not `'flex'`) to align inside the `text-align:right` wrapper.

### Integrated Terminal

Bottom panel terminal (VS Code 风格), 通过 `node-pty` + `xterm.js` 实现。

**架构**: main 进程用 `node-pty` spawn `process.env.COMSPEC`（通常是 cmd.exe），PTY output 通过 `terminal-output` IPC 推送到渲染进程。渲染进程用 xterm.js 渲染终端界面，用户输入通过 `terminal-write` IPC 发回 main 进程写入 PTY。

**xterm 加载方式**: xterm.js 和 @xterm/addon-fit 的 UMD 包放在 `src/renderer/lib/` 下，通过 HTML `<script>` 标签加载（而非 preload require），因为 xterm 初始化时访问 `document`，而 preload 执行时 DOM 尚未就绪。CSP `script-src 'self'` 允许同目录脚本。

**注意点**:
- 终端面板固定在 chat-area 和 input-area 之间，通过 flex 布局嵌入
- 拖拽调整大小使用 `.resizer-horizontal`（在终端面板上方），拖拽方向：向上拖拽增大终端高度
- 关闭面板再打开时终端进程保持，重新 attach
- `Ctrl+`` 快捷键切换终端面板
- 需要 `electron-rebuild` 重新编译 node-pty 原生模块
- **复制粘贴行为**: `Ctrl+C`（无 Shift）在选中文字时复制，未选中时放行到终端（SIGINT）；`Ctrl+Shift+C` 强制复制；`Ctrl+V`/`Ctrl+Shift+V` 粘贴；右键单击：有选中时复制并清除选中，无选中时粘贴

## Persistence layout

All in `app.getPath('userData')` (Windows: `%APPDATA%/cc-wrap/`):

- **`config.json`** (electron-store) — defaults seeded in `main.js` Store constructor. Schema includes: `apiKey`, `apiEndpoint`, `defaultModel`, `models[]`, `theme`, `fontSize`, `language`, `maxTokens`, `temperature`, `workDirectory`, `recentProjects[]`, `minimizeToTray`, `chatPaneWidth`, `alwaysAllowedTools[]`, `customSystemPrompt`, `env`, `windowBounds`. `models[]` entries also carry per-model `temperature` and `maxTokens`. API keys in `models[]` are encrypted via electron `safeStorage` with `enc:<base64>` prefix; `readDecryptedConfig(store)` is the single entry point in main process for reading a fully-decrypted snapshot. `env` object is injected into tool-executor via `setEnvConfig()` at startup.
- **`conversations.json`** — chat history (atomic write + 300ms debounce + `beforeunload` flush + `flushConversations()` called immediately on `agent-complete`). Migrated from `localStorage` on first launch. Each message can have `inputTokens`/`outputTokens` fields; each conversation has `totalInputTokens`/`totalOutputTokens`.
- **`logs/app.log`** — rolling log file from `logger.js` (5MB rotation).
- **`memory.json`** — user memories (manual + auto-extracted)
- **`skills.json`** — Skills metadata (name, description, triggers, alwaysActive; 磁盘 SKILL.md 内容优先级更高)
- **`skills/<name>/SKILL.md`** — Skill 的 SKILL.md 正文文件，InstallSkill 写入位置，优先级高于 skills.json 中的 content
- **`mcp-servers.json`** — MCP server configs (NOT in electron-store; raw JSON read/written by `get-mcp-servers` / `save-mcp-servers` IPC handlers in main.js)
- **`pasted-images/<timestamp>.png`** — when user pastes/drops an image, it's also written to disk (`save-pasted-image` IPC) so MCP tools that accept a file path (`understand_image`, etc.) get a real path. The path is appended to the user's text as a hint in `buildApiMessages`.

## Key file-type & encoding conventions

- **`TEXT_EXTS`** in `app.js` (~100 entries) gates which extensions open in the editor as text. `TEXT_BASENAMES` covers extensionless common files (Makefile, Dockerfile, LICENSE, Procfile, …). `IMAGE_EXTS` triggers `read-file-as-data-url` → editor renders an `<img>` preview with zoom toolbar (Ctrl+wheel). Anything else: text-decode attempted, but if the first 4KB contains null bytes the user is asked to confirm.
- **`tool-read` IPC and `Read` tool both use `readTextSmart` / `readTextWithDetectedEncoding`** for encoding detection — never use bare `fs.readFileSync(path, 'utf-8')` for user files.

## UI conventions

- **Theme**: Claude warm palette. Dark `#1f1a15`, light `#f5f1eb`. Accent `#d97757` (orange). Variables `--bg-*`, `--text-*`, `--accent*`, `--accent-bg` (selected-state background), `--shadow-*`, `--radius-*`, `--font-sans/serif/mono`. Headings use Serif (`Source Serif Pro` fallback); body uses Inter + system Chinese stack; code uses JetBrains Mono.
- **Font size**: chat content reads `var(--chat-font-size)` (default 14px). `applyFontSize(px)` sets this on `documentElement`; slider in Settings > Theme persists to `config.fontSize`.
- **i18n**: `I18N` object in `app.js` with `zh`/`en` keys, `t(key)` lookup, `applyLanguage()` for dynamic UI updates. When applying language to a button with icon (`.footer-icon` + `.footer-label`), only set `.footer-label` text — `el.textContent = t(...)` would wipe the icon.
- **Toast** (`showToast(msg, type?, duration?)`): `type` ∈ `success` / `error` / `warning` / `info` controls left-border color + icon. Error toasts last 6s, warning 5s, default 3.5s.
- **Tray**: `minimizeToTray` config option, close button minimizes. Context menu: 显示窗口 / 隐藏窗口 / 新建对话 / 设置 / 退出. "新建对话" sends `tray-new-conversation` IPC; "设置" sends `tray-open-settings` IPC. Double-click to show window.
- **Window bounds** persisted to `config.windowBounds` on resize/move (skipped while minimized/maximized).

## Things that are easy to break

- **Permission modal hang**: if a Write/Edit/Bash request is sent but no renderer responds within timeout, the agent loop blocks. Don't add tools to `PERMISSION_REQUIRED_TOOLS` without testing the modal path.
- **`alwaysAllowedTools` persistence**: `setPersistenceStore(store)` MUST be called from main.js after `new Store(...)`. Without it, "always allow" reverts to session-only and breaks user expectations.
- **`window` in tool context**: `taskCreate`/`taskUpdate` emit IPC only when `ctx.window` is passed. `executeTool` is called from two paths — agent-loop (passes `options.window`) and the legacy `execute-tool` IPC handler (passes `mainWindow`). If a new caller forgets, tasks won't update the UI live.
- **Streaming class cleanup**: `.msg-content.streaming` MUST be removed on every termination path (`agent-complete`, error catch, `stopGeneration`) via `clearStreamingMarks()`. Otherwise subsequent messages render with `pre-wrap` and look broken.
- **Conversation flush on completion**: `flushConversations()` is called on `agent-complete` — don't replace it with `saveConversations()` (which is debounced 300ms and risks losing data if the process crashes immediately after).
- **OpenAI image stripping**: if you add a new vision model, update `modelSupportsVision` regex in `api-client.js`, otherwise users with that model will hit the same 400 cycle that broke DeepSeek before.
- **File tree not loading**: `loadFileTree()` must be called after every code path that sets `state.workDir`. The three paths are `init()` (startup), settings panel "select" button, and `/workdir` command. Missing this call means the sidebar file tree stays empty even though the path is persisted in config.
- **`esc()` type-safety**: the `esc()` function calls `.replace()` on its argument — passing a Number causes `text.replace is not a function` TypeError. Always wrap values in `String()` before passing to `esc()`, especially computed values like `month + 1`.
- **Multi-conversation streaming guards**: All three streaming event handlers (`agent-stream-text`, `agent-stream-tool-start`, `agent-stream-tool-result`) use the `isGenConv` pattern — `state.generatingConversationId === state.currentConversation.id`. Data model updates always go to the generating conversation (found by `generatingConversationId`); DOM updates only happen when `isGenConv` is true. Every code path that sets `isGenerating = false` must also clear `generatingConversationId = null` (currently 4 paths: `agent-complete`, `agent-start` catch, `generateResponse()` catch, `stopGeneration()`). Missing any of these will leave stale state. `setThinking()` also uses this guard to avoid showing the thinking indicator on non-generating conversations. 
