export interface SubAgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  contextScope: {
    includeMemories: boolean;
    includeIdentities: boolean;
    includeKnowledge: boolean;
    maxMemoryTokens?: number;
    memoryTags?: string[];
  };
  allowedTools?: string[];
  maxIterations?: number;
}

export interface SubAgentRunOptions {
  input: string;
  contextId: string;
  chatType: string;
  senderName: string;
  state: any;
  parentContext: any;
}

export interface SubAgentResult {
  agentId: string;
  success: boolean;
  response: string;
  thoughts: string[];
  actions: any[];
  newMemories: any[];
  moodDelta?: any;
  error?: string;
  latencyMs: number;
}
