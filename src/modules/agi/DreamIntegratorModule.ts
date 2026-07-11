/**
 * DreamIntegratorModule.ts
 * 
 * Bridges simulation outcomes (Dreams) with behavioral strategies.
 * Analyses simulated lessons and applies them as systemic learning.
 * 
 * Phase: LOGIC
 * Order: 51 (Runs after DreamSimulationModule)
 */

import { CortexModule, ModuleType, AgentState } from '../../include/types';
import { StorageService } from '../../drivers/storage';

export const DreamIntegratorModule: CortexModule = {
  metadata: {
    id: 'dream-integrator',
    name: 'yui-synapse: Learning Bridge',
    description: 'Integrates simulated dream insights into behavioral strategies and RL engine.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 51,
    phase: 'LOGIC'
  },

  run: async (input: string, state: AgentState, context: any) => {
    // 1. Check if a dream insight was generated in this cycle
    const insight = context.dreamInsight;
    if (!insight) return context;

    console.log(`[DREAM_INTEGRATION] Integrating simulated heuristic: "${insight.substring(0, 50)}..."`);

    // 2. Persistent Memory Integration
    // Convert the dream lesson into a "Subconscious Strategy"
    const strategies = await StorageService.getStrategies();
    const newStrategy = {
      id: `sim_${Date.now()}`,
      pattern: "SIMULATED_SCENARIO",
      action: insight,
      successCount: 1, // Artificial starting weight
      lastUsed: Date.now(),
      impact: 0.5
    };

    // 3. Update learning engine context
    // We add a 'dreamReward' that the AdaptiveLearningModule can pick up
    const dreamReward = context.dreamStrength || 0.5;

    // 4. Report results to logs
    return {
      ...context,
      dreamReward,
      strategies: [...strategies, newStrategy].slice(-30),
      logs: [...(context.logs || []), `[DREAM_INTEGRATION] Synaptic weight adjustment applied for simulated lesson.`]
    };
  }
};
