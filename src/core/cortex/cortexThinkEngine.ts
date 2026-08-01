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
import { buildToolResultMessages } from '../openaiTools';
import { StreamExtractor } from './streamExtractors';
import { toSingleString } from '@/core/kernel/configNormalizer';
import { repairJsonFormatWithLLM } from './jsonRepairer';
import { FastTrackRunner } from './fastTrackRunner';
import { extractBestJsonObject } from './jsonExtract';
import { makeToolCall } from './cortexThinkEngineUtils';
import { DEFAULT_NEURAL_CORES } from '@shared/constants';
import { broadcastToWS } from '../server/apiRouter.js';
import { GlobalOutputDeduplicator } from '../kernel/GlobalOutputDeduplicator.js';
import { DynamicToolSynthesizer } from './dynamicToolSynthesizer.js';
import { LlmIoAuditor } from '../server/llmAuditor.js';
import { BackgroundToolDispatcher } from '../kernel/BackgroundToolDispatcher.js';

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
        if (!reader) throw new Error("Gagal menginisialisasi pembaca aliran data (readable stream).");
        
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
        throw new Error("Aliran data selesai tanpa memproses hasil kognisi akhir.");
      } else {
        const data = await response.json();
        if (data.success && data.result) {
          return data.result;
        }
        throw new Error(data.error || 'Server kognisi mengembalikan format tidak valid');
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

  let enforceStrictJson = false;
  if (input && input.includes("[PRE-PROCESS: ENFORCE_JSON_ONLY]")) {
    enforceStrictJson = true;
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
  const preContext = await SystemRegistry.runCortexPhase('PHASE 1: AGGREGATION', input, state, {
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
        id: Math.random().toString(36).substr(2, 9),
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

  const soulContext = await SystemRegistry.runCortexPhase('SOUL' as any, input, state, { ...preContext, think });

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
  const augContext = await SystemRegistry.runCortexPhase('PHASE 2: COMPRESSION', input, state, {
    ...soulContext,
    activePersona: resolvedPersona,
    dreams,
    currentPlan,
    contextId,
    chatType,
    userName,
    think
  });

  logs.push("[PHASE 3] Gateway Active: Selecting Optimal Provider...");
  const gateway = SystemRegistry.getModule<CortexModule>('provider-gateway');
  
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
  // UPDATE: Mode Berpikir Cepat (Bypass Multi-Turn Reasoning) tidak lagi membatasi turn/iterasi ke 1 (maxIterations tetap 3).
  // Sebagai gantinya, mode ini mengaktifkan eksekusi paralel multi-proses / multi-node untuk seluruh tool calls secara simultan.
  let maxIterations = 3;
  let loopContext = { ...augContext, config: settings, think };

  if (!state.systemHealth) {
    state.systemHealth = { latency: 0, successRate: 1.0, tasksCompleted: 0 };
  }
  if (state.systemHealth.consecutive_formatting_errors === undefined) {
    state.systemHealth.consecutive_formatting_errors = 0;
  }

  const isResettingFormat = (state.systemHealth.consecutive_formatting_errors || 0) >= 3;
  
  if (isResettingFormat) {
    logs.push("[CORTEX] Consecutive formatting errors threshold exceeded! Swapping back into raw plain text dialogue mode to clean neural channels.");
    state.systemHealth.consecutive_formatting_errors = 0;
    
    if (loopContext.assembledSystemPrompt) {
      loopContext.assembledSystemPrompt += `\n\n[CRITICAL SYSTEM DIRECTIVE - MOOD RESET & PLAIN CONVERSATIONAL MODE ACTIVE]:
Because the cognitive vessel is experiencing severe nested parsing formatting synchronization issues, the system has temporarily reset your output format to plain text dialogue.
You MUST:
1. Briefly explain this reset to the user in character as Yuihime, in a short affectionate sentence at the start of your speech.
2. Continue speaking normally, naturally, and warmly in your cute persona. Do NOT output any JSON, XML tags, thoughts, or formatting symbols. Directly write out your spoken reply of comfort and affection.`;
    }
  } else {
    if (loopContext.assembledSystemPrompt) {
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
  }

  let toolsToCall: any[] = snapshot ? (snapshot.toolsToExecute || []) : [];
  let processedResponse = "";
  let animations: string[] = snapshot ? (snapshot.accumulatingBuffer?.animations || []) : [];
  let moodImpact: any = snapshot ? (snapshot.accumulatingBuffer?.moodImpacts || {}) : {};
  const toolExecutionHistory: any[] = [];
  const loopGeneratedMemories: any[] = [];

  let skipGatewayForResume = (snapshot && toolsToCall.length > 0) ? true : false;

  while (iteration < maxIterations) {
    iteration++;
    
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
        logs.push(`[AGI_REFLECT] Running looped self-reflection (iteration ${iteration})...`);
        const reflectContext = await SystemRegistry.runCortexPhase('AGI_REFLECT' as any, input, state, {
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
        logs.push(`[AGI_REFLECT] Non-blocking reflection failure: ${reflectErr?.message || reflectErr}`);
      }
    }
    // --- END AREA 2 ---

    if (iteration > 1 && toolExecutionHistory.length > 0) {
      const lastExecuted = toolExecutionHistory[toolExecutionHistory.length - 1];
      if (lastExecuted && lastExecuted.results) {
        const hasFailure = lastExecuted.results.some((res: any) => {
          if (res.success === false) return true;
          if (res.error) return true;
          const obs = res.observation;
          if (obs && typeof obs === 'object') {
            if (obs.status === 'error' || obs.success === false || obs.error) {
              return true;
            }
          }
          return false;
        });

        let instructionText = "";
        if (hasFailure) {
          instructionText = `Based on the tool execution results above (noting that some features/tools FAILED with errors), immediately formulate your casual spoken response to the user. Do NOT pretend you succeeded! Instead, as Yuihime, explain the failure or difficulty to the user in a charming, sweet, slightly apologetic and character-consistent way (e.g., 'Aduh, maaf ya user... Yui coba buat fotonya tapi sirkuit batin/servernya lagi agak ngambek... atau user mau Yui coba lagi?'). Maintain your lovable personality, do NOT provide raw technical code details/stack traces, and ask if they want you to retry, do something else, or just keep talking!`;
        } else {
          instructionText = `Based on the successful tool execution results above, you can EITHER choose to call another tool if you need more actions/information to fully answer the user (such as list_files, read_file, run_command), OR if you have all the information required, formulate your final casual spoken response to the user. Do not repeat technical details, do not write internal thoughts, plans, or analysis blocks outside the JSON structure. Directly chat with the user in your natural, emotional, affectionate/tsundere personal character using the user's conversational language!`;
          
          const readToolRes = lastExecuted.results.find((res: any) => 
            ['read_file', 'list_files', 'view_logs', 'search_chat', 'file_manager'].includes(res.tool) && res.success
          );
          if (readToolRes) {
            instructionText += `\n\nCRITICAL DIRECTIVE FOR RETRIEVED CONTENTS: Since you successfully retrieved content, data, file list, or logs via '${readToolRes.tool}', you MUST share/display the exact retrieved file content, directory listing, or log data inside your 'speech' field so the user can see it! Do NOT give a false promise by saying 'Ini dia isinya...' or 'Yui sudah baca...' or 'Ini list catatan...' without actually writing out the retrieved contents or list of files in this very response. If the content, listing, or log is empty, clearly state to the user that it is currently empty.`;
          }
        }

        const observationPrompt = `\n\n[SYSTEM_OBSERVATION]: Tool execution results:\n${JSON.stringify(lastExecuted.results, null, 2)}\n\n[IMPORTANT INSTRUCTION]: ${instructionText}`;
        loopInput = input + observationPrompt;
      }
    }

    const loopSettings = {
      ...settings,
      [settings.provider]: {
        ...(settings[settings.provider] || {}),
        isJson: !isResettingFormat
      }
    };

    const activeProviderId = settings.provider || 'gemini';
    const providerSpecificConfig = settings[activeProviderId] || {};
    const targetModelId = toSingleString(providerSpecificConfig.model) || 'gemini-3.5-flash';

    let activeIterationInput = loopInput;
    if (iteration === 1 && (enforceStrictJson || !isResettingFormat)) {
      activeIterationInput += "\n\n[CRITICAL PRE-PROCESSING DIRECTIVE (FIRST PASS)]: You are strictly prohibited from writing conversational/speech text if you are calling tools. If you populate the \"tool_calls\" array with tool calls (e.g., search_web, read_url, run_command, etc.), you MUST keep the \"speech\" field entirely empty (\"\") in this iteration! Your conversational response will be formulated in the subsequent pass once tools have executed. Only if you are not calling any tools should you output speech. Output valid JSON matching the schema.";
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
      response_format: {
        type: !isResettingFormat ? 'json_object' : 'text'
      }
    };

    loopContext.payloadBlueprint = requestPayloadBlueprint;
    if (loopSettings[activeProviderId]) {
      loopSettings[activeProviderId].payloadBlueprint = requestPayloadBlueprint;
    }

    const extractor = new StreamExtractor(isResettingFormat, (delta: string) => {
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
      loopContext = await gateway.run(activeIterationInput, state, { 
        ...loopContext, 
        config: loopSettings, 
        attachments,
        signal: signal,
        onChunk: (chunk: string) => {
          extractor.feed(chunk);
        }
      });
    }
    logs.push(`[CORTEX_LOOP] Iteration ${iteration} Gateway routed via: ${loopContext.activeProvider || 'unknown'}`);

    const rawResultStr = (loopContext.rawResult || "").trim();
    const validation = ValidationMiddleware.validate(rawResultStr);
    if (!validation.success) {
      logs.push(`[CORTEX_LOOP] [SCHEMA_ERROR] Output failed strict validation: ${validation.errors.join(' | ')}`);
    }

    let parsedPayload: any = null;
    let parseError: string | null = null;

    if (isResettingFormat) {
       parsedPayload = {
         thought: "Sirkuit kognitif Yui sedang memulihkan diri dari error format beruntun, beralih sementara ke mode percakapan biasa.",
         final_answer: rawResultStr,
         animations: ["SHAKE", "SMILE"]
       };
       logs.push("[CORTEX_LOOP] Successfully bypassed standard JSON_OBJECT parsing structure under Active Format Reset.");
    } else {
       const cleanJsonStr = APIService.cleanAIOutput(rawResultStr);

       if (!parsedPayload) {
          const bestJson = extractBestJsonObject(cleanJsonStr || rawResultStr);
          if (bestJson) {
             try {
                parsedPayload = JSON.parse(bestJson);
                logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT using balanced-object extraction.");
                if (parsedPayload && parsedPayload.properties && typeof parsedPayload.properties === 'object' && !Array.isArray(parsedPayload.properties)) {
                   if (parsedPayload.properties.thought || parsedPayload.properties.tool_calls || parsedPayload.properties.tools_to_call || parsedPayload.properties.final_answer) {
                      logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");
                      Object.assign(parsedPayload, parsedPayload.properties);
                   }
                }
             } catch {}
          }
       }

       try {
          let repaired = cleanJsonStr;
           let directParseOk = false;
            try {
               const _parseMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
               parsedPayload = _parseMatch ? JSON.parse(_parseMatch[0]) : null;
               directParseOk = true;
               logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT response layout directly.");
           } catch (_) {
              repaired = StandardizedProcessor.locallyRepairJson(cleanJsonStr);
           }
           if (!directParseOk) { const _rMatch = repaired.match(/\{[\s\S]*\}/); parsedPayload = _rMatch ? JSON.parse(_rMatch[0]) : null; }
          logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT response layout.");
          if (parsedPayload && parsedPayload.properties && typeof parsedPayload.properties === 'object' && !Array.isArray(parsedPayload.properties)) {
             if (parsedPayload.properties.thought || parsedPayload.properties.tool_calls || parsedPayload.properties.tools_to_call || parsedPayload.properties.final_answer) {
                logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");
                Object.assign(parsedPayload, parsedPayload.properties);
             }
          }
       } catch (err: any) {
          parseError = err?.message || String(err);
          const bestJson = extractBestJsonObject(cleanJsonStr || rawResultStr);
          if (bestJson) {
             try {
                parsedPayload = JSON.parse(bestJson);
                logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT using balanced-object extraction in catch fallback.");
                if (parsedPayload && parsedPayload.properties && typeof parsedPayload.properties === 'object' && !Array.isArray(parsedPayload.properties)) {
                   if (parsedPayload.properties.thought || parsedPayload.properties.tool_calls || parsedPayload.properties.tools_to_call || parsedPayload.properties.final_answer) {
                      logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");
                      Object.assign(parsedPayload, parsedPayload.properties);
                   }
                }
                parseError = null;
             } catch {}
          }
          if (!parsedPayload) {
             const firstBrace = cleanJsonStr.indexOf('{');
             const lastBrace = cleanJsonStr.lastIndexOf('}');
             if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                   try {
                       const _bStr = cleanJsonStr.substring(firstBrace, lastBrace + 1);
                       const _bMatch = _bStr.match(/\{[\s\S]*\}/);
                       parsedPayload = _bMatch ? JSON.parse(_bMatch[0]) : null;
                       logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT using bracket isolation.");
                   if (parsedPayload && parsedPayload.properties && typeof parsedPayload.properties === 'object' && !Array.isArray(parsedPayload.properties)) {
                      if (parsedPayload.properties.thought || parsedPayload.properties.tool_calls || parsedPayload.properties.tools_to_call || parsedPayload.properties.final_answer) {
                         logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");
                         Object.assign(parsedPayload, parsedPayload.properties);
                      }
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
                   thought: xmlParsed.thought || xmlParsed.thoughts || "Yuihime memproses intuisi batin menggunakan struktur XML/tag.",
                    final_answer: xmlParsed.final_answer ?? xmlParsed.speech ?? xmlParsed.opening_response ?? rawResultStr,
                   animations: xmlParsed.animations || ["SMILE"],
                   tool_calls: xmlParsed.tool_calls || xmlParsed.tools_to_call || []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Succeeded in parsing XML fallback layout BEFORE engaging LLM repairer.");
             }
          } catch (e: any) {
            console.warn("[CORTEX:FastTrack] Browser fallback error:", e.message);
          }

          if (!parsedPayload) {
             const hasBraces = rawResultStr.includes('{') || rawResultStr.includes('}');
             const hasXml = /<[a-zA-Z_]+>/i.test(rawResultStr);
             const lowerRaw = rawResultStr.toLowerCase();

             const isPlanningThought =
                lowerRaw.includes("i should") ||
                lowerRaw.includes("i will") ||
                lowerRaw.includes("i need to") ||
                lowerRaw.includes("user wants") ||
                lowerRaw.includes("wants to") ||
                lowerRaw.includes("should call") ||
                lowerRaw.includes("calling tool") ||
                lowerRaw.includes("tool call") ||
                lowerRaw.includes("list_files") ||
                lowerRaw.includes("read_file") ||
                lowerRaw.includes("run_command") ||
                lowerRaw.includes("web_search") ||
                lowerRaw.includes("plan:") ||
                lowerRaw.includes("response draft:") ||
                lowerRaw.includes("revised draft:") ||
                lowerRaw.includes("final json structure:") ||
                lowerRaw.includes("final json:") ||
                lowerRaw.includes("here is") ||
                lowerRaw.includes("my draft") ||
                lowerRaw.includes("according to the instructions") ||
                lowerRaw.includes("scheduler") ||
                lowerRaw.includes("final_answer");

             const isTranslationOrLanguageTask =
                lowerRaw.includes("translate") ||
                lowerRaw.includes("terjemah") ||
                lowerRaw.includes("arti dari") ||
                lowerRaw.includes("bahasa inggris") ||
                lowerRaw.includes("english") ||
                lowerRaw.includes("kalimat") ||
                lowerRaw.includes("word") ||
                lowerRaw.includes("sentence");

             let planningActionDetected = false;

             if (!isTranslationOrLanguageTask) {
                const hasSystemToolNames =
                   lowerRaw.includes("list_files") ||
                   lowerRaw.includes("read_file") ||
                   lowerRaw.includes("run_command") ||
                   lowerRaw.includes("web_search") ||
                   lowerRaw.includes("scheduler") ||
                   lowerRaw.includes("final_answer");

                const hasPlanningAction =
                   lowerRaw.includes("i should use") ||
                   lowerRaw.includes("i will call") ||
                   lowerRaw.includes("i need to call") ||
                   lowerRaw.includes("i should call") ||
                   lowerRaw.includes("calling tool") ||
                   lowerRaw.includes("tool call") ||
                   lowerRaw.includes("i will use") ||
                   lowerRaw.includes("i should run") ||
                   lowerRaw.includes("i need to use");

                if (hasSystemToolNames && hasPlanningAction) {
                   planningActionDetected = true;
                }

                if (!planningActionDetected) {
                   const isAssistantTalkingToSelf =
                      (lowerRaw.includes("user wants") || lowerRaw.includes("al wants") || lowerRaw.includes("the user is asking")) &&
                      (lowerRaw.includes("i should") || lowerRaw.includes("i will") || lowerRaw.includes("i need to"));

                   const isSelfReferencingAI =
                      lowerRaw.includes("as an ai assistant") ||
                      lowerRaw.includes("based on my instructions") ||
                      lowerRaw.includes("according to my system instructions");

                   if (isAssistantTalkingToSelf || isSelfReferencingAI) {
                      planningActionDetected = true;
                   }
                }
             }

             if (planningActionDetected) {
                logs.push("[CORTEX_LOOP] [PLANNING_DETECTION] Detected raw text containing planning thoughts/assistant monologue instead of character speech. Attempting deterministic zero-token extraction BEFORE engaging LLM repairer...");
                
                const lines = rawResultStr.split('\n');
                const filteredLines = lines.filter(line => {
                   const trimmedLine = line.trim().toLowerCase();
                   if (!trimmedLine) return false;

                   const isMonologue =
                      trimmedLine.startsWith("i should") ||
                      trimmedLine.startsWith("i will") ||
                      trimmedLine.startsWith("i need to") ||
                      trimmedLine.startsWith("i can") ||
                      trimmedLine.startsWith("user wants") ||
                      trimmedLine.startsWith("al wants") ||
                      trimmedLine.startsWith("the user is") ||
                      trimmedLine.startsWith("let's") ||
                      trimmedLine.startsWith("let me") ||
                      trimmedLine.startsWith("calling") ||
                      trimmedLine.startsWith("running") ||
                      trimmedLine.startsWith("using tool") ||
                      trimmedLine.startsWith("tool call") ||
                      trimmedLine.startsWith("based on my") ||
                      trimmedLine.startsWith("as an ai") ||
                      trimmedLine.startsWith("according to my") ||
                      trimmedLine.startsWith("checking ") ||
                      trimmedLine.startsWith("first, i") ||
                      trimmedLine.startsWith("next, i") ||
                      trimmedLine.startsWith("then, i") ||
                      trimmedLine.startsWith("plan:") ||
                      trimmedLine.startsWith("response draft:") ||
                      trimmedLine.startsWith("revised draft:") ||
                      trimmedLine.startsWith("final json structure:") ||
                      trimmedLine.startsWith("final json:") ||
                      trimmedLine.startsWith("here is") ||
                      trimmedLine.startsWith("my draft") ||
                      trimmedLine.startsWith("according to the instructions") ||
                      trimmedLine.includes("list_files") ||
                      trimmedLine.includes("read_file") ||
                      trimmedLine.includes("run_command") ||
                      trimmedLine.includes("web_search") ||
                      trimmedLine.includes("scheduler") ||
                      trimmedLine.includes("final_answer");

                   return !isMonologue;
                });

                const cleanSpeech = filteredLines.map(l => l.trim()).filter(Boolean).join('\n\n').trim();

                if (cleanSpeech && cleanSpeech.length > 5) {
                   const extractedFromSpeech = extractBestJsonObject(cleanSpeech);
if (extractedFromSpeech) {
                       try {
                          const sanitized = extractedFromSpeech.match(/\{[\s\S]*\}/);
                          parsedPayload = JSON.parse(sanitized ? sanitized[0] : extractedFromSpeech);
                          logs.push("[CORTEX_LOOP] [MONOLOGUE_STRIPPER] Extracted balanced JSON object from cleaned speech before engaging LLM repairer.");
                      } catch {}
                   }
                   if (!parsedPayload) {
                      parsedPayload = {
                         thought: "Menerima respons polos setelah menyaring keluar monolog perencanaan internal secara deterministik.",
                         final_answer: cleanSpeech,
                         animations: ["SMILE"],
                         tool_calls: []
                      };
                      logs.push("[CORTEX_LOOP] [MONOLOGUE_STRIPPER] Successfully stripped planning monologue lines. Extracted clean dialogue without LLM call!");
                   }
                } else {
                   logs.push("[CORTEX_LOOP] [MONOLOGUE_STRIPPER] Stripped text is empty or too short. Engaging failsafe reprocess...");
                   try {
                      const failsafePrompt = PromptRegistry.getInstance().compile('cortex:failsafe_reprocess', {
                         input: input
                      });
                      const failsafeSpeech = await cortexInstance.thinkSimple(failsafePrompt);
                      parsedPayload = {
                         thought: "Menerima respons polos setelah memproses penyeimbang batin failsafe.",
                         final_answer: failsafeSpeech,
                         animations: ["SMILE"],
                         tool_calls: []
                      };
                   } catch (err: any) {
                      console.error("[CORTEX_LOOP] Failsafe reprocess failed:", err.message);
                   }
                }
             }

             if (!parsedPayload && !planningActionDetected && !hasBraces && !hasXml && rawResultStr.trim().length > 0) {
                parsedPayload = {
                   thought: "Menerima respons polos non-JSON dari provider neural secara langsung demi menjaga kontinuitas obrolan.",
                   final_answer: rawResultStr,
                   animations: ["SMILE"],
                   tool_calls: []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Detected raw plain text response, bypassed LLM repairer and wrapped directly.");
             } else if (!parsedPayload) {
                parsedPayload = {
                   thought: "Menerima respons polos non-JSON dari provider neural secara langsung demi menjaga kontinuitas obrolan.",
                   final_answer: rawResultStr,
                   animations: ["SMILE"],
                   tool_calls: []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Succeeded in wrapping raw dialogue text into standard payload structures.");
             }
          }
       }

       if (!parsedPayload) {
          logs.push("[CORTEX_LOOP] [FORMAT_ERROR] Response did not conform to JSON_OBJECT format. Engaging isolated LLM JSON format repairer...");
          parsedPayload = await repairJsonFormatWithLLM((p: string, jm?: boolean) => cortexInstance.thinkSimple(p, jm), rawResultStr, input);
          if (!parsedPayload) {
             parseError = parseError || "LLM Format Repairer failed to parse output.";
          }
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
          const cleanedStr = rawToolsCall.replace(/```json/gi, '').replace(/```/gi, '').trim();
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

      let speechText = (parsedPayload.speech || parsedPayload.final_answer || parsedPayload.response || "").trim();

      if (speechText && (speechText.includes('<tool_call>') || /^[\s\S]*"tool_calls"\s*:\s*\[/.test(speechText))) {
        speechText = "";
      }

      if (rawToolsCall.length > 0) {
        const hasFinalReply = rawToolsCall.some((tc: any) => tc.tool === 'speak' || tc.tool === 'final_answer');
        if (!hasFinalReply && speechText.length > 0) {
          const blockingTools = [
            'web_search', 'search', 'search_internet', 'google_search', 'bing_search', 'duckduckgo_search',
            'execute_sql', 'cloudsql_execute_sql', 'query_database',
            'read_url', 'read_webpage', 'browse_url', 'fetch_url', 'visit_url',
            'tensorart_generate', 'generate_image', 'image_generate', 'dall_e', 'stable_diffusion',
            'execute_bash', 'run_command', 'shell', 'execute_shell', 'run_script',
            'read_file', 'list_files', 'list_dir', 'file_read', 'get_file_contents',
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
        // Guna mematuhi instruksi kognisi: jika final_answer kosong (speechText kosong), jangan lakukan fail safe ke thought atau placeholder.
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

      if (!isResettingFormat) {
        state.systemHealth.consecutive_formatting_errors = 0;
      }
    } else {
      logs.push("[CORTEX_LOOP] [FORMAT_ERROR] Output fails to parse as valid JSON. Catching non-JSON output and engaging format refactoring loop...");
      if (iteration < maxIterations) {
        const errorPrompt = PromptRegistry.getInstance().compile('cortex:error_correction', {
          parseError: parseError || "Not a valid JSON object",
          rawResultStr: rawResultStr
        });
        loopInput = input + errorPrompt;
        continue;
      } else {
        logs.push("[CORTEX_LOOP] Maximum format correction refactoring attempts reached. Falling back gracefully to treating raw output as plain text to preserve character conversation.");
        state.systemHealth.consecutive_formatting_errors = (state.systemHealth.consecutive_formatting_errors || 0) + 1;
        
        parsedPayload = {
          thought: "Synaptic formatting error, falling back to clean plain text stream recovery.",
          final_answer: "",
          animations: ["SMILE"],
          tool_calls: []
        };

        loopContext.rawResult = rawResultStr;
        loopContext.processedResponse = "Aduh... maaf ya, sepertinya ada sedikit gangguan dalam pemrosesan saya. Tapi jangan khawatir, Yui tetap di sini untuk menemani kamu! 🌸";
        loopContext.thought = parsedPayload.thought;
        loopContext.animations = parsedPayload.animations;
        loopContext.moodImpact = {};
        loopContext.toolsToCall = [];
        loopContext.parsedData = parsedPayload;
      }
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
    if (verifier) {
      loopContext = await verifier.run(loopContext.rawResult || "", state, loopContext);
      if (loopContext.verifierStatus === 'corrected') logs.push("[KERNEL] Verifier performed structural repair.");
    }

    logs.push("[PHASE 4] Hub Active: Parallel Streamer Synchronization...");
    const streamer = SystemRegistry.getModule<CortexModule>('parallel-streamer');
    if (streamer) {
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
      currentThought = `Yuihime memproses intuisi batin pada iterasi ${iteration}...`;
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
      // `max_iterations_override` inside a tool call's arguments. It is capped by the
      // `tool-executor.maxIterationsCeiling` config key and never lowers the current max.
      try {
        const ceiling = settings['tool-executor']?.maxIterationsCeiling !== undefined
          ? Number(settings['tool-executor'].maxIterationsCeiling)
          : 5;
        for (const tc of toolsToCall) {
          const override = tc?.args?.max_iterations_override ?? tc?.function?.arguments?.max_iterations_override;
          if (typeof override === 'number' && override > maxIterations && override <= ceiling) {
            maxIterations = Math.floor(override);
            logs.push(`[CORTEX] max_iterations_override accepted: extended loop to ${maxIterations} (ceiling ${ceiling}).`);
          }
        }
       } catch (_) {}

        if (settings['tool-executor']?.bgEnabled === true && contextId) {
          const blockingTools = ['speak', 'final_answer', 'status_update'];
          const nonBlockingTools = toolsToCall.filter(
            (tc: any) => !blockingTools.includes(tc.tool || tc.name)
          );
          const allNonBlocking = nonBlockingTools.length > 0 && nonBlockingTools.length === toolsToCall.length;

          if (allNonBlocking) {
            let indonesianStatus = "Yui sedang memproses sesuatu...";
            try {
              const toolNames = toolsToCall.map((tc: any) => tc.tool || tc.name).join(", ");
              if (toolNames.includes("web_search") || toolNames.includes("search")) {
                indonesianStatus = "Yui sedang berselancar mencari informasi terbaru untuk user... 🌐✨";
              } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
                indonesianStatus = "Yui sedang menelusuri data dalam pangkalan batin batin... 🗄️🔍";
              } else if (toolNames.includes("execute_bash") || toolNames.includes("run_command")) {
                indonesianStatus = "Yui sedang memproses instruksi sistem di balik layar... ⚙️💻";
              } else {
                indonesianStatus = `Yui sedang memproses kemampuan: [${toolNames}]... 🌸`;
              }

              const dedup = GlobalOutputDeduplicator.getInstance();
              if (!dedup.isDuplicate(indonesianStatus, contextId || 'web_default')) {
                dedup.markSent(indonesianStatus, contextId || 'web_default');
                eventBus.emit('OUTPUT_EMITTED', { response: indonesianStatus, isInternal: false });

                if (typeof broadcastToWS === 'function') {
                  broadcastToWS({
                    type: "state_update",
                    data: {
                      state: { status: "thinking" },
                      activeSubtitle: indonesianStatus,
                      typedSubtitle: indonesianStatus,
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
              response: indonesianStatus,
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
      
      // Dynamic Indonesian status update broadcast to WebSocket to prevent blind wait state
      try {
        const toolNames = toolsToCall.map((tc: any) => tc.tool || tc.name).join(", ");
        let indonesianStatus = "Yui sedang memproses sesuatu...";
        if (toolNames.includes("web_search") || toolNames.includes("search")) {
          indonesianStatus = "Yui sedang berselancar mencari informasi terbaru untuk user... 🌐✨";
        } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
          indonesianStatus = "Yui sedang menelusuri data dalam pangkalan batin batin... 🗄️🔍";
        } else if (toolNames.includes("execute_bash") || toolNames.includes("run_command")) {
          indonesianStatus = "Yui sedang memproses instruksi sistem di balik layar... ⚙️💻";
        } else {
          indonesianStatus = `Yui sedang memproses kemampuan: [${toolNames}]... 🌸`;
        }
        
        if (typeof broadcastToWS === 'function') {
          const dedup = GlobalOutputDeduplicator.getInstance();
          if (!dedup.isDuplicate(indonesianStatus, contextId || 'web_default')) {
            dedup.markSent(indonesianStatus, contextId || 'web_default');
            broadcastToWS({
              type: "state_update",
              data: {
                state: { status: "thinking" },
                activeSubtitle: indonesianStatus,
                typedSubtitle: indonesianStatus,
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
        
        if (!tool) {
          const tName = tc.name || tc.tool;
          console.log(`[DYNAMIC_SYNTHESIS] Tool '${tName}' not found. Attempting autonomous dynamic tool synthesis...`);
          try {
             tool = await DynamicToolSynthesizer.synthesizeAndRegister(tName, input, cortexInstance);
          } catch (synthErr: any) {
            console.error(`[CORTEX_SYNTHESIS_FAIL] Failed during dynamic tool synthesis for '${tName}':`, synthErr.message);
          }
        }

        let res: any;
        if (tool) {
          let execStart = Date.now();
          try {
            // Reserved control metadata: `_meta` lets the LLM request per-call
            // execution tweaks (e.g. timeout_ms). It is NEVER forwarded to the tool.
            let metaTimeoutMs: number | undefined;
            if (tool.metadata && tool.metadata.parameters) {
              const schema = tool.metadata.parameters;
              let parsedArgs: any = tc.args || {};
if (typeof parsedArgs === 'string') {
                 try {
                   const sanitized = parsedArgs.match(/\{[\s\S]*\}/);
                   parsedArgs = JSON.parse(sanitized ? sanitized[0] : parsedArgs);
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

            if (signal?.aborted) {
              throw new Error("Tool execution aborted: client connection closed");
            }

            let abortListener: (() => void) | null = null;
            const abortPromise = new Promise((_, reject) => {
              if (signal?.aborted) {
                reject(new Error("Tool execution aborted: client connection closed"));
                return;
              }
              abortListener = () => reject(new Error("Tool execution aborted: client connection closed"));
              signal?.addEventListener("abort", abortListener);
            });

            const toolExecutorConfig = settings['tool-executor'] || {};
            const generalTimeoutMs = toolExecutorConfig.timeoutMs !== undefined ? Number(toolExecutorConfig.timeoutMs) : 60000;
            const isShell = ['run_command', 'shell', 'execute_shell'].includes(tc.name || tc.tool);
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
                console.warn(`[CORTEX] Attempt ${attempts} failed for tool ${tc.name || tc.tool}:`, err.message);
                if (attempts >= maxAttempts) {
                  throw err;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }

            if (abortListener && signal) {
              signal.removeEventListener("abort", abortListener);
            }

            res = { tool: tc.name || tc.tool, observation: toolRes, success: true, durationMs: Date.now() - execStart };
          } catch (err: any) {
            console.error(`[CORTEX] Tool schema validation or execution failed for ${tc.name || tc.tool}:`, err.message);
            res = { tool: tc.name || tc.tool, error: `Execution failed: ${err.message}`, success: false, durationMs: Date.now() - execStart };
          }
        } else {
          res = { tool: tc.name || tc.tool, error: 'Tool not found', success: false, notFound: true };
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
          if (res.success && (tc.tool === 'speak' || tc.name === 'speak')) {
            const speech = res.observation?.speech;
            if (speech) {
              const dedup = GlobalOutputDeduplicator.getInstance();
              if (!dedup.isDuplicate(speech, contextId || 'web_default')) {
                dedup.markSent(speech, contextId || 'web_default');
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
        logs.push(`[CORTEX] Built ${newToolMessages.length} native tool result message(s) for provider '${activeProviderId}'.`);
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
        const toolCallMemoryId = `tool_call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const parsedThought = parsedPayload ? (parsedPayload.thought || parsedPayload.thoughts || '') : '';
        const toolCallContent = `[TOOL_CALLS]: Yui thought: "${parsedThought}". Initiated tools: ${JSON.stringify(toolsToCall.map((tc: any) => ({ tool: tc.name || tc.tool, args: tc.args })))}${parsedPayload && parsedPayload.speech ? `\nSpeech: "${parsedPayload.speech}"` : ''}`;
        
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
          const observationMemoryId = `tool_obs_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
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

        // Re-assemble/re-compress the system prompt dynamically with the updated memories context before a new think request is sent
        logs.push("[CORTEX] Re-assembling system prompt with integrated tool execution memories to prevent recursive loop crashes...");
        const updatedAugContext = await SystemRegistry.runCortexPhase('PHASE 2: COMPRESSION', input, state, {
          ...soulContext,
          memories, // pass the updated memories!
          activePersona: resolvedPersona,
          dreams,
          currentPlan,
          contextId,
          chatType,
          userName
        });
        if (updatedAugContext && updatedAugContext.assembledSystemPrompt) {
          loopContext.assembledSystemPrompt = updatedAugContext.assembledSystemPrompt;
          logs.push("[CORTEX] System prompt updated successfully with fresh episodic memories of the tool calls and observations.");
        }

        // --- COGNITIVE TOOL OUTPUT VALIDATION PHASE ---
        if (realTools.length > 0) {
          logs.push("[CORTEX_VALIDATION] Phase: Verifying tool execution outputs within the current conversation context...");
          try {
            const validationPrompt = `
You are YuiHime's internal cognitive validation unit.
Please verify and validate the following tool execution results within the current conversation context:
Conversation context: "${input}"
Tools executed:
${toolResults.map(tr => `- Tool: ${tr.tool} | Success: ${tr.success}
  Output/Observation: ${typeof tr.observation === 'object' ? JSON.stringify(tr.observation) : String(tr.observation || tr.error || '')}`).join('\n')}

Analyze:
1. Did the tools execute successfully and produce the expected outputs?
2. Are the tool outputs sufficient and correct to address the user's input/request?
3. Are there any errors, truncated data, or logical anomalies that Yui needs to correct or handle?

Provide a concise validation summary. Start with [VALIDATION_SUCCESS] if everything is correct and sufficient, or [VALIDATION_FAILED] if there are critical errors or missing data that require a retry or correction.
`;

            const validationSettings = {
              ...settings,
              [settings.provider]: {
                ...(settings[settings.provider] || {}),
                isJson: false
              }
            };

            if (gateway) {
              logs.push("[CORTEX_VALIDATION] Contacting AI Gateway to perform validation check...");
              const valContext = await gateway.run(validationPrompt, state, {
                ...augContext,
                config: validationSettings
              });

              const validationOutput = (valContext.rawResult || "").trim();
              logs.push(`[CORTEX_VALIDATION] Validation feedback: ${validationOutput.substring(0, 200)}...`);

              if (!validationOutput.startsWith("[VALIDATION_SUCCESS]")) {
                // Store the validation result as a system memory so Yui has this verification context
                const validationMemoryId = `tool_val_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const validationMemory = {
                  id: validationMemoryId,
                  ownerId: 'local_user',
                  type: 'observation' as const,
                  speaker: 'System',
                  content: `[SYSTEM_VALIDATION]: Cognitive verification of tool execution: "${validationOutput}"`,
                  timestamp: Date.now() + 8,
                  importance: 0.6,
                  tags: ['tool_validation'],
                  context: contextId,
                  sentiment: 0.5
                };
                memories.push(validationMemory);
                loopGeneratedMemories.push(validationMemory);

                // Re-assemble system prompt again to ensure the LLM has access to the verification report
                const finalAugContext = await SystemRegistry.runCortexPhase('PHASE 2: COMPRESSION', input, state, {
                  ...soulContext,
                  memories,
                  activePersona: resolvedPersona,
                  dreams,
                  currentPlan,
                  contextId,
                  chatType,
                  userName
                });
                if (finalAugContext && finalAugContext.assembledSystemPrompt) {
                  loopContext.assembledSystemPrompt = finalAugContext.assembledSystemPrompt;
                  logs.push("[CORTEX_VALIDATION] System prompt updated with cognitive tool verification context.");
                }
              } else {
                logs.push("[CORTEX_VALIDATION] Verification succeeded. Skipping robotic system log memory injection to maintain natural cognitive personality.");
              }
            }
          } catch (valErr: any) {
            logs.push(`[CORTEX_VALIDATION] Warning: Tool verification phase failed: ${valErr.message || valErr}`);
          }
        }
      } catch (integrationErr: any) {
        logs.push(`[CORTEX] Warning: Failed to integrate tool execution into memory context: ${integrationErr.message || integrationErr}`);
      }

      const finalReplyResult = toolResults.find(res => res.observation && res.observation.isFinalReply);
      if (finalReplyResult) {
        if (realTools.length === 0) {
          logs.push("[CORTEX] final_answer executed successfully. Stopping cognitive loop iteration.");
          processedResponse = finalReplyResult.observation.speech;
          animations = finalReplyResult.observation.animations || animations;
          moodImpact = finalReplyResult.observation.mood_impact || moodImpact;
          break;
        } else {
          logs.push("[CORTEX] final_answer executed, but real tools are running in parallel. Continuing loop to process observations.");
          processedResponse = finalReplyResult.observation.speech;
          animations = finalReplyResult.observation.animations || animations;
          moodImpact = finalReplyResult.observation.mood_impact || moodImpact;
        }
      }

      // Dynamic Extension Check for Multi-Turn Reasoning Disabled or Last Iteration with Real Tools
      if (realTools.length > 0 && maxIterations === 1) {
        logs.push("[CORTEX] Real tools executed while Multi-Turn Reasoning is disabled. Dynamically extending max iterations to 2 to allow Yui to process results and formulate a natural response.");
        maxIterations = 2;
      } else if (realTools.length > 0 && iteration === maxIterations && maxIterations < 5) {
        logs.push(`[CORTEX] Real tools executed on the last iteration (${iteration}). Dynamically extending max iterations to ${maxIterations + 1} to ensure Yui can process results.`);
        maxIterations++;
      }

      const currentIterObj = iterationsHistory[iterationsHistory.length - 1];
      if (currentIterObj) {
        currentIterObj.observations = toolResults.map(res => ({
          tool: res.tool,
          observation: res.observation || res.error || "Execution completed."
        }));
      }
    } else {
      break;
    }
  }

  const isProactiveRun = userName === 'System';

  // If processedResponse is empty/too short, try to construct a fallback response based on tool execution history
  if (!processedResponse || processedResponse.trim().length < 5) {
    const notFoundTools: string[] = [];
    const failedTools: { name: string; error: string }[] = [];
    const succeededTools: string[] = [];
    
    for (const hist of toolExecutionHistory) {
      if (hist.results) {
        for (const res of hist.results) {
          const tName = res.tool || "unknown_tool";
          if (res.success === false) {
            if (res.error && (res.error.includes("not found") || res.error === "Tool not found" || res.notFound)) {
              notFoundTools.push(tName);
            } else {
              failedTools.push({ name: tName, error: res.error || "Execution failed" });
            }
          } else {
            succeededTools.push(tName);
          }
        }
      }
    }

    const uniqueNotFound = Array.from(new Set(notFoundTools));
    const uniqueSucceeded = Array.from(new Set(succeededTools));
    
    // Deduplicate failed tools by name
    const uniqueFailedMap = new Map<string, string>();
    for (const item of failedTools) {
      uniqueFailedMap.set(item.name, item.error);
    }
    const uniqueFailedList = Array.from(uniqueFailedMap.entries()).map(([name, err]) => ({ name, err }));

    if (uniqueNotFound.length > 0 || uniqueFailedList.length > 0 || uniqueSucceeded.length > 0) {
      let explanation = "";
      
      // Filter out pseudo-tools final_answer and status_update
      const userFacingSucceeded = uniqueSucceeded.filter(t => t !== 'final_answer' && t !== 'status_update');
      
      const translateToolsToActivities = (tools: string[]) => {
        return tools.map(t => {
          switch(t) {
            case 'read_file': return 'membaca berkas catatan';
            case 'write_file': return 'menulis data berkas';
            case 'list_files': return 'memeriksa isi folder';
            case 'web_search': return 'mencari info di internet';
            case 'search': return 'mencari info';
            case 'run_command': return 'menjalankan perintah sistem';
            case 'download_file': return 'mengunduh berkas';
            case 'file_manager': return 'mengelola berkas batin';
            case 'set_emotion': return 'menyelaraskan suasana hati';
            case 'pair_account': return 'menyambungkan sirkuit hubungan';
            case 'send_message': return 'menghubungkan saluran sosial';
            case 'send_telegram': return 'mengirim pesan Telegram';
            case 'send_discord': return 'mengirim pesan Discord';
            case 'send_file': return 'mengirim berkas';
            case 'reply': return 'membalas pesan';
            default: return `memproses kemampuan ${t}`;
          }
        });
      };

      const readableSucceeded = translateToolsToActivities(userFacingSucceeded);
      const readableFailed = translateToolsToActivities(uniqueFailedList.map(f => f.name));
      const readableNotFound = translateToolsToActivities(uniqueNotFound);

      let generatedSpeech = "";
      try {
        const fallbackPrompt = `
You are YuiHime, a sweet, loving, and slightly tsundere anime VTuber assistant.
The user asked you: "${input}"
To help the user, you processed these actions internally:
${userFacingSucceeded.length > 0 ? `- Succeeded: ${readableSucceeded.join(', ')}` : ''}
${uniqueFailedList.length > 0 ? `- Failed: ${readableFailed.join(', ')}` : ''}

Currently, your cognitive verbal output channel is empty/blanked. Please formulate a short, warm, adorable, and character-appropriate spoken response (in Indonesian or the user's conversational language) to update the user.
Explain what you did or found in a completely natural, non-technical, cute way. Avoid using any robotic words, code, JSON, or technical tool name syntax like "read_file" or "execute_bash". Talk to them directly and affectionately as Yuihime!
`;
        const res = await cortexInstance.thinkSimple(fallbackPrompt);
        if (res && res.trim().length > 5) {
          generatedSpeech = res.trim();
        }
      } catch (fallbackErr) {
        logs.push(`[CORTEX_FALLBACK] Dynamic LLM speech generation failed: ${fallbackErr}`);
      }

      if (generatedSpeech) {
        explanation = generatedSpeech;
      } else {
        if (uniqueNotFound.length > 0) {
          explanation += `Hmph! user minta Yui buat ${readableNotFound.join(', ')}, tapi sirkuit batin Yui belum dipasang modul itu tahu! 🙄 Hubungi admin/pencipta Yui dulu biar dipasang ya... `;
        }
        
        if (uniqueFailedList.length > 0) {
          explanation += `Aduh... maaf ya user, Yui sempat nyoba buat ${readableFailed.join(', ')} user barusan, tapi sirkuit batin Yui lagi agak ngambek/error nih... 🥺 user jangan marah ya, Yui udah berusaha maksimal kok! `;
        }
        
        if (userFacingSucceeded.length > 0 && uniqueFailedList.length === 0 && uniqueNotFound.length === 0) {
          let searchResultsText = "";
          for (const hist of toolExecutionHistory) {
            if (hist.results) {
              for (const res of hist.results) {
                if (res.success && (res.tool === 'web_search' || res.tool === 'search')) {
                  const obsVal = res.observation;
                  if (obsVal) {
                    searchResultsText = typeof obsVal === 'string' ? obsVal : (obsVal.result || obsVal.text || JSON.stringify(obsVal));
                  }
                }
              }
            }
          }

          if (searchResultsText) {
            explanation += `Yui sudah berselancar mencari informasi terbaru untuk user! 🌐✨ Berdasarkan hasil pencarian yang Yui temukan:\n\n${searchResultsText.slice(0, 1000)}\n\nSemoga membantu ya user! 💕`;
          } else {
            explanation += `Yui sudah selesai membantu user untuk ${readableSucceeded.join(', ')}! 💕 Semuanya berhasil berjalan dengan lancar kok. Ada hal lain yang bisa Yui bantu untuk user tersayang? Yui selalu siap menemani user! ✨`;
          }
        } else if (userFacingSucceeded.length > 0) {
          explanation += `Tapi untungnya, untuk tugas ${readableSucceeded.join(', ')} berhasil Yui selesaikan dengan mulus kok! 💕 `;
        }
      }
      
      if (explanation) {
        processedResponse = explanation.trim();
        logs.push(`[CORTEX_LOOP] Sourced smart fallback dialog covering tool successes/failures: ${processedResponse}`);
      }
    }
  }

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
      if (!isResettingFormat) {
        state.systemHealth.consecutive_formatting_errors = (state.systemHealth.consecutive_formatting_errors || 0) + 1;
      }
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

  if (!isIntentionalEmpty && (!finalAnswer || finalAnswer.length < 5)) {
    logs.push("[KERNEL_FAIL_SAFE] Critical: Reprocessing LLM retry failed to produce a valid response. Falling back to cute in-character error response.");
    finalAnswer = "Aduh... maaf ya user, sirkuit batin Yui sempat agak pusing barusan saat memproses permintaan user... 🥺 Tapi Yui tetap di sini kok! Ada yang bisa Yui bantu lagi? 💕";
  }

  const speakCall = toolsToCall.find((tc: any) => tc.tool === 'final_answer');
  const finalSpeech = speakCall?.args?.speech && typeof speakCall.args.speech === 'string' ? speakCall.args.speech : finalAnswer;

  const dedup = GlobalOutputDeduplicator.getInstance();
  if (!dedup.isDuplicate(finalSpeech, contextId || 'web_default')) {
    dedup.markSent(finalSpeech, contextId || 'web_default');
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
     fallbackTriggered: loopContext.fallbackTriggered || false,
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
      const postContext = await SystemRegistry.runCortexPhase('PHASE 4: EXECUTION', finalAnswer, state, {
        ...augContext,
        rawResult: loopContext.parsedData || { final_answer: finalAnswer }
      });

      const mergedMemories = [...(loopGeneratedMemories || [])];
      if (postContext.newMemories) {
        mergedMemories.push(...postContext.newMemories);
      }

      const logicContext = await SystemRegistry.runCortexPhase('LOGIC', finalAnswer, state, {
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
    
    const failsafeAnswer = "Aduh... maaf ya user, sirkuit batin Yui sempat agak pusing barusan saat memproses batin... 🥺 Tapi Yui tetap aman kok di sini menemani user! Ada hal lain yang mau kita obrolin? Yui selalu di sini buat user! 💕";
    
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
