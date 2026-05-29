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
