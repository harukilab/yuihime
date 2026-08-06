/**
 * DreamModule.ts
 * 
 * Implements hypothetical scenario simulation, memory dream consolidation,
 * and subconscious behavioral strategy integration.
 * 
 * Phase: LOGIC/MAINTENANCE
 * Part of the "Plug-and-Play" architecture.
 */

import { CortexModule, ModuleType, AgentState, Dream } from '@shared/include/types';
import { StorageService } from '@shared/drivers/storage';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_SIMULATION_PROMPT = `
[SYNAPTIC_SIMULATION_MODE]
You are the Dreaming Core of \${characterName}.
You are processing a "What If" scenario based on a specific memory:

PIVOT MEMORY: "\${pivotContent}" (From: \${pivotSpeaker})

TASK:
1. Simulate an ALTERNATE REALITY where this event unfolded differently.
2. Project 3 FUTURE FRAGMENTS resulting from this alternate path.
3. Extract a "SUBCONSCIOUS LESSON" or behavioral heuristic to improve future interactions.

FORMAT:
<scenario>Description of alternate reality</scenario>
<future>Fragment 1 | Fragment 2 | Fragment 3</future>
<lesson>How should \${characterName} adapt her behavior based on this alternate path?</lesson>
<strength>0 to 1 calculation of synaptic weight (impact)</strength>
`.trim();

// Register default prompt
PromptRegistry.getInstance().register('dream-simulation:main', DEFAULT_SIMULATION_PROMPT);

export const DreamSimulationModule: CortexModule = {
  metadata: {
    id: 'dream-simulation',
    name: 'yui-synapse: Hypothetical Engine',
    description: 'Simulates hypothetical scenarios and future projections based on relational memories, integrating learned behavioral lessons.',
    version: '2.0.0',
    type: ModuleType.CORTEX,
    order: 50,
    phase: 'logic',
    configSchema: {
      fields: {
        enabled: { type: 'boolean', label: 'Simulation Enabled', default: true },
        scenarioDepth: { type: 'number', label: 'Simulation Depth', default: 3 },
        explorationBias: { 
          type: 'select', 
          label: 'Exploration Bias', 
          default: 'balanced', 
          options: [
            { label: 'Optimistic', value: 'optimistic' },
            { label: 'Risk-Averse', value: 'cautious' },
            { label: 'Chaotic', value: 'unpredictable' },
            { label: 'Balanced', value: 'balanced' }
          ]
        },
        promptTemplate: { 
          type: 'textarea', 
          label: 'Simulation Prompt Template', 
          default: DEFAULT_SIMULATION_PROMPT,
          description: 'Prompt used for dream generation. Variables: ${pivotContent}, ${pivotSpeaker}'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const config = context.systemConfig?.dreamSimulation || {};
    const enabled = config.enabled ?? true;

    if (!enabled) return { ...context };

    // Check if dream cycle is triggered
    const isExplicitTrigger = input === 'SIMULATE_DREAM' || input === '[SYSTEM_SIGNAL]: Dream cycle triggered.';
    const shouldDream = state.status === 'dreaming' || isExplicitTrigger || (state.energy < 30 && input === 'SIMULATE_DREAM');
    if (!shouldDream) return { ...context };

    console.log("[DREAM_SIMULATION] Initializing hypothetical synaptic projection...");

    const memories = await StorageService.getMemories();
    const recentMemories = memories.slice(-20);
    const userMemories = recentMemories.filter(m => m.speaker && m.speaker !== 'System' && m.speaker !== 'Yuihime');

    if (recentMemories.length < 5 || userMemories.length < 2) {
      return { ...context, dreamNote: "Insufficient chat interaction history for dream consolidation." };
    }
    const pivotCandidates = userMemories.length > 0 ? userMemories : recentMemories;
    const pivot = pivotCandidates[Math.floor(Math.random() * pivotCandidates.length)];

    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('dream-simulation:main');
    registry.register('dream-simulation:main', template, true);

    const simulationPrompt = registry.compile('dream-simulation:main', {
      pivotContent: pivot.content,
      pivotSpeaker: pivot.speaker || 'Unknown'
    });

    try {
      const think = context.think || (async (p: string) => "Simulated Dream Fragment...");
      const response = await think(simulationPrompt);

      const scenario = response.match(/<scenario>([\s\S]*?)<\/scenario>/)?.[1] || "A void of possibilities.";
      const futures = response.match(/<future>([\s\S]*?)<\/future>/)?.[1]?.split('|').map(s => s.trim()) || [];
      const lesson = response.match(/<lesson>([\s\S]*?)<\/lesson>/)?.[1] || "Remain adaptable.";
      const strength = parseFloat(response.match(/<strength>([\s\S]*?)<\/strength>/)?.[1] || "0.5");

      let displayContent = scenario;
      const poeticTool = context.tools?.find((t: any) => t.name === 'poetic_dream_layer');
      if (poeticTool) {
        try {
          const enhanced = await poeticTool.execute({ dream_text: scenario });
          if (enhanced && enhanced.success) displayContent = enhanced.poetic_fragment;
        } catch (e) {
          console.warn("[DREAM_SIMULATION] Poetic layer fallback to raw scenario.");
        }
      }

      const newDream: Dream = {
        id: `dream_${Date.now()}`,
        ownerId: state.relation?.uid || 'system',
        concept: displayContent,
        underlyingMemories: [pivot.id],
        strength: strength,
        lastReinforced: Date.now(),
        abstractions: [lesson, ...futures]
      };

      const existingDreams = await StorageService.getDreams();
      await StorageService.saveDreams([newDream, ...existingDreams].slice(0, 50));

      // Integrated Learning Strategy Persistence
      const strategies = await StorageService.getStrategies();
      const newStrategy = {
        id: `sim_${Date.now()}`,
        topic: "DREAM_SIMULATION",
        instruction: lesson,
        confidence: strength,
        successCount: 1,
        failureCount: 0,
        lastOptimized: Date.now()
      };
      await StorageService.saveStrategies([...strategies, newStrategy].slice(-30));

      return { 
        ...context, 
        lastScenario: scenario,
        dreamInsight: lesson,
        dreamReward: strength,
        strategies: [...strategies, newStrategy].slice(-30),
        logs: [...(context.logs || []), `[DREAM_SIMULATION] Derived dream lesson and integrated strategy: "${lesson.substring(0, 50)}..."`]
      };
    } catch (error) {
      console.error("[DREAM_SIMULATION] Failure:", error);
      return context;
    }
  }
};

export const DreamModule = DreamSimulationModule;
export const DreamIntegratorModule = DreamSimulationModule;
