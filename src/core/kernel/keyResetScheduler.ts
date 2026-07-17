/**
 * Key Reset Rule Scheduler
 *
 * Drives automatic clearing of API-key cooldowns based on configurable rules.
 * This addresses provider quota-reset schedules (e.g. Google AI Studio free
 * tier resets at 00:00 UTC daily) without hardcoding provider behavior.
 *
 * Rules are read from settings (per-provider or global gemini scope):
 *   settings[providerId].keyResetRules  OR  settings.gemini.keyResetRules
 *
 * Rule shape:
 *   { provider: string, type: 'daily-utc' | 'interval', atHour?: number, everyMs?: number }
 *   - daily-utc : reset every day at `atHour` UTC (default 0)
 *   - interval  : reset every `everyMs` milliseconds since the last reset
 *
 * The scheduler is lazy: it computes the next reset timestamp on demand and
 * tracks the last-fired time per (provider, rule). No background timers, so it
 * is safe for the single-binary runtime and never blocks the request path.
 *
 * Status: DEVELOPMENT — rule engine extensible (weekly, cron later if needed).
 */

export type KeyResetRule =
  | { provider: string; type: 'daily-utc'; atHour?: number }
  | { provider: string; type: 'interval'; everyMs: number };

interface RuleState {
  rule: KeyResetRule;
  nextResetAt: number;
}

export class KeyResetScheduler {
  private static instance: KeyResetScheduler;
  private ruleStates: Map<string, RuleState> = new Map(); // key: `${provider}:${index}`

  public static getInstance(): KeyResetScheduler {
    if (!KeyResetScheduler.instance) {
      KeyResetScheduler.instance = new KeyResetScheduler();
    }
    return KeyResetScheduler.instance;
  }

  /** Load rules for a provider from settings (per-provider takes priority). */
  public loadRules(providerId: string, settings: any): void {
    const perProvider = settings?.[providerId]?.keyResetRules;
    const globalScope = settings?.gemini?.keyResetRules;
    const rules: KeyResetRule[] = Array.isArray(perProvider)
      ? perProvider
      : Array.isArray(globalScope)
        ? globalScope.filter((r: KeyResetRule) => r.provider === providerId)
        : [];

    // Rebuild state for this provider only.
    for (const key of Array.from(this.ruleStates.keys())) {
      if (key.startsWith(`${providerId}:`)) this.ruleStates.delete(key);
    }

    rules.forEach((rule, idx) => {
      const stateKey = `${providerId}:${idx}`;
      this.ruleStates.set(stateKey, {
        rule,
        nextResetAt: this.computeNextReset(rule, Date.now())
      });
    });
  }

  /**
   * Returns true if any rule for this provider fired since the last check,
   * meaning cooldowns should be cleared. Idempotent until the next boundary.
   */
  public shouldReset(providerId: string, now: number = Date.now()): boolean {
    let fired = false;
    for (const [key, state] of this.ruleStates.entries()) {
      if (!key.startsWith(`${providerId}:`)) continue;
      if (now >= state.nextResetAt) {
        fired = true;
        // Advance to the next boundary so we don't fire again until then.
        state.nextResetAt = this.computeNextReset(state.rule, now);
      }
    }
    return fired;
  }

  /** Compute the next reset timestamp for a rule given a reference time. */
  private computeNextReset(rule: KeyResetRule, now: number): number {
    if (rule.type === 'interval') {
      const ms = Math.max(60_000, rule.everyMs || 86_400_000);
      // Align to a clean boundary from epoch for predictability.
      const elapsed = now % ms;
      return now + (ms - elapsed);
    }

    // daily-utc
    const atHour = Math.min(23, Math.max(0, rule.atHour ?? 0));
    const d = new Date(now);
    d.setUTCHours(atHour, 0, 0, 0);
    let ts = d.getTime();
    if (ts <= now) {
      // Already passed today's boundary -> next day.
      ts += 86_400_000;
    }
    return ts;
  }

  /** Debug helper — upcoming reset times for a provider. */
  public debugNextResets(providerId: string): { rule: KeyResetRule; nextResetAt: number }[] {
    const out: { rule: KeyResetRule; nextResetAt: number }[] = [];
    for (const [key, state] of this.ruleStates.entries()) {
      if (key.startsWith(`${providerId}:`)) out.push({ rule: state.rule, nextResetAt: state.nextResetAt });
    }
    return out;
  }

  public reset(): void {
    this.ruleStates.clear();
  }
}

export const keyResetScheduler = KeyResetScheduler.getInstance();
