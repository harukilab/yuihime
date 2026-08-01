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
#    tools/yui-daemon.sh autoboot [dev|prod] Auto-detect platform & pasang boot hook
#                                            (systemd | Termux:Boot | UserLAnd | cron @reboot)
#    tools/yui-daemon.sh autoboot off        Nonaktifkan autoboot yang terpasang
#    tools/yui-daemon.sh help                Bantuan ini
#
#  Mode PM2 (OPSIONAL — bukan default):
#    tools/yui-daemon.sh --pm2 start         Jalankan YuiHime di PM2 daemon (via tools/yui-pm2.sh)
#    YUIHIME_PM2=1 tools/yui-daemon.sh start
#
#  Mode default: prod bila dist/server.cjs ada, selain itu dev.
#  Env override:
#    YUIHIME_SYSTEM_ROOT   Root data (default $HOME/.yuihime)
#    YUIHIME_DAEMON_PORT   Port health check & daemon (default 3000)
#    YUIHIME_CWD           Direktori kerja daemon (default root proyek)
#    YUIHIME_PM2           "1" = pakai PM2 (setara --pm2); default tanpa PM2
#
#  CLI juga menerima --port N dan --cwd DIR (diteruskan sebagai env ke
#  watchdog/debug/pm2 lalu ke daemon).
#
#  Catatan: PM2 hanya dipakai bila diaktifkan eksplisit (--pm2 / YUIHIME_PM2=1).
#  Saat PM2 aktif, daemon dijalankan di PM2 daemon (via tools/yui-pm2.sh);
#  PM2 menangani proses mati/crash, dan watchdog PM2-aware menangani deteksi
#  hang (probe /api/health → pm2 restart).
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEBUG_SCRIPT="$PROJECT_DIR/tools/yui-debug.sh"
WATCHDOG_SCRIPT="$PROJECT_DIR/tools/yui-watchdog.sh"
PM2_SCRIPT="$PROJECT_DIR/tools/yui-pm2.sh"

PM2_MODE="${YUIHIME_PM2:-0}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --pm2)   PM2_MODE=1; shift;;
    --no-pm2) PM2_MODE=0; shift;;
    --port|--cwd)
      if [ $# -lt 2 ]; then
        echo "$0: $1 butuh nilai" >&2
        exit 1
      fi
      if [ "$1" = "--port" ]; then
        export YUIHIME_DAEMON_PORT="$2"
      else
        export YUIHIME_CWD="$2"
      fi
      shift 2
      ;;
    *) ARGS+=("$1"); shift;;
  esac
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

# server_bin: path binary prod — dist/server.cjs (repo) atau server.cjs (bundle portabel)
server_bin() {
  [ -f "$PROJECT_DIR/dist/server.cjs" ] && { echo "$PROJECT_DIR/dist/server.cjs"; return; }
  [ -f "$PROJECT_DIR/server.cjs" ] && { echo "$PROJECT_DIR/server.cjs"; return; }
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
  if [ -n "$(server_bin)" ]; then echo "prod"; else echo "dev"; fi
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
  local mode="$1"; shift
  local extra=()
  [ $# -gt 0 ] && extra=("$@")
  if watchdog_running; then
    ok "Watchdog sudah aktif (supervisi daemon)"
  else
    local w=("$WATCHDOG_SCRIPT" start "$mode")
    # Mode PM2: watchdog jadi PM2-aware (probe health → pm2 restart saat hang).
    [ "$PM2_MODE" = "1" ] && w+=("--pm2")
    [ ${#extra[@]} -gt 0 ] && w+=("${extra[@]}")
    if "${w[@]}" >/dev/null 2>&1; then
      ok "Watchdog aktif (supervisi daemon)"
    else
      warn "Watchdog start gagal — cek $WATCHDOG_LOG"
    fi
  fi
}

start_via_watchdog() {
  local mode="$1"; shift
  local extra=()
  [ $# -gt 0 ] && extra=("$@")
  log "Start via watchdog + yui-debug.sh (mode $mode) ..."
  local w=("$WATCHDOG_SCRIPT" start "$mode")
  [ ${#extra[@]} -gt 0 ] && w+=("${extra[@]}")
  if "${w[@]}" >/dev/null 2>&1; then
    ok "Watchdog aktif — daemon di-start di background"
    return 0
  fi
  err "Watchdog gagal start — cek $WATCHDOG_LOG"
  return 1
}

# --- Start -------------------------------------------------------------------
cmd_start() {
  local mode="${1:-}"
  [ $# -gt 0 ] && shift
  local extra=()
  [ $# -gt 0 ] && extra=("$@")
  [ -z "$mode" ] && mode=$(default_mode)

  ok "Mengaktifkan daemon (mode $mode) ..."

  if daemon_healthy; then
    ok "Daemon sudah sehat (port $(daemon_port)) — memastikan supervisor."
    if pm2_enabled; then
      log "Mode PM2 aktif — PM2 supervisi proses; watchdog PM2-aware menangani deteksi hang."
      ensure_watchdog "$mode" "${extra[@]}"
      "$PM2_SCRIPT" status || true
    else
      ensure_watchdog "$mode" "${extra[@]}"
    fi
    return 0
  fi

  if pm2_enabled; then
    log "Mode PM2 (OPSIONAL) — start via tools/yui-pm2.sh ..."
    local pm=("$PM2_SCRIPT" start "$mode")
    [ ${#extra[@]} -gt 0 ] && pm+=("${extra[@]}")
    if "${pm[@]}"; then
      ok "Daemon via PM2 (port $(daemon_port))"
      # PM2 menangani proses mati; watchdog PM2-aware melengkapi deteksi hang.
      ensure_watchdog "$mode" "${extra[@]}"
    else
      warn "Start PM2 gagal — cek: tools/yui-pm2.sh logs"
    fi
    return 0
  fi

  start_via_watchdog "$mode" "${extra[@]}" || return 1
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
  [ $# -gt 0 ] && shift
  [ -z "$mode" ] && mode=$(default_mode)
  warn "Restart daemon (mode $mode) ..."
  cmd_stop
  echo
  cmd_start "$mode" "$@"
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

# --- Autoboot ----------------------------------------------------------------
# Deteksi platform lalu pasang boot hook otomatis.
detect_platform() {
  # Termux
  [ -n "${PREFIX:-}" ] && { echo "termux"; return; }
  # proot (UserLAnd) — ptrace aktif / env PROOT_*
  if env | grep -q '^PROOT_' 2>/dev/null \
     || awk '/^TracerPid:/{print $2}' /proc/self/status 2>/dev/null | grep -q '[1-9]'; then
    echo "proot"; return
  fi
  # Android (tanpa proot terdeteksi)
  [ -d /sdcard ] || [ -d /storage/emulated/0 ] && { echo "android"; return; }
  # systemd (PC/server asli)
  [ -d /run/systemd/system ] || command -v systemctl >/dev/null 2>&1 && { echo "systemd"; return; }
  echo "generic"
}

install_cron_reboot() {
  local boot="$1" flag="$2" mode="$3"
  if ! command -v crontab >/dev/null 2>&1; then
    warn "crontab tidak tersedia — pasang manual (lihat output autoboot)."
    return 1
  fi
  local line="@reboot /bin/bash $boot $flag $mode"
  if crontab -l 2>/dev/null | grep -qF "$boot"; then
    ok "Sudah ada di crontab (@reboot) — tidak diduplikasi."
  else
    ( crontab -l 2>/dev/null; echo "$line" ) | crontab - && ok "Ditambahkan ke crontab (@reboot)."
  fi
}

install_systemd_unit() {
  local boot="$1" flag="$2" mode="$3"
  local u="${USER:-$(id -un)}"
  local unit="/etc/systemd/system/yuihime-boot.service"
  local content="[Unit]
Description=YuiHime boot hook (daemon + watchdog)
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$u
Environment=HOME=$HOME
ExecStart=/bin/bash $boot $flag $mode

[Install]
WantedBy=multi-user.target
"
  if ! echo "$content" > "$unit" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && echo "$content" | sudo tee "$unit" >/dev/null 2>&1; then
      : # via sudo
    else
      err "Tidak bisa menulis $unit (butuh root)."
      echo "  Coba: sudo tools/yui-daemon.sh autoboot"
      return 1
    fi
  fi
  systemctl daemon-reload >/dev/null 2>&1 || { err "systemctl daemon-reload gagal."; return 1; }
  systemctl enable yuihime-boot.service >/dev/null 2>&1 && ok "Systemd unit aktif: $unit" \
    || warn "Unit ditulis, tapi 'systemctl enable' gagal — jalankan manual: sudo systemctl enable yuihime-boot.service"
}

remove_cron_reboot() {
  local boot="$1"
  if ! command -v crontab >/dev/null 2>&1; then
    warn "crontab tidak tersedia — tidak ada entri untuk dihapus."
    return 0
  fi
  if crontab -l 2>/dev/null | grep -qF "$boot"; then
    crontab -l 2>/dev/null | grep -vF "$boot" | crontab - && ok "Entri @reboot (crontab) dihapus."
  else
    log "Tidak ada entri @reboot (crontab) untuk YuiHime."
  fi
}

install_boot_launcher() {
  local bindir="$SYSTEM_ROOT/bin"
  mkdir -p "$bindir" || { err "Gagal membuat $bindir"; return 1; }
  cp "$PROJECT_DIR/tools/yui-boot.sh" "$bindir/yui-boot.sh" || { err "Gagal menyalin launcher"; return 1; }
  chmod +x "$bindir/yui-boot.sh"
  echo "$PROJECT_DIR" > "$bindir/project-root"
  ok "Launcher lokasi-independen: $bindir/yui-boot.sh" >&2
  echo "$bindir/yui-boot.sh"
}

cmd_autoboot_off() {
  local boot="$SYSTEM_ROOT/bin/yui-boot.sh"
  local platform; platform=$(detect_platform)

  log "=== Autoboot OFF (platform=$platform) ==="

  case "$platform" in
    termux)
      if rm -f "$HOME/.termux/boot/yuihime.sh" 2>/dev/null; then
        ok "Dihapus: $HOME/.termux/boot/yuihime.sh"
      else
        log "Tidak ada $HOME/.termux/boot/yuihime.sh."
      fi
      ;;
    systemd)
      if command -v systemctl >/dev/null 2>&1; then
        systemctl disable yuihime-boot.service >/dev/null 2>&1 && ok "Systemd unit di-disable." \
          || warn "systemctl disable gagal (butuh root?) — coba: sudo systemctl disable yuihime-boot.service"
        if rm -f /etc/systemd/system/yuihime-boot.service 2>/dev/null; then
          ok "Dihapus: /etc/systemd/system/yuihime-boot.service"
        elif command -v sudo >/dev/null 2>&1; then
          sudo rm -f /etc/systemd/system/yuihime-boot.service 2>/dev/null && ok "Dihapus (sudo): /etc/systemd/system/yuihime-boot.service" \
            || warn "Hapus manual: sudo rm /etc/systemd/system/yuihime-boot.service"
        else
          warn "Hapus manual: sudo rm /etc/systemd/system/yuihime-boot.service"
        fi
        systemctl daemon-reload >/dev/null 2>&1
      else
        warn "systemctl tidak tersedia."
      fi
      ;;
    proot|android|generic)
      remove_cron_reboot "$boot"
      log "Bila kamu memakai 'Startup command' di UserLAnd atau ~/.bashrc — nonaktifkan manual di sana."
      ;;
  esac

  rm -f "$SYSTEM_ROOT/bin/yui-boot.sh" "$SYSTEM_ROOT/bin/project-root"
  ok "Launcher & marker dihapus: $SYSTEM_ROOT/bin/"

  log "=== Autoboot OFF selesai ==="
}

cmd_autoboot() {
  local mode="${1:-}"
  [ $# -gt 0 ] && shift
  if [ "$mode" = "off" ]; then
    cmd_autoboot_off
    return $?
  fi
  [ -z "$mode" ] && mode=$(default_mode)
  local boot; boot=$(install_boot_launcher) || return 1
  local flag="--no-pm2"; [ "$PM2_MODE" = "1" ] && flag="--pm2"
  local platform; platform=$(detect_platform)

  if [ ! -f "$PROJECT_DIR/scripts/boot.sh" ]; then
    err "scripts/boot.sh tidak ditemukan — autoboot butuh boot hook ini."
    return 1
  fi

  log "=== Autoboot (platform=$platform mode=$mode $flag) ==="

  case "$platform" in
    termux)
      local bdir="$HOME/.termux/boot"
      mkdir -p "$bdir" || { err "Gagal membuat $bdir"; return 1; }
      cat > "$bdir/yuihime.sh" <<EOF
#!/usr/bin/env bash
# Auto-start YuiHime — dibuat oleh 'yuihime daemon autoboot'
bash "$boot" $flag $mode >/dev/null 2>&1
EOF
      chmod +x "$bdir/yuihime.sh"
      ok "Terpasang: $bdir/yuihime.sh"
      log "Catatan: instal aplikasi 'Termux:Boot' dari F-Droid agar file di ~/.termux/boot dijalankan saat boot."
      ;;
    proot|android)
      log "UserLAnd/proot/Android terdeteksi — tanpa systemd. Pilih salah satu:"
      echo ""
      echo "  A) App UserLAnd → buka pengaturan distro → 'Startup command' (aktifkan):"
      echo "       bash $boot $flag $mode"
      echo "       (path stabil ~/.yuihime/bin — tahan dipindah: launcher re-resolve lokasi)"
      echo ""
      echo "  B) File di jalankan saat login (mis. dari Termux:Boot / ~/.bashrc):"
      echo "       bash $boot $flag $mode"
      echo ""
      echo "  C) Manual setiap kali boot: jalankan perintah di atas."
      echo ""
      install_cron_reboot "$boot" "$flag" "$mode"
      ;;
    systemd)
      if [ "$PM2_MODE" = "1" ]; then
        pm2 save >/dev/null 2>&1 && ok "pm2 save OK (resurrect tersedia)" || warn "pm2 save gagal — cek: yuihime pm2 save"
      fi
      install_systemd_unit "$boot" "$flag" "$mode"
      ;;
    generic)
      log "Platform generik (tanpa systemd/cron terdeteksi)."
      install_cron_reboot "$boot" "$flag" "$mode"
      warn "Bila cron tidak dipakai, pasang manual, mis. di ~/.bashrc / init.d:"
      echo "  bash $boot $flag $mode"
      ;;
  esac

  log "=== Autoboot selesai ==="
}

# --- Dispatch ----------------------------------------------------------------
case "${1:-help}" in
  start)    shift; cmd_start "$@";;
  stop)     shift; cmd_stop;;
  restart)  shift; cmd_restart "$@";;
  status)   cmd_status;;
  logs)     shift; cmd_logs "${1:-40}";;
  rebuild)  cmd_rebuild;;
  autoboot) shift; cmd_autoboot "$@";;
  help|-h|--help) sed -n '2,31p' "${BASH_SOURCE[0]}";;
  *) err "Perintah tidak dikenal: '${1:-}'"; sed -n '2,31p' "${BASH_SOURCE[0]}"; exit 1;;
esac
