import { ProviderModule, ModuleType } from '@shared/include/types';
import { buildChatMessages, normalizeToolCallsToOpenAI, normalizeToolChoice, normalizeToolsForProvider } from '../../core/openaiTools';
import { toSingleString } from '@/core/kernel/configNormalizer';

/**
 * LocalProvider: Connects to a locally hosted LLM (Ollama / LM Studio / etc.).
 * Uses the chat-completions style endpoint so native function calling (`tools`)
 * is supported, mirroring the OpenAI-compatible shape used across Yuihime.
 */
export const LocalProvider: ProviderModule = {
  metadata: {
    id: 'local',
    name: 'Local Engine (Ollama/Custom)',
    description: 'Connection for locally hosted LLMs.',
    version: '1.1.0',
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
    const model = toSingleString(config.model) || LocalProvider.metadata.models[0];

    const blueprint = context.payloadBlueprint || config.payloadBlueprint;
    let systemInstruction = context.assembledSystemPrompt || context.systemPrompt || '';
    let promptText = prompt;
    if (blueprint) {
      const sysMsg = blueprint.messages.find((m: any) => m.role === 'system');
      if (sysMsg) systemInstruction = sysMsg.content;
      const usrMsg = blueprint.messages.find((m: any) => m.role === 'user');
      if (usrMsg) promptText = usrMsg.content;
    }

    try {
      const messages = buildChatMessages('local', {
        system: systemInstruction,
        user: promptText,
        historyBlocks: context.nativeTurnBlocks,
        assistantToolCalls: context.assistantToolCalls,
        toolMessages: context.toolMessages
      });

      const payload: any = { model, messages, stream: false };

      const localTools = normalizeToolsForProvider(
        (Array.isArray(context.tools) && context.tools.length > 0) ? context.tools : [],
        'local'
      );
      if (localTools) {
        payload.tools = localTools;
        const toolChoice = normalizeToolChoice(context.toolChoice, 'local');
        if (toolChoice) payload.tool_choice = toolChoice;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Local Engine Error: ${response.status}`);
      }

      const data = await response.json();
      // Ollama returns { message: { content, tool_calls } }
      const message = data.message || {};
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        return JSON.stringify({ tool_calls: normalizeToolCallsToOpenAI(message, 'local') });
      }
      return message.content || data.response || "";
    } catch (e: any) {
      throw new Error(`Local Provider failed: ${e.message}. Is your local server running?`);
    }
  }
};
