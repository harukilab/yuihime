import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "send_file",
  "name": "Send File Attachment",
  "description": "Sends and delivers an existing file from Yui's sandbox workspace (user_data) back to the user via the active Telegram or Discord channel or a specified recipient.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 205,
  "parameters": {
    "type": "object",
    "properties": {
      "filename": {
        "type": "string",
        "description": "The name of the file currently residing in Yui's local sandbox data folder (e.g. 'summary.pdf' or 'photo.jpg')."
      },
      "caption": {
        "type": "string",
        "description": "An optional text caption/message to accompany the file."
      },
      "recipient": {
        "type": "string",
        "description": "Optional Telegram username, perceived name, or raw Chat ID to send to. If left blank, Yui will automatically deliver it to the active conversational chat channel."
      }
    },
    "required": ["filename"]
  }
} as const;

export const SendFileTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    try {
      const parentContext = context || {};
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const res = await fetch(`${baseUrl}/api/tools/files/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: args.filename,
          caption: args.caption,
          recipient: args.recipient,
          contextId: parentContext.contextId
        })
      });
      return res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
};
