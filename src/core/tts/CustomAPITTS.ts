import { TTSModule, ModuleType } from '../../include/types';

/**
 * CustomAPITTS Module: High-fidelity Custom Audio/TTS Endpoint connector.
 * Supports RVC, GPT-SoVITS, local servers, custom web APIs under GET or POST.
 */
export const CustomAPITTS: TTSModule = {
  metadata: {
    id: 'custom_api_speech',
    name: 'Custom AI TTS (Local/Web)',
    description: 'Configure custom HTTP GET/POST endpoints (RVC, GPT-SoVITS, web-TTS, or localhost).',
    version: '1.0.0',
    type: ModuleType.TTS,
    order: 3,
    configSchema: {
      fields: {
        endpoint: {
          type: 'string',
          label: 'TTS API Endpoint URL',
          default: 'http://localhost:5000/tts',
          description: 'URL of the local or internet TTS API. Use {{text}} for GET request placeholders if needed.'
        },
        method: {
          type: 'select',
          label: 'HTTP Request Method',
          default: 'POST',
          options: [
            { label: 'POST Request', value: 'POST' },
            { label: 'GET Request', value: 'GET' }
          ]
        },
        responseType: {
          type: 'select',
          label: 'Response Parsing Type',
          default: 'binary',
          options: [
            { label: 'Raw Binary Audio (Blob)', value: 'binary' },
            { label: 'JSON Payload with Audio URL', value: 'json' }
          ]
        },
        jsonPath: {
          type: 'string',
          label: 'JSON Audio URL Field',
          default: 'url',
          description: 'The field in JSON response that contains the audio URL (supports dot-notation e.g. "data.audio_url" or "url").'
        },
        headers: {
          type: 'textarea',
          label: 'Custom HTTP Headers (JSON format)',
          default: '{\n  "Content-Type": "application/json"\n}',
          description: 'Custom HTTP headers to send (must be valid JSON, e.g. authorization keys).'
        },
        payloadTemplate: {
          type: 'textarea',
          label: 'POST JSON Payload Template',
          default: '{\n  "text": "{{text}}",\n  "voice": "yui",\n  "speed": 1.0\n}',
          description: 'The JSON body for POST requests. Use {{text}} as the placeholder for spoken text.'
        }
      }
    }
  },
  speak: async (text: string, config: any) => {
    const endpoint = config.endpoint || 'http://localhost:5000/tts';
    const method = config.method || 'POST';
    const responseType = config.responseType || 'binary';
    const jsonPath = config.jsonPath || 'url';
    const customHeadersRaw = config.headers || '{\n  "Content-Type": "application/json"\n}';
    const payloadTemplate = config.payloadTemplate || '{\n  "text": "{{text}}",\n  "voice": "yui",\n  "speed": 1.0\n}';

    // Parse custom headers
    let parsedHeaders: Record<string, string> = {
      'Accept': '*/*'
    };
    try {
      if (customHeadersRaw.trim()) {
        const parsed = JSON.parse(customHeadersRaw);
        parsedHeaders = { ...parsedHeaders, ...parsed };
      }
    } catch (e) {
      console.error('[CUSTOM_TTS] Header parsing failed. Using defaults.', e);
    }

    try {
      let finalUrl = endpoint;
      let requestOptions: RequestInit = {
        method,
        headers: parsedHeaders
      };

      if (method === 'GET') {
        if (finalUrl.includes('{{text}}')) {
          finalUrl = finalUrl.replace('{{text}}', encodeURIComponent(text));
        } else {
          finalUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(text);
        }
      } else {
        // POST payload construction
        let postBody = '';
        if (payloadTemplate.trim()) {
          postBody = payloadTemplate.replace('{{text}}', text.replace(/"/g, '\\"'));
        } else {
          postBody = JSON.stringify({ text });
        }
        
        requestOptions.body = postBody;
        if (!parsedHeaders['Content-Type']) {
          (requestOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
      }

      console.log(`[CUSTOM_TTS] Dispatching speech request to ${finalUrl}...`);
      const response = await fetch(finalUrl, requestOptions);

      if (!response.ok) {
        throw new Error(`Custom AI TTS endpoint returned error: ${response.status} ${response.statusText}`);
      }

      let audioUrl = '';
      if (responseType === 'binary') {
        const audioBlob = await response.blob();
        audioUrl = URL.createObjectURL(audioBlob);
      } else {
        const jsonResponse = await response.json();
        const resolveKeyPath = (obj: any, path: string): string | null => {
          try {
            const parts = path.split('.');
            let val = obj;
            for (const part of parts) {
              if (val === null || val === undefined) return null;
              val = val[part];
            }
            return (typeof val === 'string') ? val : null;
          } catch {
            return null;
          }
        };

        const parsedUrl = resolveKeyPath(jsonResponse, jsonPath);
        if (!parsedUrl) {
          throw new Error(`Failed to extract audio URL from JSON path: "${jsonPath}". Response was: ${JSON.stringify(jsonResponse)}`);
        }
        audioUrl = parsedUrl;
      }

      // Play synthesized vocal stream
      return new Promise<void>((resolve, reject) => {
        const audio = new Audio(audioUrl);
        
        // Hook up real-time audio analysis
        import('../speech').then(({ SpeechService }) => {
          SpeechService.analyzeAudioStream(audio);
        }).catch((err) => {
          console.warn('[CUSTOM_TTS] Audio analysis binding failed:', err);
        });

        audio.onended = () => {
          if (responseType === 'binary') {
            URL.revokeObjectURL(audioUrl);
          }
          resolve();
        };
        audio.onerror = (e) => {
          if (responseType === 'binary') {
            URL.revokeObjectURL(audioUrl);
          }
          reject(new Error(`HTMLAudioElement error during playback of custom speech stream: ${e}`));
        };
        audio.play().catch((playError) => {
          if (responseType === 'binary') {
            URL.revokeObjectURL(audioUrl);
          }
          reject(playError);
        });
      });

    } catch (error: any) {
      console.error('[CUSTOM_TTS] Synthesis execution failed, falling back to WebSpeechTTS:', error);
      // Failover chain fallback to Browser SpeechSynthesis (native browser web speech)
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID'; // Default to Indonesian
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }
  }
};
