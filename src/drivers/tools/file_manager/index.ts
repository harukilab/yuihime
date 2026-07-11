import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const FileManagerTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const res = await fetch(`${baseUrl}/api/tools/files/manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: args.action,
          source: args.source,
          destination: args.destination,
          path: args.path,
          recursive: args.recursive,
          pattern: args.pattern
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.error || `HTTP error! status: ${res.status}`
        };
      }

      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown network error'
      };
    }
  }
};
