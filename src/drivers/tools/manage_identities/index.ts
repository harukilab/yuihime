import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const ManageIdentitiesTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    try {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}/api/identities/tool-update`
        : `${window.location.origin}/api/identities/tool-update`;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: args.action,
          perceivedName: args.perceivedName,
          realName: args.realName,
          fact: args.fact,
          yuiPerspective: args.yuiPerspective,
          contextId: context?.contextId || '',
          userName: context?.userName || '',
          chatType: context?.chatType || '',
          viewerId: context?.viewerIdentity?.id || ''
        })
      });
      return await res.json();
    } catch (err: any) {
      console.error("[TOOL_MANAGE_IDENTITIES] Error executing tool:", err);
      return { success: false, error: `Gagal memproses perubahan identitas: ${err.message}` };
    }
  }
};
