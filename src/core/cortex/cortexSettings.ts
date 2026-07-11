import { StorageService } from '../../drivers/storage';

let settingsCache: any = null;
let lastSettingsFetch: number = 0;

/**
 * Normalizes and retrieves the combined settings for the Cortex, with caching.
 *
 * Use when:
 * - Direct query parameters or prompt-gateway requests require active provider credentials.
 *
 * Returns:
 * - A unified JSON settings structure containing the current provider config.
 */
export async function fetchCortexSettings(localConfigOverride?: any): Promise<any> {
  if (settingsCache && (Date.now() - lastSettingsFetch < 30000)) {
    return settingsCache;
  }

  // Server-side Direct Loading Fallback to bypass invalid relative URL TypeError in Node
  if (typeof window === 'undefined') {
    try {
      const { SettingsManager } = await import('../kernel/settings.js');
      const settingsManager = SettingsManager.getInstance();
      const s = await settingsManager.load();
      
      const activeProvider = s.provider || 'gemini';
      
      let defaultModel = '';
      try {
        const { SystemRegistry } = await import('../registry.js');
        const providerModule = SystemRegistry.getProvider(activeProvider);
        if (providerModule && providerModule.metadata?.models?.length > 0) {
          defaultModel = providerModule.metadata.models[0];
        }
      } catch (e) {
        console.warn("[CORTEX] Failed to load default model from registry", e);
      }

      const combined = { ...s } as any;
      if (!combined[activeProvider]) combined[activeProvider] = {};
      
      const activeConf = combined[activeProvider];
      const apiKey = activeConf.apiKey || activeConf.api_key || activeConf.token || '';
      
      combined[activeProvider] = {
        ...activeConf,
        apiKey: apiKey,
        model: activeConf.model || defaultModel,
        temperature: activeConf.temperature || 0.7,
        topP: activeConf.topP || 0.95,
        topK: activeConf.topK || 40,
        maxOutputTokens: activeConf.maxOutputTokens || activeConf.maxTokens || s.maxTokens || 65536
      };

      combined.provider = activeProvider;
      settingsCache = combined;
      lastSettingsFetch = Date.now();
      return combined;
    } catch (serverErr) {
      console.error("[CORTEX] Server-side Settings fetch from SettingsManager failed:", serverErr);
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const serverSettings = await fetch('/api/settings', { signal: controller.signal })
      .then(res => res.ok ? res.json() : {})
      .catch(() => ({}));
    
    clearTimeout(timeoutId);
    const s = serverSettings as any;
    const localConfig = localConfigOverride || await StorageService.getAIConfig();
    
    const activeProvider = localConfig.provider || s.provider || 'gemini';
    
    let defaultModel = '';
    try {
      const { SystemRegistry } = await import('../registry.js');
      const providerModule = SystemRegistry.getProvider(activeProvider);
      if (providerModule && providerModule.metadata?.models?.length > 0) {
        defaultModel = providerModule.metadata.models[0];
      }
    } catch (e) {
      console.warn("[CORTEX] Failed to load default model from registry", e);
    }

    const combined = { ...s };
    if (!combined[activeProvider]) combined[activeProvider] = {};
    
    combined[activeProvider] = {
      ...combined[activeProvider],
      apiKey: combined[activeProvider].apiKey || localConfig.apiKey || '',
      model: combined[activeProvider].model || localConfig.model || defaultModel,
      temperature: combined[activeProvider].temperature || localConfig.temperature || 0.7,
      topP: combined[activeProvider].topP || localConfig.topP || 0.95,
      topK: combined[activeProvider].topK || localConfig.topK || 40,
      maxOutputTokens: combined[activeProvider].maxOutputTokens || s.maxTokens || localConfig.maxTokens || 65536
    };

    combined.provider = activeProvider;

    settingsCache = combined;
    lastSettingsFetch = Date.now();
    return combined;
  } catch (e) {
    console.warn("[CORTEX] Settings fetch failed, using fallback/cache.", e);
    if (settingsCache) return settingsCache;

    const localConfig = localConfigOverride || await StorageService.getAIConfig();
    const prov = localConfig.provider || 'gemini';
    let defaultModel = '';
    try {
      const { SystemRegistry } = await import('../registry.js');
      const providerModule = SystemRegistry.getProvider(prov);
      if (providerModule && providerModule.metadata?.models?.length > 0) {
        defaultModel = providerModule.metadata.models[0];
      }
    } catch (e) {
      console.warn("[CORTEX] Failed to load default model from registry", e);
    }
    return { 
      provider: prov,
      [prov]: { 
        apiKey: localConfig.apiKey || '', 
        model: localConfig.model || defaultModel
      } 
    };
  }
}

export function clearCortexSettingsCache(): void {
  settingsCache = null;
  lastSettingsFetch = 0;
}
