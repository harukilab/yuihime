import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

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
