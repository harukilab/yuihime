import express from "express";
import { Cortex } from "../../cortex.js";
import { AIService } from "../../kernel/ai.js";
import { APIService } from "@shared/services/api";
import { eventBus } from "@shared/core/kernel/event-bus";
import { activeStreamClients, broadcastToWS, activeWSConnections } from "../apiRouter.js";
import { MultiChannelQueue } from "../../kernel/MultiChannelQueue.js";
import { NeuralInterface } from "../../kernel/NeuralInterface.js";
import { ChatSummaryEngine } from "../../kernel/ChatSummaryEngine.js";
import { Soul } from "@shared/core/soul";
import { SettingsManager } from "@/core/kernel/settings";
import { deduplicateAndMergeIdentities } from "../../database.js";
import { DEFAULT_NEURAL_CORES } from "@shared/constants";
import { LlmIoAuditor } from "../llmAuditor";
import { genId } from '@shared/core/idGen';

export function registerCortexRoutes(app: express.Express, db: any) {
  app.get("/api/stream/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders?.();

    const client = { id: Date.now(), res };
    activeStreamClients.push(client);
    console.log(`[STREAM_GATEWAY] Live stream link established. Active overlays: ${activeStreamClients.length}`);

    res.write(`data: ${JSON.stringify({ type: "sync_ok", timestamp: Date.now() })}\n\n`);

    req.on("close", () => {
      const index = activeStreamClients.findIndex(c => c.id === client.id);
      if (index !== -1) {
        activeStreamClients.splice(index, 1);
      }
      console.log(`[STREAM_GATEWAY] Live overlay closed. Active overlays: ${activeStreamClients.length}`);
    });
  });

  app.post("/api/stream/events", (req, res) => {
    const payload = req.body;
    if (!payload || !payload.type) {
      return res.status(400).json({ error: "Invalid stream event payload" });
    }

    const sseChunk = `data: ${JSON.stringify(payload)}\n\n`;
    activeStreamClients.forEach(c => {
      try {
        c.res.write(sseChunk);
      } catch (err) {
        console.warn(`[STREAM_GATEWAY] Failed to send packet to overlay ${c.id}:`, err);
      }
    });

    const wsChunk = JSON.stringify(payload);
    activeWSConnections.forEach(client => {
      try {
        if (client.readyState === 1) {
          client.send(wsChunk);
        }
      } catch (err) {
        console.warn(`[WS_GATEWAY] Failed to send to WS client:`, err);
      }
    });

    res.json({ success: true, targetsReached: activeStreamClients.length + activeWSConnections.size });
  });

  // --- Live Stream Chat API Webhook ---
  app.post("/api/stream/chat", (req, res) => {
    const message = req.body.message || req.body.text || req.body.comment || req.body.chat || (req.query.message as string) || "";
    const sender = req.body.sender || req.body.user || req.body.username || req.body.speaker || (req.query.sender as string) || "Penonton";
    const contextId = req.body.context || (req.query.context as string) || "live_stream";
    const chatType = req.body.channel || req.body.platform || (req.query.channel as string) || "Live Chat";

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    }

    const userMemory = {
      id: "stream_usr_" + genId(9),
      type: "interaction",
      content: `[${sender}]: ${message}`,
      timestamp: Date.now()
    };
    const sseCommentChunk = `data: ${JSON.stringify({ type: "memory_update", data: userMemory })}\n\n`;
    activeStreamClients.forEach(c => {
      try { c.res.write(sseCommentChunk); } catch (err) {}
    });
    try {
      broadcastToWS({ type: "memory_update", data: userMemory });
    } catch (wsErr) {}

    MultiChannelQueue.getInstance().addMessage(
      message,
      sender,
      contextId,
      chatType,
      (reply) => {
        if (!reply) {
          return res.json({ 
            success: true, 
            processed: false, 
            sampledOut: true, 
            message: "Komentar diterima tetapi melewati filter sampling kecepatan tinggi. Tetap tecatat di ringkasan subkesadaran." 
          });
        }

        const replyPayload = {
          type: "state_update",
          data: {
            state: { status: "talking" },
            activeSubtitle: reply,
            typedSubtitle: reply,
            isSubtitleTyping: false,
            animations: ["TALK", "SMILE"]
          }
        };

        const replySseChunk = `data: ${JSON.stringify(replyPayload)}\n\n`;
        activeStreamClients.forEach(c => {
          try { c.res.write(replySseChunk); } catch (err) {}
        });

        try {
          broadcastToWS(replyPayload);
        } catch (wsErr) {}

        res.json({ success: true, processed: true, response: reply });
      },
      (err) => {
        console.error("[STREAM_WEBHOOK_ERROR] Failed to process streaming chat:", err);
        res.status(500).json({ error: "Kegagalan neural sync asinkron di antrean." });
      }
    );
  });

  // --- Chat Summary API (Manual daily summary trigger + read) ---
  app.post("/api/cortex/chat-summary/daily", async (req, res) => {
    try {
      const date = req.body?.date ? String(req.body.date).trim() : undefined;
      const result = await ChatSummaryEngine.getInstance().generateDailySummary(date);
      if (!result.success) {
        return res.status(400).json({ success: false, date: result.date, reason: result.reason, error: result.error || null });
      }
      res.json({ success: true, date: result.date, summary: result.summary });
    } catch (err: any) {
      console.error("[SERVER] POST /api/cortex/chat-summary/daily error:", err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  app.get("/api/cortex/chat-summary/daily", (req, res) => {
    try {
      const date = req.query?.date ? String(req.query.date).trim() : undefined;
      const result = ChatSummaryEngine.getInstance().getDailySummary(date);
      if (!result) {
        return res.status(404).json({ success: false, error: `Daily summary not found for ${date || "yesterday"}. Generate it first.` });
      }
      res.json({ success: true, date: result.date, summary: result.summary, timestamp: result.timestamp });
    } catch (err: any) {
      console.error("[SERVER] GET /api/cortex/chat-summary/daily error:", err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // --- Cortex Think Server-side Entry Point (routed through NeuralInterface for parity with Telegram/Discord) ---
  app.post("/api/cortex/think", express.json(), async (req, res) => {
    try {
      const { input, userName, contextId, chatType, attachments } = req.body;
      const senderName = (req.headers['x-yui-user-name'] || req.headers['x-user-name'] || req.headers['x-yui-user'] || req.body.user || userName || 'external_client') as string;
      const finalContextId = (req.headers['x-yui-context-id'] || req.headers['x-context-id'] || req.headers['x-yui-context'] || req.body.context_id || contextId || 'live_stream') as string;
      const finalChatType = (req.headers['x-yui-chat-type'] || req.headers['x-chat-type'] || req.headers['x-yui-chat-type'] || req.body.chat_type || chatType || 'web') as string;
      if (!input || !input.trim()) {
        return res.status(400).json({ error: "Input prompt cannot be empty" });
      }

      const currentTaskId = req.body.taskId || `ctx_${Date.now()}_${genId(5)}`;
      const shouldStream = req.body.stream === true || req.query.stream === "true";

      const abortController = new AbortController();
      res.on("close", () => {
        if (res.writableEnded) {
          return;
        }
        abortController.abort();
        console.log(`[API_THINK] Client closed connection. Aborting task ${currentTaskId}.`);
      });

      const finalizeReply = (reply: any, auditLogs: any[]) => {
        const base = { ...(reply || {}), auditLogs };
        if (!reply || !reply.text || reply.text.trim().length < 3) {
          return { success: true, result: { response: null, queued: !!reply?.fallbackTriggered, ...base } };
        }
        return { success: true, result: { ...base, response: reply.text } };
      };

      if (shouldStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        const sendSse = (type: string, data: any) => {
          try {
            res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
          } catch (err) {
            console.warn("[API_THINK_SSE] Failed writing SSE chunk:", err);
          }
        };

        // Setup keep-alive interval to prevent proxies (Nginx, Cloudflare, etc.) from timing out
        const keepAliveInterval = setInterval(() => {
          try {
            res.write(`:\n\n`);
          } catch (err) {
            console.warn("[API_THINK_SSE] Failed writing keep-alive comment:", err);
          }
        }, 4000);

        try {
          const reply = await NeuralInterface.processNeuralInputWithMeta(
            input,
            senderName,
            finalContextId,
            finalChatType,
            false,
            currentTaskId,
            abortController.signal,
            attachments,
            (chunk: string) => sendSse("chunk", { text: chunk })
          );
          const auditLogs = APIService.getAuditLogs();
          const finalized = finalizeReply(reply, auditLogs);
          sendSse("done", { result: finalized.result });
          res.end();
        } catch (thinkErr: any) {
          if (thinkErr.message && thinkErr.message.includes("TASK_SUSPENDED")) {
            console.log(`[API_THINK] Task ${currentTaskId} suspended cleanly due to interruption.`);
            sendSse("suspended", {
              suspended: true,
              taskId: currentTaskId,
              message: "Tugas ditangguhkan demi mendahulukan interaksi prioritas tinggi user."
            });
          } else if (thinkErr.message && thinkErr.message.includes("COGNITIVE_LOOP_ABORTED")) {
            console.log(`[API_THINK] Task ${currentTaskId} aborted cleanly due to client disconnect.`);
          } else {
            sendSse("error", { error: thinkErr.message || String(thinkErr) });
          }
        } finally {
          clearInterval(keepAliveInterval);
          try {
            res.end();
          } catch (endErr) {
            console.warn("[API_THINK_SSE] Failed ending stream after abort:", endErr);
          }
        }
        return;
      }

      let reply: any;
      try {
        reply = await NeuralInterface.processNeuralInputWithMeta(
          input,
          senderName,
          finalContextId,
          finalChatType,
          false,
          currentTaskId,
          abortController.signal,
          attachments
        );
      } catch (thinkErr: any) {
        if (thinkErr.message && thinkErr.message.includes("TASK_SUSPENDED")) {
          console.log(`[API_THINK] Task ${currentTaskId} suspended cleanly due to interruption.`);
          return res.json({
            success: true,
            suspended: true,
            taskId: currentTaskId,
            message: "Tugas ditangguhkan demi mendahulukan interaksi prioritas tinggi user."
          });
        }
        if (thinkErr.message && thinkErr.message.includes("COGNITIVE_LOOP_ABORTED")) {
          console.log(`[API_THINK] Task ${currentTaskId} aborted cleanly due to client disconnect.`);
          if (!res.writableEnded) {
            res.json({ success: false, aborted: true, message: "Request aborted." });
          }
          return;
        }
        throw thinkErr;
      }

      const auditLogs = APIService.getAuditLogs();
      const finalized = finalizeReply(reply, auditLogs);
      res.json(finalized);
    } catch (err: any) {
      console.error("[CORTEX_POST_ERROR] Failed to process cognitive request on server:", err);
      res.status(500).json({ error: err.message || "Gagal memproses kognisi di sisi server." });
    }
  });

  // --- OpenAI / LLM Gateway API Compatibility Layer (Ignores requested model, routes to Yui's core cognitive loop) ---
  const handleOaiChatCompletions = async (req: express.Request, res: express.Response) => {
    try {
      const { messages, stream, model } = req.body;
      
      console.log(`[YUI_LLM_GATEWAY] Received request for model: "${model || 'unknown'}". Bypassing requested model, routing strictly to YuiHime's core cognitive loop!`);

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Invalid messages format. Must be a non-empty array of objects." });
      }

      // Extract last user message as main input
      const userMessages = messages.filter((m: any) => m.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1];
      const input = lastUserMsg?.content || '';

      if (!input.trim()) {
        return res.status(400).json({ error: "No user message content found in messages" });
      }

      // Extract override headers/params for deep integration flexibility
      const senderName = (req.headers['x-yui-user-name'] || req.headers['x-user-name'] || req.headers['x-yui-user'] || req.body.user || 'external_client') as string;
      const finalContextId = (req.headers['x-yui-context-id'] || req.headers['x-context-id'] || req.headers['x-yui-context'] || req.body.context_id || 'api_default') as string;
      const finalChatType = (req.headers['x-yui-chat-type'] || req.headers['x-chat-type'] || req.headers['x-yui-chat-type'] || req.body.chat_type || 'api') as string;
      const attachments = req.body.attachments || [];

      const cortex = new Cortex();

      // 1. Get State from DB
      const stateRow: any = db.prepare("SELECT * FROM agent_state WHERE id = 1").get();
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
        state.status = 'idle';
        db.prepare("UPDATE agent_state SET status = 'idle' WHERE id = 1").run();
      }

      // 2. Load heuristics
      const strategyRows = db.prepare("SELECT * FROM learned_strategies").all();
      const strategies = strategyRows.map((r: any) => ({
        id: r.id,
        topic: r.topic,
        topicId: r.topicId || r.topic,
        instruction: r.instruction,
        confidence: r.confidence || 0.5,
        successCount: r.successCount || 0,
        failureCount: r.failureCount || 0,
        lastOptimized: r.lastOptimized || Date.now()
      }));
      state.heuristics = strategies;

      // 2b. Load knowledge
      try {
        const knowledgeRows = db.prepare("SELECT * FROM knowledge").all();
        const knowledge = knowledgeRows.map((r: any) => ({
          id: r.id,
          topic: r.topic,
          content: r.content,
          tags: r.tags ? JSON.parse(r.tags) : [],
          confidence: r.confidence || 0.5,
          updatedAt: r.updatedAt || Date.now()
        }));
        state.knowledge = knowledge;
      } catch (kErr) {
        state.knowledge = [];
      }

      // 3. Load dreams
      const dreamRows = db.prepare("SELECT * FROM dreams").all();
      const dreams = dreamRows.map((r: any) => ({
        id: r.id,
        concept: r.concept,
        abstractions: r.abstractions ? JSON.parse(r.abstractions) : [],
        strength: r.strength || 0.5,
        lastReinforced: r.lastReinforced || Date.now(),
        underlyingMemories: r.underlyingMemories ? JSON.parse(r.underlyingMemories) : []
      }));

      // 4. Load capabilities
      const capRows = db.prepare("SELECT * FROM capabilities").all();
      const capabilities = capRows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        type: r.type,
        enabled: r.enabled === 1,
        config: r.config ? JSON.parse(r.config) : {}
      }));

      // 5. Get identities
      const identityRows = db.prepare("SELECT * FROM identities").all();
      const allIdentities = identityRows.map((r: any) => ({
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

      // Resolve user's identity
      const platformTag = `${finalChatType.toLowerCase()}:${senderName}`;
      let receiverIdentity = allIdentities.find((id: any) => 
        (id.linkedAccounts && id.linkedAccounts.some((acc: string) => acc.toLowerCase() === platformTag.toLowerCase())) || 
        (id.perceivedName && id.perceivedName.toLowerCase() === senderName.toLowerCase())
      );

      if (!receiverIdentity) {
        const id = "api_usr_" + genId(9);
        db.prepare(`
          INSERT INTO identities (id, perceivedName, realName, habits, importantFacts, linkedAccounts, lastInteraction, ownerId, trust, affection, reputation)
          VALUES (?, ?, 'Belum diisikan', '[]', '[]', ?, ?, 'local_user', 50, 50, 50)
        `).run(id, senderName, JSON.stringify([platformTag]), Date.now());
        receiverIdentity = {
          id,
          perceivedName: senderName,
          realName: 'Belum diisikan',
          habits: [],
          importantFacts: [],
          linkedAccounts: [platformTag],
          lastMet: Date.now(),
          ownerId: 'local_user',
          source: 'api',
          traits: [],
          trust: 50,
          affection: 50,
          reputation: 50
        };
        allIdentities.push(receiverIdentity);
      } else {
        db.prepare("UPDATE identities SET lastInteraction = ? WHERE id = ?").run(Date.now(), receiverIdentity.id);
      }

      // Self-healing merge
      try {
        deduplicateAndMergeIdentities(db, receiverIdentity.id);
        
        const refreshed = db.prepare("SELECT * FROM identities WHERE id = ?").get(receiverIdentity.id) as any;
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
        console.warn("[YUI_LLM_GATEWAY_MERGE] Self-healing merge warn:", mergeErr.message);
      }

       let activePersona: any = DEFAULT_NEURAL_CORES.find(c => c.id === state.activePersonaId);

       if (!activePersona && state.activePersonaId && state.activePersonaId !== 'auto') {
         const customPersonaRow = db.prepare("SELECT * FROM custom_personas WHERE id = ?").get(state.activePersonaId);
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
           db.prepare("UPDATE agent_state SET activePersonaId = 'auto' WHERE id = 1").run();
         }
       }

       if (!activePersona) {
         activePersona = DEFAULT_NEURAL_CORES.find(c => c.id === 'auto') || DEFAULT_NEURAL_CORES[1];
       }

       const userRelation = {
         uid: receiverIdentity.id || senderName,
         trust: receiverIdentity.trust !== undefined ? receiverIdentity.trust : 50,
         affection: receiverIdentity.affection !== undefined ? receiverIdentity.affection : 50,
         reputation: receiverIdentity.reputation !== undefined ? receiverIdentity.reputation : 50,
         lastInteraction: receiverIdentity.lastMet || Date.now()
       };

       const customState = {
         ...state,
         relation: userRelation
       };

       // Retrieve context memories
       const targetContexts = new Set<string>();
       targetContexts.add(finalContextId);

       const contextsList = Array.from(targetContexts);
       let historyRows: any[] = [];
       if (contextsList.length > 0) {
         const dbLikeClauses = contextsList.map(() => "context LIKE ?").join(" OR ");
         const dbQueryParams = contextsList.map(c => `%${c}%`);
         const recentRows = db.prepare(`
           SELECT * FROM memories 
           WHERE ${dbLikeClauses} 
           ORDER BY timestamp DESC 
           LIMIT 100
         `).all(...dbQueryParams);
         historyRows = recentRows.reverse();
       }

       const memories = historyRows.map((r: any) => ({
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

       const currentTaskId = `ctx_api_${Date.now()}_${genId(5)}`;
      const completionId = `chatcmpl-${genId(12)}`;
      const createdTime = Math.floor(Date.now() / 1000);

      const shouldStream = stream === true || req.query.stream === "true";

      const processResultAndSave = async (result: any) => {
        try {
          if (result.systemHealth) {
            state.systemHealth = result.systemHealth;
          }

          // Save output vector (Mood, Relation, Emotion) back to DB
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

          const dbTrust = result.queuedIdentityUpdate?.trust !== undefined ? result.queuedIdentityUpdate.trust : updatedRelation.trust;
          const dbAffection = result.queuedIdentityUpdate?.affection !== undefined ? result.queuedIdentityUpdate.affection : updatedRelation.affection;
          const dbReputation = result.queuedIdentityUpdate?.reputation !== undefined ? result.queuedIdentityUpdate.reputation : (updatedRelation.reputation || 50);

          db.prepare("UPDATE identities SET trust = ?, affection = ?, reputation = ?, lastInteraction = ? WHERE id = ?")
            .run(dbTrust, dbAffection, dbReputation, Date.now(), receiverIdentity.id);

          db.prepare("UPDATE agent_state SET mood = ?, emotion = ?, relation = ?, systemHealth = ?, activePersonaId = ?, currentPlan = ? WHERE id = 1")
            .run(JSON.stringify(updatedMood), JSON.stringify(updatedEmotion), JSON.stringify(updatedRelation), JSON.stringify(state.systemHealth), state.activePersonaId || 'auto', result.updatedPlan ? JSON.stringify(result.updatedPlan) : (state.currentPlan ? JSON.stringify(state.currentPlan) : null));

          // Store Memories
          const appSettings = SettingsManager.getInstance().getAll();
          const prepareForTraining = !!appSettings.prepareForTraining;

          if (result.newMemories && result.newMemories.length > 0) {
            for (const m of result.newMemories) {
              const exists = db.prepare("SELECT 1 FROM memories WHERE id = ?").get(m.id);
              if (!exists) {
                let savedContent = m.content;
                if (prepareForTraining) {
                  const role = m.speaker === 'agent' ? 'assistant' : 'user';
                  savedContent = JSON.stringify({
                    messages: [{ role, content: m.content }]
                  });
                }
                db.prepare(`
                  INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  m.id || genId(9),
                  m.type || 'interaction',
                  savedContent,
                  m.importance || 0.4,
                  m.speaker || 'agent',
                  finalContextId,
                  m.timestamp || Date.now(),
                  m.tags ? JSON.stringify(m.tags) : '[]',
                  updatedSentiment
                );
              }
            }
          } else {
            const userMemoryId = genId(9);
            let savedUserInput = input;
            if (savedUserInput && typeof savedUserInput === "string") {
              savedUserInput = savedUserInput.replace("[PRE-PROCESS: ENFORCE_JSON_ONLY]", "").trim();
            }
            if (prepareForTraining) {
              savedUserInput = JSON.stringify({
                messages: [{ role: "user", content: savedUserInput }]
              });
            }
            db.prepare(`
              INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
              VALUES (?, 'interaction', ?, 0.4, ?, ?, ?, '[]', ?)
            `).run(userMemoryId, savedUserInput, senderName, finalContextId, Date.now(), updatedSentiment);

            const agentMemoryId = genId(9);
            let savedAgentResponse = result.response;
            if (prepareForTraining) {
              savedAgentResponse = JSON.stringify({
                messages: [{ role: "assistant", content: result.response }]
              });
            }
            db.prepare(`
              INSERT INTO memories (id, type, content, importance, speaker, context, timestamp, tags, sentiment)
              VALUES (?, 'interaction', ?, 0.5, 'agent', ?, ?, '[]', ?)
            `).run(agentMemoryId, savedAgentResponse, finalContextId, Date.now() + 10, updatedSentiment);
          }

          // Sync identity updates back to identities
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

            db.prepare(`
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

          if (result.fallbackTriggered) {
            console.log(`[YUI_LLM_GATEWAY] Fallback triggered for ${senderName}. Saving to pending_messages...`);
            const pendingId = "pending_" + genId(9);
            db.prepare(`
              INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status)
              VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
            `).run(pendingId, input, senderName, finalContextId, finalChatType, Date.now());
          }
        } catch (saveErr: any) {
          console.error("[YUI_LLM_GATEWAY_SAVE_ERR] Failed to save gateway state updates:", saveErr.message);
        }
      };

      if (shouldStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        const sendOaiSse = (content: string, finishReason: string | null = null) => {
          res.write(`data: ${JSON.stringify({
            id: completionId,
            object: "chat.completion.chunk",
            created: createdTime,
            model: "yuihime-batin",
            choices: [{
              index: 0,
              delta: content ? { content } : {},
              logprobs: null,
              finish_reason: finishReason
            }]
          })}\n\n`);
        };

        try {
          const result = await cortex.think(
            input,
            memories,
            dreams,
            capabilities,
            customState,
            state.heuristics,
            senderName,
            allIdentities,
            activePersona,
            finalContextId,
            finalChatType,
            currentTaskId,
            attachments,
            (chunkText: string) => {
              sendOaiSse(chunkText);
            },
            undefined,
            db
          );
          
          sendOaiSse("", "stop");
          res.write("data: [DONE]\n\n");
          res.end();

          // Save states in background cleanly
          processResultAndSave(result);
        } catch (thinkErr: any) {
          if (thinkErr.message && thinkErr.message.includes("TASK_SUSPENDED")) {
            sendOaiSse("\n[Tugas ditangguhkan demi mendahulukan interaksi prioritas tinggi user.]", "stop");
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }
          res.write(`data: ${JSON.stringify({ error: { message: thinkErr.message || String(thinkErr) } })}\n\n`);
          res.end();
        }
      } else {
        const result = await cortex.think(
          input,
          memories,
          dreams,
          capabilities,
          customState,
          state.heuristics,
          senderName,
          allIdentities,
          activePersona,
          finalContextId,
          finalChatType,
          currentTaskId,
          attachments,
          db
        );

        // Process states and persist
        await processResultAndSave(result);

        res.json({
          id: completionId,
          object: "chat.completion",
          created: createdTime,
          model: "yuihime-batin",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: result.response
            },
            logprobs: null,
            finish_reason: "stop"
          }],
          usage: {
            prompt_tokens: Math.ceil(input.length / 4),
            completion_tokens: Math.ceil(result.response.length / 4),
            total_tokens: Math.ceil((input.length + result.response.length) / 4)
          }
        });
      }
    } catch (err: any) {
      console.error("[YUI_LLM_GATEWAY_ERROR] Failed to process LLM gateway request:", err);
      res.status(500).json({ error: { message: err.message || "Gagal memproses LLM Gateway." } });
    }
  };

  const handleOaiModels = (req: express.Request, res: express.Response) => {
    res.json({
      object: "list",
      data: [
        {
          id: "yuihime-batin",
          object: "model",
          created: 1677652288,
          owned_by: "yuihime"
        }
      ]
    });
  };

  app.post("/v1/chat/completions", express.json(), handleOaiChatCompletions);
  app.post("/api/v1/chat/completions", express.json(), handleOaiChatCompletions);
  app.get("/v1/models", handleOaiModels);
  app.get("/api/v1/models", handleOaiModels);

  app.get("/api/cortex/audit-logs", (req, res) => {
    res.json({ success: true, auditLogs: APIService.getAuditLogs() });
  });

  app.post("/api/cortex/audit-logs/clear", (req, res) => {
    APIService.clearAuditLogs();
    res.json({ success: true });
  });

  app.get("/api/cortex/llm-logs", async (req, res) => {
    try {
       res.json({ success: true, logs: LlmIoAuditor.getLogs() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load LLM logs." });
    }
  });

  app.post("/api/cortex/llm-logs/clear", async (req, res) => {
    try {
       LlmIoAuditor.clearLogs();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to clear LLM logs." });
    }
  });

  // Routes will be injected here
}
