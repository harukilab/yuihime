import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "read",
  "name": "Read",
  "description": "Read a text file or page through it by line offset, or list a directory page. Relative paths resolve from the active location; absolute paths are read directly.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 102,
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Path of the file or directory to read. Relative paths resolve from the active location."
      },
      "offset": {
        "type": "integer",
        "description": "The 1-based directory entry or text line offset to start reading from."
      },
      "limit": {
        "type": "integer",
        "description": "The maximum number of directory entries or text lines to read."
      }
    },
    "required": ["path"]
  }
} as const;

export const FileReadTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const target = args.path || args.filename;
    if (!target) return { success: false, error: 'path is required' };
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const params = new URLSearchParams({ path: String(target) });
    if (args.offset !== undefined) params.set('offset', String(args.offset));
    if (args.limit !== undefined) params.set('limit', String(args.limit));
    if (args.line_start !== undefined) params.set('line_start', String(args.line_start));
    if (args.line_end !== undefined) params.set('line_end', String(args.line_end));
    const res = await fetch(`${baseUrl}/api/tools/files/read?${params.toString()}`);
    return res.json();
  }
};
