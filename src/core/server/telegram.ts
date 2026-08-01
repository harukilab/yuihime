import { Telegraf } from "telegraf";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import https from "https";
import fs from "fs/promises";
import path from "path";
import { Kernel } from "../kernel/core.js";
import { MultiChannelQueue } from "../kernel/MultiChannelQueue.js";
import { getDb, deduplicateAndMergeIdentities, retryDbOperation } from "../database.js";
import { getDynamicSandboxRoot, broadcastToWS } from "./apiRouter.js";
import { GlobalOutputDeduplicator } from "../kernel/GlobalOutputDeduplicator.js";
import { extractChannelFileAttachments } from "./channelFileAttachment.js";
import { describeImageFromBuffer } from "../../modules/YuiVisionModule.js";
import { eventBus } from "@shared/core/kernel/event-bus";

async function withDeliveryTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[TELEGRAM_DELIVERY_TIMEOUT] ${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

let db: any = null;

// --- Telegram Bot Daemon ---
export let activeTelegramBot: any = null;
export let activeTelegramToken: string | null = null;

const TELEGRAM_ALLOWED_REACTIONS = new Set([
  '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤨', '😐',
  '😢', '😭', '😡', '🥱', '😱', '🤯', '🤩', '😍', '🤗', '🤔',
  '😅', '😎', '🥳', '💯', '🤝', '✅', '🤡', '🤮', '🥲', '🤤',
  '🤑', '😱'
]);

const DEFAULT_REACTION_EMOJIS = ['❤️', '🔥', '🥰', '👍', '😁'];

function pickRandomReaction(settings: any): string {
  const configured = String(settings?.['telegram_bridge']?.reactionEmojis || '')
    .split(',')
    .map(e => e.trim())
    .filter(e => e && TELEGRAM_ALLOWED_REACTIONS.has(e));
  const pool = configured.length > 0 ? configured : DEFAULT_REACTION_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Pilih reaksi emoji berdasarkan mood/emotion balasan Yui (meta dari NeuralInterface).
 * Fallback ke acak bila meta tidak tersedia.
 */
function emojiForReplyMeta(meta?: any, settings?: any): string {
  const pick = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)];
  const m = meta?.mood || {};
  const e = meta?.emotion || {};

  if ((m.joy ?? 50) >= 65 || ((e.valence ?? 50) >= 65 && (e.rapport ?? 50) >= 55)) {
    return pick(['❤️', '🥰', '😍', '🔥']);
  }
  if ((m.anger ?? 0) >= 40 || (m.irritation ?? 0) >= 45 || (m.stress ?? 0) >= 55) {
    return pick(['😡', '🤨', '😐', '👎']);
  }
  if ((m.sadness ?? 0) >= 40 || (e.valence ?? 50) <= 35) {
    return pick(['😢', '🥲', '🤗', '😭']);
  }
  if ((m.excitement ?? 0) >= 60 || (e.arousal ?? 50) >= 70) {
    return pick(['😁', '🔥', '🤩', '🤯', '🥳']);
  }
  if ((m.embarrassment ?? 0) >= 40) {
    return pick(['😅', '😁', '😎', '🤗']);
  }
  if ((m.curiosity ?? 0) >= 60) {
    return pick(['🤔', '🤨', '✅']);
  }
  return pickRandomReaction(settings);
}

/**
 * Set reaksi emoji pada pesan user. Retry sekali dengan ❤️ bila emoji ditolak API.
 */
async function trySetTelegramReaction(chatId: number | string, messageId: number, emoji: string, botApi: any): Promise<void> {
  try {
    await botApi.callApi('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: emoji as any }]
    });
  } catch (err: any) {
    if (emoji !== '❤️') {
      console.warn(`[TELEGRAM_REACTION] Emoji ${emoji} not supported (${err.message}), falling back to ❤️.`);
      await trySetTelegramReaction(chatId, messageId, '❤️', botApi);
    } else {
      console.warn(`[TELEGRAM_REACTION] ❤️ fallback also failed:`, err.message);
    }
  }
}

// Reaksi emoji cepat yang dipicu segera saat pesan masuk (sebelum pipeline diproses),
// agar pengguna langsung melihat aktivitas Yui dan tidak mengira bot membeku.
function immediateAckReaction(botApi: any, chatId: number | string, messageId: number, settings: any): void {
  const emoji = pickRandomReaction(settings);
  void trySetTelegramReaction(chatId, messageId, emoji, botApi);
}

// Cache reaksi target (chatId + messageId) per contextId agar reaksi tetap bisa
// dipicu saat balasan dikirim langsung via tool speak (jalur dedup-skip).
const pendingReactions = new Map<string, { chatId: number; messageId: number }>();
const PENDING_REACTIONS_MAX = 200;
function rememberPendingReaction(contextId: string, chatId: number, messageId: number) {
  pendingReactions.set(contextId, { chatId, messageId });
  if (pendingReactions.size > PENDING_REACTIONS_MAX) {
    const oldestKey = pendingReactions.keys().next().value;
    if (oldestKey !== undefined) pendingReactions.delete(oldestKey);
  }
}

// Reaksi emosi juga dipicu untuk balasan yang dikirim lewat jalur lain (tool speak),
// sehingga reaksi tidak bergantung pada jalur antrean utama.
eventBus.on('TELEGRAM_REACTION', (data: any) => {
  const { contextId, mood, emotion, sentiment } = data || {};
  const target = contextId ? pendingReactions.get(contextId) : null;
  if (!target) return;
  const bot = activeTelegramBot;
  if (!bot || !bot.telegram) return;
  try {
    const settings = Kernel.getInstance().getSettings().getAll() || {};
    if (settings['telegram_bridge']?.autoAcknowledge === false) return;
    const emoji = emojiForReplyMeta({ mood, emotion, sentiment }, settings);
    void trySetTelegramReaction(target.chatId, target.messageId, emoji, bot.telegram);
  } catch (e) {}
});

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
    db = getDb();
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
      console.warn("[KERNEL] Telegram Bot Token not found in config.toml or UI settings. Bot disabled.");
    } else {
      console.log("[KERNEL] Telegram Bot dinonaktifkan melalui konfigurasi tombol.");
    }
    return;
  }

  // Jika bot sudah berjalan dengan token yang tepat, tidak perlu inisialisasi ulang
  if (activeTelegramBot && activeTelegramToken === botToken && !force) {
    console.log("[TELEGRAM] Bot Daemon already running with the same token.");
    return;
  }

  // Jika ada bot lama, hentikan dulu
  if (activeTelegramBot) {
    console.log("[TELEGRAM] Reconfiguring or detecting Bot Token change. Stopping previous instance...");
    try {
      activeTelegramBot.stop("SIGINT");
    } catch (e) {}
    activeTelegramBot = null;
    (globalThis as any).activeTelegramBot = null;
    activeTelegramToken = null;
  }

  console.log("[TELEGRAM] Starting Bot Daemon with new token...");
  const customApiRoot = settings['telegram_bridge']?.apiRoot;
  const connectTimeout = settings['telegram_bridge']?.connectTimeout || 15000;
  const readTimeout = settings['telegram_bridge']?.readTimeout || 30000;
  const proxyUrl = settings['telegram_bridge']?.proxyUrl || '';
  const botOptions: any = {
    requestTimeout: connectTimeout + readTimeout,
    connectTimeout,
    responseTimeout: readTimeout
  };
  if (customApiRoot && customApiRoot.trim() !== "") {
    console.log(`[TELEGRAM] Menggunakan custom API Root URL: ${customApiRoot}`);
    botOptions.telegram = {
      apiRoot: customApiRoot.trim()
    };
  }
  // Force IPv4 to avoid ETIMEDOUT when the environment lacks a working IPv6 route
  // (Node otherwise prefers the AAAA record and hangs on connect).
  const ipv4Agent = new https.Agent({ family: 4, keepAlive: true, keepAliveMsecs: 10000 });
  botOptions.telegram = botOptions.telegram || {};
  botOptions.telegram.agent = ipv4Agent;
  if (proxyUrl && proxyUrl.trim() !== "") {
    console.log(`[TELEGRAM] Menggunakan proxy: ${proxyUrl}`);
    const proxyAgent = (globalThis as any).process?.env?.HTTPS_PROXY || proxyUrl;
    botOptions.telegram.agent = proxyAgent;
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
        await retryDbOperation(() =>
          db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(matchedRow.code),
          'telegram-delete-expired-pairing-code'
        );
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

      await retryDbOperation(() => 
        db.prepare("UPDATE identities SET linkedAccounts = ? WHERE id = ?").run(
          JSON.stringify(accounts),
          identity.id
        ),
        'telegram-update-identity-accounts'
      );

      // Gabungkan profil duplikat (seperti akun chat mandiri vs akun web)
      try {
        deduplicateAndMergeIdentities(db, identity.id);
      } catch (mergeErr) {
        console.error("[TELEGRAM_PAIR] Failed to merge duplicate identities inline:", mergeErr);
      }

      await retryDbOperation(() =>
        db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(matchedRow.code),
        'telegram-delete-pairing-code-after-merge'
      );

      await retryDbOperation(() =>
        db.prepare("INSERT OR REPLACE INTO telegram_users (tg_id, username, context, last_seen) VALUES (?, ?, ?, ?)")
          .run(ctx.from.id, tgUsername || senderName, `linked_identity:${identity.id}`, Date.now()),
        'telegram-insert-user'
      );

      const memoryId = Math.random().toString(36).substr(2, 9);
      await retryDbOperation(() =>
        db.prepare(`
          INSERT INTO memories (id, type, content, importance, speaker, context, timestamp)
          VALUES (?, 'system', ?, 0.9, 'System', ?, ?)
        `).run(
          memoryId,
          `[SYSTEM_LINK]: Pengguna Telegram ${senderName} (tg_id: ${ctx.from.id}) berhasil dipasangkan dengan identitas Web: ${identity.perceivedName}.`,
          `tg_${ctx.chat.id}`,
          Date.now()
        ),
        'telegram-insert-system-memory'
      );

      return ctx.reply(`✨ Kognisi Terhubung! Hubungan lintas-platform berhasil dikaitkan.\n\nAkun Telegram kamu (${senderName}) sekarang terhubung dengan sesi Web (${identity.perceivedName}). Yuihime is now aware of your cross-platform presence.`);
    } catch (err: any) {
      console.error("[TELEGRAM_PAIR] Failed to link account:", err);
      return ctx.reply("❌ Terjadi kesalahan internal saat memproses penyandingan.");
    }
  }

  bot.start(async (ctx) => {
    ctx.reply("System Online. Neural Link established with Yuihime Core. How can I assist you today?");
    await retryDbOperation(() =>
      db.prepare("INSERT OR IGNORE INTO telegram_users (tg_id, username, last_seen) VALUES (?, ?, ?)")
        .run(ctx.from.id, ctx.from.username, Date.now()),
      'telegram-insert-user-start'
    );
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
        const downloadController = new AbortController();
        const downloadTimeout = setTimeout(() => downloadController.abort(), 45000);
        try {
          const resFile = await fetch(fileUrl, { signal: downloadController.signal });
          if (resFile.ok) {
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
        } finally {
          clearTimeout(downloadTimeout);
        }
      }
    } catch (attachmentErr: any) {
      console.error("[TELEGRAM_ATTACHMENT] Failed to retrieve or save attachment:", attachmentErr.message || attachmentErr);
    }

    let quoteInfo = "";
    try {
      const replyTo = (ctx.message as any).reply_to_message;
      if (replyTo) {
        const quotedFrom = replyTo.from?.username || replyTo.from?.first_name || "User";
        const quotedText = replyTo.text || replyTo.caption || "[Attachment/Non-text message]";
        quoteInfo = `\n\n[SYSTEM_QUOTE_CONTEXT]: You are replying to a quoted message in the chat history:\n- Quoted Message Author: ${quotedFrom}\n- Quoted Content: "${quotedText}"`;
      }
    } catch (_) {}

    const userMessage = rawInput + attachmentInfo + quoteInfo;

    if (!userMessage.trim()) return;

    // Immediate acknowledgment if enabled — typing indicator only, reaksi emoji dipicu saat balasan dikirim
    if (currentSettings['telegram_bridge']?.autoAcknowledge !== false) {
      ctx.sendChatAction('typing').catch(() => {});
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

      console.log(`[TELEGRAM] Pesan masuk dari ${senderName} (${contextId}): ${rawInput.substring(0, 200)}`);

      // FILTER UNTUK GROUP CHAT: Hanya merespons jika di-mention (@username), membalas pesan bot, atau merupakan chat privat.
      if (isGroup) {
        const botInfo = ctx.botInfo;
        const botUsername = botInfo?.username ? botInfo.username.toLowerCase() : "";
        const lowerInput = rawInput.toLowerCase();
        
        const isMentioned = botUsername && (lowerInput.includes(`@${botUsername}`) || lowerInput.includes("yui"));
        const isReplyToBot = (ctx.message as any).reply_to_message?.from?.id === ctx.botInfo?.id;
        
        if (!isMentioned && !isReplyToBot) {
          // Abaikan pesan jika tidak memicu bot di grup
          console.log(`[TELEGRAM_GROUP] Ignoring message from group "${chatTitle}" — not tagged/mentioned.`);
          return;
        }
      }

      // Reaksi emoji langsung saat pesan masuk (fire-and-forget) agar tidak terlihat beku
      if (currentSettings['telegram_bridge']?.autoAcknowledge !== false) {
        immediateAckReaction(ctx.telegram, ctx.chat.id, ctx.message.message_id, currentSettings);
      }

      // Broadcast the incoming remote Telegram message to connected WebClients
      broadcastToWS({
        type: "remote_message_received",
        data: {
          senderName,
          message: userMessage,
          channel: chatType,
          contextId
        }
      });

       // Simpan target reaksi (chatId + messageId) agar event TELEGRAM_REACTION
       // dari jalur speak-langsung (dedup-skip) tetap tahu kemana harus bereaksi.
       rememberPendingReaction(contextId, ctx.chat.id, ctx.message.message_id);

       MultiChannelQueue.getInstance().addMessage(
         userMessage,
         senderName,
         contextId,
         chatType,
          async (response, meta) => {
            if (response && String(response).trim()) {
              const dedup = GlobalOutputDeduplicator.getInstance();
              if (dedup.isDuplicate(response, contextId)) {
                console.log(`[GLOBAL_DEDUP] Skipping duplicate Telegram reply for ${senderName} (${contextId}).`);
                // Balasan sudah dikirim langsung (mis. via tool speak). Tetap picu reaksi emosi.
                if (currentSettings['telegram_bridge']?.autoAcknowledge !== false) {
                  void trySetTelegramReaction(ctx.chat.id, ctx.message.message_id, emojiForReplyMeta(meta, currentSettings), ctx.telegram);
                }
              } else {
                dedup.markSent(response, contextId);
                try {
                  const sentAsFile = await withDeliveryTimeout(() => trySendFileAttachment(ctx, response), 10000, 'file-attachment');
                  if (!sentAsFile) {
                    await withDeliveryTimeout(() => ctx.reply(response), 15000, 'telegram-reply');
                  }
                  console.log(`[TELEGRAM_DELIVERY] Reply sent to ${senderName} (${contextId}), len=${String(response).length}`);
                } catch (sendErr: any) {
                  console.error(`[TELEGRAM_DELIVERY_ERR] Failed to send reply to ${senderName}:`, sendErr?.message || sendErr);
                  try {
                    await withDeliveryTimeout(() => ctx.reply(String(response).slice(0, 3500)), 10000, 'telegram-reply-retry');
                  } catch (retryErr: any) {
                    console.error(`[TELEGRAM_DELIVERY_ERR] Retry also failed:`, retryErr?.message || retryErr);
                  }
                }

                // Reaksi emoji dipilih berdasarkan emosi/mood balasan Yui (fallback random)
                if (currentSettings['telegram_bridge']?.autoAcknowledge !== false) {
                  void trySetTelegramReaction(ctx.chat.id, ctx.message.message_id, emojiForReplyMeta(meta, currentSettings), ctx.telegram);
                }
              }

             // Broadcast Yui's response to the connected WebClients
             try {
               broadcastToWS({
                 type: "remote_response_sent",
                 data: {
                   reply: response,
                   channel: chatType,
                   contextId
                 }
               });
             } catch (_) {}
           } else {
             console.warn(`[TELEGRAM_DELIVERY] Empty response for ${senderName} (${contextId}) — nothing to send.`);
           }
          // Update last seen (use UPSERT to preserve pairing context mapping from being overwritten to NULL on incoming messages)
          try {
            db.prepare(`
              INSERT INTO telegram_users (tg_id, username, last_seen)
              VALUES (?, ?, ?)
              ON CONFLICT(tg_id) DO UPDATE SET
                username = excluded.username,
                last_seen = excluded.last_seen
            `).run(tgUserId, ctx.from.username || senderName, Date.now());
          } catch (dbErr: any) {
            console.warn(`[TELEGRAM] Failed to update last_seen for ${tgUserId}:`, dbErr?.message || dbErr);
          }
        },
        async (err) => {
          console.error("[TELEGRAM_QUEUE] Failed to process message:", err);
          try {
            if (err.code !== 403 && err.code !== 400) {
              const dedup = GlobalOutputDeduplicator.getInstance();
              const errorMsg = "[SYSTEM ERROR] Sinkronisasi neural terganggu dalam antrean.";
              if (!dedup.isDuplicate(errorMsg, contextId)) {
                dedup.markSent(errorMsg, contextId);
                await ctx.reply(errorMsg);
              }
            }
          } catch (e) {}
        }
      );
    } catch (error: any) {
       console.error("Bot Error:", error);
       try {
         if (error.code !== 403 && error.code !== 400) {
           const dedup = GlobalOutputDeduplicator.getInstance();
           const errorMsg = "[SYSTEM ERROR] Neural Sync Interrupted.";
           const fallbackKey = (ctx as any)?.chat?.id ? String((ctx as any).chat.id) : 'bot_global_error';
           if (!dedup.isDuplicate(errorMsg, fallbackKey)) {
             dedup.markSent(errorMsg, fallbackKey);
             await ctx.reply(errorMsg);
           }
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

async function trySendFileAttachment(ctx: any, responseText: string): Promise<boolean> {
     try {
       const sandboxDir = getDynamicSandboxRoot();
       const { attachments, remainingText } = await extractChannelFileAttachments(responseText, sandboxDir);

       if (attachments.length === 0) return false;

       let sentAny = false;
       for (let i = 0; i < attachments.length; i++) {
         const att = attachments[i];
         const isFirstImage = i === 0 && att.isImage;
         if (att.isImage) {
           if (isFirstImage && remainingText) {
             await withDeliveryTimeout(() => ctx.replyWithPhoto({ source: att.safePath }, { caption: remainingText }), 10000, 'telegram-photo');
           } else {
             await withDeliveryTimeout(() => ctx.replyWithPhoto({ source: att.safePath }), 10000, 'telegram-photo');
           }
         } else {
           await withDeliveryTimeout(() => ctx.replyWithDocument({ source: att.safePath }), 10000, 'telegram-document');
         }
         sentAny = true;
       }

       return sentAny;
     } catch (e) {
       console.warn("[TELEGRAM_FILE] Failed to send file attachment from response:", e);
     }
     return false;
   }

  const launchBot = async (retryCount = 0) => {
    if (activeTelegramBot !== bot) return; // Instansi sudah digantikan
    try {
      console.log(`[TELEGRAM] Attempting launch (Retry: ${retryCount}, dropPending: ${dropPending})...`);
      
      // Hapus webhook aktif yang mungkin tertinggal untuk menghindari 409 Conflict secara tuntas!
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: retryCount > 0 || dropPending });
        console.log("[TELEGRAM] Webhook successfully cleared before launch.");
      } catch (webhookErr: any) {
        console.warn("[TELEGRAM] Note: Failed to delete webhook (safe to ignore if no active webhook):", webhookErr.message || webhookErr);
      }

      await bot.launch({
        dropPendingUpdates: retryCount > 0 || dropPending
      });
      console.log("[TELEGRAM] Bot Daemon listening successfully via Long Polling...");
    } catch (err: any) {
      if (err.message && (err.message.includes("401") || err.message.includes("unauthorized"))) {
        console.error("[TELEGRAM] Failed to verify Bot Token: Invalid/unauthorized or expired token. Bot disabled!");
        try { bot.stop(); } catch (e) {}
        if (activeTelegramBot === bot) {
          activeTelegramBot = null;
          activeTelegramToken = null;
        }
      } else if (err.code === 409) {
        const maxConflictRetries = settings['telegram_bridge']?.maxRetries || 5;
        if (retryCount < maxConflictRetries) {
          const delay = 10000 + (retryCount * 5000) + Math.random() * 5000;
          console.warn(`[TELEGRAM] Conflict on launch. Retrying in ${Math.round(delay/1000)}s (Attempt ${retryCount + 1}/${maxConflictRetries})...`);
          setTimeout(() => launchBot(retryCount + 1), delay);
        } else {
          console.error(`[TELEGRAM] Failed to launch Bot Daemon after ${maxConflictRetries} attempts due to 409 Conflict. Check if another bot instance is running with the same token.`);
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
        err.code === 'ECONNABORTED' ||
        (err.message && (
          err.message.toLowerCase().includes('timeout') ||
          err.message.toLowerCase().includes('eai_again') ||
          err.message.toLowerCase().includes('getaddrinfo')
        ))
      ) {
        const maxNetworkRetries = settings['telegram_bridge']?.maxRetries || 5;
        if (retryCount < maxNetworkRetries) {
          const delay = 5000 + (retryCount * 3000) + Math.random() * 2000;
          console.warn(`[TELEGRAM] Network timeout/connection error on launch (${err.code || 'UNKNOWN'}). Retrying in ${Math.round(delay/1000)}s (Attempt ${retryCount + 1}/${maxNetworkRetries})...`);
          setTimeout(() => launchBot(retryCount + 1), delay);
        } else {
          console.error(`[TELEGRAM] Failed to launch Bot Daemon after ${maxNetworkRetries} retries for network/DNS errors. Error: ${err.message || err.code}. Bot will remain disabled until system restart or config change.`);
          try { bot.stop(); } catch (e) {}
          if (activeTelegramBot === bot) {
            activeTelegramBot = null;
            activeTelegramToken = null;
          }
        }
      } else {
        console.error("[TELEGRAM] Failed to launch Bot Daemon:", err);
      }
    }
  };

  // Tentukan apakah kita harus menggunakan mode webhook atau long polling berdasarkan environment Cloud Run
  const wsUrl = settings['connectionWebsocketUrl'] || '';
  let externalUrl = '';
  if (wsUrl.startsWith('wss://')) {
    externalUrl = wsUrl.replace(/^wss:\/\//, 'https://').replace(/\/ws\/?$/, '');
  } else if (wsUrl.startsWith('ws://')) {
    externalUrl = wsUrl.replace(/^ws:\/\//, 'http://').replace(/\/ws\/?$/, '');
  }

  // NOTICE: AI Studio development app URLs are protected behind OAuth login (returning 302 for webhook posts).
  // We must map 'ais-dev-' subdomains to public 'ais-pre-' subdomains so that Telegram can post webhooks successfully.
  if (externalUrl.includes('ais-dev-')) {
    externalUrl = externalUrl.replace('ais-dev-', 'ais-pre-');
    console.log(`[TELEGRAM] Mengonversi URL Dev ke URL Publik (Shared) agar terbebas dari halangan OAuth 302: ${externalUrl}`);
  }

  // Jika berjalan di server publik Cloud Run, webhook jauh lebih handal (mencegah container disuspensi)
  let isWebhookDesired = !!externalUrl && 
                       externalUrl.startsWith('https://') &&
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
        console.warn(`[TELEGRAM] Public domain unreachable (${e.message || e}). Cancelling Webhook, switching to Long Polling.`);
        isWebhookDesired = false;
      }
    }

    if (isWebhookDesired) {
      console.log(`[TELEGRAM] Mengonfigurasi mode Webhook untuk efisiensi server Cloud Run: ${externalUrl} (dropPending: ${dropPending})`);
      const webhookUrl = `${externalUrl}/api/telegram-webhook`;
      try {
        await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: dropPending });
        console.log(`[TELEGRAM] Webhook successfully attached to: ${webhookUrl}`);
      } catch (webhookErr: any) {
        console.error("[TELEGRAM] Failed to set up webhook. Falling back to Long Polling:", webhookErr.message || webhookErr);
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
