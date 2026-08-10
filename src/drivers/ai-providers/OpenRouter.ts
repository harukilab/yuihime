import { ProviderModule, ModuleType } from '@shared/include/types';
import { buildChatMessages, normalizeToolCallsToOpenAI, normalizeToolChoice, normalizeToolsForProvider } from '../../core/openaiTools';
import { toSingleString } from '@/core/kernel/configNormalizer';
import { AIService } from '../../core/kernel/ai.js';
import { maybeLogRequestSizes } from '../../core/kernel/ai/requestDebug';

async function fetchOpenRouterModels(config: any): Promise<any[]> {
  const apiKey = config.apiKey || '';

  let data: any;
  if (typeof window === 'undefined') {
    const aiService = AIService.getInstance();
    data = await aiService.listModels('openrouter', apiKey);
  } else {
    const url = apiKey ? `/api/ai/models?provider=openrouter&apiKey=${encodeURIComponent(apiKey)}` : '/api/ai/models?provider=openrouter';
    const resp = await fetch(url);
    if (!resp.ok) return [];
    data = await resp.json();
  }

  return (data.models || []).map((m: any) => ({
    label: m.displayName || m.name.split('/').pop(),
    value: m.name.replace('models/', '')
  }));
}

export const OpenRouter: ProviderModule = {
  metadata: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Universal gateway for multiple LLMs.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 2,
    models: ['google/gemini-flash-latest', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
    configSchema: {
      fields: {
        apiKey: { type: 'textarea', label: 'OpenRouter API Key Pool', description: 'One line = one API key. At least 2 keys recommended to enable pool rotation.', default: '' },
        model: { 
          type: 'select', 
          label: 'Model Selection', 
          dynamicOptions: true,
          default: 'google/gemini-flash-latest',
          description: 'Select a model from OpenRouter' 
        }
      }
    }
  },
  getDynamicOptions: async (fieldName: string, config: any) => {
    if (fieldName === 'model') {
      try {
        return await fetchOpenRouterModels(config);
      } catch (e) {
        console.error("[OPENROUTER] Model listing failed:", e);
        return [];
      }
    }
    return [];
  },
  getModels: async (config: any) => {
    // Keep for backward compatibility with some core loops if needed
    try {
      return await fetchOpenRouterModels(config);
    } catch (e) {
      console.error("[OPENROUTER] Model listing failed:", e);
      return [];
    }
  },
  generate: async (prompt: string, context: any) => {
    const config = context.config?.openrouter || context.config || (context.model ? context : {});
    const apiKey = toSingleString(config.apiKey || config.api_key);
    // The provider's own configured model is authoritative. context.model /
    // blueprint.model carry the ACTIVE provider's model id — when OpenRouter is
    // a system-pool failover target that id belongs to the primary provider
    // (e.g. gemini-flash-lite-latest), which OpenRouter rejects with a 400.
    const googleModel = toSingleString(config.model) || toSingleString(context.model) || OpenRouter.metadata.models[0];

    const blueprint = context.payloadBlueprint || config.payloadBlueprint;
    let systemInstruction = context.assembledSystemPrompt || 'You are an AI assistant.';
    let promptText = prompt;
    let overriddenModel = googleModel;
    let isJsonFormat = !!config.isJson;

    if (blueprint) {
      // Only adopt the blueprint's model when this provider has no model of its
      // own configured — otherwise the blueprint's active-provider model id
      // leaks through during failover and OpenRouter 400s.
      if (blueprint.model && !config.model) {
        overriddenModel = blueprint.model;
      }
      const sysMsg = blueprint.messages.find((m: any) => m.role === 'system');
      if (sysMsg) {
        systemInstruction = sysMsg.content;
      }
      const usrMsg = blueprint.messages.find((m: any) => m.role === 'user');
      if (usrMsg) {
        promptText = usrMsg.content;
      }
      if (blueprint.response_format) {
        isJsonFormat = blueprint.response_format.type === 'json_object';
      }
    }

    const providerTools = Array.isArray(context.tools) && context.tools.length > 0
      ? context.tools
      : (Array.isArray(context.toolMessages) && context.toolMessages.length > 0 ? [] : undefined);

    const messages = buildChatMessages('openrouter', {
      system: systemInstruction,
      user: promptText,
      historyBlocks: context.nativeTurnBlocks,
      assistantToolCalls: context.assistantToolCalls,
      toolMessages: context.toolMessages
    });

    const payloadBody: any = {
      model: overriddenModel,
      messages: messages
    };

    maybeLogRequestSizes(context, {
      tag: 'openrouter',
      model: overriddenModel,
      messages,
      system: systemInstruction,
      tools: providerTools
    });

    const finalMaxTokens = blueprint?.max_tokens ?? config.maxOutputTokens ?? config.maxTokens;
    if (finalMaxTokens) {
      payloadBody.max_tokens = parseInt(finalMaxTokens, 10);
    }

    if (isJsonFormat) {
      payloadBody.response_format = { type: 'json_object' };
    }

    // Free-tier OpenRouter endpoints (:free / openrouter/free) do not support
    // tool use for image-generation tools (e.g. generate_image) — sending them
    // yields a 404 "No endpoints found that support tool use". Strip image-gen
    // tools from the payload for free models so the request routes successfully.
    const isFreeModel = /(^|\/)free$|openrouter\/free|:free$|^free$/i.test(overriddenModel);
    let sendTools = providerTools;
    if (isFreeModel && Array.isArray(context.tools)) {
      const filtered = context.tools.filter((t: any) => {
        const id = t?.function?.name || t?.name || '';
        return !/^generate_image|^image|^text2img|^img2img/i.test(id);
      });
      sendTools = filtered.length > 0 ? filtered : (Array.isArray(context.toolMessages) && context.toolMessages.length > 0 ? [] : undefined);
    }

    // Native OpenAI function calling: expose registered tools to the model
    if (sendTools !== undefined) {
      payloadBody.tools = normalizeToolsForProvider(sendTools, 'openrouter') || sendTools;
      payloadBody.tool_choice = normalizeToolChoice(context.toolChoice, 'openrouter') ?? 'auto';
    }

    const headers = {
      'Authorization': apiKey ? `Bearer ${apiKey}` : 'ENV_OPENROUTER_KEY',
      'HTTP-Referer': 'https://aistudio.build',
      'X-Title': 'Yuihime Agentic'
    };

    const doRequest = async (body: any) => {
      if (typeof window === 'undefined') {
        const aiService = AIService.getInstance();
        return await aiService.proxy({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          method: 'POST',
          headers,
          body
        });
      }
      const response = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: context.signal,
        body: JSON.stringify({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          method: 'POST',
          headers,
          body
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenRouter Proxy Error ${response.status}`);
      }
      return response.json();
    };

    let data: any;
    try {
      data = await doRequest(payloadBody);
    } catch (err: any) {
      // If OpenRouter rejects the whole tool-use payload ("No endpoints found
      // that support tool use"), retry once without tools so free endpoints can
      // still serve a plain-text completion.
      const msg = String(err?.message || err);
      if (sendTools !== undefined && /no endpoints found that support tool use|does not support tools|tool use/i.test(msg)) {
        const retryBody: any = { ...payloadBody };
        delete retryBody.tools;
        delete retryBody.tool_choice;
        data = await doRequest(retryBody);
      } else {
        throw err;
      }
    }

    const message = data.choices?.[0]?.message || {};
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      return JSON.stringify({ tool_calls: normalizeToolCallsToOpenAI(message, 'openrouter') });
    }
    return message.content || "";
  }
};
