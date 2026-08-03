/**
 * feedback.ts
 *
 * Server-side closed-loop feedback storage & consolidation helpers.
 * Menerima sinyal nyata dari user (reaksi Telegram / tombol Web UI) lalu
 * memetakannya ke "learned_strategies" (feedback:topic) agar perilaku Yui
 * menyesuaikan jangka panjang. Hanya boleh dipakai di sisi Node (daemon).
 */

import { getDb } from './database.js';
import { createActionReview, resolveReviewByMessage } from './afterActionReview.js';
import { genId } from '@shared/core/idGen';

let preparedCache: { [k: string]: any } | null = null;

function stmts(db: any): any {
  if (preparedCache) return preparedCache;
  preparedCache = {
    insertOutbound: db.prepare(
      `INSERT INTO outbound_messages (message_id, context_id, channel, content, sent_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         context_id = excluded.context_id,
         channel = excluded.channel,
         content = excluded.content`
    ),
    getOutbound: db.prepare(`SELECT * FROM outbound_messages WHERE message_id = ?`),
    insertFeedback: db.prepare(
      `INSERT INTO feedback_events (source, message_id, context_id, channel, content, reward, consumed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ),
    dupFeedback: db.prepare(
      `SELECT COUNT(*) AS n FROM feedback_events WHERE message_id = ? AND source = ? AND reward = ?`
    ),
    pendingFeedback: db.prepare(
      `SELECT * FROM feedback_events WHERE consumed = 0 ORDER BY id ASC`
    ),
    consumeFeedback: db.prepare(`UPDATE feedback_events SET consumed = 1 WHERE id = ?`),
    upsertStrategy: db.prepare(
      `INSERT INTO learned_strategies (id, topic, instruction, confidence, successCount, failureCount, lastOptimized)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         topic = excluded.topic,
         instruction = excluded.instruction,
         confidence = excluded.confidence,
         successCount = excluded.successCount,
         failureCount = excluded.failureCount,
         lastOptimized = excluded.lastOptimized`
    )
  };
  return preparedCache;
}

export function resetFeedbackCache() {
  preparedCache = null;
}

export function recordOutboundMessage(messageId: string | number, contextId: string, channel: string, content: string): void {
  if (!messageId) return;
  try {
    const db = getDb();
    stmts(db).insertOutbound.run(String(messageId), contextId || 'web_default', channel || 'unknown', String(content || ''), Date.now());
    const topics = extractTopics(content, 3);
    createActionReview(messageId, 'reply', contextId || 'web_default', `Reply about: ${topics.join(', ') || '(no topic)'}`);
  } catch (err: any) {
    console.warn('[FEEDBACK_DB] Failed to record outbound message:', err?.message || err);
  }
}

export function lookupOutboundMessage(messageId: string | number): any | null {
  if (!messageId) return null;
  try {
    const db = getDb();
    return stmts(db).getOutbound.get(String(messageId)) || null;
  } catch (err: any) {
    console.warn('[FEEDBACK_DB] Failed to lookup outbound message:', err?.message || err);
    return null;
  }
}

export function recordFeedback(data: {
  source: string;
  messageId?: string | number | null;
  contextId?: string | null;
  channel?: string | null;
  content?: string | null;
  reward: number;
}): boolean {
  try {
    const db = getDb();
    let { messageId, contextId, channel, content } = data;
    if (!messageId) {
      messageId = `manual_${Date.now()}_${genId(7)}`;
    }
    if (!content) {
      const outbound = lookupOutboundMessage(messageId);
      if (outbound) {
        contextId = contextId || outbound.context_id;
        channel = channel || outbound.channel;
        content = outbound.content;
      }
    }
    const dup = stmts(db).dupFeedback.get(String(messageId), data.source, data.reward);
    if ((dup?.n || 0) > 0) {
      return false;
    }
    stmts(db).insertFeedback.run(
      data.source,
      String(messageId),
      contextId || 'web_default',
      channel || 'unknown',
      String(content || ''),
      Math.max(-1, Math.min(1, data.reward)),
      Date.now()
    );
    return true;
  } catch (err: any) {
    console.warn('[FEEDBACK_DB] Failed to record feedback:', err?.message || err);
    return false;
  }
}

export function listPendingFeedback(limit = 50): any[] {
  try {
    const db = getDb();
    return stmts(db).pendingFeedback.all().slice(0, limit);
  } catch (err: any) {
    console.warn('[FEEDBACK_DB] Failed to list pending feedback:', err?.message || err);
    return [];
  }
}

export function markFeedbackConsumed(ids: number[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const db = getDb();
    for (const id of ids) {
      stmts(db).consumeFeedback.run(id);
    }
  } catch (err: any) {
    console.warn('[FEEDBACK_DB] Failed to mark feedback consumed:', err?.message || err);
  }
}

/**
 * Map emoji reaksi Telegram -> reward (-1 / 0 / +1).
 */
export function emojiToReward(emoji: string): number {
  const positive = new Set(['👍', '❤️', '❤', '🔥', '🥰', '😍', '👏', '😁', '🤩', '🥳', '💯', '✅', '🤗', '🥹', '😊', '😎', '😆', '🤭']);
  const negative = new Set(['👎', '😡', '🤨', '😐', '🤮', '🥱', '😢', '😭', '😠', '👿', '💀', '😴']);
  const neutral = new Set(['🤔', '😱', '🤯', '😅', '🙂', '🫠']);
  if (positive.has(emoji)) return 1;
  if (negative.has(emoji)) return -1;
  if (neutral.has(emoji)) return 0;
  return 0;
}

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'itu', 'ini', 'dengan', 'untuk', 'pada', 'adalah',
  'ada', 'kamu', 'aku', 'saya', 'kita', 'mereka', 'dia', 'akan', 'bisa', 'sudah', 'belum',
  'juga', 'hanya', 'tidak', 'bukan', 'the', 'and', 'for', 'you', 'your', 'are', 'with',
  'that', 'this', 'what', 'why', 'how', 'when', 'about', 'dari', 'tapi', 'atau', 'karena',
  'ya', 'sih', 'deh', 'dong', 'lah', 'kan', 'bang', 'kak', 'mas', 'mbak', 'nya', 'yaitu'
]);

/**
 * Ekstraksi keyword sederhana (tokenisasi + stopword removal + frekuensi).
 */
export function extractTopics(content: string, limit = 3): string[] {
  const text = String(content || '').toLowerCase();
  const matches = text.match(/[a-z0-9]+/gi) || [];
  const freq = new Map<string, number>();
  for (const raw of matches) {
    const word = raw.replace(/^[0-9]+$/, '').trim();
    if (!word || word.length < 3 || STOPWORDS.has(word)) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

const POSITIVE_INSTRUCTION = (topic: string) =>
  `[EN] User responded positively to your message about "${topic}". Keep this type of content engaging; deepen this theme gently when the user seems interested. | [ID] User suka dengan balasanmu soal "${topic}". Pertahankan gaya ini dan perdalam pelan-pelan saat user tampak tertarik. | [JP] ユーザーは「${topic}」に関するあなたの返信を気に入っています。このスタイルを維持し、ユーザーが興味を持っているときはそのテーマを優しく深めましょう。`;

const NEGATIVE_INSTRUCTION = (topic: string) =>
  `[EN] User reacted negatively to your message about "${topic}". Avoid repeating this tone/content unless the user explicitly asks for it. | [ID] User bereaksi negatif terhadap balasanmu soal "${topic}". Hindari mengulangi nada/konten ini kecuali user memintanya. | [JP] ユーザーは「${topic}」に関するあなたの返信に否定的な反応を示しました。ユーザーが明示的に求める場合を除き、この口調・内容は繰り返さないでください。`;

/**
 * Konsolidasi satu event feedback ke learned_strategies.
 * Mengembalikan delta relasi { affection, trust } agar dimodulasi modul.
 */
export function consolidateFeedbackEvent(event: any, affectionBoost = 1, affectionPenalty = 2): { affection: number; trust: number; topics: string[] } {
  const db = getDb();
  const content = event.content || '';
  const topics = extractTopics(content);
  const reward = event.reward || 0;

  for (const topic of topics) {
    const id = `feedback:${topic}`;
    const existing = db.prepare('SELECT * FROM learned_strategies WHERE id = ?').get(id);
    const successCount = (existing?.successCount || 0) + (reward > 0 ? 1 : 0);
    const failureCount = (existing?.failureCount || 0) + (reward < 0 ? 1 : 0);
    const total = successCount + failureCount;
    const confidence = total === 0 ? 0.5 : Math.round((successCount / total) * 100) / 100;
    const instruction = reward >= 0
      ? POSITIVE_INSTRUCTION(topic)
      : NEGATIVE_INSTRUCTION(topic);
    stmts(db).upsertStrategy.run(
      id, topic, instruction, confidence, successCount, failureCount, Date.now()
    );
  }

  // After-action review: resolve review pesan terkait dengan hasil feedback nyata
  if (event.message_id) {
    resolveReviewByMessage(event.message_id, reward, topics);
  }

  const deltaAffection = reward > 0 ? affectionBoost : reward < 0 ? -affectionPenalty : 0;
  const deltaTrust = reward > 0 ? affectionBoost : reward < 0 ? -affectionPenalty : 0;
  return { affection: deltaAffection, trust: deltaTrust, topics };
}
