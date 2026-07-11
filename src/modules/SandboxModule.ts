import { CortexModule, ModuleType } from '../include/types';
import { StorageService } from '../drivers/storage';

export const SandboxFSModule: CortexModule = {
  metadata: {
    id: 'sandbox-fs',
    name: 'Filesystem Sandbox',
    description: 'Read/Write/List/Delete files in the secure sandbox environment. ALWAYS use this for non-core files.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 1,
    phase: 'execution'
  },
  run: async (input: any, state: any, context: any) => {
    // Input should contain action, name, content
    const data = typeof input === 'string' ? { action: 'list', name: input } : input;
    return await StorageService.sandboxFile(data.action, data.name, data.content);
  }
};

export const SandboxTerminalModule: CortexModule = {
  metadata: {
    id: 'sandbox-terminal',
    name: 'Terminal Sandbox',
    description: 'Execute shell commands inside the secure sandbox environment. Used for non-core experiments.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 2,
    phase: 'execution'
  },
  run: async (input: any, state: any, context: any) => {
    const command = typeof input === 'string' ? input : (input.command || "");
    if (!command) return { error: "No command provided." };
    return await StorageService.sandboxExec(command);
  }
};
