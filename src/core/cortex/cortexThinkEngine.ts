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
import { stripCodeFences, isolateBraceBlock, liftNestedProperties } from './jsonRepairer';
import { FastTrackRunner } from './fastTrackRunner';
import { extractBestJsonObject, extractJsonObject } from './jsonExtract';
import { makeToolCall } from './cortexThinkEngineUtils';
import { DEFAULT_NEURAL_CORES } from '@shared/constants';
import { broadcastToWS } from '../server/apiRouter.js';
import { GlobalOutputDeduplicator } from '../kernel/GlobalOutputDeduplicator.js';
import { DynamicToolSynthesizer } from './dynamicToolSynthesizer.js';
import { LlmIoAuditor } from '../server/llmAuditor.js';
import { BackgroundToolDispatcher } from '../kernel/BackgroundToolDispatcher.js';
import { genId } from '@shared/core/idGen';

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
        loopInput = input + `\n\n[SYSTEM_OBSERVATION]: Tool execution results from the previous step:\n${JSON.stringify(lastExecuted.results)}`;
      }
    }

    const loopSettings = {
      ...settings,
      [settings.provider]: {
        ...(settings[settings.provider] || {}),
        isJson: true
      }
    };

    const activeProviderId = settings.provider || 'gemini';
    const providerSpecificConfig = settings[activeProviderId] || {};
    const targetModelId = toSingleString(providerSpecificConfig.model) || 'gemini-3.5-flash';

    let activeIterationInput = loopInput;
    if (iteration === 1) {
      activeIterationInput += "\n\n[CRITICAL PRE-PROCESSING DIRECTIVE (FIRST PASS)]: You are strictly prohibited from writing conversational/speech text if you are calling tools. If you populate the \"tool_calls\" array with tool calls (e.g., search_web, read_url, bash, etc.), you MUST keep the \"speech\" field entirely empty (\"\") in this iteration! Your conversational response will be formulated in the subsequent pass once tools have executed. Only if you are not calling any tools should you output speech. Output valid JSON matching the schema.";
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
        type: 'json_object'
      }
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
    }
    logs.push(`[CORTEX_LOOP] Iteration ${iteration} Gateway routed via: ${loopContext.activeProvider || 'unknown'}`);

    const rawResultStr = (loopContext.rawResult || "").trim();
    const validation = ValidationMiddleware.validate(rawResultStr);
    if (!validation.success) {
      logs.push(`[CORTEX_LOOP] [SCHEMA_ERROR] Output failed strict validation: ${validation.errors.join(' | ')}`);
    }

    let parsedPayload: any = null;
    let parseError: string | null = null;

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

          if (!parsedPayload && rawResultStr.trim().length > 0) {
             parsedPayload = {
                thought: "Menerima respons polos non-JSON dari provider neural secara langsung demi menjaga kontinuitas obrolan.",
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
      loopContext.processedResponse = rawResultStr;
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
              if (toolNames.includes("websearch") || toolNames.includes("search")) {
                indonesianStatus = "Yui sedang berselancar mencari informasi terbaru untuk user... 🌐✨";
              } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
                indonesianStatus = "Yui sedang menelusuri data dalam pangkalan batin batin... 🗄️🔍";
              } else if (toolNames.includes("bash")) {
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
        if (toolNames.includes("websearch") || toolNames.includes("search")) {
          indonesianStatus = "Yui sedang berselancar mencari informasi terbaru untuk user... 🌐✨";
        } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
          indonesianStatus = "Yui sedang menelusuri data dalam pangkalan batin batin... 🗄️🔍";
        } else if (toolNames.includes("bash")) {
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
        const toolCallMemoryId = `tool_call_${Date.now()}_${genId(5)}`;
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
