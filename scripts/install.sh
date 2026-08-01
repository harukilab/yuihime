#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Installer — siapkan dependensi + pasang perintah `yuihime` global
#
#  Menangani dua skenario otomatis:
#    1) Clone baru     : node_modules belum ada → `npm install`
#                       (better-sqlite3 ikut dibangun native, perlu di ARM).
#    2) Sudah install  : node_modules ada → lewati; hanya pastikan binding
#                       better-sqlite3 terbangun (kalau tidak, `npm rebuild`).
#
#  Mode pemasangan perintah global (memakai tools/yuihime):
#    --global / -g     : symlink ke /usr/local/bin (butuh root; pakai sudo bila perlu)
#    --user   / -u     : symlink ke ~/.local/bin + inject PATH ke shell rc
#                        (~/.bashrc, ~/.profile, ~/.zshrc) — default bila bukan root
#    (default sebagai root : global; bukan root : user)
#
#  Mode pemasangan ala npm (copy penuh ke folder aman):
#    --copy / -c       : salin seluruh proyek ke PREFIX lalu npm install + build di sana
#                        global → /opt/yuihime    user → ~/.local/share/yuihime
#    --prefix DIR      : override PREFIX (default sesuai mode global/user)
#    --remove / -r     : hapus PREFIX + symlink (uninstall ala npm)
#
#  Usage:
#    bash scripts/install.sh [--global|--user] [--build] [--no-deps|--deps]
#    bash scripts/install.sh --copy [--prefix DIR] [--global|--user]
#    bash scripts/install.sh --remove [--prefix DIR]
#
#  Env:
#    YUIHIME_BIN_DIR   Target symlink saat --global (default /usr/local/bin)
#    YUIHIME_HOME      Override lokasi repo/bundle (default: auto-detect)
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${YUIHIME_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"
YUIHIME_CLI="$PROJECT_DIR/tools/yuihime"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { printf '%b%s%b\n' "$CYAN" "$*" "$NC"; }
ok()   { printf '%b✔ %s%b\n' "$GREEN" "$*" "$NC"; }
warn() { printf '%b⚠ %s%b\n' "$YELLOW" "$*" "$NC"; }
err()  { printf '%b✖ %s%b\n' "$RED" "$*" "$NC" >&2; }

MODE=""               # global | user (kosong = auto)
DO_BUILD=0
DEPS_MODE="auto"      # auto | install | skip
COPY_MODE=0
REMOVE_MODE=0
PREFIX=""

while [ $# -gt 0 ]; do
  case "$1" in
    --global|-g) MODE="global"; shift;;
    --user|-u)   MODE="user"; shift;;
    --build|-b)  DO_BUILD=1; shift;;
    --deps)      DEPS_MODE="install"; shift;;
    --no-deps)   DEPS_MODE="skip"; shift;;
    --copy|-c)   COPY_MODE=1; shift;;
    --remove|-r) REMOVE_MODE=1; shift;;
    --prefix)    PREFIX="${2:-}"; shift 2;;
    --help|-h)   sed -n '2,28p' "${BASH_SOURCE[0]}"; exit 0;;
    *) warn "Argumen diabaikan: '$1'"; shift;;
  esac
done

[ -x "$YUIHIME_CLI" ] || { err "tools/yuihime tidak ditemukan atau tidak executable: $YUIHIME_CLI"; exit 1; }

# --- 0) Mode pemasangan global ---
if [ -z "$MODE" ]; then
  if [ "$(id -u)" = "0" ]; then MODE="global"; else MODE="user"; fi
fi

default_prefix() {
  if [ "$MODE" = "global" ]; then echo "/opt/yuihime"; else echo "$HOME/.local/share/yuihime"; fi
}

link_global_bin() {
  local src="$1"
  local local_bindir="${YUIHIME_BIN_DIR:-/usr/local/bin}"
  if ! ln -sf "$src" "$local_bindir/yuihime" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo ln -sf "$src" "$local_bindir/yuihime" 2>/dev/null; then
      : # via sudo
    else
      warn "Tidak bisa menulis ke $local_bindir (butuh root)."
      warn "Coba: sudo bash scripts/install.sh --global   atau   bash scripts/install.sh --user"
      return 1
    fi
  fi
  ok "Terinstall: $local_bindir/yuihime -> $src"
  return 0
}

link_user_bin() {
  local src="$1"
  local local_bindir="$HOME/.local/bin"
  mkdir -p "$local_bindir" || { err "Gagal membuat $local_bindir"; return 1; }
  ln -sf "$src" "$local_bindir/yuihime" || { err "Gagal symlink ke $local_bindir/yuihime"; return 1; }
  ok "Terinstall: $local_bindir/yuihime -> $src"

  if ! case ":$PATH:" in *":$local_bindir:"*) true;; *) false;; esac; then
    injected=0
    for rc in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc"; do
      if [ -f "$rc" ] && ! grep -q "# >>> YuiHime >>>" "$rc" 2>/dev/null; then
        {
          echo ""
          echo "# >>> YuiHime >>>"
          echo "export PATH=\"$local_bindir:\$PATH\""
          echo "# <<< YuiHime <<<"
        } >> "$rc"
        ok "PATH ditambahkan ke $rc"
        injected=1
      fi
    done
    if [ "$injected" = "0" ]; then
      if [ ! -f "$HOME/.bashrc" ]; then
        {
          echo "# >>> YuiHime >>>"
          echo "export PATH=\"$local_bindir:\$PATH\""
          echo "# <<< YuiHime <<<"
        } > "$HOME/.bashrc"
        ok "Dibuat ~/.bashrc dengan PATH YuiHime."
        injected=1
      fi
    fi
    if [ "$injected" = "1" ]; then
      warn "Muat ulang shell agar PATH berlaku:  source ~/.bashrc   (atau buka terminal baru)"
    elif grep -q "# >>> YuiHime >>>" "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc" 2>/dev/null; then
      ok "Sudah terpasang di shell rc (idempotent) — reload shell bila belum."
    else
      warn "$local_bindir belum ada di PATH. Tambahkan manual:"
      echo "  export PATH=\"$local_bindir:\$PATH\""
    fi
  else
    ok "$local_bindir sudah ada di PATH — siap dipakai langsung."
  fi
  return 0
}

write_launcher_marker() {
  local dst="$1"
  mkdir -p "$HOME/.yuihime/bin" || { err "Gagal membuat ~/.yuihime/bin"; return 1; }
  echo "$dst" > "$HOME/.yuihime/bin/project-root"
  cp "$dst/tools/yui-boot.sh" "$HOME/.yuihime/bin/yui-boot.sh" 2>/dev/null && chmod +x "$HOME/.yuihime/bin/yui-boot.sh"
  ok "Marker & boot launcher: ~/.yuihime/bin/ (autoboot tetap jalan walau clone asli dihapus)"
}

cmd_copy_install() {
  local dst="${PREFIX:-$(default_prefix)}"
  local src="$PROJECT_DIR"
  [ -n "$PREFIX" ] || log "Prefix default: $dst (override dengan --prefix DIR)"

  if [ "$src" = "$dst" ]; then
    err "--copy tidak bisa menyalin proyek ke dirinya sendiri ($dst)."
    return 1
  fi
  case "$dst" in
    "$src"/*) err "--prefix berada di dalam proyek sumber ($src). Pilih folder lain."; return 1;;
  esac
  if [ -e "$dst" ] && [ ! -d "$dst" ]; then
    err "$dst bukan direktori — pindahkan/hapus dulu."
    return 1
  fi

  log "=== Copy install (ala npm) ke: $dst ==="
  if [ "$(id -u)" != "0" ] && ! mkdir -p "$(dirname "$dst")" 2>/dev/null; then
    warn "Butuh izin root untuk $dst — coba: sudo env \"PATH=\$PATH\" bash scripts/install.sh --copy --prefix $dst"
    return 1
  fi

  mkdir -p "$dst" || { err "Gagal membuat $dst"; return 1; }
  log "Menyalin proyek (tanpa node_modules/.git/dist) ..."
  if ! ( cd "$src" && tar --exclude=./.git --exclude=./node_modules --exclude=./dist --exclude=./.yuihime --exclude=./web/node_modules -cf - . ) | ( cd "$dst" && tar -xf - ); then
    err "Penyalinan GAGAL."
    return 1
  fi
  rm -rf "$dst/node_modules" "$dst/dist" 2>/dev/null || true

  log "npm install di $dst ..."
  ( cd "$dst" && npm install ) || { err "npm install GAGAL di $dst."; return 1; }
  ok "npm install selesai (better-sqlite3 native ikut terbangun)."

  log "npm run build (web + server) di $dst ..."
  ( cd "$dst" && npm run build ) || { err "npm run build GAGAL di $dst."; return 1; }
  ok "Build selesai (dist/server.cjs siap)."

  if [ "$MODE" = "global" ]; then
    link_global_bin "$dst/tools/yuihime" || return 1
  else
    link_user_bin "$dst/tools/yuihime" || return 1
  fi

  write_launcher_marker "$dst" || return 1

  log "=== Copy install selesai ==="
  log "Clone asli ($src) sudah TIDAK dipakai saat runtime — bisa dihapus bebas."
  log "Data user tetap di ~/.yuihime; update: bash scripts/install.sh --copy --prefix $dst"
  log "Pindah manual setelah ini? Re-run 'yuihime daemon autoboot' agar marker di-refresh."
}

cmd_remove() {
  local dst="${PREFIX:-$(default_prefix)}"
  local local_bindir
  if [ "$MODE" = "global" ]; then
    local_bindir="${YUIHIME_BIN_DIR:-/usr/local/bin}"
  else
    local_bindir="$HOME/.local/bin"
  fi

  log "=== Uninstall (ala npm) prefix: $dst ==="
  if [ -e "$dst" ]; then
    if rm -rf "$dst" 2>/dev/null; then
      ok "Dihapus: $dst"
    else
      chmod -R u+w "$dst" 2>/dev/null
      if rm -rf "$dst" 2>/dev/null; then
        ok "Dihapus: $dst"
      elif command -v sudo >/dev/null 2>&1 && sudo rm -rf "$dst" 2>/dev/null; then
        ok "Dihapus (sudo): $dst"
      else
        warn "Gagal menghapus $dst (butuh root) — coba: sudo rm -rf $dst"
      fi
    fi
  else
    log "Prefix tidak ada: $dst"
  fi

  if ! rm -f "$local_bindir/yuihime" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo rm -f "$local_bindir/yuihime" 2>/dev/null; then
      ok "Dihapus: $local_bindir/yuihime"
    else
      warn "Gagal menghapus $local_bindir/yuihime — coba: sudo rm -f $local_bindir/yuihime"
    fi
  else
    ok "Dihapus: $local_bindir/yuihime"
  fi

  if [ -f "$HOME/.yuihime/bin/project-root" ]; then
    local mark; mark=$(cat "$HOME/.yuihime/bin/project-root" 2>/dev/null)
    if [ "$mark" = "$dst" ]; then
      rm -f "$HOME/.yuihime/bin/project-root"
      ok "Marker ~/.yuihime/bin/project-root dihapus."
    fi
  fi
  log "=== Uninstall selesai ==="
}

log "=== YuiHime Installer (mode=$MODE) ==="
log "Proyek: $PROJECT_DIR"

if [ "$REMOVE_MODE" = "1" ]; then
  cmd_remove
  exit $?
fi

if [ "$COPY_MODE" = "1" ]; then
  cmd_copy_install
  exit $?
fi

# --- 1) Dependensi (2 skenario) ---
if [ "$DEPS_MODE" = "skip" ]; then
  log "Skenario --no-deps: dependensi dilewati."
elif [ "$DEPS_MODE" = "install" ]; then
  log "Skenario --deps: npm install paksa ..."
  ( cd "$PROJECT_DIR" && npm install ) || { err "npm install GAGAL."; exit 1; }
  ok "npm install selesai."
elif [ ! -d "$PROJECT_DIR/node_modules" ]; then
  log "Skenario 1 — clone baru: node_modules belum ada, menjalankan npm install ..."
  ( cd "$PROJECT_DIR" && npm install ) || { err "npm install GAGAL."; exit 1; }
  ok "npm install selesai (native build better-sqlite3 ikut)."
else
  log "Skenario 2 — node_modules sudah ada, lewati npm install."
  if ls "$PROJECT_DIR/node_modules/better-sqlite3/build/Release/"*.node >/dev/null 2>&1; then
    ok "Binding better-sqlite3 sudah terbangun."
  else
    log "Binding better-sqlite3 belum terbangun — npm rebuild better-sqlite3 ..."
    ( cd "$PROJECT_DIR" && npm rebuild better-sqlite3 ) \
      || { warn "npm rebuild better-sqlite3 GAGAL — coba: cd $PROJECT_DIR && npm install"; }
    ok "npm rebuild better-sqlite3 selesai."
  fi
fi

# --- 2) Build produksi (opsional) ---
if [ "$DO_BUILD" = "1" ]; then
  if [ ! -f "$PROJECT_DIR/package.json" ]; then
    warn "--build hanya untuk repo sumber; bundle tidak memuat package.json."
  else
    log "npm run build (web + server) ..."
    ( cd "$PROJECT_DIR" && npm run build ) || { err "npm run build GAGAL."; exit 1; }
    ok "Build selesai (dist/server.cjs siap)."
  fi
else
  log "Lewati build (pakai --build bila ingin dist/server.cjs diperbarui)."
fi

# --- 3) Pasang perintah global ---
if [ "$MODE" = "global" ]; then
  local_bindir="${YUIHIME_BIN_DIR:-/usr/local/bin}"
  if ! ln -sf "$YUIHIME_CLI" "$local_bindir/yuihime" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo ln -sf "$YUIHIME_CLI" "$local_bindir/yuihime" 2>/dev/null; then
      : # via sudo
    else
      warn "Tidak bisa menulis ke $local_bindir (butuh root)."
      warn "Coba: sudo bash scripts/install.sh --global   atau   bash scripts/install.sh --user"
      exit 1
    fi
  fi
  ok "Terinstall: $local_bindir/yuihime -> $YUIHIME_CLI"
  "$local_bindir/yuihime" version
else
  local_bindir="$HOME/.local/bin"
  mkdir -p "$local_bindir" || { err "Gagal membuat $local_bindir"; exit 1; }
  ln -sf "$YUIHIME_CLI" "$local_bindir/yuihime" || { err "Gagal symlink ke $local_bindir/yuihime"; exit 1; }
  ok "Terinstall: $local_bindir/yuihime -> $YUIHIME_CLI"

  if case ":$PATH:" in *":$local_bindir:"*) true;; *) false;; esac; then
    ok "$local_bindir sudah ada di PATH — siap dipakai langsung."
  else
    injected=0
    for rc in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc"; do
      if [ -f "$rc" ] && ! grep -q "# >>> YuiHime >>>" "$rc" 2>/dev/null; then
        {
          echo ""
          echo "# >>> YuiHime >>>"
          echo "export PATH=\"$local_bindir:\$PATH\""
          echo "# <<< YuiHime <<<"
        } >> "$rc"
        ok "PATH ditambahkan ke $rc"
        injected=1
      fi
    done
    if [ "$injected" = "0" ]; then
      if [ ! -f "$HOME/.bashrc" ]; then
        {
          echo "# >>> YuiHime >>>"
          echo "export PATH=\"$local_bindir:\$PATH\""
          echo "# <<< YuiHime <<<"
        } > "$HOME/.bashrc"
        ok "Dibuat ~/.bashrc dengan PATH YuiHime."
        injected=1
      fi
    fi
    if [ "$injected" = "1" ]; then
      warn "Muat ulang shell agar PATH berlaku:  source ~/.bashrc   (atau buka terminal baru)"
    elif grep -q "# >>> YuiHime >>>" "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc" 2>/dev/null; then
      ok "Sudah terpasang di shell rc (idempotent) — reload shell bila belum."
    else
      warn "$local_bindir belum ada di PATH. Tambahkan manual:"
      echo "  export PATH=\"$local_bindir:\$PATH\""
    fi
  fi
  "$local_bindir/yuihime" version
fi

log "=== Installer selesai ==="
log "Coba: yuihime daemon start | yuihime status | yuihime rebuild | yuihime help"
