import express from "express";
import { getActiveTelegramBot } from "../telegram.js";

export function registerTelegramRoutes(app: express.Express, db: any) {
  app.get("/api/telegram/resolve", (req, res) => {
    try {
      const recipient = req.query.recipient as string;
      if (!recipient) {
        return res.status(400).json({ error: "recipient query parameter is required" });
      }

      const cleanRecipient = recipient.trim();
      const cleanUsername = cleanRecipient.startsWith("@") ? cleanRecipient.substring(1) : cleanRecipient;

      // 1. Direct numeric check
      if (/^\d+$/.test(cleanRecipient)) {
        return res.json({
          success: true,
          tg_id: parseInt(cleanRecipient),
          username: cleanRecipient,
          source: "direct_numeric"
        });
      }

      // 2. Query identities by perceivedName or realName
      const identity = db.prepare("SELECT * FROM identities WHERE LOWER(perceivedName) = ? OR LOWER(realName) = ?")
        .get(cleanRecipient.toLowerCase(), cleanRecipient.toLowerCase());

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
          return res.json({
            success: true,
            tg_id: parseInt(foundTgId),
            username: matchedUsername || cleanRecipient,
            perceivedName: identity.perceivedName,
            source: "identity_linked_id"
          });
        }

        if (matchedUsername) {
          const tgUser = db.prepare("SELECT tg_id FROM telegram_users WHERE LOWER(username) = ?")
            .get(matchedUsername.toLowerCase());
          if (tgUser) {
            return res.json({
              success: true,
              tg_id: tgUser.tg_id,
              username: matchedUsername,
              perceivedName: identity.perceivedName,
              source: "identity_linked_username"
            });
          }
        }
      }

      // 3. Fallback to querying telegram_users table directly by username (case-insensitive)
      const tgUserByUsername = db.prepare("SELECT tg_id, username FROM telegram_users WHERE LOWER(username) = ? OR LOWER(username) LIKE ?")
        .get(cleanUsername.toLowerCase(), `%${cleanUsername.toLowerCase()}%`);

      if (tgUserByUsername) {
        return res.json({
          success: true,
          tg_id: tgUserByUsername.tg_id,
          username: tgUserByUsername.username,
          source: "telegram_users_match"
        });
      }

      // 4. Try matching username in the linkedAccounts string of all identities
      const allIdens = db.prepare("SELECT * FROM identities").all();
      for (const iden of allIdens) {
        const accounts = iden.linkedAccounts ? JSON.parse(iden.linkedAccounts) : [];
        for (const acc of accounts) {
          const cleanAcc = acc.toLowerCase();
          if (cleanAcc.includes(cleanUsername.toLowerCase())) {
            if (cleanAcc.startsWith("telegram:id:")) {
              const tgId = acc.split(":")[2];
              return res.json({
                success: true,
                tg_id: parseInt(tgId),
                username: cleanUsername,
                perceivedName: iden.perceivedName,
                source: "identities_deep_match"
              });
            }
          }
        }
      }

      return res.status(404).json({
        success: false,
        error: `Profil Telegram untuk "${recipient}" tidak ditemukan. Pastikan target pernah mengirimkan pesan ke robot Yuihime agar ID chat terekam.`
      });
    } catch (err: any) {
      console.error("[SERVER] GET /api/telegram/resolve error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Telegram Message Sending API for Messaging Tool Browser Proxy ---
  app.post("/api/telegram/send", async (req, res) => {
    try {
      const { recipient, message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Parameter 'message' mandatory." });
      }

      const bot = getActiveTelegramBot();
      if (!bot) {
        return res.status(503).json({ error: "Bot Telegram saat ini tidak aktif atau token belum dikonfigurasi di pengaturan." });
      }

      const searchName = recipient ? String(recipient).trim() : "";
      if (!searchName) {
        return res.status(400).json({ error: "Penerima tidak ditentukan." });
      }

      let tg_id: number | null = null;
      let matchedName = "";

      // 1. Direct numeric check
      if (/^\d+$/.test(searchName)) {
        tg_id = parseInt(searchName);
        matchedName = `@${searchName}`;
      } else {
        const cleanUsername = searchName.startsWith("@") ? searchName.substring(1) : searchName;

        // 2. Query telegram_users table directly
        const tgUser = db.prepare("SELECT tg_id, username FROM telegram_users WHERE LOWER(username) = ? OR LOWER(username) LIKE ?")
          .get(cleanUsername.toLowerCase(), `%${cleanUsername.toLowerCase()}%`);

        if (tgUser) {
          tg_id = tgUser.tg_id;
          matchedName = `@${tgUser.username}`;
        } else {
          // 3. Query identities table with linked accounts schema
          const identity = db.prepare("SELECT * FROM identities WHERE LOWER(perceivedName) = ? OR LOWER(realName) = ?")
            .get(searchName.toLowerCase(), searchName.toLowerCase());

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
              tg_id = parseInt(foundTgId);
              matchedName = identity.perceivedName ? `${identity.perceivedName} (TG: @${matchedUsername || foundTgId})` : `@${matchedUsername || foundTgId}`;
            } else if (matchedUsername) {
              const tgUserSub = db.prepare("SELECT tg_id FROM telegram_users WHERE LOWER(username) = ?")
                .get(matchedUsername.toLowerCase());
              if (tgUserSub) {
                tg_id = tgUserSub.tg_id;
                matchedName = identity.perceivedName ? `${identity.perceivedName} (TG: @${matchedUsername})` : `@${matchedUsername}`;
              }
            }
          }
        }
      }

      // 4. Try matching username across all identities' linkedAccounts column
      if (!tg_id) {
        const cleanUsername = searchName.startsWith("@") ? searchName.substring(1) : searchName;
        const allIdens = db.prepare("SELECT * FROM identities").all();
        for (const iden of allIdens) {
          const accounts = iden.linkedAccounts ? JSON.parse(iden.linkedAccounts) : [];
          for (const acc of accounts) {
            const cleanAcc = acc.toLowerCase();
            if (cleanAcc.includes(cleanUsername.toLowerCase())) {
              if (cleanAcc.startsWith("telegram:id:")) {
                const tgId = acc.split(":")[2];
                tg_id = parseInt(tgId);
                matchedName = iden.perceivedName ? `${iden.perceivedName} (TG: @${cleanUsername})` : `@${cleanUsername}`;
                break;
              }
            }
          }
          if (tg_id) break;
        }
      }

      if (!tg_id) {
        return res.status(404).json({
          error: `Gagal mendeteksi profil Telegram untuk "${recipient}". Pastikan target telah mengirimkan pesan /start ke bot Telegram Yuihime agar ID chat terekam, atau tautkan akun menggunakan pola 'id telegram saya <username>' di obrolan.`
        });
      }

      console.log(`[SERVER_MSG] Dispatching Telegram message to ${matchedName} (ID: ${tg_id})`);
      
      try {
        await bot.telegram.sendMessage(tg_id, message);
      } catch (tgSendErr: any) {
        console.error(`[SERVER_MSG] Telegraf sendMessage failed:`, tgSendErr.message || tgSendErr);
        return res.status(502).json({
          error: `Gagal mengirimkan pesan Telegram ke Chat ID ${tg_id}: ${tgSendErr.message || tgSendErr}. Pastikan Kakak sudah mengirimkan perintah /start ke bot Telegram Yuihime dan tidak memblokir bot tersebut.`
        });
      }

      res.json({ success: true, recipient: matchedName, chat_id: tg_id, status: "Delivered successfully" });
    } catch (err: any) {
      console.error("[SERVER] POST /api/telegram/send error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Multiplatform Pairing APIs ---
  // Routes will be injected here
}
