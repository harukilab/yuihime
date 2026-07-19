import { ToolModule } from '@shared/include/types';
import manifest from './manifest.json';

export const FileReadTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const params = new URLSearchParams({ filename: String(args.filename) });
    if (args.limit !== undefined) params.set('limit', String(args.limit));
    if (args.offset !== undefined) params.set('offset', String(args.offset));
    if (args.line_start !== undefined) params.set('line_start', String(args.line_start));
    if (args.line_end !== undefined) params.set('line_end', String(args.line_end));
    const res = await fetch(`${baseUrl}/api/tools/files/read?${params.toString()}`);
    return res.json();
  }
};
