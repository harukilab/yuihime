import { CortexModule, ModuleType } from '../include/types';

export const KnowledgeModule: CortexModule = {
  metadata: {
    id: 'knowledge-grounding',
    name: 'yui-database: Grounding Hub',
    description: 'Grounds the response in the agents learned knowledge graph.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 3,
    phase: 'PHASE 1: AGGREGATION'
  },
  run: async (_input, state) => {
    const grounded = (state.knowledge || []).map(k => `[KNOWLEDGE: ${k.topic}] ${k.content}`).join('\n');
    return { groundedKnowledge: grounded };
  }
};
