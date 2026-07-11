import { ModuleType } from '../include/types';

export const DiscordBridge = {
  metadata: {
    id: 'discord_bridge',
    name: 'Discord Neural Link',
    description: 'Connects the Yuihime Core to Discord. Enables server integration and identity cross-mapping.',
    version: '1.0.0',
    type: ModuleType.GATEWAY,
    order: 2,
    configSchema: {
      fields: {
        botToken: {
          type: 'password',
          label: 'Discord Bot Token',
          description: 'Token from Discord Developer Portal',
          default: ''
        },
        enabled: {
          type: 'boolean',
          label: 'Channel Activation',
          default: false
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
          description: 'Comma separated emojis for varied reactions.',
          default: '❤️,✨,💫,🌸'
        },
        guildId: {
          type: 'string',
          label: 'Primary Guild ID',
          description: 'Home server for administrative commands.',
          default: ''
        }
      }
    }
  },
  
  run: async () => {
    return { status: 'daemon-managed' };
  }
};
