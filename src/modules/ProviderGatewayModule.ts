import { CortexModule, ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { PromptRegistry } from '../core/PromptRegistry';
import { toSingleString } from '@/core/kernel/configNormalizer';
import { StorageService } from '@shared/drivers/storage';
import { DecisionRouter, EpisodicMemory } from '../core/neural/Brain.js';
import { LlmIoAuditor } from '../core/server/llmAuditor.js';
import { buildOpenAITools } from '../core/openaiTools.js';
import { SettingsManager } from '../core/kernel/settings.js';

const DEFAULT_OFFLINE_FALLBACK = `Halo user! Saat ini sirkuit kognitif Yui sedang berdiet internet (server sedang sibuk/habis kuota)`;

const DEFAULT_NANO_NLP_THOUGHT = `<thought>Online cognitive circuit failed. Subconscious offline path activated dynamically.</thought>\${localResponse}`;

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
    phase: 'PHASE 3: EVALUATION',
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
    console.log("[DEBUG_TRACE] GATEWAY.run entered");
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

    // 1. Attempt the primary provider chosen in context
    const primaryProvider = SystemRegistry.getProvider(selectedProviderId);
    if (primaryProvider) {
      const providerConfig = context.config?.providers?.[selectedProviderId] || context.config?.[selectedProviderId] || context.config || {};
      const actualModelOfProvider = toSingleString(context.model || providerConfig.model) || (primaryProvider.metadata?.models ? primaryProvider.metadata.models[0] : 'unknown');
      try {
        console.log(`[GATEWAY] Routing primary request to: ${selectedProviderId} (Attempting...)`);

        const result = await primaryProvider.generate(input, {
          ...context,
          config: providerConfig,
          tools: context.disableTools ? [] : buildOpenAITools(context.allowedTools)
        });

        console.log(`[GATEWAY] Provider ${selectedProviderId} response successfully captured.`);
        
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
      rawResult: offlineTemplate,
      activeProvider: 'hard_offline_fallback',
      fallbackTriggered: true
    };
  }
};
