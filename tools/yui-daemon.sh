#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Daemon — start/stop/restart/status dari terminal
#
#  Twin terminal dari perintah bot Telegram `/daemon`.
#  DEFAULT: TANPA PM2 — daemon dijalankan sebagai 1 proses lokal,
#  dikawal supervisor yui-watchdog.sh (restart saat hang/crash) dan
#  dikelola alat yui-debug.sh (start/stop/status/log).
#
#  Usage:
#    tools/yui-daemon.sh start [dev|prod]    Aktifkan daemon (DEFAULT tanpa PM2)
#    tools/yui-daemon.sh stop                Hentikan daemon
#    tools/yui-daemon.sh restart [dev|prod]  Restart daemon
#    tools/yui-daemon.sh status              Status daemon + watchdog + PM2
#    tools/yui-daemon.sh logs [-live] [N]    Live (stream) | N baris log terakhir (default 40)
#    tools/yui-daemon.sh rebuild             Rebuild proyek (npm run build: web + server)
#    tools/yui-daemon.sh help                Bantuan ini
#
#  Mode PM2 (OPSIONAL — bukan default):
#    tools/yui-daemon.sh --pm2 start         Jalankan YuiHime di PM2 daemon (via tools/yui-pm2.sh)
#    YUIHIME_PM2=1 tools/yui-daemon.sh start
#
#  Mode default: prod bila dist/server.cjs ada, selain itu dev.
#  Env override:
#    YUIHIME_SYSTEM_ROOT   Root data (default $HOME/.yuihime)
#    YUIHIME_DAEMON_PORT   Port health check (default 3000)
#    YUIHIME_PM2           "1" = pakai PM2 (setara --pm2); default tanpa PM2
#
#  Catatan: PM2 hanya dipakai bila diaktifkan eksplisit (--pm2 / YUIHIME_PM2=1).
#  Saat PM2 aktif, daemon dijalankan di PM2 daemon (via tools/yui-pm2.sh) dan
#  watchdog lokal TIDAK dipakai (PM2 yang mensupervisi).
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEBUG_SCRIPT="$PROJECT_DIR/tools/yui-debug.sh"
WATCHDOG_SCRIPT="$PROJECT_DIR/tools/yui-watchdog.sh"
PM2_SCRIPT="$PROJECT_DIR/tools/yui-pm2.sh"

PM2_MODE="${YUIHIME_PM2:-0}"
ARGS=()
for a in "$@"; do
  if [ "$a" = "--pm2" ]; then PM2_MODE=1;
  elif [ "$a" = "--no-pm2" ]; then PM2_MODE=0;
  else ARGS+=("$a"); fi
done
set -- "${ARGS[@]}"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

SYSTEM_ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DEBUG_DIR="$SYSTEM_ROOT/debug"
CURRENT_META="$DEBUG_DIR/current.meta"
CURRENT_LOG="$DEBUG_DIR/current.log"
WATCHDOG_PIDFILE="$DEBUG_DIR/watchdog.pid"
WATCHDOG_LOG="$DEBUG_DIR/watchdog.log"

DEFAULT_PORT="${YUIHIME_DAEMON_PORT:-3000}"
PM2_APP="yuihime"

log()  { printf '%b%s%b\n' "$CYAN" "$*" "$NC"; }
ok()   { printf '%b%s%b\n' "$GREEN" "✔ $*" "$NC"; }
warn() { printf '%b%s%b\n' "$YELLOW" "⚠ $*" "$NC"; }
err()  { printf '%b%s%b\n' "$RED" "✖ $*" "$NC" >&2; }

is_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

daemon_port() {
  local p=""
  [ -f "$CURRENT_META" ] && p=$(sed -n '3p' "$CURRENT_META" 2>/dev/null)
  echo "${p:-$DEFAULT_PORT}"
}

daemon_healthy() {
  curl -sS --max-time 3 -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$(daemon_port)/api/health" 2>/dev/null | grep -q '^200$'
}

watchdog_running() {
  [ -f "$WATCHDOG_PIDFILE" ] && is_alive "$(cat "$WATCHDOG_PIDFILE" 2>/dev/null)"
}

pm2_enabled() {
  [ "$PM2_MODE" = "1" ] && command -v pm2 >/dev/null 2>&1
}

pm2_app_running() {
  pm2_enabled || return 1
  [ -n "$(pm2 pid "$PM2_APP" 2>/dev/null)" ]
}

default_mode() {
  if [ -f "$PROJECT_DIR/dist/server.cjs" ]; then echo "prod"; else echo "dev"; fi
}

wait_healthy() {
  local max="${1:-30}" waited=0
  while [ "$waited" -lt "$max" ]; do
    daemon_healthy && return 0
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

ensure_watchdog() {
  local mode="$1"
  if watchdog_running; then
    ok "Watchdog sudah aktif (supervisi daemon)"
  elif "$WATCHDOG_SCRIPT" start "$mode" >/dev/null 2>&1; then
    ok "Watchdog aktif (supervisi daemon)"
  else
    warn "Watchdog start gagal — cek $WATCHDOG_LOG"
  fi
}

start_via_watchdog() {
  local mode="$1"
  log "Start via watchdog + yui-debug.sh (mode $mode) ..."
  if "$WATCHDOG_SCRIPT" start "$mode" >/dev/null 2>&1; then
    ok "Watchdog aktif — daemon di-start di background"
    return 0
  fi
  err "Watchdog gagal start — cek $WATCHDOG_LOG"
  return 1
}

# --- Start -------------------------------------------------------------------
cmd_start() {
  local mode="${1:-}"
  [ -z "$mode" ] && mode=$(default_mode)

  ok "Mengaktifkan daemon (mode $mode) ..."

  if daemon_healthy; then
    ok "Daemon sudah sehat (port $(daemon_port)) — memastikan supervisor."
    if pm2_enabled; then
      log "Mode PM2 aktif — supervisor dikelola tools/yui-pm2.sh (watchdog lokal dilewati)."
      "$PM2_SCRIPT" status || true
    else
      ensure_watchdog "$mode"
    fi
    return 0
  fi

  if pm2_enabled; then
    log "Mode PM2 (OPSIONAL) — start via tools/yui-pm2.sh ..."
    if "$PM2_SCRIPT" start "$mode"; then
      ok "Daemon via PM2 (port $(daemon_port))"
    else
      warn "Start PM2 gagal — cek: tools/yui-pm2.sh logs"
    fi
    return 0
  fi

  start_via_watchdog "$mode" || return 1
  wait_healthy 30 && ok "Daemon sehat (port $(daemon_port))" || warn "Daemon belum sehat — cek: $DEBUG_DIR/current.log"
}

# --- Stop --------------------------------------------------------------------
cmd_stop() {
  warn "Menghentikan daemon ..."
  if pm2_enabled && pm2_app_running; then
    "$PM2_SCRIPT" stop
  fi
  "$WATCHDOG_SCRIPT" stop >/dev/null 2>&1 || true
  "$DEBUG_SCRIPT" stop
}

# --- Restart -----------------------------------------------------------------
cmd_restart() {
  local mode="${1:-}"
  [ -z "$mode" ] && mode=$(default_mode)
  warn "Restart daemon (mode $mode) ..."
  cmd_stop
  echo
  cmd_start "$mode"
}

# --- Status ------------------------------------------------------------------
cmd_status() {
  echo "============================================="
  echo "  YuiHime Daemon — terminal twin of /daemon"
  echo "============================================="
  "$DEBUG_SCRIPT" status
  if watchdog_running; then
    echo "Watchdog : HIDUP (PID $(cat "$WATCHDOG_PIDFILE" 2>/dev/null))"
  else
    echo "Watchdog : MATI"
  fi
  if [ "$PM2_MODE" = "1" ]; then
    if command -v pm2 >/dev/null 2>&1; then
      if pm2_app_running; then
        echo "PM2      : OPSI AKTIF ($PM2_APP) — daemon jalan di PM2"
      else
        echo "PM2      : OPSI AKTIF (tidak ada app '$PM2_APP' berjalan)"
      fi
    else
      echo "PM2      : OPSI AKTIF tapi PM2 tidak terpasang"
    fi
  else
    echo "PM2      : OPSI NONAKTIF (default) — aktifkan dengan --pm2 / YUIHIME_PM2=1"
  fi
}

# --- Logs --------------------------------------------------------------------
cmd_logs() {
  local arg="${1:-40}"
  if [ "$arg" = "-live" ] || [ "$arg" = "live" ] || [ "$arg" = "-f" ]; then
    if [ "$PM2_MODE" = "1" ] && pm2_app_running; then
      "$PM2_SCRIPT" logs -live
    else
      [ -f "$CURRENT_LOG" ] || { warn "Tidak ada log aktif."; return 1; }
      log "Log live (tail -f). Tekan Ctrl+C untuk keluar."
      "$DEBUG_SCRIPT" logs
    fi
    return 0
  fi
  if [ "$PM2_MODE" = "1" ] && pm2_app_running; then
    "$PM2_SCRIPT" logs "$arg"
  elif [ -f "$CURRENT_LOG" ]; then
    "$DEBUG_SCRIPT" show "$arg"
  else
    warn "Tidak ada log aktif."
  fi
}

# --- Rebuild -----------------------------------------------------------------
cmd_rebuild() {
  ok "Rebuild proyek (npm run build: web + server) ..."
  ( cd "$PROJECT_DIR" && npm run build )
}

# --- Dispatch ----------------------------------------------------------------
case "${1:-help}" in
  start)    shift; cmd_start "${1:-}";;
  stop)     shift; cmd_stop;;
  restart)  shift; cmd_restart "${1:-}";;
  status)   cmd_status;;
  logs)     shift; cmd_logs "${1:-40}";;
  rebuild)  cmd_rebuild;;
  help|-h|--help) sed -n '2,31p' "${BASH_SOURCE[0]}";;
  *) err "Perintah tidak dikenal: '${1:-}'"; sed -n '2,31p' "${BASH_SOURCE[0]}"; exit 1;;
esac
