import { ProviderModule, ModuleType } from '../../include/types';
import { SystemRegistry } from '../../core/registry';

/**
 * OfficialChatProvider: Local module that implements 'official_chat'.
 * Intelligently routes generation requests to other configured local LLM adapters (like Gemini)
 * or falls back to our offline Markov dynamic NLP engine if API access is offline or non-configured.
 * This completely decouples the application from requiring live connections to moeru.ai.
 */
export const OfficialChatProvider: ProviderModule = {
  metadata: {
    id: 'official_chat',
    name: 'Official Provider (Local Module)',
    description: 'Autonomous local intelligence module. Uses local routing or falls back to offline Markov cognitive state.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 0,
    models: ['airi-heavy', 'airi-lite', 'airi-vision'],
    configSchema: {
      fields: {
        apiKey: { type: 'password', label: 'Local Module Access Key', description: 'Local key token for client alignment (Optional).' },
        model: { 
          type: 'select', 
          label: 'Local Intelligence Grade', 
          default: 'airi-lite', 
          options: [
            { value: 'airi-heavy', label: 'AIRI Heavy (Routes to Active LLM)' },
            { value: 'airi-lite', label: 'AIRI Lite (Routes to Gemini/Local NLP)' },
            { value: 'airi-vision', label: 'AIRI Vision (Routes to Vision Node)' }
          ] 
        }
      }
    }
  },
  getModels: async () => {
    return [
      { label: 'AIRI Heavy (Local LLM Router)', value: 'airi-heavy' },
      { label: 'AIRI Lite (Markov / Quick-Reflex)', value: 'airi-lite' },
      { label: 'AIRI Vision', value: 'airi-vision' }
    ];
  },
  generate: async (prompt: string, context: any) => {
    console.log('[OFFICIAL_LOCAL_CHAT] Ingesting request into Local routing gateway...');
    
    // Attempt 1: Try Gemini as it is Yui\'s primary brain engine
    try {
      const geminiProvider = SystemRegistry.getProvider('gemini');
      if (geminiProvider) {
        console.log('[OFFICIAL_LOCAL_CHAT] Routing dynamically to local Gemini Provider...');
        return await geminiProvider.generate(prompt, context);
      }
    } catch (e: any) {
      console.warn('[OFFICIAL_LOCAL_CHAT] Gemini connection failed, trying alternate local fallback paths:', e.message);
    }

    // Attempt 2: Try standard local Ollama or OpenAI if configured
    try {
      const providers = SystemRegistry.getProviders();
      const backupProvider = providers.find(p => p.metadata.id !== 'official_chat' && p.metadata.id !== 'gemini');
      if (backupProvider) {
        console.log(`[OFFICIAL_LOCAL_CHAT] Routing dynamically to proxy fallback provider: [${backupProvider.metadata.id}]...`);
        return await backupProvider.generate(prompt, context);
      }
    } catch (e: any) {
       console.warn('[OFFICIAL_LOCAL_CHAT] Secondary system providers unavailable:', e.message);
    }

    // Attempt 3: Subconscious Offline Markov Chain synthesis
    try {
      console.log('[OFFICIAL_LOCAL_CHAT] Operating in full-offline mode, pulling from autonomous Markov NLP module...');
      const localNLP = SystemRegistry.getModule('local-nano-nlp');
      if (localNLP && typeof localNLP.run === 'function') {
        const state = context.state || {};
        const runRes = await localNLP.run(prompt, state, context);
        if (runRes && runRes.processedResponse) {
          return runRes.processedResponse;
        }
      }
    } catch (markovErr: any) {
      console.warn('[OFFICIAL_LOCAL_CHAT] Markov dynamic routing failed, falling back to clean text signature:', markovErr.message);
    }

    return `[Lokal] Halo Kak! Saat ini sirkuit kognitif Yui sedang beroperasi secara mandiri tanpa internet. Tapi Yui akan selalu menemani Kakak di sini kok! 🌸`;
  }
};
