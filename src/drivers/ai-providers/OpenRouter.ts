import { ProviderModule, ModuleType } from '@shared/include/types';
import { buildChatMessages, normalizeToolCallsToOpenAI, normalizeToolsForProvider } from '../../core/openaiTools';
import { toSingleString } from '@/core/kernel/configNormalizer';

export const OpenRouter: ProviderModule = {
  metadata: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Universal gateway for multiple LLMs.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 2,
    models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'],
    configSchema: {
      fields: {
        apiKey: { type: 'password', label: 'API Key', description: 'OpenRouter API Key' },
        model: { 
          type: 'select', 
          label: 'Model Selection', 
          dynamicOptions: true,
          default: 'google/gemini-2.0-flash-001',
          description: 'Select a model from OpenRouter' 
        }
      }
    }
  },
  getDynamicOptions: async (fieldName: string, config: any) => {
    if (fieldName === 'model') {
      try {
        const apiKey = config.apiKey || '';
        const url = apiKey ? `/api/ai/models?provider=openrouter&apiKey=${apiKey}` : '/api/ai/models?provider=openrouter';
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data.models || []).map((m: any) => ({ 
          label: m.displayName || m.name.split('/').pop(), 
          value: m.name.replace('models/', '') 
        }));
      } catch (e) {
        console.error("[OPENROUTER] Model listing failed:", e);
        return [];
      }
    }
    return [];
  },
  getModels: async (config: any) => {
    // Keep for backward compatibility with some core loops if needed
    try {
      const apiKey = config.apiKey || '';
      const url = apiKey ? `/api/ai/models?provider=openrouter&apiKey=${apiKey}` : '/api/ai/models?provider=openrouter';
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.models || []).map((m: any) => ({ 
        label: m.displayName || m.name.split('/').pop(), 
        value: m.name.replace('models/', '') 
      }));
    } catch (e) {
      console.error("[OPENROUTER] Model listing failed:", e);
      return [];
    }
  },
  generate: async (prompt: string, context: any) => {
    const config = context.config?.openrouter || context.config || (context.model ? context : {});
    const apiKey = toSingleString(config.apiKey || config.api_key);
    const googleModel = toSingleString(context.model || config.model) || OpenRouter.metadata.models[0];

    const blueprint = context.payloadBlueprint || config.payloadBlueprint;
    let systemInstruction = context.assembledSystemPrompt || 'You are an AI assistant.';
    let promptText = prompt;
    let overriddenModel = googleModel;
    let isJsonFormat = !!config.isJson;

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
      if (blueprint.response_format) {
        isJsonFormat = blueprint.response_format.type === 'json_object';
      }
    }

    const providerTools = Array.isArray(context.tools) && context.tools.length > 0
      ? context.tools
      : (Array.isArray(context.toolMessages) && context.toolMessages.length > 0 ? [] : undefined);

    const messages = buildChatMessages('openrouter', {
      system: systemInstruction,
      user: promptText,
      assistantToolCalls: context.assistantToolCalls,
      toolMessages: context.toolMessages
    });

    const payloadBody: any = {
      model: overriddenModel,
      messages: messages
    };

    const finalMaxTokens = blueprint?.max_tokens ?? config.maxOutputTokens ?? config.maxTokens;
    if (finalMaxTokens) {
      payloadBody.max_tokens = parseInt(finalMaxTokens, 10);
    }

    if (isJsonFormat) {
      payloadBody.response_format = { type: 'json_object' };
    }

    // Native OpenAI function calling: expose registered tools to the model
    if (providerTools !== undefined) {
      payloadBody.tools = normalizeToolsForProvider(context.tools || [], 'openrouter') || context.tools;
      payloadBody.tool_choice = 'auto';
    }

    const response = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: context.signal,
      body: JSON.stringify({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': apiKey ? `Bearer ${apiKey}` : 'ENV_OPENROUTER_KEY',
          'HTTP-Referer': 'https://aistudio.build',
          'X-Title': 'Yuihime Agentic'
        },
        body: payloadBody
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenRouter Proxy Error ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      return JSON.stringify({ tool_calls: normalizeToolCallsToOpenAI(message, 'openrouter') });
    }
    return message.content || "";
  }
};
