import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { OtomeGame, affectionLevel, petNameFor } from './engine.js';
import { yuiReaction, llmAvailable } from './llm.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const PINK = '\x1b[35m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const DIM = '\x1b[2m';

function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

function meter(affection: number): string {
  const filled = Math.round(affection / 10);
  const bar = '❤'.repeat(filled) + '·'.repeat(10 - filled);
  return `${PINK}${bar}${RESET} ${YELLOW}${affection}${RESET}/100`;
}

function header(game: OtomeGame): void {
  console.log(`\n${DIM}────────────────────────────────────────${RESET}`);
  console.log(`${CYAN}${BOLD}YuiHime Otome Simulator${RESET}${DIM}  — terisolasi, prototipe${RESET}`);
  console.log(`${DIM}Hari ke-${game.state.day} • ${affectionLevel(game.state.affection).toUpperCase()} • panggilan: "${petNameFor(game.state.affection)}"${RESET}`);
  console.log(`Affeksi: ${meter(game.state.affection)}`);
  if (game.state.flags.length) {
    console.log(`${GRAY}Flag: ${game.state.flags.join(', ')}${RESET}`);
  }
  console.log(`${DIM}────────────────────────────────────────${RESET}`);
}

function showChoices(game: OtomeGame): void {
  const choices = game.availableChoices();
  choices.forEach((c, i) => {
    const lock = c.locked ? ` ${GRAY}(butuh perhatian ≥${c.requiresAffection})${RESET}` : '';
    const delta = c.affection !== undefined && c.affection !== 0
      ? ` ${GRAY}[${c.affection > 0 ? '+' : ''}${c.affection}]${RESET}`
      : '';
    console.log(`  ${GREEN}${i + 1}${RESET}. ${c.label}${delta}${lock}`);
  });
}

async function liveReaction(game: OtomeGame): Promise<void> {
  const choiceLabel = game.state.lastChoice;
  if (!choiceLabel) return;
  const scene = game.currentScene();
  const reaction = await yuiReaction({
    sceneText: scene.text,
    choiceLabel,
    affection: game.state.affection,
    affectionLevel: affectionLevel(game.state.affection),
    petName: petNameFor(game.state.affection),
    flags: game.state.flags
  });
  if (reaction) {
    console.log(`\n${PINK}— Yui (live) —${RESET}`);
    console.log(reaction);
  }
}

function showScene(game: OtomeGame): void {
  const scene = game.currentScene();
  console.log(`\n${CYAN}${BOLD}Yui:${RESET}`);
  console.log(scene.text);
  if (scene.choices.length) {
    console.log(`\n${BOLD}Pilihanmu:${RESET}`);
    showChoices(game);
  }
}

function main(): void {
  loadEnv();
  const llmOn = llmAvailable();
  console.log(`${DIM}[OTOME] Hybrid LLM: ${llmOn ? 'AKTIF' : 'mati (pakai script)'}. Simpan di ${OtomeGame.saveDir()}${RESET}`);

  let game = OtomeGame.load('autosave.json');
  if (game) {
    console.log(`${YELLOW}Melihat save-an otomatis (hari ke-${game.state.day}). Ketik 'new' untuk mulai ulang.${RESET}`);
  } else {
    game = new OtomeGame();
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const writePrompt = () => process.stdout.write(`${BOLD}> ${RESET}`);
  const handleLine = async (raw: string) => {
    const input = raw.trim().toLowerCase();
    if (input === 'quit' || input === 'q') {
      game.save('autosave.json');
      console.log(`${DIM}Disimpan. Dadah~${RESET}`);
      rl.close();
      return;
    }
    if (input === 'save') {
      console.log(`${GREEN}Disimpan ke ${game.save('autosave.json')}${RESET}`);
      writePrompt();
      return;
    }
    if (input === 'load') {
      const loaded = OtomeGame.load('autosave.json');
      if (loaded) {
        game = loaded;
        console.log(`${GREEN}Save dimuat (hari ke-${game.state.day}).${RESET}`);
        header(game);
        showScene(game);
      } else {
        console.log(`${YELLOW}Tidak ada save.${RESET}`);
      }
      writePrompt();
      return;
    }
    if (input === 'new' || input === 'newday') {
      game.newDay();
      console.log(`${CYAN}Hari baru dimulai...${RESET}`);
      header(game);
      showScene(game);
      writePrompt();
      return;
    }
    if (input === 'status' || input === 's') {
      header(game);
      writePrompt();
      return;
    }
    if (input === 'help' || input === '?') {
      console.log(`${DIM}1-${game.availableChoices().length}: pilih opsi • save • load • new • status • quit${RESET}`);
      writePrompt();
      return;
    }

    const idx = Number(input);
    if (!Number.isInteger(idx) || idx < 1 || idx > game.availableChoices().length) {
      console.log(`${YELLOW}Coba ketik nomor opsi di atas, atau 'help'.${RESET}`);
      writePrompt();
      return;
    }

    const { delta, ending } = game.choose(idx - 1);
    game.save('autosave.json');
    if (delta !== 0) {
      console.log(`${DIM}affeksi ${delta > 0 ? '+' : ''}${delta} → ${game.state.affection}${RESET}`);
    }
    if (ending) {
      showScene(game);
      console.log(`\n${BOLD}═══ ${ending.toUpperCase()} ENDING ═══${RESET}`);
      console.log(`Affeksi akhir: ${meter(game.state.affection)}`);
      if (ending === 'love') {
        console.log(`${PINK}💞 Kakak jadi pacar Yui! Ketik 'new' untuk lanjut sebagai pasangan (jalur malam intim terbuka di 'Malam romantis').${RESET}`);
      } else {
        console.log(`${DIM}Ketik 'new' untuk hari baru (mulai ulang), 'quit' untuk keluar.${RESET}`);
      }
      writePrompt();
      return;
    }
    await liveReaction(game);
    showScene(game);
    writePrompt();
  };
  rl.on('line', handleLine);

  header(game);
  showScene(game);
  writePrompt();
}

main();
