import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "edit",
  "name": "Edit",
  "description": "Replace exact text in one file. Relative paths resolve within the active Location. Returns the edited resource and the number of replacements applied.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 102,
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "File path to edit. Relative paths resolve from the active location; absolute paths inside the location are accepted."
      },
      "oldString": {
        "type": "string",
        "description": "Exact text to replace"
      },
      "newString": {
        "type": "string",
        "description": "Replacement text, which must differ from oldString"
      },
      "replaceAll": {
        "type": "boolean",
        "description": "Replace all exact occurrences of oldString (default false)"
      }
    },
    "required": ["path", "oldString", "newString"]
  }
} as const;

const previewLines = (value: string, prefix: "+" | "-") => {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const shown = lines.slice(0, 6).map((line) => `${prefix}${line.length > 240 ? `${line.slice(0, 240)}...` : line}`);
  if (lines.length > shown.length) shown.push(`${prefix}...`);
  return shown;
};

const toModelOutput = (output: any, oldString: string, newString: string) =>
  [
    `Edited file successfully: ${output.resource}`,
    `Replacements: ${output.replacements}`,
    "```diff",
    ...previewLines(oldString, "-"),
    ...previewLines(newString, "+"),
    "```",
  ].join("\n");

export const EditFileSegmentTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const target = args.path || args.filename;
    if (!target) return { success: false, error: 'path is required' };
    if (args.oldString !== undefined && args.oldString === args.newString) {
      return { success: false, error: "No changes to apply: oldString and newString are identical." };
    }
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const body: any = {
      path: target,
      oldString: args.oldString,
      newString: args.newString,
      replaceAll: args.replaceAll,
      changes: args.changes
    };
    if (args.search !== undefined) body.search = args.search;
    if (args.replace !== undefined) body.replace = args.replace;
    const res = await fetch(`${baseUrl}/api/tools/files/edit-segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success && data.resource && data.replacements !== undefined) {
      return { ...data, output: toModelOutput(data, args.oldString, args.newString) };
    }
    return data;
  }
};
