import { CortexModule, ModuleType, AgentState } from '../include/types';
import { TTSGateway } from '../core/kernel/TTSGateway.js';

/**
 * TTS Selector Gateway: Centralized routing for Text-to-Speech.
 * ABSOLUTE RULE: This is the ONLY module permitted to interact with TTS Implementations.
 */
export const TTSSelectorModule: CortexModule = {
  metadata: {
    id: 'tts-selector',
    name: 'yui-api: Vocalizer Bridge',
    description: 'Centralized Speech Synthesis. Routes text to configured audio providers with automatic failover.',
    version: '1.1.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 4: EXPRESSION',
    order: 2
  },
  run: async (input: string, _state: AgentState, context: any) => {
    console.log(`[TTS_GATEWAY] Routing speech request...`);
    
    const gateway = TTSGateway.getInstance();
    const result = await gateway.speak(input, context);

    if (result.status === 'success') {
      return { 
        ...context, 
        ttsProvider: result.provider,
        ttsStatus: 'completed',
        vocalizedAt: Date.now()
      };
    } else {
      return { 
        ...context, 
        ttsStatus: 'failed',
        ttsError: result.error
      };
    }
  }
};
