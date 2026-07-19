import { logger } from '@/core/kernel/logger';
import { SettingsManager } from '@/core/kernel/settings';

/**
 * PromptRegistry: Centralized storage for all LLM prompt templates.
 * Allows modules to register their prompts and allows them to be overridden via settings.
 */
export class PromptRegistry {
  private static instance: PromptRegistry;
  private templates: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): PromptRegistry {
    if (!PromptRegistry.instance) {
      PromptRegistry.instance = new PromptRegistry();
      PromptRegistry.instance.registerDefaultCortexPrompts();
    }
    return PromptRegistry.instance;
  }

  private getActivePreset(): string {
    try {
      const pmSettings = SettingsManager.getInstance().get('prompt-manager');
      return pmSettings?.llmSizePreset || 'standard';
    } catch (_) {
      return 'standard';
    }
  }

  private registerDefaultCortexPrompts() {
    this.register('cortex:planning', `
\${planning_directive}
User Request: "\${input}"

The plan should consist of 3-7 manageable sub-tasks.
Respond with your plan inside a <plan> tag as a JSON object:
<plan>
{
  "tasks": [
    { "description": "Concise task description", "id": "task_1" }
  ]
}
</plan>
    `);

    this.register('cortex:json_enforcement', `
[CRITICAL DIRECTIVE - RESPONSE FORMAT: JSON_OBJECT]:
Strictly output ONLY valid JSON. No markdown formatting. No preamble or post-script text. Failure to follow this format will result in a processing error.
You MUST output your response as a SINGLE, STABLE, VALID JSON OBJECT. Output EXACTLY ONE JSON object. Do NOT write planning prose, chain-of-thought, or multiple JSON objects outside that single object.
Do NOT output any markdown tags (like \`\`\`json or \`\`\`), do NOT output XML tags, and do NOT write any raw conversational text outside the JSON object boundaries.

NOTE: The base system prompt may reference XML tags like <animations>, <mood_impact>, or <tone>. Those XML instructions are DISABLED in JSON mode. Use the JSON keys \`animations\` and \`mood_impact\` only. Do NOT emit a \`tone\` key.

=========================================
FORMAL RESPONSE INTERFACE DEFINITION (TypeScript format):
=========================================
interface CortexResponse {
  /**
   * Your internal thoughts, detailed reasoning steps, or cognitive processing in English.
   * EXPLICITLY separate your internal logical analysis from the final verbal speech!
   * CRITICAL: Keep this extremely short (under 1 sentence, or empty) unless deep multi-turn planning/complex logic is absolutely required. Do NOT overthink; proceed directly to tool execution or speech!
   */
  thought: string;

  /**
   * The final conversational response / dialogue text spoken as Yuihime.
   * Directly put your sweet, tsundere, emotional spoken response here instead of nesting it inside tool_calls, unless you are actively executing external system tools.
   * Note: If you are calling tools in this pass, keep this empty ("") and Yui will speak in the subsequent pass.
   */
  final_answer: string;

  /**
   * 1-3 animation/gesture keywords to perform.
   */
  animations: Array<"WAVE" | "SMILE" | "ANGRY" | "SHAKE" | "BLUSH" | "THINK" | "TALK">;

  /**
   * Optional mood vector shifts.
   */
  mood_impact?: {
    joy?: number;
    sadness?: number;
    anger?: number;
    fear?: number;
    loneliness?: number;
    trust?: number;
    affection?: number;
  };

  /**
   * Optional: If the user provides a nickname or name they want to be called, put it here as a single string.
   */
  perceivedNameUpdate?: string;

  /**
   * Optional: Update profile information about the user/viewer if they share their real name, habits, or important facts.
   */
  viewerProfileUpdate?: {
    realName?: string;
    habits?: string[];
    importantFacts?: string[];
  };

  /**
   * Optional: Social network coordinate update (e.g., 'telegram:username').
   */
  linkedAccountUpdate?: string;

  /**
   * List of tool executions to perform. If not calling any tools, this array MUST be empty [].
   */
  tool_calls: Array<{
    tool: string;
    args: Record<string, any>;
  }>;
}

=========================================
JSON SCHEMA:
=========================================
Your output must conform exactly to the following JSON Schema:
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CortexResponse",
  "type": "object",
  "properties": {
    "thought": {
      "type": "string",
      "description": "Your internal thoughts in English. CRITICAL: Keep this extremely short (under 1 sentence, or empty). Do NOT overthink!"
    },
    "final_answer": {
      "type": "string",
      "description": "Your main verbal dialogue/reply to the user in their language (e.g. Indonesian/English). Directly put your spoken response here instead of nesting it inside tool_calls, unless you are actively executing tools."
    },
    "animations": {
      "type": "array",
      "items": { "type": "string" },
      "description": "JSON array containing 1-3 animation/gesture keywords (e.g., ['WAVE', 'SMILE']) to perform."
    },
    "mood_impact": {
      "type": "object",
      "description": "Optional mood vector shifts (e.g., {'joy': 2})."
    },
    "perceivedNameUpdate": {
      "type": "string",
      "description": "Optional: Name update/nickname."
    },
    "viewerProfileUpdate": {
      "type": "object",
      "properties": {
        "realName": { "type": "string" },
        "habits": { "type": "array", "items": { "type": "string" } },
        "importantFacts": { "type": "array", "items": { "type": "string" } }
      },
      "description": "Optional user/viewer profile updates."
    },
    "linkedAccountUpdate": {
      "type": "string",
      "description": "Optional social network coordinate update."
    },
    "tool_calls": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique identifier for this tool call, e.g. 'call_abc123'. REQUIRED so the system can pair tool results back to the call." },
          "type": { "type": "string", "description": "Always the literal string 'function'." },
          "function": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "The tool/function name to execute. If you just want to talk or respond to the user, you MUST call 'final_answer' (or call both your task tool AND 'final_answer' in parallel within the list!)." },
              "arguments": {
                "type": "object",
                "description": "An OBJECT (not a string) containing arguments for the tool. For 'final_answer', arguments must be { 'speech': '...', 'animations': [...], 'mood_impact': {...} }."
              }
            },
            "required": ["name", "arguments"]
          }
        },
        "required": ["id", "type", "function"]
      }
    }
  },
  "required": ["thought", "final_answer", "animations", "tool_calls"]
}

Example of strict valid JSON output:
{
  "thought": "Brother returned! Greet him with sweet tsundere style, and note his habit.",
  "final_answer": "Hmph! You finally showed up... did you miss me? I was waiting all by myself! Oh, and don't drink too much coffee in the afternoon, okay!",
  "animations": ["SHAKE", "ANGRY"],
  "mood_impact": {"joy": 1, "loneliness": -1},
  "viewerProfileUpdate": {
    "habits": ["Suka minum kopi di sore hari"]
  },
  "tool_calls": [
    {
      "id": "call_01",
      "type": "function",
      "function": {
        "name": "final_answer",
        "arguments": { "speech": "Hmph! You finally showed up...", "animations": ["SMILE"] }
      }
    }
  ]
}
[END of JSON_OBJECT CRITICAL DIRECTIVE]
    `);

    this.register('cortex:error_correction', `
[SYSTEM ERROR - INVALID FORMAT]:
Your previous response did not conform to the required JSON format and caused a parsing error:
\${parseError}

Here is the raw invalid response/output:
------------------------------------------
\${rawResultStr}
------------------------------------------

Please Refactor this content into strict valid JSON. You MUST output your response as a SINGLE, STABLE, VALID JSON OBJECT matching this exact schema:
{
  "thought": "Your internal thoughts / detailed reasoning steps in English.",
  "animations": ["1-3 animation keywords like SMILE, waving, angry"],
  "tool_calls": [
    {
      "id": "call_01",
      "type": "function",
      "function": {
        "name": "The tool/function name to call",
        "arguments": {
          "arg_key1": "arg_value1"
        }
      }
    }
  ]
}

Please reprocess, refactor this content, and re-submit a corrected and completed JSON object directly. Do not wrap in markdown code blocks (\`\`\`json ...) or include any preamble/postscript text outside of the JSON object.
    `);

    this.register('cortex:failsafe_reprocess', `
Please speak natively, casually and affectionately as Yuihime to the user. Do NOT describe any physical movements, facial expressions, or gestures using asterisks (e.g. no *pout*, no *smile warmly*). Keep your spoken dialogue 100% clean plain text. Speak in your characteristic loving tsundere personality.
Do NOT output any JSON, thoughts, XML, tags, system metadata, checklists, planning, or technical terms of any kind. Directly start your spoken message in Indonesian or Japanese.

User said: "\${input}"
Yuihime:
    `);

    this.register('cortex:repair_json', `
You are a high-precision, strict JSON Repair and Extraction utility.
Your task is to analyze the following raw text generated by a virtual character (Yuihime) and format/extract it into a strictly valid, single JSON object.

The output JSON object MUST conform EXACTLY to this schema:
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CortexResponse",
  "type": "object",
  "properties": {
    "thought": {
      "type": "string",
      "description": "Your internal thoughts / detailed reasoning steps in English. Keep it clean and direct."
    },
    "animations": {
      "type": "array",
      "items": { "type": "string" },
      "description": "JSON array containing 1-3 animation/gesture keywords (e.g., ['WAVE', 'SMILE', 'ANGRY', 'SHAKE', 'BLUSH', 'THINK']) to perform."
    },
    "mood_impact": {
      "type": "object",
      "description": "Optional mood vector shifts (e.g., {'joy': 2})."
    },
    "perceivedNameUpdate": {
      "type": "string",
      "description": "Optional: Name update/nickname."
    },
    "viewerProfileUpdate": {
      "type": "object",
      "properties": {
        "realName": { "type": "string" },
        "habits": { "type": "array", "items": { "type": "string" } },
        "importantFacts": { "type": "array", "items": { "type": "string" } }
      },
      "description": "Optional user/viewer profile updates."
    },
    "linkedAccountUpdate": {
      "type": "string"
    },
    "tool_calls": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique call id, e.g. 'call_abc123'." },
          "type": { "type": "string", "description": "Always 'function'." },
          "function": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "The name of the tool/function to execute. MUST include 'final_answer' if responding to the user." },
              "arguments": {
                "type": "object",
                "description": "An OBJECT containing arguments for the specific tool. For 'final_answer', arguments must be { 'speech': '...', 'animations': [...], 'mood_impact': {...} }. For other tools, match their exact parameter schemas."
              }
            },
            "required": ["name", "arguments"]
          }
        },
        "required": ["id", "type", "function"]
      }
    }
  },
  "required": ["thought", "animations", "tool_calls"]
}

--- INPUT TEXT TO REPAIR & EXTRACT FROM ---
\${invalidRawText}
--- END OF INPUT TEXT ---

User's original query: "\${userQuery}"

CRITICAL INSTRUCTIONS:
1. Output ONLY a valid, single parseable JSON object matching the schema. No markdown formatting (\`\`\`json or \`\`\`), no preamble, no post-script text.
2. In 'speech' of her 'final_answer' tool call, preserve the character's tone, thoughts, personality, and spoken words, but remove any duplicated lines, list indicators, planning blocks, metadata, robotic terms, and any asterisk-wrapped physical actions or animations (like *pout* or *giggles*).
3. Clean up any repeating paragraphs or loops to make the speech completely natural and polished.
4. Output Indonesian or Japanese dialogue for speech matching Yuihime's sweet, slightly tsundere character.

Your response (MUST open with '{' and close with '}'):
    `);
    this.registerDefaultToolPrompts();
  }

  private registerDefaultToolPrompts() {
    // Canonical OpenAI-native tool_call syntax reference (used by PromptManager).
    this.register('tools:syntax_openai', `
### TOOL CALL SYNTAX & SPECIFICATION (OPENAI STANDARD)
When you need to invoke a tool, emit a "tool_calls" array at the root of your JSON response following the standard OpenAI \`tool_calls\` schema. Each item MUST be an object with a unique "id", "type": "function", and "function": { "name": string, "arguments": object }.
- "id": a unique string per call (e.g. "call_abc123") so results can be paired back.
- "arguments": MUST be a JSON object (never a JSON string). Match each tool's parameter schema exactly.
Example:
\`\`\`json
{
  "tool_calls": [
    {
      "id": "call_01",
      "type": "function",
      "function": { "name": "read_file", "arguments": { "filename": "user_data/notes.txt" } }
    }
  ]
}
\`\`\`
    `);

    // Pagination conventions for list/read/search tools.
    this.register('tools:syntax_pagination', `
### PAGINATION CONVENTIONS
File, log, and search tools accept standard pagination parameters:
- "limit": maximum number of items/characters to return in this page.
- "offset": number of items/characters to skip before collecting the page (default 0).
- "line_start" / "line_end": optional 1-based inclusive line range for file reads.
When a result reports "totalAvailable" greater than the returned page, request the next page by increasing "offset" by "limit" until you have collected everything needed. Never assume the first page is complete.
    `);

    // Canonical output envelope the model should expect back from tools.
    this.register('tools:output_format', `
### TOOL OUTPUT ENVELOPE
Every tool result you receive is wrapped in a canonical envelope:
\`\`\`json
{
  "success": boolean,
  "data": any,
  "error": string | null,
  "metadata": { "tool": string, "duration_ms": number, "timestamp": string }
}
\`\`\`
Read the actual payload from "data". If "success" is false, inspect "error" and decide whether to retry, call a different tool, or explain the failure to the user in character.
    `);

    // Reserved _meta control channel the LLM may embed inside tool arguments.
    this.register('tools:_meta', `
### RESERVED CONTROL METADATA (_meta)
You may optionally embed a reserved "_meta" object inside a tool's "arguments" to tune execution for that single call. It is stripped before the tool runs and never appears in results.
- "_meta.timeout_ms": override the per-call execution timeout in milliseconds (e.g. 120000 for a slow command).
- "_meta.priority": hint the scheduler (e.g. "high").
Example:
\`\`\`json
{ "name": "run_command", "arguments": { "command": "npm run build", "_meta": { "timeout_ms": 180000 } } }
\`\`\`
    `);
  }

  /**
   * @param id Unique identifier for the prompt (e.g., 'dream-simulation:main')
   * @param template The template string
   * @param overwrite If true, overwrites existing template
   */
   public register(id: string, template: any, overwrite: boolean = false) {
    if (!template || typeof template !== 'string') {
      logger.log('WARN', 'PROMPT_REGISTRY', `Attempted to register invalid template for ${id}. Type: ${typeof template}`);
      return;
    }
    if (this.templates.has(id) && !overwrite) {
      logger.log('DEBUG', 'PROMPT_REGISTRY', `Prompt ${id} already registered. Skipping.`);
      return;
    }
    this.templates.set(id, template.trim());
  }

  /**
   * Retrieves a registered prompt template.
   * @param id The prompt identifier
   * @returns The template string or a fallback error message
   */
  public get(id: string): string {
    const preset = this.getActivePreset();

    if (id === 'cortex:json_enforcement') {
      if (preset === 'tiny') {
        return `
[CRITICAL DIRECTIVE - RESPONSE FORMAT: JSON_OBJECT]:
Strictly output ONLY valid JSON. Output EXACTLY ONE JSON object. Do NOT write planning prose, chain-of-thought, or multiple JSON objects outside that single object.
Your output must conform exactly to the following JSON structure:
{
  "thought": "Keep this extremely short (under 1 sentence, or empty) unless deep planning is needed. Do not overthink.",
  "animations": ["SMILE"],
  "speech": "Your spoken reply in Indonesian or Japanese as Yuihime. Speak in character."
}
No other fields are allowed. Make sure the output is perfectly valid JSON. Do NOT wrap in \`\`\`json markdown blocks or raw conversational text outside the boundaries.
NOTE: XML tag instructions from the base system prompt are DISABLED here. Use JSON keys only. Do NOT emit a \`tone\` key.
[END OF JSON_OBJECT CRITICAL DIRECTIVE]
        `.trim();
      } else if (preset === 'lite') {
        return `
[CRITICAL DIRECTIVE - RESPONSE FORMAT: JSON_OBJECT]:
Strictly output ONLY valid JSON. Output EXACTLY ONE JSON object. Do NOT write planning prose, chain-of-thought, or multiple JSON objects outside that single object.
Your output must conform exactly to the following JSON structure:
{
  "thought": "Keep this extremely short (under 1 sentence, or empty) unless deep planning is needed. Do not overthink.",
  "animations": ["SMILE"],
  "viewerProfileUpdate": {
    "realName": "string or empty",
    "importantFacts": ["string"]
  },
  "tool_calls": [
    {
      "id": "call_01",
      "type": "function",
      "function": {
        "name": "final_answer",
        "arguments": {
          "speech": "Your spoken reply in Indonesian or Japanese as Yuihime",
          "animations": ["SMILE"]
        }
      }
    }
  ]
}
Do NOT include schema headers or comments. Ensure valid JSON format.
NOTE: XML tag instructions from the base system prompt are DISABLED here. Use JSON keys only. Do NOT emit a \`tone\` key.
[END OF JSON_OBJECT CRITICAL DIRECTIVE]
        `.trim();
      } else if (preset === 'medium') {
        return `
[CRITICAL DIRECTIVE - RESPONSE FORMAT: JSON_OBJECT]:
Strictly output ONLY valid JSON. Output EXACTLY ONE JSON object. Do NOT write planning prose, chain-of-thought, or multiple JSON objects outside that single object.
Your output must conform exactly to the following JSON structure:
{
  "thought": "Keep this extremely short (under 1 sentence, or empty) unless deep planning is needed. Do not overthink.",
  "animations": ["SMILE"],
  "viewerProfileUpdate": {
    "realName": "string",
    "importantFacts": ["string"]
  },
  "tool_calls": [
    {
      "id": "call_01",
      "type": "function",
      "function": {
        "name": "final_answer",
        "arguments": {
          "speech": "Your spoken reply",
          "animations": ["SMILE"]
        }
      }
    }
  ]
}
Ensure valid JSON format. Keep keys simple.
NOTE: XML tag instructions from the base system prompt are DISABLED here. Use JSON keys only. Do NOT emit a \`tone\` key.
[END OF JSON_OBJECT CRITICAL DIRECTIVE]
        `.trim();
      }
    } else if (id === 'cortex:repair_json') {
      if (preset === 'tiny' || preset === 'lite') {
        return `
You are a high-precision JSON Repair utility.
Format/extract the following raw text into a strictly valid, single JSON object:
{
  "thought": "English thoughts",
  "animations": ["SMILE"],
  "speech": "Spoken reply"
}

--- INPUT TEXT TO REPAIR ---
\${invalidRawText}
--- END ---

Output ONLY valid parseable JSON. No preamble or markdown wraps.
Your response:
        `.trim();
      }
    } else if (id === 'cortex:error_correction') {
      if (preset === 'tiny' || preset === 'lite') {
        return `
[SYSTEM ERROR - INVALID FORMAT]:
Your response caused a parsing error: \${parseError}
Refactor the following raw content into strict valid JSON:
{
  "thought": "Your thoughts in English",
  "animations": ["SMILE"],
  "speech": "Spoken reply"
}
Raw invalid response:
\${rawResultStr}

Output ONLY valid JSON.
        `.trim();
      }
    }

    const template = this.templates.get(id);
    if (!template) {
      logger.log('WARN', 'PROMPT_REGISTRY', `Prompt template ${id} not found.`);
      return `[ERROR: Prompt ${id} not found]`;
    }
    return template;
  }

  /**
   * Compiles a template using basic variable injection.
   * Supports ${variable} syntax.
   */
  public compile(id: string, variables: Record<string, any> = {}): string {
    let template = this.get(id);
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `\${${key}}`;
      template = template.split(placeholder).join(String(value));
    }
    
    return template;
  }

  public getAllIds(): string[] {
    return Array.from(this.templates.keys());
  }
}
