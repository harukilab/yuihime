import { logger } from "@/core/kernel/logger";
import { stripCodeFences, isolateBraceBlock } from "./cortex/jsonRepairer.js";

export class ValidationMiddleware {
  public static isEnabled = false; // Turn off validation by default

  /**
   * Validates if the raw model response conforms to the strict JSON_OBJECT schema required by Cortex.
   * If non-conformant, logs '[SCHEMA_ERROR]' to backgroundLogs (server console / logger) and returns false or logs it.
   */
  static validate(rawOutput: string): { success: boolean; data?: any; errors: string[] } {
    if (!this.isEnabled) {
      return { success: true, data: {}, errors: [] };
    }

    const errors: string[] = [];
    if (!rawOutput || !rawOutput.trim()) {
      const err = "Empty AI output received.";
      errors.push(err);
      this.logError(rawOutput, errors);
      return { success: false, errors };
    }

    // Attempt to clean markdown block delimiters if any
    let cleanStr = rawOutput.trim();
    if (cleanStr.includes("```")) {
      const matches = cleanStr.match(/```(?:json)?([\s\S]*?)```/);
      if (matches) {
        cleanStr = matches[1].trim();
      } else {
        cleanStr = stripCodeFences(cleanStr);
      }
    }

    // Gentle fallback validation for XML/HTML tags and template layout responses
    const hasXmlTags = /<(thought|think|thinking|reasoning|animations|mood_impact|moodImpact|tool_calls|tools_to_call|speech|final_answer|opening_response)>/i.test(rawOutput);
    if (hasXmlTags) {
      const hasThought = /<(thought|think|thinking|reasoning)>[\s\S]*?<\/\1>/i.test(rawOutput) || rawOutput.toLowerCase().includes('thought') || rawOutput.toLowerCase().includes('think');
      if (!hasThought) {
        errors.push("Missing core 'thought' or 'think' tracking markers in XML layout.");
        this.logError(rawOutput, errors);
        return { success: false, errors };
      }
      return { success: true, data: { format: 'xml' }, errors };
    }

    if (!cleanStr.startsWith("{")) {
      // If it doesn't even resemble JSON and has no XML tags, but contains dialogue, allow it 
      // under raw plain text mode to avoid polluting the log with SCHEMA_ERROR.
      if (cleanStr.length > 5 && !cleanStr.includes('"thought":') && !cleanStr.includes('"speech":') && !cleanStr.includes('"final_answer":')) {
        return { success: true, data: { format: 'raw_text' }, errors };
      }
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(cleanStr);
    } catch (e: any) {
      // Try bracket isolation fallback
      const isolated = isolateBraceBlock(cleanStr);
      if (isolated !== cleanStr) {
        try {
          parsed = JSON.parse(isolated);
        } catch (_) {
          errors.push(`JSON parsing failed: ${e.message}`);
        }
      } else {
        errors.push(`JSON parsing failed: ${e.message}`);
      }
    }

    if (errors.length > 0) {
      this.logError(rawOutput, errors);
      return { success: false, errors };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      errors.push("Response is not a valid JSON object.");
      this.logError(rawOutput, errors);
      return { success: false, errors };
    }

    // Required fields check
    if (typeof parsed.thought !== 'string' && typeof parsed.thoughts !== 'string') {
      errors.push("Missing or invalid 'thought' or 'thoughts' property (must be string).");
    }
    const hasFinalAnswer = typeof parsed.speech === 'string' || typeof parsed.final_answer === 'string';
    const hasToolCalls = Array.isArray(parsed.tool_calls) || Array.isArray(parsed.tools_to_call);
    if (!hasFinalAnswer && !hasToolCalls) {
      errors.push("Missing or invalid 'speech' or 'final_answer' string, or 'tool_calls' array (must provide at least one).");
    }
    if (parsed.animations !== undefined && !Array.isArray(parsed.animations)) {
      errors.push("Invalid 'animations' property (must be array).");
    }

    if (errors.length > 0) {
      this.logError(rawOutput, errors);
      return { success: false, errors };
    }

    return { success: true, data: parsed, errors };
  }

  private static logError(rawOutput: string, errors: string[]) {
    const errorPrefix = "[SCHEMA_ERROR]";
    const msgConsole = `${errorPrefix} Strict system JSON schema validation rejected the AI response. Errors: ${errors.join(" | ")}. Raw Output length: ${rawOutput.length} characters.`;
    const msgFull = `${errorPrefix} Strict system JSON schema validation rejected the AI response. Errors: ${errors.join(" | ")}. Raw Output: ${rawOutput}`;
    console.warn(msgConsole);
    logger.log("ERROR", "VALIDATION_MIDDLEWARE", msgFull);
  }
}
