import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "daily_summary",
  "name": "Daily Summary",
  "description": "Reads or generates the daily chat summary for a specific date (default: yesterday). Use this when the user asks what happened yesterday, last night, or on a past day — instead of searching all raw chat messages. 'read' fetches the existing stored daily summary; 'generate' creates one on the fly from the daily chat log.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 105,
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "description": "'read' to fetch an existing daily summary, or 'generate' to create one on the fly from that day's chat log.",
        "enum": ["read", "generate"],
        "default": "read"
      },
      "date": {
        "type": "string",
        "description": "Target date in YYYY-MM-DD format. Omit to use yesterday."
      }
    },
    "required": []
  }
} as const;

function yesterdayKey(): string {
  const d = new Date(Date.now() - 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const DailySummaryTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const action = args?.action === 'generate' ? 'generate' : 'read';
    const rawDate = args?.date ? String(args.date).trim() : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
    const targetDate = date || yesterdayKey();

    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;

    try {
      if (action === 'generate') {
        const res = await fetch(`${baseUrl}/api/cortex/chat-summary/daily`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: targetDate })
        });
        const data = await res.json();
        if (!data.success) {
          return { success: false, action, date: targetDate, error: data.reason === 'no_log' ? `No chat log found for date ${targetDate}.` : data.error || data.reason || 'Failed to generate daily summary.' };
        }
        return { success: true, action, date: data.date, summary: data.summary };
      }

      // read
      const res = await fetch(`${baseUrl}/api/cortex/chat-summary/daily?date=${encodeURIComponent(targetDate)}`);
      if (res.status === 404) {
        return { success: false, action, date: targetDate, error: `No daily summary exists yet for date ${targetDate}. Use the 'generate' action to create one.` };
      }
      const data = await res.json();
      if (!data.success) {
        return { success: false, action, date: targetDate, error: data.error || 'Failed to fetch daily summary.' };
      }
      return { success: true, action, date: data.date, summary: data.summary };
    } catch (e: any) {
      return { success: false, action, date: targetDate, error: `Network or internal error: ${e.message || e}` };
    }
  }
};
