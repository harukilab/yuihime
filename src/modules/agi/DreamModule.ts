/**
 * DreamModule.ts
 * 
 * Implements the "Hypothetical Scenario Simulation" logic.
 * This module allows the agent to explore "what if" scenarios and 
 * future projections based on existing memories.
 * 
 * Phase: LOGIC/MAINTENANCE
 * Part of the "Plug-and-Play" architecture.
 */

import { CortexModule, ModuleType, AgentState, Dream, Memory } from '../../include/types';
import { StorageService } from '../../drivers/storage';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_SIMULATION_PROMPT = `
[SYNAPTIC_SIMULATION_MODE]
You are the Dreaming Core of Yuihime.
You are processing a "What If" scenario based on a specific memory:

PIVOT MEMORY: "\${pivotContent}" (From: \${pivotSpeaker})

TASK:
1. Simulate an ALTERNATE REALITY where this event went differently (e.g., a conflict escalated, or a missed connection was made).
2. Project 3 FUTURE FRAGMENTS resulting from this alternate path.
3. Extract a "SUBGOGNITIVE LESSON" or behavioral heuristic that can be used to improve future interactions.

FORMAT:
<scenario>Description of alternate reality</scenario>
<future>Fragment 1 | Fragment 2 | Fragment 3</future>
<lesson>How should Yuihime adapt her behavior based on this specific alternate path?</lesson>
<strength>0 to 1 calculation of synaptic weight (impact)</strength>
`.trim();

// Register the default prompt
PromptRegistry.getInstance().register('dream-simulation:main', DEFAULT_SIMULATION_PROMPT);

export const DreamSimulationModule: CortexModule = {
  metadata: {
    id: 'dream-simulation',
    name: 'yui-synapse: Hypothetical Engine',
    description: 'Simulates hypothetical scenarios and future projections based on relational memories.',
    version: '1.2.0',
    type: ModuleType.CORTEX,
    order: 50,
    phase: 'LOGIC',
    configSchema: {
      fields: {
        enabled: { type: 'boolean', label: 'Simulation Enabled', default: true },
        scenarioDepth: { type: 'number', label: 'Simulation Depth', default: 3 },
        explorationBias: { type: 'select', label: 'Exploration Bias', default: 'balanced', options: [
          { label: 'Optimistic', value: 'optimistic' },
          { label: 'Risk-Averse', value: 'cautious' },
          { label: 'Chaotic', value: 'unpredictable' },
          { label: 'Balanced', value: 'balanced' }
        ]},
        promptTemplate: { 
          type: 'textarea', 
          label: 'Simulation Prompt Template', 
          default: DEFAULT_SIMULATION_PROMPT,
          description: 'The prompt used to generate dreams. Use ${pivotContent} and ${pivotSpeaker} as variables.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    // 1. Load configuration from context or fallbacks
    const config = context.systemConfig?.dreamSimulation || {};
    const enabled = config.enabled ?? true;
    const hypotheticalPivotProb = config.hypotheticalPivotProbability ?? 0.3;

    if (!enabled) return { ...context };

    // 2. Check if it's time to dream (Energy low, periodic trigger, or explicit command)
    // Avoid running active dreams synchronously on standard chat inputs to prevent massive latency
    const isExplicitTrigger = input === 'SIMULATE_DREAM' || input === '[SYSTEM_SIGNAL]: Dream cycle triggered.';
    const shouldDream = state.status === 'dreaming' || isExplicitTrigger || (state.energy < 30 && input === 'SIMULATE_DREAM');
    if (!shouldDream) return { ...context };

    console.log("[DREAM_SIMULATION] Initializing hypothetical synaptic projection...");

    // 3. Fetch context for simulation
    const memories = await StorageService.getMemories();
    const recentMemories = memories.slice(-20); // Deep context for simulation
    
    if (recentMemories.length < 3) {
        return { ...context, dreamNote: "Insufficient neural echoes for simulation." };
    }

    // 4. Select a pivot memory
    const userMemories = recentMemories.filter(m => m.speaker && m.speaker !== 'System' && m.speaker !== 'Yuihime');
    const pivotCandidates = userMemories.length > 0 ? userMemories : recentMemories;
    const pivot = pivotCandidates[Math.floor(Math.random() * pivotCandidates.length)];

    // 5. Construct Simulation Prompt using Registry and Config
    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('dream-simulation:main');
    
    // Register the potentially updated template from config back to registry for global awareness
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

      // 6. Optional: Enhance with poetic addon if available
      let displayContent = scenario;
      const poeticTool = context.tools?.find((t: any) => t.name === 'poetic_dream_layer');
      if (poeticTool) {
         try {
           const enhanced = await poeticTool.execute({ dream_text: scenario });
           if (enhanced && enhanced.success) displayContent = enhanced.poetic_fragment;
         } catch (e) {
           console.warn("[DREAM_SIMULATION] Poetic layer failed, using raw scenario.");
         }
      }

      // 7. Build Dream Object
      const newDream: Dream = {
        id: `dream_${Date.now()}`,
        ownerId: state.relation?.uid || 'system',
        concept: displayContent,
        underlyingMemories: [pivot.id],
        strength: strength,
        lastReinforced: Date.now(),
        abstractions: [lesson, ...futures]
      };

      // 8. Persist Dream
      const existingDreams = await StorageService.getDreams();
      await StorageService.saveDreams([newDream, ...existingDreams].slice(0, 50));

      // 9. Inject Lesson/Insight into context for downstream "learning" modules
      return { 
        ...context, 
        lastScenario: scenario,
        dreamInsight: lesson,
        logs: [...(context.logs || []), `[DREAM_SIMULATION] Simulated scenario derived from memory ${pivot.id.substring(0,4)}. Lesson: ${lesson.substring(0,50)}...`]
      };
    } catch (error) {
      console.error("[DREAM_SIMULATION] Failure:", error);
      return context;
    }
  }
};
