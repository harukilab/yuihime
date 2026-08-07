import { SystemRegistry } from '@shared/core/registry';
import { extractJsonObject } from './cortex/jsonExtract.js';
import { genId } from '@shared/core/idGen';

/**
 * Build a plain-text tool catalog for models that do NOT support the native
 * `tools`/`tool_calls` API channel (e.g. Gemma). Each tool is rendered as an
 * inline callable of the form `functions.<name>:<n>{...}` — the exact syntax
 * `readNativeToolCalls` already understands generically — so a converter model
 * can still invoke tools by emitting them as text in its reply.
 */
export function buildInlineToolsText(tools: any[]): string {
  if (!tools) return '';
  let decls = Array.isArray(tools) ? tools : (tools as any).functionDeclarations;
  if (!Array.isArray(decls) || decls.length === 0) return '';
  const lines = [
    '[CONVERTED NATIVE TOOLS (call by emitting inline text)]',
    'You may call tools ONLY by outputting a line in EXACTLY this format:',
    'functions.<toolName>:<index>{ "argName": "value", ... }',
    'The <index> is the tool\'s position in the list below (starting at 0). After a tool line, wait for its result before replying.',
    'Available tools:'
  ];
  decls.forEach((t: any, i: number) => {
    const fn: any = t?.function || t || {};
    const name = fn.name || t.name || `tool_${i}`;
    const description = fn.description || t.description || '';
    const params = fn.parameters || t.parameters || { type: 'object', properties: {} };
    lines.push(`- functions.${name}:${i} — ${description} | arguments schema: ${JSON.stringify(params)}`);
  });
  return lines.join('\n');
}

/**
 * Convert registered Yuihime tool metadata into the native OpenAI
 * `tools` array (`[{ type: 'function', function: { name, description, parameters } }]`).
 * Used to enable native OpenAI-compatible function calling on providers.
 *
 * `allowedTools` optionally scopes the exposed set to a whitelist of tool ids
 * (Kilo-style session scoping): only those tools reach the model, keeping small
 * model presets lean. When omitted, every registered tool is exposed.
 */
export function buildOpenAITools(allowedTools?: string[]): any[] {
  const allow = Array.isArray(allowedTools) && allowedTools.length > 0 ? new Set(allowedTools) : null;
  return SystemRegistry.getTools()
    .filter((t: any) => !allow || allow.has(t.metadata.id))
    .map((t: any) => {
      const fn: any = {
        name: t.metadata.id,
        description: t.metadata.description || '',
        parameters: t.metadata.parameters || { type: 'object', properties: {} },
        strict: !!t.metadata.strict
      };
      if (t.metadata.outputSchema) {
        fn.outputSchema = t.metadata.outputSchema;
      }
      return { type: 'function', function: fn };
    });
}

/**
 * Normalize a high-level tool choice (`'auto' | 'none' | 'required' | 'any' |
 * 'tool'`, a tool id string, or `{ type, name }`) into each provider's native
 * `tool_choice` shape. Returns `undefined` when no explicit choice is given so
 * callers fall back to the provider's default (`auto`).
 */
export function normalizeToolChoice(toolChoice: any, providerId: string): any {
  if (toolChoice === undefined || toolChoice === null || toolChoice === '') return undefined;

  if (typeof toolChoice === 'string') {
    const mode = toolChoice.toLowerCase();
    if (mode === 'auto') {
      if (providerId === 'anthropic') return { type: 'auto' };
      if (providerId === 'gemini') return { functionCallingConfig: { mode: 'AUTO' } };
      return 'auto';
    }
    if (mode === 'none') {
      if (providerId === 'anthropic') return { type: 'none' };
      if (providerId === 'gemini') return { functionCallingConfig: { mode: 'NONE' } };
      return 'none';
    }
    if (mode === 'required' || mode === 'any') {
      if (providerId === 'anthropic') return { type: 'any' };
      if (providerId === 'gemini') return { functionCallingConfig: { mode: 'ANY' } };
      return 'required';
    }
    if (mode === 'tool') {
      // bare 'tool' without a name -> nothing to pin, behave as auto
      if (providerId === 'anthropic') return { type: 'auto' };
      if (providerId === 'gemini') return { functionCallingConfig: { mode: 'AUTO' } };
      return 'auto';
    }
    // otherwise treat the string as a specific tool id to force
    if (/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(mode)) {
      if (providerId === 'anthropic') return { type: 'tool', name: mode };
      if (providerId === 'gemini') return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [mode] } };
      return { type: 'function', function: { name: mode } };
    }
    return undefined;
  }

  const type = toolChoice.type || 'auto';
  const name = toolChoice.name;
  if (type === 'tool' || type === 'function') {
    if (!name) {
      if (providerId === 'anthropic') return { type: 'auto' };
      if (providerId === 'gemini') return { functionCallingConfig: { mode: 'AUTO' } };
      return 'auto';
    }
    if (providerId === 'anthropic') return { type: 'tool', name };
    if (providerId === 'gemini') return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [name] } };
    return { type: 'function', function: { name } };
  }
  if (type === 'none') {
    if (providerId === 'anthropic') return { type: 'none' };
    if (providerId === 'gemini') return { functionCallingConfig: { mode: 'NONE' } };
    return 'none';
  }
  if (type === 'required' || type === 'any') {
    if (providerId === 'anthropic') return { type: 'any' };
    if (providerId === 'gemini') return { functionCallingConfig: { mode: 'ANY' } };
    return 'required';
  }
  if (providerId === 'anthropic') return { type: 'auto' };
  if (providerId === 'gemini') return { functionCallingConfig: { mode: 'AUTO' } };
  return 'auto';
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
 * Read native tool calls out of a raw provider response into the canonical
 * OpenAI `tool_calls` array shape, or `null` when the response carries none.
 *
 * Accepts:
 *  - the canonical envelope `{ tool_calls: [...] }` (JSON string or object) —
 *    the transport used by all OpenAI-compatible drivers,
 *  - a raw provider message object (`{ tool_calls }` / `{ content }` /
 *    `{ parts }`) for direct API responses,
 *  - any other text (e.g. a plain assistant answer) -> `null`.
 *
 * This is the single entry point the cortex loop uses to detect native tool
 * calls on every provider; JSON-in-prompt extraction remains the fallback.
 */
export function readNativeToolCalls(rawResult: any, providerId: string): any[] | null {
  if (rawResult === undefined || rawResult === null) return null;

  if (typeof rawResult === 'string') {
    const trimmed = rawResult.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.tool_calls)) return parsed.tool_calls;
      const normalized = normalizeToolCallsToOpenAI(parsed, providerId);
      if (Array.isArray(normalized) && normalized.length > 0) return normalized;
    } catch {
      // fall through to inline fragment detection below
    }

    // Inline Gemini-style fragments (`functions.<name>:<n>{...}`) are emitted as
    // plain text by some OpenAI-compatible models (e.g. kilo openrouter/free).
    // Detect and convert each occurrence into a canonical tool call so the tool
    // channel can consume it on every provider, not just kilo.
    const inlineCalls: any[] = [];
    const inlinePattern = /functions\.([A-Za-z0-9_-]+):(\d+)\{([\s\S]*?)\}/g;
    let m: RegExpExecArray | null;
    while ((m = inlinePattern.exec(trimmed)) !== null) {
      try {
        const argsMatch = (m[3] || '').match(/\{[\s\S]*\}/);
        const args = argsMatch ? JSON.parse(argsMatch[0]) : {};
        inlineCalls.push({
          id: `call_${m[1]}_${m[2]}_${genId(8)}`,
          type: 'function',
          function: { name: m[1], arguments: args }
        });
      } catch {
        // skip malformed inline fragment
      }
    }
    if (inlineCalls.length > 0) return inlineCalls;
    return null;
  }

  if (typeof rawResult === 'object') {
    if (Array.isArray(rawResult.tool_calls) && rawResult.tool_calls.length > 0) {
      return rawResult.tool_calls;
    }
    const normalized = normalizeToolCallsToOpenAI(rawResult, providerId);
    return Array.isArray(normalized) && normalized.length > 0 ? normalized : null;
  }

  return null;
}

/**
 * Gemini's generateContent rejects several JSON-Schema keywords that the
 * OpenAI-compatible tool builder emits (e.g. `additionalProperties`, `strict`,
 * `outputSchema`). Recursively strip them so native functionDeclarations stay
 * within the Gemini schema vocabulary.
 */
export function sanitizeGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema;
  const cleaned: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties' || key === 'strict' || key === 'outputSchema' || key === '$schema') {
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      cleaned.properties = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        cleaned.properties[propName] = sanitizeGeminiSchema(propSchema);
      }
    } else if (key === 'items') {
      cleaned.items = sanitizeGeminiSchema(value);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((v) => (v && typeof v === 'object' ? sanitizeGeminiSchema(v) : v));
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
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
        input_schema: sanitizeGeminiSchema(t.function?.parameters || t.parameters || { type: 'object', properties: {} })
      }));
    case 'gemini':
      return {
        functionDeclarations: tools.map((t: any) => ({
          name: t.function?.name || t.name,
          description: t.function?.description || t.description || '',
          parameters: sanitizeGeminiSchema(t.function?.parameters || t.parameters || { type: 'object', properties: {} })
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
    historyBlocks?: any[][];
  }
): any[] {
  const messages: any[] = [];

  if (opts.system) {
    messages.push({ role: 'system', content: opts.system });
  }

  // Phase 5: interleaved per-turn history (Kilo/opencode parity). Each block is
  // a canonical [assistant(tool_calls), ...role:"tool"] group produced by the
  // loop; convert block-by-block so assistant tool_calls always immediately
  // precede their role:"tool" results (required by OpenAI-compatible APIs and
  // the Anthropic tool_use / tool_result alternation). Falls back to the legacy
  // flat two-array path below when no blocks are available.
  if (Array.isArray(opts.historyBlocks) && opts.historyBlocks.length > 0) {
    if (providerId === 'anthropic') {
      for (const block of opts.historyBlocks) {
        const assistantMsg = block.find((m: any) => m.role === 'assistant');
        const toolRows = block.filter((m: any) => m.role === 'tool');
        if (assistantMsg && Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: assistantMsg.tool_calls.map((c: any) => ({
              type: 'tool_use',
              id: c.id,
              name: c.function?.name || c.name,
              input: c.function?.arguments || {}
            }))
          });
        }
        if (toolRows.length > 0) {
          messages.push({
            role: 'user',
            content: toolRows.map((m: any) => ({
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content
            }))
          });
        }
      }
    } else {
      for (const block of opts.historyBlocks) {
        const assistantMsg = block.find((m: any) => m.role === 'assistant');
        if (assistantMsg && Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0) {
          messages.push({ role: 'assistant', content: null, tool_calls: assistantMsg.tool_calls });
        }
        messages.push(...block.filter((m: any) => m.role === 'tool'));
      }
    }
    messages.push({ role: 'user', content: opts.user });
    return messages;
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

/**
 * Strip inline Gemini-style function-call fragments (`functions.<name>:<n>{...}`)
 * that some models emit as plain text from a final answer. When a model produces
 * tool calls as literal text instead of the structured `tool_calls` array, those
 * fragments leak into the user-facing reply; this removes them cleanly.
 */
export function stripInlineToolCallFragments(text: string): string {
  if (typeof text !== 'string') return text;
  return text.replace(/functions\.[A-Za-z0-9_-]+:\d+\{[\s\S]*?\}/g, '').trim();
}
