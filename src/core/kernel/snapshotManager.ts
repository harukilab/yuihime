/**
 * SnapshotManager — opencode-style snapshots/undo (#5).
 *
 * Before file-modifying tools run, Yui captures the original content of the
 * target files. The `undo_last_changes` tool restores the most recent snapshot
 * for the active context. Snapshots live under ~/.yuihime/snapshots/ and are
 * never deleted automatically.
 */
import { resolveSystemRoot } from '../systemPaths';
import * as fs from 'fs';
import * as path from 'path';

interface SnapshotEntry {
  contextKey: string;
  ts: number;
  tool: string;
  files: Array<{ absPath: string; storedPath: string }>;
}

export class SnapshotManager {
  private static instance: SnapshotManager;
  private index: Map<string, SnapshotEntry[]> = new Map();

  private constructor() {}

  public static getInstance(): SnapshotManager {
    if (!SnapshotManager.instance) {
      SnapshotManager.instance = new SnapshotManager();
    }
    return SnapshotManager.instance;
  }

  private baseDir(): string {
    return path.join(resolveSystemRoot(), 'snapshots');
  }

  private contextKey(contextId: string): string {
    return String(contextId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }

  /**
   * Extract candidate file paths from a tool call's args. Accepts common
   * param names used across YuiHime file tools.
   */
  public extractPaths(args: any): string[] {
    if (!args || typeof args !== 'object') return [];
    const keys = ['path', 'filePath', 'filename', 'file', 'target', 'resource', 'file_path', 'filepath'];
    const found = new Set<string>();
    for (const k of keys) {
      const v = args[k];
      if (typeof v === 'string' && v.trim()) found.add(v.trim());
      if (Array.isArray(v)) {
        v.forEach((item: any) => {
          if (typeof item === 'string' && item.trim()) found.add(item.trim());
        });
      }
    }
    // write.ts uses a single `path` field; apply_patch embeds paths in patchText
    // (not extractable reliably here) — handled by the explicit tool-level hook.
    return Array.from(found);
  }

  public async capture(contextId: string, tool: string, args: any): Promise<number> {
    const paths = this.extractPaths(args);
    if (paths.length === 0) return 0;

    const ctxKey = this.contextKey(contextId);
    const dir = path.join(this.baseDir(), ctxKey, `${Date.now()}-${tool.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    const entry: SnapshotEntry = { contextKey: ctxKey, ts: Date.now(), tool, files: [] };

    let captured = 0;
    for (const p of paths) {
      const absPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      try {
        const stat = await fs.promises.stat(absPath);
        if (!stat.isFile()) continue;
        const relName = absPath.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(-120);
        const stored = path.join(dir, relName);
        await fs.promises.mkdir(dir, { recursive: true });
        const content = await fs.promises.readFile(absPath, 'utf-8');
        await fs.promises.writeFile(stored, content, 'utf-8');
        entry.files.push({ absPath, storedPath: stored });
        captured++;
      } catch (_) {
        // file may not exist yet (e.g. writing a new file) — nothing to snapshot
      }
    }

    if (captured > 0) {
      try {
        await fs.promises.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(entry, null, 2), 'utf-8');
      } catch (_) {}
      const list = this.index.get(ctxKey) || [];
      list.push(entry);
      this.index.set(ctxKey, list);
    }
    return captured;
  }

  public async undo(contextId: string): Promise<{ restored: number; tool?: string; ts?: number; message: string }> {
    const ctxKey = this.contextKey(contextId);
    const list = this.index.get(ctxKey) || [];
    if (list.length === 0) {
      return { restored: 0, message: 'No snapshot available for this context.' };
    }
    const entry = list[list.length - 1];
    let restored = 0;
    const errors: string[] = [];
    for (const f of entry.files) {
      try {
        const content = await fs.promises.readFile(f.storedPath, 'utf-8');
        await fs.promises.writeFile(f.absPath, content, 'utf-8');
        restored++;
      } catch (err: any) {
        errors.push(`${f.absPath}: ${err.message}`);
      }
    }
    if (restored === entry.files.length) {
      list.pop();
    }
    return {
      restored,
      tool: entry.tool,
      ts: entry.ts,
      message: restored > 0
        ? `Restored ${restored} file(s) from snapshot (tool ${entry.tool}).`
        : `Failed to restore snapshot${errors.length ? ': ' + errors.join('; ') : ''}`
    };
  }

  public list(contextId?: string): SnapshotEntry[] {
    if (!contextId) {
      return Array.from(this.index.values()).flat();
    }
    return this.index.get(this.contextKey(contextId)) || [];
  }
}
