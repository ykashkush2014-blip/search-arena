#!/usr/bin/env bash
# CONQUEST — one-command launcher (static game + online WebSocket server).
set -e
cd "$(dirname "$0")"
PORT="${PORT:-5173}"
echo "⚔️  CONQUEST on http://localhost:${PORT}  (online: ws://localhost:${PORT}/ws)"
exec node server.js "$PORT"
