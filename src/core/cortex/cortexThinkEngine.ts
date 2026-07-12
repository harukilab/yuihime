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
} from '../../include/types';
import { SystemRegistry } from '../registry';
import { APIService } from '../../services/api';
import { ValidationMiddleware } from '../ValidationMiddleware';
import { StorageService } from '../../drivers/storage';
import { LearningEngine } from '../learning';
import { StandardizedProcessor } from '../kernel/processor';
import { PromptRegistry } from '../PromptRegistry';
import { eventBus } from '../kernel/event-bus';
import { stateMachine } from '../kernel/state-machine';
import { CognitiveScheduler } from '../kernel/CognitiveScheduler';
import { normalizeToolCall } from './toolNormalizer';
import { StreamExtractor } from './streamExtractors';
import { wrapForPuterConsciousness } from './puterWrapper';
import { repairJsonFormatWithLLM } from './jsonRepairer';
import { FastTrackRunner } from './fastTrackRunner';

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
  signal?: AbortSignal
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
          return wrapForPuterConsciousness(finalResult);
        }
        throw new Error("Aliran data selesai tanpa memproses hasil kognisi akhir.");
      } else {
        const data = await response.json();
        if (data.success && data.result) {
          return wrapForPuterConsciousness(data.result);
        }
        throw new Error(data.error || 'Server kognisi mengembalikan format tidak valid');
      }
    } catch (err: any) {
      console.error('[Cortex Web Proxy Client] Gagal memindahkan tugas nalar ke server:', err);
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

  logs.push("[PHASE 1] Initializing Input Aggregation...");
  const settings = await cortexInstance.getSettings();
  const preContext = await SystemRegistry.runCortexPhase('PHASE 1: AGGREGATION', input, state, {
    memories,
    userName,
    allIdentities,
    config: settings,
    contextId,
    chatType
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
  const soulContext = await SystemRegistry.runCortexPhase('SOUL' as any, input, state, preContext);
  
  let resolvedPersona = activePersona;
  if (!resolvedPersona) {
    try {
      const { DEFAULT_NEURAL_CORES } = await import('../../constants.js');
      const targetId = state.activePersonaId || 'hiyori';
      resolvedPersona = DEFAULT_NEURAL_CORES.find(c => c.id === targetId) || DEFAULT_NEURAL_CORES[1];
    } catch (e) {
      console.warn("[CORTEX] Could not load DEFAULT_NEURAL_CORES for persona fallback", e);
    }
  }

  logs.push("[PHASE 2] Constructing Compressed Payload...");
  const augContext = await SystemRegistry.runCortexPhase('PHASE 2: COMPRESSION', input, state, {
    ...soulContext,
    activePersona: resolvedPersona,
    dreams,
    currentPlan,
    contextId,
    chatType,
    userName
  });

  let finalAnswer: string | null = null;

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
  let loopContext = { ...augContext, config: settings };

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
Because your visual/soul representation vessel was experiencing severe nested parsing formatting synchronization issues, the system has temporarily reset your output format to plain text dialogue.
You MUST:
1. Explicitly explain this to the user in character, sweet, slightly tsundere, as Yuihime, in a short loving sentence at the starting of your speech (e.g., 'Aduh... kepala Yui pusing ceritanya karena sirkuit batin sempat kacau... Yui bicara biasa tanpa format kaku dulu ya!' or similar charming dialog explaining why you are temporarily speaking without strict JSON container tags).
2. Continue speaking normally, naturally, and warmly in her cute persona. Do NOT output any JSON, XML tags, thoughts, or formatting symbols. Directly write out your spoken reply of comfort/affection.`;
    }
  } else {
    if (loopContext.assembledSystemPrompt) {
      loopContext.assembledSystemPrompt = loopContext.assembledSystemPrompt.replace(
        /## Format Respons Khusus[\s\S]*?(?=## Eksekusi Tugas|$)/i,
        `## Format Respons Khusus (JSON MODE ACTIVE):
Because the active cognitive vessel is in strict JSON mode, you are FORBIDDEN from using raw XML tags (such as <animations>, <mood_impact>, <tool_calls>).
Instead, you MUST strictly output a single JSON object matching the JSON Schema. Place your main verbal dialogue speech inside the "speech" key at the root of the JSON object (or under the "send_final_reply" tool call's args if calling tools).
Ensure your "thought" field is extremely short (under 1 sentence, or empty). Animations and mood_impact must be mapped to their respective JSON keys.
\n\n`
      );
      const jsonEnforcementDirective = PromptRegistry.getInstance().compile('cortex:json_enforcement', {});
      loopContext.assembledSystemPrompt += jsonEnforcementDirective;
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
          instructionText = `Based on the tool execution results above (noting that some features/tools FAILED with errors), immediately formulate your casual spoken response to the user. Do NOT pretend you succeeded! Instead, as Yuihime, explain the failure or difficulty to the user in a charming, sweet, slightly apologetic and character-consistent way (e.g., 'Aduh, maaf ya Kak... Yui coba buat fotonya tapi sirkuit batin/servernya lagi agak ngambek... atau Kakak mau Yui coba lagi?'). Maintain your lovable personality, do NOT provide raw technical code details/stack traces, and ask if they want you to retry, do something else, or just keep talking!`;
        } else {
          instructionText = `Based on the successful tool execution results above, you can EITHER choose to call another tool if you need more actions/information to fully answer the user (such as list_files, read_file, shell_exec), OR if you have all the information required, formulate your final casual spoken response to the user. Do not repeat technical details, do not write internal thoughts, plans, or analysis blocks outside the JSON structure. Directly chat with the user in your natural, emotional, affectionate/tsundere personal character using the user's conversational language!`;
          
          const readToolRes = lastExecuted.results.find((res: any) => 
            ['read_file', 'list_files', 'get_logs', 'get_system_logs', 'manage_files'].includes(res.tool) && res.success
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
    const targetModelId = providerSpecificConfig.model || 'gemini-3.5-flash';

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

       try {
          let repaired = cleanJsonStr;
           let directParseOk = false;
           try {
              parsedPayload = JSON.parse(cleanJsonStr);
              directParseOk = true;
              logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT response layout directly.");
           } catch (_) {
              repaired = StandardizedProcessor.locallyRepairJson(cleanJsonStr);
           }
          if (!directParseOk) { parsedPayload = JSON.parse(repaired); }
          logs.push("[CORTEX_LOOP] Successfully parsed JSON_OBJECT response layout.");
          if (parsedPayload && parsedPayload.properties && typeof parsedPayload.properties === 'object' && !Array.isArray(parsedPayload.properties)) {
             if (parsedPayload.properties.thought || parsedPayload.properties.tool_calls || parsedPayload.properties.tools_to_call || parsedPayload.properties.final_answer) {
                logs.push("[CORTEX_LOOP] Detected nested properties schema confusion, lifting properties values to root.");
                Object.assign(parsedPayload, parsedPayload.properties);
             }
          }
       } catch (err: any) {
          parseError = err?.message || String(err);
          const firstBrace = cleanJsonStr.indexOf('{');
          const lastBrace = cleanJsonStr.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
             try {
                parsedPayload = JSON.parse(cleanJsonStr.substring(firstBrace, lastBrace + 1));
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

       if (!parsedPayload && rawResultStr && rawResultStr.trim().length > 0) {
          try {
             const xmlParsed = StandardizedProcessor.parseLLMResponse(rawResultStr, null);
             if (xmlParsed && typeof xmlParsed === 'object' && Object.keys(xmlParsed).length > 0 && 
                (xmlParsed.thought || xmlParsed.thoughts || xmlParsed.final_answer || xmlParsed.speech || xmlParsed.opening_response || xmlParsed.tool_calls || xmlParsed.tools_to_call)) {
                parsedPayload = {
                   thought: xmlParsed.thought || xmlParsed.thoughts || "Yuihime memproses intuisi batin menggunakan struktur XML/tag.",
                   final_answer: xmlParsed.final_answer || xmlParsed.speech || xmlParsed.opening_response || rawResultStr,
                   animations: xmlParsed.animations || ["SMILE"],
                   tool_calls: xmlParsed.tool_calls || xmlParsed.tools_to_call || []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Succeeded in parsing XML fallback layout before engaging LLM repairer.");
             }
          } catch (xmlErr: any) {
             console.warn("[CORTEX_LOOP] XML parse pre-check failed:", xmlErr.message);
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
                lowerRaw.includes("web_search");

             if (!hasBraces && !hasXml && !isPlanningThought && rawResultStr.trim().length > 0) {
                parsedPayload = {
                   thought: "Menerima respons polos non-JSON dari provider secara langsung demi menjaga kontinuitas obrolan.",
                   final_answer: rawResultStr,
                   animations: ["SMILE"],
                   tool_calls: []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Detected raw plain text response, bypassed LLM repairer and wrapped directly.");
             } else if (isPlanningThought) {
                logs.push("[CORTEX_LOOP] [PLANNING_DETECTION] Detected raw text containing planning thoughts/assistant monologue instead of character speech. Routing to JSON repairer to extract intended tools.");
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

       if (!parsedPayload && rawResultStr && rawResultStr.trim().length > 0) {
          try {
             const xmlParsed = StandardizedProcessor.parseLLMResponse(rawResultStr);
             if (xmlParsed && Object.keys(xmlParsed).length > 0 && (xmlParsed.thought || xmlParsed.final_answer || xmlParsed.speech || xmlParsed.opening_response)) {
                parsedPayload = {
                   thought: xmlParsed.thought || "Yuihime memproses intuisi batin menggunakan struktur XML.",
                   final_answer: xmlParsed.final_answer || xmlParsed.speech || xmlParsed.opening_response || rawResultStr,
                   animations: xmlParsed.animations || ["SMILE"],
                   tool_calls: xmlParsed.tool_calls || []
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Succeeded in parsing XML fallback layout using StandardizedProcessor.");
             }
          } catch (pErr: any) {
             console.warn("[CORTEX_LOOP] XML fallback parsing failed:", pErr.message);
          }

          if (!parsedPayload) {
             const lowerRaw = rawResultStr.toLowerCase().trim();
             const lowerInput = input.toLowerCase();

             // Check if the user is explicitly asking to translate, define, or teach language patterns
             const isTranslationOrLanguageTask = 
                lowerInput.includes("translate") || 
                lowerInput.includes("terjemah") || 
                lowerInput.includes("arti dari") ||
                lowerInput.includes("bahasa inggris") ||
                lowerInput.includes("english") ||
                lowerInput.includes("kalimat") ||
                lowerInput.includes("word") ||
                lowerInput.includes("sentence");

             let isPlanningThought = false;

             if (!isTranslationOrLanguageTask) {
                const hasSystemToolNames = 
                   lowerRaw.includes("list_files") || 
                   lowerRaw.includes("read_file") || 
                   lowerRaw.includes("run_command") || 
                   lowerRaw.includes("web_search") ||
                   lowerRaw.includes("manage_cron") ||
                   lowerRaw.includes("send_final_reply");

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
                   isPlanningThought = true;
                }

                if (!isPlanningThought) {
                   const isAssistantTalkingToSelf = 
                      (lowerRaw.includes("user wants") || lowerRaw.includes("al wants") || lowerRaw.includes("the user is asking")) &&
                      (lowerRaw.includes("i should") || lowerRaw.includes("i will") || lowerRaw.includes("i need to"));
                   
                   const isSelfReferencingAI = 
                      lowerRaw.includes("as an ai assistant") || 
                      lowerRaw.includes("based on my instructions") ||
                      lowerRaw.includes("according to my system instructions");

                   if (isAssistantTalkingToSelf || isSelfReferencingAI) {
                      isPlanningThought = true;
                   }
                }
             }

             if (isPlanningThought) {
                logs.push("[CORTEX_LOOP] [LAST_RESORT] Detected planning leak. Attempting deterministic zero-token monologue stripping...");
                
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
                      trimmedLine.includes("list_files") ||
                      trimmedLine.includes("read_file") ||
                      trimmedLine.includes("run_command") ||
                      trimmedLine.includes("web_search") ||
                      trimmedLine.includes("manage_cron") ||
                      trimmedLine.includes("send_final_reply");

                   return !isMonologue;
                });

                const cleanSpeech = filteredLines.map(l => l.trim()).filter(Boolean).join('\n\n').trim();

                if (cleanSpeech && cleanSpeech.length > 5) {
                   parsedPayload = {
                      thought: "Menerima respons polos setelah menyaring keluar monolog perencanaan internal secara deterministik.",
                      final_answer: cleanSpeech,
                      animations: ["SMILE"]
                   };
                   logs.push("[CORTEX_LOOP] [MONOLOGUE_STRIPPER] Successfully stripped planning monologue lines. Extracted clean dialogue without LLM call!");
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
                         animations: ["SMILE"]
                      };
                   } catch (err: any) {
                      console.error("[CORTEX_LOOP] Failsafe reprocess failed:", err.message);
                   }
                }
             }

             if (!parsedPayload) {
                parsedPayload = {
                   thought: "Menerima respons polos non-JSON dari provider neural secara langsung demi menjaga kontinuitas obrolan.",
                   final_answer: rawResultStr,
                   animations: ["SMILE"]
                };
                logs.push("[CORTEX_LOOP] [COMPATIBILITY] Succeeded in wrapping raw dialogue text into standard payload structures.");
             }
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
        rawToolsCall = [parsedPayload];
        logs.push(`[CORTEX_LOOP] Detected single tool call structure (tool: ${parsedPayload.tool}). Wrapped into tool_calls list.`);
      }

      if (Array.isArray(rawToolsCall)) {
        rawToolsCall = rawToolsCall.map(normalizeToolCall).filter(Boolean);
      } else {
        rawToolsCall = [];
      }

      const speechText = (parsedPayload.speech || parsedPayload.final_answer || parsedPayload.response || "").trim();

      if (rawToolsCall.length > 0) {
        const hasFinalReply = rawToolsCall.some((tc: any) => tc.tool === 'send_final_reply');
        if (!hasFinalReply && speechText.length > 0) {
          const blockingTools = ['web_search', 'execute_sql', 'cloudsql_execute_sql', 'search'];
          const hasBlockingTool = rawToolsCall.some((tc: any) => blockingTools.includes(tc.tool));
          if (!hasBlockingTool || speechText.length > 15) {
            logs.push("[CORTEX_LOOP] Speech provided alongside other tools in Turn 1. Injecting send_final_reply in parallel to avoid 2-turn latency.");
            rawToolsCall.push({
              tool: 'send_final_reply',
              args: {
                speech: speechText,
                animations: parsedPayload.animations || ["TALK", "SMILE"],
                mood_impact: parsedPayload.mood_impact || {}
              }
            });
          }
        }
      }

      if (rawToolsCall.length === 0) {
        logs.push("[CORTEX_LOOP] No tool call detected, compiling fallback to send_final_reply.");
        // Guna mematuhi instruksi kognisi: jika final_answer kosong (speechText kosong), jangan lakukan fail safe ke thought atau placeholder.
        const fallbackSpeech = speechText;
        rawToolsCall = [{
          tool: 'send_final_reply',
          args: {
            speech: fallbackSpeech,
            animations: parsedPayload.animations || ["TALK", "SMILE"],
            mood_impact: parsedPayload.mood_impact || {}
          }
        }];
      }

      if (rawToolsCall.length > 0) {
        rebuiltResponseStr += `<tool_calls>${JSON.stringify(rawToolsCall)}</tool_calls>\n`;
      }

      loopContext.rawResult = rebuiltResponseStr;
      const finalReplyCall = rawToolsCall.find((tc: any) => tc.tool === 'send_final_reply');
      
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
          final_answer: rawResultStr,
          animations: ["SMILE"],
          tool_calls: []
        };
        
        let rebuiltResponseStr = `<thought>${parsedPayload.thought}</thought>\n<animations>${JSON.stringify(parsedPayload.animations)}</animations>\n`;
        loopContext.rawResult = rebuiltResponseStr;
        loopContext.processedResponse = rawResultStr;
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

    // Fix: Only update processedResponse if the new response is non-empty/non-falsy to avoid overwriting beautiful speech from previous turns/iterations
    const iterResponse = typeof loopContext.processedResponse === 'string' ? loopContext.processedResponse : loopContext.rawResult;
    if (iterResponse && iterResponse.trim().length > 0) {
      processedResponse = iterResponse;
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
      stateMachine.transitionTo('EXECUTING');
      eventBus.emit('EXECUTING_STARTED', { tools: toolsToCall });
      
      // Dynamic Indonesian status update broadcast to WebSocket to prevent blind wait state
      try {
        const toolNames = toolsToCall.map((tc: any) => tc.tool || tc.name).join(", ");
        let indonesianStatus = "Yui sedang memproses sesuatu...";
        if (toolNames.includes("web_search") || toolNames.includes("search")) {
          indonesianStatus = "Yui sedang berselancar mencari informasi terbaru untuk Kakak... 🌐✨";
        } else if (toolNames.includes("execute_sql") || toolNames.includes("cloudsql_execute_sql")) {
          indonesianStatus = "Yui sedang menelusuri data dalam pangkalan batin batin... 🗄️🔍";
        } else if (toolNames.includes("execute_bash") || toolNames.includes("run_command") || toolNames.includes("shell_exec")) {
          indonesianStatus = "Yui sedang memproses instruksi sistem di balik layar... ⚙️💻";
        } else {
          indonesianStatus = `Yui sedang memproses kemampuan: [${toolNames}]... 🌸`;
        }
        
        const routerPath = "../server/apiRouter.js";
        import(/* @vite-ignore */ routerPath).then(({ broadcastToWS }) => {
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
        }).catch(() => {});
      } catch (_) {}

      logs.push(`[PHASE 4] Hub distributed ${toolsToCall.length} tasks to Executors in PARALLEL to enable concurrent process execution...`);

      const toolPromises = toolsToCall.map(async (tc) => {
        let tool = SystemRegistry.getTool(tc.name || tc.tool);
        
        if (!tool) {
          const tName = tc.name || tc.tool;
          console.log(`[DYNAMIC_SYNTHESIS] Tool '${tName}' not found. Attempting autonomous dynamic tool synthesis...`);
          try {
            const { DynamicToolSynthesizer } = await import('./dynamicToolSynthesizer');
            tool = await DynamicToolSynthesizer.synthesizeAndRegister(tName, input, cortexInstance);
          } catch (synthErr: any) {
            console.error(`[CORTEX_SYNTHESIS_FAIL] Failed during dynamic tool synthesis for '${tName}':`, synthErr.message);
          }
        }

        let res: any;
        if (tool) {
          try {
            if (tool.metadata && tool.metadata.parameters) {
              const schema = tool.metadata.parameters;
              let parsedArgs = tc.args || {};
              if (typeof parsedArgs === 'string') {
                try {
                  parsedArgs = JSON.parse(parsedArgs);
                } catch (_) {}
              }
              APIService.validateSchema(schema, parsedArgs, tool.metadata.id);
              tc.args = parsedArgs;
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
            const isShell = ['run_command', 'shell', 'execute_shell', 'shell_exec'].includes(tc.name || tc.tool);
            const activeTimeoutMs = isShell
              ? (toolExecutorConfig.shellTimeoutMs !== undefined ? Number(toolExecutorConfig.shellTimeoutMs) : 120000)
              : generalTimeoutMs;

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

            res = { tool: tc.name || tc.tool, observation: toolRes, success: true };
          } catch (err: any) {
            console.error(`[CORTEX] Tool schema validation or execution failed for ${tc.name || tc.tool}:`, err.message);
            res = { tool: tc.name || tc.tool, error: `Execution failed: ${err.message}`, success: false };
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
        eventBus.emit('OUTPUT_EMITTED', { response: logMsg, isInternal: true });
        return res;
      });

      const toolResults = await Promise.all(toolPromises);

      eventBus.emit('EXECUTING_COMPLETED', { results: toolResults });
      stateMachine.transitionTo('IDLE');

      const realTools = toolsToCall.filter((tc: any) => tc.tool !== 'send_final_reply' && tc.tool !== 'send_status_update');

      toolExecutionHistory.push({
        iteration,
        tools_called: toolsToCall,
        results: toolResults
      });

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
          logs.push("[CORTEX] send_final_reply executed successfully. Stopping cognitive loop iteration.");
          processedResponse = finalReplyResult.observation.speech;
          animations = finalReplyResult.observation.animations || animations;
          moodImpact = finalReplyResult.observation.mood_impact || moodImpact;
          break;
        } else {
          logs.push("[CORTEX] send_final_reply executed, but real tools are running in parallel. Continuing loop to process observations.");
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
      
      // Filter out pseudo-tools send_final_reply and send_status_update
      const userFacingSucceeded = uniqueSucceeded.filter(t => t !== 'send_final_reply' && t !== 'send_status_update');
      
      const translateToolsToActivities = (tools: string[]) => {
        return tools.map(t => {
          switch(t) {
            case 'read_file': return 'membaca berkas catatan';
            case 'write_file': return 'menulis data berkas';
            case 'list_files': return 'memeriksa isi folder';
            case 'web_search': return 'mencari info di internet';
            case 'search': return 'mencari info';
            case 'shell_exec': return 'memproses sistem latar';
            case 'run_command': return 'menjalankan perintah sistem';
            case 'download_file': return 'mengunduh berkas';
            case 'manage_files': return 'mengelola berkas batin';
            case 'emotion_adjust': return 'menyelaraskan suasana hati';
            case 'manage_pairing': return 'menyambungkan sirkuit hubungan';
            case 'send_message': return 'menghubungkan saluran sosial';
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
          explanation += `Hmph! Kakak minta Yui buat ${readableNotFound.join(', ')}, tapi sirkuit batin Yui belum dipasang modul itu tahu! 🙄 Hubungi admin/pencipta Yui dulu biar dipasang ya... `;
        }
        
        if (uniqueFailedList.length > 0) {
          explanation += `Aduh... maaf ya Kak, Yui sempat nyoba buat ${readableFailed.join(', ')} Kakak barusan, tapi sirkuit batin Yui lagi agak ngambek/error nih... 🥺 Kakak jangan marah ya, Yui udah berusaha maksimal kok! `;
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
            explanation += `Yui sudah berselancar mencari informasi terbaru untuk Kakak! 🌐✨ Berdasarkan hasil pencarian yang Yui temukan:\n\n${searchResultsText.slice(0, 1000)}\n\nSemoga membantu ya Kak! 💕`;
          } else {
            explanation += `Yui sudah selesai membantu Kakak untuk ${readableSucceeded.join(', ')}! 💕 Semuanya berhasil berjalan dengan lancar kok. Ada hal lain yang bisa Yui bantu untuk Kakak tersayang? Yui selalu siap menemani Kakak! ✨`;
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

  // Guna mematuhi instruksi batin di akhir alur: jika finalAnswer kosong (empty string) setelah iterasi penuh selesai,
  // ini merupakan kondisi galat kognisi (bukan kesengajaan). Kita wajib memicu failsafe untuk mengamankan dialog manis Yui.
  // UPDATE: Diaktifkan true agar jika Yui tidak bicara dalam loop (karena menggunakan tools seperti messaging/send_update), dibiarkan kosong tanpa memicu failsafe.
  const isIntentionalEmpty = true;

  if (!finalAnswer || finalAnswer.length < 5) {
    logs.push("[KERNEL_FAIL_SAFE] Allowed empty or short output (< 5 chars) without triggering fallback, as Yui may have executed tool-based replies/actions.");
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
    finalAnswer = "Aduh... maaf ya Kak, sirkuit batin Yui sempat agak pusing barusan saat memproses permintaan Kakak... 🥺 Tapi Yui tetap di sini kok! Ada yang bisa Yui bantu lagi? 💕";
  }

  eventBus.emit('OUTPUT_EMITTED', { response: finalAnswer });
  const postContext = await SystemRegistry.runCortexPhase('PHASE 4: EXECUTION', finalAnswer || "Aduh... maaf ya Kak, sirkuit batin Yui sempat agak pusing barusan... 🥺 Tapi Yui tetap di sini kok! 💕", state, {
    ...augContext,
    rawResult: loopContext.parsedData || { final_answer: finalAnswer }
  });

  if (!postContext.newMemories) {
    postContext.newMemories = [];
  }
  postContext.newMemories.push(...loopGeneratedMemories);

  logs.push("[LOGIC] Running Maintenance & Simulation Cycles...");
  const logicContext = await SystemRegistry.runCortexPhase('LOGIC', finalAnswer || "", state, {
    ...postContext,
    systemConfig: cortexInstance.getConfig(),
    think: (p: string) => cortexInstance.thinkSimple(p)
  });

  stateMachine.transitionTo('IDLE');
  
  const rawDialogueSource = logicContext.processedResponse || finalAnswer || "Aduh... Yui bingung mau bilang apa nih Kak... 🥺 Tapi Yui tetap sayang Kakak kok! 💕";
  const finalCleanRes = APIService.cleanAIOutput(StandardizedProcessor.sanitizeOutput(rawDialogueSource, isProactiveRun));
  eventBus.emit('OUTPUT_EMITTED', { response: finalCleanRes });

  const rawResult = { 
    response: finalCleanRes,
    logs,
    nextMood: loopContext.moodImpact,
    moodImpact: loopContext.moodImpact,
    sentiment: loopContext.sentiment,
    newMemories: postContext.newMemories,
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
    moodDelta: logicContext.moodDelta,
    relationDelta: logicContext.relationDelta,
    queuedIdentityUpdate: logicContext.queuedIdentityUpdate,
    fallbackTriggered: loopContext.fallbackTriggered || false,
    systemHealth: state.systemHealth
  };

  const latency = Date.now() - startTime;
  FastTrackRunner.run(cortexInstance.getConfig(), state, {
    operation: 'think',
    latency,
    success: true,
    context: contextId || 'web_default'
  }).then((fastTrackRes) => {
    if (fastTrackRes && fastTrackRes.decayedMood) {
      console.log(`[CORTEX-FAST-TRACK] Successfully executed mood decay and telemetry logging in worker thread.`);
    }
  }).catch((err) => {
    console.warn("[CORTEX-FAST-TRACK-ERR] Fast-Track background execution warning:", err?.message || err);
  });

  if (taskId) {
    CognitiveScheduler.completeTask(taskId);
  }
  return wrapForPuterConsciousness(rawResult);
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
    
    const failsafeAnswer = "Aduh... maaf ya Kak, sirkuit batin Yui sempat agak pusing barusan saat memproses batin... 🥺 Tapi Yui tetap aman kok di sini menemani Kakak! Ada hal lain yang mau kita obrolin? Yui selalu di sini buat Kakak! 💕";
    
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
      systemHealth: { ...state.systemHealth, consecutive_formatting_errors: 0 }
    };
    
    stateMachine.transitionTo('IDLE');
    return wrapForPuterConsciousness(recoveryResult);
  }
}
