import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";

export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

const levelPriority: Record<Level, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const KEEP = 10;
let currentLevel: Level = "INFO";

function shouldLog(input: Level): boolean {
  return levelPriority[input] >= levelPriority[currentLevel];
}

export interface Logger {
  debug(message?: any, extra?: Record<string, any>): void;
  info(message?: any, extra?: Record<string, any>): void;
  error(message?: any, extra?: Record<string, any>): void;
  warn(message?: any, extra?: Record<string, any>): void;
  tag(key: string, value: string): Logger;
  clone(): Logger;
  time(message: string, extra?: Record<string, any>): { stop(): void };
}

let writeFn: (msg: string) => void = (msg) => process.stderr.write(msg);

function formatError(error: Error, depth = 0): string {
  const result = error.message;
  return error.cause instanceof Error && depth < 10
    ? result + " Caused by: " + formatError(error.cause, depth + 1)
    : result;
}

let last = Date.now();

function build(tags: Record<string, any>, message: any, extra?: Record<string, any>) {
  const merged = { ...tags, ...extra };
  const prefix = Object.entries(merged)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (value instanceof Error) return `${key}=${formatError(value)}`;
      if (typeof value === "object") return `${key}=${JSON.stringify(value)}`;
      return `${key}=${value}`;
    })
    .join(" ");
  const now = new Date();
  const diff = now.getTime() - last;
  last = now.getTime();
  return [now.toISOString().split(".")[0], `+${diff}ms`, prefix, message].filter(Boolean).join(" ") + "\n";
}

export function create(tags?: Record<string, any>): Logger {
  tags = tags || {};
  const service = tags["service"];

  const result: Logger = {
    debug(message?: any, extra?: Record<string, any>) {
      if (shouldLog("DEBUG")) writeFn("DEBUG " + build(tags, message, extra));
    },
    info(message?: any, extra?: Record<string, any>) {
      if (shouldLog("INFO")) writeFn("INFO  " + build(tags, message, extra));
    },
    error(message?: any, extra?: Record<string, any>) {
      if (shouldLog("ERROR")) writeFn("ERROR " + build(tags, message, extra));
    },
    warn(message?: any, extra?: Record<string, any>) {
      if (shouldLog("WARN")) writeFn("WARN  " + build(tags, message, extra));
    },
    tag(key: string, value: string) {
      if (tags) tags[key] = value;
      return result;
    },
    clone() {
      return create({ ...tags });
    },
    time(message: string, extra?: Record<string, any>) {
      const now = Date.now();
      result.info(message, { status: "started", ...extra });
      return {
        stop() {
          result.info(message, { status: "completed", duration: Date.now() - now, ...extra });
        },
      };
    },
  };

  return result;
}

export const Default = create({ service: "default" });

export function setLevel(level: Level) {
  currentLevel = level;
}

export async function initFileLogging(logDir: string, options?: { maxSize?: string; maxFiles?: number }) {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${new Date().toISOString().split(".")[0].replace(/:/g, "")}.log`);
  const fd = await fs.open(logFile, "a");
  writeFn = (msg: string) => fd.write(msg);
}
