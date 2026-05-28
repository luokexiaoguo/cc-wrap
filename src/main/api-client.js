// API 客户端模块
// 支持 Anthropic 和 OpenAI 格式，包含流式解析

const { getOpenAITools } = require('./tools');

// 默认请求超时（120s，避免 Windows 上断网时无限挂起）
const DEFAULT_TIMEOUT_MS = 120 * 1000;

// 启动时配置代理（读取 HTTPS_PROXY / HTTP_PROXY 环境变量）
let proxyConfigured = false;
function ensureProxyConfigured() {
  if (proxyConfigured) return;
  proxyConfigured = true;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxyUrl) return;
  try {
    const undici = require('undici');
    undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl));
    console.log('[API] 已配置代理:', proxyUrl);
  } catch (e) {
    console.warn('[API] 代理配置失败:', e.message);
  }
}

// 组合多个 AbortSignal（用户取消信号 + 超时信号）
function combineSignals(signals) {
  const valid = signals.filter(Boolean);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  // Node 20+ 有 AbortSignal.any
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(valid);
  // 兼容 Node 18：手动转发
  const ctrl = new AbortController();
  for (const s of valid) {
    if (s.aborted) { ctrl.abort(s.reason); return ctrl.signal; }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

function buildSignal(userSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return combineSignals([userSignal, AbortSignal.timeout(timeoutMs)]);
}

/**
 * 判断是否使用 Anthropic 格式
 */
function shouldUseAnthropicFormat(endpoint, model) {
  if (model && model.match(/^claude-/i)) return true;
  if (endpoint && endpoint.includes('anthropic.com')) return true;
  return false;
}

/**
 * 根据 reasoningEffort 设置修改请求体
 * 自动识别模型，注入对应的思考参数
 * @param {object} body - 请求体对象（会被原地修改）
 * @param {string|null} effort - 'off'|'low'|'medium'|'high'|null
 * @param {boolean} isAnthropic - 是否为 Anthropic 格式
 */
function applyReasoningEffort(body, effort, isAnthropic) {
  if (!effort) return;

  const model = (body.model || '').toLowerCase();
  const on = effort !== 'off';

  // === Anthropic Claude (原生 API) ===
  // claude-* 模型 + anthropic.com endpoint
  if (model.startsWith('claude-')) {
    if (!on) { body.thinking = { type: 'disabled' }; return; }
    const budgetMap = { low: 2048, medium: 8192, high: 16384 };
    body.thinking = { type: 'enabled', budget_tokens: budgetMap[effort] || 8192 };
    body.output_config = { effort };
    return;
  }

  // === OpenAI o-series / GPT-5 ===
  if (model.startsWith('o') || model.startsWith('gpt-5')) {
    if (!on) return; // o-series 不支持关闭思考
    body.reasoning_effort = effort;
    return;
  }

  // === Qwen3 (通义千问) ===
  if (model.includes('qwen3') || model.includes('qwq')) {
    body.enable_thinking = on;
    return;
  }

  // === DeepSeek ===
  if (model.includes('deepseek')) {
    if (model.includes('reasoner') || model.match(/[-_]r1/)) {
      // R1 始终推理，不支持开关
      return;
    }
    // V4+: thinking 对象格式（原生 API + DashScope 均兼容）
    if (model.includes('v4') || model.includes('v5')) {
      body.thinking = { type: on ? 'enabled' : 'disabled' };
      return;
    }
    // V3 及更早: enable_thinking 布尔格式（DashScope 兼容）
    body.enable_thinking = on;
    return;
  }

  // === Kimi / Moonshot ===
  if (model.includes('kimi') || model.includes('moonshot')) {
    body.thinking = { type: on ? 'enabled' : 'disabled' };
    return;
  }

  // === Doubao / 豆包 / 火山方舟 ===
  if (model.includes('doubao') || model.includes('ark-')) {
    if (!on) { body.thinking = { type: 'disabled' }; return; }
    const budgetMap = { low: 2048, medium: 4096, high: 8192 };
    body.thinking = { type: 'enabled', budget_tokens: budgetMap[effort] || 4096 };
    return;
  }

  // === Gemini ===
  if (model.includes('gemini')) {
    if (!body.generationConfig) body.generationConfig = {};
    if (!on) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
      return;
    }
    // Gemini 3.x 用 thinkingLevel, 2.5 用 thinkingBudget
    if (model.includes('gemini-3') || model.match(/gemini-\d+\.\d+/)) {
      body.generationConfig.thinkingConfig = { thinkingLevel: effort };
    } else {
      const budgetMap = { low: 1024, medium: 4096, high: 16384 };
      body.generationConfig.thinkingConfig = { thinkingBudget: budgetMap[effort] || 4096 };
    }
    return;
  }

  // === GLM (智谱) ===
  // GLM-Z1 / GLM-5.1 / GLM-4.1V-Thinking 始终推理，无开关
  if (model.includes('glm-z1') || model.includes('glm-5') || model.includes('glm-4.1v-thinking')) {
    return;
  }

  // === MiMo (小米，始终推理) ===
  if (model.includes('mimo')) {
    return;
  }

  // === MiniMax / 其他未知模型 ===
  // 发送 reasoning_effort，不支持的 API 会静默忽略
  if (on) body.reasoning_effort = effort;
}

// ==================== Anthropic 格式 ====================

/**
 * Anthropic 非流式 API 调用
 */
async function callAnthropicAPI(messages, tools, system, options) {
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7, reasoningEffort } = options;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  applyReasoningEffort(body, reasoningEffort, true);
  if (system) body.system = system;
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
  }

  const url = endpoint.replace(/\/+$/, '').replace(/\/anthropic$/i, '').replace(/\/v1\/?$/i, '') + '/v1/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: buildSignal(options.signal),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return {
    content: data.content || [],
    stop_reason: data.stop_reason || 'end_turn',
    usage: data.usage || {},
  };
}

/**
 * Anthropic 流式 API 调用
 * 回调: onText(text), onToolUse(id, name, input), onComplete(stopReason, usage)
 */
async function callAnthropicStream(messages, tools, system, options, callbacks) {
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7, reasoningEffort } = options;
  const { onText, onToolUse, onComplete } = callbacks;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages,
  };
  applyReasoningEffort(body, reasoningEffort, true);
  if (system) body.system = system;
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
  }

  const url = endpoint.replace(/\/+$/, '').replace(/\/anthropic$/i, '').replace(/\/v1\/?$/i, '') + '/v1/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: buildSignal(options.signal),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason = 'end_turn';
  let usage = {};
  let currentBlockId = null;
  let currentBlockType = null;
  let currentBlockName = null;
  let toolInputJson = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;

      try {
        const evt = JSON.parse(data);

        switch (evt.type) {
          case 'message_start':
            usage = evt.message?.usage || {};
            break;

          case 'content_block_start':
            currentBlockId = evt.content_block?.id || null;
            currentBlockType = evt.content_block?.type || null;
            currentBlockName = evt.content_block?.name || null;
            if (currentBlockType === 'tool_use') {
              toolInputJson = '';
            }
            break;

          case 'content_block_delta':
            if (evt.delta?.type === 'text_delta' && evt.delta.text) {
              if (onText) onText(evt.delta.text);
            } else if (evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
              toolInputJson += evt.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentBlockType === 'tool_use' && currentBlockId) {
              let input = {};
              try { input = JSON.parse(toolInputJson); } catch {}
              if (onToolUse) onToolUse(currentBlockId, currentBlockName, input);
            }
            currentBlockId = null;
            currentBlockType = null;
            currentBlockName = null;
            toolInputJson = '';
            break;

          case 'message_delta':
            if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
            if (evt.usage) usage = { ...usage, ...evt.usage };
            break;

          case 'message_stop':
            break;
        }
      } catch {}
    }
  }

  // 处理剩余缓冲区
  if (buffer.trim()) {
    const remaining = buffer.split('\n');
    for (const line of remaining) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_start') {
          currentBlockId = evt.content_block?.id || null;
          currentBlockType = evt.content_block?.type || null;
          currentBlockName = evt.content_block?.name || null;
          if (currentBlockType === 'tool_use') toolInputJson = '';
        } else if (evt.type === 'content_block_stop' && currentBlockType === 'tool_use' && currentBlockId) {
          let input = {};
          try { input = JSON.parse(toolInputJson); } catch {}
          if (onToolUse) onToolUse(currentBlockId, currentBlockName, input);
        } else if (evt.type === 'message_delta') {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          if (evt.usage) usage = { ...usage, ...evt.usage };
        }
      } catch {}
    }
  }

  if (onComplete) onComplete(stopReason, usage);
  return { stopReason, usage };
}

// ==================== OpenAI 格式 ====================

/**
 * 判断模型是否支持视觉输入（image_url）
 * 不支持的模型（如 deepseek-chat、deepseek-reasoner、gpt-3.5、MiniMax-M2.7 等）发图片会 400
 */
function modelSupportsVision(model) {
  if (!model) return false;
  // 显式黑名单（即使匹配下面的正则也强制返回 false）
  if (/^deepseek-(chat|reasoner|v3|coder)/i.test(model)) return false;
  // 命名包含 vision / vl / 4o / 4-turbo / 4.5 / Claude / Gemini / glm-4v / step-1v 等
  return /vision|-vl-|vl-|qwen.*vl|gpt-4o|gpt-4v|gpt-4\.5|gpt-4-turbo|gemini|claude|sonnet|opus|haiku|glm-4v|glm-4\.5v|step-1v|step-2-mini|abab.*vision/i.test(model);
}

/**
 * 转换 Anthropic 消息格式到 OpenAI 格式（支持 tool_use/tool_result）
 * @param {string} [model] 用于判断是否需要剥离图片（非视觉模型会 400）
 */
function toOpenAIMessagesWithTools(messages, system, model) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  const supportsVision = modelSupportsVision(model);

  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const textParts = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const toolParts = m.content.filter(c => c.type === 'tool_use');
      const msg = { role: 'assistant' };
      // content 必须始终存在（null 表示无文本内容），DeepSeek 等 API 严格校验
      msg.content = textParts || null;
      if (toolParts.length > 0) {
        msg.tool_calls = toolParts.map(t => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input) }
        }));
      }
      // DeepSeek 推理模式：保留 reasoning_content 用于后续轮次
      if (m.reasoning_content) {
        msg.reasoning_content = m.reasoning_content;
      }
      out.push(msg);
    } else if (m.role === 'user' && Array.isArray(m.content)) {
      const toolResults = m.content.filter(c => c.type === 'tool_result');
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content || '' });
        }
      } else {
        const textParts = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        const imageParts = m.content.filter(c => c.type === 'image');
        if (imageParts.length > 0 && supportsVision) {
          // 视觉模型：把图片塞成 image_url
          const content = [];
          if (textParts) content.push({ type: 'text', text: textParts });
          for (const img of imageParts) {
            content.push({ type: 'image_url', image_url: { url: `data:${img.source.media_type};base64,${img.source.data}` } });
          }
          out.push({ role: 'user', content });
        } else if (imageParts.length > 0) {
          // 非视觉模型：剥离图片，保留 text（路径 hint 已在 text 里），加占位提示让模型知道有图但需调工具识别
          const placeholder = textParts
            ? textParts + '\n\n[本对话有图片附件，但当前模型不支持直接读取图片。请调用支持图片的工具（如 MCP 的 understand_image）并用文本中给出的本地图片路径作为参数。]'
            : '[图片附件，当前模型不支持直接读取，请调用支持图片的工具并使用本地路径。]';
          out.push({ role: 'user', content: placeholder });
        } else {
          out.push({ role: 'user', content: textParts || '' });
        }
      }
    } else if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
    } else {
      out.push({ role: m.role, content: '' });
    }
  }
  return out;
}

/**
 * OpenAI 非流式 API 调用
 */
async function callOpenAIAPI(messages, tools, system, options) {
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7, reasoningEffort } = options;

  const oaiMessages = toOpenAIMessagesWithTools(messages, system, model);
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: oaiMessages,
  };
  applyReasoningEffort(body, reasoningEffort, false);
  if (tools && tools.length > 0) {
    body.tools = getOpenAITools(tools);
  }

  const url = endpoint.replace(/\/+$/, '').replace(/\/anthropic$/i, '').replace(/\/v1\/?$/i, '') + '/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
    signal: buildSignal(options.signal),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const message = choice?.message || {};

  // 转换为 Anthropic 格式的 content blocks
  const content = [];
  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments); } catch {}
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  // DeepSeek 推理模式：返回 reasoning_content
  const extra = {};
  if (message.reasoning_content) {
    extra.reasoning_content = message.reasoning_content;
  }

  const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';

  return {
    content,
    stop_reason: stopReason,
    usage: data.usage || {},
    ...extra,
  };
}

/**
 * OpenAI 流式 API 调用
 */
async function callOpenAIStream(messages, tools, system, options, callbacks) {
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7, reasoningEffort } = options;
  const { onText, onToolUse, onComplete } = callbacks;

  const oaiMessages = toOpenAIMessagesWithTools(messages, system, model);
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
    messages: oaiMessages,
  };
  applyReasoningEffort(body, reasoningEffort, false);
  if (tools && tools.length > 0) {
    body.tools = getOpenAITools(tools);
  }

  const url = endpoint.replace(/\/+$/, '').replace(/\/anthropic$/i, '').replace(/\/v1\/?$/i, '') + '/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
    signal: buildSignal(options.signal),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason = 'end_turn';
  let usage = {};
  let reasoningContent = '';
  const toolCallsMap = {}; // index -> { id, name, arguments }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;

      try {
        const evt = JSON.parse(data);
        const choice = evt.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta || {};

        // 文本内容
        if (delta.content) {
          if (onText) onText(delta.content);
        }

        // DeepSeek 推理内容（reasoning_content）
        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
        }

        // 工具调用
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0;
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: tc.id || '', name: '', arguments: '' };
            }
            if (tc.id) toolCallsMap[idx].id = tc.id;
            if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
          }
        }

        // 结束原因
        if (choice.finish_reason) {
          stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
        }

        // 捕获 usage（OpenAI 流式在最后一个 chunk 返回）
        if (evt.usage) {
          usage = {
            input_tokens: evt.usage.prompt_tokens || 0,
            output_tokens: evt.usage.completion_tokens || 0
          };
        }
      } catch {}
    }
  }

  // 处理剩余缓冲区
  if (buffer.trim()) {
    const remaining = buffer.split('\n');
    for (const line of remaining) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        const choice = evt.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0;
            if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: tc.id || '', name: '', arguments: '' };
            if (tc.id) toolCallsMap[idx].id = tc.id;
            if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
          }
        }
        if (choice.finish_reason) {
          stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
        }
        // 剩余缓冲区也捕获 usage
        if (evt.usage) {
          usage = {
            input_tokens: evt.usage.prompt_tokens || evt.usage.input_tokens || 0,
            output_tokens: evt.usage.completion_tokens || evt.usage.output_tokens || 0
          };
        }
      } catch {}
    }
  }

  // 触发工具调用回调
  for (const idx of Object.keys(toolCallsMap)) {
    const tc = toolCallsMap[idx];
    let input = {};
    try { input = JSON.parse(tc.arguments); } catch {}
    if (onToolUse) onToolUse(tc.id, tc.name, input);
  }

  if (onComplete) onComplete(stopReason, usage, { reasoning_content: reasoningContent });
  return { stopReason, usage, reasoning_content: reasoningContent };
}

/**
 * 统一 API 调用入口（非流式）
 */
async function callAPI(messages, tools, system, options) {
  ensureProxyConfigured();
  const { endpoint, model } = options;
  if (shouldUseAnthropicFormat(endpoint, model)) {
    return callAnthropicAPI(messages, tools, system, options);
  } else {
    return callOpenAIAPI(messages, tools, system, options);
  }
}

/**
 * 统一流式 API 调用入口
 */
async function callAPIStream(messages, tools, system, options, callbacks) {
  ensureProxyConfigured();
  const { endpoint, model } = options;
  if (shouldUseAnthropicFormat(endpoint, model)) {
    return callAnthropicStream(messages, tools, system, options, callbacks);
  } else {
    return callOpenAIStream(messages, tools, system, options, callbacks);
  }
}

module.exports = {
  callAPI,
  callAPIStream,
  callAnthropicAPI,
  callAnthropicStream,
  callOpenAIAPI,
  callOpenAIStream,
  shouldUseAnthropicFormat,
  toOpenAIMessagesWithTools,
};
