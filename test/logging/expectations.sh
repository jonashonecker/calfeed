#!/usr/bin/env bash
# Log expectations — the third kind of test, next to contract/ and
# scenarios/. Logs aren't reachable over HTTP, so run.sh captures the
# server's stdout during the Hurl run and hands the file to this script.
#
# The expectations pin properties, not a format. A rebuild may log however
# it likes, as long as:
#   1. every handled request produces one line with method and status
#   2. feed requests appear redacted (the feed token is a secret)
#   3. no long feed token ever appears in the log
#   4. no calendar content (event summaries) ever appears in the log
#
# Usage: ./test/logging/expectations.sh <server-log-file>
set -euo pipefail

LOG="$1"
fail() {
  echo "LOG EXPECTATION FAILED: $1" >&2
  exit 1
}

# Deliberately loose: a line that carries a method and a status code counts,
# whatever the separators look like. The format stays free to change.
grep -qE '^(GET|POST|PUT|DELETE)\b.*\b[0-9]{3}\b' "$LOG" ||
  fail "no request lines with method and status found"

grep -q '/cal/<redacted>' "$LOG" ||
  fail "no redacted /cal/ line found (feed requests unlogged, or redaction gone)"

! grep -qE '/cal/[A-Za-z0-9_-]{30,}' "$LOG" ||
  fail "a feed token leaked into the log"

for summary in "A private meeting" "First event" "Team meeting"; do
  ! grep -qF "$summary" "$LOG" ||
    fail "calendar content leaked into the log: $summary"
done

echo "log expectations: OK"
