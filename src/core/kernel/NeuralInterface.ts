import { readFileSync } from "fs";
import path from "path";
import { Kernel } from "./core.js";
import { AIService } from "./ai.js";
import { SettingsManager } from "./settings.js";
import { Soul } from "@shared/core/soul";
import { Cortex } from "../cortex.js";
import { Memory, Dream, Identity, MoodState, EmotionState } from "@shared/include/types";
import { DEFAULT_NEURAL_CORES } from "@shared/constants";
import { deduplicateAndMergeIdentities, getDb, retryDbOperation } from "../database.js";

import { broadcastToWS } from "../server/apiRouter";
import { BackgroundToolDispatcher } from "./BackgroundToolDispatcher.js";
import { rankMemoriesByForgetting, markMemoriesRecalled } from "../spacedRepetition.js";
import { genId } from '@shared/core/idGen';
import { getCharacterName, injectCharacterName } from "./characterName.js";


export interface NeuralReplyResult {
  text: string | null;
  mood?: MoodState;
  emotion?: EmotionState;
  sentiment?: number;
  fallbackTriggered?: boolean;
}

export class NeuralInterface {
  private static db: any;
  private static lastForgetfulnessRun: number = 0;
  private static readonly FORGETFULNESS_COOLDOWN_MS = 5 * 60 * 1000;

  /**
   * Reads forgetfulness config from config.toml ([memory] section).
   * Enabled by default; set [memory] forgetfulness_enabled = false to
   * disable decay/purge/consolidation entirely (chat continuity forever).
   */
  private static isForgetfulnessEnabled(): boolean {
    try {
      const settings = SettingsManager.getInstance().getAll();
      const memoryConf = settings['memory'] || {};
      if (memoryConf.forgetfulness_enabled !== undefined) return !!memoryConf.forgetfulness_enabled;
      if (memoryConf.forgetfulnessEnabled !== undefined) return !!memoryConf.forgetfulnessEnabled;
    } catch (err: any) {
      console.warn('[FORGETFULNESS_ALGORITHM] Failed to read memory config:', err?.message || err);
    }
    return true;
  }

  public static setDatabase(db: any) {
    this.db = db;
  }

  /**
   * Unified interface for processing input from any channel (Telegram, Discord, etc.)
   */
  public static async processNeuralInput(input: string, senderName: string, contextId: string, chatType: string, isProactive: boolean = false, taskId?: string, signal?: AbortSignal, attachments?: any[], onChunk?: (chunk: string) => void): Promise<string | null> {
    const result = await NeuralInterface.processNeuralInputWithMeta(input, senderName, contextId, chatType, isProactive, taskId, signal, attachments, onChunk);
    return result ? result.text : null;
  }

  public static async processNeuralInputWithMeta(input: string, senderName: string, contextId: string, chatType: string, isProactive: boolean = false, taskId?: string, signal?: AbortSignal, attachments?: any[], onChunk?: (chunk: string) => void): Promise<NeuralReplyResult> {
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
      const id = genId(9);
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

      // Per-user continuity fallback: pull the most recent interactions whose
      // speaker matches THIS user (perceivedName/realName/linked account
      // aliases) even if they happened under a different context/channel.
      // Keeps 1 user = 1 person: other users' conversations are never mixed in.
      try {
        const userAliases = new Set<string>([senderName.toLowerCase()]);
        if (receiverIdentity) {
          for (const name of [receiverIdentity.perceivedName, receiverIdentity.realName]) {
            if (name && typeof name === "string") userAliases.add(name.toLowerCase());
          }
          if (Array.isArray(receiverIdentity.linkedAccounts)) {
            for (const acc of receiverIdentity.linkedAccounts) {
              const cleanAcc = String(acc || "").toLowerCase();
              const colonIdx = cleanAcc.lastIndexOf(":");
              if (colonIdx > -1) userAliases.add(cleanAcc.slice(colonIdx + 1));
              userAliases.add(cleanAcc);
            }
          }
        }
        const aliasList = Array.from(userAliases).filter(Boolean);
        const aliasClauses = aliasList.map(() => "LOWER(speaker) = ?").join(" OR ");
        const aliasRows = aliasClauses
          ? this.db.prepare(`
            SELECT * FROM memories
            WHERE type = 'interaction'
              AND (${aliasClauses})
            ORDER BY timestamp DESC
            LIMIT 60
          `).all(...aliasList)
          : [];
        const seenIds = new Set(historyRows.map((r: any) => r.id));
        for (const row of aliasRows) {
          if (!seenIds.has(row.id)) {
            historyRows.push(row);
            seenIds.add(row.id);
          }
        }
        historyRows.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
      } catch (aliasErr: any) {
        console.warn('[NEURAL] Per-user continuity fallback failed:', aliasErr?.message || aliasErr);
      }

      // Temporal proximity recall: interactions from ANY context within the
      // recent window are treated as "just now" activity, so Yui can answer
      // "what am I doing / who was I talking to" with current facts.
      try {
        const temporalWindowMs = 2 * 60 * 60 * 1000;
        const temporalCutoff = Date.now() - temporalWindowMs;
        const temporalRows = this.db.prepare(`
          SELECT * FROM memories
          WHERE type = 'interaction'
            AND timestamp >= ?
          ORDER BY timestamp DESC
          LIMIT 40
        `).all(temporalCutoff);
        const seenIds = new Set(historyRows.map((r: any) => r.id));
        for (const row of temporalRows) {
          if (!seenIds.has(row.id)) {
            historyRows.push(row);
            seenIds.add(row.id);
          }
        }
        historyRows.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

        // Same-room expansion: when multiple users talk around the same time,
        // treat their contexts as ONE room. Pull full recent history of every
        // context that had activity in the temporal window, so Yui keeps
        // consistent facts across users without denying recent exchanges.
        const roomContexts = new Set<string>();
        for (const row of temporalRows) {
          if (row.context && !targetContexts.has(row.context)) {
            roomContexts.add(row.context);
          }
        }
        if (roomContexts.size > 0) {
          const roomClauses = Array.from(roomContexts).map(() => "context LIKE ?").join(" OR ");
          const roomParams = Array.from(roomContexts).map(c => `%${c}%`);
          const roomRows = this.db.prepare(`
            SELECT * FROM memories
            WHERE ${roomClauses}
            ORDER BY timestamp DESC
            LIMIT 100
          `).all(...roomParams);
          for (const row of roomRows) {
            if (!seenIds.has(row.id)) {
              historyRows.push(row);
              seenIds.add(row.id);
            }
          }
          historyRows.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
        }
      } catch (temporalErr: any) {
        console.warn('[NEURAL] Temporal proximity recall failed:', temporalErr?.message || temporalErr);
      }

      // Forgetting-curve spaced repetition: keep recent conversation continuity,
      // re-rank older memories by forgetting probability (Ebbinghaus)
      // + importance, then mark the recalled ones so their stability strengthens.
      try {
        const now = Date.now();
        const recentCount = 40;
        const continuity = historyRows.slice(-recentCount);
        const older = historyRows.slice(0, historyRows.length - recentCount);
        const { rows: recalledOlder } = rankMemoriesByForgetting(older, 60, now);
        historyRows = [...recalledOlder, ...continuity];
        markMemoriesRecalled(recalledOlder.map((r: any) => r.id));
      } catch (err: any) {
        console.warn('[NEURAL] Forgetting-curve re-rank failed, using chronological order:', err?.message || err);
      }
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
          const pendingReply = injectCharacterName("${characterName} is working on your request, hold on a sec~ 🌸 Wait a moment, the result will be ready soon.");
          const pendingMemoryId = "pending_bg_" + genId(9);
          memories.push({
            id: pendingMemoryId,
            ownerId: 'system',
            type: 'system',
            content: `[SYSTEM: Background tool execution in progress for context ${contextId}. ${injectCharacterName('${characterName}')} is still working on the tool calls. Pending: ${pendingSet.toolCalls.map((tc: any) => tc.toolName).join(', ')}]`,
            importance: 0.3,
            tags: ['pending_tool_execution', contextId],
            context: contextId,
            sentiment: 0.5,
            timestamp: Date.now(),
            speaker: 'system'
          });
          return { text: pendingReply };
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
      attachments,
      onChunk,
      signal,
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
        await retryDbOperation(async () => {
          const exists = this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(m.id);
          if (!exists) {
            this.db.prepare(`
              INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              m.id || genId(9),
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
        }, 'insert-memory-from-newMemories');
      }
    } else {
      if (isProactive) {
        const systemEventMemoryId = genId(9);
        await retryDbOperation(async () => {
          this.db.prepare(`
            INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
            VALUES (?, 'event', ?, 0.2, 'system', ?, ?, '["impulse", "proactive"]', ?)
          `).run(systemEventMemoryId, `[System event]: Yui felt a longing impulse and initiated contact.`, cleanContextId, Date.now(), updatedSentiment);
        }, 'insert-memory-proactive-event');
      } else {
        const userMemoryId = genId(9);
        await retryDbOperation(async () => {
          this.db.prepare(`
            INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
            VALUES (?, 'interaction', ?, 0.4, ?, ?, ?, '[]', ?)
          `).run(userMemoryId, input, senderName, cleanContextId, Date.now(), updatedSentiment);
        }, 'insert-memory-user-interaction');
      }

      const agentMemoryId = genId(9);
      await retryDbOperation(async () => {
        this.db.prepare(`
          INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
          VALUES (?, 'interaction', ?, 0.5, 'agent', ?, ?, '[]', ?)
        `).run(agentMemoryId, result.response, cleanContextId, Date.now() + 10, updatedSentiment);
      }, 'insert-memory-agent-response');
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

      await retryDbOperation(async () => {
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
      }, 'update-identity-profile');
    }

    let responseText = result.response;
    if (!responseText || responseText.trim().length < 3) {
      if (result.fallbackTriggered) {
        console.log(`[NEURAL_INTERFACE] Gateway fallback triggered for ${senderName} (${chatType}) but response is empty. Saving to pending queue.`);
        try {
          const pendingId = "pending_" + genId(9);
          await retryDbOperation(async () => {
            this.db.prepare(`
              INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
              VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
            `).run(pendingId, input, senderName, contextId, chatType, Date.now());
          }, 'insert-pending-message');
        } catch (dbErr: any) {
          console.error("[NEURAL_INTERFACE_FALLBACK_ERR] Failed to save fallback message to database:", dbErr.message);
        }
        return null;
      }
      console.warn(`[NEURAL_INTERFACE] Empty/short response from cortex for ${senderName} (${chatType}). Generating fallback.`);
      try {
        const fallbackCortex = new Cortex();
        if (isProactive) {
          responseText = await fallbackCortex.thinkSimple(
            `${injectCharacterName('${characterName}')} is executing a scheduled cron job that fired on its own in the background. ${injectCharacterName('${characterName}')} is the ACTIVE INITIATOR of this action, not a responder. The user (${senderName}) did NOT just message her — do NOT act as if they did. Execute the job fully and autonomously, speaking as the proactive sender to the addressed user on ${chatType}, in that user's language. Job instruction: ${(input || '').slice(0, 500)}`
          );
        } else {
          responseText = await fallbackCortex.thinkSimple(`You are ${getCharacterName()}. The user "${senderName}" just sent you a message on ${chatType}. Reply with a very short, sweet, in-character response in the same language as the user's message (1-2 sentences max). Do not mention being an AI.`);
        }
      } catch (fallbackErr) {
        console.warn("[NEURAL_INTERFACE] Fallback response generation failed:", fallbackErr);
        responseText = injectCharacterName("Hai! ${characterName} is a bit busy right now, but always here for you~ ✨");
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
          await retryDbOperation(async () => {
            this.db.prepare("UPDATE identities SET trust = ?, affection = ?, reputation = ?, lastInteraction = ? WHERE id = ?")
              .run(dbTrust, dbAffection, dbReputation, Date.now(), receiverIdentity.id);
          }, 'deferred-update-identity');

          await retryDbOperation(async () => {
            this.db.prepare("UPDATE agent_state SET mood = ?, emotion = ?, relation = ?, systemHealth = ?, activePersonaId = ?, currentPlan = ? WHERE id = 1")
              .run(JSON.stringify(updatedMood), JSON.stringify(updatedEmotion), JSON.stringify(updatedRelation), JSON.stringify(state.systemHealth), state.activePersonaId || 'auto', result.updatedPlan ? JSON.stringify(result.updatedPlan) : (state.currentPlan ? JSON.stringify(state.currentPlan) : null));
          }, 'deferred-update-agent-state');

          if (result.newMemories && result.newMemories.length > 0) {
            for (const m of result.newMemories) {
              await retryDbOperation(async () => {
                const exists = this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(m.id);
                if (!exists) {
                  this.db.prepare(`
                    INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `).run(
                    m.id || genId(9),
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
              }, 'deferred-insert-memory');
            }
          } else if (isProactive) {
            const systemEventMemoryId = genId(9);
            await retryDbOperation(async () => {
              this.db.prepare(`
                INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                VALUES (?, 'event', ?, 0.2, 'system', ?, ?, '["impulse", "proactive"]', ?)
          `).run(systemEventMemoryId, `[System event]: ${injectCharacterName('${characterName}')} felt a longing impulse and initiated contact.`, cleanContextId, Date.now(), updatedSentiment);
            }, 'deferred-insert-proactive-event');
          } else {
            const userMemoryId = genId(9);
            await retryDbOperation(async () => {
              this.db.prepare(`
                INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                VALUES (?, 'interaction', ?, 0.4, ?, ?, ?, '[]', ?)
              `).run(userMemoryId, input, senderName, cleanContextId, Date.now(), updatedSentiment);
            }, 'deferred-insert-user-memory');

            const agentMemoryId = genId(9);
            await retryDbOperation(async () => {
              this.db.prepare(`
                INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                VALUES (?, 'interaction', ?, 0.5, 'agent', ?, ?, '[]', ?)
              `).run(agentMemoryId, result.response, cleanContextId, Date.now() + 10, updatedSentiment);
            }, 'deferred-insert-agent-memory');
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

            await retryDbOperation(async () => {
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
            }, 'deferred-update-identity-profile');
          }
        } catch (dbErr: any) {
          console.warn("[NEURAL_INTERFACE_DEFERRED_DB] background DB write failed:", dbErr?.message || dbErr);
        }
      });

      return {
        text: responseText,
        mood: updatedMood,
        emotion: updatedEmotion,
        sentiment: updatedSentiment,
        fallbackTriggered: result.fallbackTriggered === true,
      };
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
    if (!NeuralInterface.isForgetfulnessEnabled()) {
      console.log('[FORGETFULNESS_ALGORITHM] Skipping — forgetfulness disabled via config ([memory] forgetfulness_enabled = false).');
      return;
    }
    const now = Date.now();
    if (now - NeuralInterface.lastForgetfulnessRun < NeuralInterface.FORGETFULNESS_COOLDOWN_MS) {
      console.log(`[FORGETFULNESS_ALGORITHM] Skipping — cooldown active (${Math.round((NeuralInterface.FORGETFULNESS_COOLDOWN_MS - (now - NeuralInterface.lastForgetfulnessRun)) / 1000)}s remaining).`);
      return;
    }
    NeuralInterface.lastForgetfulnessRun = now;
    if (!contextId || !NeuralInterface.db) return;

    const cleanContextId = contextId.split("|")[0];

    try {
      const db = getDb();
      const fiveMinutesAgo = Date.now() - 300000;

      const decayResult = await retryDbOperation(
        () => db.prepare(
          'UPDATE memories SET importance = MAX(0.0, importance - 0.02) WHERE context = ? AND speaker != ? AND timestamp < ?'
        ).run(cleanContextId, 'system', fiveMinutesAgo),
        'forgetfulness-decay'
      );

      // Recency guard: exempt the 20 newest memories of this context from purge
      // regardless of importance, so an active chat can never lose recent context.
      const recencyGuardRows = db.prepare(
        'SELECT id FROM memories WHERE context = ? AND speaker != ? ORDER BY timestamp DESC LIMIT 20'
      ).all(cleanContextId, 'system') as { id: string }[];
      const recencyGuardIds = recencyGuardRows.map((r) => r.id);

      const purgePlaceholders = recencyGuardIds.map(() => '?').join(',');
      const purgeResult = await retryDbOperation(
        () => db.transaction(() => {
          const stmt = purgePlaceholders
            ? db.prepare(
                'DELETE FROM memories WHERE context = ? AND importance < 0.08 AND speaker != ? AND timestamp < ? AND (retrievalCount = 0 OR retrievalCount IS NULL) AND id NOT IN (' + purgePlaceholders + ')'
              )
            : db.prepare(
                'DELETE FROM memories WHERE context = ? AND importance < 0.08 AND speaker != ? AND timestamp < ? AND (retrievalCount = 0 OR retrievalCount IS NULL)'
              );
          return purgePlaceholders
            ? stmt.run(cleanContextId, 'system', fiveMinutesAgo, ...recencyGuardIds)
            : stmt.run(cleanContextId, 'system', fiveMinutesAgo);
        })(),
        'forgetfulness-purge'
      );

      const countRow = db.prepare('SELECT COUNT(*) as count FROM memories WHERE context = ?').get(cleanContextId) as { count: number } | undefined;
      const totalCount = countRow ? countRow.count : 0;

      let consolidated = false;
      if (totalCount > 150) {
        const oldestRows = db.prepare(
          'SELECT id, timestamp FROM memories WHERE context = ? AND speaker != ? ORDER BY timestamp ASC LIMIT 30'
        ).all(cleanContextId, 'system') as { id: string; timestamp: number }[];

        if (oldestRows.length >= 20) {
          const start = new Date(oldestRows[0].timestamp).toLocaleTimeString();
          const end = new Date(oldestRows[oldestRows.length - 1].timestamp).toLocaleTimeString();
          const summary = injectCharacterName('user discussed several hot topics between ' + start + ' and ' + end + '. user expressed hobbies, thoughts, and genuine care toward ${characterName}, deepening our inner bond in harmony and mutual understanding.');
          const summaryId = 'abstract_' + genId(9);

          await retryDbOperation(
            () => db.transaction(() => {
              db.prepare(
                "INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment) VALUES (?, 'summary', ?, 0.85, 'system', ?, ?, '[\"abstraction\",\"defragmented\"]', 0.6)"
              ).run(summaryId, '[Abstraksi Pengalaman]: ' + summary, cleanContextId, Date.now() - 1000);

              const ids = oldestRows.map((r) => r.id);
              const placeholders = ids.map(() => '?').join(',');
              db.prepare('DELETE FROM memories WHERE id IN (' + placeholders + ')').run(...ids);
            })(),
            'forgetfulness-consolidate'
          );

          consolidated = true;
        }
      }

      console.log(`[FORGETFULNESS_ALGORITHM] Centralized DB — decayed: ${decayResult.changes}, purged: ${purgeResult.changes}, total: ${totalCount}, consolidated: ${consolidated}`);
    } catch (err: any) {
      console.warn(`[FORGETFULNESS_ALGORITHM] Failed: ${err?.message || err}`);
    }
  }
}
