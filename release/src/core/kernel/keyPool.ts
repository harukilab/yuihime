/**
 * API Key Pool Manager
 *
 * Handles per-provider multi-key rotation with automatic cooldown on
 * quota / auth failures (429 rate-limit, 403 quota-exhausted, 401 invalid key).
 *
 * Per-pair design (the "one key, many models" case):
 *   Cooldowns are tracked per `key::model` pair, NOT per key alone. A single
 *   API key can serve many models, each with its own quota. A 429 on model-A
 *   therefore cools ONLY `key::model-A`, leaving `key::model-B` fully usable.
 *   The only exception is an auth error (invalid/revoked key) which cools the
 *   ENTIRE key across all models, since the key itself is broken.
 *
 * Design goals (per AGENTS.md modularity rules):
 *  - Self-contained: manages its own in-memory state, no cross-module edits.
 *  - Non-intrusive: a single-key / single-model setup behaves exactly as before.
 *  - Safe: a provider with zero usable pairs falls back to the primary key.
 *
 * Status: DEVELOPMENT — extendable (per-key quota counters, time-schedule, etc.)
 */

import { keyResetScheduler } from './keyResetScheduler.js';

interface CooldownEntry {
  until: number; // epoch ms when this key::model pair becomes usable again
  reason: string;
}

type ProviderKeyState = {
  keys: string[];
  primary: string;
  cursor: number; // round-robin pointer
  // Composite key: `${apiKey}::${modelId}`. Enables one key to serve many
  // models while each model's quota is cooled independently.
  cooldowns: Map<string, CooldownEntry>;
};

const pairKey = (key: string, model: string) => `${key}::${model || '*'}`;

export class ApiKeyPool {
  private static instance: ApiKeyPool;
  private pools: Map<string, ProviderKeyState> = new Map();

  // Default cooldown windows (ms). Auth errors cool down longer than rate limits.
  private static RATE_LIMIT_COOLDOWN = 60_000; // 1 min for 429
  private static QUOTA_COOLDOWN = 15 * 60_000; // 15 min for exhausted quota
  private static AUTH_COOLDOWN = 6 * 60 * 60_000; // 6 h for bad/revoked key

  public static getInstance(): ApiKeyPool {
    if (!ApiKeyPool.instance) {
      ApiKeyPool.instance = new ApiKeyPool();
    }
    return ApiKeyPool.instance;
  }

  /**
   * Register / refresh a provider's key set.
   * Accepts either a single `apiKey` or a `apiKeys` array.
   */
  public configure(providerId: string, config: any, settings: any = {}): void {
    const splitKeys = (raw: any): string[] => {
      if (!raw) return [];
      const src = Array.isArray(raw) ? raw.join('\n') : String(raw);
      return src.split(/[\n,;]+/).map((k: string) => k.trim()).filter((k: string) => k.length > 0 && !k.toLowerCase().includes('your_api_key'));
    };
    const single = splitKeys(config?.apiKey);
    const list = splitKeys(config?.apiKeys);
    const keys = Array.from(new Set([...list, ...single]));

    // Load reset rules (e.g. Google free tier resets at 00:00 UTC daily).
    try {
      keyResetScheduler.loadRules(providerId, settings);
    } catch (_) { /* rules optional */ }

    const existing = this.pools.get(providerId);
    if (!existing) {
      this.pools.set(providerId, {
        keys,
        primary: keys[0] ?? '',
        cursor: 0,
        cooldowns: new Map()
      });
    } else {
      // Preserve cooldown state across hot-reloads of settings.
      existing.keys = keys;
      if (keys.length > 0 && !keys.includes(existing.primary)) {
        existing.primary = keys[0];
      }
      // Drop cooldowns for keys that no longer exist (composite key prefix).
      for (const ck of Array.from(existing.cooldowns.keys())) {
        const ownerKey = ck.split('::')[0];
        if (!keys.includes(ownerKey)) existing.cooldowns.delete(ck);
      }
    }
  }

  /**
   * Returns the next usable key for a given provider + model via round-robin,
   * skipping `key::model` pairs currently under cooldown. Falls back to the
   * primary key if every pair is cooled down or no pool is configured.
   */
  public next(providerId: string, primaryKey: string, modelId: string = '*'): string {
    const pool = this.pools.get(providerId);
    if (!pool || pool.keys.length === 0) return primaryKey;

    // Rule-based reset: if a quota-reset schedule fired (e.g. 00:00 UTC daily),
    // clear all cooldowns so keys become fresh again.
    if (keyResetScheduler.shouldReset(providerId)) {
      if (pool.cooldowns.size > 0) {
        console.log(`[KEYPOOL] Provider ${providerId}: reset rule fired — clearing ${pool.cooldowns.size} cooled pair(s).`);
        pool.cooldowns.clear();
      }
    }

    const now = Date.now();
    const usable = pool.keys.filter((k) => {
      const cd = pool.cooldowns.get(pairKey(k, modelId));
      return !cd || cd.until <= now;
    });

    if (usable.length === 0) {
      // All pairs for this model cooled down — release the soonest and use it.
      const candidates = pool.keys.map((k) => ({ k, cd: pool.cooldowns.get(pairKey(k, modelId)) }));
      const cooled = candidates.filter((c) => c.cd && c.cd.until > now);
      const soonest = cooled.sort((a, b) => a.cd!.until - b.cd!.until)[0];
      if (soonest) pool.cooldowns.delete(pairKey(soonest.k, modelId));
      return soonest ? soonest.k : pool.primary;
    }

    // Round-robin over usable keys only.
    let idx = pool.cursor % usable.length;
    const chosen = usable[idx];
    pool.cursor = (pool.cursor + 1) % usable.length;
    return chosen;
  }

  /**
   * Report a failure for a specific key + model so the pool can cool it down.
   *  - rate (429) / quota (403): cool ONLY the `key::model` pair (model-specific
   *    quota may differ per model on the same key).
   *  - auth (401 / invalid key): cool the ENTIRE key across all models.
   *  - none: no cooldown (model-not-found / context-length / network).
   */
  public reportFailure(providerId: string, key: string, modelId: string, errorMessage: string): void {
    const pool = this.pools.get(providerId);
    if (!pool || !key) return;

    const kind = ApiKeyPool.classifyError(errorMessage);
    if (kind === 'none') return;

    const cooldownMs =
      kind === 'rate' ? ApiKeyPool.RATE_LIMIT_COOLDOWN :
      kind === 'quota' ? ApiKeyPool.QUOTA_COOLDOWN :
      ApiKeyPool.AUTH_COOLDOWN; // auth (invalid/revoked key)

    const until = Date.now() + cooldownMs;

    if (kind === 'auth') {
      // Key is broken for every model — cool all existing pairs for this key.
      for (const ck of Array.from(pool.cooldowns.keys())) {
        if (ck.split('::')[0] === key) pool.cooldowns.set(ck, { until, reason: kind });
      }
      // Also pre-emptively mark the base key for any future model.
      pool.cooldowns.set(pairKey(key, '*'), { until, reason: kind });
    } else {
      // Rate / quota: only this specific key::model pair.
      pool.cooldowns.set(pairKey(key, modelId), { until, reason: kind });
    }

    console.warn(`[KEYPOOL] Provider ${providerId}: ${kind} on key::${modelId || '*'} — cooling for ${Math.round(cooldownMs / 1000)}s`);
  }

  /**
   * Classify an error message into a key-relevant bucket.
   * Returns 'none' for errors that should NOT trigger key rotation
   * (model-not-found, context-length, server/network).
   */
  public static classifyError(rawMsg: string): 'rate' | 'quota' | 'auth' | 'none' {
    const msg = (rawMsg || '').toLowerCase();

    // Explicit status codes
    if (/\b429\b/.test(msg)) return 'rate';
    if (/\b401\b/.test(msg)) return 'auth';
    if (/\b403\b/.test(msg)) return 'quota';
    if (/\b503\b/.test(msg)) return 'rate';

    // Rate limit phrases
    if (
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('resource has been exhausted') ||
      msg.includes('rate_limit_exceeded')
    ) return 'rate';

    // Overloaded / unavailable phrases — treat as short rate-limit
    if (
      msg.includes('overloaded') ||
      msg.includes('unavailable') ||
      msg.includes('service unavailable') ||
      msg.includes('temporarily unavailable')
    ) return 'rate';

    // Quota exhausted phrases
    if (
      msg.includes('quota') ||
      msg.includes('exceeded your current quota') ||
      msg.includes('billing') ||
      msg.includes('usage limit') ||
      msg.includes('insufficient_quota')
    ) return 'quota';

    // Auth / invalid key phrases
    if (
      msg.includes('unauthorized') ||
      msg.includes('invalid api key') ||
      msg.includes('api key not valid') ||
      msg.includes('invalid authentication') ||
      msg.includes('authentication failed') ||
      msg.includes('permission denied') ||
      (msg.includes('api_key') && msg.includes('invalid'))
    ) return 'auth';

    return 'none';
  }

  /** Test/debug helper — clear all state. */
  public reset(): void {
    this.pools.clear();
  }
}

export const keyPool = ApiKeyPool.getInstance();
