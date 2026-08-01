#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Boot Launcher — lokasi-independen
#
#  Hook yang terpasang oleh 'yuihime daemon autoboot' menunjuk ke SALINAN
#  stabil dari script ini di ~/.yuihime/bin/yui-boot.sh (bukan ke path
#  absolut proyek), sehingga autostart tetap bekerja walau folder hasil clone
#  dipindah / disimpan di lokasi lain.
#
#  Urutan resolusi lokasi proyek:
#    1. Perintah global 'yuihime' di PATH → real path (readlink -f)
#    2. Marker ~/.yuihime/bin/project-root (ditulis oleh autoboot/install)
#    3. Scan folder umum (santunan bila keduanya gagal)
#
#  Usage:
#    yui-boot.sh [--pm2|--no-pm2] [dev|prod]
#    yui-boot.sh --resolve      Tampilkan folder proyek hasil resolusi lalu exit
# ==============================================================================
set -uo pipefail

resolve_project_dir() {
  local cmd bindir root p cand

  # 1) Perintah global 'yuihime' (symlink /usr/local/bin → tools/yuihime)
  if cmd=$(command -v yuihime 2>/dev/null); then
    bindir=$(dirname "$(readlink -f "$cmd" 2>/dev/null)" 2>/dev/null)
    if [ -n "$bindir" ] && [ -f "$bindir/yui-daemon.sh" ]; then
      echo "$(cd "$bindir/.." && pwd)"
      return 0
    fi
  fi

  # 2) Marker yang ditulis autoboot / install.sh
  root="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
  if [ -f "$root/bin/project-root" ]; then
    p=$(cat "$root/bin/project-root" 2>/dev/null)
    if [ -n "$p" ] && [ -f "$p/scripts/boot.sh" ]; then
      echo "$p"
      return 0
    fi
  fi

  # 3) Scan folder umum
  for cand in "$HOME/YuiHime" "$HOME/yuiHime" "$HOME/Projects/YuiHime" "$HOME/projects/YuiHime" /opt/YuiHime; do
    if [ -f "$cand/scripts/boot.sh" ]; then
      echo "$cand"
      return 0
    fi
  done

  return 1
}

PROJECT_DIR=$(resolve_project_dir) || {
  echo "YuiHime boot launcher: folder proyek tidak ditemukan." >&2
  echo "  Re-install: install.sh --global  atau  yuihime daemon autoboot" >&2
  exit 1
}

if [ "${1:-}" = "--resolve" ]; then
  echo "$PROJECT_DIR"
  exit 0
fi

exec bash "$PROJECT_DIR/scripts/boot.sh" "$@"
