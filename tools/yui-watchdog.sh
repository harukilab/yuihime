#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Watchdog — auto-restart daemon saat hang / crash
#
#  Latar belakang:
#  Di lingkungan proot (UserLAnd ARM), better-sqlite3/SQLite dapat membekukan
#  main thread di loop native (event loop mati total) setelah beban DB berat.
#  Endpoint /api/health murni JS — hanya responsif jika event loop hidup,
#  sehingga timeout pada endpoint = deteksi freeze yang andal.
#
#  Usage:
#    tools/yui-watchdog.sh start [dev|prod]   Mulai watchdog (otomatis start daemon bila belum jalan)
#    tools/yui-watchdog.sh stop               Hentikan watchdog (daemon dibiarkan tetap jalan)
#    tools/yui-watchdog.sh status             Status watchdog + daemon
#    tools/yui-watchdog.sh log                Tail log watchdog
#
#  Env override:
#    YUIHIME_WATCHDOG_INTERVAL   Polling interval (s, default 10)
#    YUIHIME_WATCHDOG_MAX_TIME   curl max-time per probe (s, default 8)
#    YUIHIME_WATCHDOG_FAILURES   Kegagalan beruntun sebelum restart (default 2)
#    YUIHIME_WATCHDOG_BOOT       Tunggu daemon sehat setelah start (s, default 180)
#    YUIHIME_WATCHDOG_RESTART_MAX    Maks restart dalam jendela (default 4)
#    YUIHIME_WATCHDOG_RESTART_WINDOW Jendela restart (s, default 600)
#
#  Catatan: daemon yang dihentikan via `tools/yui-debug.sh stop` menghapus
#  current.meta — watchdog membaca itu sebagai stop manual dan keluar.
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEBUG_SCRIPT="$PROJECT_DIR/tools/yui-debug.sh"

SYSTEM_ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DEBUG_DIR="$SYSTEM_ROOT/debug"
CURRENT_META="$DEBUG_DIR/current.meta"
WATCHDOG_LOG="$DEBUG_DIR/watchdog.log"
WATCHDOG_PIDFILE="$DEBUG_DIR/watchdog.pid"

INTERVAL="${YUIHIME_WATCHDOG_INTERVAL:-10}"
MAX_TIME="${YUIHIME_WATCHDOG_MAX_TIME:-8}"
FAIL_THRESHOLD="${YUIHIME_WATCHDOG_FAILURES:-2}"
BOOT_TIMEOUT="${YUIHIME_WATCHDOG_BOOT:-180}"
RESTART_MAX="${YUIHIME_WATCHDOG_RESTART_MAX:-4}"
RESTART_WINDOW="${YUIHIME_WATCHDOG_RESTART_WINDOW:-600}"

DEFAULT_PORT="3000"

mkdir -p "$DEBUG_DIR"

log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$WATCHDOG_LOG"; }

is_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

port_of() {
  local p=""
  [ -f "$CURRENT_META" ] && p=$(sed -n '3p' "$CURRENT_META" 2>/dev/null)
  [ -n "$p" ] && echo "$p" || echo "${1:-$DEFAULT_PORT}"
}

health_ok() {
  local port="$1"
  curl -sS --max-time "$MAX_TIME" -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$port/api/health" 2>/dev/null | grep -q '^200$'
}

# restart_daemon <mode> — force kill semua (termasuk esbuild) lalu start ulang
restart_daemon() {
  local mode="$1"
  log "RESTART: membunuh daemon (force, termasuk process group/esbuild) ..."
  "$DEBUG_SCRIPT" stop --force >/dev/null 2>&1 || true
  pkill -9 -f "esbuild --service" 2>/dev/null || true
  sleep 2
  log "RESTART: start mode '$mode' ..."
  "$DEBUG_SCRIPT" start "$mode" >/dev/null 2>&1 || {
    log "RESTART: start GAGAL"
    return 1
  }
  return 0
}

wait_healthy() {
  local port="$1"
  local waited=0
  while [ $waited -lt "$BOOT_TIMEOUT" ]; do
    if health_ok "$port"; then
      log "Daemon sehat (port $port) setelah ~${waited}s"
      return 0
    fi
    sleep 5; waited=$((waited + 5))
  done
  return 1
}

run_watchdog() {
  local mode="$1"
  local fail_count=0
  local restart_times=()
  local started=0
  local now port pid meta_pid

  log "=== Watchdog mulai (interval=${INTERVAL}s max_time=${MAX_TIME}s fail_threshold=${FAIL_THRESHOLD} mode=$mode) ==="

  # Pastikan daemon jalan sejak awal
  if [ -f "$CURRENT_META" ] && is_alive "$(sed -n '1p' "$CURRENT_META")"; then
    log "Daemon sudah berjalan, tidak start ulang."
  else
    log "Daemon belum berjalan — start pertama ..."
    "$DEBUG_SCRIPT" start "$mode" >/dev/null 2>&1 || { log "Start awal GAGAL — keluar."; return 1; }
    port=$(port_of "$DEFAULT_PORT")
    wait_healthy "$port" || { log "Daemon tidak sehat dalam ${BOOT_TIMEOUT}s — keluar."; return 1; }
  fi

  while true; do
    sleep "$INTERVAL"
    port=$(port_of "$DEFAULT_PORT")

    # Meta hilang = daemon di-stop manual via yui-debug.sh — keluar.
    if [ ! -f "$CURRENT_META" ]; then
      log "current.meta hilang (stop manual) — watchdog keluar."
      break
    fi
    meta_pid=$(sed -n '1p' "$CURRENT_META" 2>/dev/null)

    if health_ok "$port"; then
      fail_count=0
      continue
    fi

    fail_count=$((fail_count + 1))
    now=$(date +%s)

    if is_alive "$meta_pid" && [ "$fail_count" -lt "$FAIL_THRESHOLD" ]; then
      log "Probe gagal #$fail_count (proses hidup PID $meta_pid) — tunggu konfirmasi."
      continue
    fi

    if ! is_alive "$meta_pid" && [ ! -f "$CURRENT_META" ]; then
      log "Proses mati + meta hilang (stop manual) — watchdog keluar."
      break
    fi

    # Batas restart dalam jendela waktu (cegah crash-loop)
    now=$(date +%s)
    restart_times=($(for t in "${restart_times[@]:-}"; do [ $((now - t)) -lt "$RESTART_WINDOW" ] && echo "$t"; done))
    if [ "${#restart_times[@]}" -ge "$RESTART_MAX" ]; then
      log "TERLALU BANYAK RESTART (${#restart_times[@]} dalam ${RESTART_WINDOW}s) — berhenti untuk mencegah crash-loop. Periksa manual."
      break
    fi

    log "DETECT HANG/CRASH: fail_count=$fail_count proses=$([ -n "$meta_pid" ] && echo "hidup($meta_pid)" || echo "mati") — restart."
    restart_times+=("$(date +%s)")
    fail_count=0
    restart_daemon "$mode"
    port=$(port_of "$DEFAULT_PORT")
    wait_healthy "$port" || { log "Pasca-restart tidak sehat dalam ${BOOT_TIMEOUT}s."; }
    started=$((started + 1))
    log "Restart #$started selesai."
  done

  log "=== Watchdog berhenti ==="
}

cmd_start() {
  local mode="${1:-dev}"
  if [ -f "$WATCHDOG_PIDFILE" ] && is_alive "$(cat "$WATCHDOG_PIDFILE")"; then
    echo "Watchdog sudah berjalan (PID $(cat "$WATCHDOG_PIDFILE"))."
    exit 1
  fi
  nohup bash -c "exec \"$0\" __run \"$mode\"" >> "$WATCHDOG_LOG" 2>&1 &
  local wpid=$!
  echo "$wpid" > "$WATCHDOG_PIDFILE"
  sleep 1
  if is_alive "$wpid"; then
    echo "Watchdog berjalan (PID $wpid, mode $mode). Log: $WATCHDOG_LOG"
  else
    echo "Watchdog gagal memulai — cek $WATCHDOG_LOG"; rm -f "$WATCHDOG_PIDFILE"; exit 1
  fi
}

cmd_stop() {
  if [ ! -f "$WATCHDOG_PIDFILE" ] || ! is_alive "$(cat "$WATCHDOG_PIDFILE")"; then
    echo "Watchdog tidak berjalan."
    rm -f "$WATCHDOG_PIDFILE"
    exit 0
  fi
  local pid; pid=$(cat "$WATCHDOG_PIDFILE")
  kill -TERM "$pid" 2>/dev/null
  # Anaknya (loop utama) dihentikan setelah sleep interval berikutnya; kill grup agar instan
  pkill -TERM -f "yui-watchdog.sh __run" 2>/dev/null || true
  sleep 1
  if is_alive "$pid"; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$WATCHDOG_PIDFILE"
  echo "Watchdog berhenti. Daemon YuiHime tidak disentuh."
}

cmd_status() {
  local wpid=""
  [ -f "$WATCHDOG_PIDFILE" ] && wpid=$(cat "$WATCHDOG_PIDFILE")
  if [ -n "$wpid" ] && is_alive "$wpid"; then
    echo "Watchdog : HIDUP (PID $wpid)"
  else
    echo "Watchdog : MATI"
  fi
  "$DEBUG_SCRIPT" status 2>&1
}

case "${1:-help}" in
  start)      shift; cmd_start "${1:-dev}";;
  stop)       cmd_stop;;
  status)     cmd_status;;
  log)        tail -f "$WATCHDOG_LOG" 2>/dev/null || echo "Belum ada log.";;
  __run)      shift; run_watchdog "${1:-dev}";;
  help|-h)    sed -n '2,18p' "${BASH_SOURCE[0]}";;
  *) echo "Perintah tidak dikenal: '${1:-}'"; sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 1;;
esac
