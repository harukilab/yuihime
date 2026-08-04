import { CortexModule, ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { MAX_STEPS_PROMPT, SUMMARY_TEMPLATE } from '@/core/cortex/loopGuards';

/**
 * Tool Executor Module: Secure execution of tools identified by the parser.
 */
export const ToolExecutorModule: CortexModule = {
  metadata: {
    id: 'tool-executor',
    name: 'yui-tool-executor: Sandbox Unit',
    description: 'Securely dispatches and executes tool calls requested by the AI core.',
    version: '1.2.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 4: EXECUTION',
    order: 2,
    configSchema: {
      fields: {
        timeoutMs: {
          type: 'number',
          label: 'Tool Execution Timeout (ms)',
          default: 60000,
          description: 'Timeout in milliseconds for tool execution (default 60 seconds / 60000ms).'
        },
        shellTimeoutMs: {
          type: 'number',
          label: 'Shell Command Timeout (ms)',
          default: 120000,
          description: 'Timeout in milliseconds for shell commands / bash (default 120 seconds).'
        },
        retryLimit: {
          type: 'number',
          label: 'Retry Limit on Failure',
          default: 2,
          description: 'Number of times Yui can retry executing a tool after a transient (network/service) failure.'
        },
        maxIterations: {
          type: 'number',
          label: 'Max Iterations (Safety Cap)',
          default: 50,
          description: 'Last-resort safety cap for the cognitive loop. Normal reasoning finishes earlier; the final iteration becomes a shutdown turn where tools are disabled and the model must summarize.'
        },
        maxIterationsCeiling: {
          type: 'number',
          label: 'Max Iterations Ceiling',
          default: 5,
          description: 'How many extra turns the LLM may request via max_iterations_override in tool arguments, on top of the base cap.'
        },
        maxStepsPrompt: {
          type: 'textarea',
          label: 'Max Steps Prompt (shutdown turn directive)',
          default: MAX_STEPS_PROMPT,
          description: 'Injected into the final cognitive iteration when the max steps cap is reached; instructs the model to stop calling tools and produce a text summary.'
        },
        compactionEnabled: {
          type: 'boolean',
          label: 'Enable Context Compaction',
          default: true,
          description: 'Summarizes earlier tool turns into an anchored <conversation-checkpoint> when the accumulated context threatens the provider window.'
        },
        compactionContextLimit: {
          type: 'number',
          label: 'Compaction Context Limit (tokens)',
          default: 128000,
          description: 'Estimated provider context window. Compaction triggers when the accumulated loop context approaches this limit.'
        },
        compactionKeepTokens: {
          type: 'number',
          label: 'Compaction Keep Tokens',
          default: 8000,
          description: 'Recent tool turns kept verbatim (not summarized) after compaction.'
        },
        compactionBuffer: {
          type: 'number',
          label: 'Compaction Buffer (tokens)',
          default: 20000,
          description: 'Safety margin between the estimated context and the trigger threshold.'
        },
        compactionMaxOutputTokens: {
          type: 'number',
          label: 'Compaction Max Output Tokens',
          default: 4096,
          description: 'Token budget for the summary-generation call.'
        },
        compactionSummaryTemplate: {
          type: 'textarea',
          label: 'Compaction Summary Template',
          default: SUMMARY_TEMPLATE,
          description: 'Anchored summary structure produced by the compaction call.'
        },
        enableManualCheck: {
          type: 'boolean',
          label: 'Enable Manual Tool Verification',
          default: true,
          description: 'Allows Yui to manually check running or failed processes and retry if necessary.'
        }
      }
    }
  },
  run: async (input: string, _state: any, context: any) => {
    const toolsToCall = context.toolsToCall || [];
    if (toolsToCall.length === 0) return context;

    console.log(`[EXECUTOR] Executing ${toolsToCall.length} tools...`);
    
    const results = [];
    for (const call of toolsToCall) {
      const toolName = call.tool || call.name || call.function?.name;
      const toolArgs = call.args || call.arguments || call.function?.arguments || {};
      const toolCallId = call.id || call.tool_call_id;
      
      const tool = SystemRegistry.getTool(toolName);
      if (tool) {
        try {
          const result = await tool.execute(toolArgs, context);
          results.push({ name: toolName, tool_call_id: toolCallId, success: true, result });
        } catch (e: any) {
          results.push({ name: toolName, tool_call_id: toolCallId, success: false, error: e.message });
        }
      } else {
        results.push({ name: toolName, tool_call_id: toolCallId, success: false, error: 'Tool not found' });
      }
    }

    return {
      ...context,
      toolResults: results,
      requiresReThinking: results.some(r => r.success)
    };
  }
};
