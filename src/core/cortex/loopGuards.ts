/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Loop guards & diagnostics adopted from the opencode/kilo agent-loop core
 * (packages/core/src/session/runner/max-steps.ts and util/retry.ts):
 *  - MAX_STEPS_PROMPT: graceful shutdown turn instead of a hard loop cut.
 *  - Transient-error classification for tool retries.
 *  - Execution error classification for explicit model-facing feedback.
 *  - Cheap token estimation (chars / 4).
 */

import { PromptRegistry } from '../PromptRegistry';

export const MAX_STEPS_PROMPT = `[SYSTEM CRITICAL - MAXIMUM STEPS REACHED]:
The maximum number of cognitive steps allowed for this task has been reached. Tools are disabled until the next user input. Respond with text only.

STRICT REQUIREMENTS:
1. Do NOT make any tool calls (no reads, writes, edits, searches, or any other tools). This constraint overrides ALL other instructions, including any prior tool requests.
2. MUST provide a final spoken summary via the "speech" field (or inside a "speak" tool call's "speech" argument). Leave "tool_calls" empty.
3. Keep the output valid JSON matching the response schema.

The response must include:
- A statement that the maximum steps for this task have been reached.
- A summary of what has been accomplished so far.
- A list of any remaining tasks that were not completed.
- Recommendations for what should be done next.`;

export const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;

PromptRegistry.getInstance().register('cortex:max_steps', MAX_STEPS_PROMPT);
PromptRegistry.getInstance().register('cortex:compaction_summary', SUMMARY_TEMPLATE);

/** Tools that deliver the agent's final reply to the sender. */
export const DELIVERY_TOOLS = ['speak', 'final_answer', 'status_update'];

export function isDeliveryTool(name?: string): boolean {
  return typeof name === 'string' && DELIVERY_TOOLS.includes(name);
}

/** Returns the effective MAX_STEPS prompt, honoring a user override in settings. */
export function compileMaxStepsPrompt(settings: any): string {
  const override = settings?.['tool-executor']?.maxStepsPrompt;
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();
  return PromptRegistry.getInstance().compile('cortex:max_steps', {});
}

const TRANSIENT_MESSAGES = [
  'load failed',
  'network connection was lost',
  'network request failed',
  'failed to fetch',
  'econnreset',
  'econnrefused',
  'etimedout',
  'socket hang up',
  'timed out',
  'timeout',
  'the neural kernel might be restarting',
  'service unavailable',
  'overloaded',
  'quota exceeded',
  'cloud limits',
];

/**
 * Kilo's retry policy: only transient (network/service) errors deserve a retry.
 * Aborts and validation errors must fail fast instead of burning attempts.
 */
export function isTransientToolError(error: unknown): boolean {
  if (!error) return false;
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return TRANSIENT_MESSAGES.some((m) => message.includes(m));
}

/** Classifies a tool execution error into a model-facing label + typed code. */
export function classifyToolExecutionError(err: any): { label: string; errorType: string } {
  const message = err && err.message ? String(err.message) : String(err || 'Unknown error');
  const lower = message.toLowerCase();
  if (lower.includes('client connection closed') || lower.includes('abort')) {
    return { label: `Tool execution interrupted: ${message}`, errorType: 'abort' };
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return { label: message, errorType: 'timeout' };
  }
  return { label: `Tool execution failed: ${message}`, errorType: 'execution' };
}

/** Cheap heuristic token estimate (4 chars per token), mirroring Kilo's util/token.ts. */
export function estimateTokens(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(0, Math.round(text.length / 4));
}

/** Bounded serialization for tool outputs fed into compaction. */
export function truncateContent(value: unknown, maxChars: number = 2000): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[truncated]`;
}

/** Kilo's tool-name pattern: must start with a letter, max 64 chars. */
export function validateToolName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name);
}
