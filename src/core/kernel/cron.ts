import { getTzOffsetHours, toLocalClock } from '../utils/dualClock.js';
import { injectCharacterName } from './characterName.js';

export interface CronRunRecord {
  runAt: number;
  status: string;
  durationMs: number;
  error: string | null;
}

export interface CronTask {
  id: string;
  name: string;
  schedule: string;
  action: () => Promise<void>;
  enabled: boolean;
  repeating: boolean;
  lastRun?: number;
  nextRun?: number;
  /** Absolute epoch-ms fire time for one-shot tasks (persisted across restarts). */
  fire_at?: number;
  context_id?: string;
  chat_type?: string;
  sender_name?: string;
  /** Job body / command (like crontab command). Executed as the LLM instruction when the job fires. */
  prompt?: string;
  lastRunMinuteStamp?: string;
  running?: boolean;
  lastStatus?: string;
  lastError?: string;
  runHistory?: CronRunRecord[];
  /** Optional persistence hook (e.g. writes run history to the DB). */
  onRunComplete?: (status: string, error: string | null, durationMs: number) => void;
}

/** Built-in system jobs that do not run as chat prompts. */
export const SYSTEM_CRON_IDS = new Set([
  'memory-consolidation',
  'heartbeat',
]);

export function isSystemCronTask(id: string | undefined | null): boolean {
  if (!id) return false;
  return SYSTEM_CRON_IDS.has(id) || id.startsWith('file_auto_') || id.startsWith('fa_');
}

/**
 * Pick the stored job command from API/tool args.
 * Accepts common aliases so agent tools can pass command/instruction/message.
 */
export function extractCronPromptFromArgs(args: Record<string, any> | null | undefined): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  for (const key of ['prompt', 'command', 'instruction', 'message', 'body', 'job', 'script']) {
    if (typeof args[key] === 'string') return args[key];
  }
  return undefined;
}

/**
 * Resolve the instruction to run when a cron fires.
 * Model mirrors classic cron: schedule + command (prompt).
 * Priority: explicit prompt → legacy action text → job name as command.
 * ALWAYS frames Yui as the ACTIVE INITIATOR (not a responder), and keeps the
 * stored command as the actionable "job command" — otherwise the LLM replies as
 * if the user had just messaged it (wrong perspective, wrong language match).
 */
export function resolveCronJobPrompt(opts: {
  id?: string;
  name?: string;
  prompt?: string | null;
  action?: string | null;
}): string {
  const explicit = (opts.prompt || '').trim();
  const legacy = typeof opts.action === 'string' ? opts.action.trim() : '';
  const command = explicit || (legacy && !legacy.startsWith('function') && !legacy.startsWith('()') ? legacy : '') || (opts.name || 'Scheduled job').trim();

  return injectCharacterName([
    '[SCHEDULED_JOB]',
    `Job: ${(opts.name || 'Scheduled job').trim()}`,
    '',
    'This is a scheduled cron job firing on its own in the background. You (${characterName}) are the ACTIVE INITIATOR of this action, not a responder.',
    'The user below did NOT just message you — do NOT act as if they did, do NOT acknowledge a greeting, and do NOT ask why they contacted you.',
    'Execute the job command fully and autonomously, speaking as the proactive sender to the addressed user.',
    'Match the language of the addressed user (the user named in the task). When their language is unknown, use your own default language.',
    'Deliver a complete, useful result to the user on this channel — do not only acknowledge the schedule.',
    '',
    `Job command: ${command}`
  ].join('\n'));
}

/**
 * Normalize prompt before save so cognitive jobs never store an empty command.
 * System jobs keep an empty prompt (they use internal handlers).
 */
export function normalizeCronPromptForSave(opts: {
  id?: string;
  name?: string;
  prompt?: string | null;
  action?: string | null;
  isNew?: boolean;
}): string {
  if (isSystemCronTask(opts.id)) return (opts.prompt || '').trim();

  const explicit = (opts.prompt || '').trim();
  if (explicit) return explicit;

  const legacy = typeof opts.action === 'string' ? opts.action.trim() : '';
  if (legacy && !legacy.startsWith('function') && !legacy.startsWith('()')) {
    return legacy;
  }

  const name = (opts.name || '').trim();
  if (!name) return '';

  // Persist name as the job command so list/edit UIs show the real payload
  // (same spirit as crontab storing the command line, not only a label).
  return name;
}

export function isValidIanaTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset hours (UTC vs wall clock) of an IANA timezone at a given moment. */
export function getTzOffsetInIana(tz: string, date?: Date): number {
  const d = date || new Date();
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(d)) parts[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return (asUtc - d.getTime()) / 3600000;
  } catch {
    return getTzOffsetHours();
  }
}

/**
 * Parse an absolute (one-shot) datetime schedule.
 * Accepts `YYYY-MM-DD[T ]HH:MM[:SS]` with optional IANA tz in the parenthesized
 * part of the original schedule string. Explicit offsets (Z, +07:00) are honored;
 * naive datetimes are interpreted in the given tz or the user's default local offset.
 */
export function parseAbsoluteSchedule(body: string, tz?: string): number | null {
  const clean = body.trim().replace(/\s+/g, ' ');

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(clean)) {
    const ms = Date.parse(clean.replace(' ', 'T'));
    return Number.isFinite(ms) ? ms : null;
  }

  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const offsetHours = tz ? getTzOffsetInIana(tz) : getTzOffsetHours();
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)) - offsetHours * 3600000;
}

export type CronScheduleKind =
  | { kind: 'relative'; ms: number }
  | { kind: 'at'; atMs: number; tz?: string }
  | { kind: 'cron'; expr: string; tz?: string };

/**
 * Parse a schedule string into a concrete schedule kind.
 * Supported forms:
 *  - relative:  `5m`, `30s`, `2h`, `1d`
 *  - absolute:  `@at 2026-08-07T09:00:00`, `at 2026-08-07 09:00`, or a bare ISO datetime
 *  - cron:      `0 9 * * *` with optional IANA tz suffix `(Asia/Jakarta)` or `TZ=Asia/Jakarta ...`
 */
export function parseCronSchedule(schedule: string): CronScheduleKind | null {
  const raw = schedule.trim();
  if (!raw) return null;

  let body = raw;
  let tz: string | undefined;

  const tzPrefix = body.match(/^TZ\s*=\s*([A-Za-z_\-/]+)\s+(.+)$/);
  if (tzPrefix) {
    const maybeTz = tzPrefix[1].trim();
    if (isValidIanaTz(maybeTz)) {
      tz = maybeTz;
      body = tzPrefix[2].trim();
    }
  }

  const tzSuffix = body.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (tzSuffix && !tz) {
    const maybeTz = tzSuffix[2].trim();
    if (isValidIanaTz(maybeTz)) {
      tz = maybeTz;
      body = tzSuffix[1].trim();
    }
  }

  const atMatch = body.match(/^(?:@at|at)\s+(.+)$/i);
  if (atMatch) {
    body = atMatch[1].trim();
    const atMs = parseAbsoluteSchedule(body, tz);
    return { kind: 'at', atMs: atMs ?? Date.now(), tz };
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(body)) {
    const atMs = parseAbsoluteSchedule(body, tz);
    if (atMs !== null) return { kind: 'at', atMs, tz };
  }

  const rel = body.match(/^(\d+)([smhd])$/i);
  if (rel) {
    const value = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const ms = ({ s: 1000, m: 60000, h: 3600000, d: 86400000 } as Record<string, number>)[unit] * value;
    return { kind: 'relative', ms };
  }

  return { kind: 'cron', expr: body, tz };
}

/**
 * Absolute epoch-ms fire time for one-shot schedules, or null for repeating /
 * standard cron expressions. Used to persist one-off targets so their countdown
 * survives daemon restarts:
 *  - relative `5m`  → Date.now() + ms (target captured at creation)
 *  - `at`/ISO time  → the absolute timestamp itself
 */
export function getOneShotFireAtMs(schedule: string): number | null {
  const parsed = parseCronSchedule(schedule);
  if (!parsed) return null;
  if (parsed.kind === 'relative') return Date.now() + parsed.ms;
  if (parsed.kind === 'at') return parsed.atMs;
  return null;
}

/** Wall clock parts for the current moment in a given tz (or the user's default local offset). */
function currentClockParts(tz?: string): Date {
  if (tz) {
    return toLocalClock(getTzOffsetInIana(tz));
  }
  return toLocalClock(getTzOffsetHours());
}

export class CronModule {
  private static instance: CronModule;
  private tasks: Map<string, CronTask> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): CronModule {
    if (!CronModule.instance) {
      CronModule.instance = new CronModule();
    }
    return CronModule.instance;
  }

  public registerTask(task: CronTask) {
    this.stopTask(task.id);
    this.tasks.set(task.id, task);
    if (task.enabled) {
      this.startTask(task.id);
    }
  }

  public startTask(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;

    this.stopTask(id);

    const parsed = parseCronSchedule(task.schedule);

    if (parsed && parsed.kind === 'relative') {
      if (task.repeating) {
        const interval = setInterval(() => this.runTask(task), parsed.ms);
        this.intervals.set(id, interval as any);
        console.log(`[CRON] Repeating Interval Task started: ${task.name} (every ${parsed.ms}ms)`);
      } else {
        // Persisted absolute target (survives restarts); fallback to relative from now.
        const fireAt = typeof task.fire_at === 'number' && task.fire_at > 0
          ? task.fire_at
          : Date.now() + parsed.ms;
        const delay = Math.max(0, fireAt - Date.now());
        const timeout = setTimeout(() => this.runTask(task, { oneShot: true }), delay);
        this.intervals.set(id, timeout as any);
        console.log(`[CRON] One-off Delay Task started: ${task.name} (triggers in ${delay}ms, fire_at=${new Date(fireAt).toISOString()})`);
      }
      return;
    }

    if (parsed && parsed.kind === 'at') {
      const delay = Math.max(0, parsed.atMs - Date.now());
      const timeout = setTimeout(() => this.runTask(task, { oneShot: true }), delay);
      this.intervals.set(id, timeout as any);
      console.log(`[CRON] Absolute One-shot Task started: ${task.name} (at ${new Date(parsed.atMs).toISOString()}${parsed.tz ? ` / ${parsed.tz}` : ''}, in ${delay}ms)`);
      return;
    }

    if (!parsed || parsed.kind !== 'cron') {
      console.warn(`[CRON] Unparseable schedule '${task.schedule}' for ${task.name} — task not scheduled.`);
      return;
    }

    const tz = parsed.tz;
    const interval = setInterval(async () => {
      const now = currentClockParts(tz);
      const currentMinuteStamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

      if (task.lastRunMinuteStamp === currentMinuteStamp) {
        return;
      }

      const matchCronField = (value: number, pattern: string): boolean => {
        if (pattern === '*') return true;
        const stepMatch = pattern.match(/^\*\/(\d+)$/);
        if (stepMatch) {
          return value % parseInt(stepMatch[1], 10) === 0;
        }
        const rangeStepMatch = pattern.match(/^(\d+)-(\d+)\/(\d+)$/);
        if (rangeStepMatch) {
          const start = parseInt(rangeStepMatch[1], 10);
          const end = parseInt(rangeStepMatch[2], 10);
          const step = parseInt(rangeStepMatch[3], 10);
          return value >= start && value <= end && (value - start) % step === 0;
        }
        if (pattern.includes(',')) {
          return pattern.split(',').some((part) => matchCronField(value, part));
        }
        const rangeMatch = pattern.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = parseInt(rangeMatch[2], 10);
          return value >= start && value <= end;
        }
        return parseInt(pattern, 10) === value;
      };

      const parts = parsed.expr.trim().split(/\s+/);
      if (parts.length === 0) return;
      const isMatched = (
        matchCronField(now.getMinutes(), parts[0] || '*') &&
        matchCronField(now.getHours(), parts[1] || '*') &&
        matchCronField(now.getDate(), parts[2] || '*') &&
        matchCronField(now.getMonth() + 1, parts[3] || '*') &&
        matchCronField(now.getDay(), parts[4] || '*')
      );

      if (isMatched) {
        task.lastRunMinuteStamp = currentMinuteStamp;
        await this.runTask(task);
      }
    }, 20000);

    this.intervals.set(id, interval as any);
    console.log(`[CRON] Standard Cron Task started: ${task.name} (${parsed.expr}${tz ? ` / ${tz}` : ''})`);
  }

  private async runTask(task: CronTask, opts?: { oneShot?: boolean }): Promise<void> {
    if (task.running) {
      console.warn(`[CRON] Task ${task.name} is still running from previous trigger. Skipping overlapping execution.`);
      return;
    }
    task.running = true;
    const start = Date.now();
    let status = 'ok';
    let error: string | null = null;
    try {
      await task.action();
    } catch (e: any) {
      status = 'error';
      error = e?.message || String(e);
      console.error(`[CRON] Task ${task.name} failed:`, e);
    } finally {
      task.running = false;
      const durationMs = Date.now() - start;
      task.lastRun = start;
      task.lastStatus = status;
      task.lastError = error;
      task.runHistory = [...(task.runHistory || []).slice(-19), { runAt: start, status, durationMs, error }];
      try {
        task.onRunComplete?.(status, error, durationMs);
      } catch (persistErr: any) {
        console.warn('[CRON] Failed to persist run record:', persistErr.message);
      }
      if (opts?.oneShot) {
        this.removeTask(task.id);
      }
    }
  }

  public stopTask(id: string) {
    const existing = this.intervals.get(id);
    if (existing) {
      clearInterval(existing);
      this.intervals.delete(id);
    }
  }

  public removeTask(id: string) {
    this.stopTask(id);
    this.tasks.delete(id);
  }

  public getTasks(): CronTask[] {
    return Array.from(this.tasks.values());
  }
}
