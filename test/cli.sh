#!/usr/bin/env bash
# Smoke test for the calfeed CLI: full round trip against a throwaway server,
# plus one failure path. Complements the Hurl suites in contract/ and
# scenarios/, which cannot drive a CLI.
#
# Usage: ./test/cli.sh
# Requires: node 22.13+.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

PORT="${CLI_PORT:-8798}"
BASE="http://localhost:${PORT}"
ADMIN_TOKEN="cli-smoke-admin-token"
DB="$(mktemp -u /tmp/calfeed-cli-XXXXXX.db)"

cli() { node "$ROOT/src/cli.js" "$@"; }
json_field() { node -e 'console.log(JSON.parse(process.argv[1])[process.argv[2]])' "$1" "$2"; }
fail() {
  echo "FAIL: $1" >&2
  exit 1
}

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$DB" "$DB-shm" "$DB-wal"
}
trap cleanup EXIT

# Start the server with a throwaway database.
CALFEED_DB="$DB" \
CALFEED_ADMIN_TOKEN="$ADMIN_TOKEN" \
CALFEED_BASE_URL="$BASE" \
PORT="$PORT" \
  node "$ROOT/src/server.js" &
SERVER_PID=$!

# Wait until the server answers (max ~5s); fail hard if it died.
ready=""
for _ in $(seq 1 50); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "FATAL: calfeed exited before becoming ready (port in use?)" >&2
    exit 1
  fi
  if curl -s -o /dev/null "$BASE/cal/probe.ics"; then
    ready=1
    break
  fi
  sleep 0.1
done
[ -n "$ready" ] || {
  echo "FATAL: calfeed did not answer on $BASE within 5s" >&2
  exit 1
}

export CALFEED_URL="$BASE"

# ── Round trip ─────────────────────────────────────────────────────
CREATE_JSON="$(CALFEED_ADMIN_TOKEN="$ADMIN_TOKEN" cli create "CLI Smoke" --json)"
CAL_ID="$(json_field "$CREATE_JSON" id)"
FEED_URL="$(json_field "$CREATE_JSON" subscribe_url)"
export CALFEED_TOKEN="$(json_field "$CREATE_JSON" token)"

cli push --summary "Smoke event" --dtstart "2026-09-20T10:00:00Z" --uid smoke-1 >/dev/null
cli push --summary "Generated uid" --dtstart "2026-09-21T10:00:00Z" >/dev/null

cli feed "$FEED_URL" | grep -q "BEGIN:VCALENDAR" || fail "feed lacks BEGIN:VCALENDAR"
cli feed "$FEED_URL" | grep -q "SUMMARY:Smoke event" || fail "feed lacks the pushed event"

cli password "$CAL_ID" --set s3cret | grep -q "protected: true" || fail "setting a password"
if cli feed "$FEED_URL" >/dev/null 2>&1; then
  fail "protected feed served without a password"
fi
cli feed "$FEED_URL" --password s3cret | grep -q "BEGIN:VCALENDAR" || fail "feed with password"

ROTATE_JSON="$(cli rotate "$CAL_ID" --json)"
NEW_FEED="$(json_field "$ROTATE_JSON" subscribe_url)"
if cli feed "$FEED_URL" --password s3cret >/dev/null 2>&1; then
  fail "pre-rotation URL still alive"
fi
cli feed "$NEW_FEED" --password s3cret | grep -q "BEGIN:VCALENDAR" || fail "rotated feed"

cli password "$CAL_ID" --clear | grep -q "protected: false" || fail "clearing the password"
cli delete smoke-1 | grep -q "deleted: true" || fail "deleting an event"

# ── Failure path: wrong token → exit 1 + error on stderr ──────────
set +e
ERR="$(CALFEED_TOKEN=wrong-token cli push --summary X --dtstart 2026-09-20T10:00:00Z 2>&1 >/dev/null)"
STATUS=$?
set -e
[ "$STATUS" -eq 1 ] || fail "wrong token: expected exit 1, got $STATUS"
echo "$ERR" | grep -q "valid calendar token required" || fail "wrong token: error message missing"

echo "CLI smoke test: OK"
