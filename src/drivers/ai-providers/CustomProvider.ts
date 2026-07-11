import { ProviderModule, ModuleType } from '../../include/types';

export const CustomProvider: ProviderModule = {
  metadata: {
    id: 'custom',
    name: 'Custom Provider',
    description: 'Agnostic custom OpenAI-compatible driver with modular routing, custom HTTP headers, and manual fallback configurations.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 10,
    models: ['custom-model'],
    configSchema: {
      fields: {
        baseUrl: { 
          type: 'string', 
          label: 'Custom Base URL', 
          default: 'https://api.openai.com/v1',
          description: 'Agnostic key provider API endpoint URL (e.g., https://api.deepseek.com/v1, or local gateway: http://localhost:11434/v1).' 
        },
        apiKey: { 
          type: 'password', 
          label: 'Access Authorization API Key', 
          description: 'API credential associated with your custom endpoint.' 
        },
        model: { 
          type: 'string', 
          label: 'Selected Custom Model ID', 
          default: 'custom-model',
          description: 'Type exact model label manually or click the sync button to query models from the custom base url.'
        },
        customHeaders: {
          type: 'textarea',
          label: 'Custom HTTP Headers (JSON)',
          default: '{}',
          description: 'Optional custom headers dictionary. (e.g., {"HTTP-Referer": "https://yuihime.moe"})'
        },
        temperature: {
          type: 'number',
          label: 'Temperature Override',
          default: 0.7,
          description: 'Value override between 0.0 and 2.0.'
        }
      }
    }
  },

  getDynamicOptions: async (fieldName: string, config: any) => {
    if (fieldName === 'model') {
      try {
        const models = await CustomProvider.getModels(config);
        return models;
      } catch (e) {
        console.error("[CUSTOM_PROVIDER] Model list options query failed:", e);
        return [];
      }
    }
    return [];
  },

  getModels: async (config: any) => {
    try {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = config.apiKey || '';
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
          { label: 'custom-model (Agnostic Target)', value: 'custom-model' }
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
      console.error("[CUSTOM_PROVIDER] Models listing query failed:", e);
      return [];
    }
  },

  generate: async (prompt: string, context: any) => {
    try {
      const config = context.config?.custom || context.config || (context.model ? context : {});
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = config.apiKey || '';
      const modelId = context.model || config.model || CustomProvider.metadata.models[0];
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

      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: promptText });

      const payload: any = {
        model: overriddenModel,
        messages: messages,
        temperature: overriddenTemp
      };

      if (isJsonFormat) {
        payload.response_format = { type: 'json_object' };
      }

      const endpointUrl = `${baseUrl}/chat/completions`;

      const response = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: endpointUrl,
          method: 'POST',
          headers: computedHeaders,
          body: payload
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Custom Provider Connection Failed (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || "";
      return answer;
    } catch (e: any) {
      console.error("[CUSTOM_PROVIDER] Failed to execute chat completion:", e.message);
      throw e;
    }
  }
};
