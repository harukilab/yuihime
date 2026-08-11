#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Provider Switcher — switch the active AI provider / disable others
#
#  Thin wrapper around the live settings API (GET/POST /api/settings) so you can
#  test a specific provider (e.g. the local llama.cpp server) without editing
#  ~/.yuihime/data/config.toml by hand.
#
#  Usage:
#    tools/yui-provider.sh status                         List AI providers + enabled state
#    tools/yui-provider.sh use <id> [model]               Set the ACTIVE provider (optionally override its model)
#    tools/yui-provider.sh only <id>                      Activate ONLY <id>, disable every other AI provider (snapshots first)
#    tools/yui-provider.sh on  <id>                       Enable one provider
#    tools/yui-provider.sh off <id>                       Disable one provider (keeps snapshot safe)
#    tools/yui-provider.sh reset                          Enable ALL providers again (drop enabled=false)
#    tools/yui-provider.sh backup                         Save current settings snapshot
#    tools/yui-provider.sh restore                        Restore the last saved snapshot
#    tools/yui-provider.sh unfail [<id>|all]              Clear gateway "temporarily failed" marks (default: all)
#
#  All mutating commands POST the change, clear the gateway failure mark for the
#  affected provider(s), and restart the daemon so the new config is picked up
#  by the request pipeline. Append --no-restart to skip the daemon restart.
#
#  Provider IDs: gemini | anthropic | custom | custom:<name> | local |
#                official_chat | openai | openrouter
#  e.g. tools/yui-provider.sh only custom:llamacpp
#
#  Env:
#    YUIHIME_SYSTEM_ROOT   Data root (default $HOME/.yuihime)
#    YUIHIME_DAEMON_PORT   Daemon port (default 3000, or read from current.meta)
# ==============================================================================

set -euo pipefail

ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
PORT="${YUIHIME_DAEMON_PORT:-}"
if [ -z "$PORT" ] && [ -f "$ROOT/debug/current.meta" ]; then
  PORT="$(sed -n '3p' "$ROOT/debug/current.meta" 2>/dev/null || true)"
fi
PORT="${PORT:-3000}"
API="http://127.0.0.1:$PORT/api/settings"
SNAP="$ROOT/data/provider-snapshot.json"
POOL="$ROOT/data/key_pool_state.json"

PROVIDER_KEYS='gemini anthropic custom local official_chat openai openrouter'

NO_RESTART=0
for _a in "$@"; do
  if [ "$_a" = "--no-restart" ]; then NO_RESTART=1; fi
done

die() { echo "ERROR: $1" >&2; exit 1; }

fetch() { curl -s "$API"; }

post() {
  local file="$1"
  curl -s -X POST "$API" -H "Content-Type: application/json" --data-binary "@$file" >/dev/null
  echo "OK: settings saved (live)."
}

restart_daemon() {
  echo "Restarting daemon so the request pipeline picks up the new config..."
  "$(dirname "$0")/yui-daemon.sh" restart 2>&1 | tail -1 || true
}

clear_failures() {
  python3 - "$POOL" "${1:-all}" <<'PY'
import json, os, sys
pool, only = sys.argv[1], sys.argv[2]
if not os.path.exists(pool):
    print("OK: no failure state file — nothing to clear.")
    sys.exit(0)
try:
    d = json.load(open(pool))
except Exception:
    print("OK: failure state unreadable — skipping.")
    sys.exit(0)
fp = d.get('failedProviders') or {}
n = 0
for k in list(fp):
    if only != 'all' and k != only:
        continue
    fp.pop(k, None)
    n += 1
d['failedProviders'] = fp
with open(pool, 'w') as f:
    json.dump(d, f, indent=2)
print(f"OK: cleared {n} provider failure mark(s).")
PY
}

mutate() {
  local target="${1:-all}"
  post "$ROOT/data/.provider-next.json"
  clear_failures "$target"
  if [ "$NO_RESTART" -eq 0 ]; then
    restart_daemon
  else
    echo "SKIP: daemon restart skipped (--no-restart)."
  fi
}

# ---------------------------------------------------------------- subcommands

cmd_status() {
  python3 - "$API" <<'PY'
import json, sys, urllib.request
d = json.load(urllib.request.urlopen(sys.argv[1]))
def show(pid, blk, indent=0):
    if not isinstance(blk, dict):
        return
    en = blk.get('enabled')
    en = 'yes' if en is True else ('no' if en is False else '-')
    mdl = blk.get('model')
    if isinstance(mdl, list): mdl = mdl[0]
    url = blk.get('baseUrl') or blk.get('endpoint') or ''
    print(f"{'  '*indent}{pid:<18} enabled={en:<3} model={mdl or '-':<30} {url}")
    for subk, subv in blk.items():
        if isinstance(subv, dict):
            show(f"{pid}.{subk}", subv, indent+1)
print(f"ACTIVE provider : {d.get('provider','?')}\n")
for k in ["gemini","anthropic","custom","local","official_chat","openai","openrouter"]:
    if k in d:
        show(k, d.get(k))
PY
}

resolve() {
  case "$1" in
    gemini|anthropic|custom|local|official_chat|openai|openrouter) echo "$1" ;;
    custom:*) echo "$1" ;;
    *) die "unknown provider id '$1'. Valid: $PROVIDER_KEYS or custom:<name>" ;;
  esac
}

apply() {
  local mode="$1" id="$2" model="${3:-}"
  python3 - "$API" "$mode" "$id" "$model" > "$ROOT/data/.provider-next.json" <<'PY'
import json, sys, urllib.request
api, mode, target, model = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = json.load(urllib.request.urlopen(api))
TOP = ["gemini","anthropic","custom","local","official_chat","openai","openrouter"]
def split(t):
    if t.startswith("custom:"):
        return "custom", t.split(":",1)[1]
    return t, None
def block(t):
    top, sub = split(t)
    blk = d.get(top)
    if not isinstance(blk, dict):
        blk = {}
        d[top] = blk
    if sub:
        s = blk.get(sub)
        if not isinstance(s, dict):
            s = {}
            blk[sub] = s
        return s
    return blk
if mode == "use":
    d["provider"] = target
    if model:
        b = block(target)
        b["model"] = model
elif mode == "on":
    b = block(target)
    b["enabled"] = True
elif mode == "off":
    b = block(target)
    b["enabled"] = False
elif mode == "only":
    d["provider"] = target
    for k in TOP:
        blk = d.get(k)
        if not isinstance(blk, dict):
            continue
        blk["enabled"] = False
        for subk, subv in blk.items():
            if isinstance(subv, dict):
                subv["enabled"] = False
    b = block(target)
    b["enabled"] = True
elif mode == "reset":
    for k in TOP:
        blk = d.get(k)
        if not isinstance(blk, dict):
            continue
        blk["enabled"] = True
        for subk, subv in blk.items():
            if isinstance(subv, dict):
                subv["enabled"] = True
print(json.dumps(d))
PY
}

cmd_backup() { fetch > "$SNAP"; echo "OK: snapshot saved -> $SNAP"; }
cmd_restore() {
  [ -f "$SNAP" ] || die "no snapshot at $SNAP"
  cp "$SNAP" "$ROOT/data/.provider-next.json"
  mutate all
  echo "OK: snapshot restored from $SNAP"
}

# --------------------------------------------------------------------- main

cmd="${1:-}"
[ -n "$cmd" ] || { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
shift || true

case "$cmd" in
  status)  cmd_status ;;
  backup)  cmd_backup ;;
  restore) cmd_restore ;;
  use)     id="$(resolve "$1")"; apply use "$id" "${2:-}"; mutate "$id" ;;
  on)      id="$(resolve "$1")"; apply on "$id"; mutate "$id" ;;
  off)     id="$(resolve "$1")"; apply off "$id"; mutate "$id" ;;
  only)    id="$(resolve "$1")"; cmd_backup; apply only "$id"; mutate "$id" ;;
  reset)   apply reset; mutate all ;;
  unfail)  clear_failures "${1:-all}"
           if [ "$NO_RESTART" -eq 0 ]; then
             restart_daemon
           else
             echo "SKIP: daemon restart skipped (--no-restart)."
           fi
           ;;
  *) die "unknown command '$cmd'. Run without args for usage." ;;
esac
