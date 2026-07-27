/**
 * BackgroundProcessManager
 *
 * Singleton engine for spawning, tracking, and controlling external OS processes
 * as detached background tasks. Integrates with YuiHime's existing CronModule and
 * kernel architecture without modifying core infrastructure.
 *
 * Lifecycle: spawn → running → (stopped | exited)
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export type ProcessStatus = 'running' | 'stopped' | 'exited' | 'error';

export interface BackgroundProcess {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string;
  status: ProcessStatus;
  pid?: number;
  startedAt: number;
  stoppedAt?: number;
  exitCode?: number | null;
  /** Ring buffer — last N lines of combined stdout+stderr */
  logs: string[];
  maxLogLines: number;
}

export interface SpawnOptions {
  label?: string;
  command: string;
  args?: string[];
  cwd?: string;
  maxLogLines?: number;
  /** Environment variables to merge into process.env */
  env?: Record<string, string>;
}

const DEFAULT_MAX_LOG_LINES = 200;

export class BackgroundProcessManager extends EventEmitter {
  private static _instance: BackgroundProcessManager;

  private processes: Map<string, BackgroundProcess> = new Map();
  private handles: Map<string, ChildProcess> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): BackgroundProcessManager {
    if (!BackgroundProcessManager._instance) {
      BackgroundProcessManager._instance = new BackgroundProcessManager();
    }
    return BackgroundProcessManager._instance;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Spawn a new background process. Returns the process record immediately;
   * the OS process starts asynchronously.
   */
  public spawn(opts: SpawnOptions): BackgroundProcess {
    const id = `bgproc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const maxLogLines = opts.maxLogLines ?? DEFAULT_MAX_LOG_LINES;

    const record: BackgroundProcess = {
      id,
      label: opts.label ?? opts.command,
      command: opts.command,
      args: opts.args ?? [],
      cwd: opts.cwd ?? process.cwd(),
      status: 'running',
      startedAt: Date.now(),
      logs: [],
      maxLogLines,
    };

    this.processes.set(id, record);

    try {
      const child = spawn(opts.command, opts.args ?? [], {
        cwd: record.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
        detached: false,     // stays tied to parent's lifetime; use `stop()` to kill
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      record.pid = child.pid;
      this.handles.set(id, child);

      const appendLog = (data: Buffer | string) => {
        const lines = String(data).split(/\r?\n/);
        for (const line of lines) {
          if (line === '') continue;
          record.logs.push(line);
          if (record.logs.length > record.maxLogLines) {
            record.logs.shift(); // keep ring-buffer size
          }
        }
        this.emit('log', id, record.logs[record.logs.length - 1]);
      };

      child.stdout?.on('data', appendLog);
      child.stderr?.on('data', appendLog);

      child.on('error', (err) => {
        record.status = 'error';
        record.stoppedAt = Date.now();
        appendLog(`[ERROR] ${err.message}`);
        this.handles.delete(id);
        this.emit('exit', id, record);
      });

      child.on('exit', (code) => {
        record.status = 'exited';
        record.exitCode = code;
        record.stoppedAt = Date.now();
        appendLog(`[EXIT] Process exited with code ${code}`);
        this.handles.delete(id);
        this.emit('exit', id, record);
      });

    } catch (err: any) {
      record.status = 'error';
      record.stoppedAt = Date.now();
      record.logs.push(`[SPAWN_ERROR] ${err.message}`);
      this.emit('exit', id, record);
    }

    console.log(`[BGProc] Spawned "${record.label}" (id=${id}, pid=${record.pid})`);
    return record;
  }

  /**
   * Send SIGTERM to a running process.
   */
  public stop(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const child = this.handles.get(id);
    const record = this.processes.get(id);
    if (!child || !record) return false;
    if (record.status !== 'running') return false;

    try {
      child.kill(signal);
      record.status = 'stopped';
      record.stoppedAt = Date.now();
      record.logs.push(`[STOP] Sent ${signal}`);
      this.handles.delete(id);
      console.log(`[BGProc] Stopped "${record.label}" (id=${id})`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a snapshot of a single process record.
   */
  public get(id: string): BackgroundProcess | undefined {
    return this.processes.get(id);
  }

  /**
   * List all tracked processes (running + finished).
   */
  public list(): BackgroundProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * List only currently running processes.
   */
  public listRunning(): BackgroundProcess[] {
    return this.list().filter(p => p.status === 'running');
  }

  /**
   * Remove a stopped/exited process from the registry.
   * Returns false if the process is still running.
   */
  public remove(id: string): boolean {
    const record = this.processes.get(id);
    if (!record) return false;
    if (record.status === 'running') return false;
    this.processes.delete(id);
    return true;
  }

  /**
   * Get the last N log lines for a process.
   */
  public getLogs(id: string, tail = 50): string[] {
    const record = this.processes.get(id);
    if (!record) return [];
    return record.logs.slice(-tail);
  }
}
