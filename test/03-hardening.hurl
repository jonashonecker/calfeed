# Blackbox contract test: input hardening and injection defence.
# Covers UID injection (BUG 1), invalid dates (BUG 2), malformed JSON (BUG 3),
# body size limit (BUG 4), and assorted auth/HTTP edge cases (GAP C).
# Variables: base, admin_token

# ── Set up a calendar to hammer ───────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Hardening"
}
HTTP 201
[Captures]
cal_id: jsonpath "$.id"
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

# ── BUG 1: a uid with CRLF must not inject iCal lines ─────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "x\r\nSUMMARY:injected\r\nBEGIN:VALARM",
  "summary": "Legit",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400
[Asserts]
jsonpath "$.error" exists

# ── BUG 1: other invalid uid characters are rejected too ─────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "bad uid with spaces",
  "summary": "Legit",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400

# ── BUG 1: a clean uid with allowed characters still works ───────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "ok-uid_1.2@host",
  "summary": "Fine",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 201

# ── BUG 1: the feed carries no injected SUMMARY/VALARM lines ──────
GET {{feed_url}}
HTTP 200
[Asserts]
body not contains "SUMMARY:injected"
body not contains "BEGIN:VALARM"
body contains "SUMMARY:Fine"
# exactly one event survived (the clean one)
body split "BEGIN:VEVENT" count == 2

# ── BUG 2: an invalid dtstart is rejected at write time ──────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "baddate",
  "summary": "Broken date",
  "dtstart": "not-a-date"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid dtstart"

# ── BUG 2: an invalid dtend is rejected too ──────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "baddtend",
  "summary": "Broken end",
  "dtstart": "2026-09-11T09:00:00Z",
  "dtend": "also-not-a-date"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid dtend"

# ── BUG 2: the feed still renders (no poisoned date got in) ──────
GET {{feed_url}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"

# ── BUG 3: malformed JSON yields 400, not 500 ────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
```
{kaputt
```
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid JSON"

# ── BUG 4: an oversized body is refused with 413 ─────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
file,fixtures/big.json;
HTTP 413
[Asserts]
jsonpath "$.error" == "payload too large"

# ── BUG 4: a normal-sized body still works ───────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "normal-size",
  "summary": "Under the limit",
  "dtstart": "2026-09-11T11:00:00Z"
}
HTTP 201

# ── GAP C: admin token cannot push events ────────────────────────
POST {{base}}/events
Authorization: Bearer {{admin_token}}
{
  "uid": "nope",
  "summary": "Wrong token",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 401

# ── GAP C: calendar token cannot create calendars ────────────────
POST {{base}}/calendars
Authorization: Bearer {{cal_token}}
{
  "name": "Wrong token"
}
HTTP 401

# ── GAP C: wrong HTTP method on a real path is not found ──────────
GET {{base}}/events
HTTP 404

DELETE {{base}}/calendars
Authorization: Bearer {{cal_token}}
HTTP 404

# ── GAP C: an empty Bearer is unauthorized ───────────────────────
POST {{base}}/events
Authorization: Bearer
{
  "uid": "empty-bearer",
  "summary": "No token value",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 401

# ── GAP C: rotating twice kills both older feed URLs ─────────────
POST {{base}}/calendars/{{cal_id}}/rotate-feed
Authorization: Bearer {{cal_token}}
HTTP 200
[Captures]
feed_v2: jsonpath "$.subscribe_url"

POST {{base}}/calendars/{{cal_id}}/rotate-feed
Authorization: Bearer {{cal_token}}
HTTP 200
[Captures]
feed_v3: jsonpath "$.subscribe_url"

# original URL dead
GET {{feed_url}}
HTTP 404

# second URL dead
GET {{feed_v2}}
HTTP 404

# newest URL alive
GET {{feed_v3}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"

# ── SECURITY: token hashing is transparent to the client ─────────
# The DB stores only SHA-256 hashes (verified out-of-band via sqlite3),
# but the client still receives a working plaintext token + feed URL.
# This blackbox test proves that round-trip: create → push with the
# returned token → read the feed over the returned URL.
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Hashing transparency"
}
HTTP 201
[Captures]
hx_token: jsonpath "$.token"
hx_feed_url: jsonpath "$.subscribe_url"
[Asserts]
# returned token is a real value, not a hash placeholder
jsonpath "$.token" exists
jsonpath "$.token" matches /^[A-Za-z0-9_-]+$/
jsonpath "$.subscribe_url" contains "/cal/"
jsonpath "$.subscribe_url" endsWith ".ics"

# the plaintext token works for pushing an event (hash lookup is transparent)
POST {{base}}/events
Authorization: Bearer {{hx_token}}
{
  "uid": "transparency-1",
  "summary": "Hashing works",
  "dtstart": "2026-09-12T09:00:00Z"
}
HTTP 201

# the plaintext feed URL resolves and returns the event (hash lookup transparent)
GET {{hx_feed_url}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"
body contains "SUMMARY:Hashing works"
