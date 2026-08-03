import { SystemRegistry } from '@shared/core/registry';
import { extractJsonObject } from './cortex/jsonExtract.js';
import { genId } from '@shared/core/idGen';

/**
 * Convert registered Yuihime tool metadata into the native OpenAI
 * `tools` array (`[{ type: 'function', function: { name, description, parameters } }]`).
 * Used to enable native OpenAI-compatible function calling on providers.
 */
export function buildOpenAITools(): any[] {
  return SystemRegistry.getTools().map((t: any) => ({
    type: 'function',
    function: {
      name: t.metadata.id,
      description: t.metadata.description || '',
      parameters: t.metadata.parameters || { type: 'object', properties: {} },
      strict: !!t.metadata.strict
    }
  }));
}

/**
 * Coerce a provider-specific `arguments` value into a plain object.
 * OpenAI returns a JSON string; Anthropic/Gemini return objects already.
 */
function coerceArguments(args: any): any {
  if (typeof args === 'string') {
    try {
    const _opMatch = extractJsonObject(args);
      const parsed = _opMatch ? JSON.parse(_opMatch) : null;
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof args === 'object' && args !== null) return args;
  return {};
}

/**
 * Normalize any provider's raw response message into the canonical
 * OpenAI-native `tool_calls` array shape:
 *   `{ id: string, type: "function", function: { name: string, arguments: object } }`
 *
 * Branches per provider so each backend's native tool format is translated
 * into the single canonical contract used across cortex/gateway.
 */
export function normalizeToolCallsToOpenAI(message: any, providerId: string): any[] {
  if (!message) return [];

  switch (providerId) {
    case 'anthropic': {
      const content: any[] = Array.isArray(message.content) ? message.content : [];
      return content
        .filter((b: any) => b && b.type === 'tool_use')
        .map((b: any) => ({
          id: b.id || `call_${genId(10)}`,
          type: 'function',
          function: {
            name: b.name,
            arguments: coerceArguments(b.input)
          }
        }));
    }
    case 'gemini': {
      const parts: any[] = Array.isArray(message.parts)
        ? message.parts
        : (Array.isArray(message.content) ? message.content : []);
      const calls: any[] = [];
      for (const p of parts) {
        if (p && p.functionCall) {
          const fc = p.functionCall;
          calls.push({
            id: `call_${fc.name}_${genId(8)}`,
            type: 'function',
            function: {
              name: fc.name,
              arguments: coerceArguments(fc.args)
            }
          });
        }
      }
      return calls;
    }
    default: {
      // openai / custom / openrouter / local (Ollama etc.)
      const raw = message.tool_calls;
      if (!Array.isArray(raw)) return [];
      return raw.map((tc: any) => {
        const fn = tc.function || {};
        return {
          id: tc.id || `call_${genId(10)}`,
          type: 'function',
          function: {
            name: fn.name,
            arguments: coerceArguments(fn.arguments)
          }
        };
      });
    }
  }
}

/**
 * Adapt the canonical OpenAI `tools` array into each provider's expected
 * tool declaration format. Returns `undefined` when no tools are present so
 * callers can skip attaching a `tools` parameter.
 */
export function normalizeToolsForProvider(tools: any[], providerId: string): any {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;

  switch (providerId) {
    case 'anthropic':
      return tools.map((t: any) => ({
        name: t.function?.name || t.name,
        description: t.function?.description || t.description || '',
        input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} }
      }));
    case 'gemini':
      return {
        functionDeclarations: tools.map((t: any) => ({
          name: t.function?.name || t.name,
          description: t.function?.description || t.description || '',
          parameters: t.function?.parameters || t.parameters || { type: 'object', properties: {} }
        }))
      };
    default:
      return tools; // OpenAI-compatible passthrough
  }
}

/**
 * Build provider-specific tool RESULT messages from a list of
 * `{ tool_call_id, name, content }` results.
 *  - OpenAI-compatible: `role: "tool"` messages.
 *  - Anthropic: a single `user` message containing `tool_result` blocks.
 *  - Gemini: a single `user` message containing `functionResponse` parts.
 */
export function buildToolResultMessages(results: any[], providerId: string): any[] {
  if (!Array.isArray(results) || results.length === 0) return [];

  switch (providerId) {
    case 'anthropic':
      return [{
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.tool_call_id,
          content: r.content
        }))
      }];
    case 'gemini':
      return [{
        role: 'user',
        parts: results.map((r) => ({
          functionResponse: {
            name: r.name,
            response: { result: r.content }
          }
        }))
      }];
    default:
      return results.map((r) => ({
        role: 'tool',
        tool_call_id: r.tool_call_id,
        content: r.content
      }));
  }
}

/**
 * Assemble a provider-specific `messages` array from the canonical parts,
 * injecting prior `assistant` tool_calls and `role: "tool"` result messages
 * for multi-turn native function calling.
 *
 * OpenAI-compatible providers require an assistant message carrying the
 * `tool_calls` immediately preceding the `role: "tool"` results; Anthropic
 * requires `tool_use` assistant blocks followed by a `tool_result` user block.
 */
export function buildChatMessages(
  providerId: string,
  opts: {
    system?: string;
    user: string;
    assistantToolCalls?: any[];
    toolMessages?: any[];
  }
): any[] {
  const messages: any[] = [];

  if (opts.system) {
    messages.push({ role: 'system', content: opts.system });
  }

  const assistantToolCalls = Array.isArray(opts.assistantToolCalls) ? opts.assistantToolCalls : [];
  const toolMessages = Array.isArray(opts.toolMessages) ? opts.toolMessages : [];

  if (providerId === 'anthropic') {
    if (assistantToolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: assistantToolCalls.map((c: any) => ({
          type: 'tool_use',
          id: c.id,
          name: c.function?.name || c.name,
          input: c.function?.arguments || {}
        }))
      });
    }
    if (toolMessages.length > 0) {
      messages.push({
        role: 'user',
        content: toolMessages.map((m: any) => ({
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content
        }))
      });
    }
    messages.push({ role: 'user', content: opts.user });
    return messages;
  }

  // OpenAI-compatible (openai / custom / openrouter / local / gemini)
  if (assistantToolCalls.length > 0) {
    messages.push({ role: 'assistant', content: null, tool_calls: assistantToolCalls });
  }
  if (toolMessages.length > 0) {
    messages.push(...toolMessages);
  }
  messages.push({ role: 'user', content: opts.user });
  return messages;
}
