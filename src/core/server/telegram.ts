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
import { handleTgQuickCommand, handleTgCallback } from "../../drivers/tools/telegram_quick_tools.js";
import { resolveAskCallback } from "../kernel/tgAskChoice.js";
import { recordOutboundMessage, recordFeedback, lookupOutboundMessage, emojiToReward } from "../feedback.js";
import { genId } from '@shared/core/idGen';

async function withDeliveryTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[TELEGRAM_DELIVERY_TIMEOUT] ${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

let db: any = null;

// ── Chat cleaning (auto-delete: user "/" commands + bot replies after TTL) ──
const pendingDeletes = new Set<NodeJS.Timeout>();

function cleanTgSettings() {
  try {
    const s = Kernel.getInstance().getSettings().getAll();
    const qt = s?.['telegram_quick_tools'] || {};
    return { enabled: qt?.cleanChat !== false, ttlSec: Number(qt?.cleanTtlSec) || 300 };
  } catch {
    return { enabled: true, ttlSec: 300 };
  }
}

function scheduleAutoDelete(bot: any, chatId: number | string, messageId: number, ttlSec: number) {
  if (!bot?.telegram || !chatId || !messageId || !ttlSec || ttlSec <= 0) return;
  const timer = setTimeout(() => {
    pendingDeletes.delete(timer);
    bot.telegram.deleteMessage(chatId, messageId).catch(() => {});
  }, ttlSec * 1000);
  pendingDeletes.add(timer);
  timer.unref?.();
}

function maybeDeleteUserCommand(ctx: any) {
  const { enabled } = cleanTgSettings();
  if (!enabled || !ctx?.message?.message_id) return;
  try {
    ctx.deleteMessage().catch(() => {});
  } catch (_) {}
}

function scheduleCleanup(bot: any, ctx: any, sent: any, hasKeyboard: boolean) {
  if (hasKeyboard) return; // menus stay until manual ✖️ Close
  const { enabled, ttlSec } = cleanTgSettings();
  if (!enabled || !bot || !ctx?.chat?.id || !sent?.message_id) return;
  scheduleAutoDelete(bot, ctx.chat.id, sent.message_id, ttlSec);
}

// --- Persistent crash-recovery dedup (across restart) ---
// Telegram resends unacknowledged offset update batches when the daemon restarts.
// update_id already fully processed is recorded in the telegram_update_ids table
// so it isn't processed/replied twice after restart.
function isTelegramUpdateProcessed(updateId: number | undefined): boolean {
  if (!updateId || !db) return false;
  try {
    const row = db.prepare("SELECT 1 FROM telegram_update_ids WHERE update_id = ?").get(updateId);
    return !!row;
  } catch (e) {
    return false;
  }
}

function recordTelegramUpdateProcessed(updateId: number | undefined, chatId: number | string, messageId: number): void {
  if (!updateId || !db) return;
  try {
    db.prepare("INSERT OR IGNORE INTO telegram_update_ids (update_id, processed_at, chat_id, message_id) VALUES (?, ?, ?, ?)")
      .run(updateId, Date.now(), chatId, messageId);
  } catch (e: any) {
    console.warn("[TELEGRAM_DEDUP] Failed to record processed update:", e.message || e);
  }
}

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
 * Choose an emoji reaction based on Yui's reply mood/emotion (meta from NeuralInterface).
 * Fallback to random when meta is unavailable.
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
 * Set emoji reaction on user message. Retry once with ❤️ when the emoji is rejected by the API.
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

// Quick emoji reaction triggered immediately when a message arrives (before the pipeline processes it),
// so the user immediately sees Yui's activity and doesn't think the bot is frozen.
function immediateAckReaction(botApi: any, chatId: number | string, messageId: number, settings: any): void {
  const emoji = pickRandomReaction(settings);
  void trySetTelegramReaction(chatId, messageId, emoji, botApi);
}

// Cache reaction target (chatId + messageId) per contextId so the reaction can still
// be triggered when the reply is sent directly via tool speak (dedup-skip path).
const pendingReactions = new Map<string, { chatId: number; messageId: number }>();
const PENDING_REACTIONS_MAX = 200;
function rememberPendingReaction(contextId: string, chatId: number, messageId: number) {
  pendingReactions.set(contextId, { chatId, messageId });
  if (pendingReactions.size > PENDING_REACTIONS_MAX) {
    const oldestKey = pendingReactions.keys().next().value;
    if (oldestKey !== undefined) pendingReactions.delete(oldestKey);
  }
}

// Manual retry support: when the whole LLM pool fails and Yui sends the offline
// fallback message, remember the original user message per contextId so a tap on
// the "Retry" button can re-run the ENTIRE previous process (same message).
const fallbackRetryCache = new Map<string, { input: string; senderName: string; contextId: string; chatType: string; chatId: number; sourceMessageId: number }>();
const FALLBACK_RETRY_MAX = 100;
function rememberFallbackRetry(contextId: string, entry: { input: string; senderName: string; contextId: string; chatType: string; chatId: number; sourceMessageId: number }) {
  fallbackRetryCache.set(contextId, entry);
  if (fallbackRetryCache.size > FALLBACK_RETRY_MAX) {
    const oldestKey = fallbackRetryCache.keys().next().value;
    if (oldestKey !== undefined) fallbackRetryCache.delete(oldestKey);
  }
}

// Emotional reaction is also triggered for replies sent through other paths (tool speak),
// so the reaction doesn't depend on the main queue path.
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
      console.log("[TELEGRAM] Bot disabled or Token empty. Stopping active Bot Daemon...");
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
      console.log("[KERNEL] Telegram Bot disabled via configuration toggle.");
    }
    return;
  }

  // If the bot is already running with the correct token, no re-init is needed
  if (activeTelegramBot && activeTelegramToken === botToken && !force) {
    console.log("[TELEGRAM] Bot Daemon already running with the same token.");
    return;
  }

  // If there is an old bot running, stop it first
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
    console.log(`[TELEGRAM] Using custom API Root URL: ${customApiRoot}`);
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
    console.log(`[TELEGRAM] Using proxy: ${proxyUrl}`);
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
      return ctx.reply("❌ Wrong code format. The OTP code must be a 6-digit number.");
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
        return ctx.reply("❌ The OTP code is invalid or has expired. Please generate a new code in the Web UI.");
      }

      if (matchedRow.expires_at < Date.now()) {
        await retryDbOperation(() =>
          db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(matchedRow.code),
          'telegram-delete-expired-pairing-code'
        );
        return ctx.reply("❌ This OTP code has expired. Please generate a new code in the Web UI.");
      }

      const identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(matchedRow.identity_id);
      if (!identity) {
        return ctx.reply("❌ The source Web identity was not found in the system.");
      }

      const senderName = ctx.from.first_name || 'user';
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

      // Merge duplicate profiles (e.g., standalone chat account vs web account)
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

      const memoryId = genId(9);
      await retryDbOperation(() =>
        db.prepare(`
          INSERT INTO memories (id, type, content, importance, speaker, context, timestamp)
          VALUES (?, 'system', ?, 0.9, 'System', ?, ?)
        `).run(
          memoryId,
          `[SYSTEM_LINK]: Telegram user ${senderName} (tg_id: ${ctx.from.id}) successfully paired with Web identity: ${identity.perceivedName}.`,
          `tg_${ctx.chat.id}`,
          Date.now()
        ),
        'telegram-insert-system-memory'
      );

      return ctx.reply(`✨ Cognition Connected! Cross-platform link successfully established.\n\nYour Telegram account (${senderName}) is now linked with the Web session (${identity.perceivedName}). Yuihime is now aware of your cross-platform presence.`);
    } catch (err: any) {
      console.error("[TELEGRAM_PAIR] Failed to link account:", err);
      return ctx.reply("❌ Internal error occurred while processing the pairing.");
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
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply("Please include a 6-digit OTP code. Example: /pair 482103");
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    maybeDeleteUserCommand(ctx);
    await handlePairingCode(ctx, args[1].trim());
  });

  bot.command("approve", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply("Please include a request ID. Example: /approve A8F2D1");
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    const id = args[1].trim().toUpperCase();
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply(`❌ Confirmation request with ID "${id}" not found.`);
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    item.status = 'approved';
    maybeDeleteUserCommand(ctx);
    const sent = await ctx.reply(`✅ Request ${id} (${item.action} -> ${item.targetPath}) APPROVED SUCCESSFULLY.`);
    scheduleCleanup(activeTelegramBot, ctx, sent, false);
  });

  bot.command("always", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply("Please include a request ID. Example: /always A8F2D1");
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    const id = args[1].trim().toUpperCase();
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply(`❌ Confirmation request with ID "${id}" not found.`);
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    item.status = 'always';
    maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply(`✅ Request ${id} APPROVED SUCCESSFULLY. "Always Acc" mode enabled for this session.`);
    scheduleCleanup(activeTelegramBot, ctx, sent, false);
  });

  bot.command("deny", async (ctx) => {
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply("Please include a request ID. Example: /deny A8F2D1");
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    const id = args[1].trim().toUpperCase();
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      maybeDeleteUserCommand(ctx);
      const sent = await ctx.reply(`❌ Confirmation request with ID "${id}" not found.`);
      scheduleCleanup(activeTelegramBot, ctx, sent, false);
      return;
    }
    item.status = 'denied';
    maybeDeleteUserCommand(ctx);
    const sent = await ctx.reply(`❌ Request ${id} (${item.action} -> ${item.targetPath}) DENIED SUCCESSFULLY.`);
    scheduleCleanup(activeTelegramBot, ctx, sent, false);
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
              return ctx.reply(`✅ Request ${foundId} (${item.action} -> ${item.targetPath}) APPROVED SUCCESSFULLY.`);
            } else if (isAlways) {
              item.status = 'always';
              return ctx.reply(`✅ Request ${foundId} APPROVED SUCCESSFULLY. "Always Acc" mode enabled.`);
            } else if (isDeny) {
              item.status = 'denied';
              return ctx.reply(`❌ Request ${foundId} (${item.action} -> ${item.targetPath}) DENIED SUCCESSFULLY.`);
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
    const senderName = ctx.from.first_name || 'user';

    // ── Telegram Quick Toolkit: "/" commands processed directly without LLM ──
    if (rawInput.trim().startsWith('/')) {
      const quickSettings = Kernel.getInstance().getSettings().getAll();
      if (quickSettings['telegram_quick_tools']?.enabled !== false) {
        const quickResult = await handleTgQuickCommand(rawInput, {
          ctx,
          db,
          settings: quickSettings,
          bot: activeTelegramBot,
          startedAt: Date.now()
        });
        if (quickResult.handled) {
          maybeDeleteUserCommand(ctx);
          if (quickResult.reply?.text) {
            try {
              const sent = await ctx.reply(quickResult.reply.text, { reply_markup: quickResult.reply.keyboard });
              scheduleCleanup(activeTelegramBot, ctx, sent, !!quickResult.reply.keyboard);
            } catch (sendErr: any) {
              console.warn("[TELEGRAM_QUICK_TOOLS] Failed to send quick command reply:", sendErr?.message || sendErr);
            }
          }
          return;
        }
      }
    }

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

    // Immediate acknowledgment if enabled — typing indicator only, emoji reaction triggered when the reply is sent
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

      console.log(`[TELEGRAM] Incoming message from ${senderName} (${contextId}): ${rawInput.substring(0, 200)}`);

      // GROUP CHAT FILTER: Only respond when mentioned (@username), replying to the bot's message, or a private chat.
      if (isGroup) {
        const botInfo = ctx.botInfo;
        const botUsername = botInfo?.username ? botInfo.username.toLowerCase() : "";
        const lowerInput = rawInput.toLowerCase();
        
        const isMentioned = botUsername && (lowerInput.includes(`@${botUsername}`) || lowerInput.includes("yui"));
        const isReplyToBot = (ctx.message as any).reply_to_message?.from?.id === ctx.botInfo?.id;
        
        if (!isMentioned && !isReplyToBot) {
          // Ignore the message if it doesn't trigger the bot in the group
          console.log(`[TELEGRAM_GROUP] Ignoring message from group "${chatTitle}" — not tagged/mentioned.`);
          return;
        }
      }

      // Immediate emoji reaction on incoming message (fire-and-forget) so it doesn't look frozen
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

       // Store the reaction target (chatId + messageId) so the TELEGRAM_REACTION event
       // from the speak-direct (dedup-skip) path still knows where to react.
       rememberPendingReaction(contextId, ctx.chat.id, ctx.message.message_id);

       // Persistent dedup: updates fully processed before a crash must not be
       // reprocessed when Telegram resends the batch after restart.
       const tgUpdateId = ctx.update?.update_id;
       if (tgUpdateId && isTelegramUpdateProcessed(tgUpdateId)) {
         console.log(`[TELEGRAM_DEDUP] Update ${tgUpdateId} already processed (post-restart re-delivery). Skipping.`);
         return;
       }

       MultiChannelQueue.getInstance().addMessage(
         userMessage,
         senderName,
         contextId,
         chatType,
           async (response, meta) => {
            if (response && String(response).trim()) {
              // NOTE: dedup against GlobalOutputDeduplicator is already run by
              // MultiChannelQueue right before calling this callback. A re-check here
              // is ALWAYS true because the queue already marked the same content
              // (markSent) — so ALL Telegram replies were silently dropped.
              // Therefore: send directly, then mark ONLY after successful delivery.
               const dedup = GlobalOutputDeduplicator.getInstance();
               const replyOpts: any = { reply_to_message_id: ctx.message.message_id };
               // When the whole LLM pool failed (offline fallback message), attach a
               // "Retry" button and remember the original user message so tapping it
               // re-runs the ENTIRE previous process (same message, full pipeline).
               if (meta?.fallbackTriggered) {
                 replyOpts.reply_markup = {
                   inline_keyboard: [[{ text: "🔄 Retry", callback_data: `yui_retry:${contextId}` }]]
                 };
                 rememberFallbackRetry(contextId, {
                   input: userMessage,
                   senderName,
                   contextId,
                   chatType,
                   chatId: ctx.chat.id,
                   sourceMessageId: ctx.message.message_id
                 });
                 console.log(`[TELEGRAM_RETRY] Offline fallback reply for ${senderName} (${contextId}) carries a Retry button.`);
               }
               try {
                const sentAsFile = await withDeliveryTimeout(() => trySendFileAttachment(ctx, response, { contextId, channel: chatType }), 10000, 'file-attachment');
                if (!sentAsFile) {
                  const sentMsg = await withDeliveryTimeout(() => ctx.reply(response, replyOpts), 15000, 'telegram-reply');
                  if (sentMsg?.message_id) {
                    recordOutboundMessage(sentMsg.message_id, contextId, chatType, String(response));
                  }
                }
                dedup.markSent(response, contextId);
                console.log(`[TELEGRAM_DELIVERY] Reply sent to ${senderName} (${contextId}), len=${String(response).length}`);
                // Mark the update as fully processed (cross-restart dedup) ONLY after successful delivery.
                recordTelegramUpdateProcessed(tgUpdateId, ctx.chat.id, ctx.message.message_id);
              } catch (sendErr: any) {
                console.error(`[TELEGRAM_DELIVERY_ERR] Failed to send reply to ${senderName}:`, sendErr?.message || sendErr);
                try {
                  const sentMsg2 = await withDeliveryTimeout(() => ctx.reply(String(response).slice(0, 3500), replyOpts), 10000, 'telegram-reply-retry');
                  if (sentMsg2?.message_id) {
                    recordOutboundMessage(sentMsg2.message_id, contextId, chatType, String(response));
                    recordTelegramUpdateProcessed(tgUpdateId, ctx.chat.id, ctx.message.message_id);
                    dedup.markSent(response, contextId);
                  }
                } catch (retryErr: any) {
                  console.error(`[TELEGRAM_DELIVERY_ERR] Retry also failed:`, retryErr?.message || retryErr);
                }
              }

              // Emoji reaction chosen based on Yui's reply emotion/mood (fallback random)
              if (currentSettings['telegram_bridge']?.autoAcknowledge !== false) {
                void trySetTelegramReaction(ctx.chat.id, ctx.message.message_id, emojiForReplyMeta(meta, currentSettings), ctx.telegram);
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
              const errorMsg = "[SYSTEM ERROR] Neural synchronization was interrupted in the queue.";
              if (!dedup.isDuplicate(errorMsg, contextId)) {
                dedup.markSent(errorMsg, contextId);
                await ctx.reply(errorMsg);
              }
            }
          } catch (e) {}
        },
        {
          chatId: String(ctx.chat.id),
          sourceMessageId: ctx.message.message_id,
          updateId: tgUpdateId
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

  // ── Closed-loop Feedback: capture user reactions to Yui's messages (Telegram) ──
  bot.on('message_reaction', (ctx) => {
    try {
      const mr: any = ctx.update?.message_reaction || {};
      const messageId = mr.message_id;
      const userId = mr.user?.id || mr.actor_chat?.id;
      if (!messageId || !userId) return;

      const outbound = lookupOutboundMessage(messageId);
      if (!outbound) return; // not Yui's outgoing message being recorded

      const oldEmojis = new Set((mr.old_reaction || []).map((r: any) => r.emoji).filter(Boolean));
      const newEmojis = (mr.new_reaction || []).map((r: any) => r.emoji).filter(Boolean);
      const added = newEmojis.filter(e => !oldEmojis.has(e));

      for (const emoji of added) {
        const reward = emojiToReward(emoji);
        if (reward === 0) continue;
        const recorded = recordFeedback({
          source: 'telegram',
          messageId,
          contextId: outbound.context_id,
          channel: outbound.channel,
          content: outbound.content,
          reward
        });
        if (recorded) {
          console.log(`[FEEDBACK_CAPTURE] ${userId} reacted ${emoji} (reward ${reward}) on msg ${messageId}`);
        }
      }
    } catch (err: any) {
      console.warn('[FEEDBACK_CAPTURE] Failed to process reaction:', err?.message || err);
    }
  });

  bot.on('callback_query', async (ctx) => {
    try {
      const data = (ctx.callbackQuery as any)?.data || '';
      if (data && data.startsWith('confirm:')) {
        await ctx.answerCbQuery().catch(() => {});
        const [_, decision, id] = data.split(':');
        const pendingId = (id || '').toUpperCase();
        const list = globalThis.pendingConfirmations || [];
        const item = list.find(i => i.id === pendingId && i.status === 'pending');
        if (!item) {
          try { await ctx.editMessageText('❌ Confirmation is no longer active / not found.'); } catch (_) {}
          return;
        }
        if (decision === 'approve') {
          item.status = 'approved';
          try {
            await ctx.editMessageText(`✅ Request ${pendingId} (${item.action} -> ${item.targetPath}) APPROVED.`, { reply_markup: undefined });
          } catch (_) {}
        } else if (decision === 'always') {
          item.status = 'always';
          try {
            await ctx.editMessageText(`🔁 Request ${pendingId} APPROVED ALWAYS for this session.`, { reply_markup: undefined });
          } catch (_) {}
        } else if (decision === 'deny') {
          item.status = 'denied';
          try {
            await ctx.editMessageText(`❌ Request ${pendingId} (${item.action} -> ${item.targetPath}) DENIED.`, { reply_markup: undefined });
          } catch (_) {}
        }
        return;
      }
      // Manual retry button from an offline fallback message: re-run the ENTIRE
      // previous process with the same original user message.
      if (data && data.startsWith('yui_retry:')) {
        await ctx.answerCbQuery('Retrying your previous message...').catch(() => {});
        const retryContextId = data.slice('yui_retry:'.length);
        const cached = retryContextId ? fallbackRetryCache.get(retryContextId) : null;
        if (!cached) {
          try {
            await ctx.answerCbQuery('Retry session expired. Please send your message again.').catch(() => {});
            await ctx.editMessageText('❌ Retry session expired. Please send your message again.', { reply_markup: undefined });
          } catch (_) {}
          return;
        }
        fallbackRetryCache.delete(retryContextId);
        try { await ctx.editMessageText('🔄 Retrying your previous message...', { reply_markup: undefined }); } catch (_) {}
        MultiChannelQueue.getInstance().addMessage(
          cached.input,
          cached.senderName,
          cached.contextId,
          cached.chatType,
          async (retryResponse, retryMeta) => {
            if (!retryResponse || !String(retryResponse).trim()) return;
            try {
              const retryReplyOpts: any = { reply_to_message_id: cached.sourceMessageId };
              if (retryMeta?.fallbackTriggered) {
                retryReplyOpts.reply_markup = {
                  inline_keyboard: [[{ text: "🔄 Retry", callback_data: `yui_retry:${cached.contextId}` }]]
                };
                rememberFallbackRetry(cached.contextId, cached);
              }
              await ctx.telegram.sendMessage(cached.chatId, String(retryResponse), retryReplyOpts);
              console.log(`[TELEGRAM_RETRY] Manual retry reply delivered to ${cached.senderName} (${cached.contextId}).`);
            } catch (retrySendErr: any) {
              console.error(`[TELEGRAM_RETRY_ERR] Manual retry delivery failed:`, retrySendErr?.message || retrySendErr);
            }
          },
          undefined,
          { chatId: String(cached.chatId), sourceMessageId: cached.sourceMessageId }
        );
        return;
      }
      if (!data || !data.startsWith('qt:')) return;
      await ctx.answerCbQuery().catch(() => {});
      if (data.startsWith('qt:ask:')) {
        const handled = resolveAskCallback(data, async (text, clearKeyboard) => {
          try {
            await ctx.editMessageText(text, { reply_markup: clearKeyboard ? { inline_keyboard: [] } : undefined });
          } catch (_) {}
        });
        if (handled) return;
      }
      const currentSettings = Kernel.getInstance().getSettings().getAll();
      if (currentSettings['telegram_quick_tools']?.enabled === false) return;
      const result = await handleTgCallback(data, {
        ctx,
        db,
        settings: currentSettings,
        bot: activeTelegramBot
      });
      if (!result) return;
      if (result.action === 'close') {
        try { await ctx.deleteMessage(); } catch (_) {}
        return;
      }
      try {
        await ctx.editMessageText(result.text, { reply_markup: result.keyboard });
      } catch (editErr: any) {
        console.warn("[TELEGRAM_QUICK_TOOLS] Callback edit failed, replying instead:", editErr?.message || editErr);
        try { await ctx.reply(result.text, { reply_markup: result.keyboard }); } catch (_) {}
      }
    } catch (err: any) {
      console.error("[TELEGRAM_CALLBACK] Error handling callback:", err?.message || err);
    }
  });

  bot.catch((err: any, ctx: any) => {
    console.error(`[TELEGRAM] Bot error for ${ctx.updateType}:`, err);
    if (err.code === 409) {
      console.warn("[TELEGRAM] Conflict detected mid-session. Other instance took over.");
    }
  });

async function trySendFileAttachment(ctx: any, responseText: string, outboundCtx?: { contextId?: string; channel?: string }): Promise<boolean> {
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
              const sent = await withDeliveryTimeout(() => ctx.replyWithPhoto({ source: att.safePath }, { caption: remainingText }), 10000, 'telegram-photo') as any;
              if (sent?.message_id) recordOutboundMessage(sent.message_id, outboundCtx?.contextId || '', outboundCtx?.channel || 'telegram', remainingText);
            } else {
              const sent = await withDeliveryTimeout(() => ctx.replyWithPhoto({ source: att.safePath }), 10000, 'telegram-photo') as any;
              if (sent?.message_id) recordOutboundMessage(sent.message_id, outboundCtx?.contextId || '', outboundCtx?.channel || 'telegram', '');
            }
          } else {
            const sent = await withDeliveryTimeout(() => ctx.replyWithDocument({ source: att.safePath }), 10000, 'telegram-document') as any;
            if (sent?.message_id) recordOutboundMessage(sent.message_id, outboundCtx?.contextId || '', outboundCtx?.channel || 'telegram', '');
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
    if (activeTelegramBot !== bot) return; // Instance already replaced
    try {
      console.log(`[TELEGRAM] Attempting launch (Retry: ${retryCount}, dropPending: ${dropPending})...`);
      
      // Remove leftover active webhook to fully avoid 409 Conflict!
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

  // Determine whether to use webhook or long polling mode based on the Cloud Run environment
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
    console.log(`[TELEGRAM] Converting Dev URL to Public (Shared) URL to escape OAuth 302 obstacles: ${externalUrl}`);
  }

  // If running on a public Cloud Run server, webhook is far more reliable (prevents container suspension)
  let isWebhookDesired = !!externalUrl && 
                       externalUrl.startsWith('https://') &&
                       !externalUrl.includes('localhost') && 
                       !externalUrl.includes('127.0.0.1') && 
                       !externalUrl.includes('ais-dev-');

  // Run an async pre-flight check to ensure the public (pre-release) domain is truly reachable and active
  const checkWebhookAndLaunch = async () => {
    if (isWebhookDesired) {
      try {
        console.log(`[TELEGRAM] Running pre-flight check for: ${externalUrl}/api/health`);
        const signal = (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) 
          ? (AbortSignal as any).timeout(3500) 
          : undefined;
        const checkRes = await fetch(`${externalUrl}/api/health`, { method: 'GET', signal });
        if (checkRes.status !== 200) {
          console.warn(`[TELEGRAM] Public domain not yet detected as active (Status: ${checkRes.status}). Reverting Webhook, using Long Polling.`);
          isWebhookDesired = false;
        }
      } catch (e: any) {
        console.warn(`[TELEGRAM] Public domain unreachable (${e.message || e}). Cancelling Webhook, switching to Long Polling.`);
        isWebhookDesired = false;
      }
    }

    if (isWebhookDesired) {
      console.log(`[TELEGRAM] Configuring Webhook mode for Cloud Run server efficiency: ${externalUrl} (dropPending: ${dropPending})`);
      const webhookUrl = `${externalUrl}/api/telegram-webhook`;
      try {
        await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: dropPending });
        console.log(`[TELEGRAM] Webhook successfully attached to: ${webhookUrl}`);
      } catch (webhookErr: any) {
        console.error("[TELEGRAM] Failed to set up webhook. Falling back to Long Polling:", webhookErr.message || webhookErr);
        await launchBot();
      }
    } else {
      console.log("[TELEGRAM] Using default Long Polling mode for dev/sandbox environment reliability.");
      await launchBot();
    }
  };

  checkWebhookAndLaunch();

  const shutDown = (sig: string) => {
    try {
      if (activeTelegramBot === bot) {
        console.log(`[TELEGRAM] Stopping Bot Daemon before process exit (${sig})...`);
        bot.stop(sig);
      }
    } catch (e: any) {
      console.warn(`[TELEGRAM] Note: Failed to stop Bot safely during process exit: ${e.message || e}`);
    }
  };
  process.once('SIGINT', () => shutDown('SIGINT'));
  process.once('SIGTERM', () => shutDown('SIGTERM'));
}

export function getActiveTelegramBot() {
  return activeTelegramBot;
}
