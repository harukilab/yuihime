export class GlobalOutputDeduplicator {
  private static instance: GlobalOutputDeduplicator;
  private recentOutputs: Map<string, number> = new Map();
  private readonly windowMs: number = 300000;

  private constructor() {}

  public static getInstance(): GlobalOutputDeduplicator {
    if (!GlobalOutputDeduplicator.instance) {
      GlobalOutputDeduplicator.instance = new GlobalOutputDeduplicator();
    }
    return GlobalOutputDeduplicator.instance;
  }

  private hash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  public isDuplicate(content: string, contextKey: string): boolean {
    if (!content || !contextKey) return false;
    const key = `${contextKey}:${this.hash(content)}`;
    const now = Date.now();
    this.cleanup(now);
    return this.recentOutputs.has(key);
  }

  public markSent(content: string, contextKey: string): void {
    if (!content || !contextKey) return;
    const key = `${contextKey}:${this.hash(content)}`;
    this.recentOutputs.set(key, Date.now());
  }

  private cleanup(now: number): void {
    for (const [key, ts] of this.recentOutputs) {
      if (now - ts > this.windowMs) {
        this.recentOutputs.delete(key);
      }
    }
  }
}
