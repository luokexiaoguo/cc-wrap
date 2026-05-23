// 核心 Agent 循环引擎
// 在主进程中运行，通过 IPC 向渲染进程推送流式事件

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { buildSystemPrompt } = require('./system-prompt');
const { getEnabledTools, mergeTools } = require('./tools');
const { callAPIStream } = require('./api-client');
const { executeTool } = require('./tool-executor');

// 需要权限确认的工具
const PERMISSION_REQUIRED_TOOLS = ['Write', 'Edit', 'Bash'];

// 最大循环轮数
const MAX_ROUNDS = 50;

// 活跃的 agent loop（用于取消）
const activeLoops = new Map();

// 始终允许的工具（持久化到 electron-store 的 alwaysAllowedTools 字段）
const alwaysAllowedTools = new Set();
let _storeRef = null; // 由 main.js 通过 setPersistenceStore 注入

function setPersistenceStore(store) {
  _storeRef = store;
  try {
    const persisted = store.get('alwaysAllowedTools', []);
    if (Array.isArray(persisted)) persisted.forEach((t) => alwaysAllowedTools.add(t));
  } catch (_) {}
}

function _persistAlwaysAllowed() {
  if (!_storeRef) return;
  try { _storeRef.set('alwaysAllowedTools', Array.from(alwaysAllowedTools)); } catch (_) {}
}

/**
 * 运行 Agent 循环
 * @param {BrowserWindow} mainWindow - 主窗口
 * @param {object} options - 配置选项
 * @param {Array} options.messages - 消息历史
 * @param {string} options.systemPrompt - 额外系统提示
 * @param {object} options.apiConfig - API 配置 { model, apiKey, endpoint, maxTokens, temperature }
 * @param {string} options.workDir - 工作目录
 * @param {string} options.loopId - 循环 ID（用于取消）
 * @returns {Promise<{success: boolean, error?: string, messages?: Array}>}
 */
async function runAgentLoop(mainWindow, options) {
  const {
    messages = [],
    systemPrompt: extraSystemPrompt = '',
    apiConfig = {},
    workDir = process.cwd(),
    loopId = 'default',
    mcpTools = []
  } = options;

  // 存储活跃循环（带 AbortController 用于中断进行中的 fetch/流读取）
  const abortController = new AbortController();
  const cancelToken = { cancelled: false, abort: () => abortController.abort() };
  activeLoops.set(loopId, cancelToken);

  try {
    // 1. 构建系统提示
    // Skill 自动激活策略：
    //   - alwaysActive: true 的 skill 永远注入
    //   - triggers: [...] 包含的关键词命中"最近的用户消息正文 + 附件类型"则注入
    //   - 用户用 /skill <name> 显式引用：由渲染端在消息正文里追加，这里不再特殊处理
    const allSkills = (typeof global.__loadAllSkills === 'function')
      ? (global.__loadAllSkills() || [])
      : [];
    let triggerHaystack = '';
    try {
      // 取最后一条用户消息文本 + 是否含图片附件
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role !== 'user') continue;
        if (typeof m.content === 'string') triggerHaystack += '\n' + m.content;
        else if (Array.isArray(m.content)) {
          m.content.forEach(c => {
            if (c.type === 'text' && c.text) triggerHaystack += '\n' + c.text;
            if (c.type === 'image') triggerHaystack += '\n__has_image__';
          });
        }
        break;
      }
    } catch (_) {}
    const activeSkills = [];
    for (const s of allSkills) {
      if (!s || !s.content) continue;
      if (s.alwaysActive) { activeSkills.push(s); continue; }
      const trig = Array.isArray(s.triggers) ? s.triggers : [];
      if (trig.length === 0) continue;
      const hit = trig.some(t => {
        if (!t) return false;
        const key = String(t).toLowerCase();
        if (key === 'image' || key === '图片' || key === '识图') return triggerHaystack.indexOf('__has_image__') >= 0;
        return triggerHaystack.toLowerCase().indexOf(key) >= 0;
      });
      if (hit) activeSkills.push(s);
    }
    if (activeSkills.length > 0) {
      console.log('[Agent Loop] 激活 Skill:', activeSkills.map(s => s.name).join(', '));
    }

    const system = buildSystemPrompt({
      workDir,
      memories: loadMemories(),
      activeSkills,
      customPrompt: _storeRef ? _storeRef.get('customSystemPrompt', '') : ''
    }) + (extraSystemPrompt ? '\n\n' + extraSystemPrompt : '');

    // 2. 获取工具定义（内置 + MCP）
    const builtinTools = getEnabledTools();
    const tools = mergeTools(builtinTools, mcpTools);

    // 3. 准备 API 配置
    const config = {
      model: apiConfig.model || 'claude-3-opus-20240229',
      apiKey: apiConfig.apiKey || '',
      endpoint: apiConfig.endpoint || 'https://api.anthropic.com',
      maxTokens: apiConfig.maxTokens || 8192,
      temperature: apiConfig.temperature ?? 0.7
    };

    if (!config.apiKey) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    // 4. 主循环
    let currentMessages = [...messages];
    let round = 0;
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    // 卡住检测：连续失败追踪
    let consecutiveFails = 0;
    let lastToolFamily = '';
    let familyRounds = 0;
    let stuckHintInjected = false;

    while (round < MAX_ROUNDS) {
      if (cancelToken.cancelled) {
        sendToRenderer(mainWindow, 'agent-complete', {
          success: false,
          error: '已取消'
        });
        return { success: false, error: '已取消' };
      }

      round++;
      console.log(`[Agent Loop] 第 ${round} 轮`);

      // 检查上下文窗口，超过150K tokens时自动压缩
      const estimatedTokens = estimateTokens(currentMessages);
      if (estimatedTokens > 150000) {
        console.log(`[Agent Loop] 上下文过长 (${estimatedTokens} tokens)，自动压缩...`);
        sendToRenderer(mainWindow, 'agent-stream-text', {
          text: '\n\n[上下文过长，正在压缩对话历史...]\n\n',
          round
        });
        currentMessages = await compactMessages(mainWindow, currentMessages, config);
      }

      // 收集流式响应
      let fullText = '';
      const toolCalls = [];
      let reasoningContent = '';
      let stopReason = 'end_turn';
      let usage = {};

      // 流式文本节流：50ms 内的 chunk 合并成一次 IPC，减少渲染端事件风暴
      let pendingText = '';
      let flushTimer = null;
      const flushText = () => {
        if (!pendingText) return;
        sendToRenderer(mainWindow, 'agent-stream-text', { text: pendingText, round });
        pendingText = '';
        flushTimer = null;
      };

      try {
        await callAPIStream(
          currentMessages,
          tools,
          system,
          { ...config, signal: abortController.signal },
          {
            onText: (text) => {
              fullText += text;
              pendingText += text;
              if (!flushTimer) flushTimer = setTimeout(flushText, 50);
            },
            onToolUse: (id, name, input) => {
              // 工具调用前先把缓冲的文本 flush 到渲染端，保证顺序
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              flushText();
              toolCalls.push({ id, name, input });
              sendToRenderer(mainWindow, 'agent-stream-tool-start', {
                id,
                name,
                input,
                round
              });
            },
            onComplete: (reason, u, extra) => {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              flushText();
              stopReason = reason;
              usage = u;
              if (extra?.reasoning_content) reasoningContent = extra.reasoning_content;
              if (u.input_tokens) totalUsage.input_tokens += u.input_tokens;
              if (u.output_tokens) totalUsage.output_tokens += u.output_tokens;
            }
          }
        );
      } catch (err) {
        // 兜底：异常时也确保 pending 文本被清空
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        flushText();
        // 用户取消导致的中断不算错误
        if (cancelToken.cancelled || err.name === 'AbortError') {
          sendToRenderer(mainWindow, 'agent-complete', { success: false, error: '已取消' });
          return { success: false, error: '已取消' };
        }
        console.error('[Agent Loop] API 调用失败:', err.message);
        sendToRenderer(mainWindow, 'agent-complete', {
          success: false,
          error: `API 调用失败: ${err.message}`
        });
        return { success: false, error: err.message };
      }

      // 构建助手消息内容块
      const assistantContent = [];
      if (fullText) {
        assistantContent.push({ type: 'text', text: fullText });
      }
      for (const tc of toolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input
        });
      }

      // 添加助手消息
      if (assistantContent.length > 0) {
        const assistantMsg = {
          role: 'assistant',
          content: assistantContent
        };
        // DeepSeek 推理模式：保留 reasoning_content 供后续轮次使用
        if (reasoningContent) {
          assistantMsg.reasoning_content = reasoningContent;
        }
        currentMessages.push(assistantMsg);
      }

      // 如果没有工具调用或不是 tool_use 停止原因，结束循环
      if (toolCalls.length === 0 || stopReason !== 'tool_use') {
        sendToRenderer(mainWindow, 'agent-complete', {
          success: true,
          messages: currentMessages,
          usage: totalUsage
        });
        return { success: true, messages: currentMessages, usage: totalUsage };
      }

      // 5. 执行工具调用
      const toolResults = [];

      for (const tc of toolCalls) {
        if (cancelToken.cancelled) break;

        // 检查权限（跳过已授权的工具）
        if (PERMISSION_REQUIRED_TOOLS.includes(tc.name) && !alwaysAllowedTools.has(tc.name)) {
          const permitted = await requestPermission(mainWindow, tc.name, tc.input, loopId);
          if (!permitted) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: '用户拒绝了此操作'
            });
            sendToRenderer(mainWindow, 'agent-stream-tool-result', {
              id: tc.id,
              name: tc.name,
              result: '用户拒绝了此操作',
              error: true,
              round
            });
            continue;
          }
        }

        // 执行工具（传入工作目录、shell 配置和取消信号）
        console.log(`[Agent Loop] 执行工具: ${tc.name}`, tc.input);
        const result = await executeTool(tc.name, tc.input, {
          workDir,
          shell: options.shell,
          signal: abortController.signal,
          window: options.window,
          apiConfig: config,
          toolCallId: tc.id,
        });

        const resultContent = result.error
          ? `错误: ${result.error}`
          : (result.content || JSON.stringify(result));

        // 截断过大的工具结果（超过 3000 字符），避免撑爆上下文
        const truncated = typeof resultContent === 'string' && resultContent.length > 3000
          ? resultContent.substring(0, 2500) + `\n... [结果过长，省略 ${resultContent.length - 2500} 字符]`
          : resultContent;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: truncated
        });

        sendToRenderer(mainWindow, 'agent-stream-tool-result', {
          id: tc.id,
          name: tc.name,
          result: truncated,
          error: !!result.error,
          round
        });
      }

      // 添加工具结果消息
      if (toolResults.length > 0) {
        currentMessages.push({
          role: 'user',
          content: toolResults
        });

        // 卡住检测：统计连续失败的工具调用
        let roundAllFailed = toolResults.every(r => typeof r.content === 'string' && r.content.startsWith('错误:'));
        if (roundAllFailed) {
          consecutiveFails += toolResults.length;
          const currentFamily = toolCalls.length > 0 ? _toolFamily(toolCalls[0].name, toolCalls[0].input) : '';
          if (currentFamily === lastToolFamily) familyRounds++;
          else { familyRounds = 1; lastToolFamily = currentFamily; }

          const hint = _checkStuck(consecutiveFails, familyRounds, currentFamily);
          if (hint && !stuckHintInjected) {
            console.log(`[Agent Loop] 检测到卡住，注入策略提示 (连续失败: ${consecutiveFails})`);
            stuckHintInjected = true;
            currentMessages.push({
              role: 'user',
              content: [{ type: 'text', text: hint }]
            });
          }
        } else {
          consecutiveFails = 0;
          familyRounds = 0;
          lastToolFamily = '';
          stuckHintInjected = false;
        }
      }
    }

    // 超过最大轮数
    sendToRenderer(mainWindow, 'agent-complete', {
      success: false,
      error: `超过最大轮数 (${MAX_ROUNDS})`
    });
    return { success: false, error: `超过最大轮数 (${MAX_ROUNDS})` };

  } finally {
    activeLoops.delete(loopId);
  }
}

/**
 * 提取工具调用名称中的"基类"用于重复检测
 * 例如 curl、fetch、WebFetch 都归为 "http_fetch"
 */
function _toolFamily(name, input) {
  if (name === 'Bash') {
    const cmd = (typeof input === 'object' ? (input.command || '') : '').toLowerCase();
    if (cmd.includes('curl') || cmd.includes('wget') || cmd.includes('fetch')) return 'http_fetch';
    return 'bash';
  }
  if (name === 'WebFetch') return 'http_fetch';
  if (name === 'WebSearch') return 'web_search';
  return name;
}

/**
 * 检测是否"卡住"了：连续 N 轮相同类型的工具调用全部失败
 */
function _checkStuck(consecutiveFails, familyRounds, currentFamily) {
  if (consecutiveFails < 3) return '';
  return `[系统提示] 你连续 ${consecutiveFails} 次调用以错误告终${familyRounds > 0 ? `（连续 ${familyRounds} 轮调用 ${currentFamily} 类工具）` : ''}。请立即停止当前策略，换一种完全不同的方法，或直接告知用户失败原因。不要重复尝试类似的请求。`;
}

/**
 * 估算消息的 token 数量（粗略估算：1个token≈4个字符）
 */
function estimateTokens(messages) {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') totalChars += block.text.length;
        else if (block.type === 'tool_result') totalChars += (block.content || '').length;
        else if (block.type === 'tool_use') totalChars += JSON.stringify(block.input).length;
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

/**
 * 压缩消息历史以适应上下文窗口
 */
async function compactMessages(mainWindow, messages, config) {
  if (messages.length < 4) return messages;

  // 保留最后2条消息，压缩前面的消息
  const recentMsgs = messages.slice(-2);
  const msgsToSummarize = messages.slice(0, -2);

  // 构建摘要请求
  const summaryContent = msgsToSummarize.map(m => {
    const role = m.role === 'user' ? '用户' : '助手';
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content.substring(0, 300);
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'text') content += block.text.substring(0, 300);
        else if (block.type === 'tool_use') content += `[调用工具: ${block.name}]`;
        else if (block.type === 'tool_result') content += `[工具结果: ${(block.content || '').substring(0, 100)}]`;
      }
    }
    return `${role}: ${content}`;
  }).join('\n');

  const summarizePrompt = `请将以下对话压缩成简洁的摘要，保留关键信息。控制在300字以内。\n\n对话内容：\n${summaryContent}`;

  try {
    const { callAPI } = require('./api-client');
    const result = await callAPI(
      [{ role: 'user', content: [{ type: 'text', text: summarizePrompt }] }],
      null,
      '',
      { ...config, maxTokens: 500, temperature: 0.3 }
    );

    const summaryText = result.content?.[0]?.text || '对话摘要';

    return [
      { role: 'user', content: '[对话已被压缩]' },
      { role: 'assistant', content: `对话摘要：\n${summaryText}` },
      ...recentMsgs
    ];
  } catch (err) {
    console.error('[Agent Loop] 压缩失败:', err.message);
    // 压缩失败时，简单截断旧消息
    return [
      { role: 'user', content: '[早期对话已省略]' },
      ...recentMsgs
    ];
  }
}

/**
 * 向渲染进程发送 IPC 消息
 */
function sendToRenderer(mainWindow, channel, data) {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * 请求用户权限
 */
function requestPermission(mainWindow, toolName, input, loopId) {
  return new Promise((resolve) => {
    const requestId = `perm_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    sendToRenderer(mainWindow, 'agent-permission-request', {
      requestId,
      toolName,
      input,
      loopId
    });

    const { ipcMain } = require('electron');
    let timer = null;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('agent-permission-response', handler);
      if (timer) clearTimeout(timer);
    };

    const handler = (event, responseId, permitted) => {
      if (responseId !== requestId) return;
      cleanup();
      if (permitted === 'always') {
        alwaysAllowedTools.add(toolName);
        _persistAlwaysAllowed();
        console.log(`[Agent Loop] 工具 ${toolName} 已加入始终允许列表（已持久化）`);
        resolve(true);
      } else {
        resolve(permitted);
      }
    };
    ipcMain.on('agent-permission-response', handler);

    // 5 分钟无响应自动拒绝（之前 30s 太短，对话久了用户来不及看清）
    timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 5 * 60 * 1000);
  });
}

/**
 * 从持久化存储加载记忆
 */
function loadMemories() {
  try {
    const p = path.join(app.getPath('userData'), 'memory.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(data.memories) ? data.memories : [];
  } catch {
    return [];
  }
}


/**
 * 取消运行中的 Agent 循环
 */
function cancelAgentLoop(loopId) {
  const loop = activeLoops.get(loopId);
  if (loop) {
    loop.cancelled = true;
    // 立即中断进行中的 fetch / 流读取
    try { loop.abort && loop.abort(); } catch {}
    return true;
  }
  return false;
}

module.exports = { runAgentLoop, cancelAgentLoop, setPersistenceStore };
