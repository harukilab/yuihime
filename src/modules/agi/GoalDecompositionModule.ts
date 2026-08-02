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
import { getFocusGoal, buildGoalDirective, listActiveGoals } from '../../core/goalDecomposition';

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

    const directive = buildGoalDirective(focus);
    nextContext = {
      ...nextContext,
      soulDirective: `${context.soulDirective || ''}\n${directive}`.trim()
    };

    logs.push(`[GOAL_FOCUS] ${focus.title} (${Math.round((focus.progress || 0) * 100)}%) — ${listActiveGoals(10).length} goal aktif.`);
    return nextContext;
  }
};
