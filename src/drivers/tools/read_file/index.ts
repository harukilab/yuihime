import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const FileReadTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer 
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const res = await fetch(`${baseUrl}/api/tools/files/read?filename=${encodeURIComponent(args.filename)}`);
    return res.json();
  }
};
