#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$HOME/.yuihime/data/logs"
ECOSYSTEM="$PROJECT_DIR/ecosystem.config.cjs"

echo "=== YuiHime PM2 Setup ==="

if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
else
  echo "PM2 already installed: $(pm2 --version)"
fi

mkdir -p "$LOG_DIR"

echo "Building project..."
cd "$PROJECT_DIR"
npm run build

echo "Starting/Restarting YuiHime..."
pm2 start "$ECOSYSTEM" || pm2 restart "$ECOSYSTEM"
pm2 save

echo ""
echo "Done. Status:"
pm2 status
