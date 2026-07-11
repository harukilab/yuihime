import { CortexModule, ModuleType } from '../include/types';
import { SystemRegistry } from '../core/registry';

export const RAGModule: CortexModule = {
  metadata: {
    id: 'rag-retrieval',
    name: 'yui-database: RAG Engine',
    description: 'Retrieves external data from documents, search, and databases.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 4,
    phase: 'PHASE 2: COMPRESSION'
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    let groundedKnowledge = context.groundedKnowledge || "";

    // 1. Semantic search in internal Knowledge Base
    const knowledgeBase = state.knowledge || [];
    const inputWords = input.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const viewerName = context.perceivedNameUpdate || context.userName || "";
    
    logs.push(`[RAG] Scanning local knowledge database (size: ${knowledgeBase.length} entries) for search keys: [${inputWords.join(', ')}]...`);
    
    const relevantKnowledge = knowledgeBase.map(k => {
      let score = 0;
      const topic = (k.topic || "").toLowerCase();
      const content = (k.content || "").toLowerCase();
      
      // Match with current input
      inputWords.forEach(word => {
        if (topic.includes(word)) score += 2;
        if (content.includes(word)) score += 1;
      });
      
      // Match with viewer identity to ground the knowledge
      if (viewerName && (topic.includes(viewerName.toLowerCase()) || content.includes(viewerName.toLowerCase()))) {
        score += 3;
      }
      return { ...k, _score: score };
    }).filter(k => k._score > 0)
      .sort((a, b) => (b._score as number) - (a._score as number))
      .map(({ _score, ...rest }) => rest)
      .slice(0, 3); // Top 3 most relevant instead of 5

    if (relevantKnowledge.length > 0) {
      groundedKnowledge += `\n[INTERNAL_KNOWLEDGE_TOPIK]: ${JSON.stringify(relevantKnowledge)}`;
      logs.push(`[RAG] Found matching contexts! Integrated ${relevantKnowledge.length} segments from knowledge matrix.`);
    } else {
      logs.push(`[RAG] No matching static knowledge found in local matrix.`);
    }

    // 2. Trigger semantic web bridge if needed
    const searchKeywords = ['latest', 'current', 'news', 'who is', 'what happened', 'search', 'find', 'berita', 'siapa', 'kapan', 'trend', 'update'];
    const isSystemSignal = input.includes('[SYSTEM_SIGNAL]');
    const needsSearch = searchKeywords.some(w => input.toLowerCase().includes(w)) || (isSystemSignal && input.toLowerCase().includes('news'));

    if (needsSearch) {
      const searchTool = SystemRegistry.getTool('web_search');
      if (searchTool) {
        const query = isSystemSignal ? "trending global news and interesting facts" : input;
        logs.push(`[RAG] ${isSystemSignal ? 'Autonomous research initiated' : 'High uncertainty detected'}. Triggering semantic web bridge...`);
        try {
          const results = await searchTool.execute({ query }, { state });
          groundedKnowledge += `\n[WEB_RESULTS]: ${JSON.stringify(results)}`;
        } catch (e) {
          logs.push("[RAG] Web bridge failed.");
        }
      }
    }

    // Logic for PDF/Memory could go here...
    
    return { 
      ...context, 
      groundedKnowledge,
      logs
    };
  }
};
