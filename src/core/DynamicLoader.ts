import { SystemRegistry } from './registry';
import { ModuleType, ToolModule } from '../include/types';
import { eventBus } from './kernel/event-bus';
import { logger } from './kernel/logger';

export class DynamicLoader {
  static async syncAddons() {
    try {
      logger.log('INFO', 'DYNAMIC_LOADER', 'Syncing addons from server...');
      const host = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
      const res = await fetch(`${host}/api/addons`);
      if (!res.ok) throw new Error("Failed to fetch addons");
      
      const addons = await res.json();
      
      for (const addon of addons) {
        this.registerAddonAsTool(addon);
      }
      
      logger.log('INFO', 'DYNAMIC_LOADER', `Sync complete. ${addons.length} addons processed.`);
    } catch (error: any) {
      logger.log('ERROR', 'DYNAMIC_LOADER', 'Sync failed', error.message);
    }
  }

  private static registerAddonAsTool(addon: any) {
    if (!addon.id || !addon.entryPoint) {
       logger.log('WARN', 'DYNAMIC_LOADER', `Addon ${addon.id} missing entry point. Skipping.`);
       return;
    }

    const toolMeta = addon.tool || addon.config?.tool || addon || {};
    
    const tool: ToolModule = {
      metadata: {
        id: `addon-${addon.id}`,
        name: toolMeta.name || `Addon: ${addon.id}`,
        description: toolMeta.description || "Experimental addon tool.",
        version: toolMeta.version || "0.0.1",
        type: ModuleType.TOOL,
        order: 100,
        parameters: toolMeta.parameters || { type: 'object', properties: {} }
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
