import { ToolModule } from '@shared/include/types';

const manifest = {
  id: 'question',
  name: 'Question',
  description: 'Ask the user questions during execution to gather preferences, clarify ambiguity, or get decisions on implementation choices.',
  version: '1.0.0',
  type: 'TOOL',
  order: 50,
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question to ask the user' },
            header: { type: 'string', description: 'Very short label (max 30 chars)' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Display text (1-5 words)' },
                  description: { type: 'string', description: 'Explanation of choice' }
                },
                required: ['label', 'description']
              }
            },
            multiple: { type: 'boolean', description: 'Allow selecting multiple options' }
          },
          required: ['question', 'header', 'options']
        },
        description: 'Questions to ask the user'
      }
    },
    required: ['questions']
  }
} as const;

export const QuestionTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const questions = args.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      return { success: false, error: 'No questions provided' };
    }

    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;

    try {
      const res = await fetch(`${baseUrl}/api/tools/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        answers: questions.map(() => []),
        error: err.message
      };
    }
  }
};
