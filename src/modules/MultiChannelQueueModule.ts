import { CortexModule, ModuleType } from '../include/types';

const DEFAULT_PENDING_FEEDBACK = `[SYSTEM MESSAGE]: Koneksi saraf batin Yuihime dengan kognisi LLM sedang sangat padat atau terputus sementara 📡. Tapi jangan khawatir! Pesanmu ("\${inputPreview}") sudah aman dalam antrean tunggu kognisi Yui. Yui akan membalas secara otomatis setelah tautan saraf sinkron kembali! 🌸`;

/**
 * Settings holder for the Multi-Channel Queue pending-wait feedback.
 * The queue logic lives in src/core/kernel/MultiChannelQueue.ts and reads its
 * configuration from SettingsManager under the 'multi-channel-queue' key.
 * This module only exposes those settings to the dynamic Settings UI.
 */
export const MultiChannelQueueModule: CortexModule = {
  metadata: {
    id: 'multi-channel-queue',
    name: 'yui-queue: Multi-Channel Queue',
    description: 'Unified cross-channel message queue. Controls the pending-wait feedback shown when the LLM connection is busy or offline.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 4: EXPRESSION',
    order: 99,
    trigger: () => false,
    configSchema: {
      fields: {
        enablePendingFeedbackMessage: {
          type: 'boolean',
          label: 'Enable Pending Feedback Message',
          default: false,
          description: 'When ON, Yui sends a "[SYSTEM MESSAGE]" notice that the message is safely queued and will be answered once the LLM link recovers. When OFF (default), no feedback is sent.'
        },
        pendingFeedbackMessage: {
          type: 'textarea',
          label: 'Pending Feedback Message',
          default: DEFAULT_PENDING_FEEDBACK,
          description: 'Message shown when a message is queued after retries are exhausted. Use the ${inputPreview} variable for a short preview of the user message.'
        }
      }
    }
  },
  run: async (input: string, state: any, context: any) => ({ ...context })
};
