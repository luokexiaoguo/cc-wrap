// 工具执行器模块
// 在主进程中执行所有工具，无需 IPC 往返

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const iconv = require('iconv-lite');

// 允许 main.js 注入 env 配置（如 TAVILY_API_KEY 等）
let _envConfig = {};
function setEnvConfig(env) { _envConfig = env || {}; }

// ==================== Agent 类型系统 ====================
const AGENT_TYPES = {
  'explore': {
    allowTools: ['Glob', 'Grep', 'Read', 'Bash', 'ListDirectory', 'WebSearch', 'WebFetch'],
    systemPromptSuffix: '\n\n你是一个探索代理，只使用搜索和读取类工具快速调研信息，不要修改任何文件。完成后用中文简洁汇报关键发现。'
  },
  'plan': {
    allowTools: ['Glob', 'Grep', 'Read', 'ListDirectory', 'WebSearch', 'WebFetch'],
    systemPromptSuffix: '\n\n你是一个架构规划代理，只使用搜索和读取类工具分析代码结构，输出分步实施方案。不要修改任何文件。'
  }
};

// 后台 Agent 追踪
const backgroundAgents = new Map(); // taskId → { promise, status, result, ... }

function clearBackgroundAgents() {
  backgroundAgents.clear();
}

function filterToolsByAgentType(tools, type) {
  const config = AGENT_TYPES[type];
  if (!config || !config.allowTools) return tools;
  return tools.filter(t => config.allowTools.includes(t.name));
}

// 读文件 + 自动识别编码（UTF-8 BOM / UTF-16 LE/BE / 严格 UTF-8 / GBK 兜底）
function readTextSmart(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf-8');
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return iconv.decode(buf.slice(2), 'utf-16le');
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return iconv.decode(buf.slice(2), 'utf-16be');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (_) {
    try { return iconv.decode(buf, 'gbk'); }
    catch (_) { return buf.toString('latin1'); }
  }
}

// Read 工具默认大小上限（防止读大文件 OOM 主进程）
const READ_MAX_BYTES = 2 * 1024 * 1024;

// 解析路径：相对路径基于 workDir，绝对路径保持不变
function resolvePath(p, workDir) {
  if (!p) return workDir || process.cwd();
  if (path.isAbsolute(p)) return p;
  return path.resolve(workDir || process.cwd(), p);
}

// 规范化换行符（消除 CRLF/LF 不一致导致的 Edit 失配）
function normalizeLineEndings(s) {
  return typeof s === 'string' ? s.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : s;
}

// ==================== 文件操作工具 ====================

function read(input, ctx) {
  const fp = input.file_path || input.filePath;
  if (!fp) return { error: 'file_path is required' };
  const filePath = resolvePath(fp, ctx.workDir);

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > READ_MAX_BYTES && !(input.offset || input.limit)) {
      return { error: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB > ${READ_MAX_BYTES / 1024 / 1024}MB)。请用 offset/limit 分页读取。` };
    }

    const content = readTextSmart(filePath);
    const lines = content.split('\n');
    const offset = input.offset || 0;
    const limit = input.limit || lines.length;
    const sliced = lines.slice(offset, offset + limit);

    const numbered = sliced.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');
    const total = lines.length;
    const from = offset + 1;
    const to = Math.min(offset + limit, total);

    return { content: `${from}-${to} of ${total} lines\n${numbered}` };
  } catch (err) {
    return { error: err.message };
  }
}

function write(input, ctx) {
  const content = input.content;
  const filePath = input.file_path || input.filePath;
  if (!filePath || content === undefined) return { error: 'file_path and content are required' };
  const resolved = resolvePath(filePath, ctx.workDir);

  try {
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return { content: `File written: ${resolved} (${content.length} chars)` };
  } catch (err) {
    return { error: err.message };
  }
}

function edit(input, ctx) {
  const filePath = input.file_path || input.filePath;
  const old_string = input.old_string !== undefined ? input.old_string : input.oldString;
  const new_string = input.new_string !== undefined ? input.new_string : input.newString;
  if (!filePath || old_string === undefined || new_string === undefined) {
    return { error: 'file_path, old_string, and new_string are required' };
  }
  const editPath = resolvePath(filePath, ctx.workDir);

  try {
    const rawContent = readTextSmart(editPath);
    const hasCRLF = rawContent.includes('\r\n');
    // 在规范化的副本上匹配，消除 CRLF/LF 差异
    const normContent = normalizeLineEndings(rawContent);
    const normOld = normalizeLineEndings(old_string);
    const normNew = normalizeLineEndings(new_string);

    const count = normContent.split(normOld).length - 1;
    if (count === 0) return { error: 'old_string not found in file' };
    if (count > 1) return { error: `old_string is not unique (${count} matches). Add more context.` };

    let newContent = normContent.replace(normOld, normNew);
    // 写回时保留原文件的行尾风格
    if (hasCRLF) newContent = newContent.replace(/\n/g, '\r\n');
    fs.writeFileSync(editPath, newContent, 'utf-8');
    return { content: `File edited: ${editPath}` };
  } catch (err) {
    return { error: err.message };
  }
}

// ==================== 搜索工具 ====================

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', '.venv', 'venv']);

function globSearch(input, ctx) {
  const { pattern } = input;
  if (!pattern) return { error: 'pattern is required' };

  const dir = resolvePath(input.path, ctx.workDir);
  try {
    const results = [];
    function walk(currentPath, depth) {
      if (depth > 12) return;
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && !EXCLUDED_DIRS.has(entry.name)) {
              walk(fullPath, depth + 1);
            }
          } else {
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
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp('^' + regex + '$').test(filePath);
}

function grep(input, ctx) {
  const pattern = input.pattern;
  const globPattern = input.glob;
  const output_mode = input.output_mode || input.outputMode || 'content';
  if (!pattern) return { error: 'pattern is required' };

  const target = resolvePath(input.path, ctx.workDir);
  let regex;
  try {
    regex = new RegExp(pattern, 'gi');
  } catch (e) {
    return { error: `非法正则: ${e.message}` };
  }

  try {
    const results = [];
    function searchFile(filePath) {
      try {
        // 跳过超大文件
        const stat = fs.statSync(filePath);
        if (stat.size > 5 * 1024 * 1024) return;
        const content = readTextSmart(filePath);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          regex.lastIndex = 0;
          if (regex.test(line)) {
            if (output_mode === 'files_with_matches') {
              if (!results.includes(filePath)) results.push(filePath);
            } else {
              results.push(`${filePath}:${i + 1}: ${line}`);
            }
          }
        });
      } catch {}
    }

    function walkDir(dirPath, depth) {
      if (depth > 12) return;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && !EXCLUDED_DIRS.has(entry.name)) {
              walkDir(fullPath, depth + 1);
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
      walkDir(target, 0);
    }

    return { content: results.join('\n') || 'No matches found' };
  } catch (err) {
    return { error: err.message };
  }
}

// ==================== 命令执行（异步、不阻塞主进程）====================

// Windows 上探测 git-bash（模型习惯写 bash 风格命令，cmd 不认）
let _winShellCache = null;
function detectWinShell() {
  if (_winShellCache !== null) return _winShellCache;
  if (process.platform !== 'win32') { _winShellCache = null; return null; }
  const candidates = [
    process.env.GIT_BASH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.LOCALAPPDATA && require('path').join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { _winShellCache = c; return c; } } catch (_) {}
  }
  _winShellCache = '';
  return null;
}

function bash(input, ctx) {
  const { command, timeout = 120000 } = input;
  if (!command) return { error: 'command is required' };

  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    // 优先用 ctx.shell（用户在设置里指定），否则 Windows 上探测 git-bash，
    // 没有再回退 cmd.exe。模型习惯写 bash 风格命令，用 git-bash 直接兼容。
    const winBash = isWin ? detectWinShell() : null;
    const shell = ctx.shell || (isWin ? (winBash || process.env.COMSPEC || 'cmd.exe') : '/bin/sh');
    const useBash = !isWin || (shell && /bash(\.exe)?$/i.test(shell));
    // Windows: python3 命令不存在（标准 Python 只有 python.exe），替换为 python
    let cmd = command;
    if (isWin) {
      cmd = cmd.replace(/\bpython3\b/g, 'python');
    }
    const shellArgs = useBash ? ['-c', cmd] : ['/d', '/s', '/c', cmd];

    let env = { ...process.env, ..._envConfig };

    let proc;
    try {
      proc = spawn(shell, shellArgs, {
        cwd: ctx.workDir || process.cwd(),
        env,
        windowsHide: true,
      });
    } catch (err) {
      return resolve({ error: '启动 shell 失败: ' + err.message });
    }

    let stdoutChunks = [];
    let stderrChunks = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    const MAX_OUT = 1024 * 1024 * 5; // 5MB
    let truncated = false;

    proc.stdout.on('data', (d) => {
      if (stdoutLen < MAX_OUT) { stdoutChunks.push(d); stdoutLen += d.length; }
      else truncated = true;
    });
    proc.stderr.on('data', (d) => {
      if (stderrLen < MAX_OUT) { stderrChunks.push(d); stderrLen += d.length; }
      else truncated = true;
    });

    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      // Windows 上 SIGTERM 可能无效，500ms 后强杀
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 500);
    }, timeout);

    // 用户取消时立刻杀进程
    const onAbort = () => {
      try { proc.kill('SIGKILL'); } catch {}
    };
    if (ctx.signal) {
      if (ctx.signal.aborted) onAbort();
      else ctx.signal.addEventListener('abort', onAbort, { once: true });
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (ctx.signal) try { ctx.signal.removeEventListener('abort', onAbort); } catch {}
      const decode = (chunks) => {
        if (!chunks.length) return '';
        const buf = Buffer.concat(chunks);
        // Windows 上 cmd.exe 默认 GBK/CP936。先按 utf-8 严格解码探测，失败回退 GBK
        if (process.platform === 'win32') {
          try {
            const s = buf.toString('utf-8');
            // U+FFFD（替换字符）出现 = 解码失败，按 GBK 重试
            if (!s.includes('�')) return s;
          } catch {}
          try { return iconv.decode(buf, 'gbk'); } catch {}
        }
        return buf.toString('utf-8');
      };
      const stdout = decode(stdoutChunks);
      const stderr = decode(stderrChunks);
      let out = stdout;
      if (stderr) out += (out ? '\n' : '') + 'STDERR:\n' + stderr;
      if (truncated) out += '\n[输出已截断]';
      if (code === 0) {
        resolve({ content: out || '(no output)' });
      } else {
        resolve({ content: out, error: `exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ error: err.message });
    });
  });
}

// ==================== 目录列表 ====================

function listDirectory(input, ctx) {
  const dirPath = resolvePath(input.path, ctx.workDir);
  if (!input.path) return { error: 'path is required' };

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
      return `${type === 'dir' ? '[D]' : '[F]'} ${e.name}${sizeStr}`;
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

// 简易 HTML 反转义 + 去标签
function _stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// DuckDuckGo 的结果链接经常被包成 //duckduckgo.com/l/?uddg=ENCODED_URL，需还原
function _unwrapDdgRedirect(href) {
  if (!href) return href;
  try {
    let u;
    if (href.startsWith('//')) u = new URL('https:' + href);
    else if (href.startsWith('/')) u = new URL('https://duckduckgo.com' + href);
    else u = new URL(href);
    const real = u.searchParams.get('uddg');
    if (real) return decodeURIComponent(real);
    return href.startsWith('//') ? 'https:' + href : href;
  } catch {
    return href;
  }
}

async function webSearch(input, ctx) {
  const { query } = input;
  if (!query) return { error: 'query is required' };

  // DuckDuckGo HTML 端点：无需 API key 的真实网页搜索（带时效性）。
  // 旧实现走 api.duckduckgo.com 的 Instant Answer，那个只回维基百科摘要，对时效性查询基本没用。
  try {
    const body = new URLSearchParams({ q: query, kl: 'wt-wt' }).toString();
    const response = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://duckduckgo.com/',
      },
      body,
      redirect: 'follow',
      signal: ctx.signal || AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { error: `WebSearch 失败: HTTP ${response.status}` };
    }

    const html = await response.text();

    // 解析标题/链接：<a class="result__a" href="...">Title</a>
    const titleRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    // 解析摘要：<a class="result__snippet" ...>Snippet</a>  或  <div class="result__snippet">...</div>
    const snippetRe = /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/g;

    const titles = [];
    let m;
    while ((m = titleRe.exec(html)) !== null) {
      titles.push({ href: _unwrapDdgRedirect(m[1]), title: _stripTags(m[2]) });
      if (titles.length >= 10) break;
    }
    const snippets = [];
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(_stripTags(m[1]));
      if (snippets.length >= 10) break;
    }

    const N = Math.min(titles.length, 8);
    if (N === 0) {
      // DDG 有时会要求二次跳转/出验证码，给个明确提示，便于上层调度到 MCP 搜索
      return { content: `No results parsed for query: ${query}\n(DuckDuckGo HTML 端点可能临时限流，建议改用 MCP 搜索工具重试)` };
    }

    let out = `查询: ${query}\n找到 ${N} 条网页结果：\n\n`;
    for (let i = 0; i < N; i++) {
      const t = titles[i];
      out += `${i + 1}. ${t.title}\n   ${t.href}\n   ${snippets[i] || ''}\n\n`;
    }
    return { content: out.trim() };
  } catch (err) {
    return { error: 'WebSearch 失败: ' + err.message };
  }
}

async function webFetch(input, ctx) {
  const { url, prompt } = input;
  if (!url) return { error: 'url is required' };

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (desktop)' },
      redirect: 'follow',
      signal: ctx.signal || AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return { error: `WebFetch 失败: HTTP ${response.status} (${url})` };
    }

    const html = await response.text();

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

// IPC 推送：主进程 → 渲染端，每次任务变化时通知 UI 刷新
function emitTasksChanged(ctx) {
  try {
    const list = Array.from(taskStore.values());
    if (ctx && ctx.window && !ctx.window.isDestroyed()) {
      ctx.window.webContents.send('tasks-changed', list);
    }
  } catch (_) {}
}

function taskCreate(input, ctx) {
  const { subject, description } = input;
  if (!subject) return { error: 'subject is required' };
  const id = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const task = { id, subject, description: description || '', status: 'pending', createdAt: Date.now() };
  taskStore.set(id, task);
  emitTasksChanged(ctx);
  return { content: JSON.stringify(task) };
}

function taskUpdate(input, ctx) {
  const { taskId, status } = input;
  if (!taskId || !status) return { error: 'taskId and status are required' };
  const task = taskStore.get(taskId);
  if (!task) return { error: 'Task not found: ' + taskId };
  if (status === 'deleted') {
    taskStore.delete(taskId);
  } else {
    task.status = status;
    task.updatedAt = Date.now();
  }
  emitTasksChanged(ctx);
  return { content: JSON.stringify(task) };
}

function taskClearAll(ctx) {
  taskStore.clear();
  emitTasksChanged(ctx);
}

function taskGetAll() {
  return Array.from(taskStore.values());
}

// ==================== Skill 安装 ====================

async function installSkill(input, ctx) {
  const { name, description = '', content = '', triggers = [], alwaysActive = false, files } = input || {};
  if (!name) return { error: 'name is required' };
  if (!content) return { error: 'content is required (SKILL.md 正文)' };

  // 校验 name 合法（避免路径穿越）
  if (!/^[a-zA-Z0-9][\w.-]{0,63}$/.test(name)) {
    return { error: 'name 不合法，只允许 [a-zA-Z0-9_.-]，长度 1-64' };
  }

  try {
    const { app } = require('electron');
    const userData = app.getPath('userData');
    const skillDir = path.join(userData, 'skills', name);
    await fs.promises.mkdir(skillDir, { recursive: true });

    // 拼 frontmatter
    const triggerList = Array.isArray(triggers) ? triggers : [];
    const frontmatter =
      '---\n' +
      'name: ' + name + '\n' +
      'description: ' + JSON.stringify(description) + '\n' +
      'triggers: ' + JSON.stringify(triggerList) + '\n' +
      'alwaysActive: ' + (alwaysActive ? 'true' : 'false') + '\n' +
      '---\n\n';

    const md = frontmatter + (content.startsWith('---') ? content.replace(/^---[\s\S]*?\n---\s*\n+/, '') : content);
    const target = path.join(skillDir, 'SKILL.md');
    await fs.promises.writeFile(target, md, 'utf-8');

    // 写入附属文件（scripts, configs, templates 等）
    if (Array.isArray(files)) {
      for (const f of files) {
        if (!f.path || typeof f.content !== 'string') continue;
        // 防路径穿越：确保解析后的路径在 skillDir 内
        const fPath = path.resolve(skillDir, f.path);
        if (!fPath.startsWith(path.resolve(skillDir) + path.sep)) {
          console.warn('[installSkill] 路径穿越拦截:', f.path);
          continue;
        }
        await fs.promises.mkdir(path.dirname(fPath), { recursive: true });
        await fs.promises.writeFile(fPath, f.content, 'utf-8');
      }
    }

    // 通知渲染端刷新 Skill 列表
    // 广播到所有 BrowserWindow，而不是只发给 ctx.window —— 调用路径多了之后
    // ctx.window 有时候会拿不到（execute-tool IPC、子 agent、未来新增的入口）。
    // 广播是无副作用的，多发一次也没事。
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      console.log('[installSkill] file written:', target, '— broadcasting skills-changed to', wins.length, 'window(s)');
      wins.forEach(w => {
        if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
          try { w.webContents.send('skills-changed'); } catch (_) {}
        }
      });
    } catch (e) {
      console.warn('[installSkill] broadcast failed:', e.message);
    }

    let resultMsg =
      'Skill "' + name + '" 已注册到 cc-wrap。\n' +
      '路径: ' + target + '\n' +
      '触发词: ' + (triggerList.length > 0 ? triggerList.join(', ') : '(无)') + '\n' +
      '常驻: ' + (alwaysActive ? '是' : '否') + '\n';
    const fileCount = Array.isArray(files) ? files.length : 0;
    if (fileCount > 0) resultMsg += '附属文件: ' + fileCount + ' 个\n';
    return { content: resultMsg + '用户下次发相关消息时会自动激活；也可在左侧 Skills 面板看到。' };
  } catch (err) {
    return { error: '写入失败: ' + err.message };
  }
}

// ==================== MCP 安装（完整版）====================
// 支持自动安装依赖、传输类型检测、GitHub URL 解析、HTTP 端点探测

// 简易命令执行（用于 npm/pip 安装）
function execInstallCmd(cmd, cwd) {
  return new Promise((resolve) => {
    const cp = require('child_process');
    const proc = cp.exec(cmd, {
      cwd: cwd || process.cwd(),
      timeout: 120000,
      windowsHide: true,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ error: err.message, stdout: stdout || '', stderr: stderr || '' });
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      }
    });
  });
}

// 探测 HTTP URL 是否为 MCP 端点
async function probeHttpEndpoint(url) {
  let getResponse;
  try {
    getResponse = await fetch(url, {
      headers: { 'Accept': 'application/json, text/event-stream' },
      signal: AbortSignal.timeout(10000),
    });
  } catch { getResponse = null; }

  if (getResponse && getResponse.ok) {
    const ct = getResponse.headers.get('content-type') || '';
    if (ct.includes('text/event-stream') || ct.includes('json')) {
      return { isMcp: true, mode: 'streamable-http' };
    }
  }

  // POST 握手检测
  try {
    const postResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cc-wrap', version: '1.0.0' } }
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await postResp.json();
    if (data && data.result && data.result.protocolVersion) {
      return { isMcp: true, mode: 'post-only' };
    }
  } catch {}

  // 尝试 JSON-RPC tools/list
  try {
    const postResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await postResp.json();
    if (data && data.result && Array.isArray(data.result.tools)) {
      return { isMcp: true, mode: 'post-only', toolCount: data.result.tools.length };
    }
  } catch {}

  return { isMcp: false };
}

// 解析 GitHub repo → 获取 MCP 配置
async function resolveGithubRepo(repo, userArgs) {
  const parts = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
  const owner = parts[0], pkg = parts[1];
  if (!owner || !pkg) return { error: `GitHub 仓库格式无效: "${repo}"，应为 "owner/repo"` };

  const log = [];

  // 优先查找 mcp.json / mcpServers 配置
  const configUrls = [
    `https://raw.githubusercontent.com/${owner}/${pkg}/main/mcp.json`,
    `https://raw.githubusercontent.com/${owner}/${pkg}/master/mcp.json`,
    `https://raw.githubusercontent.com/${owner}/${pkg}/main/.mcp.json`,
    `https://raw.githubusercontent.com/${owner}/${pkg}/master/.mcp.json`,
  ];
  for (const url of configUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        const config = await resp.json();
        const servers = config.mcpServers || config.servers || config;
        const keys = Object.keys(servers);
        if (keys.length > 0) {
          const first = servers[keys[0]];
          log.push(`从 ${url} 解析到 MCP 配置`);
          return {
            command: first.command || first.url || '',
            args: first.args || [],
            env: first.env || {},
            cwd: first.cwd || '',
            _log: log,
          };
        }
      }
    } catch {}
  }

  // 获取 README 分析安装方式
  const readmeUrls = [
    `https://raw.githubusercontent.com/${owner}/${pkg}/main/README.md`,
    `https://raw.githubusercontent.com/${owner}/${pkg}/master/README.md`,
  ];
  let readme = null;
  for (const url of readmeUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) { readme = await resp.text(); log.push('已获取 README'); break; }
    } catch {}
  }

  if (readme) {
    // 查找 JSON 代码块中的 mcpServers 定义
    const blocks = readme.match(/```(?:json)?\s*(\{[\s\S]*?\})[\s\S]*?```/g);
    if (blocks) {
      for (const block of blocks) {
        try {
          const jsonStr = block.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(jsonStr);
          const servers = parsed.mcpServers || parsed.servers;
          if (servers && typeof servers === 'object') {
            const keys = Object.keys(servers);
            if (keys.length > 0) {
              const first = servers[keys[0]];
              if (first.command || first.url) {
                log.push('从 README JSON 块解析到 MCP 配置');
                return {
                  command: first.command || first.url,
                  args: first.args || [],
                  env: first.env || {},
                  cwd: first.cwd || '',
                  _log: log,
                };
              }
            }
          }
        } catch {}
      }
    }

    // 查找 npm 安装指令
    const npmMatch = readme.match(/npm\s+(?:install|i|add)\s+(-g\s+)?(['"]?)([@\w\-./]+)\2/i);
    if (npmMatch) {
      const pkgName = npmMatch[3];
      log.push(`从 README 检测到 npm 包: ${pkgName}`);
      const installResult = await execInstallCmd(`npm install -g ${pkgName}`, null);
      if (!installResult.error) {
        log.push(`npm install -g ${pkgName} 成功`);
        return {
          command: 'npx',
          args: ['-y', pkgName, ...(userArgs || [])],
          _autoInstalled: true,
          _log: log,
        };
      }
      log.push(`npm install -g ${pkgName} 失败: ${installResult.error}`);
    }

    // 查找 pip 安装指令
    const pipMatch = readme.match(/pip\s+(?:install)\s+([\w\-.\[\]]+)/i);
    if (pipMatch) {
      const pkgName = pipMatch[1];
      log.push(`从 README 检测到 pip 包: ${pkgName}`);
      const installResult = await execInstallCmd(`pip install ${pkgName}`, null);
      if (!installResult.error) {
        log.push(`pip install ${pkgName} 成功`);
        return {
          command: 'python',
          args: ['-m', pkgName.replace(/-/g, '_'), ...(userArgs || [])],
          _autoInstalled: true,
          _log: log,
        };
      }
      log.push(`pip install ${pkgName} 失败: ${installResult.error}`);
    }

    // 查找 uvx 命令
    if (readme.includes('uvx ') || readme.includes('npx ')) {
      const uvxMatch = readme.match(/uvx\s+([\w\-./@]+)/);
      if (uvxMatch) {
        log.push('从 README 检测到 uvx 命令');
        return {
          command: 'uvx',
          args: [uvxMatch[1], ...(userArgs || [])],
          _log: log,
        };
      }
    }
  }

  // 最后兜底：尝试作为 npm 包安装
  const npmName = pkg.startsWith('server-') ? `@${owner}/${pkg}` : pkg;
  log.push(`尝试作为 npm 包安装: ${npmName}`);
  const installResult = await execInstallCmd(`npm install -g ${npmName} 2>&1`, null);
  if (!installResult.error) {
    log.push(`npm install -g ${npmName} 成功`);
    return {
      command: 'npx',
      args: ['-y', npmName, ...(userArgs || [])],
      _autoInstalled: true,
      _log: log,
    };
  }
  log.push(`npm install -g ${npmName} 失败: ${installResult.error}`);

  return { error: `无法自动解析 ${repo} 的 MCP 配置。\n已尝试:\n` + log.map(l => '  • ' + l).join('\n') + '\n\n请手动提供 command/args 参数。', _log: log };
}

// 根据名称尝试 npm/pip 自动安装
async function tryAutoInstallPackage(name) {
  // scoped 包 (@scope/name) → npm
  if (name.startsWith('@')) {
    const r = await execInstallCmd(`npm install -g ${name} 2>&1`, null);
    if (!r.error) return { type: 'npm', stdout: r.stdout };
    return null;
  }

  // 包含 server- 前缀 → npm
  if (name.includes('server-') || name.includes('mcp-')) {
    const r = await execInstallCmd(`npm install -g ${name} 2>&1`, null);
    if (!r.error) return { type: 'npm', stdout: r.stdout };
    return null;
  }

  return null;
}

// 传输类型解析
async function resolveMcpConfig(opts) {
  const { name, command, args: inputArgs, env, cwd: inputCwd, transport } = opts;
  let t = transport || 'auto';
  const log = [];

  // auto 模式：根据 command 格式推断
  if (t === 'auto') {
    if (command.startsWith('http://') || command.startsWith('https://')) {
      // HTTP URL → 探测是否是 MCP 端点
      log.push('检测到 HTTP URL，探测 MCP 端点...');
      const probe = await probeHttpEndpoint(command);
      if (probe.isMcp) {
        log.push(`确认 MCP HTTP 端点 (${probe.mode} 模式)`);
        return { command, args: [], env, cwd: inputCwd, _isHttp: true, _log: log };
      }
      log.push('非 MCP HTTP 端点，适配为 HTTP/SSE 模式');
      return { command, args: [], env, cwd: inputCwd, _isHttp: true, _log: log };
    }

    if (/^[a-zA-Z0-9][\w.-]*\/[\w.-]+$/.test(command) && !command.includes('\\')) {
      // GitHub user/repo 格式
      log.push(`检测到 GitHub 仓库格式: ${command}`);
      const ghResult = await resolveGithubRepo(command, inputArgs);
      return { ...ghResult, env: { ...(ghResult.env || {}), ...env }, _log: [...log, ...(ghResult._log || [])] };
    }

    // 以 @ 开头 → npm scoped 包
    if (command.startsWith('@')) {
      log.push(`检测到 npm scoped 包: ${command}`);
      const installResult = await execInstallCmd(`npm install -g ${command} 2>&1`, null);
      if (!installResult.error) {
        log.push(`npm install -g ${command} 成功`);
        return { command: 'npx', args: ['-y', command, ...(inputArgs || [])], env, cwd: inputCwd, _autoInstalled: true, _log: log };
      }
      log.push(`npm install 失败: ${installResult.error}`);
      return { command: 'npx', args: ['-y', command, ...(inputArgs || [])], env, cwd: inputCwd, _log: log };
    }

    // 其他 → stdio
    log.push('使用 stdio 模式');
    return { command, args: inputArgs || [], env, cwd: inputCwd, _log: log };
  }

  // 显式 transport
  switch (t) {
    case 'http': {
      log.push('HTTP/SSE 模式');
      const probe = await probeHttpEndpoint(command);
      if (probe.isMcp) log.push(`端点确认 (${probe.mode})`);
      return { command, args: [], env, cwd: inputCwd, _isHttp: true, _log: log };
    }
    case 'npm': {
      log.push(`npm 模式: 安装 ${command}`);
      const r = await execInstallCmd(`npm install -g ${command} 2>&1`, null);
      if (r.error) return { error: `npm install -g ${command} 失败: ${r.error}`, _log: [...log, `失败: ${r.error}`] };
      log.push('安装成功');
      return { command: 'npx', args: ['-y', command, ...(inputArgs || [])], env, cwd: inputCwd, _autoInstalled: true, _log: log };
    }
    case 'pip': {
      log.push(`pip 模式: 安装 ${command}`);
      const r = await execInstallCmd(`pip install ${command} 2>&1`, null);
      if (r.error) return { error: `pip install ${command} 失败: ${r.error}`, _log: [...log, `失败: ${r.error}`] };
      log.push('安装成功');
      return { command: 'python', args: ['-m', command.replace(/-/g, '_'), ...(inputArgs || [])], env, cwd: inputCwd, _autoInstalled: true, _log: log };
    }
    case 'uvx': {
      log.push('uvx 模式');
      return { command: 'uvx', args: [command, ...(inputArgs || [])], env, cwd: inputCwd, _log: log };
    }
    case 'stdio':
    default: {
      log.push('stdio 模式');
      return { command, args: inputArgs || [], env, cwd: inputCwd, _log: log };
    }
  }
}

async function installMcp(input, ctx) {
  const { name, command, args = [], env = {}, cwd = '', description = '', transport = 'auto' } = input || {};
  if (!name) return { error: 'name is required' };
  if (!command) return { error: 'command is required' };

  // 校验 name 合法（防路径穿越）
  if (!/^[a-zA-Z0-9][\w.-]{0,63}$/.test(name)) {
    return { error: 'name 不合法，只允许 [a-zA-Z0-9_.-]，长度 1-64' };
  }

  try {
    const { app } = require('electron');
    const userData = app.getPath('userData');
    const mcpPath = path.join(userData, 'mcp-servers.json');
    const fullLog = [];

    // 读取现有配置
    let mcpData = { servers: [] };
    try {
      const raw = fs.readFileSync(mcpPath, 'utf-8');
      mcpData = JSON.parse(raw);
      if (!Array.isArray(mcpData.servers)) mcpData.servers = [];
    } catch { /* 文件不存在 */ }

    // 检查重名
    if (mcpData.servers.some(s => s.name === name)) {
      return { error: `MCP 服务器 "${name}" 已存在。如要覆盖，请先在 Settings > MCP 中删除。` };
    }

    fullLog.push(`[1/4] 解析传输类型...`);
    const resolved = await resolveMcpConfig({ name, command, args, env, cwd, transport });
    if (resolved.error) {
      return { error: resolved.error };
    }

    if (resolved._log) fullLog.push(...resolved._log);

    // 拼装标准配置（与 Settings 面板格式一致）
    const serverConfig = {
      name,
      command: resolved.command,
      args: resolved.args || [],
      cwd: resolved.cwd || '',
      env: resolved.env && Object.keys(resolved.env).length > 0 ? resolved.env : {},
    };
    if (description) serverConfig.description = description;

    fullLog.push(`[2/4] 写入配置...`);
    mcpData.servers.push(serverConfig);
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2));

    fullLog.push(`[3/4] 连接 MCP 服务器...`);
    const mcpModule = require('./mcp-client');
    const results = await mcpModule.connectAllServers([serverConfig]);
    const result = results[0];

    // 广播状态到所有窗口
    fullLog.push(`[4/4] 通知 UI...`);
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      wins.forEach(w => {
        if (w && !w.isDestroyed()) {
          try { w.webContents.send('mcp-status', mcpModule.getServerStatuses()); } catch (_) {}
        }
      });
    } catch (_) {}

    // 构建结果消息
    const steps = resolved._autoInstalled ? '已自动安装依赖并' : '';
    let detailLines = [];
    detailLines.push(`配置路径: ${mcpPath}`);

    if (result && result.status === 'connected') {
      detailLines.push(`状态: 已连接`);
      detailLines.push(`工具: ${result.tools.join(', ')}`);
      if (resolved._autoInstalled) detailLines.push(`(依赖已自动安装)`);
      return {
        content: [
          `MCP 服务器 "${name}" ${steps}配置成功。`,
          ``,
          ...detailLines,
          ``,
          `安装过程:`,
          ...fullLog.map(l => '  ' + l),
          ``,
          `你可以在对话中直接使用以上 MCP 工具。`,
        ].join('\n')
      };
    } else {
      detailLines.push(`状态: 连接失败`);
      detailLines.push(`错误: ${(result && result.error) || '未知错误'}`);
      return {
        content: [
          `MCP 服务器 "${name}" 已写入配置，但连接失败。`,
          ``,
          ...detailLines,
          ``,
          `安装过程:`,
          ...fullLog.map(l => '  ' + l),
          ``,
          `可能的原因:`,
          `  • 检查 ${command} 是否正确安装`,
          `  • 检查环境变量是否配置正确`,
          `  • 检查网络连接`,
          `  • 在 Settings > MCP 中测试连接`,
        ].join('\n'),
        error: `连接失败: ${(result && result.error) || '未知错误'}`
      };
    }
  } catch (err) {
    return { error: '安装 MCP 失败: ' + err.message };
  }
}

// ==================== MCP 发现 ====================

async function discoverMcp(input, ctx) {
  const { source = 'all' } = input || {};
  const results = [];

  // 1. 扫描 cc-wrap 自身配置
  if (source === 'all' || source === 'cc-wrap') {
    try {
      const { app } = require('electron');
      const mcpPath = path.join(app.getPath('userData'), 'mcp-servers.json');
      const raw = fs.readFileSync(mcpPath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.servers) && data.servers.length > 0) {
        results.push({
          source: 'cc-wrap',
          path: mcpPath,
          servers: data.servers.map(s => ({
            name: s.name,
            command: s.command + (s.args && s.args.length > 0 ? ' ' + s.args.join(' ') : ''),
            type: typeof s.command === 'string' && (s.command.startsWith('http://') || s.command.startsWith('https://')) ? 'http' : 'stdio',
          })),
          count: data.servers.length,
        });
      } else {
        results.push({ source: 'cc-wrap', found: false, note: '没有已配置的 MCP 服务器' });
      }
    } catch { results.push({ source: 'cc-wrap', found: false, note: '配置文件不存在' }); }
  }

  // 2. 扫描 Claude Desktop 配置
  if (source === 'all' || source === 'claude-desktop') {
    try {
      const claudePath = path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
      if (fs.existsSync(claudePath)) {
        const raw = fs.readFileSync(claudePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.mcpServers && typeof data.mcpServers === 'object') {
          const servers = Object.entries(data.mcpServers).map(([name, cfg]) => ({
            name,
            command: cfg.command + (cfg.args && cfg.args.length > 0 ? ' ' + cfg.args.join(' ') : ''),
            env: cfg.env ? Object.keys(cfg.env) : [],
            type: 'stdio',
          }));
          results.push({
            source: 'claude-desktop',
            path: claudePath,
            servers,
            count: servers.length,
          });
        } else {
          results.push({ source: 'claude-desktop', path: claudePath, found: false, note: '未配置 MCP 服务器' });
        }
      } else {
        results.push({ source: 'claude-desktop', found: false, note: 'Claude Desktop 未安装或配置文件不存在' });
      }
    } catch (err) {
      results.push({ source: 'claude-desktop', found: false, note: '读取失败: ' + err.message });
    }
  }

  // 3. 扫描 npm 全局包
  if (source === 'all' || source === 'npm') {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync('npm ls -g --depth=0 --json 2>/dev/null || echo "{}"', { timeout: 15000, windowsHide: true });
      const data = JSON.parse(stdout.toString());
      const deps = data.dependencies || {};
      const mcpPackages = Object.keys(deps).filter(name =>
        /mcp|server-|modelcontext/i.test(name) && !name.includes('mcporter')
      );
      if (mcpPackages.length > 0) {
        results.push({
          source: 'npm-global',
          servers: mcpPackages.map(name => ({
            name,
            suggestedCommand: name.startsWith('@') ? `npx -y ${name}` : `npx -y ${name}`,
            type: 'npm',
          })),
          count: mcpPackages.length,
        });
      } else {
        results.push({ source: 'npm-global', found: false, note: '未发现 MCP 相关 npm 全局包' });
      }
    } catch (err) {
      results.push({ source: 'npm-global', found: false, note: '扫描失败: ' + err.message });
    }
  }

  // 4. 扫描 pip 包
  if (source === 'all' || source === 'pip') {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync('pip list --format=json 2>/dev/null || echo "[]"', { timeout: 15000, windowsHide: true });
      const packages = JSON.parse(stdout.toString());
      const mcpPackages = packages.filter(p => /mcp|modelcontext/i.test(p.name));
      if (mcpPackages.length > 0) {
        results.push({
          source: 'pip',
          servers: mcpPackages.map(p => ({
            name: p.name,
            version: p.version,
            suggestedCommand: `python -m ${p.name.replace(/-/g, '_')}`,
            type: 'pip',
          })),
          count: mcpPackages.length,
        });
      } else {
        results.push({ source: 'pip', found: false, note: '未发现 MCP 相关 pip 包' });
      }
    } catch (err) {
      results.push({ source: 'pip', found: false, note: '扫描失败: ' + err.message });
    }
  }

  // 5. 扫描 PATH 中已知的 MCP CLIs
  if (source === 'all' || source === 'path') {
    try {
      const knownMCPTools = [
        { cmd: 'mmx', check: ['--help', 'mcp'] },
        { cmd: 'uvx', check: ['--help'] },
        { cmd: 'claude', check: ['mcp', '--help'] },
      ];
      const found = [];
      for (const tool of knownMCPTools) {
        try {
          const { execSync } = require('child_process');
          execSync(`where ${tool.cmd} 2>nul || which ${tool.cmd} 2>/dev/null`, { timeout: 5000 });
          found.push({ name: tool.cmd, status: 'available', note: tool.cmd + ' 已在 PATH 中' });
        } catch {
          // not found
        }
      }
      if (found.length > 0) {
        results.push({ source: 'path', tools: found, count: found.length });
      } else {
        results.push({ source: 'path', found: false, note: '未发现已知 MCP 相关命令行工具' });
      }
    } catch (err) {
      results.push({ source: 'path', found: false, note: '扫描失败: ' + err.message });
    }
  }

  // 构建返回
  const foundItems = results.filter(r => r.servers || (r.tools && r.tools.length > 0));
  const totalServers = foundItems.reduce((sum, r) => sum + (r.count || 0), 0);

  if (totalServers > 0) {
    let msg = `发现 ${totalServers} 个 MCP 相关配置：\n\n`;
    for (const r of results) {
      if (r.servers && r.servers.length > 0) {
        msg += `【${r.source}】(${r.path || ''})\n`;
        for (const s of r.servers) {
          msg += `  • ${s.name}: ${s.command || s.suggestedCommand}\n`;
        }
        msg += '\n';
      } else if (r.tools && r.tools.length > 0) {
        msg += `【${r.source}】\n`;
        for (const t of r.tools) {
          msg += `  • ${t.name}: ${t.note}\n`;
        }
        msg += '\n';
      }
    }
    msg += '使用 InstallMcp 可导入这些服务器。';
    return { content: msg, _discovered: results };
  }

  // 什么都没发现
  let summary = '未在系统中发现额外的 MCP 服务器配置。\n\n扫描来源:\n';
  for (const r of results) {
    summary += `  • ${r.source}: ${r.note || 'OK'}\n`;
  }
  return { content: summary, _discovered: results };
}

// ==================== 向用户提问 ====================

function askUserQuestion(input, ctx) {
  return new Promise((resolve) => {
    const requestId = 'ask_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    if (!ctx.window || ctx.window.isDestroyed()) {
      resolve({ error: '没有可用窗口显示问题' });
      return;
    }

    ctx.window.webContents.send('agent-question', {
      requestId,
      question: input.question || '',
      options: input.options || []
    });

    const { ipcMain } = require('electron');
    let timer = null;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('agent-question-response', handler);
      if (timer) clearTimeout(timer);
      if (ctx.signal) {
        try { ctx.signal.removeEventListener('abort', onAbort); } catch (_) {}
      }
    };

    const handler = (event, responseId, answer) => {
      if (responseId !== requestId) return;
      cleanup();
      resolve({ content: answer || '(未选择)' });
    };

    const onAbort = () => {
      cleanup();
      resolve({ content: '用户取消了操作' });
    };

    if (ctx.signal) {
      if (ctx.signal.aborted) { resolve({ content: '用户取消了操作' }); return; }
      ctx.signal.addEventListener('abort', onAbort, { once: true });
    }

    ipcMain.on('agent-question-response', handler);

    // 10 分钟超时
    timer = setTimeout(() => {
      cleanup();
      resolve({ content: '选择题超时未作答' });
    }, 10 * 60 * 1000);
  });
}

// ==================== 子代理（独立上下文窗口）====================

// 工作树隔离：在临时 git worktree 中执行
async function withWorktree(workDir, fn) {
  const { execSync } = require('child_process');
  try {
    execSync('git rev-parse --git-dir', { cwd: workDir, stdio: 'pipe', encoding: 'utf-8' });
  } catch {
    return { error: 'isolation: "worktree" 需要 git 仓库' };
  }
  const ts = Date.now();
  const branchName = `cc-agent-${ts}-${Math.random().toString(36).slice(2, 6)}`;
  const worktreePath = path.join(path.dirname(path.resolve(workDir)), `.claude-worktree-${branchName}`);
  try {
    execSync(`git worktree add --detach "${worktreePath}" HEAD`, { cwd: workDir, stdio: 'pipe', timeout: 15000 });
    execSync(`git checkout -b "${branchName}"`, { cwd: worktreePath, stdio: 'pipe', timeout: 10000 });
    const result = await fn(worktreePath, branchName);
    try { execSync(`git worktree remove "${worktreePath}"`, { cwd: workDir, stdio: 'pipe', timeout: 10000 }); } catch {}
    try { execSync(`git branch -D "${branchName}"`, { cwd: workDir, stdio: 'pipe' }); } catch {}
    return result;
  } catch (err) {
    try { execSync(`git worktree remove "${worktreePath}" --force`, { cwd: workDir, stdio: 'pipe' }); } catch {}
    try { execSync(`git branch -D "${branchName}"`, { cwd: workDir, stdio: 'pipe' }); } catch {}
    return { error: `Worktree 隔离失败: ${err.message}` };
  }
}

// 子代理核心执行逻辑（被 agent() 调用，支持前台/后台/工作树）
async function runSubAgent(input, ctx) {
  const { prompt, description, subagent_type = 'general-purpose' } = input;
  const { workDir, signal, window: mainWindow, apiConfig, toolCallId } = ctx;
  if (!apiConfig || !apiConfig.apiKey) {
    return { error: '子 Agent 启动失败：API 配置未传入' };
  }

  const sendSub = (channel, data) => {
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, { ...data, subAgentId: toolCallId });
    }
  };

  try {
    const { buildSystemPrompt } = require('./system-prompt');
    const { getEnabledTools, mergeTools } = require('./tools');
    const { callAPIStream } = require('./api-client');

    // 1. 构建系统提示
    const { app } = require('electron');
    let memories = [];
    try {
      const memPath = path.join(app.getPath('userData'), 'memory.json');
      const memData = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
      memories = Array.isArray(memData.memories) ? memData.memories : [];
    } catch (_) {}

    const typeConfig = AGENT_TYPES[subagent_type];
    const system = buildSystemPrompt({
      workDir: workDir || process.cwd(),
      memories,
      activeSkills: [],
      customPrompt: ''
    }) + '\n\n你是 cc-wrap 的子代理任务，专注于执行分配给你的任务。完成后简要汇报结果。'
      + (typeConfig ? typeConfig.systemPromptSuffix : '');

    // 2. 获取工具定义并按 Agent 类型过滤
    const builtinTools = getEnabledTools();
    let mcpTools = [];
    try {
      const mcpClient = require('./mcp-client');
      mcpTools = mcpClient.getAllMcpTools ? (mcpClient.getAllMcpTools() || []) : [];
    } catch (_) {}
    const tools = filterToolsByAgentType(mergeTools(builtinTools, mcpTools), subagent_type);

    // 3. 初始化子对话上下文
    const subMessages = [
      { role: 'user', content: prompt }
    ];

    // 4. 子 Agent 主循环
    const MAX_SUB_ROUNDS = 20;
    const subAbort = new AbortController();
    if (signal) {
      if (signal.aborted) return { error: '已取消' };
      signal.addEventListener('abort', () => { try { subAbort.abort(); } catch (_) {} }, { once: true });
    }

    let round = 0;
    let finalText = '';

    while (round < MAX_SUB_ROUNDS) {
      if (subAbort.signal.aborted) return { error: '已取消' };
      round++;

      let fullText = '';
      const toolCalls = [];
      let stopReason = 'end_turn';

      try {
        await callAPIStream(
          subMessages,
          tools,
          system,
          { ...apiConfig, signal: subAbort.signal },
          {
            onText: (text) => {
              fullText += text;
              sendSub('agent-stream-text', { text });
            },
            onToolUse: (id, name, input) => {
              toolCalls.push({ id, name, input });
              sendSub('agent-stream-tool-start', { id, name, input });
            },
            onComplete: (reason) => { stopReason = reason; }
          }
        );
      } catch (err) {
        if (subAbort.signal.aborted || err.name === 'AbortError') return { error: '已取消' };
        return { error: `子 Agent API 调用失败: ${err.message}` };
      }

      if (fullText) finalText = fullText;

      // 添加助手消息
      const assistantContent = [];
      if (fullText) assistantContent.push({ type: 'text', text: fullText });
      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      if (assistantContent.length > 0) {
        subMessages.push({ role: 'assistant', content: assistantContent });
      }

      // 无工具调用 → 结束
      if (toolCalls.length === 0 || stopReason !== 'tool_use') {
        return { content: finalText || '(子 Agent 完成，无文本输出)' };
      }

      // 执行工具
      const toolResults = [];
      for (const tc of toolCalls) {
        if (subAbort.signal.aborted) break;
        try {
          const result = await executeTool(tc.name, tc.input, {
            workDir,
            signal: subAbort.signal,
            window: mainWindow,
            apiConfig,
          });
          const content = result.error
            ? `错误: ${result.error}`
            : (typeof result.content === 'string' ? result.content : JSON.stringify(result));
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content });
          sendSub('agent-stream-tool-result', { id: tc.id, name: tc.name, result: content, error: !!result.error });
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `工具执行失败: ${err.message}` });
          sendSub('agent-stream-tool-result', { id: tc.id, name: tc.name, result: `工具执行失败: ${err.message}`, error: true });
        }
      }
      if (toolResults.length > 0) {
        subMessages.push({ role: 'user', content: toolResults });
      }
    }

    return { content: finalText || `(子 Agent 执行超过 ${MAX_SUB_ROUNDS} 轮，已截断)` };

  } catch (err) {
    return { error: `子 Agent 错误: ${err.message}` };
  }
}

// Agent 工具主入口：路由到前台/后台/工作树执行
async function agent(input, ctx) {
  const prompt = input.prompt;
  const description = input.description;
  const subagent_type = input.subagent_type || input.subagentType || 'general-purpose';
  const run_in_background = input.run_in_background !== undefined ? input.run_in_background : (input.runInBackground || false);
  const isolation = input.isolation;
  if (!prompt) return { error: 'prompt is required' };

  // 1. Worktree 隔离
  if (isolation === 'worktree') {
    return await withWorktree(ctx.workDir, async (wtDir) => {
      return await runSubAgent({ ...input, isolation: undefined }, { ...ctx, workDir: wtDir });
    });
  }

  // 2. 后台执行
  if (run_in_background) {
    const taskId = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // 后台 Agent 不继承父的取消信号，独立生命周期
    const bgCtx = { workDir: ctx.workDir, apiConfig: ctx.apiConfig, toolCallId: ctx.toolCallId };
    const agentPromise = runSubAgent(input, bgCtx);

    backgroundAgents.set(taskId, {
      promise: agentPromise,
      status: 'running',
      type: subagent_type,
      description: description || '',
      startedAt: Date.now()
    });

    agentPromise.then(result => {
      const entry = backgroundAgents.get(taskId);
      if (entry) { entry.status = 'completed'; entry.result = result; entry.completedAt = Date.now(); }
    }).catch(err => {
      const entry = backgroundAgents.get(taskId);
      if (entry) { entry.status = 'failed'; entry.error = err.message; }
    });

    return { content: JSON.stringify({ taskId, status: 'running', type: subagent_type }) };
  }

  // 3. 前台执行（默认）
  return await runSubAgent(input, ctx);
}

// 查询后台 Agent 结果
async function getAgentResult(input, ctx) {
  const { taskId } = input;
  if (!taskId) return { error: 'taskId 是必需的' };
  const entry = backgroundAgents.get(taskId);
  if (!entry) return { error: `未找到后台 Agent: ${taskId}` };
  if (entry.status === 'running') {
    return { content: JSON.stringify({ taskId, status: 'running', type: entry.type, startedAt: entry.startedAt }) };
  }
  if (entry.status === 'failed') {
    return { error: `后台 Agent 失败: ${entry.error}` };
  }
  // completed
  return entry.result;
}

// ==================== 统一调度 ====================

const TOOL_HANDLERS = {
  Read: read,
  Write: write,
  Edit: edit,
  Glob: globSearch,
  Grep: grep,
  Bash: bash,
  ListDirectory: listDirectory,
  WebSearch: webSearch,
  WebFetch: webFetch,
  Agent: agent,
  GetAgentResult: getAgentResult,
  TaskCreate: taskCreate,
  TaskUpdate: taskUpdate,
  InstallSkill: installSkill,
  InstallMcp: installMcp,
  DiscoverMcp: discoverMcp,
  AskUserQuestion: askUserQuestion,
};

/**
 * 执行工具
 * @param {string} toolName
 * @param {object} input
 * @param {object} context - { workDir, shell, signal }
 */
async function executeTool(toolName, input, context = {}) {
  const ctx = {
    workDir: context.workDir || process.cwd(),
    shell: context.shell,
    signal: context.signal,
    window: context.window,
    apiConfig: context.apiConfig,
    toolCallId: context.toolCallId,
  };

  const handler = TOOL_HANDLERS[toolName];
  if (handler) {
    try {
      return await handler(input, ctx);
    } catch (err) {
      return { error: `${toolName} failed: ${err.message}` };
    }
  }

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

module.exports = { executeTool, taskStore, taskGetAll, taskClearAll, readTextSmart, setEnvConfig, clearBackgroundAgents, detectWinShell };
