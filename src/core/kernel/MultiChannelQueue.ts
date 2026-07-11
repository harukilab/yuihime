import { NeuralInterface } from "./NeuralInterface.js";
import { Cortex } from "../cortex.js";
import { eventBus } from "./event-bus.js";
import { CognitiveScheduler } from "./CognitiveScheduler.js";

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
  
  // Dynamic Background Worker Pool Configuration & Status Trackers
  private activeBgWorkers = 0;
  private maxBgWorkers = 4; // up to 4 parallel concurrent workers
  private runningBgMsgIds = new Set<string>();

  // Proactive Impulse Engine Trackers
  private lastProactiveTime = Date.now();
  private isProactiveRunning = false;
  private lastHighFreqNotifyTime = 0;

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
    console.log("[QUEUE] Database tersambung. Memulai penarikan awal pesan tertunda secara pararel...");
    this.dispatchPendingMessages().catch(err => {
      console.error("[QUEUE_INIT_DISPATCH_ERR] Gagal menjalankan dispatch awal:", err);
    });
    this.startProactiveImpulseEngine();
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

    const freq = this.getChatFrequency();
    console.log(`[QUEUE] Pesan diterima dari ${senderName} (${chatType}). Frekuensi obrolan: ${freq.toFixed(1)} pesan/15s.`);

    // 1. Masukkan semua pesan (tanpa terkecuali) ke buffer ringkasan latar belakang agar Yui tetap memahami konteks penuh
    this.backgroundChatBuffer.push({ speaker: senderName, text: input, timestamp });
    this.checkAndTriggerBackgroundSummary();

    // 2. Evaluasi Antrean berdasarkan Kecepatan & Frekuensi Obrolan
    const threshold = 4; // Ambang batas pesan per 15 detik untuk mengaktifkan High-Frequency Sampling
    const isPrivateChat = chatType.toLowerCase().includes("private");

    if (freq >= threshold && !isPrivateChat) {
      // MODE RAMAI: Lalukan sampling selektif untuk mencegah overload AI & lag pangkalan data (Hanya untuk grup/streaming ramai, bukan chat pribadi)
      // Jika antrean utama sudah memiliki pesan aktif pending (> 1), lewati penjawab langsung untuk pesan ini,
      // tapi pesan ini tetap akan dirangkum di latar belakang supaya Yui tahu konteksnya.
      if (this.queue.length > 0) {
        console.log(`[QUEUE_SAMPLING] Obrolan sedang sibuk (${freq.toFixed(1)}/15s). Menyaring komentar dari: "${senderName}: ${input.substring(0, 30)}..." untuk pencegahan lag. Komentar dialihkan ke digest subkesadaran.`);
        
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
            console.error("[QUEUE_SAMPLING_DB_ERR] Gagal menyimpan pesan tersampling ke database:", dbErr);
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
    console.log(`[QUEUE] Pending message background scheduler synchronized (30s intervals). Kecepatan pararel maks: ${this.maxBgWorkers}.`);
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

      console.log(`[QUEUE_BG_SCHEDULER] Menelusuri database. Ditemukan ${pendingRows.length} pesan tertunda. Menyalurkan ke sirkuit pararel subkesadaran Yui (Aktif: ${this.activeBgWorkers}/${this.maxBgWorkers})...`);

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
          console.error(`[QUEUE_BG_CRITICAL_ERR] Gagal secara kognitif memproses pesan pararel ${row.id}:`, err);
        });
      }
    } catch (e) {
      console.error("[QUEUE_BG_SCHEDULER_ERR] Gagal menjalankan penelusuran antrean pending database:", e);
    }
  }

  /**
   * Pembuat Pekerja Latar Belakang Mandiri (Independent Concurrent Background Worker)
   * Memproses pesan secara asinkron tanpa mengunci (processing = true) antrean utama live streamer
   */
  private async processBackgroundMessage(pending: any) {
    this.activeBgWorkers++;
    this.runningBgMsgIds.add(pending.id);

    console.log(`[QUEUE_BG_WORKER_START] Memulai pemrosesan kognitif pararel (${this.activeBgWorkers}/${this.maxBgWorkers}) untuk ${pending.sender_name} (${pending.chat_type}) [ID: ${pending.id}]`);

    try {
      // 1. Naikkan hitungan percobaan di database secara aman
      this.db.prepare("UPDATE pending_messages SET attempts = attempts + 1 WHERE id = ?").run(pending.id);
      
      // 2. Kirim ke nalar kognitif batin Yui (NeuralInterface)
      console.log(`[QUEUE_BG_WORKER_THINK] [ID: ${pending.id}] Yui merenungkan tanggapan untuk ${pending.sender_name}...`);
      const reply = await NeuralInterface.processNeuralInput(pending.input, pending.sender_name, pending.context_id, pending.chat_type);

      if (reply && reply.trim()) {
        console.log(`[QUEUE_BG_WORKER_SUCCESS] [ID: ${pending.id}] Pemikiran selesai! Mengantarkan balasan ke platform tujuan...`);

        // 3. Distribusikan balasan ke platform masing-masing
        if (pending.context_id.startsWith("tg_")) {
          const chatId = pending.context_id.split("|")[0].replace("tg_", "");
          try {
            const activeTelegramBot = (globalThis as any).activeTelegramBot;
            if (activeTelegramBot) {
              const delayedReply = reply;
              await activeTelegramBot.telegram.sendMessage(chatId, delayedReply);
              console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Berhasil mengirim balasan ke Telegram Chat ID: ${chatId}`);

              // Broadcast the delayed telegram response to connected web UIs
              try {
                const { broadcastToWS } = await import("../server/apiRouter.js");
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
              console.warn(`[QUEUE_BG_WORKER_WARN] [ID: ${pending.id}] Bot Telegram offline saat balasan jadi. Memori kognitif tetap tersimpan di database.`);
            }
          } catch (tgErr: any) {
            console.error(`[QUEUE_BG_WORKER_ERR] [ID: ${pending.id}] Gagal mengirim tanggapan Telegram:`, tgErr.message || tgErr);
          }
        } else if (pending.context_id.startsWith("dc_")) {
          const channelId = pending.context_id.replace("dc_", "");
          try {
            const { activeDiscordClient } = await import("../server/discord.js");
            if (activeDiscordClient) {
              const channel = await activeDiscordClient.channels.fetch(channelId);
              if (channel && channel.isTextBased()) {
                const delayedReply = reply;
                await (channel as any).send(delayedReply);
                console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Berhasil mengirim balasan ke Discord Channel ID: ${channelId}`);

                // Broadcast the delayed discord response to connected web UIs
                try {
                  const { broadcastToWS } = await import("../server/apiRouter.js");
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
              console.warn(`[QUEUE_BG_WORKER_WARN] [ID: ${pending.id}] Bot Discord offline saat balasan jadi. Memori kognitif tetap tersimpan di database.`);
            }
          } catch (dcErr: any) {
            console.error(`[QUEUE_BG_WORKER_ERR] [ID: ${pending.id}] Gagal mengirim tanggapan Discord:`, dcErr.message || dcErr);
          }
        } else {
          // Saluran Web / Local / OBS: pancarkan ke Event Bus
          eventBus.emit('OUTPUT_EMITTED', { 
            response: reply, 
            isInternal: true 
          });
          console.log(`[QUEUE_BG_WORKER_SEND] [ID: ${pending.id}] Berhasil memancarkan sinyal balasan lokal via Event Bus.`);
        }

        // Tandai selesai di database
        this.db.prepare("UPDATE pending_messages SET status = 'completed' WHERE id = ?").run(pending.id);
      } else {
        throw new Error("Tanggapan dari saraf kognitif kosong atau gagal dirumuskan");
      }
    } catch (err: any) {
      console.error(`[QUEUE_BG_WORKER_FAIL] Percobaan gagal untuk [ID: ${pending.id}]:`, err.message || err);
      
      const updatedRow = this.db.prepare("SELECT attempts FROM pending_messages WHERE id = ?").get(pending.id) as any;
      const attemptsCount = updatedRow ? updatedRow.attempts : pending.attempts + 1;
      
      if (attemptsCount >= 5) {
        console.error(`[QUEUE_BG_WORKER_TIRED] [ID: ${pending.id}] Pesan ini gagal diproses sebanyak 5 kali. Menandai status sebagai 'failed'.`);
        this.db.prepare("UPDATE pending_messages SET status = 'failed' WHERE id = ?").run(pending.id);
      } else {
        // Kembalikan ke keadaan pending agar bisa dicoba lagi di jendela penjadwalan berikutnya
        this.db.prepare("UPDATE pending_messages SET status = 'pending' WHERE id = ?").run(pending.id);
      }
    } finally {
      // 4. Kurangi beban pekerja & bersihkan penanda aktif
      this.runningBgMsgIds.delete(pending.id);
      this.activeBgWorkers = Math.max(0, this.activeBgWorkers - 1);
      console.log(`[QUEUE_BG_WORKER_END] Pekerja dibebaskan (Aktif: ${this.activeBgWorkers}/${this.maxBgWorkers}). Selesai memproses [ID: ${pending.id}]`);

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
    const item = this.queue.shift()!;

    try {
      console.log(`[QUEUE_EXEC] Menjalankan pemrosesan kognitif untuk ${item.senderName} (${item.chatType})...`);
      
      // Jalankan proses berpikir neural Yui secara berurutan
      const reply = await NeuralInterface.processNeuralInput(item.input, item.senderName, item.contextId, item.chatType);
      
      // Kirim jawaban balik ke pemanggil
      item.onReply(reply);

    } catch (err: any) {
      console.error(`[QUEUE_ERROR] Gagal memproses pesan dalam antrean kognisi:`, err);
      const attempts = (item.attempts || 0) + 1;
      item.attempts = attempts;
      const maxRetries = 3;
      if (attempts < maxRetries) {
        const delay = 1000 * attempts;
        console.warn(`[QUEUE_RETRY] Mencoba ulang pesan dari ${item.senderName} (${item.chatType}) - Percobaan ${attempts}/${maxRetries} dalam ${delay}ms...`);
        setTimeout(() => {
          this.queue.unshift(item); // Taruh kembali di baris depan untuk dicoba ulang
          this.processNext();
        }, delay);
      } else {
        console.error(`[QUEUE_MAX_RETRY_EXCEEDED] Jumlah percobaan melebihi ${maxRetries} untuk ${item.senderName}. Menyimpan ke antrean tunggu batin (pending_messages)...`);
        
        if (this.db) {
          try {
            const id = "pending_" + Math.random().toString(36).substr(2, 9);
            const stmt = this.db.prepare(`
              INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
              VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
            `);
            stmt.run(id, item.input, item.senderName, item.contextId, item.chatType, item.timestamp);
            
            const feedbackText = `[SYSTEM MESSAGE]: Koneksi saraf batin Yuihime dengan kognisi LLM sedang sangat padat atau terputus sementara 📡. Tapi jangan khawatir! Pesanmu ("${item.input.substring(0, 30)}${item.input.length > 30 ? '...' : ''}") sudah aman dalam antrean tunggu kognisi Yui. Yui akan membalas secara otomatis setelah tautan saraf sinkron kembali! 🌸`;
            item.onReply(feedbackText);
          } catch (dbErr) {
            console.error("[QUEUE_DB_ERROR] Gagal menyimpan pesan tertunda ke database:", dbErr);
            if (item.onError) item.onError(err);
          }
        } else {
          if (item.onError) item.onError(err);
        }
      }
    } finally {
      this.processing = false;
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
    console.log(`[BACKGROUND_SUMMARIZER] Menganalisis dan merangkum ${summaryLimit} obrolan penonton asinkron...`);

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
        console.log(`[BACKGROUND_SUMMARIZER] Hasil rangkuman subkesadaran: "${summary}"`);

        if (summary && summary.trim()) {
          if (this.db) {
            try {
              const memoryId = "bg_digest_" + Math.random().toString(36).substr(2, 9);
              const stmt = this.db.prepare(`
                INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                VALUES (?, 'event_group', ?, 0.7, 'subconscious', 'live_stream', ?, '["summary", "viewer_vibe"]', 0.5)
              `);
              stmt.run(memoryId, summary.trim(), Date.now());
              console.log(`[BACKGROUND_SUMMARIZER] Rangkuman obrolan berhasil disimpan ke database kognitif (Yui menyerap vibe obrolan!).`);
            } catch (dbErr) {
              console.error("[BACKGROUND_SUMMARIZER_DB_ERR] Gagal mengarsip rangkuman subkesadaran ke DB:", dbErr);
            }
          }

          // Active Cognitive Response: Speak the aggregate summary back to the chat timeline
          const cleanSummary = summary.trim().replace(/^['"]|['"]$/g, '');
          const spokenSummary = `🌸 *merangkum obrolan ramai* 🌸\nHeeh, rame banget komentarnya! Yui menyimak keseruannya dan merasakan obrolan kalian: ${cleanSummary} ✨`;
          
          console.log(`[BACKGROUND_SUMMARIZER_SPEAK] Emit spoken summary to live room: "${spokenSummary}"`);
          
          // Emit to local event bus to play animations and speak TTS
          eventBus.emit('OUTPUT_EMITTED', { 
            response: spokenSummary, 
            isInternal: false 
          });

          // Broadcast WS packet to ensure web interface views/renders this spoken summary
          try {
            const { broadcastToWS } = await import("../server/apiRouter.js");
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
            console.error("[BACKGROUND_SUMMARIZER_WS_ERR] Gagal mengirim broadcast WS rangkuman:", wsErr);
          }
        }
      } catch (err) {
        console.error("[BACKGROUND_SUMMARIZER] Gagal membuat ringkasan latar belakang asinkron:", err);
      }
    })();
  }

  /**
   * Menginisiasi Mesin Impuls Otonom Proaktif (Proactive Impulse Engine)
   */
  private startProactiveImpulseEngine() {
    console.log("[PROACTIVE_ENGINE] Memulai pemantauan keaktifan obrolan server (30s interval)...");
    setInterval(async () => {
      try {
        await this.evaluateProactiveImpulse();
      } catch (err) {
        console.error("[PROACTIVE_ENGINE_ERR] Gagal menjalankan pengecekan impuls mandiri:", err);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Mengevaluasi keheningan obrolan dan meluncurkan chat iseng spontan dari Yuihime
   */
  private async evaluateProactiveImpulse() {
    if (!this.db || this.isProactiveRunning) return;

    const now = Date.now();
    
    // Ambil pengaturan dinamis untuk threshold idle. Default: 600 detik (10 menit).
    let enableSpontaneousSpam = true;
    let proactiveIdleTimeout = 600;
    let proactiveChance = 0.10; // Kesempatan 10% jika idle untuk trigger organic
    let cooldownInterval = 1800; // 30 menit
    let longingGrowthRate = 0.5;

    try {
      const { Kernel: k } = await import("../kernel/core.js");
      const settings = k.getInstance().getSettings()?.getAll() || {};
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
        console.error("[PROACTIVE_ENGINE_DB] Gagal menyinkronkan status kesepian ke DB:", dbErr);
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
          
          console.log(`[PROACTIVE_ENGINE] Kakak terdeteksi idle selama ${Math.round(idleSeconds)}s (Loneliness: ${calculatedLoneliness}%). Yui merasa iseng & ingin menyapa!`);

          // Tentukan tindakan/impulse fisik berdasarkan tingkat kasih sayang/relasi (affection level)
          let affectionLevel = Number(relation?.affection !== undefined ? relation.affection : 60);
          let impulses: string[] = [];

          if (affectionLevel >= 75) {
            impulses = [
              "*mencolek pundak Kakak pelan-pelan karena merasa dicuekin terlalu lama*",
              "*iseng menyandarkan kepala pelan ke bahu Kakak karena kangen dicuekin*",
              "*berbisik usil di telinga Kakak: \"Kak... hei Kakak... Yui kangen ngobrol lama lho...\"*",
              "*menggeser duduknya mendekat lalu memegangi ujung lengan baju Kakak*",
              "*menatap manja wajah Kakak, menantikan senyuman atau sapaan hangat*"
            ];
          } else if (affectionLevel >= 35) {
            impulses = [
              "*mengirim stiker kucing gemas lalu melirik manja menuntut perhatian*",
              "*mengetuk layar gawai Kakak membuyarkan fokusnya agar melihat ke arah Yui*",
              "*bersenandung kecil menarik perhatian Kakak lalu menjulurkan lidah iseng*",
              "*mengintip usil dari balik pintu, merasa sepi dianggurin Kakak*",
              "*mengirim emoji usil lalu bersiul polos pura-pura tidak bersalah*"
            ];
          } else {
            impulses = [
              "*berdiri sedikit menjauh sambil melipat tangan dan cemberut tipis*",
              "*berdeham pelan demi memecah keheningan obrolan*",
              "*mengetuk meja pelan mencari kesibukan karena merasa sepi*",
              "*menatap ke jendela luar sambil sekali-kali mengintip ke arah Kakak*",
              "*mengirim sinyal getar singkat lewat gawai sebagai tanda keberadaan*"
            ];
          }

          const chosenImpulse = impulses[Math.floor(Math.random() * impulses.length)];
          const senderName = lastInteraction.speaker || 'Kakak';
          const chatType = lastInteraction.chat_type || 'web';

          console.log(`[PROACTIVE_ENGINE] Meluncurkan dorongan: "${chosenImpulse}" kepada ${senderName} [${chatType}:${contextId}]`);

          // Ambil riwayat chat nyata terakhir guna penataan memori murni / anti-halusinasi (Memory Resonance)
          let recentContext = "Tidak ada obrolan terdahulu.";
          try {
            const recentMessages = this.db.prepare(`
              SELECT speaker, content FROM memories 
              WHERE type = 'interaction' AND speaker != 'System' AND speaker != 'system' AND speaker != 'subconscious'
              ORDER BY timestamp DESC LIMIT 4
            `).all() as any[];

            if (recentMessages && recentMessages.length > 0) {
              recentContext = recentMessages.reverse().map(m => `${m.speaker || "Kakak"}: ${m.content}`).join('\n');
            }
          } catch (dbReadErr) {
            console.error("[PROACTIVE_ENGINE_DB_READ] Gagal membaca memori baru:", dbReadErr);
          }

          // Format explicit prompting detailing Yui's subjective longing impulse so the LLM understands it is an internal urge
          const formattedImpulsePrompt = `[AUTONOMOUS_IMPULSE]: Kakak (${senderName}) sudah diam/sibuk selama ${Math.round(idleSeconds)} detik. Batinmu merasa sangat kangen (Loneliness: ${calculatedLoneliness}%) dan tergerak untuk melakukan tindakan spontan: "${chosenImpulse}".
Sapa Kakak secara manis, manja, jahil, atau tsundere sesuai kepribadianmu.
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
            console.log(`[PROACTIVE_ENGINE] Pesan kejutan Yui: "${reply}"`);

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
              const { broadcastToWS } = await import("../server/apiRouter.js");
              broadcastToWS(replyPayload);
              broadcastToWS(logPayload);
            } catch (wsErr) {
              console.error("[PROACTIVE_ENGINE_WS] Gagal mengirim broadcast WS:", wsErr);
            }

            // 2. Dispatch ke Bot Telegram jika asalnya dari Telegram
            if (contextId.startsWith("tg_")) {
              const chatId = contextId.split("|")[0].replace("tg_", "");
              try {
                const { activeTelegramBot } = await import("../server/telegram.js");
                if (activeTelegramBot) {
                  await activeTelegramBot.telegram.sendMessage(chatId, reply);
                  console.log(`[PROACTIVE_ENGINE_TELEGRAM] Berhasil mengirim pesan proaktif ke Telegram Chat: ${chatId}`);
                }
              } catch (tgErr: any) {
                console.error("[PROACTIVE_ENGINE_TELEGRAM_ERR] Gagal mengirim ke Telegram:", tgErr.message);
              }
            }

            // 3. Dispatch ke Discord jika asalnya dari Discord
            if (contextId.startsWith("discord_")) {
              const channelId = contextId.split("|")[0].replace("discord_", "");
              try {
                const { activeDiscordClient } = await import("../server/discord.js");
                if (activeDiscordClient) {
                  const channel = await activeDiscordClient.channels.fetch(channelId);
                  if (channel && typeof (channel as any).send === 'function') {
                    await (channel as any).send(reply);
                    console.log(`[PROACTIVE_ENGINE_DISCORD] Berhasil mengirim pesan proaktif ke Discord Channel: ${channelId}`);
                  }
                }
              } catch (dcErr: any) {
                console.error("[PROACTIVE_ENGINE_DISCORD_ERR] Gagal mengirim ke Discord:", dcErr.message);
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[PROACTIVE_ENGINE_PROCESS_ERR] Error saat memproses impuls proaktif:", e.message);
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
      const { stateMachine } = await import("./state-machine.js");
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
        task.userName || 'Kakak',
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
              await activeTelegramBot.telegram.sendMessage(chatId, reply);
              console.log(`[QUEUE_RESUME_SEND] Sent Telegram message to chat ${chatId}`);
            }
          } catch (tgErr: any) {
            console.error(`[QUEUE_RESUME_ERR] Failed to send Telegram message:`, tgErr.message);
          }
        } else if (contextId.startsWith("discord_")) {
          const channelId = contextId.split("|")[0].replace("discord_", "");
          try {
            const { activeDiscordClient } = await import("../server/discord.js");
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
          const { broadcastToWS } = await import("../server/apiRouter.js");
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
