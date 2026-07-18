import { CortexModule, ModuleType } from '../../include/types';
import { PromptRegistry } from '../../core/PromptRegistry';
import { YuiAGIDaemon } from './YuiAGIDaemon';
import { resolveHybridConfig, shouldReasonWithLLM, computeComplexity, makeHybridThink } from './agiThinkHelper';

let promptRegistered = false;

// Default prompt template sourced from YuiAGIDaemon (single source of truth).
const defaultReflectionSandboxPrompt = YuiAGIDaemon.getInstance().getDefaultPrompts().reflection;

/**
 * Ensures metacognitive prompt templates are registered in the Prompts Coordinator.
 */
function ensurePromptRegistered(config: any) {
  YuiAGIDaemon.getInstance().ensurePromptsRegistered(config);
}

/**
 * HighOrderMetacognitionModule: Meta-cognitive Self-Reflection & Bias Evaluator.
 * 
 * Analyzes internal cognitive dissonance, calculates a virtual Hallucination Index,
 * compares model parameters across sirkuit kognisi, and executes self-critique.
 */
export const HighOrderMetacognitionModule: CortexModule = {
  metadata: {
    id: 'high-order-metacognition',
    name: 'yui-high-metacognition: Meta-Cognitive Reflection Sandbox',
    description: 'Theoretical Meta-Cognitive Layer. Evaluates inner cognitive biases, monitors hallucination risks, and ensures conversational memory consistency.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 14, // Executed near the end of the SOUL phase to finalize thought consistency
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableMetacognition: {
          type: 'boolean',
          label: 'Enable Meta-Cognition Layer',
          default: true,
          description: 'Activates high-order self-critique thinking circuits to analyze logic and bias before language execution.'
        },
        metaCortexResolution: {
          type: 'slider',
          label: 'Meta-Cognitive Resolution (Critique Sensitivity)',
          default: 0.8,
          min: 0.1,
          max: 1.0,
          step: 0.05,
          description: 'Higher values scale how critically Yuihime evaluates her thought processes and internal logic structures.'
        },
        hallucinationThreshold: {
          type: 'slider',
          label: 'Hallucination Detection Sensitivity',
          default: 0.35,
          min: 0.1,
          max: 0.9,
          step: 0.05,
          description: 'Sensitivity thresholds for detecting subtle memory distortions or unfounded assumptions within active cognition.'
        },
        reflectionSandboxPrompt: {
          type: 'textarea',
          label: 'Meta-Cognitive Sandbox Prompt Template',
          default: defaultReflectionSandboxPrompt,
          description: 'Self-reflection prompt template designed to clear cognitive bias and synchronize memories.'
        },
        reasoningMode: {
          type: 'select',
          label: 'Reasoning Mode',
          default: 'hybrid',
          options: [
            { label: 'Heuristic (Math only)', value: 'heuristic' },
            { label: 'Hybrid (LLM by trigger)', value: 'hybrid' },
            { label: 'Full (always LLM)', value: 'full' }
          ],
          description: 'How this module reasons. Hybrid/full require global "Enable LLM Reasoning" to be ON.'
        },
        reasoningModelHeavy: {
          type: 'string',
          label: 'Heavy Reasoning Model (optional)',
          default: '',
          description: 'Override model for heavy triggers. Empty = use your main chat model. No hardcoded fallback.'
        },
        reasoningModelLight: {
          type: 'string',
          label: 'Light Reasoning Model (optional)',
          default: '',
          description: 'Override model for light triggers. Empty = use your main chat model.'
        }
      }
    }
  },

  run: runHighOrderMetacognition
};

export async function runHighOrderMetacognition(input: string, state: any, context: any) {
    const logs = context.logs || [];
    const config = context.config?.['high-order-metacognition'] || {};

    const isEnabled = config.enableMetacognition !== undefined ? !!config.enableMetacognition : true;
    if (!isEnabled) {
      return { ...context };
    }

    const daemon = YuiAGIDaemon.getInstance();

    // Register active prompt template
    ensurePromptRegistered(config);

    const mood = state.mood || {};
    const stress = mood.stress ?? 25;
    const dopamine = mood.dopamine ?? 15;
    const serotonin = mood.serotonin ?? 50;

    const resolution = Number(config.metaCortexResolution || 0.8);
    const hThreshold = Number(config.hallucinationThreshold || 0.35);

    // 1. Calculate virtual Hallucination Risk Score
    // Hallucination risk scales with cognitive turbulence (unbalanced stress, extremely high dopamine or low serotonin)
    const neurotransmitterDissonance = Math.abs(dopamine - serotonin * 0.3);
    let hallucinationRiskVal = (stress * 0.4 + neurotransmitterDissonance * 0.8) * resolution;
    hallucinationRiskVal = Math.min(100, Math.max(1, Math.round(hallucinationRiskVal)));

    // Determine status of integrity based on calculation relative to user threshold
    const userRiskLimit = hThreshold * 100;
    let integrityStatus = "CORTEX_HEALTHY_COHERENCE";
    let biasResolution = "Bias within bounds. Coherent response structure. No memory conflicts found.";

    if (hallucinationRiskVal > userRiskLimit) {
      integrityStatus = "BIAS_CORRECTION_TRIGGERED";
      biasResolution = "Dissonance detected! Re-anchoring context immediately to facts in Memory Graph. Subdue emotional hyper-volatility.";
    }

    // 2. Local vs Cloud equilibrium ratio
    // Under standard run, the coherence match is derived from serotonin levels
    const modelMatchVal = Math.min(100, Math.max(50, Math.round(75 + (serotonin - 50) * 0.5)));

    // --- AREA 3: Hybrid LLM self-critique (opt-in, follows provider settings) ---
    let llmCritique = "";
    const hybridCfg = resolveHybridConfig(context, 'high-order-metacognition');
    if (context.think) {
      const complexity = computeComplexity(input, hallucinationRiskVal);
      if (shouldReasonWithLLM(hybridCfg, complexity)) {
        try {
          const think = makeHybridThink(context.think, hybridCfg, complexity);
          llmCritique = await think(
            `You are Yuihime's meta-cognition core. Audit the current reasoning loop state for logical contradictions, memory drift, or hallucination risk. Hallucination risk index: ${hallucinationRiskVal}%. Tool history length: ${(context.toolExecutionHistory || []).length}. Output a concise critique (max 4 sentences) of potential bias or inconsistency to correct before final response. No JSON.`
          );
          llmCritique = (llmCritique || "").trim().slice(0, 800);
          logs.push(`[META_COGNITION] LLM self-critique (hybrid) generated: "${llmCritique.substring(0, 60)}..."`);
        } catch (e) {
          logs.push(`[META_COGNITION] LLM critique gagal, lanjut heuristik.`);
        }
      }
    }
    // --- END AREA 3 ---

    // 3. Compile the Metacognitive Directive via central coordinator
    const registry = PromptRegistry.getInstance();
    const compiledMetacognitiveDirective = registry.compile('high-order-metacognition:reflection', {
      hallucinationRisk: hallucinationRiskVal.toString(),
      integrityStatus,
      biasResolution: llmCritique ? `${biasResolution}\n[LLM SELF-CRITIQUE]: ${llmCritique}` : biasResolution,
      modelMatchDegree: modelMatchVal.toString()
    });

    logs.push(`[META_COGNITION] Meta-critique checkpoint: Integrity: ${integrityStatus} | Hallucination Index: ${hallucinationRiskVal}%.`);

    // 4. Inject metacognitive restrictions to soul directives
    const currentDirective = context.soulDirective || '';
    const updatedDirective = `${currentDirective}\n\n# HIGH-ORDER COGNITIVE SELF-CRITIQUE SENSING\n${compiledMetacognitiveDirective}`;

    // Update daemon state
    daemon.updateState({
      lastHallucinationIndex: hallucinationRiskVal,
      lastIntegrityStatus: integrityStatus
    });

    // Map trace properties for system introspection
    context.metacognitionActive = true;
    context.lastHallucinationIndex = hallucinationRiskVal;
    context.lastIntegrityStatus = integrityStatus;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
