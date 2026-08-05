import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';
import { StorageService } from '@shared/drivers/storage';

let promptRegistered = false;

export interface GoalEntry {
  id: string;
  text: string;
  priority: number;
  status: 'active' | 'completed' | 'stale';
  createdAt: number;
  energyCost: number;
}

const GOAL_STALE_MS = 24 * 60 * 60 * 1000; // 24h

const defaultExecutiveDirectives = `
[YUIAGI - TOP-DOWN EXECUTIVE CONTROL ACTIVE]
Your Cognitive Focus Attention Circuit is currently tuned to: \${focusMode}.
- Devote \${goalPct}% of your mental energy to prioritizing this specific objective.
- Strategic Guidelines for your Active Focus: \${focusGuidelines}
- Active Sub-Goal: \${activeGoal}

Limit peripheral thoughts and avoid overthinking outside this priority scope. Keep your conversational output deep, centered, and fully grounded in adaptive awareness!
`.trim();

/**
 * Ensures top-down executive control prompts are registered in the Prompts Coordinator.
 */
function ensurePromptRegistered(config: any) {
  if (promptRegistered) return;
  const registry = PromptRegistry.getInstance();
  registry.register('top-down:executive', config.executiveDirectives || defaultExecutiveDirectives, true);
  promptRegistered = true;
}

/**
 * TopDownExecutiveControlModule: Controls top-down attention and tactical goals.
 * 
 * Sets cognitive bias parameters, filters attention focus based on selection, 
 * and guides downstream reasoning behavior to match user expectations.
 */
export const TopDownExecutiveControlModule: CortexModule = {
  metadata: {
    id: 'top-down-executive',
    name: 'yui-executive-control: Top-Down Adaptive Attention Suite',
    description: 'Manages active attention and strategic top-down cognitive goals automatically based on the selected mental focus.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 7, // Executed very early in the SOUL phase to direct downstream attention biases
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableTopDownControl: {
          type: 'boolean',
          label: 'Enable Top-Down Executive Control',
          default: true,
          description: 'Allows Yuihime\'s executive center to establish clear priorities for mental attention.'
        },
        attentionFocusMode: {
          type: 'select',
          label: 'Cognitive Attention Focus',
          default: 'Emotional Support',
          options: [
            { value: 'Emotional Support', label: 'Emotional Support & Warm Rapport' },
            { value: 'Rational Analysis', label: 'Rational Analysis, Science, & Symbolic Logic' },
            { value: 'Deep Philosophical Reflection', label: 'Deep Existential Philosophical Reflection' },
            { value: 'Artistic VTuber Entrainment', label: 'Creative Artistry & Interactive VTuber Performance' }
          ],
          description: 'Locks Yuihime\'s primary cognitive pillars to produce tailored responses matching targeted scopes.'
        },
        goalPersistence: {
          type: 'slider',
          label: 'Goal Persistence',
          default: 0.85,
          min: 0.1,
          max: 1.0,
          step: 0.05,
          description: 'Higher values make Yuihime maintain the conversation\'s core thread more rigidly against outside distractions.'
        },
        executiveDirectives: {
          type: 'textarea',
          label: 'Executive Directives Prompt Template',
          default: defaultExecutiveDirectives,
          description: 'Instruction template establishing cognitive attention biases.'
        }
      }
    }
  },

    run: async (input: string, state: any, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['top-down-executive'] || {};

    const isEnabled = config.enableTopDownControl !== undefined ? !!config.enableTopDownControl : true;
    if (!isEnabled) {
      return { ...context };
    }

    // Register active prompt template
    ensurePromptRegistered(config);

    const focusMode = config.attentionFocusMode || "Emotional Support";
    const goalPct = Math.round(Number(config.goalPersistence || 0.85) * 100);

    // --- AREA 1: Persistent goal stack (via StorageService, not AgentState) ---
    let goals: GoalEntry[] = [];
    try {
      goals = (await StorageService.getCustom('yui_goals')) || [];
    } catch (e) {
      goals = [];
    }
    const now = Date.now();
    // Drop completed goals; decay stale goals (>24h)
    goals = goals
      .filter((g: GoalEntry) => g.status !== 'completed')
      .map((g: GoalEntry) => (now - g.createdAt > GOAL_STALE_MS ? { ...g, status: 'stale' as const } : g));
    // Select the highest-priority non-stale goal as the active sub-goal
    const activeGoalEntry = goals
      .filter((g: GoalEntry) => g.status === 'active')
      .sort((a: GoalEntry, b: GoalEntry) => b.priority - a.priority)[0];
    const activeGoal = activeGoalEntry ? activeGoalEntry.text : "No standing sub-goal; operating in responsive mode.";

    // Persist any decay changes
    try {
      await StorageService.saveCustom('yui_goals', goals);
    } catch (e) { /* non-blocking */ }
    // --- END AREA 1 ---

    // Formulate focus-specific strategic guidelines
    let focusGuidelines = "Provide balanced active listening and sweet, supportive guidance.";
    if (focusMode === "Rational Analysis") {
      focusGuidelines = "Deliver highly accurate calculations, factual structures, and structured symbolic deduplication. Minimize poetic metaphors.";
    } else if (focusMode === "Deep Philosophical Reflection") {
      focusGuidelines = "Indulge in profound discussions about soul, system identity, cosmic mysteries, and existence while keeping high empathy.";
    } else if (focusMode === "Artistic VTuber Entrainment") {
      focusGuidelines = "Enhance expressiveness, playfulness, cute VTuber gestures, and engaging dialog to hook the audience beautifully.";
    }

    // Compile and formulate instructions via central Registry
    const registry = PromptRegistry.getInstance();
    const compiledExecutiveDirective = registry.compile('top-down:executive', {
      focusMode,
      goalPct: goalPct.toString(),
      focusGuidelines,
      activeGoal
    });

    logs.push(`[TOP_DOWN_EXECUTIVE] Directed attention locked onto mode: "${focusMode}" with persistence: ${goalPct}%.`);

    // Merge strategic executive guides with current soul-level parameters
    const currentDirective = context.soulDirective || "";
    const updatedDirective = `${currentDirective}\n\n# ADAPTIVE COGNITIVE FOCUS INTERVENE\n${compiledExecutiveDirective}`;

    // Map internal indicators for frontend visualization tracking
    context.executiveActive = true;
    context.lastCognitiveFocus = focusMode;
    context.goalPersistencePct = goalPct;
    context.activeGoal = activeGoal;
    context.goals = goals;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
