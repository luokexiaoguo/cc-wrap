// 工具执行器模块
// 在主进程中执行所有工具，无需 IPC 往返

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const iconv = require('iconv-lite');

// 允许 main.js 注入 env 配置（如 TAVILY_API_KEY 等）
let _envConfig = {};
function setEnvConfig(env) { _envConfig = env || {}; }

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
  const filePath = resolvePath(input.file_path, ctx.workDir);
  if (!input.file_path) return { error: 'file_path is required' };

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
  const { content } = input;
  if (!input.file_path || content === undefined) return { error: 'file_path and content are required' };
  const filePath = resolvePath(input.file_path, ctx.workDir);

  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { content: `File written: ${filePath} (${content.length} chars)` };
  } catch (err) {
    return { error: err.message };
  }
}

function edit(input, ctx) {
  const { old_string, new_string } = input;
  if (!input.file_path || old_string === undefined || new_string === undefined) {
    return { error: 'file_path, old_string, and new_string are required' };
  }
  const filePath = resolvePath(input.file_path, ctx.workDir);

  try {
    const rawContent = readTextSmart(filePath);
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
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return { content: `File edited: ${filePath}` };
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
  const { pattern, glob: globPattern, output_mode = 'content' } = input;
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

// Windows 上探测 git-bash（很多模型从 Skill 里学到的是 bash 风格命令，cmd 不认）
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
    // 没有再回退 cmd.exe。模型经常生成 bash 风格命令（/c/Users/...、单引号），cmd 不认会反复 0 退出。
    const winBash = isWin ? detectWinShell() : null;
    const shell = ctx.shell || (isWin ? (winBash || process.env.COMSPEC || 'cmd.exe') : '/bin/sh');
    const useBash = !isWin || (shell && /bash(\.exe)?$/i.test(shell));
    const shellArgs = useBash ? ['-c', command] : ['/d', '/s', '/c', command];

    let proc;
    try {
      proc = spawn(shell, shellArgs, {
        cwd: ctx.workDir || process.cwd(),
        env: { ...process.env, ..._envConfig },
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
  const { name, description = '', content = '', triggers = [], alwaysActive = false } = input || {};
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

    return {
      content:
        'Skill "' + name + '" 已注册到 cc-wrap。\n' +
        '路径: ' + target + '\n' +
        '触发词: ' + (triggerList.length > 0 ? triggerList.join(', ') : '(无)') + '\n' +
        '常驻: ' + (alwaysActive ? '是' : '否') + '\n' +
        '用户下次发相关消息时会自动激活；也可在左侧 Skills 面板看到。'
    };
  } catch (err) {
    return { error: '写入失败: ' + err.message };
  }
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

async function agent(input, ctx) {
  const { prompt, description } = input;
  if (!prompt) return { error: 'prompt is required' };

  const { workDir, signal, window: mainWindow, apiConfig, toolCallId } = ctx;
  if (!apiConfig || !apiConfig.apiKey) {
    return { error: '子 Agent 启动失败：API 配置未传入' };
  }

  // IPC 广播辅助：向渲染端发送子 Agent 事件，附带 subAgentId 用于路由到父工具卡片
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

    const system = buildSystemPrompt({
      workDir: workDir || process.cwd(),
      memories,
      activeSkills: [],
      customPrompt: ''
    }) + '\n\n你是 cc-wrap 的子代理任务，专注于执行分配给你的任务。完成后简要汇报结果。';

    // 2. 获取工具定义（内置 + MCP）
    const builtinTools = getEnabledTools();
    let mcpTools = [];
    try {
      const mcpClient = require('./mcp-client');
      mcpTools = mcpClient.getAllMcpTools ? (mcpClient.getAllMcpTools() || []) : [];
    } catch (_) {}
    const tools = mergeTools(builtinTools, mcpTools);

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
              // 实时推送到渲染端
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
  TaskCreate: taskCreate,
  TaskUpdate: taskUpdate,
  InstallSkill: installSkill,
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

module.exports = { executeTool, taskStore, taskGetAll, taskClearAll, readTextSmart, setEnvConfig };
