/**
 * userModel.ts
 *
 * Persistent per-persona User Model (server-only). Stores preferences,
 * favorite/disliked topics, preferred language, and per-contextId interaction
 * statistics so all modules and the UI can read them.
 */

import { getDb } from './database.js';
import { extractTopics } from './feedback.js';

export interface UserModel {
  context_id: string;
  userName: string;
  language: string;
  interactionCount: number;
  topTopics: string[];
  likedTopics: string[];
  dislikedTopics: string[];
  avgSentiment: number;
  lastSeen: number;
  firstSeen: number;
  notes: string[];
}

let stmtCache: any = null;

function stmts(db: any): any {
  if (stmtCache) return stmtCache;
  stmtCache = {
    get: db.prepare(`SELECT * FROM user_models WHERE context_id = ?`),
    upsert: db.prepare(`
      INSERT INTO user_models (context_id, userName, language, interactionCount, topTopics, likedTopics, dislikedTopics, avgSentiment, lastSeen, firstSeen, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(context_id) DO UPDATE SET
        userName = excluded.userName,
        language = excluded.language,
        interactionCount = excluded.interactionCount,
        topTopics = excluded.topTopics,
        likedTopics = excluded.likedTopics,
        dislikedTopics = excluded.dislikedTopics,
        avgSentiment = excluded.avgSentiment,
        lastSeen = excluded.lastSeen,
        notes = excluded.notes
    `),
    list: db.prepare(`SELECT * FROM user_models ORDER BY lastSeen DESC LIMIT 200`)
  };
  return stmtCache;
}

export function resetUserModelCache() {
  stmtCache = null;
}

function rowToModel(row: any): UserModel | null {
  if (!row) return null;
  return {
    context_id: row.context_id,
    userName: row.userName || 'user',
    language: row.language || 'id',
    interactionCount: row.interactionCount || 0,
    topTopics: JSON.parse(row.topTopics || '[]'),
    likedTopics: JSON.parse(row.likedTopics || '[]'),
    dislikedTopics: JSON.parse(row.dislikedTopics || '[]'),
    avgSentiment: row.avgSentiment || 0,
    lastSeen: row.lastSeen || 0,
    firstSeen: row.firstSeen || Date.now(),
    notes: JSON.parse(row.notes || '[]')
  };
}

export function getUserModel(contextId: string): UserModel | null {
  try {
    const db = getDb();
    return rowToModel(stmts(db).get.get(contextId || 'web_default'));
  } catch (err: any) {
    console.warn('[USER_MODEL_DB] Failed to get user model:', err?.message || err);
    return null;
  }
}

export function listUserModels(): UserModel[] {
  try {
    const db = getDb();
    return (stmts(db).list.all() as any[]).map(rowToModel).filter(Boolean) as UserModel[];
  } catch (err: any) {
    console.warn('[USER_MODEL_DB] Failed to list user models:', err?.message || err);
    return [];
  }
}

export function saveUserModel(model: UserModel): void {
  try {
    const db = getDb();
    stmts(db).upsert.run(
      model.context_id,
      model.userName,
      model.language,
      model.interactionCount,
      JSON.stringify(model.topTopics),
      JSON.stringify(model.likedTopics),
      JSON.stringify(model.dislikedTopics),
      model.avgSentiment,
      model.lastSeen,
      model.firstSeen,
      JSON.stringify(model.notes)
    );
  } catch (err: any) {
    console.warn('[USER_MODEL_DB] Failed to save user model:', err?.message || err);
  }
}

/**
 * Simple language detection: JP (kanji/kana script) > ID (common words) > EN.
 */
export function detectLanguage(text: string): string {
  const t = String(text || '');
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(t)) return 'jp';
  const words = (t.toLowerCase().match(/[a-z]+/g) || []);
  let id = 0, en = 0;
  const idMarkers = ['yang', 'dengan', 'untuk', 'kamu', 'aku', 'gak', 'enggak', 'tapi', 'kalau', 'sudah', 'bisa', 'banget', 'kita', 'iya', 'nya', 'lah', 'dong', 'sih', 'aja'];
  const enMarkers = ['the', 'and', 'you', 'your', 'what', 'please', 'want', 'can', 'how', 'with', 'that', 'this', 'have', 'are', 'is', 'my', 'i'];
  for (const w of words) {
    if (idMarkers.includes(w)) id++;
    else if (enMarkers.includes(w)) en++;
  }
  if (id > en) return 'id';
  if (en > id) return 'en';
  return 'id';
}

function mergeFreqList(existing: string[], newTopics: string[], maxLen = 10): string[] {
  const freq = new Map<string, number>();
  for (const t of existing) freq.set(t, (freq.get(t) || 0) + 2);
  for (const t of newTopics) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxLen).map(([t]) => t);
}

/**
 * Update the user model for a single interaction (called by the module each cycle).
 */
export function updateUserModelInteraction(contextId: string, userName: string, input: string, sentiment?: number): UserModel {
  const existing = getUserModel(contextId);
  const now = Date.now();
  const topics = extractTopics(input, 3);
  const lang = detectLanguage(input);

  const model: UserModel = existing || {
    context_id: contextId || 'web_default',
    userName: userName || 'user',
    language: 'id',
    interactionCount: 0,
    topTopics: [],
    likedTopics: [],
    dislikedTopics: [],
    avgSentiment: 0,
    lastSeen: now,
    firstSeen: now,
    notes: []
  };

  model.context_id = contextId || 'web_default';
  model.userName = userName || model.userName;
  model.interactionCount = (model.interactionCount || 0) + 1;
  model.lastSeen = now;
  model.language = lang;
  model.topTopics = mergeFreqList(model.topTopics || [], topics);
  if (typeof sentiment === 'number') {
    model.avgSentiment = Math.round(((model.avgSentiment || 0) * (model.interactionCount - 1) + sentiment) / model.interactionCount * 100) / 100;
  }

  saveUserModel(model);
  return model;
}
