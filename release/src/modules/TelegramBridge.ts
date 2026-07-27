import { ModuleType } from '@shared/include/types';

export const TelegramBridge = {
  metadata: {
    id: 'telegram_bridge',
    name: 'Telegram Neural Link',
    description: 'Connects the Yuihime Core to Telegram. Enables private messaging and group interaction with identity persistence.',
    version: '2.0.0',
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
          description: 'Comma separated emojis for varied reactions (Telegram-allowed only: 👍👎❤️🔥🥰👏😁🤔🤨😐😢😭😡🥱). Others are filtered out.',
          default: '❤️,🔥,🥰,👍,😁'
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
        },
        connectTimeout: {
          type: 'number',
          label: 'Connect Timeout (ms)',
          description: 'Timeout for establishing connection to Telegram API. Increase if you have high latency.',
          default: 15000
        },
        readTimeout: {
          type: 'number',
          label: 'Read Timeout (ms)',
          description: 'Timeout for reading response from Telegram API.',
          default: 30000
        },
        maxRetries: {
          type: 'number',
          label: 'Max Launch Retries',
          description: 'Maximum retry attempts when bot fails to launch due to network errors.',
          default: 5
        },
        proxyUrl: {
          type: 'string',
          label: 'Proxy URL',
          description: 'Optional HTTP/HTTPS proxy for Telegram API requests (e.g. http://proxy:8080).',
          default: ''
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
