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
