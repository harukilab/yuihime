import { ToolModule } from "@shared/include/types";
import { ChatSummaryEngine } from '@/core/kernel/ChatSummaryEngine';

const manifest = {
  "id": "chat_log",
  "name": "Chat Log",
  "description": "Reads the raw daily chat log for a specific date (default: yesterday). Use this to inspect the exact messages that happened on a given day, e.g. to review what was discussed before deciding to generate or verify a daily summary. Returns the log lines of <chat_logs>/YYYY-MM-DD.log. Omit date for yesterday.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 106,
  "parameters": {
    "type": "object",
    "properties": {
      "date": {
        "type": "string",
        "description": "Target date in YYYY-MM-DD format. Omit to use yesterday."
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of log lines to return (default 100)."
      },
      "tail": {
        "type": "boolean",
        "description": "If true (default), return the last N lines; otherwise the first N lines."
      }
    },
    "required": []
  }
} as const;

const defaultLimit = 100;

export const ChatLogTool: ToolModule = {
  metadata: manifest as any,

  execute: async (args: any) => {
    const rawDate = args?.date ? String(args.date).trim() : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;
    const limit = Number(args?.limit || defaultLimit);
    const tail = args?.tail !== undefined ? Boolean(args.tail) : true;

    try {
      const res = ChatSummaryEngine.getInstance().readDailyLog(date, { limit, tail });
      if (!res.exists) {
        return { success: false, date: res.date, error: `No chat log found for date ${res.date}.` };
      }
      return { success: true, date: res.date, count: res.lines.length, file: res.file, lines: res.lines };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
};

export default ChatLogTool;
