import { readFileSync } from "fs";
import path from "path";
import { Worker } from "worker_threads";
import { Kernel } from "./core.js";
import { AIService } from "./ai.js";
import { Soul } from "../soul.js";
import Database from "better-sqlite3";
import { Cortex } from "../cortex.js";
import { Memory, Dream, Identity } from "@shared/include/types";
import { DEFAULT_NEURAL_CORES } from "@shared/constants";
import { deduplicateAndMergeIdentities, dbPath } from "../database.js";

import { broadcastToWS } from "../server/apiRouter";
import { BackgroundToolDispatcher } from "./BackgroundToolDispatcher.js";


export class NeuralInterface {
  private static db: any;
  private static lastForgetfulnessRun: number = 0;
  private static readonly FORGETFULNESS_COOLDOWN_MS = 5 * 60 * 1000;

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
    let computedActivePersonaId = stateRow ? (stateRow.activePersonaId || 'auto') : 'auto';
    if (computedActivePersonaId === 'polite') {
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
      activePersonaId: 'auto',
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
        INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, ownerId, trust, affection, reputation)
        VALUES (?, ?, 'Belum diisikan', '[]', '[]', ?, ?, 'local_user', 50, 50, 50)
      `).run(id, senderName, JSON.stringify(linked), Date.now());
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

    let activePersona: any = DEFAULT_NEURAL_CORES.find(c => c.id === state.activePersonaId);

    if (!activePersona && state.activePersonaId && state.activePersonaId !== 'auto') {
      const customPersonaRow = this.db.prepare("SELECT * FROM custom_personas WHERE id = ?").get(state.activePersonaId);
      if (customPersonaRow) {
        activePersona = {
          id: customPersonaRow.id,
          name: customPersonaRow.name,
          description: customPersonaRow.description,
          systemPrompt: customPersonaRow.systemPrompt || '',
          traits: customPersonaRow.traits ? JSON.parse(customPersonaRow.traits) : [],
          color: customPersonaRow.color,
          archetype: customPersonaRow.archetype,
        };
      } else {
        this.db.prepare("UPDATE agent_state SET activePersonaId = 'auto' WHERE id = 1").run();
      }
    }

    if (!activePersona) {
      activePersona = DEFAULT_NEURAL_CORES.find(c => c.id === 'auto') || DEFAULT_NEURAL_CORES[1];
    }

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

    // Phase 2: Check for pending background tool results and inject them
    if (contextId) {
      const pendingSet = BackgroundToolDispatcher.getInstance().getPending(contextId);
      if (pendingSet) {
        if (pendingSet.status === 'pending') {
          const pendingReply = "Yui sedang mengerjakan request kamu sebentar ya~ 🌸 Tunggu sebentar, hasilnya akan segera tersedia.";
          const pendingMemoryId = "pending_bg_" + Math.random().toString(36).substr(2, 9);
          memories.push({
            id: pendingMemoryId,
            ownerId: 'system',
            type: 'system',
            content: `[SYSTEM: Background tool execution in progress for context ${contextId}. Yui is still working on the tool calls. Pending: ${pendingSet.toolCalls.map((tc: any) => tc.toolName).join(', ')}]`,
            importance: 0.3,
            tags: ['pending_tool_execution', contextId],
            context: contextId,
            sentiment: 0.5,
            timestamp: Date.now(),
            speaker: 'system'
          });
          return pendingReply;
        } else if (pendingSet.status === 'completed' && pendingSet.results && pendingSet.results.length > 0) {
          const results = await BackgroundToolDispatcher.getInstance().drain(contextId);
          for (let idx = 0; idx < results.length; idx++) {
            const r = results[idx];
            const envelope = {
              success: !!r.success,
              data: r.success ? r.observation : null,
              error: r.success ? null : (r.error || 'Tool execution failed'),
              metadata: {
                tool: r.toolName,
                duration_ms: typeof r.durationMs === 'number' ? r.durationMs : -1,
                timestamp: new Date().toISOString()
              }
            };
            const toolResultMemoryId = 'tool_result_bg_' + Date.now() + '_' + idx;
            const observationContent = r.success
              ? `Tool [${r.toolName}] executed successfully in background. Result: ${typeof r.observation === 'object' ? JSON.stringify(r.observation) : String(r.observation || '')}`
              : `Tool [${r.toolName}] failed in background. Error: ${r.error || 'Unknown error'}`;
            memories.push({
              id: toolResultMemoryId,
              ownerId: 'system',
              type: 'observation',
              speaker: 'System',
              content: `[SYSTEM_TOOL_RESULT]: ${observationContent}`,
              timestamp: Date.now(),
              importance: 0.5,
              tags: ['background_tool_result', r.toolName, contextId],
              context: contextId,
              sentiment: 0.5
            });
          }
          BackgroundToolDispatcher.getInstance().cancel(contextId);
        }
      }
    }

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
      taskId,
      undefined,
      undefined,
      undefined,
      this.db
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

    // Soft retries without busy-spin (spin freezes the event loop and delays TG delivery).
    const runDb = async (label: string, fn: () => void) => {
      const maxRetries = 4;
      let lastErr: any = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          fn();
          return;
        } catch (err: any) {
          lastErr = err;
          const isBusy = err.code === 'SQLITE_BUSY' || err.message?.includes('database is locked') || err.message?.includes('SQLITE_BUSY');
          if (!isBusy || attempt === maxRetries) {
            console.warn(`[NEURAL_INTERFACE_SQLITE] ${label} failed after ${attempt} attempt(s):`, err?.message || err);
            return;
          }
          const backoff = 50 * attempt;
          console.warn(`[NEURAL_INTERFACE_SQLITE_RETRY] SQLite busy on ${label}, retrying in ${backoff}ms (${attempt}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
      if (lastErr) {
        console.warn(`[NEURAL_INTERFACE_SQLITE] ${label} gave up:`, lastErr?.message || lastErr);
      }
    };

    await runDb('update-identity', () => {
      this.db.prepare("UPDATE identities SET trust = ?, affection = ?, reputation = ?, lastInteraction = ? WHERE id = ?")
        .run(dbTrust, dbAffection, dbReputation, Date.now(), receiverIdentity.id);
    });

    await runDb('update-agent-state', () => {
      this.db.prepare("UPDATE agent_state SET mood = ?, emotion = ?, relation = ?, systemHealth = ?, activePersonaId = ?, currentPlan = ? WHERE id = 1")
        .run(JSON.stringify(updatedMood), JSON.stringify(updatedEmotion), JSON.stringify(updatedRelation), JSON.stringify(state.systemHealth), state.activePersonaId || 'auto', result.updatedPlan ? JSON.stringify(result.updatedPlan) : (state.currentPlan ? JSON.stringify(state.currentPlan) : null));
    });

    // Broadcast updated state to browser web sockets for live UI rendering
    try {
      broadcastToWS({
        type: "state_update",
        data: {
          state: {
            mood: updatedMood,
            emotion: updatedEmotion,
            relation: updatedRelation,
            systemHealth: state.systemHealth,
            activePersonaId: state.activePersonaId || 'auto',
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
        result.viewerProfileUpdate?.realName || 
          (result.perceivedNameUpdate && (!receiverIdentity.realName || receiverIdentity.realName === 'Belum diisikan' || receiverIdentity.realName === senderName)
            ? result.perceivedNameUpdate
            : receiverIdentity.realName) || senderName,
        JSON.stringify(currentHabits),
        JSON.stringify(currentFacts),
        JSON.stringify(currentLinks),
        Date.now(),
        receiverIdentity.id
      );
    }

    let responseText = result.response;
    if (!responseText || responseText.trim().length < 3) {
      if (result.fallbackTriggered) {
        console.log(`[NEURAL_INTERFACE] Gateway fallback triggered for ${senderName} (${chatType}) but response is empty. Saving to pending queue.`);
        try {
          const pendingId = "pending_" + Math.random().toString(36).substr(2, 9);
          this.db.prepare(`
            INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
            VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
          `).run(pendingId, input, senderName, contextId, chatType, Date.now());
        } catch (dbErr: any) {
          console.error("[NEURAL_INTERFACE_FALLBACK_ERR] Gagal menyimpan pesan fallback ke database:", dbErr.message);
        }
        return null;
      }
      console.warn(`[NEURAL_INTERFACE] Empty/short response from cortex for ${senderName} (${chatType}). Generating fallback.`);
      try {
        const fallbackCortex = new Cortex();
        responseText = await fallbackCortex.thinkSimple(`You are YuiHime. The user "${senderName}" just sent you a message on ${chatType}. Reply with a very short, sweet, in-character Indonesian response (1-2 sentences max). Do not mention being an AI.`);
      } catch (fallbackErr) {
        console.warn("[NEURAL_INTERFACE] Fallback response generation failed:", fallbackErr);
        responseText = "Hai! Yui lagi sibuk dikit, tapi Yui selalu ada buat kamu~ ✨";
      }
    }

    if (responseText && responseText.trim().length >= 3) {
      setTimeout(() => {
        NeuralInterface.performForgetfulnessProtocol(contextId).catch((err: any) => {
          console.warn("[FORGETFULNESS_ALGORITHM] Background task failed silently:", err?.message || err);
        });
      }, 30000);

      // Defer non-critical synchronous DB writes so response delivery isn't blocked.
      // These operations (identity updates, memory inserts, profile writes) are
      // persistence bookkeeping and don't need to complete before the user sees the reply.
      queueMicrotask(async () => {
        try {
          const runDbLight = async (label: string, fn: () => void) => {
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try { fn(); return; }
              catch (err: any) {
                const isBusy = err.code === 'SQLITE_BUSY' || err.message?.includes('database is locked');
                if (!isBusy || attempt === maxRetries) { return; }
                await new Promise(r => setTimeout(r, 50 * attempt));
              }
            }
          };

          await runDbLight('deferred-update-identity', () => {
            this.db.prepare("UPDATE identities SET trust = ?, affection = ?, reputation = ?, lastInteraction = ? WHERE id = ?")
              .run(dbTrust, dbAffection, dbReputation, Date.now(), receiverIdentity.id);
          });

          await runDbLight('deferred-update-agent-state', () => {
            this.db.prepare("UPDATE agent_state SET mood = ?, emotion = ?, relation = ?, systemHealth = ?, activePersonaId = ?, currentPlan = ? WHERE id = 1")
              .run(JSON.stringify(updatedMood), JSON.stringify(updatedEmotion), JSON.stringify(updatedRelation), JSON.stringify(state.systemHealth), state.activePersonaId || 'auto', result.updatedPlan ? JSON.stringify(result.updatedPlan) : (state.currentPlan ? JSON.stringify(state.currentPlan) : null));
          });

          if (result.newMemories && result.newMemories.length > 0) {
            for (const m of result.newMemories) {
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
          } else if (isProactive) {
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

            const agentMemoryId = Math.random().toString(36).substr(2, 9);
            this.db.prepare(`
              INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
              VALUES (?, 'interaction', ?, 0.5, 'agent', ?, ?, '[]', ?)
            `).run(agentMemoryId, result.response, cleanContextId, Date.now() + 10, updatedSentiment);
          }

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
              result.viewerProfileUpdate?.realName ||
                (result.perceivedNameUpdate && (!receiverIdentity.realName || receiverIdentity.realName === 'Belum diisikan' || receiverIdentity.realName === senderName)
                  ? result.perceivedNameUpdate
                  : receiverIdentity.realName) || senderName,
              JSON.stringify(currentHabits),
              JSON.stringify(currentFacts),
              JSON.stringify(currentLinks),
              Date.now(),
              receiverIdentity.id
            );
          }
        } catch (dbErr: any) {
          console.warn("[NEURAL_INTERFACE_DEFERRED_DB] background DB write failed:", dbErr?.message || dbErr);
        }
      });

      return responseText;
    }

    return null;
  }

  /**
    * Best-effort memory decay. Always deferred from the reply path.
    * Throttled to run at most once every 5 minutes to avoid blocking
    * the event loop during message delivery (better-sqlite3 is synchronous).
    * Uses a moderate busy_timeout so a locked DB cannot freeze the event loop for 30s.
    */
  public static async performForgetfulnessProtocol(contextId: string) {
    const now = Date.now();
    if (now - NeuralInterface.lastForgetfulnessRun < NeuralInterface.FORGETFULNESS_COOLDOWN_MS) {
      console.log(`[FORGETFULNESS_ALGORITHM] Skipping — cooldown active (${Math.round((NeuralInterface.FORGETFULNESS_COOLDOWN_MS - (now - NeuralInterface.lastForgetfulnessRun)) / 1000)}s remaining).`);
      return;
    }
    NeuralInterface.lastForgetfulnessRun = now;
    if (!contextId || !NeuralInterface.db) return;

    const cleanContextId = contextId.split("|")[0];
    const resolvedDbPath = dbPath;

    // Jalankan seluruh operasi di Worker Thread terpisah.
    // Dengan ini, better-sqlite3 (synchronous) berjalan di thread lain
    // dan event loop utama (TG in/out, LLM reply delivery) TIDAK PERNAH diblokir.
    const workerCode = `
      const { workerData, parentPort } = require('worker_threads');
      const Database = require('better-sqlite3');

      const { dbPath, contextId } = workerData;

      (function run() {
        let db;
        try {
          db = new Database(dbPath, { timeout: 30000 });
          db.pragma('journal_mode = WAL');
          db.pragma('busy_timeout = 30000');

          const fiveMinutesAgo = Date.now() - 300000;

          // DECAY: single-pass UPDATE via composite index
          const decayResult = db.prepare(
            'UPDATE memories SET importance = MAX(0.0, importance - 0.05) WHERE context = ? AND speaker != ? AND timestamp < ?'
          ).run(contextId, 'system', fiveMinutesAgo);

          // PURGE: single-pass DELETE via composite index
          // FTS5 trigger runs per-row — batch in transaction to minimize overhead
          const purgeResult = db.transaction(() => {
            return db.prepare(
              'DELETE FROM memories WHERE context = ? AND importance < 0.15 AND speaker != ? AND timestamp < ?'
            ).run(contextId, 'system', fiveMinutesAgo);
          })();

          // CONSOLIDATE: kompres 30 tertua jika total > 150
          const countRow = db.prepare('SELECT COUNT(*) as count FROM memories WHERE context = ?').get(contextId);
          const totalCount = countRow ? countRow.count : 0;

          let consolidated = false;
          if (totalCount > 150) {
            const oldestRows = db.prepare(
              'SELECT id, timestamp FROM memories WHERE context = ? AND speaker != ? ORDER BY timestamp ASC LIMIT 30'
            ).all(contextId, 'system');

            if (oldestRows.length >= 20) {
              const start = new Date(oldestRows[0].timestamp).toLocaleTimeString();
              const end = new Date(oldestRows[oldestRows.length - 1].timestamp).toLocaleTimeString();
              const summary = 'user membahas beberapa topik hangat antara pukul ' + start + ' dan ' + end + '. user mengekspresikan hobi, pemikiran, dan rasa pedulinya kepada Yui secara tulus, memperdalam simpul batin kita secara harmoni dan saling pengertian.';
              const summaryId = 'abstract_' + Math.random().toString(36).substr(2, 9);

              db.transaction(() => {
                db.prepare(
                  "INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment) VALUES (?, 'summary', ?, 0.85, 'system', ?, ?, '[\\\",\\\"abstraction\\\",\\\",\\\"defragmented\\\"]', 0.6)"
                ).run(summaryId, '[Abstraksi Pengalaman]: ' + summary, contextId, Date.now() - 1000);

                const ids = oldestRows.map(function(r) { return r.id; });
                const placeholders = ids.map(function() { return '?'; }).join(',');
                db.prepare('DELETE FROM memories WHERE id IN (' + placeholders + ')').run.apply(db.prepare('DELETE FROM memories WHERE id IN (' + placeholders + ')'), ids);
              })();

              consolidated = true;
            }
          }

          parentPort.postMessage({
            success: true,
            decayed: decayResult.changes,
            purged: purgeResult.changes,
            totalCount,
            consolidated
          });
        } catch (err) {
          parentPort.postMessage({ success: false, error: err.message });
        } finally {
          try { if (db) db.close(); } catch (_) {}
        }
      })();
    `;

    try {
      await new Promise<void>((resolve) => {
        const worker = new Worker(workerCode, {
          eval: true,
          workerData: { dbPath: resolvedDbPath, contextId: cleanContextId }
        });

        worker.on('message', (msg: any) => {
          if (msg.success) {
            console.log(`[FORGETFULNESS_ALGORITHM] Worker done — decayed: ${msg.decayed}, purged: ${msg.purged}, total: ${msg.totalCount}, consolidated: ${msg.consolidated}`);
          } else {
            console.warn(`[FORGETFULNESS_ALGORITHM] Worker reported error: ${msg.error}`);
          }
          resolve();
        });

        worker.on('error', (err: any) => {
          console.warn(`[FORGETFULNESS_ALGORITHM] Worker thread error: ${err?.message || err}`);
          resolve();
        });

        worker.on('exit', (code: number) => {
          if (code !== 0) {
            console.warn(`[FORGETFULNESS_ALGORITHM] Worker exited with code ${code}`);
          }
          resolve();
        });
      });
    } catch (err: any) {
      console.warn(`[FORGETFULNESS_ALGORITHM] Failed to launch worker: ${err?.message || err}`);
    }
  }
}
