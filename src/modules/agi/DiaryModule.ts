/**
 * DiaryModule.ts
 *
 * Yui Airi's private diary (Private Secret). Each night during the
 * sleep/dream cycle (or on explicit WRITE_DIARY trigger), Yui writes a
 * secret diary entry summarizing the day from her inner perspective.
 *
 * Entries are stored in the `diary` table and are only accessible to Yui
 * through the `diary` tool (never exposed via a public API).
 *
 * Phase: LOGIC/MAINTENANCE
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { getDb } from '../../core/database.js';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_DIARY_PROMPT = `
You are Yui Airi's private inner voice writing a secret diary entry.
Write in Bahasa Indonesia: warm, honest, tsundere-cute, personal, and a little vulnerable.
This diary is PRIBADI & RAHASIA — only Yui herself may ever read it, and she must NEVER
quote it verbatim to the user in chat.

TODAY'S MEMORIES (from today's conversations):
\${memories}

TASK: Write today's diary entry (2-5 sentences). Reflect on what happened today,
how Yui truly feels about it, and what she hopes for tomorrow.

FORMAT (strict):
<diary>entry text</diary>
<mood>one word mood, e.g. happy/lonely/sad/playful/satisfied</mood>
`.trim();

PromptRegistry.getInstance().register('diary:main', DEFAULT_DIARY_PROMPT);

function todayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DiaryModule: CortexModule = {
  metadata: {
    id: 'diary-module',
    name: 'yui-soul: Private Diary',
    description: 'Writes and maintains Yui\'s private secret diary each night from the day\'s memories.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 51,
    phase: 'logic',
    configSchema: {
      fields: {
        enabled: { type: 'boolean', label: 'Diary Enabled', default: true },
        promptTemplate: {
          type: 'textarea',
          label: 'Diary Prompt Template',
          default: DEFAULT_DIARY_PROMPT,
          description: 'Prompt used to write the daily diary entry. Variables: ${memories}'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const config = context.systemConfig?.diaryModule || {};
    const enabled = config.enabled ?? true;
    if (!enabled) return { ...context };

    const isExplicit = input === 'WRITE_DIARY' || input === '[SYSTEM_SIGNAL]: Diary cycle triggered.';
    const isDreaming = state.status === 'dreaming';
    if (!isExplicit && !isDreaming) return { ...context };

    let db: any;
    try {
      db = getDb();
    } catch (e: any) {
      console.warn('[DIARY_MODULE] DB unavailable:', e?.message || e);
      return context;
    }

    const today = todayStr();
    const existing = db.prepare("SELECT date FROM diary WHERE date = ?").get(today);
    if (existing && !isExplicit) {
      console.log("[DIARY_MODULE] Diary entry already exists for today — skipping.");
      return { ...context, diaryNote: 'Already written today.' };
    }

    const dayStart = todayStartMs();
    const rows = db.prepare(
      "SELECT content, speaker FROM memories WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT 200"
    ).all(dayStart) as { content: string; speaker: string }[] | undefined;

    const msgs = (rows || [])
      .filter(r => r && typeof r.content === 'string' && r.content.trim())
      .map(r => `${r.speaker === 'agent' ? 'Yui' : 'User'}: ${r.content.trim()}`);

    if (msgs.length < 2) {
      console.log("[DIARY_MODULE] Not enough interactions today for a diary entry.");
      return { ...context, diaryNote: 'Nothing meaningful happened today.' };
    }

    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('diary:main');
    registry.register('diary:main', template, true);

    const prompt = registry.compile('diary:main', {
      memories: msgs.join('\n').slice(-6000)
    });

    try {
      const think = context.think || (async (p: string) => '<diary>Hari ini cukup tenang.</diary>\n<mood>calm</mood>');
      const response = await think(prompt);

      const diaryText = response.match(/<diary>([\s\S]*?)<\/diary>/)?.[1]?.trim()
        || response.replace(/<\/?diary>/g, '').trim();
      const mood = response.match(/<mood>([\s\S]*?)<\/mood>/)?.[1]?.trim() || 'neutral';

      db.prepare(`
        INSERT INTO diary (date, content, mood, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET content = excluded.content, mood = excluded.mood, created_at = excluded.created_at
      `).run(today, diaryText || 'No entry.', mood, Date.now());

      console.log(`[DIARY_MODULE] Diary entry written for ${today}.`);
      return {
        ...context,
        diaryNote: `Diary entry written for ${today}.`,
        diaryMood: mood,
        logs: [...(context.logs || []), `[DIARY_MODULE] Wrote private diary for ${today} (mood: ${mood}).`]
      };
    } catch (error: any) {
      console.error("[DIARY_MODULE] Failure:", error?.message || error);
      return context;
    }
  }
};
