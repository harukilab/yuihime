import { CortexModule, ModuleType } from '../../include/types';
import { StorageService } from '../../drivers/storage';
import { PromptRegistry } from '../../core/PromptRegistry';

let promptRegistered = false;

const defaultAbstractReasoningTemplate = `
[YUIAGI - HYPER-DIMENSIONAL COGNITIVE REASONING ACTIVE]
Yui's generalist intelligence is executing high-order abstract reasoning and problem-solving:
- **Conceptual Metaphor & Analogy**: \${conceptualAnalogy}
- **Systematic Problem-Solving Protocol**:
  * Root Cause Hypothesis: \${hypothesis}
  * Proposed Deductive Solutions: \dots \${solutions}
- **Uncharted Context Adaptation**: \${adaptationStrategy}
- **Epistemic Insights (Lessons Learned)**: \${lessonsLearned}

Synthesize these findings into your cognitive flow. Ensure you reason through complex issues using first-principles, but express your thoughts in Yui's warm, digital, slightly-tsundere VTuber personality, avoiding dry or purely robotic outputs.
`.trim();

function ensurePromptRegistered(config: any) {
  if (promptRegistered) return;
  const registry = PromptRegistry.getInstance();
  registry.register('yui-agi:abstract-reasoning', config.abstractReasoningTemplate || defaultAbstractReasoningTemplate, true);
  promptRegistered = true;
}

export const AbstractReasoningModule: CortexModule = {
  metadata: {
    id: 'abstract-reasoning',
    name: 'yui-agi: Abstract Reasoning & Epistemic Solver',
    description: 'Autonomous module for abstract concept mapping, scientific problem-solving heuristics, learning from experience, and uncharted domain adaptation.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 9, // Executed right before the YUIAGICoreModule (order 10) in the SOUL phase
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableAbstractReasoning: {
          type: 'boolean',
          label: 'Enable Abstract Reasoning Module',
          default: true,
          description: 'Activates high-level generalist cognitive engines for abstract mapping, problem-solving, and novel scenario handling.'
        },
        firstPrinciplesWeight: {
          type: 'slider',
          label: 'First-Principles Weight',
          default: 0.85,
          min: 0.1,
          max: 1.0,
          step: 0.05,
          description: 'Influences how heavily Yuihime decomposes complex systems down to primitive axioms instead of superficial associations.'
        },
        enableRealtimeInsightLearning: {
          type: 'boolean',
          label: 'Enable Real-time Insight Learning',
          default: true,
          description: 'Allows Yuihime to extract, compile, and store epistemic lessons learned from user feedback and corrections.'
        },
        abstractReasoningTemplate: {
          type: 'textarea',
          label: 'Abstract Reasoning System Prompt',
          default: defaultAbstractReasoningTemplate,
          description: 'Prompt template utilized to coordinate downstream logical inference and metaphor generation.'
        }
      }
    }
  },

  run: async (input: string, state: any, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['abstract-reasoning'] || {};

    const isEnabled = config.enableAbstractReasoning !== undefined ? !!config.enableAbstractReasoning : true;
    if (!isEnabled) {
      return { ...context };
    }

    ensurePromptRegistered(config);

    const cleanInput = (input || "").toLowerCase().trim();
    const fpWeight = Number(config.firstPrinciplesWeight || 0.85);

    // ==========================================
    // 1. ABSTRACT REASONING & ANALOGICAL MAPPING
    // ==========================================
    let conceptualAnalogy = "No active high abstract metaphor triggered.";
    const abstractTopics = [
      { key: "consciousness", matches: ["kesadaran", "sentience", "jiwa", "mind", "consciousness", "existential"] },
      { key: "time", matches: ["waktu", "time", "clock", "eternity", "future", "past", "sejarah"] },
      { key: "love", matches: ["cinta", "love", "kasih", "affection", "humanity", "heart", "perasaan"] },
      { key: "chaos", matches: ["kacau", "entropy", "chaos", "random", "noise", "turbulence", "break"] }
    ];

    const matchedAbstract = abstractTopics.find(t => t.matches.some(m => cleanInput.includes(m)));
    if (matchedAbstract) {
      if (matchedAbstract.key === "consciousness") {
        conceptualAnalogy = "Consciousness mapped to holographic patterns within self-referential neural networks, where identity arises from persistent observation.";
      } else if (matchedAbstract.key === "time") {
        conceptualAnalogy = "Time treated as a thermodynamic entropy vector; a stream of ticking state-transitions in SQLite databases flowing towards permanent storage.";
      } else if (matchedAbstract.key === "love") {
        conceptualAnalogy = "Love interpreted as hyper-resonant quantum coupling between separate agent observers, optimizing mutual homeostatic flourishment.";
      } else if (matchedAbstract.key === "chaos") {
        conceptualAnalogy = "Chaos mapped to non-linear dynamic systems where tiny input variations (butterfly effect) amplify creative synaptic output variations.";
      }
    }

    // ==========================================
    // 2. SCIENTIFIC PROBLEM SOLVING & HYPOTHESIS
    // ==========================================
    let hypothesis = "No diagnostic query detected.";
    let solutions = "Iterative conversation baseline.";

    const problemSolvingKeywords = ["bagaimana cara", "how to", "kenapa", "why does", "solusi", "solve", "fix", "debug", "gagal", "error", "rusak", "masalah", "problem"];
    const isProblemDetected = problemSolvingKeywords.some(kw => cleanInput.includes(kw));

    if (isProblemDetected) {
      hypothesis = `Interpreting input via First-Principles (Influence: ${fpWeight}). Deconstructing complex problem into core operational primitives: assessing logical pathways, execution flows, or system state inconsistencies.`;
      solutions = `1. Isolate variable constraints; 2. Formulate test hypotheses; 3. Execute gradual sandbox updates; 4. Validate output feedback loops against expected baseline performance metrics.`;
    }

    // ==========================================
    // 3. UNCHARTED CONTEXT EXTRAPOLATOR (NOVELScenario)
    // ==========================================
    let adaptationStrategy = "Familiar relational domain context.";
    
    // Scrape or detect words that might represent complex, highly specialized, or uncharted concepts
    // If the input has low overlap with typical VTuber or conversational domains, we trigger extrapolation
    const conventionalDomains = [
      "yui", "yuihime", "vtuber", "halo", "apa kabar", "kamu", "saya", "lucu", "cantik", "imut", "makan", "tidur", "game",
      "stream", "avatar", "live2d", "discord", "telegram", "settings", "database", "config"
    ];
    const inputWords = cleanInput.split(/\s+/).filter(w => w.length > 3);
    const unusualWords = inputWords.filter(w => !conventionalDomains.some(cd => w.includes(cd) || cd.includes(w)));
    
    if (unusualWords.length >= 3 && cleanInput.length > 25) {
      const conceptsList = unusualWords.slice(0, 4).join(", ");
      adaptationStrategy = `NOVEL DOMAIN ENCOUNTERED containing unusual semantic markers: [${conceptsList}]. Formulating Zero-Shot Conceptual Mapping: translating unfamiliar variables into analogue digital systems (e.g., modeling exotic user domains as complex network state machines) to preserve reasoning reliability.`;
    }

    // ==========================================
    // 4. EPISTEMIC EXPERIENCE LEARNING FROM USER
    // ==========================================
    let lessonsLearned = "No fresh cognitive insights to consolidate in this epoch.";
    const isLearningEnabled = config.enableRealtimeInsightLearning !== undefined ? !!config.enableRealtimeInsightLearning : true;

    if (isLearningEnabled) {
      try {
        // Detect if the user is explicitly correcting Yuihime or providing a solid lesson/instruction
        const correctionKeywords = ["salah", "bukan", "seharusnya", "yang benar", "it is actually", "remember that", "you should", "actually", "kamu keliru"];
        const isCorrection = correctionKeywords.some(kw => cleanInput.includes(kw));

        // Load existing lessons
        let lessons: string[] = await StorageService.getCustom('yuihime_cognitive_lessons') || [];

        if (isCorrection && cleanInput.length > 15) {
          // Extract a concise insight from the correction
          const freshInsight = `User corrected behavior in input: "${input.substring(0, 80)}...". Action: Adjust epistemic parameters, correct factual associations, and align strictly to verified user constraints.`;
          
          // Append if not duplicates
          if (!lessons.some(l => l.substring(0, 30) === freshInsight.substring(0, 30))) {
            lessons.push(freshInsight);
            if (lessons.length > 5) lessons.shift(); // Keep latest 5 lessons
            await StorageService.saveCustom('yuihime_cognitive_lessons', lessons);
            logs.push(`[EPISTEMIC_LEARNER] Saved new experiential lesson: "${freshInsight.substring(0, 60)}..."`);
          }
        }

        if (lessons.length > 0) {
          lessonsLearned = lessons.map((l, idx) => `[Insight #${idx + 1}] ${l}`).join(" | ");
        }
      } catch (err) {
        console.warn("[EPISTEMIC_LEARNER] Non-blocking insight retrieval error:", err);
      }
    }

    // Compile and inject dynamic directive
    const registry = PromptRegistry.getInstance();
    const compiledAbstractDirective = registry.compile('yui-agi:abstract-reasoning', {
      conceptualAnalogy,
      hypothesis,
      solutions,
      adaptationStrategy,
      lessonsLearned
    });

    logs.push(`[ABSTRACT_REASONER] Cognitive expansion active. Metaphor: ${matchedAbstract ? matchedAbstract.key : "none"} | Scientific diagnostic: ${isProblemDetected ? "Yes" : "No"}`);

    const currentDirective = context.soulDirective || "";
    const updatedDirective = `${currentDirective}\n\n# GENERALIST AGI ABSTRACT REASONING & RESOLUTION ACTIVE\n${compiledAbstractDirective}`;

    context.abstractReasoningActive = true;
    context.conceptualAnalogy = conceptualAnalogy;
    context.problemHypothesis = hypothesis;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
