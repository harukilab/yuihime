#!/usr/bin/env bash
set -euo pipefail

patterns=(
  'tsx server.ts'
  'yuihime'
  'vite'
  'node .*dist/server.cjs'
)

for pattern in "${patterns[@]}"; do
  pids=$(pgrep -af "$pattern" | grep -v "$$" | awk '{print $1}' || true)
  if [ -n "$pids" ]; then
    echo "$pattern"
    echo "$pids" | xargs -r kill -9 2>/dev/null || true
    sleep 0.2
  fi
done

remaining=$(pgrep -af 'yuihime|tsx server|vite|dist/server.cjs' | grep -v "$$" || true)
if [ -n "$remaining" ]; then
  echo "Force killing remaining processes:"
  echo "$remaining"
  echo "$remaining" | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true
fi

pgrep -af 'yuihime|tsx server|vite|dist/server.cjs' | grep -v "$$" || echo 'clean'
