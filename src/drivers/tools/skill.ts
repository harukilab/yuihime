import { ToolModule } from '@shared/include/types';
import { SkillsRegistry } from '../../core/SkillsRegistry.js';

const manifest = {
  id: 'skill',
  name: 'Skill',
  description: 'Load a specialized skill when the task at hand matches one of the available skills. Returns the skill instructions to follow.',
  version: '1.1.0',
  type: 'TOOL',
  order: 51,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The name of the skill to load from the skill catalog (e.g. from the <active_skills> list)' }
    },
    required: ['name']
  }
} as const;

export const SkillTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context?: any) => {
    const skillName = args?.name;
    if (!skillName || typeof skillName !== 'string') {
      return {
        success: false,
        error: "Missing required parameter 'name'. Pick a skill from the <active_skills> catalog."
      };
    }

    const skill = SkillsRegistry.getSkill(skillName);
    if (!skill) {
      const available = SkillsRegistry.listNames();
      return {
        success: false,
        error: `Skill '${skillName}' not found. Available skills: ${available.length ? available.join(', ') : 'none (no skills installed yet)'}`
      };
    }

    const state = context?.state;
    if (state) {
      const loaded = Array.isArray(state.loadedSkills) ? state.loadedSkills : [];
      if (!loaded.includes(skill.name)) {
        state.loadedSkills = [...loaded, skill.name];
      }
    }

    return {
      success: true,
      skill: skill.name,
      description: skill.description,
      content: skill.prompt,
      follow: "Incorporate the skill instructions above into your next response or workflow."
    };
  }
};
