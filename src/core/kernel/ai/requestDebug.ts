/**
 * Permanent, opt-in request-composition debug logger for provider drivers.
 *
 * Gated by config so it is OFF by default:
 *   [debug]
 *   requestLogging = true
 *
 * (or `[tool-executor] debugRequestLogging = true`). When enabled, each
 * outbound generation logs the estimated size breakdown (system / content /
 * tool rows / message count) so oversized contexts — e.g. a single huge
 * observation memory blowing past a provider's context window — can be
 * diagnosed without diffing network captures.
 *
 * Cost-safe: sizes are computed by walking the in-memory message array (no
 * full JSON.stringify of potentially multi-megabyte payloads), and everything
 * is wrapped in try/catch so a logging failure never breaks a generation.
 */

import { appendLog } from '../../fileLogger.js';
import path from 'path';
import os from 'os';
import { expandHomePath } from '../../systemPaths.js';

const DEBUG_DIR = path.join(expandHomePath(process.env.YUIHIME_SYSTEM_ROOT || path.join(os.homedir(), '.yuihime')), 'debug');

interface DebugRequestOpts {
  tag: string;
  model?: string;
  messages: any[];
  system?: string;
  tools?: any[];
}

function flagEnabled(context: any): boolean {
  try {
    if (context?.debugRequestLogging === true) return true;
    const cfg = context?.config || context || {};
    return cfg?.debug?.requestLogging === true || cfg?.['tool-executor']?.debugRequestLogging === true;
  } catch {
    return false;
  }
}

/** Cheap length of a message's content (string | array | object | Gemini parts). */
function contentLength(content: any): number {
  if (content == null) return 0;
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((acc: number, c: any) => acc + contentLength(c), 0);
  }
  if (typeof content === 'object') {
    try {
      if (Array.isArray(content.parts)) {
        return content.parts.reduce((acc: number, p: any) => acc + contentLength(p), 0);
      }
      if (typeof content.text === 'string') return content.text.length;
      return JSON.stringify(content).length;
    } catch {
      return 0;
    }
  }
  return String(content).length;
}

/** Log one request-composition summary when the debug flag is on. */
export function maybeLogRequestSizes(context: any, opts: DebugRequestOpts): void {
  try {
    if (!flagEnabled(context)) return;

    let contentChars = 0;
    let toolRowChars = 0;
    for (const m of opts.messages || []) {
      // Gemini contents carry `parts:[{text}]`; OpenAI carries `content`.
      contentChars += Array.isArray(m?.parts) ? contentLength(m.parts) : contentLength(m?.content);
      if (m?.tool_calls) {
        try {
          toolRowChars += JSON.stringify(m.tool_calls).length;
        } catch {}
      }
    }
    const systemChars = (opts.system || '').length;
    const toolSchemaChars = Array.isArray(opts.tools)
      ? (() => {
          try {
            return JSON.stringify(opts.tools).length;
          } catch {
            return 0;
          }
        })()
      : 0;
    const total = contentChars + systemChars + toolSchemaChars + toolRowChars;

    appendLog(
      'request',
      {
        tag: opts.tag,
        model: opts.model || '-',
        msgs: opts.messages?.length ?? 0,
        systemChars,
        contentChars,
        toolRowChars,
        toolSchemaChars,
        toolCount: opts.tools?.length ?? 0,
        estimatedTokens: Math.round(total / 4),
      },
      DEBUG_DIR,
    );
  } catch {
    /* never break generation on logging */
  }
}
