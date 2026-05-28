// 工具定义数据模块
// 所有工具以 Anthropic 格式定义，同时提供 OpenAI 格式转换

const TOOL_DEFINITIONS = [
  {
    name: 'Read',
    description: 'Read a file from the local filesystem. Returns file contents with line numbers. Supports text files (.txt, .md, .py, .js, etc.), .docx (Word), and .pdf files. Auto-detects encoding (UTF-8, GBK, UTF-16). For large files (>2000 lines), use offset and limit parameters.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        offset: { type: 'number', description: 'Line number to start reading from (0-based)' },
        limit: { type: 'number', description: 'Number of lines to read' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'Write',
    description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files. Supports encoding option for non-UTF-8 files.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' },
        encoding: { type: 'string', description: 'File encoding: utf-8 (default), gbk, gb2312, gb18030, utf-16le, utf-16be, latin1', enum: ['utf-8', 'gbk', 'gb2312', 'gb18030', 'utf-16le', 'utf-16be', 'latin1'] }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'Edit',
    description: 'Perform exact string replacement in a file. The old_string must be unique in the file or provide more context to make it unique.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        old_string: { type: 'string', description: 'Text to replace (must be unique)' },
        new_string: { type: 'string', description: 'Replacement text' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'Glob',
    description: 'Find files by glob pattern (e.g., "**/*.js", "src/**/*.ts", "**/*.docx"). Returns matching file paths sorted by modification time.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern' },
        path: { type: 'string', description: 'Directory to search in (defaults to working directory)' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'Grep',
    description: 'Search file contents using regex. Returns matching lines with file paths and line numbers. Searches inside .docx files automatically.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in' },
        glob: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.js")' },
        output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Output format' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'Bash',
    description: 'Execute a shell command. Use for running commands, installing packages, running tests, etc. Timeout: 120 seconds.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)' }
      },
      required: ['command']
    }
  },
  {
    name: 'ListDirectory',
    description: 'List files and directories at a path. Returns names, types, and sizes.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' }
      },
      required: ['path']
    }
  },
  {
    name: 'WebSearch',
    description: 'Search the web via DuckDuckGo (returns up to 8 fresh results: title, URL, snippet). For time-sensitive queries (current events, "latest", a specific year, prices, scores), include explicit time keywords like the current year in the query so the engine ranks recent pages. If another search tool (e.g. an MCP `web_search`) is available, prefer it; this is the fallback.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (3-5 keywords; for time-sensitive topics, include the current year)' }
      },
      required: ['query']
    }
  },
  {
    name: 'WebFetch',
    description: 'Fetch content from a URL. Returns the page content as text.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        prompt: { type: 'string', description: 'What information to extract from the page' }
      },
      required: ['url']
    }
  },
  {
    name: 'Agent',
    description: 'Spawn a sub-agent to handle complex tasks. The sub-agent has its own context and can use tools independently. Supports type-specific agents (explore=read-only+cheap, plan=architecture), background execution (run_in_background=true), and worktree isolation (isolation="worktree").',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Task description for the sub-agent' },
        description: { type: 'string', description: 'Short description of what the sub-agent will do' },
        subagent_type: { type: 'string', enum: ['general-purpose', 'explore', 'plan'], description: 'Agent type: explore (read-only+Haiku for quick research), plan (architecture design), general-purpose (all tools, default)' },
        run_in_background: { type: 'boolean', description: 'If true, the sub-agent runs in background without blocking. Returns a taskId immediately. Use GetAgentResult tool to poll for results later.' },
        isolation: { type: 'string', enum: ['worktree'], description: 'If "worktree", runs in an isolated git worktree. Requires a git repository.' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'GetAgentResult',
    description: 'Check or retrieve the result of a background agent previously launched with Agent({ run_in_background: true }). Returns { status: "running" } if still in progress, or the full result if completed.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The taskId returned when the background agent was launched via Agent({ run_in_background: true })' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'TaskCreate',
    description: 'Create a new task for tracking work progress.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Brief task title' },
        description: { type: 'string', description: 'Detailed task description' }
      },
      required: ['subject']
    }
  },
  {
    name: 'TaskUpdate',
    description: 'Update a task status.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to update' },
        status: { type: 'string', enum: ['in_progress', 'completed', 'deleted'], description: 'New status' }
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
    description: 'Scan the local system for existing MCP server configurations from various sources: Claude Desktop config, globally installed npm/pip packages that are MCP servers, cc-wrap own config, and PATH tools with MCP subcommands. Returns a structured report of what was found and where, so the AI can offer to import them via InstallMcp.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['all', 'claude-desktop', 'npm', 'pip', 'cc-wrap', 'path'], description: 'Which source to scan. "all" (default) scans everything.' }
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
  }
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
function mergeTools(builtinTools, mcpTools) {
  if (!mcpTools || mcpTools.length === 0) return builtinTools;
  // MCP 工具追加在内置工具后面
  return [...builtinTools, ...mcpTools];
}

module.exports = { TOOL_DEFINITIONS, getOpenAITools, getEnabledTools, mergeTools };
