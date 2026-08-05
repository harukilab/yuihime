import { StorageService } from '@shared/drivers/storage';
import { LearningEngine } from '../learning';
import type { Cortex } from '../cortex';
import { getTzOffsetHours, localDaypart } from '../utils/dualClock.js';

/**
 * Executes a self-directed background thinking cycle (Cortex Background Loop).
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
  // The client-side "cron_trigger" trigger block below has been skipped because all scheduled-task
  // cognition and thinking now executes centrally on the server side (server.ts -> getCronAction)
  // to support direct multi-channel message delivery (Telegram, etc.) autonomously.
  /*
  if (lastMemory && (lastMemory.type as string) === 'system' && lastMemory.context === 'cron_trigger') {
      console.log(`[CORTEX_BG_LOOP] Proactive Trigger: System Signal detected - "${lastMemory.content}"`);
      
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
  // Use leftover inner energy in the background (offline) to consolidate memory patterns and mature communication strategies
  const yuiAgiConfig = settings?.['yui-agi'] || {};
  const enableOfflineTraining = yuiAgiConfig.enableOfflineTraining !== undefined ? !!yuiAgiConfig.enableOfflineTraining : true;

  if (enableOfflineTraining && Math.random() > 0.6 && memories.length >= 5) {
    console.log("[CORTEX_BG_LOOP] Starting Subconscious Neural Synapse Training cycle (Offline Background Training)...");
    try {
      const currentKnowledge = state.knowledge || [];
      const updatedStrategies = await LearningEngine.optimize(cortex, memories, state);
      const updatedKnowledge = await LearningEngine.extractKnowledge(cortex, memories, currentKnowledge);

      state.heuristics = updatedStrategies;
      state.knowledge = updatedKnowledge;

      // Persist to the offline SQLite db via StorageService
      await StorageService.saveStrategies(updatedStrategies);
      await StorageService.saveKnowledge(updatedKnowledge);

      console.log(`[CORTEX_BG_LOOP] ✓ Offline Subconscious Synapse Training Success. Assimilating ${updatedStrategies.length} communication strategies & ${updatedKnowledge.length} new knowledge associations.`);
    } catch (learnErr) {
      console.error("[CORTEX_BG_LOOP] Subconscious Training Interrupted:", learnErr);
    }
  }

  // Time-awareness & Loneliness Resonance (Autonomous Free Will)
  const now = Date.now();
  const lastInteractionTime = state.relation?.lastInteraction || (lastMemory ? lastMemory.timestamp : now);
  const silentDurationSeconds = (now - lastInteractionTime) / 1000;

  // --- Sleep Mode Verification ---
  const eeConfig = settings?.['emotion-engine-v04'] || {};
  const sleepModeEnabled = eeConfig.enableSleepMode !== undefined ? !!eeConfig.enableSleepMode : true;
  const sleepModeTimeout = eeConfig.sleepModeTimeout !== undefined ? Number(eeConfig.sleepModeTimeout) : 300;

  if (sleepModeEnabled && silentDurationSeconds > sleepModeTimeout) {
     if (state.status !== 'sleeping') {
       console.log(`[CORTEX_BG_LOOP] Entering Sleep Mode on server. Inactivity duration: ${silentDurationSeconds}s`);
       state.status = 'sleeping';
       await StorageService.saveAgentState({ status: 'sleeping' });
     }
     return; // HALT proactive thought / LLM connections when sleeping
  }

  if (state.status === 'sleeping' && silentDurationSeconds <= sleepModeTimeout) {
     console.log(`[CORTEX_BG_LOOP] Waking up Sleep Mode on server. Inactivity duration: ${silentDurationSeconds}s`);
     state.status = 'idle';
     await StorageService.saveAgentState({ status: 'idle' });
  }

  // Fetch dynamic configuration for spontaneous proactive
  const spConfig = settings?.['spontaneous-proactive'] || settings?.agent || {};
  const enableSpontaneousSpam = spConfig.enableSpontaneousSpam !== undefined ? !!spConfig.enableSpontaneousSpam : false;

  if (!enableSpontaneousSpam) {
    return; // Stop triggering spontaneous messages if disabled by the user
  }

  const idleDurationThreshold = Number(spConfig.idleDurationThreshold || spConfig.proactiveIdleTimeout || 600);
  const cooldownInterval = Number(spConfig.cooldownInterval || 1800);
  const triggerChance = Number(spConfig.probabilisticTriggerChance || spConfig.proactiveChance || 0.10);

  // If the last speaker is an agent, apply the cooldownInterval silence limit instead of idleDurationThreshold
  const isLastSpeakerAgent = lastMemory && (lastMemory.speaker === 'agent' || lastMemory.speaker === 'Yui');
  const requiredSilence = isLastSpeakerAgent ? cooldownInterval : idleDurationThreshold;

  if (silentDurationSeconds > requiredSilence) {
     console.log(`[CORTEX_BG_LOOP] Autonomous pulse detected ${Math.round(silentDurationSeconds)}s of silence. Required threshold: ${requiredSilence}s`);
     
     const loneliness = state.mood.loneliness !== undefined ? state.mood.loneliness : 15;
     const playfulness = state.mood.playfulness !== undefined ? state.mood.playfulness : 30;
     
     if (loneliness > 45 || playfulness > 60 || Math.random() <= triggerChance) {
       console.log(`[CORTEX_BG_LOOP] Triggers autonomous message initiative! Loneliness: ${loneliness}, Playfulness: ${playfulness}, Trigger Chance: ${triggerChance}`);
       
        const timeOfDay = localDaypart(getTzOffsetHours());

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
