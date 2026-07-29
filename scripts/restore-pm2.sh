#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECOSYSTEM="$PROJECT_DIR/ecosystem.config.js"

echo "=== Restoring YuiHime PM2 ==="
pm2 resurrect || true
pm2 start "$ECOSYSTEM" || pm2 restart "$ECOSYSTEM"
pm2 save
pm2 status
