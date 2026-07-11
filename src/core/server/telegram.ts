import { Telegraf } from "telegraf";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import { Kernel } from "../kernel/core.js";
import { MultiChannelQueue } from "../kernel/MultiChannelQueue.js";
import { initializeDatabase, deduplicateAndMergeIdentities } from "../database.js";

let db: any = null;

// --- Telegram Bot Daemon ---
export let activeTelegramBot: any = null;
export let activeTelegramToken: string | null = null;

// Initialize AI for Bot
const botGenAI = () => {
  const settings = Kernel.getInstance().getSettings();
  const apiKey = settings.getApiKey();
  return apiKey ? new GoogleGenerativeAI(apiKey) : null;
};

export async function initializeBot(activeDb?: any, force = false, dropPending = false) {
  if (activeDb) {
    db = activeDb;
  } else if (!db) {
    db = initializeDatabase();
  }

  const settings = Kernel.getInstance().getSettings().getAll();
  const botToken = settings['telegram_bridge']?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const isEnabled = settings['telegram_bridge']?.enabled !== false;
  
  if (!botToken || !isEnabled) {
    if (activeTelegramBot) {
      console.log("[TELEGRAM] Bot dinonaktifkan atau Token kosong. Menghentikan Bot Daemon aktif...");
      try {
        activeTelegramBot.stop("SIGINT");
      } catch (e) {}
      activeTelegramBot = null;
      (globalThis as any).activeTelegramBot = null;
      activeTelegramToken = null;
    }
    if (!botToken) {
      console.warn("[KERNEL] Telegram Bot Token tidak ditemukan di config.toml atau pengaturan UI. Bot dinonaktifkan.");
    } else {
      console.log("[KERNEL] Telegram Bot dinonaktifkan melalui konfigurasi tombol.");
    }
    return;
  }

  // Jika bot sudah berjalan dengan token yang tepat, tidak perlu inisialisasi ulang
  if (activeTelegramBot && activeTelegramToken === botToken && !force) {
    console.log("[TELEGRAM] Bot Daemon sudah berjalan dengan token yang sama.");
    return;
  }

  // Jika ada bot lama, hentikan dulu
  if (activeTelegramBot) {
    console.log("[TELEGRAM] Mengonfigurasi ulang atau mendeteksi perubahan Bot Token. Menghentikan instansi lama...");
    try {
      activeTelegramBot.stop("SIGINT");
    } catch (e) {}
    activeTelegramBot = null;
    (globalThis as any).activeTelegramBot = null;
    activeTelegramToken = null;
  }

  console.log("[TELEGRAM] Memulai Bot Daemon dengan token baru...");
  const customApiRoot = settings['telegram_bridge']?.apiRoot;
  const botOptions: any = {};
  if (customApiRoot && customApiRoot.trim() !== "") {
    console.log(`[TELEGRAM] Menggunakan custom API Root URL: ${customApiRoot}`);
    botOptions.telegram = {
      apiRoot: customApiRoot.trim()
    };
  }
  const bot = new Telegraf(botToken, botOptions);
  activeTelegramBot = bot;
  (globalThis as any).activeTelegramBot = bot;
  activeTelegramToken = botToken;

  // Helper to handle OTP pairing securely with constant-time comparison
  async function handlePairingCode(ctx: any, code: string) {
    if (!/^\d{6}$/.test(code)) {
      return ctx.reply("❌ Format kode salah. Kode OTP harus berupa 6 digit angka.");
    }

    try {
      const rows = db.prepare("SELECT * FROM pairing_codes").all();
      let matchedRow: any = null;

      for (const row of rows) {
        try {
          const isMatch = crypto.timingSafeEqual(
            Buffer.from(row.code, 'utf-8'),
            Buffer.from(code, 'utf-8')
          );
          if (isMatch) {
            matchedRow = row;
            break;
          }
        } catch (e) {
          if (row.code === code) {
            matchedRow = row;
            break;
          }
        }
      }

      if (!matchedRow) {
        return ctx.reply("❌ Kode OTP tidak valid atau telah kedaluwarsa. Silakan menghasilkan kode baru di Web UI.");
      }

      if (matchedRow.expires_at < Date.now()) {
        db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(matchedRow.code);
        return ctx.reply("❌ Kode OTP ini telah kedaluwarsa. Silakan menghasilkan kode baru di Web UI.");
      }

      const identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(matchedRow.identity_id);
      if (!identity) {
        return ctx.reply("❌ Identitas Web asal tidak ditemukan dalam sistem.");
      }

      const senderName = ctx.from.first_name || 'Anonymous';
      const tgUsername = ctx.from.username;

      let accounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
      const chatType = ctx.chat.type === 'private' ? 'telegram (private)' : 'telegram (group)';
      const platformTag1 = `${chatType}:${senderName}`;
      const platformTag2 = tgUsername ? `telegram:${tgUsername.toLowerCase()}` : null;
      const platformTag3 = `telegram:id:${ctx.from.id}`;

      accounts.push(platformTag1);
      if (platformTag2) accounts.push(platformTag2);
      accounts.push(platformTag3);

      // Merge in any pending accounts registered with this pairing code (e.g. from Discord or other platforms)
      if (matchedRow.pending_account) {
        try {
          const pending = JSON.parse(matchedRow.pending_account);
          if (Array.isArray(pending)) {
            accounts = [...accounts, ...pending];
          }
        } catch (e) {
          console.error("[TELEGRAM_PAIR] Failed to parse pending_account:", e);
        }
      }

      accounts = [...new Set(accounts)];

      db.prepare("UPDATE identities SET linkedAccounts = ? WHERE id = ?").run(
        JSON.stringify(accounts),
        identity.id
      );

      // Gabungkan profil duplikat (seperti akun chat mandiri vs akun web)
      try {
        deduplicateAndMergeIdentities(db, identity.id);
      } catch (mergeErr) {
        console.error("[TELEGRAM_PAIR] Gagal menggabungkan identitas duplikat secara inline:", mergeErr);
      }

      db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(matchedRow.code);

      db.prepare("INSERT OR REPLACE INTO telegram_users (tg_id, username, context, last_seen) VALUES (?, ?, ?, ?)")
        .run(ctx.from.id, tgUsername || senderName, `linked_identity:${identity.id}`, Date.now());

      const memoryId = Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO memories (id, type, content, importance, speaker, context, timestamp)
        VALUES (?, 'system', ?, 0.9, 'System', ?, ?)
      `).run(
        memoryId,
        `[SYSTEM_LINK]: Pengguna Telegram ${senderName} (tg_id: ${ctx.from.id}) berhasil dipasangkan dengan identitas Web: ${identity.perceivedName}.`,
        `tg_${ctx.chat.id}`,
        Date.now()
      );

      return ctx.reply(`✨ Kognisi Terhubung! Hubungan lintas-platform berhasil dikaitkan.\n\nAkun Telegram kamu (${senderName}) sekarang terhubung dengan sesi Web (${identity.perceivedName}). Yuihime is now aware of your cross-platform presence.`);
    } catch (err: any) {
      console.error("[TELEGRAM_PAIR] Gagal menghubungkan akun:", err);
      return ctx.reply("❌ Terjadi kesalahan internal saat memproses penyandingan.");
    }
  }

  bot.start((ctx) => {
    ctx.reply("System Online. Neural Link established with Yuihime Core. How can I assist you today?");
    db.prepare("INSERT OR IGNORE INTO telegram_users (tg_id, username, last_seen) VALUES (?, ?, ?)")
      .run(ctx.from.id, ctx.from.username, Date.now());
  });

  bot.command("pair", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("Silakan sertakan kode OTP 6-digit. Contoh: /pair 482103");
    }
    await handlePairingCode(ctx, args[1].trim());
  });

  bot.command("approve", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("Silakan sertakan ID permintaan. Contoh: /approve A8F2D1");
    }
    const id = args[1].trim().toUpperCase();
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      return ctx.reply(`❌ Permintaan konfirmasi dengan ID "${id}" tidak ditemukan.`);
    }
    item.status = 'approved';
    return ctx.reply(`✅ Permintaan ${id} (${item.action} -> ${item.targetPath}) BERHASIL DISETUJUI.`);
  });

  bot.command("always", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("Silakan sertakan ID permintaan. Contoh: /always A8F2D1");
    }
    const id = args[1].trim().toUpperCase();
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      return ctx.reply(`❌ Permintaan konfirmasi dengan ID "${id}" tidak ditemukan.`);
    }
    item.status = 'always';
    return ctx.reply(`✅ Permintaan ${id} BERHASIL DISETUJUI. Mode "Always Acc" diaktifkan untuk sesi ini.`);
  });

  bot.command("deny", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("Silakan sertakan ID permintaan. Contoh: /deny A8F2D1");
    }
    const id = args[1].trim().toUpperCase();
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      return ctx.reply(`❌ Permintaan konfirmasi dengan ID "${id}" tidak ditemukan.`);
    }
    item.status = 'denied';
    return ctx.reply(`❌ Permintaan ${id} (${item.action} -> ${item.targetPath}) BERHASIL DITOLAK.`);
  });

  bot.on("message", async (ctx) => {
    const currentSettings = Kernel.getInstance().getSettings().getAll();
    
    // Support either text messages or captions for documents/images
    const textMsg = (ctx.message as any).text || "";
    const captionMsg = (ctx.message as any).caption || "";
    let rawInput = textMsg || captionMsg || "";

    // Intercept direct text confirmations (e.g., acc, always, tolak)
    const cleanInput = rawInput.trim().toLowerCase();
    const pendingList = (globalThis.pendingConfirmations || []).filter(item => item.status === 'pending');
    
    if (pendingList.length > 0) {
      const words = cleanInput.split(/\s+/);
      const isAcc = words.includes('acc') || words.includes('approve') || words.includes('setuju') || words.includes('/approve');
      const isAlways = words.includes('always') || words.includes('selalu') || words.includes('/always');
      const isDeny = words.includes('tolak') || words.includes('deny') || words.includes('/deny');
      
      if (isAcc || isAlways || isDeny) {
        let foundId = words.find(w => w.length === 6 && /^[a-z0-9]+$/i.test(w))?.toUpperCase();
        if (!foundId && pendingList.length === 1) {
          foundId = pendingList[0].id;
        }
        
        if (foundId) {
          const item = pendingList.find(i => i.id === foundId);
          if (item) {
            if (isAcc) {
              item.status = 'approved';
              return ctx.reply(`✅ Permintaan ${foundId} (${item.action} -> ${item.targetPath}) BERHASIL DISETUJUI.`);
            } else if (isAlways) {
              item.status = 'always';
              return ctx.reply(`✅ Permintaan ${foundId} BERHASIL DISETUJUI. Mode "Always Acc" diaktifkan.`);
            } else if (isDeny) {
              item.status = 'denied';
              return ctx.reply(`❌ Permintaan ${foundId} (${item.action} -> ${item.targetPath}) BERHASIL DITOLAK.`);
            }
          }
        }
      }
    }

    // Check if user is attempting to enter pairing code directly via text
    const pairMatch = rawInput.trim().match(/^\/pair\s+(\d{6})/i) || 
                      rawInput.trim().match(/^pair\s+(\d{6})/i) || 
                      rawInput.trim().match(/^hubungkan\s+(\d{6})/i) || 
                      rawInput.trim().match(/^(\d{6})$/);
                      
    if (pairMatch) {
      const code = pairMatch[1];
      await handlePairingCode(ctx, code);
      return;
    }
    const tgUserId = ctx.from.id;
    const senderName = ctx.from.first_name || 'Anonymous';

    // Handle incoming attachments (photos / documents / voice / audio / video)
    let attachmentProcessed = false;
    let attachmentInfo = "";
    
    try {
      const document = (ctx.message as any).document;
      const photo = (ctx.message as any).photo;
      const audio = (ctx.message as any).audio;
      const voice = (ctx.message as any).voice;
      const video = (ctx.message as any).video;

      let fileId = null;
      let originalName = null;

      if (document) {
        fileId = document.file_id;
        originalName = document.file_name;
      } else if (photo && photo.length > 0) {
        fileId = photo[photo.length - 1].file_id;
        originalName = `photo_${Date.now()}.jpg`;
      } else if (audio) {
        fileId = audio.file_id;
        originalName = audio.file_name || `audio_${Date.now()}.mp3`;
      } else if (voice) {
        fileId = voice.file_id;
        originalName = `voice_${Date.now()}.ogg`;
      } else if (video) {
        fileId = video.file_id;
        originalName = video.file_name || `video_${Date.now()}.mp4`;
      }

      if (fileId) {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const fileUrl = fileLink.toString();
        const resFile = await fetch(fileUrl);
        if (resFile.ok) {
          const fs = await import("fs/promises");
          const path = await import("path");
          const { getDynamicSandboxRoot } = await import("./apiRouter.js");
          const sandboxDir = getDynamicSandboxRoot();
          await fs.mkdir(sandboxDir, { recursive: true });

          const safeFilename = originalName || `file_${Date.now()}`;
          const safePath = path.resolve(sandboxDir, safeFilename);
          
          if (safePath.startsWith(sandboxDir)) {
            const arrayBuffer = await resFile.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            await fs.writeFile(safePath, buffer);

            let visualDesc = "";
            const isImg = photo || safeFilename.match(/\.(jpe?g|png|webp|gif|bmp)$/i);
            if (isImg) {
              const ext = path.extname(safeFilename).toLowerCase();
              let mimeType = "image/jpeg";
              if (ext === ".png") mimeType = "image/png";
              else if (ext === ".webp") mimeType = "image/webp";
              else if (ext === ".gif") mimeType = "image/gif";

              try {
                const { describeImageFromBuffer } = await import("../../modules/YuiVisionModule.js");
                const desc = await describeImageFromBuffer(buffer, mimeType);
                if (desc) {
                  visualDesc = ` Sensory input analysis of this uploaded image indicates: "${desc}"`;
                }
              } catch (ev: any) {
                console.error("[TELEGRAM_VISION] Vision analysis error:", ev.message || ev);
              }
            }

            attachmentInfo = `\n\n[SYSTEM_ATTACHMENT_RECEIVED: File saved as "${safeFilename}" in sandbox workspace. You can read, list, and manipulate it using your tools.${visualDesc}]`;
            attachmentProcessed = true;
          }
        }
      }
    } catch (attachmentErr: any) {
      console.error("[TELEGRAM_ATTACHMENT] Failed to retrieve or save attachment:", attachmentErr.message || attachmentErr);
    }

    if (!rawInput && attachmentProcessed) {
      rawInput = "Mengirim file attachment";
    }
    const userMessage = rawInput + attachmentInfo;

    if (!userMessage.trim()) return;

    // Immediate acknowledgment if enabled
    if (currentSettings['telegram_bridge']?.autoAcknowledge !== false) {
      ctx.sendChatAction('typing').catch(() => {});
      
      // Varied reactions
      const reactionList = (currentSettings['telegram_bridge']?.reactionEmojis || '❤️,🔥,🥰,🎉,⚡,👍').split(',').map((e: string) => e.trim());
      const randomEmoji = reactionList[Math.floor(Math.random() * reactionList.length)];
      
      if (randomEmoji) {
        // Use Telegraf's react method if available (Bot API 7.0+)
        if (typeof (ctx as any).react === 'function') {
          (ctx as any).react(randomEmoji as any).catch((err) => {
            console.warn(`[TELEGRAM_REACTION] Gagal melakukan reaksi dengan emoji ${randomEmoji}, mencounter balik menggunakan standard ❤️:`, err.message);
            (ctx as any).react('❤️' as any).catch(() => {});
          });
        } else {
          // Fallback to direct API call if telegraf version is slightly older
          ctx.telegram.callApi('setMessageReaction', {
            chat_id: ctx.chat.id,
            message_id: ctx.message.message_id,
            reaction: [{ type: 'emoji', emoji: randomEmoji as any }]
          }).catch((err: any) => {
            console.warn(`[TELEGRAM_REACTION] Gagal direct setMessageReaction dengan ${randomEmoji}, mencounter balik menggunakan standard ❤️:`, err.message);
            ctx.telegram.callApi('setMessageReaction', {
              chat_id: ctx.chat.id,
              message_id: ctx.message.message_id,
              reaction: [{ type: 'emoji', emoji: '❤️' as any }]
            }).catch(() => {});
          });
        }
      }
    }

    // Simulate Agent Thinking
    try {
      if (!botGenAI()) {
        return ctx.reply("[ERROR] AI Neural Engine not configured. Please set GEMINI_API_KEY.");
      }

      const isGroup = ctx.chat.type !== 'private';
      const chatTitle = isGroup ? (ctx.chat as any).title : 'Private Chat';
      const contextId = isGroup 
        ? `tg_${ctx.chat.id}|usr_${ctx.from.id}`
        : `tg_${ctx.chat.id}`;
      const chatType = `Telegram (${isGroup ? 'Group: ' + chatTitle : 'Private'})`;

      // Broadcast the incoming remote Telegram message to connected WebClients
      const { broadcastToWS } = await import("./apiRouter.js");
      broadcastToWS({
        type: "remote_message_received",
        data: {
          senderName,
          message: userMessage,
          channel: chatType,
          contextId
        }
      });

      MultiChannelQueue.getInstance().addMessage(
        userMessage,
        senderName,
        contextId,
        chatType,
        async (response) => {
          if (response) {
            await ctx.reply(response).catch(() => {});
            
            // Broadcast Yui's response to the connected WebClients
            broadcastToWS({
              type: "remote_response_sent",
              data: {
                reply: response,
                channel: chatType,
                contextId
              }
            });
          }
          // Update last seen (use UPSERT to preserve pairing context mapping from being overwritten to NULL on incoming messages)
          db.prepare(`
            INSERT INTO telegram_users (tg_id, username, last_seen)
            VALUES (?, ?, ?)
            ON CONFLICT(tg_id) DO UPDATE SET
              username = excluded.username,
              last_seen = excluded.last_seen
          `).run(tgUserId, ctx.from.username || senderName, Date.now());
        },
        async (err) => {
          console.error("[TELEGRAM_QUEUE] Gagal memproses pesan:", err);
          try {
            if (err.code !== 403 && err.code !== 400) {
              await ctx.reply("[SYSTEM ERROR] Sinkronisasi neural terganggu dalam antrean.");
            }
          } catch (e) {}
        }
      );
    } catch (error: any) {
       console.error("Bot Error:", error);
       try {
         if (error.code !== 403 && error.code !== 400) {
           await ctx.reply("[SYSTEM ERROR] Neural Sync Interrupted.");
         }
       } catch (e) {
         console.error("Critical: Failed to send even the error report.", e);
       }
    }
  });

  bot.catch((err: any, ctx: any) => {
    console.error(`[TELEGRAM] Bot error for ${ctx.updateType}:`, err);
    if (err.code === 409) {
      console.warn("[TELEGRAM] Conflict detected mid-session. Other instance took over.");
    }
  });

  const launchBot = async (retryCount = 0) => {
    if (activeTelegramBot !== bot) return; // Instansi sudah digantikan
    try {
      console.log(`[TELEGRAM] Attempting launch (Retry: ${retryCount}, dropPending: ${dropPending})...`);
      
      // Hapus webhook aktif yang mungkin tertinggal untuk menghindari 409 Conflict secara tuntas!
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: retryCount > 0 || dropPending });
        console.log("[TELEGRAM] Webhook successfully cleared before launch.");
      } catch (webhookErr: any) {
        console.warn("[TELEGRAM] Catatan: Gagal menghapus webhook (bisa diabaikan jika tidak ada webhook aktif):", webhookErr.message || webhookErr);
      }

      await bot.launch({
        dropPendingUpdates: retryCount > 0 || dropPending
      });
      console.log("[TELEGRAM] Bot Daemon listening successfully via Long Polling...");
    } catch (err: any) {
      if (err.message && (err.message.includes("401") || err.message.includes("unauthorized"))) {
        console.error("[TELEGRAM] Gagal memverifikasi Token Bot: Token tidak valid/unauthorized atau kedaluwarsa. Bot dinonaktifkan!");
        try { bot.stop(); } catch (e) {}
        if (activeTelegramBot === bot) {
          activeTelegramBot = null;
          activeTelegramToken = null;
        }
      } else if (err.code === 409) {
        const maxConflictRetries = 5;
        if (retryCount < maxConflictRetries) {
          const delay = 10000 + (retryCount * 5000) + Math.random() * 5000;
          console.warn(`[TELEGRAM] Conflict on launch. Retrying in ${Math.round(delay/1000)}s (Attempt ${retryCount + 1}/${maxConflictRetries})...`);
          setTimeout(() => launchBot(retryCount + 1), delay);
        } else {
          console.error(`[TELEGRAM] Gagal meluncurkan Bot Daemon setelah ${maxConflictRetries} percobaan karena konflik (409 Conflict). Silakan periksa apakah ada instansi bot lain dengan token sama yang sedang berjalan.`);
          try { bot.stop(); } catch (e) {}
          if (activeTelegramBot === bot) {
            activeTelegramBot = null;
            activeTelegramToken = null;
          }
        }
      } else if (
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'EAI_AGAIN' ||
        err.code === 'EADDRNOTAVAIL' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ENETUNREACH' ||
        err.code === 'EHOSTUNREACH' ||
        (err.message && (
          err.message.toLowerCase().includes('timeout') ||
          err.message.toLowerCase().includes('eai_again') ||
          err.message.toLowerCase().includes('getaddrinfo')
        ))
      ) {
        // NOTICE:
        // Network timeout/DNS failure during initial bot launch (ETIMEDOUT, ECONNREFUSED, ENOTFOUND, EAI_AGAIN).
        // This occurs when Telegram API is temporarily unreachable or network connection is unstable.
        // Root cause: Network latency, firewall/proxy issues, DNS lookup issues or Telegram API service degradation.
        // We retry with exponential backoff (cap: 3 retries) to handle transient network issues.
        const maxNetworkRetries = 3;
        if (retryCount < maxNetworkRetries) {
          const delay = 5000 + (retryCount * 3000) + Math.random() * 2000;
          console.warn(`[TELEGRAM] Network timeout/connection error on launch (${err.code || 'EAI_AGAIN'}). Retrying in ${Math.round(delay/1000)}s (Attempt ${retryCount + 1}/${maxNetworkRetries})...`);
          setTimeout(() => launchBot(retryCount + 1), delay);
        } else {
          console.error(`[TELEGRAM] Gagal meluncurkan Bot Daemon setelah ${maxNetworkRetries} percobaan ulang untuk network/DNS errors. Error: ${err.message || err.code}. Bot akan tetap dinonaktifkan hingga sistem boot ulang atau konfigurasi diubah.`);
          try { bot.stop(); } catch (e) {}
          if (activeTelegramBot === bot) {
            activeTelegramBot = null;
            activeTelegramToken = null;
          }
        }
      } else {
        console.error("[TELEGRAM] Gagal meluncurkan Bot Daemon:", err);
      }
    }
  };

  // Tentukan apakah kita harus menggunakan mode webhook atau long polling berdasarkan environment Cloud Run
  const wsUrl = settings['connectionWebsocketUrl'] || '';
  let externalUrl = '';
  if (wsUrl && (wsUrl.startsWith('wss://') || wsUrl.startsWith('ws://'))) {
    externalUrl = wsUrl.replace(/^wss?:\/\//, 'https://').replace(/\/ws\/?$/, '');
    if (wsUrl.startsWith('ws://')) {
      externalUrl = wsUrl.replace('ws://', 'http://').replace(/\/ws\/?$/, '');
    }
  }

  // NOTICE: AI Studio development app URLs are protected behind OAuth login (returning 302 for webhook posts).
  // We must map 'ais-dev-' subdomains to public 'ais-pre-' subdomains so that Telegram can post webhooks successfully.
  if (externalUrl.includes('ais-dev-')) {
    externalUrl = externalUrl.replace('ais-dev-', 'ais-pre-');
    console.log(`[TELEGRAM] Mengonversi URL Dev ke URL Publik (Shared) agar terbebas dari halangan OAuth 302: ${externalUrl}`);
  }

  // Jika berjalan di server publik Cloud Run, webhook jauh lebih handal (mencegah container disuspensi)
  let isWebhookDesired = !!externalUrl && 
                         !externalUrl.includes('localhost') && 
                         !externalUrl.includes('127.0.0.1') && 
                         !externalUrl.includes('ais-dev-');

  // Lakukan pre-flight check asinkron untuk memastikan domain publik (pre-release) benar-benar terjangkau dan aktif
  const checkWebhookAndLaunch = async () => {
    if (isWebhookDesired) {
      try {
        console.log(`[TELEGRAM] Menjalankan pre-flight check untuk: ${externalUrl}/api/health`);
        const signal = (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) 
          ? (AbortSignal as any).timeout(3500) 
          : undefined;
        const checkRes = await fetch(`${externalUrl}/api/health`, { method: 'GET', signal });
        if (checkRes.status !== 200) {
          console.warn(`[TELEGRAM] Domain publik terpantau belum aktif (Status: ${checkRes.status}). Mengurungkan Webhook, menggunakan Long Polling.`);
          isWebhookDesired = false;
        }
      } catch (e: any) {
        console.warn(`[TELEGRAM] Domain publik gagal dihubungi (${e.message || e}). Mengurungkan Webhook, menggunakan Long Polling.`);
        isWebhookDesired = false;
      }
    }

    if (isWebhookDesired) {
      console.log(`[TELEGRAM] Mengonfigurasi mode Webhook untuk efisiensi server Cloud Run: ${externalUrl} (dropPending: ${dropPending})`);
      const webhookUrl = `${externalUrl}/api/telegram-webhook`;
      try {
        await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: dropPending });
        console.log(`[TELEGRAM] Webhook berhasil dipasangkan ke: ${webhookUrl}`);
      } catch (webhookErr: any) {
        console.error("[TELEGRAM] Gagal menyusun webhook. Beralih ke Long Polling sebagai cadangan:", webhookErr.message || webhookErr);
        await launchBot();
      }
    } else {
      console.log("[TELEGRAM] Menggunakan mode default Long Polling demi keandalan lingkungan dev/sandbox.");
      await launchBot();
    }
  };

  checkWebhookAndLaunch();

  const shutDown = (sig: string) => {
    try {
      if (activeTelegramBot === bot) {
        console.log(`[TELEGRAM] Menghentikan Bot Daemon sebelum proses keluar (${sig})...`);
        bot.stop(sig);
      }
    } catch (e: any) {
      console.warn(`[TELEGRAM] Catatan: Gagal menghentikan Bot secara aman saat proses keluar: ${e.message || e}`);
    }
  };
  process.once('SIGINT', () => shutDown('SIGINT'));
  process.once('SIGTERM', () => shutDown('SIGTERM'));
}

export function getActiveTelegramBot() {
  return activeTelegramBot;
}
