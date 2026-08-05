/**
 * afterActionReview.ts
 *
 * After-action review loop (Stage E): each Yui action (reply, tool call)
 * is recorded as an "action review"; when real feedback arrives, the result
 * is evaluated and long-term lessons are stored. Resolved lessons are injected
 * into the prompt so subsequent behavior improves.
 *
 * Only allowed on the Node (daemon) side.
 */

import { getDb } from './database.js';
import { genId } from '@shared/core/idGen';

interface ReviewRow {
  id: string;
  actionType: string;
  context_id: string;
  summary: string;
  outcome: string;
  lesson: string;
  successRating: number | null;
  createdAt: number;
  resolvedAt: number | null;
}

let cache: any = null;

function stmts(db: any): any {
  if (cache) return cache;
  cache = {
    insert: db.prepare(
      `INSERT INTO action_reviews (id, actionType, context_id, summary, outcome, lesson, successRating, createdAt, resolvedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         outcome = excluded.outcome,
         lesson = excluded.lesson`
    ),
    byMessage: db.prepare(`SELECT * FROM action_reviews WHERE id = ?`),
    resolve: db.prepare(
      `UPDATE action_reviews SET outcome = 'resolved', lesson = ?, successRating = ?, resolvedAt = ? WHERE id = ?`
    ),
    resolved: db.prepare(
      `SELECT * FROM action_reviews WHERE outcome = 'resolved' AND lesson IS NOT NULL AND lesson != ''
       ORDER BY resolvedAt DESC LIMIT ?`
    ),
    recent: db.prepare(`SELECT * FROM action_reviews ORDER BY createdAt DESC LIMIT ?`),
    pendingCount: db.prepare(`SELECT COUNT(*) AS n FROM action_reviews WHERE outcome = 'awaiting-feedback'`)
  };
  return cache;
}

export function resetReviewCache() {
  cache = null;
}

function parseRow(row: any): ReviewRow | null {
  if (!row) return null;
  return {
    id: row.id,
    actionType: row.actionType || 'reply',
    context_id: row.context_id || 'web_default',
    summary: row.summary || '',
    outcome: row.outcome || 'awaiting-feedback',
    lesson: row.lesson || '',
    successRating: row.successRating === null || row.successRating === undefined ? null : row.successRating,
    createdAt: row.createdAt || Date.now(),
    resolvedAt: row.resolvedAt || null
  };
}

/**
 * Record an action as an action review (default outcome awaiting-feedback).
 */
export function createActionReview(messageId: string | number, actionType: string, contextId: string, summary: string): boolean {
  if (!messageId) return false;
  try {
    const db = getDb();
    stmts(db).insert.run(
      String(messageId),
      actionType || 'reply',
      contextId || 'web_default',
      String(summary || '').slice(0, 500),
      'awaiting-feedback',
      '',
      null,
      Date.now(),
      null
    );
    return true;
  } catch (err: any) {
    console.warn('[ACTION_REVIEW] Failed to create review:', err?.message || err);
    return false;
  }
}

/**
 * Resolve the review for an outgoing message based on real feedback.
 * Reward +1 -> positive lesson; -1 -> negative lesson.
 */
export function resolveReviewByMessage(messageId: string | number, reward: number, topics: string[]): boolean {
  if (!messageId) return false;
  try {
    const db = getDb();
    const review = stmts(db).byMessage.get(String(messageId));
    if (!review) return false;
    const topicStr = (topics && topics.length ? topics.join(', ') : 'this topic');
    const lesson = reward > 0
      ? `[EN] Repeating the approach used on "${topicStr}" earned a positive reaction. | [ID] Pendekatan yang dipakai pada "${topicStr}" menuai reaksi positif. | [JP] 「${topicStr}」へのアプローチは肯定的な反応を得ました。`
      : reward < 0
        ? `[EN] The approach used on "${topicStr}" earned a negative reaction — adjust or avoid it unless asked. | [ID] Pendekatan pada "${topicStr}" menuai reaksi negatif — sesuaikan atau hindari kecuali diminta. | [JP] 「${topicStr}」へのアプローチは否定的な反応を得ました — 求められない限り調整するか避けてください。`
        : `[EN] The approach used on "${topicStr}" was met neutrally. | [ID] Pendekatan pada "${topicStr}" disambut netral. | [JP] 「${topicStr}」へのアプローチは中立でした。`;
    stmts(db).resolve.run(lesson, Math.max(-1, Math.min(1, reward)), Date.now(), String(messageId));
    return true;
  } catch (err: any) {
    console.warn('[ACTION_REVIEW] Failed to resolve review:', err?.message || err);
    return false;
  }
}

/**
 * Record a lesson from a tool failure (self-review without user feedback).
 */
export function createToolFailureReview(contextId: string, toolName: string, error: string): boolean {
  try {
    const db = getDb();
    const id = `toolfail_${Date.now()}_${genId(7)}`;
    const lesson = `[EN] Tool "${toolName}" failed (${String(error || 'unknown').slice(0, 120)}). Be honest about it instead of guessing; retry once or offer web search. | [ID] Tool "${toolName}" gagal (${String(error || 'unknown').slice(0, 120)}). Akui dengan jujur, jangan menebak; coba sekali lagi atau tawarkan pencarian. | [JP] ツール「${toolName}」が失敗しました（${String(error || 'unknown').slice(0, 120)}）。推測せず正直に伝え、一度再試行するか検索を提案してください。`;
    stmts(db).insert.run(id, 'tool-call', contextId || 'web_default', `Tool ${toolName} failed`, 'resolved', lesson, 0, Date.now(), Date.now());
    return true;
  } catch (err: any) {
    console.warn('[ACTION_REVIEW] Failed to record tool-failure:', err?.message || err);
    return false;
  }
}

export function getResolvedLessons(limit = 5): ReviewRow[] {
  try {
    const db = getDb();
    return (stmts(db).resolved.all(limit) as any[]).map(parseRow).filter(Boolean) as ReviewRow[];
  } catch (err: any) {
    console.warn('[ACTION_REVIEW] Failed to get lessons:', err?.message || err);
    return [];
  }
}

export function listRecentReviews(limit = 20): ReviewRow[] {
  try {
    const db = getDb();
    return (stmts(db).recent.all(limit) as any[]).map(parseRow).filter(Boolean) as ReviewRow[];
  } catch (err: any) {
    console.warn('[ACTION_REVIEW] Failed to list reviews:', err?.message || err);
    return [];
  }
}

export function getPendingReviewCount(): number {
  try {
    const db = getDb();
    return Number((stmts(db).pendingCount.get() as any)?.n || 0);
  } catch {
    return 0;
  }
}
