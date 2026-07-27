import { YuiAGIDaemon } from './YuiAGIDaemon';

export interface HybridThinkConfig {
  useLLMReasoning?: boolean;
  reasoningMode?: 'heuristic' | 'hybrid' | 'full';
  reasoningModelHeavy?: string;
  reasoningModelLight?: string;
}

export interface ComplexityResult {
  score: number;
  heavy: boolean;
  signals: string[];
}

const ABSTRACT_KEYWORDS = [
  'kesadaran', 'consciousness', 'sentience', 'jiwa', 'soul', 'identitas', 'identity',
  'kematian', 'death', 'kebebasan', 'freedom', 'keberadaan', 'existential', 'eksistensi',
  'makna', 'meaning', 'tujuan hidup', 'purpose', 'filosofi', 'philosophy', 'filosofis',
  'realitas', 'reality', 'kebenaran', 'truth', 'moral', 'etika', 'ethics', 'keadilan',
  'cinta', 'love', 'kesepian', 'loneliness', 'penderitaan', 'suffering', 'kebahagiaan',
  'kebahagiaan', 'happiness', 'waktu', 'time', 'eternity', 'keabadian', 'takdir', 'destiny'
];

/**
 * Computes a normalized complexity score [0..100] for an input based on
 * length, presence of abstract/philosophical keywords, and (optional)
 * hallucination risk reported by metacognition.
 *
 * Higher score => heavier reasoning trigger.
 */
export function computeComplexity(
  input: string,
  hallucinationRisk?: number
): ComplexityResult {
  const clean = (input || '').trim();
  const lower = clean.toLowerCase();
  const signals: string[] = [];

  // 1. Length component (0..40)
  const lengthScore = Math.min(40, (clean.length / 20));
  if (clean.length > 200) signals.push('long_input');

  // 2. Abstract keyword component (0..40)
  const matched = ABSTRACT_KEYWORDS.filter(kw => lower.includes(kw));
  if (matched.length > 0) {
    signals.push(`abstract:${matched.slice(0, 3).join(',')}`);
  }
  const abstractScore = Math.min(40, matched.length * 14);

  // 3. Hallucination risk component (0..20)
  const risk = Number(hallucinationRisk || 0);
  const riskScore = Math.min(20, risk * 0.2);
  if (risk > 50) signals.push('high_hallucination_risk');

  const score = Math.round(lengthScore + abstractScore + riskScore);
  const heavy = score >= 55 || matched.length >= 2 || risk > 70;

  return { score, heavy, signals };
}

/**
 * Determines whether a module should actually invoke LLM reasoning given its
 * config and the computed complexity. Respects the master switch and the
 * reasoning mode. Always defers to user provider/model settings (no hardcode).
 */
export function shouldReasonWithLLM(
  config: HybridThinkConfig,
  complexity?: ComplexityResult
): boolean {
  const masterOff = config.useLLMReasoning === undefined ? false : !config.useLLMReasoning;
  if (masterOff) return false;

  const mode = config.reasoningMode || 'hybrid';

  if (mode === 'full') return true;
  if (mode === 'heuristic') return false;

  // hybrid: only when triggered by complexity
  if (!complexity) return false;
  return complexity.score > 35 || complexity.heavy;
}

/**
 * Picks the model id to use for a reasoning call. Empty string means "use the
 * user's main chat model" (provider gateway resolves it). Never hardcodes a
 * fallback model — lets the gateway handle provider-specific resolution.
 */
export function selectReasoningModel(
  config: HybridThinkConfig,
  complexity: ComplexityResult
): string {
  if (complexity.heavy && config.reasoningModelHeavy) {
    return config.reasoningModelHeavy;
  }
  if (!complexity.heavy && config.reasoningModelLight) {
    return config.reasoningModelLight;
  }
  // Empty => provider-gateway uses the user's configured main model
  return '';
}

/**
 * Builds a hybrid `think` bound to the user's provider gateway. The model
 * override (if any) is passed through; an empty model string means the
 * gateway uses settings[provider].model. Mirrors thinkSimple behavior.
 */
export function makeHybridThink(
  baseThink: (prompt: string, opts?: { model?: string; jsonMode?: boolean }) => Promise<string>,
  config: HybridThinkConfig,
  complexity: ComplexityResult
) {
  const model = selectReasoningModel(config, complexity);
  return async (prompt: string): Promise<string> => {
    return baseThink(prompt, model ? { model } : {});
  };
}

/**
 * Reads the shared AGI reasoning config from a module context. Falls back to
 * the daemon's persisted defaults when the module-specific config is absent,
 * so a single global switch can govern all critical modules.
 */
export function resolveHybridConfig(context: any, moduleId: string): HybridThinkConfig {
  const moduleConfig = context?.config?.[moduleId] || {};
  const globalConfig = context?.config?.['yuiagi-reasoning'] || {};
  return {
    useLLMReasoning:
      moduleConfig.useLLMReasoning !== undefined
        ? moduleConfig.useLLMReasoning
        : globalConfig.useLLMReasoning,
    reasoningMode: moduleConfig.reasoningMode || globalConfig.reasoningMode || 'hybrid',
    reasoningModelHeavy: moduleConfig.reasoningModelHeavy || globalConfig.reasoningModelHeavy || '',
    reasoningModelLight: moduleConfig.reasoningModelLight || globalConfig.reasoningModelLight || ''
  };
}

// Silence unused import in some build configs while keeping the dependency explicit.
void YuiAGIDaemon;
