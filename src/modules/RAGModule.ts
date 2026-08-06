import { CortexModule, ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';

export const RAGModule: CortexModule = {
  metadata: {
    id: 'rag-retrieval',
    name: 'yui-database: RAG Engine',
    description: 'Grounding & RAG Retrieval Hub. Searches internal knowledge matrix and external dynamic web data.',
    version: '2.0.0',
    type: ModuleType.CORTEX,
    order: 4,
    phase: 'compression'
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    let groundedKnowledge = context.groundedKnowledge || "";

    // 1. Semantic search in internal Knowledge Base
    const knowledgeBase = state.knowledge || [];
    const inputWords = (input || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const viewerName = context.perceivedNameUpdate || context.userName || "";
    
    logs.push(`[RAG] Scanning local knowledge database (size: ${knowledgeBase.length} entries) for search keys: [${inputWords.join(', ')}]...`);
    
    const relevantKnowledge = knowledgeBase.map(k => {
      let score = 0;
      const topic = (k.topic || "").toLowerCase();
      const content = (k.content || "").toLowerCase();
      
      inputWords.forEach(word => {
        if (topic.includes(word)) score += 2;
        if (content.includes(word)) score += 1;
      });
      
      if (viewerName && (topic.includes(viewerName.toLowerCase()) || content.includes(viewerName.toLowerCase()))) {
        score += 3;
      }
      return { ...k, _score: score };
    }).filter(k => k._score > 0)
      .sort((a, b) => (b._score as number) - (a._score as number))
      .map(({ _score, ...rest }) => rest)
      .slice(0, 5);

    if (relevantKnowledge.length > 0) {
      groundedKnowledge += `\n[INTERNAL_KNOWLEDGE_TOPIK]: ${JSON.stringify(relevantKnowledge)}`;
      logs.push(`[RAG] Found matching contexts! Integrated ${relevantKnowledge.length} segments from knowledge matrix.`);
    } else if (knowledgeBase.length > 0 && !groundedKnowledge) {
      // Fallback: integrate recent base entries if no direct keyword hits
      const fallbackKnowledge = knowledgeBase.slice(-3);
      groundedKnowledge += `\n[INTERNAL_KNOWLEDGE_GROUNDING]: ${JSON.stringify(fallbackKnowledge)}`;
    }

    // 2. Trigger semantic web search when query requests latest info or news
    const searchKeywords = ['latest', 'current', 'news', 'who is', 'what happened', 'search', 'find', 'berita', 'siapa', 'kapan', 'trend', 'update'];
    const isSystemSignal = (input || "").includes('[SYSTEM_SIGNAL]');
    const needsSearch = searchKeywords.some(w => (input || "").toLowerCase().includes(w)) || (isSystemSignal && (input || "").toLowerCase().includes('news'));

    if (needsSearch) {
      const searchTool = SystemRegistry.getTool('websearch');
      if (searchTool) {
        const query = isSystemSignal ? "trending global news and interesting facts" : input;
        logs.push(`[RAG] Autonomous research initiated. Triggering web bridge for query: "${query}"...`);
        try {
          const results = await searchTool.execute({ query }, { state });
          groundedKnowledge += `\n[WEB_RESULTS]: ${JSON.stringify(results)}`;
        } catch (e) {
          logs.push("[RAG] Web search bridge failed or timed out.");
        }
      }
    }

    return { 
      ...context, 
      groundedKnowledge,
      logs
    };
  }
};

export const KnowledgeModule = RAGModule;
