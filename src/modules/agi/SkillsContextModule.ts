import { CortexModule, ModuleType } from '@shared/include/types';
import { SkillsRegistry } from '../../core/SkillsRegistry.js';

/**
 * SkillsContextModule — surfaces the installed skill catalog (name + description)
 * into the system prompt so the agent knows which skills are available and can
 * invoke the Skill tool with the right name. Loaded skills are also echoed so
 * their instructions stay active for the rest of the turn.
 *
 * Runs in the compression phase BEFORE PromptManager (order 3 < 5) and injects
 * into context.externalInjection, which PromptManager merges into
 * <external_module_injections>.
 */
export const SkillsContextModule: CortexModule = {
  metadata: {
    id: 'skills-context',
    name: 'Skills Context Injector',
    description: 'Injects the installed Skills catalog (<active_skills>) into the system prompt and keeps loaded skill instructions active during the turn.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 3,
    phase: 'compression',
    configSchema: {
      fields: {
        enableSkills: {
          type: 'boolean',
          label: 'Enable Skills System',
          default: true,
          description: 'When enabled, the installed skill catalog is listed in the system prompt.'
        },
        skillCatalogLimit: {
          type: 'number',
          label: 'Max Skills Listed',
          default: 30,
          min: 1,
          max: 200,
          description: 'Maximum number of skills to list in the catalog to avoid prompt bloat.'
        }
      }
    }
  },

  run: async (_input: string, state: any, context: any) => {
    const config = context.config?.['skills-context'] || {};
    const isEnabled = config.enableSkills !== undefined ? !!config.enableSkills : true;
    if (!isEnabled) {
      return { ...context };
    }

    const skills = SkillsRegistry.getAll();
    const limit = Number(config.skillCatalogLimit || 30);
    const shown = skills.slice(0, limit);

    const blocks: string[] = [];

    if (shown.length > 0) {
      const catalog = shown
        .map((s) => `- ${s.name}: ${s.description}`)
        .join('\n');
      blocks.push(
        `<active_skills>\nThe following skills are installed and can be loaded on demand via the Skill tool (name=...). Load one when the task matches its purpose; its instructions become active after loading.\n${catalog}\n</active_skills>`
      );
    }

    const loaded = Array.isArray(state?.loadedSkills) ? state.loadedSkills : [];
    if (loaded.length > 0) {
      const loadedDefs = loaded
        .map((n: string) => SkillsRegistry.getSkill(n))
        .filter(Boolean)
        .map((s: any) => `- ${s.name}: ${s.description}\n\nInstructions:\n${s.prompt}`);
      if (loadedDefs.length > 0) {
        blocks.push(
          `<loaded_skills>\nThe following skills are already active for this conversation and their instructions must be followed in full:\n${loadedDefs.join('\n\n')}\n</loaded_skills>`
        );
      }
    }

    if (blocks.length === 0) {
      return { ...context };
    }

    const prior = context.externalInjection ? context.externalInjection + '\n\n' : '';
    return {
      ...context,
      externalInjection: prior + blocks.join('\n\n')
    };
  }
};
