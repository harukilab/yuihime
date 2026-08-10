#!/usr/bin/env python3
"""Backfill the UTC-anchored usage tracker (logs/usage.YYYY-MM-DD.log) from the
historical LLM audit logs (logs/llm*.log) so daily stats start with a baseline.

The LLM audit logs do NOT persist usageMetadata (provider token counts), so
backfilled entries carry request totals (success/failed + errorType) with NULL
token fields and `backfilled: true` — usable as a request-count / RPM reference,
not a token reference. Live entries recorded by the tracker are never touched.

Usage:
  python3 tools/backfill_usage.py [--days 7] [--root DIR] [--today]
                                  [--force] [--providers gemini,openrouter] [--dry-run]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

DEFAULT_ROOT = os.environ.get("YUIHIME_SYSTEM_ROOT") or os.path.expanduser("~/.yuihime")


def utc_now_date():
    return datetime.now(timezone.utc)


def utc_date_key(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000, timezone.utc).strftime("%Y-%m-%d")


def day_start_ms(date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def classify_error(body):
    b = (body or "").lower()
    if "429" in b or "quota" in b or "rate limit" in b or "exhausted" in b:
        return "quota"
    if "503" in b or "overloaded" in b or "unavailable" in b:
        return "overload"
    if "401" in b or "403" in b or "api key" in b:
        return "auth"
    if "404" in b or "not found" in b or "no longer available" in b:
        return "model"
    if "timeout" in b or "abort" in b:
        return "timeout"
    if "fetch failed" in b or "econnreset" in b or "socket" in b or "network" in b:
        return "network"
    if "truncat" in b:
        return "truncated"
    return "other"


def load_ndjson(path):
    rows = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        pass
    return rows


def read_usage_file(path):
    """Return set of dedup keys already present in a usage day file."""
    keys = set()
    for row in load_ndjson(path):
        if row.get("type") != "request":
            continue
        keys.add((row.get("ts"), row.get("provider"), row.get("model"),
                  row.get("ok"), row.get("errorType")))
    return keys


def build_summary(entries, date_str):
    total = len(entries)
    success = sum(1 for e in entries if e.get("ok"))
    failed = total - success
    prompt = sum(e.get("promptTokens") or 0 for e in entries)
    completion = sum(e.get("completionTokens") or 0 for e in entries)
    total_tokens = sum(e.get("totalTokens") or 0 for e in entries)
    cached = sum(e.get("cachedTokens") or 0 for e in entries)
    first_ts = min((e["ts"] for e in entries), default=None)
    last_ts = max((e["ts"] for e in entries), default=None)
    minutes = 1.0
    if last_ts is not None:
        minutes = max(1.0, (last_ts - day_start_ms(date_str)) / 60000)
    return {
        "type": "summary",
        "date": date_str,
        "totalRequests": total,
        "success": success,
        "failed": failed,
        "successRate": round(success / total * 1000) / 10 if total else 0,
        "promptTokens": prompt,
        "completionTokens": completion,
        "totalTokens": total_tokens,
        "cachedTokens": cached,
        "avgRpm": round(total / minutes, 2),
        "avgTpm": round(total_tokens / minutes, 2),
        "minutesElapsed": round(minutes, 2),
        "firstRequestTs": first_ts,
        "lastRequestTs": last_ts,
        "backfilled": True,
        "tokensUnavailable": True,
        "updatedAt": int(utc_now_date().timestamp() * 1000),
    }


def main():
    ap = argparse.ArgumentParser(description="Backfill usage tracker from llm audit logs")
    ap.add_argument("--days", type=int, default=7, help="days to backfill (default 7)")
    ap.add_argument("--root", default=DEFAULT_ROOT, help="system root (default YUIHIME_SYSTEM_ROOT or ~/.yuihime)")
    ap.add_argument("--today", action="store_true", help="also backfill today's entries (live file merged with dedup)")
    ap.add_argument("--force", action="store_true", help="rebuild usage files from scratch (ignore existing)")
    ap.add_argument("--providers", default=None, help="comma-separated provider filter (default: all found)")
    ap.add_argument("--dry-run", action="store_true", help="print plan without writing")
    args = ap.parse_args()

    logs_dir = os.path.join(args.root, "logs")
    if not os.path.isdir(logs_dir):
        print(f"[ERROR] logs dir not found: {logs_dir}", file=sys.stderr)
        sys.exit(1)

    today = utc_now_date()
    dates = [today - timedelta(days=i) for i in range(1, args.days + 1)]
    if args.today:
        dates.insert(0, today)

    providers = set(p.strip() for p in (args.providers or "").split(",") if p.strip()) if args.providers else None
    llm_cur = load_ndjson(os.path.join(logs_dir, "llm.log"))

    for date in dates:
        key = date.strftime("%Y-%m-%d")
        if date == today:
            src_rows = [r for r in llm_cur if utc_date_key(r.get("ts", 0)) == key]
        else:
            src_rows = load_ndjson(os.path.join(logs_dir, f"llm.{key}.log"))

        src_rows = [r for r in src_rows
                    if r.get("provider") and (providers is None or r.get("provider") in providers)]

        usage_path = os.path.join(logs_dir, f"usage.{key}.log")
        existing = set() if args.force else read_usage_file(usage_path)
        new_entries = []
        seen = set()
        for r in src_rows:
            ts = r.get("ts") or r.get("timestamp") or 0
            prov = r.get("provider") or "unknown"
            model = r.get("model") or "unknown"
            ok = bool(not r.get("error"))
            err_type = None if ok else classify_error(r.get("error"))
            dedup = (ts, prov, model, ok, err_type)
            if dedup in existing or dedup in seen:
                continue
            seen.add(dedup)
            new_entries.append({
                "type": "request",
                "ts": ts,
                "provider": prov,
                "model": model,
                "ok": ok,
                "kind": None,
                "latencyMs": None,
                "promptTokens": None,
                "completionTokens": None,
                "totalTokens": None,
                "cachedTokens": None,
                "fromProvider": None,
                "errorType": err_type,
                "backfilled": True,
            })

        summary = build_summary(new_entries, key) if new_entries else None

        if not new_entries:
            print(f"{key}: no new entries")
            continue
        if args.dry_run:
            print(f"{key}: would append {len(new_entries)} entries")
            continue
        with open(usage_path, "a", encoding="utf-8") as f:
            for e in new_entries:
                f.write(json.dumps(e) + "\n")
        with open(os.path.join(logs_dir, f"usage.{key}.summary.log"), "w", encoding="utf-8") as f:
            f.write(json.dumps(summary) + "\n")
        s = summary
        print(f"{key}: +{len(new_entries)} entries | total={s['totalRequests']} "
              f"ok={s['success']} fail={s['failed']} | avgRpm={s['avgRpm']} avgTpm={s['avgTpm']} (tokens unavailable)")

    print("done.")


if __name__ == "__main__":
    main()
