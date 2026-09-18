export const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'kimi', name: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi2.6' },
  { id: 'qwen', name: '千问 (Qwen)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8flash' },
  { id: 'glm', name: 'GLM (智谱)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash' },
  { id: 'mimo', name: 'MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { id: 'custom', name: '自定义', baseUrl: '', model: '' }
];

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}
