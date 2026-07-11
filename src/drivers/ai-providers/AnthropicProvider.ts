import { ProviderModule, ModuleType } from '../../include/types';

export const AnthropicProvider: ProviderModule = {
  metadata: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude 3.5 Sonnet, Opus, and Haiku models.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 4,
    models: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    configSchema: {
      fields: {
        apiKey: { type: 'password', label: 'API Key', description: 'Anthropic API Key' },
        model: { 
          type: 'select', 
          label: 'Model Name', 
          dynamicOptions: true,
          options: [
            { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620' },
            { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
            { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' }
          ]
        }
      }
    }
  },
  getDynamicOptions: async (fieldName: string, config: any) => {
    if (fieldName === 'model') {
      return AnthropicProvider.getModels ? await AnthropicProvider.getModels(config) : [];
    }
    return [];
  },
  getModels: async (config: any) => {
    return [
      { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620' },
      { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
      { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' }
    ];
  },
  generate: async (prompt: string, context: any) => {
    const config = context.config?.anthropic || context.config || (context.model ? context : {});
    const apiKey = config.apiKey || config.api_key || '';
    const modelId = context.model || config.model || AnthropicProvider.metadata.models[0];

    const blueprint = context.payloadBlueprint || config.payloadBlueprint;
    let systemInstruction = context.assembledSystemPrompt;
    let promptText = prompt;
    let overriddenModel = modelId;
    let maxTokensOut = config.maxOutputTokens || config.maxTokens || 8192;

    if (blueprint) {
      if (blueprint.model) {
        overriddenModel = blueprint.model;
      }
      const sysMsg = blueprint.messages.find((m: any) => m.role === 'system');
      if (sysMsg) {
        systemInstruction = sysMsg.content;
      }
      const usrMsg = blueprint.messages.find((m: any) => m.role === 'user');
      if (usrMsg) {
        promptText = usrMsg.content;
      }
      if (blueprint.max_tokens !== undefined) {
        maxTokensOut = blueprint.max_tokens;
      }
    }

    const response = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: context.signal,
      body: JSON.stringify({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': apiKey || 'ENV_ANTHROPIC_KEY',
          'anthropic-version': '2023-06-01'
        },
        body: {
          model: overriddenModel,
          max_tokens: maxTokensOut,
          system: systemInstruction,
          messages: [
            { role: 'user', content: promptText }
          ]
        }
      })
    });

    if (!response.ok) {
       const err = await response.json().catch(() => ({}));
       throw new Error(err.error?.message || `Anthropic Proxy Error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }
};
