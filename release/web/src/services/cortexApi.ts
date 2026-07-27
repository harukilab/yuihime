export class CortexApi {
  static async think(params: {
    input: string;
    memories?: any[];
    dreams?: any[];
    capabilities?: any[];
    state?: any;
    heuristics?: any[];
    userName?: string;
    identities?: any[];
    activePersona?: any;
    contextId?: string;
    chatType?: string;
    attachments?: any[];
    stream?: boolean;
    signal?: AbortSignal;
  }): Promise<any> {
    const res = await fetch('/api/cortex/think', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: params.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async dream(state: any, memories?: any[], dreams?: any[]): Promise<any> {
    const res = await fetch('/api/cortex/dream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, memories, dreams })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async consolidate(memories?: any[]): Promise<any> {
    const res = await fetch('/api/cortex/consolidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async optimize(memories: any[], state: any): Promise<any> {
    const res = await fetch('/api/cortex/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories, state })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async extractKnowledge(memories: any[], knowledge: any[]): Promise<any> {
    const res = await fetch('/api/cortex/extract-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories, knowledge })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async reflect(params: {
    input: string;
    memories?: any[];
    dreams?: any[];
    capabilities?: any[];
    state?: any;
    heuristics?: any[];
    userName?: string;
    identities?: any[];
    activePersona?: any;
    contextId?: string;
    chatType?: string;
  }): Promise<any> {
    const res = await fetch('/api/cortex/reflect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async moderateChatBatch(messages: any[], topic: string): Promise<any> {
    const res = await fetch('/api/cortex/moderate-chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, topic })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async startPulse(intervalMs?: number): Promise<any> {
    const res = await fetch('/api/cortex/pulse/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalMs })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async stopPulse(): Promise<any> {
    const res = await fetch('/api/cortex/pulse/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  static async getCircuitStatus(): Promise<any> {
    const res = await fetch('/api/cortex/circuits/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
}
