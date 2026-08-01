import { join, resolve } from "path";
import fs from "fs/promises";
import { renameSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, unlinkSync, readSync, cpSync, realpathSync } from "fs";

const __loadEnvFile = (filePath) => {
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let value = trimmed.slice(eqIdx + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    });
  }
};

let __envDir = process.cwd();
while (true) {
  __loadEnvFile(join(__envDir, ".env"));
  const __parent = resolve(__envDir, "..");
  if (__parent === __envDir) break;
  __envDir = __parent;
}
process.title = 'yuihime';
import { SettingsManager } from "./src/core/kernel/settings.js";
import os from "os";

// --- Global EPIPE Protection for cron/background tasks ---
const originalConsoleFns = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug
};
let __globalServer: any = null;
let __globalWss: any = null;
['log', 'warn', 'error', 'info', 'debug'].forEach((method) => {
  (console as any)[method] = (...args: any[]) => {
    try {
      (originalConsoleFns as any)[method].apply(console, args);
    } catch (e: any) {
      if (e.code !== 'EPIPE' && e.errno !== -32) throw e;
    }
  };
});

// Also catch EPIPE at process level for extra resilience
process.stdout.on('error', (err: any) => {
  if (err.code !== 'EPIPE' && err.errno !== -32) throw err;
});
process.stderr.on('error', (err: any) => {
  if (err.code !== 'EPIPE' && err.errno !== -32) throw err;
});

// --- Apply configured log-level gate as early as possible (before async load)
// so verbose boot logs are quieted from the very first line. ---
// Note: moved into startServer() because esbuild CJS bundle does not support top-level await

// --- Global Native Fetch Interceptor for Node.js (Relative URLs Fallback) ---
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const port = process.env.PORT || "3000";
  if (typeof input === "string" && input.startsWith("/")) {
    return originalFetch(`http://127.0.0.1:${port}${input}`, init);
  }
  if (input instanceof URL && input.href.startsWith("/")) {
    return originalFetch(new URL(`http://127.0.0.1:${port}${input.pathname}${input.search}`), init);
  }
  return originalFetch(input, init);
};

import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import * as toml from "smol-toml";

let __filename = "";
let __dirname = "";
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    __filename = fileURLToPath(import.meta.url);
  } else {
    __filename = typeof __filename !== "undefined" ? __filename : "";
  }
} catch (e) {
  __filename = typeof __filename !== "undefined" ? __filename : "";
}

try {
  __dirname = __filename ? path.dirname(__filename) : (typeof __dirname !== "undefined" ? __dirname : process.cwd());
} catch (e) {
  __dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
}
import { exec } from "child_process";
import { promisify } from "util";
import Database from "better-sqlite3";

// --- OOB Portability CLI Argument & Env Override Parser ---
const argsOverride = {
  dbPath: "",
  configPath: "",
  addonsPath: "",
  agentPath: "",
  port: ""
};

for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--db-path" && i + 1 < process.argv.length) {
    argsOverride.dbPath = process.argv[++i];
  } else if (arg === "--config" && i + 1 < process.argv.length) {
    argsOverride.configPath = process.argv[++i];
  } else if (arg === "--addons" && i + 1 < process.argv.length) {
    argsOverride.addonsPath = process.argv[++i];
  } else if (arg === "--agent" && i + 1 < process.argv.length) {
    argsOverride.agentPath = process.argv[++i];
  } else if (arg === "--port" && i + 1 < process.argv.length) {
    argsOverride.port = process.argv[++i];
  } else if (arg === "--settings") {
    (argsOverride as any).settingsMode = true;
  } else if (arg === "--no-ui") {
    (argsOverride as any).noUi = true;
  }
}

if (argsOverride.dbPath) process.env.YUIHIME_DB_PATH = argsOverride.dbPath;
if (argsOverride.configPath) process.env.YUIHIME_CONFIG = argsOverride.configPath;
if (argsOverride.addonsPath) process.env.YUIHIME_ADDONS_PATH = argsOverride.addonsPath;
if (argsOverride.agentPath) process.env.YUIHIME_AGENT_PATH = argsOverride.agentPath;
if (argsOverride.port) process.env.PORT = argsOverride.port;
process.on("warning", (warning: any) => {
  if (warning.code === "DEP0169") return;
  console.warn(warning.name, warning.message, warning.stack);
});

import { runOnboarding, seedDefaultCronTask } from "./src/core/server/onboarding.js";

// run first-time setup / system directories mapping outside binary
runOnboarding();

const execPromise = promisify(exec);

import { StorageServer } from "./shared/drivers/storageServer.js";

// Register StorageServer on globalThis so shared/drivers/storage.ts can bypass HTTP in Node
// MUST be set BEFORE RegistryInitializer imports, because AGI modules may call StorageService during module load.
(globalThis as any).__yuihimeStorageServer = StorageServer;

import { initializeCortexModules } from "./src/core/RegistryInitializer.js";
import { initializeBot, getActiveTelegramBot, activeTelegramBot as yuihimeActiveTelegramBot } from "./src/core/server/telegram.js";
import { initializeDiscord, activeDiscordClient as yuihimeActiveDiscordClient } from "./src/core/server/discord.js";
import { initializeTwitter, activeTwitterInterval as yuihimeActiveTwitterInterval } from "./src/core/server/twitter.js";
import { initializeMCP } from "./src/core/server/mcp.js";
import { startRepl } from "./src/bin/terminal.js";
import { startSettingsTUI } from "./src/core/server/settingsTUI.js";
import { registerAPIRoutes, activeWSConnections, activeStreamClients, broadcastToWS, getCronAction } from "./src/core/server/apiRouter.js";
import { Kernel } from "./src/core/kernel/core.js";
import { AIService } from "./src/core/kernel/ai.js";
import { CronModule } from "./src/core/kernel/cron.js";
import { NeuralInterface } from "./src/core/kernel/NeuralInterface.js";
import { MultiChannelQueue } from "./src/core/kernel/MultiChannelQueue.js";
import { closeDatabase } from "./src/core/database.js";

// --- Settings System ---
const settingsPath = process.env.YUIHIME_CONFIG || path.join(os.homedir(), ".yuihime", "data", "config.toml");
const workflowPath = path.join(process.cwd(), "workflow.json");

// Bridge to Kernel's SettingsManager
async function loadSettings(): Promise<any> {
    return await SettingsManager.getInstance().load();
}

async function saveSettings(settings: any) {
    await SettingsManager.getInstance().save(settings);
}

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
const addonsDir = process.env.YUIHIME_ADDONS_PATH || path.join(os.homedir(), ".yuihime", "addons");
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

        // Support config.toml (Yuihime format)
        const tomlPath = path.join(addonPath, "config.toml");
        const jsonPath = path.join(addonPath, "skill.json");
        const manifestPath = path.join(addonPath, "manifest.json");

        if (existsSync(tomlPath)) {
          try {
            const content = await fs.readFile(tomlPath, "utf-8");
            meta = toml.parse(content);
          } catch (e) {}
        } 
        // Support skill.json (Standard Yuihime Skill format)
        else if (existsSync(jsonPath)) {
          try {
            const content = await fs.readFile(jsonPath, "utf-8");
            const rawMeta = JSON.parse(content);
            meta = {
              tool: {
                id: rawMeta.id || dir.name,
                name: rawMeta.name || dir.name,
                description: rawMeta.description || "",
                version: rawMeta.version || "1.0.0",
                parameters: rawMeta.parameters || { type: "object", properties: {}, required: [] }
              }
            };
          } catch (e) {}
        }
        // Support manifest.json (General metadata)
        else if (existsSync(manifestPath)) {
          try {
            const content = await fs.readFile(manifestPath, "utf-8");
            const rawMeta = JSON.parse(content);
            meta = {
              tool: {
                id: rawMeta.id || dir.name,
                name: rawMeta.name || dir.name,
                description: rawMeta.description || "",
                version: rawMeta.version || "1.0.0",
                parameters: rawMeta.parameters || { type: "object", properties: {}, required: [] }
              }
            };
          } catch (e) {}
        }

        if (meta) {
          try {
            const files = await fs.readdir(addonPath);
            // Dynamic check of entrypoint: look for main.*, index.*, run.* or what is defined
            entryPoint = files.find(f => 
              f === "main.js" || f === "main.cjs" || f === "main.py" || f === "main.sh" ||
              f === "index.js" || f === "index.py" || f === "run.py" || f === "run.sh" ||
              f.startsWith("main.") || f.startsWith("index.") || f.startsWith("run.")
            ) || "";

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
    return addons;
  } catch (e) {
    return [];
  }
}

import { initializeDatabase, setupSchema, startAutoCleanupScheduler, startFtsSyncScheduler, dbPath, retryDbOperation } from "./src/core/database.js";

let db: any = null;

async function bootstrap() {
  db = initializeDatabase();
  await retryDbOperation(() => setupSchema(db), 'setupSchema');

  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS pending_messages (
        id TEXT PRIMARY KEY,
        input TEXT,
        sender_name TEXT,
        context_id TEXT,
        chat_type TEXT,
        timestamp INTEGER,
        attempts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
      )
    `).run();
  } catch (e: any) {
    console.warn("[SERVER] Warning: pending_messages safety-net creation failed:", e.message);
  }

  try {
    const cutoff = Date.now() - 10 * 60 * 1000;
    const stalePending = db.prepare("DELETE FROM pending_messages WHERE status = 'pending' AND timestamp < ?").run(cutoff);
    const staleFailed = db.prepare("DELETE FROM pending_messages WHERE status = 'failed' AND timestamp < ?").run(cutoff);
    const totalCleaned = (stalePending.changes || 0) + (staleFailed.changes || 0);
    if (totalCleaned > 0) {
      console.log(`[SERVER] Startup cleanup: removed ${totalCleaned} stale pending/failed messages.`);
    }
  } catch (cleanupErr: any) {
    console.warn("[SERVER] Startup pending message cleanup failed:", cleanupErr.message);
  }

  startAutoCleanupScheduler(db);
  startFtsSyncScheduler(db);

  (globalThis as any).yuihime_db = db;
  (globalThis as any).yuihime_initializeDatabase = initializeDatabase;
  (globalThis as any).yuihime_CronModule = CronModule;

  try {
    await retryDbOperation(() => {
      db.prepare(`
        INSERT INTO agent_state (id, mood, emotion, relation, systemHealth, lastDreamCycle, lastRefreshed, activePersonaId, currentPlan)
        VALUES (1, '{}', '{}', '{}', '{}', 0, 0, 'hiyori', null)
        ON CONFLICT(id) DO NOTHING
      `).run();
    }, 'seed agent_state');
  } catch (err: any) {
    console.warn("[SERVER] Warning: Failed to seed default agent_state on startup:", err.message);
  }

  try {
    await seedDefaultCronTask(db);
  } catch (e: any) {
    console.warn("[SERVER] Failed to seed default memory consolidation task:", e.message);
  }

  await initializeCortexModules();

  NeuralInterface.setDatabase(db);
  MultiChannelQueue.getInstance().setDatabase(db);

  await startServer();

  initializeBot(db).catch(() => {});
  initializeDiscord(db).catch(() => {});
  initializeTwitter(db).catch(() => {});
  initializeMCP().catch(() => {});
}




async function startServer() {
  try { await SettingsManager.applyBootLogLevel(); } catch {}

  const app = express();

  const kernel = Kernel.getInstance();
  await kernel.boot();
  
  const settings = kernel.getSettings();
  const PORT = parseInt(process.env.PORT || settings.get('port') || "3000", 10);
  const registry = kernel.getRegistry();
  const cron = CronModule.getInstance();

  const savedTasks = db.prepare("SELECT * FROM cron_tasks").all() as any[];
  for (const task of savedTasks) {
    cron.registerTask({
      id: task.id,
      name: task.name,
      schedule: task.schedule,
      enabled: task.enabled === 1,
      repeating: task.repeating === 1,
      action: getCronAction(task.id, task.name, task.repeating === 1, db)
    });
  }

  app.use(express.json({ limit: "50mb", strict: false }));

  app.use((req, res, next) => {
    // [SILENCED] if (req.url.startsWith('/api/storage')) { console.log(`[STORAGE_REQ] ${req.method} ${req.url}`); }
    next();
  });

  // Logging middleware
  app.use((req, res, next) => {
    // [SILENCED FOR USER REGULATION] console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Telegram webhook receiver
  app.post("/api/telegram-webhook", (req, res) => {
    try {
      const updateId = req.body?.update_id;
      let isDuplicate = false;
      if (typeof updateId === 'number') {
        try {
          const exists = db.prepare("SELECT 1 FROM telegram_update_ids WHERE update_id = ?").get(updateId);
          if (exists) {
            isDuplicate = true;
          } else {
            db.prepare("INSERT INTO telegram_update_ids (update_id, processed_at, chat_id, message_id) VALUES (?, ?, ?, ?)")
              .run(updateId, Date.now(), req.body?.message?.chat?.id || req.body?.channel_post?.chat?.id, req.body?.message?.message_id || req.body?.channel_post?.message_id);
          }
        } catch (dbErr: any) {
          console.warn("[SERVER] Telegram dedup DB warn:", dbErr.message || dbErr);
        }
      }

      if (!isDuplicate) {
        const bot = getActiveTelegramBot();
        if (bot) {
          bot.handleUpdate(req.body).catch((err: any) => {
            console.error("[SERVER] Error inside bot.handleUpdate:", err.message || err);
          });
        }
      }
      res.sendStatus(200);
    } catch (e: any) {
      console.error("[SERVER] Error handling Telegram webhook update:", e.message || e);
      res.sendStatus(200);
    }
  });

  // Telegram status and diagnostic endpoint
  app.get("/api/telegram/status", async (req, res) => {
    try {
      const bot = getActiveTelegramBot();
      if (!bot) {
        return res.json({
          initialized: false,
          message: "Telegram bot is not initialized. Please configure the Telegram bot token and enable it in Settings.",
        });
      }
      const botInfo = await bot.telegram.getMe();
      const webhookInfo = await bot.telegram.getWebhookInfo();
      res.json({
        initialized: true,
        botInfo,
        webhookInfo,
        message: `Connected successfully as @${botInfo.username}. Webhook status active: ${webhookInfo.url ? 'Yes' : 'No'}`,
      });
    } catch (e: any) {
      console.error("[SERVER] Failed to fetch Telegram status:", e.message || e);
      res.json({
        initialized: false,
        error: e.message || String(e),
        message: "Failed to connect to Telegram Bot API. Your token might be invalid or there is a network block.",
      });
    }
  });

  // Telegram recipient resolution endpoint for cross-platform messaging integration
  app.get("/api/telegram/resolve", (req, res) => {
    try {
      const { recipient } = req.query;
      if (!recipient) {
        return res.status(400).json({ error: "Missing recipient parameter" });
      }
      
      const searchName = (recipient as string).trim();
      const cleanUsername = searchName.startsWith("@") ? searchName.substring(1) : searchName;

      // 1. Try telegram_users table directly
      const tgUser: any = db.prepare(`
        SELECT tg_id, username FROM telegram_users 
        WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)
      `).get(cleanUsername, searchName);

      if (tgUser && tgUser.tg_id) {
        return res.json({ tg_id: tgUser.tg_id, username: tgUser.username, source: "telegram_users_table" });
      }

      // 2. Try identities table with linked accounts schema
      const identities: any[] = db.prepare("SELECT * FROM identities").all();
      for (const identity of identities) {
        const perceived = (identity.perceivedName || "").toLowerCase();
        const real = (identity.realName || "").toLowerCase();
        const queryLower = searchName.toLowerCase();
        const cleanLower = cleanUsername.toLowerCase();

        const nameMatches = perceived === queryLower || real === queryLower || perceived === cleanLower || real === cleanLower;
        const linked = identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
        let foundTelegramLink = "";

        for (const link of linked) {
          const parts = link.split(":");
          const platform = parts[0]?.toLowerCase() || "";
          const handle = parts[1]?.toLowerCase() || "";
          
          if (platform.includes("telegram")) {
            if (nameMatches || handle === cleanLower || handle === queryLower) {
              foundTelegramLink = parts[1] || "";
              break;
            }
          }
        }

        if (foundTelegramLink) {
          const tgUserLink: any = db.prepare(`
            SELECT tg_id, username FROM telegram_users 
            WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)
          `).get(foundTelegramLink.toLowerCase(), foundTelegramLink);

          if (tgUserLink && tgUserLink.tg_id) {
            return res.json({ 
              tg_id: tgUserLink.tg_id, 
              username: tgUserLink.username, 
              perceivedName: identity.perceivedName, 
              source: "identities_linked_accounts" 
            });
          } else {
            if (/^\d+$/.test(foundTelegramLink)) {
              return res.json({ 
                tg_id: parseInt(foundTelegramLink), 
                username: foundTelegramLink, 
                perceivedName: identity.perceivedName, 
                source: "identities_linked_id" 
              });
            }
          }
        }
      }

      return res.status(404).json({ error: "Telegram recipient not found" });
    } catch (error: any) {
      console.error("[SERVER] GET /api/telegram/resolve Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Telegram forced re-initialization and webhook refresh endpoint
  app.post("/api/telegram/recreate", async (req, res) => {
    try {
      const dropPending = req.body.dropPending === true || req.query.dropPending === "true";
      console.log(`[SERVER] Forced re-initialization of Telegram, Discord and Twitter Bots requested (dropPending: ${dropPending})...`);
      
      await initializeBot(db, true, dropPending);
      await initializeDiscord(db, true);
      await initializeTwitter(db, true);
      
      const bot = getActiveTelegramBot();
      if (!bot) {
        return res.json({
          success: false,
          message: "Failed to build or start bot daemon. Check if Telegram Bridge is enabled in your Settings.",
        });
      }
      const botInfo = await bot.telegram.getMe();
      const webhookInfo = await bot.telegram.getWebhookInfo();
      res.json({
        success: true,
        botInfo,
        webhookInfo,
        message: `Bot successfully recreated and online as @${botInfo.username}. ${dropPending ? 'Pending updates flushed successfully.' : ''}`,
      });
    } catch (e: any) {
      console.error("[SERVER] Failed to recreate/initialize Telegram Bot:", e.message || e);
      res.json({
        success: false,
        error: e.message || String(e),
        message: "An error occurred during re-initialization: " + (e.message || String(e)),
      });
    }
  });

  // Debug endpoint for standalone binary distributions serving compiled build info
  app.get("/api/system/build-info", (req, res) => {
    try {
      const pathsToTry = [
        path.join(process.cwd(), "dist", "build-info.json"),
        path.join(process.cwd(), "build-info.json")
      ];
      
      let manifestPath = "";
      for (const p of pathsToTry) {
        if (existsSync(p)) {
          manifestPath = p;
          break;
        }
      }
      
      if (manifestPath && existsSync(manifestPath)) {
        const data = JSON.parse(readFileSync(manifestPath, "utf-8"));
        return res.json({ success: true, ...data });
      }
      
      return res.status(404).json({
        success: false,
        message: "Build manifest not found. Run production build compilation to generate it."
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Secure Markdown content reader for Yuihime's client-side cognition layer
  app.get("/api/system/markdown/:name", (req, res) => {
    try {
      const { name } = req.params;
      const whitelist = [
        'IDENTITY.md',
        'SOUL.md',
        'MEMORY.md',
        'USER.md',
        'TOOLS.md',
        'HEARTBEAT.md',
        'UPDATE_LOG.md',
        'MODULES.md',
        'system_prompt.md',
        'character.md',
        'lore.md'
      ];
      if (!whitelist.includes(name)) {
        return res.status(403).json({ error: "Unauthorized markdown access." });
      }
      
      let filePath = path.join(process.cwd(), name);
      const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(os.homedir(), ".yuihime", "agent");
      const agentFilePath = path.join(agentDir, name);
      const docsFilePath = path.join(process.cwd(), 'docs', name);
      
      if (existsSync(agentFilePath)) {
        filePath = agentFilePath;
      } else if (existsSync(docsFilePath)) {
        filePath = docsFilePath;
      }
      
      if (!existsSync(filePath) && ['character.md', 'system_prompt.md', 'lore.md'].includes(name)) {
        const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(os.homedir(), ".yuihime", "agent");
        const agentFilePath = path.join(agentDir, name);
        if (existsSync(agentFilePath)) {
          filePath = agentFilePath;
        }
      }
      
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf8');
        res.json({ name, content });
      } else {
        res.status(404).json({ error: "File not found." });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Secure Markdown content writer for Yuihime settings UI edit capabilities
  app.post("/api/system/markdown/:name", (req, res) => {
    try {
      const { name } = req.params;
      const { content } = req.body;
      const whitelist = [
        'IDENTITY.md',
        'SOUL.md',
        'MEMORY.md',
        'USER.md',
        'TOOLS.md',
        'HEARTBEAT.md',
        'UPDATE_LOG.md',
        'MODULES.md',
        'system_prompt.md',
        'character.md',
        'lore.md'
      ];
      if (!whitelist.includes(name)) {
        return res.status(403).json({ error: "Unauthorized markdown write access." });
      }

      let filePath = path.join(process.cwd(), name);
      const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(os.homedir(), ".yuihime", "agent");
      const agentFilePath = path.join(agentDir, name);
      const docsFilePath = path.join(process.cwd(), 'docs', name);
      
      let targetPath = filePath;
      if (existsSync(agentFilePath)) {
        targetPath = agentFilePath;
      } else if (existsSync(docsFilePath)) {
        targetPath = docsFilePath;
      } else if (['character.md', 'system_prompt.md', 'lore.md'].includes(name)) {
        targetPath = path.join(process.cwd(), 'src', 'share', 'prompts', name);
      }

      const pathsToWrite = [targetPath];
      if (name === 'character.md' || name === 'system_prompt.md' || name === 'lore.md') {
        const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(os.homedir(), ".yuihime", "agent");
        const sharePath = path.join(agentDir, name);
        if (existsSync(sharePath) && !pathsToWrite.includes(sharePath)) pathsToWrite.push(sharePath);
      } else if (['IDENTITY.md', 'SOUL.md', 'MEMORY.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md'].includes(name)) {
        const rootPath = path.join(process.cwd(), name);
        if (existsSync(rootPath) && !pathsToWrite.includes(rootPath)) pathsToWrite.push(rootPath);
      }

      for (const p of pathsToWrite) {
        const dir = path.dirname(p);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(p, content || "", "utf8");
      }

      res.json({ success: true, name, paths: pathsToWrite });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

registerAPIRoutes(app, db);

// Serve models folder from .yuihime/models securely in both dev and production
let systemRoot = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || "~/.yuihime";
if (systemRoot.startsWith("~")) {
  systemRoot = path.join(os.homedir(), systemRoot.substring(1));
}
const customSystemRoot = path.isAbsolute(systemRoot) ? systemRoot : path.join(process.cwd(), systemRoot);
const modelsDir = process.env.YUIHIME_MODELS_DIR || path.join(customSystemRoot, "models");
if (!existsSync(modelsDir)) {
  mkdirSync(modelsDir, { recursive: true });
}
app.use("/models", express.static(modelsDir));



  // Serve the Web UI unless explicitly disabled via --no-ui / YUIHIME_NO_UI
  const noUi = process.env.YUIHIME_NO_UI === "1" || process.env.YUIHIME_NO_UI === "true" || (argsOverride as any).noUi === true;
  if (!noUi) {
    await serveWebUI(app, PORT);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    const settings = Kernel.getInstance().getSettings();
    const configKey = settings.getApiKey();
    const masked = configKey ? `${configKey.substring(0, 6)}...${configKey.substring(configKey.length - 4)}` : "MISSING";

    try {
      process.stdout.write("\x1b]0;YuiHime\x07");
    } catch {}
    process.title = "YuiHime";

    const wsPort = PORT + 1;

    const bootRows: [string, string][] = [
      ["Port", String(PORT)],
      ["WS Port", String(wsPort)],
      ["Environment", process.env.NODE_ENV || "development"],
      ["Neural Key", masked],
      ["Bot Status", settings.get("telegram_bridge")?.botToken ? "ACTIVE" : "DISABLED"],
      ["SQLite Path", dbPath],
    ];

    console.warn(`\n[SYSTEM] === YUIHIME KERNEL ONLINE ===`);
    for (const [label, value] of bootRows) {
      console.warn(`[SYSTEM] ${label.padEnd(12)}: ${value}`);
    }
    console.warn(`[SYSTEM] =============================\n`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[SYSTEM] Port ${PORT} is already in use. Another YuiHime instance may be running. Exiting gracefully.`);
      gracefulShutdown('EADDRINUSE');
      return;
    } else {
      console.error(`[SYSTEM] Server error:`, err.message || err);
    }
    process.exit(1);
  });

  __globalServer = server;

  // --- WebSocket Gateway Initialization ---
  const wsPort = PORT + 1;
  const wss = new WebSocketServer({ port: wsPort, path: "/ws" });

  __globalWss = wss;

  wss.on("connection", (ws) => {
    activeWSConnections.add(ws);
    console.log(`[WS_GATEWAY] Connection established. Active connections: ${activeWSConnections.size}`);
    
    // Initial handshake
    ws.send(JSON.stringify({ type: "sync_ok", timestamp: Date.now() }));

    ws.on("message", (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

        if (payload.type === "puter_heartbeat") {
          // Relay Puter heartbeat to parent or broadcast
          const beatMsg = JSON.stringify({
            type: "puter_heartbeat_response",
            timestamp: Date.now(),
            clientId: payload.clientId
          });
          
          activeWSConnections.forEach(client => {
            if (client.readyState === 1) {
              client.send(beatMsg);
            }
          });
          return;
        }

        if (payload.type === "puter_request") {
          try {
            const { requestId, method, args } = payload.data || {};
            // Handle Puter API calls
            let response = { success: true, data: null };
            
            const responseMsg = JSON.stringify({
              type: "puter_response",
              requestId,
              response
            });
            
            ws.send(responseMsg);
          } catch (e: any) {
            console.error("[PUTER] Request handling failed:", e.message);
          }
          return;
        }

        if (payload.type === "stream_event") {
          // Broadcast to other WebSocket clients
          const eventData = payload.data;
          const broadcastMsg = JSON.stringify(eventData);
          activeWSConnections.forEach(client => {
            if (client !== ws && client.readyState === 1) { // OPEN
              client.send(broadcastMsg);
            }
          });

          // Also forward to SSE clients
          const sseChunk = `data: ${broadcastMsg}\n\n`;
          activeStreamClients.forEach(c => {
            try { c.res.write(sseChunk); } catch {}
          });
        }

        if (payload.type === "chat_message") {
          const { message, sender = "Penonton", context = "live_stream", channel = "Live Chat" } = payload.data || {};
          if (!message || !message.trim()) return;

          // 1. Broadcast the incoming user comment
          const userMemory = {
            id: "stream_usr_" + Math.random().toString(36).substr(2, 9),
            type: "interaction",
            content: `[${sender}]: ${message}`,
            timestamp: Date.now()
          };
          
          const wsMsg = JSON.stringify({ type: "memory_update", data: userMemory });
          activeWSConnections.forEach(client => {
            if (client.readyState === 1) { // OPEN
              client.send(wsMsg);
            }
          });

          const sseMsg = `data: ${wsMsg}\n\n`;
          activeStreamClients.forEach(c => {
            try { c.res.write(sseMsg); } catch {}
          });

          // 2. Queue & Process asynchronously via MultiChannelQueue
          MultiChannelQueue.getInstance().addMessage(
            message,
            sender,
            context,
            channel,
            (reply) => {
              if (!reply) return;

              // Reply generated! Send state updates to overlays
              const updatePayload = {
                type: "state_update",
                data: {
                  state: { status: "talking" },
                  activeSubtitle: reply,
                  typedSubtitle: reply,
                  isSubtitleTyping: false,
                  animations: ["TALK", "SMILE"]
                }
              };

              const wsReply = JSON.stringify(updatePayload);
              activeWSConnections.forEach(client => {
                if (client.readyState === 1) { // OPEN
                  client.send(wsReply);
                }
              });

              const sseReply = `data: ${wsReply}\n\n`;
              activeStreamClients.forEach(c => {
                try { c.res.write(sseReply); } catch {}
              });
            }
          );
        }
      } catch (err: any) {
        console.error("[WS_GATEWAY] Error parsing incoming message:", err.message);
      }
    });

    ws.on("close", () => {
      activeWSConnections.delete(ws);
      console.log(`[WS_GATEWAY] Connection closed. Active connections: ${activeWSConnections.size}`);
    });

    ws.on("error", (err) => {
      console.warn("[WS_GATEWAY] Error on socket connection:", err.message);
      activeWSConnections.delete(ws);
    });
  });

// Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Server Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  });

  // Start Bot after server is listening and initialize modules
  initializeBot(db).catch(() => {});
  initializeDiscord(db).catch(() => {});
  initializeTwitter(db).catch(() => {});
  initializeMCP().catch(() => {});
}

// Serve the Web UI (Vite dev middleware or static built assets).
// Vite is lazily imported so the headless daemon bundle stays lean.
async function serveWebUI(app: any, backendPort: number) {
  const wsPort = backendPort + 1;
  process.env.VITE_BACKEND_PORT = String(backendPort);
  process.env.VITE_WS_PORT = String(wsPort);

  // Serve public assets (e.g. /lib/live2d) directly from express BEFORE the
  // UI handler, so they are not caught by Vite's proxy rules (/lib -> :3000)
  // which would otherwise loop back to this same server and return 500.
  const publicDir = path.join(process.cwd(), "public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // Resolve web root: cwd first (dev source or bundle cwd), then __dirname
  // (bundle layout where server.cjs sits next to a built web/ folder).
  const webCandidates = [path.join(process.cwd(), "web"), path.join(__dirname, "web")];
  let webRoot = "";
  for (const w of webCandidates) {
    if (existsSync(path.join(w, "index.html"))) {
      webRoot = w;
      break;
    }
  }

  // Inject runtime WS port so the UI knows which port to connect to.
  const injectWsPort = (html: string) =>
    html.replace("</head>", `<script>window.__YUIHIME_WS_PORT__=${wsPort};</script></head>`);

  // Vite dev (source) mode: web/src exists → live-reload dev middleware.
  if (webRoot && existsSync(path.join(webRoot, "src"))) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: webRoot,
      server: { middlewareMode: true },
      appType: "spa",
      mode: "development",
    });
    app.use(vite.middlewares);

    app.get("*", async (req: any, res: any, next: any) => {
      if (req.url.startsWith("/api/")) return next();
      try {
        const url = req.originalUrl;
        let template = await fs.readFile(path.join(webRoot, "index.html"), "utf-8");
        template = injectWsPort(template);
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
    return;
  }

  // Static (bundled) UI mode: serve built assets + SPA fallback. Supports
  // portable dist/ bundles moved to any system root without source files.
  const staticCandidates = [
    webRoot,
    path.join(process.cwd(), "dist", "web"),
    path.join(process.cwd(), "web", "dist"),
    path.join(__dirname, "web"),
  ];
  for (const s of staticCandidates) {
    if (!s || !existsSync(path.join(s, "index.html"))) continue;
    app.use(express.static(s));
    app.get("*", (req: any, res: any, next: any) => {
      if (req.url.startsWith("/api/")) return next();
      res.set({ "Content-Type": "text/html" }).send(injectWsPort(readFileSync(path.join(s, "index.html"), "utf8")));
    });
    console.log(`[SERVER] Serving built UI from ${s}`);
    return;
  }

  console.warn("[SERVER] No web UI found (source or built) — running headless.");
}

// Resilience: Catch fatal process errors
process.on('uncaughtException', (err: any) => {
  if (err.code === 'EPIPE' || err.errno === -32) return;
});

process.on('unhandledRejection', (reason: any, promise) => {
  if (reason?.code === 'EPIPE' || reason?.errno === -32) return;
});

// Graceful shutdown handlers
async function gracefulShutdown(sig: string) {
  const log = (msg: string) => process.stderr.write(msg + '\n');
  log(`\n[SYSTEM] Received ${sig}, initiating graceful shutdown...`);
  try {
    if (yuihimeActiveTelegramBot) {
      log('[SYSTEM] Stopping Telegram bot...');
      yuihimeActiveTelegramBot.stop(sig);
    }
  } catch (e: any) {
    log(`[SYSTEM] Telegram shutdown warning: ${e.message || e}`);
  }
  try {
    if (yuihimeActiveDiscordClient) {
      log('[SYSTEM] Destroying Discord client...');
      yuihimeActiveDiscordClient.destroy();
    }
  } catch (e: any) {
    log(`[SYSTEM] Discord shutdown warning: ${e.message || e}`);
  }
  try {
    if (yuihimeActiveTwitterInterval) {
      log('[SYSTEM] Clearing Twitter polling interval...');
      clearInterval(yuihimeActiveTwitterInterval);
    }
  } catch (e: any) {
    log(`[SYSTEM] Twitter shutdown warning: ${e.message || e}`);
  }
  if (__globalWss) {
    log('[SYSTEM] Closing WebSocket server...');
    __globalWss.close();
  }
  if (__globalServer) {
    log('[SYSTEM] Closing HTTP server...');
    __globalServer.close(() => {
      log('[SYSTEM] HTTP server closed.');
      try { closeDatabase(); } catch {}
      process.exit(0);
    });
  }
  setTimeout(() => {
    log('[SYSTEM] Graceful shutdown timed out, forcefully exiting.');
    process.exit(0);
  }, 3000);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// --- Standalone Settings TUI Mode ---
// Runs lightweight initialization (no HTTP server) so it doesn't conflict with
// an already-running daemon instance.
const isSettingsMode = process.argv.includes("--settings");
if (isSettingsMode) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("[SETTINGS] --settings requires an interactive terminal (TTY). Run without piping stdin/stdout.");
    process.exit(1);
  }
  (async () => {
    try {
      const db = initializeDatabase();
      await initializeCortexModules();
      NeuralInterface.setDatabase(db);
      MultiChannelQueue.getInstance().setDatabase(db);
      (globalThis as any).yuihime_db = db;
      setTimeout(() => {
        startSettingsTUI().catch(err => {
          console.error("Gagal meluncurkan Settings TUI:", err);
        });
      }, 500);
    } catch (err: any) {
      console.error("[BOOT] Settings TUI init failed:", err);
      process.exit(1);
    }
  })();
} else {
  // --- Standard Server Mode ---
  bootstrap().catch(err => {
    console.error("[BOOT] Bootstrap failed:", err);
    process.exit(1);
  });

  // --- Interactive Cognitive Terminal & Sandbox Hook ---
  const isTerminalMode = process.argv.includes("--terminal") || process.argv.includes("--sandbox");
  if (isTerminalMode) {
    setTimeout(() => {
      startRepl().catch(err => {
        console.error("Gagal meluncurkan Terminal Sandbox:", err);
      });
    }, 1500);
  }
}

