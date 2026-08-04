import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "download_file",
  "name": "Download External URL",
  "description": "Downloads any file, backup, data sheet, image, or ZIP archive from a public URL on the internet and saves it safely in the local user_data sandbox environment.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 204,
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The precise public HTTP or HTTPS web URL of the file to download."
      },
      "filename": {
        "type": "string",
        "description": "The target path to save the file in the workspace sandbox. You MUST specify the full path starting with 'user_data/' (e.g. 'user_data/spreadsheet.csv') or absolute '/app/user_data/' path. If left empty, Yui will intelligently guess the filename."
      }
    },
    "required": ["url"]
  }
} as const;

export const DownloadFileTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const res = await fetch(`${baseUrl}/api/tools/files/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: args.url, filename: args.filename })
      });
      return res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
};
