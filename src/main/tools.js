// 工具定义数据模块
// 所有工具以 Anthropic 格式定义，同时提供 OpenAI 格式转换
const { TOOL_DEFINITIONS: COMPUTER_USE_TOOLS } = require('./computer-use');

const TOOL_DEFINITIONS = [
  {
    name: 'Read',
    description: 'Read a file from the local filesystem. Returns the file contents with line numbers (0-based). Supports text files (.txt, .md, .py, .js, .ts, .json, .yaml, .toml, .cfg, .ini, .env, .sh, .bat, .ps1, etc.), .docx (Word → plain text), .pdf (→ text extraction), .xlsx/.xls (Excel → Markdown table), .csv (→ Markdown table). Auto-detects encoding (UTF-8 BOM, UTF-16 LE/BE, strict UTF-8, GBK fallback, latin1 fallback). For large files, use offset and limit to read in chunks. IMPORTANT: Always use this tool before editing a file to understand its current content. Never guess file contents.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read. Relative paths are resolved from the working directory.' },
        offset: { type: 'number', description: 'Line number to start reading from (0-based). Use for reading specific sections of large files.' },
        limit: { type: 'number', description: 'Maximum number of lines to return. If omitted, returns up to 2000 lines. Use with offset for pagination.' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'Write',
    description: 'Write content to a file, creating it if it doesn\'t exist or overwriting it entirely if it does. Creates parent directories automatically. Supports encoding option for non-UTF-8 files. IMPORTANT: This tool replaces the ENTIRE file content. To modify specific parts of an existing file, use the Edit tool instead — it is safer and more precise. Use Write only when creating new files or when you need to replace the entire file content.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write. Parent directories are created automatically.' },
        content: { type: 'string', description: 'The complete content to write to the file. This replaces any existing content entirely.' },
        encoding: { type: 'string', description: 'File encoding: utf-8 (default), gbk, gb2312, gb18030, utf-16le, utf-16be, latin1', enum: ['utf-8', 'gbk', 'gb2312', 'gb18030', 'utf-16le', 'utf-16be', 'latin1'] }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'Edit',
    description: 'Perform an exact string replacement in an existing file. Finds the first occurrence of old_string and replaces it with new_string. The old_string must be a unique substring in the file — if it appears multiple times, include more surrounding context to make it unique. IMPORTANT: Always Read the file first to get the exact current content before using Edit. Do NOT guess what the file contains. This tool is preferred over Write for modifying existing files because it only changes the specific part that needs updating.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit.' },
        old_string: { type: 'string', description: 'The exact text to find and replace. Must match the file content exactly, including whitespace and indentation. Must be unique in the file.' },
        new_string: { type: 'string', description: 'The text to replace old_string with. Use empty string "" to delete the old_string.' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'Glob',
    description: 'Find files by glob pattern. Returns matching file paths sorted by modification time (most recent first). Use this to locate files when you know the name pattern but not the exact path. Examples: "**/*.js" finds all JS files recursively, "src/**/*.ts" finds TS files under src/, "**/test*" finds files/dirs with "test" in the name. Results are limited to 100 matches by default.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files against. Examples: "**/*.py", "src/**/*.tsx", "**/config.*"' },
        path: { type: 'string', description: 'Directory to search in. Defaults to the working directory.' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'Grep',
    description: 'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers. Supports three output modes: "content" (matching lines with context), "files_with_matches" (just file paths — use when you only need to know which files contain the pattern), "count" (number of matches per file). Also searches inside .docx files automatically. Use Glob first to narrow down the search scope when possible.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for. Examples: "function\\s+\\w+", "import.*from", "TODO|FIXME"' },
        path: { type: 'string', description: 'File or directory to search in. Defaults to the working directory.' },
        glob: { type: 'string', description: 'Glob pattern to filter which files to search. Examples: "*.js", "*.{ts,tsx}", "**/test/**". Use this to narrow the search scope for faster results.' },
        output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Output format: "content" shows matching lines (default), "files_with_matches" shows only file paths (faster for large codebases), "count" shows match counts per file.' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'Bash',
    description: 'Execute a shell command and return its output. Use for running tests, installing packages, git operations, build commands, and any task that requires a system shell. The command runs in the working directory. Default timeout is 120 seconds — use the timeout parameter for longer-running commands. IMPORTANT: For file operations (read/write/search), prefer dedicated tools (Read, Write, Edit, Grep, Glob) over shell commands like cat/grep/find — they handle encoding, large files, and edge cases better. This tool requires user permission before execution.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute. Runs in the working directory using the configured shell (git-bash on Windows if available, otherwise cmd).' },
        timeout: { type: 'number', description: 'Timeout in milliseconds. Default: 120000 (120 seconds). Increase for long-running commands like builds or test suites.' }
      },
      required: ['command']
    }
  },
  {
    name: 'ListDirectory',
    description: 'List files and subdirectories at a given path. Returns names, types (file/directory), and sizes. Use this to explore the project structure before diving into specific files. For recursive file search, use Glob instead.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory to list. Defaults to the working directory.' }
      },
      required: ['path']
    }
  },
  {
    name: 'WebSearch',
    description: 'Search the web using DuckDuckGo. Returns up to 8 results with title, URL, and snippet. Best practices: (1) Use 3-5 specific keywords, not full sentences. (2) For time-sensitive queries (current events, prices, versions), include the current year. (3) If an MCP web_search tool is available, prefer it — this is the built-in fallback. (4) Do NOT retry with URL variations if results are unsatisfactory — report what you found.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query with 3-5 keywords. For time-sensitive topics, include the current year (e.g. "node.js LTS version 2026").' }
      },
      required: ['query']
    }
  },
  {
    name: 'WebFetch',
    description: 'Fetch and extract text content from a URL. Returns the page content as text. Use this to read documentation pages, API references, or any web content. If a prompt is provided, the tool will try to extract only the relevant information. IMPORTANT: Some pages (SPAs, JavaScript-heavy sites) may return minimal content. If that happens, tell the user instead of retrying with URL variations.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch content from. Must be a valid HTTP/HTTPS URL.' },
        prompt: { type: 'string', description: 'What specific information to extract from the page. Helps focus the extraction on relevant content instead of returning the entire page.' }
      },
      required: ['url']
    }
  },
  {
    name: 'Agent',
    description: 'Spawn a sub-agent to handle a complex subtask independently. The sub-agent gets its own context window and can use tools autonomously. Types: "explore" (read-only tools only, fast research/survey), "plan" (read-only, architecture analysis), "general-purpose" (all tools, default). Set run_in_background=true to run without blocking the parent loop — returns a taskId immediately, poll results later with GetAgentResult. Set isolation="worktree" to run in an isolated git worktree (requires git repo). Use this to parallelize work or delegate research while the main agent continues.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed task description for the sub-agent. Be specific about what to find, analyze, or produce. The sub-agent has no context from the parent conversation.' },
        description: { type: 'string', description: 'Short label (3-5 words) describing what the sub-agent will do. Shown in the UI.' },
        subagent_type: { type: 'string', enum: ['general-purpose', 'explore', 'plan'], description: 'Agent profile: "explore" = read-only tools, fast research; "plan" = read-only, architecture design; "general-purpose" = all tools (default).' },
        run_in_background: { type: 'boolean', description: 'If true, the sub-agent runs asynchronously without blocking the parent loop. Returns a taskId. Use GetAgentResult to poll for completion.' },
        isolation: { type: 'string', enum: ['worktree'], description: 'If "worktree", runs in an isolated git worktree so file changes don\'t affect the main working tree. Requires a git repository.' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'GetAgentResult',
    description: 'Poll the result of a background agent launched with Agent({ run_in_background: true }). Returns { status: "running" } if still in progress, or the full result if completed. Call this periodically (not in a tight loop) to check on background tasks.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The taskId returned when the background agent was launched.' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'TaskCreate',
    description: `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the task list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as tasks
6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one task as in_progress at a time
7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool
Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

## Task States (Enforced State Machine)
- **pending**: Task not yet started
- **in_progress**: Currently working on (MUST limit to ONE task at a time)
- **completed**: Task finished successfully

## Critical Rules
1. **MUST** mark in_progress BEFORE starting work
2. **MUST** mark completed IMMEDIATELY after finishing (not batch)
3. **Exactly ONE** task must be in_progress at any time
4. Complete current tasks before starting new ones
5. NEVER mark completed if: tests failing, implementation partial, unresolved errors

## Task Description Requirements
Task descriptions must have two forms:
- subject: The imperative form ("Run tests", "Fix bug")
- description: Optional detailed description with acceptance criteria`,
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Brief task title (under 50 chars, imperative mood). E.g. "Refactor API client", not "Refactoring the API client".' },
        description: { type: 'string', description: 'Detailed description of what this task involves. Include acceptance criteria if applicable.' }
      },
      required: ['subject']
    }
  },
  {
    name: 'TaskUpdate',
    description: `Update the status of a previously created task. The task panel updates in real-time for the user.

## State Machine (Enforced)
- pending → in_progress → completed
- in_progress → pending (if blocked)
- Any → deleted

## Critical Rules
1. Mark in_progress BEFORE starting work on the task
2. Mark completed IMMEDIATELY after finishing
3. Exactly ONE task must be in_progress at any time (system auto-pauses others)
4. NEVER mark completed if:
   - Tests are failing
   - Implementation is partial
   - You encountered unresolved errors
   - You couldn't find necessary files

## When Blocked
If you cannot continue, keep the task as in_progress and create a NEW task describing what needs to be resolved.`,
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ID of the task to update (returned by TaskCreate).' },
        status: { type: 'string', enum: ['in_progress', 'completed', 'pending', 'deleted'], description: 'New status: "in_progress" = currently working on it, "completed" = done, "pending" = not started or blocked, "deleted" = no longer needed.' }
      },
      required: ['taskId', 'status']
    }
  },
  {
    name: 'InstallSkill',
    description: 'Register a new Skill into cc-wrap so the app and future conversations know how to use a CLI / SDK / API. Use this whenever the user pastes a vendor onboarding snippet (e.g. "请帮我接入 XXX CLI"), gives you a SKILL.md URL, or otherwise asks to integrate an external tool. The Skill is written to %APPDATA%/cc-wrap/skills/<name>/SKILL.md with YAML frontmatter. Run any required `npm install -g xxx` / login steps with Bash BEFORE calling this tool, verify with `<cli> --version` or `<cli> --help`, then call InstallSkill with concise usage docs in `content`. Choose `triggers` carefully (Chinese + English keywords the user is likely to mention when they need this skill); set `alwaysActive: true` only if the skill provides core capability the user explicitly wants always on. Do NOT call this tool for one-off shell tasks.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'kebab-case unique skill name, e.g. "mmx-cli". Used as directory name and identifier.' },
        description: { type: 'string', description: 'One-line user-facing description of what this skill does.' },
        content: { type: 'string', description: 'Full SKILL.md body (markdown). Document: required CLI commands with examples, parameter conventions, common pitfalls, when to use. Be specific and example-driven — the model in future conversations reads this verbatim.' },
        triggers: { type: 'array', items: { type: 'string' }, description: 'Keywords (Chinese + English) that should auto-activate this skill when present in the user message or attachments. Examples: ["image","图片","识图"] for a vision skill.' },
        alwaysActive: { type: 'boolean', description: 'Set true only if the user explicitly wants this skill injected on every turn (rare). Default false.' },
        files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path inside skill directory (e.g. "lib/tool.py")' }, content: { type: 'string', description: 'File content' } }, required: ['path', 'content'] }, description: 'Optional supplementary files to install alongside SKILL.md (scripts, configs, etc.)' }
      },
      required: ['name', 'description', 'content']
    }
  },
  {
    name: 'InstallMcp',
    description: 'Install, auto-configure, and connect an MCP server into cc-wrap. Supports npm/pip/uvx/stdio/HTTP all in one tool — auto-installs packages, auto-detects transport type, writes to mcp-servers.json, connects immediately, and verifies tools are available. Use this whenever the user asks to add an MCP server from any source: npm package, pip package, GitHub URL, HTTP/SSE endpoint, or direct executable.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique server name (kebab-case, e.g. "my-mcp-server"). Short but descriptive.' },
        command: { type: 'string', description: 'npm package name (e.g. "@modelcontextprotocol/server-filesystem"), pip package, GitHub repo "user/repo", HTTP/SSE URL, or executable path. For npm/pip, the package is auto-installed if not already present.' },
        args: { type: 'array', items: { type: 'string' }, description: 'CLI arguments passed to the server after the command. For npm servers these become npx args, for pip servers they become python -m args.' },
        env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Environment variables the server needs (API keys, tokens, etc.). Set these here rather than in .env files so they are stored in mcp-servers.json.' },
        cwd: { type: 'string', description: 'Working directory for the server process. Defaults to the project root.' },
        description: { type: 'string', description: 'Human-readable label shown in the MCP settings panel. If omitted, the server name is used.' },
        transport: { type: 'string', enum: ['auto', 'stdio', 'http', 'npm', 'pip', 'uvx'], description: 'Installation/transport method. "auto" (default) detects from command: GitHub repo → fetch for mcpServers config; HTTP/HTTPS URL → test as SSE endpoint; else → stdio. "npm"/"pip"/"uvx" explicitly install the package first. "stdio" uses the command as-is. "http" forces HTTP/SSE mode.' }
      },
      required: ['name', 'command']
    }
  },
  {
    name: 'DiscoverMcp',
    description: 'Scan the local system for existing MCP server configurations from various sources: Claude Desktop config, globally installed npm/pip packages, cc-wrap config, and PATH tools. Returns a report of what was found. Set import=true to auto-import found servers into cc-wrap (skips duplicates by name or command).',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['all', 'claude-desktop', 'npm', 'pip', 'cc-wrap', 'path'], description: 'Which source to scan. "all" (default) scans everything.' },
        import: { type: 'boolean', description: 'If true, auto-import discovered servers into cc-wrap config. Skips servers already configured (by name or command). Default: false.' }
      },
      required: []
    }
  },
  {
    name: 'AskUserQuestion',
    description: 'Ask the user a multiple-choice question and wait for their answer. Use this at decision points where you need user input to proceed: clarifying ambiguous requirements, choosing between implementation approaches, confirming a non-trivial direction before coding, picking among configuration options. The UI renders the question inline in chat with clickable option buttons plus an "Other..." free-text fallback. The tool blocks until the user answers, then returns their selection as the tool_result text. Do NOT use for: yes/no confirmations of risky actions (those are handled by the permission modal), one-off questions where a plain text reply is enough, questions during long autonomous runs where blocking is bad UX.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The full question text shown to the user. Be specific. End with a question mark.' },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          description: '2-4 mutually exclusive answer options. Each option has a short label (1-5 words) and an optional one-line description explaining the choice or its tradeoff.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Short user-facing choice text. 1-5 words.' },
              description: { type: 'string', description: 'Optional one-line explanation of what this option means or its tradeoff.' }
            },
            required: ['label']
          }
        }
      },
      required: ['question', 'options']
    }
  },
  {
    name: 'ReadImage',
    description: 'Read an image file and return it as base64 data for inline display in the chat. Use this when you need to show an image to the user directly in the conversation. Supports PNG, JPEG, GIF, WebP, BMP formats. Returns the image as a data URL that the app renders inline. Max file size: 10MB.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the image file' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'DeleteMemory',
    description: 'Delete one or more memories from the memory store. Use this when a memory is outdated, incorrect, or no longer relevant. You can delete by exact content match or by index. Always confirm with the user before deleting.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Exact content string of the memory to delete (matches the content field exactly)' },
        index: { type: 'number', description: 'Index of the memory to delete (0-based, from the memories list)' }
      }
    }
  },
];

// 转换为 OpenAI function calling 格式
function getOpenAITools(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));
}

// 按名称过滤工具
function getEnabledTools(enabledNames) {
  if (!enabledNames || enabledNames.length === 0) return TOOL_DEFINITIONS;
  return TOOL_DEFINITIONS.filter(t => enabledNames.includes(t.name));
}

// 合并内置工具和 MCP 工具
function mergeTools(builtinTools, mcpTools, options) {
  let allTools = [...builtinTools];
  if (options && options.computerUseEnabled) {
    allTools = [...allTools, ...COMPUTER_USE_TOOLS];
  }
  if (mcpTools && mcpTools.length > 0) {
    allTools = [...allTools, ...mcpTools];
  }
  return allTools;
}

module.exports = { TOOL_DEFINITIONS, getOpenAITools, getEnabledTools, mergeTools };
