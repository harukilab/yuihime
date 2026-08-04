import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "update_user_profile",
  "name": "Update User Profile",
  "description": "Used by Yui to update the current user's profile details in her memory. Use this dynamically in chats whenever they ask you to call them a different nickname, share a new personal fact, delete a fact, or when you synthesize/update your subjective perspective of them.",
  "type": "TOOL",
  "version": "1.0.0",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["update_nickname", "set_real_name", "add_fact", "remove_fact", "update_perspective"],
        "description": "The identity action to execute. 'update_nickname' changes their moniker, 'set_real_name' registers/saves their real human name, 'add_fact' integrates a factual insight, 'remove_fact' discards a fact, and 'update_perspective' edits your subjective viewpoint of them."
      },
      "perceivedName": {
        "type": "string",
        "description": "The new nickname they want to be called (required for 'update_nickname')"
      },
      "realName": {
        "type": "string",
        "description": "The true real name of the user (required for 'set_real_name')"
      },
      "fact": {
        "type": "string",
        "description": "The fact string to insert or remove (required for 'add_fact' and 'remove_fact')"
      },
      "yuiPerspective": {
        "type": "string",
        "description": "Your updated subjective/emotional perspective of this user (required for 'update_perspective')"
      }
    },
    "required": ["action"]
  }
} as const;

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
