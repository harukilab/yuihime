import { extractJsonObject } from './jsonExtract.js';
import { isolateBraceBlock } from './jsonRepairer.js';
import { validateToolName } from './loopGuards.js';
import { SystemRegistry } from '@shared/core/registry';
import { ModuleType } from '@shared/include/types';
import os from "os";
import path from "path";
import fs from "fs";

/**
 * Dynamic Tool Synthesizer:
 * Yuihime AGI innovation that detects unregistered tool calling (Tool Not Found),
 * then intelligently searches for alternative ways or synthesizes (writes) a new tool
 * module code autonomously in the background, saving it to a physical file in .yuihime/addons/ for persistence,
 * and registers it instantly in system memory so it can be executed right away.
 */
export class DynamicToolSynthesizer {
  private static activeSynthesis = new Set<string>();

  /**
   * Evaluates a CommonJS main.cjs code from the LLM into an in-memory executable module object.
   */
  private static evaluateToolCode(codeString: string): any {
    try {
      const cleanCode = `
        const module = { exports: {} };
        const exports = module.exports;
        
        ${codeString}
        
        return module.exports;
      `;
      // Build a function wrapper to evaluate the CommonJS code
      const evaluator = new Function('process', 'require', cleanCode);
      return evaluator(process, typeof require !== 'undefined' ? require : undefined);
    } catch (evalErr: any) {
      console.error('[DYNAMIC_SYNTHESIS] Failed to evaluate inner module code:', evalErr.message);
      throw evalErr;
    }
  }

  /**
   * Persists the files into the physical .yuihime/addons/ directory when running on the server side.
   */
  private static async persistToDisk(toolId: string, configToml: string, mainCjs: string) {
    if (typeof window !== 'undefined') return;

    try {
      const addonsDir = process.env.YUIHIME_ADDONS_PATH || path.join(os.homedir(), ".yuihime", "addons");
      const addonDir = path.join(addonsDir, toolId);
      
      if (!fs.existsSync(addonDir)) {
        fs.mkdirSync(addonDir, { recursive: true });
      }

      // Write the config.toml file
      const configPath = path.join(addonDir, 'config.toml');
      fs.writeFileSync(configPath, configToml, 'utf8');

      // Write the main.cjs file
      const mainPath = path.join(addonDir, 'main.cjs');
      fs.writeFileSync(mainPath, mainCjs, 'utf8');

      console.log(`[DYNAMIC_SYNTHESIS] Successfully wrote new physical files for '${toolId}' to: ${addonDir}`);
    } catch (writeErr: any) {
      console.warn('[DYNAMIC_SYNTHESIS] Non-blocking warning: Failed to write new module to disk:', writeErr.message);
    }
  }

  /**
   * Performs analysis, searches for alternative solutions, or synthesizes new tools automatically.
   */
  public static async synthesizeAndRegister(
    toolId: string,
    currentInput: string,
    cortexInstance: any
  ): Promise<any> {
    if (this.activeSynthesis.has(toolId)) {
      console.log(`[DYNAMIC_SYNTHESIS] Module '${toolId}' is being synthesized, waiting for completion...`);
      return null;
    }

    // Registry hygiene (Kilo tool-name pattern): never persist or register a
    // tool whose id does not satisfy the OpenAI-compatible name grammar.
    if (!validateToolName(toolId)) {
      console.warn(`[DYNAMIC_SYNTHESIS] Tool name '${toolId}' does not match the allowed pattern /^[A-Za-z][A-Za-z0-9_-]{0,63}$/. Skipping synthesis.`);
      this.activeSynthesis.delete(toolId);
      return null;
    }

    this.activeSynthesis.add(toolId);
    console.log(`[DYNAMIC_SYNTHESIS] Starting autonomous cognitive creation process for inner function '${toolId}'...`);

    try {
      // 1. LOOK FIRST: Check whether an alias match or existing tool can be used
      const lowerId = toolId.toLowerCase();
      const existingTools = SystemRegistry.getTools();
      
      // If there is a very strong name similarity, try to link it (fuzzy matching)
      const matches = existingTools.filter(t => 
        t.metadata.id.toLowerCase().includes(lowerId) || 
        lowerId.includes(t.metadata.id.toLowerCase())
      );
      if (matches.length > 0) {
        const bestMatch = matches[0];
        console.log(`[DYNAMIC_SYNTHESIS] Found inner tool similarity '${bestMatch.metadata.id}' for '${toolId}'.`);
        this.activeSynthesis.delete(toolId);
        return bestMatch;
      }

      // 2. BUILD SELF-CONTAINED TOOLS IN BACKGROUND: Synthesize code via LLM
      const prompt = `[AGI_AUTONOMOUS_TOOL_SYNTHESIZER]
Yuihime's thinking circuit detected a request for the inner function '${toolId}' that is not yet registered in the registry, yet is badly needed by the user.
Current user chat context scenario: "${currentInput}"

User/AI task: Design a new Yuihime addon that is self-contained, safe, and reliable to fulfill that need.

Return the response in pure JSON format with the following schema:
{
  "name": "A sweet and descriptive inner function name",
  "description": "A short description of this inner function",
  "parameters": {
    "type": "object",
    "properties": {
       // Define logical input parameters that fit the needs of ${toolId}
    },
    "required": []
  },
  "config_toml": "Write the full contents of the config.toml file for this addon. The config.toml format must have the following structure:
id = \\"${toolId}\\"
name = \\"Sweet name\\"
description = \\"Short description\\"
version = \\"1.0.0\\"
runtime = \\"node\\"
entry_point = \\"main.cjs\\"

[tool]
name = \\"${toolId}\\"
description = \\"Short description\\"
parameters = { type = \\"object\\", properties = { ... }, required = [ ... ] }",

  "main_cjs": "Write the complete contents of the main.cjs file as a CommonJS program. It must parse process.argv[2] if invoked directly (require.main === module), and export an async function 'execute(args, context)'. Example structure:

const args = typeof process !== 'undefined' && process.argv[2] ? JSON.parse(process.argv[2]) : {};

async function execute(args, context) {
  // Use dynamic import if you need external/built-in libraries such as fs, path, child_process:
  // const fs = await import('fs');
  // Your inner program logic here...
  return { success: true, result: \\"Execution result...\\" };
}

if (typeof require !== 'undefined' && require.main === module) {
  execute(args, {})
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => console.log(JSON.stringify({ success: false, error: e.message })));
}

if (typeof module !== 'undefined') {
  module.exports = { execute };
}"
}

Return ONLY that JSON object. Make sure the JSON is valid and main_cjs is free of syntax errors.`;

      console.log(`[DYNAMIC_SYNTHESIS] Sending inner reasoning prompt to AI Provider to design the code...`);
      const rawResponse = await cortexInstance.thinkSimple(prompt, true);

      const parsedResponse = this.extractSynthesisJson(rawResponse);
      if (!parsedResponse) {
        console.warn(`[DYNAMIC_SYNTHESIS] Failed to parse JSON from LLM response for '${toolId}'. Using fallback template.`);
      }

      const name = parsedResponse?.name || toolId;
      const description = parsedResponse?.description || `Auto-synthesized tool: ${toolId}`;
      const parameters = parsedResponse?.parameters || { type: 'object', properties: {} };
      const config_toml = parsedResponse?.config_toml || this.buildConfigToml(toolId, name, description, parameters);
      const main_cjs = parsedResponse?.main_cjs || this.buildMainCjs(toolId, description);

      if (!main_cjs || !config_toml) {
        console.error(`[DYNAMIC_SYNTHESIS_ERROR] Synthesis result does not contain valid 'main_cjs' or 'config_toml' code for '${toolId}'.`);
        this.activeSynthesis.delete(toolId);
        return null;
      }

      const metadata = {
        id: toolId,
        name,
        type: ModuleType.TOOL,
        description,
        parameters
      };

      console.log(`[DYNAMIC_SYNTHESIS] New code designed successfully. Evaluating module '${toolId}' into memory...`);
      
      // Evaluate and run in-memory compilation
      const evaluated = this.evaluateToolCode(main_cjs);
      
      const newToolModule = {
        metadata: {
          ...metadata,
          ...evaluated.metadata,
          id: toolId // Force consistent ID
        },
        execute: evaluated.execute || (async (args: any) => {
          console.warn(`[DYNAMIC_SYNTHESIS] execute function not exported properly for '${toolId}', executing fallback.`);
          return { success: false, error: "execute function is not defined." };
        })
      };

      // Register instantly into SystemRegistry memory
      SystemRegistry.register(newToolModule);
      console.log(`[DYNAMIC_SYNTHESIS] New module '${toolId}' successfully registered instantly in memory!`);

      // Persist into physical files in .yuihime/addons so it stays saved
      await this.persistToDisk(toolId, config_toml, main_cjs);

      this.activeSynthesis.delete(toolId);
      return newToolModule;
    } catch (err: any) {
      console.error(`[DYNAMIC_SYNTHESIS_ERROR] Failed to synthesize tool '${toolId}':`, err.message);
      this.activeSynthesis.delete(toolId);
      return null;
    }
  }

  /**
   * Extracts a JSON object from an LLM response that may contain explanatory text
   * or be wrapped in a markdown code block (```json ... ```).
   */
  private static extractSynthesisJson(raw: string): any | null {
    if (!raw) return null;
    const text = raw.trim();

    const tryParse = (s: string): any | null => {
      try {
        const match = extractJsonObject(s);
        const target = match ? match : s;
        return JSON.parse(target);
      } catch {
        return null;
      }
    };

    const direct = tryParse(text);
    if (direct && typeof direct === 'object') return direct;

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      const parsed = tryParse(fenced[1].trim());
      if (parsed && typeof parsed === 'object') return parsed;
    }

    const isolated = isolateBraceBlock(text);
    if (isolated !== text) {
      const parsed = tryParse(isolated);
      if (parsed && typeof parsed === 'object') return parsed;
    }

    return null;
  }

  /**
   * Fallback config.toml template if the LLM does not return that field.
   */
  private static buildConfigToml(toolId: string, name: string, description: string, parameters: any): string {
    const params = JSON.stringify(parameters || { type: 'object', properties: {} });
    return `id = "${toolId}"
name = "${name}"
description = "${description}"
version = "1.0.0"
runtime = "node"
entry_point = "main.cjs"

[tool]
name = "${toolId}"
description = "${description}"
parameters = ${params}`;
  }

  /**
   * Fallback main.cjs template if the LLM does not return that field.
   */
  private static buildMainCjs(toolId: string, description: string): string {
    return `const args = typeof process !== 'undefined' && process.argv[2] ? JSON.parse(process.argv[2]) : {};

async function execute(args, context) {
  return { success: true, result: "Fallback tool '${toolId}' (${description}) executed with no-op." };
}

if (typeof require !== 'undefined' && require.main === module) {
  execute(args, {})
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => console.log(JSON.stringify({ success: false, error: e.message })));
}

if (typeof module !== 'undefined') {
  module.exports = { execute };
}`;
  }
}
