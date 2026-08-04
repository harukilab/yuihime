import { ToolModule } from '@shared/include/types';
import { StorageServer } from '@shared/drivers/storageServer';

const manifest = {
  id: 'todowrite',
  name: 'TodoWrite',
  description: 'Create and maintain a structured task list for the current conversation. Todos are persisted per-conversation so progress can be tracked across messages. Use this whenever the user requests a todo/task list, a multi-step plan, or hands you a complex assignment to track.',
  version: '1.0.0',
  type: 'TOOL',
  order: 55,
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Brief description of the task' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Current status' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level' }
          },
          required: ['content', 'status', 'priority']
        },
        description: 'The updated todo list'
      },
      mode: {
        type: 'string',
        enum: ['update', 'clear', 'read'],
        description: "Operation mode. 'update' (default) merges and persists the given todos, 'clear' removes all todos for this conversation, 'read' returns the currently stored todos."
      }
    },
    required: ['todos']
  }
} as const;

function storageKey(contextId: string): string {
  return `todos:${contextId || 'web_default'}`;
}

export const TodoWriteTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any, context: any = {}) => {
    const mode = args.mode || 'update';
    const key = storageKey(context.contextId || 'web_default');

    if (mode === 'clear') {
      await StorageServer.saveCustom(key, []);
      return { success: true, mode: 'clear', todos: [] };
    }

    if (mode === 'read') {
      const stored = (await StorageServer.getCustom(key)) || [];
      return { success: true, mode: 'read', todos: stored };
    }

    const incoming = Array.isArray(args.todos) ? args.todos : [];
    const stored: any[] = (await StorageServer.getCustom(key)) || [];

    const merged = [...incoming];
    for (const s of stored) {
      const content = String(s.content || '').trim();
      if (content && !merged.some((m: any) => String(m.content || '').trim() === content)) {
        merged.push(s);
      }
    }

    await StorageServer.saveCustom(key, merged);
    return { success: true, mode: 'update', todos: merged };
  }
};
