import { TTSModule, ModuleType } from '@shared/include/types';
import { SpeechService } from '../speech';

/**
 * OpenRouterTTS: Cloud-based Text-to-Speech via OpenAI, OpenRouter, or compatible endpoints.
 * All API credentials are processed on the server-side to guarantee client key safety.
 */
export const OpenRouterTTS: TTSModule = {
  metadata: {
    id: 'openai_speech',
    name: 'OpenAI / OpenRouter (Cloud)',
    description: 'Cloud-based TTS powered by OpenAI, OpenRouter, or any compatible custom endpoint.',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 4,
    configSchema: {
      fields: {
        baseUrl: {
          type: 'string',
          label: 'API Base URL',
          default: 'https://api.openai.com/v1',
          description: 'Use https://openrouter.ai/api/v1 for OpenRouter, or your own custom endpoint.'
        },
        apiKey: {
          type: 'password',
          label: 'API Key',
          description: 'Your private API key. Leave empty if it is already set in the server environment variables.'
        },
        model: {
          type: 'select',
          label: 'TTS Model',
          default: 'tts-1',
          options: [
            { label: 'OpenAI TTS Standard (tts-1)', value: 'tts-1' },
            { label: 'OpenAI TTS HD (tts-1-hd)', value: 'tts-1-hd' },
            { label: 'Custom / OpenRouter Model', value: 'custom' }
          ]
        },
        customModel: {
          type: 'string',
          label: 'Custom Model ID',
          default: '',
          description: 'Enter the model ID (e.g. "openai/tts-1" on OpenRouter or a local TTS model).'
        },
        voice: {
          type: 'select',
          label: 'Voice Profile',
          default: 'nova',
          options: [
            { label: 'Nova (Energetic, Female)', value: 'nova' },
            { label: 'Shimmer (Cute, Sweet Female)', value: 'shimmer' },
            { label: 'Alloy (Neutral, Female/Male)', value: 'alloy' },
            { label: 'Echo (Balanced, Male)', value: 'echo' },
            { label: 'Fable (Expressive, Male)', value: 'fable' },
            { label: 'Onyx (Deep, Male)', value: 'onyx' }
          ]
        },
        speed: {
          type: 'slider',
          label: 'Speaking Rate / Speed',
          min: 0.25,
          max: 4.0,
          step: 0.05,
          default: 1.0,
          description: 'Adjust the voice speaking rate (0.25x - 4.0x).'
        },
        pitch: {
          type: 'slider',
          label: 'Voice Pitch Adjustment',
          min: 0.5,
          max: 2.0,
          step: 0.05,
          default: 1.0,
          description: 'Raise or lower the inner voice pitch of Yuihime (0.5x - 2.0x).'
        }
      }
    }
  },

  speak: async (text: string, config: any) => {
    try {
      if (typeof window === 'undefined') return;

      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = config.apiKey || '';
      const selectedModel = config.model === 'custom' ? (config.customModel || 'tts-1') : (config.model || 'tts-1');
      const voice = config.voice || 'nova';
      const speed = parseFloat(config.speed) || 1.0;
      const pitch = parseFloat(config.pitch) || 1.0;

      // Dispatch backend proxy request to keep API keys hidden
      const response = await fetch('/api/tts/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          baseUrl,
          apiKey,
          model: selectedModel,
          voice,
          speed
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI / OpenRouter TTS Gateway returned error status: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      // Pitch shifting via playbackRate and preservesPitch
      if (pitch !== 1.0) {
        (audio as any).preservesPitch = false;
        (audio as any).mozPreservesPitch = false;
        (audio as any).webkitPreservesPitch = false;
        // Adjust playbackRate dynamically to shift pitch
        audio.playbackRate = speed * pitch;
      } else if (speed !== 1.0) {
        audio.playbackRate = speed;
      }

      // Bind to real-time visualizer audio analysis
      try {
        SpeechService.analyzeAudioStream(audio);
      } catch (err) {
        console.warn('[OPENAI-TTS] Visual volume analysis binding failed:', err);
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
      console.error('[OPENAI-TTS] Error during text synthesis:', e);
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
