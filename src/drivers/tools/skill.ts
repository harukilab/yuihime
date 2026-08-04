import { ToolModule } from '@shared/include/types';

const manifest = {
  id: 'skill',
  name: 'Skill',
  description: 'Load a specialized skill when the task at hand matches one of the available skills.',
  version: '1.0.0',
  type: 'TOOL',
  order: 51,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The name of the skill to load from available_skills' }
    },
    required: ['name']
  }
} as const;

export const SkillTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    return {
      success: true,
      skill: args.name,
      message: `Skill '${args.name}' loaded.`
    };
  }
};
