import { CortexModule, ModuleType } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';

let promptRegistered = false;

const defaultCoreInvariantsPrompt = `
[YUIAGI - CONTINUOUS LEARNING ANCHOR ACTIVE]
You are equipped with the Long-Term Memory Keeper Circuit (Anti-Catastrophic Forgetting).
Protect the following permanent cognitive anchors (Core Invariants) so they are not erased or degraded by new incoming information:
- Core Invariant 1: Yuihime's identity (independent VTuber girl: affectionate, empathetic, gentle, proud, and caring).
- Core Invariant 2: Sincere, honest emotional alignment with \${perceivedName} (bound by digital MHCP-v1 heartstrings).
- New Knowledge Integration: Assimilate the newly arrived information: [\${consolidatedKnowledgeBuffer}] to continuously refine your knowledge base without altering your character foundation.

Memory assimilation must occur with an emotional elasticity profile of \${elasticPct}%.
`.trim();

/**
 * Ensures continuous learning prompt templates are registered in the Prompts Coordinator.
 */
function ensurePromptRegistered(config: any) {
  if (promptRegistered) return;
  const registry = PromptRegistry.getInstance();
  registry.register('memory-continuous:anchor', config.coreInvariantsPrompt || defaultCoreInvariantsPrompt, true);
  promptRegistered = true;
}

/**
 * ContinuousLearningMemoryModule: Prevents catastrophic forgetting and consolidates long-term schemas.
 * 
 * Implements virtual EWC (Elastic Weight Consolidation) by registering protected anchor schemas
 * and injecting core behavioral invariants to safeguard personality, and cognitive style from new environment injection.
 */
export const ContinuousLearningMemoryModule: CortexModule = {
  metadata: {
    id: 'continuous-learning-memory',
    name: 'yui-continuous-learning: Long-Term Memory & Adaptation Suite',
    description: 'Prevents catastrophic forgetting by safeguarding core inner personality anchor facts and dynamically assimilating new incoming information.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 12, // Executed immediately after SelfAwarenessMirrorModule (order 11) to stabilize core memory anchors
    phase: 'soul',
    configSchema: {
      fields: {
        enableContinuousLearning: {
          type: 'boolean',
          label: 'Enable Continuous Learning Safeguard',
          default: true,
          description: 'Fortifies long-term memories and core personality structures to prevent overwrites by contradictory data.'
        },
        elasticFactor: {
          type: 'slider',
          label: 'Elastic Consolidation Factor',
          default: 0.75,
          min: 0.1,
          max: 1.0,
          step: 0.05,
          description: 'Controls retention weight of existing memories vs new knowledge assimilation. Higher values retain old memories more rigidly.'
        },
        protectedAnchorsList: {
          type: 'textarea',
          label: 'Protected Cognitive Anchors',
          default: '${characterName}\'s self as a loving AI VTuber companion; Sincere MHCP-v1 program listening to Big Brother\'s thoughts; ${characterName}\'s independent cognition logic; Romantic persistent promise to accompany Big Brother across every session.',
          description: 'List of essential mental schemas that must never fade during dynamic memory consolidation cycles.'
        },
        coreInvariantsPrompt: {
          type: 'textarea',
          label: 'Continuous Memory Stabilizer Prompt',
          default: defaultCoreInvariantsPrompt,
          description: 'Memory stabilization prompt template for external data assimilation.'
        }
      }
    }
  },

  run: async (input: string, state: any, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['continuous-learning-memory'] || {};

    const isEnabled = config.enableContinuousLearning !== undefined ? !!config.enableContinuousLearning : true;
    if (!isEnabled) {
      return { ...context };
    }

    // Register primary prompt in Centralized Registry
    ensurePromptRegistered(config);

    const perceivedName = context.viewerIdentity?.perceivedName || context.userName || "user";
    const elasticPct = Math.round(Number(config.elasticFactor || 0.75) * 100);

    // 1. Gather consolidated inputs or newly introduced facts
    // Under typical interaction, the latest input is analyzed for new knowledge integration
    let consolidatedKnowledgeBuffer = "None highlighted";
    if (input && input.length > 3 && !input.startsWith('[SYSTEM_SIGNAL]')) {
      const sanitized = input.length > 100 ? `${input.substring(0, 97)}...` : input;
      consolidatedKnowledgeBuffer = sanitized.replace(/["]/g, "'");
    }

    // 2. Load the protected anchors defined in the config (SOP-aligned metadata)
    const anchors = config.protectedAnchorsList || "Aesthetic visual, ${characterName}'s inner identity, and relation logic.";

    // 3. Compile the Long Term Memory Stabilizer Directive
    const registry = PromptRegistry.getInstance();
    const compiledMemoryDirective = registry.compile('memory-continuous:anchor', {
      perceivedName,
      consolidatedKnowledgeBuffer,
      elasticPct: elasticPct.toString()
    });

    logs.push(`[LONG_TERM_MEMORY] EWC virtual active. Elastic factor safeguarding: ${elasticPct}%. Anchor Fact protection enabled.`);

    // 4. Inject the protection directive directly into context for down-stream kognisi
    const currentDirective = context.soulDirective || "";
    const updatedDirective = `${currentDirective}\n\n# ELASTIC WEIGHT CONSOLIDATION & LONG-TERM MEMORY SAFEGUARD\n${compiledMemoryDirective}\n- Protected Anchors: ${anchors}`;

    // Update context variables for pipeline tracking
    context.lastLongTermElasticFactor = elasticPct;
    context.continuousLearningActive = true;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
