/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeToolCall } from './toolNormalizer';

/**
 * Puter Consciousness Integration Sync Wrapper
 * Intercepts messages from cortex.think and formats them into the specific JSON schema required
 * by the Puter AI Chat integration to restore Consciousness functionality.
 */
export function wrapForPuterConsciousness(thinkResult: any) {
  if (!thinkResult) return thinkResult;

  let finalSpeech = thinkResult.response || "";
  let toolCalls = thinkResult.tool_calls || thinkResult.actions || [];
  
  if (Array.isArray(toolCalls)) {
    toolCalls = toolCalls.map(normalizeToolCall).filter(Boolean).map((tc: any) => {
      if (tc.tool === 'send_final_reply' && finalSpeech) {
        return {
          ...tc,
          args: {
            ...tc.args,
            speech: finalSpeech
          }
        };
      }
      return tc;
    });
  } else {
    toolCalls = [];
  }

  // Fallback speech check if not immediately present
  if (!finalSpeech && toolCalls && toolCalls.length > 0) {
    const finalReplyCall = toolCalls.find((tc: any) => tc.tool === 'send_final_reply');
    if (finalReplyCall && finalReplyCall.args?.speech) {
      finalSpeech = finalReplyCall.args.speech;
    }
  }

  // Ensure that if we have a speech but no tool_calls with send_final_reply, we wrap it
  if (finalSpeech && (!toolCalls || toolCalls.length === 0 || !toolCalls.some((tc: any) => tc.tool === 'send_final_reply'))) {
    toolCalls = [
      ...toolCalls,
      {
        tool: "send_final_reply",
        args: {
          speech: finalSpeech
        }
      }
    ];
  }

  return {
    // Preserve original return properties for backward compatibility
    ...thinkResult,

    // Puter Schema compliance
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "CortexResponse",
    type: "object",
    thought: thinkResult.thought || "Yuihime memproses lintasan kesadaran batin.",
    animations: thinkResult.animations || ["SMILE"],
    mood_impact: thinkResult.moodImpact || thinkResult.nextMood || {},
    perceivedNameUpdate: thinkResult.perceivedNameUpdate || "",
    viewerProfileUpdate: thinkResult.viewerProfileUpdate || {},
    linkedAccountUpdate: thinkResult.linkedAccountUpdate || "",
    
    // Enforce merged/finalized values
    response: finalSpeech,
    tool_calls: toolCalls
  };
}
