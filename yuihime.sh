#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    touch .env
  fi
  echo "YUIHIME_SYSTEM_ROOT=\$HOME/.yuihime" >> .env
fi

if ! grep -q "^YUIHIME_SYSTEM_ROOT=" .env 2>/dev/null; then
  echo "YUIHIME_SYSTEM_ROOT=\$HOME/.yuihime" >> .env
fi

mkdir -p "$HOME/.yuihime/data/" "$HOME/.yuihime/user_data/" "$HOME/.yuihime/agent/" "$HOME/.yuihime/addons/" "$HOME/.yuihime/models/"

if ! command -v node &> /dev/null; then
  echo -e "${RED}[ERR] Node.js tidak ditemukan. Jalankan ./install.sh terlebih dahulu.${NC}"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VER" | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo -e "${RED}[ERR] Node.js v${NODE_VER} terlalu usang. Minimal v20 diperlukan.${NC}"
  exit 1
fi

echo -e "${CYAN}[KERNEL] Bersihkan proses lama...${NC}"
bash "$SCRIPT_DIR/kill-yuihime.sh" >/dev/null 2>&1 || true

if [ ! -d node_modules ]; then
  echo -e "${YELLOW}[PKG] node_modules tidak ditemukan, menjalankan npm install...${NC}"
  npm install
else
  echo -e "${GREEN}[PKG] node_modules OK${NC}"
fi

echo -e "${CYAN}${BOLD}===============================================================${NC}"
echo -e "   ${BOLD}YuiHime Autonomous Cognitive Core${NC}"
echo -e "   Node: ${GREEN}v${NODE_VER}${NC} | Dir: ${YELLOW}${SCRIPT_DIR}${NC}"
echo -e "   Data: ${YELLOW}\$HOME/.yuihime${NC}"
echo -e "${CYAN}${BOLD}===============================================================${NC}\n"

export YUIHIME_SYSTEM_ROOT="$HOME/.yuihime"
exec npm run --prefix "$SCRIPT_DIR" dev
