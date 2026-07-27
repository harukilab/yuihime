import { ProviderModule, ModuleType } from '@shared/include/types';
import { buildChatMessages, normalizeToolCallsToOpenAI, normalizeToolsForProvider } from '../../core/openaiTools';
import { toSingleString } from '@/core/kernel/configNormalizer';

export const OpenAIProvider: ProviderModule = {
  metadata: {
    id: 'openai',
    name: 'OpenAI / Custom Compatible',
    description: 'Agnostic OpenAI-compatible driver supporting custom endpoints, headers, and fallback systems.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 3,
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
    configSchema: {
      fields: {
        baseUrl: { 
          type: 'string', 
          label: 'Base URL (Endpoint)', 
          default: 'https://api.openai.com/v1',
          description: 'Custom API base: official OpenAI, Groq, DeepSeek, or LM Studio / Ollama.' 
        },
        apiKey: { 
          type: 'password', 
          label: 'API Key', 
          description: 'API key associated with specified custom endpoints.' 
        },
        model: { 
          type: 'string', 
          label: 'Selected Model', 
          default: 'gpt-4o-mini',
          description: 'Input exact model designation manually or use the sync button to select dynamically.'
        },
        customHeaders: {
          type: 'textarea',
          label: 'Custom HTTP Headers (JSON)',
          default: '{}',
          description: 'Optional headers passed to endpoint. Example: {"HTTP-Referer": "https://aistudio.build"}'
        },
        temperature: {
          type: 'number',
          label: 'Temperature Override',
          default: 0.7,
          description: 'Value between 0.0 and 2.0 override.'
        }
      }
    }
  },

  getDynamicOptions: async (fieldName: string, config: any) => {
    if (fieldName === 'model') {
      try {
        const models = await OpenAIProvider.getModels(config);
        return models;
      } catch (e) {
        console.error("[OPENAI] Model listing failed:", e);
        return [];
      }
    }
    return [];
  },

  getModels: async (config: any) => {
    try {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = toSingleString(config.apiKey);
      const customHeadersStr = config.customHeaders || '{}';

      let computedHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (apiKey) {
        computedHeaders['Authorization'] = `Bearer ${apiKey}`;
      }

      try {
        const parsed = JSON.parse(customHeadersStr);
        computedHeaders = { ...computedHeaders, ...parsed };
      } catch (e) {}

      // Call proxy endpoint on backend or fetch client side
      const listUrl = `${baseUrl}/models`;
      const response = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: listUrl,
          method: 'GET',
          headers: computedHeaders
        })
      });

      if (!response.ok) {
        return [
          { label: 'gpt-4o-mini (Fallback)', value: 'gpt-4o-mini' },
          { label: 'gpt-4o', value: 'gpt-4o' }
        ];
      }

      const data = await response.json();
      const modelsList = data.data || data.models || [];
      if (Array.isArray(modelsList)) {
        return modelsList.map((m: any) => ({
          label: m.id || m.name,
          value: m.id || m.name
        })).sort((a, b) => a.label.localeCompare(b.label));
      }
      return [];
    } catch (e) {
      console.error("[OPENAI_PROVIDER] Model listing failed:", e);
      return [];
    }
  },

  generate: async (prompt: string, context: any) => {
    try {
      const config = context.config?.openai || context.config || (context.model ? context : {});
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = toSingleString(config.apiKey);
      const modelId = toSingleString(context.model || config.model) || OpenAIProvider.metadata.models[0];
      const customHeadersStr = config.customHeaders || '{}';
      
      let computedHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (apiKey) {
        computedHeaders['Authorization'] = `Bearer ${apiKey}`;
      }

      try {
        const parsedJSON = JSON.parse(customHeadersStr);
        computedHeaders = { ...computedHeaders, ...parsedJSON };
      } catch (e) {}

      const blueprint = context.payloadBlueprint || config.payloadBlueprint;
      let systemInstruction = context.assembledSystemPrompt || context.systemPrompt || '';
      let promptText = prompt;
      let overriddenModel = modelId;
      let overriddenTemp = config.temperature !== undefined ? config.temperature : 0.7;
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
        if (blueprint.temperature !== undefined) {
          overriddenTemp = blueprint.temperature;
        }
        if (blueprint.response_format) {
          isJsonFormat = blueprint.response_format.type === 'json_object';
        }
      }

      const providerTools = Array.isArray(context.tools) && context.tools.length > 0
        ? context.tools
        : (Array.isArray(context.toolMessages) && context.toolMessages.length > 0 ? [] : undefined);

      const messages = buildChatMessages('openai', {
        system: systemInstruction,
        user: promptText,
        assistantToolCalls: context.assistantToolCalls,
        toolMessages: context.toolMessages
      });

      const payload: any = {
        model: overriddenModel,
        messages: messages,
        temperature: overriddenTemp
      };

      const finalMaxTokens = blueprint?.max_tokens ?? config.maxOutputTokens ?? config.maxTokens;
      if (finalMaxTokens) {
        payload.max_tokens = parseInt(finalMaxTokens, 10);
      }

      if (isJsonFormat) {
        payload.response_format = { type: 'json_object' };
      }

      // Native OpenAI function calling: expose registered tools to the model.
      // `providerTools` is always supplied when a tool result turn is active so the
      // endpoint accepts the incoming `role: "tool"` messages.
      if (providerTools !== undefined) {
        payload.tools = normalizeToolsForProvider(context.tools || [], 'openai') || context.tools;
        payload.tool_choice = 'auto';
      }

      const endpointUrl = `${baseUrl}/chat/completions`;

      const response = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: context.signal,
        body: JSON.stringify({
          url: endpointUrl,
          method: 'POST',
          headers: computedHeaders,
          body: payload
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI Provider Proxy Connection Failed (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message || {};
      const answer = message.content || "";

      // Native tool calls -> return canonical OpenAI tool_calls shape for cortex to normalize.
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        return JSON.stringify({ tool_calls: normalizeToolCallsToOpenAI(message, 'openai') });
      }

      return answer;
    } catch (e: any) {
      console.error("[OPENAI_PROVIDER] Failed to generate completion:", e.message);
      throw e;
    }
  }
};
