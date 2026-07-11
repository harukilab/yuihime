import { SettingsManager } from "./settings.js";
import { SystemRegistry } from "../registry.js";

export class Kernel {
  private static instance: Kernel;
  private settings: SettingsManager;
  private registry: SystemRegistry;
  private isBooted: boolean = false;

  private constructor() {
    this.settings = SettingsManager.getInstance();
    this.registry = SystemRegistry.getInstance();
  }

  public static getInstance(): Kernel {
    if (!Kernel.instance) {
      Kernel.instance = new Kernel();
    }
    return Kernel.instance;
  }

  public async boot() {
    if (this.isBooted) return;
    
    console.log('[KERNEL] Booting Yuihime Core...');
    
    // Load settings first
    await this.settings.load();
    
    // Initialize registry
    await this.registry.initialize();
    
    this.isBooted = true;
    console.log('[KERNEL] System online.');
  }

  public getSettings() {
    return this.settings;
  }

  public getRegistry() {
    return this.registry;
  }
}
