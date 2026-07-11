import { Memory, LearnedStrategy, PerformanceMetric, AgentState, CoreKnowledge } from "../include/types";
import { Cortex } from "./cortex";
import { StorageService } from "../drivers/storage";
import { StandardizedProcessor } from "./kernel/processor";

export class LearningEngine {
  /**
   * Performs an optimization cycle.
   * Analyzes history to derive or refine behavioral strategies.
   */
  static async optimize(cortex: Cortex, memories: Memory[], state: AgentState): Promise<LearnedStrategy[]> {
    console.log("[LEARNING_ENGINE] Starting optimization cycle...");
    
    const performanceSummary = await StorageService.getPerformanceSummary();
    const existingStrategies = await StorageService.getStrategies();
    
    // Select relevant memories for strategy refinement
    const memoryLimit = cortex.getConfig()?.agent?.learningMemoryLimit || 15;
    const relevantMemories = memories.filter(m => 
      m.tags.includes('api') || 
      m.tags.includes('error') || 
      m.importance > 0.8
    ).slice(-memoryLimit);

    const prompt = `
      As Yuihime's Cognitive Learning System, your task is to distill behavioral and technical heuristics from historical data.
      
      CURRENT STATE:
      Emotions: ${JSON.stringify(state.mood)}
      System Health: ${JSON.stringify(performanceSummary)}
      
      RECENT RELEVANT MEMORIES:
      ${relevantMemories.map(m => `- [${m.type}] ${m.content}`).join('\n')}
      
      EXISTING STRATEGIES:
      ${existingStrategies.map(s => `- ${s.topic}: ${s.instruction} (Confidence: ${s.confidence})`).join('\n')}
      
      GOAL:
      Analyze failures and patterns. Create strategies for retry logic, emotional tone, or specific user preferences.
      
      CRITICAL: Return ONLY a raw JSON array. 
      DO NOT include markdown code blocks (\`\`\`json).
      DO NOT include bullet points (*).
      DO NOT include any explanation or preamble.
      
      Format: [{ "topic": "STRING", "instruction": "STRATEGIC_REFINEMENT", "confidence": 0.8, "successCount": 0, "failureCount": 0 }]
    `;

    try {
      const response = await cortex.thinkSimple(prompt, true);
      const learned = StandardizedProcessor.parseLLMResponse(response, [] as LearnedStrategy[]);

      if (learned.length === 0) {
        console.warn("[LEARNING_ENGINE] No valid JSON array found or empty array in response:", response.substring(0, 100));
        return existingStrategies;
      }
      
      let updatedStrategies = existingStrategies;
      
      if (Array.isArray(learned)) {
        updatedStrategies = learned.map(newS => {
          const existing = existingStrategies.find(e => e.topic === newS.topic);
          if (existing) {
            return {
              ...existing,
              instruction: newS.instruction,
              confidence: (existing.confidence + newS.confidence) / 2,
              lastOptimized: Date.now()
            };
          }
          return {
            ...newS,
            id: Math.random().toString(36).substr(2, 9),
            lastOptimized: Date.now()
          };
        });
      }
      
      await StorageService.saveStrategies(updatedStrategies);
      return updatedStrategies;
    } catch (error) {
      console.error("[LEARNING_ENGINE] Optimization failed:", error);
      return existingStrategies;
    }
  }

  /**
   * Extracts core knowledge from raw memories.
   */
  static async extractKnowledge(cortex: Cortex, memories: Memory[], existingKnowledge: CoreKnowledge[]): Promise<CoreKnowledge[]> {
    console.log("[LEARNING_ENGINE] Extracting knowledge from memories...");
    
    const memoryLimit = cortex.getConfig()?.agent?.knowledgeMemoryLimit || 50;
    const unproccessedMemories = memories.slice(-memoryLimit); // Look at recent history
    
    const prompt = `
      Extract factual knowledge about the world, the user, or Yuihime's identity from these memories.
      
      MEMORIES:
      ${unproccessedMemories.map(m => `[ID: ${m.id}] ${m.content}`).join('\n')}
      
      EXISTING KNOWLEDGE:
      ${existingKnowledge.map(k => `- ${k.topic}: ${k.content}`).join('\n')}
      
      CRITICAL: Return ONLY a raw JSON array. DO NOT include markdown code blocks, explanation, or any text before/after the JSON.
      Format: [{ "topic": "User Preference", "content": "Likes digital art", "confidence": 0.9, "sourceMemoryIds": ["m1", "m2"] }]
    `;

    try {
      const response = await cortex.thinkSimple(prompt, true);
      const extracted = StandardizedProcessor.parseLLMResponse(response, [] as any[]);

      if (extracted.length === 0) {
        console.warn("[LEARNING_ENGINE] No valid JSON array found in extraction response:", response.substring(0, 100));
        return existingKnowledge;
      }
      
      const updatedKnowledge = [...existingKnowledge];
      
      if (Array.isArray(extracted)) {
        extracted.forEach(newK => {
          const index = updatedKnowledge.findIndex(k => k.topic.toLowerCase() === newK.topic.toLowerCase());
          if (index !== -1) {
            updatedKnowledge[index] = {
              ...updatedKnowledge[index],
              content: newK.content,
              confidence: (updatedKnowledge[index].confidence + newK.confidence) / 2,
              updatedAt: Date.now(),
              sourceMemoryIds: Array.from(new Set([...updatedKnowledge[index].sourceMemoryIds, ...(newK.sourceMemoryIds || [])]))
            };
          } else {
            updatedKnowledge.push({
              id: Math.random().toString(36).substr(2, 9),
              topic: newK.topic,
              content: newK.content,
              confidence: newK.confidence,
              sourceMemoryIds: newK.sourceMemoryIds || [],
              updatedAt: Date.now()
            });
          }
        });
      }
      
      return updatedKnowledge;
    } catch (error) {
      console.error("[LEARNING_ENGINE] Knowledge extraction failed:", error);
      return existingKnowledge;
    }
  }

  /**
   * Identifies recurring patterns in memories (user intents, common errors).
   */
  static recognizePatterns(memories: Memory[]): { pattern: string; frequency: number; type: 'positive' | 'negative' }[] {
    const text = memories.map(m => m.content.toLowerCase()).join(' ');
    const patterns: { [key: string]: number } = {};
    
    // Simple n-gram or keyword frequency for demonstration
    const keywords = ['error', 'failed', 'help', 'thanks', 'cool', 'bad', 'great', 'wow', 'again'];
    keywords.forEach(word => {
      const count = (text.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) patterns[word] = count;
    });

    return Object.entries(patterns).map(([pattern, frequency]) => ({
      pattern,
      frequency,
      type: (['error', 'failed', 'bad'].includes(pattern) ? 'negative' : 'positive') as 'positive' | 'negative'
    })).sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Tracks a successful operation and increments confidence in relevant strategies.
   */
  static async reinforce(topic: string, success: boolean) {
    const strategies = await StorageService.getStrategies();
    const strategy = strategies.find(s => s.topic === topic);
    if (strategy) {
      if (success) {
        strategy.successCount++;
        strategy.confidence = Math.min(1, strategy.confidence + 0.05);
      } else {
        strategy.failureCount++;
        strategy.confidence = Math.max(0, strategy.confidence - 0.1);
      }
      await StorageService.saveStrategies(strategies);
    }
  }
}
