import { SystemRegistry } from '../registry.js';
import { SettingsManager } from './settings.js';
import { TTSModule } from '../../include/types.js';

export class TTSGateway {
  private static instance: TTSGateway;

  private constructor() {}

  public static getInstance(): TTSGateway {
    if (!TTSGateway.instance) {
      TTSGateway.instance = new TTSGateway();
    }
    return TTSGateway.instance;
  }

  /**
   * Centralized TTS Gateway with Fallback Chain
   * Rule: ElevenLabs -> Google TTS -> OpenAI TTS -> Browser/WebSpeech
   */
  public async speak(text: string, options: any = {}) {
    let settings = SettingsManager.getInstance().getAll();
    if (!settings || Object.keys(settings).length === 0) {
      settings = await SettingsManager.getInstance().load();
    }
    const primaryProviderId = options.provider || settings.ttsProvider || 'browser';

    // Define fallback sequence (Rule: Failover chain)
    const fallbackChain = [primaryProviderId, 'elevenlabs', 'browser', 'web-speech', 'puter-tts']
      .filter((v, i, a) => v && a.indexOf(v) === i);

    let lastError: any = null;

    for (const providerId of fallbackChain) {
      try {
        const ttsModule = SystemRegistry.getTTS(providerId);
        if (!ttsModule) continue;

        console.log(`[TTS_GATEWAY] Attempting speech via provider: ${providerId}`);
        
        // Merge settings for this provider
        const providerConfig = {
          ...(settings[providerId] || {}),
          ...options
        };

        await ttsModule.speak(text, providerConfig);
        return { status: 'success', provider: providerId };
      } catch (e: any) {
        lastError = e;
        console.error(`[TTS_GATEWAY_ERROR] ${providerId}: ${e.message || String(e)}`);
        // Continue to next fallback
        continue;
      }
    }

    // Standardized Error
    console.error(`[TTS_GATEWAY_ERROR] All TTS providers failed.`);
    return { status: 'error', error: lastError?.message || 'All TTS providers failed' };
  }
}
