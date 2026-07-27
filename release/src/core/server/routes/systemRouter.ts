import express from "express";
import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, unlinkSync, renameSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as toml from "smol-toml";
import { SettingsManager } from "@/core/kernel/settings";
import { CronModule, extractCronPromptFromArgs, normalizeCronPromptForSave } from "../../kernel/cron.js";
import { MultiChannelQueue } from "../../kernel/MultiChannelQueue.js";
import { broadcastToWS, getCronAction } from "../apiRouter.js";
import { NeuralInterface } from "../../kernel/NeuralInterface.js";
import { eventBus } from "@shared/core/kernel/event-bus";

const execPromise = promisify(exec);

// --- Settings & Workflow Configs ---
const workflowPath = path.join(process.cwd(), "workflow.json");

async function loadWorkflow() {
  try {
    const content = await fs.readFile(workflowPath, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    return { nodes: [], edges: [] };
  }
}

async function saveWorkflow(workflow: any) {
  await fs.writeFile(workflowPath, JSON.stringify(workflow, null, 2));
}

// --- Addon System ---
const apiRootEnvStr = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || "~/.yuihime";
const apiCustomSystemRoot = path.isAbsolute(apiRootEnvStr) ? apiRootEnvStr : path.join(process.cwd(), apiRootEnvStr);
const addonsDir = process.env.YUIHIME_ADDONS_PATH || path.join(apiCustomSystemRoot, "addons");
async function discoverAddons() {
  try {
    if (!existsSync(addonsDir)) {
      mkdirSync(addonsDir, { recursive: true });
    }
    const subdirs = await fs.readdir(addonsDir, { withFileTypes: true });
    const addons = [];

    for (const dir of subdirs) {
      if (dir.isDirectory()) {
        const addonPath = path.join(addonsDir, dir.name);
        let meta: any = null;
        let entryPoint = "";

        const tomlPath = path.join(addonPath, "config.toml");
        const jsonPath = path.join(addonPath, "skill.json");
        const manifestPath = path.join(addonPath, "manifest.json");

        if (existsSync(tomlPath)) {
          try {
            const content = await fs.readFile(tomlPath, "utf-8");
            meta = toml.parse(content);
          } catch (e) {}
        } else if (existsSync(jsonPath)) {
          try {
            const content = await fs.readFile(jsonPath, "utf-8");
            const rawMeta = JSON.parse(content);
            meta = {
              name: rawMeta.name || dir.name,
              description: rawMeta.description || "",
              version: rawMeta.version || "1.0.0",
              inputSchema: rawMeta.schema || {}
            };
          } catch (e) {}
        } else if (existsSync(manifestPath)) {
          try {
            const content = await fs.readFile(manifestPath, "utf-8");
            const rawMeta = JSON.parse(content);
            meta = {
              name: rawMeta.name || dir.name,
              description: rawMeta.description || "",
              version: rawMeta.version || "1.0.0",
              inputSchema: rawMeta.schema || {}
            };
          } catch (e) {}
        }

        if (meta) {
          const files = await fs.readdir(addonPath);
          const pyEntry = files.find(f => f === "main.py");
          const jsEntry = files.find(f => f === "main.js" || f === "index.js");
          const shEntry = files.find(f => f === "main.sh" || f === "run.sh");

          if (pyEntry) entryPoint = pyEntry;
          else if (jsEntry) entryPoint = jsEntry;
          else if (shEntry) entryPoint = shEntry;
          else {
            const fallback = files.find(f => f.endsWith(".py") || f.endsWith(".js") || f.endsWith(".sh"));
            if (fallback) entryPoint = fallback;
          }

          if (entryPoint) {
            try {
              const matchedRuntime = entryPoint.endsWith(".py") ? "python" :
                                     (entryPoint.endsWith(".sh") ? "bash" : 
                                     (entryPoint.endsWith(".js") || entryPoint.endsWith(".cjs") ? "node" : "bash"));

              addons.push({ 
                ...meta, 
                id: dir.name, 
                path: addonPath,
                entryPoint,
                runtime: matchedRuntime
              });
            } catch (e) {}
          }
        }
      }
    }
    return addons;
  } catch (e) {
    return [];
  }
}

// --- Dynamic Connections & Broadcast Helpers ---
export function registerSystemRoutes(app: express.Express, db: any) {
  app.post("/api/telegram/restart", async (req, res) => {
    try {
      const { initializeBot } = await import("../telegram.js");
      await initializeBot(db, true);
      res.json({ success: true, message: "Bot Telegram berhasil dimuat ulang dan dijalankan kembali secara batiniah!" });
    } catch (err: any) {
      console.error("[API_TELEGRAM_RESTART] Failed to reload bot:", err);
      res.status(500).json({ error: err.message || "Gagal memuat ulang Bot Telegram" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    const settingsInstance = SettingsManager.getInstance();
    const sets = await settingsInstance.load();
    res.json(sets);
  });

  app.post("/api/settings", async (req, res) => {
    const settingsInstance = SettingsManager.getInstance();
    await settingsInstance.save(req.body);
    
    // Clear cortex settings cache in real-time
    try {
      const { clearCortexSettingsCache } = await import("../../cortex/cortexSettings.js");
      clearCortexSettingsCache();
    } catch (cacheErr) {
      console.warn("[SERVER] Failed to clear cortex settings cache on setting update:", cacheErr);
    }
    
    // Dynamically sync and load/reload plugins post-settings update
    try {
      const { PluginManager } = await import('../../kernel/PluginManager.js');
      await PluginManager.getInstance().loadPlugins();
    } catch (pluginErr: any) {
      console.error("[KERNEL_DYNAMIC] Failed to sync dynamic plugins post-settings update:", pluginErr.message);
    }
    
    try {
      const { initializeBot } = await import("../telegram.js");
      const { initializeDiscord } = await import("../discord.js");
      const { initializeTwitter } = await import("../twitter.js");
      const { initializeMCP } = await import("../mcp.js");

      initializeBot(db, true).catch(err => {
        console.error("[KERNEL_DYNAMIC] Failed to sync Telegram Bot after settings update:", err);
      });
      initializeDiscord(db, true).catch(err => {
        console.error("[KERNEL_DYNAMIC] Failed to sync Discord Bot after settings update:", err);
      });
      initializeTwitter(db, true).catch(err => {
        console.error("[KERNEL_DYNAMIC] Failed to sync Twitter Bot after settings update:", err);
      });
      initializeMCP(true).catch(err => {
        console.warn("[KERNEL_DYNAMIC] Dynamic MCP syncing connection offline:", err.message || err);
      });
    } catch (importErr) {
      console.error("[KERNEL_DYNAMIC] Failed to import daemon initialization utilities:", importErr);
    }

    broadcastToWS({ type: "settings_update", data: req.body });
    res.json({ success: true });
  });

  // --- Environment Variables (.env) CRUD APIs ---
  app.get("/api/env", async (req, res) => {
    try {
      const rootPath = process.cwd();
      const envPath = path.join(rootPath, ".env");
      const examplePath = path.join(rootPath, ".env.example");

      let currentEnvs: Record<string, string> = {};
      let recommendedKeys: string[] = ["GEMINI_API_KEY", "TENSORART_API_KEY", "YUIHIME_SYSTEM_ROOT"];

      // Read .env if exists
      if (existsSync(envPath)) {
        try {
          const content = readFileSync(envPath, "utf-8");
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > -1) {
              const key = trimmed.slice(0, eqIdx).trim();
              let value = trimmed.slice(eqIdx + 1).trim();
              if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }
              currentEnvs[key] = value;
            }
          }
        } catch (readErr) {
          console.error("[ENV_API] Failed to read or parse .env file:", readErr);
        }
      }

      // Read .env.example if exists to enrich recommended keys
      if (existsSync(examplePath)) {
        try {
          const content = readFileSync(examplePath, "utf-8");
          const lines = content.split(/\r?\n/);
          const collected: string[] = [];
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > -1) {
              const key = trimmed.slice(0, eqIdx).trim();
              if (key && !collected.includes(key)) {
                collected.push(key);
              }
            }
          }
          if (collected.length > 0) {
            recommendedKeys = collected;
          }
        } catch (readErr) {
          console.error("[ENV_API] Failed to read .env.example:", readErr);
        }
      }

      res.json({
        success: true,
        envs: currentEnvs,
        recommendedKeys
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load environment variables." });
    }
  });

  app.post("/api/env", async (req, res) => {
    try {
      const { envs } = req.body;
      if (!envs || typeof envs !== "object") {
        return res.status(400).json({ error: "Format request tidak valid. 'envs' wajib berupa objek key-value." });
      }

      const rootPath = process.cwd();
      const envPath = path.join(rootPath, ".env");

      // Build file contents
      let fileContent = "# =========================================================================\n";
      fileContent += `# YUIHIME CORE ENVIRONMENT VARIABLES\n`;
      fileContent += `# Generated dynamically via Settings Env Manager\n`;
      fileContent += `# Last Modified: ${new Date().toISOString()}\n`;
      fileContent += "# =========================================================================\n\n";

      for (const [key, value] of Object.entries(envs)) {
        const cleanKey = key.trim();
        if (!cleanKey) continue;
        const cleanValue = typeof value === "string" ? value.trim() : String(value).trim();
        fileContent += `${cleanKey}=${cleanValue}\n`;

        // Instantly inject into current process in-memory state
        process.env[cleanKey] = cleanValue;
      }

      // Sync physical file
      writeFileSync(envPath, fileContent, "utf-8");
      console.log(`[ENV_API] Successfully updated .env file with ${Object.keys(envs).length} variable(s).`);

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ENV_API_ERROR] Failed to save .env file:", err);
      res.status(500).json({ error: err.message || "Failed to save environment variables." });
    }
  });

  // --- Full Backup and Restore APIs ---
  app.get("/api/backup", async (req, res) => {
    try {
      console.log("[BACKUP] Initiating full system backup of .yuihime...");
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      
      const tempDbPath = path.join(process.cwd(), `yuihime.db.backup.${Date.now()}`);
      
      // Save database snapshot cleanly to a temp file
      if (db) {
        console.log(`[BACKUP] Snapshotting SQLite database to: ${tempDbPath}`);
        await db.backup(tempDbPath);
      } else {
        throw new Error("Database instance is not currently loaded.");
      }
      
      // 1. Add cleanly screenshotted data/yuihime.db
      zip.addLocalFile(tempDbPath, "data", "yuihime.db");
      
      // 2. Add config.toml
      const configPath = process.env.YUIHIME_CONFIG || path.join(apiCustomSystemRoot, "data", "config.toml");
      if (existsSync(configPath)) {
        zip.addLocalFile(configPath, "data", "config.toml");
      }
      
      // Helper function to safely read and add subfolders
      const addFolderIfNotEmpty = (localDir: string, zipPath: string) => {
        if (existsSync(localDir)) {
          const files = readdirSync(localDir);
          if (files.length > 0) {
            zip.addLocalFolder(localDir, zipPath);
          }
        }
      };
      
      // 3. Add user_data
      const userDataPath = process.env.YUIHIME_USER_DATA_PATH || path.join(apiCustomSystemRoot, "user_data");
      addFolderIfNotEmpty(userDataPath, "user_data");
      
      // 4. Add agent
      const agentPath = process.env.YUIHIME_AGENT_PATH || path.join(apiCustomSystemRoot, "agent");
      addFolderIfNotEmpty(agentPath, "agent");
      
      // 5. Add addons
      const addonsPath = process.env.YUIHIME_ADDONS_PATH || path.join(apiCustomSystemRoot, "addons");
      addFolderIfNotEmpty(addonsPath, "addons");
      
      // Build buffer
      const zipBuffer = zip.toBuffer();
      
      // Delete temporary backup SQLite file cleanly
      try {
        await fs.unlink(tempDbPath);
      } catch (err) {
        console.error("[BACKUP] Non-blocking warning: failed deleting temporary database snapshot:", err);
      }
      
      // Dispatch content
      res.setHeader("Content-Disposition", `attachment; filename=yuihime-backup-${Date.now()}.zip`);
      res.setHeader("Content-Type", "application/zip");
      res.send(zipBuffer);
      console.log("[BACKUP] System snapshot fully packaged and sent to consumer.");
    } catch (err: any) {
      console.error("[BACKUP_ERROR] Full backup packaging failed:", err);
      res.status(500).json({ error: err.message || "Gagal mengemas berkas cadangan (backup) batin." });
    }
  });

  app.post("/api/backup/restore", async (req, res) => {
    try {
      const { backupData } = req.body;
      if (!backupData) {
        return res.status(400).json({ error: "No backupData base64 payload provided." });
      }
      
      console.log("[RESTORE] Restoring system from compressed base64 ZIP payload...");
      const AdmZip = (await import("adm-zip")).default;
      const buffer = Buffer.from(backupData, "base64");
      const zip = new AdmZip(buffer);
      
      const tempExtractDir = path.join(process.cwd(), `.yuihime_restore_${Date.now()}`);
      if (!existsSync(tempExtractDir)) {
        mkdirSync(tempExtractDir, { recursive: true });
      }
      
      // Extract everything
      zip.extractAllTo(tempExtractDir, true);
      console.log(`[RESTORE] Raw backup extracted in temporary workspace: ${tempExtractDir}`);
      
      // Dynamic finder to locate config.toml and yuihime.db anywhere inside the extracted folder
      const findFileRecursive = (dir: string, targetName: string): string | null => {
        if (!existsSync(dir)) return null;
        const list = readdirSync(dir);
        for (const item of list) {
          const fullPath = path.join(dir, item);
          let stat;
          try {
            stat = statSync(fullPath);
          } catch (e) {
            continue; // Skip inaccessible entries
          }
          if (stat.isDirectory()) {
            const found = findFileRecursive(fullPath, targetName);
            if (found) return found;
          } else if (item === targetName) {
            return fullPath;
          }
        }
        return null;
      };

      const foundConfigPath = findFileRecursive(tempExtractDir, "config.toml");
      const foundDbPath = findFileRecursive(tempExtractDir, "yuihime.db");
      
      if (!foundConfigPath || !foundDbPath) {
        rmSync(tempExtractDir, { recursive: true, force: true });
        return res.status(400).json({ 
          error: "Berkas cadangan tidak valid: wajib memuat berkas 'config.toml' dan 'yuihime.db' di dalam arsip cadangan." 
        });
      }

      // Determine the real source root of the configuration folders
      let sourceRoot = tempExtractDir;
      const parentDir = path.dirname(foundConfigPath);
      if (path.basename(parentDir) === "data") {
        sourceRoot = path.dirname(parentDir);
      } else {
        sourceRoot = parentDir;
      }

      console.log(`[RESTORE] Auto-detected true backup source root at: ${sourceRoot}`);

      // Ensure data directory exists and configuration files are correctly positioned under sourceRoot/data/
      const stdDataDir = path.join(sourceRoot, "data");
      if (!existsSync(stdDataDir)) {
        mkdirSync(stdDataDir, { recursive: true });
      }

      const targetConfig = path.join(stdDataDir, "config.toml");
      const targetDb = path.join(stdDataDir, "yuihime.db");

      if (foundConfigPath !== targetConfig) {
        if (existsSync(targetConfig)) unlinkSync(targetConfig);
        renameSync(foundConfigPath, targetConfig);
      }

      if (foundDbPath !== targetDb) {
        if (existsSync(targetDb)) unlinkSync(targetDb);
        renameSync(foundDbPath, targetDb);
      }

      // 1. Lock and safely dispose of active connection pool
      console.log("[RESTORE] Shutting down active SQLite database handles...");
      const dbModule = await import("../../database.js");
      dbModule.closeDatabase();
      
      // 2. Perform atomic system folders replacement
      const yuihimeRoot = apiCustomSystemRoot;
      const backupDir = `${apiCustomSystemRoot}_old_${Date.now()}`;
      
      if (existsSync(yuihimeRoot)) {
        renameSync(yuihimeRoot, backupDir);
        console.log(`[RESTORE] Active workspace archived to: ${backupDir}`);
      }
      
      // Move temp restored directory to real path
      renameSync(sourceRoot, yuihimeRoot);
      console.log("[RESTORE] Installed restored workspace directories inside .yuihime active root!");
      
      // If sourceRoot was a subdirectory inside tempExtractDir, clean up tempExtractDir
      if (sourceRoot !== tempExtractDir) {
        try {
          rmSync(tempExtractDir, { recursive: true, force: true });
        } catch (e) {
          // ignore cleanup errors of top level temp folder
        }
      }

      // 3. Clear and reload settings parameters
      await SettingsManager.getInstance().load();
      console.log("[RESTORE] SettingsManager fully loaded and sync'd newly restored config.toml.");
      
      // 4. Re-open and reinitialize database handles
      console.log("[RESTORE] Reconnecting database pool to restored DB...");
      const restoredDb = dbModule.initializeDatabase();
      
      // Re-assign local register routing CLOSURE reference bound to 'db'
      db = restoredDb;
      console.log("[RESTORE] Local router database instances updated fully. System is live!");

      // 5. Update NeuralInterface & MultiChannelQueue references
      try {
        const { NeuralInterface } = await import("../../kernel/NeuralInterface.js");
        const { MultiChannelQueue } = await import("../../kernel/MultiChannelQueue.js");
        NeuralInterface.setDatabase(restoredDb);
        const queueObj = MultiChannelQueue.getInstance();
        queueObj.setDatabase(restoredDb);
        console.log("[RESTORE] NeuralInterface and MultiChannelQueue database handles refreshed.");
      } catch (queueErr) {
        console.error("[RESTORE_ERR] Failed to update NeuralInterface/MultiChannelQueue DB reference:", queueErr);
      }

      // 6. Update Telegram, Discord, and Twitter database references, forcing their bots to restart with updated credentials
      try {
        const telegramModule = await import("../telegram.js");
        await telegramModule.initializeBot(restoredDb, true);
        console.log("[RESTORE] Telegram Bot Daemon refreshed with restored DB.");
      } catch (tgErr) {
        console.warn("[RESTORE_WARN] Failed to re-init Telegram Bot:", tgErr);
      }

      try {
        const discordModule = await import("../discord.js");
        await discordModule.initializeDiscord(restoredDb, true);
        console.log("[RESTORE] Discord Bot Daemon refreshed with restored DB.");
      } catch (dcErr) {
        console.warn("[RESTORE_WARN] Failed to re-init Discord Bot:", dcErr);
      }

      try {
        const twitterModule = await import("../twitter.js");
        await twitterModule.initializeTwitter(restoredDb, true);
        console.log("[RESTORE] Twitter Daemon refreshed with restored DB.");
      } catch (twErr) {
        console.warn("[RESTORE_WARN] Failed to re-init Twitter bot:", twErr);
      }
      
      // Clean up backup directory asynchronously
      try {
        rmSync(backupDir, { recursive: true, force: true });
        console.log("[RESTORE] Old archived folder wiped cleanly.");
      } catch (cleanErr) {
        console.warn("[RESTORE] Non-critical warning cleanup: failed to remove archived `.yuihime_old` directory:", cleanErr);
      }
      
      broadcastToWS({ type: "restore_success" });
      res.json({ success: true, message: "Seluruh berkas data emosi, batin, dan kepribadian Yuihime berhasil dipulihkan seutuhnya!" });
    } catch (err: any) {
      console.error("[RESTORE_ERROR] Active system recovery failed:", err);
      res.status(500).json({ error: err.message || "Gagal memulihkan sistem dari berkas cadangan." });
    }
  });

  app.get("/api/cron", (req, res) => {
    const tasks = db.prepare("SELECT * FROM cron_tasks").all();
    res.json(tasks.map((t: any) => ({ ...t, enabled: t.enabled === 1, repeating: t.repeating === 1 })));
  });

  app.post("/api/cron", (req, res) => {
    const { id, name, schedule, enabled, repeating, context_id, chat_type, sender_name } = req.body;
    // Accept prompt / command / instruction aliases (crontab-style command body)
    const rawPrompt = extractCronPromptFromArgs(req.body);
    const final_prompt = normalizeCronPromptForSave({
      id,
      name,
      prompt: rawPrompt,
      action: typeof req.body?.action === 'string' ? req.body.action : null,
    });
    
    let final_context_id = context_id || 'live_stream';
    let final_chat_type = chat_type || 'Live Chat';
    const final_sender_name = sender_name || 'Penonton';

    // Auto-resolve Telegram context if target chat type is Telegram but context is live_stream or generic
    if (final_chat_type.toLowerCase().includes('telegram') && (final_context_id === 'live_stream' || !final_context_id.startsWith('tg_'))) {
      try {
        const callerName = final_sender_name;
        let foundTgId = '';

        // Search for identity matching caller's name
        const identity = db.prepare("SELECT * FROM identities WHERE perceivedName = ?").get(callerName);
        if (identity) {
          const accounts = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
          
          // 1. Check for stored telegram identifier in linkedAccounts format (e.g. telegram:id:12345)
          for (const acc of accounts) {
            const cleanAcc = acc.toLowerCase();
            if (cleanAcc.startsWith('telegram:id:')) {
              foundTgId = acc.split(':')[2];
              break;
            }
          }
          
          if (!foundTgId) {
            // 2. Fallback to matching username from telegram_users
            for (const acc of accounts) {
              const cleanAcc = acc.toLowerCase();
              if (cleanAcc.startsWith('telegram (private):')) {
                const tgName = acc.split(':')[1];
                const tgUser = db.prepare("SELECT tg_id FROM telegram_users WHERE username = ?").get(tgName);
                if (tgUser) {
                  foundTgId = tgUser.tg_id?.toString();
                  break;
                }
              }
            }
          }
        }

        // Ultimate Fallback A: Any identity with a linked Telegram ID
        if (!foundTgId) {
          const anyPaired = db.prepare("SELECT linkedAccounts FROM identities WHERE linkedAccounts LIKE '%telegram:id:%' LIMIT 1").get();
          if (anyPaired) {
            const pairedAccs = JSON.parse(anyPaired.linkedAccounts);
            for (const acc of pairedAccs) {
              if (acc.toLowerCase().startsWith('telegram:id:')) {
                foundTgId = acc.split(':')[2];
                break;
              }
            }
          }
        }

        // Ultimate Fallback B: Most recently active Telegram user from logs
        if (!foundTgId) {
          const lastTgUser = db.prepare("SELECT tg_id FROM telegram_users ORDER BY last_seen DESC LIMIT 1").get();
          if (lastTgUser) {
            foundTgId = lastTgUser.tg_id?.toString();
          }
        }
        
        if (foundTgId) {
          final_context_id = `tg_${foundTgId}`;
          final_chat_type = 'Telegram (Private)';
          console.log(`[CRON_AUTO_RESOLVE] Redirected task target for user ${callerName} to ${final_context_id} on Telegram`);
        }
      } catch (err: any) {
        console.error("[CRON_AUTO_RESOLVE] Failed to resolve target telegram user chat ID:", err.message);
      }
    }

    db.prepare(`
      INSERT INTO cron_tasks (id, name, schedule, enabled, repeating, context_id, chat_type, sender_name, prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        schedule = excluded.schedule,
        enabled = excluded.enabled,
        repeating = excluded.repeating,
        context_id = COALESCE(excluded.context_id, cron_tasks.context_id),
        chat_type = COALESCE(excluded.chat_type, cron_tasks.chat_type),
        sender_name = COALESCE(excluded.sender_name, cron_tasks.sender_name),
        prompt = excluded.prompt
    `).run(
      id, name, schedule, enabled ? 1 : 0, repeating ? 1 : 0,
      final_context_id,
      final_chat_type,
      final_sender_name,
      final_prompt
    );
    
    const cron = CronModule.getInstance();
    if (enabled) {
      cron.registerTask({
        id,
        name,
        schedule,
        enabled: true,
        repeating: !!repeating,
        context_id: final_context_id,
        chat_type: final_chat_type,
        sender_name: final_sender_name,
        action: getCronAction(id, name, !!repeating, db)
      });
    } else {
      cron.stopTask(id);
    }
    res.json({ success: true });
  });

  app.delete("/api/cron/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM cron_tasks WHERE id = ?").run(id);
    CronModule.getInstance().removeTask(id);
    res.json({ success: true });
  });

  app.post("/api/cron/:id/trigger", async (req, res) => {
    const { id } = req.params;
    const cron = CronModule.getInstance();
    const tasks = cron.getTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Sinyal aktivitas tidak ditemukan di CronModule." });
    }
    
    try {
      console.log(`[CRON] Manually triggering task: ${task.name} (${task.id})`);
      // Run the action asynchronously
      task.action().catch(e => {
        console.error(`[CRON] Manual execution of task ${task.name} failed:`, e);
      });
      res.json({ success: true, message: `Tugas ${task.name} berhasil dipicu.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal memicu tugas kognisi." });
    }
  });

  // --- Pending Messages / Offline Retry Queue APIs ---
  app.get("/api/pending-messages", (req, res) => {
    try {
      const messages = db.prepare("SELECT * FROM pending_messages WHERE status = 'pending' ORDER BY timestamp DESC LIMIT 100").all();
      res.json(messages);
    } catch (e: any) {
      console.error("[SERVER] Failed to query pending messages:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/pending-messages/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM pending_messages WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[SERVER] Failed to delete specific pending message:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/pending-messages/clear", (req, res) => {
    try {
      db.prepare("DELETE FROM pending_messages").run();
      res.json({ success: true });
    } catch (e: any) {
      console.error("[SERVER] Failed to truncate pending messages:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/pending-messages/retry", async (req, res) => {
    try {
      const queue = MultiChannelQueue.getInstance();
      queue.dispatchPendingMessages().catch(err => {
        console.error("[QUEUE_MANUAL_DISPATCH_ERR]:", err);
      });
      res.json({ success: true, message: "Picu ulang pengiriman antrean tertunda luring diaktifkan." });
    } catch (e: any) {
      console.error("[SERVER] Failed to dispatch pending queue manually:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/pending-messages/retry/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pending = db.prepare("SELECT * FROM pending_messages WHERE id = ?").get(id) as any;
      if (!pending) {
        return res.status(404).json({ error: "Pesan tertunda tidak ditemukan." });
      }

      console.log(`[API_MANUAL_RETRY] Manual trigger retry untuk ${pending.sender_name} - ${pending.id}`);
      
      const reply = await NeuralInterface.processNeuralInput(pending.input, pending.sender_name, pending.context_id, pending.chat_type);
      if (reply && reply.trim()) {
        if (pending.context_id.startsWith("tg_")) {
          const chatId = pending.context_id.replace("tg_", "");
          try {
            const activeTelegramBot = (globalThis as any).activeTelegramBot;
            if (activeTelegramBot) {
              const delayedReply = `[BALASAN TERTUNDA] @${pending.sender_name}, ini balasan Yui untuk pesanmu sebelumnya: "${pending.input.substring(0, 25)}${pending.input.length > 25 ? '...' : ''}" \n\n${reply}`;
              await activeTelegramBot.telegram.sendMessage(chatId, delayedReply);
            } else {
              console.warn("[API_MANUAL_RETRY] Bot Telegram offline, memori tersimpan di database.");
            }
          } catch (tgErr) {
            console.error("[API_MANUAL_RETRY] Failed to send Telegram message:", tgErr);
          }
        } else {
          eventBus.emit('OUTPUT_EMITTED', { 
            response: `[BALASAN TERTUNDA] @${pending.sender_name}: ${reply}`, 
            isInternal: true 
          });
        }
        db.prepare("DELETE FROM pending_messages WHERE id = ?").run(id);
        res.json({ success: true, message: "Pesan sukses diproses batiniah Yui!" });
      } else {
        res.status(500).json({ error: "Gagal memproses kognisi, respons kosong." });
      }
    } catch (e: any) {
      console.error("[SERVER] Failed to retry single message:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // --- Workflow Graph APIs ---
  app.get("/api/workflow", async (req, res) => {
    const workflow = await loadWorkflow();
    res.json(workflow);
  });

  app.post("/api/workflow", async (req, res) => {
    await saveWorkflow(req.body);
    res.json({ success: true });
  });

  // --- Addon APIs ---
  app.get("/api/addons", async (req, res) => {
    const addons = await discoverAddons();
    res.json(addons);
  });

  app.post("/api/addons/install", async (req, res) => {
    const { id, config, code, runtime } = req.body;
    if (!id || !config || !code || !runtime) {
      return res.status(400).json({ error: "Missing required fields: id, config, code, runtime" });
    }

    try {
      const addonPath = path.join(addonsDir, id);
      await fs.mkdir(addonPath, { recursive: true });

      const entryPointName = runtime === 'python' ? 'main.py' : (runtime === 'node' ? 'main.js' : 'main.sh');
      
      await fs.writeFile(path.join(addonPath, "config.toml"), config);
      await fs.writeFile(path.join(addonPath, entryPointName), code);

      res.json({ success: true, message: `Addon ${id} installed successfully.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/addons/execute/:id", async (req, res) => {
    const { id } = req.params;
    const { args } = req.body;
    const addons = await discoverAddons();
    const addon = addons.find(a => a.id === id);

    if (!addon) return res.status(404).json({ error: "Addon not found" });

    try {
      const entry = path.join(addon.path, addon.entryPoint);
      let cmd = "";

      switch (addon.runtime) {
        case 'python': cmd = `python3 "${entry}"`; break;
        case 'lua': cmd = `lua "${entry}"`; break;
        case 'node': cmd = `node "${entry}"`; break;
        case 'go': cmd = `go run "${entry}"`; break;
        case 'bash': cmd = `bash "${entry}"`; break;
        default: throw new Error("Unsupported runtime");
      }

      if (args) {
        const combatQuote = JSON.stringify(args).replace(/'/g, "'\\''");
        cmd += ` '${combatQuote}'`;
      }

      const settings = await SettingsManager.getInstance().load();
      const addonConfig = settings[id] || {};
      const env: any = { ...process.env };
      
      Object.entries(addonConfig).forEach(([key, val]) => {
         const envKey = `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
         env[envKey] = String(val);
      });

      console.log(`[ADDON-SYSTEM] Executing: ${cmd} with env injection.`);
      const { stdout, stderr } = await execPromise(cmd, { timeout: 30000, env });
      res.json({ stdout, stderr, success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message, stderr: error.stderr });
    }
  });

  // --- External Tools APIs (Shell, Files, Search) ---
  // Routes will be injected here

  // --- Persona / Cognitive Markdown APIs (read/write .yuihime/agent/*.md) ---
  const allowedMarkdownFiles = new Set([
    'character.md', 'lore.md', 'system_prompt.md',
    'IDENTITY.md', 'SOUL.md', 'MEMORY.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md'
  ]);

  function resolveAgentMarkdownPath(filename: string): string | null {
    if (!allowedMarkdownFiles.has(filename)) return null;
    const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(apiCustomSystemRoot, "agent");
    return path.join(agentDir, filename);
  }

  app.get("/api/system/markdown/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const targetPath = resolveAgentMarkdownPath(filename);
      if (!targetPath) {
        return res.status(400).json({ error: "Invalid markdown filename." });
      }
      if (!existsSync(targetPath)) {
        const fallbackDir = path.join(process.cwd(), "src", "share", "prompts");
        const fallbackPath = path.join(fallbackDir, filename);
        if (existsSync(fallbackPath)) {
          const content = readFileSync(fallbackPath, "utf-8");
          return res.json({ content, source: "fallback", sourcePath: fallbackPath });
        }
        return res.status(404).json({ error: "Markdown file not found." });
      }
      const content = readFileSync(targetPath, "utf-8");
      res.json({ content, source: "agent", sourcePath: targetPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load markdown." });
    }
  });

  app.post("/api/system/markdown/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const { content } = req.body;
      const targetPath = resolveAgentMarkdownPath(filename);
      if (!targetPath) {
        return res.status(400).json({ error: "Invalid markdown filename." });
      }
      if (typeof content !== "string") {
        return res.status(400).json({ error: "Request body must include 'content' string." });
      }
      const agentDir = path.dirname(targetPath);
      if (!existsSync(agentDir)) {
        mkdirSync(agentDir, { recursive: true });
      }
      writeFileSync(targetPath, content, "utf-8");
      res.json({ success: true, path: targetPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save markdown." });
    }
  });

  // --- Custom Persona CRUD APIs ---
  const parsePersonaRow = (row: any) => {
    if (!row) return null;
    return {
      ...row,
      behavior: row.behavior ? JSON.parse(row.behavior) : null,
      modules: row.modules ? JSON.parse(row.modules) : null,
      artistry: row.artistry ? JSON.parse(row.artistry) : null,
      settings: row.settings ? JSON.parse(row.settings) : null,
      traits: row.traits ? JSON.parse(row.traits) : [],
    };
  };

  app.get("/api/system/personas", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM custom_personas ORDER BY updatedAt DESC").all();
      res.json(rows.map(parsePersonaRow));
    } catch (err: any) {
      console.error("[PERSONA_API] Failed to list personas:", err);
      res.status(500).json({ error: err.message || "Failed to load personas." });
    }
  });

  app.get("/api/system/personas/:id", (req, res) => {
    try {
      const row = db.prepare("SELECT * FROM custom_personas WHERE id = ?").get(req.params.id);
      const persona = parsePersonaRow(row);
      if (!persona) {
        return res.status(404).json({ error: "Persona not found." });
      }
      res.json(persona);
    } catch (err: any) {
      console.error("[PERSONA_API] Failed to get persona:", err);
      res.status(500).json({ error: err.message || "Failed to load persona." });
    }
  });

  app.post("/api/system/personas", (req, res) => {
    try {
      const persona = req.body;
      if (!persona || !persona.id || !persona.name) {
        return res.status(400).json({ error: "Persona 'id' and 'name' are required." });
      }
      db.prepare(`
        INSERT INTO custom_personas (id, name, nickname, description, creatorNotes, version, behavior, modules, artistry, settings, color, traits, archetype, systemPrompt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          nickname = excluded.nickname,
          description = excluded.description,
          creatorNotes = excluded.creatorNotes,
          version = excluded.version,
          behavior = excluded.behavior,
          modules = excluded.modules,
          artistry = excluded.artistry,
          settings = excluded.settings,
          color = excluded.color,
          traits = excluded.traits,
          archetype = excluded.archetype,
          systemPrompt = excluded.systemPrompt,
          updatedAt = excluded.updatedAt
      `).run(
        persona.id,
        persona.name,
        persona.nickname || null,
        persona.description || '',
        persona.creatorNotes || null,
        persona.version || '1.0.0',
        persona.behavior ? JSON.stringify(persona.behavior) : null,
        persona.modules ? JSON.stringify(persona.modules) : null,
        persona.artistry ? JSON.stringify(persona.artistry) : null,
        persona.settings ? JSON.stringify(persona.settings) : null,
        persona.color || null,
        JSON.stringify(persona.traits || []),
        persona.archetype || null,
        persona.systemPrompt || null,
        Date.now()
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("[PERSONA_API] Failed to save persona:", err);
      res.status(500).json({ error: err.message || "Failed to save persona." });
    }
  });

  app.delete("/api/system/personas/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM custom_personas WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[PERSONA_API] Failed to delete persona:", err);
      res.status(500).json({ error: err.message || "Failed to delete persona." });
    }
  });
}
