import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "search_chat",
  "name": "Search Chat",
  "description": "Searches all past conversational chat history and message logs across all connected and paired channels (Web, Telegram, Discord, Live Stream) associated with the current user profile or account to retrieve, recall, or summarize previous discussions.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 104,
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Optional keyword, text phrase, or topic to search for in past messages and/or memory."
      },
      "scope": {
        "type": "string",
        "description": "What to search across: 'chat' (conversational history across paired channels), 'memory' (persistent knowledge base & recalled facts), or 'all' (both merged).",
        "enum": ["chat", "memory", "all"],
        "default": "chat"
      },
      "platform": {
        "type": "string",
        "description": "Optional platform filter to limit chat searches to. Allowed: 'web', 'telegram', 'discord', 'all'. Default is 'all'.",
        "enum": ["web", "telegram", "discord", "all"]
      },
      "memoryType": {
        "type": "string",
        "description": "Optional memory-type filter when scope includes 'memory' (e.g., 'knowledge', 'chat', 'note'). Omit to search everything."
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to retrieve. Default is 20.",
        "default": 20
      },
      "offset": {
        "type": "number",
        "description": "Number of results to skip before collecting the page (default 0). Use together with 'limit' to paginate.",
        "default": 0
      }
    },
    "required": []
  }
} as const;

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
