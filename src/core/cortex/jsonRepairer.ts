/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptRegistry } from '../PromptRegistry';

export async function repairJsonFormatWithLLM(
  thinkSimpleFn: (prompt: string, jsonMode?: boolean) => Promise<string>,
  invalidRawText: string,
  userQuery: string
): Promise<any> {
  console.log("[JSON_REPAIRER] Initiating LLM-based format repair sequence...");
  const repairPrompt = PromptRegistry.getInstance().compile('cortex:repair_json', {
    invalidRawText: invalidRawText,
    userQuery: userQuery
  });

  try {
    let repairedRaw = await thinkSimpleFn(repairPrompt, true);
    repairedRaw = repairedRaw.trim();

    // Clean markdown code tags if any leaked from other providers
    repairedRaw = repairedRaw.replace(/```json/gi, '').replace(/```/gi, '').trim();

    // Bracket isolation
    const firstBrace = repairedRaw.indexOf('{');
    const lastBrace = repairedRaw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      repairedRaw = repairedRaw.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(repairedRaw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.properties && typeof parsed.properties === 'object' && !Array.isArray(parsed.properties)) {
        const p = parsed.properties;
        if (p.thought || p.tool_calls || p.tools_to_call || p.final_answer || p.speech || p.response) {
          console.log("[JSON_REPAIRER] Detected nested properties schema confusion, lifting properties values to root.");
          Object.assign(parsed, p);
        }
      }
      if (parsed.thought || parsed.tool_calls || parsed.tools_to_call || parsed.final_answer || parsed.tool || parsed.speech || parsed.args) {
        console.log("[JSON_REPAIRER] Format repair completed successfully. Rebuilt data parsed.");
        return parsed;
      }
    }
  } catch (e: any) {
    console.error("[JSON_REPAIRER_ERROR] Format repair failed:", e.message || e);
  }
  return null;
}
