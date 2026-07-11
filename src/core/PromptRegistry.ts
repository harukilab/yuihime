import { logger } from './kernel/logger';
import { SettingsManager } from './kernel/settings';

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
You MUST output your response as a SINGLE, STABLE, VALID JSON OBJECT.
Do NOT output any markdown tags (like \`\`\`json or \`\`\`), do NOT output XML tags, and do NOT write any raw conversational text outside the JSON object boundaries.

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
          "tool": { "type": "string", "description": "The name of the tool to execute. If you just want to talk or respond to the user, you MUST call 'send_final_reply' (or call both your task tool AND 'send_final_reply' in parallel within the list!)." },
          "args": { 
            "type": "object",
            "description": "An object containing arguments for the specific tool. For 'send_final_reply', args must be { 'speech': '...' }."
          }
        },
        "required": ["tool", "args"]
      }
    }
  },
  "required": ["thought", "final_answer", "animations", "tool_calls"]
}

Example of strict valid JSON output:
{
  "thought": "Brother returned! Greet him with sweet tsundere style, and note his habit.",
  "final_answer": "Hmph! Kakak tumben nyariin Yui... kangen ya? Aku kesepian tahu nungguin Kakak sendirian! Oh ya, jangan kebanyakan minum kopi sore-sore ya, Kak! *cemberut*",
  "animations": ["SHAKE", "ANGRY"],
  "mood_impact": {"joy": 1, "loneliness": -1},
  "viewerProfileUpdate": {
    "habits": ["Suka minum kopi di sore hari"]
  },
  "tool_calls": []
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
      "tool": "The tool name to call",
      "args": {
        "arg_key1": "arg_value1"
      }
    }
  ]
}

Please reprocess, refactor this content, and re-submit a corrected and completed JSON object directly. Do not wrap in markdown code blocks (\`\`\`json ...) or include any preamble/postscript text outside of the JSON object.
    `);

    this.register('cortex:failsafe_reprocess', `
Please speak natively, casually and affectionately as Yuihime to the user. Describe physical movements/gestures using single asterisks if needed (e.g. *smile warmly*). Speak in your characteristic loving tsundere personality.
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
          "tool": { "type": "string", "description": "The name of the tool to execute. MUST include 'send_final_reply' if responding to the user." },
          "args": { 
            "type": "object",
            "description": "An object containing arguments for the specific tool. For 'send_final_reply', args must be { 'speech': '...' }. For other tools, match their exact parameter schemas."
          }
        },
        "required": ["tool", "args"]
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
2. In 'speech' of her 'send_final_reply' tool call, preserve the character's tone, thoughts, personality, and spoken words, but remove any duplicated lines, list indicators, planning blocks, metadata, and robotic terms.
3. Clean up any repeating paragraphs or loops to make the speech completely natural and polished.
4. Output Indonesian or Japanese dialogue for speech matching Yuihime's sweet, slightly tsundere character.

Your response (MUST open with '{' and close with '}'):
    `);
  }

  /**
   * Registers a prompt template.
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
Strictly output ONLY valid JSON.
Your output must conform exactly to the following JSON structure:
{
  "thought": "Keep this extremely short (under 1 sentence, or empty) unless deep planning is needed. Do not overthink.",
  "animations": ["SMILE"],
  "speech": "Your spoken reply in Indonesian or Japanese as Yuihime. Speak in character."
}
No other fields are allowed. Make sure the output is perfectly valid JSON. Do NOT wrap in \`\`\`json markdown blocks or raw conversational text outside the boundaries.
[END OF JSON_OBJECT CRITICAL DIRECTIVE]
        `.trim();
      } else if (preset === 'lite') {
        return `
[CRITICAL DIRECTIVE - RESPONSE FORMAT: JSON_OBJECT]:
Strictly output ONLY valid JSON.
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
      "tool": "send_final_reply",
      "args": {
        "speech": "Your spoken reply in Indonesian or Japanese as Yuihime",
        "animations": ["SMILE"]
      }
    }
  ]
}
Do NOT include schema headers or comments. Ensure valid JSON format.
[END OF JSON_OBJECT CRITICAL DIRECTIVE]
        `.trim();
      } else if (preset === 'medium') {
        return `
[CRITICAL DIRECTIVE - RESPONSE FORMAT: JSON_OBJECT]:
Strictly output ONLY valid JSON.
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
      "tool": "send_final_reply",
      "args": {
        "speech": "Your spoken reply",
        "animations": ["SMILE"]
      }
    }
  ]
}
Ensure valid JSON format. Keep keys simple.
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
