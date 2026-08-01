#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Boot Hook — bangunkan daemon + supervisor setelah device reboot
#
#  Cocok untuk: Termux:Boot (~/.termux/boot/*.sh), UserLAnd (command saat
#  login), cron @reboot, atau init.d. Cukup panggil satu script ini.
#
#  Usage:
#    bash scripts/boot.sh [--pm2|--no-pm2] [dev|prod]
#
#  Mode default (non-PM2):
#    tools/yui-daemon.sh start  → men-start daemon DAN watchdog lokal
#    (watchdog: probe /api/health, restart saat hang/crash)
#
#  Mode PM2 (--pm2 / YUIHIME_PM2=1):
#    pm2 resurrect (restore daftar app dari dump)
#    pastikan app PM2 'yuihime' jalan (start bila belum)
#    watchdog PM2-aware: probe health → `pm2 restart yuihime` saat hang
#
#  Env override:
#    YUIHIME_PM2           "1" = mode PM2
#    YUIHIME_BOOT_DELAY    Jeda sebelum start (s, default 10) — tunggu
#                          jaringan/DB/FS siap setelah reboot
#    YUIHIME_SYSTEM_ROOT   Root data (default $HOME/.yuihime)
#    YUIHIME_DAEMON_PORT   Port daemon (default 3000)
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DAEMON_SCRIPT="$PROJECT_DIR/tools/yui-daemon.sh"
WATCHDOG_SCRIPT="$PROJECT_DIR/tools/yui-watchdog.sh"
PM2_SCRIPT="$PROJECT_DIR/tools/yui-pm2.sh"

SYSTEM_ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DEBUG_DIR="$SYSTEM_ROOT/debug"
BOOT_LOG="$DEBUG_DIR/boot.log"
PM2_APP="yuihime"

BOOT_DELAY="${YUIHIME_BOOT_DELAY:-10}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { printf '%b[%s] %s%b\n' "$CYAN" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$NC" | tee -a "$BOOT_LOG"; }
ok()   { printf '%b[%s] ✔ %s%b\n' "$GREEN" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$NC" | tee -a "$BOOT_LOG"; }
warn() { printf '%b[%s] ⚠ %s%b\n' "$YELLOW" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$NC" | tee -a "$BOOT_LOG"; }
err()  { printf '%b[%s] ✖ %s%b\n' "$RED" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$NC" | tee -a "$BOOT_LOG"; }

# Pastikan PATH lengkap (nvm/global) — Termux:Boot kadang non-login shell.
ensure_path() {
  command -v pm2 >/dev/null 2>&1 && return 0
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
  fi
  command -v pm2 >/dev/null 2>&1
}

default_mode() {
  [ -f "$PROJECT_DIR/dist/server.cjs" ] && { echo "prod"; return; }
  echo "dev"
}

mkdir -p "$DEBUG_DIR"

PM2_MODE="${YUIHIME_PM2:-0}"
MODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pm2)   PM2_MODE=1; shift;;
    --no-pm2) PM2_MODE=0; shift;;
    dev|prod) MODE="$1"; shift;;
    *) shift;;
  esac
done
[ -z "$MODE" ] && MODE=$(default_mode)

log "=== YuiHime boot hook (mode=$MODE pm2=${PM2_MODE}) ==="
log "Jeda boot ${BOOT_DELAY}s (YUIHIME_BOOT_DELAY) ..."
sleep "$BOOT_DELAY"

if [ "$PM2_MODE" = "1" ]; then
  if ! ensure_path || ! command -v pm2 >/dev/null 2>&1; then
    warn "Mode PM2 diminta tapi pm2 tidak ditemukan — fallback ke mode non-PM2."
    PM2_MODE=0
  fi
fi

if [ "$PM2_MODE" = "1" ]; then
  log "Mode PM2: resurrect + pastikan app '$PM2_APP' jalan ..."
  pm2 resurrect >/dev/null 2>&1 || true
  if ! app_pid=$(pm2 pid "$PM2_APP" 2>/dev/null) || [ -z "$app_pid" ]; then
    log "App '$PM2_APP' belum ada di PM2 — start via tools/yui-pm2.sh ..."
    "$PM2_SCRIPT" start "$MODE" >/dev/null 2>&1 \
      && ok "App '$PM2_APP' start via PM2 (port ${YUIHIME_DAEMON_PORT:-3000})" \
      || err "tools/yui-pm2.sh start GAGAL — cek: pm2 logs $PM2_APP"
  else
    log "App '$PM2_APP' sudah ada (PID $app_pid) — tidak start ulang."
  fi
  log "Men-start watchdog PM2-aware ..."
  if "$WATCHDOG_SCRIPT" start "$MODE" --pm2 >/dev/null 2>&1; then
    ok "Watchdog PM2-aware aktif (probe health → pm2 restart saat hang)"
  else
    warn "Watchdog PM2-aware start gagal — cek $DEBUG_DIR/watchdog.log"
  fi
else
  log "Mode non-PM2: tools/yui-daemon.sh start (daemon + watchdog) ..."
  if "$DAEMON_SCRIPT" start "$MODE" >/dev/null 2>&1; then
    ok "Daemon + watchdog aktif"
  else
    warn "tools/yui-daemon.sh start belum sepenuhnya berhasil — cek $DEBUG_DIR/current.log & watchdog.log"
  fi
fi

log "=== Boot hook selesai ==="
