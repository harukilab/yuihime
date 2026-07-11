import { SettingsManager } from '../settings.js';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listModels(
  provider: string = 'gemini',
  providedApiKey?: string,
  baseUrlOverride?: string
): Promise<any> {
  try {
    const settingsManager = SettingsManager.getInstance();
    const settings = await settingsManager.load();
    const apiKey = providedApiKey || settings[provider]?.apiKey || (provider === 'gemini' ? settingsManager.getApiKey() : '');
    const cleanProvider = provider.toLowerCase();

    // Get standard dynamic model discovery baseUrl override config (matching deepseek.js / getmodel.js API pattern)
    let baseUrl = baseUrlOverride || settings[provider]?.baseUrl || settings[provider]?.endpoint || '';
    if (!baseUrl) {
      if (cleanProvider === 'openai') baseUrl = 'https://api.openai.com/v1';
      else if (cleanProvider === 'deepseek') baseUrl = 'https://api.deepseek.com/v1';
      else if (cleanProvider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
      else if (cleanProvider === 'ollama') baseUrl = 'http://localhost:11434/v1';
      else if (cleanProvider === 'lmstudio') baseUrl = 'http://localhost:1234/v1';
      else if (cleanProvider === 'aihubmix') baseUrl = 'https://aihubmix.com/v1';
      else if (cleanProvider === '302_ai') baseUrl = 'https://api.302.ai/v1';
      else if (cleanProvider === 'openai_compatible') baseUrl = 'https://api.openai.com/v1';
      else if (cleanProvider === 'custom') baseUrl = 'https://api.openai.com/v1';
      else if (cleanProvider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
    }

    if (baseUrl && cleanProvider !== 'gemini' && cleanProvider !== 'openrouter') {
      try {
        const isLocalAddress = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('11434') || baseUrl.includes('1234');
        
        // Generate a list of candidate scan probe URLs depending on provider and base url structure
        const candidateUrls: string[] = [];
        const normalizedBase = baseUrl.replace(/\/$/, '');

        if (cleanProvider === 'ollama' || cleanProvider === 'local' || cleanProvider === 'lmstudio') {
          if (normalizedBase.endsWith('/v1')) {
            candidateUrls.push(`${normalizedBase}/models`);
            candidateUrls.push(`${normalizedBase.slice(0, -3)}/api/tags`);
          } else if (normalizedBase.endsWith('/api')) {
            candidateUrls.push(`${normalizedBase}/tags`);
            candidateUrls.push(`${normalizedBase.slice(0, -4)}/v1/models`);
          } else {
            // Bare port layout, e.g., http://localhost:11434 or local custom addresses
            candidateUrls.push(`${normalizedBase}/api/tags`);
            candidateUrls.push(`${normalizedBase}/v1/models`);
            candidateUrls.push(`${normalizedBase}/models`);
          }
        } else {
          // Standard OpenAI-compatible defaults
          candidateUrls.push(`${normalizedBase}/models`);
        }

        // Duplicate candidate URLs with 127.0.0.1 instead of localhost to prevent IPv6/IPv4 loopback resolution issue
        const finalCandidates: string[] = [];
        for (const url of candidateUrls) {
          finalCandidates.push(url);
          if (url.includes('localhost')) {
            finalCandidates.push(url.replace('localhost', '127.0.0.1'));
          }
        }

        // Strip duplicate entries
        const uniqueCandidates = Array.from(new Set(finalCandidates));

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        let successfulResponse: any = null;
        let matchedFormat: 'ollama' | 'openai' | null = null;

        for (const targetUrl of uniqueCandidates) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), isLocalAddress ? 2000 : 5000);
            
            console.log(`[SERVER_AI] Scanning model route: ${targetUrl}`);
            const response = await fetch(targetUrl, {
              method: 'GET',
              headers,
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              
              // Inspect response schema to determine response parser formatting
              if (data.models && Array.isArray(data.models)) {
                successfulResponse = data.models;
                matchedFormat = 'ollama';
                console.log(`[SERVER_AI] Discovered models via Ollama tags format at: ${targetUrl}`);
                break;
              } else if (data.data && Array.isArray(data.data)) {
                successfulResponse = data.data;
                matchedFormat = 'openai';
                console.log(`[SERVER_AI] Discovered models via OpenAI standard format at: ${targetUrl}`);
                break;
              } else if (data.models_list && Array.isArray(data.models_list)) {
                successfulResponse = data.models_list;
                matchedFormat = 'openai';
                console.log(`[SERVER_AI] Discovered models via generic DB list at: ${targetUrl}`);
                break;
              }
            } else {
              console.log(`[SERVER_AI] Dynamic route fetch status ${response.status} at ${targetUrl}`);
            }
          } catch (err: any) {
            console.log(`[SERVER_AI] Dynamic route probe bypassed/failed for ${targetUrl}: ${err.message}`);
          }
        }

        if (successfulResponse) {
          if (matchedFormat === 'ollama') {
            return {
              models: successfulResponse.map((m: any) => ({
                name: m.name || m.model || m.id,
                displayName: m.name || m.model || m.id,
                supportedGenerationMethods: ['generateContent']
              })).sort((a: any, b: any) => a.displayName.localeCompare(b.displayName))
            };
          } else {
            return {
              models: successfulResponse.map((m: any) => ({
                name: m.id || m.name,
                displayName: m.id || m.name,
                supportedGenerationMethods: ['generateContent']
              })).sort((a: any, b: any) => a.displayName.localeCompare(b.displayName))
            };
          }
        }
      } catch (fetchErr: any) {
        console.log(`[SERVER_AI] Dynamic model scanning exception thrown for ${baseUrl}: ${fetchErr.message}`);
      }
    }

    if (cleanProvider === 'openrouter') {
      try {
        const response = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
        }, 2000);
        if (response.ok) {
          const data = await response.json();
          return {
            models: data.data.map((m: any) => ({
              name: `models/${m.id}`,
              displayName: m.name,
              supportedGenerationMethods: ['generateContent']
            }))
          };
        }
      } catch (fetchErr) {
        console.log('[SERVER_AI] OpenRouter dynamic models fetch offline, using static options:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }
    }

    if (cleanProvider === 'gemini') {
      try {
        if (apiKey || baseUrl) {
          const finalBaseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
          const cleanBaseUrl = finalBaseUrl.replace(/\/$/, '');
          
          let data: any = null;
          // Only query Google APIs directly with a key if we're using the standard base URL and have an API key.
          // Otherwise, if custom baseUrl is defined (like a proxy), try standard query routes.
          if (cleanBaseUrl.includes('generativelanguage.googleapis.com') && !apiKey) {
            // Standard google query requires an API key, skip if not available
          } else {
            const apiQueryKey = apiKey ? `?key=${apiKey}` : '';
            let response: Response | null = null;
            try {
              response = await fetchWithTimeout(`${cleanBaseUrl}/v1beta/models${apiQueryKey}`, {}, 2000);
            } catch (err) {
              // Ignore and proceed to fallback
            }
            if (response && response.ok) {
              data = await response.json();
            } else {
              let v1Res: Response | null = null;
              try {
                v1Res = await fetchWithTimeout(`${cleanBaseUrl}/v1/models${apiQueryKey}`, {}, 2000);
              } catch (err) {
                // Ignore and proceed to fallback
              }
              if (v1Res && v1Res.ok) {
                data = await v1Res.json();
              } else {
                // Try standard OpenAI-compatible custom gateway layout
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                
                let pRes: Response | null = null;
                try {
                  pRes = await fetchWithTimeout(`${cleanBaseUrl}/models`, { headers }, 2000);
                } catch (err) {
                  // Ignore
                }
                if (pRes && pRes.ok) {
                  const pData = await pRes.json();
                  if (pData.data && Array.isArray(pData.data)) {
                    data = {
                      models: pData.data.map((m: any) => ({
                        name: m.id.startsWith('models/') ? m.id : `models/${m.id}`,
                        displayName: m.id,
                        supportedGenerationMethods: ['generateContent']
                      }))
                    };
                  }
                }
              }
            }
          }
          
          const staticGeminiModels = [
            { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash (Recommended)', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Heavy Reasoning)', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', supportedGenerationMethods: ['generateContent'] }
          ];

          if (data) {
            // Auto normalize OpenAI schema to Gemini schema on the fly
            if (data.data && Array.isArray(data.data)) {
              data = {
                models: data.data.map((m: any) => ({
                  name: m.id.startsWith('models/') ? m.id : `models/${m.id}`,
                  displayName: m.id,
                  supportedGenerationMethods: ['generateContent']
                }))
              };
            }
            if (data.models && Array.isArray(data.models)) {
              const fetchedNames = new Set(data.models.map((m: any) => m.name));
              const mergedModels = [...data.models];
              for (const s of staticGeminiModels) {
                if (!fetchedNames.has(s.name)) {
                  mergedModels.push(s);
                }
              }
              return { models: mergedModels };
            }
          }
        }
      } catch (fetchErr) {
        console.log('[SERVER_AI] Gemini dynamic models fetch skipped or offline, using static options:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }
      return {
        models: [
          { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash (Recommended)', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Heavy Reasoning)', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', supportedGenerationMethods: ['generateContent'] }
        ]
      };
    }

    // Predefined default static fallback models for all 30+ other provider profiles
    const defaultModelsByProvider: Record<string, Array<{ name: string; displayName: string }>> = {
      official_chat: [
        { name: 'airi-lite', displayName: 'AIRI Lite (Markov / Quick-Reflex)' },
        { name: 'airi-heavy', displayName: 'AIRI Heavy (Local LLM Router)' },
        { name: 'airi-vision', displayName: 'AIRI Vision' }
      ],
      openai: [
        { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
        { name: 'gpt-4o', displayName: 'GPT-4o (High Reasoning)' },
        { name: 'o1-mini', displayName: 'OpenAI o1-mini' }
      ],
      anthropic: [
        { name: 'claude-3-5-sonnet-latest', displayName: 'Claude 3.5 Sonnet' },
        { name: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku' },
        { name: 'claude-3-opus-latest', displayName: 'Claude 3 Opus' }
      ],
      deepseek: [
        { name: 'deepseek-chat', displayName: 'DeepSeek Chat (V3)' },
        { name: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner (R1)' }
      ],
      groq: [
        { name: 'llama-3.1-70b-versatile', displayName: 'Llama 3.1 70B (Groq)' },
        { name: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (Groq)' },
        { name: 'gemma2-9b-it', displayName: 'Gemma 2 9B (Groq)' }
      ],
      ollama: [
        { name: 'llama3', displayName: 'Llama 3' },
        { name: 'mistral', displayName: 'Mistral' },
        { name: 'gemma2', displayName: 'Gemma 2' },
        { name: 'phi3', displayName: 'Phi 3' }
      ],
      lmstudio: [
        { name: 'meta-llama-3-8b-instruct', displayName: 'Llama 3 8B (LM Studio)' },
        { name: 'mistral-7b-instruct', displayName: 'Mistral 7B (LM Studio)' }
      ],
      aihubmix: [
        { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini (AIHubMix)' },
        { name: 'gpt-4o', displayName: 'GPT-4o (AIHubMix)' },
        { name: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet (AIHubMix)' }
      ],
      azure_openai: [
        { name: 'gpt-4o', displayName: 'Azure GPT-4o' },
        { name: 'gpt-4o-mini', displayName: 'Azure GPT-4o-mini' }
      ],
      openai_compatible: [
        { name: 'custom-model', displayName: 'Custom Compatible Model' }
      ],
      xiaomi_mimo_chat: [
        { name: 'mimo-gpt-4o', displayName: 'MiMo GPT-4o' },
        { name: 'mimo-lite', displayName: 'MiMo Lite' }
      ],
      '302_ai': [
        { name: 'gpt-4o', displayName: 'GPT-4o (302.AI)' },
        { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini (302.AI)' }
      ],
      volc_coding: [
        { name: 'doubao-coder-pro', displayName: 'Doubao Coder Pro' },
        { name: 'doubao-coder-lite', displayName: 'Doubao Coder Lite' }
      ],
      byteplus: [
        { name: 'byteplus-heavy', displayName: 'BytePlus Pro' },
        { name: 'byteplus-lite', displayName: 'BytePlus Lite' }
      ],
      byteplus_coding: [
        { name: 'byteplus-coder-heavy', displayName: 'BytePlus Coder Pro' }
      ],
      n1n: [
        { name: 'n1n-general', displayName: 'n1n General Core' }
      ],
      azure_ai_foundry: [
        { name: 'azure-foundry-default', displayName: 'Foundry Default' }
      ],
      bedrock: [
        { name: 'anthropic.claude-3-sonnet-20240229-v1:0', displayName: 'AWS Claude 3 Sonnet' },
        { name: 'meta.llama3-8b-instruct-v1:0', displayName: 'AWS Llama 3' }
      ],
      cerebras: [
        { name: 'llama3.1-8b', displayName: 'Llama 3.1 8B (Cerebras)' },
        { name: 'llama3.1-70b', displayName: 'Llama 3.1 70B (Cerebras)' }
      ],
      cloudflare_ai: [
        { name: '@cf/meta/llama-3-8b-instruct', displayName: 'CF Llama 3 8B' },
        { name: '@cf/mistral/mistral-7b-instruct-v0.1', displayName: 'CF Mistral 7B' }
      ],
      comet_api_chat: [
        { name: 'gpt-4o', displayName: 'Comet GPT-4o' }
      ],
      featherless: [
        { name: 'featherless-open-llama', displayName: 'Featherless Open Llama' }
      ],
      fireworks: [
        { name: 'accounts/fireworks/models/llama-v3-70b-instruct', displayName: 'Fireworks Llama 3 70B' }
      ],
      minimax: [
        { name: 'abab6.5-chat', displayName: 'MiniMax abab6.5' },
        { name: 'abab6.5g-chat', displayName: 'MiniMax abab6.5g' }
      ],
      minimax_global: [
        { name: 'minimax-global-chat', displayName: 'MiniMax Global Core' }
      ],
      mistral: [
        { name: 'mistral-large-latest', displayName: 'Mistral Large' },
        { name: 'mistral-medium-latest', displayName: 'Mistral Medium' },
        { name: 'open-mixtral-8x22b', displayName: 'Mixtral 8x22B' }
      ],
      modelscope: [
        { name: 'qwen-max', displayName: 'ModelScope Qwen Max' }
      ],
      moonshot: [
        { name: 'moonshot-v1-8k', displayName: 'Kimi Moonshot 8K' },
        { name: 'moonshot-v1-32k', displayName: 'Kimi Moonshot 32K' },
        { name: 'moonshot-v1-128k', displayName: 'Kimi Moonshot 128K' }
      ],
      novita: [
        { name: 'novita-llama-3', displayName: 'Novita Llama 3' }
      ],
      perplexity: [
        { name: 'llama-3-sonar-large-32k-online', displayName: 'Sonar 70B Online' },
        { name: 'llama-3-sonar-small-32k-online', displayName: 'Sonar 8B Online' }
      ],
      together_ai: [
        { name: 'meta-llama/Meta-Llama-3-70B-Instruct', displayName: 'Together Llama 3 70B' }
      ],
      z_ai: [
        { name: 'z-ai-default', displayName: 'Z.ai Standard' }
      ],
      xai: [
        { name: 'grok-beta', displayName: 'Grok Beta' },
        { name: 'grok-2-1212', displayName: 'Grok 2' }
      ]
    };

    const matchedModels = defaultModelsByProvider[cleanProvider] || [
      { name: 'default-model', displayName: `${provider.toUpperCase()} Standard Model` }
    ];

    return {
      models: matchedModels.map(m => ({
        name: m.name.startsWith('models/') ? m.name : `models/${m.name}`,
        displayName: m.displayName,
        supportedGenerationMethods: ['generateContent']
      }))
    };

  } catch (e: any) {
    console.log(`[SERVER_AI] Swallowed internal exception in model-listing for ${provider}:`, e?.message || e);
    return { models: [] };
  }
}
