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
#    tools/yui-watchdog.sh start [dev|prod] [--pm2|--no-pm2] [daemon extra...]
#                                     Mulai watchdog (otomatis start daemon bila belum jalan)
#    tools/yui-watchdog.sh restart [dev|prod] [--pm2|--no-pm2] [daemon extra...]
#                                     Restart penuh (watchdog + daemon). Mode diinfer dari
#                                     current.meta bila argumen mode tidak diberikan.
#    tools/yui-watchdog.sh stop               Hentikan watchdog (daemon dibiarkan tetap jalan)
#    tools/yui-watchdog.sh status             Status watchdog + daemon
#    tools/yui-watchdog.sh log                Tail log watchdog
#
#  Mode PM2-aware (OPSIONAL):
#    --pm2 / YUIHIME_PM2=1 — daemon dikelola PM2 (tools/yui-pm2.sh). Watchdog
#    hanya men-probe health; saat hang/crash ia memanggil `pm2 restart yuihime`
#    (tidak menyentuh yui-debug.sh). Stop manual = app PM2 tidak berjalan.
#
#  Env override:
#    YUIHIME_WATCHDOG_INTERVAL   Polling interval (s, default 10)
#    YUIHIME_WATCHDOG_MAX_TIME   curl max-time per probe (s, default 8)
#    YUIHIME_WATCHDOG_FAILURES   Kegagalan beruntun sebelum restart (default 2)
#    YUIHIME_WATCHDOG_BOOT       Tunggu daemon sehat setelah start (s, default 180)
#    YUIHIME_WATCHDOG_RESTART_MAX    Maks restart dalam jendela (default 4)
#    YUIHIME_WATCHDOG_RESTART_WINDOW Jendela restart (s, default 600)
#    YUIHIME_DAEMON_PORT   Port default daemon (default 3000)
#    YUIHIME_CWD           Direktori kerja daemon (default root proyek)
#
#  Argumen tambahan setelah mode (mis. --port 4000) diteruskan ke daemon saat
#  start pertama maupun restart otomatis.
#
#  Catatan:
#  - Mode non-PM2: daemon yang dihentikan via `tools/yui-debug.sh stop` menghapus
#    current.meta — watchdog membaca itu sebagai stop manual dan keluar.
#  - Mode PM2: app PM2 'yuihime' berhenti/hapus = stop manual → watchdog keluar.
#  - Restart otomatis yang GAGAL start tidak lagi dianggap "stop manual":
#    watchdog tetap hidup dan mencoba ulang, dibatasi RESTART_MAX dalam
#    RESTART_WINDOW (anti crash-loop).
#  - Health probe memakai curl bila ada; tanpa curl memakai /dev/tcp (bash).
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEBUG_SCRIPT="$PROJECT_DIR/tools/yui-debug.sh"
PM2_APP="yuihime"

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

DEFAULT_PORT="${YUIHIME_DAEMON_PORT:-3000}"
PM2_MODE="${YUIHIME_PM2:-0}"

mkdir -p "$DEBUG_DIR"

log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$WATCHDOG_LOG"; }

# Rotasi watchdog.log bila membesar (default 1MB) — cegah file tumbuh tanpa batas.
rotate_log() {
  if [ -f "$WATCHDOG_LOG" ]; then
    local size
    size=$(wc -c < "$WATCHDOG_LOG" 2>/dev/null || echo 0)
    if [ "$size" -gt "${YUIHIME_WATCHDOG_LOG_MAX:-1048576}" ]; then
      mv -f "$WATCHDOG_LOG" "$WATCHDOG_LOG.old" 2>/dev/null || true
      log "watchdog.log dirotasi (>1MB) -> watchdog.log.old"
    fi
  fi
}

is_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# Mode PM2-aware — daemon dikelola PM2, watchdog hanya probe health + pm2 restart.
pm2_app_running() {
  command -v pm2 >/dev/null 2>&1 || return 1
  local pid
  pid=$(pm2 pid "$PM2_APP" 2>/dev/null)
  [ -n "$pid" ] && [ "$pid" != "0" ] && is_alive "$pid"
}

port_of() {
  # Mode PM2: port selalu dari env (meta tidak dikelola PM2).
  [ "$PM2_MODE" = "1" ] && { echo "${1:-$DEFAULT_PORT}"; return; }
  local p=""
  [ -f "$CURRENT_META" ] && p=$(sed -n '3p' "$CURRENT_META" 2>/dev/null)
  [ -n "$p" ] && echo "$p" || echo "${1:-$DEFAULT_PORT}"
}

# PID proses daemon saat ini (PM2: pid app; non-PM2: baris 1 current.meta).
daemon_pid() {
  if [ "$PM2_MODE" = "1" ]; then
    local pid
    pid=$(pm2 pid "$PM2_APP" 2>/dev/null)
    echo "$pid"
  else
    sed -n '1p' "$CURRENT_META" 2>/dev/null
  fi
}

# probe_tcp <port> — fallback health check tanpa curl (bash /dev/tcp).
probe_tcp() {
  local port="$1" status=""
  exec 3<>"/dev/tcp/127.0.0.1/$port" 2>/dev/null || { exec 3>&- 2>/dev/null; return 1; }
  printf 'GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' >&3
  IFS= read -r status <&3
  exec 3>&- 2>/dev/null
  case "$status" in
    *" 200 "*) return 0 ;;
  esac
  return 1
}

health_ok() {
  local port="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -sS --max-time "$MAX_TIME" -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:$port/api/health" 2>/dev/null | grep -q '^200$'
  else
    probe_tcp "$port"
  fi
}

# restart_daemon <mode> [extra...] — PM2: pm2 restart; non-PM2: force kill + start ulang
restart_daemon() {
  log "===== RESTART (auto-hang/crash) $(date '+%Y-%m-%d %H:%M:%S') ====="
  if [ "$PM2_MODE" = "1" ]; then
    log "RESTART(PM2): pm2 restart '$PM2_APP' ..."
    if pm2 restart "$PM2_APP" >/dev/null 2>&1; then
      return 0
    fi
    log "RESTART(PM2): pm2 restart GAGAL"
    return 1
  fi
  local mode="$1"; shift
  local extra=()
  [ $# -gt 0 ] && extra=("$@")
  log "RESTART: membunuh daemon (force, termasuk process group/esbuild) ..."
  "$DEBUG_SCRIPT" stop --force >/dev/null 2>&1 || true
  pkill -9 -f "esbuild --service" 2>/dev/null || true
  sleep 2
  log "RESTART: start mode '$mode' ..."
  local start_cmd=("$DEBUG_SCRIPT" start "$mode")
  [ ${#extra[@]} -gt 0 ] && start_cmd+=("${extra[@]}")
  "${start_cmd[@]}" >/dev/null 2>&1 || {
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
  local mode="${1:-dev}"; [ $# -gt 0 ] && shift
  local extra=()
  local pm2_mode="$PM2_MODE"
  while [ $# -gt 0 ]; do
    case "$1" in
      --pm2)   pm2_mode=1; shift;;
      --no-pm2) pm2_mode=0; shift;;
      *) extra+=("$1"); shift;;
    esac
  done
  PM2_MODE="$pm2_mode"
  local fail_count=0
  local restart_times=()
  local started=0
  local we_restarting=0
  local manual_candidate=0
  local now port meta_pid due
  local suplabel; [ "$PM2_MODE" = "1" ] && suplabel="PM2-aware" || suplabel="debug"

  # Graceful exit saat cmd_stop mengirim TERM (log tertulis, bukan mati diam-diam).
  trap 'log "=== Watchdog dihentikan (SIGTERM) ==="; rm -f "$WATCHDOG_PIDFILE"; exit 0' TERM
  rotate_log

  log "=== Watchdog mulai (supervisor=$suplabel interval=${INTERVAL}s max_time=${MAX_TIME}s fail_threshold=${FAIL_THRESHOLD} mode=$mode) ==="

  # Pastikan daemon jalan sejak awal
  if [ "$PM2_MODE" = "1" ]; then
    if pm2_app_running; then
      log "PM2 app '$PM2_APP' sudah jalan, tidak start ulang."
    else
      log "PM2 app '$PM2_APP' belum jalan — coba hidupkan (resurrect/restart) ..."
      command -v pm2 >/dev/null 2>&1 || { log "PM2 tidak terpasang — keluar."; return 1; }
      pm2 resurrect >/dev/null 2>&1 || true
      if pm2 restart "$PM2_APP" >/dev/null 2>&1; then
        log "PM2 app '$PM2_APP' berhasil di-restart."
      else
        log "Gagal menghidupkan '$PM2_APP' (belum terdaftar di PM2?) — jalankan dulu 'tools/yui-pm2.sh start $mode'."
        return 1
      fi
      port=$(port_of "$DEFAULT_PORT")
      wait_healthy "$port" || { log "Daemon tidak sehat dalam ${BOOT_TIMEOUT}s — keluar."; return 1; }
    fi
  elif [ -f "$CURRENT_META" ] && is_alive "$(sed -n '1p' "$CURRENT_META")"; then
    log "Daemon sudah berjalan, tidak start ulang."
  else
    log "Daemon belum berjalan — start pertama ..."
    local start_cmd=("$DEBUG_SCRIPT" start "$mode")
    [ ${#extra[@]} -gt 0 ] && start_cmd+=("${extra[@]}")
    "${start_cmd[@]}" >/dev/null 2>&1 || { log "Start awal GAGAL — keluar."; return 1; }
    port=$(port_of "$DEFAULT_PORT")
    wait_healthy "$port" || { log "Daemon tidak sehat dalam ${BOOT_TIMEOUT}s — keluar."; return 1; }
  fi

  while true; do
    # Tunggu interval lewat dengan sleep pendek (1s). Di proot, sinyal yang
    # masuk hanya diproses saat sleep selesai, jadi sleep panjang membuat
    # respon TERM molor hingga INTERVAL detik. Polling pendek = respon <=1s.
    due=$(( $(date +%s) + INTERVAL ))
    while [ "$(date +%s)" -lt "$due" ]; do
      sleep 1
    done
    port=$(port_of "$DEFAULT_PORT")

    # Stop manual (daemon dihentikan dari luar). Beda mode:
    #  - non-PM2: current.meta hilang (yui-debug.sh stop).
    #  - PM2: app tidak berjalan (pm2 stop/delete). PM2 restart sempat membuat
    #    pid kosong sesaat → tunggu 2 siklus sebelum menyimpulkan stop manual.
    # Keduanya ditekan saat we_restarting=1 (restart kita sendiri yang belum
    # menghasilkan proses/pid) — biarkan logika RESTART_MAX yang memutuskan.
    if [ "$PM2_MODE" = "1" ]; then
      if ! pm2_app_running; then
        if [ "$we_restarting" = "1" ]; then
          log "PM2 app tidak terlihat setelah restart — retry terbatas RESTART_MAX."
        else
          manual_candidate=$((manual_candidate + 1))
          if [ "$manual_candidate" -ge 2 ]; then
            log "PM2 app '$PM2_APP' tidak berjalan (stop manual) — watchdog keluar."
            break
          fi
          log "PM2 app '$PM2_APP' tidak terlihat (kandidat stop manual #$manual_candidate) — konfirmasi siklus berikut."
        fi
      else
        manual_candidate=0
        we_restarting=0
      fi
    else
      if [ ! -f "$CURRENT_META" ]; then
        if [ "$we_restarting" = "1" ]; then
          log "Meta hilang setelah restart (start GAGAL) — retry terbatas RESTART_MAX."
        else
          log "current.meta hilang (stop manual) — watchdog keluar."
          break
        fi
      else
        we_restarting=0
      fi
    fi
    meta_pid=$(daemon_pid)

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
    we_restarting=1
    restart_daemon "$mode" "${extra[@]}"
    port=$(port_of "$DEFAULT_PORT")
    wait_healthy "$port" || { log "Pasca-restart tidak sehat dalam ${BOOT_TIMEOUT}s."; }
    started=$((started + 1))
    log "Restart #$started selesai."
  done

  log "=== Watchdog berhenti ==="
}

cmd_start() {
  local mode="${1:-dev}"; [ $# -gt 0 ] && shift
  local extra=()
  local pm2_mode="$PM2_MODE"
  while [ $# -gt 0 ]; do
    case "$1" in
      --pm2)   pm2_mode=1; shift;;
      --no-pm2) pm2_mode=0; shift;;
      *) extra+=("$1"); shift;;
    esac
  done
  if [ -f "$WATCHDOG_PIDFILE" ] && is_alive "$(cat "$WATCHDOG_PIDFILE")"; then
    echo "Watchdog sudah berjalan (PID $(cat "$WATCHDOG_PIDFILE"))."
    exit 1
  fi
  local qargs=() a argstr=""
  for a in "${extra[@]}"; do qargs+=("$(printf '%q' "$a")"); done
  [ ${#qargs[@]} -gt 0 ] && argstr=" ${qargs[*]}"
  local pmarg="--no-pm2"; [ "$pm2_mode" = "1" ] && pmarg="--pm2"
  rotate_log
  nohup bash -c "exec \"$0\" __run \"$mode\" $pmarg$argstr" >> "$WATCHDOG_LOG" 2>&1 &
  local wpid=$!
  echo "$wpid" > "$WATCHDOG_PIDFILE"
  sleep 1
  if is_alive "$wpid"; then
    echo "Watchdog berjalan (PID $wpid, mode $mode, $pmarg). Log: $WATCHDOG_LOG"
  else
    echo "Watchdog gagal memulai — cek $WATCHDOG_LOG"; rm -f "$WATCHDOG_PIDFILE"; exit 1
  fi
}

stop_watchdog() {
  if [ ! -f "$WATCHDOG_PIDFILE" ] || ! is_alive "$(cat "$WATCHDOG_PIDFILE")"; then
    rm -f "$WATCHDOG_PIDFILE"
    return 0
  fi
  local pid; pid=$(cat "$WATCHDOG_PIDFILE")
  kill -TERM "$pid" 2>/dev/null
  # Di proot, TERM baru diproses saat sleep pendek selesai (<=1s). Tunggu
  # periodik singkat sebelum fallback SIGKILL agar trap graceful sempat jalan.
  local waited=0
  while is_alive "$pid" && [ "$waited" -lt 5 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if is_alive "$pid"; then
    echo "TERM tidak diproses dalam 5s — SIGKILL fallback."
    kill -KILL "$pid" 2>/dev/null || true
  fi
  pkill -TERM -f "yui-watchdog.sh __run" 2>/dev/null || true
  rm -f "$WATCHDOG_PIDFILE"
}

cmd_stop() {
  if [ ! -f "$WATCHDOG_PIDFILE" ] || ! is_alive "$(cat "$WATCHDOG_PIDFILE")"; then
    echo "Watchdog tidak berjalan."
    stop_watchdog
    exit 0
  fi
  stop_watchdog
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
  if [ "$PM2_MODE" = "1" ]; then
    if pm2_app_running; then
      echo "PM2 app  : '$PM2_APP' BERJALAN (PID $(daemon_pid))"
    else
      echo "PM2 app  : '$PM2_APP' TIDAK berjalan"
    fi
  else
    "$DEBUG_SCRIPT" status 2>&1
  fi
}

cmd_restart() {
  local mode="${1:-}"; [ $# -gt 0 ] && shift
  local extra=()
  local pm2_mode="$PM2_MODE"
  while [ $# -gt 0 ]; do
    case "$1" in
      --pm2)   pm2_mode=1; shift;;
      --no-pm2) pm2_mode=0; shift;;
      *) extra+=("$1"); shift;;
    esac
  done

  # Infer mode bila tidak diberikan: baca baris 2 current.meta bila daemon masih hidup.
  if [ -z "$mode" ] && [ -f "$CURRENT_META" ]; then
    local meta_pid meta_mode
    meta_pid=$(sed -n '1p' "$CURRENT_META" 2>/dev/null)
    meta_mode=$(sed -n '2p' "$CURRENT_META" 2>/dev/null)
    if [ -n "$meta_mode" ] && is_alive "$meta_pid"; then
      mode="$meta_mode"
    fi
  fi
  [ -z "$mode" ] && mode="dev"

  local pmarg="--no-pm2"; [ "$pm2_mode" = "1" ] && pmarg="--pm2"

  # Marker restart di log (dibaca live oleh `log` dari terminal lain).
  log "===== RESTART (manual, mode=$mode) $(date '+%Y-%m-%d %H:%M:%S') ====="

  # 1) Hentikan watchdog (daemon dibiarkan jalan).
  stop_watchdog
  # 2) Stop daemon (PM2-aware) agar restart memuat build terbaru.
  if [ "$pm2_mode" = "1" ]; then
    log "RESTART(PM2): pm2 restart '$PM2_APP' ..."
    pm2 restart "$PM2_APP" >/dev/null 2>&1 || pm2 stop "$PM2_APP" >/dev/null 2>&1 || true
  else
    "$DEBUG_SCRIPT" stop >/dev/null 2>&1 || true
    pkill -9 -f "esbuild --service" 2>/dev/null || true
  fi
  # 3) Start watchdog (akan men-start daemon karena meta/daemon sudah mati).
  echo "Restart watchdog + daemon (mode $mode, $pmarg)."
  cmd_start "$mode" "$pmarg" "${extra[@]}"
}

case "${1:-help}" in
  start)      shift; cmd_start "$@";;
  restart)    shift; cmd_restart "$@";;
  stop)       cmd_stop;;
  status)     cmd_status;;
  log)        tail -F "$WATCHDOG_LOG" 2>/dev/null || echo "Belum ada log.";;
  __run)      shift; run_watchdog "$@";;
  help|-h)    sed -n '2,20p' "${BASH_SOURCE[0]}";;
  *) echo "Perintah tidak dikenal: '${1:-}'"; sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 1;;
esac
