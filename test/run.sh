#!/usr/bin/env bash
# Run the language-independent blackbox test suite against a fresh server.
# Starts calfeed, waits until it answers, runs the .hurl contract tests, cleans up.
#
# Usage: ./test/run.sh
# Requires: hurl (https://hurl.dev), node 22.13+.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

PORT="${PORT:-8799}"
BASE="http://localhost:${PORT}"
ADMIN_TOKEN="blackbox-admin-token"
DB="$(mktemp -u /tmp/calfeed-test-XXXXXX.db)"
SERVER_LOG="$(mktemp /tmp/calfeed-test-XXXXXX.log)"

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$DB" "$SERVER_LOG"
}
trap cleanup EXIT

# Start the server with a throwaway database. Its output goes to a file:
# the log expectations in logging/expectations.sh check it afterwards.
CALFEED_DB="$DB" \
CALFEED_ADMIN_TOKEN="$ADMIN_TOKEN" \
CALFEED_BASE_URL="$BASE" \
PORT="$PORT" \
  node "$ROOT/src/server.js" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Wait until the server answers (max ~5s). Also check our own process is
# still alive: if it died (for example EADDRINUSE from a stale server on
# the port), curl could reach that foreign instance and the suite would
# green-light untested code.
ready=""
for _ in $(seq 1 50); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "FATAL: calfeed exited before becoming ready (port in use?)" >&2
    exit 1
  fi
  if curl -s -o /dev/null "$BASE/cal/health-probe.ics"; then ready=1; break; fi
  sleep 0.1
done
if [ -z "$ready" ]; then
  echo "FATAL: calfeed did not answer on $BASE within 5s" >&2
  exit 1
fi

# Run every .hurl file: contract tests first, then scenarios.
# --file-root lets tests in subfolders reference fixtures/ by one path.
hurl --test \
  --file-root "$HERE" \
  --variable "base=$BASE" \
  --variable "admin_token=$ADMIN_TOKEN" \
  "$HERE"/contract/*.hurl "$HERE"/scenarios/*.hurl

# Third kind of test: the log expectations, checked on the captured output.
"$HERE"/logging/expectations.sh "$SERVER_LOG"
