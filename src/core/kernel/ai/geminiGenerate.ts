import { SettingsManager } from '../settings.js';
import { AIConfig } from './aiTypes.js';
import { toKeyArray, toSingleString } from '../configNormalizer.js';
import { SystemRegistry } from '@shared/core/registry';
import { LlmIoAuditor } from '../../server/llmAuditor.js';
import { keyPool } from '../apiKeyPool.js';
import { normalizeToolCallsToOpenAI, buildInlineToolsText } from '../../openaiTools.js';

const OVERLOADED_KEY_TTL_MS = 5 * 60 * 1000;
const RATE_LIMITED_KEY_TTL_MS = 15 * 60 * 1000;
const FAILED_MODEL_TTL_MS = 30 * 60 * 1000;
const PRIMARY_STALL_MS = 90_000; // first (expected-healthy) attempt gets the full header+body window
const FALLBACK_STALL_MS = 30_000; // fallback attempts fail fast so rotation can't burn the pipeline budget

// Busy-key / failed-model bookkeeping lives in the shared ApiKeyPool
// (persisted to key_pool_state.json) so every provider driver gets the same
// temporary skip behavior — see `keyPool.markKeyRateLimited` /
// `markKeyOverloaded` / `markModelFailed` and the `isKey*` / `isModelFailed`
// predicates. hydrate + persist are handled internally by the pool.

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

/**
 * Raised when a provider returns a response that was cut off mid-generation
 * (finishReason MAX_TOKENS / unterminated JSON envelope). Downstream retry
 * logic treats this as a retriable-but-healthy signal: the key/model is NOT
 * blacklisted, the pool is simply re-run to obtain the full response.
 */
export class TruncatedGenerationError extends Error {
  constructor(public readonly partial: string, finishReason?: string) {
    const hint = finishReason ? `finishReason=${finishReason}` : 'unterminated JSON envelope';
    const sample = (partial || '').trim().slice(0, 90) || '(empty)';
    super(`Generation truncated by provider (${hint}). Partial output: ${sample}`);
    this.name = 'TruncatedGenerationError';
  }
}

/**
 * Detect a JSON response that was cut off before completion. Only triggered
 * when the text actually starts an object (`{`), so plain conversational
 * replies are never misclassified. Braces inside string values are ignored,
 * and a balanced-but-unparseable object is treated as malformed (retry-worthy).
 */
function looksTruncatedJson(text: string): boolean {
  const t = (text || '').trim();
  if (!t.startsWith('{')) return false;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  if (depth > 0) return true;
  try {
    JSON.parse(t);
    return false;
  } catch {
    return true;
  }
}

/**
 * Coerce a provider-specific `arguments` value into a plain object for the
 * Gemini `functionCall.args` field. Canonical native blocks may carry either an
 * already-parsed object (Anthropic/Gemini) or a JSON string (OpenAI-compatible).
 */
function coerceArgsForGemini(args: any): any {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  }
  return (typeof args === 'object' && args !== null) ? args : {};
}

/**
 * Parse the canonical tool output envelope (`{ success, data, error, metadata }`
 * JSON string) back into an object for the Gemini `functionResponse.response`
 * field. Falls back to `{ result: content }` for non-JSON payloads.
 */
function parseToolResponseContent(content: any): any {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return (parsed && typeof parsed === 'object') ? parsed : { result: content };
    } catch {
      return { result: content };
    }
  }
  return (typeof content === 'object' && content !== null) ? content : { result: '' };
}

/**
 * Translate canonical `[assistant(tool_calls), ...role:"tool"]` turn blocks
 * (the Phase 5 interleaved history produced by the loop) into Gemini `contents`
 * parts: a `role:"model"` content with `functionCall` parts immediately followed
 * by a `role:"user"` content with `functionResponse` parts — the alternation the
 * Gemini API requires for multi-turn native function calling.
 */
export function buildGeminiHistoryContents(history: any): any[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  const contents: any[] = [];
  for (const block of history) {
    if (!Array.isArray(block)) continue;
    const assistantMsg = block.find((m: any) => m && m.role === 'assistant');
    const toolRows = block.filter((m: any) => m && m.role === 'tool');
    if (assistantMsg && Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0) {
      contents.push({
        role: 'model',
        parts: assistantMsg.tool_calls.map((c: any) => ({
          functionCall: {
            name: c.function?.name || c.name,
            args: coerceArgsForGemini(c.function?.arguments)
          }
        }))
      });
    }
    if (toolRows.length > 0) {
      contents.push({
        role: 'user',
        parts: toolRows.map((m: any) => ({
          functionResponse: {
            name: m.name,
            response: parseToolResponseContent(m.content)
          }
        }))
      });
    }
  }
  // Gemini requires the conversation to start with a user turn. A reloaded
  // native history may begin with an assistant(tool_calls) block (no persisted
  // user prompt precedes it), which would surface as a leading functionCall
  // content and be rejected with a 400 "function call turn" error. Seed a
  // synthetic user turn so the alternation user -> model(functionCall) holds.
  if (contents.length > 0 && contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '[Continued conversation]' }] });
  }
  return contents;
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
  const settingsGemini = (settings.get('gemini') || {});
  const configGemini = (config && typeof config === 'object') ? config : {};
  const geminiSettings: any = {
    ...(providersTable.gemini || {}),
    ...settingsGemini,
    ...configGemini
  };
  // UNION the full API key pool across every source. Downstream callers (e.g.
  // fetchCortexSettings) often collapse multi-key pools to a single string, and
  // that single key spread last above would otherwise clobber the multi-key pool
  // from settings, silently disabling key rotation (all requests would retry the
  // same 503/quota-exhausted key and trigger the offline fallback).
  const mergedApiKeys = Array.from(new Set([
    ...toKeyArray(providersTable.gemini?.apiKey),
    ...toKeyArray(settingsGemini.apiKey),
    ...toKeyArray(configGemini.apiKey),
    ...toKeyArray(geminiSettings.apiKeysPool)
  ]));
  if (mergedApiKeys.length > 0) {
    geminiSettings.apiKey = mergedApiKeys;
  }
  // Keep the durable ApiKeyPool in sync with the resolved Gemini key set so the
  // per key::model cooldown rotation (apiKeyPool.ts) drives the same pool that
  // this circuit iterates.
  try {
    keyPool.configure('gemini', geminiSettings, settings.getAll?.() || {});
  } catch (_) { /* pool is advisory; never break generation */ }
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
     throw new Error('Cognitive circuit failed to pulse: Please choose a cognitive model in the Settings panel or enable a Model in the Providers tab.');
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
    const primaryKey = toSingleString(config.apiKey) || settings.getApiKey();
    const fallbackKey = fallbackApiKey;

    // Collect all unique API Keys in priority order
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

    // Collect all backup models in priority order
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

    // Dynamic model pool failover (follow provider model pool & dynamic settings)
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

    // Cognitive circuits priority to try
    const attemptsToTry: Array<{ apiKey: string; modelId: string; label: string }> = [];

    for (const modelId of allModels) {
      for (let i = 0; i < allKeys.length; i++) {
        const key = allKeys[i];
        let keyLabel = `Key #${i + 1}`;
        if (key === primaryKey) keyLabel = 'Primary Key';
        else if (key === fallbackKey) keyLabel = 'Backup Key';
        else if (key === systemEnvKey) keyLabel = 'System Env Key';
        else keyLabel = `Pool Key #${i - 1}`;

        attemptsToTry.push({
          apiKey: key,
          modelId: modelId,
          label: `${keyLabel} + Model ${modelId}`
        });
      }
    }

    console.log(`[SERVER_AI] Pool: ${allKeys.length} key(s) x ${allModels.length} model(s) ~ ${attemptsToTry.length} attempt(s)`);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    // Per-call state: models confirmed overloaded (503) this cycle so we don't
    // waste the remaining keys against a model that is down for everyone.
    const overloadedModelsThisCall = new Set<string>();
    // Per-call model skip: once a model 429s on MULTIPLE keys this cycle, it is
    // quota-exhausted pool-wide (not a single bad key) — stop burning the rest.
    const modelQuotaFailCount = new Map<string, number>();
    let lastError: any = null;
    let attemptIndex = 0;
    for (const attempt of attemptsToTry) {
      if (!attempt.apiKey) continue;

      // Fast-skip: once a model 503s on any key this cycle, it is down for the
      // pool too — do not burn the remaining keys against it.
      if (overloadedModelsThisCall.has(attempt.modelId)) {
        continue;
      }

      // Fast-skip: once a model 429s on enough keys this cycle, it is
      // exhausted for the whole pool — skip the remaining keys too.
      const quotaFailCount = modelQuotaFailCount.get(attempt.modelId) || 0;
      if (quotaFailCount >= 2) {
        continue;
      }

      // Durable model-level skip: a model confirmed unavailable (404 not-found
      // / deprecated / no longer available) is marked failed for TTL minutes so
      // every key in the pool stops wasting attempts against it across calls.
      if (keyPool.isModelFailed('gemini', attempt.modelId)) {
        continue;
      }

      if (keyPool.isKeyRateLimited('gemini', attempt.apiKey)) {
        const hasOtherGoodKey = attemptsToTry.some(a => a.apiKey && a.apiKey !== attempt.apiKey && !keyPool.isKeyRateLimited('gemini', a.apiKey) && !keyPool.isKeyOverloaded('gemini', a.apiKey));
        if (hasOtherGoodKey) {
          continue;
        }
      }

      if (keyPool.isKeyOverloaded('gemini', attempt.apiKey)) {
        const hasOtherGoodKey = attemptsToTry.some(a => a.apiKey && a.apiKey !== attempt.apiKey && !keyPool.isKeyRateLimited('gemini', a.apiKey) && !keyPool.isKeyOverloaded('gemini', a.apiKey));
        if (hasOtherGoodKey) {
          continue;
        }
      }

      // Durable ApiKeyPool cooldown (per key::model pair): skip cooled pairs for
      // this model when a healthier key exists in the pool. Falls back to trying
      // the soonest-releasing pair when every pair is cooled, matching the
      // persistent busy-key behavior above.
      if (keyPool.isCooledDown('gemini', attempt.apiKey, attempt.modelId)) {
        const hasOtherGoodKey = attemptsToTry.some(a => a.apiKey && a.apiKey !== attempt.apiKey && !keyPool.isCooledDown('gemini', a.apiKey, a.modelId));
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
                  // console.warn(`[SERVER_AI] Applying smart cognitive delay (API rate limit 429) of ${backoffMs}ms before retry #${retryCount}...`);
                }
              } else if (lastErrBody.includes('503') || lastErrBody.toLowerCase().includes('overloaded') || lastErrBody.toLowerCase().includes('unavailable')) {
                backoffMs = Math.pow(2, retryCount) * 3000; // 6s, 12s backoff for 503 overloaded
                console.warn(`[SERVER_AI] Google API detected overload (503). Scheduling pending of ${backoffMs}ms before retry #${retryCount}...`);
              }
            }

            console.log(`[SERVER_AI] Retry ${attempt.label} (retry #${retryCount}) in ${backoffMs}ms...`);
            await sleep(backoffMs);
          }

          console.log(`[SERVER_AI] Trying ${attempt.label}`);
          
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

          // Phase 6: prepend the native multi-turn tool history (functionCall /
          // functionResponse contents) so Gemini sees prior tool rounds exactly
          // like OpenAI/Anthropic receive their interleaved blocks. Empty when
          // no history is supplied, keeping the single-turn path byte-identical.
          const historyContents = buildGeminiHistoryContents(config.history);

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
            contentsArray = [...historyContents, { role: 'user', parts: partsToUse }];
            systemInstructionText = undefined; // clear out systemInstruction to prevent API mismatch/ignore
          } else {
            contentsArray = [...historyContents, { role: 'user', parts: partsToUse }];
          }

          const requestBody: any = {
            contents: contentsArray,
            generationConfig: genConfig,
          };

          // Gemma models do not support the native `tools`/functionDeclarations
          // API channel (Gemini returns 500 INTERNAL or silently ignores the
          // declarations). Instead of attaching API tools, convert the schema
          // catalog into inline text (functions.<name>:<n>{...}) appended to the
          // prompt; the loop's readNativeToolCalls already parses that format.
          const gemmaNative = attempt.modelId.includes('gemma') || attempt.modelId.includes('gemma-4');
          if (config.tools) {
            if (gemmaNative) {
              const toolText = buildInlineToolsText(config.tools);
              if (toolText && partsToUse[0]?.text) {
                partsToUse[0].text += `\n\n${toolText}`;
                requestBody.contents = [...historyContents, { role: 'user', parts: partsToUse }];
              }
            } else {
              requestBody.tools = config.tools;
            }
          }

          if (config.toolConfig && !gemmaNative) {
            requestBody.toolConfig = config.toolConfig;
          }

          // Gemini's default safety filters block mature character content with
          // PROHIBITED_CONTENT. Set every harm category to BLOCK_NONE so Yui's
          // roleplay prompt (assembled by the cortex) is not rejected before the
          // first token. This mirrors the adult-roleplay deployment intent; the
          // cortex/processor layer still enforces narrative-level safety rules.
          if (!gemmaNative) {
            requestBody.safetySettings = [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
            ];
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
          // The first attempt (expected healthy) gets the full window; fallback
          // attempts fail fast so a hung fallback key/model cannot burn the
          // whole pipeline budget on slow 503/429 probes.
          const isFirstProbe = attemptIndex === 0;
          attemptIndex++;
          armStallTimeout(isFirstProbe ? PRIMARY_STALL_MS : FALLBACK_STALL_MS);

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
            let lastFinishReason: string | undefined;
            const geminiFunctionCalls: any[] = [];

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
                          if (candidates?.finishReason) lastFinishReason = candidates.finishReason;
                          const parts = candidates?.content?.parts || [];
                          let partText = "";
                          for (const part of parts) {
                            if (part.text) {
                              partText += part.text;
                            } else if (part.functionCall) {
                              geminiFunctionCalls.push(part.functionCall);
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
                          if (candidates?.finishReason) lastFinishReason = candidates.finishReason;
                          const parts = candidates?.content?.parts || [];
                          let partText = "";
                          for (const part of parts) {
                            if (part.text) {
                              partText += part.text;
                            } else if (part.functionCall) {
                              geminiFunctionCalls.push(part.functionCall);
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

            // Fallback recovery: the brace-based parser can lose text when
            // JSON fragments split across SSE chunks (rawResult ends up empty
            // even though the stream succeeded — triggering retry + dedup skip).
            // If there is no collected text, extract all `"text": "..."` parts in sequence.
            if (!fullText && accumulated) {
              const textPartRe = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
              let tm: RegExpExecArray | null;
              let recoveredText = "";
              while ((tm = textPartRe.exec(accumulated)) !== null) {
                recoveredText += tm[1]
                  .replace(/\\n/g, "\n")
                  .replace(/\\t/g, "\t")
                  .replace(/\\r/g, "\r")
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, "\\");
              }
              if (recoveredText) {
                fullText = recoveredText;
              }
            }

            // Truncation guard: if the accumulated model output is an unterminated
            // JSON envelope (cut off mid-generation, e.g. MAX_TOKENS), re-run the
            // pool instead of delivering the partial fragment to callers.
            if (looksTruncatedJson(fullText)) {
              throw new TruncatedGenerationError(fullText, lastFinishReason || (fullText ? 'MAX_TOKENS' : undefined));
            }

            console.log(`[SERVER_AI] Cognitive circuit streaming succeeded with ${attempt.label}.`);
            clearStallTimeout();
            // Native Gemini function calling: if the model emitted functionCall
            // parts and no text, surface them as the canonical tool_calls envelope
            // so the cortex loop consumes them exactly like OpenAI/Anthropic.
            if (geminiFunctionCalls.length > 0 && !fullText) {
              return JSON.stringify({ tool_calls: normalizeToolCallsToOpenAI({ parts: geminiFunctionCalls.map((fc: any) => ({ functionCall: fc })) }, 'gemini') });
            }
            return fullText;
          } else {
            const resJson: any = await res.json();
            clearStallTimeout();
            const candidate = resJson.candidates?.[0];
            const finishReason = candidate?.finishReason;
            const parts = candidate?.content?.parts || [];
            const geminiFunctionCalls: any[] = [];
            for (const p of parts) {
              if (p && p.functionCall) geminiFunctionCalls.push(p);
            }
            if (geminiFunctionCalls.length > 0) {
              return JSON.stringify({ tool_calls: normalizeToolCallsToOpenAI({ parts: geminiFunctionCalls }, 'gemini') });
            }
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
            // Truncation guard: reject cut-off JSON envelopes so the retry pool
            // regenerates a complete response instead of leaking partial output.
            if (looksTruncatedJson(text)) {
              throw new TruncatedGenerationError(text, finishReason);
            }
            
            console.log(`[SERVER_AI] Cognitive circuit pulsation succeeded (NATIVE FETCH) with ${attempt.label}.`);
            return text;
          }
        } catch (error: any) {
          lastError = error;
          const errorBody = error.message || String(error);
          // console.error(`[SERVER_AI] Circuit ${attempt.label} failed on Attempt #${retryCount + 1}:`, summarizeAiError(error));
          console.error(`[SERVER_AI] Circuit ${attempt.label} failed (${errorBody.slice(0, 200)})`);

          // Truncation is a healthy-but-incomplete generation, NOT a key/model
          // fault: skip quota/overload classification (the partial sample inside
          // the message could contain misleading keywords) and simply move to the
          // next circuit for a fresh complete generation.
          if (error instanceof TruncatedGenerationError) {
            console.warn(`[SERVER_AI] Cognitive circuit ${attempt.label} output truncated (${error.message.slice(0, 110)}). Trying next circuit...`);
            break;
          }
          
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
            keyPool.markKeyRateLimited('gemini', attempt.apiKey, RATE_LIMITED_KEY_TTL_MS);
            // Count quota failures per model: 2+ keys 429ing on the same model
            // this cycle means the model is exhausted pool-wide, so the pool
            // skips its remaining keys instead of burning them.
            const failCount = (modelQuotaFailCount.get(attempt.modelId) || 0) + 1;
            modelQuotaFailCount.set(attempt.modelId, failCount);
            if (failCount >= 2) {
              console.warn(`[SERVER_AI] Model '${attempt.modelId}' quota-exhausted across ${failCount} key(s). Skipping remaining pool keys for it this cycle.`);
            }
            // Also cool the pair in the durable ApiKeyPool so future cycles
            // rotate to a healthy key instead of retrying the exhausted one.
            try {
              keyPool.reportFailure('gemini', attempt.apiKey, attempt.modelId, errorBody);
            } catch (_) { /* advisory */ }
          }

          // If API is overloaded (503/unavailable), register key so pool can skip it after exhausting retries
          if (isRetriable && !isQuotaOrRateLimit && retryCount === maxRetriesPerAttempt - 1) {
            console.warn(`[SERVER_AI] API Key ${attempt.apiKey.substring(0, 6)}... keeps receiving overload (503). Adding to the busy-keys list to be skipped by the pool.`);
            keyPool.markKeyOverloaded('gemini', attempt.apiKey, OVERLOADED_KEY_TTL_MS);
            // A 503 is model-wide (not key-specific) — skip the rest of this
            // model's keys for the remainder of the cycle.
            if (errorBody.includes('503') || errorBody.toLowerCase().includes('overloaded') || errorBody.toLowerCase().includes('unavailable')) {
              overloadedModelsThisCall.add(attempt.modelId);
            }
          }

          // Model-level failure (404 not-found / deprecated / no longer
          // available): the model is unusable for EVERY key in the pool, not
          // just this one — mark it failed for the TTL so the remaining keys
          // and future calls stop wasting attempts against it.
          const modelLevelFail =
            !isQuotaOrRateLimit &&
            (errorBody.includes('404') || errorBody.toLowerCase().includes('not found') || errorBody.toLowerCase().includes('no longer available')) &&
            (errorBody.toLowerCase().includes('model') || errorBody.toLowerCase().includes('models/'));
          if (modelLevelFail) {
            keyPool.markModelFailed('gemini', attempt.modelId, FAILED_MODEL_TTL_MS);
            overloadedModelsThisCall.add(attempt.modelId);
            console.warn(`[SERVER_AI] Model '${attempt.modelId}' confirmed unavailable (${errorBody.slice(0, 120)}). Marking failed for ${Math.round(FAILED_MODEL_TTL_MS / 60000)}m — skipping remaining keys.`);
          }

          // Force fail fast for quota/rate limits to jump immediately to the next fallback candidate/model instead of sleeping for 60 seconds
          if (!isRetriable || isQuotaOrRateLimit || retryCount === maxRetriesPerAttempt - 1) {
            break;
          }
        }
      }
    }

    if (attemptsToTry.length === 0) {
      throw new Error("All cognitive circuits and AI fallback paths failed: No API Key is configured for Gemini. Please fill in your API Key in the Settings panel (Providers or System tab) in Yuihime's web interface, or set the GEMINI_API_KEY environment variable in your .env / config.toml file!");
    }

    if (lastError) {
      const errMsg = lastError.message || String(lastError);
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate limit')) {
        const retryMatch = errMsg.match(/Please retry in ([0-9.]+)\s*s/i);
        const retryInfo = retryMatch ? ` (please try again in ${Math.ceil(parseFloat(retryMatch[1]))} seconds)` : '';
        throw new Error(`Google Gemini API Quota/Rate Limit Exceeded (429)${retryInfo}. All fallback circuits have been tried. Please check your API Key or add a fallback Provider in Settings.`);
      }
    }

    throw lastError || new Error("All cognitive circuits and AI fallback paths failed.");
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

  let cooldownRetrySucceeded = false;
  try {
    response = await runWithRetries();
  } catch (primaryErr: any) {
    // Full-pool cooldown retry: when the ENTIRE key x model pool fails with a
    // transient rate-limit/overload/network error (429/503/fetch failed), wait
    // the server-suggested cooldown (or a safe default) and re-run the whole
    // pool once more before giving up to the fallback chain. A short-lived 429
    // that clears within seconds must not fire the offline message prematurely.
    const errBody = primaryErr?.message || String(primaryErr);
    const isTransient = /429|503|quota|rate limit|overloaded|unavailable|temporary|demand|fetch failed|econnreset|socket|timeout|abort|truncat/i.test(errBody);
    if (isTransient) {
      const retryMatch = errBody.match(/Please retry in ([0-9.]+)\s*s/i);
      // Truncation is not a rate limit — a short pause before re-running the pool
      // (same key/model) is enough to let the provider complete the response.
      const isTruncationOnly = /truncat/i.test(errBody) && !/429|503|quota|rate limit|overloaded|unavailable|temporary|demand|fetch failed|econnreset|socket|timeout|abort/i.test(errBody);
      const cooldownMs = retryMatch && retryMatch[1]
        ? (Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1500)
        : (isTruncationOnly ? 2000 : 15000);
      console.log(`[SERVER_AI] All cognitive circuits failed transiently (${errBody.slice(0, 100)}). Cooling down ${Math.round(cooldownMs / 1000)}s then re-running the full pool once...`);
      await new Promise(res => setTimeout(res, cooldownMs));
      try {
        response = await runWithRetries();
        cooldownRetrySucceeded = true;
        console.log(`[SERVER_AI] Full-pool cooldown retry succeeded.`);
      } catch (retryErr: any) {
        primaryErr = retryErr;
      }
    }
    if (!cooldownRetrySucceeded) {
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
