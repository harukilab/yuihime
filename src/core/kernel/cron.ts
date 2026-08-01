import { getTzOffsetHours, toLocalClock } from '../utils/dualClock.js';

export interface CronTask {
  id: string;
  name: string;
  schedule: string;
  action: () => Promise<void>;
  enabled: boolean;
  repeating: boolean;
  lastRun?: number;
  nextRun?: number;
  context_id?: string;
  chat_type?: string;
  sender_name?: string;
  /** Job body / command (like crontab command). Executed as the LLM instruction when the job fires. */
  prompt?: string;
  lastRunMinuteStamp?: string;
  running?: boolean;
}

/** Built-in system jobs that do not run as chat prompts. */
export const SYSTEM_CRON_IDS = new Set([
  'memory-consolidation',
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
 */
export function resolveCronJobPrompt(opts: {
  id?: string;
  name?: string;
  prompt?: string | null;
  action?: string | null;
}): string {
  const explicit = (opts.prompt || '').trim();
  if (explicit) return explicit;

  const legacy = typeof opts.action === 'string' ? opts.action.trim() : '';
  if (legacy && !legacy.startsWith('function') && !legacy.startsWith('()')) {
    return legacy;
  }

  const name = (opts.name || 'Scheduled job').trim();
  return [
    '[SCHEDULED_JOB]',
    `Job: ${name}`,
    '',
    'This is a scheduled cron job firing in the background. Execute the request described by the job name fully and autonomously.',
    'If the job name refers to periodic checks, system maintenance, or background tasks, perform them completely using available tools and internal systems.',
    'Deliver a complete, useful result to the user on this channel — do not only acknowledge the schedule.',
  ].join('\n');
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

  private parseScheduleToMs(schedule: string): number | null {
    const match = schedule.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return null;
    }
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

    // Support relative parsed intervals (e.g. 5m, 30s)
    const ms = this.parseScheduleToMs(task.schedule);
    if (ms !== null) {
      if (task.repeating) {
        const interval = setInterval(async () => {
          if (task.running) {
            console.warn(`[CRON] Task ${task.name} is still running from previous trigger. Skipping overlapping execution.`);
            return;
          }
          task.running = true;
          try {
            await task.action();
            task.lastRun = Date.now();
          } catch (e) {
            console.error(`[CRON] Task ${task.name} failed:`, e);
          } finally {
            task.running = false;
          }
        }, ms);
        this.intervals.set(id, interval);
        console.log(`[CRON] Repeating Interval Task started: ${task.name} (every ${ms}ms)`);
      } else {
        const timeout = setTimeout(async () => {
          if (task.running) {
            console.warn(`[CRON] Task ${task.name} is still running. Skipping overlapping execution.`);
            return;
          }
          task.running = true;
          try {
            await task.action();
            task.lastRun = Date.now();
          } catch (e) {
            console.error(`[CRON] Task ${task.name} failed:`, e);
          } finally {
            task.running = false;
            this.removeTask(id);
          }
        }, ms);
        this.intervals.set(id, timeout as any);
        console.log(`[CRON] One-off Delay Task started: ${task.name} (triggers in ${ms}ms)`);
      }
      return;
    }

    // Fallback basic cron scheduler: check every 20 seconds to prevent drift/misses
    const interval = setInterval(async () => {
      // Evaluasi jadwal memakai WAKTU LOKAL user (circadian-rhythm.timezoneOffsetHours),
      // sehingga cron chan (mis. "0 8 * * *") ikut waktu user, bukan server UTC.
      const now = toLocalClock(getTzOffsetHours());
      const currentMinuteStamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      
      if (task.lastRunMinuteStamp === currentMinuteStamp) {
        return; // Already executed during this minute
      }
      
      const matchCronField = (value: number, pattern: string, rangeMin: number, rangeMax: number): boolean => {
        if (pattern === '*') return true;
        
        // Handle steps like */5
        const stepMatch = pattern.match(/^\*\/(\d+)$/);
        if (stepMatch) {
          const step = parseInt(stepMatch[1], 10);
          return value % step === 0;
        }
        
        // Handle range step like 0-30/5
        const rangeStepMatch = pattern.match(/^(\d+)-(\d+)\/(\d+)$/);
        if (rangeStepMatch) {
          const start = parseInt(rangeStepMatch[1], 10);
          const end = parseInt(rangeStepMatch[2], 10);
          const step = parseInt(rangeStepMatch[3], 10);
          return value >= start && value <= end && (value - start) % step === 0;
        }

        // Handle lists like 1,2,5
        if (pattern.includes(',')) {
          const parts = pattern.split(',');
          return parts.some(part => matchCronField(value, part, rangeMin, rangeMax));
        }

        // Handle ranges like 1-5
        const rangeMatch = pattern.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = parseInt(rangeMatch[2], 10);
          return value >= start && value <= end;
        }

        // Exact value
        const exact = parseInt(pattern, 10);
        return exact === value;
      };

      const parts = task.schedule.trim().split(/\s+/);
      let isMatched = false;

      if (parts.length > 0) {
        const minutePattern = parts[0] || '*';
        const hourPattern = parts[1] || '*';
        const dayOfMonthPattern = parts[2] || '*';
        const monthPattern = parts[3] || '*';
        const dayOfWeekPattern = parts[4] || '*';

        const minute = now.getMinutes();
        const hour = now.getHours();
        const dayOfMonth = now.getDate();
        const month = now.getMonth() + 1; // 1-12
        const dayOfWeek = now.getDay(); // 0-6

        isMatched = (
          matchCronField(minute, minutePattern, 0, 59) &&
          matchCronField(hour, hourPattern, 0, 23) &&
          matchCronField(dayOfMonth, dayOfMonthPattern, 1, 31) &&
          matchCronField(month, monthPattern, 1, 12) &&
          matchCronField(dayOfWeek, dayOfWeekPattern, 0, 6)
        );
      }

      if (isMatched) {
        if (task.running) {
          console.warn(`[CRON] Task ${task.name} is still running from previous trigger. Skipping overlapping execution.`);
          return;
        }
        task.lastRunMinuteStamp = currentMinuteStamp;
        task.running = true;
        try {
          await task.action();
          task.lastRun = Date.now();
        } catch (e) {
          console.error(`[CRON] Task ${task.name} failed:`, e);
        } finally {
          task.running = false;
        }
      }
    }, 20000); // Check every 20 seconds

    this.intervals.set(id, interval);
    console.log(`[CRON] Standard Cron Task started: ${task.name} (${task.schedule})`);
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
