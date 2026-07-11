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
} from '../include/types';
import { SystemRegistry } from './registry';
import { initializeCortexModules } from "./RegistryInitializer";
import { StorageService } from '../drivers/storage';
import { DreamEngine } from './dream';
import { NeuralCircuitManager } from './circuits/NeuralCircuitFramework';
import { MoodStabilizerCircuit, MemoryRefinerCircuit } from './circuits/StandardCircuits';
import { Soul } from './soul';
import { stateMachine } from './kernel/state-machine';

import { fetchCortexSettings } from './cortex/cortexSettings';
import { executeCortexSelfDirectedThought } from './cortex/autonomousThought';
import { normalizeToolCall } from './cortex/toolNormalizer';
import { wrapForPuterConsciousness } from './cortex/puterWrapper';
import { repairJsonFormatWithLLM } from './cortex/jsonRepairer';
import { FastTrackRunner } from './cortex/fastTrackRunner';
import { executeCortexThink } from './cortex/cortexThinkEngine';

export { normalizeToolCall } from './cortex/toolNormalizer';
export { PartialJsonFinalAnswerExtractor, StreamExtractor } from './cortex/streamExtractors';

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
    Cortex.ensureInitialized().catch(e => console.error('[Cortex] Failed to ensure initialized:', e));
  }

  public static wrapForPuterConsciousness(thinkResult: any) {
    return wrapForPuterConsciousness(thinkResult);
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

  public getNeuralCircuitManager() {
    return this.neuralCircuits;
  }

  public getNanobotManager() {
    return this.neuralCircuits;
  }

  public getModule<T = any>(id: string): T | undefined {
    return SystemRegistry.getModule<T>(id);
  }

  public startAutonomousPulse(intervalMs: number = 30000) {
    if (this.pulseInterval) return;
    console.log(`[ZENITH_MANIFEST] Pulse synchronized at ${intervalMs}ms`);
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
    signal?: AbortSignal
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
      signal
    );
  }

  async runFastTrack(state: AgentState, telemetryData?: { operation: string; latency: number; success: boolean; context?: string }): Promise<any> {
    return FastTrackRunner.run(this.config, state, telemetryData);
  }

  async dream(memories: Memory[], currentDreams: Dream[], state: AgentState): Promise<{ dreams: Dream[], reflections: string }> {
     await Cortex.ensureInitialized();
     const logicContext = await SystemRegistry.runCortexPhase('LOGIC' as any, 'SIMULATE_DREAM', state, {
        memories,
        dreams: currentDreams,
        systemConfig: this.config,
        think: (p: string) => this.thinkSimple(p)
     });
     
     const result = await DreamEngine.startCycle(this, state);
     const dreams = await StorageService.getDreams();
     return { dreams, reflections: logicContext.dreamInsight || result.reflections };
  }

  async consolidateDreams(dreams: Dream[]): Promise<Dream[]> {
    return dreams;
  }

  async thinkSimple(prompt: string, jsonMode: boolean = false): Promise<string> {
    await Cortex.ensureInitialized();
    const gateway = SystemRegistry.getModule<any>('provider-gateway');
    const settings = await this.getSettings();
    
    if (!gateway) {
      throw new Error("Neural Gateway is missing. Critical failure in thinkSimple.");
    }

    const simpleSettings = {
      ...settings,
      [settings.provider]: {
        ...(settings[settings.provider] || {}),
        isJson: jsonMode
      }
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
