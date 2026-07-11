import { TTSModule, ModuleType } from '../../include/types';
import { WebSpeechTTS } from './WebSpeechTTS';

/**
 * OfficialSpeechTTS: Local module that implements 'official_speech'.
 * Routes TTS generation to native local/browser modules with custom voice properties.
 */
export const OfficialSpeechTTS: TTSModule = {
  metadata: {
    id: 'official_speech',
    name: 'Official Speech Provider (Local Module)',
    description: 'Speech synthesizer using native local/browser modules.',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 0,
    configSchema: {
      fields: {
        voiceId: { type: 'string', label: 'Vocal Identity identifier signature', default: 'default-airi' },
        speed: { type: 'slider', label: 'Speaking speed flow modifier', min: 0.5, max: 2.0, step: 0.1, default: 1.0 }
      }
    }
  },
  speak: async (text: string, config: any) => {
    console.log('[OFFICIAL_LOCAL_TTS] Synthesizing speech through local WebSpeech module...');
    
    // We delegate directly to WebSpeechTTS's speak, applying a high-fidelity high-pitch/speed profile for cute VTuber output!
    const localConfig = {
      ...config,
      lang: 'id-ID',
      pitch: config.pitch ?? 1.25, // Sweet custom high pitch for Yui
      speed: config.speed || 1.05
    };
    
    return await WebSpeechTTS.speak(text, localConfig);
  }
};
