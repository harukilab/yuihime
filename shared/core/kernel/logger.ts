enum LogLevel {
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

  log(level: string, context: string, msg: string, ...args: any[]) {
    if (typeof window !== 'undefined' && context === 'REGISTRY' && (level === 'INFO' || level === 'DEBUG')) {
      return; // Do not send verbose registry logs to the browser console
    }
    const lvl = (LogLevel as any)[level] || LogLevel.INFO;
    if (lvl >= this.level) {
      console.log(`[${level}][${context}] ${msg}`, ...args);
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
