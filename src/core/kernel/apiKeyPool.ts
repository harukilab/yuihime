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
import { loadKeyPoolState, saveKeyPoolState, PersistedCooldown } from './apiKeyPoolStore.js';

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
  // Key-wide temporary blocklist entries: key -> expiry. These survive across
  // calls and restarts so a key that is quota-exhausted / overloaded for a
  // while is skipped by every provider using the pool, not just one driver.
  rateLimited: Map<string, number>;
  overloaded: Map<string, number>;
  // Model-wide temporary blocklist entries: modelId -> expiry. A model that is
  // 404/deprecated/unavailable is skipped across all keys of the provider.
  failedModels: Map<string, number>;
};

const pairKey = (key: string, model: string) => `${key}::${model || '*'}`;

export class ApiKeyPool {
  private static instance: ApiKeyPool;
  private pools: Map<string, ProviderKeyState> = new Map();
  private hydratedProviders: Set<string> = new Set();

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

  /** Restore cooldowns persisted from a previous run for a given provider. */
  private hydrateFromDisk(providerId: string): void {
    if (this.hydratedProviders.has(providerId)) return;
    this.hydratedProviders.add(providerId);
    try {
      const state = loadKeyPoolState();
      const pool = this.pools.get(providerId);
      if (!pool) return;
      const now = Date.now();
      let restored = 0;

      // Per-pair cooldowns (key::model).
      const pairs = (state.cooldowns || {})[providerId] || {};
      for (const [compositeKey, entry] of Object.entries(pairs)) {
        if (entry && typeof entry.until === 'number' && entry.until > now) {
          const ownerKey = compositeKey.split('::')[0];
          if (ownerKey && pool.keys.length > 0 && !pool.keys.includes(ownerKey)) continue;
          pool.cooldowns.set(compositeKey, { until: entry.until, reason: entry.reason || 'persisted' });
          restored++;
        }
      }

      // Key-wide rate-limit / overload blocklist (shared across providers).
      const restoreExpiryMap = (src: Record<string, number> | undefined, target: Map<string, number>): number => {
        let n = 0;
        if (!src) return 0;
        for (const [k, expiry] of Object.entries(src)) {
          if (typeof expiry === 'number' && expiry > now) {
            target.set(k, expiry);
            n++;
          }
        }
        return n;
      };
      restored += restoreExpiryMap(state.rateLimited, pool.rateLimited);
      restored += restoreExpiryMap(state.overloaded, pool.overloaded);

      // Model-wide blocklist: persisted with a providerId:: prefix so pools of
      // different providers never collide on the same model name.
      const modelPrefix = `${providerId}::`;
      if (state.failedModels) {
        for (const [k, expiry] of Object.entries(state.failedModels)) {
          if (typeof expiry === 'number' && expiry > now && k.startsWith(modelPrefix)) {
            const modelId = k.slice(modelPrefix.length);
            pool.failedModels.set(modelId, expiry);
            restored++;
          }
        }
      }

      if (restored > 0) {
        console.log(`[KEYPOOL] Provider ${providerId}: restored ${restored} persisted cooldown / busy-key / failed-model entry(s) from disk.`);
      }
    } catch (err: any) {
      console.warn(`[KEYPOOL] Failed to hydrate cooldowns for ${providerId}:`, err?.message || err);
    }
  }

  /** Persist the full cooldown table so restarts remember which keys are cooling down. */
  private persistToDisk(): void {
    try {
      const now = Date.now();
      const existing = loadKeyPoolState();
      const cooldowns: Record<string, Record<string, PersistedCooldown>> = existing?.cooldowns || {};
      const rateLimited: Record<string, number> = { ...(existing?.rateLimited || {}) };
      const overloaded: Record<string, number> = { ...(existing?.overloaded || {}) };
      const failedModels: Record<string, number> = { ...(existing?.failedModels || {}) };
      for (const [providerId, pool] of this.pools.entries()) {
        const pairs: Record<string, PersistedCooldown> = { ...(cooldowns[providerId] || {}) };
        for (const [compositeKey, entry] of pool.cooldowns.entries()) {
          if (entry.until > now) {
            pairs[compositeKey] = { until: entry.until, reason: entry.reason };
          } else {
            delete pairs[compositeKey];
          }
        }
        if (Object.keys(pairs).length > 0) cooldowns[providerId] = pairs;
        else delete cooldowns[providerId];
        // Key-wide blocklists: prune expired, keep live.
        for (const [k, expiry] of pool.rateLimited.entries()) {
          if (expiry > now) rateLimited[k] = expiry;
          else delete rateLimited[k];
        }
        for (const [k, expiry] of pool.overloaded.entries()) {
          if (expiry > now) overloaded[k] = expiry;
          else delete overloaded[k];
        }
        // Model-wide blocklist: prefix with providerId:: to avoid collisions.
        for (const [modelId, expiry] of pool.failedModels.entries()) {
          if (expiry > now) failedModels[`${providerId}::${modelId}`] = expiry;
          else delete failedModels[`${providerId}::${modelId}`];
        }
      }
      saveKeyPoolState({
        overloaded,
        rateLimited,
        failedModels,
        ...(existing?.failedProviders ? { failedProviders: existing.failedProviders } : {}),
        cooldowns
      });
    } catch (err: any) {
      console.warn('[KEYPOOL] Failed to persist cooldowns to disk:', err?.message || err);
    }
  }

  /**
   * True when the given key::model pair is currently under cooldown. Model '*' is
   * honored as a key-wide marker (auth failures cool the entire key).
   */
  public isCooledDown(providerId: string, key: string, modelId: string = '*'): boolean {
    const pool = this.pools.get(providerId);
    if (!pool) return false;
    const now = Date.now();
    const cd = pool.cooldowns.get(pairKey(key, modelId)) || pool.cooldowns.get(pairKey(key, '*'));
    return !!(cd && cd.until > now);
  }

  /**
   * True when the given key is temporarily blocklisted provider-wide for
   * rate-limit / quota exhaustion (429/403). Shared across every provider.
   */
  public isKeyRateLimited(providerId: string, key: string): boolean {
    const pool = this.pools.get(providerId);
    if (!pool) return false;
    const expiry = pool.rateLimited.get(key);
    return !!(expiry && expiry > Date.now());
  }

  /** True when the given key is temporarily blocklisted provider-wide for overload (503). */
  public isKeyOverloaded(providerId: string, key: string): boolean {
    const pool = this.pools.get(providerId);
    if (!pool) return false;
    const expiry = pool.overloaded.get(key);
    return !!(expiry && expiry > Date.now());
  }

  /** True when the given key is busy in any sense (rate-limited or overloaded). */
  public isKeyBusy(providerId: string, key: string): boolean {
    return this.isKeyRateLimited(providerId, key) || this.isKeyOverloaded(providerId, key);
  }

  /** True when the given model is temporarily blocklisted for the provider (404/deprecated/unavailable). */
  public isModelFailed(providerId: string, modelId: string): boolean {
    const pool = this.pools.get(providerId);
    if (!pool) return false;
    const expiry = pool.failedModels.get(modelId);
    return !!(expiry && expiry > Date.now());
  }

  /** Mark a key as rate-limited / quota-exhausted for `ttlMs`. Persists to disk. */
  public markKeyRateLimited(providerId: string, key: string, ttlMs: number): void {
    const pool = this.pools.get(providerId);
    if (!pool) return;
    pool.rateLimited.set(key, Date.now() + ttlMs);
    this.persistToDisk();
  }

  /** Mark a key as overloaded (503) for `ttlMs`. Persists to disk. */
  public markKeyOverloaded(providerId: string, key: string, ttlMs: number): void {
    const pool = this.pools.get(providerId);
    if (!pool) return;
    pool.overloaded.set(key, Date.now() + ttlMs);
    this.persistToDisk();
  }

  /** Mark a model as failed for the provider for `ttlMs`. Persists to disk. */
  public markModelFailed(providerId: string, modelId: string, ttlMs: number): void {
    const pool = this.pools.get(providerId);
    if (!pool) return;
    pool.failedModels.set(modelId, Date.now() + ttlMs);
    this.persistToDisk();
  }

  /** Drop a model from the failed list (used on scheduled quota resets). */
  public clearModelFailure(providerId: string, modelId: string): void {
    const pool = this.pools.get(providerId);
    if (!pool) return;
    if (pool.failedModels.delete(modelId)) {
      this.persistToDisk();
    }
  }

  /** Return the keys registered for a provider, or [] if never configured. */
  public getKeys(providerId: string): string[] {
    const pool = this.pools.get(providerId);
    return pool ? pool.keys : [];
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
        cooldowns: new Map(),
        rateLimited: new Map(),
        overloaded: new Map(),
        failedModels: new Map()
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
      // Drop key-wide blocklist entries for keys that no longer exist.
      for (const k of Array.from(existing.rateLimited.keys())) {
        if (!keys.includes(k)) existing.rateLimited.delete(k);
      }
      for (const k of Array.from(existing.overloaded.keys())) {
        if (!keys.includes(k)) existing.overloaded.delete(k);
      }
    }

    this.hydrateFromDisk(providerId);
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
        this.persistToDisk();
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
    this.persistToDisk();
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
