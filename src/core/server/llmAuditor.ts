import { initializeDatabase } from '../database.js';

export interface LlmLogEntry {
  id: string;
  timestamp: number;
  prompt: string;
  systemInstruction?: string;
  model: string;
  provider: string;
  response?: string;
  error?: string;
}

export class LlmIoAuditor {
  private static LOG_LIMIT = 50; // Cap to 50 logs to save storage space and tokens

  private static getDb() {
    return initializeDatabase();
  }

  public static recordLog(entry: Omit<LlmLogEntry, 'id' | 'timestamp'>): void {
    try {
      const db = this.getDb();
      const timestamp = Date.now();
      const id = 'llm_' + Math.random().toString(36).substring(2, 9);
      const newLog: LlmLogEntry = {
        id,
        timestamp,
        ...entry
      };

      // Retrieve existing logs
      let logs: LlmLogEntry[] = [];
      try {
        const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs') as any;
        if (row && row.value) {
          logs = JSON.parse(row.value);
        }
      } catch (e) {
        logs = [];
      }

      // Add to front of array
      logs.unshift(newLog);

      // Enforce limit
      if (logs.length > this.LOG_LIMIT) {
        logs = logs.slice(0, this.LOG_LIMIT);
      }

      // Save back to db
      const stmt = db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `);
      stmt.run('yuihime_llm_io_audit_logs', JSON.stringify(logs), timestamp);
    } catch (err) {
      console.error('[LLM_AUDITOR] Error recording LLM IO log:', err);
    }
  }

  public static getLogs(): LlmLogEntry[] {
    try {
      const db = this.getDb();
      const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs') as any;
      if (row && row.value) {
        return JSON.parse(row.value);
      }
    } catch (err) {
      console.error('[LLM_AUDITOR] Error getting LLM IO logs:', err);
    }
    return [];
  }

  public static clearLogs(): void {
    try {
      const db = this.getDb();
      const stmt = db.prepare('DELETE FROM custom_storage WHERE key = ?');
      stmt.run('yuihime_llm_io_audit_logs');
    } catch (err) {
      console.error('[LLM_AUDITOR] Error clearing LLM IO logs:', err);
    }
  }
}
