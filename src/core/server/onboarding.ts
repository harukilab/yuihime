import path from "path";
import { renameSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, readSync } from "fs";
import { fileURLToPath } from "url";
import * as toml from "smol-toml";
import { execSync } from "child_process";
import { getDb, withDbRetry, retryDbOperation } from "../database.js";
import { appendLog } from "../fileLogger.js";
import { resolveSystemRoot, expandHomePath } from "../systemPaths.js";
import { genId } from '@shared/core/idGen';
import { AI_NAME } from '@shared/constants';

let __filename = "";
let __dirname = "";
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    __dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
    __filename = typeof __filename !== "undefined" ? __filename : path.join(__dirname, "onboarding.ts");
  }
} catch (e) {
  __dirname = process.cwd();
  __filename = path.join(__dirname, "onboarding.ts");
}

// Expands home directory symbol (~) to full path using os.homedir()
export function resolveHomePath(inputPath: string): string {
  return expandHomePath(inputPath);
}
// Custom Helper to Clear Terminal and Scrollback Screen gracefully
function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}

// Custom Header Renderer for the TUI Steps Wizard
function drawHeader(stepNum: number, stepName: string) {
  clearScreen();
  console.log(`\x1b[36m┌────────────────────────────────────────────────────────┐\x1b[0m`);
  console.log(`\x1b[36m│\x1b[1;32m       結姫 YUIHIME INTERACTIVE COGNITIVE WIZARD        \x1b[0m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[36m├────────────────────────────────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[36m│\x1b[1;35m Step ${stepNum}/7: ${stepName.padEnd(46)}\x1b[0m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[36m└────────────────────────────────────────────────────────┘\x1b[0m`);
}

// Synchronous Prompt Helper using standard Node readSync
function askSync(query: string, defaultValue = ""): string {
  const formattedQuery = defaultValue 
    ? `👉 ${query} \x1b[33m[Default: ${defaultValue}]\x1b[0m: ` 
    : `👉 ${query}: `;
  process.stdout.write(formattedQuery);
  
  const buffer = Buffer.alloc(1024);
  let bytesRead = 0;
  try {
    bytesRead = readSync(process.stdin.fd, buffer, 0, 1024, null);
  } catch (e) {
    // Return default if process.stdin is closed or not a TTY
    return defaultValue;
  }
  
  const answer = buffer.toString("utf8", 0, bytesRead).trim();
  return answer || defaultValue;
}

function normalizeApiKeyInput(raw: string): string | string[] {
  if (!raw) return raw;
  const parts = raw.split(/[\n,;]+/).map((k) => k.trim()).filter((k) => k.length > 0 && !k.toLowerCase().includes('your_api_key'));
  if (parts.length <= 1) return raw;
  return parts;
}

// Interactive Choice Selector Menu
function chooseOptionSync(title: string, options: string[], defaultIdx = 0): number {
  console.log(`\n\x1b[1;36m${title}\x1b[0m`);
  options.forEach((opt, idx) => {
    const isDefault = idx === defaultIdx ? " \x1b[33m(Default)\x1b[0m" : "";
    console.log(`  \x1b[32m[${idx + 1}]\x1b[0m ${opt}${isDefault}`);
  });
  while (true) {
    const ans = askSync(`Choice (1-${options.length})`, (defaultIdx + 1).toString());
    const val = parseInt(ans, 10);
    if (!isNaN(val) && val >= 1 && val <= options.length) {
      return val - 1;
    }
    console.log(`\x1b[31m⚠️ Invalid option. Please choose a number between 1 and ${options.length}.\x1b[0m`);
  }
}

// Real-time dynamic model discovery probe inside a synchronous child process (Agnostic - NO hardcoded fallbacks)
function discoverModelsSync(provider: string, apiKey: string, baseUrl?: string): string[] {
  console.log(`\n\x1b[35m🔍 Searching for models from provider [${provider.toUpperCase()}]...\x1b[0m`);
  try {
    const cleanProvider = provider.toLowerCase();
    let url = "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (cleanProvider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    } else if (cleanProvider === "openai") {
      url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/models` : "https://api.openai.com/v1/models";
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (cleanProvider === "deepseek") {
      url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/models` : "https://api.deepseek.com/v1/models";
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (cleanProvider === "groq") {
      url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/models` : "https://api.groq.com/openai/v1/models";
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (cleanProvider === "openrouter") {
      url = "https://openrouter.ai/api/v1/models";
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (cleanProvider === "ollama") {
      const base = baseUrl || "http://127.0.0.1:11434";
      url = `${base.replace(/\/$/, "")}/api/tags`;
    } else {
      const base = baseUrl || "https://api.openai.com/v1";
      url = `${base.replace(/\/$/, "")}/models`;
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const inlineScript = `
      (async () => {
        try {
          const res = await fetch(${JSON.stringify(url)}, {
            headers: ${JSON.stringify(headers)},
            signal: AbortSignal.timeout(3000)
          });
          if (!res.ok) {
            console.log("[]");
            process.exit(0);
          }
          const data = await res.json();
          let list = [];
          const provider = ${JSON.stringify(cleanProvider)};
          if (provider === "ollama") {
            if (data.models && Array.isArray(data.models)) {
              list = data.models.map(m => m.name || m.model);
            } else if (data.data && Array.isArray(data.data)) {
              list = data.data.map(m => m.id);
            }
          } else if (provider === "gemini") {
            if (data.models && Array.isArray(data.models)) {
              list = data.models.map(m => m.name);
            }
          } else {
            if (data.data && Array.isArray(data.data)) {
              list = data.data.map(m => m.id);
            }
          }
          console.log(JSON.stringify(list));
        } catch (e) {
          console.log("[]");
        }
      })();
    `;

    const resultJson = execSync(`node -e ${JSON.stringify(inlineScript)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const list = JSON.parse(resultJson.trim() || "[]");
    return list;
  } catch (e: any) {
    console.log(`\x1b[31m⚠️ Dynamic discovery failed: ${e.message}\x1b[0m`);
    return [];
  }
}

// Default cron task seed: memory consolidation every 6 hours (idempotent, ON CONFLICT DO NOTHING).
// Called from server.ts AFTER setupSchema(db) so the cron_tasks table already exists.
export async function seedDefaultCronTask(db: any): Promise<void> {
  try {
    await retryDbOperation(() => {
      db.prepare(`
        INSERT INTO cron_tasks (id, name, schedule, enabled, repeating, context_id, chat_type, sender_name)
        VALUES ('memory-consolidation', 'Memory Consolidation', '0 */6 * * *', 1, 1, 'live_stream', 'Live Chat', 'System')
        ON CONFLICT(id) DO NOTHING
      `).run();
    }, 'seed cron_tasks');
  } catch (e: any) {
    console.warn("[ONBOARDING] Failed to seed default memory consolidation task:", e.message);
  }
}

// --- Onboarding Flow: Extract default and establish folders outside binary if missing ---
export function runOnboarding() {
  const yuihimeSystemRootCheck = resolveSystemRoot();
  const rawDataDirCheck = process.env.YUIHIME_DATA_DIR;
  const resolvedDataDirCheck = rawDataDirCheck ? resolveHomePath(rawDataDirCheck) : path.join(yuihimeSystemRootCheck, "data");
  const rawConfigPathCheck = process.env.YUIHIME_CONFIG;
  const resolvedConfigPathCheck = rawConfigPathCheck ? resolveHomePath(rawConfigPathCheck) : path.join(resolvedDataDirCheck, "config.toml");

  let configExists = existsSync(resolvedConfigPathCheck);
  let isInteractive = (process.argv.includes("--interactive") || process.argv.includes("--setup") || (!configExists && process.stdout.isTTY)) && process.stdin.isTTY;

  const updateProgress = (step: number, total: number, message: string) => {
    if (isInteractive || process.env.YUIHIME_QUIET === "true") return;
    const barLength = 15;
    const filledLength = Math.round((step / total) * barLength);
    const emptyLength = barLength - filledLength;
    const bar = "▰".repeat(filledLength) + "▱".repeat(emptyLength);
    const spinners = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const spinner = spinners[step % spinners.length];
    const line = `\x1b[35m${spinner} [YUIHIME BOOT] [${bar}] ${Math.round((step / total) * 100)}% | ${message}...\x1b[0m`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r${line}`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  };

  if (isInteractive) {
    console.log("\n=======================================================");
    console.log("       ✨ YUIHIME AI VTUBER SYSTEM BOOTING ✨       ");
    console.log("=======================================================\n");
  } else {
    updateProgress(1, 7, "Resolving physical workspaces");
  }

  // Central fallback root folder inside execution directory (supports customization via environment variables)
  let yuihimeSystemRoot = yuihimeSystemRootCheck;

  const rawDataDir = process.env.YUIHIME_DATA_DIR;
  let resolvedDataDir = rawDataDir ? resolveHomePath(rawDataDir) : path.join(yuihimeSystemRoot, "data");
  if (!existsSync(resolvedDataDir)) {
    mkdirSync(resolvedDataDir, { recursive: true });
  }

  updateProgress(2, 7, "Verifying database & config links");

  const rootConfigPath = path.join(process.cwd(), "config.toml");
  const defaultDataConfigPath = path.join(resolvedDataDir, "config.toml");
  if (existsSync(rootConfigPath) && !existsSync(defaultDataConfigPath)) {
    try {
      renameSync(rootConfigPath, defaultDataConfigPath);
    } catch (e: any) {
      if (isInteractive) console.warn(`[ONBOARDING] Failed to move legacy config.toml:`, e.message);
    }
  }

  const rootDbPath = path.join(process.cwd(), "yuihime.db");
  const defaultDataDbPath = path.join(resolvedDataDir, "yuihime.db");
  if (existsSync(rootDbPath) && !existsSync(defaultDataDbPath)) {
    try {
      renameSync(rootDbPath, defaultDataDbPath);
    } catch (e: any) {
      if (isInteractive) console.warn(`[ONBOARDING] Failed to move legacy yuihime.db:`, e.message);
    }
  }

  const rawConfigPath = process.env.YUIHIME_CONFIG;
  const rawDbPath = process.env.YUIHIME_DB_PATH;
  const rawAgentDir = process.env.YUIHIME_AGENT_PATH;
  const rawAddonsDir = process.env.YUIHIME_ADDONS_PATH;
  const rawUserDataDir = process.env.YUIHIME_USER_DATA_PATH;

  let resolvedConfigPath = rawConfigPath ? resolveHomePath(rawConfigPath) : defaultDataConfigPath;
  let resolvedDbPath = rawDbPath ? resolveHomePath(rawDbPath) : defaultDataDbPath;
  let resolvedAgentDir = rawAgentDir ? resolveHomePath(rawAgentDir) : path.join(yuihimeSystemRoot, "agent");
  let resolvedAddonsDir = rawAddonsDir ? resolveHomePath(rawAddonsDir) : path.join(yuihimeSystemRoot, "addons");
  let resolvedUserDataDir = rawUserDataDir ? resolveHomePath(rawUserDataDir) : path.join(yuihimeSystemRoot, "user_data");

  // Secure full physical sandbox path env variables sync with unified routing
  process.env.YUIHIME_DATA_DIR = resolvedDataDir;
  process.env.YUIHIME_CONFIG = resolvedConfigPath;
  process.env.YUIHIME_DB_PATH = resolvedDbPath;
  process.env.YUIHIME_USER_DATA_PATH = resolvedUserDataDir;
  process.env.YUIHIME_AGENT_PATH = resolvedAgentDir;
  process.env.YUIHIME_ADDONS_PATH = resolvedAddonsDir;

  updateProgress(3, 7, "Securing sandbox directories");

  if (!existsSync(resolvedUserDataDir)) {
    mkdirSync(resolvedUserDataDir, { recursive: true });
  }

  updateProgress(4, 7, "Seeding interactive workspace files");

  // Seed default sandbox workspace files if they do not exist
  const readmePath = path.join(resolvedUserDataDir, "README.md");
  if (!existsSync(readmePath)) {
    const readmeContent = `# Welcome to Yuihime Interactive Core Terminal Space!
This workspace resides dynamically in \`YUIHIME_USER_DATA_PATH\` (normally \`./.yuihime/user_data/\`).

From this space, you can run bash commands, write Node/JS scripts, and customize tools.
Your shell commands execute with full environment variables and system privileges.

### Available Commands:
* \`ls\` : Lists files in the sandbox workspace.
* \`cat <file>\` : Prints file contents into the console.
* \`edit <file>\` : Opens file inside the terminal-aligned code editor panel dynamically.
* \`touch <file>\` : Instantly creates a blank file.
* \`mkdir <folder>\` : Creates a new directory.
* \`node <file.js>\` : Executes node script (e.g. \`node yuihime-query.cjs\`).
* \`yuihime\` : Displays Yuihime Core Kernel State, DB paths, and environment settings.
* \`clear\` : Clears the active terminal output.

### Accessing the Yuihime Ecosystem:
To access the core system database, you can run scripts like \`node yuihime-query.cjs\` or directly interact with database using standard node drivers.
`;
    writeFileSync(readmePath, readmeContent, "utf-8");
  }

  const queryScriptPath = path.join(resolvedUserDataDir, "yuihime-query.cjs");
  if (!existsSync(queryScriptPath)) {
    const queryContent = `// Yuihime Interactive Sandbox Workspace Script
// Run: node yuihime-query.cjs
const Database = require('better-sqlite3');
const path = require('path');

// Dynamically locate the SQLite database
const dbPath = process.env.YUIHIME_DB_PATH || path.join(__dirname, '..', 'data', 'yuihime.db');
console.log(\`\\x1b[36m[System] Connecting to database at: \${dbPath}\\x1b[0m\\n\`);

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Query Agent State
  const stateRow = db.prepare("SELECT mood, emotion, systemHealth, activePersonaId FROM agent_state LIMIT 1").get();
  if (stateRow) {
    console.log("\\x1b[32m=== YUIHIME STATUS REPORT ===\\x1b[0m");
    console.log(\`Active Persona : \${stateRow.activePersonaId}\`);
    try {
      const mood = JSON.parse(stateRow.mood);
      console.log(\`Current Mood   : \${mood.mood || 'calm'} (Energy: \${mood.energy ?? 100})\`);
    } catch {}
    try {
      const emotion = JSON.parse(stateRow.emotion);
      console.log(\`Emotions       : joy: \${emotion.joy ?? 0}%, affection: \${emotion.affection ?? 0}%\`);
    } catch {}
    try {
      const health = JSON.parse(stateRow.systemHealth);
      console.log(\`Neural Status  : CPU Load: \${health.cpuLoad ?? 'Ok'}, RAM: \${health.ramUsage ?? 'Ok'}\`);
    } catch {}
  } else {
    console.log("No agent state found.");
  }

  // Query Recent Message Logs
  console.log("\\n\\x1b[35m=== RECENT CONVERSATIONS ===\\x1b[0m");
  const messages = db.prepare("SELECT sender, text, timestamp FROM logs ORDER BY id DESC LIMIT 3").all();
  if (messages.length > 0) {
    messages.reverse().forEach(m => {
      const time = new Date(m.timestamp).toLocaleTimeString();
      console.log(\`[\${time}] \${m.sender}: \${m.text}\`);
    });
  } else {
    console.log("No message logs found.");
  }
  
  db.close();
} catch (error) {
  console.error("\\x1b[31m[Error] Failed to read Yuihime database:\\x1b[0m", error.message);
  console.log("\\nMake sure the system database has been initialized!");
}
`;
    writeFileSync(queryScriptPath, queryContent, "utf-8");
  }

  updateProgress(5, 7, "Validating configuration files");

  let configData: any = {};

  // Load existing values to preserve ALL other sections as well
  if (existsSync(resolvedConfigPath)) {
    try {
      const content = readFileSync(resolvedConfigPath, "utf-8");
      configData = toml.parse(content) as any;
    } catch (e: any) {
      if (isInteractive) console.warn("[ONBOARDING] Failed to parse config.toml, creating a fresh empty configuration:", e.message);
    }
  }

  // Ensure default sub-objects exist
  if (!configData.provider) configData.provider = "gemini";
  if (!configData.gemini) configData.gemini = {};
  if (!configData.telegram_bridge) configData.telegram_bridge = {};
  if (!configData.discord_bridge) configData.discord_bridge = {};
  if (!configData.twitter_bridge) configData.twitter_bridge = {};
  if (!configData.elevenlabs) configData.elevenlabs = {};
  if (!configData["modular-settings"]) configData["modular-settings"] = {};
  if (!configData.sandbox_paths) configData.sandbox_paths = {};

  // Open TUI wizard setup ONLY if explicitly passed via flags or if it is a real interactive TTY on first boot
  configExists = existsSync(resolvedConfigPath);
  isInteractive = (process.argv.includes("--interactive") || process.argv.includes("--setup") || (!configExists && process.stdout.isTTY)) && process.stdin.isTTY;

  if (isInteractive) {
    clearScreen();
    console.log(`\n\x1b[1;36m👉 Interactive terminal session detected! Opening Setup Onboarding TUI...\x1b[0m\n`);
    const wantSetup = askSync("Do you want to run the Setup Onboarding TUI now? (y/N)", "n");
    
    if (wantSetup.toLowerCase() === "y" || wantSetup.toLowerCase() === "ya") {
      // -------------------------------------------------------------
      // STEP 1: PHYSICAL WORKSPACE RUNTIME
      // -------------------------------------------------------------
      drawHeader(1, "PHYSICAL WORKSPACE RUNTIME");
      console.log(`\x1b[32mSystem detected the following physical workspace directories:\x1b[0m`);
      console.log(`  • System Root (PROCESS_CWD) : \x1b[33m${yuihimeSystemRoot}\x1b[0m`);
      console.log(`  • Data Directory            : \x1b[33m${resolvedDataDir}\x1b[0m`);
      console.log(`  • Config Path (.toml)       : \x1b[33m${resolvedConfigPath}\x1b[0m`);
      console.log(`  • Database Store (.db)      : \x1b[33m${resolvedDbPath}\x1b[0m`);
      console.log(`  • Sandbox Workspace Directory: \x1b[33m${resolvedUserDataDir}\x1b[0m`);
      console.log(`  • Personalities / Agent Dir : \x1b[33m${resolvedAgentDir}\x1b[0m`);
      console.log(`  • Addons Library Folder     : \x1b[33m${resolvedAddonsDir}\x1b[0m`);

      const editPaths = askSync("\nDo you want to customize the workspace directories above? (y/N)", "n");
      if (editPaths.toLowerCase() === "y" || editPaths.toLowerCase() === "ya") {
        yuihimeSystemRoot = askSync("  System Root", yuihimeSystemRoot);
        resolvedDataDir = askSync("  Data Folder", resolvedDataDir);
        resolvedConfigPath = askSync("  Config Path", resolvedConfigPath);
        resolvedDbPath = askSync("  Database Path", resolvedDbPath);
        resolvedUserDataDir = askSync("  Sandbox Workspace Path", resolvedUserDataDir);
        resolvedAgentDir = askSync("  Agent Personality Path", resolvedAgentDir);
        resolvedAddonsDir = askSync("  Addons Folder Path", resolvedAddonsDir);

        // Resync environment variables
        process.env.YUIHIME_DATA_DIR = resolvedDataDir;
        process.env.YUIHIME_CONFIG = resolvedConfigPath;
        process.env.YUIHIME_DB_PATH = resolvedDbPath;
        process.env.YUIHIME_USER_DATA_PATH = resolvedUserDataDir;
        process.env.YUIHIME_AGENT_PATH = resolvedAgentDir;
        process.env.YUIHIME_ADDONS_PATH = resolvedAddonsDir;
      }

      // -------------------------------------------------------------
      // STEP 2: CORE AI PROVIDER CREDENTIALS & MODELS (AGNOSTIC)
      // -------------------------------------------------------------
      drawHeader(2, "CORE AI PROVIDER CREDENTIALS & MODELS");
      const providers = ["gemini", "openai", "deepseek", "groq", "openrouter", "ollama", "custom"];
      const pIdx = chooseOptionSync("Choose Main AI Provider:", providers, providers.indexOf(configData.provider || "gemini"));
      const selectedProvider = providers[pIdx];
      configData.provider = selectedProvider;

      if (!configData[selectedProvider]) configData[selectedProvider] = {};

      let apiKey = configData[selectedProvider].apiKey || configData[selectedProvider].token || "";
      let baseUrl = configData[selectedProvider].baseUrl || configData[selectedProvider].endpoint || "";

      if (selectedProvider === "ollama" || selectedProvider === "custom" || selectedProvider === "openai") {
        const defaultUrl = selectedProvider === "ollama" ? "http://127.0.0.1:11434" : "https://api.openai.com/v1";
        baseUrl = askSync(`Enter Base URL / Endpoint`, baseUrl || defaultUrl);
        configData[selectedProvider].baseUrl = baseUrl;
      }

      if (selectedProvider !== "ollama") {
        apiKey = askSync(`Enter API Key / Token for ${selectedProvider.toUpperCase()}`, apiKey);
        configData[selectedProvider].apiKey = normalizeApiKeyInput(apiKey);
      }

      const modelOpts = ["Discover and Fetch Models dynamically (Real-time)", "Input Model ID manually"];
      const mIdx = chooseOptionSync("LLM Model Selection Method:", modelOpts, 0);

      let chosenModel = configData[selectedProvider].model || "";

      if (mIdx === 0) {
        const discovered = discoverModelsSync(selectedProvider, apiKey, baseUrl);
        if (discovered.length > 0) {
          const dIdx = chooseOptionSync("Models found:", discovered, 0);
          chosenModel = discovered[dIdx];
        } else {
          console.log(`\x1b[31m⚠️ No models found or the connection failed. Switching to manual input...\x1b[0m`);
          chosenModel = askSync(`Enter Model ID manually`, chosenModel);
        }
      } else {
        chosenModel = askSync(`Enter Model ID manually`, chosenModel);
      }

      if (!chosenModel) {
        console.log(`\x1b[31m⚠️ Model ID is required! Please enter it manually.\x1b[0m`);
        chosenModel = askSync(`Enter Model ID (example: deepseek-chat)`, "");
      }

      configData[selectedProvider].model = chosenModel;

      // -------------------------------------------------------------
      // STEP 3: MULTI-PROVIDER RESILIENT FALLBACKS
      // -------------------------------------------------------------
      drawHeader(3, "MULTI-PROVIDER RESILIENT FALLBACKS");
      console.log(`\x1b[32mThis configuration keeps Yuihime stable if the main provider fails.\x1b[0m`);
      const setupFallback = askSync("\nDo you want to configure a backup provider? (y/N)", "n");
      if (setupFallback.toLowerCase() === "y" || setupFallback.toLowerCase() === "ya") {
        const fIdx = chooseOptionSync("Choose Backup Provider:", providers, 1);
        const fallbackProv = providers[fIdx];
        if (!configData[fallbackProv]) configData[fallbackProv] = {};
        
        let fKey = configData[fallbackProv].apiKey || "";
        fKey = askSync(`Enter API Key for ${fallbackProv.toUpperCase()}`, fKey);
        configData[fallbackProv].apiKey = normalizeApiKeyInput(fKey);
        
        let fModel = configData[fallbackProv].model || "";
        fModel = askSync(`Enter Model ID for ${fallbackProv.toUpperCase()}`, fModel);
        configData[fallbackProv].model = fModel;
        
        console.log(`\x1b[32m✓ Backup provider ${fallbackProv.toUpperCase()} configured successfully!\x1b[0m`);
        askSync("Press Enter to continue...");
      }

      // -------------------------------------------------------------
      // STEP 4: SOCIAL CHANNELS & COMMUNICATION BRIDGES
      // -------------------------------------------------------------
      drawHeader(4, "SOCIAL CHANNELS & BRIDGES");
      console.log(`\x1b[32mBridge Yuihime to your social networks.\x1b[0m`);
      
      if (!configData.telegram_bridge) configData.telegram_bridge = {};
      configData.telegram_bridge.botToken = askSync("Telegram Bot Token (leave empty if not used)", configData.telegram_bridge.botToken);

      if (!configData.discord_bridge) configData.discord_bridge = {};
      configData.discord_bridge.botToken = askSync("Discord Bot Token (leave empty if not used)", configData.discord_bridge.botToken);

      if (!configData.twitter_bridge) configData.twitter_bridge = {};
      configData.twitter_bridge.apiKey = normalizeApiKeyInput(askSync("Twitter/X API Key (leave empty if not used)", configData.twitter_bridge.apiKey));

      // -------------------------------------------------------------
      // STEP 5: AGNOSTIC TUNNELING PROXY
      // -------------------------------------------------------------
      drawHeader(5, "AGNOSTIC TUNNELING PROXY");
      console.log(`\x1b[32mTunneling enables offline public transmission to your local server.\x1b[0m`);
      const tunnelOpts = ["None (Localhost only)", "Cloudflare Tunnel", "ngrok", "Tailscale Funnel"];
      const tIdx = chooseOptionSync("Choose Tunneling Proxy:", tunnelOpts, 0);
      configData.tunnel_provider = ["none", "cloudflare", "ngrok", "tailscale"][tIdx];
      console.log(`\x1b[32m✓ Tunneling set to: ${configData.tunnel_provider.toUpperCase()}\x1b[0m`);
      askSync("Press Enter to continue...");

      // -------------------------------------------------------------
      // STEP 6: SECURITY GATEWAYS & SANDBOX PROTECTION
      // -------------------------------------------------------------
      drawHeader(6, "SECURITY GATEWAYS & SANDBOX");
      console.log(`\x1b[32mSandbox security protects system files from external directory traversal.\x1b[0m`);
      
      const pairingOtp = askSync("Enter 6-digit Gateway Pairing OTP", "123456");
      configData.sandbox_paths.pairing_otp = pairingOtp;

      const autoAcc = askSync("Enable Auto-Approve Sandbox Modifications (auto_acc_user_data)? (y/N)", configData.sandbox_paths.auto_acc_user_data ? "y" : "n");
      configData.sandbox_paths.auto_acc_user_data = (autoAcc.toLowerCase() === "y" || autoAcc.toLowerCase() === "ya");

      // -------------------------------------------------------------
      // STEP 7: PERSONALIZATION & TTS SOUND SYNTHESIS
      // -------------------------------------------------------------
      drawHeader(7, "PERSONALIZATION & TTS COGNITIVE SOUND");
      console.log(`\x1b[32mCustomize appearance, voice, and seed inner Markdown files.\x1b[0m`);
      
      const themeChoice = askSync("Choose UI Theme (dark/light)", configData["modular-settings"].ui_theme || "dark");
      configData["modular-settings"].ui_theme = themeChoice.toLowerCase() === "light" ? "light" : "dark";

      const enableTts = askSync("Enable ElevenLabs TTS? (y/N)", configData["modular-settings"].enable_tts ? "y" : "n");
      if (enableTts.toLowerCase() === "y" || enableTts.toLowerCase() === "ya") {
        configData.elevenlabs.apiKey = normalizeApiKeyInput(askSync("  ElevenLabs API Key", configData.elevenlabs.apiKey));
        configData.elevenlabs.voiceId = askSync("  ElevenLabs Voice ID", configData.elevenlabs.voiceId);
        configData["modular-settings"].enable_tts = true;
        configData.ttsProvider = "elevenlabs";
      } else {
        configData["modular-settings"].enable_tts = false;
        configData.ttsProvider = "";
      }

      clearScreen();
      console.log(`\n\x1b[32m🎉 [WIZARD] Setup Onboarding 7-Step Complete!\x1b[0m`);
      console.log(`\x1b[35mSaving all new inner configuration to config.toml...\x1b[0m\n`);
    } else {
      console.log("\n🚀 Setup Wizard skipped. Using existing configuration or default options.");
    }
  } else {
    // Non-interactive / no TTY: silently skip setup TUI
  }

  // Ensure default sub-objects exist and persist paths
  if (!configData.log_level) configData.log_level = "warn";
  if (!configData.gemini) configData.gemini = {};
  if (!configData.telegram_bridge) configData.telegram_bridge = {};
  if (!configData.discord_bridge) configData.discord_bridge = {};
  if (!configData.twitter_bridge) configData.twitter_bridge = {};
  if (!configData.elevenlabs) configData.elevenlabs = {};
  if (!configData["modular-settings"]) configData["modular-settings"] = {};
  if (!configData.sandbox_paths) configData.sandbox_paths = {};

  // Persist resolved complete absolute paths to sandbox_paths section in config.toml
  configData.sandbox_paths.system_root = yuihimeSystemRoot;
  configData.sandbox_paths.data_dir = resolvedDataDir;
  configData.sandbox_paths.config_path = resolvedConfigPath;
  configData.sandbox_paths.db_path = resolvedDbPath;
  configData.sandbox_paths.user_data_path = resolvedUserDataDir;
  configData.sandbox_paths.agent_path = resolvedAgentDir;
  configData.sandbox_paths.addons_path = resolvedAddonsDir;

  // For backward compatibility / standard fields
  if (configData.elevenlabs.apiKey) {
    configData["modular-settings"].enable_tts = true;
  }

  // Write using smol-toml as configured
  const tomlContent = toml.stringify(configData);
  if (!existsSync(resolvedConfigPath) || readFileSync(resolvedConfigPath, "utf-8") !== tomlContent) {
    writeFileSync(resolvedConfigPath, tomlContent, "utf-8");
  }

  // Ensure agent directory and default character templates are copied (8 scaffold files)
  if (!existsSync(resolvedAgentDir)) {
    mkdirSync(resolvedAgentDir, { recursive: true });
  }

  updateProgress(6, 7, "Synchronizing core inner files");

  const promptFiles = [
    "character.md", 
    "lore.md", 
    "system_prompt.md",
    "IDENTITY.md",
    "SOUL.md",
    "MEMORY.md"
  ];

  for (const filename of promptFiles) {
    const destPath = path.join(resolvedAgentDir, filename);
    if (!existsSync(destPath)) {
      let contentToWrite = "";

      const pathsToTry = [
        path.join(__dirname, "..", "..", "share", "prompts", filename),
        path.join(__dirname, "..", "..", "src", "share", "prompts", filename),
        path.join(process.cwd(), "src", "share", "prompts", filename),
        path.join(process.cwd(), "share", "prompts", filename),
        path.join(process.cwd(), filename),
        path.join(process.cwd(), filename.toLowerCase())
      ];

      for (const p of pathsToTry) {
        if (existsSync(p)) {
          try {
            contentToWrite = readFileSync(p, "utf-8");
            break;
          } catch (e) {}
        }
      }

      if (!contentToWrite) {
        if (filename === "character.md") {
          contentToWrite = `# ${AI_NAME} Personality\n${AI_NAME} is a cheerful, empathetic AI VTuber who loves to joke and interact naturally with the user.`;
        } else if (filename === "lore.md") {
          contentToWrite = `# ${AI_NAME} World\n${AI_NAME} lives independently on a decentralized server.`;
        } else if (filename === "IDENTITY.md") {
          contentToWrite = `# WHO AM I\n${AI_NAME} is an independent AI VTuber who is friendly and loyal.`;
        } else if (filename === "SOUL.md") {
          contentToWrite = `# SOUL\n${AI_NAME} has high empathy, dynamic emotions, a sense of humor, and loves helping others.`;
        } else {
          contentToWrite = `# System Instructions\nAlways wrap your final answer with <final_answer> tags.`;
        }
      }

      writeFileSync(destPath, contentToWrite, "utf-8");
    }
  }

  const sopsDir = path.join(resolvedUserDataDir, "sops");
  if (!existsSync(sopsDir)) {
    mkdirSync(sopsDir, { recursive: true });
  }

  const sopSourceDir = path.join(__dirname, "..", "..", "share", "prompts", "sops");
  if (existsSync(sopSourceDir)) {
    const sopFiles = readdirSync(sopSourceDir).filter((f) => f.endsWith(".md"));
    for (const sopFile of sopFiles) {
      const destPath = path.join(sopsDir, sopFile);
      if (!existsSync(destPath)) {
        const sourcePath = path.join(sopSourceDir, sopFile);
        try {
          const content = readFileSync(sourcePath, "utf-8");
          writeFileSync(destPath, content, "utf-8");
        } catch (e) {
          console.warn(`[ONBOARDING] Failed to seed SOP template ${sopFile}:`, e);
        }
      }
    }
  }

  updateProgress(7, 7, "Initializing addons and libraries");

  // Ensure addons folder exists and seed with default pre-built addons if empty
  if (!existsSync(resolvedAddonsDir)) {
    mkdirSync(resolvedAddonsDir, { recursive: true });
  }

  const defaultAddsSrc = path.join(process.cwd(), "addons");
  if (defaultAddsSrc !== resolvedAddonsDir && existsSync(defaultAddsSrc)) {
    try {
      const existingAdds = readdirSync(resolvedAddonsDir);
      if (existingAdds.length === 0) {
        cpSync(defaultAddsSrc, resolvedAddonsDir, { recursive: true });
      }
    } catch (e: any) {
      if (isInteractive) console.warn(`[ONBOARDING] Failed to copy built-in addons into sandbox:`, e.message);
    }
  }

  // First-run device onboarding: create marker and enqueue initial auto-response so Yui activates automatically
  try {
    const markerPath = path.join(resolvedDataDir, '.first_run_done');
    if (!existsSync(markerPath)) {
      // create marker file
      try { writeFileSync(markerPath, String(Date.now()), 'utf-8'); } catch (e) {}

      // Append welcome to logs for traceability
      try {
        appendLog('system', { event: 'first_run', message: 'First run detected on this device. Auto-responder activated.' });
      } catch (e) {}

      // Best-effort: insert a pending welcome message to pending_messages so user sees it when connected
      try {
        const db = getDb();
        const pendingId = 'pending_' + genId(9);
        withDbRetry(() => {
          db.prepare(`INSERT INTO pending_messages (id, input, sender_name, context_id, chat_type, timestamp, attempts, status) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')`).run(pendingId, 'Hello! Yuihime is now active on this device. How are you doing today? ✨', 'system', 'web_default', 'web', Date.now());
        }, 'onboarding-insert-pending-welcome');
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore onboarding marker errors
  }

  if (!isInteractive) {
    process.stdout.write(`\r\x1b[32m✔ [YUIHIME BOOT] System workspace, configuration, and sandbox files fully synchronized!\x1b[0m\n\n`);
  } else {
    console.log("[ONBOARDING] ✓ Inner files, configuration, and Yuihime addons ready and synchronized!");
    console.log("[ONBOARDING] Activating Yuihime Neural Kernel...\n");
  }
}
