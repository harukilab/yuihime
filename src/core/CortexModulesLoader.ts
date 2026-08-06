import { SystemRegistry } from '@shared/core/registry';
import { CortexModule, ModuleType } from '@shared/include/types';
import { resolveCortexLoaderDir } from '@/core/systemPaths';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// External Cortex Modules loader.
//
// Cortex modules are normally compiled into the daemon (src/modules/**). This
// loader lets you drop JSON definition files into ~/.yuihime/cortexloader/*.json
// (OUTSIDE the codebase) and have them registered as real CORTEX modules that
// run on EVERY pipeline cycle — exactly like built-in modules. No rebuild needed:
// definitions are scanned at startup, and new ones can be registered at runtime
// via CortexModulesLoader.registerModule / the /api/cortex-modules endpoints.
//
// JSON schema per file:
// {
//   "id": "ext_status_check",
//   "name": "External Status Check",
//   "description": "Check external service on every turn.",
//   "phase": "aggregation",
//   "order": 1,
//   "actionType": "code" | "shell" | "webhook",
//   "actionCode": "..."
// }
//
// - "code":    JS sandbox function; receives (args, context); may mutate and
//              return context so results flow into the pipeline.
// - "shell":   bash command; {{argName}} placeholders are replaced from args.
// - "webhook": POST JSON to the URL in actionCode, args as the request body.
//
// A module without a "trigger" runs on EVERY cycle. If you need conditional
// execution, you can omit "trigger" and branch inside the action code instead.

export class CortexModulesLoader {
  private static loaderDir = resolveCortexLoaderDir();

  public static getLoaderDir() {
    return this.loaderDir;
  }

  public static getRegistryPath() {
    return path.join(this.loaderDir, 'registry.json');
  }

  public static async loadAndRegisterAll() {
    try {
      const dir = this.getLoaderDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'registry.json');
      let registered = 0;
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const def = JSON.parse(raw);
          this.registerModule(def);
          registered++;
        } catch (err: any) {
          console.error(`[CORTEX_LOADER] Failed to load cortex module from ${file}:`, err?.message || err);
        }
      }
      console.log(`[CORTEX_LOADER] Registered ${registered} external cortex modules from ${dir}.`);
    } catch (err: any) {
      console.error('[CORTEX_LOADER] Failed to load external cortex modules:', err?.message || err);
    }
  }

  public static registerModule(def: any) {
    if (!def || !def.id || !def.phase) {
      throw new Error('Cortex module definition requires "id" and "phase".');
    }
    const moduleId = String(def.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const actionType = def.actionType || 'code';
    const actionCode = def.actionCode || 'return context;';

    const module: CortexModule = {
      metadata: {
        id: moduleId,
        name: def.name || moduleId,
        description: def.description || `External cortex module: ${moduleId}.`,
        version: def.version || '1.0.0',
        author: def.author || 'external',
        type: ModuleType.CORTEX,
        phase: def.phase,
        order: typeof def.order === 'number' ? def.order : 0
      },
      run: async (input: string, state: any, context: any) => {
        try {
          const args: any = { ...(def.parameters || {}), input, _input: input };
          if (actionType === 'code') {
            // eslint-disable-next-line no-new-func
            const fn = new Function('args', 'context', 'state', 'input', `
              try {
                ${actionCode}
              } catch (err) {
                throw new Error("Cortex Module Execution Error: " + (err?.message || err));
              }
            `);
            const result = await fn(args, context, state, input);
            return result === undefined ? context : result;
          } else if (actionType === 'shell') {
            let command = actionCode;
            for (const key of Object.keys(args)) {
              command = command.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(args[key]));
            }
            return new Promise<any>((resolve, reject) => {
              exec(command, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                  const isTimeout = error.killed || (error.message && error.message.includes('timed out'));
                  reject(new Error(isTimeout
                    ? `Cortex shell command timed out.`
                    : error.message));
                } else {
                  context[`${moduleId}_output`] = (stdout || '') + (stderr || '');
                  resolve(context);
                }
              });
            });
          } else if (actionType === 'webhook') {
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
            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = { rawResponse: text };
            }
            context[`${moduleId}_output`] = parsed;
            return context;
          }
          return context;
        } catch (err: any) {
          console.error(`[CORTEX_LOADER] Module ${moduleId} execution error:`, err?.message || err);
          context[`${moduleId}_error`] = String(err?.message || err);
          return context;
        }
      }
    };

    SystemRegistry.register(module);
    console.log(`[CORTEX_LOADER] Registered external cortex module: ${moduleId} (phase: ${def.phase}, order: ${module.metadata.order}).`);
  }
}
