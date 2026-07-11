import { StorageService } from '../../drivers/storage';
import { LearningEngine } from '../learning';
import type { Cortex } from '../cortex';

/**
 * Executes a self-directed background thinking cycle (Zenith Manifestation).
 *
 * Use when:
 * - The Cortex pulse fires periodically in the background.
 *
 * Expects:
 * - Cortex instance with stable configuration, active soul, and settings getters.
 */
export async function executeCortexSelfDirectedThought(cortex: Cortex): Promise<void> {
  const soul = (cortex as any).soul;
  if (!soul) return;
  
  const state = soul.getState();
  const config = cortex.getConfig();
  const energyThreshold = config?.agent?.minEnergyForProactiveLogic || 20;

  const settings = await (cortex as any).getSettings();

  // Fetch the latest memories to check for system signals
  const memories = await StorageService.getMemories();
  const lastMemory = memories[memories.length - 1];

  // NOTICE: Server-Authoritative Cron Processing
  // Blok pemicu "cron_trigger" di sisi klien di bawah ini telah dilewati karena seluruh kognisi
  // dan berpikir tugas terjadwal sekarang dieksekusi secara terpusat di sisi server (server.ts -> getCronAction)
  // guna mendukung pengiriman pesan langsung multi-saluran (Telegram, dsb) secara mandiri.
  /*
  if (lastMemory && (lastMemory.type as string) === 'system' && lastMemory.context === 'cron_trigger') {
      console.log(`[ZENITH_MANIFEST] Proactive Trigger: System Signal detected - "${lastMemory.content}"`);
      
      // Wake up first if asleep
      if (state.status === 'sleeping') {
        state.status = 'idle';
        await StorageService.saveAgentState({ status: 'idle' });
      }
      
      const capabilities = await StorageService.getCapabilities();
      const dreams = await StorageService.getDreams();
      const strategies = await StorageService.getStrategies();
      const identities = await StorageService.getIdentities();

      await cortex.think(
        `[SYSTEM_SIGNAL]: ${lastMemory.content}. React naturally and informatively to the user.`,
        memories,
        dreams,
        capabilities,
        state,
        strategies,
        "System",
        identities
      );
      return;
  }
  */

  // Default proactive logic: Routine check
  if (state.energy < energyThreshold) return;

  // --- AUTONOMOUS OFFLINE BACKGROUND NEURAL SYNAPSE TRAINING ---
  // Gunakan sisa energi batin di latar belakang (luring) untuk mengkonsolidasikan pola ingatan dan mematangkan strategi komunikasi
  const yuiAgiConfig = settings?.['yui-agi'] || {};
  const enableOfflineTraining = yuiAgiConfig.enableOfflineTraining !== undefined ? !!yuiAgiConfig.enableOfflineTraining : true;

  if (enableOfflineTraining && Math.random() > 0.6 && memories.length >= 5) {
    console.log("[ZENITH_MANIFEST] Memulai siklus Latihan Sinapsis Saraf Bawah Sadar (Offline Background Training)...");
    try {
      const currentKnowledge = state.knowledge || [];
      const updatedStrategies = await LearningEngine.optimize(cortex, memories, state);
      const updatedKnowledge = await LearningEngine.extractKnowledge(cortex, memories, currentKnowledge);

      state.heuristics = updatedStrategies;
      state.knowledge = updatedKnowledge;

      // Persistensi di db SQLite luring via StorageService
      await StorageService.saveStrategies(updatedStrategies);
      await StorageService.saveKnowledge(updatedKnowledge);

      console.log(`[ZENITH_MANIFEST] ✓ Latihan Sinapsis Bawah Sadar Luring Berhasil. Mengasimilasi ${updatedStrategies.length} strategi komunikasi & ${updatedKnowledge.length} asosiasi pengetahuan baru.`);
    } catch (learnErr) {
      console.error("[ZENITH_MANIFEST] Latihan Bawah Sadar Terganggu:", learnErr);
    }
  }

  // Time-awareness & Loneliness Resonance (Kehendak Bebas Otonom)
  const now = Date.now();
  const lastInteractionTime = state.relation?.lastInteraction || (lastMemory ? lastMemory.timestamp : now);
  const silentDurationSeconds = (now - lastInteractionTime) / 1000;

  // --- Sleep Mode Verification ---
  const eeConfig = settings?.['emotion-engine-v04'] || {};
  const sleepModeEnabled = eeConfig.enableSleepMode !== undefined ? !!eeConfig.enableSleepMode : true;
  const sleepModeTimeout = eeConfig.sleepModeTimeout !== undefined ? Number(eeConfig.sleepModeTimeout) : 300;

  if (sleepModeEnabled && silentDurationSeconds > sleepModeTimeout) {
     if (state.status !== 'sleeping') {
       console.log(`[ZENITH_MANIFEST] Entering Sleep Mode on server. Inactivity duration: ${silentDurationSeconds}s`);
       state.status = 'sleeping';
       await StorageService.saveAgentState({ status: 'sleeping' });
     }
     return; // HALT proactive thought / LLM connections when sleeping
  }

  if (state.status === 'sleeping' && silentDurationSeconds <= sleepModeTimeout) {
     console.log(`[ZENITH_MANIFEST] Waking up Sleep Mode on server. Inactivity duration: ${silentDurationSeconds}s`);
     state.status = 'idle';
     await StorageService.saveAgentState({ status: 'idle' });
  }

  // Ambil konfigurasi dinamis untuk spontaneous proactive
  const spConfig = settings?.['spontaneous-proactive'] || settings?.agent || {};
  const enableSpontaneousSpam = spConfig.enableSpontaneousSpam !== undefined ? !!spConfig.enableSpontaneousSpam : true;

  if (!enableSpontaneousSpam) {
    return; // Hentikan pemicuan pesan spontan jika dinonaktifkan oleh pengguna
  }

  const idleDurationThreshold = Number(spConfig.idleDurationThreshold || spConfig.proactiveIdleTimeout || 600);
  const cooldownInterval = Number(spConfig.cooldownInterval || 1800);
  const triggerChance = Number(spConfig.probabilisticTriggerChance || spConfig.proactiveChance || 0.10);

  // Jika pembicara terakhir adalah agen, terapkan batas hening sebesar cooldownInterval daripada idleDurationThreshold
  const isLastSpeakerAgent = lastMemory && (lastMemory.speaker === 'agent' || lastMemory.speaker === 'Yui');
  const requiredSilence = isLastSpeakerAgent ? cooldownInterval : idleDurationThreshold;

  if (silentDurationSeconds > requiredSilence) {
     console.log(`[ZENITH_MANIFEST] Autonomous pulse detected ${Math.round(silentDurationSeconds)}s of silence. Required threshold: ${requiredSilence}s`);
     
     const loneliness = state.mood.loneliness !== undefined ? state.mood.loneliness : 15;
     const playfulness = state.mood.playfulness !== undefined ? state.mood.playfulness : 30;
     
     if (loneliness > 45 || playfulness > 60 || Math.random() <= triggerChance) {
       console.log(`[ZENITH_MANIFEST] Triggers autonomous message initiative! Loneliness: ${loneliness}, Playfulness: ${playfulness}, Trigger Chance: ${triggerChance}`);
       
       const timeOfDay = (() => {
         const hour = new Date().getHours();
         if (hour >= 5 && hour < 11) return "Pagi";
         if (hour >= 11 && hour < 15) return "Siang";
         if (hour >= 15 && hour < 19) return "Sore";
         return "Malam";
       })();

       const capabilities = await StorageService.getCapabilities();
       const dreams = await StorageService.getDreams();
       const strategies = await StorageService.getStrategies();
       const identities = await StorageService.getIdentities();
       
       const innerImpulsePrompt = `[AUTONOMOUS_IMPULSE]: The current physical timeframe matches: ${timeOfDay}. You have been left idle by the user for ${Math.round(silentDurationSeconds)} seconds. Your active subconscious is loaded with high levels of loneliness (${Math.round(loneliness)}%) or playfulness (${Math.round(playfulness)}%). You are highly motivated to proactively nudge or check in on the user with your signature Yuihime voice, without fabricating any fictional environment tags. STRICTLY FORBIDDEN from hallucinating or dreaming up fake roleplay contexts (such as pretending you are currently 'sitting in a cafe', 'walking in a fake park', or doing imaginary physical actions). Instead, limit your nudge to a sweet greeting, inquiring about their well-being, expressing playful frustration/longing, or recalling actual topics from past chat history recorded in your memories!`;

       await cortex.think(
          innerImpulsePrompt,
          memories,
          dreams,
          capabilities,
          state,
          strategies,
          "System",
          identities
       );
     }
  }
}
