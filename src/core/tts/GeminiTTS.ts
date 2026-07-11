import { TTSModule, ModuleType } from '../../include/types';

/**
 * GeminiTTS: Native Google Gemini 2.0/3.0 Emotive Speech Synthesizer.
 * Processes audio payloads server-side using the brand-new @google/genai module.
 */
export const GeminiTTS: TTSModule = {
  metadata: {
    id: 'gemini_speech',
    name: 'Google Gemini Speech',
    description: 'High-fidelity deep emotive vocal rendering powered by native Google Gemini TTS models.',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 3,
    configSchema: {
      fields: {
        apiKey: {
          type: 'password',
          label: 'Gemini API Key (Optional)',
          description: 'Kunci API Google AI Studio Anda. Kosongkan jika sudah di-set di variabel lingkungan server.'
        },
        model: {
          type: 'select',
          label: 'Gemini TTS Model',
          default: 'gemini-3.1-flash-tts-preview',
          options: [
            { label: 'Gemini 3.1 Flash TTS Preview (Recommeded)', value: 'gemini-3.1-flash-tts-preview' },
            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
            { label: 'Gemini 2.0 Flash (Experimental)', value: 'gemini-2.0-flash' }
          ]
        },
        voice: {
          type: 'select',
          label: 'Gemini Voice Profile',
          default: 'Kore',
          options: [
            { label: 'Kore (Female, Warm, Cheerful)', value: 'Kore' },
            { label: 'Charon (Female, Soft, Calm)', value: 'Charon' },
            { label: 'Puck (Male, Friendly, Bright)', value: 'Puck' },
            { label: 'Fenrir (Male, Energetic, Deep)', value: 'Fenrir' },
            { label: 'Zephyr (Reflective, Neutral)', value: 'Zephyr' }
          ]
        },
        speed: {
          type: 'slider',
          label: 'Speaking Speed / Rate',
          min: 0.5,
          max: 2.5,
          step: 0.1,
          default: 1.0,
          description: 'Sesuaikan tingkat kecepatan berbicara Yui (0.5x - 2.5x).'
        },
        pitch: {
          type: 'slider',
          label: 'Voice Pitch Level',
          min: 0.5,
          max: 2.0,
          step: 0.05,
          default: 1.0,
          description: 'Menyesuaikan tinggi pitch audio (0.5x - 2x).'
        }
      }
    }
  },

  speak: async (text: string, config: any) => {
    try {
      if (typeof window === 'undefined') return;

      const apiKey = config.apiKey || '';
      const model = config.model || 'gemini-3.1-flash-tts-preview';
      const voice = config.voice || 'Kore';
      const speed = parseFloat(config.speed) || 1.0;
      const pitch = parseFloat(config.pitch) || 1.0;

      // Dispatch backend proxy request to synthesize voice on the server
      const response = await fetch('/api/tts/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          apiKey,
          model,
          voice
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini Speech Gateway returned error status: ${response.status}`);
      }

      const resJson = await response.json();
      if (!resJson || !resJson.audio) {
        throw new Error('Gemini Speech Gateway response contains no valid audio payload.');
      }

      // Decoded base64 payload into a playable Blob URL
      const base64Audio = resJson.audio;
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      // Pitch controls
      if (pitch !== 1.0) {
        (audio as any).preservesPitch = false;
        (audio as any).mozPreservesPitch = false;
        (audio as any).webkitPreservesPitch = false;
        audio.playbackRate = speed * pitch;
      } else if (speed !== 1.0) {
        audio.playbackRate = speed;
      }

      // Bind to real-time visualizer audio analysis
      try {
        const { SpeechService } = await import('../speech');
        SpeechService.analyzeAudioStream(audio);
      } catch (err) {
        console.warn('[GEMINI-TTS] Visual volume analysis binding failed:', err);
      }

      await audio.play();

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
      });
    } catch (e) {
      console.error('[GEMINI-TTS] Error during text synthesis:', e);
      // Failover chain fallback to standard Browser Speech
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
  }
};
