import { SettingsManager } from '../settings.js';
import { toKeyArray, toSingleString } from '../configNormalizer.js';
import { SystemRegistry } from '@shared/core/registry';
import { WebSearchRunner } from './webSearchRunner.js';

const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-3.1-flash-lite'];

function toModelString(raw: any): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw[0];
  return '';
}

export async function executeGoogleSearch(query: string, topK: number = 5): Promise<any[]> {
  try {
    const settings = SettingsManager.getInstance();

    const providersTable = (settings.get('providers') as any) || {};
    const geminiSettings = { ...(providersTable.gemini || {}), ...(settings.get('gemini') || {}) };

    let defaultGeminiModel = FALLBACK_MODELS[0];
    if (geminiSettings.model) {
      defaultGeminiModel = toModelString(geminiSettings.model) || defaultGeminiModel;
    } else {
      try {
        const geminiModule = SystemRegistry.getProvider('gemini');
        if (geminiModule && geminiModule.metadata?.models?.length > 0) {
          defaultGeminiModel = toModelString(geminiModule.metadata.models[0]) || defaultGeminiModel;
        }
      } catch (e) {}
    }

    const primaryKey = toSingleString(settings.getApiKey());
    const fallbackKey = toSingleString(geminiSettings.fallbackApiKey);
    const apiKeys = [...toKeyArray(primaryKey), ...toKeyArray(fallbackKey)].filter((v, i, a) => a.indexOf(v) === i);

    const openrouterSettings = settings.get('openrouter') || {};
    const openrouterKeys = [
      ...toKeyArray(openrouterSettings.apiKey),
      ...toKeyArray(openrouterSettings.apiKeys),
      ...(process.env.OPENROUTER_API_KEY ? toKeyArray(process.env.OPENROUTER_API_KEY) : [])
    ].filter((v, i, a) => a.indexOf(v) === i);

    const result = await WebSearchRunner.search(query, topK, {
      gemini: {
        apiKeys,
        model: defaultGeminiModel,
        baseUrl: geminiSettings.baseUrl || geminiSettings.endpoint,
        apiVersion: geminiSettings.apiVersion
      },
      openrouter: {
        apiKeys: openrouterKeys,
        model: toModelString(openrouterSettings.model)
      }
    });

    if (result.failed) {
      console.warn(`[SERVER_SEARCH_GROUNDING] Search runner stopped early (${result.reason || 'unknown'}). Web search is temporarily unavailable.`);
      return [];
    }

    return result.results || [];
  } catch (err: any) {
    console.warn("[SERVER_SEARCH_GROUNDING] Search execution error:", err?.message || err);
    return [];
  }
}
