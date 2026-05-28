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

// 自动续推：模型停止出 tool_call 时的最大重试次数（大上下文模型需要更多次）
function getMaxContinueRetries(model) {
  if (!model) return 3;
  const m = model.toLowerCase();
  if (m.includes('minimax') || m.includes('m2.7')) return 6;
  return 3;
}

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
      temperature: apiConfig.temperature ?? 0.7,
      reasoningEffort: apiConfig.reasoningEffort || null
    };

    if (!config.apiKey) {
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    // 4. 主循环
    let currentMessages = [...messages];
    let round = 0;
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    // 卡住检测：滑动窗口追踪最近 8 轮的失败率
    let roundHistory = [];
    let stuckHintInjected = false;

    // 自动续推计数器（模型输出过短时自动推进）
    let continueRetries = 0;

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

      // 检查上下文窗口，动态阈值压缩
      const estimatedTokens = estimateTokens(currentMessages);
      const compressionThreshold = getCompressionThreshold(apiConfig.model);
      if (estimatedTokens > compressionThreshold) {
        console.log(`[Agent Loop] 上下文过长 (${estimatedTokens} tokens，阈值 ${compressionThreshold})，自动压缩...`);
        sendToRenderer(mainWindow, 'agent-compressing', { compressing: true });
        currentMessages = await compactMessages(mainWindow, currentMessages, config, estimatedTokens);
        sendToRenderer(mainWindow, 'agent-compressing', { compressing: false });
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
              // 优先使用 API 返回的 usage，缺失时按字符数估算
              if (u && (u.input_tokens || u.output_tokens)) {
                totalUsage.input_tokens += u.input_tokens || 0;
                totalUsage.output_tokens += u.output_tokens || 0;
              } else {
                totalUsage.input_tokens += estimateTokens(currentMessages);
                const chineseOut = (fullText.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
                totalUsage.output_tokens += Math.ceil(chineseOut * 1.5 + (fullText.length - chineseOut) / 4);
              }
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
        // 自动续推：仅当模型几乎没有文本输出（<200字符，说明可能卡住了）
        // 且之前有过工具调用时，才自动推进。模型已经给出完整回答时不续推。
        const hadToolCalls = roundHistory.some(r => r.count > 0);
        const maxContinue = getMaxContinueRetries(apiConfig.model);
        const shortResponse = !fullText || fullText.length < 200;
        if (hadToolCalls && shortResponse && continueRetries < maxContinue && roundHistory.length > 0 && !cancelToken.cancelled) {
          continueRetries++;
          // 使用 system 角色注入而非 user，避免污染对话记录
          console.log(`[Agent Loop] 自动续推 (${continueRetries}/${maxContinue}): 模型输出过短(${fullText ? fullText.length : 0}字符)，继续推进`);
          currentMessages.push({ role: 'user', content: '请继续执行之前的任务。' });
          round++;
          continue;
        }
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

        // 截断过大的工具结果，避免撑爆上下文
        // 普通结果 1500 字符截断，错误结果 600 字符截断（错误信息通常前三行就能说明问题）
        const truncateLimit = result.error ? 600 : 1500;
        const truncated = typeof resultContent === 'string' && resultContent.length > truncateLimit
          ? resultContent.substring(0, truncateLimit) + `\n... [结果过长，省略 ${resultContent.length - truncateLimit} 字符]`
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

        // 卡住检测：滑动窗口统计最近 8 轮的失败率
        // 相比"连续失败计数"，滑动窗口更能捕捉"大多数尝试都在失败"的模式
        // 即使偶尔成功一轮也不会重置计数
        const roundFailed = toolResults.some(r => typeof r.content === 'string' && r.content.startsWith('错误:'));
        const currentFamily = toolCalls.length > 0 ? _toolFamily(toolCalls[0].name, toolCalls[0].input) : '';
        roundHistory.push({ failed: roundFailed, family: currentFamily, count: toolCalls.length });
        if (roundHistory.length > 8) roundHistory.shift();

        const failRounds = roundHistory.filter(r => r.failed).length;
        const allSameFamily = roundHistory.length > 2 && roundHistory.every(r => r.family === roundHistory[0].family);
        const hint = _checkStuckSliding(failRounds, roundHistory.length, allSameFamily);
        if (hint && !stuckHintInjected) {
          console.log(`[Agent Loop] 检测到卡住（滑动窗口 ${failRounds}/${roundHistory.length} 轮失败），注入策略提示`);
          stuckHintInjected = true;
          currentMessages.push({
            role: 'user',
            content: [{ type: 'text', text: hint }]
          });
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
 * 检测是否"卡住"了：滑动窗口中失败率过半且至少失败 3 轮
 */
function _checkStuckSliding(failRounds, totalRounds, allSameFamily) {
  if (failRounds < 3 || failRounds / totalRounds < 0.5) return '';
  const familyHint = allSameFamily ? '（大多数都是同一类工具）' : '';
  return `[系统提示] 最近 ${totalRounds} 轮中有 ${failRounds} 轮工具调用失败${familyHint}。请立即停止当前策略，换一种完全不同的方法，或直接告知用户失败原因。不要再重复尝试类似的操作。`;
}

/**
 * 估算消息的 token 数量（中文字符 ~1.5 token/字，英文 ~0.25 token/字符）
 */
function estimateTokens(messages) {
  let totalChars = 0;
  let chineseChars = 0;
  for (const msg of messages) {
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') text += block.text;
        else if (block.type === 'tool_result') text += (block.content || '');
        else if (block.type === 'tool_use') text += JSON.stringify(block.input);
      }
    }
    totalChars += text.length;
    chineseChars += (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
  }
  // 中文字符约 1.5 token/字，英文约 0.25 token/字符（4 字符/token）
  const nonChinese = totalChars - chineseChars;
  return Math.ceil(chineseChars * 1.5 + nonChinese / 4);
}

/**
 * 根据模型确定压缩阈值
 * 大上下文模型（如 MiniMax-M2.7 支持 1M）使用更高阈值，避免过早压缩
 */
function getCompressionThreshold(model) {
  if (!model) return 80000;
  const m = model.toLowerCase();
  // 大上下文模型（>=1M context）
  if (m.includes('minimax') || m.includes('m2.7') || m.includes('glm-4')) return 500000;
  // 中上下文模型（>=200K context 如 gemini, deepseek)
  if (m.includes('gemini') || m.includes('deepseek')) return 200000;
  // Claude 系列
  if (m.includes('claude')) return 120000;
  // 默认保守阈值
  return 80000;
}

/**
 * 压缩消息历史以适应上下文窗口
 */
async function compactMessages(mainWindow, messages, config, estimatedTokens) {
  if (messages.length < 6) return messages;

  // 根据上下文压力决定保留多少条最近消息
  let keepCount = Math.min(messages.length - 2, 16);
  // 压力越大保留越少，但比之前宽松很多
  if (estimatedTokens) {
    if (estimatedTokens < 200000) keepCount = Math.min(keepCount, 16);
    else if (estimatedTokens < 350000) keepCount = Math.min(keepCount, 12);
    else if (estimatedTokens < 500000) keepCount = Math.min(keepCount, 8);
    else keepCount = Math.min(keepCount, 6);
  }

  // 保留最近的 keepCount 条消息
  let recentMsgs = messages.slice(-keepCount);

  // 从更早的消息中找到包含实质文字内容的 assistant 回复（往前找最多 4 条）
  // 这些通常是模型输出的方案、总结、分析，不能丢
  const preservedSet = new Set();
  for (let i = messages.length - keepCount; i < messages.length; i++) {
    preservedSet.add(i);
  }
  let textAssistantAdded = 0;
  for (let i = messages.length - keepCount - 1; i >= 0 && textAssistantAdded < 4; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'text' && block.text) text += block.text;
      }
    }
    if (text.length > 80) {
      recentMsgs.unshift(m);
      preservedSet.add(i);
      textAssistantAdded++;
    }
  }

  // 同样往前找最多 2 条用户消息（包含用户提出的要求/问题）
  let userMsgAdded = 0;
  for (let i = messages.length - keepCount - 1; i >= 0 && userMsgAdded < 2; i--) {
    if (preservedSet.has(i)) continue;
    const m = messages[i];
    if (m.role !== 'user') continue;
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'text' && block.text) text += block.text;
      }
    }
    if (text.length > 30) {
      recentMsgs.unshift(m);
      preservedSet.add(i);
      userMsgAdded++;
    }
  }

  // 确定哪些消息需要被摘要
  const msgsToSummarize = messages.filter((_, i) => !preservedSet.has(i));

  // 如果被压缩的消息太少，不值得压缩
  if (msgsToSummarize.length < 3) return messages;

  // 构建摘要
  const MAX_PER_MSG = 1500;
  const summaryContent = msgsToSummarize.map(m => {
    const role = m.role === 'user' ? '用户' : '助手';
    let content = '';
    if (typeof m.content === 'string') content = m.content;
    else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'text') content += block.text;
        else if (block.type === 'tool_use') {
          content += `[工具: ${block.name}`;
          if (block.input) content += ` ${JSON.stringify(block.input).substring(0, 300)}`;
          content += ']';
        }
        else if (block.type === 'tool_result') {
          const r = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
          content += `[结果: ${r.substring(0, 300)}]`;
        }
      }
    }
    if (content.length > MAX_PER_MSG) content = content.substring(0, MAX_PER_MSG) + `...[${content.length - MAX_PER_MSG}字符略]`;
    return `${role}: ${content}`;
  }).join('\n---\n');

  const summarizePrompt = `压缩以下对话为摘要（300字内），保留：已执行的操作、用户的需求目标、做出的关键决策。\n\n${summaryContent}`;

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
      { role: 'user', content: `[${msgsToSummarize.length} 条早期对话已压缩]` },
      { role: 'assistant', content: `对话摘要：\n${summaryText}` },
      ...recentMsgs
    ];
  } catch (err) {
    console.error('[Agent Loop] 压缩失败:', err.message);
    return [
      { role: 'user', content: `[早期 ${msgsToSummarize.length} 条对话已省略]` },
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
