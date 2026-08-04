import { ToolModule } from '@shared/include/types';
import { eventBus } from '@shared/core/kernel/event-bus';
import { DynamicLoader } from '../../core/DynamicLoader.js';

const manifest = {
  "id": "install_addon",
  "name": "Install Addon",
  "description": "Installs or updates a system plugin/addon. Supports two modes: (1) writing raw config + entry point code (id + config + code + runtime), or (2) cloning a skill from a git repository such as https://github.com/Tensor-Art/tensorart-skills (repoUrl + optional skill folder name, e.g. 'tensorart-generate'). After installing, the addon is registered and becomes available to the agent.",
  "version": "1.1.0",
  "type": "TOOL",
  "order": 0,
  "parameters": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Unique identifier for the addon (dash-separated). Auto-derived from the skill folder when installing from a repo." },
      "config": { "type": "string", "description": "TOML configuration content (raw install mode)" },
      "code": { "type": "string", "description": "Main entry point code content (raw install mode)" },
      "runtime": { "type": "string", "description": "Runtime environment", "enum": ["node", "python", "bash"] },
      "repoUrl": { "type": "string", "description": "Git repository URL to clone a skill from (repo install mode), e.g. https://github.com/Tensor-Art/tensorart-skills" },
      "skill": { "type": "string", "description": "Skill folder name inside the repository, e.g. 'tensorart-generate'. If omitted, a folder with SKILL.md/config.toml is auto-detected." }
    }
  }
} as const;

export const PluginInstallerTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: { id: string, config: string, code: string, runtime: string, repoUrl?: string, skill?: string }) => {
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
