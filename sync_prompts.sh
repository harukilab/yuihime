#!/usr/bin/env bash
# sync_prompts.sh — Sync YuiHime system-prompt markdown files across locations.
# No re-discovery needed: source-of-truth locations are fixed below.
# Just run it after you change any prompt file.
#
# Usage:
#   ./sync_prompts.sh          # sync (only newer sources copied via cp -u)
#   ./sync_prompts.sh --force  # overwrite regardless of mtime
#   ./sync_prompts.sh --dry    # show what would change, no writes
#
# Source of truth:
#   - repo/src/share/prompts/{system_prompt,character,lore}.md  (newest/most-complete)
#   - repo/.yuihime/agent/{IDENTITY,SOUL,MEMORY,USER,TOOLS,HEARTBEAT}.md
# Targets:
#   - repo/.yuihime/agent/
#   - /home/userland/.yuihime/agent/   (runtime)

set -euo pipefail

# ---- Resolve repo root (parent of this script) -----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$SCRIPT_DIR"
HOME_AGENT="/home/userland/.yuihime/agent"
SRC_PROMPTS="$REPO/src/share/prompts"
SRC_AGENT="$REPO/.yuihime/agent"

FORCE=0
DRY=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry)   DRY=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
  esac
done

CP_FLAGS="-u -v"
if [ "$FORCE" -eq 1 ]; then CP_FLAGS="-v"; fi
if [ "$DRY" -eq 1 ]; then CP_FLAGS=""; fi

# wrapper: real copy, or just preview in dry mode
do_cp() {
  if [ "$DRY" -eq 1 ]; then
    echo "  ~ would copy: $1 -> $2"
  else
    cp $CP_FLAGS "$1" "$2"
  fi
}

echo "==> Repo : $REPO"
echo "==> Home : $HOME_AGENT"
echo

# ---- 1) Prompt files: src/share/prompts -> both agent dirs ----------------
PROMPT_FILES=(system_prompt.md character.md lore.md)
echo "==> [1/2] Prompt files (src/share/prompts -> agent dirs)"
for f in "${PROMPT_FILES[@]}"; do
  src="$SRC_PROMPTS/$f"
  [ -f "$src" ] || { echo "  ! skip (missing) $src"; continue; }
  do_cp "$src" "$SRC_AGENT/$f"
  do_cp "$src" "$HOME_AGENT/$f"
done
echo

# ---- 2) Other agent files: repo agent -> home agent -----------------------
AGENT_FILES=(IDENTITY.md SOUL.md MEMORY.md USER.md TOOLS.md HEARTBEAT.md)
echo "==> [2/2] Agent persona files (repo agent -> home agent)"
for f in "${AGENT_FILES[@]}"; do
  src="$SRC_AGENT/$f"
  [ -f "$src" ] || { echo "  ! skip (missing) $src"; continue; }
  do_cp "$src" "$HOME_AGENT/$f"
done
echo

# ---- 3) Verify tri-location parity ----------------------------------------
echo "==> Verify parity"
FAIL=0
ALL=(system_prompt.md character.md lore.md "${AGENT_FILES[@]}")
for f in "${ALL[@]}"; do
  # collect only the locations that actually hold this file
  copies=()
  for d in "$SRC_PROMPTS/$f" "$SRC_AGENT/$f" "$HOME_AGENT/$f"; do
    [ -f "$d" ] && copies+=("$d")
  done
  if [ "${#copies[@]}" -lt 1 ]; then echo "  ? $f: no copy found"; continue; fi
  ref="${copies[0]}"
  ok=1
  for d in "${copies[@]:1}"; do
    if ! diff -q "$ref" "$d" >/dev/null 2>&1; then ok=0; break; fi
  done
  if [ "$ok" -eq 1 ]; then echo "  OK   $f"; else echo "  BEDA $f"; FAIL=1; fi
done

echo
if [ "$FAIL" -eq 0 ]; then echo "==> DONE: all locations in sync."; else echo "==> WARNING: some files differ."; fi
