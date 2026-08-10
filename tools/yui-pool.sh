#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Key Pool Resetter — inspect & reset the key pool cooldown state
#
#  key_pool_state.json records "bad / busy API key" state (429 rate limit,
#  503 overloaded, failed providers/models) that survives daemon restarts.
#  Reset it when you want every key/provider tried again immediately, e.g.
#  after a quota reset or when OpenRouter was blocked by failedProviders.
#
#  Usage:
#    tools/yui-pool.sh show            Show current pool state (counts per section)
#    tools/yui-pool.sh reset           Reset ALL sections to empty
#    tools/yui-pool.sh reset <section> Reset ONE section (overloaded|rateLimited|
#                                      cooldowns|failedModels|failedProviders)
#    tools/yui-pool.sh reset --restart Reset all AND restart the daemon
#
#  NOTE: in-memory failure maps (failedProviders) are hydrated at daemon boot,
#  so a full reset only takes effect after `tools/yui-daemon.sh restart`.
#
#  Env:
#    YUIHIME_SYSTEM_ROOT   Data root (default $HOME/.yuihime)
# ==============================================================================

ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
STATE="$ROOT/data/key_pool_state.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[ ! -f "$STATE" ] && echo "{}" > "$STATE"
chmod 600 "$STATE"

SECTIONS="overloaded rateLimited cooldowns failedModels failedProviders"

cmd_show() {
  python3 - "$STATE" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
if not d:
    print("(empty)")
    sys.exit(0)
for k in ["overloaded","rateLimited","cooldowns","failedModels","failedProviders"]:
    v=d.get(k) or {}
    n=len(v)
    if k=="cooldowns":
        n=sum(len(vv) for vv in v.values())
    if n:
        detail=", ".join(list(v)[:4])
        print(f"{k:<16} {n:>3}  e.g. {detail}")
    else:
        print(f"{k:<16}  0")
PY
}

cmd_reset() {
  local section="$1" restart="$2"
  if [ -n "$section" ]; then
    case "$section" in
      overloaded|rateLimited|cooldowns|failedModels|failedProviders) ;;
      *) echo "ERROR: unknown section '$section'. Valid: $SECTIONS" >&2; exit 1 ;;
    esac
  fi
  clear_state() {
    if [ -z "$section" ]; then
      python3 - "$STATE" <<'PY'
import json,sys
json.dump({}, open(sys.argv[1],"w"))
PY
    else
      python3 - "$STATE" "$section" <<'PY'
import json,sys
p=sys.argv[1]; sec=sys.argv[2]
d=json.load(open(p))
d[sec]={}
json.dump(d,open(p),"w")
PY
    fi
  }
  if [ "$restart" = "restart" ]; then
    # Order matters: stop the OLD daemon FIRST (its in-flight failures can
    # re-persist state to disk), THEN wipe the state file, THEN boot the new
    # daemon so it hydrates an empty pool. Clearing before restart lets the
    # old process resurrect stale rateLimited/failedModels entries.
    echo "Stopping daemon before clearing pool state..."
    bash "$SCRIPT_DIR/yui-daemon.sh" stop
    clear_state
    echo "Pool state cleared. Starting daemon..."
    bash "$SCRIPT_DIR/yui-daemon.sh" start
  else
    clear_state
    echo "Pool state reset: '${section:-all sections}' cleared."
    echo "NOTE: run 'tools/yui-daemon.sh restart' to drop in-memory failure maps."
  fi
}

case "${1:-}" in
  show) cmd_show ;;
  reset)
    case "${2:-}" in
      --restart) cmd_reset "" restart ;;
      -*) echo "Usage: $0 reset [section|--restart]" >&2; exit 1 ;;
      *) cmd_reset "${2:-}" "${3:-}" ;;
    esac
    ;;
  *)
    echo "Usage: $0 [show|reset [section|--restart]]" >&2
    echo "  sections: $SECTIONS" >&2
    exit 1
    ;;
esac
