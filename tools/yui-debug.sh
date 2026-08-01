#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Debug Runner — jalankan Yui di background + capture log untuk developer
#
#  Usage:
#    tools/yui-debug.sh start [dev|prod] [extra args...]   Jalankan daemon di background
#    tools/yui-debug.sh start -f [dev|prod] [...args]      Jalankan foreground (log ke console + file)
#    tools/yui-debug.sh stop [--force]                     Stop graceful (SIGINT), fallback SIGKILL
#    tools/yui-debug.sh restart [dev|prod] [...args]       Stop lalu start
#    tools/yui-debug.sh status                             Status proses + tail log
#    tools/yui-debug.sh logs                               Tail -f session log aktif
#    tools/yui-debug.sh show [N]                           Print N baris terakhir log (default 60)
#    tools/yui-debug.sh list                               Daftar session log
#    tools/yui-debug.sh clean [N]                          Hapus session lama, sisakan N (default 10)
#    tools/yui-debug.sh help                               Bantuan ini
#
#  Log lokasi:
#    ~/.yuihime/debug/current.log                          Session aktif
#    ~/.yuihime/debug/current.meta                         Metadata (pid, mode, port, cmd)
#    ~/.yuihime/debug/sessions/                            Session terdahulu
#
#  Catatan: stop mengirim SIGINT (graceful shutdown) lalu menunggu maksimal
#  GRACEFUL_TIMEOUT detik sebelum memaksa SIGKILL.
#
#  Env override (diprioritaskan CLI):
#    YUIHIME_DAEMON_PORT   Port daemon (default 3000) — setara arg --port
#    YUIHIME_CWD           Direktori kerja daemon (default root proyek) — setara arg --cwd
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

# --- Lokasi state ------------------------------------------------------------
SYSTEM_ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DEBUG_DIR="$SYSTEM_ROOT/debug"
SESSIONS_DIR="$DEBUG_DIR/sessions"
CURRENT_LOG="$DEBUG_DIR/current.log"
CURRENT_META="$DEBUG_DIR/current.meta"

DEFAULT_PORT="${YUIHIME_DAEMON_PORT:-3000}"
DAEMON_CWD="${YUIHIME_CWD:-$PROJECT_DIR}"
GRACEFUL_TIMEOUT="${YUIHIME_DEBUG_GRACEFUL_TIMEOUT:-15}"   # detik tunggu SIGINT
STARTUP_WAIT="${YUIHIME_DEBUG_STARTUP_WAIT:-5}"            # detik tunggu boot saat start

mkdir -p "$SESSIONS_DIR"

log()  { printf '%b%s%b\n' "$CYAN" "$*" "$NC"; }
ok()   { printf '%b%s%b\n' "$GREEN" "✔ $*" "$NC"; }
warn() { printf '%b%s%b\n' "$YELLOW" "⚠ $*" "$NC"; }
err()  { printf '%b%s%b\n' "$RED" "✖ $*" "$NC" >&2; }

is_alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

# server_bin: path binary prod — dist/server.cjs (repo) atau server.cjs (bundle portabel)
server_bin() {
  [ -f "$PROJECT_DIR/dist/server.cjs" ] && { echo "$PROJECT_DIR/dist/server.cjs"; return; }
  [ -f "$PROJECT_DIR/server.cjs" ] && { echo "$PROJECT_DIR/server.cjs"; return; }
}

# signal_group <pid> <signal> — sinyal ke seluruh process group (setsid),
# fallback ke proses tunggal jika group sudah tidak ada.
signal_group() {
  local pid="$1" sig="$2"
  if ! kill "-$sig" "-$pid" 2>/dev/null; then
    kill "-$sig" "$pid" 2>/dev/null
  fi
}

# real_server_pid <leader_pid> — PID server asli (anak langsung tsx cli).
# Di mode dev tsx membungkus server; leader hanya wrapper yang mati saat
# anak keluar. Kosong jika leader itu sendiri server (mode prod).
real_server_pid() {
  local child
  child=$(ps -o pid=,cmd= --ppid "$1" 2>/dev/null | grep -E 'server\.ts|dist/server\.cjs' | awk '{print $1}' | head -n 1)
  [ -n "$child" ] && echo "$child"
}

now_ts() { date +%s; }
fmt_uptime() {
  local s=$1 h m
  h=$((s / 3600)); m=$(((s % 3600) / 60)); s=$((s % 60))
  printf '%dh %dm %ds' "$h" "$m" "$s"
}

read_meta() {
  if [ -f "$CURRENT_META" ]; then
    # baris: PID<tab>MODE<tab>PORT<tab>START_TS<tab>CMD
    META_PID=$(sed -n '1p' "$CURRENT_META" 2>/dev/null)
    META_MODE=$(sed -n '2p' "$CURRENT_META" 2>/dev/null)
    META_PORT=$(sed -n '3p' "$CURRENT_META" 2>/dev/null)
    META_START=$(sed -n '4p' "$CURRENT_META" 2>/dev/null)
    META_CMD=$(sed -n '5p' "$CURRENT_META" 2>/dev/null)
  else
    META_PID=""; META_MODE=""; META_PORT=""; META_START=""; META_CMD=""
  fi
}

running_pid() {
  read_meta
  if [ -n "$META_PID" ] && is_alive "$META_PID"; then
    echo "$META_PID"
  elif [ -n "$META_PID" ]; then
    # PID lama — proses sudah mati, bersihkan meta
    printf '%b%s%b\n' "$YELLOW" "⚠ PID $META_PID tidak aktif, membersihkan meta basi..." "$NC" >&2
    rm -f "$CURRENT_META"
    echo ""
  fi
}

# --- Start -------------------------------------------------------------------
cmd_start() {
  local foreground=0
  if [ "${1:-}" = "-f" ] || [ "${1:-}" = "--foreground" ]; then
    foreground=1; shift
  fi

  local mode="${1:-dev}"; [ $# -gt 0 ] && shift

  local port="${YUIHIME_DAEMON_PORT:-3000}"
  local cwd="${YUIHIME_CWD:-$PROJECT_DIR}"

  # Parse --port/--cwd dari argumen (nilai dikonsumsi di sini), sisanya
  # diteruskan ke daemon. --port tetap ikut diteruskan agar server.ts tahu.
  local all=("$@")
  local extra=() i arg
  for ((i=0; i<${#all[@]}; i++)); do
    arg="${all[$i]}"
    case "$arg" in
      --port)
        [ $((i+1)) -lt ${#all[@]} ] && { port="${all[$((i+1))]}"; i=$((i+1)); }
        ;;
      --cwd)
        [ $((i+1)) -lt ${#all[@]} ] && { cwd="${all[$((i+1))]}"; i=$((i+1)); }
        ;;
      *)
        extra+=("$arg")
        ;;
    esac
  done

  local existing
  existing=$(running_pid)
  if [ -n "$existing" ]; then
    err "YuiHime sudah berjalan (PID $existing). Stop dulu: tools/yui-debug.sh stop"
    exit 1
  fi

  cd "$cwd" || { err "Direktori kerja tidak ditemukan: $cwd"; exit 1; }
  if [ ! -f "$PROJECT_DIR/.env" ]; then
    [ -f "$PROJECT_DIR/.env.example" ] && cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  fi

  local cmd
  if [ "$mode" = "prod" ]; then
    local sbin; sbin=$(server_bin)
    if [ -z "$sbin" ]; then
      err "server.cjs tidak ditemukan. Jalankan 'npm run build' dulu (atau periksa layout bundle)."
      exit 1
    fi
    cmd=(node "$sbin")
  else
    mode="dev"
    if [ ! -f "$PROJECT_DIR/server.ts" ] || [ ! -x "$PROJECT_DIR/node_modules/.bin/tsx" ]; then
      err "Mode dev butuh proyek sumber (server.ts + node_modules/.bin/tsx). Di bundle, gunakan mode prod."
      exit 1
    fi
    cmd=("$PROJECT_DIR/node_modules/.bin/tsx" "$PROJECT_DIR/server.ts")
  fi
  cmd+=("--port" "$port")
  [ ${#extra[@]} -gt 0 ] && cmd+=("${extra[@]}")

  # Rotasi session sebelumnya
  if [ -f "$CURRENT_LOG" ]; then
    local stamp; stamp=$(date +%Y%m%d-%H%M%S)
    mv "$CURRENT_LOG" "$SESSIONS_DIR/session-$stamp.log" 2>/dev/null || true
  fi

  local pid
  local banner
  banner=$(printf '%s\n' \
    "YuiHime debug session $(date '+%Y-%m-%d %H:%M:%S %Z')" \
    "Mode: $mode | Port: $port | Cmd: ${cmd[*]}" \
    "======================================================================")

  if [ "$foreground" = "1" ]; then
    echo "$banner" > "$CURRENT_LOG"
    log "Foreground mode — Ctrl+C untuk stop (log tetap terekam di $CURRENT_LOG)"
    "${cmd[@]}" 2>&1 | tee -a "$CURRENT_LOG"
    exit 0
  fi

  # setsid: daemon menjadi session leader (pgid == pid) sehingga seluruh
  # proses anak (tsx cli -> server -> esbuild) bisa di-signal sebagai satu group.
  setsid "${cmd[@]}" >> "$CURRENT_LOG" 2>&1 &
  pid=$!

  echo "$banner" >> "$CURRENT_LOG"

  printf '%s\n' "$pid"  > "$CURRENT_META"
  printf '%s\n' "$mode" >> "$CURRENT_META"
  printf '%s\n' "$port" >> "$CURRENT_META"
  printf '%s\n' "$(now_ts)" >> "$CURRENT_META"
  printf '%s\n' "${cmd[*]}" >> "$CURRENT_META"

  # Tunggu boot singkat lalu verifikasi
  log "Memulai YuiHime ($mode) di background, PID $pid ..."
  sleep "$STARTUP_WAIT"

  if ! is_alive "$pid"; then
    err "Proses mati dalam ${STARTUP_WAIT}s — cek log:"
    tail -n 25 "$CURRENT_LOG" | sed 's/^/    /'
    rm -f "$CURRENT_META"
    exit 1
  fi

  ok "YuiHime berjalan (PID $pid, port $port, mode $mode)"
  log "Log: $CURRENT_LOG"
  log "Jejak: tools/yui-debug.sh logs | status | show"
  echo
  tail -n 8 "$CURRENT_LOG" | sed 's/^/  │ /'
}

# --- Stop --------------------------------------------------------------------
cmd_stop() {
  local force="${1:-}"
  local pid
  pid=$(running_pid)
  if [ -z "$pid" ]; then
    warn "Tidak ada proses YuiHime yang sedang berjalan."
    rm -f "$CURRENT_META"
    return 0
  fi

  log "Menghentikan YuiHime (PID $pid) ..."

  # Target graceful shutdown = proses server asli, bukan wrapper tsx.
  # tsx cli mati instan saat menerima SIGINT dan bisa membunuh server
  # sebelum graceful shutdown selesai.
  local target
  target=$(real_server_pid "$pid")
  [ -z "$target" ] && target="$pid"

  if [ "$force" = "--force" ]; then
    signal_group "$pid" KILL
  else
    # Graceful dulu: SIGINT (ke server asli) -> menunggu -> SIGTERM -> menunggu -> SIGKILL
    kill -INT "$target" 2>/dev/null || true
    local waited=0
    while [ $waited -lt "$GRACEFUL_TIMEOUT" ] && is_alive "$target"; do
      sleep 1; waited=$((waited + 1))
    done
    if is_alive "$target"; then
      warn "Proses belum keluar setelah ${waited}s, kirim SIGTERM..."
      kill -TERM "$target" 2>/dev/null || true
      waited=0
      while [ $waited -lt 5 ] && is_alive "$target"; do
        sleep 1; waited=$((waited + 1))
      done
    fi
    if is_alive "$target"; then
      warn "Masih hidup — paksa SIGKILL (seluruh process group)."
      signal_group "$pid" KILL
    fi
  fi

  sleep 2
  if is_alive "$pid"; then
    if ! is_alive "$target"; then
      # Server sudah mati tetapi wrapper tsx masih nangkut — selesaikan dengan KILL group.
      warn "Server sudah berhenti, membersihkan sisa wrapper..."
      signal_group "$pid" KILL
      sleep 1
    fi
  fi
  if is_alive "$pid"; then
    err "Gagal menghentikan PID $pid."
    return 1
  fi

  ok "YuiHime berhenti."
  local tail_log="${SESSIONS_DIR}/session-$(date +%Y%m%d-%H%M%S).log"
  if [ -f "$CURRENT_LOG" ]; then
    mv "$CURRENT_LOG" "$tail_log"
    log "Session log diarsipkan: $tail_log"
  fi
  rm -f "$CURRENT_META"
}

# --- Status ------------------------------------------------------------------
cmd_status() {
  local pid
  pid=$(running_pid)
  if [ -z "$pid" ]; then
    warn "YuiHime TIDAK berjalan."
    if [ -f "$CURRENT_LOG" ]; then
      echo "  Log aktif: $CURRENT_LOG"
    else
      local latest; latest=$(ls -1t "$SESSIONS_DIR"/session-*.log 2>/dev/null | head -n 1)
      echo "  Session log terakhir: ${latest:-tidak ada}"
    fi
    exit 0
  fi

  read_meta
  local uptime="" mem=""
  uptime=$(fmt_uptime $(( $(now_ts) - ${META_START:-$(now_ts)} )))
  if [ -r "/proc/$pid/status" ]; then
    mem=$(awk '/VmRSS/{printf "%.1f MB", $2/1024}' "/proc/$pid/status")
  fi

  echo
  printf '  %-10s %s\n' "PID"    "$pid"
  printf '  %-10s %s\n' "Mode"   "${META_MODE:-?}"
  printf '  %-10s %s\n' "Port"   "${META_PORT:-$DEFAULT_PORT}"
  printf '  %-10s %s\n' "Uptime" "$uptime"
  [ -n "$mem" ] && printf '  %-10s %s\n' "Memori" "$mem"
  printf '  %-10s %s\n' "Cmd"    "${META_CMD:-?}"
  echo
  log "Log: $CURRENT_LOG"
  echo
  [ -f "$CURRENT_LOG" ] && tail -n 12 "$CURRENT_LOG" | sed 's/^/  │ /'
}

# --- Logs --------------------------------------------------------------------
cmd_logs() { tail -f "$CURRENT_LOG" 2>/dev/null || err "Belum ada session log. Jalankan 'start' dulu."; }

cmd_show() {
  local n="${1:-60}"
  [ ! -f "$CURRENT_LOG" ] && { err "Belum ada session log."; exit 1; }
  tail -n "$n" "$CURRENT_LOG"
}

cmd_list() {
  echo "Session logs di $SESSIONS_DIR :"
  ls -lht "$SESSIONS_DIR" 2>/dev/null | head -n 25 || echo "  (kosong)"
  if [ -f "$CURRENT_LOG" ]; then
    echo
    echo "Aktif sekarang: $CURRENT_LOG ($(wc -l < "$CURRENT_LOG") baris)"
  fi
}

cmd_clean() {
  local keep="${1:-10}"
  local count
  count=$(ls -1 "$SESSIONS_DIR"/session-*.log 2>/dev/null | wc -l)
  if [ "$count" -le "$keep" ]; then
    ok "Session log $count (≤ $keep), tidak ada yang dibersihkan."
    return 0
  fi
  ls -1t "$SESSIONS_DIR"/session-*.log 2>/dev/null | tail -n +$((keep + 1)) | while read -r f; do
    rm -f "$f" && log "hapus $f"
  done
  ok "Selesai — sisakan $keep session terbaru."
}

cmd_help() {
  sed -n '2,17p' "${BASH_SOURCE[0]}"
}

# --- Dispatch ----------------------------------------------------------------
case "${1:-help}" in
  start)    shift; cmd_start "$@";;
  stop)     shift; cmd_stop "${1:-}";;
  restart)  shift; cmd_stop; cmd_start "$@";;
  status)   cmd_status;;
  logs)     cmd_logs;;
  show)     shift; cmd_show "${1:-60}";;
  list)     cmd_list;;
  clean)    shift; cmd_clean "${1:-10}";;
  help|-h|--help) cmd_help;;
  *) err "Perintah tidak dikenal: '${1:-}'"; cmd_help; exit 1;;
esac
