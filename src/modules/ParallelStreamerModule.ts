import { CortexModule, ModuleType } from '../include/types';
import { SystemRegistry } from '../core/registry';

/**
 * Parallel Streamer: Acts as a hub/switch for data distribution.
 * Manages the flow between the Verifier as primary input and Parser as secondary.
 */
export const ParallelStreamerModule: CortexModule = {
  metadata: {
    id: 'parallel-streamer',
    name: 'yui-router: Neural Sync Bus',
    description: 'A dual-IO hub that synchronizes data between verification gates and parsers.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 4: OPTIMIZATION',
    order: 2
  },
  run: async (input: string, _state: any, context: any) => {
    console.log('[STREAMER] Hub active. Routing signals...');

    // Primary Input: Usually raw string from LLM or Verifier
    const primaryInput = context.rawResult || input;
    
    // 1. Dispatch to Secondary Output (Neural Parser / Loop) FIRST as required by design
    console.log('[STREAMER] Dispatching to Output 2 (Parser) before distribution...');
    const parser = SystemRegistry.getModule<CortexModule>('neural-loop'); 
    
    if (primaryInput && parser) {
       const parseResult = await parser.run(primaryInput, _state, context);
       // Merge parsed intelligence back into context (Input 2)
       Object.assign(context, parseResult);
       console.log('[STREAMER] Input 2 received from Parser.');
    }

    // 2. Converge and prepare Output 1 (Distributed Result)
    console.log('[STREAMER] Signals converged. Distributing Output 1 to system nodes.');
    
    const finalResponse = context.processedResponse || primaryInput;

    return { 
      ...context, 
      streamerOutput: finalResponse,
      distributedAt: Date.now(),
      isDistributable: true 
    };
  }
};
