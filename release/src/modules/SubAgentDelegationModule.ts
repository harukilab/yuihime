import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { SubAgentManager } from '../core/agents/SubAgentManager';
import { SubAgentRegistry } from '../core/agents/SubAgentRegistry';

function evaluateDelegation(input: string, state: AgentState, context: any, agents: any[]): { shouldDelegate: boolean; agentId?: string; reason?: string } {
  if (!input || input.trim().length === 0) {
    return { shouldDelegate: false, reason: 'empty_input' };
  }

  const lowerInput = input.toLowerCase();

  for (const agent of agents) {
    const matchesCapability = agent.capabilities.some((cap: string) => 
      lowerInput.includes(cap.toLowerCase()) || 
      fuzzyMatch(lowerInput, cap.toLowerCase())
    );

    if (matchesCapability) {
      const manager = SubAgentManager.getInstance();
      const activeRuns = manager.getActiveRuns();
      const maxConcurrent = (context.config?.subAgentDelegation?.maxConcurrentSubAgents) || 3;
      
      if (activeRuns.length >= maxConcurrent) {
        return { shouldDelegate: false, reason: 'max_concurrent_reached' };
      }

      return { shouldDelegate: true, agentId: agent.id, reason: `matched_capability: ${agent.id}` };
    }
  }

  return { shouldDelegate: false, reason: 'no_matching_agent' };
}

function fuzzyMatch(input: string, capability: string): boolean {
  const words = input.split(/\s+/);
  const capWords = capability.split(/[\s_-]+/);
  const matchCount = words.filter((w: string) => capWords.some((cw: string) => cw.includes(w) || w.includes(cw))).length;
  return matchCount >= Math.ceil(capWords.length / 2);
}

export const SubAgentDelegationModule: CortexModule = {
  metadata: {
    id: 'sub-agent-delegation',
    name: 'yui-sub-agent: Task Delegation Core',
    description: 'Enables Yui to delegate specialized tasks to isolated sub-agents with scoped context and capabilities.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 15,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableSubAgents: {
          type: 'boolean',
          label: 'Enable Sub-Agent Delegation',
          default: true,
          description: 'Allows Yui to spawn specialized sub-agents for complex tasks.'
        },
        maxConcurrentSubAgents: {
          type: 'number',
          label: 'Max Concurrent Sub-Agents',
          default: 3,
          min: 1,
          max: 10,
          description: 'Maximum number of sub-agents that can run simultaneously.'
        },
        delegationThreshold: {
          type: 'slider',
          label: 'Delegation Complexity Threshold',
          default: 0.5,
          min: 0.1,
          max: 1.0,
          step: 0.1,
          description: 'Minimum complexity score before a task is delegated to a sub-agent.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const config = context.config?.subAgentDelegation || {};
    const enabled = config.enableSubAgents !== undefined ? !!config.enableSubAgents : true;

    if (!enabled) {
      return { ...context, subAgentDelegation: { enabled: false, delegated: false } };
    }

    const manager = SubAgentManager.getInstance();
    const registry = SubAgentRegistry;
    const availableAgents = registry.getAll();

    if (availableAgents.length === 0) {
      return { ...context, subAgentDelegation: { enabled: true, delegated: false, reason: 'no_agents_registered' } };
    }

    const delegationDecision = evaluateDelegation(input, state, context, availableAgents);
    
    if (!delegationDecision.shouldDelegate) {
      return { ...context, subAgentDelegation: { enabled: true, delegated: false, reason: delegationDecision.reason } };
    }

    const agentId = delegationDecision.agentId;
    console.log(`[SUB_AGENT] Delegating to ${agentId}: ${delegationDecision.reason}`);

    try {
      const result = await manager.spawn(agentId, {
        input,
        contextId: context.contextId || 'web_default',
        chatType: context.chatType || 'web',
        senderName: context.perceivedName || 'user',
        state,
        parentContext: context
      });

      if (result.success) {
        return {
          ...context,
          subAgentDelegation: {
            enabled: true,
            delegated: true,
            agentId,
            result,
            shouldUseDirectResponse: true
          },
          subAgentResponse: result.response,
          subAgentThoughts: result.thoughts,
          subAgentActions: result.actions
        };
      } else {
        console.warn(`[SUB_AGENT] Delegation to ${agentId} failed:`, result.error);
        return {
          ...context,
          subAgentDelegation: {
            enabled: true,
            delegated: true,
            agentId,
            result,
            shouldUseDirectResponse: false,
            error: result.error
          }
        };
      }
    } catch (err: any) {
      console.error(`[SUB_AGENT] Delegation error:`, err.message);
      return {
        ...context,
        subAgentDelegation: {
          enabled: true,
          delegated: true,
          agentId,
          shouldUseDirectResponse: false,
          error: err.message
        }
      };
    }
  }
};
