#!/usr/bin/env bash
# ==============================================================================
#  YuiHime via PM2 — start/stop/restart/status/logs (OPSIONAL)
#
#  Script khusus untuk menjalankan YuiHime sebagai app PM2 daemon (bukan
#  daemon lokal yui-debug.sh/watchdog). Dipakai oleh tools/yui-daemon.sh
#  saat mode PM2 diaktifkan (--pm2 / YUIHIME_PM2=1) dan oleh bot /daemon
#  saat setting usePm2=true. DEFAULT sistem adalah TANPA PM2.
#
#  Usage:
#    tools/yui-pm2.sh start [dev|prod]    Start app PM2 'yuihime'
#    tools/yui-pm2.sh stop                Hentikan app PM2 'yuihime'
#    tools/yui-pm2.sh restart [dev|prod]  Restart app PM2 'yuihime'
#    tools/yui-pm2.sh status              Status app PM2 'yuihime'
#    tools/yui-pm2.sh logs [-live] [N]      Live: stream log PM2 | N baris terakhir (default 40)
#    tools/yui-pm2.sh save                pm2 save (simpan daemon list)
#    tools/yui-pm2.sh help                Bantuan ini
#
#  Mode default: prod bila dist/server.cjs ada, selain itu dev.
#  Env override:
#    YUIHIME_SYSTEM_ROOT   Root data (default $HOME/.yuihime)
#    YUIHIME_DAEMON_PORT   Port health check (default 3000)
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PM2_APP="yuihime"

SYSTEM_ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DEBUG_DIR="$SYSTEM_ROOT/debug"
CURRENT_META="$DEBUG_DIR/current.meta"
DEFAULT_PORT="${YUIHIME_DAEMON_PORT:-3000}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { printf '%b%s%b\n' "$CYAN" "$*" "$NC"; }
ok()   { printf '%b%s%b\n' "$GREEN" "✔ $*" "$NC"; }
warn() { printf '%b%s%b\n' "$YELLOW" "⚠ $*" "$NC"; }
err()  { printf '%b%s%b\n' "$RED" "✖ $*" "$NC" >&2; }

require_pm2() {
  if ! command -v pm2 >/dev/null 2>&1; then
    err "PM2 tidak terpasang. Pakai jalur non-PM2 (default): tools/yui-daemon.sh (watchdog + yui-debug.sh)."
    exit 1
  fi
}

app_running() { [ -n "$(pm2 pid "$PM2_APP" 2>/dev/null)" ]; }

default_mode() {
  if [ -f "$PROJECT_DIR/dist/server.cjs" ]; then echo "prod"; else echo "dev"; fi
}

daemon_port() {
  local p=""
  [ -f "$CURRENT_META" ] && p=$(sed -n '3p' "$CURRENT_META" 2>/dev/null)
  echo "${p:-$DEFAULT_PORT}"
}

daemon_healthy() {
  curl -sS --max-time 3 -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$(daemon_port)/api/health" 2>/dev/null | grep -q '^200$'
}

wait_healthy() {
  local max="${1:-30}" waited=0
  while [ "$waited" -lt "$max" ]; do
    daemon_healthy && return 0
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

start_cmd() {
  local mode="$1"
  if [ "$mode" = "prod" ]; then
    pm2 start "$PROJECT_DIR/dist/server.cjs" --name "$PM2_APP" --cwd "$PROJECT_DIR"
  else
    pm2 start "$PROJECT_DIR/node_modules/.bin/tsx" --name "$PM2_APP" --cwd "$PROJECT_DIR" -- server.ts
  fi
}

cmd_start() {
  require_pm2
  local mode="${1:-}"
  [ -z "$mode" ] && mode=$(default_mode)
  log "PM2 start (mode $mode) ..."
  if app_running; then
    ok "App '$PM2_APP' sudah jalan di PM2 — dilewati."
    return 0
  fi
  if daemon_healthy; then
    warn "Daemon lokal sudah sehat (port $(daemon_port)) — hentikan dulu sebelum start via PM2:"
    warn "  tools/yui-daemon.sh stop   lalu   tools/yui-pm2.sh start $mode"
    return 1
  fi
  if start_cmd "$mode"; then
    pm2 save >/dev/null 2>&1 || true
    if wait_healthy 30; then
      ok "Daemon sehat via PM2 (port $(daemon_port))"
    else
      warn "Daemon belum sehat dalam 30s — cek: pm2 logs $PM2_APP"
    fi
    return 0
  fi
  err "pm2 start gagal."
  return 1
}

cmd_stop() {
  require_pm2
  if ! app_running; then
    warn "App '$PM2_APP' tidak berjalan di PM2."
    return 0
  fi
  pm2 delete "$PM2_APP" >/dev/null 2>&1 && ok "App '$PM2_APP' dihapus dari PM2."
  pm2 save >/dev/null 2>&1 || true
}

cmd_restart() {
  require_pm2
  local mode="${1:-}"
  [ -z "$mode" ] && mode=$(default_mode)
  if app_running; then
    pm2 restart "$PM2_APP" >/dev/null 2>&1 && ok "Restart '$PM2_APP' OK"
  else
    warn "App '$PM2_APP' tidak jalan — start baru."
    cmd_start "$mode" || return 1
  fi
  wait_healthy 30 && ok "Daemon sehat (port $(daemon_port))" || warn "Daemon belum sehat — cek: pm2 logs $PM2_APP"
}

cmd_status() {
  require_pm2
  local out
  out=$(pm2 describe "$PM2_APP" 2>/dev/null || true)
  if [ -z "$out" ]; then
    warn "App '$PM2_APP' tidak ada di PM2."
    return 0
  fi
  printf '%s\n' "$out" | sed -n '1,40p'
}

cmd_logs() {
  require_pm2
  local arg="${1:-40}"
  if [ "$arg" = "-live" ] || [ "$arg" = "live" ] || [ "$arg" = "-f" ]; then
    log "Log live (pm2 logs --raw). Tekan Ctrl+C untuk keluar."
    pm2 logs "$PM2_APP" --raw 2>/dev/null || err "Gagal stream log PM2."
    return $?
  fi
  local n="$arg"
  pm2 logs "$PM2_APP" --lines "$n" --nostream 2>/dev/null \
    || pm2 logs "$PM2_APP" --lines "$n" 2>/dev/null \
    || err "Gagal mengambil log PM2."
}

case "${1:-help}" in
  start)   shift; cmd_start "${1:-}";;
  stop)    cmd_stop;;
  restart) shift; cmd_restart "${1:-}";;
  status)  cmd_status;;
  logs)    shift; cmd_logs "${1:-40}";;
  save)    require_pm2 && pm2 save;;
  help|-h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}";;
  *) err "Perintah tidak dikenal: '${1:-}'"; sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 1;;
esac
