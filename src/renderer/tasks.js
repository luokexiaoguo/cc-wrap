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
