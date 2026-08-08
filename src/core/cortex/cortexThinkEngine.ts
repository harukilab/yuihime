/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  AgentState, 
  Memory, 
  Dream, 
  LearnedStrategy, 
  AgentPersona, 
  Identity,
  MoodState,
  TaskPlan,
  CortexModule,
  PayloadBlueprint
} from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { APIService } from '@shared/services/api';
import { ValidationMiddleware } from '../ValidationMiddleware';
import { StorageService } from '@shared/drivers/storage';
import { LearningEngine } from '../learning';
import { StandardizedProcessor } from '../kernel/processor';
import { PromptRegistry } from '../PromptRegistry';
import { eventBus } from '@shared/core/kernel/event-bus';
import { stateMachine } from '../kernel/state-machine';
import { CognitiveScheduler } from '../kernel/CognitiveScheduler';
import { normalizeToolCall } from './toolNormalizer';
import { buildToolResultMessages, readNativeToolCalls, stripInlineToolCallFragments } from '../openaiTools';
import { StreamExtractor } from './streamExtractors';
import { toSingleString } from '@/core/kernel/configNormalizer';
import { stripCodeFences, isolateBraceBlock, liftNestedProperties } from './jsonRepairer';
import { FastTrackRunner } from './fastTrackRunner';
import { extractBestJsonObject, extractJsonObject } from './jsonExtract';
import { makeToolCall } from './cortexThinkEngineUtils';
import { compileMaxStepsPrompt, isDeliveryTool, isTransientToolError, classifyToolExecutionError } from './loopGuards.js';
import { maybeCompactContext } from './contextCompactor.js';
import { loadNativeMessages, appendNativeMessages, clearNativeMessages } from './nativeTransport.js';
import { DEFAULT_NEURAL_CORES } from '@shared/constants';
import { broadcastToWS } from '../server/apiRouter.js';
import { GlobalOutputDeduplicator } from '../kernel/GlobalOutputDeduplicator.js';
import { injectCharacterName } from '../kernel/characterName.js';
import { DynamicToolSynthesizer } from './dynamicToolSynthesizer.js';
import { LlmIoAuditor } from '../server/llmAuditor.js';
import { BackgroundToolDispatcher } from '../kernel/BackgroundToolDispatcher.js';
import { genId } from '@shared/core/idGen';
import { ApprovalGate, isApprovalReply, isDenialReply, ApprovalRequest } from './approvalGate';
import { SnapshotManager } from '../kernel/snapshotManager';

// opencode-style permission gating: tools considered risky require permission
// when tool-executor.permissionMode = ask/deny. The default list can be overridden
// via the tool-executor.riskyTools setting (array of tool ids).
const DEFAULT_RISKY_TOOLS = [
  'bash', 'apply_patch', 'write', 'edit', 'file_manager', 'code_interpreter',
  'install_addon', 'scheduler', 'manage_bgproc', 'github', 'send_file',
  'send_message', 'generate_image'
];

/**
 * Build a canonical OpenAI-native tool call object enriched with backward
 * compatible aliases (`tool`, `name`, `args`) for downstream modules.
 */

export async function executeCortexThink(
  cortexInstance: any,
  input: string,
  memories: Memory[],
  dreams: Dream[],
  capabilities: any[],
  state: AgentState,
  strategies: LearnedStrategy[],
  userName: string,
  allIdentities: Identity[],
  activePersona?: AgentPersona,
  contextId?: string,
  chatType?: string,
  taskId?: string,
  attachments?: any[],
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  db?: any
): Promise<any> {
  if (typeof window !== 'undefined') {
    try {
      const shouldStream = typeof onChunk === 'function';
      const response = await fetch('/api/cortex/think' + (shouldStream ? '?stream=true' : ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input,
          userName,
          contextId,
          chatType,
          taskId,
          attachments,
          stream: shouldStream
        }),
        signal
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      if (shouldStream) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Failed to initialize the data stream reader (readable stream).");
        
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let finalResult: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith("data: ")) continue;
            const jsonStr = cleanLine.substring(6);
            let sseError: string | null = null;
            let sseSuspended: any = null;
            try {
              const sseData = JSON.parse(jsonStr);
              if (sseData.type === "chunk") {
                onChunk!(sseData.text);
              } else if (sseData.type === "done") {
                finalResult = sseData.result;
              } else if (sseData.type === "error") {
                sseError = sseData.error;
              } else if (sseData.type === "suspended") {
                sseSuspended = {
                  suspended: true,
                  taskId: sseData.taskId,
                  response: sseData.message,
                  logs: []
                };
              }
            } catch (parseErr) {
              console.warn("[Cortex Stream Client] Failed to parse SSE line:", cleanLine, parseErr);
            }
            if (sseError) {
              throw new Error(sseError);
            }
            if (sseSuspended) {
              return sseSuspended as any;
            }
          }
        }

        if (finalResult) {
          return finalResult;
        }
        throw new Error("Data stream ended without processing the final cognition result.");
      } else {
        const data = await response.json();
        if (data.success && data.result) {
          return data.result;
        }
        throw new Error(data.error || 'Cognition server returned an invalid format');
      }
    } catch (err: any) {
      console.error('[Cortex Web Proxy Client] Failed to forward cognitive task to server:', err);
      throw err;
    }
  }

  const startTime = Date.now();
  const logs: string[] = [];
  const iterationsHistory: any[] = [];

  try {
    await cortexInstance.constructor.ensureInitialized();

  if (input && input.includes("[PRE-PROCESS: ENFORCE_JSON_ONLY]")) {
    input = input.replace("[PRE-PROCESS: ENFORCE_JSON_ONLY]", "").trim();
  }
  if (taskId) {
    CognitiveScheduler.setCurrentTask(taskId);
  }
  eventBus.emit('USER_INPUT_RECEIVED', { input, userName });
  stateMachine.transitionTo('THINKING');
  
  const patterns = LearningEngine.recognizePatterns(memories.slice(-20));
  if (patterns.length > 0) {
    logs.push(`[KERNEL] Neural Patterns Detected: ${patterns.slice(0, 3).map(p => `${p.pattern}(${p.frequency})`).join(', ')}`);
  }

  const workflow = await StorageService.getWorkflow();

  // Hybrid reasoning entry point shared across all cortex phases. Modules may
  // call `think(prompt, { model })` to invoke the user's provider gateway with
  // an optional model override (empty => user's main chat model). Never passes
  // a hardcoded model — the gateway resolves the provider's settings.
  const buildThinkFn = (): (prompt: string, opts?: { model?: string; jsonMode?: boolean }) => Promise<string> => {
    return (prompt: string, opts?: { model?: string; jsonMode?: boolean }) =>
      cortexInstance.thinkSimple(prompt, opts?.jsonMode ?? false, opts?.model);
  };
  const think = buildThinkFn();

  logs.push("[PHASE 1] Initializing Input Aggregation...");
  const settings = await cortexInstance.getSettings();

  // opencode-style approval resolution: if Yui previously asked (plan mode /
  // permission gating) and the user has just replied, resolve the request here.
  // The decision is written as a memory so the model knows the user's approval/denial.
  try {
    const approval = ApprovalGate.getInstance().get(contextId);
    if (approval && approval.status === 'pending') {
      if (isApprovalReply(input)) {
        const resolved = ApprovalGate.getInstance().approve(contextId);
        if (resolved) {
          logs.push(`[APPROVAL] User approved ${resolved.kind}: ${resolved.toolNames.join(', ')}.`);
          memories.push({
            id: 'approval_' + Date.now(),
            ownerId: 'system',
            type: 'observation',
            speaker: 'System',
            content: `[SYSTEM_APPROVAL] User approved the ${resolved.kind === 'plan' ? 'plan' : 'tool execution'}: ${resolved.toolNames.join(', ')}. Proceed with the execution.`,
            timestamp: Date.now(),
            importance: 0.8,
            tags: ['approval', contextId],
            context: contextId,
            sentiment: 0.5
          });
        }
      } else if (isDenialReply(input)) {
        const resolved = ApprovalGate.getInstance().deny(contextId);
        if (resolved) {
          logs.push(`[APPROVAL] User denied ${resolved.kind}: ${resolved.toolNames.join(', ')}.`);
          memories.push({
            id: 'denial_' + Date.now(),
            ownerId: 'system',
            type: 'observation',
            speaker: 'System',
            content: `[SYSTEM_DENIAL] User denied the ${resolved.kind === 'plan' ? 'plan' : 'tool execution'}: ${resolved.toolNames.join(', ')}. DO NOT execute the denied items; ask or offer alternatives.`,
            timestamp: Date.now(),
            importance: 0.8,
            tags: ['denial', contextId],
            context: contextId,
            sentiment: 0.5
          });
        }
      } else {
        // Unclear yes/no reply — treat as denied (conservative) to avoid
        // stalling the loop; Yui will adjust the plan.
        const resolved = ApprovalGate.getInstance().deny(contextId);
        if (resolved) {
          logs.push(`[APPROVAL] Non-explicit reply — ${resolved.kind} treated as denied.`);
        }
      }
    }
  } catch (_) {}
  const preContext = await SystemRegistry.runCortexPhase('aggregation', input, state, {
    memories,
    userName,
    allIdentities,
    config: settings,
    contextId,
    chatType,
    think
  });

  let currentPlan = preContext.currentPlan !== undefined ? preContext.currentPlan : state.currentPlan;
  if (preContext.requiresPlanning && !currentPlan) {
    logs.push(preContext.planning_signal || "[KERNEL] Generating Task Decomposition Plan...");
    const planPrompt = PromptRegistry.getInstance().compile('cortex:planning', {
      planning_directive: preContext.planning_directive || "Decompose the following request into a series of logical sub-tasks.",
      input: input
    });
    try {
      const planRaw = await cortexInstance.thinkSimple(planPrompt);
      const tags = StandardizedProcessor.extractTags(planRaw);
      const planData = JSON.parse(tags.plan || planRaw);
      currentPlan = {
        id: genId(9),
        originalGoal: input,
        tasks: planData.tasks.map((t: any, i: number) => ({ 
          id: t.id || `task_${i+1}`, 
          description: t.description || t.task || "Unknown segment", 
          status: 'pending' 
        })),
        currentTaskIndex: 0,
        isComplete: false
      };
      logs.push(`[KERNEL] Neural Plan established with ${currentPlan.tasks.length} cognitive nodes.`);
    } catch (e) {
      logs.push("[KERNEL] Planning failed. Falling back to linear execution.");
    }
  }

  logs.push("[PHASE SOUL] Processing Emotional State...");
  let finalAnswer: string | null = null;

  const soulContext = await SystemRegistry.runCortexPhase('soul' as any, input, state, { ...preContext, think });

  if (soulContext.subAgentDelegation?.delegated && soulContext.subAgentDelegation?.shouldUseDirectResponse && soulContext.subAgentResponse) {
    console.log(`[CORTEX] Sub-agent delegation successful. Using sub-agent response directly.`);
    finalAnswer = soulContext.subAgentResponse;
    logs.push(`[SUB_AGENT] Response delegated to ${soulContext.subAgentDelegation.agentId}`);
  }
  
  let resolvedPersona = activePersona;
  try {
    let targetId = state.activePersonaId || 'auto';

    if (targetId !== 'auto' && db) {
      const customPersonaRow = db.prepare("SELECT * FROM custom_personas WHERE id = ?").get(targetId);
      if (customPersonaRow) {
        resolvedPersona = {
          id: customPersonaRow.id,
          name: customPersonaRow.name,
          description: customPersonaRow.description,
          systemPrompt: customPersonaRow.systemPrompt || '',
          traits: customPersonaRow.traits ? JSON.parse(customPersonaRow.traits) : [],
          color: customPersonaRow.color,
          archetype: customPersonaRow.archetype,
        };
      } else {
        db.prepare("UPDATE agent_state SET activePersonaId = 'auto' WHERE id = 1").run();
        targetId = 'auto';
      }
    }

    if (!resolvedPersona || resolvedPersona.id === 'auto' || targetId === 'auto') {
      const isAuto = targetId === 'auto' || resolvedPersona?.id === 'auto';
      if (isAuto) {
        const lower = String(input || '').toLowerCase();
        let autoCoreId = 'hiyori';
        if (/\b(code|function|bug|error|script|const|import|class|math|logic|system|api|json|sql|debug|algorithm)\b/i.test(lower)) {
          autoCoreId = 'aether';
        } else if (/\b(joke|story|funny|game|play|random|creative|poem|song|meme)\b/i.test(lower)) {
          autoCoreId = 'nova';
        } else if (/\b(love|cinta|sayang|kiss|hug|flirt|sweet|romantis|ero|ecchi|mesra|bucin|peluk|cium|seksi|kisses)\b/i.test(lower)) {
          autoCoreId = 'ero';
        }
        const matched = DEFAULT_NEURAL_CORES.find(c => c.id === autoCoreId) || DEFAULT_NEURAL_CORES[2];
        resolvedPersona = {
          ...matched,
          id: 'auto',
          name: `Auto-Select Core [${matched.name}]`,
        };
      } else {
        resolvedPersona = DEFAULT_NEURAL_CORES.find(c => c.id === targetId) || DEFAULT_NEURAL_CORES[2];
      }
    }
  } catch (e) {
    console.warn("[CORTEX] Could not load DEFAULT_NEURAL_CORES for persona fallback", e);
  }

  logs.push("[PHASE 2] Constructing Compressed Payload...");
  const augContext = await SystemRegistry.runCortexPhase('compression', input, state, {
    ...soulContext,
    activePersona: resolvedPersona,
    dreams,
    currentPlan,
    contextId,
    chatType,
    userName,
    think
  });

  console.log("[DEBUG_TRACE] PHASE 2 COMPLETE, entering gateway phase");
  logs.push("[PHASE 3] Gateway Active: Selecting Optimal Provider...");
  const gateway = SystemRegistry.getModule<CortexModule>('provider-gateway');
  console.log("[DEBUG_TRACE] gateway module found:", !!gateway);
  
  if (!gateway) {
    logs.push("[PHASE 3] CRITICAL FAILURE: Provider Gateway module not found.");
    throw new Error("Neural Gateway is missing. Critical system failure.");
  }

  let loopInput = input;
  if (attachments && attachments.length > 0) {
    loopInput += "\n\n[SYSTEM_ATTACHMENTS]:";
    for (const att of attachments) {
      loopInput += `\n- File: ${att.name} (${att.mimeType}, ${att.size} bytes)`;
      if (att.text) {
        loopInput += `\n  Text Contents:\n  ---\n  ${att.text}\n  ---`;
      }
    }
  }
  let snapshot = taskId ? CognitiveScheduler.resumeTask(taskId) : null;
  let iteration = snapshot ? snapshot.currentStep : 0;
  if (snapshot && snapshot.observationHistory) {
    memories = snapshot.observationHistory as Memory[];
    logs.push(`[CORTEX] Restored observation history containing ${memories.length} entries from suspended task snapshot.`);
  }
  // General agent loop: iterations run until the model stops calling tools
  // (final_answer/speak) or the request is aborted. `maxIterations` is a
  // last-resort safety cap (default 50, configurable via
  // `tool-executor.maxIterations`) — it does NOT bound normal reasoning. The
  // final iteration is a shutdown turn (tools disabled, model must summarize).
  // Parallel multi-tool execution stays enabled.
  let maxIterations = Number(settings['tool-executor']?.maxIterations) || 50;
  let loopContext = { ...augContext, config: settings, think };
  loopContext.compactionTurns = [];
  loopContext.compactionCheckpoint = undefined;
  loopContext.compactionSummary = undefined;
  // Native transport (Kilo/opencode-style): durable message parts per session,
  // loaded on loop start and appended after every executed tool turn. Off by
  // default — JSON-in-prompt transport remains the active path unless the flag
  // is enabled.
  const nativeTransportEnabled = settings['tool-executor']?.nativeTransport === true || settings.nativeTransport === true;
  const nativeSessionId = contextId || 'web_default';
  loopContext.nativeTurnBlocks = [];
  // Expose the flag to providers: Gemini attaches functionDeclarations whenever
  // native transport is active (no separate geminiNativeTools toggle needed).
  loopContext.nativeTransportEnabled = nativeTransportEnabled;
  if (nativeTransportEnabled) {
    loopContext.nativeHistory = loadNativeMessages(nativeSessionId);
    loopContext.nativeSessionId = nativeSessionId;
    logs.push(`[CORTEX] Native transport enabled. Loaded ${loopContext.nativeHistory.length} persisted native message(s).`);

    // Phase 5: rebuild the interleaved per-turn history from the durable store
    // so a fresh think call feeds the provider the full multi-turn native
    // context (assistant tool_calls immediately followed by role:"tool" rows),
    // not just the current prompt. Groups tool rows under the preceding
    // assistant(tool_calls) row, mirroring the canonical block shape.
    const blocks: any[][] = [];
    let currentBlock: any[] | null = null;
    for (const m of loopContext.nativeHistory) {
      if (m && m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        currentBlock = [{ role: 'assistant', content: null, tool_calls: m.tool_calls }];
        blocks.push(currentBlock);
      } else if (m && m.role === 'tool' && currentBlock) {
        currentBlock.push(m);
      } else {
        currentBlock = null;
      }
    }
    loopContext.nativeTurnBlocks = blocks;
    if (blocks.length > 0) {
      logs.push(`[CORTEX] Rebuilt ${blocks.length} interleaved native turn block(s) from persisted history.`);
    }
  }

  // Native transport spans every provider (OpenAI-compatible, Anthropic, and
  // Gemini): Gemini's generateContent now converts the interleaved turn blocks
  // into functionCall/functionResponse contents, so it no longer needs the
  // JSON-in-prompt path when the flag is on.
  // The active provider is resolved by the provider gateway (which may auto-
  // switch across the system pool when the primary fails). It starts from the
  // configured provider and is updated to the gateway-reported winner on each
  // iteration so subsequent turns keep using the healthy provider.
  let activeProviderId = settings.provider || 'gemini';
  const usesJsonPrompt = !nativeTransportEnabled;

  if (!state.systemHealth) {
    state.systemHealth = { latency: 0, successRate: 1.0, tasksCompleted: 0 };
  }
  if (state.systemHealth.consecutive_formatting_errors === undefined) {
    state.systemHealth.consecutive_formatting_errors = 0;
  }

  if (usesJsonPrompt && loopContext.assembledSystemPrompt) {
      loopContext.assembledSystemPrompt = loopContext.assembledSystemPrompt.replace(
        /## Format Respons Khusus[\s\S]*?(?=## Eksekusi Tugas|$)/i,
        `## Response Format (JSON MODE ACTIVE):
Strict JSON mode is enabled. You are FORBIDDEN from using raw XML tags.
Instead, you MUST strictly output a single JSON object matching the JSON Schema defined in the cortex:json_enforcement directive. Place your main verbal dialogue inside the "final_answer" key at the root of the JSON object (or under the "final_answer" tool call's arguments if calling tools).
Ensure your "thought" field is extremely short (under 1 sentence, or empty). Animations and mood_impact must be mapped to their respective JSON keys.
When calling tools, your "tool_calls" array MUST use the OpenAI-native shape: each item is an object with "id" (unique string like "call_abc123"), "type": "function", and "function": { "name": string, "arguments": object }. The "arguments" MUST be a JSON object (never a string). Always generate a unique "id" so tool results can be paired back to each call.
\n\n`
      );
      const jsonEnforcementDirective = PromptRegistry.getInstance().compile('cortex:json_enforcement', {});
      loopContext.assembledSystemPrompt += "\n\n" + jsonEnforcementDirective;
    }

  // Native transport (Kilo/opencode-style): when the flag is on for a native-
  // capable provider, the JSON-mode block above is skipped entirely (clean,
  // directive-free system prompt) and this native function-calling directive is
  // appended instead. Gemini (or nativeTransport off) keeps json_enforcement.
  if (nativeTransportEnabled) {
    const nativeDirective = PromptRegistry.getInstance().compile('cortex:native_function_calling', {});
    loopContext.assembledSystemPrompt = (loopContext.assembledSystemPrompt || "") + "\n\n" + nativeDirective;
  }

  let toolsToCall: any[] = snapshot ? (snapshot.toolsToExecute || []) : [];
  let processedResponse = "";
  let speakDeliveredDirectly = false;
  // Cron one-reply guard: when a cron/scheduler tool succeeds in this turn and a
  // speak already delivered its confirmation directly, the redundant final answer
  // (a second message on the same channel) must be swallowed.
  let cronActionDoneThisTurn = false;
  // opencode-style recovery guard: if a real tool (not speak/final_answer/status_update)
  // failed on a previous iteration, the loop must not break right away just because the model
  // gave a final answer — give one chance to correct (similar to opencode, which
  // returns the tool error to the model then continues until the model is truly done).
  let realToolFailurePending = false;
  let animations: string[] = snapshot ? (snapshot.accumulatingBuffer?.animations || []) : [];
  let moodImpact: any = snapshot ? (snapshot.accumulatingBuffer?.moodImpacts || {}) : {};
  const toolExecutionHistory: any[] = [];
  const loopGeneratedMemories: any[] = [];

  let skipGatewayForResume = (snapshot && toolsToCall.length > 0) ? true : false;

  while (iteration < maxIterations) {
    iteration++;
    // Final iteration doubles as the graceful shutdown turn (Kilo MAX_STEPS_PROMPT):
    // tools are disabled and the model is asked to summarize instead of being
    // hard-cut, so the loop always ends with a coherent response.
    const shutdownRequested = (signal as any)?.shutdownRequested === true;
    const isLastStep = iteration >= maxIterations || shutdownRequested;

    if (signal?.aborted) {
      logs.push(`[CORTEX] Abort signal detected in loop iteration ${iteration}. Terminating loop gracefully.`);
      throw new Error("COGNITIVE_LOOP_ABORTED: Request was aborted by the client.");
    }
    if (taskId && CognitiveScheduler.getCurrentTask() !== taskId) {
      logs.push(`[CORTEX] Interrupt detected! Task ${taskId} is suspended because another task took priority.`);
      const snapshot = {
        taskId,
        originalPrompt: input,
        currentStep: iteration,
        accumulatingBuffer: {
          animations: animations,
          moodImpacts: moodImpact
        },
        toolsToExecute: toolsToCall,
        observationHistory: memories,
        contextId,
        chatType,
        userName
      };
      CognitiveScheduler.suspendTask(taskId, snapshot);
      throw new Error(`TASK_SUSPENDED: Interrupted by a higher-priority task.`);
    }

    logs.push(`[CORTEX_LOOP] Turn Iteration ${iteration} starting...`);

    // --- AREA 2: Looped AGI reflection (opt-in, default OFF) ---
    // Re-runs HighOrderMetacognition / SelfAwarenessMirror per iteration so they
    // audit the *current* loop state (tool history) instead of guessing upfront.
    // Guarded by config flag to keep the default path unchanged.
    const agiReflectCfg = (settings as any)?.['yuiagi-reasoning'] || {};
    const enableLoopedReflection = agiReflectCfg.enableLoopedReflection === true;
    if (enableLoopedReflection && iteration >= 1) {
      try {
        logs.push(`[reflect] Running looped self-reflection (iteration ${iteration})...`);
        const reflectContext = await SystemRegistry.runCortexPhase('reflect' as any, input, state, {
          ...loopContext,
          toolExecutionHistory,
          iteration,
          config: settings,
          think
        });
        // Merge reflective directives back into the loop context
        loopContext = {
          ...loopContext,
          ...reflectContext,
          soulDirective: [loopContext.soulDirective, reflectContext.soulDirective]
            .filter(Boolean).join('\n\n')
        };
      } catch (reflectErr: any) {
        logs.push(`[reflect] Non-blocking reflection failure: ${reflectErr?.message || reflectErr}`);
      }
    }
    // --- END AREA 2 ---

    // Native transport spans every provider when the flag is on: the loop
    // consumes tool calls from the provider's native channel (OpenAI tool_calls,
    // Anthropic tool_use, Gemini functionCall) instead of JSON-in-prompt.
    const iterationUsesNative = nativeTransportEnabled;
    const providerSpecificConfig = settings[activeProviderId] || {};
    const targetModelId = toSingleString(providerSpecificConfig.model) || 'gemini-flash-latest';

    if (!iterationUsesNative && iteration > 1 && toolExecutionHistory.length > 0) {
      const lastExecuted = toolExecutionHistory[toolExecutionHistory.length - 1];
      if (lastExecuted && lastExecuted.results) {
        loopInput = input + `\n\n[SYSTEM_OBSERVATION]: Tool execution results from the previous step:\n${JSON.stringify(lastExecuted.results)}`;
      }
    }

    const loopSettings = {
      ...settings,
      provider: activeProviderId,
      [activeProviderId]: {
        ...(settings[activeProviderId] || {}),
        isJson: iterationUsesNative ? false : true
      }
    };

    let activeIterationInput = loopInput;
    if (iteration === 1 && !iterationUsesNative) {
      activeIterationInput += "\n\n[CRITICAL PRE-PROCESSING DIRECTIVE (FIRST PASS)]: You are strictly prohibited from writing conversational/speech text if you are calling tools. If you populate the \"tool_calls\" array with tool calls (e.g., search_web, read_url, bash, etc.), you MUST keep the \"speech\" field entirely empty (\"\") in this iteration! Your conversational response will be formulated in the subsequent pass once tools have executed. Only if you are not calling any tools should you output speech. Output valid JSON matching the schema.";
    }
    if (isLastStep) {
      activeIterationInput += `\n\n${compileMaxStepsPrompt(settings)}`;
      if (shutdownRequested) {
        logs.push(`[CORTEX_LOOP] Iteration ${iteration} is the graceful shutdown turn (soft pipeline deadline requested). Tools disabled; model must summarize.`);
      } else {
        logs.push(`[CORTEX_LOOP] Iteration ${iteration} is the final shutdown turn (max ${maxIterations}). Tools disabled; model must summarize.`);
      }
    }

    // Anchored compaction: when accumulated tool history threatens the context
    // window, summarize the earlier turns, keep the recent tail verbatim, and
    // prepend a <conversation-checkpoint> block (non-blocking on failure).
    const preCompactPairs = Array.isArray(loopContext.compactionTurns) ? loopContext.compactionTurns.length : 0;
    try {
      activeIterationInput = await maybeCompactContext({
        loopContext,
        settings,
        logs,
        activeIterationInput,
        activeProviderId,
        think
      });
    } catch (compactErr: any) {
      logs.push(`[COMPACTION] Non-blocking compaction error: ${compactErr?.message || compactErr}`);
    }
    const postCompactPairs = Array.isArray(loopContext.compactionTurns) ? loopContext.compactionTurns.length : preCompactPairs;
    const didCompact = postCompactPairs < preCompactPairs;

    // Phase 5: only when the anchored compactor actually trimmed the in-loop
    // history do we keep the durable native store (nativeTurnBlocks + persisted
    // native_messages) consistent: drop the summarized head blocks so a future
    // turn / resume reloads the compacted context instead of the full one.
    // Guarded by `didCompact` — a fresh think loads persisted history into
    // nativeTurnBlocks while compactionTurns starts empty, so without this guard
    // the first iteration would spuriously wipe the reloaded history.
    if (nativeTransportEnabled && didCompact) {
      const turnBlocks = Array.isArray(loopContext.nativeTurnBlocks) ? loopContext.nativeTurnBlocks : [];
      if (turnBlocks.length > 0) {
        // Drop oldest whole blocks until the remaining tool rows fit the kept
        // recent tail (never below one block; parallel calls may exceed by a
        // few rows, which is safe — the store keeps a superset, never a gap).
        let keptCalls = turnBlocks.reduce((acc: number, b: any[]) => acc + b.filter((m: any) => m.role === 'tool').length, 0);
        let drop = 0;
        while (drop < turnBlocks.length - 1) {
          const blockCalls = turnBlocks[drop].filter((m: any) => m.role === 'tool').length;
          if (keptCalls - blockCalls <= postCompactPairs) break;
          keptCalls -= blockCalls;
          drop++;
        }
        const keptBlocks = turnBlocks.slice(drop);
        loopContext.nativeTurnBlocks = keptBlocks;
        const seedUser =
          (Array.isArray(loopContext.nativeHistory) && loopContext.nativeHistory.find((m: any) => m && m.role === 'user')) ||
          { role: 'user', content: input };
        const rebuilt: any[] = [seedUser];
        for (const block of keptBlocks) {
          for (const msg of block) {
            rebuilt.push(msg);
          }
        }
        loopContext.nativeHistory = rebuilt;
        try {
          clearNativeMessages(nativeSessionId);
          appendNativeMessages(nativeSessionId, rebuilt);
        } catch (rewriteErr: any) {
          logs.push(`[COMPACTION] Native store rewrite failed (non-blocking): ${rewriteErr?.message || rewriteErr}`);
        }
        logs.push(`[COMPACTION] Trimmed persisted native_messages to ${rebuilt.length} row(s) (kept ${keptBlocks.length} recent turn block(s)).`);
      }
    }

    const requestPayloadBlueprint: PayloadBlueprint = {
      model: targetModelId,
      messages: [
        {
          role: 'system',
          content: loopContext.assembledSystemPrompt || ''
        },
        {
          role: 'user',
          content: activeIterationInput
        }
      ],
      temperature: providerSpecificConfig.temperature ?? 0.7,
      top_p: providerSpecificConfig.topP ?? 0.95,
      max_tokens: providerSpecificConfig.maxOutputTokens || 65536,
      ...(iterationUsesNative ? {} : {
        response_format: {
          type: 'json_object'
        }
      })
    };

    loopContext.payloadBlueprint = requestPayloadBlueprint;
    if (loopSettings[activeProviderId]) {
      loopSettings[activeProviderId].payloadBlueprint = requestPayloadBlueprint;
    }

    const extractor = new StreamExtractor(false, (delta: string) => {
      if (onChunk) {
        onChunk(delta);
      }
    });

    if (skipGatewayForResume) {
      loopContext.rawResult = JSON.stringify({
        thought: "Resuming task and executing pending tools.",
        tool_calls: toolsToCall,
        animations: animations,
        mood_impact: moodImpact
      });
      logs.push(`[CORTEX] Resuming task: Bypassing Gateway query. Tools to run: ${JSON.stringify(toolsToCall)}`);
      skipGatewayForResume = false; // Reset for subsequent iterations
    } else {
      console.log("[DEBUG_TRACE] calling gateway.run now");
      const gwT0 = Date.now();
      loopContext.disableTools = isLastStep;
      // Phase 5 (Kilo parity): on the final agent step force tool_choice 'none'
      // so the model MUST answer with plain text (complements compileMaxStepsPrompt
      // and the tool stripping via disableTools). Undefined otherwise = provider default.
      loopContext.toolChoice = isLastStep ? 'none' : undefined;
      loopContext = await gateway.run(activeIterationInput, state, { 
        ...loopContext, 
        config: loopSettings, 
        attachments,
        signal: signal,
        onChunk: (chunk: string) => {
          extractor.feed(chunk);
        }
      });
      console.log(`[DEBUG_TRACE] gateway.run returned after ${((Date.now() - gwT0) / 1000).toFixed(1)}s, rawResult length=${(loopContext.rawResult || "").length}`);
      if (loopContext.activeProvider && loopContext.activeProvider !== activeProviderId) {
        activeProviderId = loopContext.activeProvider;
        logs.push(`[CORTEX_LOOP] Gateway auto-switched active provider to: ${activeProviderId}`);
      }
    }
    logs.push(`[CORTEX_LOOP] Iteration ${iteration} Gateway routed via: ${loopContext.activeProvider || 'unknown'}`);

    const rawResultStr = (loopContext.rawResult || "").trim();

    // Native transport: consume the model output from the provider's native
    // tool channel. readNativeToolCalls returns the canonical array when the
    // model emitted tool_calls / tool_use / functionCall, or null when the reply
    // is plain text — in which case it is the final answer and the loop exits
    // (Kilo/opencode: finish != "tool-calls" => stop).
    const responseUsesNative = iterationUsesNative;

    // Phase 4: the legacy root-JSON schema validation only applies to the JSON
    // transport. In the native channel the raw output is an API envelope or
    // plain text, so skip it to avoid [SCHEMA_ERROR] noise and validate the
    // carrier tool args (`final_answer`) via the tool's own schema instead.
    if (!responseUsesNative) {
      const validation = ValidationMiddleware.validate(rawResultStr);
      if (!validation.success) {
        logs.push(`[CORTEX_LOOP] [SCHEMA_ERROR] Output failed strict validation: ${validation.errors.join(' | ')}`);
      }
    }

    let parsedPayload: any = null;
    let parseError: string | null = null;

    if (responseUsesNative) {
      const nativeCalls = readNativeToolCalls(rawResultStr, loopContext.activeProvider || 'openai');
      if (Array.isArray(nativeCalls) && nativeCalls.length > 0) {
        parsedPayload = {
          thought: loopContext.thought || "",
          speech: "",
          animations: [],
          mood_impact: {},
          tool_calls: nativeCalls
        };
        logs.push(`[CORTEX_NATIVE] Detected ${nativeCalls.length} native tool call(s) from '${loopContext.activeProvider || 'unknown'}' and consuming them via the tool channel.`);
      } else if (rawResultStr.trim().length > 0) {
        processedResponse = stripInlineToolCallFragments(rawResultStr);
        logs.push(`[CORTEX_NATIVE] No native tool calls; captured plain-text final reply (${rawResultStr.length} chars).`);
        break;
      }
    }

    const cleanJsonStr = APIService.cleanAIOutput(rawResultStr);

       if (!parsedPayload) {
          const bestJson = extractBestJsonObject(cleanJsonStr || rawResultStr);
          if (bestJson) {
             try {
                parsedPayload = JSON.parse(bestJson);
                logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT using balanced-object extraction.");
                if (liftNestedProperties(parsedPayload)) {

                   logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");

                }
             } catch {}
          }
       }

       try {
          let repaired = cleanJsonStr;
           let directParseOk = false;
            try {
               const _parseMatch = extractJsonObject(cleanJsonStr);
               parsedPayload = _parseMatch ? JSON.parse(_parseMatch) : null;
               directParseOk = true;
               logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT response layout directly.");
           } catch (_) {
              repaired = StandardizedProcessor.locallyRepairJson(cleanJsonStr);
           }
           if (!directParseOk) { const _rMatch = extractJsonObject(repaired); parsedPayload = _rMatch ? JSON.parse(_rMatch) : null; }
          logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT response layout.");
          if (liftNestedProperties(parsedPayload)) {

             logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");

          }
       } catch (err: any) {
          parseError = err?.message || String(err);
          const bestJson = extractBestJsonObject(cleanJsonStr || rawResultStr);
          if (bestJson) {
             try {
                parsedPayload = JSON.parse(bestJson);
                logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT using balanced-object extraction in catch fallback.");
                if (liftNestedProperties(parsedPayload)) {

                   logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");

                }
                parseError = null;
             } catch {}
          }
           if (!parsedPayload) {
              const isolatedBrace = isolateBraceBlock(cleanJsonStr);
              if (isolatedBrace !== cleanJsonStr) {
                    try {
                        const _bStr = isolatedBrace;
                        const _bMatch = extractJsonObject(_bStr);
                       parsedPayload = _bMatch ? JSON.parse(_bMatch) : null;
                       logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT using bracket isolation.");
                   if (liftNestedProperties(parsedPayload)) {

                      logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");

                   }
                   parseError = null;
                } catch (err2: any) {
                   parseError = err2?.message || String(err2);
                }
             }
          }
       }

       if (!parsedPayload && rawResultStr && rawResultStr.trim().length > 0) {
          try {
             const xmlParsed = StandardizedProcessor.parseLLMResponse(rawResultStr, null);
             if (xmlParsed && typeof xmlParsed === 'object' && Object.keys(xmlParsed).length > 0 && 
                (xmlParsed.thought || xmlParsed.thoughts || xmlParsed.final_answer || xmlParsed.speech || xmlParsed.opening_response || xmlParsed.tool_calls || xmlParsed.tools_to_call)) {
                parsedPayload = {
                   thought: xmlParsed.thought || xmlParsed.thoughts || injectCharacterName("${characterName} processes inner intuition using XML/tag structure."),
                    final_answer: xmlParsed.final_answer ?? xmlParsed.speech ?? xmlParsed.opening_response ?? rawResultStr,
                   animations: xmlParsed.animations || ["SMILE"],
                   tool_calls: xmlParsed.tool_calls || xmlParsed.tools_to_call || []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Succeeded in parsing XML fallback layout BEFORE engaging LLM repairer.");
             }
          } catch (e: any) {
            console.warn("[CORTEX:FastTrack] Browser fallback error:", e.message);
          }

          if (!parsedPayload && rawResultStr.trim().length > 0) {
             parsedPayload = {
                thought: "Receiving the plain non-JSON response from the neural provider directly to preserve conversation continuity.",
                final_answer: rawResultStr,
                animations: ["SMILE"],
                tool_calls: []
             };
             logs.push("[CORTEX_LOOP] [COMPATIBILITY] Detected raw plain text response, wrapped directly.");
          }
     }

    if (parsedPayload) {
      let rebuiltResponseStr = "";
      let finalThought = parsedPayload.thought || parsedPayload.thoughts || "";
      if (finalThought && settings.thoughtProcessSuffix) {
        finalThought = finalThought.trim() + " " + settings.thoughtProcessSuffix;
      }
      if (finalThought) {
        rebuiltResponseStr += `<thought>${finalThought}</thought>\n`;
      }
      if (parsedPayload.animations) {
        rebuiltResponseStr += `<animations>${JSON.stringify(parsedPayload.animations)}</animations>\n`;
      }
      if (parsedPayload.mood_impact) {
        rebuiltResponseStr += `<mood_impact>${JSON.stringify(parsedPayload.mood_impact)}</mood_impact>\n`;
      }
      
      let rawToolsCall = parsedPayload.tool_calls || parsedPayload.tools_to_call || [];
      if (typeof rawToolsCall === 'string') {
        try {
          const cleanedStr = stripCodeFences(rawToolsCall);
          rawToolsCall = JSON.parse(cleanedStr);
        } catch (e) {
          console.warn('[CORTEX_LOOP] Failed parsing raw tools string as JSON:', e);
          rawToolsCall = [];
        }
      }
      if (rawToolsCall.length === 0 && parsedPayload.tool) {
        rawToolsCall = [normalizeToolCall(parsedPayload)];
        logs.push(`[CORTEX_LOOP] Detected single tool call structure (tool: ${parsedPayload.tool}). Wrapped into tool_calls list.`);
      }

      if (Array.isArray(rawToolsCall)) {
        rawToolsCall = rawToolsCall.map(normalizeToolCall).filter(Boolean);
      } else {
        rawToolsCall = [];
      }

      // Shutdown turn: enforce the MAX_STEPS constraint by discarding any
      // non-delivery tool call the model still emitted (Kilo: "Tools are
      // disabled after the maximum agent steps").
      if (isLastStep && rawToolsCall.length > 0) {
        const discarded = rawToolsCall.filter((tc: any) => !isDeliveryTool(tc?.tool || tc?.name));
        if (discarded.length > 0) {
          logs.push(`[MAX_STEPS] Tools are disabled after the maximum agent steps; discarded tool call(s): ${discarded.map((tc: any) => tc?.tool || tc?.name || '?').join(', ')}.`);
          rawToolsCall = rawToolsCall.filter((tc: any) => isDeliveryTool(tc?.tool || tc?.name));
        }
      }

      let speechText = (parsedPayload.speech || parsedPayload.final_answer || parsedPayload.response || "").trim();

      if (speechText && (speechText.includes('<tool_call>') || /^[\s\S]*"tool_calls"\s*:\s*\[/.test(speechText))) {
        speechText = "";
      }

      if (rawToolsCall.length > 0) {
        const hasFinalReply = rawToolsCall.some((tc: any) => tc.tool === 'speak' || tc.tool === 'final_answer');
        if (!hasFinalReply && speechText.length > 0) {
          const blockingTools = [
            'websearch', 'search', 'search_internet', 'google_search', 'bing_search', 'duckduckgo_search',
            'execute_sql', 'cloudsql_execute_sql', 'query_database',
            'read_url', 'read_webpage', 'browse_url', 'fetch_url', 'visit_url',
            'tensorart_generate', 'generate_image', 'image_generate', 'dall_e', 'stable_diffusion',
            'bash', 'shell',
            'read', 'glob', 'list_dir', 'file_read', 'get_file_contents',
            'get_weather', 'check_weather', 'weather',
            'translate', 'translation',
            'call_api', 'http_request', 'fetch_data'
          ];
          const hasBlockingTool = rawToolsCall.some((tc: any) => blockingTools.includes(tc.tool || tc.name));
          if (!hasBlockingTool) {
            logs.push("[CORTEX_LOOP] Non-blocking tools detected alongside speech. Injecting speak tool in parallel.");
            rawToolsCall.push(makeToolCall('speak', {
              speech: speechText,
              animations: parsedPayload.animations || ["TALK", "SMILE"],
              mood_impact: parsedPayload.mood_impact || {}
            }));
          } else {
            logs.push("[CORTEX_LOOP] Blocking tools detected. Deferring final_answer to next iteration so Yui can incorporate tool results into her response.");
          }
        }
      }

      if (rawToolsCall.length === 0) {
        logs.push("[CORTEX_LOOP] No tool call detected, compiling fallback to final_answer.");
        // To comply with cognition instructions: if final_answer is empty (speechText empty), do not fail-safe into thought or a placeholder.
        const fallbackSpeech = speechText;
        rawToolsCall = [makeToolCall('speak', {
          speech: fallbackSpeech,
          animations: parsedPayload.animations || ["TALK", "SMILE"],
          mood_impact: parsedPayload.mood_impact || {}
        })];
      }

      if (rawToolsCall.length > 0) {
        rebuiltResponseStr += `<tool_calls>${JSON.stringify(rawToolsCall)}</tool_calls>\n`;
      }

      loopContext.rawResult = rebuiltResponseStr;
      const finalReplyCall = rawToolsCall.find((tc: any) => tc.tool === 'speak' || tc.tool === 'final_answer');
      
      loopContext.processedResponse = finalReplyCall && finalReplyCall.args?.speech ? finalReplyCall.args.speech : speechText;
      loopContext.thought = finalThought;
      loopContext.animations = finalReplyCall && finalReplyCall.args?.animations ? finalReplyCall.args.animations : (parsedPayload.animations || []);
      loopContext.moodImpact = finalReplyCall && finalReplyCall.args?.mood_impact ? finalReplyCall.args.mood_impact : (parsedPayload.mood_impact || {});
      loopContext.toolsToCall = rawToolsCall;
      loopContext.parsedData = parsedPayload;

      state.systemHealth.consecutive_formatting_errors = 0;
    } else {
      logs.push("[CORTEX_LOOP] [FORMAT_ERROR] Output fails to parse as valid JSON. Treating raw output as plain text to preserve character conversation.");
      state.systemHealth.consecutive_formatting_errors = (state.systemHealth.consecutive_formatting_errors || 0) + 1;

      parsedPayload = {
        thought: "Synaptic formatting error, falling back to clean plain text stream recovery.",
        final_answer: rawResultStr || "",
        animations: ["SMILE"],
        tool_calls: []
      };

      loopContext.rawResult = rawResultStr;
      loopContext.processedResponse = stripInlineToolCallFragments(rawResultStr);
      loopContext.thought = parsedPayload.thought;
      loopContext.animations = parsedPayload.animations;
      loopContext.moodImpact = {};
      loopContext.toolsToCall = [];
      loopContext.parsedData = parsedPayload;
    }

    try {
      const middlewareRes = APIService.validateLLMResponse(loopContext.rawResult || "");
      if (!middlewareRes.success) {
        logs.push(`[SCHEMA_MIDDLEWARE] Captured LLM response containing invalid tool call configurations: ${middlewareRes.errors.join(' | ')}`);
      } else {
        logs.push(`[SCHEMA_MIDDLEWARE] Captured response verified successfully (Zero issues or no tool requests).`);
      }
    } catch (middlewareErr: any) {
      console.error("[CORTEX] Schema validation middleware error:", middlewareErr.message || String(middlewareErr));
    }

    logs.push("[PHASE 3+] Verifying Neural Integrity...");
    const verifier = SystemRegistry.getModule<CortexModule>('neural-verifier');
    if (verifier && !iterationUsesNative) {
      loopContext = await verifier.run(loopContext.rawResult || "", state, loopContext);
      if (loopContext.verifierStatus === 'corrected') logs.push("[KERNEL] Verifier performed structural repair.");
    }

    logs.push("[PHASE 4] Hub Active: Parallel Streamer Synchronization...");
    const streamer = SystemRegistry.getModule<CortexModule>('parallel-streamer');
    if (streamer && !iterationUsesNative) {
       loopContext = await streamer.run(loopContext.rawResult || "", state, loopContext);
       logs.push("[CORTEX_LOOP] Neural signals converged at Parallel Hub.");
    } else {
       const parser = SystemRegistry.getModule<CortexModule>('neural-loop');
       if (parser) {
         loopContext = await parser.run(loopContext.rawResult || "", state, loopContext);
       }
    }

    const iterResponse = typeof loopContext.processedResponse === 'string' ? loopContext.processedResponse : loopContext.rawResult;
    if (iterResponse && iterResponse.trim().length > 0) {
      if (!processedResponse || processedResponse.trim().length < 5) {
        processedResponse = iterResponse;
      }
    }
    toolsToCall = loopContext.toolsToCall || [];
    animations = loopContext.animations || [];
    moodImpact = loopContext.moodImpact || {};

    let currentThought = loopContext.thought;
    if (!currentThought && loopContext.rawResult) {
      const matches = loopContext.rawResult.match(/<(thought|think|thinking|reasoning)>([\s\S]*?)<\/\1>/i);
      if (matches) {
        currentThought = matches[2].trim();
      } else {
        const lines = loopContext.rawResult.split('\n');
        const thoughtLines = lines.filter((l: string) => {
          const low = l.trim().toLowerCase();
          return low.startsWith('thought:') || low.startsWith('thinking:') || low.startsWith('[thought]') || low.startsWith('*thought');
        });
        if (thoughtLines.length > 0) {
          currentThought = thoughtLines.map((l: string) => l.trim().replace(/^(thought|thinking):/gi, '').trim()).join('. ');
        }
      }
    }
    if (!currentThought) {
      currentThought = injectCharacterName(`\${characterName} processes inner intuition on iteration ${iteration}...`);
    }

    iterationsHistory.push({
      iteration,
      thought: currentThought,
      observations: []
    });

    if (toolsToCall.length > 0) {
      const seen = new Map<string, any>();
      const dedupedToolsToCall = toolsToCall.filter((tc: any) => {
        const name = tc.tool || tc.name;
        const args = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {});
        const key = `${name}::${args}`;
        if (seen.has(key)) {
          logs.push(`[CORTEX_DEDUP] Skipping duplicate tool call: ${name} with identical arguments.`);
          return false;
        }
        seen.set(key, tc);
        return true;
      });

      if (dedupedToolsToCall.length !== toolsToCall.length) {
        logs.push(`[CORTEX_DEDUP] Removed ${toolsToCall.length - dedupedToolsToCall.length} duplicate tool call(s).`);
        toolsToCall = dedupedToolsToCall;
      }

      // LLM-configurable iteration ceiling: the model may request more turns via
      // `max_iterations_override` inside a tool call's arguments. The request is
      // capped at maxIterations + `tool-executor.maxIterationsCeiling` (default 5,
      // hard safety cap 50) and never lowers the current max.
      try {
        const configured = settings['tool-executor']?.maxIterationsCeiling !== undefined
          ? Number(settings['tool-executor'].maxIterationsCeiling)
          : 5;
        const ceiling = Math.min(configured, 50);
        for (const tc of toolsToCall) {
          const override = tc?.args?.max_iterations_override ?? tc?.function?.arguments?.max_iterations_override;
          if (typeof override === 'number' && override > maxIterations && override <= maxIterations + ceiling) {
            maxIterations = Math.min(Math.floor(override), maxIterations + ceiling);
            logs.push(`[CORTEX] max_iterations_override accepted: extended loop to ${maxIterations} (ceiling +${ceiling}).`);
          }
        }
       } catch (_) {}

        // ===== opencode-style Plan Mode (#1) + Permission Gating (#6) =====
        {
          const approval = ApprovalGate.getInstance();
          const deliveryNames = ['speak', 'final_answer', 'status_update'];
          const realCalls = toolsToCall.filter((tc: any) => !deliveryNames.includes(tc.tool || tc.name));
          const planModeEnabled = settings['tool-executor']?.planMode === true;
          const permissionMode = settings['tool-executor']?.permissionMode || 'auto';
          const riskyToolsCfg = Array.isArray(settings['tool-executor']?.riskyTools)
            ? settings['tool-executor'].riskyTools
            : [];

          const pauseAndAsk = (request: ApprovalRequest): any => {
            const msg = request.kind === 'plan'
              ? `${request.summary}\n\n⚠️ Approval needed before I proceed. Reply "yes"/"continue" to approve, or "no"/"change" to adjust.`
              : `${request.summary}\n\n🔒 Reply "yes" to allow, or "no" to deny.`;
            logs.push(`[APPROVAL] ${request.kind} request: ${request.toolNames.join(', ')}`);
            return {
              response: msg,
              logs,
              nextMood: loopContext.moodImpact,
              moodImpact: loopContext.moodImpact,
              sentiment: loopContext.sentiment,
              newMemories: loopGeneratedMemories,
              actions: toolsToCall,
              perceivedNameUpdate: loopContext.perceivedNameUpdate || preContext.perceivedNameUpdate,
              linkedAccountUpdate: loopContext.linkedAccountUpdate || preContext.linkedAccountUpdate,
              viewerProfileUpdate: loopContext.viewerProfileUpdate,
              shouldStartDreaming: loopContext.shouldStartDreaming,
              animations,
              tone: loopContext.tone,
              tool_calls: toolsToCall,
              updatedPlan: currentPlan,
              iterations: iterationsHistory,
              moodDelta: {},
              relationDelta: {},
              queuedIdentityUpdate: {},
              fallbackTriggered: false,
              systemHealth: state.systemHealth,
              status: 'awaiting_approval' as const
            };
          };

          // Plan Mode only for MODIFICATION/EXECUTION actions (not reads/access).
          // Reading files, finding files, websearch/webfetch, view_logs, etc. run directly.
          const isModifyingName = (name: string) =>
            riskyToolsCfg.length > 0 ? riskyToolsCfg.includes(name) : DEFAULT_RISKY_TOOLS.includes(name);
          const modifyingCalls = realCalls.filter((tc: any) => isModifyingName(tc.tool || tc.name));

          // 1) Plan Mode: ask for a plan before executing modification tools (only the first time).
          if (planModeEnabled && modifyingCalls.length > 0 && !approval.isPlanApproved(contextId)) {
            const planText = modifyingCalls.map((tc: any) => {
              const name = tc.tool || tc.name;
              const args = typeof tc.args === 'object' && tc.args ? tc.args : {};
              const summary = Object.entries(args).slice(0, 4)
                .map(([k, v]: [string, any]) => `${k}=${typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : JSON.stringify(v)}`)
                .join(', ');
              return summary ? `  • ${name} (${summary})` : `  • ${name}`;
            }).join('\n');
            const planMsg = `📋 *My plan:*\n${planText}`;
            approval.requestPlan(contextId, planMsg, modifyingCalls.map((tc: any) => tc.tool || tc.name));
            return pauseAndAsk(approval.get(contextId)!);
          }

          // 2) Permission Gating: filter risky tools (deny) / request permission (ask).
          if ((permissionMode === 'ask' || permissionMode === 'deny') && realCalls.length > 0) {
            const isRiskyName = (name: string) =>
              riskyToolsCfg.length > 0 ? riskyToolsCfg.includes(name) : DEFAULT_RISKY_TOOLS.includes(name);

            const deniedCalls = realCalls.filter((tc: any) => {
              const name = tc.tool || tc.name;
              return approval.isToolDenied(contextId, name);
            });
            if (deniedCalls.length > 0) {
              const deniedNames = deniedCalls.map((tc: any) => tc.tool || tc.name);
              logs.push(`[PERMISSION] Denied tools will be blocked: ${deniedNames.join(', ')}.`);
              toolsToCall = toolsToCall.map((tc: any) => {
                const name = tc.tool || tc.name;
                return deniedNames.includes(name)
                  ? { ...tc, __blocked: true, __blockReason: 'User denied permission to execute this tool.' }
                  : tc;
              });
            }

            const riskyCalls = realCalls.filter((tc: any) => {
              const name = tc.tool || tc.name;
              return isRiskyName(name) && !approval.isToolApproved(contextId, name) && !approval.isToolDenied(contextId, name);
            });

            if (permissionMode === 'ask' && riskyCalls.length > 0) {
              const riskyNames = riskyCalls.map((tc: any) => tc.tool || tc.name);
              const askMsg = `🔒 *I need your permission for risky tools:* ${riskyNames.join(', ')}.`;
              approval.requestPermission(contextId, riskyNames);
              return pauseAndAsk(approval.get(contextId)!);
            }

            if (permissionMode === 'deny' && riskyCalls.length > 0) {
              const riskyNames = riskyCalls.map((tc: any) => tc.tool || tc.name);
              logs.push(`[PERMISSION] permissionMode=deny — blocking risky tools: ${riskyNames.join(', ')}.`);
              toolsToCall = toolsToCall.map((tc: any) => {
                const name = tc.tool || tc.name;
                return riskyNames.includes(name)
                  ? { ...tc, __blocked: true, __blockReason: 'Permission denied (tool-executor.permissionMode = deny).' }
                  : tc;
              });
            }
          }
        }

        if (settings['tool-executor']?.bgEnabled === true && contextId) {
          const blockingTools = ['speak', 'final_answer', 'status_update'];
          const nonBlockingTools = toolsToCall.filter(
            (tc: any) => !blockingTools.includes(tc.tool || tc.name)
          );
          const allNonBlocking = nonBlockingTools.length > 0 && nonBlockingTools.length === toolsToCall.length;

          if (allNonBlocking) {
            let statusFeedback = injectCharacterName("${characterName} is processing something...");
            try {
              const toolNames = toolsToCall.map((tc: any) => tc.tool || tc.name).join(", ");
              if (toolNames.includes("websearch") || toolNames.includes("search")) {
                statusFeedback = injectCharacterName("${characterName} is surfing for the latest info for user... 🌐✨");
              } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
                statusFeedback = injectCharacterName("${characterName} is digging through the inner databank... 🗄️🔍");
              } else if (toolNames.includes("bash")) {
                statusFeedback = injectCharacterName("${characterName} is processing system instructions behind the scenes... ⚙️💻");
              } else {
                statusFeedback = injectCharacterName(`\${characterName} is processing capability: [${toolNames}]... 🌸`);
              }

              const dedup = GlobalOutputDeduplicator.getInstance();
              if (!dedup.isDuplicate(statusFeedback, contextId || 'web_default')) {
                dedup.markSent(statusFeedback, contextId || 'web_default');
                eventBus.emit('OUTPUT_EMITTED', { response: statusFeedback, isInternal: false });

                if (typeof broadcastToWS === 'function') {
                  broadcastToWS({
                    type: "state_update",
                    data: {
                      state: { status: "thinking" },
                      activeSubtitle: statusFeedback,
                      typedSubtitle: statusFeedback,
                      isSubtitleTyping: false,
                      animations: ["THINK"]
                    }
                  });
                }
              }
            } catch (_) {}

            const pendingToolRef = contextId;
            BackgroundToolDispatcher.getInstance().enqueue(
              contextId,
              nonBlockingTools,
              settings,
              state,
              augContext,
              signal
            ).then((results) => {
              const pending = BackgroundToolDispatcher.getInstance().getPending(contextId);
              if (pending) {
                pending.status = 'completed';
                pending.results = results;
                pending.completedAt = Date.now();
              }
            }).catch((err: any) => {
              console.warn(`[BG_DISPATCHER] Background tool execution failed for ${contextId}:`, err?.message || err);
              const pending = BackgroundToolDispatcher.getInstance().getPending(contextId);
              if (pending) {
                pending.status = 'failed';
                pending.completedAt = Date.now();
              }
            });

            const immediateResult = {
              response: statusFeedback,
              logs,
              nextMood: loopContext.moodImpact,
              moodImpact: loopContext.moodImpact,
              sentiment: loopContext.sentiment,
              newMemories: loopGeneratedMemories,
              actions: toolsToCall,
              perceivedNameUpdate: loopContext.perceivedNameUpdate || preContext.perceivedNameUpdate,
              linkedAccountUpdate: loopContext.linkedAccountUpdate || preContext.linkedAccountUpdate,
              viewerProfileUpdate: loopContext.viewerProfileUpdate,
              shouldStartDreaming: loopContext.shouldStartDreaming,
              animations: animations,
               tone: loopContext.tone,
               tool_calls: toolsToCall,
               updatedPlan: currentPlan,
               iterations: iterationsHistory,
               moodDelta: {},
               relationDelta: {},
               queuedIdentityUpdate: {},
               fallbackTriggered: false,
               systemHealth: state.systemHealth,
               status: 'tools_running' as const,
               pendingToolRef
             };

              return immediateResult;
            }
          }
          // Otherwise: only blocking tools (speak/final_answer/status_update) — fall through to synchronous execution.

        stateMachine.transitionTo('EXECUTING');
       eventBus.emit('EXECUTING_STARTED', { tools: toolsToCall });
      
      // Dynamic status update broadcast to WebSocket to prevent blind wait state
      try {
        const toolNames = toolsToCall.map((tc: any) => tc.tool || tc.name).join(", ");
        let statusFeedback = injectCharacterName("${characterName} is processing something...");
        if (toolNames.includes("websearch") || toolNames.includes("search")) {
          statusFeedback = injectCharacterName("${characterName} is surfing for the latest info for user... 🌐✨");
        } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
          statusFeedback = injectCharacterName("${characterName} is digging through the inner databank... 🗄️🔍");
        } else if (toolNames.includes("bash")) {
          statusFeedback = injectCharacterName("${characterName} is processing system instructions behind the scenes... ⚙️💻");
        } else {
          statusFeedback = injectCharacterName(`\${characterName} is processing capability: [${toolNames}]... 🌸`);
        }
        
        if (typeof broadcastToWS === 'function') {
          const dedup = GlobalOutputDeduplicator.getInstance();
          if (!dedup.isDuplicate(statusFeedback, contextId || 'web_default')) {
            dedup.markSent(statusFeedback, contextId || 'web_default');
            broadcastToWS({
              type: "state_update",
              data: {
                state: { status: "thinking" },
                activeSubtitle: statusFeedback,
                typedSubtitle: statusFeedback,
                isSubtitleTyping: false,
                animations: ["THINK"]
              }
            });
          }
        }
      } catch (_) {}

      logs.push(`[PHASE 4] Hub distributed ${toolsToCall.length} tasks to Executors in PARALLEL to enable concurrent process execution...`);

      const toolPromises = toolsToCall.map(async (tc) => {
        let tool = SystemRegistry.getTool(tc.name || tc.tool);

        if ((tc as any).__blocked) {
          const tName = tc.name || tc.tool;
          logs.push(`[PERMISSION] Tool '${tName}' blocked: ${(tc as any).__blockReason || 'no permission'}.`);
          return {
            tool: tName,
            error: `Tool not executed: ${(tc as any).__blockReason || 'Permission denied by user policy.'}`,
            success: false,
            durationMs: 0,
            notFound: false,
            blocked: true
          };
        }
        
        if (!tool) {
          const tName = tc.name || tc.tool;
          // opencode-style: by default unregistered tools are NOT automatically
          // synthesized — the error is returned to the model along with near-match
          // suggestions so the model corrects itself. DYNAMIC_SYNTHESIS is only active
          // when explicitly enabled via the 'tool-executor'.dynamicSynthesis = true setting.
          const synthesisEnabled = settings['tool-executor']?.dynamicSynthesis === true;
          if (synthesisEnabled) {
            console.log(`[DYNAMIC_SYNTHESIS] Tool '${tName}' not found. Attempting autonomous dynamic tool synthesis...`);
            try {
               tool = await DynamicToolSynthesizer.synthesizeAndRegister(tName, input, cortexInstance);
            } catch (synthErr: any) {
              console.error(`[CORTEX_SYNTHESIS_FAIL] Failed during dynamic tool synthesis for '${tName}':`, synthErr.message);
            }
          } else {
            logs.push(`[CORTEX_TOOL_MISSING] Tool '${tName}' is not registered. Error returned to the model for correction (opencode-style, dynamicSynthesis off).`);
          }
        }

        let res: any;
        if (tool) {
          let execStart = Date.now();
          try {
            // opencode-style snapshot (#5): before a file-modifying tool writes,
            // capture the original content of the target file so it can be undone.
            try {
              const tName = tc.name || tc.tool;
              if (['write', 'edit', 'apply_patch', 'file_manager'].includes(tName)) {
                const captured = await SnapshotManager.getInstance().capture(contextId, tName, tc.args || {});
                if (captured > 0) logs.push(`[SNAPSHOT] Saved ${captured} file(s) before ${tName} (undo available).`);
              }
            } catch (_) {}
            // Reserved control metadata: `_meta` lets the LLM request per-call
            // execution tweaks (e.g. timeout_ms). It is NEVER forwarded to the tool.
            let metaTimeoutMs: number | undefined;
            if (tool.metadata && tool.metadata.parameters) {
              const schema = tool.metadata.parameters;
              let parsedArgs: any = tc.args || {};
if (typeof parsedArgs === 'string') {
                 try {
                   const sanitized = extractJsonObject(parsedArgs);
                   parsedArgs = JSON.parse(sanitized ? sanitized : parsedArgs);
                 } catch (_) {}
               }
              if (typeof parsedArgs !== 'object' || parsedArgs === null) parsedArgs = {};

              if (parsedArgs._meta && typeof parsedArgs._meta === 'object') {
                const m = parsedArgs._meta as any;
                if (typeof m.timeout_ms === 'number' && m.timeout_ms > 0) {
                  metaTimeoutMs = Math.min(m.timeout_ms, 600000);
                  logs.push(`[CORTEX] Tool '${tool.metadata.id}' _meta.timeout_ms override: ${metaTimeoutMs}ms`);
                }
                const stripped = { ...parsedArgs };
                delete stripped._meta;
                parsedArgs = stripped;
              }

              APIService.validateSchema(schema, parsedArgs, tool.metadata.id);
              tc.args = parsedArgs;
            } else if (tc.args && typeof tc.args === 'object' && (tc.args as any)._meta) {
              // No schema: still strip reserved _meta so it never reaches the tool.
              const stripped = { ...(tc.args as any) };
              const m = stripped._meta as any;
              if (m && typeof m.timeout_ms === 'number' && m.timeout_ms > 0) {
                metaTimeoutMs = Math.min(m.timeout_ms, 600000);
              }
              delete stripped._meta;
              tc.args = stripped;
            }

            const currentToolName = tc.name || tc.tool || '';
            // Delivery tools carry the final reply to the user (speak / final_answer /
            // status_update). They must survive an abort signal (pipeline timeout or
            // client disconnect) so the user never loses Yui's conclusive response —
            // otherwise the answer silently dies inside the tool executor.
            const isDeliveryTool = ['speak', 'final_answer', 'status_update'].includes(currentToolName);

            if (signal?.aborted && !isDeliveryTool) {
              throw new Error("Tool execution aborted: client connection closed");
            }

            let abortListener: (() => void) | null = null;
            const abortPromise = isDeliveryTool
              ? new Promise<never>(() => {})
              : new Promise((_, reject) => {
                  if (signal?.aborted) {
                    reject(new Error("Tool execution aborted: client connection closed"));
                    return;
                  }
                  abortListener = () => reject(new Error("Tool execution aborted: client connection closed"));
                  signal?.addEventListener("abort", abortListener);
                });

            const toolExecutorConfig = settings['tool-executor'] || {};
            const generalTimeoutMs = toolExecutorConfig.timeoutMs !== undefined ? Number(toolExecutorConfig.timeoutMs) : 60000;
            const isShell = ['bash', 'shell'].includes(tc.name || tc.tool);
            const toolName = tc.name || tc.tool || '';
            const TOOL_SPECIFIC_TIMEOUTS: Record<string, number> = {
              generate_image: 180000,
            };
            const baseTimeoutMs = isShell
              ? (toolExecutorConfig.shellTimeoutMs !== undefined ? Number(toolExecutorConfig.shellTimeoutMs) : 120000)
              : generalTimeoutMs;
            const activeTimeoutMs = (metaTimeoutMs !== undefined)
              ? metaTimeoutMs
              : Math.max(TOOL_SPECIFIC_TIMEOUTS[toolName] || 0, baseTimeoutMs);

            let attempts = 0;
            const maxAttempts = (toolExecutorConfig.retryLimit !== undefined ? Number(toolExecutorConfig.retryLimit) : 2) + 1;
            let lastErr: any = null;
            let toolRes: any = null;
            let success = false;

            while (attempts < maxAttempts && !success) {
              attempts++;
              try {
                if (attempts > 1) {
                  logs.push(`[CORTEX] Retrying tool ${tc.name || tc.tool} (Attempt ${attempts}/${maxAttempts})...`);
                }
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Tool execution timed out after ${activeTimeoutMs / 1000} seconds`)), activeTimeoutMs)
                );

                toolRes = await Promise.race([
                  tool.execute(tc.args, { state, ...augContext }),
                  abortPromise,
                  timeoutPromise
                ]);
                success = true;
              } catch (err: any) {
                lastErr = err;
                // Kilo retry policy: only transient (network/service) errors are
                // worth burning an attempt on; aborts and schema errors fail fast.
                const transient = isTransientToolError(err);
                console.warn(`[CORTEX] Attempt ${attempts} failed for tool ${tc.name || tc.tool}: ${err.message}${transient ? ' (transient, retriable)' : ' (non-transient, aborting retries)'}`);
                if (attempts >= maxAttempts || !transient) {
                  throw err;
                }
                const backoffMs = Math.min(500 * Math.pow(2, attempts - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
              }
            }

            if (abortListener && signal) {
              signal.removeEventListener("abort", abortListener);
            }

            res = { tool: tc.name || tc.tool, observation: toolRes, success: true, durationMs: Date.now() - execStart };
          } catch (err: any) {
            console.error(`[CORTEX] Tool schema validation or execution failed for ${tc.name || tc.tool}:`, err.message);
            const classified = classifyToolExecutionError(err);
            res = { tool: tc.name || tc.tool, error: classified.label, errorType: classified.errorType, success: false, durationMs: Date.now() - execStart };
          }
        } else {
          const tName = tc.name || tc.tool || '';
          const previouslySeen = toolExecutionHistory.some(h =>
            Array.isArray(h.tools_called) && h.tools_called.some((c: any) => (c?.name || c?.tool) === tName)
          );
          // opencode-style near-match suggestion: when a tool is not registered, tell the
          // model the list of similar valid tools so it can correct the name itself.
          let suggestion = '';
          try {
            const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const wanted = norm(tName);
            const registered = SystemRegistry.getTools()
              .map((t: any) => String(t.metadata?.id || t.id || ''))
              .filter(Boolean);
            const scored = registered
              .map(id => {
                const rid = norm(id);
                let score = 0;
                if (wanted && (rid.includes(wanted) || wanted.includes(rid))) score += 2;
                if (wanted && rid.length > 2 && wanted.length > 2) {
                  const wt = wanted.split(/[^a-zA-Z0-9]+/).filter(Boolean);
                  const rt = rid.split(/[^a-zA-Z0-9]+/).filter(Boolean);
                  score += rt.filter(r => wt.includes(r)).length;
                }
                return { id, score };
              })
              .filter(s => s.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(s => s.id);
            if (scored.length) suggestion = ` Did you mean: ${scored.join(', ')}?`;
          } catch (_) { /* suggestions are best-effort */ }
          res = {
            tool: tName,
            error: previouslySeen
              ? `Stale tool call: ${tName} (the tool was available earlier but is no longer registered)${suggestion}`
              : `Tool not found: ${tName}.${suggestion}`,
            success: false,
            notFound: true,
            errorType: previouslySeen ? 'stale' : 'not_found'
          };
        }
        
        let pathDetail = '';
        if (res.success && res.observation && typeof res.observation === 'object') {
          const obs = res.observation as any;
          const fullPath = obs.physicalPath || obs.absolutePath || obs.path;
          if (fullPath) {
            pathDetail = ` (Path: ${fullPath})`;
          } else if (obs.detailedFiles && Array.isArray(obs.detailedFiles)) {
            pathDetail = ` (Listed ${obs.detailedFiles.length} files with full physical paths)`;
          } else if (obs.files && Array.isArray(obs.files)) {
            pathDetail = ` (Listed ${obs.files.length} files)`;
          }
        }
        
        const logMsg = `[TOOL] ${res.tool} ${res.success ? 'success' : 'failed'}${pathDetail}.`;
        logs.push(logMsg);
        const dedup = GlobalOutputDeduplicator.getInstance();
        if (!dedup.isDuplicate(logMsg, contextId || 'web_default')) {
          dedup.markSent(logMsg, contextId || 'web_default');
          eventBus.emit('OUTPUT_EMITTED', { response: logMsg, isInternal: true });
        }
        return res;
      });

      toolPromises.forEach((p, idx) => {
        p.then((res) => {
          const tc = toolsToCall[idx];
          if (res.success && (tc.tool === 'scheduler' || tc.name === 'scheduler' || tc.tool === 'cron' || tc.name === 'cron' || tc.tool === 'manage_cron' || tc.name === 'manage_cron')) {
            cronActionDoneThisTurn = true;
            try { (state as any)._yuiCronActionDone = true; } catch (_) { /* non-fatal */ }
          }
          if (res.success && (tc.tool === 'speak' || tc.name === 'speak')) {
            const speech = res.observation?.speech;
            if (speech) {
              if (res.observation?.suppressedFinal === true) {
                // Redundant cron final answer — confirmation already delivered via speak this turn.
                return;
              }
              if (res.observation?.sentDirectly === true) {
                speakDeliveredDirectly = true;
              }
              const dedup = GlobalOutputDeduplicator.getInstance();
              if (!dedup.isDuplicate(speech, contextId || 'web_default')) {
                if (res.observation?.sentDirectly === true) {
                  dedup.markSent(speech, contextId || 'web_default');
                }
                eventBus.emit('OUTPUT_EMITTED', { response: speech });
              }
            }
          }
        }).catch(() => {});
      });

      const toolResults = await Promise.all(toolPromises);

      eventBus.emit('EXECUTING_COMPLETED', { results: toolResults });
      stateMachine.transitionTo('IDLE');

      const realTools = toolsToCall.filter((tc: any) => tc.tool !== 'speak' && tc.tool !== 'final_answer' && tc.tool !== 'status_update');

      // opencode-style: mark if any real tool failed on this iteration.
      // Do not mark while a shutdown/drain is in progress (graceful shutdown).
      try {
        const deliveryNames = ['speak', 'final_answer', 'status_update'];
        const failedRealTool = toolResults.some((res: any) => !res.success && !deliveryNames.includes(res.tool));
        const aborting = (signal as any)?.aborted === true || (signal as any)?.shutdownRequested === true;
        if (failedRealTool && !aborting) {
          realToolFailurePending = true;
        }
      } catch (_) {}

      // Build OpenAI-native `role: "tool"` result messages and the paired assistant
      // `tool_calls` so providers with native function calling receive tool feedback
      // in their own channel. This complements (and does not replace) the memory
      // integration below which serves episodic memory and dataset synthesis.
      try {
        const newAssistantToolCalls: any[] = [];
        const newToolMessages: any[] = [];
        for (let i = 0; i < toolsToCall.length; i++) {
          const tc = toolsToCall[i];
          const res = toolResults[i];
          const callId = tc.id || `call_${i}_${Date.now().toString(36)}`;
          const callName = tc.function?.name || tc.name || tc.tool;
          const callArgs = tc.function?.arguments || tc.args || {};
          newAssistantToolCalls.push({
            id: callId,
            type: 'function',
            function: { name: callName, arguments: callArgs }
          });
          // Canonical tool output envelope: { success, data, error, metadata }.
          // Legacy shapes (stdout/stderr/content) are preserved inside `data`.
          const envelope = {
            success: !!res?.success,
            data: res?.success ? res.observation : null,
            error: res?.success ? null : (res?.error || 'Tool execution failed'),
            metadata: {
              tool: callName,
              duration_ms: typeof res?.durationMs === 'number' ? res.durationMs : -1,
              timestamp: new Date().toISOString()
            }
          };
          const content = JSON.stringify(envelope);
          newToolMessages.push({ tool_call_id: callId, name: callName, content });
        }
        loopContext.assistantToolCalls = [
          ...(Array.isArray(loopContext.assistantToolCalls) ? loopContext.assistantToolCalls : []),
          ...newAssistantToolCalls
        ];
        loopContext.toolMessages = [
          ...(Array.isArray(loopContext.toolMessages) ? loopContext.toolMessages : []),
          ...buildToolResultMessages(newToolMessages, activeProviderId)
        ];
        // Canonical [call, toolMessage] pairs feed the anchored context compactor.
        if (!Array.isArray(loopContext.compactionTurns)) loopContext.compactionTurns = [];
        for (let i = 0; i < newToolMessages.length; i++) {
          loopContext.compactionTurns.push({ call: newAssistantToolCalls[i], toolMessage: newToolMessages[i] });
        }
        logs.push(`[CORTEX] Built ${newToolMessages.length} native tool result message(s) for provider '${activeProviderId}'.`);
        // Persist the canonical [assistant(tool_calls), role:"tool" ...] pair so a
        // future turn / resume can reload the native conversation from the store.
        if (nativeTransportEnabled) {
          try {
            const persistBatch: any[] = [
              { role: 'assistant', content: null, tool_calls: newAssistantToolCalls },
              ...newToolMessages.map((m: any) => ({
                role: 'tool',
                tool_call_id: m.tool_call_id,
                name: m.name,
                content: m.content
              }))
            ];
            loopContext.nativeHistory = [...(Array.isArray(loopContext.nativeHistory) ? loopContext.nativeHistory : []), ...persistBatch];
            appendNativeMessages(nativeSessionId, persistBatch);
            logs.push(`[CORTEX] Persisted ${persistBatch.length} native message(s) for session '${nativeSessionId}'.`);
            // Phase 5: append the canonical interleaved turn block (assistant
            // tool_calls immediately followed by role:"tool" rows) so the next
            // iteration feeds the provider correctly-ordered multi-turn history.
            loopContext.nativeTurnBlocks = [
              ...(Array.isArray(loopContext.nativeTurnBlocks) ? loopContext.nativeTurnBlocks : []),
              persistBatch
            ];
          } catch (nativeErr: any) {
            logs.push(`[CORTEX] Warning: Failed to persist native messages: ${nativeErr?.message || nativeErr}`);
          }
        }
      } catch (tmErr: any) {
        logs.push(`[CORTEX] Warning: Failed to build native tool result messages: ${tmErr.message || tmErr}`);
      }

      toolExecutionHistory.push({
        iteration,
        tools_called: toolsToCall,
        results: toolResults
      });
      // Persist tool calls + results into the LLM audit log for UI inspection
      try {
         LlmIoAuditor.recordToolExecution({
          toolCalls: toolsToCall.map((tc: any) => ({
            name: tc.name || tc.tool,
            arguments: tc.args || tc.arguments || {}
          })),
          toolResults: toolResults.map((tr: any) => ({
            tool: tr.tool,
            success: tr.success,
            durationMs: tr.durationMs,
            error: tr.error,
            result: tr.observation
          }))
        });
      } catch (_auditErr) { /* non-blocking */ }


      // Integrate the tool calls and results sequentially into the existing memory context
      logs.push("[CORTEX] Sequential memory integration: Parsing tool output and integrating into the existing memory context...");
      try {
        const toolCallMemoryId = `tool_call_${Date.now()}_${genId(5)}`;
        const parsedThought = parsedPayload ? (parsedPayload.thought || parsedPayload.thoughts || '') : '';
        const toolCallContent = `[TOOL_CALLS]: ${injectCharacterName('${characterName}')} thought: "${parsedThought}". Initiated tools: ${JSON.stringify(toolsToCall.map((tc: any) => ({ tool: tc.name || tc.tool, args: tc.args })))}${parsedPayload && parsedPayload.speech ? `\nSpeech: "${parsedPayload.speech}"` : ''}`;
        
        const toolCallMemory = {
          id: toolCallMemoryId,
          ownerId: 'local_user',
          type: 'interaction' as const,
          speaker: 'agent',
          content: toolCallContent,
          timestamp: Date.now(),
          importance: 0.5,
          tags: ['tool_call'],
          context: contextId,
          sentiment: 0.5
        };
        memories.push(toolCallMemory);
        loopGeneratedMemories.push(toolCallMemory);

        for (const res of toolResults) {
          const observationMemoryId = `tool_obs_${Date.now()}_${genId(5)}`;
          const observationContent = res.success
            ? `Tool [${res.tool}] executed successfully. Result: ${typeof res.observation === 'object' ? JSON.stringify(res.observation) : String(res.observation)}`
            : `Tool [${res.tool}] failed. Error: ${res.error || 'Unknown error'}`;

          const observationMemory = {
            id: observationMemoryId,
            ownerId: 'local_user',
            type: 'observation' as const,
            speaker: 'System',
            content: `[SYSTEM_OBSERVATION]: ${observationContent}`,
            timestamp: Date.now() + 5,
            importance: 0.5,
            tags: ['tool_observation', res.tool],
            context: contextId,
            sentiment: 0.5
          };
          memories.push(observationMemory);
          loopGeneratedMemories.push(observationMemory);
        }

      } catch (integrationErr: any) {
        logs.push(`[CORTEX] Warning: Failed to integrate tool execution into memory context: ${integrationErr.message || integrationErr}`);
      }

      const finalReplyResult = toolResults.find(res => res.observation && res.observation.isFinalReply);
      if (finalReplyResult) {
        if (realTools.length === 0 && !realToolFailurePending) {
          logs.push("[CORTEX] final_answer executed successfully. Stopping cognitive loop iteration.");
          processedResponse = finalReplyResult.observation.speech;
          animations = finalReplyResult.observation.animations || animations;
          moodImpact = finalReplyResult.observation.mood_impact || moodImpact;
          break;
        } else if (realTools.length === 0 && realToolFailurePending) {
          // opencode-style: a real tool failed on the previous iteration, but the model
          // instead gave a final answer. Do not break — give the model one chance to
          // correct itself (reading the error + re-calling the correct tool).
          logs.push("[CORTEX] final_answer given, but a real tool failed earlier. Continuing loop to let the model correct itself (opencode-style).");
          processedResponse = finalReplyResult.observation.speech;
          animations = finalReplyResult.observation.animations || animations;
          moodImpact = finalReplyResult.observation.mood_impact || moodImpact;
          realToolFailurePending = false;
        } else {
          logs.push("[CORTEX] final_answer executed, but real tools are running in parallel. Continuing loop to process observations.");
          processedResponse = finalReplyResult.observation.speech;
          animations = finalReplyResult.observation.animations || animations;
          moodImpact = finalReplyResult.observation.mood_impact || moodImpact;
        }
      }

      const currentIterObj = iterationsHistory[iterationsHistory.length - 1];
      if (currentIterObj) {
        currentIterObj.observations = toolResults.map(res => ({
          tool: res.tool,
          observation: res.observation || res.error || "Execution completed."
        }));
      }
    } else {
      if (realToolFailurePending) {
        // opencode-style: an iteration with no tool call at all, even though there is a real tool
        // that is still failing. Continue one iteration so the model gets a chance to call the
        // correct tool after reading the error (instead of silently ending).
        logs.push("[CORTEX] No tool calls, but a real tool failed earlier. Continuing loop to let the model correct itself (opencode-style).");
        realToolFailurePending = false;
      } else {
        break;
      }
    }
  }

  const isProactiveRun = userName === 'System';

  finalAnswer = APIService.cleanAIOutput(StandardizedProcessor.sanitizeOutput(processedResponse, isProactiveRun));

  const cortexSettings = await cortexInstance.getSettings();
  const isFailsafeEnabled = cortexSettings?.developer?.enableKernelFailsafe !== false && cortexSettings?.enableKernelFailsafe !== false;

  const senderFacingTools = ['speak', 'final_answer'];
  const thirdPartyDeliveryTools = ['send_message', 'send_telegram', 'send_discord', 'send_update', 'send_file', 'reply'];

  const hasSenderFacingTools = Array.isArray(toolsToCall) && toolsToCall.some((tc: any) => {
    const name = tc.tool || tc.name || '';
    return senderFacingTools.includes(name);
  });
  const hasThirdPartyDeliveryTools = Array.isArray(toolsToCall) && toolsToCall.some((tc: any) => {
    const name = tc.tool || tc.name || '';
    return thirdPartyDeliveryTools.includes(name);
  });
  const hasResponseDeliveryTools = hasSenderFacingTools || hasThirdPartyDeliveryTools;
  const isIntentionalEmpty = hasSenderFacingTools;

  if (!finalAnswer || finalAnswer.length < 5) {
    if (hasSenderFacingTools) {
      logs.push("[KERNEL_FAIL_SAFE] Empty/short output with sender-facing reply tools (speak/final_answer). Response delivery is intentional.");
    } else if (hasThirdPartyDeliveryTools) {
      logs.push("[KERNEL_FAIL_SAFE] Third-party delivery tools called but no sender-facing reply. Allowing short response but may trigger fallback if empty.");
    } else {
      logs.push("[KERNEL_FAIL_SAFE] Empty or short output without tool-based reply action.");
    }
  }

  if (!isIntentionalEmpty && (!finalAnswer || finalAnswer.length < 5)) {
    if (isFailsafeEnabled) {
      logs.push("[KERNEL_FAIL_SAFE] Detected empty or heavily clipped output (< 5 chars). Triggering dynamic LLM reprocessing fallback... (Incrementing formatting errors count)");
      state.systemHealth.consecutive_formatting_errors = (state.systemHealth.consecutive_formatting_errors || 0) + 1;
      try {
        const gateway = SystemRegistry.getModule<CortexModule>('provider-gateway');
        if (gateway) {
          const fallbackSettings = {
            ...cortexSettings,
            [cortexSettings.provider]: {
              ...(cortexSettings[cortexSettings.provider] || {}),
              isJson: false
            }
          };

          const failsafePrompt = PromptRegistry.getInstance().compile('cortex:failsafe_reprocess', {
            input: input
          });

          logs.push("[KERNEL_FAIL_SAFE] Dispatching emergency raw conversational request to optimal AI gateway...");
          const recoveryContext = await gateway.run(failsafePrompt, state, {
            ...augContext,
            config: fallbackSettings
          });

          let rawRecoveryVal = recoveryContext.rawResult || "";
          let cleanedRecoveryVal = StandardizedProcessor.sanitizeOutput(rawRecoveryVal, isProactiveRun);

          if (cleanedRecoveryVal.length >= 5) {
            finalAnswer = cleanedRecoveryVal;
            processedResponse = rawRecoveryVal;
            logs.push(`[KERNEL_FAIL_SAFE] Reprocessing LLM retry successful! Recovered dialogue: "${finalAnswer}"`);
          } else {
            let backupCleaned = StandardizedProcessor.sanitizeOutput(rawRecoveryVal, isProactiveRun);
            if (backupCleaned.length >= 2) {
              finalAnswer = backupCleaned;
              processedResponse = rawRecoveryVal;
              logs.push(`[KERNEL_FAIL_SAFE] Reprocessing LLM retry partially successful via strict backup outline sanitization: "${finalAnswer}"`);
            }
          }
        }
      } catch (recoveryErr: any) {
        console.error("[KERNEL_FAIL_SAFE] Emergency reprocessing LLM recovery step failed:", recoveryErr.message || String(recoveryErr));
        logs.push(`[KERNEL_FAIL_SAFE] Reprocessor failsafe error: ${recoveryErr.message || recoveryErr}`);
      }
    } else {
      logs.push("[KERNEL_FAIL_SAFE] Skipped: Kernel failsafe is disabled in system configurations.");
    }
  }

  let kernelFailsafeTriggered = false;

  if (!isIntentionalEmpty && (!finalAnswer || finalAnswer.length < 5)) {
    logs.push("[KERNEL_FAIL_SAFE] Critical: Reprocessing LLM retry failed to produce a valid response. Falling back to cute in-character error response.");
    finalAnswer = injectCharacterName("Oh no... sorry user, ${characterName}'s inner circuit felt a bit dizzy just now while processing your request... 🥺 But ${characterName} is still here! Is there anything ${characterName} can help with again? 💕");
    kernelFailsafeTriggered = true;
  }

  const speakCall = toolsToCall.find((tc: any) => tc.tool === 'final_answer');
  const finalSpeech = speakCall?.args?.speech && typeof speakCall.args.speech === 'string' ? speakCall.args.speech : finalAnswer;

  const dedup = GlobalOutputDeduplicator.getInstance();
  if (speakDeliveredDirectly && cronActionDoneThisTurn) {
    // Cron one-reply guard: the confirmation speak already reached the user directly.
    // Swallow the redundant final answer so only ONE message is delivered per request.
    console.log("[CORTEX] Suppressing redundant final answer: cron confirmation already delivered via speak this turn.");
    if (finalSpeech) {
      try { dedup.markSent(finalSpeech, contextId || 'web_default'); } catch (_) { /* non-fatal */ }
    }
  } else if (!dedup.isDuplicate(finalSpeech, contextId || 'web_default')) {
    if (speakDeliveredDirectly) {
      dedup.markSent(finalSpeech, contextId || 'web_default');
    }
    eventBus.emit('OUTPUT_EMITTED', { response: finalSpeech });
  }

    const immediateResult = {
      response: finalSpeech,
     logs,
     nextMood: loopContext.moodImpact,
     moodImpact: loopContext.moodImpact,
     sentiment: loopContext.sentiment,
     newMemories: loopGeneratedMemories,
     actions: toolsToCall,
     perceivedNameUpdate: loopContext.perceivedNameUpdate || preContext.perceivedNameUpdate,
     linkedAccountUpdate: loopContext.linkedAccountUpdate || preContext.linkedAccountUpdate,
     viewerProfileUpdate: loopContext.viewerProfileUpdate,
     shouldStartDreaming: loopContext.shouldStartDreaming,
     animations: animations,
     tone: loopContext.tone,
     tool_calls: toolsToCall,
     updatedPlan: currentPlan,
     iterations: iterationsHistory,
     moodDelta: {},
     relationDelta: {},
     queuedIdentityUpdate: {},
      fallbackTriggered: kernelFailsafeTriggered || loopContext.fallbackTriggered || false,
     systemHealth: state.systemHealth,
     status: 'completed' as const,
     pendingToolRef: undefined
   };

  stateMachine.transitionTo('IDLE');

  const latency = Date.now() - startTime;
  FastTrackRunner.run(cortexInstance.getConfig(), state, {
    operation: 'think',
    latency,
    success: true,
    context: contextId || 'web_default'
  }).then((fastTrackRes) => {
    if (fastTrackRes && fastTrackRes.decayedMood) {
      console.log(`[CORTEX:FastTrack] Successfully executed mood decay and telemetry logging in worker thread.`);
    }
  }).catch((err) => {
    console.warn("[CORTEX:FastTrack:Error] Fast-Track background execution warning:", err?.message || err);
  });

  if (taskId) {
    CognitiveScheduler.completeTask(taskId);
  }

  // Continuation in background so delivery is not blocked by post-processing.
  setImmediate(async () => {
    try {
      const postContext = await SystemRegistry.runCortexPhase('finalize', finalAnswer, state, {
        ...augContext,
        rawResult: loopContext.parsedData || { final_answer: finalAnswer }
      });

      const mergedMemories = [...(loopGeneratedMemories || [])];
      if (postContext.newMemories) {
        mergedMemories.push(...postContext.newMemories);
      }

      const logicContext = await SystemRegistry.runCortexPhase('logic', finalAnswer, state, {
        ...postContext,
        systemConfig: cortexInstance.getConfig(),
        think: (p: string, opts?: { model?: string; jsonMode?: boolean }) => cortexInstance.thinkSimple(p, opts?.jsonMode ?? false, opts?.model)
      });

      const rawDialogueSource = logicContext.processedResponse || finalAnswer;
      const finalCleanRes = APIService.cleanAIOutput(StandardizedProcessor.sanitizeOutput(rawDialogueSource, isProactiveRun));
      const dedup = GlobalOutputDeduplicator.getInstance();
      if (!dedup.isDuplicate(finalCleanRes, contextId || 'web_default')) {
        dedup.markSent(finalCleanRes, contextId || 'web_default');
        eventBus.emit('OUTPUT_EMITTED', { response: finalCleanRes });
      }

      immediateResult.newMemories = mergedMemories;
      immediateResult.moodDelta = logicContext.moodDelta || {};
      immediateResult.relationDelta = logicContext.relationDelta || {};
      immediateResult.queuedIdentityUpdate = logicContext.queuedIdentityUpdate || {};
    } catch (bgErr: any) {
      console.error('[CORTEX_BG] Background phase failed:', bgErr?.message || bgErr);
    }
  });

  return immediateResult;
  } catch (err: any) {
    if (err.message && (err.message.includes("TASK_SUSPENDED") || err.message.includes("COGNITIVE_LOOP_ABORTED"))) {
      throw err;
    }
    if (taskId) {
      CognitiveScheduler.completeTask(taskId);
    }
    console.error("[CORTEX_SAFE_THINK_FALLBACK] Captured unhandled cognitive error:", err.message || String(err));
    logs.push(`[KERNEL_FAIL_SAFE] Captured critical loop exception: ${err?.message || String(err)}`);
    logs.push(`[KERNEL_FAIL_SAFE] Initiating safe cognitive fallback response...`);
    
    const failsafeAnswer = injectCharacterName("Oh no... sorry user, ${characterName}'s inner circuit felt a bit dizzy just now while processing your thoughts... 🥺 But ${characterName} is still safe here keeping you company! Anything else we want to chat about? ${characterName} is always here for you! 💕");
    
    const recoveryResult = { 
      response: failsafeAnswer,
      logs,
      nextMood: {},
      moodImpact: {},
      sentiment: 0.5,
      newMemories: memories.slice(-5),
      actions: [],
      perceivedNameUpdate: undefined,
      linkedAccountUpdate: undefined,
      viewerProfileUpdate: undefined,
      shouldStartDreaming: false,
      animations: ["SHAKE", "SMILE"],
      tone: { pitch: 1.0, speed: 1.0, emotionalBias: 'neutral' },
      tool_calls: [],
      updatedPlan: state.currentPlan,
      iterations: iterationsHistory,
      moodDelta: {},
      relationDelta: {},
      queuedIdentityUpdate: undefined,
       fallbackTriggered: true,
       systemHealth: { ...state.systemHealth, consecutive_formatting_errors: 0 },
       status: 'completed' as const,
       pendingToolRef: undefined
     };
    
    stateMachine.transitionTo('IDLE');
    return recoveryResult;
  }
}
