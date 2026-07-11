import { ProviderModule, ModuleType } from '../../include/types';

/**
 * LocalProvider: Mock for local inference or custom local gateway.
 * Can be extended to connect to Ollama or similar local APIs.
 */
export const LocalProvider: ProviderModule = {
  metadata: {
    id: 'local',
    name: 'Local Engine (Ollama/Custom)',
    description: 'Connection for locally hosted LLMs.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 3,
    models: ['llama3', 'mistral', 'phi3'],
    configSchema: {
      fields: {
        baseUrl: { type: 'string', label: 'Base URL', default: 'http://localhost:11434/api' },
        model: { type: 'string', label: 'Model', default: 'llama3' }
      }
    }
  },
  getModels: async (config: any) => {
    return [
      { label: 'Llama 3', value: 'llama3' },
      { label: 'Mistral', value: 'mistral' },
      { label: 'Phi-3', value: 'phi3' }
    ];
  },
  generate: async (prompt: string, context: any) => {
    const config = context.config?.local || context.config || (context.model ? context : {});
    const baseUrl = config.baseUrl || 'http://localhost:11434/api';
    const model = config.model || LocalProvider.metadata.models[0];

    try {
      const response = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          system: context.assembledSystemPrompt,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Local Engine Error: ${response.status}`);
      }

      const data = await response.json();
      return data.response || "";
    } catch (e: any) {
      throw new Error(`Local Provider failed: ${e.message}. Is your local server running?`);
    }
  }
};
