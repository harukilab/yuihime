import { Kernel } from "../kernel/core.js";
import { MultiChannelQueue } from "../kernel/MultiChannelQueue.js";
import { initializeDatabase } from "../database.js";

let db: any = null;
export let activeTwitterInterval: any = null;
export let activeTwitterToken: string | null = null;

export async function initializeTwitter(activeDb?: any, force = false) {
  if (activeDb) {
    db = activeDb;
  } else if (!db) {
    db = initializeDatabase();
  }

  const settings = Kernel.getInstance().getSettings().getAll();
  const isEnabled = settings['twitter_bridge']?.enabled !== false;
  const apiKey = settings['twitter_bridge']?.apiKey || process.env.TWITTER_API_KEY;

  if (!apiKey || !isEnabled) {
    if (activeTwitterInterval) {
      console.log("[TWITTER] Twitter Neural Link dinonaktifkan atau API Key kosong. Menghentikan Twitter Daemon...");
      clearInterval(activeTwitterInterval);
      activeTwitterInterval = null;
      activeTwitterToken = null;
    }
    return;
  }

  if (activeTwitterInterval && activeTwitterToken === apiKey && !force) {
    return;
  }

  if (activeTwitterInterval) {
    clearInterval(activeTwitterInterval);
  }

  activeTwitterToken = apiKey;
  console.log("[TWITTER] Memulai Twitter (X) Neural Link daemon...");

  // Twitter polling simulation or webhook sync helper
  activeTwitterInterval = setInterval(async () => {
    try {
      console.log("[TWITTER] Memeriksa mention atau utas (thread) baru di Twitter...");
      // For standard Twitter, it can poll mentions or process direct messages under user credentials.
      // Since Twitter api v2 is heavily gatekept, we log a status here and let the developer replace with custom twitter clients if desired.
    } catch (e: any) {
      console.error("[TWITTER_DAEMON_ERROR]", e.message || e);
    }
  }, 120000); // 2 menit sekali
}
