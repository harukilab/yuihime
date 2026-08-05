import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { expandHomePath } from './systemPaths.js';

const RETENTION_DAYS = 7; // Same as chat_logs: rotation & retention per date
const CLEANUP_INTERVAL_MS = 3600_000; // Cleanup at most once per hour

const DEFAULT_LOG_DIR = path.join(expandHomePath(process.env.YUIHIME_SYSTEM_ROOT || path.join(os.homedir(), '.yuihime')), 'logs');

function ensureLogDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function logPath(category: string, baseDir?: string) {
  const dir = baseDir || DEFAULT_LOG_DIR;
  ensureLogDir(dir);
  return path.join(dir, `${category}.log`);
}

function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Daily rotation: if the active file was written on a previous date,
 * archive it as <category>.<YYYY-MM-DD>.log then start a new file.
 */
function rotateIfDateChanged(category: string, baseDir?: string) {
  const dir = baseDir || DEFAULT_LOG_DIR;
  const p = path.join(dir, `${category}.log`);
  try {
    if (!existsSync(p)) return;
    const mtime = statSync(p).mtime;
    const today = dateKey(new Date());
    const fileDate = dateKey(mtime);
    if (fileDate === today) return;
    const dest = path.join(dir, `${category}.${fileDate}.log`);
    if (existsSync(dest)) {
      // An archive for the same date already exists — merge so no data is lost.
      try {
        const current = readFileSync(p, 'utf8');
        appendFileSync(dest, current, 'utf8');
      } catch {}
      unlinkSync(p);
    } else {
      renameSync(p, dest);
    }
  } catch (e) {
    try { console.warn('[FILE_LOGGER] daily rotation failed:', e?.message || e); } catch {}
  }
}

const lastCleanup = new Map<string, number>();

/**
 * Remove log archives (<category>.<YYYY-MM-DD>.log and <category>.log.<ts>.rot)
 * older than RETENTION_DAYS. Throttled to at most once per hour per directory.
 */
export function cleanupLogs(category?: string, baseDir?: string, force?: boolean): void {
  const dir = baseDir || DEFAULT_LOG_DIR;
  try {
    if (!existsSync(dir)) return;
    const now = Date.now();
    if (!force && now - (lastCleanup.get(dir) || 0) < CLEANUP_INTERVAL_MS) return;
    lastCleanup.set(dir, now);

    const cutoffMs = now - RETENTION_DAYS * 86400000;
    const files = readdirSync(dir);
    for (const file of files) {
      const isActive = category ? file === `${category}.log` : file.endsWith('.log') && !file.includes('.');
      if (category && !file.startsWith(`${category}.`)) continue;
      if (isActive) continue; // active file, not an archive
      // Daily archive pattern: <category>.<YYYY-MM-DD>.log
      const m = file.match(/^(.+?)\.(\d{4}-\d{2}-\d{2})\.log$/);
      if (m) {
        const fileTs = new Date(`${m[2]}T00:00:00`).getTime();
        if (!isNaN(fileTs) && fileTs < cutoffMs) {
          try { unlinkSync(path.join(dir, file)); } catch {}
        }
        continue;
      }
      // .rot pattern: <category>.log.<ts>.rot
      const r = file.match(/^.+?\.log\.(\d+)\.rot$/);
      if (r) {
        const ts = Number(r[1]);
        if (!isNaN(ts) && ts < cutoffMs) {
          try { unlinkSync(path.join(dir, file)); } catch {}
        }
      }
    }
  } catch (e) {
    try { console.warn('[FILE_LOGGER] cleanup failed:', e?.message || e); } catch {}
  }
}

export function appendLog(category: string, obj: any, baseDir?: string) {
  try {
    rotateIfDateChanged(category, baseDir);
    const p = logPath(category, baseDir);
    const entry = JSON.stringify({ ts: Date.now(), ...obj });
    // Append newline-delimited JSON
    appendFileSync(p, entry + '\n', 'utf8');
    cleanupLogs(category, baseDir);
  } catch (e) {
    // Swallow - logging should not crash the service
    try { console.warn('[FILE_LOGGER] append failed:', e?.message || e); } catch {}
  }
}

export function readLogLines(category: string, opts?: { limit?: number; tail?: boolean; baseDir?: string; includeArchives?: boolean }) {
  try {
    const dir = opts?.baseDir || DEFAULT_LOG_DIR;
    const p = path.join(dir, `${category}.log`);
    const content = existsSync(p) ? readFileSync(p, 'utf8') : '';
    const activeLines = content.split(/\r?\n/).filter(Boolean);

    let lines: string[] = [];

    // Merge the daily archives (oldest → newest, then the active file last)
    // so the previous days remain visible.
    if (opts?.includeArchives && existsSync(dir)) {
      const files = readdirSync(dir)
        .filter(f => {
          const m = f.match(/^(.+?)\.(\d{4}-\d{2}-\d{2})\.log$/);
          return m && m[1] === category;
        })
        .sort();
      for (const f of files) {
        lines.push(...readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean));
      }
    }
    lines.push(...activeLines);

    if (!opts || !opts.limit) return lines.slice(-1000);
    if (opts.tail) return lines.slice(-opts.limit);
    return lines.slice(0, opts.limit);
  } catch (e) {
    return [];
  }
}

export function rotateLog(category: string, archiveSuffix?: string, baseDir?: string) {
  const p = logPath(category, baseDir);
  try {
    if (!existsSync(p)) return null;
    const stat = statSync(p);
    const ts = archiveSuffix || Date.now().toString();
    const dest = p + '.' + ts + '.rot';
    renameSync(p, dest);
    return dest;
  } catch (e) {
    return null;
  }
}

export const DEFAULT_LOG_DIR_PATH = DEFAULT_LOG_DIR;
