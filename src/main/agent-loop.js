// 核心 Agent 循环引擎
// 在主进程中运行，通过 IPC 向渲染进程推送流式事件

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { buildSystemPrompt } = require('./system-prompt');
const { getEnabledTools, mergeTools } = require('./tools');
const { callAPIStream, shouldUseAnthropicFormat } = require('./api-client');
const { executeTool, taskCompleteAll } = require('./tool-executor');
const { COMPUTER_USE_TOOL_NAMES } = require('./computer-use');
const { taskQueue, QueueType } = require('./task-queue');

const PERMISSION_REQUIRED_TOOLS = ['Write', 'Edit', 'Bash', ...COMPUTER_USE_TOOL_NAMES];
const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'ListDirectory', 'WebSearch', 'WebFetch', 'GetAgentResult', 'DiscoverMcp', 'ReadImage'];

// 最大循环轮数
const MAX_ROUNDS = 50;

// 自动续推：模型停止出 tool_call 时的最大重试次数（大上下文模型需要更多次）
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
  } catch (e) { console.warn('[agent-loop] load alwaysAllowedTools failed:', e.message); }
}

function _persistAlwaysAllowed() {
  if (!_storeRef) return;
  try { _storeRef.set('alwaysAllowedTools', Array.from(alwaysAllowedTools)); } catch (e) { console.warn('[agent-loop] save alwaysAllowedTools failed:', e.message); }
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
      mcpTools,
      customPrompt: _storeRef ? _storeRef.get('customSystemPrompt', '') : ''
    }) + (extraSystemPrompt ? '\n\n' + extraSystemPrompt : '');

    // 2. 获取工具定义（内置 + MCP）
    const builtinTools = getEnabledTools();
    const computerUseEnabled = _storeRef ? _storeRef.get('computerUseEnabled', false) : false;
    const tools = mergeTools(builtinTools, mcpTools, { computerUseEnabled });

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
      // 必须发送 agent-complete，否则渲染端收不到完成事件，UI 会一直卡在"思考中"
      sendToRenderer(mainWindow, 'agent-complete', {
        success: false,
        error: '请先在设置中配置 API Key'
      });
      return { success: false, error: '请先在设置中配置 API Key' };
    }

    // 4. 主循环
    let currentMessages = [...messages];
    let round = 0;
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    // 卡住检测：滑动窗口追踪最近 8 轮的失败率
    let roundHistory = [];
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
        // 自动完成所有未完成的任务
        taskCompleteAll({ window: mainWindow });
        sendToRenderer(mainWindow, 'agent-complete', {
          success: true,
          messages: currentMessages,
          usage: totalUsage
        });
        return { success: true, messages: currentMessages, usage: totalUsage };
      }

      // 5. 执行工具调用
      // 策略：只读工具并行执行，写操作工具串行执行
      const toolResults = [];
      let rendererPayloadMcpImage = null;
      let rendererPayloadMcpImages = null;

      const allReadOnly = toolCalls.every(tc => READ_ONLY_TOOLS.includes(tc.name));

      if (allReadOnly && toolCalls.length > 1) {
        // 全部是只读工具 → 并行执行
        const promises = toolCalls.map(async (tc) => {
          if (cancelToken.cancelled) return null;
          console.log(`[Agent Loop] 并行执行工具: ${tc.name}`, tc.input);
          const result = await executeTool(tc.name, tc.input, {
            workDir,
            shell: options.shell,
            signal: abortController.signal,
            window: options.window,
            apiConfig: config,
            toolCallId: tc.id,
          });
          return { tc, result };
        });
        const settled = await Promise.allSettled(promises);
        for (const item of settled) {
          if (item.status === 'rejected' || !item.value) continue;
          const { tc, result } = item.value;

          let resultContent;
          if (result.isImage && result.image) {
            const useAnthropic = shouldUseAnthropicFormat(config.endpoint, config.model);
            if (useAnthropic) {
              resultContent = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: result.image } }, { type: 'text', text: `截图成功 (${result.width}x${result.height})` }];
            } else {
              resultContent = [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${result.image}` } }, { type: 'text', text: `截图成功 (${result.width}x${result.height})` }];
            }
          } else {
            const rawContent = result.error ? `错误: ${result.error}` : (result.content || JSON.stringify(result));

            // MCP 图片工具返回 { text, images } 结构化对象
            if (rawContent && typeof rawContent === 'object' && rawContent.images && Array.isArray(rawContent.images) && rawContent.images.length > 0) {
              const mcpImages = rawContent.images;
              resultContent = rawContent.text || `生成了 ${mcpImages.length} 张图片`;
              // 把第一张图片作为主图片传递给渲染层
              rendererPayloadMcpImage = mcpImages[0];
              rendererPayloadMcpImages = mcpImages;
            } else {
              resultContent = rawContent;
            }

            const truncateLimit = result.error ? 600 : 1500;
            if (typeof resultContent === 'string' && resultContent.length > truncateLimit) {
              resultContent = resultContent.substring(0, truncateLimit) + `\n... [结果过长，省略 ${resultContent.length - truncateLimit} 字符]`;
            }
          }

          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: resultContent });
          const displayResult = result.isImage ? `[截图 ${result.width}x${result.height}]` : (typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent));
          const rendererPayload = { id: tc.id, name: tc.name, result: displayResult, error: !!result.error, round };
          if (result.isImage && result.image) {
            rendererPayload.imageData = result.image;
            rendererPayload.imageWidth = result.width;
            rendererPayload.imageHeight = result.height;
          }
          // ReadImage 工具返回的图片（传路径，渲染端异步加载）
          if (result.imageFilePath && !result.isImage) {
            rendererPayload.imageFilePath = result.imageFilePath;
            rendererPayload.imageMimeType = result.imageMimeType || 'image/jpeg';
          } else if (result.imageData && !result.isImage) {
            rendererPayload.imageData = result.imageData;
            rendererPayload.imageMimeType = result.imageMimeType || 'image/jpeg';
          }
          // MCP 图片数据传递给渲染层
          if (rendererPayloadMcpImage) {
            rendererPayload.mcpImage = rendererPayloadMcpImage;
            rendererPayload.mcpImages = rendererPayloadMcpImages;
          }
          rendererPayloadMcpImage = null;
          rendererPayloadMcpImages = null;
          sendToRenderer(mainWindow, 'agent-stream-tool-result', rendererPayload);
        }
      } else {
        // 混合或写操作工具 → 串行执行
      for (const tc of toolCalls) {
        if (cancelToken.cancelled) break;

        // 检查权限（跳过已授权的工具）
        // Computer Use 工具强制弹窗确认（不允许"始终允许"）
        const isComputerUseTool = COMPUTER_USE_TOOL_NAMES.includes(tc.name);
        const needsPermission = PERMISSION_REQUIRED_TOOLS.includes(tc.name);
        const isAlwaysAllowed = alwaysAllowedTools.has(tc.name);

        if (needsPermission && (isComputerUseTool || !isAlwaysAllowed)) {
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

        // 处理图片返回（ComputerScreenshot 等）
        let resultContent;
        let mcpImg = null;
        let mcpImgs = null;
        if (result.isImage && result.image) {
          // 根据 API 格式返回不同格式的图片内容
          const useAnthropic = shouldUseAnthropicFormat(config.endpoint, config.model);
          console.log(`[Agent Loop] 图片结果: useAnthropic=${useAnthropic}, endpoint=${config.endpoint}, model=${config.model}, imageSize=${result.image.length}`);
          if (useAnthropic) {
            // Anthropic 格式
            resultContent = [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: result.image,
                },
              },
              {
                type: 'text',
                text: `截图成功 (${result.width}x${result.height})`,
              },
            ];
          } else {
            // OpenAI 格式（kimi, gpt-4o, etc.）
            resultContent = [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${result.image}`,
                },
              },
              {
                type: 'text',
                text: `截图成功 (${result.width}x${result.height})`,
              },
            ];
          }
        } else {
          const rawContent = result.error
            ? `错误: ${result.error}`
            : (result.content || JSON.stringify(result));

          // MCP 图片工具返回 { text, images } 结构化对象
          if (rawContent && typeof rawContent === 'object' && rawContent.images && Array.isArray(rawContent.images) && rawContent.images.length > 0) {
            mcpImgs = rawContent.images;
            mcpImg = mcpImgs[0];
            resultContent = rawContent.text || `生成了 ${mcpImgs.length} 张图片`;
          } else {
            resultContent = rawContent;
          }

          // 截断过大的工具结果，避免撑爆上下文
          // 普通结果 1500 字符截断，错误结果 600 字符截断（错误信息通常前三行就能说明问题）
          const truncateLimit = result.error ? 600 : 1500;
          if (typeof resultContent === 'string' && resultContent.length > truncateLimit) {
            resultContent = resultContent.substring(0, truncateLimit) + `\n... [结果过长，省略 ${resultContent.length - truncateLimit} 字符]`;
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: resultContent,
        });

        // 渲染进程展示（图片显示缩略图，文字截断）
        const displayResult = result.isImage
          ? `[截图 ${result.width}x${result.height}]`
          : (typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent));

        const rendererPayload = { id: tc.id, name: tc.name, result: displayResult, error: !!result.error, round };
        if (result.isImage && result.image) {
          rendererPayload.imageData = result.image;
          rendererPayload.imageWidth = result.width;
          rendererPayload.imageHeight = result.height;
        }
        // ReadImage 工具返回的图片（传路径，渲染端异步加载）
        if (result.imageFilePath && !result.isImage) {
          rendererPayload.imageFilePath = result.imageFilePath;
          rendererPayload.imageMimeType = result.imageMimeType || 'image/jpeg';
        } else if (result.imageData && !result.isImage) {
          rendererPayload.imageData = result.imageData;
          rendererPayload.imageMimeType = result.imageMimeType || 'image/jpeg';
        }
        if (mcpImg) {
          rendererPayload.mcpImage = mcpImg;
          rendererPayload.mcpImages = mcpImgs;
        }
        sendToRenderer(mainWindow, 'agent-stream-tool-result', rendererPayload);
      }
      } // end of else (串行执行)

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

  const summarizePrompt = `你是一个对话压缩助手。请将以下对话历史压缩为结构化摘要。

在提供最终摘要前，请先在 <analysis> 标签中分析对话，确保覆盖所有要点：

1. 按时间顺序分析每条消息：
   - 用户的明确请求和意图
   - 你的应对方法
   - 关键决策、技术概念、代码模式
   - 具体细节：文件名、代码片段、函数签名、文件编辑
   - 遇到的错误及修复方法
   - 用户反馈（特别是纠正）
   - 安全相关指令（必须原文保留）

2. 检查技术准确性和完整性

然后按以下格式输出摘要：

<summary>
1. Primary Request and Intent:
   [详细描述用户请求]

2. Key Technical Concepts:
   - [概念1]
   - [概念2]

3. Files and Code Sections:
   - [文件名1]
     - [为什么重要]
     - [重要代码片段]

4. Errors and fixes:
   - [错误描述]:
     - [修复方法]

5. Problem Solving:
   [已解决的问题]

6. All user messages:
   - [用户消息]
   [保留安全相关指令原文]

7. Pending Tasks:
   - [待办任务]

8. Work Completed:
   [已完成工作]

9. Context for Continuing Work:
   [继续工作所需的关键上下文]
</summary>

要求：
- 保留所有文件路径和变量名等技术细节
- 保留错误信息和失败原因
- 保留用户明确表达的偏好
- 安全相关指令必须原文保留
- 总长度控制在 800 字以内

---

${summaryContent}`;

  try {
    const { callAPI } = require('./api-client');
    const result = await callAPI(
      [{ role: 'user', content: [{ type: 'text', text: summarizePrompt }] }],
      null,
      '',
      { ...config, maxTokens: 800, temperature: 0.3 }
    );

    const summaryText = result.content?.[0]?.text || '对话摘要';

    return [
      { role: 'user', content: `[系统：以下是对话早期历史的压缩摘要，请将其作为上下文参考，但不要重复执行摘要中已完成的操作]` },
      { role: 'assistant', content: `📋 对话历史摘要：\n${summaryText}\n\n[以上为早期对话摘要，以下是最近的对话内容]` },
      ...recentMsgs
    ];
  } catch (err) {
    console.error('[Agent Loop] 压缩失败:', err.message);
    return [
      { role: 'user', content: `[系统：早期 ${msgsToSummarize.length} 条对话因上下文过长被省略，请根据最近的消息继续工作。如果需要了解之前的操作，请使用 Read/Grep 工具重新查看相关文件]` },
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
        // Computer Use 工具不允许加入"始终允许"列表
        if (!COMPUTER_USE_TOOL_NAMES.includes(toolName)) {
          alwaysAllowedTools.add(toolName);
          _persistAlwaysAllowed();
          console.log(`[Agent Loop] 工具 ${toolName} 已加入始终允许列表（已持久化）`);
        } else {
          console.log(`[Agent Loop] Computer Use 工具 ${toolName} 不允许始终允许，本次已放行`);
        }
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

module.exports = { runAgentLoop, cancelAgentLoop, setPersistenceStore, taskQueue };
