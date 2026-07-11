import { TTSModule, ModuleType } from '../../include/types';
import { WebSpeechTTS } from './WebSpeechTTS';

/**
 * OfficialStreamingSpeechTTS: Local module that implements 'official_streaming_speech'.
 * Provides low-latency speech synthesis simulated via native local/browser engines.
 */
export const OfficialStreamingSpeechTTS: TTSModule = {
  metadata: {
    id: 'official_streaming_speech',
    name: 'Official Streaming Speech Provider (Local Module)',
    description: 'Low-latency streaming speech synthesizer using browser/local modules.',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 0,
    configSchema: {
      fields: {
        wsUrl: { type: 'string', label: 'Local Connection Address', default: 'ws://localhost:3000' },
        speed: { type: 'slider', label: 'Flow speed rate', min: 0.5, max: 2.0, step: 0.1, default: 1.0 }
      }
    }
  },
  speak: async (text: string, config: any) => {
    console.log('[OFFICIAL_LOCAL_STREAMING_TTS] Simulating streaming speech low-latency via local WebSpeech module...');
    
    // Low latency speech synthesis via WebSpeech fallback
    const localConfig = {
      ...config,
      lang: 'id-ID',
      pitch: config.pitch ?? 1.2,
      speed: (config.speed || 1.1) * 1.05 // Slightly elevated for low latency streaming feel
    };
    
    return await WebSpeechTTS.speak(text, localConfig);
  }
};
