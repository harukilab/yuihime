import { CortexModule, ModuleType } from '../include/types';
import { SystemRegistry } from '../core/registry';

/**
 * Tool Executor Module: Secure execution of tools identified by the parser.
 */
export const ToolExecutorModule: CortexModule = {
  metadata: {
    id: 'tool-executor',
    name: 'yui-tool-executor: Sandbox Unit',
    description: 'Securely dispatches and executes tool calls requested by the AI core.',
    version: '1.1.0',
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
          description: 'Timeout in milliseconds for shell commands / run_command (default 120 seconds).'
        },
        retryLimit: {
          type: 'number',
          label: 'Retry Limit on Failure',
          default: 2,
          description: 'Number of times Yui can retry executing a tool if it fails or times out.'
        },
        maxIterationsCeiling: {
          type: 'number',
          label: 'Max Iterations Ceiling',
          default: 5,
          description: 'Hard cap for the cognitive loop iterations. The LLM may request more turns via max_iterations_override in tool arguments, but never beyond this ceiling.'
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
