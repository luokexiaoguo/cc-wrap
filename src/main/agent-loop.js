// 核心 Agent 循环引擎
// 在主进程中运行，通过 IPC 向渲染进程推送流式事件

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

// 始终允许的工具（会话级别）
const alwaysAllowedTools = new Set();

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

  // 存储活跃循环
  const cancelToken = { cancelled: false };
  activeLoops.set(loopId, cancelToken);

  try {
    // 1. 构建系统提示
    const system = buildSystemPrompt({
      workDir,
      // TODO: 从存储读取记忆和技能
      memories: [],
      activeSkills: []
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
      let stopReason = 'end_turn';
      let usage = {};

      try {
        await callAPIStream(
          currentMessages,
          tools,
          system,
          config,
          {
            onText: (text) => {
              fullText += text;
              sendToRenderer(mainWindow, 'agent-stream-text', { text, round });
            },
            onToolUse: (id, name, input) => {
              toolCalls.push({ id, name, input });
              sendToRenderer(mainWindow, 'agent-stream-tool-start', {
                id,
                name,
                input,
                round
              });
            },
            onComplete: (reason, u) => {
              stopReason = reason;
              usage = u;
              // 累积 token 使用量
              if (u.input_tokens) totalUsage.input_tokens += u.input_tokens;
              if (u.output_tokens) totalUsage.output_tokens += u.output_tokens;
            }
          }
        );
      } catch (err) {
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
        currentMessages.push({
          role: 'assistant',
          content: assistantContent
        });
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

        // 执行工具
        console.log(`[Agent Loop] 执行工具: ${tc.name}`, tc.input);
        const result = await executeTool(tc.name, tc.input);

        const resultContent = result.error
          ? `错误: ${result.error}`
          : (result.content || JSON.stringify(result));

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: resultContent
        });

        sendToRenderer(mainWindow, 'agent-stream-tool-result', {
          id: tc.id,
          name: tc.name,
          result: resultContent,
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

    // 发送权限请求
    sendToRenderer(mainWindow, 'agent-permission-request', {
      requestId,
      toolName,
      input,
      loopId
    });

    // 监听权限响应（一次性）
    const { ipcMain } = require('electron');
    const handler = (event, responseId, permitted) => {
      if (responseId === requestId) {
        ipcMain.removeListener('agent-permission-response', handler);
        // 如果用户选择"始终允许"，加入授权列表
        if (permitted === 'always') {
          alwaysAllowedTools.add(toolName);
          console.log(`[Agent Loop] 工具 ${toolName} 已加入始终允许列表`);
          resolve(true);
        } else {
          resolve(permitted);
        }
      }
    };
    ipcMain.on('agent-permission-response', handler);

    // 超时自动拒绝（30秒）
    setTimeout(() => {
      ipcMain.removeListener('agent-permission-response', handler);
      resolve(false);
    }, 30000);
  });
}

/**
 * 取消运行中的 Agent 循环
 */
function cancelAgentLoop(loopId) {
  const loop = activeLoops.get(loopId);
  if (loop) {
    loop.cancelled = true;
    return true;
  }
  return false;
}

module.exports = { runAgentLoop, cancelAgentLoop };
