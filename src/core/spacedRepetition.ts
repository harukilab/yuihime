/**
 * spacedRepetition.ts
 *
 * Ebbinghaus forgetting-curve retrieval for memory. Each memory has a
 * retrievalCount & lastRetrievedAt; the longer it is not recalled and the less
 * often it is recalled, the higher its "recall" score, so important memories
 * that are almost forgotten resurface again (spaced repetition).
 *
 * Used by: (1) re-ranking on the NeuralInterface retrieval path, (2) the SOUL
 * module to proactively surface memories at risk of being forgotten.
 */

import { getDb } from './database.js';

export interface RecallMemoryRow {
  id: string;
  importance: number;
  timestamp: number;
  retrievalCount: number;
  lastRetrievedAt: number;
}

const BASE_STABILITY_MS = 4 * 60 * 60 * 1000;      // 4 hours of base stability
const GROWTH_EXPONENT = 0.6;                        // each retrieval strengthens stability
const MIN_PROBABILITY = 0.02;                       // never reach 0 (flashback is possible)

export function calculateStability(retrievalCount: number): number {
  return BASE_STABILITY_MS * Math.pow((retrievalCount || 0) + 1, GROWTH_EXPONENT);
}

export function calculateRecallProbability(
  timestamp: number,
  retrievalCount: number,
  lastRetrievedAt: number,
  now: number = Date.now()
): number {
  const stability = calculateStability(retrievalCount || 0);
  const lastRecall = lastRetrievedAt || timestamp;
  const delta = Math.max(0, now - lastRecall);
  const probability = Math.exp(-delta / stability);
  return Math.max(MIN_PROBABILITY, Math.min(1, probability));
}

/**
 * Combined retrieval score: closer to the forgetting threshold (low P) + important +
 * not recently recalled, the higher. This is what resurfaces old important
 * memories even when they are not the most recent.
 */
export function computeRetrievalScore(
  memory: RecallMemoryRow,
  now: number = Date.now()
): number {
  const importance = memory.importance || 0.4;
  const recallP = calculateRecallProbability(
    memory.timestamp,
    memory.retrievalCount || 0,
    memory.lastRetrievedAt || 0,
    now
  );
  // Near-forgetting boost: 1-P makes the almost-forgotten memories stand out most
  const forgettingBoost = Math.max(0, 1 - recallP);
  const recencyBoost = Math.max(0, 1 - (now - (memory.timestamp || now)) / (30 * 24 * 60 * 60 * 1000));
  return forgettingBoost * 0.6 + importance * 0.3 + recencyBoost * 0.1;
}

/**
 * Re-rank a memory list with the forgetting curve then mark the memories that
 * were actually taken (update retrievalCount & lastRetrievedAt).
 * Returns { rows, recalledIds }.
 */
export function rankMemoriesByForgetting(
  rows: any[],
  limit: number,
  now: number = Date.now()
): { rows: any[]; recalledIds: string[] } {
  const scored = rows
    .filter((r: any) => r && r.id)
    .map((r: any) => ({
      row: r,
      score: computeRetrievalScore(
        {
          id: r.id,
          importance: r.importance || 0.4,
          timestamp: r.timestamp || now,
          retrievalCount: r.retrievalCount || 0,
          lastRetrievedAt: r.lastRetrievedAt || 0
        },
        now
      )
    }))
    .sort((a: any, b: any) => b.score - a.score);

  const taken = scored.slice(0, limit);
  return {
    rows: taken.map((s: any) => s.row),
    recalledIds: taken.map((s: any) => s.row.id)
  };
}

/**
 * Mark recalled memories so retrievalCount grows & lastRetrievedAt is
 * updated (memory stability strengthens each time it is recalled).
 */
export function markMemoriesRecalled(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE memories SET
        retrievalCount = IFNULL(retrievalCount, 0) + 1,
        lastRetrievedAt = ?
      WHERE id IN (${placeholders})
    `).run(Date.now(), ...ids);
  } catch (err: any) {
    console.warn('[SPACED_REP] Failed to mark recalled memories:', err?.message || err);
  }
}

/**
 * Query memories at risk of being forgotten (low recall probability) but
 * important — for proactive recollection.
 */
export function getAtRiskMemories(
  contextLike?: string,
  riskThreshold: number = 0.35,
  limit: number = 8,
  minImportance: number = 0.45,
  now: number = Date.now()
): { rows: any[]; recalledIds: string[] } {
  try {
    const db = getDb();
    const where = contextLike
      ? 'WHERE context LIKE ? AND importance >= ?'
      : 'WHERE importance >= ?';
    const params = contextLike
      ? [`%${contextLike}%`, minImportance]
      : [minImportance];
    const candidates = db.prepare(`
      SELECT * FROM memories ${where}
      ORDER BY timestamp DESC
      LIMIT 500
    `).all(...params) as any[];

    const atRisk = candidates.filter((r: any) => {
      const p = calculateRecallProbability(r.timestamp, r.retrievalCount || 0, r.lastRetrievedAt || 0, now);
      return p < riskThreshold;
    });
    return rankMemoriesByForgetting(atRisk, limit, now);
  } catch (err: any) {
    console.warn('[SPACED_REP] Failed to get at-risk memories:', err?.message || err);
    return { rows: [], recalledIds: [] };
  }
}
