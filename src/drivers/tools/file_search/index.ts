import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const FileSearchTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const query = args && args.query ? String(args.query) : '';
      if (!query.trim()) return { success: false, error: 'Query is required' };
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
      const type = args && args.type ? String(args.type) : undefined;

      const isServer = typeof window === 'undefined';
      let hits: any[] = [];

      if (isServer) {
        const { searchMemories } = await import('../../../core/memorySearch.js');
        hits = await searchMemories(query, limit, type);
      } else {
        const baseUrl = window.location.origin;
        const params = new URLSearchParams({ query, limit: String(limit) });
        if (type) params.set('type', type);
        const res = await fetch(`${baseUrl}/api/tools/memory-search?${params.toString()}`);
        const data = await res.json();
        hits = data && Array.isArray(data.results) ? data.results : [];
      }

      const results = hits.map((h: any) => ({
        id: h.id,
        score: Number(h.score || 0).toFixed(2),
        type: h.type || 'memory',
        timestamp: h.timestamp ? new Date(h.timestamp).toISOString() : undefined,
        tags: h.tags || [],
        snippet: (h.content || '').slice(0, 600)
      }));

      const content = results
        .map((r: any, i: number) => `[${i + 1}] (${r.type}, score ${r.score}${r.timestamp ? ', ' + r.timestamp : ''}) ${r.snippet}`)
        .join('\n\n');

      return {
        success: true,
        query,
        count: results.length,
        results,
        content: content || 'No matching memories found.'
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
