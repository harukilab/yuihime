import { logger } from './kernel/logger';
import { SettingsManager } from '@/core/kernel/settings';
import { 
  ModuleType, 
  CortexModule, 
  ToolModule, 
  ProviderModule, 
  TTSModule, 
  AgentState,
  ModulePhase
} from '@shared/include/types';

let settingsManagerPromise: Promise<any> | null = null;
function getSettingsManager(): Promise<any> {
  if (!settingsManagerPromise) {
    settingsManagerPromise = Promise.resolve(SettingsManager.getInstance()).catch(() => null);
  }
  return settingsManagerPromise;
}

export class SystemRegistry {
  private static instance: SystemRegistry;
  private static cortexModules: CortexModule[] = [];
  private static tools: ToolModule[] = [];
  private static providers: ProviderModule[] = [];
  private static ttsModules: TTSModule[] = [];
  private static gateways: any[] = [];
  private static listeners: Set<() => void> = new Set();

  public static getInstance(): SystemRegistry {
    if (!SystemRegistry.instance) {
      SystemRegistry.instance = new SystemRegistry();
    }
    return SystemRegistry.instance;
  }

  async initialize() {
    // This is called by Kernel. Since all methods are static, we don't need much here
    // but the actual init logic is in RegistryInitializer.ts
    if (typeof window === 'undefined') {
      console.log('[REGISTRY] Registry instance initialized.');
    }
  }

  static subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private static notify() {
    this.listeners.forEach(fn => fn());
  }

  static clear() {
    this.cortexModules = [];
    this.tools = [];
    this.providers = [];
    this.ttsModules = [];
    this.gateways = [];
    this.notify();
  }

  static register(module: any) {
    if (!module || !module.metadata || !module.metadata.id) {
      logger.log('WARN', 'REGISTRY', 'Attempted to register invalid module', module);
      return;
    }

    if (module.metadata.type?.toLowerCase() === ModuleType.TOOL) {
      const name = module.metadata.id;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
        logger.log('WARN', 'REGISTRY', `Tool name '${name}' does not match OpenAI pattern /^[a-zA-Z0-9_-]{1,64}$/. Skipping registration.`);
        return;
      }
    }

    const isUpdate = this.getModule(module.metadata.id) !== undefined;
    logger.log('INFO', 'REGISTRY', `${isUpdate ? 'Updating' : 'Registering'} module: ${module.metadata.id} [${module.metadata.type}]`);

    switch (module.metadata.type?.toLowerCase()) {
      case ModuleType.CORTEX:
        this.cortexModules = this.cortexModules.filter(m => m.metadata.id !== module.metadata.id);
        this.cortexModules.push(module);
        this.cortexModules.sort((a, b) => a.metadata.order - b.metadata.order);
        break;
      case ModuleType.TOOL:
        this.tools = this.tools.filter(m => m.metadata.id !== module.metadata.id);
        this.tools.push(module);
        break;
      case ModuleType.PROVIDER:
        this.providers = this.providers.filter(m => m.metadata.id !== module.metadata.id);
        this.providers.push(module);
        break;
      case ModuleType.TTS:
        this.ttsModules = this.ttsModules.filter(m => m.metadata.id !== module.metadata.id);
        this.ttsModules.push(module);
        break;
      case ModuleType.GATEWAY:
        this.gateways = this.gateways.filter(m => m.metadata.id !== module.metadata.id);
        this.gateways.push(module);
        break;
    }
    this.notify();
  }

  static unregister(id: string) {
    logger.log('INFO', 'REGISTRY', `Unregistering module: ${id}`);
    const targetId = id === 'browser_speech' ? 'browser' : id;
    this.cortexModules = this.cortexModules.filter(m => m.metadata.id !== targetId);
    this.tools = this.tools.filter(t => t.metadata.id !== targetId);
    this.providers = this.providers.filter(p => p.metadata.id !== targetId);
    this.ttsModules = this.ttsModules.filter(t => t.metadata.id !== targetId);
    this.gateways = this.gateways.filter(g => g.metadata.id !== targetId);
    this.notify();
  }

  static getModule<T = any>(id: string): T | undefined {
    const targetId = id === 'browser_speech' ? 'browser' : id;
    return (this.cortexModules.find(m => m.metadata.id === targetId) ||
            this.tools.find(m => m.metadata.id === targetId) ||
            this.providers.find(m => m.metadata.id === targetId) ||
            this.ttsModules.find(m => m.metadata.id === targetId) ||
            this.gateways.find(m => m.metadata.id === targetId)) as T | undefined;
  }

  // --- Cortex Execution ---
  static async runCortexPhase(
    phase: ModulePhase,
    input: string,
    state: AgentState,
    context: any = {}
  ): Promise<any> {
    const phaseModules = this.cortexModules.filter(m =>
      m.metadata.phase === phase &&
      (!m.metadata.trigger || m.metadata.trigger(input, state))
    );

    if (phaseModules.length === 0) return context;

    const modulesByOrder = new Map<number, CortexModule[]>();
    for (const m of phaseModules) {
      const order = m.metadata.order || 0;
      const arr = modulesByOrder.get(order);
      if (arr) arr.push(m);
      else modulesByOrder.set(order, [m]);
    }

    const sortedOrders = Array.from(modulesByOrder.keys()).sort((a, b) => a - b);
    let currentContext = { ...context };

    for (const order of sortedOrders) {
      const modulesAtLevel = modulesByOrder.get(order)!;
      
      const results = await Promise.all(
        modulesAtLevel.map(async (module) => {
          try {
            console.log(`[REGISTRY_RUN] Running module: ${module.metadata.id} [${module.metadata.phase}]...`);
            const result = await module.run(input, state, currentContext);
            console.log(`[REGISTRY_RUN] Module completed: ${module.metadata.id}`);
            return result;
          } catch (err: any) {
            console.error(`[REGISTRY] Module ${module.metadata.id} failed in ${phase}:`, err?.message || err);
            return {};
          }
        })
      );

      for (const result of results) {
        currentContext = { ...currentContext, ...result };
      }
    }

    return currentContext;
  }

  // --- Tools ---
  static getTools() {
    return [...this.tools];
  }

  static getTool(id: string) {
    return this.tools.find(t => t.metadata.id === id);
  }

  // --- Providers ---
  static getProviders() {
    return [...this.providers];
  }

  static getProvider(id: string) {
    return this.providers.find(p => p.metadata.id === id);
  }

  // --- TTS ---
  static getTTSModules() {
    return [...this.ttsModules];
  }

  static getTTS(id: string) {
    const targetId = id === 'browser_speech' ? 'browser' : id;
    return this.ttsModules.find(t => t.metadata.id === targetId);
  }
  
  static getGateways() {
    return [...this.gateways];
  }
  
  static getGateway(id: string) {
    return this.gateways.find(g => g.metadata.id === id);
  }

  static getCortexModules() {
    return [...this.cortexModules];
  }

  static getModules() {
    return [
      ...this.cortexModules,
      ...this.tools,
      ...this.providers,
      ...this.ttsModules,
      ...this.gateways
    ];
  }

static async getConfig(moduleId: string): Promise<any> {
    if (typeof window === 'undefined') {
       try {
         const mgr = await getSettingsManager();
         const settings = mgr ? await mgr.load() : {};
         return settings[moduleId] || {};
       } catch (e) {
         return {};
       }
     }
     const data = await fetch('/api/settings').then(res => res.json()).catch(() => ({}));
     return data[moduleId] || {};
   }
}
