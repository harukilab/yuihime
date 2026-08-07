export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLevel(level: LogLevel) {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  log(level: string, context: string, msg: string, ...args: any[]) {
    if (context === 'REGISTRY' && (level === 'INFO' || level === 'DEBUG')) {
      return;
    }
    const lvl = (LogLevel as any)[level] || LogLevel.INFO;
    if (lvl >= this.level) {
      const formatted = `[${level}][${context}] ${msg}`;
      // Dispatch by severity so the global color scheme (error=red, warn=yellow,
      // info=cyan) stays consistent regardless of which logger entry is used.
      if (lvl >= LogLevel.ERROR) console.error(formatted, ...args);
      else if (lvl >= LogLevel.WARN) console.warn(formatted, ...args);
      else console.log(formatted, ...args);
    }
  }

  debug(msg: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) console.debug(`[DEBUG] ${msg}`, ...args);
  }

  info(msg: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) console.log(`[INFO] ${msg}`, ...args);
  }

  warn(msg: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) console.warn(`[WARN] ${msg}`, ...args);
  }

  error(msg: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) console.error(`[ERROR] ${msg}`, ...args);
  }
}

export const logger = Logger.getInstance();
