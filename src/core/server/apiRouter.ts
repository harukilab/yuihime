import express from "express";
import { WebSocket } from "ws";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, unlinkSync, realpathSync, renameSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as toml from "smol-toml";

import { AIService } from "../kernel/ai.js";
import { SettingsManager } from "@/core/kernel/settings";
import { CronModule, resolveCronJobPrompt } from "../kernel/cron.js";
import { NeuralInterface } from "../kernel/NeuralInterface.js";
import { MultiChannelQueue } from "../kernel/MultiChannelQueue.js";
import { eventBus } from "@shared/core/kernel/event-bus";
import { SystemRegistry } from '@shared/core/registry';
import { initializeBot, getActiveTelegramBot } from "./telegram.js";
import { Cortex } from "../cortex.js";
import { Soul } from "../soul.js";
import { deduplicateAndMergeIdentities, getDb } from "../database.js";
import { APIService } from "@shared/services/api";
import { initializeCortexModules } from "../RegistryInitializer.js";

// Register server-side persistent tool audit log handlers on globalThis
(globalThis as any).getToolAuditLogs = () => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_tool_audit_logs') as any;
    if (row && row.value) {
      let logs = JSON.parse(row.value);
      // Prune logs older than 3 days automatically
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const filtered = logs.filter((log: any) => log.timestamp >= threeDaysAgo);
      if (filtered.length !== logs.length) {
        db.prepare(`
          INSERT INTO custom_storage (key, value, updatedAt)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
        `).run('yuihime_tool_audit_logs', JSON.stringify(filtered), Date.now());
        logs = filtered;
      }
      return logs;
    }
  } catch (err) {
    console.error('[SERVER] Error getting tool audit logs from DB:', err);
  }
  return [];
};

(globalThis as any).clearToolAuditLogs = () => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM custom_storage WHERE key = ?').run('yuihime_tool_audit_logs');
  } catch (err) {
    console.error('[SERVER] Error clearing tool audit logs from DB:', err);
  }
};

(globalThis as any).addToolAuditLog = (log: any) => {
  try {
    const db = getDb();
    let logs: any[] = [];
    try {
      const row = db.prepare('SELECT value FROM custom_storage WHERE key = ?').get('yuihime_tool_audit_logs') as any;
      if (row && row.value) {
        logs = JSON.parse(row.value);
      }
    } catch (_) {}

    logs.unshift(log);

    // Prune logs older than 3 days automatically
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    logs = logs.filter((item: any) => item.timestamp >= threeDaysAgo);

    if (logs.length > 200) {
      logs = logs.slice(0, 200);
    }

    db.prepare(`
      INSERT INTO custom_storage (key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run('yuihime_tool_audit_logs', JSON.stringify(logs), Date.now());
  } catch (err) {
    console.error('[SERVER] Error adding tool audit log to DB:', err);
  }
};
import { datasetSynthesizer } from "./datasetSynthesizer.js";
import { registerStorageRoutes } from "./routes/storageRouter.js";
import { registerTelegramRoutes } from "./routes/telegramRouter.js";
import { registerSynthesizerRoutes } from "./routes/synthesizerRouter.js";
import { registerToolsRoutes } from "./routes/toolsRouter.js";
import { registerIdentitiesRoutes } from "./routes/identitiesRouter.js";
import { registerAiRoutes } from "./routes/aiRouter.js";
import { registerCortexRoutes } from "./routes/cortexRouter.js";
import { registerDatasetRoutes } from "./routes/datasetRouter.js";
import { registerSystemRoutes } from "./routes/systemRouter.js";

const execPromise = promisify(exec);

export const activeWSConnections: Set<WebSocket> = new Set();
export const activeStreamClients: any[] = [];

export const broadcastToWS = (payload: any) => {
  const wsChunk = JSON.stringify(payload);
  activeWSConnections.forEach(client => {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(wsChunk);
      }
    } catch (err) {
      console.warn(`[WS_GATEWAY] Gagal mengirim ke client WS:`, err);
    }
  });

  const sseChunk = `data: ${wsChunk}\n\n`;
  activeStreamClients.forEach(c => {
    try {
      if (c && c.res) {
        c.res.write(sseChunk);
      }
    } catch (err) {
      console.warn(`[STREAM_GATEWAY] Gagal mengirim paket ke overlay ${c.id}:`, err);
    }
  });
};

/**
 * Helper to broadcast avatar motion and facial expression triggers over WebSocket.
 */
export const broadcastAvatarAnimation = (motionGroup: string, motionIndex = 0, expression = '', emote = '') => {
  broadcastToWS({
    type: 'avatar_animation',
    data: {
      motionGroup,
      motionIndex,
      expression,
      emote,
      timestamp: Date.now()
    }
  });
};

/**
 * Helper to broadcast TTS audio stream chunks over WebSocket.
 */
export const broadcastTTSAudioStream = (base64Audio: string, text = '', isFinal = true, mimeType = 'audio/mp3') => {
  broadcastToWS({
    type: 'tts_audio_stream',
    data: {
      base64Audio,
      text,
      isFinal,
      mimeType,
      speaker: 'Yuihime',
      timestamp: Date.now()
    }
  });
};

// --- Server-Side Cron Action Builder ---
export const getCronAction = (id: string, name: string, repeating: boolean, db: any) => async () => {
  let taskName = name;
  console.log(`[CRON] Executing Task: ${name} (${id})`);
  
  // CUSTOM OVERRIDES FOR BUILT-IN SYSTEM TASKS
  if (id === 'memory-consolidation') {
    try {
      const consolidator = SystemRegistry.getModule('memory-consolidation');
      if (consolidator) {
         await consolidator.run('CONSOLIDATE_MEMORIES', {}, { db });
      } else {
         console.warn("[CRON] Memory Consolidator module not found in registry.");
      }
    } catch (e: any) {
      console.error("[CRON] Memory consolidation trigger failed:", e.message || e);
    }
    
    if (repeating) {
      db.prepare("UPDATE cron_tasks SET lastRun = ? WHERE id = ?").run(Date.now(), id);
    } else {
      db.prepare("DELETE FROM cron_tasks WHERE id = ?").run(id);
      CronModule.getInstance().stopTask(id);
    }
    return;
  }
  
  let contextId = 'live_stream';
  let chatType = 'Live Chat';
  let senderName = 'System';
  let storedPrompt = '';
  let storedAction: string | null = null;
  try {
    const task: any = db.prepare("SELECT context_id, chat_type, sender_name, prompt, action, name FROM cron_tasks WHERE id = ?").get(id);
    if (task) {
      contextId = task.context_id || contextId;
      chatType = task.chat_type || chatType;
      senderName = task.sender_name || senderName;
      storedPrompt = task.prompt || '';
      storedAction = typeof task.action === 'string' ? task.action : null;
      if (task.name) taskName = task.name;
    }
  } catch (e: any) {
    console.error("[CRON_ERROR] Failed to fetch task info:", e);
  }

  // Add memory of the trigger
  const memoryId = Math.random().toString(36).substr(2, 9);
  db.prepare(`
    INSERT INTO memories (id, type, content, importance, speaker, context, timestamp)
    VALUES (?, 'system', ?, 0.8, 'System', ?, ?)
  `).run(memoryId, `[SYSTEM_SIGNAL]: ${taskName} triggered.`, contextId, Date.now());

  if (repeating) {
    db.prepare("UPDATE cron_tasks SET lastRun = ? WHERE id = ?").run(Date.now(), id);
  } else {
    db.prepare("DELETE FROM cron_tasks WHERE id = ?").run(id);
    CronModule.getInstance().stopTask(id);
  }

  // Process thinking and dispatch response on the server side
  try {
    console.log(`[CRON_THINK] Running neural processor for cron task: ${taskName} on channel: ${chatType}:${contextId}`);

    // Classic cron model: schedule + command. Command = prompt (job body).
    const prompt = resolveCronJobPrompt({
      id,
      name: taskName,
      prompt: storedPrompt,
      action: storedAction,
    });
    
    const reply = await NeuralInterface.processNeuralInput(
       prompt,
       senderName,
       contextId,
       chatType
    );

    if (reply && reply.trim()) {
      console.log(`[CRON_DISPATCH] Generated reply: ${reply}`);

      // Broadcast to WebView & OBS Overlays (animations, subtitle, state)
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

      try {
        broadcastToWS(replyPayload);
      } catch (wsErr) {}

      // Dispatch specifically based on channel (e.g., Telegram)
      if (contextId.startsWith("tg_")) {
        const chatId = contextId.replace("tg_", "");
        try {
          const bot = getActiveTelegramBot();
          if (bot) {
            await bot.telegram.sendMessage(chatId, reply);
            console.log(`[CRON_DISPATCH] Sent response to Telegram chat ${chatId}`);
          } else {
            console.warn("[CRON_DISPATCH] Telegram bot is not active/available.");
          }
        } catch (tgErr: any) {
          console.error("[CRON_DISPATCH] Failed to send message to Telegram:", tgErr.message);
        }
      }
    }
  } catch (neuralErr: any) {
    console.error("[CRON_THINK] Neural processing failed for cron task:", neuralErr);
  }
};

// --- Configuration & Sandbox Settings ---
const getSystemRoot = () => {
  let apiRootEnvStr = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || "~/.yuihime";
  
  // Resolve standard env vars and shortcuts if shell passed them raw or they were manually configured
  if (apiRootEnvStr.startsWith('~')) {
    apiRootEnvStr = path.join(os.homedir(), apiRootEnvStr.substring(1));
  } else if (apiRootEnvStr.includes('$HOME')) {
    apiRootEnvStr = apiRootEnvStr.replace(/\$HOME/g, os.homedir());
  } else if (apiRootEnvStr.includes('$home')) {
    apiRootEnvStr = apiRootEnvStr.replace(/\$home/g, os.homedir());
  } else if (apiRootEnvStr.includes('%USERPROFILE%')) {
    apiRootEnvStr = apiRootEnvStr.replace(/%USERPROFILE%/g, os.homedir());
  }
  
  // Remove possible literal double or single quotes surrounding the path from shell aliases
  apiRootEnvStr = apiRootEnvStr.replace(/^['"]|['"]$/g, '');

  return path.isAbsolute(apiRootEnvStr) ? apiRootEnvStr : path.join(process.cwd(), apiRootEnvStr);
};
export const apiCustomSystemRoot = getSystemRoot();

export let systemConfig: any = {
  sandbox: {
    sandboxRoot: 'sandbox',
    commandBlacklist: ["rm -rf /", "mkfs", "dd", "reboot", "shutdown", "chmod 777 /"],
    execTimeoutMs: 10000
  },
  agent: {
    dreamThreshold: 5,
    learningThreshold: 10,
    pulseIntervalMs: 30000,
    minEnergyForProactiveLogic: 20
  }
};

try {
  const configPath = path.join(process.cwd(), 'system.config.json');
  if (existsSync(configPath)) {
    systemConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn("Failed to load system.config.json, using defaults:", e);
}

export const sandboxCfg: any = systemConfig.sandbox || systemConfig;

export const getDynamicSandboxRoot = () => {
  let rawPath = process.env.YUIHIME_USER_DATA_PATH;
  if (!rawPath) {
    try {
      const settings = SettingsManager.getInstance().getAll();
      rawPath = settings.sandbox_paths?.user_data_path;
    } catch (e) {
      console.warn("Failed to retrieve sandbox_paths.user_data_path from SettingsManager:", e);
    }
  }

  if (rawPath) {
    // Resolve shortcuts and clean quotes
    if (rawPath.startsWith('~')) {
      rawPath = path.join(os.homedir(), rawPath.substring(1));
    } else if (rawPath.includes('$HOME')) {
      rawPath = rawPath.replace(/\$HOME/g, os.homedir());
    } else if (rawPath.includes('$home')) {
      rawPath = rawPath.replace(/\$home/g, os.homedir());
    } else if (rawPath.includes('%USERPROFILE%')) {
      rawPath = rawPath.replace(/%USERPROFILE%/g, os.homedir());
    }
    rawPath = rawPath.replace(/^['"]|['"]$/g, '');

    if (path.isAbsolute(rawPath)) {
      return path.resolve(rawPath);
    }
    // Any relative paths (like 'user_data', './user_data', '.yuihime/user_data', etc.) should resolve under apiCustomSystemRoot
    let cleanRelative = rawPath;
    if (cleanRelative.startsWith('./')) {
      cleanRelative = cleanRelative.substring(2);
    }
    return path.resolve(apiCustomSystemRoot, cleanRelative);
  }

  return path.resolve(path.join(apiCustomSystemRoot, "user_data"));
};

export const SANDBOX_ROOT = getDynamicSandboxRoot();
if (!existsSync(SANDBOX_ROOT)) {
  try {
    mkdirSync(SANDBOX_ROOT, { recursive: true });
  } catch (_) {}
}

export const getYoloMode = (): 'full' | 'half' | 'off' => {
  const settings = SettingsManager.getInstance().getAll();
  const envVal = process.env.YUIHIME_YOLO_MODE || process.env.YUIHIME_SANDBOX_YOLO || process.env.YUIHIME_SHELL_YOLO;
  if (envVal === "full" || envVal === "true") return 'full';
  if (envVal === "half") return 'half';
  if (envVal === "off" || envVal === "false") return 'off';

  const val = settings.sandbox_paths?.yolo_mode;
  if (val === 'full' || val === true) return 'full';
  if (val === 'half') return 'half';
  return 'off';
};

export const getCommandBlacklist = (): string[] => {
  const settings = SettingsManager.getInstance().getAll();
  const customList = settings.sandbox_paths?.command_blacklist;
  if (customList !== undefined) {
    if (Array.isArray(customList)) return customList;
    if (typeof customList === 'string') {
      return customList.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
  return sandboxCfg.commandBlacklist || ["rm -rf /", "mkfs", "dd", "reboot", "shutdown", "chmod 777 /"];
};

export const getCommandWhitelist = (): string[] => {
  const settings = SettingsManager.getInstance().getAll();
  const customList = settings.sandbox_paths?.command_whitelist;
  if (customList !== undefined) {
    if (Array.isArray(customList)) return customList;
    if (typeof customList === 'string') {
      return customList.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

declare global {
  var pendingConfirmations: Array<{
    id: string;
    action: string;
    targetPath: string;
    status: 'pending' | 'approved' | 'always' | 'denied';
    createdAt: number;
  }>;
}

if (!globalThis.pendingConfirmations) {
  globalThis.pendingConfirmations = [];
}

export const requestFileOperationConfirmation = async (action: string, targetPath: string): Promise<boolean> => {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  const item: {
    id: string;
    action: string;
    targetPath: string;
    status: 'pending' | 'approved' | 'always' | 'denied';
    createdAt: number;
  } = {
    id,
    action,
    targetPath,
    status: 'pending',
    createdAt: Date.now()
  };
  globalThis.pendingConfirmations.push(item);

  // Notify active Telegram bot if available
  const activeTelegramBot = (globalThis as any).activeTelegramBot;
  if (activeTelegramBot) {
    const settings = SettingsManager.getInstance().getAll();
    const masterChatId = settings.telegram_bridge?.masterChatId || settings.telegram_bridge?.chatId;
    if (masterChatId) {
      try {
        await activeTelegramBot.telegram.sendMessage(masterChatId, 
          `⚠️ *YUIHIME FILE ACCESS REQUEST* ⚠️\n\n` +
          `• *Action*: \`${action.toUpperCase()}\`\n` +
          `• *File*: \`${targetPath}\`\n` +
          `• *ID*: \`${id}\`\n\n` +
          `Please reply with:\n` +
          `- \`/approve ${id}\` (Acc once)\n` +
          `- \`/always ${id}\` (Always Acc this session)\n` +
          `- \`/deny ${id}\` (Tolak)`,
          { parse_mode: 'Markdown' }
        );
      } catch (err: any) {
        console.error("[BOT_CONFIRM_NOTIFY_ERR] Failed to notify Telegram:", err.message);
      }
    }
  }

  // Print to TUI console / active web terminals
  console.log(`\n==================================================`);
  console.log(`⚠️  PENDING CONFIRMATION REQUEST [ID: ${id}]`);
  console.log(`👉 Action: ${action.toUpperCase()}`);
  console.log(`👉 File Path: ${targetPath}`);
  console.log(`👉 Approve via Web, Telegram bot, or CLI commands:`);
  console.log(`   - approve ${id}`);
  console.log(`   - always ${id}`);
  console.log(`   - deny ${id}`);
  console.log(`==================================================\n`);

  // Wait loop (configured timeout max)
  const settings = SettingsManager.getInstance().getAll();
  const configTimeout = settings.sandbox_paths?.confirmation_timeout ?? 45;
  const timeoutMs = configTimeout * 1000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (item.status === 'approved') {
      return true;
    }
    if (item.status === 'always') {
      const settingsManager = SettingsManager.getInstance();
      const s = settingsManager.getAll();
      if (!s.sandbox_paths) s.sandbox_paths = {};
      s.sandbox_paths.auto_acc_user_data = true;
      await settingsManager.save(s);
      return true;
    }
    if (item.status === 'denied') {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  item.status = 'denied';
  return false;
};

const fuzzyFindFile = (dir: string, fileName: string): string | null => {
  try {
    if (!existsSync(dir)) return null;
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        const found = fuzzyFindFile(fullPath, fileName);
        if (found) return found;
      } else if (item.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      }
    }
  } catch (_) {}
  return null;
};

export const verifySandboxPath = async (targetPath: string, action?: string, confirmed?: boolean): Promise<string> => {
  if (targetPath.includes('\0')) {
    throw new Error("PATH_JAIL_ERROR: Null Byte injection detected. Please revise your path to avoid null character bytes.");
  }

  const settings = SettingsManager.getInstance().getAll();
  const yoloMode = getYoloMode();
  const dynamicSandboxRoot = getDynamicSandboxRoot();

  // Pre-process absolute workspace paths (like process.cwd() or /app) into relative sandbox paths
  let cleanedPath = targetPath;
  const cwd = process.cwd();
  
  if (path.isAbsolute(cleanedPath)) {
    if (cleanedPath.startsWith(cwd)) {
      cleanedPath = path.relative(cwd, cleanedPath) || ".";
    } else if (cleanedPath.startsWith('/app/')) {
      cleanedPath = cleanedPath.substring('/app/'.length);
    } else if (cleanedPath === '/app') {
      cleanedPath = ".";
    }
  }

  const normalized = cleanedPath.replace(/\\/g, '/').toLowerCase();
  const parts = normalized.split('/');
  if (yoloMode !== 'full' && yoloMode !== 'half') {
    if (parts.some(part => part.startsWith('.') && part !== '.' && part !== '..')) {
      throw new Error("PATH_JAIL_ERROR: Interacting with sensitive dotfiles or system configuration directories is forbidden. Please revise your target path to refer only to public/sandbox files under 'user_data/' (e.g. 'user_data/filename.txt').");
    }
  }

  // Normalize prefix aliases ('.yuihime/' and the apiCustomSystemRoot base name) into bare segments
  let classPath = cleanedPath;
  if (classPath.startsWith('./')) {
    classPath = classPath.substring(2);
  }
  const rootBaseName = path.basename(apiCustomSystemRoot);
  if (classPath.startsWith(rootBaseName + '/')) {
    classPath = classPath.substring(rootBaseName.length + 1);
  } else if (classPath.startsWith('.yuihime/')) {
    classPath = classPath.substring('.yuihime/'.length);
  }

  // Cross-mode contract: the "user_data/..." prefix ALWAYS maps to the configured sandbox
  // user_data root (dynamicSandboxRoot), regardless of YOLO mode. This keeps the tool schema
  // instruction ("use user_data/file.txt") consistent so the LLM never accidentally targets
  // process.cwd()/user_data (a different folder) in half/full mode.
  const isUserDataRef = classPath.startsWith('user_data/') || classPath === 'user_data';
  const resolveUserDataRef = (): string =>
    path.resolve(dynamicSandboxRoot, isUserDataRef && classPath !== 'user_data' ? classPath.substring('user_data/'.length) : '');

  // Determine initial resolved path based on YOLO mode
  let resolvedPath: string;

  if (yoloMode === 'full') {
    // Stage 2 when YOLO is ON (FULL): allow everything "all in os" - resolve relative to system cwd
    resolvedPath = isUserDataRef ? resolveUserDataRef() : path.resolve(process.cwd(), targetPath);
  } else if (yoloMode === 'half') {
    // In half mode, resolve files relative to system process root (cwd), allowing work outside
    // the repository, but keep the "user_data/..." contract anchored to the sandbox root.
    if (isUserDataRef) {
      resolvedPath = resolveUserDataRef();
    } else if (path.isAbsolute(cleanedPath)) {
      resolvedPath = path.resolve(cleanedPath);
    } else {
      resolvedPath = path.resolve(process.cwd(), targetPath);
    }
  } else {
    // Standard sandboxed / off mode: Jail path resolution
    if (path.isAbsolute(cleanedPath)) {
      resolvedPath = path.resolve(cleanedPath);
    } else if (isUserDataRef) {
      resolvedPath = resolveUserDataRef();
    } else {
      const systemDirs = ['agent', 'addons', 'data', 'models'];
      const firstPart = classPath.split('/')[0];
      if (systemDirs.includes(firstPart)) {
        resolvedPath = path.resolve(apiCustomSystemRoot, classPath);
      } else {
        resolvedPath = path.resolve(dynamicSandboxRoot, classPath);
      }
    }

    if (!resolvedPath.startsWith(apiCustomSystemRoot) && !resolvedPath.startsWith(dynamicSandboxRoot)) {
      throw new Error(`PATH_JAIL_ERROR: The path "${targetPath}" is unauthorized because it resolves outside of authorized sandbox environments. Please revise your path parameter. For accessing files, always use relative paths inside the 'user_data/' folder (e.g., 'user_data/my_file.txt') or inside '.yuihime/'. Do not use parent directories ('../') or absolute paths outside the workspace.`);
    }
  }

  // SMART FUZZY FILE-SENSING FALLBACK UTILITY:
  // Jika file tidak ditemukan pada resolvedPath, tapi merupakan operasi baca/tulis/hapus/modifikasi,
  // dan file tersebut fisik ada di dalam dynamicSandboxRoot (/user_data) dengan nama yang sama,
  // lakukan auto-redirection secara mulus untuk mencegah kegagalan kognitif LLM.
  const isReadOrUpdate = !action || action === 'read' || action === 'write' || action === 'delete' || action === 'move' || action === 'copy';
  if (isReadOrUpdate && !existsSync(resolvedPath)) {
    const baseName = path.basename(targetPath);
    if (baseName && baseName.includes('.') && baseName !== '.' && baseName !== '..') {
      const fuzzyMatch = fuzzyFindFile(dynamicSandboxRoot, baseName);
      if (fuzzyMatch && existsSync(fuzzyMatch)) {
        console.log(`[FUZZY_SENSE] Jalur tidak ditemukan: "${targetPath}". Auto-redirection ke file fisik: "${fuzzyMatch}"`);
        resolvedPath = fuzzyMatch;
      }
    }
  }

  // Verifikasi Symlink escape bypass (kecuali full YOLO atau half YOLO)
  if (yoloMode !== 'full' && yoloMode !== 'half') {
    try {
      if (existsSync(resolvedPath)) {
        const realResolved = realpathSync(resolvedPath);
        if (!realResolved.startsWith(apiCustomSystemRoot) && !realResolved.startsWith(dynamicSandboxRoot)) {
          throw new Error("PATH_JAIL_ERROR: Symlink escape bypass detected. Please revise your target path to be a direct file within the 'user_data/' directory without symbolic link loops.");
        }
      }
    } catch (_) {}
  }

  // Check file modifications / changes for "half" and "off" modes:
  const isChangeAction = action === 'write' || action === 'delete' || action === 'move' || action === 'copy';
  
  if (isChangeAction) {
    if (yoloMode === 'half') {
      // Whitelist check
      const checkWhitelist = (resolved: string): boolean => {
        if (resolved.startsWith(dynamicSandboxRoot)) return true;
        const dataDir = path.resolve(apiCustomSystemRoot, 'data');
        if (resolved.startsWith(dataDir)) return true;
        if (resolved.startsWith(apiCustomSystemRoot)) return true;

        // Custom whitelist
        const whitelistRaw = settings.sandbox_paths?.whitelist;
        if (whitelistRaw) {
          const list = Array.isArray(whitelistRaw)
            ? whitelistRaw
            : typeof whitelistRaw === 'string'
              ? whitelistRaw.split(',').map(s => s.trim())
              : [];
          for (const item of list) {
            if (!item) continue;
            const resolvedItem = path.resolve(process.cwd(), item);
            if (resolved === resolvedItem || resolved.startsWith(resolvedItem + path.sep)) {
              return true;
            }
          }
        }
        return false;
      };

      if (!checkWhitelist(resolvedPath)) {
        const autoAcc = settings.sandbox_paths?.auto_acc_user_data === true;
        if (confirmed !== true && !autoAcc) {
          const approved = await requestFileOperationConfirmation(action || 'write', targetPath);
          if (!approved) {
            throw new Error(`CONFIRMATION_REQUIRED: Action '${action}' on path '${targetPath}' was denied or timed out.`);
          }
        }
      }
    } else {
      // Standard 'off' mode:
      // Stage 2 (Secondary Users Data): Inside user_data (dynamicSandboxRoot). Write/Edit or Delete actions require explicit confirmation.
      const isInsideUserData = resolvedPath.startsWith(dynamicSandboxRoot);
      if (isInsideUserData) {
        const fileExists = existsSync(resolvedPath);
        const isEditOrDelete = (action === 'write' && fileExists) || action === 'delete' || action === 'move' || action === 'copy';

        const autoAcc = settings.sandbox_paths?.auto_acc_user_data === true;
        if (isEditOrDelete && confirmed !== true && !autoAcc) {
          const approved = await requestFileOperationConfirmation(action || 'write', targetPath);
          if (!approved) {
            throw new Error(`CONFIRMATION_REQUIRED: Action '${action}' on user_data file/folder requires explicit confirmation.`);
          }
        }
      }
    }
  }

  return resolvedPath;
};

/**
 * Resolves a target path against the YUIHIME_SYSTEM_ROOT environment variable (apiCustomSystemRoot)
 * or the user_data sandbox directory, validating security boundaries and avoiding path escape risks.
 */
export const resolveSystemRootPath = async (targetPath: string, action?: string, confirmed?: boolean): Promise<string> => {
  return verifySandboxPath(targetPath, action, confirmed);
};

// --- API Router Registration ---
export function registerAPIRoutes(app: express.Express, db: any) {
  console.log("[SERVER_ROUTE_INIT] registerAPIRoutes started!");
  // Sync file automation rules schedules to Cron Module at startup

  // --- Yui Airi dataset neuromorphic training importer ---
  console.log("[SERVER_ROUTE_INIT] Registering storage routes...");
  registerStorageRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering sandbox routes...");
  console.log("[SERVER_ROUTE_INIT] Registering telegram routes...");
  registerTelegramRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering synthesizer routes...");
  registerSynthesizerRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering tools routes...");
  registerToolsRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering identities routes...");
  registerIdentitiesRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering system routes...");
  registerSystemRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering dataset routes...");
  registerDatasetRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering AI routes...");
  registerAiRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] Registering cortex routes...");
  registerCortexRoutes(app, db);
  console.log("[SERVER_ROUTE_INIT] All API routes registered successfully!");

  // Log all registered routes for debugging purposes
  try {
    if (app._router && app._router.stack) {
      const routes: string[] = [];
      app._router.stack.forEach((middleware: any) => {
        if (middleware.route) { // routes registered directly on the app
          routes.push(`${Object.keys(middleware.route.methods).join(",").toUpperCase()} ${middleware.route.path}`);
        } else if (middleware.name === "router" && middleware.handle.stack) { // router middleware
          middleware.handle.stack.forEach((handler: any) => {
            if (handler.route) {
              routes.push(`${Object.keys(handler.route.methods).join(",").toUpperCase()} ${handler.route.path}`);
            }
          });
        }
      });
      console.debug("[SERVER_ROUTE_INIT] Current express routing table:\n" + routes.join("\n"));
    }
  } catch (err: any) {
    console.warn("[SERVER_ROUTE_INIT] Failed to print routing table:", err.message);
  }

  app.post("/api/modules/initialize", async (req, res) => {
    try {
      await initializeCortexModules();
      res.json({ success: true, message: "Cortex modules initialized" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.all("/api/*", (req, res) => {
    res.status(404).json({ 
      error: "Neural API Endpoint Not Found", 
      path: req.url,
      method: req.method
    });
  });
}
