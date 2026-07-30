import { getDb } from '../database.js';

export interface ToolCallEntry {
  name: string;
  arguments: any;
}

export interface ToolResultEntry {
  tool: string;
  success: boolean;
  durationMs?: number;
  result?: any;
  error?: string;
}

export interface LlmLogEntry {
  id: string;
  timestamp: number;
  prompt: string;
  systemInstruction?: string;
  model: string;
  provider: string;
  response?: string;
  error?: string;
  /** Tool calls requested by the AI in this turn */
  toolCalls?: ToolCallEntry[];
  /** Results from tool execution in this turn */
  toolResults?: ToolResultEntry[];
}

export class LlmIoAuditor {
  private static LOG_LIMIT = 50; // Cap to 50 logs to save storage space and tokens

  public static recordLog(entry: Omit<LlmLogEntry, 'id' | 'timestamp'>): void {
    try {
      const db = getDb();
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

  /**
   * Attach tool call + result data to the most recent log entry.
   * Called from cortexThinkEngine after tool execution completes.
   */
  public static recordToolExecution(data: { toolCalls: ToolCallEntry[]; toolResults: ToolResultEntry[] }): void {
    try {
      const db = getDb();
      let logs: LlmLogEntry[] = [];
      try {
        const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs') as any;
        if (row && row.value) {
          logs = JSON.parse(row.value);
        }
      } catch (_) {
        return;
      }

      if (logs.length === 0) return;

      // Patch the most recent entry
      const latest = logs[0];
      latest.toolCalls = data.toolCalls;
      latest.toolResults = data.toolResults.map(tr => ({
        tool: tr.tool,
        success: tr.success,
        durationMs: tr.durationMs,
        error: tr.error,
        // Truncate large result payloads to keep storage manageable
        result: tr.result !== undefined
          ? JSON.stringify(tr.result).slice(0, 1200)
          : undefined
      }));

      const stmt = db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `);
      stmt.run('yuihime_llm_io_audit_logs', JSON.stringify(logs), Date.now());
    } catch (err) {
      console.error('[LLM_AUDITOR] Error recording tool execution:', err);
    }
  }

  public static getLogs(): LlmLogEntry[] {
    try {
      const db = getDb();
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
      const db = getDb();
      const stmt = db.prepare('DELETE FROM custom_storage WHERE key = ?');
      stmt.run('yuihime_llm_io_audit_logs');
    } catch (err) {
      console.error('[LLM_AUDITOR] Error clearing LLM IO logs:', err);
    }
  }
}
