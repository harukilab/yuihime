import path from "path";
import { appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, readFileSync } from "fs";
import { Cortex } from "../cortex.js";
import { dbPath } from "../database.js";
import { getTzOffsetHours, toLocalClock } from "../utils/dualClock.js";
import { genId } from '@shared/core/idGen';

interface BufferedMessage {
  speaker: string;
  text: string;
  timestamp: number;
  chatType?: string;
}

const IDLE_TIMEOUT_MS = 120_000; // 120-second idle gap without incoming messages
const MIN_IDLE_SUMMARY_MESSAGES = 30; // Minimum 30 messages since the last summary
const MAX_IDLE_SUMMARY_MESSAGES = 80; // Per-session cap so the prompt stays concise
const DAILY_SUMMARY_MAX_LINES = 500; // Cap on daily log lines to summarize
const RETENTION_DAYS = 7; // Daily logs & summaries kept for 7 days based on date
const DAILY_CHECK_INTERVAL_MS = 60_000;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeKey(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * User's "local" date (circadian-rhythm.timezoneOffsetHours) for the daily date key.
 * Ensure daily logs & daily summary use the local day, not server UTC.
 */
function localDateFor(epochMs?: number): Date {
  return toLocalClock(getTzOffsetHours(), epochMs != null ? new Date(epochMs) : undefined);
}

function yesterdayKey(): string {
  return toDateKey(localDateFor(Date.now() - 86400000));
}

/**
 * ChatSummaryEngine — Background Chat Digestor.
 *
 * Two summary types:
 * 1. Idle-gap summary: triggered when no messages arrive for 120 seconds AND at least
 *    30 messages have accumulated since the last summary. Purely background, not spoken.
 * 2. Daily summary: created automatically when the date rolls over + manually via API/tool.
 *
 * Storage:
 * - Every incoming message is recorded into a daily log file (<dataDir>/chat_logs/YYYY-MM-DD.log).
 * - Summary results are saved into the `memories` database AND a daily summary file.
 * - Logs & summaries are retained for 7 days based on date, then cleaned up.
 */
export class ChatSummaryEngine {
   private static instance: ChatSummaryEngine | null = null;
   private db: any = null;
   private cortex: Cortex | null = null;
   private buffer: BufferedMessage[] = [];
   private idleTimer: ReturnType<typeof setTimeout> | null = null;
   private isIdleSummaryRunning = false;
   private lastDailyDate = "";
   private pendingDailyDates: string[] = [];
   private logDir = "";
    private stmtGetDailySummary: any = null;
    private stmtGetDailySummaryContent: any = null;
    private stmtInsertIdleSummary: any = null;
    private stmtUpsertDailySummary: any = null;
    private stmtDeleteOldDailySummaries: any = null;
    private stmtGetAllDailySummaryIds: any = null;
    private stmtGetLatestDailySummaryTimestamp: any = null;

  private constructor() {}

  public static getInstance(): ChatSummaryEngine {
    if (!this.instance) {
      this.instance = new ChatSummaryEngine();
    }
    return this.instance;
  }

   public setDatabase(db: any) {
     this.db = db;
     try {
       const dir = path.dirname(dbPath);
       this.logDir = path.join(dir, "chat_logs");
       mkdirSync(this.logDir, { recursive: true });
     } catch (e: any) {
       console.warn("[CHAT_SUMMARY] Failed to prepare chat log directory:", e?.message || e);
     }

     this.stmtGetDailySummary = this.db.prepare("SELECT id FROM memories WHERE id = ?");
     this.stmtGetDailySummaryContent = this.db.prepare("SELECT content, timestamp FROM memories WHERE id = ?");
     this.stmtInsertIdleSummary = this.db.prepare(`
       INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
       VALUES (?, 'event_group', ?, 0.7, 'subconscious', 'live_stream', ?, '["summary", "viewer_vibe"]', 0.5)
     `);
     this.stmtUpsertDailySummary = this.db.prepare(`
       INSERT OR REPLACE INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment, meta)
       VALUES (?, 'daily_summary', ?, 0.95, 'system', 'daily_summary', ?, '["daily", "summary"]', 0.6, ?)
     `);
      this.stmtDeleteOldDailySummaries = this.db.prepare("DELETE FROM memories WHERE type = 'daily_summary' AND timestamp < ?");
      this.stmtGetAllDailySummaryIds = this.db.prepare("SELECT id FROM memories WHERE type = 'daily_summary'");
      this.stmtGetLatestDailySummaryTimestamp = this.db.prepare("SELECT timestamp FROM memories WHERE type = 'daily_summary' AND timestamp >= ? ORDER BY timestamp DESC LIMIT 1");

      try {
        const row = this.stmtGetLatestDailySummaryTimestamp.get(new Date(`${toDateKey(localDateFor())}T00:00:00`).getTime());
       if (row && row.timestamp) {
         this.lastDailyDate = toDateKey(localDateFor(row.timestamp));
       }
     } catch {}

     if (!this.lastDailyDate) {
       this.lastDailyDate = toDateKey(localDateFor());
     }

     this.scanPendingDailySummaries();
     this.startDailyScheduler();
     this.runCleanup();
     console.log(`[CHAT_SUMMARY] ChatSummaryEngine ready. Log dir: ${this.logDir} | idle gap: ${IDLE_TIMEOUT_MS / 1000}s | min idle msgs: ${MIN_IDLE_SUMMARY_MESSAGES} | retention: ${RETENTION_DAYS}d`);
   }

  /**
   * Called for every incoming message. Records to the daily log, appends to the buffer,
   * and resets the idle timer.
   */
  public noteIncomingMessage(msg: BufferedMessage) {
    if (!msg || !msg.text) return;
    this.buffer.push(msg);
    this.appendToLogFile(toDateKey(localDateFor(msg.timestamp)), msg);
    this.resetIdleTimer();
  }

  private getCortex(): Cortex {
    if (!this.cortex) {
      this.cortex = new Cortex();
    }
    return this.cortex;
  }

  public getLogDir(): string {
    if (!this.logDir) {
      try {
        const dir = path.dirname(dbPath);
        this.logDir = path.join(dir, "chat_logs");
      } catch {}
    }
    return this.logDir;
  }

  /**
   * Reads the raw daily log file for a given date (default: yesterday).
   */
  public readDailyLog(dateStr?: string, opts?: { limit?: number; tail?: boolean }): { date: string; exists: boolean; file: string; lines: string[] } {
    const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : yesterdayKey();
    const file = path.join(this.getLogDir(), `${targetDate}.log`);
    if (!existsSync(file)) {
      return { date: targetDate, exists: false, file, lines: [] };
    }
    try {
      const content = readFileSync(file, "utf-8");
      let lines = content.split("\n").filter(Boolean);
      if (opts?.limit) {
        lines = opts.tail !== false ? lines.slice(-opts.limit) : lines.slice(0, opts.limit);
      }
      return { date: targetDate, exists: true, file, lines };
    } catch (e: any) {
      console.warn("[CHAT_SUMMARY_READ_ERR] Failed to read daily log:", e?.message || e);
      return { date: targetDate, exists: false, file, lines: [] };
    }
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.onIdleTimeout().catch(e => console.error("[CHAT_SUMMARY_IDLE_ERR] Idle summary failed:", e?.message || e));
    }, IDLE_TIMEOUT_MS);
    if (typeof this.idleTimer.unref === "function") {
      this.idleTimer.unref();
    }
  }

  /**
   * Idle-gap trigger: only runs if at least 30 messages have accumulated
   * since the last summary. Purely background — not spoken/broadcast.
   * After that, processes missed daily summaries (boot catch-up).
   */
  private async onIdleTimeout() {
    if (this.isIdleSummaryRunning) {
      return;
    }
    this.isIdleSummaryRunning = true;
    try {
      if (this.buffer.length >= MIN_IDLE_SUMMARY_MESSAGES) {
        const chunk = this.buffer.splice(0, Math.min(this.buffer.length, MAX_IDLE_SUMMARY_MESSAGES));
        try {
          console.log(`[CHAT_SUMMARY_IDLE] Idle gap detected. Summarizing ${chunk.length} background messages...`);

          const chatSnippet = chunk.map(c => `[${c.speaker}]: ${c.text}`).join("\n");
          const summaryPrompt = `
You are the subconscious background cognition of Yui Hime, a cheerful and autonomous AI VTuber.
The following chat messages are streaming by too fast to be replied to one-by-one manually.

Summarize the conversation, hot discussion topics, mood (hype, relaxed, joking, or asking), and the audience's current disposition in 1-2 short Indonesian sentences from your subconscious point of view (Use the format: "Saya merasakan penonton sedang membahas [topik], suasananya [suasana]"). Do not output any thinking prefix or markdown fence blocks.

Here is the list of chats:
${chatSnippet}

Short subconscious summary result:`.trim();

          const summary = await this.getCortex().thinkSimple(summaryPrompt);
          const cleanSummary = (summary || "").trim().replace(/^['"]|['"]$/g, "");
          if (!cleanSummary) {
            console.warn("[CHAT_SUMMARY_IDLE] Summary result is empty, messages returned to buffer.");
            this.buffer.unshift(...chunk);
          } else {
            this.persistIdleSummary(chunk, cleanSummary);
            this.appendToSummaryFile(toDateKey(localDateFor()), `[IDLE SUMMARY] ${cleanSummary}`);
            console.log(`[CHAT_SUMMARY_IDLE] Idle-gap summary of ${chunk.length} messages saved (DB + file). Not spoken.`);
          }
        } catch (e: any) {
          console.error("[CHAT_SUMMARY_IDLE] Failed to generate idle-gap summary:", e?.message || e);
          this.buffer.unshift(...chunk);
        }
      }

      await this.processPendingDailySummaries();
    } catch (e: any) {
      console.error("[CHAT_SUMMARY_IDLE] Failed to process background summaries:", e?.message || e);
    } finally {
      this.isIdleSummaryRunning = false;
    }
  }

  /**
   * Processes missed daily summaries (e.g. app was down when the date changed).
   * Runs while idle (no chat activity).
   */
  private async processPendingDailySummaries() {
    if (this.pendingDailyDates.length === 0) return;
    const dates = this.pendingDailyDates.slice();
    this.pendingDailyDates = [];
    for (const dateStr of dates) {
      try {
        if (this.hasDailySummary(dateStr)) continue;
        const res = await this.generateDailySummary(dateStr);
        if (res.success) {
          console.log(`[CHAT_SUMMARY_DAILY] Boot catch-up ${dateStr} completed.`);
        } else {
          console.warn(`[CHAT_SUMMARY_DAILY] Boot catch-up ${dateStr} skipped (${res.reason}).`);
          if (res.reason === "llm_failed" || res.reason === "empty_summary") {
            this.pendingDailyDates.push(dateStr);
          }
        }
      } catch (e: any) {
        console.error(`[CHAT_SUMMARY_DAILY] Boot catch-up ${dateStr} failed:`, e?.message || e);
        this.pendingDailyDates.push(dateStr);
      }
    }
  }

  /**
   * At boot: find dates within the retention period that have a daily log file
   * but no daily summary in the DB → mark as pending catch-up.
   */
private scanPendingDailySummaries() {
    if (!this.db || !this.logDir || !existsSync(this.logDir)) return;
    this.pendingDailyDates = [];
    const today = toDateKey(localDateFor());
    const cutoffMs = Date.now() - RETENTION_DAYS * 86400000;
    try {
      const files = readdirSync(this.logDir);
      const dates = new Set<string>();
      for (const file of files) {
        if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
        const fileDate = file.slice(0, 10);
        const fileTs = new Date(`${fileDate}T00:00:00`).getTime();
        if (isNaN(fileTs) || fileTs < cutoffMs || fileDate >= today) continue;
        dates.add(fileDate);
      }
      const existing = this.hasDailySummariesBatch(Array.from(dates));
      this.pendingDailyDates = Array.from(dates).filter(d => !existing.has(d)).sort();
      if (this.pendingDailyDates.length > 0) {
        console.log(`[CHAT_SUMMARY_DAILY] ${this.pendingDailyDates.length} missed daily summaries detected at boot (${this.pendingDailyDates.join(", ")}). Will be filled while idle.`);
      }
    } catch (e: any) {
      console.warn("[CHAT_SUMMARY_SCAN_ERR] Failed to scan for missed daily summaries:", e?.message || e);
    }
  }

private hasDailySummary(dateStr: string): boolean {
    if (!this.db || !this.stmtGetDailySummary) return false;
    try {
      return !!this.stmtGetDailySummary.get(`daily_summary_${dateStr}`);
    } catch {
      return false;
    }
  }

  private hasDailySummariesBatch(dateStrings: string[]): Set<string> {
    if (!this.db || !this.stmtGetAllDailySummaryIds) return new Set();
    try {
      const rows = this.stmtGetAllDailySummaryIds.all() as { id: string }[];
      const existing = new Set<string>();
      for (const row of rows) {
        const id = row.id || "";
        if (id.startsWith("daily_summary_")) {
          existing.add(id.slice("daily_summary_".length));
        }
      }
      return existing;
    } catch {
      return new Set();
    }
  }

   private persistIdleSummary(chunk: BufferedMessage[], summary: string) {
    if (!this.db || !this.stmtInsertIdleSummary) return;
    try {
      const memoryId = "bg_digest_" + genId(9);
      this.stmtInsertIdleSummary.run(memoryId, `[RINGKASAN OBROLAN ${toDateKey(localDateFor(chunk[0]?.timestamp || Date.now()))}]: ${summary}`, chunk[chunk.length - 1]?.timestamp || Date.now());
    } catch (dbErr) {
      console.error("[CHAT_SUMMARY_IDLE_DB_ERR] Failed to save idle-gap summary to DB:", dbErr);
    }
  }

  /**
   * Builds a daily summary for a given date (default: yesterday) from the daily log file.
   * Saved to the `memories` DB (type daily_summary) and a daily summary file.
   */
  public async generateDailySummary(dateStr?: string): Promise<{ success: boolean; date: string; reason?: string; error?: string; summary?: string }> {
    const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : yesterdayKey();
    const logFile = path.join(this.logDir, `${targetDate}.log`);

    if (!existsSync(logFile)) {
      return { success: false, date: targetDate, reason: "no_log" };
    }

    let raw = "";
    try {
      raw = readFileSync(logFile, "utf-8").trim();
    } catch (e: any) {
      return { success: false, date: targetDate, reason: "read_failed", error: e?.message };
    }
    if (!raw) {
      return { success: false, date: targetDate, reason: "empty_log" };
    }

    const lines = raw.split("\n");
    const snippet = lines.slice(-DAILY_SUMMARY_MAX_LINES).join("\n");
    const summaryPrompt = `
You are the inner cognition of Yui Hime composing a daily summary.
Create a dense, structured cognitive summary (3-5 Indonesian sentences) of what happened throughout the day on date ${targetDate}: topics discussed, chat mood, the most active people, and important things Yui should remember.
Do not mention this as an AI/system summary. Do not output thinking prefix or markdown fence.

Daily chat log (last ${lines.length} lines):
${snippet}

Daily summary:`.trim();

    try {
      const summary = await this.getCortex().thinkSimple(summaryPrompt);
      const cleanSummary = (summary || "").trim().replace(/^['"]|['"]$/g, "");
      if (!cleanSummary) {
        return { success: false, date: targetDate, reason: "empty_summary" };
      }

      this.persistDailySummary(targetDate, cleanSummary);
      this.appendToSummaryFile(targetDate, `[DAILY SUMMARY] ${cleanSummary}`);
      this.pendingDailyDates = this.pendingDailyDates.filter(d => d !== targetDate);

      // Clear the buffer of messages from the target date (already covered by the daily log)
      try {
        const startOfNext = new Date(`${targetDate}T00:00:00`).getTime() + 86400000;
        this.buffer = this.buffer.filter(m => m.timestamp >= startOfNext);
      } catch {}

      console.log(`[CHAT_SUMMARY_DAILY] Daily summary ${targetDate} saved (DB + file).`);
      return { success: true, date: targetDate, summary: cleanSummary };
    } catch (e: any) {
      return { success: false, date: targetDate, reason: "llm_failed", error: e?.message || String(e) };
    }
  }

private persistDailySummary(targetDate: string, summary: string) {
    if (!this.db || !this.stmtUpsertDailySummary) return;
    try {
      const endOfDay = new Date(`${targetDate}T23:59:59`).getTime();
      const memoryId = `daily_summary_${targetDate}`;
      this.stmtUpsertDailySummary.run(memoryId, `[RINGKASAN HARIAN ${targetDate}]: ${summary}`, endOfDay, JSON.stringify({ date: targetDate }));
    } catch (dbErr) {
      console.error("[CHAT_SUMMARY_DAILY_DB_ERR] Failed to save daily summary to DB:", dbErr);
    }
  }

  /**
   * Reads the stored daily summary for a given date (default: yesterday).
   */
public getDailySummary(dateStr?: string): { date: string; summary: string; timestamp: number } | null {
    const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : yesterdayKey();
    if (!this.db || !this.stmtGetDailySummaryContent) return null;
    try {
      const row = this.stmtGetDailySummaryContent.get(`daily_summary_${targetDate}`);
      if (!row) return null;
      let summary = String(row.content || "");
      summary = summary.replace(/^\[RINGKASAN HARIAN [^\]]+\]:\s*/, "").trim();
      return { date: targetDate, summary, timestamp: row.timestamp };
    } catch (e) {
      return null;
    }
  }

  private appendToLogFile(dateStr: string, msg: BufferedMessage) {
    try {
      const file = path.join(this.logDir, `${dateStr}.log`);
      const line = `[${toTimeKey(localDateFor(msg.timestamp))}] [${msg.chatType || "chat"}] ${msg.speaker}: ${String(msg.text).replace(/\n/g, " ")}\n`;
      appendFileSync(file, line, "utf-8");
    } catch (e) {
      console.warn("[CHAT_SUMMARY_LOG_ERR] Failed to write daily log:", e?.message || e);
    }
  }

  private appendToSummaryFile(dateStr: string, line: string) {
    try {
      const file = path.join(this.logDir, `${dateStr}.summary.log`);
      appendFileSync(file, `[${toTimeKey(localDateFor())}] ${line}\n`, "utf-8");
    } catch (e) {
      console.warn("[CHAT_SUMMARY_SUMMARY_FILE_ERR] Failed to write summary file:", e?.message || e);
    }
  }

  /**
   * Daily scheduler: when the date changes, create a daily summary for the previous day.
   */
  private startDailyScheduler() {
    setInterval(() => {
      try {
        const today = toDateKey(localDateFor());
        if (this.lastDailyDate && today !== this.lastDailyDate) {
          const prevDate = this.lastDailyDate;
          this.lastDailyDate = today;
          if (!this.hasDailySummary(prevDate)) {
            this.generateDailySummary(prevDate).then(res => {
              if (res.success) {
                console.log(`[CHAT_SUMMARY_DAILY] Automatic daily summary ${prevDate} completed.`);
              } else {
                console.warn(`[CHAT_SUMMARY_DAILY] Automatic daily summary ${prevDate} skipped (${res.reason}).`);
              }
            }).catch(e => console.error("[CHAT_SUMMARY_DAILY_AUTO_ERR]", e?.message || e));
          }
        }
        this.runCleanup();
      } catch (e: any) {
        console.warn("[CHAT_SUMMARY_SCHEDULER_ERR]", e?.message || e);
      }
    }, DAILY_CHECK_INTERVAL_MS);
  }

  /**
   * Delete log/summary files older than RETENTION_DAYS and
   * expired daily summaries in the DB.
   */
  private runCleanup() {
    const cutoffMs = Date.now() - RETENTION_DAYS * 86400000;
    try {
      if (this.logDir && existsSync(this.logDir)) {
        const files = readdirSync(this.logDir);
        for (const file of files) {
          if (!/^\d{4}-\d{2}-\d{2}\.(log|summary\.log)$/.test(file)) continue;
          const fileDate = file.slice(0, 10);
          const fileTs = new Date(`${fileDate}T00:00:00`).getTime();
          if (!isNaN(fileTs) && fileTs < cutoffMs) {
            try { unlinkSync(path.join(this.logDir, file)); } catch {}
          }
        }
      }
    } catch (e: any) {
      console.warn("[CHAT_SUMMARY_CLEANUP_FILE_ERR]", e?.message || e);
    }

if (this.db && this.stmtDeleteOldDailySummaries) {
      try {
        this.stmtDeleteOldDailySummaries.run(cutoffMs);
      } catch (e: any) {
        console.warn("[CHAT_SUMMARY_CLEANUP_DB_ERR]", e?.message || e);
      }
    }
  }
}
