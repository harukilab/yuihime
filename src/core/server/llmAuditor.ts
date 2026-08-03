import { getDb, withDbRetry } from '../database.js';
import { appendLog } from '../fileLogger.js';
import { genId } from '@shared/core/idGen';

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
      const id = 'llm_' + genId(9);
      const newLog: LlmLogEntry = {
        id,
        timestamp,
        ...entry
      };

      // Append to NDJSON file for LLM IO logs (reduce DB writes)
      try {
        appendLog('llm', newLog);
      } catch (e) {
        // fallback to DB if file logger fails
        try {
          let logs: LlmLogEntry[] = [];
          try {
            const row = withDbRetry(() => db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs'), 'llm-auditor-fetch-log') as any;
            if (row && row.value) logs = JSON.parse(row.value);
          } catch (_) { logs = []; }
          logs.unshift(newLog);
          if (logs.length > this.LOG_LIMIT) logs = logs.slice(0, this.LOG_LIMIT);
          withDbRetry(() => {
            const stmt = db.prepare(`
              INSERT INTO custom_storage (key, value, updatedAt)
              VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
            `);
            stmt.run('yuihime_llm_io_audit_logs', JSON.stringify(logs), timestamp);
          }, 'llm-auditor-save-log-fallback');
        } catch (e2) {
          console.error('[LLM_AUDITOR] Both file logger and DB fallback failed:', e2?.message || e2);
        }
      }
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
      // Append tool execution info to tools NDJSON log
      try {
        appendLog('tools', { toolCalls: data.toolCalls, toolResults: data.toolResults });
      } catch (e) {
        console.warn('[LLM_AUDITOR] Failed to append to tools log:', e?.message || e);
      }

      // Best-effort: patch latest LLM log in DB if present (non-blocking)
      try {
        let logs: LlmLogEntry[] = [];
        try {
          const row = withDbRetry(() => db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs'), 'llm-auditor-fetch-log-for-exec') as any;
          if (row && row.value) logs = JSON.parse(row.value);
        } catch (_) {
          // ignore
        }

        if (logs.length === 0) return;
        const latest = logs[0];
        latest.toolCalls = data.toolCalls;
        latest.toolResults = data.toolResults.map(tr => ({
          tool: tr.tool,
          success: tr.success,
          durationMs: tr.durationMs,
          error: tr.error,
          result: tr.result !== undefined ? JSON.stringify(tr.result).slice(0, 1200) : undefined
        }));

        withDbRetry(() => {
          const stmt = db.prepare(`
            INSERT INTO custom_storage (key, value, updatedAt)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
          `);
          stmt.run('yuihime_llm_io_audit_logs', JSON.stringify(logs), Date.now());
        }, 'llm-auditor-save-log-for-exec');
      } catch (err) {
        // Best-effort only
      }
    } catch (err) {
      console.error('[LLM_AUDITOR] Error recording tool execution:', err);
    }
  }

  public static getLogs(): LlmLogEntry[] {
    try {
      const db = getDb();
      const row = withDbRetry(() => db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs'), 'llm-auditor-get-logs') as any;
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
      withDbRetry(() => {
        const stmt = db.prepare('DELETE FROM custom_storage WHERE key = ?');
        stmt.run('yuihime_llm_io_audit_logs');
      }, 'llm-auditor-clear-logs');
    } catch (err) {
      console.error('[LLM_AUDITOR] Error clearing LLM IO logs:', err);
    }
  }
}
