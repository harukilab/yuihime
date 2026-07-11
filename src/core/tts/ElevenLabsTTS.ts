import { TTSModule, ModuleType } from '../../include/types';

export const ElevenLabsTTS: TTSModule = {
  metadata: {
    id: 'elevenlabs',
    name: 'ElevenLabs AI',
    description: 'High-quality emotional text-to-speech using ElevenLabs API.',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 2,
    configSchema: {
      fields: {
        apiKey: {
          type: 'password',
          label: 'ElevenLabs API Key',
          description: 'Your ElevenLabs API key'
        },
        voiceId: {
          type: 'string',
          label: 'Voice ID',
          description: 'The ElevenLabs Voice ID to use',
          default: 'EXAVITQu4vr4xnSDxMaL'
        }
      }
    }
  },
  speak: async (text: string, config: any) => {
    const apiKey = config.apiKey || import.meta.env.VITE_ELEVENLABS_API_KEY;
    const voiceId = config.voiceId || import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

    if (!apiKey) {
      console.warn('[ELEVENLABS] API Key missing, falling back to Web Speech');
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Hook up real-time audio analysis
      try {
        const { SpeechService } = await import('../speech');
        SpeechService.analyzeAudioStream(audio);
      } catch (err) {
        console.warn('[ELEVENLABS] Audio analysis binding failed:', err);
      }
      
      return new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = (e) => reject(e);
        audio.play().catch(reject);
      });
    } catch (error) {
      console.error('[ELEVENLABS] Error:', error);
      // Fallback
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
  }
};
