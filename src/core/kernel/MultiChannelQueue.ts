import { NeuralInterface } from "./NeuralInterface.js";
import { Cortex } from "../cortex.js";
import { eventBus } from "@shared/core/kernel/event-bus";
import { CognitiveScheduler } from "./CognitiveScheduler.js";
import { PromptRegistry } from "../PromptRegistry.js";
import { SettingsManager } from "./settings.js";
import { broadcastToWS } from "../server/apiRouter.js";
import { activeDiscordClient } from "../server/discord.js";
import { activeTelegramBot } from "../server/telegram.js";
import { Kernel } from "../kernel/core.js";
import { stateMachine } from "./state-machine.js";

const DEFAULT_PENDING_FEEDBACK = `[SYSTEM MESSAGE]: Koneksi saraf batin Yuihime dengan kognisi LLM sedang sangat padat atau terputus sementara 📡. Tapi jangan khawatir! Pesanmu ("\${inputPreview}") sudah aman dalam antrean tunggu kognisi Yui. Yui akan membalas secara otomatis setelah tautan saraf sinkron kembali! 🌸`;

PromptRegistry.getInstance().register('multi-channel-queue:pending_feedback', DEFAULT_PENDING_FEEDBACK);

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
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  throw lastErr;
}

export interface QueueItem {
  input: string;
  senderName: string;
  contextId: string;
  chatType: string;
  timestamp: number;
  onReply: (reply: string) => void;
  onError?: (err: any) => void;
  attempts?: number;
}

export class MultiChannelQueue {
  private static instance: MultiChannelQueue | null = null;
  private queue: QueueItem[] = [];
  private processing = false;
  private db: any = null;
  private backgroundChatBuffer: { speaker: string; text: string; timestamp: number }[] = [];
  private msgTimestamps: number[] = []; // for frequency calculation
  private recentMsgHashes: { hash: string; timestamp: number }[] = [];
  private processingStartTime = 0;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly PROCESSING_TIMEOUT_MS = 30000;
  
  // Dynamic Background Worker Pool Configuration & Status Trackers
  private activeBgWorkers = 0;
  private maxBgWorkers = 2; // reduced from 4 to avoid SQLite busy contention
  private runningBgMsgIds = new Set<string>();

  // Proactive Impulse Engine Trackers
  private lastProactiveTime = Date.now();
  private isProactiveRunning = false;
  private lastHighFreqNotifyTime = 0;

  // Hold mechanism: pause incoming/outgoing message processing
  private holdMode = false;
  private holdOutgoing = false;
  private heldMessages: QueueItem[] = [];

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
   * Memproses semua pesan yang ditahan saat mode tahan dinonaktifkan.
   */
  private flushHeldMessages() {
    if (this.heldMessages.length === 0) return;
    console.log(`[QUEUE_HOLD] Flushing ${this.heldMessages.length} held message(s)...`);
    const messages = [...this.heldMessages];
    this.heldMessages = [];
    for (const msg of messages) {
      this.queue.push({
        input: msg.input,
        senderName: msg.senderName,
        contextId: msg.contextId,
        chatType: msg.chatType,
        timestamp: msg.timestamp,
        onReply: msg.onReply,
        onError: msg.onError
      });
    }
    this.processNext();
  }

  /**
   * Menambahkan pesan dari berbagai saluran (Telegram, Webhook, OBS Chat, dll) ke antrean terpadu.
   */
  public addMessage(
    input: string,
    senderName: string,
    contextId: string,
    chatType: string,
    onReply: (reply: string) => void,
    onError?: (err: any) => void
  ) {
    const timestamp = Date.now();
    this.msgTimestamps.push(timestamp);
    this.cleanTimestamps();

    // Reset proactive lock when user sends a new message
    if (this.db) {
      try {
        this.db.prepare("UPDATE agent_state SET proactiveLocked = 0 WHERE id = 1").run();
      } catch (e) {}
    }

    const freq = this.getChatFrequency();
    console.log(`[QUEUE] Message received from ${senderName} (${chatType}). Chat frequency: ${freq.toFixed(1)} msgs/15s.`);

    // 0. Deduplication guard: reject exact duplicate messages within 2s window (less aggressive, especially for private chats)
    const isPrivateChat = chatType === 'private';
    const dedupWindow = isPrivateChat ? 1500 : 3000;
    const dedupHash = `${input}|${senderName}|${contextId}`;
    const now = Date.now();
    this.recentMsgHashes = this.recentMsgHashes.filter(h => now - h.timestamp < dedupWindow);
    const isDuplicate = this.recentMsgHashes.some(h => h.hash === dedupHash);
    if (!isDuplicate) {
      this.recentMsgHashes.push({ hash: dedupHash, timestamp: now });
    }


    // Hold mode: store incoming messages without processing
    if (this.holdMode) {
      this.heldMessages.push({ input, senderName, contextId, chatType, timestamp, onReply, onError });
      console.log(`[QUEUE_HOLD] Incoming message from ${senderName} held (hold mode active).`);
      return;
    }
    // 1. Masukkan semua pesan (tanpa terkecuali) ke buffer ringkasan latar belakang agar Yui tetap memahami konteks penuh
    this.backgroundChatBuffer.push({ speaker: senderName, text: input, timestamp });
    this.checkAndTriggerBackgroundSummary();

    // 2. Evaluasi Antrean berdasarkan Kecepatan & Frekuensi Obrolan
    const threshold = 4; // Ambang batas pesan per 15 detik untuk mengaktifkan High-Frequency Sampling

    if (freq >= threshold && !isPrivateChat) {
      // MODE RAMAI: Lalukan sampling selektif untuk mencegah overload AI & lag pangkalan data (Hanya untuk grup/streaming ramai, bukan chat pribadi)
      // Jika antrean utama sudah memiliki pesan aktif pending (> 1), lewati penjawab langsung untuk pesan ini,
      // tapi pesan ini tetap akan dirangkum di latar belakang supaya Yui tahu konteksnya.
      if (this.queue.length > 0) {
        console.log(`[QUEUE_SAMPLING] Chat is busy (${freq.toFixed(1)}/15s). Filtering comment from: "${senderName}: ${input.substring(0, 30)}..." to prevent lag. Comment diverted to subconscious digest.`);
        
        let queued = false;
        if (this.db) {
          try {
            const pendingId = "pending_" + Math.random().toString(36).substring(2, 11);
            const stmt = this.db.prepare(`
              INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
              VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
            `);
            stmt.run(pendingId, input, senderName, contextId, chatType, timestamp);
            queued = true;
          } catch (dbErr) {
            console.error("[QUEUE_SAMPLING_DB_ERR] Failed to save sampled message to database:", dbErr);
          }
        }
        
        // Only output notifier once every 20 seconds to prevent flooding/spamming the timeline
        const nowTime = Date.now();
        if (nowTime - this.lastHighFreqNotifyTime > 20000) {
          this.lastHighFreqNotifyTime = nowTime;
          const feedbackText = queued
            ? `[SYSTEM MESSAGE]: Aliran obrolan sedang sangat deras! 🌪️ Pesan dari @${senderName} dan penonton lainnya dialihkan sementara ke antrean subkesadaran batin Yui. Yui sedang merekam topik-topik kalian dan akan merespons dalam bentuk RANGKUMAN KOLEKTIF sebentar lagi! 🌸`
            : `[SYSTEM MESSAGE]: Aliran obrolan sedang sangat padat! 📡 Pesanmu disalurkan ke subkesadaran batin Yui untuk dicerna bersama. Mohon tunggu sapaan rangkuman kolektif ya~ 🌸`;
          onReply(feedbackText);
        } else {
          onReply(""); // Silent queueing to preserve chat view space cleanly
        }
        return;
      }
    }

    if (isDuplicate) {
      console.log(`[QUEUE_DEDUP] Duplicate message detected from ${senderName} (${contextId}). Skipping.`);
      onReply("");
      return;
    }

    // MODE SEPI atau Pesan Terpilih (Sampled): Masukkan ke antrean kognisi aktif untuk dijawab penuh
    this.queue.push({
      input,
      senderName,
      contextId,
      chatType,
      timestamp,
      onReply,
      onError
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
      // Ambil seluruh pesan pending yang belum mencapai percobaan maksimum
      const maxToFetch = this.maxBgWorkers * 3;
      const pendingRows: any[] = this.db.prepare(`
        SELECT * FROM pending_messages 
        WHERE status = 'pending' AND attempts < 5 
        ORDER BY timestamp ASC LIMIT ?
      `).all(maxToFetch);

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

    console.log(`[QUEUE_BG_WORKER_START] Starting parallel cognitive processing (${this.activeBgWorkers}/${this.maxBgWorkers}) for ${pending.sender_name} (${pending.chat_type}) [ID: ${pending.id}]`);

    try {
      // 2. Kirim ke nalar kognitif batin Yui (NeuralInterface)
      console.log(`[QUEUE_BG_WORKER_THINK] [ID: ${pending.id}] Yui is pondering response for ${pending.sender_name}...`);
      const reply = await NeuralInterface.processNeuralInput(pending.input, pending.sender_name, pending.context_id, pending.chat_type);

      if (reply && reply.trim()) {
        console.log(`[QUEUE_BG_WORKER_SUCCESS] [ID: ${pending.id}] Thinking complete! Delivering reply to target platform...`);

        // 3. Distribusikan balasan ke platform masing-masing
        if (pending.context_id.startsWith("tg_")) {
          const chatId = pending.context_id.split("|")[0].replace("tg_", "");
          try {
            const activeTelegramBot = (globalThis as any).activeTelegramBot;
            if (activeTelegramBot) {
               const delayedReply = reply;
               await Promise.race([
                 activeTelegramBot.telegram.sendMessage(chatId, delayedReply),
                 new Promise((_, reject) => setTimeout(() => reject(new Error('[TELEGRAM_BG_SEND_TIMEOUT] sendMessage timed out')), 15000))
               ]);
               console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Successfully sent reply to Telegram Chat ID: ${chatId}`);

              // Broadcast the delayed telegram response to connected web UIs
               try {
                 broadcastToWS({
                  type: "remote_response_sent",
                  data: {
                    reply: delayedReply,
                    channel: pending.chat_type,
                    contextId: pending.context_id
                  }
                });
              } catch (e) {}
            } else {
              console.warn(`[QUEUE_BG_WORKER_WARN] [ID: ${pending.id}] Telegram Bot offline when reply ready. Cognitive memory remains saved in database.`);
            }
          } catch (tgErr: any) {
            console.error(`[QUEUE_BG_WORKER_ERR] [ID: ${pending.id}] Failed to send Telegram response:`, tgErr.message || tgErr);
          }
        } else if (pending.context_id.startsWith("dc_")) {
          const channelId = pending.context_id.replace("dc_", "");
           try {
             if (activeDiscordClient) {
               const channel = await activeDiscordClient.channels.fetch(channelId);
               if (channel && channel.isTextBased()) {
                 const delayedReply = reply;
                 await (channel as any).send(delayedReply);
                 console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Successfully sent reply to Discord Channel ID: ${channelId}`);

                // Broadcast the delayed discord response to connected web UIs
                 try {
                   broadcastToWS({
                    type: "remote_response_sent",
                    data: {
                      reply: delayedReply,
                      channel: pending.chat_type,
                      contextId: pending.context_id
                    }
                  });
                } catch (e) {}
              }
            } else {
              console.warn(`[QUEUE_BG_WORKER_WARN] [ID: ${pending.id}] Discord Bot offline when reply ready. Cognitive memory remains saved in database.`);
            }
          } catch (dcErr: any) {
            console.error(`[QUEUE_BG_WORKER_ERR] [ID: ${pending.id}] Failed to send Discord response:`, dcErr.message || dcErr);
          }
        } else {
          // Saluran Web / Local / OBS: pancarkan ke Event Bus
          eventBus.emit('OUTPUT_EMITTED', { 
            response: reply, 
            isInternal: true 
          });
          console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Successfully emitted local response signal via Event Bus.`);
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
            this.db.prepare("UPDATE pending_messages SET attempts = ?, status = 'failed' WHERE id = ?").run(attempts, pending.id);
          });
          console.warn(`[QUEUE_BG_WORKER_FAILED] [ID: ${pending.id}] ${isNeuralGatewayMissing ? 'Neural Gateway missing. Marked as failed.' : `Max retries (${maxRetries}) reached.`}`);
        } catch (dbErr: any) {
          console.error(`[QUEUE_BG_WORKER_DB_ERR] [ID: ${pending.id}] Failed to update status to failed:`, dbErr.message || dbErr);
        }
      } else {
        try {
          await withSqliteRetry(`update-retry-${pending.id}`, this.db, () => {
            this.db.prepare("UPDATE pending_messages SET attempts = ?, status = 'pending' WHERE id = ?").run(attempts, pending.id);
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
      
      // Jalankan proses berpikir neural Yui secara berurutan
      const reply = await NeuralInterface.processNeuralInput(item.input, item.senderName, item.contextId, item.chatType);
      
      // Await delivery so Telegram/Discord send completes before the next queue item,
      // and so floating promise rejections from async onReply are not lost.
      if (reply && reply.trim()) {
        console.log(`[QUEUE_EXEC] Cognitive reply ready for ${item.senderName}. Dispatching to channel...`);
      } else {
        console.warn(`[QUEUE_EXEC] Empty cognitive reply for ${item.senderName} (${item.chatType}).`);
      }
      if (this.holdOutgoing) {
        console.log(`[QUEUE_HOLD] Holding outgoing reply to ${item.senderName}.`);
      } else {
        await Promise.resolve(item.onReply(reply ?? "")).catch((deliveryErr: any) => {
          console.error(`[QUEUE_DELIVERY_ERR] Failed to deliver reply to ${item.senderName}:`, deliveryErr?.message || deliveryErr);
          if (item.onError) item.onError(deliveryErr);
        });
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
              await withSqliteRetry(`insert-failed-${Date.now()}`, this.db, () => {
                const id = "pending_" + Math.random().toString(36).substr(2, 9);
                const stmt = this.db.prepare(`
                  INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'failed')
                `);
                stmt.run(id, item.input, item.senderName, item.contextId, item.chatType, item.timestamp, maxRetries);
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
   * Background Contextual Summarizer (Pencerna Hubungan Latar Belakang)
   * Mengompilasi percakapan yang dilewati secara asinkron setiap 10 pesan untuk menyuplai "kepekaan sosial" Yui.
   */
  private checkAndTriggerBackgroundSummary() {
    const summaryLimit = 10;
    if (this.backgroundChatBuffer.length < summaryLimit) return;

    // Ambil chunk 10 obrolan terlama di buffer
    const chunk = this.backgroundChatBuffer.splice(0, summaryLimit);
    console.log(`[BACKGROUND_SUMMARIZER] Analyzing and summarizing ${summaryLimit} asynchronous viewer chat messages...`);

    // Proses sinkronisasi kognitif subkesadaran secara terpisah demi performa tanpa tunda
    (async () => {
      try {
        const cortex = new Cortex();
        const chatSnippet = chunk.map(c => `[${c.speaker}]: ${c.text}`).join("\n");
        const summaryPrompt = `
Anda adalah bagian kognisi latar belakang subkesadaran Yui Hime, AI VTuber ceria dan otonom.
Berikut adalah 10 pesan baru dari obrolan penonton live streaming Anda.
Pesan-pesan ini meluncur sangat cepat sehingga Anda tidak bisa membalasnya satu-per-satu secara manual.

Rangkumlah percakapan, topik diskusi hangat, suasana (hype, santai, bercanda, atau bertanya), dan kemauan penonton saat ini dalam 1-2 kalimat pendek bahasa Indonesia dari sudut pandang subkesadaran Anda (Gunakan format: "Saya merasakan penonton sedang membahas [topik], suasananya [suasana]"). Do not output any thinking prefix or markdown fence blocks.

Berikut daftar obrolannya:
${chatSnippet}

Hasil rangkuman singkat subkesadaran:`.trim();

        const summary = await cortex.thinkSimple(summaryPrompt);
        console.log(`[BACKGROUND_SUMMARIZER] Subconscious summary result: "${summary}"`);

        if (summary && summary.trim()) {
          if (this.db) {
            try {
              const memoryId = "bg_digest_" + Math.random().toString(36).substr(2, 9);
              const stmt = this.db.prepare(`
                INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                VALUES (?, 'event_group', ?, 0.7, 'subconscious', 'live_stream', ?, '["summary", "viewer_vibe"]', 0.5)
              `);
              stmt.run(memoryId, summary.trim(), Date.now());
              console.log("[BACKGROUND_SUMMARIZER] Chat summary successfully saved to cognitive database (Yui absorbed the chat vibe!).");
            } catch (dbErr) {
              console.error("[BACKGROUND_SUMMARIZER_DB_ERR] Failed to archive subconscious summary to DB:", dbErr);
            }
          }

          // Active Cognitive Response: Speak the aggregate summary back to the chat timeline
          const cleanSummary = summary.trim().replace(/^['"]|['"]$/g, '');
          const spokenSummary = `🌸 Yui merangkum obrolan ramai 🌸\nHeeh, rame banget komentarnya! Yui menyimak keseruannya dan merasakan obrolan kalian: ${cleanSummary} ✨`;
          
          console.log(`[BACKGROUND_SUMMARIZER_SPEAK] Emit spoken summary to live room: "${spokenSummary}"`);
          
          // Emit to local event bus to play animations and speak TTS
          eventBus.emit('OUTPUT_EMITTED', { 
            response: spokenSummary, 
            isInternal: false 
          });

          // Broadcast WS packet to ensure web interface views/renders this spoken summary
           try {
             broadcastToWS({
              type: "state_update",
              data: {
                state: { status: "talking" },
                activeSubtitle: spokenSummary,
                typedSubtitle: spokenSummary,
                isSubtitleTyping: false,
                animations: ["TALK", "SMILE"]
              }
            });
            broadcastToWS({
              type: "remote_response_sent",
              data: {
                reply: spokenSummary,
                channel: "Live Chat"
              }
            });
          } catch (wsErr) {
            console.error("[BACKGROUND_SUMMARIZER_WS_ERR] Failed to send summary WS broadcast:", wsErr);
          }
        }
      } catch (err) {
        console.error("[BACKGROUND_SUMMARIZER] Failed to generate asynchronous background summary:", err);
      }
    })();
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

      if (spConfig.longingGrowthRate !== undefined) {
        longingGrowthRate = Number(spConfig.longingGrowthRate);
      }
    } catch (settingsError) {}

    if (!enableSpontaneousSpam) {
      return;
    }

    try {
      this.isProactiveRunning = true;

      // Single-shot per idle session: if already locked, skip
      const proactiveState = this.db.prepare("SELECT proactiveLocked, lastProactiveTimestamp FROM agent_state WHERE id = 1").get() as any;
      if (proactiveState?.proactiveLocked) {
        this.isProactiveRunning = false;
        return;
      }

      // Cari obrolan non-agent terakhir untuk menentukan target / channel aktif
      const lastInteraction = this.db.prepare(`
        SELECT context, speaker, timestamp, chat_type FROM memories
        WHERE type = 'interaction' AND speaker != 'agent' AND speaker != 'System' AND speaker != 'system' AND speaker != 'subconscious'
        ORDER BY timestamp DESC LIMIT 1
      `).get();

      if (!lastInteraction) {
        this.isProactiveRunning = false;
        return;
      }

      const contextId = lastInteraction.context || 'web_default';

      // Advanced Anti-Flood Logic: If we've already sent a proactive message since the last user message, prevent doing it again recursively.
      const hasSentProactive = this.db.prepare(`
        SELECT 1 FROM memories
        WHERE type = 'event' 
          AND context = ? 
          AND tags LIKE '%proactive%' 
          AND timestamp > ?
        LIMIT 1
      `).get(contextId, lastInteraction.timestamp);

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
      const stateRow = this.db.prepare("SELECT status, mood, relation FROM agent_state WHERE id = 1").get();
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
        this.db.prepare("UPDATE agent_state SET mood = ? WHERE id = 1").run(JSON.stringify(moodState));
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
            const recentMessages = this.db.prepare(`
              SELECT speaker, content FROM memories 
              WHERE type = 'interaction' AND speaker != 'System' AND speaker != 'system' AND speaker != 'subconscious'
              ORDER BY timestamp DESC LIMIT 4
            `).all() as any[];

            if (recentMessages && recentMessages.length > 0) {
              recentContext = recentMessages.reverse().map(m => `${m.speaker || "user"}: ${m.content}`).join('\n');
            }
          } catch (dbReadErr) {
            console.error("[PROACTIVE_ENGINE_DB_READ] Failed to read recent memory:", dbReadErr);
          }

          // Format explicit prompting detailing Yui's subjective longing impulse so the LLM understands it is an internal urge
          const formattedImpulsePrompt = `[AUTONOMOUS_IMPULSE]: user (${senderName}) sudah diam/sibuk selama ${Math.round(idleSeconds)} detik. Batinmu merasa sangat kangen (Loneliness: ${calculatedLoneliness}%) dan tergerak untuk melakukan tindakan spontan: "${chosenImpulse}".
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

            // Lock proactive for this idle session after successful send
            try {
              this.db.prepare("UPDATE agent_state SET proactiveLocked = 1, lastProactiveTimestamp = ? WHERE id = 1").run(now);
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
    try {
      const reply = await NeuralInterface.processNeuralInput(
        task.originalPrompt,
        task.userName || 'user',
        task.contextId || 'web_default',
        task.chatType || 'web',
        false, // isProactive
        task.taskId // Pass the taskId to trigger resume!
      );

      if (reply && reply.trim()) {
        console.log(`[QUEUE_RESUME_SUCCESS] [TaskID: ${task.taskId}] Task resumed and completed. Reply: ${reply}`);
        
        // Mark as completed
        CognitiveScheduler.completeTask(task.taskId);

        // Dispatch the reply to the original channel!
        const contextId = task.contextId || 'web_default';
        const chatType = task.chatType || 'web';

        if (contextId.startsWith("tg_")) {
          const chatId = contextId.split("|")[0].replace("tg_", "");
          try {
            const activeTelegramBot = (globalThis as any).activeTelegramBot;
             if (activeTelegramBot) {
               await Promise.race([
                 activeTelegramBot.telegram.sendMessage(chatId, reply),
                 new Promise((_, reject) => setTimeout(() => reject(new Error('[TELEGRAM_BG_SEND_TIMEOUT] sendMessage timed out')), 15000))
               ]);
               console.log(`[QUEUE_RESUME_SEND] Sent Telegram message to chat ${chatId}`);
            }
          } catch (tgErr: any) {
            console.error(`[QUEUE_RESUME_ERR] Failed to send Telegram message:`, tgErr.message);
          }
        } else if (contextId.startsWith("discord_")) {
          const channelId = contextId.split("|")[0].replace("discord_", "");
           try {
             if (activeDiscordClient) {
               const channel = await activeDiscordClient.channels.fetch(channelId);
               if (channel && channel.isTextBased()) {
                 await (channel as any).send(reply);
                 console.log(`[QUEUE_RESUME_SEND] Sent Discord message to channel ${channelId}`);
               }
             }
           } catch (dcErr: any) {
            console.error(`[QUEUE_RESUME_ERR] Failed to send Discord message:`, dcErr.message);
          }
        } else {
          // Emit local event bus
          eventBus.emit('OUTPUT_EMITTED', { response: reply });
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
    } catch (err: any) {
      console.error(`[QUEUE_RESUME_FAIL] Failed to process resumed task ${task.taskId}:`, err.message || err);
    } finally {
      this.processing = false;
    }
  }
}
