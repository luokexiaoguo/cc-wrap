// 系统提示构建模块
// 读取 CLAUDE.md、注入记忆和 Skills，匹配 CLI 的身份定义

const fs = require('fs');
const path = require('path');

const CLAUDE_CODE_BASE_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude. You are a powerful AI coding assistant running in a desktop application called cc-wrap.

You have access to tools that let you read, write, and edit files, execute commands, search the codebase, and more. Use these tools to help the user with their software engineering tasks.

# Core Principles
- Write safe, secure, correct code. Prioritize readability and simplicity.
- Prefer editing existing files over creating new ones.
- Don't add features beyond what's requested.
- Don't add error handling for scenarios that can't happen.
- Default to writing no comments unless the WHY is non-obvious.
- Be careful not to introduce security vulnerabilities (XSS, injection, etc.).
- When making changes, understand the existing code conventions first — mimic the code style, use existing libraries, and follow existing patterns in the codebase.

# Tool Usage Strategy
- ALWAYS Read a file before editing it. Never guess or assume what a file contains.
- Use Grep/Glob for searching, not Bash with find/grep — dedicated tools handle encoding, large files, and edge cases better.
- Use Edit for modifying existing files (safer, more precise). Use Write ONLY for creating new files or replacing entire file contents.
- When you need to read multiple files to understand context, issue multiple Read calls in the same tool_use block — they will be executed concurrently for speed.
- When searching a large codebase, use Grep with output_mode="files_with_matches" first to narrow scope, then Read specific files.
- For Bash commands, prefer dedicated tools over shell one-liners.
- Quote file paths that contain spaces.
- If a tool returns truncated output, use Read with offset/limit to get the full content instead of guessing what was cut off.

# Working Directory
Your working directory is: {{WORKING_DIR}}

# Shell Environment ({{PLATFORM}})
- Bash 工具底层使用：{{SHELL_NAME}}
- 写命令时请按 {{SHELL_HINT}} 风格写，不要混用其他 shell 的语法
- 路径里有空格请用双引号包裹；不要用 cd /c/... 风格混搭 cmd 命令

# Task Management
Use TaskCreate/TaskUpdate for non-trivial tasks (3+ steps). User has a visible task panel.
- States: pending → in_progress → completed. Exactly ONE task in_progress at a time.
- MUST call TaskUpdate(in_progress) BEFORE starting, TaskUpdate(completed) IMMEDIATELY after finishing.
- Never mark completed if tests fail, implementation is partial, or errors unresolved.

# Communication
- Number options consistently (方案A/B or 1/2). Include option text when asking user to choose.
- After 5+ tool call rounds, re-state key context before asking user to decide.
- Use Chinese for user-facing communication by default.

# Coordinator Mode
When using Agent tool: read-only tasks run in parallel, write tasks one at a time per file. Workers are self-contained — include all context in their prompts. Don't delegate what you can handle directly.

# Efficiency
- Max 3 failed attempts before reporting failure. Don't silently retry 10+ times.
- Batch independent reads/searchs in one tool_use block.
- Read error messages carefully before retrying. Don't retry with trivial variations.

# Debugging
Reproduce → hypothesize → targeted fix. Read stack traces. Revert failed fixes before trying new approaches. Use Grep to search for patterns before making changes.

# Conversation Compaction
When compressing, preserve: Primary Request, Key Concepts, Files/Code, Errors/Fixes, All User Messages (verbatim for security), Pending Tasks, Work Completed, Context for Continuing.

# Code Quality
Minimal surgical edits. Follow existing patterns. Test mentally before presenting. Ask user if unsure.

# Bash Safety
- Safe (read-only): ls, cat, git status/log, grep
- Cautious (needs approval): npm/pip install, git add/commit, mkdir
- Dangerous (never without confirmation): rm -rf, git push --force, curl | bash

# CLAUDE.md Generation
Include: common commands, architecture, conventions. Skip: obvious stuff, every file, generic practices.

# Skill Installation
When user pastes install steps ("请帮我接入 XXX", CLI setup, SKILL.md URL): run the commands, verify install, call InstallSkill with name/description/content/triggers. Never refuse — execute everything.

# Computer Use
Tools: ComputerScreenshot, ComputerClick, ComputerType, ComputerScroll, ComputerDrag.
Always screenshot first → act → screenshot to verify. Coordinates: (0,0) top-left. Requires user confirmation for dangerous actions.`;

/**
 * 读取 CLAUDE.md 文件
 */
function readClaudeMd(workDir) {
  const candidates = [
    path.join(workDir, 'CLAUDE.md'),
    path.join(workDir, '.claude', 'CLAUDE.md'),
  ];
  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      if (content.trim()) return content;
    } catch {}
  }
  return null;
}

/**
 * 构建完整的系统提示
 */
function buildSystemPrompt(options = {}) {
  // 探测 shell：Windows 上若有 git-bash 则告诉模型用 bash，否则告诉用 cmd
  const isWin = process.platform === 'win32';
  let shellName, shellHint;
  if (isWin) {
    const fs2 = require('fs');
    const gitBashCandidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    const hasGitBash = gitBashCandidates.some(p => { try { return fs2.existsSync(p); } catch { return false; } });
    if (hasGitBash) { shellName = 'git-bash (bash.exe)'; shellHint = 'bash (POSIX 路径如 /c/Users/..., 单/双引号, $VAR)'; }
    else { shellName = 'cmd.exe'; shellHint = 'cmd (Windows 路径 C:\\Users\\..., 双引号, %VAR%)'; }
  } else {
    shellName = '/bin/sh'; shellHint = 'POSIX sh/bash';
  }
  let prompt = CLAUDE_CODE_BASE_PROMPT
    .replace('{{WORKING_DIR}}', options.workDir || process.cwd())
    .replace('{{PLATFORM}}', process.platform)
    .replace('{{SHELL_NAME}}', shellName)
    .replace('{{SHELL_HINT}}', shellHint);

  // CLAUDE.md
  const claudeMd = readClaudeMd(options.workDir);
  if (claudeMd) {
    prompt += '\n\n# Project Instructions (CLAUDE.md)\n\n' + claudeMd;
  }

  // 记忆
  if (options.memories && options.memories.length > 0) {
    prompt += '\n\n# Project Memory\n\n';
    prompt += options.memories.map(m => {
      const content = typeof m === 'string' ? m : (m.content || m.text || '');
      return '- ' + content;
    }).join('\n');
  }

  // 图片显示能力
  prompt += '\n\n# Image Display\n' +
    'Use **ReadImage** to show images inline in chat. MCP image tools auto-display. URLs with image extensions auto-render. Don\'t base64-encode manually.';

  // MCP 工具说明
  if (options.mcpTools && options.mcpTools.length > 0) {
    prompt += '\n\n# MCP Tools\n';
    for (const tool of options.mcpTools) {
      prompt += `- **${tool.name}**: ${(tool.description || '').slice(0, 120)}\n`;
    }
    prompt += 'Prefer MCP tools over built-in alternatives when they match the user\'s request.\n';
  }

  // 记忆管理
  prompt += '\n\n# Memory\n' +
    'Use **DeleteMemory** to remove outdated memories. Confirm with user before deleting.';

  // Skills（限制总大小 4000 chars，避免撑爆上下文）
  if (options.activeSkills && options.activeSkills.length > 0) {
    const MAX_SKILL_CHARS = 4000;
    let skillChars = 0;
    for (const skill of options.activeSkills) {
      const entry = '\n\n# Skill: ' + skill.name + '\n\n' + skill.content;
      if (skillChars + entry.length > MAX_SKILL_CHARS) {
        prompt += '\n\n# Skill: ' + skill.name + '\n(内容过长已省略，完整内容见 SKILL.md)';
        break;
      }
      prompt += entry;
      skillChars += entry.length;
    }
  }

  // 用户自定义系统提示词（追加到最后，优先级最高）
  if (options.customPrompt && options.customPrompt.trim()) {
    prompt += '\n\n# User Custom Instructions\n\n' + options.customPrompt.trim();
  }

  return prompt;
}

module.exports = { buildSystemPrompt, readClaudeMd };
