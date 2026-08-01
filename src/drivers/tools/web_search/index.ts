import { ToolModule } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { AIService } from '../../../core/kernel/ai.js';
import { StandardizedProcessor } from '../../../core/kernel/processor';
import manifest from './manifest.json';

function normalizeSearchResult(r: any): any {
  const title = typeof r.title === 'string' ? r.title : String(r.title || '');
  const url = typeof r.url === 'string' ? r.url : String(r.url || '');
  const snippet = typeof r.snippet === 'string' ? r.snippet : String(r.snippet || '');
  const score = typeof r.score === 'number' ? r.score : undefined;
  const published_date = typeof r.published_date === 'string' ? r.published_date : undefined;

  if (!title && !url && !snippet) {
    return null;
  }

  return {
    title,
    url,
    snippet,
    ...(score !== undefined ? { score } : {}),
    ...(published_date !== undefined ? { published_date } : {})
  };
}

export const WebSearchTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args) => {
    const query = String(args.query || '').trim();
    if (!query) {
      return [];
    }

    const config = await SystemRegistry.getConfig('web_search');
    const top_k = Math.max(1, Math.min(20, Number(args.top_k || config.maxResults || 5)));

    const execution = await StandardizedProcessor.executeStandardized(
      'web_search',
      '1.0.0',
      { query, top_k },
      async () => {
        const isServer = typeof window === 'undefined';
        let rawResults: any[] = [];

        if (isServer) {
          try {
            const results = await AIService.getInstance().search(query);
            rawResults = Array.isArray(results) ? results : [];
          } catch (importErr: any) {
            console.warn("[SEARCH] Direct AIService search failed:", importErr.message);
            rawResults = [];
          }
        } else {
          try {
            const baseUrl = window.location.origin;
            const res = await fetch(`${baseUrl}/api/tools/search?query=${encodeURIComponent(query)}&top_k=${encodeURIComponent(String(top_k))}`);
            if (res.ok) {
              const data = await res.json();
              rawResults = Array.isArray(data) ? data : [];
            }
          } catch (fetchErr: any) {
            console.warn("[SEARCH] Client-side fetch to /api/tools/search failed:", fetchErr.message);
            rawResults = [];
          }
        }

        if (!Array.isArray(rawResults) || rawResults.length === 0) {
          return [];
        }

        const sliced = rawResults.slice(0, top_k);
        const normalized = sliced.map(normalizeSearchResult).filter((r: any) => r !== null);

        if (normalized.length === 0) {
          return [];
        }

        return normalized;
      }
    );

    if (execution.feedback.status === 'success' && Array.isArray(execution.output) && execution.output.length > 0) {
      return execution.output;
    }

    return [{
      title: 'Pencarian Web Sedang Dalam Perbaikan',
      snippet: 'Layanan pencarian web Yui sedang dalam perbaikan dan gagal merespons tepat waktu (kendala teknis/network). Sampaikan ke user bahwa fitur pencarian web sedang diperbaiki, lalu bantu dengan jawaban terbaikmu tanpa data web real-time.',
      url: ''
    }];
  }
};

