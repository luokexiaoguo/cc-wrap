const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const Store = require('electron-store');
const os = require('os');
const { runAgentLoop, cancelAgentLoop } = require('./agent-loop');
const mcp = require('./mcp-client');

// 配置存储
const store = new Store({
  defaults: {
    apiKey: '',
    apiEndpoint: 'https://api.anthropic.com',
    defaultModel: 'claude-3-opus-20240229',
    models: [],
    theme: 'dark',
    fontSize: 14,
    language: 'zh-CN',
    maxTokens: 4096,
    temperature: 0.7,
    workDirectory: os.homedir(),
    recentProjects: [],
    minimizeToTray: true
  }
});

let mainWindow;

// ========== 工具函数 ==========

function getAllFiles(dir, files = []) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules' || item === '__pycache__') continue;
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          files.push({ name: item, path: fullPath, type: 'directory' });
          getAllFiles(fullPath, files);
        } else {
          files.push({ name: item, path: fullPath, type: 'file', size: stat.size });
        }
      } catch (e) {}
    }
  } catch (e) {}
  return files;
}

function grepInFiles(dir, pattern, glob = '*') {
  const results = [];
  const regex = new RegExp(pattern, 'gi');

  function searchDir(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue;
        const fullPath = path.join(currentDir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            searchDir(fullPath);
          } else if (stat.isFile() && stat.size < 1024 * 1024) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              lines.forEach((line, idx) => {
                if (regex.test(line)) {
                  results.push({
                    file: fullPath,
                    line: idx + 1,
                    content: line.trim()
                  });
                  regex.lastIndex = 0;
                }
              });
            } catch (e) {}
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  searchDir(dir);
  return results;
}

function globFiles(dir, pattern) {
  const files = [];
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexStr}$`);

  function searchDir(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue;
        const fullPath = path.join(currentDir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            searchDir(fullPath);
          } else if (regex.test(item)) {
            files.push(fullPath);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  searchDir(dir);
  return files;
}

// ========== 主窗口 ==========

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'cc-wrap',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '../../icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../preload.js')
    },
    backgroundColor: '#0d1117'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.setMenu(null);

  // 监听渲染进程日志
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('[渲染进程]', message);
  });

  // 拦截关闭事件 → 最小化到托盘（若设置开启）
  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray', true) && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // 收到渲染进程的窗口关闭请求时，也按 minimizeToTray 处理
  // 但用户想真正退出时走系统托盘菜单的"退出"
}

// ========== 系统托盘 ==========

let tray;

function createTray() {
  const iconPath = path.join(__dirname, '../../icon.ico');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    // 缩放到 16x16 适合托盘大小
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    // 如果图标文件有问题，创建一个 16x16 的纯色图标
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('cc-wrap');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ========== IPC 处理 ==========

app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // 配置相关
  ipcMain.handle('get-config', () => store.store);
  ipcMain.handle('set-config', (event, key, value) => { store.set(key, value); return true; });

  // 返回应用图标（缩放到 20x20 的 data URL）
  ipcMain.handle('get-app-icon', () => {
    const iconPath = path.join(__dirname, '../../icon.ico');
    try {
      const img = nativeImage.createFromPath(iconPath);
      return img.resize({ width: 20, height: 20 }).toDataURL();
    } catch (e) {
      return null;
    }
  });

  // 窗口控制
  ipcMain.handle('window-minimize', () => mainWindow.minimize());
  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window-close', () => mainWindow.close());

  // 模型管理
  ipcMain.handle('get-models', () => store.get('models', []));
  ipcMain.handle('add-model', (event, model) => {
    const models = store.get('models', []);
    models.push(model);
    store.set('models', models);
    return models;
  });
  ipcMain.handle('remove-model', (event, index) => {
    const models = store.get('models', []);
    models.splice(index, 1);
    store.set('models', models);
    return models;
  });

  // ========== Claude Code 工具：文件操作 ==========

  ipcMain.handle('tool-read', (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tool-write', (event, filePath, content) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tool-edit', (event, filePath, oldString, newString) => {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(oldString)) {
        return { success: false, error: '未找到要替换的文本' };
      }
      content = content.replace(oldString, newString);
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tool-glob', (event, pattern, dir) => {
    try {
      const files = globFiles(dir || store.get('workDirectory'), pattern);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tool-grep', (event, pattern, dir) => {
    try {
      const results = grepInFiles(dir || store.get('workDirectory'), pattern);
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tool-list-dir', (event, dir) => {
    try {
      const items = fs.readdirSync(dir || store.get('workDirectory'), { withFileTypes: true });
      const result = items
        .filter(i => !i.name.startsWith('.'))
        .map(i => ({
          name: i.name,
          path: path.join(dir || store.get('workDirectory'), i.name),
          type: i.isDirectory() ? 'directory' : 'file'
        }));
      return { success: true, items: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== Claude Code 工具：Bash 执行 ==========

  ipcMain.handle('tool-bash', (event, command, cwd) => {
    return new Promise((resolve) => {
      try {
        const workDir = cwd || store.get('workDirectory');
        execSync(command, {
          cwd: workDir,
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 1024 * 1024 * 10
        }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, output: stderr || error.message });
          } else {
            resolve({ success: true, output: stdout });
          }
        });
      } catch (err) {
        resolve({ success: false, output: err.message });
      }
    });
  });

  ipcMain.handle('tool-bash-stream', (event, command, cwd) => {
    return new Promise((resolve) => {
      const workDir = cwd || store.get('workDirectory');
      const proc = spawn(command, [], {
        cwd: workDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        mainWindow.webContents.send('bash-output', chunk);
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        mainWindow.webContents.send('bash-output', chunk);
      });

      proc.on('close', (code) => {
        resolve({ success: code === 0, output: output || stderr, code });
      });

      proc.on('error', (err) => {
        resolve({ success: false, output: err.message });
      });
    });
  });

  // ========== Claude Code 工具：文件树 ==========

  ipcMain.handle('get-file-tree', (event, dir) => {
    try {
      const workDir = dir || store.get('workDirectory');
      const files = getAllFiles(workDir);
      return { success: true, files, root: workDir };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== Claude Code 工具：工作目录 ==========

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      store.set('workDirectory', result.filePaths[0]);
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('get-work-dir', () => store.get('workDirectory'));

  ipcMain.handle('set-work-dir', (event, dir) => {
    if (fs.existsSync(dir)) {
      store.set('workDirectory', dir);
      return true;
    }
    return false;
  });

  // ========== 图片操作 ==========

  ipcMain.handle('read-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile']
    });
    if (!result.canceled) {
      const imageBuffer = fs.readFileSync(result.filePaths[0]);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(result.filePaths[0]).slice(1).toLowerCase();
      return { data: base64, mediaType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    }
    return null;
  });

  ipcMain.handle('paste-image', () => {
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      return { data: image.toPNG().toString('base64'), mediaType: 'image/png' };
    }
    return null;
  });

  // ========== API 调用 ==========

  // 判断是否使用 Anthropic 格式：Claude 模型或 Anthropic 官方端点
  function shouldUseAnthropicFormat(endpoint, model) {
    // Claude 模型始终用 Anthropic 格式
    if (/^claude-/i.test(model)) return true;
    // Anthropic 官方端点
    if (/anthropic\.com/i.test(endpoint)) return true;
    // 其他第三方模型用 OpenAI 格式（流式兼容性更好）
    return false;
  }

  // 将 Anthropic 格式消息转为 OpenAI 格式
  function toOpenAIMessages(messages, system) {
    const out = [];
    if (system) {
      out.push({ role: 'system', content: system });
    }
    for (const m of messages) {
      if (m.role === 'user' || m.role === 'assistant') {
        // Anthropic content 是数组，需要转为 OpenAI 的 string 或 content array
        if (Array.isArray(m.content)) {
          const textParts = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
          const imgParts = m.content.filter(c => c.type === 'image');
          if (imgParts.length === 0) {
            out.push({ role: m.role, content: textParts });
          } else {
            // OpenAI vision format
            const content = [];
            for (const img of imgParts) {
              content.push({
                type: 'image_url',
                image_url: { url: 'data:' + img.source.media_type + ';base64,' + img.source.data }
              });
            }
            if (textParts) content.push({ type: 'text', text: textParts });
            out.push({ role: m.role, content });
          }
        } else {
          out.push({ role: m.role, content: m.content || '' });
        }
      }
    }
    return out;
  }

  ipcMain.handle('claude-api', async (event, messages, options = {}) => {
    const config = store.store;
    const apiKey = options.apiKey || config.apiKey;
    let endpoint = options.endpoint || config.apiEndpoint || 'https://api.anthropic.com';
    const model = options.model || config.defaultModel || 'claude-3-opus-20240229';
    const useAnthropic = shouldUseAnthropicFormat(endpoint, model);

    console.log('[API] 模型:', model, '| 格式:', useAnthropic ? 'Anthropic' : 'OpenAI');
    console.log('[API] 端点:', endpoint);

    if (!apiKey) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    try {
      // 清理端点
      endpoint = endpoint.replace(/\/+$/, '');
      endpoint = endpoint.replace(/\/chat\/completions$/, '');
      endpoint = endpoint.replace(/\/v1\/messages$/, '');
      endpoint = endpoint.replace(/\/v1$/, '');

      // 非 Anthropic 格式时，移除 /anthropic 路径段
      if (!useAnthropic) {
        endpoint = endpoint.replace(/\/anthropic$/i, '');
      }

      let response;
      if (useAnthropic) {
        // Anthropic 格式
        const url = endpoint + '/v1/messages';
        console.log('[API] 请求:', url);
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || config.maxTokens || 4096,
            temperature: options.temperature ?? config.temperature ?? 0.7,
            system: options.system || '',
            messages
          })
        });
      } else {
        // OpenAI 格式
        const url = endpoint + '/v1/chat/completions';
        console.log('[API] 请求:', url);
        const oaiMessages = toOpenAIMessages(messages, options.system || '');
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || config.maxTokens || 4096,
            temperature: options.temperature ?? config.temperature ?? 0.7,
            messages: oaiMessages
          })
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        console.log('[API] 失败:', response.status, errText);
        let errMsg;
        try { errMsg = JSON.parse(errText).error?.message; } catch(e) {}
        return { success: false, error: errMsg || '请求失败: ' + response.status + ' ' + errText.substring(0, 200) };
      }

      const data = await response.json();

      // 统一返回格式
      if (useAnthropic) {
        return { success: true, data };
      } else {
        // 将 OpenAI 响应转为 Anthropic 兼容格式
        const text = data.choices?.[0]?.message?.content || '';
        const usage = data.usage ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens } : null;
        return {
          success: true,
          data: {
            content: [{ type: 'text', text }],
            usage
          }
        };
      }
    } catch (err) {
      console.log('[API] 错误:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 流式 API 调用
  ipcMain.handle('claude-api-stream', async (event, messages, options = {}) => {
    const config = store.store;
    const apiKey = options.apiKey || config.apiKey;
    let endpoint = options.endpoint || config.apiEndpoint || 'https://api.anthropic.com';
    const model = options.model || config.defaultModel || 'claude-3-opus-20240229';
    const useAnthropic = shouldUseAnthropicFormat(endpoint, model);

    console.log('[API Stream] 模型:', model, '| 格式:', useAnthropic ? 'Anthropic' : 'OpenAI');

    if (!apiKey) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    try {
      // 清理端点
      endpoint = endpoint.replace(/\/+$/, '');
      endpoint = endpoint.replace(/\/chat\/completions$/, '');
      endpoint = endpoint.replace(/\/v1\/messages$/, '');
      endpoint = endpoint.replace(/\/v1$/, '');

      // 非 Anthropic 格式时，移除 /anthropic 路径段
      if (!useAnthropic) {
        endpoint = endpoint.replace(/\/anthropic$/i, '');
      }

      let response;
      if (useAnthropic) {
        const url = endpoint + '/v1/messages';
        console.log('[API Stream] 请求:', url);
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || config.maxTokens || 4096,
            temperature: options.temperature ?? config.temperature ?? 0.7,
            system: options.system || '',
            stream: true,
            messages
          })
        });
      } else {
        const url = endpoint + '/v1/chat/completions';
        console.log('[API Stream] 请求:', url);
        const oaiMessages = toOpenAIMessages(messages, options.system || '');
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens || config.maxTokens || 4096,
            temperature: options.temperature ?? config.temperature ?? 0.7,
            stream: true,
            messages: oaiMessages
          })
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        console.log('[API Stream] 失败:', response.status, errText);
        return { success: false, error: 'HTTP ' + response.status + ': ' + errText.substring(0, 200) };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let usage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const evt = JSON.parse(data);

            if (useAnthropic) {
              // Anthropic stream events
              if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
                fullContent += evt.delta.text;
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('stream-chunk', evt.delta.text);
                }
              }
              if (evt.type === 'message_delta' && evt.usage) usage = evt.usage;
              if (evt.type === 'message_start' && evt.message && evt.message.usage) usage = evt.message.usage;
            } else {
              // OpenAI stream events
              const delta = evt.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('stream-chunk', delta.content);
                }
              }
              if (evt.choices?.[0]?.finish_reason === 'stop' && evt.usage) {
                usage = { input_tokens: evt.usage.prompt_tokens, output_tokens: evt.usage.completion_tokens };
              }
            }
          } catch (e) {}
        }
      }

      console.log('[API Stream] 完成, 长度:', fullContent.length);

      return { success: true, content: fullContent, usage };
    } catch (err) {
      console.log('[API Stream] 错误:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ========== 工具定义（Claude Code 完整工具集） ==========

  ipcMain.handle('get-tool-definitions', () => {
    return [
      {
        name: 'Read',
        description: '读取文件内容',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径' }
          },
          required: ['file_path']
        }
      },
      {
        name: 'Write',
        description: '写入文件内容',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' }
          },
          required: ['file_path', 'content']
        }
      },
      {
        name: 'Edit',
        description: '编辑文件，替换指定内容',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径' },
            old_string: { type: 'string', description: '要替换的文本' },
            new_string: { type: 'string', description: '替换后的文本' }
          },
          required: ['file_path', 'old_string', 'new_string']
        }
      },
      {
        name: 'Glob',
        description: '按模式搜索文件',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '文件匹配模式，如 *.js' },
            path: { type: 'string', description: '搜索目录' }
          },
          required: ['pattern']
        }
      },
      {
        name: 'Grep',
        description: '在文件中搜索内容',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '正则表达式' },
            path: { type: 'string', description: '搜索目录' }
          },
          required: ['pattern']
        }
      },
      {
        name: 'Bash',
        description: '执行 Bash 命令',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的命令' },
            cwd: { type: 'string', description: '工作目录' }
          },
          required: ['command']
        }
      },
      {
        name: 'ListDirectory',
        description: '列出目录内容',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' }
          },
          required: ['path']
        }
      }
    ];
  });

  ipcMain.handle('execute-tool', async (event, toolName, input) => {
    const { executeTool } = require('./tool-executor');
    const result = await executeTool(toolName, input);
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, content: result.content };
  });

  // ========== Agent Loop ==========

  ipcMain.handle('agent-start', async (event, options) => {
    const config = store.store;
    const loopId = options.loopId || 'loop_' + Date.now();

    // 获取 MCP 工具定义
    const mcpTools = mcp.getAllMcpTools();

    // 合并配置
    const agentOptions = {
      ...options,
      loopId,
      workDir: options.workDir || config.workDirectory,
      mcpTools,
      apiConfig: {
        model: options.model || config.defaultModel,
        apiKey: options.apiKey || config.apiKey,
        endpoint: options.endpoint || config.apiEndpoint,
        maxTokens: options.maxTokens || config.maxTokens,
        temperature: options.temperature ?? config.temperature
      }
    };

    console.log('[Agent] 启动循环:', loopId, mcpTools.length > 0 ? `(${mcpTools.length} MCP 工具)` : '');
    const result = await runAgentLoop(mainWindow, agentOptions);

    // 后台自动提取记忆（不阻塞响应）
    if (result && result.success && options.messages) {
      autoExtractMemories(options.messages, agentOptions.apiConfig).catch(() => {});
    }

    return result;
  });

  ipcMain.handle('agent-cancel', (event, loopId) => {
    console.log('[Agent] 取消循环:', loopId);
    return cancelAgentLoop(loopId);
  });

  // ========== 自动记忆提取 ==========

  async function autoExtractMemories(conversationMessages, config) {
    try {
      if (!conversationMessages || conversationMessages.length < 2) return;

      // 取最后两轮对话（用户+助手）作为提取依据
      const recentMsgs = conversationMessages.slice(-4);
      const conversationText = recentMsgs.map(m => {
        const role = m.role === 'user' ? '用户' : '助手';
        let content = '';
        if (typeof m.content === 'string') content = m.content;
        else if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block.type === 'text') content += block.text;
            else if (block.type === 'tool_use') content += `[工具调用: ${block.name}]`;
            else if (block.type === 'tool_result') content += `[工具结果]`;
          }
        }
        return `${role}: ${content.substring(0, 500)}`;
      }).join('\n\n');

      const extractPrompt = `分析以下对话，提取值得记住的关键信息。只提取以下类型的事实：
- 项目名称和技术栈（语言、框架、数据库等）
- 用户的编码偏好和习惯
- 团队信息或项目背景
- 重要的配置或约定

规则：
- 每条记忆必须是可以跨对话复用的事实
- 不要提取临时性的对话内容
- 不要提取代码本身，只提取项目元信息
- 如果没有值得记忆的信息，返回空数组
- 最多提取3条

对话内容：
${conversationText}

请以 JSON 数组格式返回，每个元素包含 content 字段。只返回 JSON，不要其他文字。
示例：[{"content":"项目使用 React + TypeScript"}]`;

      const { callAPI } = require('./api-client');
      const result = await callAPI(
        [{ role: 'user', content: [{ type: 'text', text: extractPrompt }] }],
        null,
        '',
        {
          model: config.model || 'claude-3-opus-20240229',
          apiKey: config.apiKey || '',
          endpoint: config.endpoint || 'https://api.anthropic.com',
          maxTokens: 500,
          temperature: 0.2
        }
      );

      const text = result.content?.[0]?.text || '';
      // 提取 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      const extracted = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(extracted) || extracted.length === 0) return;

      // 读取现有记忆，避免重复
      const memoryPath = path.join(app.getPath('userData'), 'memory.json');
      let memoryData = { memories: [] };
      try { memoryData = JSON.parse(fs.readFileSync(memoryPath, 'utf-8')); } catch {}

      const existingContents = new Set(memoryData.memories.map(m => m.content));
      const newMemories = [];

      for (const item of extracted) {
        if (item.content && !existingContents.has(item.content)) {
          const mem = { content: item.content, source: 'auto', createdAt: Date.now() };
          memoryData.memories.push(mem);
          newMemories.push(mem);
          existingContents.add(item.content);
        }
      }

      if (newMemories.length > 0) {
        fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
        fs.writeFileSync(memoryPath, JSON.stringify(memoryData, null, 2));
        console.log(`[Auto Memory] 提取了 ${newMemories.length} 条新记忆`);

        // 通知渲染进程
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-memories-extracted', {
            memories: memoryData.memories,
            newMemories
          });
        }
      }
    } catch (err) {
      console.error('[Auto Memory] 提取失败:', err.message);
    }
  }

  // ========== 记忆系统 ==========

  ipcMain.handle('get-memory', () => {
    const memoryPath = path.join(app.getPath('userData'), 'memory.json');
    try {
      return JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
    } catch {
      return { memories: [] };
    }
  });

  ipcMain.handle('save-memory', (event, memory) => {
    const memoryDir = app.getPath('userData');
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(path.join(memoryDir, 'memory.json'), JSON.stringify(memory, null, 2));
    return true;
  });

  ipcMain.handle('delete-memory', (event, index) => {
    const memoryPath = path.join(app.getPath('userData'), 'memory.json');
    try {
      const data = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
      if (index >= 0 && index < data.memories.length) {
        data.memories.splice(index, 1);
        fs.writeFileSync(memoryPath, JSON.stringify(data, null, 2));
        return { success: true, memories: data.memories };
      }
    } catch {}
    return { success: false };
  });

  // ========== Skills 系统 ==========

  ipcMain.handle('get-skills', () => {
    const skillsPath = path.join(app.getPath('userData'), 'skills.json');
    try {
      return JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
    } catch {
      return { skills: [] };
    }
  });

  ipcMain.handle('save-skills', (event, data) => {
    const userDataDir = app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'skills.json'), JSON.stringify(data, null, 2));
    return true;
  });

  ipcMain.handle('read-skill-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: 'Skill文件', extensions: ['md', 'txt', 'json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (!result.canceled) {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const fileName = path.basename(result.filePaths[0], path.extname(result.filePaths[0]));
      return { path: result.filePaths[0], content: content, name: fileName };
    }
    return null;
  });

  // ========== MCP 服务器管理 ==========

  ipcMain.handle('get-mcp-servers', () => {
    const mcpPath = path.join(app.getPath('userData'), 'mcp-servers.json');
    try {
      return JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    } catch {
      return { servers: [] };
    }
  });

  ipcMain.handle('save-mcp-servers', (event, data) => {
    const userDataDir = app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'mcp-servers.json'), JSON.stringify(data, null, 2));
    return true;
  });

  ipcMain.handle('test-mcp-server', async (event, serverConfig) => {
    // 真正的 MCP 握手测试
    const testClient = new mcp.McpClient(serverConfig);
    try {
      await testClient.connect();
      const tools = testClient.getToolDefinitions();
      testClient.close();
      return { success: true, tools: tools.map(t => t.name), message: `已连接, ${tools.length} 个工具` };
    } catch (err) {
      testClient.close();
      return { success: false, error: err.message };
    }
  });

  // MCP 连接/断开/状态
  ipcMain.handle('mcp-connect', async (event, serverConfig) => {
    // 先关闭已有的
    const existing = mcp.getClient(serverConfig.name);
    if (existing) existing.close();

    const client = new mcp.McpClient(serverConfig);
    try {
      await client.connect();
      mcp.clients.set(serverConfig.name, client);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mcp-status', mcp.getServerStatuses());
      }
      return { success: true, tools: client.getToolDefinitions().map(t => t.name) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp-disconnect', (event, serverName) => {
    const client = mcp.getClient(serverName);
    if (client) {
      client.close();
      mcp.clients.delete(serverName);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp-status', mcp.getServerStatuses());
    }
    return true;
  });

  ipcMain.handle('mcp-status', () => {
    return mcp.getServerStatuses();
  });

  // 抓取网页内容
  ipcMain.handle('fetch-web-content', async (event, url) => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      const html = await response.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      const maxLen = 12000;
      return { success: true, content: text.length > maxLen ? text.substring(0, maxLen) + '...' : text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 从 URL 自动添加 MCP 服务器
  ipcMain.handle('add-mcp-from-url', async (event, url) => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'cc-wrap/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      const html = await response.text();

      // HTML 转文本
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 尝试提取 JSON 配置块（mcpServers 格式）
      const jsonMatch = text.match(/"mcpServers"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
      if (jsonMatch) {
        try {
          const serversObj = JSON.parse('{' + jsonMatch[1] + '}');
          const mcpPath = path.join(app.getPath('userData'), 'mcp-servers.json');
          let mcpData = { servers: [] };
          try { mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')); } catch {}

          const existingNames = new Set(mcpData.servers.map(s => s.name));
          const added = [];

          for (const [name, config] of Object.entries(serversObj)) {
            if (!existingNames.has(name)) {
              const server = {
                name,
                command: config.command || '',
                args: config.args || [],
                cwd: config.cwd || '',
                env: config.env || {},
              };
              mcpData.servers.push(server);
              existingNames.add(name);
              added.push(name);
            }
          }

          if (added.length > 0) {
            fs.writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2));

            // 自动连接新增的服务器
            const newServers = mcpData.servers.filter(s => added.includes(s.name));
            const results = await mcp.connectAllServers(newServers);
            for (const r of results) {
              if (r.status === 'connected') mcp.clients.set(r.name, mcp.clients.get(r.name));
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('mcp-status', mcp.getServerStatuses());
            }

            return { success: true, added, message: `已添加并连接: ${added.join(', ')}` };
          }
          return { success: false, message: '这些服务器已存在' };
        } catch (e) {
          // JSON 解析失败，继续尝试其他方式
        }
      }

      // 尝试提取 claude mcp add 命令
      const mcpAddMatch = text.match(/claude\s+mcp\s+add\s+([^\n]+)/i);
      if (mcpAddMatch) {
        return { success: false, message: '检测到 claude mcp add 命令，请手动配置', raw: mcpAddMatch[1] };
      }

      return { success: false, message: '未能从页面解析出 MCP 配置' };
    } catch (err) {
      return { success: false, message: '获取页面失败: ' + err.message };
    }
  });

  // 启动时自动连接所有 MCP 服务器（不阻塞启动）
  setTimeout(async () => {
    try {
      const mcpPath = path.join(app.getPath('userData'), 'mcp-servers.json');
      let mcpData = { servers: [] };
      try { mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')); } catch {}
      if (mcpData.servers && mcpData.servers.length > 0) {
        console.log(`[MCP] 自动连接 ${mcpData.servers.length} 个服务器...`);
        const results = await mcp.connectAllServers(mcpData.servers);
        for (const r of results) {
          if (r.status === 'connected') console.log(`[MCP] ${r.name}: 已连接 (${r.tools.length} 个工具)`);
          else console.log(`[MCP] ${r.name}: 连接失败 - ${r.error}`);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('mcp-status', mcp.getServerStatuses());
        }
      }
    } catch (err) {
      console.error('[MCP] 自动连接失败:', err.message);
    }
  }, 2000);

  // ========== 项目管理 ==========

  ipcMain.handle('get-recent-projects', () => store.get('recentProjects', []));

  ipcMain.handle('add-recent-project', (event, projectPath) => {
    let projects = store.get('recentProjects', []);
    projects = projects.filter(p => p !== projectPath);
    projects.unshift(projectPath);
    projects = projects.slice(0, 10);
    store.set('recentProjects', projects);
    return projects;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !store.get('minimizeToTray', true)) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
