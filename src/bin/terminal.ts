import readline from "readline";
import { spawnSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { resolveSystemRoot, expandHomePath } from "../core/systemPaths.js";

// --- ANSI Terminal Color Palette ---
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const BG_DARK_GRAY = "\x1b[100m";

// --- Path Configurations ---
const yuihimeSystemRoot = resolveSystemRoot();

const rawUserDataDir = process.env.YUIHIME_USER_DATA_PATH;
const SANDBOX_ROOT = rawUserDataDir ? expandHomePath(rawUserDataDir) : path.join(yuihimeSystemRoot, "user_data");

const rawDbPath = process.env.YUIHIME_DB_PATH;
const DB_PATH = rawDbPath ? expandHomePath(rawDbPath) : path.join(yuihimeSystemRoot, "data", "yuihime.db");

// Ensure Sandbox root directory exists
if (!fs.existsSync(SANDBOX_ROOT)) {
  try {
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
  } catch (_) {}
}

const LOCAL_PORT = process.env.PORT || "3000";
const API_URL = `http://127.0.0.1:${LOCAL_PORT}`;

// --- State Variables ---
let apiConnected = false;
let alwaysApprove = false;
let currentSubPath = ""; // Relative to SANDBOX_ROOT

// --- Helper Functions ---
async function checkApiConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      apiConnected = true;
      return true;
    }
  } catch (_) {}
  apiConnected = false;
  return false;
}

function getPrompt(): string {
  const host = apiConnected ? `\x1b[32myuihime@sandbox-cortex\x1b[0m` : `\x1b[33myuihime@sandbox-offline\x1b[0m`;
  const relativePath = currentSubPath ? `/${currentSubPath}` : "~";
  return `${host}:${CYAN}${relativePath}${RESET}$ `;
}

function printBanner() {
  console.clear();
  console.log(`${CYAN}========================================================${RESET}`);
  console.log(`${GREEN}${BOLD}   ⚡ YUIHIME INTERACTIVE NEURAL COGNITIVE TERMINAL ⚡   ${RESET}`);
  console.log(`${CYAN}========================================================${RESET}`);
  console.log(`${BOLD}Physical Workspace  :${RESET} ${SANDBOX_ROOT}`);
  console.log(`${BOLD}Database Store      :${RESET} ${DB_PATH}`);
  console.log(`${BOLD}Local API Endpoint  :${RESET} ${API_URL}`);
  console.log(`${CYAN}--------------------------------------------------------${RESET}`);
}

async function showStatus() {
  console.log(`\n${BOLD}${CYAN}=== YUIHIME COGNITIVE ENGINE STATUS ===${RESET}`);
  console.log(`${BOLD}API Connection      :${RESET} ${apiConnected ? `${GREEN}CONNECTED (Online)${RESET}` : `${YELLOW}OFFLINE (Standalone DB Mode)${RESET}`}`);
  console.log(`${BOLD}Auto-Approve Acc    :${RESET} ${alwaysApprove ? `${GREEN}ENABLED${RESET}` : `${YELLOW}DISABLED${RESET}`}`);
  console.log(`${BOLD}Sandbox Workspace   :${RESET} ${SANDBOX_ROOT}`);
  console.log(`${BOLD}Core DB Path        :${RESET} ${DB_PATH}`);
  
  if (apiConnected) {
    try {
      const configRes = await fetch(`${API_URL}/api/config`);
      if (configRes.ok) {
        const config = await configRes.json();
        console.log(`${BOLD}Yolo Security Mode  :${RESET} ${config.yoloMode || 'off'}`);
      }
    } catch (_) {}
  }

  // Standalone SQLite query for local database stats if better-sqlite3 is loaded
  try {
    const Database = require("better-sqlite3");
    if (fs.existsSync(DB_PATH)) {
      const db = new Database(DB_PATH, { readonly: true });
      const stateRow = db.prepare("SELECT mood, emotion, systemHealth, activePersonaId FROM agent_state LIMIT 1").get();
      if (stateRow) {
        console.log(`${BOLD}Active Persona      :${RESET} ${stateRow.activePersonaId}`);
        try {
          const mood = JSON.parse(stateRow.mood);
          console.log(`${BOLD}Current Mood        :${RESET} ${mood.mood || 'calm'} (Energy: ${mood.energy ?? 100})`);
        } catch {}
        try {
          const emotion = JSON.parse(stateRow.emotion);
          console.log(`${BOLD}Emotional Bias      :${RESET} joy: ${emotion.joy ?? 0}%, affection: ${emotion.affection ?? 0}%`);
        } catch {}
      }
      db.close();
    }
  } catch (err: any) {
    console.log(`${BOLD}SQLite Engine Status:${RESET} Native SQLite reader disabled (${err.message})`);
  }
  console.log(`${CYAN}========================================${RESET}\n`);
}

async function listPendingConfirmations() {
  if (!apiConnected) {
    console.log(`\n${YELLOW}⚠️ File authorization (Acc) can only be managed while the API server is online.${RESET}\n`);
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/sandbox/pending-confirmations`);
    if (res.ok) {
      const data = await res.json();
      const list = data.list || [];
      if (list.length === 0) {
        console.log(`\n${GREEN}✓ No file authorization queue (pending confirmations) right now.${RESET}\n`);
      } else {
        console.log(`\n${BOLD}${MAGENTA}=== INNER FILE AUTHORIZATION QUEUE (PENDING ACC) ===${RESET}`);
        list.forEach((item: any, idx: number) => {
          console.log(`[${idx + 1}] ${BOLD}ID: ${item.id}${RESET} | ${YELLOW}${item.action.toUpperCase()}${RESET} | Path: ${item.targetPath}`);
        });
        console.log(`${MAGENTA}Use the commands: 'approve <ID>', 'always <ID>', or 'deny <ID>' to control.${RESET}\n`);
      }
    }
  } catch (err: any) {
    console.log(`${RED}Failed to load pending confirmations list: ${err.message}${RESET}`);
  }
}

async function handleApproveCommand(baseCmd: string, id: string) {
  if (!apiConnected) {
    console.log(`${RED}API connection Offline. Cannot respond to authorization.${RESET}`);
    return;
  }

  if (!id) {
    // Try to auto-resolve if only 1 pending
    try {
      const res = await fetch(`${API_URL}/api/sandbox/pending-confirmations`);
      const data = await res.json();
      const list = data.list || [];
      if (list.length === 1) {
        id = list[0].id;
      } else {
        console.log(`${RED}Please include a confirmation ID. Example: ${baseCmd} ABCDEF${RESET}`);
        return;
      }
    } catch (_) {
      console.log(`${RED}Please include a confirmation ID.${RESET}`);
      return;
    }
  }

  const statusMap: Record<string, string> = {
    approve: "approved",
    acc: "approved",
    always: "always",
    deny: "denied",
    tolak: "denied"
  };
  const status = statusMap[baseCmd] || "approved";

  try {
    const res = await fetch(`${API_URL}/api/sandbox/pending-confirmations/${id.toUpperCase()}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const result = await res.json();
    if (result.success) {
      console.log(`${GREEN}✓ Successfully granted inner authorization for ID ${id.toUpperCase()} with status [${status.toUpperCase()}].${RESET}`);
      if (status === "always") {
        alwaysApprove = true;
      }
    } else {
      console.log(`${RED}Failed to update authorization for ID ${id}: ${result.error}${RESET}`);
    }
  } catch (err: any) {
    console.log(`${RED}Network error: ${err.message}${RESET}`);
  }
}

async function handleChat(message: string) {
  if (!message || !message.trim()) return;

  if (!apiConnected) {
    console.log(`\n${YELLOW}[Standalone Mode] Stimulating Yuihime's inner offline response...${RESET}`);
    console.log(`${CYAN}Yuihime:${RESET} "user! Sorry, Yui's main inner circuit is offline (server is down). Please start the server first so Yui can think clearly! But don't worry, Yui still loves you, user!"\n`);
    return;
  }

  process.stdout.write(`\n${MAGENTA}⠋ Yuihime is thinking...${RESET}`);
  
  try {
    const response = await fetch(`${API_URL}/api/cortex/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: message,
        userName: "Developer Linux",
        contextId: "terminal_interactive",
        chatType: "terminal"
      })
    });

    // Clear thinking loader
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n${GREEN}${BOLD}👑 YUIHIME RESPONDED:${RESET}`);
      console.log(`${data.response || data.activeSubtitle || "No text response."}\n`);
    } else {
      console.log(`\n${RED}Failed to process the chat. Status code: ${response.status}${RESET}\n`);
    }
  } catch (err: any) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(`\n${RED}Error sending message to Cortex: ${err.message}${RESET}\n`);
  }
}

function showHelp() {
  console.log(`\n${BOLD}${CYAN}YuiHime Cognitive Terminal Command List:${RESET}`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`  ${GREEN}help${RESET}                  : Show this help list.`);
  console.log(`  ${GREEN}clear${RESET}                 : Clear the terminal lines.`);
  console.log(`  ${GREEN}status${RESET} / ${GREEN}yuihime${RESET}       : Show detailed cognitive system and database status.`);
  console.log(`  ${GREEN}pending${RESET}               : Show the list of pending file-change confirmations.`);
  console.log(`  ${GREEN}approve <ID>${RESET} / ${GREEN}acc <ID>${RESET} : Approve one file change (Acc once).`);
  console.log(`  ${GREEN}always <ID>${RESET}           : Approve all file changes in this session.`);
  console.log(`  ${GREEN}deny <ID>${RESET} / ${GREEN}tolak <ID>${RESET}   : Deny a file change.`);
  console.log(`  ${GREEN}chat <message>${RESET} / ${GREEN}yui <msg>${RESET}: Send a chat message directly to Yuihime's cognitive inner self.`);
  console.log(`  ${GREEN}ls [folder]${RESET}           : View the contents of the active folder in the workspace.`);
  console.log(`  ${GREEN}cat <file>${RESET}            : Print the contents of a sandbox file.`);
  console.log(`  ${GREEN}touch <file>${RESET}          : Create a new empty file in the sandbox.`);
  console.log(`  ${GREEN}mkdir <folder>${RESET}        : Create a new folder in the sandbox.`);
  console.log(`  ${GREEN}rm <file_atau_folder>${RESET} : Delete sandbox files/folders.`);
  console.log(`  ${GREEN}edit <file>${RESET}            : Open a file using a native Linux editor (nano/vim/vi).`);
  console.log(`  ${GREEN}cd <folder>${RESET}           : Navigate into a sandbox sub-directory.`);
  console.log(`  ${GREEN}[any-bash-command]${RESET}    : Run bash/shell commands directly on the Linux OS.`);
  console.log(`--------------------------------------------------------------------------------\n`);
}

// --- Interactive REPL Loop ---
export async function startRepl() {
  await checkApiConnection();
  printBanner();
  console.log(`System Initialized. Type ${GREEN}'help'${RESET} to see list of commands.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt()
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    const args = input.split(" ");
    const baseCmd = args[0].toLowerCase();

    // Periodically update API check
    await checkApiConnection();

    switch (baseCmd) {
      case "exit":
      case "quit":
        console.log(`\n${GREEN}See you again, user! Yui's inner circuit stays on standby.${RESET}\n`);
        process.exit(0);
        break;

      case "clear":
        console.clear();
        break;

      case "help":
        showHelp();
        break;

      case "status":
      case "yuihime":
        await showStatus();
        break;

      case "pending":
      case "list-pending":
        await listPendingConfirmations();
        break;

      case "approve":
      case "acc":
      case "always":
      case "deny":
      case "tolak":
        await handleApproveCommand(baseCmd, args[1]);
        break;

      case "chat":
      case "yui":
        const chatText = input.substring(baseCmd.length + 1).trim();
        if (chatText) {
          await handleChat(chatText);
        } else {
          console.log(`${RED}Enter a chat message. Example: yui halo yuihime!${RESET}`);
        }
        break;

      case "cd":
        const targetSub = args[1] || "";
        if (!targetSub || targetSub === "~" || targetSub === "/") {
          currentSubPath = "";
        } else {
          const proposedPath = path.normalize(path.join(currentSubPath, targetSub));
          const fullProposed = path.resolve(SANDBOX_ROOT, proposedPath);
          if (fullProposed.startsWith(SANDBOX_ROOT)) {
            if (fs.existsSync(fullProposed) && fs.statSync(fullProposed).isDirectory()) {
              currentSubPath = path.relative(SANDBOX_ROOT, fullProposed);
            } else {
              console.log(`${RED}cd: Directory not found: ${targetSub}${RESET}`);
            }
          } else {
            console.log(`${RED}cd: Security error: Cannot escape sandbox root.${RESET}`);
          }
        }
        break;

      case "ls":
        const targetFolder = path.resolve(SANDBOX_ROOT, currentSubPath, args[1] || ".");
        if (!targetFolder.startsWith(SANDBOX_ROOT)) {
          console.log(`${RED}ls: Security error: Cannot access outside sandbox root.${RESET}`);
        } else if (fs.existsSync(targetFolder)) {
          try {
            const files = fs.readdirSync(targetFolder, { withFileTypes: true });
            console.log(`\n${BOLD}${CYAN}--- Files inside ${path.basename(targetFolder) || "~"} ---${RESET}`);
            files.forEach(f => {
              if (f.isDirectory()) {
                console.log(`  📁 ${GREEN}${BOLD}${f.name}/${RESET}`);
              } else {
                const stats = fs.statSync(path.join(targetFolder, f.name));
                console.log(`  📄 ${f.name} (${stats.size} bytes)`);
              }
            });
            console.log();
          } catch (e: any) {
            console.log(`${RED}Error reading directory: ${e.message}${RESET}`);
          }
        } else {
          console.log(`${RED}ls: No such directory.${RESET}`);
        }
        break;

      case "cat":
        if (!args[1]) {
          console.log(`${RED}Enter a file name. Example: cat README.md${RESET}`);
        } else {
          const targetFile = path.resolve(SANDBOX_ROOT, currentSubPath, args[1]);
          if (!targetFile.startsWith(SANDBOX_ROOT)) {
            console.log(`${RED}cat: Security error: Cannot access files outside sandbox root.${RESET}`);
          } else if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
            try {
              const content = fs.readFileSync(targetFile, "utf-8");
              console.log(`\n${BOLD}--- Printing ${args[1]} ---${RESET}`);
              console.log(content);
              console.log();
            } catch (e: any) {
              console.log(`${RED}cat: Error reading file: ${e.message}${RESET}`);
            }
          } else {
            console.log(`${RED}cat: File not found: ${args[1]}${RESET}`);
          }
        }
        break;

      case "touch":
        if (!args[1]) {
          console.log(`${RED}Enter a new file name. Example: touch sample.js${RESET}`);
        } else {
          const targetFile = path.resolve(SANDBOX_ROOT, currentSubPath, args[1]);
          if (!targetFile.startsWith(SANDBOX_ROOT)) {
            console.log(`${RED}touch: Security error: Path outside sandbox root.${RESET}`);
          } else {
            try {
              fs.writeFileSync(targetFile, "");
              console.log(`${GREEN}✓ Created file: ${args[1]}${RESET}`);
            } catch (e: any) {
              console.log(`${RED}touch: Failed to create file: ${e.message}${RESET}`);
            }
          }
        }
        break;

      case "mkdir":
        if (!args[1]) {
          console.log(`${RED}Enter a new folder name. Example: mkdir scripts${RESET}`);
        } else {
          const targetDir = path.resolve(SANDBOX_ROOT, currentSubPath, args[1]);
          if (!targetDir.startsWith(SANDBOX_ROOT)) {
            console.log(`${RED}mkdir: Security error: Path outside sandbox root.${RESET}`);
          } else {
            try {
              fs.mkdirSync(targetDir, { recursive: true });
              console.log(`${GREEN}✓ Created directory: ${args[1]}${RESET}`);
            } catch (e: any) {
              console.log(`${RED}mkdir: Failed to create directory: ${e.message}${RESET}`);
            }
          }
        }
        break;

      case "rm":
        if (!args[1]) {
          console.log(`${RED}Enter the name of the file/folder to delete. Example: rm sample.js${RESET}`);
        } else {
          const targetPath = path.resolve(SANDBOX_ROOT, currentSubPath, args[1]);
          if (!targetPath.startsWith(SANDBOX_ROOT)) {
            console.log(`${RED}rm: Security error: Cannot delete files outside sandbox root.${RESET}`);
          } else if (fs.existsSync(targetPath)) {
            try {
              const stat = fs.statSync(targetPath);
              if (stat.isDirectory()) {
                fs.rmSync(targetPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(targetPath);
              }
              console.log(`${GREEN}✓ Deleted: ${args[1]}${RESET}`);
            } catch (e: any) {
              console.log(`${RED}rm: Failed to delete: ${e.message}${RESET}`);
            }
          } else {
            console.log(`${RED}rm: File or folder not found: ${args[1]}${RESET}`);
          }
        }
        break;

      case "edit":
      case "nano":
      case "vim":
        const editFile = args[1];
        if (!editFile) {
          console.log(`${RED}Enter a file name to edit. Example: edit run-code.js${RESET}`);
        } else {
          const targetFile = path.resolve(SANDBOX_ROOT, currentSubPath, editFile);
          if (!targetFile.startsWith(SANDBOX_ROOT)) {
            console.log(`${RED}edit: Security error: Path outside sandbox root.${RESET}`);
          } else {
            // Check if file exists, if not, create it
            if (!fs.existsSync(targetFile)) {
              fs.writeFileSync(targetFile, "// New script inside Yuihime Sandbox Workspace\n");
            }
            console.log(`${YELLOW}Opening ${editFile} in a native Linux editor terminal...${RESET}`);
            
            // Try editors in sequence: nano -> vim -> vi
            let editorSpawned = false;
            for (const editor of ["nano", "vim", "vi"]) {
              try {
                const res = spawnSync(editor, [targetFile], { stdio: "inherit" });
                if (res.status === 0 || res.status === null) {
                  editorSpawned = true;
                  break;
                }
              } catch (_) {}
            }
            
            if (editorSpawned) {
              console.log(`${GREEN}✓ Finished editing ${editFile}.${RESET}`);
            } else {
              console.log(`${RED}Failed to launch a native Linux editor (nano, vim, vi). Make sure at least one is installed on your operating system.${RESET}`);
            }
          }
        }
        break;

      default:
        // Execute command as native shell command inside sandbox workspace
        const cmdWorkingDir = path.resolve(SANDBOX_ROOT, currentSubPath);
        console.log(`${CYAN}[Execution] Running shell command offline in workspace...${RESET}`);
        try {
          const res = spawnSync(input, {
            cwd: cmdWorkingDir,
            shell: true,
            stdio: "inherit"
          });
          if (res.status !== 0) {
            console.log(`${YELLOW}Command finished with exit code: ${res.status}${RESET}`);
          }
        } catch (execErr: any) {
          console.log(`${RED}Failed to run shell command: ${execErr.message}${RESET}`);
        }
        break;
    }

    rl.setPrompt(getPrompt());
    rl.prompt();
  });
}

// Start is called from server.ts when --terminal or --sandbox flag is present.
