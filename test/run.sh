#!/usr/bin/env bash
# Run the language-independent blackbox test suite against a fresh server.
# Starts calfeed, waits until it answers, runs the .hurl contract tests, cleans up.
#
# Usage: ./test/run.sh
# Requires: hurl (https://hurl.dev), node 22+.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

PORT="${PORT:-8799}"
BASE="http://localhost:${PORT}"
ADMIN_TOKEN="blackbox-admin-token"
DB="$(mktemp -u /tmp/calfeed-test-XXXXXX.db)"

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$DB"
}
trap cleanup EXIT

# Start the server with a throwaway database.
CALFEED_DB="$DB" \
CALFEED_ADMIN_TOKEN="$ADMIN_TOKEN" \
CALFEED_BASE_URL="$BASE" \
PORT="$PORT" \
  node "$ROOT/src/server.js" &
SERVER_PID=$!

# Wait until the server answers (max ~5s).
for _ in $(seq 1 50); do
  if curl -s -o /dev/null "$BASE/cal/health-probe.ics"; then break; fi
  sleep 0.1
done

# Run every .hurl file in order.
hurl --test \
  --variable "base=$BASE" \
  --variable "admin_token=$ADMIN_TOKEN" \
  "$HERE"/*.hurl
