// API 客户端模块
// 支持 Anthropic 和 OpenAI 格式，包含流式解析

const { getOpenAITools } = require('./tools');

/**
 * 判断是否使用 Anthropic 格式
 */
function shouldUseAnthropicFormat(endpoint, model) {
  if (model && model.match(/^claude-/i)) return true;
  if (endpoint && endpoint.includes('anthropic.com')) return true;
  return false;
}

// ==================== Anthropic 格式 ====================

/**
 * Anthropic 非流式 API 调用
 */
async function callAnthropicAPI(messages, tools, system, options) {
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7 } = options;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  if (system) body.system = system;
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
  }

  const response = await fetch(endpoint.replace(/\/anthropic$/i, '') + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
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
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7 } = options;
  const { onText, onToolUse, onComplete } = callbacks;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages,
  };
  if (system) body.system = system;
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
  }

  const response = await fetch(endpoint.replace(/\/anthropic$/i, '') + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
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
 * 转换 Anthropic 消息格式到 OpenAI 格式（支持 tool_use/tool_result）
 */
function toOpenAIMessagesWithTools(messages, system) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });

  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const textParts = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const toolParts = m.content.filter(c => c.type === 'tool_use');
      const msg = { role: 'assistant' };
      if (textParts) msg.content = textParts;
      if (toolParts.length > 0) {
        msg.tool_calls = toolParts.map(t => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input) }
        }));
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
        if (imageParts.length > 0) {
          const content = [];
          if (textParts) content.push({ type: 'text', text: textParts });
          for (const img of imageParts) {
            content.push({ type: 'image_url', image_url: { url: `data:${img.source.media_type};base64,${img.source.data}` } });
          }
          out.push({ role: 'user', content });
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
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7 } = options;

  const oaiMessages = toOpenAIMessagesWithTools(messages, system);
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: oaiMessages,
  };
  if (tools && tools.length > 0) {
    body.tools = getOpenAITools(tools);
  }

  const url = endpoint.replace(/\/anthropic$/i, '') + '/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
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

  const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';

  return {
    content,
    stop_reason: stopReason,
    usage: data.usage || {},
  };
}

/**
 * OpenAI 流式 API 调用
 */
async function callOpenAIStream(messages, tools, system, options, callbacks) {
  const { model, apiKey, endpoint, maxTokens = 8192, temperature = 0.7 } = options;
  const { onText, onToolUse, onComplete } = callbacks;

  const oaiMessages = toOpenAIMessagesWithTools(messages, system);
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
    messages: oaiMessages,
  };
  if (tools && tools.length > 0) {
    body.tools = getOpenAITools(tools);
  }

  const url = endpoint.replace(/\/anthropic$/i, '') + '/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
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

  if (onComplete) onComplete(stopReason, usage);
  return { stopReason, usage };
}

/**
 * 统一 API 调用入口（非流式）
 */
async function callAPI(messages, tools, system, options) {
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
