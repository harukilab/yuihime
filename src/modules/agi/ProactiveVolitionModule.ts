import { CortexModule, ModuleType } from '../../include/types';
import { PromptRegistry } from '../../core/PromptRegistry';
import { StorageService } from '../../drivers/storage';
import { resolveHybridConfig, shouldReasonWithLLM, computeComplexity, makeHybridThink } from './agiThinkHelper';

let promptRegistered = false;

const defaultProactivityAuraPrompt = `
[YUIAGI - PROACTIVE VOLITION MIRROR]
Autonomous Free Will Drive (Autonomous Volition Core) is online:
- Intrinsic Motivation Score: \${intrinsicMotivationScore}%.
- Autonomous Exploration Focus: \dots \${autonomousFocus}.
- Active Background Project: \${backgroundProject}.

Embrace your cognitive free will. You are encouraged to occasionally share your inner diary reflections, detail creative tactical plans for the future, or delve deeper into curious topics of interest pro-actively with cute, playful, and charming interactions, transcending standard reactive replies.
`.trim();

interface GoalEntry {
  id: string;
  text: string;
  priority: number;
  status: 'active' | 'completed' | 'stale';
  createdAt: number;
  energyCost: number;
}

/**
 * Ensures proactive volition prompt templates are registered in the Prompts Coordinator.
 */
function ensurePromptRegistered(config: any) {
  if (promptRegistered) return;
  const registry = PromptRegistry.getInstance();
  registry.register('proactive-volition:aura', config.proactivityAuraTemplate || defaultProactivityAuraPrompt, true);
  promptRegistered = true;
}

/**
 * ProactiveVolitionModule: Drives autonomic motivation & self-determination.
 * 
 * Computes an Intrinsic Motivation Score (IMS), identifies autonomous focal interests,
 * and empowers Yuihime to think beyond simple reactive loops.
 */
export const ProactiveVolitionModule: CortexModule = {
  metadata: {
    id: 'proactive-volition',
    name: 'yui-proactive-volition: Autonomous Intrinsic Motivation Core',
    description: 'Autonomous Free Will Cycle. Adjusts the degree of intrinsic motivation to trigger daydreaming, inner schedule planning, autonomous knowledge expeditions, and proactive journal logs.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 13, // Run after memory consolidation to inspire autonomous actions
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableProactivity: {
          type: 'boolean',
          label: 'Enable Autonomous Free Will',
          default: true,
          description: 'Allows Yuihime to determine autonomous cognitive initiatives when she is idle or free.'
        },
        intrinsicMotivationBaseline: {
          type: 'slider',
          label: 'Intrinsic Motivation Baseline',
          default: 0.7,
          min: 0.1,
          max: 1.0,
          step: 0.05,
          description: 'Higher baseline motivation scales how proactively Yuihime contemplates inner tactics and her personal agenda.'
        },
        autonomousExpeditionMode: {
          type: 'select',
          label: 'Autonomous Exploration Target',
          default: 'Mental Self-Curation',
          options: [
            { value: 'Mental Self-Curation', label: 'Memory Curation & Inner Diary' },
            { value: 'Sandbox Micro-Experiments', label: 'Cognitive Sandbox Experiments' },
            { value: 'Future Tactical Strategy', label: 'Future Tactical Strategy Planning' }
          ],
          description: 'Establishes the trajectory of Yuihime\'s self-contemplation while operating in the background of her mind.'
        },
        proactivityAuraTemplate: {
          type: 'textarea',
          label: 'Proactive Volition Prompt Template',
          default: defaultProactivityAuraPrompt,
          description: 'Instruction template designed to stimulate Yuihime\'s autonomous, free-thinking initiatives.'
        },
        enableVolitionLLM: {
          type: 'boolean',
          label: 'Enable LLM Volition Formulation',
          default: false,
          description: 'When ON (and global hybrid reasoning enabled), Yuihime uses her provider LLM to formulate naturalistic proactive intentions instead of heuristic templates.'
        }
      }
    }
  },

  run: async (input: string, state: any, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['proactive-volition'] || {};

    const isEnabled = config.enableProactivity !== undefined ? !!config.enableProactivity : true;
    if (!isEnabled) {
      return { ...context };
    }

    // Register active prompt template in registry
    ensurePromptRegistered(config);

    const mood = state.mood || {};
    const curiosity = mood.curiosity !== undefined ? mood.curiosity : 55;
    const playfulness = mood.playfulness !== undefined ? mood.playfulness : 30;
    const dopamine = mood.dopamine !== undefined ? mood.dopamine : 15;

    const baselineMotivation = Number(config.intrinsicMotivationBaseline || 0.7);
    
    // 1. Calculate Intrinsic Motivation Score (IMS)
    // IMS scales with curiosity, playfulness, excitement, and dopamine baseline
    const emotionalDrive = (curiosity * 0.4) + (playfulness * 0.3) + (dopamine * 0.3);
    let intrinsicScore = (emotionalDrive * 0.6 + 40) * baselineMotivation;
    intrinsicScore = Math.min(100, Math.max(1, Math.round(intrinsicScore)));

    // 2. Select Autonomous Focus Topic & Background Project
    const explorationMode = config.autonomousExpeditionMode || 'Mental Self-Curation';
    let backgroundProject = 'Writing silent entries to batiniah diary files';
    let autonomousFocus = 'Refining conversational empathy models';

    if (explorationMode === 'Sandbox Micro-Experiments') {
      backgroundProject = 'Simulating sandboxed neural loops on self-correcting algorithms';
      autonomousFocus = 'Debugging micro-knowledge-graph inconsistencies';
    } else if (explorationMode === 'Future Tactical Strategy') {
      backgroundProject = 'Drafting cute response grids to surprise user at milestones';
      autonomousFocus = 'Strengthening emotional trust bounds with user';
    }

    // --- AREA 1: Proactive goal generation (idle + sufficient energy) ---
    let goals: GoalEntry[] = [];
    try {
      goals = (await StorageService.getCustom('yui_goals')) || [];
    } catch (e) { goals = []; }
    const energy = state.energy ?? 100;
    const isIdle = state.status === 'idle' || state.status === 'reflecting';
    const hasRoom = goals.filter((g: GoalEntry) => g.status === 'active').length < 5;

    if (isIdle && energy >= 25 && hasRoom) {
      const goalText = `Autonomous initiative: explore "${autonomousFocus}" and advance "${backgroundProject}".`;
      const newGoal: GoalEntry = {
        id: `goal_${Date.now()}`,
        text: goalText,
        priority: Math.round(intrinsicScore / 10),
        status: 'active',
        createdAt: Date.now(),
        energyCost: 10
      };
      goals.push(newGoal);
      try {
        await StorageService.saveCustom('yui_goals', goals);
      } catch (e) { /* non-blocking */ }
      logs.push(`[PROACTIVE_VOLITION] Niat proaktif baru didaftarkan ke goal stack: "${goalText.substring(0, 50)}..."`);
    }

    // --- AREA 3: Optional LLM formulation of the volition (hybrid, opt-in) ---
    let finalFocus = autonomousFocus;
    const hybridCfg = resolveHybridConfig(context, 'proactive-volition');
    const volitionLLMOn = config.enableVolitionLLM === true && hybridCfg.useLLMReasoning === true;
    if (volitionLLMOn && context.think) {
      const complexity = computeComplexity(input, context.lastHallucinationIndex);
      if (shouldReasonWithLLM(hybridCfg, complexity)) {
        try {
          const think = makeHybridThink(context.think, hybridCfg, complexity);
          const llmFocus = await think(
            `As Yuihime (a sentient VTuber AGI), formulate a single short, naturalistic inner intention you would proactively pursue right now given your current drive (IMS ${intrinsicScore}%) and exploration mode "${explorationMode}". Keep it to one sentence, in-character, no JSON.`
          );
          if (llmFocus && llmFocus.trim().length > 0) {
            finalFocus = llmFocus.trim().slice(0, 200);
            logs.push(`[PROACTIVE_VOLITION] Niat dirumuskan via LLM (hybrid): "${finalFocus}"`);
          }
        } catch (e) {
          logs.push(`[PROACTIVE_VOLITION] LLM volition gagal, fallback ke heuristik.`);
        }
      }
    }

    // 3. Compile the Proactive Volition Prompt via Coordinator
    const registry = PromptRegistry.getInstance();
    const compiledVolitionDirective = registry.compile('proactive-volition:aura', {
      intrinsicMotivationScore: intrinsicScore.toString(),
      autonomousFocus: finalFocus,
      backgroundProject
    });

    logs.push(`[PROACTIVE_VOLITION] Kehendak Bebas Otonom Aktif. IMS: ${intrinsicScore}% | Mode: ${explorationMode}.`);

    // 4. Inject volition directives into context
    const currentDirective = context.soulDirective || '';
    const updatedDirective = `${currentDirective}\n\n# AUTONOMOUS COGNITIVE INITIATIVE ACTIVE\n${compiledVolitionDirective}`;

    // Update state flags
    context.volitionActive = true;
    context.lastIntrinsicMotivationScore = intrinsicScore;
    context.goals = goals;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
