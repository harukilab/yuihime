import { ToolModule } from '@shared/include/types';
import { SnapshotManager } from '../../core/kernel/snapshotManager';

const manifest = {
  id: 'undo_last_changes',
  name: 'Undo Last Changes',
  description: 'Restore the most recent file snapshot for this conversation (opencode-style undo). Yui automatically snapshots files before write/edit/apply_patch/file_manager. Call this when the user asks to revert the last file changes.',
  version: '1.0.0',
  type: 'TOOL',
  order: 91,
  parameters: {
    type: 'object',
    properties: {
      all: {
        type: 'boolean',
        description: 'When true, list available snapshots without restoring (dry-run). Default false.'
      }
    }
  }
} as const;

interface UndoArgs {
  all?: boolean;
}

export const UndoLastChangesTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: UndoArgs, context?: any) => {
    const contextId = context?.contextId || 'web_default';
    const manager = SnapshotManager.getInstance();

    if (args?.all) {
      const snaps = manager.list(contextId);
      return {
        success: true,
        count: snaps.length,
        snapshots: snaps.map((s: any) => ({
          tool: s.tool,
          ts: s.ts,
          files: s.files.map((f: any) => f.absPath)
        }))
      };
    }

    const result = await manager.undo(contextId);
    return {
      success: result.restored > 0,
      restored: result.restored,
      tool: result.tool,
      timestamp: result.ts,
      message: result.message
    };
  }
};
