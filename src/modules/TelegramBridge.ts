import { ModuleType } from '../include/types';

export const TelegramBridge = {
  metadata: {
    id: 'telegram_bridge',
    name: 'Telegram Neural Link',
    description: 'Connects the Yuihime Core to Telegram. Enables private messaging and group interaction with identity persistence.',
    version: '1.0.0',
    type: ModuleType.GATEWAY,
    order: 1,
    configSchema: {
      fields: {
        botToken: {
          type: 'password',
          label: 'Telegram Bot Token',
          description: 'Bearer token from @BotFather',
          default: ''
        },
        enabled: {
          type: 'boolean',
          label: 'Channel Activation',
          default: true
        },
        autoAcknowledge: {
          type: 'boolean',
          label: 'Auto Acknowledge',
          description: 'Show typing status or reactions so user knows Yui is reading.',
          default: true
        },
        reactionEmojis: {
          type: 'string',
          label: 'Reaction Emojis',
          description: 'Comma separated emojis for varied reactions (e.g. ❤️,👍,✨)',
          default: '❤️,✨,💫,🌸,⚡'
        },
        respondInGroups: {
          type: 'boolean',
          label: 'Respond in Groups',
          default: true,
          description: 'Whether to listen and respond to messages in group chats.'
        },
        adminId: {
          type: 'string',
          label: 'Primary Admin ID',
          description: 'Telegram User ID for elevated permissions.',
          default: ''
        },
        apiRoot: {
          type: 'string',
          label: 'Custom API Root URL',
          description: 'Custom Telegram gateway URL to bypass ISP/network connection timeout blocking (e.g. https://api.telegram.org)',
          default: 'https://api.telegram.org'
        }
      }
    }
  },
  
  /**
   * This is a special module type that handled mostly by the server daemon,
   * but we define it here so the UI can auto-discover its config schema.
   */
  run: async () => {
    return { status: 'daemon-managed' };
  }
};
