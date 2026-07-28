import { ToolModule } from '@shared/include/types';
import { eventBus } from '@shared/core/kernel/event-bus';
import { DynamicLoader } from '../../../core/DynamicLoader.js';
import manifest from './manifest.json';

export const PluginInstallerTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: { id: string, config: string, code: string, runtime: string }) => {
    console.log(`[INSTALLER] Attempting to install plugin: ${args.id}`);
    
    try {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const response = await fetch(`${baseUrl}/api/addons/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        throw new Error(`Failed to install plugin: ${await response.text()}`);
      }

      await DynamicLoader.syncAddons();

      eventBus.emit('PLUGIN_INSTALLED', { id: args.id });
      return { status: 'success', message: `Plugin ${args.id} installed and active.` };
    } catch (error: any) {
      console.error('[INSTALLER] Installation failed:', error);
      return { status: 'failure', errorDetails: error.message };
    }
  }
};
