/**
 * FeedbackLoopModule.ts
 *
 * Closed-loop Learning: processes real feedback signals (Telegram reactions,
 * Web UI buttons) into long-term learned_strategies + relation adjustments,
 * then injects the latest feedback notes into the soulDirective.
 *
 * Phase: SOUL (order 30, after proactive-volition & spontaneous-proactive).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import {
  listPendingFeedback,
  markFeedbackConsumed,
  consolidateFeedbackEvent
} from '../../core/feedback';

export const FeedbackLoopModule: CortexModule = {
  metadata: {
    id: 'feedback-loop',
    name: 'yui-feedback: Closed-Loop Learning',
    description: 'Consumes real user feedback signals (Telegram reactions, Web UI buttons) and consolidates them into long-term learned strategies and relation adjustments.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 30,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableFeedbackLearning: {
          type: 'boolean',
          label: 'Enable Feedback Learning',
          default: true,
          description: 'Processes pending user feedback into long-term learned strategies.'
        },
        positiveAffectionBoost: {
          type: 'number',
          label: 'Positive Feedback Affection Boost',
          default: 1,
          min: 0,
          max: 5,
          description: 'Affection/trust increase applied when the user gives positive feedback.'
        },
        negativeAffectionPenalty: {
          type: 'number',
          label: 'Negative Feedback Affection Penalty',
          default: 2,
          min: 0,
          max: 5,
          description: 'Affection/trust decrease applied when the user gives negative feedback.'
        },
        injectFeedbackNote: {
          type: 'boolean',
          label: 'Inject Recent Feedback Into Mind',
          default: true,
          description: 'Injects a short summary of recent user feedback into the inner directives so Yui adjusts behavior this cycle.'
        },
        maxEventsPerCycle: {
          type: 'number',
          label: 'Max Feedback Events Per Cycle',
          default: 20,
          min: 1,
          max: 100,
          description: 'Maximum number of feedback events consolidated in a single cortex cycle.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['feedback-loop'] || {};
    const enabled = config.enableFeedbackLearning !== undefined ? !!config.enableFeedbackLearning : true;

    if (!enabled) {
      return { ...context };
    }

    const maxEvents = Number(config.maxEventsPerCycle || 20);
    const boost = Number(config.positiveAffectionBoost !== undefined ? config.positiveAffectionBoost : 1);
    const penalty = Number(config.negativeAffectionPenalty !== undefined ? config.negativeAffectionPenalty : 2);

    const pending = listPendingFeedback(maxEvents);
    if (pending.length === 0) {
      return { ...context };
    }

    const consumedIds: number[] = [];
    let affectionDelta = 0;
    let trustDelta = 0;
    const recentTopics: string[] = [];
    const summary: string[] = [];

    for (const event of pending) {
      try {
        const delta = consolidateFeedbackEvent(event, boost, penalty);
        affectionDelta += delta.affection;
        trustDelta += delta.trust;
        recentTopics.push(...delta.topics);
        consumedIds.push(event.id);
        const topicsStr = delta.topics.join(', ') || '(no topic)';
        const tone = event.reward > 0
          ? { en: 'User liked', id: 'User suka', jp: 'ユーザーが気に入った' }
          : event.reward < 0
            ? { en: 'User disliked', id: 'User tidak suka', jp: 'ユーザーが嫌った' }
            : { en: 'User reacted neutral', id: 'User bereaksi netral', jp: 'ユーザーは中立' };
        summary.push(`${tone.en}: ${topicsStr} | ${tone.id}: ${topicsStr} | ${tone.jp}: ${topicsStr}`);
      } catch (err: any) {
        logs.push(`[FEEDBACK_LOOP] Failed to consolidate event #${event.id}: ${err?.message || err}`);
      }
    }

    markFeedbackConsumed(consumedIds);

    if (affectionDelta !== 0 || trustDelta !== 0) {
      if (!state.relation) {
        state.relation = { uid: '', trust: 50, affection: 10, reputation: 50, lastInteraction: Date.now() } as any;
      }
      state.relation.affection = Math.max(0, Math.min(100, (state.relation.affection || 50) + affectionDelta));
      state.relation.trust = Math.max(0, Math.min(100, (state.relation.trust || 50) + trustDelta));
      state.relation.lastInteraction = Date.now();
    }

    const uniqueTopics = [...new Set(recentTopics)].slice(0, 5);
    logs.push(`[FEEDBACK_LOOP] Consolidated ${consumedIds.length} feedback. Affection ${affectionDelta >= 0 ? '+' : ''}${affectionDelta} | Trust ${trustDelta >= 0 ? '+' : ''}${trustDelta} | Topics: ${uniqueTopics.join(', ') || '-'}`);

    let nextContext: any = { ...context, feedbackConsolidated: true, logs };

    const injectNote = config.injectFeedbackNote !== undefined ? !!config.injectFeedbackNote : true;
    if (injectNote && summary.length > 0) {
      const currentDirective = context.soulDirective || '';
      const feedbackNote = [
        '',
        '# RECENT USER FEEDBACK (CLOSED-LOOP LEARNING)',
        '[EN] Your recent replies were evaluated by the user. Adjust your conversation accordingly. [ID] Balasan terakhirmu baru saja dievaluasi user, sesuaikan gaya bercakapmu. [JP] あなたの最近の返信はユーザーに評価されました。会話の仕方を調整してください。',
        ...summary.map(s => `- ${s}`)
      ].join('\n');
      nextContext = {
        ...nextContext,
        soulDirective: `${currentDirective}\n${feedbackNote}`.trim()
      };
    }

    return nextContext;
  }
};
