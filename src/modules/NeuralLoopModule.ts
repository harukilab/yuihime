import { CortexModule, ModuleType } from '../include/types';
import { StandardizedProcessor } from '../core/kernel/processor';
import { L2DExpressionTranslator } from './L2DExpressionTranslator';

/**
 * Neural Parser & Loop: The control center.
 * Breaks down LLM responses into actionable segments and distributes them.
 */
export const NeuralLoopModule: CortexModule = {
  metadata: {
    id: 'neural-loop',
    name: 'yui-runtime: Cognitive Parser',
    description: 'Central orchestrator that decodes LLM intent and routes to sub-modules.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 4: EXECUTION',
    order: 1
  },
  run: async (input: string, state: any, context: any) => {
    console.log('[PARSER] Decoding neural signals...');

    // Use StandardizedProcessor to parse the multi-format response
    const parsed = StandardizedProcessor.parseLLMResponse(input, {
      thought: '',
      opening_response: '',
      final_answer: '',
      tools_to_call: [],
      tool_calls: [],
      animations: [],
      moodImpact: {}
    });

    // Support both tools_to_call and tool_calls tags & json keys, with OpenAI standard alignment
    let rawTools = parsed.tool_calls || parsed.tools_to_call || [];
    if (typeof rawTools === 'string') {
      try {
        const cleanedStr = rawTools.replace(/```json/gi, '').replace(/```/gi, '').trim();
        rawTools = JSON.parse(cleanedStr);
      } catch (e) {
        console.warn('[PARSER] Failed parsing raw tools string as JSON:', e);
        rawTools = [];
      }
    }

    // Standardize to array
    if (rawTools && typeof rawTools === 'object' && !Array.isArray(rawTools)) {
      rawTools = [rawTools];
    }

    let toolsToCall: any[] = [];
    if (Array.isArray(rawTools)) {
      for (const item of rawTools) {
        if (item && typeof item === 'object') {
          // Check if it is OpenAI tool_calls format (has item.function properties)
          if (item.function && typeof item.function === 'object') {
            const funcName = item.function.name;
            let funcArgs = item.function.arguments;
            if (typeof funcArgs === 'string') {
              try {
                const cleanedArgs = funcArgs.replace(/```json/gi, '').replace(/```/gi, '').trim();
                funcArgs = JSON.parse(cleanedArgs);
              } catch (argsErr) {
                console.warn('[PARSER] Failed parsing OpenAI function arguments as JSON:', argsErr);
                funcArgs = {};
              }
            }
            toolsToCall.push({
              tool: funcName,
              name: funcName,
              args: funcArgs || {}
            });
          } else {
            // Simple legacy/fallback format
            const toolName = item.tool || item.name;
            const toolArgs = item.args || item.arguments || {};
            toolsToCall.push({
              tool: toolName,
              name: toolName,
              args: toolArgs
            });
          }
        }
      }
    }

    // Extract and parse animations if it's a string from XML parser
    let animations = parsed.animations || [];
    if (typeof animations === 'string') {
      try {
        const trimmed = animations.replace(/```json/gi, '').replace(/```/gi, '').trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          animations = JSON.parse(trimmed);
        } else {
          animations = trimmed.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (e) {
        animations = [];
      }
    }

    // Capture double asterisk animation/action tags e.g. **WAVE** or **senyum** directly from full response input
    const asteriskRegex = /\*\*([^*]+)\*\*/g;
    let asteriskMatch;
    const extractedAsterisks: string[] = [];
    
    const animMap: Record<string, string> = {
      'smile': 'Smile', 'senyum': 'Smile', 'bahagia': 'Smile',
      'laugh': 'Laugh', 'tawa': 'Laugh', 'tertawa': 'Laugh', 'wkwk': 'Laugh', 'haha': 'Laugh', 'hihi': 'Laugh', 'hehe': 'Laugh',
      'nod': 'Nod', 'angguk': 'Nod', 'mengangguk': 'Nod', 'ya': 'Nod', 'setuju': 'Nod',
      'shake': 'Shake', 'geleng': 'Shake', 'menggeleng': 'Shake', 'tidak': 'Shake',
      'surprise': 'Surprise', 'kaget': 'Surprise', 'terkejut': 'Surprise', 'wow': 'Surprise',
      'think': 'Think', 'pikir': 'Think', 'mikir': 'Think', 'bingung': 'Think',
      'sad': 'Sad', 'sedih': 'Sad', 'kecewa': 'Sad', 'nangis': 'Sad',
      'angry': 'Angry', 'marah': 'Angry', 'kesal': 'Angry', 'sebal': 'Angry',
      'blush': 'Blush', 'malu': 'Blush', 'salting': 'Blush', 'uwu': 'Blush',
      'wave': 'Wave', 'lambai': 'Wave', 'melambai': 'Wave', 'dadah': 'Wave', 'halo': 'Wave', 'hai': 'Wave'
    };

    while ((asteriskMatch = asteriskRegex.exec(input)) !== null) {
      const content = asteriskMatch[1].trim().toLowerCase();
      const words = content.split(/[\s,]+/).map(w => w.trim()).filter(Boolean);
      for (const w of words) {
        if (animMap[w]) {
          extractedAsterisks.push(animMap[w]);
        } else {
          const capitalized = w.charAt(0).toUpperCase() + w.slice(1);
          extractedAsterisks.push(capitalized);
        }
      }
    }

    if (extractedAsterisks.length > 0) {
      if (!Array.isArray(animations)) {
        animations = [];
      }
      animations = Array.from(new Set([...animations, ...extractedAsterisks]));
    }

    // Extract and parse moodImpact if it's a string from XML parser
    let moodImpact = parsed.moodImpact || {};
    if (typeof moodImpact === 'string') {
      try {
        const trimmed = moodImpact.replace(/```json/gi, '').replace(/```/gi, '').trim();
        moodImpact = JSON.parse(trimmed);
      } catch (e) {
        moodImpact = {};
      }
    }

    // Extract and parse viewerProfileUpdate, perceivedNameUpdate, and linkedAccountUpdate for autonomous client/server-side CRUD
    let viewerProfileUpdate = parsed.viewerProfileUpdate || undefined;
    
    // Robust XML-fallback parsing for viewerProfileUpdate
    if (!viewerProfileUpdate) {
      const viewerProfileRegex = /<viewerProfileUpdate>([\s\S]*?)<\/viewerProfileUpdate>/i;
      const vpMatch = viewerProfileRegex.exec(input);
      if (vpMatch) {
        const matchedStr = vpMatch[1].trim();
        try {
          const trimmed = matchedStr.replace(/```json/gi, '').replace(/```/gi, '').trim();
          viewerProfileUpdate = JSON.parse(trimmed);
        } catch (e) {
          console.warn('[PARSER] Failed parsing regex-extracted viewerProfileUpdate JSON:', e);
        }
      }
    } else if (typeof viewerProfileUpdate === 'string') {
      try {
        const trimmed = viewerProfileUpdate.replace(/```json/gi, '').replace(/```/gi, '').trim();
        viewerProfileUpdate = JSON.parse(trimmed);
      } catch (e) {
        console.warn('[PARSER] Failed parsing viewerProfileUpdate JSON:', e);
        viewerProfileUpdate = undefined;
      }
    }

    let perceivedNameUpdate = parsed.perceivedNameUpdate || undefined;
    
    // Robust XML-fallback parsing for perceivedNameUpdate (targets both root tags and speech inline tags)
    if (!perceivedNameUpdate) {
      const perceivedNameRegex = /<perceivedNameUpdate>([\s\S]*?)<\/perceivedNameUpdate>/i;
      const pnMatch = perceivedNameRegex.exec(input);
      if (pnMatch) {
        perceivedNameUpdate = pnMatch[1].trim();
      }
    }
    
    if (typeof perceivedNameUpdate === 'string') {
      perceivedNameUpdate = perceivedNameUpdate.trim();
    }

    // Collect ALL <linkedAccountUpdate> tags from the raw input string
    const linkedAccountsRegex = /<linkedAccountUpdate>([\s\S]*?)<\/linkedAccountUpdate>/gi;
    let laMatch;
    const allLinkedUpdates: string[] = [];
    while ((laMatch = linkedAccountsRegex.exec(input)) !== null) {
      allLinkedUpdates.push(laMatch[1].trim());
    }

    let linkedAccountUpdate: string | string[] | undefined = undefined;
    if (allLinkedUpdates.length > 0) {
      linkedAccountUpdate = allLinkedUpdates.length === 1 ? allLinkedUpdates[0] : allLinkedUpdates;
    } else if (parsed.linkedAccountUpdate && typeof parsed.linkedAccountUpdate === 'string') {
      linkedAccountUpdate = parsed.linkedAccountUpdate.trim();
    }

    // Determine context: are tools present?
    const toolsPresent = Array.isArray(toolsToCall) && toolsToCall.length > 0;

    // Sanitize the final answer for speech/display
    // If tools are present and include send_final_reply, extract the speech from its arguments
    const finalReplyCall = toolsToCall.find((tc: any) => (tc.name || tc.tool) === 'send_final_reply');
    const dialogue = toolsPresent
      ? ((finalReplyCall && finalReplyCall.args?.speech) ? finalReplyCall.args.speech : (parsed.opening_response || parsed.final_answer || ""))
      : (parsed.final_answer || input);
    const isProactiveRun = context.userName === 'System';
    const cleanDialogue = StandardizedProcessor.sanitizeOutput(dialogue, isProactiveRun);

    // Apply auto-translation fallback for mini-LLM or text lacking animation tags
    if (!animations || animations.length === 0) {
      const enrichment = L2DExpressionTranslator.translate(cleanDialogue);
      animations = enrichment.animations;
      moodImpact = { ...moodImpact, ...enrichment.moodImpact };
      console.log(`[PARSER] L2D Heuristic Semantic Translator triggered:`, animations);
    }

    console.log(`[PARSER] Extraction complete. Intents identified. Tools count: ${toolsPresent ? toolsToCall.length : 0}`);

    return {
      ...context,
      parsedData: parsed,
      processedResponse: cleanDialogue,
      thought: parsed.thought,
      toolsToCall: toolsToCall,
      animations: animations,
      moodImpact: moodImpact,
      viewerProfileUpdate: viewerProfileUpdate,
      perceivedNameUpdate: perceivedNameUpdate,
      linkedAccountUpdate: linkedAccountUpdate,
      // Distributable markers: include BOTH if tools are present to enable multitasking
      targetModules: toolsPresent ? ['tool-executor', 'output-renderer'] : ['output-renderer']
    };
  }
};
