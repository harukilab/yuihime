import { readFileSync } from "fs";
import path from "path";
import { Kernel } from "./core.js";
import { AIService } from "./ai.js";
import { Soul } from "../soul.js";
import Database from "better-sqlite3";
import { Cortex } from "../cortex.js";
import { Memory, Dream, Identity } from "../../include/types.js";

export class NeuralInterface {
  private static db: any;

  public static setDatabase(db: any) {
    this.db = db;
  }

  /**
   * Unified interface for processing input from any channel (Telegram, Discord, etc.)
   */
  public static async processNeuralInput(input: string, senderName: string, contextId: string, chatType: string, isProactive: boolean = false, taskId?: string) {
    const kernel = Kernel.getInstance();
    
    // Unify brain by running Cortex natively
    const cortex = new Cortex();

    // 1. Get State from DB
    const stateRow: any = this.db.prepare("SELECT * FROM agent_state WHERE id = 1").get();
    let computedActivePersonaId = stateRow ? (stateRow.activePersonaId || 'hiyori') : 'hiyori';
    if (computedActivePersonaId === 'polite' || !['hiyori', 'aether', 'nova'].includes(computedActivePersonaId)) {
      computedActivePersonaId = 'hiyori';
    }

    const state: any = stateRow ? {
      status: stateRow.status || 'idle',
      energy: stateRow.energy !== undefined ? stateRow.energy : 100,
      mood: JSON.parse(stateRow.mood || "{}"),
      emotion: JSON.parse(stateRow.emotion || "{}"),
      relation: JSON.parse(stateRow.relation || "{}"),
      activePersonaId: computedActivePersonaId,
      tone: stateRow.tone ? JSON.parse(stateRow.tone) : { pitch: 1.0, speed: 1.0, emotionalBias: 'neutral' },
      activeContext: stateRow.activeContext ? JSON.parse(stateRow.activeContext) : [],
      lastDreamCycle: stateRow.lastDreamCycle || 0,
      systemHealth: stateRow.systemHealth ? JSON.parse(stateRow.systemHealth) : { latency: 0, successRate: 1.0, tasksCompleted: 0 },
      heuristics: [],
      knowledge: []
    } : {
      status: 'idle',
      energy: 100,
      mood: { joy: 50, anger: 0, sadness: 0, stress: 0, irritation: 0, excitement: 10, embarrassment: 0, curiosity: 50, dopamine: 15, serotonin: 50, oxytocin: 30, noradrenaline: 10, lastUpdate: Date.now() },
      emotion: { arousal: 30, valence: 50, focus: 50, rapport: 30, lastUpdate: Date.now() },
      relation: { trust: 50, affection: 10, reputation: 50, lastInteraction: Date.now() },
      activePersonaId: 'hiyori',
      tone: { pitch: 1.0, speed: 1.0, emotionalBias: 'neutral' },
      activeContext: [],
      lastDreamCycle: 0,
      systemHealth: { latency: 0, successRate: 1.0, tasksCompleted: 0 },
      heuristics: [],
      knowledge: []
    };

    // Wake up if currently sleeping
    if (state.status === 'sleeping') {
      console.log(`[NEURAL_INTERFACE] Waking up Yuihime from Sleep Mode on incoming platform message from ${senderName}...`);
      state.status = 'idle';
      this.db.prepare("UPDATE agent_state SET status = 'idle' WHERE id = 1").run();
    }

    // 2. Load heuristics / strategies
    const strategyRows = this.db.prepare("SELECT * FROM learned_strategies").all();
    const strategies = strategyRows.map((r: any) => ({
      id: r.id,
      topic: r.topic,
      instruction: r.instruction,
      confidence: r.confidence || 0.5,
      successCount: r.successCount || 0,
      failureCount: r.failureCount || 0,
      lastOptimized: r.lastOptimized || Date.now()
    }));
    state.heuristics = strategies;

    // Load knowledge
    const knowledgeRows = this.db.prepare("SELECT * FROM knowledge").all();
    state.knowledge = knowledgeRows.map((r: any) => ({
      id: r.id,
      topic: r.topic,
      content: r.content,
      tags: r.tags ? JSON.parse(r.tags) : [],
      confidence: r.confidence || 0.8,
      updatedAt: r.updatedAt || Date.now()
    }));

    // 3. Get Recent Context memories (relocated further down to support dynamic cross-platform memory merging)
    let memories: Memory[] = [];

    // 4. Load dreams
    const dreamRows = this.db.prepare("SELECT * FROM dreams").all();
    const dreams: Dream[] = dreamRows.map((r: any) => ({
      id: r.id,
      concept: r.concept,
      abstractions: r.abstractions ? JSON.parse(r.abstractions) : [],
      strength: r.strength || 0.5,
      lastReinforced: r.lastReinforced || Date.now(),
      underlyingMemories: r.underlyingMemories ? JSON.parse(r.underlyingMemories) : []
    }));

    // 5. Load capabilities
    const capRows = this.db.prepare("SELECT * FROM capabilities").all();
    const capabilities = capRows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      enabled: r.enabled === 1,
      config: r.config ? JSON.parse(r.config) : {}
    }));

    // 6. Get identities
    const identityRows = this.db.prepare("SELECT * FROM identities").all();
    const allIdentities: Identity[] = identityRows.map((r: any) => ({
      id: r.id,
      perceivedName: r.perceivedName,
      realName: r.realName,
      habits: r.habits ? JSON.parse(r.habits) : [],
      importantFacts: r.importantFacts ? JSON.parse(r.importantFacts) : [],
      linkedAccounts: r.linkedAccounts ? JSON.parse(r.linkedAccounts) : [],
      lastMet: r.lastMet || r.lastInteraction || Date.now(),
      ownerId: r.ownerId || 'local_user',
      source: r.source || 'telegram',
      traits: r.traits ? JSON.parse(r.traits) : [],
      trust: r.trust !== undefined ? r.trust : 50,
      affection: r.affection !== undefined ? r.affection : 50,
      reputation: r.reputation !== undefined ? r.reputation : 50,
      yuiPerspective: r.yuiPerspective || ""
    }));

    // Resolve paired/linked identity if from Telegram
    let pairedIdentityId: string | null = null;
    let tgIdStr: string | null = null;
    const cleanContextId = contextId ? contextId.split("|")[0] : "";

    if (contextId && contextId.startsWith("tg_")) {
      const parts = contextId.split("|");
      tgIdStr = parts[0].replace("tg_", "");
      if (parts[1] && parts[1].startsWith("usr_")) {
        tgIdStr = parts[1].replace("usr_", "");
      }

      const tgIdNum = parseInt(tgIdStr);
      if (!isNaN(tgIdNum)) {
        try {
          const tgUser = this.db.prepare("SELECT context FROM telegram_users WHERE tg_id = ?").get(tgIdNum) as any;
          if (tgUser && tgUser.context && tgUser.context.startsWith("linked_identity:")) {
            pairedIdentityId = tgUser.context.replace("linked_identity:", "");
          }
        } catch (err) {
          console.error("[NEURAL_INTERFACE_USER_MATCH_RESOLVE] Error querying telegram_users:", err);
        }
      }
    }

    // Identify current channel receiver
    const platformTag = `${chatType.toLowerCase()}:${senderName}`;
    let receiverIdentity = allIdentities.find((id: any) => 
      (pairedIdentityId && id.id === pairedIdentityId) ||
      (tgIdStr && id.linkedAccounts && id.linkedAccounts.some((acc: string) => acc.toLowerCase() === `telegram:id:${tgIdStr}`.toLowerCase())) ||
      (id.linkedAccounts && id.linkedAccounts.some((acc: string) => acc.toLowerCase() === platformTag.toLowerCase())) || 
      (id.perceivedName && id.perceivedName.toLowerCase() === senderName.toLowerCase())
    );

    if (!receiverIdentity) {
      // Auto register to identities
      const id = Math.random().toString(36).substr(2, 9);
      const linked = [platformTag];
      if (tgIdStr) {
        linked.push(`telegram:id:${tgIdStr}`);
      }
      this.db.prepare(`
        INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, trust, affection, reputation)
        VALUES (?, ?, ?, '[]', '[]', ?, ?, 50, 50, 50)
      `).run(id, senderName, senderName, JSON.stringify(linked), Date.now());
      receiverIdentity = {
        id,
        perceivedName: senderName,
        realName: senderName,
        habits: [],
        importantFacts: [],
        linkedAccounts: linked,
        lastMet: Date.now(),
        ownerId: 'local_user',
        source: 'telegram',
        traits: [],
        trust: 50,
        affection: 50,
        reputation: 50
      };
      allIdentities.push(receiverIdentity);
    } else {
      this.db.prepare("UPDATE identities SET lastInteraction = ? WHERE id = ?").run(Date.now(), receiverIdentity.id);
    }

    // On-the-fly deduplication alignment and self-healing merge (resolves any case splits/duplications gracefully)
    try {
      const dbModulePath = "../database.js";
      const { deduplicateAndMergeIdentities } = await import(/* @vite-ignore */ dbModulePath);
      deduplicateAndMergeIdentities(this.db, receiverIdentity.id);
      
      // Reload receiver identity to pick up any merged facts/stats/habits/linkedAccounts
      const refreshed = this.db.prepare("SELECT * FROM identities WHERE id = ?").get(receiverIdentity.id) as any;
      if (refreshed) {
        receiverIdentity = {
          ...receiverIdentity,
          perceivedName: refreshed.perceivedName,
          realName: refreshed.realName,
          habits: refreshed.habits ? JSON.parse(refreshed.habits) : [],
          importantFacts: refreshed.importantFacts ? JSON.parse(refreshed.importantFacts) : [],
          linkedAccounts: refreshed.linkedAccounts ? JSON.parse(refreshed.linkedAccounts) : [],
          lastMet: refreshed.lastMet || refreshed.lastInteraction || Date.now(),
          trust: refreshed.trust !== undefined ? refreshed.trust : receiverIdentity.trust,
          affection: refreshed.affection !== undefined ? refreshed.affection : receiverIdentity.affection,
          reputation: refreshed.reputation !== undefined ? refreshed.reputation : receiverIdentity.reputation,
          yuiPerspective: refreshed.yuiPerspective || ""
        };
      }
    } catch (mergeErr: any) {
      console.warn("[NEURAL_INTERFACE_MERGE] Self-healing merge warn:", mergeErr.message);
    }

    const { DEFAULT_NEURAL_CORES } = await import("../../constants.js");
    const activePersona = DEFAULT_NEURAL_CORES.find(c => c.id === state.activePersonaId) || DEFAULT_NEURAL_CORES[1];

    // Establish personal, user-specific relationship stats
    const userRelation = {
      uid: receiverIdentity.id || senderName,
      trust: receiverIdentity.trust !== undefined ? receiverIdentity.trust : 50,
      affection: receiverIdentity.affection !== undefined ? receiverIdentity.affection : 50,
      reputation: receiverIdentity.reputation !== undefined ? receiverIdentity.reputation : 50,
      lastInteraction: receiverIdentity.lastMet || Date.now()
    };

    // Patch state.relation dynamically with this user's feelings for Yuihime's thoughts
    const customState = {
      ...state,
      relation: userRelation
    };

    // Dynamically query merged cross-platform memories if a paired identity resides in either Web or Telegram
    const targetContexts = new Set<string>();
    targetContexts.add(cleanContextId);

    if (receiverIdentity && Array.isArray(receiverIdentity.linkedAccounts)) {
      for (const acc of receiverIdentity.linkedAccounts) {
        const cleanAcc = acc.toLowerCase();
        if (cleanAcc.startsWith("telegram:id:")) {
          const tgId = acc.split(":")[2];
          if (tgId) {
            targetContexts.add(`tg_${tgId}`);
          }
        }
      }
      
      const hasTelegramLinked = receiverIdentity.linkedAccounts.some((acc: string) => acc.toLowerCase().startsWith("telegram"));
      if (hasTelegramLinked) {
        targetContexts.add("live_stream");
      }
    }

    const contextsList = Array.from(targetContexts);
    let historyRows: any[] = [];
    
    if (contextsList.length > 0) {
      const dbLikeClauses = contextsList.map(() => "context LIKE ?").join(" OR ");
      const dbQueryParams = contextsList.map(c => `%${c}%`);
      const recentRows = this.db.prepare(`
        SELECT * FROM memories 
        WHERE ${dbLikeClauses} 
        ORDER BY timestamp DESC 
        LIMIT 100
      `).all(...dbQueryParams);
      historyRows = recentRows.reverse();
    }

    memories = historyRows.map((r: any) => ({
      id: r.id,
      ownerId: r.ownerId || 'local_user',
      type: r.type || 'interaction',
      content: r.content,
      importance: r.importance || 0.4,
      tags: r.tags ? JSON.parse(r.tags) : [],
      context: r.context,
      sentiment: r.sentiment || 0.5,
      timestamp: r.timestamp,
      speaker: r.speaker || 'Unknown'
    }));

    // Call native Cortex.think
    const result = await cortex.think(
      input,
      memories,
      dreams,
      capabilities,
      customState,
      state.heuristics,
      isProactive ? "System" : senderName,
      allIdentities,
      activePersona,
      contextId,
      chatType,
      taskId
    );

    if (result.systemHealth) {
      state.systemHealth = result.systemHealth;
    }

    // 7. Mood & Relation & Emotion vectors update
    const updatedSentiment = result.sentiment !== undefined ? result.sentiment : 0.5;
    const sentimentImpact = result.sentiment !== undefined ? {
      joy: result.sentiment > 0.6 ? 2 : (result.sentiment < 0.4 ? -1 : 0),
      curiosity: 1,
      stress: result.sentiment < 0.3 ? 2 : -1
    } : {};
    
    const combinedMoodImpact = {
      ...sentimentImpact,
      ...(result.moodImpact || result.nextMood || {}),
      ...(result.moodDelta || {})
    };
    
    let updatedMood = Soul.updateMood(state.mood, combinedMoodImpact);
    updatedMood = Soul.applyInhibition(updatedMood);
    
    let updatedRelation = Soul.updateRelation(userRelation, updatedSentiment, true);
    if (result.relationDelta) {
      updatedRelation = {
        ...updatedRelation,
        trust: Math.min(100, Math.max(0, updatedRelation.trust + (result.relationDelta.trust || 0))),
        affection: Math.min(100, Math.max(0, updatedRelation.affection + (result.relationDelta.affection || 0))),
        reputation: Math.min(100, Math.max(0, (updatedRelation.reputation || 50) + (result.relationDelta.reputation || 0)))
      };
    }
    const updatedEmotion = Soul.updateEmotion(state.emotion, updatedMood, updatedRelation);

    // Persist personal relationship stats in SQLite database entry for the active user
    const dbTrust = result.queuedIdentityUpdate?.trust !== undefined ? result.queuedIdentityUpdate.trust : updatedRelation.trust;
    const dbAffection = result.queuedIdentityUpdate?.affection !== undefined ? result.queuedIdentityUpdate.affection : updatedRelation.affection;
    const dbReputation = result.queuedIdentityUpdate?.reputation !== undefined ? result.queuedIdentityUpdate.reputation : (updatedRelation.reputation || 50);

    this.db.prepare("UPDATE identities SET trust = ?, affection = ?, reputation = ?, lastInteraction = ? WHERE id = ?")
      .run(dbTrust, dbAffection, dbReputation, Date.now(), receiverIdentity.id);

    this.db.prepare("UPDATE agent_state SET mood = ?, emotion = ?, relation = ?, systemHealth = ?, activePersonaId = ?, currentPlan = ? WHERE id = 1")
      .run(JSON.stringify(updatedMood), JSON.stringify(updatedEmotion), JSON.stringify(updatedRelation), JSON.stringify(state.systemHealth), result.updatedPlan ? result.updatedPlan.id : state.activePersonaId, result.updatedPlan ? JSON.stringify(result.updatedPlan) : (state.currentPlan ? JSON.stringify(state.currentPlan) : null));

    // Broadcast updated state to browser web sockets for live UI rendering
    try {
      const { broadcastToWS } = await import("../server/apiRouter.js");
      broadcastToWS({
        type: "state_update",
        data: {
          state: {
            mood: updatedMood,
            emotion: updatedEmotion,
            relation: updatedRelation,
            systemHealth: state.systemHealth,
            activePersonaId: result.updatedPlan ? result.updatedPlan.id : state.activePersonaId,
            currentPlan: result.updatedPlan || state.currentPlan
          }
        }
      });
    } catch (wsErr) {}

    // 8. Store Memories
    if (result.newMemories && result.newMemories.length > 0) {
      for (const m of result.newMemories) {
        // Only insert if it doesn't already exist to avoid constraints
        const exists = this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(m.id);
        if (!exists) {
          this.db.prepare(`
            INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            m.id || Math.random().toString(36).substr(2, 9),
            m.type || 'interaction',
            m.content,
            m.importance || 0.4,
            m.speaker || 'agent',
            cleanContextId,
            m.timestamp || Date.now(),
            m.tags ? JSON.stringify(m.tags) : '[]',
            updatedSentiment
          );
        }
      }
    } else {
      if (isProactive) {
        const systemEventMemoryId = Math.random().toString(36).substr(2, 9);
        this.db.prepare(`
          INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
          VALUES (?, 'event', ?, 0.2, 'system', ?, ?, '["impulse", "proactive"]', ?)
        `).run(systemEventMemoryId, `[System event]: Yui felt a longing impulse and initiated contact.`, cleanContextId, Date.now(), updatedSentiment);
      } else {
        const userMemoryId = Math.random().toString(36).substr(2, 9);
        this.db.prepare(`
          INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
          VALUES (?, 'interaction', ?, 0.4, ?, ?, ?, '[]', ?)
        `).run(userMemoryId, input, senderName, cleanContextId, Date.now(), updatedSentiment);
      }

      const agentMemoryId = Math.random().toString(36).substr(2, 9);
      this.db.prepare(`
        INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
        VALUES (?, 'interaction', ?, 0.5, 'agent', ?, ?, '[]', ?)
      `).run(agentMemoryId, result.response, cleanContextId, Date.now() + 10, updatedSentiment);
    }

    // 9. Update identity updates
    if (result.viewerProfileUpdate || result.perceivedNameUpdate || result.linkedAccountUpdate) {
      let currentHabits = receiverIdentity.habits || [];
      let currentFacts = receiverIdentity.importantFacts || [];
      let currentLinks = receiverIdentity.linkedAccounts || [];

      if (result.viewerProfileUpdate?.habits) {
        currentHabits = [...new Set([...currentHabits, ...result.viewerProfileUpdate.habits])].slice(-10);
      }
      if (result.viewerProfileUpdate?.importantFacts) {
        currentFacts = [...new Set([...currentFacts, ...result.viewerProfileUpdate.importantFacts])];
      }
      if (result.linkedAccountUpdate) {
        if (Array.isArray(result.linkedAccountUpdate)) {
          currentLinks = [...new Set([...currentLinks, ...result.linkedAccountUpdate])];
        } else {
          currentLinks = [...new Set([...currentLinks, result.linkedAccountUpdate])];
        }
      }

      this.db.prepare(`
        UPDATE identities SET 
          perceivedName = ?, 
          realName = ?, 
          habits = ?, 
          importantFacts = ?, 
          linkedAccounts = ?,
          lastInteraction = ?
        WHERE id = ?
      `).run(
        result.perceivedNameUpdate || receiverIdentity.perceivedName,
        result.viewerProfileUpdate?.realName || receiverIdentity.realName || senderName,
        JSON.stringify(currentHabits),
        JSON.stringify(currentFacts),
        JSON.stringify(currentLinks),
        Date.now(),
        receiverIdentity.id
      );
    }

    if (result.fallbackTriggered) {
      console.log(`[NEURAL_INTERFACE] Gateway fallback triggered for ${senderName} (${chatType}). Menyimpan ke antrean luring (pending_messages)...`);
      try {
        const pendingId = "pending_" + Math.random().toString(36).substr(2, 9);
        this.db.prepare(`
          INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
        `).run(pendingId, input, senderName, contextId, chatType, Date.now());
      } catch (dbErr: any) {
        console.error("[NEURAL_INTERFACE_FALLBACK_ERR] Gagal menyimpan pesan fallback ke database:", dbErr.message);
      }
    }

    // Call Forgetfulness Decay & Compaction Engine for Perfect Giftia OS
    NeuralInterface.performForgetfulnessProtocol(contextId);

    return result.response;
  }

  private static performForgetfulnessProtocol(contextId: string) {
    if (!contextId) return;
    try {
      console.log(`[FORGETFULNESS_ALGORITHM] Running Memory Decaying & Compression for context: ${contextId}`);
      
      // 1. Natural Data Decay: Decrease importance of non-system raw memories by 0.05
      // Decay memories older than 5 minutes
      const fiveMinutesAgo = Date.now() - 300000;
      NeuralInterface.db.prepare(`
        UPDATE memories 
        SET importance = MAX(0.0, importance - 0.05) 
        WHERE context = ? AND speaker != 'system' AND timestamp < ?
      `).run(contextId, fiveMinutesAgo);

      // Delete memories whose importance is extremely low (< 0.15)
      NeuralInterface.db.prepare(`
        DELETE FROM memories 
        WHERE context = ? AND importance < 0.15 AND speaker != 'system' AND timestamp < ?
      `).run(contextId, fiveMinutesAgo);

      // 2. Experience Abstraction: if total messages in this context exceeds 150, consolidate oldest 30
      const countRow: any = NeuralInterface.db.prepare(`
        SELECT COUNT(*) as count FROM memories WHERE context = ?
      `).get(contextId);

      const totalCount = countRow ? countRow.count : 0;
      if (totalCount > 150) {
        console.log(`[FORGETFULNESS_ALGORITHM] Memory Count (${totalCount}) exceeded threshold of 150 in ${contextId}. Beginning semantic integration...`);
        
        // Retrieve the oldest 30 interactions
        const oldestRows: any[] = NeuralInterface.db.prepare(`
          SELECT * FROM memories 
          WHERE context = ? AND speaker != 'system' 
          ORDER BY timestamp ASC 
          LIMIT 30
        `).all(contextId);

        if (oldestRows.length >= 20) {
          const timestampRangeStart = new Date(oldestRows[0].timestamp).toLocaleTimeString();
          const timestampRangeEnd = new Date(oldestRows[oldestRows.length - 1].timestamp).toLocaleTimeString();
          
          const compressedSummary = `Kakak membahas beberapa topik hangat antara pukul ${timestampRangeStart} dan ${timestampRangeEnd}. Kakak mengekspresikan hobi, pemikiran, dan rasa pedulinya kepada Yui secara tulus, memperdalam simpul batin kita secara harmoni dan saling pengertian.`;
          
          const summaryMemoryId = "abstract_" + Math.random().toString(36).substr(2, 9);
          
          // Insert high level summary with priority importance 0.85
          NeuralInterface.db.prepare(`
            INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
            VALUES (?, 'summary', ?, 0.85, 'system', ?, ?, '["abstraction", "defragmented"]', 0.6)
          `).run(summaryMemoryId, `[Abstraksi Pengalaman]: ${compressedSummary}`, contextId, Date.now() - 1000);

          // Purge/Delete those raw consolidated oldest messages
          const oldestIds = oldestRows.map(r => r.id);
          const placeholders = oldestIds.map(() => "?").join(",");
          NeuralInterface.db.prepare(`
            DELETE FROM memories 
            WHERE id IN (${placeholders})
          `).run(...oldestIds);

          console.log(`[FORGETFULNESS_ALGORITHM] Successfully consolidated oldest 30 memories into a single high-level abstraction: "${compressedSummary}"`);
        }
      }
    } catch (err: any) {
      console.error("[FORGETFULNESS_ALGORITHM_ERR] Error during consolidation loop:", err.message);
    }
  }
}
