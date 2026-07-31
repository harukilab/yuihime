import { ToolModule } from "@shared/include/types";
import manifest from "./manifest.json";
import { ChatSummaryEngine } from '@/core/kernel/ChatSummaryEngine';

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
        return { success: false, date: res.date, error: `Tidak ada log obrolan untuk tanggal ${res.date}.` };
      }
      return { success: true, date: res.date, count: res.lines.length, file: res.file, lines: res.lines };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
};

export default ChatLogTool;
