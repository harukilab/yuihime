import { CortexModule, ModuleType } from '@shared/include/types';
import { LearningEngine } from '../core/learning.js';
import { searchMemories } from '../core/memorySearch.js';

export const MemoryModule: CortexModule = {
  metadata: {
    id: 'memory-engine',
    name: 'yui-memory: Pattern Retrieval',
    description: 'Retrieves relevant past experiences based on input keywords and recognized patterns.',
    version: '1.3.0',
    type: ModuleType.CORTEX,
    order: 4,
    phase: 'PHASE 1: AGGREGATION'
  },
  run: async (input, state, context) => {
    const memories = context.memories || [];
    
    // Pattern awareness
    const patterns = LearningEngine.recognizePatterns(memories.slice(-30));
    const patternWords = patterns.map(p => p.pattern);
    
    // Perform robust query search over memories using searchMemories logic
    const searchQuery = `${input} ${patternWords.join(' ')}`;
    const relevantHits = await searchMemories(searchQuery, 5);

    return { 
      relevantMemories: relevantHits.map(m => ({ content: m.content, tags: m.tags })),
      observedPatterns: patterns.slice(0, 3)
    };
  }
};
