const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, Tray, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const { exec, spawn } = require('child_process');
const Store = require('electron-store');
const os = require('os');
const treeKill = require('tree-kill');
const { spawn: ptySpawn } = require('node-pty');
const { runAgentLoop, cancelAgentLoop, setPersistenceStore } = require('./agent-loop');
const mcp = require('./mcp-client');
const logger = require('./logger');

// 尽早安装 console hook（app.getPath 不可用时仅打终端，不写文件）
logger.initLogger();

// ==================== API Key 加密辅助 ====================
// 使用 OS 凭据存储加密 API key。存储格式：'enc:' + base64(encrypted)
// 解密失败时回退到明文（兼容旧数据，下次写入会自动加密）

const ENC_PREFIX = 'enc:';

function encryptKey(plain) {
  if (!plain) return '';
  if (!safeStorage.isEncryptionAvailable()) return plain;
  try {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64');
  } catch {
    return plain;
  }
}

function decryptKey(stored) {
  if (!stored) return '';
  if (typeof stored !== 'string') return '';
  if (!stored.startsWith(ENC_PREFIX)) return stored; // 旧明文数据
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

// 读取已解密的完整配置（主进程内部使用）
function readDecryptedConfig(store) {
  const raw = store.store;
  return {
    ...raw,
    apiKey: raw.apiKey ? decryptKey(raw.apiKey) : '',
    models: Array.isArray(raw.models)
      ? raw.models.map(m => ({ ...m, apiKey: m.apiKey ? decryptKey(m.apiKey) : '' }))
      : []
  };
}

// 配置存储
const store = new Store({
  defaults: {
    apiKey: '',
    apiEndpoint: 'https://api.anthropic.com',
    defaultModel: '',
    models: [],
    theme: 'dark',
    fontSize: 14,
    language: 'zh-CN',
    maxTokens: 4096,
    temperature: 0.7,
    workDirectory: os.homedir(),
    recentProjects: [],
    minimizeToTray: true,
    chatPaneWidth: 460,
    chatPaneHidden: false,
    alwaysAllowedTools: [],
    autoSave: false,
    customSystemPrompt: '',
    windowBounds: null
  }
});

// 把 store 注入 agent-loop，让它能持久化 alwaysAllowedTools
setPersistenceStore(store);

// 把 config.env 注入 tool-executor（如 TAVILY_API_KEY）
const { setEnvConfig } = require('./tool-executor');
setEnvConfig(store.get('env', {}));

let mainWindow;
const terminals = new Map(); // terminalId → node-pty process

// ========== 工具函数 ==========

const EXCLUDED_DIRS = new Set([
  'node_modules', '__pycache__', 'dist', 'build', '.next', '.cache',
  '.venv', 'venv', 'target', '.gradle', '.idea', '.vscode'
]);
const MAX_TREE_DEPTH = 10;
const MAX_TREE_FILES = 5000;

async function getAllFiles(dir) {
  const files = [];
  async function walk(current, depth) {
    if (depth > MAX_TREE_DEPTH || files.length >= MAX_TREE_FILES) return;
    let items;
    try { items = await fs.promises.readdir(current, { withFileTypes: true }); }
    catch { return; }
    for (const item of items) {
      if (files.length >= MAX_TREE_FILES) return;
      if (item.name.startsWith('.') || EXCLUDED_DIRS.has(item.name)) continue;
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        files.push({ name: item.name, path: fullPath, type: 'directory' });
        await walk(fullPath, depth + 1);
      } else if (item.isFile()) {
        let size = 0;
        try { size = (await fs.promises.stat(fullPath)).size; } catch {}
        files.push({ name: item.name, path: fullPath, type: 'file', size });
      }
    }
  }
  await walk(dir, 0);
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
  // 恢复上次窗口位置/大小
  const savedBounds = store.get('windowBounds', null);
  const winOpts = {
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
    backgroundColor: '#1f1a15'
  };
  if (savedBounds && savedBounds.width && savedBounds.height) {
    Object.assign(winOpts, savedBounds);
  }
  mainWindow = new BrowserWindow(winOpts);

  // 关闭前保存窗口位置/大小
  const saveBounds = () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized() && !mainWindow.isMaximized()) {
        store.set('windowBounds', mainWindow.getBounds());
      }
    } catch (_) {}
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

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
    {
      label: '隐藏窗口',
      click: () => {
        if (mainWindow) mainWindow.hide();
      }
    },
    { type: 'separator' },
    {
      label: '新建对话',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('tray-new-conversation');
        }
      }
    },
    {
      label: '设置',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('tray-open-settings');
        }
      }
    },
    { type: 'separator' },
    {
      label: '重启',
      click: () => {
        app.relaunch();
        app.isQuitting = true;
        app.quit();
      }
    },
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
  // 设置日志文件路径（此时 app.getPath 可用）
  logger.setLogPath(app.getPath('userData'));

  createMainWindow();
  createTray();

  // 配置相关（API key 字段在读出时解密、写入时加密）
  ipcMain.handle('get-config', () => {
    const raw = store.store;
    const decrypted = { ...raw };
    if (raw.apiKey) decrypted.apiKey = decryptKey(raw.apiKey);
    if (Array.isArray(raw.models)) {
      decrypted.models = raw.models.map(m => ({
        ...m,
        apiKey: m.apiKey ? decryptKey(m.apiKey) : ''
      }));
    }
    return decrypted;
  });
  ipcMain.handle('set-config', (event, key, value) => {
    if (key === 'apiKey') {
      store.set(key, encryptKey(value));
    } else if (key === 'models' && Array.isArray(value)) {
      store.set(key, value.map(m => ({ ...m, apiKey: m.apiKey ? encryptKey(m.apiKey) : '' })));
    } else {
      store.set(key, value);
    }
    return true;
  });

  // 返回应用版本
  ipcMain.handle('get-app-version', () => {
    try {
      const pkg = require(path.join(__dirname, '../../package.json'));
      return pkg.version;
    } catch { return '未知'; }
  });

  // 在默认浏览器中打开外部链接
  ipcMain.handle('open-external', (event, url) => {
    if (url && typeof url === 'string') {
      shell.openExternal(url);
    }
  });

  // 返回应用图标 data URL（可选 size，默认 20x20，向后兼容）
  ipcMain.handle('get-app-icon', (event, size) => {
    const iconPath = path.join(__dirname, '../../icon.ico');
    try {
      const img = nativeImage.createFromPath(iconPath);
      const px = (size && size > 0 && size <= 512) ? size : 20;
      return img.resize({ width: px, height: px, quality: 'best' }).toDataURL();
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

  // 模型管理（每个模型的 apiKey 都加密存储）
  ipcMain.handle('get-models', () => {
    const models = store.get('models', []);
    return models.map(m => ({ ...m, apiKey: m.apiKey ? decryptKey(m.apiKey) : '' }));
  });
  ipcMain.handle('add-model', (event, model) => {
    const models = store.get('models', []);
    const enc = { ...model, apiKey: model.apiKey ? encryptKey(model.apiKey) : '' };
    models.push(enc);
    store.set('models', models);
    return models.map(m => ({ ...m, apiKey: m.apiKey ? decryptKey(m.apiKey) : '' }));
  });
  ipcMain.handle('remove-model', (event, index) => {
    const models = store.get('models', []);
    models.splice(index, 1);
    store.set('models', models);
    return models.map(m => ({ ...m, apiKey: m.apiKey ? decryptKey(m.apiKey) : '' }));
  });

  // ========== Claude Code 工具：文件操作 ==========

  // 读文件 + 自动识别编码（UTF-8 BOM / UTF-16 LE/BE / 严格 UTF-8 / GBK 兜底）
  function readTextWithDetectedEncoding(filePath) {
    const buf = fs.readFileSync(filePath);
    // BOM 检测
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return { content: buf.slice(3).toString('utf-8'), encoding: 'utf-8-bom' };
    }
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      return { content: iconv.decode(buf.slice(2), 'utf-16le'), encoding: 'utf-16le' };
    }
    if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
      return { content: iconv.decode(buf.slice(2), 'utf-16be'), encoding: 'utf-16be' };
    }
    // 无 BOM：严格 UTF-8 验证
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { content: decoded, encoding: 'utf-8' };
    } catch (_) {
      // 解码失败 → 试 GBK（中文 Windows ANSI）
      try {
        const gbk = iconv.decode(buf, 'gbk');
        // 简单校验：GBK 解码不会抛错，但要剔除明显失败的情况
        return { content: gbk, encoding: 'gbk' };
      } catch (_) {
        // 都不行 → latin1 兜底
        return { content: buf.toString('latin1'), encoding: 'latin1' };
      }
    }
  }

  ipcMain.handle('tool-read', (event, filePath) => {
    try {
      const { content, encoding } = readTextWithDetectedEncoding(filePath);
      return { success: true, content, encoding };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 读文件为 data URL（用于编辑器的图片预览）
  ipcMain.handle('read-file-as-data-url', (event, filePath) => {
    try {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mimeMap = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
        ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif'
      };
      const mime = mimeMap[ext] || 'application/octet-stream';
      const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
      return { success: true, dataUrl };
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
      const { content } = readTextWithDetectedEncoding(filePath);
      if (!content.includes(oldString)) {
        return { success: false, error: '未找到要替换的文本' };
      }
      const newContent = content.replace(oldString, newString);
      fs.writeFileSync(filePath, newContent, 'utf-8');
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
      const workDir = cwd || store.get('workDirectory');
      exec(command, {
        cwd: workDir,
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, output: (stdout || '') + (stderr ? '\n' + stderr : '') || error.message });
        } else {
          resolve({ success: true, output: stdout || stderr || '' });
        }
      });
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

  ipcMain.handle('get-file-tree', async (event, dir) => {
    try {
      const workDir = dir || store.get('workDirectory');
      const files = await getAllFiles(workDir);
      return { success: true, files, root: workDir, truncated: files.length >= MAX_TREE_FILES };
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

  // 通用附件选择：支持多选 + 图片/PDF/文本类
  ipcMain.handle('pick-attachments', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: '所有支持的文件', extensions: ['jpg','jpeg','png','gif','webp','bmp','avif','pdf','txt','md','json','csv','xml','yml','yaml','log','html','htm','css','js','ts','tsx','jsx','py','java','c','cpp','h','go','rs','rb','sh','bash','ini','toml','sql'] },
        { name: '图片', extensions: ['jpg','jpeg','png','gif','webp','bmp','avif'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: '文本/代码', extensions: ['txt','md','json','csv','xml','yml','yaml','log','html','css','js','ts','py','java','c','cpp','go','rs','rb','sh','sql','ini','toml'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return [];

    const IMG_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','avif']);
    const TEXT_EXTS = new Set(['txt','md','json','csv','xml','yml','yaml','log','html','htm','css','js','ts','tsx','jsx','py','java','c','cpp','h','go','rs','rb','sh','bash','ini','toml','sql','conf','env']);
    const MAX_TEXT_BYTES = 256 * 1024; // 最多内联 256KB 文本，超过给路径 hint
    const out = [];
    for (const fp of result.filePaths) {
      try {
        const stat = fs.statSync(fp);
        const ext = path.extname(fp).slice(1).toLowerCase();
        const name = path.basename(fp);
        if (IMG_EXTS.has(ext)) {
          const buf = fs.readFileSync(fp);
          out.push({
            kind: 'image',
            name,
            path: fp,
            size: stat.size,
            mediaType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            data: buf.toString('base64'),
          });
        } else if (ext === 'pdf') {
          out.push({ kind: 'pdf', name, path: fp, size: stat.size });
        } else if (TEXT_EXTS.has(ext) || stat.size <= 64 * 1024) {
          // 未知扩展名但 <=64KB 也按文本试读
          if (stat.size > MAX_TEXT_BYTES) {
            out.push({ kind: 'other', name, path: fp, size: stat.size });
          } else {
            try {
              const text = require('./tool-executor').readTextSmart
                ? require('./tool-executor').readTextSmart(fp)
                : fs.readFileSync(fp, 'utf-8');
              out.push({ kind: 'text', name, path: fp, size: stat.size, text });
            } catch (_) {
              out.push({ kind: 'other', name, path: fp, size: stat.size });
            }
          }
        } else {
          out.push({ kind: 'other', name, path: fp, size: stat.size });
        }
      } catch (err) {
        console.error('[pick-attachments]', fp, err.message);
      }
    }
    return out;
  });

  ipcMain.handle('paste-image', () => {
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      return { data: image.toPNG().toString('base64'), mediaType: 'image/png' };
    }
    return null;
  });

  // 把粘贴/拖拽的 base64 图片落盘到 userData/pasted-images，返回绝对路径
  // 这样 Claude 调用接受文件路径参数的 MCP 工具（如 understand_image）时能拿到真实路径
  ipcMain.handle('save-pasted-image', async (event, payload) => {
    try {
      if (!payload || !payload.data) return null;
      const mediaType = payload.mediaType || 'image/png';
      const ext = mediaType.split('/')[1] || 'png';
      const dir = path.join(app.getPath('userData'), 'pasted-images');
      await fs.promises.mkdir(dir, { recursive: true });
      const filename = `paste-${Date.now()}.${ext}`;
      const filepath = path.join(dir, filename);
      await fs.promises.writeFile(filepath, Buffer.from(payload.data, 'base64'));
      return { path: filepath, mediaType };
    } catch (err) {
      console.error('[save-pasted-image] failed:', err);
      return null;
    }
  });

  // 删除已落盘的粘贴图片（同时清理引用计数为 0 的目录暂不处理，交给 clear-cache）
  ipcMain.handle('delete-pasted-images', async (event, paths) => {
    if (!Array.isArray(paths)) return;
    for (const p of paths) {
      try {
        if (typeof p === 'string' && p.includes('pasted-images') && fs.existsSync(p)) {
          await fs.promises.unlink(p);
          console.log('[delete-pasted-images] 已删除:', p);
        }
      } catch (err) {
        console.warn('[delete-pasted-images] failed:', p, err.message);
      }
    }
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
    const config = readDecryptedConfig(store);
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
    const config = readDecryptedConfig(store);
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
    const workDir = store.get('workDirectory');
    const result = await executeTool(toolName, input, { window: mainWindow, workDir });
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, content: result.content };
  });

  // ========== 任务管理（Plan UI 用） ==========

  ipcMain.handle('get-tasks', () => {
    const { taskGetAll } = require('./tool-executor');
    return taskGetAll();
  });

  ipcMain.handle('clear-tasks', () => {
    const { taskClearAll, clearBackgroundAgents } = require('./tool-executor');
    taskClearAll({ window: mainWindow });
    clearBackgroundAgents();
    return true;
  });

  // ========== 日志 ==========

  ipcMain.handle('get-logs', (event, options) => {
    const n = (options && options.lines) || 200;
    const search = (options && options.search) || '';
    const lines = logger.readLastLines(n, search);
    return { lines, path: logger.getLogPath() };
  });

  ipcMain.handle('clear-logs', () => {
    logger.clearLogs();
    return { success: true };
  });

  ipcMain.handle('export-logs', async () => {
    const logPath = logger.getLogPath();
    if (!logPath || !fs.existsSync(logPath)) {
      return { success: false, error: '日志文件不存在' };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出日志',
      defaultPath: path.join(os.homedir(), 'cc-wrap-logs-' + new Date().toISOString().slice(0, 10) + '.log'),
      filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
    });
    if (result.canceled) return { success: false, error: '已取消' };
    try {
      fs.copyFileSync(logPath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-conversation', async (event, md, workDir) => {
    const defaultDir = (workDir && fs.existsSync(workDir)) ? workDir : os.homedir();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出对话',
      defaultPath: path.join(defaultDir, 'chat-export-' + new Date().toISOString().slice(0, 10) + '.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled) return { success: false, error: '已取消' };
    try {
      fs.writeFileSync(result.filePath, md, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== 集成终端 ==========

  ipcMain.handle('terminal-spawn', (event, options) => {
    const { shell, cols = 80, rows = 24, cwd } = options || {};
    const pty = ptySpawn(shell || process.env.COMSPEC || 'cmd.exe', [], {
      name: 'xterm-256color',
      cols, rows,
      cwd: cwd || store.get('workDirectory') || process.cwd(),
      env: process.env
    });
    const id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pty.onData((data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal-output', { terminalId: id, data });
      }
    });
    pty.onExit(() => { terminals.delete(id); });
    terminals.set(id, pty);
    return { terminalId: id };
  });

  ipcMain.handle('terminal-write', (event, { terminalId, data }) => {
    const pty = terminals.get(terminalId);
    if (pty) pty.write(data);
  });

  ipcMain.handle('terminal-resize', (event, { terminalId, cols, rows }) => {
    const pty = terminals.get(terminalId);
    if (pty) pty.resize(cols, rows);
  });

  ipcMain.handle('terminal-kill', (event, { terminalId }) => {
    const pty = terminals.get(terminalId);
    if (pty) { pty.kill(); terminals.delete(terminalId); }
  });

  // ========== 清除缓存 ==========

  ipcMain.handle('clear-cache', async (event, type) => {
    const userData = app.getPath('userData');
    switch (type) {
      case 'pasted-images': {
        const imgDir = path.join(userData, 'pasted-images');
        if (fs.existsSync(imgDir)) {
          fs.rmSync(imgDir, { recursive: true, force: true });
          fs.mkdirSync(imgDir, { recursive: true });
        }
        break;
      }
      case 'conversations': {
        const convPath = path.join(userData, 'conversations.json');
        fs.writeFileSync(convPath, '[]', 'utf-8');
        break;
      }
      case 'logs':
        logger.clearLogs();
        break;
      case 'all': {
        // 清理图片
        const imgDir = path.join(userData, 'pasted-images');
        if (fs.existsSync(imgDir)) {
          fs.rmSync(imgDir, { recursive: true, force: true });
          fs.mkdirSync(imgDir, { recursive: true });
        }
        // 清理对话
        const convPath = path.join(userData, 'conversations.json');
        fs.writeFileSync(convPath, '[]', 'utf-8');
        // 清理日志
        logger.clearLogs();
        break;
      }
      default:
        return { success: false, error: '未知类型: ' + type };
    }
    console.log('[Cache] 已清理:', type);
    return { success: true };
  });

  // ========== Agent Loop ==========

  ipcMain.handle('agent-start', async (event, options) => {
    const config = readDecryptedConfig(store);
    const loopId = options.loopId || 'loop_' + Date.now();

    // 获取 MCP 工具定义
    const mcpTools = mcp.getAllMcpTools();

    // 合并配置
    const agentOptions = {
      ...options,
      loopId,
      workDir: options.workDir || config.workDirectory,
      mcpTools,
      window: mainWindow,
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

  // ========== 对话历史（存到文件，避免 localStorage 的 5MB 限制）==========

  const conversationsPath = () => path.join(app.getPath('userData'), 'conversations.json');

  ipcMain.handle('get-conversations', () => {
    try {
      const raw = fs.readFileSync(conversationsPath(), 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  });

  ipcMain.handle('save-conversations', (event, conversations) => {
    try {
      const userDataDir = app.getPath('userData');
      fs.mkdirSync(userDataDir, { recursive: true });
      // 原子写：先写临时文件再 rename，避免写入过程中应用崩溃导致文件损坏
      const finalPath = conversationsPath();
      const tmpPath = finalPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(conversations || []));
      fs.renameSync(tmpPath, finalPath);
      return true;
    } catch (err) {
      console.error('[Conversations] 保存失败:', err.message);
      return false;
    }
  });

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
    const tmpPath = path.join(memoryDir, 'memory.json.tmp');
    const finalPath = path.join(memoryDir, 'memory.json');
    fs.writeFileSync(tmpPath, JSON.stringify(memory, null, 2));
    fs.renameSync(tmpPath, finalPath);
    return true;
  });

  // ========== Skills 系统 ==========
  // 来源合并：
  //   1) %APPDATA%/cc-wrap/skills.json （UI 手添加的）
  //   2) %APPDATA%/cc-wrap/skills/<name>/SKILL.md  （文件协议，cc-wrap 自己的标准目录）
  //   3) ~/.claude/skills/<name>/SKILL.md          （兼容 Claude Code 已装的 skill）
  // 文件型 skill 支持 YAML frontmatter（name/description/triggers/alwaysActive）。
  function parseFrontmatter(text) {
    if (!text || !text.startsWith('---')) return { meta: {}, body: text || '' };
    const end = text.indexOf('\n---', 3);
    if (end < 0) return { meta: {}, body: text };
    const header = text.slice(3, end).trim();
    const body = text.slice(end + 4).replace(/^\r?\n/, '');
    const meta = {};
    header.split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.+)$/);
      if (!m) return;
      const key = m[1].trim();
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (/^\[.*\]$/.test(val)) {
        try { meta[key] = JSON.parse(val.replace(/'/g, '"')); return; } catch (_) {
          // JSON.parse 失败时（bare words 如 [image, 图片]），手动分割
          meta[key] = val.slice(1, -1).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          return;
        }
      }
      if (val === 'true' || val === 'false') { meta[key] = (val === 'true'); return; }
      meta[key] = val;
    });
    return { meta, body };
  }

  function scanSkillDir(dir, sourceLabel) {
    const out = [];
    try {
      if (!fs.existsSync(dir)) return out;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const skillDir = path.join(dir, e.name);
        const candidates = ['SKILL.md', 'skill.md', 'SKILL.txt'];
        let mdPath = null;
        for (const c of candidates) {
          const p = path.join(skillDir, c);
          if (fs.existsSync(p)) { mdPath = p; break; }
        }
        if (!mdPath) continue;
        try {
          const raw = fs.readFileSync(mdPath, 'utf-8');
          const { meta, body } = parseFrontmatter(raw);
          out.push({
            name: meta.name || e.name,
            description: meta.description || '',
            content: body,
            triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
            alwaysActive: !!meta.alwaysActive,
            source: sourceLabel,
            path: mdPath,
            // 我们自己 InstallSkill 装到 cc-wrap 目录的 skill 允许 UI 管理（toggle/edit/delete）；
            // ~/.claude/skills/ 是别的工具装的，保持只读避免误改
            readonly: sourceLabel === 'claude-code',
          });
        } catch (err) {
          console.warn('[skills] skip', mdPath, err.message);
        }
      }
    } catch (err) {
      console.warn('[skills] scan failed', dir, err.message);
    }
    return out;
  }

  function loadAllSkills() {
    const userData = app.getPath('userData');
    // 1) JSON 来源（UI 编辑的，可写）
    let jsonSkills = [];
    try {
      const skillsPath = path.join(userData, 'skills.json');
      const raw = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
      const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.skills) ? raw.skills : []);
      jsonSkills = arr.map(s => Object.assign({ source: 'user', readonly: false, alwaysActive: !!s.alwaysActive, triggers: s.triggers || [] }, s));
    } catch (_) {}

    // 2) cc-wrap 文件目录
    const ccwrapDir = path.join(userData, 'skills');
    const fileSkills = scanSkillDir(ccwrapDir, 'cc-wrap');

    // 3) Claude Code 兼容目录
    const claudeDir = path.join(require('os').homedir(), '.claude', 'skills');
    const claudeSkills = scanSkillDir(claudeDir, 'claude-code');

    // 合并：JSON > cc-wrap文件 > claude目录（重名以 JSON 优先）
    const map = new Map();
    [...claudeSkills, ...fileSkills, ...jsonSkills].forEach(s => {
      if (!s || !s.name) return;
      map.set(s.name, s);
    });
    return Array.from(map.values());
  }

  ipcMain.handle('get-skills', () => {
    const skills = loadAllSkills();
    return { skills };
  });
  // 给主进程其他模块（agent-loop）用
  global.__loadAllSkills = loadAllSkills;

  ipcMain.handle('save-skills', (event, data) => {
    const userDataDir = app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    const arr = Array.isArray(data) ? data : (data && Array.isArray(data.skills) ? data.skills : []);

    // 1) JSON 来源（手动添加，非文件型）→ skills.json
    const writable = arr.filter(s => !s.readonly && s.source !== 'cc-wrap' && s.source !== 'claude-code')
      .map(s => ({
        name: s.name,
        description: s.description || '',
        content: s.content || '',
        triggers: Array.isArray(s.triggers) ? s.triggers : [],
        alwaysActive: !!s.alwaysActive,
      }));
    fs.writeFileSync(path.join(userDataDir, 'skills.json'), JSON.stringify(writable, null, 2));

    // 2) cc-wrap 文件来源 → 回写各自的 SKILL.md，且删除已不在列表里的目录
    const ccwrapDir = path.join(userDataDir, 'skills');
    const ccwrapSkills = arr.filter(s => s.source === 'cc-wrap' && s.name);
    for (const s of ccwrapSkills) {
      try {
        const skillDir = path.join(ccwrapDir, s.name);
        fs.mkdirSync(skillDir, { recursive: true });
        const fm =
          '---\n' +
          'name: ' + s.name + '\n' +
          'description: ' + JSON.stringify(s.description || '') + '\n' +
          'triggers: ' + JSON.stringify(Array.isArray(s.triggers) ? s.triggers : []) + '\n' +
          'alwaysActive: ' + (s.alwaysActive ? 'true' : 'false') + '\n' +
          '---\n\n';
        const body = (s.content || '').replace(/^---[\s\S]*?\n---\s*\n+/, '');
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fm + body, 'utf-8');
      } catch (err) {
        console.warn('[save-skills] 回写 cc-wrap skill 失败', s.name, err.message);
      }
    }
    // 删除已被用户移除的 cc-wrap skill 目录
    try {
      if (fs.existsSync(ccwrapDir)) {
        const keep = new Set(ccwrapSkills.map(s => s.name));
        for (const entry of fs.readdirSync(ccwrapDir, { withFileTypes: true })) {
          if (!entry.isDirectory() || keep.has(entry.name)) continue;
          try {
            fs.rmSync(path.join(ccwrapDir, entry.name), { recursive: true, force: true });
            console.log('[save-skills] 已删除 cc-wrap skill 目录:', entry.name);
          } catch (err) {
            console.warn('[save-skills] 删除目录失败', entry.name, err.message);
          }
        }
      }
    } catch (err) {
      console.warn('[save-skills] 清理 cc-wrap 目录失败', err.message);
    }
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
      // 第一步：检测 URL 本身是否是 HTTP MCP 端点
      const probeResponse = await fetch(url, {
        headers: { 'Accept': 'application/json, text/event-stream' },
        signal: AbortSignal.timeout(8000),
      });

      const contentType = probeResponse.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') || contentType.includes('json')) {
        // 是 MCP HTTP 端点，直接添加
        const name = new URL(url).hostname.replace(/^www\./, '') + '-mcp';
        const mcpPath = path.join(app.getPath('userData'), 'mcp-servers.json');
        let mcpData = { servers: [] };
        try { mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')); } catch {}

        // 检查是否已存在
        const existing = mcpData.servers.find(s => s.command === url);
        if (existing) {
          return { success: false, message: `MCP 服务器 "${existing.name}" 已存在` };
        }

        const server = { name, command: url, args: [], cwd: '', env: {} };
        mcpData.servers.push(server);
        fs.writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2));

        // 自动连接
        await mcp.connectAllServers([server]);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('mcp-status', mcp.getServerStatuses());
        }

        return { success: true, added: [name], message: `已添加并连接 HTTP MCP: ${name}` };
      }

      // 第二步：不是 MCP 端点，作为 HTML 页面尝试解析
      const html = await probeResponse.text();

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
            await mcp.connectAllServers(newServers);

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

// 应用退出前清理所有 MCP 子进程和终端 pty（防止 Windows 上的进程残留）
app.on('before-quit', () => {
  app.isQuitting = true;
  try { mcp.closeAll(); } catch (e) { console.error('[MCP] 退出清理失败:', e.message); }
  for (const [, pty] of terminals) { try { pty.kill(); } catch (_) {} }
  terminals.clear();
  try { require('./tool-executor').clearBackgroundAgents(); } catch (_) {}
});
