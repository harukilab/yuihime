/**
 * Key Pool State Store
 *
 * Persists the runtime "bad / busy API key" state across restarts so that
 * known-bad keys (429 quota, 503 overloaded, 403 leaked) are not retried
 * immediately after a daemon restart. The pool state is purely advisory:
 * it only records short-lived cooldown windows with absolute expiry timestamps
 * and is safe to delete at any time.
 *
 * File: `<dataDir>/key_pool_state.json` (default `~/.yuihime/data/key_pool_state.json`)
 *
 * State shape:
 *   {
 *     overloaded:  Record<apiKey, expiryMs>,
 *     rateLimited: Record<apiKey, expiryMs>,
 *     cooldowns:   Record<providerId, Record<"key::model", { until: number; reason: string }>>
 *   }
 */

import fs from "fs";
import path from "path";
import { resolveDataDir } from "../systemPaths.js";

const STATE_FILE = "key_pool_state.json";

export interface PersistedCooldown {
  until: number;
  reason: string;
}

export interface KeyPoolStateFile {
  overloaded?: Record<string, number>;
  rateLimited?: Record<string, number>;
  cooldowns?: Record<string, Record<string, PersistedCooldown>>;
}

function statePath(): string {
  return path.join(resolveDataDir(), STATE_FILE);
}

/** Load persisted key-pool state from disk. Never throws. */
export function loadKeyPoolState(): KeyPoolStateFile {
  try {
    const p = statePath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as KeyPoolStateFile;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (err: any) {
    console.warn(`[KEYPOOL_STORE] Failed to load ${STATE_FILE}:`, err?.message || err);
    return {};
  }
}

/** Persist key-pool state to disk. Never throws. */
export function saveKeyPoolState(state: KeyPoolStateFile): void {
  try {
    const p = statePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
  } catch (err: any) {
    console.warn(`[KEYPOOL_STORE] Failed to save ${STATE_FILE}:`, err?.message || err);
  }
}

/** Prune expired entries from an expiry map and return a cleaned copy. */
export function pruneExpiryMap(map: Record<string, number>, now: number = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, expiry] of Object.entries(map)) {
    if (expiry > now) out[k] = expiry;
  }
  return out;
}
