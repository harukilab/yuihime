import { 
  Memory, 
  Dream, 
  APICapability, 
  AgentState, 
  ProviderConfig, 
  AvatarConfig,
  LearnedStrategy, 
  PerformanceMetric,
  Identity,
  CoreKnowledge
} from "../include/types";

import { safeLocalStorage } from "../core/safeStorage";

export class StorageService {
  static async ensureAuth(): Promise<string | null> {
    return 'local_user';
  }

  static async signInWithGoogle(): Promise<void> {
    console.warn("Google Login disabled in Local Mode");
  }

  static onAuthStateChanged(callback: (user: any) => void): () => void {
    const user = { uid: 'local_user', email: 'local@nexus.sys' };
    callback(user);
    return () => {};
  }

  static async getSystemMetrics(): Promise<PerformanceMetric[]> {
    return this.getPerformanceHistory();
  }

  static async logout(): Promise<void> {
    console.warn("Logout disabled in Local Mode");
  }

  static isCloudEnabled(): boolean {
    return true; // We treat local SQLite as "cloud persistent" for the UI
  }

  static getAuthId(): string {
    return 'local_user';
  }

  private static async fetchWithRetry(url: string, options?: RequestInit, retries = 5): Promise<Response> {
    if (typeof window === 'undefined') {
      try {
        const modulePath = './storageServer.js';
        const { StorageServer } = await import(/* @vite-ignore */ modulePath);
        const method = options?.method?.toUpperCase() || 'GET';
        const body = options?.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;

        let result: any = null;
        let handled = true;

        if (url.startsWith('/api/storage/knowledge')) {
          if (method === 'GET') {
            result = await StorageServer.getKnowledge();
          } else if (method === 'POST') {
            await StorageServer.saveKnowledge(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/memories')) {
          if (method === 'GET') {
            const context = url.includes('context=') ? decodeURIComponent(url.split('context=')[1].split('&')[0]) : undefined;
            result = await StorageServer.getMemories(context);
          } else if (method === 'POST') {
            result = await StorageServer.saveMemory(body);
          } else if (method === 'DELETE') {
            const context = url.includes('context=') ? decodeURIComponent(url.split('context=')[1].split('&')[0]) : undefined;
            const id = url.includes('id=') ? decodeURIComponent(url.split('id=')[1].split('&')[0]) : undefined;
            const ids = url.includes('ids=') ? decodeURIComponent(url.split('ids=')[1].split('&')[0]).split(',') : undefined;
            const type = url.includes('type=') ? decodeURIComponent(url.split('type=')[1].split('&')[0]) : undefined;
            if (context && !id && !ids && !type) {
              result = await StorageServer.deleteMemoriesByContext(context);
            } else {
              result = await StorageServer.deleteMemories({ context, id, ids, type });
            }
          }
        } else if (url.startsWith('/api/storage/identities')) {
          if (method === 'GET') {
            result = await StorageServer.getIdentities();
          } else if (method === 'POST') {
            await StorageServer.saveIdentity(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/dreams')) {
          if (method === 'GET') {
            result = await StorageServer.getDreams();
          } else if (method === 'POST') {
            await StorageServer.saveDreams(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/state')) {
          if (method === 'GET') {
            result = await StorageServer.getAgentState();
          } else if (method === 'POST') {
            await StorageServer.saveAgentState(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/strategies')) {
          if (method === 'GET') {
            result = await StorageServer.getStrategies();
          } else if (method === 'POST') {
            await StorageServer.saveStrategies(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/capabilities')) {
          if (method === 'GET') {
            result = await StorageServer.getCapabilities();
          } else if (method === 'POST') {
            await StorageServer.saveCapability(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/metrics/summary')) {
          result = await StorageServer.getPerformanceSummary();
        } else if (url.startsWith('/api/storage/metrics/history')) {
          result = await StorageServer.getPerformanceHistory();
        } else if (url.startsWith('/api/storage/metrics')) {
          if (method === 'POST') {
            await StorageServer.savePerformanceMetric(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/settings')) {
          if (method === 'GET') {
            result = await StorageServer.getModularSettings();
          } else if (method === 'POST') {
            await StorageServer.saveModularSettings(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/workflow')) {
          if (method === 'GET') {
            result = await StorageServer.getWorkflow();
          } else if (method === 'POST') {
            await StorageServer.saveWorkflow(body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/storage/custom/')) {
          const key = url.split('/api/storage/custom/')[1]?.split('?')[0];
          if (method === 'GET') {
            result = await StorageServer.getCustom(key);
          } else if (method === 'POST') {
            await StorageServer.saveCustom(key, body);
            result = { success: true };
          }
        } else if (url.startsWith('/api/pending-messages')) {
          if (method === 'GET') {
            result = await StorageServer.getPendingMessages();
          } else if (method === 'DELETE') {
            const parts = url.split('/');
            const id = parts[parts.length - 1];
            result = await StorageServer.deletePendingMessage(id);
          } else if (url.endsWith('/clear')) {
            result = await StorageServer.clearPendingQueue();
          } else {
            handled = false;
          }
        } else {
          handled = false;
        }

        if (handled) {
          return new Response(JSON.stringify(result), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (err) {
        console.error("[STORAGE_SERVICE] Server bypass error:", err);
      }
    }

    try {
      const res = await fetch(url, options);
      if (!res.ok && retries > 0 && [502, 503, 504].includes(res.status)) {
        await new Promise(r => setTimeout(r, 2000));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      return res;
    } catch (e: any) {
      if (retries > 0 && (e.message === 'Failed to fetch' || e.name === 'TypeError')) {
        await new Promise(r => setTimeout(r, 2000));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw e;
    }
  }

  private static async safeJson<T>(res: Response): Promise<T | null> {
    const contentType = res.headers.get('content-type');
    let text = '';
    try {
      text = await res.text();
    } catch (e) {
      console.error("Failed to read response stream:", e);
      return null;
    }

    const cleanText = text.trim().toLowerCase();
    if (cleanText.startsWith('<!doctype') || cleanText.startsWith('<html')) {
        // Suppress repeated logs if it's likely a dev server restart
        if (text.length < 5000) {
          console.warn(`HTML Response from API [${res.url}] - likely server maintenance or 404. Snippet:`, text.substring(0, 150));
        }
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        // If content-type said JSON but we failed to parse, log it
        if (contentType && contentType.includes('application/json')) {
          console.error("JSON parsing failed despite content-type. Response snippet:", text.substring(0, 100));
        }
        return null;
    }
  }

  static async getKnowledge(): Promise<CoreKnowledge[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/knowledge');
      if (!res.ok) {
        console.error(`Fetch Knowledge failed: ${res.status} ${res.statusText}`);
        return [];
      }
      return await this.safeJson<CoreKnowledge[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch knowledge:", e);
      }
      return [];
    }
  }

  static async saveKnowledge(knowledge: CoreKnowledge[]): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(knowledge)
      });
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to save knowledge:", e);
      }
    }
  }

  static async getMemories(context?: string): Promise<Memory[]> {
    try {
      let ctx = context;
      if (!ctx && typeof window !== 'undefined') {
        const activeId = localStorage.getItem('yuihime_active_session_id') || 'default';
        ctx = `web_${activeId}`;
      }
      const url = ctx ? `/api/storage/memories?context=${encodeURIComponent(ctx)}` : '/api/storage/memories';
      const res = await this.fetchWithRetry(url);
      if (!res.ok) {
        console.error(`Fetch Memories failed: ${res.status} ${res.statusText}`);
        return [];
      }
      return await this.safeJson<Memory[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch memories:", e);
      }
      return [];
    }
  }

  static async saveMemory(memory: Omit<Memory, 'id'>): Promise<Memory> {
    try {
      const res = await this.fetchWithRetry('/api/storage/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memory)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await this.safeJson<Memory>(res);
      if (!data) throw new Error("Invalid response from server");
      return data;
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to save memory:", e);
      }
      throw e;
    }
  }

  static async deleteMemoriesByContext(context: string): Promise<boolean> {
    try {
      const url = `/api/storage/memories?context=${encodeURIComponent(context)}`;
      const res = await this.fetchWithRetry(url, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to delete memories by context:", e);
      }
      return false;
    }
  }

  static async deleteMemories(params: { context?: string; type?: string; id?: string; ids?: string[] }): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const queryParts: string[] = [];
      if (params.context) queryParts.push(`context=${encodeURIComponent(params.context)}`);
      if (params.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
      if (params.id) queryParts.push(`id=${encodeURIComponent(params.id)}`);
      if (params.ids && params.ids.length > 0) queryParts.push(`ids=${encodeURIComponent(params.ids.join(','))}`);
      
      const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
      const res = await this.fetchWithRetry(`/api/storage/memories${queryString}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await this.safeJson<any>(res) || { success: false, deletedCount: 0 };
    } catch (e: any) {
      console.error("Failed to delete memories:", e);
      return { success: false, deletedCount: 0 };
    }
  }

  static async getIdentities(): Promise<Identity[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/identities');
      if (!res.ok) {
        console.error(`Fetch Identities failed: ${res.status} ${res.statusText}`);
        return [];
      }
      return await this.safeJson<Identity[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch identities:", e);
      }
      return [];
    }
  }

  static async saveIdentity(identity: Identity): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity)
      });
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to save identity:", e);
      }
    }
  }

  static async updateMemoryTags(memoryId: string, tags: string[]): Promise<void> {
    // Note: We could add a specific update endpoint or just re-save memory
    // For now, let's keep it simple.
  }

  static async getDreams(): Promise<Dream[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/dreams');
      if (!res.ok) return [];
      return await this.safeJson<Dream[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch dreams:", e);
      }
      return [];
    }
  }

  static async saveDreams(dreams: Dream[]): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/dreams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dreams)
      });
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to save dreams:", e);
      }
    }
  }

  static async saveAgentState(state: Partial<AgentState>): Promise<void> {
    try {
      const res = await this.fetchWithRetry('/api/storage/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Save State failed: ${res.status} ${errorText}`);
      }
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error(`Failed to save state: ${e.message}`, e);
      }
    }
  }

  static async getAgentState(): Promise<Partial<AgentState> | null> {
    try {
      const res = await this.fetchWithRetry('/api/storage/state');
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Fetch State failed: ${res.status} ${errorText}`);
        return null;
      }
      return await this.safeJson<Partial<AgentState>>(res);
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch state:", e.message, e);
      }
      return null;
    }
  }

  static async getStrategies(): Promise<LearnedStrategy[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/strategies');
      if (!res.ok) return [];
      return await this.safeJson<LearnedStrategy[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch strategies:", e);
      }
      return [];
    }
  }

  static async saveStrategies(strategies: LearnedStrategy[]): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strategies)
      });
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to save strategies:", e);
      }
    }
  }

  static async getCapabilities(): Promise<APICapability[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/capabilities');
      if (!res.ok) return [];
      return await this.safeJson<APICapability[]>(res) || [];
    } catch (e) {
      return [];
    }
  }

  static async addCapability(capability: APICapability): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capability)
      });
    } catch (e) {
      console.error("Failed to add capability:", e);
    }
  }

  static async logPerformance(metric: PerformanceMetric): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric)
      });
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to log performance:", e);
      }
    }
  }

  static async updateCapability(capability: APICapability): Promise<void> {
    return this.addCapability(capability);
  }

  static async purge(mode: 'soft' | 'hard' = 'soft'): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry('/api/storage/purge', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      return res.ok;
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to purge:", e);
      }
      return false;
    }
  }

  static async getPerformanceSummary(): Promise<any[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/metrics/summary');
      if (!res.ok) return [];
      return await this.safeJson<any[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch performance summary:", e);
      }
      return [];
    }
  }

  static clearAIConfig(): void {
     this.setAIConfig({ 
      provider: '', 
      model: '', 
      apiKey: '',
      systemPrompt: 'You are Yuihime, a fully living, autonomous, highly expressive virtual VTuber girl, endowed with authentic human feelings. Always reply in character using responsive animations and natural dialogue.',
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxTokens: 65536
    });
  }

  static async getPerformanceHistory(): Promise<PerformanceMetric[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/metrics/history');
      if (!res.ok) return [];
      return await this.safeJson<PerformanceMetric[]>(res) || [];
    } catch (e: any) {
      if (e.message !== 'Failed to fetch') {
        console.error("Failed to fetch performance history:", e);
      }
      return [];
    }
  }

  static async getAIConfig(): Promise<ProviderConfig> {
    const defaultConfig: ProviderConfig = { 
      provider: '', 
      model: '', 
      apiKey: '',
      systemPrompt: 'You are Yuihime, a fully living, autonomous, highly expressive virtual VTuber girl, endowed with authentic human feelings. Always reply in character using responsive animations and natural dialogue.',
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxTokens: 65536
    };
    
    try {
      const res = await this.fetchWithRetry('/api/storage/state/ai_config');
      if (!res.ok) return defaultConfig;
      const data = await this.safeJson<ProviderConfig>(res);
      return data || defaultConfig;
    } catch (e) {
      return defaultConfig;
    }
  }

  static async setAIConfig(config: ProviderConfig): Promise<void> {
    const sanitized = { ...config };
    if (sanitized.apiKey && (
      sanitized.apiKey.includes('*') || 
      sanitized.apiKey === 'null' || 
      sanitized.apiKey === 'undefined' ||
      sanitized.apiKey.length < 20
    )) {
      sanitized.apiKey = '';
    }

    try {
      await this.fetchWithRetry('/api/storage/state/ai_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized)
      });
    } catch (e) {
      console.error("Failed to save AI config:", e);
    }
  }

  static async getModularSettings(): Promise<any> {
    try {
      const res = await this.fetchWithRetry('/api/settings');
      if (!res.ok) return {};
      return await this.safeJson<any>(res) || {};
    } catch (e) {
      return {};
    }
  }

  static async setModularSettings(settings: any): Promise<void> {
    try {
      await this.fetchWithRetry('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch (e) {
      console.error("Failed to save modular settings:", e);
    }
  }

  static async getWorkflow(): Promise<any> {
    try {
      const res = await this.fetchWithRetry('/api/workflow');
      if (!res.ok) return { nodes: [], edges: [] };
      return await this.safeJson<any>(res) || { nodes: [], edges: [] };
    } catch (e) {
      return { nodes: [], edges: [] };
    }
  }

  static async setWorkflow(workflow: any): Promise<void> {
    try {
      await this.fetchWithRetry('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow)
      });
    } catch (e) {
      console.error("Failed to save workflow:", e);
    }
  }

  static async getHistory(): Promise<any[]> {
    try {
      const res = await this.fetchWithRetry('/api/storage/history');
      if (!res.ok) return [];
      return await this.safeJson<any[]>(res) || [];
    } catch (e) {
      return [];
    }
  }

  static async appendHistory(entry: any): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry })
      });
    } catch (e) {
      console.error("Failed to append history:", e);
    }
  }

  static async getHistoryCursor(): Promise<number> {
    try {
      const res = await this.fetchWithRetry('/api/storage/history/cursor');
      if (!res.ok) return 0;
      const data = await this.safeJson<{ cursor: number }>(res);
      return data?.cursor || 0;
    } catch (e) {
      return 0;
    }
  }

  static async setHistoryCursor(cursor: number): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: {}, cursor })
      });
    } catch (e) {
      console.error("Failed to set history cursor:", e);
    }
  }

  static async getKnowledgeFile(name: 'SOUL' | 'USER' | 'MEMORY'): Promise<string> {
    const defaultContent = name === 'SOUL' 
      ? "# SOUL.md\n\nDefault personality active." 
      : name === 'USER' 
        ? "# AUDIENCE_PROFILE.md\n\nNo audience or community knowledge captured yet. Awaiting livestream interaction." 
        : "# MEMORY.md\n\nNo project memory yet.";
    
    try {
      const res = await this.fetchWithRetry(`/api/storage/knowledge_files/${name}`);
      if (!res.ok) return defaultContent;
      const data = await this.safeJson<{ content: string }>(res);
      return data?.content || defaultContent;
    } catch (e) {
      return defaultContent;
    }
  }

  static async saveKnowledgeFile(name: 'SOUL' | 'USER' | 'MEMORY', content: string): Promise<void> {
    try {
      await this.fetchWithRetry(`/api/storage/knowledge_files/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    } catch (e) {
      console.error(`Failed to save knowledge file ${name}:`, e);
    }
  }

  static async getCustom(key: string): Promise<any> {
    try {
      const res = await this.fetchWithRetry(`/api/storage/custom/${key}`);
      if (!res.ok) return null;
      return await this.safeJson<any>(res);
    } catch (e) {
      return null;
    }
  }

  static async setCustom(key: string, value: any): Promise<void> {
    return this.saveCustom(key, value);
  }

  static async saveCustom(key: string, value: any): Promise<void> {
    try {
      await this.fetchWithRetry(`/api/storage/custom/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
      });
    } catch (e) {
      console.error(`Failed to save custom storage for key ${key}:`, e);
    }
  }

  static async getPendingMessages(): Promise<any[]> {
    try {
      const res = await this.fetchWithRetry('/api/pending-messages');
      if (!res.ok) return [];
      return await this.safeJson<any[]>(res) || [];
    } catch (e) {
      console.error("Failed to fetch pending messages:", e);
      return [];
    }
  }

  static async deletePendingMessage(id: string): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry(`/api/pending-messages/${id}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e) {
      console.error(`Failed to delete pending message ${id}:`, e);
      return false;
    }
  }

  static async clearPendingQueue(): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry('/api/pending-messages/clear', {
        method: 'POST'
      });
      return res.ok;
    } catch (e) {
      console.error("Failed to clear pending queue:", e);
      return false;
    }
  }

  static async retryPendingQueue(): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry('/api/pending-messages/retry', {
        method: 'POST'
      });
      return res.ok;
    } catch (e) {
      console.error("Failed to trigger pending queue retry:", e);
      return false;
    }
  }

  static async retrySinglePendingMessage(id: string): Promise<boolean> {
    try {
      const res = await this.fetchWithRetry(`/api/pending-messages/retry/${id}`, {
        method: 'POST'
      });
      return res.ok;
    } catch (e) {
      console.error(`Failed to trigger single pending message retry ${id}:`, e);
      return false;
    }
  }

  static async getSystemVersion(): Promise<{ success: boolean; version: string; date: string; turn: string; raw: string } | null> {
    try {
      const res = await this.fetchWithRetry('/api/system/version');
      return await this.safeJson<{ success: boolean; version: string; date: string; turn: string; raw: string }>(res);
    } catch (e) {
      console.error("System Version Error:", e);
      return null;
    }
  }

  static async getConfig(): Promise<any> {
    try {
      const res = await this.fetchWithRetry('/api/config');
      return await this.safeJson<any>(res);
    } catch (e) {
      console.error("Config Fetch Error:", e);
      return null;
    }
  }

  // --- Sandbox Methods ---
  static async sandboxFile(action: 'read' | 'write' | 'list' | 'delete', name?: string, content?: string, confirmed?: boolean): Promise<any> {
    try {
      const res = await this.fetchWithRetry('/api/sandbox/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name, content, confirmed })
      });
      return await this.safeJson<any>(res);
    } catch (e) {
      console.error("Sandbox File Error:", e);
      return { error: String(e) };
    }
  }

  static async sandboxExec(command: string): Promise<any> {
    try {
      const res = await this.fetchWithRetry('/api/sandbox/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      return await this.safeJson<any>(res);
    } catch (e) {
      console.error("Sandbox Exec Error:", e);
      return { error: String(e) };
    }
  }

  static async getAvatarConfig(): Promise<AvatarConfig> {
    const defaultConfig: AvatarConfig = { 
      modelUrl: '/models/hiyori/hiyori_free_t08.model3.json',
      scale: 1,
      xOffset: 0,
      yOffset: 0
    };
    try {
      const res = await this.fetchWithRetry('/api/storage/state/avatar_config');
      if (!res.ok) return defaultConfig;
      const data = await this.safeJson<AvatarConfig>(res);
      return data || defaultConfig;
    } catch (e) {
      return defaultConfig;
    }
  }

  static async setAvatarConfig(config: AvatarConfig): Promise<void> {
    try {
      await this.fetchWithRetry('/api/storage/state/avatar_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    } catch (e) {
      console.error("Failed to save avatar config:", e);
    }
  }
}
