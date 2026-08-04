import { ToolModule } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { getDb } from '../../core/database.js';
import { genId } from '@shared/core/idGen';

const manifest = {
  "id": "send_message",
  "name": "Universal Dispatcher",
  "description": "Send alerts or cross-platform messages. Telegram delivery is real; Discord and Webhook targets are simulated (logged only).",
  "version": "1.1.0",
  "type": "TOOL",
  "order": 201,
  "configSchema": {
    "fields": {
      "discordWebhookUrl": {
        "type": "password",
        "label": "Discord Webhook URL",
        "default": ""
      }
    }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "platform": {
        "type": "string",
        "enum": ["discord", "webhook", "telegram"],
        "description": "Target platform. telegram delivers for real; discord/webhook are simulated (logged only)"
      },
      "message": { "type": "string", "description": "Content of the message to send" },
      "recipient": { "type": "string", "description": "The Telegram username (e.g. 'zeropride'), perceived name, real name, or raw chat ID. If empty and platform is telegram, Yui will automatically look up the active talker's linked Telegram profile in her social memory/identities database." },
      "priority": { "type": "string", "enum": ["low", "normal", "high"], "description": "Urgency level" }
    },
    "required": ["platform", "message"]
  }
} as const;

async function resolveTelegramChatId(recipient: string | undefined, context: any): Promise<{ tg_id: number; matchedName: string; source: string } | null> {
  // Determine target search name(s)
  let searchName = recipient ? recipient.trim() : "";
  
  // If recipient is blank/falsy, fallback to current active user name from session/context!
  if (!searchName) {
    const activeUserName = context?.userName || (context?.state?.relation?.uid) || "";
    if (activeUserName) {
      console.log(`[MessagingTool] Recipient is blank. Falling back to active session user: ${activeUserName}`);
      searchName = activeUserName;
    } else {
      console.warn("[MessagingTool] No recipient specified and no active session user found.");
      return null;
    }
  }

  console.log(`[MessagingTool] Fetching Telegram target resolution natively for query: "${searchName}"`);

  // 1. Direct Native Database Check (Fast, zero-network, bypasses port routing)
  try {
    if (typeof window === 'undefined') {
      const db = getDb();
      if (db) {
        const cleanSearchName = searchName.trim();
        const cleanUsername = cleanSearchName.startsWith("@") ? cleanSearchName.substring(1) : cleanSearchName;

        // 1.a. Direct numeric check
        if (/^\d+$/.test(cleanSearchName)) {
          return {
            tg_id: parseInt(cleanSearchName),
            matchedName: `@${cleanSearchName}`,
            source: "direct_numeric_sqlite"
          };
        }

        // 1.b. Search identities for perceivedName or realName
        const identity = db.prepare("SELECT * FROM identities WHERE LOWER(perceivedName) = ? OR LOWER(realName) = ?")
          .get(cleanSearchName.toLowerCase(), cleanSearchName.toLowerCase());

        if (identity) {
          const accounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
          let foundTgId = "";
          let matchedUsername = "";

          for (const acc of accounts) {
            const cleanAcc = acc.toLowerCase();
            if (cleanAcc.startsWith("telegram:id:")) {
              foundTgId = acc.split(":")[2];
            } else if (cleanAcc.startsWith("telegram (private):")) {
              matchedUsername = acc.split(":")[1];
            }
          }

          if (foundTgId) {
            return {
              tg_id: parseInt(foundTgId),
              matchedName: identity.perceivedName ? `${identity.perceivedName} (TG: @${matchedUsername || foundTgId})` : `@${matchedUsername || foundTgId}`,
              source: "identity_linked_id_sqlite"
            };
          }

          if (matchedUsername) {
            const tgUser = db.prepare("SELECT tg_id FROM telegram_users WHERE LOWER(username) = ?")
              .get(matchedUsername.toLowerCase());
            if (tgUser) {
              return {
                tg_id: tgUser.tg_id,
                matchedName: identity.perceivedName ? `${identity.perceivedName} (TG: @${matchedUsername})` : `@${matchedUsername}`,
                source: "identity_linked_username_sqlite"
              };
            }
          }
        }

        // 1.c. Search telegram_users table directly
        const tgUser = db.prepare("SELECT tg_id, username FROM telegram_users WHERE LOWER(username) = ? OR LOWER(username) LIKE ?")
          .get(cleanUsername.toLowerCase(), `%${cleanUsername.toLowerCase()}%`);

        if (tgUser) {
          return {
            tg_id: tgUser.tg_id,
            matchedName: `@${tgUser.username}`,
            source: "telegram_users_match_sqlite"
          };
        }

        // 1.d. Deep search inside linkedAccounts column across ALL identities
        const allIdens = db.prepare("SELECT * FROM identities").all();
        for (const iden of allIdens) {
          const accounts = iden.linkedAccounts ? JSON.parse(iden.linkedAccounts) : [];
          for (const acc of accounts) {
            const cleanAcc = acc.toLowerCase();
            if (cleanAcc.includes(cleanUsername.toLowerCase())) {
              if (cleanAcc.startsWith("telegram:id:")) {
                const tgId = acc.split(":")[2];
                return {
                  tg_id: parseInt(tgId),
                  matchedName: iden.perceivedName ? `${iden.perceivedName} (TG: @${cleanUsername})` : `@${cleanUsername}`,
                  source: "identities_deep_match_sqlite"
                };
              }
            }
          }
        }
      }
    }
  } catch (dbErr: any) {
    console.error("[MessagingTool] Native database query failed, falling back to HTTP API:", dbErr.message);
  }

  // 2. HTTP Fallback Check (just in case)
  try {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer 
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;
    const response = await fetch(`${baseUrl}/api/telegram/resolve?recipient=${encodeURIComponent(searchName)}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.tg_id) {
        let matchedName = `@${data.username}`;
        if (data.perceivedName) {
          matchedName = `${data.perceivedName} (TG: @${data.username})`;
        }
        return {
          tg_id: data.tg_id,
          matchedName: matchedName,
          source: data.source || "backend_api_fallback"
        };
      }
    }
  } catch (err: any) {
    console.error("[MessagingTool] HTTP API fallback also failed:", err.message);
  }

  return null;
}

export const MessagingTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    try {
      const config = await SystemRegistry.getConfig('send_message');
      console.log(`[MessagingTool] Processing ${args.platform} dispatch request...`);

      if (args.platform === 'telegram') {
        const isBrowser = typeof window !== 'undefined';
        if (isBrowser) {
          console.log("[MessagingTool] Executing in browser. Delegating dispatch to /api/telegram/send proxy...");
          try {
            const response = await fetch('/api/telegram/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: args.recipient || context?.userName || "",
                message: args.message
              })
            });
            const resData = await response.json();
            if (response.ok && resData.success) {
              return {
                success: true,
                platform: "telegram",
                recipient: resData.recipient,
                chat_id: resData.chat_id,
                message: args.message,
                timestamp: new Date().toISOString(),
                status: "Delivered successfully via server proxy"
              };
            } else {
              return {
                success: false,
                error: resData.error || "Gagal mengirimkan pesan melalui proxy server Telegram."
              };
            }
          } catch (browserErr: any) {
            console.error("[MessagingTool] Failed to call telegram send proxy:", browserErr);
            return {
              success: false,
              error: `Koneksi ke server proxy gagal: ${browserErr.message || browserErr}`
            };
          }
        }

        let botToSend: any = null;
        try {
          botToSend = (globalThis as any).activeTelegramBot;
        } catch (e: any) {
          console.error("[MessagingTool] Telegram Bot global lookup error:", e);
        }

        const resolved = await resolveTelegramChatId(args.recipient, context);
        if (!resolved) {
          return {
            success: false,
            error: `Gagal mendeteksi profil Telegram untuk "${args.recipient || context?.userName || "pengguna"}". Pastikan target telah mengirimkan pesan /start ke bot Telegram Yuihime agar ID chat terekam, atau tautkan akun menggunakan pola 'id telegram saya <username>' di obrolan.`
          };
        }

        if (!botToSend) {
          return {
            success: false,
            error: "Bot Telegram saat ini tidak aktif atau token belum dikonfigurasi di pengaturan."
          };
        }

        console.log(`[MessagingTool] Mengirimkan pesan Telegram ke ${resolved.matchedName} (Chat ID: ${resolved.tg_id}) via ${resolved.source}...`);
        
        try {
          await botToSend.telegram.sendMessage(resolved.tg_id, args.message);
        } catch (tgSendErr: any) {
          console.error(`[MessagingTool] Gagal mengirim pesan ke Chat ID ${resolved.tg_id} via Telegraf:`, tgSendErr.message || tgSendErr);
          return {
            success: false,
            error: `Gagal mengirimkan pesan Telegram ke Chat ID ${resolved.tg_id}: ${tgSendErr.message || tgSendErr}. Pastikan user sudah mengirimkan perintah /start ke bot Telegram Yuihime dan tidak memblokir bot tersebut.`
          };
        }

        return {
          success: true,
          platform: "telegram",
          recipient: resolved.matchedName,
          chat_id: resolved.tg_id,
          message: args.message,
          timestamp: new Date().toISOString(),
          status: "Delivered successfully"
        };
      }

      // Maintain legacy mock behaviors for Discord, Webhook as requested
      console.log(`[MessagingTool] Sending ${args.platform} message. Targeted Webhook: ${config.discordWebhookUrl ? 'Configured' : 'Missing'}`);
      
      return {
        success: true,
        platform: args.platform,
        timestamp: new Date().toISOString(),
        messageId: genId(9),
        status: "Queued for delivery (Mock platform)"
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
