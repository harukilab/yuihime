import { ToolModule } from '@shared/include/types';
import manifest from './manifest.json';

export const ShellTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer 
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const res = await fetch(`${baseUrl}/api/tools/shell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: args.command })
    });
    return res.json();
  }
};
