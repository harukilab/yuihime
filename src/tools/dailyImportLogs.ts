import fs from 'fs';
import path from 'path';
import { getDb, retryDbOperation, withDbRetry } from '../core/database.js';
import { readLogLines, rotateLog } from '../core/fileLogger.js';

async function importLogs() {
  const db = getDb();

  // Import LLM logs
  try {
    const llmLines = readLogLines('llm', { limit: 100000, tail: false });
    const parsed = llmLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (parsed.length > 0) {
      await retryDbOperation(() => {
        // Merge with existing stored LLM audit logs (stored in custom_storage)
        let existing: any[] = [];
        try {
          const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_llm_io_audit_logs') as any;
          if (row && row.value) existing = JSON.parse(row.value);
        } catch (e) { existing = []; }
        const merged = [...parsed.reverse(), ...existing].slice(0, 1000);
        const stmt = db.prepare(`INSERT INTO custom_storage (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`);
        stmt.run('yuihime_llm_io_audit_logs', JSON.stringify(merged), Date.now());
      }, 'daily-import-llm');
      rotateLog('llm', Date.now().toString());
      console.log(`Imported ${parsed.length} llm log(s)`);
    }
  } catch (e) {
    console.warn('[DAILY_IMPORT] LLM import failed:', e?.message || e);
  }

  // Import tools logs
  try {
    const toolLines = readLogLines('tools', { limit: 100000, tail: false });
    const parsed = toolLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (parsed.length > 0) {
      await retryDbOperation(() => {
        let existing: any[] = [];
        try {
          const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_tool_logs') as any;
          if (row && row.value) existing = JSON.parse(row.value);
        } catch (e) { existing = []; }
        const merged = [...parsed.reverse(), ...existing].slice(0, 2000);
        const stmt = db.prepare(`INSERT INTO custom_storage (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`);
        stmt.run('yuihime_tool_logs', JSON.stringify(merged), Date.now());
      }, 'daily-import-tools');
      rotateLog('tools', Date.now().toString());
      console.log(`Imported ${parsed.length} tool log(s)`);
    }
  } catch (e) {
    console.warn('[DAILY_IMPORT] Tools import failed:', e?.message || e);
  }

  console.log('[DAILY_IMPORT] Done');
}

// Execute immediately when run via tsx/node ESM runner
importLogs().catch(e => { console.error(e); process.exit(1); });

export default importLogs;
