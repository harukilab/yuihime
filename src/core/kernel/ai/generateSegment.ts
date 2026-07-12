import { SettingsManager } from '../settings.js';
import { AIConfig } from './aiTypes.js';

function summarizeAiError(error: any): string {
  const raw = error?.message || String(error);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) {
      const e = parsed.error;
      const details = Array.isArray(e.details) ? e.details : [];
      const quota = details.find((d: any) => d?.quotaMetric)?.quotaMetric || '';
      const retry = details.find((d: any) => d?.retryDelay)?.retryDelay || '';
      const parts = [
        `HTTP ${e.code || ''}`.trim(),
        e.status,
        e.message?.split('\n')[0],
        quota && `quota:${quota}`,
        retry && `retry:${retry}`
      ].filter(Boolean);
      return parts.join(' | ');
    }
  } catch {}
  return raw.split('\n')[0].slice(0, 240);
}

export async function generateContent(
  prompt: string,
  config: AIConfig & { apiKey?: string; onChunk?: (chunk: string) => void } = {}
): Promise<string> {
  const settings = SettingsManager.getInstance();
  // Resolve effective Gemini settings from every supported storage location
  // (flat `gemini`, the `providers.gemini` table, and the per-request `config`)
  // so fallback models/keys configured anywhere are always honored. Previously
  // only the flat `gemini` key was read, which silently dropped fallbacks when
  // the config lived under `providers.gemini` or was passed via `config`.
  const providersTable = (settings.get('providers') as any) || {};
  const geminiSettings: any = {
    ...(providersTable.gemini || {}),
    ...(settings.get('gemini') || {}),
    ...((config && typeof config === 'object') ? config : {})
  };
  let defaultGeminiModel = '';
  try {
    const { SystemRegistry } = await import('../../registry.js');
    const geminiModule = SystemRegistry.getProvider('gemini');
    if (geminiModule && geminiModule.metadata?.models?.length > 0) {
      defaultGeminiModel = geminiModule.metadata.models[0];
    }
  } catch (e) {}

   const model = config.model || geminiSettings.model || defaultGeminiModel;
   if (!model) {
     throw new Error('Sirkuit kognitif gagal berdenyut: Silakan pilih model kognitif di panel Settings atau aktifkan Model di tab Providers.');
   }
   const fallbackApiKey = geminiSettings.fallbackApiKey;
   
   const resolveModelIdName = (rawModel: string): string => {
     let clean = rawModel.replace(/^models\//, '');
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
     return clean;
   };

  const cleanModelId = resolveModelIdName(model);

  const runWithRetries = async (customPrompt?: string): Promise<string> => {
    const activePrompt = customPrompt || prompt;
    const primaryKey = config.apiKey || settings.getApiKey();
    const fallbackKey = fallbackApiKey;

    // Kumpulkan seluruh API Key unik dalam urutan prioritas
    const allKeys: string[] = [];
    const addKeys = (raw: string | undefined | null) => {
      if (!raw) return;
      const keys = raw
        .split(/[\n,;]+/)
        .map(k => k.trim())
        .filter(k => k.length > 0 && !k.toLowerCase().includes('your_api_key'));
      for (const k of keys) {
        if (!allKeys.includes(k)) {
          allKeys.push(k);
        }
      }
    };

    addKeys(primaryKey);
    addKeys(fallbackKey);
    addKeys(geminiSettings.apiKeysPool);

    // System Env Key fallback
    const systemEnvKey = typeof window === 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : undefined;
    if (systemEnvKey && systemEnvKey.trim() !== '') {
      addKeys(systemEnvKey);
    }

    // Kumpulkan seluruh model cadangan dalam urutan prioritas
    const allModels: string[] = [];
    const addModels = (raw: string | undefined | null) => {
      if (!raw) return;
      const models = raw
        .split(/[\n,;]+/)
        .map(m => m.trim())
        .filter(m => m.length > 0);
      for (const m of models) {
        const clean = resolveModelIdName(m);
        if (!allModels.includes(clean)) {
          allModels.push(clean);
        }
      }
    };

    addModels(cleanModelId);
    
    const fallbackModels = Array.isArray(geminiSettings.fallbackModels) 
      ? geminiSettings.fallbackModels 
      : (geminiSettings.fallbackModels ? geminiSettings.fallbackModels.split(/[\n,;]+/).map((m: string) => m.trim()).filter((m: string) => m.length > 0) : []);
    for (const fm of fallbackModels) {
      const clean = resolveModelIdName(fm);
      if (!allModels.includes(clean)) {
        allModels.push(clean);
      }
    }
    
    if (geminiSettings.fallbackModel) {
      const clean = resolveModelIdName(geminiSettings.fallbackModel);
      if (!allModels.includes(clean)) {
        allModels.push(clean);
      }
    }
    
    addModels(geminiSettings.resilienceModels);
    addModels(geminiSettings.fallbackModelsPool);

    // Prioritas sirkuit kognitif yang akan dicoba
    const attemptsToTry: Array<{ apiKey: string; modelId: string; label: string }> = [];

    for (const modelId of allModels) {
      for (let i = 0; i < allKeys.length; i++) {
        const key = allKeys[i];
        let keyLabel = `Key #${i + 1}`;
        if (key === primaryKey) keyLabel = 'Key Utama';
        else if (key === fallbackKey) keyLabel = 'Key Cadangan';
        else if (key === systemEnvKey) keyLabel = 'System Env Key';
        else keyLabel = `Pool Key #${i - 1}`;

        attemptsToTry.push({
          apiKey: key,
          modelId: modelId,
          label: `${keyLabel} + Model ${modelId}`
        });
      }
    }

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const rateLimitedKeys = new Set<string>();
    let lastError: any = null;
    for (const attempt of attemptsToTry) {
      if (!attempt.apiKey) continue;
      
      if (rateLimitedKeys.has(attempt.apiKey)) {
        const hasOtherGoodKey = attemptsToTry.some(a => a.apiKey && a.apiKey !== attempt.apiKey && !rateLimitedKeys.has(a.apiKey));
        if (hasOtherGoodKey) {
          console.log(`[SERVER_AI] Memangkas / skip sirkuit: ${attempt.label} karena API Key ini terdeksi limit kuota (429) dan ada API Key cadangan lain.`);
          continue;
        }
      }
      
      const maxRetriesPerAttempt = 3;
      for (let retryCount = 0; retryCount < maxRetriesPerAttempt; retryCount++) {
        try {
          if (retryCount > 0) {
            let backoffMs = Math.pow(2, retryCount) * 1000; // Base backoff 2s, 4s

            if (lastError) {
              const lastErrBody = lastError.message || String(lastError);
              const retryMatch = lastErrBody.match(/Please retry in ([0-9.]+)\s*s/i);
              if (retryMatch && retryMatch[1]) {
                const cooldownSec = parseFloat(retryMatch[1]);
                if (!isNaN(cooldownSec)) {
                  backoffMs = Math.ceil(cooldownSec * 1000) + 1500; // sleep cooldown + 1.5s security buffer
                  console.warn(`[SERVER_AI] Mengaplikasikan penundaan kognitif cerdas (API rate limit 429) sebesar ${backoffMs}ms sebelum retry #${retryCount}...`);
                }
              } else if (lastErrBody.includes('503') || lastErrBody.toLowerCase().includes('overloaded') || lastErrBody.toLowerCase().includes('unavailable')) {
                backoffMs = Math.pow(2, retryCount) * 3000; // 6s, 12s backoff for 503 overloaded
                console.warn(`[SERVER_AI] Google API mendeteksi overload (503). Menjadwalkan pending sebesar ${backoffMs}ms sebelum retry #${retryCount}...`);
              }
            }

            console.log(`[SERVER_AI] Retrying attempt ${attempt.label} (retry #${retryCount}) in ${backoffMs}ms...`);
            await sleep(backoffMs);
          }

          console.log(`[SERVER_AI] Mencoba sirkuit kognitif: ${attempt.label} (Percobaan #${retryCount + 1})...`);
          
          const finalBaseUrl = (geminiSettings.baseUrl || geminiSettings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
          const apiVersion = geminiSettings.apiVersion || 'v1beta';
          
          let targetUrl = '';
          if (finalBaseUrl.includes('/models/') || finalBaseUrl.includes(':generateContent')) {
            targetUrl = finalBaseUrl;
          } else {
            targetUrl = `${finalBaseUrl}/${apiVersion}/models/${attempt.modelId}:generateContent?key=${attempt.apiKey}`;
          }

          const genConfig: any = {
            temperature: (config.temperature ?? 0.7) > 0 ? (config.temperature ?? 0.7) : 0,
            topP: config.topP ?? 0.95,
            topK: config.topK ?? 40,
            maxOutputTokens: config.maxOutputTokens || geminiSettings.maxOutputTokens || 65536,
          };
          if (config.isJson) {
            genConfig.responseMimeType = "application/json";
          }

          let systemInstructionText = config.systemInstruction;
          
          let contentsArray: any[] = [];
          const partsToUse: any[] = [{ text: activePrompt }];
          
          if (config.attachments && Array.isArray(config.attachments)) {
            for (const att of config.attachments) {
              if (att.base64) {
                const base64Data = att.base64.replace(/^data:[\w/+-]+;base64,/, "");
                const mimeType = att.base64.match(/^data:([\w/+-]+);base64,/)?.[1] || att.mimeType || "image/jpeg";
                partsToUse.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                  }
                });
              }
            }
          }

          if (attempt.modelId.includes('gemma') || attempt.modelId.includes('gemma-4')) {
            // For Gemma models, prepend the system instruction directly into the user contents to ensure it is obeyed!
            const promptWithSystem = systemInstructionText 
              ? `[SYSTEM INSTRUCTION & PERSONALITY]\n${systemInstructionText}\n\n[USER INPUT]\n${activePrompt}`
              : activePrompt;
            partsToUse[0] = { text: promptWithSystem };
            contentsArray = [{ role: 'user', parts: partsToUse }];
            systemInstructionText = undefined; // clear out systemInstruction to prevent API mismatch/ignore
          } else {
            contentsArray = [{ role: 'user', parts: partsToUse }];
          }

          const requestBody: any = {
            contents: contentsArray,
            generationConfig: genConfig,
          };

          if (config.tools) {
            requestBody.tools = config.tools;
          }

          if (systemInstructionText) {
            requestBody.systemInstruction = {
              parts: [{ text: systemInstructionText }]
            };
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'aistudio-build'
          };

          // If standard domain is replaced or user specified useHeaderOption, map authorization headers
          if (geminiSettings.useHeaderApiKey || finalBaseUrl.includes('api.openai.com') || finalBaseUrl.includes('openrouter.ai')) {
            headers['Authorization'] = `Bearer ${attempt.apiKey}`;
            headers['x-goog-api-key'] = attempt.apiKey;
          }

          let finalTargetUrl = targetUrl;
          if (config.onChunk) {
            finalTargetUrl = targetUrl.replace(':generateContent', ':streamGenerateContent');
          }

          const fetchController = new AbortController();
          const requestTimeout = setTimeout(() => fetchController.abort(), 90000); // 90 second generation limit
          
          const res = await fetch(finalTargetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: fetchController.signal
          });
          clearTimeout(requestTimeout);

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP Error ${res.status}: ${errText}`);
          }

          if (config.onChunk) {
            const reader = res.body;
            if (!reader) {
              throw new Error("No response body available for streaming");
            }
            
            const decoder = new TextDecoder("utf-8");
            let accumulated = "";
            let fullText = "";
            let braceCount = 0;
            let startIndex = -1;
            let inString = false;
            let escapeNext = false;
            let lastParsedIndex = 0;

            for await (const rawChunk of reader as any) {
              const chunkStr = typeof rawChunk === 'string' ? rawChunk : decoder.decode(rawChunk, { stream: true });
              accumulated += chunkStr;

              while (lastParsedIndex < accumulated.length) {
                const char = accumulated[lastParsedIndex];
                if (escapeNext) {
                  escapeNext = false;
                  lastParsedIndex++;
                  continue;
                }

                if (char === '\\') {
                  escapeNext = true;
                  lastParsedIndex++;
                  continue;
                }

                if (char === '"') {
                  inString = !inString;
                }

                if (!inString) {
                  if (char === '{') {
                    if (braceCount === 0) {
                      startIndex = lastParsedIndex;
                    }
                    braceCount++;
                  } else if (char === '}') {
                    if (braceCount > 0) {
                      braceCount--;
                      if (braceCount === 0 && startIndex !== -1) {
                        const jsonStr = accumulated.substring(startIndex, lastParsedIndex + 1);
                        try {
                          const obj = JSON.parse(jsonStr);
                          const candidates = obj.candidates?.[0];
                          const parts = candidates?.content?.parts || [];
                          let partText = "";
                          for (const part of parts) {
                            if (part.text) {
                              partText += part.text;
                            }
                          }
                          if (partText) {
                            fullText += partText;
                            config.onChunk(partText);
                          }
                          
                          // Only slice accumulated and reset search pointers upon successful parsing!
                          accumulated = accumulated.substring(lastParsedIndex + 1);
                          lastParsedIndex = 0;
                          startIndex = -1;
                          braceCount = 0;
                          inString = false;
                          escapeNext = false;
                          continue;
                        } catch (err) {
                          // malformed JSON block (could be partial or fake balance), do NOT slice or reset.
                          // Keep scanning in next cycles.
                        }
                      }
                    }
                  }
                }
                lastParsedIndex++;
              }
            }

            // Flush the decoder
            const remaining = decoder.decode();
            if (remaining) {
              accumulated += remaining;
              while (lastParsedIndex < accumulated.length) {
                const char = accumulated[lastParsedIndex];
                if (escapeNext) {
                  escapeNext = false;
                  lastParsedIndex++;
                  continue;
                }
                if (char === '\\') {
                  escapeNext = true;
                  lastParsedIndex++;
                  continue;
                }
                if (char === '"') {
                  inString = !inString;
                }
                if (!inString) {
                  if (char === '{') {
                    if (braceCount === 0) {
                      startIndex = lastParsedIndex;
                    }
                    braceCount++;
                  } else if (char === '}') {
                    if (braceCount > 0) {
                      braceCount--;
                      if (braceCount === 0 && startIndex !== -1) {
                        const jsonStr = accumulated.substring(startIndex, lastParsedIndex + 1);
                        try {
                          const obj = JSON.parse(jsonStr);
                          const candidates = obj.candidates?.[0];
                          const parts = candidates?.content?.parts || [];
                          let partText = "";
                          for (const part of parts) {
                            if (part.text) {
                              partText += part.text;
                            }
                          }
                          if (partText) {
                            fullText += partText;
                            config.onChunk(partText);
                          }
                          accumulated = accumulated.substring(lastParsedIndex + 1);
                          lastParsedIndex = 0;
                          startIndex = -1;
                          braceCount = 0;
                          inString = false;
                          escapeNext = false;
                          continue;
                        } catch (err) {}
                      }
                    }
                  }
                }
                lastParsedIndex++;
              }
            }
            
            console.log(`[SERVER_AI] Sirkuit kognitif streaming sukses dengan ${attempt.label}.`);
            return fullText;
          } else {
            const resJson: any = await res.json();
            const parts = resJson.candidates?.[0]?.content?.parts || [];
            let text = '';
            const mainPart = parts.find((p: any) => p.text && !p.thought);
            if (mainPart) {
              text = mainPart.text;
            } else {
              text = parts.map((p: any) => p.text || '').join('').trim();
            }
            if (!text) {
              throw new Error(`Invalid response schema from Gemini API: ${JSON.stringify(resJson)}`);
            }
            
            console.log(`[SERVER_AI] Sirkuit kognitif berdenyut sukses (NATIVE FETCH) dengan ${attempt.label}.`);
            return text;
          }
        } catch (error: any) {
          lastError = error;
          const errorBody = error.message || String(error);
          console.error(`[SERVER_AI] Sirkuit ${attempt.label} gagal pada Percobaan #${retryCount + 1}:`, summarizeAiError(error));
          
          const isQuotaOrRateLimit = errorBody.includes('429') || 
                                     errorBody.toLowerCase().includes('quota') || 
                                     errorBody.toLowerCase().includes('rate') || 
                                     errorBody.toLowerCase().includes('exhausted');

          const isAbort = error.name === 'AbortError' || errorBody.toLowerCase().includes('abort');
          const isNetworkError = errorBody.toLowerCase().includes('fetch failed') || 
                                 errorBody.toLowerCase().includes('econnreset') || 
                                 errorBody.toLowerCase().includes('socket') || 
                                 errorBody.toLowerCase().includes('timeout');

          const isRetriable = (errorBody.includes('503') || 
                               errorBody.toLowerCase().includes('overloaded') || 
                               errorBody.toLowerCase().includes('temporary') || 
                               errorBody.toLowerCase().includes('demand') || 
                               errorBody.toLowerCase().includes('unavailable') ||
                               isAbort ||
                               isNetworkError) && 
                              !isQuotaOrRateLimit;
          
          // If out of quota, register API key in blocklist temporarily for this cycle
          if (isQuotaOrRateLimit) {
            console.warn(`[SERVER_AI] API Key ${attempt.apiKey.substring(0, 6)}... terdeteksi kehabisan kuota atau terkena batasan rate limit (429). Mencegah sirkuit lanjutan memakai key ini jika ada key cadangan lain.`);
            rateLimitedKeys.add(attempt.apiKey);
          }

          // Force fail fast for quota/rate limits to jump immediately to the next fallback candidate/model instead of sleeping for 60 seconds
          if (!isRetriable || isQuotaOrRateLimit || retryCount === maxRetriesPerAttempt - 1) {
            break;
          }
        }
      }
    }

    if (attemptsToTry.length === 0) {
      throw new Error("Semua sirkuit kognitif dan jalur cadangan AI gagal: Tidak ada API Key yang dikonfigurasi untuk Gemini. Silakan isi API Key Anda di panel Settings (tab Providers atau tab System) di antarmuka web Yuihime, atau setel variabel lingkungan GEMINI_API_KEY di berkas .env / config.toml Anda!");
    }

    throw lastError || new Error("Semua sirkuit kognitif dan jalur cadangan AI gagal.");
  };

  let response: string;
  let usedProvider = settings.get('provider') || 'gemini';
  let usedModel = model;

  // Auto-detect actual provider and model from model string prefixes (e.g. "openai:gpt-4o")
  if (model && typeof model === 'string') {
    if (model.includes(':')) {
      const parts = model.split(':');
      usedProvider = parts[0];
      usedModel = parts.slice(1).join(':');
    } else if (model.includes('/')) {
      const parts = model.split('/');
      if (parts[0] !== 'models' && parts[0] !== 'google') {
        usedProvider = parts[0];
        usedModel = parts.slice(1).join('/');
      }
    }
  }

  // Also check if custom baseUrl implies a specific provider
  if (usedProvider === 'gemini') {
    const finalBaseUrl = (geminiSettings.baseUrl || geminiSettings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    if (finalBaseUrl.includes('openrouter.ai')) {
      usedProvider = 'openrouter';
    } else if (finalBaseUrl.includes('deepseek.com')) {
      usedProvider = 'deepseek';
    } else if (finalBaseUrl.includes('groq.com')) {
      usedProvider = 'groq';
    } else if (finalBaseUrl.includes('openai.com')) {
      usedProvider = 'openai';
    } else if (finalBaseUrl.includes('anthropic.com')) {
      usedProvider = 'anthropic';
    } else if (finalBaseUrl.includes('localhost') || finalBaseUrl.includes('127.0.0.1')) {
      usedProvider = 'local';
    }
  }

  try {
    response = await runWithRetries();
  } catch (primaryErr: any) {
    const fallbackChain = geminiSettings.fallbackChain || [];
    if (fallbackChain && fallbackChain.length > 0) {
      console.log(`[SERVER_AI] All standard Gemini attempts failed. Entering user's custom fallbackChain cascade...`);
      let successResponse: string | null = null;
      for (const item of fallbackChain) {
        const providerId = item.provider;
        const modelId = item.model;
        const customApiKey = item.apiKey;
        const customBaseUrl = item.baseUrl;

        try {
          let resolvedProviderId = providerId;
          let baseUrlOverride = undefined;

          if (providerId === 'ollama') {
            resolvedProviderId = 'local';
          } else if (providerId === 'deepseek' || providerId === 'groq') {
            resolvedProviderId = 'openai';
            baseUrlOverride = providerId === 'deepseek'
              ? 'https://api.deepseek.com/v1'
              : 'https://api.groq.com/openai/v1';
          }

          const { SystemRegistry } = await import('../../registry.js');
          const provider = SystemRegistry.getProvider(resolvedProviderId);
          if (provider) {
            console.log(`[SERVER_AI_FALLBACK] Attempting fallback step to provider: ${providerId} (using actual driver: ${resolvedProviderId}, model: ${modelId})`);
            const fallbackConfig = {
              ...(config || {}),
              ...(settings.get(resolvedProviderId) || {}),
              ...(settings.get(providerId) || {}),
              model: modelId,
              apiKey: customApiKey || settings.get(providerId)?.apiKey || settings.get(resolvedProviderId)?.apiKey
            };
            if (customBaseUrl) {
              fallbackConfig.baseUrl = customBaseUrl;
            } else if (baseUrlOverride) {
              fallbackConfig.baseUrl = baseUrlOverride;
            }
            
            const result = await provider.generate(prompt, {
              systemInstruction: config.systemInstruction,
              config: fallbackConfig
            });
            
            console.log(`[SERVER_AI_FALLBACK] Fallback step to ${providerId} succeeded!`);
            successResponse = result;
            usedProvider = providerId;
            usedModel = modelId;
            break;
          }
        } catch (fbErr: any) {
          console.error(`[SERVER_AI_FALLBACK] Fallback step to ${providerId} failed:`, fbErr.message);
        }
      }
      if (successResponse !== null) {
        response = successResponse;
      } else {
        try {
          const auditorPath = '../../server/llmAuditor.js';
          const { LlmIoAuditor } = await import(auditorPath);
          LlmIoAuditor.recordLog({
            prompt,
            systemInstruction: config.systemInstruction,
            model: usedModel || model || 'unknown',
            provider: usedProvider || 'gemini',
            error: primaryErr?.message || String(primaryErr)
          });
        } catch (auditErr) {}
        throw primaryErr;
      }
    } else {
      try {
        const auditorPath = '../../server/llmAuditor.js';
        const { LlmIoAuditor } = await import(auditorPath);
        LlmIoAuditor.recordLog({
          prompt,
          systemInstruction: config.systemInstruction,
          model: usedModel || model || 'unknown',
          provider: usedProvider || 'gemini',
          error: primaryErr?.message || String(primaryErr)
        });
      } catch (auditErr) {}
      throw primaryErr;
    }
  }
  let rawResponse = response;

  try {
    const auditorPath = '../../server/llmAuditor.js';
    const { LlmIoAuditor } = await import(auditorPath);
    LlmIoAuditor.recordLog({
      prompt,
      systemInstruction: config.systemInstruction,
      model: usedModel || 'unknown',
      provider: usedProvider || 'gemini',
      response: rawResponse
    });
  } catch (auditErr) {}

  // --- UNIVERSAL TAG ENFORCEMENT ---
  const systemInstructionText = config.systemInstruction || '';
  const isDialogue = !config.isJson && (
    prompt.includes('[IDENTITY]') || 
    prompt.includes('[CHARACTER]') || 
    prompt.includes('<thought>') || 
    systemInstructionText.includes('Yuihime') || 
    systemInstructionText.includes('<thought>')
  );
  
  // Note: Tag validation is handled globally in NeuralVerifierModule.
  return rawResponse;
}

export async function executeGoogleSearch(query: string): Promise<any[]> {
  const { SettingsManager } = await import('../settings.js');
  const settings = SettingsManager.getInstance();
  
  // 1. Attempt Native Google Search Grounding if a Gemini API Key is available
  const geminiSettings = settings.get('gemini') || {};
  let defaultGeminiModel = 'gemini-3.5-flash';
  
  try {
    const { SystemRegistry } = await import('../../registry.js');
    const geminiModule = SystemRegistry.getProvider('gemini');
    if (geminiModule && geminiModule.metadata?.models?.length > 0) {
      defaultGeminiModel = geminiModule.metadata.models[0];
    }
  } catch (e) {}

  const primaryKey = settings.getApiKey();
  const fallbackKey = geminiSettings.fallbackApiKey;

  const geminiAttempts: string[] = [];
  if (primaryKey) geminiAttempts.push(primaryKey);
  if (fallbackKey && fallbackKey !== primaryKey) geminiAttempts.push(fallbackKey);

  const finalBaseUrl = (geminiSettings.baseUrl || geminiSettings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const isTargetingOpenRouter = finalBaseUrl.includes('openrouter.ai');

  // If we have an active Gemini key and are not targeting OpenRouter for Gemini, try the Native Google Grounding API
  if (geminiAttempts.length > 0 && !isTargetingOpenRouter) {
    for (const apiKey of geminiAttempts) {
      try {
        const apiVersion = geminiSettings.apiVersion || 'v1beta';
        let targetUrl = '';
        if (finalBaseUrl.includes('/models/') || finalBaseUrl.includes(':generateContent')) {
          targetUrl = finalBaseUrl;
        } else {
          targetUrl = `${finalBaseUrl}/${apiVersion}/models/${defaultGeminiModel}:generateContent?key=${apiKey}`;
        }

        const requestBody = {
          contents: [{
            role: 'user',
            parts: [{ text: `Search Google and return the direct real-time info or relevant details for: "${query}"` }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
          tools: [{ googleSearch: {} }]
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'aistudio-build'
        };

        console.log(`[SERVER_SEARCH_GROUNDING] Querying native Google Search Grounding context via Gemini for: ${query}`);

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        if (res.ok) {
          const resJson: any = await res.json();
          const groundingChunks = resJson.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          
          if (groundingChunks.length > 0) {
            return groundingChunks.map((chunk: any, index: number) => {
              const web = chunk.web || {};
              return {
                title: web.title || `Resource ${index + 1}`,
                snippet: web.title ? `Direct info excerpt for: ${web.title}` : `Grounding reference source for "${query}"`,
                url: web.uri || ''
              };
            });
          }

          const parts = resJson.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p: any) => p.text || '').join('').trim();
          if (text) {
            return [{
              title: `Summary for "${query}"`,
              snippet: text,
              url: "https://google.com"
            }];
          }
        }
      } catch (err: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] Native Gemini grounding attempt failed, trying alternative fallbacks:`, err.message);
      }
    }
  }

  // 2. Fallback Option: If OpenRouter is the primary provider, query OpenRouter chat completions with factual/online instructions
  const openrouterSettings = settings.get('openrouter') || {};
  const openrouterKey = openrouterSettings.apiKey || process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Triggering search query via OpenRouter API key for: ${query}`);
      const searchModel = openrouterSettings.model || 'google/gemini-3.5-flash';
      
      const payload = {
        model: searchModel,
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent search retrieval assistant. Provide a highly accurate, clean, bulleted list of current 2026 events/factual details to satisfy the search query.'
          },
          {
            role: 'user',
            content: `Search query: "${query}"`
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      };

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`,
          'HTTP-Referer': 'https://ai.studio/build',
          'X-Title': 'YuiHime AI Studio Search Grounding'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (content) {
          return [
            {
              title: `Search Grounding Context [${searchModel}]`,
              snippet: content,
              url: "https://openrouter.ai"
            }
          ];
        }
      }
    } catch (openrouterErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] OpenRouter search query failed:`, openrouterErr.message);
    }
  }

  // 3. Ultimate Zero-Key Fallback: Hybrid DuckDuckGo Web Scraper + Wikipedia API
  // Requires 0 API keys, completely free, highly resilient, and runs instantly!
  const searchResults: any[] = [];

  // Try scraping DuckDuckGo HTML search first (for news, sports, current events, general web links)
  try {
    console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key DuckDuckGo Web Scraper for: ${query}`);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      let cheerioFailed = false;
      
      try {
        const cheerio = await import('cheerio');
        const $ = cheerio.load(html);
        $('.result').each((_, el) => {
          const titleEl = $(el).find('.result__a');
          const title = titleEl.text().trim();
          let link = titleEl.attr('href') || '';
          
          if (link.includes('uddg=')) {
            try {
              const urlObj = new URL('https://html.duckduckgo.com' + link);
              const uddg = urlObj.searchParams.get('uddg');
              if (uddg) link = decodeURIComponent(uddg);
            } catch (e) {}
          }
          
          const snippet = $(el).find('.result__snippet').text().trim();
          if (title && link) {
            searchResults.push({
              title,
              snippet: snippet || `Search result for "${query}"`,
              url: link
            });
          }
        });
      } catch (err: any) {
        console.warn("[SERVER_SEARCH_GROUNDING] Cheerio import/parse in DDG search failed, using regex:", err.message);
        cheerioFailed = true;
      }

      if (cheerioFailed || searchResults.length === 0) {
        const resultBlockRegex = /<div class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
        let match;
        while ((match = resultBlockRegex.exec(html)) !== null && searchResults.length < 8) {
          const block = match[1];
          const titleMatch = /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
          if (titleMatch) {
            let link = titleMatch[1];
            if (link.includes('uddg=')) {
              const uddgMatch = /uddg=([^&"]+)/.exec(link);
              if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
            }
            const title = titleMatch[2]
              .replace(/<[^>]*>/g, '')
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .trim();

            const snippetMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
            const snippet = snippetMatch 
              ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
              : `Search result for "${query}"`;

            if (title && link) {
              searchResults.push({ title, snippet, url: link });
            }
          }
        }
      }
    }
  } catch (ddgErr: any) {
    console.warn(`[SERVER_SEARCH_GROUNDING] DuckDuckGo zero-key scraper attempt failed:`, ddgErr.message);
  }

  // Next, query Wikipedia to enrich results (especially for encyclopedic queries)
  try {
    console.log(`[SERVER_SEARCH_GROUNDING] Performing Zero-Key Wikipedia Multi-Lang query for: ${query}`);
    const targetLangs = ['id', 'en'];

    for (const lang of targetLangs) {
      try {
        const wpUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const res = await fetch(wpUrl);
        if (res.ok) {
          const data = await res.json();
          const list = data.query?.search || [];
          
          for (const item of list.slice(0, 3)) {
            const cleanText = item.snippet
              .replace(/<span class="searchmatch">/g, '')
              .replace(/<\/span>/g, '')
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .trim();

            if (cleanText) {
              searchResults.push({
                title: `${item.title} (${lang.toUpperCase()}) - Wikipedia`,
                snippet: cleanText,
                url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
              });
            }
          }
        }
      } catch (wpErr: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] Wikipedia lang=${lang} search sub-route failed:`, wpErr.message);
      }
    }
  } catch (globalWikiErr: any) {
    console.error(`[SERVER_SEARCH_GROUNDING] Wikipedia search API completely failed:`, globalWikiErr.message);
  }

  if (searchResults.length > 0) {
    return searchResults;
  }

  // Final static recovery array if all remote sources are completely unreachable or network drops
  return [
    { title: `${query} - Wikipedia`, snippet: `Knowledge query reference helper for "${query}". Check out general encyclopedic articles online.`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}` },
    { title: `Google Search Index for: ${query}`, snippet: `Direct link to review the live Google Web Search index results for "${query}".`, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }
  ];
}

