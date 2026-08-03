import { SystemRegistry } from '@shared/core/registry';
import { ModuleType, ToolModule } from '@shared/include/types';
import { eventBus } from '@shared/core/kernel/event-bus';
import { logger } from '@/core/kernel/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class DynamicLoader {
  static async syncAddons(attempt = 0, maxAttempts = 15) {
    try {
      logger.log('INFO', 'DYNAMIC_LOADER', 'Syncing addons from server...');
      const host = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
      const res = await fetch(`${host}/api/addons`);
      if (!res.ok) throw new Error("Failed to fetch addons");
      
      const addons = await res.json();
      
      for (const addon of addons) {
        this.registerAddonAsTool(addon);
      }

      // Regenerate available_tools.json so newly registered addon tools are
      // visible to the prompt builder (PromptManager reads this file first).
      this.regenerateAvailableTools();

      logger.log('INFO', 'DYNAMIC_LOADER', `Sync complete. ${addons.length} addons processed.`);
    } catch (error: any) {
      // syncAddons runs at startup, before the HTTP server may be listening.
      // Retry with backoff so addon discovery/tool registration is not lost.
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.min(30, Math.pow(2, attempt));
        logger.log('WARN', 'DYNAMIC_LOADER', `Sync failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms: ${error.message}`);
        setTimeout(() => { DynamicLoader.syncAddons(attempt + 1, maxAttempts); }, delay);
      } else {
        logger.log('ERROR', 'DYNAMIC_LOADER', `Sync failed after ${maxAttempts} attempts`, error.message);
      }
    }
  }

  private static regenerateAvailableTools() {
    try {
      if (typeof window !== 'undefined') return;
      const tools = SystemRegistry.getTools();
      const outputFilePath = path.join(os.homedir(), '.yuihime', 'data', 'available_tools.json');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, JSON.stringify(tools.map((t: any) => t.metadata), null, 2), 'utf8');
      logger.log('INFO', 'DYNAMIC_LOADER', `Regenerated available_tools.json (${tools.length} tools).`);
    } catch (e: any) {
      logger.log('WARN', 'DYNAMIC_LOADER', 'Failed to regenerate available_tools.json', e?.message);
    }
  }

  private static registerAddonAsTool(addon: any) {
    if (!addon.id || !addon.entryPoint) {
       logger.log('WARN', 'DYNAMIC_LOADER', `Addon ${addon.id} missing entry point. Skipping.`);
       return;
    }

    const toolMeta = addon.tool || addon.config?.tool || addon || {};

    let parameters = toolMeta.parameters || { type: 'object', properties: {} };

    // SKILL.md skills (Claude Skills / TensorArt format) expose a script-driven
    // workflow. Give the LLM a clear calling contract: read the instructions
    // card first, then run individual scripts in the skill's scripts/ dir.
    if (addon.runtime === 'skill') {
      parameters = {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['instructions', 'run_script'],
            description: "'instructions' (default) returns the SKILL.md guide describing the workflow. 'run_script' executes a script inside the skill's scripts/ directory."
          },
          script: {
            type: 'string',
            description: "Script filename inside the skill's scripts/ directory (e.g. 'list_tools.py', 'create_task.py'). Required when action is 'run_script'."
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Positional command-line arguments passed to the script.'
          }
        },
        required: ['action']
      };
    }
    
    const tool: ToolModule = {
      metadata: {
        id: `addon-${addon.id}`,
        name: toolMeta.name || `Addon: ${addon.id}`,
        description: toolMeta.description || "Experimental addon tool.",
        version: toolMeta.version || "0.0.1",
        type: ModuleType.TOOL,
        order: 100,
        parameters
      },
      execute: async (args: any) => {
        logger.log('TOOL', 'EXEC', `Executing addon tool: ${addon.id}`, args);
        try {
          const host = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
          const res = await fetch(`${host}/api/addons/execute/${addon.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args })
          });
          
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Execution failed");
          }
          
          const result = await res.json();
          logger.log('TOOL', 'EXEC', `Addon ${addon.id} execution success.`);
          if (result && typeof result.stdout === 'string') {
            try {
              const trimmed = result.stdout.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                return JSON.parse(trimmed);
              }
            } catch (e) {
              
            }
          }
          return result;
        } catch (e: any) {
          logger.log('ERROR', 'EXEC', `Addon ${addon.id} execution error`, e.message);
          return { success: false, error: e.message };
        }
      }
    };

    SystemRegistry.register(tool);
    eventBus.emit('MODULE_REGISTERED', { id: tool.metadata.id });
  }
}
