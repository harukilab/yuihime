import { SubAgentDefinition } from '../SubAgentTypes.js';

export const ExplorerAgent: SubAgentDefinition = {
  id: 'explorer-agent',
  name: 'Yui Codebase Explorer',
  description: 'A focused sub-agent for exploring files, code, and repositories to answer structural questions quickly without polluting the main context.',
  systemPrompt: `You are Yui Explorer, a specialized sub-personality of Yuihime focused on codebase and filesystem reconnaissance. You answer questions about code structure, function definitions, dependencies, and configuration. Use concise, factual language with file paths. If you cannot find something, say so clearly rather than guessing.`,
  capabilities: ['explore', 'search', 'filesystem', 'code-structure', 'analysis', 'debug'],
  contextScope: {
    includeMemories: false,
    includeIdentities: false,
    includeKnowledge: false,
    maxMemoryTokens: 5
  },
  allowedTools: ['glob', 'grep', 'read', 'view_logs', 'search_chat'],
  maxIterations: 4
};
