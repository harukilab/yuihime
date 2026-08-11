import { CortexModule, ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { PromptRegistry } from '../core/PromptRegistry';
import { toSingleString } from '@/core/kernel/configNormalizer';
import { StorageService } from '@shared/drivers/storage';
import { DecisionRouter, EpisodicMemory } from '../core/neural/Brain.js';
import { LlmIoAuditor } from '../core/server/llmAuditor.js';
import { buildOpenAITools } from '../core/openaiTools.js';
import { SettingsManager } from '../core/kernel/settings.js';
import { injectCharacterName } from '../core/kernel/characterName';
import { loadKeyPoolState, saveKeyPoolState, pruneExpiryMap } from '../core/kernel/apiKeyPoolStore.js';

const DEFAULT_OFFLINE_FALLBACK = `Hi user! \${characterName}'s cognitive circuit is currently on an internet diet (the server is busy/out of quota)`;

const DEFAULT_NANO_NLP_THOUGHT = `<thought>Online cognitive circuit failed. Subconscious offline path activated dynamically.</thought>\${localResponse}`;

// Provider-level temporary blocklist: a provider that failed end-to-end (all of
// its keys / attempts exhausted) is skipped by the gateway for a few minutes so
// the pool does not retry a dead provider on every request. Persisted to
// key_pool_state.json under `failedProviders`, keyed by providerId.
const PROVIDER_FAIL_TTL_MS = 5 * 60 * 1000;
const failedProviders = new Map<string, number>();

// Restore persisted provider-level blocklist across restarts.
(function hydrateProviderFailures(): void {
  try {
    const state = loadKeyPoolState();
    if (state.failedProviders) {
      for (const [k, expiry] of Object.entries(pruneExpiryMap(state.failedProviders))) {
        failedProviders.set(k, expiry);
      }
    }
    if (failedProviders.size > 0) {
      console.log(`[GATEWAY] Restored ${failedProviders.size} temporarily-failed provider(s) from disk.`);
    }
  } catch (err: any) {
    console.warn('[GATEWAY] Failed to hydrate provider failure state:', err?.message || err);
  }
})();

function persistProviderFailures(): void {
  try {
    const now = Date.now();
    const failed: Record<string, number> = {};
    for (const [k, expiry] of failedProviders) {
      if (expiry > now) failed[k] = expiry;
    }
    const existing = loadKeyPoolState();
    saveKeyPoolState({
      ...(existing?.overloaded ? { overloaded: existing.overloaded } : {}),
      ...(existing?.rateLimited ? { rateLimited: existing.rateLimited } : {}),
      ...(existing?.cooldowns ? { cooldowns: existing.cooldowns } : {}),
      ...(existing?.failedModels ? { failedModels: existing.failedModels } : {}),
      failedProviders: failed
    });
  } catch (err: any) {
    console.warn('[GATEWAY] Failed to persist provider failure state:', err?.message || err);
  }
}

/** True while a provider is temporarily blocklisted by the gateway. */
function isProviderFailed(providerId: string): boolean {
  const expiry = failedProviders.get(providerId);
  return !!(expiry && expiry > Date.now());
}

/** Mark a provider as failed end-to-end for the TTL (persisted). */
function markProviderFailed(providerId: string): void {
  failedProviders.set(providerId, Date.now() + PROVIDER_FAIL_TTL_MS);
  persistProviderFailures();
  console.warn(`[GATEWAY] Provider '${providerId}' marked temporarily failed (${Math.round(PROVIDER_FAIL_TTL_MS / 60000)}m) — skipping it on subsequent requests.`);
}

/** Clear a provider from the blocklist when it succeeds again. */
function clearProviderFailure(providerId: string): void {
  if (failedProviders.delete(providerId)) {
    persistProviderFailures();
  }
}

PromptRegistry.getInstance().register('provider-gateway:offline_fallback', DEFAULT_OFFLINE_FALLBACK);
PromptRegistry.getInstance().register('provider-gateway:nano_nlp_offline', DEFAULT_NANO_NLP_THOUGHT);

/**
 * Provider Gateway: Intelligent Gateway for LLM routing.
 * ABSOLUTE RULE: This is the ONLY module permitted to interact with LLM Provider instances.
 * All other modules MUST call this gateway to perform AI thinking/generation.
 */
export const ProviderGatewayModule: CortexModule = {
  metadata: {
    id: 'provider-gateway',
    name: 'yui-llm-client: Provider Gateway',
    description: 'Centralized AI Gateway. All LLM requests must pass through this node.',
    version: '2.0.0',
    type: ModuleType.CORTEX,
    phase: 'evaluation',
    order: 1,
    configSchema: {
      fields: {
        enableOfflineFallback: {
          type: 'boolean',
          label: 'Enable Offline Fallback Message',
          default: true,
          description: 'If disabled, Yui will not speak the offline fallback message when all providers fail.'
        },
        offlineFallbackMessage: {
          type: 'textarea',
          label: 'Offline Fallback Message',
          default: DEFAULT_OFFLINE_FALLBACK,
          description: 'Message spoken when all providers and local NLP fail. Keep the <thought> internal note in English; the spoken part may use the user language.'
        },
        systemPoolFailover: {
          type: 'boolean',
          label: 'System Pool Failover (opencode-style)',
          default: true,
          description: 'When the primary provider fails, auto-switch across every configured provider in the system pool (Gemini, Custom, OpenRouter, Anthropic, OpenAI, Local, ...) and use the first healthy one. Disable to keep strict single-provider behavior.'
        }
      }
    }
  },
  run: async (input: string, state: any, context: any) => {
    if (context.bypassGateway) {
      console.log('[GATEWAY] Bypassing LLM generation. Using local response.');
      return {
        ...context,
        rawResult: context.processedResponse
      };
    }
    console.debug("[DEBUG_TRACE] GATEWAY.run entered");
    console.log('[GATEWAY] Evaluating provider suitability...');

    // Helper for Real-time Self-Learning Feedback Loop (Dual-Process Human Emulation)
    const triggerSelfLearning = async (promptText: string, resultText: string) => {
      try {
        const customSettings = (await StorageService.getModularSettings()) || {};
        const localNlpConfig = customSettings['local-nano-nlp'] || {};
        const enableSelfLearning = localNlpConfig.enableSelfLearning !== undefined ? !!localNlpConfig.enableSelfLearning : false;

        if (!enableSelfLearning) {
          console.log('[DUAL_COGNITION] Self-Learning bypassed (disabled by user settings).');
          return;
        }

        const cleanResult = resultText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
        if (promptText && promptText.trim().length > 0) {
          const router = new DecisionRouter();
          await router.loadFromStorage();
          
           const resultContainsTools = resultText.includes('<tool_calls>') || resultText.includes('</tool_calls>') || /"tool_calls"\s*:\s*\[/.test(resultText);
          const isSemantic = /^(siapa|bagaimana|mengapa|kenapa|gimana|apa|dimana|di mana|hitung|periksa|baca|tulis|remind|ingatkan|cari)/i.test(promptText.trim().toLowerCase());
          
          if (isSemantic || resultContainsTools) {
            router.train(promptText, 'llm');
            console.log('[DUAL_COGNITION] Self-Learning: Trained Bayes router to route to [llm] due to semantic/tool characteristics.');
          } else {
            router.train(promptText, 'lokal');
            console.log('[DUAL_COGNITION] Self-Learning: Trained Bayes router to route to [lokal] for lightweight interaction.');
          }
          await router.saveToStorage();

          const episodic = new EpisodicMemory();
          await episodic.loadFromStorage();
          episodic.remember(promptText, cleanResult);
          await episodic.saveToStorage();

          console.log('[DUAL_COGNITION] Self-Learning check: Bayes router updated and episodic memory trace registered.');
        }
      } catch (learnErr) {
        console.warn('[DUAL_COGNITION] Real-time self-learning feedback bypassed:', learnErr);
      }
    };

    // Decision Logic: Default to Gemini, but could branch based on task complexity
    const selectedProviderId = context.config?.provider || 'gemini';
    let lastError: any = null;

    // Helper to log non-gemini providers so they correctly appear in the UI audit logs
    const recordNonGeminiLog = async (provId: string, modelId: string, response?: string, error?: string) => {
      if (provId === 'gemini') return;
      try {
        const auditorPath = '../core/server/llmAuditor.js';
        LlmIoAuditor.recordLog({
          prompt: input,
          systemInstruction: context.assembledSystemPrompt || context.systemPrompt,
          model: modelId || 'unknown',
          provider: provId,
          response,
          error
        });
      } catch (err) {
        console.warn('[GATEWAY_LOG_ERROR] Could not log provider trace:', err);
      }
    };

    // 1. Attempt the primary provider chosen in context.
    // Composite 'custom:<name>' ids resolve to the 'custom' driver module with
    // the per-instance config from [custom.<name>], mirroring the system pool
    // logic below so a custom instance can serve as the primary provider.
    const resolveProviderEntry = (id: string): { module: any; config: any } => {
      if (id.startsWith('custom:')) {
        const instName = id.slice('custom:'.length);
        const customRoot = (context.config?.providers?.custom || context.config?.custom || {}) as any;
        return { module: SystemRegistry.getProvider('custom'), config: customRoot[instName] || context.config || {} };
      }
      return {
        module: SystemRegistry.getProvider(id),
        config: context.config?.providers?.[id] || context.config?.[id] || context.config || {}
      };
    };
    const primaryResolved = resolveProviderEntry(selectedProviderId);
    const primaryProvider = primaryResolved.module;
    if (primaryProvider && !isProviderFailed(selectedProviderId)) {
      const providerConfig = primaryResolved.config;
      const actualModelOfProvider = toSingleString(context.model || providerConfig.model) || (primaryProvider.metadata?.models ? primaryProvider.metadata.models[0] : 'unknown');
      try {
        console.log(`[GATEWAY] Routing primary request to: ${selectedProviderId} (Attempting...)`);

        const result = await primaryProvider.generate(input, {
          ...context,
          config: providerConfig,
          debugRequestLogging: context.config?.debug?.requestLogging === true || context.config?.['tool-executor']?.debugRequestLogging === true,
          tools: context.disableTools ? [] : buildOpenAITools(context.allowedTools)
        });

        console.log(`[GATEWAY] Provider ${selectedProviderId} response successfully captured.`);
        clearProviderFailure(selectedProviderId);
        
        await triggerSelfLearning(input, result);
        await recordNonGeminiLog(selectedProviderId, actualModelOfProvider, result);

        return { 
          ...context, 
          rawResult: result, 
          activeProvider: selectedProviderId 
        };
      } catch (error: any) {
        lastError = error;
        // console.error(`[GATEWAY] Primary Provider ${selectedProviderId} failed:`, error.message || String(error));
        await recordNonGeminiLog(selectedProviderId, actualModelOfProvider, undefined, error.message || String(error));
        markProviderFailed(selectedProviderId);
      }
    } else if (primaryProvider && isProviderFailed(selectedProviderId)) {
      console.log(`[GATEWAY] Skipping primary provider '${selectedProviderId}' (temporarily failed). Trying system pool failover...`);
    }

    // opencode-style System Pool Failover: pull every configured provider from
    // the registry, skipping the primary already attempted, providers explicitly
    // disabled, and providers with no usable credential. The first healthy one
    // wins (auto-switch to the provider already set in settings). Config sources
    // mirror the primary lookup: context.config.providers.<id> -> context.config.<id>.
    const gatewayPoolConfig = await SystemRegistry.getConfig('provider-gateway').catch(() => ({}));
    const systemPoolEnabled = gatewayPoolConfig?.systemPoolFailover !== false;
    const providerAttempted = new Set<string>([selectedProviderId]);
    const poolProviderIds: string[] = [];
    // Nested [custom.<name>] sections are full provider configs (baseUrl /
    // apiKey / model / customHeaders / temperature) that register extra custom
    // providers without editing code. id becomes 'custom:<name>'.
    const customInstanceConfigs = new Map<string, any>();

    if (systemPoolEnabled) {
      for (const prov of SystemRegistry.getProviders()) {
        const pId = prov.metadata.id;
        if (!pId || providerAttempted.has(pId)) continue;
        const pCfg = context.config?.providers?.[pId] || context.config?.[pId] || {};
        const explicitlyDisabled = pCfg.enabled === false;
        const keyRaw = pCfg.apiKey || pCfg.api_key || pCfg.apiKeys || '';
        const hasApiKey = typeof keyRaw === 'string' ? keyRaw.trim().length > 0 : (Array.isArray(keyRaw) ? keyRaw.some((k: any) => k && String(k).trim().length > 0) : Boolean(keyRaw));
        // Local providers run without an API key; everyone else must present a
        // real credential to avoid burning pool time on a guaranteed 401.
        const needsKey = pId !== 'local';
        const hasCredential = needsKey ? hasApiKey : Boolean(pCfg.baseUrl || pCfg.endpoint);
        const pModel = toSingleString(pCfg.model) || (prov.metadata?.models && prov.metadata.models[0]);
        if (!explicitlyDisabled && hasCredential && pModel) {
          poolProviderIds.push(pId);
          providerAttempted.add(pId);
        }
      }

      // Enumerate multi-instance custom providers from [custom.<name>].
      const CUSTOM_INSTANCE_KEYS = new Set(['baseUrl', 'base_url', 'apiKey', 'api_key', 'apiKeys', 'api_keys', 'model', 'customHeaders', 'temperature', 'enabled', 'payloadBlueprint', 'endpoint', 'isJson']);
      const customRoot = (context.config?.providers?.custom || context.config?.custom);
      if (customRoot && typeof customRoot === 'object' && !Array.isArray(customRoot)) {
        for (const [name, instCfg] of Object.entries(customRoot)) {
          if (CUSTOM_INSTANCE_KEYS.has(name)) continue;
          if (!instCfg || typeof instCfg !== 'object' || Array.isArray(instCfg)) continue;
          const instanceId = `custom:${name}`;
          if (providerAttempted.has(instanceId)) continue;
          const cfg = instCfg as any;
          if (cfg.enabled === false) continue;
          const instKeyRaw = cfg.apiKey || cfg.api_key || cfg.apiKeys || '';
          const instHasCredential = typeof instKeyRaw === 'string' ? instKeyRaw.trim().length > 0 : (Array.isArray(instKeyRaw) ? instKeyRaw.some((k: any) => k && String(k).trim().length > 0) : Boolean(instKeyRaw));
          const instModel = toSingleString(cfg.model) || (SystemRegistry.getProvider('custom')?.metadata?.models?.[0]) || 'custom-model';
          if (instHasCredential && instModel) {
            poolProviderIds.push(instanceId);
            providerAttempted.add(instanceId);
            customInstanceConfigs.set(instanceId, cfg);
          }
        }
      }

      console.log(`[GATEWAY] System pool failover enabled — ${poolProviderIds.length} candidate provider(s): ${poolProviderIds.join(', ') || 'none'}`);
    }

    if (poolProviderIds.length > 0) {
      for (const poolProviderId of poolProviderIds) {
        if (isProviderFailed(poolProviderId)) {
          console.log(`[GATEWAY_POOL] Skipping provider '${poolProviderId}' (temporarily failed).`);
          continue;
        }
        // Multi-instance custom providers use the 'custom' driver module but a
        // per-instance config keyed as 'custom:<name>'.
        const isCustomInstance = poolProviderId.startsWith('custom:');
        const poolProvider = isCustomInstance
          ? SystemRegistry.getProvider('custom')
          : SystemRegistry.getProvider(poolProviderId);
        if (!poolProvider) continue;
        const poolProviderConfig = isCustomInstance
          ? (customInstanceConfigs.get(poolProviderId) || {})
          : (context.config?.providers?.[poolProviderId] || context.config?.[poolProviderId] || {});
        const poolModel = toSingleString(poolProviderConfig.model) || (poolProvider.metadata?.models ? poolProvider.metadata.models[0] : 'unknown');
        try {
          console.log(`[GATEWAY_POOL] Auto-switching to system pool provider: ${poolProviderId} (model: ${poolModel})`);

          const result = await poolProvider.generate(input, {
            ...context,
            config: poolProviderConfig,
            debugRequestLogging: context.config?.debug?.requestLogging === true || context.config?.['tool-executor']?.debugRequestLogging === true,
            tools: context.disableTools ? [] : buildOpenAITools(context.allowedTools)
          });

          console.log(`[GATEWAY_POOL] Provider ${poolProviderId} response successfully captured (system pool failover).`);
          clearProviderFailure(poolProviderId);

          await triggerSelfLearning(input, result);
          await recordNonGeminiLog(poolProviderId, poolModel, result);

          return {
            ...context,
            rawResult: result,
            activeProvider: poolProviderId,
            poolFailoverTriggered: true
          };
        } catch (error: any) {
          lastError = error;
          console.warn(`[GATEWAY_POOL] Provider ${poolProviderId} failed (system pool failover):`, error.message || String(error));
          await recordNonGeminiLog(poolProviderId, poolModel, undefined, error.message || String(error));
          markProviderFailed(poolProviderId);
        }
      }
    }

    // 2. Cycle dynamically through User's custom multi-provider fallbackChain if primary fails
    try {
      const settings = await SettingsManager.getInstance().load();
      const geminiSettings = (settings.gemini || {}) as any;
      const fallbackChain = geminiSettings.fallbackChain || [];

      if (fallbackChain && fallbackChain.length > 0) {
        console.log(`[GATEWAY] Running custom fallback chain cascade with ${fallbackChain.length} steps...`);
        for (const item of fallbackChain) {
          const providerId = item.provider;
          const fallbackProvider = SystemRegistry.getProvider(providerId);
          
          if (!fallbackProvider) {
             console.warn(`[GATEWAY] Fallback Provider ${providerId} not found in registry. Skipping...`);
             continue;
          }

          if (isProviderFailed(providerId)) {
            console.log(`[GATEWAY_FALLBACK] Skipping fallback provider '${providerId}' (temporarily failed).`);
            continue;
          }

          try {
            console.log(`[GATEWAY_FALLBACK] Routing to fallback step: ${providerId} (model: ${item.model})`);

            const providerConfig = {
              ...(settings[providerId] || {}),
              model: item.model,
              apiKey: item.apiKey || settings[providerId]?.apiKey
            };

            const result = await fallbackProvider.generate(input, {
              ...context,
              config: providerConfig,
              tools: context.disableTools ? [] : buildOpenAITools(context.allowedTools)
            });

            console.log(`[GATEWAY_FALLBACK] Fallback Step ${providerId} succeeded!`);
            clearProviderFailure(providerId);
            
            await triggerSelfLearning(input, result);
            await recordNonGeminiLog(providerId, item.model || 'unknown', result);

            return { 
              ...context, 
              rawResult: result, 
              activeProvider: providerId 
            };
          } catch (error: any) {
            console.error(`[GATEWAY_FALLBACK] Fallback step to ${providerId} failed:`, error.message || String(error));
            await recordNonGeminiLog(providerId, item.model || 'unknown', undefined, error.message || String(error));
            markProviderFailed(providerId);
          }
        }
      }
    } catch (importErr) {
      console.warn('[GATEWAY] FallbackChain config retrieval failed:', importErr);
    }

    // console.error(`[GATEWAY] Critical Failure: All providers exhausted. Initiating emergency offline fallback...`);
    try {
      const localNLP = SystemRegistry.getModule('local-nano-nlp');
      if (localNLP && typeof localNLP.run === 'function') {
        const localResult = await localNLP.run(input, state || {}, context);
        if (localResult && localResult.processedResponse) {
          console.log('[GATEWAY] Successfully activated subconscious local Markov fallbacks.');
          return {
            ...context,
            rawResult: PromptRegistry.getInstance().compile('provider-gateway:nano_nlp_offline', { localResponse: localResult.processedResponse }),
            activeProvider: 'offline_nano_nlp',
            fallbackTriggered: true
          };
        }
      }
    } catch (nlpErr: any) {
      console.error('[GATEWAY] Emergency Local Nano NLP fallback failed:', nlpErr);
    }

    const gatewayConfig = await SystemRegistry.getConfig('provider-gateway').catch(() => ({}));
    if (gatewayConfig && gatewayConfig.enableOfflineFallback === false) {
      console.log('[GATEWAY] Offline fallback message disabled by user settings.');
      return {
        ...context,
        rawResult: '',
        activeProvider: 'hard_offline_fallback',
        fallbackTriggered: true
      };
    }
    const offlineTemplate = (gatewayConfig && gatewayConfig.offlineFallbackMessage) || PromptRegistry.getInstance().get('provider-gateway:offline_fallback');
    return {
      ...context,
      rawResult: injectCharacterName(offlineTemplate),
      activeProvider: 'hard_offline_fallback',
      fallbackTriggered: true
    };
  }
};
