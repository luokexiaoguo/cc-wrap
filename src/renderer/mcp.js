// ========== MCP 服务器管理 ==========

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
