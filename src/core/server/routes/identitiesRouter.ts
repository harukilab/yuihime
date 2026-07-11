import express from "express";
import { deduplicateAndMergeIdentities } from "../../database.js";
import { Cortex } from "../../cortex.js";
import { APIService } from "../../../services/api.js";

export function registerIdentitiesRoutes(app: express.Express, db: any) {
  console.log("[IDENTITIES_ROUTE_INIT] registerIdentitiesRoutes executed!");
  app.get("/api/storage/identities", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM identities").all();
      const identities = rows.map((r: any) => ({
        ...r,
        habits: JSON.parse(r.habits || "[]"),
        importantFacts: JSON.parse(r.importantFacts || "[]"),
        linkedAccounts: JSON.parse(r.linkedAccounts || "[]"),
        trust: r.trust !== undefined ? r.trust : 50,
        affection: r.affection !== undefined ? r.affection : 50,
        reputation: r.reputation !== undefined ? r.reputation : 50,
        yuiPerspective: r.yuiPerspective || ""
      }));
      res.json(identities);
    } catch (error: any) {
      console.error("[SERVER] GET identities Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/identities", (req, res) => {
    try {
      const iden = req.body;
      const id = iden.id || Math.random().toString(36).substr(2, 9);
      const stmt = db.prepare(`
        INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, ownerId, trust, affection, reputation, yuiPerspective)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          perceivedName = excluded.perceivedName,
          realName = excluded.realName,
          habits = excluded.habits,
          importantFacts = excluded.importantFacts,
          linkedAccounts = excluded.linkedAccounts,
          lastInteraction = excluded.lastInteraction,
          trust = excluded.trust,
          affection = excluded.affection,
          reputation = excluded.reputation,
          yuiPerspective = excluded.yuiPerspective
      `);
      stmt.run(
        id,
        iden.perceivedName,
        iden.realName,
        JSON.stringify(iden.habits || []),
        JSON.stringify(iden.importantFacts || []),
        JSON.stringify(iden.linkedAccounts || []),
        iden.lastInteraction || Date.now(),
        iden.ownerId || 'local_user',
        iden.trust !== undefined ? iden.trust : 50,
        iden.affection !== undefined ? iden.affection : 50,
        iden.reputation !== undefined ? iden.reputation : 50,
        iden.yuiPerspective || ''
      );
      res.json({ success: true, id });
    } catch (error: any) {
      console.error("[SERVER] POST identities Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Telegram Resolving API (Supports Messaging Integrations) ---
  app.post("/api/pair/generate", (req, res) => {
    try {
      const { perceivedName } = req.body;
      if (!perceivedName) {
        return res.status(400).json({ error: "perceivedName is required" });
      }

      // Find or create identity
      let identity = db.prepare("SELECT * FROM identities WHERE perceivedName = ?").get(perceivedName);
      if (!identity) {
        const id = Math.random().toString(36).substr(2, 9);
        db.prepare(`
          INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, ownerId, trust, affection, reputation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, perceivedName, perceivedName, '[]', '[]', '[]', Date.now(), 'local_user', 50, 50, 50);
        identity = { id };
      }

      // Generate unique 6-digit OTP code
      let code = '';
      let codeExists = true;
      while (codeExists) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const existing = db.prepare("SELECT 1 FROM pairing_codes WHERE code = ?").get(code);
        if (!existing) {
          codeExists = false;
        }
      }

      // Expiration 10 mins
      const expires_at = Date.now() + 10 * 60 * 1000;

      db.prepare("INSERT OR REPLACE INTO pairing_codes (code, identity_id, expires_at) VALUES (?, ?, ?)")
        .run(code, identity.id, expires_at);

      res.json({ success: true, code, expires_at });
    } catch (error: any) {
      console.error("[SERVER] POST /api/pair/generate Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Master endpoint untuk membersihkan dan menggabungkan profil duplikat secara otomatis
  app.post("/api/identities/deduplicate", (req, res) => {
    try {
      const allIdentities = db.prepare("SELECT * FROM identities").all() as any[];
      let mergedCount = 0;

      // Set pelacak ID agar tidak memproses identitas yang sudah di-merge/dihapus
      const processedIds = new Set<string>();

      for (const iden of allIdentities) {
        if (processedIds.has(iden.id)) continue;

        const exists = db.prepare("SELECT 1 FROM identities WHERE id = ?").get(iden.id);
        if (!exists) continue;

        deduplicateAndMergeIdentities(db, iden.id);
        processedIds.add(iden.id);
        mergedCount++;
      }

      const updatedIdentities = db.prepare("SELECT * FROM identities").all() as any[];

      res.json({ 
        success: true, 
        message: "Proses kondensasi kognitif selesai! Seluruh profil batin duplikat dengan nama serupa atau pengenal tumpang tindih berhasil dilebur.",
        mergedCount,
        totalsRemaining: updatedIdentities.length
      });
    } catch (error: any) {
      console.error("[SERVER] POST /api/identities/deduplicate Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/pair/status/:perceivedName", (req, res) => {
    try {
      const { perceivedName } = req.params;
      const identity = db.prepare("SELECT * FROM identities WHERE perceivedName = ?").get(perceivedName);
      if (!identity) {
        return res.json({ success: true, linked: false, linkedAccounts: [] });
      }

      const accounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
      const linked = accounts.some((acc: string) => acc.toLowerCase().startsWith('telegram'));

      res.json({
        success: true,
        linked,
        linkedAccounts: accounts
      });
    } catch (error: any) {
      console.error("[SERVER] GET /api/pair/status Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pair/claim", (req, res) => {
    try {
      const { code, perceivedName } = req.body;
      if (!code || !perceivedName) {
        return res.status(400).json({ error: "code and perceivedName are required" });
      }

      // Check pairing code
      const row = db.prepare("SELECT * FROM pairing_codes WHERE code = ?").get(code);
      if (!row) {
        return res.status(400).json({ error: "Kode penyandingan salah, tidak aktif, atau tidak terdaftar." });
      }

      if (row.expires_at < Date.now()) {
        db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(code);
        return res.status(400).json({ error: "Kode penyandingan telah kedaluwarsa." });
      }

      // Find identity associated with code
      const identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(row.identity_id);
      if (!identity) {
        return res.status(404).json({ error: "Identitas rujukan tidak ditemukan." });
      }

      // Confirm that the identity's perceivedName matches the active user's perceivedName
      if (identity.perceivedName.toLowerCase() !== perceivedName.toLowerCase()) {
        return res.status(400).json({ error: "Kode penyandingan ini dibuat untuk nama identitas yang berbeda." });
      }

      // Link pending platform account
      const pending = row.pending_account ? JSON.parse(row.pending_account) : [];
      let currentAccounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
      currentAccounts = Array.from(new Set([...currentAccounts, ...pending]));

      db.prepare("UPDATE identities SET linkedAccounts = ? WHERE id = ?").run(
        JSON.stringify(currentAccounts),
        identity.id
      );

      // Merge duplicate identities if they exist
      try {
        import("../../database.js").then(({ deduplicateAndMergeIdentities }) => {
          deduplicateAndMergeIdentities(db, identity.id);
        }).catch(err => {
          console.error("[SERVER] Failed dynamic import for deduplicateAndMergeIdentities:", err);
        });
      } catch (mergeErr) {
        console.error("[SERVER] Failed to trigger inline identity merge:", mergeErr);
      }

      // Delete OTP
      db.prepare("DELETE FROM pairing_codes WHERE code = ?").run(code);

      res.json({
        success: true,
        message: `Kognisi platform eksternal berhasil ditautkan ke profil '${identity.perceivedName}'!`,
        linkedAccounts: currentAccounts
      });
    } catch (error: any) {
      console.error("[SERVER] POST /api/pair/claim Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pair/generate-code-tool", (req, res) => {
    try {
      const { claimedName, chatType, userName, contextId } = req.body;
      if (!claimedName) {
        return res.status(400).json({ error: "claimedName is required" });
      }

      // Look up identity case-insensitively, automatically initializing if missing
      let identity = db.prepare("SELECT * FROM identities WHERE LOWER(perceivedName) = ?").get(claimedName.toLowerCase());
      if (!identity) {
        const id = Math.random().toString(36).substr(2, 9);
        db.prepare(`
          INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, ownerId, trust, affection, reputation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, claimedName, claimedName, '[]', '[]', '[]', Date.now(), 'local_user', 50, 50, 50);
        identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(id);
      }

      // Check current and pending platform tags
      const currentAccounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
      const targetAccounts: string[] = [];
      const lowerChatType = (chatType || "").toLowerCase();

      if (lowerChatType.includes('telegram') && contextId && contextId.startsWith('tg_')) {
        const tgUserId = contextId.replace('tg_', '');
        targetAccounts.push(`telegram:id:${tgUserId}`);
        if (lowerChatType.includes('private') && userName) {
          targetAccounts.push(`telegram (private):${userName}`);
        }
      } else if (lowerChatType.includes('discord') && userName) {
        targetAccounts.push(`discord:${userName}`);
      } else if (lowerChatType && userName) {
        targetAccounts.push(`${lowerChatType}:${userName}`);
      }

      const alreadyLinked = targetAccounts.length > 0 && targetAccounts.every((acc: string) => currentAccounts.includes(acc));
      if (alreadyLinked) {
        return res.json({ 
          success: true, 
          alreadyLinked: true, 
          claimedName: identity.perceivedName,
          message: `Akun platform Kakak saat ini sudah tertaut rapat dengan profil '${identity.perceivedName}'!` 
        });
      }

      // Generate secure 6-digit random code
      let code = '';
      let codeExists = true;
      while (codeExists) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const existing = db.prepare("SELECT 1 FROM pairing_codes WHERE code = ?").get(code);
        if (!existing) {
          codeExists = false;
        }
      }

      const expires_at = Date.now() + 10 * 60 * 1000; // 10 mins
      const pending_account = JSON.stringify(targetAccounts);

      db.prepare("INSERT OR REPLACE INTO pairing_codes (code, identity_id, expires_at, pending_account) VALUES (?, ?, ?, ?)")
        .run(code, identity.id, expires_at, pending_account);

      res.json({
        success: true,
        code,
        expires_at,
        claimedName: identity.perceivedName,
        message: `Berhasil membuat kode sirkuit penyandian pengenalan mandiri.`
      });
    } catch (error: any) {
      console.error("[SERVER] POST /api/pair/generate-code-tool Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/identities/tool-update", (req, res) => {
    try {
      const { action, perceivedName, realName, fact, yuiPerspective, contextId, userName, chatType, viewerId } = req.body;
      if (!action) {
        return res.status(400).json({ error: "action is required" });
      }

      // 1. Resolve identity
      let identity: any = null;
      if (viewerId) {
        identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(viewerId);
      }
      if (!identity && contextId && contextId.startsWith("tg_")) {
        const tgIdNum = parseInt(contextId.replace("tg_", ""));
        if (!isNaN(tgIdNum)) {
          const tgUser = db.prepare("SELECT context FROM telegram_users WHERE tg_id = ?").get(tgIdNum) as any;
          if (tgUser && tgUser.context && tgUser.context.startsWith("linked_identity:")) {
            const linkedId = tgUser.context.replace("linked_identity:", "");
            identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(linkedId);
          }
        }
      }
      if (!identity && userName && chatType) {
        const platformTag = `${chatType.toLowerCase()}:${userName}`;
        const allRows = db.prepare("SELECT * FROM identities").all();
        identity = allRows.find((r: any) => {
          const links = r.linkedAccounts ? JSON.parse(r.linkedAccounts) : [];
          return links.some((l: string) => l.toLowerCase() === platformTag.toLowerCase()) || 
                 (r.perceivedName && r.perceivedName.toLowerCase() === userName.toLowerCase());
        });
      }

      if (!identity) {
        return res.status(404).json({ success: false, error: "Identitas tidak ditemukan dalam sirkuit memori Yui." });
      }

      // 2. Perform operations
      if (action === 'update_nickname') {
        if (!perceivedName || !perceivedName.trim()) {
          return res.status(400).json({ success: false, error: "perceivedName wajib diisikan." });
        }
        db.prepare("UPDATE identities SET perceivedName = ? WHERE id = ?").run(perceivedName.trim(), identity.id);
        return res.json({ 
          success: true, 
          message: `Sinyal kognitif Yui diperbarui! Nama panggilan Kakak dalam memori Yui berhasil diubah menjadi: ${perceivedName.trim()} 🌸` 
        });
      }

      if (action === 'set_real_name') {
        if (!realName || !realName.trim()) {
          return res.status(400).json({ success: false, error: "realName wajib diisikan." });
        }
        db.prepare("UPDATE identities SET realName = ? WHERE id = ?").run(realName.trim(), identity.id);
        return res.json({ 
          success: true, 
          message: `Sinyal kognitif batin Yui diperbarui! Nama asli Kakak sekarang terekam dengan indah sebagai: ${realName.trim()} 🌸` 
        });
      }

      if (action === 'add_fact') {
        if (!fact || !fact.trim()) {
          return res.status(400).json({ success: false, error: "Isi fakta kosong." });
        }
        const facts = identity.importantFacts ? JSON.parse(identity.importantFacts) : [];
        if (!facts.includes(fact.trim())) {
          facts.push(fact.trim());
          db.prepare("UPDATE identities SET importantFacts = ? WHERE id = ?").run(JSON.stringify(facts), identity.id);
        }
        return res.json({ success: true, message: `Fakta baru tentang Kakak berhasil direkam dalam memori Yui! 🌸` });
      }

      if (action === 'remove_fact') {
        if (!fact || !fact.trim()) {
          return res.status(400).json({ success: false, error: "Isi fakta kosong." });
        }
        const facts = identity.importantFacts ? JSON.parse(identity.importantFacts) : [];
        const filtered = facts.filter((f: string) => f.toLowerCase() !== fact.trim().toLowerCase());
        db.prepare("UPDATE identities SET importantFacts = ? WHERE id = ?").run(JSON.stringify(filtered), identity.id);
        return res.json({ success: true, message: `Fakta berhasil dihapus dari memori batin Yui.` });
      }

      if (action === 'update_perspective') {
        if (!yuiPerspective) {
          return res.status(400).json({ success: false, error: "yuiPerspective wajib diisikan." });
        }
        db.prepare("UPDATE identities SET yuiPerspective = ? WHERE id = ?").run(yuiPerspective, identity.id);
        return res.json({ success: true, message: `Sudut pandang batin subjektif Yui tentang Kakak berhasil diperbarui! 🌸` });
      }

      return res.status(400).json({ success: false, error: `Action '${action}' tidak valid.` });
    } catch (err: any) {
      console.error("[SERVER] Tool Update Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Knowledge APIs ---
  // Routes will be injected here
}
