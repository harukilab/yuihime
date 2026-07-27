/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Build a canonical OpenAI-native tool call object enriched with backward
 * compatible aliases (`tool`, `name`, `args`) for downstream modules.
 */
export function makeToolCall(name: string, args: any, id?: string): any {
  const callId = id || `call_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: callId,
    type: 'function',
    tool: name,
    name,
    args,
    function: { name, arguments: args }
  };
}
