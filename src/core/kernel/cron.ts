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
  lastRunMinuteStamp?: string;
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
          try {
            await task.action();
            task.lastRun = Date.now();
          } catch (e) {
            console.error(`[CRON] Task ${task.name} failed:`, e);
          }
        }, ms);
        this.intervals.set(id, interval);
        console.log(`[CRON] Repeating Interval Task started: ${task.name} (every ${ms}ms)`);
      } else {
        const timeout = setTimeout(async () => {
          try {
            await task.action();
            task.lastRun = Date.now();
          } catch (e) {
            console.error(`[CRON] Task ${task.name} failed:`, e);
          } finally {
            // Stop and clean up the non-repeating task
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
      const now = new Date();
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
        task.lastRunMinuteStamp = currentMinuteStamp;
        try {
          await task.action();
          task.lastRun = Date.now();
        } catch (e) {
          console.error(`[CRON] Task ${task.name} failed:`, e);
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
