import "dotenv/config";

// --- Global EPIPE Protection for cron/background tasks ---
const originalConsoleFns = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug
};
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
import fs from "fs/promises";
import { renameSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, unlinkSync, readSync, cpSync, realpathSync } from "fs";
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
import { createServer as createViteServer } from "vite";
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
  }
}

if (argsOverride.dbPath) process.env.YUIHIME_DB_PATH = argsOverride.dbPath;
if (argsOverride.configPath) process.env.YUIHIME_CONFIG = argsOverride.configPath;
if (argsOverride.addonsPath) process.env.YUIHIME_ADDONS_PATH = argsOverride.addonsPath;
if (argsOverride.agentPath) process.env.YUIHIME_AGENT_PATH = argsOverride.agentPath;
if (argsOverride.port) process.env.PORT = argsOverride.port;

import { runOnboarding } from "./src/core/server/onboarding.js";

// run first-time setup / system directories mapping outside binary
runOnboarding();

const execPromise = promisify(exec);

import { initializeCortexModules } from "./src/core/RegistryInitializer.js";
import { initializeBot, getActiveTelegramBot } from "./src/core/server/telegram.js";
import { initializeDiscord } from "./src/core/server/discord.js";
import { initializeTwitter } from "./src/core/server/twitter.js";
import { initializeMCP } from "./src/core/server/mcp.js";
import { registerAPIRoutes, activeWSConnections, activeStreamClients, broadcastToWS, getCronAction } from "./src/core/server/apiRouter.js";
import { Kernel } from "./src/core/kernel/core.js";
import { AIService } from "./src/core/kernel/ai.js";
import { SettingsManager } from "./src/core/kernel/settings.js";
import { CronModule } from "./src/core/kernel/cron.js";
import { NeuralInterface } from "./src/core/kernel/NeuralInterface.js";
import { MultiChannelQueue } from "./src/core/kernel/MultiChannelQueue.js";

// --- Settings System ---
const settingsPath = process.env.YUIHIME_CONFIG || path.join(process.cwd(), ".yuihime", "data", "config.toml");
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
const addonsDir = process.env.YUIHIME_ADDONS_PATH || path.join(process.cwd(), ".yuihime", "addons");
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

import { initializeDatabase, setupSchema, dbPath } from "./src/core/database.js";

// Initialize SQLite Database
const db = initializeDatabase();
setupSchema(db);

// Register on globalThis for plug-and-play tools zero-import runtime access
(globalThis as any).yuihime_db = db;
(globalThis as any).yuihime_initializeDatabase = initializeDatabase;
(globalThis as any).yuihime_CronModule = CronModule;
try {
  import("./src/core/server/apiRouter.js").then((mod) => {
    (globalThis as any).yuihime_getCronAction = mod.getCronAction;
  }).catch((err) => {
    console.warn("[SERVER] Failed to dynamically assign getCronAction to globalThis:", err.message);
  });
} catch (_) {}

// Ensure the singleton agent_state row with ID = 1 exists
try {
  db.prepare(`
    INSERT INTO agent_state (id, mood, emotion, relation, systemHealth, lastDreamCycle, lastRefreshed, activePersonaId, currentPlan)
    VALUES (1, '{}', '{}', '{}', '{}', 0, 0, 'hiyori', null)
    ON CONFLICT(id) DO NOTHING
  `).run();
} catch (err: any) {
  console.warn("[SERVER] Warning: Failed to seed default agent_state on startup:", err.message);
}

NeuralInterface.setDatabase(db);
MultiChannelQueue.getInstance().setDatabase(db);

// --- Live Stream Connection WebSocket & SSE Gateways (Declared globally for Cron dispatch) ---

  // Seed default background cron tasks to SQLite database if not present, so they are user-configurable via the UI
  try {
    db.prepare(`
      INSERT INTO cron_tasks (id, name, schedule, enabled, repeating, context_id, chat_type, sender_name)
      VALUES ('memory-consolidation', 'Memory Consolidation', '0 * * * *', 1, 1, 'live_stream', 'Live Chat', 'System')
      ON CONFLICT(id) DO NOTHING
    `).run();
  } catch (e: any) {
    console.warn("[SERVER] Failed to seed default memory consolidation task:", e.message);
  }

  const heartbeatPath = path.join(process.cwd(), 'docs', 'HEARTBEAT.md');
  if (existsSync(heartbeatPath)) {
    const heartbeatContent = readFileSync(heartbeatPath, 'utf-8');
    if (heartbeatContent.includes('Hourly') || heartbeatContent.includes('hourly')) {
      try {
        db.prepare(`
          INSERT INTO cron_tasks (id, name, schedule, enabled, repeating, context_id, chat_type, sender_name)
          VALUES ('puter-hourly-check', 'Puter Hourly Check', '0 * * * *', 0, 1, 'live_stream', 'Live Chat', 'System')
          ON CONFLICT(id) DO NOTHING
        `).run();
      } catch (e: any) {
        console.warn("[SERVER] Failed to seed default puter hourly check task:", e.message);
      }
    }
  }



async function startServer() {
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
      const bot = getActiveTelegramBot();
      if (bot) {
        // Process update asynchronously to prevent 10s Telegram timeout on slow cognitive processes
        bot.handleUpdate(req.body).catch((err: any) => {
          console.error("[SERVER] Error inside bot.handleUpdate:", err.message || err);
        });
      }
      res.sendStatus(200);
    } catch (e: any) {
      console.error("[SERVER] Error handling Telegram webhook update:", e.message || e);
      // Always return 200 to prevent Telegram from flooding/queueing failed webhook requests
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

  // Dynamic system version endpoint reading from UPDATE_LOG.md
  app.get("/api/system/version", (req, res) => {
    try {
      const updateLogPath = path.join(process.cwd(), "UPDATE_LOG.md");
      if (existsSync(updateLogPath)) {
        const content = readFileSync(updateLogPath, "utf-8");
        const match = content.match(/##\s*\[([^\]]+)\]/);
        if (match) {
          const matchStr = match[1]; // e.g. "2026-05-26 - Turn 120 - v5.52"
          const parts = matchStr.split(" - ");
          const date = parts[0] || "";
          const turn = parts[1] || "";
          const versionId = parts[2] || "v5.00";
          return res.json({
            success: true,
            version: versionId,
            date,
            turn,
            raw: matchStr
          });
        }
      }
      res.json({ success: true, version: "v5.52", date: "2026-05-26", turn: "Turn 120", raw: "2026-05-26 - Turn 120 - v5.52" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Debug endpoint for standalone binary distributions serving compiled build info
  app.get("/api/system/build-info", (req, res) => {
    try {
      const pathsToTry = [
        path.join(process.cwd(), "dist", "build-info.json"),
        path.join(process.cwd(), "src", "share", "prompts", "build-info.json"),
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
      const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(process.cwd(), '.yuihime', 'agent');
      const agentFilePath = path.join(agentDir, name);
      
      if (existsSync(agentFilePath)) {
        filePath = agentFilePath;
      } else if (!existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'docs', name);
      }
      
      if (!existsSync(filePath) && ['character.md', 'system_prompt.md', 'lore.md'].includes(name)) {
        filePath = path.join(process.cwd(), 'src', 'share', 'prompts', name);
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
      const agentDir = process.env.YUIHIME_AGENT_PATH || path.join(process.cwd(), '.yuihime', 'agent');
      const agentFilePath = path.join(agentDir, name);

      let targetPath = filePath;
      if (existsSync(agentFilePath)) {
        targetPath = agentFilePath;
      } else if (existsSync(path.join(process.cwd(), 'docs', name))) {
        targetPath = path.join(process.cwd(), 'docs', name);
      } else if (['character.md', 'system_prompt.md', 'lore.md'].includes(name)) {
        targetPath = path.join(process.cwd(), 'src', 'share', 'prompts', name);
      }

      const pathsToWrite = [targetPath];
      if (name === 'character.md' || name === 'system_prompt.md' || name === 'lore.md') {
        const sharePath = path.join(process.cwd(), 'src', 'share', 'prompts', name);
        if (existsSync(sharePath) && !pathsToWrite.includes(sharePath)) pathsToWrite.push(sharePath);
      } else if (['IDENTITY.md', 'SOUL.md', 'MEMORY.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md'].includes(name)) {
        const docsPath = path.join(process.cwd(), 'docs', name);
        const rootPath = path.join(process.cwd(), name);
        if (existsSync(docsPath) && !pathsToWrite.includes(docsPath)) pathsToWrite.push(docsPath);
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
const systemRoot = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || ".yuihime";
const customSystemRoot = path.isAbsolute(systemRoot) ? systemRoot : path.join(process.cwd(), systemRoot);
const modelsDir = process.env.YUIHIME_MODELS_DIR || path.join(customSystemRoot, "models");
if (!existsSync(modelsDir)) {
  mkdirSync(modelsDir, { recursive: true });
}
app.use("/models", express.static(modelsDir));



  // Vite middleware
  const isDev = __filename.endsWith("server.ts") || process.env.NODE_ENV === "development";
  if (isDev) {
    if (__filename.endsWith("server.ts") && process.env.NODE_ENV === "production") {
      process.env.NODE_ENV = "development";
    }
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      mode: "development",
    });
    app.use(vite.middlewares);

    // Serve index.html transformed dynamically by Vite
    app.get("*", async (req, res, next) => {
      if (req.url.startsWith("/api/")) return next();
      try {
        const url = req.originalUrl;
        let template = await fs.readFile(path.join(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    let distPath = path.join(process.cwd(), "dist");
    if (!existsSync(distPath)) {
      // Fallback to internal packaged assets inside snapshot
      const packagedPath = __dirname;
      if (existsSync(path.join(packagedPath, "index.html"))) {
        distPath = packagedPath;
      }
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    const settings = Kernel.getInstance().getSettings();
    const configKey = settings.getApiKey();
    const masked = configKey ? `${configKey.substring(0, 6)}...${configKey.substring(configKey.length - 4)}` : "MISSING";
    
    console.log(`\n--- YUIHIME KERNEL INITIALIZED ---`);
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Neural Key (Config): ${masked}`);
    console.log(`Bot Status: ${settings.get('telegram_bridge')?.botToken ? 'ACTIVE' : 'DISABLED'}`);
    console.log(`SQLite Path: ${dbPath}`);
    console.log(`----------------------------------\n`);
  });

  // --- WebSocket Gateway Initialization ---
  const wss = new WebSocketServer({ server, path: "/ws" });

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
  setTimeout(() => {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠗', '⠡'];
    let frameIdx = 0;
    const loadingInterval = setInterval(() => {
      process.stderr.write('\r' + frames[frameIdx = (frameIdx + 1) % frames.length] + ' Loading modules...');
    }, 100);
    
    initializeCortexModules()
      .then(() => {
        clearInterval(loadingInterval);
        process.stderr.write('\r✓ Kernel initialized. Ready.\n');
      })
      .catch((err) => {
        clearInterval(loadingInterval);
        process.stderr.write('\r✗ Initialization failed: ' + err + '\n');
      });
    initializeBot(db).catch(() => {});
    initializeDiscord(db).catch(() => {});
    initializeTwitter(db).catch(() => {});
    initializeMCP().catch(() => {});
  }, 1000);
}

// Resilience: Catch fatal process errors
process.on('uncaughtException', (err: any) => {
  if (err.code === 'EPIPE' || err.errno === -32) return;
});

process.on('unhandledRejection', (reason: any, promise) => {
  if (reason?.code === 'EPIPE' || reason?.errno === -32) return;
});

startServer();

// --- Interactive Cognitive Terminal & Sandbox Hook ---
const isTerminalMode = process.argv.includes("--terminal") || process.argv.includes("--sandbox");
if (isTerminalMode) {
  setTimeout(() => {
    import(/* @vite-ignore */ "./src/bin/terminal.js").catch(err => {
      console.error("Gagal meluncurkan Terminal Sandbox:", err);
    });
  }, 1500);
}

