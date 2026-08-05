import { ToolModule } from '@shared/include/types';
import { SubAgentManager } from '../../core/agents/SubAgentManager';
import { SubAgentRegistry } from '../../core/agents/SubAgentRegistry';

const manifest = {
  "id": "delegate",
  "name": "Delegate Task",
  "description": "Spawn one or more isolated sub-agent sessions in parallel to work on a task independently, then return each sub-agent's result as tool observations. Use this for complex, parallelizable work (research, drafting, brainstorming) that you want to offload to a fresh focused context. Runs concurrently with any other tools in the same turn.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 90,
  "parameters": {
    "type": "object",
    "properties": {
      "tasks": {
        "type": "array",
        "description": "List of task definitions to delegate. Each entry spawns one sub-agent session in parallel.",
        "items": {
          "type": "object",
          "properties": {
            "agentId": {
              "type": "string",
              "description": "Registered sub-agent to use. Leave empty to auto-pick from available agents, or use 'direct' for a direct one-shot session with your own prompt.",
              "default": "direct"
            },
            "prompt": {
              "type": "string",
              "description": "The full task instruction for the sub-agent session. Be specific about the goal, required output format, and constraints."
            }
          },
          "required": ["prompt"]
        }
      },
      "timeoutMs": {
        "type": "number",
        "description": "Maximum wall-clock time to wait for all sub-agent sessions (default 60000, max 300000)."
      }
    },
    "required": ["tasks"]
  }
} as const;

interface DelegateTask {
  agentId?: string;
  prompt: string;
}

interface DelegateArgs {
  tasks: DelegateTask[];
  timeoutMs?: number;
}

export const DelegateTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: DelegateArgs, context?: any) => {
    const tasks = Array.isArray(args.tasks) ? args.tasks : [];
    if (tasks.length === 0) {
      return { success: false, error: 'No tasks provided to delegate' };
    }

    const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 60000, 1000), 300000);
    const manager = SubAgentManager.getInstance();
    const availableAgents = SubAgentRegistry.getAll();
    const agentIds = availableAgents.map((a: any) => a.id);

    // opencode-style auto-routing: pick a sub-agent based on task keywords,
    // not just take the first one in order.
    const pickAgent = (prompt: string): string => {
      const p = String(prompt || '').toLowerCase();
      const has = (re: RegExp) => re.test(p);
      if (has(/explore|cari.*file|cari.*fungsi|codebase|struktur|dimana.*(file|kode|class|function)|find.*(file|function|class)|grep|search.*(code|source)/i)) {
        return 'explorer-agent';
      }
      if (has(/plan|rencana|decompose|langkah|step|urutan|strategi|bagaimana caranya|how to|approach|rincian langkah/i)) {
        return 'planner-agent';
      }
      if (has(/riset|research|fakta|fact.?check|latest|terbaru|berita|news|penelitian|analy.?z|analisa/i)) {
        return 'research-agent';
      }
      return agentIds[0] || 'research-agent';
    };

    const results = await Promise.allSettled(
      tasks.map(async (task: DelegateTask) => {
        const requested = task.agentId || 'auto';
        const agentId = requested === 'auto' || requested === 'direct'
          ? pickAgent(task.prompt)
          : agentIds.includes(requested)
            ? requested
            : pickAgent(task.prompt);

        const start = Date.now();
        try {
          const result = await manager.spawn(agentId, {
            input: task.prompt,
            promptOverride: task.prompt,
            contextId: context?.contextId || 'web_default',
            chatType: context?.chatType || 'web',
            senderName: context?.perceivedName || context?.userName || 'user',
            state: context?.state || {},
            parentContext: context || {}
          });
          return {
            agentId,
            requested,
            success: result.success,
            response: result.response,
            error: result.error,
            latencyMs: Date.now() - start
          };
        } catch (err: any) {
          return {
            agentId,
            requested,
            success: false,
            response: '',
            error: err.message || String(err),
            latencyMs: Date.now() - start
          };
        }
      })
    );

    const outcomes = results.map((r: any) => {
      if (r.status === 'fulfilled') return r.value;
      return { success: false, error: r.reason?.message || String(r.reason) };
    });

    return {
      success: true,
      count: outcomes.length,
      delegates: outcomes,
      summary: outcomes
        .map((o: any, i: number) => `[${i + 1}] ${o.agentId}: ${o.success ? 'OK' : 'FAILED'} — ${o.success ? o.response : o.error}`)
        .join('\n')
    };
  }
};
