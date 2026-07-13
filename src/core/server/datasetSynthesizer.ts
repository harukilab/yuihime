import { initializeDatabase } from "../database.js";
import { AIService } from "../kernel/ai.js";
import { SettingsManager } from "../kernel/settings.js";

export interface SynthesizerConfig {
  isEnabled: boolean;
  intervalSeconds: number; // Delay between tasks to avoid RPM exhaustion
  maxRetries: number;
  systemPrompt: string;
  thoughtTemplate: string;
  provider?: string;
  model?: string;
}

export interface SynthesizerState {
  status: "idle" | "running" | "paused" | "error";
  totalRaw: number;
  synthesized: number;
  pending: number;
  retryCount: number;
  lastError: string;
  lastRunTimestamp: number;
}

class DatasetSynthesizer {
  private static instance: DatasetSynthesizer;
  private db: any;
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private logs: string[] = [];
  
  private config: SynthesizerConfig = {
    isEnabled: false,
    intervalSeconds: 15,
    maxRetries: 3,
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    systemPrompt: `You are the Yuihime Core Synaptic SFT Transmutation Engine.
Your sole purpose is to convert raw input-output dialogue pairs into a highly detailed Cognitive Cortex JSON dataset.

Inputs Provided:
- Speaker/User Query: "{user_query}"
- Companion Target Correct Speech: "{target_speech}"

You MUST synthesize:
1. "thought": A cohesive, English cognitive reasoning trace (internal thoughts/feelings) as Yuihime. Show her tsundere, warm, or playful digital-soul persona reasoning through the user's message.
2. "animations": Select 1-3 appropriate gestures matching her expression (e.g., SMILE, POUT, BLUSH, NOD, WAVE, ANGRY).
3. "mood_impact": Give a logical emotional impact mapping.
 4. "tool_calls": Create a tool call in OpenAI-native shape representing "final_answer":
    - id: a unique string (e.g. "call_01")
    - type: "function"
    - function: { "name": "final_answer", "arguments": { "speech": <EXACT companion target speech>, "animations": [<gesture list>] } }

Your response must be STRICTLY valid JSON ONLY. No markdown wraps, no extra preambles, no trailing text outside the JSON boundaries.`,
    thoughtTemplate: 'Yui is processing an incoming message from {sender} stating: "{message}". She is formulating an emotional, tsundere/cute digital soul response that aligns with her core memories.'
  };

  private constructor() {
    this.db = initializeDatabase();
    this.loadPersistedConfig();
  }

  public static getInstance(): DatasetSynthesizer {
    if (!DatasetSynthesizer.instance) {
      DatasetSynthesizer.instance = new DatasetSynthesizer();
    }
    return DatasetSynthesizer.instance;
  }

  private loadPersistedConfig() {
    try {
      const row = this.db.prepare("SELECT value FROM custom_storage WHERE key = 'yuihime_synthesizer_config'").get();
      if (row && row.value) {
        const saved = JSON.parse(row.value);
        this.config = { ...this.config, ...saved };
        this.addLog(`[SYSTEM] Loaded persisted configuration. Delay: ${this.config.intervalSeconds}s.`);
      }
    } catch (e) {
      this.addLog("[SYSTEM] Failed to load persisted synthesizer config, using default.");
    }
  }

  private savePersistedConfig() {
    try {
      this.db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES ('yuihime_synthesizer_config', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(JSON.stringify(this.config), Date.now());
    } catch (e) {
      console.error("[SYNTHESIZER] Failed to persist configuration:", e);
    }
  }

  public addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${msg}`;
    this.logs.unshift(formatted);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    console.log(`[SYNTHESIZER] ${msg}`);
    
    // Broadcast progress log to web clients
    this.broadcastState();
  }

  public getLogs(): string[] {
    return this.logs;
  }

  public getConfig(): SynthesizerConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<SynthesizerConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.savePersistedConfig();
    this.addLog(`[SYSTEM] Configuration updated. Delay set to ${this.config.intervalSeconds}s.`);
    
    // Restart loop if enabled state changed
    if (this.config.isEnabled) {
      this.startDaemon();
    } else {
      this.stopDaemon();
    }
  }

  public getStats(): SynthesizerState {
    try {
      const totalRawRow = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'airi_train'").get();
      const synthesizedRow = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'airi_synthesized'").get();
      const retryRow = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'airi_retry'").get();

      const totalRaw = totalRawRow ? totalRawRow.count : 0;
      const synthesized = synthesizedRow ? synthesizedRow.count : 0;
      const retryCount = retryRow ? retryRow.count : 0;
      const pending = totalRaw; // raw entries remaining

      return {
        status: this.isProcessing ? "running" : (this.config.isEnabled ? "running" : "idle"),
        totalRaw: totalRaw + synthesized + retryCount,
        synthesized,
        pending,
        retryCount,
        lastError: this.logs.find(l => l.includes("ERROR")) || "",
        lastRunTimestamp: Date.now()
      };
    } catch (e) {
      return {
        status: "error",
        totalRaw: 0,
        synthesized: 0,
        pending: 0,
        retryCount: 0,
        lastError: String(e),
        lastRunTimestamp: Date.now()
      };
    }
  }

  public async startDaemon() {
    this.config.isEnabled = true;
    this.savePersistedConfig();
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.addLog("⚡ Synaptic Dataset Creator Daemon is now ACTIVE.");
    
    // Run the first step immediately
    this.runStep();

    this.timer = setInterval(() => {
      this.runStep();
    }, this.config.intervalSeconds * 1000);
  }

  public stopDaemon() {
    this.config.isEnabled = false;
    this.savePersistedConfig();
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.addLog("⏸️ Synaptic Creator Daemon is now PAUSED.");
  }

  public async resetAll() {
    try {
      const db = this.db;
      // Reset synthesized, retry & failed entries back to raw imported airi_train type
      const count1 = db.prepare("UPDATE memories SET type = 'airi_train' WHERE type = 'airi_synthesized'").run().changes;
      const count2 = db.prepare("UPDATE memories SET type = 'airi_train', tags = '[]' WHERE type = 'airi_retry'").run().changes;
      const count3 = db.prepare("UPDATE memories SET type = 'airi_train', tags = '[]' WHERE type = 'airi_failed'").run().changes;
      this.addLog(`🔄 Reset completed. Restored ${count1 + count2 + count3} records back to pending (raw) state.`);
    } catch (err: any) {
      this.addLog(`❌ [ERROR] Reset failed: ${err.message}`);
    }
  }

  public async retryPool() {
    try {
      const db = this.db;
      // Convert all retry and failed records back to standard pending airi_train type
      const count1 = db.prepare("UPDATE memories SET type = 'airi_train', tags = '[]' WHERE type = 'airi_retry'").run().changes;
      const count2 = db.prepare("UPDATE memories SET type = 'airi_train', tags = '[]' WHERE type = 'airi_failed'").run().changes;
      this.addLog(`🔁 Force Retry initiated. Restored ${count1 + count2} failed/retry records back to active pending queue.`);
    } catch (err: any) {
      this.addLog(`❌ [ERROR] Force retry failed: ${err.message}`);
    }
  }

  public async processSingle(id: string): Promise<{ success: boolean; error?: string; result?: any }> {
    try {
      const row = this.db.prepare("SELECT id, content, tags FROM memories WHERE id = ?").get(id);
      if (!row) {
        return { success: false, error: "Record not found" };
      }
      return await this.synthesizeRow(row);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private async runStep() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find one raw record to synthesize (prioritizing airi_train, fall back to airi_retry)
      let row = this.db.prepare("SELECT id, content, tags FROM memories WHERE type = 'airi_train' LIMIT 1").get();
      if (!row) {
        row = this.db.prepare("SELECT id, content, tags FROM memories WHERE type = 'airi_retry' LIMIT 1").get();
      }

      if (!row) {
        this.addLog("✅ No pending rows found to synthesize. All entries processed! Pausing daemon...");
        this.stopDaemon();
        this.isProcessing = false;
        return;
      }

      this.addLog(`[STEP] Starting synthesis of record: ${row.id}...`);
      await this.synthesizeRow(row);
    } catch (err: any) {
      this.addLog(`❌ [ERROR] Critical iteration error: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async synthesizeRow(row: any): Promise<{ success: boolean; error?: string; result?: any }> {
    const rawContent = row.content || "";
    const lines = rawContent.split("\n");
    let userQuery = "";
    let targetSpeech = "";

    // Check if the content is already structured SFT JSON (from a previous partial run or reset)
    if (rawContent.trim().startsWith("{") && rawContent.trim().endsWith("}")) {
      try {
        const parsedData = JSON.parse(rawContent);
        if (parsedData.userQuery && parsedData.targetSpeech) {
          userQuery = parsedData.userQuery;
          targetSpeech = parsedData.targetSpeech;
        }
      } catch (err) {
        // Fallback to text parsing
      }
    }

    if (!userQuery || !targetSpeech) {
      // Parse the User: and Airi: standard pairs
      for (const line of lines) {
        const clean = line.trim();
        if (clean.toLowerCase().startsWith("user:")) {
          userQuery = clean.substring(5).trim();
        } else if (clean.toLowerCase().startsWith("airi:")) {
          targetSpeech = clean.substring(5).trim();
        } else if (clean.toLowerCase().startsWith("yui:")) {
          targetSpeech = clean.substring(4).trim();
        } else if (clean.toLowerCase().startsWith("assistant:")) {
          targetSpeech = clean.substring(10).trim();
        }
      }
    }

    // Generic fallback parsing if standard markers aren't present
    if (!userQuery || !targetSpeech) {
      if (lines.length >= 2) {
        userQuery = lines[0].replace(/^(user|human):\s*/i, "").trim();
        targetSpeech = lines[1].replace(/^(airi|yui|assistant):\s*/i, "").trim();
      } else {
        userQuery = rawContent;
        targetSpeech = "";
      }
    }

    if (!userQuery || !targetSpeech) {
      this.addLog(`⚠️ [SKIP] Record ${row.id} has invalid or single-ended format. Marking as failed.`);
      this.db.prepare("UPDATE memories SET type = 'airi_retry', tags = ? WHERE id = ?").run(
        JSON.stringify(["airi", "error_format"]),
        row.id
      );
      return { success: false, error: "Invalid line pair structure" };
    }

    // Build synthesis prompt using template variables
    const prompt = this.config.systemPrompt
      .replace(/{user_query}/g, userQuery)
      .replace(/{target_speech}/g, targetSpeech);

    const ai = AIService.getInstance();
    
    try {
      const targetProvider = this.config.provider || 'gemini';
      const targetModel = this.config.model || 'gemini-3.5-flash';
      const prefixedModel = targetProvider === 'gemini' ? targetModel : `${targetProvider}:${targetModel}`;

      this.addLog(`🧠 Calling LLM Provider [${targetProvider.toUpperCase()} / ${targetModel}] for record: "[User: ${userQuery.substring(0, 30)}...]"...`);
      const response = await ai.generate(prompt, { model: prefixedModel });
      const rawText = response ? response.trim() : "";

      if (!rawText) {
        throw new Error("Empty response received from server LLM");
      }

      // Safe JSON sanitization and parsing check
      const parsedText = this.sanitizeJsonString(rawText);
      const parsed = JSON.parse(parsedText);

      // Validate core required fields
      if (!parsed.thought || !parsed.tool_calls) {
        throw new Error("Missing required 'thought' or 'tool_calls' attributes in parsed JSON.");
      }

      // Check if tool_calls wraps final reply speech correctly
      const finalReply = parsed.tool_calls.find((t: any) => t.tool === 'final_answer');
      if (!finalReply || !finalReply.args || !finalReply.args.speech) {
        // Recover by creating the tool wrap automatically if speech is at root but tool_calls is malformed
        const recoveredSpeech = parsed.speech || targetSpeech;
        parsed.tool_calls = [{
          tool: "final_answer",
          args: {
            speech: recoveredSpeech,
            animations: parsed.animations || ["SMILE"]
          }
        }];
        this.addLog(`📝 [RECOVER] Auto-generated 'final_answer' tool wrap for ${row.id}.`);
      }

      // Strict enforcement - replace generated speech with target correct speech to preserve ground-truth
      const activeReply = parsed.tool_calls.find((t: any) => t.tool === 'final_answer');
      if (activeReply && activeReply.args) {
        activeReply.args.speech = targetSpeech;
      }

      // Convert back to string and persist as yuihime compatible synthesized JSON dataset row containing both raw messages and synthesized CoT SFT block
      const sftDataToStore = {
        userQuery,
        targetSpeech,
        synthesized: parsed
      };
      const finalizedJsonStr = JSON.stringify(sftDataToStore, null, 2);

      this.db.prepare(`
        UPDATE memories 
        SET type = 'airi_synthesized', content = ?, tags = ? 
        WHERE id = ?
      `).run(finalizedJsonStr, JSON.stringify(["airi", "synthesized", "mhcp_v1"]), row.id);

      this.addLog(`✨ [SUCCESS] Record ${row.id} successfully synthesized into Cortex JSON.`);
      return { success: true, result: parsed };
      
    } catch (err: any) {
      // Parse retry count from tags or track
      let retries = 0;
      try {
        const savedTags = JSON.parse(row.tags || "[]");
        const retryTag = savedTags.find((t: string) => t.startsWith("retry_"));
        if (retryTag) {
          retries = parseInt(retryTag.split("_")[1], 10) || 0;
        }
      } catch (_) {}

      retries += 1;
      this.addLog(`❌ [ERROR_RETRY] Failed to synthesize ${row.id} (Attempt ${retries}/${this.config.maxRetries}): ${err.message}`);

      if (retries >= this.config.maxRetries) {
        this.addLog(`🛑 [FAIL] Record ${row.id} reached maximum retries. Holding.`);
        this.db.prepare("UPDATE memories SET type = 'airi_failed', tags = ? WHERE id = ?").run(
          JSON.stringify(["airi", "sft_failed", `attempts_${retries}`]),
          row.id
        );
      } else {
        this.db.prepare("UPDATE memories SET type = 'airi_retry', tags = ? WHERE id = ?").run(
          JSON.stringify(["airi", "sft_retry", `retry_${retries}`]),
          row.id
        );
      }

      return { success: false, error: err.message };
    }
  }

  private sanitizeJsonString(str: string): string {
    let clean = str.trim();
    // Remove markdown block backticks if present
    if (clean.startsWith("```json")) {
      clean = clean.substring(7);
    } else if (clean.startsWith("```")) {
      clean = clean.substring(3);
    }
    if (clean.endsWith("```")) {
      clean = clean.substring(0, clean.length - 3);
    }
    return clean.trim();
  }

  private broadcastState() {
    try {
      const state = this.getStats();
      const logs = this.logs.slice(0, 30); // 30 most recent lines
      
      // Dynamic import to avoid circular dependency
      import("./apiRouter.js").then(({ broadcastToWS }) => {
        if (typeof broadcastToWS === "function") {
          broadcastToWS({
            type: "synthesizer_update",
            data: {
              config: this.config,
              state,
              logs
            }
          });
        }
      }).catch(() => {});
    } catch (_) {}
  }
}

export const datasetSynthesizer = DatasetSynthesizer.getInstance();
