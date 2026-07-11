import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const SearchChatHistoryTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context: any) => {
    const payload = {
      query: args.query || "",
      platform: args.platform || "all",
      limit: typeof args.limit === 'number' ? args.limit : 20,
      contextId: context.contextId || "",
      senderName: context.senderName || "",
      viewerIdentityId: context.viewerIdentity?.id || ""
    };

    try {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const res = await fetch(`${baseUrl}/api/tools/chat/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Failed to query search API: ${res.statusText}`
        };
      }

      return await res.json();
    } catch (e: any) {
      return {
        success: false,
        error: `Network or internal error: ${e.message || e}`
      };
    }
  }
};
