import { CortexModule, ModuleType, AgentState } from '@shared/include/types';

/**
 * SOP Metadata Standardization:
 * 1. ID: Unique in kebab-case format.
 * 2. Name: Descriptive name with a category prefix (e.g. "yui-addon: ...").
 * 3. SettingsTab: Determine in which category this module's settings appear in the UI.
 * 4. ConfigSchema: Define all the parameters that users can configure.
 */
export const NeuralEchoAddon: CortexModule = {
  metadata: {
    id: 'neural-echo',
    name: 'yui-addon: Neural Echo',
    description: 'Addon untuk memberikan efek pantulan neural pada respon agent, meningkatkan kedalaman filosofis.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 50,
    phase: 'LOGIC',
    settingsTab: 'Addons', // Will appear automatically in the Addons tab
    configSchema: {
      fields: {
        enabled: { 
          type: 'boolean', 
          label: 'Enable Echo', 
          default: true 
        },
        echoStrength: { 
          type: 'slider', 
          label: 'Echo Strength', 
          min: 0, 
          max: 1, 
          step: 0.05, 
          default: 0.5 
        },
        echoColor: { 
          type: 'color', 
          label: 'Echo Highlight Color', 
          default: '#00f2ff' 
        },
        preferredModel: {
          type: 'select',
          label: 'Echo Logic Model',
          default: 'fast',
          options: [
            { label: 'Fast (Recursive)', value: 'fast' },
            { label: 'Deep (Philosophical)', value: 'deep' }
          ]
        },
        customSignature: {
          type: 'string',
          label: 'Echo Signature',
          placeholder: '... (Echoing Knowledge) ...',
          default: ''
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const config = context.moduleConfig || {};
    if (!config.enabled) return { ...context };

    // Addon logic goes here
    console.log(`[NEURAL_ECHO] Processing with strength: ${config.echoStrength}`);
    
    return { 
      ...context, 
      echoApplied: true,
      modifiedInput: `${input} ${config.customSignature || ''}`
    };
  }
};
