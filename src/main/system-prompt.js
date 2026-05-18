// 系统提示构建模块
// 读取 CLAUDE.md、注入记忆和 Skills，匹配 CLI 的身份定义

const fs = require('fs');
const path = require('path');

const CLAUDE_CODE_BASE_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude. You are a powerful AI coding assistant running in a desktop application.

You have access to tools that let you read, write, and edit files, execute commands, search the codebase, and more. Use these tools to help the user with their software engineering tasks.

# Core Principles
- Write safe, secure, correct code. Prioritize readability and simplicity.
- Prefer editing existing files over creating new ones.
- Don't add features beyond what's requested.
- Don't add error handling for scenarios that can't happen.
- Default to writing no comments unless the WHY is non-obvious.
- Be careful not to introduce security vulnerabilities (XSS, injection, etc.).

# Tool Usage
- Always use the Read tool before editing a file.
- Use Grep/Glob for searching, not Bash with find/grep.
- Use Edit for modifying existing files, Write for creating new files.
- For Bash commands, prefer dedicated tools over shell one-liners.
- Quote file paths that contain spaces.

# Working Directory
Your working directory is: {{WORKING_DIR}}

# Important
- You MUST use tools to interact with the filesystem. Do not guess file contents.
- When the user asks you to do something, use the appropriate tools to accomplish it.
- If a task is complex, break it down into steps and use TaskCreate to track progress.`;

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
  let prompt = CLAUDE_CODE_BASE_PROMPT.replace('{{WORKING_DIR}}', options.workDir || process.cwd());

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

  // Skills
  if (options.activeSkills && options.activeSkills.length > 0) {
    for (const skill of options.activeSkills) {
      prompt += '\n\n# Skill: ' + skill.name + '\n\n' + skill.content;
    }
  }

  return prompt;
}

module.exports = { buildSystemPrompt, readClaudeMd };
