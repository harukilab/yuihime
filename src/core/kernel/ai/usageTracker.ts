import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { expandHomePath } from '../../systemPaths.js';
import { cleanupLogs } from '../../fileLogger.js';

// Daily per-provider token/quota usage tracker.
//
// Rotation is anchored to the ABSOLUTE UTC calendar day (00:00 UTC), NOT a
// relative TTL — so a daemon restart mid-day never loses or resets the day's
// counters. Each request appends one NDJSON line to
//   logs/usage.YYYY-MM-DD.log
// and the running totals / averages (avg RPM, avg TPM) are mirrored to
//   logs/usage.YYYY-MM-DD.summary.log
// On rollover the previous day is finalized into its summary file. Hydration
// re-reads the current day's file at boot so counters survive restarts.

const LOG_DIR = path.join(expandHomePath(process.env.YUIHIME_SYSTEM_ROOT || path.join(os.homedir(), '.yuihime')), 'logs');

export interface UsageAttempt {
  provider: string;
  model: string;
  ok: boolean;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Provider-reported cached (context-cache hit) tokens — cache makes the
      provider's own numbers the authoritative reference. */
  cachedTokens?: number;
  /** True when token counts come straight from the provider's usageMetadata. */
  fromProvider?: boolean;
  errorType?: string;
  /** Subtype tag e.g. 'chat' | 'toolcal' | 'grounding' — optional. */
  kind?: string;
  /** Full API key — stored masked (first6...last4) so per-account usage is
      auditable without leaking secrets. */
  apiKey?: string;
  ts?: number;
}

interface DayStats {
  date: string;
  total: number;
  success: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  firstTs: number;
  lastTs: number;
}

let current: DayStats | null = null;

function utcDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayStartMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function requestLogPath(date: string): string {
  ensureDir();
  return path.join(LOG_DIR, `usage.${date}.log`);
}

function summaryLogPath(date: string): string {
  ensureDir();
  return path.join(LOG_DIR, `usage.${date}.summary.log`);
}

function ensureDir(): void {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
}

/** Parse token counts from either Gemini usageMetadata or OpenAI-style usage. */
export function usageTokensFromMetadata(um: any): { promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens: number } {
  const promptTokens = um?.promptTokenCount ?? um?.prompt_tokens ?? 0;
  const completionTokens = um?.candidatesTokenCount ?? um?.candidates_tokens ?? um?.completion_tokens ?? 0;
  const totalTokens = um?.totalTokenCount ?? um?.total_tokens ?? (promptTokens + completionTokens);
  const cachedTokens = um?.cachedContentTokenCount ?? um?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    promptTokens: Number(promptTokens) || 0,
    completionTokens: Number(completionTokens) || 0,
    totalTokens: Number(totalTokens) || (Number(promptTokens) || 0) + (Number(completionTokens) || 0),
    cachedTokens: Number(cachedTokens) || 0
  };
}

/** Coarse classification of a failure body into a stable bucket. */
export function classifyUsageError(body: string): string {
  const b = (body || '').toLowerCase();
  if (b.includes('429') || b.includes('quota') || b.includes('rate limit') || b.includes('exhausted')) return 'quota';
  if (b.includes('503') || b.includes('overloaded') || b.includes('unavailable')) return 'overload';
  if (b.includes('401') || b.includes('403') || b.includes('api key')) return 'auth';
  if (b.includes('404') || b.includes('not found') || b.includes('no longer available')) return 'model';
  if (b.includes('timeout') || b.includes('abort')) return 'timeout';
  if (b.includes('fetch failed') || b.includes('econnreset') || b.includes('socket') || b.includes('network')) return 'network';
  if (b.includes('truncat')) return 'truncated';
  return 'other';
}

/** Mask a key for audit logs: first6...last4. Short/empty keys are fully masked. */
export function maskApiKey(raw?: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length <= 10) return '••••';
  return `${t.slice(0, 6)}...${t.slice(-4)}`;
}

function hydrate(date: string): DayStats {
  const stats: DayStats = { date, total: 0, success: 0, failed: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, firstTs: 0, lastTs: 0 };
  try {
    const p = path.join(LOG_DIR, `usage.${date}.log`);
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.type !== 'request') continue;
          stats.total++;
          if (e.ok) {
            stats.success++;
            stats.promptTokens += e.promptTokens || 0;
            stats.completionTokens += e.completionTokens || 0;
            stats.totalTokens += e.totalTokens || 0;
            stats.cachedTokens += e.cachedTokens || 0;
          } else {
            stats.failed++;
          }
          if (!stats.firstTs || e.ts < stats.firstTs) stats.firstTs = e.ts;
          if (e.ts > stats.lastTs) stats.lastTs = e.ts;
        } catch {}
      }
    }
  } catch {}
  return stats;
}

function writeSummary(stats: DayStats): void {
  try {
    const nowTs = stats.lastTs || Date.now();
    const minutes = Math.max(1, (nowTs - dayStartMs(stats.date)) / 60000);
    const summary = {
      type: 'summary',
      date: stats.date,
      totalRequests: stats.total,
      success: stats.success,
      failed: stats.failed,
      successRate: stats.total ? Math.round((stats.success / stats.total) * 1000) / 10 : 0,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      totalTokens: stats.totalTokens,
      cachedTokens: stats.cachedTokens,
      avgRpm: Math.round((stats.total / minutes) * 100) / 100,
      avgTpm: Math.round((stats.totalTokens / minutes) * 100) / 100,
      minutesElapsed: Math.round(minutes * 100) / 100,
      firstRequestTs: stats.firstTs || null,
      lastRequestTs: stats.lastTs || null,
      updatedAt: Date.now()
    };
    ensureDir();
    writeFileSync(summaryLogPath(stats.date), JSON.stringify(summary) + '\n', 'utf8');
  } catch {}
}

/** Record one provider HTTP attempt (success or failure). Never throws. */
export function recordUsage(attempt: UsageAttempt): void {
  try {
    const ts = attempt.ts || Date.now();
    const date = utcDateKey(ts);
    if (!current || current.date !== date) {
      if (current) {
        writeSummary(current);
        try { cleanupLogs('usage'); } catch {}
      }
      current = hydrate(date);
    }
    current.total++;
    if (attempt.ok) {
      current.success++;
      current.promptTokens += attempt.promptTokens || 0;
      current.completionTokens += attempt.completionTokens || 0;
      current.totalTokens += attempt.totalTokens || 0;
      current.cachedTokens += attempt.cachedTokens || 0;
    } else {
      current.failed++;
    }
    if (!current.firstTs || ts < current.firstTs) current.firstTs = ts;
    if (ts > current.lastTs) current.lastTs = ts;

    const entry = {
      type: 'request',
      ts,
      provider: attempt.provider,
      model: attempt.model,
      keyId: maskApiKey(attempt.apiKey),
      ok: attempt.ok,
      kind: attempt.kind || null,
      latencyMs: attempt.latencyMs ?? null,
      promptTokens: attempt.ok ? (attempt.promptTokens ?? null) : null,
      completionTokens: attempt.ok ? (attempt.completionTokens ?? null) : null,
      totalTokens: attempt.ok ? (attempt.totalTokens ?? null) : null,
      cachedTokens: attempt.ok ? (attempt.cachedTokens ?? null) : null,
      fromProvider: attempt.ok ? (attempt.fromProvider === true) : null,
      errorType: attempt.ok ? null : (attempt.errorType ?? 'unknown')
    };
    appendFileSync(requestLogPath(date), JSON.stringify(entry) + '\n', 'utf8');
    writeSummary(current);
  } catch {}
}

/** Read the live (or hydrated) totals for a UTC day. */
export function getDailyUsage(date?: string): DayStats {
  const key = date || utcDateKey(Date.now());
  return current && current.date === key ? current : hydrate(key);
}

/** Finalize the current day's summary (call on graceful shutdown). */
export function flushUsageSummary(): void {
  if (current) {
    writeSummary(current);
    current = null;
  }
}
