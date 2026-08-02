/**
 * GoalDecompositionModule.ts
 *
 * Recursive goal decomposition & closed-loop monitoring (Stage F): modul SOUL
 * membaca goal aktif yang paling relevan sebagai fokus siklus ini, lalu
 * menyuntikkan direktif trilingual ke soulDirective agar Yui mendorong
 * kemajuan goal secara alami dalam percakapan.
 *
 * Phase: SOUL (order 26, setelah confidence & abstain).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { getFocusGoal, buildGoalDirective, listActiveGoals, advanceGoal, goalKeywordOverlap } from '../../core/goalDecomposition';

export const GoalDecompositionModule: CortexModule = {
  metadata: {
    id: 'goal-decomposition',
    name: 'yui-goals: Recursive Goal Decomposition & Monitoring',
    description: 'Monitors a recursive goal tree, surfaces the most relevant active goal as this cycle focus, and nudges progress naturally in conversation.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 26,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableGoalFocus: {
          type: 'boolean',
          label: 'Enable Goal Focus Injection',
          default: true,
          description: 'Injects the current active goal focus into the mind each cycle.'
        },
        injectSubgoals: {
          type: 'boolean',
          label: 'Show Sub-Goal Progress',
          default: true,
          description: 'Includes the recursive sub-goal tree progress in the injected directive.'
        },
        autoAdvanceOnTopic: {
          type: 'boolean',
          label: 'Auto-Advance On Topic Match',
          default: true,
          description: 'Advances the focus goal progress a little when the conversation touches its topics (closed-loop monitoring).'
        },
        advanceStep: {
          type: 'number',
          label: 'Auto-Advance Step',
          default: 0.05,
          min: 0,
          max: 0.5,
          description: 'Progress delta per topic match (0 disables advancement).'
        },
        maxFocusLogs: {
          type: 'number',
          label: 'Log Frequency',
          default: 5,
          min: 1,
          max: 50,
          description: 'Only log goal focus at most every N cycles to avoid log spam.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['goal-decomposition'] || {};
    const enabled = config.enableGoalFocus !== undefined ? !!config.enableGoalFocus : true;

    if (!enabled) {
      return { ...context };
    }

    const focus = getFocusGoal();
    if (!focus) {
      return { ...context };
    }

    let nextContext: any = { ...context, currentGoal: focus, logs };

    // Closed-loop monitoring: obrolan menyentuh topik goal -> dorong maju sedikit
    const autoAdvance = config.autoAdvanceOnTopic !== undefined ? !!config.autoAdvanceOnTopic : true;
    const advanceStep = Number(config.advanceStep !== undefined ? config.advanceStep : 0.05);
    if (autoAdvance && advanceStep > 0 && input) {
      const matches = goalKeywordOverlap(focus, input);
      if (matches.length > 0) {
        const advanced = advanceGoal(focus.id, advanceStep);
        if (advanced) {
          logs.push(`[GOAL_MONITOR] Topik cocok (${matches.slice(0, 3).join(', ')}) -> goal "${advanced.title}" +${advanceStep}`);
          nextContext = { ...nextContext, currentGoal: advanced };
          if (advanced.status === 'completed') {
            nextContext = { ...nextContext, goalJustCompleted: advanced };
          }
        }
      }
    }

    const directive = buildGoalDirective(nextContext.currentGoal);
    nextContext = {
      ...nextContext,
      soulDirective: `${context.soulDirective || ''}\n${directive}`.trim()
    };

    logs.push(`[GOAL_FOCUS] ${nextContext.currentGoal.title} (${Math.round((nextContext.currentGoal.progress || 0) * 100)}%) — ${listActiveGoals(10).length} goal aktif.`);
    return nextContext;
  }
};
