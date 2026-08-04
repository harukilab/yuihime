import { ToolModule } from '@shared/include/types';

const manifest = {
  id: 'grep',
  name: 'Grep',
  description: 'Search file contents by regular expression within the active Location. Use a path to narrow the search, include to filter files by glob, and limit to bound the match count. Returns concise file resources, line numbers, and bounded line previews.',
  version: '1.0.0',
  type: 'TOOL',
  order: 103,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for in file contents' },
      path: { type: 'string', description: 'Relative directory to search. Defaults to the active Location.' },
      include: { type: 'string', description: 'File glob to include in the search (for example, "*.ts" or "*.{ts,tsx}")' },
      limit: { type: 'integer', description: 'Maximum matches to return (default 100, max 500)' }
    },
    required: ['pattern']
  }
} as const;

export const GrepTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const res = await fetch(`${baseUrl}/api/tools/grep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: args.pattern, path: args.path, include: args.include, limit: args.limit })
    });
    const data = await res.json();
    return data;
  }
};
