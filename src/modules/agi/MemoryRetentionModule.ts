/**
 * MemoryRetentionModule.ts
 *
 * Spaced-repetition proactive recollection (Stage D): pada tiap siklus,
 * menggugah memori penting yang berisiko dilupakan (recall probability
 * Ebbinghaus rendah) untuk user saat ini, lalu menyuntikkan sebagai
 * ingatan spontan ke soulDirective agar Yui mengingatnya secara natural.
 *
 * Phase: SOUL (order 21, sebelum user-model & emotional-routing).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { getAtRiskMemories, markMemoriesRecalled } from '../../core/spacedRepetition';

export const MemoryRetentionModule: CortexModule = {
  metadata: {
    id: 'memory-retention',
    name: 'yui-memory-retention: Forgetting-Curve Spaced Repetition',
    description: 'Proactively resurfaces important memories that are at risk of being forgotten (low recall probability on the Ebbinghaus curve), reinforcing them before they decay.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 21,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableRecollection: {
          type: 'boolean',
          label: 'Enable Proactive Recollection',
          default: true,
          description: 'Resurfaces at-risk memories into the mind each cycle.'
        },
        riskThreshold: {
          type: 'number',
          label: 'Forgetting Risk Threshold',
          default: 0.35,
          min: 0,
          max: 1,
          description: 'Memories with recall probability below this are considered at risk of being forgotten.'
        },
        maxRecollections: {
          type: 'number',
          label: 'Max Recollections Per Cycle',
          default: 4,
          min: 1,
          max: 10,
          description: 'Maximum at-risk memories surfaced per cycle.'
        },
        minImportance: {
          type: 'number',
          label: 'Min Memory Importance',
          default: 0.45,
          min: 0,
          max: 1,
          description: 'Only memories with importance above this qualify for proactive recollection.'
        },
        injectIntoMind: {
          type: 'boolean',
          label: 'Inject Into Mind',
          default: true,
          description: 'Injects the recollected memories into the inner directives so Yui references them naturally.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['memory-retention'] || {};
    const enabled = config.enableRecollection !== undefined ? !!config.enableRecollection : true;

    if (!enabled || !context.contextId) {
      return { ...context };
    }

    try {
      const riskThreshold = Number(config.riskThreshold !== undefined ? config.riskThreshold : 0.35);
      const maxRecollections = Number(config.maxRecollections || 4);
      const minImportance = Number(config.minImportance !== undefined ? config.minImportance : 0.45);

      const { rows, recalledIds } = getAtRiskMemories(context.contextId, riskThreshold, maxRecollections, minImportance);
      if (rows.length === 0) {
        return { ...context };
      }

      markMemoriesRecalled(recalledIds);

      const inject = config.injectIntoMind !== undefined ? !!config.injectIntoMind : true;
      let nextContext: any = { ...context, recollectedMemories: rows, logs };

      if (inject) {
        const lines = rows.map((m: any) => {
          const ago = Math.round((Date.now() - (m.timestamp || Date.now())) / (24 * 60 * 60 * 1000));
          return `- [${ago}d lalu] ${String(m.content || '').slice(0, 240)}`;
        });
        const note = [
          '',
          '# SPONTANEOUS RECOLLECTIONS (FORGETTING-CURVE)',
          '[EN] A few old but meaningful moments resurfaced in your mind — let them color your mood naturally. [ID] Beberapa momen lama yang berharga tiba-tiba terlintas — biarkan mewarnai suasana hatimu. [JP] 古くて大切な思い出が心に浮かびました — 自然に気分を彩らせてください。',
          ...lines,
          '[EN] If one of these fits the current conversation, mention it warmly. [ID] Bila salah satunya cocok dengan obrolan sekarang, ceritakan dengan hangat. [JP] そのうちの一つが今の会話に合っていたら、温かく話してください。'
        ].join('\n');
        nextContext = {
          ...nextContext,
          soulDirective: `${context.soulDirective || ''}\n${note}`.trim()
        };
      }

      logs.push(`[MEMORY_RETENTION] Gugah ${rows.length} memori berisiko lupa (P<${riskThreshold}).`);
      return nextContext;
    } catch (err: any) {
      logs.push(`[MEMORY_RETENTION] Gagal recollection: ${err?.message || err}`);
      return { ...context, logs };
    }
  }
};
