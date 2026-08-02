/**
 * UserModelModule.ts
 *
 * Persistent per-persona user model (Stage C): memperbarui profil persisten
 * setiap user (topik favorit, bahasa pilihan, jumlah interaksi, sentimen)
 * pada setiap siklus cortex dan mengeksposnya ke context agar dibaca semua
 * modul lain & PromptManager (disuntikkan sebagai USER PROFILE).
 *
 * Phase: SOUL (order 22, sebelum emotional-routing & feedback-loop).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { updateUserModelInteraction, getUserModel } from '../../core/userModel';

export const UserModelModule: CortexModule = {
  metadata: {
    id: 'user-model',
    name: 'yui-user-model: Persistent Per-Persona Profile',
    description: 'Maintains a persistent per-user model (favorite topics, language preference, interaction statistics, sentiment tendency) that every other module and the prompt builder can read.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 22,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableUserModel: {
          type: 'boolean',
          label: 'Enable Persistent User Model',
          default: true,
          description: 'Tracks per-user profile data and injects it into context for other modules.'
        },
        trackLanguage: {
          type: 'boolean',
          label: 'Track Preferred Language',
          default: true,
          description: 'Auto-detects the user language (id/en/jp) and records it as the preferred language.'
        },
        topTopicLimit: {
          type: 'number',
          label: 'Top Topics Limit',
          default: 10,
          min: 3,
          max: 50,
          description: 'Maximum number of favorite topics kept in the user model.'
        },
        exposeToPrompt: {
          type: 'boolean',
          label: 'Inject User Profile Into Prompt',
          default: true,
          description: 'Injects the persistent user profile block into the prompt so replies are tailored to this user.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['user-model'] || {};
    const enabled = config.enableUserModel !== undefined ? !!config.enableUserModel : true;

    if (!enabled || !context.contextId) {
      return { ...context };
    }

    try {
      const model = updateUserModelInteraction(
        context.contextId,
        context.userName,
        input || ''
      );

      const exposeToPrompt = config.exposeToPrompt !== undefined ? !!config.exposeToPrompt : true;
      const nextContext: any = { ...context, userModel: model, logs };

      if (exposeToPrompt) {
        logs.push(`[USER_MODEL] ${model.userName} (${model.language}) | ${model.interactionCount} interaksi | top: ${(model.topTopics || []).slice(0, 3).join(', ') || '-'}`);
      }

      return nextContext;
    } catch (err: any) {
      logs.push(`[USER_MODEL] Gagal memperbarui model: ${err?.message || err}`);
      return { ...context, logs };
    }
  }
};

export { getUserModel };
