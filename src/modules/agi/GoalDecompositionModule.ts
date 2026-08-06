/**
 * GoalDecompositionModule.ts
 *
 * Recursive goal decomposition & closed-loop monitoring (Stage F): the SOUL module
 * reads the most relevant active goal as this cycle's focus, then
 * injects a trilingual directive into the soulDirective so Yui pushes
 * goal progress naturally in the conversation.
 *
 * Phase: SOUL (order 26, after confidence & abstain).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { getFocusGoal, buildGoalDirective, listActiveGoals, advanceGoal, goalKeywordOverlap, createGoal } from '../../core/goalDecomposition';

/**
 * Detects "add goal" requests from the user input (ID/EN/JP).
 * Returns the goal title, or null if the input is not a request.
 */
const GOAL_KEYWORD_RE = /(?:goal|target|目標|ゴール)/i;
const GOAL_COLON_RE = /[:：]\s*(.+)/;
const GOAL_ADD_PREFIX_RE = /^(?:tolong\s+)?(?:tambah|buat|bikin|add|create|set|new)\s+(?:(?:sebuah|suatu|satu|a|the|new|baru)\s+)?(?:goal|target|目標|ゴール)\b[\s:：]*(.*)$/i;

function extractGoalTitle(input: string): string | null {
  if (!input) return null;
  const text = String(input).trim();
  if (!text) return null;
  if (!GOAL_KEYWORD_RE.test(text)) return null;
  let title = '';
  const colon = text.match(GOAL_COLON_RE);
  if (colon && colon[1].trim()) {
    title = colon[1].trim();
  } else {
    const prefix = text.match(GOAL_ADD_PREFIX_RE);
    if (prefix && prefix[1].trim()) title = prefix[1].trim();
  }
  if (!title) return null;
  return title
    .replace(/^(untuk|agar|supaya|biar|to)\s+/i, '')
    .replace(/[.。!！?\s]+$/g, '')
    .slice(0, 120);
}

export const GoalDecompositionModule: CortexModule = {
  metadata: {
    id: 'goal-decomposition',
    name: 'yui-goals: Recursive Goal Decomposition & Monitoring',
    description: 'Monitors a recursive goal tree, surfaces the most relevant active goal as this cycle focus, and nudges progress naturally in conversation.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 26,
    phase: 'soul',
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

    // User request to add a goal -> create it directly as the new focus.
    let focus = getFocusGoal();
    const requestedTitle = extractGoalTitle(input);
    if (requestedTitle) {
      const created = createGoal({ title: requestedTitle, category: 'user-request' });
      if (created) {
        logs.push(`[GOAL_CREATE] User request -> new goal: "${created.title}" (${created.id})`);
        focus = created;
      } else {
        logs.push(`[GOAL_CREATE] Failed to create goal from request: "${requestedTitle}"`);
      }
    }

    if (!focus) {
      return { ...context };
    }

    let nextContext: any = { ...context, currentGoal: focus, logs };

    // Closed-loop monitoring: the conversation touches the goal topic -> nudge it forward a bit
    const autoAdvance = config.autoAdvanceOnTopic !== undefined ? !!config.autoAdvanceOnTopic : true;
    const advanceStep = Number(config.advanceStep !== undefined ? config.advanceStep : 0.05);
    if (autoAdvance && advanceStep > 0 && input) {
      const matches = goalKeywordOverlap(focus, input);
      if (matches.length > 0) {
        const advanced = advanceGoal(focus.id, advanceStep);
        if (advanced) {
          logs.push(`[GOAL_MONITOR] Topic matched (${matches.slice(0, 3).join(', ')}) -> goal "${advanced.title}" +${advanceStep}`);
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

    logs.push(`[GOAL_FOCUS] ${nextContext.currentGoal.title} (${Math.round((nextContext.currentGoal.progress || 0) * 100)}%) — ${listActiveGoals(10).length} active goals.`);
    return nextContext;
  }
};
