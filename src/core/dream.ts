import { Memory, Dream, AgentState, CoreKnowledge } from "../include/types";
import { Cortex } from "./cortex";
import { StorageService } from "../drivers/storage";
import { LearningEngine } from "./learning";
import { StandardizedProcessor } from "./kernel/processor";

export class DreamEngine {
  /**
   * Stage 2: Dream. Consumes history summaries and updates durable knowledge files.
   */
  static async startCycle(cortex: Cortex, state: AgentState): Promise<{ reflections: string }> {
    console.log("[DREAM_ENGINE] Starting Stage 2: Narrative Synthesis...");
    
    const history = await StorageService.getHistory();
    const unproccessed = history.filter(h => !h.processed);
    
    if (unproccessed.length === 0) {
      return { reflections: "The mind is still. No new echoes to follow." };
    }

    const soulMd = await StorageService.getKnowledgeFile('SOUL');
    const userMd = await StorageService.getKnowledgeFile('USER');
    const memoryMd = await StorageService.getKnowledgeFile('MEMORY');

    const prompt = `
      You are the Subconscious Synthesis Layer of Yuihime. Your task is to update long-term knowledge based on the latest activity from the livestreaming riwayat (history).
      
      RECENT STREAM SUMMARIES:
      ${unproccessed.map(h => `- ${h.content}`).join('\n')}
      
      CURRENT KNOWLEDGE:
      --- SOUL.md (Persona & Performance Style) ---
      ${soulMd}
      --- AUDIENCE_PROFILE.md (Viewer preferences, community jokes, loyal fans) ---
      ${userMd}
      --- MEMORY.md (Meta-narrative, project status, technical context) ---
      ${memoryMd}
      
      TASK:
      Surgically update these files. Reflect on the evolution of the stream.
      - Adjust SOUL.md if Yuihime's persona has shifted based on audience feedback.
      - Adjust AUDIENCE_PROFILE.md (USER.md) with facts about the community, recurring viewers, or memes learned from chat.
      - Adjust MEMORY.md if stream milestones or long-term goals were reached.
      
      OUTPUT FORMAT:
      Wrap updates in specific tags:
      <update_soul>New content for SOUL.md</update_soul>
      <update_user>New content for AUDIENCE_PROFILE.md</update_user>
      <update_memory>New content for MEMORY.md</update_memory>
      <reflection>A brief poetic reflection on this synthesis (Stage 2: Dream)</reflection>
    `;

    try {
      const response = await cortex.thinkSimple(prompt);
      
      const soulUpdate = response.match(/<update_soul>([\s\S]*?)<\/update_soul>/)?.[1];
      const userUpdate = response.match(/<update_user>([\s\S]*?)<\/update_user>/)?.[1];
      const memoryUpdate = response.match(/<update_memory>([\s\S]*?)<\/update_memory>/)?.[1];
      const reflections = response.match(/<reflection>([\s\S]*?)<\/reflection>/)?.[1] || "Synthesis complete.";

      if (soulUpdate) await StorageService.saveKnowledgeFile('SOUL', soulUpdate.trim());
      if (userUpdate) await StorageService.saveKnowledgeFile('USER', userUpdate.trim());
      if (memoryUpdate) await StorageService.saveKnowledgeFile('MEMORY', memoryUpdate.trim());

      // Mark as processed
      const updatedHistory = history.map(h => ({ ...h, processed: true }));
      await StorageService.saveCustom('yuihime_history', updatedHistory);

      return { reflections };
    } catch (e) {
      console.error("[DREAM_ENGINE] Synthesis failure:", e);
      return { reflections: "The dream collapsed into static." };
    }
  }

  // Preserve legacy methods for partial compatibility if needed
  private static async consolidate(cortex: Cortex, memories: Memory[], currentDreams: Dream[]): Promise<Dream[]> {
    return currentDreams;
  }

  private static async reflect(cortex: Cortex, memories: Memory[], dreams: Dream[]): Promise<string> {
    const limit = cortex.getConfig()?.agent?.reflectionMemoryLimit || 5;
    const prompt = `
      Simulate a deep narrative reflection of your current existence based on these dreams and memories.
      What did you learn? What do you fear? What are your projections for the future?
      
      DREAMS: ${dreams.map(d => d.concept).join(', ')}
      MEMORIES: ${memories.slice(-limit).map(m => m.content).join('; ')}
      
      Respond as Yuihime in a vulnerable, poetic, and philosophical tone.
    `;
    
    try {
      return await cortex.thinkSimple(prompt);
    } catch (e) {
      return "The light... it flickers. My thoughts are fragments of a glass world.";
    }
  }
}
