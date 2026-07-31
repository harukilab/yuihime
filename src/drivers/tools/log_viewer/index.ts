import { ToolModule } from "@shared/include/types";
import manifest from "./manifest.json";
import { readLogLines, DEFAULT_LOG_DIR_PATH } from '@/core/fileLogger';

const defaultLimit = 50;

export const LogViewerTool: ToolModule = {
  metadata: {
    ...(manifest as any),
    configSchema: {
      fields: {
        logDir: { type: 'string', label: 'Log directory', default: DEFAULT_LOG_DIR_PATH }
      }
    }
  },

  execute: async (args: any, context: any) => {
    const category = (args.category || 'tools').toString();
    const limit = Number(args.limit || defaultLimit);
    const tail = args.tail !== undefined ? Boolean(args.tail) : true;
    const baseDir = args.logDir || undefined;

    try {
      const lines = readLogLines(category, { limit, tail, baseDir, includeArchives: true });
      const parsed = lines.map(l => {
        try { return JSON.parse(l); } catch { return { raw: l }; }
      });
      return { status: 'success', items: parsed, count: parsed.length };
    } catch (e: any) {
      return { status: 'error', message: e?.message || String(e) };
    }
  }
};

export default LogViewerTool;
