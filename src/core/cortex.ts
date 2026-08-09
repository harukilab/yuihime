/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  AgentState, 
  Memory, 
  Dream, 
  LearnedStrategy, 
  AgentPersona, 
  Identity
} from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { initializeCortexModules } from "./RegistryInitializer";
import { StorageService } from '@shared/drivers/storage';
import { DreamEngine } from './dream';
import { NeuralCircuitManager } from './circuits/NeuralCircuitFramework';
import { MoodStabilizerCircuit, MemoryRefinerCircuit } from './circuits/StandardCircuits';
import { Soul } from '@shared/core/soul';
import { stateMachine } from './kernel/state-machine';

import { fetchCortexSettings } from './cortex/cortexSettings';
import { executeCortexSelfDirectedThought } from './cortex/autonomousThought';
import { normalizeToolCall } from './cortex/toolNormalizer';
import { repairJsonFormatWithLLM } from './cortex/jsonRepairer';
import { FastTrackRunner } from './cortex/fastTrackRunner';
import { executeCortexThink } from './cortex/cortexThinkEngine';
import { eventBus } from '@shared/core/kernel/event-bus';

export { normalizeToolCall } from './cortex/toolNormalizer';
export { StreamExtractor } from './cortex/streamExtractors';

export class Cortex {
  private neuralCircuits: NeuralCircuitManager | null = null;
  private pulseInterval: NodeJS.Timeout | null = null;
  private isPulseActive: boolean = false;
  private soul: Soul | null = null;
  private config: any = null;
  private currentInterval: number = 30000;

  private static initPromise: Promise<void> | null = null;

  public static async ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = initializeCortexModules();
    }
    await this.initPromise;
  }

  constructor() {
    (Cortex as any)._latestInstance = this;
    Cortex.registerAutoDreamListener();
    Cortex.ensureInitialized().catch(e => console.error('[Cortex] Failed to ensure initialized:', e));
  }

  public setConfig(config: any) {
    this.config = config;
    const newInterval = config?.agent?.pulseIntervalMs || 30000;
    if (newInterval !== this.currentInterval) {
       this.currentInterval = newInterval;
       if (this.pulseInterval) {
          this.stopAutonomousPulse();
          this.startAutonomousPulse(newInterval);
       }
    }
  }

  public getConfig() {
    return this.config;
  }

  public setSoul(soul: Soul) {
    this.soul = soul;
    this.neuralCircuits = new NeuralCircuitManager(soul, this);
    this.neuralCircuits.register(new MoodStabilizerCircuit(soul, this));
    this.neuralCircuits.register(new MemoryRefinerCircuit(soul, this));
    this.neuralCircuits.startAll();
    
    this.startAutonomousPulse(this.currentInterval);
  }

  public getModule<T = any>(id: string): T | undefined {
    return SystemRegistry.getModule<T>(id);
  }

  /**
   * Background autonomous dream trigger (Area 5). Runs the DreamModule's
   * simulation cycle without any user input. Guarded by the module's own
   * cooldown (state.lastDreamCycle) so it cannot loop infinitely.
   */
  public async triggerAutoDream(payload?: any): Promise<void> {
    try {
      if (typeof window !== 'undefined') return; // server-side only
      const state: any = (global as any).__yuiAgentState || {
        status: 'reflecting',
        energy: 20,
        mood: {},
        systemHealth: {},
        lastDreamCycle: 0,
        relation: {}
      };
      const memories = await StorageService.getMemories();
      const currentDreams = await StorageService.getDreams();

      // Run the dream simulation module directly via the registry
      const result = await SystemRegistry.runCortexPhase('logic' as any, 'SIMULATE_DREAM', state as any, {
        memories,
        dreams: currentDreams,
        systemConfig: this.config,
        think: (p: string) => this.thinkSimple(p),
        autoDream: true,
        autoDreamReason: payload?.reason || 'autonomous'
      });
      console.log(`[CORTEX_BG_LOOP] Auto-dream cycle completed. Insight: ${(result.dreamInsight || 'n/a').substring(0, 60)}`);
    } catch (e: any) {
      console.error('[CORTEX_BG_LOOP] Auto-dream cycle failed:', e?.message || e);
    }
  }

  private static autoDreamListenerRegistered = false;
  private static registerAutoDreamListener() {
    if (Cortex.autoDreamListenerRegistered) return;
    Cortex.autoDreamListenerRegistered = true;
    try {
      eventBus.on('AGI:AUTO_DREAM', (payload: any) => {
        // Defer to avoid blocking the emitting module's run()
        setTimeout(() => {
          const instance = (Cortex as any)._latestInstance as Cortex | undefined;
          instance?.triggerAutoDream(payload).catch(() => {});
        }, 0);
      });
    } catch (e) {
      console.warn('[Cortex] Could not register auto-dream listener:', e);
    }
  }

  public startAutonomousPulse(intervalMs: number = 30000) {
    if (this.pulseInterval) return;
    console.log(`[CORTEX_BG_LOOP] Pulse synchronized at ${intervalMs}ms`);
    this.currentInterval = intervalMs;
    
    this.pulseInterval = setInterval(async () => {
      if (this.isPulseActive || stateMachine.getStatus() !== 'IDLE') return;
      this.isPulseActive = true;
      
      try {
        await this.executeSelfDirectedThought();
      } finally {
        this.isPulseActive = false;
      }
    }, intervalMs);
  }

  public stopAutonomousPulse() {
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = null;
    }
  }

  private async executeSelfDirectedThought() {
    await executeCortexSelfDirectedThought(this);
  }

  async think(
    input: string,
    memories: Memory[],
    dreams: Dream[],
    capabilities: any[],
    state: AgentState,
    strategies: LearnedStrategy[],
    userName: string,
    allIdentities: Identity[],
    activePersona?: AgentPersona,
    contextId?: string,
    chatType?: string,
    taskId?: string,
    attachments?: any[],
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    db?: any,
    options?: { provider?: string; model?: string }
  ): Promise<any> {
    return executeCortexThink(
      this,
      input,
      memories,
      dreams,
      capabilities,
      state,
      strategies,
      userName,
      allIdentities,
      activePersona,
      contextId,
      chatType,
      taskId,
      attachments,
      onChunk,
      signal,
      db,
      options
    );
  }

  async runFastTrack(state: AgentState, telemetryData?: { operation: string; latency: number; success: boolean; context?: string }): Promise<any> {
    return FastTrackRunner.run(this.config, state, telemetryData);
  }

  async dream(memories: Memory[], currentDreams: Dream[], state: AgentState): Promise<{ dreams: Dream[], reflections: string }> {
     await Cortex.ensureInitialized();
     const logicContext = await SystemRegistry.runCortexPhase('logic' as any, 'SIMULATE_DREAM', state, {
        memories,
        dreams: currentDreams,
        systemConfig: this.config,
        think: (p: string) => this.thinkSimple(p)
     });
     
     const result = await DreamEngine.startCycle(this, state);
     const dreams = await StorageService.getDreams();
     return { dreams, reflections: logicContext.dreamInsight || result.reflections };
  }

  async thinkSimple(prompt: string, jsonMode: boolean = false, modelOverride?: string): Promise<string> {
    await Cortex.ensureInitialized();
    const gateway = SystemRegistry.getModule<any>('provider-gateway');
    const settings = await this.getSettings();
    
    if (!gateway) {
      throw new Error("Neural Gateway is missing. Critical failure in thinkSimple.");
    }

    // Honor an explicit model override (e.g. a heavier reasoning model picked by
    // the hybrid trigger). Empty/undefined => gateway uses the user's main
    // chat model from settings[provider].model. No hardcoded fallback model.
    const providerKey = settings.provider;
    const providerConfig = { ...(settings[providerKey] || {}) };
    if (modelOverride && modelOverride.length > 0) {
      providerConfig.model = modelOverride;
    }
    providerConfig.isJson = jsonMode;

    const simpleSettings = {
      ...settings,
      [providerKey]: providerConfig
    };

    const resultContext = await gateway.run(prompt, {} as AgentState, { 
      config: simpleSettings 
    });
    return resultContext.rawResult || "";
  }

  public async getSettings() {
    return fetchCortexSettings(this.config);
  }

  public async repairJsonFormatWithLLM(invalidRawText: string, userQuery: string): Promise<any> {
    return repairJsonFormatWithLLM((p, jm) => this.thinkSimple(p, jm), invalidRawText, userQuery);
  }
}
