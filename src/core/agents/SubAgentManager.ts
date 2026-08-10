import { SubAgentDefinition, SubAgentRunOptions, SubAgentResult } from './SubAgentTypes';
import { SubAgentRegistry } from './SubAgentRegistry';
import { SystemRegistry } from '@shared/core/registry';
import { genId } from '@shared/core/idGen';
import { injectCharacterName } from '../kernel/characterName.js';
import { extractSpeechFromToolEnvelope, stripInlineToolCallFragments } from '../openaiTools.js';
import { ExternalInjectionBus } from '../kernel/externalInjectionBus.js';

export class SubAgentManager {
  private static instance: SubAgentManager;
  private activeRuns: Map<string, { startTime: number; options: SubAgentRunOptions }> = new Map();

  private constructor() {}

  public static getInstance(): SubAgentManager {
    if (!SubAgentManager.instance) {
      SubAgentManager.instance = new SubAgentManager();
    }
    return SubAgentManager.instance;
  }

  async spawn(agentId: string, options: SubAgentRunOptions): Promise<SubAgentResult> {
    const definition = SubAgentRegistry.get(agentId);
    if (!definition) {
      return {
        agentId,
        success: false,
        response: '',
        thoughts: [],
        actions: [],
        newMemories: [],
        error: `Sub-agent ${agentId} not found in registry`,
        latencyMs: 0
      };
    }

    const startTime = Date.now();
    const runId = `${agentId}_${Date.now()}_${genId(5)}`;
    this.activeRuns.set(runId, { startTime, options });

    try {
      const scopedContext = this.buildScopedContext(definition, options);
      const prompt = this.buildPrompt(definition, options, scopedContext);

      const gateway = SystemRegistry.getModule<any>('provider-gateway');
      if (!gateway) {
        throw new Error('Provider gateway not available for sub-agent execution');
      }

      const response = await gateway.run(prompt, options.state, {
        ...options.parentContext,
        ...scopedContext,
        isSubAgent: true,
        subAgentId: agentId
      });

      const latencyMs = Date.now() - startTime;
      const result: SubAgentResult = {
        agentId,
        success: true,
        response: sanitizeSubAgentResponse(response.rawResult || response.response || ''),
        thoughts: response.thoughts || [],
        actions: response.actions || [],
        newMemories: response.newMemories || [],
        moodDelta: response.moodDelta || {},
        latencyMs
      };

      return result;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        agentId,
        success: false,
        response: '',
        thoughts: [],
        actions: [],
        newMemories: [],
        error: err.message || String(err),
        latencyMs
      };
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  getActiveRuns() {
    return Array.from(this.activeRuns.entries()).map(([id, data]) => ({
      id,
      agentId: id.split('_')[0],
      ...data
    }));
  }

  private buildScopedContext(definition: SubAgentDefinition, options: SubAgentRunOptions): any {
    const scope: any = {};

    if (definition.contextScope.includeMemories && options.parentContext.memories) {
      let memories = options.parentContext.memories;
      if (definition.contextScope.memoryTags && definition.contextScope.memoryTags.length > 0) {
        memories = memories.filter((m: any) => 
          definition.contextScope.memoryTags!.some((tag: string) => 
            (m.tags || []).includes(tag)
          )
        );
      }
      const maxMemories = definition.contextScope.maxMemoryTokens 
        ? Math.min(memories.length, definition.contextScope.maxMemoryTokens)
        : memories.length;
      scope.memories = memories.slice(-maxMemories);
    }

    if (definition.contextScope.includeIdentities && options.parentContext.allIdentities) {
      scope.allIdentities = options.parentContext.allIdentities;
      scope.viewerIdentity = options.parentContext.viewerIdentity;
    }

    if (definition.contextScope.includeKnowledge && options.parentContext.knowledge) {
      scope.knowledge = options.parentContext.knowledge;
    }

    return scope;
  }

  private buildPrompt(definition: SubAgentDefinition, options: SubAgentRunOptions, scopedContext: any): string {
    const memorySummary = scopedContext.memories && scopedContext.memories.length > 0
      ? scopedContext.memories.map((m: any) => `[${m.speaker || m.type}]: ${m.content}`).join('\n')
      : '[No relevant memories available]';

    const externalFeaturesBlock = ExternalInjectionBus.getInstance().renderSubAgentBlock(options.parentContext);

    const identityContext = scopedContext.viewerIdentity
      ? `[FACING VIEWER]: ${scopedContext.viewerIdentity.perceivedName} (Trust: ${scopedContext.viewerIdentity.trust || 50}%, Affection: ${scopedContext.viewerIdentity.affection || 50}%)\n[VIEWER FACTS]: ${(scopedContext.viewerIdentity.importantFacts || []).slice(0, 5).join('; ')}`
      : '[FACING VIEWER]: Unknown Viewer';

    if (options.promptOverride) {
      // Direct-session mode: a single-shot sub-agent invocation with a fully
      // caller-authored prompt (opencode "direct session" analogue). Scoped
      // context is still attached so the fresh LLM call has grounding.
      const systemPrompt = options.systemPromptOverride || definition.systemPrompt;
      return injectCharacterName(`${systemPrompt}

[SUB-AGENT DIRECT SESSION]
You are operating as a specialized sub-agent: ${definition.name}
Your capabilities: ${definition.capabilities.join(', ')}

${identityContext}

[RELEVANT MEMORIES]
${memorySummary}

${externalFeaturesBlock ? `
[EXTERNAL FEATURE INJECTIONS]
${externalFeaturesBlock}
` : ''}

[PARENT CONTEXT]
Channel: ${options.chatType}
Sender: ${options.senderName}

[TASK]
${options.promptOverride}

[INSTRUCTION]
Process the task above using your specialized capabilities. Output a concise, actionable result. Do not break the fourth wall.`);
    }

    return injectCharacterName(`${definition.systemPrompt}

[SUB-AGENT CONTEXT]
You are operating as a specialized sub-agent: ${definition.name}
Your capabilities: ${definition.capabilities.join(', ')}
Current task: ${options.input}

${identityContext}

[RELEVANT MEMORIES]
${memorySummary}

${externalFeaturesBlock ? `
[EXTERNAL FEATURE INJECTIONS]
${externalFeaturesBlock}
` : ''}

[PARENT CONTEXT]
Channel: ${options.chatType}
Sender: ${options.senderName}

[INSTRUCTION]
Process the user's request using your specialized capabilities. Output a concise, actionable response in character. Do not break the fourth wall.`);
  }
}

/**
 * Convert a raw gateway response into user-presentable sub-agent text. Single-shot
 * sub-agent calls have no cortex loop, so an OpenAI-compatible model that answers
 * via a native tool call (e.g. `send_message`) yields the raw `{"tool_calls":[...]}`
 * envelope as `rawResult`. Extract the delivery payload speech instead of leaking
 * the envelope, and strip any inline tool-call fragments from the remainder.
 */
function sanitizeSubAgentResponse(raw: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return raw;

  const speech = extractSpeechFromToolEnvelope(raw);
  if (speech) return speech;

  const stripped = stripInlineToolCallFragments(raw);
  return stripped !== raw ? stripped : raw;
}
