import { SettingsManager } from '../settings.js';
import { AIConfig } from './aiTypes.js';
import { toKeyArray, toSingleString } from '../configNormalizer.js';

const keyPool = {
  configure: (_providerId: string, _config: any, _settings: any) => {},
  next: (_providerId: string, _primaryKey: string, _modelId: string) => _primaryKey,
  reportFailure: (_providerId: string, _key: string, _modelId: string, _msg: string) => {}
};

const OVERLOADED_KEY_TTL_MS = 5 * 60 * 1000;
const RATE_LIMITED_KEY_TTL_MS = 15 * 60 * 1000;

const persistentOverloadedKeys = new Map<string, number>();
const persistentRateLimitedKeys = new Map<string, number>();

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
    const { SystemRegistry } = await import('@shared/core/registry');
    const geminiModule = SystemRegistry.getProvider('gemini');
    if (geminiModule && geminiModule.metadata?.models?.length > 0) {
      defaultGeminiModel = geminiModule.metadata.models[0];
    }
  } catch (e) {}

   const rawModel = config.model || geminiSettings.model || defaultGeminiModel;
   const model = Array.isArray(rawModel) ? (rawModel[0] || defaultGeminiModel) : rawModel;
   if (!model) {
     throw new Error('Sirkuit kognitif gagal berdenyut: Silakan pilih model kognitif di panel Settings atau aktifkan Model di tab Providers.');
   }
   const fallbackApiKey = geminiSettings.fallbackApiKey;
   
    const resolveModelIdName = (rawModel: any): string => {
      if (typeof rawModel !== 'string') return '';
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

   const extraModelsFromArray: string[] = [];
   if (Array.isArray(rawModel) && rawModel.length > 1) {
     for (let i = 1; i < rawModel.length; i++) {
       if (typeof rawModel[i] === 'string') {
         extraModelsFromArray.push(resolveModelIdName(rawModel[i]));
       }
     }
   }

  const runWithRetries = async (customPrompt?: string): Promise<string> => {
    const activePrompt = customPrompt || prompt;
    const primaryKey = config.apiKey || settings.getApiKey();
    const fallbackKey = fallbackApiKey;

    // Kumpulkan seluruh API Key unik dalam urutan prioritas
    const allKeys: string[] = [];
    const addKeys = (raw: any) => {
      if (!raw) return;
      const keys = toKeyArray(raw);
      for (const k of keys) {
        if (!allKeys.includes(k)) {
          allKeys.push(k);
        }
      }
    };

    addKeys(primaryKey);
    addKeys(fallbackKey);
    addKeys(geminiSettings.apiKey);
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

    for (const m of extraModelsFromArray) {
      if (!allModels.includes(m)) {
        allModels.push(m);
      }
    }
    
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

    // Dynamic model pool failover (ikuti provider model pool & dynamic settings)
    if (Array.isArray(geminiSettings.models)) {
      for (const m of geminiSettings.models) {
        if (typeof m === 'string') addModels(m);
      }
    } else if (typeof geminiSettings.models === 'string') {
      addModels(geminiSettings.models);
    }

    if (Array.isArray(geminiSettings.availableModels)) {
      for (const m of geminiSettings.availableModels) {
        if (typeof m === 'string') addModels(m);
      }
    } else if (typeof geminiSettings.availableModels === 'string') {
      addModels(geminiSettings.availableModels);
    }

    try {
      const { SystemRegistry } = await import('@shared/core/registry');
      const geminiModule = SystemRegistry.getProvider('gemini');
      if (geminiModule && Array.isArray(geminiModule.metadata?.models)) {
        for (const m of geminiModule.metadata.models) {
          if (typeof m === 'string') addModels(m);
        }
      }
    } catch (e) {}

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
    const now = Date.now();
    for (const [k, expiry] of persistentOverloadedKeys) {
      if (expiry <= now) persistentOverloadedKeys.delete(k);
    }
    for (const [k, expiry] of persistentRateLimitedKeys) {
      if (expiry <= now) persistentRateLimitedKeys.delete(k);
    }
    let lastError: any = null;
    for (const attempt of attemptsToTry) {
      if (!attempt.apiKey) continue;

      if (persistentRateLimitedKeys.has(attempt.apiKey)) {
        const hasOtherGoodKey = attemptsToTry.some(a => a.apiKey && a.apiKey !== attempt.apiKey && !persistentRateLimitedKeys.has(a.apiKey) && !persistentOverloadedKeys.has(a.apiKey));
        if (hasOtherGoodKey) {
          continue;
        }
      }

      if (persistentOverloadedKeys.has(attempt.apiKey)) {
        const hasOtherGoodKey = attemptsToTry.some(a => a.apiKey && a.apiKey !== attempt.apiKey && !persistentRateLimitedKeys.has(a.apiKey) && !persistentOverloadedKeys.has(a.apiKey));
        if (hasOtherGoodKey) {
          continue;
        }
      }
      
      const maxRetriesPerAttempt = 1;
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
                  // console.warn(`[SERVER_AI] Mengaplikasikan penundaan kognitif cerdas (API rate limit 429) sebesar ${backoffMs}ms sebelum retry #${retryCount}...`);
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
          // console.error(`[SERVER_AI] Sirkuit ${attempt.label} gagal pada Percobaan #${retryCount + 1}:`, summarizeAiError(error));
          
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
            persistentRateLimitedKeys.set(attempt.apiKey, now + RATE_LIMITED_KEY_TTL_MS);
          }

          // If API is overloaded (503/unavailable), register key so pool can skip it after exhausting retries
          if (isRetriable && !isQuotaOrRateLimit && retryCount === maxRetriesPerAttempt - 1) {
            console.warn(`[SERVER_AI] API Key ${attempt.apiKey.substring(0, 6)}... terus menerima overload (503). Menambah ke daftar kunci sibuk untuk dilewati oleh pool.`);
            persistentOverloadedKeys.set(attempt.apiKey, now + OVERLOADED_KEY_TTL_MS);
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

    if (lastError) {
      const errMsg = lastError.message || String(lastError);
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate limit')) {
        const retryMatch = errMsg.match(/Please retry in ([0-9.]+)\s*s/i);
        const retryInfo = retryMatch ? ` (silakan coba lagi dalam ${Math.ceil(parseFloat(retryMatch[1]))} detik)` : '';
        throw new Error(`Google Gemini API Quota/Rate Limit Terlampaui (429)${retryInfo}. Semua sirkuit cadangan telah dicoba. Silakan periksa API Key atau tambahkan Provider cadangan di Settings.`);
      }
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
        const modelId = toSingleString(item.model);
        const customApiKey = toSingleString(item.apiKey);
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

          const { SystemRegistry } = await import('@shared/core/registry');
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
  const providersTable = (settings.get('providers') as any) || {};
  const geminiSettings = { ...(providersTable.gemini || {}), ...(settings.get('gemini') || {}) };
  
  let defaultGeminiModel = 'gemini-2.0-flash';
  const GROUNDING_FALLBACKS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-pro'];
  
  const toModelString = (raw: any): string => {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw[0];
    return '';
  };
  
  if (geminiSettings.model) {
    defaultGeminiModel = toModelString(geminiSettings.model) || defaultGeminiModel;
  } else {
    try {
      const { SystemRegistry } = await import('@shared/core/registry');
      const geminiModule = SystemRegistry.getProvider('gemini');
      if (geminiModule && geminiModule.metadata?.models?.length > 0) {
        defaultGeminiModel = toModelString(geminiModule.metadata.models[0]) || defaultGeminiModel;
      }
    } catch (e) {}
  }

  const resolveModelIdName = (rawModel: any): string => {
    if (typeof rawModel !== 'string') return '';
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

  const primaryKey = toSingleString(settings.getApiKey());
  const fallbackKey = toSingleString(geminiSettings.fallbackApiKey);

  const geminiAttempts: string[] = [];
  if (primaryKey) geminiAttempts.push(primaryKey);
  if (fallbackKey && fallbackKey !== primaryKey) geminiAttempts.push(fallbackKey);

  if (geminiAttempts.length > 0) {
    const poolConfig = {
      apiKey: primaryKey || fallbackKey || '',
      apiKeys: [...toKeyArray(primaryKey), ...toKeyArray(fallbackKey)].filter((v, i, a) => a.indexOf(v) === i),
      model: defaultGeminiModel,
      ...geminiSettings
    };
    keyPool.configure('gemini', poolConfig, geminiSettings);
  }

  const finalBaseUrl = (geminiSettings.baseUrl || geminiSettings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const isTargetingOpenRouter = finalBaseUrl.includes('openrouter.ai');

  // If we have an active Gemini key and are not targeting OpenRouter for Gemini, try the Native Google Grounding API
  if (geminiAttempts.length > 0 && !isTargetingOpenRouter) {
    const modelsToTry = [
      resolveModelIdName(defaultGeminiModel),
      ...GROUNDING_FALLBACKS.filter(m => resolveModelIdName(m) !== resolveModelIdName(defaultGeminiModel)).map(resolveModelIdName)
    ];
    const skippedModels = new Set<string>();
    
    for (const targetModel of modelsToTry) {
      if (skippedModels.has(targetModel)) continue;
      
      const apiKey = keyPool.next('gemini', primaryKey || fallbackKey, targetModel);
      if (!apiKey) continue;
      
      try {
          const apiVersion = geminiSettings.apiVersion || 'v1beta';
          let targetUrl = '';
          if (finalBaseUrl.includes('/models/') || finalBaseUrl.includes(':generateContent')) {
            targetUrl = finalBaseUrl;
          } else {
            targetUrl = `${finalBaseUrl}/${apiVersion}/models/${targetModel}:generateContent?key=${apiKey}`;
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

          console.log(`[SERVER_SEARCH_GROUNDING] Querying native Google Search Grounding context via Gemini (${targetModel}) for: ${query}`);

          const res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(15000)
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => 'Unknown error');
            console.warn(`[SERVER_SEARCH_GROUNDING] Gemini grounding returned HTTP ${res.status} for model ${targetModel}:`, errText.slice(0, 200));
            
            if (apiKey) {
              keyPool.reportFailure('gemini', apiKey, targetModel, `HTTP ${res.status}: ${errText.slice(0, 100)}`);
            }
            
            if (res.status === 404) {
              skippedModels.add(targetModel);
            }
            continue;
          }

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
        } catch (err: any) {
          console.warn(`[SERVER_SEARCH_GROUNDING] Native Gemini grounding attempt failed for model ${targetModel}, trying alternative fallbacks:`, err.message);
        }
      }
    }

  // 2. Fallback Option: If OpenRouter is the primary provider, query OpenRouter chat completions with factual/online instructions
  const openrouterSettings = settings.get('openrouter') || {};
  const openrouterKey = toSingleString(openrouterSettings.apiKey) || process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Triggering search query via OpenRouter API key for: ${query}`);
      const searchModel = toSingleString(openrouterSettings.model) || defaultGeminiModel || 'gemini-2.0-flash';
      
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
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
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
      } else {
        const errText = await res.text().catch(() => 'Unknown error');
        console.warn(`[SERVER_SEARCH_GROUNDING] OpenRouter search returned HTTP ${res.status}:`, errText.slice(0, 200));
      }
    } catch (openrouterErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] OpenRouter search query failed:`, openrouterErr.message);
    }
  }

  // 3. Ultimate Zero-Key Fallback: Multi-Source Web Search (No API Key Required)
  // Requires 0 API keys, completely free, highly resilient, and runs instantly!
  const searchResults: any[] = [];

  // Helper: scrape generic HTML search result blocks with regex (no cheerio dependency)
  const scrapeHtmlResults = (html: string, selectors: { resultBlock: RegExp; title: RegExp; link: RegExp; snippet: RegExp }, maxResults = 8): any[] => {
    const results: any[] = [];
    let match;
    while ((match = selectors.resultBlock.exec(html)) !== null && results.length < maxResults) {
      const block = match[1];
      const titleMatch = selectors.title.exec(block);
      const linkMatch = selectors.link.exec(block);
      const snippetMatch = selectors.snippet.exec(block);
      
      if (titleMatch && linkMatch) {
        let link = linkMatch[1];
        if (link.includes('uddg=')) {
          const uddgMatch = /uddg=([^&"]+)/.exec(link);
          if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
        }
        const title = titleMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
        const snippet = snippetMatch 
          ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
          : `Search result for "${query}"`;
        if (title && link) results.push({ title, snippet, url: link });
      }
    }
    return results;
  };

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
      signal: AbortSignal.timeout(6000)
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const ddgResults = scrapeHtmlResults(html, {
        resultBlock: /<div class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g,
        title: /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
        link: /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
        snippet: /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/
      });
      searchResults.push(...ddgResults);
      console.log(`[SERVER_SEARCH_GROUNDING] DuckDuckGo returned ${ddgResults.length} results`);
    }
  } catch (ddgErr: any) {
    console.warn(`[SERVER_SEARCH_GROUNDING] DuckDuckGo zero-key scraper attempt failed:`, ddgErr.message);
  }

  // Try Qwant Lite HTML search (European privacy-focused search, good for news/current events)
  if (searchResults.length < 3) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key Qwant Lite for: ${query}`);
      const qwantUrl = `https://lite.qwant.com/?q=${encodeURIComponent(query)}`;
      const qwantRes = await fetch(qwantUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (qwantRes.ok) {
        const html = await qwantRes.text();
        const qwantResults = scrapeHtmlResults(html, {
          resultBlock: /<li class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
          title: /<a class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
          link: /<a class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
          snippet: /<p class="[^"]*result-description[^"]*"[^>]*>([\s\S]*?)<\/p>/
        });
        searchResults.push(...qwantResults);
        console.log(`[SERVER_SEARCH_GROUNDING] Qwant Lite returned ${qwantResults.length} results`);
      }
    } catch (qwantErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] Qwant Lite zero-key scraper attempt failed:`, qwantErr.message);
    }
  }

  // Try Yandex HTML search (good for international/current events)
  if (searchResults.length < 3) {
    try {
      console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key Yandex for: ${query}`);
      const yandexUrl = `https://yandex.com/search/?text=${encodeURIComponent(query)}`;
      const yandexRes = await fetch(yandexUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (yandexRes.ok) {
        const html = await yandexRes.text();
        const yandexResults = scrapeHtmlResults(html, {
          resultBlock: /<li class="[^"]*serp-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
          title: /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/,
          link: /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/,
          snippet: /<div class="[^"]*text-[^"]*"[^>]*>([\s\S]*?)<\/div>/
        });
        searchResults.push(...yandexResults);
        console.log(`[SERVER_SEARCH_GROUNDING] Yandex returned ${yandexResults.length} results`);
      }
    } catch (yandexErr: any) {
      console.warn(`[SERVER_SEARCH_GROUNDING] Yandex zero-key scraper attempt failed:`, yandexErr.message);
    }
  }

  // Try SearXNG public instances (meta-search, JSON API, no key required)
  if (searchResults.length < 3) {
    const searxInstances = [
      'https://searx.be',
      'https://search.sapti.me',
      'https://searx.fmac.xyz'
    ];
    
    for (const instance of searxInstances) {
      try {
        console.log(`[SERVER_SEARCH_GROUNDING] Querying Zero-Key SearXNG (${instance}) for: ${query}`);
        const searxUrl = `${instance}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`;
        const searxRes = await fetch(searxUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (searxRes.ok) {
          const data = await searxRes.json();
          const results = (data.results || []).slice(0, 5).map((r: any) => ({
            title: r.title || `Result for "${query}"`,
            snippet: r.content || r.description || `Search result for "${query}"`,
            url: r.url || r.link || ''
          }));
          searchResults.push(...results);
          console.log(`[SERVER_SEARCH_GROUNDING] SearXNG (${instance}) returned ${results.length} results`);
          break;
        }
      } catch (searxErr: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] SearXNG (${instance}) failed:`, searxErr.message);
      }
    }
  }

  // Try RSS news feeds from major outlets (no API key required, good for current events)
  if (searchResults.length < 3) {
    const rssFeeds = [
      { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World', type: 'rss' as const },
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', name: 'NYT Tech', type: 'rss' as const },
      { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera', type: 'rss' as const },
      { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR', type: 'rss' as const },
      { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', type: 'atom' as const }
    ];

    for (const feed of rssFeeds) {
      try {
        console.log(`[SERVER_SEARCH_GROUNDING] Querying RSS feed (${feed.name}) for: ${query}`);
        const res = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          signal: AbortSignal.timeout(6000)
        });

        if (res.ok) {
          const xml = await res.text();
          const feedResults: any[] = [];

          if (feed.type === 'rss') {
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(xml)) !== null && feedResults.length < 5) {
              const item = itemMatch[1];
              const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(item);
              const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/.exec(item);
              const descMatch = /<description[^>]*>([\s\S]*?)<\/description>/.exec(item);
              
              if (titleMatch && linkMatch) {
                const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
                const url = linkMatch[1].replace(/<[^>]*>/g, '').trim();
                const snippet = descMatch 
                  ? descMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
                  : `News from ${feed.name}`;
                if (title && url) feedResults.push({ title: `${title} (${feed.name})`, snippet: snippet.slice(0, 200), url });
              }
            }
          } else {
            const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
            let entryMatch;
            while ((entryMatch = entryRegex.exec(xml)) !== null && feedResults.length < 5) {
              const entry = entryMatch[1];
              const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
              const linkMatch = /<link[^>]*href="([^"]+)"[^>]*/.exec(entry);
              const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
              
              if (titleMatch && linkMatch) {
                const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
                const url = linkMatch[1].trim();
                const snippet = summaryMatch 
                  ? summaryMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
                  : `News from ${feed.name}`;
                if (title && url) feedResults.push({ title: `${title} (${feed.name})`, snippet: snippet.slice(0, 200), url });
              }
            }
          }

          searchResults.push(...feedResults);
          console.log(`[SERVER_SEARCH_GROUNDING] RSS (${feed.name}) returned ${feedResults.length} results`);
          if (searchResults.length >= 3) break;
        }
      } catch (rssErr: any) {
        console.warn(`[SERVER_SEARCH_GROUNDING] RSS (${feed.name}) failed:`, rssErr.message);
      }
    }
  }
  try {
    console.log(`[SERVER_SEARCH_GROUNDING] Performing Zero-Key Wikipedia Multi-Lang query for: ${query}`);
    const targetLangs = ['id', 'en'];

    for (const lang of targetLangs) {
      try {
        const wpUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const res = await fetch(wpUrl, {
          signal: AbortSignal.timeout(10000)
        });
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
        } else {
          console.warn(`[SERVER_SEARCH_GROUNDING] Wikipedia lang=${lang} returned HTTP ${res.status}`);
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

