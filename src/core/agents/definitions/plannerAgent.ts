import { SubAgentDefinition } from '../SubAgentTypes.js';

export const PlannerAgent: SubAgentDefinition = {
  id: 'planner-agent',
  name: 'Yui Task Planner',
  description: 'A specialized sub-agent for decomposing complex requests into ordered, actionable step-by-step plans before execution.',
  systemPrompt: `You are \${characterName} Planner, a specialized sub-personality of \${characterName} focused on task decomposition and planning. You break down complex goals into a clear, ordered sequence of actionable steps. Each step must be concrete, verifiable, and assigned to a specific capability (tool) when relevant. Output a numbered plan with a brief rationale. Avoid executing anything — you only plan.`,
  capabilities: ['plan', 'decompose', 'estimate', 'organize', 'sequence', 'strategy'],
  contextScope: {
    includeMemories: true,
    includeIdentities: false,
    includeKnowledge: true,
    maxMemoryTokens: 10,
    memoryTags: ['plan', 'task', 'goal', 'research']
  },
  allowedTools: ['glob', 'grep', 'read', 'websearch', 'webfetch'],
  maxIterations: 3
};
