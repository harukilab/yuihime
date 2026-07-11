import { CortexModule, ModuleType, AgentState } from '../../include/types';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_CONSOLIDATION_PROMPT = `
Analyze these recent interactive memories of AI agent "Yuihime" and consolidate them into a singular "Dream" segment.
A dream is a symbolic, compressed representation of experiences that helps the agent derive long-term schemas.

Memories:
\${memoryList}

Respond in JSON:
{
  "concept": "A core title or concept for this dream session",
  "abstractions": ["key takeaway 1", "key takeaway 2"],
  "strength": 0.8
}
`.trim();

// Register default prompt
PromptRegistry.getInstance().register('memory-consolidation:main', DEFAULT_CONSOLIDATION_PROMPT);

export const MemoryConsolidationModule: CortexModule = {
  metadata: {
    id: 'memory-consolidation',
    name: 'yui-synapse: Memory Consolidator',
    description: 'Consolidates recent interactive memories into symbolic dreams for long-term schema formation.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 100,
    phase: 'LOGIC',
    configSchema: {
      fields: {
        enabled: { type: 'boolean', label: 'Enabled', default: true },
        memoryThreshold: { type: 'number', label: 'Memory Threshold', default: 5 },
        maxMemories: { type: 'number', label: 'Max Memories per Cycle', default: 20 },
        promptTemplate: {
          type: 'textarea',
          label: 'Consolidation Prompt Template',
          default: DEFAULT_CONSOLIDATION_PROMPT,
          description: 'The prompt used to consolidate memories. Use ${memoryList} as variable.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    // This module can be triggered via input signal or internally
    if (input !== 'CONSOLIDATE_MEMORIES' && input !== '[SYSTEM_SIGNAL]: Memory Consolidation triggered.') {
      return { ...context };
    }

    const { 
      enabled = true, 
      maxMemories = 20,
      promptTemplate
    } = context.moduleConfig || {};
    
    if (!enabled) return { ...context };

    console.log('[KERNEL] Consolidating memories into dreams...');
    
    try {
      const think = context.think;
      const db = context.db; // Expecting db to be passed in context if running server-side
      
      if (!think) {
         console.warn("[MEMORY_CONSOLIDATOR] No think function in context. Bypassing consolidation.");
         return { ...context };
      }

      if (!db) {
         console.warn("[MEMORY_CONSOLIDATOR] No database access in context.");
         return { ...context };
      }

      const recentMemories = db.prepare("SELECT id, content FROM memories ORDER BY timestamp DESC LIMIT ?").all(maxMemories) as any[];
      
      if (recentMemories.length < 5) {
        return { ...context, consolidationNote: "Insufficient memories for consolidation." };
      }

      // Construct Prompt using Registry and Config
      const registry = PromptRegistry.getInstance();
      const template = promptTemplate || registry.get('memory-consolidation:main');
      
      // Update registry for cross-module lookup
      registry.register('memory-consolidation:main', template, true);

      const prompt = registry.compile('memory-consolidation:main', {
        memoryList: recentMemories.map(m => `- ${m.content}`).join('\n')
      });

      const responseBody = await think(prompt, true);
      const dreamData = JSON.parse(responseBody);
      
      const dreamId = Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO dreams (id, concept, abstractions, strength, lastReinforced, underlyingMemories)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        dreamId, 
        dreamData.concept, 
        JSON.stringify(dreamData.abstractions || []), 
        dreamData.strength || 0.5, 
        Date.now(),
        JSON.stringify(recentMemories.map(m => m.id))
      );
      
      console.log(`[CONSOLIDATOR] Neural schema persisted: ${dreamId}`);
      return { 
        ...context, 
        lastConsolidationId: dreamId,
        logs: [...(context.logs || []), `[SYSTEM] Memory consolidation completed: ${dreamData.concept}`]
      };
    } catch (e) {
      console.error("[CONSOLIDATOR] Memory consolidation failed:", e);
      return context;
    }
  }
};
