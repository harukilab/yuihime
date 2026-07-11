import { ModuleType } from '../include/types';

export const TwitchBridge = {
  metadata: {
    id: 'twitch_bridge',
    name: 'Twitch Neural Link',
    description: 'Connects the Yuihime Core to Twitch. Enables live chat interaction and alert processing.',
    version: '1.0.0',
    type: ModuleType.GATEWAY,
    order: 3,
    configSchema: {
      fields: {
        channel: {
          type: 'string',
          label: 'Twitch Channel Name',
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
          description: 'Show activity status when reading messages.',
          default: true
        },
        readChat: {
          type: 'boolean',
          label: 'Monitor Live Chat',
          default: true
        }
      }
    }
  },
  
  run: async () => {
    return { status: 'daemon-managed' };
  }
};
