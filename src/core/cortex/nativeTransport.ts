/**
 * Durable native message store for Kilo/opencode-style tool transport.
 *
 * Persists the canonical OpenAI-shaped conversation parts
 * (`[system, user, assistant(tool_calls), tool ...]`) per session so the
 * cortex loop can reload history across turns instead of folding tool results
 * into a growing prompt string. Table: `native_messages(session_id, seq, role, parts)`.
 *
 * This module is server-side only — it must never be imported from web/.
 */
import { getDb } from '../database.js';

export interface NativeMessage {
  role: string;
  content?: string | null;
  parts?: any[];
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Load the persisted native message parts for a session, in order.
 * Corrupt rows are skipped; a failure returns an empty array (non-blocking).
 */
export function loadNativeMessages(sessionId: string): NativeMessage[] {
  if (!sessionId) return [];
  try {
    const db = getDb();
    const rows = db
      .prepare('SELECT seq, role, parts FROM native_messages WHERE session_id = ? ORDER BY seq ASC')
      .all(sessionId) as any[];
    const messages: NativeMessage[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.parts);
        if (parsed && typeof parsed === 'object' && parsed.role) {
          messages.push(parsed);
        }
      } catch {
        // skip corrupt row
      }
    }
    return messages;
  } catch (err: any) {
    console.warn('[NATIVE_TRANSPORT] load failed:', err?.message || err);
    return [];
  }
}

/**
 * Append native messages to a session, continuing the `seq` sequence from the
 * last stored row. Written in a single transaction so the pair
 * (assistant tool_calls + role:"tool" results) is atomic.
 */
export function appendNativeMessages(sessionId: string, messages: NativeMessage[]): void {
  if (!sessionId || !Array.isArray(messages) || messages.length === 0) return;
  try {
    const db = getDb();
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM native_messages WHERE session_id = ?')
      .get(sessionId) as any;
    let seq = (maxRow?.m || 0) + 1;
    const insert = db.prepare(
      'INSERT INTO native_messages (session_id, seq, role, parts) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const msg of messages) {
        insert.run(sessionId, seq++, msg.role || 'user', JSON.stringify(msg));
      }
    });
    tx();
  } catch (err: any) {
    console.warn('[NATIVE_TRANSPORT] append failed:', err?.message || err);
  }
}

/** Delete all native messages for a session (new thread / reset). */
export function clearNativeMessages(sessionId: string): void {
  if (!sessionId) return;
  try {
    const db = getDb();
    db.prepare('DELETE FROM native_messages WHERE session_id = ?').run(sessionId);
  } catch (err: any) {
    console.warn('[NATIVE_TRANSPORT] clear failed:', err?.message || err);
  }
}

/** Number of persisted native messages for a session (0 when empty/absent). */
export function getNativeMessageCount(sessionId: string): number {
  if (!sessionId) return 0;
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM native_messages WHERE session_id = ?')
      .get(sessionId) as any;
    return row?.c || 0;
  } catch {
    return 0;
  }
}
