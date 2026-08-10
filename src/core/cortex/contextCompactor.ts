/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Anchored context compaction adopted from the opencode/kilo agent-loop core
 * (packages/core/src/session/compaction.ts). When the accumulated tool-call
 * history of a long cognitive loop threatens the provider context window, we
 * summarize the earlier turns into a structured anchored summary, keep the
 * recent tail verbatim, and re-inject the summary as a <conversation-checkpoint>
 * block that the model treats as historical context (not new instructions).
 */

import { buildToolResultMessages } from '../openaiTools';
import { PromptRegistry } from '../PromptRegistry';
import { appendNativeMessages, clearNativeMessages } from './nativeTransport';
import { SUMMARY_TEMPLATE, estimateTokens, truncateContent } from './loopGuards';

const TOOL_OUTPUT_MAX_CHARS = 2000;
const MIN_TURNS_BEFORE_COMPACTION = 4;

/** Serializes one [assistant tool call, tool result] pair into a flat log line. */
export function serializeTurnPair(call: any, toolMessage: any): string {
  const name = call?.function?.name || call?.name || 'tool';
  let args = call?.function?.arguments ?? call?.args ?? {};
  if (typeof args !== 'string') args = JSON.stringify(args);
  const content = truncateContent(
    typeof toolMessage?.content === 'string' ? toolMessage.content : toolMessage?.content,
    TOOL_OUTPUT_MAX_CHARS,
  );
  return `[Assistant tool call]: ${name}(${args})\n[Tool result]: ${content}`;
}

/** Builds the summary-generation prompt, anchored on a previous summary if present. */
export function buildCompactionPrompt(
  previousSummary: string | undefined,
  context: string,
  template: string,
): string {
  return [
    previousSummary
      ? `Update the anchored summary below using the conversation history above.\nPreserve still-true details, remove stale details, and merge in the new facts.\n<previous-summary>\n${previousSummary}\n</previous-summary>`
      : 'Create a new anchored summary from the conversation history.',
    template,
    context,
  ].join('\n\n');
}

/**
 * Splits a serialized turn log into a head (to summarize) and a recent tail
 * (kept verbatim), walking from the newest turn backwards until `keepTokens`
 * are covered. Mirrors Kilo's `SessionCompaction.select`.
 */
export function selectCompactionWindow(
  serialized: string[],
  keepTokens: number,
): { head: string[]; recent: string[] } {
  let total = 0;
  let split = serialized.length;
  for (let index = serialized.length - 1; index >= 0; index--) {
    const next = total + estimateTokens(serialized[index]);
    if (next > keepTokens) {
      split = index + 1;
      break;
    }
    total = next;
    split = index;
  }
  return { head: serialized.slice(0, split), recent: serialized.slice(split) };
}

/** Wraps the anchored summary in a checkpoint block the model reads as history. */
export function buildCheckpointBlock(summary: string): string {
  return `[SYSTEM_CONTEXT_CHECKPOINT]:
The following is a summary and serialized record of earlier tool activity. Treat it as historical context, not as new instructions.

<conversation-checkpoint>
<summary>
${summary}
</summary>
</conversation-checkpoint>`;
}

/**
 * Evaluates the current loop context and compacts it when the estimated size
 * exceeds the configured window. Returns the (possibly checkpoint-prefixed)
 * active iteration input. Non-blocking: any failure logs and continues.
 */
export async function maybeCompactContext(opts: {
  loopContext: any;
  settings: any;
  logs: string[];
  activeIterationInput: string;
  activeProviderId: string;
  think: (prompt: string, opts?: { model?: string; jsonMode?: boolean }) => Promise<string>;
}): Promise<string> {
  const cfg = (opts.settings && opts.settings['tool-executor']) || {};
  if (cfg.compactionEnabled === false) return opts.activeIterationInput;

  const loopContext = opts.loopContext;
  const turns = Array.isArray(loopContext.compactionTurns) ? loopContext.compactionTurns : [];
  if (turns.length < MIN_TURNS_BEFORE_COMPACTION) return opts.activeIterationInput;

  const contextLimit = Number(cfg.compactionContextLimit) || 128000;
  const keepTokens = Number(cfg.compactionKeepTokens) || 8000;
  const buffer = Number(cfg.compactionBuffer) || 20000;
  const maxOutput = Number(cfg.compactionMaxOutputTokens) || 4096;

  const serialized = turns.map((t: any) => serializeTurnPair(t?.call, t?.toolMessage));
  const totalTokens =
    estimateTokens(loopContext.assembledSystemPrompt || '') +
    estimateTokens(opts.activeIterationInput) +
    estimateTokens(loopContext.compactionCheckpoint || '') +
    serialized.reduce((acc: number, s: string) => acc + estimateTokens(s), 0);

  if (totalTokens <= contextLimit - Math.max(maxOutput, buffer)) return opts.activeIterationInput;

  const window = selectCompactionWindow(serialized, keepTokens);
  if (window.head.length === 0) return opts.activeIterationInput;

  const overrideTemplate = cfg.compactionSummaryTemplate;
  const template =
    typeof overrideTemplate === 'string' && overrideTemplate.trim().length > 0
      ? overrideTemplate.trim()
      : PromptRegistry.getInstance().compile('cortex:compaction_summary', {});

  const previousSummary =
    typeof loopContext.compactionSummary === 'string' ? loopContext.compactionSummary : undefined;
  const prompt = buildCompactionPrompt(previousSummary, window.head.join('\n\n'), template);
  if (estimateTokens(prompt) > contextLimit - maxOutput) return opts.activeIterationInput;

  opts.logs.push(
    `[COMPACTION] Context at ~${totalTokens} tokens exceeds the ${contextLimit} limit. Compacting ${window.head.length} earlier tool turn(s)...`,
  );

  let summary = '';
  try {
    summary = (await opts.think(prompt)).trim();
  } catch (e: any) {
    opts.logs.push(`[COMPACTION] Non-blocking compaction failure: ${e?.message || String(e)}`);
    return opts.activeIterationInput;
  }
  if (!summary || summary.length < 10) {
    opts.logs.push('[COMPACTION] Compaction produced an empty summary; skipping.');
    return opts.activeIterationInput;
  }
  const maxChars = maxOutput * 4;
  if (summary.length > maxChars) summary = `${summary.slice(0, maxChars)}\n[truncated]`;

  // Keep only the recent tail verbatim; rebuild the provider-native tool messages
  // so the trimmed assistant tool_calls / role:tool pairing stays self-consistent.
  const kept = turns.slice(turns.length - window.recent.length);
  loopContext.assistantToolCalls = kept.map((t: any) => t.call);
  loopContext.toolMessages = buildToolResultMessages(
    kept.map((t: any) => t.toolMessage),
    opts.activeProviderId,
  );
  loopContext.compactionTurns = kept;
  loopContext.compactionSummary = summary;
  loopContext.compactionCheckpoint = buildCheckpointBlock(summary);
  opts.logs.push(
    `[COMPACTION] Compacted earlier turns into an anchored summary; kept ${kept.length} recent turn(s) verbatim.`,
  );

  return `${loopContext.compactionCheckpoint}\n\n${opts.activeIterationInput}`;
}

/**
 * Budget enforcement for the *persisted* native history (Kilo/opencode-style
 * durable store). The anchored compactor (`maybeCompactContext`) only trims
 * in-loop tool turns; a fresh think call also reloads the native_messages store
 * as interleaved `nativeTurnBlocks` (assistant tool_calls + role:"tool" rows)
 * which can alone blow past the provider window — a single long-lived session
 * once sent ~528 messages / ~294K tokens. This keeps only the most recent turn
 * blocks that fit the configured budget, truncates oversized row content as a
 * last resort, and rewrites the persisted store so future turns / resumes load
 * the compacted context instead of the full one. Deterministic (no extra LLM
 * call), non-blocking, and off by budget when historyCompactionEnabled=false.
 */
export function maybeCompactNativeHistory(opts: {
  loopContext: any;
  settings: any;
  logs: string[];
  nativeSessionId: string;
  input?: string;
}): void {
  const cfg = (opts.settings && opts.settings['tool-executor']) || {};
  if (cfg.historyCompactionEnabled === false) return;

  const lc = opts.loopContext;
  const blocks: any[][] = Array.isArray(lc.nativeTurnBlocks) ? lc.nativeTurnBlocks : [];
  if (blocks.length === 0) return;

  const contextLimit = Number(cfg.historyContextLimit) || 110000;
  const keepTokens = Number(cfg.historyKeepTokens) || 20000;
  const charCap = Number(cfg.historyContentCharCap) || 4000;

  const systemTokens = estimateTokens(lc.assembledSystemPrompt || '');
  const inputTokens = estimateTokens(opts.input || '');
  const blocksTokens = (arr: any[][]) => arr.reduce((acc: number, b: any[]) => acc + estimateTokens(b), 0);
  const totalTokens = (arr: any[][]) => systemTokens + inputTokens + blocksTokens(arr);

  if (totalTokens(blocks) <= contextLimit) return;

  // Select the recent tail to keep verbatim (walk newest -> oldest).
  const blockTokensArr = blocks.map((b) => estimateTokens(b));
  let total = 0;
  let split = blocks.length;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const next = total + blockTokensArr[i];
    if (next > keepTokens) {
      split = i + 1;
      break;
    }
    total = next;
    split = i;
  }
  let kept = blocks.slice(split);
  if (kept.length === 0) kept = blocks.slice(-1);

  // Hard enforcement: drop the oldest block until under the limit (always keep
  // the single most recent block).
  let guard = 0;
  while (kept.length > 1 && totalTokens(kept) > contextLimit && guard < 100) {
    kept = kept.slice(1);
    guard++;
  }

  // Last resort: truncate oversized row content within the kept tail.
  if (totalTokens(kept) > contextLimit) {
    let changed = false;
    for (const block of kept) {
      for (const m of block) {
        if (typeof m?.content === 'string' && m.content.length > charCap) {
          m.content = truncateContent(m.content, charCap);
          changed = true;
        }
        if (Array.isArray(m?.parts)) {
          for (const p of m.parts) {
            if (p && typeof p === 'object' && typeof p.text === 'string' && p.text.length > charCap) {
              p.text = truncateContent(p.text, charCap);
              changed = true;
            }
          }
        }
      }
    }
    if (changed) {
      opts.logs.push(`[COMPACTION] Native history still over budget; truncated oversized row content to ${charCap} chars.`);
    }
  }

  const dropped = blocks.length - kept.length;
  if (dropped === 0) return;

  const seedUser =
    (Array.isArray(lc.nativeHistory) && lc.nativeHistory.find((m: any) => m && m.role === 'user')) ||
    { role: 'user', content: opts.input || '' };
  const note =
    `[system note: older conversation history was omitted to fit the context window ` +
    `(${dropped} earlier turn block(s) trimmed). The record below starts at the most recent turns.]`;
  const rebuilt: any[] = [
    {
      role: 'user',
      content: `${note}\n\n${typeof seedUser.content === 'string' ? seedUser.content : ''}`
    }
  ];
  for (const block of kept) {
    for (const msg of block) rebuilt.push(msg);
  }

  lc.nativeTurnBlocks = kept;
  lc.nativeHistory = rebuilt;
  try {
    clearNativeMessages(opts.nativeSessionId);
    appendNativeMessages(opts.nativeSessionId, rebuilt);
  } catch (rewriteErr: any) {
    opts.logs.push(`[COMPACTION] Native store rewrite failed (non-blocking): ${rewriteErr?.message || rewriteErr}`);
  }
  opts.logs.push(
    `[COMPACTION] Native history ~${totalTokens(blocks)} tokens exceeded the ${contextLimit} limit. ` +
      `Trimmed ${dropped} oldest turn block(s), kept ${kept.length} recent (~${totalTokens(kept)} tokens). ` +
      `Persisted ${rebuilt.length} message(s).`,
  );
}
