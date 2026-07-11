import readline from "readline";
import { spawnSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

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
const rootEnv = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || ".yuihime";
function resolveHomePath(inputPath: string): string {
  if (!inputPath) return "";
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}
const expandedRoot = resolveHomePath(rootEnv);
const yuihimeSystemRoot = path.isAbsolute(expandedRoot) ? expandedRoot : path.join(process.cwd(), expandedRoot);

const rawUserDataDir = process.env.YUIHIME_USER_DATA_PATH;
const SANDBOX_ROOT = rawUserDataDir ? resolveHomePath(rawUserDataDir) : path.join(yuihimeSystemRoot, "user_data");

const rawDbPath = process.env.YUIHIME_DB_PATH;
const DB_PATH = rawDbPath ? resolveHomePath(rawDbPath) : path.join(yuihimeSystemRoot, "data", "yuihime.db");

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
    console.log(`\n${YELLOW}⚠️ Otorisasi berkas (Acc) hanya dapat dikelola saat server API berjalan online.${RESET}\n`);
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/sandbox/pending-confirmations`);
    if (res.ok) {
      const data = await res.json();
      const list = data.list || [];
      if (list.length === 0) {
        console.log(`\n${GREEN}✓ Tidak ada antrean otorisasi berkas (pending confirmations) saat ini.${RESET}\n`);
      } else {
        console.log(`\n${BOLD}${MAGENTA}=== ANTREAN OTORISASI BERKAS BATIN (PENDING ACC) ===${RESET}`);
        list.forEach((item: any, idx: number) => {
          console.log(`[${idx + 1}] ${BOLD}ID: ${item.id}${RESET} | ${YELLOW}${item.action.toUpperCase()}${RESET} | Path: ${item.targetPath}`);
        });
        console.log(`${MAGENTA}Gunakan perintah: 'approve <ID>', 'always <ID>', atau 'deny <ID>' untuk mengontrol.${RESET}\n`);
      }
    }
  } catch (err: any) {
    console.log(`${RED}Gagal memuat daftar pending confirmations: ${err.message}${RESET}`);
  }
}

async function handleApproveCommand(baseCmd: string, id: string) {
  if (!apiConnected) {
    console.log(`${RED}Koneksi API Offline. Tidak dapat merespon otorisasi.${RESET}`);
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
        console.log(`${RED}Silakan sertakan ID konfirmasi. Contoh: ${baseCmd} ABCDEF${RESET}`);
        return;
      }
    } catch (_) {
      console.log(`${RED}Silakan sertakan ID konfirmasi.${RESET}`);
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
      console.log(`${GREEN}✓ Berhasil memberikan otorisasi batin untuk ID ${id.toUpperCase()} dengan status [${status.toUpperCase()}].${RESET}`);
      if (status === "always") {
        alwaysApprove = true;
      }
    } else {
      console.log(`${RED}Gagal memperbarui otorisasi untuk ID ${id}: ${result.error}${RESET}`);
    }
  } catch (err: any) {
    console.log(`${RED}Kesalahan jaringan: ${err.message}${RESET}`);
  }
}

async function handleChat(message: string) {
  if (!message || !message.trim()) return;

  if (!apiConnected) {
    console.log(`\n${YELLOW}[Standalone Mode] Menstimulasi respon batin luring Yuihime...${RESET}`);
    console.log(`${CYAN}Yuihime:${RESET} "Kakak! Maaf sirkuit utama batin Yui sedang offline (server mati). Tolong nyalakan dulu servernya agar Yui bisa berpikir jernih ya! Tapi tenang, Yui tetap menyayangi Kakak!"\n`);
    return;
  }

  process.stdout.write(`\n${MAGENTA}⠋ Yuihime sedang merenung...${RESET}`);
  
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
      console.log(`${data.response || data.activeSubtitle || "Tanpa respon teks."}\n`);
    } else {
      console.log(`\n${RED}Gagal memproses obrolan. Kode status: ${response.status}${RESET}\n`);
    }
  } catch (err: any) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(`\n${RED}Error saat mengirim pesan ke Cortex: ${err.message}${RESET}\n`);
  }
}

function showHelp() {
  console.log(`\n${BOLD}${CYAN}Daftar Perintah Terminal Kognitif YuiHime:${RESET}`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`  ${GREEN}help${RESET}                  : Tampilkan daftar bantuan ini.`);
  console.log(`  ${GREEN}clear${RESET}                 : Bersihkan baris terminal.`);
  console.log(`  ${GREEN}status${RESET} / ${GREEN}yuihime${RESET}       : Tampilkan detail status sistem kognisi dan database.`);
  console.log(`  ${GREEN}pending${RESET}               : Tampilkan daftar antrean konfirmasi perubahan berkas.`);
  console.log(`  ${GREEN}approve <ID>${RESET} / ${GREEN}acc <ID>${RESET} : Setujui satu perubahan berkas (Acc sekali).`);
  console.log(`  ${GREEN}always <ID>${RESET}           : Setujui semua perubahan berkas pada sesi ini.`);
  console.log(`  ${GREEN}deny <ID>${RESET} / ${GREEN}tolak <ID>${RESET}   : Tolak perubahan berkas.`);
  console.log(`  ${GREEN}chat <pesan>${RESET} / ${GREEN}yui <msg>${RESET}: Kirim pesan obrolan langsung ke batin kognitif Yuihime.`);
  console.log(`  ${GREEN}ls [folder]${RESET}           : Lihat isi folder aktif di workspace.`);
  console.log(`  ${GREEN}cat <file>${RESET}            : Cetak isi file sandbox.`);
  console.log(`  ${GREEN}touch <file>${RESET}          : Buat file kosong baru di sandbox.`);
  console.log(`  ${GREEN}mkdir <folder>${RESET}        : Buat folder baru di sandbox.`);
  console.log(`  ${GREEN}rm <file_atau_folder>${RESET} : Hapus berkas/folder sandbox.`);
  console.log(`  ${GREEN}edit <file>${RESET}            : Buka file menggunakan editor Linux asli (nano/vim/vi).`);
  console.log(`  ${GREEN}cd <folder>${RESET}           : Navigasi masuk ke dalam sub-direktori sandbox.`);
  console.log(`  ${GREEN}[any-bash-command]${RESET}    : Jalankan perintah bash/shell langsung ke Linux OS.`);
  console.log(`--------------------------------------------------------------------------------\n`);
}

// --- Interactive REPL Loop ---
async function startRepl() {
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
        console.log(`\n${GREEN}Sampai jumpa lagi Kakak! Sirkuit batin Yui tetap siaga.${RESET}\n`);
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
          console.log(`${RED}Masukkan pesan obrolan. Contoh: yui halo yuihime!${RESET}`);
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
          console.log(`${RED}Masukkan nama berkas. Contoh: cat README.md${RESET}`);
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
          console.log(`${RED}Masukkan nama berkas baru. Contoh: touch sample.js${RESET}`);
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
          console.log(`${RED}Masukkan nama folder baru. Contoh: mkdir scripts${RESET}`);
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
          console.log(`${RED}Masukkan nama berkas/folder yang akan dihapus. Contoh: rm sample.js${RESET}`);
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
              console.log(`${RED}rm: Gagal menghapus: ${e.message}${RESET}`);
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
          console.log(`${RED}Masukkan nama berkas untuk diedit. Contoh: edit run-code.js${RESET}`);
        } else {
          const targetFile = path.resolve(SANDBOX_ROOT, currentSubPath, editFile);
          if (!targetFile.startsWith(SANDBOX_ROOT)) {
            console.log(`${RED}edit: Security error: Path outside sandbox root.${RESET}`);
          } else {
            // Check if file exists, if not, create it
            if (!fs.existsSync(targetFile)) {
              fs.writeFileSync(targetFile, "// New script inside Yuihime Sandbox Workspace\n");
            }
            console.log(`${YELLOW}Membuka ${editFile} di terminal editor Linux asli...${RESET}`);
            
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
              console.log(`${GREEN}✓ Selesai mengedit ${editFile}.${RESET}`);
            } else {
              console.log(`${RED}Gagal memicu editor Linux asli (nano, vim, vi). Pastikan salah satunya terinstal di sistem operasi Anda.${RESET}`);
            }
          }
        }
        break;

      default:
        // Execute command as native shell command inside sandbox workspace
        const cmdWorkingDir = path.resolve(SANDBOX_ROOT, currentSubPath);
        console.log(`${CYAN}[Execution] Menjalankan perintah shell luring di workspace...${RESET}`);
        try {
          const res = spawnSync(input, {
            cwd: cmdWorkingDir,
            shell: true,
            stdio: "inherit"
          });
          if (res.status !== 0) {
            console.log(`${YELLOW}Perintah selesai dengan kode exit: ${res.status}${RESET}`);
          }
        } catch (execErr: any) {
          console.log(`${RED}Gagal menjalankan perintah shell: ${execErr.message}${RESET}`);
        }
        break;
    }

    rl.setPrompt(getPrompt());
    rl.prompt();
  });
}

// Start
startRepl();
