/**
 * AfterActionReviewModule.ts
 *
 * After-action review (Stage E): evaluates Yui's actions and stores
 * long-term lessons. Runs before feedback-loop:
 *  - if a tool fails in this cycle, record an honesty lesson (self-review),
 *  - injects already-resolved lessons into the soulDirective so that
 *    subsequent behavior is better (trilingual).
 *
 * Phase: SOUL (order 29, before feedback-loop order 30).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import {
  createToolFailureReview,
  getResolvedLessons,
  getPendingReviewCount
} from '../../core/afterActionReview';

export const AfterActionReviewModule: CortexModule = {
  metadata: {
    id: 'after-action-review',
    name: 'yui-after-action: After-Action Review Loop',
    description: 'Evaluates Yuihime actions (tool calls, replies) into long-term lessons, resolved against real user feedback, and injects the best lessons back into the mind.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 29,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableReview: {
          type: 'boolean',
          label: 'Enable After-Action Review',
          default: true,
          description: 'Records action reviews and injects resolved lessons into the mind.'
        },
        recordToolFailures: {
          type: 'boolean',
          label: 'Record Tool-Failure Lessons',
          default: true,
          description: 'Records an honesty lesson whenever a tool fails this cycle.'
        },
        injectLessons: {
          type: 'boolean',
          label: 'Inject Resolved Lessons Into Mind',
          default: true,
          description: 'Injects recently resolved after-action lessons (max 3) into the inner directives.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['after-action-review'] || {};
    const enabled = config.enableReview !== undefined ? !!config.enableReview : true;

    if (!enabled) {
      return { ...context };
    }

    let nextContext: any = { ...context, logs };
    let acted = false;

    // 1. Self-review: tool failed this cycle
    const recordFailures = config.recordToolFailures !== undefined ? !!config.recordToolFailures : true;
    const toolError = context.lastToolError || context.toolExecutionError || context.cortexValidationError;
    if (recordFailures && toolError && context.contextId) {
      const toolName = context.lastToolUsed || 'tool';
      createToolFailureReview(context.contextId, toolName, String(toolError));
      acted = true;
    }

    // 2. Inject the already-resolved lessons
    const inject = config.injectLessons !== undefined ? !!config.injectLessons : true;
    if (inject) {
      const lessons = getResolvedLessons(3);
      if (lessons.length > 0) {
        const lines = lessons.map((l: any) => `- ${l.lesson}`);
        const note = [
          '',
          '# AFTER-ACTION LESSONS (LONG-TERM)',
          '[EN] Remember the following lessons from past actions and apply them now. [ID] Ingat pelajaran berikut dari tindakan masa lalu dan terapkan sekarang. [JP] 過去の行動から得た教訓を覚えて、今に活かしてください。',
          ...lines
        ].join('\n');
        nextContext = {
          ...nextContext,
          soulDirective: `${context.soulDirective || ''}\n${note}`.trim()
        };
        acted = true;
      }
    }

    if (acted) {
      const pending = getPendingReviewCount();
      logs.push(`[AFTER_ACTION] ${pending} actions awaiting feedback evaluation.`);
    }

    return nextContext;
  }
};
