// IPC via preload bridge (window.api)

// 日志函数
function log(msg) { console.log('[cc-wrap]', msg); }
function logError(msg) { console.error('[cc-wrap ERROR]', msg); }

// ========== 国际化 ==========
var I18N = {
  zh: {
    newChat: '新对话', exportBtn: '导出', sendPlaceholder: '输入消息... (Enter 发送, Ctrl+V 粘贴图片)',
    useTools: '使用工具', streamMode: '流式响应', stopHint: '停止生成 (Escape)',
    settings: '设置', memory: '记忆', mcp: 'MCP', skills: 'Skills',
    tabConversations: '对话', tabFiles: '文件',
    openFolder: '打开文件夹', noDir: '未选择目录', newFile: '+ 文件', newFolder: '+ 文件夹', collapseAll: '− 全部',
    // 设置国际化
    apiConfig: 'API配置', themeSettings: '主题设置', generalSettings: '通用设置',
    globalConfig: '全局配置', apiKeyLabel: '全局 API 密钥（Claude 模型使用）',
    defaultModel: '默认模型', maxTokens: '最大Token数', temperature: '温度', saveConfig: '保存全局配置',
    addModel: '添加第三方模型', modelName: '模型名称', modelId: '模型ID',
    apiEndpoint: 'API端点', apiKeyModel: 'API密钥', modelPlaceholderKey: '模型专属密钥',
    addModelBtn: '添加模型', addedModels: '已添加的模型', noModels: '暂无第三方模型',
    endpointDefault: '默认', keySet: '已设置', keyNotSet: '未设置',
    editModel: '编辑', deleteModel: '删除', confirmDelete: '确定删除模型',
    saved: '已保存', added: '已添加', fillNameId: '请填写模型名称和ID',
    reasoningEffort: '思考级别', effortOff: '关闭', effortLow: '低', effortMedium: '中', effortHigh: '高',
    // 主题
    chooseTheme: '选择主题', darkMode: '深色模式', lightMode: '浅色模式',
    // 通用
    langLabel: '界面语言 / Language', workDir: '工作目录', selectDir: '选择',
    allowedTools: '允许的工具',
    // 日志
    logs: '日志', logViewer: '日志查看', logSearch: '搜索日志...',
    refreshLogs: '刷新', clearLogs: '清空日志', logsCleared: '日志已清空',
    noLogs: '暂无日志', logsPath: '日志文件路径', exportLogs: '导出日志',
    // 缓存
    clearCache: '清理缓存', cacheCleared: '缓存已清理',
    clearPastedImages: '清理粘贴的图片', clearConversations: '清理对话历史',
    clearAllCache: '清理所有缓存', clearConfirm: '确定要清理吗？此操作不可撤销。',
    exportSuccess: '对话已导出为 Markdown 文件', exportClipboard: '导出失败，已复制到剪贴板',
    autoSave: '自动保存', autoSaveDesc: '编辑文件时自动保存（每 5 秒）',
    tokenStats: 'Token 统计', today: '今天', yesterday: '昨天', last30d: '近 30 天',
    sessions: '会话数', totalTokens: 'Token 总量', less: '少', more: '多',
    about: '关于', appVersion: '版本', appDescription: 'cc-wrap 是一个基于 Electron 的 Claude Code 桌面前端，支持多模型、MCP 工具扩展、Skills 注入、记忆系统等功能。',
    githubRepo: 'GitHub 仓库',
  },
  en: {
    newChat: 'New Chat', exportBtn: 'Export', sendPlaceholder: 'Type a message... (Enter to send, Ctrl+V paste image)',
    useTools: 'Tools', streamMode: 'Streaming', stopHint: 'Stop (Escape)',
    settings: 'Settings', memory: 'Memory', mcp: 'MCP', skills: 'Skills',
    tabConversations: 'Chat', tabFiles: 'Files',
    openFolder: 'Open Folder', noDir: 'No directory', newFile: '+ File', newFolder: '+ Folder', collapseAll: '− All',
    // Settings i18n
    apiConfig: 'API Configuration', themeSettings: 'Theme Settings', generalSettings: 'General',
    globalConfig: 'Global Configuration', apiKeyLabel: 'Global API Key (used by Claude models)',
    defaultModel: 'Default Model', maxTokens: 'Max Tokens', temperature: 'Temperature', saveConfig: 'Save Configuration',
    addModel: 'Add Custom Model', modelName: 'Model Name', modelId: 'Model ID',
    apiEndpoint: 'API Endpoint', apiKeyModel: 'API Key', modelPlaceholderKey: 'Model-specific key (optional)',
    addModelBtn: 'Add Model', addedModels: 'Added Models', noModels: 'No custom models',
    endpointDefault: 'default', keySet: 'Set', keyNotSet: 'Not set',
    editModel: 'Edit', deleteModel: 'Delete', confirmDelete: 'Are you sure you want to delete model',
    saved: 'Saved', added: 'Added', fillNameId: 'Please enter model name and ID',
    reasoningEffort: 'Reasoning Effort', effortOff: 'Off', effortLow: 'Low', effortMedium: 'Medium', effortHigh: 'High',
    // Theme
    chooseTheme: 'Choose Theme', darkMode: 'Dark Mode', lightMode: 'Light Mode',
    // General
    langLabel: 'Interface Language', workDir: 'Working Directory', selectDir: 'Select',
    allowedTools: 'Allowed Tools',
    // Logs
    logs: 'Logs', logViewer: 'Log Viewer', logSearch: 'Search logs...',
    refreshLogs: 'Refresh', clearLogs: 'Clear Logs', logsCleared: 'Logs cleared',
    noLogs: 'No logs yet', logsPath: 'Log file path', exportLogs: 'Export Logs',
    // Cache
    clearCache: 'Clear Cache', cacheCleared: 'Cache cleared',
    clearPastedImages: 'Clear Pasted Images', clearConversations: 'Clear Conversations',
    clearAllCache: 'Clear All Cache', clearConfirm: 'Are you sure? This action cannot be undone.',
    exportSuccess: 'Conversation exported as Markdown', exportClipboard: 'Export failed, copied to clipboard',
    autoSave: 'Auto Save', autoSaveDesc: 'Auto-save edited files (every 5s)',
    tokenStats: 'Token Stats', today: 'Today', yesterday: 'Yesterday', last30d: 'Last 30 Days',
    sessions: 'Sessions', totalTokens: 'Total Tokens', less: 'Less', more: 'More',
    about: 'About', appVersion: 'Version', appDescription: 'cc-wrap is an Electron desktop frontend for Claude Code, supporting multiple models, MCP tools, Skills, and memory system.',
    githubRepo: 'GitHub Repository',
  }
};
function t(key) {
  var lang = (state.config && state.config.language) || 'zh';
  return (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key;
}
function applyLanguage() {
  var lang = (state.config && state.config.language) || 'zh';
  var el;
  // newChatBtn 保持为 "+" 图标按钮，只更新 title
  el = $('newChatBtn'); if (el) el.title = t('newChat');
  el = $('exportBtn'); if (el) el.textContent = t('exportBtn');
  el = $('messageInput'); if (el) el.placeholder = t('sendPlaceholder');
  el = $('settingsBtn'); if (el) { var sl = el.querySelector('.footer-label'); if (sl) sl.textContent = t('settings'); else el.textContent = t('settings'); }
  el = $('memoryBtn'); if (el) { var ml = el.querySelector('.footer-label'); if (ml) ml.textContent = t('memory'); else el.textContent = t('memory'); }
  el = $('mcpBtn'); if (el) { var cl = el.querySelector('.footer-label'); if (cl) cl.textContent = t('mcp'); else el.textContent = t('mcp'); }
  var useToolsLabel = document.querySelector('label[for="useTools"]') || $('useTools')?.parentElement;
  if (useToolsLabel) useToolsLabel.childNodes[useToolsLabel.childNodes.length - 1].textContent = ' ' + t('useTools');
  var streamLabel = document.querySelector('label[for="streamMode"]') || $('streamMode')?.parentElement;
  if (streamLabel) streamLabel.childNodes[streamLabel.childNodes.length - 1].textContent = ' ' + t('streamMode');
  el = $('stopBtn'); if (el) el.title = t('stopHint');
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    var tab = btn.getAttribute('data-tab');
    if (tab === 'conversations') btn.textContent = t('tabConversations');
    else if (tab === 'files') btn.textContent = t('tabFiles');
    else if (tab === 'skills') btn.textContent = t('skills');
  });
  // 设置 tab 标签
  document.querySelectorAll('.stab').forEach(function(btn) {
    var tab = btn.getAttribute('data-stab');
    if (tab === 'api') btn.textContent = t('apiConfig');
    else if (tab === 'theme') btn.textContent = t('themeSettings');
    else if (tab === 'general') btn.textContent = t('generalSettings');
    else if (tab === 'logs') btn.textContent = t('logs');
    else if (tab === 'tokens') btn.textContent = t('tokenStats');
    else if (tab === 'about') btn.textContent = t('about');
  });
  // 文件面板按钮
  el = $('openFolderBtn'); if (el) el.textContent = t('openFolder');
  el = $('currentDir'); if (el && !state.workDir) el.textContent = t('noDir');
  el = $('newFileBtn'); if (el) el.textContent = t('newFile');
  el = $('newFolderBtn'); if (el) el.textContent = t('newFolder');
  el = $('collapseAllBtn'); if (el) el.textContent = t('collapseAll');
}

// 状态
const state = {
  conversations: [],
  currentConversation: null,
  config: {},
  models: [],
  skills: [],
  mcpServers: [],
  mcpStatuses: [],
  workDir: '',
  memories: [],
  isGenerating: false,
  generatingConversationId: null,
  attachedImage: null,
  attachedFiles: [],
  tasks: [],
  tasksPanelCollapsed: false,
  allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'ListDirectory'],
  theme: 'dark',
  // 文件编辑器状态
  openFiles: [],       // [{name, path, content, originalContent, modified}]
  activeFileIndex: -1, // 当前激活的文件索引
  // Agent loop 状态
  currentLoopId: null,
  agentMessages: [],   // Anthropic 格式的消息历史
  // 终端状态
  terminal: null,
  terminalFit: null,
  terminalId: null,
  terminalActive: false
};

// 斜杠命令定义
const SLASH_COMMANDS = [
  { name: '/help', desc: '显示帮助信息' },
  { name: '/clear', desc: '清空当前对话' },
  { name: '/compact', desc: '压缩对话历史，节省 Token' },
  { name: '/config', desc: '打开设置面板' },
  { name: '/cost', desc: '查看当前会话 Token 消耗' },
  { name: '/export', desc: '导出对话到剪贴板' },
  { name: '/init', desc: '在工作目录初始化 CLAUDE.md' },
  { name: '/mcp', desc: '管理 MCP 服务器' },
  { name: '/memory', desc: '管理记忆' },
  { name: '/model', desc: '切换模型' },
  { name: '/permissions', desc: '管理工具权限' },
  { name: '/skill', desc: '引用自定义 Skill' },
  { name: '/theme', desc: '切换深色/浅色主题' },
  { name: '/tools', desc: '查看可用工具列表' },
  { name: '/workdir', desc: '查看/设置工作目录' }
];

function $(id) { return document.getElementById(id); }
function esc(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 初始化
async function init() {
  log('初始化开始...');

  try {
    state.config = await window.api.invoke('get-config');
    log('配置已加载: ' + JSON.stringify(Object.keys(state.config)));
  } catch (e) {
    logError('配置加载失败: ' + e.message);
    state.config = {};
  }

  // 应用语言设置
  applyLanguage();

  // 加载标题栏图标 + 欢迎页 logo
  (async () => {
    try {
      const iconDataUrl = await window.api.invoke('get-app-icon');
      if (iconDataUrl) {
        const drag = document.querySelector('.titlebar-drag');
        if (drag) {
          const img = document.createElement('img');
          img.src = iconDataUrl;
          img.className = 'titlebar-icon';
          img.alt = '';
          drag.prepend(img);
        }
      }
      // 欢迎页 logo 使用更高分辨率
      const bigIcon = await window.api.invoke('get-app-icon', 128);
      if (bigIcon) {
        const welcomeLogo = document.getElementById('welcomeLogo');
        if (welcomeLogo) welcomeLogo.src = bigIcon;
      }
    } catch (e) { /* 图标加载失败不影响主流程 */ }
  })();

  // 对话历史：从主进程文件加载（兼容旧 localStorage 数据，自动迁移）
  state.conversations = [];
  (async () => {
    try {
      var fromFile = await window.api.invoke('get-conversations');
      if (Array.isArray(fromFile) && fromFile.length > 0) {
        state.conversations = fromFile;
      } else {
        // 文件无数据：尝试从 localStorage 迁移
        try {
          var legacy = JSON.parse(localStorage.getItem('conversations') || '[]');
          if (Array.isArray(legacy) && legacy.length > 0) {
            state.conversations = legacy;
            await window.api.invoke('save-conversations', legacy);
            localStorage.removeItem('conversations');
            log('对话已从 localStorage 迁移到主进程文件');
          }
        } catch (e) {}
      }
      renderConversations();
      if (state.conversations.length > 0 && !state.currentConversation) {
        state.currentConversation = state.conversations[0];
        renderMessages();
      }
    } catch (e) {
      logError('加载对话失败: ' + e.message);
    }
  })();

  state.workDir = state.config.workDirectory || '';
  state.theme = state.config.theme || 'dark';
  if (state.workDir) loadFileTree();

  // 加载记忆
  try {
    var memResult = await window.api.invoke('get-memory');
    if (memResult && memResult.memories) {
      state.memories = memResult.memories;
    }
  } catch (e) {
    logError('记忆加载失败: ' + e.message);
  }

  // 加载 Skills
  try {
    var skillResult = await window.api.invoke('get-skills');
    if (skillResult && skillResult.skills) {
      state.skills = skillResult.skills;
    }
  } catch (e) {
    logError('Skills加载失败: ' + e.message);
  }

  // 加载 MCP 服务器
  try {
    var mcpResult = await window.api.invoke('get-mcp-servers');
    if (mcpResult && mcpResult.servers) {
      state.mcpServers = mcpResult.servers;
    }
  } catch (e) {
    logError('MCP加载失败: ' + e.message);
  }

  // 模型列表（无内置预设，由用户在设置里添加）
  state.models = [];
  if (state.config.models && state.config.models.length > 0) {
    for (var i = 0; i < state.config.models.length; i++) {
      var m = state.config.models[i];
      state.models.push({ name: m.name, id: m.id, endpoint: m.endpoint, apiKey: m.apiKey, provider: m.provider, maxTokens: m.maxTokens, temperature: m.temperature, reasoningEffort: m.reasoningEffort || 'off' });
    }
  }

  applyTheme(state.theme);
  applyFontSize(state.config.fontSize || 14);
  renderModelSelect();
  renderConversations();
  renderSkills();
  setupEvents();

  log('初始化完成');

  // 自动聚焦输入框
  var msgInput = $('messageInput');
  if (msgInput) setTimeout(function() { msgInput.focus(); }, 100);
}

// 事件绑定
function setupEvents() {
  // 窗口控制
  var btnMin = $('btnMinimize');
  if (btnMin) btnMin.onclick = function() { window.api.invoke('window-minimize'); };
  var btnMax = $('btnMaximize');
  if (btnMax) btnMax.onclick = function() { window.api.invoke('window-maximize'); };
  var btnClose = $('btnClose');
  if (btnClose) btnClose.onclick = function() { window.api.invoke('window-close'); };

  // 新建对话
  var newBtn = $('newChatBtn');
  if (newBtn) newBtn.onclick = function() { createNewConversation(); };

  // 发送按钮
  var sendBtn = $('sendBtn');
  if (sendBtn) sendBtn.onclick = function() { sendMessage(); };

  // 停止按钮
  var stopBtn = $('stopBtn');
  if (stopBtn) stopBtn.onclick = function() { stopGeneration(); };

  // 附件按钮
  var attachBtn = $('attachBtn');
  if (attachBtn) attachBtn.onclick = function() { uploadImage(); };

  // 输入框
  var input = $('messageInput');
  if (input) {
    var acIndex = -1;
    var acCommands = [];

    input.onkeydown = function(e) {
      var acEl = $('commandAutocomplete');

      // 自动补全导航
      if (acEl && acEl.style.display !== 'none') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          acIndex = Math.min(acIndex + 1, acCommands.length - 1);
          updateAcHighlight(acEl, acIndex);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          acIndex = Math.max(acIndex - 1, 0);
          updateAcHighlight(acEl, acIndex);
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && acIndex >= 0)) {
          e.preventDefault();
          if (acIndex >= 0 && acIndex < acCommands.length) {
            input.value = acCommands[acIndex].name + ' ';
          }
          acEl.style.display = 'none';
          acIndex = -1;
          return;
        }
        if (e.key === 'Escape') {
          acEl.style.display = 'none';
          acIndex = -1;
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    input.oninput = function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 160) + 'px';

      // 斜杠命令自动补全
      var val = this.value;
      var acEl = $('commandAutocomplete');
      if (!acEl) return;

      if (val.startsWith('/')) {
        var query = val.toLowerCase();
        acCommands = SLASH_COMMANDS.filter(function(cmd) {
          return cmd.name.toLowerCase().indexOf(query) >= 0;
        });

        if (acCommands.length > 0 && val.length < 20) {
          acIndex = 0;
          acEl.innerHTML = acCommands.map(function(cmd, i) {
            return '<div class="cmd-ac-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' +
              '<span class="cmd-ac-name">' + cmd.name + '</span>' +
              '<span class="cmd-ac-desc">' + cmd.desc + '</span></div>';
          }).join('');
          acEl.style.display = 'block';

          acEl.querySelectorAll('.cmd-ac-item').forEach(function(item) {
            item.onmousedown = function(e) {
              e.preventDefault();
              var idx = parseInt(this.getAttribute('data-idx'));
              input.value = acCommands[idx].name + ' ';
              acEl.style.display = 'none';
              input.focus();
            };
          });
        } else {
          acEl.style.display = 'none';
        }
      } else {
        acEl.style.display = 'none';
      }
    };

    // 点击其他区域关闭补全
    document.addEventListener('click', function(e) {
      var acEl = $('commandAutocomplete');
      if (acEl && !input.contains(e.target) && !acEl.contains(e.target)) {
        acEl.style.display = 'none';
      }
    });
  }

  // 移除附件
  var removeBtn = $('removeAttachment');
  if (removeBtn) removeBtn.onclick = function() { state.attachedImage = null; state.attachedFiles = []; renderAttachmentPreview(); };

  // 粘贴事件 - 处理剪贴板中的所有图片，追加到附件列表
  var inputEl = $('messageInput');
  if (inputEl) {
    inputEl.onpaste = function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var imgFiles = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        // 同一个 paste 事件里把所有图片项的 File 对象同步取出来，避免 items 列表被回收
        if (it.kind === 'file' && it.type && it.type.indexOf('image') >= 0) {
          var f = it.getAsFile();
          if (f) imgFiles.push(f);
        }
      }
      if (imgFiles.length === 0) return;
      e.preventDefault();
      log('[paste] 检测到 ' + imgFiles.length + ' 张图片；当前已附件 ' + state.attachedFiles.length + ' 个');
      // 串行读，全部 onload 完成再统一 attach（避免不同 reader 竞速带来的奇怪覆盖）
      Promise.all(imgFiles.map(function(blob, idx) {
        return new Promise(function(resolve) {
          var reader = new FileReader();
          reader.onload = function() {
            var dataUrl = reader.result || '';
            var commaIdx = dataUrl.indexOf(',');
            var data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
            var type = blob.type || 'image/png';
            var ext = (type.split('/')[1] || 'png').toLowerCase();
            resolve({
              kind: 'image',
              name: 'pasted-' + Date.now() + '-' + idx + '.' + ext,
              mediaType: type,
              data: data,
            });
          };
          reader.onerror = function() { resolve(null); };
          reader.readAsDataURL(blob);
        });
      })).then(function(items) {
        items.forEach(function(it) { if (it) attachFile(it); });
        log('[paste] 完成；当前已附件 ' + state.attachedFiles.length + ' 个');
      });
    };

    // 拖拽文件到输入框/聊天区 → 当作附件
    var dropZone = document.querySelector('.chat-area') || inputEl;
    if (dropZone) {
      dropZone.addEventListener('dragover', function(e) {
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.indexOf('Files') >= 0) {
          e.preventDefault();
        }
      });
      dropZone.addEventListener('drop', function(e) {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        Array.from(e.dataTransfer.files).forEach(function(f) {
          // 只支持图片直接拖入（其他类型走文件选择器，因为浏览器拿不到本地路径）
          if (f.type.indexOf('image') >= 0) {
            var reader = new FileReader();
            reader.onload = function() {
              attachFile({
                kind: 'image',
                name: f.name || ('dropped-' + Date.now() + '.png'),
                mediaType: f.type || 'image/png',
                data: reader.result.split(',')[1],
              });
            };
            reader.readAsDataURL(f);
          } else {
            showToast('非图片文件请用 📎 按钮选择，浏览器拖入拿不到本地路径', 'warning');
          }
        });
      });
    }
  }

  // 侧边栏标签
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.sidebar-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = $('panel-' + btn.getAttribute('data-tab'));
      if (panel) panel.classList.add('active');
    };
  });

  // 打开文件夹
  var openFolderBtn = $('openFolderBtn');
  if (openFolderBtn) {
    openFolderBtn.onclick = async function() {
      var dir = await window.api.invoke('select-folder');
      if (dir) { state.workDir = dir; $('currentDir').textContent = dir; loadFileTree(); }
    };
  }

  // 新建文件
  var newFileBtn = $('newFileBtn');
  if (newFileBtn) {
    newFileBtn.onclick = function() {
      if (!state.workDir) { alert('请先选择工作目录'); return; }
      var name = prompt('新建文件名称:', '');
      if (!name) return;
      var fullPath = state.workDir + '\\' + name;
      window.api.invoke('tool-write', fullPath, '').then(function(r) {
        if (r.success) loadFileTree();
        else alert('创建失败: ' + r.error);
      });
    };
  }

  // 新建文件夹
  var newFolderBtn = $('newFolderBtn');
  if (newFolderBtn) {
    newFolderBtn.onclick = function() {
      if (!state.workDir) { alert('请先选择工作目录'); return; }
      var name = prompt('新建文件夹名称:', '');
      if (!name) return;
      var fullPath = state.workDir + '\\' + name;
      window.api.invoke('tool-bash', 'mkdir "' + fullPath + '"').then(function(r) {
        if (r.success) loadFileTree();
        else alert('创建失败: ' + r.output);
      });
    };
  }

  // 全部折叠
  var collapseAllBtn = $('collapseAllBtn');
  if (collapseAllBtn) {
    collapseAllBtn.onclick = function() {
      // 将所有目录加入折叠集合，然后重绘
      var allDirs = [];
      function collectDirs(node, prefix) {
        var keys = Object.keys(node).sort();
        keys.forEach(function(key) {
          if (node[key] !== null) {
            var dirPath = prefix + key;
            allDirs.push(dirPath);
            collectDirs(node[key], dirPath + '/');
          }
        });
      }
      // 重建 root 以收集所有目录路径
      var result = window.api.invoke('get-file-tree', state.workDir).then(function(resp) {
        if (!resp.success || !resp.files) return;
        var root = {};
        resp.files.forEach(function(f) {
          var rel = f.path.replace(state.workDir, '').replace(/\\/g, '/').replace(/^\//, '');
          var parts = rel.split('/');
          var current = root;
          parts.forEach(function(part, i) {
            if (!current[part]) current[part] = (i === parts.length - 1 && f.type === 'file') ? null : {};
            if (current[part] !== null) current = current[part];
          });
        });
        fileTreeCollapsed = new Set();
        collectDirs(root, '');
        allDirs.forEach(function(d) { fileTreeCollapsed.add(d); });
        loadFileTree();
      });
    };
  }

  // 设置
  var settingsBtn = $('settingsBtn');
  if (settingsBtn) settingsBtn.onclick = function() { openSettings(); };
  var settingsModal = $('settingsModal');
  var closeSettings = $('closeSettings');
  if (closeSettings) closeSettings.onclick = function() { settingsModal.style.display = 'none'; $('messageInput').focus(); };
  // 点击遮罩关闭设置
  if (settingsModal) settingsModal.onclick = function(e) { if (e.target === settingsModal) { settingsModal.style.display = 'none'; $('messageInput').focus(); } };

  // 记忆
  var memoryBtn = $('memoryBtn');
  if (memoryBtn) memoryBtn.onclick = function() { openMemory(); };
  var closeMemory = $('closeMemory');
  if (closeMemory) closeMemory.onclick = function() { $('memoryModal').style.display = 'none'; $('messageInput').focus(); };
  var saveMemory = $('saveMemory');
  if (saveMemory) saveMemory.onclick = function() { saveMemoryContent(); };
  var addMemoryBtn = $('addMemoryBtn');
  if (addMemoryBtn) addMemoryBtn.onclick = function() { addMemory(); };
  var memoryInput = $('memoryInput');
  if (memoryInput) {
    memoryInput.onkeydown = function(e) {
      if (e.key === 'Enter') { e.preventDefault(); addMemory(); }
    };
  }
  var clearMemoryBtn = $('clearMemoryBtn');
  if (clearMemoryBtn) clearMemoryBtn.onclick = function() { clearAllMemory(); };

  // Skills
  var addSkillBtn = $('addSkillBtn');
  if (addSkillBtn) addSkillBtn.onclick = function() { openSkillModal(); };
  var closeSkill = $('closeSkill');
  if (closeSkill) closeSkill.onclick = function() { $('skillModal').style.display = 'none'; $('messageInput').focus(); };
  var cancelSkillBtn = $('cancelSkillBtn');
  if (cancelSkillBtn) cancelSkillBtn.onclick = function() { $('skillModal').style.display = 'none'; $('messageInput').focus(); };
  var saveSkillBtn = $('saveSkillBtn');
  if (saveSkillBtn) saveSkillBtn.onclick = function() { saveSkill(); };
  var skillFileBtn = $('skillFileBtn');
  if (skillFileBtn) skillFileBtn.onclick = function() { selectSkillFile(); };

  // MCP
  var mcpBtn = $('mcpBtn');
  if (mcpBtn) mcpBtn.onclick = function() { openMcpModal(); };
  var closeMcp = $('closeMcp');
  if (closeMcp) closeMcp.onclick = function() { $('mcpModal').style.display = 'none'; $('messageInput').focus(); };
  var addMcpBtn = $('addMcpBtn');
  if (addMcpBtn) addMcpBtn.onclick = function() { addMcpServer(); };
  var testMcpBtn = $('testMcpBtn');
  if (testMcpBtn) testMcpBtn.onclick = function() { testMcpServer(); };

  // 文件编辑器
  var editorSave = $('editorSave');
  if (editorSave) editorSave.onclick = function() { saveCurrentFile(); };
  var editorClose = $('editorClose');
  if (editorClose) editorClose.onclick = function() { closeFile(state.activeFileIndex); };

  // 编辑器代码区域事件
  var editorCode = $('editorCode');
  if (editorCode) {
    editorCode.oninput = function() {
      saveEditorContent();
      updateLineNumbers();
    };
    editorCode.onscroll = function() {
      var lineNums = $('editorLineNumbers');
      if (lineNums) lineNums.scrollTop = this.scrollTop;
    };
    editorCode.onkeydown = function(e) {
      // Tab 缩进
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
        saveEditorContent();
        updateLineNumbers();
      }
    };
  }

  // 全局 Ctrl+S 保存
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.activeFileIndex >= 0) saveCurrentFile();
    }
    // Escape 停止生成
    if (e.key === 'Escape' && state.isGenerating) {
      e.preventDefault();
      stopGeneration();
      showToast('已停止生成');
    }
  });

  // ========== 拖拽分隔条 ==========
  setupResizers();
  setupTaskPanel();
  setupScrollToBottom();

  // 右键菜单
  setupContextMenu();

  // ========== 拖拽上传 ==========
  var chatArea = $('chatArea');
  if (chatArea) {
    chatArea.ondragover = function(e) {
      e.preventDefault();
      if (!document.querySelector('.drag-overlay')) {
        var ov = document.createElement('div');
        ov.className = 'drag-overlay';
        ov.textContent = '拖放文件到此处';
        chatArea.style.position = 'relative';
        chatArea.appendChild(ov);
      }
    };
    chatArea.ondragleave = function(e) {
      var ov = chatArea.querySelector('.drag-overlay');
      if (ov && !chatArea.contains(e.relatedTarget)) ov.remove();
    };
    chatArea.ondrop = function(e) {
      e.preventDefault();
      var ov = chatArea.querySelector('.drag-overlay');
      if (ov) ov.remove();
      var files = e.dataTransfer.files;
      if (files.length > 0) {
        var file = files[0];
        var reader = new FileReader();
        reader.onload = function() {
          var data = reader.result.split(',')[1];
          var type = file.type || 'application/octet-stream';
          attachImage({ data: data, mediaType: type });
        };
        reader.readAsDataURL(file);
      }
    };
  }

  // ========== 编辑器按钮 ==========
  var editorFindBtn = $('editorFindBtn');
  if (editorFindBtn) editorFindBtn.onclick = function() { toggleFindBar(); };
  var findClose = $('findClose');
  if (findClose) findClose.onclick = function() { $('findBar').style.display = 'none'; };
  var findNext = $('findNext');
  if (findNext) findNext.onclick = function() { findInEditor(1); };
  var findPrev = $('findPrev');
  if (findPrev) findPrev.onclick = function() { findInEditor(-1); };
  var replaceOneBtn = $('replaceOneBtn');
  if (replaceOneBtn) replaceOneBtn.onclick = function() { replaceInEditor(false); };
  var replaceAllBtn = $('replaceAllBtn');
  if (replaceAllBtn) replaceAllBtn.onclick = function() { replaceInEditor(true); };

  var findInput = $('findInput');
  if (findInput) {
    findInput.oninput = function() { findInEditor(0); };
    findInput.onkeydown = function(e) {
      if (e.key === 'Enter') { e.preventDefault(); findInEditor(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { $('findBar').style.display = 'none'; }
    };
  }

  // ========== Markdown 预览 / 代码视图切换 ==========
  var codeViewBtn = $('editorCodeView');
  var previewBtn = $('editorPreview');
  if (codeViewBtn) codeViewBtn.onclick = function() { switchEditorView('code'); };
  if (previewBtn) previewBtn.onclick = function() { switchEditorView('preview'); };

  // ========== 导出 ==========
  var exportBtn = $('exportBtn');
  if (exportBtn) exportBtn.onclick = function() { exportConversation(); };

  // ========== 托盘事件 ==========
  window.api.on('tray-new-conversation', function() {
    createNewConversation();
  });
  window.api.on('tray-open-settings', function() {
    openSettings();
  });

  // ========== Ctrl+P 快速打开 ==========
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
      // 如果在编辑器输入框内则不拦截
      if (document.activeElement && document.activeElement.id === 'editorCode') return;
      e.preventDefault();
      openQuickOpen();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      exportConversation();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && state.activeFileIndex >= 0) {
      // 编辑器内 Ctrl+F
      if (document.activeElement && document.activeElement.id === 'editorCode') {
        e.preventDefault();
        toggleFindBar();
      }
    }
    // 终端开关 Ctrl+`
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      toggleTerminal();
    }
  });

  // 设置标签
  document.querySelectorAll('.stab').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.stab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderSettingsTab(btn.getAttribute('data-stab'));
    };
  });

  // 权限
  var permDeny = $('permDeny');
  if (permDeny) permDeny.onclick = function() { respondPermission(false); };
  var permAllow = $('permAllow');
  if (permAllow) permAllow.onclick = function() { respondPermission(true); };
  var permAlways = $('permAlways');
  if (permAlways) permAlways.onclick = function() { respondPermission('always'); };

  // 模型选择
  var modelSelect = $('modelSelect');
  if (modelSelect) {
    modelSelect.onchange = function() {
      state.config.defaultModel = this.value;
      window.api.invoke('set-config', 'defaultModel', this.value);
    };
  }

  // 流式响应（旧版兼容）
  window.api.on('stream-chunk', function(chunk) {
    var conv = state.currentConversation;
    if (conv) {
      var lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content += chunk;
        renderMessages();
        // 流式时持续滚到底部
        var chatArea = $('chatArea');
        if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
      }
    }
  });

  // ========== Agent Loop IPC 事件 ==========

  // 消息区域统一事件委托（替代之前所有 inline onclick）
  var messagesContainer = $('messages');
  if (messagesContainer) {
    messagesContainer.addEventListener('click', function(e) {
      var target = e.target;
      // 工具卡片折叠展开
      var header = target.closest && target.closest('.tool-call-header');
      if (header && header.parentElement) {
        header.parentElement.classList.toggle('expanded');
        return;
      }
      // 代码块复制按钮
      var copyBtn = target.closest && target.closest('[data-action="copy-code"]');
      if (copyBtn) {
        copyCodeBlock(copyBtn);
        return;
      }
    });
  }

  // 流式文本 — 直接追加到最后一个消息的 DOM，避免全量重绘
  window.api.on('agent-stream-text', function(data) {
    var isGenConv = state.generatingConversationId && state.generatingConversationId === state.currentConversation.id;

    // 子 Agent 文本 → 路由到父工具卡片内的 subagent 容器
    if (data.subAgentId) {
      // 更新数据模型（始终找到 generating 对话）
      var genConv = state.conversations.find(function(c) { return c.id === state.generatingConversationId; });
      if (genConv) {
        var genLastMsg = genConv.messages[genConv.messages.length - 1];
        if (genLastMsg && genLastMsg.toolCalls) {
          var parentTc = genLastMsg.toolCalls.find(function(t) { return t.id === data.subAgentId; });
          if (parentTc) {
            if (!parentTc.subAgentEvents) parentTc.subAgentEvents = [];
            parentTc.subAgentEvents.push({ type: 'text', text: data.text });
          }
        }
      }
      // 非 generating 对话跳过 DOM 更新
      if (!isGenConv) return;

      var messagesEl = $('messages');
      if (!messagesEl) return;
      var parentCard = messagesEl.querySelector('.tool-call[data-tc-id="' + esc(data.subAgentId) + '"]');
      if (!parentCard) return;
      var body = parentCard.querySelector('.tool-call-body');
      if (!body) return;
      var container = body.querySelector('.tool-call-subagent');
      if (!container) {
        container = document.createElement('div');
        container.className = 'tool-call-subagent';
        body.appendChild(container);
      }
      container.appendChild(document.createTextNode(data.text));

      var chatArea = $('chatArea');
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
      return;
    }

    // 更新 generating 对话的数据模型
    var genConv = state.conversations.find(function(c) { return c.id === state.generatingConversationId; });
    if (!genConv) return;
    var genLastMsg = genConv.messages[genConv.messages.length - 1];
    if (!genLastMsg || genLastMsg.role !== 'assistant') {
      // 当前查看的对话不是 generating 对话时，genConv 不一定在页面显示，但数据仍要更新
      return;
    }
    genLastMsg.content += data.text;

    setThinking(true, '写入回复...');

    // 非 generating 对话跳过 DOM 更新和滚动
    if (!isGenConv) return;

    // 找到最后一个 assistant 消息的 .msg-content 元素，直接追加文本
    var messagesEl = $('messages');
    if (!messagesEl) return;
    var msgContents = messagesEl.querySelectorAll('.message.assistant .msg-content');
    if (msgContents.length > 0) {
      var contentEl = msgContents[msgContents.length - 1];
      // 流式期间走纯文本模式（保留换行），结束后 agent-complete 会触发 renderMessages 重排为富文本
      contentEl.classList.add('streaming');
      contentEl.appendChild(document.createTextNode(data.text));
    }

    var chatArea = $('chatArea');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  });

  // 上下文压缩 loading 动画
  window.api.on('agent-compressing', function(data) {
    var messagesEl = $('messages');
    if (!messagesEl) return;
    var existing = messagesEl.querySelector('.compression-indicator');
    if (data.compressing) {
      if (existing) return;
      var indicator = document.createElement('div');
      indicator.className = 'compression-indicator';
      indicator.innerHTML = '<span class="compression-dot"></span><span class="compression-dot"></span><span class="compression-dot"></span><span class="compression-label">正在压缩对话历史...</span>';
      messagesEl.appendChild(indicator);
      var chatArea = $('chatArea');
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    } else {
      if (existing) existing.remove();
    }
  });

  // 文件系统变更 → 刷新文件树，并自动重载已打开的文件
  window.api.on('file-tree-changed', function(data) {
    refreshFileTree();
    if (data && data.filePath) reloadChangedFile(data.filePath);
  });

  // 工具调用开始 — 增量插入 DOM，不全量重绘（修复授权弹窗卡顿的核心）
  window.api.on('agent-stream-tool-start', function(data) {
    var isGenConv = state.generatingConversationId && state.generatingConversationId === state.currentConversation.id;

    // 子 Agent 工具调用 → 嵌套到父工具卡片的 subagent 容器内
    if (data.subAgentId) {
      // 更新 generating 对话的数据模型
      var genConv = state.conversations.find(function(c) { return c.id === state.generatingConversationId; });
      if (genConv) {
        var genLastMsg = genConv.messages[genConv.messages.length - 1];
        if (genLastMsg && genLastMsg.toolCalls) {
          var parentTc = genLastMsg.toolCalls.find(function(t) { return t.id === data.subAgentId; });
          if (parentTc) {
            if (!parentTc.subAgentEvents) parentTc.subAgentEvents = [];
            parentTc.subAgentEvents.push({ type: 'tool_start', id: data.id, name: data.name, input: JSON.stringify(data.input, null, 2), status: 'running' });
          }
        }
      }
      // 非 generating 对话跳过 DOM 更新
      if (!isGenConv) return;

      var messagesEl = $('messages');
      if (!messagesEl) return;
      var parentCard = messagesEl.querySelector('.tool-call[data-tc-id="' + esc(data.subAgentId) + '"]');
      if (!parentCard) return;
      var body = parentCard.querySelector('.tool-call-body');
      if (!body) return;
      var container = body.querySelector('.tool-call-subagent');
      if (!container) {
        container = document.createElement('div');
        container.className = 'tool-call-subagent';
        body.appendChild(container);
      }
      var tcObj = {
        id: data.id,
        name: data.name,
        input: JSON.stringify(data.input, null, 2),
        result: '',
        status: 'running'
      };
      var wrapper = document.createElement('div');
      wrapper.innerHTML = renderToolCallHTML(tcObj);
      container.appendChild(wrapper.firstChild);
      return;
    }

    // 更新 generating 对话的数据模型
    var genConv = state.conversations.find(function(c) { return c.id === state.generatingConversationId; });
    if (!genConv) return;
    var genLastMsg = genConv.messages[genConv.messages.length - 1];
    if (!genLastMsg || genLastMsg.role !== 'assistant') return;
    if (!genLastMsg.toolCalls) genLastMsg.toolCalls = [];
    var tc = {
      id: data.id,
      name: data.name,
      input: JSON.stringify(data.input, null, 2),
      result: '',
      status: 'running'
    };
    genLastMsg.toolCalls.push(tc);

    // 非 generating 对话跳过 DOM 更新
    if (!isGenConv) return;

    setThinking(true, '调用工具: ' + data.name);
    // 增量插入失败时（DOM 已被其他原因清空），才回退到全量重绘
    if (!appendToolCallIncremental(tc)) renderMessages();
  });

  // AskUserQuestion — 在工具卡片内渲染选择题界面
  window.api.on('agent-question', function(data) {
    var messagesEl = $('messages');
    if (!messagesEl) return;
    // 找最后一个 running 状态的 AskUserQuestion 工具卡片
    var toolCalls = messagesEl.querySelectorAll('.tool-call[data-tc-id]');
    var target = null;
    for (var i = toolCalls.length - 1; i >= 0; i--) {
      var tc = toolCalls[i];
      var nameEl = tc.querySelector('.tool-call-name');
      if (nameEl && nameEl.textContent === 'AskUserQuestion' && tc.classList.contains('running')) {
        target = tc; break;
      }
    }
    if (!target) return;

    // 自动展开折叠的工具栏，让用户看到选项
    var group = target.closest('.tool-calls-group');
    if (group) {
      var calls = group.querySelector('.tool-calls');
      if (calls && calls.style.display === 'none') {
        calls.style.display = 'block';
        var toggle = group.querySelector('.tool-calls-bar-toggle');
        if (toggle) toggle.textContent = '▼';
      }
    }
    // 隐藏 AskUserQuestion 的原始输入/结果，只显示选项
    var inputEl = target.querySelector('.tool-call-input');
    var resultEl = target.querySelector('.tool-call-result');
    if (inputEl) inputEl.style.display = 'none';
    if (resultEl) resultEl.style.display = 'none';

    var body = target.querySelector('.tool-call-body');
    if (!body) return;

    // 移除已有的 question UI（重复触发时重建）
    var existing = body.querySelector('.tool-call-question');
    if (existing) existing.remove();

    var qDiv = document.createElement('div');
    qDiv.className = 'tool-call-question';

    // 题面
    var qText = document.createElement('div');
    qText.className = 'question-text';
    qText.textContent = data.question || '';
    qDiv.appendChild(qText);

    // 选项容器
    var optsDiv = document.createElement('div');
    optsDiv.className = 'question-options';

    var makeChoice = function(label) {
      return function() {
        optsDiv.querySelectorAll('.q-option').forEach(function(b) { b.classList.remove('selected'); });
        // CSS 属性选择器中双引号需要反斜杠转义
        var safeLabel = label.replace(/"/g, '\\"');
        var match = optsDiv.querySelectorAll('.q-option[data-label="' + safeLabel + '"]');
        for (var k = 0; k < match.length; k++) match[k].classList.add('selected');
        optsDiv.querySelectorAll('.q-option').forEach(function(b) { b.disabled = true; });
        var otherInput = optsDiv.querySelector('.q-other-input');
        if (otherInput) otherInput.disabled = true;
        window.api.send('agent-question-response', data.requestId, label);
      };
    };

    if (data.options && data.options.length > 0) {
      data.options.forEach(function(opt) {
        var btn = document.createElement('button');
        btn.className = 'q-option';
        btn.setAttribute('data-label', opt.label);
        if (opt.description) {
          btn.innerHTML = '<span class="q-opt-label">' + esc(opt.label) + '</span><span class="q-opt-desc">' + esc(opt.description) + '</span>';
        } else {
          btn.textContent = opt.label;
        }
        btn.onclick = makeChoice(opt.label);
        optsDiv.appendChild(btn);
      });
    }

    // "Other..." 自由输入
    var otherDiv = document.createElement('div');
    otherDiv.className = 'q-other';
    var otherInput = document.createElement('input');
    otherInput.type = 'text';
    otherInput.className = 'q-other-input';
    otherInput.placeholder = 'Other... 自定义输入';
    var otherBtn = document.createElement('button');
    otherBtn.className = 'q-option q-other-submit';
    otherBtn.textContent = '提交';
    otherBtn.disabled = true;
    otherInput.oninput = function() {
      otherBtn.disabled = !otherInput.value.trim();
    };
    otherInput.onkeydown = function(e) {
      if (e.key === 'Enter' && otherInput.value.trim()) {
        otherBtn.click();
      }
    };
    otherBtn.onclick = function() {
      var val = otherInput.value.trim();
      if (!val) return;
      optsDiv.querySelectorAll('.q-option').forEach(function(b) { b.disabled = true; });
      otherInput.disabled = true;
      otherBtn.disabled = true;
      var allBtns = optsDiv.querySelectorAll('.q-option');
      for (var j = 0; j < allBtns.length; j++) {
        allBtns[j].classList.remove('selected');
      }
      window.api.send('agent-question-response', data.requestId, val);
    };
    otherDiv.appendChild(otherInput);
    otherDiv.appendChild(otherBtn);
    optsDiv.appendChild(otherDiv);

    qDiv.appendChild(optsDiv);
    body.appendChild(qDiv);
  });

  // 工具调用结果 — 增量更新对应工具卡片
  window.api.on('agent-stream-tool-result', function(data) {
    var isGenConv = state.generatingConversationId && state.generatingConversationId === state.currentConversation.id;

    // 子 Agent 工具结果 → 更新嵌套卡片 + 累积数据模型
    if (data.subAgentId) {
      // 更新 generating 对话的数据模型
      var genConv = state.conversations.find(function(c) { return c.id === state.generatingConversationId; });
      if (genConv) {
        var genLastMsg = genConv.messages[genConv.messages.length - 1];
        if (genLastMsg && genLastMsg.toolCalls) {
          var parentTc = genLastMsg.toolCalls.find(function(t) { return t.id === data.subAgentId; });
          if (parentTc && parentTc.subAgentEvents) {
            for (var k = parentTc.subAgentEvents.length - 1; k >= 0; k--) {
              var ev = parentTc.subAgentEvents[k];
              if (ev.type === 'tool_start' && ev.id === data.id) {
                ev.status = data.error ? 'error' : 'done';
                ev.result = data.result;
                break;
              }
            }
          }
        }
      }
      // 非 generating 对话跳过 DOM 更新
      if (!isGenConv) return;

      var tcObj = { result: data.result, status: data.error ? 'error' : 'done' };
      updateToolCallIncremental(data.id, tcObj);
      return;
    }

    // 更新 generating 对话的数据模型
    var genConv = state.conversations.find(function(c) { return c.id === state.generatingConversationId; });
    if (!genConv) return;
    var genLastMsg = genConv.messages[genConv.messages.length - 1];
    if (!genLastMsg || genLastMsg.role !== 'assistant' || !genLastMsg.toolCalls) return;
    var tc = genLastMsg.toolCalls.find(function(t) { return t.id === data.id; });
    if (!tc) return;
    tc.result = data.result;
    tc.status = data.error ? 'error' : 'done';

    // 非 generating 对话跳过 DOM 更新
    if (!isGenConv) return;

    if (!updateToolCallIncremental(data.id, tc)) renderMessages();
  });

  // Agent 循环完成
  window.api.on('agent-complete', function(data) {
    log('Agent loop 完成: ' + JSON.stringify(data.success));
    state.isGenerating = false;
    state.generatingConversationId = null;
    state.currentLoopId = null;
    setThinking(false);
    clearStreamingMarks();
    flushConversations();
    var sendBtn = $('sendBtn'), stopBtn = $('stopBtn');
    if (sendBtn) sendBtn.style.display = 'flex';
    if (stopBtn) stopBtn.style.display = 'none';

    if (!data.success && data.error) {
      var conv = state.currentConversation;
      if (conv) {
        var lastMsg = conv.messages[conv.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.isError = true;
          lastMsg.errorMsg = data.error;
          if (!lastMsg.content) lastMsg.content = 'API 调用失败: ' + data.error;
        }
      }
      showToast('请求失败，可点消息下方"重试"重发', 'error');
    }

    // 捕获 token 使用数据
    if (data.success && data.usage && state.currentConversation) {
      var conv = state.currentConversation;
      var lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.inputTokens = data.usage.input_tokens || 0;
        lastMsg.outputTokens = data.usage.output_tokens || 0;
      }
      // 遍历消息重新计算对话总 token（具备自愈能力）
      conv.totalInputTokens = 0;
      conv.totalOutputTokens = 0;
      conv.messages.forEach(function(m) {
        conv.totalInputTokens += m.inputTokens || 0;
        conv.totalOutputTokens += m.outputTokens || 0;
      });
    }


    saveConversations();
    renderMessages();
    renderConversations();
    refreshFileTree();

    // 兜底：agent loop 跑完后静默重拉一次 skills 列表
    // skills-changed IPC 万一漏发（ctx.window 没传、监听器没注册到等），靠这里捞回来
    (async function refreshSkillsSilently() {
      try {
        var r = await window.api.invoke('get-skills');
        if (!r || !r.skills) return;
        var oldNames = state.skills.map(function(s) { return s.name; });
        var newNames = r.skills.map(function(s) { return s.name; });
        var added = r.skills.filter(function(s) { return oldNames.indexOf(s.name) < 0; });
        var removed = oldNames.filter(function(n) { return newNames.indexOf(n) < 0; });
        if (added.length === 0 && removed.length === 0) return;
        state.skills = r.skills;
        renderSkills();
        if (added.length > 0) {
          showToast('已安装 Skill: ' + added.map(function(s){return s.name;}).join(', '), 'success', 5000);
        }
      } catch (_) {}
    })();
  });

  // 自动记忆提取完成
  window.api.on('auto-memories-extracted', function(data) {
    if (data.memories) {
      state.memories = data.memories;
    }
    if (data.newMemories && data.newMemories.length > 0) {
      showToast('自动记忆: 已保存 ' + data.newMemories.length + ' 条新记忆');
    }
  });

  // MCP 连接状态更新
  window.api.on('mcp-status', function(statuses) {
    var prev = state.mcpStatuses || [];
    state.mcpStatuses = statuses;
    // 检测新出现的失败连接 → toast 提示
    if (Array.isArray(statuses)) {
      statuses.forEach(function(s) {
        var prevState = prev.find(function(p) { return p.name === s.name; });
        // 仅在状态从"非 error"变成"error/disconnected"时提示，避免初始化时刷屏
        if (prevState && prevState.connected && !s.connected) {
          showToast('MCP "' + s.name + '" 断开连接' + (s.error ? ': ' + s.error : ''), 'error');
        } else if (prevState && !prevState.connected && s.connected) {
          showToast('MCP "' + s.name + '" 已连接 (' + (s.toolCount || 0) + ' 个工具)', 'success');
        }
      });
    }
    // 如果 MCP 管理弹窗打开着，刷新列表
    var modal = $('mcpModal');
    if (modal && modal.style.display === 'flex') {
      renderMcpList();
    }
  });

  // Plan UI：任务变化通知（Claude 调 TaskCreate/TaskUpdate 时主进程推送）
  window.api.on('tasks-changed', function(tasks) {
    state.tasks = Array.isArray(tasks) ? tasks : [];
    renderTaskPanel();
  });

  // Skill 安装通知（Claude 调 InstallSkill 时主进程推送）
  window.api.on('skills-changed', async function() {
    console.log('[renderer] skills-changed IPC 收到');
    try {
      var r = await window.api.invoke('get-skills');
      if (r && r.skills) {
        var oldNames = state.skills.map(function(s) { return s.name; });
        state.skills = r.skills;
        renderSkills();
        console.log('[renderer] skills 已刷新, 共', state.skills.length, '条');
        // 列出新增的 skill 提示用户
        var newOnes = state.skills.filter(function(s) { return oldNames.indexOf(s.name) < 0; });
        if (newOnes.length > 0) {
          showToast('已安装 Skill: ' + newOnes.map(function(s){return s.name;}).join(', '), 'success', 5000);
        } else {
          showToast('Skill 列表已刷新', 'info');
        }
      }
    } catch (err) {
      logError('Skill 列表刷新失败: ' + err.message);
    }
  });

  // 权限请求
  window.api.on('agent-permission-request', function(data) {
    log('权限请求: ' + data.toolName);
    showPermissionModal(data);
  });

  // ========== 终端输出 ==========
  window.api.on('terminal-output', function(data) {
    if (data.terminalId === state.terminalId && state.terminal) {
      state.terminal.write(data.data);
    }
  });

  // 终端按钮
  var terminalToggleBtn = $('terminalToggleBtn');
  if (terminalToggleBtn) {
    terminalToggleBtn.onclick = function() {
      // 关闭并重新新建终端
      if (state.terminalId) {
        window.api.invoke('terminal-kill', { terminalId: state.terminalId }).catch(function() {});
      }
      state.terminal = null;
      state.terminalFit = null;
      state.terminalId = null;
      var container = $('terminalContainer');
      if (container) container.innerHTML = '';
      initTerminal();
    };
  }
  var terminalCloseBtn = $('terminalCloseBtn');
  if (terminalCloseBtn) {
    terminalCloseBtn.onclick = function() {
      var panel = document.getElementById('terminalPanel');
      var resizer = document.getElementById('terminalResizer');
      if (panel) panel.style.display = 'none';
      if (resizer) resizer.style.display = 'none';
      state.terminalActive = false;
      updateTerminalBtnState();
    };
  }
  // 输入区终端按钮
  var terminalPanelBtn = $('terminalPanelBtn');
  if (terminalPanelBtn) {
    terminalPanelBtn.onclick = function(e) {
      toggleTerminal();
    };
  }

  // ========== 终端面板拖拽 ==========
  var terminalResizer = $('terminalResizer');
  if (terminalResizer) {
    terminalResizer.onmousedown = function(e) {
      e.preventDefault();
      this.classList.add('active');
      var panel = $('terminalPanel');
      if (!panel) return;
      var startY = e.clientY;
      var startHeight = panel.offsetHeight;
      var chatPane = document.querySelector('.chat-pane');

      function onMove(ev) {
        if (!chatPane) return;
        var delta = startY - ev.clientY;
        var newH = Math.max(100, Math.min(chatPane.offsetHeight * 0.5, startHeight + delta));
        panel.style.height = newH + 'px';
        if (state.terminalFit) state.terminalFit.fit();
      }
      function onUp() {
        terminalResizer.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (state.terminalFit) state.terminalFit.fit();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  // 窗口 resize 时 fit 终端
  window.addEventListener('resize', function() {
    if (state.terminal && state.terminalFit) {
      setTimeout(function() { if (state.terminalFit) state.terminalFit.fit(); }, 100);
    }
  });

  // ========== 点击弹窗外部关闭 ==========
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  });
}

// 对话管理
function createNewConversation() {
  var conv = { id: Date.now().toString(), title: '新对话', messages: [], createdAt: new Date().toISOString() };
  state.conversations.unshift(conv);
  state.currentConversation = conv;
  saveConversations();
  renderConversations();
  renderMessages();
}

function selectConversation(id) {
  for (var i = 0; i < state.conversations.length; i++) {
    if (state.conversations[i].id === id) { state.currentConversation = state.conversations[i]; break; }
  }
  // 切换对话时清空任务面板（任务是按对话维度的运行时状态，不应跨对话保留）
  window.api.invoke('clear-tasks').catch(function() {});
  // 切换对话时根据是否当前对话在生成来更新发送/停止按钮
  var isGen = state.isGenerating && state.generatingConversationId === state.currentConversation.id;
  var sendBtn = $('sendBtn'), stopBtn = $('stopBtn');
  if (sendBtn) sendBtn.style.display = isGen ? 'none' : 'flex';
  if (stopBtn) stopBtn.style.display = isGen ? 'flex' : 'none';
  setThinking(isGen);
  renderConversations();
  renderMessages();
}

function deleteConversation(id, e) {
  if (e) e.stopPropagation();
  // 收集被删对话中的图片路径
  var conv = state.conversations.find(function(c) { return c.id === id; });
  var imagePaths = [];
  if (conv && conv.messages) {
    conv.messages.forEach(function(msg) {
      if (msg.attachments) {
        msg.attachments.forEach(function(att) {
          if (att.kind === 'image' && att.path) imagePaths.push(att.path);
        });
      }
    });
  }
  state.conversations = state.conversations.filter(function(c) { return c.id !== id; });
  if (state.currentConversation && state.currentConversation.id === id) state.currentConversation = state.conversations[0] || null;
  saveConversations();
  renderConversations();
  renderMessages();
  // 删除未被其他对话引用的粘贴图片
  if (imagePaths.length > 0) {
    var remainingPaths = new Set();
    state.conversations.forEach(function(c) {
      if (c.messages) {
        c.messages.forEach(function(msg) {
          if (msg.attachments) {
            msg.attachments.forEach(function(att) {
              if (att.kind === 'image' && att.path) remainingPaths.add(att.path);
            });
          }
        });
      }
    });
    var toDelete = imagePaths.filter(function(p) { return !remainingPaths.has(p); });
    if (toDelete.length > 0) {
      window.api.invoke('delete-pasted-images', toDelete).catch(function() {});
    }
  }
}

// 对话保存：防抖 + 异步写文件（避免每次按键都触发磁盘 IO）
var _saveConversationsTimer = null;
function saveConversations() {
  if (_saveConversationsTimer) clearTimeout(_saveConversationsTimer);
  _saveConversationsTimer = setTimeout(function() {
    _saveConversationsTimer = null;
    window.api.invoke('save-conversations', state.conversations).catch(function(e) {
      logError('对话保存失败: ' + e.message);
    });
  }, 300);
}

// 立即落盘（绕过防抖，用在 agent-complete 等关键点，避免长 agent 跑完后 300ms 内崩溃丢数据）
function flushConversations() {
  if (_saveConversationsTimer) { clearTimeout(_saveConversationsTimer); _saveConversationsTimer = null; }
  window.api.invoke('save-conversations', state.conversations).catch(function(e) {
    logError('对话保存失败: ' + e.message);
  });
}

// 窗口失焦时立即 flush，减少 agent-complete 前切换应用时崩溃丢数据
window.addEventListener('blur', function() {
  flushConversations();
});

// 关闭窗口前立刻 flush 未写入的对话（防止 300ms 防抖窗口内的数据丢失）
window.addEventListener('beforeunload', function() {
  if (_saveConversationsTimer) {
    clearTimeout(_saveConversationsTimer);
    _saveConversationsTimer = null;
    try { window.api.invoke('save-conversations', state.conversations); } catch (e) {}
  }
});

function renderConversations() {
  var list = $('conversationList');
  if (!list) return;
  // 按 pinned 优先 + 时间倒序排
  var sorted = state.conversations.slice().sort(function(a, b) {
    if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var c = sorted[i];
    var isActive = state.currentConversation && state.currentConversation.id === c.id;
    html += '<div class="conversation-item' + (isActive ? ' active' : '') + (c.pinned ? ' pinned' : '') + (state.generatingConversationId === c.id ? ' generating' : '') + '" data-id="' + c.id + '" title="右键查看更多操作">' +
      (c.pinned ? '<span class="pin-icon">📌</span>' : '') +
      '<span class="title">' + esc(c.title) + '</span>' +
      (state.generatingConversationId === c.id ? '<span class="generating-dots"><span></span><span></span><span></span></span>' : '') +
      '<button class="del" data-del="' + c.id + '" title="删除">✕</button></div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('.conversation-item').forEach(function(item) {
    item.onclick = function(e) {
      if (e.target.classList.contains('del')) return;
      selectConversation(this.getAttribute('data-id'));
    };
    // 右键菜单：重命名 / 置顶 / 删除
    item.oncontextmenu = function(e) {
      e.preventDefault();
      showConversationContextMenu(this.getAttribute('data-id'), e.clientX, e.clientY);
    };
  });
  list.querySelectorAll('.del').forEach(function(btn) {
    btn.onclick = function(e) { deleteConversation(this.getAttribute('data-del'), e); };
  });
}

// 会话右键上下文菜单：重命名 / 置顶 / 删除
function showConversationContextMenu(convId, x, y) {
  var conv = state.conversations.find(function(c) { return c.id === convId; });
  if (!conv) return;
  // 清掉旧的
  var existing = document.querySelector('.conv-ctx-menu');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.className = 'context-menu conv-ctx-menu';
  menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;display:block';
  menu.innerHTML =
    '<div class="ctx-item" data-act="rename">重命名</div>' +
    '<div class="ctx-item" data-act="pin">' + (conv.pinned ? '取消置顶' : '置顶到顶部') + '</div>' +
    '<div class="ctx-separator"></div>' +
    '<div class="ctx-item ctx-danger" data-act="delete">删除</div>';
  document.body.appendChild(menu);

  function closeMenu() {
    menu.remove();
    document.removeEventListener('click', onDocClick);
  }
  function onDocClick(e) { if (!menu.contains(e.target)) closeMenu(); }
  setTimeout(function() { document.addEventListener('click', onDocClick); }, 0);

  menu.querySelectorAll('.ctx-item').forEach(function(it) {
    it.onclick = function() {
      var act = this.getAttribute('data-act');
      closeMenu();
      if (act === 'rename') {
        var newTitle = prompt('重命名会话:', conv.title);
        if (newTitle && newTitle.trim()) {
          conv.title = newTitle.trim();
          conv.updatedAt = Date.now();
          saveConversations();
          renderConversations();
          showToast('已重命名', 'success');
        }
      } else if (act === 'pin') {
        conv.pinned = !conv.pinned;
        conv.updatedAt = Date.now();
        saveConversations();
        renderConversations();
        showToast(conv.pinned ? '已置顶' : '已取消置顶', 'success');
      } else if (act === 'delete') {
        deleteConversation(conv.id);
      }
    };
  });
}

// 渲染单个工具调用的 HTML（既用于全量渲染，也用于增量插入）
function renderToolCallHTML(tc) {
  var statusClass = tc.status === 'running' ? 'running' : (tc.status === 'error' ? 'error' : 'done');
  var statusIcon = tc.status === 'running' ? '<div class="spinner"></div>' : (tc.status === 'error' ? '❌' : '✅');
  // 默认展开：进行中 / 错误；成功完成的默认折叠，避免长结果挤占聊天主体
  var shouldExpand = tc.status === 'running' || tc.status === 'error';
  // Agent 工具且有子 Agent 事件时默认展开
  if (tc.name === 'Agent' && tc.subAgentEvents && tc.subAgentEvents.length > 0) shouldExpand = true;
  // Write/Edit 完成后默认展开，让用户看到文件变更
  if ((tc.name === 'Write' || tc.name === 'Edit') && tc.status === 'done') shouldExpand = true;
  var resultPreview = '';
  if (tc.result && tc.status !== 'error') {
    var raw = String(tc.result).replace(/\s+/g, ' ').trim();
    if (raw.length > 0) resultPreview = ' · ' + raw.slice(0, 40) + (raw.length > 40 ? '…' : '');
  }
  // 子 Agent 事件渲染
  var subHTML = '';
  if (tc.name === 'Agent' && tc.subAgentEvents && tc.subAgentEvents.length > 0) {
    subHTML = '<div class="tool-call-subagent">';
    for (var k = 0; k < tc.subAgentEvents.length; k++) {
      var ev = tc.subAgentEvents[k];
      if (ev.type === 'text') {
        subHTML += '<div class="subagent-text">' + esc(ev.text) + '</div>';
      } else if (ev.type === 'tool_start') {
        var evIcon = ev.status === 'error' ? '❌' : (ev.status === 'done' ? '✅' : '<div class="spinner"></div>');
        subHTML += '<div class="tool-call ' + (ev.status === 'done' ? 'done' : 'running') + '" data-tc-id="' + esc(ev.id) + '">' +
          '<div class="tool-call-header">' +
            '<span class="tool-call-icon">' + evIcon + '</span>' +
            '<span class="tool-call-name">' + esc(ev.name) + '</span>' +
          '</div>' +
          '<div class="tool-call-body">' +
            '<div class="tool-call-input"><div class="tool-label">输入</div><pre>' + esc(ev.input) + '</pre></div>' +
            (ev.result ? '<div class="tool-call-result"><div class="tool-label">结果</div><div class="tool-result-content">' + formatToolResult(ev.result) + '</div></div>' : '') +
          '</div>' +
        '</div>';
      }
    }
    subHTML += '</div>';
  }
  return '<div class="tool-call ' + statusClass + (shouldExpand ? ' expanded' : '') + '" data-tc-id="' + esc(tc.id || '') + '">' +
    '<div class="tool-call-header">' +
      '<span class="tool-call-icon">' + statusIcon + '</span>' +
      '<span class="tool-call-name">' + esc(tc.name) + '</span>' +
      '<span class="tool-call-preview">' + esc(resultPreview) + '</span>' +
      '<span class="tool-call-toggle">▼</span>' +
    '</div>' +
    '<div class="tool-call-body">' +
      '<div class="tool-call-input"><div class="tool-label">输入</div><pre>' + esc(tc.input) + '</pre></div>' +
      subHTML +
      (tc.result ? '<div class="tool-call-result"><div class="tool-label">结果</div><div class="tool-result-content">' + formatToolResult(tc.result) + '</div></div>' : '') +
    '</div>' +
  '</div>';
}

// 增量：把新工具调用挂到最后一个 assistant 消息上（无需整页重绘）
function appendToolCallIncremental(tc) {
  var messagesEl = $('messages');
  if (!messagesEl) return false;
  var assistants = messagesEl.querySelectorAll('.message.assistant');
  if (assistants.length === 0) return false;
  var lastMsg = assistants[assistants.length - 1];
  // 查找或创建 tool-calls-group 包装器
  var group = lastMsg.querySelector('.tool-calls-group');
  if (!group) {
    group = document.createElement('div');
    group.className = 'tool-calls-group';
    group.innerHTML = '<div class="tool-calls-bar">' +
      '<span class="tool-calls-bar-label">🛠 1 个工具调用</span>' +
      '<span class="tool-calls-bar-toggle">▶</span>' +
    '</div>' +
    '<div class="tool-calls" style="display:none"></div>';
    var bar = group.querySelector('.tool-calls-bar');
    bar.onclick = function() { toggleToolCalls(this); };
    var actions = lastMsg.querySelector('.msg-actions');
    if (actions) lastMsg.insertBefore(group, actions);
    else lastMsg.appendChild(group);
  }
  var container = group.querySelector('.tool-calls');
  // 更新计数
  var label = group.querySelector('.tool-calls-bar-label');
  if (label) {
    var count = container ? container.children.length + 1 : 1;
    label.textContent = '🛠 ' + count + ' 个工具调用';
  }
  var wrapper = document.createElement('div');
  wrapper.innerHTML = renderToolCallHTML(tc);
  container.appendChild(wrapper.firstChild);
  // Write/Edit 工具自动展开工具栏组，让用户看到文件变更
  if (tc.name === 'Write' || tc.name === 'Edit') {
    if (calls && calls.style.display === 'none') {
      calls.style.display = 'block';
      var toggle = group.querySelector('.tool-calls-bar-toggle');
      if (toggle) toggle.textContent = '▼';
    }
  }
  return true;
}

// 增量：根据 id 更新工具调用的结果和状态
function updateToolCallIncremental(id, tc) {
  var messagesEl = $('messages');
  if (!messagesEl) return false;
  var el = messagesEl.querySelector('.tool-call[data-tc-id="' + (id || '').replace(/"/g, '\\"') + '"]');
  if (!el) return false;
  // 状态 class
  el.classList.remove('running', 'done', 'error');
  el.classList.add(tc.status === 'error' ? 'error' : 'done');
  // 完成（done）后自动折叠，让聊天主体不被长结果挤占；error 状态保持展开方便排查
  if (tc.status === 'error') el.classList.add('expanded');
  else el.classList.remove('expanded');
  // 图标
  var icon = el.querySelector('.tool-call-icon');
  if (icon) icon.innerHTML = tc.status === 'error' ? '❌' : '✅';
  // 结果摘要预览（折叠态显示在头部）
  var previewEl = el.querySelector('.tool-call-preview');
  if (previewEl) {
    if (tc.result && tc.status !== 'error') {
      var raw = String(tc.result).replace(/\s+/g, ' ').trim();
      previewEl.textContent = raw ? ' · ' + raw.slice(0, 40) + (raw.length > 40 ? '…' : '') : '';
    } else {
      previewEl.textContent = '';
    }
  }
  // 结果
  if (tc.result) {
    var body = el.querySelector('.tool-call-body');
    var existing = body && body.querySelector('.tool-call-result');
    var resultHTML = '<div class="tool-label">结果</div><div class="tool-result-content">' + formatToolResult(tc.result) + '</div>';
    if (existing) {
      existing.innerHTML = resultHTML;
    } else if (body) {
      var resultEl = document.createElement('div');
      resultEl.className = 'tool-call-result';
      resultEl.innerHTML = resultHTML;
      body.appendChild(resultEl);
    }
  }
  return true;
}

// 更新欢迎页动态内容（最近项目）
function updateWelcomeScreen() {
  var recentSection = $('welcomeRecent');
  var recentEl = $('recentProjects');
  if (!recentSection || !recentEl) return;

  var items = [];
  // 从最近项目中取
  if (state.config && Array.isArray(state.config.recentProjects)) {
    state.config.recentProjects.forEach(function(p) {
      if (typeof p === 'string') items.push({ title: p, id: null });
      else if (p && p.path) items.push({ title: p.path, id: null });
    });
  }
  // 从对话历史前 3 条补
  if (state.conversations) {
    state.conversations.slice(0, 3).forEach(function(c) {
      if (!c.messages || c.messages.length === 0) return;
      var firstMsg = c.messages[0];
      var title = firstMsg && firstMsg.content
        ? firstMsg.content.replace(/<[^>]+>/g, '').substring(0, 48)
        : '新对话';
      items.push({ title: title, id: c.id });
    });
  }

  if (items.length === 0) { recentSection.style.display = 'none'; return; }

  recentSection.style.display = '';
  recentEl.innerHTML = items.map(function(item) {
    return '<div class="recent-project-item"' + (item.id ? ' data-conv-id="' + item.id + '"' : '') + '><span class="rp-icon">💬</span><span class="rp-title">' + esc(item.title) + '</span></div>';
  }).join('');

  recentEl.querySelectorAll('.recent-project-item[data-conv-id]').forEach(function(el) {
    el.onclick = function() {
      var id = this.getAttribute('data-conv-id');
      var conv = state.conversations.find(function(c) { return c.id === id; });
      if (conv) { state.currentConversation = conv; renderConversations(); renderMessages(); scrollToBottom(); }
    };
  });
}

// ========== 集成终端 ==========

function initTerminal() {
  try {
    if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
      showToast('终端库加载失败', 'error');
      return;
    }
    var FA = FitAddon.FitAddon || FitAddon;
    var fitAddon = new FA();
    var term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      theme: {
        background: '#1f1a15',
        foreground: '#e8e0d6',
        cursor: '#d97757',
        selectionBackground: '#d9775740',
        black: '#1f1a15', red: '#e06c75', green: '#98c379', yellow: '#d19a66',
        blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#e8e0d6',
        brightBlack: '#5c5855', brightRed: '#e06c75', brightGreen: '#98c379',
        brightYellow: '#d19a66', brightBlue: '#61afef', brightMagenta: '#c678dd',
        brightCyan: '#56b6c2', brightWhite: '#f5f1eb'
      }
    });
    term.loadAddon(fitAddon);
    var container = document.getElementById('terminalContainer');
    term.open(container);
    fitAddon.fit();

    // 终端复制粘贴
    term.attachCustomKeyEventHandler(function(e) {
      if (e.type === 'keydown' && e.ctrlKey) {
        // Ctrl+C: 有选中内容时复制，否则放行到终端（SIGINT）
        if (e.code === 'KeyC' && !e.shiftKey) {
          var sel = term.getSelection();
          if (sel) {
            window.api.clipboard.writeText(sel);
            return false;
          }
          return true;
        }
        // Ctrl+Shift+C: 强制复制
        if (e.code === 'KeyC' && e.shiftKey) {
          var sel = term.getSelection();
          if (sel) window.api.clipboard.writeText(sel);
          return false;
        }
        // Ctrl+V / Ctrl+Shift+V: 粘贴
        if (e.code === 'KeyV') {
          try {
            var text = window.api.clipboard.readText();
            if (text && state.terminalId) {
              window.api.invoke('terminal-write', { terminalId: state.terminalId, data: text });
            }
          } catch (_) {}
          return false;
        }
      }
      return true;
    });

    // 终端内右键: 有选中内容时复制，否则粘贴
    container.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      var sel = term.getSelection();
      if (sel) {
        window.api.clipboard.writeText(sel);
        term.clearSelection();
      } else {
        try {
          var text = window.api.clipboard.readText();
          if (text && state.terminalId) {
            window.api.invoke('terminal-write', { terminalId: state.terminalId, data: text });
          }
        } catch (_) {}
      }
    });

    term.onData(function(data) {
      if (state.terminalId) {
        window.api.invoke('terminal-write', { terminalId: state.terminalId, data: data });
      }
    });

    window.api.invoke('terminal-spawn', {
      cols: term.cols,
      rows: term.rows,
      cwd: state.workDir || undefined
    }).then(function(result) {
      state.terminal = term;
      state.terminalFit = fitAddon;
      state.terminalId = result.terminalId;
    }).catch(function(err) {
      logError('终端 spawn 失败: ' + err.message);
      showToast('终端启动失败: ' + err.message, 'error');
    });
  } catch (err) {
    logError('终端初始化失败: ' + err.message);
    showToast('终端初始化失败: ' + err.message, 'error');
  }
}

function toggleTerminal() {
  var panel = document.getElementById('terminalPanel');
  var resizer = document.getElementById('terminalResizer');
  if (!panel || !resizer) return;
  var isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'flex' : 'none';
  resizer.style.display = isHidden ? 'block' : 'none';
  state.terminalActive = isHidden;
  if (isHidden) {
    if (!state.terminal) {
      initTerminal();
    } else {
      setTimeout(function() {
        if (state.terminalFit) state.terminalFit.fit();
      }, 50);
    }
  }
  updateTerminalBtnState();
}

function updateTerminalBtnState() {
  var btn = document.getElementById('terminalPanelBtn');
  if (btn) {
    if (state.terminalActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
}

// 消息渲染
function renderMessages() {
  var messagesEl = $('messages');
  var welcomeEl = $('welcomeScreen');
  if (!messagesEl || !welcomeEl) return;

  if (!state.currentConversation || state.currentConversation.messages.length === 0) {
    // 编辑器分屏时 chat-pane 只有 ~460px，欢迎页 4 列特性卡塞不下会挤成乱码，直接隐藏
    var mc = document.querySelector('.main-content');
    var isSplit = mc && mc.classList.contains('editor-open');
    welcomeEl.style.display = isSplit ? 'none' : 'flex';
    if (!isSplit) updateWelcomeScreen();
    // 分屏空对话时给一个轻量占位，避免聊天面板看起来像挂了
    messagesEl.innerHTML = isSplit
      ? '<div class="empty-chat-hint">开始与 cc-wrap 对话\n（Enter 发送，Ctrl+V 粘贴图片）</div>'
      : '';
    return;
  }
  welcomeEl.style.display = 'none';
  var html = '';
  for (var i = 0; i < state.currentConversation.messages.length; i++) {
    var msg = state.currentConversation.messages[i];
    var isUser = msg.role === 'user';
    var time = new Date(msg.timestamp).toLocaleTimeString('zh-CN');
    var content = formatContent(msg.content);
    // 附件渲染：图片直接显示，其他文件以小卡片显示。兼容老的 msg.image
    var atts = (msg.attachments && msg.attachments.length > 0) ? msg.attachments
      : (msg.image ? [Object.assign({ kind: 'image', name: 'image' }, msg.image)] : []);
    var imageHTML = '';
    if (atts.length > 0) {
      imageHTML = '<div class="msg-attachments">';
      atts.forEach(function(a) {
        if (a.kind === 'image' && a.data) {
          imageHTML += '<img class="msg-image" src="data:' + a.mediaType + ';base64,' + a.data + '" />';
        } else {
          var icon = a.kind === 'pdf' ? '📕' : (a.kind === 'text' ? '📄' : '📎');
          imageHTML += '<div class="msg-file-chip" title="' + esc(a.path || a.name) + '"><span class="att-icon">' + icon + '</span><span class="att-name">' + esc(a.name) + '</span></div>';
        }
      });
      imageHTML += '</div>';
    }
    var toolHTML = '';
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      var innerTools = '';
      for (var j = 0; j < msg.toolCalls.length; j++) {
        innerTools += renderToolCallHTML(msg.toolCalls[j]);
      }
      toolHTML = '<div class="tool-calls-group">' +
        '<div class="tool-calls-bar">' +
          '<span class="tool-calls-bar-label">🛠 ' + msg.toolCalls.length + ' 个工具调用</span>' +
          '<span class="tool-calls-bar-toggle">▶</span>' +
        '</div>' +
        '<div class="tool-calls" style="display:none">' + innerTools + '</div>' +
      '</div>';
    }
    html += '<div class="message ' + msg.role + (msg.isError ? ' message-error' : '') + '">' +
      '<div class="msg-header"><div class="msg-avatar">' + (isUser ? '你' : 'C') + '</div><span class="msg-role">' + (isUser ? '你' : 'Claude') + '</span><span class="msg-time">' + time + '</span>' +
      (msg.isError ? '<span class="msg-error-badge">⚠ 失败</span>' : '') + '</div>' +
      '<div class="msg-content">' + content + '</div>' + toolHTML + imageHTML +
      '<div class="msg-actions">' +
      (msg.isError ? '<button class="msg-action retry-btn" data-idx="' + i + '">↻ 重试</button>' : '') +
      '<button class="msg-action copy-btn" data-idx="' + i + '">复制</button>' +
      (!isUser && !msg.isError ? '<button class="msg-action regen-btn" data-idx="' + i + '">重新生成</button>' : '') + '</div>' +
      (!isUser && (msg.inputTokens !== undefined || msg.outputTokens !== undefined)
        ? '<div class="msg-tokens">↑' + (msg.inputTokens ?? 0) + ' · ↓' + (msg.outputTokens ?? 0) + '</div>'
        : '') + '</div>';
  }
  messagesEl.innerHTML = html;
  messagesEl.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.onclick = function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      navigator.clipboard.writeText(state.currentConversation.messages[idx].content);
      this.textContent = '已复制'; var self = this; setTimeout(function() { self.textContent = '复制'; }, 2000);
    };
  });
  messagesEl.querySelectorAll('.regen-btn').forEach(function(btn) {
    btn.onclick = function() {
      if (state.isGenerating && state.generatingConversationId === state.currentConversation.id) return;
      var idx = parseInt(this.getAttribute('data-idx'));
      state.currentConversation.messages.splice(idx);
      saveConversations(); renderMessages(); generateResponse();
    };
  });
  messagesEl.querySelectorAll('.retry-btn').forEach(function(btn) {
    btn.onclick = function() {
      if (state.isGenerating && state.generatingConversationId === state.currentConversation.id) return;
      var idx = parseInt(this.getAttribute('data-idx'));
      // 删除失败的 assistant 消息后重新生成
      state.currentConversation.messages.splice(idx);
      saveConversations(); renderMessages(); generateResponse();
    };
  });
  messagesEl.querySelectorAll('.tool-calls-bar').forEach(function(bar) {
    bar.onclick = function() { toggleToolCalls(this); };
  });
  // 延迟滚动，等 DOM 渲染完成
  requestAnimationFrame(function() {
    var chatArea = $('chatArea');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  });
}

// 工具调用组折叠切换
function toggleToolCalls(el) {
  var group = el.closest('.tool-calls-group');
  if (!group) return;
  var calls = group.querySelector('.tool-calls');
  var toggle = group.querySelector('.tool-calls-bar-toggle');
  if (!calls) return;
  var isHidden = calls.style.display === 'none';
  calls.style.display = isHidden ? 'block' : 'none';
  if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
}

// 轻量级 Toast 通知
// showToast(msg) / showToast(msg, 'success'|'error'|'warning'|'info', duration)
function showToast(msg, type, duration) {
  type = type || 'info';
  // 时长：错误更长，方便阅读
  if (duration == null) duration = type === 'error' ? 6000 : (type === 'warning' ? 5000 : 3500);
  var toast = document.createElement('div');
  toast.className = 'toast-notification toast-' + type;
  var iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ⓘ' };
  toast.innerHTML = '<span class="toast-icon">' + (iconMap[type] || '') + '</span><span class="toast-msg"></span>';
  toast.querySelector('.toast-msg').textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.classList.add('show'); }, 10);
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 300);
  }, duration);
}

function formatContent(content) {
  if (!content) return '';

  // 先过滤 <think> 标签
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  // 去掉首尾大段空行（模型常在开头打很多换行）
  content = content.replace(/^\s+|\s+$/g, '');
  if (!content) return '';

  // 1) 抽出 fenced 代码块占位，避免里面被 markdown
  var codeBlocks = [];
  content = content.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
    var idx = codeBlocks.length;
    codeBlocks.push({ lang: lang, code: code });
    return '\x00CODEBLOCK_' + idx + '\x00';
  });

  // 2) HTML 转义
  content = esc(content);

  // 3) 行式状态机：标题 / 引用 / 列表 / 水平线 / 表格 / 段落
  var lines = content.split('\n');
  var out = [];
  var i = 0;
  function flushParaBuf(buf) {
    if (buf.length === 0) return;
    var text = buf.join('<br>');
    out.push('<p>' + text + '</p>');
    buf.length = 0;
  }
  var paraBuf = [];

  while (i < lines.length) {
    var line = lines[i];
    var trimmed = line.replace(/\s+$/, '');

    // 空行 → 关闭当前段落
    if (trimmed === '') { flushParaBuf(paraBuf); i++; continue; }

    // 占位代码块（独占一行）
    if (/^\x00CODEBLOCK_\d+\x00$/.test(trimmed)) {
      flushParaBuf(paraBuf); out.push(trimmed); i++; continue;
    }

    // 水平线
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed)) {
      flushParaBuf(paraBuf); out.push('<hr>'); i++; continue;
    }

    // 标题 # ##  ### ####
    var hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushParaBuf(paraBuf);
      var level = hMatch[1].length;
      out.push('<h' + level + '>' + hMatch[2] + '</h' + level + '>');
      i++; continue;
    }

    // 引用块（连续 > 开头的行）
    if (/^&gt;\s?/.test(trimmed)) {
      flushParaBuf(paraBuf);
      var quoteLines = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^&gt;\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + quoteLines.join('<br>') + '</blockquote>');
      continue;
    }

    // 表格：当前行是 | 开头 + 下一行是分隔行 |---|---|
    if (/^\|.+\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      flushParaBuf(paraBuf);
      var headerCells = trimmed.replace(/^\||\|$/g, '').split('|').map(function(c) { return c.trim(); });
      i += 2; // 跳过分隔行
      var bodyRows = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        var rowCells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function(c) { return c.trim(); });
        bodyRows.push(rowCells);
        i++;
      }
      var tableHTML = '<table><thead><tr>';
      headerCells.forEach(function(c) { tableHTML += '<th>' + c + '</th>'; });
      tableHTML += '</tr></thead><tbody>';
      bodyRows.forEach(function(row) {
        tableHTML += '<tr>';
        row.forEach(function(c) { tableHTML += '<td>' + c + '</td>'; });
        tableHTML += '</tr>';
      });
      tableHTML += '</tbody></table>';
      out.push(tableHTML);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParaBuf(paraBuf);
      var olItems = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        olItems.push('<li>' + lines[i].trim().replace(/^\d+\.\s+/, '') + '</li>');
        i++;
      }
      out.push('<ol>' + olItems.join('') + '</ol>');
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParaBuf(paraBuf);
      var ulItems = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        ulItems.push('<li>' + lines[i].trim().replace(/^[-*+]\s+/, '') + '</li>');
        i++;
      }
      out.push('<ul>' + ulItems.join('') + '</ul>');
      continue;
    }

    // 普通段落行
    paraBuf.push(trimmed);
    i++;
  }
  flushParaBuf(paraBuf);

  content = out.join('\n');

  // 4) 还原代码块并高亮（带复制按钮）
  content = content.replace(/\x00CODEBLOCK_(\d+)\x00/g, function(match, idx) {
    var block = codeBlocks[parseInt(idx)];
    var highlighted = highlightCode(block.code, block.lang);
    var langLabel = block.lang || 'code';
    var escapedCode = block.code.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return '<div class="code-block-wrapper">' +
      '<div class="code-block-header"><span class="code-lang">' + langLabel + '</span>' +
      '<button class="code-copy-btn" data-action="copy-code" data-code="' + escapedCode + '">复制</button></div>' +
      '<pre><code>' + highlighted + '</code></pre></div>';
  });

  // 5) 行内：行内代码 / 粗体 / 斜体 / 链接（在转义后的文本上，避免破坏标签）
  content = content.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  content = content.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  content = content.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
    var safeUrl = url.replace(/^(javascript|data|vbscript):/i, '#');
    return '<a href="' + safeUrl + '" target="_blank" rel="noopener">' + text + '</a>';
  });

  return content;
}

// 工具结果格式化：HTML 转义 + 段落换行 + 链接识别
function formatToolResult(text) {
  if (!text) return '';
  text = esc(text);
  // 识别链接
  text = text.replace(/(https?:\/\/[^\s<"]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // 段落换行（双换行分段，单换行断行）
  var parts = text.split(/\n\n+/);
  return parts.map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
}
function copyCodeBlock(btn) {
  var code = btn.getAttribute('data-code');
  // 还原 HTML 实体
  code = code.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  function onSuccess() {
    btn.textContent = '已复制';
    setTimeout(function() { btn.textContent = '复制'; }, 2000);
  }
  // Clipboard via preload bridge
  try {
    if (window.api && window.api.clipboard) { window.api.clipboard.writeText(code); onSuccess(); return; }
  } catch(e) {}
  // Fallback: textarea 选中复制
  var ta = document.createElement('textarea');
  ta.value = code;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  onSuccess();
}

// 语法高亮：优先 highlight.js（preload 暴露），退化到内置规则
function highlightCode(code, lang) {
  // 优先使用 highlight.js（覆盖 190+ 语言）
  if (window.api && window.api.highlight && window.api.highlight.available) {
    var hl = window.api.highlight.highlight(code, lang || '');
    if (hl) return hl;
  }
  if (!lang) return code;
  lang = lang.toLowerCase();

  var rules = [];
  if (['js','ts','jsx','tsx','json'].indexOf(lang) >= 0) {
    rules = [
      { pattern: /(\/\/.*$)/gm, cls: 'hl-comment' },
      { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'hl-comment' },
      { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, cls: 'hl-string' },
      { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|throw|typeof|instanceof|in|of|null|undefined|true|false)\b/g, cls: 'hl-keyword' },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: 'hl-number' },
      { pattern: /\b([a-zA-Z_]\w*)\s*\(/g, cls: 'hl-function' }
    ];
  } else if (['html','htm','xml','vue','svelte'].indexOf(lang) >= 0) {
    rules = [
      { pattern: /(&lt;!--[\s\S]*?--&gt;)/g, cls: 'hl-comment' },
      { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, cls: 'hl-string' },
      { pattern: /(&lt;\/?)([\w-]+)/g, cls: 'hl-tag', replace: '$1<span class="hl-tag">$2</span>' },
      { pattern: /\b([\w-]+)(?==)/g, cls: 'hl-attr' }
    ];
  } else if (lang === 'css' || lang === 'scss') {
    rules = [
      { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'hl-comment' },
      { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, cls: 'hl-string' },
      { pattern: /(#[0-9a-fA-F]{3,8})\b/g, cls: 'hl-number' },
      { pattern: /\b(\d+\.?\d*(px|em|rem|%|vh|vw|s|ms)?)\b/g, cls: 'hl-number' },
      { pattern: /([.#][\w-]+)/g, cls: 'hl-function' }
    ];
  } else if (lang === 'python' || lang === 'py') {
    rules = [
      { pattern: /(#.*$)/gm, cls: 'hl-comment' },
      { pattern: /("""[\s\S]*?"""|'''[\s\S]*?'''|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, cls: 'hl-string' },
      { pattern: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|True|False|None|and|or|not|in|is|self|print)\b/g, cls: 'hl-keyword' },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: 'hl-number' }
    ];
  } else if (lang === 'sh' || lang === 'bash' || lang === 'shell') {
    rules = [
      { pattern: /(#.*$)/gm, cls: 'hl-comment' },
      { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, cls: 'hl-string' },
      { pattern: /\b(if|then|else|elif|fi|for|do|done|while|until|case|esac|function|return|exit|echo|cd|ls|mkdir|rm|cp|mv|cat|grep|sed|awk|chmod|chown|sudo|apt|npm|yarn|pip)\b/g, cls: 'hl-keyword' }
    ];
  } else if (lang === 'sql') {
    rules = [
      { pattern: /(--.*$)/gm, cls: 'hl-comment' },
      { pattern: /('(?:[^'\\]|\\.)*')/g, cls: 'hl-string' },
      { pattern: /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|ON|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|HAVING|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|UNION|ALL)\b/gi, cls: 'hl-keyword' }
    ];
  } else {
    return code;
  }

  // 简单的顺序替换高亮（非嵌套，避免冲突）
  var result = code;
  for (var i = rules.length - 1; i >= 0; i--) {
    var r = rules[i];
    if (r.replace) {
      result = result.replace(r.pattern, r.replace);
    } else {
      result = result.replace(r.pattern, '<span class="' + r.cls + '">$1</span>');
    }
  }
  return result;
}

// 发送消息
async function sendMessage() {
  var input = $('messageInput');
  if (!input) return;

  var content = input.value.trim();
  if (!content && (!state.attachedFiles || state.attachedFiles.length === 0)) return;
  if (state.isGenerating && state.generatingConversationId === state.currentConversation.id) return;

  // 等附件全部落盘拿到本地路径再发送——否则 message.attachments[i].path 还是空，
  // 模型只看到 base64 图、没路径，就会用 dir/copy/test -f 去瞎找。
  var pendings = (state.attachedFiles || [])
    .map(function(a) { return a && a._savePending; })
    .filter(Boolean);
  if (pendings.length > 0) {
    setThinking(true, '附件保存中…');
    try { await Promise.all(pendings); } catch(_) {}
    setThinking(false);
  }

  if (!state.currentConversation) createNewConversation();

  // 斜杠命令
  if (content.startsWith('/')) {
    handleSlashCommand(content);
    input.value = '';
    return;
  }

  // 检测 URL，后台尝试 MCP 配置（不阻塞发送）
  var urlMatch = content.match(/^(https?:\/\/[^\s]+)$/);
  if (urlMatch) {
    tryMcpFromUrl(urlMatch[1]);
  }

  var userMsg = {
    role: 'user',
    content: content,
    image: (state.attachedFiles && state.attachedFiles.length > 0 && state.attachedFiles[0].kind === 'image') ? state.attachedFiles[0] : null,
    attachments: (state.attachedFiles || []).slice(),
    timestamp: new Date().toISOString()
  };
  state.currentConversation.messages.push(userMsg);
  log('[send] 提交附件数 ' + (userMsg.attachments ? userMsg.attachments.length : 0) +
      '，其中图片 ' + (userMsg.attachments ? userMsg.attachments.filter(function(a){return a.kind==='image';}).length : 0));
  if (state.currentConversation.messages.length === 1) state.currentConversation.title = content.substring(0, 30) || '附件对话';
  saveConversations(); renderConversations(); renderMessages();
  input.value = ''; input.style.height = 'auto';
  state.attachedImage = null;
  state.attachedFiles = [];
  renderAttachmentPreview();

  await generateResponse();
}

// AI 生成（使用 Agent Loop）
async function generateResponse() {
  state.isGenerating = true;
  state.generatingConversationId = state.currentConversation.id;
  setThinking(true, '思考中...');
  var sendBtn = $('sendBtn');
  var stopBtn = $('stopBtn');
  if (sendBtn) sendBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'flex';
  else logError('stopBtn not found in DOM');
  var assistantMsg = { role: 'assistant', content: '', toolCalls: [], timestamp: new Date().toISOString() };
  state.currentConversation.messages.push(assistantMsg);
  renderMessages();

  // 构建 Anthropic 格式消息
  var apiMessages = buildApiMessages();

  // 获取模型配置
  var selectedModelId = state.config.defaultModel;
  var modelConfig = null;
  for (var j = 0; j < state.models.length; j++) {
    if (state.models[j].id === selectedModelId) {
      modelConfig = state.models[j];
      break;
    }
  }

  // 生成唯一的 loop ID
  var loopId = 'loop_' + Date.now();
  state.currentLoopId = loopId;

  var apiOptions = {
    loopId: loopId,
    messages: apiMessages,
    workDir: state.workDir,
    maxTokens: state.config.maxTokens,
    temperature: state.config.temperature
  };

  if (modelConfig) {
    if (modelConfig.endpoint) apiOptions.endpoint = modelConfig.endpoint;
    if (modelConfig.apiKey) apiOptions.apiKey = modelConfig.apiKey;
    if (modelConfig.maxTokens) apiOptions.maxTokens = modelConfig.maxTokens;
    if (modelConfig.temperature != null) apiOptions.temperature = modelConfig.temperature;
    if (modelConfig.reasoningEffort && modelConfig.reasoningEffort !== 'off') apiOptions.reasoningEffort = modelConfig.reasoningEffort;
    apiOptions.model = modelConfig.id;
  }

  try {
        log('[send] apiOptions: model="' + apiOptions.model + '" temp="' + apiOptions.temperature + '" effort="' + (apiOptions.reasoningEffort || 'off') + '" endpoint="' + (apiOptions.endpoint || 'default') + '"');
// 启动 agent loop（异步，通过 IPC 事件接收结果）
    window.api.invoke('agent-start', apiOptions).then(function(result) {
      log('Agent loop 返回: ' + JSON.stringify(result.success));
    }).catch(function(err) {
      logError('Agent loop 失败: ' + err.message);
      state.isGenerating = false;
      state.generatingConversationId = null;
      setThinking(false);
      clearStreamingMarks();
      var sendBtn = $('sendBtn'), stopBtn = $('stopBtn');
      if (sendBtn) sendBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
    });
  } catch (err) {
    assistantMsg.content = '错误: ' + err.message;
    state.isGenerating = false;
    state.generatingConversationId = null;
    setThinking(false);
    clearStreamingMarks();
    var sendBtn = $('sendBtn'), stopBtn = $('stopBtn');
    if (sendBtn) sendBtn.style.display = 'flex';
    if (stopBtn) stopBtn.style.display = 'none';
    saveConversations();
    renderMessages();
  }
}

// 停止生成
function stopGeneration() {
  if (state.currentLoopId) {
    window.api.invoke('agent-cancel', state.currentLoopId);
    state.currentLoopId = null;
  }
  state.isGenerating = false;
  state.generatingConversationId = null;
  setThinking(false);
  var sendBtn = $('sendBtn'), stopBtn = $('stopBtn');
  if (sendBtn) sendBtn.style.display = 'flex';
  if (stopBtn) stopBtn.style.display = 'none';
}

// 构建 Anthropic 格式消息
function buildApiMessages() {
  var messages = [];
  for (var i = 0; i < state.currentConversation.messages.length; i++) {
    var m = state.currentConversation.messages[i];
    if (m.role === 'user') {
      var content = [];
      // 兼容老消息：m.image 升级为单元素 attachments
      var attachments = m.attachments && m.attachments.length > 0 ? m.attachments
        : (m.image ? [Object.assign({ kind: 'image', name: 'image' }, m.image)] : []);

      // 1) 图片附件 → 单独的 image content block
      for (var ai = 0; ai < attachments.length; ai++) {
        var att = attachments[ai];
        if (att.kind === 'image' && att.data) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mediaType, data: att.data }
          });
        }
      }

      // 2) 文本部分：用户输入 + 文本附件内联 + 其他附件的路径 hint
      var textParts = [];
      if (m.content) textParts.push(m.content);

      var imagePaths = [];
      var textBlocks = [];
      var otherHints = [];
      for (var aj = 0; aj < attachments.length; aj++) {
        var a = attachments[aj];
        if (a.kind === 'image' && a.path) imagePaths.push({ name: a.name, path: a.path });
        else if (a.kind === 'text' && a.text != null) textBlocks.push({ name: a.name, path: a.path, text: a.text });
        else if (a.kind === 'pdf' && a.path) otherHints.push({ name: a.name, path: a.path, kind: 'PDF' });
        else if (a.path) otherHints.push({ name: a.name, path: a.path, kind: '文件' });
      }

      if (imagePaths.length > 0) {
        textParts.push(
          '【已附 ' + imagePaths.length + ' 张图片，本地路径如下（这些路径由本地宿主进程刚刚写入磁盘，100% 存在且可信，请直接使用，禁止用 dir/test -f/ls/copy 等 shell 命令验证或复制它们）：\n' +
          imagePaths.map(function(x, i) { return (i + 1) + '. ' + x.name + ': ' + x.path; }).join('\n') + '\n' +
          '识图请把这些路径**逐个**作为 image_source 传给视觉类 MCP 工具（例如调用 ' + imagePaths.length + ' 次 understand_image，每次传入一个路径）。】'
        );
      }
      for (var ti = 0; ti < textBlocks.length; ti++) {
        var tb = textBlocks[ti];
        textParts.push('【附件文本: ' + tb.name + (tb.path ? '  (' + tb.path + ')' : '') + '】\n```\n' + tb.text + '\n```');
      }
      if (otherHints.length > 0) {
        textParts.push(
          '【已附 ' + otherHints.length + ' 个其他文件，路径如下，如需读取请用 Read 工具或对应的 MCP 工具：\n' +
          otherHints.map(function(x) { return '- [' + x.kind + '] ' + x.name + ': ' + x.path; }).join('\n') + '】'
        );
      }

      if (textParts.length > 0) {
        content.push({ type: 'text', text: textParts.join('\n\n') });
      }
      messages.push({ role: 'user', content: content });
    } else if (m.role === 'assistant') {
      var assistantContent = [];
      if (m.content) {
        assistantContent.push({ type: 'text', text: m.content });
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (var j = 0; j < m.toolCalls.length; j++) {
          var tc = m.toolCalls[j];
          var input = {};
          try { input = JSON.parse(tc.input); } catch (e) { input = { raw: tc.input }; }
          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: input
          });
        }
      }
      if (assistantContent.length > 0) {
        messages.push({ role: 'assistant', content: assistantContent });
      }
      // 关键：把工具结果作为下一条 user 消息回放，否则模型看不到之前工具返回的内容，
      // 多轮对话里就像每轮都"忘了上下文"。Anthropic / OpenAI 协议都要求 tool_use 后紧跟 tool_result。
      if (m.toolCalls && m.toolCalls.length > 0) {
        var toolResults = [];
        for (var k = 0; k < m.toolCalls.length; k++) {
          var tcr = m.toolCalls[k];
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tcr.id,
            content: (tcr.result == null ? '' : String(tcr.result))
          });
        }
        messages.push({ role: 'user', content: toolResults });
      }
    }
  }
  return messages;
}

// 执行工具
async function executeTool(name, input) {
  try {
    switch (name) {
      case 'Read':
        var r = await window.api.invoke('tool-read', input.file_path);
        return r.success ? r.content : '错误: ' + r.error;
      case 'Write':
        var w = await window.api.invoke('tool-write', input.file_path, input.content);
        return w.success ? '文件已写入: ' + input.file_path : '错误: ' + w.error;
      case 'Edit':
        var e = await window.api.invoke('tool-edit', input.file_path, input.old_string, input.new_string);
        return e.success ? '文件已编辑: ' + input.file_path : '错误: ' + e.error;
      case 'Glob':
        var g = await window.api.invoke('tool-glob', input.pattern);
        return g.success ? '找到文件:\n' + g.files.join('\n') : '错误: ' + g.error;
      case 'Grep':
        var gr = await window.api.invoke('tool-grep', input.pattern);
        if (!gr.success) return '错误: ' + gr.error;
        return gr.results.length > 0
          ? gr.results.map(function(r) { return r.file + ':' + r.line + ': ' + r.content; }).join('\n')
          : '未找到匹配内容';
      case 'Bash':
        var b = await window.api.invoke('tool-bash', input.command);
        return b.success ? b.output : '错误: ' + b.output;
      case 'ListDirectory':
        var ld = await window.api.invoke('tool-list-dir', input.path);
        if (!ld.success) return '错误: ' + ld.error;
        return ld.items.map(function(i) { return (i.type === 'directory' ? '📁 ' : '📄 ') + i.name; }).join('\n');
      default:
        return '未知工具: ' + name;
    }
  } catch (err) {
    return '工具执行异常: ' + err.message;
  }
}

function getSystemPrompt() {
  var useTools = $('useTools') && $('useTools').checked;
  var memText = state.memories.length > 0 ? '\n\n项目记忆:\n' + state.memories.map(function(m) { return '- ' + m.content; }).join('\n') : '';
  var skillText = '';
  if (state.currentConversation) {
    var msgs = state.currentConversation.messages;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'user' && msgs[i].content) {
        var match = msgs[i].content.match(/^\/skill\s+(\S+)/);
        if (match) {
          var skill = state.skills.find(function(s) { return s.name === match[1]; });
          if (skill) skillText += '\n\nSkill "' + skill.name + '":\n' + skill.content;
        }
      }
    }
  }

  var prompt = '你是 Claude Code，一个强大的AI编程助手。工作目录: ' + (state.workDir || '未设置') + '\n请用中文回答。';

  if (useTools) {
    prompt += '\n\n## 可用工具\n\n你可以通过以下格式调用工具（每次只调用一个工具）:\n\n```tool\n工具名\n参数名: 参数值\n```\n\n支持的工具:\n\n### Read - 读取文件\n```tool\nRead\nfile_path: /path/to/file\n```\n\n### Write - 写入文件\n```tool\nWrite\nfile_path: /path/to/file\ncontent: 文件内容\n```\n\n### Edit - 编辑文件\n```tool\nEdit\nfile_path: /path/to/file\nold_string: 要替换的文本\nnew_string: 替换后的文本\n```\n\n### Glob - 搜索文件\n```tool\nGlob\npattern: *.js\n```\n\n### Grep - 搜索内容\n```tool\nGrep\npattern: 正则表达式\n```\n\n### Bash - 执行命令\n```tool\nBash\ncommand: ls -la\n```\n\n### ListDirectory - 列出目录\n```tool\nListDirectory\npath: /path/to/dir\n```\n\n重要: 当你需要操作文件或执行命令时，请使用上述工具格式。工具调用会自动执行并返回结果给你。';
  }

  return prompt + memText + skillText;
}

// 权限（Agent Loop 版本）
var currentPermissionData = null;
function showPermissionModal(data) {
  currentPermissionData = data;
  $('permissionDesc').textContent = '允许执行 ' + data.toolName + '？';
  $('permissionInput').innerHTML = '<pre style="background:var(--bg-primary);padding:8px;border-radius:4px;font-size:12px;overflow:auto;max-height:150px">' + JSON.stringify(data.input, null, 2) + '</pre>';
  $('permissionModal').style.display = 'flex';
}
function respondPermission(value) {
  $('permissionModal').style.display = 'none';
  if (currentPermissionData) {
    // 'always' 必须原样透传给主进程，主进程会据此写入持久化白名单；
    // 普通"允许"传 true，"拒绝"传 false
    var permitted = value === 'always' ? 'always' : (value === true);
    window.api.send('agent-permission-response', currentPermissionData.requestId, permitted);
    currentPermissionData = null;
  }
}

// 斜杠命令
function updateAcHighlight(acEl, idx) {
  var items = acEl.querySelectorAll('.cmd-ac-item');
  items.forEach(function(item, i) {
    item.classList.toggle('active', i === idx);
  });
}

function handleSlashCommand(cmd) {
  var parts = cmd.split(' ');
  var command = parts[0].toLowerCase();
  var args = parts.slice(1).join(' ');
  switch (command) {
    case '/help':
      var helpText = '可用命令:\n';
      SLASH_COMMANDS.forEach(function(cmd) {
        helpText += cmd.name + ' - ' + cmd.desc + '\n';
      });
      addAssistantMsg(helpText);
      break;
    case '/clear':
      if (state.currentConversation) {
        state.currentConversation.messages = [];
        state.currentConversation.totalInputTokens = 0;
        state.currentConversation.totalOutputTokens = 0;
      }
      saveConversations(); renderMessages();
      break;
    case '/compact':
      compactConversation();
      break;
    case '/config': openSettings(); break;
    case '/cost':
      if (!state.currentConversation) {
        addAssistantMsg('没有活跃的对话');
        break;
      }
      var c = state.currentConversation;
      var ci = c.totalInputTokens || 0;
      var co = c.totalOutputTokens || 0;
      var lines = ['【当前对话 Token 消耗】'];
      lines.push('输入 ↑' + ci + '  输出 ↓' + co + '  总计 ' + (ci + co));
      // 逐条消息明细
      var hasDetail = false;
      c.messages.forEach(function(m, idx) {
        if (m.inputTokens || m.outputTokens) {
          if (!hasDetail) { lines.push(''); lines.push('消息明细:'); hasDetail = true; }
          var label = m.role === 'user' ? '用户' : 'Claude';
          lines.push('  #' + (idx + 1) + ' ' + label + ':  ↑' + (m.inputTokens || 0) + '  ↓' + (m.outputTokens || 0));
        }
      });
      // 全部对话累计
      var allIn = 0, allOut = 0;
      state.conversations.forEach(function(cv) {
        allIn += cv.totalInputTokens || 0;
        allOut += cv.totalOutputTokens || 0;
      });
      lines.push(''); lines.push('全部对话累计: ↑' + allIn + '  ↓' + allOut + '  总计 ' + (allIn + allOut));
      addAssistantMsg(lines.join('\n'));
      break;
    case '/model':
      if (args) {
        state.config.defaultModel = args;
        window.api.invoke('set-config', 'defaultModel', args);
        var ms = $('modelSelect'); if (ms) ms.value = args;
        addAssistantMsg('已切换: ' + args);
      } else {
        addAssistantMsg('当前: ' + state.config.defaultModel + '\n可用:\n' + state.models.map(function(m) { return '- ' + m.name + ' (' + m.id + ')'; }).join('\n'));
      }
      break;
    case '/memory':
      if (args) {
        state.memories.push({ content: args, source: 'manual', createdAt: Date.now() });
        window.api.invoke('save-memory', { memories: state.memories });
        addAssistantMsg('已记住: ' + args);
      } else {
        openMemory();
      }
      break;
    case '/skill':
      if (args) {
        var skill = state.skills.find(function(s) { return s.name === args; });
        if (skill) {
          addAssistantMsg('已引用 Skill: ' + skill.name + '\n\n' + skill.content);
        } else {
          addAssistantMsg('未找到 Skill: ' + args + '\n可用: ' + state.skills.map(function(s) { return s.name; }).join(', '));
        }
      } else {
        addAssistantMsg('可用 Skills:\n' + (state.skills.length > 0 ? state.skills.map(function(s) { return '- ' + s.name + ': ' + s.desc; }).join('\n') : '暂无 Skill，使用 /mcp 或在侧边栏添加'));
      }
      break;
    case '/mcp': openMcpModal(); break;
    case '/workdir':
      if (args) {
        state.workDir = args;
        window.api.invoke('set-work-dir', args);
        loadFileTree();
        addAssistantMsg('工作目录已设置: ' + args);
      } else {
        addAssistantMsg('当前工作目录: ' + (state.workDir || '未设置'));
      }
      break;
    case '/theme': toggleTheme(); addAssistantMsg('已切换为' + (state.theme === 'dark' ? '深色' : '浅色') + '主题'); break;
    case '/tools':
      addAssistantMsg('可用工具:\n' + state.allowedTools.map(function(t) { return '- ' + t; }).join('\n'));
      break;
    case '/permissions':
      addAssistantMsg('当前权限:\n' + state.allowedTools.map(function(t) { return '- ' + t + ': 允许'; }).join('\n') + '\n\n如需修改，请在设置 > 通用设置中调整');
      break;
    case '/init':
      addAssistantMsg('初始化 CLAUDE.md:\n请在工作目录中创建 CLAUDE.md 文件来存储项目级指令。\n当前工作目录: ' + (state.workDir || '未设置'));
      break;
    case '/export':
      if (state.currentConversation && state.currentConversation.messages.length > 0) {
        var exportText = state.currentConversation.messages.map(function(m) {
          return (m.role === 'user' ? '【用户】' : '【Claude】') + '\n' + m.content;
        }).join('\n\n---\n\n');
        navigator.clipboard.writeText(exportText);
        addAssistantMsg('对话已复制到剪贴板 (' + state.currentConversation.messages.length + ' 条消息)');
      } else {
        addAssistantMsg('当前没有对话内容');
      }
      break;
    default: addAssistantMsg('未知命令: ' + command + '\n输入 /help 查看所有可用命令');
  }
}

// AI 压缩对话
async function compactConversation() {
  if (!state.currentConversation || state.currentConversation.messages.length < 4) {
    addAssistantMsg('消息数量不足（至少需要4条），无需压缩');
    return;
  }

  var msgs = state.currentConversation.messages;
  var msgsToSummarize = msgs.slice(0, -2);
  var recentMsgs = msgs.slice(-2);

  // 构建摘要请求
  var summaryContent = msgsToSummarize.map(function(m) {
    return (m.role === 'user' ? '用户' : '助手') + ': ' + (m.content || '').substring(0, 500);
  }).join('\n');

  var summarizePrompt = '请将以下对话压缩成简洁的摘要，保留关键信息、决策和上下文。摘要应该：\n' +
    '1. 保留用户的主要需求和目标\n' +
    '2. 保留已做出的关键决策\n' +
    '3. 保留重要的代码修改或文件操作\n' +
    '4. 保留未解决的问题\n' +
    '5. 控制在200字以内\n\n' +
    '对话内容：\n' + summaryContent;

  addAssistantMsg('正在压缩对话...');

  try {
    var result = await window.api.invoke('claude-api-stream', [
      { role: 'user', content: [{ type: 'text', text: summarizePrompt }] }
    ], {
      model: state.config.defaultModel,
      maxTokens: 500,
      temperature: 0.3
    });

    if (result.success && result.content) {
      // 替换消息为压缩后的摘要 + 最近的消息
      state.currentConversation.messages = [
        { role: 'user', content: '[对话已被压缩]', timestamp: new Date().toISOString() },
        { role: 'assistant', content: '对话摘要：\n' + result.content, timestamp: new Date().toISOString() },
        ...recentMsgs
      ];
      saveConversations();
      renderMessages();
      addAssistantMsg('对话已压缩完成。保留了最近2条消息和历史摘要。');
    } else {
      addAssistantMsg('压缩失败: ' + (result.error || '未知错误'));
    }
  } catch (err) {
    addAssistantMsg('压缩失败: ' + err.message);
  }
}

function addAssistantMsg(content) {
  if (!state.currentConversation) createNewConversation();
  state.currentConversation.messages.push({ role: 'assistant', content: content, timestamp: new Date().toISOString() });
  saveConversations(); renderMessages();
}

// 文件附件（图片/PDF/文本/其他）
async function uploadImage() {
  // 通过新的多选 IPC 拿到附件列表，单次可多选
  try {
    var list = await window.api.invoke('pick-attachments');
    if (!Array.isArray(list) || list.length === 0) return;
    list.forEach(attachFile);
  } catch (err) {
    logError('选择附件失败: ' + (err && err.message));
  }
}

function attachFile(item) {
  if (!item || !item.kind) return;
  state.attachedFiles.push(item);
  // 图片若没有本地路径，后台落盘拿绝对路径（让 MCP understand_image 可直传）。
  // 把 promise 挂到 item._savePending，sendMessage 会在发送前 await 全部 pending，
  // 否则消息会带着 path=undefined 出去，模型只看到 base64 图、找不到路径就开始 dir/copy 瞎找。
  if (item.kind === 'image' && !item.path && item.data) {
    item._savePending = window.api.invoke('save-pasted-image', { data: item.data, mediaType: item.mediaType })
      .then(function(saved) {
        if (saved && saved.path) {
          item.path = saved.path;
          renderAttachmentPreview();
        }
      })
      .catch(function(err) { logError('图片落盘失败: ' + (err && err.message)); })
      .finally(function() { delete item._savePending; });
  }
  renderAttachmentPreview();
}

function removeAttachment(index) {
  state.attachedFiles.splice(index, 1);
  renderAttachmentPreview();
}

function renderAttachmentPreview() {
  var box = $('attachmentPreview');
  if (!box) return;
  if (!state.attachedFiles || state.attachedFiles.length === 0) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'flex';
  var iconFor = function(k) {
    if (k === 'image') return '🖼';
    if (k === 'pdf') return '📕';
    if (k === 'text') return '📄';
    return '📎';
  };
  var humanSize = function(n) {
    if (n == null) return '';
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
    return (n / 1024 / 1024).toFixed(1) + 'MB';
  };
  var html = '';
  state.attachedFiles.forEach(function(f, i) {
    var thumb;
    if (f.kind === 'image' && f.data) {
      thumb = '<img src="data:' + f.mediaType + ';base64,' + f.data + '" alt="" />';
    } else {
      thumb = '<div class="att-icon">' + iconFor(f.kind) + '</div>';
    }
    html += '<div class="att-chip" title="' + esc(f.path || f.name) + '">' +
      thumb +
      '<div class="att-meta">' +
        '<span class="att-name">' + esc(f.name) + '</span>' +
        '<span class="att-sub">' + (f.kind === 'text' ? '文本' : (f.kind === 'pdf' ? 'PDF' : (f.kind === 'image' ? '图片' : '文件'))) +
        (f.size != null ? ' · ' + humanSize(f.size) : '') + '</span>' +
      '</div>' +
      '<button class="att-remove" data-idx="' + i + '" title="移除">✕</button>' +
    '</div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.att-remove').forEach(function(btn) {
    btn.onclick = function() { removeAttachment(parseInt(btn.getAttribute('data-idx'), 10)); };
  });
}

// 旧 API 兼容：从一些粘贴流程仍会调 attachImage
function attachImage(image) {
  if (!image || !image.data) return;
  attachFile({
    kind: 'image',
    name: 'image-' + Date.now() + '.' + ((image.mediaType || 'image/png').split('/')[1] || 'png'),
    mediaType: image.mediaType || 'image/png',
    data: image.data,
    path: image.path,
  });
}

// 文件树 - 可折叠
var fileTreeCollapsed = new Set(); // 已折叠的目录路径集合 (默认展开，用户可折叠)

async function loadFileTree() {
  if (!state.workDir) return;
  var result = await window.api.invoke('get-file-tree', state.workDir);
  if (!result.success || !result.files) return;

  var files = result.files;
  var tree = $('fileTree');
  if (!tree) return;

  // 构建树结构
  var root = {};
  files.forEach(function(f) {
    var rel = f.path.replace(state.workDir, '').replace(/\\/g, '/').replace(/^\//, '');
    var parts = rel.split('/');
    var current = root;
    parts.forEach(function(part, i) {
      if (!current[part]) {
        current[part] = i === parts.length - 1 && f.type === 'file' ? null : {};
      }
      if (current[part] !== null) current = current[part];
    });
  });

  function getFileIcon(name) {
    var ext = name.split('.').pop().toLowerCase();
    var icons = {
      js: '📜', ts: '📘', jsx: '⚛', tsx: '⚛', py: '🐍', java: '☕',
      html: '🌐', css: '🎨', json: '📋', md: '📝', txt: '📄',
      png: '🖼', jpg: '🖼', gif: '🖼', svg: '🖼',
      zip: '📦', tar: '📦', gz: '📦',
      sh: '⚙', bat: '⚙', cmd: '⚙'
    };
    return icons[ext] || '📄';
  }

  // 递归渲染树节点，在目录名上附加折叠控制
  function renderNode(node, prefix, depth) {
    var html = '';
    var keys = Object.keys(node).sort(function(a, b) {
      var aIsDir = node[a] !== null;
      var bIsDir = node[b] !== null;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    keys.forEach(function(key) {
      var isDir = node[key] !== null;
      var indent = depth * 16;
      if (isDir) {
        var dirPath = prefix + key;
        var collapsed = fileTreeCollapsed.has(dirPath);
        var arrow = collapsed ? '▶' : '▼';
        html += '<div class="file-item file-dir' + (collapsed ? ' collapsed' : '') + '" style="padding-left:' + (4 + indent) + 'px" data-dir="' + dirPath + '">' +
          '<span class="dir-arrow">' + arrow + '</span>' +
          '<span class="file-icon">📁</span><span class="file-name">' + esc(key) + '</span></div>';
        if (!collapsed) {
          html += renderNode(node[key], dirPath + '/', depth + 1);
        }
      } else {
        html += '<div class="file-item file-file" style="padding-left:' + (4 + indent + 16) + 'px" data-path="' + prefix + key + '">' +
          '<span class="file-icon">' + getFileIcon(key) + '</span><span class="file-name">' + esc(key) + '</span></div>';
      }
    });
    return html;
  }

  var treeHtml = '<div class="file-root" style="padding:6px 8px;font-size:11px;color:var(--text-secondary);border-bottom:1px solid var(--border)">' +
    esc(state.workDir.split(/[\\/]/).pop()) + '</div>';
  treeHtml += renderNode(root, '', 0);
  treeHtml += '<div style="padding:8px;font-size:11px;color:var(--text-secondary)">' + files.length + ' 个文件</div>';
  tree.innerHTML = treeHtml;

  // 目录点击 - 切换折叠
  tree.querySelectorAll('.file-dir').forEach(function(item) {
    item.onclick = function(e) {
      var dirPath = this.getAttribute('data-dir');
      if (fileTreeCollapsed.has(dirPath)) {
        fileTreeCollapsed.delete(dirPath);
      } else {
        fileTreeCollapsed.add(dirPath);
      }
      // 重新渲染树
      loadFileTree();
    };
  });

  // 文件点击 - 在编辑器中打开
  tree.querySelectorAll('.file-file').forEach(function(item) {
    item.onclick = function() {
      var relPath = this.getAttribute('data-path');
      var fullPath = state.workDir + '\\' + relPath.replace(/\//g, '\\');
      openFileInEditor(fullPath, relPath.split('/').pop());
    };
  });

  // 右键菜单
  tree.querySelectorAll('.file-file, .file-dir').forEach(function(item) {
    item.oncontextmenu = function(e) {
      e.preventDefault();
      e.stopPropagation();
      var isDir = this.classList.contains('file-dir');
      var relPath = this.getAttribute('data-dir') || this.getAttribute('data-path');
      var fullPath = state.workDir + '\\' + relPath.replace(/\//g, '\\');
      var name = relPath.split('/').pop();
      showContextMenu(e.clientX, e.clientY, fullPath, name, isDir);
    };
  });

  // 文件树空白区域右键 → 在根目录新建/刷新
  tree.oncontextmenu = function(e) {
    if (e.target.closest('.file-item')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, state.workDir, state.workDir.split(/[\\/]/).pop(), true);
  };
}

// ========== 右键菜单 ==========

var ctxTarget = { path: '', name: '', isDir: false };

function showContextMenu(x, y, fullPath, name, isDir) {
  ctxTarget = { path: fullPath, name: name, isDir: isDir };
  var menu = $('contextMenu');
  if (!menu) return;

  var isRoot = fullPath === state.workDir;

  // 目录时不显示"打开"
  menu.querySelector('[data-action="open"]').style.display = isDir ? 'none' : '';
  // 新建文件/文件夹仅对目录显示（或在空白处，但这里默认使用当前目录）
  menu.querySelector('[data-action="newFile"]').style.display = isDir ? '' : 'none';
  menu.querySelector('[data-action="newFolder"]').style.display = isDir ? '' : 'none';
  // 根目录禁止重命名和删除（防止误操作）
  menu.querySelector('[data-action="rename"]').style.display = isRoot ? 'none' : '';
  menu.querySelector('[data-action="delete"]').style.display = isRoot ? 'none' : '';

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';

  // 确保不超出屏幕
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
}

function hideContextMenu() {
  var menu = $('contextMenu');
  if (menu) menu.style.display = 'none';
}

function setupContextMenu() {
  // 点击菜单项
  var menu = $('contextMenu');
  if (menu) {
    menu.querySelectorAll('.ctx-item').forEach(function(item) {
      item.onclick = function() {
        var action = this.getAttribute('data-action');
        handleContextAction(action);
        hideContextMenu();
      };
    });
  }

  // 点击其他地方关闭菜单
  document.addEventListener('click', function(e) {
    var menu = $('contextMenu');
    if (menu && !menu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('contextmenu', function(e) {
    // 如果不是在文件树内右键，关闭菜单
    if (!e.target.closest('.file-tree')) hideContextMenu();
  });
}

async function handleContextAction(action) {
  var p = ctxTarget.path;
  var n = ctxTarget.name;

  switch (action) {
    case 'open':
      openFileInEditor(p, n);
      break;

    case 'copyPath':
      navigator.clipboard.writeText(p);
      break;

    case 'copyName':
      navigator.clipboard.writeText(n);
      break;

    case 'rename':
      var newName = prompt('重命名 "' + n + '" 为:', n);
      if (newName && newName !== n) {
        var dir = p.substring(0, p.lastIndexOf('\\'));
        var newPath = dir + '\\' + newName;
        // 读取旧文件 → 写入新文件 → 删除旧文件
        var readResult = await window.api.invoke('tool-read', p);
        if (readResult.success) {
          var writeResult = await window.api.invoke('tool-write', newPath, readResult.content);
          if (writeResult.success) {
            // 用 bash 删除旧文件
            await window.api.invoke('tool-bash', 'del "' + p + '"');
            loadFileTree();
          } else {
            alert('重命名失败: ' + writeResult.error);
          }
        }
      }
      break;

    case 'delete':
      if (confirm('确定要删除 "' + n + '" 吗？此操作不可撤销。')) {
        var cmd = ctxTarget.isDir ? 'rmdir /s /q "' + p + '"' : 'del "' + p + '"';
        var result = await window.api.invoke('tool-bash', cmd);
        if (result.success) {
          // 关闭已打开的该文件
          for (var i = state.openFiles.length - 1; i >= 0; i--) {
            if (state.openFiles[i].path === p) closeFile(i);
          }
          loadFileTree();
        } else {
          alert('删除失败: ' + result.output);
        }
      }
      break;

    case 'newFile':
      var newFileName = prompt('新建文件名称:', '');
      if (newFileName) {
        var dirPath = ctxTarget.isDir ? p : p.substring(0, p.lastIndexOf('\\'));
        var newFilePath = dirPath + '\\' + newFileName;
        var writeResult = await window.api.invoke('tool-write', newFilePath, '');
        if (writeResult.success) {
          loadFileTree();
        } else {
          alert('创建文件失败: ' + writeResult.error);
        }
      }
      break;

    case 'newFolder':
      var newFolderName = prompt('新建文件夹名称:', '');
      if (newFolderName) {
        var parentDir = ctxTarget.isDir ? p : p.substring(0, p.lastIndexOf('\\'));
        var newDirPath = parentDir + '\\' + newFolderName;
        var result = await window.api.invoke('tool-bash', 'mkdir "' + newDirPath + '"');
        if (result.success) {
          loadFileTree();
        } else {
          alert('创建文件夹失败: ' + result.output);
        }
      }
      break;

    case 'refresh':
      loadFileTree();
      break;
  }
}

// ========== 文件编辑器 ==========

// 可编辑的文本文件扩展名
var TEXT_EXTS = [
  // 主流编程语言
  'js','mjs','cjs','ts','tsx','jsx','py','pyw','rb','php','java','kt','kts','scala',
  'go','rs','c','h','cc','cpp','hpp','cxx','hxx','cs','swift','m','mm','dart',
  'lua','pl','pm','r','jl','ex','exs','erl','hrl','elm','clj','cljs','nim','zig','v','vh',
  // Web
  'html','htm','xhtml','vue','svelte','astro','css','scss','sass','less','styl','postcss',
  // 数据/配置
  'json','jsonc','json5','xml','yaml','yml','toml','ini','cfg','conf','properties','env',
  'lock','csv','tsv','tab','prop','plist',
  // 标记文档
  'md','markdown','mdx','rst','txt','text','log','adoc','asciidoc','tex','bib',
  // Shell / 脚本
  'sh','bash','zsh','fish','bat','cmd','ps1','psm1','psd1',
  // 构建/包管理
  'gradle','sbt','pom','make','mk','cmake','meson','bazel','build','ninja','dockerfile','containerfile',
  // 版本控制 / 元
  'gitignore','gitattributes','gitmodules','editorconfig','prettierrc','eslintrc','npmrc','npmignore','nvmrc','babelrc','browserslistrc','dockerignore','htaccess',
  // 数据库 / 查询
  'sql','graphql','gql','prisma',
  // 其它
  'diff','patch','po','pot','srt','vtt','vbs','vba','asm','s'
];

// 无扩展名但常见的文本文件（用文件名匹配）
var TEXT_BASENAMES = [
  'Makefile','makefile','Dockerfile','Containerfile','CMakeLists.txt',
  'LICENSE','LICENCE','COPYING','README','CHANGELOG','AUTHORS','CONTRIBUTORS','NOTICE','TODO','INSTALL','HISTORY',
  'Procfile','Gemfile','Rakefile','Vagrantfile','Brewfile','Pipfile','Jenkinsfile','Caddyfile','justfile','BUILD','WORKSPACE'
];

// 图片：在编辑器内以预览方式打开（不是当文本读）
var IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','bmp','ico','svg','avif'];

function getExt(name) {
  var parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isTextFile(name) {
  var ext = getExt(name);
  if (ext && TEXT_EXTS.indexOf(ext) >= 0) return true;
  // 无扩展名或扩展名未知 → 匹配常见文本文件名
  if (TEXT_BASENAMES.indexOf(name) >= 0) return true;
  return false;
}

function isImageFile(name) {
  return IMAGE_EXTS.indexOf(getExt(name)) >= 0;
}

async function openFileInEditor(fullPath, fileName) {
  // 检查是否已打开
  for (var i = 0; i < state.openFiles.length; i++) {
    if (state.openFiles[i].path === fullPath) {
      switchToFile(i);
      return;
    }
  }

  // 图片：用 read-image-as-data-url IPC 读为 data URL，编辑器以图片预览
  if (isImageFile(fileName)) {
    var img = await window.api.invoke('read-file-as-data-url', fullPath);
    if (!img || !img.success) {
      alert('无法读取图片: ' + (img && img.error || '未知错误'));
      return;
    }
    state.openFiles.push({
      name: fileName,
      path: fullPath,
      content: '',
      originalContent: '',
      modified: false,
      isText: false,
      isImage: true,
      dataUrl: img.dataUrl
    });
    state.activeFileIndex = state.openFiles.length - 1;
    renderEditorTabs();
    renderEditorContent();
    showEditor();
    return;
  }

  // 文本（含未知扩展名 → 仍尝试当文本读 + 编码探测；二进制会探测失败时回退到 latin1，但用户可见）
  var result = await window.api.invoke('tool-read', fullPath);
  if (!result.success) {
    alert('无法读取文件: ' + result.error);
    return;
  }

  // 二进制兜底：如果检测到大量 null 字节，提示用户这可能是二进制文件
  if (result.content && /\x00/.test(result.content.slice(0, 4096))) {
    if (!confirm('"' + fileName + '" 似乎是二进制文件，强行作为文本打开可能显示乱码。是否继续？')) {
      return;
    }
  }

  var isText = isTextFile(fileName);
  state.openFiles.push({
    name: fileName,
    path: fullPath,
    content: result.content,
    originalContent: result.content,
    modified: false,
    isText: isText,
    encoding: result.encoding || 'utf-8'
  });
  state.activeFileIndex = state.openFiles.length - 1;

  renderEditorTabs();
  renderEditorContent();
  showEditor();
}

function switchToFile(index) {
  // 保存当前编辑器内容
  saveEditorContent();
  state.activeFileIndex = index;
  renderEditorTabs();
  renderEditorContent();
}

function closeFile(index) {
  var file = state.openFiles[index];
  if (file.modified) {
    if (!confirm('文件 "' + file.name + '" 已修改，是否保存？')) {
      // 不保存，直接关闭
    } else {
      saveFileByIndex(index);
    }
  }
  state.openFiles.splice(index, 1);
  if (state.activeFileIndex >= state.openFiles.length) {
    state.activeFileIndex = state.openFiles.length - 1;
  }
  if (state.openFiles.length === 0) {
    state.activeFileIndex = -1;
    hideEditor();
  } else {
    renderEditorTabs();
    renderEditorContent();
  }
}

function saveEditorContent() {
  if (state.activeFileIndex < 0) return;
  var file = state.openFiles[state.activeFileIndex];
  if (!file || !file.isText) return;
  var editor = $('editorCode');
  if (editor) {
    file.content = editor.value;
    file.modified = file.content !== file.originalContent;
    renderEditorTabs();
  }
}

async function saveFileByIndex(index) {
  var file = state.openFiles[index];
  if (!file) return;
  if (file.isImage) return; // 图片不可编辑保存
  var result = await window.api.invoke('tool-write', file.path, file.content);
  if (result.success) {
    file.originalContent = file.content;
    file.modified = false;
    renderEditorTabs();
  } else {
    alert('保存失败: ' + result.error);
  }
}

async function saveCurrentFile() {
  saveEditorContent();
  await saveFileByIndex(state.activeFileIndex);
}

// ========== 自动保存 ==========
var _autoSaveTimer = null;
function startAutoSaveTimer() {
  stopAutoSaveTimer();
  if (!state.config.autoSave) return;
  _autoSaveTimer = setInterval(function() {
    if (state.activeFileIndex < 0) return;
    var file = state.openFiles[state.activeFileIndex];
    if (file && file.modified) {
      saveCurrentFile();
    }
  }, 5000);
}
function stopAutoSaveTimer() {
  if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
}

function renderEditorTabs() {
  var tabsEl = $('editorTabs');
  if (!tabsEl) return;
  var html = '';
  for (var i = 0; i < state.openFiles.length; i++) {
    var f = state.openFiles[i];
    var cls = 'editor-tab' + (i === state.activeFileIndex ? ' active' : '') + (f.modified ? ' modified' : '');
    html += '<div class="' + cls + '" data-idx="' + i + '">' +
      '<span class="tab-name">' + esc(f.name) + '</span>' +
      '<button class="tab-close" data-idx="' + i + '">✕</button></div>';
  }
  tabsEl.innerHTML = html;

  // 绑定事件
  tabsEl.querySelectorAll('.editor-tab').forEach(function(tab) {
    tab.onclick = function(e) {
      if (e.target.classList.contains('tab-close')) return;
      switchToFile(parseInt(this.getAttribute('data-idx')));
    };
  });
  tabsEl.querySelectorAll('.tab-close').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      closeFile(parseInt(this.getAttribute('data-idx')));
    };
  });
}

function renderEditorContent() {
  var file = state.activeFileIndex >= 0 ? state.openFiles[state.activeFileIndex] : null;
  var filepath = $('editorFilepath');
  var codeEl = $('editorCode');
  var lineNums = $('editorLineNumbers');
  var preview = $('mdPreview');
  var imgPreview = $('imgPreview');

  if (!file) return;

  if (filepath) filepath.textContent = file.path + (file.encoding && file.encoding !== 'utf-8' ? '  [' + file.encoding + ']' : '');

  // 图片分支
  if (file.isImage) {
    if (codeEl) codeEl.style.display = 'none';
    if (lineNums) lineNums.style.display = 'none';
    if (preview) preview.style.display = 'none';
    // 复用或创建 img 预览容器
    if (!imgPreview) {
      var body = $('editorBody');
      if (body) {
        imgPreview = document.createElement('div');
        imgPreview.id = 'imgPreview';
        imgPreview.className = 'editor-image-preview';
        body.appendChild(imgPreview);
      }
    }
    if (imgPreview) {
      imgPreview.style.display = 'flex';
      imgPreview.innerHTML =
        '<div class="editor-image-toolbar">' +
          '<span class="img-info" id="imgInfo">' + esc(file.name) + '</span>' +
          '<button data-zoom="-">−</button>' +
          '<button data-zoom="reset">适应</button>' +
          '<button data-zoom="100">100%</button>' +
          '<button data-zoom="+">+</button>' +
        '</div>' +
        '<div class="editor-image-canvas fit" id="imgCanvas">' +
          '<img id="imgEl" src="' + file.dataUrl + '" alt="' + esc(file.name) + '" />' +
        '</div>';
      var imgEl = imgPreview.querySelector('#imgEl');
      var canvas = imgPreview.querySelector('#imgCanvas');
      var info = imgPreview.querySelector('#imgInfo');
      var zoom = 1;
      function applyZoom(z) {
        zoom = Math.max(0.1, Math.min(10, z));
        canvas.classList.remove('fit');
        imgEl.style.transform = 'scale(' + zoom + ')';
        if (info && imgEl.naturalWidth) {
          info.textContent = file.name + ' · ' + imgEl.naturalWidth + ' × ' + imgEl.naturalHeight + ' · ' + Math.round(zoom * 100) + '%';
        }
      }
      function resetZoom() {
        zoom = 1;
        imgEl.style.transform = '';
        canvas.classList.add('fit');
        if (info && imgEl.naturalWidth) {
          info.textContent = file.name + ' · ' + imgEl.naturalWidth + ' × ' + imgEl.naturalHeight + ' · 适应';
        }
      }
      imgEl.onload = function() { resetZoom(); };
      imgPreview.querySelectorAll('[data-zoom]').forEach(function(btn) {
        btn.onclick = function() {
          var op = this.getAttribute('data-zoom');
          if (op === 'reset') resetZoom();
          else if (op === '100') applyZoom(1);
          else if (op === '+') applyZoom(zoom * 1.25);
          else if (op === '-') applyZoom(zoom / 1.25);
        };
      });
      // 鼠标滚轮缩放（Ctrl+滚轮）
      canvas.onwheel = function(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        applyZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
      };
    }
    return;
  }

  // 文本分支：恢复 textarea 显示
  if (codeEl) {
    codeEl.style.display = '';
    codeEl.value = file.content;
    codeEl.readOnly = !file.isText;
  }
  if (lineNums) lineNums.style.display = '';
  if (imgPreview) imgPreview.style.display = 'none';

  // 行号
  updateLineNumbers();

  // 标记修改状态
  var tab = document.querySelector('.editor-tab.active');
  if (tab) {
    if (file.modified) tab.classList.add('modified');
    else tab.classList.remove('modified');
  }
}

function updateLineNumbers() {
  var codeEl = $('editorCode');
  var lineNums = $('editorLineNumbers');
  if (!codeEl || !lineNums) return;
  var lines = codeEl.value.split('\n').length;
  var html = '';
  for (var i = 1; i <= lines; i++) {
    html += i + '\n';
  }
  lineNums.textContent = html;
}

function showEditor() {
  var mainContent = document.querySelector('.main-content');
  var editorPanel = $('editorPanel');
  if (mainContent) mainContent.classList.add('editor-open');
  if (editorPanel) editorPanel.style.display = 'flex';
  try { renderMessages(); } catch(_) {}
  startAutoSaveTimer();
}

function hideEditor() {
  stopAutoSaveTimer();
  var mainContent = document.querySelector('.main-content');
  var editorPanel = $('editorPanel');
  if (mainContent) mainContent.classList.remove('editor-open');
  if (editorPanel) editorPanel.style.display = 'none';
  try { renderMessages(); } catch(_) {}
}

// ========== 编辑器查找替换 ==========

var findState = { matches: [], current: -1 };

function toggleFindBar() {
  var bar = $('findBar');
  if (!bar) return;
  if (bar.style.display === 'none' || !bar.style.display) {
    bar.style.display = 'flex';
    var input = $('findInput');
    if (input) {
      // 如果编辑器有选中文本，填入查找框
      var editor = $('editorCode');
      if (editor && editor.selectionStart !== editor.selectionEnd) {
        input.value = editor.value.substring(editor.selectionStart, editor.selectionEnd);
      }
      input.focus();
      findInEditor(0);
    }
  } else {
    bar.style.display = 'none';
  }
}

function findInEditor(direction) {
  var query = $('findInput')?.value;
  var editor = $('editorCode');
  var info = $('findInfo');
  if (!query || !editor) { findState = { matches: [], current: -1 }; if (info) info.textContent = ''; return; }

  var text = editor.value;
  findState.matches = [];
  var idx = 0;
  while ((idx = text.indexOf(query, idx)) !== -1) {
    findState.matches.push(idx);
    idx += query.length;
  }

  if (findState.matches.length === 0) {
    findState.current = -1;
    if (info) info.textContent = '无结果';
    return;
  }

  if (direction !== 0) {
    findState.current = (findState.current + direction + findState.matches.length) % findState.matches.length;
  } else if (findState.current < 0) {
    findState.current = 0;
  }

  var pos = findState.matches[findState.current];
  editor.focus();
  editor.setSelectionRange(pos, pos + query.length);
  if (info) info.textContent = (findState.current + 1) + ' / ' + findState.matches.length;
}

function replaceInEditor(replaceAll) {
  var query = $('findInput')?.value;
  var replacement = $('replaceInput')?.value;
  var editor = $('editorCode');
  if (!query || !editor) return;

  if (replaceAll) {
    editor.value = editor.value.split(query).join(replacement);
    saveEditorContent();
    updateLineNumbers();
    findInEditor(0);
  } else {
    var pos = findState.matches[findState.current];
    if (pos !== undefined) {
      editor.value = editor.value.substring(0, pos) + replacement + editor.value.substring(pos + query.length);
      saveEditorContent();
      updateLineNumbers();
      findInEditor(1);
    }
  }
}

// ========== Markdown 预览 ==========

function switchEditorView(mode) {
  var codeEl = $('editorCode');
  var lineNums = $('editorLineNumbers');
  var preview = $('mdPreview');
  var codeBtn = $('editorCodeView');
  var prevBtn = $('editorPreview');
  var file = state.activeFileIndex >= 0 ? state.openFiles[state.activeFileIndex] : null;

  if (mode === 'preview' && file && file.isText) {
    if (codeEl) codeEl.style.display = 'none';
    if (lineNums) lineNums.style.display = 'none';
    if (preview) {
      preview.style.display = 'block';
      preview.innerHTML = renderMarkdown(codeEl?.value || '');
    }
    if (codeBtn) codeBtn.classList.remove('active');
    if (prevBtn) prevBtn.classList.add('active');
  } else {
    if (codeEl) codeEl.style.display = '';
    if (lineNums) lineNums.style.display = '';
    if (preview) preview.style.display = 'none';
    if (codeBtn) codeBtn.classList.add('active');
    if (prevBtn) prevBtn.classList.remove('active');
  }
}

function renderMarkdown(md) {
  var html = esc(md);
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 标题
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 格式
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
    var safeUrl = url.replace(/^(javascript|data|vbscript):/i, '#');
    return '<a href="' + safeUrl + '" target="_blank" rel="noopener">' + text + '</a>';
  });
  // 引用
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // 列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // 水平线
  html = html.replace(/^---+$/gm, '<hr>');
  // 换行
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  return html;
}

// ========== 快速打开文件 ==========

var quickOpenFiles = [];

async function openQuickOpen() {
  var overlay = $('quickOpenOverlay');
  var input = $('quickOpenInput');
  var list = $('quickOpenList');
  if (!overlay || !input || !list) return;

  // 加载文件列表
  if (!state.workDir) { alert('请先选择工作目录'); return; }
  var result = await window.api.invoke('get-file-tree', state.workDir);
  if (!result.success) return;

  quickOpenFiles = result.files.filter(function(f) { return f.type === 'file'; }).map(function(f) {
    var rel = f.path.replace(state.workDir, '').replace(/\\/g, '/').replace(/^\//, '');
    return { name: rel.split('/').pop(), path: f.path, rel: rel };
  });

  overlay.style.display = 'flex';
  input.value = '';
  filterQuickOpen('');
  input.focus();

  input.oninput = function() { filterQuickOpen(this.value); };
  input.onkeydown = function(e) {
    var items = list.querySelectorAll('.qo-item');
    var active = list.querySelector('.qo-item.active');
    var idx = active ? parseInt(active.getAttribute('data-idx')) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = Math.min(idx + 1, items.length - 1);
      items.forEach(function(it) { it.classList.remove('active'); });
      if (items[next]) { items[next].classList.add('active'); items[next].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = Math.max(idx - 1, 0);
      items.forEach(function(it) { it.classList.remove('active'); });
      if (items[prev]) { items[prev].classList.add('active'); items[prev].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) {
        var f = quickOpenFiles[parseInt(active.getAttribute('data-idx'))];
        if (f) openFileInEditor(f.path, f.name);
        closeQuickOpen();
      }
    } else if (e.key === 'Escape') {
      closeQuickOpen();
    }
  };
}

function filterQuickOpen(query) {
  var list = $('quickOpenList');
  if (!list) return;
  query = query.toLowerCase();
  var filtered = query ? quickOpenFiles.filter(function(f) {
    return f.name.toLowerCase().indexOf(query) >= 0 || f.rel.toLowerCase().indexOf(query) >= 0;
  }) : quickOpenFiles.slice(0, 50);

  list.innerHTML = filtered.slice(0, 50).map(function(f, i) {
    return '<div class="qo-item' + (i === 0 ? ' active' : '') + '" data-idx="' + quickOpenFiles.indexOf(f) + '">' +
      '<span class="qo-name">' + esc(f.name) + '</span>' +
      '<span class="qo-path">' + esc(f.rel) + '</span></div>';
  }).join('');

  list.querySelectorAll('.qo-item').forEach(function(item) {
    item.onclick = function() {
      var f = quickOpenFiles[parseInt(this.getAttribute('data-idx'))];
      if (f) openFileInEditor(f.path, f.name);
      closeQuickOpen();
    };
  });
}

function closeQuickOpen() {
  var overlay = $('quickOpenOverlay');
  if (overlay) overlay.style.display = 'none';
}

// 点击遮罩关闭
document.addEventListener('click', function(e) {
  if (e.target.id === 'quickOpenOverlay') closeQuickOpen();
});

// 拦截外部链接，用默认浏览器打开
document.addEventListener('click', function(e) {
  var a = e.target.closest('a[href]');
  if (a && a.href && (a.href.startsWith('http://') || a.href.startsWith('https://'))) {
    e.preventDefault();
    window.api.invoke('open-external', a.href);
  }
});

// ========== 对话导出 ==========

async function exportConversation() {
  if (!state.currentConversation || state.currentConversation.messages.length === 0) {
    alert('没有可导出的对话');
    return;
  }
  var conv = state.currentConversation;
  var appVer = '';
  try { appVer = await window.api.invoke('get-app-version'); } catch (_) {}
  var md = '# ' + conv.title + '\n\n';
  md += '> 导出时间: ' + new Date().toLocaleString('zh-CN');
  if (appVer) md += '  |  cc-wrap v' + appVer;
  md += '\n\n';

  var totalIn = 0, totalOut = 0;
  for (var i = 0; i < conv.messages.length; i++) {
    var msg = conv.messages[i];
    var role = msg.role === 'user' ? '**你**' : '**Claude**';
    var tokens = '';
    if (msg.role !== 'user' && (msg.inputTokens !== undefined || msg.outputTokens !== undefined)) {
      tokens = '  `↑' + (msg.inputTokens ?? 0) + ' · ↓' + (msg.outputTokens ?? 0) + '`';
      totalIn += msg.inputTokens ?? 0;
      totalOut += msg.outputTokens ?? 0;
    }
    md += '### ' + role + '  ' + new Date(msg.timestamp).toLocaleTimeString('zh-CN') + tokens + '\n\n';
    md += msg.content + '\n\n';

    if (msg.toolCalls) {
      for (var j = 0; j < msg.toolCalls.length; j++) {
        var tc = msg.toolCalls[j];
        md += '> 工具: ' + tc.name + '\n> ' + tc.input + '\n\n';
      }
    }
  }
  if (totalIn || totalOut) {
    md += '---\n\n**Token 总计:** ↑' + totalIn + ' · ↓' + totalOut + '\n';
  }

  var result = await window.api.invoke('export-conversation', md, state.workDir);
  if (result.success) {
    alert(t('exportSuccess') + '\n' + result.path);
  } else if (result.error === '已取消') {
    // 用户取消，不做任何事
  } else {
    navigator.clipboard.writeText(md);
    alert(t('exportClipboard'));
  }
}

// 清理流式 streaming 标记（异常退出 / 完成 / 停止时调用，避免后续消息样式异常）
function clearStreamingMarks() {
  document.querySelectorAll('.msg-content.streaming').forEach(function(el) {
    el.classList.remove('streaming');
  });
}

// ========== 思考状态指示 ==========

function setThinking(active, label) {
  var el = $('thinkingIndicator');
  var lbl = $('thinkingLabel');
  if (!el) return;
  // 仅当当前对话正是生成中的那个对话时才显示思考指示器
  if (active && state.generatingConversationId === state.currentConversation.id) {
    el.style.display = 'flex';
    if (lbl) lbl.textContent = label || '思考中...';
  } else {
    el.style.display = 'none';
  }
  // 刷新侧边栏对话列表，更新生成中的动画指示器
  renderConversations();
}

// ========== 滚动到底部按钮 ==========

function setupScrollToBottom() {
  var chatArea = $('chatArea');
  var btn = $('scrollBottomBtn');
  if (!chatArea || !btn) return;
  function updateBtn() {
    var dist = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
    btn.style.display = dist > 200 ? 'inline-flex' : 'none';
  }
  chatArea.addEventListener('scroll', updateBtn, { passive: true });
  btn.onclick = function() {
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
  };
  // End 键也能跳底部
  document.addEventListener('keydown', function(e) {
    if (e.key === 'End' && e.ctrlKey && chatArea.contains(document.activeElement) === false) {
      e.preventDefault();
      chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
    }
  });
  updateBtn();
}

// ========== Plan UI（任务进度面板） ==========

function setupTaskPanel() {
  var header = $('taskPanelHeader');
  var clearBtn = $('taskPanelClear');
  var toggle = $('taskPanelToggle');
  if (header) {
    header.onclick = function(e) {
      // 清空按钮的点击不触发折叠
      if (e.target.id === 'taskPanelClear') return;
      toggleTaskPanel();
    };
  }
  if (clearBtn) {
    clearBtn.onclick = function(e) {
      e.stopPropagation();
      if (state.tasks.length === 0) return;
      if (!confirm('清空所有任务？')) return;
      window.api.invoke('clear-tasks').catch(function() {});
    };
  }
}

function toggleTaskPanel() {
  state.tasksPanelCollapsed = !state.tasksPanelCollapsed;
  var panel = $('taskPanel');
  if (panel) {
    if (state.tasksPanelCollapsed) panel.classList.add('collapsed');
    else panel.classList.remove('collapsed');
  }
}

function renderTaskPanel() {
  var panel = $('taskPanel');
  var body = $('taskPanelBody');
  var counter = $('taskPanelCounter');
  if (!panel || !body || !counter) return;

  var tasks = state.tasks || [];
  if (tasks.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  if (state.tasksPanelCollapsed) panel.classList.add('collapsed');
  else panel.classList.remove('collapsed');

  var done = 0;
  for (var i = 0; i < tasks.length; i++) if (tasks[i].status === 'completed') done++;
  counter.textContent = done + '/' + tasks.length;

  var html = '';
  // 按 createdAt 排序，最新在上
  var sorted = tasks.slice().sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  for (var j = 0; j < sorted.length; j++) {
    var t = sorted[j];
    var status = t.status || 'pending';
    var icon = status === 'completed' ? '✓' : (status === 'in_progress' ? '◐' : '○');
    html += '<div class="task-item ' + esc(status) + '" data-id="' + esc(t.id) + '" title="点击切换状态">' +
      '<div class="task-status-icon">' + icon + '</div>' +
      '<div class="task-content">' +
        '<div class="task-subject">' + esc(t.subject || '') + '</div>' +
        (t.description ? '<div class="task-desc">' + esc(t.description) + '</div>' : '') +
      '</div>' +
      '<button class="task-delete" data-del="' + esc(t.id) + '" title="删除">✕</button>' +
    '</div>';
  }
  body.innerHTML = html;

  // 任务点击 → 循环切换状态 pending → in_progress → completed → pending
  body.querySelectorAll('.task-item').forEach(function(item) {
    item.onclick = function(e) {
      if (e.target.classList.contains('task-delete')) return;
      var id = this.getAttribute('data-id');
      var task = null;
      for (var k = 0; k < state.tasks.length; k++) if (state.tasks[k].id === id) { task = state.tasks[k]; break; }
      if (!task) return;
      var next = task.status === 'pending' ? 'in_progress' : (task.status === 'in_progress' ? 'completed' : 'pending');
      // 本地乐观更新 + 让 Claude 也看见
      task.status = next;
      renderTaskPanel();
      window.api.invoke('execute-tool', 'TaskUpdate', { taskId: id, status: next }).catch(function() {});
    };
  });
  body.querySelectorAll('.task-delete').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var id = this.getAttribute('data-del');
      window.api.invoke('execute-tool', 'TaskUpdate', { taskId: id, status: 'deleted' }).catch(function() {});
    };
  });
}

// ========== 拖拽分隔条 ==========

function setupResizers() {
  // 侧边栏宽度拖拽
  var sidebarResizer = $('resizerSidebar');
  var sidebar = $('sidebar');
  if (sidebarResizer && sidebar) {
    sidebarResizer.onmousedown = function(e) {
      e.preventDefault();
      this.classList.add('active');
      var startX = e.clientX;
      var startW = sidebar.offsetWidth;
      var appEl = $('app');

      function onMove(ev) {
        var newW = startW + (ev.clientX - startX);
        newW = Math.max(160, Math.min(newW, window.innerWidth * 0.5));
        sidebar.style.width = newW + 'px';
        sidebar.style.flexShrink = '0';
      }
      function onUp() {
        sidebarResizer.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  // 聊天面板宽度拖拽（editor-open 时生效）
  var chatResizer = $('chatPaneResizer');
  var chatPane = $('chatPane');
  if (chatResizer && chatPane) {
    chatResizer.onmousedown = function(e) {
      var mainContent = document.querySelector('.main-content');
      if (!mainContent || !mainContent.classList.contains('editor-open')) return;
      e.preventDefault();
      this.classList.add('active');
      var startX = e.clientX;
      var startW = chatPane.offsetWidth;

      function onMove(ev) {
        var newW = startW - (ev.clientX - startX);
        newW = Math.max(320, Math.min(newW, window.innerWidth * 0.6));
        mainContent.style.setProperty('--chat-pane-width', newW + 'px');
      }
      function onUp() {
        chatResizer.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        try { window.api.invoke('set-config', 'chatPaneWidth', chatPane.offsetWidth); } catch(_) {}
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  // 恢复持久化的聊天面板宽度
  try {
    var savedW = state.config && state.config.chatPaneWidth;
    if (savedW) {
      var mc = document.querySelector('.main-content');
      if (mc) mc.style.setProperty('--chat-pane-width', savedW + 'px');
    }
  } catch(_) {}

  // 右侧对话面板显示/隐藏开关（编辑器分屏时生效），状态写入 config.chatPaneHidden
  var toggleChatBtn = $('toggleChatPane');
  function applyChatPaneVisibility(hidden) {
    var mc = document.querySelector('.main-content');
    if (!mc) return;
    mc.classList.toggle('chat-collapsed', !!hidden);
    if (toggleChatBtn) toggleChatBtn.textContent = hidden ? '显示对话' : '隐藏对话';
  }
  try {
    var savedHidden = !!(state.config && state.config.chatPaneHidden);
    applyChatPaneVisibility(savedHidden);
  } catch(_) {}
  if (toggleChatBtn) {
    toggleChatBtn.onclick = function() {
      var mc = document.querySelector('.main-content');
      if (!mc) return;
      var nextHidden = !mc.classList.contains('chat-collapsed');
      applyChatPaneVisibility(nextHidden);
      try { window.api.invoke('set-config', 'chatPaneHidden', nextHidden); } catch(_) {}
      if (state.config) state.config.chatPaneHidden = nextHidden;
    };
  }

}

// ========== 文件树自动刷新 ==========

var _fileReloadTimer = null;

function refreshFileTree() {
  if (state.workDir) loadFileTree();
}

// 文件变更时自动重载编辑器中的内容（500ms 防抖）
function reloadChangedFile(filePath) {
  if (!filePath || state.openFiles.length === 0) return;
  if (_fileReloadTimer) clearTimeout(_fileReloadTimer);
  _fileReloadTimer = setTimeout(function() {
    _fileReloadTimer = null;
    for (var i = 0; i < state.openFiles.length; i++) {
      if (state.openFiles[i].path === filePath) {
        (function(idx) {
          // 用户已修改的文件不自动重载（避免覆盖未保存的改动）
          if (state.openFiles[idx].modified) return;
          window.api.invoke('tool-read', filePath).then(function(result) {
            if (!result.success) return;
            state.openFiles[idx].content = result.content;
            state.openFiles[idx].originalContent = result.content;
            state.openFiles[idx].modified = false;
            if (state.activeFileIndex === idx) renderEditorContent();
          });
        })(i);
        break;
      }
    }
  }, 500);
}

// 主题
function applyTheme(theme) {
  state.theme = theme;
  if (theme === 'light') document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
  window.api.invoke('set-config', 'theme', theme);
}

function toggleTheme() { applyTheme(state.theme === 'dark' ? 'light' : 'dark'); }

// 字体大小：通过设置 root 的 --chat-font-size 变量，由 .msg-content 等读取
function applyFontSize(px) {
  document.documentElement.style.setProperty('--chat-font-size', px + 'px');
}

// 设置
// temperature 滑块实时更新显示值
function setupTempSlider(sliderId, displayId) {
  var slider = $(sliderId);
  var display = $(displayId);
  if (slider && display) {
    slider.oninput = function() { display.textContent = parseFloat(this.value).toFixed(2); };
  }
}

function openSettings() {
  $('settingsModal').style.display = 'flex';
  // 重置 tab 高亮到 api
  document.querySelectorAll('.stab').forEach(function(b) { b.classList.remove('active'); });
  var apiTab = document.querySelector('.stab[data-stab="api"]');
  if (apiTab) apiTab.classList.add('active');
  renderSettingsTab('api');
}

function renderSettingsTab(tab) {
  var content = $('settingsContent');
  if (!content) return;

  if (tab === 'api') {
    content.innerHTML =
      '<div style="font-size:14px;font-weight:600;margin-bottom:16px">' + t('globalConfig') + '</div>' +
      '<div class="form-group"><label>' + t('apiKeyLabel') + '</label><input type="password" id="cfgApiKey" value="' + esc(state.config.apiKey || '') + '" placeholder="sk-ant-..." /></div>' +
      '<div class="form-row"><div class="form-group"><label>' + t('defaultModel') + '</label><select id="cfgModel">' + state.models.map(function(m) { return '<option value="' + m.id + '"' + (m.id === state.config.defaultModel ? ' selected' : '') + '>' + m.name + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>' + t('maxTokens') + '</label><input type="number" id="cfgMaxTokens" value="' + (state.config.maxTokens || 4096) + '" /></div>' +
      '<div class="form-group"><label>' + t('temperature') + '</label><input type="range" id="cfgTemperature" min="0" max="2" step="0.05" value="' + (state.config.temperature ?? 0.7) + '" style="width:120px;vertical-align:middle" />' +
      ' <span id="cfgTemperatureVal" style="font-size:13px;color:var(--text-secondary)">' + (state.config.temperature ?? 0.7) + '</span></div></div>' +
      '<button class="btn-primary" id="saveApiBtn" style="margin-bottom:20px">' + t('saveConfig') + '</button>' +
      '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:12px">' + t('addModel') + '</div>' +
      '<div class="form-group"><label>' + t('modelName') + '</label><input id="customModelName" placeholder="例如: MiniMax" /></div>' +
      '<div class="form-row"><div class="form-group"><label>' + t('modelId') + '</label><input id="customModelId" placeholder="例如: MiniMax-M2.7" /></div>' +
      '<div class="form-group"><label>' + t('apiEndpoint') + '</label><input id="customModelEndpoint" placeholder="例如: https://api.minimaxi.com/anthropic" /></div></div>' +
      '<div class="form-row"><div class="form-group"><label>' + t('maxTokens') + '</label><input type="number" id="customModelMaxTokens" placeholder="默认 ' + (state.config.maxTokens || 8192) + '" /></div>' +
      '<div class="form-group"><label>' + t('reasoningEffort') + '</label><select id="customModelReasoningEffort" style="width:100%;padding:6px;border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border)">' +
        '<option value="off">' + t('effortOff') + '</option>' +
        '<option value="low">' + t('effortLow') + '</option>' +
        '<option value="medium">' + t('effortMedium') + '</option>' +
        '<option value="high">' + t('effortHigh') + '</option>' +
      '</select></div></div>' +
      '<div class="form-group"><label>' + t('temperature') + '</label><input type="range" id="customModelTemperature" min="0" max="2" step="0.05" value="' + (state.config.temperature ?? 0.7) + '" style="width:120px;vertical-align:middle" />' +
      ' <span id="customModelTemperatureVal" style="font-size:13px;color:var(--text-secondary)">' + (state.config.temperature ?? 0.7) + '</span></div>' +
      '<div class="form-group"><label>' + t('apiKeyModel') + '</label><input type="password" id="customModelApiKey" placeholder="' + t('modelPlaceholderKey') + '" /></div>' +
      '<button class="btn-primary" id="addCustomBtn">' + t('addModelBtn') + '</button>' +
      '<div style="font-size:13px;font-weight:600;margin:16px 0 8px">' + t('addedModels') + '</div>' +
      '<div id="modelListArea"></div></div>';

    renderModelList();

    var saveApiBtn = $('saveApiBtn');
    if (saveApiBtn) {
      saveApiBtn.onclick = async function() {
        await window.api.invoke('set-config', 'apiKey', $('cfgApiKey').value);
        await window.api.invoke('set-config', 'defaultModel', $('cfgModel').value);
        await window.api.invoke('set-config', 'maxTokens', parseInt($('cfgMaxTokens').value));
        await window.api.invoke('set-config', 'temperature', parseFloat($('cfgTemperature').value));
        state.config = await window.api.invoke('get-config');
        renderModelSelect(); showToast(t('saved'));
      };
    }

    // temperature 滑块实时更新显示值
    setupTempSlider('cfgTemperature', 'cfgTemperatureVal');
    setupTempSlider('customModelTemperature', 'customModelTemperatureVal');


    var addBtn = $('addCustomBtn');
    if (addBtn) {
      addBtn.onclick = async function() {
        var name = $('customModelName').value.trim();
        var id = $('customModelId').value.trim();
        var endpoint = $('customModelEndpoint').value.trim();
        var apiKey = $('customModelApiKey').value.trim();
        var modelMaxTokens = parseInt($('customModelMaxTokens').value) || undefined;
        var modelTemperature = parseFloat($('customModelTemperature').value);
        var modelReasoningEffort = $('customModelReasoningEffort') ? $('customModelReasoningEffort').value : 'off';
        if (!name || !id) { showToast(t('fillNameId')); return; }
        await window.api.invoke('add-model', { provider: 'custom', name: name, id: id, endpoint: endpoint, apiKey: apiKey, maxTokens: modelMaxTokens, temperature: modelTemperature, reasoningEffort: modelReasoningEffort });
        state.config.models = await window.api.invoke('get-models');
        rebuildModelList();
        renderModelSelect(); renderModelList();
        $('customModelName').value = ''; $('customModelId').value = ''; $('customModelEndpoint').value = ''; $('customModelApiKey').value = '';
        showToast(t('added') + ': ' + name);
      };
    }

  } else if (tab === 'theme') {
    var currentFontSize = state.config.fontSize || 14;
    content.innerHTML =
      '<div style="font-size:13px;font-weight:600;margin-bottom:12px">' + t('chooseTheme') + '</div>' +
      '<div class="theme-options">' +
        '<div class="theme-option' + (state.theme === 'dark' ? ' active' : '') + '" data-theme="dark"><div class="theme-icon">🌙</div><div class="theme-name">' + t('darkMode') + '</div></div>' +
        '<div class="theme-option' + (state.theme === 'light' ? ' active' : '') + '" data-theme="light"><div class="theme-icon">☀️</div><div class="theme-name">' + t('lightMode') + '</div></div>' +
      '</div>' +
      '<div class="form-group" style="margin-top:20px"><label>聊天字体大小: <span id="fontSizeLabel" style="color:var(--accent);font-weight:700">' + currentFontSize + 'px</span></label>' +
        '<input type="range" id="cfgFontSize" min="12" max="20" step="1" value="' + currentFontSize + '" style="width:100%;accent-color:var(--accent)" />' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-top:4px;font-family:var(--font-mono)"><span>12</span><span>14 默认</span><span>20</span></div>' +
      '</div>';
    content.querySelectorAll('.theme-option').forEach(function(opt) {
      opt.onclick = function() { applyTheme(this.getAttribute('data-theme')); renderSettingsTab('theme'); };
    });
    var fontSlider = $('cfgFontSize');
    if (fontSlider) {
      fontSlider.oninput = function() {
        var v = parseInt(this.value);
        $('fontSizeLabel').textContent = v + 'px';
        applyFontSize(v);
      };
      fontSlider.onchange = function() {
        window.api.invoke('set-config', 'fontSize', parseInt(this.value));
      };
    }

  } else if (tab === 'general') {
    var currentLang = state.config.language || 'zh';
    var customPrompt = state.config.customSystemPrompt || '';
    content.innerHTML =
      '<div class="form-group"><label>' + t('langLabel') + '</label>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn-sm lang-btn' + (currentLang === 'zh' ? ' active' : '') + '" data-lang="zh">中文</button>' +
        '<button class="btn-sm lang-btn' + (currentLang === 'en' ? ' active' : '') + '" data-lang="en">English</button>' +
      '</div></div>' +
      '<div class="form-group"><label>' + t('workDir') + '</label><div style="display:flex;gap:8px"><input id="cfgWorkDir" value="' + esc(state.workDir) + '" readonly style="flex:1" /><button class="btn-primary" id="selectWorkDirBtn">' + t('selectDir') + '</button></div></div>' +
      '<div class="form-group"><label>自定义系统提示词（附加在内置 prompt 之后，对所有对话生效）</label>' +
        '<textarea id="cfgCustomPrompt" rows="5" placeholder="例如：用户是 senior 后端工程师，回答时跳过基础解释，使用简体中文。" style="width:100%;font-family:var(--font-mono);font-size:12px;line-height:1.6;resize:vertical">' + esc(customPrompt) + '</textarea>' +
        '<button class="btn-sm" id="saveCustomPromptBtn" style="margin-top:6px">保存</button>' +
      '</div>' +
      '<div class="form-group"><label>' + t('allowedTools') + '</label><div style="display:flex;flex-wrap:wrap;gap:8px">' +
        ['Read','Write','Edit','Glob','Grep','Bash','ListDirectory'].map(function(t) {
          return '<label class="checkbox-item"><input type="checkbox" class="tool-check" value="' + t + '"' + (state.allowedTools.indexOf(t) >= 0 ? ' checked' : '') + ' /> ' + t + '</label>';
        }).join('') + '</div></div>' +
      '<div class="form-group" style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">' +
        '<label class="checkbox-item"><input type="checkbox" id="cfgAutoSave"' + (state.config.autoSave ? ' checked' : '') + ' /> ' + t('autoSave') + '</label>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;margin-left:24px">' + t('autoSaveDesc') + '</div>' +
      '</div>';
    var selectBtn = $('selectWorkDirBtn');
    if (selectBtn) {
      selectBtn.onclick = async function() {
        var dir = await window.api.invoke('select-folder');
        if (dir) { state.workDir = dir; $('cfgWorkDir').value = dir; loadFileTree(); }
      };
    }
    content.querySelectorAll('.tool-check').forEach(function(cb) {
      cb.onchange = function() {
        if (this.checked) { if (state.allowedTools.indexOf(this.value) < 0) state.allowedTools.push(this.value); }
        else { state.allowedTools = state.allowedTools.filter(function(t) { return t !== cb.value; }); }
      };
    });
    // 语言切换
    content.querySelectorAll('.lang-btn').forEach(function(btn) {
      btn.onclick = function() {
        var lang = this.getAttribute('data-lang');
        window.api.invoke('set-config', 'language', lang);
        state.config.language = lang;
        showToast(lang === 'zh' ? '已切换到中文' : 'Switched to English');
        applyLanguage();
        renderSettingsTab('general');
      };
    });
    // 自定义 system prompt 保存
    var savePromptBtn = $('saveCustomPromptBtn');
    if (savePromptBtn) {
      savePromptBtn.onclick = async function() {
        var val = $('cfgCustomPrompt').value;
        await window.api.invoke('set-config', 'customSystemPrompt', val);
        state.config.customSystemPrompt = val;
        showToast('自定义提示词已保存，下次对话生效', 'success');
      };
    }
    // autoSave 切换
    var autoSaveCb = $('cfgAutoSave');
    if (autoSaveCb) {
      autoSaveCb.onchange = async function() {
        var val = this.checked;
        await window.api.invoke('set-config', 'autoSave', val);
        state.config.autoSave = val;
        if (val) startAutoSaveTimer(); else stopAutoSaveTimer();
        showToast(val ? t('autoSave') + ' 已开启' : t('autoSave') + ' 已关闭', 'success');
      };
    }

    // 清除缓存
    var cacheSection = document.createElement('div');
    cacheSection.style.cssText = 'border-top:1px solid var(--border);padding-top:16px;margin-top:16px';
    cacheSection.innerHTML =
      '<div style="font-size:13px;font-weight:600;margin-bottom:12px">' + t('clearCache') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        '<button class="btn-sm" id="clearImagesBtn" style="border-color:var(--accent-red);color:var(--accent-red)">' + t('clearPastedImages') + '</button>' +
        '<button class="btn-sm" id="clearConversationsBtn" style="border-color:var(--accent-red);color:var(--accent-red)">' + t('clearConversations') + '</button>' +
        '<button class="btn-sm" id="clearAllCacheBtn" style="border-color:var(--accent-red);color:var(--accent-red)">' + t('clearAllCache') + '</button>' +
      '</div>';
    content.appendChild(cacheSection);

    function wireClearBtn(id, cacheType) {
      var btn = $(id);
      if (!btn) return;
      btn.onclick = async function() {
        if (!confirm(t('clearConfirm'))) return;
        await window.api.invoke('clear-cache', cacheType);
        if (cacheType === 'conversations' || cacheType === 'all') {
          state.conversations = [];
          state.currentConversation = null;
          renderConversations();
          renderChat();
        }
        showToast(t('cacheCleared'), 'success');
      };
    }
    wireClearBtn('clearImagesBtn', 'pasted-images');
    wireClearBtn('clearConversationsBtn', 'conversations');
    wireClearBtn('clearAllCacheBtn', 'all');

  } else if (tab === 'logs') {
    content.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">' +
        '<input id="logSearchInput" type="text" placeholder="' + t('logSearch') + '" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-size:13px;outline:none" />' +
        '<button class="btn-sm" id="refreshLogsBtn">' + t('refreshLogs') + '</button>' +
        '<button class="btn-sm" id="exportLogsBtn">' + t('exportLogs') + '</button>' +
        '<button class="btn-sm" id="clearLogsBtn" style="border-color:var(--accent-red);color:var(--accent-red)">' + t('clearLogs') + '</button>' +
      '</div>' +
      '<pre id="logViewer" style="' +
        'background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);' +
        'padding:12px;font-family:var(--font-mono);font-size:11px;line-height:1.5;' +
        'overflow:auto;height:420px;white-space:pre-wrap;word-break:break-all;margin:0' +
      '">' + t('noLogs') + '</pre>' +
      '<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">' +
        t('logsPath') + ': <span id="logsPathDisplay"></span>' +
      '</div>';

    async function loadLogs(search) {
      var viewer = $('logViewer');
      if (!viewer) return;
      var result = await window.api.invoke('get-logs', { lines: 500, search: search || '' });
      if (result && result.lines && result.lines.length > 0) {
        viewer.textContent = result.lines.join('\n');
        viewer.scrollTop = viewer.scrollHeight;
      } else {
        viewer.textContent = t('noLogs');
      }
      var pathDisplay = $('logsPathDisplay');
      if (pathDisplay && result && result.path) pathDisplay.textContent = result.path;
    }

    loadLogs();

    var refreshBtn = $('refreshLogsBtn');
    if (refreshBtn) refreshBtn.onclick = function() {
      loadLogs($('logSearchInput') ? $('logSearchInput').value : '');
    };

    var clearBtn = $('clearLogsBtn');
    if (clearBtn) clearBtn.onclick = async function() {
      if (!confirm(t('clearConfirm'))) return;
      await window.api.invoke('clear-logs');
      showToast(t('logsCleared'), 'success');
      loadLogs();
    };

    var exportBtn = $('exportLogsBtn');
    if (exportBtn) exportBtn.onclick = async function() {
      var result = await window.api.invoke('export-logs');
      if (result && result.success) {
        showToast('日志已导出: ' + result.path, 'success');
      } else if (result && result.error) {
        showToast('导出失败: ' + result.error, 'error');
      }
    };

    var searchInput = $('logSearchInput');
    if (searchInput) {
      var searchTimer = null;
      searchInput.oninput = function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function() { loadLogs(searchInput.value); }, 300);
      };
    }
  } else if (tab === 'tokens') {
    function _fmtTok(n) {
      if (!n || n === 0) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }
    function toLocalDay(isoStr) {
      var d = typeof isoStr === 'string' ? new Date(isoStr) : isoStr;
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function computeTokenStats() {
      var dayMap = {};
      state.conversations.forEach(function(c) {
        var hasMsgData = false;
        c.messages.forEach(function(m) {
          if (!m.timestamp) return;
          if (!m.inputTokens && !m.outputTokens) return;
          var day = toLocalDay(m.timestamp);
          if (!dayMap[day]) dayMap[day] = { tokens: 0, convSet: {} };
          dayMap[day].tokens += (m.inputTokens || 0) + (m.outputTokens || 0);
          dayMap[day].convSet[c.id] = true;
          hasMsgData = true;
        });
        if (!hasMsgData && c.createdAt && (c.totalInputTokens || c.totalOutputTokens)) {
          var day = toLocalDay(c.createdAt);
          if (!dayMap[day]) dayMap[day] = { tokens: 0, convSet: {} };
          dayMap[day].tokens += (c.totalInputTokens || 0) + (c.totalOutputTokens || 0);
          dayMap[day].convSet[c.id] = true;
        }
      });
      Object.keys(dayMap).forEach(function(d) {
        dayMap[d].convCount = Object.keys(dayMap[d].convSet).length;
        delete dayMap[d].convSet;
      });
      return dayMap;
    }
    var stats = computeTokenStats();
    var today = new Date();
    var todayStr = toLocalDay(today);
    var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayStr = toLocalDay(yesterday);
    var d30 = new Date(today); d30.setDate(d30.getDate() - 30);
    var d30Str = toLocalDay(d30);
    function di(dayStr) {
      var d = stats[dayStr];
      return { tokens: d ? d.tokens : 0, convs: d ? d.convCount : 0 };
    }
    var ti = di(todayStr), yi = di(yesterdayStr);
    var l30t = 0, l30c = 0;
    Object.keys(stats).forEach(function(d) {
      if (d >= d30Str) { l30t += stats[d].tokens; l30c += stats[d].convCount; }
    });
    var html = '<div class="token-summary-row">' +
      '<div class="token-summary-card"><div class="tsc-label">' + t('today') + '</div><div class="tsc-value">' + _fmtTok(ti.tokens) + '</div><div class="tsc-sub">' + ti.convs + ' ' + t('sessions') + '</div></div>' +
      '<div class="token-summary-card"><div class="tsc-label">' + t('yesterday') + '</div><div class="tsc-value">' + _fmtTok(yi.tokens) + '</div><div class="tsc-sub">' + yi.convs + ' ' + t('sessions') + '</div></div>' +
      '<div class="token-summary-card"><div class="tsc-label">' + t('last30d') + '</div><div class="tsc-value">' + _fmtTok(l30t) + '</div><div class="tsc-sub">' + l30c + ' ' + t('sessions') + '</div></div>' +
      '</div>';
    var hasData = Object.keys(stats).length > 0;
    if (!hasData) {
      html += '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);font-size:13px">暂无 token 统计</div>';
      content.innerHTML = html;
    } else {
      var endDate = new Date(today);
      var startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 7);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      var weeks = [];
      var cursor = new Date(startDate);
      while (cursor <= endDate) {
        var week = [];
        for (var i = 0; i < 7; i++) {
          var d = new Date(cursor);
          d.setDate(d.getDate() + i);
          var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          week.push({ date: d, dayStr: ds, data: stats[ds] || null });
        }
        weeks.push(week);
        cursor.setDate(cursor.getDate() + 7);
      }
      var maxTokens = 1;
      Object.keys(stats).forEach(function(d) { if (stats[d].tokens > maxTokens) maxTokens = stats[d].tokens; });
      var lang = (state.config && state.config.language) || 'zh';
      var dayLabels = lang === 'zh' ? ['日','一','二','三','四','五','六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var monthLabels = [];
      var lastYear = null;
      for (var w = 0; w < weeks.length; w++) {
        var fd = weeks[w][0].date;
        var m = fd.getMonth(), y = fd.getFullYear();
        if (w === 0 || weeks[w-1][0].date.getMonth() !== m) {
          monthLabels.push(y !== lastYear ? (y + '/' + (m + 1)) : String(m + 1));
          lastYear = y;
        } else { monthLabels.push(''); }
      }
      function getLevel(tokens) {
        if (!tokens || tokens === 0) return 0;
        var r = tokens / maxTokens;
        if (r <= 0.1) return 1; if (r <= 0.25) return 2; if (r <= 0.5) return 3; if (r <= 0.75) return 4;
        return 5;
      }
      html += '<div class="heatmap-section-title">' + t('tokenStats') + '</div>';
      html += '<div class="heatmap-wrapper">';
      html += '<div class="heatmap-month-row"><span class="heatmap-spacer"></span>';
      for (var w = 0; w < weeks.length; w++) {
        html += '<span class="heatmap-month-label">' + esc(monthLabels[w]) + '</span>';
      }
      html += '</div>';
      for (var row = 0; row < 7; row++) {
        html += '<div class="heatmap-row">';
        html += '<span class="heatmap-day-label">' + dayLabels[row] + '</span>';
        for (var w = 0; w < weeks.length; w++) {
          var cell = weeks[w][row];
          var level = getLevel(cell.data ? cell.data.tokens : 0);
          var tokenStr = cell.data ? _fmtTok(cell.data.tokens) : '0';
          var convStr = cell.data ? cell.data.convCount : '0';
          html += '<span class="heatmap-cell lv' + level + '" title="日期: ' + cell.dayStr + '&#10;' + tokenStr + ' tokens&#10;' + convStr + ' ' + t('sessions') + '"></span>';
        }
        html += '</div>';
      }
      html += '<div class="heatmap-legend-row">' +
        '<span style="font-size:11px;color:var(--text-secondary);margin-right:6px">' + t('less') + '</span>' +
        '<span class="heatmap-cell lv0"></span><span class="heatmap-cell lv1"></span>' +
        '<span class="heatmap-cell lv2"></span><span class="heatmap-cell lv3"></span>' +
        '<span class="heatmap-cell lv4"></span><span class="heatmap-cell lv5"></span>' +
        '<span style="font-size:11px;color:var(--text-secondary);margin-left:6px">' + t('more') + '</span></div>';
      html += '</div>';
      content.innerHTML = html;
    }
  } else if (tab === 'about') {
    (async function() {
      var ver = await window.api.invoke('get-app-version');
      content.innerHTML =
        '<div style="text-align:center;padding:40px 20px">' +
          '<img src="' + await window.api.invoke('get-app-icon', 64) + '" style="width:64px;height:64px;border-radius:12px;margin-bottom:16px" />' +
          '<h2 style="margin:0 0 4px">cc-wrap</h2>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">' + t('appVersion') + ' ' + esc(ver) + '</div>' +
          '<p style="font-size:13px;color:var(--text-secondary);max-width:360px;margin:0 auto 24px;line-height:1.6">' + t('appDescription') + '</p>' +
          '<a href="#" id="aboutGitHubLink" style="color:var(--accent);font-size:13px">' + t('githubRepo') + '</a>' +
        '</div>';
      var ghLink = $('aboutGitHubLink');
      if (ghLink) ghLink.onclick = function(e) {
        e.preventDefault();
        window.api.invoke('open-external', 'https://github.com/luokexiaoguo/cc-wrap');
      };
    })();
  }
}

function renderModelList() {
  var area = $('modelListArea');
  if (!area) return;
  var models = state.config.models || [];
  if (models.length === 0) { area.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">' + t('noModels') + '</div>'; return; }
  area.innerHTML = models.map(function(m, i) {
    return '<div class="model-card" data-idx="' + i + '">' +
      '<div class="model-card-info">' +
        '<div class="model-card-name">' + esc(m.name) + '</div>' +
        '<div class="model-card-detail">ID: ' + esc(m.id) + '</div>' +
        '<div class="model-card-detail">' + t('apiEndpoint') + ': ' + esc(m.endpoint || t('endpointDefault')) + '</div>' +
        '<div class="model-card-detail">' + t('apiKeyModel') + ': ' + (m.apiKey ? t('keySet') : '<span style="color:var(--accent-red)">' + t('keyNotSet') + '</span>') + '</div>' +
        (m.temperature != null ? '<div class="model-card-detail">Temp: ' + m.temperature + '</div>' : '') +
        (m.reasoningEffort && m.reasoningEffort !== 'off' ? '<div class="model-card-detail">' + t('reasoningEffort') + ': ' + t('effort' + m.reasoningEffort.charAt(0).toUpperCase() + m.reasoningEffort.slice(1)) + '</div>' : '') +
      '</div>' +
      '<div class="model-card-actions">' +
        '<button class="btn-sm" data-edit="' + i + '">' + t('editModel') + '</button>' +
        '<button class="btn-sm" data-remove="' + i + '" style="color:var(--accent-red)">' + t('deleteModel') + '</button>' +
      '</div></div>';
  }).join('');

  area.querySelectorAll('[data-remove]').forEach(function(btn) {
    btn.onclick = async function() {
      var idx = parseInt(this.getAttribute('data-remove'));
      if (!confirm(t('confirmDelete') + ' "' + models[idx].name + '"？')) return;
      await window.api.invoke('remove-model', idx);
      state.config.models = await window.api.invoke('get-models');
      rebuildModelList();
      renderModelSelect();
      renderModelList();
    };
  });

  area.querySelectorAll('[data-edit]').forEach(function(btn) {
    btn.onclick = function() {
      var idx = parseInt(this.getAttribute('data-edit'));
      openEditModelModal(idx);
    };
  });
}

function rebuildModelList() {
  state.models = [];
  if (state.config.models) {
    for (var i = 0; i < state.config.models.length; i++) {
      var m = state.config.models[i];
      state.models.push({ name: m.name, id: m.id, endpoint: m.endpoint, apiKey: m.apiKey, provider: m.provider, maxTokens: m.maxTokens, temperature: m.temperature, reasoningEffort: m.reasoningEffort || 'off' });
    }
  }
}

function openEditModelModal(idx) {
  var m = state.config.models[idx];
  if (!m) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div class="modal">' +
      '<div class="modal-header"><h3>' + t('editModel') + '</h3><button class="btn-icon edit-close-btn">✕</button></div>' +
      '<div class="form-group"><label>' + t('modelName') + '</label><input id="editModelName" value="' + esc(m.name) + '" /></div>' +
      '<div class="form-group"><label>' + t('modelId') + '</label><input id="editModelId" value="' + esc(m.id) + '" /></div>' +
      '<div class="form-group"><label>' + t('apiEndpoint') + '</label><input id="editModelEndpoint" value="' + esc(m.endpoint || '') + '" placeholder="https://api.example.com" /></div>' +
      '<div class="form-group"><label>' + t('apiKeyModel') + '</label><input type="password" id="editModelApiKey" value="' + esc(m.apiKey || '') + '" /></div>' +
      '<div class="form-row"><div class="form-group"><label>' + t('maxTokens') + '</label><input type="number" id="editModelMaxTokens" value="' + (m.maxTokens || '') + '" placeholder="默认" /></div>' +
      '<div class="form-group"><label>' + t('reasoningEffort') + '</label><select id="editModelReasoningEffort" style="width:100%;padding:6px;border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border)">' +
        '<option value="off"' + (m.reasoningEffort === 'off' || !m.reasoningEffort ? ' selected' : '') + '>' + t('effortOff') + '</option>' +
        '<option value="low"' + (m.reasoningEffort === 'low' ? ' selected' : '') + '>' + t('effortLow') + '</option>' +
        '<option value="medium"' + (m.reasoningEffort === 'medium' ? ' selected' : '') + '>' + t('effortMedium') + '</option>' +
        '<option value="high"' + (m.reasoningEffort === 'high' ? ' selected' : '') + '>' + t('effortHigh') + '</option>' +
      '</select></div></div>' +
      '<div class="form-group"><label>' + t('temperature') + '</label><input type="range" id="editModelTemperature" min="0" max="2" step="0.05" value="' + (m.temperature ?? state.config.temperature ?? 0.7) + '" style="width:120px;vertical-align:middle" />' +
      ' <span id="editModelTemperatureVal" style="font-size:13px;color:var(--text-secondary)">' + (m.temperature ?? state.config.temperature ?? 0.7) + '</span></div>' +
      '<div class="modal-actions">' +
        '<button class="btn-secondary edit-cancel-btn">取消</button>' +
        '<button class="btn-primary edit-save-btn">' + t('saveConfig') + '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  overlay.querySelector('.edit-close-btn').onclick = function() { overlay.remove(); };
  overlay.querySelector('.edit-cancel-btn').onclick = function() { overlay.remove(); };
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  setupTempSlider('editModelTemperature', 'editModelTemperatureVal');

  overlay.querySelector('.edit-save-btn').onclick = async function() {
    var name = $('editModelName').value.trim();
    var id = $('editModelId').value.trim();
    var endpoint = $('editModelEndpoint').value.trim();
    var apiKey = $('editModelApiKey').value.trim();
    if (!name || !id) { alert(t('fillNameId')); return; }

    var editMaxTokens = parseInt($('editModelMaxTokens').value) || undefined;
    var editTemperature = parseFloat($('editModelTemperature').value);
    var editReasoningEffort = $('editModelReasoningEffort') ? $('editModelReasoningEffort').value : 'off';
    var models = state.config.models.slice();
    models[idx] = { provider: models[idx].provider || 'custom', name: name, id: id, endpoint: endpoint, apiKey: apiKey, maxTokens: editMaxTokens, temperature: editTemperature, reasoningEffort: editReasoningEffort };
    await window.api.invoke('set-config', 'models', models);
    state.config.models = models;
    rebuildModelList();
    renderModelSelect();
    renderModelList();
    overlay.remove();
    showToast(t('saved'));
  };
}

// 记忆管理
function openMemory() {
  $('memoryModal').style.display = 'flex';
  renderMemoryList();
}

function renderMemoryList() {
  var list = $('memoryList');
  if (!list) return;
  if (state.memories.length === 0) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:12px">暂无记忆<br>对话中提取的关键信息会自动保存</div>';
    return;
  }
  list.innerHTML = state.memories.map(function(m, i) {
    var sourceTag = m.source === 'auto'
      ? '<span class="memory-source auto">自动</span>'
      : '<span class="memory-source manual">手动</span>';
    return '<div class="memory-item" data-idx="' + i + '">' +
      '<div class="memory-item-row">' +
      sourceTag +
      '<span class="memory-text">' + esc(m.content) + '</span>' +
      '</div>' +
      '<button class="memory-del" data-idx="' + i + '">✕</button>' +
    '</div>';
  }).join('');

  list.querySelectorAll('.memory-del').forEach(function(btn) {
    btn.onclick = function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      state.memories.splice(idx, 1);
      renderMemoryList();
      window.api.invoke('save-memory', { memories: state.memories });
    };
  });
}

function addMemory() {
  var input = $('memoryInput');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  state.memories.push({ content: text, source: 'manual', createdAt: Date.now() });
  input.value = '';
  renderMemoryList();
  window.api.invoke('save-memory', { memories: state.memories });
}

async function saveMemoryContent() {
  await window.api.invoke('save-memory', { memories: state.memories });
  $('memoryModal').style.display = 'none';
}

function clearAllMemory() {
  if (!confirm('确定清空所有记忆？')) return;
  state.memories = [];
  renderMemoryList();
  window.api.invoke('save-memory', { memories: state.memories });
}

// 从 URL 自动尝试添加 MCP 服务器
async function tryMcpFromUrl(url) {
  try {
    var result = await window.api.invoke('add-mcp-from-url', url);
    if (result.success) {
      showToast(result.message);
    }
    // 不管成功失败都不阻塞，URL 照常发给 AI
  } catch (e) {
    // 静默失败
  }
}

// MCP 服务器管理
async function openMcpModal() {
  $('mcpModal').style.display = 'flex';
  // 请求最新状态
  try {
    state.mcpStatuses = await window.api.invoke('mcp-status');
  } catch(e) {}
  renderMcpList();
}

function renderMcpList() {
  var area = $('mcpServerList');
  if (!area) return;
  if (state.mcpServers.length === 0) {
    area.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:12px;text-align:center">暂无 MCP 服务器<br><span style="font-size:11px">添加后启动时自动连接</span></div>';
    return;
  }

  // 获取连接状态
  var statuses = state.mcpStatuses || [];

  area.innerHTML = state.mcpServers.map(function(s, i) {
    var status = statuses.find(function(st) { return st.name === s.name; });
    var isConnected = status && status.connected;
    var toolCount = status ? status.toolCount : 0;
    var tools = status ? status.tools : [];

    var statusHtml = isConnected
      ? '<span class="mcp-status connected">已连接 (' + toolCount + ' 工具)</span>'
      : '<span class="mcp-status disconnected">未连接</span>';

    var toolsHtml = tools.length > 0
      ? '<div class="mcp-tool-list">' + tools.map(function(t) { return '<span class="mcp-tool-tag">' + esc(t) + '</span>'; }).join('') + '</div>'
      : '';

    var connectBtn = isConnected
      ? '<button class="btn-sm mcp-disconnect-btn" data-name="' + esc(s.name) + '">断开</button>'
      : '<button class="btn-sm mcp-connect-btn" data-idx="' + i + '">连接</button>';

    return '<div class="model-card">' +
      '<div class="model-card-info">' +
        '<div class="model-card-name">' + esc(s.name) + ' ' + statusHtml + '</div>' +
        '<div class="model-card-detail">命令: ' + esc(s.command) + ' ' + esc((s.args || []).join(' ')) + '</div>' +
        toolsHtml +
      '</div>' +
      '<div class="model-card-actions">' +
        connectBtn +
        '<button class="btn-sm mcp-del-btn" data-idx="' + i + '" style="color:var(--accent-red)">删除</button>' +
      '</div></div>';
  }).join('');

  // 连接按钮
  area.querySelectorAll('.mcp-connect-btn').forEach(function(btn) {
    btn.onclick = async function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      var s = state.mcpServers[idx];
      this.textContent = '连接中...';
      this.disabled = true;
      var result = await window.api.invoke('mcp-connect', s);
      if (result.success) {
        showToast('已连接 ' + s.name + ': ' + result.tools.join(', '));
      } else {
        showToast('连接失败: ' + result.error);
      }
      renderMcpList();
    };
  });

  // 断开按钮
  area.querySelectorAll('.mcp-disconnect-btn').forEach(function(btn) {
    btn.onclick = async function() {
      var name = this.getAttribute('data-name');
      await window.api.invoke('mcp-disconnect', name);
      renderMcpList();
    };
  });

  // 删除按钮
  area.querySelectorAll('.mcp-del-btn').forEach(function(btn) {
    btn.onclick = async function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      if (!confirm('确定删除 MCP 服务器 "' + state.mcpServers[idx].name + '"？')) return;
      // 如果已连接，先断开
      var status = statuses.find(function(st) { return st.name === state.mcpServers[idx].name; });
      if (status && status.connected) {
        await window.api.invoke('mcp-disconnect', state.mcpServers[idx].name);
      }
      state.mcpServers.splice(idx, 1);
      await window.api.invoke('save-mcp-servers', { servers: state.mcpServers });
      renderMcpList();
    };
  });
}

async function addMcpServer() {
  var name = $('mcpName').value.trim();
  var command = $('mcpCommand').value.trim();
  var argsText = $('mcpArgs').value.trim();
  var cwd = $('mcpCwd').value.trim();
  var envText = $('mcpEnv').value.trim();

  if (!name || !command) { alert('请填写服务器名称和启动命令'); return; }

  var args = argsText ? argsText.split('\n').filter(function(l) { return l.trim(); }) : [];
  var env = {};
  if (envText) {
    try { env = JSON.parse(envText); } catch (e) { alert('环境变量格式错误，请使用 JSON 格式'); return; }
  }

  state.mcpServers.push({ name: name, command: command, args: args, cwd: cwd, env: env });
  try {
    var saveResult = await window.api.invoke('save-mcp-servers', { servers: state.mcpServers });
    if (saveResult !== true) throw new Error('保存返回非 true');
  } catch (err) {
    // 回滚 state，避免本地有但磁盘没有
    state.mcpServers.pop();
    alert('MCP 保存失败: ' + (err && err.message || err) + '\n请检查 userData 目录权限');
    return;
  }

  $('mcpName').value = '';
  $('mcpCommand').value = '';
  $('mcpArgs').value = '';
  $('mcpCwd').value = '';
  $('mcpEnv').value = '';

  renderMcpList();
  showToast('MCP 服务器已添加并保存: ' + name);
}

async function testMcpServer() {
  var command = $('mcpCommand').value.trim();
  var argsText = $('mcpArgs').value.trim();
  var cwd = $('mcpCwd').value.trim();
  var envText = $('mcpEnv').value.trim();

  if (!command) { alert('请填写启动命令'); return; }

  var args = argsText ? argsText.split('\n').filter(function(l) { return l.trim(); }) : [];
  var env = {};
  if (envText) {
    try { env = JSON.parse(envText); } catch (e) { alert('环境变量格式错误'); return; }
  }

  var result = await window.api.invoke('test-mcp-server', { command: command, args: args, cwd: cwd, env: env });
  if (result.success) {
    alert('测试成功: ' + result.message + '\n工具: ' + (result.tools || []).join(', '));
  } else {
    alert('测试失败: ' + result.error);
  }
}

// Skills 系统
function renderSkills() {
  var list = $('skillList');
  if (!list) return;
  if (state.skills.length === 0) {
    list.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:12px;text-align:center">暂无 Skill<br>点击上方按钮添加</div>';
    return;
  }
  list.innerHTML = state.skills.map(function(s, i) {
    var src = s.source && s.source !== 'user' ? ' · ' + s.source : '';
    var trig = s.triggers && s.triggers.length > 0 ? ' · trigger: ' + s.triggers.join(', ') : '';
    var actBadge = s.alwaysActive
      ? '<span class="skill-badge skill-badge-on" title="始终激活">● 始终激活</span>'
      : (s.triggers && s.triggers.length > 0
          ? '<span class="skill-badge" title="命中触发词时激活">○ 触发激活</span>'
          : '<span class="skill-badge skill-badge-off" title="仅用 /skill 引用">○ 手动</span>');
    return '<div class="skill-item" data-idx="' + i + '">' +
      '<div class="skill-name">' + esc(s.name) + ' ' + actBadge + '</div>' +
      '<div class="skill-actions">' +
        (s.readonly ? '' :
          '<button class="btn-sm skill-toggle-btn" data-idx="' + i + '" title="' + (s.alwaysActive ? '关闭始终激活' : '设为始终激活') + '">' + (s.alwaysActive ? '⏸ 停用' : '▶ 常驻') + '</button>' +
          '<button class="btn-sm skill-edit-btn" data-idx="' + i + '" title="编辑">✎ 编辑</button>'
        ) +
        '<button class="btn-sm skill-use-btn" data-idx="' + i + '" title="在输入框插入 /skill 引用">↩ 引用</button>' +
        (s.readonly ? '' : '<button class="btn-sm skill-del-btn" data-idx="' + i + '" style="color:var(--accent-red)" title="删除">🗑 删除</button>') +
      '</div></div>';
  }).join('');

  list.querySelectorAll('.skill-use-btn').forEach(function(btn) {
    btn.onclick = function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      var skill = state.skills[idx];
      var input = $('messageInput');
      if (input) input.value = '/skill ' + skill.name + ' ';
      input.focus();
    };
  });

  list.querySelectorAll('.skill-toggle-btn').forEach(function(btn) {
    btn.onclick = async function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      state.skills[idx].alwaysActive = !state.skills[idx].alwaysActive;
      await window.api.invoke('save-skills', { skills: state.skills });
      // 重新拉一次（保留文件型 skill）
      var r = await window.api.invoke('get-skills');
      if (r && r.skills) state.skills = r.skills;
      renderSkills();
      showToast('Skill ' + state.skills[idx].name + ' 已' + (state.skills[idx].alwaysActive ? '设为始终激活' : '关闭始终激活'));
    };
  });

  list.querySelectorAll('.skill-edit-btn').forEach(function(btn) {
    btn.onclick = function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      var s = state.skills[idx];
      openSkillModal(s, idx);
    };
  });

  list.querySelectorAll('.skill-del-btn').forEach(function(btn) {
    btn.onclick = async function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      if (!confirm('确定删除 Skill "' + state.skills[idx].name + '"？')) return;
      state.skills.splice(idx, 1);
      await window.api.invoke('save-skills', { skills: state.skills });
      var r = await window.api.invoke('get-skills');
      if (r && r.skills) state.skills = r.skills;
      renderSkills();
    };
  });
}

function openSkillModal(existing, editIdx) {
  $('skillModal').style.display = 'flex';
  $('skillName').value = existing ? (existing.name || '') : '';
  $('skillDesc').value = existing ? (existing.description || existing.desc || '') : '';
  $('skillContent').value = existing ? (existing.content || '') : '';
  $('skillFilePath').value = '';
  // 触发词 + 始终激活：通过 modal 自身的 data-* 暂存
  var modal = $('skillModal');
  if (modal) {
    modal.setAttribute('data-edit-idx', editIdx == null ? '' : String(editIdx));
    modal.setAttribute('data-triggers', existing && existing.triggers ? existing.triggers.join(',') : '');
    modal.setAttribute('data-always-active', existing && existing.alwaysActive ? '1' : '');
  }
}

async function selectSkillFile() {
  var result = await window.api.invoke('read-skill-file');
  if (result) {
    $('skillFilePath').value = result.path;
    $('skillContent').value = result.content;
  }
}

async function saveSkill() {
  var name = $('skillName').value.trim();
  var desc = $('skillDesc').value.trim();
  var content = $('skillContent').value.trim();
  if (!name) { alert('请填写 Skill 名称'); return; }
  if (!content) { alert('请填写 Skill 内容'); return; }

  var modal = $('skillModal');
  var editIdx = modal ? parseInt(modal.getAttribute('data-edit-idx') || '', 10) : NaN;
  var triggers = (modal && modal.getAttribute('data-triggers') || '').split(',').map(function(t){return t.trim();}).filter(Boolean);
  // 给"始终激活"加个浮层勾选：复用旁边一个 prompt（简化先弹个 confirm）
  var alwaysActive = !!(modal && modal.getAttribute('data-always-active'));
  // 新建时让用户选一下要不要始终激活
  if (isNaN(editIdx)) {
    alwaysActive = confirm('设为"始终激活"吗？\n确定 = 是（每次对话自动注入此 Skill）\n取消 = 否（仅在 /skill 引用或匹配 triggers 时激活）');
  }
  var triggerInput = prompt('触发词（逗号分隔，不需要则留空）。例如:\n  image,识图,搜索', triggers.join(','));
  if (triggerInput != null) triggers = triggerInput.split(',').map(function(t){return t.trim();}).filter(Boolean);

  var newSkill = { name: name, description: desc, desc: desc, content: content, triggers: triggers, alwaysActive: alwaysActive };
  if (!isNaN(editIdx) && editIdx >= 0 && state.skills[editIdx]) {
    state.skills[editIdx] = Object.assign({}, state.skills[editIdx], newSkill);
  } else {
    var existing = state.skills.findIndex(function(s) { return s.name === name; });
    if (existing >= 0) {
      if (!confirm('Skill "' + name + '" 已存在，是否覆盖？')) return;
      state.skills[existing] = Object.assign({}, state.skills[existing], newSkill);
    } else {
      state.skills.push(newSkill);
    }
  }

  await window.api.invoke('save-skills', { skills: state.skills });
  // 重新拉一次（吸收文件型 skill）
  var r = await window.api.invoke('get-skills');
  if (r && r.skills) state.skills = r.skills;
  $('skillModal').style.display = 'none';
  renderSkills();
  $('messageInput').focus();
  showToast('Skill 已保存: ' + name);
}

// 模型选择
function renderModelSelect() {
  var select = $('modelSelect');
  if (!select) return;
  if (!state.models || state.models.length === 0) {
    select.innerHTML = '<option value="" disabled selected>请在设置中添加模型</option>';
    return;
  }
  select.innerHTML = state.models.map(function(m) {
    return '<option value="' + m.id + '"' + (m.id === state.config.defaultModel ? ' selected' : '') + '>' + m.name + '</option>';
  }).join('');
}

// 启动
init();
