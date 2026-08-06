import { CortexModule, ModuleType } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import { PromptRegistry } from '../core/PromptRegistry';
import { StandardizedProcessor } from '../core/kernel/processor';

const DEFAULT_CORRECTION_PROMPT = `
[SYSTEM]: Your previous output format was invalid. Please wrap your thoughts and spoken response strictly in the requested JSON structure. Do not include raw text outside of the JSON. Make sure you respond naturally as Yuihime.

INVALID OUTPUT:
\${invalidOutput}
`.trim();

const DEFAULT_ERROR_CORRECTION_PROMPT = `
[SYSTEM]: Your previous output indicated an error, failure, or lack of knowledge (e.g. "error", "I don't know"). Please try a different approach, use any relevant tools to verify, or provide a caring, immersive fallback response in-character without sounding like a broken robotic error message.

PREVIOUS OUTPUT:
\${invalidOutput}
`.trim();

// Register default templates
PromptRegistry.getInstance().register('neural-verifier:correction', DEFAULT_CORRECTION_PROMPT);
PromptRegistry.getInstance().register('neural-verifier:error-correction', DEFAULT_ERROR_CORRECTION_PROMPT);

/**
 * Unified Neural Verifier & Self-Correction Gate.
 * Consolidates layout format checks, XML/JSON tag boundaries, and error keyword monitoring.
 */
export const NeuralVerifierModule: CortexModule = {
  metadata: {
    id: 'neural-verifier',
    name: 'yui-parser: Integrity Gate',
    description: 'Unified integrity check ensuring LLM outputs are free of errors and structurally compliant.',
    version: '2.0.0', // Standardized API version increment protocol
    type: ModuleType.CORTEX,
    phase: 'evaluation',
    order: 2,
    configSchema: {
      fields: {
        enabled: { type: 'boolean', label: 'Enable Verifier & Error Monitor', default: true },
        strictTagEnforcement: { 
          type: 'boolean', 
          label: 'Strict Tag Enforcement', 
          default: false,
          description: 'If enabled, strictly checks for <thought> and <final_answer> tags of dialogue.'
        },
        errorCheckingEnabled: { 
          type: 'boolean', 
          label: 'Error Keyword Checking', 
          default: true,
          description: 'If enabled, monitors output dialogue for failure phrases and triggers self-correction.'
        },
        errorKeywords: {
          type: 'string',
          label: 'Error Keywords (comma separated)',
          default: "error, don't know, cannot help, failed, API error",
          description: 'Phrase triggers that activate self-correction.'
        },
        correctionPrompt: {
          type: 'textarea',
          label: 'Formatting Correction Prompt',
          default: DEFAULT_CORRECTION_PROMPT,
          description: 'Prompt sent to the LLM if formatting is invalid. Use \${invalidOutput} variable.'
        },
        errorCorrectionPrompt: {
          type: 'textarea',
          label: 'Error Correction Prompt',
          default: DEFAULT_ERROR_CORRECTION_PROMPT,
          description: 'Prompt sent to the LLM if failure keywords are detected. Use \${invalidOutput} variable.'
        }
      }
    }
  },
  run: async (input: string, state: any, context: any) => {
    const config = await SystemRegistry.getConfig('neural-verifier') || {};
    if (config.enabled === false) {
      return { ...context, verifierStatus: 'disabled' };
    }

    console.log('[VERIFIER] Executing consolidated neural integrity check...');
    const logs = context.logs || [];
    let currentInput = input;
    let fallbackTriggered = false;

    // 1. Structural Validation (Strict Tag Enforcement)
    if (config.strictTagEnforcement === true && input.length > 0) {
      const hasThought = input.includes('<thought>') && input.includes('</thought>');
      const hasFinalAnswer = input.includes('<final_answer>') && input.includes('</final_answer>');
      
      if (!hasThought || !hasFinalAnswer) {
        console.warn('[VERIFIER] Structural mismatch detected. Initiating repair cycle...');
        logs.push('[VERIFIER] Output lacks required <thought> or <final_answer> tags.');

        const gateway = SystemRegistry.getModule<CortexModule>('provider-gateway');
        if (gateway) {
          const registry = PromptRegistry.getInstance();
          const template = config.correctionPrompt || registry.get('neural-verifier:correction');
          
          registry.register('neural-verifier:correction', template, true);
          const compiledPrompt = registry.compile('neural-verifier:correction', {
            invalidOutput: input
          });

          const resultContext = await gateway.run(compiledPrompt, state, context);
          currentInput = resultContext.rawResult || input;
          fallbackTriggered = true;
          logs.push('[VERIFIER] Format repair cycle completed.');
        }
      }
    }

    // 2. Accuracy and Error Keyword Monitoring (Merged from SelfCorrectionModule)
    if (config.errorCheckingEnabled !== false) {
      const dialogueText = StandardizedProcessor.sanitizeOutput(context.processedResponse || currentInput || "");
      const lowerDialogue = dialogueText.toLowerCase();

      const keywords = (config.errorKeywords || "error, don't know")
        .split(',')
        .map((k: string) => k.trim().toLowerCase())
        .filter((k: string) => k.length > 0);

      const hasError = keywords.some((k: string) => {
        if (!lowerDialogue.includes(k)) return false;

        // Check for false positives to avoid interrupting conversational uses of the words
        const isConversational = lowerDialogue.includes('kakak') || 
                                 lowerDialogue.includes('yui') || 
                                 lowerDialogue.includes('yuihime') || 
                                 lowerDialogue.includes('sayang') || 
                                 lowerDialogue.includes('cinta') || 
                                 lowerDialogue.includes('manja') || 
                                 lowerDialogue.includes('senang') || 
                                 lowerDialogue.includes('temani') || 
                                 lowerDialogue.includes('*gembira*') || 
                                 lowerDialogue.includes('*senyum*') || 
                                 lowerDialogue.includes('🥺') || 
                                 lowerDialogue.includes('~');

        if (k === 'error') {
          const negations = [
            'tidak ada error',
            'tidak error',
            'bukan error',
            'bukanlah error',
            'no error',
            'never error',
            'bebas error',
            'tanpa error',
            'tidak akan error',
            'mana mungkin ada yang error',
            'mana mungkin ada error',
            'mana mungkin yui error',
            'tidak mengalami error'
          ];
          if (negations.some(neg => lowerDialogue.includes(neg))) {
            return false; // Not a genuine error
          }
          if (isConversational && (lowerDialogue.includes('bekerja dengan baik') || lowerDialogue.includes('sempurna') || lowerDialogue.includes('baik-baik saja'))) {
            return false; // Conversational defense
          }
        }

        if (k === "don't know" || k === "tidak tahu" || k === "cannot help" || k === "failed") {
          if (isConversational) {
            return false; // Cute character conversational usage
          }
        }

        return true; // Genuine failure detected
      });

      if (hasError) {
        console.warn('[VERIFIER] Error keyword detected in output:', dialogueText);
        logs.push('[VERIFIER] Failure indicator matching error template found in character speech.');

        const gateway = SystemRegistry.getModule<CortexModule>('provider-gateway');
        if (gateway) {
          const registry = PromptRegistry.getInstance();
          const template = config.errorCorrectionPrompt || registry.get('neural-verifier:error-correction');

          registry.register('neural-verifier:error-correction', template, true);
          const compiledPrompt = registry.compile('neural-verifier:error-correction', {
            invalidOutput: dialogueText
          });

          const resultContext = await gateway.run(compiledPrompt, state, context);
          
          // Merge repaired output
          currentInput = resultContext.rawResult || currentInput;
          fallbackTriggered = true;
          logs.push('[VERIFIER] Immersive error correction recovery complete.');
        }
      }
    }

    if (fallbackTriggered) {
      return { 
        ...context, 
        rawResult: currentInput, 
        verifierStatus: 'corrected' 
      };
    }

    return { ...context, verifierStatus: 'valid' };
  }
};
