import { TTSModule, ModuleType } from '@shared/include/types';

export const WebSpeechTTS: TTSModule = {
  metadata: {
    id: 'browser',
    name: 'Browser Web Speech',
    description: 'Native browser text-to-speech engine.',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 1,
    configSchema: {
      fields: {
        lang: {
          type: 'select',
          label: 'Voice Accent / Language',
          default: 'id-ID',
          options: [
            { label: 'Indonesian (id-ID)', value: 'id-ID' },
            { label: 'English (en-US)', value: 'en-US' },
            { label: 'English (en-GB)', value: 'en-GB' },
            { label: 'Japanese (ja-JP)', value: 'ja-JP' },
            { label: 'Korean (ko-KR)', value: 'ko-KR' }
          ]
        },
        speed: {
          type: 'slider',
          label: 'Speaking Speed / Rate',
          min: 0.5,
          max: 2.0,
          step: 0.1,
          default: 1.0,
          description: 'Adjust the smoothness of speaking speed (0.5x - 2.0x).'
        },
        pitch: {
          type: 'slider',
          label: 'Voice Pitch Adjustment',
          min: 0.5,
          max: 2.0,
          step: 0.1,
          default: 1.0,
          description: 'Adjusts the high/low level of the speaking pitch module.'
        },
        emotionVariance: {
          type: 'slider',
          label: 'Emotional Tone Variance',
          min: 0.0,
          max: 1.0,
          step: 0.05,
          default: 0.5,
          description: 'Controls how expressively the character varies the intonation of her voice.'
        }
      }
    }
  },
  speak: async (text: string, config: any) => {
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Store a reference on window to prevent garbage collection mid-speech (famous Chromium bug)
      (window as any)._activeWebSpeechUtterance = utterance;
      
      const lang = config.lang || 'id-ID';
      utterance.lang = lang;

      // Try to find a voice for the language
      const voices = window.speechSynthesis.getVoices();
      const langVoice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
      if (langVoice) utterance.voice = langVoice;

      if (config.pitch) utterance.pitch = config.pitch;
      if (config.speed) utterance.rate = config.speed;
      
      let fauxVolumeInterval: any = null;
      
      // Watchdog timeout fallback (estimated duration in ms + 5000ms buffer)
      const estimatedDurationMs = Math.max(1500, (text.length / 15) * 1000) + 5000;
      let fallbackTimeout: any = setTimeout(() => {
        console.warn("[WebSpeechTTS] Safety watchdog timeout fired. Forcing resolution to prevent interface lockup.");
        stopFauxVolume();
        resolve();
      }, estimatedDurationMs);

      const stopFauxVolume = () => {
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = null;
        }
        if (fauxVolumeInterval) {
          clearInterval(fauxVolumeInterval);
          fauxVolumeInterval = null;
        }
        (window as any)._activeWebSpeechUtterance = null;
        import('../speech').then(({ SpeechService }) => {
          // Speak completed or failed; set volume to zero
          SpeechService.stop();
        }).catch(() => {});
      };

      const startFauxVolume = () => {
        stopFauxVolume();
        let frame = 0;
        fauxVolumeInterval = setInterval(() => {
          frame++;
          const base = Math.sin(frame * 0.18) * 0.2 + 0.35;
          const details = Math.sin(frame * 0.75) * 0.1;
          const noise = Math.random() * 0.12;
          const gating = Math.sin(frame * 0.05) > -0.65 ? 1 : 0;
          const volume = (base + details + noise) * gating;
          import('../speech').then(({ SpeechService }) => {
            const subscribers = (SpeechService as any).onVolumeListeners || [];
            subscribers.forEach((l: any) => l(Math.max(0, Math.min(1.0, volume))));
          }).catch(() => {});
        }, 40);
      };

      utterance.onstart = () => {
        startFauxVolume();
      };
      
      utterance.onend = () => {
        stopFauxVolume();
        resolve();
      };

      utterance.onerror = () => {
        stopFauxVolume();
        resolve();
      };
      
      window.speechSynthesis.speak(utterance);
    });
  }
};
