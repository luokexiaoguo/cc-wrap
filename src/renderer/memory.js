// ========== 记忆管理 ==========

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
