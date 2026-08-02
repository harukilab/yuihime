import { getDb, retryDbOperation } from "@/core/database.js";
import { SettingsManager } from "@/core/kernel/settings.js";
import { resolveDataPath } from "@/core/systemPaths.js";
import fs from "fs";
import path from "path";

const db = getDb();
const workflowPath = resolveDataPath("workflow.json");

export class StorageServer {
  // --- Knowledge ---
  static async getKnowledge() {
    try {
      const rows = db.prepare("SELECT * FROM knowledge").all();
      return rows.map((r: any) => ({
        ...r,
        tags: r.tags ? JSON.parse(r.tags) : [],
        confidence: r.confidence || 0.5,
        updatedAt: r.updatedAt || Date.now()
      }));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get knowledge:", e);
      return [];
    }
  }

  static async saveKnowledge(knowledge: any[]) {
    try {
      db.transaction(() => {
        db.prepare("DELETE FROM knowledge").run();
        const insert = db.prepare(`
          INSERT INTO knowledge (id, topic, content, tags, confidence, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const k of knowledge) {
          insert.run(
            k.id,
            k.topic,
            k.content,
            JSON.stringify(k.tags || []),
            k.confidence || 0.5,
            k.updatedAt || Date.now()
          );
        }
      })();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save knowledge:", e);
    }
  }

  // --- Memories ---
  static async getMemories(context?: string) {
    try {
      let rows;
      if (context) {
        rows = db.prepare("SELECT * FROM memories WHERE context = ? ORDER BY timestamp DESC").all(context);
      } else {
        rows = db.prepare("SELECT * FROM memories ORDER BY timestamp DESC").all();
      }
      return rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        speaker: r.speaker,
        content: r.content,
        timestamp: r.timestamp,
        context: r.context,
        tags: r.tags ? JSON.parse(r.tags) : [],
        importance: r.importance || 1,
        meta: r.meta ? JSON.parse(r.meta) : {}
      }));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get memories:", e);
      return [];
    }
  }

  static async saveMemory(memory: any): Promise<any> {
    try {
      return await retryDbOperation(() => {
        const id = Math.random().toString(36).substring(2, 11);
        db.prepare(`
          INSERT INTO memories (id, type, speaker, content, timestamp, context, tags, importance, meta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          memory.type || "dialogue",
          memory.speaker || "user",
          memory.content,
          memory.timestamp || Date.now(),
          memory.context || "web_default",
          JSON.stringify(memory.tags || []),
          memory.importance || 1,
          JSON.stringify(memory.meta || {})
        );
        return { id, ...memory };
      }, 'StorageServer.saveMemory');
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save memory:", e);
      throw e;
    }
  }

  static async deleteMemoriesByContext(context: string) {
    try {
      db.prepare("DELETE FROM memories WHERE context = ?").run(context);
      return true;
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to delete memories by context:", e);
      return false;
    }
  }

  static async deleteMemories(params: { context?: string; type?: string; id?: string; ids?: string[] }) {
    try {
      let query = "DELETE FROM memories WHERE 1=1";
      const args: any[] = [];
      if (params.context) {
        query += " AND context = ?";
        args.push(params.context);
      }
      if (params.type) {
        query += " AND type = ?";
        args.push(params.type);
      }
      if (params.id) {
        query += " AND id = ?";
        args.push(params.id);
      }
      if (params.ids && params.ids.length > 0) {
        query += ` AND id IN (${params.ids.map(() => "?").join(",")})`;
        args.push(...params.ids);
      }
      const info = db.prepare(query).run(...args);
      return { success: true, deletedCount: info.changes };
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to delete memories:", e);
      return { success: false, deletedCount: 0 };
    }
  }

  // --- Identities ---
  static async getIdentities() {
    try {
      const rows = db.prepare("SELECT * FROM identities").all();
      return rows.map((r: any) => ({
        id: r.id,
        perceivedName: r.perceivedName,
        realName: r.realName || "",
        trust: r.trust || 50,
        affection: r.affection || 10,
        reputation: r.reputation || 50,
        linkedAccounts: r.linkedAccounts ? JSON.parse(r.linkedAccounts) : [],
        importantFacts: r.importantFacts ? JSON.parse(r.importantFacts) : [],
        traits: r.traits ? JSON.parse(r.traits) : [],
        yuiPerspective: r.yuiPerspective || "",
        lastInteraction: r.lastInteraction || Date.now(),
        createdAt: r.createdAt || Date.now()
      }));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get identities:", e);
      return [];
    }
  }

  static async saveIdentity(identity: any) {
    try {
      db.prepare(`
        INSERT INTO identities (id, perceivedName, realName, trust, affection, reputation, linkedAccounts, importantFacts, traits, yuiPerspective, lastInteraction, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          perceivedName = excluded.perceivedName,
          realName = excluded.realName,
          trust = excluded.trust,
          affection = excluded.affection,
          reputation = excluded.reputation,
          linkedAccounts = excluded.linkedAccounts,
          importantFacts = excluded.importantFacts,
          traits = excluded.traits,
          yuiPerspective = excluded.yuiPerspective,
          lastInteraction = excluded.lastInteraction
      `).run(
        identity.id,
        identity.perceivedName,
        identity.realName || "",
        identity.trust || 50,
        identity.affection || 10,
        identity.reputation || 50,
        JSON.stringify(identity.linkedAccounts || []),
        JSON.stringify(identity.importantFacts || []),
        JSON.stringify(identity.traits || []),
        identity.yuiPerspective || "",
        identity.lastInteraction || Date.now(),
        identity.createdAt || Date.now()
      );
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save identity:", e);
    }
  }

  // --- Dreams ---
  static async getDreams() {
    try {
      const rows = db.prepare("SELECT * FROM dreams").all();
      return rows.map((r: any) => ({
        id: r.id,
        concept: r.concept,
        abstractions: JSON.parse(r.abstractions || "[]"),
        strength: r.strength,
        lastReinforced: r.lastReinforced || Date.now(),
        underlyingMemories: JSON.parse(r.underlyingMemories || "[]")
      }));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get dreams:", e);
      return [];
    }
  }

  static async saveDreams(dreams: any[]) {
    try {
      db.transaction(() => {
        db.prepare("DELETE FROM dreams").run();
        const insert = db.prepare(`
          INSERT INTO dreams (id, concept, abstractions, strength, lastReinforced, underlyingMemories)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const d of dreams) {
          insert.run(
            d.id || Math.random().toString(36).substr(2, 9),
            d.concept,
            JSON.stringify(d.abstractions || []),
            d.strength,
            d.lastReinforced || Date.now(),
            JSON.stringify(d.underlyingMemories || [])
          );
        }
      })();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save dreams:", e);
    }
  }

  // --- Agent State ---
  static async getAgentState() {
    try {
      const row: any = db.prepare("SELECT * FROM agent_state LIMIT 1").get();
      if (!row) return null;
      return {
        status: row.status,
        energy: row.energy,
        mood: row.mood ? JSON.parse(row.mood) : {},
        emotion: row.emotion ? JSON.parse(row.emotion) : {},
        relation: row.relation ? JSON.parse(row.relation) : {},
        activePersonaId: row.activePersonaId,
        tone: row.tone ? JSON.parse(row.tone) : {},
        activeContext: row.activeContext ? JSON.parse(row.activeContext) : [],
        lastDreamCycle: row.lastDreamCycle,
        systemHealth: row.systemHealth ? JSON.parse(row.systemHealth) : {}
      };
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get agent state:", e);
      return null;
    }
  }

  static async saveAgentState(state: any) {
    try {
      await retryDbOperation(() => {
        const current = db.prepare("SELECT * FROM agent_state LIMIT 1").get();
        if (!current) {
          db.prepare(`
            INSERT INTO agent_state (id, status, energy, mood, emotion, relation, activePersonaId, tone, activeContext, lastDreamCycle, systemHealth)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            "default",
            state.status || "idle",
            state.energy !== undefined ? state.energy : 100,
            JSON.stringify(state.mood || {}),
            JSON.stringify(state.emotion || {}),
            JSON.stringify(state.relation || {}),
            state.activePersonaId || "auto",
            JSON.stringify(state.tone || {}),
            JSON.stringify(state.activeContext || []),
            state.lastDreamCycle || 0,
            JSON.stringify(state.systemHealth || {})
          );
        } else {
          const merged = {
            status: state.status !== undefined ? state.status : current.status,
            energy: state.energy !== undefined ? state.energy : current.energy,
            mood: JSON.stringify({ ...JSON.parse(current.mood || "{}"), ...(state.mood || {}) }),
            emotion: JSON.stringify({ ...JSON.parse(current.emotion || "{}"), ...(state.emotion || {}) }),
            relation: JSON.stringify({ ...JSON.parse(current.relation || "{}"), ...(state.relation || {}) }),
            activePersonaId: state.activePersonaId !== undefined ? state.activePersonaId : current.activePersonaId,
            tone: JSON.stringify({ ...JSON.parse(current.tone || "{}"), ...(state.tone || {}) }),
            activeContext: JSON.stringify(state.activeContext !== undefined ? state.activeContext : JSON.parse(current.activeContext || "[]")),
            lastDreamCycle: state.lastDreamCycle !== undefined ? state.lastDreamCycle : current.lastDreamCycle,
            systemHealth: JSON.stringify({ ...JSON.parse(current.systemHealth || "{}"), ...(state.systemHealth || {}) })
          };
          db.prepare(`
            UPDATE agent_state SET
              status = ?, energy = ?, mood = ?, emotion = ?, relation = ?, activePersonaId = ?, tone = ?, activeContext = ?, lastDreamCycle = ?, systemHealth = ?
            WHERE id = ?
          `).run(
            merged.status,
            merged.energy,
            merged.mood,
            merged.emotion,
            merged.relation,
            merged.activePersonaId,
            merged.tone,
            merged.activeContext,
            merged.lastDreamCycle,
            merged.systemHealth,
            current.id
          );
        }
      }, 'StorageServer.saveAgentState');
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save agent state:", e);
    }
  }

  // --- Strategies ---
  static async getStrategies() {
    try {
      const rows = db.prepare("SELECT * FROM learned_strategies").all();
      return rows.map((r: any) => ({
        id: r.id,
        topic: r.topic,
        instruction: r.instruction,
        confidence: r.confidence || 0.5,
        successCount: r.successCount || 0,
        failureCount: r.failureCount || 0,
        lastOptimized: r.lastOptimized || Date.now()
      }));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get strategies:", e);
      return [];
    }
  }

  static async saveStrategies(strategies: any[]) {
    try {
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
          stmt.run(
            s.id,
            s.topic,
            s.instruction,
            s.confidence || 0.5,
            s.successCount || 0,
            s.failureCount || 0,
            s.lastOptimized || Date.now()
          );
        }
      })();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save strategies:", e);
    }
  }

  // --- Capabilities ---
  static async getCapabilities() {
    try {
      const rows = db.prepare("SELECT * FROM capabilities").all();
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        type: r.type,
        enabled: r.enabled === 1 || r.enabled === true,
        config: r.config ? JSON.parse(r.config) : {}
      }));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get capabilities:", e);
      return [];
    }
  }

  static async saveCapability(cap: any) {
    try {
      db.prepare(`
        INSERT INTO capabilities (id, name, description, type, enabled, config)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          type = excluded.type,
          enabled = excluded.enabled,
          config = excluded.config
      `).run(cap.id, cap.name, cap.description, cap.type, cap.enabled ? 1 : 0, JSON.stringify(cap.config || {}));
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save capability:", e);
    }
  }

  // --- Modular Settings ---
  static async getModularSettings() {
    try {
      return await SettingsManager.getInstance().load();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get modular settings:", e);
      return {};
    }
  }

  static async saveModularSettings(settings: any) {
    try {
      await SettingsManager.getInstance().save(settings);
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save modular settings:", e);
    }
  }

  // --- Custom Storage ---
  static async getCustom(key: string) {
    try {
      const row: any = db.prepare("SELECT value FROM custom_storage WHERE key = ?").get(key);
      return row ? JSON.parse(row.value) : null;
    } catch (e) {
      console.error(`[STORAGE_SERVER] Failed to get custom storage for ${key}:`, e);
      return null;
    }
  }

  static async saveCustom(key: string, value: any): Promise<void> {
    try {
      await retryDbOperation(() => {
        db.prepare(`
          INSERT INTO custom_storage (key, value, updatedAt)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
        `).run(key, JSON.stringify(value), Date.now());
      }, `StorageServer.saveCustom ${key}`);
    } catch (e) {
      console.error(`[STORAGE_SERVER] Failed to save custom storage for ${key}:`, e);
    }
  }

  // --- Workflow ---
  static async getWorkflow() {
    try {
      if (fs.existsSync(workflowPath)) {
        return JSON.parse(fs.readFileSync(workflowPath, "utf-8"));
      }
      return null;
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get workflow:", e);
      return null;
    }
  }

  static async saveWorkflow(workflow: any) {
    try {
      fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2), "utf-8");
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save workflow:", e);
    }
  }

  // --- Pending Messages ---
  static async getPendingMessages() {
    try {
      return db.prepare("SELECT * FROM pending_messages WHERE status = 'pending' ORDER BY timestamp DESC LIMIT 100").all();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get pending messages:", e);
      return [];
    }
  }

  static async deletePendingMessage(id: string) {
    try {
      db.prepare("DELETE FROM pending_messages WHERE id = ?").run(id);
      return true;
    } catch (e) {
      console.error(`[STORAGE_SERVER] Failed to delete pending message ${id}:`, e);
      return false;
    }
  }

  static async clearPendingQueue() {
    try {
      db.prepare("DELETE FROM pending_messages").run();
      return true;
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to clear pending queue:", e);
      return false;
    }
  }

  // --- Performance Metrics ---
  static async getPerformanceHistory() {
    try {
      return db.prepare("SELECT timestamp, operation, latency, success FROM performance_metrics ORDER BY timestamp ASC").all();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get performance history:", e);
      return [];
    }
  }

  static async savePerformanceMetric(metric: any) {
    try {
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
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to save performance metric:", e);
    }
  }

  static async getPerformanceSummary() {
    try {
      return db.prepare(`
        SELECT 
          operation, 
          AVG(latency) as avgLatency, 
          SUM(success) as successCount, 
          COUNT(*) as totalCount
        FROM performance_metrics
        GROUP BY operation
      `).all();
    } catch (e) {
      console.error("[STORAGE_SERVER] Failed to get performance summary:", e);
      return [];
    }
  }
}
