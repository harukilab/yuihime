import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "pair_account",
  "name": "Pair Account",
  "description": "Used ONLY when an external chat client (Telegram, Discord, etc.) wants to claim an identity from the Web app (e.g., claiming to be 'Aldi'). Under the hood, this generates a secure 6-digit random code that the user MUST enter in their Web console to complete the link securely.",
  "type": "TOOL",
  "version": "1.0.0",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["generate_code_for_user"],
        "description": "The pairing operation to perform. 'generate_code_for_user' creates a 10-minute temporary claim code."
      },
      "claimedName": {
        "type": "string",
        "description": "The name of the Web identity/friend profile the external user claims to be (e.g. 'Aldi')"
      }
    },
    "required": ["action", "claimedName"]
  }
} as const;

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
