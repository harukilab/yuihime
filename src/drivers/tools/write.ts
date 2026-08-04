import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "write",
  "name": "Write",
  "description": "Write content to one file. Relative paths resolve within the active Location. Returns the written resource and whether the file already existed.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 101,
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "File path to write. Relative paths resolve from the active location; absolute paths inside the location are accepted (e.g. 'user_data/notes.txt')."
      },
      "content": { "type": "string", "description": "Content to write to the file" }
    },
    "required": ["path", "content"]
  }
} as const;

export const FileWriteTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const target = args.path || args.filename;
    if (!target) return { success: false, error: 'path is required' };
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const res = await fetch(`${baseUrl}/api/tools/files/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, content: args.content })
    });
    const data = await res.json();
    if (data.existed !== undefined) return data;
    return {
      operation: 'write',
      target: data.path || target,
      resource: data.path || target,
      existed: data.existed ?? false,
      ...data
    };
  }
};
