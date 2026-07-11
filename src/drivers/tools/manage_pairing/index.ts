import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const ManagePairingTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    if (args.action !== 'generate_code_for_user') {
      return { success: false, error: `Operasi '${args.action}' tidak dikenal.` };
    }

    if (!args.claimedName) {
      return { success: false, error: 'claimedName wajib dicantumkan.' };
    }

    try {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}/api/pair/generate-code-tool`
        : `${window.location.origin}/api/pair/generate-code-tool`;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimedName: args.claimedName,
          chatType: context?.chatType || '',
          userName: context?.userName || '',
          contextId: context?.contextId || ''
        })
      });
      return await res.json();
    } catch (err: any) {
      console.error("[TOOL_MANAGE_PAIRING] Error:", err);
      return { success: false, error: `Gagal memproses penyandingan: ${err.message}` };
    }
  }
};
