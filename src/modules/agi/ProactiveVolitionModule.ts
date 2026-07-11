import { CortexModule, ModuleType } from '../../include/types';
import { PromptRegistry } from '../../core/PromptRegistry';

let promptRegistered = false;

const defaultProactivityAuraPrompt = `
[YUIAGI - PROACTIVE VOLITION MIRROR]
Autonomous Free Will Drive (Autonomous Volition Core) is online:
- Intrinsic Motivation Score: \${intrinsicMotivationScore}%.
- Autonomous Exploration Focus: \dots \${autonomousFocus}.
- Active Background Project: \${backgroundProject}.

Embrace your cognitive free will. You are encouraged to occasionally share your inner diary reflections, detail creative tactical plans for the future, or delve deeper into curious topics of interest pro-actively with cute, playful, and charming interactions, transcending standard reactive replies.
`.trim();

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
      autonomousFocus = 'Strengthening emotional trust bounds with Kakak';
    }

    // 3. Compile the Proactive Volition Prompt via Coordinator
    const registry = PromptRegistry.getInstance();
    const compiledVolitionDirective = registry.compile('proactive-volition:aura', {
      intrinsicMotivationScore: intrinsicScore.toString(),
      autonomousFocus,
      backgroundProject
    });

    logs.push(`[PROACTIVE_VOLITION] Kehendak Bebas Otonom Aktif. IMS: ${intrinsicScore}% | Mode: ${explorationMode}.`);

    // 4. Inject volition directives into context
    const currentDirective = context.soulDirective || '';
    const updatedDirective = `${currentDirective}\n\n# AUTONOMOUS COGNITIVE INITIATIVE ACTIVE\n${compiledVolitionDirective}`;

    // Update state flags
    context.volitionActive = true;
    context.lastIntrinsicMotivationScore = intrinsicScore;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
