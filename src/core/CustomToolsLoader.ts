import { SystemRegistry } from './registry';

export class CustomToolsLoader {
  private static registryPath = './src/core/custom_tools_registry.json';

  public static getRegistryPath() {
    return this.registryPath;
  }

  public static async loadAndRegisterAll() {
    try {
      const fs = await import('fs');
      const registryPath = this.getRegistryPath();
      if (!fs.existsSync(registryPath)) {
        fs.writeFileSync(registryPath, JSON.stringify([], null, 2), 'utf8');
      }
      const fileData = fs.readFileSync(registryPath, 'utf8');
      const customTools = JSON.parse(fileData);
      
      for (const toolDef of customTools) {
        this.registerTool(toolDef);
      }
      console.log(`[CUSTOM_TOOLS] Registered ${customTools.length} custom tools.`);
    } catch (err: any) {
      console.error('[CUSTOM_TOOLS] Failed to load custom tools:', err);
    }
  }

  public static registerTool(toolDef: any) {
    const toolModule = {
      metadata: {
        id: toolDef.id,
        name: toolDef.name,
        description: toolDef.description,
        version: toolDef.version || '1.0.0',
        type: 'tool' as const,
        parameters: toolDef.parameters || { type: 'object', properties: {} },
        actionType: toolDef.actionType || 'code',
        actionCode: toolDef.actionCode || ''
      },
      execute: async (args: any, context?: any) => {
        const { actionType, actionCode } = toolDef;
        if (actionType === 'code') {
          // Execute sandbox JS code
          // Create a dynamic function with (args, context)
          const fn = new Function('args', 'context', `
            try {
              ${actionCode}
            } catch (err) {
              throw new Error("Custom Tool Execution Error: " + err?.message || err);
            }
          `);
          return fn(args, context);
        } else if (actionType === 'shell') {
          // Execute bash command. Inject arguments into actionCode using {{argName}}
          const { exec } = await import('child_process');
          let command = actionCode;
          for (const key of Object.keys(args)) {
            command = command.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(args[key]));
          }
          return new Promise(async (resolve, reject) => {
            let shellTimeout = 120000;
            try {
              const { SettingsManager } = await import('./kernel/settings.js');
              const settings = await SettingsManager.getInstance().load();
              const toolExecutorConfig = settings['tool-executor'] || {};
              if (toolExecutorConfig.shellTimeoutMs !== undefined) {
                shellTimeout = Number(toolExecutorConfig.shellTimeoutMs);
              }
            } catch (e) {}

            exec(command, { timeout: shellTimeout }, (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                resolve({ stdout, stderr });
              }
            });
          });
        } else if (actionType === 'webhook') {
          // Perform HTTP webhook request
          let url = actionCode;
          for (const key of Object.keys(args)) {
            url = url.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), encodeURIComponent(String(args[key])));
          }
          const fetchRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
          });
          const text = await fetchRes.text();
          try {
            return JSON.parse(text);
          } catch {
            return { rawResponse: text };
          }
        } else {
          return { status: 'success', message: 'Custom tool executed successfully (no action code defined).' };
        }
      }
    };

    SystemRegistry.register(toolModule);
  }
}
