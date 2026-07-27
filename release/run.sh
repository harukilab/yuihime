#!/bin/bash
# Yuihime Standalone Launcher (Linux/macOS)
# Usage: ./run.sh [--no-ui] [--port 3000]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure data directory exists
mkdir -p data

# Run server
echo "Starting Yuihime..."
exec node server.cjs "$@"
