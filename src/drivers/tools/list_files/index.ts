import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const FileListTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any = {}) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set('limit', String(args.limit));
    if (args.offset !== undefined) params.set('offset', String(args.offset));
    const qs = params.toString();
    const res = await fetch(`${baseUrl}/api/tools/files/list${qs ? '?' + qs : ''}`);
    return res.json();
  }
};
