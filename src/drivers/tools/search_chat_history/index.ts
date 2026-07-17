import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const SearchChatHistoryTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context: any) => {
    const scope = args.scope || 'chat';
    const limit = typeof args.limit === 'number' ? args.limit : 20;
    const offset = Math.max(Number(args.offset) || 0, 0);

    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;

    try {
      const results: any[] = [];

      // Chat history search (across paired channels)
      if (scope === 'chat' || scope === 'all') {
        const payload = {
          query: args.query || "",
          platform: args.platform || "all",
          limit: scope === 'all' ? Math.ceil(limit / 2) : limit,
          contextId: context.contextId || "",
          senderName: context.senderName || "",
          viewerIdentityId: context.viewerIdentity?.id || ""
        };
        const res = await fetch(`${baseUrl}/api/tools/chat/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.results)) {
            for (const r of data.results) {
              results.push({ source: 'chat', ...r });
            }
          } else if (Array.isArray(data)) {
            for (const r of data) results.push({ source: 'chat', ...r });
          }
        }
      }

      // Memory / knowledge base search
      if (scope === 'memory' || scope === 'all') {
        const params = new URLSearchParams({
          query: args.query || "",
          limit: String(scope === 'all' ? Math.ceil(limit / 2) : limit)
        });
        if (args.memoryType) params.set('type', String(args.memoryType));
        const res = await fetch(`${baseUrl}/api/tools/memory-search?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.results)) {
            for (const r of data.results) {
              results.push({ source: 'memory', ...r });
            }
          }
        }
      }

      const totalAvailable = results.length;
      const page = results.slice(offset, offset + limit);

      return {
        success: true,
        scope,
        query: args.query || "",
        count: page.length,
        totalAvailable,
        offset,
        results: page
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Network or internal error: ${e.message || e}`
      };
    }
  }
};
