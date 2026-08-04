import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "glob",
  "name": "Glob",
  "description": "Find files by glob pattern within the active Location. Returns concise relative file resources. Use a path to narrow the search and limit to bound the result count.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 103,
  "parameters": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "Glob pattern to match files against (e.g. '*.ts', '**/*.json')" },
      "path": { "type": "string", "description": "Relative directory to search. Defaults to the active Location." },
      "limit": { "type": "integer", "description": "Maximum results to return" }
    },
    "required": ["pattern"]
  }
} as const;

const toModelOutput = (output: any) => {
  const lines = !output.items || output.items.length === 0
    ? ["No files found"]
    : output.items.map((item: any) => item.path);
  if (output.truncated) lines.push("", `(Results truncated: showing first ${output.items.length} files.)`);
  if (output.partial) lines.push("", "(Some discovered files could not be read.)");
  return lines.join("\n");
};

export const FileListTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any = {}) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const params = new URLSearchParams();
    if (args.pattern !== undefined) params.set('pattern', String(args.pattern));
    if (args.path !== undefined) params.set('path', String(args.path));
    if (args.limit !== undefined) params.set('limit', String(args.limit));
    if (args.offset !== undefined) params.set('offset', String(args.offset));
    const qs = params.toString();
    const res = await fetch(`${baseUrl}/api/tools/files/list${qs ? '?' + qs : ''}`);
    const data = await res.json();
    if (data.success) {
      return { ...data, output: toModelOutput(data) };
    }
    return data;
  }
};
