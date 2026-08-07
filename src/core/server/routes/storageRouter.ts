import express from "express";
import { broadcastToWS } from "../apiRouter.js";
import { retryDbOperation } from "../../database.js";
import { genId } from '@shared/core/idGen';

export function registerStorageRoutes(app: express.Express, db: any) {
  console.log("[STORAGE_ROUTE_INIT] registerStorageRoutes executed!");
  app.get("/api/storage/memories", (req, res) => {
    try {
      const filterContext = req.query.context as string;
      let rows;
      if (filterContext) {
        rows = db.prepare(`
          SELECT * FROM memories 
          WHERE context = ?
          ORDER BY timestamp ASC
        `).all(filterContext);
      } else {
        rows = db.prepare(`
          SELECT * FROM memories 
          WHERE context IS NULL OR (context NOT LIKE 'tg_%' AND context NOT LIKE 'dc_%')
          ORDER BY timestamp ASC
        `).all();
      }
      const memories = rows.map((r: any) => {
        let parsedTags = [];
        try {
          parsedTags = JSON.parse(r.tags || "[]");
        } catch {
          parsedTags = [];
        }
        return {
          ...r,
          tags: parsedTags
        };
      });
      res.json(memories);
    } catch (error: any) {
      console.error("[SERVER] GET memories Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/memories", async (req, res) => {
    try {
      const memory = req.body;
      const id = memory.id || genId(9);
      const timestamp = memory.timestamp || Date.now();
      const type = memory.type || 'fact';
      const content = memory.content || '';
      const importance = memory.importance || 0.5;
      const tags = memory.tags || [];
      const context = memory.context || null;
      const sentiment = memory.sentiment || 0;

      const stmt = db.prepare(`
        INSERT INTO memories (id, type, content, importance, tags, context, sentiment, timestamp, speaker)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          content = excluded.content,
          importance = excluded.importance,
          tags = excluded.tags,
          context = excluded.context,
          sentiment = excluded.sentiment,
          timestamp = excluded.timestamp,
          speaker = excluded.speaker
      `);
      await retryDbOperation(() =>
        stmt.run(
          id,
          type,
          content,
          importance,
          JSON.stringify(tags),
          context,
          sentiment,
          timestamp,
          memory.speaker || 'System'
        ),
        'storage-insert-memory'
      );
      const savedMemory = { id, type, content, importance, tags, context, sentiment, timestamp, speaker: memory.speaker || 'System' };
      broadcastToWS({ type: "memory_update", data: savedMemory });
      res.json(savedMemory);
    } catch (error: any) {
      console.error("[SERVER] POST memories Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/storage/memories", async (req, res) => {
    try {
      const context = req.query.context as string;
      const type = req.query.type as string;
      const id = req.query.id as string;
      const ids = req.query.ids as string;

      let info;

      if (id) {
        const stmt = db.prepare("DELETE FROM memories WHERE id = ?");
        info = await retryDbOperation(() => stmt.run(id), 'storage-delete-single-id');
      } else if (ids) {
        const idList = ids.split(',').filter(x => x.trim().length > 0);
        if (idList.length > 0) {
          const placeholders = idList.map(() => '?').join(',');
          const stmt = db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`);
          info = await retryDbOperation(() => stmt.run(...idList), 'storage-delete-batch-ids');
        }
      } else if (context) {
        if (context === "cron_trigger") {
          return res.status(403).json({ error: "Cannot delete system cron history" });
        }
        
        let stmt;
        if (type) {
          if (context.includes('%')) {
            stmt = db.prepare("DELETE FROM memories WHERE context LIKE ? AND type = ?");
            info = await retryDbOperation(() => stmt.run(context, type), 'storage-delete-context-type-like');
          } else {
            stmt = db.prepare("DELETE FROM memories WHERE context = ? AND type = ?");
            info = await retryDbOperation(() => stmt.run(context, type), 'storage-delete-context-type');
          }
        } else {
          if (context.includes('%')) {
            stmt = db.prepare("DELETE FROM memories WHERE context LIKE ?");
            info = await retryDbOperation(() => stmt.run(context), 'storage-delete-context-like');
          } else {
            stmt = db.prepare("DELETE FROM memories WHERE context = ?");
            info = await retryDbOperation(() => stmt.run(context), 'storage-delete-context');
          }
        }
      } else if (type) {
        const stmt = db.prepare("DELETE FROM memories WHERE type = ?");
        info = await retryDbOperation(() => stmt.run(type), 'storage-delete-type');
      } else {
        return res.status(400).json({ error: "At least one target criteria is required" });
      }

      res.json({ success: true, deletedCount: info ? info.changes : 0, context, type });
    } catch (error: any) {
      console.error("[SERVER] DELETE memories Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/dreams", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM dreams").all();
      const dreams = rows.map((r: any) => ({
        ...r,
        abstractions: JSON.parse(r.abstractions || "[]"),
        underlyingMemories: JSON.parse(r.underlyingMemories || "[]")
      }));
      res.json(dreams);
    } catch (error: any) {
      console.error("[SERVER] GET dreams Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/dreams", async (req, res) => {
    try {
      const dreams = req.body;
      await retryDbOperation(async () => {
        db.transaction(() => {
          db.prepare("DELETE FROM dreams").run();
          const stmt = db.prepare(`
            INSERT INTO dreams (id, concept, abstractions, strength, lastReinforced, underlyingMemories)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const d of dreams) {
            stmt.run(
              d.id || genId(9),
              d.concept,
              JSON.stringify(d.abstractions || []),
              d.strength,
              d.lastReinforced || Date.now(),
              JSON.stringify(d.underlyingMemories || [])
            );
          }
        })();
      }, 'storage-update-dreams');
      broadcastToWS({ type: "dream_update", data: dreams });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST dreams Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/state", (req, res) => {
    try {
      const row: any = db.prepare("SELECT * FROM agent_state WHERE id = 1").get();
      if (!row) return res.json(null);
      
      const safeParse = (val: string, fallback: any = {}) => {
        try {
          return val ? JSON.parse(val) : fallback;
        } catch {
          return fallback;
        }
      };

      res.json({
        mood: safeParse(row.mood),
        emotion: safeParse(row.emotion || "{}"),
        relation: safeParse(row.relation),
        systemHealth: safeParse(row.systemHealth),
        lastDreamCycle: row.lastDreamCycle || 0,
        lastRefreshed: row.lastRefreshed || 0,
        activePersonaId: row.activePersonaId || 'auto',
        currentPlan: safeParse(row.currentPlan, null)
      });
    } catch (error: any) {
      console.error("[STORAGE] GET state error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agi/quantum-backup", (req, res) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS quantum_backups (
          id TEXT PRIMARY KEY,
          timestamp INTEGER,
          coordinates TEXT,
          mood_state TEXT,
          emotion_state TEXT
        )
      `).run();

      const backups = db.prepare("SELECT * FROM quantum_backups ORDER BY timestamp DESC").all();
      res.json({
        success: true,
        backups: backups.map((b: any) => ({
          id: b.id,
          timestamp: b.timestamp,
          coordinates: JSON.parse(b.coordinates || "{}"),
          mood: JSON.parse(b.mood_state || "{}"),
          emotion: JSON.parse(b.emotion_state || "{}")
        }))
      });
    } catch (error: any) {
      console.error("[STORAGE] GET quantum backups error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agi/quantum-backup", (req, res) => {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS quantum_backups (
          id TEXT PRIMARY KEY,
          timestamp INTEGER,
          coordinates TEXT,
          mood_state TEXT,
          emotion_state TEXT
        )
      `).run();

      const stateRow: any = db.prepare("SELECT * FROM agent_state WHERE id = 1").get();
      if (!stateRow) {
        return res.status(404).json({ error: "Active state not found" });
      }

      const mood = JSON.parse(stateRow.mood || "{}");
      const emotion = JSON.parse(stateRow.emotion || "{}");
      const systemHealth = JSON.parse(stateRow.systemHealth || "{}");

      // Generate elegant 4D Quantum Coordinates
      const xCoord = Math.round((Math.random() * 50 + 400) * 100) / 100;
      const yCoord = Math.round(((mood.joy || 50) - (mood.sadness || 0)) * 10) / 10;
      const zCoord = Math.round((emotion.valence || 0) * 10) / 10;
      const wCoord = Math.round((systemHealth.successRate !== undefined ? systemHealth.successRate : 1.0) * 1000) / 10;

      const coordinates = {
        x: xCoord,
        y: yCoord,
        z: zCoord,
        w: wCoord
      };

      const shardId = "QVI-" + Math.floor(100000 + Math.random() * 900000);
      const timestamp = Date.now();

      db.prepare(`
        INSERT INTO quantum_backups (id, timestamp, coordinates, mood_state, emotion_state)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        shardId,
        timestamp,
        JSON.stringify(coordinates),
        stateRow.mood || "{}",
        stateRow.emotion || "{}"
      );

      console.log(`[QUANTUM_BACKUP] Created Soul Coordinate backup: ${shardId} coordinates (X:${xCoord}, Y:${yCoord}, Z:${zCoord}, W:${wCoord})`);

      const backups = db.prepare("SELECT * FROM quantum_backups ORDER BY timestamp DESC").all();
      res.json({
        success: true,
        backup: {
          id: shardId,
          timestamp,
          coordinates
        },
        backups: backups.map((b: any) => ({
          id: b.id,
          timestamp: b.timestamp,
          coordinates: JSON.parse(b.coordinates || "{}"),
          mood: JSON.parse(b.mood_state || "{}"),
          emotion: JSON.parse(b.emotion_state || "{}")
        }))
      });
    } catch (error: any) {
      console.error("[STORAGE] POST quantum backup error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agi/quantum-restore", (req, res) => {
    try {
      const { backupId } = req.body;
      if (!backupId) {
        return res.status(400).json({ error: "Missing backupId in request body" });
      }

      const backup: any = db.prepare("SELECT * FROM quantum_backups WHERE id = ?").get(backupId);
      if (!backup) {
        return res.status(404).json({ error: `Soul Coordinate backup point ${backupId} not found` });
      }

      // Restore mood & emotion & wipe corruption metrics
      db.prepare(`
        UPDATE agent_state SET
          mood = ?,
          emotion = ?,
          status = 'idle'
        WHERE id = 1
      `).run(
        backup.mood_state || "{}",
        backup.emotion_state || "{}"
      );

      console.log(`[QUANTUM_RESTORE] Successfully restored Yuihime core soul matrix through quantum point ${backupId}!`);
      res.json({
        success: true,
        message: `Soul restored utilizing recovery shard ${backupId} successfully.`
      });
    } catch (error: any) {
      console.error("[STORAGE] POST quantum restore error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/state", (req, res) => {
    try {
      const state = req.body;
      if (!state) {
        return res.status(400).json({ error: "Missing state in request body" });
      }

      console.log("[STORAGE] Saving Agent State:", JSON.stringify(state).substring(0, 100) + "...");

      const mood = state.mood ? JSON.stringify(state.mood) : "{}";
      const emotion = state.emotion ? JSON.stringify(state.emotion) : "{}";
      const relation = state.relation ? JSON.stringify(state.relation) : "{}";
      const systemHealth = state.systemHealth ? JSON.stringify(state.systemHealth) : "{}";
      const lastDreamCycle = state.lastDreamCycle || 0;
      const activePersonaId = state.activePersonaId || 'hiyori';
      const currentPlan = state.currentPlan ? JSON.stringify(state.currentPlan) : null;

      const existing = db.prepare("SELECT id FROM agent_state WHERE id = 1").get();
      if (existing) {
        db.prepare(`
          UPDATE agent_state SET 
            mood = ?, emotion = ?, relation = ?, systemHealth = ?, lastDreamCycle = ?, activePersonaId = ?, currentPlan = ?
          WHERE id = 1
        `).run(mood, emotion, relation, systemHealth, lastDreamCycle, activePersonaId, currentPlan);
      } else {
        db.prepare(`
          INSERT INTO agent_state (id, mood, emotion, relation, systemHealth, lastDreamCycle, lastRefreshed, activePersonaId, currentPlan)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(mood, emotion, relation, systemHealth, lastDreamCycle, Date.now(), activePersonaId, currentPlan);
      }
      broadcastToWS({ type: "state_update", data: { state } });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[STORAGE] POST state error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/state/ai_config", (req, res) => {
    try {
      const row: any = db.prepare("SELECT aiConfig FROM agent_state WHERE id = 1").get();
      res.json(row?.aiConfig ? JSON.parse(row.aiConfig) : null);
    } catch (error: any) {
      console.error("[SERVER] GET ai_config Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/state/ai_config", (req, res) => {
    try {
      db.prepare(`
        INSERT INTO agent_state (id, aiConfig)
        VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET aiConfig = excluded.aiConfig
      `).run(JSON.stringify(req.body));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST ai_config Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/state/avatar_config", (req, res) => {
    try {
      const row: any = db.prepare("SELECT avatarConfig FROM agent_state WHERE id = 1").get();
      res.json(row?.avatarConfig ? JSON.parse(row.avatarConfig) : null);
    } catch (error: any) {
      console.error("[SERVER] GET avatar_config Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/state/avatar_config", (req, res) => {
    try {
      db.prepare(`
        INSERT INTO agent_state (id, avatarConfig)
        VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET avatarConfig = excluded.avatarConfig
      `).run(JSON.stringify(req.body));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST avatar_config Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/knowledge_files/:name", (req, res) => {
    try {
      const { name } = req.params;
      const row: any = db.prepare("SELECT content FROM knowledge_files WHERE name = ?").get(name.toLowerCase());
      if (row) {
        res.json({ content: row.content });
      } else {
        res.status(404).json({ error: "File not found" });
      }
    } catch (error: any) {
      console.error("[SERVER] GET knowledge_files Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/knowledge_files/:name", (req, res) => {
    try {
      const { name } = req.params;
      const { content } = req.body;
      db.prepare(`
        INSERT INTO knowledge_files (name, content, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET content = excluded.content, updatedAt = excluded.updatedAt
      `).run(name.toLowerCase(), content, Date.now());
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST knowledge_files Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/history", (req, res) => {
    try {
      const rows = db.prepare("SELECT entry, cursor, processed, timestamp FROM history ORDER BY id ASC").all();
      res.json(rows.map((r: any) => ({ ...JSON.parse(r.entry), cursor: r.cursor, processed: r.processed === 1, timestamp: r.timestamp })));
    } catch (error: any) {
      console.error("[SERVER] GET history Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/history", (req, res) => {
    try {
      const { entry, cursor, processed } = req.body;
      db.prepare("INSERT INTO history (entry, cursor, processed, timestamp) VALUES (?, ?, ?, ?)").run(
        JSON.stringify(entry),
        cursor || 0,
        processed ? 1 : 0,
        Date.now()
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST history Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/history/cursor", (req, res) => {
    try {
      const row: any = db.prepare("SELECT cursor FROM history ORDER BY id DESC LIMIT 1").get();
      res.json({ cursor: row?.cursor || 0 });
    } catch (error: any) {
      console.error("[SERVER] GET history/cursor Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/capabilities", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM capabilities").all();
      res.json(rows.map((r: any) => ({ ...r, config: JSON.parse(r.config || "{}"), enabled: r.enabled === 1 })));
    } catch (error: any) {
      console.error("[SERVER] GET capabilities Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/capabilities", (req, res) => {
    try {
      const cap = req.body;
      db.prepare(`
        INSERT INTO capabilities (id, name, description, type, enabled, config)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, type = excluded.type, enabled = excluded.enabled, config = excluded.config
      `).run(cap.id, cap.name, cap.description, cap.type, cap.enabled ? 1 : 0, JSON.stringify(cap.config || {}));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST capabilities Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/custom/:key", (req, res) => {
    try {
      const { key } = req.params;
      const row: any = db.prepare("SELECT value FROM custom_storage WHERE key = ?").get(key);
      res.json(row ? JSON.parse(row.value) : null);
    } catch (error: any) {
      console.error("[SERVER] GET custom Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/custom/:key", (req, res) => {
    try {
      const { key } = req.params;
      db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(key, JSON.stringify(req.body), Date.now());
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST custom Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Configuration & Sandbox APIs ---
  app.get("/api/storage/knowledge", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM knowledge").all();
      const knowledge = rows.map((r: any) => ({
        ...r,
        tags: JSON.parse(r.tags || "[]"),
        confidence: r.confidence || 0.5,
        updatedAt: r.updatedAt || Date.now(),
        sourceMemoryIds: []
      }));
      res.json(knowledge);
    } catch (error: any) {
      console.error("[SERVER] GET knowledge Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/knowledge", (req, res) => {
    try {
      const items = req.body;
      db.transaction(() => {
        db.prepare("DELETE FROM knowledge").run();
        const stmt = db.prepare(`
          INSERT INTO knowledge (id, topic, content, tags, confidence, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const k of items) {
          stmt.run(
            k.id || genId(9),
            k.topic,
            k.content,
            JSON.stringify(k.tags || []),
            k.confidence || 0.5,
            k.updatedAt || Date.now()
          );
        }
      })();
      broadcastToWS({ type: "knowledge_update", data: items });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST knowledge Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/purge", (req, res) => {
    try {
      const mode = req.body && req.body.mode ? req.body.mode : "soft";
      
      db.transaction(() => {
        try {
          db.prepare("DELETE FROM history").run();
        } catch (e: any) {
          console.warn("[PURGE] Non-blocking warning: Failed to clear history:", e.message);
        }
        try {
          db.prepare("DELETE FROM custom_storage WHERE key = 'yuihime_episodic_memory'").run();
        } catch (e: any) {
          console.warn("[PURGE] Non-blocking warning: Failed to clear episodic memory:", e.message);
        }

        if (mode === "soft") {
          db.prepare(`
            DELETE FROM memories 
            WHERE (type IN ('interaction', 'chat') OR type IS NULL) 
              AND (importance < 0.8 OR importance IS NULL)
          `).run();
        } else {
          db.prepare("DELETE FROM memories").run();
          db.prepare("DELETE FROM dreams").run();
          db.prepare("DELETE FROM agent_state").run();
          db.prepare("DELETE FROM learned_strategies").run();
          db.prepare("DELETE FROM performance_metrics").run();
          
          db.prepare(`
            INSERT INTO agent_state (id, mood, emotion, relation, systemHealth, lastDreamCycle, lastRefreshed, activePersonaId, currentPlan)
            VALUES (1, '{}', '{}', '{}', '{}', 0, 0, 'hiyori', null)
          `).run();
        }
      })();
      broadcastToWS({ type: "purge_update", data: { mode, timestamp: Date.now() } });
      res.json({ success: true, mode });
    } catch (error: any) {
      console.error("[STORAGE] Purge error:", error);
      res.status(500).json({ error: error.message || "Failed to purge database." });
    }
  });

  app.post("/api/storage/import", (req, res) => {
    try {
      const { history, memories } = req.body;
      db.transaction(() => {
        if (Array.isArray(history)) {
          for (const item of history) {
            db.prepare(`
              INSERT INTO history (entry, cursor, processed, timestamp)
              VALUES (?, ?, ?, ?)
            `).run(
              typeof item.entry === 'string' ? item.entry : JSON.stringify(item.entry || item),
              item.cursor || 0,
              item.processed ? 1 : 0,
              item.timestamp || Date.now()
            );
          }
        }

        if (Array.isArray(memories)) {
          for (const item of memories) {
            db.prepare(`
              INSERT OR REPLACE INTO memories (id, type, content, importance, tags, context, sentiment, timestamp, speaker, chat_type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              item.id || genId(9),
              item.type || 'interaction',
              item.content || '',
              item.importance || 0.5,
              Array.isArray(item.tags) ? JSON.stringify(item.tags) : (typeof item.tags === 'string' ? item.tags : '[]'),
              item.context || null,
              item.sentiment || 0,
              item.timestamp || Date.now(),
              item.speaker || 'Operator',
              item.chat_type || null
            );
          }
        }
      })();

      broadcastToWS({ type: "import_update", data: { timestamp: Date.now() } });
      res.json({ success: true, importedHistory: (history || []).length, importedMemories: (memories || []).length });
    } catch (error: any) {
      console.error("[STORAGE] Import error:", error);
      res.status(500).json({ error: error.message || "Failed to import database." });
    }
  });

  // --- Learning & Strategy APIs ---
  app.get("/api/storage/strategies", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM learned_strategies").all();
      res.json(rows);
    } catch (error: any) {
      console.error("[SERVER] GET strategies Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/strategies", (req, res) => {
    try {
      const strategies = req.body;
      db.transaction(() => {
        const stmt = db.prepare(`
          INSERT INTO learned_strategies (id, topic, instruction, confidence, successCount, failureCount, lastOptimized)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            topic = excluded.topic,
            instruction = excluded.instruction,
            confidence = excluded.confidence,
            successCount = excluded.successCount,
            failureCount = excluded.failureCount,
            lastOptimized = excluded.lastOptimized
        `);
        for (const s of strategies) {
          stmt.run(s.id, s.topic, s.instruction, s.confidence, s.successCount, s.failureCount, s.lastOptimized);
        }
      })();
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST strategies Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/storage/metrics", (req, res) => {
    try {
      const metric = req.body;
      db.prepare(`
        INSERT INTO performance_metrics (timestamp, operation, latency, success, context)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        metric.timestamp || Date.now(),
        metric.operation,
        metric.latency,
        metric.success ? 1 : 0,
        metric.context || null
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] POST metrics Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/metrics/summary", (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT 
          operation, 
          AVG(latency) as avgLatency, 
          SUM(success) as successCount, 
          COUNT(*) as totalCount
        FROM performance_metrics
        GROUP BY operation
      `).all();
      res.json(stats);
    } catch (error: any) {
      console.error("[SERVER] GET metrics/summary Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/metrics/history", (req, res) => {
    try {
      const rows = db.prepare("SELECT timestamp, operation, latency, success FROM performance_metrics ORDER BY timestamp ASC").all();
      res.json(rows);
    } catch (error: any) {
      console.error("[SERVER] GET metrics/history Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- DATABASE CONTROL CRUD ENDPOINTS ---
  app.get("/api/db/tables", (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'memories_fts%' ORDER BY name ASC").all();
      const result = tables.map((t: any) => {
        const countRow = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any;
        return { name: t.name, count: countRow ? countRow.count : 0 };
      });
      res.json({ success: true, tables: result });
    } catch (error: any) {
      console.error("[SERVER] GET /api/db/tables Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/db/table/:tableName", (req, res) => {
    try {
      const tableName = req.params.tableName;
      const limit = parseInt(req.query.limit as string || "50", 10);
      const offset = parseInt(req.query.offset as string || "0", 10);
      const search = (req.query.search as string || "").trim();

      // Verify table exists
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
      if (!tableCheck) {
        return res.status(404).json({ success: false, error: `Table '${tableName}' not found.` });
      }

      // Get columns info
      const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];

      // Primary key column
      const pkCol = columns.find((c: any) => c.pk > 0)?.name || columns[0]?.name || "rowid";

      let rows = [];
      let total = 0;

      if (search) {
        // Simple search across text columns
        const textCols = columns.filter((c: any) => c.type.toUpperCase().includes("TEXT") || c.type.toUpperCase().includes("CHAR") || c.type.toUpperCase().includes("VARCHAR")).map((c: any) => `"${c.name}"`);
        if (textCols.length > 0) {
          const whereClause = textCols.map((col: string) => `${col} LIKE ?`).join(" OR ");
          const searchParams = textCols.map(() => `%${search}%`);
          total = (db.prepare(`SELECT COUNT(*) as count FROM "${tableName}" WHERE ${whereClause}`).get(...searchParams) as any)?.count || 0;
          rows = db.prepare(`SELECT * FROM "${tableName}" WHERE ${whereClause} ORDER BY "${pkCol}" DESC LIMIT ? OFFSET ?`).all(...searchParams, limit, offset);
        } else {
          total = (db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as any)?.count || 0;
          rows = db.prepare(`SELECT * FROM "${tableName}" ORDER BY "${pkCol}" DESC LIMIT ? OFFSET ?`).all(limit, offset);
        }
      } else {
        total = (db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as any)?.count || 0;
        rows = db.prepare(`SELECT * FROM "${tableName}" ORDER BY "${pkCol}" DESC LIMIT ? OFFSET ?`).all(limit, offset);
      }

      res.json({
        success: true,
        tableName,
        primaryKey: pkCol,
        columns: columns.map((c: any) => ({ name: c.name, type: c.type, pk: c.pk, notnull: c.notnull })),
        total,
        limit,
        offset,
        rows
      });
    } catch (error: any) {
      console.error(`[SERVER] GET /api/db/table/${req.params.tableName} Error:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/db/record/:tableName", (req, res) => {
    try {
      const tableName = req.params.tableName;
      const record = req.body;

      if (!record || typeof record !== 'object') {
        return res.status(400).json({ success: false, error: "Record payload required." });
      }

      const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
      if (columns.length === 0) {
        return res.status(404).json({ success: false, error: `Table '${tableName}' not found.` });
      }

      const validColNames = columns.map((c: any) => c.name);
      const pkCol = columns.find((c: any) => c.pk > 0)?.name;

      const keysToSave = Object.keys(record).filter(k => validColNames.includes(k));
      if (keysToSave.length === 0) {
        return res.status(400).json({ success: false, error: "No valid table column fields provided." });
      }

      const values = keysToSave.map(k => record[k]);
      const placeholders = keysToSave.map(() => "?").join(", ");
      const colsList = keysToSave.map(k => `"${k}"`).join(", ");

      if (pkCol && record[pkCol] !== undefined) {
        // Upsert by primary key
        const updateClause = keysToSave.map(k => `"${k}" = excluded."${k}"`).join(", ");
        const query = `
          INSERT INTO "${tableName}" (${colsList})
          VALUES (${placeholders})
          ON CONFLICT("${pkCol}") DO UPDATE SET ${updateClause}
        `;
        db.prepare(query).run(...values);
      } else {
        const query = `INSERT INTO "${tableName}" (${colsList}) VALUES (${placeholders})`;
        db.prepare(query).run(...values);
      }

      res.json({ success: true, message: `Record saved to '${tableName}'` });
    } catch (error: any) {
      console.error(`[SERVER] POST /api/db/record/${req.params.tableName} Error:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/db/record/:tableName", (req, res) => {
    try {
      const tableName = req.params.tableName;
      const pkValue = req.query.pkValue;
      const pkColumn = req.query.pkColumn as string || "id";

      if (!pkValue) {
        return res.status(400).json({ success: false, error: "pkValue query parameter required." });
      }

      const query = `DELETE FROM "${tableName}" WHERE "${pkColumn}" = ?`;
      const result = db.prepare(query).run(pkValue);

      res.json({ success: true, changes: result.changes, message: `Deleted ${result.changes} record(s) from '${tableName}'` });
    } catch (error: any) {
      console.error(`[SERVER] DELETE /api/db/record/${req.params.tableName} Error:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // --- Live Stream Connection WebSocket & SSE Gateways ---
}