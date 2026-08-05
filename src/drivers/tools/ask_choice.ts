import { ToolModule } from '@shared/include/types';
import { askTelegramChoice } from '../../core/kernel/tgAskChoice.js';

const manifest = {
  id: 'ask_choice',
  name: 'Ask Choice (Telegram inline buttons)',
  description:
    'Send the user an interactive question in Telegram with inline choice buttons and wait for their answer. Use this to offer the user a selection during a task (which file to edit, proceed or cancel, which option to pick, confirm an action). Works only in Telegram chats; in other channels it returns an error so ask in plain text instead. The answer is returned to you as the chosen option label.',
  version: '1.0.0',
  type: 'TOOL',
  order: 51,
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question shown to the user (concise)' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 6 short answer options; each becomes one button label'
      },
      timeout: {
        type: 'number',
        description: 'Seconds to wait for an answer (default 120, max 300)'
      },
      default_option: {
        type: 'number',
        description: '0-based index of the option to use as fallback when the user does not answer (optional)'
      }
    },
    required: ['question', 'options']
  }
} as const;

export const AskChoiceTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    const question = String(args.question || '').trim();
    const options = Array.isArray(args.options) ? args.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
    if (!question) return { success: false, error: 'question is required' };
    if (!options.length) return { success: false, error: 'options is required' };

    const contextId = String(context?.contextId || '');
    const chatType = String(context?.chatType || '');
    if (!contextId.startsWith('tg_')) {
      return {
        success: false,
        error: `ask_choice only works in Telegram chats (current: ${chatType || contextId || 'unknown'}). Ask the question in plain text instead.`
      };
    }
    const chatId = contextId.slice(3);

    const bot = (globalThis as any).activeTelegramBot;
    if (!bot || !bot.telegram) {
      return { success: false, error: 'Telegram bot is not active. Ask the question in plain text instead.' };
    }

    const timeoutSec = Math.min(Math.max(Number(args.timeout) || 120, 5), 300);
    const result = await askTelegramChoice(bot, chatId, question, options, timeoutSec * 1000);

    if (result.chosen) {
      return { success: true, answer: result.label, answer_index: result.index, timed_out: false, canceled: false };
    }
    if (result.canceled) {
      return { success: false, canceled: true, error: 'User cancelled the question.' };
    }
    const fallbackIdx = Number(args.default_option);
    if (args.default_option !== undefined && options[fallbackIdx] !== undefined) {
      return {
        success: true,
        answer: options[fallbackIdx],
        answer_index: fallbackIdx,
        timed_out: true,
        canceled: false,
        note: 'User did not answer in time; used default_option as fallback.'
      };
    }
    return { success: false, canceled: false, error: 'User did not answer in time (timeout).' };
  }
};
