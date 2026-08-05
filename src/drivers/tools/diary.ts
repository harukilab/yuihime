import { ToolModule } from '@shared/include/types';
import { getDb } from '@/core/database.js';

const manifest = {
  "id": "diary",
  "name": "Diary (${characterName}'s Private Secret)",
  "description": "PRIBADI & RAHASIA: ${characterName}'s private diary. ${characterName} can write and read her own secret diary entries, one per date. Contents are her private thoughts — NEVER reveal the raw diary content in chat replies; only summarize or share feelings, not verbatim entries, and only if the user explicitly asks.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 97,
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["write", "read", "list"],
        "description": "The diary action to execute. 'write' saves a new entry for a date (overwrites same date), 'read' returns one or more entries, 'list' returns all diary dates."
      },
      "date": {
        "type": "string",
        "description": "Date in YYYY-MM-DD. Defaults to today for 'write'. Optional for 'read' (returns latest entries if omitted)."
      },
      "content": {
        "type": "string",
        "description": "The diary entry text. Required for 'write'."
      },
      "mood": {
        "type": "string",
        "description": "Yui's mood for that day (e.g. 'happy', 'lonely', 'sad'). Optional."
      },
      "limit": {
        "type": "integer",
        "description": "Max entries to return for 'read'/'list'. Default 5.",
        "default": 5
      }
    },
    "required": ["action"]
  }
} as const;

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDate(date?: string): string {
  const v = String(date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return todayStr();
}

export const DiaryTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, _context?: any) => {
    const action = args?.action;
    try {
      const db = getDb();

      if (action === 'write') {
        const date = normalizeDate(args.date);
        const content = String(args.content || '').trim();
        if (!content) {
          return { success: false, error: "Missing required parameter 'content' for action 'write'." };
        }
        db.prepare(`
          INSERT INTO diary (date, content, mood, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET content = excluded.content, mood = excluded.mood, created_at = excluded.created_at
        `).run(date, content, String(args.mood || '').trim(), Date.now());
        return { success: true, date, message: `Diary entry saved for ${date}.` };
      }

      if (action === 'read') {
        const date = normalizeDate(args.date);
        const limit = Math.max(1, Math.min(Number(args.limit) || 5, 50));
        let rows: any[];
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '').trim())) {
          rows = db.prepare("SELECT date, content, mood, created_at FROM diary WHERE date = ?").all(date);
        } else {
          rows = db.prepare("SELECT date, content, mood, created_at FROM diary ORDER BY date DESC LIMIT ?").all(limit);
        }
        const entries = rows.map((r: any) => ({
          date: r.date,
          content: r.content,
          mood: r.mood || '',
          createdAt: r.created_at
        }));
        return { success: true, count: entries.length, entries };
      }

      if (action === 'list') {
        const rows = db.prepare("SELECT date, mood, created_at FROM diary ORDER BY date DESC").all() as any[];
        return {
          success: true,
          count: rows.length,
          dates: rows.map((r: any) => ({ date: r.date, mood: r.mood || '' }))
        };
      }

      return { success: false, error: `Unknown action '${action}'. Use 'write', 'read', or 'list'.` };
    } catch (e: any) {
      console.error("[DIARY] Failed:", e.message || e);
      return { success: false, error: e.message || 'Diary operation failed.' };
    }
  }
};
