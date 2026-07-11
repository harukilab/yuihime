import { ProviderModule, ModuleType } from '../../include/types';

export const GeminiProvider: ProviderModule = {
  metadata: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'High-performance model from Google DeepMind.',
    version: '2.1.0',
    type: ModuleType.PROVIDER,
    order: 1,
    models: [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    configSchema: {
      fields: {
        apiKey: { type: 'password', label: 'Primary API Key', description: 'Main Google AI Studio API key.' },
        model: { 
          type: 'select', 
          label: 'Primary Model', 
          dynamicOptions: true,
          options: [
            { label: 'Gemini 3.5 Flash (Recommended)', value: 'gemini-3.5-flash' },
            { label: 'Gemini 3.1 Flash Lite', value: 'gemini-3.1-flash-lite' },
            { label: 'Gemini 3.1 Pro (Heavy Reasoning)', value: 'gemini-3.1-pro-preview' },
            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
            { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
            { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' }
          ]
        },
        fallbackApiKey: { 
          type: 'password', 
          label: 'Fallback API Key', 
          description: 'Backup key used if the primary key exceeds quota (429) or fails.' 
        },
        fallbackModel: { 
          type: 'select', 
          label: 'Fallback Model', 
          description: 'Backup model automatically deployed if the primary model fails.',
          dynamicOptions: true,
          options: [
            { label: 'Gemini 3.5 Flash (Recommended)', value: 'gemini-3.5-flash' },
            { label: 'Gemini 3.1 Flash Lite', value: 'gemini-3.1-flash-lite' },
            { label: 'Gemini 3.1 Pro (Heavy Reasoning)', value: 'gemini-3.1-pro-preview' },
            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
            { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
            { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' }
          ]
        },
        apiKeysPool: {
          type: 'string',
          label: 'API Keys Pool',
          description: 'Comma-separated additional keys for dynamic rotation if the primary key fails.'
        },
        fallbackModelsPool: {
          type: 'string',
          label: 'Fallback Models Pool',
          description: 'Comma-separated fallback models for rotative failover sequence. Example: gemini-3.5-flash, gemini-3.1-flash-lite'
        },
        resilienceModels: {
          type: 'string',
          label: 'Resilience Models Pool',
          description: 'Comma-separated resilient deep-fallback models used if previous options fail.'
        },
        provFailoverSequence: {
          type: 'string',
          label: 'Cross-Provider Failover Sequence',
          description: 'Order of alternative backup providers if the entire Gemini provider fails.'
        },
        maxOutputTokens: {
          type: 'slider',
          min: 2048,
          max: 65536,
          step: 2048,
          default: 32768,
          label: 'Max Output Tokens Limit',
          description: 'Specifies the maximum output response token limit. Standard: 32768.'
        },
        legacyModels: {
          type: 'string',
          label: 'Legacy Models List',
          description: 'Comma-separated list of deprecated models to be automatically redirected.',
          default: 'gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.0-pro, gemini-2.0-flash-thinking, gemini-pro, gemini-ultra, gemini-1.0-pro'
        },
        legacyRedirectTarget: {
          type: 'select',
          label: 'Legacy Redirect Target',
          description: 'The stable target model designated to replace deprecated models.',
          default: 'gemini-3.5-flash',
          dynamicOptions: true,
          options: [
            { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
            { label: 'Gemini 3.1 Pro', value: 'gemini-3.1-pro-preview' },
            { label: 'Gemini 3.1 Flash Lite', value: 'gemini-3.1-flash-lite' },
            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' }
          ]
        }
      }
    }
  },
  getDynamicOptions: async (fieldName: string, config: any) => {
    if (fieldName === 'model' || fieldName === 'fallbackModel' || fieldName === 'legacyRedirectTarget') {
      return GeminiProvider.getModels ? await GeminiProvider.getModels(config) : [];
    }
    return [];
  },
  getModels: async (config: any) => {
    const staticGeminiOptions = [
      { label: 'Gemini 3.5 Flash (Recommended)', value: 'gemini-3.5-flash' },
      { label: 'Gemini 3.1 Flash Lite', value: 'gemini-3.1-flash-lite' },
      { label: 'Gemini 3.1 Pro (Heavy Reasoning)', value: 'gemini-3.1-pro-preview' },
      { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
      { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
      { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' }
    ];

    try {
      if (typeof window === 'undefined') {
        const { AIService } = await import('../../core/kernel/ai.js');
        const aiService = AIService.getInstance();
        const data = await aiService.listModels('gemini', config?.apiKey, config?.baseUrl || config?.endpoint);
        const fetched = (data.models || [])
          .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => {
            const id = m.name.split('/').pop();
            return {
              label: m.displayName || id,
              value: id
            };
          })
          .filter((m: any) => !['gemini-pro'].includes(m.value));

        const seen = new Set(fetched.map((m: any) => m.value));
        const merged = [...fetched];
        for (const opt of staticGeminiOptions) {
          if (!seen.has(opt.value)) {
            merged.push(opt);
          }
        }

        return merged.sort((a: any, b: any) => {
          if (a.value.includes('gemini-2.0') || a.value.includes('gemini-3')) return -1;
          if (b.value.includes('gemini-2.0') || b.value.includes('gemini-3')) return 1;
          return a.label.localeCompare(b.label);
        });
      }

      const apiKey = config.apiKey || '';
      const baseUrl = config.baseUrl || config.endpoint || '';
      
      let url = `/api/ai/models?provider=gemini`;
      if (apiKey) url += `&apiKey=${encodeURIComponent(apiKey)}`;
      if (baseUrl) url += `&baseUrl=${encodeURIComponent(baseUrl)}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        return staticGeminiOptions;
      }
      
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.warn("[GEMINI] Model discovery returned non-JSON response:", contentType);
        return staticGeminiOptions;
      }
      
      const text = await response.text();
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        console.warn("[GEMINI] Model discovery response text is not valid JSON structure, skipping parse.");
        return staticGeminiOptions;
      }
      
      const data = JSON.parse(text);
      
      const fetched = (data.models || [])
        .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => {
          const id = m.name.split('/').pop();
          return {
            label: m.displayName || id,
            value: id
          };
        })
        .filter((m: any) => !['gemini-pro'].includes(m.value));

      const seen = new Set(fetched.map((m: any) => m.value));
      const merged = [...fetched];
      for (const opt of staticGeminiOptions) {
        if (!seen.has(opt.value)) {
          merged.push(opt);
        }
      }

      return merged.sort((a: any, b: any) => {
        // Boost gemini-2.0 and gemini-3 to top
        if (a.value.includes('gemini-2.0') || a.value.includes('gemini-3')) return -1;
        if (b.value.includes('gemini-2.0') || b.value.includes('gemini-3')) return 1;
        return a.label.localeCompare(b.label);
      });
    } catch (e: any) {
      console.error("[GEMINI] Resilience Error during model discovery:", e.message || String(e));
      return staticGeminiOptions;
    }
  },
  generate: async (prompt: string, context: any) => {
    try {
      // Robust config resolution:
      // 1. context.config.gemini (Full settings object passed in think())
      // 2. context.config (Already specific config)
      // 3. context (Passed directly in thinkSimple())
      const config = context.config?.gemini || context.config || (context.model ? context : {});
      let modelId = config.model || GeminiProvider.metadata.models[0];
      
      // Normalize modelId to strip any provider prefixes like 'gemini:' or 'google/' and map to stable release if legacy/deprecated
      if (typeof modelId === 'string') {
        let clean = modelId.replace(/^models\//, '');
        if (clean.includes(':')) {
          const parts = clean.split(':');
          if (parts[0] === 'gemini' || parts[0] === 'google') {
            clean = parts[parts.length - 1];
          }
        }
        if (clean.includes('/')) {
          const parts = clean.split('/');
          if (parts[0] === 'google') {
            clean = parts[parts.length - 1];
          }
        }
        const legacyModelsStr = config.legacyModels || 'gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.0-pro, gemini-2.0-flash-thinking, gemini-pro, gemini-ultra, gemini-1.0-pro';
        const legacyRedirectTarget = config.legacyRedirectTarget || 'gemini-3.5-flash';
        
        const legacyModels = legacyModelsStr.split(',').map((m: string) => m.trim()).filter((m: string) => m.length > 0);
        
        if (legacyModels.includes(clean)) {
          clean = legacyRedirectTarget;
        }
        modelId = clean;
      }

      const blueprint = context.payloadBlueprint || config.payloadBlueprint;
      let systemInstructionText = context.assembledSystemPrompt || context.systemPrompt;
      let promptText = prompt;

      let overriddenConfig = { ...config };

      if (blueprint) {
        if (blueprint.model) {
          modelId = blueprint.model;
        }
        const sysMsg = blueprint.messages.find((m: any) => m.role === 'system');
        if (sysMsg) {
          systemInstructionText = sysMsg.content;
        }
        const usrMsg = blueprint.messages.find((m: any) => m.role === 'user');
        if (usrMsg) {
          promptText = usrMsg.content;
        }
        overriddenConfig.temperature = blueprint.temperature ?? overriddenConfig.temperature;
        overriddenConfig.topP = blueprint.top_p ?? overriddenConfig.topP;
        overriddenConfig.maxOutputTokens = blueprint.max_tokens ?? overriddenConfig.maxOutputTokens;
        if (blueprint.response_format) {
          overriddenConfig.isJson = blueprint.response_format.type === 'json_object';
        }
      }

      if (typeof window === 'undefined') {
        const { AIService } = await import('../../core/kernel/ai.js');
        const aiService = AIService.getInstance();
        return await aiService.generate(promptText, {
          model: modelId,
          systemInstruction: systemInstructionText,
          ...overriddenConfig,
          attachments: context.attachments,
          onChunk: context.onChunk
        });
      }

      const response = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: context.signal,
          body: JSON.stringify({
            prompt: promptText,
            systemInstruction: systemInstructionText,
            model: modelId,
            config: {
              ...overriddenConfig,
              apiKey: overriddenConfig.apiKey || overriddenConfig.api_key || null,
              payloadBlueprint: blueprint,
              attachments: context.attachments
            }
          })
        }
      );

      let data: any = {};
      try {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          // If not JSON, use the raw text if short or status statusText
          if (!response.ok) {
            throw new Error(`Server Error (${response.status}): ${text.substring(0, 100) || response.statusText}`);
          }
          data = { text };
        }
      } catch (e: any) {
        if (e.message.includes('Server Error')) throw e;
        throw new Error(`Network Error: ${e.message}. The Neural Kernel might be restarting or hitting cloud limits.`);
      }
      
      if (!response.ok) {
        const errorMsg = data.error?.message || data.message || `HTTP ${response.status}`;
        if (response.status === 429) {
          throw new Error(`[QUOTA EXCEEDED] ${errorMsg}`);
        } else if (response.status === 503) {
          throw new Error(`[SERVICE UNAVAILABLE] Google's API is currently overloaded. Retrying...`);
        }
        throw new Error(errorMsg);
      }

      return data.text || data.content || (typeof data === 'string' ? data : '');
    } catch (e: any) {
      console.error("[GEMINI] Generation Error:", e.message || String(e));
      throw e;
    }
  }
};

