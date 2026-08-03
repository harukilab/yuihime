import { NeuralInterface, NeuralReplyResult } from "./NeuralInterface.js";
import { eventBus } from "@shared/core/kernel/event-bus";
import { ChatSummaryEngine } from "./ChatSummaryEngine.js";
import { CognitiveScheduler } from "./CognitiveScheduler.js";
import { PromptRegistry } from "../PromptRegistry.js";
import { SettingsManager } from "./settings.js";
import { broadcastToWS } from "../server/apiRouter.js";
import { activeDiscordClient } from "../server/discord.js";
import { activeTelegramBot } from "../server/telegram.js";
import { GlobalOutputDeduplicator } from "./GlobalOutputDeduplicator.js";
import { Kernel } from "../kernel/core.js";
import { stateMachine } from "./state-machine.js";
import { logDbRetry } from "../database.js";
import { getFocusGoal, getGoalChildren } from "../goalDecomposition.js";
import { genId } from '@shared/core/idGen';

const DEFAULT_PENDING_FEEDBACK = `[SYSTEM MESSAGE]: Koneksi saraf batin Yuihime dengan kognisi LLM sedang sangat padat atau terputus sementara 📡. Tapi jangan khawatir! Pesanmu ("\${inputPreview}") sudah aman dalam antrean tunggu kognisi Yui. Yui akan membalas secara otomatis setelah tautan saraf sinkron kembali! 🌸`;

PromptRegistry.getInstance().register('multi-channel-queue:pending_feedback', DEFAULT_PENDING_FEEDBACK);

const PIPELINE_TIMEOUT_FALLBACK = "Yui lagi gangguan saraf kognitif sebentar... Pesanmu ke-hold dulu, coba kirim ulang dalam beberapa saat ya~ 🌸";

async function withHardTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isSqliteBusy(err: any): boolean {
  return err && (err.code === 'SQLITE_BUSY' || err.message?.includes('database is locked') || err.message?.includes('SQLITE_BUSY'));
}

async function withSqliteRetry<T>(label: string, db: any, fn: () => T): Promise<T> {
  const maxRetries = 5;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.resolve(fn());
    } catch (err: any) {
      lastErr = err;
      if (!isSqliteBusy(err)) throw err;
      const backoff = 200 * attempt;
      console.warn(`[QUEUE_SQLITE_RETRY] ${label} hit SQLITE_BUSY (attempt ${attempt}/${maxRetries}). Retrying in ${backoff}ms...`);
      logDbRetry(label, `SQLITE_BUSY (attempt ${attempt}/${maxRetries}), retrying in ${backoff}ms`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  logDbRetry(label, `FAILED after ${maxRetries} retries`);
  throw lastErr;
}

export interface ReplyMeta {
  mood?: NeuralReplyResult['mood'];
  emotion?: NeuralReplyResult['emotion'];
  sentiment?: number;
}

export interface QueueItem {
  input: string;
  senderName: string;
  contextId: string;
  chatType: string;
  timestamp: number;
  onReply: (reply: string, meta?: ReplyMeta) => void;
  onError?: (err: any) => void;
  attempts?: number;
  pendingId?: string;
  chatId?: string;
  sourceMessageId?: number;
  updateId?: number;
}

export interface QueueSourceRef {
  chatId?: string;
  sourceMessageId?: number;
  updateId?: number;
}

export class MultiChannelQueue {
  private static instance: MultiChannelQueue | null = null;
  private queue: QueueItem[] = [];
  private processing = false;
  private db: any = null;
  private msgTimestamps: number[] = []; // for frequency calculation
  private recentMsgHashes: { hash: string; timestamp: number }[] = [];
  private processingStartTime = 0;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  // Watchdog: jika satu pesan terjebak lebih lama dari ini (mis. generate_image bisa
  // sampai ~180s), anggap stuck dan reset. Harus > NEURAL_PIPELINE_TIMEOUT_MS agar
  // pipeline kognitif panjang (LLM + tool chain) tidak terpotong di tengah jalan.
  private static readonly PROCESSING_TIMEOUT_MS = 200000;

  // Hard cap untuk seluruh pipeline kognitif (LLM + tool chain) agar jalur I/O pesan
  // tidak pernah menunggu selamanya pada satu pesan yang macet.
  private static readonly NEURAL_PIPELINE_TIMEOUT_MS = 150000;
  
  // Dynamic Background Worker Pool Configuration & Status Trackers
  private activeBgWorkers = 0;
  private maxBgWorkers = 2; // reduced from 4 to avoid SQLite busy contention
  private runningBgMsgIds = new Set<string>();

  // Proactive Impulse Engine Trackers
  private lastProactiveTime = Date.now();
  private isProactiveRunning = false;
  private lastHighFreqNotifyTime = 0;

  // Output dedup: track recently delivered message hashes to prevent duplicate sends
  private recentOutputHashes: { hash: string; timestamp: number }[] = [];
  private static readonly OUTPUT_DEDUP_WINDOW_MS = 10000;

  // Crash-recovery: row pending yang nyangkut di 'processing' lebih lama dari TTL ini
  // akan di-claim ulang sebagai 'pending' agar diproses kembali setelah restart.
  private static readonly PROCESSING_RECLAIM_TTL_MS = 15 * 60 * 1000;

  // Hold mechanism: pause incoming/outgoing message processing
  private holdMode = false;
  private holdOutgoing = false;
  private heldMessages: QueueItem[] = [];

  // Cached prepared statements to reduce DB connection overhead
  private stmtResetProactiveLock: any = null;
  private stmtUpdatePendingFailed: any = null;
  private stmtUpdatePendingRetry: any = null;
  private stmtSelectProactiveState: any = null;
  private stmtSelectAgentState: any = null;
  private stmtUpdateAgentMood: any = null;
  private stmtUpdateProactiveLock: any = null;
  private stmtInsertPending: any = null;
  private stmtInsertPendingFailed: any = null;
  private stmtMarkProcessing: any = null;
  private stmtMarkHeld: any = null;
  private stmtMarkCompleted: any = null;
  private stmtResetToPending: any = null;
  private stmtReclaimStuck: any = null;
  private stmtResumeHeldOnBoot: any = null;
  private stmtSelectPendingRows: any = null;
  private stmtSelectLastInteraction: any = null;
  private stmtSelectProactiveSent: any = null;
  private stmtSelectRecentMessages: any = null;

  private constructor() {
    this.startPendingScheduler();
    this.startSuspendedTasksScheduler();
  }

  public static getInstance(): MultiChannelQueue {
    if (!this.instance) {
      this.instance = new MultiChannelQueue();
    }
    return this.instance;
  }

  public setDatabase(db: any) {
    this.db = db;
    this.stmtResetProactiveLock = this.db.prepare("UPDATE agent_state SET proactiveLocked = 0 WHERE id = 1");
    this.stmtUpdatePendingFailed = this.db.prepare("UPDATE pending_messages SET attempts = ?, status = 'failed' WHERE id = ?");
    this.stmtUpdatePendingRetry = this.db.prepare("UPDATE pending_messages SET attempts = ?, status = 'pending', started_at = NULL WHERE id = ?");
    this.stmtSelectProactiveState = this.db.prepare("SELECT proactiveLocked, lastProactiveTimestamp FROM agent_state WHERE id = 1");
    this.stmtSelectAgentState = this.db.prepare("SELECT status, mood, relation FROM agent_state WHERE id = 1");
    this.stmtUpdateAgentMood = this.db.prepare("UPDATE agent_state SET mood = ? WHERE id = 1");
    this.stmtUpdateProactiveLock = this.db.prepare("UPDATE agent_state SET proactiveLocked = 1, lastProactiveTimestamp = ? WHERE id = 1");
    this.stmtInsertPending = this.db.prepare(`
      INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status, chat_id, source_message_id, update_id, started_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `);
    this.stmtInsertPendingFailed = this.db.prepare(`
      INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'failed')
    `);
    this.stmtMarkProcessing = this.db.prepare("UPDATE pending_messages SET status = 'processing', started_at = ? WHERE id = ?");
    this.stmtMarkHeld = this.db.prepare("UPDATE pending_messages SET status = 'held', started_at = NULL WHERE id = ?");
    this.stmtMarkCompleted = this.db.prepare("UPDATE pending_messages SET status = 'completed', started_at = NULL WHERE id = ?");
    this.stmtResetToPending = this.db.prepare("UPDATE pending_messages SET status = 'pending', started_at = NULL WHERE id = ?");
    this.stmtReclaimStuck = this.db.prepare(`
      UPDATE pending_messages SET status = 'pending', started_at = NULL
      WHERE status = 'processing' AND started_at IS NOT NULL AND started_at < ?
    `);
    this.stmtResumeHeldOnBoot = this.db.prepare("UPDATE pending_messages SET status = 'pending', started_at = NULL WHERE status = 'held'");
    this.stmtSelectPendingRows = this.db.prepare(`
      SELECT * FROM pending_messages 
      WHERE status = 'pending' AND attempts < 5 
      ORDER BY timestamp ASC LIMIT ?
    `);
    this.stmtSelectLastInteraction = this.db.prepare(`
      SELECT context, speaker, timestamp, chat_type FROM memories
      WHERE type = 'interaction' AND speaker != 'agent' AND speaker != 'System' AND speaker != 'system' AND speaker != 'subconscious'
      ORDER BY timestamp DESC LIMIT 1
    `);
    this.stmtSelectProactiveSent = this.db.prepare(`
      SELECT 1 FROM memories
      WHERE type = 'event' 
        AND context = ? 
        AND tags LIKE '%proactive%' 
        AND timestamp > ?
      LIMIT 1
    `);
    this.stmtSelectRecentMessages = this.db.prepare(`
      SELECT speaker, content FROM memories 
      WHERE type = 'interaction' AND speaker != 'System' AND speaker != 'system' AND speaker != 'subconscious'
      ORDER BY timestamp DESC LIMIT 4
    `);
    ChatSummaryEngine.getInstance().setDatabase(db);

    // Crash-recovery on boot:
    // 1) Resume pesan yang sebelumnya di-hold (hold mode adalah flag runtime, tak dipertahankan lintas restart)
    // 2) Reclaim row 'processing' yang nyangkut dari sesi mati mendadak (yang hidup pasti < TTL karena barusan di-start)
    try {
      const heldResumed = this.stmtResumeHeldOnBoot.run().changes;
      if (heldResumed > 0) {
        console.log(`[QUEUE_RECOVERY] Resumed ${heldResumed} previously held message(s) to pending dispatch.`);
      }
      const reclaimed = this.stmtReclaimStuck.run(Date.now() - MultiChannelQueue.PROCESSING_RECLAIM_TTL_MS).changes;
      if (reclaimed > 0) {
        console.log(`[QUEUE_RECOVERY] Reclaimed ${reclaimed} stuck 'processing' row(s) from previous session; will re-dispatch.`);
      }
    } catch (reclaimErr: any) {
      console.warn(`[QUEUE_RECOVERY] Boot reclaim failed (non-fatal):`, reclaimErr.message || reclaimErr);
    }

    // Instantly trigger dispatch of pending messages in background on database setup/sync
    console.log("[QUEUE] Database connected. Starting initial parallel dispatch of pending messages...");
    this.dispatchPendingMessages().catch(err => {
      console.error("[QUEUE_INIT_DISPATCH_ERR] Failed to execute initial dispatch:", err);
    });
    this.startProactiveImpulseEngine();
  }

  /**
   * Mengaktifkan/menonaktifkan mode tahan. Ketika diaktifkan, pesan masuk disimpan
   * tanpa diproses dan balasan keluar ditahan.
   */
  public setHoldMode(enabled: boolean) {
    this.holdMode = enabled;
    this.holdOutgoing = enabled;
    console.log(`[QUEUE_HOLD] Hold mode ${enabled ? "diaktifkan" : "dinonaktifkan"}.`);
    if (!enabled) {
      this.flushHeldMessages();
    }
  }

  /**
   * Mengaktifkan/menonaktifkan penahanan balasan keluar saja.
   */
  public setHoldOutgoing(enabled: boolean) {
    this.holdOutgoing = enabled;
    console.log(`[QUEUE_HOLD] Hold outgoing ${enabled ? "diaktifkan" : "dinonaktifkan"}.`);
  }

  /**
   * Graceful shutdown (SIGINT/SIGTERM): tiriskan antrean in-memory ke pending_messages
   * agar pesan yang belum sempat diproses tidak hilang saat restart terencana.
   * Pesan yang sedang di-hold tetap 'held' (akan dilanjutkan saat boot berikutnya).
   */
  public drainQueueToPending(): void {
    if (!this.db) return;
    let drained = 0;
    for (const item of this.queue) {
      if (item.pendingId) {
        try { this.stmtResetToPending.run(item.pendingId); drained++; } catch (e) {}
      }
    }
    for (const item of this.heldMessages) {
      if (item.pendingId) {
        try { this.stmtMarkHeld.run(item.pendingId); } catch (e) {}
      }
    }
    this.queue = [];
    console.log(`[QUEUE_DRAIN] Reset ${drained} queued message(s) to pending for crash-safe restart.`);
  }

  /**
   * Memproses semua pesan yang ditahan saat mode tahan dinonaktifkan.
   */
  private flushHeldMessages() {
    if (this.heldMessages.length === 0) return;
    console.log(`[QUEUE_HOLD] Flushing ${this.heldMessages.length} held message(s)...`);
    const messages = [...this.heldMessages];
    this.heldMessages = [];
    for (const msg of messages) {
      if (msg.pendingId && this.db) {
        try {
          this.stmtMarkProcessing.run(Date.now(), msg.pendingId);
        } catch (e) {}
      }
      this.queue.push({
        input: msg.input,
        senderName: msg.senderName,
        contextId: msg.contextId,
        chatType: msg.chatType,
        timestamp: msg.timestamp,
        onReply: msg.onReply,
        onError: msg.onError,
        pendingId: msg.pendingId,
        chatId: msg.chatId,
        sourceMessageId: msg.sourceMessageId,
        updateId: msg.updateId
      });
    }
    this.processNext();
  }

  /**
   * Menambahkan pesan dari berbagai saluran (Telegram, Webhook, OBS Chat, dll) ke antrean terpadu.
   * Sebelum diproses, pesan selalu di-persist ke pending_messages (write-ahead inbox) supaya
   * crash / mati mendadak tidak menghilangkan pesan — row akan di-claim ulang saat daemon kembali aktif.
   */
  public addMessage(
    input: string,
    senderName: string,
    contextId: string,
    chatType: string,
    onReply: (reply: string, meta?: ReplyMeta) => void,
    onError?: (err: any) => void,
    source?: QueueSourceRef
  ) {
    const timestamp = Date.now();
    this.msgTimestamps.push(timestamp);
    this.cleanTimestamps();

    // Reset proactive lock when user sends a new message
    if (this.db && this.stmtResetProactiveLock) {
      try {
        this.stmtResetProactiveLock.run();
      } catch (e) {}
    }

    const freq = this.getChatFrequency();
    console.log(`[QUEUE] Message received from ${senderName} (${chatType}). Chat frequency: ${freq.toFixed(1)} msgs/15s.`);

    // 0. Deduplication guard: reject exact duplicate messages within window (less aggressive for private chats)
    const isPrivateChat = chatType === 'private';
    const dedupWindow = isPrivateChat ? 3000 : 5000;
    const dedupHash = `${input}|${senderName}|${contextId}`;
    const now = Date.now();
    this.recentMsgHashes = this.recentMsgHashes.filter(h => now - h.timestamp < dedupWindow);
    const isDuplicate = this.recentMsgHashes.some(h => h.hash === dedupHash);
    if (!isDuplicate) {
      this.recentMsgHashes.push({ hash: dedupHash, timestamp: now });
    }

    // Write-ahead: persist ke pending_messages SEBELUM diputuskan jalurnya.
    // Row live-path langsung ditandai 'processing' (sinkron) agar dispatcher background (30s)
    // tidak menduplikasi pekerjaannya; jalur sampling/biarkan 'pending'.
    let pendingId: string | undefined;
    if (this.db) {
      try {
        pendingId = "pending_" + genId(11);
        this.stmtInsertPending.run(
          pendingId,
          input,
          senderName,
          contextId,
          chatType,
          timestamp,
          'pending',
          source?.chatId ?? null,
          source?.sourceMessageId ?? null,
          source?.updateId ?? null,
          null
        );
      } catch (dbErr) {
        console.error("[QUEUE_PERSIST_ERR] Failed to persist incoming message:", dbErr);
        pendingId = undefined;
      }
    }

    // Hold mode: store incoming messages without processing
    if (this.holdMode) {
      if (pendingId) {
        try { this.stmtMarkHeld.run(pendingId); } catch (e) {}
      }
      this.heldMessages.push({ input, senderName, contextId, chatType, timestamp, onReply, onError, pendingId, ...(source || {}) });
      console.log(`[QUEUE_HOLD] Incoming message from ${senderName} held (hold mode active).`);
      return;
    }
    // 1. Catat semua pesan (tanpa terkecuali) ke daily log + buffer ringkasan latar belakang
    //    (jeda hening 120 detik / ringkasan harian) agar Yui tetap memahami konteks penuh.
    ChatSummaryEngine.getInstance().noteIncomingMessage({ speaker: senderName, text: input, timestamp, chatType });

    // 2. Evaluasi Antrean berdasarkan Kecepatan & Frekuensi Obrolan
    const threshold = 4; // Ambang batas pesan per 15 detik untuk mengaktifkan High-Frequency Sampling

    if (freq >= threshold && !isPrivateChat) {
      // MODE RAMAI: Lalukan sampling selektif untuk mencegah overload AI & lag pangkalan data (Hanya untuk grup/streaming ramai, bukan chat pribadi)
      // Jika antrean utama sudah memiliki pesan aktif pending (> 1), lewati penjawab langsung untuk pesan ini,
      // tapi pesan ini tetap akan dirangkum di latar belakang supaya Yui tahu konteksnya.
      if (this.queue.length > 0) {
        console.log(`[QUEUE_SAMPLING] Chat is busy (${freq.toFixed(1)}/15s). Filtering comment from: "${senderName}: ${input.substring(0, 30)}..." to prevent lag. Comment diverted to subconscious digest.`);

        // Row sudah tersimpan 'pending' — dispatcher background akan memprosesnya nanti.
        const feedbackText = (pendingId ? '' : '[QUEUE_WARN] Persistence failed; ') +
          '[SYSTEM MESSAGE]: Aliran obrolan sedang sangat deras! 🌪️ Pesan dari @' + senderName +
          ' dan penonton lainnya dialihkan sementara ke antrean subkesadaran batin Yui. Yui sedang merekam topik-topik kalian dan akan merespons dalam bentuk RANGKUMAN KOLEKTIF sebentar lagi! 🌸';

        // Only output notifier once every 20 seconds to prevent flooding/spamming the timeline
        const nowTime = Date.now();
        if (nowTime - this.lastHighFreqNotifyTime > 20000) {
          this.lastHighFreqNotifyTime = nowTime;
          onReply(feedbackText);
        } else {
          onReply(""); // Silent queueing to preserve chat view space cleanly
        }
        return;
      }
    }

    if (isDuplicate) {
      console.log(`[QUEUE_DEDUP] Duplicate message detected from ${senderName} (${contextId}). Skipping.`);
      if (pendingId) {
        try { this.stmtMarkCompleted.run(pendingId); } catch (e) {}
      }
      onReply("");
      return;
    }

    // MODE SEPI atau Pesan Terpilih (Sampled): Masukkan ke antrean kognisi aktif untuk dijawab penuh
    if (pendingId) {
      try { this.stmtMarkProcessing.run(Date.now(), pendingId); } catch (e) {}
    }
    this.queue.push({
      input,
      senderName,
      contextId,
      chatType,
      timestamp,
      onReply,
      onError,
      pendingId,
      ...(source || {})
    });

    this.processNext();
  }

  private cleanTimestamps() {
    const cutoff = Date.now() - 15000; // Jendela sliding 15 detik
    this.msgTimestamps = this.msgTimestamps.filter(t => t > cutoff);
  }

  public getChatFrequency(): number {
    this.cleanTimestamps();
    return this.msgTimestamps.length;
  }

  private startPendingScheduler() {
    console.log(`[QUEUE] Pending message background scheduler synchronized (30s intervals). Max parallel workers: ${this.maxBgWorkers}.`);
    setInterval(() => {
      this.dispatchPendingMessages().catch(err => {
        console.error("[QUEUE_PENDING_ERR] Error in background dispatch:", err);
      });
    }, 30000);
  }

  public async dispatchPendingMessages() {
    if (!this.db) return;

    try {
      // Crash-recovery: reclaim row yang nyangkut di 'processing' lebih lama dari TTL
      // (daemon mati mendadak di tengah pipeline). Ditandai 'pending' agar diproses ulang.
      try {
        const reclaimed = this.stmtReclaimStuck.run(Date.now() - MultiChannelQueue.PROCESSING_RECLAIM_TTL_MS).changes;
        if (reclaimed > 0) {
          console.log(`[QUEUE_RECOVERY] Reclaimed ${reclaimed} stuck 'processing' row(s); re-dispatching.`);
        }
      } catch (reclaimErr: any) {
        console.warn("[QUEUE_RECOVERY] Stuck-row reclaim failed (non-fatal):", reclaimErr?.message || reclaimErr);
      }

      // Ambil seluruh pesan pending yang belum mencapai percobaan maksimum
      const maxToFetch = this.maxBgWorkers * 3;
      const pendingRows: any[] = this.stmtSelectPendingRows.all(maxToFetch);

      if (!pendingRows || pendingRows.length === 0) {
        return;
      }

      console.log(`[QUEUE_BG_SCHEDULER] Scanning database. Found ${pendingRows.length} pending message(s). Routing to Yui's subconscious parallel circuits (Active: ${this.activeBgWorkers}/${this.maxBgWorkers})...`);

      for (const row of pendingRows) {
        // Jika pekerja penuh, hentikan pemicuan tugas baru untuk iterasi ini
        if (this.activeBgWorkers >= this.maxBgWorkers) {
          break;
        }

        // Hindari memproses pesan yang sedang aktif berjalan di pekerja lain
        if (this.runningBgMsgIds.has(row.id)) {
          continue;
        }

        // Luncurkan pemrosesan asinkron mandiri (non-blocking) untuk worker ini
        this.processBackgroundMessage(row).catch(err => {
          console.error(`[QUEUE_BG_CRITICAL_ERR] Failed cognitively processing parallel message ${row.id}:`, err);
        });
      }
    } catch (e) {
      console.error("[QUEUE_BG_SCHEDULER_ERR] Failed to run database pending queue scan:", e);
    }
  }

  /**
   * Pembuat Pekerja Latar Belakang Mandiri (Independent Concurrent Background Worker)
   * Memproses pesan secara asinkron tanpa mengunci (processing = true) antrean utama live streamer
   */
  private async processBackgroundMessage(pending: any) {
    this.activeBgWorkers++;
    this.runningBgMsgIds.add(pending.id);

    // Crash-recovery: tandai 'processing' (dengan started_at) saat mulai diproses
    try {
      this.stmtMarkProcessing.run(Date.now(), pending.id);
    } catch (e) {}

    // Anti-duplikat: kalau update_id Telegram row ini sudah tercatat TERKIRIM (crash terjadi
    // sesudah send sukses tapi sebelum mark completed), jangan diproses ulang — cukup selesaikan.
    if (pending.update_id) {
      try {
        const alreadyDelivered = this.db.prepare("SELECT 1 FROM telegram_update_ids WHERE update_id = ?").get(pending.update_id);
        if (alreadyDelivered) {
          console.log(`[QUEUE_RECOVERY] Row ${pending.id} (update_id ${pending.update_id}) already delivered before crash. Marking completed without re-processing.`);
          this.stmtMarkCompleted.run(pending.id);
          this.runningBgMsgIds.delete(pending.id);
          this.activeBgWorkers = Math.max(0, this.activeBgWorkers - 1);
          return;
        }
      } catch (dedupCheckErr) {
        console.warn(`[QUEUE_RECOVERY] Update-dedup check failed (non-fatal):`, dedupCheckErr?.message || dedupCheckErr);
      }
    }

    console.log(`[QUEUE_BG_WORKER_START] Starting parallel cognitive processing (${this.activeBgWorkers}/${this.maxBgWorkers}) for ${pending.sender_name} (${pending.chat_type}) [ID: ${pending.id}]`);

    try {
      // 2. Kirim ke nalar kognitif batin Yui (NeuralInterface), dengan hard timeout
      console.log(`[QUEUE_BG_WORKER_THINK] [ID: ${pending.id}] Yui is pondering response for ${pending.sender_name}...`);
      const reply = await withHardTimeout(
        NeuralInterface.processNeuralInput(pending.input, pending.sender_name, pending.context_id, pending.chat_type),
        MultiChannelQueue.NEURAL_PIPELINE_TIMEOUT_MS,
        `[ID: ${pending.id}] Background cognitive pipeline`
      );

       if (reply && reply.trim()) {
         // Output dedup: skip if the same message was delivered within the dedup window
         const now = Date.now();
         this.recentOutputHashes = this.recentOutputHashes.filter(h => now - h.timestamp < MultiChannelQueue.OUTPUT_DEDUP_WINDOW_MS);
         const isDuplicateOutput = this.recentOutputHashes.some(h => h.hash === reply);
         if (isDuplicateOutput) {
           console.log(`[QUEUE_DEDUP_OUTPUT] Duplicate background output for ${pending.sender_name}, skipping delivery.`);
         } else {
           this.recentOutputHashes.push({ hash: reply, timestamp: now });
           console.log(`[QUEUE_BG_WORKER_SUCCESS] [ID: ${pending.id}] Thinking complete! Delivering reply to target platform...`);

            // 3. Distribusikan balasan ke platform masing-masing
            const dedup = GlobalOutputDeduplicator.getInstance();
            if (pending.context_id.startsWith("tg_")) {
              const chatId = pending.chat_id || pending.context_id.split("|")[0].replace("tg_", "");
              try {
                if (dedup.isDuplicate(reply, pending.context_id)) {
                  console.log(`[GLOBAL_DEDUP] Skipping duplicate Telegram reply for ${pending.sender_name} (${pending.context_id}).`);
                } else {
                  dedup.markSent(reply, pending.context_id);
                  const activeTelegramBot = (globalThis as any).activeTelegramBot;
                  if (activeTelegramBot) {
                     const delayedReply = reply;
                     const sendOpts: any = {};
                     if (pending.source_message_id) {
                       sendOpts.reply_to_message_id = pending.source_message_id;
                     }
                      await Promise.race([
                        activeTelegramBot.telegram.sendMessage(chatId, delayedReply, Object.keys(sendOpts).length > 0 ? sendOpts : undefined),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('[TELEGRAM_BG_SEND_TIMEOUT] sendMessage timed out')), 15000))
                      ]);
                     console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Successfully sent reply to Telegram Chat ID: ${chatId}`);
                  } else {
                    console.warn(`[QUEUE_BG_WORKER_WARN] [ID: ${pending.id}] Telegram Bot offline when reply ready. Cognitive memory remains saved in database.`);
                  }
                }

                 // Broadcast the delayed telegram response to connected web UIs
                  try {
                    broadcastToWS({
                     type: "remote_response_sent",
                     data: {
                       reply: reply,
                       channel: pending.chat_type,
                       contextId: pending.context_id
                     }
                   });
                 } catch (e) {}
              } catch (tgErr: any) {
                console.error(`[QUEUE_BG_WORKER_ERR] [ID: ${pending.id}] Failed to send Telegram response:`, tgErr.message || tgErr);
              }
            } else if (pending.context_id.startsWith("dc_")) {
             const channelId = pending.context_id.replace("dc_", "");
              try {
                if (dedup.isDuplicate(reply, pending.context_id)) {
                  console.log(`[GLOBAL_DEDUP] Skipping duplicate Discord reply for ${pending.sender_name} (${pending.context_id}).`);
                } else {
                  dedup.markSent(reply, pending.context_id);
                  if (activeDiscordClient) {
                    const channel = await activeDiscordClient.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                      const delayedReply = reply;
                      await (channel as any).send(delayedReply);
                      console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Successfully sent reply to Discord Channel ID: ${channelId}`);
                    }
                  } else {
                    console.warn(`[QUEUE_BG_WORKER_WARN] [ID: ${pending.id}] Discord Bot offline when reply ready. Cognitive memory remains saved in database.`);
                  }
                }

                // Broadcast the delayed discord response to connected web UIs
                try {
                  broadcastToWS({
                   type: "remote_response_sent",
                   data: {
                     reply: reply,
                     channel: pending.chat_type,
                     contextId: pending.context_id
                   }
                 });
               } catch (e) {}
             } catch (dcErr: any) {
               console.error(`[QUEUE_BG_WORKER_ERR] [ID: ${pending.id}] Failed to send Discord response:`, dcErr.message || dcErr);
             }
           } else {
             if (dedup.isDuplicate(reply, pending.context_id)) {
               console.log(`[GLOBAL_DEDUP] Skipping duplicate local output for ${pending.sender_name} (${pending.context_id}).`);
             } else {
               dedup.markSent(reply, pending.context_id);
               eventBus.emit('OUTPUT_EMITTED', {
                 response: reply,
                 isInternal: true
               });
                console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Successfully emitted local response signal via Event Bus.`);
              }
            }

            // Crash-recovery: row hanya ditandai selesai setelah delivery sukses.
            try { this.stmtMarkCompleted.run(pending.id); } catch (e) {}
          }
        } else {
         throw new Error("Tanggapan dari saraf kognitif kosong atau gagal dirumuskan");
      }
    } catch (err: any) {
      console.error(`[QUEUE_BG_WORKER_FAIL] Attempt failed for [ID: ${pending.id}]:`, err.message || err);
      const attempts = (pending.attempts || 0) + 1;
      const isNeuralGatewayMissing = err.message && err.message.includes('Neural Gateway is missing');
      const maxRetries = 5;
      if (isNeuralGatewayMissing || attempts >= maxRetries) {
        try {
          await withSqliteRetry(`update-failed-${pending.id}`, this.db, () => {
            this.stmtUpdatePendingFailed.run(attempts, pending.id);
          });
          console.warn(`[QUEUE_BG_WORKER_FAILED] [ID: ${pending.id}] ${isNeuralGatewayMissing ? 'Neural Gateway missing. Marked as failed.' : `Max retries (${maxRetries}) reached.`}`);
        } catch (dbErr: any) {
          console.error(`[QUEUE_BG_WORKER_DB_ERR] [ID: ${pending.id}] Failed to update status to failed:`, dbErr.message || dbErr);
        }
      } else {
        try {
          await withSqliteRetry(`update-retry-${pending.id}`, this.db, () => {
            this.stmtUpdatePendingRetry.run(attempts, pending.id);
          });
          console.warn(`[QUEUE_BG_WORKER_RETRY] [ID: ${pending.id}] Attempt ${attempts}/${maxRetries}. Will retry.`, err.message || err);
        } catch (dbErr: any) {
          console.error(`[QUEUE_BG_WORKER_DB_ERR] [ID: ${pending.id}] Failed to update retry status:`, dbErr.message || dbErr);
        }
      }
    } finally {
      // 4. Kurangi beban pekerja & bersihkan penanda aktif
      this.runningBgMsgIds.delete(pending.id);
      this.activeBgWorkers = Math.max(0, this.activeBgWorkers - 1);
      console.log(`[QUEUE_BG_WORKER_END] Worker freed (Active: ${this.activeBgWorkers}/${this.maxBgWorkers}). Finished processing [ID: ${pending.id}]`);

      // Picu secara berjenjang pemrosesan sisa barisan antrean
      setTimeout(() => {
        this.dispatchPendingMessages().catch(() => {});
      }, 500);
    }
  }

  /**
   * Jalankan pipeline kognitif dengan hard timeout + AbortController.
   * Saat timeout: abort sinyal LLM, kembali dengan fallback reply agar antrean
   * tidak pernah macet menunggu satu pesan selamanya.
   */
  private async thinkWithTimeout(input: string, senderName: string, contextId: string, chatType: string, taskId?: string): Promise<{ processed: NeuralReplyResult | null; timedOut: boolean }> {
    const controller = new AbortController();
    const timeoutMs = MultiChannelQueue.NEURAL_PIPELINE_TIMEOUT_MS;

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        console.warn(`[QUEUE_PIPELINE_TIMEOUT] Cognitive pipeline exceeded ${timeoutMs}ms for ${senderName}. Aborted to keep channel I/O flowing.`);
        resolve({ processed: { text: PIPELINE_TIMEOUT_FALLBACK }, timedOut: true });
      }, timeoutMs);

      NeuralInterface.processNeuralInputWithMeta(input, senderName, contextId, chatType, false, taskId, controller.signal)
        .then((result) => {
          clearTimeout(timer);
          resolve({ processed: result, timedOut: false });
        })
        .catch((err: any) => {
          clearTimeout(timer);
          if (controller.signal.aborted) {
            console.warn(`[QUEUE_PIPELINE_ABORTED] Pipeline aborted for ${senderName}: ${err?.message || err}`);
            resolve({ processed: { text: PIPELINE_TIMEOUT_FALLBACK }, timedOut: true });
          } else {
            reject(err);
          }
        });
    });
  }

  private async processNext() {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    this.processing = true;
    this.processingStartTime = Date.now();
    this.processingTimer = setTimeout(() => {
      if (this.processing) {
        console.warn(`[QUEUE_WATCHDOG] Cognitive processing stuck for ${Date.now() - this.processingStartTime}ms. Resetting processing flag to recover queue.`);
        this.processing = false;
        this.processingTimer = null;
        this.processNext();
      }
    }, MultiChannelQueue.PROCESSING_TIMEOUT_MS);

    const item = this.queue.shift()!;

    try {
      console.log(`[QUEUE_EXEC] Running cognitive processing for ${item.senderName} (${item.chatType})...`);
      
      // Jalankan proses berpikir neural Yui secara berurutan, dengan hard timeout
      // agar satu pesan yang macet tidak memblokir jalur pesan berikutnya.
      const { processed, timedOut } = await this.thinkWithTimeout(item.input, item.senderName, item.contextId, item.chatType);
      const reply = processed ? processed.text : null;
      const replyMeta: ReplyMeta | undefined = processed ? {
        mood: processed.mood,
        emotion: processed.emotion,
        sentiment: processed.sentiment,
      } : undefined;
      
       // Await delivery so Telegram/Discord send completes before the next queue item,
       // and so floating promise rejections from async onReply are not lost.
       if (timedOut) {
         console.warn(`[QUEUE_PIPELINE_TIMEOUT] Using fallback reply for ${item.senderName} (${item.chatType}).`);
       }
       if (reply && reply.trim()) {
          console.log(`[QUEUE_EXEC] Cognitive reply ready for ${item.senderName}. Dispatching to channel...`);
        } else {
          console.warn(`[QUEUE_EXEC] Empty cognitive reply for ${item.senderName} (${item.chatType}).`);
        }

       // Output dedup: skip if the same message was delivered within the dedup window
       const outputHash = reply ?? "";
       const now = Date.now();
       this.recentOutputHashes = this.recentOutputHashes.filter(h => now - h.timestamp < MultiChannelQueue.OUTPUT_DEDUP_WINDOW_MS);
       const isDuplicateOutput = this.recentOutputHashes.some(h => h.hash === outputHash);
       if (isDuplicateOutput) {
         console.log(`[QUEUE_DEDUP_OUTPUT] Duplicate output detected for ${item.senderName}, skipping delivery.`);
       } else {
         this.recentOutputHashes.push({ hash: outputHash, timestamp: now });
       }

        if (this.holdOutgoing) {
          console.log(`[QUEUE_HOLD] Holding outgoing reply to ${item.senderName}.`);
        } else if (!isDuplicateOutput) {
          const dedup = GlobalOutputDeduplicator.getInstance();
          if (dedup.isDuplicate(reply ?? "", item.contextId)) {
            console.log(`[GLOBAL_DEDUP] Skipping duplicate main queue output for ${item.senderName} (${item.contextId}).`);
            // Balasan sudah dikirim langsung (mis. via tool speak) sebelum pipeline selesai.
            // Tetap picu reaksi emosi pada pesan user via eventBus (didengarkan channel layer).
            try {
              eventBus.emit('TELEGRAM_REACTION', {
                contextId: item.contextId,
                mood: replyMeta?.mood,
                emotion: replyMeta?.emotion,
                sentiment: replyMeta?.sentiment
              });
            } catch (_) {}
          } else {
            dedup.markSent(reply ?? "", item.contextId);
            await Promise.resolve(item.onReply(reply ?? "", replyMeta)).catch((deliveryErr: any) => {
              console.error(`[QUEUE_DELIVERY_ERR] Failed to deliver reply to ${item.senderName}:`, deliveryErr?.message || deliveryErr);
              if (item.onError) item.onError(deliveryErr);
            });
          }
        }

        // Crash-recovery: row baru dianggap selesai SETELAH delivery sukses. Kalau daemon mati
        // di tengah pipeline (row masih 'processing'), saat restart akan di-claim ulang oleh TTL.
        if (item.pendingId && this.db) {
          try { this.stmtMarkCompleted.run(item.pendingId); } catch (e) {}
        }

    } catch (err: any) {
      console.error(`[QUEUE_ERROR] Failed to process message in cognitive queue:`, err);
      const attempts = (item.attempts || 0) + 1;
      item.attempts = attempts;
      const maxRetries = 3;
      const isNeuralGatewayMissing = err.message && err.message.includes('Neural Gateway is missing');
      if (!isNeuralGatewayMissing && attempts < maxRetries) {
        const delay = 1000 * attempts;
        console.warn(`[QUEUE_RETRY] Retrying message from ${item.senderName} (${item.chatType}) - Attempt ${attempts}/${maxRetries} in ${delay}ms...`);
        setTimeout(() => {
          this.queue.unshift(item);
          this.processNext();
        }, delay);
      } else {
          console.error(`[QUEUE_MAX_RETRY_EXCEEDED] Retry limit exceeded (${maxRetries}) for ${item.senderName}. Marking as failed in pending queue.`);

          if (this.db) {
            try {
              await withSqliteRetry(`update-failed-${item.pendingId || Date.now()}`, this.db, () => {
                if (item.pendingId) {
                  this.stmtUpdatePendingFailed.run(maxRetries, item.pendingId);
                } else {
                  const id = "pending_" + genId(9);
                  const stmt = this.stmtInsertPendingFailed;
                  stmt.run(id, item.input, item.senderName, item.contextId, item.chatType, item.timestamp, maxRetries);
                }
                if (!this.holdOutgoing) {
                  item.onReply("Maaf, pesan Anda gagal diproses setelah beberapa percobaan. Silakan coba lagi nanti.");
                }
              });
            } catch (dbErr) {
              console.error("[QUEUE_DB_ERROR] Failed to save failed message to database:", dbErr);
              if (item.onError) item.onError(err);
            }
          } else {
            if (item.onError) item.onError(err);
          }
        }
     } finally {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer);
        this.processingTimer = null;
      }
      this.processing = false;
      this.processingStartTime = 0;
      // Stagger jeda tipis antarrespons agar tarian avatar & tts berjalan mulus berurutan tanpa penumpukan
      setTimeout(() => this.processNext(), 1200);
    }
  }

  /**
   * Menginisiasi Mesin Impuls Otonom Proaktif (Proactive Impulse Engine)
   */
  private startProactiveImpulseEngine() {
    console.log("[PROACTIVE_ENGINE] Starting server chat activity monitoring (30s interval)...");
    setInterval(async () => {
      try {
        await this.evaluateProactiveImpulse();
      } catch (err) {
        console.error("[PROACTIVE_ENGINE_ERR] Failed to execute autonomous impulse check:", err);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Mengevaluasi keheningan obrolan dan meluncurkan chat iseng spontan dari Yuihime
   */
  private async evaluateProactiveImpulse() {
    if (!this.db || this.isProactiveRunning) return;

    const now = Date.now();
    
    // Ambil pengaturan dinamis untuk threshold idle. Default: 10800 detik (3 jam).
    let enableSpontaneousSpam = false;
    let proactiveIdleTimeout = 10800;
    let proactiveChance = 0.10; // Kesempatan 10% jika idle untuk trigger organic
    let cooldownInterval = 1800; // 30 menit
    let longingGrowthRate = 0.5;

    try {
       const settings = Kernel.getInstance().getSettings()?.getAll() || {};
      const spConfig = settings['spontaneous-proactive'] || settings.agent || {};
      const volitionConfig = settings['proactive-volition'] || {};
      
      if (spConfig.enableSpontaneousSpam !== undefined) {
        enableSpontaneousSpam = !!spConfig.enableSpontaneousSpam;
      }
      if (spConfig.idleDurationThreshold !== undefined) {
        proactiveIdleTimeout = Number(spConfig.idleDurationThreshold);
      } else if (spConfig.proactiveIdleTimeout !== undefined) {
        proactiveIdleTimeout = Number(spConfig.proactiveIdleTimeout);
      }
      
      if (spConfig.probabilisticTriggerChance !== undefined) {
        proactiveChance = Number(spConfig.probabilisticTriggerChance);
      } else if (spConfig.proactiveChance !== undefined) {
        proactiveChance = Number(spConfig.proactiveChance);
      }

      if (spConfig.cooldownInterval !== undefined) {
        cooldownInterval = Number(spConfig.cooldownInterval);
      }

      // Satu sumber kebenaran untuk laju kerinduan: proactive-volition
      // (fallback ke kunci lama spontaneous-proactive demi kompatibilitas).
      const rateSource = volitionConfig.longingGrowthRate !== undefined ? volitionConfig : spConfig;
      if (rateSource.longingGrowthRate !== undefined) {
        longingGrowthRate = Number(rateSource.longingGrowthRate);
      }
    } catch (settingsError) {}

    if (!enableSpontaneousSpam) {
      return;
    }

    try {
      this.isProactiveRunning = true;

      // Single-shot per idle session: if already locked, skip
      const proactiveState = this.stmtSelectProactiveState.get() as any;
      if (proactiveState?.proactiveLocked) {
        this.isProactiveRunning = false;
        return;
      }

      // Cari obrolan non-agent terakhir untuk menentukan target / channel aktif
      const lastInteraction = this.stmtSelectLastInteraction.get();

      if (!lastInteraction) {
        this.isProactiveRunning = false;
        return;
      }

      const contextId = lastInteraction.context || 'web_default';

      // Advanced Anti-Flood Logic: If we've already sent a proactive message since the last user message, prevent doing it again recursively.
      const hasSentProactive = this.stmtSelectProactiveSent.get(contextId, lastInteraction.timestamp);

      if (hasSentProactive) {
        this.isProactiveRunning = false;
        return;
      }

      const idleSeconds = (now - lastInteraction.timestamp) / 1000;

      // Hitung kesepian real-time batiniah
      const idleMinutes = idleSeconds / 60;
      let estimatedLoneliness = Math.min(100, Math.round(idleMinutes * longingGrowthRate * 12));
      estimatedLoneliness = Math.min(100, Math.max(5, estimatedLoneliness));

      // Ambil status, kaitan relasi, dan mood untuk sinkronisasi
      const stateRow = this.stmtSelectAgentState.get();
      const status = stateRow?.status || 'idle';
      const relation = stateRow?.relation ? JSON.parse(stateRow.relation) : {};
      const moodState = stateRow?.mood ? JSON.parse(stateRow.mood) : {};

      const playfulness = moodState?.playfulness || 50;
      const affection = relation?.affection !== undefined ? relation.affection : 60;
      
      let calculatedLoneliness = Math.round((estimatedLoneliness * 0.7) + (playfulness * 0.15) + (affection * 0.15));
      calculatedLoneliness = Math.min(100, Math.max(5, calculatedLoneliness));

      // Persist the loneliness back into the database agent_state so that the UI can sync or reflect it in real-time
      try {
        moodState.loneliness = calculatedLoneliness;
        this.stmtUpdateAgentMood.run(JSON.stringify(moodState));
      } catch (dbErr) {
        console.error("[PROACTIVE_ENGINE_DB] Failed to synchronize loneliness status to DB:", dbErr);
      }

      // Jangan meletup jika status Yuihime sedang tidur (sleeping)
      if (status === 'sleeping') {
        this.isProactiveRunning = false;
        return;
      }

      // Dinamisasi waktu Cooldown dan Probabilitas Pemicu Berdasarkan Loneliness (makin kangen makin sering & berani memicu)
      if (calculatedLoneliness > 45) {
        const structuralLonelinessBoost = calculatedLoneliness / 45;
        proactiveChance = Math.min(0.45, proactiveChance * structuralLonelinessBoost);
        
        // Cooldown dipotong s/d 50% jika kesepian luar biasa tinggi (sangat kangen)
        const reductionFactor = Math.max(0.5, 1 - (calculatedLoneliness - 45) / 110);
        cooldownInterval = cooldownInterval * reductionFactor;
      }

      const cooldownMs = cooldownInterval * 1000;
      if (now - this.lastProactiveTime < cooldownMs) {
        this.isProactiveRunning = false;
        return;
      }

      // Jika terlampaui waktu hening (idleSeconds >= proactiveIdleTimeout)
      if (idleSeconds >= proactiveIdleTimeout) {
        // Tentukan kelayakan probabilistik (chance)
        if (Math.random() <= proactiveChance) {
          this.lastProactiveTime = now; // catat cooldown
          
          console.log(`[PROACTIVE_ENGINE] User detected idle for ${Math.round(idleSeconds)}s (Loneliness: ${calculatedLoneliness}%). Yui feels playful & wants to say hello!`);

          // Tentukan tindakan/impulse fisik berdasarkan tingkat kasih sayang/relasi (affection level)
          let affectionLevel = Number(relation?.affection !== undefined ? relation.affection : 60);
          let impulses: string[] = [];

          if (affectionLevel >= 75) {
            impulses = [
            ];
          } else if (affectionLevel >= 35) {
            impulses = [
            ];
          } else {
            impulses = [
            ];
          }

          const chosenImpulse = impulses[Math.floor(Math.random() * impulses.length)];
          const senderName = lastInteraction.speaker || 'user';
          const chatType = lastInteraction.chat_type || 'web';

          console.log(`[PROACTIVE_ENGINE] Launching impulse: "${chosenImpulse}" to ${senderName} [${chatType}:${contextId}]`);

          // Ambil riwayat chat nyata terakhir guna penataan memori murni / anti-halusinasi (Memory Resonance)
          let recentContext = "Tidak ada obrolan terdahulu.";
          try {
            const recentMessages = this.stmtSelectRecentMessages.all() as any[];

            if (recentMessages && recentMessages.length > 0) {
              recentContext = recentMessages.reverse().map(m => `${m.speaker || "user"}: ${m.content}`).join('\n');
            }
          } catch (dbReadErr) {
            console.error("[PROACTIVE_ENGINE_DB_READ] Failed to read recent memory:", dbReadErr);
          }

          // Goal-driven proactive push (Stage G.3): jika ada goal fokus aktif,
          // arahkan pesan spontan untuk mendorong kemajuan goal.
          let goalProactivePrompt: string | null = null;
          try {
            const focusGoal = getFocusGoal();
            if (focusGoal) {
              const subgoals = getGoalChildren(focusGoal.id);
              const subLines = subgoals.length > 0
                ? subgoals.map(c => `- ${c.status === 'completed' ? '[x]' : '[ ]'} ${c.title}`).join('\n')
                : '- (belum ada sub-goal)';
              goalProactivePrompt = `[AUTONOMOUS_GOAL_PUSH]: User (${senderName}) sedang idle selama ${Math.round(idleSeconds)} detik. Ada goal aktifmu: "${focusGoal.title}" (${Math.round((focusGoal.progress || 0) * 100)}%). Dorong kemajuan goal ini secara natural dalam pesan singkat, manis, dan sesuai kepribadianmu. JANGAN memaksa atau berhalusinasi (jangan pura-pura melakukan hal yang tidak terjadi).

Sub-goal saat ini:
${subLines}

Berikut adalah sejarah obrolan nyata dari ingatan kalian:
=== SEJARAH MEMORI CHAT NYATA TERAKHIR ===
${recentContext}
==========================================

Buka obrolan santai yang menyinggung goal ini dengan tulus, lalu lanjutkan natural!`;
              console.log(`[PROACTIVE_ENGINE_GOAL] Mengarahkan impulse ke goal: "${focusGoal.title}"`);
            }
          } catch (goalErr) {
            console.warn("[PROACTIVE_ENGINE_GOAL_ERR] Goal push skipped:", goalErr?.message || goalErr);
          }

          // Format explicit prompting detailing Yui's subjective longing impulse so the LLM understands it is an internal urge
          const formattedImpulsePrompt = goalProactivePrompt || `[AUTONOMOUS_IMPULSE]: user (${senderName}) sudah diam/sibuk selama ${Math.round(idleSeconds)} detik. Batinmu merasa sangat kangen (Loneliness: ${calculatedLoneliness}%) dan tergerak untuk melakukan tindakan spontan: "${chosenImpulse}".
Sapa user secara manis, manja, jahil, atau tsundere sesuai kepribadianmu.
DILARANG KERAS membuat skenario fiktif/halusinasi baru (jangan pura-pura baru bangun, baru tidur, atau berada di lokasi fiktif).

Berikut adalah sejarah obrolan nyata dari ingatan kalian:
=== SEJARAH MEMORI CHAT NYATA TERAKHIR ===
${recentContext}
==========================================

Unggkit topik nyata tersebut dari memori jika ingin, sapa dia dengan manis, atau nyatakan kerinduanmu secara tulus tanpa terkesan kaku!`;

          // Hasilkan respons emosional nyata melalui NeuralInterface dengan isProactive = true
          const reply = await NeuralInterface.processNeuralInput(
            formattedImpulsePrompt,
            senderName,
            contextId,
            chatType,
            true // isProactive set to true
          );

          if (reply && reply.trim()) {
            console.log(`[PROACTIVE_ENGINE] Yui's surprise message: "${reply}"`);

            // 1. Broadcast ke Web client (Subtitle, Live Overlay & Logs)
            const replyPayload = {
              type: "state_update",
              data: {
                state: { status: "talking" },
                activeSubtitle: reply,
                typedSubtitle: reply,
                isSubtitleTyping: false,
                animations: ["TALK", "SMILE"]
              }
            };

            const logPayload = {
              type: "remote_response_sent",
              data: {
                reply: reply,
                channel: chatType.toLowerCase().includes("telegram") ? "Telegram" : (chatType.toLowerCase().includes("discord") ? "Discord" : "Live Chat")
              }
            };

             try {
               broadcastToWS(replyPayload);
              broadcastToWS(logPayload);
            } catch (wsErr) {
              console.error("[PROACTIVE_ENGINE_WS] Failed to send WS broadcast:", wsErr);
            }

              // Output dedup: skip if the same message was delivered within the dedup window
              const dedupNow = Date.now();
              this.recentOutputHashes = this.recentOutputHashes.filter(h => dedupNow - h.timestamp < MultiChannelQueue.OUTPUT_DEDUP_WINDOW_MS);
              const isDuplicateOutput = this.recentOutputHashes.some(h => h.hash === reply);
              if (!isDuplicateOutput) {
                this.recentOutputHashes.push({ hash: reply, timestamp: dedupNow });

                const globalDedup = GlobalOutputDeduplicator.getInstance();
                if (globalDedup.isDuplicate(reply, contextId)) {
                  console.log(`[GLOBAL_DEDUP] Skipping duplicate proactive output for ${senderName} (${contextId}).`);
                } else {
                  globalDedup.markSent(reply, contextId);

                  // 2. Dispatch ke Bot Telegram jika asalnya dari Telegram
                  if (contextId.startsWith("tg_")) {
                    const chatId = contextId.split("|")[0].replace("tg_", "");
                    try {
                       if (activeTelegramBot) {
                         await Promise.race([
                           activeTelegramBot.telegram.sendMessage(chatId, reply),
                           new Promise((_, reject) => setTimeout(() => reject(new Error('[TELEGRAM_BG_SEND_TIMEOUT] sendMessage timed out')), 15000))
                         ]);
                         console.log(`[PROACTIVE_ENGINE_TELEGRAM] Successfully sent proactive message to Telegram Chat: ${chatId}`);
                      }
                    } catch (tgErr: any) {
                      console.error("[PROACTIVE_ENGINE_TELEGRAM_ERR] Failed to send to Telegram:", tgErr.message);
                    }
                  }

                   // 3. Dispatch ke Discord jika asalnya dari Discord
                   if (contextId.startsWith("discord_")) {
                     const channelId = contextId.split("|")[0].replace("discord_", "");
                     try {
                       if (activeDiscordClient) {
                         const channel = await activeDiscordClient.channels.fetch(channelId);
                         if (channel && typeof (channel as any).send === 'function') {
                           await (channel as any).send(reply);
                           console.log(`[PROACTIVE_ENGINE_DISCORD] Successfully sent proactive message to Discord Channel: ${channelId}`);
                         }
                       }
                     } catch (dcErr: any) {
                       console.error("[PROACTIVE_ENGINE_DISCORD_ERR] Failed to send to Discord:", dcErr.message);
                     }
                   }
                }
              }

              // Lock proactive for this idle session after successful send
              try {
                this.stmtUpdateProactiveLock.run(dedupNow);
              } catch (lockErr) {
                console.error("[PROACTIVE_ENGINE_LOCK_ERR] Failed to lock proactive state:", lockErr);
              }
            }
        }
      }
    } catch (e: any) {
      console.error("[PROACTIVE_ENGINE_PROCESS_ERR] Error processing proactive impulse:", e.message);
    } finally {
      this.isProactiveRunning = false;
    }
  }

  private startSuspendedTasksScheduler() {
    console.log("[QUEUE] Suspended tasks background scheduler synchronized (15s intervals).");
    setInterval(async () => {
      try {
        await this.checkAndResumeSuspendedTasks();
      } catch (err: any) {
        console.error("[QUEUE_SUSPENDED_RESUME_ERR] Error in background task resumption:", err?.message || err);
      }
    }, 15000); // Check every 15 seconds
  }

  public async checkAndResumeSuspendedTasks() {
    if (this.processing || this.activeBgWorkers > 0) return;
    
    // Check if system state is IDLE
     try {
       const status = stateMachine.getStatus() || 'IDLE';
      if (status.toUpperCase() !== 'IDLE') {
        return;
      }
    } catch (e) {}

    const suspendedTasks = CognitiveScheduler.getSuspendedTasks();
    if (suspendedTasks.length === 0) return;

    // Grab the first suspended task to resume
    const task = suspendedTasks[0];
    console.log(`[QUEUE_RESUME] Found suspended task ${task.taskId}. Resuming task in background...`);

    this.processing = true;
    this.processingStartTime = Date.now();
    this.processingTimer = setTimeout(() => {
      if (this.processing) {
        console.warn(`[QUEUE_WATCHDOG] Suspended-task resume stuck for ${Date.now() - this.processingStartTime}ms. Resetting processing flag to recover queue.`);
        this.processing = false;
        this.processingTimer = null;
      }
    }, MultiChannelQueue.PROCESSING_TIMEOUT_MS);

    try {
      const reply = await withHardTimeout(
        NeuralInterface.processNeuralInput(
          task.originalPrompt,
          task.userName || 'user',
          task.contextId || 'web_default',
          task.chatType || 'web',
          false, // isProactive
          task.taskId // Pass the taskId to trigger resume!
        ),
        MultiChannelQueue.NEURAL_PIPELINE_TIMEOUT_MS,
        `[QUEUE_RESUME] Task ${task.taskId}`
      );

        if (reply && reply.trim()) {
          // Output dedup: skip if the same message was delivered within the dedup window
          const dedupNow = Date.now();
          this.recentOutputHashes = this.recentOutputHashes.filter(h => dedupNow - h.timestamp < MultiChannelQueue.OUTPUT_DEDUP_WINDOW_MS);
          const isDuplicateOutput = this.recentOutputHashes.some(h => h.hash === reply);
          if (isDuplicateOutput) {
            console.log(`[QUEUE_DEDUP_OUTPUT] Duplicate resumed output for task ${task.taskId}, skipping delivery.`);
          } else {
            this.recentOutputHashes.push({ hash: reply, timestamp: dedupNow });
            console.log(`[QUEUE_RESUME_SUCCESS] [TaskID: ${task.taskId}] Task resumed and completed. Reply: ${reply}`);
            
            // Mark as completed
            CognitiveScheduler.completeTask(task.taskId);

            // Dispatch the reply to the original channel!
            const contextId = task.contextId || 'web_default';
            const chatType = task.chatType || 'web';
            const globalDedup = GlobalOutputDeduplicator.getInstance();

            if (contextId.startsWith("tg_")) {
              const chatId = contextId.split("|")[0].replace("tg_", "");
              try {
                if (globalDedup.isDuplicate(reply, contextId)) {
                  console.log(`[GLOBAL_DEDUP] Skipping duplicate resumed Telegram reply for task ${task.taskId}.`);
                } else {
                  globalDedup.markSent(reply, contextId);
                  const activeTelegramBot = (globalThis as any).activeTelegramBot;
                  if (activeTelegramBot) {
                    await Promise.race([
                      activeTelegramBot.telegram.sendMessage(chatId, reply),
                      new Promise((_, reject) => setTimeout(() => reject(new Error('[TELEGRAM_BG_SEND_TIMEOUT] sendMessage timed out')), 15000))
                    ]);
                    console.log(`[QUEUE_RESUME_SEND] Sent Telegram message to chat ${chatId}`);
                  }
                }
              } catch (tgErr: any) {
                console.error(`[QUEUE_RESUME_ERR] Failed to send Telegram message:`, tgErr.message);
              }
            } else if (contextId.startsWith("discord_")) {
              const channelId = contextId.split("|")[0].replace("discord_", "");
              try {
                if (globalDedup.isDuplicate(reply, contextId)) {
                  console.log(`[GLOBAL_DEDUP] Skipping duplicate resumed Discord reply for task ${task.taskId}.`);
                } else {
                  globalDedup.markSent(reply, contextId);
                  if (activeDiscordClient) {
                    const channel = await activeDiscordClient.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                      await (channel as any).send(reply);
                      console.log(`[QUEUE_RESUME_SEND] Sent Discord message to channel ${channelId}`);
                    }
                  }
                }
              } catch (dcErr: any) {
                console.error(`[QUEUE_RESUME_ERR] Failed to send Discord message:`, dcErr.message);
              }
            } else {
              if (globalDedup.isDuplicate(reply, contextId)) {
                console.log(`[GLOBAL_DEDUP] Skipping duplicate resumed local output for task ${task.taskId}.`);
              } else {
                globalDedup.markSent(reply, contextId);
                eventBus.emit('OUTPUT_EMITTED', { response: reply });
              }
            }

            // Broadcast to Web socket/SSE
            try {
              broadcastToWS({
                type: "state_update",
                data: {
                  state: { status: "talking" },
                  activeSubtitle: reply,
                  typedSubtitle: reply,
                  isSubtitleTyping: false,
                  animations: ["TALK", "SMILE"]
                }
              });
              broadcastToWS({
                type: "remote_response_sent",
                data: {
                  reply: reply,
                  channel: chatType,
                  contextId
                }
              });
            } catch (wsErr) {}
          }
        }
    } catch (err: any) {
      console.error(`[QUEUE_RESUME_FAIL] Failed to process resumed task ${task.taskId}:`, err.message || err);
    } finally {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer);
        this.processingTimer = null;
      }
      this.processing = false;
    }
  }
}
