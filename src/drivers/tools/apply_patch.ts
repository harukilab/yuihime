import { ToolModule } from '@shared/include/types';

const manifest = {
  id: 'apply_patch',
  name: 'Apply Patch',
  description: 'Apply a unified diff patch to one or more files. Supports add, update, and delete operations.',
  version: '1.0.0',
  type: 'TOOL',
  order: 105,
  parameters: {
    type: 'object',
    properties: {
      patchText: {
        type: 'string',
        description: 'The full unified diff patch text describing add, update, and delete operations'
      }
    },
    required: ['patchText']
  }
} as const;

export const ApplyPatchTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    if (!args.patchText || !args.patchText.trim()) {
      return { success: false, error: 'patchText is required and must not be empty' };
    }

    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;

    try {
      const res = await fetch(`${baseUrl}/api/tools/apply-patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patchText: args.patchText })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};
