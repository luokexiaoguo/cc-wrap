// ========== Skills 系统 ==========

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
