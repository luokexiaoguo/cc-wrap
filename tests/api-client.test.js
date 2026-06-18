// 思考级别自动适配测试
// 测试 applyReasoningEffort 函数（从 api-client.js 提取逻辑）

function applyReasoningEffort(body, effort, isAnthropic) {
  if (!effort) return;
  const model = (body.model || '').toLowerCase();
  const on = effort !== 'off';

  if (model.startsWith('claude-')) {
    if (!on) { body.thinking = { type: 'disabled' }; return; }
    const budgetMap = { low: 2048, medium: 8192, high: 16384 };
    body.thinking = { type: 'enabled', budget_tokens: budgetMap[effort] || 8192 };
    body.output_config = { effort };
    return;
  }
  if (model.startsWith('o') || model.startsWith('gpt-5')) {
    if (!on) return;
    body.reasoning_effort = effort;
    return;
  }
  if (model.includes('qwen3') || model.includes('qwq')) {
    body.enable_thinking = on;
    return;
  }
  if (model.includes('deepseek')) {
    if (model.includes('reasoner') || model.match(/[-_]r1/)) return;
    if (model.includes('v4') || model.includes('v5')) {
      body.thinking = { type: on ? 'enabled' : 'disabled' };
      return;
    }
    body.enable_thinking = on;
    return;
  }
  if (model.includes('kimi') || model.includes('moonshot')) {
    body.thinking = { type: on ? 'enabled' : 'disabled' };
    return;
  }
  if (model.includes('doubao') || model.includes('ark-')) {
    if (!on) { body.thinking = { type: 'disabled' }; return; }
    const budgetMap = { low: 2048, medium: 4096, high: 8192 };
    body.thinking = { type: 'enabled', budget_tokens: budgetMap[effort] || 4096 };
    return;
  }
  if (model.includes('gemini')) {
    if (!body.generationConfig) body.generationConfig = {};
    if (!on) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
      return;
    }
    if (model.includes('gemini-3')) {
      body.generationConfig.thinkingConfig = { thinkingLevel: effort };
    } else {
      const budgetMap = { low: 1024, medium: 4096, high: 16384 };
      body.generationConfig.thinkingConfig = { thinkingBudget: budgetMap[effort] || 4096 };
    }
    return;
  }
  if (model.includes('glm-z1') || model.includes('glm-5') || model.includes('glm-4.1v-thinking')) return;
  if (model.includes('mimo')) return;
  if (on) body.reasoning_effort = effort;
}

describe('applyReasoningEffort', () => {
  test('Claude: medium → thinking + output_config', () => {
    const body = { model: 'claude-opus-4-7' };
    applyReasoningEffort(body, 'medium', true);
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
    expect(body.output_config).toEqual({ effort: 'medium' });
  });

  test('Claude: off → thinking disabled', () => {
    const body = { model: 'claude-sonnet-4-6' };
    applyReasoningEffort(body, 'off', true);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  test('OpenAI o3: medium → reasoning_effort', () => {
    const body = { model: 'o3' };
    applyReasoningEffort(body, 'medium', false);
    expect(body.reasoning_effort).toBe('medium');
  });

  test('GPT-5: high → reasoning_effort', () => {
    const body = { model: 'gpt-5.4' };
    applyReasoningEffort(body, 'high', false);
    expect(body.reasoning_effort).toBe('high');
  });

  test('Qwen3: medium → enable_thinking true', () => {
    const body = { model: 'qwen3-plus' };
    applyReasoningEffort(body, 'medium', false);
    expect(body.enable_thinking).toBe(true);
  });

  test('Qwen3: off → enable_thinking false', () => {
    const body = { model: 'qwen3-flash' };
    applyReasoningEffort(body, 'off', false);
    expect(body.enable_thinking).toBe(false);
  });

  test('DeepSeek V4: high → thinking.type enabled', () => {
    const body = { model: 'deepseek-v4-pro' };
    applyReasoningEffort(body, 'high', false);
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  test('DeepSeek R1: 不注入参数', () => {
    const body = { model: 'deepseek-reasoner' };
    applyReasoningEffort(body, 'high', false);
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.enable_thinking).toBeUndefined();
  });

  test('Kimi K2.6: low → thinking.type enabled', () => {
    const body = { model: 'kimi-k2.6' };
    applyReasoningEffort(body, 'low', false);
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  test('Kimi: off → thinking.type disabled', () => {
    const body = { model: 'kimi-k2.6' };
    applyReasoningEffort(body, 'off', false);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  test('Doubao: medium → thinking + budget_tokens', () => {
    const body = { model: 'doubao-1-5-thinking-pro' };
    applyReasoningEffort(body, 'medium', false);
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
  });

  test('Gemini 2.5: medium → thinkingBudget', () => {
    const body = { model: 'gemini-2.5-pro' };
    applyReasoningEffort(body, 'medium', false);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 4096 });
  });

  test('Gemini 3: high → thinkingLevel', () => {
    const body = { model: 'gemini-3.1-pro' };
    applyReasoningEffort(body, 'high', false);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' });
  });

  test('GLM-5.1: 不注入参数（始终推理）', () => {
    const body = { model: 'glm-5.1' };
    applyReasoningEffort(body, 'high', false);
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  test('MiMo: 不注入参数（始终推理）', () => {
    const body = { model: 'mimo-v2-pro' };
    applyReasoningEffort(body, 'high', false);
    expect(body.thinking).toBeUndefined();
  });

  test('未知模型: fallback reasoning_effort', () => {
    const body = { model: 'some-unknown-model' };
    applyReasoningEffort(body, 'medium', false);
    expect(body.reasoning_effort).toBe('medium');
  });

  test('effort 为 null 时不注入', () => {
    const body = { model: 'claude-opus-4-7' };
    applyReasoningEffort(body, null, true);
    expect(body.thinking).toBeUndefined();
  });
});
