import path from "path";
import { appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, readFileSync } from "fs";
import { Cortex } from "../cortex.js";
import { dbPath } from "../database.js";
import { getTzOffsetHours, toLocalClock } from "../utils/dualClock.js";

interface BufferedMessage {
  speaker: string;
  text: string;
  timestamp: number;
  chatType?: string;
}

const IDLE_TIMEOUT_MS = 120_000; // Jeda hening 120 detik tanpa pesan masuk
const MIN_IDLE_SUMMARY_MESSAGES = 30; // Minimal 30 pesan sejak ringkasan terakhir
const MAX_IDLE_SUMMARY_MESSAGES = 80; // Cap per sesi agar prompt tetap ringkas
const DAILY_SUMMARY_MAX_LINES = 500; // Cap baris log harian yang dirangkum
const RETENTION_DAYS = 7; // Log harian & ringkasan disimpan 7 hari berdasarkan tanggal
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
 * Date "lokal" user (circadian-rhythm.timezoneOffsetHours) untuk kunci tanggal harian.
 * Pastikan log harian & daily summary memakai hari lokal, bukan server UTC.
 */
function localDateFor(epochMs?: number): Date {
  return toLocalClock(getTzOffsetHours(), epochMs != null ? new Date(epochMs) : undefined);
}

function yesterdayKey(): string {
  return toDateKey(localDateFor(Date.now() - 86400000));
}

/**
 * ChatSummaryEngine — Pencerna Obrolan Latar Belakang.
 *
 * Dua tipe ringkasan:
 * 1. Idle-gap summary: dipicu saat tidak ada pesan selama 120 detik DAN minimal
 *    30 pesan terkumpul sejak ringkasan terakhir. Murni background, tidak dibacakan.
 * 2. Daily summary: dibuat otomatis saat tanggal berganti + manual via API/tool.
 *
 * Penyimpanan:
 * - Setiap pesan masuk dicatat ke file log harian (<dataDir>/chat_logs/YYYY-MM-DD.log).
 * - Hasil ringkasan disimpan ke database `memories` DAN file ringkasan harian.
 * - Log & ringkasan dipertahankan 7 hari berdasarkan tanggal lalu dibersihkan.
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
   * Dipanggil untuk setiap pesan masuk. Mencatat ke log harian, menambah buffer,
   * dan mengatur ulang timer jeda hening.
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
   * Membaca file log harian mentah untuk tanggal tertentu (default: kemarin).
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
      console.warn("[CHAT_SUMMARY_READ_ERR] Gagal membaca log harian:", e?.message || e);
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
   * Trigger jeda hening: hanya berjalan jika minimal 30 pesan terkumpul
   * sejak ringkasan terakhir. Murni background — tidak diucapkan/dibroadcast.
   * Setelah itu, proses daily summary yang terlewat (boot catch-up).
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
          console.log(`[CHAT_SUMMARY_IDLE] Jeda hening terdeteksi. Merangkum ${chunk.length} pesan latar belakang...`);

          const chatSnippet = chunk.map(c => `[${c.speaker}]: ${c.text}`).join("\n");
          const summaryPrompt = `
Anda adalah kognisi latar belakang subkesadaran Yui Hime, AI VTuber ceria dan otonom.
Pesan-pesan obrolan berikut meluncur cepat sehingga tidak bisa dibalas satu-per-satu secara manual.

Rangkumlah percakapan, topik diskusi hangat, suasana (hype, santai, bercanda, atau bertanya), dan kemauan penonton saat ini dalam 1-2 kalimat pendek bahasa Indonesia dari sudut pandang subkesadaran Anda (Gunakan format: "Saya merasakan penonton sedang membahas [topik], suasananya [suasana]"). Do not output any thinking prefix or markdown fence blocks.

Berikut daftar obrolannya:
${chatSnippet}

Hasil rangkuman singkat subkesadaran:`.trim();

          const summary = await this.getCortex().thinkSimple(summaryPrompt);
          const cleanSummary = (summary || "").trim().replace(/^['"]|['"]$/g, "");
          if (!cleanSummary) {
            console.warn("[CHAT_SUMMARY_IDLE] Hasil ringkasan kosong, pesan dikembalikan ke buffer.");
            this.buffer.unshift(...chunk);
          } else {
            this.persistIdleSummary(chunk, cleanSummary);
            this.appendToSummaryFile(toDateKey(localDateFor()), `[IDLE SUMMARY] ${cleanSummary}`);
            console.log(`[CHAT_SUMMARY_IDLE] Ringkasan jeda hening ${chunk.length} pesan disimpan (DB + file). Tidak diucapkan.`);
          }
        } catch (e: any) {
          console.error("[CHAT_SUMMARY_IDLE] Gagal menghasilkan ringkasan jeda hening:", e?.message || e);
          this.buffer.unshift(...chunk);
        }
      }

      await this.processPendingDailySummaries();
    } catch (e: any) {
      console.error("[CHAT_SUMMARY_IDLE] Gagal memproses ringkasan latar belakang:", e?.message || e);
    } finally {
      this.isIdleSummaryRunning = false;
    }
  }

  /**
   * Memproses daily summary yang terlewat (mis. aplikasi mati saat tanggal berganti).
   * Dijalankan saat idle (tidak ada aktivitas chat).
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
          console.log(`[CHAT_SUMMARY_DAILY] Boot catch-up ${dateStr} selesai.`);
        } else {
          console.warn(`[CHAT_SUMMARY_DAILY] Boot catch-up ${dateStr} dilewati (${res.reason}).`);
          if (res.reason === "llm_failed" || res.reason === "empty_summary") {
            this.pendingDailyDates.push(dateStr);
          }
        }
      } catch (e: any) {
        console.error(`[CHAT_SUMMARY_DAILY] Boot catch-up ${dateStr} gagal:`, e?.message || e);
        this.pendingDailyDates.push(dateStr);
      }
    }
  }

  /**
   * Saat boot: cari tanggal dalam periode retensi yang punya file log harian
   * tapi belum punya daily summary di DB → tandai sebagai pending catch-up.
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
        console.log(`[CHAT_SUMMARY_DAILY] ${this.pendingDailyDates.length} daily summary terlewat terdeteksi saat boot (${this.pendingDailyDates.join(", ")}). Akan diisi saat idle.`);
      }
    } catch (e: any) {
      console.warn("[CHAT_SUMMARY_SCAN_ERR] Gagal memindai daily summary yang terlewat:", e?.message || e);
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
      const memoryId = "bg_digest_" + Math.random().toString(36).substr(2, 9);
      this.stmtInsertIdleSummary.run(memoryId, `[RINGKASAN OBROLAN ${toDateKey(localDateFor(chunk[0]?.timestamp || Date.now()))}]: ${summary}`, chunk[chunk.length - 1]?.timestamp || Date.now());
    } catch (dbErr) {
      console.error("[CHAT_SUMMARY_IDLE_DB_ERR] Gagal menyimpan ringkasan jeda hening ke DB:", dbErr);
    }
  }

  /**
   * Membuat daily summary untuk tanggal tertentu (default: kemarin) dari file log harian.
   * Disimpan ke DB `memories` (type daily_summary) dan file ringkasan harian.
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
Anda adalah kognisi batin Yui Hime yang menyusun ringkasan harian.
Buatlah ringkasan kognitif yang padat dan terstruktur (3-5 kalimat bahasa Indonesia) tentang apa yang terjadi sepanjang hari pada tanggal ${targetDate}: topik yang dibahas, suasana obrolan, orang-orang yang paling aktif, dan hal penting yang perlu diingat Yui.
Jangan menyebut ini sebagai AI/ringkasan sistem. Jangan output thinking prefix atau markdown fence.

Log obrolan harian (terakhir ${lines.length} baris):
${snippet}

Ringkasan harian:`.trim();

    try {
      const summary = await this.getCortex().thinkSimple(summaryPrompt);
      const cleanSummary = (summary || "").trim().replace(/^['"]|['"]$/g, "");
      if (!cleanSummary) {
        return { success: false, date: targetDate, reason: "empty_summary" };
      }

      this.persistDailySummary(targetDate, cleanSummary);
      this.appendToSummaryFile(targetDate, `[DAILY SUMMARY] ${cleanSummary}`);
      this.pendingDailyDates = this.pendingDailyDates.filter(d => d !== targetDate);

      // Bersihkan buffer dari pesan yang termasuk tanggal target (sudah tercakup log harian)
      try {
        const startOfNext = new Date(`${targetDate}T00:00:00`).getTime() + 86400000;
        this.buffer = this.buffer.filter(m => m.timestamp >= startOfNext);
      } catch {}

      console.log(`[CHAT_SUMMARY_DAILY] Daily summary ${targetDate} disimpan (DB + file).`);
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
      console.error("[CHAT_SUMMARY_DAILY_DB_ERR] Gagal menyimpan daily summary ke DB:", dbErr);
    }
  }

  /**
   * Membaca daily summary yang tersimpan untuk tanggal tertentu (default: kemarin).
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
      console.warn("[CHAT_SUMMARY_LOG_ERR] Gagal menulis log harian:", e?.message || e);
    }
  }

  private appendToSummaryFile(dateStr: string, line: string) {
    try {
      const file = path.join(this.logDir, `${dateStr}.summary.log`);
      appendFileSync(file, `[${toTimeKey(localDateFor())}] ${line}\n`, "utf-8");
    } catch (e) {
      console.warn("[CHAT_SUMMARY_SUMMARY_FILE_ERR] Gagal menulis file ringkasan:", e?.message || e);
    }
  }

  /**
   * Penjadwal harian: saat tanggal berganti, buat daily summary untuk hari sebelumnya.
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
                console.log(`[CHAT_SUMMARY_DAILY] Daily summary otomatis ${prevDate} selesai.`);
              } else {
                console.warn(`[CHAT_SUMMARY_DAILY] Daily summary otomatis ${prevDate} dilewati (${res.reason}).`);
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
   * Hapus file log/ringkasan yang lebih lama dari RETENTION_DAYS dan
   * daily summary DB yang sudah kadaluwarsa.
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
