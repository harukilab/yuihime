import { ToolModule } from '@shared/include/types';
import { getDb } from '@/core/database.js';
import manifest from './manifest.json';

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
