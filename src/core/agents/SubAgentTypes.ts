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
  /** Override the task prompt instead of using definition-systemPrompt + input (direct session mode). */
  promptOverride?: string;
  /** Override the system prompt instead of the definition's (direct session mode). */
  systemPromptOverride?: string;
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
