/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptRegistry } from '../PromptRegistry';
import { extractBestJsonObject, extractJsonObject } from './jsonExtract';

export function stripCodeFences(raw: string): string {
  return raw.replace(/```json/gi, '').replace(/```/gi, '').trim();
}

export function isolateBraceBlock(raw: string): string {
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.substring(firstBrace, lastBrace + 1);
  }
  return raw;
}

export function hasNestedSchemaConfusion(obj: any): boolean {
  const p = obj?.properties;
  return !!(p && typeof p === 'object' && !Array.isArray(p) &&
    (p.thought || p.tool_calls || p.tools_to_call || p.final_answer || p.speech || p.response));
}

export function liftNestedProperties(obj: any): boolean {
  if (!hasNestedSchemaConfusion(obj)) return false;
  Object.assign(obj, obj.properties);
  return true;
}

export function syncAlternateKeys(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  if (obj.mood_impact && !obj.moodImpact) obj.moodImpact = obj.mood_impact;
  if (obj.moodImpact && !obj.mood_impact) obj.mood_impact = obj.moodImpact;
  if (obj.tools_to_call && !obj.tool_calls) obj.tool_calls = obj.tools_to_call;
  if (obj.tool_calls && !obj.tools_to_call) obj.tools_to_call = obj.tool_calls;
  if (obj.thoughts && !obj.thought) obj.thought = obj.thoughts;
  if (obj.thought && !obj.thoughts) obj.thoughts = obj.thought;
  if (obj.final_answer && !obj.speech) obj.speech = obj.final_answer;
  if (obj.speech && !obj.final_answer) obj.final_answer = obj.speech;
}

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
    repairedRaw = stripCodeFences(repairedRaw);

    const bestJson = extractBestJsonObject(repairedRaw);
    if (bestJson) {
      repairedRaw = bestJson;
    } else {
      repairedRaw = isolateBraceBlock(repairedRaw);
    }

    const _jMatch = extractJsonObject(repairedRaw);
    const parsed = _jMatch ? JSON.parse(_jMatch) : null;
    if (parsed && typeof parsed === 'object') {
      if (liftNestedProperties(parsed)) {
        console.log("[JSON_REPAIRER] Detected nested properties schema confusion, lifting properties values to root.");
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
