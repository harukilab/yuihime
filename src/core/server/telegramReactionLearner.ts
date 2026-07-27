import { NanoBrain } from '../neural/Brain';

const TELEGRAM_ALLOWED_REACTIONS = new Set([
  '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤨', '😐',
  '😢', '😭', '😡', '🥱', '😱', '🤯', '🤩', '😍', '🤗', '🤔',
  '😅', '😎', '🥳', '💯', '🤝', '✅', '🤡', '🤮', '🥲', '🤤',
  '🤑', '😱'
]);

const DEFAULT_SENTIMENT_EMOJI_MAP: Record<string, string[]> = {
  CASUAL: ['👍', '✅', '🤝', '👏', '😅'],
  COMPLIMENT: ['❤️', '🥰', '😍', '🔥', '👍'],
  INSULT: ['😡', '🤨', '🤔', '😐', '👎'],
  EMPATHY_SAD: ['😢', '🤗', '🥲', '😭', '🤝'],
  TEASING: ['😁', '🔥', '😎', '🥳', '😱']
};

export class TelegramReactionLearner {
  private static instance: TelegramReactionLearner | null = null;
  private brain: NanoBrain;
  private db: any = null;

  private constructor() {
    this.brain = NanoBrain.getInstance();
  }

  public static getInstance(): TelegramReactionLearner {
    if (!TelegramReactionLearner.instance) {
      TelegramReactionLearner.instance = new TelegramReactionLearner();
    }
    return TelegramReactionLearner.instance;
  }

  public setDb(db: any) {
    this.db = db;
  }

  public async init() {
    try {
      await this.brain.loadWeightsFromStorage();
    } catch (e) {
      console.warn('[TG_REACTION] NanoBrain load failed, using baseline weights.');
    }

    if (this.db && !(globalThis as any).__tgReactionTrained) {
      (globalThis as any).__tgReactionTrained = true;
      setTimeout(() => {
        this.trainOnTelegramHistory(this.db, 200).catch(() => {});
        this.decayOldFeedback().catch(() => {});
      }, 3000);
    }
  }

  public classify(text: string): string {
    try {
      const result = this.brain.predict(text || '');
      return result.dominantClass || 'CASUAL';
    } catch (e) {
      return 'CASUAL';
    }
  }

  public async pickEmoji(chatId: number, tgId: number, text: string): Promise<string> {
    const sentiment = this.classify(text);
    const pool = DEFAULT_SENTIMENT_EMOJI_MAP[sentiment] || DEFAULT_SENTIMENT_EMOJI_MAP.CASUAL;

    if (!this.db) {
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const rows = this.db.prepare(`
      SELECT emoji_used, COUNT(*) as total, SUM(user_replied) as wins
      FROM telegram_reaction_feedback
      WHERE chat_id = ? AND sentiment_class = ?
      GROUP BY emoji_used
      ORDER BY wins DESC, total DESC
    `).all(chatId, sentiment) as any[];

    let bestEmoji: string | null = null;
    let bestWinRate = -1;

    for (const row of rows) {
      const winRate = row.wins / row.total;
      if (winRate > bestWinRate) {
        bestWinRate = winRate;
        bestEmoji = row.emoji_used;
      }
    }

    if (bestEmoji && TELEGRAM_ALLOWED_REACTIONS.has(bestEmoji)) {
      return bestEmoji;
    }

    const filtered = pool.filter(e => TELEGRAM_ALLOWED_REACTIONS.has(e));
    if (filtered.length === 0) return '❤️';

    if (rows.length > 0) {
      const available = filtered.filter(e =>
        !rows.some(r => r.emoji_used === e)
      );
      if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
      }
    }

    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  public async recordReaction(
    chatId: number,
    tgId: number,
    messageText: string,
    emoji: string,
    userReplied: boolean
  ): Promise<void> {
    if (!this.db) return;

    try {
      this.db.prepare(`
        INSERT INTO telegram_reaction_feedback (chat_id, tg_id, sentiment_class, emoji_used, user_replied)
        VALUES (?, ?, ?, ?, ?)
      `).run(chatId, tgId, this.classify(messageText), emoji, userReplied ? 1 : 0);
    } catch (e) {
      console.warn('[TG_REACTION] Failed to record feedback:', e.message || e);
    }
  }

  public async decayOldFeedback(): Promise<void> {
    if (!this.db) return;

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    try {
      const res = this.db.prepare(`
        DELETE FROM telegram_reaction_feedback WHERE timestamp < ?
      `).run(cutoff);
      if (res.changes > 0) {
        console.log(`[TG_REACTION] Decayed ${res.changes} old feedback rows.`);
      }
    } catch (e) {
      console.warn('[TG_REACTION] Decay failed:', e.message || e);
    }
  }

  public async trainOnTelegramHistory(db: any, limit = 200): Promise<void> {
    if (!db) return;

    try {
      let rows: any[] = [];
      try {
        rows = db.prepare(`
          SELECT content, speaker FROM memories
          WHERE chat_type LIKE '%telegram%'
          ORDER BY timestamp DESC LIMIT ?
        `).all(limit) as any[];
      } catch (_) {
        try {
          rows = db.prepare(`
            SELECT entry as content FROM history
            WHERE entry LIKE '%telegram%'
            ORDER BY timestamp DESC LIMIT ?
          `).all(limit) as any[];
        } catch (_) {
          return;
        }
      }

      const brain = NanoBrain.getInstance();
      const texts: string[] = [];

      for (const row of rows) {
        const text = typeof row.content === 'string' ? row.content : (typeof row.entry === 'string' ? row.entry : '');
        if (text && text.length > 2 && text.length < 500) {
          texts.push(text);
        }
      }

      if (texts.length === 0) return;

      let totalLoss = 0;
      for (const text of texts) {
        const softLabel = brain.generateTeachSoftlabel(text);
        const loss = brain.trainStep(text, softLabel, 0.01);
        totalLoss += loss;
      }

      await brain.saveWeightsToStorage();
      console.log(`[TG_REACTION] Self-trained on ${texts.length} Telegram samples. Avg loss: ${(totalLoss / texts.length).toFixed(4)}`);
    } catch (e) {
      console.warn('[TG_REACTION] Background training failed:', (e as any).message || e);
    }
  }
}
