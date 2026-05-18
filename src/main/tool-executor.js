// 工具执行器模块
// 在主进程中执行所有工具，无需 IPC 往返

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ==================== 文件操作工具 ====================

function read(input) {
  const filePath = input.file_path;
  if (!filePath) return { error: 'file_path is required' };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const offset = input.offset || 0;
    const limit = input.limit || lines.length;
    const sliced = lines.slice(offset, offset + limit);

    // 加行号
    const numbered = sliced.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');
    const total = lines.length;
    const from = offset + 1;
    const to = Math.min(offset + limit, total);

    return { content: `${from}-${to} of ${total} lines\n${numbered}` };
  } catch (err) {
    return { error: err.message };
  }
}

function write(input) {
  const { file_path, content } = input;
  if (!file_path || content === undefined) return { error: 'file_path and content are required' };

  try {
    const dir = path.dirname(file_path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file_path, content, 'utf-8');
    return { content: `File written: ${file_path} (${content.length} chars)` };
  } catch (err) {
    return { error: err.message };
  }
}

function edit(input) {
  const { file_path, old_string, new_string } = input;
  if (!file_path || old_string === undefined || new_string === undefined) {
    return { error: 'file_path, old_string, and new_string are required' };
  }

  try {
    const content = fs.readFileSync(file_path, 'utf-8');

    // 检查唯一性
    const count = content.split(old_string).length - 1;
    if (count === 0) return { error: 'old_string not found in file' };
    if (count > 1) return { error: `old_string is not unique (${count} matches). Add more context.` };

    const newContent = content.replace(old_string, new_string);
    fs.writeFileSync(file_path, newContent, 'utf-8');
    return { content: `File edited: ${file_path}` };
  } catch (err) {
    return { error: err.message };
  }
}

// ==================== 搜索工具 ====================

function globSearch(input) {
  const { pattern, path: searchPath } = input;
  if (!pattern) return { error: 'pattern is required' };

  const dir = searchPath || process.cwd();
  try {
    // 使用 Node.js 内置的 fs 实现简单 glob
    const results = [];
    function walk(currentPath, depth) {
      if (depth > 10) return;
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              walk(fullPath, depth + 1);
            }
          } else {
            // 简单匹配
            const rel = path.relative(dir, fullPath).replace(/\\/g, '/');
            if (matchGlob(rel, pattern)) {
              results.push(fullPath);
            }
          }
        }
      } catch {}
    }
    walk(dir, 0);
    return { content: results.join('\n') || 'No files found' };
  } catch (err) {
    return { error: err.message };
  }
}

function matchGlob(filePath, pattern) {
  // 简单 glob 匹配：支持 ** 和 *
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp('^' + regex + '$').test(filePath);
}

function grep(input) {
  const { pattern, path: searchPath, glob: globPattern, output_mode = 'content' } = input;
  if (!pattern) return { error: 'pattern is required' };

  const target = searchPath || process.cwd();
  const regex = new RegExp(pattern, 'gi');

  try {
    const results = [];
    function searchFile(filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (regex.test(line)) {
            regex.lastIndex = 0;
            if (output_mode === 'files_with_matches') {
              if (!results.includes(filePath)) results.push(filePath);
            } else {
              results.push(`${filePath}:${i + 1}: ${line}`);
            }
          }
        });
      } catch {}
    }

    function walkDir(dirPath) {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              walkDir(fullPath);
            }
          } else {
            if (globPattern && !matchGlob(entry.name, globPattern)) continue;
            searchFile(fullPath);
          }
        }
      } catch {}
    }

    const stat = fs.statSync(target, { throwIfNoEntry: false });
    if (stat?.isFile()) {
      searchFile(target);
    } else {
      walkDir(target);
    }

    return { content: results.join('\n') || 'No matches found' };
  } catch (err) {
    return { error: err.message };
  }
}

// ==================== 命令执行 ====================

function bash(input) {
  const { command, timeout = 120000 } = input;
  if (!command) return { error: 'command is required' };

  try {
    const output = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024 * 10,
      shell: 'cmd.exe',
    });
    return { content: output || '(no output)' };
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    return { content: stdout + (stderr ? '\nSTDERR:\n' + stderr : ''), error: err.message };
  }
}

// ==================== 目录列表 ====================

function listDirectory(input) {
  const { path: dirPath } = input;
  if (!dirPath) return { error: 'path is required' };

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map(e => {
      const fullPath = path.join(dirPath, e.name);
      let size = 0;
      try {
        if (e.isFile()) size = fs.statSync(fullPath).size;
      } catch {}
      const type = e.isDirectory() ? 'dir' : 'file';
      const sizeStr = type === 'dir' ? '' : ` (${formatSize(size)})`;
      return `${type === 'dir' ? '📁' : '📄'} ${e.name}${sizeStr}`;
    });
    return { content: items.join('\n') || '(empty directory)' };
  } catch (err) {
    return { error: err.message };
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ==================== 网络工具 ====================

async function webSearch(input) {
  const { query } = input;
  if (!query) return { error: 'query is required' };

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'cc-wrap/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();

    let result = '';
    if (data.AbstractText) result += data.AbstractText + '\n\n';
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) result += `- ${topic.Text}\n`;
        if (topic.FirstURL) result += `  ${topic.FirstURL}\n`;
      }
    }
    return { content: result || 'No results found' };
  } catch (err) {
    return { error: err.message };
  }
}

async function webFetch(input) {
  const { url, prompt } = input;
  if (!url) return { error: 'url is required' };

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (desktop)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return { error: `WebFetch 失败: HTTP ${response.status} (${url})` };
    }

    const html = await response.text();

    // 简单 HTML 转文本
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#?\w+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const maxLen = 10000;
    const truncated = text.length > maxLen ? text.substring(0, maxLen) + '...' : text;

    let result = `Content of ${url}:\n\n${truncated}`;
    if (prompt) result += `\n\nUser requested: ${prompt}`;
    return { content: result };
  } catch (err) {
    return { error: `WebFetch 失败: ${err.message} (${url})` };
  }
}

// ==================== 任务管理 ====================

const taskStore = new Map();

function taskCreate(input) {
  const { subject, description } = input;
  if (!subject) return { error: 'subject is required' };
  const id = 'task_' + Date.now();
  const task = { id, subject, description: description || '', status: 'pending', createdAt: Date.now() };
  taskStore.set(id, task);
  return { content: JSON.stringify(task) };
}

function taskUpdate(input) {
  const { taskId, status } = input;
  if (!taskId || !status) return { error: 'taskId and status are required' };
  const task = taskStore.get(taskId);
  if (!task) return { error: 'Task not found: ' + taskId };
  task.status = status;
  return { content: JSON.stringify(task) };
}

// ==================== 子代理 ====================

async function agent(input) {
  const { prompt, description } = input;
  if (!prompt) return { error: 'prompt is required' };

  try {
    // 简化版子代理：直接执行任务并返回结果
    // 实际的子代理需要独立的上下文窗口和工具循环
    const result = [];
    result.push(`子代理任务: ${description || '未指定描述'}`);
    result.push(`提示: ${prompt}`);
    result.push('');
    result.push('注意: 完整的子代理功能需要独立的上下文窗口支持。');
    result.push('当前为简化版本，仅返回任务描述。');
    result.push('如需完整功能，请在主对话中直接执行任务。');

    return { content: result.join('\n') };
  } catch (err) {
    return { error: `子代理执行失败: ${err.message}` };
  }
}

// ==================== 统一调度 ====================

const TOOL_HANDLERS = {
  Read: (input) => read(input),
  Write: (input) => write(input),
  Edit: (input) => edit(input),
  Glob: (input) => globSearch(input),
  Grep: (input) => grep(input),
  Bash: (input) => bash(input),
  ListDirectory: (input) => listDirectory(input),
  WebSearch: (input) => webSearch(input),
  WebFetch: (input) => webFetch(input),
  Agent: (input) => agent(input),
  TaskCreate: (input) => taskCreate(input),
  TaskUpdate: (input) => taskUpdate(input),
};

/**
 * 执行工具
 * @param {string} toolName - 工具名称
 * @param {object} input - 工具输入参数
 * @returns {Promise<{content?: string, error?: string}>}
 */
async function executeTool(toolName, input) {
  // 先查内置工具
  const handler = TOOL_HANDLERS[toolName];
  if (handler) {
    try {
      const result = await handler(input);
      return result;
    } catch (err) {
      return { error: `${toolName} failed: ${err.message}` };
    }
  }

  // 再查 MCP 工具
  const { getMcpToolHandler } = require('./mcp-client');
  const mcpHandler = getMcpToolHandler(toolName);
  if (mcpHandler) {
    try {
      return await mcpHandler(input);
    } catch (err) {
      return { error: `MCP ${toolName} failed: ${err.message}` };
    }
  }

  return { error: `Unknown tool: ${toolName}` };
}

module.exports = { executeTool, taskStore };
