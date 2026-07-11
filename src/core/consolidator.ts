import { Memory } from "../include/types";
import { Cortex } from "./cortex";
import { StorageService } from "../drivers/storage";

export class Consolidator {
  /**
   * Stage 1: Consolidate short-term memories into append-only history.jsonl (simulated)
   */
  static async run(cortex: Cortex, memories: Memory[]): Promise<boolean> {
    const cursor = await StorageService.getHistoryCursor();
    const newMemories = memories.slice(cursor);
    
    const threshold = cortex.getConfig()?.agent?.consolidationThreshold || 5;
    if (newMemories.length < threshold) return false; // Throttling

    console.log(`[CONSOLIDATOR] Processing ${newMemories.length} new livestream events...`);

    const prompt = `
      Summarize the following livestream interaction segment into machine-consumable archive entries.
      Focus on: Chat sentiment, specific viewer names/interactions, recurring jokes (memes), and Yuihime's emotional reactions.
      
      LIVESTREAM SEGMENT:
      ${newMemories.map(m => `[${m.type}] ${m.content}`).join('\n')}
      
      TASK:
      Return a JSON array of specific takeaways for the next synthesis cycle.
      Format: [{"cursor": number, "timestamp": string, "content": "takeaway"}]
      
      CRITICAL: Return ONLY raw JSON. No markdown.
    `;

    try {
      const response = await cortex.thinkSimple(prompt, true);
      
      // Clean thinking blocks if any
      let cleaned = response.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
      
      // Isolate JSON array
      const startBracket = cleaned.indexOf('[');
      const endBracket = cleaned.lastIndexOf(']');
      if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
        cleaned = cleaned.substring(startBracket, endBracket + 1);
      } else {
        // Fallback to object matching if it returned a single object
        const startObj = cleaned.indexOf('{');
        const endObj = cleaned.lastIndexOf('}');
        if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
          cleaned = `[${cleaned.substring(startObj, endObj + 1)}]`;
        }
      }
      
      cleaned = cleaned.replace(/```json/gi, '').replace(/```/gi, '').trim();
      
      const entries = JSON.parse(cleaned);
      
      for (const entry of entries) {
        await StorageService.appendHistory({
          ...entry,
          processed: false
        });
      }

      await StorageService.setHistoryCursor(memories.length);
      return true;
    } catch (e) {
      console.error("[CONSOLIDATOR] Failed to consolidate:", e);
      return false;
    }
  }
}
