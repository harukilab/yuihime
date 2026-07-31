import * as toml from 'smol-toml';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger, LogLevel } from '@shared/core/kernel/logger';
import { toKeyArray, toSingleString } from './configNormalizer.js';

// --- Global log level filtering ---
// Levels (ascending): debug(0) < info(1) < warn(2) < error(3) < silent(4)
const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  verbose: 1,
  info: 1,
  warn: 2,
  warning: 2,
  error: 3,
  silent: 4,
  none: 4
};

const METHOD_LEVEL: Record<string, number> = {
  debug: 0,
  log: 1,
  info: 1,
  warn: 2,
  error: 3
};

let currentLogLevelThreshold = LOG_LEVELS.info;

/**
 * Installs a global console verbosity gate driven by the `log_level` config value.
 * Messages whose severity is below the configured threshold are suppressed.
 * Safe to call multiple times; the threshold adapts live without re-wrapping.
 */
function applyLogLevelFilter(levelRaw: string | undefined): void {
  if (typeof window !== 'undefined') return;
  const normalized = String(levelRaw ?? 'warn').toLowerCase().trim();
  currentLogLevelThreshold = LOG_LEVELS[normalized] ?? LOG_LEVELS.warn;

  const loggerLevel = (LogLevel as any)[normalized.toUpperCase()] ?? LogLevel.WARN;
  try {
    Logger.getInstance().setLevel(loggerLevel);
  } catch {}

  for (const method of Object.keys(METHOD_LEVEL)) {
    const original = (console as any)[method].bind(console);
    (console as any)[method] = (...args: any[]) => {
      if ((METHOD_LEVEL[method] ?? 1) < currentLogLevelThreshold) return;
      original(...args);
    };
  }
}

interface AppSettings {
  gemini?: {
    apiKey?: string;
    model?: string;
  };
  [key: string]: any;
}

const API_KEY_FIELDS = new Set(['apiKey', 'api_key', 'apiKeys', 'api_keys']);

function normalizeApiKeysForToml(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) normalizeApiKeysForToml(item);
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (API_KEY_FIELDS.has(key) && typeof value === 'string') {
      const keys = toKeyArray(value);
      obj[key] = keys.length > 1 ? keys : value;
    } else if (value && typeof value === 'object') {
      normalizeApiKeysForToml(value);
    }
  }
}

function denormalizeApiKeysForWeb(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) denormalizeApiKeysForWeb(item);
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (API_KEY_FIELDS.has(key) && Array.isArray(value)) {
      obj[key] = value.join('\n');
    } else if (value && typeof value === 'object') {
      denormalizeApiKeysForWeb(value);
    }
  }
}

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: AppSettings = {};
  private settingsPath: string | null = null;
  private fsModule: any = null;
  private fsSyncModule: any = null;
  private pathModule: any = null;

  private constructor() {}

  /**
   * Synchronously reads config.toml and applies the log-level gate as early as
   * possible (before the async load()), so verbose boot logs are suppressed too.
   */
public static async applyBootLogLevel(): Promise<void> {
     if (typeof window !== 'undefined') return;
     try {
        let rootEnv = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || '~/.yuihime';
        if (rootEnv.startsWith('~')) {
          rootEnv = path.join(os.homedir(), rootEnv.substring(1));
        } else if (rootEnv.includes('$HOME')) {
          rootEnv = rootEnv.replace(/\$HOME/g, os.homedir());
        } else if (rootEnv.includes('$home')) {
          rootEnv = rootEnv.replace(/\$home/g, os.homedir());
        } else if (rootEnv.includes('%USERPROFILE%')) {
          rootEnv = rootEnv.replace(/%USERPROFILE%/g, os.homedir());
        }
        rootEnv = rootEnv.replace(/^['"]|['"]$/g, "");
        const fallbackRoot = path.isAbsolute(rootEnv) ? rootEnv : path.join(process.cwd(), rootEnv);
      const p = process.env.YUIHIME_CONFIG || path.join(fallbackRoot, 'data', 'config.toml');
      if (!fs.existsSync(p)) return;
      const parsed = toml.parse(fs.readFileSync(p, 'utf-8')) as AppSettings;
      applyLogLevelFilter(parsed.log_level ?? parsed.logLevel);
    } catch {}
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

private async ensureNodeModules() {
     if (typeof window !== 'undefined') return;
     if (this.fsModule && this.pathModule) return;
     this.fsModule = fsPromises;
     this.fsSyncModule = fs;
     this.pathModule = path;
   }

  private async getSettingsPath(): Promise<string> {
    if (this.settingsPath) return this.settingsPath;
    if (typeof window !== 'undefined') {
      this.settingsPath = 'config.toml';
      return this.settingsPath;
    }
    await this.ensureNodeModules();
    const rootEnvStr = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || '~/.yuihime';
    const expandedRoot = this.pathModule ? (() => {
      let trimmed = rootEnvStr.trim();
      if (trimmed.startsWith('~')) {
        return this.pathModule.join(os.homedir(), trimmed.slice(1));
      }
      if (trimmed.includes('$HOME')) {
        trimmed = trimmed.replace(/\$HOME/g, os.homedir());
      }
      if (trimmed.includes('$home')) {
        trimmed = trimmed.replace(/\$home/g, os.homedir());
      }
      if (trimmed.includes('%USERPROFILE%')) {
        trimmed = trimmed.replace(/%USERPROFILE%/g, os.homedir());
      }
      return trimmed;
    })() : rootEnvStr;
    const fallbackRoot = this.pathModule ? (this.pathModule.isAbsolute(expandedRoot) ? expandedRoot : this.pathModule.join(process.cwd(), expandedRoot)) : expandedRoot;
    const fallbackDataDir = this.pathModule ? this.pathModule.join(fallbackRoot, 'data') : 'data';
    const fallbackConfigPath = this.pathModule ? this.pathModule.join(fallbackDataDir, 'config.toml') : 'config.toml';
    this.settingsPath = process.env.YUIHIME_CONFIG || fallbackConfigPath;
    return this.settingsPath;
  }

  private syncToEnv(): void {
    if (typeof window !== 'undefined') return;
    
    // Helper helper to get property either with camelCase or snake_case
    const getVal = (obj: any, keyCamel: string, keySnake: string) => {
      if (!obj) return undefined;
      return obj[keyCamel] !== undefined ? obj[keyCamel] : obj[keySnake];
    };

    const getProviderConfig = (providerId: string) => {
      const providersTable = this.settings.providers || {};
      return providersTable[providerId] || this.settings[providerId] || {};
    };

    const geminiConf = getProviderConfig('gemini');
    const anthropicConf = getProviderConfig('anthropic');
    const openrouterConf = getProviderConfig('openrouter');

    // LLM Providers
    const geminiKey = getVal(geminiConf, 'apiKey', 'api_key');
    if (geminiKey) {
      const keys = toKeyArray(geminiKey);
      process.env.GEMINI_API_KEY = keys[0] || '';
    }

    const anthropicKey = getVal(anthropicConf, 'apiKey', 'api_key');
    if (anthropicKey) process.env.ANTHROPIC_API_KEY = toSingleString(anthropicKey);

    const openrouterKey = getVal(openrouterConf, 'apiKey', 'api_key');
    if (openrouterKey) process.env.OPENROUTER_API_KEY = toSingleString(openrouterKey);

    // TTS Providers
    const elevenlabsConf = this.settings.elevenlabs || {};
    const elevenlabsKey = getVal(elevenlabsConf, 'apiKey', 'api_key');
    if (elevenlabsKey) process.env.VITE_ELEVENLABS_API_KEY = toSingleString(elevenlabsKey);

    const elevenlabsVoice = getVal(elevenlabsConf, 'voiceId', 'voice_id');
    if (elevenlabsVoice) process.env.VITE_ELEVENLABS_VOICE_ID = elevenlabsVoice;

    // Bridges/Channels
    const telegramBridgeConf = this.settings.telegram_bridge || {};
    const telegramToken = getVal(telegramBridgeConf, 'botToken', 'bot_token');
    if (telegramToken) process.env.TELEGRAM_BOT_TOKEN = toSingleString(telegramToken);

    const discordBridgeConf = this.settings.discord_bridge || {};
    const discordToken = getVal(discordBridgeConf, 'token', 'token');
    if (discordToken) process.env.DISCORD_BOT_TOKEN = toSingleString(discordToken);

    const twitchBridgeConf = this.settings.twitch_bridge || {};
    const twitchOauth = getVal(twitchBridgeConf, 'oauth', 'oauth');
    if (twitchOauth) process.env.TWITCH_OAUTH_TOKEN = toSingleString(twitchOauth);

    // Sandbox / Physical Path Jail locations synchronization
    const sandboxPathsConf = this.settings.sandbox_paths || {};
    const dataDir = getVal(sandboxPathsConf, 'dataDir', 'data_dir');
    if (dataDir) process.env.YUIHIME_DATA_DIR = dataDir;

    const configPath = getVal(sandboxPathsConf, 'configPath', 'config_path');
    if (configPath) process.env.YUIHIME_CONFIG = configPath;

    const dbPath = getVal(sandboxPathsConf, 'dbPath', 'db_path');
    if (dbPath) process.env.YUIHIME_DB_PATH = dbPath;

    const userDataPath = getVal(sandboxPathsConf, 'userDataPath', 'user_data_path');
    if (userDataPath) process.env.YUIHIME_USER_DATA_PATH = userDataPath;

    const agentPath = getVal(sandboxPathsConf, 'agentPath', 'agent_path');
    if (agentPath) process.env.YUIHIME_AGENT_PATH = agentPath;

    const addonsPath = getVal(sandboxPathsConf, 'addonsPath', 'addons_path');
    if (addonsPath) process.env.YUIHIME_ADDONS_PATH = addonsPath;

    // Sync user configured network port (defaulting to process.env.PORT if specified via CLI/Env)
    const userPort = this.settings.port;
    if (userPort && !process.env.PORT) {
      process.env.PORT = String(userPort);
    }

    console.log('[KERNEL] Environment variables (including Physical Sandbox Sandbox paths) synchronized with config.toml');
  }

  async load(): Promise<AppSettings> {
    try {
      if (typeof window !== 'undefined') {
        try {
          const res = await fetch('/api/settings');
          if (res.ok) {
            this.settings = await res.json();
          }
        } catch (fetchErr) {
          console.warn('[SettingsManager] Failed to fetch settings from server-side, using local fallback:', fetchErr);
        }
        return this.settings;
      }
      await this.ensureNodeModules();
      const p = await this.getSettingsPath();
      if (!this.fsSyncModule || !this.fsSyncModule.existsSync(p)) {
        console.warn('[KERNEL] config.toml not found, initialized empty.');
        this.settings = {};
        return {};
      }

      const content = await this.fsModule.readFile(p, 'utf-8');
      try {
        this.settings = toml.parse(content) as AppSettings;
        applyLogLevelFilter(this.settings.log_level ?? this.settings.logLevel);
        
        // Backward compatibility: migrate aiName -> characterName
        if (!this.settings.characterName && this.settings.aiName) {
          this.settings.characterName = this.settings.aiName;
        }
      } catch (parseError) {
        console.error('[KERNEL] config.toml is corrupted. Using empty fallback.', parseError);
        this.settings = {};
      }
      
      this.syncToEnv();
      return this.settings;
    } catch (e) {
      console.warn('[KERNEL] Failed to load config.toml:', e);
      return {};
    }
  }

  async save(newSettings: AppSettings): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    applyLogLevelFilter(this.settings.log_level ?? this.settings.logLevel);
    if (typeof window !== 'undefined') {
      return;
    }
    await this.ensureNodeModules();
    normalizeApiKeysForToml(this.settings);
    const p = await this.getSettingsPath();
    const content = toml.stringify(this.settings);
    await this.fsModule.writeFile(p, content);
    this.syncToEnv();
    console.log('[KERNEL] Settings persisted to config.toml and environment.');
  }

  get(key: string): any {
    return this.settings[key];
  }

  getAll(): AppSettings {
    return this.settings;
  }

  static denormalizeForWeb(settings: AppSettings): AppSettings {
    const clone = JSON.parse(JSON.stringify(settings));
    denormalizeApiKeysForWeb(clone);
    return clone;
  }

  getApiKey(): string {
    const providersTable = this.settings.providers || {};
    const geminiConf = providersTable.gemini || this.settings.gemini || {};
    const configKey = geminiConf.apiKey !== undefined ? geminiConf.apiKey : geminiConf.api_key;
    const keys = toKeyArray(configKey);
    if (keys.length > 0) return keys[0];
    
    if (typeof window !== 'undefined') return '';

    const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (envKey && envKey.trim() !== '' && !envKey.toLowerCase().includes('your_api_key')) {
      console.warn('[KERNEL] Using fallback API Key from process.env. Migration to config.toml is recommended.');
      return envKey;
    }
    
    return '';
  }
}
