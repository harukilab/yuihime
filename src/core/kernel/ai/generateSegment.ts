import { SettingsManager } from '../settings.js';
import { AIConfig } from './aiTypes.js';
import { toKeyArray, toSingleString } from '../configNormalizer.js';
import { SystemRegistry } from '@shared/core/registry';
import { LlmIoAuditor } from '../../server/llmAuditor.js';
import { loadKeyPoolState, saveKeyPoolState, pruneExpiryMap } from '../keyPoolStateStore.js';

const keyPool = {
  configure: (_providerId: string, _config: any, _settings: any) => {},
  next: (_providerId: string, _primaryKey: string, _modelId: string) => _primaryKey,
  reportFailure: (_providerId: string, _key: string, _modelId: string, _msg: string) => {}
};

const OVERLOADED_KEY_TTL_MS = 5 * 60 * 1000;
const RATE_LIMITED_KEY_TTL_MS = 15 * 60 * 1000;

const persistentOverloadedKeys = new Map<string, number>();
const persistentRateLimitedKeys = new Map<string, number>();

// Restore persisted busy-key state across restarts so known-bad keys (429/503/403)
// are skipped immediately instead of being retried first on every boot.
(function hydrateKeyPoolState(): void {
  try {
    const state = loadKeyPoolState();
    if (state.overloaded) {
      for (const [k, expiry] of Object.entries(pruneExpiryMap(state.overloaded))) {
        persistentOverloadedKeys.set(k, expiry);
      }
    }
    if (state.rateLimited) {
      for (const [k, expiry] of Object.entries(pruneExpiryMap(state.rateLimited))) {
        persistentRateLimitedKeys.set(k, expiry);
      }
    }
    if (persistentOverloadedKeys.size > 0 || persistentRateLimitedKeys.size > 0) {
      console.log(`[SERVER_AI] Restored ${persistentOverloadedKeys.size} overloaded + ${persistentRateLimitedKeys.size} rate-limited key(s) from disk.`);
    }
  } catch (err: any) {
    console.warn('[SERVER_AI] Failed to hydrate busy-key state:', err?.message || err);
  }
})();

function persistBusyKeyState(): void {
  try {
    const now = Date.now();
    const overloaded: Record<string, number> = {};
    for (const [k, expiry] of persistentOverloadedKeys) {
      if (expiry > now) overloaded[k] = expiry;
    }
    const rateLimited: Record<string, number> = {};
    for (const [k, expiry] of persistentRateLimitedKeys) {
      if (expiry > now) rateLimited[k] = expiry;
    }
    saveKeyPoolState({ overloaded, rateLimited });
  } catch (err: any) {
    console.warn('[SERVER_AI] Failed to persist busy-key state:', err?.message || err);
  }
}

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
          let stallTimer: ReturnType<typeof setTimeout> | null = null;
          const armStallTimeout = (ms: number) => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => fetchController.abort(), ms);
          };
          const clearStallTimeout = () => {
            if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
          };

          // Stall timeout covering headers AND body (streaming/json) — body read
          // previously had no timeout and could hang the queue forever.
          armStallTimeout(90000);

          const res = await fetch(finalTargetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: fetchController.signal
          });

          if (!res.ok) {
            const errText = await res.text();
            clearStallTimeout();
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
              // Reset stall timer on every chunk: active streams survive, stalled ones die.
              armStallTimeout(60000);
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
            clearStallTimeout();
            return fullText;
          } else {
            const resJson: any = await res.json();
            clearStallTimeout();
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
            persistBusyKeyState();
          }

          // If API is overloaded (503/unavailable), register key so pool can skip it after exhausting retries
          if (isRetriable && !isQuotaOrRateLimit && retryCount === maxRetriesPerAttempt - 1) {
            console.warn(`[SERVER_AI] API Key ${attempt.apiKey.substring(0, 6)}... terus menerima overload (503). Menambah ke daftar kunci sibuk untuk dilewati oleh pool.`);
            persistentOverloadedKeys.set(attempt.apiKey, now + OVERLOADED_KEY_TTL_MS);
            persistBusyKeyState();
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

export { executeGoogleSearch } from './web_search.js';
