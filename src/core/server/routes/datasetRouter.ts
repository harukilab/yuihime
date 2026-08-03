import express from "express";
import { Cortex } from "../../cortex.js";
import { APIService } from "@shared/services/api";
import { SettingsManager } from "@/core/kernel/settings";
import { AIService } from "../../kernel/ai.js";
import fs from "fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { apiCustomSystemRoot } from "../apiRouter.js";
import AdmZip from "adm-zip";
import { genId } from '@shared/core/idGen';

export function registerDatasetRoutes(app: express.Express, db: any) {
  app.post("/api/cortex/import-dataset", express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { entries, target } = req.body;
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: "Sirkuit hampa: tidak ada data percakapan untuk diimpor." });
      }

      let system1Count = 0;
      let system2Count = 0;

      // --- INJEKSI SYSTEM 2: SQLite memories table (RAG Context) ---
      if (target === "both" || target === "system2") {
        const stmt = db.prepare(`
          INSERT INTO memories (id, type, content, importance, tags, context, sentiment, timestamp, speaker, chat_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // SQL transaction for super fast seeding
        const insertBatch = db.transaction((dataList: any[]) => {
          let count = 0;
          for (const item of dataList) {
            try {
              const memoryId = `airi_train_${genId(9)}_${Date.now()}`;
              const tags = JSON.stringify(["yuihime", "training", "dataset_import"]);
              const context = "Yuihime Training Dialogue Thread";
              
              // We'll store the User speech and Bot answer clearly in the memories table content
              const content = `User: ${item.input}\nYuihime: ${item.output}`;
              
              stmt.run(
                memoryId,
                "airi_train",
                content,
                0.85, // Importance
                tags,
                context,
                0.5, // neutral sentiment
                Date.now(),
                "yuihime",
                "dataset_import"
              );
              count++;
            } catch (err) {
              console.error("[IMPORT_ERR_S2]", err);
            }
          }
          return count;
        });

        system2Count = insertBatch(entries);
      }

      // --- INJEKSI SYSTEM 1: Episodic memory custom_storage ---
      if (target === "both" || target === "system1") {
        // Read existing episodic memories
        let episodes: any[] = [];
        try {
          const row = db.prepare("SELECT value FROM custom_storage WHERE key = 'yuihime_episodic_memory'").get();
          if (row && row.value) {
            episodes = JSON.parse(row.value);
            if (!Array.isArray(episodes)) episodes = [];
          }
        } catch (_) {}

        // Take max 150 items to keep similarity checks performant as defined in Brain.ts
        const limitSize = Math.min(entries.length, 150);
        const newEpisodesAdded = entries.slice(0, limitSize).map(item => ({
          input: item.input.trim(),
          output: item.output.trim(),
          timestamp: Date.now()
        }));

        // Deduplicate new episodes against existing ones by input sequence matching
        const existingInputs = new Set(episodes.map(ep => String(ep.input || '').toLowerCase().trim()));
        const uniqueNewEpisodes = newEpisodesAdded.filter(ep => !existingInputs.has(ep.input.toLowerCase().trim()));

        episodes = [...episodes, ...uniqueNewEpisodes];

        // Ensure we respect the 150 items limit
        if (episodes.length > 150) {
          episodes = episodes.slice(episodes.length - 150);
        }

        db.prepare(`
          INSERT OR REPLACE INTO custom_storage (key, value, updatedAt)
          VALUES ('yuihime_episodic_memory', ?, ?)
        `).run(JSON.stringify(episodes), Date.now());

        system1Count = uniqueNewEpisodes.length;
      }

      res.json({
        success: true,
        system1Count,
        system2Count,
        message: `Dataset Yuihime sukses diimpor ke sirkuit kognitif luring Yuihime.`
      });
    } catch (error: any) {
      console.error("[SERVER_CORTEX] Dataset Import Error:", error);
      res.status(500).json({ error: error.message || "Internal Seeding Error" });
    }
  });

  // --- Synaptic Dataset Synthesizer Daemon Endpoints ---
  app.post("/api/cortex/export-dataset", express.json(), async (req, res) => {
    try {
      const { 
        limit = 100, 
        smartSynthesize = false, 
        systemPrompt = "You am Yuihime, a protective companion digital soul running on Perfect Giftia OS. Output strictly valid JSON.",
        userFallback = "user",
        aiFallback = "Yui",
        relationVerb = "berkata",
        format = "openai",
        outputFormat = "json_cot", // "json_cot" or "raw_text"
        thoughtTemplate = 'Responding to {sender} regarding "{message}". {character} is formulating a sweet response to capture their feelings.',
        customRegexes = [],
        onlySynthesized = false
      } = req.body;

      const settingsInstance = SettingsManager.getInstance();
      const settings = await settingsInstance.load();
      const thoughtProcessSuffix = settings.thoughtProcessSuffix || "";

      // Helper function to dynamically parse the true sender name, time, and message content
      const parseSenderAndMessage = (rawMsg: string, fallbackUser: string, dbSpeakerName?: string) => {
        let sender = "";
        let time = "";
        let message = rawMsg.trim();
        let matched = false;

        const patterns: RegExp[] = [];

        // Parse custom regexes if any
        if (Array.isArray(customRegexes) && customRegexes.length > 0) {
          for (const rxStr of customRegexes) {
            try {
              if (rxStr) {
                const matchParts = rxStr.match(/^\/(.*?)\/([gimy]*)$/);
                if (matchParts) {
                  patterns.push(new RegExp(matchParts[1], matchParts[2]));
                } else {
                  patterns.push(new RegExp(rxStr));
                }
              }
            } catch (rxErr) {
              console.warn("[CUSTOM_REGEX_PARSE_ERR] Invalid custom regex ignored:", rxStr, rxErr);
            }
          }
        }

        // Add standard fallback patterns with timestamp extraction
        patterns.push(/^\[([^\]]+)\]\s*([^:\n]+):\s*([\s\S]+)$/); // [04:20] Blaze: Hehe
        patterns.push(/^\[([^\]]+)\]\s*\*([^*:\n]+)\*\s*:\s*([\s\S]+)$/); // [04:20] *Blaze*: Hehe
        patterns.push(/^([^:\n]+):\s*([\s\S]+)$/); // Blaze: Hehe
        patterns.push(/^\*\s*([^:]+)\s*:\s*([\s\S]+)$/); // * User: Hehe

        for (const rx of patterns) {
          try {
            const match = message.match(rx);
            if (match) {
              // 1. Try named capture groups for maximum flexibility
              if (match.groups) {
                const gTime = match.groups.time || match.groups.timestamp;
                const gSender = match.groups.sender || match.groups.name || match.groups.username;
                const gMsg = match.groups.message || match.groups.content || match.groups.text;

                if (gSender) sender = gSender.trim();
                if (gTime) time = gTime.trim();
                if (gMsg) {
                  message = gMsg.trim();
                  matched = true;
                  break;
                }
              }

              // 2. Fallback to positional capture groups of dynamic lengths
              if (match.length === 4) {
                // Presumed order: [1]: timestamp/time, [2]: sender/username, [3]: message
                time = match[1].trim();
                sender = match[2].trim();
                message = match[3].trim();
                matched = true;
                break;
              } else if (match.length === 3) {
                // Presumed order: [1]: sender/username, [2]: message
                sender = match[1].trim();
                message = match[2].trim();
                matched = true;
                break;
              }
            }
          } catch (e) {
            // Safe parser fallback
          }
        }

        // If we extracted a sender via pattern matching BUT it turns out to be a generic label (like "User"),
        // check if we have a better dbSpeakerName first!
        if (matched && sender.toLowerCase() === "user" && dbSpeakerName) {
          const lOwner = dbSpeakerName.toLowerCase();
          if (lOwner !== "agent" && lOwner !== "yui" && lOwner !== "airi" && lOwner !== "assistant" && lOwner !== "system" && lOwner !== "user") {
            sender = dbSpeakerName.trim();
          }
        }

        // If pattern matching DID NOT match any preset/custom rules, fallback to database speaker names
        if (!matched && dbSpeakerName) {
          const lOwner = dbSpeakerName.toLowerCase();
          if (lOwner !== "agent" && lOwner !== "yui" && lOwner !== "airi" && lOwner !== "assistant" && lOwner !== "system") {
            sender = dbSpeakerName.trim();
            matched = true;
          }
        }

        // If still no sender extracted, query our dynamic fallbacks pool
        if (!sender) {
          const fallbacks = (fallbackUser || "user")
            .split(',')
            .map(x => x.trim())
            .filter(Boolean);
          
          if (fallbacks.length > 0) {
            // Deterministic hash based selection
            let hash = 0;
            for (let i = 0; i < message.length; i++) {
              hash = message.charCodeAt(i) + ((hash << 5) - hash);
            }
            const idx = Math.abs(hash) % fallbacks.length;
            sender = fallbacks[idx];
          } else {
            sender = "User";
          }
        }

        return { sender, time, message };
      };

      // Query memories depending on whether onlySynthesized is requested
      let rows: any[];
      if (onlySynthesized) {
        rows = db.prepare(`
          SELECT id, context, speaker, content, timestamp, type, chat_type
          FROM memories
          WHERE type = 'airi_synthesized'
          ORDER BY context ASC, timestamp ASC
        `).all() as any[];
      } else {
        rows = db.prepare(`
          SELECT id, context, speaker, content, timestamp, type, chat_type
          FROM memories
          ORDER BY context ASC, timestamp ASC
        `).all() as any[];
      }

      if (rows.length === 0) {
        return res.json({
          success: true,
          entries: [],
          message: "Database memories batin Yuihime dalam keadaan kosong."
        });
      }

      // Group by context
      const conversationsMap = new Map<string, any[]>();
      for (const row of rows) {
        if (!row.content) continue;
        const ctxValue = row.context || "General Context";
        const contentStr = row.content.trim();

        // 1. Parse structured SFT JSON from background synthesizer if matching
        if (row.type === 'airi_synthesized') {
          try {
            const parsed = JSON.parse(contentStr);
            if (parsed.userQuery && parsed.synthesized) {
              const uniqueCtx = `imported_${row.id}`;
              const currentConversation = [
                {
                  role: 'user',
                  content: parsed.userQuery,
                  senderName: 'User',
                  timestamp: row.timestamp
                },
                {
                  role: 'assistant',
                  content: typeof parsed.synthesized === 'string' ? parsed.synthesized : JSON.stringify(parsed.synthesized),
                  senderName: 'Yui',
                  timestamp: row.timestamp,
                  isPreSynthesizedJson: true
                }
              ];
              conversationsMap.set(uniqueCtx, currentConversation);
              continue;
            }
          } catch (e) {
            // Fallback to text matching if old format
          }
        }

        // Detect and split imported datasets (like airi_train) having User:, Airi:, Yui:, or Yuihime: patterns
        if (row.type === 'airi_train' || contentStr.includes('User:') || contentStr.includes('Airi:') || contentStr.includes('Yui:') || contentStr.includes('Yuihime:')) {
          const lines = contentStr.split('\n');
          let currentConversation: any[] = [];
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('User:')) {
              currentConversation.push({
                role: 'user',
                content: cleanLine.substring(5).trim(),
                senderName: 'User',
                timestamp: row.timestamp
              });
            } else if (cleanLine.startsWith('Yuihime:')) {
              currentConversation.push({
                role: 'assistant',
                content: cleanLine.substring(8).trim(),
                senderName: 'Yuihime',
                timestamp: row.timestamp
              });
            } else if (cleanLine.startsWith('Airi:')) {
              currentConversation.push({
                role: 'assistant',
                content: cleanLine.substring(5).trim(),
                senderName: 'Yuihime',
                timestamp: row.timestamp
              });
            } else if (cleanLine.startsWith('Yui:')) {
              currentConversation.push({
                role: 'assistant',
                content: cleanLine.substring(4).trim(),
                senderName: 'Yui',
                timestamp: row.timestamp
              });
            } else if (cleanLine.startsWith('Assistant:')) {
              currentConversation.push({
                role: 'assistant',
                content: cleanLine.substring(10).trim(),
                senderName: 'Assistant',
                timestamp: row.timestamp
              });
            } else if (currentConversation.length > 0) {
              currentConversation[currentConversation.length - 1].content += "\n" + cleanLine;
            }
          }
          if (currentConversation.length > 0) {
            const uniqueCtx = `imported_${row.id}`;
            conversationsMap.set(uniqueCtx, currentConversation);
            continue;
          }
        }

        // Standard memory processing logic
        const speaker = (row.speaker && (row.speaker.toLowerCase() === 'agent' || row.speaker.toLowerCase() === 'yui' || row.speaker.toLowerCase() === 'airi' || row.speaker.toLowerCase() === 'assistant')) ? 'assistant' : 'user';
        if (!conversationsMap.has(ctxValue)) {
          conversationsMap.set(ctxValue, []);
        }
        conversationsMap.get(ctxValue)!.push({
          role: speaker,
          content: contentStr,
          senderName: row.speaker,
          timestamp: row.timestamp
        });
      }

      const datasetEntries: any[] = [];

      for (const [context, messages] of conversationsMap.entries()) {
        const cleanMessages: any[] = [];
        for (const msg of messages) {
          if (cleanMessages.length > 0 && cleanMessages[cleanMessages.length - 1].role === msg.role) {
            cleanMessages[cleanMessages.length - 1].content += "\n" + msg.content;
          } else {
            cleanMessages.push({ 
              role: msg.role, 
              content: msg.content, 
              senderName: msg.senderName,
              isPreSynthesizedJson: msg.isPreSynthesizedJson
            });
          }
        }

        // Automatic smart pair construction for non-standard single-turn items
        if (cleanMessages.length < 2) {
          if (cleanMessages.length === 1) {
            const sole = cleanMessages[0];
            if (sole.role === 'assistant') {
              cleanMessages.unshift({ role: 'user', content: `Bicaralah atau berikan refleksi tentang: ${context}`, senderName: 'User' });
            } else {
              cleanMessages.push({ role: 'assistant', content: `mengangguk tersenyum mendengar ucapanmu`, senderName: 'Yui' });
            }
          } else {
            continue;
          }
        }

        if (cleanMessages[0].role !== 'user') {
          cleanMessages.shift();
        }
        if (cleanMessages.length < 2) continue;

        if (cleanMessages[cleanMessages.length - 1].role !== 'assistant') {
          cleanMessages.pop();
        }
        if (cleanMessages.length < 2) continue;

        datasetEntries.push({
          context,
          messages: cleanMessages
        });
      }

      // Respect limit mapping (supports "unlimited" or -1 signals)
      let slicedEntries = datasetEntries;
      if (limit !== "unlimited" && limit !== -1 && typeof limit === "number" && limit > 0) {
        slicedEntries = datasetEntries.slice(-Math.abs(limit));
      }

      const finalDataset: any[] = [];
      const ai = AIService.getInstance();

      for (const entry of slicedEntries) {
        const formattedMessages: any[] = [];
        if (systemPrompt && systemPrompt.trim()) {
          formattedMessages.push({ role: "system", content: systemPrompt.trim() });
        }

        for (let i = 0; i < entry.messages.length; i++) {
          const msg = entry.messages[i];
          if (msg.role === 'user') {
            formattedMessages.push({ role: "user", content: msg.content });
          } else if (msg.role === 'assistant') {
            const precedingUserMsg = entry.messages[i - 1]?.content || "";
            const precedingSenderName = entry.messages[i - 1]?.senderName || "";
            const rawResponse = msg.content;

            const { sender, time, message: cleanUserMsg } = parseSenderAndMessage(precedingUserMsg, userFallback, precedingSenderName);

            let structuredContent = "";

            if (msg.isPreSynthesizedJson) {
              if (outputFormat === 'raw_text') {
                try {
                  const sftObj = JSON.parse(rawResponse);
                  const reply = sftObj.tool_calls?.find((t: any) => (t.function?.name || t.tool) === 'final_answer');
                  structuredContent = reply?.function?.arguments?.speech || reply?.args?.speech || sftObj.speech || rawResponse;
                } catch (err) {
                  structuredContent = rawResponse;
                }
              } else {
                structuredContent = rawResponse;
              }
            } else if (outputFormat === 'raw_text') {
              // Direct Raw speech dialogue (preventing heavy JSON wrap/CoT noise in standard dialogue SFT)
              structuredContent = rawResponse;
            } else {
              // Structured JSON with customizable CoT
              const currentThoughtPrompt = thoughtTemplate
                .replace(/{sender}/g, sender || "User")
                .replace(/{character}/g, aiFallback)
                .replace(/{message}/g, cleanUserMsg)
                .replace(/{time}/g, time || "")
                .replace(/{timestamp}/g, time || "");

              if (smartSynthesize) {
                const prompt = `USER MESSAGE (${sender || 'User'}): "${cleanUserMsg}"\nRAW CHARACTER RESPONSE (${aiFallback}): "${rawResponse}"`;
                try {
                  const SYNTHESIS_SYSTEM_PROMPT = `You are a highly analytical SFT Dataset Translation Pipeline for the Yuihime OS project.
Your sole job is to translate a raw Roleplay Conversational Dialogue segment into a highly structured Cognitive CoT JSON format.

Input provided will contain:
1. User Message (Represented as ${sender || 'User'})
2. Raw Character Response (Represented as ${aiFallback})

You MUST synthesize:
1. 'thought': Follow this custom CoT thought instruction template dynamically: "${currentThoughtPrompt}"
2. 'animations': Match her body languages/emotions (e.g., SMILE, POUT, WAVE, BLUSH, ANGRY, TRIPLE_WAVE).
3. 'mood_impact': Calculate changes relative to her states (such as joy, loneliness, anger, excitement).
4. 'tool_calls': Wrap the original '${aiFallback} response' exactly inside the 'final_answer' speech argument.

DO NOT alter, omit, or shorten her original speech. Preserve actual physical expression asterisks (like *pout* or *blush*) inside the speech wrapper. Output strictly as JSON following this schema:
{
  "thought": "string",
  "animations": ["string"],
  "mood_impact": { "joy": 1 },
  "tool_calls": [
    {
      "id": "call_01",
      "type": "function",
      "function": {
        "name": "final_answer",
        "arguments": {
          "speech": "string"
        }
      }
    }
  ]
}`;

                  const responseText = await ai.generate(prompt, {
                    systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
                    temperature: 0.2
                  });
                  const cleanJsonStr = APIService.cleanAIOutput(responseText);
                  const parsed = JSON.parse(cleanJsonStr);
                  
                  let extractedThought = parsed.thought || currentThoughtPrompt;
                  if (thoughtProcessSuffix && !extractedThought.includes(thoughtProcessSuffix)) {
                    extractedThought = extractedThought.trim() + " " + thoughtProcessSuffix;
                  }

                  const structuredOutput = {
                    thought: extractedThought,
                    animations: parsed.animations || ["SMILE"],
                    mood_impact: parsed.mood_impact || { joy: 1 },
                    tool_calls: parsed.tool_calls || [
                      {
                        id: "call_01",
                        type: "function",
                        function: {
                          name: "final_answer",
                          arguments: {
                            speech: rawResponse,
                            animations: parsed.animations || ["SMILE"],
                            mood_impact: parsed.mood_impact || { joy: 1 }
                          }
                        }
                      }
                    ]
                  };
                  structuredContent = JSON.stringify(structuredOutput, null, 2);
                } catch (err) {
                  console.error("[SMART_SYNTHESIZE_ERR] Failed to synthesize, fallback to template parser:", err);
                  const animations = ["SMILE"];
                  if (rawResponse.includes("cemberut") || rawResponse.includes("pout")) animations.push("POUT");
                  if (rawResponse.includes("kesal") || rawResponse.includes("marah")) animations.push("ANGRY");
                  if (rawResponse.includes("malu") || rawResponse.includes("blush")) animations.push("BLUSH");
                  if (rawResponse.includes("sedih") || rawResponse.includes("nangis")) animations.push("SAD");

                  let fallbackThought = currentThoughtPrompt;
                  if (thoughtProcessSuffix && !fallbackThought.includes(thoughtProcessSuffix)) {
                    fallbackThought = fallbackThought.trim() + " " + thoughtProcessSuffix;
                  }

                  const fallbackOutput = {
                    thought: fallbackThought,
                    animations: Array.from(new Set(animations)),
                    mood_impact: { joy: 1 },
                    tool_calls: [
                      {
                        id: "call_01",
                        type: "function",
                        function: {
                          name: "final_answer",
                          arguments: {
                            speech: rawResponse,
                            animations: Array.from(new Set(animations)),
                            mood_impact: { joy: 1 }
                          }
                        }
                      }
                    ]
                  };
                  structuredContent = JSON.stringify(fallbackOutput, null, 2);
                }
              } else {
                // Fast mapping (free, instant) using template
                const animations = ["SMILE"];
                if (rawResponse.includes("cemberut") || rawResponse.includes("pout")) animations.push("POUT");
                if (rawResponse.includes("kesal") || rawResponse.includes("marah")) animations.push("ANGRY");
                if (rawResponse.includes("malu") || rawResponse.includes("blush")) animations.push("BLUSH");
                if (rawResponse.includes("sedih") || rawResponse.includes("nangis")) animations.push("SAD");

                let fallbackThought = currentThoughtPrompt;
                if (thoughtProcessSuffix && !fallbackThought.includes(thoughtProcessSuffix)) {
                  fallbackThought = fallbackThought.trim() + " " + thoughtProcessSuffix;
                }

                const fallbackOutput = {
                  thought: fallbackThought,
                  animations: Array.from(new Set(animations)),
                  mood_impact: { joy: 1 },
                  tool_calls: [
                    {
                      tool: "final_answer",
                      args: {
                        speech: rawResponse,
                        animations: Array.from(new Set(animations)),
                        mood_impact: { joy: 1 }
                      }
                    }
                  ]
                };
                structuredContent = JSON.stringify(fallbackOutput, null, 2);
              }
            }

            formattedMessages.push({ role: "assistant", content: structuredContent });
          }
        }

        if (formattedMessages.length >= 3) {
          if (format === 'sharegpt') {
            const convs = formattedMessages.map(m => ({
              from: m.role === 'user' ? 'human' : m.role === 'system' ? 'system' : 'gpt',
              value: m.content
            }));
            finalDataset.push({
              conversations: convs
            });
          } else if (format === 'alpaca') {
            const sys = formattedMessages.find(m => m.role === 'system')?.content || systemPrompt;
            const usr = formattedMessages.filter(m => m.role === 'user').map(m => m.content).join("\n\n");
            const asst = formattedMessages.filter(m => m.role === 'assistant').map(m => m.content).join("\n\n");
            finalDataset.push({
              instruction: sys,
              input: usr,
              output: asst
            });
          } else {
            // Default: openai
            finalDataset.push({
              messages: formattedMessages
            });
          }
        }
      }

      res.json({
        success: true,
        entries: finalDataset,
        message: `Sukses menyusun ${finalDataset.length} sesi aktivitas percakapan Yuihime.`
      });
    } catch (error: any) {
      console.error("[SERVER_CORTEX] Dataset Export Error:", error);
      res.status(500).json({ error: error.message || "Internal Exporter Error" });
    }
  });

  // --- Import Model ZIP Endpoint ---
  app.post("/api/models/import-zip", express.json({ limit: "150mb" }), async (req, res) => {
    try {
      const { base64, fileName, modelName } = req.body;
      if (!base64) {
        return res.status(400).json({ error: "Sirkuit hampa: tidak ada data file ZIP yang diunggah." });
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(base64, "base64");

      // Verify and construct target public model directory (.yuihime/models)
      const modelsPublicDir = process.env.YUIHIME_MODELS_DIR || path.join(apiCustomSystemRoot, "models");
      if (!existsSync(modelsPublicDir)) {
        await fs.mkdir(modelsPublicDir, { recursive: true });
      }

      // Generate a unique folder name
      const cleanFileName = (fileName || "custom_model").replace(/\.[^/.]+$/, ""); // strip extension
      const folderName = `imported_${cleanFileName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}`;
      const destFolder = path.join(modelsPublicDir, folderName);

      await fs.mkdir(destFolder, { recursive: true });

      const zip = new AdmZip(buffer);
      zip.extractAllTo(destFolder, true);

      // Search recursively for model3.json, model.json or .vrm
      async function findModelFiles(dir: string): Promise<{ type: 'Live2D' | 'VRM'; url: string; name: string }[]> {
        const results: { type: 'Live2D' | 'VRM'; url: string; name: string }[] = [];
        async function scan(currentDir: string) {
          const entries = await fs.readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              await scan(fullPath);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (entry.name.endsWith('.model3.json') || entry.name.endsWith('.model.json')) {
                const relativePath = path.relative(modelsPublicDir, fullPath);
                results.push({
                  type: 'Live2D',
                  url: '/models/' + relativePath.replace(/\\/g, '/'),
                  name: entry.name.replace(/\.model(3)?\.json$/i, '')
                });
              } else if (ext === '.vrm') {
                const relativePath = path.relative(modelsPublicDir, fullPath);
                results.push({
                  type: 'VRM',
                  url: '/models/' + relativePath.replace(/\\/g, '/'),
                  name: entry.name.replace(/\.vrm$/i, '')
                });
              }
            }
          }
        }
        await scan(dir);
        return results;
      }

      async function findPreviewImage(dir: string): Promise<string | null> {
        let fallbackImg: string | null = null;
        async function scan(currentDir: string) {
          if (fallbackImg) return;
          const entries = await fs.readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              await scan(fullPath);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
                const relativePath = path.relative(modelsPublicDir, fullPath);
                const url = '/models/' + relativePath.replace(/\\/g, '/');
                
                const lowerName = entry.name.toLowerCase();
                if (lowerName.includes('preview') || lowerName.includes('thumbnail') || lowerName.includes('icon') || lowerName.includes('avatar')) {
                  fallbackImg = url;
                  return;
                }
                if (!fallbackImg) {
                  fallbackImg = url;
                }
              }
            }
          }
        }
        await scan(dir);
        return fallbackImg;
      }

      const foundModels = await findModelFiles(destFolder);
      if (foundModels.length === 0) {
        // Clean up empty directory if no compatible models found
        await fs.rm(destFolder, { recursive: true, force: true });
        return res.status(400).json({ 
          error: "Sirkuit gagal: Tidak ditemukan file spesifikasi model (.model3.json, .model.json, atau .vrm) di dalam file ZIP yang diunggah." 
        });
      }

      // Pick the first found model
      const primaryModel = foundModels[0];
      const previewImg = await findPreviewImage(destFolder);

      // Map to ModelItem
      const importedModel = {
        id: `imported_${Date.now()}`,
        name: modelName || primaryModel.name || "Custom Live2D",
        type: primaryModel.type,
        url: primaryModel.url,
        imageUrl: previewImg || (primaryModel.type === 'VRM' 
          ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop'
          : 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=300&auto=format&fit=crop'),
        desc: `Model ${primaryModel.type} diimpor dari file ZIP "${fileName || 'custom.zip'}".`
      };

      res.json({
        success: true,
        model: importedModel,
        message: `Model ${primaryModel.type} sukses diekstrak dan diimpor.`
      });

    } catch (error: any) {
      console.error("[SERVER_MODELS] Import ZIP Error:", error);
      res.status(500).json({ error: error.message || "Gagal memproses file ZIP model." });
    }
  });

  // --- AI Proxy APIs ---
  // Routes will be injected here
}
