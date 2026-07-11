import { CortexModule, ModuleType } from '../include/types';

/**
 * Output Renderer: Prepares final text for the UI and speech modules.
 */
export const OutputRendererModule: CortexModule = {
  metadata: {
    id: 'output-renderer',
    name: 'Output Synthesis',
    description: 'Finalizes the response string and prepares artifacts for the presentation layer.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'output',
    order: 10
  },
  run: async (input: string, _state: any, context: any) => {
    console.log('[RENDERER] Synthesizing final presentation...');
    
    // Fallback to input if processedResponse is missing
    const finalResult = context.processedResponse || input;

    return {
      ...context,
      finalOutput: finalResult,
      isReadyForPresentation: true
    };
  }
};
