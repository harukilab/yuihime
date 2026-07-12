import * as toml from 'smol-toml';
import * as fsSync from 'fs';
import * as pathModule from 'path';

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

let appliedLogLevel = false;
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

  if (appliedLogLevel) return;
  appliedLogLevel = true;

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
  public static applyBootLogLevel(): void {
    if (typeof window !== 'undefined') return;
    try {
      const rootEnv = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || '.yuihime';
      const fallbackRoot = pathModule.isAbsolute(rootEnv) ? rootEnv : pathModule.join(process.cwd(), rootEnv);
      const p = process.env.YUIHIME_CONFIG || pathModule.join(fallbackRoot, 'data', 'config.toml');
      if (!fsSync.existsSync(p)) return;
      const parsed = toml.parse(fsSync.readFileSync(p, 'utf-8')) as AppSettings;
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
    try {
      const metaUrl = typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : '';
      if (metaUrl) {
        const { createRequire } = await import(/* @vite-ignore */ 'module');
        const requireFunc = createRequire(metaUrl);
        this.fsModule = requireFunc('fs/promises');
        this.fsSyncModule = requireFunc('fs');
        this.pathModule = requireFunc('path');
      } else {
        if (typeof require !== 'undefined') {
          this.fsModule = require('fs/promises');
          this.fsSyncModule = require('fs');
          this.pathModule = require('path');
        } else {
          this.fsModule = await import('fs/promises');
          this.fsSyncModule = await import('fs');
          this.pathModule = await import('path');
        }
      }
    } catch (e) {
      console.error('[SettingsManager] Failed to load node modules:', e);
    }
  }

  private async getSettingsPath(): Promise<string> {
    if (this.settingsPath) return this.settingsPath;
    if (typeof window !== 'undefined') {
      this.settingsPath = 'config.toml';
      return this.settingsPath;
    }
    await this.ensureNodeModules();
    const rootEnvStr = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || '.yuihime';
    const fallbackRoot = this.pathModule ? (this.pathModule.isAbsolute(rootEnvStr) ? rootEnvStr : this.pathModule.join(process.cwd(), rootEnvStr)) : rootEnvStr;
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
    if (geminiKey) process.env.GEMINI_API_KEY = geminiKey;

    const anthropicKey = getVal(anthropicConf, 'apiKey', 'api_key');
    if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;

    const openrouterKey = getVal(openrouterConf, 'apiKey', 'api_key');
    if (openrouterKey) process.env.OPENROUTER_API_KEY = openrouterKey;

    // TTS Providers
    const elevenlabsConf = this.settings.elevenlabs || {};
    const elevenlabsKey = getVal(elevenlabsConf, 'apiKey', 'api_key');
    if (elevenlabsKey) process.env.VITE_ELEVENLABS_API_KEY = elevenlabsKey;

    const elevenlabsVoice = getVal(elevenlabsConf, 'voiceId', 'voice_id');
    if (elevenlabsVoice) process.env.VITE_ELEVENLABS_VOICE_ID = elevenlabsVoice;

    // Bridges/Channels
    const telegramBridgeConf = this.settings.telegram_bridge || {};
    const telegramToken = getVal(telegramBridgeConf, 'botToken', 'bot_token');
    if (telegramToken) process.env.TELEGRAM_BOT_TOKEN = telegramToken;

    const discordBridgeConf = this.settings.discord_bridge || {};
    const discordToken = getVal(discordBridgeConf, 'token', 'token');
    if (discordToken) process.env.DISCORD_BOT_TOKEN = discordToken;

    const twitchBridgeConf = this.settings.twitch_bridge || {};
    const twitchOauth = getVal(twitchBridgeConf, 'oauth', 'oauth');
    if (twitchOauth) process.env.TWITCH_OAUTH_TOKEN = twitchOauth;

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

  getApiKey(): string {
    const providersTable = this.settings.providers || {};
    const geminiConf = providersTable.gemini || this.settings.gemini || {};
    const configKey = geminiConf.apiKey !== undefined ? geminiConf.apiKey : geminiConf.api_key;
    
    if (configKey && configKey.trim() !== '' && !configKey.toLowerCase().includes('your_api_key')) {
      return configKey;
    }
    
    if (typeof window !== 'undefined') return '';

    const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (envKey && envKey.trim() !== '' && !envKey.toLowerCase().includes('your_api_key')) {
      console.warn('[KERNEL] Using fallback API Key from process.env. Migration to config.toml is recommended.');
      return envKey;
    }
    
    return configKey || '';
  }
}
