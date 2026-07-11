import { CortexModule, ModuleType } from '../include/types';
import { LearningEngine } from '../core/learning';

export const MemoryModule: CortexModule = {
  metadata: {
    id: 'memory-engine',
    name: 'yui-memory: Pattern Retrieval',
    description: 'Retrieves relevant past experiences based on input keywords and recognized patterns.',
    version: '1.2.0',
    type: ModuleType.CORTEX,
    order: 4,
    phase: 'PHASE 1: AGGREGATION'
  },
  run: async (input, state, context) => {
    const memories = context.memories || [];
    const words = input.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    // Pattern awareness
    const patterns = LearningEngine.recognizePatterns(memories.slice(-30));
    const patternWords = patterns.map(p => p.pattern);

    const relevant = memories
      .filter(m => [...words, ...patternWords].some(w => 
        (m.content || "").toLowerCase().includes(w) || 
        (m.tags || []).some(t => (t || "").toLowerCase().includes(w))
      ))
      .slice(-5);

    return { 
      relevantMemories: relevant.map(m => ({ content: m.content, tags: m.tags })),
      observedPatterns: patterns.slice(0, 3)
    };
  }
};
