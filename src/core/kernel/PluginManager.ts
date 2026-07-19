import { SystemRegistry } from '@shared/core/registry';
import { SettingsManager } from './settings';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export interface PluginRegisterHook {
  registerProvider: (provider: any) => void;
  registerTTS: (tts: any) => void;
  registerTool: (tool: any) => void;
}

export class PluginManager {
  private static instance: PluginManager;
  private loadedPlugins: Map<string, any> = new Map();
  private registeredModules: Map<string, string[]> = new Map();

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Scans the addons directory and loads any valid plugins.
   */
  public async loadPlugins(): Promise<void> {
    logger.log('INFO', 'PLUGIN_MANAGER', 'Scanning addons directory for plugins...');
    
    let localRequire: any = typeof require !== 'undefined' ? require : null;
    if (!localRequire) {
      try {
        const { createRequire } = await import(/* @vite-ignore */ 'module');
        localRequire = createRequire(import.meta.url);
      } catch (e) {
        logger.log('WARN', 'PLUGIN_MANAGER', 'Could not initialize createRequire for ES modules, localRequire is not available in this environment.');
      }
    }
    
    const addonsDirs = [
      path.join(process.cwd(), 'addons'),
      path.join(process.cwd(), '.yuihime', 'addons')
    ];

    const settings = SettingsManager.getInstance();
    await settings.load();

    for (const dir of addonsDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const subdirs = fs.readdirSync(dir, { withFileTypes: true });
        for (const subdir of subdirs) {
          if (!subdir.isDirectory()) continue;

          const pluginDir = path.join(dir, subdir.name);
          const pluginScriptPath = path.join(pluginDir, 'plugin.cjs');

          if (fs.existsSync(pluginScriptPath)) {
            try {
              // Check if enabled in settings
              const pluginConfig = settings.get(subdir.name) || {};
              
              const isEnabled = pluginConfig.enabled !== false;

              if (!isEnabled) {
                logger.log('INFO', 'PLUGIN_MANAGER', `Plugin ${subdir.name} is disabled. Ensuring it is unloaded.`);
                this.unloadPlugin(subdir.name);
                continue;
              }

              // Unload first for a clean reload/hot-reload
              this.unloadPlugin(subdir.name);

              logger.log('INFO', 'PLUGIN_MANAGER', `Loading plugin: ${subdir.name} from ${pluginScriptPath}`);
              
              if (!localRequire) {
                logger.log('ERROR', 'PLUGIN_MANAGER', `Cannot load plugin ${subdir.name}: require/createRequire is not defined in this environment.`);
                continue;
              }

              // Clear require cache for dynamic reload
              const resolvedPath = localRequire.resolve(pluginScriptPath);
              if (localRequire.cache && localRequire.cache[resolvedPath]) {
                delete localRequire.cache[resolvedPath];
              }
              
              const pluginModule = localRequire(pluginScriptPath);
              if (pluginModule && typeof pluginModule.initialize === 'function') {
                const hooks: PluginRegisterHook = {
                  registerProvider: (provider) => {
                    logger.log('INFO', 'PLUGIN_MANAGER', `[${subdir.name}] Registered AI Provider: ${provider.metadata.id}`);
                    SystemRegistry.register(provider);
                    
                    if (!this.registeredModules.has(subdir.name)) {
                      this.registeredModules.set(subdir.name, []);
                    }
                    this.registeredModules.get(subdir.name)!.push(provider.metadata.id);
                  },
                  registerTTS: (tts) => {
                    logger.log('INFO', 'PLUGIN_MANAGER', `[${subdir.name}] Registered TTS: ${tts.metadata.id}`);
                    SystemRegistry.register(tts);
                    
                    if (!this.registeredModules.has(subdir.name)) {
                      this.registeredModules.set(subdir.name, []);
                    }
                    this.registeredModules.get(subdir.name)!.push(tts.metadata.id);
                  },
                  registerTool: (tool) => {
                    logger.log('INFO', 'PLUGIN_MANAGER', `[${subdir.name}] Registered Tool: ${tool.metadata.id}`);
                    SystemRegistry.register(tool);
                    
                    if (!this.registeredModules.has(subdir.name)) {
                      this.registeredModules.set(subdir.name, []);
                    }
                    this.registeredModules.get(subdir.name)!.push(tool.metadata.id);
                  }
                };

                await pluginModule.initialize(hooks);
                this.loadedPlugins.set(subdir.name, pluginModule);
                logger.log('INFO', 'PLUGIN_MANAGER', `Successfully loaded and initialized plugin: ${subdir.name}`);
              } else {
                logger.log('WARN', 'PLUGIN_MANAGER', `Plugin ${subdir.name} missing initialize() export.`);
              }
            } catch (err: any) {
              logger.log('ERROR', 'PLUGIN_MANAGER', `Failed to load plugin ${subdir.name}: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        logger.log('ERROR', 'PLUGIN_MANAGER', `Failed to read addons directory ${dir}: ${err.message}`);
      }
    }
  }

  /**
   * Unloads a plugin dynamically.
   */
  public unloadPlugin(id: string): void {
    if (this.loadedPlugins.has(id)) {
      const plugin = this.loadedPlugins.get(id);
      if (plugin && typeof plugin.unload === 'function') {
        try {
          plugin.unload();
        } catch (e: any) {
          logger.log('ERROR', 'PLUGIN_MANAGER', `Error unloading plugin ${id}: ${e.message}`);
        }
      }
      this.loadedPlugins.delete(id);
      logger.log('INFO', 'PLUGIN_MANAGER', `Unloaded plugin: ${id}`);
    }

    // Dynamic unregistration from SystemRegistry
    const modules = this.registeredModules.get(id);
    if (modules && modules.length > 0) {
      for (const moduleId of modules) {
        try {
          SystemRegistry.unregister(moduleId);
        } catch (e: any) {
          logger.log('ERROR', 'PLUGIN_MANAGER', `Error unregistering module ${moduleId} for plugin ${id}: ${e.message}`);
        }
      }
      this.registeredModules.delete(id);
      logger.log('INFO', 'PLUGIN_MANAGER', `Unregistered all modules for plugin: ${id}`);
    }
  }
}
