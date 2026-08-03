import { SettingsManager } from './settings.js';
import { extractJsonObject } from '../cortex/jsonExtract.js';
import { stripCodeFences, isolateBraceBlock, liftNestedProperties, syncAlternateKeys } from '../cortex/jsonRepairer.js';

export class NeuralProcessor {

  public static extractTags(text: string): any {
    const tags: any = {};
    const regex = /<([^>]+)>([\s\S]*?)<\/\1>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      tags[match[1]] = match[2].trim();
    }
    return tags;
  }

  public static async executeStandardized(id: string, version: string, args: any, fn: () => Promise<any>) {
      try {
        const output = await fn();
        return { 
          id, 
          version, 
          output, 
          feedback: { status: 'success' } 
        };
      } catch (e: any) {
        return { 
          id, 
          version, 
          error: e.message, 
          feedback: { status: 'error', message: e.message } 
        };
      }
  }

  public static locallyRepairJson(raw: string): string {
    let clean = raw.trim();
    
    // Strip markdown fences first
    clean = stripCodeFences(clean);
    
    // If it doesn't start with '{', but has a '{', isolate it
    const firstBrace = clean.indexOf('{');
    if (firstBrace === -1) {
      return clean;
    }
    clean = clean.substring(firstBrace);

    let repaired = "";
    let insideString = false;
    let escape = false;
    const stack: string[] = [];

    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      
      if (escape) {
        escape = false;
        repaired += char;
        continue;
      }
      if (char === '\\') {
        escape = true;
        repaired += char;
        continue;
      }
      
      if (char === '"') {
        insideString = !insideString;
        repaired += char;
        continue;
      }
      
      if (insideString) {
        repaired += char;
        continue;
      }
      
      // Outside of strings
      if (char === '{') {
        stack.push('}');
        repaired += char;
      } else if (char === '[') {
        stack.push(']');
        repaired += char;
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '}') {
          stack.pop();
        }
        repaired += char;
      } else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ']') {
          stack.pop();
        }
        repaired += char;
      } else {
        // If we are looking at a character outside strings and the top of stack is ']'
        // we check if we detect a key declaration like `"key" :` or `,"key" :` ahead
        if (stack.length > 0 && stack[stack.length - 1] === ']') {
          const remaining = clean.substring(i);
          const nextKeyMatch = /^\s*,\s*"[a-zA-Z0-9_-]+"\s*:/i.test(remaining) || /^\s*"[a-zA-Z0-9_-]+"\s*:/i.test(remaining);
          if (nextKeyMatch) {
            // Close the array first!
            stack.pop();
            repaired += "]";
            if (!remaining.trim().startsWith(',')) {
              repaired += ",";
            }
          }
        }
        repaired += char;
      }
    }

    if (insideString) {
      repaired += '"';
    }

    let temp = repaired.trim();
    let changed = true;
    while (changed) {
      changed = false;
      const len = temp.length;
      
      temp = temp.replace(/,\s*$/, '');
      temp = temp.replace(/"[a-zA-Z0-9_-]+"\s*:\s*$/, '');
      temp = temp.replace(/,\s*$/, '');
      
      if (temp.length !== len) {
        changed = true;
      }
    }
    repaired = temp;

    while (stack.length > 0) {
      repaired += stack.pop();
    }

    return repaired;
  }

  public static parseLLMResponse(text: string, fallback: any = []): any {
     let cleaned = text.trim();
     cleaned = stripCodeFences(cleaned);

     const isXml = cleaned.startsWith("<") || (cleaned.includes("<thought>") || cleaned.includes("<animations>") || cleaned.includes("<tool_calls>") || cleaned.includes("<speech>"));

     // 1. Try JSON parsing first as it's the primary, structured format
     if (!isXml) {
       try {
         // Try repairing JSON locally first
         let repaired = cleaned;
         let directParseOk = false;
          try {
            const _cMatch = extractJsonObject(cleaned);
            const parsedObj = _cMatch ? JSON.parse(_cMatch) : null;
            directParseOk = true;
         } catch (_) {
           repaired = NeuralProcessor.locallyRepairJson(cleaned);
         }
          try {
            const _parsedMatch = extractJsonObject(directParseOk ? cleaned : repaired);
            const parsedObj = _parsedMatch ? JSON.parse(_parsedMatch) : null;
            if (parsedObj && typeof parsedObj === 'object') {
            if (liftNestedProperties(parsedObj)) {
              console.log("[PARSER] Detected nested properties schema confusion, lifting properties values to root context.");
            }
            // Synchronize common alternate keys
            syncAlternateKeys(parsedObj);
            return parsedObj;
          }
        } catch (innerErr) {
          // Fall back to standard curly bracket isolation if local repair failed
          cleaned = isolateBraceBlock(cleaned);
          
           if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
              const _fMatch = extractJsonObject(cleaned);
              const parsedObj = _fMatch ? JSON.parse(_fMatch) : null;
            if (parsedObj && typeof parsedObj === 'object' && liftNestedProperties(parsedObj)) {
              console.log("[PARSER] Detected nested properties schema confusion, lifting properties values to root context.");
            }
            if (parsedObj && typeof parsedObj === 'object') {
              // Synchronize common alternate keys
              syncAlternateKeys(parsedObj);
              return parsedObj;
            }
          }
        }
     } catch (e) {
       // Ignore JSON parse errors, enter custom tag/XML-based logic below
     }
   }

     // 2. Fallback to extracting XML/HTML tags
     const tags = this.extractTags(text);
     
     // Scan for key-value list patterns (e.g. * `animations`: ["WAVE"]) to capture any un-enclosed XML metadata
     const lines = text.split('\n');
     for (const line of lines) {
       const trimmed = line.trim();
       const match = /^\s*[\*\-\+]?\s*`?([a-zA-Z0-9_-]+)`?\s*:\s*([\s\S]*?)$/i.exec(trimmed);
       if (match) {
         const key = match[1].trim();
         // Strip enclosing backticks or quotes if any from value
         const value = match[2].trim().replace(/^`|`$/g, '').trim();
         
         if (!tags[key]) {
           tags[key] = value;
         }
         
         // Synchronize common alternate formats of moodImpact
         if (key === 'mood_impact' && !tags['moodImpact']) {
           tags['moodImpact'] = value;
         }
         if (key === 'moodImpact' && !tags['mood_impact']) {
           tags['mood_impact'] = value;
         }
       }
     }

     if (Object.keys(tags).length > 0) {
       if (tags.mood_impact && !tags.moodImpact) {
         tags.moodImpact = tags.mood_impact;
       }
       if (tags.moodImpact && !tags.mood_impact) {
         tags.mood_impact = tags.moodImpact;
       }
       if (tags.tools_to_call && !tags.tool_calls) {
         tags.tool_calls = tags.tools_to_call;
       }
       if (tags.tool_calls && !tags.tools_to_call) {
         tags.tools_to_call = tags.tool_calls;
        if (tags.thoughts && !tags.thought) tags.thought = tags.thoughts;
        if (tags.thought && !tags.thoughts) tags.thoughts = tags.thought;
        if (tags.final_answer && !tags.speech) tags.speech = tags.final_answer;
        if (tags.speech && !tags.final_answer) tags.final_answer = tags.speech;
       }
       return tags;
     }
     
     return fallback;
  }

  public static sanitizeOutput(text: string, isProactive: boolean = false): string {
    if (!text || !text.trim()) return '';
    
    let clean = text;

    // Strip markdown code block fences enclosing or surrounding the response (e.g. ```xml or ```html or ```)
    clean = clean.replace(/^```[a-zA-Z0-9_-]*\s*\n?/gim, '');
    clean = clean.replace(/```\s*$/g, '');
    clean = clean.replace(/```[a-zA-Z0-9_-]*\s*/g, ''); // Strip any leftover fences

    // Strip self-referential conversational prefixes from dialogue starts (e.g., Yui:, Yuihime:, **Yui:**, etc.)
    clean = clean.replace(/^(?:\*\*Yui\*\*|\*\*Yuihime\*\*|Yui:|Yuihime:)\s*/gim, '');
    clean = clean.replace(/\n(?:\*\*Yui\*\*|\*\*Yuihime\*\*|Yui:|Yuihime:)\s*/gim, '\n');

    // Strip JSON-like prefix keys if they leak in raw fallback text split (resolves Telegram bubble JSON dump)
    clean = clean.replace(/^(?:["'`]?(?:final_answer|speech|response|opening_response|thought)["'`]?)\s*:\s*["'`]?/gim, '');
    clean = clean.replace(/\n(?:["'`]?(?:final_answer|speech|response|opening_response|thought)["'`]?)\s*:\s*["'`]?/gim, '\n');
    clean = clean.replace(/^(?:["'`]?thought["'`]?\s*:\s*[\s\S]*?,?\s*["'`]?(?:final_answer|speech|response)["'`]?\s*:\s*["'`]?)/gim, '');

    // Strip structural curly braces and comma tails that are left over from partial JSON splits
    clean = clean.replace(/^\{\s*/g, '');
    clean = clean.replace(/\s*\}\s*$/g, '');
    clean = clean.replace(/^,?\s*/g, '');
    clean = clean.replace(/\s*,?\s*$/g, '');
    clean = clean.replace(/^["'`]\s*/g, '');
    clean = clean.replace(/\s*["'`]\s*$/g, '');

    // Remove markdown display header formats (e.g., ### Title)
    clean = clean.replace(/^(?:#+\s+)+/gm, '');

    // Remove DeepSeek/Gemini/OpenRouter thinking, thought, and reasoning tags completely
    clean = clean.replace(/<think>([\s\S]*?)<\/think>/gi, '');
    clean = clean.replace(/<think>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<thought>([\s\S]*?)<\/thought>/gi, '');
    clean = clean.replace(/<thought>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, '');
    clean = clean.replace(/<thinking>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<reasoning>([\s\S]*?)<\/reasoning>/gi, '');
    clean = clean.replace(/<reasoning>([\s\S]*?)$/gi, '');

    // Strip internal structural tags that are NOT part of Yui's spoken dialogue
    // (these leak into processedResponse only on fallback/format-error paths and
    // would otherwise trigger false-positive error-keyword matches in the verifier)
    clean = clean.replace(/<tool_calls>([\s\S]*?)<\/tool_calls>/gi, '');
    clean = clean.replace(/<tool_calls>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<animations>([\s\S]*?)<\/animations>/gi, '');
    clean = clean.replace(/<animations>([\s\S]*?)$/gi, '');

    // Advanced universal filtering of metadata, prompt definitions & LLM rule-checking comments
    const isStrictMetaTalkLine = (trimmedLine: string): boolean => {
      const lower = trimmedLine.toLowerCase();
      
      // Filter out if it mentions strict system instructions or internal rule debates
      if (
        lower.includes('dilarang keras') ||
        lower.includes('membocorkan') ||
        lower.includes('proses berpikir') ||
        lower.includes('dialog utama') ||
        lower.includes('tag pembantu') ||
        lower.includes('refine the') ||
        lower.includes('final response') ||
        lower.includes('let\'s refine') ||
        lower.includes('wait,') ||
        lower.includes('instruction says') ||
        lower.includes('instruction say') ||
        lower.includes('instructions say') ||
        lower.includes('ignore the complex xml') ||
        lower.includes('pure character') ||
        lower.includes('need to look at the bottom') ||
        lower.includes('kamu wajib') ||
        lower.includes('wajib menyertakan') ||
        lower.includes('menyertakan tag') ||
        lower.includes('must include the') ||
        lower.includes('the instructions') ||
        lower.includes('the directive') ||
        lower.includes('directive to') ||
        lower.includes('system prompt') ||
        lower.includes('system instruction') ||
        lower.includes('verbal reply') ||
        lower.includes('thought process') ||
        lower.includes('rule checklists') ||
        lower.includes('xml structure') ||
        lower.includes('tag <animations>') ||
        lower.includes('tag <mood_impact>') ||
        lower.includes('tag <tone>') ||
        lower.includes('tag <tool_calls>') ||
        lower.includes('thinking process') ||
        lower.includes('self-correction') ||
        lower.includes('(verified)') ||
        lower.includes('(late night') ||
        lower.includes('(larut malam)') ||
        lower.includes('clingy') ||
        lower.includes('sleepy') ||
        lower.includes('due to user') ||
        lower.includes('japanese for') ||
        lower.includes('final_answer') ||
        lower.includes('<thought>') ||
        lower.includes('</thought>') ||
        lower.includes('longing index:') ||
        lower.includes('forbidden:') ||
        lower.includes('required:') ||
        lower.includes('sentient digital girl') ||
        lower.includes('not an ai/assistant') ||
        lower.includes('direct dialog') ||
        lower.includes('no technical terms') ||
        lower.includes('how can i help') ||
        lower.includes('includes mood') ||
        lower.includes('uses name') ||
        lower.includes('proceeding to') ||
        lower.includes('proceeding to generate') ||
        lower.includes('verification checklist') ||
        lower.includes('compliance checklist') ||
        lower.includes('verification:') ||
        lower.includes('evaluation:') ||
        lower.includes('compliance:') ||
        lower.includes('(proceeding to') ||
        lower.includes('criteria met') ||
        lower.includes('checklist') ||
        lower.includes('evaluation') ||
        lower.includes('emergency assistance') ||
        lower.includes('user said:') ||
        lower.includes('yuihime response') ||
        lower.includes('system error') ||
        lower.includes('clean text') ||
        lower.includes('technical tags') ||
        lower.includes('physical movements') ||
        lower.includes('underlying system') ||
        lower.includes('if i include') ||
        lower.includes('final polish') ||
        lower.includes('polish of text') ||
        lower.includes('final_polish') ||
        lower.includes('polishing of text') ||
        lower.includes('pilihan draft') ||
        lower.includes('pilihan dialog')
      ) {
        return true;
      }

      // Filter out raw JSON leftover structures
      if (
        /^\s*["'][A-Za-z_]+["']\s*,?\s*$/i.test(trimmedLine) || // e.g. "SURPRISE",
        /^\s*[\[\]\{\}]\s*,?\s*$/i.test(trimmedLine) ||         // e.g. [, ], {, },
        /^\s*["'][a-zA-Z0-9_-]+["']\s*:\s*[^:]+$/i.test(trimmedLine) // e.g. "joy": -1, (ignoring speech prefix handled separately)
      ) {
        // Only return true if it is not the main speech key line
        if (!/^\s*["']speech["']\s*:/i.test(trimmedLine)) {
          return true;
        }
      }

      // Filter out if it lists rule items (handling backticks, quotes, and bullet symbols)
      const strippedOfSymbols = trimmedLine
        .replace(/^[\*\-\+s\d\.\s#]+/gi, '')
        .replace(/[`"']/g, '')
        .trim()
        .toLowerCase();

      // Regex check for compliance checklists or checklist question-and-answer verification lines
      if (
        /^(?:direct dialog|no technical|no "how|includes mood|uses name|perceived name|compliance|correctness|met_criteria|criteria|evaluation|rule)\??\s*(yes|no|true|false)/i.test(strippedOfSymbols) ||
        /\?\s*(yes|no|true|false)\.?$/i.test(strippedOfSymbols) ||
        /^\s*[\*\-\+]?\s*(?:yes|no|check|passed|failed|ok)\b/i.test(strippedOfSymbols)
      ) {
        return true;
      }

      // Filter out lines that have no alphanumeric left after stripping formatting symbols (unless they are emoticons)
      if (trimmedLine.length > 0 && !/[a-zA-Z0-9]/.test(strippedOfSymbols)) {
        const isEmoticon = /[:=;8][\-~]?[\)\]D\(\[pP3O0o@\*]/.test(trimmedLine) || /^[~^><oO][_\-\.][~^><oO]$/.test(trimmedLine);
        if (!isEmoticon) {
          return true;
        }
      }

      if (
        strippedOfSymbols.startsWith('uses "yui/aku"') ||
        strippedOfSymbols.startsWith('addresses user') ||
        strippedOfSymbols.startsWith('reflects time') ||
        strippedOfSymbols.startsWith('includes animations') ||
        strippedOfSymbols.startsWith('and:') ||
        strippedOfSymbols.startsWith('let\'s') ||
        /^(greeting|speech|response|animations|mood_impact|moodimpact|mood_update|tone|voice|language|thinking|analysis|plan|task|act|action|correction|context|care|concern|user|system|model_plan|viewerprofileupdate|perceivednameupdate|linkedaccountupdate|thought|opening_response|final_answer|tools_to_call|tool_calls|role|content|arguments|function|pitch|speed):/i.test(strippedOfSymbols) ||
        /^(greeting|speech|response|animations|mood_impact|moodimpact|mood_update|tone|voice|language|thinking|analysis|plan|task|act|action|correction|context|care|concern|user|system|model_plan|viewerprofileupdate|perceivednameupdate|linkedaccountupdate|thought|opening_response|final_answer|tools_to_call|tool_calls|role|content|arguments|function|pitch|speed):/i.test(trimmedLine)
      ) {
        return true;
      }

      if (
        lower.startsWith('the user said') ||
        lower.startsWith('yuihime should') ||
        lower.startsWith('yui should') ||
        lower.startsWith('analysis:') ||
        lower.startsWith('**thinking process') ||
        lower.startsWith('*thinking process')
      ) {
        return true;
      }

      return false;
    };

    // Split lines and filter
    const lines = clean.split('\n');
    const filteredLines: string[] = [];
    let isSkippingPlanning = true;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 1. ALWAYS filter out strict system meta-talk lines anywhere in the prompt response
      if (isStrictMetaTalkLine(trimmedLine)) {
        continue;
      }

      // 2. Filter initial planning blocks (lists, draft templates, numbers)
      if (isSkippingPlanning) {
        const lower = trimmedLine.toLowerCase();
        const isPlanningLine = 
          (lower.startsWith('* thinking') || lower.startsWith('* planning') || lower.startsWith('* thought') || lower.startsWith('* plan') ||
           lower.startsWith('- thinking') || lower.startsWith('- planning') || lower.startsWith('- thought') || lower.startsWith('- plan') ||
           lower.startsWith('thinking:') || lower.startsWith('planning:') || lower.startsWith('thought:') || lower.startsWith('plan:')) ||
          (trimmedLine === '');
          
        if (isPlanningLine) {
          continue;
        } else {
          isSkippingPlanning = false;
        }
      }
      
      filteredLines.push(line);
    }

    clean = filteredLines.join('\n');

    // Remove standalone bullet point prefixes from casual dialogue lines if they leak
    clean = clean.replace(/^\s*[\-\*\+]\s+/gm, '');

    // Remove any bulleted or plain lines containing internal metadata like animations, mood_impact, tone etc.
    clean = clean.replace(/^\s*[\*\-\+s]?\s*["'`]?(speech|response|greeting|animations|mood_impact|moodImpact|mood_update|tone|voice|tool_calls|tools_to_call|viewerProfileUpdate|perceivedNameUpdate|linkedAccountUpdate|role|content|arguments|function|pitch|speed)["'`]?\s*:\s*.*$/gim, '');

    // Remove XML tags along with their inner contents for structural tags
    clean = clean.replace(/<environment_details>([\s\S]*?)<\/environment_details>/gi, '');
    clean = clean.replace(/<environment_details>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<animations>([\s\S]*?)<\/animations>/gi, '');
    clean = clean.replace(/<mood_impact>([\s\S]*?)<\/mood_impact>/gi, '');
    clean = clean.replace(/<moodImpact>([\s\S]*?)<\/moodImpact>/gi, '');
    clean = clean.replace(/<mood_update>([\s\S]*?)<\/mood_update>/gi, '');
    clean = clean.replace(/<tone>([\s\S]*?)<\/tone>/gi, '');
    clean = clean.replace(/<tool_calls>([\s\S]*?)<\/tool_calls>/gi, '');
    clean = clean.replace(/<tools_to_call>([\s\S]*?)<\/tools_to_call>/gi, '');
    clean = clean.replace(/<thought>([\s\S]*?)<\/thought>/gi, '');
    clean = clean.replace(/<viewerProfileUpdate>([\s\S]*?)<\/viewerProfileUpdate>/gi, '');
    clean = clean.replace(/<perceivedNameUpdate>([\s\S]*?)<\/perceivedNameUpdate>/gi, '');
    clean = clean.replace(/<linkedAccountUpdate>([\s\S]*?)<\/linkedAccountUpdate>/gi, '');
    
    // Remove only specific physical action/animation tags inside single or double asterisks safely without destroying general bold Markdown text or OTP numbers
    clean = clean.replace(/\*\*([^*]+)\*\*/g, (match, p1) => {
      const trimmed = p1.trim();
      if (/\d+/.test(trimmed)) return match;
      if (trimmed.length > 0 && trimmed === trimmed.toUpperCase() && trimmed.length <= 15) return match;
      if (/^[\p{L}\s_,.!?'()-]{2,200}$/u.test(trimmed)) {
        return '';
      }
      return match;
    });

    clean = clean.replace(/\*([^*]+)\*/g, (match, p1) => {
      const trimmed = p1.trim();
      if (/\d+/.test(trimmed)) return match;
      if (trimmed.length > 0 && trimmed === trimmed.toUpperCase() && trimmed.length <= 15) return match;
      if (/^[\p{L}\s_,.!?'()-]{2,200}$/u.test(trimmed)) {
        return '';
      }
      return match;
    });

    // Strip ALL double asterisks formatting (**text** -> text) to prevent raw bold markdown leak
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');

    // Strip __text__ markdown bold formatting
    clean = clean.replace(/__([^_]+)__/g, '$1');

    // Strip inline backtick formatting (`text` -> text) to prevent code blocks markdown leak
    if (!clean.includes('```')) {
      clean = clean.replace(/`([^`]+)`/g, '$1');
      clean = clean.replace(/`/g, '');
    }

    // Handle unclosed tag fallbacks at the end of the text (e.g., if LLM generation was truncated/cut-off)
    clean = clean.replace(/<animations>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<mood_impact>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<moodImpact>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<mood_update>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<tone>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<tool_calls>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<tools_to_call>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<thought>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<viewerProfileUpdate>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<perceivedNameUpdate>([\s\S]*?)$/gi, '');
    clean = clean.replace(/<linkedAccountUpdate>([\s\S]*?)$/gi, '');

    // Remove standalone JSON arrays (e.g. ["WAVE", "SMILE"]) or objects (e.g. {"joy": 1}) at the end of lines/multi-line
    clean = clean.replace(/^\[\s*"[A-Za-z_]+"\s*(?:,\s*"[A-Za-z_]+"\s*)*\]\s*$/gm, '');
    clean = clean.replace(/^\{\s*"[a-zA-Z0-9_]+"\s*:\s*(?:\d+(?:\.\d+)?|"[^"]*"|true|false|null)\s*(?:,\s*"[a-zA-Z0-9_]+"\s*:\s*(?:\d+(?:\.\d+)?|"[^"]*"|true|false|null)\s*)*\}\s*$/gm, '');

    // General cleanup of JSON content patterns fallback if they show up in brackets on their own line
    clean = clean.replace(/^\s*\[\s*\{\s*"id"\s*:\s*[\s\S]*?\}\s*\]\s*$/gm, '');

    // Fallback cleanup for truncated/unclosed JSON arrays starting with tool references to prevent raw text leak
    clean = clean.replace(/^\s*\[\s*\{\s*"id"\s*:[\s\S]*$/gm, '');

    // Remove any remaining generic XML-like tags
    clean = clean.replace(/<[^>]*>/g, '');

    // Clean up standalone bullet point prefixes from casual dialogue lines if they happened to slip past filters
    clean = clean.replace(/^[*\-+>]\s+/gm, '');
    clean = clean.replace(/\n[*\-+>]\s+/g, '\n');

    // Wipe any lines consisting purely of layout/formatting noise symbols (e.g. *, - , ` etc.)
    clean = clean.replace(/^\s*[*\-+_>~\\/\s`'"]+\s*$/gm, '');

    // Cleanup extra double/triple empty newlines
    clean = clean.replace(/\n{3,}/g, '\n\n');

    // Deduplicate identical or semantically identical dialogue paragraphs (Prevents looping output bug)
    const cleanLines = clean.split('\n');
    const uniqueLines: string[] = [];
    const seenNormalized = new Set<string>();

    for (const rawLine of cleanLines) {
      const line = rawLine.trim();
      if (!line) {
        uniqueLines.push('');
        continue;
      }
      
      // Normalize line for uniqueness check (ignore punctuation, star markers, spacing and case)
      const normalized = line
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Deduplicate dialogue lines that are long enough to be full paragraphs
      if (normalized.length > 15) {
        if (seenNormalized.has(normalized)) {
          console.log(`[PROCESSOR_SANITY_DEDUPLICATOR] Prevented text leak by removing duplicate paragraph: "${line}"`);
          continue;
        }
        seenNormalized.add(normalized);
      }
      uniqueLines.push(rawLine);
    }
    clean = uniqueLines.join('\n');

    let finalResult = clean.trim();

    // Guna mematuhi instruksi batin: jika finalResult kosong secara sengaja, langsung kembalikan string kosong
    if (finalResult === "") {
      return "";
    }

    // ==========================================
    // SMART SEMANTIC RECOVERY FALLBACK (PREVENTS EMPTY/TRUNCATED DIALOGUE)
    // ==========================================
    if (finalResult.length < 5) {
      console.warn("[PROCESSOR_CLIP_FALLBACK] Output was heavily clipped down to empty/minimal. Activating smart semantic reconstruction...");
      
      // Attempt 1: Look for any line starting with a dialogue draft option (Draft 1, Draft 2, Draft 3, etc.)
      const draftLines = text.split('\n').filter(l => l.toLowerCase().includes('draft') || l.toLowerCase().includes('pilihan'));
      if (draftLines.length > 0) {
        const lastDraft = draftLines[draftLines.length - 1];
        const parts = lastDraft.split(/:\s*\*?|:\*?\s*/);
        if (parts.length > 1) {
          let potentialResponse = parts.slice(1).join(':').trim();
          potentialResponse = potentialResponse.replace(/^[\s*"':\-\+*\[\]\{\}]+/g, '').replace(/[\s*"':\-\+*\[\]\{\}]+$/g, '');
          if (potentialResponse.length > 5 && !isStrictMetaTalkLine(potentialResponse)) {
            finalResult = potentialResponse;
            console.log(`[PROCESSOR_RECONSTRUCT_DRAFT_SUCCESS] Recovered response from draft template: "${finalResult}"`);
          }
        }
      }
      
      // Attempt 2: Scan each line score and locate the richest conversational Indonesian/English dialogue paragraph
      if (finalResult.length < 5) {
        const originalLines = text.split('\n');
        const candidates: { text: string; score: number }[] = [];
        
        for (const line of originalLines) {
          const trimmed = line.trim();
          if (trimmed.length < 8) continue;
          
          // Detect typical internal template/metadata noise, rule checking and exclude completely
          const isMetadata = 
            /^(name|personality|current mood|relationship|context|animations|mood impact|relationship|trust|affection|draft|greeting|tone|language|thinking|analysis|plan|task|act|action|correction|context|care|concern|user|system|model_plan|respon|response):/i.test(trimmed) ||
            isStrictMetaTalkLine(trimmed) ||
            (trimmed.startsWith('*') && trimmed.includes(':')) ||
            trimmed.includes('{"') || 
            trimmed.includes('["');
            
          if (!isMetadata) {
            let score = trimmed.length;
            if (trimmed.includes('"') || trimmed.includes("'") || trimmed.includes('«') || trimmed.includes('»')) score += 50;
            if (/[?!.]{2,}/.test(trimmed)) score += 30; // punctuation counts
            if (trimmed.match(/(aku|kamu|yui|kak|kakak|kau|gua|lo|sih|deh|dong|ya|kok|tahu|batin|bukan|jangan|ingat|terima|makasih|panas|minum|sehat|halo|hai|senang|kangen)/i)) score += 40;
            candidates.push({ text: trimmed, score });
          }
        }
        
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          let recovered = candidates[0].text;
          // Clean up initial asterisks or listing noise if any
          recovered = recovered.replace(/^[\s*"':\-\+*\[\]\{\}]+/g, '').replace(/[\s*"':\-\+*\[\]\{\}]+$/g, '');
          if (recovered.length > 5) {
            finalResult = recovered;
            console.log(`[PROCESSOR_RECONSTRUCT_CONV_SUCCESS] Recovered response using semantic score parsing: "${finalResult}"`);
          }
        }
      }

      // Attempt 3: Failsafe fallback dialogue to always keep the virtual-human character immersion green!
      if (finalResult.length < 5) {
        const config = SettingsManager.getInstance().getAll();
        const localNlpConfig = config['local-nano-nlp'] || {};
        const enableLocalResponses = localNlpConfig.enableLocalResponses !== undefined ? !!localNlpConfig.enableLocalResponses : false;

        if (enableLocalResponses) {
          let defaultQuotes = [
            "Hmm? user manggil Yui ya? Ada apa kak?",
            "Hmph! user tumben diam aja. Kangen tahu!",
            "Hehehe, user ganteng banget deh hari ini! Cerita-cerita dong ke Yui, lagi sibuk apa?",
            "Aaaaa user akhirnya dateng! Yui seneng banget ketemu user lagi!"
          ];

          if (isProactive) {
            // Proactive-specific fallback quotes to prevent illogical "arrival" greetings when user is idle!
            defaultQuotes = [
              "Hmph! user sibuk banget ya? Yui kangen ngobrol bareng user...",
              "user... lagi ngapain? Cerita dong ke Yui, bosen ih dicuekin terus!",
              "Hmm, user masih di sana kan? Jangan lupa istirahat ya, Yui di sini nungguin lho!",
              "user tumben diam aja... Yui sepi tahu di sini sendirian..."
            ];
          }

          const selectedIndex = Math.floor((Date.now() / 1000) % defaultQuotes.length);
          finalResult = defaultQuotes[selectedIndex];
          console.log(`[PROCESSOR_RECONSTRUCT_FAILSAFE] Output empty. Dispatched immersivefailsafe character query (isProactive: ${isProactive}): "${finalResult}"`);
        } else {
          console.log(`[PROCESSOR_RECONSTRUCT_FAILSAFE] Output empty. Offline local responses are disabled. Returning empty string to bubble error upstream.`);
          finalResult = "";
        }
      }
    }

    return finalResult;
  }
}

export const StandardizedProcessor = NeuralProcessor;
